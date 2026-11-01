import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative as pathRelative, resolve, sep } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { isMainThread, workerData } from "node:worker_threads";
import Ajv2020 from "ajv/dist/2020.js";
import ts from "typescript";
import {
  DEFAULT_WORKER_RESOURCE_LIMITS,
  DEFAULT_WORKER_TIMEOUT_MS,
  runBoundedWorker
} from "./bounded-worker.mjs";

const invocationRoot = resolve(process.cwd());
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const realPackageRoot = realpathSync(packageRoot);
const require = createRequire(import.meta.url);
const realTypeScriptRoot = realpathSync(resolve(dirname(require.resolve("typescript")), ".."));
let projectRoot = packageRoot;
let realProjectRoot = realPackageRoot;
let reportsRoot = resolve(projectRoot, "harness/reports");
const allowedForbiddenPatterns = new Set([
  "custom-button-style",
  "hardcoded-brand-color",
  "card-inside-card",
  "direct-third-party-import"
]);

function run(cliArgs) {
  try {
    const cli = parseCliArgs(cliArgs);
    const scenarioPath = resolveScenarioPath(cli.scenario);
    configureProjectRoot(cli.projectRoot, scenarioPath);
    const scenario = readJsonAbsolute(scenarioPath, "scenario");
    const schemaPath = resolveReadablePath(packageRoot, "schema/harness-scenario.schema.json", "scenario schema");
    const scenarioSchema = readJsonAbsolute(schemaPath, "scenario schema");
    validateScenario(scenario, scenarioSchema);

    const sourcePath = resolveReadablePath(projectRoot, scenario.output.file, "output.file");
    const source = readFileSync(sourcePath, "utf8");
    const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const importPolicyPath = resolveReadablePath(packageRoot, "harness/checks/import-policy.json", "import policy");
    const importPolicy = readJsonAbsolute(importPolicyPath, "import policy");
    const importProfile = resolveImportProfile(scenario, importPolicy);
    const findings = [
          ...checkSourceSyntax(sourceFile),
          ...checkComponentUsage(sourceFile, scenario, importProfile),
          ...checkExpectedText(sourceFile, scenario, importProfile),
          ...checkExpectedClassTokens(sourceFile, scenario, importProfile),
          ...checkExpectedStaticValues(sourceFile, scenario, importProfile),
          ...checkTokenUsage(sourceFile, scenario),
          ...checkLayoutRules(sourceFile, scenario, importProfile),
          ...checkAntiPatterns(sourceFile, scenario),
          ...checkForbiddenPatterns(sourceFile, scenario, importProfile),
          ...checkPageFunction(sourceFile, scenario),
          ...checkStaticControlBindings(sourceFile, scenario),
          ...checkPageRegistry(sourceFile, sourcePath, scenario),
          ...checkStatusCopy(sourceFile, scenario, importProfile),
          ...checkExpectedActions(sourceFile, scenario, importProfile),
          ...checkExpectedConfirmations(sourceFile, scenario, importProfile),
          ...checkDataAssertions(sourceFile, scenario)
        ];

    if (!findings.some((finding) => finding.severity === "error")) {
      findings.push(...checkBuildRuntime(scenario));
    }

    const errorCount = findings.filter((finding) => finding.severity === "error").length;
    const warningCount = findings.filter((finding) => finding.severity === "warning").length;
    const score = Math.max(0, 100 - errorCount * 25 - warningCount * 8);
    const report = {
      scenario: scenario.id,
      status: errorCount > 0 ? "failed" : "passed",
      score,
      output: scenario.output.file,
      findings
    };

    const reportPath = resolveReportPath(scenario.report ?? `harness/reports/${scenario.id}.json`);
    mkdirSync(dirname(reportPath), { recursive: true });
    assertWritablePathWithin(projectRoot, reportPath, "report");
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    console.log(`${report.status.toUpperCase()} ${scenario.id}: score ${score}, ${errorCount} errors, ${warningCount} warnings`);
    console.log(`Report: ${relativeToProject(reportPath)}`);

    if (errorCount > 0) {
      for (const finding of findings.filter((item) => item.severity === "error")) {
        console.error(`[${finding.rule}] ${finding.message}`);
      }
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`harness failed: ${sanitizeDiagnostic(error instanceof Error ? error.message : String(error))}`);
    process.exitCode = 1;
  }
}

function parseCliArgs(args) {
  let scenario;
  let explicitProjectRoot;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--scenario" || argument === "--project-root") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a path value`);
      if (argument === "--scenario") {
        if (scenario !== undefined) throw new Error("scenario path was provided more than once");
        scenario = value;
      } else {
        if (explicitProjectRoot !== undefined) throw new Error("--project-root was provided more than once");
        explicitProjectRoot = value;
      }
      index += 1;
      continue;
    }
    if (argument.startsWith("--")) throw new Error(`unsupported option: ${argument}`);
    if (scenario !== undefined) throw new Error("scenario path was provided more than once");
    scenario = argument;
  }

  return { scenario, projectRoot: explicitProjectRoot };
}

function resolveScenarioPath(candidate) {
  const target = candidate === undefined
    ? resolve(packageRoot, "harness/scenarios/build-permissions-list.json")
    : resolveExplicitCliPath(invocationRoot, candidate, "scenario");
  if (!existsSync(target)) throw new Error(`scenario does not exist: ${target}`);
  const realTarget = realpathSync(target);
  const targetStats = statSync(realTarget);
  if (!targetStats.isFile()) throw new Error("scenario must be a file");
  if (targetStats.nlink > 1) throw new Error("scenario must not be a hard link");
  return realTarget;
}

function configureProjectRoot(candidate, scenarioPath) {
  if (candidate !== undefined) {
    const explicitRoot = resolveExplicitCliPath(invocationRoot, candidate, "project root");
    if (!existsSync(explicitRoot)) throw new Error(`project root does not exist: ${explicitRoot}`);
    const realExplicitRoot = realpathSync(explicitRoot);
    if (!statSync(realExplicitRoot).isDirectory()) throw new Error("project root must be a directory");
    projectRoot = realExplicitRoot;
  } else if (isPathWithin(realPackageRoot, scenarioPath)) {
    projectRoot = realPackageRoot;
  } else {
    throw new Error("External scenarios require an explicit --project-root boundary.");
  }
  realProjectRoot = realpathSync(projectRoot);
  reportsRoot = resolve(projectRoot, "harness/reports");
}

function resolveExplicitCliPath(base, candidate, label) {
  assertString(candidate, label);
  if (candidate.includes("\0")) throw new Error(`${label} contains a NUL byte`);
  return isAbsolute(candidate) ? resolve(candidate) : resolve(base, candidate);
}

function readJsonAbsolute(file, label) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function relativeToProject(file) {
  return pathRelative(projectRoot, file).replaceAll("\\", "/");
}

function validateScenario(scenario, schema) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
  const validate = ajv.compile(schema);
  if (!validate(scenario)) {
    const details = (validate.errors ?? [])
      .map((error) => `${error.instancePath || "/"} ${error.message}`)
      .join("; ");
    throw new Error(`scenario schema validation failed: ${details}`);
  }

  for (const actions of [scenario.expectedActions, ...(scenario.expectedActions?.conditions ?? [])].filter(Boolean)) {
    const overlap = (actions.required ?? []).filter((label) => (actions.forbidden ?? []).includes(label));
    if (overlap.length > 0) throw new Error(`action labels cannot be both required and forbidden: ${overlap.join(", ")}`);
  }

  const confirmations = scenario.expectedConfirmations ?? [];
  if (confirmations.length > 0 && !scenario.output?.symbol) {
    throw new Error("expectedConfirmations requires output.symbol");
  }
  const duplicateConfirmationActions = duplicates(confirmations.map((confirmation) => confirmation.action));
  if (duplicateConfirmationActions.length > 0) {
    throw new Error(`confirmation actions must be unique: ${duplicateConfirmationActions.join(", ")}`);
  }
}

function resolveImportProfile(scenario, policy) {
  if (!scenario.foundationContract) {
    if (scenario.id?.startsWith("test-") || scenario.output?.file?.startsWith("harness/tests/fixtures/")) {
      return legacyImportProfile(policy);
    }
    throw new Error("scenario must define foundationContract.businessContext and bind to frontendFoundation.imports");
  }
  const contract = scenario.foundationContract;
  const mode = contract.outputMode;
  const profile = policy.profiles?.[mode];
  if (!profile) throw new Error(`unknown foundation outputMode: ${mode}`);

  const contextPath = resolveReadablePath(projectRoot, contract.businessContext, "foundation businessContext");
  const businessContext = readJsonAbsolute(contextPath, "foundation businessContext");
  if (contract.projectId && businessContext.projectId !== contract.projectId) {
    throw new Error(`foundation businessContext projectId mismatch: expected ${contract.projectId}, got ${businessContext.projectId ?? "<missing>"}`);
  }
  const contextFoundation = businessContext.frontendFoundation;
  if (!contextFoundation?.imports || typeof contextFoundation.imports !== "object") {
    throw new Error("foundation businessContext must define frontendFoundation.imports");
  }
  if (contextFoundation.outputMode !== mode) {
    throw new Error(`foundation outputMode mismatch: scenario ${mode}, businessContext ${contextFoundation.outputMode ?? "<missing>"}`);
  }

  const importContract = contextFoundation.imports;
  const rootImports = uniqueStrings([
    importContract.root,
    contextFoundation.foundation?.packageName,
    contextFoundation.icons?.packageName,
    contextFoundation.reset?.import,
    contextFoundation.theme?.entry
  ]);
  const allowedPackages = uniqueStrings(importContract.allowedPackages ?? []);
  const allowedImports = uniqueStrings([
    ...(policy.reactRuntimeImports ?? []),
    ...allowedPackages,
    ...rootImports
  ]);
  const allowedPrefixes = uniqueStrings([
    ...(policy.reactRuntimePrefixes ?? []),
    ...(importContract.allowedPrefixes ?? []),
    ...allowedPackages.map((source) => `${source}/`),
    ...rootImports.map((source) => `${source}/`)
  ]);
  const allowLocalImports = profile.allowLocalImports === "contract"
    ? Boolean(importContract.allowLocalImports)
    : Boolean(profile.allowLocalImports);

  return {
    mode,
    kitImport: policy.kitImport,
    allowLocalImports,
    allowedImports,
    allowedPrefixes,
    localImportPrefixes: importContract.localImportPrefixes ?? [".", ".."],
    forbiddenDirectImports: uniqueStrings(importContract.forbiddenPackages ?? [])
  };
}

function legacyImportProfile(policy) {
  return {
    mode: policy.defaultProfile ?? "kit-consumer",
    kitImport: policy.kitImport,
    allowLocalImports: true,
    allowedImports: uniqueStrings([...(policy.reactRuntimeImports ?? []), policy.kitImport]),
    allowedPrefixes: uniqueStrings([...(policy.reactRuntimePrefixes ?? []), `${policy.kitImport}/`]),
    localImportPrefixes: [".", ".."],
    forbiddenDirectImports: uniqueStrings(policy.forbiddenDirectImports ?? [])
  };
}

function assertString(value, label, pattern) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} must be a non-empty string`);
  if (pattern && !pattern.test(value)) throw new Error(`${label} has an invalid value: ${value}`);
}

function resolveReadablePath(base, candidate, label) {
  const file = resolveContainedPath(base, candidate, label);
  if (!existsSync(file)) throw new Error(`${label} does not exist: ${relativeToProject(file)}`);
  const realFile = realpathSync(file);
  assertPathWithin(realpathSync(base), realFile, label);
  const fileStats = statSync(realFile);
  if (fileStats.isFile() && fileStats.nlink > 1) throw new Error(`${label} must not be a hard link`);
  return realFile;
}

function resolveReportPath(candidate) {
  const reportPath = resolveContainedPath(projectRoot, candidate, "report");
  assertPathWithin(reportsRoot, reportPath, "report");
  assertWritablePathWithin(projectRoot, reportPath, "report");
  return reportPath;
}

function resolveContainedPath(base, candidate, label) {
  assertString(candidate, label);
  if (candidate.includes("\0") || isAbsolute(candidate)) {
    throw new Error(`${label} must be a relative path inside the workspace`);
  }
  const target = resolve(base, candidate);
  assertPathWithin(base, target, label);
  return target;
}

function assertPathWithin(base, target, label) {
  if (isPathWithin(base, target)) return;
  throw new Error(`${label} resolves outside its allowed root`);
}

function isPathWithin(base, target) {
  const relation = pathRelative(base, target);
  return relation === "" || (!isAbsolute(relation) && relation !== ".." && !relation.startsWith(`..${sep}`));
}

function assertRealParentWithin(base, target, label) {
  let existingParent = dirname(target);
  while (!existsSync(existingParent)) {
    const next = dirname(existingParent);
    if (next === existingParent) break;
    existingParent = next;
  }
  const realBase = realpathSync(base);
  const realParent = realpathSync(existingParent);
  assertPathWithin(realBase, realParent, label);
}

function assertWritablePathWithin(base, target, label) {
  assertRealParentWithin(base, target, label);
  try {
    const targetStats = lstatSync(target);
    if (targetStats.isSymbolicLink()) throw new Error(`${label} must not be a symbolic link`);
    if (targetStats.isFile() && targetStats.nlink > 1) throw new Error(`${label} must not be a hard link`);
    assertPathWithin(realpathSync(base), realpathSync(target), label);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return;
    throw error;
  }
}

function checkSourceSyntax(sourceFile) {
  return (sourceFile.parseDiagnostics ?? []).map((diagnostic) => ({
    rule: "source-syntax",
    severity: "error",
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
  }));
}

function findTopLevelVariables(sourceFile, name) {
  const matches = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name) {
        matches.push({ declaration, statement });
      }
    }
  }
  return matches;
}

function findTopLevelFunctions(sourceFile, name) {
  return sourceFile.statements.filter(
    (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name
  );
}

function findLexicalRenderFunctions(node, name) {
  for (let scope = node.parent; scope; scope = scope.parent) {
    if (!ts.isBlock(scope) && !ts.isSourceFile(scope)) continue;
    const bindings = [];
    for (const statement of scope.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) bindings.push(statement);
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === name) bindings.push(declaration);
      }
    }
    if (bindings.length === 0) continue;
    return bindings.flatMap((binding) => {
      if (ts.isFunctionDeclaration(binding)) return [binding];
      const initializer = unwrapExpression(binding.initializer);
      return (binding.parent.flags & ts.NodeFlags.Const) && initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) ? [initializer] : [];
    });
  }
  return [];
}

function staticPropertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

function parseStaticObject(node, label) {
  const entries = new Map();
  const errors = [];
  if (!node || !ts.isObjectLiteralExpression(node)) {
    return { entries, errors: [`${label} must be an object literal`] };
  }
  for (const [index, property] of node.properties.entries()) {
    if (!ts.isPropertyAssignment(property)) {
      errors.push(`${label} item ${index} uses unsupported property syntax`);
      continue;
    }
    const key = staticPropertyName(property.name);
    if (key === null) {
      errors.push(`${label} item ${index} uses a computed property`);
      continue;
    }
    if (entries.has(key)) {
      errors.push(`${label} contains duplicate decoded key "${key}"`);
      continue;
    }
    entries.set(key, property.initializer);
  }
  return { entries, errors };
}

function staticString(node) {
  return node && ts.isStringLiteralLike(node) ? node.text : null;
}

function staticPrimitiveValue(node, seen = new Set()) {
  const expression = unwrapExpression(node);
  if (!expression) return { known: false };
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return { known: true, value: true };
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return { known: true, value: false };
  if (expression.kind === ts.SyntaxKind.NullKeyword) return { known: true, value: null };
  if (ts.isNumericLiteral(expression)) return { known: true, value: Number(expression.text) };
  if (ts.isBigIntLiteral(expression)) {
    try {
      return { known: true, value: BigInt(expression.text.replace(/n$/i, "")) };
    } catch {
      return { known: false };
    }
  }
  if (ts.isStringLiteralLike(expression)) return { known: true, value: expression.text };
  if (ts.isIdentifier(expression) && expression.text === "undefined") return { known: true, value: undefined };
  if (ts.isIdentifier(expression) && expression.text === "NaN") return { known: true, value: Number.NaN };
  if (ts.isIdentifier(expression)) {
    const resolved = resolveLexicalConstInitializer(expression, seen);
    if (resolved) return staticPrimitiveValue(resolved.initializer, new Set([...seen, resolved.declaration]));
  }
  if (ts.isVoidExpression(expression)) return { known: true, value: undefined };
  if (ts.isPrefixUnaryExpression(expression)) {
    if (expression.operator === ts.SyntaxKind.ExclamationToken) {
      const operand = staticBoolean(expression.operand, seen);
      return operand === null ? { known: false } : { known: true, value: !operand };
    }
    const operand = staticPrimitiveValue(expression.operand, seen);
    if (!operand.known) return { known: false };
    if (expression.operator === ts.SyntaxKind.PlusToken) {
      if (typeof operand.value === "bigint") return { known: false };
      return { known: true, value: Number(operand.value) };
    }
    if (expression.operator === ts.SyntaxKind.MinusToken) {
      if (typeof operand.value === "bigint") return { known: true, value: -operand.value };
      return { known: true, value: -Number(operand.value) };
    }
  }
  if (ts.isBinaryExpression(expression)) {
    const left = staticPrimitiveValue(expression.left, seen);
    const right = staticPrimitiveValue(expression.right, seen);
    if (!left.known || !right.known) return { known: false };
    switch (expression.operatorToken.kind) {
      case ts.SyntaxKind.EqualsEqualsEqualsToken:
        return { known: true, value: left.value === right.value };
      case ts.SyntaxKind.ExclamationEqualsEqualsToken:
        return { known: true, value: left.value !== right.value };
      case ts.SyntaxKind.EqualsEqualsToken:
        // eslint-disable-next-line eqeqeq
        return { known: true, value: left.value == right.value };
      case ts.SyntaxKind.ExclamationEqualsToken:
        // eslint-disable-next-line eqeqeq
        return { known: true, value: left.value != right.value };
      case ts.SyntaxKind.GreaterThanToken:
        return { known: true, value: left.value > right.value };
      case ts.SyntaxKind.GreaterThanEqualsToken:
        return { known: true, value: left.value >= right.value };
      case ts.SyntaxKind.LessThanToken:
        return { known: true, value: left.value < right.value };
      case ts.SyntaxKind.LessThanEqualsToken:
        return { known: true, value: left.value <= right.value };
      default:
        return { known: false };
    }
  }
  return { known: false };
}

function unwrapExpression(node) {
  let current = node;
  while (current && (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isSatisfiesExpression(current))) {
    current = current.expression;
  }
  return current;
}

function walkAst(node, visitor, { skipNestedFunctions = false, rootFunction = null } = {}) {
  const visit = (current) => {
    if (skipNestedFunctions && current !== rootFunction && ts.isFunctionLike(current)) return;
    visitor(current);
    ts.forEachChild(current, visit);
  };
  visit(node);
}

function jsxTagName(node) {
  return ts.isIdentifier(node.tagName) ? node.tagName.text : node.tagName.getText();
}

function kitImportBindings(sourceFile, kitImport = "@ai-readable/kit") {
  const bindings = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteralLike(statement.moduleSpecifier) || statement.moduleSpecifier.text !== kitImport) continue;
    const named = statement.importClause?.namedBindings;
    if (!named || !ts.isNamedImports(named)) continue;
    for (const element of named.elements) bindings.set(element.name.text, element.propertyName?.text ?? element.name.text);
  }
  return bindings;
}

function namedImportBindings(sourceFile, moduleSource, importedName) {
  const bindings = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteralLike(statement.moduleSpecifier) || statement.moduleSpecifier.text !== moduleSource) continue;
    const named = statement.importClause?.namedBindings;
    if (!named || !ts.isNamedImports(named)) continue;
    for (const element of named.elements) {
      if ((element.propertyName?.text ?? element.name.text) === importedName) bindings.push(element.name.text);
    }
  }
  return bindings;
}

function canonicalKitTag(sourceFile, opening, kitImport = "@ai-readable/kit") {
  const raw = jsxTagName(opening);
  if (/^[a-z]/.test(raw)) return raw;
  return kitImportBindings(sourceFile, kitImport).get(raw) ?? null;
}

function bindingContainsName(binding, name) {
  return ts.isIdentifier(binding)
    ? binding.text === name
    : binding.elements.some((element) => !ts.isOmittedExpression(element) && bindingContainsName(element.name, name));
}

function hasLexicalRuntimeShadow(node, name, stopAt = null) {
  for (let current = node.parent; current && !ts.isSourceFile(current) && current !== stopAt; current = current.parent) {
    if (ts.isFunctionLike(current) && (
      current.parameters.some((parameter) => bindingContainsName(parameter.name, name)) ||
      ((ts.isFunctionExpression(current) || ts.isFunctionDeclaration(current)) && current.name?.text === name)
    )) return true;
    if (ts.isCatchClause(current) && current.variableDeclaration && bindingContainsName(current.variableDeclaration.name, name)) return true;
    if (!ts.isBlock(current)) continue;
    for (const statement of current.statements) {
      if (ts.isVariableStatement(statement) && statement.declarationList.declarations.some((declaration) => bindingContainsName(declaration.name, name))) return true;
      if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name?.text === name) return true;
    }
  }
  return false;
}

function accessRootIdentifier(node) {
  let current = unwrapExpression(node);
  while (current && (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current))) current = unwrapExpression(current.expression);
  return current && ts.isIdentifier(current) ? current : null;
}

function astWritesBinding(root, name) {
  let written = false;
  walkAst(root, (node) => {
    if (written) return;
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      written = accessRootIdentifier(node.left)?.text === name;
    } else if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)) {
      written = accessRootIdentifier(node.operand)?.text === name;
    } else if (ts.isDeleteExpression(node)) {
      written = accessRootIdentifier(node.expression)?.text === name;
    }
  });
  return written;
}

function functionWritesBinding(functionNode, name) {
  return Boolean(functionNode?.body && astWritesBinding(functionNode.body, name));
}

function functionBindingEscapes(functionNode, name) {
  let escapes = false;
  walkAst(functionNode.body, (node) => {
    if (escapes || !ts.isIdentifier(node) || node.text !== name || hasLexicalRuntimeShadow(node, name, functionNode)) return;
    if (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) return;
    let usage = node;
    while (
      usage.parent && (
        ((ts.isPropertyAccessExpression(usage.parent) || ts.isElementAccessExpression(usage.parent)) && usage.parent.expression === usage) ||
        ts.isParenthesizedExpression(usage.parent) || ts.isAsExpression(usage.parent) || ts.isSatisfiesExpression(usage.parent)
      )
    ) usage = usage.parent;
    const parent = usage.parent;
    if ((ts.isCallExpression(parent) || ts.isNewExpression(parent)) && (parent.arguments ?? []).includes(usage)) escapes = true;
    else if (ts.isCallExpression(parent) && parent.expression === usage) escapes = true;
    else if (ts.isVariableDeclaration(parent) && parent.initializer === usage) escapes = true;
    else if (
      ts.isBinaryExpression(parent) && parent.right === usage &&
      parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    ) escapes = true;
    else if (ts.isReturnStatement(parent) && parent.expression === usage) escapes = true;
    else if ((ts.isSpreadElement(parent) || ts.isSpreadAssignment(parent)) && parent.expression === usage) escapes = true;
  });
  return escapes;
}

function sourceBindingIsStable(sourceFile, name) {
  if (astWritesBinding(sourceFile, name)) return false;
  let unsafe = false;
  walkAst(sourceFile, (node) => {
    if (unsafe) return;
    if ((ts.isCallExpression(node) || ts.isNewExpression(node)) && (node.arguments ?? []).some((argument) => accessRootIdentifier(argument)?.text === name)) unsafe = true;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text !== name && accessRootIdentifier(node.initializer)?.text === name) unsafe = true;
  });
  return !unsafe;
}

function hasRuntimeShadow(sourceFile, name, { allowTopLevelFunction = false } = {}) {
  let shadowed = false;
  const bindingContains = (binding) => {
    if (ts.isIdentifier(binding)) return binding.text === name;
    return binding.elements.some((element) => !ts.isOmittedExpression(element) && bindingContains(element.name));
  };
  walkAst(sourceFile, (node) => {
    if (shadowed || ts.isImportSpecifier(node)) return;
    if (allowTopLevelFunction && ts.isFunctionDeclaration(node) && node.parent === sourceFile && node.name?.text === name) return;
    if ((ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) && bindingContains(node.name)) shadowed = true;
    else if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node)) && node.name?.text === name) shadowed = true;
  });
  return shadowed;
}

function getJsxAttribute(attributes, name) {
  return attributes.properties.find(
    (property) => ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === name
  );
}

function jsxStringAttribute(attributes, name) {
  const attribute = getJsxAttribute(attributes, name);
  return attribute?.initializer && ts.isStringLiteral(attribute.initializer) ? attribute.initializer.text : null;
}

function jsxStaticBooleanAttribute(attributes, name) {
  const matches = attributes.properties.filter(
    (property) => ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === name
  );
  if (matches.length === 0) return { known: true, value: false };
  if (matches.length !== 1) return { known: false };
  const attribute = matches[0];
  if (attribute.initializer === undefined) return { known: true, value: true };
  const expression = attribute.initializer && ts.isJsxExpression(attribute.initializer)
    ? unwrapExpression(attribute.initializer.expression)
    : null;
  if (expression?.kind === ts.SyntaxKind.TrueKeyword) return { known: true, value: true };
  if (expression?.kind === ts.SyntaxKind.FalseKeyword) return { known: true, value: false };
  return { known: false };
}

function checkPageFunction(sourceFile, currentScenario) {
  const symbol = currentScenario.output.symbol;
  if (!symbol) return [];
  const functions = findTopLevelFunctions(sourceFile, symbol);
  if (functions.length !== 1) {
    return [{ rule: "page-return", severity: "error", message: `Expected exactly one top-level function ${symbol}; found ${functions.length}.` }];
  }
  return validatePageReturnsJsx(functions[0], symbol);
}

function checkStaticControlBindings(sourceFile, currentScenario) {
  const findings = [];
  const seen = new Set();
  const checkIdentifier = (identifier) => {
    if (ts.isPropertyAccessExpression(identifier.parent) && identifier.parent.name === identifier) return;
    for (let scope = identifier.parent; scope && !ts.isSourceFile(scope); scope = scope.parent) {
      if (ts.isFunctionLike(scope) && scope.parameters.some((parameter) => bindingContainsName(parameter.name, identifier.text))) return;
      if (!ts.isBlock(scope)) continue;
      const matches = scope.statements.flatMap((statement) => ts.isVariableStatement(statement)
        ? [...statement.declarationList.declarations].filter((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === identifier.text).map((declaration) => ({ declaration, statement }))
        : []);
      if (matches.length === 0) continue;
      const match = matches.length === 1 ? matches[0] : null;
      if (match && (match.statement.declarationList.flags & ts.NodeFlags.Const) && match.declaration.pos >= identifier.pos) {
        const key = `${identifier.text}:${identifier.pos}`;
        if (!seen.has(key)) {
          seen.add(key);
          findings.push({ rule: "static-control", severity: "error", message: `Reachable render control reads local const ${identifier.text} before its declaration.` });
        }
      }
      return;
    }
  };
  for (const root of scenarioEvidenceRoots(sourceFile, currentScenario)) {
    walkRenderableAst(root, (node) => {
      let control = null;
      if (ts.isConditionalExpression(node)) control = node.condition;
      else if (ts.isBinaryExpression(node) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)) control = node.left;
      if (control) walkAst(control, (candidate) => {
        if (ts.isIdentifier(candidate)) checkIdentifier(candidate);
      }, { skipNestedFunctions: true });
    });
  }
  return findings;
}

function validatePageReturnsJsx(functionNode, label) {
  if (!functionNode.body) return [{ rule: "page-return", severity: "error", message: `${label} must have a function body.` }];
  const allReturns = [];
  walkAst(functionNode.body, (node) => {
    if (ts.isReturnStatement(node)) allReturns.push(node);
  }, { skipNestedFunctions: true, rootFunction: functionNode });
  const topLevelReturns = functionNode.body.statements.filter(ts.isReturnStatement);
  if (allReturns.length !== 1 || topLevelReturns.length !== 1 || allReturns[0] !== topLevelReturns[0]) {
    return [{ rule: "page-return", severity: "error", message: `${label} must have exactly one top-level JSX return; nested or multiple page returns are forbidden.` }];
  }
  const expression = unwrapExpression(topLevelReturns[0].expression);
  const reachable = analyzeReachableFunctionReturns(functionNode);
  if (reachable.expressions.length !== 1 || reachable.expressions[0] !== expression) {
    return [{ rule: "page-return", severity: "error", message: `${label}'s JSX return must be reachable on the page execution path.` }];
  }
  return expression && (ts.isJsxElement(expression) || ts.isJsxSelfClosingElement(expression) || ts.isJsxFragment(expression))
    ? []
    : [{ rule: "page-return", severity: "error", message: `${label} must return JSX directly; null, data, and dead-code stand-ins are forbidden.` }];
}

