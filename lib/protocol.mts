import protobuf from "protobufjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Action, ActionArgs, VacuumState, FloorMap } from "./types.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Protobuf messages have dynamic fields; untyped values are contained in this decoder.
type ProtoMessage = Record<string, any>;
const root = new protobuf.Root();
root.resolvePath = (_, target) => path.join(__dirname, "..", target);
for (const file of [
  "stream",
  "work_status",
  "clean_param",
  "clean_statistics",
  "consumable",
  "station",
  "scene",
  "error_code",
])
  root.loadSync(`proto/cloud/${file}.proto`);
function type(name: string) {
  return root.lookupType(name.includes(".") ? name : `proto.cloud.${name}`);
}
export function decode(
  name: string,
  data: string | Buffer,
  encoding: BufferEncoding = "base64",
): ProtoMessage {
  if (typeof data !== "string" && !Buffer.isBuffer(data))
    throw new Error("Invalid protobuf payload");
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, encoding);
  if (buffer.length > 4 * 1024 * 1024) throw new Error("Payload too large");
  const t = type(name);
  return t.toObject(t.decodeDelimited(buffer), {
    longs: Number,
    bytes: Buffer,
    enums: Number,
  });
}
export function encode(name: string, data: ProtoMessage) {
  const t = type(name);
  const error = t.verify(data);
  if (error) throw new Error(error);
  return Buffer.from(t.encodeDelimited(t.create(data)).finish()).toString(
    "base64",
  );
}
export function lz4(data: Buffer, size: number): Buffer {
  if (!Number.isInteger(size) || size < 0 || size > 4 * 1024 * 1024)
    throw new Error("Invalid map size");
  if (data.length === size) return Buffer.from(data);
  const out = Buffer.alloc(size);
  let i = 0,
    o = 0;
  const extra = () => {
    let n = 0,
      v;
    do {
      if (i >= data.length) throw new Error("Truncated LZ4");
      v = data[i++];
      n += v;
    } while (v === 255);
    return n;
  };
  while (i < data.length) {
    const token = data[i++];
    let len = token >> 4;
    if (len === 15) len += extra();
    if (i + len > data.length || o + len > size)
      throw new Error("Invalid LZ4 literal");
    data.copy(out, o, i, i + len);
    i += len;
    o += len;
    if (i === data.length) break;
    if (i + 2 > data.length) throw new Error("Invalid LZ4 offset");
    const offset = data.readUInt16LE(i);
    i += 2;
    if (!offset || offset > o) throw new Error("Invalid LZ4 offset");
    let count = (token & 15) + 4;
    if ((token & 15) === 15) count += extra();
    if (o + count > size) throw new Error("Invalid LZ4 match");
    for (let j = 0; j < count; j++) {
      out[o] = out[o - offset];
      o++;
    }
  }
  if (o !== size) throw new Error("Incomplete map data");
  return out;
}
export function parseMap(
  hex: string,
  previous: FloorMap | null = null,
): FloorMap | null {
  if (
    typeof hex !== "string" ||
    hex.length > 8 * 1024 * 1024 ||
    !/^([a-f\d]{2})+$/i.test(hex)
  )
    return null;
  let map: ProtoMessage | undefined, backup: ProtoMessage | undefined;
  try {
    backup = decode("proto.cloud.stream.MapBackup", hex, "hex");
    if (backup.map?.pixels?.length) map = backup.map;
  } catch {}
  if (!map) {
    try {
      map = decode("proto.cloud.stream.Map", hex, "hex");
    } catch {
      return null;
    }
  }
  const info = map?.info;
  if (!info?.width || !info.height || !map.pixels?.length || !map.pixelSize)
    return null;
  if (
    info.width * info.height > 4 * 1024 * 1024 ||
    info.width > 4096 ||
    info.height > 4096
  )
    throw new Error("Map dimensions exceed limit");
  // Partial frames require tile merging; retain the last complete map instead.
  if (map!.frame === 1) return null;
  const pixels = lz4(map!.pixels, map!.pixelSize);
  if (pixels.length < Math.ceil((info.width * info.height) / 4))
    throw new Error("Incomplete map pixels");
  const id = map!.id || info.mapId || backup?.desc?.mapId || null;
  const retained: Partial<FloorMap> =
    previous && previous.id === id ? previous : {};
  const result: FloorMap = {
    ...retained,
    id,
    name: map!.name || backup?.desc?.name || retained.name || "Floor map",
    width: info.width,
    height: info.height,
    origin: info.origin || { x: 0, y: 0 },
    resolution: info.resolution || 5,
    docks: info.docksV2?.map((d: ProtoMessage) => d.pose) || info.docks || [],
    pixels: pixels.toString("base64"),
    updatedAt: Date.now(),
  };
  if (backup?.rooms?.pixels?.length) {
    const r = backup.rooms;
    if (r.width * r.height > 4 * 1024 * 1024)
      throw new Error("Room map exceeds limit");
    result.outline = {
      width: r.width,
      height: r.height,
      origin: r.origin || { x: 0, y: 0 },
      pixels: lz4(r.pixels, r.pixelSize).toString("base64"),
    };
  }
  if (backup?.roomParams?.rooms)
    result.rooms = backup.roomParams.rooms.map((r: ProtoMessage) => ({
      id: r.id,
      name: r.name || `Room ${r.id}`,
    }));
  if (backup?.restrictedZone) result.zones = backup.restrictedZone;
  return result;
}
const COMMANDS = {
  start: 0,
  rooms: 1,
  spot: 3,
  dock: 6,
  stop: 12,
  pause: 13,
  resume: 14,
  scene: 24,
};
export function command(
  action: Action,
  args: ActionArgs = {},
  state: Partial<VacuumState> = {},
): Record<string, string | boolean> {
  if (action in COMMANDS) {
    const request: ProtoMessage = {
      method: COMMANDS[action as keyof typeof COMMANDS],
    };
    if (action === "start") request.autoClean = { cleanTimes: 1 };
    if (action === "spot") request.spotClean = { cleanTimes: 1 };
    if (action === "rooms") {
      if (
        !state.mapId ||
        !Array.isArray(args.rooms) ||
        !args.rooms.length ||
        args.rooms.length > 64
      )
        throw new Error("Select rooms from an available map");
      const known = new Set((state.rooms || []).map((r) => r.id));
      if (args.rooms.some((id) => !Number.isInteger(id) || !known.has(id)))
        throw new Error("Unknown room");
      request.selectRoomsClean = {
        rooms: [...new Set(args.rooms)].map((id, i) => ({ id, order: i + 1 })),
        mode: 0,
        cleanTimes: 1,
        mapId: state.mapId,
      };
    }
    if (action === "scene") {
      if (
        !Number.isInteger(args.id) ||
        !(state.scenes || []).some((s) => s.id === args.id)
      )
        throw new Error("Unknown cleaning scene");
      request.sceneClean = { sceneId: args.id };
    }
    return { "152": encode("ModeCtrlRequest", request) };
  }
  if (action === "locate") return { "160": true };
  if (action === "settings") {
    if (!state.parameters)
      throw new Error(
        "Cleaning settings have not been reported by this vacuum",
      );
    const param: ProtoMessage = {};
    for (const [key, field, sub, max] of [
      ["suction", "fan", "suction", 4],
      ["water", "mopMode", "level", 2],
      ["mode", "cleanType", "value", 3],
      ["intensity", "cleanExtent", "value", 2],
    ] as [keyof ActionArgs, string, string, number][]) {
      const value = args[key];
      if (value === undefined) continue;
      if (
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < 0 ||
        value > max
      )
        throw new Error(`Invalid ${key}`);
      param[field] = { [sub]: value };
    }
    if (!Object.keys(param).length)
      throw new Error("No cleaning settings selected");
    return {
      "154": encode("CleanParamRequest", {
        cleanParam: param,
        areaCleanParam: param,
      }),
    };
  }
  const dock: Record<string, [string, boolean]> = {
    wash: ["goSelfcleaning", true],
    dry: ["goDry", true],
    stopDry: ["goDry", false],
    empty: ["goCollectDust", true],
  };
  if (dock[action]) {
    if (!state.station?.connected)
      throw new Error("A connected dock has not been reported by this vacuum");
    const [key, value] = dock[action];
    return { "173": encode("StationRequest", { manualCmd: { [key]: value } }) };
  }
  throw new Error("Unsupported vacuum action");
}
