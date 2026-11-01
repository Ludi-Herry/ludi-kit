import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from "node:fs";
import { createServer } from "node:net";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertExactIdentity,
  kitRoot,
  readJson,
  resolveProjectPath,
  sha256Bytes,
  sha256File,
  toProjectRelative,
  verifyAcceptanceEvidence,
  verifyFrozenArtifact
} from "./same-artifact-lib.mjs";
import { runBlindFlowAcceptance } from "./run-blind-flow-acceptance.mjs";

const projectsRoot = resolve(kitRoot, "projects");
const values = process.argv.slice(2);
const evaluatorReceiptArg = readArg("--evaluator-receipt");
if (evaluatorReceiptArg) {
  try {
    const result = await runBlindFlowAcceptance({
      evaluatorReceiptPath: resolve(process.cwd(), evaluatorReceiptArg),
      arm: readArg("--arm"),
      attemptId: readArg("--attempt-id") ?? "attempt-01"
    });
    console.log(
      `run-flow-acceptance passed: ${result.evidence.runId}; arm=${result.evidence.arm}; evidence=${result.evidencePath.replaceAll("\\", "/")}`
    );
    process.exit(0);
  } catch (error) {
    console.error(`run-flow-acceptance failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
const projectArg = readArg("--project");
const projectRootArg = readArg("--project-root");
const validator = resolve(kitRoot, "scripts/validate-flow-acceptance.mjs");
const targets = discoverProjects();

for (const target of targets) {
  let acceptance = null;
  try {
    acceptance = readJson(resolve(target.root, "flow-acceptance.json"));
    if (acceptance.version === "1.1.0") {
      await runSameArtifactAcceptance(target.root);
    } else {
      await runLegacyAcceptance(target.root);
    }
  } catch (error) {
    writeFailedEvidence(target.root, acceptance, error);
    console.error(`run-flow-acceptance failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

async function runLegacyAcceptance(projectRoot) {
  if (projectRootArg) throw new Error("--project-root accepts flow-acceptance 1.1.0 projects only");
  runValidation(["--project", relativeToKit(projectRoot), "--require-approved"]);

  const acceptancePath = resolve(projectRoot, "flow-acceptance.json");
  const acceptance = readJson(acceptancePath);
  const approved = acceptance.flows.filter((flow) => flow.status === "approved");
  const configPath = resolve(projectRoot, "playwright.config.mjs");
  const playwrightCli = resolvePlaywrightCli(projectRoot);
  const port = findFreePortSync();
  const args = ["test", "--config", configPath];
  const result = await runPlaywright(playwrightCli, args, {
    cwd: kitRoot,
    env: {
      ...process.env,
      FLOW_TEST_PORT: String(port)
    }
  });
  writeRaw(result);
  const screenshotPath = resolve(projectRoot, "evidence/flow-asset-drawer.png");

  const evidence = {
    version: "1.0.0",
    projectId: acceptance.projectId,
    checkedAt: new Date().toISOString(),
    status: result.status === 0 ? "passed" : "failed",
    command: `node ${toPortablePath(playwrightCli)} ${args.map(quoteArgument).join(" ")}`,
    baseUrl: `http://127.0.0.1:${port}`,
    exitCode: result.status,
    approvedFlows: approved.map((flow) => ({
      flowId: flow.flowId,
      objectRefs: flow.objectRefs,
      specPath: flow.specPath
    })),
    screenshots: existsSync(screenshotPath)
      ? [{
          path: relativeToKit(screenshotPath),
          sha256: sha256File(screenshotPath)
        }]
      : [],
    hashes: {
      samplePack: sha256File(resolve(projectRoot, "sample-pack.json")),
      flowAcceptance: sha256File(acceptancePath),
      specs: Object.fromEntries(approved.map((flow) => [flow.specPath, sha256File(resolve(kitRoot, flow.specPath))]))
    },
    stdout: result.stdout,
    stderr: result.stderr
  };
  const evidencePath = resolve(projectRoot, "evidence/flow-acceptance.json");
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

  if (result.status !== 0) {
    throw new Error(`${acceptance.projectId} legacy Playwright flow exited ${result.status ?? 1}`);
  }
  console.log(`run-flow-acceptance passed: ${acceptance.projectId}; evidence=${relativeToKit(evidencePath)}`);
}

async function runSameArtifactAcceptance(projectRoot) {
  runValidation([
    "--project-root",
    projectRoot,
    "--require-approved",
    "--require-same-artifact"
  ]);
  const context = verifyFrozenArtifact(projectRoot);
  const approved = context.acceptance.flows.filter((flow) => flow.status === "approved");
  const playwrightCli = resolvePlaywrightCli(projectRoot);
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const preview = startPreview(projectRoot, port);
  let previewOutput = "";

  try {
    const identityResponse = await waitForResponse(
      new URL(context.receipt.runtime.identityPath, baseUrl).href,
      preview
    );
    if (identityResponse.status !== 200) {
      throw new Error(`runtime identity endpoint returned HTTP ${identityResponse.status}`);
    }
    const identityBytes = Buffer.from(await identityResponse.arrayBuffer());
    let runtimeIdentity;
    try {
      runtimeIdentity = JSON.parse(identityBytes.toString("utf8"));
    } catch (error) {
      throw new Error(`runtime identity endpoint returned invalid JSON: ${error.message}`);
    }
    assertExactIdentity(runtimeIdentity, context.identity, "runtime artifact marker");
    const distIdentityHash = sha256File(context.distMarkerPath);
    const servedIdentityHash = sha256Bytes(identityBytes);
    if (servedIdentityHash !== distIdentityHash) {
      throw new Error("runtime identity response bytes differ from frozen dist/artifact-meta.json");
    }

    const entryUrl = sameOriginUrl(context.receipt.runtime.entryRoute, baseUrl);
    const entryResponse = await fetch(entryUrl, { signal: AbortSignal.timeout(5_000) });
    if (entryResponse.status !== 200) {
      throw new Error(`runtime entry returned HTTP ${entryResponse.status}`);
    }
    const entryBytes = Buffer.from(await entryResponse.arrayBuffer());
    const distEntryHash = sha256File(context.distEntryPath);
    const servedEntryHash = sha256Bytes(entryBytes);
    if (servedEntryHash !== distEntryHash) {
      throw new Error("runtime entry response bytes differ from frozen dist/index.html");
    }

    const runtimeAudit = await auditRuntime(projectRoot, baseUrl, context);
    for (const [metric, count] of Object.entries(runtimeAudit.counts)) {
      if (count !== 0) throw new Error(`runtime audit ${metric} must be 0; received ${count}`);
    }

    const generatedConfigPath = writeSameArtifactPlaywrightConfig(projectRoot, baseUrl);
    const specPaths = approved.map((flow) => flow.specPath);
    const args = [
      "test",
      ...specPaths,
      "--config",
      generatedConfigPath
    ];
    const result = await runPlaywright(playwrightCli, args, {
      cwd: projectRoot,
      env: {
        ...process.env,
        FLOW_TEST_BASE_URL: baseUrl,
        FLOW_TEST_PORT: String(port)
      }
    });
    writeRaw(result);
    if (result.error?.code === "ETIMEDOUT") {
      throw new Error("same-artifact Playwright flow timed out after 120 seconds");
    }
    if (result.status !== 0) {
      throw new Error(`same-artifact Playwright flow exited ${result.status ?? 1}`);
    }

    previewOutput = preview.output();
    const screenshots = collectScreenshots(projectRoot);
    if (screenshots.length === 0) throw new Error("approved flow produced no evidence screenshots");
    const evidencePath = resolveProjectPath(projectRoot, "evidence/flow-acceptance.json", {
      label: "flow acceptance evidence",
      mustExist: false
    });
    const evidence = {
      version: "1.1.0",
      ...context.identity,
      checkedAt: new Date().toISOString(),
      status: "passed",
      command: `node ${toPortablePath(playwrightCli)} ${args.map(quoteArgument).join(" ")}`,
      baseUrl,
      exitCode: 0,
      approvedFlows: approved.map((flow) => ({
        flowId: flow.flowId,
        objectRefs: flow.objectRefs,
        specPath: flow.specPath
      })),
      screenshots,
      hashes: {
        receipt: {
          path: toProjectRelative(projectRoot, context.receiptPath),
          sha256: sha256File(context.receiptPath)
        },
        contracts: structuredClone(context.receipt.contracts),
        source: {
          algorithm: context.receipt.source.algorithm,
          sha256: context.receipt.source.sha256
        },
        build: {
          path: context.receipt.build.outputPath,
          sha256: context.receipt.build.sha256
        },
        specs: Object.fromEntries(
          approved.map((flow) => [
            flow.specPath,
            sha256File(resolveProjectPath(projectRoot, flow.specPath, {
              label: `${flow.flowId} spec`,
              type: "file"
            }))
          ])
        ),
        runtimeEntry: {
          path: toProjectRelative(projectRoot, context.distEntryPath),
          fileSha256: distEntryHash,
          servedSha256: servedEntryHash
        },
        runtimeIdentity: {
          path: toProjectRelative(projectRoot, context.distMarkerPath),
          fileSha256: distIdentityHash,
          servedSha256: servedIdentityHash
        }
      },
      runtimeAudit: {
        identity: runtimeIdentity,
        ...runtimeAudit.counts,
        details: runtimeAudit.details
      },
      metrics: {
        sameArtifactMismatchCount: 0,
        evidenceCompleteness: 100,
        approvedCrossPageFlowCount: approved.length,
        fixtureProductProofCount: 0
      },
      stdout: result.stdout,
      stderr: result.stderr,
      previewOutput
    };
    mkdirSync(dirname(evidencePath), { recursive: true });
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    verifyAcceptanceEvidence(projectRoot);
    console.log(
      `run-flow-acceptance passed: ${context.identity.projectId}; artifactId=${context.identity.artifactId}; evidence=${toProjectRelative(projectRoot, evidencePath)}`
    );
  } finally {
    stopPreview(preview.child);
  }
}

function runValidation(args) {
  const result = spawnSync(process.execPath, [validator, ...args], {
    cwd: kitRoot,
    encoding: "utf8",
    shell: false,
    timeout: 120_000,
    windowsHide: true
  });
  writeRaw(result);
  if (result.error?.code === "ETIMEDOUT") throw new Error("flow acceptance validation timed out");
  if (result.status !== 0) throw new Error(`flow acceptance validation exited ${result.status ?? 1}`);
}

async function auditRuntime(projectRoot, baseUrl, context) {
  const playwright = loadPlaywright(projectRoot);
  const browser = await playwright.chromium.launch({
    channel: process.env.FLOW_TEST_BROWSER_CHANNEL ?? "chrome",
    headless: true
  });
  const details = {
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    unexpectedHttpErrors: []
  };
  try {
    const page = await browser.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") details.consoleErrors.push(message.text());
      if (message.type() === "warning") details.consoleWarnings.push(message.text());
    });
    page.on("pageerror", (error) => details.pageErrors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400) details.unexpectedHttpErrors.push(`${response.status()} ${response.url()}`);
    });

    const routes = new Set([context.receipt.runtime.entryRoute]);
    for (const flow of context.acceptance.flows.filter((entry) => entry.status === "approved")) {
      for (const step of flow.steps) routes.add(step.expectedRoute);
      routes.add(flow.result.route);
    }
    for (const route of routes) {
      await page.goto(sameOriginUrl(route, baseUrl), { waitUntil: "networkidle" });
    }
  } finally {
    await browser.close();
  }
  return {
    counts: Object.fromEntries(Object.entries(details).map(([name, entries]) => [name, entries.length])),
    details
  };
}

