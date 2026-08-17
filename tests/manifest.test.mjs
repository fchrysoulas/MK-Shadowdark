import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";

async function loadManifest() {
  return JSON.parse(await readFile(resolve("module.json"), "utf8"));
}

test("module manifest keeps the supported platform baseline", async () => {
  const manifest = await loadManifest();
  assert.equal(manifest.id, "mk-shadowdark");
  assert.equal(String(manifest.compatibility?.minimum), "13");

  const shadowdark = manifest.relationships?.systems?.find(system => system.id === "shadowdark");
  assert.ok(shadowdark, "Shadowdark system relationship is required");
  assert.equal(String(shadowdark.compatibility?.minimum), "4.0.0");
});

test("every manifest-loaded runtime path exists", async () => {
  const manifest = await loadManifest();
  const paths = [
    ...(manifest.esmodules ?? []),
    ...(manifest.styles ?? []),
    ...(manifest.languages ?? []).map(language => language.path)
  ];

  assert.ok(paths.length > 0, "module.json should reference runtime files");
  assert.equal(new Set(paths).size, paths.length, "module.json should not contain duplicate runtime paths");

  for (const path of paths) {
    await assert.doesNotReject(
      access(resolve(path), constants.F_OK),
      `manifest path should exist: ${path}`
    );
  }
});
