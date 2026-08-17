import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  activeMemberUuidSet,
  documentActor,
  encounterMessageBelongsToGroup,
} from "../scripts/gm-screen/live-refresh.js";

const runtime = fs.readFileSync(new URL("../scripts/gm-screen/live-refresh.js", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));

test("GM Screen live refresh resolves Actor ownership for embedded documents", () => {
  const actor = { documentName: "Actor", uuid: "Actor.hero" };
  assert.equal(documentActor({ parent: actor }), actor);
  assert.equal(documentActor({ actor }), actor);
  assert.equal(documentActor({ parent: { actor } }), actor);
  assert.equal(documentActor({ parent: { documentName: "Scene" } }), null);
});

test("GM Screen live refresh filters embedded changes to active Group members", () => {
  const groupActor = {
    flags: {
      "mk-shadowdark": {
        group: {
          members: ["Actor.hero", "Actor.reserve"],
          activeMembers: ["Actor.hero"],
        },
      },
    },
    getFlag(scope, key) {
      return this.flags?.[scope]?.[key];
    },
  };

  const active = activeMemberUuidSet(groupActor);
  assert.equal(active.has("Actor.hero"), true);
  assert.equal(active.has("Actor.reserve"), false);
});

test("GM Screen live refresh filters encounter messages by selected Group", () => {
  const group = { uuid: "Actor.group-a" };
  const matching = {
    getFlag: () => ({ groupContext: { groupActorUuid: "Actor.group-a" } }),
  };
  const other = {
    getFlag: () => ({ groupContext: { groupActorUuid: "Actor.group-b" } }),
  };

  assert.equal(encounterMessageBelongsToGroup(matching, group), true);
  assert.equal(encounterMessageBelongsToGroup(other, group), false);
});

test("GM Screen live refresh covers relevant Item, ActiveEffect, and ChatMessage hooks", () => {
  for (const hook of [
    "createItem",
    "updateItem",
    "deleteItem",
    "createActiveEffect",
    "updateActiveEffect",
    "deleteActiveEffect",
    "createChatMessage",
    "updateChatMessage",
    "deleteChatMessage",
  ]) {
    assert.match(runtime, new RegExp(`"${hook}"`));
  }
  assert.match(runtime, /LIVE_REFRESH_DELAY_MS = 40/);
  assert.match(runtime, /scheduleGmScreenRefresh/);
});

test("GM Screen live refresh module loads after the main GM Screen runtime", () => {
  const gmIndex = manifest.esmodules.indexOf("scripts/gm-screen/gm-screen.js");
  const refreshIndex = manifest.esmodules.indexOf("scripts/gm-screen/live-refresh.js");
  assert.ok(gmIndex >= 0);
  assert.ok(refreshIndex > gmIndex);
});
