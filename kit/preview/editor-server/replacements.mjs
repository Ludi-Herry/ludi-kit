import { createHash } from 'node:crypto';
import { parse, walk, unwrap, property, name, raw, edits, print, imports, component, attributes, attrExpression, localImport, jsxName, isShadowed } from './ast.mjs';
const digest = text => createHash('sha256').update(text).digest('hex');
const equivalent = ['open', 'title', 'width', 'destroyOnHidden', 'forceRender', 'keyboard', 'closable', 'zIndex', 'className', 'rootClassName', 'mask'];
const sourceValue = (source, attr) => !attr.value ? 'true' : raw(source, attrExpression(attr));
const asAttr = (key, expr) => `${key}={${expr}}`;
function staticValue(node, ast, resolveImport, seen = new Set()) {
  node = unwrap(node);
  if (['StringLiteral', 'NumericLiteral', 'BooleanLiteral'].includes(node?.type)) return node.value;
  if (node?.type === 'NullLiteral') return null;
  if (node?.type === 'ArrayExpression') return node.elements.map(n => staticValue(n, ast, resolveImport, seen));
  if (node?.type === 'ObjectExpression') {
    const out = {};
    for (const p of node.properties) {
      if (p.type !== 'ObjectProperty' || p.computed || name(p.key) in out) throw new Error('动态或重复选项');
      out[name(p.key)] = staticValue(p.value, ast, resolveImport, seen);
    }
    return out;
  }
  if (node?.type === 'Identifier' && !seen.has(node.name)) {
    seen = new Set([...seen, node.name]);
    const declarations = [];
    walk(ast, n => { if (n.type === 'VariableDeclarator' && n.id?.name === node.name) declarations.push(n.init); });
    if (declarations.length === 1) return staticValue(declarations[0], ast, resolveImport, seen);
    for (const decl of ast.program.body) if (decl.type === 'ImportDeclaration' && decl.source.value === '../data') {
      const spec = decl.specifiers.find(s => s.type === 'ImportSpecifier' && s.local.name === node.name);
      if (spec && resolveImport) return resolveImport(spec.imported.name);
    }
  }
  // The common frozen string-array .map(value => ({value, label: value})) is finite.
  if (node?.type === 'CallExpression' && node.callee.type === 'MemberExpression' && node.callee.property.name === 'map' && node.arguments.length === 1) {
    const fn = node.arguments[0], array = staticValue(node.callee.object, ast, resolveImport, seen), body = unwrap(fn.body);
    if (fn.type !== 'ArrowFunctionExpression' || fn.params.length !== 1 || fn.params[0].type !== 'Identifier' || body.type !== 'ObjectExpression') throw new Error('无法证明选项映射');
    const p = fn.params[0].name;
    if (body.properties.length !== 2 || body.properties.some(x => x.type !== 'ObjectProperty' || !['value', 'label'].includes(name(x.key)) || x.value.type !== 'Identifier' || x.value.name !== p)) throw new Error('无法证明选项映射');
    return array.map(value => ({value, label: value}));
  }
  throw new Error('选项不是可证明的静态值');
}
export function importedOptions(source, exported) {
  const ast = parse(source); const items = [];
  walk(ast, n => { if (n.type === 'VariableDeclarator' && n.id?.name === exported) items.push(n.init); });
  if (items.length !== 1) throw new Error('选项导出不唯一');
  return staticValue(items[0], ast);
}
function handlerNode(expr, ast) {
  if (expr?.type !== 'Identifier') return expr;
  const items = [];
  walk(ast, n => { if (n.type === 'VariableDeclarator' && n.id?.name === expr.name) items.push(n.init); if (n.type === 'FunctionDeclaration' && n.id.name === expr.name) items.push(n); });
  return items.length === 1 ? items[0] : undefined;
}
function oneValueHandler(expr, ast) {
  const fn = handlerNode(expr, ast);
  if (fn && ['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'].includes(fn.type)) return fn.params.length <= 1 && fn.params.every(n => n.type === 'Identifier');
  let setter = false;
  if (expr?.type === 'Identifier') walk(ast, n => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'ArrayPattern' && n.id.elements[1]?.name === expr.name && n.init?.type === 'CallExpression' && n.init.callee.name === 'useState') setter = true;
  });
  return setter;
}
function controlledValue(expr) {
  return expr && ['Identifier', 'StringLiteral', 'NumericLiteral', 'MemberExpression', 'LogicalExpression', 'ConditionalExpression'].includes(expr.type);
}
function isSimpleExpression(node) {
  let safe = true;
  walk(node, n => { if (['CallExpression', 'AssignmentExpression', 'UpdateExpression', 'AwaitExpression', 'NewExpression', 'SpreadElement'].includes(n.type)) safe = false; });
  return safe;
}
function activeModal(ast, parents) {
  const fn = [...parents].reverse().find(n => /Function/.test(n.type) || n.type === 'ArrowFunctionExpression');
  // Search the enclosing component, not an inner callback/render closure.
  for (const owner of [...parents].reverse().filter(n => /Function/.test(n.type) || n.type === 'ArrowFunctionExpression')) {
    let binding;
    walk(owner.body, (n, chain) => {
      if (chain.some(p => /Function/.test(p.type) || p.type === 'ArrowFunctionExpression')) return;
      if (n.type === 'VariableDeclarator' && n.id.type === 'ObjectPattern' && n.init?.type === 'CallExpression' && n.init.callee.type === 'MemberExpression' && imports(ast).get(n.init.callee.object.name) === 'App' && n.init.callee.property.name === 'useApp') {
        const prop = n.id.properties.find(p => p.type === 'ObjectProperty' && name(p.key) === 'modal');
        if (prop?.value.type === 'Identifier') binding = prop.value.name;
      }
    });
    if (binding) return binding;
  }
  return undefined;
}
// These are source-owned domain facts, not client-supplied permission levels.
// Caller pins store bytes to the reviewed baseline; drift blocks confirmation candidates.
function confirmationLevel(callback, ast, proof) {
  if (!proof?.storeVerified) throw new Error('业务 store 已漂移，确认等级待重新审查');
  const nodes = [];
  walk(callback, n => {
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.object.name === 'deviceOpsStore') nodes.push(n);
  });
  if (nodes.length !== 1) throw new Error('确认回调未能证明唯一业务动作');
  const call = nodes[0], method = call.callee.property.name;
  const importedStore = ast.program.body.some(n => n.type === 'ImportDeclaration' && n.source.value === '../store' && n.specifiers.some(s => s.type === 'ImportSpecifier' && s.imported.name === 'deviceOpsStore' && s.local.name === 'deviceOpsStore'));
  if (!importedStore || call.arguments[0]?.type !== 'MemberExpression' || call.arguments[0].computed || call.arguments[0].property.name !== 'id') throw new Error('必须为当前对象的登记 store 动作');
  if (method === 'cancelTask' && call.arguments.length === 1) return 'C'; // multi-device, irreversible external dispatch
  if (method === 'setRuleEnabled' && call.arguments.length === 2 && call.arguments[1].type === 'BooleanLiteral' && call.arguments[1].value === false) return 'B'; // current rule; skipped notifications are not replayed
  throw new Error('该业务动作的可逆性或影响不能证明');
}
export function analyzeReplacement(source, loc, context = {}) {
  const ast = parse(source), bindings = imports(ast); let hit;
  walk(ast, (n, parents) => {
    if (n.type === 'JSXElement' && n.openingElement.loc.start.line === loc.line && n.openingElement.loc.start.column === loc.column) {
      const comp = component(n.openingElement.name, bindings);
      if (comp === loc.component && !isShadowed(ast, jsxName(n.openingElement.name).split('.')[0], parents)) hit = { node: n, parents, comp };
    }
  });
  const rules = [], candidates = [];
  const blocked = message => ({loc, candidates: [], rules: [{id: 'replacement.semantic', status: 'blocked', message}]});
  if (!hit) return blocked('源码位置与 antd 组件不匹配，或绑定被遮蔽');
  const {node, comp, parents} = hit;
  let attrs;
  try { attrs = attributes(node); } catch { return blocked('展开或重复 props 无法证明'); }
  const changes = [], eol = source.includes('\r\n') ? '\r\n' : '\n';
  const values = Object.fromEntries([...attrs].map(([key, attr]) => [key, sourceValue(source, attr)]));
  let target, replacement, unmapped = [];
  try {
    if (comp === 'Modal' || comp === 'Drawer') {
      const isModal = comp === 'Modal'; target = isModal ? 'Drawer' : 'Modal';
      const allowed = new Set([...equivalent, 'footer', isModal ? 'onCancel' : 'onClose', ...(isModal ? ['onOk', 'okText', 'cancelText', 'confirmLoading', 'okButtonProps', 'cancelButtonProps', 'centered'] : ['extra', 'placement', 'size'])]);
      for (const key of attrs.keys()) if (!allowed.has(key)) throw new Error(`${key} 没有等价迁移证明`);
      if (attrs.has('footer') && attrs.has('onOk')) throw new Error('自定义 footer 与 onOk 共同出现，语义不确定');
      if (attrs.has('extra') && attrs.has('footer')) throw new Error('Drawer 同时包含 extra 与 footer，无法单槽映射');
      if (attrs.has('centered')) { const v = attrExpression(attrs.get('centered')); if (v && v.type !== 'BooleanLiteral') throw new Error('动态 centered'); unmapped.push('centered'); }
      if (attrs.has('placement')) { const v = attrExpression(attrs.get('placement')); if (v?.value !== 'right') throw new Error('非右侧 Drawer 无等价位置'); unmapped.push('placement'); }
      const newName = localImport(source, ast, target, changes), next = [];
      for (const key of equivalent) if (key in values) next.push(asAttr(key, values[key]));
      if (attrs.has('size')) { const v = attrExpression(attrs.get('size')); if (v?.type !== 'NumericLiteral' || 'width' in values) throw new Error('Drawer size 无法映射为 width'); next.push(asAttr('width', values.size)); }
      const fromClose = isModal ? 'onCancel' : 'onClose', toClose = isModal ? 'onClose' : 'onCancel';
      if (fromClose in values) next.push(asAttr(toClose, values[fromClose]));
      if (isModal) {
        if ('footer' in values) next.push(asAttr('extra', values.footer));
        else {
          if (!('onOk' in values) || !('onCancel' in values)) throw new Error('默认 Modal 按钮必须具有可保留的确认和取消回调');
          const button = localImport(source, ast, 'Button', changes), space = localImport(source, ast, 'Space', changes);
          const footer = `<${space}><${button} onClick={${values.onCancel}}${values.cancelButtonProps ? ` {...${values.cancelButtonProps}}` : ''}>{${values.cancelText ?? '"取消"'}}</${button}><${button} type="primary" onClick={${values.onOk}}${values.confirmLoading ? ` loading={${values.confirmLoading}}` : ''}${values.okButtonProps ? ` {...${values.okButtonProps}}` : ''}>{${values.okText ?? '"确定"'}}</${button}></${space}>`;
          next.push(asAttr('extra', footer));
        }
        if (!('mask' in values)) next.push('mask={{ closable: false }}');
      } else {
        next.push(asAttr('footer', values.extra ?? values.footer ?? 'null'));
        if (!('mask' in values)) next.push('mask={{ closable: true }}');
      }
      replacement = `<${newName} ${next.join(' ')}>${source.slice(node.openingElement.end, node.closingElement?.start ?? node.openingElement.end)}</${newName}>`;
    } else if (comp === 'Select' || comp === 'Radio.Group') {
      const toRadio = comp === 'Select'; target = toRadio ? 'Radio.Group' : 'Select';
      const allowed = new Set(['options', 'value', 'defaultValue', 'onChange', 'disabled', 'name', 'id', 'className', 'size', ...(toRadio ? ['placeholder'] : [])]);
      for (const key of attrs.keys()) if (!allowed.has(key)) throw new Error(`${key} 不支持等价单选迁移`);
      if (node.children.some(n => n.type !== 'JSXText' || n.value.trim())) throw new Error('仅支持 options 形式，不丢弃 children');
      const options = staticValue(attrExpression(attrs.get('options')), ast, context.resolveImport);
      if (!Array.isArray(options) || !options.length || options.length > 5 || options.some(o => !o || Object.keys(o).some(k => !['value','label','disabled'].includes(k)) || !['string','number'].includes(typeof o.value) || typeof o.label !== 'string' || (o.disabled !== undefined && typeof o.disabled !== 'boolean')) || new Set(options.map(o => `${typeof o.value}:${o.value}`)).size !== options.length) throw new Error('选项需为 1–5 个唯一静态标量且标签可证明');
      for (const key of ['value', 'defaultValue']) if (attrs.has(key) && (!controlledValue(attrExpression(attrs.get(key))) || !isSimpleExpression(attrExpression(attrs.get(key))))) throw new Error('值表达式有不可迁移副作用');
      const exported = toRadio ? 'Radio' : 'Select', newName = localImport(source, ast, exported, changes) + (toRadio ? '.Group' : ''), next = [];
      for (const [key, value] of Object.entries(values)) if (!['onChange', 'placeholder'].includes(key)) next.push(asAttr(key, value));
      if (attrs.has('placeholder')) unmapped.push('placeholder');
      if ('onChange' in values) {
        const handler = attrExpression(attrs.get('onChange'));
        if (toRadio) {
          if (!oneValueHandler(handler, ast)) throw new Error('Select 回调可能依赖第二个 option 参数');
          next.push(asAttr('onChange', `(ludiEvent) => (${values.onChange})(ludiEvent.target.value)`));
        } else {
          if (handler.type !== 'ArrowFunctionExpression' || handler.params.length !== 1 || handler.params[0].type !== 'Identifier') throw new Error('Radio 回调必须为可证明的事件适配器');
          const param = handler.params[0].name, uses = [];
          walk(handler.body, (n, chain) => { if (n.type === 'Identifier' && n.name === param) uses.push({n, chain}); });
          if (!uses.length || uses.some(({n,chain}) => { const member = chain.at(-1), outer = chain.at(-2); return member?.type !== 'MemberExpression' || member.object !== n || member.property.name !== 'target' || outer?.type !== 'MemberExpression' || outer.object !== member || outer.property.name !== 'value'; })) throw new Error('Radio 回调读取了 value 之外的事件字段');
          const localEdits = uses.map(({chain}) => ({start: chain.at(-2).start - handler.start, end: chain.at(-2).end - handler.start, text: param}));
          // Adapter body is parsed as part of a declaration to retain TS/JSX syntax.
          let code = raw(source, handler);
          for (const edit of localEdits.sort((a,b) => b.start-a.start)) code = code.slice(0,edit.start)+edit.text+code.slice(edit.end);
          next.push(asAttr('onChange', code));
        }
      }
      replacement = `<${newName} ${next.join(' ')} />`;
    } else if (comp === 'Popconfirm' || comp === 'Button') {
      const modal = activeModal(ast, parents);
      if (!modal) throw new Error('没有当前 App.useApp 的 modal 绑定，无法保留主题与上下文');
      if (comp === 'Popconfirm') {
        target = 'modal.confirm';
        const mapping = {title:'title', description:'content', onConfirm:'onOk', onCancel:'onCancel', okText:'okText', cancelText:'cancelText', okButtonProps:'okButtonProps', cancelButtonProps:'cancelButtonProps'};
        for (const key of attrs.keys()) if (!(key in mapping) && key !== 'disabled') throw new Error(`${key} 不支持确认迁移`);
        const level = confirmationLevel(attrExpression(attrs.get('onConfirm')), ast, context);
        const children = node.children.filter(n => n.type !== 'JSXText' || n.value.trim());
        if (children.length !== 1 || children[0].type !== 'JSXElement' || component(children[0].openingElement.name, bindings) !== 'Button') throw new Error('确认触发必须为单个 antd Button');
        const child = children[0], ca = attributes(child);
        if (ca.has('onClick') || ca.has('href')) throw new Error('触发已有点击或跳转动作，不能覆盖');
        if (attrs.has('disabled') && (!ca.has('disabled') || sourceValue(source, ca.get('disabled')) !== values.disabled)) throw new Error('触发按钮未保留禁用条件');
        const obj = Object.entries(mapping).filter(([key]) => key in values).map(([key,to]) => `${to}: ${values[key]}`).join(', ');
        const trigger = raw(source, child);
        const offset = (child.openingElement.typeParameters?.end ?? child.openingElement.typeArguments?.end ?? child.openingElement.name.end)-child.start;
        replacement = trigger.slice(0,offset) + ` onClick={() => ${modal}.confirm({ ${obj} })}` + trigger.slice(offset);
        rules.push({id:'confirmation.level',status:'pass',message:`源码动作证明为 ${level} 档；保留摘要与业务回调`});
      } else {
        target = 'Popconfirm';
        const handler = attrExpression(attrs.get('onClick'));
        if (handler?.type !== 'ArrowFunctionExpression' || handler.params.length || handler.body.type !== 'CallExpression' || handler.body.callee.type !== 'MemberExpression' || handler.body.callee.object.name !== modal || handler.body.callee.property.name !== 'confirm' || handler.body.arguments.length !== 1) throw new Error('仅支持直接调用当前 modal.confirm 的单一按钮');
        const obj = handler.body.arguments[0];
        if (obj.type !== 'ObjectExpression') throw new Error('动态 confirm 配置');
        const mapping = {title:'title', content:'description', onOk:'onConfirm', onCancel:'onCancel', okText:'okText', cancelText:'cancelText', okButtonProps:'okButtonProps', cancelButtonProps:'cancelButtonProps'};
        if (obj.properties.some(p => p.type !== 'ObjectProperty' || p.computed || !(name(p.key) in mapping))) throw new Error('confirm 含不可迁移字段');
        const keys = obj.properties.map(p => name(p.key)); if (new Set(keys).size !== keys.length) throw new Error('重复 confirm 字段');
        if (confirmationLevel(property(obj,'onOk')?.value, ast, context) !== 'B') throw new Error('C 档不能降为气泡确认');
        const pc = localImport(source,ast,'Popconfirm',changes);
        const trigger = raw(source,node), attr = attrs.get('onClick');
        const clean = trigger.slice(0, attr.start-node.start)+trigger.slice(attr.end-node.start);
        replacement = `<${pc} ${obj.properties.map(p => asAttr(mapping[name(p.key)], raw(source,p.value))).join(' ')}>${clean}</${pc}>`;
        rules.push({id:'confirmation.level',status:'pass',message:'当前对象 B 档动作，保留摘要与回调'});
      }
    } else return blocked('P0 不支持该组件的替换');
    // Unknown attributes are blocked, never made permissible by user confirmation.
    const printed = print(replacement, eol);
    changes.push({start:node.start,end:node.end,text:printed});
    const output = edits(source,changes);
    const migratedProps = [...attrs.keys()].filter(k => !unmapped.includes(k));
    const id = `v1-${comp.replaceAll('.','-')}-${target.replaceAll('.','-')}-${digest(raw(source,node)).slice(0,16)}`;
    candidates.push({id,target,label:`替换为 ${target}`,migratedProps,unmappedProps:unmapped,requiresConfirmation:unmapped.length>0});
    rules.push({id:'replacement.semantic',status:'pass',message:'限定映射中的 props 与回调已保留'});
    return {loc,candidates,rules,output,unmappedProps:unmapped};
  } catch (error) { return blocked(error.message); }
}
