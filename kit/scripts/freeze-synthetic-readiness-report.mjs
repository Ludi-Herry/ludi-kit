import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateSyntheticGenerationRoot } from "./validate-synthetic-generation-evidence.mjs";
import { validateSyntheticReadinessRoot } from "./validate-synthetic-readiness.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const kitRoot = resolve(scriptDir, "..");
const defaultRoot = resolve(kitRoot, "quality/blind-harness/readiness");
const defaultOutput = resolve(
  kitRoot,
  "quality/blind-harness/synthetic-readiness-matrix-report.json"
);
const packageReceiptPath = resolve(
  kitRoot,
  "quality/blind-harness/synthetic-consumer-package-receipt.json"
);
const metricNames = [
  "typecheckPass",
  "buildPass",
  "flowSmokePass",
  "previewIdentityPass"
];

export function buildSyntheticReadinessReport(root = defaultRoot, output = defaultOutput) {
  const absoluteRoot = resolve(root);
  const absoluteOutput = resolve(output);
  const reportRoot = dirname(absoluteOutput);
  const generation = validateSyntheticGenerationRoot(absoluteRoot, {
    requireStabilityGate: true
  });
  const readiness = validateSyntheticReadinessRoot(absoluteRoot, {
    requireStabilityGate: true
  });
  const generationByKey = new Map(
    generation.commands.map((command) => [cellKey(command), command])
  );
  const cells = readiness.records
    .map((record) => {
      const { summary, sourceManifest, artifactIdentity } = record;
      const key = cellKey(summary);
      const command = generationByKey.get(key);
      if (!command) throw new Error(`matrix report lacks generation evidence for ${key}`);
      const cycleDirectory = `cycle-${String(summary.cycle).padStart(2, "0")}`;
      const armRoot = resolve(absoluteRoot, summary.profileId, cycleDirectory, summary.arm);
      const commandPath = resolve(armRoot, "generation/command.json");
      const summaryPath = resolve(armRoot, "readiness/readiness-summary.json");
      return {
        profileId: summary.profileId,
        cycle: summary.cycle,
        seed: summary.seed,
        arm: summary.arm,
        runId: summary.runId,
        artifactId: artifactIdentity.artifactId,
        sourceTreeSha256: sourceManifest.treeSha256,
        semanticContractSha256: summary.inputs.semanticContract.sha256,
        generation: {
          status: command.status,
          durationMs: durationMs(command.startedAtUtc, command.stoppedAtUtc),
          evidence: fileReceipt(reportRoot, commandPath)
        },
        readiness: {
          status: summary.status,
          durationMs: durationMs(summary.startedAtUtc, summary.stoppedAtUtc),
          metrics: summary.metrics,
          failureCategory: summary.failure?.category ?? null,
          firstFailureStage: summary.failure?.firstFailureStage ?? null,
          evidence: fileReceipt(reportRoot, summaryPath)
        }
      };
    })
    .sort(compareCells);
  if (cells.length !== generation.commands.length) {
    throw new Error(
      `matrix report generation/readiness count mismatch: ${generation.commands.length}/${cells.length}`
    );
  }

  const packageReceipt = readJson(packageReceiptPath);
  const stoppedAtUtc = [...generation.commands.map((item) => item.stoppedAtUtc), ...readiness.records.map((item) => item.summary.stoppedAtUtc)]
    .sort()
    .at(-1);
  const report = {
    $schema: "synthetic-readiness-matrix-report.v1",
    version: "1.0.0",
    harnessMode: "synthetic-generation-readiness",
    qualifying: false,
    scoring: false,
    frozenAtUtc: stoppedAtUtc,
    sourceRoot: relative(reportRoot, absoluteRoot).replaceAll("\\", "/"),
    conclusionBoundary: {
      purpose: "internal-direction-finding",
      externalEffectClaim: "not-established",
      kitFirstPassAssessment: "indeterminate-current-harness",
      pairedRounds: 9,
      note: "Synthetic split metrics preserve directional evidence; qualifying history remains frozen."
    },
    matrix: {
      profiles: 3,
      cyclesPerProfile: 3,
      arms: 2,
      pairedRounds: 9,
      canonicalCells: cells.length
    },
    generationProfile: uniqueGenerationProfile(generation.commands),
    consumerPackage: {
      receipt: fileReceipt(reportRoot, packageReceiptPath),
      frozenPack: packageReceipt.frozenPack
    },
    aggregates: {
      byArm: {
        consumer: aggregateArm(cells.filter((cell) => cell.arm === "consumer")),
        control: aggregateArm(cells.filter((cell) => cell.arm === "control"))
      },
      pairedMetricComparison: aggregatePairedMetrics(cells),
      pairedGenerationDuration: aggregatePairedDuration(cells)
    },
    cells
  };
  validateReportInvariants(report);
  return report;
}

export function freezeSyntheticReadinessReport({
  root = defaultRoot,
  output = defaultOutput,
  check = false
} = {}) {
  const absoluteOutput = resolve(output);
  const expected = canonicalJsonBytes(buildSyntheticReadinessReport(root, absoluteOutput));
  if (check) {
    if (!existsSync(absoluteOutput)) throw new Error(`matrix report does not exist: ${absoluteOutput}`);
    const observed = readFileSync(absoluteOutput);
    if (!observed.equals(expected)) throw new Error("synthetic readiness matrix report drifted");
    return { reportPath: absoluteOutput, checked: true };
  }
  writeFileSync(absoluteOutput, expected, { flag: "wx" });
  return { reportPath: absoluteOutput, checked: false };
}

