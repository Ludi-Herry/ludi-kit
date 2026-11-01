import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const knowledgeRoot = resolve(kitRoot, "foundations/knowledge/antd-6.5.0");
const blogRoot = resolve(knowledgeRoot, "blog");
const curation = readJson(resolve(knowledgeRoot, "blog-curation.json"));
const commit = readOption("--commit");

if (!/^[a-f0-9]{40}$/.test(commit ?? "")) {
  throw new Error("refresh-antd-blog requires --commit with an exact 40-character Ant Design repository commit");
}

const repository = "ant-design/ant-design";
const treeUrl = `https://api.github.com/repos/${repository}/git/trees/${commit}?recursive=1`;
const tree = await fetchJson(treeUrl);
if (tree.truncated) throw new Error(`GitHub tree is truncated for ${commit}`);

const blobs = (tree.tree ?? [])
  .filter((entry) => entry.type === "blob" && entry.path.startsWith("docs/blog/"))
  .sort((a, b) => a.path.localeCompare(b.path));
if (blobs.length === 0) throw new Error(`No docs/blog files found at ${commit}`);

const snapshotRoot = resolve(blogRoot, "snapshots", commit);
const downloaded = await mapLimit(blobs, 8, async (blob) => {
  const relativeSourcePath = blob.path.slice("docs/blog/".length);
  const rawUrl = `https://raw.githubusercontent.com/${repository}/${commit}/${blob.path}`;
  const response = await fetchWithRetry(rawUrl, { headers: { "user-agent": "Ludi-design-kit" } });
  if (!response.ok) throw new Error(`Failed to fetch ${rawUrl}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actualBlobSha = gitBlobSha(bytes);
  if (actualBlobSha !== blob.sha) throw new Error(`Git blob hash mismatch for ${blob.path}: expected=${blob.sha} actual=${actualBlobSha}`);
  const destination = resolve(snapshotRoot, relativeSourcePath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, bytes);
  return {
    repositoryPath: blob.path,
    path: `snapshots/${commit}/${relativeSourcePath}`,
    blobSha: blob.sha,
    sha256: sha256(bytes),
    bytes: bytes.length,
    mediaType: mediaType(relativeSourcePath),
    rawUrl
  };
});

const markdown = downloaded.filter((file) => /\.(en-US|zh-CN)\.md$/.test(file.path));
const localized = new Map();
for (const file of markdown) {
  const match = file.path.match(/\/([^/]+)\.(en-US|zh-CN)\.md$/);
  if (!match) continue;
  const [, id, locale] = match;
  const content = readFileSync(resolve(blogRoot, file.path), "utf8");
  const metadata = parseFrontmatter(content, file.path);
  const entry = localized.get(id) ?? {};
  entry[locale] = { ...file, locale, title: metadata.title, date: metadata.date, author: metadata.author };
  localized.set(id, entry);
}

const curatedById = new Map(curation.articles.map((article) => [article.id, article]));
const discoveredIds = [...localized.keys()].sort();
const missingCuration = discoveredIds.filter((id) => !curatedById.has(id));
const staleCuration = [...curatedById.keys()].filter((id) => !localized.has(id));
if (missingCuration.length || staleCuration.length) {
  throw new Error(`Blog curation drift: missing=[${missingCuration.join(", ")}] stale=[${staleCuration.join(", ")}]`);
}

const articles = discoveredIds.map((id) => {
  const locales = localized.get(id);
  if (!locales["zh-CN"] || !locales["en-US"]) throw new Error(`Blog article ${id} must have zh-CN and en-US sources`);
  if (locales["zh-CN"].date !== locales["en-US"].date) throw new Error(`Blog article ${id} has mismatched locale dates`);
  const curated = curatedById.get(id);
  return {
    id,
    title: { "zh-CN": locales["zh-CN"].title, "en-US": locales["en-US"].title },
    publishedAt: locales["zh-CN"].date,
    authors: [...new Set([locales["zh-CN"].author, locales["en-US"].author].filter(Boolean))],
    targetVersion: curation.targetVersion,
    categories: curated.categories,
    components: curated.components,
    topics: curated.topics,
    applicability: curated.applicability,
    selection: curated.selection,
    outputs: curated.outputs,
    sources: { "zh-CN": locales["zh-CN"], "en-US": locales["en-US"] }
  };
});

const index = {
  version: "1.0.0",
  id: "antd-official-blog",
  repository: `https://github.com/${repository}`,
  directory: "docs/blog",
  commit,
  treeUrl: `https://github.com/${repository}/tree/${commit}/docs/blog`,
  refreshedAt: "2026-07-22",
  targetVersion: curation.targetVersion,
  selectionPolicy: "Select localized articles by the components actually used by a page or by an explicit page-pattern match; maintenance-only articles stay out of routine generation input.",
  applicabilityPolicy: "The frozen 6.5.0 CLI remains authoritative for API details. Conditional and historical articles supply rationale, risks, and upgrade observations.",
  counts: {
    files: downloaded.length,
    markdownSources: markdown.length,
    articles: articles.length,
    supportSources: downloaded.length - markdown.length
  },
  files: downloaded,
  articles
};
mkdirSync(blogRoot, { recursive: true });
writeText(resolve(blogRoot, "index.json"), JSON.stringify(index, null, 2));

console.log(`refreshed AntD Blog: commit=${commit} files=${index.counts.files} articles=${index.counts.articles} index=${relative(kitRoot, resolve(blogRoot, "index.json"))}`);

function parseFrontmatter(content, path) {
  const match = content.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error(`${path} has no frontmatter`);
  const values = {};
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim().replace(/^['\"]|['\"]$/g, "");
  }
  for (const key of ["title", "date", "author"]) {
    if (!values[key]) throw new Error(`${path} frontmatter is missing ${key}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date)) throw new Error(`${path} has invalid date ${values.date}`);
  return values;
}

function mediaType(path) {
  if (path.endsWith(".md")) return "text/markdown";
  if ([".ts", ".tsx"].includes(extname(path))) return "text/typescript";
  return "application/octet-stream";
}

async function fetchJson(url) {
  const response = await fetchWithRetry(url, { headers: { accept: "application/vnd.github+json", "user-agent": "Ludi-design-kit" } });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.json();
}

async function fetchWithRetry(url, options) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok || response.status < 500) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < 3) await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 300));
  }
  throw new Error(`Failed to fetch ${url} after 3 attempts: ${lastError?.message ?? "unknown error"}`);
}

async function mapLimit(items, concurrency, work) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await work(items[index]);
      }
    })
  );
  return results;
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeText(file, value) {
  writeFileSync(file, `${String(value).replace(/\r\n/g, "\n").replace(/\n*$/, "")}\n`, "utf8");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function gitBlobSha(value) {
  return createHash("sha1").update(`blob ${value.length}\0`).update(value).digest("hex");
}
