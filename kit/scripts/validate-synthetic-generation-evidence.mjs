import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const kitRoot = resolve(scriptDir, "..");
const schemaPath = resolve(kitRoot, "schema/synthetic-generation-command-evidence.schema.json");
const profilesPath = resolve(kitRoot, "harness/synthetic-prd/shape-profiles.json");

export function validateSyntheticGenerationEvidence(commandPath) {
  const absoluteCommand = resolve(commandPath);
  const root = dirname(absoluteCommand);
  const command = readJson(absoluteCommand);
  validateSchema(command);
  for (const field of ["prompt", "stdout", "stderr"]) verifyFileReceipt(root, command[field], field);
  if (Date.parse(command.stoppedAtUtc) < Date.parse(command.startedAtUtc)) {
    throw new Error("generation stoppedAtUtc precedes startedAtUtc");
  }
  const shouldPass =
    command.exitCode === 0 &&
    command.timedOut === false &&
    command.spawnError === null &&
    command.immutableBeforeSha256 === command.immutableAfterSha256;
  if ((command.status === "passed") !== shouldPass) throw new Error("generation status conflicts with command evidence");
  if ((command.failure === null) !== shouldPass) throw new Error("generation failure conflicts with command evidence");
  return { command, commandPath: absoluteCommand };
}

export function validateSyntheticGenerationRoot(root, { requireStabilityGate = false } = {}) {
  const absoluteRoot = resolve(root);
  if (!existsSync(absoluteRoot) || !statSync(absoluteRoot).isDirectory()) {
    throw new Error(`generation evidence root does not exist: ${absoluteRoot}`);
  }
  const records = listFiles(absoluteRoot)
    .filter((path) => isCanonicalGenerationCommandPath(absoluteRoot, resolve(absoluteRoot, path)))
    .map((portable) => ({
      portable,
      command: validateSyntheticGenerationEvidence(resolve(absoluteRoot, portable)).command
    }));
  if (records.length === 0) throw new Error("generation evidence root contains no canonical generation command.json files");
  for (const record of records) validatePreparationBinding(record, absoluteRoot);
  const commands = records.map((record) => record.command);
  if (requireStabilityGate) validateStabilityGate(commands);
  return { count: commands.length, commands };
}

export function isCanonicalGenerationCommandPath(root, path) {
  const portable = relative(resolve(root), resolve(path)).replaceAll("\\", "/");
  return /^[a-z0-9][a-z0-9-]*\/cycle-(01|02|03)\/(consumer|control)\/generation\/command\.json$/.test(
    portable
  );
}

function validatePreparationBinding({ portable, command }, root) {
  const match = portable.match(
    /^([a-z0-9][a-z0-9-]*)\/cycle-(01|02|03)\/(consumer|control)\/generation\/command\.json$/
  );
  if (!match) throw new Error(`generation command is outside the canonical matrix: ${portable}`);
  const [, profileId, cycleDigits, arm] = match;
  const cycle = Number(cycleDigits);
  assertEqual(command.profileId, profileId, "generation path profileId");
  assertEqual(command.cycle, cycle, "generation path cycle");
  assertEqual(command.arm, arm, "generation path arm");
  const preparation = readJson(resolve(root, profileId, `cycle-${cycleDigits}`, "input/cycle-preparation.json"));
  assertEqual(preparation.profileId, profileId, "generation preparation profileId");
  assertEqual(preparation.cycle, cycle, "generation preparation cycle");
  const expected = preparation.workspaces?.[arm]?.frozenInputTreeSha256;
  if (typeof expected !== "string") throw new Error(`generation preparation omits ${arm} frozen input tree`);
  assertEqual(command.immutableBeforeSha256, expected, "generation frozen input binding before");
  assertEqual(command.immutableAfterSha256, expected, "generation frozen input binding after");
  validateWorkspacePreparationPath({ command, preparation, profileId, cycleDigits, arm, root });
}

