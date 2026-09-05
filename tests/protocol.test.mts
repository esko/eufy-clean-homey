import { test } from "node:test";
import assert from "node:assert/strict";
import { command, decode, encode, lz4, parseMap } from "../lib/protocol.mjs";
import { VacuumClient } from "../lib/client.mjs";

test("LZ4 literals and overlapping copies are bounded", () => {
  assert.equal(lz4(Buffer.from([0x40, 97, 98, 99, 100]), 4).toString(), "abcd");
  assert.equal(lz4(Buffer.from([0x10, 97, 1, 0]), 5).toString(), "aaaaa");
  assert.throws(() => lz4(Buffer.from([0, 0, 0]), 4), /offset/);
  assert.throws(() => lz4(Buffer.from([0xf0]), 20), /Truncated/);
  assert.throws(() => lz4(Buffer.alloc(0), 5 * 1024 * 1024), /size/);
});
test("unsupported map input does not invent a map", () => {
  assert.equal(parseMap("not hex"), null);
  assert.equal(parseMap(""), null);
});
test("commands preserve explicit zero enums", () => {
  const data = command(
    "settings",
    { suction: 0, water: 0 },
    { parameters: { suction: 3, water: 2, mode: 2, intensity: 0 } },
  );
  const p = decode("CleanParamRequest", data["154"] as string);
  assert.equal(p.cleanParam.fan.suction, 0);
  assert.equal(p.cleanParam.mopMode.level, 0);
  assert.equal(p.cleanParam.cleanType, undefined);
});
test("room, scene, settings and dock commands reject unreported targets", () => {
  assert.throws(() => command("rooms", { rooms: [1] }), /available map/);
  assert.throws(
    () =>
      command(
        "rooms",
        { rooms: [2] },
        { rooms: [{ id: 1, name: "Kitchen" }], mapId: 1 },
      ),
    /Unknown room/,
  );
  assert.throws(() => command("scene", { id: 42 }), /Unknown cleaning scene/);
  assert.throws(() => command("settings", { suction: 0 }), /not been reported/);
  assert.throws(
    () =>
      command(
        "settings",
        { suction: 99 },
        { parameters: { suction: 0, water: 0, mode: 0, intensity: 0 } },
      ),
    /Invalid/,
  );
  assert.throws(
    () => command("wash", {}, { station: { connected: false } }),
    /connected dock/,
  );
});
test("valid room command uses known map and deduplicates selection", () => {
  const p = decode(
    "ModeCtrlRequest",
    command(
      "rooms",
      { rooms: [1, 1] },
      { rooms: [{ id: 1, name: "Kitchen" }], mapId: 5 },
    )["152"] as string,
  );
  assert.equal(p.method, 1);
  assert.equal(p.selectRoomsClean.mapId, 5);
  assert.equal(p.selectRoomsClean.rooms.length, 1);
});
const client = () =>
  new VacuumClient(
    { id: "TEST-DEVICE", name: "Test vacuum", model: "T2280", dps: {} },
    { username: "test@example.invalid", password: "not-a-password" },
  );
test("battery values are percentages, including zero, not fractions", () => {
  const c = client();
  assert.equal(c.state.battery, null);
  c.ingest({ "163": 100 });
  assert.equal(c.state.battery, 100);
  c.ingest({ "163": 0 });
  assert.equal(c.state.battery, 0);
  c.ingest({ "163": 101 });
  assert.equal(c.state.battery, 0);
});
test("work status preserves zero defaults, pause, charge completion and station enums", () => {
  const c = client(),
    ingest = (p: Record<string, unknown>) =>
      c.ingest({ "153": encode("WorkStatus", p) });
  ingest({ state: 0 });
  assert.equal(c.state.activity, "idle");
  ingest({ state: 0, cleaning: { state: 1 } });
  assert.equal(c.state.activity, "paused");
  ingest({ state: 3, charging: { state: 0 } });
  assert.equal(c.state.charging, true);
  ingest({ state: 3, charging: { state: 1 } });
  assert.equal(c.state.charging, false);
  ingest({ state: 3, charging: { state: 2 } });
  assert.equal(c.state.charging, false);
  ingest({ state: 3, station: { washingDryingSystem: { state: 0 } } });
  assert.equal(c.state.activity, "washing");
  ingest({ state: 3, station: { washingDryingSystem: { state: 1 } } });
  assert.equal(c.state.activity, "drying");
});
test("offline commands fail without network calls or optimistic state changes", async () => {
  const c = client();
  await assert.rejects(c.act("start"), /offline/);
  assert.equal(c.state.activity, "unknown");
  c.close();
});
