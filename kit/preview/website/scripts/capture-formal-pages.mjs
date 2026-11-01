import { createHash } from "node:crypto";
import { access, appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const websiteDir = path.resolve(scriptDir, "..");
const mediaDir = path.join(websiteDir, "public", "media");
const evidenceRoot = path.join(websiteDir, "evidence");
const viewport = { width: 1600, height: 1000 };
const captures = [
  {
    id: "devices",
    url: "http://127.0.0.1:5393/device-ops/devices?editor=1",
    imageName: "product-devices.png"
  },
  {
    id: "dashboard",
    url: "http://127.0.0.1:5393/device-ops/dashboard",
    imageName: "product-dashboard.png"
  },
  {
    id: "firmware",
    url: "http://127.0.0.1:5393/device-ops/system/firmware",
    imageName: "product-firmware.png"
  }
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

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function relativePath(filePath) {
  return path.relative(websiteDir, filePath).split(path.sep).join("/");
}

function timestampId(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

async function saveManifest(filePath, manifest) {
  await writeFile(filePath, JSON.stringify(manifest, null, 2) + "\n", { encoding: "utf8" });
}

async function main() {
  for (const capture of captures) {
    await assertAbsent(path.join(mediaDir, capture.imageName));
  }

  const startedAt = new Date();
  const evidenceDir = path.join(evidenceRoot, "capture-formal-pages-" + timestampId(startedAt));
  await mkdir(evidenceDir);

  const manifestPath = path.join(evidenceDir, "capture.json");
  const logPath = path.join(evidenceDir, "capture.log");
  const manifest = {
    schemaVersion: "ludi-formal-page-capture/v1",
    captureId: path.basename(evidenceDir),
    status: "in_progress",
    capturedAtStarted: startedAt.toISOString(),
    viewport,
    browser: { channel: "chrome", headless: true, deviceScaleFactor: 1 },
    pages: [],
    evidenceBoundary: "Records page content rendered in this browser session; does not establish new page generation or visual acceptance."
  };
  await writeFile(logPath, "", { encoding: "utf8", flag: "wx" });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", { encoding: "utf8", flag: "wx" });

  async function log(message) {
    const line = new Date().toISOString() + " " + message + "\n";
    await appendFile(logPath, line, { encoding: "utf8" });
    console.log(message);
  }

  let browser;
  let context;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
    context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();

    for (const capture of captures) {
      await log("Opening " + capture.id + " page.");
      await page.goto(capture.url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.locator("body").waitFor({ state: "visible", timeout: 30000 });

      const headingLocator = page.locator("h1").first();
      await headingLocator.waitFor({ state: "visible", timeout: 30000 });
      const visibleHeading = (await headingLocator.innerText()).trim();
      assert(visibleHeading.length > 0, "The " + capture.id + " page has no visible page heading.");

      const semanticMain = page.locator("main, [role='main']").first();
      const hasSemanticMain = (await semanticMain.count()) > 0;
      const contentRegion = hasSemanticMain ? semanticMain : page.locator("body");
      const contentRegionName = hasSemanticMain ? "main" : "body";
      await contentRegion.waitFor({ state: "visible", timeout: 30000 });
      const visibleContent = (await contentRegion.innerText()).trim();
      assert(visibleContent.length >= 40, "The " + capture.id + " page has insufficient visible main content.");
      assert(visibleContent.includes(visibleHeading), "The " + capture.id + " heading is not within its visible content region.");

      const documentTitle = (await page.title()).trim();
      const screenshot = await page.screenshot({ animations: "disabled" });
      const dimensions = pngDimensions(screenshot);
      assert(dimensions.width === viewport.width && dimensions.height === viewport.height,
        "Unexpected screenshot dimensions for " + capture.id + ".");

      const imagePath = path.join(mediaDir, capture.imageName);
      await writeFile(imagePath, screenshot, { encoding: null, flag: "wx" });
      const pageEvidence = {
        id: capture.id,
        capturedAt: new Date().toISOString(),
        title: documentTitle || visibleHeading,
        documentTitle,
        visibleHeading,
        contentRegion: contentRegionName,
        visibleContentCharacters: visibleContent.length,
        visibleContentSha256: sha256(Buffer.from(visibleContent, "utf8")),
        screenshot: {
          path: relativePath(imagePath),
          width: dimensions.width,
          height: dimensions.height,
          sha256: sha256(screenshot)
        }
      };
      manifest.pages.push(pageEvidence);
      await saveManifest(manifestPath, manifest);
      await log("Captured " + capture.id + ": title=" + JSON.stringify(pageEvidence.title)
        + ", heading=" + JSON.stringify(visibleHeading)
        + ", screenshot=" + pageEvidence.screenshot.path
        + ", dimensions=" + dimensions.width + "x" + dimensions.height
        + ", sha256=" + pageEvidence.screenshot.sha256 + ".");
    }

    const headings = new Set(manifest.pages.map((entry) => entry.visibleHeading));
    const textHashes = new Set(manifest.pages.map((entry) => entry.visibleContentSha256));
    const imageHashes = new Set(manifest.pages.map((entry) => entry.screenshot.sha256));
    assert(headings.size === captures.length, "Captured pages do not have distinct visible headings.");
    assert(textHashes.size === captures.length, "Captured pages do not have distinct visible content.");
    assert(imageHashes.size === captures.length, "Captured PNG content is not unique across all pages.");

    manifest.status = "complete";
    manifest.capturedAtCompleted = new Date().toISOString();
    await saveManifest(manifestPath, manifest);
    await log("Capture complete. Evidence: " + relativePath(evidenceDir) + ".");
    console.log(JSON.stringify({
      status: manifest.status,
      evidence: relativePath(evidenceDir),
      pages: manifest.pages.map((entry) => entry.screenshot)
    }, null, 2));
  } catch (error) {
    manifest.status = "failed";
    manifest.failure = error.message;
    manifest.capturedAtFailed = new Date().toISOString();
    await saveManifest(manifestPath, manifest);
    await log("Capture failed: " + error.message);
    throw error;
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error("Capture failed: " + error.message);
  process.exitCode = 1;
});
