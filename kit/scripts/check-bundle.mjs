import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const javascriptExtensions = new Set([".js", ".mjs", ".cjs"]);

export function collectJavaScriptFiles(directory, { readDirectory = readdirSync, inspectPath = lstatSync } = {}) {
  if (inspectPath(directory).isSymbolicLink()) {
    throw new Error(`symbolic links are forbidden in bundle output: ${directory}`);
  }
  const files = [];
  for (const entry of readDirectory(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`symbolic links are forbidden in bundle output: ${path}`);
    } else if (entry.isDirectory()) {
      files.push(...collectJavaScriptFiles(path, { readDirectory, inspectPath }));
    } else if (entry.isFile() && javascriptExtensions.has(extname(entry.name).toLowerCase())) {
      files.push(path);
    }
  }
  return files.sort();
}

export function measureBundleTarget(root, target) {
  if (!target || typeof target.dist !== "string" || target.dist.trim() === "" || isAbsolute(target.dist)) {
    throw new Error("bundle target dist must be a non-empty relative path");
  }
  if (!Number.isFinite(target.maxGzipKb) || target.maxGzipKb <= 0) {
    throw new Error("bundle target maxGzipKb must be a finite positive number");
  }
  const distDir = resolve(root, target.dist);
  if (!existsSync(distDir)) throw new Error(`dist not found at ${target.dist} — run the build first`);
  const rootReal = realpathSync(root);
  const distReal = realpathSync(distDir);
  const relation = relative(rootReal, distReal);
  if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    throw new Error(`bundle target dist resolves outside root: ${target.dist}`);
  }
  const files = collectJavaScriptFiles(distDir);
  if (files.length === 0) throw new Error(`no JavaScript assets found at ${target.dist}`);

  let rawBytes = 0;
  let gzipBytes = 0;
  for (const file of files) {
    const content = readFileSync(file);
    rawBytes += content.length;
    gzipBytes += gzipSync(content, { level: 9 }).length;
  }

  return {
    files,
    rawKb: rawBytes / 1024,
    gzipKb: gzipBytes / 1024,
    maxGzipKb: target.maxGzipKb
  };
}

export function runBundleCheck({ root, budget, names, log = console.log, error = console.error }) {
  let failed = false;
  for (const name of names) {
    const target = budget.targets[name];
    if (!target) {
      error(`check-bundle: unknown target "${name}" (expected one of: ${Object.keys(budget.targets).join(", ")})`);
      failed = true;
      continue;
    }

    let measurement;
    try {
      measurement = measureBundleTarget(root, target);
    } catch (caught) {
      error(`check-bundle: ${name}: ${caught instanceof Error ? caught.message : String(caught)}`);
      failed = true;
      continue;
    }

    const overBudget = measurement.gzipKb > measurement.maxGzipKb;
    const status = overBudget ? "FAIL" : "OK";
    log(
      `check-bundle ${status} ${name}: ${measurement.files.length} js file(s), ${measurement.rawKb.toFixed(2)} kB raw, ` +
        `${measurement.gzipKb.toFixed(2)} kB gzip (budget ${measurement.maxGzipKb} kB)`
    );

    if (overBudget) {
      error(
        `check-bundle: ${name} exceeds its gzip budget by ${(measurement.gzipKb - measurement.maxGzipKb).toFixed(2)} kB. ` +
          `Shrink the bundle, or raise the budget explicitly in harness/checks/bundle-budget.json and record the decision in docs/PROJECT-STATUS.md.`
      );
      failed = true;
    }
  }
  return failed ? 1 : 0;
}

function main() {
  const root = process.cwd();
  const budget = JSON.parse(readFileSync(resolve(root, "harness/checks/bundle-budget.json"), "utf8"));
  const requested = process.argv[2];
  const names = requested ? [requested] : Object.keys(budget.targets);
  process.exitCode = runBundleCheck({ root, budget, names });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
