import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { settingsMatch } from "../widgets/clean/public/widget.mjs";
import { VacuumClient } from "../lib/client.mjs";

test("settings only confirm matching reported values from a connected client", () => {
  const client = new VacuumClient(
    { id: "TEST", model: "T2280", name: "Test", dps: {} },
    { username: "test@example.invalid", password: "unused" },
  );
  client.state.parameters = { suction: 0, intensity: 1, water: 2, mode: 2 };
  assert.equal(settingsMatch(client.snapshot(), { intensity: 1 }), false);
  client.connected = true;
  assert.equal(settingsMatch(client.snapshot(), { intensity: 1 }), true);
  assert.equal(settingsMatch(client.snapshot(), { suction: 1 }), false);
  assert.equal(settingsMatch(client.snapshot(), {}), false);
});

test("widget command completion does not invoke gesture-only haptics", () => {
  const source = readFileSync(
    new URL("../widgets/clean/public/widget.mts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /hapticFeedback|shortHapticFeedback/);
});

test("buttons and selects suppress focus rings and mobile tap highlights", () => {
  const css = readFileSync(
    new URL("../widgets/clean/public/style.css", import.meta.url),
    "utf8",
  );
  assert.match(
    css,
    /button:focus,[\s\S]*?select:focus-visible\s*\{\s*outline: none !important;\s*box-shadow: none !important;/,
  );
  assert.match(css, /-webkit-tap-highlight-color: transparent/);
  assert.doesNotMatch(css, /outline: 3px solid/);
});
