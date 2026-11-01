import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export const INSPECT_SCHEMA_ID = "https://ai-readable.local/schema/ai-readable-inspect-output.schema.json";
export const INSPECT_SCHEMA_VERSION = "0.1.0";

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const FIXED_WRITE_POLICY = {
  mode: "read-only",
  source: "m0-inspect-contract",
  allowedWrites: [],
  reason: "M0 inspect does not authorize implementation writes."
};

export function inspectProjectPage({ kitRoot, projectId, pageId }) {
  const resolvedKitRoot = resolve(kitRoot);
  const repoRoot = dirname(resolvedKitRoot);

  try {
    assertId(projectId, "projectId");
    assertId(pageId, "pageId");

    const projectBase = `projects/${projectId}`;
    const contextPath = `${projectBase}/business-context.json`;
    const pagesPath = `${projectBase}/pages.json`;
    const flowsPath = `${projectBase}/flows.json`;
    const prdPath = `${projectBase}/prd.mdx`;
    const statusCopyPath = `${projectBase}/status-copy.md`;
    const agentsPath = "AGENTS.md";
    const componentsPath = "components.manifest.json";
    const patternsPath = "patterns.manifest.json";

    const context = readJsonInside(resolvedKitRoot, contextPath);
    const pagesDoc = readJsonInside(resolvedKitRoot, pagesPath);
    const flowsDoc = readJsonInside(resolvedKitRoot, flowsPath);
    const componentsDoc = readJsonInside(resolvedKitRoot, componentsPath);
    const patternsDoc = readJsonInside(resolvedKitRoot, patternsPath);

    validateProjectContext(context, contextPath);
    assertProjectIdentity(projectId, contextPath, context);
    assertProjectIdentity(projectId, pagesPath, pagesDoc);
    assertProjectIdentity(projectId, flowsPath, flowsDoc);
    requireFileInside(resolvedKitRoot, agentsPath);
    requireFileInside(resolvedKitRoot, prdPath);

    const pages = requireArray(pagesDoc.pages, `${pagesPath}.pages`);
    const page = pages.find((entry) => entry.id === pageId);
    if (!page) throw new InspectError("page-not-found", `Page ${pageId} is not registered for project ${projectId}.`, pagesPath);

    validatePage(page, pagesPath);

    const flowList = requireArray(flowsDoc.flows, `${flowsPath}.flows`);
    const flowById = new Map(flowList.map((flow) => [flow.id, flow]));
    const pageIds = new Set(pages.map((entry) => entry.id));
    const selectedFlows = page.flowIds.map((flowId) => {
      const flow = flowById.get(flowId);
      if (!flow) throw new InspectError("flow-not-found", `Page ${pageId} references missing flow ${flowId}.`, flowsPath);
      if (!flow.title || !flow.entry || !Array.isArray(flow.steps)) {
        throw new InspectError("flow-contract-invalid", `Flow ${flowId} is missing title, entry or steps.`, flowsPath);
      }
      for (const step of flow.steps ?? []) {
        if (!pageIds.has(step.pageId)) {
          throw new InspectError("flow-page-not-found", `Flow ${flowId} references missing page ${step.pageId}.`, flowsPath);
        }
      }
      return flow;
    });

    const patternContract = patternsDoc.patterns?.[page.pattern];
    if (!patternContract) {
      throw new InspectError("pattern-not-found", `Page ${pageId} references missing pattern ${page.pattern}.`, patternsPath);
    }

    const componentNames = new Set(requireArray(componentsDoc.components, `${componentsPath}.components`).map((entry) => entry.name));
    for (const componentName of page.componentPlan) {
      if (!componentNames.has(componentName)) {
        throw new InspectError(
          "component-not-found",
          `Page ${pageId} references missing component ${componentName}.`,
          componentsPath
        );
      }
    }

    const foundation = context.frontendFoundation;
    validateFoundation(foundation, contextPath);

    const designPackPath = foundation.designPack.path;
    const designPackFile = requireFileInside(resolvedKitRoot, designPackPath);
    const actualDesignPackHash = hashFile(designPackFile);
    if (actualDesignPackHash !== foundation.designPack.sha256) {
      throw new InspectError(
        "design-pack-hash-mismatch",
        `Design pack hash mismatch: expected ${foundation.designPack.sha256}, received ${actualDesignPackHash}.`,
        designPackPath
      );
    }

    const designPack = readJsonInside(resolvedKitRoot, designPackPath);
    const knowledgeManifest = resolveKnowledgeManifest(resolvedKitRoot, designPack);
    const recipePath = patternContract.relatedRecipe;
    if (!recipePath) throw new InspectError("recipe-not-registered", `Pattern ${page.pattern} has no relatedRecipe.`, patternsPath);
    requireFileInside(resolvedKitRoot, recipePath);

    const sourceMap = new Map();
    const requiredReads = [];
    const addRequiredRead = ({ path, authority, reason, selector }) => {
      const absolute = requireFileInside(resolvedKitRoot, path);
      const descriptor = {
        path: repoRelative(repoRoot, absolute),
        sha256: hashFile(absolute),
        authority,
        reason,
        ...(selector ? { selector } : {})
      };
      requiredReads.push(descriptor);
      if (!sourceMap.has(descriptor.path)) {
        sourceMap.set(descriptor.path, {
          path: descriptor.path,
          sha256: descriptor.sha256,
          authority,
          reason
        });
      }
    };

    addRequiredRead({ path: contextPath, authority: "project-contract", reason: "Project, boundary, foundation and adapter contract." });
    addRequiredRead({ path: agentsPath, authority: "agent-instructions", reason: "Required read order, constraints and acceptance discipline." });
    addRequiredRead({
      path: pagesPath,
      authority: "page-contract",
      reason: "Selected page goal, pattern, components, data and success criteria.",
      selector: { field: "pages.id", values: [pageId] }
    });
    addRequiredRead({
      path: flowsPath,
      authority: "flow-contract",
      reason: "Behavior chains referenced by the selected page.",
      selector: { field: "flows.id", values: page.flowIds }
    });
    addRequiredRead({ path: prdPath, authority: "local-business-source", reason: "Repository-local business requirement entry." });
    if (existsSync(resolveInside(resolvedKitRoot, statusCopyPath))) {
      addRequiredRead({ path: statusCopyPath, authority: "status-copy-contract", reason: "Project status labels and semantic tone mapping." });
    }
    addRequiredRead({ path: designPackPath, authority: "design-pack", reason: "Frozen design system distribution, framework and knowledge entry." });
    addRequiredRead({ path: patternsPath, authority: "pattern-contract", reason: "Selected pattern layout, locked regions and recipe routing." });
    addRequiredRead({ path: recipePath, authority: "page-recipe", reason: "Selected page composition recipe." });
    addRequiredRead({ path: componentsPath, authority: "component-catalog", reason: "Component existence and semantic catalog." });

    for (const rulePath of relevantRulePaths(resolvedKitRoot, page)) {
      addRequiredRead({ path: rulePath, authority: "design-rule", reason: `Rule selected for ${page.pattern} and its component plan.` });
    }

    if (knowledgeManifest) {
      addRequiredRead({
        path: knowledgeManifest.kitPath,
        authority: "foundation-knowledge",
        reason: "Frozen design-system knowledge manifest referenced by the design pack."
      });
    }

    const status = contextStatus(context);
    const exitCode = status === "ready" ? 0 : status === "needs-clarification" ? 2 : 3;
    const clarifications = buildClarifications(context, status);

    const result = {
      $schema: INSPECT_SCHEMA_ID,
      schemaVersion: INSPECT_SCHEMA_VERSION,
      command: "inspect",
      status,
      exitCode,
      repoRoot,
      scope: { projectId, pageId },
      project: {
        id: projectId,
        contextType: context.contextType,
        decision: context.decision,
        name: context.product.name,
        audience: context.product.audience,
        scenario: context.product.scenario
      },
      foundation: {
        outputMode: foundation.outputMode,
        framework: foundation.framework,
        designSystem: foundation.foundation,
        distribution: foundation.distribution,
        designPack: {
          path: repoRelative(repoRoot, designPackFile),
          sha256: actualDesignPackHash
        },
        knowledgeManifest: knowledgeManifest
          ? { path: repoRelative(repoRoot, knowledgeManifest.absolute), sha256: knowledgeManifest.sha256 }
          : null,
        imports: foundation.imports,
        adapters: foundation.adapters
      },
      page: {
        id: page.id,
        route: page.route,
        title: page.title,
        pattern: page.pattern,
        flowIds: page.flowIds,
        userGoal: page.flowCard.userGoal,
        pageGoal: page.intentCard.pageGoal,
        successCriteria: page.intentCard.successCriteria,
        componentPlan: page.componentPlan,
        dataRequirements: page.dataRequirements,
        layoutTree: page.layoutTree
      },
      flows: selectedFlows,
      pattern: {
        id: page.pattern,
        layout: patternContract.layout ?? [],
        regions: patternContract.regions ?? [],
        requiredComponents: patternContract.requiredComponents ?? [],
        optionalComponents: patternContract.optionalComponents ?? [],
        relatedRecipe: repoRelative(repoRoot, resolveInside(resolvedKitRoot, recipePath)),
        doNot: patternContract.doNot ?? []
      },
      criticalStates: context.criticalStates ?? [],
      sources: [...sourceMap.values()],
      requiredReads,
      writePolicy: FIXED_WRITE_POLICY,
      readiness: {
        context: status,
        implementation: status === "blocked" ? "blocked" : "needs-task-contract",
        reason: status === "blocked"
          ? "This project contract does not authorize real page implementation."
          : "Context can be inspected; implementation requires a separate task contract."
      },
      clarifications,
      validationProfiles: contractValidationProfiles(),
      errors: []
    };

    return { exitCode, result };
  } catch (error) {
    const normalized = error instanceof InspectError
      ? error
      : new InspectError("inspect-internal-error", error instanceof Error ? error.message : String(error));
    return {
      exitCode: 5,
      result: failureResult({ repoRoot, projectId, pageId, error: normalized })
    };
  }
}

