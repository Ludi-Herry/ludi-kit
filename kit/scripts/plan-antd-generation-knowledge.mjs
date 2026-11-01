// 写代码前冻结 AntD 生成知识清单。
// 生成器路径从 project-description 的 content 推算组件；按页面卡直接编码的页面没有 content，
// 由项目在 generation-plan.json 里声明每页计划使用的 antd 组件，本命令据此解析知识包并写出 generation-knowledge.json。
// 用法：node scripts/plan-antd-generation-knowledge.mjs --project <projectId> [--out <dir>] [--allow-uncovered]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAntdGenerationInput, validateAntdKnowledgePack } from "./antd-knowledge.mjs";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));

try {
  run(args);
} catch (error) {
  console.error(`plan-antd-generation-knowledge failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

function run({ project, out, allowUncovered }) {
  if (!project) throw new Error("pass --project <projectId>");
  const projectRoot = resolve(kitRoot, "projects", project);
  const context = readJson(resolve(projectRoot, "business-context.json"));
  const foundation = context.frontendFoundation;
  if (foundation?.outputMode !== "library-native" || foundation?.foundation?.id !== "antd") {
    throw new Error(`${project} is not a library-native + antd project`);
  }
  const designPackPath = foundation.designPack.path;
  const designPack = readJson(resolve(kitRoot, designPackPath));
  const knowledge = validateAntdKnowledgePack({ root: kitRoot, designPack, designPackPath });

  const planFile = resolve(projectRoot, "generation-plan.json");
  if (!existsSync(planFile)) throw new Error(`${project}/generation-plan.json is missing`);
  const plan = readJson(planFile);
  const pagesDoc = readJson(resolve(projectRoot, "pages.json"));
  const pageById = new Map((pagesDoc.pages ?? []).map((page) => [page.id, page]));

  const planned = (plan.pages ?? []).map((entry) => {
    const page = pageById.get(entry.pageId);
    if (!page) throw new Error(`generation-plan.json references missing page ${entry.pageId}`);
    if (!Array.isArray(entry.antdComponents) || entry.antdComponents.length === 0) {
      throw new Error(`generation-plan.json page ${entry.pageId} needs antdComponents`);
    }
    return { page, components: [...new Set(entry.antdComponents)].sort() };
  });
  if (planned.length === 0) throw new Error("generation-plan.json declares no pages");

  // resolveAntdGenerationInput 需要 content 才能推算组件；这里给空 content，只借用模板、Blog 与视觉用例的选择，组件以计划为准。
  const output = resolveAntdGenerationInput(
    { projectId: project, pages: planned.map(({ page }) => ({ ...page, content: {} })) },
    knowledge
  );
  const uncoveredAll = [];
  output.pages = output.pages.map((resolved, index) => {
    const components = planned[index].components;
    const uncovered = components.filter((component) => !knowledge.referenceByComponent.has(component));
    uncoveredAll.push(...uncovered.map((component) => `${resolved.pageId}:${component}`));
    return {
      ...resolved,
      actualComponents: components,
      uncoveredComponents: uncovered,
      selectedDecisionCards: components.filter((component) => knowledge.cardByComponent.has(component)),
      componentReferences: components
        .filter((component) => knowledge.referenceByComponent.has(component))
        .map((component) => {
          const entry = knowledge.referenceByComponent.get(component);
          return { component, path: `foundations/knowledge/antd-6.5.0/${entry.asset.path}`, sha256: entry.asset.sha256 };
        })
    };
  });
  output.source = { kind: "generation-plan", path: `projects/${project}/generation-plan.json`, designPack: designPackPath };

  if (uncoveredAll.length > 0 && !allowUncovered) {
    throw new Error(`knowledge pack has no frozen reference for ${uncoveredAll.join(", ")}; extend the pack or pass --allow-uncovered`);
  }

  const outDir = resolve(kitRoot, out ?? `projects/${project}/generated`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "generation-knowledge.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(
    `plan-antd-generation-knowledge: ${project} ${output.pages.length} page(s) → ${resolve(outDir, "generation-knowledge.json")}` +
      (uncoveredAll.length ? `; uncovered ${uncoveredAll.join(", ")}` : "")
  );
}

function parseArgs(argv) {
  const result = { allowUncovered: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--project") result.project = argv[++index];
    else if (arg === "--out") result.out = argv[++index];
    else if (arg === "--allow-uncovered") result.allowUncovered = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  return result;
}

function readJson(file) {
  if (!existsSync(file)) throw new Error(`${file} is missing`);
  return JSON.parse(readFileSync(file, "utf8"));
}
