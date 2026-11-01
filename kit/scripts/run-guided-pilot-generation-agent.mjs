import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const kitRoot = resolve(scriptDir, "..");
const schemaPath = resolve(kitRoot, "schema/guided-pilot-generation-evidence.schema.json");
const immutableFiles = [
  "AGENTS.md",
  "artifact-identity.json",
  "business-context.json",
  "generation-request.json",
  "project-description.json",
  "sample-pack.json",
  "flow-contract.json",
  "guided-prd.md",
  "public/artifact-meta.json",
  "consumer-package-receipt.json"
];
const requiredOutputPaths = ["package.json", "index.html", "src", "public/artifact-meta.json"];
const runIdPattern = /^guided-pilot-[a-z0-9][a-z0-9-]*$/;
const artifactIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const supportedReasoningEfforts = new Set(["low", "medium", "high", "xhigh", "max"]);

export async function runGuidedPilotGenerationAgent({
  workspace,
  evidenceDir,
  runId,
  artifactId,
  provider = "claude",
  model = provider === "claude" ? "claude-sonnet-5" : "gpt-5.6-terra",
  reasoningEffort = "high",
  timeoutMs = 1_200_000,
  commandOverride = null
}) {
  const absoluteWorkspace = requireDirectory(workspace, "workspace");
  validateInvocationOptions({ runId, artifactId, provider, model, reasoningEffort, timeoutMs });
  const absoluteEvidenceCandidate = requirePath(evidenceDir, "evidenceDir");
  assertNoPathOverlap(absoluteWorkspace, absoluteEvidenceCandidate, "workspace and evidenceDir");
  const absoluteEvidence = reserveEmptyDirectory(absoluteEvidenceCandidate, "evidenceDir");
  const workspaceBinding = verifyWorkspaceBoundary(absoluteWorkspace, { runId, artifactId });

  const invocation = commandOverride ?? generationInvocation({ provider, workspace: absoluteWorkspace, model, reasoningEffort });
  validateCommand(invocation);
  const execution = executionEvidence({ provider, workspace: absoluteWorkspace, commandOverride });
  const prompt = buildGuidedPilotGenerationPrompt();
  const promptPath = resolve(absoluteEvidence, "prompt.md");
  writeFileSync(promptPath, prompt, { encoding: "utf8", flag: "wx" });
  const immutableBeforeSha256 = immutableTreeSha256(absoluteWorkspace, { strict: true });
  const startedAtUtc = new Date().toISOString();
  const result = await runCapturedProcess({
    executable: invocation.executable,
    args: invocation.args,
    cwd: absoluteWorkspace,
    stdin: prompt,
    timeoutMs: Number(timeoutMs)
  });
  const stoppedAtUtc = new Date().toISOString();
  const stdoutPath = resolve(absoluteEvidence, "stdout.log");
  const stderrPath = resolve(absoluteEvidence, "stderr.log");
  writeFileSync(stdoutPath, result.stdout, { flag: "wx" });
  writeFileSync(stderrPath, result.stderr, { flag: "wx" });

  const immutableAfterSha256 = immutableTreeSha256(absoluteWorkspace, { strict: false });
  const immutableFailure =
    immutableBeforeSha256 === immutableAfterSha256
      ? null
      : "generation agent changed one or more frozen workspace inputs";
  const requiredOutputVerification = verifyRequiredOutputs(
    absoluteWorkspace,
    workspaceBinding.requiredOutputs
  );
  const failureRecord = selectFailure({ result, immutableFailure, requiredOutputVerification });
  const status = failureRecord === null ? "passed" : "failed";
  const evidence = {
    $schema: "https://ai-readable.local/schema/guided-pilot-generation-evidence.schema.json",
    version: "1.1.0",
    stage: "guided-pilot-generation",
    runId,
    artifactId,
    arm: "consumer",
    outputMode: "kit-consumer",
    qualifying: false,
    scoring: false,
    consumerPackage: workspaceBinding.consumerPackage,
    provider,
    model,
    reasoningEffort,
    command: invocation.executable,
    args: invocation.args,
    cwd: absoluteWorkspace.replaceAll("\\", "/"),
    execution,
    runner: fileReceipt(kitRoot, scriptPath),
    prompt: fileReceipt(absoluteEvidence, promptPath),
    startedAtUtc,
    stoppedAtUtc,
    exitCode: result.exitCode,
    status,
    failure: failureRecord?.message ?? null,
    failureCategory: failureRecord?.category ?? null,
    requiredOutputVerification,
    timedOut: result.timedOut,
    terminationSignal: result.signal,
    spawnError: result.spawnError,
    stdout: fileReceipt(absoluteEvidence, stdoutPath),
    stderr: fileReceipt(absoluteEvidence, stderrPath),
    immutableBeforeSha256,
    immutableAfterSha256
  };
  validateEvidence(evidence);
  const evidencePath = resolve(absoluteEvidence, "command.json");
  writeFileSync(evidencePath, canonicalJsonBytes(evidence), { flag: "wx" });
  return { evidence, evidencePath };
}

