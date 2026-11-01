import assert from "node:assert/strict";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const fixtureRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const kitRoot = resolve(fixtureRoot, "../../..");
const evidenceRoot = resolve(fixtureRoot, "evidence");
const screenshotRoot = resolve(evidenceRoot, "screenshots");
const evidenceFile = resolve(evidenceRoot, "browser.json");
const screenshot = resolve(screenshotRoot, "dashboard-content-fidelity.png");
const route = "http://127.0.0.1:5193/";
const requiredCopy = ["+7", "平稳", "-1", "同步状态"];
const forbiddenCopy = ["验收标准", "首屏展示全部设备状态", "主操作保持唯一"];

for (const path of [evidenceFile, screenshot]) await assertNew(path);
await mkdir(screenshotRoot, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  colorScheme: "light",
  deviceScaleFactor: 1,
  viewport: { width: 1440, height: 1100 }
});
const page = await context.newPage();
const consoleEntries = [];
let audit = null;
let interaction = null;
let failure = null;

page.on("console", (message) => {
  if (["warning", "warn", "error"].includes(message.type())) {
    consoleEntries.push({ type: message.type(), text: message.text() });
  }
});
page.on("pageerror", (error) => consoleEntries.push({ type: "pageerror", text: error.message }));

try {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "设备健康概览" }).waitFor({ state: "visible" });
  await page.waitForTimeout(300);

  const bodyText = await page.locator("body").innerText();
  const metricDeltas = [];
  for (let index = 0; index < 3; index += 1) {
    const locator = page.getByTestId(`dashboard-metric-delta-${index}`);
    metricDeltas.push({
      text: (await locator.innerText()).trim(),
      trend: await locator.getAttribute("data-trend")
    });
  }
  audit = {
    documentTitle: await page.title(),
    heading: (await page.getByRole("heading", { name: "设备健康概览" }).innerText()).trim(),
    innerSize: await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })),
    pageHorizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
    metricDeltas,
    requiredCopy: Object.fromEntries(requiredCopy.map((text) => [text, bodyText.includes(text)])),
    forbiddenCopy: Object.fromEntries(forbiddenCopy.map((text) => [text, bodyText.includes(text)]))
  };

  const syncButton = page.getByRole("button", { name: "同步状态" });
  await syncButton.click();
  interaction = {
    steps: ["activate 同步状态"],
    buttonVisibleAfterActivation: await syncButton.isVisible(),
    headingStableAfterActivation: await page.getByRole("heading", { name: "设备健康概览" }).isVisible()
  };
  await page.screenshot({ path: screenshot, fullPage: true });

  assert.equal(audit.heading, "设备健康概览");
  assert.equal(audit.pageHorizontalOverflow, false);
  assert.deepEqual(audit.metricDeltas, [
    { text: "+7", trend: "up" },
    { text: "平稳", trend: "flat" },
    { text: "-1", trend: "down" }
  ]);
  assert.ok(Object.values(audit.requiredCopy).every(Boolean));
  assert.ok(Object.values(audit.forbiddenCopy).every((present) => present === false));
  assert.equal(interaction.buttonVisibleAfterActivation, true);
  assert.equal(interaction.headingStableAfterActivation, true);
  assert.deepEqual(consoleEntries, []);
} catch (error) {
  failure = {
    classification: audit ? "dashboard-content-fidelity-readback-failed" : "canary-browser-runner-failed-before-content-readback",
    message: error instanceof Error ? error.message : String(error),
    rawStack: error instanceof Error ? error.stack : null
  };
} finally {
  await context.close();
  await browser.close();
}

const evidence = {
  version: "1.0.0",
  kind: "image2-non-holdout-dashboard-content-fidelity-canary-browser-evidence",
  fixtureId: "antd-dashboard-content-fidelity",
  status: failure ? "failed" : "passed",
  recordedAtUtc: new Date().toISOString(),
  browser: "Playwright CLI with Chrome channel",
  route,
  viewport: { width: 1440, height: 1100, deviceScaleFactor: 1 },
  audit,
  interaction,
  consoleEntries,
  screenshots: [relative(kitRoot, screenshot).replaceAll("\\", "/")],
  failure,
  holdout: false,
  iterationConsumed: false,
  previousHoldoutOutputUsedAsInput: false,
  figma: { targetNode: "YOUR_NODE_ID", locked: true, writeAttempted: false }
};

await writeFile(evidenceFile, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify(evidence, null, 2));
if (failure) process.exitCode = 1;

async function assertNew(path) {
  try {
    await access(path);
    throw new Error(`refusing to overwrite existing evidence: ${path}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
