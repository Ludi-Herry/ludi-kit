import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = resolve(kitRoot, `.tmp-same-artifact-${process.pid}`);
const freezeScript = resolve(kitRoot, "scripts/freeze-artifact-under-test.mjs");
const verifyScript = resolve(kitRoot, "scripts/verify-artifact-under-test.mjs");
const runnerScript = resolve(kitRoot, "scripts/run-flow-acceptance.mjs");
const consumerIdentity = {
  runId: "blind-prd-02-same-artifact-fixture",
  arm: "consumer",
  projectId: "same-artifact-fixture",
  artifactId: "11111111-1111-4111-8111-111111111111"
};
const controlIdentity = {
  ...consumerIdentity,
  arm: "control",
  artifactId: "22222222-2222-4222-8222-222222222222"
};
const negativeResults = [];

try {
  mkdirSync(tempRoot, { recursive: true });

  const consumerBaseline = resolve(tempRoot, "consumer-baseline");
  createFixtureProject(consumerBaseline, consumerIdentity, "normal");
  expectSuccess(await runFreeze(consumerBaseline), "positive fixture freeze");
  expectSuccess(await runVerify(consumerBaseline), "positive frozen artifact verification");

  const positiveRoot = cloneFixture(consumerBaseline, "positive");
  const positiveRun = await runRunner(positiveRoot);
  expectSuccess(positiveRun, "positive same-artifact acceptance");
  const positiveEvidence = readJson(resolve(positiveRoot, "evidence/flow-acceptance.json"));
  if (
    positiveEvidence.status !== "passed" ||
    positiveEvidence.metrics?.sameArtifactMismatchCount !== 0 ||
    positiveEvidence.metrics?.evidenceCompleteness !== 100 ||
    positiveEvidence.metrics?.fixtureProductProofCount !== 0
  ) {
    throw new Error("positive evidence did not preserve the frozen same-artifact metrics");
  }
  expectSuccess(
    await runVerify(positiveRoot, ["--evidence", "evidence/flow-acceptance.json"]),
    "positive evidence verification"
  );

  await runNegative("N1-missing-artifact-under-test", consumerBaseline, (root) => {
    const flow = readJson(resolve(root, "flow-acceptance.json"));
    delete flow.artifactUnderTest;
    writeJson(resolve(root, "flow-acceptance.json"), flow);
  });

  await runNegative("N2-missing-or-escaping-receipt", consumerBaseline, (root) => {
    renameSync(
      resolve(root, "evidence/artifact-under-test.json"),
      resolve(root, "evidence/artifact-under-test.missing.json")
    );
  });
  const escapeRoot = cloneFixture(consumerBaseline, "N2-escape-subcase");
  const escapingFlow = readJson(resolve(escapeRoot, "flow-acceptance.json"));
  escapingFlow.artifactUnderTest.receiptPath = "../artifact-under-test.json";
  writeJson(resolve(escapeRoot, "flow-acceptance.json"), escapingFlow);
  expectFailure(await runRunner(escapeRoot), "N2 receipt escape subcase");
  assertNoPassingEvidence(escapeRoot, "N2 receipt escape subcase");

  await runNegative("N3-artifact-id-mismatch", consumerBaseline, (root) => {
    const flow = readJson(resolve(root, "flow-acceptance.json"));
    flow.artifactUnderTest.artifactId = "33333333-3333-4333-8333-333333333333";
    writeJson(resolve(root, "flow-acceptance.json"), flow);
  });

  await runNegative("N4-contract-or-source-drift", consumerBaseline, (root) => {
    const context = readJson(resolve(root, "business-context.json"));
    context.frozenAfterReceipt = true;
    writeJson(resolve(root, "business-context.json"), context);
  });

  await runNegative("N5-dist-drift", consumerBaseline, (root) => {
    const distEntry = resolve(root, "dist/index.html");
    writeFileSync(distEntry, `${readFileSync(distEntry, "utf8")}\n<!-- drift -->\n`, "utf8");
  });

  const badMarkerRoot = resolve(tempRoot, "N6-runtime-marker-mismatch");
  createFixtureProject(badMarkerRoot, consumerIdentity, "bad-marker");
  expectSuccess(await runFreeze(badMarkerRoot), "N6 fixture freeze");
  expectFailure(await runRunner(badMarkerRoot), "N6 runtime marker mismatch");
  assertNoPassingEvidence(badMarkerRoot, "N6 runtime marker mismatch");
  negativeResults.push("N6-runtime-marker-mismatch");

  const fixtureServerRoot = resolve(tempRoot, "N7-fixture-server");
  createFixtureProject(fixtureServerRoot, consumerIdentity, "fixture");
  expectSuccess(await runFreeze(fixtureServerRoot), "N7 fixture freeze");
  const fixtureServerRun = await runRunner(fixtureServerRoot);
  expectFailure(fixtureServerRun, "N7 fixture server");
  if (!combinedOutput(fixtureServerRun).includes("runtime entry response bytes differ")) {
    throw new Error(`N7 failed for the wrong reason: ${combinedOutput(fixtureServerRun)}`);
  }
  assertNoPassingEvidence(fixtureServerRoot, "N7 fixture server");
  negativeResults.push("N7-fixture-server");

  const controlBaseline = resolve(tempRoot, "control-baseline");
  createFixtureProject(controlBaseline, controlIdentity, "normal");
  expectSuccess(await runFreeze(controlBaseline), "control fixture freeze");
  const crossArmRoot = cloneFixture(consumerBaseline, "N8-cross-arm-reuse");
  copyFileSync(
    resolve(controlBaseline, "evidence/artifact-under-test.json"),
    resolve(crossArmRoot, "evidence/artifact-under-test.json")
  );
  const crossArmRun = await runRunner(crossArmRoot);
  expectFailure(crossArmRun, "N8 cross-arm receipt reuse");
  if (!combinedOutput(crossArmRun).includes("artifactId must match flow acceptance")) {
    throw new Error(`N8 failed for the wrong reason: ${combinedOutput(crossArmRun)}`);
  }
  assertNoPassingEvidence(crossArmRoot, "N8 cross-arm receipt reuse");
  negativeResults.push("N8-cross-arm-reuse");

  const invalidEvidenceRoot = cloneFixture(positiveRoot, "N9-incomplete-evidence");
  const invalidEvidencePath = resolve(invalidEvidenceRoot, "evidence/flow-acceptance.json");
  const invalidEvidence = readJson(invalidEvidencePath);
  delete invalidEvidence.hashes.receipt;
  writeJson(invalidEvidencePath, invalidEvidence);
  const evidenceVerification = await runVerify(invalidEvidenceRoot, [
    "--evidence",
    "evidence/flow-acceptance.json"
  ]);
  expectFailure(evidenceVerification, "N9 incomplete evidence");
  if (!combinedOutput(evidenceVerification).includes("receipt evidence must be an object")) {
    throw new Error(`N9 failed for the wrong reason: ${combinedOutput(evidenceVerification)}`);
  }
  invalidEvidence.status = "failed";
  writeJson(invalidEvidencePath, invalidEvidence);
  negativeResults.push("N9-incomplete-evidence");

  const expectedNegatives = [
    "N1-missing-artifact-under-test",
    "N2-missing-or-escaping-receipt",
    "N3-artifact-id-mismatch",
    "N4-contract-or-source-drift",
    "N5-dist-drift",
    "N6-runtime-marker-mismatch",
    "N7-fixture-server",
    "N8-cross-arm-reuse",
    "N9-incomplete-evidence"
  ];
  if (JSON.stringify(negativeResults) !== JSON.stringify(expectedNegatives)) {
    throw new Error(`negative case coverage drifted: ${JSON.stringify(negativeResults)}`);
  }

  console.log(
    `same-artifact acceptance tests passed: positive=1; negative=${negativeResults.length}; categories=${negativeResults.join(",")}`
  );
} finally {
  const rel = relative(kitRoot, tempRoot);
  if (rel.startsWith(".tmp-same-artifact-") && !rel.includes("..")) {
    // Windows can hold handles briefly after a killed process exits. Retry, and
    // never let a cleanup failure replace the suite's real result.
    try {
      rmSync(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    } catch (error) {
      process.exitCode = 1;
      process.stderr.write(`[same-artifact-temp] cleanup failed, left ${rel}: ${error.message}\n`);
    }
  }
}

async function runNegative(name, baseline, mutate) {
  const root = cloneFixture(baseline, name);
  mutate(root);
  const result = await runRunner(root);
  expectFailure(result, name);
  assertNoPassingEvidence(root, name);
  negativeResults.push(name);
}

function createFixtureProject(projectRoot, identity, previewMode) {
  for (const directory of [
    projectRoot,
    resolve(projectRoot, "public"),
    resolve(projectRoot, "e2e/flows")
  ]) {
    mkdirSync(directory, { recursive: true });
  }

  writeJson(resolve(projectRoot, "package.json"), {
    name: `same-artifact-${identity.arm}-fixture`,
    private: true,
    type: "module",
    scripts: {
      build: "node build.mjs",
      preview: `node preview.mjs --mode ${previewMode}`
    }
  });
  writeFileSync(
    resolve(projectRoot, "build.mjs"),
    [
      'import { copyFileSync, mkdirSync } from "node:fs";',
      'mkdirSync("dist", { recursive: true });',
      'copyFileSync("index.html", "dist/index.html");',
      'copyFileSync("public/artifact-meta.json", "dist/artifact-meta.json");',
      'console.log("fixture build complete");',
      ""
    ].join("\n"),
    "utf8"
  );
  writeFileSync(resolve(projectRoot, "preview.mjs"), previewSource(), "utf8");
  writeFileSync(resolve(projectRoot, "index.html"), productHtml(), "utf8");
  writeFileSync(
    resolve(projectRoot, "e2e/app.html"),
    "<!doctype html><html><body><h1>Validator fixture only</h1></body></html>\n",
    "utf8"
  );
  writeJson(resolve(projectRoot, "public/artifact-meta.json"), identity);
  writeJson(resolve(projectRoot, "blind-run-contract.json"), {
    version: "1.0.0",
    ...identity,
    candidateMapping: "frozen"
  });
  writeJson(resolve(projectRoot, "project-description.json"), {
    version: "1.0.0",
    projectId: identity.projectId,
    title: "Same-artifact generic fixture",
    source: "synthetic protocol fixture"
  });
  writeJson(resolve(projectRoot, "business-context.json"), {
    version: "1.0.0",
    projectId: identity.projectId,
    contextType: "validation-sandbox"
  });
  writeJson(resolve(projectRoot, "pages.json"), {
    version: "1.0.0",
    projectId: identity.projectId,
    pages: [
      {
        id: "records",
        route: "/records",
        intentCard: { prdAnchor: "fixture#records" }
      },
      {
        id: "record-detail",
        route: "/detail",
        intentCard: { prdAnchor: "fixture#record-detail" }
      }
    ]
  });
  writeJson(resolve(projectRoot, "flows.json"), {
    version: "1.0.0",
    projectId: identity.projectId,
    flows: [
      {
        id: "review-record",
        steps: [
          { pageId: "records" },
          { pageId: "record-detail" }
        ],
        successCriteria: [
          "The same record ID reaches the detail page.",
          "The review panel opens and can be closed."
        ]
      }
    ]
  });
  writeJson(resolve(projectRoot, "sample-pack.json"), {
    version: "1.0.0",
    projectId: identity.projectId,
    entities: {
      Record: {
        "record-1": {
          id: "record-1",
          status: "ready",
          observedAt: "2026-07-30T12:00:00Z"
        }
      }
    }
  });
  writeJson(resolve(projectRoot, "flow-acceptance.json"), {
    version: "1.1.0",
    projectId: identity.projectId,
    artifactUnderTest: {
      artifactId: identity.artifactId,
      receiptPath: "evidence/artifact-under-test.json"
    },
    flows: [
      {
        flowId: "review-record",
        status: "approved",
        objectRefs: ["Record/record-1"],
        specPath: "e2e/flows/review-record.spec.mjs",
        steps: [
          {
            pageId: "records",
            action: "Open record-1",
            expectedRoute: "/detail?recordId=record-1",
            expectedState: "record-detail-open",
            assertionRefs: [
              "flows.json#review-record.successCriteria[0]",
              "pages.json#records.intentCard.prdAnchor"
            ]
          },
          {
            pageId: "record-detail",
            action: "Open the review panel",
            expectedRoute: "/detail?recordId=record-1#panel=open",
            expectedState: "review-panel-open",
            assertionRefs: [
              "flows.json#review-record.successCriteria[1]",
              "pages.json#record-detail.intentCard.prdAnchor"
            ]
          }
        ],
        result: {
          route: "/detail?recordId=record-1#panel=open",
          sideEffect: "The review panel becomes visible for record-1.",
          recovery: "Close the panel and retain the record detail route."
        }
      }
    ]
  });
  writeFileSync(
    resolve(projectRoot, "e2e/flows/review-record.spec.mjs"),
    flowSpecSource(),
    "utf8"
  );
}

function previewSource() {
  return [
    'import { createServer } from "node:http";',
    'import { readFileSync } from "node:fs";',
    'const values = process.argv.slice(2);',
    'const valueOf = (name, fallback) => { const index = values.indexOf(name); return index === -1 ? fallback : values[index + 1]; };',
    'const port = Number(valueOf("--port", "4173"));',
    'const host = valueOf("--host", "127.0.0.1");',
    'const mode = valueOf("--mode", "normal");',
    'const entry = readFileSync(new URL("./dist/index.html", import.meta.url));',
    'const marker = readFileSync(new URL("./dist/artifact-meta.json", import.meta.url));',
    'const fixture = readFileSync(new URL("./e2e/app.html", import.meta.url));',
    'const server = createServer((request, response) => {',
    '  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? host}`);',
    '  if (url.pathname === "/artifact-meta.json") {',
    '    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });',
    '    if (mode === "bad-marker") {',
    '      const value = JSON.parse(marker.toString("utf8"));',
    '      value.artifactId = "99999999-9999-4999-8999-999999999999";',
    '      response.end(JSON.stringify(value));',
    '    } else {',
    '      response.end(marker);',
    '    }',
    '    return;',
    '  }',
    '  response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });',
    '  response.end(mode === "fixture" ? fixture : entry);',
    '});',
    'server.listen(port, host, () => console.log(`fixture preview listening on http://${host}:${port}`));',
    ""
  ].join("\n");
}

function productHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Same-artifact fixture</title>
  <style>
    body { font: 16px system-ui; margin: 32px; color: #18212f; }
    button { padding: 8px 12px; }
    [data-testid="panel"] { margin-top: 16px; padding: 16px; border: 1px solid #8da2bf; }
  </style>
</head>
<body>
  <main id="app"></main>
  <script>
    const record = { id: "record-1", status: "ready", observedAt: "2026-07-30T12:00:00Z" };
    const app = document.querySelector("#app");
    const navigate = (url) => { history.pushState({}, "", url); render(); };
    function render() {
      if (location.pathname === "/records" || location.pathname === "/") {
        app.innerHTML = \`<h1>Records</h1><div data-testid="record-record-1">\${record.id} · \${record.status}<button data-testid="open-record">Open</button></div>\`;
        document.querySelector("[data-testid=open-record]").addEventListener("click", () => navigate("/detail?recordId=record-1"));
        return;
      }
      const panelOpen = location.hash === "#panel=open";
      app.innerHTML = \`<h1>Record detail</h1><p data-testid="record-id">\${record.id}</p><p data-testid="record-status">\${record.status}</p><button data-testid="open-panel">Review</button>\${panelOpen ? '<section data-testid="panel">Review record-1 <button data-testid="close-panel">Close</button></section>' : ""}\`;
      document.querySelector("[data-testid=open-panel]").addEventListener("click", () => navigate("/detail?recordId=record-1#panel=open"));
      if (panelOpen) document.querySelector("[data-testid=close-panel]").addEventListener("click", () => navigate("/detail?recordId=record-1"));
    }
    addEventListener("popstate", render);
    render();
  </script>
</body>
</html>
`;
}

function flowSpecSource() {
  return [
    'import { mkdirSync } from "node:fs";',
    'import { dirname, resolve } from "node:path";',
    'import { fileURLToPath } from "node:url";',
    'import { expect, test } from "@playwright/test";',
    'const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");',
    'test("approved flow stays on one frozen product artifact", async ({ page }) => {',
    '  await page.goto("/records");',
    '  await expect(page.getByTestId("record-record-1")).toContainText("record-1");',
    '  await page.getByTestId("open-record").click();',
    '  await expect(page).toHaveURL(/\\/detail\\?recordId=record-1$/);',
    '  await expect(page.getByTestId("record-id")).toHaveText("record-1");',
    '  await page.getByTestId("open-panel").click();',
    '  await expect(page).toHaveURL(/\\/detail\\?recordId=record-1#panel=open$/);',
    '  await expect(page.getByTestId("panel")).toContainText("record-1");',
    '  mkdirSync(resolve(projectRoot, "evidence"), { recursive: true });',
    '  await page.screenshot({ path: resolve(projectRoot, "evidence/approved-flow.png"), fullPage: true });',
    '  await page.getByTestId("close-panel").click();',
    '  await expect(page).toHaveURL(/\\/detail\\?recordId=record-1$/);',
    '  await expect(page.getByTestId("panel")).toHaveCount(0);',
    '});',
    ""
  ].join("\n");
}

function cloneFixture(source, name) {
  const target = resolve(tempRoot, name);
  cpSync(source, target, { recursive: true, errorOnExist: true });
  return target;
}

function runFreeze(projectRoot) {
  return runCli(freezeScript, ["--project-root", projectRoot]);
}

function runVerify(projectRoot, extraArgs = []) {
  return runCli(verifyScript, ["--project-root", projectRoot, ...extraArgs]);
}

function runRunner(projectRoot) {
  return runCli(runnerScript, ["--project-root", projectRoot]);
}

// The runner owns a preview server (npm -> cmd -> node on Windows). spawnSync's
// timeout only kills the direct child, so the runner never reaches its own
// stopPreview and the preview survives holding the temp dir. Time out here and
// kill the whole tree while the parent links are still intact.
function runCli(script, args, timeoutMs = 180_000) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: kitRoot,
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout = [];
    const stderr = [];
    let error = null;
    child.stdout.setEncoding("utf8").on("data", (chunk) => stdout.push(chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => stderr.push(chunk));
    const timer = setTimeout(() => {
      error = Object.assign(new Error(`${relative(kitRoot, script)} timed out after ${timeoutMs}ms`), {
        code: "ETIMEDOUT"
      });
      killProcessTree(child);
    }, timeoutMs);
    const finish = (status, signal) => {
      clearTimeout(timer);
      resolveRun({ status, signal, stdout: stdout.join(""), stderr: stderr.join(""), error });
    };
    child.once("error", (spawnError) => {
      error ??= spawnError;
      finish(null, null);
    });
    child.once("close", finish);
  });
}

function killProcessTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      encoding: "utf8",
      shell: false,
      windowsHide: true
    });
  } else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

function expectSuccess(result, label) {
  if (result.error?.code === "ETIMEDOUT") throw new Error(`${label} timed out`);
  if (result.status !== 0) throw new Error(`${label} exited ${result.status}: ${combinedOutput(result)}`);
}

function expectFailure(result, label) {
  if (result.error?.code === "ETIMEDOUT") throw new Error(`${label} timed out`);
  if (result.status === 0) throw new Error(`${label} unexpectedly passed: ${combinedOutput(result)}`);
}

function assertNoPassingEvidence(projectRoot, label) {
  const evidencePath = resolve(projectRoot, "evidence/flow-acceptance.json");
  if (!existsSync(evidencePath)) return;
  const evidence = readJson(evidencePath);
  if (evidence.status === "passed") throw new Error(`${label} retained passing evidence`);
}

function combinedOutput(result) {
  return [result.stdout, result.stderr, result.error?.message].filter(Boolean).join("\n").trim();
}

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}
