import { resolve } from "node:path";
import {
  verifyAcceptanceEvidence,
  verifyFrozenArtifact
} from "./same-artifact-lib.mjs";
import { verifyArtifactV12 } from "./freeze-artifact-v1.2.mjs";

const values = process.argv.slice(2);

try {
  const projectRootArg = readArg("--project-root");
  if (!projectRootArg) throw new Error("--project-root is required");
  const projectRoot = resolve(process.cwd(), projectRootArg);
  const evidencePath = readArg("--evidence");
  const preRevealArg = readArg("--pre-reveal-contract");
  if (preRevealArg && evidencePath) {
    throw new Error("--evidence for v1.2 must be verified by the evaluator evidence validator");
  }
  const context = preRevealArg
    ? verifyArtifactV12({
        projectRoot,
        preRevealPath: resolve(process.cwd(), preRevealArg),
        armId: readArg("--arm")
      })
    : evidencePath
      ? verifyAcceptanceEvidence(projectRoot, evidencePath)
      : verifyFrozenArtifact(projectRoot);
  const subject = evidencePath ? "artifact and evidence" : "frozen artifact";
  console.log(`verify-artifact-under-test passed: ${context.receipt.projectId}; ${subject}`);
} catch (error) {
  console.error(`verify-artifact-under-test failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

function readArg(name) {
  const index = values.indexOf(name);
  if (index === -1) return null;
  const value = values[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}
