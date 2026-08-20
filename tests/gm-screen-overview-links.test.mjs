import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  OVERVIEW_LINKS_FLAG,
  dragDataUuid,
  getOverviewLinkUuids,
  normalizeOverviewLinkUuids,
  overviewLinkHtml,
  overviewShellHtml,
  overviewSummaryHtml,
  setOverviewLinkUuids,
} from "../scripts/gm-screen/overview-links.js";

const runtime = fs.readFileSync(new URL("../scripts/gm-screen/overview-links.js", import.meta.url), "utf8");
const stylesheet = fs.readFileSync(new URL("../styles/gm-screen-overview.css", import.meta.url), "utf8");
const refactorStylesheet = fs.readFileSync(new URL("../styles/gm-screen-workspace-refactor.css", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));

test("Overview shortcut UUIDs are normalized and deduplicated", () => {
  assert.deepEqual(normalizeOverviewLinkUuids([
    "Actor.a",
    " Actor.a ",
    "JournalEntry.j",
    "",
    null,
  ]), ["Actor.a", "JournalEntry.j"]);
});

test("Overview shortcuts are stored as per-user presentation flags", async () => {
  const writes = [];
  const user = {
    getFlag(moduleId, key) {
      assert.equal(moduleId, "mk-shadowdark");
      assert.equal(key, OVERVIEW_LINKS_FLAG);
      return ["Actor.a", "Actor.a", "JournalEntry.j"];
    },
    async setFlag(moduleId, key, value) {
      writes.push({ moduleId, key, value });
    },
  };

  assert.equal(OVERVIEW_LINKS_FLAG, "gmScreenOverviewLinks");
  assert.deepEqual(getOverviewLinkUuids(user), ["Actor.a", "JournalEntry.j"]);
  assert.deepEqual(await setOverviewLinkUuids(["Actor.a", "Actor.a", "Item.i"], user), ["Actor.a", "Item.i"]);
  assert.deepEqual(writes, [{
    moduleId: "mk-shadowdark",
    key: "gmScreenOverviewLinks",
    value: ["Actor.a", "Item.i"],
  }]);
});

test("Foundry document drop data resolves by UUID", () => {
  assert.equal(dragDataUuid({ uuid: "Actor.a" }), "Actor.a");
  assert.equal(dragDataUuid({ documentUuid: "JournalEntry.j" }), "JournalEntry.j");
  assert.equal(dragDataUuid({ data: { uuid: "Actor.a.Item.i" } }), "Actor.a.Item.i");
  assert.equal(dragDataUuid({ type: "Actor" }), "");
});

test("Overview is a compact home dashboard above the document pin canvas", () => {
  const html = overviewShellHtml({
    procedure: "Exploration",
    elapsed: "18m",
    light: "2 sources · 1 carrier",
    encounter: "1 due",
    session: "14 Frostwane, 10 PM",
  });
  assert.match(html, /data-mk-overview-summary/);
  assert.match(html, />Procedure</);
  assert.match(html, />Light</);
  assert.match(html, />Encounter</);
  assert.match(html, />Session</);
  assert.match(html, /Pinned Documents/);
  assert.match(html, /data-mk-overview-shortcuts/);
  assert.match(html, /Drop Journals, Actors, Items, RollTables/);
  assert.doesNotMatch(html, /Scene Context|Combat \/ Morale|Resting/);
});

test("Overview summary exposes a visible no-light warning state", () => {
  const html = overviewSummaryHtml({
    procedure: "Exploration",
    elapsed: "6m",
    light: "NO LIGHT",
    encounter: "Turn 3",
    session: "Not started",
  });
  assert.match(html, /class="is-warning"/);
  assert.match(html, /NO LIGHT/);
});

test("Overview shortcut cards open the source document and expose a separate remove control", () => {
  const html = overviewLinkHtml({
    uuid: "Actor.hero",
    document: {
      documentName: "Actor",
      name: "Hero",
      img: "hero.webp",
    },
  });
  assert.match(html, /data-mk-overview-open="Actor\.hero"/);
  assert.match(html, /data-mk-overview-remove="Actor\.hero"/);
  assert.match(html, /Hero/);
  assert.match(html, /hero\.webp/);
});

test("Overview derives home metrics from canonical Group state rather than persisted duplicates", () => {
  assert.match(runtime, /getGroupProcedureState/);
  assert.match(runtime, /getGroupElapsedTime/);
  assert.match(runtime, /getExplorationEncounterState/);
  assert.match(runtime, /buildPartyView/);
  assert.match(runtime, /gmScreenSession/);
  assert.match(runtime, /formatExplorationNextCheck/);
  assert.doesNotMatch(runtime, /setFlag\(MODULE_ID, SESSION_FLAG/);
});

test("Overview uses Foundry drag-data and UUID document APIs without full GM Screen rerenders", () => {
  assert.match(runtime, /getDragEventData/);
  assert.match(runtime, /foundry\?\.utils\?\.fromUuid|globalThis\.fromUuid/);
  assert.match(runtime, /user\.getFlag\?\.\(MODULE_ID, OVERVIEW_LINKS_FLAG\)/);
  assert.match(runtime, /user\.setFlag\(MODULE_ID, OVERVIEW_LINKS_FLAG, normalized\)/);
  assert.match(runtime, /"dragover"/);
  assert.match(runtime, /"drop"/);
  assert.match(runtime, /openOverviewDocument/);
  assert.doesNotMatch(runtime, /application\?\.render|application\.render/);
  assert.doesNotMatch(runtime, /updateActor|updateScene|updateCombat|updateToken/);
});

test("Overview shortcut and summary styling are loaded", () => {
  assert.match(stylesheet, /\.mk-gm-overview-shortcuts/);
  assert.match(stylesheet, /\.mk-gm-overview-link-list/);
  assert.match(stylesheet, /\.mk-gm-overview-link-open/);
  assert.match(stylesheet, /\.mk-gm-overview-link-remove/);
  assert.match(refactorStylesheet, /\.mk-gm-overview-summary/);
  assert.ok(manifest.esmodules.includes("scripts/gm-screen/overview-links.js"));
  assert.ok(manifest.styles.includes("styles/gm-screen-overview.css"));
});