function validateWorkspacePreparationPath({ command, preparation, profileId, cycleDigits, arm, root }) {
  if (samePath(command.cwd, preparation.workspaces[arm].path)) return;
  const cycleRoot = resolve(root, profileId, `cycle-${cycleDigits}`);
  const retryFiles = readdirSync(cycleRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^retry-preparation-[0-9]+\.json$/.test(entry.name))
    .map((entry) => resolve(cycleRoot, entry.name));
  const matches = [];
  for (const path of retryFiles) {
    const retry = readJson(path);
    assertEqual(retry.profileId, preparation.profileId, "retry preparation profileId");
    assertEqual(retry.seed, preparation.seed, "retry preparation seed");
    assertEqual(retry.cycle, preparation.cycle, "retry preparation cycle");
    assertEqual(retry.manifest.sha256, preparation.manifest.sha256, "retry preparation manifest");
    assertEqual(
      retry.semanticContract.sha256,
      preparation.semanticContract.sha256,
      "retry preparation semantic contract"
    );
    assertEqual(
      retry.packageReceipt.sha256,
      preparation.packageReceipt.sha256,
      "retry preparation package receipt"
    );
    for (const candidateArm of ["consumer", "control"]) {
      assertEqual(
        retry.workspaces[candidateArm].artifactId,
        preparation.workspaces[candidateArm].artifactId,
        `retry preparation ${candidateArm} artifactId`
      );
      assertEqual(
        retry.workspaces[candidateArm].runId,
        preparation.workspaces[candidateArm].runId,
        `retry preparation ${candidateArm} runId`
      );
      assertEqual(
        retry.workspaces[candidateArm].frozenInputTreeSha256,
        preparation.workspaces[candidateArm].frozenInputTreeSha256,
        `retry preparation ${candidateArm} frozen input tree`
      );
    }
    if (samePath(command.cwd, retry.workspaces[arm].path)) matches.push(path);
  }
  if (matches.length !== 1) {
    throw new Error(
      `retry preparation does not bind command cwd: ${command.cwd}; matches=${matches.length}`
    );
  }
}

function samePath(left, right) {
  return resolve(left).replaceAll("\\", "/").toLowerCase() === resolve(right).replaceAll("\\", "/").toLowerCase();
}

function validateStabilityGate(commands) {
  const profiles = readJson(profilesPath).profiles.map((item) => item.profileId).sort();
  const expected = [];
  for (const profileId of profiles) {
    for (let cycle = 1; cycle <= 3; cycle += 1) {
      for (const arm of ["consumer", "control"]) expected.push(`${profileId}|${cycle}|${arm}`);
    }
  }
  const observed = commands.map((item) => `${item.profileId}|${item.cycle}|${item.arm}`).sort();
  assertDeepEqual(observed, expected.sort(), "generation stability matrix");
  if (commands.length !== 18) throw new Error(`generation stability gate requires 18 commands, received ${commands.length}`);
  if (commands.some((item) => item.status !== "passed")) throw new Error("generation stability gate contains failed commands");
  if (new Set(commands.map((item) => item.cwd.toLowerCase())).size !== 18) {
    throw new Error("generation stability gate requires 18 unique workspaces");
  }
  if (new Set(commands.map((item) => `${item.provider ?? "legacy-codex"}|${item.model}|${item.reasoningEffort}`)).size !== 1) {
    throw new Error("generation stability gate requires one frozen model and reasoning profile");
  }
}

function validateSchema(command) {
  const schema = readJson(schemaPath);
  const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
  const validate = ajv.compile(schema);
  if (!validate(command)) throw new Error(`generation evidence schema failed: ${ajv.errorsText(validate.errors)}`);
}

function verifyFileReceipt(root, receipt, label) {
  const path = resolve(root, receipt.path);
  const portable = relative(root, path).replaceAll("\\", "/");
  if (!portable || portable === ".." || portable.startsWith("../")) throw new Error(`${label} receipt escapes evidence root`);
  const bytes = readFileSync(path);
  if (bytes.length !== receipt.bytes) throw new Error(`${label} receipt byte count drifted`);
  if (sha256(bytes) !== receipt.sha256) throw new Error(`${label} receipt SHA-256 drifted`);
}

function listFiles(root) {
  const files = [];
  walk(root, "");
  return files.sort();

  function walk(current, parent) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const portable = parent ? `${parent}/${entry.name}` : entry.name;
      const absolute = resolve(current, entry.name);
      if (entry.isDirectory()) walk(absolute, portable);
      else if (entry.isFile()) files.push(portable);
    }
  }
}

function assertDeepEqual(actual, expected, label) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`${label}: expected ${right}, received ${left}`);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function parseArgs(argv) {
  const options = { gate: false };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name === "--require-stability-gate") {
      options.gate = true;
      continue;
    }
    if (!name.startsWith("--")) throw new Error(`unexpected argument: ${name}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${name}`);
    options[name.slice(2)] = value;
    index += 1;
  }
  return options;
}

function runCli() {
  const options = parseArgs(process.argv.slice(2));
  if (Boolean(options.command) === Boolean(options.root)) {
    throw new Error("provide exactly one of --command or --root");
  }
  if (options.command) {
    const result = validateSyntheticGenerationEvidence(options.command);
    console.log(
      `validate-synthetic-generation-evidence passed: profile=${result.command.profileId}; arm=${result.command.arm}; cycle=${result.command.cycle}`
    );
    return;
  }
  const result = validateSyntheticGenerationRoot(options.root, { requireStabilityGate: options.gate });
  console.log(`validate-synthetic-generation-evidence passed: commands=${result.count}; stabilityGate=${options.gate}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    console.error(`validate-synthetic-generation-evidence failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
