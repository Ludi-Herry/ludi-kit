import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";

const values = process.argv.slice(2);

if (values.includes("--pre-reveal-contract")) {
  try {
    const v121 = await import("./freeze-artifact-v1.2.1.mjs");
    let result;
    if (values.includes("--seal-finalize")) {
      v121.assertFrozenV12CoreBinding();
      result = (await import("./freeze-artifact-v1.2.mjs")).freezeArtifactV12(values);
    } else {
      result = await v121.freezeArtifactV121(values);
    }
    console.log(
      `freeze-artifact-under-test passed: ${result.receipt.projectId}; receipt=evidence/artifact-under-test.json; seal=${result.sealPath.replaceAll("\\", "/")}`
    );
    process.exit(0);
  } catch (error) {
    console.error(`freeze-artifact-under-test failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

const {
  CONTRACT_PATH_DEFAULTS,
  SOURCE_EXCLUSIONS,
  assertExactIdentity,
  identityFromReceipt,
  readJson,
  resolveProjectPath,
  sha256File,
  sha256Tree,
  validateFlowDocument,
  validateReceiptDocument
} = await import("./same-artifact-lib.mjs");

try {
  const projectRootArg = readArg("--project-root");
  if (!projectRootArg) throw new Error("--project-root is required");
  const projectRoot = resolve(process.cwd(), projectRootArg);
  const acceptancePath = resolveProjectPath(projectRoot, "flow-acceptance.json", {
    label: "flow acceptance",
    type: "file"
  });
  const acceptance = readJson(acceptancePath);
  validateFlowDocument(acceptance);
  if (acceptance.version !== "1.1.0") {
    throw new Error(`freeze requires flow-acceptance 1.1.0; received ${acceptance.version}`);
  }

  const receiptPath = resolveProjectPath(projectRoot, acceptance.artifactUnderTest.receiptPath, {
    label: "artifact receipt",
    mustExist: false
  });
  if (existsSync(receiptPath)) {
    throw new Error("artifact receipt already exists; frozen artifacts cannot be rebuilt in place");
  }

  const markerPath = resolveProjectPath(projectRoot, "public/artifact-meta.json", {
    label: "source artifact marker",
    type: "file"
  });
  const marker = readJson(markerPath);
  const identity = {
    runId: marker.runId,
    arm: marker.arm,
    projectId: marker.projectId,
    artifactId: marker.artifactId
  };
  assertExactIdentity(marker, identity, "source artifact marker");
  if (acceptance.projectId !== identity.projectId) {
    throw new Error("source artifact marker projectId must match flow acceptance");
  }
  if (acceptance.artifactUnderTest.artifactId !== identity.artifactId) {
    throw new Error("source artifact marker artifactId must match flow acceptance");
  }

  const contractPaths = Object.fromEntries(
    Object.entries(CONTRACT_PATH_DEFAULTS).map(([name, fallback]) => {
      const path = readArg(`--${toKebabCase(name)}`) ?? fallback;
      const absolutePath = resolveProjectPath(projectRoot, path, {
        label: `${name} contract`,
        type: "file"
      });
      return [name, { path: path.replaceAll("\\", "/"), absolutePath }];
    })
  );
  if (contractPaths.flowAcceptance.absolutePath !== acceptancePath) {
    throw new Error("--flow-acceptance must resolve to the active flow-acceptance.json");
  }
  const entryRoute = readArg("--entry-route") ?? "/";
  if (!/^\/(?!\/)\S*$/.test(entryRoute)) {
    throw new Error("--entry-route must be a same-origin path beginning with one slash");
  }

  const build = runNpm(["run", "build"], projectRoot);
  writeResult(build);
  if (build.status !== 0) {
    throw new Error(`build failed with exit code ${build.status ?? 1}; receipt was not written`);
  }
  if (existsSync(receiptPath)) {
    throw new Error("build wrote the reserved artifact receipt path; receipt was not accepted");
  }

  const builtAcceptance = readJson(acceptancePath);
  validateFlowDocument(builtAcceptance);
  if (
    builtAcceptance.projectId !== identity.projectId ||
    builtAcceptance.artifactUnderTest?.artifactId !== identity.artifactId
  ) {
    throw new Error("build changed the flow acceptance identity; receipt was not written");
  }
  assertExactIdentity(readJson(markerPath), identity, "source artifact marker after build");

  const distRoot = resolveProjectPath(projectRoot, "dist", {
    label: "build output",
    type: "directory"
  });
  resolveProjectPath(projectRoot, "dist/index.html", {
    label: "built entry",
    type: "file"
  });
  const distMarkerPath = resolveProjectPath(projectRoot, "dist/artifact-meta.json", {
    label: "built artifact marker",
    type: "file"
  });
  assertExactIdentity(readJson(distMarkerPath), identity, "built artifact marker");

  const receipt = {
    version: "1.0.0",
    artifactKind: "generated-product",
    ...identity,
    contracts: Object.fromEntries(
      Object.entries(contractPaths).map(([name, record]) => [
        name,
        {
          path: record.path,
          sha256: sha256File(record.absolutePath)
        }
      ])
    ),
    source: {
      root: ".",
      entry: "index.html",
      algorithm: "sha256-tree-v1",
      excluded: [...SOURCE_EXCLUSIONS],
      sha256: sha256Tree(projectRoot, SOURCE_EXCLUSIONS)
    },
    build: {
      script: "build",
      outputPath: "dist",
      exitCode: 0,
      sha256: sha256Tree(distRoot)
    },
    runtime: {
      script: "preview",
      entryRoute,
      identityPath: "/artifact-meta.json"
    }
  };
  validateReceiptDocument(receipt);
  assertExactIdentity(identityFromReceipt(receipt), identity, "receipt identity");

  mkdirSync(dirname(receiptPath), { recursive: true });
  const temporaryReceipt = `${receiptPath}.tmp-${process.pid}`;
  writeFileSync(temporaryReceipt, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  renameSync(temporaryReceipt, receiptPath);
  console.log(`freeze-artifact-under-test passed: ${identity.projectId}; receipt=${acceptance.artifactUnderTest.receiptPath}`);
} catch (error) {
  console.error(`freeze-artifact-under-test failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

function readArg(name) {
  const index = values.indexOf(name);
  if (index === -1) return null;
  const value = values[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function toKebabCase(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function runNpm(args, cwd) {
  const npmCli = process.env.npm_execpath;
  const hasNpmRuntime = npmCli && existsSync(npmCli);
  // Node refuses to spawn .cmd files without a shell (EINVAL), so go through cmd.exe.
  const command = hasNpmRuntime
    ? process.execPath
    : process.platform === "win32"
      ? "cmd.exe"
      : "npm";
  const commandArgs = hasNpmRuntime
    ? [npmCli, ...args]
    : process.platform === "win32"
      ? ["/d", "/s", "/c", `npm ${args.join(" ")}`]
      : args;
  return spawnSync(command, commandArgs, {
    cwd,
    encoding: "utf8",
    shell: false,
    timeout: 120_000,
    windowsHide: true
  });
}

function writeResult(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) process.stderr.write(`${result.error.message}\n`);
}
