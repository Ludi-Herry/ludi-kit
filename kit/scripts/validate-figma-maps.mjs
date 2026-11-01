import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { variantSpecs } from "./sync-figma-maps.mjs";

const root = process.cwd();
const fail = (message) => {
  console.error(`validate-figma failed: ${message}`);
  process.exitCode = 1;
};

const componentsManifest = readJson("components.manifest.json");
const tokensManifest = readJson("tokens.manifest.json");
const componentMap = readJson("figma/component-map.json");
const variablesMap = readJson("figma/variables-map.json");
const variantsMap = readJson("figma/variants-map.json");

const componentsByName = new Map((componentsManifest.components ?? []).map((component) => [component.name, component]));
const tokenItems = flattenTokenGroups(tokensManifest);
const componentMapItems = componentMap.components ?? [];
const variableMapItems = variablesMap.variables ?? [];
const variantMapItems = variantsMap.mappings ?? [];

if (!existsSync(resolve(root, "figma/README.md"))) fail("figma/README.md is missing");
compareValue("component-map version", componentMap.version, componentsManifest.version);
compareValue("component-map importEntry", componentMap.importEntry, componentsManifest.importEntry);
compareValue("variables-map version", variablesMap.version, tokensManifest.version);
compareValue("variants-map version", variantsMap.version, componentsManifest.version);

assertUnique((componentsManifest.components ?? []).map((component) => component.name), "components.manifest component");
assertUnique(componentMapItems.map((component) => component.codeComponent), "component-map component");
compareSet(
  "component-map component names",
  componentMapItems.map((component) => component.codeComponent),
  [...componentsByName.keys()]
);

for (const component of componentsManifest.components ?? []) {
  const match = componentMapItems.find((item) => item.codeComponent === component.name);
  if (!match) {
    fail(`component-map missing ${component.name}`);
    continue;
  }
  validateComponentSnapshot(match, component);
}

assertUnique(variableMapItems.map((variable) => variable.token), "variables-map token");
assertUnique(Object.values(tokenItems).map((item) => item.css), "tokens.manifest css variable");
assertUnique(variableMapItems.map((variable) => variable.cssVariable), "variables-map css variable");
assertUnique(Object.keys(tokenItems).map(tokenToFigmaVariable), "tokens.manifest Figma variable name");
assertUnique(variableMapItems.map((variable) => variable.figmaVariable), "variables-map Figma variable name");
compareSet("variables-map token names", variableMapItems.map((variable) => variable.token), Object.keys(tokenItems));
compareSet(
  "variables-map css variable names",
  variableMapItems.map((variable) => variable.cssVariable),
  Object.values(tokenItems).map((item) => item.css)
);
compareSet(
  "variables-map Figma variable names",
  variableMapItems.map((variable) => variable.figmaVariable),
  Object.keys(tokenItems).map(tokenToFigmaVariable)
);

for (const [token, item] of Object.entries(tokenItems)) {
  const match = variableMapItems.find((variable) => variable.token === token);
  if (!match) {
    fail(`variables-map missing ${token}`);
    continue;
  }
  compareValue(`variables-map ${token} cssVariable`, match.cssVariable, item.css);
  compareValue(`variables-map ${token} figmaVariable`, match.figmaVariable, tokenToFigmaVariable(token));
  compareValue(`variables-map ${token} category`, match.category, token.split(".")[0]);
  compareValue(`variables-map ${token} usage`, match.usage, item.usage);
  compareArray(`variables-map ${token} doNotUseFor`, match.doNotUseFor, item.doNotUseFor ?? []);
  validateNodeId(match.nodeId, `variables-map ${token}`);
}

const expectedVariantKeys = (componentsManifest.components ?? []).flatMap((component) =>
  (component.figma?.variants ?? []).map((figmaProperty) => variantKey(component.name, figmaProperty))
);
const actualVariantKeys = variantMapItems.map((mapping) => variantKey(mapping.codeComponent, mapping.figmaProperty));
const canonicalVariantKeys = Object.entries(variantSpecs).flatMap(([component, axes]) =>
  Object.keys(axes).map((figmaProperty) => variantKey(component, figmaProperty))
);
assertUnique(expectedVariantKeys, "components.manifest Figma variant axis");
assertUnique(actualVariantKeys, "variants-map variant axis");
assertUnique(canonicalVariantKeys, "canonical Figma variant axis");
compareSet("variants-map component axes", actualVariantKeys, expectedVariantKeys);
compareSet("canonical variant component axes", canonicalVariantKeys, expectedVariantKeys);

