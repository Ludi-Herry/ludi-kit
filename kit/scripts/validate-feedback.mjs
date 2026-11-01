import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const allowedSources = new Set(["manual-edit", "chat-edit", "qa", "engineer", "harness"]);
const allowedTargets = new Set(["component", "page", "rule", "token", "demo"]);
const allowedStatuses = new Set(["queued", "accepted", "promoted", "rejected"]);
const allowedSeverities = new Set(["low", "medium", "high", "critical"]);
const draftStatuses = new Set(["draft", "implemented", "verified"]);
const applicationStatuses = new Set(["ready", "implemented", "verified"]);
const applicationModes = new Set(["dry-run", "recorded"]);
const strictEvidencePolicy = "strict-v1";
const strictEvidenceRequiredFrom = "2026-08-06";

export function validateFeedbackRoot(root = process.cwd()) {
  const errors = [];
  const schemaFile = resolve(root, "schema/feedback.schema.json");
  const implementationRevisionFile = "quality/feedback-implementation-revisions.json";
  const projectsDir = resolve(root, "projects");
  const schema = readJsonAbsolute(schemaFile, "schema/feedback.schema.json", errors);
  const validateQueue = schema ? compileQueueSchema(schema, errors) : null;
  const implementationRevisions = loadImplementationRevisions(root, implementationRevisionFile, errors);
  let projectCount = 0;
  let itemCount = 0;

  if (!schema) push(errors, "schema/feedback.schema.json is missing or invalid");

  if (!existsSync(projectsDir)) {
    return { ok: errors.length === 0, skipped: true, projectCount, itemCount, errors };
  }

  for (const projectName of readdirSync(projectsDir)) {
    if (!statSync(resolve(projectsDir, projectName)).isDirectory()) continue;

    const projectRoot = `projects/${projectName}`;
    const feedbackRoot = `${projectRoot}/feedback`;
    const queueFile = `${feedbackRoot}/queue.json`;
    const rulesFile = `${feedbackRoot}/promotion-rules.json`;
    const promotionsIndexFile = `${feedbackRoot}/promotions/index.json`;
    const applicationsIndexFile = `${feedbackRoot}/promotions/applications/index.json`;
    const pagesDoc = readJson(root, `${projectRoot}/pages.json`, errors);
    const queue = readJson(root, queueFile, errors);
    const promotionRules = readJson(root, rulesFile, errors);
    const pageIds = new Set((pagesDoc?.pages ?? []).map((page) => page.id));
    const ids = new Set();
    const itemsById = new Map();
    const promotionItemIds = new Set();
    const gatesByTarget = new Map((promotionRules?.gates ?? []).map((gate) => [gate.target, gate]));

    projectCount += 1;

    if (!queue || !promotionRules) continue;

    if (validateQueue && !validateQueue(queue)) {
      for (const error of validateQueue.errors ?? []) {
        push(errors, `${queueFile}: schema ${error.instancePath || "/"} ${error.message}`);
      }
    }

    if (queue.projectId !== projectName) push(errors, `${queueFile}: projectId must be ${projectName}`);
    if (promotionRules.projectId !== projectName) push(errors, `${rulesFile}: projectId must be ${projectName}`);
    if (!Array.isArray(queue.items)) push(errors, `${queueFile}: items must be an array`);
    if (!Array.isArray(promotionRules.gates)) push(errors, `${rulesFile}: gates must be an array`);
    if (!Array.isArray(promotionRules.workflow) || promotionRules.workflow.length === 0) {
      push(errors, `${rulesFile}: workflow must be a non-empty array`);
    }

    for (const gate of promotionRules.gates ?? []) {
      if (!allowedTargets.has(gate.target)) push(errors, `${rulesFile}: unknown target ${gate.target}`);
      if (!Array.isArray(gate.allowedActions) || gate.allowedActions.length === 0) {
        push(errors, `${rulesFile}: gate ${gate.target} needs allowedActions`);
      }
      if (!Array.isArray(gate.allowedDestinations) || gate.allowedDestinations.length === 0) {
        push(errors, `${rulesFile}: gate ${gate.target} needs allowedDestinations`);
      }
      if (!Array.isArray(gate.requiredEvidence) || gate.requiredEvidence.length === 0) {
        push(errors, `${rulesFile}: gate ${gate.target} needs requiredEvidence`);
      }
      if (!Array.isArray(gate.reviewChecklist) || gate.reviewChecklist.length === 0) {
        push(errors, `${rulesFile}: gate ${gate.target} needs reviewChecklist`);
      }
    }

    for (const item of queue.items ?? []) {
      itemCount += 1;

      if (!/^fb-[0-9]{8}-[0-9]{3}$/.test(item.id ?? "")) push(errors, `${queueFile}: invalid feedback id ${item.id}`);
      if (ids.has(item.id)) push(errors, `${queueFile}: duplicate feedback id ${item.id}`);
      ids.add(item.id);
      itemsById.set(item.id, item);
      implementationRevisions.feedbackItems.set(`${projectName}:${item.id}`, item);
      if (item.status === "accepted" || item.status === "promoted") promotionItemIds.add(item.id);

      if (!allowedSources.has(item.source)) push(errors, `${queueFile}: ${item.id} has unknown source ${item.source}`);
      if (!allowedTargets.has(item.target)) push(errors, `${queueFile}: ${item.id} has unknown target ${item.target}`);
      if (!allowedStatuses.has(item.status)) push(errors, `${queueFile}: ${item.id} has unknown status ${item.status}`);
      if (!allowedSeverities.has(item.severity)) push(errors, `${queueFile}: ${item.id} has unknown severity ${item.severity}`);
      if (item.pageId && !pageIds.has(item.pageId)) push(errors, `${queueFile}: ${item.id} references missing page ${item.pageId}`);
      if (item.generatedFile && !exists(root, item.generatedFile)) push(errors, `${queueFile}: ${item.id} generatedFile missing: ${item.generatedFile}`);
      if (!item.title || !item.finding || !item.proposedChange) push(errors, `${queueFile}: ${item.id} needs title/finding/proposedChange`);
      if (!Array.isArray(item.evidence) || item.evidence.length === 0) push(errors, `${queueFile}: ${item.id} needs evidence`);
      if (!Array.isArray(item.acceptance) || item.acceptance.length === 0) push(errors, `${queueFile}: ${item.id} needs acceptance`);
      if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(item.createdAt ?? "")) push(errors, `${queueFile}: ${item.id} has invalid createdAt`);
      if (item.status === "accepted" || item.status === "promoted") {
        if (!item.reviewer) push(errors, `${queueFile}: ${item.id} accepted or promoted item needs reviewer`);
        if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(item.reviewedAt ?? "")) {
          push(errors, `${queueFile}: ${item.id} accepted or promoted item needs reviewedAt`);
        }
      }

      const gate = gatesByTarget.get(item.target);
      if (!gate) {
        push(errors, `${queueFile}: ${item.id} target ${item.target} has no promotion gate`);
        continue;
      }

      if (!gate.allowedActions.includes(item.promotion?.action)) {
        push(errors, `${queueFile}: ${item.id} action ${item.promotion?.action} is not allowed for ${item.target}`);
      }
      if (item.promotion?.requiresReview !== true) {
        push(errors, `${queueFile}: ${item.id} promotion.requiresReview must be true`);
      }
      if (!destinationAllowed(item.promotion?.destination ?? "", gate.allowedDestinations)) {
        push(errors, `${queueFile}: ${item.id} destination ${item.promotion?.destination} is not allowed for ${item.target}`);
      }
      if (item.promotion?.destination && destinationShouldExist(item.target) && !exists(root, item.promotion.destination)) {
        push(errors, `${queueFile}: ${item.id} destination missing: ${item.promotion.destination}`);
      }
      for (const requirement of gate.requiredEvidence) {
        if (!hasEvidence(item, requirement)) {
          push(errors, `${queueFile}: ${item.id} missing required evidence ${requirement}`);
        }
      }

      if (item.status === "promoted") {
        if (item.promotionEvidence?.evidencePolicy === strictEvidencePolicy) {
          validateStrictPromotionEvidence(root, queueFile, item, errors, implementationRevisions, projectName);
        } else if ((item.createdAt ?? "") >= strictEvidenceRequiredFrom) {
          push(
            errors,
            `${queueFile}: ${item.id} was created on or after ${strictEvidenceRequiredFrom} and must carry promotionEvidence.evidencePolicy ${strictEvidencePolicy}`
          );
        }
      }
    }

    validatePromotionDrafts({
      root,
      errors,
      itemsById,
      promotionItemIds,
      promotionsIndexFile,
      projectName,
      queueFile,
      rulesFile
    });

    validatePromotionApplications({
      root,
      errors,
      applicationsIndexFile,
      gatesByTarget,
      itemsById,
      promotionItemIds,
      projectName,
      promotionsIndexFile
    });
  }

  rejectUnusedImplementationRevisions(implementationRevisions, errors);

  return { ok: errors.length === 0, skipped: false, projectCount, itemCount, errors };
}

