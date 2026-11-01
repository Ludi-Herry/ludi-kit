import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if ([".ts", ".tsx", ".css"].includes(extname(entry.name))) files.push(path);
  }
  return files;
}

const files = await walk(sourceRoot);
const checks = [
  ["no telemetry", /analytics|telemetry|segment\.com|sentry\.io/i],
  ["no AMap Skill import", /amap-jsapi-skill|openclaw/i],
  ["no static map fallback", /map-(?:svg|png)-fallback|setupSvgFallback/i],
];
const failures = [];
for (const file of files) {
  const text = await readFile(file, "utf8");
  for (const [label, pattern] of checks) {
    if (pattern.test(text)) failures.push(`${relative(root, file)}: ${label}`);
  }
}

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
if (!/lazy\(\(\)\s*=>\s*import\("\.\/map\/ThreeSituationMap"\)\)/.test(app)) {
  failures.push("src/App.tsx: ThreeSituationMap must stay behind React.lazy");
}
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
if (/\.map-host\s*\{[^}]*?(?:width\s*:\s*1920px|height\s*:\s*1080px)/is.test(styles)) {
  failures.push("src/styles.css: map host must fill its parent");
}
const registry = await readFile(new URL("../src/map/renderer-registry.ts", import.meta.url), "utf8");
if (!/"beauti-map"[\s\S]*?admitted:\s*false/.test(registry)) {
  failures.push("src/map/renderer-registry.ts: BeautiMap must remain excluded");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`situation-screen source lint: ${files.length} files OK`);
