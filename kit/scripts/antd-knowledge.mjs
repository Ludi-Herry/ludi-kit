import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export function validateAntdKnowledgePack({ root, designPack, designPackPath = "design pack" }) {
  const knowledge = designPack?.knowledge;
  if (!knowledge || typeof knowledge !== "object") {
    throw new Error(`${designPackPath}: AntD design pack must define knowledge`);
  }
  if (knowledge.id !== "antd-6.5.0-designer-knowledge") {
    throw new Error(`${designPackPath}: unexpected AntD knowledge id ${knowledge.id}`);
  }

  const manifestPointer = knowledge.manifest;
  if (!manifestPointer?.path || !SHA256_PATTERN.test(manifestPointer.sha256 ?? "")) {
    throw new Error(`${designPackPath}: knowledge manifest path and sha256 are required`);
  }
  const manifestFile = resolveWithin(root, manifestPointer.path, "knowledge manifest");
  assertFileHash(manifestFile, manifestPointer.sha256, `${designPackPath}: knowledge manifest`);
  const manifest = readJson(manifestFile, "knowledge manifest");
  if (manifest.id !== knowledge.id) throw new Error(`${designPackPath}: knowledge manifest id mismatch`);
  if (manifest.foundation?.id !== "antd" || manifest.foundation?.version !== "6.5.0") {
    throw new Error(`${designPackPath}: knowledge manifest must target antd@6.5.0`);
  }
  if (manifest.cliVersion !== "6.5.1") {
    throw new Error(`${designPackPath}: knowledge manifest must record @ant-design/cli@6.5.1`);
  }

  const knowledgeRoot = resolve(manifestFile, "..");
  const assets = new Map();
  for (const asset of manifest.assets ?? []) {
    if (!asset?.path || !asset?.kind || !asset?.id || !SHA256_PATTERN.test(asset.sha256 ?? "")) {
      throw new Error(`${designPackPath}: invalid knowledge asset entry`);
    }
    if (assets.has(asset.path)) throw new Error(`${designPackPath}: duplicate knowledge asset path ${asset.path}`);
    const file = resolveWithin(knowledgeRoot, asset.path, `knowledge asset ${asset.path}`);
    assertFileHash(file, asset.sha256, `${designPackPath}: knowledge asset ${asset.path}`);
    assets.set(asset.path, { ...asset, file });
  }

  const requiredAssetPaths = [
    "README.md",
    "sources.json",
    "design-language.md",
    "decision-cards.json",
    "page-component-map.json",
    "blog-curation.json",
    "blog/index.json",
    "blog-lint-rules.json",
    "visual-regression-cases.json",
    "upgrade-watch.json"
  ];
  for (const requiredPath of requiredAssetPaths) {
    if (!assets.has(requiredPath)) throw new Error(`${designPackPath}: knowledge manifest missing ${requiredPath}`);
  }

  // An additive extension may point at a superset decision-cards file; the base pack keeps the default path.
  const decisionCardsPath = manifest.extension?.decisionCardsAsset ?? "decision-cards.json";
  if (!assets.has(decisionCardsPath)) throw new Error(`${designPackPath}: knowledge manifest missing ${decisionCardsPath}`);
  const decisions = readJson(assets.get(decisionCardsPath).file, "decision cards");
  const cards = decisions.cards ?? [];
  if (cards.length < 20) throw new Error(`${designPackPath}: expected at least 20 AntD decision cards, found ${cards.length}`);
  const cardByComponent = new Map();
  for (const card of cards) {
    if (!card?.component || cardByComponent.has(card.component)) {
      throw new Error(`${designPackPath}: decision-card component names must be present and unique`);
    }
    for (const key of ["useWhen", "avoidWhen", "defaults", "states", "composition", "responsive", "a11y", "antiPatterns"]) {
      if (!Array.isArray(card[key]) || card[key].length === 0) {
        throw new Error(`${designPackPath}: ${card.component} decision card must define ${key}`);
      }
    }
    cardByComponent.set(card.component, card);
  }

  const pageMap = readJson(assets.get("page-component-map.json").file, "page component map");
  for (const [templateId, template] of Object.entries(pageMap.templates ?? {})) {
    if (!assets.has(template.path)) throw new Error(`${designPackPath}: template ${templateId} is missing hashed asset ${template.path}`);
    if (!Array.isArray(template.components) || template.components.length === 0) {
      throw new Error(`${designPackPath}: template ${templateId} must list components`);
    }
  }

  const referenceByComponent = new Map();
  for (const asset of assets.values()) {
    if (asset.kind !== "component-reference") continue;
    const reference = readJson(asset.file, `component reference ${asset.id}`);
    if (reference.component !== asset.id || reference.antdVersion !== "6.5.0" || reference.cliVersion !== "6.5.1") {
      throw new Error(`${designPackPath}: invalid component reference metadata for ${asset.id}`);
    }
    for (const requiredQuery of ["info", "doc"]) {
      if (reference.queries?.[requiredQuery]?.status !== "ok") {
        throw new Error(`${designPackPath}: ${asset.id} ${requiredQuery} query is not frozen successfully`);
      }
    }
    referenceByComponent.set(asset.id, { asset, reference });
  }

  const requiredReferences = new Set(cards.map((card) => card.component));
  for (const template of Object.values(pageMap.templates ?? {})) {
    for (const component of template.components) requiredReferences.add(component);
  }
  for (const component of requiredReferences) {
    if (!referenceByComponent.has(component)) {
      throw new Error(`${designPackPath}: missing frozen CLI reference for ${component}`);
    }
  }

  const sourceLedger = readJson(assets.get("sources.json").file, "source ledger");
  const blogCuration = readJson(assets.get("blog-curation.json").file, "Blog curation");
  const blogIndex = readJson(assets.get("blog/index.json").file, "Blog index");
  const blogLintRules = readJson(assets.get("blog-lint-rules.json").file, "Blog lint rules");
  const visualRegressionCases = readJson(assets.get("visual-regression-cases.json").file, "visual regression cases");
  const upgradeWatch = readJson(assets.get("upgrade-watch.json").file, "upgrade watch");
  if (!/^[a-f0-9]{40}$/.test(blogIndex.commit ?? "")) throw new Error(`${designPackPath}: Blog index must pin an exact commit`);
  if (blogIndex.targetVersion !== "6.5.0" || blogCuration.targetVersion !== "6.5.0") {
    throw new Error(`${designPackPath}: Blog index and curation must target 6.5.0`);
  }
  if (sourceLedger.versionedSnapshots?.officialBlog?.commit !== blogIndex.commit) {
    throw new Error(`${designPackPath}: Blog source-ledger commit does not match the frozen index`);
  }
  const blogFiles = new Map();
  for (const fileEntry of blogIndex.files ?? []) {
    if (!fileEntry?.repositoryPath?.startsWith("docs/blog/") || !fileEntry.path?.startsWith(`snapshots/${blogIndex.commit}/`)) {
      throw new Error(`${designPackPath}: invalid Blog file path ${fileEntry?.path}`);
    }
    if (!SHA256_PATTERN.test(fileEntry.sha256 ?? "") || !/^[a-f0-9]{40}$/.test(fileEntry.blobSha ?? "")) {
      throw new Error(`${designPackPath}: Blog file ${fileEntry.repositoryPath} is missing source hashes`);
    }
    const assetPath = `blog/${fileEntry.path}`;
    const asset = assets.get(assetPath);
    if (!asset || asset.kind !== "blog-source" || asset.sha256 !== fileEntry.sha256) {
      throw new Error(`${designPackPath}: Blog file ${fileEntry.repositoryPath} is not frozen as a matching manifest asset`);
    }
    if (gitBlobHash(asset.file) !== fileEntry.blobSha) {
      throw new Error(`${designPackPath}: Blog file ${fileEntry.repositoryPath} does not match its Git blob hash`);
    }
    blogFiles.set(fileEntry.repositoryPath, fileEntry);
  }
  if ((blogIndex.files ?? []).length < 75 || (blogIndex.articles ?? []).length < 36) {
    throw new Error(`${designPackPath}: Blog snapshot is incomplete`);
  }
  if (blogIndex.counts?.files !== blogIndex.files.length || blogIndex.counts?.articles !== blogIndex.articles.length) {
    throw new Error(`${designPackPath}: Blog index counts do not match its entries`);
  }

  const categorySet = new Set(blogCuration.classification ?? []);
  const applicabilitySet = new Set(blogCuration.applicabilityStatuses ?? []);
  const selectionModeSet = new Set(blogCuration.selectionModes ?? []);
  const outputKindSet = new Set(blogCuration.outputKinds ?? []);
  const lintRuleIds = uniqueIds(blogLintRules.rules, "Blog lint rule", designPackPath);
  const visualCaseIds = uniqueIds(visualRegressionCases.cases, "visual regression case", designPackPath);
  uniqueIds(upgradeWatch.items, "upgrade-watch item", designPackPath);
  for (const rule of blogLintRules.rules ?? []) {
    if (!rule.severity || !rule.enforcement || !Array.isArray(rule.sourceArticles) || !rule.requirement) {
      throw new Error(`${designPackPath}: Blog lint rule ${rule.id} is incomplete`);
    }
  }
  for (const testCase of visualRegressionCases.cases ?? []) {
    if (!Array.isArray(testCase.sourceArticles) || !Array.isArray(testCase.assertions) || testCase.assertions.length === 0) {
      throw new Error(`${designPackPath}: visual regression case ${testCase.id} is incomplete`);
    }
  }
  for (const item of upgradeWatch.items ?? []) {
    if (!Array.isArray(item.sourceArticles) || !item.trigger || !item.action) {
      throw new Error(`${designPackPath}: upgrade-watch item ${item.id} is incomplete`);
    }
  }

  const curatedById = new Map((blogCuration.articles ?? []).map((article) => [article.id, article]));
  const blogArticleById = new Map();
  for (const article of blogIndex.articles ?? []) {
    if (!article?.id || blogArticleById.has(article.id) || !curatedById.has(article.id)) {
      throw new Error(`${designPackPath}: Blog article ids must be curated and unique`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(article.publishedAt ?? "") || article.targetVersion !== "6.5.0") {
      throw new Error(`${designPackPath}: Blog article ${article.id} has invalid date or target version`);
    }
    if (!Array.isArray(article.categories) || article.categories.length === 0 || article.categories.some((value) => !categorySet.has(value))) {
      throw new Error(`${designPackPath}: Blog article ${article.id} has an invalid category`);
    }
    if (!Array.isArray(article.components) || !Array.isArray(article.topics) || article.topics.length === 0) {
      throw new Error(`${designPackPath}: Blog article ${article.id} must record components and topics`);
    }
    if (!applicabilitySet.has(article.applicability?.status) || !article.applicability?.basis) {
      throw new Error(`${designPackPath}: Blog article ${article.id} has invalid applicability`);
    }
    if (!selectionModeSet.has(article.selection?.mode)) {
      throw new Error(`${designPackPath}: Blog article ${article.id} has invalid selection mode`);
    }
    if (article.selection.mode === "page-pattern" && (!Array.isArray(article.selection.pagePatterns) || article.selection.pagePatterns.length === 0)) {
      throw new Error(`${designPackPath}: Blog article ${article.id} must list page patterns`);
    }
    for (const locale of ["zh-CN", "en-US"]) {
      const source = article.sources?.[locale];
      const file = blogFiles.get(source?.repositoryPath);
      if (!source || source.locale !== locale || !file || source.sha256 !== file.sha256) {
        throw new Error(`${designPackPath}: Blog article ${article.id} has invalid ${locale} source`);
      }
    }
    for (const output of article.outputs ?? []) {
      if (!outputKindSet.has(output.kind) || !output.target) throw new Error(`${designPackPath}: Blog article ${article.id} has an invalid output`);
      if (output.kind === "decision-card" && !cardByComponent.has(output.target)) {
        throw new Error(`${designPackPath}: Blog article ${article.id} targets missing decision card ${output.target}`);
      }
      if (output.kind === "lint-rule" && !lintRuleIds.has(output.target)) {
        throw new Error(`${designPackPath}: Blog article ${article.id} targets missing lint rule ${output.target}`);
      }
      if (output.kind === "visual-regression-case" && !visualCaseIds.has(output.target)) {
        throw new Error(`${designPackPath}: Blog article ${article.id} targets missing visual case ${output.target}`);
      }
    }
    blogArticleById.set(article.id, article);
  }
  if (blogArticleById.size !== curatedById.size) {
    throw new Error(`${designPackPath}: Blog curation and index article counts differ`);
  }

  const designLanguage = readFileSync(assets.get("design-language.md").file, "utf8");
  if (designLanguage.split(/\r?\n/).length < 250 || !designLanguage.includes("Ant Design v6")) {
    throw new Error(`${designPackPath}: frozen design language is incomplete`);
  }

  return {
    knowledge,
    manifest,
    manifestPointer,
    manifestFile,
    knowledgeRoot,
    assets,
    decisionCardsPath,
    decisions,
    cardByComponent,
    pageMap,
    referenceByComponent,
    sourceLedger,
    blogCuration,
    blogIndex,
    blogArticleById,
    blogLintRules,
    visualRegressionCases,
    upgradeWatch
  };
}

export function resolveAntdGenerationInput(description, validatedKnowledge) {
  const pages = description.pages.map((page) => {
    const template = validatedKnowledge.pageMap.templates?.[page.pattern];
    if (!template) throw new Error(`AntD knowledge has no page template for ${page.pattern}`);
    const actualComponents = antComponentsForPage(page);
    const templateAsset = requiredAsset(validatedKnowledge, template.path);
    const decisionAsset = requiredAsset(validatedKnowledge, validatedKnowledge.decisionCardsPath);
    const selectedDecisionCards = actualComponents.filter((component) => validatedKnowledge.cardByComponent.has(component));
    const componentReferences = actualComponents.map((component) => {
      const entry = validatedKnowledge.referenceByComponent.get(component);
      if (!entry) throw new Error(`AntD knowledge has no frozen CLI reference for generated component ${component}`);
      return {
        component,
        path: `foundations/knowledge/antd-6.5.0/${entry.asset.path}`,
        sha256: entry.asset.sha256
      };
    });
    const selectedBlogArticles = [...validatedKnowledge.blogArticleById.values()]
      .filter((article) => articleMatchesPage(article, page, actualComponents))
      .map((article) => {
        const source = article.sources["zh-CN"];
        const sourceAsset = requiredAsset(validatedKnowledge, `blog/${source.path}`);
        return {
          id: article.id,
          title: article.title["zh-CN"],
          publishedAt: article.publishedAt,
          categories: article.categories,
          components: article.components,
          topics: article.topics,
          applicability: article.applicability,
          outputs: article.outputs,
          source: {
            path: `foundations/knowledge/antd-6.5.0/blog/${source.path}`,
            sha256: sourceAsset.sha256,
            repositoryPath: source.repositoryPath
          }
        };
      });
    const selectedVisualRegressionCases = (validatedKnowledge.visualRegressionCases.cases ?? [])
      .filter((testCase) => caseMatchesPage(testCase, page, actualComponents))
      .map((testCase) => testCase.id);
    return {
      pageId: page.id,
      pattern: page.pattern,
      pageTemplate: {
        path: `foundations/knowledge/antd-6.5.0/${template.path}`,
        sha256: templateAsset.sha256
      },
      actualComponents,
      recommendedComponents: template.components,
      selectedDecisionCards,
      decisionCards: {
        path: `foundations/knowledge/antd-6.5.0/${validatedKnowledge.decisionCardsPath}`,
        sha256: decisionAsset.sha256
      },
      componentReferences,
      blogArticles: selectedBlogArticles,
      visualRegressionCases: {
        path: "foundations/knowledge/antd-6.5.0/visual-regression-cases.json",
        sha256: requiredAsset(validatedKnowledge, "visual-regression-cases.json").sha256,
        selected: selectedVisualRegressionCases
      }
    };
  });

  return {
    version: "1.0.0",
    kind: "frozen-antd-generation-input",
    projectId: description.projectId,
    foundation: {
      id: "antd",
      version: "6.5.0",
      knowledgeId: validatedKnowledge.manifest.id,
      manifest: validatedKnowledge.manifestPointer
    },
    requiredReadOrder: ["design-language", "page-template", "decision-cards", "component-references", "blog-articles", "visual-regression-cases"],
    pages
  };
}

export function antComponentsForDescription(description) {
  return [...new Set(description.pages.flatMap(antComponentsForPage))].sort();
}

export function antComponentsForPage(page) {
  const components = new Set(["Button", "Card", "ConfigProvider", "Space", "Typography"]);
  if (page.pattern === "dashboard-page") {
    for (const component of ["Col", "Row", "Statistic"]) components.add(component);
    if (page.content.analytics) {
      components.add("Alert");
      components.add("Tag");
    }
  }
  if (page.pattern === "list-page") {
    components.add("Form");
    components.add("Table");
    for (const filter of page.content.filters ?? []) {
      if (filter.type === "select") components.add("Select");
      else if (filter.type === "date-range") components.add("DatePicker");
      else if (filter.type === "switch") components.add("Switch");
      else components.add("Input");
    }
    if (page.content.operationalList) {
      for (const component of ["Alert", "Descriptions", "Drawer", "Empty", "Steps", "Tabs", "Tag", "Upload"]) components.add(component);
      for (const field of page.content.operationalList.primaryDrawer.fields) {
        if (field.control === "select") components.add("Select");
        else if (field.control === "date-range") components.add("DatePicker");
        else if (field.control === "radio") components.add("Radio");
        else components.add("Input");
      }
    }
  }
  if (page.pattern === "detail-page") {
    if (page.content.permissionState) {
      components.add("Alert");
      components.add("Drawer");
    } else {
      components.add("Descriptions");
    }
  }
  if (page.pattern === "form-page") {
    components.add("Form");
    if (page.content.formPresentation) components.add("Steps");
    for (const field of page.content.fields ?? []) {
      if (field.control === "select") components.add("Select");
      else if (field.control === "date-range") components.add("DatePicker");
      else if (field.control === "radio") components.add("Radio");
      else components.add("Input");
    }
  }
  return [...components].sort();
}

export function hashFile(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function gitBlobHash(file) {
  const value = readFileSync(file);
  return createHash("sha1").update(`blob ${value.length}\0`).update(value).digest("hex");
}

function requiredAsset(validatedKnowledge, path) {
  const asset = validatedKnowledge.assets.get(path);
  if (!asset) throw new Error(`AntD knowledge manifest missing ${path}`);
  return asset;
}

function articleMatchesPage(article, page, actualComponents) {
  if (article.selection.mode === "maintenance-only") return false;
  if (article.selection.mode === "page-pattern") return article.selection.pagePatterns.includes(page.pattern);
  return article.components.some((component) => actualComponents.includes(component));
}

function caseMatchesPage(testCase, page, actualComponents) {
  const patterns = testCase.pagePatterns ?? [];
  const components = testCase.components ?? [];
  const patternMatches = patterns.length === 0 || patterns.includes(page.pattern);
  const componentMatches = components.length === 0 || components.some((component) => actualComponents.includes(component));
  return patternMatches && componentMatches;
}

function uniqueIds(entries, label, designPackPath) {
  const ids = new Set();
  for (const entry of entries ?? []) {
    if (!entry?.id || ids.has(entry.id)) throw new Error(`${designPackPath}: ${label} ids must be present and unique`);
    ids.add(entry.id);
  }
  return ids;
}

function assertFileHash(file, expected, label) {
  if (!existsSync(file)) throw new Error(`${label} is missing: ${file}`);
  const actual = hashFile(file);
  if (actual !== expected) throw new Error(`${label} hash drift: expected=${expected} actual=${actual}`);
}

function resolveWithin(base, path, label) {
  if (typeof path !== "string" || path.length === 0 || isAbsolute(path)) {
    throw new Error(`${label} must use a non-empty relative path`);
  }
  const target = resolve(base, path);
  const rel = relative(base, target);
  if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..\\`) || rel.startsWith("../")) {
    throw new Error(`${label} escapes its root: ${path}`);
  }
  return target;
}

function readJson(file, label) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}