function compileQueueSchema(schema, errors) {
  try {
    return new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  } catch (error) {
    push(errors, `schema/feedback.schema.json failed Ajv compile: ${error.message}`);
    return null;
  }
}

function readJson(root, file, errors) {
  return readJsonAbsolute(resolve(root, file), file, errors);
}

function readJsonAbsolute(absoluteFile, label, errors) {
  if (!existsSync(absoluteFile)) {
    push(errors, `${label} is missing`);
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(absoluteFile, "utf8"));
  } catch (error) {
    push(errors, `${label} is not valid JSON: ${error.message}`);
    return undefined;
  }
}

function exists(root, file) {
  return existsSync(resolve(root, file));
}

function normalizeFeedbackPath(value) {
  return String(value).replaceAll("\\", "/").replace(/^\.\//, "");
}

function destinationAllowed(destination, allowedDestinations) {
  return allowedDestinations.some((allowed) => destination === allowed || destination.startsWith(allowed));
}

function destinationShouldExist(target) {
  return target === "rule" || target === "component" || target === "demo";
}

function hasEvidence(item, requirement) {
  const value = requirement.split(".").reduce((current, key) => current?.[key], item);
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return Boolean(value);
}

function validateStrictPromotionEvidence(root, queueFile, item, errors, implementationRevisions, projectName) {
  const prefix = `${queueFile}: ${item.id}`;
  const evidence = item.promotionEvidence ?? {};
  const implementationFiles = evidence.implementation?.files;
  const regressionCommands = evidence.regression?.commands;
  const artifacts = evidence.evidenceArtifacts ?? {};

  if (!Array.isArray(implementationFiles) || implementationFiles.length === 0) {
    push(errors, `${prefix} promoted strict evidence needs implementation.files`);
  } else {
    validateHashedFiles(
      root,
      `${prefix} implementation`,
      implementationFiles,
      errors,
      implementationRevisions,
      `${projectName}:${item.id}`
    );
    for (const plannedFile of evidence.plannedFiles ?? []) {
      if (!implementationFiles.some((file) => file.path === plannedFile)) {
        push(errors, `${prefix} implementation hash missing for planned file ${plannedFile}`);
      }
    }
    const destination = normalizeFeedbackPath(item.promotion?.destination ?? "");
    if (destination && !implementationFiles.some((file) => normalizeFeedbackPath(file.path ?? "") === destination)) {
      push(
        errors,
        `${prefix} promoted strict evidence must hash its promotion destination ${item.promotion.destination}; without it the fix can live only in generated output and the next generation reproduces the defect`
      );
    }
  }

  if (!Array.isArray(regressionCommands) || regressionCommands.length === 0) {
    push(errors, `${prefix} promoted strict evidence needs regression.commands`);
  } else {
    for (const command of regressionCommands) {
      if (command.status !== "passed") {
        push(errors, `${prefix} regression command must be passed: ${command.command}`);
      }
      for (const artifact of command.evidence ?? []) validateEvidenceArtifact(root, `${prefix} command ${command.command}`, artifact, errors);
    }
  }

  if (!Array.isArray(artifacts.harness) || artifacts.harness.length === 0) {
    push(errors, `${prefix} promoted strict evidence needs harness artifacts`);
  }
  for (const artifact of artifacts.harness ?? []) {
    validateEvidenceArtifact(root, `${prefix} harness`, artifact, errors);
    validateHarnessReport(root, `${prefix} harness`, artifact, errors);
  }
  validateEvidenceLane(root, `${prefix} browser`, artifacts.browser, errors);
  validateEvidenceLane(root, `${prefix} visual`, artifacts.visual, errors);
}

function validateHashedFiles(root, label, files, errors, implementationRevisions, feedbackKey) {
  for (const file of files) {
    if (!file?.path) {
      push(errors, `${label} file entry needs path`);
      continue;
    }
    if (!/^[a-f0-9]{64}$/.test(file.sha256 ?? "")) {
      push(errors, `${label} ${file.path} needs sha256`);
      continue;
    }
    if (!exists(root, file.path)) {
      push(errors, `${label} path missing: ${file.path}`);
      continue;
    }
    const actual = sha256(root, file.path);
    if (
      actual !== file.sha256 &&
      !matchesApprovedImplementationRevision(file.path, file.sha256, actual, implementationRevisions, errors, feedbackKey)
    ) {
      push(errors, `${label} sha256 mismatch for ${file.path}`);
    }
  }
}

function loadImplementationRevisions(root, file, errors) {
  const context = {
    file,
    byPrevious: new Map(),
    feedbackItems: new Map(),
    revisions: new Map(),
    transitions: new Map(),
    used: new Set()
  };
  if (!exists(root, file)) return context;

  const ledger = readJson(root, file, errors);
  if (!ledger) return context;
  if (ledger.version !== "1.0.0") push(errors, `${file}: version must be 1.0.0`);
  if (!Array.isArray(ledger.revisions)) {
    push(errors, `${file}: revisions must be an array`);
    return context;
  }

  const revisionIds = new Set();
  for (const revision of ledger.revisions) {
    const revisionId = revision?.id ?? "<missing>";
    const prefix = `${file}: ${revisionId}`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(revision?.id ?? "")) push(errors, `${prefix} has invalid id`);
    if (revisionIds.has(revision?.id)) push(errors, `${prefix} is duplicated`);
    revisionIds.add(revision?.id);
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(revision?.recordedAt ?? "")) push(errors, `${prefix} has invalid recordedAt`);
    if (typeof revision?.reason !== "string" || revision.reason.trim().length < 12) push(errors, `${prefix} needs a specific reason`);
    if (typeof revision?.scope !== "string" || revision.scope.trim().length < 12) push(errors, `${prefix} needs a specific scope`);
    const declaredFeedbackItems = new Set();
    if (!Array.isArray(revision?.affectedFeedbackItems) || revision.affectedFeedbackItems.length === 0) {
      push(errors, `${prefix} needs affectedFeedbackItems`);
    }
    for (const reference of revision?.affectedFeedbackItems ?? []) {
      const projectId = reference?.projectId ?? "";
      const itemId = reference?.itemId ?? "";
      const feedbackKey = `${projectId}:${itemId}`;
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(projectId)) push(errors, `${prefix} has invalid affected projectId`);
      if (!/^fb-[0-9]{8}-[0-9]{3}$/.test(itemId)) push(errors, `${prefix} has invalid affected itemId`);
      if (declaredFeedbackItems.has(feedbackKey)) push(errors, `${prefix} duplicates affected feedback ${feedbackKey}`);
      declaredFeedbackItems.add(feedbackKey);
    }

    if (revision?.review?.status !== "approved") push(errors, `${prefix} review status must be approved`);
    if (typeof revision?.review?.reviewer !== "string" || revision.review.reviewer.trim().length < 3) {
      push(errors, `${prefix} needs reviewer`);
    }
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(revision?.review?.reviewedAt ?? "")) {
      push(errors, `${prefix} has invalid reviewedAt`);
    }

    const validationCommands = revision?.validationCommands;
    if (!Array.isArray(validationCommands) || validationCommands.length < 2) {
      push(errors, `${prefix} needs at least two validationCommands`);
    }
    const commandNames = new Set();
    for (const command of validationCommands ?? []) {
      if (typeof command?.command !== "string" || command.command.trim().length === 0) push(errors, `${prefix} validation command needs command`);
      if (command?.status !== "passed") push(errors, `${prefix} validation command must be passed: ${command?.command}`);
      commandNames.add(command?.command);
    }
    for (const requiredCommand of ["node scripts/test-feedback-validator.mjs", "node scripts/validate-feedback.mjs"]) {
      if (!commandNames.has(requiredCommand)) push(errors, `${prefix} missing required validation command: ${requiredCommand}`);
    }

    if (!Array.isArray(revision?.evidence) || revision.evidence.length === 0) {
      push(errors, `${prefix} needs hashed current evidence`);
    }
    for (const artifact of revision?.evidence ?? []) {
      validateEvidenceArtifact(root, `${prefix} revision`, artifact, errors);
      if (artifact?.type === "harness") validateHarnessReport(root, `${prefix} revision`, artifact, errors);
    }

    context.revisions.set(revisionId, {
      declaredFeedbackItems,
      id: revisionId,
      usedFeedbackItems: new Set()
    });
    if (!Array.isArray(revision?.files) || revision.files.length === 0) {
      push(errors, `${prefix} needs files`);
      continue;
    }

    for (const entry of revision.files) {
      const entryPath = entry?.path ?? "<missing>";
      const transitionId = `${revisionId}:${entryPath}:${entry?.previousSha256 ?? "<missing>"}`;
      const transitionKey = `${entryPath}\0${entry?.previousSha256 ?? ""}`;
      if (typeof entry?.path !== "string" || entry.path.length === 0) push(errors, `${prefix} file entry needs path`);
      if (!/^[a-f0-9]{64}$/.test(entry?.previousSha256 ?? "")) push(errors, `${prefix} ${entryPath} needs previousSha256`);
      if (!/^[a-f0-9]{64}$/.test(entry?.currentSha256 ?? "")) push(errors, `${prefix} ${entryPath} needs currentSha256`);
      if (entry?.previousSha256 === entry?.currentSha256) push(errors, `${prefix} ${entryPath} revision hashes must differ`);
      if (entry?.path && !exists(root, entry.path)) push(errors, `${prefix} path missing: ${entry.path}`);
      if (context.byPrevious.has(transitionKey)) push(errors, `${prefix} duplicates a revision source for ${entryPath}`);

      const transition = {
        id: transitionId,
        path: entry?.path,
        previousSha256: entry?.previousSha256,
        revisionId,
        currentSha256: entry?.currentSha256
      };
      context.byPrevious.set(transitionKey, transition);
      context.transitions.set(transitionId, transition);
    }
  }

  return context;
}

