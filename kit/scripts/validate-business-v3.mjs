import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const systemRoot = resolve(kitRoot, "design-systems/business-v3");
const errors = [];

const requiredFiles = [
  "readback-contract.md", "figma-readback.json", "tokens.json",
  "component-index.json", "antd-theme.json", "figma/sync.contract.json"
];
for (const file of requiredFiles) if (!existsSync(resolve(systemRoot, file))) errors.push(`missing ${file}`);
if (errors.length) fail();

const readback = readJson(resolve(systemRoot, "figma-readback.json"));
const tokens = readJson(resolve(systemRoot, "tokens.json"));
const index = readJson(resolve(systemRoot, "component-index.json"));
const antd = readJson(resolve(systemRoot, "antd-theme.json"));
const sync = readJson(resolve(systemRoot, "figma/sync.contract.json"));
const baseline = readJson(resolve(kitRoot, "figma/business-components-v3.readback-2026-07-29.json"));

// ---------------------------------------------------------------- readback
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
const validateReadback = ajv.compile(readJson(resolve(kitRoot, "schema/business-v3-readback.schema.json")));
if (!validateReadback(readback)) errors.push(`readback schema errors: ${ajv.errorsText(validateReadback.errors, { separator: "; " })}`);

if (readback.variables.length !== baseline.variables.total) {
  errors.push(`variables ${readback.variables.length} !== frozen baseline ${baseline.variables.total}`);
}
for (const collection of baseline.variables.collections) {
  const actual = readback.variables.filter((variable) => variable.collectionId === collection.id).length;
  if (actual !== collection.count) errors.push(`collection ${collection.name} has ${actual} variables, baseline says ${collection.count}`);
}
const variableById = new Map(readback.variables.map((variable) => [variable.id, variable]));
const aliases = readback.variables.filter((variable) => variable.isAlias);
if (aliases.length !== baseline.variables.semanticAliases) {
  errors.push(`alias count ${aliases.length} !== baseline ${baseline.variables.semanticAliases}`);
}
const dangling = aliases.filter((variable) => !variable.aliasTargetId || !variableById.has(variable.aliasTargetId));
if (dangling.length !== baseline.variables.danglingAliases) {
  errors.push(`dangling aliases ${dangling.map((variable) => variable.name).join(", ") || 0} !== baseline ${baseline.variables.danglingAliases}`);
}
const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/;
const collectionById = new Map(readback.collections.map((collection) => [collection.id, collection]));
for (const variable of readback.variables) {
  if (variable.resolvedType !== "COLOR") continue;
  const collection = collectionById.get(variable.collectionId);
  if (!collection) { errors.push(`${variable.name} references an unknown collection`); continue; }
  for (const mode of collection.modes) {
    const value = variable.valuesByMode[mode.modeId];
    if (typeof value !== "string" || !HEX.test(value)) errors.push(`${variable.name} mode ${mode.name} is not a hex value`);
  }
}
const baselineByKey = new Map(baseline.components.map((component) => [component.key, component]));
if (readback.components.length !== baseline.components.length) {
  errors.push(`components ${readback.components.length} !== baseline ${baseline.components.length}`);
}
for (const component of readback.components) {
  const base = baselineByKey.get(component.key);
  if (!base) { errors.push(`component ${component.name} key is absent from the frozen baseline`); continue; }
  if (component.id !== base.nodeId) errors.push(`${component.name} nodeId ${component.id} !== baseline ${base.nodeId}`);
  const dimensions = Object.values(component.variantProperties ?? {});
  if (!dimensions.length) { errors.push(`${component.name} has no variant dimension`); continue; }
  const cartesian = dimensions.reduce((total, options) => total * options.length, 1);
  if (cartesian !== base.variants) errors.push(`${component.name} cartesian ${cartesian} !== baseline variants ${base.variants}`);
}
if (readback.paintStyleBindings.length !== baseline.variables.boundLocalPaintStyles) {
  errors.push(`paintStyleBindings ${readback.paintStyleBindings.length} !== baseline ${baseline.variables.boundLocalPaintStyles}`);
}
for (const binding of readback.paintStyleBindings) {
  if (!variableById.has(binding.variableId)) errors.push(`paint style ${binding.styleName} points at an unknown variable`);
}

