import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  consumerPackageReceiptSchemaPath,
  deriveProtocolInstallFilename
} from "./pack-local.mjs";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

try {
  const receiptSchema = JSON.parse(readFileSync(consumerPackageReceiptSchemaPath, "utf8"));
  const packageMetadata = JSON.parse(readFileSync(resolve(kitRoot, "package.json"), "utf8"));
  const digestPrefix = "0123456789ab";
  const derived = deriveProtocolInstallFilename(receiptSchema, digestPrefix);
  const pathPattern = receiptSchema.properties.package.properties.path.pattern;

  if (!new RegExp(pathPattern).test(derived.packagePath)) {
    throw new Error("derived compatibility envelope does not satisfy the frozen receipt schema");
  }
  if (derived.packagePath !== `.local-pack/${derived.installFilename}`) {
    throw new Error("derived package path and install filename disagree");
  }
  if (!derived.installFilename.endsWith(`-${digestPrefix}.tgz`)) {
    throw new Error("derived compatibility envelope lost the deterministic digest suffix");
  }

  const canonicalStem = packageMetadata.name.replace(/^@/, "").replaceAll("/", "-");
  const canonicalPath = `.local-pack/${canonicalStem}-${packageMetadata.version}-${digestPrefix}.tgz`;
  if (new RegExp(pathPattern).test(canonicalPath)) {
    throw new Error("frozen receipt schema no longer needs the compatibility envelope; review before removal");
  }
  if (canonicalPath === derived.packagePath) {
    throw new Error("protocol envelope must remain distinct from the canonical npm package identity");
  }

  expectFailure("short digest", "12 lowercase hexadecimal", () =>
    deriveProtocolInstallFilename(receiptSchema, "0123")
  );
  expectFailure("unexpected schema id", "unexpected $id", () =>
    deriveProtocolInstallFilename({ ...receiptSchema, $id: "https://example.test/other.json" }, digestPrefix)
  );
  expectFailure("unsupported schema pattern", "supported frozen envelope", () =>
    deriveProtocolInstallFilename(
      {
        ...receiptSchema,
        properties: {
          ...receiptSchema.properties,
          package: {
            ...receiptSchema.properties.package,
            properties: {
              ...receiptSchema.properties.package.properties,
              path: { type: "string", pattern: "^.*\\.tgz$" }
            }
          }
        }
      },
      digestPrefix
    )
  );

  console.log(
    `test-pack-local-protocol-envelope passed: canonical=${canonicalPath}; protocol=${derived.packagePath}; 3 negative fixtures rejected`
  );
} catch (error) {
  console.error(
    `test-pack-local-protocol-envelope failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
}

function expectFailure(name, expectedMessage, action) {
  try {
    action();
  } catch (error) {
    if (error instanceof Error && error.message.includes(expectedMessage)) return;
    throw new Error(`${name} failed with an unexpected error: ${error instanceof Error ? error.message : String(error)}`);
  }
  throw new Error(`${name} did not fail closed`);
}
