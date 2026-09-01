import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildEncounterHistory,
  findRecentEncounterMessages,
  normalizeSessionState,
  renderEncounterInspector,
  renderSessionControls,
  sessionHistoryBoundary,
} from "../scripts/gm-screen/encounter-history.js";

const runtime = fs.readFileSync(new URL("../scripts/gm-screen/encounter-history.js", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));

function message(id, timestamp, groupActorUuid, label, staged = false) {
  const data = {
    groupContext: { groupActorUuid },
    generatedAt: timestamp,
    encounter: { label, count: 1 },
    terrain: "Caves",
    dangerLabel: "Risky",
    period: "night",
    disposition: "neutral",
    distance: { label: "Near" },
    activity: { label: "Searching" },
    awareness: { label: "Aware", optional: false },
    reaction: { label: "Neutral" },
    treasure: { label: "No treasure" },
    morale: { label: "DC 15 WIS" },
    staging: staged ? { deployed: true, count: 1, sceneName: "Cave", formation: "cluster" } : undefined,
  };
  return {
    id,
    timestamp,
    getFlag: () => data,
  };
}

test("Encounter history derives only the selected Group's newest canonical chat messages", () => {
  const group = { uuid: "Actor.group-a" };
  const messages = [
    message("old", 100, "Actor.group-a", "Old Beast"),
    message("other", 400, "Actor.group-b", "Other Group"),
    message("new", 300, "Actor.group-a", "New Beast", true),
    message("middle", 200, "Actor.group-a", "Middle Beast"),
  ];

  const recent = findRecentEncounterMessages(group, messages, 2);
  assert.deepEqual(recent.map(entry => entry.message.id), ["new", "middle"]);
});

test("session boundary filters older encounters before applying the history limit", () => {
  const group = { uuid: "Actor.group-a" };
  const messages = [
    message("old", 100, "Actor.group-a", "Old Beast"),
    message("boundary", 250, "Actor.group-a", "Boundary Beast"),
    message("newer", 300, "Actor.group-a", "Newer Beast"),
    message("newest", 400, "Actor.group-a", "Newest Beast"),
  ];

  const recent = findRecentEncounterMessages(group, messages, 2, { startedAt: 250 });
  assert.deepEqual(recent.map(entry => entry.message.id), ["newest", "newer"]);
});

test("Session Log excludes encounters before Start Session and keeps newer canonical chat records", () => {
  const group = { uuid: "Actor.group-a" };
  const messages = [
    message("before", 100, "Actor.group-a", "Before Session"),
    message("after-a", 300, "Actor.group-a", "After Session A"),
    message("after-b", 400, "Actor.group-a", "After Session B"),
  ];
  const session = normalizeSessionState({ startLabel: "Night 2", startedAt: 250, worldTime: 0 });
  const history = buildEncounterHistory(group, { messages, session });

  assert.equal(sessionHistoryBoundary(session), 250);
  assert.deepEqual(history.entries.map(entry => entry.messageId), ["after-b", "after-a"]);
  assert.equal(history.sessionStartedAt, 250);
  assert.equal(history.selectedMessageId, "after-b");
  assert.doesNotMatch(renderEncounterInspector(history), /Before Session/);
  assert.match(renderEncounterInspector(history), /Current Session Encounters/);
});

test("starting a later session naturally excludes encounters from the earlier session", () => {
  const group = { uuid: "Actor.group-a" };
  const messages = [
    message("session-one", 300, "Actor.group-a", "Session One Beast"),
    message("session-two", 500, "Actor.group-a", "Session Two Beast"),
  ];

  const first = buildEncounterHistory(group, {
    messages,
    session: { startedAt: 250 },
  });
  assert.deepEqual(first.entries.map(entry => entry.messageId), ["session-two", "session-one"]);

  const second = buildEncounterHistory(group, {
    messages,
    selectedMessageId: "session-one",
    session: { startedAt: 450 },
  });
  assert.deepEqual(second.entries.map(entry => entry.messageId), ["session-two"]);
  assert.equal(second.selectedMessageId, "session-two");
});

test("Encounter history defaults to Latest and can select a historical source message without a session boundary", () => {
  const group = { uuid: "Actor.group-a" };
  const messages = [
    message("new", 300, "Actor.group-a", "New Beast"),
    message("middle", 200, "Actor.group-a", "Middle Beast"),
    message("old", 100, "Actor.group-a", "Old Beast"),
  ];

  const latest = buildEncounterHistory(group, { messages });
  assert.equal(latest.latestMessageId, "new");
  assert.equal(latest.selectedMessageId, "new");
  assert.equal(latest.selected.label, "New Beast");

  const historical = buildEncounterHistory(group, { messages, selectedMessageId: "old" });
  assert.equal(historical.selectedMessageId, "old");
  assert.equal(historical.selected.label, "Old Beast");
  assert.equal(historical.selected.latest, false);
});

