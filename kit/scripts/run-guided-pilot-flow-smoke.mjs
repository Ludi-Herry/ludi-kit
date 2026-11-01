import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import Ajv2020 from "ajv/dist/2020.js";

const runnerPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(runnerPath);
const kitRoot = resolve(scriptDir, "..");
const guidedPilotSchemaPath = resolve(kitRoot, "schema/guided-pilot-flow-contract.schema.json");
const runnerVersion = "1.0.0";

export async function runGuidedPilotFlowSmoke({
  baseUrl,
  contractPath,
  expectedContractSha256,
  outFile,
  timeoutMs = 10_000
}) {
  const origin = normalizeBaseUrl(baseUrl);
  const runnerBytes = readFileSync(runnerPath);
  const absoluteContractPath = resolve(contractPath);
  const contractBytes = readFileSync(absoluteContractPath);
  const contractSha256 = sha256(contractBytes);
  if (expectedContractSha256 && contractSha256 !== expectedContractSha256) {
    throw new Error(
      `guided pilot flow contract SHA-256 drift: expected ${expectedContractSha256}, received ${contractSha256}`
    );
  }
  const contract = JSON.parse(contractBytes.toString("utf8"));
  validateContract(contract);
  if (outFile && existsSync(resolve(outFile))) {
    throw new Error(`guided pilot flow result output already exists: ${resolve(outFile)}`);
  }

  const startedAtUtc = new Date().toISOString();
  const observations = {
    consoleErrors: [],
    consoleErrorDetails: [],
    ignoredConsoleErrors: [],
    pageErrors: [],
    failedResponses: [],
    ignoredResponses: [],
    requestFailures: [],
    ignoredRequestFailures: []
  };
  const flowResults = [];
  const browserExecutable = resolveBrowserExecutable();
  let browser;
  let firstFailure = null;

  try {
    browser = await chromium.launch({ headless: true, executablePath: browserExecutable.path });
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") {
        const text = message.text();
        const location = message.location();
        const detail = {
          text,
          url: location.url || null,
          lineNumber: Number.isInteger(location.lineNumber) ? location.lineNumber : null,
          columnNumber: Number.isInteger(location.columnNumber) ? location.columnNumber : null
        };
        observations.consoleErrorDetails.push(detail);
        if (isIgnorableOptionalFavicon(detail.url, origin, text)) observations.ignoredConsoleErrors.push(detail);
        else observations.consoleErrors.push(text);
      }
    });
    page.on("pageerror", (error) => observations.pageErrors.push(error.message));
    page.on("response", (response) => {
      if (response.url().startsWith(origin) && response.status() >= 400) {
        const detail = { url: response.url(), status: response.status() };
        if (isIgnorableOptionalFavicon(detail.url, origin)) observations.ignoredResponses.push(detail);
        else observations.failedResponses.push(detail);
      }
    });
    page.on("requestfailed", (request) => {
      if (request.url().startsWith(origin)) {
        const detail = {
          url: request.url(),
          errorText: request.failure()?.errorText ?? "unknown request failure"
        };
        if (isIgnorableOptionalFavicon(detail.url, origin)) observations.ignoredRequestFailures.push(detail);
        else observations.requestFailures.push(detail);
      }
    });

    for (const flow of contract.flows) {
      const flowResult = { flowId: flow.flowId, status: "running", steps: [] };
      flowResults.push(flowResult);
      await page.goto(sameOriginUrl(contract.entry.route, origin), {
        waitUntil: "networkidle",
        timeout: timeoutMs
      });
      for (const step of flow.steps) {
        const stepResult = { stepId: step.stepId, status: "running", assertions: [] };
        flowResult.steps.push(stepResult);
        try {
          await executeAction(page, step.action, origin, timeoutMs);
          for (const assertion of step.assertions) {
            await executeAssertion(page, assertion, origin, timeoutMs);
            stepResult.assertions.push({ ...assertion, status: "passed" });
          }
          stepResult.status = "passed";
        } catch (error) {
          flowResult.status = "failed";
          stepResult.status = "failed";
          stepResult.error = error instanceof Error ? error.message : String(error);
          firstFailure = {
            stage: "flow-step",
            flowId: flow.flowId,
            stepId: step.stepId,
            message: stepResult.error
          };
          throw error;
        }
      }
      flowResult.status = "passed";
    }

    const runtimeFailureCount =
      observations.consoleErrors.length +
      observations.pageErrors.length +
      observations.failedResponses.length +
      observations.requestFailures.length;
    if (runtimeFailureCount > 0) {
      firstFailure = {
        stage: "runtime-audit",
        flowId: null,
        stepId: null,
        message: `runtime audit recorded ${runtimeFailureCount} browser failures`
      };
      throw new Error(firstFailure.message);
    }
  } catch (error) {
    if (!firstFailure) {
      firstFailure = {
        stage: "browser",
        flowId: null,
        stepId: null,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  } finally {
    if (browser) await browser.close();
  }

  const result = {
    $schema: "guided-pilot-flow-smoke-result.v1",
    kind: "guided-pilot-flow-result",
    version: "1.0.0",
    runner: {
      path: "scripts/run-guided-pilot-flow-smoke.mjs",
      version: runnerVersion,
      bytes: runnerBytes.length,
      sha256: sha256(runnerBytes),
      browser: {
        engine: "chromium",
        executablePath: browserExecutable.path.replaceAll("\\", "/"),
        executableSha256: browserExecutable.sha256,
        source: browserExecutable.source
      }
    },
    contract: {
      path: absoluteContractPath.replaceAll("\\", "/"),
      bytes: contractBytes.length,
      sha256: contractSha256,
      contractId: contract.contractId
    },
    baseUrl: origin,
    startedAtUtc,
    stoppedAtUtc: new Date().toISOString(),
    status: firstFailure ? "failed" : "passed",
    firstFailure,
    observations,
    flows: flowResults
  };
  if (outFile) writeFileSync(resolve(outFile), canonicalJsonBytes(result), { flag: "wx" });
  return result;
}

export function isIgnorableOptionalFavicon(url, baseUrl, consoleText = null) {
  if (typeof url !== "string" || url === "") return false;
  try {
    const target = new URL(url);
    const base = new URL(baseUrl);
    if (target.origin !== base.origin || target.pathname !== "/favicon.ico") return false;
    return consoleText === null || /^Failed to load resource:/.test(consoleText);
  } catch {
    return false;
  }
}

async function executeAction(page, action, baseUrl, timeoutMs) {
  if (action.type === "navigate") {
    await page.goto(sameOriginUrl(action.route, baseUrl), { waitUntil: "networkidle", timeout: timeoutMs });
    return;
  }
  const locator = await uniqueLocator(page, action.testId, timeoutMs);
  if (action.type === "click") {
    await locator.click({ timeout: timeoutMs });
    return;
  }
  if (action.type === "fill") {
    await locator.fill(action.value, { timeout: timeoutMs });
    return;
  }
  if (action.type === "select") {
    const nativeSelect = await locator.evaluate((element) => element.tagName === "SELECT");
    if (nativeSelect) {
      const option = await uniqueLocator(page, action.optionTestId, timeoutMs);
      const optionBinding = await option.evaluate((element) => ({
        elementType: element.tagName,
        ownerTestId: element.closest("select")?.getAttribute("data-testid") ?? null,
        value: element.value
      }));
      if (optionBinding.elementType !== "OPTION") {
        throw new Error(
          `native select option ${action.optionTestId} must identify an <option>; received <${optionBinding.elementType.toLowerCase()}>`
        );
      }
      if (optionBinding.ownerTestId !== action.testId) {
        throw new Error(
          `native select option ${action.optionTestId} belongs to ${String(optionBinding.ownerTestId)}, expected ${action.testId}`
        );
      }
      if (optionBinding.value !== action.value) {
        throw new Error(
          `native select option ${action.optionTestId} value ${optionBinding.value} conflicts with contract value ${action.value}`
        );
      }
      const selectedValues = await locator.selectOption({ value: action.value }, { timeout: timeoutMs });
      if (selectedValues.length !== 1 || selectedValues[0] !== action.value) {
        throw new Error(
          `native select ${action.testId} selected ${selectedValues.join(",")}, expected ${action.value}`
        );
      }
      return;
    }
    await locator.click({ timeout: timeoutMs });
    const option = await uniqueLocator(page, action.optionTestId, timeoutMs);
    await option.click({ timeout: timeoutMs });
    return;
  }
  if (action.type === "press") {
    await locator.press(action.key, { timeout: timeoutMs });
    return;
  }
  throw new Error(`unsupported action type: ${action.type}`);
}

async function executeAssertion(page, assertion, baseUrl, timeoutMs) {
  if (assertion.kind === "route") {
    await page.waitForURL(
      (url) => `${url.pathname}${url.search}` === assertion.value,
      { timeout: timeoutMs }
    );
    const actual = `${new URL(page.url()).pathname}${new URL(page.url()).search}`;
    if (actual !== assertion.value) throw new Error(`route assertion expected ${assertion.value}, received ${actual}`);
    return;
  }
  if (assertion.kind === "searchParam") {
    const actual = new URL(page.url()).searchParams.get(assertion.name);
    if (actual !== assertion.value) {
      throw new Error(`searchParam ${assertion.name} expected ${assertion.value}, received ${actual}`);
    }
    return;
  }
  if (assertion.kind === "absentTestId") {
    const count = await testIdLocator(page, assertion.testId).count();
    if (count !== 0) throw new Error(`data-testid ${assertion.testId} expected absent, received count ${count}`);
    return;
  }
  if (assertion.kind === "testIdCount") {
    const count = await testIdLocator(page, assertion.testId).count();
    if (count !== assertion.count) {
      throw new Error(`data-testid ${assertion.testId} expected count ${assertion.count}, received ${count}`);
    }
    return;
  }
  const locator = await uniqueLocator(page, assertion.testId, timeoutMs);
  if (assertion.kind === "visibleTestId") {
    if (!(await locator.isVisible())) throw new Error(`data-testid ${assertion.testId} is not visible`);
    return;
  }
  if (assertion.kind === "value") {
    let actual;
    try {
      actual = await locator.inputValue({ timeout: timeoutMs });
    } catch {
      actual = await locator.getAttribute("value");
    }
    if (String(actual) !== String(assertion.value)) {
      throw new Error(`data-testid ${assertion.testId} expected value ${assertion.value}, received ${actual}`);
    }
    return;
  }
  if (assertion.kind === "ariaState") {
    const actual = await locator.getAttribute(`aria-${assertion.name}`);
    if (actual !== assertion.value) {
      throw new Error(
        `data-testid ${assertion.testId} expected aria-${assertion.name}=${assertion.value}, received ${actual}`
      );
    }
    return;
  }
  throw new Error(`unsupported assertion kind: ${assertion.kind}`);
}

async function uniqueLocator(page, testId, timeoutMs) {
  const locator = testIdLocator(page, testId);
  await locator.first().waitFor({ state: "attached", timeout: timeoutMs });
  const count = await locator.count();
  if (count !== 1) throw new Error(`data-testid ${testId} expected exactly one match, received ${count}`);
  return locator;
}

function testIdLocator(page, testId) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(testId)) throw new Error(`unsafe data-testid token: ${testId}`);
  return page.locator(`[data-testid="${testId}"]`);
}

