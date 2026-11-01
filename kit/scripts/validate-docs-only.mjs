import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, posix, relative, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  isDocsOnlyPath,
  normalizeRepositoryPath,
  repositoryRootFrom,
  validationStateDirectory,
  writeJsonAtomic
} from "./validation-input-snapshot.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const kitRoot = resolve(dirname(scriptPath), "..");
const DOCS_REPORT_VERSION = "1.0.0";

export function collectStagedPaths(repositoryRoot) {
  return splitNull(gitBuffer(repositoryRoot, [
    "diff",
    "--cached",
    "--no-renames",
    "--name-only",
    "-z",
    "--diff-filter=ACDMRTUXB"
  ])).map(normalizeRepositoryPath).sort((left, right) => left.localeCompare(right));
}

export function validateDocsOnly({
  repositoryRoot,
  paths,
  source = "worktree",
  runProjectGates = true,
  commandRunner = runNpmScript
}) {
  const changedPaths = [...new Set(paths.map(normalizeRepositoryPath))].sort((left, right) => left.localeCompare(right));
  if (changedPaths.length === 0) throw new Error("docs-only validation requires at least one changed path");
  const outsideScope = changedPaths.filter((path) => !isDocsOnlyPath(path));
  if (outsideScope.length > 0) throw new Error(`docs-only scope violation: ${outsideScope.join(", ")}`);
  if (!['staged', 'worktree'].includes(source)) throw new Error(`unsupported docs source: ${source}`);

  if (source === "staged") runDiffCheck(repositoryRoot, changedPaths);
  const deletedPaths = [];
  for (const path of changedPaths) {
    const bytes = readDocumentBytes(repositoryRoot, path, source);
    if (bytes === null) {
      deletedPaths.push(path);
      continue;
    }
    const markdown = decodeUtf8(bytes, path);
    if (markdown.includes("\0")) throw new Error(`${path} contains a NUL byte`);
    validateDocumentLinks({ repositoryRoot, sourcePath: path, markdown, source });
  }
  if (deletedPaths.length > 0) validateDeletedDocumentReferences({ repositoryRoot, deletedPaths, source });

  if (runProjectGates) {
    for (const script of ["validate:kit", "validate:integrity", "validate:image2-routing-policy"]) {
      const result = commandRunner(script);
      if (result !== 0) throw new Error(`${script} failed with exit code ${result}`);
    }
  }
  return {
    version: DOCS_REPORT_VERSION,
    changedPaths,
    deletedPaths,
    inputListHash: createHash("sha256").update(changedPaths.join("\0")).digest("hex")
  };
}

function validateDocumentLinks({ repositoryRoot, sourcePath, markdown, source }) {
  for (const link of extractMarkdownLinks(markdown)) {
    const parsed = parseRelativeLink(link);
    if (!parsed) continue;
    const targetPath = parsed.path
      ? normalizeRelativeTarget(sourcePath, parsed.path)
      : sourcePath;
    if (!pathExists(repositoryRoot, targetPath, source)) {
      throw new Error(`${sourcePath} has a broken relative link: ${link}`);
    }
    if (parsed.anchor && targetPath.endsWith(".md")) {
      const targetBytes = readDocumentBytes(repositoryRoot, targetPath, source);
      if (targetBytes === null) throw new Error(`${sourcePath} links to a deleted document: ${link}`);
      const anchors = markdownAnchors(decodeUtf8(targetBytes, targetPath));
      if (!anchors.has(parsed.anchor)) throw new Error(`${sourcePath} has a broken heading anchor: ${link}`);
    }
  }
}

function validateDeletedDocumentReferences({ repositoryRoot, deletedPaths, source }) {
  const deleted = new Set(deletedPaths);
  const candidates = source === "staged"
    ? splitNull(gitBuffer(repositoryRoot, ["ls-files", "-z", "--", "*.md"]))
    : splitNull(gitBuffer(repositoryRoot, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]))
      .filter((path) => path.endsWith(".md"));
  for (const candidate of candidates.map(normalizeRepositoryPath)) {
    if (deleted.has(candidate)) continue;
    const bytes = readDocumentBytes(repositoryRoot, candidate, source);
    if (bytes === null) continue;
    const markdown = decodeUtf8(bytes, candidate);
    for (const link of extractMarkdownLinks(markdown)) {
      const parsed = parseRelativeLink(link);
      if (!parsed?.path) continue;
      const targetPath = normalizeRelativeTarget(candidate, parsed.path);
      if (deleted.has(targetPath)) throw new Error(`${candidate} still links to deleted document ${targetPath}`);
    }
  }
}