// ------------------------------------------------------------------ tokens
const CATEGORIES = ["color", "typography", "spacing", "radius", "shadow", "layout", "motion"];
for (const category of CATEGORIES) {
  if (!tokens.tokens?.[category]) errors.push(`tokens.${category} must exist even when empty`);
}
const declaredEmpty = new Set(tokens.coverage?.emptyCategories ?? []);
for (const category of CATEGORIES) {
  const isEmpty = !Object.keys(tokens.tokens?.[category] ?? {}).length;
  if (isEmpty && !declaredEmpty.has(category)) errors.push(`tokens.${category} is empty but not declared in coverage.emptyCategories`);
  if (!isEmpty && declaredEmpty.has(category)) errors.push(`tokens.${category} is declared empty but has entries`);
}
const tokenByPath = new Map();
const mappedVariableIds = new Set();
for (const [category, group] of Object.entries(tokens.tokens ?? {})) {
  for (const [key, token] of Object.entries(group)) {
    const path = `${category}.${key}`;
    tokenByPath.set(path, token);
    if (!token.figmaVariableId) { errors.push(`${path} has no figmaVariableId`); continue; }
    const variable = variableById.get(token.figmaVariableId);
    if (!variable) { errors.push(`${path} references a variable absent from the readback`); continue; }
    if (mappedVariableIds.has(token.figmaVariableId)) errors.push(`${path} maps a variable already mapped by another token`);
    mappedVariableIds.add(token.figmaVariableId);
    const collection = collectionById.get(variable.collectionId);
    const resolved = variable.valuesByMode[collection.defaultModeId];
    if (variable.resolvedType === "COLOR" && token.value !== resolved) {
      errors.push(`${path} value ${token.value} !== readback ${resolved}`);
    }
    if (variable.resolvedType === "FLOAT" && Math.abs(Number(token.value) - Number(resolved)) > 0.005) {
      errors.push(`${path} value ${token.value} !== readback ${resolved}`);
    }
    if (token.cssVar && variable.codeSyntax?.WEB && token.cssVar !== variable.codeSyntax.WEB) {
      errors.push(`${path} cssVar ${token.cssVar} !== readback ${variable.codeSyntax.WEB}`);
    }
  }
}
if (mappedVariableIds.size !== readback.variables.length) {
  const missing = readback.variables.filter((variable) => !mappedVariableIds.has(variable.id)).map((variable) => variable.name);
  errors.push(`tokens cover ${mappedVariableIds.size}/${readback.variables.length} variables; unmapped: ${missing.join(", ")}`);
}
if (tokens.coverage?.mappedVariables !== readback.variables.length) {
  errors.push(`coverage.mappedVariables ${tokens.coverage?.mappedVariables} !== ${readback.variables.length}`);
}

// --------------------------------------------------------- component index
const readbackComponentByKey = new Map(readback.components.map((component) => [component.key, component]));
if (index.figma?.fileKey !== readback.source.fileKey) errors.push("component-index fileKey !== readback fileKey");
if (index.figma?.auditStatus === "external-blocked") errors.push("component-index auditStatus must leave external-blocked");
if (index.components?.length !== readback.components.length) {
  errors.push(`component-index has ${index.components?.length} components, readback has ${readback.components.length}`);
}
const seenIds = new Set();
for (const component of index.components ?? []) {
  if (seenIds.has(component.id)) errors.push(`duplicate component id ${component.id}`);
  seenIds.add(component.id);
  for (const field of ["name", "category", "figmaComponent", "figmaNodeId", "figmaComponentKey"]) {
    if (!component[field]) errors.push(`${component.id} is missing ${field}`);
  }
  if (!component.useWhen?.length) errors.push(`${component.id} has no useWhen guidance`);
  if (!component.avoidWhen?.length) errors.push(`${component.id} has no avoidWhen guidance`);

  const source = readbackComponentByKey.get(component.figmaComponentKey);
  if (!source) { errors.push(`${component.id} key is absent from the readback`); continue; }
  if (component.figmaNodeId !== source.id) errors.push(`${component.id} figmaNodeId !== readback ${source.id}`);
  if (component.figmaComponent !== source.name) errors.push(`${component.id} figmaComponent ${component.figmaComponent} !== readback ${source.name}`);
  if (stableJson(component.variantProperties) !== stableJson(source.variantProperties)) {
    errors.push(`${component.id} variantProperties drifted from the readback`);
  }
  const cartesian = Object.values(source.variantProperties).reduce((total, options) => total * options.length, 1);
  if (component.variantCount !== cartesian) errors.push(`${component.id} variantCount ${component.variantCount} !== cartesian ${cartesian}`);

  // every declared token path resolves, and the resulting variable set matches the readback bindings exactly
  const declared = new Set();
  for (const path of component.tokens ?? []) {
    const token = tokenByPath.get(path);
    if (!token) { errors.push(`${component.id} references unknown token ${path}`); continue; }
    declared.add(token.figmaVariableId);
  }
  const bound = new Set(source.boundVariableIds);
  const extra = [...declared].filter((id) => !bound.has(id)).map((id) => variableById.get(id)?.name ?? id);
  const missing = [...bound].filter((id) => !declared.has(id)).map((id) => variableById.get(id)?.name ?? id);
  if (extra.length) errors.push(`${component.id} declares tokens not bound in Figma: ${extra.join(", ")}`);
  if (missing.length) errors.push(`${component.id} omits variables bound in Figma: ${missing.join(", ")}`);
}

