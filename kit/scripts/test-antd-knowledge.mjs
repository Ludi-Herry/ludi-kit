import { appendFileSync, cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateAntdKnowledgePack } from "./antd-knowledge.mjs";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = resolve(kitRoot, `foundations/.tmp-antd-knowledge-${process.pid}`);
const sourceKnowledge = resolve(kitRoot, "foundations/knowledge/antd-6.5.0");
const copiedKnowledge = resolve(tempRoot, "foundations/knowledge/antd-6.5.0");
const designPackPath = "foundations/design-packs/antd-6.5.0.json";
const designPack = JSON.parse(readFileSync(resolve(kitRoot, designPackPath), "utf8"));

try {
  mkdirSync(dirname(copiedKnowledge), { recursive: true });
  cpSync(sourceKnowledge, copiedKnowledge, { recursive: true });
  validateAntdKnowledgePack({ root: tempRoot, designPack, designPackPath });

  const blogIndex = JSON.parse(readFileSync(resolve(copiedKnowledge, "blog/index.json"), "utf8"));
  const buttonArticle = blogIndex.articles.find((article) => article.id === "button-loading-animation");
  if (!buttonArticle) throw new Error("frozen Blog index is missing button-loading-animation");
  appendFileSync(resolve(copiedKnowledge, "blog", buttonArticle.sources["zh-CN"].path), "\nintentional hash drift\n", "utf8");
  let driftFailed = false;
  try {
    validateAntdKnowledgePack({ root: tempRoot, designPack, designPackPath });
  } catch (error) {
    driftFailed = error.message.includes("hash drift");
  }
  if (!driftFailed) throw new Error("tampered AntD knowledge asset did not fail closed");

  console.log("test-antd-knowledge passed: complete Blog pack accepted; frozen article drift rejected before generation");
} finally {
  const rel = relative(resolve(kitRoot, "foundations"), tempRoot);
  if (rel && rel !== ".." && !rel.startsWith(`..\\`) && !rel.startsWith("../")) {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
