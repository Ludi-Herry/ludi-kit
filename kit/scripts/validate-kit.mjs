import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const fail = (message) => {
  console.error(`validate-kit failed: ${message}`);
  process.exitCode = 1;
};

const readJson = (file) => {
  const fullPath = resolve(root, file);
  try {
    return JSON.parse(readFileSync(fullPath, "utf8"));
  } catch (error) {
    fail(`${file} is not valid JSON: ${error.message}`);
    return null;
  }
};

const exists = (file) => existsSync(resolve(root, file));
const validatePath = (label, file) => {
  if (typeof file !== "string") {
    fail(`${label} must be a string path`);
    return;
  }
  if (!exists(file)) fail(`${label} points to missing file: ${file}`);
};

const argv = process.argv.slice(2);
const patternsManifestFile = argv[0] === "--patterns-manifest" && argv[1] ? argv[1] : "patterns.manifest.json";

const manifest = readJson("manifest.json");
const componentsManifest = readJson("components.manifest.json");
const patternsManifest = readJson(patternsManifestFile);
readJson("tokens.manifest.json");
readJson("schema/components.schema.json");
readJson("harness/checks/import-policy.json");

if (manifest) {
  for (const [group, entries] of Object.entries({
    docs: manifest.docs,
    entry: manifest.entry,
    rules: manifest.rules,
    recipes: manifest.recipes,
    schema: manifest.schema,
    harness: manifest.harness
  })) {
    for (const [key, file] of Object.entries(entries ?? {})) {
      if (key === "reports") continue;
      if (group === "harness" && key === "execution") continue;
      validatePath(`${group}.${key}`, file);
    }
  }

  const harnessExecution = manifest.harness?.execution;
  if (harnessExecution) {
    if (harnessExecution.isolation !== "worker-thread") {
      fail("harness.execution.isolation must be worker-thread");
    }
    if (!Number.isSafeInteger(harnessExecution.timeoutMs) || harnessExecution.timeoutMs <= 0) {
      fail("harness.execution.timeoutMs must be a positive integer");
    }
    if (!Number.isSafeInteger(harnessExecution.maxOldGenerationSizeMb) || harnessExecution.maxOldGenerationSizeMb <= 0) {
      fail("harness.execution.maxOldGenerationSizeMb must be a positive integer");
    }
  }

  if (manifest.harness?.reports && !exists(manifest.harness.reports)) {
    fail(`harness.reports points to missing directory: ${manifest.harness.reports}`);
  }

  if (manifest.preview?.app && !exists(manifest.preview.app)) {
    fail(`preview.app points to missing directory: ${manifest.preview.app}`);
  }

  for (const [key, file] of Object.entries(manifest.projects ?? {})) {
    if (!exists(file)) fail(`projects.${key} points to missing path: ${file}`);
  }

  for (const [key, file] of Object.entries(manifest.figma ?? {})) {
    if (!exists(file)) fail(`figma.${key} points to missing path: ${file}`);
  }

  for (const [key, file] of Object.entries(manifest.feedback ?? {})) {
    if (!exists(file)) fail(`feedback.${key} points to missing path: ${file}`);
  }
}

const components = new Map();
if (componentsManifest?.components) {
  for (const component of componentsManifest.components) {
    if (component.importFrom !== "@ai-readable/kit") {
      fail(`${component.name} must import from @ai-readable/kit`);
    }
    components.set(component.name, component);

    for (const file of [
      ...(component.relatedRules ?? []),
      ...(component.relatedRecipes ?? []),
      ...(component.examples ?? [])
    ]) {
      if (!exists(file)) fail(`${component.name} points to missing file: ${file}`);
    }
  }
}

if (patternsManifest?.patterns) {
  for (const [patternName, pattern] of Object.entries(patternsManifest.patterns)) {
    for (const componentName of [
      ...(pattern.requiredComponents ?? []),
      ...(pattern.optionalComponents ?? [])
    ]) {
      if (!components.has(componentName)) {
        fail(`${patternName} references missing component: ${componentName}`);
      }
    }

    if (pattern.relatedRecipe && !exists(pattern.relatedRecipe)) {
      fail(`${patternName} points to missing recipe: ${pattern.relatedRecipe}`);
    }
    if (pattern.example && !exists(pattern.example)) {
      fail(`${patternName} points to missing example: ${pattern.example}`);
    }

    if (pattern.regions !== undefined) {
      if (!Array.isArray(pattern.regions) || pattern.regions.length === 0) {
        fail(`${patternName}.regions must be a non-empty array`);
      } else {
        // Regions schema is fail-closed: unknown keys are rejected outright.
        // Old entries (id/owner/locked only) stay valid; every extra field is optional.
        const REGION_KEYS = new Set(["id", "owner", "locked", "name", "purpose", "layoutTreeItem", "requiredComponent", "successCriteria", "doNotOnDelete", "source"]);
        const REGION_STRINGS = new Set(["name", "purpose", "layoutTreeItem", "source"]);
        const REGION_STRING_LISTS = new Set(["successCriteria", "doNotOnDelete"]);
        const regionIds = new Set();
        for (const region of pattern.regions) {
          const regionId = typeof region?.id === "string" ? region.id : "?";
          if (!/^[a-z0-9][a-z0-9-]*$/.test(regionId)) fail(`${patternName}.regions has an invalid id`);
          if (regionIds.has(regionId)) fail(`${patternName}.regions has duplicate id: ${regionId}`);
          regionIds.add(regionId);
          if (!["pattern", "page"].includes(region?.owner)) fail(`${patternName}.regions ${regionId} owner must be pattern or page`);
          if (typeof region?.locked !== "boolean") fail(`${patternName}.regions ${regionId} locked must be a boolean`);
          if (region?.locked === true && region?.owner !== "pattern") fail(`${patternName}.regions ${regionId} is locked but not pattern-owned`);
          for (const key of Object.keys(region ?? {})) {
            if (!REGION_KEYS.has(key)) fail(`${patternName}.regions ${regionId} has unknown field: ${key}`);
          }
          for (const key of REGION_STRINGS) {
            if (region?.[key] !== undefined && (typeof region[key] !== "string" || region[key] === "" || region[key].length > 500)) {
              fail(`${patternName}.regions ${regionId} ${key} must be a non-empty string (max 500 chars)`);
            }
          }
          for (const key of REGION_STRING_LISTS) {
            if (region?.[key] !== undefined && (!Array.isArray(region[key]) || region[key].some((item) => typeof item !== "string" || item === ""))) {
              fail(`${patternName}.regions ${regionId} ${key} must be an array of non-empty strings`);
            }
          }
          if (region?.requiredComponent !== undefined) {
            if (typeof region.requiredComponent !== "string" || !(pattern.requiredComponents ?? []).includes(region.requiredComponent)) {
              fail(`${patternName}.regions ${regionId} requiredComponent must reference ${patternName}.requiredComponents`);
            }
          }
        }
      }
    }
  }
}

for (const componentName of components.keys()) {
  if (!exists("src/index.ts")) fail("src/index.ts is missing");
  const indexSource = exists("src/index.ts") ? readFileSync(resolve(root, "src/index.ts"), "utf8") : "";
  if (!indexSource.includes(componentName)) {
    fail(`src/index.ts does not visibly export ${componentName}`);
  }
}

if (!process.exitCode) {
  console.log(`validate-kit passed: ${components.size} components, ${Object.keys(patternsManifest?.patterns ?? {}).length} patterns`);
}
