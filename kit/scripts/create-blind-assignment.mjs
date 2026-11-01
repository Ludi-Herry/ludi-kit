import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  sha256Bytes,
  stableDocumentBytes
} from "./blind-protocol-v1.2-lib.mjs";

const values = process.argv.slice(2);

try {
  const runId = readArg("--run-id");
  const privateOut = readArg("--private-out");
  const publicOut = readArg("--public-out");
  if (!runId || !privateOut || !publicOut) {
    throw new Error("--run-id, --private-out and --public-out are required");
  }
  if (!/^blind-prd-(0[1-5])(?:-[a-z0-9][a-z0-9-]*)?$/.test(runId)) {
    throw new Error("--run-id is not canonical");
  }
  const privatePath = resolve(process.cwd(), privateOut);
  const publicPath = resolve(process.cwd(), publicOut);
  if (existsSync(privatePath) || existsSync(publicPath)) {
    throw new Error("assignment outputs already exist; refusing to overwrite");
  }

  const consumerArtifactId = randomUUID();
  const controlArtifactId = randomUUID();
  const consumerFirst = (randomBytes(1)[0] & 1) === 0;
  const privateDocument = {
    version: "1.0.0",
    runId,
    createdAt: new Date().toISOString(),
    assignments: {
      "candidate-a": consumerFirst ? "consumer" : "control",
      "candidate-b": consumerFirst ? "control" : "consumer"
    }
  };
  const privateBytes = stableDocumentBytes(privateDocument);
  const publicDocument = {
    version: "1.0.0",
    runId,
    createdAt: privateDocument.createdAt,
    consumerArtifactId,
    controlArtifactId,
    assignmentCommitment: sha256Bytes(privateBytes),
    privateRevealPath: privateOut.replaceAll("\\", "/")
  };

  mkdirSync(dirname(privatePath), { recursive: true });
  mkdirSync(dirname(publicPath), { recursive: true });
  writeFileSync(privatePath, privateBytes, {
    encoding: "utf8",
    flag: "wx"
  });
  writeFileSync(publicPath, stableDocumentBytes(publicDocument), {
    encoding: "utf8",
    flag: "wx"
  });
  console.log(
    `create-blind-assignment passed: ${runId}; public=${publicOut.replaceAll("\\", "/")}`
  );
} catch (error) {
  console.error(
    `create-blind-assignment failed: ${error instanceof Error ? error.message : String(error)}`
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
