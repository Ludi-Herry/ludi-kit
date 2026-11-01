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
const initialScreenshot = resolve(screenshotRoot, "simple-list-filtering-initial.png");
const filteredScreenshot = resolve(screenshotRoot, "simple-list-filtering-filtered.png");
const resetScreenshot = resolve(screenshotRoot, "simple-list-filtering-reset.png");
const route = "http://127.0.0.1:5192/";

for (const path of [evidenceFile, initialScreenshot, filteredScreenshot, resetScreenshot]) await assertNew(path);
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
let reset = null;
let failure = null;

page.on("console", (message) => {
  if (["warning", "warn", "error"].includes(message.type())) {
    consoleEntries.push({ type: message.type(), text: message.text() });
  }
});
page.on("pageerror", (error) => consoleEntries.push({ type: "pageerror", text: error.message }));

try {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "待处理任务" }).waitFor({ state: "visible" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: initialScreenshot });

  audit = await page.evaluate(() => ({
    documentTitle: document.title,
    heading: document.querySelector("h2")?.textContent?.trim() ?? null,
    innerSize: { width: window.innerWidth, height: window.innerHeight },
    pageHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    tableRows: Array.from(document.querySelectorAll(".ant-table-tbody > tr.ant-table-row"), (row) => row.textContent?.trim() ?? "")
  }));
  assert.equal(audit.heading, "待处理任务");
  assert.equal(audit.pageHorizontalOverflow, false);
  assert.equal(audit.tableRows.length, 3);

  const keyword = page.getByPlaceholder("任务编号或客户");
  const priority = page.getByRole("combobox", { name: "优先级" });
  await keyword.fill("TK-1001");
  await priority.click();
  const urgentOption = page
    .locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content")
    .filter({ hasText: "紧急" });
  await urgentOption.waitFor({ state: "visible" });
  await urgentOption.click();
  await page.getByTestId("simple-list-filter-submit").click();
  await page.waitForTimeout(100);

  const filteredRows = await page.locator(".ant-table-tbody > tr.ant-table-row").allInnerTexts();
  interaction = {
    steps: ["enter TK-1001", "select 紧急", "activate 筛选"],
    expectedBusinessState: { rowCount: 1, retainedRow: "TK-1001", excludedRows: ["TK-1002", "TK-1003"] },
    observedBusinessState: {
      keyword: await keyword.inputValue(),
      selectedPriority: await priority.locator("..").innerText(),
      countText: await page.getByTestId("simple-list-filter-count").innerText(),
      rowCount: filteredRows.length,
      rows: filteredRows
    }
  };
  await page.screenshot({ path: filteredScreenshot });
  assert.equal(interaction.observedBusinessState.keyword, "TK-1001");
  assert.match(interaction.observedBusinessState.selectedPriority, /紧急/);
  assert.equal(interaction.observedBusinessState.countText, "共 1 条");
  assert.equal(interaction.observedBusinessState.rowCount, 1);
  assert.match(interaction.observedBusinessState.rows[0] ?? "", /TK-1001/);
  assert.doesNotMatch(interaction.observedBusinessState.rows.join("\n"), /TK-1002|TK-1003/);

  await page.getByTestId("simple-list-filter-reset").click();
  await page.waitForTimeout(100);
  const resetRows = await page.locator(".ant-table-tbody > tr.ant-table-row").allInnerTexts();
  reset = {
    expectedBusinessState: { rowCount: 3, keyword: "" },
    observedBusinessState: {
      keyword: await keyword.inputValue(),
      countText: await page.getByTestId("simple-list-filter-count").innerText(),
      rowCount: resetRows.length,
      rows: resetRows
    }
  };
  await page.screenshot({ path: resetScreenshot });
  assert.equal(reset.observedBusinessState.keyword, "");
  assert.equal(reset.observedBusinessState.countText, "共 3 条");
  assert.equal(reset.observedBusinessState.rowCount, 3);
  assert.deepEqual(consoleEntries, []);
} catch (error) {
  failure = {
    classification: interaction ? "simple-list-filter-business-state-failed" : "canary-browser-runner-failed-before-business-readback",
    message: error instanceof Error ? error.message : String(error),
    rawStack: error instanceof Error ? error.stack : null
  };
} finally {
  await context.close();
  await browser.close();
}

const evidence = {
  version: "1.0.0",
  kind: "image2-non-holdout-simple-list-filtering-canary-browser-evidence",
  fixtureId: "antd-simple-list-filtering",
  status: failure ? "failed" : "passed",
  recordedAtUtc: new Date().toISOString(),
  browser: "Playwright CLI with Chrome channel",
  route,
  viewport: { width: 1440, height: 1100, deviceScaleFactor: 1 },
  audit,
  interaction,
  reset,
  consoleEntries,
  screenshots: [initialScreenshot, filteredScreenshot, resetScreenshot].map((path) => relative(kitRoot, path).replaceAll("\\", "/")),
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
