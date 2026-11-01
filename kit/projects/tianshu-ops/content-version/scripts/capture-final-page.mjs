import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const pageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const kitRoot = resolve(pageRoot, "../../..");
const workflowRoot = resolve(pageRoot, "../workflow/content-version-existing");
const screenshotRoot = resolve(workflowRoot, "screenshots/final");
const evidencePath = resolve(workflowRoot, "browser.final.json");
const targetUrl = "http://127.0.0.1:5188/tianshu/content/version";
const failures = [];
const artifacts = [];
const checks = [];

await mkdir(screenshotRoot, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });

try {
  for (const viewport of [
    { id: "desktop-main", width: 1440, height: 1100 },
    { id: "tablet-main", width: 1024, height: 900 },
    { id: "mobile-main", width: 390, height: 844 }
  ]) {
    const { context, page, runtime } = await openPage(viewport);
    const metrics = await layoutMetrics(page);
    assert(metrics.title === "版本与回滚 · 天枢运营管理平台", `${viewport.id}: document title mismatch`);
    assert(metrics.heading === "内容 · 版本与回滚", `${viewport.id}: heading mismatch`);
    assert(metrics.activeNav === "版本与回滚", `${viewport.id}: navigation selection missing`);
    assert(metrics.compareDisabled === true, `${viewport.id}: compare must start disabled`);
    assert(metrics.pageOverflow === 0, `${viewport.id}: page overflow ${metrics.pageOverflow}px`);
    assert(!metrics.visibleHeaders.some((header) => header.overlapsAction), `${viewport.id}: fixed action column overlaps a visible column`);
    assert(metrics.controlOverlaps.length === 0, `${viewport.id}: controls overlap ${JSON.stringify(metrics.controlOverlaps)}`);
    const screenshot = await capture(page, `${viewport.id}.png`);
    checks.push({ id: viewport.id, viewport, metrics, runtime, screenshot });
    collectRuntime(viewport.id, runtime);
    await context.close();
  }

  await runDesktopWorkflow();
  await runMobileDiff();
  await runPermissionState();
  await runDataStates();
} finally {
  await browser.close();
}

const evidence = {
  version: "1.0.0",
  pageId: "content-version",
  route: "/tianshu/content/version",
  scope: "final-page",
  status: failures.length === 0 ? "passed" : "failed",
  recordedAt: new Date().toISOString(),
  runner: "@playwright/test 1.61.1 with Chrome channel",
  checks,
  artifacts,
  failures
};

await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(`content-version final evidence: ${evidence.status}; checks=${checks.length}; screenshots=${artifacts.length}; failures=${failures.length}`);
if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

