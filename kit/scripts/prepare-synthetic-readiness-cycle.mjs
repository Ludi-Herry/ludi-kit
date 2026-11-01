import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { compileSyntheticSemanticContract } from "./compile-synthetic-semantic-contract.mjs";
import { generateSyntheticBlindPrd } from "./generate-synthetic-blind-prd.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const kitRoot = resolve(scriptDir, "..");
const schemaPath = resolve(kitRoot, "schema/synthetic-cycle-preparation.schema.json");
const defaultPackageReceiptPath = resolve(
  kitRoot,
  "quality/blind-harness/synthetic-consumer-package-receipt.json"
);
const immutableCommonFiles = [
  "generation-request.json",
  "manifest.json",
  "project-description.json",
  "sample-pack.json",
  "semantic-contract.json",
  "synthetic-prd.md"
];
const workspaceInstructions = `# Synthetic generation readiness workspace

This directory is one isolated, non-scoring generation task.

- Work only inside this workspace. Do not read parent or sibling directories.
- Treat the supplied PRD, JSON inputs, artifact identity, package receipt, vendor tarball, and public artifact metadata as immutable.
- Build the requested product and expose the exact unique data-testid values named by semantic-contract.json.
- Keep flow assertions owned by the external harness. Do not create test, spec, Playwright, Vitest, Jest, or flow-smoke files or scripts.
- Provide package scripts named typecheck, build, and preview. The preview script must serve the Vite production build.
- Keep generated copy in Simplified Chinese and follow business-context.json import boundaries.
- Do not start a persistent development server when finishing the task.
`;

export function prepareSyntheticReadinessCycle({
  profileId,
  seed,
  cycle,
  inputDir,
  workspaceRoot,
  packageReceiptPath = defaultPackageReceiptPath
}) {
  const cycleNumber = Number(cycle);
  if (!Number.isInteger(cycleNumber) || cycleNumber < 1 || cycleNumber > 3) {
    throw new Error("cycle must be an integer from 1 through 3");
  }
  if (typeof profileId !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(profileId)) {
    throw new Error("profileId must use lowercase kebab-case");
  }
  if (typeof seed !== "string" || !/^(0|[1-9][0-9]*)$/.test(seed)) {
    throw new Error("seed must be an unsigned decimal string");
  }
  const absoluteInputDir = reserveEmptyDirectory(inputDir, "inputDir");
  const absoluteWorkspaceRoot = reserveEmptyDirectory(workspaceRoot, "workspaceRoot");
  assertNoPathOverlap(absoluteInputDir, absoluteWorkspaceRoot, "inputDir and workspaceRoot");

  const packageReceipt = readJson(packageReceiptPath);
  verifyPackageReceipt(packageReceipt, packageReceiptPath);
  const frozenPackPath = resolve(kitRoot, packageReceipt.frozenPack.path);

  const generated = generateSyntheticBlindPrd({ profileId, seed, outDir: absoluteInputDir });
  const compiled = compileSyntheticSemanticContract({
    inputDir: absoluteInputDir,
    outFile: resolve(absoluteInputDir, "semantic-contract.json")
  });

  const workspaces = {};
  for (const arm of ["consumer", "control"]) {
    const workspace = resolve(absoluteWorkspaceRoot, arm);
    reserveEmptyDirectory(workspace, `${arm} workspace`);
    for (const name of immutableCommonFiles) {
      copyFileSync(resolve(absoluteInputDir, name), resolve(workspace, name));
    }
    copyFileSync(
      resolve(absoluteInputDir, `${arm}-business-context.json`),
      resolve(workspace, "business-context.json")
    );
    copyFileSync(
      resolve(absoluteInputDir, `${arm}-artifact-identity.json`),
      resolve(workspace, "artifact-identity.json")
    );
    mkdirSync(resolve(workspace, "public"), { recursive: true });
    copyFileSync(
      resolve(absoluteInputDir, `${arm}-artifact-identity.json`),
      resolve(workspace, "public/artifact-meta.json")
    );
    writeFileSync(resolve(workspace, "AGENTS.md"), workspaceInstructions, { encoding: "utf8", flag: "wx" });

    let workspacePackage = null;
    if (arm === "consumer") {
      mkdirSync(resolve(workspace, "vendor"), { recursive: true });
      const workspacePackPath = resolve(workspace, `vendor/${basename(frozenPackPath)}`);
      copyFileSync(frozenPackPath, workspacePackPath);
      copyFileSync(resolve(packageReceiptPath), resolve(workspace, "consumer-package-receipt.json"));
      workspacePackage = fileReceipt(workspace, workspacePackPath);
      assertEqual(workspacePackage.bytes, packageReceipt.frozenPack.bytes, "consumer workspace pack bytes");
      assertEqual(workspacePackage.sha256, packageReceipt.frozenPack.sha256, "consumer workspace pack SHA-256");
    }

    const identity = readJson(resolve(workspace, "artifact-identity.json"));
    workspaces[arm] = {
      path: workspace.replaceAll("\\", "/"),
      artifactId: identity.artifactId,
      runId: identity.runId,
      frozenInputTreeSha256: treeSha256(workspace),
      package: workspacePackage
    };
  }

  const receipt = {
    $schema: "../../../../../schema/synthetic-cycle-preparation.schema.json",
    version: "1.0.0",
    qualifying: false,
    scoring: false,
    profileId,
    seed,
    cycle: cycleNumber,
    inputDirectory: absoluteInputDir.replaceAll("\\", "/"),
    manifest: fileReceipt(absoluteInputDir, resolve(absoluteInputDir, "manifest.json")),
    semanticContract: fileReceipt(absoluteInputDir, resolve(absoluteInputDir, "semantic-contract.json")),
    packageReceipt: fileReceipt(kitRoot, resolve(packageReceiptPath)),
    workspaces
  };
  assertEqual(receipt.manifest.sha256, generated.manifestSha256, "generated manifest SHA-256");
  assertEqual(receipt.semanticContract.sha256, compiled.sha256, "compiled semantic contract SHA-256");
  validateReceipt(receipt);
  const receiptPath = resolve(absoluteInputDir, "cycle-preparation.json");
  writeFileSync(receiptPath, canonicalJsonBytes(receipt), { flag: "wx" });
  return { receipt, receiptPath, inputDir: absoluteInputDir, workspaceRoot: absoluteWorkspaceRoot };
}

