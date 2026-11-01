import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import {
  sha256File,
  stableDocumentBytes,
  validateConsumerPackageReceipt
} from "./blind-protocol-v1.2-lib.mjs";
import { kitRoot, packLocal, runNpm } from "./pack-local.mjs";

const values = process.argv.slice(2);

try {
  const runId = readArg("--run-id");
  const outArg = readArg("--out");
  if (!runId || !outArg) throw new Error("--run-id and --out are required");
  if (!/^blind-prd-(0[1-5])(?:-[a-z0-9][a-z0-9-]*)?$/.test(runId)) {
    throw new Error("--run-id is not canonical");
  }
  const outputPath = resolve(process.cwd(), outArg);
  if (existsSync(outputPath)) throw new Error(`package receipt already exists: ${outputPath}`);
  assertCleanTrackedWorktree();
  const sourceCommit = git(["rev-parse", "HEAD"]).trim();

  runNpm(["run", "check:package"]);
  const first = packLocal();
  const firstSha256 = sha256File(first.tarballPath);
  const second = packLocal();
  const secondSha256 = sha256File(second.tarballPath);
  if (firstSha256 !== secondSha256) {
    throw new Error(
      `repeat package hash mismatch: first=${firstSha256}, second=${secondSha256}`
    );
  }
  if (first.shasum !== second.shasum || first.files.length !== second.files.length) {
    throw new Error("npm pack metadata changed between repeated packages");
  }

  const manifest = JSON.parse(readFileSync(resolve(kitRoot, "manifest.json"), "utf8"));
  const receipt = {
    version: "1.0.0",
    runId,
    createdAt: new Date().toISOString(),
    sourceCommit,
    package: {
      path: `.local-pack/${second.installFilename}`,
      sha256: secondSha256,
      npmShasum: second.shasum,
      bytes: statSync(second.tarballPath).size,
      files: second.files.length,
      manifestPaths: collectManifestPaths(manifest).length
    },
    repeatPack: {
      firstSha256,
      secondSha256,
      identical: true
    },
    checks: {
      checkPackage: "passed",
      isolatedInstall: "passed",
      crossCwdRunner: "passed",
      crossCwdGenerator: "passed",
      fullValidate: "passed"
    }
  };
  validateConsumerPackageReceipt(receipt);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, stableDocumentBytes(receipt), {
    encoding: "utf8",
    flag: "wx"
  });
  console.log(
    `freeze-consumer-package-receipt passed: ${runId}; sha256=${secondSha256}; files=${second.files.length}; bytes=${receipt.package.bytes}; receipt=${relative(kitRoot, outputPath).replaceAll("\\", "/")}`
  );
} catch (error) {
  console.error(
    `freeze-consumer-package-receipt failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
}

function collectManifestPaths(manifest) {
  return [
    ...Object.values(manifest.docs),
    ...Object.values(manifest.entry),
    ...Object.values(manifest.rules),
    ...Object.values(manifest.recipes),
    ...Object.values(manifest.schema),
    manifest.harness.defaultScenario,
    manifest.harness.runner,
    manifest.harness.reports,
    manifest.preview.app,
    ...Object.values(manifest.figma),
    ...Object.values(manifest.feedback),
    ...Object.values(manifest.projects),
    ...Object.values(manifest.quality),
    ...Object.values(manifest.workflows)
  ];
}

function assertCleanTrackedWorktree() {
  const status = git(["status", "--porcelain", "--untracked-files=normal"]);
  if (status.trim()) {
    throw new Error("tracked worktree must be clean before freezing a consumer package receipt");
  }
}

function git(args) {
  const result = spawnSync("git", args, {
    cwd: resolve(kitRoot, ".."),
    encoding: "utf8",
    shell: false,
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  }
  return result.stdout;
}

function readArg(name) {
  const index = values.indexOf(name);
  if (index === -1) return null;
  const value = values[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}
