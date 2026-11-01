import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { kitRoot, packLocal, runNpm } from "./pack-local.mjs";

function collectPaths(manifest) {
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

function assertPackPath(files, requestedPath) {
  const normalized = requestedPath.replaceAll("\\", "/").replace(/^\.\//, "");
  const present = files.some(({ path }) => path === normalized || path.startsWith(`${normalized}/`));
  if (!present) throw new Error(`tarball is missing manifest path: ${requestedPath}`);
}

try {
  const packed = packLocal();
  const files = packed.files ?? [];
  const manifest = JSON.parse(readFileSync(resolve(kitRoot, "manifest.json"), "utf8"));
  const manifestPaths = collectPaths(manifest);

  for (const requestedPath of manifestPaths) assertPackPath(files, requestedPath);

  const privateArtifacts = files
    .map(({ path }) => path)
    .filter(
      (path) =>
        /^harness\/reports\/.*\.json$/i.test(path) ||
        /^harness\/scenarios\/(?:build-(?:sa|tianshu)|generated-(?:sa|tianshu))/i.test(path) ||
        /(^|\/)\.playwright-cli\//i.test(path) ||
        /^output\/playwright\/.*\.log$/i.test(path) ||
        /(^|\/)node_modules\//i.test(path) ||
        /^preview\/(?:dist\/|dev-server.*\.log$)/i.test(path)
    );
  if (privateArtifacts.length > 0) {
    throw new Error(`tarball contains private or runtime-control artifacts: ${privateArtifacts.join(", ")}`);
  }

  const acceptanceRoot = resolve(kitRoot, ".local-pack", "installed-acceptance");
  runNpm([
    "install",
    "--prefix",
    acceptanceRoot,
    "--no-save",
    "--package-lock=false",
    "--ignore-scripts",
    packed.tarballPath,
    "@types/react@19.2.17",
    "@types/react-dom@19.2.3"
  ]);

  const installedRoot = resolve(acceptanceRoot, "node_modules", "@ai-readable", "kit");
  if (lstatSync(installedRoot).isSymbolicLink()) {
    throw new Error("installed acceptance resolved to a workspace link instead of the tarball");
  }
  for (const requestedPath of manifestPaths) {
    if (!existsSync(resolve(installedRoot, requestedPath))) {
      throw new Error(`installed package is missing manifest path: ${requestedPath}`);
    }
  }

  const installedPackage = JSON.parse(readFileSync(resolve(installedRoot, "package.json"), "utf8"));
  for (const exportTarget of [
    installedPackage.exports["."].import,
    installedPackage.exports["."].types,
    installedPackage.exports["./styles.css"]
  ]) {
    if (!existsSync(resolve(installedRoot, exportTarget))) {
      throw new Error(`installed package export target is missing: ${exportTarget}`);
    }
  }

  const declarations = readFileSync(resolve(installedRoot, "dist/index.d.ts"), "utf8");
  for (const exportName of ["AIReadableProvider", "Button", "DataGrid"]) {
    if (!declarations.includes(exportName)) {
      throw new Error(`installed declarations are missing export: ${exportName}`);
    }
  }

  const consumerCwd = resolve(acceptanceRoot, "consumer-cwd");
  const consumerScenarioDir = resolve(acceptanceRoot, "harness", "scenarios");
  const consumerChecksDir = resolve(acceptanceRoot, "harness", "checks");
  const consumerReportsDir = resolve(acceptanceRoot, "harness", "reports");
  const consumerGeneratedDir = resolve(acceptanceRoot, "generated");
  const consumerDesignPackDir = resolve(consumerCwd, "foundations", "design-packs");
  for (const directory of [consumerCwd, consumerScenarioDir, consumerChecksDir, consumerReportsDir, consumerGeneratedDir, consumerDesignPackDir]) {
    mkdirSync(directory, { recursive: true });
  }

  writeFileSync(
    resolve(consumerGeneratedDir, "installed-runner-smoke.tsx"),
    'import { Button } from "@ai-readable/kit";\nexport const installedRunnerValue = Button;\n',
    "utf8"
  );
  writeFileSync(
    resolve(consumerChecksDir, "tsconfig.installed-runner.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          module: "NodeNext",
          moduleResolution: "NodeNext",
          noEmit: true,
          strict: true,
          target: "ES2022"
        },
        files: ["../../generated/installed-runner-smoke.tsx"]
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  writeFileSync(
    resolve(consumerScenarioDir, "installed-runner-smoke.json"),
    `${JSON.stringify(
      {
        id: "installed-runner-smoke",
        foundationContract: {
          businessContext: "node_modules/@ai-readable/kit/projects/sample-inventory-erp/business-context.json",
          projectId: "sample-inventory-erp",
          outputMode: "kit-consumer",
          framework: "react"
        },
        buildRuntime: {
          command: "npx",
          args: ["tsc", "--noEmit", "-p", "harness/checks/tsconfig.installed-runner.json"],
          cwd: "."
        },
        output: {
          type: "tsx",
          file: "generated/installed-runner-smoke.tsx"
        },
        report: "harness/reports/installed-runner-smoke.json"
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  const consumerReportPath = resolve(consumerReportsDir, "installed-runner-smoke.json");
  writeFileSync(consumerReportPath, '{"scenario":"sentinel","status":"stale"}\n', "utf8");

  const installedRunner = resolve(installedRoot, "harness", "runner", "run-scenario.mjs");
  const runnerResult = spawnSync(
    process.execPath,
    [
      installedRunner,
      "--scenario",
      "../harness/scenarios/installed-runner-smoke.json",
      "--project-root",
      ".."
    ],
    {
      cwd: consumerCwd,
      encoding: "utf8",
      shell: false,
      timeout: 60_000,
      windowsHide: true
    }
  );
  if (runnerResult.error?.code === "ETIMEDOUT") {
    throw new Error("installed runner cross-cwd smoke timed out after 60 seconds");
  }
  if (runnerResult.status !== 0 || !runnerResult.stdout.includes("PASSED installed-runner-smoke")) {
    const detail = runnerResult.error?.message || runnerResult.stderr || runnerResult.stdout || "no output";
    throw new Error(`installed runner cross-cwd smoke failed: ${detail.trim()}`);
  }
  const consumerReport = JSON.parse(readFileSync(consumerReportPath, "utf8"));
  if (consumerReport.scenario !== "installed-runner-smoke" || consumerReport.status !== "passed") {
    throw new Error("installed runner did not replace the sentinel with a passing smoke report");
  }

  const installedCustomFixture = resolve(installedRoot, "generator", "fixtures", "custom-native");
  writeFileSync(
    resolve(consumerCwd, "project-description.json"),
    readFileSync(resolve(installedCustomFixture, "project-description.json"))
  );
  writeFileSync(
    resolve(consumerCwd, "business-context.json"),
    readFileSync(resolve(installedCustomFixture, "business-context.json"))
  );
  writeFileSync(
    resolve(consumerDesignPackDir, "custom-native-local-0.1.0.json"),
    readFileSync(resolve(installedRoot, "foundations", "design-packs", "custom-native-local-0.1.0.json"))
  );

  const installedGenerator = resolve(installedRoot, "scripts", "generate-project-pages.mjs");
  const generatorResult = spawnSync(
    process.execPath,
    [
      installedGenerator,
      "--description",
      "project-description.json",
      "--context",
      "business-context.json",
      "--out",
      "generated-from-installed"
    ],
    {
      cwd: consumerCwd,
      encoding: "utf8",
      shell: false,
      timeout: 60_000,
      windowsHide: true
    }
  );
  if (generatorResult.error?.code === "ETIMEDOUT") {
    throw new Error("installed generator cross-cwd smoke timed out after 60 seconds");
  }
  if (generatorResult.status !== 0) {
    const detail = generatorResult.error?.message || generatorResult.stderr || generatorResult.stdout || "no output";
    throw new Error(`installed generator cross-cwd smoke failed: ${detail.trim()}`);
  }
  const installedGeneratedRoot = resolve(consumerCwd, "generated-from-installed");
  for (const outputFile of ["components.tsx", "pages.tsx", "styles.css"]) {
    if (!existsSync(resolve(installedGeneratedRoot, outputFile))) {
      throw new Error(`installed generator cross-cwd smoke is missing ${outputFile}`);
    }
  }
  const generatedPages = readFileSync(resolve(installedGeneratedRoot, "pages.tsx"), "utf8");
  if (!generatedPages.includes('from "./components"') || generatedPages.includes('from "@ai-readable/kit"')) {
    throw new Error("installed generator cross-cwd smoke violated the custom-native import boundary");
  }

  console.log(
    `installed package OK: ${packed.filename}, ${files.length} files, ${manifestPaths.length} manifest paths, runner and generator cross-cwd passed`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