async function runDesktopWorkflow() {
  const { context, page, runtime } = await openPage({ id: "desktop-workflow", width: 1440, height: 1100 });

  await page.getByRole("button", { name: "查看 v1.3.2 版本详情", exact: true }).click();
  await page.getByText("版本详情 · v1.3.2", { exact: true }).waitFor({ state: "visible" });
  await page.waitForTimeout(350);
  assert(await page.getByText("内容快照", { exact: true }).isVisible(), "desktop-workflow: snapshot section missing");
  const detailDesign = await page.evaluate(() => {
    const root = document.querySelector(".content-version-page__drawer-root--detail");
    const snapshot = root?.querySelector(".content-version-page__snapshot");
    const body = root?.querySelector(".ant-drawer-body");
    return {
      insideShell: Boolean(root?.closest(".tianshu-shell")),
      bodyPadding: body ? getComputedStyle(body).padding : null,
      sectionCount: root?.querySelectorAll(".content-version-page__drawer-section").length ?? 0,
      snapshotBorder: snapshot ? getComputedStyle(snapshot).borderTopWidth : null,
      spacingToken: snapshot ? getComputedStyle(snapshot).getPropertyValue("--spacing-md").trim() : null
    };
  });
  assert(detailDesign.insideShell, "desktop-workflow: detail drawer escaped TianShu token scope");
  assert(detailDesign.bodyPadding === "24px", `desktop-workflow: detail drawer body padding ${detailDesign.bodyPadding}`);
  assert(detailDesign.sectionCount === 1 && detailDesign.snapshotBorder === "1px" && detailDesign.spacingToken === "16px", "desktop-workflow: detail drawer visual sections missing");
  const detailShot = await capture(page, "desktop-details.png", { fullPage: false });
  await page.getByRole("button", { name: "关闭详情", exact: true }).click();
  await page.locator(".ant-drawer-content-wrapper").waitFor({ state: "hidden", timeout: 3000 });

  await page.getByPlaceholder("如 v1.2.0", { exact: true }).fill("v9");
  await page.getByRole("button", { name: "查询", exact: true }).click();
  assert(await page.getByText("当前筛选条件下没有版本记录，请重置筛选后重试。", { exact: true }).isVisible(), "desktop-workflow: filtered empty state missing");
  await page.getByRole("button", { name: "重置", exact: true }).click();
  assert(await page.getByRole("button", { name: "查看 v1.3.2 版本详情", exact: true }).isVisible(), "desktop-workflow: reset did not restore rows");

  await page.getByRole("button", { name: "高级筛选", exact: true }).click();
  await page.getByRole("combobox", { name: "版本状态", exact: true }).waitFor({ state: "visible" });
  const advancedLayout = await page.evaluate(() => {
    const panel = document.querySelector(".content-version-page__filters");
    const advanced = panel?.querySelector(".tianshu-ui-filter__fields--advanced");
    const actions = panel?.querySelector(".tianshu-ui-filter__actions");
    const advancedRect = advanced?.getBoundingClientRect();
    const actionsRect = actions?.getBoundingClientRect();
    return {
      panelColumns: panel ? getComputedStyle(panel).gridTemplateColumns : null,
      advancedColumns: advanced ? getComputedStyle(advanced).gridTemplateColumns : null,
      aligned: Boolean(advancedRect && actionsRect && Math.round(advancedRect.top) === Math.round(actionsRect.top)),
      horizontalGap: advancedRect && actionsRect ? Math.round(actionsRect.left - advancedRect.right) : null,
      actionsWiderThanField: Boolean(advancedRect && actionsRect && actionsRect.width > advancedRect.width)
    };
  });
  assert(advancedLayout.aligned && advancedLayout.horizontalGap === 16 && advancedLayout.actionsWiderThanField, `desktop-workflow: advanced filter grid mismatch ${JSON.stringify(advancedLayout)}`);
  const advancedFilterShot = await capture(page, "desktop-advanced-filter.png", { fullPage: false });
  await page.getByRole("button", { name: "收起筛选", exact: true }).click();
  await page.getByRole("combobox", { name: "版本状态", exact: true }).waitFor({ state: "hidden" });

  await page.getByRole("button", { name: /导出记录/ }).click();
  await page.getByText("导出版本记录", { exact: true }).waitFor({ state: "visible" });
  await page.waitForTimeout(300);
  const exportDesign = await page.evaluate(() => {
    const root = document.querySelector(".content-version-page__modal-root--export");
    const body = root?.querySelector(".ant-modal-body");
    const footer = root?.querySelector(".ant-modal-footer");
    const content = root?.querySelector(".content-version-page__export-body");
    return {
      insideShell: Boolean(root?.closest(".tianshu-shell")),
      bodyPadding: body ? getComputedStyle(body).padding : null,
      footerPadding: footer ? getComputedStyle(footer).padding : null,
      contentGap: content ? getComputedStyle(content).gap : null
    };
  });
  assert(exportDesign.insideShell && exportDesign.bodyPadding === "24px" && exportDesign.footerPadding === "12px 24px" && exportDesign.contentGap === "16px", `desktop-workflow: export modal design mismatch ${JSON.stringify(exportDesign)}`);
  const exportShot = await capture(page, "desktop-export-modal.png", { fullPage: false });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /导出 CSV/ }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  const downloadBytes = downloadPath ? await readFile(downloadPath) : Buffer.alloc(0);
  const downloadText = downloadBytes.toString("utf8");
  assert(download.suggestedFilename() === "content-version-history.csv", "desktop-workflow: CSV filename mismatch");
  assert(downloadText.includes("版本号,关联内容位/活动") || downloadText.includes('"版本号","关联内容位/活动"'), "desktop-workflow: CSV header missing");
  assert(downloadText.includes("v1.3.2"), "desktop-workflow: CSV row missing");

  await page.getByRole("radio", { name: "选择 v1.3.2 与当前版本比较", exact: true }).click();
  const compare = page.getByRole("button", { name: "比较版本差异", exact: true });
  assert(await compare.isEnabled(), "desktop-workflow: compare did not enable after selection");
  await compare.click();
  await page.getByText("版本 Diff · 首页 Banner A", { exact: true }).waitFor({ state: "visible" });
  await page.waitForTimeout(350);
  assert(await page.locator(".content-version-page__diff-row--changed").count() === 5, "desktop-workflow: expected five changed fields");
  const diffDesign = await page.evaluate(() => {
    const root = document.querySelector(".content-version-page__drawer-root--diff");
    const body = root?.querySelector(".ant-drawer-body");
    return {
      insideShell: Boolean(root?.closest(".tianshu-shell")),
      bodyPadding: body ? getComputedStyle(body).padding : null,
      sectionCount: root?.querySelectorAll(".content-version-page__drawer-section").length ?? 0,
      visibleRows: root?.querySelectorAll(".content-version-page__diff-row").length ?? 0
    };
  });
  assert(diffDesign.insideShell && diffDesign.bodyPadding === "24px" && diffDesign.sectionCount === 2 && diffDesign.visibleRows === 5, `desktop-workflow: diff drawer design mismatch ${JSON.stringify(diffDesign)}`);
  const diffShot = await capture(page, "desktop-diff.png", { fullPage: false });

  await page.getByRole("button", { name: /回滚至此版本/ }).last().click();
  await page.getByText("确认回滚内容版本", { exact: true }).waitFor({ state: "visible" });
  await page.waitForTimeout(250);
  const rollbackDesign = await page.evaluate(() => {
    const root = document.querySelector(".content-version-page__modal-root--rollback");
    const body = root?.querySelector(".ant-modal-body");
    const footer = root?.querySelector(".ant-modal-footer");
    const pair = root?.querySelector(".content-version-page__version-pair");
    return {
      insideShell: Boolean(root?.closest(".tianshu-shell")),
      bodyPadding: body ? getComputedStyle(body).padding : null,
      footerPadding: footer ? getComputedStyle(footer).padding : null,
      versionColumns: pair ? getComputedStyle(pair).gridTemplateColumns.split(" ").length : 0
    };
  });
  assert(rollbackDesign.insideShell && rollbackDesign.bodyPadding === "24px" && rollbackDesign.footerPadding === "12px 24px" && rollbackDesign.versionColumns === 2, `desktop-workflow: rollback modal design mismatch ${JSON.stringify(rollbackDesign)}`);
  const rollbackShot = await capture(page, "desktop-rollback-modal.png", { fullPage: false });
  const reason = page.getByPlaceholder("说明异常、影响范围和恢复原因", { exact: true });
  await reason.fill("回滚");
  await page.getByRole("button", { name: /确认回滚至 v1\.3\.2/ }).click();
  assert(await page.getByText("回滚原因至少填写 10 个字符", { exact: true }).isVisible(), "desktop-workflow: short reason validation missing");
  await reason.fill("活动主图链接异常，需要恢复稳定版本");
  await page.getByRole("button", { name: /确认回滚至 v1\.3\.2/ }).click();
  assert(await page.getByText("请确认回滚影响范围", { exact: true }).isVisible(), "desktop-workflow: acknowledgement validation missing");
  await page.getByRole("checkbox", { name: /我已核对版本差异/ }).check();
  await page.getByRole("button", { name: /确认回滚至 v1\.3\.2/ }).click();
  await page.getByText(/已将“首页 Banner A”恢复到 v1\.3\.2/).waitFor({ state: "visible", timeout: 3000 });
  await page.locator(".ant-modal-wrap").waitFor({ state: "hidden", timeout: 3000 });
  await page.locator(".ant-drawer-content-wrapper").waitFor({ state: "hidden", timeout: 3000 });
  const postRollback = await page.evaluate(() => ({
    focusOnRefresh: document.activeElement?.hasAttribute("data-content-version-refresh") ?? false,
    currentV132: [...document.querySelectorAll(".content-version-page__table tbody tr")].some((row) => row.textContent?.includes("v1.3.2") && row.textContent?.includes("当前版本")),
    rolledBackV140: [...document.querySelectorAll(".content-version-page__table tbody tr")].some((row) => row.textContent?.includes("v1.4.0") && row.textContent?.includes("已回滚")),
    modalOpen: Boolean(document.querySelector(".ant-modal-wrap")),
    drawerOpen: Boolean(document.querySelector(".ant-drawer-open"))
  }));
  assert(postRollback.focusOnRefresh, "desktop-workflow: focus did not return to refresh after rollback");
  assert(postRollback.currentV132 && postRollback.rolledBackV140, "desktop-workflow: rollback state transition mismatch");
  assert(!postRollback.modalOpen && !postRollback.drawerOpen, "desktop-workflow: rollback surfaces did not close");
  const postShot = await capture(page, "desktop-post-rollback.png");

  checks.push({
    id: "desktop-workflow",
    interaction: {
      details: "passed",
      filterEmptyAndReset: "passed",
      advancedFilter: advancedLayout,
      export: { filename: download.suggestedFilename(), bytes: downloadBytes.length, sha256: sha256(downloadBytes) },
      diff: "passed",
      overlayDesign: { detail: detailDesign, export: exportDesign, diff: diffDesign, rollback: rollbackDesign },
      rollbackValidation: "passed",
      rollbackResult: postRollback
    },
    runtime,
    screenshots: [detailShot, advancedFilterShot, exportShot, diffShot, rollbackShot, postShot]
  });
  collectRuntime("desktop-workflow", runtime);
  await context.close();
}

