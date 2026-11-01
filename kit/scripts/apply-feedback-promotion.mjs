import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const projectsDir = resolve(root, "projects");
const args = process.argv.slice(2);
const itemId = args.find((arg) => !arg.startsWith("--"));
const dryRun = args.includes("--dry-run") || !args.includes("--apply");
const writePlan = args.includes("--write-plan");

if (!itemId) {
  console.error("apply-promotion failed: pass a feedback id, for example fb-20260707-002");
  process.exit(1);
}

if (args.includes("--apply")) {
  console.error("apply-promotion failed: source apply is not enabled yet. Use --dry-run --write-plan.");
  process.exit(1);
}

const context = findFeedbackItem(itemId);
if (!context) {
  console.error(`apply-promotion failed: feedback item not found: ${itemId}`);
  process.exit(1);
}

const plan = buildApplicationPlan(context);

if (!dryRun) {
  console.error("apply-promotion failed: only dry-run mode is supported");
  process.exit(1);
}

if (writePlan) {
  writeApplicationPlan(context, plan);
}

console.log(
  `apply-promotion dry-run passed: ${plan.itemId}, ${plan.willChangeFiles.length} files, ${plan.validationCommands.length} checks`
);

function findFeedbackItem(id) {
  if (!existsSync(projectsDir)) return null;

  for (const projectName of readdirSync(projectsDir)) {
    const projectRoot = `projects/${projectName}`;
    const feedbackRoot = `${projectRoot}/feedback`;
    const queueFile = `${feedbackRoot}/queue.json`;
    const rulesFile = `${feedbackRoot}/promotion-rules.json`;
    const draftsIndexFile = `${feedbackRoot}/promotions/index.json`;

    if (!exists(queueFile) || !exists(rulesFile) || !exists(draftsIndexFile)) continue;

    const queue = readJson(queueFile);
    const item = (queue.items ?? []).find((candidate) => candidate.id === id);
    if (!item) continue;

    const promotionRules = readJson(rulesFile);
    const draftsIndex = readJson(draftsIndexFile);
    const gate = (promotionRules.gates ?? []).find((candidate) => candidate.target === item.target);
    const draft = (draftsIndex.drafts ?? []).find((candidate) => candidate.itemId === item.id);

    if (item.status !== "accepted" && item.status !== "promoted") {
      throw new Error(`${queueFile}: ${item.id} must be accepted or promoted before apply dry-run`);
    }
    if (!gate) throw new Error(`${rulesFile}: ${item.target} has no promotion gate`);
    if (!draft) throw new Error(`${draftsIndexFile}: ${item.id} has no promotion draft`);

    return {
      projectName,
      projectRoot,
      feedbackRoot,
      queueFile,
      rulesFile,
      draftsIndexFile,
      item,
      gate,
      draft
    };
  }

  return null;
}

function buildApplicationPlan(context) {
  const { item, gate, draft, feedbackRoot, draftsIndexFile, projectName } = context;
  const applicationsRoot = `${feedbackRoot}/promotions/applications`;
  const planFile = `${applicationsRoot}/${item.id}.json`;
  const patchFile = `${applicationsRoot}/${item.id}.diff`;
  const patchPreview = buildPatchPreview(item, draft);
  const willChangeFiles = extractPatchFiles(patchPreview);

  const blockedFiles = willChangeFiles.filter((file) => !destinationAllowed(file, gate.allowedDestinations));
  if (blockedFiles.length > 0) {
    throw new Error(`${item.id}: patch preview includes files outside promotion gate: ${blockedFiles.join(", ")}`);
  }

  return {
    version: "0.1.0",
    projectId: projectName,
    generatedAt: item.reviewedAt ?? item.createdAt,
    itemId: item.id,
    title: item.title,
    mode: "dry-run",
    status: "ready",
    sourceDraft: draft.draftFile,
    planFile,
    patchFile,
    action: item.promotion.action,
    target: item.target,
    destination: item.promotion.destination,
    allowedDestinations: gate.allowedDestinations,
    willChangeFiles,
    guardrails: [
      "Dry-run mode writes only application plan artifacts.",
      "Every planned source file must match promotion gate allowed destinations.",
      "Only accepted or promoted feedback items can produce application plans.",
      "Run validation and build commands before marking the feedback item promoted."
    ],
    validationCommands: buildValidationCommands(item),
    command: `npm run apply:promotion -- ${item.id} --dry-run --write-plan`,
    sourceDraftIndex: draftsIndexFile,
    patchPreview
  };
}