function matchesApprovedImplementationRevision(path, expectedSha256, actualSha256, context, errors, feedbackKey) {
  if (!context) return false;
  let currentSha256 = expectedSha256;
  const seen = new Set();

  while (currentSha256 !== actualSha256) {
    const transitionKey = `${path}\0${currentSha256}`;
    const transition = context.byPrevious.get(transitionKey);
    if (!transition) return false;
    if (seen.has(transition.id)) {
      push(errors, `${context.file}: revision cycle detected for ${path}`);
      return false;
    }
    seen.add(transition.id);
    context.used.add(transition.id);
    if (feedbackKey) context.revisions.get(transition.revisionId)?.usedFeedbackItems.add(feedbackKey);
    currentSha256 = transition.currentSha256;
  }

  return true;
}

function rejectUnusedImplementationRevisions(context, errors) {
  for (const transition of context.transitions.values()) {
    if (!context.used.has(transition.id)) {
      push(errors, `${context.file}: unused implementation revision for ${transition.path}`);
    }
  }
  for (const revision of context.revisions.values()) {
    for (const feedbackKey of revision.declaredFeedbackItems) {
      const item = context.feedbackItems.get(feedbackKey);
      if (!item) {
        push(errors, `${context.file}: ${revision.id} references missing feedback ${feedbackKey}`);
      } else if (item.status !== "promoted" || item.promotionEvidence?.evidencePolicy !== strictEvidencePolicy) {
        push(errors, `${context.file}: ${revision.id} feedback ${feedbackKey} must be promoted strict-v1`);
      }
    }
    const declared = [...revision.declaredFeedbackItems].sort();
    const used = [...revision.usedFeedbackItems].sort();
    if (declared.join("\0") !== used.join("\0")) {
      push(errors, `${context.file}: ${revision.id} affected feedback does not match revision use`);
    }
  }
}

