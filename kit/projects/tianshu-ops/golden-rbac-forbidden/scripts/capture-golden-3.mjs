import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const kitRoot = resolve(projectRoot, "../../..");
const evidenceRoot = resolve(projectRoot, "evidence");
const screenshotRoot = resolve(evidenceRoot, "screenshots");
const route = "http://127.0.0.1:5188/tianshu/platform/rbac/forbidden-preview";
const viewports = [
  { id: "1440x1100", width: 1440, height: 1100 },
  { id: "1024x768", width: 1024, height: 768 },
  { id: "390x844", width: 390, height: 844 }
];

await mkdir(screenshotRoot, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
let desktopInteraction;

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      colorScheme: "light",
      deviceScaleFactor: 1,
      viewport: { width: viewport.width, height: viewport.height }
    });
    const page = await context.newPage();
    const consoleEntries = [];
    page.on("console", (message) => {
      if (["warning", "warn", "error"].includes(message.type())) {
        consoleEntries.push({ type: message.type(), text: message.text() });
      }
    });
    page.on("pageerror", (error) => consoleEntries.push({ type: "pageerror", text: error.message }));

    await page.goto(route, { waitUntil: "domcontentloaded" });
    await page.getByTestId("golden-permission-dashboard").waitFor({ state: "visible" });
    await page.waitForTimeout(400);

    const mainScreenshot = resolve(screenshotRoot, `golden-3-rbac-forbidden-v1-${viewport.id}.png`);
    await page.screenshot({ path: mainScreenshot });

    const audit = await page.evaluate(() => ({
      documentTitle: document.title,
      heading: document.querySelector("h1")?.textContent?.trim() ?? null,
      innerSize: { width: window.innerWidth, height: window.innerHeight },
      pageHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      privacyMode: document.querySelector("[data-privacy-mode]")?.getAttribute("data-privacy-mode") ?? null,
      protectedTableCount: document.querySelectorAll("table").length,
      recoveryHref: document.querySelector('[data-testid="golden-permission-dashboard"]')?.getAttribute("href") ?? null
    }));

    assert.equal(audit.heading, "无权访问账号与权限");
    assert.equal(audit.pageHorizontalOverflow, false);
    assert.equal(audit.privacyMode, "no-protected-data");
    assert.equal(audit.protectedTableCount, 0);
    assert.equal(audit.recoveryHref, "/dashboard");

    if (viewport.id === "1440x1100") {
      await page.getByTestId("golden-permission-request").click();
      const dialog = page.getByRole("dialog", { name: "申请账号与权限访问" });
      await dialog.waitFor({ state: "visible" });
      await page.waitForTimeout(350);
      const drawerScreenshot = resolve(screenshotRoot, "golden-3-rbac-forbidden-v1-request-panel.png");
      await page.screenshot({ path: drawerScreenshot });
      const panelText = await dialog.innerText();
      assert.match(panelText, /platform:rbac:read/);
      assert.doesNotMatch(panelText, /角色名称|用户姓名|权限点列表/);

      await page.getByTestId("golden-permission-request-close").click();
      await dialog.waitFor({ state: "hidden" });
      const activeTestId = await page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? null);
      assert.equal(activeTestId, "golden-permission-request");

      await page.getByTestId("golden-permission-dashboard").click();
      await page.waitForURL("**/tianshu/dashboard");
      assert.equal(new URL(page.url()).pathname, "/tianshu/dashboard");

      desktopInteraction = {
        requestPanel: "opened-and-closed",
        focusReturnedTo: activeTestId,
        recoveryRoute: new URL(page.url()).pathname,
        screenshot: relative(kitRoot, drawerScreenshot).replaceAll("\\", "/")
      };
    }

    if (viewport.id === "390x844") {
      const mobileToggle = page.locator(".tianshu-nav__toggle");
      assert.equal(await mobileToggle.isVisible(), true);
      assert.equal(await mobileToggle.getAttribute("aria-label"), "展开导航");
      await mobileToggle.click();
      assert.equal(await mobileToggle.getAttribute("aria-expanded"), "true");
      assert.equal(await mobileToggle.getAttribute("aria-label"), "收起导航");
      await mobileToggle.click();
    }

    assert.deepEqual(consoleEntries, []);
    results.push({
      ...viewport,
      ...audit,
      consoleErrors: 0,
      consoleWarnings: 0,
      screenshot: relative(kitRoot, mainScreenshot).replaceAll("\\", "/")
    });
    await context.close();
  }
} finally {
  await browser.close();
}

const evidence = {
  version: "1.0.0",
  kind: "golden-browser-acceptance",
  goldenPageId: "rbac-forbidden-antd-v6-20260809",
  candidate: "golden-3-v1",
  recordedAtUtc: new Date().toISOString(),
  browser: "Playwright CLI with Chrome channel",
  route,
  responsive: results,
  desktopInteraction
};
await writeFile(resolve(evidenceRoot, "browser-v1.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify(evidence, null, 2));