export function failureResult({ repoRoot, projectId = null, pageId = null, error }) {
  return {
    $schema: INSPECT_SCHEMA_ID,
    schemaVersion: INSPECT_SCHEMA_VERSION,
    command: "inspect",
    status: "failed",
    exitCode: 5,
    repoRoot: resolve(repoRoot),
    scope: { projectId, pageId },
    sources: [],
    requiredReads: [],
    writePolicy: FIXED_WRITE_POLICY,
    readiness: {
      context: "failed",
      implementation: "blocked",
      reason: "The inspect contract is invalid or incomplete."
    },
    clarifications: [],
    validationProfiles: [],
    errors: [{
      code: error.code ?? "inspect-failed",
      message: error.message ?? String(error),
      ...(error.path ? { path: error.path } : {})
    }]
  };
}

function buildClarifications(context, status) {
  const clarifications = [{
    id: "task-write-contract",
    kind: "write-authorization",
    status: "required-before-write",
    impact: "high",
    message: "M0 inspect is read-only. Freeze allowedWrites in a separate task contract before implementation.",
    source: "m0-inspect-contract",
    blockingFor: "implementation"
  }];

  for (const [index, item] of (context.requiredBeforeRealWork ?? []).entries()) {
    clarifications.push({
      id: `required-before-real-work-${index + 1}`,
      kind: "missing-project-input",
      status: "required",
      impact: "high",
      message: item,
      source: "business-context.requiredBeforeRealWork",
      blockingFor: "context"
    });
  }

  if (status === "blocked") {
    clarifications.push({
      id: "real-product-contract-required",
      kind: "project-boundary",
      status: "blocked",
      impact: "high",
      message: "validation-sandbox projects may validate the pipeline but may not define a real page implementation task.",
      source: "business-context.contextType",
      blockingFor: "context"
    });
  }

  return clarifications;
}

