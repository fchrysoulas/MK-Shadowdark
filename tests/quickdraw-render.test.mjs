import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../scripts/quickdraw/quickdraw-icons.js", import.meta.url);

test("Quickdraw relies on the manifest for its stylesheet", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.doesNotMatch(source, /ensureStylesheet/);
  assert.doesNotMatch(source, /STYLESHEET_PATH/);
  assert.doesNotMatch(source, /createElement\(["']link["']\)/);
});

test("Quickdraw collects inventory rows once per logical render", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const processBlock = source.match(/function processSheet\(app, html\) \{([\s\S]*?)\n  \}\n\n  function onRender/);

  assert.ok(processBlock, "processSheet block must exist");
  const calls = processBlock[1].match(/getInventoryRows\(html\)/g) ?? [];
  assert.equal(calls.length, 1);
  assert.match(processBlock[1], /refreshQuickdrawRowState\(app, rows\)/);
  assert.match(processBlock[1], /injectQuickdrawToggles\(app, html, rows\)/);
  assert.match(processBlock[1], /sortInventoryGroups\(html, app, rows\)/);
});

test("Quickdraw sorting skips DOM mutation when order is already correct", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /const orderChanged = sorted\.some/);
  assert.match(source, /if \(!orderChanged\) continue;/);
});
