import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lintBlogDerivedRules } from "./antd-blog-lint.mjs";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = resolve(kitRoot, `scripts/.tmp-antd-blog-lint-${process.pid}`);

try {
  mkdirSync(tempRoot, { recursive: true });
  writeFileSync(
    resolve(tempRoot, "bad.tsx"),
    `import { Drawer, Modal, message, notification } from "antd";
export function Bad() {
  message.success("done");
  notification.open({ message: "done" });
  Modal.confirm({ title: "confirm" });
  return <Drawer getContainer={() => document.createElement("div")} />;
}
`,
    "utf8"
  );
  writeFileSync(
    resolve(tempRoot, "good.tsx"),
    `import { App, Drawer } from "antd";
const stableContainer = document.body;
export function Good() {
  const { message } = App.useApp();
  message.success("done");
  return <Drawer getContainer={() => stableContainer} />;
}
`,
    "utf8"
  );

  const issues = lintBlogDerivedRules(tempRoot);
  const counts = issues.reduce((result, issue) => ({ ...result, [issue.rule]: (result[issue.rule] ?? 0) + 1 }), {});
  if (counts["prefer-context-aware-feedback-api"] !== 3 || counts["stable-overlay-container"] !== 1) {
    throw new Error(`Blog-derived lint fixture mismatch: ${JSON.stringify(counts)}`);
  }
  if (issues.some((issue) => issue.file.endsWith("good.tsx"))) throw new Error("Blog-derived lint rejected context-aware or stable-container usage");
  console.log("test-antd-blog-lint passed: 4 negative findings detected; valid hook and stable-container usage accepted");
} finally {
  const rel = relative(resolve(kitRoot, "scripts"), tempRoot);
  if (rel && rel !== ".." && !rel.startsWith(`..\\`) && !rel.startsWith("../")) rmSync(tempRoot, { recursive: true, force: true });
}
