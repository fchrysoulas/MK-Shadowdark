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
  setOverviewLinkUuids,
} from "../scripts/gm-screen/overview-links.js";

const runtime = fs.readFileSync(new URL("../scripts/gm-screen/overview-links.js", import.meta.url), "utf8");
const stylesheet = fs.readFileSync(new URL("../styles/gm-screen-overview.css", import.meta.url), "utf8");
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

test("Overview shell is a document drop canvas, not a built-in status dashboard", () => {
  const html = overviewShellHtml();
  assert.match(html, /data-mk-overview-shortcuts/);
  assert.match(html, /Drop Journals, Actors, Items, RollTables/);
  assert.doesNotMatch(html, /Scene Context/);
  assert.doesNotMatch(html, /Encounter Pressure/);
  assert.doesNotMatch(html, /Combat \/ Morale/);
  assert.doesNotMatch(html, /Resting/);
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

test("Overview shortcut styling and runtime are loaded", () => {
  assert.match(stylesheet, /\.mk-gm-overview-shortcuts/);
  assert.match(stylesheet, /\.mk-gm-overview-link-list/);
  assert.match(stylesheet, /\.mk-gm-overview-link-open/);
  assert.match(stylesheet, /\.mk-gm-overview-link-remove/);
  assert.ok(manifest.esmodules.includes("scripts/gm-screen/overview-links.js"));
  assert.ok(manifest.styles.includes("styles/gm-screen-overview.css"));
});