function validateRegistryFunctionReturnsJsx(functionNode, label) {
  const result = analyzeReachableFunctionReturns(functionNode);
  const invalid = result.expressions.filter((expression) => !isJsxRoot(expression));
  return result.expressions.length === 0 || result.fallsThrough || invalid.length > 0
    ? [{ rule: "page-return", severity: "error", message: `${label} must return JSX on every reachable path; fallthrough, null, data, and dead-code stand-ins are forbidden.` }]
    : [];
}

function scenarioEvidenceRoots(sourceFile, currentScenario) {
  return expandLocalRenderRoots(sourceFile, scenarioEntryRoots(sourceFile, currentScenario));
}

function scenarioEntryRoots(sourceFile, currentScenario) {
  const scope = scenarioAstScope(sourceFile, currentScenario);
  if (currentScenario.output.symbol) {
    if (!scope || !ts.isFunctionDeclaration(scope) || !scope.body) return [];
    const returns = scope.body.statements.filter(ts.isReturnStatement);
    return returns.length === 1 ? [unwrapExpression(returns[0].expression)].filter(Boolean) : [];
  }
  return collectRegisteredEntryRoots(sourceFile);
}

function scenarioEntryFunctions(sourceFile, currentScenario) {
  if (currentScenario.output.symbol) {
    const scope = scenarioAstScope(sourceFile, currentScenario);
    return scope && ts.isFunctionDeclaration(scope) ? [scope] : [];
  }
  const declarations = findTopLevelVariables(sourceFile, "generatedComponents");
  if (declarations.length !== 1) return [];
  const registry = parseStaticObject(unwrapExpression(declarations[0].declaration.initializer), "generatedComponents");
  if (registry.errors.length > 0 || registry.entries.size === 0) return [];
  return [...registry.entries.values()].flatMap((initializer) => {
    const factory = unwrapExpression(initializer);
    return factory && ts.isArrowFunction(factory) && !ts.isBlock(factory.body) && isJsxRoot(unwrapExpression(factory.body)) ? [factory] : [];
  });
}

function collectRegisteredEntryRoots(sourceFile) {
  const declarations = findTopLevelVariables(sourceFile, "generatedComponents");
  if (declarations.length !== 1) return [];
  const registry = parseStaticObject(unwrapExpression(declarations[0].declaration.initializer), "generatedComponents");
  if (registry.errors.length > 0 || registry.entries.size === 0) return [];
  const roots = [];
  for (const initializer of registry.entries.values()) {
    const factory = unwrapExpression(initializer);
    if (!factory || !ts.isArrowFunction(factory) || ts.isBlock(factory.body)) return [];
    const root = unwrapExpression(factory.body);
    if (!root || !isJsxRoot(root)) return [];
    roots.push(root);
  }
  return roots;
}

function expandLocalRenderRoots(sourceFile, initialRoots) {
  const roots = [...initialRoots];
  const queue = [...initialRoots];
  const visitedFunctions = new Set();
  while (queue.length > 0) {
    const root = queue.shift();
    walkRenderableAst(root, (node) => {
      const opening = ts.isJsxSelfClosingElement(node) ? node : ts.isJsxElement(node) ? node.openingElement : null;
      if (!opening || !ts.isIdentifier(opening.tagName) || !/^[A-Z]/.test(opening.tagName.text)) return;
      const name = opening.tagName.text;
      if (visitedFunctions.has(name)) return;
      const functions = findLexicalRenderFunctions(opening, name);
      if (functions.length !== 1) return;
      visitedFunctions.add(name);
      for (const expression of functionRenderRoots(functions[0])) {
        roots.push(expression);
        queue.push(expression);
      }
    });
  }
  return roots;
}

function isJsxRoot(node) {
  return ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node);
}

function collectReachableFunctionReturnExpressions(functionNode) {
  return analyzeReachableFunctionReturns(functionNode).expressions;
}

function functionRenderRoots(functionNode) {
  if (ts.isArrowFunction(functionNode) && !ts.isBlock(functionNode.body)) {
    return [unwrapExpression(functionNode.body)].filter(Boolean);
  }
  return collectReachableFunctionReturnExpressions(functionNode);
}

function renderFunctionChildrenBindings(functionNode) {
  const parameter = functionNode.parameters[0]?.name;
  const direct = parameter && ts.isObjectBindingPattern(parameter)
    ? parameter.elements.find((element) => staticPropertyName(element.propertyName ?? element.name) === "children" && ts.isIdentifier(element.name))?.name.text ?? null
    : null;
  const props = parameter && ts.isIdentifier(parameter) ? parameter.text : null;
  return { direct, props };
}

function referencesChildrenBinding(node, bindings) {
  const expression = unwrapExpression(node);
  return Boolean(
    (bindings.direct && ts.isIdentifier(expression) && expression.text === bindings.direct) ||
    (bindings.props && ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression) &&
      expression.expression.text === bindings.props && expression.name.text === "children")
  );
}

function renderFunctionConsumesChildren(functionNode) {
  const bindings = renderFunctionChildrenBindings(functionNode);
  if (!bindings.direct && !bindings.props) return false;
  return functionRenderRoots(functionNode).some((root) => {
    let consumed = false;
    walkRenderableAst(root, (node) => {
      if (!consumed && ts.isJsxExpression(node) && referencesChildrenBinding(node.expression, bindings)) consumed = true;
    });
    return consumed;
  });
}

function jsxElementChildrenAreRenderable(opening) {
  const sourceFile = opening.getSourceFile();
  const tagName = jsxTagName(opening);
  if (/^[a-z]/.test(tagName)) return true;
  if (canonicalKitTag(sourceFile, opening)) return true;
  if (!ts.isIdentifier(opening.tagName)) return false;
  const functions = findLexicalRenderFunctions(opening, opening.tagName.text);
  return functions.length === 1 && renderFunctionConsumesChildren(functions[0]);
}

function jsxOpeningOwnPropsAreRenderable(opening) {
  const sourceFile = opening.getSourceFile();
  const tagName = jsxTagName(opening);
  return /^[a-z]/.test(tagName) || Boolean(canonicalKitTag(sourceFile, opening));
}

function analyzeReachableFunctionReturns(functionNode) {
  if (!functionNode.body || !ts.isBlock(functionNode.body)) return { expressions: [], fallsThrough: true };
  const analyzeStatements = (statements) => {
    const expressions = [];
    let fallsThrough = true;
    for (const statement of statements) {
      if (!fallsThrough) break;
      const result = analyzeStatement(statement);
      expressions.push(...result.expressions);
      fallsThrough = result.fallsThrough;
    }
    return { expressions, fallsThrough };
  };
  const analyzeStatement = (statement) => {
    if (ts.isReturnStatement(statement)) return { expressions: [unwrapExpression(statement.expression)].filter(Boolean), fallsThrough: false };
    if (ts.isThrowStatement(statement)) return { expressions: [], fallsThrough: false };
    if (ts.isBlock(statement)) return analyzeStatements(statement.statements);
    if (ts.isIfStatement(statement)) {
      const constant = staticBoolean(statement.expression);
      if (constant === true) return analyzeStatement(statement.thenStatement);
      if (constant === false) return statement.elseStatement ? analyzeStatement(statement.elseStatement) : { expressions: [], fallsThrough: true };
      const thenResult = analyzeStatement(statement.thenStatement);
      const elseResult = statement.elseStatement ? analyzeStatement(statement.elseStatement) : { expressions: [], fallsThrough: true };
      return {
        expressions: [...thenResult.expressions, ...elseResult.expressions],
        fallsThrough: thenResult.fallsThrough || elseResult.fallsThrough
      };
    }
    if (ts.isWhileStatement(statement) && staticBoolean(statement.expression) === false) {
      return { expressions: [], fallsThrough: true };
    }
    if (
      ts.isForStatement(statement) || ts.isForInStatement(statement) || ts.isForOfStatement(statement) ||
      ts.isWhileStatement(statement) || ts.isDoStatement(statement) || ts.isSwitchStatement(statement) ||
      ts.isTryStatement(statement) || ts.isWithStatement(statement)
    ) {
      const expressions = [];
      walkAst(statement, (node) => {
        if (ts.isReturnStatement(node)) expressions.push(unwrapExpression(node.expression));
      }, { skipNestedFunctions: true });
      const infiniteWhile = (ts.isWhileStatement(statement) || ts.isDoStatement(statement)) && staticBoolean(statement.expression) === true;
      const infiniteFor = ts.isForStatement(statement) && !statement.condition;
      return { expressions: expressions.filter(Boolean), fallsThrough: !(infiniteWhile || infiniteFor) };
    }
    return { expressions: [], fallsThrough: true };
  };
  return analyzeStatements(functionNode.body.statements);
}

function resolveLexicalConstInitializer(identifier, seen) {
  if (!ts.isIdentifier(identifier)) return null;
  const sourceFile = identifier.getSourceFile();
  const bindingContains = (binding) => ts.isIdentifier(binding)
    ? binding.text === identifier.text
    : binding.elements.some((element) => !ts.isOmittedExpression(element) && bindingContains(element.name));
  const bindingsInStatements = (statements) => {
    const bindings = [];
    for (const statement of statements) {
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (bindingContains(declaration.name)) bindings.push({ declaration, statement });
        }
      } else if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name?.text === identifier.text) {
        bindings.push({ declaration: statement, statement });
      }
    }
    return bindings;
  };
  const nestedInFunction = (() => {
    for (let current = identifier.parent; current && current !== sourceFile; current = current.parent) if (ts.isFunctionLike(current)) return true;
    return false;
  })();
  for (let current = identifier.parent; current; current = current.parent) {
    if (ts.isFunctionLike(current) && (
      current.parameters.some((parameter) => bindingContains(parameter.name)) ||
      ((ts.isFunctionExpression(current) || ts.isFunctionDeclaration(current)) && current.name?.text === identifier.text)
    )) return null;
    if (ts.isCatchClause(current) && current.variableDeclaration && bindingContains(current.variableDeclaration.name)) return null;
    if (ts.isBlock(current) || ts.isSourceFile(current)) {
      const bindings = bindingsInStatements(current.statements);
      if (bindings.length > 0) {
        if (bindings.length !== 1 || !ts.isVariableDeclaration(bindings[0].declaration)) return null;
        const { declaration, statement } = bindings[0];
        if (!(statement.declarationList.flags & ts.NodeFlags.Const) || !declaration.initializer || seen.has(declaration)) return null;
        if (ts.isBlock(current) && declaration.pos >= identifier.pos) return null;
        if (ts.isSourceFile(current) && !nestedInFunction && declaration.pos >= identifier.pos) return null;
        return { declaration, initializer: declaration.initializer };
      }
    }
  }
  return null;
}

function staticBoolean(node, seen = new Set()) {
  const expression = unwrapExpression(node);
  if (!expression) return null;
  const primitive = staticPrimitiveValue(expression, seen);
  if (primitive.known) return Boolean(primitive.value);
  if (isJsxRoot(expression) || ts.isObjectLiteralExpression(expression) || ts.isArrayLiteralExpression(expression) || ts.isFunctionLike(expression)) return true;
  return null;
}

function staticNullish(node, seen = new Set()) {
  const expression = unwrapExpression(node);
  if (!expression) return null;
  if (expression.kind === ts.SyntaxKind.NullKeyword || ts.isVoidExpression(expression)) return true;
  if (ts.isIdentifier(expression) && expression.text === "undefined") return true;
  if (ts.isIdentifier(expression)) {
    const resolved = resolveLexicalConstInitializer(expression, seen);
    if (resolved) return staticNullish(resolved.initializer, new Set([...seen, resolved.declaration]));
  }
  if (
    expression.kind === ts.SyntaxKind.TrueKeyword || expression.kind === ts.SyntaxKind.FalseKeyword ||
    ts.isStringLiteralLike(expression) || ts.isNumericLiteral(expression) || ts.isBigIntLiteral(expression) ||
    isJsxRoot(expression) || ts.isObjectLiteralExpression(expression) || ts.isArrayLiteralExpression(expression) ||
    ts.isFunctionLike(expression)
  ) return false;
  return null;
}

function renderCallbackRoots(node) {
  const parent = node.parent;
  const propertyName = parent && ts.isPropertyAssignment(parent) ? staticPropertyName(parent.name) : null;
  let propertyContainer = parent;
  while (propertyContainer && !ts.isJsxAttribute(propertyContainer)) propertyContainer = propertyContainer.parent;
  const owner = propertyContainer && ts.isJsxAttributes(propertyContainer.parent) ? propertyContainer.parent.parent : null;
  const isColumnsRenderer = Boolean(
    propertyName === "render" && propertyContainer?.name?.text === "columns" && owner &&
    (ts.isJsxOpeningElement(owner) || ts.isJsxSelfClosingElement(owner)) &&
    ["DataGrid", "Table"].includes(canonicalKitTag(node.getSourceFile(), owner))
  );
  const call = parent && ts.isCallExpression(parent) ? parent : null;
  const isMapCallback = Boolean(
    call && call.arguments.includes(node) && ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === "map" &&
    ts.isJsxExpression(call.parent) && !ts.isJsxAttribute(call.parent.parent)
  );
  if (!isColumnsRenderer && !isMapCallback) return [];
  if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) return [unwrapExpression(node.body)].filter(Boolean);
  return collectReachableFunctionReturnExpressions(node);
}

