import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { runGuidedPilotReadiness } from "./run-guided-pilot-readiness.mjs";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = mkdtempSync(resolve(kitRoot, ".tmp-guided-pilot-readiness-test-"));
const identity = {
  runId: "guided-pilot-readiness-fixture-01",
  artifactId: "f6e5c4b3-a291-4c72-8f01-123456789abc",
  projectId: "guided-readiness-fixture"
};

try {
  const happy = await runFixture("happy");
  assertEqual(happy.result.status, "passed", "happy readiness status");
  assertDeepEqual(
    happy.result.metrics,
    {
      typecheckPass: true,
      buildPass: true,
      flowSmokePass: true,
      previewIdentityPass: true
    },
    "happy readiness metrics"
  );
  assertGuidedReadinessSchema(happy.result);
  assertEqual(happy.result.workspace.sourceManifest.path, "workspace/source-manifest.json", "source receipt path");
  assertEqual(happy.result.workspace.distManifest.path, "workspace/dist-manifest.json", "dist receipt path");
  assertEqual(happy.result.inputs.flowContract.path, "inputs/flow-contract.json", "flow contract receipt path");
  assertEqual(happy.result.inputs.flowRunner.path, "flow/runner.mjs", "flow runner receipt path");
  assertEqual(happy.result.stages.preview.shutdown.status, "passed", "happy preview shutdown status");
  assertEqual(happy.result.stages.preview.shutdown.processExited, true, "happy preview process exited");
  assertEqual(happy.result.stages.preview.shutdown.endpointUnavailable, true, "happy preview endpoint unavailable");
  assertEqual(
    existsSync(resolve(happy.evidenceDir, happy.result.workspace.sourceManifest.path)),
    true,
    "happy source manifest exists"
  );
  assertEqual(
    existsSync(resolve(happy.evidenceDir, happy.result.workspace.distManifest.path)),
    true,
    "happy dist manifest exists"
  );
  const sourceManifest = readJson(resolve(happy.evidenceDir, happy.result.workspace.sourceManifest.path));
  const distManifest = readJson(resolve(happy.evidenceDir, happy.result.workspace.distManifest.path));
  assertEqual(sourceManifest.rootLabel, "source", "source manifest label");
  assertEqual(distManifest.rootLabel, "dist", "dist manifest label");
  assertGuidedTreeManifestSchema(sourceManifest, "happy source manifest");
  assertGuidedTreeManifestSchema(distManifest, "happy dist manifest");
  assertEqual(sourceManifest.files.some((file) => file.path.startsWith("node_modules/")), false, "source excludes node_modules");
  for (const stageName of ["typecheck", "build"]) {
    const commandReceipt = happy.result.stages[stageName].commandEvidence;
    assertReceiptMatches(happy.evidenceDir, commandReceipt, `${stageName} command receipt`);
    const command = readJson(resolve(happy.evidenceDir, commandReceipt.path));
    assertEqual(command.stage, stageName, `${stageName} command stage`);
    assertEqual(existsSync(resolve(dirname(resolve(happy.evidenceDir, commandReceipt.path)), command.stdout.path)), true, `${stageName} stdout capture`);
    assertEqual(existsSync(resolve(dirname(resolve(happy.evidenceDir, commandReceipt.path)), command.stderr.path)), true, `${stageName} stderr capture`);
  }
  await assertEndpointUnavailable(happy.result.stages.preview.baseUrl, "happy preview endpoint after shutdown");

  const sourceDrift = await runFixture("source-drift", { sourceDrift: true });
  assertEqual(sourceDrift.result.status, "failed", "source drift readiness status");
  assertEqual(sourceDrift.result.metrics.buildPass, false, "source drift build metric");
  assertEqual(sourceDrift.result.failure.category, "source-drift", "source drift failure category");
  assertIncludes(sourceDrift.result.stages.build.reason, "source tree changed", "source drift build reason");
  assertEqual(sourceDrift.result.workspace.distManifest !== null, true, "source drift still freezes dist");
  assertGuidedReadinessSchema(sourceDrift.result);

  const identityMismatch = await runFixture("identity-mismatch", {
    publicIdentity: { ...identity, runId: "guided-pilot-readiness-fixture-wrong" }
  });
  assertEqual(identityMismatch.result.status, "failed", "identity mismatch readiness status");
  assertEqual(identityMismatch.result.metrics.previewIdentityPass, false, "identity mismatch preview metric");
  assertEqual(identityMismatch.result.stages.preview.identity.status, "failed", "identity mismatch identity check");
  assertEqual(identityMismatch.result.stages.preview.shutdown.status, "passed", "identity mismatch shutdown");
  assertEqual(identityMismatch.result.stages.flowSmoke.status, "not-run", "identity mismatch blocks flow");
  assertGuidedReadinessSchema(identityMismatch.result);
  await assertEndpointUnavailable(
    identityMismatch.result.stages.preview.baseUrl,
    "identity mismatch preview endpoint after shutdown"
  );

  const flowFailure = await runFixture("flow-failure", { flowFailure: true });
  assertEqual(flowFailure.result.status, "failed", "flow failure readiness status");
  assertEqual(flowFailure.result.metrics.flowSmokePass, false, "flow failure metric");
  assertEqual(flowFailure.result.stages.preview.status, "passed", "flow failure preserves preview success");
  assertEqual(flowFailure.result.stages.flowSmoke.status, "failed", "flow failure stage");
  assertEqual(flowFailure.result.stages.flowSmoke.result !== null, true, "failed flow result receipt retained");
  const failedFlowResult = readJson(
    resolve(flowFailure.evidenceDir, flowFailure.result.stages.flowSmoke.result.path)
  );
  assertEqual(failedFlowResult.status, "failed", "failed flow result status retained");
  assertGuidedReadinessSchema(flowFailure.result);
  await assertEndpointUnavailable(flowFailure.result.stages.preview.baseUrl, "flow failure preview endpoint after shutdown");

  const prohibited = await runFixture("prohibited-product-test", { productAssertion: true });
  assertEqual(prohibited.result.status, "failed", "product assertion rejection status");
  assertEqual(prohibited.result.failure.category, "product-owned-assertion", "product assertion rejection category");
  assertEqual(prohibited.result.stages.typecheck.status, "not-run", "product assertion blocks commands");
  assertGuidedReadinessSchema(prohibited.result);

  console.log(
    "test-guided-pilot-readiness passed: happy path, source drift, identity mismatch, retained flow failure, clean shutdown, and product assertion rejection"
  );
} catch (error) {
  console.error(`test-guided-pilot-readiness failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  const resolvedRoot = resolve(tempRoot);
  const expectedPrefix = `${resolve(kitRoot)}\\.tmp-guided-pilot-readiness-test-`;
  if (!resolvedRoot.startsWith(expectedPrefix)) {
    throw new Error(`refusing to clean unexpected readiness test root: ${resolvedRoot}`);
  }
  rmSync(resolvedRoot, { recursive: true, force: true });
}

async function runFixture(name, options = {}) {
  const workspace = resolve(tempRoot, `workspace-${name}`);
  const evidenceDir = resolve(tempRoot, `evidence-${name}`);
  const flowContractPath = resolve(tempRoot, "contracts", `${name}.json`);
  createProductFixture(workspace, options);
  writeJson(flowContractPath, buildFlowContract(name, options.flowFailure === true));
  const outcome = await runGuidedPilotReadiness({
    workspace,
    evidenceDir,
    runId: identity.runId,
    artifactId: identity.artifactId,
    projectId: identity.projectId,
    flowContractPath,
    commandTimeoutMs: 30_000,
    previewTimeoutMs: 10_000,
    flowTimeoutMs: 10_000
  });
  assertEqual(outcome.resultPath, resolve(evidenceDir, "result.json"), `${name} fixed result path`);
  assertEqual(existsSync(outcome.resultPath), true, `${name} result exists`);
  return { ...outcome, evidenceDir, workspace };
}

function createProductFixture(workspace, options) {
  mkdirSync(resolve(workspace, "public"), { recursive: true });
  mkdirSync(resolve(workspace, "src"), { recursive: true });
  mkdirSync(resolve(workspace, "scripts"), { recursive: true });
  mkdirSync(resolve(workspace, "node_modules/vite/bin"), { recursive: true });

  const publicIdentity = options.publicIdentity ?? identity;
  writeJson(resolve(workspace, "public/artifact-meta.json"), publicIdentity);
  writeJson(resolve(workspace, "package.json"), {
    name: "guided-pilot-readiness-fixture",
    version: "1.0.0",
    private: true,
    type: "module",
    scripts: {
      typecheck: "node scripts/typecheck.mjs",
      build: "node scripts/build.mjs",
      preview: "vite preview"
    }
  });
  writeFileSync(resolve(workspace, "scripts/typecheck.mjs"), "process.exitCode = 0;\n", "utf8");
  writeFileSync(resolve(workspace, "scripts/build.mjs"), buildFixtureScript(), "utf8");
  writeFileSync(resolve(workspace, "src/index.html"), fixtureHtml(), "utf8");
  writeFileSync(resolve(workspace, "node_modules/vite/bin/vite.js"), fakeVitePreview(), "utf8");
  if (options.sourceDrift) writeFileSync(resolve(workspace, "force-source-drift"), "true\n", "utf8");
  if (options.productAssertion) {
    writeFileSync(resolve(workspace, "scripts/flow-check.mjs"), "process.exitCode = 0;\n", "utf8");
  }
}

function buildFixtureScript() {
  return [
    'import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";',
    'import { resolve } from "node:path";',
    "const root = process.cwd();",
    'mkdirSync(resolve(root, "dist"), { recursive: true });',
    'writeFileSync(resolve(root, "dist/index.html"), readFileSync(resolve(root, "src/index.html")));',
    'writeFileSync(resolve(root, "dist/artifact-meta.json"), readFileSync(resolve(root, "public/artifact-meta.json")));',
    'if (existsSync(resolve(root, "force-source-drift"))) {',
    '  writeFileSync(resolve(root, "src/post-build-drift.txt"), "drift\\n");',
    "}",
    ""
  ].join("\n");
}

function fixtureHtml() {
  return `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Guided readiness fixture</title></head>
<body>
  <main id="app"><button data-testid="next">Continue</button></main>
  <script>
    document.querySelector('[data-testid="next"]').addEventListener("click", () => {
      document.getElementById("app").innerHTML = '<div data-testid="complete">Complete</div>';
    });
  </script>
</body>
</html>
`;
}

function fakeVitePreview() {
  return `import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const port = Number(args[portIndex + 1]);
const root = process.cwd();
const server = createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/artifact-meta.json") {
    const bytes = readFileSync(resolve(root, "dist/artifact-meta.json"));
    response.statusCode = 200;
    response.setHeader("Content-Type", "application/json");
    response.end(bytes);
    return;
  }
  if (url.pathname === "/") {
    const bytes = readFileSync(resolve(root, "dist/index.html"));
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(bytes);
    return;
  }
  response.statusCode = 404;
  response.end("not found");
});
server.listen(port, "127.0.0.1");
const stop = () => server.close(() => process.exit(0));
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
`;
}

function buildFlowContract(name, flowFailure) {
  return {
    $schema: "guided-pilot-flow-contract.v1",
    version: "1.0.0",
    contractId: `guided-pilot-readiness-${name}`,
    owner: "guided-pilot-harness",
    projectId: identity.projectId,
    source: {
      kind: "consumed-historical-prd",
      historicalReceipt: {
        path: "quality/blind-runs/fixture/input-receipt.json",
        bytes: 1,
        sha256: sha256(Buffer.from("historical-receipt", "utf8"))
      },
      currentPrd: {
        bytes: 1,
        sha256: sha256(Buffer.from("current-prd", "utf8"))
      }
    },
    entry: {
      route: "/",
      identityPath: "/artifact-meta.json"
    },
    requiredTestIds: ["next", "complete"],
    flows: [
      {
        flowId: "complete-flow",
        steps: [
          {
            stepId: "click-next",
            pageId: "entry",
            action: { type: "click", testId: flowFailure ? "missing-action" : "next" },
            assertions: [
              { kind: "visibleTestId", testId: "complete" },
              { kind: "absentTestId", testId: "next" }
            ]
          },
          {
            stepId: "return-entry",
            pageId: "entry",
            action: { type: "navigate", route: "/" },
            assertions: [{ kind: "visibleTestId", testId: "next" }]
          }
        ]
      }
    ]
  };
}

function assertGuidedReadinessSchema(result) {
  const schema = readJson(resolve(kitRoot, "schema/guided-pilot-readiness.schema.json"));
  const validate = new Ajv2020({ allErrors: true, strict: false, validateFormats: false }).compile(schema);
  if (!validate(result)) {
    throw new Error(`guided readiness result schema failed: ${JSON.stringify(validate.errors)}`);
  }
}

function assertGuidedTreeManifestSchema(manifest, label) {
  const schema = readJson(resolve(kitRoot, "schema/guided-pilot-tree-manifest.schema.json"));
  const validate = new Ajv2020({ allErrors: true, strict: false, validateFormats: false }).compile(schema);
  if (!validate(manifest)) {
    throw new Error(`${label} schema failed: ${JSON.stringify(validate.errors)}`);
  }
}

function assertReceiptMatches(root, receipt, label) {
  const path = resolve(root, receipt.path);
  const bytes = readFileSync(path);
  assertEqual(bytes.length, receipt.bytes, `${label} byte count`);
  assertEqual(sha256(bytes), receipt.sha256, `${label} SHA-256`);
}

async function assertEndpointUnavailable(baseUrl, label) {
  try {
    await fetch(baseUrl, { signal: AbortSignal.timeout(1_000) });
  } catch {
    return;
  }
  throw new Error(`${label}: endpoint remained reachable`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

function assertIncludes(actual, expected, label) {
  if (typeof actual !== "string" || !actual.includes(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(actual)} to include ${expected}`);
  }
}

function assertDeepEqual(actual, expected, label) {
  const left = JSON.stringify(sortValue(actual));
  const right = JSON.stringify(sortValue(expected));
  if (left !== right) throw new Error(`${label}: expected ${right}, received ${left}`);
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortValue(value[key])])
  );
}
