import { createHash } from 'node:crypto';
import { component, imports, isShadowed, jsxName, parse, unwrap, walk } from './ast.mjs';

const BASE = 'projects/tianshu-device-ops';
const GENERATED = `${BASE}/generated`;
const REGISTRY = `${GENERATED}/pages.tsx`;
const APP = `${BASE}/app.tsx`;
const UI = `${BASE}/ui.tsx`;
const shadowCache = new WeakMap();

const hashText = source => createHash('sha256').update(source, 'utf8').digest('hex');
const locationKey = loc => `${loc.file}\u0000${loc.line}\u0000${loc.column}\u0000${loc.component}`;
const rootComponent = value => value.split('.')[0];

function sourceText(readFile, file) {
  const value = readFile(file);
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  throw new Error(`影响面分析无法读取源码：${file}`);
}

function objectValue(node, key) {
  const item = node?.properties?.find(entry => entry.type === 'ObjectProperty' && !entry.computed && (entry.key.name ?? entry.key.value) === key);
  return item?.value;
}

function stringValue(node) {
  return node?.type === 'StringLiteral' ? node.value : undefined;
}

function jsxRoot(node) {
  return jsxName(node).split('.')[0];
}

function shadowed(ast, local, parents) {
  let byLocal = shadowCache.get(ast);
  if (!byLocal) {
    byLocal = new Map();
    shadowCache.set(ast, byLocal);
  }
  let byScope = byLocal.get(local);
  if (!byScope) {
    byScope = new WeakMap();
    byLocal.set(local, byScope);
  }
  for (const scope of parents) {
    if (!(/Function/.test(scope.type) || scope.type === 'ArrowFunctionExpression' || scope.type === 'BlockStatement')) continue;
    if (!byScope.has(scope)) byScope.set(scope, isShadowed(ast, local, [scope]));
    if (byScope.get(scope)) return true;
  }
  return false;
}

function collectAntdLocations(ast, file, bindings, root = ast, ancestors = []) {
  const result = [];
  walk(root, (node, parents) => {
    if (node.type !== 'JSXOpeningElement') return;
    const value = component(node.name, bindings);
    if (!value || shadowed(ast, jsxRoot(node.name), parents)) return;
    result.push({ file, line: node.loc.start.line, column: node.loc.start.column, component: value });
  }, ancestors);
  return result;
}

function importedFrom(ast, moduleName) {
  const bindings = new Map();
  for (const node of ast.program.body) {
    if (node.type !== 'ImportDeclaration' || node.source.value !== moduleName || node.importKind === 'type') continue;
    for (const specifier of node.specifiers) {
      if (specifier.type === 'ImportSpecifier' && specifier.importKind !== 'type') {
        bindings.set(specifier.local.name, specifier.imported.name ?? specifier.imported.value);
      }
    }
  }
  return bindings;
}

function referencedBindings(ast, bindings) {
  const used = new Set();
  if (!bindings.size) return used;
  const locals = new Set(bindings.keys());
  walk(ast, (node, parents) => {
    let local;
    if (node.type === 'JSXOpeningElement') local = jsxRoot(node.name);
    else if (node.type === 'CallExpression' && node.callee.type === 'Identifier') local = node.callee.name;
    if (local && locals.has(local) && !shadowed(ast, local, parents)) used.add(bindings.get(local));
  });
  return used;
}

function functionIndex(ast, bindings) {
  const functions = new Map();
  const add = (local, node) => {
    if (!local || !node?.body || functions.has(local)) return;
    functions.set(local, { node, locations: collectAntdLocations(ast, UI, bindings, node.body, [node]), dependencies: new Set() });
  };

  for (const statement of ast.program.body) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (!declaration) continue;
    if (declaration.type === 'FunctionDeclaration') add(declaration.id?.name, declaration);
    if (declaration.type === 'VariableDeclaration') {
      for (const declarator of declaration.declarations) {
        const init = unwrap(declarator.init);
        if (declarator.id.type === 'Identifier' && ['ArrowFunctionExpression', 'FunctionExpression'].includes(init?.type)) add(declarator.id.name, init);
      }
    }
  }

  const names = new Set(functions.keys());
  for (const [local, entry] of functions) {
    walk(entry.node.body, (node, parents) => {
      let referenced;
      if (node.type === 'JSXOpeningElement') referenced = jsxRoot(node.name);
      else if (node.type === 'CallExpression' && node.callee.type === 'Identifier') referenced = node.callee.name;
      if (referenced && names.has(referenced) && !shadowed(ast, referenced, parents)) entry.dependencies.add(referenced);
    }, [entry.node]);
  }
  return functions;
}

function reachableLocations(functions, roots) {
  const found = new Map();
  const visited = new Set();
  const visit = name => {
    if (visited.has(name)) return;
    visited.add(name);
    const entry = functions.get(name);
    if (!entry) return;
    for (const loc of entry.locations) found.set(locationKey(loc), loc);
    for (const dependency of entry.dependencies) visit(dependency);
  };
  for (const name of roots) visit(name);
  return [...found.values()];
}

