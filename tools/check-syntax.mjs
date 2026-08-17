import { access, readFile, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { extname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const ROOT = process.cwd();
const SCRIPT_ROOTS = ["scripts", "tests", "tools"];
const JSON_ROOTS = ["lang"];
const errors = [];

async function collectFiles(directory, predicate) {
  const files = [];
  let entries;

  try {
    entries = await readdir(join(ROOT, directory), { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return files;
    throw error;
  }

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(path, predicate));
    else if (predicate(path)) files.push(path);
  }

  return files;
}

function checkJavaScript(path) {
  const result = spawnSync(process.execPath, ["--check", path], {
    cwd: ROOT,
    encoding: "utf8"
  });

  if (result.status === 0) return;
  errors.push(`${path}:\n${result.stderr || result.stdout || "node --check failed"}`);
}

async function parseJson(path) {
  try {
    return JSON.parse(await readFile(join(ROOT, path), "utf8"));
  } catch (error) {
    errors.push(`${path}: ${error.message}`);
    return null;
  }
}

async function assertExists(path, label) {
  try {
    await access(join(ROOT, path), constants.F_OK);
  } catch {
    errors.push(`${label} references missing path: ${path}`);
  }
}

async function validateManifest() {
  const manifest = await parseJson("module.json");
  if (!manifest) return;

  if (manifest.id !== "mk-shadowdark") {
    errors.push(`module.json id must be mk-shadowdark, found ${String(manifest.id)}`);
  }

  const referencedPaths = [
    ...(manifest.esmodules ?? []).map(path => [path, "module.json esmodules"]),
    ...(manifest.styles ?? []).map(path => [path, "module.json styles"]),
    ...(manifest.languages ?? []).map(language => [language?.path, "module.json languages"])
  ].filter(([path]) => typeof path === "string" && path.length > 0);

  for (const [path, label] of referencedPaths) await assertExists(path, label);

  const duplicates = referencedPaths
    .map(([path]) => path)
    .filter((path, index, all) => all.indexOf(path) !== index);

  for (const path of new Set(duplicates)) {
    errors.push(`module.json references ${path} more than once`);
  }
}

const javascriptFiles = (
  await Promise.all(
    SCRIPT_ROOTS.map(directory => collectFiles(directory, path => [".js", ".mjs", ".cjs"].includes(extname(path))))
  )
).flat().sort();

for (const path of javascriptFiles) checkJavaScript(path);

await parseJson("package.json");
for (const directory of JSON_ROOTS) {
  const jsonFiles = await collectFiles(directory, path => extname(path) === ".json");
  for (const path of jsonFiles.sort()) await parseJson(path);
}
await validateManifest();

if (errors.length) {
  console.error(`Validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`\n${error}`);
  process.exit(1);
}

console.log(`Validated ${javascriptFiles.length} JavaScript files, JSON syntax, and module manifest paths.`);