function walkRenderableAst(node, visitor) {
  const visit = (current) => {
    if (ts.isFunctionLike(current)) {
      visitor(current);
      for (const root of renderCallbackRoots(current)) visit(root);
      return;
    }
    visitor(current);
    if (ts.isJsxSelfClosingElement(current)) {
      if (jsxOpeningOwnPropsAreRenderable(current)) ts.forEachChild(current, visit);
      return;
    }
    if (ts.isJsxElement(current)) {
      if (jsxOpeningOwnPropsAreRenderable(current.openingElement)) ts.forEachChild(current.openingElement, visit);
      if (jsxElementChildrenAreRenderable(current.openingElement)) {
        for (const child of current.children) visit(child);
      }
      return;
    }
    if (ts.isConditionalExpression(current)) {
      const constant = staticBoolean(current.condition);
      if (constant === true) visit(current.whenTrue);
      else if (constant === false) visit(current.whenFalse);
      else {
        visit(current.whenTrue);
        visit(current.whenFalse);
      }
      return;
    }
    if (ts.isBinaryExpression(current) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken].includes(current.operatorToken.kind)) {
      const constant = staticBoolean(current.left);
      if (current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
        if (constant !== false) visit(current.right);
      } else if (constant === true) {
        visit(current.left);
      } else if (constant === false) {
        visit(current.right);
      } else {
        visit(current.left);
        visit(current.right);
      }
      return;
    }
    if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
      const nullish = staticNullish(current.left);
      if (nullish === false) visit(current.left);
      else if (nullish === true) visit(current.right);
      else {
        visit(current.left);
        visit(current.right);
      }
      return;
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
}

function collectJsxOpenings(roots) {
  const openings = [];
  for (const rootNode of roots) {
    walkRenderableAst(rootNode, (node) => {
      if (ts.isJsxSelfClosingElement(node)) openings.push(node);
      else if (ts.isJsxElement(node)) openings.push(node.openingElement);
    });
  }
  return openings;
}

function collectModuleSources(sourceFile) {
  const sources = new Set();
  walkAst(sourceFile, (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      sources.add(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const isImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      if (isImport || isRequire) {
        const source = staticString(node.arguments[0]);
        if (source !== null) sources.add(source);
      }
    }
  });
  return [...sources];
}

function hasDynamicModuleLoad(sourceFile) {
  let dynamic = false;
  walkAst(sourceFile, (node) => {
    if (!ts.isCallExpression(node)) return;
    const isImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
    const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
    if ((isImport || isRequire) && (node.arguments.length !== 1 || staticString(node.arguments[0]) === null)) dynamic = true;
  });
  return dynamic;
}