function contextStatus(context) {
  if (context.contextType === "validation-sandbox") return "blocked";
  if ((context.requiredBeforeRealWork ?? []).length > 0) return "needs-clarification";
  return "ready";
}

function contractValidationProfiles() {
  return [{
    id: "contract",
    status: "available",
    proves: [
      "Registered project, page, flow, pattern and component references are internally consistent.",
      "Registered design-pack files and foundation knowledge satisfy repository validators."
    ],
    doesNotProve: [
      "The target page builds or runs in a browser.",
      "Visual quality or interaction behavior has been accepted.",
      "A human has approved implementation writes."
    ],
    commands: [
      { id: "project-contracts", cwd: "kit", argv: ["npm", "run", "validate:projects"] },
      { id: "foundation-contracts", cwd: "kit", argv: ["npm", "run", "validate:foundations"] }
    ]
  }];
}

function resolveKnowledgeManifest(kitRoot, designPack) {
  const registered = designPack.knowledge?.manifest;
  if (!registered?.path || !registered.sha256) return null;
  const absolute = requireFileInside(kitRoot, registered.path);
  const actual = hashFile(absolute);
  if (actual !== registered.sha256) {
    throw new InspectError(
      "knowledge-manifest-hash-mismatch",
      `Knowledge manifest hash mismatch: expected ${registered.sha256}, received ${actual}.`,
      registered.path
    );
  }
  return { kitPath: registered.path, absolute, sha256: actual };
}