async function runMobileDiff() {
  const { context, page, runtime } = await openPage({ id: "mobile-diff", width: 390, height: 844 });
  await page.getByRole("radio", { name: "选择 v1.3.2 与当前版本比较", exact: true }).click();
  await page.getByRole("button", { name: "比较版本差异", exact: true }).click();
  await page.getByText("版本 Diff · 首页 Banner A", { exact: true }).waitFor({ state: "visible" });
  await page.waitForTimeout(350);
  const metrics = await page.evaluate(() => {
    const row = document.querySelector(".content-version-page__diff-row");
    return {
      pageOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      diffColumns: row ? getComputedStyle(row).gridTemplateColumns : null,
      drawerWidth: Math.round(document.querySelector(".ant-drawer-content-wrapper")?.getBoundingClientRect().width ?? 0)
    };
  });
  assert(metrics.pageOverflow === 0, "mobile-diff: page overflow");
  assert(metrics.diffColumns && !metrics.diffColumns.includes(" "), "mobile-diff: diff did not collapse to one column");
  assert(metrics.drawerWidth === 390, `mobile-diff: drawer width ${metrics.drawerWidth}`);
  const screenshot = await capture(page, "mobile-diff.png", { fullPage: false });
  checks.push({ id: "mobile-diff", metrics, runtime, screenshot });
  collectRuntime("mobile-diff", runtime);
  await context.close();
}

