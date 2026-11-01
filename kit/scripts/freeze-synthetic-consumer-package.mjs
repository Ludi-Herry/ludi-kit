import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const kitRoot = resolve(scriptDir, "..");
const schemaPath = resolve(kitRoot, "schema/synthetic-consumer-package-receipt.schema.json");
const defaultCanonicalPackPath = resolve(kitRoot, ".local-pack/ai-readable-kit-0.1.0.tgz");
const defaultReceiptPath = resolve(
  kitRoot,
  "quality/blind-harness/synthetic-consumer-package-receipt.json"
);

export function freezeSyntheticConsumerPackage({
  canonicalPackPath = defaultCanonicalPackPath,
  receiptPath = defaultReceiptPath,
  sourceCommit = currentCommit(),
  createdAtUtc = null,
  root = kitRoot
} = {}) {
  const absoluteRoot = resolve(root);
  const absoluteCanonical = resolve(canonicalPackPath);
  const absoluteReceipt = resolve(receiptPath);
  assertInside(absoluteRoot, absoluteCanonical, "canonical pack");
  assertInside(absoluteRoot, absoluteReceipt, "package receipt");
  if (!existsSync(absoluteCanonical) || !statSync(absoluteCanonical).isFile()) {
    throw new Error(`canonical pack does not exist: ${absoluteCanonical}`);
  }
  if (!/^[0-9a-f]{40}$/.test(sourceCommit)) throw new Error("sourceCommit must be a full lowercase Git SHA");
  if (createdAtUtc !== null && Number.isNaN(Date.parse(createdAtUtc))) {
    throw new Error("createdAtUtc must be an ISO date-time");
  }

  const packageDocument = readJson(resolve(absoluteRoot, "package.json"));
  if (packageDocument.name !== "@ai-readable/kit") throw new Error("unexpected package name");
  const canonicalBytes = readFileSync(absoluteCanonical);
  const digest = sha256(canonicalBytes);
  const packageStem = packageDocument.name.replace(/^@/, "").replaceAll("/", "-");
  const frozenFilename = `${packageStem}-${packageDocument.version}-${digest.slice(0, 12)}.tgz`;
  const absoluteFrozen = resolve(dirname(absoluteCanonical), frozenFilename);
  assertInside(absoluteRoot, absoluteFrozen, "frozen pack");

  if (existsSync(absoluteFrozen)) {
    const existing = readFileSync(absoluteFrozen);
    if (!existing.equals(canonicalBytes)) throw new Error(`frozen pack already exists with different bytes: ${absoluteFrozen}`);
  } else {
    copyFileSync(absoluteCanonical, absoluteFrozen, constants.COPYFILE_EXCL);
  }

  if (existsSync(absoluteReceipt)) {
    const existing = readJson(absoluteReceipt);
    validateReceipt(existing);
    assertEqual(existing.sourceCommit, sourceCommit, "existing receipt sourceCommit");
    assertEqual(existing.canonicalPack.bytes, canonicalBytes.length, "existing canonical pack bytes");
    assertEqual(existing.canonicalPack.sha256, digest, "existing canonical pack SHA-256");
    assertEqual(existing.frozenPack.path, portableRelative(absoluteRoot, absoluteFrozen), "existing frozen pack path");
    assertEqual(existing.frozenPack.bytes, canonicalBytes.length, "existing frozen pack bytes");
    assertEqual(existing.frozenPack.sha256, digest, "existing frozen pack SHA-256");
    return { receipt: existing, receiptPath: absoluteReceipt, frozenPackPath: absoluteFrozen };
  }

  const receipt = {
    $schema: "../../schema/synthetic-consumer-package-receipt.schema.json",
    version: "1.0.0",
    purpose: "synthetic-generation-readiness",
    qualifying: false,
    scoring: false,
    sourceCommit,
    package: { name: packageDocument.name, version: packageDocument.version },
    canonicalPack: fileReceipt(absoluteRoot, absoluteCanonical),
    frozenPack: fileReceipt(absoluteRoot, absoluteFrozen),
    createdAtUtc: createdAtUtc ?? new Date().toISOString()
  };
  validateReceipt(receipt);
  mkdirSync(dirname(absoluteReceipt), { recursive: true });
  const receiptBytes = canonicalJsonBytes(receipt);
  writeFileSync(absoluteReceipt, receiptBytes, { flag: "wx" });
  return { receipt, receiptPath: absoluteReceipt, frozenPackPath: absoluteFrozen };
}

function validateReceipt(receipt) {
  const schema = readJson(schemaPath);
  const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
  const validate = ajv.compile(schema);
  if (!validate(receipt)) throw new Error(`synthetic package receipt schema failed: ${ajv.errorsText(validate.errors)}`);
}

function currentCommit() {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: kitRoot, encoding: "utf8" }).trim();
}

function fileReceipt(root, path) {
  const bytes = readFileSync(path);
  return {
    path: portableRelative(root, path),
    bytes: bytes.length,
    sha256: sha256(bytes)
  };
}

function assertInside(root, path, label) {
  const portable = portableRelative(root, path);
  if (!portable || portable === ".." || portable.startsWith("../")) {
    throw new Error(`${label} must stay inside kit root`);
  }
}

function portableRelative(root, path) {
  return relative(resolve(root), resolve(path)).replaceAll("\\", "/");
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

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
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
  const result = freezeSyntheticConsumerPackage({
    canonicalPackPath: options.canonical ? resolve(options.canonical) : defaultCanonicalPackPath,
    receiptPath: options.receipt ? resolve(options.receipt) : defaultReceiptPath,
    sourceCommit: options["source-commit"] ?? currentCommit(),
    createdAtUtc: options["created-at"] ?? null
  });
  console.log(
    `freeze-synthetic-consumer-package passed: file=${result.receipt.frozenPack.path}; sha256=${result.receipt.frozenPack.sha256}`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    console.error(`freeze-synthetic-consumer-package failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

export const syntheticPackagePaths = {
  defaultCanonicalPackPath,
  defaultReceiptPath,
  schemaPath
};