function validateEvidenceLane(root, label, artifacts, errors) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    push(errors, `${label} evidence must be passed with a path or explicitly incomplete`);
    return;
  }
  for (const artifact of artifacts) validateEvidenceArtifact(root, label, artifact, errors);
}

function validateEvidenceArtifact(root, label, artifact, errors) {
  if (!artifact || typeof artifact !== "object") {
    push(errors, `${label} evidence artifact must be an object`);
    return;
  }
  if (artifact.status === "passed") {
    validateHashedFiles(root, label, [{ path: artifact.path, sha256: artifact.sha256 }], errors);
  } else if (artifact.status === "incomplete") {
    if (!artifact.reason || artifact.reason.trim().length < 6) push(errors, `${label} incomplete evidence needs reason`);
    if (artifact.path || artifact.sha256) push(errors, `${label} incomplete evidence must not pretend to have path/hash`);
  } else {
    push(errors, `${label} evidence status must be passed or incomplete`);
  }
}

function validateHarnessReport(root, label, artifact, errors) {
  if (artifact.status !== "passed" || !artifact.path || !artifact.path.endsWith(".json") || !exists(root, artifact.path)) return;
  const report = readJson(root, artifact.path, errors);
  if (report?.status !== "passed") push(errors, `${label} report must have status passed: ${artifact.path}`);
}