async function runPermissionState() {
  const { context, page, runtime } = await openPage({ id: "mobile-permission", width: 390, height: 844 }, `${targetUrl}?permission=denied`);
  assert(await page.getByText("无版本与回滚查看权限", { exact: true }).isVisible(), "mobile-permission: title missing");
  assert(await page.getByRole("button", { name: "返回排期与发布", exact: true }).isVisible(), "mobile-permission: recovery action missing");
  const metrics = await page.evaluate(() => ({ pageOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth) }));
  assert(metrics.pageOverflow === 0, "mobile-permission: page overflow");
  const screenshot = await capture(page, "mobile-permission.png");
  checks.push({ id: "mobile-permission", metrics, runtime, screenshot });
  collectRuntime("mobile-permission", runtime);
  await context.close();
}

async function runDataStates() {
  const { context, page, runtime } = await openPage({ id: "data-states", width: 1024, height: 900 }, `${targetUrl}?dataState=loading`);
  assert(await page.locator(".content-version-page__data .ant-skeleton").isVisible(), "data-states: loading skeleton missing");
  await page.goto(`${targetUrl}?dataState=empty`, { waitUntil: "networkidle" });
  assert(await page.getByText("当前条件下暂无数据", { exact: true }).isVisible(), "data-states: empty state missing");
  await page.goto(`${targetUrl}?dataState=error`, { waitUntil: "networkidle" });
  assert(await page.getByText("数据加载失败", { exact: true }).isVisible(), "data-states: error state missing");
  const errorShot = await capture(page, "tablet-error-state.png");
  await page.goto(`${targetUrl}?dataState=stale`, { waitUntil: "networkidle" });
  assert(await page.getByText(/数据可能已过期/).first().isVisible(), "data-states: stale state missing");
  checks.push({ id: "data-states", states: ["loading", "empty", "error", "stale"], runtime, screenshot: errorShot });
  collectRuntime("data-states", runtime);
  await context.close();
}

