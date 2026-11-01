import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildGuidedPilotGenerationPrompt,
  guidedPilotGenerationAgent,
  runGuidedPilotGenerationAgent
} from "./run-guided-pilot-generation-agent.mjs";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = mkdtempSync(resolve(kitRoot, ".tmp-guided-pilot-generation-agent-test-"));
const runId = "guided-pilot-multimodel-20260809-01";
const artifactId = "2c454720-3fad-41e8-b1f7-48ef312e19ae";
let negativeCount = 0;

try {
  assertPromptContract();
  assertCodexWriteInvocation();

  const positiveWorkspace = createWorkspace(resolve(tempRoot, "positive-workspace"));
  const positive = await runGuidedPilotGenerationAgent({
    workspace: positiveWorkspace,
    evidenceDir: resolve(tempRoot, "positive-evidence"),
    runId,
    artifactId,
    provider: "claude",
    model: "claude-sonnet-5",
    reasoningEffort: "high",
    timeoutMs: 10_000,
    commandOverride: {
      executable: process.execPath,
      args: [
        "-e",
        [
          "const fs = require('node:fs');",
          "fs.mkdirSync('src', { recursive: true });",
          "fs.writeFileSync('package.json', '{\\\"name\\\":\\\"guided-pilot-fixture\\\"}');",
          "fs.writeFileSync('index.html', '<!doctype html><main id=\\\"app\\\"></main>');",
          "fs.writeFileSync('src/main.tsx', 'export {}');"
        ].join("")
      ]
    }
  });
  assertEqual(positive.evidence.status, "passed", "successful command status");
  assertEqual(positive.evidence.qualifying, false, "successful qualifying boundary");
  assertEqual(positive.evidence.scoring, false, "successful scoring boundary");
  assertEqual(positive.evidence.arm, "consumer", "successful consumer arm");
  assertEqual(positive.evidence.outputMode, "kit-consumer", "successful output mode");
  assertEqual(positive.evidence.runId, runId, "successful run ID");
  assertEqual(positive.evidence.artifactId, artifactId, "successful artifact ID");
  assertEqual(positive.evidence.failure, null, "successful failure");
  assertEqual(positive.evidence.failureCategory, null, "successful failure category");
  assertEqual(positive.evidence.terminationSignal, null, "successful termination signal");
  assertEqual(
    positive.evidence.immutableBeforeSha256,
    positive.evidence.immutableAfterSha256,
    "successful immutable input tree"
  );
  assertEqual(
    positive.evidence.consumerPackage.tarball.path,
    "vendor/ai-readable-kit-fixture.tgz",
    "successful tarball receipt"
  );
  assertEqual(
    positive.evidence.consumerPackage.receipt.path,
    "consumer-package-receipt.json",
    "successful package receipt"
  );
  assertEqual(
    positive.evidence.runner.path,
    "scripts/run-guided-pilot-generation-agent.mjs",
    "successful runner receipt"
  );
  assertDeepEqual(
    positive.evidence.requiredOutputVerification,
    {
      requiredOutputs: ["package.json", "index.html", "src", "public/artifact-meta.json"],
      missingOutputs: []
    },
    "successful required output verification"
  );
  assertEqual(existsSync(positive.evidencePath), true, "successful command evidence file");
  assertDeepEqual(
    readdirSync(dirname(positive.evidencePath)).sort(),
    ["command.json", "prompt.md", "stderr.log", "stdout.log"],
    "successful evidence files"
  );
  const command = readJson(positive.evidencePath);
  assertEqual(command.status, "passed", "written command status");
  assertEqual(command.stdout.sha256, positive.evidence.stdout.sha256, "written stdout receipt");

  const zeroOutputWorkspace = createWorkspace(resolve(tempRoot, "zero-output-workspace"));
  const zeroOutput = await runGuidedPilotGenerationAgent({
    workspace: zeroOutputWorkspace,
    evidenceDir: resolve(tempRoot, "zero-output-evidence"),
    runId,
    artifactId,
    timeoutMs: 10_000,
    commandOverride: {
      executable: process.execPath,
      args: ["-e", "process.stdout.write('no product files')"]
    }
  });
  assertEqual(zeroOutput.evidence.status, "failed", "zero output status");
  assertEqual(zeroOutput.evidence.exitCode, 0, "zero output exit code");
  assertEqual(zeroOutput.evidence.timedOut, false, "zero output timeout");
  assertEqual(zeroOutput.evidence.failureCategory, "required-output-missing", "zero output category");
  assertDeepEqual(
    zeroOutput.evidence.requiredOutputVerification,
    {
      requiredOutputs: ["package.json", "index.html", "src", "public/artifact-meta.json"],
      missingOutputs: ["package.json", "index.html", "src"]
    },
    "zero output verification"
  );
  assertIncludes(zeroOutput.evidence.failure, "required outputs", "zero output failure");
  negativeCount += 1;

  const immutableWorkspace = createWorkspace(resolve(tempRoot, "immutable-workspace"));
  const immutable = await runGuidedPilotGenerationAgent({
    workspace: immutableWorkspace,
    evidenceDir: resolve(tempRoot, "immutable-evidence"),
    runId,
    artifactId,
    timeoutMs: 10_000,
    commandOverride: {
      executable: process.execPath,
      args: ["-e", "require('node:fs').appendFileSync('guided-prd.md', 'drift')"]
    }
  });
  assertEqual(immutable.evidence.status, "failed", "immutable drift status");
  assertEqual(immutable.evidence.timedOut, false, "immutable drift timeout");
  assertNotEqual(
    immutable.evidence.immutableBeforeSha256,
    immutable.evidence.immutableAfterSha256,
    "immutable drift input tree"
  );
  assertIncludes(immutable.evidence.failure, "frozen workspace inputs", "immutable drift failure");
  assertEqual(immutable.evidence.failureCategory, "immutable-input-drift", "immutable drift category");
  negativeCount += 1;

  const timeoutWorkspace = createWorkspace(resolve(tempRoot, "timeout-workspace"));
  const timedOut = await runGuidedPilotGenerationAgent({
    workspace: timeoutWorkspace,
    evidenceDir: resolve(tempRoot, "timeout-evidence"),
    runId,
    artifactId,
    timeoutMs: 100,
    commandOverride: {
      executable: process.execPath,
      args: ["-e", "setTimeout(() => {}, 10000)"]
    }
  });
  assertEqual(timedOut.evidence.status, "failed", "timeout status");
  assertEqual(timedOut.evidence.timedOut, true, "timeout marker");
  assertIncludes(timedOut.evidence.failure, "timed out", "timeout failure");
  assertEqual(timedOut.evidence.failureCategory, "command-timeout", "timeout category");
  negativeCount += 1;

  const nonzeroWorkspace = createWorkspace(resolve(tempRoot, "nonzero-workspace"));
  const nonzero = await runGuidedPilotGenerationAgent({
    workspace: nonzeroWorkspace,
    evidenceDir: resolve(tempRoot, "nonzero-evidence"),
    runId,
    artifactId,
    timeoutMs: 10_000,
    commandOverride: {
      executable: process.execPath,
      args: ["-e", "process.stdout.write('expected failure'); process.exit(7)"]
    }
  });
  assertEqual(nonzero.evidence.status, "failed", "nonzero status");
  assertEqual(nonzero.evidence.exitCode, 7, "nonzero exit code");
  assertEqual(nonzero.evidence.timedOut, false, "nonzero timeout");
  assertIncludes(nonzero.evidence.failure, "exited 7", "nonzero failure");
  assertEqual(nonzero.evidence.failureCategory, "command-exit-nonzero", "nonzero category");
  negativeCount += 1;

  console.log(
    `test-guided-pilot-generation-agent passed: isolated consumer fixture, immutable inputs, timeout, and nonzero evidence; ${negativeCount} negative cases rejected`
  );
} catch (error) {
  console.error(
    `test-guided-pilot-generation-agent failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
} finally {
  const resolvedRoot = resolve(tempRoot);
  const expectedPrefix = `${resolve(kitRoot)}\\.tmp-guided-pilot-generation-agent-test-`;
  if (!resolvedRoot.startsWith(expectedPrefix)) {
    throw new Error(`refusing to clean unexpected guided-pilot test root: ${resolvedRoot}`);
  }
  rmSync(resolvedRoot, { recursive: true, force: true });
}

function assertPromptContract() {
  const prompt = buildGuidedPilotGenerationPrompt();
  const orderedReads = [
    "AGENTS.md",
    "generation-request.json",
    "guided-prd.md",
    "project-description.json",
    "sample-pack.json",
    "business-context.json",
    "flow-contract.json",
    "artifact-identity.json"
  ];
  let prior = -1;
  for (const name of orderedReads) {
    const current = prompt.indexOf(name);
    if (current <= prior) throw new Error(`guided-pilot prompt read order drifted at ${name}`);
    prior = current;
  }
  assertIncludes(prompt, "only the vendored @ai-readable/kit", "prompt package boundary");
  assertIncludes(prompt, "React 19 + TypeScript + Vite", "prompt stack boundary");
  assertIncludes(prompt, "Do not create product-owned tests", "prompt harness boundary");
  assertIncludes(prompt, "Simplified Chinese", "prompt copy boundary");
  assertIncludes(prompt, "Do not browse the web", "prompt isolation boundary");
}

function assertCodexWriteInvocation() {
  const workspace = "H:/guided-pilot-fixture";
  const invocation = guidedPilotGenerationAgent.codexInvocation({
    workspace,
    model: "gpt-5.6-terra",
    reasoningEffort: "high"
  });
  assertIncludes(
    invocation.args,
    "--dangerously-bypass-approvals-and-sandbox",
    "Codex write invocation"
  );
  assertEqual(invocation.args.includes("workspace-write"), false, "obsolete Codex sandbox mode");
  const workspaceIndex = invocation.args.indexOf("-C");
  assertEqual(invocation.args[workspaceIndex + 1], workspace, "Codex fixed workspace");
}

function createWorkspace(workspace) {
  mkdirSync(resolve(workspace, "public"), { recursive: true });
  mkdirSync(resolve(workspace, "vendor"), { recursive: true });
  const packageBytes = Buffer.from("guided-pilot-package-fixture", "utf8");
  const tarballPath = resolve(workspace, "vendor/ai-readable-kit-fixture.tgz");
  writeFileSync(tarballPath, packageBytes);
  const packageReceipt = {
    version: "1.0.0",
    package: {
      name: "@ai-readable/kit",
      path: ".local-pack/ai-readable-kit-fixture.tgz",
      bytes: packageBytes.length,
      sha256: sha256(packageBytes)
    }
  };
  const packageReceiptPath = resolve(workspace, "consumer-package-receipt.json");
  writeJson(packageReceiptPath, packageReceipt);
  const receiptBytes = readFileSync(packageReceiptPath);
  writeFileSync(resolve(workspace, "AGENTS.md"), "# Guided pilot fixture\n", "utf8");
  writeJson(resolve(workspace, "artifact-identity.json"), {
    runId,
    artifactId,
    arm: "consumer",
    projectId: "guided-multi-model-platform"
  });
  writeJson(resolve(workspace, "business-context.json"), {
    frontendFoundation: { outputMode: "kit-consumer" }
  });
  writeJson(resolve(workspace, "generation-request.json"), {
    qualifying: false,
    scoring: false,
    requiredOutputs: ["package.json", "index.html", "src", "public/artifact-meta.json"],
    consumerPackage: {
      name: "@ai-readable/kit",
      version: "0.1.0",
      receipt: {
        path: "consumer-package-receipt.json",
        bytes: receiptBytes.length,
        sha256: sha256(receiptBytes)
      },
      tarball: {
        path: "vendor/ai-readable-kit-fixture.tgz",
        fileName: "ai-readable-kit-fixture.tgz",
        bytes: packageBytes.length,
        sha256: sha256(packageBytes)
      }
    }
  });
  writeJson(resolve(workspace, "project-description.json"), { projectId: "guided-multi-model-platform" });
  writeJson(resolve(workspace, "sample-pack.json"), { samples: [{ id: "sample-01" }] });
  writeJson(resolve(workspace, "flow-contract.json"), {
    entry: { route: "/overview" },
    requiredTestIds: ["guided-pilot-open"]
  });
  writeFileSync(resolve(workspace, "guided-prd.md"), "# 历史 PRD\n\n保留项目事实。\n", "utf8");
  writeJson(resolve(workspace, "public/artifact-meta.json"), { runId, artifactId });
  return workspace;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertDeepEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

function assertNotEqual(actual, expected, label) {
  if (actual === expected) throw new Error(`${label}: values unexpectedly matched`);
}

function assertIncludes(actual, expected, label) {
  if (!String(actual).includes(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(actual)} to include ${expected}`);
  }
}