function isLocalModuleSource(source, profile) {
  const prefixes = profile.localImportPrefixes ?? [".", ".."];
  return prefixes.some((prefix) => source === prefix || source.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`));
}

function importProfileViolation(source, profile) {
  if (profile.allowLocalImports && isLocalModuleSource(source, profile)) return null;
  if (profile.allowedImports.includes(source)) return null;
  if (profile.allowedPrefixes.some((prefix) => source.startsWith(prefix))) return null;
  const explicitForbidden = profile.forbiddenDirectImports.find((prefix) => source === prefix || source.startsWith(prefix));
  if (explicitForbidden) return { source, reason: "forbidden" };
  return { source, reason: "not-allowed" };
}

function collectImportProfileViolations(sourceFile, profile) {
  return collectModuleSources(sourceFile)
    .map((source) => importProfileViolation(source, profile))
    .filter(Boolean);
}

function collectStaticEvidence(roots) {
  const values = [];
  for (const rootNode of roots) {
    walkRenderableAst(rootNode, (node) => {
      if (ts.isStringLiteralLike(node) || ts.isJsxText(node)) values.push(node.text);
      else if (ts.isTemplateExpression(node)) {
        values.push(node.head.text, ...node.templateSpans.map((span) => span.literal.text));
      }
    });
  }
  return values;
}

function collectStaticEvidenceDeep(roots) {
  const values = [];
  for (const rootNode of roots) {
    walkAst(rootNode, (node) => {
      if (ts.isStringLiteralLike(node) || ts.isJsxText(node)) values.push(node.text);
      else if (ts.isTemplateExpression(node)) {
        values.push(node.head.text, ...node.templateSpans.map((span) => span.literal.text));
      }
    });
  }
  return values;
}

function walkRenderableAstWithAncestors(node, visitor, { sourceFile = null, expandLocalComponents = false } = {}) {
  const visit = (current, ancestors, componentStack) => {
    if (ts.isFunctionLike(current)) {
      for (const root of renderCallbackRoots(current)) visit(root, ancestors, componentStack);
      return;
    }
    visitor(current, ancestors);
    const opening = ts.isJsxSelfClosingElement(current) ? current : ts.isJsxElement(current) ? current.openingElement : null;
    if (expandLocalComponents && opening && ts.isIdentifier(opening.tagName) && /^[A-Z]/.test(opening.tagName.text)) {
      const functions = findLexicalRenderFunctions(opening, opening.tagName.text);
      if (functions.length === 1 && !componentStack.has(functions[0])) {
        const nextStack = new Set([...componentStack, functions[0]]);
        for (const root of functionRenderRoots(functions[0])) {
          visit(root, [...ancestors, current], nextStack);
        }
      }
    }
    if (ts.isJsxSelfClosingElement(current)) {
      if (jsxOpeningOwnPropsAreRenderable(current)) {
        ts.forEachChild(current, (child) => visit(child, [...ancestors, current], componentStack));
      }
      return;
    }
    if (ts.isJsxElement(current)) {
      if (jsxOpeningOwnPropsAreRenderable(current.openingElement)) {
        ts.forEachChild(current.openingElement, (child) => visit(child, [...ancestors, current], componentStack));
      }
      if (jsxElementChildrenAreRenderable(current.openingElement)) {
        for (const child of current.children) visit(child, [...ancestors, current], componentStack);
      }
      return;
    }
    if (ts.isConditionalExpression(current)) {
      const constant = staticBoolean(current.condition);
      if (constant === true) visit(current.whenTrue, [...ancestors, current], componentStack);
      else if (constant === false) visit(current.whenFalse, [...ancestors, current], componentStack);
      else {
        visit(current.whenTrue, [...ancestors, current], componentStack);
        visit(current.whenFalse, [...ancestors, current], componentStack);
      }
      return;
    }
    if (ts.isBinaryExpression(current) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken].includes(current.operatorToken.kind)) {
      const constant = staticBoolean(current.left);
      if (current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
        if (constant !== false) visit(current.right, [...ancestors, current], componentStack);
      } else if (constant === true) {
        visit(current.left, [...ancestors, current], componentStack);
      } else if (constant === false) {
        visit(current.right, [...ancestors, current], componentStack);
      } else {
        visit(current.left, [...ancestors, current], componentStack);
        visit(current.right, [...ancestors, current], componentStack);
      }
      return;
    }
    if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
      const nullish = staticNullish(current.left);
      if (nullish === false) visit(current.left, [...ancestors, current], componentStack);
      else if (nullish === true) visit(current.right, [...ancestors, current], componentStack);
      else {
        visit(current.left, [...ancestors, current], componentStack);
        visit(current.right, [...ancestors, current], componentStack);
      }
      return;
    }
    ts.forEachChild(current, (child) => visit(child, [...ancestors, current], componentStack));
  };
  visit(node, [], new Set());
}

function hasCardThroughLocalChildrenSlot(sourceFile, rootNode) {
  let matched = false;
  const functionWrapsChildren = (functionNode) => {
    const parameter = functionNode.parameters[0]?.name;
    const directChildrenName = parameter && ts.isObjectBindingPattern(parameter)
      ? parameter.elements.find((element) => staticPropertyName(element.propertyName ?? element.name) === "children" && ts.isIdentifier(element.name))?.name.text ?? null
      : null;
    const propsName = parameter && ts.isIdentifier(parameter) ? parameter.text : null;
    const isChildrenReference = (expression) => {
      const node = unwrapExpression(expression);
      return Boolean(
        (directChildrenName && ts.isIdentifier(node) && node.text === directChildrenName) ||
        (propsName && ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === propsName && node.name.text === "children")
      );
    };
    return functionRenderRoots(functionNode).some((renderRoot) => {
      let wraps = false;
      walkRenderableAstWithAncestors(renderRoot, (node, ancestors) => {
        if (!wraps && ts.isJsxExpression(node) && isChildrenReference(node.expression)) {
          wraps = ancestors.some((ancestor) => ts.isJsxElement(ancestor) && canonicalKitTag(sourceFile, ancestor.openingElement) === "Card");
        }
      });
      return wraps;
    });
  };
  const childrenContainCard = (children) => children.some((child) => {
    let contains = false;
    walkRenderableAstWithAncestors(child, (node) => {
      const opening = ts.isJsxSelfClosingElement(node) ? node : ts.isJsxElement(node) ? node.openingElement : null;
      if (opening && canonicalKitTag(sourceFile, opening) === "Card") contains = true;
    }, { sourceFile, expandLocalComponents: true });
    return contains;
  });
  walkRenderableAstWithAncestors(rootNode, (node) => {
    if (matched || !ts.isJsxElement(node) || !childrenContainCard(node.children)) return;
    const functions = ts.isIdentifier(node.openingElement.tagName) ? findLexicalRenderFunctions(node.openingElement, node.openingElement.tagName.text) : [];
    matched = functions.length === 1 && functionWrapsChildren(functions[0]);
  }, { sourceFile, expandLocalComponents: true });
  return matched;
}

function checkComponentUsage(sourceFile, currentScenario, policy) {
  const findings = [];
  if (policy.mode === "kit-consumer") {
    const localBindings = kitImportBindings(sourceFile, policy.kitImport);
    const imported = new Map([...localBindings].map(([local, canonical]) => [canonical, local]));
    const tags = new Set(collectJsxOpenings(scenarioEvidenceRoots(sourceFile, currentScenario)).map((opening) => canonicalKitTag(sourceFile, opening, policy.kitImport)).filter(Boolean));
    for (const component of currentScenario.expectedComponents ?? []) {
      const localName = imported.get(component);
      if (!localName) findings.push({ rule: "component-usage", severity: "error", message: `Missing expected kit component import: ${component}` });
      else if (hasRuntimeShadow(sourceFile, localName)) findings.push({ rule: "component-binding", severity: "error", message: `Kit component binding ${localName} is shadowed by a runtime declaration.` });
      else if (!tags.has(component)) findings.push({ rule: "component-usage", severity: "error", message: `Expected component <${component}> is not used in reachable JSX.` });
    }
  }
  for (const source of collectModuleSources(sourceFile)) {
    if (source.startsWith(`${policy.kitImport}/`)) findings.push({ rule: "component-usage", severity: "error", message: "Generated output uses a @ai-readable/kit subpath import; use the barrel entry only." });
  }
  for (const violation of collectImportProfileViolations(sourceFile, policy)) {
    findings.push({ rule: "direct-third-party-import", severity: "error", message: `Generated output imports "${violation.source}" outside the ${policy.mode} foundation contract.` });
  }
  return findings;
}

function checkExpectedText(sourceFile, currentScenario, policy) {
  const roots = policy.mode === "kit-consumer" ? scenarioEvidenceRoots(sourceFile, currentScenario) : scenarioEntryRoots(sourceFile, currentScenario);
  const evidence = policy.mode === "kit-consumer" ? collectStaticEvidence(roots) : collectStaticEvidenceDeep(roots);
  return (currentScenario.expectedText ?? [])
    .filter((expected) => !evidence.some((value) => value.includes(expected)))
    .map((expected) => ({ rule: "expected-copy", severity: "error", message: `Missing expected reachable generated copy: ${expected}` }));
}

function openingCanRenderClassName(sourceFile, opening) {
  return jsxOpeningOwnPropsAreRenderable(opening);
}

function checkExpectedClassTokens(sourceFile, currentScenario, policy) {
  const expected = currentScenario.expectedClassTokens ?? [];
  if (expected.length === 0) return [];
  if (policy.mode !== "kit-consumer") {
    const evidence = collectStaticEvidenceDeep(scenarioEntryRoots(sourceFile, currentScenario));
    return expected
      .filter((token) => !evidence.some((value) => value.includes(token)))
      .map((token) => ({ rule: "expected-class", severity: "error", message: `Missing expected reachable class token: ${token}` }));
  }
  const declarations = new Map();
  walkAst(sourceFile, (node) => {
    if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || !node.initializer) return;
    const matches = declarations.get(node.name.text) ?? [];
    matches.push(node.initializer);
    declarations.set(node.name.text, matches);
  });
  const resolveStrings = (node, seen = new Set()) => {
    const expression = unwrapExpression(node);
    if (!expression) return [];
    if (ts.isStringLiteralLike(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return [expression.text];
    if (ts.isConditionalExpression(expression)) {
      const constant = staticBoolean(expression.condition);
      if (constant === true) return resolveStrings(expression.whenTrue, seen);
      if (constant === false) return resolveStrings(expression.whenFalse, seen);
      return [...resolveStrings(expression.whenTrue, seen), ...resolveStrings(expression.whenFalse, seen)];
    }
    if (ts.isIdentifier(expression)) {
      if (["undefined", "null"].includes(expression.text) || seen.has(expression.text)) return [];
      const matches = declarations.get(expression.text) ?? [];
      if (matches.length !== 1) return [];
      return resolveStrings(matches[0], new Set([...seen, expression.text]));
    }
    return [];
  };
  const tokens = new Set();
  const addTokens = (expressions) => {
    for (const expression of expressions) {
      for (const value of resolveStrings(expression)) {
        for (const token of value.split(/\s+/).filter(Boolean)) tokens.add(token);
      }
    }
  };
  for (const opening of collectJsxOpenings(scenarioEvidenceRoots(sourceFile, currentScenario))) {
    const attribute = getJsxAttribute(opening.attributes, "className");
    if (attribute?.initializer && openingCanRenderClassName(sourceFile, opening)) {
      const expression = ts.isStringLiteral(attribute.initializer)
        ? attribute.initializer
        : ts.isJsxExpression(attribute.initializer)
          ? attribute.initializer.expression
          : null;
      addTokens([expression]);
    }
    if (!["DataGrid", "Table"].includes(canonicalKitTag(sourceFile, opening)) || hasLexicalRuntimeShadow(opening, jsxTagName(opening))) continue;
    const rowClassName = getJsxAttribute(opening.attributes, "rowClassName");
    const callback = rowClassName?.initializer && ts.isJsxExpression(rowClassName.initializer)
      ? unwrapExpression(rowClassName.initializer.expression)
      : null;
    if (!callback || (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback))) continue;
    if (ts.isBlock(callback.body)) addTokens(collectReachableFunctionReturnExpressions(callback));
    else addTokens([callback.body]);
  }
  return expected
    .filter((token) => !tokens.has(token))
    .map((token) => ({ rule: "expected-class", severity: "error", message: `Missing expected reachable class token: ${token}` }));
}

function checkExpectedStaticValues(sourceFile, currentScenario, policy) {
  const assertions = currentScenario.expectedStaticValues ?? [];
  if (assertions.length === 0) return [];
  const deep = policy.mode !== "kit-consumer";
  const findings = [];
  const entryFunctions = deep
    ? scenarioDeepEntryFunctions(sourceFile, currentScenario)
    : scenarioEntryFunctions(sourceFile, currentScenario);
  for (const assertion of assertions) {
    const label = `${assertion.object}.${assertion.path.join(".")}`;
    const declarations = findTopLevelVariables(sourceFile, assertion.object);
    if (declarations.length !== 1 || !(declarations[0].statement.declarationList.flags & ts.NodeFlags.Const)) {
      findings.push({ rule: "static-value", severity: "error", message: `${label}: expected exactly one top-level const object.` });
      continue;
    }
    const objectInitializer = unwrapExpression(declarations[0].declaration.initializer);
    if (astWritesBinding(sourceFile, assertion.object)) {
      findings.push({ rule: "static-value", severity: "error", message: `${label}: asserted static object is mutated after declaration.` });
      continue;
    }
    const foundationParameterEnvironment = (functionNode) => deep
      ? bindFirstParameterWildcard(functionNode)
      : new Map();
    const consumed = entryFunctions.some((functionNode) =>
      functionConsumesStaticMap(
        sourceFile,
        functionNode,
        assertion.object,
        objectInitializer,
        assertion.path,
        foundationParameterEnvironment(functionNode),
        new Set(),
        deep
      )
    );
    if (!consumed) {
      findings.push({ rule: "static-value", severity: "error", message: `${label}: object does not flow into reachable JSX label and variant values.` });
      continue;
    }
    let node = objectInitializer;
    let invalid = false;
    for (const [index, segment] of assertion.path.entries()) {
      const parsed = parseStaticObject(node, `${assertion.object}.${assertion.path.slice(0, index).join(".") || "<root>"}`);
      if (parsed.errors.length > 0) {
        for (const message of parsed.errors) findings.push({ rule: "static-value", severity: "error", message: `${label}: ${message}.` });
        invalid = true;
        break;
      }
      node = unwrapExpression(parsed.entries.get(segment));
      if (!node) {
        findings.push({ rule: "static-value", severity: "error", message: `${label}: missing property ${JSON.stringify(segment)}.` });
        invalid = true;
        break;
      }
    }
    if (!invalid && staticString(node) !== assertion.value) {
      findings.push({ rule: "static-value", severity: "error", message: `${label}: expected ${JSON.stringify(assertion.value)}, found ${JSON.stringify(staticString(node))}.` });
    }
  }
  return findings;
}

function scenarioDeepEntryFunctions(sourceFile, currentScenario) {
  const functions = scenarioEntryFunctions(sourceFile, currentScenario);
  const queue = [...functions];
  const visited = new Set(functions);
  while (queue.length > 0) {
    const currentFunction = queue.shift();
    for (const root of functionRenderRoots(currentFunction)) {
      walkAst(root, (node) => {
        const opening = ts.isJsxSelfClosingElement(node)
          ? node
          : ts.isJsxElement(node)
            ? node.openingElement
            : null;
        if (!opening || !ts.isIdentifier(opening.tagName) || !/^[A-Z]/.test(opening.tagName.text)) return;
        const candidates = findLexicalRenderFunctions(opening, opening.tagName.text);
        if (candidates.length !== 1 || visited.has(candidates[0])) return;
        visited.add(candidates[0]);
        functions.push(candidates[0]);
        queue.push(candidates[0]);
      });
    }
  }
  return functions;
}

function functionConsumesStaticMap(sourceFile, functionNode, objectName, objectInitializer, expectedPath, parameterEnv = new Map(), activeFunctions = new Set(), deep = false) {
  if (activeFunctions.has(functionNode)) return false;
  const nextActiveFunctions = new Set(activeFunctions);
  nextActiveFunctions.add(functionNode);
  const roots = ts.isArrowFunction(functionNode) && !ts.isBlock(functionNode.body)
    ? [unwrapExpression(functionNode.body)].filter(Boolean)
    : collectReachableFunctionReturnExpressions(functionNode);
  const initializers = new Map();
  const unsafeBindings = new Set();
  const statements = functionNode.body && ts.isBlock(functionNode.body) ? functionNode.body.statements : [];
  for (const statement of statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      if (!(statement.declarationList.flags & ts.NodeFlags.Const) || initializers.has(declaration.name.text)) unsafeBindings.add(declaration.name.text);
      else initializers.set(declaration.name.text, declaration.initializer);
    }
  }
  for (const name of initializers.keys()) if (functionWritesBinding(functionNode, name)) unsafeBindings.add(name);
  for (const name of unsafeBindings) initializers.delete(name);
  const renderedBindings = new Map();
  for (const root of roots) {
    (deep ? walkAst : walkRenderableAst)(root, (node) => {
      if (
        !ts.isJsxElement(node) ||
        !["Badge"].includes(canonicalKitTag(sourceFile, node.openingElement) ?? jsxTagName(node.openingElement)) ||
        node.openingElement.attributes.properties.some(ts.isJsxSpreadAttribute)
      ) return;
      const variant = getJsxAttribute(node.openingElement.attributes, "variant");
      const variantExpression = variant?.initializer && ts.isJsxExpression(variant.initializer) ? unwrapExpression(variant.initializer.expression) : null;
      if (!variantExpression || !ts.isPropertyAccessExpression(variantExpression) || !ts.isIdentifier(variantExpression.expression) || variantExpression.name.text !== "variant") return;
      const binding = variantExpression.expression.text;
      const hasLabel = node.children.some((child) => {
        const expression = ts.isJsxExpression(child) ? unwrapExpression(child.expression) : null;
        return Boolean(expression && ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === binding && expression.name.text === "label");
      });
      if (hasLabel) renderedBindings.set(binding, new Set(["variant", "label"]));
    });
  }
  const resolveAccessKey = (node, seen = new Set()) => {
    const expression = unwrapExpression(node);
    const direct = staticString(expression);
    if (direct !== null) return direct;
    if (!expression || !ts.isIdentifier(expression) || seen.has(expression.text)) return null;
    if (initializers.has(expression.text)) return resolveAccessKey(initializers.get(expression.text), new Set([...seen, expression.text]));
    const resolved = resolveLexicalConstInitializer(expression, new Set());
    return resolved ? resolveAccessKey(resolved.initializer, new Set([...seen, expression.text])) : null;
  };
  const resolvePropDomain = (node) => {
    const expression = unwrapExpression(node);
    const direct = staticString(expression);
    if (direct !== null) return exactParameterDomain(direct);
    const staticKey = resolveAccessKey(expression);
    if (staticKey !== null) return exactParameterDomain(staticKey);
    return resolveParameterDomain(sourceFile, expression, parameterEnv);
  };
  const traceObjectPaths = (node, flowSeen = new Set()) => {
    const expression = unwrapExpression(node);
    if (!expression) return [];
    if (ts.isIdentifier(expression)) {
      if (expression.text === objectName) return [{ path: [], value: objectInitializer }];
      if (initializers.has(expression.text)) {
        if (flowSeen.has(expression.text)) return [];
        return traceObjectPaths(initializers.get(expression.text), new Set([...flowSeen, expression.text]));
      }
      return [];
    }
    if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
      let key = ts.isPropertyAccessExpression(expression) ? expression.name.text : resolveAccessKey(expression.argumentExpression);
      const keyDomain = key === null && ts.isElementAccessExpression(expression)
        ? resolveParameterDomain(sourceFile, expression.argumentExpression, parameterEnv)
        : null;
      if (keyDomain?.kind === "exact") key = keyDomain.value;
      return traceObjectPaths(expression.expression, flowSeen).flatMap((base) => {
        if (key === null) return keyDomain?.kind === "wildcard" ? [{ path: [...base.path, "*"], value: undefined }] : [];
        if (!base.value) return [{ path: [...base.path, key], value: undefined }];
        const parsed = parseStaticObject(unwrapExpression(base.value), `${objectName} data flow`);
        if (parsed.errors.length > 0 || !parsed.entries.has(key)) return [];
        return [{ path: [...base.path, key], value: unwrapExpression(parsed.entries.get(key)) }];
      });
    }
    if (ts.isConditionalExpression(expression)) {
      const constant = staticBoolean(expression.condition);
      if (constant === true) return traceObjectPaths(expression.whenTrue, flowSeen);
      if (constant === false) return traceObjectPaths(expression.whenFalse, flowSeen);
      return [...traceObjectPaths(expression.whenTrue, flowSeen), ...traceObjectPaths(expression.whenFalse, flowSeen)];
    }
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
      const constant = staticBoolean(expression.left);
      if (constant === true) return traceObjectPaths(expression.left, flowSeen);
      if (constant === false) return traceObjectPaths(expression.right, flowSeen);
      return [...traceObjectPaths(expression.left, flowSeen), ...traceObjectPaths(expression.right, flowSeen)];
    }
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
      const nullish = staticNullish(expression.left);
      if (nullish === true) return traceObjectPaths(expression.right, flowSeen);
      if (nullish === false) return traceObjectPaths(expression.left, flowSeen);
      return [...traceObjectPaths(expression.left, flowSeen), ...traceObjectPaths(expression.right, flowSeen)];
    }
    return [];
  };
  const pathMatches = (pattern, expected) => pattern.length === expected.length && pattern.every((segment, index) => segment === "*" || segment === expected[index]);
  const expectedField = expectedPath.at(-1);
  const expectedObjectPath = expectedPath.slice(0, -1);
  for (const [binding, fields] of renderedBindings) {
    if (!fields.has(expectedField)) continue;
    const initializer = initializers.get(binding);
    if (initializer && traceObjectPaths(initializer, new Set([binding])).some((trace) => pathMatches(trace.path, expectedObjectPath))) return true;
  }
  for (const root of roots) {
    const openings = [];
    const callbacks = [];
    (deep ? walkAst : walkRenderableAst)(root, (node) => {
      if (ts.isFunctionLike(node) && renderCallbackRoots(node).length > 0) callbacks.push(node);
      const opening = ts.isJsxSelfClosingElement(node) ? node : ts.isJsxElement(node) ? node.openingElement : null;
      if (!opening || !ts.isIdentifier(opening.tagName) || !/^[A-Z]/.test(opening.tagName.text)) return;
      openings.push(opening);
    });
    for (const opening of openings) {
      const functions = findLexicalRenderFunctions(opening, opening.tagName.text);
      if (functions.length !== 1) continue;
      const childEnv = bindJsxPropsToFunction(opening, functions[0], resolvePropDomain);
      if (functionConsumesStaticMap(sourceFile, functions[0], objectName, objectInitializer, expectedPath, childEnv, nextActiveFunctions, deep)) return true;
    }
    for (const callback of callbacks) {
      const callbackEnv = bindFirstParameterWildcard(callback);
      if (functionConsumesStaticMap(sourceFile, callback, objectName, objectInitializer, expectedPath, callbackEnv, nextActiveFunctions, deep)) return true;
    }
  }
  return false;
}

function exactParameterDomain(value) {
  return { kind: "exact", value };
}

function wildcardParameterDomain() {
  return { kind: "wildcard" };
}

function parameterPathKey(path) {
  return path.length === 0 ? "" : path.join("\u0000");
}

function addParameterDomain(env, name, path, domain) {
  if (!domain) return;
  if (!env.has(name)) env.set(name, new Map());
  env.get(name).set(path, domain);
}

function readParameterDomain(env, name, path) {
  const domains = env.get(name);
  if (!domains) return null;
  return domains.get(parameterPathKey(path)) ?? domains.get("*") ?? null;
}

function staticAccessRootAndPath(node) {
  let current = unwrapExpression(node);
  const path = [];
  while (current && (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current))) {
    if (ts.isPropertyAccessExpression(current)) {
      path.unshift(current.name.text);
    } else {
      const key = staticString(unwrapExpression(current.argumentExpression));
      if (key === null) return null;
      path.unshift(key);
    }
    current = unwrapExpression(current.expression);
  }
  return current && ts.isIdentifier(current) ? { root: current.text, path } : null;
}

function resolveParameterDomain(sourceFile, node, parameterEnv) {
  const expression = unwrapExpression(node);
  if (!expression) return null;
  if (
    ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === "String" &&
    expression.arguments.length === 1 && !hasRuntimeShadow(sourceFile, "String")
  ) {
    return resolveParameterDomain(sourceFile, expression.arguments[0], parameterEnv);
  }
  if (ts.isIdentifier(expression)) return readParameterDomain(parameterEnv, expression.text, []);
  const access = staticAccessRootAndPath(expression);
  return access ? readParameterDomain(parameterEnv, access.root, access.path) : null;
}

function bindFirstParameterWildcard(functionNode) {
  const env = new Map();
  bindPatternWildcard(functionNode.parameters[0]?.name, env);
  return env;
}

function bindPatternWildcard(pattern, env) {
  if (!pattern) return;
  if (ts.isIdentifier(pattern)) {
    addParameterDomain(env, pattern.text, "*", wildcardParameterDomain());
    return;
  }
  if (!ts.isObjectBindingPattern(pattern)) return;
  for (const element of pattern.elements) {
    if (ts.isOmittedExpression(element) || element.dotDotDotToken || !ts.isIdentifier(element.name)) continue;
    addParameterDomain(env, element.name.text, parameterPathKey([]), wildcardParameterDomain());
  }
}

function bindJsxPropsToFunction(opening, functionNode, resolvePropDomain) {
  const env = new Map();
  if (opening.attributes.properties.some(ts.isJsxSpreadAttribute)) return env;
  const props = new Map();
  for (const attribute of opening.attributes.properties) {
    if (!ts.isJsxAttribute(attribute) || !ts.isIdentifier(attribute.name)) continue;
    if (props.has(attribute.name.text)) return new Map();
    let domain = exactParameterDomain("true");
    if (attribute.initializer) {
      if (ts.isStringLiteral(attribute.initializer)) {
        domain = exactParameterDomain(attribute.initializer.text);
      } else if (ts.isJsxExpression(attribute.initializer)) {
        domain = resolvePropDomain(attribute.initializer.expression);
      } else {
        domain = null;
      }
    }
    props.set(attribute.name.text, domain);
  }
  bindPropsToPattern(functionNode.parameters[0]?.name, props, env);
  return env;
}

function bindPropsToPattern(pattern, props, env) {
  if (!pattern) return;
  if (ts.isIdentifier(pattern)) {
    for (const [name, domain] of props.entries()) addParameterDomain(env, pattern.text, parameterPathKey([name]), domain);
    return;
  }
  if (!ts.isObjectBindingPattern(pattern)) return;
  for (const element of pattern.elements) {
    if (ts.isOmittedExpression(element) || element.dotDotDotToken || !ts.isIdentifier(element.name)) continue;
    const propName = element.propertyName ? staticPropertyName(element.propertyName) : element.name.text;
    if (propName === null) return;
    addParameterDomain(env, element.name.text, parameterPathKey([]), props.get(propName));
  }
}

function checkTokenUsage(sourceFile, currentScenario) {
  const findings = [];
  const roots = scenarioEvidenceRoots(sourceFile, currentScenario);
  const evidence = collectStaticEvidence(roots);
  const colorPattern = /(?<![\w-])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![\w-])|\b(?:rgb|rgba|hsl|hsla)\(/g;
  for (const value of evidence) {
    for (const match of value.matchAll(colorPattern)) findings.push({ rule: "token-usage", severity: "error", message: `Hardcoded color "${match[0]}" found in reachable code; use tokens or component props.` });
  }
  for (const rootNode of roots) {
    walkRenderableAst(rootNode, (node) => {
      if (!ts.isJsxAttribute(node) || !ts.isIdentifier(node.name) || node.name.text !== "style") return;
      const expression = node.initializer && ts.isJsxExpression(node.initializer) ? unwrapExpression(node.initializer.expression) : null;
      if (expression && ts.isObjectLiteralExpression(expression)) findings.push({ rule: "token-usage", severity: "warning", message: "Inline style object found; keep generated output on kit props and tokens unless the value is dynamic." });
    });
  }
  return findings;
}

function checkLayoutRules(sourceFile, currentScenario, policy) {
  const findings = [];
  if (policy.mode !== "kit-consumer") return findings;
  const roots = scenarioEvidenceRoots(sourceFile, currentScenario);
  const openings = collectJsxOpenings(roots).sort((left, right) => left.pos - right.pos);
  const expectedOrder = currentScenario.expectedOrder ?? [];
  const positions = new Map(expectedOrder.map((component) => [component, openings.find((opening) => canonicalKitTag(sourceFile, opening) === component)?.pos ?? -1]));
  for (let index = 1; index < expectedOrder.length; index += 1) {
    const current = expectedOrder[index];
    for (const previous of expectedOrder.slice(0, index)) {
      if ((positions.get(current) ?? -1) >= 0 && (positions.get(previous) ?? -1) > (positions.get(current) ?? -1)) {
        findings.push({ rule: "layout-rules", severity: "error", message: `${current} appears before ${previous}; expected order is ${expectedOrder.join(" > ")}.` });
      }
    }
  }
  for (const rootNode of currentScenario.output.symbol ? roots : []) {
    walkRenderableAstWithAncestors(rootNode, (node, ancestors) => {
      const opening = ts.isJsxSelfClosingElement(node) ? node : ts.isJsxElement(node) ? node.openingElement : null;
      if (!opening || canonicalKitTag(sourceFile, opening) !== "DataGrid") return;
      const insideDataSection = ancestors.some((ancestor) => ts.isJsxElement(ancestor) && canonicalKitTag(sourceFile, ancestor.openingElement) === "DataSection");
      if (!insideDataSection) findings.push({ rule: "layout-rules", severity: "error", message: "DataGrid must be placed inside DataSection for list pages." });
    });
  }
  if (currentScenario.expectedPattern === "list-page" && !openings.some((opening) => canonicalKitTag(sourceFile, opening) === "FilterPanel")) {
    findings.push({ rule: "layout-rules", severity: "error", message: "List pages must include FilterPanel." });
  }
  return findings;
}

function checkAntiPatterns(sourceFile, currentScenario) {
  const findings = [];
  for (const rootNode of scenarioEntryRoots(sourceFile, currentScenario)) {
    walkRenderableAstWithAncestors(rootNode, (node, ancestors) => {
      const opening = ts.isJsxSelfClosingElement(node) ? node : ts.isJsxElement(node) ? node.openingElement : null;
      if (!opening) return;
      const tag = canonicalKitTag(sourceFile, opening);
      const insideCard = ancestors.some((ancestor) => ts.isJsxElement(ancestor) && canonicalKitTag(sourceFile, ancestor.openingElement) === "Card");
      if (tag === "Card" && insideCard) findings.push({ rule: "anti-patterns", severity: "error", message: "Nested Card usage found." });
      if (tag === "PageHeader" && insideCard) findings.push({ rule: "anti-patterns", severity: "error", message: "PageHeader must stay at page level, outside Card." });
      const className = jsxStringAttribute(opening.attributes, "className");
      if (className && /(?:btn|button|primary-button)/.test(className)) findings.push({ rule: "anti-patterns", severity: "warning", message: "Button-like custom class found; prefer kit Button variants." });
    }, { sourceFile, expandLocalComponents: true });
    if (hasCardThroughLocalChildrenSlot(sourceFile, rootNode)) findings.push({ rule: "anti-patterns", severity: "error", message: "Nested Card usage found through a local children slot." });
  }
  return findings;
}

function checkForbiddenPatterns(sourceFile, currentScenario, policy) {
  const findings = [];
  const enabled = new Set(currentScenario.forbiddenPatterns ?? []);
  const roots = scenarioEvidenceRoots(sourceFile, currentScenario);
  const openings = collectJsxOpenings(roots);
  if (enabled.has("custom-button-style")) {
    const matched = openings.some((opening) => {
      const attribute = getJsxAttribute(opening.attributes, "className");
      if (!attribute) return false;
      const className = jsxStringAttribute(opening.attributes, "className");
      if (className !== null) return /(?:btn|button|primary-button)/.test(className);
      return ["Button", "button"].includes(canonicalKitTag(sourceFile, opening) ?? jsxTagName(opening));
    });
    if (matched) findings.push({ rule: "forbidden-pattern", severity: "error", message: "forbiddenPatterns.custom-button-style matched a reachable button-like custom class." });
  }
  if (enabled.has("hardcoded-brand-color")) {
    const matched = collectStaticEvidence(roots).find((value) => /(?<![\w-])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![\w-])|\b(?:rgb|rgba|hsl|hsla)\(/.test(value));
    if (matched) findings.push({ rule: "forbidden-pattern", severity: "error", message: "forbiddenPatterns.hardcoded-brand-color matched reachable code." });
    else if (openings.some((opening) => {
      const style = getJsxAttribute(opening.attributes, "style");
      return Boolean(style && !ts.isStringLiteral(style.initializer));
    })) findings.push({ rule: "forbidden-pattern", severity: "error", message: "forbiddenPatterns.hardcoded-brand-color cannot verify a dynamic reachable style expression." });
  }
  if (enabled.has("card-inside-card")) {
    let matched = false;
    for (const rootNode of scenarioEntryRoots(sourceFile, currentScenario)) {
      walkRenderableAstWithAncestors(rootNode, (node, ancestors) => {
        const opening = ts.isJsxSelfClosingElement(node) ? node : ts.isJsxElement(node) ? node.openingElement : null;
        if (matched || !opening || canonicalKitTag(sourceFile, opening) !== "Card") return;
        matched = ancestors.some((ancestor) => ts.isJsxElement(ancestor) && canonicalKitTag(sourceFile, ancestor.openingElement) === "Card");
      }, { sourceFile, expandLocalComponents: true });
      if (!matched) matched = hasCardThroughLocalChildrenSlot(sourceFile, rootNode);
    }
    if (matched) findings.push({ rule: "forbidden-pattern", severity: "error", message: "forbiddenPatterns.card-inside-card matched nested Card usage." });
  }
  if (enabled.has("direct-third-party-import")) {
    const violation = collectImportProfileViolations(sourceFile, policy)[0];
    if (violation) findings.push({ rule: "forbidden-pattern", severity: "error", message: `forbiddenPatterns.direct-third-party-import matched "${violation.source}".` });
    if (hasDynamicModuleLoad(sourceFile)) findings.push({ rule: "forbidden-pattern", severity: "error", message: "forbiddenPatterns.direct-third-party-import rejects dynamic import()/require() sources." });
  }
  return findings;
}

function checkPageRegistry(sourceFile, sourcePath, currentScenario) {
  const pagesPath = resolve(dirname(sourcePath), "..", "pages.json");
  const generatedProjectSource = sourcePath.replaceAll("\\", "/").endsWith("/generated/pages.tsx");
  if (!generatedProjectSource || !existsSync(pagesPath)) {
    return currentScenario.output.pageId
      ? [{ rule: "page-registry", severity: "error", message: "output.pageId requires a sibling project pages.json." }]
      : [];
  }

  const findings = [];
  const safePagesPath = resolveReadablePath(projectRoot, relativeToProject(pagesPath), "project pages.json");
  const pagesDocument = readJsonAbsolute(safePagesPath, "project pages.json");
  const plannedPages = Array.isArray(pagesDocument.pages) ? pagesDocument.pages : [];
  if (plannedPages.length === 0 || plannedPages.some((page) => !hasPageIdentity(page))) {
    return [{ rule: "page-registry", severity: "error", message: "Every pages.json entry must define string id, route, title, and pattern fields." }];
  }

  const pagePlanDeclarations = findTopLevelVariables(sourceFile, "pagePlans");
  if (pagePlanDeclarations.length !== 1 || !ts.isArrayLiteralExpression(unwrapExpression(pagePlanDeclarations[0]?.declaration.initializer))) {
    return [{ rule: "page-registry", severity: "error", message: `Expected exactly one top-level pagePlans array; found ${pagePlanDeclarations.length}.` }];
  }
  const planArray = unwrapExpression(pagePlanDeclarations[0].declaration.initializer);
  const generatedPlans = [];
  for (const [index, element] of planArray.elements.entries()) {
    const parsed = parseStaticObject(unwrapExpression(element), `pagePlans[${index}]`);
    for (const message of parsed.errors) findings.push({ rule: "page-registry", severity: "error", message });
    const page = Object.fromEntries(
      ["id", "route", "title", "pattern"].map((field) => [field, staticString(parsed.entries.get(field))])
    );
    if (!hasPageIdentity(page)) {
      findings.push({ rule: "page-registry", severity: "error", message: `pagePlans[${index}] must have static string id, route, title, and pattern fields.` });
    } else {
      generatedPlans.push(page);
    }
  }
  if (findings.some((finding) => finding.severity === "error")) return findings;

  const planIds = plannedPages.map((page) => page.id);
  const generatedPlanIds = generatedPlans.map((page) => page.id);
  for (const [label, values] of [["pages.json", planIds], ["pagePlans", generatedPlanIds]]) {
    const repeated = duplicates(values);
    if (repeated.length > 0) findings.push({ rule: "page-registry", severity: "error", message: `${label} contains duplicate page id(s): ${repeated.join(", ")}.` });
  }
  const plannedById = new Map(plannedPages.map((page) => [page.id, page]));
  const generatedById = new Map(generatedPlans.map((page) => [page.id, page]));
  for (const id of new Set([...planIds, ...generatedPlanIds])) {
    const planned = plannedById.get(id);
    const generated = generatedById.get(id);
    if (!planned || !generated) {
      findings.push({ rule: "page-registry", severity: "error", message: `Page "${id}" must exist exactly once in pages.json and pagePlans.` });
      continue;
    }
    for (const field of ["route", "title", "pattern"]) {
      if (planned[field] !== generated[field]) {
        findings.push({ rule: "page-registry", severity: "error", message: `Page "${id}" ${field} drifted: pages.json=${JSON.stringify(planned[field])}, generated=${JSON.stringify(generated[field])}.` });
      }
    }
  }

  const registryDeclarations = findTopLevelVariables(sourceFile, "generatedComponents");
  if (registryDeclarations.length !== 1) {
    findings.push({ rule: "page-registry-mount", severity: "error", message: `Expected exactly one top-level generatedComponents object; found ${registryDeclarations.length}.` });
    return findings;
  }
  const registryObject = parseStaticObject(unwrapExpression(registryDeclarations[0].declaration.initializer), "generatedComponents");
  for (const message of registryObject.errors) findings.push({ rule: "page-registry-mount", severity: "error", message });
  const bindings = new Map();
  for (const [id, initializer] of registryObject.entries) {
    const binding = parseRegistryBinding(initializer);
    if (!binding) {
      findings.push({ rule: "page-registry-mount", severity: "error", message: `generatedComponents["${id}"] must mount JSX with pageById["${id}"].` });
    } else {
      bindings.set(id, binding);
      if (binding.pageId !== id) {
        findings.push({ rule: "page-registry-mount", severity: "error", message: `generatedComponents["${id}"] mounts pageById["${binding.pageId}"] instead of the same page id.` });
      }
      const functions = findTopLevelFunctions(sourceFile, binding.component);
      if (functions.length !== 1) {
        findings.push({ rule: "page-registry-mount", severity: "error", message: `generatedComponents["${id}"] mounts undefined or duplicate component ${binding.component}.` });
      } else {
        findings.push(...validateRegistryFunctionReturnsJsx(functions[0], binding.component));
      }
    }
  }
  for (const id of new Set([...planIds, ...registryObject.entries.keys()])) {
    if (!plannedById.has(id) || !registryObject.entries.has(id)) {
      findings.push({ rule: "page-registry", severity: "error", message: `Page "${id}" must exist exactly once in pages.json and generatedComponents.` });
    }
  }

  if (!hasExactPageByIdDeclaration(sourceFile)) {
    findings.push({ rule: "page-registry-mount", severity: "error", message: "pageById must be derived from pagePlans by exact page.id keys." });
  }
  if (!hasExactGeneratedPagesDeclaration(sourceFile)) {
    findings.push({ rule: "page-registry-mount", severity: "error", message: "generatedProjectPages must expose component: generatedComponents[page.id]." });
  }

  if (currentScenario.output.pageId) {
    const binding = bindings.get(currentScenario.output.pageId);
    if (!plannedById.has(currentScenario.output.pageId)) {
      findings.push({ rule: "page-registry", severity: "error", message: `output.pageId "${currentScenario.output.pageId}" is missing from project pages.json.` });
    }
    if (!binding || binding.component !== currentScenario.output.symbol) {
      findings.push({ rule: "page-registry-mount", severity: "error", message: `output.pageId "${currentScenario.output.pageId}" must mount ${currentScenario.output.symbol}; found ${binding?.component ?? "no JSX component"}.` });
    }
  } else if (currentScenario.output.symbol) {
    const matchingIds = [...bindings].filter(([, binding]) => binding.component === currentScenario.output.symbol).map(([id]) => id);
    if (matchingIds.length !== 1) {
      findings.push({ rule: "page-registry-mount", severity: "error", message: `output.symbol ${currentScenario.output.symbol} must be mounted exactly once; found ${matchingIds.length}. Add output.pageId for exact mapping.` });
    }
  }
  return findings;
}

function parseRegistryBinding(initializer) {
  const arrow = unwrapExpression(initializer);
  if (!arrow || !ts.isArrowFunction(arrow) || arrow.parameters.length !== 0) return null;
  const jsx = unwrapExpression(arrow.body);
  if (!jsx || !ts.isJsxSelfClosingElement(jsx) || !ts.isIdentifier(jsx.tagName)) return null;
  if (jsx.attributes.properties.length !== 1 || jsx.attributes.properties.some(ts.isJsxSpreadAttribute)) return null;
  const pageAttributes = jsx.attributes.properties.filter((property) => ts.isJsxAttribute(property) && property.name.text === "page");
  if (pageAttributes.length !== 1) return null;
  const pageAttribute = pageAttributes[0];
  const expression = pageAttribute?.initializer && ts.isJsxExpression(pageAttribute.initializer)
    ? unwrapExpression(pageAttribute.initializer.expression)
    : null;
  if (!expression || !ts.isElementAccessExpression(expression) || !ts.isIdentifier(expression.expression) || expression.expression.text !== "pageById") return null;
  const pageId = staticString(expression.argumentExpression);
  return pageId === null ? null : { component: jsx.tagName.text, pageId };
}

function hasExactPageByIdDeclaration(sourceFile) {
  const matches = findTopLevelVariables(sourceFile, "pageById");
  if (matches.length !== 1) return false;
  const call = unwrapExpression(matches[0].declaration.initializer);
  if (!call || !ts.isCallExpression(call) || !ts.isPropertyAccessExpression(call.expression)) return false;
  if (!ts.isIdentifier(call.expression.expression) || call.expression.expression.text !== "Object" || call.expression.name.text !== "fromEntries") return false;
  const mapCall = unwrapExpression(call.arguments[0]);
  if (!mapCall || !ts.isCallExpression(mapCall) || !ts.isPropertyAccessExpression(mapCall.expression)) return false;
  if (!ts.isIdentifier(mapCall.expression.expression) || mapCall.expression.expression.text !== "pagePlans" || mapCall.expression.name.text !== "map") return false;
  const arrow = unwrapExpression(mapCall.arguments[0]);
  if (!arrow || !ts.isArrowFunction(arrow) || arrow.parameters.length !== 1 || !ts.isIdentifier(arrow.parameters[0].name)) return false;
  const parameter = arrow.parameters[0].name.text;
  const array = unwrapExpression(arrow.body);
  return Boolean(
    array && ts.isArrayLiteralExpression(array) && array.elements.length === 2 &&
    ts.isPropertyAccessExpression(array.elements[0]) && ts.isIdentifier(array.elements[0].expression) &&
    array.elements[0].expression.text === parameter && array.elements[0].name.text === "id" &&
    ts.isIdentifier(array.elements[1]) && array.elements[1].text === parameter
  );
}

function hasExactGeneratedPagesDeclaration(sourceFile) {
  const matches = findTopLevelVariables(sourceFile, "generatedProjectPages");
  if (matches.length !== 1 || !matches[0].statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) return false;
  const call = unwrapExpression(matches[0].declaration.initializer);
  if (!call || !ts.isCallExpression(call) || !ts.isPropertyAccessExpression(call.expression) ||
      !ts.isIdentifier(call.expression.expression) || call.expression.expression.text !== "pagePlans" || call.expression.name.text !== "map") return false;
  const arrow = unwrapExpression(call.arguments[0]);
  if (!arrow || !ts.isArrowFunction(arrow) || arrow.parameters.length !== 1 || !ts.isIdentifier(arrow.parameters[0].name)) return false;
  const parameter = arrow.parameters[0].name.text;
  const object = unwrapExpression(arrow.body);
  if (!object || !ts.isObjectLiteralExpression(object)) return false;
  if (object.properties.length !== 5 || object.properties.some((property) => !ts.isPropertyAssignment(property))) return false;
  const expectedFields = ["id", "route", "title", "pattern"];
  for (const [index, field] of expectedFields.entries()) {
    const property = object.properties[index];
    const value = unwrapExpression(property.initializer);
    if (staticPropertyName(property.name) !== field || !value || !ts.isPropertyAccessExpression(value) ||
        !ts.isIdentifier(value.expression) || value.expression.text !== parameter || value.name.text !== field) return false;
  }
  const componentProperties = object.properties.filter((property) => ts.isPropertyAssignment(property) && staticPropertyName(property.name) === "component");
  if (componentProperties.length !== 1 || object.properties[4] !== componentProperties[0]) return false;
  const expression = unwrapExpression(componentProperties[0].initializer);
  return Boolean(
    expression && ts.isElementAccessExpression(expression) && ts.isIdentifier(expression.expression) &&
    expression.expression.text === "generatedComponents" && ts.isPropertyAccessExpression(expression.argumentExpression) &&
    ts.isIdentifier(expression.argumentExpression.expression) && expression.argumentExpression.expression.text === parameter &&
    expression.argumentExpression.name.text === "id"
  );
}

function hasPageIdentity(page) {
  return Boolean(
    page &&
    typeof page === "object" &&
    !Array.isArray(page) &&
    ["id", "route", "title", "pattern"].every((field) => typeof page[field] === "string" && page[field].trim() !== "")
  );
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim() !== ""))];
}

function checkStatusCopy(sourceFile, currentScenario, policy) {
  const config = currentScenario.expectedStatusCopy;
  if (!config?.source) return [];

  const findings = [];
  const statusSourcePath = resolveReadablePath(projectRoot, config.source, "expectedStatusCopy.source");
  const parsedSourceCopy = parseStatusCopy(readFileSync(statusSourcePath, "utf8"));
  const parsedCodeCopy = parseCodeStatusCopyAst(sourceFile);
  const copyMap = parsedSourceCopy.entries;
  const codeMap = parsedCodeCopy.groups;

  if (parsedSourceCopy.duplicates.length > 0) {
    findings.push({
      rule: "status-copy",
      severity: "error",
      message: `Status source contains duplicate group/key rows: ${parsedSourceCopy.duplicates.join(", ")}.`
    });
  }
  for (const message of parsedCodeCopy.errors) findings.push({ rule: "status-copy", severity: "error", message });

  const roots = scenarioEvidenceRoots(sourceFile, currentScenario);
  const badgeResult = collectStatusBadges(sourceFile, roots, { deep: policy.mode !== "kit-consumer" });
  const badges = badgeResult.badges;
  for (const message of badgeResult.errors) findings.push({ rule: "status-copy", severity: "error", message });
  if (!hasExactStatusBadgeHelper(sourceFile)) {
    findings.push({ rule: "status-copy", severity: "error", message: "StatusBadge must resolve statusCopy[group][status] and render copy.variant/copy.label." });
  }
  if ((config.statuses ?? []).length > 0 && badges.length === 0) {
    findings.push({ rule: "status-copy", severity: "error", message: "Legacy status assertions require at least one reachable StatusBadge with static group and a status prop." });
  }

  for (const [group, groupConfig] of Object.entries(config.groups ?? {})) {
    if (!codeMap.has(group)) {
      findings.push({ rule: "status-copy", severity: "error", message: `Generated statusCopy is missing code group "${group}".` });
      continue;
    }

    if (!badges.some((badge) => badge.group === group && badge.hasStatus)) {
      findings.push({
        rule: "status-copy",
        severity: "error",
        message: `${currentScenario.output.symbol ?? "Generated output"} does not contain a real StatusBadge with group="${group}" and a status prop.`
      });
    }

    for (const status of groupConfig.statuses) {
      const sourceEntry = copyMap.get(statusCopyKey(groupConfig.sourceGroup, status));
      const codeEntry = codeMap.get(group)?.get(status);
      if (!sourceEntry) {
        findings.push({
          rule: "status-copy",
          severity: "error",
          message: `Status "${status}" is not defined under source group "${groupConfig.sourceGroup}" in ${config.source}.`
        });
        continue;
      }
      if (!codeEntry) {
        findings.push({
          rule: "status-copy",
          severity: "error",
          message: `Generated statusCopy.${group} is missing status "${status}".`
        });
        continue;
      }
      if (codeEntry.label !== sourceEntry.label || codeEntry.variant !== sourceEntry.variant) {
        findings.push({
          rule: "status-copy",
          severity: "error",
          message: `statusCopy.${group}["${status}"] must bind label "${sourceEntry.label}" and variant "${sourceEntry.variant}"; found label "${codeEntry.label}" and variant "${codeEntry.variant}".`
        });
      }
    }
  }

  for (const status of config.statuses ?? []) {
    const sourceEntries = [...copyMap.entries()].filter(([key]) => key.endsWith(`\u0000${status}`)).map(([, entry]) => entry);
    const codeEntries = [...codeMap.values()].flatMap((group) => (group.has(status) ? [group.get(status)] : []));
    if (sourceEntries.length === 0) {
      findings.push({ rule: "status-copy", severity: "error", message: `Status "${status}" is not defined in ${config.source}.` });
      continue;
    }
    const hasMatchingBinding = sourceEntries.some((sourceEntry) =>
      codeEntries.some((codeEntry) => codeEntry.label === sourceEntry.label && codeEntry.variant === sourceEntry.variant)
    );
    if (!hasMatchingBinding) {
      findings.push({
        rule: "status-copy",
        severity: "error",
        message: `Missing a legacy label/variant binding for status "${status}" (source: ${config.source}). Add expectedStatusCopy.groups for exact group validation.`
      });
    }
  }

  return findings;
}

function parseCodeStatusCopyAst(sourceFile) {
  const groups = new Map();
  const errors = [];
  const declarations = findTopLevelVariables(sourceFile, "statusCopy");
  if (declarations.length !== 1) {
    return { groups, errors: [`Expected exactly one top-level statusCopy object; found ${declarations.length}.`] };
  }
  const rootObject = parseStaticObject(unwrapExpression(declarations[0].declaration.initializer), "statusCopy");
  errors.push(...rootObject.errors);
  for (const [group, groupNode] of rootObject.entries) {
    const groupObject = parseStaticObject(unwrapExpression(groupNode), `statusCopy.${group}`);
    errors.push(...groupObject.errors);
    const statuses = new Map();
    for (const [status, entryNode] of groupObject.entries) {
      const entryObject = parseStaticObject(unwrapExpression(entryNode), `statusCopy.${group}[${JSON.stringify(status)}]`);
      errors.push(...entryObject.errors);
      const label = staticString(entryObject.entries.get("label"));
      const variant = staticString(entryObject.entries.get("variant"));
      if (entryObject.entries.size !== 2 || label === null || variant === null) {
        errors.push(`statusCopy.${group}[${JSON.stringify(status)}] must contain only static label and variant strings.`);
      } else {
        statuses.set(status, { label, variant });
      }
    }
    groups.set(group, statuses);
  }
  return { groups, errors };
}

function collectStatusBadges(sourceFile, roots, { deep = false } = {}) {
  const badges = [];
  const errors = [];
  if (hasRuntimeShadow(sourceFile, "StatusBadge", { allowTopLevelFunction: true })) {
    errors.push("StatusBadge is shadowed by a runtime declaration outside its top-level helper.");
  }
  const forwardingHelpers = new Map();
  const forwardingOpenings = new Set();
  for (const statement of sourceFile.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name || statement.parameters.length !== 1) continue;
    const parameter = statement.parameters[0].name;
    if (!ts.isObjectBindingPattern(parameter)) continue;
    const bindings = new Map(parameter.elements.map((element) => [element.propertyName?.getText() ?? element.name.getText(), element.name.getText()]));
    const groupBinding = bindings.get("group");
    const statusBinding = bindings.get("status");
    if (!groupBinding || !statusBinding) continue;
    for (const root of collectReachableFunctionReturnExpressions(statement)) {
      walkRenderableAst(root, (current) => {
        const opening = ts.isJsxSelfClosingElement(current) ? current : ts.isJsxElement(current) ? current.openingElement : null;
        if (!opening || jsxTagName(opening) !== "StatusBadge") return;
        const groupAttribute = getJsxAttribute(opening.attributes, "group");
        const statusAttribute = getJsxAttribute(opening.attributes, "status");
        const groupExpression = groupAttribute?.initializer && ts.isJsxExpression(groupAttribute.initializer) ? unwrapExpression(groupAttribute.initializer.expression) : null;
        const statusExpression = statusAttribute?.initializer && ts.isJsxExpression(statusAttribute.initializer) ? unwrapExpression(statusAttribute.initializer.expression) : null;
        if (groupExpression && ts.isIdentifier(groupExpression) && groupExpression.text === groupBinding && statusExpression && ts.isIdentifier(statusExpression) && statusExpression.text === statusBinding) {
          forwardingHelpers.set(statement.name.text, true);
          forwardingOpenings.add(opening);
        }
      });
    }
  }
  for (const rootNode of roots) {
    const walk = deep ? walkAst : walkRenderableAst;
    walk(rootNode, (current) => {
      const opening = ts.isJsxSelfClosingElement(current)
        ? current
        : ts.isJsxElement(current)
          ? current.openingElement
          : null;
      if (!opening) return;
      if (forwardingHelpers.has(jsxTagName(opening))) {
        const group = jsxStringAttribute(opening.attributes, "group");
        const status = getJsxAttribute(opening.attributes, "status");
        if (group !== null && status?.initializer) badges.push({ group, hasStatus: true });
        return;
      }
      if (jsxTagName(opening) !== "StatusBadge") return;
      if (opening.attributes.properties.some(ts.isJsxSpreadAttribute)) {
        errors.push("StatusBadge must not use spread attributes.");
        return;
      }
      const groups = opening.attributes.properties.filter((property) => ts.isJsxAttribute(property) && property.name.text === "group");
      const statuses = opening.attributes.properties.filter((property) => ts.isJsxAttribute(property) && property.name.text === "status");
      const group = groups.length === 1 ? jsxStringAttribute(opening.attributes, "group") : null;
      if (group === null || statuses.length !== 1 || !statuses[0].initializer) {
        if (forwardingOpenings.has(opening)) return;
        errors.push("StatusBadge requires exactly one static group prop and one status prop.");
        return;
      }
      badges.push({ group, hasStatus: true });
    });
  }
  return { badges, errors };
}

function hasExactStatusBadgeHelper(sourceFile) {
  const functions = findTopLevelFunctions(sourceFile, "StatusBadge");
  if (functions.length !== 1) return false;
  const body = functions[0].body;
  if (!body || body.statements.length !== 3) return false;
  const [tableStatement, copyStatement, returnStatement] = body.statements;
  if (!ts.isVariableStatement(tableStatement) || !ts.isVariableStatement(copyStatement) || !ts.isReturnStatement(returnStatement)) return false;
  const tableDeclarations = tableStatement.declarationList.declarations;
  const copyDeclarations = copyStatement.declarationList.declarations;
  if (tableDeclarations.length !== 1 || copyDeclarations.length !== 1 || !ts.isIdentifier(tableDeclarations[0].name) || tableDeclarations[0].name.text !== "table" || !ts.isIdentifier(copyDeclarations[0].name) || copyDeclarations[0].name.text !== "copy") return false;
  const tableExpression = unwrapExpression(tableDeclarations[0].initializer);
  const tableFromStatusCopy = Boolean(
    tableExpression && ts.isElementAccessExpression(tableExpression) && ts.isIdentifier(tableExpression.expression) &&
    tableExpression.expression.text === "statusCopy" && ts.isIdentifier(tableExpression.argumentExpression) && tableExpression.argumentExpression.text === "group"
  );
  const copyExpression = unwrapExpression(copyDeclarations[0].initializer);
  const lookup = copyExpression && ts.isBinaryExpression(copyExpression) && copyExpression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
    ? unwrapExpression(copyExpression.left)
    : copyExpression;
  const copyFromTable = Boolean(
    lookup && ts.isElementAccessExpression(lookup) && ts.isIdentifier(lookup.expression) && lookup.expression.text === "table" &&
    ts.isIdentifier(lookup.argumentExpression) && lookup.argumentExpression.text === "status"
  );
  const returned = unwrapExpression(returnStatement.expression);
  if (!returned || !ts.isJsxElement(returned) || jsxTagName(returned.openingElement) !== "Badge" || returned.openingElement.attributes.properties.some(ts.isJsxSpreadAttribute)) return false;
  const variant = getJsxAttribute(returned.openingElement.attributes, "variant");
  const variantExpression = variant?.initializer && ts.isJsxExpression(variant.initializer) ? unwrapExpression(variant.initializer.expression) : null;
  const labelExpressions = returned.children.filter(ts.isJsxExpression).map((child) => unwrapExpression(child.expression));
  const renderedCopy = Boolean(
    variantExpression && ts.isPropertyAccessExpression(variantExpression) && ts.isIdentifier(variantExpression.expression) &&
    variantExpression.expression.text === "copy" && variantExpression.name.text === "variant" &&
    labelExpressions.length === 1 && labelExpressions[0] && ts.isPropertyAccessExpression(labelExpressions[0]) &&
    ts.isIdentifier(labelExpressions[0].expression) && labelExpressions[0].expression.text === "copy" && labelExpressions[0].name.text === "label"
  );
  return tableFromStatusCopy && copyFromTable && renderedCopy;
}

function parseStatusCopy(markdown) {
  const entries = new Map();
  const keys = [];
  const rowPattern = /^\|\s*([^|]+?)\s*\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|[^|]*\|\s*`([^`]+)`\s*\|/gm;
  for (const match of markdown.matchAll(rowPattern)) {
    const key = statusCopyKey(match[1], match[2]);
    keys.push(key);
    entries.set(key, {
      sourceGroup: match[1].trim(),
      label: match[3].trim(),
      variant: match[4].trim()
    });
  }
  return { entries, duplicates: duplicates(keys).map((key) => key.replace("\u0000", "/")) };
}

function statusCopyKey(sourceGroup, status) {
  return `${sourceGroup.trim()}\u0000${status}`;
}

function checkBuildRuntime(currentScenario) {
  if (!currentScenario.buildRuntime?.command) return [];

  const runtime = currentScenario.buildRuntime;
  const runtimeCwd = resolveReadablePath(projectRoot, runtime.cwd ?? ".", "buildRuntime.cwd");
  const configPath = resolveReadablePath(projectRoot, runtime.args[3], "buildRuntime tsconfig");
  const boundary = createCompilerBoundary([realProjectRoot, realTypeScriptRoot]);
  boundary.registerConfig(configPath);
  const configResult = ts.readConfigFile(configPath, boundary.readFile);
  if (configResult.error) return buildDiagnosticFindings([configResult.error], boundary);
  if (boundary.errors.length > 0) return buildDiagnosticFindings([], boundary);

  const parseHost = {
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
    fileExists: boundary.fileExists,
    readFile: boundary.readFile,
    readDirectory: boundary.readDirectory,
    trace: () => {}
  };
  const overrides = {
    noEmit: true,
    incremental: false,
    composite: false,
    tsBuildInfoFile: undefined,
    declaration: false,
    emitDeclarationOnly: false
  };
  const parsed = ts.parseJsonConfigFileContent(configResult.config, parseHost, dirname(configPath), overrides, configPath);
  for (const file of parsed.fileNames) boundary.assertReadable(file, "config source");
  for (const reference of parsed.projectReferences ?? []) boundary.assertReadable(reference.path, "project reference");
  if (boundary.errors.length > 0 || parsed.errors.length > 0) return buildDiagnosticFindings(parsed.errors, boundary);

  const baseHost = ts.createCompilerHost(parsed.options, true);
  const compilerHost = {
    ...baseHost,
    getCurrentDirectory: () => runtimeCwd,
    fileExists: boundary.fileExists,
    readFile: boundary.readFile,
    directoryExists: boundary.directoryExists,
    getDirectories: boundary.getDirectories,
    realpath: boundary.realpath,
    getSourceFile(fileName, languageVersion, onError) {
      const text = boundary.readFile(fileName);
      if (text === undefined) {
        onError?.(`Blocked or missing source: ${fileName}`);
        return undefined;
      }
      return ts.createSourceFile(fileName, text, languageVersion, true, scriptKindForPath(fileName));
    },
    writeFile(fileName) {
      boundary.errors.push(`blocked compiler write: ${fileName}`);
    }
  };
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    projectReferences: parsed.projectReferences,
    host: compilerHost
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  return buildDiagnosticFindings(diagnostics, boundary);
}

function createCompilerBoundary(allowedRoots) {
  const roots = [...new Set(allowedRoots.map((rootPath) => realpathSync(rootPath)))];
  const errors = [];
  const configFiles = new Set();
  const pathAllowed = (path) => roots.some((rootPath) => isPathWithin(rootPath, path));
  const canAccess = (candidate) => {
    const absolute = resolve(candidate);
    if (!pathAllowed(absolute)) return false;
    if (existsSync(absolute)) {
      const real = realpathSync(absolute);
      if (!pathAllowed(real)) return false;
    }
    return true;
  };
  const assertReadable = (candidate, label = "compiler read") => {
    const absolute = resolve(candidate);
    if (canAccess(absolute)) return true;
    errors.push(`blocked ${label} outside allowed roots: ${absolute}`);
    return false;
  };
  const registerConfig = (file) => {
    if (assertReadable(file, "config")) configFiles.add(resolve(file));
  };
  const inspectConfig = (config, configPath) => {
    const configDir = dirname(configPath);
    const checkProjectPath = (value, label, allowGlob = false) => {
      if (typeof value !== "string" || value.trim() === "") return;
      const prefix = allowGlob ? value.split(/[?*]/, 1)[0] : value;
      const target = resolve(configDir, prefix || ".");
      if (!isPathWithin(realProjectRoot, target)) errors.push(`blocked ${label} outside project root: ${target}`);
      else if (existsSync(target) && !isPathWithin(realProjectRoot, realpathSync(target))) errors.push(`blocked ${label} through escaping link: ${target}`);
    };
    const extended = Array.isArray(config.extends) ? config.extends : config.extends ? [config.extends] : [];
    for (const value of extended) {
      if (typeof value !== "string" || value.trim() === "") {
        errors.push(`invalid tsconfig extends: ${String(value)}`);
        continue;
      }
      let target;
      if (value.startsWith(".") || isAbsolute(value)) {
        target = resolve(configDir, value);
        if (!/\.json$/i.test(target)) target = `${target}.json`;
      } else {
        try {
          target = require.resolve(value, { paths: [configDir] });
        } catch {
          try {
            target = require.resolve(`${value}/tsconfig.json`, { paths: [configDir] });
          } catch {
            errors.push(`unable to resolve tsconfig extends package: ${value}`);
            continue;
          }
        }
      }
      if (!pathAllowed(target) || (existsSync(target) && !pathAllowed(realpathSync(target)))) {
        errors.push(`blocked tsconfig extends outside allowed roots: ${target}`);
      } else {
        configFiles.add(resolve(target));
      }
    }
    for (const key of ["files", "include"]) for (const value of config[key] ?? []) checkProjectPath(value, `tsconfig ${key}`, key === "include");
    for (const reference of config.references ?? []) checkProjectPath(reference?.path, "tsconfig reference");
    const options = config.compilerOptions ?? {};
    for (const key of ["baseUrl", "rootDir", "outDir", "declarationDir", "tsBuildInfoFile"]) checkProjectPath(options[key], `compilerOptions.${key}`);
    for (const key of ["typeRoots", "rootDirs"]) for (const value of options[key] ?? []) checkProjectPath(value, `compilerOptions.${key}`);
    const baseDir = typeof options.baseUrl === "string" ? resolve(configDir, options.baseUrl) : configDir;
    for (const [alias, values] of Object.entries(options.paths ?? {})) {
      for (const value of values ?? []) {
        const prefix = String(value).split(/[?*]/, 1)[0];
        const target = resolve(baseDir, prefix || ".");
        if (!isPathWithin(realProjectRoot, target)) errors.push(`blocked compilerOptions.paths.${alias} outside project root: ${target}`);
      }
    }
  };
  const readFile = (candidate) => {
    const absolute = resolve(candidate);
    if (!assertReadable(absolute)) return undefined;
    let text;
    try {
      text = readFileSync(absolute, "utf8");
    } catch {
      return undefined;
    }
    if (configFiles.has(absolute)) {
      const parsed = ts.parseConfigFileTextToJson(absolute, text);
      if (parsed.error) errors.push(`invalid tsconfig: ${ts.flattenDiagnosticMessageText(parsed.error.messageText, " ")}`);
      else inspectConfig(parsed.config, absolute);
    }
    return text;
  };
  const fileExists = (candidate) => {
    const absolute = resolve(candidate);
    return canAccess(absolute) && existsSync(absolute) && statSync(absolute).isFile();
  };
  const directoryExists = (candidate) => {
    const absolute = resolve(candidate);
    return canAccess(absolute) && existsSync(absolute) && statSync(absolute).isDirectory();
  };
  const readDirectory = (candidate, extensions, excludes, includes, depth) => {
    if (!canAccess(candidate)) return [];
    return ts.sys.readDirectory(candidate, extensions, excludes, includes, depth).filter((file) => assertReadable(file));
  };
  const getDirectories = (candidate) => {
    if (!canAccess(candidate)) return [];
    return ts.sys.getDirectories(candidate).filter((directory) => canAccess(directory));
  };
  const realpath = (candidate) => canAccess(candidate) && existsSync(candidate) ? realpathSync(candidate) : resolve(candidate);
  return { errors, registerConfig, assertReadable, readFile, fileExists, directoryExists, readDirectory, getDirectories, realpath };
}

function scriptKindForPath(file) {
  if (/\.tsx$/i.test(file)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(file)) return ts.ScriptKind.JSX;
  if (/\.json$/i.test(file)) return ts.ScriptKind.JSON;
  if (/\.js$/i.test(file)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function buildDiagnosticFindings(diagnostics, boundary) {
  const messages = [...new Set(boundary.errors)];
  if (messages.length === 0) {
    const host = {
      getCanonicalFileName: (file) => file,
      getCurrentDirectory: () => projectRoot,
      getNewLine: () => "\n"
    };
    const formatted = ts.formatDiagnostics(diagnostics, host).trim();
    if (formatted) messages.push(formatted);
  }
  return messages.length === 0
    ? []
    : [{ rule: "build-runtime", severity: "error", message: `Build runtime failed: ${sanitizeDiagnostic(messages.join("\n"))}` }];
}

function checkExpectedActions(sourceFile, currentScenario, policy) {
  const config = currentScenario.expectedActions;
  if (!config) return [];
  const deep = policy.mode !== "kit-consumer";
  const roots = scenarioEvidenceRoots(sourceFile, currentScenario);
  if (roots.length === 0) return [{ rule: "action-condition", severity: "error", message: `Unable to resolve reachable action scope ${currentScenario.output.symbol}.` }];
  const findings = [];
  const pageActions = collectButtonActions(sourceFile, roots, { deep, includeMenuActions: true });
  for (const message of pageActions.errors) findings.push({ rule: "action-condition", severity: "error", message });
  if ((config.forbidden ?? []).length > 0 && pageActions.unknownLabels > 0) {
    findings.push({ rule: "action-condition", severity: "error", message: "Page contains Button labels that cannot be proven outside the forbidden action set." });
  }
  const pageDangerLabels = [...new Set(config.danger ?? [])];
  if (pageDangerLabels.length > 0 && pageActions.unknownActions.some((node) => {
    const labels = resolveScenarioDynamicButtonLabels(sourceFile, node, currentScenario);
    return !labels || labels.some((label) => pageDangerLabels.includes(label));
  })) {
    findings.push({ rule: "action-condition", severity: "error", message: "Page contains dynamic Button labels, so danger action cardinality cannot be proven." });
  }
  checkActionContracts(findings, pageActions.actions, config, "page");

  for (const condition of config.conditions ?? []) {
    const expected = parseScenarioExpression(condition.when);
    if (!expected) {
      findings.push({ rule: "action-condition", severity: "error", message: `Invalid scenario action condition: ${condition.when}.` });
      continue;
    }
    const expectedShape = printExpression(expected);
    const matches = [];
    const walk = deep ? walkAst : walkRenderableAst;
    for (const rootNode of roots) walk(rootNode, (node) => {
        if (ts.isConditionalExpression(node) && printExpression(node.condition) === expectedShape) matches.push(node);
      });
    if (matches.length !== 1) {
      findings.push({ rule: "action-condition", severity: "error", message: `Expected exactly one real ternary for "${condition.when}"; found ${matches.length}.` });
      continue;
    }
    const branch = condition.branch === "then" ? matches[0].whenTrue : matches[0].whenFalse;
    const oppositeBranch = condition.branch === "then" ? matches[0].whenFalse : matches[0].whenTrue;
    const branchActions = collectButtonActions(sourceFile, [branch], { deep, includeMenuActions: true });
    const oppositeActions = collectButtonActions(sourceFile, [oppositeBranch], { deep, includeMenuActions: true });
    const outsideActions = pageActions.actions.filter((action) => !isAstDescendant(action.node, matches[0]));
    const outsideUnknownActions = pageActions.unknownActions.filter((node) => !isAstDescendant(node, matches[0]));
    for (const message of branchActions.errors) findings.push({ rule: "action-condition", severity: "error", message });
    if ((condition.forbidden ?? []).length > 0 && branchActions.unknownLabels > 0) {
      findings.push({ rule: "action-condition", severity: "error", message: `${condition.branch} branch contains Button labels that cannot be proven outside the forbidden action set.` });
    }
    checkActionContracts(findings, branchActions.actions, condition, `${condition.branch} branch of "${condition.when}"`);
    const protectedLabels = [...new Set([...(condition.required ?? []), ...(condition.danger ?? [])])];
    if (protectedLabels.length > 0 && branchActions.unknownActions.length > 0) {
      findings.push({ rule: "action-condition", severity: "error", message: `${condition.branch} branch of "${condition.when}" contains dynamic Button labels, so exact conditional action cardinality cannot be proven.` });
    }
    if (protectedLabels.length > 0 && oppositeActions.unknownActions.length > 0) {
      findings.push({ rule: "action-condition", severity: "error", message: `Opposite branch of "${condition.when}" contains dynamic Button labels that cannot be proven different from protected conditional actions.` });
    }
    const unresolvedOutside = outsideUnknownActions.filter((node) => {
      const labels = resolveScenarioDynamicButtonLabels(sourceFile, node, currentScenario);
      return !labels || labels.some((label) => protectedLabels.includes(label));
    });
    if (protectedLabels.length > 0 && unresolvedOutside.length > 0) {
      findings.push({ rule: "action-condition", severity: "error", message: `Buttons outside "${condition.when}" have dynamic labels that cannot be proven different from protected conditional actions.` });
    }
    for (const label of protectedLabels) {
      if (branchActions.actions.filter((action) => action.label === label).length !== 1) {
        findings.push({ rule: "action-condition", severity: "error", message: `${condition.branch} branch of "${condition.when}" must contain exactly one action "${label}".` });
      }
      if (oppositeActions.actions.some((action) => action.label === label)) {
        findings.push({ rule: "action-condition", severity: "error", message: `Opposite branch of "${condition.when}" must not contain conditional action "${label}".` });
      }
      if (outsideActions.some((action) => action.label === label)) {
        findings.push({ rule: "action-condition", severity: "error", message: `Conditional action "${label}" also appears outside "${condition.when}".` });
      }
    }
  }

  return findings;
}

function checkExpectedConfirmations(sourceFile, currentScenario, policy) {
  const confirmations = currentScenario.expectedConfirmations ?? [];
  if (confirmations.length === 0) return [];
  const deep = policy.mode !== "kit-consumer";
  const roots = scenarioEvidenceRoots(sourceFile, currentScenario);
  const pageFunction = scenarioAstScope(sourceFile, currentScenario);
  if (!pageFunction || !pageFunction.body || !ts.isBlock(pageFunction.body)) {
    return [{
      rule: "confirmation-state",
      severity: "error",
      message: "expectedConfirmations requires exactly one reachable output.symbol page function."
    }];
  }

  const findings = [];
  const pageActions = collectButtonActions(sourceFile, roots, { deep });
  for (const message of pageActions.errors) findings.push({ rule: "confirmation-contract", severity: "error", message });
  const stateTuples = collectConfirmationStateTuples(sourceFile, pageFunction);
  const dialogs = collectConfirmDialogNodes(sourceFile, roots, { deep });

  for (const confirmation of confirmations) {
    const scope = `Confirmation action ${JSON.stringify(confirmation.action)}`;
    const unresolvedActions = pageActions.unknownActions.filter((node) => {
      const labels = resolveScenarioDynamicButtonLabels(sourceFile, node, currentScenario);
      return !labels || labels.includes(confirmation.action);
    });
    if (unresolvedActions.length > 0) {
      findings.push({
        rule: "confirmation-contract",
        severity: "error",
        message: `${scope} has dynamic Button labels, so trigger cardinality cannot be proven.`
      });
    }

    const matchingActions = pageActions.actions.filter((action) => action.label === confirmation.action);
    if (matchingActions.length === 0) {
      findings.push({
        rule: "confirmation-contract",
        severity: "error",
        message: `${scope} must resolve to at least one reachable Button.`
      });
      continue;
    }
    const triggerHandlers = [];
    let triggerContractFailed = false;
    for (const trigger of matchingActions) {
      const triggerTag = deep ? jsxTagName(trigger.node.openingElement) : canonicalKitTag(sourceFile, trigger.node.openingElement);
      if (triggerTag !== "Button" && triggerTag !== "AntButton") {
        findings.push({ rule: "confirmation-contract", severity: "error", message: `${scope} must use a kit Button.` });
        triggerContractFailed = true;
        continue;
      }
      if (trigger.danger !== confirmation.danger) {
        findings.push({
          rule: "confirmation-contract",
          severity: "error",
          message: `${scope} Button danger must be ${confirmation.danger}.`
        });
        triggerContractFailed = true;
      }
      if (trigger.node.openingElement.attributes.properties.some(ts.isJsxSpreadAttribute)) {
        findings.push({
          rule: "confirmation-contract",
          severity: "error",
          message: `${scope} Button must not use spread attributes.`
        });
        triggerContractFailed = true;
        continue;
      }
      const handler = isAstDescendant(trigger.node, pageFunction)
        ? resolvePageEventHandler(trigger.node.openingElement.attributes, "onClick", pageFunction)
        : resolveConfirmationComponentCallback(sourceFile, trigger.node, pageFunction);
      if (!handler) {
        findings.push({
          rule: "confirmation-state",
          severity: "error",
          message: `${scope} Button onClick must resolve in the page scope or through exactly one local component callback prop.`
        });
        triggerContractFailed = true;
        continue;
      }
      triggerHandlers.push(handler);
    }
    if (triggerContractFailed || triggerHandlers.length !== matchingActions.length) continue;

    let stateTuple = null;
    let triggerCalls = [];
    if (confirmation.state) {
      const candidates = stateTuples.filter(
        (tuple) => tuple.value === confirmation.state.variable && confirmationStateInitialMatches(tuple, confirmation.state.clearValue)
      );
      if (candidates.length !== 1) {
        findings.push({
          rule: "confirmation-state",
          severity: "error",
          message: `${scope} state.variable must name exactly one top-level useState initialized to ${JSON.stringify(confirmation.state.clearValue)}.`
        });
        continue;
      }
      stateTuple = candidates[0];
      triggerCalls = triggerHandlers.map((handler) => confirmationDirectSetterCall(handler, stateTuple.setter, pageFunction));
      if (
        triggerCalls.some((call) => !call) ||
        triggerCalls.some((call) => !confirmationTriggerArgumentMatches(call.arguments[0], confirmation.state.triggerValue))
      ) {
        findings.push({
          rule: "confirmation-state",
          severity: "error",
          message: `${scope} every static trigger must directly set ${stateTuple.setter} to the declared triggerValue.`
        });
        continue;
      }
    } else {
      const openingTuples = stateTuples.filter((tuple) =>
        confirmationStateInitialMatches(tuple, false) &&
        triggerHandlers.every((handler) => {
          const call = confirmationDirectSetterCall(handler, tuple.setter, pageFunction);
          return Boolean(call && confirmationPrimitiveArgumentMatches(call.arguments[0], true));
        })
      );
      if (openingTuples.length !== 1) {
        findings.push({
          rule: "confirmation-state",
          severity: "error",
          message: `${scope} onClick must directly set exactly one top-level useState(false) setter to true.`
        });
        continue;
      }
      stateTuple = openingTuples[0];
      triggerCalls = triggerHandlers.map((handler) => confirmationDirectSetterCall(handler, stateTuple.setter, pageFunction));
    }

    const openMode = confirmation.state?.openMode ?? "direct";
    const matchingDialogs = dialogs.filter((dialog) => {
      if (!isAstDescendant(dialog.node, pageFunction)) return false;
      return confirmationDialogOpenMatches(dialog.opening.attributes, stateTuple.value, openMode, pageFunction);
    });
    if (matchingDialogs.length !== 1) {
      findings.push({
        rule: "confirmation-state",
        severity: "error",
        message: `${scope} triggers and ConfirmDialog.open must share exactly one declared state; found ${matchingDialogs.length} dialogs.`
      });
      continue;
    }

    const dialog = matchingDialogs[0];
    const nativeModal = dialog.tag === "Modal";
    if (
      ts.isIdentifier(dialog.opening.tagName) &&
      hasLexicalRuntimeShadow(dialog.opening.tagName, dialog.opening.tagName.text, pageFunction)
    ) {
      findings.push({ rule: "confirmation-contract", severity: "error", message: `${scope} ConfirmDialog binding is shadowed.` });
      continue;
    }
    if (dialog.opening.attributes.properties.some(ts.isJsxSpreadAttribute)) {
      findings.push({
        rule: "confirmation-contract",
        severity: "error",
        message: `${scope} ConfirmDialog must not use spread attributes.`
      });
      continue;
    }

    const stateValue = confirmation.state
      ? confirmationValueFromArgument(triggerCalls[0].arguments[0], confirmation.state.triggerValue)
      : confirmationKnown(true);
    const stateEnvironment = new Map([[stateTuple.value, stateValue]]);
    const title = confirmationStringAttribute(dialog.opening.attributes, "title", stateEnvironment);
    if (title !== confirmation.title) {
      findings.push({
        rule: "confirmation-contract",
        severity: "error",
        message: `${scope} ConfirmDialog title must be ${JSON.stringify(confirmation.title)}.`
      });
    }
    const confirmLabel = confirmationStringAttribute(
      dialog.opening.attributes,
      nativeModal ? "okText" : "confirmLabel",
      stateEnvironment
    );
    if (confirmLabel !== confirmation.confirmLabel) {
      findings.push({
        rule: "confirmation-contract",
        severity: "error",
        message: `${scope} ConfirmDialog confirmLabel must be ${JSON.stringify(confirmation.confirmLabel)}.`
      });
    }
    const dialogDanger = nativeModal
      ? confirmationObjectBooleanAttribute(dialog.opening.attributes, "okButtonProps", "danger", stateEnvironment)
      : confirmationBooleanAttribute(dialog.opening.attributes, "danger", stateEnvironment);
    if (!dialogDanger.known || dialogDanger.value !== confirmation.danger) {
      findings.push({
        rule: "confirmation-contract",
        severity: "error",
        message: `${scope} ConfirmDialog danger must resolve to ${confirmation.danger} for the declared triggerValue.`
      });
    }
    const dialogEvidence = nativeModal
      ? confirmationNodeTextFragments(dialog.node, stateEnvironment)
      : confirmationAttributeTextFragments(dialog.opening.attributes, "description", stateEnvironment);
    for (const requiredText of confirmation.requiredText) {
      if (!dialogEvidence.some((value) => value.includes(requiredText))) {
        findings.push({
          rule: "confirmation-contract",
          severity: "error",
          message: `${scope} ConfirmDialog is missing required text ${JSON.stringify(requiredText)}.`
        });
      }
    }

    for (const handlerName of ["onCancel", nativeModal ? "onOk" : "onConfirm"]) {
      const handler = resolvePageEventHandler(dialog.opening.attributes, handlerName, pageFunction);
      const clearValue = confirmation.state ? confirmation.state.clearValue : false;
      const clearsState = confirmation.state
        ? Boolean(handler && confirmationHandlerClearsState(handler, stateTuple, clearValue, stateEnvironment, pageFunction))
        : Boolean(
            handler &&
            confirmationDirectSetterCall(handler, stateTuple.setter, pageFunction) &&
            confirmationPrimitiveArgumentMatches(
              confirmationDirectSetterCall(handler, stateTuple.setter, pageFunction).arguments[0],
              false
            )
          );
      if (!clearsState) {
        findings.push({
          rule: "confirmation-close",
          severity: "error",
          message: confirmation.state
            ? `${scope} ${handlerName} must clear ${stateTuple.value} to ${JSON.stringify(clearValue)} on every reachable exit.`
            : `${scope} ${handlerName} must close the shared state with ${stateTuple.setter}(false).`
        });
      }
    }
  }

  return findings;
}

function collectConfirmationStateTuples(sourceFile, functionNode) {
  const useStateBindings = new Set(namedImportBindings(sourceFile, "react", "useState"));
  const tuples = [];
  for (const statement of functionNode.body?.statements ?? []) {
    if (!ts.isVariableStatement(statement) || !(statement.declarationList.flags & ts.NodeFlags.Const)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isArrayBindingPattern(declaration.name) || declaration.name.elements.length !== 2) continue;
      const [valueBinding, setterBinding] = declaration.name.elements;
      if (
        ts.isOmittedExpression(valueBinding) || ts.isOmittedExpression(setterBinding) ||
        valueBinding.dotDotDotToken || setterBinding.dotDotDotToken ||
        valueBinding.initializer || setterBinding.initializer ||
        !ts.isIdentifier(valueBinding.name) || !ts.isIdentifier(setterBinding.name)
      ) continue;
      const call = unwrapExpression(declaration.initializer);
      if (!call || !ts.isCallExpression(call) || call.arguments.length !== 1) continue;
      const callee = unwrapExpression(call.expression);
      if (!callee || !ts.isIdentifier(callee) || !useStateBindings.has(callee.text)) continue;
      if (hasLexicalRuntimeShadow(callee, callee.text, functionNode)) continue;
      tuples.push({
        value: valueBinding.name.text,
        setter: setterBinding.name.text,
        setterBinding: setterBinding.name,
        initialValue: unwrapExpression(call.arguments[0])
      });
    }
  }
  return tuples;
}

function confirmationStateInitialMatches(tuple, expectedValue) {
  const initial = staticPrimitiveValue(tuple.initialValue);
  return initial.known && initial.value === expectedValue;
}

function collectConfirmDialogNodes(sourceFile, roots, { deep = false } = {}) {
  const dialogs = [];
  const seen = new Set();
  for (const rootNode of roots) {
    const walk = deep ? walkAst : walkRenderableAst;
    walk(rootNode, (node) => {
      const opening = ts.isJsxSelfClosingElement(node)
        ? node
        : ts.isJsxElement(node)
          ? node.openingElement
          : null;
      if (!opening || seen.has(node)) return;
      const tag = deep ? jsxTagName(opening) : canonicalKitTag(sourceFile, opening);
      if (tag !== "ConfirmDialog" && !(deep && (tag === "ConfirmModal" || tag === "Modal"))) return;
      seen.add(node);
      dialogs.push({ node, opening, tag });
    });
  }
  return dialogs;
}

function jsxUniqueAttribute(attributes, name) {
  const matches = attributes.properties.filter(
    (property) => ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === name
  );
  return matches.length === 1 ? matches[0] : null;
}

function resolvePageEventHandler(attributes, name, pageFunction) {
  const attribute = jsxUniqueAttribute(attributes, name);
  const expression = attribute?.initializer && ts.isJsxExpression(attribute.initializer)
    ? unwrapExpression(attribute.initializer.expression)
    : null;
  if (!expression) return null;
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) return expression;
  if (!ts.isIdentifier(expression) || !pageFunction.body || !ts.isBlock(pageFunction.body)) return null;
  if (hasNestedRuntimeShadow(expression, expression.text, pageFunction)) return null;

  const candidates = [];
  for (const statement of pageFunction.body.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === expression.text && statement.body) {
      candidates.push(statement);
      continue;
    }
    if (!ts.isVariableStatement(statement) || !(statement.declarationList.flags & ts.NodeFlags.Const)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== expression.text || declaration.pos >= attribute.pos) continue;
      const initializer = unwrapExpression(declaration.initializer);
      if (initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))) candidates.push(initializer);
    }
  }
  if (candidates.length !== 1 || functionWritesBinding(pageFunction, expression.text)) return null;
  return candidates[0];
}

