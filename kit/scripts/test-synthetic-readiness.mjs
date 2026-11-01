import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileSyntheticSemanticContract } from "./compile-synthetic-semantic-contract.mjs";
import { generateSyntheticBlindPrd } from "./generate-synthetic-blind-prd.mjs";
import {
  flowStartRoute,
  isIgnorableOptionalFavicon,
  runSyntheticFlowSmoke
} from "./run-synthetic-flow-smoke.mjs";
import { runSyntheticReadiness } from "./run-synthetic-readiness.mjs";
import {
  isCanonicalReadinessSummaryPath,
  validateSyntheticReadinessSummary
} from "./validate-synthetic-readiness.mjs";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = mkdtempSync(resolve(kitRoot, ".tmp-synthetic-readiness-test-"));
let negativeCount = 0;

try {
  assertEqual(
    isIgnorableOptionalFavicon(
      "http://127.0.0.1:4173/favicon.ico",
      "http://127.0.0.1:4173",
      "Failed to load resource: the server responded with a status of 404 (Not Found)"
    ),
    true,
    "same-origin optional favicon console noise"
  );
  assertEqual(
    isIgnorableOptionalFavicon(
      "http://127.0.0.1:4173/app.js",
      "http://127.0.0.1:4173",
      "Failed to load resource: the server responded with a status of 404 (Not Found)"
    ),
    false,
    "same-origin business resource failure"
  );
  assertEqual(
    isIgnorableOptionalFavicon(
      "http://localhost:4173/favicon.ico",
      "http://127.0.0.1:4173",
      "Failed to load resource: the server responded with a status of 404 (Not Found)"
    ),
    false,
    "cross-origin favicon failure"
  );
  assertEqual(
    isIgnorableOptionalFavicon(
      "http://127.0.0.1:4173/favicon.ico",
      "http://127.0.0.1:4173",
      "intentional app console error"
    ),
    false,
    "application console error at favicon URL"
  );
  assertEqual(
    flowStartRoute({ steps: [{ pageId: "page-02" }] }),
    "/page-02",
    "flow starts from its frozen first-step page"
  );
  expectFailure(
    "unsafe flow start pageId",
    "unsafe flow start pageId",
    () => flowStartRoute({ steps: [{ pageId: "../escape" }] })
  );
  negativeCount += 1;
  assertEqual(
    isCanonicalReadinessSummaryPath(
      tempRoot,
      resolve(tempRoot, "historical-wide-01/cycle-01/consumer/readiness/readiness-summary.json")
    ),
    true,
    "canonical matrix readiness path"
  );
  assertEqual(
    isCanonicalReadinessSummaryPath(
      tempRoot,
      resolve(tempRoot, "historical-wide-01/cycle-01/consumer/readiness-attempt-01/readiness-summary.json")
    ),
    false,
    "attempt readiness excluded from matrix"
  );
  assertEqual(
    isCanonicalReadinessSummaryPath(
      tempRoot,
      resolve(tempRoot, "historical-wide-01/cycle-01/consumer/readiness-diagnostic-01/readiness-summary.json")
    ),
    false,
    "diagnostic readiness excluded from matrix"
  );
  negativeCount += 2;

  const inputDir = resolve(tempRoot, "inputs");
  generateSyntheticBlindPrd({ profileId: "compact-flow-02", seed: "7101", outDir: inputDir });
  compileSyntheticSemanticContract({ inputDir });

  const positiveWorkspace = resolve(tempRoot, "workspace-positive");
  createProductFixture(positiveWorkspace, inputDir, { duplicateState: false });
  const positiveEvidence = resolve(tempRoot, "evidence-positive");
  const positive = await runSyntheticReadiness({
    workspace: positiveWorkspace,
    inputDir,
    arm: "consumer",
    cycle: 1,
    evidenceDir: positiveEvidence,
    commandTimeoutMs: 30_000,
    previewTimeoutMs: 10_000,
    flowTimeoutMs: 10_000
  });
  if (positive.summary.status !== "passed") {
    const flowResult = positive.summary.stages.flowSmoke.result
      ? readJson(resolve(positiveEvidence, positive.summary.stages.flowSmoke.result.path))
      : null;
    throw new Error(
      `positive readiness failed: ${JSON.stringify({ failure: positive.summary.failure, flowFailure: flowResult?.firstFailure, observations: flowResult?.observations })}`
    );
  }
  assertDeepEqual(
    positive.summary.metrics,
    {
      typecheckPass: true,
      buildPass: true,
      flowSmokePass: true,
      previewIdentityPass: true
    },
    "positive stage metrics"
  );
  validateSyntheticReadinessSummary(positive.summaryPath);
  const previewCommand = readJson(
    resolve(positiveEvidence, positive.summary.stages.preview.commandEvidence.path)
  );
  assertEqual(previewCommand.stdout.bytes, 0, "zero-byte preview stdout evidence");
  assertEqual(previewCommand.stderr.bytes, 0, "zero-byte preview stderr evidence");
  assertEqual(previewCommand.stdout.sha256, sha256(Buffer.alloc(0)), "empty stdout SHA-256");
  const positiveFlowResult = readJson(
    resolve(positiveEvidence, positive.summary.stages.flowSmoke.result.path)
  );
  const ignoredFaviconUrls = [
    ...positiveFlowResult.observations.ignoredConsoleErrors,
    ...positiveFlowResult.observations.ignoredResponses,
    ...positiveFlowResult.observations.ignoredRequestFailures
  ].map(({ url }) => url);
  assertEqual(
    ignoredFaviconUrls.includes(`${positive.summary.stages.preview.baseUrl}/favicon.ico`),
    true,
    `optional favicon failure retained as ignored evidence: ${JSON.stringify(positiveFlowResult.observations)}`
  );
  assertEqual(positiveFlowResult.observations.failedResponses.length, 0, "no actionable failed responses");

  const consoleErrorWorkspace = resolve(tempRoot, "workspace-console-error");
  createProductFixture(consoleErrorWorkspace, inputDir, {
    duplicateState: false,
    consoleError: true
  });
  const consoleErrorEvidence = resolve(tempRoot, "evidence-console-error");
  const consoleError = await runSyntheticReadiness({
    workspace: consoleErrorWorkspace,
    inputDir,
    arm: "consumer",
    cycle: 2,
    evidenceDir: consoleErrorEvidence,
    commandTimeoutMs: 30_000,
    previewTimeoutMs: 10_000,
    flowTimeoutMs: 10_000
  });
  assertEqual(consoleError.summary.metrics.flowSmokePass, false, "application console error flow metric");
  assertEqual(consoleError.summary.metrics.previewIdentityPass, true, "application console error preview metric");
  assertEqual(consoleError.summary.failure.category, "flow-smoke", "application console error category");
  const consoleErrorFlowResult = readJson(
    resolve(consoleErrorEvidence, consoleError.summary.stages.flowSmoke.result.path)
  );
  assertEqual(
    consoleErrorFlowResult.observations.consoleErrors.includes("intentional app console error"),
    true,
    "application console error retained as actionable evidence"
  );
  validateSyntheticReadinessSummary(consoleError.summaryPath);
  negativeCount += 1;

  const duplicateWorkspace = resolve(tempRoot, "workspace-duplicate-testid");
  createProductFixture(duplicateWorkspace, inputDir, { duplicateState: true });
  const duplicateEvidence = resolve(tempRoot, "evidence-duplicate-testid");
  const duplicate = await runSyntheticReadiness({
    workspace: duplicateWorkspace,
    inputDir,
    arm: "consumer",
    cycle: 2,
    evidenceDir: duplicateEvidence,
    commandTimeoutMs: 30_000,
    previewTimeoutMs: 10_000,
    flowTimeoutMs: 3_000
  });
  assertEqual(duplicate.summary.metrics.flowSmokePass, false, "duplicate data-testid flow metric");
  assertEqual(duplicate.summary.metrics.previewIdentityPass, true, "duplicate data-testid preview metric");
  assertEqual(duplicate.summary.failure.category, "flow-smoke", "duplicate data-testid failure category");
  const duplicateFlowResult = readJson(
    resolve(duplicateEvidence, duplicate.summary.stages.flowSmoke.result.path)
  );
  assertEqual(duplicateFlowResult.flows[0].status, "failed", "failed flow terminal status");
  validateSyntheticReadinessSummary(duplicate.summaryPath);
  negativeCount += 1;

  for (const mutation of summaryMutations()) {
    const evidenceDir = resolve(tempRoot, `evidence-mutation-${mutation.name}`);
    cpSync(positiveEvidence, evidenceDir, { recursive: true });
    mutation.apply(evidenceDir);
    expectFailure(
      mutation.name,
      mutation.message,
      () => validateSyntheticReadinessSummary(resolve(evidenceDir, "readiness-summary.json"))
    );
    negativeCount += 1;
  }

  const contract = readJson(resolve(inputDir, "semantic-contract.json"));
  for (const selectorField of ["text", "role", "sameRow", "className"]) {
    const mutation = structuredClone(contract);
    mutation.flows[0].steps[0].action[selectorField] = "prohibited-selector";
    const path = resolve(tempRoot, `selector-${selectorField}.json`);
    writeJson(path, mutation);
    await expectAsyncFailure(
      `selector ${selectorField}`,
      "semantic contract schema failed",
      () =>
        runSyntheticFlowSmoke({
          baseUrl: "http://127.0.0.1:4173",
          contractPath: path,
          expectedContractSha256: sha256(readFileSync(path)),
          timeoutMs: 100
        })
    );
    negativeCount += 1;
  }

  console.log(
    `test-synthetic-readiness passed: copy-independent browser flow; 4 split metrics; ${negativeCount} negative cases rejected`
  );
} catch (error) {
  console.error(`test-synthetic-readiness failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  const resolvedRoot = resolve(tempRoot);
  const expectedPrefix = `${resolve(kitRoot)}\\.tmp-synthetic-readiness-test-`;
  if (!resolvedRoot.startsWith(expectedPrefix)) {
    throw new Error(`refusing to clean unexpected readiness test root: ${resolvedRoot}`);
  }
  rmSync(resolvedRoot, { recursive: true, force: true });
}

function createProductFixture(workspace, inputDir, { duplicateState, consoleError = false }) {
  mkdirSync(resolve(workspace, "public"), { recursive: true });
  mkdirSync(resolve(workspace, "src"), { recursive: true });
  mkdirSync(resolve(workspace, "scripts"), { recursive: true });
  mkdirSync(resolve(workspace, "vendor"), { recursive: true });
  mkdirSync(resolve(workspace, "node_modules/vite/bin"), { recursive: true });
  for (const name of ["synthetic-prd.md", "project-description.json", "sample-pack.json", "semantic-contract.json"]) {
    cpSync(resolve(inputDir, name), resolve(workspace, name));
  }
  cpSync(resolve(inputDir, "consumer-business-context.json"), resolve(workspace, "business-context.json"));
  cpSync(resolve(inputDir, "consumer-artifact-identity.json"), resolve(workspace, "artifact-identity.json"));
  cpSync(resolve(inputDir, "consumer-artifact-identity.json"), resolve(workspace, "public/artifact-meta.json"));
  const packageBytes = Buffer.from("synthetic-package-fixture", "utf8");
  writeFileSync(resolve(workspace, "vendor/ai-readable-kit-fixture.tgz"), packageBytes);
  writeJson(resolve(workspace, "consumer-package-receipt.json"), {
    purpose: "synthetic-generation-readiness",
    frozenPack: {
      path: ".local-pack/ai-readable-kit-fixture.tgz",
      bytes: packageBytes.length,
      sha256: sha256(packageBytes)
    }
  });
  writeJson(resolve(workspace, "package.json"), {
    name: "synthetic-readiness-fixture",
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
  writeFileSync(
    resolve(workspace, "scripts/build.mjs"),
    [
      'import { copyFileSync, mkdirSync } from "node:fs";',
      'import { resolve } from "node:path";',
      'const root = process.cwd();',
      'mkdirSync(resolve(root, "dist"), { recursive: true });',
      'copyFileSync(resolve(root, "src/index.html"), resolve(root, "dist/index.html"));',
      'copyFileSync(resolve(root, "public/artifact-meta.json"), resolve(root, "dist/artifact-meta.json"));',
      ""
    ].join("\n"),
    "utf8"
  );
  writeFileSync(
    resolve(workspace, "src/index.html"),
    productHtml({ duplicateState, consoleError }),
    "utf8"
  );
  writeFileSync(resolve(workspace, "node_modules/vite/bin/vite.js"), fakeViteServer(), "utf8");
}

function productHtml({ duplicateState, consoleError }) {
  const duplicate = duplicateState
    ? '<div data-testid="flow-01-step-01-state">COPY-RENAMED-DUPLICATE</div>'
    : "";
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="/favicon.ico"><title>Renamed copy fixture</title></head>
<body>
  <img src="/favicon.ico" alt="" hidden>
  <main id="app"></main>
  <script>
    ${consoleError ? 'console.error("intentional app console error");' : ""}
    const root = document.getElementById("app");
    const go = (route) => { history.pushState({}, "", route); render(); };
    function render() {
      const route = location.pathname;
      if (route === "/page-02") {
        root.innerHTML = \
          '<h1>COPY-RENAMED-BETA</h1>' +
          '<input data-testid="flow-01-step-02-action" aria-label="renamed fill">' +
          '<button data-testid="flow-01-recovery-action">COPY-RENAMED-RECOVER</button>' +
          '<div data-testid="flow-01-step-01-state">COPY-RENAMED-STATE-A</div>' +
          '${duplicate}' +
          '<div data-testid="flow-01-step-04-state">COPY-RENAMED-STATE-D</div>' +
          '<div data-testid="flow-01-side-effect-complete">COPY-RENAMED-SIDE-EFFECT</div>';
        root.querySelector('[data-testid="flow-01-step-02-action"]').addEventListener("input", () => setTimeout(() => go("/page-03"), 0), { once: true });
        root.querySelector('[data-testid="flow-01-recovery-action"]').addEventListener("click", () => go("/page-01"));
        return;
      }
      if (route === "/page-03") {
        root.innerHTML = \
          '<h1>COPY-RENAMED-GAMMA</h1>' +
          '<button data-testid="flow-01-step-03-action">COPY-RENAMED-SELECT</button>' +
          '<div id="option-root"></div>' +
          '<div data-testid="flow-01-step-02-state">COPY-RENAMED-STATE-B</div>';
        root.querySelector('[data-testid="flow-01-step-03-action"]').addEventListener("click", () => {
          document.getElementById("option-root").innerHTML = '<button data-testid="flow-01-step-03-option-pending">COPY-RENAMED-OPTION</button>';
          root.querySelector('[data-testid="flow-01-step-03-option-pending"]').addEventListener("click", () => go("/page-01"));
        });
        return;
      }
      root.innerHTML = \
        '<h1>COPY-RENAMED-ALPHA</h1>' +
        '<button data-testid="flow-01-step-01-action">COPY-RENAMED-NEXT</button>' +
        '<input data-testid="flow-01-step-04-action" aria-label="renamed press">' +
        '<div data-testid="flow-01-step-03-state">COPY-RENAMED-STATE-C</div>' +
        '<div data-testid="flow-01-recovery-complete">COPY-RENAMED-RECOVERY-STATE</div>';
      root.querySelector('[data-testid="flow-01-step-01-action"]').addEventListener("click", () => go("/page-02"));
      root.querySelector('[data-testid="flow-01-step-04-action"]').addEventListener("keydown", (event) => { if (event.key === "Enter") go("/page-02"); });
    }
    addEventListener("popstate", render);
    render();
  </script>
</body>
</html>
`;
}

function fakeViteServer() {
  return `import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const port = Number(args[portIndex + 1]);
const root = process.cwd();
const server = createServer((request, response) => {
  if (request.url === "/favicon.ico") {
    response.statusCode = 404;
    response.end("not found");
    return;
  }
  const path = request.url === "/artifact-meta.json"
    ? resolve(root, "dist/artifact-meta.json")
    : resolve(root, "dist/index.html");
  const bytes = readFileSync(path);
  response.statusCode = 200;
  response.setHeader("Content-Type", request.url === "/artifact-meta.json" ? "application/json" : "text/html; charset=utf-8");
  response.end(bytes);
});
server.listen(port, "127.0.0.1");
const stop = () => server.close(() => process.exit(0));
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
`;
}

function summaryMutations() {
  return [
    {
      name: "missing-stage",
      message: "readiness summary schema failed",
      apply(root) {
        mutateSummary(root, (summary) => {
          delete summary.stages.typecheck;
        });
      }
    },
    {
      name: "pass-nonzero-exit",
      message: "passed typecheck command conflicts",
      apply(root) {
        mutateCommand(root, "typecheck", (command) => {
          command.exitCode = 1;
        });
      }
    },
    {
      name: "missing-stderr",
      message: "ENOENT",
      apply(root) {
        const summary = readJson(resolve(root, "readiness-summary.json"));
        const commandPath = resolve(root, summary.stages.build.commandEvidence.path);
        const command = readJson(commandPath);
        rmSync(resolve(dirname(commandPath), command.stderr.path));
      }
    },
    {
      name: "missing-source-snapshot-file",
      message: "source snapshot file set",
      apply(root) {
        rmSync(resolve(root, "workspace/source/src/index.html"));
      }
    },
    {
      name: "stdout-hash-drift",
      message: "stdout bytes",
      apply(root) {
        const summary = readJson(resolve(root, "readiness-summary.json"));
        const commandPath = resolve(root, summary.stages.typecheck.commandEvidence.path);
        const command = readJson(commandPath);
        writeFileSync(resolve(dirname(commandPath), command.stdout.path), "drift\n", "utf8");
      }
    },
    {
      name: "missing-stream-hash",
      message: "command evidence schema failed",
      apply(root) {
        mutateCommand(root, "typecheck", (command) => {
          delete command.stdout.sha256;
        });
      }
    },
    {
      name: "reversed-command-time",
      message: "timestamps are invalid or reversed",
      apply(root) {
        mutateCommand(root, "build", (command) => {
          command.stoppedAtUtc = "2000-01-01T00:00:00.000Z";
        });
      }
    },
    {
      name: "shutdown-conflict",
      message: "preview shutdown status",
      apply(root) {
        mutateSummary(root, (summary) => {
          summary.stages.preview.shutdown.processExited = false;
        });
      }
    },
    {
      name: "semantic-contract-drift",
      message: "contract manifest binding",
      apply(root) {
        const summaryPath = resolve(root, "readiness-summary.json");
        const summary = readJson(summaryPath);
        const contractPath = resolve(root, summary.inputs.semanticContract.path);
        const contract = readJson(contractPath);
        contract.source.manifestSha256 = "0".repeat(64);
        writeJson(contractPath, contract);
        summary.inputs.semanticContract = receipt(root, contractPath);
        writeJson(summaryPath, summary);
      }
    },
    {
      name: "flow-command-runner-path-drift",
      message: "flow command runner path",
      apply(root) {
        mutateCommand(root, "flowSmoke", (command) => {
          command.args[0] = resolve(root, "outside-runner.mjs");
        });
      }
    },
    {
      name: "flow-result-runner-sha-drift",
      message: "flow runner SHA-256",
      apply(root) {
        const summaryPath = resolve(root, "readiness-summary.json");
        const summary = readJson(summaryPath);
        const resultPath = resolve(root, summary.stages.flowSmoke.result.path);
        const result = readJson(resultPath);
        result.runner.sha256 = "0".repeat(64);
        writeJson(resultPath, result);
        summary.stages.flowSmoke.result = receipt(root, resultPath);
        writeJson(summaryPath, summary);
      }
    }
  ];
}

function mutateSummary(root, apply) {
  const path = resolve(root, "readiness-summary.json");
  const summary = readJson(path);
  apply(summary);
  writeJson(path, summary);
}

function mutateCommand(root, stageName, apply) {
  const summaryPath = resolve(root, "readiness-summary.json");
  const summary = readJson(summaryPath);
  const stage = summary.stages[stageName];
  const path = resolve(root, stage.commandEvidence.path);
  const command = readJson(path);
  apply(command);
  writeJson(path, command);
  stage.commandEvidence = receipt(root, path);
  writeJson(summaryPath, summary);
}

function receipt(root, path) {
  const bytes = readFileSync(path);
  return {
    path: path.slice(resolve(root).length + 1).replaceAll("\\", "/"),
    bytes: bytes.length,
    sha256: sha256(bytes)
  };
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

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
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

function expectFailure(label, expected, action) {
  try {
    action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(expected)) return;
    throw new Error(`${label} failed with an unexpected error: ${message}`);
  }
  throw new Error(`${label} did not fail closed`);
}

async function expectAsyncFailure(label, expected, action) {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(expected)) return;
    throw new Error(`${label} failed with an unexpected error: ${message}`);
  }
  throw new Error(`${label} did not fail closed`);
}