function validatePromotionDrafts({ root, errors, itemsById, promotionItemIds, promotionsIndexFile, projectName, queueFile, rulesFile }) {
  if (!exists(root, promotionsIndexFile)) {
    if (promotionItemIds.size > 0) push(errors, `${promotionsIndexFile}: accepted or promoted feedback items need promotion drafts`);
    return;
  }

  const index = readJson(root, promotionsIndexFile, errors);
  const draftIds = new Set();

  if (!index) return;

  if (index.projectId !== projectName) push(errors, `${promotionsIndexFile}: projectId must be ${projectName}`);
  if (index.sourceQueue !== queueFile) push(errors, `${promotionsIndexFile}: sourceQueue must be ${queueFile}`);
  if (index.sourceRules !== rulesFile) push(errors, `${promotionsIndexFile}: sourceRules must be ${rulesFile}`);
  if (!Array.isArray(index.drafts)) push(errors, `${promotionsIndexFile}: drafts must be an array`);

  for (const draft of index.drafts ?? []) {
    const item = itemsById.get(draft.itemId);
    if (!item) {
      push(errors, `${promotionsIndexFile}: draft references missing feedback item ${draft.itemId}`);
      continue;
    }
    if (draftIds.has(draft.itemId)) push(errors, `${promotionsIndexFile}: duplicate draft item ${draft.itemId}`);
    draftIds.add(draft.itemId);

    if (item.status !== "accepted" && item.status !== "promoted") {
      push(errors, `${promotionsIndexFile}: ${draft.itemId} draft source must be accepted or promoted`);
    }
    const isStrict = item.promotionEvidence?.evidencePolicy === strictEvidencePolicy;
    if (draft.sourceStatus !== item.status) {
      push(errors, `${promotionsIndexFile}: ${draft.itemId} sourceStatus must match queue status ${item.status}`);
    }
    if (!draftStatuses.has(draft.status)) push(errors, `${promotionsIndexFile}: ${draft.itemId} status must be draft, implemented, or verified`);
    if (isStrict && item.status === "accepted" && draft.status !== "draft") {
      push(errors, `${promotionsIndexFile}: ${draft.itemId} accepted source must keep draft status`);
    }
    if (isStrict && item.status === "promoted" && !["implemented", "verified"].includes(draft.status)) {
      push(errors, `${promotionsIndexFile}: ${draft.itemId} promoted source must be implemented or verified`);
    }
    if (draft.action !== item.promotion?.action) push(errors, `${promotionsIndexFile}: ${draft.itemId} action does not match queue`);
    if (draft.destination !== item.promotion?.destination) {
      push(errors, `${promotionsIndexFile}: ${draft.itemId} destination does not match queue`);
    }
    if (draft.target !== item.target) push(errors, `${promotionsIndexFile}: ${draft.itemId} target does not match queue`);
    if (!draft.draftFile || !exists(root, draft.draftFile)) push(errors, `${promotionsIndexFile}: ${draft.itemId} draftFile missing`);
    if (!Array.isArray(draft.todos) || draft.todos.length === 0) push(errors, `${promotionsIndexFile}: ${draft.itemId} needs todos`);
    if (!Array.isArray(draft.checklist) || draft.checklist.length === 0) {
      push(errors, `${promotionsIndexFile}: ${draft.itemId} needs checklist`);
    }
    if (!Array.isArray(draft.acceptance) || draft.acceptance.length === 0) {
      push(errors, `${promotionsIndexFile}: ${draft.itemId} needs acceptance`);
    }
    if (typeof draft.patchDraft !== "string" || draft.patchDraft.trim().length === 0) {
      push(errors, `${promotionsIndexFile}: ${draft.itemId} needs patchDraft`);
    }
  }

  for (const itemId of promotionItemIds) {
    if (!draftIds.has(itemId)) push(errors, `${promotionsIndexFile}: missing draft for accepted or promoted feedback item ${itemId}`);
  }
}