for (const mapping of variantMapItems) {
  const component = componentsByName.get(mapping.codeComponent);
  if (!component) {
    fail(`variants-map references missing component ${mapping.codeComponent}`);
    continue;
  }
  validateVariantSnapshot(mapping, component);
}

validateVariantSpecsAgainstPublicApi();
runNegativeSelfTests();

if (!process.exitCode) {
  console.log(
    `validate-figma passed: ${componentMapItems.length} components, ${variableMapItems.length} variables, ${variantMapItems.length} variant mappings`
  );
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(resolve(root, file), "utf8"));
  } catch (error) {
    fail(`${file} is not valid JSON: ${error.message}`);
    return {};
  }
}

function flattenTokenGroups(manifest) {
  const result = {};
  for (const [group, value] of Object.entries(manifest)) {
    if (group === "version" || group === "note") continue;
    for (const [token, item] of Object.entries(value)) {
      result[token] = item;
    }
  }
  return result;
}

function validateComponentSnapshot(match, component, report = fail) {
  const label = `component-map ${component.name}`;
  compareValue(`${label} figmaComponent`, match.figmaComponent, component.figma?.component ?? component.name, report);
  compareValue(`${label} importFrom`, match.importFrom, component.importFrom, report);
  compareValue(`${label} category`, match.category, component.category, report);
  compareValue(`${label} layoutRole`, match.layoutRole, component.layoutRole, report);
  compareArray(`${label} requiredProps`, match.requiredProps, component.requiredProps ?? [], report);
  compareArray(`${label} optionalProps`, match.optionalProps, component.optionalProps ?? [], report);
  compareArray(`${label} variants`, match.variants, component.variants ?? [], report);
  compareArray(`${label} figmaVariants`, match.figmaVariants, component.figma?.variants ?? [], report);
  compareArray(`${label} examples`, match.examples, component.examples ?? [], report);
  compareValue(`${label} source`, match.source, "components.manifest.json", report);
  validateNodeId(match.nodeId, label, report);
}

function validateVariantSnapshot(mapping, component, report = fail) {
  const label = `variants-map ${mapping.codeComponent}.${mapping.figmaProperty}`;
  const canonical = variantSpecs[mapping.codeComponent]?.[mapping.figmaProperty];
  if (!canonical) {
    report(`${label} has no canonical variant spec`);
    return;
  }
  compareValue(`${label} figmaComponent`, mapping.figmaComponent, component.figma?.component ?? component.name, report);
  compareArray(`${label} props`, mapping.props, canonical.props, report);
  compareJson(`${label} values`, mapping.values, canonical.values, report);
  compareValue(`${label} source`, mapping.source, "components.manifest.json", report);

  const propNames = new Set([...(component.requiredProps ?? []), ...(component.optionalProps ?? [])]);
  for (const prop of mapping.props ?? []) {
    if (!propNames.has(prop)) report(`${label} maps to unsupported prop ${prop}`);
  }
  for (const [figmaValue, props] of Object.entries(mapping.values ?? {})) {
    if (!isPlainObject(props)) {
      report(`${label}.${figmaValue} must map to a public props object`);
      continue;
    }
    for (const prop of Object.keys(props)) {
      if (!mapping.props?.includes(prop)) report(`${label}.${figmaValue} uses undeclared prop ${prop}`);
    }
  }
  validateNodeId(mapping.nodeId, label, report);
}