function loadPlaywright(projectRoot) {
  const projectRequire = createRequire(resolve(projectRoot, "package.json"));
  try {
    return projectRequire("@playwright/test");
  } catch {
    return createRequire(import.meta.url)("@playwright/test");
  }
}

function resolvePlaywrightCli(projectRoot) {
  const projectRequire = createRequire(resolve(projectRoot, "package.json"));
  try {
    return projectRequire.resolve("@playwright/test/cli");
  } catch {
    try {
      return createRequire(import.meta.url).resolve("@playwright/test/cli");
    } catch {
      throw new Error("@playwright/test is required for flow acceptance");
    }
  }
}

function startPreview(projectRoot, port) {
  const npmCli = process.env.npm_execpath;
  const hasNpmRuntime = npmCli && existsSync(npmCli);
  const previewArgs = ["run", "preview", "--", "--host", "127.0.0.1", "--port", String(port)];
  // Node refuses to spawn .cmd files without a shell (EINVAL), so go through cmd.exe.
  const command = hasNpmRuntime
    ? process.execPath
    : process.platform === "win32"
      ? "cmd.exe"
      : "npm";
  const args = hasNpmRuntime
    ? [npmCli, ...previewArgs]
    : process.platform === "win32"
      ? ["/d", "/s", "/c", `npm ${previewArgs.join(" ")}`]
      : previewArgs;
  const child = spawn(command, args, {
    cwd: projectRoot,
    env: process.env,
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const chunks = [];
  child.stdout.on("data", (chunk) => chunks.push(chunk.toString()));
  child.stderr.on("data", (chunk) => chunks.push(chunk.toString()));
  return {
    child,
    output: () => chunks.join("")
  };
}

async function waitForResponse(url, preview, timeoutMs = 10_000) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    if (preview.child.exitCode !== null) {
      throw new Error(`preview exited before readiness with code ${preview.child.exitCode}: ${preview.output().trim()}`);
    }
    try {
      return await fetch(url, { signal: AbortSignal.timeout(750) });
    } catch (error) {
      lastError = error;
      await delay(100);
    }
  }
  throw new Error(`preview did not become ready within ${timeoutMs}ms: ${lastError?.message ?? preview.output().trim()}`);
}

