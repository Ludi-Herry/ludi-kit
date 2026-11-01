import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
export const kitRoot = resolve(dirname(scriptPath), "..");
export const consumerPackageReceiptSchemaPath = resolve(
  kitRoot,
  "schema/blind-consumer-package-receipt.schema.json"
);

const RECEIPT_SCHEMA_ID_SUFFIX = "/blind-consumer-package-receipt.schema.json";
const PROTOCOL_PATH_PREFIX = "^\\.local-pack/";
const PROTOCOL_PATH_SUFFIX = "-[0-9a-f]{12}\\.tgz$";

function npmInvocation(args) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli || !existsSync(npmCli)) {
    throw new Error("npm CLI path is unavailable; run this helper through an npm script");
  }
  return [process.execPath, [npmCli, ...args]];
}

export function runNpm(args, { capture = false, cwd = kitRoot } = {}) {
  const [command, commandArgs] = npmInvocation(args);
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
    shell: false
  });

  if (result.status !== 0) {
    const detail = result.stderr || result.stdout || result.error?.message || `npm ${args.join(" ")} failed`;
    throw new Error(detail.trim());
  }

  return result;
}

export function deriveProtocolInstallFilename(receiptSchema, digestPrefix) {
  if (!receiptSchema?.$id?.endsWith(RECEIPT_SCHEMA_ID_SUFFIX)) {
    throw new Error("consumer package receipt schema has an unexpected $id");
  }
  if (!/^[0-9a-f]{12}$/.test(digestPrefix ?? "")) {
    throw new Error("protocol package digest prefix must be 12 lowercase hexadecimal characters");
  }

  const pathPattern = receiptSchema?.properties?.package?.properties?.path?.pattern;
  if (
    typeof pathPattern !== "string" ||
    !pathPattern.startsWith(PROTOCOL_PATH_PREFIX) ||
    !pathPattern.endsWith(PROTOCOL_PATH_SUFFIX)
  ) {
    throw new Error("consumer package receipt schema path pattern is not a supported frozen envelope");
  }

  const escapedStem = pathPattern.slice(
    PROTOCOL_PATH_PREFIX.length,
    -PROTOCOL_PATH_SUFFIX.length
  );
  if (!/^(?:[a-z0-9-]|\\\.)+$/.test(escapedStem)) {
    throw new Error("consumer package receipt schema path stem contains unsupported regex syntax");
  }
  const stem = escapedStem.replaceAll("\\.", ".");
  const installFilename = `${stem}-${digestPrefix}.tgz`;
  const packagePath = `.local-pack/${installFilename}`;
  if (!new RegExp(pathPattern).test(packagePath)) {
    throw new Error("derived protocol package path does not satisfy the frozen receipt schema");
  }
  return { installFilename, packagePath, schemaId: receiptSchema.$id };
}

export function packLocal() {
  runNpm(["run", "build"]);
  runNpm(["run", "validate"]);

  const packDir = resolve(kitRoot, ".local-pack");
  mkdirSync(packDir, { recursive: true });
  const result = runNpm(["pack", "--ignore-scripts", "--pack-destination", packDir, "--json"], {
    capture: true
  });

  const output = result.stdout.trim();
  const metadata = JSON.parse(output);
  if (!Array.isArray(metadata) || metadata.length !== 1 || !metadata[0]?.filename) {
    throw new Error(`npm pack returned an unexpected payload: ${output}`);
  }

  const packedTarballPath = resolve(packDir, metadata[0].filename);
  if (!existsSync(packedTarballPath)) {
    throw new Error(`npm pack did not create ${packedTarballPath}`);
  }

  const receiptSchema = JSON.parse(readFileSync(consumerPackageReceiptSchemaPath, "utf8"));
  const { installFilename } = deriveProtocolInstallFilename(
    receiptSchema,
    metadata[0].shasum.slice(0, 12)
  );
  const tarballPath = resolve(packDir, installFilename);
  copyFileSync(packedTarballPath, tarballPath);

  return {
    ...metadata[0],
    installFilename,
    tarballPath
  };
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  try {
    const packed = packLocal();
    process.stdout.write(`${packed.filename}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
