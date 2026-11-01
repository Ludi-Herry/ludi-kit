import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const knowledgeRoot = resolve(kitRoot, "foundations/knowledge/antd-6.5.0");
const referenceRoot = resolve(knowledgeRoot, "component-reference");
const blogRoot = resolve(knowledgeRoot, "blog");
const cliEntry = resolve(kitRoot, "node_modules/@ant-design/cli/dist/index.js");
const antdVersion = "6.5.0";
const cliVersion = "6.5.1";
const reviewedAt = "2026-07-22";
const queryAliases = {
  Col: "Grid",
  Row: "Grid"
};

const decisions = readJson(resolve(knowledgeRoot, "decision-cards.json"));
const pageMap = readJson(resolve(knowledgeRoot, "page-component-map.json"));
const blogIndex = readJson(resolve(blogRoot, "index.json"));
const blogLintRules = readJson(resolve(knowledgeRoot, "blog-lint-rules.json"));
const visualRegressionCases = readJson(resolve(knowledgeRoot, "visual-regression-cases.json"));
const upgradeWatch = readJson(resolve(knowledgeRoot, "upgrade-watch.json"));
const components = [
  ...new Set([
    ...decisions.cards.map((card) => card.component),
    ...Object.values(pageMap.templates).flatMap((template) => template.components)
  ])
].sort();

mkdirSync(referenceRoot, { recursive: true });

const designResult = runQuery("design.md", [], { lang: false, required: true });
if (typeof designResult.data.doc !== "string" || designResult.data.doc.length < 10000) {
  throw new Error("AntD design.md query returned an incomplete document");
}
writeText(resolve(knowledgeRoot, "design-language.md"), designResult.data.doc);

for (const component of components) {
  const queryComponent = queryAliases[component] ?? component;
  const queries = {
    info: runQuery("info", [queryComponent], { lang: true, required: true }),
    doc: runQuery("doc", [queryComponent], { lang: true, required: true }),
    demo: runQuery("demo", [queryComponent], { lang: true, required: false }),
    token: runQuery("token", [queryComponent], { lang: false, required: false }),
    semantic: runQuery("semantic", [queryComponent], { lang: false, required: false })
  };
  const reference = {
    version: "1.0.0",
    component,
    queryComponent,
    antdVersion,
    cliVersion,
    reviewedAt,
    queries: Object.fromEntries(
      Object.entries(queries).map(([name, result]) => [name, result.ok ? { status: "ok", data: result.data } : { status: "unsupported", error: result.error }])
    )
  };
  writeText(resolve(referenceRoot, `${component}.json`), JSON.stringify(reference, null, 2));
}

const authoredAssets = [
  { kind: "guide", id: "readme", path: "README.md" },
  { kind: "source-ledger", id: "sources", path: "sources.json" },
  { kind: "design-language", id: "design-language", path: "design-language.md" },
  { kind: "decision-cards", id: "decision-cards", path: "decision-cards.json" },
  { kind: "page-component-map", id: "page-component-map", path: "page-component-map.json" },
  { kind: "blog-curation", id: "blog-curation", path: "blog-curation.json" },
  { kind: "blog-index", id: "blog-index", path: "blog/index.json" },
  { kind: "blog-lint-rules", id: "blog-lint-rules", path: "blog-lint-rules.json" },
  { kind: "visual-regression-cases", id: "visual-regression-cases", path: "visual-regression-cases.json" },
  { kind: "upgrade-watch", id: "upgrade-watch", path: "upgrade-watch.json" },
  ...Object.entries(pageMap.templates).map(([id, template]) => ({ kind: "page-template", id, path: template.path })),
  ...components.map((component) => ({ kind: "component-reference", id: component, path: `component-reference/${component}.json` })),
  ...blogIndex.files.map((file) => ({ kind: "blog-source", id: file.repositoryPath, path: `blog/${file.path}` }))
];
const assets = authoredAssets
  .map((asset) => ({ ...asset, sha256: sha256(resolve(knowledgeRoot, asset.path)) }))
  .sort((a, b) => a.path.localeCompare(b.path));
const manifest = {
  version: "1.0.0",
  id: "antd-6.5.0-designer-knowledge",
  foundation: { id: "antd", version: antdVersion },
  cliVersion,
  reviewedAt,
  offline: true,
  counts: {
    decisionCards: decisions.cards.length,
    pageTemplates: Object.keys(pageMap.templates).length,
    componentReferences: components.length,
    blogArticles: blogIndex.articles.length,
    blogFiles: blogIndex.files.length,
    blogLintRules: blogLintRules.rules.length,
    visualRegressionCases: visualRegressionCases.cases.length,
    upgradeWatchItems: upgradeWatch.items.length,
    assets: assets.length
  },
  assets
};
writeText(resolve(knowledgeRoot, "manifest.json"), JSON.stringify(manifest, null, 2));

console.log(
  `built AntD knowledge pack: ${manifest.counts.decisionCards} decision cards, ${manifest.counts.pageTemplates} page templates, ${manifest.counts.componentReferences} component references, ${manifest.counts.blogArticles} Blog articles/${manifest.counts.blogFiles} files, manifest=${relative(kitRoot, resolve(knowledgeRoot, "manifest.json"))}`
);

function runQuery(command, args, options) {
  const commandArgs = [cliEntry, command, ...args, "--version", antdVersion, "--format", "json"];
  if (options.lang) commandArgs.push("--lang", "zh");
  const result = spawnSync(process.execPath, commandArgs, { cwd: kitRoot, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (result.status !== 0) {
    const error = (stderr || stdout || `exit ${result.status}`).trim();
    if (options.required) throw new Error(`${command} ${args.join(" ")} failed: ${error}`);
    return { ok: false, error };
  }
  const start = stdout.indexOf("{");
  if (start < 0) {
    if (options.required) throw new Error(`${command} ${args.join(" ")} returned no JSON`);
    return { ok: false, error: "CLI returned no JSON" };
  }
  try {
    return { ok: true, data: JSON.parse(stdout.slice(start)) };
  } catch (error) {
    if (options.required) throw new Error(`${command} ${args.join(" ")} returned invalid JSON: ${error.message}`);
    return { ok: false, error: error.message };
  }
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeText(file, value) {
  writeFileSync(file, `${String(value).replace(/\r\n/g, "\n").replace(/\n*$/, "")}\n`, "utf8");
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}
