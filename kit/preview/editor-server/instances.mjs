import { parse, walk, unwrap, name, raw, edits, imports, component, attributes, attrExpression, jsxName, isShadowed } from './ast.mjs';

const ICONS = new Set([
  'SearchOutlined', 'PlusOutlined', 'ReloadOutlined', 'DeleteOutlined',
  'InfoCircleOutlined', 'CheckOutlined', 'CloseOutlined'
]);
const TEXT_ELEMENTS = new Set(['span', 'p', 'h1', 'h2', 'h3', 'button', 'a', 'label', 'strong', 'em', 'small', 'li', 'dt', 'dd']);
const INTERACTIVE_TEXT = new Set(['Button', 'button', 'a']);
const SIZE_OPTIONS = ['small', 'medium', 'large'];
const PLACEMENTS = ['top', 'topLeft', 'topRight', 'left', 'leftTop', 'leftBottom', 'right', 'rightTop', 'rightBottom', 'bottom', 'bottomLeft', 'bottomRight'];

const field = (label, type, options) => Object.freeze({ label, type, ...(options ? { options } : {}) });
const FIELDS = Object.freeze({
  Button: Object.freeze({
    size: field('尺寸', 'enum', SIZE_OPTIONS),
    type: field('类型', 'enum', ['default', 'primary', 'dashed', 'link', 'text']),
    shape: field('形状', 'enum', ['default', 'circle', 'round']),
    block: field('占满宽度', 'boolean'),
    danger: field('危险状态', 'boolean')
  }),
  Input: Object.freeze({
    placeholder: field('占位文字', 'string'),
    size: field('尺寸', 'enum', SIZE_OPTIONS),
    allowClear: field('允许清空', 'boolean')
  }),
  Select: Object.freeze({
    placeholder: field('占位文字', 'string'),
    size: field('尺寸', 'enum', SIZE_OPTIONS),
    allowClear: field('允许清空', 'boolean')
  }),
  Tag: Object.freeze({
    variant: field('样式', 'enum', ['filled', 'solid', 'outlined']),
    closable: field('可关闭', 'boolean')
  }),
  Alert: Object.freeze({
    title: field('标题', 'string'),
    description: field('说明', 'string'),
    type: field('类型', 'enum', ['success', 'info', 'warning', 'error']),
    showIcon: field('显示图标', 'boolean')
  }),
  Modal: Object.freeze({
    title: field('标题', 'string'),
    okText: field('确认文案', 'string'),
    cancelText: field('取消文案', 'string'),
    centered: field('居中显示', 'boolean')
  }),
  Drawer: Object.freeze({
    title: field('标题', 'string'),
    size: field('尺寸', 'enum', ['default', 'large']),
    placement: field('位置', 'enum', ['top', 'right', 'bottom', 'left'])
  }),
  Popconfirm: Object.freeze({
    title: field('标题', 'string'),
    description: field('说明', 'string'),
    okText: field('确认文案', 'string'),
    cancelText: field('取消文案', 'string'),
    placement: field('位置', 'enum', PLACEMENTS)
  }),
  native: Object.freeze({
    title: field('提示文字', 'string'),
    'aria-label': field('无障碍名称', 'string')
  })
});

const SLOT_RULES = Object.freeze({
  Button: Object.freeze({ icon: '图标' }),
  Input: Object.freeze({ prefix: '前缀', suffix: '后缀' }),
  Select: Object.freeze({ suffixIcon: '后缀图标' }),
  Tag: Object.freeze({ icon: '图标' }),
  Alert: Object.freeze({ icon: '图标' }),
  Modal: Object.freeze({ closeIcon: '关闭图标' }),
  Drawer: Object.freeze({ closeIcon: '关闭图标' }),
  Popconfirm: Object.freeze({ icon: '图标' })
});

export const SEMANTIC_PARTS = Object.freeze({
  Button: Object.freeze(['root', 'icon', 'content']),
  Input: Object.freeze(['root', 'prefix', 'suffix', 'clear', 'input', 'count']),
  'Input.TextArea': Object.freeze(['root', 'textarea', 'clear', 'count']),
  Select: Object.freeze(['root', 'prefix', 'suffix', 'input', 'placeholder', 'content', 'item', 'itemContent', 'itemRemove', 'clear', 'popup.root', 'popup.listItem', 'popup.list']),
  Tag: Object.freeze(['root', 'icon', 'content', 'close']),
  Alert: Object.freeze(['root', 'icon', 'section', 'title', 'description', 'actions', 'close']),
  Modal: Object.freeze(['root', 'header', 'body', 'footer', 'container', 'title', 'wrapper', 'mask', 'close']),
  Drawer: Object.freeze(['root', 'mask', 'header', 'title', 'extra', 'section', 'body', 'footer', 'wrapper', 'dragger', 'close']),
  Popconfirm: Object.freeze(['root', 'container', 'arrow', 'title', 'content', 'icon']),
  Table: Object.freeze(['root', 'section', 'title', 'footer', 'body.wrapper', 'body.row', 'body.cell', 'content', 'header.wrapper', 'header.row', 'header.cell', 'pagination.root', 'pagination.item'])
});