function resolveConfirmationComponentCallback(sourceFile, triggerNode, pageFunction) {
  let componentFunction = null;
  for (let current = triggerNode.parent; current && current !== sourceFile; current = current.parent) {
    if (ts.isFunctionDeclaration(current) && current.name && current.parent === sourceFile) {
      componentFunction = current;
      break;
    }
  }
  if (!componentFunction || !componentFunction.name || componentFunction === pageFunction) return null;

  const triggerAttribute = jsxUniqueAttribute(triggerNode.openingElement.attributes, "onClick");
  const triggerExpression = triggerAttribute?.initializer && ts.isJsxExpression(triggerAttribute.initializer)
    ? unwrapExpression(triggerAttribute.initializer.expression)
    : null;
  const forwarded = confirmationForwardedCallback(triggerExpression);
  if (!forwarded) return null;

  const parameter = componentFunction.parameters[0]?.name;
  if (!parameter || !ts.isObjectBindingPattern(parameter)) return null;
  const propBinding = parameter.elements.filter((element) =>
    ts.isIdentifier(element.name) && element.name.text === forwarded.localName && !element.dotDotDotToken && !element.initializer
  );
  if (propBinding.length !== 1) return null;
  const propName = staticPropertyName(propBinding[0].propertyName ?? propBinding[0].name);
  if (!propName) return null;

  const invocations = [];
  for (const root of functionRenderRoots(pageFunction)) {
    walkRenderableAst(root, (node) => {
      const opening = ts.isJsxSelfClosingElement(node) ? node : ts.isJsxElement(node) ? node.openingElement : null;
      if (
        opening && ts.isIdentifier(opening.tagName) && opening.tagName.text === componentFunction.name.text &&
        isAstDescendant(opening, pageFunction)
      ) invocations.push(opening);
    });
  }
  if (invocations.length !== 1 || invocations[0].attributes.properties.some(ts.isJsxSpreadAttribute)) return null;
  const parentAttribute = jsxUniqueAttribute(invocations[0].attributes, propName);
  const parentExpression = parentAttribute?.initializer && ts.isJsxExpression(parentAttribute.initializer)
    ? unwrapExpression(parentAttribute.initializer.expression)
    : null;
  if (!parentExpression) return null;

  if (ts.isArrowFunction(parentExpression) || ts.isFunctionExpression(parentExpression)) {
    if (forwarded.arguments.length !== 0) return null;
    return parentExpression;
  }
  if (
    ts.isIdentifier(parentExpression) && forwarded.arguments.length > 0 &&
    !hasNestedRuntimeShadow(parentExpression, parentExpression.text, pageFunction)
  ) {
    return {
      syntheticSetterCall: {
        callee: parentExpression.text,
        arguments: forwarded.arguments
      }
    };
  }
  return null;
}

