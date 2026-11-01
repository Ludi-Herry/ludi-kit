import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { packLocal, kitRoot, runNpm } from "./pack-local.mjs";

const target = process.argv[2];
const devMode = process.argv.includes("--dev");
const allowedTargets = new Set(["preview", "starter"]);

if (!allowedTargets.has(target) || (devMode && target !== "preview")) {
  console.error("Usage: node scripts/build-consumer.mjs <preview|starter> [--dev]");
  process.exit(1);
}

try {
  const packed = packLocal();
  const targetRoot = resolve(kitRoot, target);

  runNpm([
    "install",
    "--prefix",
    targetRoot,
    "--no-save",
    "--package-lock=false",
    packed.tarballPath
  ]);

  runNpm(["run", devMode ? "dev" : "build", "--prefix", targetRoot]);

  if (!devMode) {
    const result = spawnSync(process.execPath, [resolve(kitRoot, "scripts/check-bundle.mjs"), target], {
      cwd: kitRoot,
      stdio: "inherit",
      shell: false
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