export const STYLE_FIELDS = Object.freeze({
  fontSize: Object.freeze({ type: 'number', min: 10, max: 32 }),
  fontWeight: Object.freeze({ type: 'number', min: 100, max: 900 }),
  lineHeight: Object.freeze({ type: 'number', min: 1, max: 3 }),
  paddingTop: Object.freeze({ type: 'number', min: 0, max: 96 }),
  paddingRight: Object.freeze({ type: 'number', min: 0, max: 96 }),
  paddingBottom: Object.freeze({ type: 'number', min: 0, max: 96 }),
  paddingLeft: Object.freeze({ type: 'number', min: 0, max: 96 }),
  gap: Object.freeze({ type: 'number', min: 0, max: 96 }),
  marginTop: Object.freeze({ type: 'number', min: 0, max: 96 }),
  marginRight: Object.freeze({ type: 'number', min: 0, max: 96 }),
  marginBottom: Object.freeze({ type: 'number', min: 0, max: 96 }),
  marginLeft: Object.freeze({ type: 'number', min: 0, max: 96 }),
  borderRadius: Object.freeze({ type: 'number', min: 0, max: 32 }),
  width: Object.freeze({ type: 'number', min: 0, max: 960 }),
  height: Object.freeze({ type: 'number', min: 0, max: 960 }),
  borderWidth: Object.freeze({ type: 'number', min: 0, max: 8 }),
  color: Object.freeze({ type: 'color' }),
  backgroundColor: Object.freeze({ type: 'color' })
});

