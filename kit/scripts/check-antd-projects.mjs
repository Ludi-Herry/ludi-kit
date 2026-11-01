import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { lintBlogDerivedRules } from "./antd-blog-lint.mjs";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliEntry = resolve(kitRoot, "node_modules/@ant-design/cli/dist/index.js");
const contextFiles = [
  ...findNamedFiles(resolve(kitRoot, "projects"), "business-context.json"),
  ...findNamedFiles(resolve(kitRoot, "generator/fixtures"), "business-context.json")
];
const targets = [];

for (const contextFile of contextFiles) {
  const context = JSON.parse(readFileSync(contextFile, "utf8"));
  const foundation = context.frontendFoundation;
  if (foundation?.outputMode !== "library-native" || foundation?.foundation?.id !== "antd") continue;
  if (foundation.adapters?.lint !== "lint.react-antd-project") {
    throw new Error(`${relative(kitRoot, contextFile)} must use lint.react-antd-project`);
  }
  targets.push({ projectId: context.projectId, contextFile, directory: dirname(contextFile) });
}

if (targets.length === 0) throw new Error("no library-native + antd project contracts were found");

let issueCount = 0;
for (const target of targets) {
  const result = spawnSync(
    process.execPath,
    [cliEntry, "lint", target.directory, "--version", "6.5.0", "--format", "json"],
    { cwd: kitRoot, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }
  );
  if (result.status !== 0) {
    throw new Error(`${target.projectId} AntD lint command failed: ${(result.stderr || result.stdout || `exit ${result.status}`).trim()}`);
  }
  const report = parseJson(result.stdout, `${target.projectId} AntD lint`);
  const issues = report.issues ?? [];
  const blogIssues = lintBlogDerivedRules(target.directory);
  issueCount += issues.length + blogIssues.length;
  console.log(
    `${target.projectId}: ${issues.length + blogIssues.length} issue(s); deprecated=${report.summary?.deprecated ?? 0}; a11y=${report.summary?.a11y ?? 0}; usage=${report.summary?.usage ?? 0}; performance=${report.summary?.performance ?? 0}; blog-derived=${blogIssues.length}`
  );
  for (const issue of issues) {
    const file = relative(kitRoot, resolve(issue.file)).replaceAll("\\", "/");
    console.error(`  ${file}:${issue.line ?? 1} [${issue.rule}/${issue.severity}] ${issue.message}`);
  }
  for (const issue of blogIssues) {
    console.error(`  ${relative(kitRoot, issue.file).replaceAll("\\", "/")}:${issue.line} [${issue.rule}/error] ${issue.message}`);
  }
}

if (issueCount > 0) {
  console.error(`check-antd-projects failed: ${issueCount} issue(s) across ${targets.length} contract(s)`);
  process.exitCode = 1;
} else {
  console.log(`check-antd-projects passed: ${targets.length} library-native + antd contracts, 0 issues`);
}

function findNamedFiles(root, name) {
  if (!existsSync(root)) return [];
  const files = [];
  walk(root, files, name);
  return files;
}

function walk(directory, files, name) {
  for (const entry of readdirSync(directory)) {
    if (["node_modules", "dist", ".local-pack"].includes(entry)) continue;
    const path = resolve(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, files, name);
    else if (entry === name) files.push(path);
  }
}

function parseJson(value, label) {
  const start = value.indexOf("{");
  if (start < 0) throw new Error(`${label} returned no JSON`);
  try {
    return JSON.parse(value.slice(start));
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error.message}`);
  }
}