function confirmationForwardedCallback(expression) {
  if (!expression) return null;
  if (ts.isIdentifier(expression)) return { localName: expression.text, arguments: [] };
  if (!ts.isArrowFunction(expression) && !ts.isFunctionExpression(expression)) return null;
  const body = unwrapExpression(expression.body);
  const call = body && ts.isCallExpression(body)
    ? body
    : ts.isBlock(expression.body) && expression.body.statements.length === 1 && ts.isExpressionStatement(expression.body.statements[0])
      ? unwrapExpression(expression.body.statements[0].expression)
      : null;
  if (!call || !ts.isCallExpression(call) || call.questionDotToken) return null;
  const callee = unwrapExpression(call.expression);
  if (!callee || !ts.isIdentifier(callee)) return null;
  return { localName: callee.text, arguments: [...call.arguments] };
}

function confirmationDirectSetterCall(handler, setterName, pageFunction) {
  if (handler?.syntheticSetterCall) {
    return handler.syntheticSetterCall.callee === setterName && handler.syntheticSetterCall.arguments.length === 1
      ? handler.syntheticSetterCall
      : null;
  }
  if (handler.parameters.some((parameter) => bindingContainsName(parameter.name, setterName))) return false;
  const body = handler.body;
  if (!body) return null;
  const calls = [];
  let invalidReference = false;
  walkAst(body, (node) => {
    if (!ts.isIdentifier(node) || node.text !== setterName || identifierIsStaticPropertyName(node)) return;
    if (hasNestedRuntimeShadow(node, setterName, pageFunction)) return;
    const call = directIdentifierCalleeCall(node);
    if (!call) {
      invalidReference = true;
    } else if (!calls.includes(call)) {
      calls.push(call);
    }
  }, { skipNestedFunctions: true, rootFunction: handler });
  if (invalidReference || calls.length !== 1 || calls[0].questionDotToken || calls[0].arguments.length !== 1) return null;

  if (ts.isArrowFunction(handler) && !ts.isBlock(body)) {
    return unwrapExpression(body) === calls[0] ? calls[0] : null;
  }
  if (!ts.isBlock(body)) return null;
  const directSetterIndex = body.statements.findIndex((statement) =>
    ts.isExpressionStatement(statement) && unwrapExpression(statement.expression) === calls[0]
  );
  if (directSetterIndex < 0 || body.statements.slice(0, directSetterIndex).some(statementCanBypassFollowingCode)) return null;
  return calls[0];
}