function writeApplicationPlan(context, plan) {
  const applicationsRoot = `${context.feedbackRoot}/promotions/applications`;
  const indexFile = `${applicationsRoot}/index.json`;

  mkdirSync(resolve(root, applicationsRoot), { recursive: true });
  writeJson(plan.planFile, plan);
  writeFileSync(resolve(root, plan.patchFile), `${plan.patchPreview}\n`, "utf8");

  const index = exists(indexFile)
    ? readJson(indexFile)
    : {
        version: "0.1.0",
        projectId: context.projectName,
        generatedAt: context.item.reviewedAt ?? context.item.createdAt,
        sourceDrafts: context.draftsIndexFile,
        plans: []
      };
  const plans = (index.plans ?? []).filter((candidate) => candidate.itemId !== plan.itemId);
  plans.push({
    itemId: plan.itemId,
    title: plan.title,
    mode: plan.mode,
    status: plan.status,
    action: plan.action,
    target: plan.target,
    destination: plan.destination,
    planFile: plan.planFile,
    patchFile: plan.patchFile,
    willChangeFiles: plan.willChangeFiles,
    validationCommands: plan.validationCommands,
    command: plan.command
  });

  writeJson(indexFile, {
    version: "0.1.0",
    projectId: context.projectName,
    generatedAt: context.item.reviewedAt ?? context.item.createdAt,
    sourceDrafts: context.draftsIndexFile,
    plans
  });
}

function buildPatchPreview(item, draft) {
  const plannedFiles = item.promotionEvidence?.plannedFiles;
  if (Array.isArray(plannedFiles) && plannedFiles.length > 0) {
    const patchPlan = Array.isArray(item.promotionEvidence?.patchPlan) ? item.promotionEvidence.patchPlan : [];
    return plannedFiles
      .map((file, index) => [
        `diff --git a/${file} b/${file}`,
        "@@ planned promotion",
        `+ ${patchPlan[index] ?? item.proposedChange}`
      ].join("\n"))
      .join("\n");
  }

  if (item.id === "fb-20260707-001") {
    return [
      "diff --git a/rules/anti-patterns.md b/rules/anti-patterns.md",
      "@@ status copy mapping",
      "+ Add a rule that Badge variant stays semantic while domain copy lives in page or generation mapping.",
      "+ Document permission statuses as Active, Review, and Risk with success, warning, and danger variants.",
      "diff --git a/recipes/badge-variants.md b/recipes/badge-variants.md",
      "@@ domain copy",
      "+ Add a domain-copy table for permission and inventory statuses.",
      "+ Require generated permission pages to show Active, Review, and Risk instead of inventory copy."
    ].join("\n");
  }

  if (item.id === "fb-20260707-002") {
    return [
      "diff --git a/components.manifest.json b/components.manifest.json",
      "@@ components",
      "+ Add Pagination as a public component with page, pageSize, total, disabled, and onPageChange props.",
      "+ Link Pagination to DataGrid examples and list-page recipes.",
      "diff --git a/src/components.tsx b/src/components.tsx",
      "@@ exports",
      "+ export type PaginationProps = BaseProps & { page?: number; pageSize?: number; total?: number; disabled?: boolean; onPageChange?: (page: number) => void; };",
      "+ export function Pagination(...) { render previous/next buttons, current range, and page count. }",
      "diff --git a/src/index.ts b/src/index.ts",
      "@@ public API",
      "+ export { Pagination } from \"./components\";",
      "+ export type { PaginationProps } from \"./components\";",
      "diff --git a/src/styles.css b/src/styles.css",
      "@@ pagination styles",
      "+ Add .rd-pagination, .rd-pagination__summary, and .rd-pagination__actions token-based styles.",
      "diff --git a/examples/list-page.tsx b/examples/list-page.tsx",
      "@@ DataGrid usage",
      "+ Import Pagination from @ai-readable/kit.",
      "+ Pass <Pagination page={1} pageSize={20} total={124} /> to DataGrid pagination."
    ].join("\n");
  }

  if (typeof draft.patchDraft === "string" && draft.patchDraft.trim()) return draft.patchDraft;

  return [`diff --git a/${item.promotion.destination} b/${item.promotion.destination}`, "@@", `+ ${item.proposedChange}`].join("\n");
}

function buildValidationCommands(item) {
  const commands = ["npm run validate:feedback", "npm run validate"];
  if (item.target === "component") commands.push("npm run check:dom");
  commands.push("npm run check:harness", "npm run build:preview", "npm run build:starter");
  if (item.target === "component") commands.push("npm run check:package");
  return commands;
}

function extractPatchFiles(patchPreview) {
  return patchPreview
    .split("\n")
    .filter((line) => line.startsWith("diff --git a/"))
    .map((line) => line.replace("diff --git a/", "").split(" b/")[0]);
}

function destinationAllowed(destination, allowedDestinations) {
  return allowedDestinations.some((allowed) => destination === allowed || destination.startsWith(allowed));
}

function readJson(file) {
  return JSON.parse(readFileSync(resolve(root, file), "utf8"));
}

function writeJson(file, value) {
  writeFileSync(resolve(root, file), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function exists(file) {
  return existsSync(resolve(root, file));
}