function contrastPair(foreground, background) {
  const lum = hex => {
    const rgb = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  };
  const a = lum(foreground), b = lum(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function normalizeStyles(styles) {
  if (!styles || typeof styles !== 'object' || Array.isArray(styles) || Object.keys(styles).length === 0) throw new Error('styles 必须至少包含一个结构层');
  if (Object.keys(styles).length > 32) throw new Error('单次结构层数量超限');
  const normalized = {};
  for (const [part, values] of Object.entries(styles)) {
    if (!/^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*$/.test(part)) throw new Error(`结构层「${part}」无效`);
    if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).length === 0) throw new Error(`结构层「${part}」必须至少包含一个字段`);
    const hasColor = Object.hasOwn(values, 'color'), hasBackground = Object.hasOwn(values, 'backgroundColor');
    if (hasColor !== hasBackground) throw new Error(`${part} 的 color 与 backgroundColor 必须同时提供`);
    normalized[part] = {};
    for (const [key, value] of Object.entries(values)) {
      const descriptor = STYLE_FIELDS[key];
      if (!descriptor) throw new Error(`样式字段「${key}」不在白名单`);
      if (descriptor.type === 'color') {
        if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${part}.${key} 必须为六位不透明十六进制颜色`);
        normalized[part][key] = value.toLowerCase();
      } else {
        if (value === null) { normalized[part][key] = null; continue; }
        if (typeof value !== 'number' || !Number.isFinite(value) || value < descriptor.min || value > descriptor.max) throw new Error(`${part}.${key} 超出允许范围 ${descriptor.min}–${descriptor.max}`);
        normalized[part][key] = value;
      }
    }
    if (hasColor && contrastPair(normalized[part].color, normalized[part].backgroundColor) < 4.5) throw new Error(`${part} 的文字与背景对比度低于 4.5:1`);
  }
  return normalized;
}

function packageImports(ast, packageName) {
  const result = new Map();
  for (const declaration of ast.program.body) {
    if (declaration.type !== 'ImportDeclaration' || declaration.source.value !== packageName || declaration.importKind === 'type') continue;
    for (const specifier of declaration.specifiers) {
      if (specifier.type === 'ImportSpecifier' && specifier.importKind !== 'type') result.set(specifier.local.name, specifier.imported.name);
    }
  }
  return result;
}

function resolvedComponent(node, bindings) {
  const rawName = jsxName(node);
  if (/^[a-z]/.test(rawName) && !rawName.includes('.')) return rawName;
  return component(node, bindings);
}

function family(componentName) {
  if (componentName === 'Input.TextArea') return 'Input';
  return componentName;
}

function supported(componentName) {
  return Boolean(FIELDS[family(componentName)] || SEMANTIC_PARTS[componentName] || (/^[a-z]/.test(componentName) && !['script', 'style'].includes(componentName)));
}

function locateTarget(source, loc) {
  if (!loc || !Number.isInteger(loc.line) || !Number.isInteger(loc.column) || typeof loc.component !== 'string') throw new Error('loc 必须包含精确 line、column 与 component');
  const ast = parse(source), bindings = imports(ast), hits = [];
  walk(ast, (node, parents) => {
    if (node.type !== 'JSXElement' || node.openingElement.loc.start.line !== loc.line || node.openingElement.loc.start.column !== loc.column) return;
    const componentName = resolvedComponent(node.openingElement.name, bindings);
    const local = jsxName(node.openingElement.name).split('.')[0];
    if (componentName === loc.component && supported(componentName) && (!bindings.has(local) || !isShadowed(ast, local, parents))) hits.push({ node, parents, componentName });
  });
  if (hits.length !== 1) throw new Error('源码位置与组件不匹配、绑定被遮蔽或组件不在登记范围');
  let attrs;
  try { attrs = attributes(hits[0].node); } catch { throw new Error('展开或重复属性无法证明，实例保持只读'); }
  return { ast, bindings, attrs, ...hits[0] };
}

function ownedTest(node, context) {
  return context && node?.type==='BinaryExpression' && node.operator==='===' && node.right?.type==='StringLiteral' && raw(context.source,node.left).replace(/\s/g,'')===context.identity.expression?.replace(/\s/g,'');
}
function conditionalLeaves(node, context) {
  node=unwrap(node);
  if(node?.type!=='ConditionalExpression')return [node];
  if(!ownedTest(node.test,context))return [];
  const left=conditionalLeaves(node.consequent,context),right=conditionalLeaves(node.alternate,context);
  return left.length&&right.length?[...left,...right]:[];
}
function selectedBranch(node,context) {
  node=unwrap(node);
  if(node?.type!=='ConditionalExpression')return node;
  if(!ownedTest(node.test,context))return node;
  return selectedBranch(context.key===node.test.right.value?node.consequent:node.alternate,context);
}
function literalValue(attr,context) {
  if (!attr) return { exists: false };
  if (!attr.value) return { exists: true, static: true, value: true, code: 'true' };
  const original = unwrap(attrExpression(attr));
  const leaves=conditionalLeaves(original,context);
  if(!leaves.length||!leaves.every(n=>['StringLiteral','NumericLiteral','BooleanLiteral','NullLiteral'].includes(n?.type)||(n?.type==='Identifier'&&n.name==='undefined')))return {exists:true,static:false};
  const expression = selectedBranch(original,context);
  const code = context ? raw(context.source,original) : undefined;
  if (expression?.type === 'StringLiteral' || expression?.type === 'NumericLiteral' || expression?.type === 'BooleanLiteral') return { exists: true, static: true, value: expression.value, code: code ?? expression.extra?.raw ?? JSON.stringify(expression.value) };
  if (expression?.type === 'NullLiteral') return { exists: true, static: true, value: null, code: code ?? 'null' };
  if (expression?.type==='Identifier'&&expression.name==='undefined')return {exists:true,static:true,value:undefined,code:code??'undefined'};
  return { exists: true, static: false };
}

function validateFieldValue(componentName, key, value) {
  const registry = /^[a-z]/.test(componentName) ? FIELDS.native : FIELDS[family(componentName)];
  const descriptor = registry?.[key];
  if (!descriptor) throw new Error(`属性「${key}」不在 ${componentName} 的展示属性白名单`);
  if (descriptor.type === 'boolean') {
    if (typeof value !== 'boolean') throw new Error(`${key} 必须为布尔值`);
  } else {
    if (typeof value !== 'string' || value.length > 500) throw new Error(`${key} 必须为不超过 500 字符的字符串`);
    if (descriptor.type === 'enum' && !descriptor.options.includes(value)) throw new Error(`${key} 不在允许选项内`);
  }
  return value;
}

function fieldModel(componentName, attrs,context) {
  const registry = /^[a-z]/.test(componentName) ? FIELDS.native : FIELDS[family(componentName)] ?? {};
  return Object.entries(registry).map(([key, descriptor]) => {
    const current = literalValue(attrs.get(key),context);
    const base = { name: key, label: descriptor.label, type: descriptor.type, ...(descriptor.options ? { options: descriptor.options } : {}) };
    if (!current.exists) return { ...base, writable: true };
    const leaves=conditionalLeaves(attrExpression(attrs.get(key)),context);
    if (!current.static || leaves.some(value=> !['NullLiteral'].includes(value?.type)&&!(value?.type==='Identifier'&&value.name==='undefined')&&(()=>{try{validateFieldValue(componentName,key,value.value);return false;}catch{return true;}})())) return { ...base, writable: false, reason: '当前属性是动态表达式或不属于可编辑的静态展示值' };
    return { ...base, value: current.value, writable: true };
  });
}

function textInfo(node, componentName,context) {
  const allowed = TEXT_ELEMENTS.has(componentName) || ['Button', 'Tag'].includes(family(componentName));
  if (!allowed || node.openingElement.selfClosing) return { writable: false, reason: '该组件没有可编辑的静态文本子节点' };
  const meaningful = node.children.filter(child => child.type !== 'JSXText' || child.value.trim() !== '');
  if (meaningful.length !== 1) return { writable: false, reason: 'children 不是唯一的纯静态文本' };
  const child = meaningful[0];
  if (child.type === 'JSXText') return { writable: true, value: child.value.trim(), node: child };
  if (child.type === 'JSXExpressionContainer' && unwrap(child.expression)?.type === 'StringLiteral') return { writable: true, value: unwrap(child.expression).value, node: child };
  if(child.type==='JSXExpressionContainer'){
    const leaves=conditionalLeaves(child.expression,context);
    if(leaves.length&&leaves.every(n=>n?.type==='StringLiteral'))return {writable:true,value:selectedBranch(child.expression,context).value,node:child};
  }
  return { writable: false, reason: 'children 含动态表达式或复杂 JSX' };
}

function safeStaticAttribute(attr) {
  const key = attr.name?.name;
  if (typeof key !== 'string' || key === 'ref' || /^on[A-Z]/.test(key)) return false;
  if (!attr.value || attr.value.type === 'StringLiteral') return true;
  const expression = unwrap(attrExpression(attr));
  return ['StringLiteral', 'NumericLiteral', 'BooleanLiteral', 'NullLiteral'].includes(expression?.type) || (expression?.type === 'Identifier' && expression.name === 'undefined');
}

function slotValue(source, ast, bindings, attr,context) {
  if (!attr) return { safe: true, value: { kind: 'none' }, code: 'undefined' };
  if (!attr.value) return { safe: false, reason: '插槽不是可证明的静态 ReactNode' };
  const expression = unwrap(attrExpression(attr));
  if(expression?.type==='ConditionalExpression'){
    const leaves=conditionalLeaves(expression,context), values=leaves.map(node=>slotValue(source,ast,bindings,{value:{type:'JSXExpressionContainer',expression:node}}));
    if(!leaves.length||values.some(v=>!v.safe))return {safe:false,reason:'插槽条件分支含动态或业务节点'};
    const selected=slotValue(source,ast,bindings,{value:{type:'JSXExpressionContainer',expression:selectedBranch(expression,context)}});
    return {...selected,code:raw(source,expression)};
  }
  if (expression?.type === 'StringLiteral') return { safe: true, value: { kind: 'text', text: expression.value }, code: raw(source, expression) };
  if (expression?.type === 'NullLiteral' || (expression?.type === 'Identifier' && expression.name === 'undefined')) return { safe: true, value: { kind: 'none' }, code: raw(source, expression) };
  if (expression?.type !== 'JSXElement') return { safe: false, reason: '插槽含调用、动态标识或复杂 JSX' };
  let nestedAttrs;
  try { nestedAttrs = attributes(expression); } catch { return { safe: false, reason: '插槽含展开或重复属性' }; }
  if ([...nestedAttrs.values()].some(item => !safeStaticAttribute(item))) return { safe: false, reason: '插槽含事件、ref 或动态属性' };
  const iconImports = packageImports(ast, '@ant-design/icons');
  const rawNestedName = jsxName(expression.openingElement.name);
  const importedIcon = iconImports.get(rawNestedName);
  if (importedIcon && ICONS.has(importedIcon) && expression.openingElement.selfClosing) return { safe: true, value: { kind: 'icon', name: importedIcon }, code: raw(source, expression) };
  const nestedComponent = resolvedComponent(expression.openingElement.name, bindings);
  if (nestedComponent === 'Tag') {
    const info = textInfo(expression, 'Tag');
    if (info.writable) return { safe: true, value: { kind: 'tag', text: info.value }, code: raw(source, expression) };
  }
  return { safe: false, reason: '插槽只允许已登记的静态图标、文本或无事件 Tag' };
}

function slotsModel(source, ast, bindings, componentName, attrs,context) {
  const rules = SLOT_RULES[family(componentName)] ?? {};
  return Object.entries(rules).map(([slotName, label]) => {
    const value = slotValue(source, ast, bindings, attrs.get(slotName),context);
    return value.safe ? { name: slotName, label, writable: true, value: value.value } : { name: slotName, label, writable: false, reason: value.reason };
  });
}

function functionNode(node) {
  return ['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'].includes(node?.type);
}

function mapIdentity(target, parents) {
  for (let index = parents.length - 1; index >= 0; index--) {
    const call = parents[index];
    if (call.type !== 'CallExpression' || call.callee?.type !== 'MemberExpression' || call.callee.computed || call.callee.property.name !== 'map') continue;
    const callback = call.arguments[0];
    if (!functionNode(callback) || callback.params[0]?.type !== 'Identifier') return { kind: 'repeated' };
    const item = callback.params[0].name;
    const callbackIndex = parents.indexOf(callback);
    const root = callback.body?.type === 'JSXElement'
      ? callback.body
      : [...parents.slice(callbackIndex + 1)].find(candidate => candidate.type === 'ReturnStatement')?.argument;
    const jsxRoot = unwrap(root);
    if (jsxRoot?.type !== 'JSXElement') return { kind: 'repeated' };
    let rootAttrs;
    try { rootAttrs = attributes(jsxRoot); } catch { return { kind: 'repeated' }; }
    const key = unwrap(attrExpression(rootAttrs.get('key')));
    if (key?.type !== 'MemberExpression' || key.computed || key.object?.type !== 'Identifier' || key.object.name !== item || key.property?.type !== 'Identifier') return { kind: 'repeated' };
    return { kind: 'keyed', expression: `String(${item}.${key.property.name})` };
  }
  return null;
}

function directColumnsName(expression, ast) {
  expression = unwrap(expression);
  if (expression?.type !== 'Identifier') return undefined;
  const name0 = expression.name, declarations = [];
  walk(ast, node => { if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && node.id.name === name0) declarations.push(node.init); });
  if (declarations.length !== 1) return name0;
  const init = unwrap(declarations[0]);
  if (init?.type === 'CallExpression' && init.callee?.type === 'MemberExpression' && !init.callee.computed && init.callee.property.name === 'filter' && init.callee.object?.type === 'Identifier') return init.callee.object.name;
  return name0;
}

function uniquePageRoot(ast, enclosing, parents, file) {
  if(!enclosing)return false;
  if(file&&!file.endsWith('Page.tsx'))return false;
  const before=parents.slice(0,parents.indexOf(enclosing));
  if(before.some(functionNode))return false;
  const exported=before.find(p=>p.type==='ExportNamedDeclaration'||p.type==='ExportDefaultDeclaration');
  if(!exported)return false;
  const declaration=before.find(p=>p.type==='VariableDeclarator'&&p.init===enclosing);
  const rootName=enclosing.id?.name??declaration?.id?.name;
  if(file?.endsWith('Page.tsx')&&rootName!==file.split(/[\\/]/).at(-1).replace(/\.tsx$/,''))return false;
  let used=false;
  if(rootName)walk(ast,node=>{if((node.type==='JSXOpeningElement'&&node.name?.type==='JSXIdentifier'&&node.name.name===rootName)||(node.type==='CallExpression'&&node.callee?.type==='Identifier'&&node.callee.name===rootName))used=true;});
  return !used;
}

function tableIdentity(ast, bindings, target, parents, file) {
  const renderProperty = [...parents].reverse().find(node => node.type === 'ObjectProperty' && !node.computed && name(node.key) === 'render' && functionNode(unwrap(node.value)));
  if (!renderProperty) return null;
  const render = unwrap(renderProperty.value);
  if (render.params[1]?.type !== 'Identifier') return { kind: 'repeated' };
  const record = render.params[1].name;
  const declaration = [...parents].reverse().find(node => node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && unwrap(node.init)?.type === 'ArrayExpression');
  if (!declaration) return { kind: 'repeated' };
  const columnsName = declaration.id.name, matches = [];
  walk(ast, (node,nodeParents) => {
    if (node.type !== 'JSXElement' || resolvedComponent(node.openingElement.name, bindings) !== 'Table') return;
    let attrs;
    try { attrs = attributes(node); } catch { return; }
    const rowKey = literalValue(attrs.get('rowKey'));
    const usedColumns = directColumnsName(attrExpression(attrs.get('columns')), ast);
    if (usedColumns === columnsName && rowKey.static && typeof rowKey.value === 'string' && /^[A-Za-z_$][\w$]*$/.test(rowKey.value)) {
      const functions=nodeParents.filter(functionNode);
      if(functions.length!==1||!uniquePageRoot(ast,functions[0],nodeParents,file))matches.push(null);
      else matches.push(rowKey.value);
    }
  });
  if (matches.length !== 1||matches[0]===null) return { kind: 'repeated' };
  return { kind: 'keyed', expression: `String(${record}.${matches[0]})` };
}

function identityFor(ast, bindings, target, parents, file) {
  const functions=parents.filter(functionNode);
  const mapped=mapIdentity(target,parents);
  if(mapped){
    const mapCalls=parents.filter(p=>p.type==='CallExpression'&&p.callee?.type==='MemberExpression'&&p.callee.property?.name==='map');
    return mapCalls.length===1&&uniquePageRoot(ast,functions[0],parents,file)?mapped:{kind:'repeated'};
  }
  const table=tableIdentity(ast,bindings,target,parents,file);if(table)return table;
  // Only the registered page root proves one render; local helpers remain read-only.
  if(functions.length>1)return {kind:'repeated'};
  return {kind:uniquePageRoot(ast,functions[0],parents,file)?'single':'repeated'};
}

function styleParts(componentName) {
  if (/^[a-z]/.test(componentName)) return ['root'];
  return SEMANTIC_PARTS[componentName] ?? SEMANTIC_PARTS[family(componentName)] ?? [];
}

function objectProperties(node, message) {
  node = unwrap(node);
  if (node?.type !== 'ObjectExpression' || node.properties.some(item => item.type !== 'ObjectProperty' || item.computed || item.method)) throw new Error(message);
  const keys = node.properties.map(item => name(item.key));
  if (new Set(keys).size !== keys.length) throw new Error(message);
  return node.properties;
}

function readStyleState(source, expression, allowedParts) {
  const result = {};
  const allowed = new Set(allowedParts);
  function visit(node, prefix = '') {
    for (const prop of objectProperties(node, 'styles/part/property 必须是无展开、无重复的静态对象')) {
      const key = name(prop.key), path = prefix ? `${prefix}.${key}` : key;
      if (allowed.has(path)) {
        result[path] = {};
        for (const fieldProp of objectProperties(prop.value, `styles.${path} 必须是静态对象`)) {
          const fieldName = name(fieldProp.key), value = unwrap(fieldProp.value);
          if (!['StringLiteral', 'NumericLiteral', 'BooleanLiteral', 'NullLiteral'].includes(value?.type)) throw new Error(`styles.${path}.${fieldName} 是动态值，不能覆盖`);
          result[path][fieldName] = { value: value.type === 'NullLiteral' ? null : value.value, code: raw(source, value) };
        }
      } else if (allowedParts.some(part => part.startsWith(`${path}.`))) visit(prop.value, path);
      else throw new Error(`styles 中存在未登记结构层「${path}」`);
    }
  }
  visit(expression);
  return result;
}

function readNativeStyleState(source, expression) {
  const fields = {};
  for (const prop of objectProperties(expression, 'style 必须是无展开、无重复的静态对象')) {
    const fieldName = name(prop.key), value = unwrap(prop.value);
    if (!['StringLiteral', 'NumericLiteral', 'BooleanLiteral', 'NullLiteral'].includes(value?.type)) throw new Error(`style.${fieldName} 是动态值，不能覆盖`);
    fields[fieldName] = { value: value.type === 'NullLiteral' ? null : value.value, code: raw(source, value) };
  }
  return { root: fields };
}

function styleValueForModel(state) {
  return Object.fromEntries(Object.entries(state).map(([part, fields]) => [part, Object.fromEntries(Object.entries(fields).map(([key, entry]) => [key, entry.value]))]));
}

function mergeStyles(state, requested) {
  const merged = Object.fromEntries(Object.entries(state).map(([part, fields]) => [part, { ...fields }]));
  for (const [part, fields] of Object.entries(requested)) {
    merged[part] ??= {};
    for (const [key, value] of Object.entries(fields)) {
      if (value === null) {
        if (!Object.hasOwn(merged[part], key)) throw new Error(`${part}.${key} 在源码中不存在，不能恢复`);
        delete merged[part][key];
      } else merged[part][key] = { value, code: typeof value === 'string' ? JSON.stringify(value) : String(value) };
    }
    if (Object.keys(merged[part]).length === 0) delete merged[part];
  }
  return merged;
}

function styleCode(state, native = false) {
  if (native) {
    const fields = state.root ?? {};
    return `{ ${Object.entries(fields).map(([key, value]) => `${key}: ${value.code}`).join(', ')} }`;
  }
  const tree = {};
  for (const [part, fields] of Object.entries(state)) {
    const segments = part.split('.'); let cursor = tree;
    for (const segment of segments) cursor = cursor[segment] ??= {};
    cursor.__fields = fields;
  }
  const render = node => {
    const entries = [];
    for (const [key, value] of Object.entries(node)) {
      if (key === '__fields') for (const [fieldName, fieldValue] of Object.entries(value)) entries.push(`${fieldName}: ${fieldValue.code}`);
      else entries.push(`${key}: ${render(value)}`);
    }
    return `{ ${entries.join(', ')} }`;
  };
  return render(tree);
}

function styleInspection(source, attrs, componentName,context) {
  const native = /^[a-z]/.test(componentName), attrName = native ? 'style' : 'styles', attr = attrs.get(attrName);
  if (!attr) return { attribute: attrName, writable: true, value: {} };
  try {
    const expression=attrExpression(attr),leaves=conditionalLeaves(expression,context);
    const read=node=> node?.type==='NullLiteral'||(node?.type==='Identifier'&&node.name==='undefined')?{}:native ? readNativeStyleState(source,node) : readStyleState(source,node,styleParts(componentName));
    if(!leaves.length)throw new Error('结构样式条件分支无法证明');
    for(const leaf of leaves)read(leaf);
    const state = read(selectedBranch(expression,context));
    return { attribute: attrName, writable: true, value: styleValueForModel(state), state, attr };
  } catch (error) {
    return { attribute: attrName, writable: false, reason: error.message, attr };
  }
}

function inspectLocated(source, located,instanceKey=null) {
  const { ast, bindings, attrs, node, parents, componentName } = located;
  const identity=identityFor(ast,bindings,node,parents,located.file),context={source,identity,key:instanceKey};
  const text = textInfo(node, componentName,context);
  const modelText = text.writable ? { writable: true, value: text.value } : { writable: false, reason: text.reason };
  return {
    component: componentName,
    fields: fieldModel(componentName, attrs,context),
    text: modelText,
    slots: slotsModel(source, ast, bindings, componentName, attrs,context),
    parts: styleParts(componentName),
    identity,
    styles: (() => { const s=styleInspection(source,attrs,componentName,context); return {writable:s.writable,value:s.value,reason:s.reason}; })()
  };
}

export function inspectInstance(source, loc,instanceKey=null) {
  return inspectLocated(source, {...locateTarget(source, loc),file:loc.file},instanceKey);
}

function validateInstanceKey(identity, instanceKey) {
  if (instanceKey !== null && (typeof instanceKey !== 'string' || instanceKey.length < 1 || instanceKey.length > 256)) throw new Error('instanceKey 必须是 1–256 字符的字符串或 null');
  if (identity.kind === 'single' && instanceKey !== null) throw new Error('单实例修改的 instanceKey 必须为 null');
  if (identity.kind === 'keyed' && typeof instanceKey !== 'string') throw new Error('稳定重复实例必须提供 instanceKey');
  if (identity.kind === 'repeated') throw new Error('重复渲染缺少可证明的稳定 key，不能承诺单实例写回');
}

function quoted(value) { return JSON.stringify(value); }
function conditional(identity, instanceKey, next, previous = 'undefined') {
  if(identity.kind!=='keyed')return next;
  const prefix='const value = ',wrapped=prefix+previous+';';
  try {
    const node=unwrap(parse(wrapped).program.body[0].declarations[0].init);
    const withoutKey=value=>{
      if(value?.type!=='ConditionalExpression'||!ownedTest(value.test,{source:wrapped,identity}))return raw(wrapped,value);
      if(value.test.right.value===instanceKey)return withoutKey(value.alternate);
      return `${raw(wrapped,value.test)} ? ${raw(wrapped,value.consequent)} : ${withoutKey(value.alternate)}`;
    };
    previous=withoutKey(node);
  }catch{}
  return `${identity.expression} === ${quoted(instanceKey)} ? ${next} : ${previous}`;
}

function importManager(source, ast) {
  const used = new Set();
  walk(ast, node => { if (node.type === 'Identifier' || node.type === 'JSXIdentifier') used.add(node.name); });
  const pending = new Map();
  const get = (packageName, exported) => {
    const existing = [...packageImports(ast, packageName)].find(([, imported]) => imported === exported)?.[0];
    if (existing) return existing;
    const pendingPackage = pending.get(packageName) ?? [];
    const already = pendingPackage.find(entry => entry.exported === exported);
    if (already) return already.local;
    let local = exported;
    if (used.has(local)) { local = `LudiEditor${exported}`; while (used.has(local)) local += '_'; }
    used.add(local); pendingPackage.push({ exported, local }); pending.set(packageName, pendingPackage);
    return local;
  };
  const makeEdits = () => {
    const changes = [], prefixes = [];
    for (const [packageName, entries] of pending) {
      const textEntries = entries.map(entry => entry.exported === entry.local ? entry.exported : `${entry.exported} as ${entry.local}`);
      const declaration = ast.program.body.find(node => node.type === 'ImportDeclaration' && node.source.value === packageName && node.specifiers.some(specifier => specifier.type === 'ImportSpecifier'));
      if (!declaration) { prefixes.push(`import { ${textEntries.join(', ')} } from ${quoted(packageName)};`); continue; }
      const specifiers = declaration.specifiers.filter(specifier => specifier.type === 'ImportSpecifier');
      const last = specifiers.at(-1), segment = source.slice(declaration.start, declaration.source.start);
      const multiline = segment.includes('\n');
      const close = source.lastIndexOf('}', declaration.source.start);
      const tail = source.slice(last.end, close);
      if (!tail.includes(',')) {
        const indent = ' '.repeat(last.loc.start.column);
        changes.push({ start: last.end, end: last.end, text: multiline ? `,${source.includes('\r\n') ? '\r\n' : '\n'}${indent}${textEntries.join(`,${source.includes('\r\n') ? '\r\n' : '\n'}${indent}`)}` : `, ${textEntries.join(', ')}` });
      } else {
        const eol = source.includes('\r\n') ? '\r\n' : '\n', indent = ' '.repeat(last.loc.start.column);
        changes.push({ start: close, end: close, text: multiline ? `${indent}${textEntries.join(`,${eol}${indent}`)},${eol}` : ` ${textEntries.join(', ')}, ` });
      }
    }
    if (prefixes.length) changes.push({ start: 0, end: 0, text: `${prefixes.join(source.includes('\r\n') ? '\r\n' : '\n')}${source.includes('\r\n') ? '\r\n' : '\n'}` });
    return changes;
  };
  return { get, makeEdits };
}

function slotCandidate(candidate, importsForChange) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('插槽候选格式无效');
  if (candidate.kind === 'none') return 'null';
  if (candidate.kind === 'text') {
    if (typeof candidate.text !== 'string' || candidate.text.length > 200) throw new Error('插槽文本必须是不超过 200 字符的字符串');
    return quoted(candidate.text);
  }
  if (candidate.kind === 'tag') {
    if (typeof candidate.text !== 'string' || candidate.text.length > 100) throw new Error('Tag 文本必须是不超过 100 字符的字符串');
    const local = importsForChange.get('antd', 'Tag');
    return `<${local}>{${quoted(candidate.text)}}</${local}>`;
  }
  if (candidate.kind === 'icon') {
    if (typeof candidate.name !== 'string' || !ICONS.has(candidate.name)) throw new Error('图标不在固定候选合同内');
    const local = importsForChange.get('@ant-design/icons', candidate.name);
    return `<${local} aria-hidden="true" />`;
  }
  throw new Error('未知插槽候选');
}

function finalAccessibleName(componentName, attrs, text, propChanges, textChange) {
  if (!INTERACTIVE_TEXT.has(family(componentName)) && !INTERACTIVE_TEXT.has(componentName)) return;
  if (textChange === undefined && !Object.hasOwn(propChanges, 'aria-label') && !Object.hasOwn(propChanges, 'title')) return;
  if (textChange === undefined && !text.writable) return;
  const nextText = textChange === undefined ? (text.writable ? text.value : undefined) : textChange;
  const valueFor = key => {
    if (Object.hasOwn(propChanges, key)) return propChanges[key];
    const value = literalValue(attrs.get(key));
    return value.static ? value.value : undefined;
  };
  if ((nextText === undefined || String(nextText).trim() === '') && !String(valueFor('aria-label') ?? '').trim() && !String(valueFor('title') ?? '').trim()) throw new Error('修改会让交互元素失去 accessible name');
}

export function changeInstance(source, loc, instanceKey, changes) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error('changes 必须为对象');
  const allowedTop = new Set(['props', 'text', 'slots', 'styles']);
  if (Object.keys(changes).some(key => !allowedTop.has(key))) throw new Error('changes 含未知字段');
  const located = {...locateTarget(source, loc),file:loc.file}, model = inspectLocated(source, located,instanceKey);
  validateInstanceKey(model.identity, instanceKey);
  const { ast, bindings, attrs, node, componentName } = located;
  const context={source,identity:model.identity,key:instanceKey};
  const outputEdits = [], additions = [], importsForChange = importManager(source, ast);
  const props = changes.props ?? {};
  if (!props || typeof props !== 'object' || Array.isArray(props)) throw new Error('props 必须为对象');
  for (const [key, value] of Object.entries(props)) {
    const attr = attrs.get(key), current = literalValue(attr,context);
    if (current.exists && !current.static) throw new Error(`属性「${key}」是动态表达式，不能覆盖`);
    if (value === null) {
      if (!current.exists) throw new Error(`属性「${key}」在源码中不存在，不能删除`);
      validateFieldValue(componentName, key, current.value);
      if (model.identity.kind === 'single') outputEdits.push({ start: attr.start, end: attr.end, text: '' });
      else outputEdits.push({ start: attr.start, end: attr.end, text: `${key}={${conditional(model.identity, instanceKey, 'undefined', current.code)}}` });
      continue;
    }
    validateFieldValue(componentName, key, value);
    const code = typeof value === 'string' ? quoted(value) : String(value);
    const next = conditional(model.identity, instanceKey, code, current.exists ? current.code : 'undefined');
    if (attr) outputEdits.push({ start: attr.start, end: attr.end, text: `${key}={${next}}` });
    else additions.push(`${key}={${next}}`);
  }

  const text = textInfo(node, componentName,context), hasTextChange = Object.hasOwn(changes, 'text');
  if (hasTextChange) {
    if (!text.writable) throw new Error(text.reason);
    if (typeof changes.text !== 'string' || changes.text.length > 500) throw new Error('文本必须是不超过 500 字符的字符串');
    const previous=text.node.type==='JSXExpressionContainer'?raw(source,text.node.expression):quoted(text.value);
    const next = conditional(model.identity, instanceKey, quoted(changes.text), previous);
    outputEdits.push({ start: text.node.start, end: text.node.end, text: `{${next}}` });
  }
  finalAccessibleName(componentName, attrs, text, props, hasTextChange ? changes.text : undefined);

  const slotChanges = changes.slots ?? {};
  if (!slotChanges || typeof slotChanges !== 'object' || Array.isArray(slotChanges)) throw new Error('slots 必须为对象');
  const registeredSlots = SLOT_RULES[family(componentName)] ?? {};
  for (const [slotName, candidate] of Object.entries(slotChanges)) {
    if (!Object.hasOwn(registeredSlots, slotName)) throw new Error(`插槽「${slotName}」不在 ${componentName} 的登记范围`);
    const attr = attrs.get(slotName), before = slotValue(source, ast, bindings, attr,context);
    if (!before.safe) throw new Error(`插槽「${slotName}」不可覆盖：${before.reason}`);
    const candidateCode = slotCandidate(candidate, importsForChange);
    if (candidate.kind === 'none' && model.identity.kind === 'single') {
      if (attr) outputEdits.push({ start: attr.start, end: attr.end, text: '' });
      continue;
    }
    const next = conditional(model.identity, instanceKey, candidateCode, attr ? before.code : 'undefined');
    if (attr) outputEdits.push({ start: attr.start, end: attr.end, text: `${slotName}={${next}}` });
    else additions.push(`${slotName}={${next}}`);
  }

  if (changes.styles !== undefined) {
    const normalized = normalizeStyles(changes.styles), allowedParts = new Set(styleParts(componentName));
    for (const part of Object.keys(normalized)) if (!allowedParts.has(part)) throw new Error(`结构层「${part}」不属于 ${componentName}`);
    const inspection = styleInspection(source, attrs, componentName,context);
    if (!inspection.writable) throw new Error(inspection.reason);
    const state = inspection.state ?? {}, merged = mergeStyles(state, normalized), nextCode = styleCode(merged, /^[a-z]/.test(componentName));
    const previous = inspection.attr ? raw(source, attrExpression(inspection.attr)) : 'undefined';
    const attrName = inspection.attribute;
    if (model.identity.kind === 'single' && Object.keys(merged).length === 0) {
      if (inspection.attr) outputEdits.push({ start: inspection.attr.start, end: inspection.attr.end, text: '' });
    } else {
      const next = conditional(model.identity, instanceKey, nextCode, previous);
      if (inspection.attr) {
        const expression = attrExpression(inspection.attr);
        outputEdits.push({ start: expression.start, end: expression.end, text: next });
      } else additions.push(`${attrName}={${next}}`);
    }
  }

  if (additions.length) {
    const opening = node.openingElement, offset = opening.end - (opening.selfClosing ? 2 : 1);
    outputEdits.push({ start: offset, end: offset, text: ` ${additions.join(' ')}` });
  }
  outputEdits.push(...importsForChange.makeEdits());
  return edits(source, outputEdits);
}

export function previewTransform(source, file) {
  if (typeof file !== 'string' || !file) throw new Error('file 必须为非空字符串');
  const ast = parse(source), bindings = imports(ast), targets = [];
  walk(ast, (node, parents) => {
    if (node.type !== 'JSXElement') return;
    const componentName = resolvedComponent(node.openingElement.name, bindings);
    if (!componentName || !supported(componentName)) return;
    const local = jsxName(node.openingElement.name).split('.')[0];
    if (bindings.has(local) && isShadowed(ast, local, parents)) return;
    let attrs;
    try { attrs = attributes(node); } catch { return; }
    const located = { ast, bindings, attrs, node, parents, componentName,file };
    const model = inspectLocated(source, located),context={source,identity:model.identity,key:null}, text = textInfo(node, componentName,context), styles = styleInspection(source, attrs, componentName,context);
    const editable = model.fields.some(item => item.writable) || model.text.writable || model.slots.some(item => item.writable) || styles.writable;
    if (!editable) return;
    targets.push({
      loc: { file, line: node.openingElement.loc.start.line, column: node.openingElement.loc.start.column, component: componentName },
      opening: { start: node.openingElement.start, end: node.openingElement.end },
      component: componentName,
      identity: model.identity,
      fields: model.fields,
      slots: model.slots,
      parts: model.parts,
      text: { ...model.text, ...(text.writable ? { range: { start: text.node.start, end: text.node.end },originalCode:text.node.type==='JSXExpressionContainer'?raw(source,text.node.expression):quoted(text.value) } : {}) },
      originalStyles: styles.writable ? { attribute: styles.attribute, value: styles.value,code:styles.attr?raw(source,attrExpression(styles.attr)):'{}' } : { attribute: styles.attribute, writable: false, reason: styles.reason }
    });
  });
  return { file, targets };
}