function statementCanBypassFollowingCode(statement) {
  let canBypass = false;
  walkAst(statement, (node) => {
    if (
      ts.isReturnStatement(node) || ts.isThrowStatement(node) ||
      ts.isBreakStatement(node) || ts.isContinueStatement(node) ||
      ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node) ||
      ts.isWhileStatement(node) || ts.isDoStatement(node) || ts.isSwitchStatement(node) ||
      ts.isTryStatement(node) || ts.isWithStatement(node)
    ) canBypass = true;
  }, { skipNestedFunctions: true });
  return canBypass;
}

function hasNestedRuntimeShadow(node, name, pageFunction) {
  if (!isAstDescendant(node, pageFunction)) return true;
  for (let current = node.parent; current && current !== pageFunction; current = current.parent) {
    if (current === pageFunction.body) break;
    if (ts.isFunctionLike(current) && (
      current.parameters.some((parameter) => bindingContainsName(parameter.name, name)) ||
      ((ts.isFunctionExpression(current) || ts.isFunctionDeclaration(current)) && current.name?.text === name)
    )) return true;
    if (ts.isCatchClause(current) && current.variableDeclaration && bindingContainsName(current.variableDeclaration.name, name)) return true;
    if (!ts.isBlock(current)) continue;
    for (const statement of current.statements) {
      if (ts.isVariableStatement(statement) && statement.declarationList.declarations.some((declaration) => bindingContainsName(declaration.name, name))) return true;
      if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name?.text === name) return true;
    }
  }
  return false;
}

function identifierIsStaticPropertyName(identifier) {
  const parent = identifier.parent;
  return Boolean(
    (ts.isPropertyAccessExpression(parent) && parent.name === identifier) ||
    (ts.isPropertyAssignment(parent) && parent.name === identifier) ||
    (ts.isMethodDeclaration(parent) && parent.name === identifier)
  );
}

function directIdentifierCalleeCall(identifier) {
  let current = identifier;
  while (
    current.parent &&
    (ts.isParenthesizedExpression(current.parent) || ts.isAsExpression(current.parent) || ts.isSatisfiesExpression(current.parent)) &&
    current.parent.expression === current
  ) current = current.parent;
  return ts.isCallExpression(current.parent) && current.parent.expression === current ? current.parent : null;
}

function confirmationPrimitiveArgumentMatches(argument, expectedValue) {
  const primitive = staticPrimitiveValue(argument);
  return primitive.known && primitive.value === expectedValue;
}

function confirmationTriggerArgumentMatches(argument, expectedValue) {
  const expression = unwrapExpression(argument);
  if (expectedValue === "non-null") {
    return Boolean(expression && confirmationExpressionProvenNonNull(expression));
  }
  if (!expression || !ts.isObjectLiteralExpression(expression)) return false;
  const entries = confirmationObjectSubsetEntries(expression, Object.keys(expectedValue));
  if (!entries) return false;
  return Object.entries(expectedValue).every(([key, expected]) => {
    const actual = entries.get(key);
    const primitive = staticPrimitiveValue(actual);
    return primitive.known && primitive.value === expected;
  });
}

function confirmationExpressionProvenNonNull(node) {
  const expression = unwrapExpression(node);
  if (!expression) return false;
  const nullish = staticNullish(expression);
  if (nullish !== null) return !nullish;
  if (!ts.isIdentifier(expression)) return false;
  return confirmationIdentifierIsNonNullParameter(expression) || confirmationIdentifierHasTruthyGuard(expression);
}

function confirmationIdentifierIsNonNullParameter(identifier) {
  for (let current = identifier.parent; current; current = current.parent) {
    if (!ts.isFunctionLike(current)) continue;
    const parameter = current.parameters.find((candidate) => bindingContainsName(candidate.name, identifier.text));
    if (!parameter) continue;
    if (parameter.questionToken) return false;
    if (parameter.type) {
      let containsNullish = false;
      walkAst(parameter.type, (node) => {
        if (
          node.kind === ts.SyntaxKind.NullKeyword || node.kind === ts.SyntaxKind.UndefinedKeyword ||
          (ts.isLiteralTypeNode(node) && node.literal.kind === ts.SyntaxKind.NullKeyword)
        ) containsNullish = true;
      });
      return !containsNullish;
    }
    return renderCallbackRoots(current).length > 0;
  }
  return false;
}

function confirmationIdentifierHasTruthyGuard(identifier) {
  for (let current = identifier.parent; current; current = current.parent) {
    if (
      ts.isConditionalExpression(current) && isAstDescendant(identifier, current.whenTrue) &&
      confirmationConditionProvesNonNull(current.condition, identifier.text)
    ) return true;
    if (
      ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      isAstDescendant(identifier, current.right) && confirmationConditionProvesNonNull(current.left, identifier.text)
    ) return true;
  }
  return false;
}

function confirmationConditionProvesNonNull(node, name) {
  const expression = unwrapExpression(node);
  if (!expression) return false;
  if (ts.isIdentifier(expression)) return expression.text === name;
  if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
    let root = unwrapExpression(expression.expression);
    while (root && (ts.isPropertyAccessExpression(root) || ts.isElementAccessExpression(root))) root = unwrapExpression(root.expression);
    return Boolean(root && ts.isIdentifier(root) && root.text === name);
  }
  if (ts.isCallExpression(expression)) {
    const callee = unwrapExpression(expression.expression);
    const argument = expression.arguments.length === 1 ? unwrapExpression(expression.arguments[0]) : null;
    return Boolean(callee && ts.isIdentifier(callee) && callee.text === "Boolean" && argument && ts.isIdentifier(argument) && argument.text === name);
  }
  if (!ts.isBinaryExpression(expression)) return false;
  const operator = expression.operatorToken.kind;
  if (operator === ts.SyntaxKind.AmpersandAmpersandToken) {
    return confirmationConditionProvesNonNull(expression.left, name) || confirmationConditionProvesNonNull(expression.right, name);
  }
  if (operator === ts.SyntaxKind.BarBarToken) {
    return confirmationConditionProvesNonNull(expression.left, name) && confirmationConditionProvesNonNull(expression.right, name);
  }
  const left = unwrapExpression(expression.left);
  const right = unwrapExpression(expression.right);
  const leftIsName = left && ts.isIdentifier(left) && left.text === name;
  const rightIsName = right && ts.isIdentifier(right) && right.text === name;
  const leftNullish = staticNullish(left);
  const rightNullish = staticNullish(right);
  if (operator === ts.SyntaxKind.ExclamationEqualsEqualsToken || operator === ts.SyntaxKind.ExclamationEqualsToken) {
    return Boolean((leftIsName && rightNullish === true) || (rightIsName && leftNullish === true));
  }
  if (operator === ts.SyntaxKind.EqualsEqualsEqualsToken || operator === ts.SyntaxKind.EqualsEqualsToken) {
    if (leftIsName && rightNullish === false) return true;
    if (rightIsName && leftNullish === false) return true;
    const propertySide = ts.isPropertyAccessExpression(left) || ts.isElementAccessExpression(left) ? left
      : ts.isPropertyAccessExpression(right) || ts.isElementAccessExpression(right) ? right
        : null;
    const valueSide = propertySide === left ? right : left;
    return Boolean(propertySide && staticNullish(valueSide) === false && confirmationConditionProvesNonNull(propertySide, name));
  }
  return false;
}

function confirmationObjectSubsetEntries(expression, expectedKeys) {
  const expected = new Set(expectedKeys);
  const entries = new Map();
  for (const property of expression.properties) {
    if (ts.isSpreadAssignment(property)) return null;
    const key = "name" in property ? staticPropertyName(property.name) : null;
    if (key === null) return null;
    if (!expected.has(key)) continue;
    if (!ts.isPropertyAssignment(property) || entries.has(key)) return null;
    entries.set(key, property.initializer);
  }
  return expectedKeys.every((key) => entries.has(key)) ? entries : null;
}

const confirmationUnknown = Object.freeze({ kind: "unknown" });
const confirmationNonNull = Object.freeze({ kind: "non-null" });

function confirmationKnown(value) {
  return { kind: "known", value };
}

function confirmationObject(entries) {
  return { kind: "object", entries };
}

function confirmationValueFromArgument(argument, expectedValue) {
  if (expectedValue === "non-null") return confirmationNonNull;
  const expression = unwrapExpression(argument);
  const entries = new Map();
  if (expression && ts.isObjectLiteralExpression(expression)) {
    for (const property of expression.properties) {
      if (ts.isPropertyAssignment(property)) {
        const key = staticPropertyName(property.name);
        if (key === null || entries.has(key)) continue;
        const primitive = staticPrimitiveValue(property.initializer);
        entries.set(
          key,
          primitive.known
            ? confirmationKnown(primitive.value)
            : confirmationExpressionProvenNonNull(property.initializer)
              ? confirmationNonNull
              : confirmationUnknown
        );
      } else if (ts.isShorthandPropertyAssignment(property) && !entries.has(property.name.text)) {
        entries.set(
          property.name.text,
          confirmationExpressionProvenNonNull(property.name) ? confirmationNonNull : confirmationUnknown
        );
      }
    }
  }
  for (const [key, value] of Object.entries(expectedValue)) entries.set(key, confirmationKnown(value));
  return confirmationObject(entries);
}

function confirmationDialogOpenMatches(attributes, stateName, openMode, pageFunction) {
  const attribute = jsxUniqueAttribute(attributes, "open");
  const expression = attribute?.initializer && ts.isJsxExpression(attribute.initializer)
    ? unwrapExpression(attribute.initializer.expression)
    : null;
  if (openMode === "direct") {
    return Boolean(
      expression && ts.isIdentifier(expression) && expression.text === stateName &&
      !hasNestedRuntimeShadow(expression, stateName, pageFunction)
    );
  }
  if (
    !expression || !ts.isCallExpression(expression) || expression.arguments.length !== 1 ||
    !ts.isIdentifier(unwrapExpression(expression.expression)) || unwrapExpression(expression.expression).text !== "Boolean"
  ) return false;
  const argument = unwrapExpression(expression.arguments[0]);
  return Boolean(
    argument && ts.isIdentifier(argument) && argument.text === stateName &&
    !hasNestedRuntimeShadow(argument, stateName, pageFunction)
  );
}

function confirmationAttributeExpression(attributes, name) {
  const attribute = jsxUniqueAttribute(attributes, name);
  if (!attribute?.initializer) return null;
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer;
  return ts.isJsxExpression(attribute.initializer) ? unwrapExpression(attribute.initializer.expression) : null;
}

function confirmationStringAttribute(attributes, name, environment) {
  const value = confirmationEvaluate(confirmationAttributeExpression(attributes, name), environment);
  return value.kind === "known" && typeof value.value === "string" ? value.value : null;
}

function confirmationBooleanAttribute(attributes, name, environment) {
  const attribute = jsxUniqueAttribute(attributes, name);
  if (!attribute) return { known: true, value: false };
  if (attribute.initializer === undefined) return { known: true, value: true };
  const value = confirmationEvaluate(confirmationAttributeExpression(attributes, name), environment);
  return value.kind === "known" && typeof value.value === "boolean"
    ? { known: true, value: value.value }
    : { known: false };
}

function confirmationObjectBooleanAttribute(attributes, objectName, propertyName, environment) {
  const attribute = jsxUniqueAttribute(attributes, objectName);
  if (!attribute) return { known: true, value: false };
  const value = confirmationEvaluate(confirmationAttributeExpression(attributes, objectName), environment);
  if (value.kind !== "object") return { known: false };
  const property = value.entries.get(propertyName);
  if (!property) return { known: true, value: false };
  return property?.kind === "known" && typeof property.value === "boolean"
    ? { known: true, value: property.value }
    : { known: false };
}

