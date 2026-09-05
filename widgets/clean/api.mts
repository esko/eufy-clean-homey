import type App from "../../app.mjs";
import { ACTIONS, type Action, type ActionArgs } from "../../lib/types.mjs";
type Request = {
  homey: App["homey"];
  query: Record<string, string>;
  body: { action?: string; args?: ActionArgs };
};
export default {
  async getState({ homey, query }: Request) {
    const device = (homey.app as App).getVacuum(query.id);
    if (!device.client) throw new Error("Connecting to Eufy…");
    return device.client.snapshot(device.getName());
  },
  async action({ homey, query, body }: Request) {
    if (!ACTIONS.includes(body.action as Action))
      throw new Error("Unsupported vacuum action");
    return (homey.app as App)
      .getVacuum(query.id)
      .act(body.action as Action, body.args || {});
  },
};
