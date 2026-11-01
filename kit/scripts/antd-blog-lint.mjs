import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

export function lintBlogDerivedRules(directory) {
  const issues = [];
  for (const file of findSourceFiles(directory)) {
    const sourceText = readFileSync(file, "utf8");
    const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const antdImports = new Map();
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.text !== "antd") continue;
      const bindings = statement.importClause?.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings)) continue;
      for (const specifier of bindings.elements) {
        antdImports.set(specifier.name.text, specifier.propertyName?.text ?? specifier.name.text);
      }
    }

    const report = (node, rule, message) => {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      issues.push({ file, line: position.line + 1, rule, message });
    };
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const owner = node.expression.expression;
        const method = node.expression.name.text;
        if (ts.isIdentifier(owner)) {
          const imported = antdImports.get(owner.text);
          const directFeedbackMethod = ["success", "error", "info", "warning", "warn", "open", "loading", "destroy", "config"].includes(method);
          const directModalMethod = ["success", "error", "info", "warning", "warn", "confirm", "destroy", "config"].includes(method);
          if ((["message", "notification"].includes(imported) && directFeedbackMethod) || (imported === "Modal" && directModalMethod)) {
            report(node, "prefer-context-aware-feedback-api", `Use App or the component hook instead of the imported ${imported}.${method} static API.`);
          }
        }
      }
      if (ts.isJsxAttribute(node) && node.name.text === "getContainer" && node.initializer && containsCreateElement(node.initializer)) {
        report(node, "stable-overlay-container", "getContainer creates a DOM node in its render-time expression; return a stable existing container.");
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return issues;
}

function containsCreateElement(node) {
  let found = false;
  const visit = (child) => {
    if (
      ts.isCallExpression(child) &&
      ts.isPropertyAccessExpression(child.expression) &&
      ts.isIdentifier(child.expression.expression) &&
      child.expression.expression.text === "document" &&
      child.expression.name.text === "createElement"
    ) {
      found = true;
      return;
    }
    if (!found) ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function findSourceFiles(root) {
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory)) {
      if (["node_modules", "dist", ".local-pack"].includes(entry)) continue;
      const path = resolve(directory, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".d.ts")) files.push(path);
    }
  };
  walk(root);
  return files;
}
