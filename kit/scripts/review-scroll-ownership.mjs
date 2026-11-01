// Report-only Tianshu probe. No validate integration or repository writes.
import { createServer } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const kit = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(kit, "..");
const project = "projects/tianshu-device-ops";
const requirePreview = createRequire(resolve(kit, "preview/package.json"));
const requireKit = createRequire(resolve(kit, "package.json"));
const { build } = requirePreview("esbuild");
const contract = JSON.parse(readFileSync(resolve(kit, project, "pages.json"), "utf8"));
const components = {
  "device-list": "DeviceListPage", "device-detail": "DeviceDetailPage", alerts: "AlertsPage",
  dashboard: "DashboardPage", "passport-list": "PassportListPage", "passport-detail": "PassportDetailPage",
  rma: "RmaPage", firmware: "FirmwarePage", flashing: "FlashingPage", feedback: "FeedbackPage",
  "alert-rules": "AlertRulesPage", binding: "BindingPage"
};
const requested = process.argv.slice(2);
if (requested.length && (requested.length !== 2 || requested[0] !== "--page" || !components[requested[1]])) {
  console.error("Usage: node scripts/review-scroll-ownership.mjs [--page <one-of-12-page-ids>]");
  process.exit(2);
}
const pages = contract.pages.filter(p => components[p.id] && (!requested.length || p.id === requested[1]));
const log = value => console.log(JSON.stringify(value));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const gitArgs = ["diff", "HEAD", "--name-only", "--", `kit/${project}/*.ts`, `kit/${project}/*.tsx`, `kit/${project}/generated/*.tsx`, `kit/${project}/generated/*.css`];
const drift = () => execFileSync("git", gitArgs, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim().split(/\r?\n/).filter(Boolean);
const affects = (files, id) => files.filter(f => !f.endsWith("Page.tsx") || f.endsWith(`/${components[id]}.tsx`));
let server, browser, exitCode = 0;
const deadline = setTimeout(() => {
  log({ type: "error", code: "run-timeout", limitMs: 120000 });
  browser?.close().finally(() => { server?.close(); process.exit(2); });
  if (!browser) { server?.close(); process.exit(2); }
}, 120000);

try {
  const before = drift();
  log({ type: "scope", mode: "report-only", pages: pages.map(p => p.id), viewports: [[1440, 900], [1024, 900]], headDifferences: before });
  const inputHashes = Object.fromEntries([project, `${project}/generated`].flatMap(dir =>
    readdirSync(resolve(kit, dir)).filter(name => /\.(ts|tsx|css)$/.test(name)).map(name => {
      const path = `${dir}/${name}`;
      return [path, hash(readFileSync(resolve(kit, path)))];
    })));
  const output = await build({
    absWorkingDir: kit,
    stdin: { contents: 'import React from "react"; import {createRoot} from "react-dom/client"; import {DeviceOpsApp} from "../projects/tianshu-device-ops/app.tsx"; createRoot(document.getElementById("root")).render(<DeviceOpsApp />);', loader: "tsx", resolveDir: resolve(kit, "preview"), sourcefile: "review-bootstrap.tsx" },
    bundle: true, write: false, metafile: true, platform: "browser", format: "iife", jsx: "automatic",
    outfile: resolve(kit, "review-memory/app.js"), minify: true, logLevel: "silent",
    define: { "process.env.NODE_ENV": '"development"' },
    alias: { react: dirname(requireKit.resolve("react/package.json")), "react-dom": dirname(requireKit.resolve("react-dom/package.json")) }
  });
  const sourceHashes = Object.fromEntries(Object.keys(output.metafile.inputs)
    .filter(p => p.replaceAll("\\", "/").startsWith(project + "/"))
    .map(p => [p.replaceAll("\\", "/"), inputHashes[p.replaceAll("\\", "/")]]));
  const unstableFiles = () => Object.entries(sourceHashes).filter(([p, h]) => hash(readFileSync(resolve(kit, p))) !== h).map(([p]) => `kit/${p}`);
  const assets = new Map(output.outputFiles.map(f => [`/${f.path.endsWith(".css") ? "app.css" : "app.js"}`, f.contents]));
  const html = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tianshu review</title><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script></html>';
  server = createServer((req, res) => {
    const asset = assets.get(req.url);
    if (asset) { res.setHeader("Content-Type", req.url.endsWith(".css") ? "text/css" : "text/javascript"); res.end(asset); }
    else if (req.url?.startsWith("/device-ops/")) { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(html); }
    else { res.writeHead(404); res.end(); }
  });
  await new Promise((ok, fail) => { server.once("error", fail); server.listen(5440, "127.0.0.1", ok); });
  log({ type: "server", url: "http://127.0.0.1:5440/device-ops/devices", build: "esbuild-memory-write-false", sourceHashes });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const p of pages) {
    const differences = affects([...new Set([...before, ...drift(), ...unstableFiles()])], p.id);
    if (differences.length) { log({ type: "page", pageId: p.id, status: "deferred-source-drift", files: differences }); exitCode = 2; continue; }
    for (const width of [1440, 1024]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      try {
        await context.route("**/*", route => new URL(route.request().url()).origin === "http://127.0.0.1:5440" ? route.continue() : route.abort());
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", () => errors.push("pageerror")); // No page data or exception payloads in report.
        const route = p.route.replace(":sn", "TS24070101"); // First existing synthetic seed; not a new requirement.
        await page.goto(`http://127.0.0.1:5440/device-ops${route}`, { waitUntil: "networkidle", timeout: 20000 });
        await page.locator(".device-ops-shell__content").waitFor({ timeout: 10000 });
        const metrics = await page.evaluate(() => {
          const content = document.querySelector(".device-ops-shell__content");
          const root = document.scrollingElement;
          const visible = el => el.getClientRects().length && el.clientHeight > 0 && getComputedStyle(el).visibility !== "hidden";
          const selector = el => {
            const classes = [...el.classList].filter(c => !c.startsWith("css-")).slice(0, 3);
            return el === root ? "document.scrollingElement" : el.tagName.toLowerCase() + classes.map(c => `.${c}`).join("");
          };
          const measure = el => ({ selector: selector(el), clientHeight: el.clientHeight, scrollHeight: el.scrollHeight, maxScrollY: el.scrollHeight - el.clientHeight });
          const owners = [...document.querySelectorAll("body *")].filter(el => el !== root && visible(el) && /^(auto|scroll)$/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1);
          if (root.scrollHeight > root.clientHeight + 1 && !/^(hidden|clip)$/.test(getComputedStyle(root).overflowY) && !/^(hidden|clip)$/.test(getComputedStyle(document.body).overflowY)) owners.push(root);
          const pairs = [];
          for (const child of owners) {
            if (!content.contains(child)) continue;
            const parent = owners.find(el => el !== child && el.contains(child));
            if (parent) pairs.push({ child: measure(child), parent: measure(parent) });
          }
          return { rendered: content.children.length > 0, verticalOwners: owners.map(measure), nestedPairs: pairs,
            horizontalOverflowPx: Math.max(0, root.scrollWidth - root.clientWidth),
            localHorizontalOwners: [...content.querySelectorAll("*")].filter(el => visible(el) && /^(auto|scroll)$/.test(getComputedStyle(el).overflowX) && el.scrollWidth > el.clientWidth + 1).map(el => ({ selector: selector(el), clientWidth: el.clientWidth, scrollWidth: el.scrollWidth })) };
        });
        const changed = affects([...drift(), ...unstableFiles()], p.id);
        const status = changed.length ? "invalidated-source-drift" : errors.length || !metrics.rendered ? "runtime-error" : metrics.nestedPairs.length ? "candidate" : "no-candidate";
        if (changed.length || errors.length || !metrics.rendered) exitCode = 2;
        else if (metrics.nestedPairs.length && exitCode === 0) exitCode = 1;
        log({ type: "page", pageId: p.id, route: p.route, viewport: [width, 900], status, errors, ...(changed.length ? { files: changed } : {}), ...metrics });
      } finally { await context.close(); }
    }
  }
} catch (error) {
  exitCode = 2;
  log({ type: "error", code: error.code ?? error.name, message: error.message });
} finally {
  clearTimeout(deadline);
  if (browser) await browser.close();
  if (server?.listening) await new Promise(ok => server.close(ok));
  log({ type: "closeout", browserClosed: !browser || !browser.isConnected(), serverClosed: !server?.listening, exitCode });
  process.exitCode = exitCode;
}
