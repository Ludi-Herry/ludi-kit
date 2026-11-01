import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { validateAntdKnowledgePack } from "./antd-knowledge.mjs";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (message) => {
  console.error(`validate-foundations failed: ${message}`);
  process.exitCode = 1;
};

const catalog = readJson("foundations/catalog.json");
const adapters = readJson("foundations/adapters.json");
const contextSchema = readJson("schema/project-context.schema.json");
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
const validateContext = ajv.compile(contextSchema);
const candidates = new Map();
const adapterRegistry = adapters?.adapters ?? {};
const adapterNames = new Set(Object.keys(adapterRegistry));
const requiredSourceKeys = ["principles", "components", "templates", "source", "styles", "theme", "variables"];
const validatedKnowledgePacks = new Set();

for (const candidate of catalog?.candidates ?? []) {
  if (candidates.has(candidate.id)) fail(`duplicate foundation candidate id ${candidate.id}`);
  candidates.set(candidate.id, candidate);
  validateSourceMap(candidate.officialSources, `catalog ${candidate.id} officialSources`);
  if (candidate.designPack) validateDesignPack(candidate.designPack, `catalog ${candidate.id}`);
}

const contextFiles = [
  ...listJsonFiles("projects").filter((file) => file.endsWith("/business-context.json")),
  ...listJsonFiles("generator/fixtures").filter((file) => file.endsWith("/business-context.json"))
];

let checkedContexts = 0;
for (const file of contextFiles) {
  const context = readJson(file);
  if (!context) continue;
  checkedContexts += 1;
  if (!validateContext(context)) {
    fail(`${file}: ${ajv.errorsText(validateContext.errors, { separator: "; " })}`);
    continue;
  }
  validateContract(file, context.frontendFoundation);
}

if (!process.exitCode) {
  console.log(`validate-foundations passed: ${candidates.size} candidates, ${checkedContexts} contexts`);
}

function validateContract(file, contract) {
  const candidate = candidates.get(contract.foundation.id);
  if (!candidate) {
    fail(`${file}: unknown foundation ${contract.foundation.id}`);
    return;
  }
  if (!candidate.outputModes.includes(contract.outputMode)) {
    fail(`${file}: ${contract.foundation.id} does not support ${contract.outputMode}`);
  }
  if (candidate.framework !== "any" && candidate.framework !== contract.framework.name) {
    fail(`${file}: ${contract.foundation.id} does not support framework ${contract.framework.name}`);
  }
  if (candidate.id !== "local" && candidate.packageName !== contract.foundation.packageName) {
    fail(`${file}: packageName must be ${candidate.packageName}`);
  }
  if (candidate.id !== "local" && candidate.version !== contract.foundation.version) {
    fail(`${file}: version must be ${candidate.version}`);
  }
  if (candidate.id !== "local" && candidate.distribution !== contract.distribution) {
    fail(`${file}: distribution must be ${candidate.distribution}`);
  }
  if (candidate.id !== "local" && candidate.iconPackage !== contract.icons.packageName) {
    fail(`${file}: icon package must be ${candidate.iconPackage}`);
  }
  if (candidate.id !== "local" && candidate.iconPackageVersion !== contract.icons.version) {
    fail(`${file}: icon package version must be ${candidate.iconPackageVersion}`);
  }
  for (const [kind, adapterName] of Object.entries(contract.adapters)) {
    if (!adapterNames.has(adapterName)) fail(`${file}: ${kind} adapter is not registered: ${adapterName}`);
    else if (adapterRegistry[adapterName].kind !== kind) fail(`${file}: ${adapterName} is not a ${kind} adapter`);
  }
  if (contract.outputMode === "library-native" && contract.foundation.id === "antd" && contract.adapters.lint !== "lint.react-antd-project") {
    fail(`${file}: library-native + antd must use lint.react-antd-project`);
  }
  validateSourceMap(contract.officialSources, `${file}: officialSources`);
  validateDesignPack(contract.designPack, file);
}

function validateDesignPack(designPack, owner) {
  const target = resolve(kitRoot, designPack.path);
  if (!existsSync(target)) {
    fail(`${owner}: design pack missing ${designPack.path}`);
    return;
  }
  const actual = createHash("sha256").update(readFileSync(target)).digest("hex");
  if (actual !== designPack.sha256) {
    fail(`${owner}: design pack hash drift for ${designPack.path}: expected=${designPack.sha256} actual=${actual}`);
  }
  const pack = readJson(designPack.path);
  validateSourceMap(pack?.source, `${owner}: design pack source`);
  if (pack?.foundationId === "antd" && !validatedKnowledgePacks.has(target)) {
    try {
      validateAntdKnowledgePack({ root: kitRoot, designPack: pack, designPackPath: designPack.path });
      validatedKnowledgePacks.add(target);
    } catch (error) {
      fail(`${owner}: ${error.message}`);
    }
  }
}

function validateSourceMap(source, owner) {
  for (const key of requiredSourceKeys) {
    if (typeof source?.[key] !== "string" || source[key].length === 0) {
      fail(`${owner} must define ${key}`);
    }
  }
}

function listJsonFiles(directory) {
  const root = resolve(kitRoot, directory);
  if (!existsSync(root)) return [];
  const files = [];
  walk(root, files);
  return files.map((file) => relative(kitRoot, file).replaceAll("\\", "/"));
}

function walk(directory, files) {
  for (const entry of readdirSync(directory)) {
    const path = resolve(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, files);
    else if (entry.endsWith(".json")) files.push(path);
  }
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(resolve(kitRoot, file), "utf8"));
  } catch (error) {
    fail(`${file} is not valid JSON: ${error.message}`);
    return null;
  }
}
