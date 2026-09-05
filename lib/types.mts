export interface Room {
  id: number;
  name: string;
}
export interface Scene extends Room {
  mapId?: number;
}
export interface Point {
  x: number;
  y: number;
  theta?: number;
}
export interface FloorMap {
  id: number | null;
  name: string;
  width: number;
  height: number;
  resolution: number;
  origin: Point;
  pixels: string;
  updatedAt: number;
  docks: Point[];
  robot?: Point;
  rooms?: Room[];
  outline?: { width: number; height: number; origin: Point; pixels: string };
  zones?: {
    virtualWalls?: { p0: Point; p1: Point }[];
    forbiddenZones?: Quad[];
    banMopZones?: Quad[];
  };
}
export interface Quad {
  p0: Point;
  p1: Point;
  p2: Point;
  p3: Point;
}
export interface CleaningParameters {
  suction: number | null;
  water: number | null;
  mode: number | null;
  intensity: number | null;
}
export interface Statistics {
  single?: { cleanDuration?: number; cleanArea?: number };
  userTotal?: {
    cleanDuration?: number;
    cleanArea?: number;
    cleanCount?: number;
  };
}
export interface VacuumState {
  battery: number | null;
  activity: string;
  charging: boolean;
  updatedAt: number | null;
  rooms: Room[];
  scenes: Scene[];
  mapId?: number;
  parameters?: CleaningParameters;
  statistics?: Statistics;
  accessories?: Record<string, { duration?: number }>;
  station?: { connected: boolean };
  warnings: { code: number; text: string }[];
}
export interface VacuumSnapshot extends VacuumState {
  id: string;
  name: string;
  model: string;
  modelName: string;
  connected: boolean;
  stale: boolean;
  map: FloorMap | null;
}
export interface Credentials {
  username: string;
  password: string;
}
export interface MqttCredentials {
  endpoint_addr: string;
  certificate_pem: string;
  private_key: string;
  thing_name: string;
  app_name: string;
  user_id: string;
}
export interface DiscoveredDevice {
  id: string;
  name: string;
  model: string;
  dps: Record<string, unknown>;
  ownerId?: string;
}
export type Action =
  | "start"
  | "pause"
  | "resume"
  | "stop"
  | "dock"
  | "spot"
  | "locate"
  | "rooms"
  | "scene"
  | "settings"
  | "wash"
  | "dry"
  | "stopDry"
  | "empty";
export const ACTIONS: Action[] = [
  "start",
  "pause",
  "resume",
  "stop",
  "dock",
  "spot",
  "locate",
  "rooms",
  "scene",
  "settings",
  "wash",
  "dry",
  "stopDry",
  "empty",
];
export interface ActionArgs {
  rooms?: number[];
  id?: number;
  suction?: number;
  water?: number;
  mode?: number;
  intensity?: number;
}
