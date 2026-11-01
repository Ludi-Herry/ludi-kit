import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { access, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const websiteDir = path.resolve(scriptDir, "..");
const mediaDir = path.join(websiteDir, "public", "media");
const evidenceDir = path.join(websiteDir, "evidence");
const stagingDir = path.join(mediaDir, ".capture-staging");
const editorUrl = "http://127.0.0.1:5393/editor";
const viewport = { width: 1600, height: 1000 };
const outputFiles = [
  path.join(mediaDir, "editor-overview.png"),
  path.join(mediaDir, "editor-colors.png"),
  path.join(mediaDir, "editor-components.png"),
  path.join(mediaDir, "editor-demo.webm"),
  path.join(evidenceDir, "capture-editor-overview.json"),
  path.join(evidenceDir, "capture-editor-colors.json"),
  path.join(evidenceDir, "capture-editor-components.json"),
  path.join(evidenceDir, "capture-editor-demo.json")
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function assertAbsent(filePath) {
  try {
    await access(filePath);
    throw new Error("Refusing to overwrite an existing capture: " + path.basename(filePath));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function pngDimensions(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert(buffer.length >= 24 && buffer.subarray(0, 8).equals(signature), "Screenshot is not a valid PNG.");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function relativePath(filePath) {
  return path.relative(websiteDir, filePath).split(path.sep).join("/");
}

async function saveScreenshotEvidence(page, capture) {
  const imagePath = path.join(mediaDir, capture.imageName);
  const evidencePath = path.join(evidenceDir, "capture-" + capture.id + ".json");
  const screenshot = await page.screenshot({ path: imagePath, animations: "disabled" });
  const dimensions = pngDimensions(screenshot);
  assert(dimensions.width === viewport.width && dimensions.height === viewport.height,
    "Unexpected screenshot dimensions for " + capture.id + ".");

  const evidence = {
    schemaVersion: "ludi-product-capture/v1",
    capturedAt: new Date().toISOString(),
    pageUrl: editorUrl,
    viewport,
    state: capture.id,
    operations: capture.operations,
    expectedVisibleText: capture.expectedVisibleText,
    observedVisibleText: capture.observedVisibleText,
    screenshot: {
      path: relativePath(imagePath),
      width: dimensions.width,
      height: dimensions.height
    },
    rejectedMutationRequests: 0,
    mutationNote: "No request interceptor was installed; 0 is the number of requests blocked by this capture, not a claim that all requests were monitored. Only navigation controls were used; no write controls were invoked and writeback was not tested."
  };
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
  return evidence;
}

async function waitForHeading(page, expected) {
  const heading = page.locator(".ludi-stage__heading > strong");
  await heading.waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(
    (text) => document.querySelector(".ludi-stage__heading > strong")?.textContent?.trim() === text,
    expected,
    { timeout: 30000 }
  );
}

async function waitForFrameText(page, minimumLength = 40) {
  const frameBody = page.frameLocator("#ludi-stage-frame").locator("body");
  await page.locator("#ludi-stage-frame").waitFor({ state: "visible", timeout: 30000 });
  await frameBody.waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(
    (minimum) => {
      const frame = document.querySelector("#ludi-stage-frame");
      const text = frame?.contentDocument?.body?.innerText?.trim() ?? "";
      return text.length >= minimum;
    },
    minimumLength,
    { timeout: 30000 }
  );
  return frameBody.innerText();
}

async function delay(page, milliseconds) {
  await page.waitForTimeout(milliseconds);
}

async function main() {
  for (const filePath of outputFiles) await assertAbsent(filePath);
  await mkdir(stagingDir);

  let browser;
  let context;
  let contextClosed = false;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
    context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      recordVideo: { dir: stagingDir, size: viewport }
    });
    const page = await context.newPage();

    await page.goto(editorUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.locator(".ludi-editor__topbar").waitFor({ state: "visible", timeout: 30000 });
    await waitForHeading(page, "设备生命周期 · 全部设备");
    const canvasText = await waitForFrameText(page, 40);
    const overviewText = await page.locator("body").innerText();
    for (const text of ["组件库编辑器", "设备生命周期 · 全部设备", "画布", "选择"]) {
      assert(overviewText.includes(text), "The overview does not show expected text: " + text);
    }
    await delay(page, 2800);
    const overviewEvidence = await saveScreenshotEvidence(page, {
      id: "editor-overview",
      imageName: "editor-overview.png",
      operations: ["Opened the existing editor preview.", "Waited for the embedded Tianshu canvas text to render."],
      expectedVisibleText: ["组件库编辑器", "设备生命周期 · 全部设备", "画布", "选择"],
      observedVisibleText: ["组件库编辑器", "设备生命周期 · 全部设备", "画布", "选择"].filter((text) => overviewText.includes(text)).concat(canvasText.trim().split(/\r?\n/).filter(Boolean).slice(0, 5))
    });

    const colorNav = page.locator(".ludi-nav__item").filter({ hasText: "颜色" });
    assert(await colorNav.count() === 1, "Could not uniquely identify the Colors navigation item.");
    await colorNav.click();
    await waitForHeading(page, "颜色");
    const colorContent = page.locator(".ludi-stage__scroll");
    await colorContent.getByRole("heading", { name: "前景与背景", exact: true }).waitFor({ state: "visible", timeout: 30000 });
    const colorText = await colorContent.innerText();
    for (const text of ["前景与背景", "品牌与功能色", "主色派生色阶（只读）"]) {
      assert(colorText.includes(text), "The Colors view does not show expected text: " + text);
    }
    await delay(page, 3200);
    const colorsEvidence = await saveScreenshotEvidence(page, {
      id: "editor-colors",
      imageName: "editor-colors.png",
      operations: ["Selected the existing Colors item under 基础.", "Waited for the color specification cards to render."],
      expectedVisibleText: ["颜色", "前景与背景", "品牌与功能色", "主色派生色阶（只读）"],
      observedVisibleText: ["颜色", "前景与背景", "品牌与功能色", "主色派生色阶（只读）"]
    });

    const buttonNav = page.locator(".ludi-nav__item").filter({ hasText: "Button" });
    assert(await buttonNav.count() === 1, "Could not uniquely identify the Button navigation item.");
    await buttonNav.click();
    await waitForHeading(page, "Button");
    const matrixText = await waitForFrameText(page, 30);
    const buttonText = await page.locator("body").innerText();
    for (const text of ["Button", "按钮", "变体 × 尺寸", "状态"]) {
      assert(buttonText.includes(text), "The Button view does not show expected text: " + text);
    }
    await delay(page, 3200);
    const componentsEvidence = await saveScreenshotEvidence(page, {
      id: "editor-components",
      imageName: "editor-components.png",
      operations: ["Selected the existing Button item under 组件.", "Waited for the Button matrix frame text to render."],
      expectedVisibleText: ["Button", "按钮", "变体 × 尺寸", "状态"],
      observedVisibleText: ["Button", "按钮", "变体 × 尺寸", "状态"].filter((text) => buttonText.includes(text)).concat(matrixText.trim().split(/\r?\n/).filter(Boolean).slice(0, 8))
    });
    await delay(page, 2600);

    const video = page.video();
    assert(video, "Playwright did not create a video recording.");
    await context.close();
    contextClosed = true;
    const stagedVideoPath = await video.path();
    const finalVideoPath = path.join(mediaDir, "editor-demo.webm");
    await rename(stagedVideoPath, finalVideoPath);

    const videoStat = await stat(finalVideoPath);
    assert(videoStat.size > 0, "The recorded video is empty.");
    const probe = spawnSync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      finalVideoPath
    ], { encoding: "utf8", windowsHide: true });
    assert(probe.status === 0, "ffprobe could not read the completed video.");
    const durationSeconds = Number(probe.stdout.trim());
    const durationInRange = Number.isFinite(durationSeconds) && durationSeconds >= 15 && durationSeconds <= 25;

    const screenshots = [];
    for (const name of ["editor-overview.png", "editor-colors.png", "editor-components.png"]) {
      const imagePath = path.join(mediaDir, name);
      const dimensions = pngDimensions(await readFile(imagePath));
      assert(dimensions.width === viewport.width && dimensions.height === viewport.height,
        "Unexpected final screenshot dimensions for " + name + ".");
      screenshots.push({ path: relativePath(imagePath), width: dimensions.width, height: dimensions.height });
    }

    const demoEvidence = {
      schemaVersion: "ludi-product-capture/v1",
      capturedAt: new Date().toISOString(),
      pageUrl: editorUrl,
      viewport,
      operations: [
        "Opened the existing editor preview and waited for the Tianshu canvas frame.",
        "Selected 颜色 and waited for the color specification to render.",
        "Selected Button and waited for the component matrix to render."
      ],
      expectedVisibleTextByState: {
        overview: ["组件库编辑器", "设备生命周期 · 全部设备", "画布", "选择"],
        colors: ["颜色", "前景与背景", "品牌与功能色", "主色派生色阶（只读）"],
        button: ["Button", "按钮", "变体 × 尺寸", "状态"]
      },
      stateCapturedAt: {
        overview: overviewEvidence.capturedAt,
        colors: colorsEvidence.capturedAt,
        button: componentsEvidence.capturedAt
      },
      rejectedMutationRequests: 0,
      mutationNote: "No request interceptor was installed; 0 is the number of requests blocked by this capture, not a claim that all requests were monitored. Only navigation controls were used; no write controls were invoked and writeback was not tested.",
      recordingStatus: durationInRange ? "passed" : "failed",
      statusReason: durationInRange
        ? "Measured video duration is within the 15–25 second target."
        : "Measured video duration is " + String(durationSeconds) + " seconds; the target is 15–25 seconds.",
      screenshots,
      video: {
        path: relativePath(finalVideoPath),
        width: viewport.width,
        height: viewport.height,
        durationSeconds: Number.isFinite(durationSeconds) ? Math.round(durationSeconds * 100) / 100 : null,
        bytes: videoStat.size
      }
    };
    await writeFile(path.join(evidenceDir, "capture-editor-demo.json"), JSON.stringify(demoEvidence, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
    assert(durationInRange, "The recorded video duration is outside the 15–25 second target.");

    console.log(JSON.stringify({
      screenshots,
      video: { path: relativePath(finalVideoPath), width: viewport.width, height: viewport.height, durationSeconds: demoEvidence.video.durationSeconds, bytes: videoStat.size },
      rejectedMutationRequests: 0
    }));
  } finally {
    if (context && !contextClosed) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error("Capture failed: " + error.message);
  process.exitCode = 1;
});