// -------------------------------------------------------------- antd theme
if (antd.source?.fileKey !== readback.source.fileKey) errors.push("antd-theme fileKey !== readback fileKey");
const provenance = antd.provenance ?? {};
const leaves = [];
for (const [name, value] of Object.entries(antd.theme?.token ?? {})) leaves.push([`token.${name}`, value]);
for (const [component, group] of Object.entries(antd.theme?.components ?? {})) {
  for (const [name, value] of Object.entries(group)) leaves.push([`components.${component}.${name}`, value]);
}
if (!leaves.length) errors.push("antd-theme declares no theme values");
for (const [path, value] of leaves) {
  const entry = provenance[path];
  if (!entry) { errors.push(`antd-theme ${path} has no provenance entry`); continue; }
  const tokenPath = entry.split(/[\s(]/)[0];
  const variableId = (entry.match(/VariableID:[\d:]+/) ?? [])[0];
  const token = tokenByPath.get(tokenPath);
  if (!token) { errors.push(`antd-theme ${path} cites unknown token ${tokenPath}`); continue; }
  if (!variableId || token.figmaVariableId !== variableId) {
    errors.push(`antd-theme ${path} cites ${variableId} but ${tokenPath} maps ${token.figmaVariableId}`);
  }
  const expected = token.value;
  if (typeof expected === "number" ? Math.abs(Number(value) - expected) > 0.005 : value !== expected) {
    errors.push(`antd-theme ${path} = ${JSON.stringify(value)} but ${tokenPath} = ${JSON.stringify(expected)}`);
  }
}
for (const path of Object.keys(provenance)) {
  if (!leaves.some(([leafPath]) => leafPath === path)) errors.push(`antd-theme provenance ${path} has no matching theme value`);
}

// ----------------------------------------------------------- sync contract
if (sync.target?.fileKey !== readback.source.fileKey) errors.push("sync contract fileKey !== readback fileKey");
if (sync.status === "external-blocked") errors.push("sync contract status must leave external-blocked");
if (sync.blocker !== null) errors.push("sync contract must clear its blocker");
if (sync.writeBack?.allowed !== false) errors.push("sync contract must keep write-back disallowed for the live business library");
if (sync.componentSets?.length !== readback.components.length) {
  errors.push(`sync contract lists ${sync.componentSets?.length} component sets, readback has ${readback.components.length}`);
}
for (const set of sync.componentSets ?? []) {
  const source = readbackComponentByKey.get(set.key);
  if (!source) { errors.push(`sync contract component ${set.name} is absent from the readback`); continue; }
  if (set.nodeId !== source.id) errors.push(`sync contract ${set.name} nodeId !== readback ${source.id}`);
  const cartesian = Object.values(source.variantProperties).reduce((total, options) => total * options.length, 1);
  if (set.variants !== cartesian) errors.push(`sync contract ${set.name} variants ${set.variants} !== cartesian ${cartesian}`);
  if (!seenIds.has(set.sourceId)) errors.push(`sync contract ${set.name} sourceId ${set.sourceId} is not in component-index`);
}
for (const collection of sync.variableCollections ?? []) {
  const actual = readback.variables.filter((variable) => variable.collectionId === collection.id).length;
  if (actual !== collection.variableCount) errors.push(`sync contract ${collection.name} variableCount ${collection.variableCount} !== ${actual}`);
}
if (sync.readback?.recordedAtUtc !== readback.source.recordedAtUtc) errors.push("sync contract recordedAtUtc !== readback recordedAtUtc");

if (errors.length) fail();
console.log(`validate-business-v3 passed: variables=${readback.variables.length} (mapped ${mappedVariableIds.size}); components=${index.components.length}; bindings=${readback.paintStyleBindings.length}; antd values=${leaves.length}; modes=${tokens.modes.join(",")}`);

function fail() {
  for (const error of errors) console.error(`validate-business-v3 failed: ${error}`);
  process.exit(1);
}
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function readJson(file) {
  try { return JSON.parse(readFileSync(file, "utf8")); }
  catch (error) { console.error(`validate-business-v3 failed: invalid JSON ${file}: ${error.message}`); process.exit(1); }
}