function extractMarkdownLinks(markdown) {
  const withoutFences = markdown
    .replace(/^```[^\n]*\n[\s\S]*?^```[ \t]*$/gm, "")
    .replace(/^~~~[^\n]*\n[\s\S]*?^~~~[ \t]*$/gm, "")
    .replace(/`[^`\n]*`/g, "");
  return [...withoutFences.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1].trim());
}

function parseRelativeLink(raw) {
  let destination = raw.trim();
  if (destination.startsWith("<")) {
    const end = destination.indexOf(">");
    if (end === -1) return null;
    destination = destination.slice(1, end);
  } else {
    destination = destination.split(/\s+["']/)[0];
  }
  if (
    destination.startsWith("/")
    || destination.startsWith("//")
    || /^[a-z][a-z0-9+.-]*:/i.test(destination)
  ) return null;
  const [pathAndQuery, anchor = ""] = destination.split("#", 2);
  const path = pathAndQuery.split("?", 1)[0];
  let decodedPath;
  let decodedAnchor;
  try {
    decodedPath = decodeURIComponent(path);
    decodedAnchor = decodeURIComponent(anchor).toLowerCase();
  } catch {
    throw new Error(`invalid percent encoding in Markdown link: ${raw}`);
  }
  return { path: decodedPath, anchor: decodedAnchor };
}

function normalizeRelativeTarget(sourcePath, destination) {
  const target = posix.normalize(posix.join(posix.dirname(sourcePath), destination));
  if (target === ".." || target.startsWith("../")) throw new Error(`${sourcePath} has a repository-escaping link: ${destination}`);
  return normalizeRepositoryPath(target);
}

function markdownAnchors(markdown) {
  const anchors = new Set();
  const counts = new Map();
  for (const match of markdown.matchAll(/^#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/gm)) {
    const base = slugHeading(match[1]);
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

function slugHeading(heading) {
  return heading
    .toLowerCase()
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

function readDocumentBytes(repositoryRoot, path, source) {
  if (source === "staged") {
    const result = spawnSync("git", ["show", `:${path}`], {
      cwd: repositoryRoot,
      encoding: null,
      windowsHide: true,
      maxBuffer: 32 * 1024 * 1024
    });
    return result.status === 0 ? result.stdout : null;
  }
  const absolutePath = resolveContained(repositoryRoot, path);
  return existsSync(absolutePath) ? readFileSync(absolutePath) : null;
}

function pathExists(repositoryRoot, path, source) {
  if (source === "worktree") return existsSync(resolveContained(repositoryRoot, path));
  const exact = spawnSync("git", ["cat-file", "-e", `:${path}`], {
    cwd: repositoryRoot,
    windowsHide: true,
    stdio: "ignore"
  });
  if (exact.status === 0) return true;
  const children = splitNull(gitBuffer(repositoryRoot, ["ls-files", "-z", "--", `${path}/**`]));
  return children.length > 0;
}

function resolveContained(repositoryRoot, path) {
  const absolutePath = resolve(repositoryRoot, path);
  const local = relative(repositoryRoot, absolutePath);
  if (local.startsWith("..") || /^[A-Za-z]:/.test(local)) throw new Error(`path escapes repository: ${path}`);
  return absolutePath;
}

function decodeUtf8(bytes, path) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${path} is not valid UTF-8`);
  }
}

function runDiffCheck(repositoryRoot, paths) {
  const result = spawnSync("git", ["diff", "--cached", "--check", "--", ...paths], {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) throw new Error((result.stdout || result.stderr || "staged diff check failed").trim());
}

function runNpmScript(script) {
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath ? process.execPath : (process.platform === "win32" ? "npm.cmd" : "npm");
  const args = npmExecPath ? [npmExecPath, "run", script] : ["run", script];
  return spawnSync(command, args, {
    cwd: kitRoot,
    stdio: "inherit",
    windowsHide: true,
    shell: !npmExecPath && process.platform === "win32"
  }).status ?? 1;
}

function gitBuffer(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: null, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
}

function splitNull(buffer) {
  return buffer.toString("utf8").split("\0").filter(Boolean);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === scriptPath;
if (isMain) {
  const repositoryRoot = repositoryRootFrom(kitRoot);
  const stateDirectory = validationStateDirectory(repositoryRoot);
  const reportPath = resolve(stateDirectory, "docs-only.latest.json");
  const startedAt = Date.now();
  let paths = [];
  let status = "failed-docs-only";
  try {
    if (!process.argv.includes("--staged")) throw new Error("validate:docs requires --staged");
    paths = collectStagedPaths(repositoryRoot);
    const result = validateDocsOnly({ repositoryRoot, paths, source: "staged" });
    status = "passed-docs-only";
    const report = { ...result, command: "npm run validate:docs -- --staged", status, durationMs: Date.now() - startedAt };
    writeJsonAtomic(reportPath, report);
    console.log(`validate-docs-only passed: paths=${paths.length}; inputListHash=${result.inputListHash}`);
  } catch (error) {
    const inputListHash = createHash("sha256").update(paths.join("\0")).digest("hex");
    writeJsonAtomic(reportPath, {
      version: DOCS_REPORT_VERSION,
      command: "npm run validate:docs -- --staged",
      status,
      changedPaths: paths,
      inputListHash,
      error: error.message,
      durationMs: Date.now() - startedAt
    });
    console.error(`validate-docs-only failed: ${error.message}`);
    process.exitCode = 1;
  }
}
