import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const kitRoot = resolve(scriptDir, "..");
const schemaPath = resolve(kitRoot, "schema/synthetic-generation-command-evidence.schema.json");
const immutableFiles = [
  "AGENTS.md",
  "artifact-identity.json",
  "business-context.json",
  "generation-request.json",
  "manifest.json",
  "project-description.json",
  "public/artifact-meta.json",
  "sample-pack.json",
  "semantic-contract.json",
  "synthetic-prd.md"
];

export async function runSyntheticGenerationAgent({
  workspace,
  evidenceDir,
  profileId,
  arm,
  cycle,
  provider = "codex",
  model = "gpt-5.6-terra",
  reasoningEffort = "medium",
  timeoutMs = 1_200_000,
  commandOverride = null
}) {
  const absoluteWorkspace = requireDirectory(workspace, "workspace");
  const absoluteEvidence = reserveEmptyDirectory(evidenceDir, "evidenceDir");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(profileId ?? "")) throw new Error("profileId is invalid");
  if (!["consumer", "control"].includes(arm)) throw new Error("arm must be consumer or control");
  if (!["codex", "claude"].includes(provider)) throw new Error("provider must be codex or claude");
  const cycleNumber = Number(cycle);
  if (!Number.isInteger(cycleNumber) || cycleNumber < 1 || cycleNumber > 3) {
    throw new Error("cycle must be an integer from 1 through 3");
  }
  if (!["low", "medium", "high", "xhigh", "max"].includes(reasoningEffort)) {
    throw new Error("reasoningEffort is unsupported");
  }
  assertNoPathOverlap(absoluteWorkspace, absoluteEvidence, "workspace and evidenceDir");
  verifyWorkspaceArmBoundary(absoluteWorkspace, arm);

  const prompt = buildGenerationPrompt({ arm });
  const promptPath = resolve(absoluteEvidence, "prompt.md");
  writeFileSync(promptPath, prompt, { encoding: "utf8", flag: "wx" });
  const before = immutableTreeSha256(absoluteWorkspace, arm);
  const invocation =
    commandOverride ?? generationInvocation({ provider, workspace: absoluteWorkspace, model, reasoningEffort });
  const startedAtUtc = new Date().toISOString();
  const result = await runCapturedProcess({
    executable: invocation.executable,
    args: invocation.args,
    cwd: absoluteWorkspace,
    stdin: prompt,
    timeoutMs
  });
  const stoppedAtUtc = new Date().toISOString();
  const stdoutPath = resolve(absoluteEvidence, "stdout.log");
  const stderrPath = resolve(absoluteEvidence, "stderr.log");
  writeFileSync(stdoutPath, result.stdout, { flag: "wx" });
  writeFileSync(stderrPath, result.stderr, { flag: "wx" });

  let after = before;
  let immutableFailure = null;
  try {
    after = immutableTreeSha256(absoluteWorkspace, arm);
    if (after !== before) immutableFailure = "generation agent changed one or more frozen workspace inputs";
  } catch (error) {
    immutableFailure = error instanceof Error ? error.message : String(error);
  }
  const failure =
    result.spawnError ??
    (result.timedOut ? "generation command timed out" : null) ??
    (result.exitCode === 0 ? null : `generation command exited ${result.exitCode ?? "without an exit code"}`) ??
    immutableFailure;
  const status = failure === null && immutableFailure === null ? "passed" : "failed";
  const evidence = {
    $schema: "../../../../../../schema/synthetic-generation-command-evidence.schema.json",
    version: "1.0.0",
    stage: "generation",
    profileId,
    arm,
    cycle: cycleNumber,
    provider,
    model,
    reasoningEffort,
    command: invocation.executable,
    args: invocation.args,
    cwd: absoluteWorkspace.replaceAll("\\", "/"),
    prompt: fileReceipt(absoluteEvidence, promptPath),
    startedAtUtc,
    stoppedAtUtc,
    exitCode: result.exitCode,
    status,
    failure: immutableFailure ?? failure,
    timedOut: result.timedOut,
    terminationSignal: result.signal,
    spawnError: result.spawnError,
    stdout: fileReceipt(absoluteEvidence, stdoutPath),
    stderr: fileReceipt(absoluteEvidence, stderrPath),
    immutableBeforeSha256: before,
    immutableAfterSha256: after
  };
  validateEvidence(evidence);
  const evidencePath = resolve(absoluteEvidence, "command.json");
  writeFileSync(evidencePath, canonicalJsonBytes(evidence), { flag: "wx" });
  return { evidence, evidencePath };
}

