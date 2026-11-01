import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateAntdKnowledgePack } from "./antd-knowledge.mjs";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const designPackPath = "foundations/design-packs/antd-6.5.0.json";
const designPack = JSON.parse(readFileSync(resolve(kitRoot, designPackPath), "utf8"));

try {
  const validated = validateAntdKnowledgePack({ root: kitRoot, designPack, designPackPath });
  console.log(
    `validate-antd-knowledge passed: ${validated.cardByComponent.size} decision cards, ${Object.keys(validated.pageMap.templates).length} page templates, ${validated.referenceByComponent.size} component references, ${validated.assets.size} hashed assets`
  );
} catch (error) {
  console.error(`validate-antd-knowledge failed: ${error.message}`);
  process.exitCode = 1;
}
