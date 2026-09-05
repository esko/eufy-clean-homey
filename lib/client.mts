import mqtt, { type MqttClient } from "mqtt";
import { EventEmitter } from "node:events";
import { EufyCloud } from "./cloud.mjs";
import { decode, parseMap, command } from "./protocol.mjs";
import type {
  Credentials,
  DiscoveredDevice,
  MqttCredentials,
  VacuumState,
  FloorMap,
  Action,
  ActionArgs,
  VacuumSnapshot,
} from "./types.mjs";

export class VacuumClient extends EventEmitter {
  state: VacuumState = {
    battery: null,
    activity: "unknown",
    charging: false,
    updatedAt: null,
    rooms: [],
    scenes: [],
    warnings: [],
  };
  map: FloorMap | null = null;
  connected = false;
  private reportedSuction: number | null = null;
  private mqtt?: MqttClient;
  private cloud?: EufyCloud;
  private credentials?: MqttCredentials;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private busy = false;
  private failures = 0;
  constructor(
    readonly device: DiscoveredDevice,
    private readonly login: Credentials,
  ) {
    super();
  }
  async connect(): Promise<void> {
    this.stopped = false;
    try {
      await this.open();
      this.failures = 0;
    } catch (error) {
      this.scheduleReconnect();
      throw error;
    }
  }
  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    this.connected = false;
    this.emit("connection", false);
    const delay = Math.min(300000, 15000 * 2 ** Math.min(this.failures++, 5));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect().catch(() => {});
    }, delay);
  }
  private async open(): Promise<void> {
    this.mqtt?.removeAllListeners();
    this.mqtt?.end(true);
    clearTimeout(this.refreshTimer);
    const cloud = new EufyCloud(this.login);
    await cloud.login();
    if (this.stopped) return;
    const devices = await cloud.devices();
    const device = devices.find((d) => d.id === this.device.id);
    if (!device)
      throw new Error(
        "This vacuum is no longer in the Eufy account. Repair the device to reconnect.",
      );
    this.cloud = cloud;
    this.credentials = { ...cloud.mqtt! };
    if (device.ownerId) this.credentials.user_id = device.ownerId;
    this.ingest(device.dps);
    const c = this.credentials;
    const endpoint = c.endpoint_addr.replace(/^mqtts?:\/\//, "");
    if (!/^[a-zA-Z0-9.-]+(?::\d+)?$/.test(endpoint))
      throw new Error("Invalid MQTT endpoint returned by Eufy");
    const client = mqtt.connect(`mqtts://${endpoint}`, {
      port: 8883,
      clientId: `android-${c.app_name}-eufy_android_${cloud.openudid}_${c.user_id}-${Date.now()}`,
      username: c.thing_name,
      cert: Buffer.from(c.certificate_pem),
      key: Buffer.from(c.private_key),
      rejectUnauthorized: true,
      connectTimeout: 20000,
      reconnectPeriod: 0,
    });
    this.mqtt = client;
    const res = `cmd/eufy_home/${this.device.model}/${this.device.id}/res`;
    const biz = `biz/eufy_home/${this.device.model}/${this.device.id}/res`;
    client.on("error", () => {});
    client.on("close", () => {
      this.connected = false;
      this.scheduleReconnect();
    });
    client.on("message", (topic, data) => {
      if (data.length > 8 * 1024 * 1024) return;
      try {
        const message = JSON.parse(data.toString());
        const payload =
          typeof message.payload === "string"
            ? JSON.parse(message.payload)
            : message.payload;
        if (topic === biz) this.ingestMap(payload?.data);
        else if (payload?.data && typeof payload.data === "object")
          this.ingest(payload.data);
      } catch {
        this.emit("diagnostic", "Ignored malformed MQTT packet");
      }
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        client.end(true);
        reject(new Error("Eufy MQTT connection timed out"));
      }, 25000);
      const cleanup = () => {
        clearTimeout(timer);
        client.off("error", fail);
      };
      const fail = () => {
        cleanup();
        client.end(true);
        reject(new Error("Eufy MQTT connection failed"));
      };
      client.once("error", fail);
      client.once("connect", () =>
        client.subscribe(
          // T2280 uses the novel protocol. Its broker rejects the legacy
          // smart/mb/in channel even when status and map subscriptions succeed.
          [res, biz],
          { qos: 1 },
          (error) => {
            cleanup();
            if (error) {
              client.end(true);
              reject(new Error("Eufy MQTT subscription failed"));
              return;
            }
            this.connected = true;
            this.emit("connection", true);
            this.emit("update");
            resolve();
          },
        ),
      );
    });
    // Refresh credentials well before the next day; disconnect failures use backoff.
    this.refreshTimer = setTimeout(
      () => void this.connect().catch(() => {}),
      12 * 60 * 60 * 1000,
    );
  }
  ingest(dps: Record<string, unknown>): void {
    let changed = false;
    const s = this.state;
    for (const [key, value] of Object.entries(dps)) {
      try {
        if (
          key === "163" &&
          typeof value === "number" &&
          value >= 0 &&
          value <= 100
        ) {
          s.battery = value;
          changed = true;
        }
        if (
          key === "158" &&
          typeof value === "number" &&
          Number.isInteger(value) &&
          value >= 0 &&
          value <= 4
        ) {
          this.reportedSuction = value;
          s.parameters = {
            ...(s.parameters || { water: null, mode: null, intensity: null }),
            suction: value,
          };
          changed = true;
        }
        if (typeof value !== "string" || !value) continue;
        if (key === "153") {
          const w = decode("WorkStatus", value),
            code = w.state || 0;
          s.activity =
            [
              "idle",
              "sleeping",
              "error",
              "docked",
              "mapping",
              "cleaning",
              "remote",
              "returning",
              "cruising",
            ][code] || "unknown";
          if ((code === 0 || code === 5) && w.cleaning?.state === 1)
            s.activity = "paused";
          s.charging =
            code === 3 && !!w.charging && (w.charging.state ?? 0) === 0;
          const station = w.station;
          if (station?.washingDryingSystem) {
            const v = station.washingDryingSystem.state || 0;
            if (v === 0) s.activity = "washing";
            if (v === 1) s.activity = "drying";
          }
          changed = true;
        }
        if (key === "154") {
          const p = decode("CleanParamResponse", value),
            param = p.runningCleanParam || p.cleanParam;
          if (param) {
            s.parameters = {
              suction:
                this.reportedSuction ??
                (param.fan ? param.fan.suction || 0 : null),
              water: param.mopMode ? param.mopMode.level || 0 : null,
              mode: param.cleanType ? param.cleanType.value || 0 : null,
              intensity: param.cleanExtent
                ? param.cleanExtent.value || 0
                : null,
            };
            changed = true;
          }
        }
        if (key === "165") {
          const p = decode("proto.cloud.stream.RoomParams", value);
          if (p.rooms?.length) {
            s.rooms = p.rooms.map((r: { id: number; name: string }) => ({
              id: r.id,
              name: r.name || `Room ${r.id}`,
            }));
            s.mapId = p.mapId || s.mapId;
            changed = true;
          }
        }
        if (key === "167") {
          s.statistics = decode("CleanStatistics", value);
          changed = true;
        }
        if (key === "168") {
          s.accessories = decode("ConsumableResponse", value).runtime;
          changed = true;
        }
        if (key === "173") {
          const p = decode("StationResponse", value);
          s.station = { connected: p.status?.connected === true };
          changed = true;
        }
        if (key === "177") {
          const p = decode("ErrorCode", value);
          s.warnings = (p.newCode?.warn || p.warn || []).map(
            (code: number) => ({
              code,
              text:
                code === 6031
                  ? "Station tray full"
                  : `Vacuum warning (${code})`,
            }),
          );
          changed = true;
        }
        if (key === "180") {
          const p = decode("SceneResponse", value);
          if (p.infos) {
            s.scenes = p.infos
              .filter((i: { valid?: boolean }) => i.valid !== false)
              .map(
                (i: {
                  id?: { value: number };
                  name: string;
                  mapid: number;
                }) => ({ id: i.id?.value, name: i.name, mapId: i.mapid }),
              )
              .filter((i: { id?: number }) => i.id);
            changed = true;
          }
        }
      } catch {
        this.emit("diagnostic", `Ignored unsupported data field ${key}`);
      }
    }
    if (changed) {
      s.updatedAt = Date.now();
      this.emit("update");
    }
  }
  ingestMap(data: { channel_id?: number; data?: string } | undefined): void {
    if (data?.channel_id === undefined || typeof data.data !== "string") return;
    const map = parseMap(data.data, this.map);
    if (map) {
      this.map = map;
      if (map.rooms?.length) this.state.rooms = map.rooms;
      this.state.mapId = map.id || this.state.mapId;
      this.emit("map");
      this.emit("update");
      return;
    }
    if (data.data.length < 200 && this.map) {
      try {
        const p = decode("proto.cloud.stream.DynamicData", data.data, "hex");
        if (p.curPose && ("x" in p.curPose || "y" in p.curPose)) {
          this.map.robot = {
            x: p.curPose.x || 0,
            y: p.curPose.y || 0,
            theta: p.curPose.theta || 0,
          };
          this.emit("update");
        }
      } catch {}
    }
  }
  snapshot(name = this.device.name): VacuumSnapshot {
    return {
      ...this.state,
      id: this.device.id,
      name,
      model: this.device.model,
      modelName: this.device.model === "T2280" ? "Omni C20" : this.device.model,
      connected: this.connected,
      stale:
        !this.state.updatedAt ||
        Date.now() - this.state.updatedAt > 15 * 60 * 1000,
      map: this.map,
    };
  }
  async act(
    action: Action,
    args: ActionArgs = {},
  ): Promise<{ sent: true; action: Action }> {
    if (!this.connected || !this.mqtt?.connected)
      throw new Error("Vacuum is offline. Wait for reconnection.");
    if (this.busy)
      throw new Error("Another command is being sent. Please wait.");
    const data = command(action, args, this.state);
    this.busy = true;
    try {
      const c = this.credentials!,
        now = Date.now();
      const clientId = `android-${c.app_name}-eufy_android_${this.cloud!.openudid}_${c.user_id}`;
      const message = {
        head: {
          client_id: clientId,
          cmd: 65537,
          cmd_status: 1,
          msg_seq: now % 2147483647,
          seed: "",
          sess_id: clientId,
          sign_code: 0,
          timestamp: now,
          version: "1.0.0.1",
        },
        payload: JSON.stringify({
          account_id: c.user_id,
          data,
          device_sn: this.device.id,
          protocol: 2,
          t: now,
        }),
      };
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Command delivery timed out")),
          10000,
        );
        this.mqtt!.publish(
          `cmd/eufy_home/${this.device.model}/${this.device.id}/req`,
          JSON.stringify(message),
          { qos: 1 },
          (err) => {
            clearTimeout(timer);
            err
              ? reject(new Error("Command could not be delivered"))
              : resolve();
          },
        );
      });
      return { sent: true, action };
    } finally {
      this.busy = false;
    }
  }
  close(): void {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.refreshTimer);
    this.reconnectTimer = undefined;
    this.connected = false;
    this.mqtt?.removeAllListeners();
    this.mqtt?.end(true);
  }
}
