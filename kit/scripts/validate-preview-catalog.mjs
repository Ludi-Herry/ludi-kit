import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const componentsManifest = readJson("components.manifest.json");
const patternsManifest = readJson("patterns.manifest.json");
const actual = readJson("preview/src/catalog.compact.json");

const patternTitles = {
  "list-page": "列表页 List Page",
  "dashboard-page": "工作台 Dashboard",
  "detail-page": "详情页 Detail Page",
  "form-page": "表单页 Form Page",
  "analytics-dashboard": "分析看板 Analytics Dashboard",
  "situation-screen": "态势大屏 Situation Screen",
  "screen-publish-flow": "大屏发布 Screen Publish"
};

const expected = {
  components: componentsManifest.components.map((component) => ({
    name: component.name,
    category: component.category,
    role: component.layoutRole,
    useWhen: component.useWhen[0] ?? "按组件清单选择",
    variants: component.variants ?? ["default"]
  })),
  patterns: Object.entries(patternsManifest.patterns).map(([name, pattern]) => ({
    name,
    title: patternTitles[name] ?? name,
    useWhen: pattern.useWhen.join("、"),
    structure: [...pattern.layout]
  }))
};

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  console.error("validate-preview-catalog failed: preview/src/catalog.compact.json is stale; regenerate it from the component and pattern manifests");
  process.exit(1);
}

console.log(`validate-preview-catalog passed: ${actual.components.length} components, ${actual.patterns.length} patterns`);
