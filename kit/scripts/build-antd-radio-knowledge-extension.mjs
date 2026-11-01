import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const knowledgeRoot = resolve(kitRoot, "foundations/knowledge/antd-6.5.0");
const baseManifestFile = resolve(knowledgeRoot, "manifest.json");
const extensionManifestFile = resolve(knowledgeRoot, "manifest.radio-coverage.json");
const referenceFile = resolve(knowledgeRoot, "component-reference/Radio.json");
const cliEntry = resolve(kitRoot, "node_modules/@ant-design/cli/dist/index.js");
const checkOnly = process.argv.includes("--check");
const component = "Radio";
const antdVersion = "6.5.0";
const cliVersion = "6.5.1";
const reviewedAt = "2026-08-11";

if (!checkOnly) buildExtension();
validateExtension();

function buildExtension() {
  const queries = {
    info: runQuery("info", [component], { lang: true, required: true }),
    doc: runQuery("doc", [component], { lang: true, required: true }),
    demo: runQuery("demo", [component], { lang: true, required: false }),
    token: runQuery("token", [component], { lang: false, required: false }),
    semantic: runQuery("semantic", [component], { lang: false, required: false })
  };
  const reference = {
    version: "1.0.0",
    component,
    queryComponent: component,
    antdVersion,
    cliVersion,
    reviewedAt,
    queries: Object.fromEntries(
      Object.entries(queries).map(([name, result]) => [name, result.ok ? { status: "ok", data: result.data } : { status: "unsupported", error: result.error }])
    )
  };
  writeText(referenceFile, JSON.stringify(reference, null, 2));

  const baseManifest = readJson(baseManifestFile);
  const baseReceipt = fileReceipt(baseManifestFile, "manifest.json");
  const radioAsset = {
    kind: "component-reference",
    id: component,
    path: "component-reference/Radio.json",
    sha256: sha256(referenceFile)
  };
  const assets = [...baseManifest.assets.filter((asset) => asset.path !== radioAsset.path), radioAsset]
    .sort((left, right) => left.path.localeCompare(right.path));
  const extensionManifest = {
    ...baseManifest,
    reviewedAt,
    extension: {
      kind: "additive-component-reference",
      purpose: "Independent non-Holdout fixture coverage for generated AntD Radio fields.",
      baseManifest: baseReceipt,
      addedComponents: [component],
      mutatesBaseManifest: false,
      addsDecisionCard: false,
      decisionCardReason: "Radio is exercised as a bounded form control and does not change page-level archetype judgment."
    },
    counts: {
      ...baseManifest.counts,
      componentReferences: baseManifest.counts.componentReferences + 1,
      assets: assets.length
    },
    assets
  };
  writeText(extensionManifestFile, JSON.stringify(extensionManifest, null, 2));
}

function validateExtension() {
  if (!existsSync(referenceFile) || !existsSync(extensionManifestFile)) {
    throw new Error("Radio knowledge extension is missing; run without --check to build it");
  }
  const reference = readJson(referenceFile);
  if (reference.component !== component || reference.queryComponent !== component || reference.antdVersion !== antdVersion || reference.cliVersion !== cliVersion) {
    throw new Error("Radio component reference metadata is invalid");
  }
  for (const query of ["info", "doc", "demo", "semantic", "token"]) {
    if (reference.queries?.[query]?.status !== "ok") throw new Error(`Radio ${query} query is not frozen successfully`);
  }

  const baseManifest = readJson(baseManifestFile);
  const extensionManifest = readJson(extensionManifestFile);
  const recordedBase = extensionManifest.extension?.baseManifest;
  const actualBase = fileReceipt(baseManifestFile, "manifest.json");
  if (JSON.stringify(recordedBase) !== JSON.stringify(actualBase)) throw new Error("Radio extension base manifest receipt drifted");
  if (extensionManifest.id !== baseManifest.id || extensionManifest.foundation?.id !== "antd" || extensionManifest.foundation?.version !== antdVersion) {
    throw new Error("Radio extension manifest foundation identity is invalid");
  }
  if (extensionManifest.extension?.mutatesBaseManifest !== false || extensionManifest.extension?.addedComponents?.length !== 1 || extensionManifest.extension.addedComponents[0] !== component) {
    throw new Error("Radio extension boundary is invalid");
  }
  if (extensionManifest.counts?.componentReferences !== baseManifest.counts.componentReferences + 1) {
    throw new Error("Radio extension component-reference count is invalid");
  }
  if (extensionManifest.counts?.assets !== baseManifest.counts.assets + 1 || extensionManifest.assets?.length !== extensionManifest.counts.assets) {
    throw new Error("Radio extension asset count is invalid");
  }
  for (const baseAsset of baseManifest.assets) {
    const extensionAsset = extensionManifest.assets.find((asset) => asset.path === baseAsset.path);
    if (JSON.stringify(extensionAsset) !== JSON.stringify(baseAsset)) throw new Error(`Radio extension changed base asset ${baseAsset.path}`);
  }
  const radioAssets = extensionManifest.assets.filter((asset) => asset.kind === "component-reference" && asset.id === component);
  if (radioAssets.length !== 1 || radioAssets[0].path !== "component-reference/Radio.json" || radioAssets[0].sha256 !== sha256(referenceFile)) {
    throw new Error("Radio extension component reference receipt is invalid");
  }
  console.log(
    `validated AntD Radio knowledge extension: base=${actualBase.sha256}; radio=${sha256(referenceFile)}; manifest=${relative(kitRoot, extensionManifestFile)}`
  );
}

function runQuery(command, args, options) {
  const commandArgs = [cliEntry, command, ...args, "--version", antdVersion, "--format", "json"];
  if (options.lang) commandArgs.push("--lang", "zh");
  const result = spawnSync(process.execPath, commandArgs, { cwd: kitRoot, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (result.status !== 0) {
    const error = (stderr || stdout || `exit ${result.status}`).trim();
    if (options.required) throw new Error(`${command} ${args.join(" ")} failed: ${error}`);
    return { ok: false, error };
  }
  const start = stdout.indexOf("{");
  if (start < 0) {
    if (options.required) throw new Error(`${command} ${args.join(" ")} returned no JSON`);
    return { ok: false, error: "CLI returned no JSON" };
  }
  try {
    return { ok: true, data: JSON.parse(stdout.slice(start)) };
  } catch (error) {
    if (options.required) throw new Error(`${command} ${args.join(" ")} returned invalid JSON: ${error.message}`);
    return { ok: false, error: error.message };
  }
}

function fileReceipt(file, path) {
  const value = readFileSync(file);
  return { path, bytes: value.length, sha256: createHash("sha256").update(value).digest("hex") };
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeText(file, value) {
  writeFileSync(file, `${value}\n`, "utf8");
}
