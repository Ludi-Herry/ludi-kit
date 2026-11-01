// 核对页面源码实际导入的 antd 组件都在同目录 generation-knowledge.json 的 actualComponents 里。
// 按 kit 规则新检查先试运行：默认只报告不拦截（exit 0）；--strict 时发现缺口才失败。
// 用法：node scripts/check-generation-knowledge-coverage.mjs [--project <projectId> | --root <dir>] [--strict]
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const strict = argv.includes("--strict");
const projectIndex = argv.indexOf("--project");
const project = projectIndex >= 0 ? argv[projectIndex + 1] : null;
const rootIndex = argv.indexOf("--root");
const roots = rootIndex >= 0
  ? [resolve(argv[rootIndex + 1])]
  : project ? [resolve(kitRoot, "projects", project)] : [resolve(kitRoot, "projects"), resolve(kitRoot, "generator/fixtures")];

const knowledgeFiles = roots.flatMap((root) => findFiles(root, "generation-knowledge.json"));
let gapCount = 0;

for (const file of knowledgeFiles) {
  const directory = dirname(file);
  const knowledge = JSON.parse(readFileSync(file, "utf8"));
  const declared = new Set((knowledge.pages ?? []).flatMap((page) => page.actualComponents ?? []));
  const sources = readdirSync(directory).filter((name) => name.endsWith(".tsx")).map((name) => resolve(directory, name));
  const imported = new Map();
  for (const source of sources) {
    for (const component of antdNamedImports(readFileSync(source, "utf8"))) {
      if (!imported.has(component)) imported.set(component, relative(kitRoot, source).replaceAll("\\", "/"));
    }
  }
  const missing = [...imported.keys()].filter((component) => !declared.has(component)).sort();
  const label = relative(kitRoot, file).replaceAll("\\", "/");
  if (missing.length === 0) {
    console.log(`ok ${label}: ${imported.size} imported antd component(s) declared`);
  } else {
    gapCount += missing.length;
    console.log(`gap ${label}: imported but not declared → ${missing.map((component) => `${component} (${imported.get(component)})`).join(", ")}`);
  }
}

const summary = `check-generation-knowledge-coverage: ${knowledgeFiles.length} knowledge file(s), ${gapCount} undeclared import(s)`;
if (gapCount > 0 && strict) {
  console.error(`${summary} — failed (--strict)`);
  process.exitCode = 1;
} else {
  console.log(gapCount > 0 ? `${summary} — reported only (shadow mode)` : summary);
}

function antdNamedImports(source) {
  const names = [];
  for (const match of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']antd["']/g)) {
    for (const part of match[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name && !name.startsWith("type ")) names.push(name);
    }
  }
  return names;
}

function findFiles(root, name, files = []) {
  if (!existsSync(root)) return files;
  for (const entry of readdirSync(root)) {
    if (["node_modules", "dist", ".local-pack", "evidence"].includes(entry)) continue;
    const path = resolve(root, entry);
    if (statSync(path).isDirectory()) findFiles(path, name, files);
    else if (entry === name) files.push(path);
  }
  return files;
}
