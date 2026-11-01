// 页面 ↔ 模具一致性检查（第 4 项，试运行：只报告不拦截，不进 validate 门禁）。
// 规则只读两样东西：生成的页面源码 + 页面模具 regions 数据（deriveRegistries 派生出的生效登记 +
// patterns.manifest.json）；不读人类文档。
// 必检三类：
//   locked-region-missing            locked 区在页面根容器直接子元素中缺失
//   locked-region-structure-changed  locked 区被改写结构（如筛选 section 换成普通 div：身份属性还在、标签变了）
//   required-component-absent        区域内必需组件（regions[].requiredComponent）缺席
// 用法：
//   node scripts/check-page-mold.mjs [--root <页面目录>] [--page <id> ...] [--assert-none] [--json-out <file>]
// 默认 root = projects/tianshu-device-ops/generated（14 页）；--assert-none 有命中时 exit 1，否则恒 exit 0（试运行不拦截）。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registries } from '../preview/editor-server/blocks.mjs';
import { parse, unwrap } from '../preview/editor-server/ast.mjs';

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flagValue = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const ROOT = resolve(kitRoot, flagValue('--root') ?? 'projects/tianshu-device-ops/generated');
const ASSERT_NONE = args.includes('--assert-none');
const JSON_OUT = flagValue('--json-out');
const ONLY_PAGES = [];
for (let i = 0; i < args.length; i++) if (args[i] === '--page' && args[i + 1]) ONLY_PAGES.push(args[i + 1]);

const manifest = JSON.parse(readFileSync(resolve(kitRoot, 'patterns.manifest.json'), 'utf8'));

const pageFile = (pageId) => `${pageId.split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join('')}Page.tsx`;

// 解析 `:scope > tag[aria-label="x"].class` 形式（可逗号并列多份，见 firmware 随页签切换区块）。
function parseSelectorAlternatives(selector) {
  return selector.split(',').map((raw) => {
    let alt = raw.trim().replace(/^:scope\s*>\s*/, '');
    const tagMatch = alt.match(/^[a-z][a-zA-Z0-9]*/);
    const tag = tagMatch ? tagMatch[0] : null;
    if (tag) alt = alt.slice(tag.length);
    const attrs = [];
    const classes = [];
    for (const m of alt.matchAll(/\[([a-z-]+)="([^"]*)"\]/g)) attrs.push([m[1], m[2]]);
    for (const m of alt.matchAll(/\.([\w-]+)/g)) classes.push(m[1]);
    const rest = alt.replace(/\[[^\]]*\]/g, '').replace(/\.[\w-]+/g, '').trim();
    if (rest) throw new Error(`选择器语法超出本检查支持范围：${raw}`);
    return { tag, attrs, classes, raw: raw.trim() };
  });
}
// 登记的选择器是按渲染后 DOM 写的；源码里 antd 组件以大写组件名出现，列出已登记用到的对应（保守、不猜）。
const ANTD_COMPONENT_TO_NATIVE_TAG = { form: 'Form' };
const matchTag = (el, alt) => !alt.tag || el.tag === alt.tag || el.tag === ANTD_COMPONENT_TO_NATIVE_TAG[alt.tag];
const matchIdentity = (el, alt) =>
  alt.attrs.every(([k, v]) => el.attrs[k] === v) && alt.classes.every((c) => el.classes.has(c));

function staticString(node) {
  node = unwrap(node);
  return node?.type === 'StringLiteral' ? node.value : null;
}

function elementDescriptor(node) {
  const open = node.openingElement;
  return {
    tag: open.name?.type === 'JSXIdentifier' ? open.name.name : '(member)',
    attrs: Object.fromEntries(
      (open.attributes ?? [])
        .filter((a) => a.type === 'JSXAttribute' && a.name?.name && a.value)
        .map((a) => [a.name.name, staticString(a.value)])
        .filter(([, v]) => v !== null)
    ),
    classes: new Set(
      (() => {
        const attr = (open.attributes ?? []).find((a) => a.type === 'JSXAttribute' && a.name?.name === 'className' && a.value);
        const value = attr ? staticString(attr.value) : null;
        return value ? value.split(/\s+/).filter(Boolean) : [];
      })()
    )
  };
}

function findRootCandidates(fileSource, rootSelector) {
  const rootClasses = rootSelector.split('.').filter(Boolean);
  const ast = parse(fileSource);
  const roots = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'JSXElement') {
      const el = elementDescriptor(node);
      if (rootClasses.every((c) => el.classes.has(c))) roots.push(node);
    }
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'tokens', 'comments'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value.type === 'string') visit(value);
    }
  };
  visit(ast);
  if (!roots.length) throw new Error(`找不到根容器 ${rootSelector}`);
  return roots;
}

// 页面各分支 return 里，区块可能藏在条件渲染 / Fragment 里直出（登记口径即「直接子元素」）；
// 把 JSX 子级摊平成候选元素清单：穿过 ExpressionContainer / && / ?: / Fragment，收集其首层 JSXElement。
function flattenSlots(children) {
  const out = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'JSXElement') { out.push(node); return; }
    if (node.type === 'JSXExpressionContainer') { walk(node.expression); return; }
    if (node.type === 'JSXFragment') { (node.children ?? []).forEach(walk); return; }
    if (node.type === 'LogicalExpression') { walk(node.left); walk(node.right); return; }
    if (node.type === 'ConditionalExpression') { walk(node.consequent); walk(node.alternate); return; }
  };
  (children ?? []).forEach(walk);
  return out;
}