function writeSameArtifactPlaywrightConfig(projectRoot, baseUrl) {
  const configPath = resolveProjectPath(projectRoot, "evidence/same-artifact.playwright.config.mjs", {
    label: "same-artifact Playwright config",
    mustExist: false
  });
  mkdirSync(dirname(configPath), { recursive: true });
  const config = {
    testDir: resolve(projectRoot, "e2e/flows"),
    outputDir: resolve(projectRoot, "evidence/test-results"),
    workers: 1,
    fullyParallel: false,
    reporter: [["line"]],
    use: {
      baseURL: baseUrl,
      browserName: "chromium",
      channel: process.env.FLOW_TEST_BROWSER_CHANNEL ?? "chrome",
      headless: true,
      screenshot: "only-on-failure",
      trace: "retain-on-failure"
    }
  };
  writeFileSync(configPath, `export default ${JSON.stringify(config, null, 2)};\n`, "utf8");
  return configPath;
}

function collectScreenshots(projectRoot) {
  const evidenceRoot = resolveProjectPath(projectRoot, "evidence", {
    label: "evidence directory",
    type: "directory"
  });
  const files = [];
  collectPngFiles(evidenceRoot, files);
  return files
    .sort((left, right) => left.localeCompare(right, "en"))
    .map((file) => ({
      path: toProjectRelative(projectRoot, file),
      sha256: sha256File(file)
    }));
}

