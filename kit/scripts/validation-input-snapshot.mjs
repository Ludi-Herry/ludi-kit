import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  writeFileSync
} from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";

export const VALIDATION_SNAPSHOT_VERSION = "1.0.0";

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function isDocsOnlyPath(path) {
  const normalized = normalizeRepositoryPath(path);
  return normalized === "kit/AGENTS.md"
    || (normalized.startsWith("docs/") && normalized.endsWith(".md"))
    || (!normalized.includes("/") && normalized.endsWith(".md"));
}

export function repositoryRootFrom(cwd) {
  return gitText(cwd, ["rev-parse", "--show-toplevel"]);
}

export function validationStateDirectory(repositoryRoot) {
  try {
    return gitText(repositoryRoot, [
      "rev-parse",
      "--path-format=absolute",
      "--git-path",
      "ai-readable-kit/validation"
    ]);
  } catch {
    const path = gitText(repositoryRoot, ["rev-parse", "--git-path", "ai-readable-kit/validation"]);
    return isAbsolute(path) ? path : resolve(repositoryRoot, path);
  }
}

export function currentCommit(repositoryRoot) {
  return gitText(repositoryRoot, ["rev-parse", "HEAD"]);
}

export function createValidationSnapshot({ repositoryRoot }) {
  const root = resolve(repositoryRoot);
  const indexModes = readIndexModes(root);
  const paths = splitNull(gitBuffer(root, [
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard"
  ])).map(normalizeRepositoryPath);
  const uniquePaths = [...new Set(paths)].sort((left, right) => left.localeCompare(right));
  const entries = uniquePaths.map((path) => snapshotPath(root, path, indexModes.get(path)));
  return finalizeValidationSnapshot(entries);
}

export function finalizeValidationSnapshot(entries) {
  const normalized = entries.map((entry) => ({
    path: normalizeRepositoryPath(entry.path),
    kind: entry.kind,
    mode: entry.mode,
    bytes: entry.bytes,
    sha256: entry.sha256,
    scope: entry.scope ?? (isDocsOnlyPath(entry.path) ? "docs" : "full")
  })).sort((left, right) => left.path.localeCompare(right.path));
  const inputListHash = sha256(normalized.map((entry) => [
    entry.path,
    entry.kind,
    entry.mode,
    entry.scope
  ].join("\0")).join("\n"));
  const inputContentHash = sha256(normalized.map((entry) => [
    entry.path,
    entry.kind,
    entry.mode,
    entry.bytes,
    entry.sha256,
    entry.scope
  ].join("\0")).join("\n"));
  return {
    version: VALIDATION_SNAPSHOT_VERSION,
    inputListHash,
    inputContentHash,
    managedPathCount: normalized.length,
    entries: normalized
  };
}

export function validateStoredSnapshot(snapshot) {
  if (
    snapshot?.version !== VALIDATION_SNAPSHOT_VERSION
    || !Array.isArray(snapshot.entries)
    || !Number.isSafeInteger(snapshot.managedPathCount)
  ) return false;
  const paths = new Set();
  for (const entry of snapshot.entries) {
    if (
      typeof entry?.path !== "string"
      || entry.path !== normalizeRepositoryPath(entry.path)
      || entry.path.startsWith("../")
      || isAbsolute(entry.path)
      || paths.has(entry.path)
      || !["file", "symlink", "missing"].includes(entry.kind)
      || !["docs", "full"].includes(entry.scope)
      || !Number.isSafeInteger(entry.bytes)
      || !/^[0-9a-f]{64}$/.test(entry.sha256)
    ) return false;
    paths.add(entry.path);
  }
  const rebuilt = finalizeValidationSnapshot(snapshot.entries);
  return rebuilt.managedPathCount === snapshot.managedPathCount
    && rebuilt.inputListHash === snapshot.inputListHash
    && rebuilt.inputContentHash === snapshot.inputContentHash;
}

export function changedPathsBetween(previous, current) {
  const before = new Map(previous.entries.map((entry) => [entry.path, entry]));
  const after = new Map(current.entries.map((entry) => [entry.path, entry]));
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths].filter((path) => {
    const left = before.get(path);
    const right = after.get(path);
    return JSON.stringify(left) !== JSON.stringify(right);
  }).sort((left, right) => left.localeCompare(right));
}

export function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
}

export function normalizeRepositoryPath(path) {
  return String(path).replaceAll("\\", "/").replace(/^\.\//, "");
}

function snapshotPath(repositoryRoot, path, indexMode) {
  const absolutePath = resolve(repositoryRoot, path);
  const escaped = relative(repositoryRoot, absolutePath);
  if (escaped.startsWith("..") || isAbsolute(escaped)) throw new Error(`managed path escapes repository: ${path}`);
  if (!existsSync(absolutePath)) {
    return {
      path,
      kind: "missing",
      mode: indexMode ?? "missing",
      bytes: 0,
      sha256: sha256("missing"),
      scope: isDocsOnlyPath(path) ? "docs" : "full"
    };
  }
  const stat = lstatSync(absolutePath);
  if (stat.isSymbolicLink()) {
    const target = Buffer.from(readlinkSync(absolutePath), "utf8");
    return {
      path,
      kind: "symlink",
      mode: "120000",
      bytes: target.length,
      sha256: sha256(target),
      scope: isDocsOnlyPath(path) ? "docs" : "full"
    };
  }
  if (!stat.isFile()) throw new Error(`managed path is not a file or symlink: ${path}`);
  const bytes = readFileSync(absolutePath);
  return {
    path,
    kind: "file",
    mode: indexMode ?? ((stat.mode & 0o111) === 0 ? "100644" : "100755"),
    bytes: bytes.length,
    sha256: sha256(bytes),
    scope: isDocsOnlyPath(path) ? "docs" : "full"
  };
}

function readIndexModes(repositoryRoot) {
  const records = splitNull(gitBuffer(repositoryRoot, ["ls-files", "-s", "-z"]));
  const modes = new Map();
  for (const record of records) {
    const tab = record.indexOf("\t");
    const header = record.slice(0, tab);
    const path = normalizeRepositoryPath(record.slice(tab + 1));
    const [mode] = header.split(" ");
    modes.set(path, mode);
  }
  return modes;
}

function gitText(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true }).trim();
}

function gitBuffer(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: null, windowsHide: true, maxBuffer: 128 * 1024 * 1024 });
}

function splitNull(buffer) {
  return buffer.toString("utf8").split("\0").filter(Boolean);
}
