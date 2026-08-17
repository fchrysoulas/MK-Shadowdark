import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "module.json"), "utf8"));

function normalizeRepoPath(value) {
  return String(value ?? "")
    .replaceAll("\\", "/")
    .replace(/^\.\//, "");
}

function resolveRelativeImport(fromPath, specifier) {
  if (!String(specifier).startsWith(".")) return null;
  return normalizeRepoPath(path.posix.normalize(
    path.posix.join(path.posix.dirname(normalizeRepoPath(fromPath)), specifier)
  ));
}

function walkJavaScript(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkJavaScript(fullPath);
    return entry.isFile() && entry.name.endsWith(".js") ? [fullPath] : [];
  });
}

test("manifest global load paths are unique", () => {
  assert.equal(new Set(manifest.esmodules).size, manifest.esmodules.length);
  assert.equal(new Set(manifest.styles).size, manifest.styles.length);
});

test("manifest entry points do not side-effect import other manifest entry points", () => {
  const entries = new Set(manifest.esmodules.map(normalizeRepoPath));
  const duplicateBootstraps = [];
  const sideEffectImportPattern = /^\s*import\s+["']([^"']+)["'];?/gm;

  for (const entry of entries) {
    const source = fs.readFileSync(path.join(ROOT, entry), "utf8");
    for (const match of source.matchAll(sideEffectImportPattern)) {
      const resolved = resolveRelativeImport(entry, match[1]);
      if (resolved && entries.has(resolved)) {
        duplicateBootstraps.push(`${entry} -> ${resolved}`);
      }
    }
  }

  assert.deepEqual(duplicateBootstraps, []);
});

test("module scripts do not inject global stylesheet links at runtime", () => {
  const offenders = [];
  const linkCreationPattern = /document\.createElement\(\s*["']link["']\s*\)/;

  for (const file of walkJavaScript(path.join(ROOT, "scripts"))) {
    const source = fs.readFileSync(file, "utf8");
    if (!linkCreationPattern.test(source)) continue;
    offenders.push(normalizeRepoPath(path.relative(ROOT, file)));
  }

  assert.deepEqual(offenders, []);
});
