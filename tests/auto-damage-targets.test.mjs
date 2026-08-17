import test from "node:test";
import assert from "node:assert/strict";

import {
  extractShadowdarkTargetUuids,
  resolveTargetDocuments,
  snapshotTargetUuids,
  storedTargetUuids,
  uniqueUuids
} from "../scripts/auto-damage/auto-damage-targets.js";

test("Shadowdark roll target is preferred over live user targets", () => {
  const message = {
    rollConfig: { targetUuid: "Scene.scene.Token.native" }
  };
  const author = {
    targets: new Set([
      { document: { uuid: "Scene.scene.Token.live-a" } },
      { document: { uuid: "Scene.scene.Token.live-b" } }
    ])
  };

  assert.deepEqual(
    snapshotTargetUuids(message, author),
    ["Scene.scene.Token.native"]
  );
});

test("persisted Shadowdark roll flags are supported", () => {
  const message = {
    flags: {
      shadowdark: {
        rollConfig: { targetUuid: "Scene.scene.Token.flagged" }
      }
    }
  };

  assert.deepEqual(
    extractShadowdarkTargetUuids(message),
    ["Scene.scene.Token.flagged"]
  );
});

test("live targets are snapshotted as UUIDs for multi-target fallback", () => {
  const targetA = { document: { uuid: "Scene.scene.Token.a" } };
  const targetB = { document: { uuid: "Scene.scene.Token.b" } };
  const author = { targets: new Set([targetA, targetB]) };

  const snapshot = snapshotTargetUuids({}, author);
  author.targets.clear();
  author.targets.add({ document: { uuid: "Scene.scene.Token.c" } });

  assert.deepEqual(snapshot, ["Scene.scene.Token.a", "Scene.scene.Token.b"]);
});

test("stored target snapshots preserve an explicitly empty target set", () => {
  const message = {
    getFlag: () => []
  };

  assert.deepEqual(storedTargetUuids(message), []);
});

test("UUID normalization removes blanks and duplicates without reordering", () => {
  assert.deepEqual(
    uniqueUuids(["Token.a", "", "Token.a", " Token.b ", null]),
    ["Token.a", "Token.b"]
  );
});

test("target resolution keeps valid documents when another UUID fails", async () => {
  const resolved = await resolveTargetDocuments(
    ["Token.a", "Token.missing", "Token.b"],
    async uuid => {
      if (uuid === "Token.missing") throw new Error("missing");
      return { uuid };
    }
  );

  assert.deepEqual(resolved, [{ uuid: "Token.a" }, { uuid: "Token.b" }]);
});