export function buildGuidedPilotGenerationPrompt() {
  return `Implement the complete local frontend described by this guided-pilot workspace.

This is one authorized non-qualifying, non-scoring guided pilot using a consumed historical PRD. Treat the supplied historical PRD as the product source. Do not create synthetic profiles, cycles, scoring claims, or replacement evidence.

Read AGENTS.md first, then generation-request.json, guided-prd.md, project-description.json, sample-pack.json, business-context.json, flow-contract.json, and artifact-identity.json. After that, verify consumer-package-receipt.json and the supplied vendor package. Stay inside this workspace.

Requirements:

1. Build a React 19 + TypeScript + Vite product that implements every relevant historical-PRD requirement, supplied project description, sample object, and flow-contract behavior.
2. Use only the vendored @ai-readable/kit package as the UI foundation. Install the exact package supplied in vendor/, use its public named exports, AIReadableProvider, and styles.css, and do not import antd, @ant-design/icons, or another UI library.
3. Add package scripts named typecheck, build, and preview. The preview script must serve the Vite production dist. Run typecheck and build before finishing, then close every server you started.
4. Preserve every frozen input byte-for-byte: AGENTS.md, artifact-identity.json, business-context.json, generation-request.json, project-description.json, sample-pack.json, flow-contract.json, guided-prd.md, public/artifact-meta.json, consumer-package-receipt.json, and vendor/.
5. Treat flow-contract.json as the sole owner of product routes and data-testid values. Do not invent routes or test IDs beyond that contract. Keep public/artifact-meta.json available at /artifact-meta.json.
6. Do not create product-owned tests, specs, assertion scripts, Playwright, Vitest, Jest, or flow-smoke commands. The guided-pilot harness owns flow assertions.
7. Use Simplified Chinese product copy and keep every flow-contract route usable.

All task facts are local. Do not browse the web and do not read any parent or sibling directory.
`;
}

function validateInvocationOptions({ runId, artifactId, provider, model, reasoningEffort, timeoutMs }) {
  if (typeof runId !== "string" || !runIdPattern.test(runId)) {
    throw new Error("runId must use the guided-pilot lowercase kebab-case format");
  }
  if (typeof artifactId !== "string" || !artifactIdPattern.test(artifactId)) {
    throw new Error("artifactId must be a UUID v4");
  }
  if (!["claude", "codex"].includes(provider)) throw new Error("provider must be claude or codex");
  if (typeof model !== "string" || model.trim() === "") throw new Error("model is required");
  if (!supportedReasoningEfforts.has(reasoningEffort)) throw new Error("reasoningEffort is unsupported");
  const numericTimeout = Number(timeoutMs);
  if (!Number.isInteger(numericTimeout) || numericTimeout < 1) throw new Error("timeoutMs must be a positive integer");
}

function generationInvocation({ provider, workspace, model, reasoningEffort }) {
  if (provider === "claude") return claudeInvocation({ model, reasoningEffort });
  return codexInvocation({ workspace, model, reasoningEffort });
}

