import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const pageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const kitRoot = resolve(pageRoot, "../../..");
const workflowRoot = resolve(pageRoot, "../workflow/content-version-existing");
const screenshotRoot = resolve(workflowRoot, "screenshots");
const evidencePath = resolve(workflowRoot, "browser.layout-v0.json");
const targetUrl = "http://127.0.0.1:5188/tianshu/content/version";
const viewports = [
  { id: "desktop-1440x1100", width: 1440, height: 1100 },
  { id: "tablet-1024x900", width: 1024, height: 900 },
  { id: "mobile-390x844", width: 390, height: 844 }
];

await mkdir(screenshotRoot, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
const failures = [];

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      deviceScaleFactor: 1,
      viewport: { width: viewport.width, height: viewport.height }
    });
    const page = await context.newPage();
    const runtime = { console: [], pageErrors: [], requestFailures: [] };

    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        runtime.console.push({ type: message.type(), text: message.text() });
      }
    });
    page.on("pageerror", (error) => runtime.pageErrors.push(error.message));
    page.on("requestfailed", (request) => {
      runtime.requestFailures.push({ url: request.url(), errorText: request.failure()?.errorText ?? "unknown" });
    });

    await page.goto(targetUrl, { waitUntil: "networkidle" });
    const screenshotPath = resolve(screenshotRoot, `${viewport.id}.png`);
    await page.screenshot({ fullPage: true, path: screenshotPath });

    const metrics = await page.evaluate(() => {
      const wrapper = document.querySelector(".content-version-page__grid .ant-table-content");
      const heading = document.querySelector("h1");
      const activeNav = document.querySelector(".tianshu-nav-menu .ant-menu-item-selected");
      const compare = [...document.querySelectorAll("button")].find((node) => node.textContent?.includes("比较版本差异"));
      const headers = [...document.querySelectorAll(".content-version-page__table thead th")];
      const action = headers.at(-1);
      const actionRect = action?.getBoundingClientRect();
      const visibleHeaders = headers
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            text: node.textContent?.trim() ?? "",
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            visible: rect.width > 0 && rect.right > 0 && rect.left < window.innerWidth,
            overlapsAction: Boolean(actionRect && node !== action && rect.left < actionRect.left && rect.right > actionRect.left)
          };
        })
        .filter((header) => header.visible);

      return {
        title: document.title,
        heading: heading?.textContent?.trim() ?? null,
        activeNav: activeNav?.textContent?.trim() ?? null,
        compareDisabled: compare ? Boolean(compare.disabled) : null,
        pageOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        table: wrapper
          ? {
              clientWidth: wrapper.clientWidth,
              scrollWidth: wrapper.scrollWidth,
              internalOverflow: Math.max(0, wrapper.scrollWidth - wrapper.clientWidth)
            }
          : null,
        visibleHeaders
      };
    });

    if (metrics.title !== "版本与回滚 · 天枢运营管理平台") failures.push(`${viewport.id}: unexpected document title`);
    if (metrics.heading !== "内容 · 版本与回滚") failures.push(`${viewport.id}: page heading missing`);
    if (metrics.activeNav !== "版本与回滚") failures.push(`${viewport.id}: active navigation missing`);
    if (metrics.compareDisabled !== true) failures.push(`${viewport.id}: compare action must be disabled before selection`);
    if (metrics.pageOverflow !== 0) failures.push(`${viewport.id}: page overflow is ${metrics.pageOverflow}px`);
    if (!metrics.table) failures.push(`${viewport.id}: table surface missing`);
    if (metrics.visibleHeaders.some((header) => header.overlapsAction)) failures.push(`${viewport.id}: fixed action column overlaps an adjacent visible column`);
    if (runtime.console.length || runtime.pageErrors.length || runtime.requestFailures.length) {
      failures.push(`${viewport.id}: browser runtime issues detected`);
    }

    if (viewport.id === "desktop-1440x1100") {
      const regionPath = resolve(screenshotRoot, "desktop-1440x1100-table.png");
      await page.locator(".content-version-page__data").screenshot({ path: regionPath });
      results.push({
        ...viewport,
        metrics,
        runtime,
        screenshot: await receipt(screenshotPath),
        criticalRegion: await receipt(regionPath)
      });

      await page.getByRole("button", { name: "查询", exact: true }).click();
      const feedback = await page.locator(".tianshu-toast").innerText();
      if (!feedback.includes("查询将在模块阶段接入")) failures.push("desktop-1440x1100: query feedback missing");
      results.at(-1).interaction = { action: "click query", feedback };
    } else {
      results.push({ ...viewport, metrics, runtime, screenshot: await receipt(screenshotPath) });
    }

    await context.close();
  }
} finally {
  await browser.close();
}

const evidence = {
  version: "1.0.0",
  pageId: "content-version",
  route: "/tianshu/content/version",
  scope: "layout-v0",
  status: failures.length === 0 ? "passed" : "failed",
  recordedAt: new Date().toISOString(),
  runner: "@playwright/test 1.61.1 with Chrome channel",
  results,
  failures
};

await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(`content-version layout evidence: ${evidence.status}; viewports=${results.length}; failures=${failures.length}`);
if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

async function receipt(file) {
  const bytes = await readFile(file);
  return {
    path: relative(kitRoot, file).replaceAll("\\", "/"),
    sha256: createHash("sha256").update(bytes).digest("hex")
  };
}
