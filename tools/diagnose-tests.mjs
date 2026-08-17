import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const files = readdirSync("tests")
  .filter(name => name.endsWith(".test.mjs"))
  .sort();

let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--test", `tests/${file}`], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status === 0) continue;
  failed = true;
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim().replaceAll("\n", "%0A");
  console.error(`::error file=tests/${file},line=1::FAILED ${file}%0A${output}`);
}

process.exit(failed ? 1 : 0);
