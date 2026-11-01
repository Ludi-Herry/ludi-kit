import { resolve } from "node:path";
import { verifyEvaluatorReceiptFiles } from "./blind-protocol-v1.2-lib.mjs";

const values = process.argv.slice(2);

try {
  const receiptArg = readArg("--receipt");
  if (!receiptArg) throw new Error("--receipt is required");
  const result = verifyEvaluatorReceiptFiles(resolve(process.cwd(), receiptArg));
  console.log(
    `validate-blind-evaluator passed: ${result.document.runId}; revision=${result.document.revision}; arms=2`
  );
} catch (error) {
  console.error(
    `validate-blind-evaluator failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
}

function readArg(name) {
  const index = values.indexOf(name);
  if (index === -1) return null;
  const value = values[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}