function validatePromotionApplications({
  root,
  errors,
  applicationsIndexFile,
  gatesByTarget,
  itemsById,
  promotionItemIds,
  projectName,
  promotionsIndexFile
}) {
  if (!exists(root, applicationsIndexFile)) {
    if (promotionItemIds.size > 0) push(errors, `${applicationsIndexFile}: accepted or promoted feedback items need application plans`);
    return;
  }

  const index = readJson(root, applicationsIndexFile, errors);
  const planIds = new Set();

  if (!index) return;

  if (index.projectId !== projectName) push(errors, `${applicationsIndexFile}: projectId must be ${projectName}`);
  if (index.sourceDrafts !== promotionsIndexFile) push(errors, `${applicationsIndexFile}: sourceDrafts must be ${promotionsIndexFile}`);
  if (!Array.isArray(index.plans)) push(errors, `${applicationsIndexFile}: plans must be an array`);

  for (const plan of index.plans ?? []) {
    const item = itemsById.get(plan.itemId);
    if (!item) {
      push(errors, `${applicationsIndexFile}: plan references missing feedback item ${plan.itemId}`);
      continue;
    }
    if (planIds.has(plan.itemId)) push(errors, `${applicationsIndexFile}: duplicate plan item ${plan.itemId}`);
    planIds.add(plan.itemId);

    const gate = gatesByTarget.get(item.target);
    if (!gate) {
      push(errors, `${applicationsIndexFile}: ${plan.itemId} target ${item.target} has no promotion gate`);
      continue;
    }

    if (item.status !== "accepted" && item.status !== "promoted") {
      push(errors, `${applicationsIndexFile}: ${plan.itemId} plan source must be accepted or promoted`);
    }
    const isStrict = item.promotionEvidence?.evidencePolicy === strictEvidencePolicy;
    if (!applicationModes.has(plan.mode)) push(errors, `${applicationsIndexFile}: ${plan.itemId} mode must be dry-run or recorded`);
    if (!applicationStatuses.has(plan.status)) {
      push(errors, `${applicationsIndexFile}: ${plan.itemId} status must be ready, implemented, or verified`);
    }
    if (isStrict && item.status === "accepted") {
      if (plan.mode !== "dry-run") push(errors, `${applicationsIndexFile}: ${plan.itemId} accepted source must stay dry-run`);
      if (plan.status !== "ready") push(errors, `${applicationsIndexFile}: ${plan.itemId} accepted source must stay ready`);
    }
    if (isStrict && item.status === "promoted") {
      if (plan.mode === "dry-run") push(errors, `${applicationsIndexFile}: ${plan.itemId} promoted source cannot remain dry-run`);
      if (!["implemented", "verified"].includes(plan.status)) {
        push(errors, `${applicationsIndexFile}: ${plan.itemId} promoted source must be implemented or verified`);
      }
    }
    if (plan.action !== item.promotion?.action) push(errors, `${applicationsIndexFile}: ${plan.itemId} action does not match queue`);
    if (plan.target !== item.target) push(errors, `${applicationsIndexFile}: ${plan.itemId} target does not match queue`);
    if (plan.destination !== item.promotion?.destination) {
      push(errors, `${applicationsIndexFile}: ${plan.itemId} destination does not match queue`);
    }
    if (!plan.planFile || !exists(root, plan.planFile)) push(errors, `${applicationsIndexFile}: ${plan.itemId} planFile missing`);
    if (!plan.patchFile || !exists(root, plan.patchFile)) push(errors, `${applicationsIndexFile}: ${plan.itemId} patchFile missing`);
    if (!Array.isArray(plan.willChangeFiles) || plan.willChangeFiles.length === 0) {
      push(errors, `${applicationsIndexFile}: ${plan.itemId} needs willChangeFiles`);
    }
    for (const file of plan.willChangeFiles ?? []) {
      if (!destinationAllowed(file, gate.allowedDestinations)) {
        push(errors, `${applicationsIndexFile}: ${plan.itemId} file is outside allowed destinations: ${file}`);
      }
    }
    if (!Array.isArray(plan.validationCommands) || plan.validationCommands.length === 0) {
      push(errors, `${applicationsIndexFile}: ${plan.itemId} needs validationCommands`);
    }
    if (typeof plan.command !== "string" || !plan.command.includes(plan.itemId)) {
      push(errors, `${applicationsIndexFile}: ${plan.itemId} command must include item id`);
    }
    if (isStrict && item.status === "accepted" && !plan.command.includes("--dry-run")) {
      push(errors, `${applicationsIndexFile}: ${plan.itemId} draft command must include --dry-run`);
    }
    if (isStrict && item.status === "promoted" && plan.command.includes("--dry-run")) {
      push(errors, `${applicationsIndexFile}: ${plan.itemId} promoted command must not include --dry-run`);
    }

    const detail = readJson(root, plan.planFile, errors);
    if (detail?.itemId !== plan.itemId) push(errors, `${plan.planFile}: itemId must match application index`);
    if (detail?.patchFile !== plan.patchFile) push(errors, `${plan.planFile}: patchFile must match application index`);
    if (typeof detail?.patchPreview !== "string" || detail.patchPreview.trim().length === 0) {
      push(errors, `${plan.planFile}: patchPreview is required`);
    }
    if (detail?.mode !== plan.mode) push(errors, `${plan.planFile}: mode must match application index`);
    if (detail?.status !== plan.status) push(errors, `${plan.planFile}: status must match application index`);
  }

  for (const itemId of promotionItemIds) {
    if (!planIds.has(itemId)) push(errors, `${applicationsIndexFile}: missing application plan for accepted or promoted feedback item ${itemId}`);
  }
}

function sha256(root, file) {
  return createHash("sha256").update(readFileSync(resolve(root, file))).digest("hex");
}

function push(errors, message) {
  if (!errors.includes(message)) errors.push(message);
}

function runCli() {
  const result = validateFeedbackRoot(process.cwd());

  if (result.skipped) {
    console.log("validate-feedback skipped: no projects directory");
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (!result.ok) {
    for (const message of result.errors) console.error(`validate-feedback failed: ${message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`validate-feedback passed: ${result.projectCount} projects, ${result.itemCount} feedback items`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runCli();
