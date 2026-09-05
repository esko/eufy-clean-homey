import Homey from "homey";
import type VacuumDevice from "./drivers/omni/device.mjs";
import type { Action } from "./lib/types.mjs";
export default class App extends Homey.App {
  devices(): VacuumDevice[] {
    return this.homey.drivers.getDriver("omni").getDevices() as VacuumDevice[];
  }
  getVacuum(id: string): VacuumDevice {
    const device = this.devices().find((d) => d.getData().id === id);
    if (!device) throw new Error("Choose a paired vacuum in widget settings");
    return device;
  }
  async onInit(): Promise<void> {
    this.homey.dashboards
      .getWidget("clean")
      .registerSettingAutocompleteListener("device", async (query) =>
        this.devices()
          .filter((d) =>
            d.getName().toLowerCase().includes(query.toLowerCase()),
          )
          .map((d) => ({ name: d.getName(), id: d.getData().id })),
      );
    for (const action of [
      "pause",
      "resume",
      "dock",
      "locate",
      "wash",
      "dry",
      "stopDry",
      "empty",
    ] as Action[])
      this.homey.flow
        .getActionCard(action)
        .registerRunListener(async ({ device }: { device: VacuumDevice }) =>
          device.act(action),
        );
    for (const kind of ["scene", "room"] as const) {
      this.homey.flow
        .getActionCard(kind)
        .registerArgumentAutocompleteListener(
          kind,
          async (query: string, args: { device: VacuumDevice }) =>
            (
              args.device.client?.state[
                kind === "scene" ? "scenes" : "rooms"
              ] || []
            )
              .filter((r) => r.name.toLowerCase().includes(query.toLowerCase()))
              .map((r) => ({ ...r, id: String(r.id) })),
        )
        .registerRunListener(
          async (args: {
            device: VacuumDevice;
            scene?: { id: string };
            room?: { id: string };
          }) => {
            if (kind === "scene")
              return args.device.act("scene", { id: Number(args.scene!.id) });
            return args.device.act("rooms", { rooms: [Number(args.room!.id)] });
          },
        );
    }
    this.homey.on("unload", () => {
      for (const d of this.devices()) d.client?.close();
    });
    this.log("Eufy Clean Studio ready");
  }
}
