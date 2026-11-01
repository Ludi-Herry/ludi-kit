import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = process.cwd();
const result = spawnSync(
  process.execPath,
  [
    resolve(root, "harness/runner/run-scenario.mjs"),
    resolve(root, "harness/scenarios/build-permissions-list.bad.json")
  ],
  {
    cwd: root,
    encoding: "utf8",
    shell: false
  }
);

if (result.error) {
  console.error(`negative harness could not run: ${result.error.message}`);
  process.exit(1);
}

if (result.status === 0) {
  process.stderr.write(result.stdout || "negative harness unexpectedly passed\n");
  process.exit(1);
}

const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
if (!/FAILED|errors?\b/i.test(output)) {
  process.stderr.write(output);
  console.error("negative harness failed without reporting a contract violation");
  process.exit(1);
}

console.log("negative harness OK: invalid fixture was rejected");
