import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateFeedbackRoot } from "./validate-feedback.mjs";

const repoRoot = process.cwd();
let caseCount = 0;

run("valid strict promoted fixture passes", (root) => {
  writeFixture(root);
  const result = validateFeedbackRoot(root);
  assert.equal(result.ok, true, result.errors.join("\n"));
});

run("missing implementation hash fails closed", (root) => {
  const fixture = writeFixture(root);
  fixture.queue.items[0].promotionEvidence.implementation.files.pop();
  writeJson(join(root, "projects/test-product/feedback/queue.json"), fixture.queue);
  const result = validateFeedbackRoot(root);
  assert.equal(result.ok, false);
  assert(result.errors.some((error) => error.includes("implementation hash missing")));
});

run("promotion destination outside implementation hashes fails closed", (root) => {
  const fixture = writeFixture(root);
  const item = fixture.queue.items[0];
  item.promotionEvidence.plannedFiles = item.promotionEvidence.plannedFiles.filter(
    (path) => path !== "components.manifest.json"
  );
  item.promotionEvidence.implementation.files = item.promotionEvidence.implementation.files.filter(
    (file) => file.path !== "components.manifest.json"
  );
  writeJson(join(root, "projects/test-product/feedback/queue.json"), fixture.queue);
  const result = validateFeedbackRoot(root);
  assert.equal(result.ok, false);
  assert(result.errors.some((error) => error.includes("must hash its promotion destination")));
});

run("promoted item created after the cutoff needs strict evidence", (root) => {
  const fixture = writeFixture(root);
  const item = fixture.queue.items[0];
  item.createdAt = "2026-08-06";
  delete item.promotionEvidence.evidencePolicy;
  writeJson(join(root, "projects/test-product/feedback/queue.json"), fixture.queue);
  const result = validateFeedbackRoot(root);
  assert.equal(result.ok, false);
  assert(result.errors.some((error) => error.includes("must carry promotionEvidence.evidencePolicy")));
});

run("fake evidence path fails closed", (root) => {
  const fixture = writeFixture(root);
  fixture.queue.items[0].promotionEvidence.evidenceArtifacts.harness[0].path = "harness/reports/missing.json";
  writeJson(join(root, "projects/test-product/feedback/queue.json"), fixture.queue);
  const result = validateFeedbackRoot(root);
  assert.equal(result.ok, false);
  assert(result.errors.some((error) => error.includes("path missing: harness/reports/missing.json")));
});

run("promoted status drift fails closed", (root) => {
  const fixture = writeFixture(root);
  fixture.drafts.drafts[0].status = "draft";
  fixture.applications.plans[0].mode = "dry-run";
  fixture.applications.plans[0].status = "ready";
  fixture.applications.plans[0].command = "npm run apply:promotion -- fb-20260715-999 --dry-run --write-plan";
  fixture.applicationDetail.mode = "dry-run";
  fixture.applicationDetail.status = "ready";
  writeJson(join(root, "projects/test-product/feedback/promotions/index.json"), fixture.drafts);
  writeJson(join(root, "projects/test-product/feedback/promotions/applications/index.json"), fixture.applications);
  writeJson(join(root, "projects/test-product/feedback/promotions/applications/fb-20260715-999.json"), fixture.applicationDetail);
  const result = validateFeedbackRoot(root);
  assert.equal(result.ok, false);
  assert(result.errors.some((error) => error.includes("promoted source must be implemented or verified")));
  assert(result.errors.some((error) => error.includes("promoted source cannot remain dry-run")));
});

run("hash-only implementation revision fails closed", (root) => {
  const fixture = writeFixture(root);
  const previous = fixture.queue.items[0].promotionEvidence.implementation.files[0];
  writeFileSync(join(root, previous.path), "export const TestComponent = 'renamed';\n", "utf8");
  const current = hashed(root, previous.path);
  writeRevisionLedger(root, previous, current, { complete: false });
  const result = validateFeedbackRoot(root);
  assert.equal(result.ok, false);
  assert(result.errors.some((error) => error.includes("needs affectedFeedbackItems")));
  assert(result.errors.some((error) => error.includes("review status must be approved")));
  assert(result.errors.some((error) => error.includes("needs hashed current evidence")));
});

run("approved implementation revision preserves historical hashes", (root) => {
  const fixture = writeFixture(root);
  const previous = fixture.queue.items[0].promotionEvidence.implementation.files[0];
  writeFileSync(join(root, previous.path), "export const TestComponent = 'renamed';\n", "utf8");
  const current = hashed(root, previous.path);
  writeRevisionLedger(root, previous, current);
  const result = validateFeedbackRoot(root);
  assert.equal(result.ok, true, result.errors.join("\n"));
});