function checkPage(entry) {
  const findings = [];
  const file = resolve(ROOT, pageFile(entry.pageId));
  if (!existsSync(file)) {
    findings.push({ page: entry.pageId, kind: 'page-file-missing', detail: pageFile(entry.pageId) });
    return findings;
  }
  // 页面常有加载/错误早退分支，同一 class 的根容器出现多次：以「命中的登记区块最多」的分支为正选。
  // 另给页级回退：有的区块经本地渲染函数直出（如 binding 的 {renderResultArea()}），
  // 静态检查无法解析函数调用槽位，退回「本页文件内任一根分支在场即视为在场」（试运行口径，记录在报告 mode 字段）。
  const blockAlternatives = new Map(entry.blocks.map((block) => [block.id, parseSelectorAlternatives(block.selector)]));
  const rootCandidates = findRootCandidates(readFileSync(file, 'utf8'), entry.rootSelector);
  const rootChoices = rootCandidates.map((root) => {
    const children = flattenSlots(root.children).map(elementDescriptor);
    const score = entry.blocks.filter((block) => children.some((el) => blockAlternatives.get(block.id).some((alt) => matchTag(el, alt) && matchIdentity(el, alt)))).length;
    return { root, children, score };
  });
  const mainIndex = rootChoices.reduce((best, choice, i) => (choice.score > rootChoices[best].score ? i : best), 0);
  // 匹配宇宙 = 各根分支摊平子级 + 非主根的根自身（「结果为嵌套 .device-ops-stack」这类
  // 区块本体就是辅助渲染函数里的根；主根自身不卖，避免它总命中自己的类名选择器）。
  const pageWide = [
    ...rootChoices.flatMap((choice) => choice.children),
    ...rootChoices.filter((_, i) => i !== mainIndex).map((choice) => elementDescriptor(choice.root))
  ];
  const exactIn = (children, block) => children.some((el) => blockAlternatives.get(block.id).some((alt) => matchTag(el, alt) && matchIdentity(el, alt)));
  const present = (block) => exactIn(pageWide, block);
  // 结构改写只对有身份条件（attr/class）的选择器可判：裸标签选择器拿不到「标签被换」的证据。
  const drifted = (block) => !present(block) && pageWide.some((el) => blockAlternatives.get(block.id).some((alt) =>
    alt.tag && (alt.attrs.length > 0 || alt.classes.length > 0) && !matchTag(el, alt) && matchIdentity(el, alt)));
  const pattern = manifest.patterns[entry.patternId];
  const regionPresence = new Map(); // regionId -> 是否有任一对应区块在场
  for (const block of entry.blocks) {
    const isPresent = present(block);
    const isDrifted = drifted(block);
    if (block.region !== null) regionPresence.set(block.region.id ?? block.region, (regionPresence.get(block.region.id ?? block.region) ?? false) || isPresent || isDrifted);
    if (block.region === null || !block.region.locked) continue;
    if (isDrifted) {
      findings.push({ page: entry.pageId, block: block.id, region: block.region.id, kind: 'locked-region-structure-changed', detail: `${block.name}（${block.selector}）身份属性仍在但标签被改写（registered ${blockAlternatives.get(block.id).map(a => a.tag).join('/')}）` });
    } else if (!isPresent) {
      findings.push({ page: entry.pageId, block: block.id, region: block.region.id, kind: 'locked-region-missing', detail: `${block.name}（${block.selector}）在根容器直接子元素中缺失` });
    }
  }
  for (const [regionId, present] of regionPresence) {
    if (present) continue;
    const declared = (pattern?.regions ?? []).find((r) => r.id === regionId);
    if (declared?.requiredComponent) {
      findings.push({ page: entry.pageId, region: regionId, kind: 'required-component-absent', detail: `区域 ${regionId} 的必需组件 ${declared.requiredComponent} 缺席（该区域已登记的区块均不在场）` });
    }
  }
  return findings;
}

const targets = registries().filter((entry) => ONLY_PAGES.length === 0 || ONLY_PAGES.includes(entry.pageId));
const findings = targets.flatMap(checkPage);
const report = {
  mode: 'trial-report-only',
  root: ROOT.startsWith(kitRoot) ? ROOT.slice(kitRoot.length).replaceAll('\\', '/') : ROOT.replaceAll('\\', '/'),
  pages: targets.map((t) => t.pageId),
  findingCount: findings.length,
  findings
};
const text = JSON.stringify(report, null, 2) + '\n';
if (JSON_OUT) { mkdirSync(dirname(JSON_OUT), { recursive: true }); writeFileSync(JSON_OUT, text); }
console.log(existsSync(JSON_OUT ?? '') ? `check-page-mold: ${findings.length} 命中（报告已写 ${JSON_OUT}）` : text.trimEnd());
process.exit(ASSERT_NONE && findings.length > 0 ? 1 : 0);
