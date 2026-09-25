import assert from "node:assert/strict";
import test from "node:test";

import {
  PINNED_DOCUMENTS_FLAG,
  PINNED_DOCUMENTS_REFRESH_HOOK,
  getPinnedDocumentUuids,
  pinDocument,
} from "../scripts/gm-screen/pinned-documents.js";

test("generated documents are pinned once and refresh the GM Screen", async () => {
  const previousGame = globalThis.game;
  const previousHooks = globalThis.Hooks;
  const calls = [];
  let stored = ["Actor.existing"];
  const user = {
    isGM: true,
    getFlag(moduleId, key) {
      assert.equal(moduleId, "mk-shadowdark");
      assert.equal(key, PINNED_DOCUMENTS_FLAG);
      return stored;
    },
    async setFlag(moduleId, key, value) {
      calls.push({ type: "setFlag", moduleId, key, value });
      stored = value;
    },
  };

  globalThis.game = { user };
  globalThis.Hooks = {
    callAll(hook, uuid, document, hookUser) {
      calls.push({ type: "hook", hook, uuid, document, user: hookUser });
    },
  };

  try {
    assert.deepEqual(getPinnedDocumentUuids(user), ["Actor.existing"]);
    const journal = { uuid: "JournalEntry.generated" };
    assert.deepEqual(await pinDocument(journal, user), ["Actor.existing", journal.uuid]);
    assert.deepEqual(await pinDocument(journal, user), ["Actor.existing", journal.uuid]);
  } finally {
    globalThis.game = previousGame;
    globalThis.Hooks = previousHooks;
  }

  assert.equal(calls.filter(call => call.type === "setFlag").length, 1);
  assert.equal(calls.filter(call => call.type === "hook").length, 1);
  assert.equal(calls.find(call => call.type === "hook").hook, PINNED_DOCUMENTS_REFRESH_HOOK);
  assert.deepEqual(stored, ["Actor.existing", "JournalEntry.generated"]);
});