function collectPngFiles(directory, files) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`evidence contains a symbolic link: ${path}`);
    if (entry.isDirectory()) collectPngFiles(path, files);
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".png")) files.push(path);
  }
}

function writeFailedEvidence(projectRoot, acceptance, error) {
  try {
    const evidencePath = resolveProjectPath(projectRoot, "evidence/flow-acceptance.json", {
      label: "failed flow acceptance evidence",
      mustExist: false
    });
    mkdirSync(dirname(evidencePath), { recursive: true });
    writeFileSync(
      evidencePath,
      `${JSON.stringify(
        {
          version: acceptance?.version ?? "unknown",
          projectId: acceptance?.projectId ?? null,
          artifactId: acceptance?.artifactUnderTest?.artifactId ?? null,
          checkedAt: new Date().toISOString(),
          status: "failed",
          error: error instanceof Error ? error.message : String(error)
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  } catch {
    // Unsafe or unavailable evidence paths remain untouched.
  }
}

function discoverProjects() {
  if (projectArg && projectRootArg) throw new Error("--project and --project-root cannot be used together");
  if (projectRootArg) {
    return [{ root: resolve(process.cwd(), projectRootArg) }];
  }
  if (projectArg) {
    const target = resolve(kitRoot, projectArg);
    if (!isInside(projectsRoot, target)) throw new Error(`--project escapes projects/: ${projectArg}`);
    return [{ root: target }];
  }
  return readdirSync(projectsRoot)
    .map((name) => resolve(projectsRoot, name))
    .filter((path) => statSync(path).isDirectory() && existsSync(resolve(path, "flow-acceptance.json")))
    .map((root) => ({ root }));
}

function findFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolvePort(address.port));
    });
  });
}

function findFreePortSync() {
  const result = spawnSync(
    process.execPath,
    ["-e", "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})"],
    { encoding: "utf8", shell: false, windowsHide: true }
  );
  if (result.status !== 0) throw new Error("unable to allocate a free port");
  return Number(result.stdout.trim());
}

function stopPreview(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      encoding: "utf8",
      shell: false,
      windowsHide: true
    });
  } else {
    child.kill("SIGTERM");
  }
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

// spawnSync's timeout only kills the Playwright CLI process and leaves its browser
// processes running. Time out here and kill the whole tree instead.
function runPlaywright(playwrightCli, args, { cwd, env }, timeoutMs = 120_000) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [playwrightCli, ...args], {
      cwd,
      env,
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout = [];
    const stderr = [];
    let error = null;
    const timer = setTimeout(() => {
      error = Object.assign(new Error(`Playwright timed out after ${timeoutMs}ms`), { code: "ETIMEDOUT" });
      killProcessTree(child);
    }, timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(chunk.toString()));
    child.stderr.on("data", (chunk) => stderr.push(chunk.toString()));
    child.on("error", (spawnError) => {
      error ??= spawnError;
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      resolveRun({
        status: error?.code === "ETIMEDOUT" ? null : status,
        stdout: stdout.join(""),
        stderr: stderr.join(""),
        error
      });
    });
  });
}

function killProcessTree(child) {
  if (!child?.pid || child.exitCode !== null) return;
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

function writeRaw(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) process.stderr.write(`${result.error.message}\n`);
}

function readArg(name) {
  const index = values.indexOf(name);
  if (index === -1) return null;
  const value = values[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !rel.includes(":"));
}

function relativeToKit(file) {
  return relative(kitRoot, file).replaceAll("\\", "/");
}

function toPortablePath(file) {
  return String(file).replaceAll("\\", "/");
}

function quoteArgument(value) {
  return /\s/.test(value) ? JSON.stringify(value) : value;
}

function sameOriginUrl(route, baseUrl) {
  const url = new URL(route, baseUrl);
  if (url.origin !== new URL(baseUrl).origin) {
    throw new Error(`runtime route must stay on the frozen preview origin: ${route}`);
  }
  return url.href;
}
