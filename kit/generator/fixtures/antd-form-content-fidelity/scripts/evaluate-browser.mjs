import assert from "node:assert/strict";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const fixtureRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const kitRoot = resolve(fixtureRoot, "../../..");
const evidenceRoot = resolve(fixtureRoot, "evidence");
const screenshotRoot = resolve(evidenceRoot, "screenshots");
const evidenceFile = resolve(evidenceRoot, "browser-revision-05.json");
const screenshot = resolve(screenshotRoot, "form-content-fidelity-revision-05.png");
const route = "http://127.0.0.1:5194/";
const requiredCopy = ["选择任务", "绑定策略", "确认执行", "任务来源", "策略配置", "数量与备注", "保存草稿", "返回列表"];
const forbiddenCopy = ["验收标准", "字段按业务语义分组", "主操作保持唯一"];

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
const pageErrors = [];
const requestFailures = [];
let audit = null;
let interaction = null;
let failure = null;
let screenshotCaptured = false;

page.on("console", (message) => {
  if (["warning", "warn", "error"].includes(message.type())) {
    consoleEntries.push({ type: message.type(), text: message.text() });
  }
});
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("requestfailed", (request) => requestFailures.push({ url: request.url(), failure: request.failure()?.errorText ?? null }));

try {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "新建批处理任务" }).waitFor({ state: "visible" });
  await page.waitForTimeout(300);

  const bodyText = await page.locator("body").innerText();
  const buttons = (await page.getByRole("button").allInnerTexts()).map((text) => text.trim()).filter(Boolean);
  audit = {
    documentTitle: await page.title(),
    heading: (await page.getByRole("heading", { name: "新建批处理任务" }).innerText()).trim(),
    innerSize: await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })),
    pageHorizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
    requiredCopy: Object.fromEntries(requiredCopy.map((text) => [text, bodyText.includes(text)])),
    forbiddenCopy: Object.fromEntries(forbiddenCopy.map((text) => [text, bodyText.includes(text)])),
    buttons
  };

  const selects = page.locator(".ant-form-item .ant-select");
  await selects.nth(0).click();
  await page.locator('.ant-select-item-option[title="TASK-DEMO-01"]').click();
  await selects.nth(0).locator(".ant-select-content-has-value").waitFor({ state: "visible" });
  await selects.nth(1).click();
  await page.locator('.ant-select-item-option[title="标准策略"]').click();
  await selects.nth(1).locator(".ant-select-content-has-value").waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  await page.getByRole("heading", { name: "新建批处理任务" }).click();
  await page.waitForTimeout(500);
  await page.getByLabel("执行数量").fill("12");
  await page.getByLabel("执行备注").fill("仅用于非 Holdout canary");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await page.getByRole("button", { name: "返回列表" }).click();
  interaction = {
    steps: ["select source task", "select policy", "enter quantity and note", "activate both secondary actions"],
    sourceTask: (await selects.nth(0).locator(".ant-select-content-has-value").innerText()).trim(),
    policy: (await selects.nth(1).locator(".ant-select-content-has-value").innerText()).trim(),
    quantity: await page.getByLabel("执行数量").inputValue(),
    note: await page.getByLabel("执行备注").inputValue(),
    visibleDropdownsAfterInteractions: await page.locator(".ant-select-dropdown:visible").count(),
    secondaryActionsVisibleAfterActivation: await Promise.all([
      page.getByRole("button", { name: "保存草稿" }).isVisible(),
      page.getByRole("button", { name: "返回列表" }).isVisible()
    ])
  };
  await page.screenshot({ path: screenshot, fullPage: true });
  screenshotCaptured = true;

  assert.equal(audit.heading, "新建批处理任务");
  assert.equal(audit.pageHorizontalOverflow, false);
  assert.ok(Object.values(audit.requiredCopy).every(Boolean));
  assert.ok(Object.values(audit.forbiddenCopy).every((present) => present === false));
  assert.deepEqual(audit.buttons, ["保存草稿", "返回列表", "创建任务"]);
  assert.equal(interaction.sourceTask, "TASK-DEMO-01");
  assert.equal(interaction.policy, "标准策略");
  assert.equal(interaction.quantity, "12");
  assert.equal(interaction.note, "仅用于非 Holdout canary");
  assert.equal(interaction.visibleDropdownsAfterInteractions, 0);
  assert.deepEqual(interaction.secondaryActionsVisibleAfterActivation, [true, true]);
  assert.deepEqual(consoleEntries, []);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(requestFailures, []);
} catch (error) {
  failure = {
    classification: audit ? "form-content-fidelity-readback-failed" : "canary-browser-runner-failed-before-content-readback",
    message: error instanceof Error ? error.message : String(error),
    rawStack: error instanceof Error ? error.stack : null
  };
} finally {
  await context.close();
  await browser.close();
}

const evidence = {
  version: "1.0.4",
  kind: "image2-non-holdout-form-content-fidelity-canary-browser-evidence",
  fixtureId: "antd-form-content-fidelity",
  status: failure ? "failed" : "passed",
  recordedAtUtc: new Date().toISOString(),
  browser: "Playwright CLI with Chrome channel",
  route,
  viewport: { width: 1440, height: 1100, deviceScaleFactor: 1 },
  audit,
  interaction,
  consoleEntries,
  pageErrors,
  requestFailures,
  screenshots: screenshotCaptured ? [relative(kitRoot, screenshot).replaceAll("\\", "/")] : [],
  supersedesFailedEvidence: [
    "generator/fixtures/antd-form-content-fidelity/evidence/browser.json",
    "generator/fixtures/antd-form-content-fidelity/evidence/browser-revision-02.json",
    "generator/fixtures/antd-form-content-fidelity/evidence/browser-revision-03.json"
  ],
  revisesPassedEvidence: "generator/fixtures/antd-form-content-fidelity/evidence/browser-revision-04.json",
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
