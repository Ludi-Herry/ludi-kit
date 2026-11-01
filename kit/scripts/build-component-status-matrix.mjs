import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(root, "quality/component-status-matrix.json");

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(root, relativePath), "utf8"));
}

function exportedSymbols() {
  const source = readFileSync(resolve(root, "src/index.ts"), "utf8");
  const symbols = new Set();
  const exportBlocks = source.matchAll(/export\s*\{([\s\S]*?)\}\s*from\s*["'][^"']+["'];/g);
  for (const block of exportBlocks) {
    for (const raw of block[1].split(",")) {
      const symbol = raw.trim().split(/\s+as\s+/)[0]?.trim();
      if (/^[A-Z][A-Za-z0-9]+$/.test(symbol)) symbols.add(symbol);
    }
  }
  return symbols;
}

function harnessEvidence() {
  const evidence = new Map();
  const scenariosDir = resolve(root, "harness/scenarios");
  for (const entry of readdirScenarios(scenariosDir)) {
    const scenario = JSON.parse(readFileSync(entry, "utf8"));
    const outputMode = scenario.foundationContract?.outputMode ?? "legacy-kit-consumer";
    if (outputMode !== "kit-consumer" && outputMode !== "legacy-kit-consumer") continue;
    if (!Array.isArray(scenario.expectedComponents) || !scenario.report) continue;
    const reportPath = resolve(root, scenario.report);
    if (!existsSync(reportPath)) continue;
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    if (report.status !== "passed") continue;
    for (const component of scenario.expectedComponents) {
      const list = evidence.get(component) ?? [];
      list.push(scenario.id);
      evidence.set(component, list);
    }
  }
  return evidence;
}

function readdirScenarios(dir) {
  return Object.values(JSON.parse(readFileSync(resolve(root, "quality/scenario-index.json"), "utf8")))
    .map((name) => resolve(dir, name));
}

function buildMatrix() {
  const manifest = readJson("components.manifest.json");
  const preview = readJson("preview/src/catalog.compact.json");
  const publicExports = exportedSymbols();
  const previewComponents = new Set(preview.components.map((component) => component.name));
  const harness = harnessEvidence();
  const components = manifest.components.map((component) => {
    const publicExported = publicExports.has(component.name);
    const previewListed = previewComponents.has(component.name);
    const harnessScenarios = harness.get(component.name) ?? [];
    const harnessCovered = harnessScenarios.length > 0;
    const status = publicExported && previewListed && harnessCovered ? "implemented" : "partial";
    return {
      name: component.name,
      category: component.category,
      publicExported,
      previewListed,
      harnessCovered,
      harnessScenarios,
      status
    };
  });
  return {
    version: "0.1.0",
    generatedAt: "2026-07-19",
    componentCount: components.length,
    statusCounts: components.reduce((counts, component) => {
      counts[component.status] = (counts[component.status] ?? 0) + 1;
      return counts;
    }, {}),
    components
  };
}

function assertScenarioIndex() {
  const scenarios = readJson("quality/scenario-index.json");
  const missing = Object.values(scenarios).filter((name) => !existsSync(resolve(root, "harness/scenarios", name)));
  if (missing.length > 0) throw new Error(`quality/scenario-index.json references missing scenarios: ${missing.join(", ")}`);
}

try {
  assertScenarioIndex();
  const matrix = buildMatrix();
  const serialized = `${JSON.stringify(matrix, null, 2)}\n`;
  if (process.argv.includes("--write")) {
    writeFileSync(outputPath, serialized, "utf8");
    console.log(`WROTE quality/component-status-matrix.json (${matrix.componentCount} components)`);
  } else {
    const current = readFileSync(outputPath, "utf8");
    if (current !== serialized) throw new Error("quality/component-status-matrix.json is out of date; run node scripts/build-component-status-matrix.mjs --write");
    console.log(`PASS component status matrix: ${matrix.componentCount} components`);
  }
} catch (error) {
  console.error(`component status matrix failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
