import { createHash, randomBytes } from "node:crypto";
import type {
  Credentials,
  DiscoveredDevice,
  MqttCredentials,
} from "./types.mjs";

// Public mobile-app identifiers documented by jeppesens/eufy-clean.
const LOGIN = [
  {
    path: "/v1/user/v2/email/login",
    client_id: "eufy-app",
    client_secret: "8FHf22gaTKu7MZXqz5zytw",
    category: "Health",
  },
  {
    path: "/v1/user/email/login",
    client_id: "eufyhome-app",
    client_secret: "GQCpr9dSp3uQpsOMgJ4xQ",
    category: "Home",
  },
];
// Dynamic JSON is contained at the cloud boundary; no response or credentials are logged.
type CloudJSON = Record<string, any>;
export class EufyCloud {
  readonly openudid = randomBytes(16).toString("hex");
  private token = "";
  private centerToken = "";
  private gtoken = "";
  mqtt?: MqttCredentials;
  constructor(private readonly credentials: Credentials) {}
  private async request(
    url: string,
    method: string,
    headers: Record<string, string>,
    body?: unknown,
  ): Promise<CloudJSON> {
    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "EufyHome-Android-3.1.3-753",
          openudid: this.openudid,
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok)
        throw new Error(`Eufy request failed (${response.status})`);
      return (await response.json()) as CloudJSON;
    } catch (error) {
      throw new Error(
        error instanceof Error && /^Eufy request/.test(error.message)
          ? error.message
          : "Cannot reach Eufy. Check your internet connection and try again.",
      );
    }
  }
  private headers(): Record<string, string> {
    return {
      "app-name": "eufy_home",
      "os-version": "Android",
      "model-type": "PHONE",
      "x-auth-token": this.centerToken,
      gtoken: this.gtoken,
    };
  }
  async login(): Promise<void> {
    for (const config of LOGIN) {
      try {
        const session = await this.request(
          `https://home-api.eufylife.com${config.path}`,
          "POST",
          { category: config.category, clientType: "1" },
          {
            email: this.credentials.username,
            password: this.credentials.password,
            client_id: config.client_id,
            client_secret: config.client_secret,
          },
        );
        if (!session.access_token) continue;
        this.token = session.access_token;
        const user = await this.request(
          "https://api.eufylife.com/v1/user/user_center_info",
          "GET",
          { category: "Home", token: this.token, clienttype: "2" },
        );
        if (!user.user_center_id || !user.user_center_token) continue;
        this.centerToken = user.user_center_token;
        this.gtoken = createHash("md5")
          .update(user.user_center_id)
          .digest("hex");
        const response = await this.request(
          "https://aiot-clean-api-pr.eufylife.com/app/devicemanage/get_user_mqtt_info",
          "POST",
          this.headers(),
        );
        const c = response.data;
        if (
          c?.certificate_pem &&
          c.private_key &&
          c.endpoint_addr &&
          c.user_id
        ) {
          this.mqtt = c as MqttCredentials;
          return;
        }
      } catch {
        /* A valid login may lack MQTT access; try the other app identity. */
      }
    }
    throw new Error(
      "Eufy could not authorize MQTT access. Check your Eufy account email and password.",
    );
  }
  async devices(): Promise<DiscoveredDevice[]> {
    if (!this.mqtt) await this.login();
    const result = await this.request(
      "https://aiot-clean-api-pr.eufylife.com/app/devicerelation/get_device_list",
      "POST",
      this.headers(),
      { attribute: 3 },
    );
    let metadata: CloudJSON[] = [];
    try {
      const r = await this.request(
        "https://api.eufylife.com/v1/device/v2",
        "GET",
        { category: "Home", token: this.token, clienttype: "2" },
      );
      metadata = (r.data || r).devices || [];
    } catch {}
    return ((result.data || result).devices || [])
      .map((entry: CloudJSON) => {
        const d = entry.device || entry,
          m = metadata.find((v) => v.id === d.device_sn) || {};
        return {
          id: d.device_sn,
          name:
            m.alias_name ||
            d.alias_name ||
            d.device_name ||
            m.name ||
            "Eufy vacuum",
          model: String(
            d.device_model || m.product?.product_code || m.device_model || "",
          ).slice(0, 5),
          dps: d.dps || {},
          ownerId: d.member?.admin_user_id || entry.member?.admin_user_id,
        };
      })
      .filter((d: DiscoveredDevice) => d.id && d.model);
  }
}
