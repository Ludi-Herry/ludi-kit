import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import {
  blindHistoricalBaselinePaths,
  validateHistoricalBaseline
} from "./freeze-blind-historical-baseline.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const kitRoot = resolve(scriptDir, "..");
const diagnosticsPath = resolve(kitRoot, "quality/blind-harness/historical-diagnostics.json");
const schemaPath = resolve(kitRoot, "schema/blind-historical-diagnostics.schema.json");

const evidencePaths = {
  run01: "workflows/evidence/blind-prd-vulnerability-platform.json",
  run02: "quality/blind-runs/blind-prd-02/result.json",
  run02r1: "quality/blind-runs/blind-prd-02-replacement-01/result.json",
  run03: "quality/blind-runs/blind-prd-03/result.json",
  run03r1: "quality/blind-runs/blind-prd-03-replacement-01/result.json",
  run04: "quality/blind-runs/blind-prd-04/result.json",
  run04r1: "quality/blind-runs/blind-prd-04-replacement-01/generation-readiness-failure.json",
  run04r2: "quality/blind-runs/blind-prd-04-replacement-02/generation-readiness-failure.json"
};

export function buildHistoricalDiagnostics({ recordedAtUtc = new Date().toISOString() } = {}) {
  validateHistoricalBaseline();
  const baselineReceipt = receipt(blindHistoricalBaselinePaths.baselinePath);
  const runs = [
    qualifyingRun01(),
    allUnknownRun("blind-prd-02", 2, evidencePaths.run02),
    qualifyingFlowFailureRun("blind-prd-02-replacement-01", 2, evidencePaths.run02r1),
    allUnknownRun("blind-prd-03", 3, evidencePaths.run03),
    qualifyingFlowFailureRun("blind-prd-03-replacement-01", 3, evidencePaths.run03r1),
    allUnknownRun("blind-prd-04", 4, evidencePaths.run04),
    invalidatedReadiness01(),
    invalidatedReadiness02()
  ];
  return {
    $schema: "../../schema/blind-historical-diagnostics.schema.json",
    version: "1.0.0",
    assessment: "indeterminate-current-harness",
    recordedAtUtc,
    baselineManifest: baselineReceipt,
    interpretation: {
      conclusion: "kitFirstPass KPI 在当前 harness 下不可判定",
      rawKitFirstPassPreserved: true,
      unknownPolicy: "缺少同阶段命令、entry 或 shutdown 证据时保持 unknown"
    },
    runs
  };
}

export function validateHistoricalDiagnostics(path = diagnosticsPath) {
  const document = readJson(path);
  const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
  const validate = ajv.compile(readJson(schemaPath));
  if (!validate(document)) {
    throw new Error(`historical diagnostics schema failed: ${ajv.errorsText(validate.errors, { separator: "; " })}`);
  }
  validateHistoricalBaseline();
  validateReceipt(document.baselineManifest, "baseline manifest");
  const baseline = readJson(blindHistoricalBaselinePaths.baselinePath);
  const protectedFiles = new Map(baseline.files.map((file) => [file.path, file]));
  for (const run of document.runs) {
    for (const arm of ["consumer", "control"]) {
      for (const metricName of ["typecheckPass", "buildPass", "flowSmokePass", "previewIdentityPass"]) {
        for (const evidence of run.arms[arm][metricName].evidence) {
          validateReceipt(evidence, `${run.runId} ${arm} ${metricName}`);
          const protectedReceipt = protectedFiles.get(evidence.path);
          if (!protectedReceipt) throw new Error(`${run.runId} diagnostic cites unprotected evidence ${evidence.path}`);
          assertEqual(evidence.sha256, protectedReceipt.sha256, `${evidence.path} baseline SHA-256`);
        }
      }
    }
  }
  const expected = buildHistoricalDiagnostics({ recordedAtUtc: document.recordedAtUtc });
  assertDeepEqual(document, expected, "historical diagnostic matrix");
  return { runs: document.runs.length, assessment: document.assessment };
}

function qualifyingRun01() {
  const source = evidencePaths.run01;
  return {
    runId: "blind-prd-01-vulnerability-scanning-platform",
    slot: 1,
    status: "completed",
    qualifying: true,
    analysisClass: "qualifying",
    rawKitFirstPass: "failed",
    arms: {
      consumer: armMetrics({
        typecheck: known(true, "旧证据记录 typecheck 通过。", source),
        build: known(true, "旧证据记录 Vite build 通过。", source),
        flow: known(true, "旧证据记录 consumer Playwright 检查通过。", source),
        preview: unknown("旧合同未保存现行 identity、entry 与 shutdown 三项联合证据。", source)
      }),
      control: armMetrics({
        typecheck: known(true, "旧证据记录 typecheck 通过。", source),
        build: known(true, "旧证据记录 Vite build 通过。", source),
        flow: known(false, "旧证据记录 control 触发 browser review-validation hard gate。", source),
        preview: unknown("旧合同未保存现行 identity、entry 与 shutdown 三项联合证据。", source)
      })
    }
  };
}