function validateContract(contract) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  const validate = ajv.compile(JSON.parse(readFileSync(guidedPilotSchemaPath, "utf8")));
  if (!validate(contract)) {
    throw new Error(
      `guided pilot flow contract schema failed: ${ajv.errorsText(validate.errors, { separator: "; " })}`
    );
  }
}

function resolveBrowserExecutable() {
  const playwrightPath = chromium.executablePath();
  const candidates = [
    { path: playwrightPath, source: "playwright-bundled" },
    process.env.LOCALAPPDATA
      ? {
          path: resolve(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
          source: "installed-chrome"
        }
      : null,
    { path: "C:/Program Files/Google/Chrome/Application/chrome.exe", source: "installed-chrome" },
    { path: "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", source: "installed-chrome" },
    { path: "C:/Program Files/Microsoft/Edge/Application/msedge.exe", source: "installed-edge" },
    { path: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", source: "installed-edge" }
  ].filter(Boolean);
  const selected = candidates.find((candidate) => existsSync(candidate.path));
  if (!selected) {
    throw new Error("no isolated-launch Chromium executable is available for guided pilot flow smoke");
  }
  return { ...selected, sha256: sha256(readFileSync(selected.path)) };
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "http:") throw new Error("baseUrl must use http");
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("baseUrl must use localhost or 127.0.0.1");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("baseUrl must contain only a local origin");
  }
  return url.origin;
}

function sameOriginUrl(route, baseUrl) {
  const url = new URL(route, baseUrl);
  if (url.origin !== baseUrl) throw new Error(`route escaped preview origin: ${route}`);
  return url.href;
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(sortValue(value), null, 2)}\n`, "utf8");
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!name.startsWith("--")) throw new Error(`unexpected argument: ${name}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${name}`);
    options[name.slice(2)] = value;
    index += 1;
  }
  return options;
}

async function runCli() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runGuidedPilotFlowSmoke({
    baseUrl: options["base-url"],
    contractPath: options.contract,
    expectedContractSha256: options["contract-sha256"],
    outFile: options.out,
    timeoutMs: options["timeout-ms"] ? Number(options["timeout-ms"]) : 10_000
  });
  if (result.status !== "passed") {
    throw new Error(result.firstFailure.message);
  }
  console.log(
    `run-guided-pilot-flow-smoke passed: contract=${result.contract.contractId}; flows=${result.flows.length}`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runCli();
  } catch (error) {
    console.error(
      `run-guided-pilot-flow-smoke failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  }
}
