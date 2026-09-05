import type {
  VacuumSnapshot,
  Action,
  ActionArgs,
  FloorMap,
} from "../../../lib/types.mjs";
interface HomeyWidget {
  ready(): void;
  getSettings(): { device?: { id: string } };
  api(method: string, path: string, body?: unknown): Promise<any>;
  on(event: string, handler: (data: unknown) => void): void;
  hapticFeedback?(): void;
}
export function init(homey: HomeyWidget): void {
  const el = <T extends HTMLElement = HTMLElement>(id: string) =>
    document.getElementById(id) as T;
  let snapshot: VacuumSnapshot | undefined,
    pending = false,
    zoom = 1,
    refreshing = false;
  const selected = new Set<number>();
  const id = homey.getSettings().device?.id;
  const message = (text: string, error = false) => {
    el("message").textContent = text;
    el("message").classList.toggle("error", error);
  };
  async function refresh() {
    if (!id || refreshing) return;
    refreshing = true;
    try {
      snapshot = await homey.api("GET", `/state?id=${encodeURIComponent(id)}`);
      render();
    } catch (e) {
      message(e instanceof Error ? e.message : "Unable to load status", true);
    } finally {
      refreshing = false;
    }
  }
  async function act(action: Action, args: ActionArgs = {}) {
    if (pending || !snapshot?.connected) return;
    pending = true;
    render();
    message("Sending command…");
    try {
      await homey.api("POST", `/action?id=${encodeURIComponent(id!)}`, {
        action,
        args,
      });
      homey.hapticFeedback?.();
      message("Command sent. Waiting for the vacuum to report its state.");
    } catch (e) {
      message(e instanceof Error ? e.message : "Command failed", true);
    } finally {
      pending = false;
      await refresh();
      render();
    }
  }
  function render() {
    const s = snapshot;
    if (!s) return;
    el("app").setAttribute("aria-busy", "false");
    el("activity").textContent = !s.connected
      ? "Reconnecting…"
      : s.stale ? `${s.activity} · Outdated` : s.activity;
    el("battery").textContent = s.battery === null ? "—" : String(s.battery);
    el("battery").parentElement!.classList.toggle(
      "low",
      s.battery !== null && s.battery < 20,
    );
    el("battery").parentElement!.classList.toggle(
      "critical",
      s.battery !== null && s.battery < 10,
    );
    el("charging").hidden = !s.charging;
    el("area").textContent = String(s.statistics?.single?.cleanArea ?? "—");
    el("duration").textContent =
      s.statistics?.single?.cleanDuration === undefined
        ? "—"
        : String(Math.round(s.statistics.single.cleanDuration / 60));
    el("warning").hidden = !s.warnings.length;
    el("warning").textContent = s.warnings.map((w) => w.text).join(" · ");
    const primary = el<HTMLButtonElement>("primary");
    primary.textContent =
      s.activity === "cleaning"
        ? "Pause cleaning"
        : s.activity === "paused"
          ? "Resume cleaning"
          : "Start cleaning";
    primary.disabled = !s.connected || pending;
    document
      .querySelectorAll<HTMLButtonElement>("[data-action]")
      .forEach((b) => {
        b.disabled =
          !s.connected ||
          pending ||
          (["wash", "dry", "stopDry", "empty"].includes(b.dataset.action!) &&
            !s.station?.connected);
      });
    document
      .querySelectorAll<HTMLSelectElement>("[data-setting]")
      .forEach((select) => {
        const key = select.dataset.setting as keyof NonNullable<
          VacuumSnapshot["parameters"]
        >;
        const value = s.parameters?.[key];
        select.disabled =
          !s.connected || pending || value === undefined || value === null;
        if (
          value !== undefined &&
          value !== null &&
          document.activeElement !== select
        )
          select.value = String(value);
      });
    for (const r of [...selected])
      if (!s.rooms.some((room) => room.id === r)) selected.delete(r);
    el("rooms").replaceChildren(
      ...s.rooms.map((room) => {
        const b = document.createElement("button");
        b.textContent = room.name;
        b.setAttribute("aria-pressed", String(selected.has(room.id)));
        b.onclick = () => {
          selected.has(room.id)
            ? selected.delete(room.id)
            : selected.add(room.id);
          render();
        };
        return b;
      }),
    );
    const roomButton = el<HTMLButtonElement>("clean-rooms");
    roomButton.hidden = !s.rooms.length;
    roomButton.disabled = !selected.size || !s.mapId || !s.connected || pending;
    el("scenes").replaceChildren(
      ...s.scenes.map((scene) => {
        const b = document.createElement("button");
        b.textContent = `▷ ${scene.name}`;
        b.disabled = !s.connected || pending;
        b.onclick = () => void act("scene", { id: scene.id });
        return b;
      }),
    );
    el("floor").hidden = !s.map;
    el("empty-map").hidden = !!s.map;
    el("zoom").hidden = !s.map;
    if (s.map) {
      draw(s.map);
      el("map-time").textContent =
        `Snapshot · ${new Date(s.map.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    }
    const names: Record<string, string> = {
      sideBrush: "Side brush",
      rollingBrush: "Roller brush",
      filterMesh: "Filter",
      sensor: "Sensors",
      mop: "Mop",
      scrape: "Scraper",
    };
    const entries = Object.entries(s.accessories || {}).filter(
      ([key, v]) => names[key] && v.duration !== undefined,
    );
    if (entries.length)
      el("accessories").replaceChildren(
        ...entries.map(([key, v]) => {
          const row = document.createElement("div");
          row.className = "usage";
          const name = document.createElement("span");
          name.textContent = names[key];
          const value = document.createElement("span");
          value.textContent = `${v.duration} h used`;
          row.append(name, value);
          return row;
        }),
      );
    el("lifetime").textContent =
      s.statistics?.userTotal?.cleanCount === undefined
        ? ""
        : `${s.statistics.userTotal.cleanCount} cleanings · ${s.statistics.userTotal.cleanArea ?? "—"} m² total`;
  }
  function draw(map: FloorMap) {
    const canvas = el<HTMLCanvasElement>("floor"),
      ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const pixels = atob(map.pixels);
    const layer = document.createElement("canvas");
    layer.width = map.width;
    layer.height = map.height;
    const lc = layer.getContext("2d")!,
      img = lc.createImageData(map.width, map.height);
    const colors = [
      [0, 0, 0, 0],
      [74, 106, 107, 255],
      [168, 211, 195, 255],
      [218, 235, 222, 255],
    ];
    for (let i = 0; i < map.width * map.height; i++) {
      const color = colors[(pixels.charCodeAt(i >> 2) >> ((i % 4) * 2)) & 3];
      img.data.set(color, i * 4);
    }
    lc.putImageData(img, 0, 0);
    const scale =
        Math.min(
          (canvas.width - 36) / map.width,
          (canvas.height - 30) / map.height,
        ) * zoom,
      x = (canvas.width - map.width * scale) / 2,
      y = (canvas.height - map.height * scale) / 2;
    ctx.save();
    ctx.translate(x, y + map.height * scale);
    ctx.scale(scale, -scale);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(layer, 0, 0);
    const point = (p: { x: number; y: number }) => ({
      x: (p.x - map.origin.x) / map.resolution,
      y: (p.y - map.origin.y) / map.resolution,
    });
    for (const zone of [
      ...(map.zones?.forbiddenZones || []),
      ...(map.zones?.banMopZones || []),
    ]) {
      ctx.beginPath();
      [zone.p0, zone.p1, zone.p2, zone.p3].filter(Boolean).forEach((p, i) => {
        const q = point(p);
        i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
      });
      ctx.closePath();
      ctx.fillStyle = "#ec796b66";
      ctx.fill();
    }
    for (const wall of map.zones?.virtualWalls || []) {
      const a = point(wall.p0),
        b = point(wall.p1);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = "#e9645a";
      ctx.lineWidth = 2 / scale;
      ctx.stroke();
    }
    for (const dock of map.docks) {
      const q = point(dock);
      ctx.fillStyle = "#245b59";
      ctx.fillRect(q.x - 5 / scale, q.y - 5 / scale, 10 / scale, 10 / scale);
    }
    if (map.robot) {
      const q = point(map.robot);
      ctx.beginPath();
      ctx.arc(q.x, q.y, 6 / scale, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.strokeStyle = "#16776d";
      ctx.lineWidth = 2 / scale;
      ctx.stroke();
    }
    ctx.restore();
  }
  el("primary").onclick = () =>
    void act(
      snapshot?.activity === "cleaning"
        ? "pause"
        : snapshot?.activity === "paused"
          ? "resume"
          : "start",
    );
  el("clean-rooms").onclick = () => void act("rooms", { rooms: [...selected] });
  document
    .querySelectorAll<HTMLButtonElement>("[data-action]")
    .forEach((b) => (b.onclick = () => void act(b.dataset.action as Action)));
  document
    .querySelectorAll<HTMLSelectElement>("[data-setting]")
    .forEach(
      (s) =>
        (s.onchange = () =>
          void act("settings", { [s.dataset.setting!]: Number(s.value) })),
    );
  document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        document
          .querySelectorAll<HTMLButtonElement>("[data-tab]")
          .forEach((t) => t.setAttribute("aria-pressed", String(t === b)));
        for (const name of ["map", "settings", "care"])
          el(name).hidden = name !== b.dataset.tab;
      }),
  );
  for (const [name, mult] of [
    ["zoom-in", 1.25],
    ["zoom-out", 0.8],
    ["fit", 0],
  ] as const)
    el(name).onclick = () => {
      zoom = mult ? Math.min(4, Math.max(0.5, zoom * mult)) : 1;
      if (snapshot?.map) draw(snapshot.map);
    };
  homey.on("clean:update", (data) => {
    if (data === id) void refresh();
  });
  homey.ready();
  if (!id) {
    message("Choose a vacuum in this widget’s settings.", true);
    return;
  }
  void refresh();
  const timer = setInterval(() => {
    if (!document.hidden) void refresh();
  }, 10000);
  window.addEventListener("pagehide", () => clearInterval(timer), {
    once: true,
  });
}