function qualifyingFlowFailureRun(runId, slot, source) {
  const arm = armMetrics({
    typecheck: unknown("result 未保存可独立复核的分阶段 typecheck 命令证据。", source),
    build: unknown("result 未保存可独立复核的分阶段 build 命令证据。", source),
    flow: known(false, "result 保存两臂 formal flow failed evidence 的路径与 SHA-256。", source),
    preview: unknown("只观察到部分 runtime identity；entry 与 clean shutdown 证据不完整。", source)
  });
  return {
    runId,
    slot,
    status: "completed",
    qualifying: true,
    analysisClass: "qualifying",
    rawKitFirstPass: "failed",
    arms: { consumer: structuredClone(arm), control: structuredClone(arm) }
  };
}

function allUnknownRun(runId, slot, source) {
  const arm = armMetrics({
    typecheck: unknown("invalidated evidence 不具备现行分阶段 typecheck 命令合同。", source),
    build: unknown("invalidated evidence 不具备现行分阶段 build 命令合同。", source),
    flow: unknown("该 attempt 的失格原因与现行 harness flow 口径不可直接等同。", source),
    preview: unknown("identity、entry 与 clean shutdown 联合证据不完整。", source)
  });
  return {
    runId,
    slot,
    status: "invalidated",
    qualifying: false,
    analysisClass: "invalidated",
    rawKitFirstPass: "failed",
    arms: { consumer: structuredClone(arm), control: structuredClone(arm) }
  };
}

function invalidatedReadiness01() {
  const source = evidencePaths.run04r1;
  return {
    runId: "blind-prd-04-replacement-01",
    slot: 4,
    status: "invalidated",
    qualifying: false,
    analysisClass: "invalidated-generation-readiness",
    rawKitFirstPass: "failed",
    arms: {
      consumer: armMetrics({
        typecheck: known(true, "reportedReadiness 保存 typecheckExitCode=0。", source),
        build: known(true, "reportedReadiness 保存 buildExitCode=0。", source),
        flow: known(true, "reportedReadiness 保存 testFlowExitCode=0。", source),
        preview: known(true, "identity bytes、entry bytes 与 preview stopped 均记录为 true。", source)
      }),
      control: armMetrics({
        typecheck: known(true, "readiness attempts 保存 typecheckExitCode=0。", source),
        build: known(true, "readiness attempts 保存 buildExitCode=0。", source),
        flow: known(false, "三轮 product-owned selector/scope flow smoke 均以 exit 1 结束。", source),
        preview: unknown("control preview 未启动，identity、entry 与 shutdown 均未检查。", source)
      })
    }
  };
}

function invalidatedReadiness02() {
  const source = evidencePaths.run04r2;
  const arm = armMetrics({
    typecheck: known(true, "三轮 readiness attempts 保存 typecheckExitCode=0。", source),
    build: known(true, "三轮 readiness attempts 保存 buildExitCode=0。", source),
    flow: known(false, "三轮 product-owned flow smoke 均以 exit 1 结束。", source),
    preview: unknown("formal preview 未启动，identity、entry 与 shutdown 均未检查。", source)
  });
  return {
    runId: "blind-prd-04-replacement-02",
    slot: 4,
    status: "invalidated",
    qualifying: false,
    analysisClass: "invalidated-generation-readiness",
    rawKitFirstPass: "failed",
    arms: { consumer: structuredClone(arm), control: structuredClone(arm) }
  };
}

function armMetrics({ typecheck, build, flow, preview }) {
  return {
    typecheckPass: typecheck,
    buildPass: build,
    flowSmokePass: flow,
    previewIdentityPass: preview
  };
}

function known(value, reason, path) {
  return { value, reason, evidence: [receipt(resolve(kitRoot, path))] };
}

function unknown(reason, path) {
  return { value: "unknown", reason, evidence: [receipt(resolve(kitRoot, path))] };
}

function receipt(path) {
  const bytes = readFileSync(path);
  return {
    path: relative(kitRoot, path).replaceAll("\\", "/"),
    bytes: bytes.length,
    sha256: sha256(bytes)
  };
}

function validateReceipt(value, label) {
  const path = resolve(kitRoot, value.path);
  const bytes = readFileSync(path);
  assertEqual(bytes.length, value.bytes, `${label} bytes`);
  assertEqual(sha256(bytes), value.sha256, `${label} SHA-256`);
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(sortValue(value), null, 2)}\n`, "utf8");
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortValue(value[key])])
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function assertDeepEqual(actual, expected, label) {
  const left = JSON.stringify(sortValue(actual));
  const right = JSON.stringify(sortValue(expected));
  if (left !== right) throw new Error(`${label} differs from the evidence-derived matrix`);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

function runCli() {
  const write = process.argv.includes("--write");
  if (write) {
    if (existsSync(diagnosticsPath)) throw new Error(`historical diagnostics already exists: ${diagnosticsPath}`);
    writeFileSync(diagnosticsPath, canonicalJsonBytes(buildHistoricalDiagnostics()), { flag: "wx" });
  }
  const result = validateHistoricalDiagnostics();
  console.log(`build-blind-historical-diagnostics passed: runs=${result.runs}; assessment=${result.assessment}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    console.error(`build-blind-historical-diagnostics failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

export const blindHistoricalDiagnosticsPaths = { diagnosticsPath, schemaPath };
