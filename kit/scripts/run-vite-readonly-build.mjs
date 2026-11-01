import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const allowedConfigs = new Set([
  "generator/fixtures/antd-simple-list-filtering/preview/vite.config.ts",
  "generator/fixtures/antd-dashboard-content-fidelity/preview/vite.config.ts",
  "generator/fixtures/antd-form-content-fidelity/preview/vite.config.ts",
  "generator/fixtures/antd-responsive-list-overflow/preview/vite.config.ts",
  "quality/image2-golden-pages/holdout-restart-2/evaluation/overview/preview/vite.config.ts",
  "quality/image2-golden-pages/holdout-restart-2/evaluation/work-order-detail/preview/vite.config.ts",
  "quality/image2-golden-pages/holdout-restart-3/evaluation/security-devices/preview/vite.config.ts",
  "quality/image2-golden-pages/holdout-restart-3/evaluation/production-flashing/preview/vite.config.ts",
  "quality/image2-golden-pages/holdout-restart-4/evaluation/production-flashing/preview/vite.config.ts",
  "quality/image2-golden-pages/holdout-restart-4/evaluation/alert-center/preview/vite.config.ts"
]);

const configArg = readArg("--config");
const expectedMissingDistArg = readArg("--expect-no-dist", false);
const configPath = resolveInside(configArg, "Vite config");
const portableConfig = relative(kitRoot, configPath).replaceAll("\\", "/");
if (!allowedConfigs.has(portableConfig)) throw new Error(`Vite config is outside the evaluator allowlist: ${portableConfig}`);

const lock = JSON.parse(readFileSync(resolve(kitRoot, "preview/package-lock.json"), "utf8"));
const lockedViteVersion = lock.packages?.["node_modules/vite"]?.version;
if (lockedViteVersion !== "7.3.6") throw new Error(`repository preview Vite lock drifted: ${lockedViteVersion}`);

const viteEntry = resolve(kitRoot, "preview/node_modules/vite/dist/node/index.js");
if (!existsSync(viteEntry)) throw new Error("repository preview Vite entry is missing");

let expectedMissingDist = null;
if (expectedMissingDistArg) {
  expectedMissingDist = resolveInside(expectedMissingDistArg, "expected missing dist", false);
  if (existsSync(expectedMissingDist)) throw new Error(`read-only build refuses existing dist: ${expectedMissingDistArg}`);
}

const { build } = await import(pathToFileURL(viteEntry).href);
await build({
  configFile: configPath,
  build: { write: false },
  logLevel: "info"
});

if (expectedMissingDist && existsSync(expectedMissingDist)) throw new Error(`read-only build created dist: ${expectedMissingDistArg}`);
console.log(`readonly Vite build passed: config=${portableConfig}; vite=${lockedViteVersion}; write=false`);

function readArg(name, required = true) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  if (required) throw new Error(`${name} is required`);
  return null;
}

function resolveInside(value, label, requireExists = true) {
  const path = resolve(kitRoot, value);
  const rel = relative(kitRoot, path);
  if (!rel || rel.startsWith("..") || resolve(kitRoot, rel) !== path) throw new Error(`${label} must resolve inside kit`);
  if (requireExists && !existsSync(path)) throw new Error(`${label} is missing: ${value}`);
  return path;
}
