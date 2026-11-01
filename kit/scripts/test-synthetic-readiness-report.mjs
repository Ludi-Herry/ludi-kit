import {
  aggregateArm,
  aggregatePairedDuration,
  aggregatePairedMetrics,
  durationStats
} from "./freeze-synthetic-readiness-report.mjs";

let negativeCount = 0;

try {
  const cells = fixtureCells();
  const consumer = aggregateArm(cells.filter((cell) => cell.arm === "consumer"));
  const control = aggregateArm(cells.filter((cell) => cell.arm === "control"));
  assertEqual(consumer.cells, 9, "consumer cell count");
  assertEqual(consumer.allFourPassCount, 9, "consumer all-four pass count");
  assertEqual(consumer.metricPassCounts.flowSmokePass, 9, "consumer flow pass count");
  assertEqual(control.allFourPassCount, 6, "control all-four pass count");
  assertEqual(control.metricPassCounts.flowSmokePass, 6, "control flow pass count");
  assertEqual(consumer.generationDurationMs.mean, 200, "consumer generation mean");
  assertEqual(control.generationDurationMs.mean, 100, "control generation mean");

  const pairedMetrics = aggregatePairedMetrics(cells);
  assertDeepEqual(
    pairedMetrics.flowSmokePass,
    { consumerWins: 3, controlWins: 0, bothPass: 6, bothFail: 0 },
    "paired flow comparison"
  );
  assertDeepEqual(
    pairedMetrics.buildPass,
    { consumerWins: 0, controlWins: 0, bothPass: 9, bothFail: 0 },
    "paired build comparison"
  );

  const pairedDuration = aggregatePairedDuration(cells);
  assertDeepEqual(
    pairedDuration,
    {
      consumerFaster: 0,
      controlFaster: 9,
      equal: 0,
      consumerMinusControlMs: { min: 100, max: 100, mean: 100, median: 100 }
    },
    "paired generation duration"
  );
  assertDeepEqual(
    durationStats([1, 2, 9, 10]),
    { min: 1, max: 10, mean: 6, median: 6 },
    "even duration stats"
  );

  expectFailure("incomplete arm", "requires 9 cells", () => aggregateArm(cells.slice(0, 8)));
  negativeCount += 1;
  expectFailure("incomplete pair", "pair is incomplete", () =>
    aggregatePairedMetrics(cells.filter((cell) => !(cell.profileId === "profile-03" && cell.cycle === 3 && cell.arm === "control")))
  );
  negativeCount += 1;
  expectFailure("empty durations", "finite values", () => durationStats([]));
  negativeCount += 1;

  console.log(
    `test-synthetic-readiness-report passed: 9 paired rounds aggregated; ${negativeCount} negative cases rejected`
  );
} catch (error) {
  console.error(
    `test-synthetic-readiness-report failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
}

function fixtureCells() {
  const cells = [];
  for (let profile = 1; profile <= 3; profile += 1) {
    for (let cycle = 1; cycle <= 3; cycle += 1) {
      for (const arm of ["consumer", "control"]) {
        const flowSmokePass = arm === "consumer" || cycle !== 1;
        cells.push({
          profileId: `profile-${String(profile).padStart(2, "0")}`,
          cycle,
          seed: `${profile}${cycle}`,
          arm,
          generation: { durationMs: arm === "consumer" ? 200 : 100 },
          readiness: {
            durationMs: 10,
            metrics: {
              typecheckPass: true,
              buildPass: true,
              flowSmokePass,
              previewIdentityPass: true
            }
          }
        });
      }
    }
  }
  return cells;
}

function expectFailure(label, expected, action) {
  try {
    action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(expected)) return;
    throw new Error(`${label} failed with an unexpected error: ${message}`);
  }
  throw new Error(`${label} did not fail closed`);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

function assertDeepEqual(actual, expected, label) {
  const left = JSON.stringify(sortValue(actual));
  const right = JSON.stringify(sortValue(expected));
  if (left !== right) throw new Error(`${label}: expected ${right}, received ${left}`);
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