export function buildGenerationPrompt({ arm }) {
  const foundation =
    arm === "consumer"
      ? `Install the exact tarball in vendor/ as @ai-readable/kit. Use its public named exports, AIReadableProvider, and styles.css as the sole UI foundation. Follow the package docs and manifests after installation. Direct imports from antd or @ant-design/icons are prohibited by business-context.json.`
      : `Use Ant Design 6.5.0 and @ant-design/icons 6.3.2 through public named exports. @ai-readable/kit is unavailable and prohibited by business-context.json.`;
  return `Implement the complete local frontend described by this workspace.

Read AGENTS.md first, then generation-request.json, synthetic-prd.md, project-description.json, sample-pack.json, business-context.json, semantic-contract.json, and artifact-identity.json. Stay inside this workspace.

${foundation}

Requirements:

1. Build a React 19 + TypeScript + Vite product that covers every page, entity, field group, flow step, state, side effect, and recovery named by the supplied inputs.
2. Add package scripts named typecheck, build, and preview. The preview command must serve the production dist with Vite.
3. Keep public/artifact-meta.json byte-for-byte unchanged so Vite serves it at /artifact-meta.json.
4. Implement every behavior in semantic-contract.json and expose each listed data-testid exactly once whenever its state is expected. Use the exact option testids for select actions.
5. Preserve all frozen input files. Do not create product-owned tests, specs, assertion scripts, Playwright, Vitest, Jest, or flow-smoke commands.
6. Use Simplified Chinese product copy. Keep navigation and routes usable at every contract route.
7. Install dependencies locally, run typecheck and build, and fix failures before finishing. Do not leave a persistent server running.

All task facts are local. Do not browse the web and do not read any parent or sibling directory.
`;
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
    "-s",
    "workspace-write",
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
    try {
      child = spawn(executable, args, { cwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    } catch (error) {
      spawnError = error instanceof Error ? error.message : String(error);
      settled = true;
      done({ code: null, signal: null });
      return;
    }
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.once("error", (error) => {
      spawnError = error instanceof Error ? error.message : String(error);
    });
    child.once("close", (code, signal) => {
      settled = true;
      done({ code, signal: signal ?? null });
    });
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

function verifyWorkspaceArmBoundary(workspace, arm) {
  for (const name of immutableFiles) {
    const path = resolve(workspace, name);
    if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`workspace omits frozen input ${name}`);
  }
  const context = readJson(resolve(workspace, "business-context.json"));
  const expectedMode = arm === "consumer" ? "kit-consumer" : "library-native";
  if (context.frontendFoundation?.outputMode !== expectedMode) {
    throw new Error(`workspace frontendFoundation.outputMode must be ${expectedMode}`);
  }
  if (arm === "consumer") {
    if (!existsSync(resolve(workspace, "consumer-package-receipt.json"))) {
      throw new Error("consumer workspace omits package receipt");
    }
    if (!existsSync(resolve(workspace, "vendor"))) throw new Error("consumer workspace omits vendor package");
  } else if (existsSync(resolve(workspace, "consumer-package-receipt.json")) || existsSync(resolve(workspace, "vendor"))) {
    throw new Error("control workspace contains consumer-only package inputs");
  }
}

function immutableTreeSha256(workspace, arm) {
  verifyWorkspaceArmBoundary(workspace, arm);
  const paths = [...immutableFiles];
  if (arm === "consumer") {
    paths.push("consumer-package-receipt.json");
    for (const entry of readdirSync(resolve(workspace, "vendor"), { withFileTypes: true })) {
      if (!entry.isFile()) throw new Error(`vendor contains a non-file entry: ${entry.name}`);
      paths.push(`vendor/${entry.name}`);
    }
  }
  const records = paths.sort().map((portable) => {
    const bytes = readFileSync(resolve(workspace, portable));
    return `${portable}\0${bytes.length}\0${sha256(bytes)}`;
  });
  return sha256(Buffer.from(records.join("\n"), "utf8"));
}

function validateEvidence(evidence) {
  const schema = readJson(schemaPath);
  const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
  const validate = ajv.compile(schema);
  if (!validate(evidence)) throw new Error(`generation evidence schema failed: ${ajv.errorsText(validate.errors)}`);
}

function reserveEmptyDirectory(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} is required`);
  const path = resolve(value);
  if (existsSync(path)) {
    if (!statSync(path).isDirectory()) throw new Error(`${label} is not a directory: ${path}`);
    if (readdirSync(path).length > 0) throw new Error(`${label} must be empty: ${path}`);
  } else {
    mkdirSync(path, { recursive: true });
  }
  return path;
}

function requireDirectory(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} is required`);
  const path = resolve(value);
  if (!existsSync(path) || !statSync(path).isDirectory()) throw new Error(`${label} does not exist: ${path}`);
  return path;
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
  const bytes = readFileSync(path);
  return { path: relative(root, path).replaceAll("\\", "/"), bytes: bytes.length, sha256: sha256(bytes) };
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
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!name.startsWith("--")) throw new Error(`unexpected argument: ${name}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${name}`);
    options[name.slice(2)] = value;
    index += 1;
  }
  return options;
}

async function runCli() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runSyntheticGenerationAgent({
    workspace: options.workspace,
    evidenceDir: options.evidence,
    profileId: options.profile,
    arm: options.arm,
    cycle: options.cycle,
    provider: options.provider ?? "codex",
    model: options.model ?? (options.provider === "claude" ? "claude-sonnet-5" : "gpt-5.6-terra"),
    reasoningEffort: options.reasoning ?? "medium",
    timeoutMs: options["timeout-ms"] ? Number(options["timeout-ms"]) : 1_200_000
  });
  console.log(
    `run-synthetic-generation-agent ${result.evidence.status}: profile=${result.evidence.profileId}; arm=${result.evidence.arm}; cycle=${result.evidence.cycle}`
  );
  if (result.evidence.status !== "passed") process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runCli();
  } catch (error) {
    console.error(`run-synthetic-generation-agent failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

export const syntheticGenerationAgent = {
  immutableFiles,
  schemaPath
};
