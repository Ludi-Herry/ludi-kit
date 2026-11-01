import { cpSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateImage2CalibrationBatch } from "./validate-image2-calibration.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const kitRoot = resolve(scriptDir, "..");
const sourceRoot = resolve(kitRoot, "quality/image2-calibration/batch-01");
const tempRoot = resolve(kitRoot, `.tmp-image2-calibration-${process.pid}`);

let negative = 0;

try {
  const positive = validateImage2CalibrationBatch(sourceRoot);
  assert(positive.qualified === 3 && positive.disputed === 1, "positive fixture summary drifted");

  expectFailure("review-hash-drift", (root) => {
    mutateJson(root, "inventory-list/reviews/inventory-list-antd-v6-20260809.image2-reviewer-e-20260809.json", (value) => {
      value.inputs.referenceSha256 = "0".repeat(64);
    });
  }, "review input hashes mismatch");

  expectFailure("review-independence-drift", (root) => {
    mutateJson(root, "inventory-list/reviews/inventory-list-antd-v6-20260809.image2-reviewer-e-20260809.json", (value) => {
      value.independence.sawMachineMetricsBeforeFreezingLabel = true;
    });
  }, "saw metrics before label freeze");

  expectFailure("raw-gate-override", (root) => {
    mutateJson(root, "inventory-list/workflow/visual-calibration-decision.json", (value) => {
      value.rawGateOverride = true;
    });
  }, "decision altered a frozen gate");

  expectFailure("dispute-falsely-qualified", (root) => {
    mutateJson(root, "batch-contract.json", (value) => {
      const pair = value.pairs.find((item) => item.pairId === "reports-logs-antd-v6-20260809");
      pair.calibrationLabel = "accepted";
      pair.qualified = true;
    });
  }, "batch pair classification does not match reviews");

  expectFailure("threshold-drift", (root) => {
    mutateJson(root, "content-schedule/workflow/visual-diff-artifacts/metrics.json", (value) => {
      value.global.thresholds.minSsim = 0.9;
    });
  }, "full-page thresholds drifted");

  expectFailure("missing-review", (root) => {
    unlinkSync(resolve(root, "rbac-forbidden/reviews/rbac-forbidden-antd-v6-20260809.image2-reviewer-f-20260809.json"));
  }, "exactly two review records are required");

  expectFailure("inflated-accounting", (root) => {
    mutateJson(root, "batch-contract.json", (value) => {
      value.accounting.qualifiedFromBatch = 4;
    });
  }, "qualifiedFromBatch is inconsistent");

  expectFailure("candidate-byte-drift", (root) => {
    const file = resolve(root, "content-schedule/playwright-full-page.png");
    const bytes = readFileSync(file);
    bytes[bytes.length - 1] ^= 1;
    writeFileSync(file, bytes);
  }, "SHA-256 mismatch");

  expectFailure("confirmed-prompt-drift", (root) => {
    const file = resolve(root, "content-schedule/reference-prompt.v3.proposed.md");
    writeFileSync(file, readFileSync(file, "utf8").replaceAll("closed", "visibly closed"), "utf8");
  }, "confirmed prompt SHA-256 mismatch");

  expectFailure("target-source-drift", (root) => {
    const file = resolve(root, "inventory-list/target/script.js");
    writeFileSync(file, readFileSync(file, "utf8") + "\n", "utf8");
  }, "target script.js receipt mismatch");

  console.log(`test-image2-calibration passed: positive=1; negative=${negative}`);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function expectFailure(name, mutate, expectedMessage) {
  const root = resolve(tempRoot, name);
  mkdirSync(tempRoot, { recursive: true });
  cpSync(sourceRoot, root, { recursive: true });
  mutate(root);
  let failure;
  try {
    validateImage2CalibrationBatch(root);
  } catch (error) {
    failure = error;
  }
  assert(failure, `${name}: validator accepted an invalid fixture`);
  assert(failure.message.includes(expectedMessage), `${name}: unexpected failure: ${failure.message}`);
  negative += 1;
}

function mutateJson(root, relativePath, mutate) {
  const file = resolve(root, relativePath);
  const value = JSON.parse(readFileSync(file, "utf8"));
  mutate(value);
  writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
