import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { encounterMessage } from "../scripts/gm-screen/encounter-controls.js";

const chat = fs.readFileSync(new URL("../scripts/encounter-engine/chat.js", import.meta.url), "utf8");
const controls = fs.readFileSync(new URL("../scripts/gm-screen/encounter-controls.js", import.meta.url), "utf8");
const history = fs.readFileSync(new URL("../scripts/gm-screen/encounter-history.js", import.meta.url), "utf8");
const template = fs.readFileSync(new URL("../templates/gm-screen.hbs", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));

test("shared encounter staging persists deployment summary to the source ChatMessage", () => {
  assert.match(chat, /export async function stageEncounterMessage\(message\)/);
  assert.match(chat, /openEncounterStagingDialog\(data/);
  assert.match(chat, /nextData\.staging = deepClone\(deployment\.summary\)/);
  assert.match(chat, /await updateEncounterMessage\(message, nextData\)/);
  assert.match(chat, /action === "stage"\) await stageEncounterMessage\(message\)/);
});

test("shared encounter reveal and reroll helpers remain canonical message operations", () => {
  assert.match(chat, /export async function revealEncounterMessage/);
  assert.match(chat, /export async function rerollEncounterField/);
  assert.match(chat, /export async function rerollEntireEncounter/);
  assert.match(chat, /export async function updateEncounterMessage/);

  assert.match(controls, /revealEncounterMessage\(message\)/);
  assert.match(controls, /rerollEncounterField\(message/);
  assert.match(controls, /rerollEntireEncounter\(message\)/);
  assert.match(controls, /stageEncounterMessage\(message\)/);
});

test("GM Screen encounter actions resolve the exact rendered source message", () => {
  const messages = new Map([
    ["one", { id: "one" }],
    ["two", { id: "two" }],
  ]);

  assert.equal(encounterMessage("two", messages)?.id, "two");
  assert.equal(encounterMessage("missing", messages), null);
  assert.match(controls, /button\?\.dataset\?\.messageId/);
  assert.match(controls, /context\?\.latestEncounter\?\.messageId/);
});

test("Session Log inspector exposes canonical encounter fields and actions without Profile", () => {
  for (const field of ["number", "encounter", "distance", "activity", "reaction", "treasure"]) {
    assert.match(history, new RegExp(`fieldRow\\([^\\n]*["']${field}["']`));
  }

  assert.match(history, /data\?\.awareness\?\.label/);
  assert.match(history, /data\?\.intent/);
  assert.match(history, /data\?\.treasure\?\.label/);
  assert.match(history, /data\?\.morale\?\.label/);
  assert.match(history, /data\.tableName/);
  assert.doesNotMatch(history, /profileName|Active Profile/);
  assert.match(history, /data-mk-encounter-action="reveal"/);
  assert.match(history, /data-mk-encounter-action="reroll-all"/);
  assert.match(history, /data-mk-encounter-action="stage"/);
  assert.match(template, /data-workspace-panel="session-log"/);
  assert.doesNotMatch(template, /data-workspace-panel="encounter"/);
});

test("GM Screen staging shortcuts no longer use the legacy direct Application action", () => {
  assert.doesNotMatch(template, /data-action="stageLatestEncounter"/);
  assert.ok(manifest.esmodules.includes("scripts/gm-screen/encounter-controls.js"));
  assert.ok(manifest.styles.includes("styles/gm-screen-encounter-controls.css"));
});