function codexInvocation({ workspace, model, reasoningEffort }) {
  const codexArgs = [
    "exec",
    "--ephemeral",
    "--skip-git-repo-check",
    "--ignore-user-config",
    "--json",
    "-m",
    model,
    "-c",
    `model_reasoning_effort=\"${reasoningEffort}\"`,
    "-c",
    "approval_policy=\"never\"",
    "--dangerously-bypass-approvals-and-sandbox",
    "-C",
    workspace,
    "-"
  ];
  if (process.platform === "win32") {
    return { executable: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", "codex.cmd", ...codexArgs] };
  }
  return { executable: "codex", args: codexArgs };
}

function claudeInvocation({ model, reasoningEffort }) {
  return {
    executable: process.platform === "win32" ? "claude.exe" : "claude",
    args: [
      "-p",
      "--safe-mode",
      "--no-session-persistence",
      "--disable-slash-commands",
      "--no-chrome",
      "--model",
      model,
      "--effort",
      reasoningEffort,
      "--permission-mode",
      "acceptEdits",
      "--tools",
      "Read,Write,Edit,Bash,Glob,Grep",
      "--allowedTools",
      "Read,Write,Edit,Bash,Glob,Grep",
      "--input-format",
      "text",
      "--output-format",
      "stream-json",
      "--verbose"
    ]
  };
}

async function runCapturedProcess({ executable, args, cwd, stdin, timeoutMs }) {
  const stdout = [];
  const stderr = [];
  let spawnError = null;
  let settled = false;
  let child;
  const completion = new Promise((done) => {
    const settle = (exit) => {
      if (settled) return;
      settled = true;
      done(exit);
    };
    try {
      child = spawn(executable, args, { cwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    } catch (error) {
      spawnError = errorMessage(error);
      settle({ code: null, signal: null });
      return;
    }
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.stdin.on("error", () => {});
    child.once("error", (error) => {
      spawnError = errorMessage(error);
      settle({ code: null, signal: null });
    });
    child.once("close", (code, signal) => settle({ code, signal: signal ?? null }));
    child.stdin.end(stdin);
  });

  let timedOut = false;
  let exit = await waitWithTimeout(completion, timeoutMs);
  if (!exit && child && !settled) {
    timedOut = true;
    child.kill("SIGTERM");
    exit = await waitWithTimeout(completion, 5_000);
    if (!exit && !settled) {
      child.kill("SIGKILL");
      exit = await waitWithTimeout(completion, 5_000);
    }
  }
  return {
    stdout: Buffer.concat(stdout),
    stderr: Buffer.concat(stderr),
    exitCode: exit?.code ?? null,
    signal: exit?.signal ?? null,
    timedOut,
    spawnError
  };
}

function selectFailure({ result, immutableFailure, requiredOutputVerification }) {
  if (immutableFailure !== null) {
    return { category: "immutable-input-drift", message: immutableFailure };
  }
  if (result.spawnError !== null) {
    return { category: "spawn-error", message: result.spawnError };
  }
  if (result.timedOut) {
    return { category: "command-timeout", message: "generation command timed out" };
  }
  if (result.exitCode !== 0 || result.signal !== null) {
    const message =
      result.signal === null
        ? `generation command exited ${result.exitCode ?? "without an exit code"}`
        : `generation command ended with signal ${result.signal}`;
    return { category: "command-exit-nonzero", message };
  }
  if (requiredOutputVerification.missingOutputs.length > 0) {
    return {
      category: "required-output-missing",
      message: `generation command completed without required outputs: ${requiredOutputVerification.missingOutputs.join(", ")}`
    };
  }
  return null;
}

function executionEvidence({ provider, workspace, commandOverride }) {
  const workspacePath = workspace.replaceAll("\\", "/");
  if (commandOverride !== null) {
    return { provider, sandboxMode: "command-override", workspace: workspacePath };
  }
  if (provider === "codex") {
    return {
      provider,
      sandboxMode: "codex-dangerously-bypass-approvals-and-sandbox",
      workspace: workspacePath
    };
  }
  return { provider, sandboxMode: "claude-safe-mode", workspace: workspacePath };
}

function verifyWorkspaceBoundary(workspace, { runId, artifactId }) {
  for (const name of immutableFiles) requireFile(resolve(workspace, name), `workspace omits frozen input ${name}`);
  const identity = readJson(resolve(workspace, "artifact-identity.json"));
  assertEqual(identity.runId, runId, "artifact identity runId");
  assertEqual(identity.artifactId, artifactId, "artifact identity artifactId");
  assertEqual(identity.arm, "consumer", "artifact identity arm");

  const businessContext = readJson(resolve(workspace, "business-context.json"));
  assertEqual(
    businessContext.frontendFoundation?.outputMode,
    "kit-consumer",
    "workspace frontendFoundation.outputMode"
  );

  const request = readJson(resolve(workspace, "generation-request.json"));
  assertEqual(request.qualifying, false, "generation-request qualifying");
  assertEqual(request.scoring, false, "generation-request scoring");
  const requiredOutputs = requireRequiredOutputs(request.requiredOutputs);
  const packageBinding = requirePackageBinding(request.consumerPackage, "generation-request consumerPackage");
  assertEqual(packageBinding.name, "@ai-readable/kit", "generation-request consumer package name");
  const vendorPath = resolve(workspace, vendorFileName(packageBinding.tarball.fileName));
  verifyVendorFiles(workspace);
  const tarball = fileReceipt(workspace, vendorPath);
  assertReceiptMatches(tarball, packageBinding.tarball, "vendored consumer package");
  const receiptPath = resolve(workspace, "consumer-package-receipt.json");
  const receipt = fileReceipt(workspace, receiptPath);
  assertReceiptMatches(receipt, packageBinding.receipt, "consumer package receipt");

  const packageReceipt = readJson(receiptPath);
  if (packageReceipt.package?.name !== undefined) {
    assertEqual(packageReceipt.package.name, "@ai-readable/kit", "consumer package receipt package name");
  }
  const packageDeclarations = [packageReceipt.package, packageReceipt.frozenPack].filter(
    (value) => value && typeof value.sha256 === "string"
  );
  if (packageDeclarations.length === 0) {
    throw new Error("consumer package receipt omits a package SHA-256 declaration");
  }
  for (const declaration of packageDeclarations) {
    assertEqual(declaration.sha256, packageBinding.tarball.sha256, "consumer package receipt package SHA-256");
    if (declaration.bytes !== undefined) {
      assertEqual(declaration.bytes, packageBinding.tarball.bytes, "consumer package receipt package bytes");
    }
  }
  return {
    requiredOutputs,
    consumerPackage: {
      name: packageBinding.name,
      version: packageBinding.version,
      tarball,
      receipt
    }
  };
}

function requireRequiredOutputs(value) {
  if (!Array.isArray(value)) throw new Error("generation-request.requiredOutputs is required");
  const matches =
    value.length === requiredOutputPaths.length &&
    value.every((output, index) => output === requiredOutputPaths[index]);
  if (!matches) {
    throw new Error(
      `generation-request.requiredOutputs must equal ${JSON.stringify(requiredOutputPaths)}`
    );
  }
  return [...requiredOutputPaths];
}

function verifyRequiredOutputs(workspace, requiredOutputs) {
  const missingOutputs = [];
  for (const output of requiredOutputs) {
    const path = resolve(workspace, output);
    if (!isInside(workspace, path)) throw new Error(`required output escaped workspace: ${output}`);
    const expectedKind = output === "src" ? "directory" : "file";
    if (describePath(path).kind !== expectedKind) missingOutputs.push(output);
  }
  return { requiredOutputs: [...requiredOutputs], missingOutputs };
}

function requirePackageBinding(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is required`);
  if (typeof value.name !== "string" || value.name.trim() === "") {
    throw new Error(`${label}.name is required`);
  }
  if (typeof value.version !== "string" || value.version.trim() === "") {
    throw new Error(`${label}.version is required`);
  }
  const tarball = requireFileBinding(value.tarball, `${label}.tarball`);
  if (typeof value.tarball.fileName !== "string" || value.tarball.fileName.trim() === "") {
    throw new Error(`${label}.tarball.fileName is required`);
  }
  if (value.tarball.fileName.includes("/") || value.tarball.fileName.includes("\\")) {
    throw new Error(`${label}.tarball.fileName must not contain a path separator`);
  }
  const fileName = portableBasename(value.tarball.fileName);
  assertEqual(portableBasename(tarball.path), fileName, `${label}.tarball path and fileName`);
  return {
    name: value.name,
    version: value.version,
    tarball: { ...tarball, fileName },
    receipt: requireFileBinding(value.receipt, `${label}.receipt`)
  };
}

function requireFileBinding(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is required`);
  if (typeof value.path !== "string" || value.path.trim() === "") throw new Error(`${label}.path is required`);
  if (!Number.isInteger(value.bytes) || value.bytes < 1) throw new Error(`${label}.bytes must be a positive integer`);
  if (typeof value.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(value.sha256)) {
    throw new Error(`${label}.sha256 must be a SHA-256 digest`);
  }
  return { path: normalizePortablePath(value.path, `${label}.path`), bytes: value.bytes, sha256: value.sha256 };
}

function verifyVendorFiles(workspace) {
  const vendor = resolve(workspace, "vendor");
  if (!existsSync(vendor) || !lstatSync(vendor).isDirectory()) throw new Error("workspace omits vendor directory");
  const entries = readdirSync(vendor, { withFileTypes: true });
  if (entries.length === 0) throw new Error("vendor must contain the requested @ai-readable/kit package");
  for (const entry of entries) {
    if (!entry.isFile()) throw new Error(`vendor contains a non-file entry: ${entry.name}`);
  }
}

function vendorFileName(fileName) {
  return `vendor/${portableBasename(fileName)}`;
}

function portableBasename(path) {
  const name = normalizePortablePath(path, "generation-request path").split("/").at(-1);
  if (!name || name === "." || name === "..") throw new Error("generation-request path has no file name");
  return name;
}

function normalizePortablePath(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} is required`);
  const portable = value.replaceAll("\\", "/");
  if (portable.startsWith("/") || portable.includes(":")) throw new Error(`${label} must be relative`);
  const parts = portable.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`${label} contains an unsafe path segment`);
  }
  return portable;
}

function immutableTreeSha256(workspace, { strict }) {
  const records = immutableFiles.map((portable) => immutableFileRecord(resolve(workspace, portable), portable, { strict }));
  const vendor = resolve(workspace, "vendor");
  const vendorState = describePath(vendor);
  if (vendorState.kind !== "directory") {
    if (strict) throw new Error("workspace omits vendor directory");
    records.push(`vendor\0${vendorState.kind}`);
  } else {
    const entries = readdirSync(vendor, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    if (entries.length === 0) {
      if (strict) throw new Error("vendor must contain the requested @ai-readable/kit package");
      records.push("vendor\0empty");
    }
    for (const entry of entries) {
      records.push(immutableFileRecord(resolve(vendor, entry.name), `vendor/${entry.name}`, { strict }));
    }
  }
  return sha256(Buffer.from(records.sort().join("\n"), "utf8"));
}

function immutableFileRecord(path, portable, { strict }) {
  const state = describePath(path);
  if (state.kind !== "file") {
    if (strict) throw new Error(`frozen input is not a file: ${portable}`);
    return `${portable}\0${state.kind}`;
  }
  return `${portable}\0${state.bytes.length}\0${sha256(state.bytes)}`;
}

function describePath(path) {
  try {
    const stats = lstatSync(path);
    if (stats.isSymbolicLink()) return { kind: "symbolic-link" };
    if (stats.isDirectory()) return { kind: "directory" };
    if (!stats.isFile()) return { kind: "non-file" };
    return { kind: "file", bytes: readFileSync(path) };
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return { kind: "missing" };
    return { kind: `unreadable:${errorMessage(error)}` };
  }
}

function requireFile(path, message) {
  const state = describePath(path);
  if (state.kind !== "file") throw new Error(message);
}

function assertReceiptMatches(actual, expected, label) {
  assertEqual(actual.bytes, expected.bytes, `${label} bytes`);
  assertEqual(actual.sha256, expected.sha256, `${label} SHA-256`);
}

function validateCommand(invocation) {
  if (!invocation || typeof invocation !== "object" || Array.isArray(invocation)) {
    throw new Error("generation command is required");
  }
  if (typeof invocation.executable !== "string" || invocation.executable.trim() === "") {
    throw new Error("generation command executable is required");
  }
  if (!Array.isArray(invocation.args) || invocation.args.some((value) => typeof value !== "string")) {
    throw new Error("generation command args must be a string array");
  }
}

function validateEvidence(evidence) {
  const schema = readJson(schemaPath);
  const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
  const validate = ajv.compile(schema);
  if (!validate(evidence)) throw new Error(`guided pilot generation evidence schema failed: ${ajv.errorsText(validate.errors)}`);
}

function reserveEmptyDirectory(value, label) {
  const path = requirePath(value, label);
  if (existsSync(path)) {
    if (!lstatSync(path).isDirectory()) throw new Error(`${label} is not a directory: ${path}`);
    if (readdirSync(path).length > 0) throw new Error(`${label} must be empty: ${path}`);
  } else {
    mkdirSync(path, { recursive: true });
  }
  return path;
}

function requireDirectory(value, label) {
  const path = requirePath(value, label);
  if (!existsSync(path) || !lstatSync(path).isDirectory()) throw new Error(`${label} does not exist: ${path}`);
  return path;
}

function requirePath(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} is required`);
  return resolve(value);
}