async function openPage(viewport, url = targetUrl) {
  const context = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  const runtime = { console: [], pageErrors: [], requestFailures: [] };
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") runtime.console.push({ type: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => runtime.pageErrors.push(error.message));
  page.on("requestfailed", (request) => runtime.requestFailures.push({ url: request.url(), errorText: request.failure()?.errorText ?? "unknown" }));
  await page.goto(url, { waitUntil: "networkidle" });
  return { context, page, runtime };
}

async function layoutMetrics(page) {
  return page.evaluate(() => {
    const wrapper = document.querySelector(".content-version-page__grid .ant-table-content");
    const headers = [...document.querySelectorAll(".content-version-page__table thead th")];
    const action = headers.at(-1);
    const actionRect = action?.getBoundingClientRect();
    const controls = [...document.querySelectorAll([
      ".content-version-page__header-actions > .ant-btn",
      ".content-version-page__filters .tianshu-ui-filter__field > .ant-select",
      ".content-version-page__filters .tianshu-ui-filter__field > .ant-input",
      ".content-version-page__filters .tianshu-ui-filter__actions > .ant-btn"
    ].join(","))].map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        label: node.getAttribute("aria-label") || node.textContent?.trim() || node.className,
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
      };
    }).filter(({ rect }) => rect.right > rect.left && rect.bottom > rect.top);
    const controlOverlaps = controls.flatMap((control, index) => controls.slice(index + 1).flatMap((candidate) => {
      const width = Math.max(0, Math.min(control.rect.right, candidate.rect.right) - Math.max(control.rect.left, candidate.rect.left));
      const height = Math.max(0, Math.min(control.rect.bottom, candidate.rect.bottom) - Math.max(control.rect.top, candidate.rect.top));
      return width > 0 && height > 0 ? [{ first: control.label, second: candidate.label, area: Math.round(width * height) }] : [];
    }));
    return {
      title: document.title,
      heading: document.querySelector("h1")?.textContent?.trim() ?? null,
      activeNav: document.querySelector(".tianshu-nav-menu .ant-menu-item-selected")?.textContent?.trim() ?? null,
      compareDisabled: Boolean([...document.querySelectorAll("button")].find((button) => button.textContent?.includes("比较版本差异"))?.disabled),
      controlOverlaps,
      pageOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      table: wrapper ? { clientWidth: wrapper.clientWidth, scrollWidth: wrapper.scrollWidth } : null,
      visibleHeaders: headers.map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          text: node.textContent?.trim() ?? "",
          visible: rect.width > 0 && rect.right > 0 && rect.left < window.innerWidth,
          overlapsAction: Boolean(actionRect && node !== action && rect.left < actionRect.left && rect.right > actionRect.left)
        };
      }).filter((header) => header.visible)
    };
  });
}

async function capture(page, name, { fullPage = true } = {}) {
  const file = resolve(screenshotRoot, name);
  await page.screenshot({ fullPage, path: file });
  const receipt = await fileReceipt(file);
  artifacts.push(receipt);
  return receipt;
}

async function fileReceipt(file) {
  const bytes = await readFile(file);
  return { path: relative(kitRoot, file).replaceAll("\\", "/"), sha256: sha256(bytes) };
}

function collectRuntime(id, runtime) {
  if (runtime.console.length || runtime.pageErrors.length || runtime.requestFailures.length) failures.push(`${id}: browser runtime issues detected`);
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
