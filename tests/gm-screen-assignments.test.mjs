import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildAssignmentsView } from "../scripts/gm-screen/view-model.js";

const controls = fs.readFileSync(new URL("../scripts/gm-screen/assignment-controls.js", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));

function makeGroupActor() {
  const flags = {
    "mk-shadowdark": {
      group: {
        members: ["Actor.a", "Actor.b", "Actor.c"],
        activeMembers: ["Actor.a", "Actor.b", "Actor.c"],
        assignments: {
          exploration: {
            order: ["Actor.b", "Actor.a", "Actor.c"],
            positions: {
              front: ["Actor.a"],
              middle: ["Actor.b"],
              rear: ["Actor.c"],
            },
            roles: {
              scout: "Actor.b",
              lightBearer: "Actor.c",
            },
          },
          camping: {
            watches: [
              { id: "first", label: "First Watch", actorUuids: ["Actor.a", "Actor.b"] },
            ],
          },
        },
      },
    },
  };

  return {
    flags,
    getFlag(scope, key) {
      return flags?.[scope]?.[key];
    },
  };
}

test("GM Screen assignment view preserves single-UUID role shape", () => {
  const view = buildAssignmentsView(makeGroupActor());

  assert.deepEqual(view.order, ["Actor.b", "Actor.a", "Actor.c"]);
  assert.deepEqual(view.front, ["Actor.a"]);
  assert.deepEqual(view.middle, ["Actor.b"]);
  assert.deepEqual(view.rear, ["Actor.c"]);
  assert.equal(view.scout, "Actor.b");
  assert.equal(view.lightBearer, "Actor.c");
  assert.equal(Array.isArray(view.scout), false);
  assert.equal(Array.isArray(view.lightBearer), false);
  assert.deepEqual(view.watches, [{
    id: "first",
    label: "First Watch",
    index: 1,
    actorUuids: ["Actor.a", "Actor.b"],
  }]);
});

test("GM Screen assignment controls use canonical assignment setters", () => {
  assert.match(controls, /setMarchingOrder\(/);
  assert.match(controls, /setPositionMembers\(group, "front"/);
  assert.match(controls, /setPositionMembers\(group, "middle"/);
  assert.match(controls, /setPositionMembers\(group, "rear"/);
  assert.match(controls, /setExplorationRole\(group, "scout"/);
  assert.match(controls, /setExplorationRole\(group, "lightBearer"/);
  assert.match(controls, /setCampWatches\(/);
});

test("GM Screen assignment controls are injected through the ApplicationV2 render hook", () => {
  assert.match(controls, /renderApplicationV2/);
  assert.match(controls, /data-mk-gm-exploration-assignments/);
  assert.match(controls, /Edit Marching Order & Roles/);
  assert.match(controls, /data-mk-gm-camp-watches/);
  assert.match(controls, /Edit Watches/);
});

test("GM Screen assignment controls load after the core GM Screen modules", () => {
  const gmIndex = manifest.esmodules.indexOf("scripts/gm-screen/gm-screen.js");
  const refreshIndex = manifest.esmodules.indexOf("scripts/gm-screen/live-refresh.js");
  const assignmentIndex = manifest.esmodules.indexOf("scripts/gm-screen/assignment-controls.js");

  assert.ok(gmIndex >= 0);
  assert.ok(refreshIndex > gmIndex);
  assert.ok(assignmentIndex > refreshIndex);
});
