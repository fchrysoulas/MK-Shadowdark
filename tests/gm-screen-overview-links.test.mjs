import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  OVERVIEW_LINKS_FLAG,
  OVERVIEW_TOOL_DEFINITIONS,
  dragEventData,
  dragDataUuid,
  getOverviewLinkUuids,
  normalizeOverviewLinkUuids,
  overviewLinkHtml,
  overviewShellHtml,
  overviewToolForUuid,
  overviewToolUuid,
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

test("Overview drop parsing accepts raw URI-list UUIDs when Foundry returns no JSON", () => {
  const event = {
    dataTransfer: {
      getData(type) {
        return type === "text/uri-list" ? "mk-shadowdark.gm-screen-tool:encounters" : "";
      },
    },
  };
  assert.equal(dragDataUuid(dragEventData(event)), "mk-shadowdark.gm-screen-tool:encounters");
});

test("GM Screen tool shortcuts use stable non-document identifiers", () => {
  assert.deepEqual(OVERVIEW_TOOL_DEFINITIONS.map(tool => tool.id), ["encounters", "npc-generator", "tavern-generator"]);
  const uuid = overviewToolUuid("npc-generator");
  assert.equal(uuid, "mk-shadowdark.gm-screen-tool:npc-generator");
  assert.equal(overviewToolForUuid(uuid)?.action, "generate-npc");
  assert.equal(overviewToolForUuid(overviewToolUuid("tavern-generator"))?.action, "generate-tavern");
});

test("Overview is a document pin canvas without summary info panels", () => {
  const html = overviewShellHtml();
  assert.doesNotMatch(html, /data-mk-overview-summary|>Procedure<|>Light<|>Encounter<|>Session</);
  assert.match(html, /Pinned Documents/);
  assert.match(html, /data-mk-overview-shortcuts/);
  assert.match(html, /Pinned Documents &amp; Actions/);
  assert.doesNotMatch(html, /Scene Context|Combat \/ Morale|Resting/);
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

test("Overview renders GM Screen tool shortcuts as available cards", () => {
  const html = overviewLinkHtml({ uuid: overviewToolUuid("encounters"), document: null });
  assert.match(html, /data-mk-overview-open="mk-shadowdark\.gm-screen-tool:encounters"/);
  assert.match(html, /<strong>Encounters<\/strong>/);
  assert.match(html, /<small>GM Screen<\/small>/);
  assert.doesNotMatch(html, /disabled/);
});

test("Overview uses Foundry drag-data and UUID document APIs without full GM Screen rerenders", () => {
  assert.match(runtime, /getDragEventData/);
  assert.match(runtime, /foundry\?\.utils\?\.fromUuid|globalThis\.fromUuid/);
  assert.match(runtime, /user\.getFlag\?\.\(MODULE_ID, OVERVIEW_LINKS_FLAG\)/);
  assert.match(runtime, /user\.setFlag\(MODULE_ID, OVERVIEW_LINKS_FLAG, normalized\)/);
  assert.match(runtime, /"dragover"/);
  assert.match(runtime, /dropEffect = "copy"/);
  assert.match(runtime, /"drop"/);
  assert.match(runtime, /openOverviewDocument/);
  assert.match(runtime, /overviewToolForUuid/);
  assert.match(runtime, /executeOverviewTool/);
  assert.match(runtime, /rollEncounterZone/);
  assert.match(runtime, /createSourceDrivenNpc/);
  assert.doesNotMatch(runtime, /application\?\.render|application\.render/);
  assert.doesNotMatch(runtime, /updateActor|updateScene|updateCombat|updateToken/);
});

test("Overview does not own NPC creation controls", () => {
  assert.doesNotMatch(runtime, /npcSourceStatus|data-mk-overview-create-npc|Create NPC/);
  assert.doesNotMatch(stylesheet, /mk-gm-overview-create-npc|mk-gm-overview-action-tooltip/);
});

test("Overview shortcut runtime and styling are loaded for the production surface", () => {
  assert.match(stylesheet, /\.mk-gm-overview-shortcuts/);
  assert.match(stylesheet, /\.mk-gm-overview-link-list/);
  assert.match(stylesheet, /\.mk-gm-overview-link-open/);
  assert.match(stylesheet, /\.mk-gm-overview-link-remove/);
  assert.doesNotMatch(refactorStylesheet, /\.mk-gm-overview-summary/);
  assert.equal(manifest.esmodules.includes("scripts/gm-screen/overview-links.js"), true);
  assert.equal(manifest.esmodules.includes("scripts/gm-screen/npc-source-tables.js"), true);
  assert.equal(manifest.esmodules.includes("scripts/gm-screen/npc-generator.js"), true);
  assert.equal(manifest.styles.includes("styles/gm-screen-overview.css"), true);
});
