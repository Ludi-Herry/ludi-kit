import { parse as babelParse } from '@babel/parser';
import recast from 'recast';

export function parse(source) {
  // Recast normalizes CRLF and indentation before invoking its parser. Source
  // ranges must instead come directly from Babel's original byte string.
  return babelParse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'], tokens: true });
}
export function walk(node, visit, parents = []) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') visit(node, parents);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'tokens', 'comments', 'original'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, visit, [...parents, node]));
    else if (value && typeof value.type === 'string') walk(value, visit, [...parents, node]);
  }
}
export const unwrap = node => ['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'ParenthesizedExpression'].includes(node?.type) ? unwrap(node.expression) : node;
export const name = node => node?.name ?? node?.value;
export const property = (node, key) => unwrap(node)?.properties?.find(p => p.type === 'ObjectProperty' && !p.computed && name(p.key) === key);
export const raw = (source, node) => source.slice(node.start, node.end);
export function edits(source, changes) {
  let end = source.length + 1;
  for (const change of [...changes].sort((a, b) => b.start - a.start)) {
    if (change.start < 0 || change.end > end || change.start > change.end) throw new Error('overlapping edits');
    source = source.slice(0, change.start) + change.text + source.slice(change.end);
    end = change.start;
  }
  parse(source);
  return source;
}
// Printing a new node only; the surrounding source is never reprinted.
export function print(code, eol = '\n') {
  const node = recast.parse(code, { parser: { parse } }).program.body[0];
  return recast.print(node, { lineTerminator: eol, quote: 'double' }).code.replace(/;$/, '');
}
export function imports(ast) {
  const map = new Map();
  for (const node of ast.program.body) if (node.type === 'ImportDeclaration' && node.source.value === 'antd' && node.importKind !== 'type') {
    for (const spec of node.specifiers) if (spec.type === 'ImportSpecifier' && spec.importKind !== 'type') map.set(spec.local.name, spec.imported.name);
  }
  return map;
}
export function jsxName(node) {
  if (node?.type === 'JSXIdentifier') return node.name;
  if (node?.type === 'JSXMemberExpression') return `${jsxName(node.object)}.${jsxName(node.property)}`;
  return '';
}
export function component(node, bindings) {
  const parts = jsxName(node).split('.');
  const imported = bindings.get(parts[0]);
  return imported ? [imported, ...parts.slice(1)].join('.') : undefined;
}
export function attributes(node) {
  const result = new Map();
  for (const attr of node.openingElement.attributes) {
    if (attr.type !== 'JSXAttribute' || result.has(attr.name.name)) throw new Error('spread or duplicate props');
    result.set(attr.name.name, attr);
  }
  return result;
}
export function attrExpression(attr) { return attr?.value?.type === 'JSXExpressionContainer' ? attr.value.expression : attr?.value; }
export function localImport(source, ast, exported, changes) {
  const binding = [...imports(ast)].find(([, value]) => value === exported)?.[0];
  if (binding) return binding;
  const used = new Set();
  walk(ast, n => { if (n.type === 'Identifier' || n.type === 'JSXIdentifier') used.add(n.name); });
  let local = exported;
  if (used.has(local)) { local = `LudiEditor${exported}`; while (used.has(local)) local += '_'; }
  const same = changes.find(c => c.imports);
  if (same) { same.entries.push(exported === local ? exported : `${exported} as ${local}`); same.text = `import { ${same.entries.join(', ')} } from "antd";${source.includes('\r\n') ? '\r\n' : '\n'}`; }
  else changes.push({ start: 0, end: 0, imports: true, entries: [exported === local ? exported : `${exported} as ${local}`], text: `import { ${exported === local ? exported : `${exported} as ${local}`} } from "antd";${source.includes('\r\n') ? '\r\n' : '\n'}` });
  return local;
}
export function isShadowed(ast, local, targetParents) {
  const scopes = targetParents.filter(n => /Function/.test(n.type) || n.type === 'ArrowFunctionExpression' || n.type === 'BlockStatement');
  return scopes.some(scope => {
    let shadow = false;
    walk(scope, (n, parents) => {
      if (n === scope || parents.some(p => p !== scope && (/Function/.test(p.type) || p.type === 'ArrowFunctionExpression'))) return;
      if (n.type === 'VariableDeclarator' || n.type === 'FunctionDeclaration') walk(n.id, x => { if (x.type === 'Identifier' && x.name === local) shadow = true; });
    });
    for (const param of scope.params ?? []) walk(param, n => { if (n.type === 'Identifier' && n.name === local) shadow = true; });
    return shadow;
  });
}