test("Encounter history falls back to Latest when the selected source message disappears or predates the session", () => {
  const group = { uuid: "Actor.group-a" };
  const messages = [
    message("old", 100, "Actor.group-a", "Old Beast"),
    message("new", 300, "Actor.group-a", "New Beast"),
  ];
  const history = buildEncounterHistory(group, {
    messages,
    selectedMessageId: "old",
    session: { startedAt: 250 },
  });
  assert.equal(history.selectedMessageId, "new");
});

test("Historical encounter inspector actions target the selected source message ID", () => {
  const group = { uuid: "Actor.group-a" };
  const messages = [
    message("new", 300, "Actor.group-a", "New Beast"),
    message("old", 100, "Actor.group-a", "Old Beast"),
  ];
  const history = buildEncounterHistory(group, { messages, selectedMessageId: "old" });
  const html = renderEncounterInspector(history);

  assert.match(html, /Selected Group Encounter/);
  assert.match(html, /data-message-id="old"/);
  assert.match(html, /Return to Latest/);
  assert.match(html, /data-mk-select-encounter="new"/);
});

test("empty current session clearly says no current-session encounter exists", () => {
  const group = { uuid: "Actor.group-a" };
  const history = buildEncounterHistory(group, {
    messages: [message("old", 100, "Actor.group-a", "Old Beast")],
    session: { startedAt: 200 },
  });
  assert.equal(history.entries.length, 0);
  assert.match(renderEncounterInspector(history), /current session yet/);
});

test("Session Log exposes a free-text start field, Start Session, and Reset Timer", () => {
  const state = normalizeSessionState({ startLabel: "14 Frostwane, 10 PM", startedAt: 123, worldTime: 456 });
  const html = renderSessionControls(state, {
    procedure: "exploration",
    elapsedLabel: "18m",
    hasGroup: true,
  });
  assert.match(html, /Starting date and time/);
  assert.match(html, /14 Frostwane, 10 PM/);
  assert.match(html, /Start Session/);
  assert.match(html, /Reset Timer/);
  assert.match(html, /Exploration/);
  assert.match(html, /18m/);
});

test("Start Session stores text metadata, establishes a timestamp boundary, clears historical selection, and resets timer", () => {
  assert.match(runtime, /SESSION_FLAG = "gmScreenSession"/);
  assert.match(runtime, /group\.setFlag\(MODULE_ID, SESSION_FLAG/);
  assert.match(runtime, /startedAt: Date\.now\(\)/);
  assert.match(runtime, /application\.encounterMessageId = ""/);
  assert.match(runtime, /getGroupProcedureState\(group\)/);
  assert.match(runtime, /resetGroupTime\(group, procedure/);
  assert.match(runtime, /reason: "gm-screen-session-start"/);
  assert.match(runtime, /worldTime: Number\(globalThis\.game\?\.time\?\.worldTime/);
  assert.match(runtime, /sessionHistoryBoundary/);
  assert.match(runtime, /startedAt: sessionStartedAt/);
});

test("Reset Timer is a Session Log action rather than an Elapsed popup action", () => {
  assert.match(runtime, /resetSessionTimer/);
  assert.match(runtime, /Reset .* Timer/);
  assert.match(runtime, /gm-screen-session-log-reset/);
});

test("Encounter history still reconstructs from ChatMessages while only Session metadata is persisted", () => {
  assert.match(runtime, /globalThis\.game\?\.messages/);
  assert.match(runtime, /application\.encounterMessageId/);
  assert.match(runtime, /setSessionState/);
  assert.doesNotMatch(runtime, /localStorage/);
  assert.doesNotMatch(runtime, /recentEvents/);
  assert.match(runtime, /ENCOUNTER_HISTORY_LIMIT = 8/);
});

test("Encounter history decorator applies current Group session metadata to history reconstruction", () => {
  assert.match(runtime, /const session = getSessionState\(group\)/);
  assert.match(runtime, /buildEncounterHistory\(group, \{[\s\S]*session,/);
});

test("Encounter history binds canonical encounter actions after replacing the workspace", () => {
  assert.match(runtime, /executeEncounterAction\(application, button/);
  assert.match(runtime, /bindEncounterActions\(application, workspace\)/);
  assert.match(runtime, /bindHistorySelection\(application, workspace\)/);
  assert.match(runtime, /bindSessionControls\(application, workspace, group\)/);
});

test("Encounter history runtime and style are excluded while the GM Screen is disabled", () => {
  assert.equal(manifest.esmodules.includes("scripts/gm-screen/encounter-controls.js"), false);
  assert.equal(manifest.esmodules.includes("scripts/gm-screen/encounter-history.js"), false);
  assert.equal(manifest.styles.includes("styles/gm-screen-encounter-history.css"), false);
});
