import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const projectsDir = resolve(root, "projects");

if (!existsSync(projectsDir)) {
  console.log("generate-promotions skipped: no projects directory");
  process.exit(0);
}

let projectCount = 0;
let draftCount = 0;

for (const projectName of readdirSync(projectsDir)) {
  const projectRoot = `projects/${projectName}`;
  const feedbackRoot = `${projectRoot}/feedback`;
  const queueFile = `${feedbackRoot}/queue.json`;
  const rulesFile = `${feedbackRoot}/promotion-rules.json`;

  if (!exists(queueFile) || !exists(rulesFile)) continue;

  const queue = readJson(queueFile);
  const promotionRules = readJson(rulesFile);
  const gatesByTarget = new Map((promotionRules.gates ?? []).map((gate) => [gate.target, gate]));
  const promotionItems = (queue.items ?? []).filter((item) => item.status === "accepted" || item.status === "promoted");
  const generatedAt = latestDate(promotionItems.map((item) => item.reviewedAt ?? item.createdAt)) ?? "2026-07-07";
  const promotionsRoot = `${feedbackRoot}/promotions`;
  const drafts = [];

  mkdirSync(resolve(root, promotionsRoot), { recursive: true });

  for (const item of promotionItems) {
    const gate = gatesByTarget.get(item.target);
    if (!gate) throw new Error(`${queueFile}: ${item.id} has no promotion gate for ${item.target}`);

    const draftFile = `${promotionsRoot}/${item.id}.md`;
    const draft = {
      itemId: item.id,
      title: item.title,
      status: "draft",
      target: item.target,
      action: item.promotion.action,
      destination: item.promotion.destination,
      draftFile,
      sourceStatus: item.status,
      reviewer: item.reviewer ?? "unassigned",
      reviewedAt: item.reviewedAt ?? item.createdAt,
      checklist: gate.reviewChecklist,
      todos: buildTodos(item, gate),
      acceptance: item.acceptance,
      patchDraft: buildPatchDraft(item)
    };

    writeFileSync(resolve(root, draftFile), renderMarkdownDraft(item, draft), "utf8");
    drafts.push(draft);
    draftCount += 1;
  }

  const index = {
    version: "0.1.0",
    projectId: projectName,
    generatedAt,
    sourceQueue: queueFile,
    sourceRules: rulesFile,
    drafts
  };

  writeJson(`${promotionsRoot}/index.json`, index);
  projectCount += 1;
}

console.log(`generate-promotions passed: ${projectCount} projects, ${draftCount} drafts`);

function readJson(file) {
  return JSON.parse(readFileSync(resolve(root, file), "utf8"));
}

function writeJson(file, value) {
  writeFileSync(resolve(root, file), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function exists(file) {
  return existsSync(resolve(root, file));
}

function buildTodos(item, gate) {
  const base = [
    `Confirm ${item.promotion.destination} is still the right promotion destination.`,
    `Apply the proposed change: ${item.proposedChange}`,
    "Keep public imports on the @ai-readable/kit barrel contract.",
    "Run npm run validate:feedback and npm run validate after applying the patch."
  ];

  if (item.target === "component") {
    return [
      ...base,
      "Decide whether the capability belongs in component API, recipe guidance, or both.",
      "Update examples, DOM checks, or harness coverage so the promoted capability has executable evidence."
    ];
  }

  if (item.target === "demo") {
    return [...base, "Copy only reusable page shape into examples and document PRD, flow, and page source."];
  }

  if (item.target === "rule") {
    return [...base, "Keep the rule short enough for agents to apply during generation."];
  }

  return [...base, `Check gate evidence: ${gate.requiredEvidence.join(", ")}.`];
}

function buildPatchDraft(item) {
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
      "+ Add a status-copy mapping rule: keep Badge variants semantic while page or generation layers provide domain labels.",
      "diff --git a/recipes/badge-variants.md b/recipes/badge-variants.md",
      "@@ domain copy",
      "+ Add permission status copy mapping: active -> Active, review -> Review, risk -> Risk.",
      "+ Add inventory status copy mapping separately so generated pages do not reuse the wrong domain copy."
    ].join("\n");
  }

  if (item.target === "component") {
    return [
      "diff --git a/components.manifest.json b/components.manifest.json",
      "@@ DataGrid",
      "+ Add a reviewed pagination guidance note or helper entry tied to DataGrid.",
      "+ Keep optionalProps aligned with the public DataGrid API.",
      "diff --git a/examples/list-page.tsx b/examples/list-page.tsx",
      "@@ DataGrid usage",
      "+ Pass kit-owned pagination UI through the DataGrid pagination slot once the helper is approved.",
      "diff --git a/harness/scenarios/generated-sample-project.json b/harness/scenarios/generated-sample-project.json",
      "@@ checks",
      "+ Add a pagination-intent check for operational list pages."
    ].join("\n");
  }

  if (item.target === "demo") {
    return [
      `diff --git a/${item.promotion.destination} b/${item.promotion.destination}`,
      "@@",
      "+ Promote the generated page shape after copy, imports, and source notes are reviewed.",
      "+ Keep the example runnable through the public @ai-readable/kit API."
    ].join("\n");
  }

  if (item.target === "rule") {
    return [
      `diff --git a/${item.promotion.destination} b/${item.promotion.destination}`,
      "@@",
      `+ ${item.proposedChange}`,
      "+ Include a short acceptance hook so harness or preview can verify the rule later."
    ].join("\n");
  }

  return [`diff --git a/${item.promotion.destination} b/${item.promotion.destination}`, "@@", `+ ${item.proposedChange}`].join("\n");
}

function latestDate(values) {
  return values.filter(Boolean).sort().at(-1);
}

function renderMarkdownDraft(item, draft) {
  return [
    `# Promotion Draft: ${item.title}`,
    "",
    `- Feedback item: \`${item.id}\``,
    `- Status: \`${item.status}\``,
    `- Target: \`${item.target}\``,
    `- Action: \`${item.promotion.action}\``,
    `- Destination: \`${item.promotion.destination}\``,
    `- Reviewer: \`${draft.reviewer}\``,
    `- Reviewed at: \`${draft.reviewedAt}\``,
    "",
    "## Finding",
    "",
    item.finding,
    "",
    "## Proposed Change",
    "",
    item.proposedChange,
    "",
    "## Evidence",
    "",
    ...item.evidence.map((entry) => `- ${entry}`),
    "",
    "## To Do",
    "",
    ...draft.todos.map((todo) => `- ${todo}`),
    "",
    "## Review Checklist",
    "",
    ...draft.checklist.map((check) => `- ${check}`),
    "",
    "## Acceptance",
    "",
    ...item.acceptance.map((entry) => `- ${entry}`),
    "",
    "## Patch Draft",
    "",
    "```diff",
    draft.patchDraft,
    "```",
    ""
  ].join("\n");
}
