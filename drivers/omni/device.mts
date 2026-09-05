import Homey from "homey";
import { VacuumClient } from "../../lib/client.mjs";
import type {
  Credentials,
  Action,
  ActionArgs,
  VacuumState,
  FloorMap,
} from "../../lib/types.mjs";
export default class VacuumDevice extends Homey.Device {
  client?: VacuumClient;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private updateTimer?: ReturnType<typeof setTimeout>;
  async onInit(): Promise<void> {
    await this.setUnavailable("Connecting to Eufy…");
    this.registerCapabilityListener(
      "vacuumcleaner_state",
      async (value: string) => {
        const map: Record<string, Action> = {
          cleaning: "start",
          spot_cleaning: "spot",
          docked: "dock",
          charging: "dock",
          stopped: "stop",
        };
        if (!map[value]) throw new Error("Unsupported vacuum command");
        await this.act(map[value]);
      },
    );
    this.registerCapabilityListener("clean_suction", async (value: string) => {
      await this.act("settings", { suction: Number(value) });
    });
    await this.startClient();
  }
  async startClient(): Promise<void> {
    clearTimeout(this.saveTimer);
    clearTimeout(this.updateTimer);
    this.saveTimer = undefined;
    this.updateTimer = undefined;
    this.client?.close();
    const credentials = this.getStoreValue("credentials") as
      Credentials | undefined;
    if (!credentials?.username || !credentials.password) {
      await this.setUnavailable("Use Repair to sign in to your Eufy account");
      return;
    }
    const data = this.getData();
    const c = new VacuumClient(
      { id: data.id, model: data.model, name: this.getName(), dps: {} },
      credentials,
    );
    const saved = this.getStoreValue("cleanState") as VacuumState | undefined;
    if (saved) c.state = { ...c.state, ...saved };
    c.map = (this.getStoreValue("floorMap") as FloorMap | null) || null;
    this.client = c;
    c.on("connection", (online: boolean) => {
      void (
        online
          ? this.setAvailable()
          : this.setUnavailable("Eufy disconnected; reconnecting")
      ).catch(() => {});
    });
    c.on("update", () => {
      if (!this.updateTimer)
        this.updateTimer = setTimeout(() => {
          this.updateTimer = undefined;
          void this.sync().catch((e) => this.error(e.message));
        }, 200);
      if (!this.saveTimer)
        this.saveTimer = setTimeout(() => {
          this.saveTimer = undefined;
          void this.save().catch((e) => this.error(e.message));
        }, 5000);
    });
    try {
      await c.connect();
      await this.sync();
    } catch (error) {
      await this.setUnavailable(
        error instanceof Error ? error.message : "Eufy connection failed",
      );
    }
  }
  async act(action: Action, args: ActionArgs = {}): Promise<unknown> {
    if (!this.client) throw new Error("Vacuum is not connected");
    return this.client.act(action, args);
  }
  private async sync(): Promise<void> {
    if (!this.client) return;
    const s = this.client.state;
    const set = async (k: string, v: unknown) => {
      if (v !== undefined && v !== null && this.getCapabilityValue(k) !== v)
        await this.setCapabilityValue(k, v);
    };
    await set("measure_battery", s.battery);
    if (s.battery !== null) await set("alarm_battery", s.battery < 15);
    await set("clean_status", s.activity);
    await set(
      "clean_warning",
      s.warnings.map((w) => w.text).join("; ") || "None",
    );
    const states: Record<string, string> = {
      docked: s.charging ? "charging" : "docked",
      cleaning: "cleaning",
      paused: "stopped",
      idle: "stopped",
      sleeping: "stopped",
      washing: "docked",
      drying: "docked",
    };
    await set("vacuumcleaner_state", states[s.activity]);
    await set("clean_area", s.statistics?.single?.cleanArea);
    if (s.statistics?.single?.cleanDuration !== undefined)
      await set(
        "clean_duration",
        Math.round(s.statistics.single.cleanDuration / 60),
      );
    if (s.parameters?.suction !== undefined && s.parameters.suction !== null)
      await set("clean_suction", String(s.parameters.suction));
    if (s.warnings.length)
      await this.setWarning(s.warnings.map((w) => w.text).join("; "));
    else await this.unsetWarning();
    await this.homey.api.realtime("clean:update", this.getData().id);
  }
  private async save(): Promise<void> {
    if (this.client) {
      await this.setStoreValue("cleanState", this.client.state);
      if (this.client.map)
        await this.setStoreValue("floorMap", this.client.map);
    }
  }
  async onDeleted(): Promise<void> {
    clearTimeout(this.saveTimer);
    clearTimeout(this.updateTimer);
    this.client?.close();
  }
}
