import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(ROOT, "scripts/group-sheet/time.js"), "utf8");

test("Group Time is fully isolated from standalone Time Passes", () => {
  assert.doesNotMatch(source, /timePasses|Time Passes/);
  assert.doesNotMatch(source, /presentation\s*=/);
  assert.doesNotMatch(source, /transition\.presentation/);
});