run("stale implementation revision fails closed", (root) => {
  const fixture = writeFixture(root);
  const previous = fixture.queue.items[0].promotionEvidence.implementation.files[0];
  writeFileSync(join(root, previous.path), "export const TestComponent = 'renamed';\n", "utf8");
  writeRevisionLedger(root, previous, { path: previous.path, sha256: "0".repeat(64) });
  const result = validateFeedbackRoot(root);
  assert.equal(result.ok, false);
  assert(result.errors.some((error) => error.includes(`sha256 mismatch for ${previous.path}`)));
});

console.log(`test-feedback-validator passed: ${caseCount} cases`);

function run(name, callback) {
  caseCount += 1;
  const root = mkdtempSync(join(tmpdir(), "feedback-validator-"));
  try {
    callback(root);
  } catch (error) {
    error.message = `${name}: ${error.message}`;
    throw error;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function writeFixture(root) {
  const projectRoot = join(root, "projects/test-product");
  const feedbackRoot = join(projectRoot, "feedback");
  const promotionsRoot = join(feedbackRoot, "promotions");
  const applicationsRoot = join(promotionsRoot, "applications");
  const files = {
    "src/components.tsx": "export const TestComponent = true;\n",
    "components.manifest.json": "{\"components\":[]}\n",
    "harness/scenarios/test-product.json": "{\"scenario\":\"test-product\"}\n",
    "harness/reports/test-product.json": "{\"scenario\":\"test-product\",\"status\":\"passed\",\"score\":100,\"findings\":[]}\n"
  };

  cpSync(join(repoRoot, "schema"), join(root, "schema"), { recursive: true });
  mkdirSync(applicationsRoot, { recursive: true });
  for (const [file, contents] of Object.entries(files)) {
    const absoluteFile = join(root, file);
    mkdirSync(absoluteFile.slice(0, absoluteFile.lastIndexOf("\\")), { recursive: true });
    writeFileSync(absoluteFile, contents, "utf8");
  }
  writeJson(join(projectRoot, "pages.json"), { pages: [{ id: "page-a" }] });
  writeFileSync(join(promotionsRoot, "fb-20260715-999.md"), "# Draft\n", "utf8");
  writeFileSync(join(applicationsRoot, "fb-20260715-999.diff"), "diff --git a/src/components.tsx b/src/components.tsx\n@@ planned promotion\n+ semantic plan only\n", "utf8");

  const queue = {
    version: "0.1.0",
    projectId: "test-product",
    items: [
      {
        id: "fb-20260715-999",
        source: "qa",
        target: "component",
        status: "promoted",
        severity: "high",
        reviewer: "reviewer",
        reviewedAt: "2026-07-15",
        pageId: "page-a",
        generatedFile: "src/components.tsx",
        title: "Strict evidence fixture",
        finding: "The fixture validates strict promotion evidence.",
        evidence: ["A promoted item must point at real files."],
        proposedChange: "Record implementation, regression, and harness evidence.",
        promotion: { destination: "components.manifest.json", action: "update-component", requiresReview: true },
        promotionEvidence: {
          evidencePolicy: "strict-v1",
          componentPlan: "Add a test component.",
          plannedFiles: ["src/components.tsx", "components.manifest.json", "harness/scenarios/test-product.json"],
          patchPlan: ["Keep the diff as a semantic plan."],
          implementation: {
            files: [
              hashed(root, "src/components.tsx"),
              hashed(root, "components.manifest.json"),
              hashed(root, "harness/scenarios/test-product.json")
            ]
          },
          regression: {
            commands: [
              {
                command: "node harness/runner/run-scenario.mjs harness/scenarios/test-product.json",
                status: "passed",
                evidence: [{ type: "harness", status: "passed", ...hashed(root, "harness/reports/test-product.json") }]
              }
            ]
          },
          evidenceArtifacts: {
            harness: [{ type: "harness", status: "passed", ...hashed(root, "harness/reports/test-product.json") }],
            browser: [{ type: "browser", status: "incomplete", reason: "No browser artifact exists for this fixture." }],
            visual: [{ type: "visual", status: "incomplete", reason: "No visual artifact exists for this fixture." }]
          }
        },
        acceptance: ["The validator accepts only real strict evidence."],
        createdAt: "2026-07-15"
      }
    ]
  };
  const rules = {
    version: "0.1.0",
    projectId: "test-product",
    workflow: ["queued", "accepted", "promoted", "rejected"],
    gates: [
      {
        target: "component",
        allowedActions: ["update-component"],
        allowedDestinations: ["src/", "components.manifest.json", "harness/"],
        requiredEvidence: ["generatedFile", "promotionEvidence.componentPlan", "acceptance"],
        reviewChecklist: ["Keep public imports stable."]
      }
    ]
  };
  const drafts = {
    version: "0.1.0",
    projectId: "test-product",
    generatedAt: "2026-07-15",
    sourceQueue: "projects/test-product/feedback/queue.json",
    sourceRules: "projects/test-product/feedback/promotion-rules.json",
    drafts: [
      {
        itemId: "fb-20260715-999",
        title: "Strict evidence fixture",
        status: "implemented",
        target: "component",
        action: "update-component",
        destination: "components.manifest.json",
        draftFile: "projects/test-product/feedback/promotions/fb-20260715-999.md",
        sourceStatus: "promoted",
        reviewer: "reviewer",
        reviewedAt: "2026-07-15",
        checklist: ["Reviewed."],
        todos: ["Validate."],
        acceptance: ["Passes."],
        patchDraft: "diff --git a/src/components.tsx b/src/components.tsx\n@@ planned promotion\n+ semantic plan only"
      }
    ]
  };
  const applications = {
    version: "0.1.0",
    projectId: "test-product",
    generatedAt: "2026-07-15",
    sourceDrafts: "projects/test-product/feedback/promotions/index.json",
    plans: [
      {
        itemId: "fb-20260715-999",
        title: "Strict evidence fixture",
        mode: "recorded",
        status: "implemented",
        action: "update-component",
        target: "component",
        destination: "components.manifest.json",
        planFile: "projects/test-product/feedback/promotions/applications/fb-20260715-999.json",
        patchFile: "projects/test-product/feedback/promotions/applications/fb-20260715-999.diff",
        willChangeFiles: ["src/components.tsx", "components.manifest.json", "harness/scenarios/test-product.json"],
        validationCommands: ["npm run validate:feedback"],
        command: "npm run validate:feedback -- fb-20260715-999 --recorded"
      }
    ]
  };
  const applicationDetail = {
    version: "0.1.0",
    projectId: "test-product",
    generatedAt: "2026-07-15",
    itemId: "fb-20260715-999",
    mode: "recorded",
    status: "implemented",
    planFile: "projects/test-product/feedback/promotions/applications/fb-20260715-999.json",
    patchFile: "projects/test-product/feedback/promotions/applications/fb-20260715-999.diff",
    patchPreview: "diff --git a/src/components.tsx b/src/components.tsx\n@@ planned promotion\n+ semantic plan only"
  };

  writeJson(join(feedbackRoot, "queue.json"), queue);
  writeJson(join(feedbackRoot, "promotion-rules.json"), rules);
  writeJson(join(promotionsRoot, "index.json"), drafts);
  writeJson(join(applicationsRoot, "index.json"), applications);
  writeJson(join(applicationsRoot, "fb-20260715-999.json"), applicationDetail);

  return { queue, drafts, applications, applicationDetail };
}

function hashed(root, path) {
  return { path, sha256: createHash("sha256").update(readFileSync(join(root, path))).digest("hex") };
}

function writeRevisionLedger(root, previous, current, { complete = true } = {}) {
  const qualityRoot = join(root, "quality");
  mkdirSync(qualityRoot, { recursive: true });
  const evidencePath = "quality/feedback-revision-evidence.json";
  if (complete) writeJson(join(root, evidencePath), { status: "passed" });
  writeJson(join(qualityRoot, "feedback-implementation-revisions.json"), {
    version: "1.0.0",
    revisions: [
      {
        id: "fixture-implementation-revision-20260715",
        recordedAt: "2026-07-15",
        reason: "Fixture-only canonical naming revision.",
        scope: "One implementation file changes while its promotion evidence remains historical.",
        ...(complete
          ? {
              affectedFeedbackItems: [{ projectId: "test-product", itemId: "fb-20260715-999" }],
              review: { status: "approved", reviewer: "fixture-reviewer", reviewedAt: "2026-07-15" },
              validationCommands: [
                { command: "node scripts/test-feedback-validator.mjs", status: "passed" },
                { command: "node scripts/validate-feedback.mjs", status: "passed" }
              ],
              evidence: [{ type: "harness", status: "passed", ...hashed(root, evidencePath) }]
            }
          : {}),
        files: [
          {
            path: previous.path,
            previousSha256: previous.sha256,
            currentSha256: current.sha256
          }
        ]
      }
    ]
  });
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
