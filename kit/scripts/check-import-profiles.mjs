import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runner = path.join(kitRoot, "harness", "runner", "run-scenario.mjs");

const cases = [
  ["import-profile-kit-consumer.good.json", true],
  ["import-profile-library-native.good.json", true],
  ["import-profile-custom-native.good.json", true],
  ["import-profile-kit-consumer.bad.json", false],
  ["import-profile-library-native.bad.json", false],
  ["import-profile-custom-native.bad.json", false],
  ["import-profile-missing-contract.bad.json", false],
];

const failures = [];

for (const [fixture, shouldPass] of cases) {
  const scenario = path.join(kitRoot, "harness", "scenarios", fixture);
  const result = spawnSync(process.execPath, [runner, scenario], {
    cwd: kitRoot,
    encoding: "utf8",
    stdio: "pipe",
  });
  const passed = result.status === 0;

  if (passed !== shouldPass) {
    failures.push(
      `${fixture}: expected ${shouldPass ? "pass" : "fail"}, received exit ${result.status ?? "null"}\n${result.stdout}${result.stderr}`,
    );
    continue;
  }

  process.stdout.write(`PASS ${fixture} (${shouldPass ? "accepted" : "rejected as expected"})\n`);
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n\n")}\n`);
  process.exit(1);
}

process.stdout.write(`Import profile contract passed (${cases.length} fixtures).\n`);