function validateVariantSpecsAgainstPublicApi() {
  const typeNames = [...new Set(expectedVariantKeys.map((key) => `${key.split(".")[0]}Props`))].sort();
  const source = [
    `import type { ${typeNames.join(", ")} } from "./src/index";`,
    ...buildCanonicalTypeAssertions(),
    ...buildNegativeTypeAssertions()
  ].join("\n");
  const diagnostics = typecheckVirtualSource(source);
  for (const diagnostic of diagnostics) {
    const position = diagnostic.file && diagnostic.start !== undefined
      ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
      : null;
    const location = position ? ` line ${position.line + 1}:${position.character + 1}` : "";
    fail(`canonical variant public prop contract${location}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`);
  }
  if (!diagnostics.length) {
    console.log("validate-figma public API self-test passed: canonical mappings valid, 8 invalid assignments rejected");
  }
}

function buildCanonicalTypeAssertions() {
  const assertions = [];
  for (const [component, axes] of Object.entries(variantSpecs)) {
    for (const [axis, spec] of Object.entries(axes)) {
      const pickedProps = spec.props.map((prop) => JSON.stringify(prop)).join(" | ");
      for (const [figmaValue, props] of Object.entries(spec.values)) {
        const variable = safeIdentifier(`canonical_${component}_${axis}_${figmaValue}`);
        assertions.push(
          `const ${variable} = ${JSON.stringify(props)} satisfies Partial<Pick<${component}Props, ${pickedProps}>>;`
        );
      }
    }
  }
  return assertions;
}

function buildNegativeTypeAssertions() {
  return [
    "// @ts-expect-error Button Loading belongs to loading:boolean, not disabled",
    'const negative_Button_State = { disabled: "loading" } satisfies Partial<Pick<ButtonProps, "disabled" | "loading">>;',
    "// @ts-expect-error Input status excludes disabled",
    'const negative_Input_State = { status: "disabled" } satisfies Partial<Pick<InputProps, "status" | "disabled">>;',
    "// @ts-expect-error Textarea status excludes disabled",
    'const negative_Textarea_State = { status: "disabled" } satisfies Partial<Pick<TextareaProps, "status" | "disabled">>;',
    "// @ts-expect-error Select status excludes disabled",
    'const negative_Select_State = { status: "disabled" } satisfies Partial<Pick<SelectProps, "status" | "disabled">>;',
    "// @ts-expect-error Switch Loading belongs to loading:boolean, not checked",
    'const negative_Switch_State = { checked: "loading" } satisfies Partial<Pick<SwitchProps, "checked" | "loading">>;',
    "// @ts-expect-error DataSection Empty belongs to empty:ReactNode, not loading",
    'const negative_DataSection_State = { loading: "empty" } satisfies Partial<Pick<DataSectionProps, "loading" | "empty">>;',
    "// @ts-expect-error Upload status excludes success",
    'const negative_Upload_State = { status: "success" } satisfies Partial<Pick<UploadProps, "status" | "disabled">>;',
    "// @ts-expect-error GaugeChart bands must be a GaugeBand array",
    'const negative_GaugeChart_Band = { bands: "bands" } satisfies Partial<Pick<GaugeChartProps, "bands">>;'
  ];
}

function typecheckVirtualSource(source) {
  const configPath = resolve(root, "tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) return [config.error];
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, {
    declaration: false,
    noEmit: true,
    rootDir: root
  }, configPath);
  const virtualFile = resolve(root, "figma-variant-contract.generated.ts");
  const virtualFileKey = normalizeFileName(virtualFile);
  const isVirtualFile = (fileName) => normalizeFileName(fileName) === virtualFileKey;
  const host = ts.createCompilerHost(parsed.options, true);
  const originalFileExists = host.fileExists.bind(host);
  const originalReadFile = host.readFile.bind(host);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.fileExists = (fileName) => isVirtualFile(fileName) || originalFileExists(fileName);
  host.readFile = (fileName) => isVirtualFile(fileName) ? source : originalReadFile(fileName);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) =>
    isVirtualFile(fileName)
      ? ts.createSourceFile(fileName, source, languageVersion, true, ts.ScriptKind.TS)
      : originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
  const program = ts.createProgram({ rootNames: [virtualFile], options: parsed.options, host });
  return ts.getPreEmitDiagnostics(program).filter((diagnostic) => !diagnostic.file || diagnostic.file.fileName === virtualFile);
}