function confirmationEvaluate(node, environment, seen = new Set()) {
  const expression = unwrapExpression(node);
  if (!expression) return confirmationUnknown;
  const primitive = staticPrimitiveValue(expression);
  if (primitive.known) return confirmationKnown(primitive.value);
  if (ts.isIdentifier(expression)) {
    if (environment.has(expression.text)) return environment.get(expression.text);
    const resolved = resolveLexicalConstInitializer(expression, seen);
    if (!resolved || seen.has(resolved.declaration)) return confirmationUnknown;
    return confirmationEvaluate(resolved.initializer, environment, new Set([...seen, resolved.declaration]));
  }
  if (ts.isObjectLiteralExpression(expression)) {
    const parsed = parseStaticObject(expression, "confirmation expression");
    if (parsed.errors.length > 0) return confirmationUnknown;
    return confirmationObject(new Map([...parsed.entries].map(([key, value]) => [key, confirmationEvaluate(value, environment, seen)])));
  }
  if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
    const base = confirmationEvaluate(expression.expression, environment, seen);
    if (base.kind === "known" && (base.value === null || base.value === undefined)) return confirmationKnown(undefined);
    const key = ts.isPropertyAccessExpression(expression)
      ? expression.name.text
      : confirmationEvaluate(expression.argumentExpression, environment, seen);
    const decodedKey = typeof key === "string" ? key : key.kind === "known" ? String(key.value) : null;
    if (base.kind === "object" && decodedKey !== null) return base.entries.get(decodedKey) ?? confirmationUnknown;
    return confirmationUnknown;
  }
  if (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.ExclamationToken) {
    const truthy = confirmationTruthiness(confirmationEvaluate(expression.operand, environment, seen));
    return truthy === null ? confirmationUnknown : confirmationKnown(!truthy);
  }
  if (ts.isConditionalExpression(expression)) {
    const truthy = confirmationTruthiness(confirmationEvaluate(expression.condition, environment, seen));
    if (truthy === null) return confirmationUnknown;
    return confirmationEvaluate(truthy ? expression.whenTrue : expression.whenFalse, environment, seen);
  }
  if (ts.isBinaryExpression(expression)) {
    const operator = expression.operatorToken.kind;
    const left = confirmationEvaluate(expression.left, environment, seen);
    if (operator === ts.SyntaxKind.AmpersandAmpersandToken || operator === ts.SyntaxKind.BarBarToken) {
      const truthy = confirmationTruthiness(left);
      if (truthy === null) return confirmationUnknown;
      if (operator === ts.SyntaxKind.AmpersandAmpersandToken) {
        return truthy ? confirmationEvaluate(expression.right, environment, seen) : left;
      }
      return truthy ? left : confirmationEvaluate(expression.right, environment, seen);
    }
    if (operator === ts.SyntaxKind.QuestionQuestionToken) {
      const nullish = confirmationNullish(left);
      return nullish === null
        ? confirmationUnknown
        : nullish
          ? confirmationEvaluate(expression.right, environment, seen)
          : left;
    }
    const right = confirmationEvaluate(expression.right, environment, seen);
    if (left.kind !== "known" || right.kind !== "known") return confirmationUnknown;
    if (operator === ts.SyntaxKind.EqualsEqualsEqualsToken) return confirmationKnown(left.value === right.value);
    if (operator === ts.SyntaxKind.ExclamationEqualsEqualsToken) return confirmationKnown(left.value !== right.value);
    if (operator === ts.SyntaxKind.PlusToken) return confirmationKnown(left.value + right.value);
    return confirmationUnknown;
  }
  if (ts.isCallExpression(expression)) {
    const callee = unwrapExpression(expression.expression);
    if (callee && ts.isIdentifier(callee) && callee.text === "Boolean" && expression.arguments.length === 1) {
      const truthy = confirmationTruthiness(confirmationEvaluate(expression.arguments[0], environment, seen));
      return truthy === null ? confirmationUnknown : confirmationKnown(truthy);
    }
    return confirmationUnknown;
  }
  if (ts.isTemplateExpression(expression)) {
    let value = expression.head.text;
    for (const span of expression.templateSpans) {
      const interpolated = confirmationEvaluate(span.expression, environment, seen);
      if (interpolated.kind !== "known" || !["string", "number", "boolean"].includes(typeof interpolated.value)) return confirmationUnknown;
      value += String(interpolated.value) + span.literal.text;
    }
    return confirmationKnown(value);
  }
  return confirmationUnknown;
}

function confirmationTruthiness(value) {
  if (value.kind === "known") return Boolean(value.value);
  if (value.kind === "object" || value.kind === "non-null") return true;
  return null;
}

function confirmationNullish(value) {
  if (value.kind === "known") return value.value === null || value.value === undefined;
  if (value.kind === "object" || value.kind === "non-null") return false;
  return null;
}

function confirmationAttributeTextFragments(attributes, name, environment) {
  return confirmationTextFragments(confirmationAttributeExpression(attributes, name), environment, new Set());
}

function confirmationNodeTextFragments(node, environment) {
  if (ts.isJsxElement(node)) {
    return node.children.flatMap((child) => confirmationNodeTextFragments(child, environment));
  }
  if (ts.isJsxFragment(node)) {
    return node.children.flatMap((child) => confirmationNodeTextFragments(child, environment));
  }
  if (ts.isJsxText(node)) return node.text.trim() ? [node.text] : [];
  if (ts.isJsxExpression(node)) {
    return confirmationTextFragments(node.expression, environment, new Set());
  }
  if (ts.isJsxSelfClosingElement(node)) return [];
  return [];
}

function confirmationTextFragments(node, environment, seen) {
  const expression = unwrapExpression(node);
  if (!expression) return [];
  if (ts.isStringLiteralLike(expression)) return [expression.text];
  if (ts.isTemplateExpression(expression)) {
    const fragments = [expression.head.text, ...expression.templateSpans.map((span) => span.literal.text)];
    for (const span of expression.templateSpans) {
      const value = confirmationEvaluate(span.expression, environment, seen);
      if (value.kind === "known" && ["string", "number", "boolean"].includes(typeof value.value)) fragments.push(String(value.value));
    }
    return fragments;
  }
  if (ts.isIdentifier(expression)) {
    const value = confirmationEvaluate(expression, environment, seen);
    if (value.kind === "known" && typeof value.value === "string") return [value.value];
    const resolved = resolveLexicalConstInitializer(expression, seen);
    if (!resolved || seen.has(resolved.declaration)) return [];
    return confirmationTextFragments(resolved.initializer, environment, new Set([...seen, resolved.declaration]));
  }
  if (ts.isConditionalExpression(expression)) {
    const truthy = confirmationTruthiness(confirmationEvaluate(expression.condition, environment, seen));
    if (truthy === null) return [];
    return confirmationTextFragments(truthy ? expression.whenTrue : expression.whenFalse, environment, seen);
  }
  if (ts.isBinaryExpression(expression)) {
    if ([ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken].includes(expression.operatorToken.kind)) {
      const truthy = confirmationTruthiness(confirmationEvaluate(expression.left, environment, seen));
      if (truthy === null) return [];
      const selected = expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
        ? (truthy ? expression.right : expression.left)
        : (truthy ? expression.left : expression.right);
      return confirmationTextFragments(selected, environment, seen);
    }
    if (expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      return [
        ...confirmationTextFragments(expression.left, environment, seen),
        ...confirmationTextFragments(expression.right, environment, seen)
      ];
    }
  }
  const value = confirmationEvaluate(expression, environment, seen);
  return value.kind === "known" && typeof value.value === "string" ? [value.value] : [];
}

function confirmationHandlerClearsState(handler, stateTuple, clearValue, environment, pageFunction) {
  if (handler.parameters.some((parameter) => bindingContainsName(parameter.name, stateTuple.setter))) return false;
  let invalidReference = false;
  walkAst(handler.body, (node) => {
    if (!ts.isIdentifier(node) || node.text !== stateTuple.setter || identifierIsStaticPropertyName(node)) return;
    if (hasNestedRuntimeShadow(node, stateTuple.setter, pageFunction)) return;
    const call = directIdentifierCalleeCall(node);
    if (!call || call.questionDotToken || call.arguments.length !== 1) invalidReference = true;
  }, { skipNestedFunctions: true, rootFunction: handler });
  if (invalidReference) return false;

  if (ts.isArrowFunction(handler) && !ts.isBlock(handler.body)) {
    const expression = unwrapExpression(handler.body);
    return Boolean(
      expression && ts.isCallExpression(expression) &&
      confirmationCallTargetsSetter(expression, stateTuple.setter) &&
      confirmationPrimitiveArgumentMatches(expression.arguments[0], clearValue)
    );
  }
  if (!ts.isBlock(handler.body)) return false;
  const paths = confirmationAnalyzeStatements(handler.body.statements, [{ cleared: false, valid: true, terminated: false }], {
    setter: stateTuple.setter,
    clearValue,
    environment
  });
  return paths.length > 0 && paths.every((path) => path.valid && path.cleared);
}

function confirmationAnalyzeStatements(statements, inputPaths, context) {
  let paths = inputPaths;
  for (const statement of statements) {
    paths = paths.flatMap((path) => path.terminated ? [path] : confirmationAnalyzeStatement(statement, path, context));
  }
  return paths;
}

function confirmationAnalyzeStatement(statement, path, context) {
  if (ts.isBlock(statement)) return confirmationAnalyzeStatements(statement.statements, [path], context);
  if (ts.isExpressionStatement(statement)) {
    const expression = unwrapExpression(statement.expression);
    if (!expression || !ts.isCallExpression(expression) || !confirmationCallTargetsSetter(expression, context.setter)) return [path];
    const cleared = expression.arguments.length === 1 && confirmationPrimitiveArgumentMatches(expression.arguments[0], context.clearValue);
    return [{ ...path, cleared: path.cleared || cleared, valid: path.valid && cleared }];
  }
  if (ts.isIfStatement(statement)) {
    const truthy = confirmationTruthiness(confirmationEvaluate(statement.expression, context.environment));
    if (truthy === true) return confirmationAnalyzeStatement(statement.thenStatement, path, context);
    if (truthy === false) return statement.elseStatement
      ? confirmationAnalyzeStatement(statement.elseStatement, path, context)
      : [path];
    const thenPaths = confirmationAnalyzeStatement(statement.thenStatement, { ...path }, context);
    const elsePaths = statement.elseStatement
      ? confirmationAnalyzeStatement(statement.elseStatement, { ...path }, context)
      : [{ ...path }];
    return [...thenPaths, ...elsePaths];
  }
  if (ts.isReturnStatement(statement)) return [{ ...path, terminated: true }];
  if (ts.isThrowStatement(statement)) return [{ ...path, valid: false, terminated: true }];
  if (
    ts.isForStatement(statement) || ts.isForInStatement(statement) || ts.isForOfStatement(statement) ||
    ts.isWhileStatement(statement) || ts.isDoStatement(statement) || ts.isSwitchStatement(statement) ||
    ts.isTryStatement(statement) || ts.isWithStatement(statement) || ts.isLabeledStatement(statement)
  ) return [{ ...path, valid: false }];
  return [path];
}

function confirmationCallTargetsSetter(call, setterName) {
  const callee = unwrapExpression(call.expression);
  return Boolean(callee && ts.isIdentifier(callee) && callee.text === setterName);
}

function scenarioAstScope(sourceFile, currentScenario) {
  if (!currentScenario.output.symbol) return sourceFile;
  const functions = findTopLevelFunctions(sourceFile, currentScenario.output.symbol);
  return functions.length === 1 ? functions[0] : null;
}

function isStaticDropdownMenuItem(node, dropdownBindings) {
  let current = node.parent;
  let itemsProperty = null;
  while (current) {
    if (ts.isObjectLiteralExpression(current)) return false;
    if (
      ts.isPropertyAssignment(current) &&
      staticPropertyName(current.name) === "items" &&
      isAstDescendant(node, current.initializer)
    ) {
      itemsProperty = current;
      break;
    }
    if (ts.isJsxElement(current) || ts.isSourceFile(current)) return false;
    current = current.parent;
  }
  if (!itemsProperty || !ts.isObjectLiteralExpression(itemsProperty.parent)) return false;
  const menuExpression = itemsProperty.parent.parent;
  if (!ts.isJsxExpression(menuExpression) || !ts.isJsxAttribute(menuExpression.parent)) return false;
  const menuAttribute = menuExpression.parent;
  if (staticPropertyName(menuAttribute.name) !== "menu") return false;
  const opening = menuAttribute.parent.parent;
  return ts.isJsxOpeningElement(opening) && dropdownBindings.includes(jsxTagName(opening));
}

function staticDropdownMenuAction(node) {
  const labelProperty = node.properties.find(
    (property) => ts.isPropertyAssignment(property) && staticPropertyName(property.name) === "label"
  );
  if (!labelProperty || !ts.isPropertyAssignment(labelProperty)) return null;
  const label = staticString(unwrapExpression(labelProperty.initializer));
  if (label === null) return { error: "Dropdown menu action labels must be static strings." };
  const dangerProperty = node.properties.find(
    (property) => ts.isPropertyAssignment(property) && staticPropertyName(property.name) === "danger"
  );
  const danger = dangerProperty && ts.isPropertyAssignment(dangerProperty)
    ? staticBoolean(unwrapExpression(dangerProperty.initializer))
    : false;
  if (danger === null) return { error: `Dropdown menu action ${JSON.stringify(label)} must use a static danger value.` };
  return { label, variant: null, danger, node };
}

function collectButtonActions(sourceFile, roots, { deep = false, includeMenuActions = false } = {}) {
  const actions = [];
  const errors = [];
  const unknownActions = [];
  const buttonBindings = [
    ...[...kitImportBindings(sourceFile)].filter(([, canonical]) => canonical === "Button").map(([local]) => local),
    ...namedImportBindings(sourceFile, "antd", "Button"),
    ...(deep ? ["Button", "AntButton"] : [])
  ];
  const dropdownBindings = [
    ...namedImportBindings(sourceFile, "antd", "Dropdown"),
    ...(deep ? ["Dropdown", "AntDropdown"] : [])
  ];
  for (const local of buttonBindings) {
    if (hasRuntimeShadow(sourceFile, local)) errors.push(`Kit Button binding ${local} is shadowed by a runtime declaration.`);
  }
  const walk = deep ? walkAst : walkRenderableAst;
  for (const rootNode of roots) walk(rootNode, (current) => {
      if (includeMenuActions && ts.isObjectLiteralExpression(current) && isStaticDropdownMenuItem(current, dropdownBindings)) {
        const menuAction = staticDropdownMenuAction(current);
        if (menuAction?.error) errors.push(menuAction.error);
        else if (menuAction) actions.push(menuAction);
        return;
      }
      if (!ts.isJsxElement(current)) return;
      const tag = jsxTagName(current.openingElement);
      if (tag !== "button" && !buttonBindings.includes(tag)) return;
      const labels = resolveStaticButtonLabels(current.children);
      if (!labels || labels.length === 0) {
        unknownActions.push(current);
        return;
      }
      const variant = jsxStringAttribute(current.openingElement.attributes, "variant");
      const dangerAttribute = getJsxAttribute(current.openingElement.attributes, "danger");
      const danger = tag !== "button" && (
        Boolean(
          dangerAttribute && (
            dangerAttribute.initializer === undefined ||
            (ts.isJsxExpression(dangerAttribute.initializer) && dangerAttribute.initializer.expression?.kind === ts.SyntaxKind.TrueKeyword)
          )
        ) || variant === "danger"
      );
      for (const label of labels) actions.push({ label, variant, danger, node: current });
    });
  return { actions, errors, unknownActions, unknownLabels: unknownActions.length };
}

function resolveScenarioDynamicButtonLabels(sourceFile, button, currentScenario) {
  if (!currentScenario.output.pageId) return null;
  const expressions = button.children.filter(ts.isJsxExpression).map((child) => unwrapExpression(child.expression)).filter(Boolean);
  if (expressions.length !== 1 || button.children.some((child) => ts.isJsxText(child) && child.text.trim() !== "")) return null;
  const path = [];
  let current = expressions[0];
  while (ts.isPropertyAccessExpression(current)) {
    path.unshift(current.name.text);
    current = unwrapExpression(current.expression);
  }
  if (!ts.isIdentifier(current) || current.text !== "page" || path.length === 0) return null;
  const pageFunction = scenarioAstScope(sourceFile, currentScenario);
  const pageParameter = pageFunction?.parameters?.some((parameter) => {
    if (ts.isIdentifier(parameter.name)) return parameter.name.text === "page";
    return parameter.name.elements.some((element) => !ts.isOmittedExpression(element) && ts.isIdentifier(element.name) && element.name.text === "page");
  });
  if (
    !pageParameter || !isAstDescendant(current, pageFunction) || hasLexicalRuntimeShadow(current, "page", pageFunction) ||
    functionWritesBinding(pageFunction, "page") || functionBindingEscapes(pageFunction, "page") ||
    !sourceBindingIsStable(sourceFile, "pagePlans") || !sourceBindingIsStable(sourceFile, "pageById")
  ) return null;
  const declarations = findTopLevelVariables(sourceFile, "pagePlans");
  const plans = declarations.length === 1 ? unwrapExpression(declarations[0].declaration.initializer) : null;
  if (!plans || !ts.isArrayLiteralExpression(plans)) return null;
  for (const element of plans.elements) {
    let node = unwrapExpression(element);
    const root = parseStaticObject(node, "pagePlans dynamic action proof");
    if (root.errors.length > 0 || staticString(unwrapExpression(root.entries.get("id"))) !== currentScenario.output.pageId) continue;
    for (const segment of path) {
      const parsed = parseStaticObject(node, "pagePlans dynamic action proof");
      if (parsed.errors.length > 0) return null;
      node = unwrapExpression(parsed.entries.get(segment));
      if (!node) return null;
    }
    const value = staticString(node);
    return value === null ? null : [value];
  }
  return null;
}

function isAstDescendant(node, ancestor) {
  let current = node;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

function resolveStaticButtonLabels(children) {
  let combinations = [""];
  for (const child of children) {
    let options;
    if (ts.isJsxText(child)) options = [child.text];
    else if (ts.isJsxElement(child)) options = resolveStaticButtonLabels(child.children);
    else if (ts.isJsxExpression(child)) options = resolveStaticLabelExpression(child.expression);
    else return null;
    if (!options) return null;
    combinations = combinations.flatMap((prefix) => options.map((option) => `${prefix}${option}`));
  }
  return [...new Set(combinations.map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean))];
}

function resolveStaticLabelExpression(expression) {
  const node = unwrapExpression(expression);
  if (!node) return [""];
  if (ts.isStringLiteralLike(node)) return [node.text];
  if (ts.isConditionalExpression(node)) {
    const constant = staticBoolean(node.condition);
    if (constant === true) return resolveStaticLabelExpression(node.whenTrue);
    if (constant === false) return resolveStaticLabelExpression(node.whenFalse);
    return null;
  }
  return null;
}

function checkActionContracts(findings, actions, config, scope) {
  const labels = actions.map((action) => action.label);
  for (const label of config.required ?? []) {
    if (!labels.includes(label)) findings.push({ rule: "action-condition", severity: "error", message: `${scope} is missing required action "${label}".` });
  }
  for (const label of config.forbidden ?? []) {
    if (labels.includes(label)) findings.push({ rule: "action-condition", severity: "error", message: `${scope} contains forbidden action "${label}".` });
  }
  for (const label of config.danger ?? []) {
    const matching = actions.filter((action) => action.label === label);
    if (matching.length !== 1 || !matching[0].danger) {
      findings.push({ rule: "action-danger", severity: "error", message: `${scope} must contain exactly one danger Button labeled "${label}".` });
    }
  }
}

function parseScenarioExpression(text) {
  const sourceFile = ts.createSourceFile("scenario-condition.ts", `const __condition = ${text};`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if ((sourceFile.parseDiagnostics ?? []).length > 0) return null;
  const declaration = sourceFile.statements[0]?.declarationList?.declarations?.[0];
  return declaration?.initializer ?? null;
}

const astPrinter = ts.createPrinter({ removeComments: true });

function printExpression(node) {
  return astPrinter.printNode(ts.EmitHint.Expression, unwrapExpression(node), node.getSourceFile()).replace(/\s+/g, " ").trim();
}

function checkDataAssertions(sourceFile, currentScenario) {
  const findings = [];
  for (const assertion of currentScenario.dataAssertions ?? []) {
    const scope = `${assertion.array}.${assertion.field}`;
    const declarations = findTopLevelVariables(sourceFile, assertion.array);
    if (declarations.length !== 1 || !(declarations[0].statement.declarationList.flags & ts.NodeFlags.Const)) {
      findings.push({ rule: "data-assertion", severity: "error", message: `${scope}: expected exactly one top-level const declaration; found ${declarations.length}.` });
      continue;
    }
    const array = unwrapExpression(declarations[0].declaration.initializer);
    if (!array || !ts.isArrayLiteralExpression(array) || array.elements.length === 0) {
      findings.push({ rule: "data-assertion", severity: "error", message: `${scope}: representative data must be a non-empty array literal.` });
      continue;
    }
    const forbidden = new Set(assertion.forbiddenValues);
    for (const [index, element] of array.elements.entries()) {
      const object = parseStaticObject(unwrapExpression(element), `${assertion.array}[${index}]`);
      for (const message of object.errors) findings.push({ rule: "data-assertion", severity: "error", message: `${scope}: ${message}.` });
      const value = staticString(object.entries.get(assertion.field));
      if (value === null) {
        findings.push({ rule: "data-assertion", severity: "error", message: `${scope} row ${index}: field must appear exactly once with a static string value.` });
      } else if (forbidden.has(value)) {
        findings.push({ rule: "data-assertion", severity: "error", message: `${scope} contains forbidden representative value at row ${index}: ${JSON.stringify(value)}.` });
      }
    }
  }
  return findings;
}

function sanitizeDiagnostic(value) {
  const roots = [...new Set([realProjectRoot, projectRoot, realPackageRoot, packageRoot, invocationRoot])]
    .flatMap((path) => [path, path.replaceAll("\\", "/")])
    .sort((left, right) => right.length - left.length);
  const normalized = roots.reduce(
    (diagnostic, path) => diagnostic.replace(new RegExp(escapeRegExp(path), "gi"), "<workspace>"),
    String(value)
  )
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer <redacted>")
    .replace(/\b(token|secret|password|authorization|api[_-]?key)\s*[:=]\s*([^\s,;]+)/gi, "$1=<redacted>")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  return normalized.length > 2000 ? `${normalized.slice(0, 2000)}… <truncated>` : normalized;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

if (isMainThread) {
  const workerResult = await runBoundedWorker({
    workerUrl: new URL(import.meta.url),
    workerData: { cliArgs: process.argv.slice(2) }
  });
  if (workerResult.kind === "timeout") {
    console.error(`harness failed: worker timed out after ${DEFAULT_WORKER_TIMEOUT_MS} ms`);
  } else if (workerResult.kind === "memory") {
    console.error(
      `harness failed: worker exceeded ${DEFAULT_WORKER_RESOURCE_LIMITS.maxOldGenerationSizeMb} MiB old-generation limit`
    );
  } else if (workerResult.kind === "error") {
    console.error(`harness failed: worker error: ${sanitizeDiagnostic(workerResult.message)}`);
  }
  process.exitCode = workerResult.exitCode;
} else {
  run(Array.isArray(workerData?.cliArgs) ? workerData.cliArgs : []);
}
