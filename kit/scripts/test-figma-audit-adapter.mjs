import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const kitRoot = process.cwd();
const output = `figma/audit/.tmp-invalid-index-${process.pid}.json`;
const result = spawnSync(process.execPath, [
  "scripts/build-figma-component-index.mjs",
  "--audit", "figma/audit/fixtures/invalid-placeholder.json",
  "--out", output
], { cwd: kitRoot, encoding: "utf8", windowsHide: true });

if (result.status === 0) throw new Error("placeholder audit unexpectedly passed");
if (existsSync(resolve(kitRoot, output))) throw new Error("placeholder audit wrote an index");
if (!`${result.stdout}\n${result.stderr}`.includes("placeholder identifiers")) throw new Error(`placeholder audit failed for an unexpected reason: ${result.stderr || result.stdout}`);

console.log("test-figma-audit-adapter passed: placeholderExit=1; outputWrites=0");
