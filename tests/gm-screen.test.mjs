import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtimeUrl = new URL("../scripts/gm-screen/gm-screen.js", import.meta.url);
const viewModelUrl = new URL("../scripts/gm-screen/view-model.js", import.meta.url);
const templateUrl = new URL("../templates/gm-screen.hbs", import.meta.url);
const styleUrl = new URL("../styles/gm-screen.css", import.meta.url);

test("production GM Screen files exist", () => {
  assert.equal(fs.existsSync(runtimeUrl), true);
  assert.equal(fs.existsSync(viewModelUrl), true);
  assert.equal(fs.existsSync(templateUrl), true);
  assert.equal(fs.existsSync(styleUrl), true);
});
