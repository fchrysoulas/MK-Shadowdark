import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../scripts/gm-screen/workspace-refactor.js", import.meta.url),
  "utf8",
);

test("legacy Profile control stays invisible without dropping its submitted value", () => {
  assert.match(runtime, /input\.type = "hidden"/);
  assert.match(runtime, /input\.hidden = true/);
  assert.match(runtime, /form\?\.append\?\.\(input\)/);
  assert.match(runtime, /group\?\.remove\?\.\(\)/);
});

test("both legacy Profile settings remain hidden compatibility storage", () => {
  assert.match(runtime, /"encounterEngineDefaultProfile", "encounterEngineProfiles"/);
  assert.match(runtime, /definition\.config = false/);
  assert.doesNotMatch(runtime, /data-workspace-panel/);
});