function relevantRulePaths(kitRoot, page) {
  const paths = ["rules/anti-patterns.md", "rules/information-architecture.md", "rules/layout.md", "rules/interaction-decisions.md"];
  const components = new Set(page.componentPlan);

  if (components.has("DataGrid") || components.has("Table")) paths.push("rules/data-table.md");
  if (page.pattern.includes("dashboard")) paths.push("rules/dashboard.md");
  if (page.pattern === "detail-page") paths.push("rules/detail-page.md");
  if (page.pattern === "form-page" || components.has("FormSection")) paths.push("rules/form.md");

  return [...new Set(paths)].filter((path) => existsSync(resolveInside(kitRoot, path)));
}

function validatePage(page, pagesPath) {
  for (const field of ["id", "route", "title", "pattern"]) {
    if (typeof page[field] !== "string" || page[field].length === 0) {
      throw new InspectError("page-contract-invalid", `Page field ${field} is required.`, pagesPath);
    }
  }
  for (const field of ["flowIds", "componentPlan", "dataRequirements", "layoutTree"]) {
    requireArray(page[field], `page.${field}`);
  }
  if (!page.flowCard?.userGoal || !page.intentCard?.pageGoal || !Array.isArray(page.intentCard?.successCriteria)) {
    throw new InspectError("page-contract-invalid", "Page flowCard and intentCard are incomplete.", pagesPath);
  }
}

function validateProjectContext(context, path) {
  if (!["validation-sandbox", "real-product"].includes(context.contextType)) {
    throw new InspectError("project-contract-invalid", "contextType must be validation-sandbox or real-product.", path);
  }
  if (!context.decision || !context.product?.name || !Array.isArray(context.product?.audience) || !context.product?.scenario) {
    throw new InspectError("project-contract-invalid", "Project decision and product name, audience and scenario are required.", path);
  }
  if (context.requiredBeforeRealWork !== undefined && !Array.isArray(context.requiredBeforeRealWork)) {
    throw new InspectError("project-contract-invalid", "requiredBeforeRealWork must be an array when provided.", path);
  }
}

function validateFoundation(foundation, path) {
  if (
    !foundation?.outputMode
    || !foundation.framework?.name
    || !foundation.framework.version
    || !foundation.foundation?.id
    || !foundation.foundation.displayName
    || !foundation.foundation.version
    || !foundation.foundation.packageName
    || !foundation.distribution
    || !foundation.designPack?.path
    || !foundation.designPack.sha256
    || !foundation.imports
    || !foundation.adapters
  ) {
    throw new InspectError("foundation-contract-invalid", "frontendFoundation is incomplete.", path);
  }
}

function assertProjectIdentity(projectId, path, value) {
  if (value.projectId !== projectId) {
    throw new InspectError("project-id-mismatch", `${path} projectId must equal ${projectId}.`, path);
  }
}

function assertId(value, field) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw new InspectError("invalid-argument", `${field} must match ${ID_PATTERN}.`);
  }
}

function requireArray(value, field) {
  if (!Array.isArray(value)) throw new InspectError("contract-invalid", `${field} must be an array.`);
  return value;
}

function readJsonInside(kitRoot, path) {
  const absolute = requireFileInside(kitRoot, path);
  try {
    return JSON.parse(readFileSync(absolute, "utf8"));
  } catch (error) {
    throw new InspectError("invalid-json", `${path} is not valid JSON: ${error.message}`, path);
  }
}

function requireFileInside(kitRoot, path) {
  const absolute = resolveInside(kitRoot, path);
  if (!existsSync(absolute)) throw new InspectError("file-not-found", `Required file is missing: ${path}.`, path);
  return absolute;
}

function resolveInside(base, path) {
  if (typeof path !== "string" || path.length === 0 || isAbsolute(path)) {
    throw new InspectError("invalid-contract-path", `Contract path must be relative: ${path}.`, String(path));
  }
  const absolute = resolve(base, path);
  const rel = relative(resolve(base), absolute);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new InspectError("path-outside-kit", `Contract path escapes the kit root: ${path}.`, path);
  }
  return absolute;
}

function repoRelative(repoRoot, absolute) {
  return relative(repoRoot, absolute).split(sep).join("/");
}

function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

class InspectError extends Error {
  constructor(code, message, path) {
    super(message);
    this.code = code;
    this.path = path;
  }
}