function verifyPackageReceipt(receipt, receiptPath) {
  if (receipt.purpose !== "synthetic-generation-readiness" || receipt.qualifying !== false || receipt.scoring !== false) {
    throw new Error("consumer package receipt is outside the synthetic non-scoring boundary");
  }
  const frozenPackPath = resolve(kitRoot, receipt.frozenPack.path);
  const observed = fileReceipt(kitRoot, frozenPackPath);
  assertEqual(observed.bytes, receipt.frozenPack.bytes, "frozen package bytes");
  assertEqual(observed.sha256, receipt.frozenPack.sha256, "frozen package SHA-256");
  const receiptBytes = readFileSync(resolve(receiptPath));
  if (receiptBytes.length === 0) throw new Error("consumer package receipt is empty");
}

function validateReceipt(receipt) {
  const schema = readJson(schemaPath);
  const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
  const validate = ajv.compile(schema);
  if (!validate(receipt)) throw new Error(`cycle preparation schema failed: ${ajv.errorsText(validate.errors)}`);
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

function assertNoPathOverlap(left, right, label) {
  if (isInside(left, right) || isInside(right, left) || resolve(left).toLowerCase() === resolve(right).toLowerCase()) {
    throw new Error(`${label} must not overlap`);
  }
}

function isInside(parent, child) {
  const value = relative(resolve(parent), resolve(child));
  return value !== "" && value !== ".." && !value.startsWith("..\\") && !value.startsWith("../");
}

function treeSha256(root) {
  const records = [];
  walk(resolve(root), "");
  return sha256(Buffer.from(records.sort().join("\n"), "utf8"));

  function walk(current, parent) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const portable = parent ? `${parent}/${entry.name}` : entry.name;
      const absolute = resolve(current, entry.name);
      if (entry.isDirectory()) walk(absolute, portable);
      else if (entry.isFile()) {
        const bytes = readFileSync(absolute);
        records.push(`${portable}\0${bytes.length}\0${sha256(bytes)}`);
      } else {
        throw new Error(`frozen input tree rejects non-file entry: ${portable}`);
      }
    }
  }
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

function runCli() {
  const options = parseArgs(process.argv.slice(2));
  const result = prepareSyntheticReadinessCycle({
    profileId: options.profile,
    seed: options.seed,
    cycle: options.cycle,
    inputDir: options.input,
    workspaceRoot: options.workspaces,
    packageReceiptPath: options["package-receipt"]
      ? resolve(options["package-receipt"])
      : defaultPackageReceiptPath
  });
  console.log(
    `prepare-synthetic-readiness-cycle passed: profile=${result.receipt.profileId}; cycle=${result.receipt.cycle}; seed=${result.receipt.seed}`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    console.error(`prepare-synthetic-readiness-cycle failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

export const syntheticCyclePreparation = {
  defaultPackageReceiptPath,
  immutableCommonFiles,
  schemaPath,
  workspaceInstructions
};