function assertNoPathOverlap(left, right, label) {
  if (isInside(left, right) || isInside(right, left) || resolve(left).toLowerCase() === resolve(right).toLowerCase()) {
    throw new Error(`${label} must not overlap`);
  }
}

function isInside(parent, child) {
  const value = relative(resolve(parent), resolve(child));
  return value !== "" && value !== ".." && !value.startsWith("..\\") && !value.startsWith("../");
}

function fileReceipt(root, path) {
  const absoluteRoot = resolve(root);
  const absolutePath = resolve(path);
  const portable = relative(absoluteRoot, absolutePath).replaceAll("\\", "/");
  if (!portable || portable === ".." || portable.startsWith("../")) {
    throw new Error(`receipt path escaped its root: ${absolutePath}`);
  }
  const bytes = readFileSync(absolutePath);
  return { path: portable, bytes: bytes.length, sha256: sha256(bytes) };
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(sortValue(value), null, 2)}\n`, "utf8");
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function waitWithTimeout(promise, timeoutMs) {
  let timer = null;
  const timeout = new Promise((done) => {
    timer = setTimeout(() => done(null), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

function parseArgs(argv) {
  const allowed = new Set(["workspace", "evidence", "run-id", "artifact-id", "provider", "model", "reasoning", "timeout-ms"]);
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!name.startsWith("--")) throw new Error(`unexpected argument: ${name}`);
    const key = name.slice(2);
    if (!allowed.has(key)) throw new Error(`unsupported argument: ${name}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${name}`);
    if (options[key] !== undefined) throw new Error(`duplicate argument: ${name}`);
    options[key] = value;
    index += 1;
  }
  return options;
}

async function runCli() {
  const options = parseArgs(process.argv.slice(2));
  const provider = options.provider ?? "claude";
  const result = await runGuidedPilotGenerationAgent({
    workspace: options.workspace,
    evidenceDir: options.evidence,
    runId: options["run-id"],
    artifactId: options["artifact-id"],
    provider,
    model: options.model ?? (provider === "claude" ? "claude-sonnet-5" : "gpt-5.6-terra"),
    reasoningEffort: options.reasoning ?? "high",
    timeoutMs: options["timeout-ms"] ? Number(options["timeout-ms"]) : 1_200_000
  });
  console.log(
    `run-guided-pilot-generation-agent ${result.evidence.status}: runId=${result.evidence.runId}; artifactId=${result.evidence.artifactId}`
  );
  if (result.evidence.status !== "passed") process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  try {
    await runCli();
  } catch (error) {
    console.error(`run-guided-pilot-generation-agent failed: ${errorMessage(error)}`);
    process.exitCode = 1;
  }
}

export const guidedPilotGenerationAgent = {
  immutableFiles,
  requiredOutputPaths,
  schemaPath,
  scriptPath,
  codexInvocation
};
