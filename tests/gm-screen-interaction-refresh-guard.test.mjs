import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));
const runtime = fs.readFileSync(new URL("../scripts/gm-screen/gm-screen.js", import.meta.url), "utf8");
const template = fs.readFileSync(new URL("../templates/gm-screen.hbs", import.meta.url), "utf8");

test("GM Screen no longer loads the interaction refresh guard", () => {
  assert.ok(!manifest.esmodules.includes("scripts/gm-screen/interaction-refresh-guard.js"));
});

test("GM Screen has no generic refresh action or refresh API", () => {
  assert.doesNotMatch(runtime, /actionRefresh/);
  assert.doesNotMatch(runtime, /refreshGmScreen/);
  assert.doesNotMatch(runtime, /registerRefreshHooks/);
  assert.doesNotMatch(runtime, /refresh:\s*refreshGmScreen/);
  assert.doesNotMatch(template, /data-action="refresh"/);
  assert.doesNotMatch(template, /Refresh GM Screen/);
});

test("explicit GM Screen actions may rerender only after the user invokes them", () => {
  assert.match(runtime, /actionWorkspace/);
  assert.match(runtime, /actionSelectGroup/);
  assert.match(runtime, /actionProcessDueEncounters/);
  assert.match(runtime, /this\.render\(\{ force: true \}\)/);
});