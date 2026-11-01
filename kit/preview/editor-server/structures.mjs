// Component semantic styles use AntD 6.5.0 ConfigProvider component configuration,
// separately from theme.components (which contains tokens, not semantic styles).
import { parse, walk, unwrap, property, name, edits } from './ast.mjs';
import { SEMANTIC_PARTS, STYLE_FIELDS, normalizeStyles } from './instances.mjs';

export { STYLE_FIELDS };
export const STRUCTURE_KEYS = {
  Button:'button',Input:'input',Select:'select',Tag:'tag',Table:'table',
  Alert:'alert',Modal:'modal',Drawer:'drawer',Popconfirm:'popconfirm'
};
export const STRUCTURE_EXPORT = 'deviceOpsComponentStyles';

function initializer(source) {
  const ast = parse(source), matches = [];
  walk(ast, (node, parents) => {
    if (node.type === 'VariableDeclarator' && node.id?.name === STRUCTURE_EXPORT) {
      if (!parents.some(p => p.type === 'ExportNamedDeclaration')) throw new Error('组件样式必须是项目具名导出');
      matches.push(unwrap(node.init));
    }
  });
  if (matches.length > 1) throw new Error('组件样式导出不唯一');
  return matches[0];
}
function staticObject(node) {
  if (!node || node.type !== 'ObjectExpression') throw new Error('组件样式配置必须是静态对象');
  const result = {};
  for (const p of node.properties) {
    const key = name(p.key);
    if (p.type !== 'ObjectProperty' || p.computed || typeof key !== 'string' ||
      ['__proto__','constructor','prototype'].includes(key) || Object.hasOwn(result,key)) throw new Error('组件样式含动态或重复字段');
    const value = unwrap(p.value);
    if (value.type === 'ObjectExpression') result[key] = staticObject(value);
    else if (['NumericLiteral','StringLiteral','BooleanLiteral'].includes(value.type)) result[key] = value.value;
    else throw new Error('组件样式含动态表达式，不能覆盖');
  }
  return result;
}
function readPath(object, path) {
  return path.split('.').reduce((current,key) => current && typeof current === 'object' ? current[key] : undefined, object);
}
export function structureCatalog() {
  return Object.fromEntries(Object.keys(STRUCTURE_KEYS).map(component => [component,SEMANTIC_PARTS[component] ?? []]));
}
export function readStructures(source) {
  const node = initializer(source), config = node ? staticObject(node) : {};
  const state = {};
  for (const [component,key] of Object.entries(STRUCTURE_KEYS)) {
    const styles = config[key]?.styles;
    if (!styles) continue;
    for (const part of SEMANTIC_PARTS[component] ?? []) {
      const value = readPath(styles,part);
      if (value && typeof value === 'object') (state[component] ??= {})[part] = value;
    }
  }
  return state;
}
export function changeStructure(source, component, part, fields) {
  const key = STRUCTURE_KEYS[component];
  if (!key || !SEMANTIC_PARTS[component]?.includes(part)) throw new Error('组件或结构层未登记');
  const normalized = normalizeStyles({[part]:fields})[part];
  const node = initializer(source), config = node ? staticObject(node) : {};
  config[key] ??= {};
  config[key].styles ??= {};
  let target = config[key].styles;
  for (const segment of part.split('.')) {
    if (target[segment] !== undefined && (typeof target[segment] !== 'object' || target[segment] === null)) throw new Error('结构层不是静态对象');
    target[segment] ??= {};
    target = target[segment];
  }
  for (const [field,value] of Object.entries(normalized)) {
    if (value === null) delete target[field];
    else target[field] = value;
  }
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const text = JSON.stringify(config,null,2).replaceAll('\n',eol);
  if (node) return edits(source,[{start:node.start,end:node.end,text}]);
  // The exact export is consumed by the project and matrix ConfigProviders.
  const declaration = `${eol}export const ${STRUCTURE_EXPORT} = ${text} satisfies Pick<import("antd").ConfigProviderProps, ${Object.values(STRUCTURE_KEYS).map(k => JSON.stringify(k)).join(' | ')}>;${eol}`;
  return edits(source,[{start:source.length,end:source.length,text:declaration}]);
}