export function aggregateArm(cells) {
  if (cells.length !== 9) throw new Error(`arm aggregate requires 9 cells, received ${cells.length}`);
  const metricPassCounts = {};
  for (const metric of metricNames) {
    metricPassCounts[metric] = cells.filter((cell) => cell.readiness.metrics[metric]).length;
  }
  return {
    cells: cells.length,
    allFourPassCount: cells.filter((cell) => metricNames.every((metric) => cell.readiness.metrics[metric])).length,
    metricPassCounts,
    generationDurationMs: durationStats(cells.map((cell) => cell.generation.durationMs)),
    readinessDurationMs: durationStats(cells.map((cell) => cell.readiness.durationMs))
  };
}

export function aggregatePairedMetrics(cells) {
  const pairs = pairCells(cells);
  const result = {};
  for (const metric of metricNames) {
    const counts = { consumerWins: 0, controlWins: 0, bothPass: 0, bothFail: 0 };
    for (const { consumer, control } of pairs) {
      const left = consumer.readiness.metrics[metric];
      const right = control.readiness.metrics[metric];
      if (left && !right) counts.consumerWins += 1;
      else if (!left && right) counts.controlWins += 1;
      else if (left) counts.bothPass += 1;
      else counts.bothFail += 1;
    }
    result[metric] = counts;
  }
  return result;
}

export function aggregatePairedDuration(cells) {
  const deltas = pairCells(cells).map(
    ({ consumer, control }) => consumer.generation.durationMs - control.generation.durationMs
  );
  return {
    consumerFaster: deltas.filter((value) => value < 0).length,
    controlFaster: deltas.filter((value) => value > 0).length,
    equal: deltas.filter((value) => value === 0).length,
    consumerMinusControlMs: durationStats(deltas)
  };
}

function pairCells(cells) {
  const pairs = new Map();
  for (const cell of cells) {
    const key = `${cell.profileId}|${cell.cycle}`;
    const pair = pairs.get(key) ?? {};
    pair[cell.arm] = cell;
    pairs.set(key, pair);
  }
  if (pairs.size !== 9) throw new Error(`matrix report requires 9 pairs, received ${pairs.size}`);
  return [...pairs.entries()].map(([key, pair]) => {
    if (!pair.consumer || !pair.control) throw new Error(`matrix report pair is incomplete: ${key}`);
    if (pair.consumer.seed !== pair.control.seed) throw new Error(`matrix report pair seed drifted: ${key}`);
    return pair;
  });
}

export function durationStats(values) {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value))) {
    throw new Error("duration stats require finite values");
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? sorted[middle]
      : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
  return {
    min: sorted[0],
    max: sorted.at(-1),
    mean: Math.round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
    median
  };
}

function uniqueGenerationProfile(commands) {
  const profiles = new Set(
    commands.map(
      (command) => `${command.provider ?? "legacy-codex"}|${command.model}|${command.reasoningEffort}`
    )
  );
  if (profiles.size !== 1) throw new Error("matrix report requires one generation profile");
  const [provider, model, reasoningEffort] = [...profiles][0].split("|");
  return { provider, model, reasoningEffort };
}

function validateReportInvariants(report) {
  if (report.qualifying !== false || report.scoring !== false) {
    throw new Error("matrix report escaped the non-scoring boundary");
  }
  if (report.matrix.canonicalCells !== 18 || report.cells.length !== 18) {
    throw new Error("matrix report must contain exactly 18 canonical cells");
  }
  if (new Set(report.cells.map((cell) => cell.artifactId)).size !== 18) {
    throw new Error("matrix report reuses an artifactId");
  }
}

function compareCells(left, right) {
  return (
    left.profileId.localeCompare(right.profileId) ||
    left.cycle - right.cycle ||
    left.arm.localeCompare(right.arm)
  );
}

function cellKey(item) {
  return `${item.profileId}|${item.cycle}|${item.arm}`;
}

function durationMs(start, stop) {
  const value = Date.parse(stop) - Date.parse(start);
  if (!Number.isFinite(value) || value < 0) throw new Error(`invalid duration: ${start} -> ${stop}`);
  return value;
}

function fileReceipt(root, path) {
  const absoluteRoot = resolve(root);
  const absolutePath = resolve(path);
  const portable = relative(absoluteRoot, absolutePath).replaceAll("\\", "/");
  if (!portable || portable === ".." || portable.startsWith("../")) {
    throw new Error(`matrix receipt escaped report root: ${absolutePath}`);
  }
  const bytes = readFileSync(absolutePath);
  return { path: portable, bytes: bytes.length, sha256: sha256(bytes) };
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

function parseArgs(argv) {
  const options = { check: false };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name === "--check") {
      options.check = true;
      continue;
    }
    if (!name.startsWith("--")) throw new Error(`unexpected argument: ${name}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${name}`);
    options[name.slice(2)] = value;
    index += 1;
  }
  return options;
}

function runCli() {
  const options = parseArgs(process.argv.slice(2));
  const result = freezeSyntheticReadinessReport({
    root: options.root ?? defaultRoot,
    output: options.out ?? defaultOutput,
    check: options.check
  });
  console.log(
    `${result.checked ? "validate" : "freeze"}-synthetic-readiness-report passed: ${result.reportPath.replaceAll("\\", "/")}`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    console.error(
      `freeze-synthetic-readiness-report failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  }
}