function registeredPageEntries(ast) {
  let declaration;
  walk(ast, node => {
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.id.name === 'generatedProjectPages') declaration = node;
  });
  if (declaration?.init?.type !== 'ArrayExpression' || declaration.init.elements.length === 0) {
    throw new Error('影响面分析无法解析 generatedProjectPages 登记');
  }

  const importsByLocal = new Map();
  for (const statement of ast.program.body) {
    if (statement.type !== 'ImportDeclaration' || statement.importKind === 'type') continue;
    for (const specifier of statement.specifiers) {
      if (specifier.type === 'ImportSpecifier' && specifier.importKind !== 'type') {
        importsByLocal.set(specifier.local.name, { module: statement.source.value, imported: specifier.imported.name ?? specifier.imported.value });
      }
    }
  }

  const ids = new Set();
  return declaration.init.elements.map(entry => {
    const id = stringValue(objectValue(entry, 'id'));
    const route = stringValue(objectValue(entry, 'route'));
    const title = stringValue(objectValue(entry, 'title'));
    const pageComponent = objectValue(entry, 'component');
    if (!id || !route?.startsWith('/') || !title || pageComponent?.type !== 'Identifier' || ids.has(id)) {
      throw new Error('影响面分析发现不完整或重复的页面登记');
    }
    ids.add(id);
    const binding = importsByLocal.get(pageComponent.name);
    const match = binding?.module.match(/^\.\/([A-Za-z][A-Za-z0-9]*)$/);
    if (!match || binding.imported !== pageComponent.name || !match[1].endsWith('Page')) {
      throw new Error(`影响面分析无法映射页面组件：${id}`);
    }
    return { id, route, title, pageComponent: pageComponent.name, file: `${GENERATED}/${match[1]}.tsx` };
  });
}

function routeMap(routes, entries) {
  if (!Array.isArray(routes) || routes.length !== entries.length) throw new Error('影响面分析的路由数与页面登记不一致');
  const result = new Map();
  for (const route of routes) {
    if (!route || typeof route.id !== 'string' || typeof route.title !== 'string' || typeof route.path !== 'string' || !route.path.startsWith('/') || route.path.startsWith('//') || result.has(route.id)) {
      throw new Error('影响面分析收到无效或重复的登记路由');
    }
    result.set(route.id, route);
  }
  for (const entry of entries) if (!result.has(entry.id)) throw new Error(`影响面分析找不到登记路由：${entry.id}`);
  return result;
}

function checkedOptions(options) {
  const components = options?.components ?? null;
  const loc = options?.loc;
  if (components !== null && (!Array.isArray(components) || !components.length || components.some(value => typeof value !== 'string' || !value.trim()))) {
    throw new Error('影响面组件范围必须为 null 或非空组件名数组');
  }
  if (loc !== undefined && (!loc || typeof loc.file !== 'string' || !Number.isInteger(loc.line) || loc.line < 1 || !Number.isInteger(loc.column) || loc.column < 0 || typeof loc.component !== 'string')) {
    throw new Error('影响面源码位置无效');
  }
  return { components: components === null ? null : new Set(components.map(value => value.trim())), loc };
}

export function buildImpact(readFile, routes, options = {}) {
  if (typeof readFile !== 'function') throw new Error('影响面分析需要白名单 readFile 函数');
  const { components, loc } = checkedOptions(options);
  const sources = new Map();
  const read = file => {
    if (!sources.has(file)) sources.set(file, sourceText(readFile, file));
    return sources.get(file);
  };

  const registrySource = read(REGISTRY);
  const registryAst = parse(registrySource);
  const entries = registeredPageEntries(registryAst);
  const byRoute = routeMap(routes, entries);
  const appSource = read(APP);
  const appAst = parse(appSource);
  const uiSource = read(UI);
  const uiAst = parse(uiSource);
  const uiFunctions = functionIndex(uiAst, imports(uiAst));
  const appUiNames = referencedBindings(appAst, importedFrom(appAst, './ui'));
  const appUiLocations = reachableLocations(uiFunctions, appUiNames);
  const appLocations = collectAntdLocations(appAst, APP, imports(appAst));

  const pages = [];
  for (const entry of entries) {
    const source = read(entry.file);
    const ast = parse(source);
    const direct = collectAntdLocations(ast, entry.file, imports(ast));
    if(loc && /^[a-z]/.test(loc.component) && entry.file===loc.file)walk(ast,node=>{
      if(node.type==='JSXOpeningElement'&&node.name.type==='JSXIdentifier'&&node.name.name===loc.component&&node.loc.start.line===loc.line&&node.loc.start.column===loc.column)direct.push({...loc});
    });
    const uiNames = referencedBindings(ast, importedFrom(ast, '../ui'));
    const sharedUi = reachableLocations(uiFunctions, new Set([...appUiNames, ...uiNames]));
    const matching = new Map();
    for (const item of [...direct, ...appLocations, ...sharedUi]) {
      if (components && !components.has(rootComponent(item.component))) continue;
      if (loc && locationKey(item) !== locationKey(loc)) continue;
      matching.set(locationKey(item), item);
    }
    const locations = [...matching.values()].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.component.localeCompare(b.component));
    if (loc ? locations.length : components ? locations.length > 0 : true) {
      const route = byRoute.get(entry.id);
      pages.push({ id: entry.id, title: route.title, path: route.path, locations });
    }
  }

  const all = new Map();
  for (const page of pages) for (const item of page.locations) all.set(locationKey(item), item);
  if (pages.length === 0 || all.size === 0) throw new Error('影响面分析没有解析到登记页面源码位置');
  const scope = loc ? 'instance' : components ? 'component' : 'theme';
  return {
    pages,
    locations: [...all.values()].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.component.localeCompare(b.component)),
    scope,
    files: [...sources.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([file, source]) => ({ file, sha256: hashText(source) }))
  };
}