function normalizeFileName(fileName) {
  return resolve(fileName).replace(/\\/g, "/").toLowerCase();
}

function safeIdentifier(value) {
  return value.replace(/[^A-Za-z0-9_$]/g, "_");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function runNegativeSelfTests() {
  const drawer = componentsByName.get("Drawer");
  const drawerMap = componentMapItems.find((item) => item.codeComponent === "Drawer");
  const drawerVariant = variantMapItems.find(
    (item) => item.codeComponent === "Drawer" && item.figmaProperty === "Size"
  );
  if (!drawer || !drawerMap || !drawerVariant) {
    fail("negative self-test fixtures require Drawer component and Size mapping");
    return;
  }

  const componentCases = [
    ["category mutation", "category", (item) => (item.category = "drifted-category")],
    ["layoutRole mutation", "layoutRole", (item) => (item.layoutRole = "drifted-layout")],
    ["examples mutation", "examples", (item) => item.examples.push("examples/drifted.tsx")],
    ["source mutation", "source", (item) => (item.source = "drifted-manifest.json")]
  ];
  const variantCases = [
    ["variant value mutation", "values", (item) => (item.values.Small.size = "xs")],
    ["variant value removal", "values", (item) => delete item.values.Small],
    ["variant value addition", "values", (item) => (item.values.Extra = { size: "xl" })]
  ];

  let passed = 0;
  for (const [name, expectedFragment, mutate] of componentCases) {
    const candidate = structuredClone(drawerMap);
    mutate(candidate);
    const errors = [];
    validateComponentSnapshot(candidate, drawer, (message) => errors.push(message));
    if (!errors.some((message) => message.includes(expectedFragment))) {
      fail(`negative self-test ${name} did not trigger the exact component snapshot validator`);
    } else {
      passed += 1;
    }
  }
  for (const [name, expectedFragment, mutate] of variantCases) {
    const candidate = structuredClone(drawerVariant);
    mutate(candidate);
    const errors = [];
    validateVariantSnapshot(candidate, drawer, (message) => errors.push(message));
    if (!errors.some((message) => message.includes(expectedFragment))) {
      fail(`negative self-test ${name} did not trigger the canonical variant values validator`);
    } else {
      passed += 1;
    }
  }

  if (passed === componentCases.length + variantCases.length) {
    console.log(`validate-figma negative self-test passed: ${passed} drift mutations rejected`);
  }
}

function compareValue(label, actual, expected, report = fail) {
  if (actual !== expected) report(`${label} must be ${JSON.stringify(expected)}; received ${JSON.stringify(actual)}`);
}

function compareArray(label, actual, expected, report = fail) {
  if (!Array.isArray(actual)) {
    report(`${label} must be an array`);
    return;
  }
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    report(`${label} must exactly match ${JSON.stringify(expected)}; received ${JSON.stringify(actual)}`);
  }
}

function compareJson(label, actual, expected, report = fail) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    report(`${label} must exactly match ${JSON.stringify(expected)}; received ${JSON.stringify(actual)}`);
  }
}

function compareSet(label, actual, expected) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = [...expectedSet].filter((item) => !actualSet.has(item));
  const extra = [...actualSet].filter((item) => !expectedSet.has(item));
  if (missing.length || extra.length) {
    fail(`${label} drifted; missing ${JSON.stringify(missing)}, extra ${JSON.stringify(extra)}`);
  }
}

function assertUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) fail(`${label} duplicates ${JSON.stringify(value)}`);
    seen.add(value);
  }
}

function validateNodeId(nodeId, label, report = fail) {
  if (nodeId !== null && (typeof nodeId !== "string" || !nodeId.trim())) {
    report(`${label} nodeId must stay null until Figma is connected, or contain a non-empty Figma node id`);
  }
}

function variantKey(codeComponent, figmaProperty) {
  return `${codeComponent}.${figmaProperty}`;
}

function tokenToFigmaVariable(token) {
  return token
    .split(".")
    .map((part) =>
      part
        .split("-")
        .map((piece) => piece.charAt(0).toUpperCase() + piece.slice(1))
        .join(" ")
    )
    .join("/");
}
