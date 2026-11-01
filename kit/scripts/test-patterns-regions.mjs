import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const validator = resolve(kitRoot, "scripts/validate-kit.mjs");
const tempFile = resolve(kitRoot, `generator/.tmp-patterns-regions-${process.pid}.json`);
const committed = JSON.parse(readFileSync(resolve(kitRoot, "patterns.manifest.json"), "utf8"));

const runWith = (candidate) => {
  writeFileSync(tempFile, JSON.stringify(candidate));
  const result = spawnSync(process.execPath, [validator, "--patterns-manifest", tempFile], { cwd: kitRoot, encoding: "utf8" });
  return result;
};

const negatives = [
  { id: "owner-outside-enum", mutate: (regions) => { regions[0].owner = "project"; } },
  { id: "locked-not-boolean", mutate: (regions) => { regions[0].locked = "true"; } },
  { id: "duplicate-region-id", mutate: (regions) => { regions.push({ ...regions[0] }); } },
  { id: "locked-but-page-owned", mutate: (regions) => { regions[0].owner = "page"; regions[0].locked = true; } },
  { id: "unknown-field-rejected", mutate: (regions) => { regions[0].unknownField = "x"; } },
  { id: "name-not-string", mutate: (regions) => { regions[0].name = 5; } },
  { id: "purpose-empty-string", mutate: (regions) => { regions[0].purpose = ""; } },
  { id: "successCriteria-not-string-list", mutate: (regions) => { regions[0].successCriteria = ["ok", 1]; } },
  { id: "doNotOnDelete-not-list", mutate: (regions) => { regions[0].doNotOnDelete = "表格页没有筛选区"; } },
  { id: "requiredComponent-outside-requiredComponents", mutate: (regions) => { regions[1].requiredComponent = "NotAComponent"; } },
  { id: "extended-positive-still-accepted", mutate: (regions) => { regions[2].name = "数据区"; regions[2].successCriteria = ["示例规则"]; regions[2].doNotOnDelete = []; regions[2].source = "test"; }, expectPass: true }
];

let failed = false;
try {
  for (const negative of negatives) {
    const candidate = structuredClone(committed);
    negative.mutate(candidate.patterns["list-page"].regions);
    const result = runWith(candidate);
    if (negative.expectPass) {
      if (result.status !== 0) {
        console.error(`test-patterns-regions failed: ${negative.id} unexpectedly rejected: ${result.stderr || result.stdout}`);
        failed = true;
      }
    } else if (result.status === 0) {
      console.error(`test-patterns-regions failed: ${negative.id} unexpectedly passed`);
      failed = true;
    }
  }

  const positive = runWith(committed);
  if (positive.status !== 0) {
    console.error(`test-patterns-regions failed: committed patterns.manifest.json rejected: ${positive.stderr || positive.stdout}`);
    failed = true;
  }
} finally {
  rmSync(tempFile, { force: true });
}

if (failed) process.exit(1);
console.log(`test-patterns-regions passed: ${negatives.length} negatives fail closed; committed manifest accepted`);
