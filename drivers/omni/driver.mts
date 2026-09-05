import Homey from "homey";
import { EufyCloud } from "../../lib/cloud.mjs";
import type { Credentials } from "../../lib/types.mjs";
import type VacuumDevice from "./device.mjs";
export default class Driver extends Homey.Driver {
  async onPair(session: Homey.Driver.PairSession): Promise<void> {
    let credentials: Credentials;
    let cloud: EufyCloud;
    session.setHandler("login", async (data: Credentials) => {
      credentials = { username: data.username.trim(), password: data.password };
      cloud = new EufyCloud(credentials);
      await cloud.login();
      return true;
    });
    session.setHandler("list_devices", async () => {
      if (!cloud) throw new Error("Sign in first");
      const devices = await cloud.devices();
      const supported = devices.filter((d) => d.model === "T2280");
      if (!supported.length)
        throw new Error(
          "No Omni C20 found in this account. Other models are not yet validated.",
        );
      return supported.map((d) => ({
        name: d.name,
        data: { id: d.id, model: d.model },
        settings: { email: credentials.username },
        store: { credentials },
      }));
    });
  }
  async onRepair(
    session: Homey.Driver.PairSession,
    device: VacuumDevice,
  ): Promise<void> {
    session.setHandler("login", async (data: Credentials) => {
      const credentials = {
        username: data.username.trim(),
        password: data.password,
      };
      const cloud = new EufyCloud(credentials);
      await cloud.login();
      if (!(await cloud.devices()).some((d) => d.id === device.getData().id))
        throw new Error("The vacuum is not in this account");
      await device.setStoreValue("credentials", credentials);
      await device.setSettings({ email: credentials.username });
      await device.startClient();
      await session.done();
      return true;
    });
  }
}
