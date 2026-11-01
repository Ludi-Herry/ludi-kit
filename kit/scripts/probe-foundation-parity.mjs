#!/usr/bin/env node
// 四底座视觉一致探针（试运行，只报告不拦截，不接入 validate）。
// 在各底座同一路由上定位同一批语义测点，量取可见外框与计算样式，以 baseline 底座为参照输出差异。
// 定位只用角色、文字、占位符、表头名，不依赖组件库类名。
//
// 单页模式：node scripts/probe-foundation-parity.mjs --anchors quality/foundation-parity/anchors.devices.json --out <目录> [--self-check on]
// 多路由模式：node scripts/probe-foundation-parity.mjs --routes quality/foundation-parity/routes.tianshu.json --out <目录>
//   多路由模式在基准底座上自动发现测点，并对每条路由加一次基准自比（应 0 差异）。
//   测点类型见 design-systems/tianshu/controls.README.md「测点类型」。
// 样式值都带 px 时按数值比，差 0.01px 以内算一致（只消掉 25.1429px 对 25.14px 这类舍入噪声）。
// summary 另附整屏像素差（pixel）：与基准截图逐像素比，任一通道差超过 16/255 计为变化像素（口径同 visual-diff），只报告。
// 退出码：0 = 已出报告（无论差异多少）；2 = 输入或运行错误。

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const KIT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(KIT, 'package.json'));
const { chromium } = require('playwright');
const { decodePng } = await import('../visual-diff/lib/png.mjs');

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, cur, i, all) => {
  if (cur.startsWith('--')) acc.push([cur.slice(2), all[i + 1]]);
  return acc;
}, []));
if ((!args.anchors && !args.routes) || !args.out) {
  console.error('需要 --anchors 或 --routes，以及 --out');
  process.exit(2);
}
const sha = (text) => createHash('sha256').update(text).digest('hex');

const PX = /^-?\d+(\.\d+)?px$/;
const sameStyle = (a, b) => (PX.test(a) && PX.test(b) ? Math.abs(parseFloat(a) - parseFloat(b)) <= 0.01 : a === b);

const PIXEL_DELTA = 16;
function pixelDiff(basePath, candPath) {
  const a = decodePng(readFileSync(basePath));
  const b = decodePng(readFileSync(candPath));
  if (a.width !== b.width || a.height !== b.height) return { sizeMismatch: `${b.width}x${b.height} vs ${a.width}x${a.height}` };
  let changedPixels = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (Math.abs(a.data[i] - b.data[i]) > PIXEL_DELTA || Math.abs(a.data[i + 1] - b.data[i + 1]) > PIXEL_DELTA || Math.abs(a.data[i + 2] - b.data[i + 2]) > PIXEL_DELTA) changedPixels += 1;
  }
  const pixelCount = a.width * a.height;
  return { changedPixels, pixelCount, changedPixelRatio: Math.round((changedPixels / pixelCount) * 1e4) / 1e4 };
}
const outRoot = resolve(KIT, args.out);
mkdirSync(outRoot, { recursive: true });

// 浏览器内执行：定位测点并量取。
function measureInPage({ anchors: givenAnchors, structure, discover }) {
  const norm = (s) => (s || '').replace(/\s+/g, '').trim();
  const visible = (el) => {
    if (!el) return false;
    const b = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const box = (el) => {
    const b = el.getBoundingClientRect();
    const r = (n) => Math.round(n * 10) / 10;
    return { x: r(b.x + scrollX), y: r(b.y + scrollY), w: r(b.width), h: r(b.height) };
  };
  const painted = (el) => {
    const cs = getComputedStyle(el);
    if (Number(cs.opacity) === 0) return false;
    const border = ['Top', 'Right', 'Bottom', 'Left'].some((s) => parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none');
    const shadow = cs.boxShadow && cs.boxShadow !== 'none';
    const bg = cs.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor);
    return border || shadow || bg;
  };
  const isChoice = (el) => el.getAttribute('role') === 'radio' || (el.tagName === 'LABEL' && !!el.querySelector('input[type=radio]'));
  // 可见外框：用户看到的那条边框或底色所在的元素（antd 输入框的边框在外层包裹上）。
  const visualBox = (el) => {
    const a = el.getBoundingClientRect();
    const cx = a.x + a.width / 2;
    const cy = a.y + a.height / 2;
    const area = Math.max(a.width * a.height, 1);
    const cands = [el];
    if (isChoice(el)) {
      // 选项类控件（分段项、单选项）只量自身：未选中项本身无底色，往外爬会量成外层轨道。
      cands.push(...el.querySelectorAll('*'));
    } else {
      let p = el.parentElement;
      for (let i = 0; i < 3 && p; i += 1, p = p.parentElement) cands.push(p);
      if (el.parentElement) cands.push(...el.parentElement.querySelectorAll('*'));
    }
    // 不爬到表格单元格、行：行内文字链接本身无底色，量单元格会把行高误当成链接高。
    const ok = cands.filter((c) => c === el || !/^(TD|TH|TR|TBODY|THEAD|TABLE)$/.test(c.tagName)).filter((c) => visible(c) && painted(c)).filter((c) => {
      const b = c.getBoundingClientRect();
      const ca = b.width * b.height;
      return cx >= b.x - 0.5 && cx <= b.right + 0.5 && cy >= b.y - 0.5 && cy <= b.bottom + 0.5 && ca >= area * 0.5 && ca <= area * 12;
    });
    ok.sort((m, n) => {
      const bm = m.getBoundingClientRect();
      const bn = n.getBoundingClientRect();
      return bm.width * bm.height - bn.width * bn.height;
    });
    return ok[0] || el;
  };
  // 只比用户看得见的差异：颜色统一转成 sRGB 的 rgba（oklab、color-mix 与 rgb 写法不同但同色时视为一致）；
  // 边框宽度为 0 或样式为 none 时不比颜色与样式；全透明阴影视为无阴影。
  const cv = document.createElement('canvas');
  cv.width = 1; cv.height = 1;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const toRGBA = (c) => {
    if (!c || c === 'transparent') return 'rgba(0,0,0,0)';
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return a === 0 ? 'rgba(0,0,0,0)' : `rgba(${r},${g},${b},${Math.round((a / 255) * 100) / 100})`;
  };
  const COLOR_KEYS = ['backgroundColor', 'borderTopColor', 'borderBottomColor', 'color'];
  const style = (el, keys) => {
    const cs = getComputedStyle(el);
    const o = Object.fromEntries(keys.map((k) => [k, cs[k]]));
    for (const k of COLOR_KEYS) if (k in o) o[k] = toRGBA(o[k]);
    if ('borderTopWidth' in o && (parseFloat(o.borderTopWidth) === 0 || o.borderTopStyle === 'none')) { o.borderTopWidth = '0px'; o.borderTopStyle = 'none'; o.borderTopColor = 'n/a'; }
    if ('borderBottomWidth' in o && (parseFloat(o.borderBottomWidth) === 0 || cs.borderBottomStyle === 'none')) { o.borderBottomWidth = '0px'; o.borderBottomColor = 'n/a'; }
    if ('boxShadow' in o && (o.boxShadow === 'none' || o.boxShadow.split(/,(?![^(]*\))/).every((s) => /rgba\(0, 0, 0, 0\)|transparent/.test(s) || /oklab\([^)]*\/ 0\)/.test(s)))) o.boxShadow = 'none';
    return o;
  };
  const BOX_KEYS = ['backgroundColor', 'borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderBottomWidth', 'borderBottomColor', 'borderTopLeftRadius', 'boxShadow', 'paddingLeft', 'paddingTop', 'paddingRight', 'paddingBottom'];
  const TEXT_KEYS = ['fontSize', 'fontWeight', 'lineHeight', 'color', 'fontFamily'];

  // 直接承载该文字的元素（文字常与图标并列，元素本身不一定是叶子）。
  const ownText = (e) => norm([...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(''));
  const textHolders = (name) => [...document.querySelectorAll('body *')].filter((e) => visible(e) && ownText(e).startsWith(norm(name)));
  const allButtons = () => [...document.querySelectorAll('button,[role=button],[role=tab],[role=radio],a')].filter(visible);
  // 表头只算列头；tbody 里的 th 是详情描述列表的标签（行头），另列为 desc 测点。
  const isRowHeader = (th) => th.tagName === 'TH' && !th.closest('thead') && th.getAttribute('role') !== 'columnheader';
  const headers = () => [...document.querySelectorAll('th,[role=columnheader]')].filter((h) => visible(h) && !isRowHeader(h));
  const rowHeaders = () => [...document.querySelectorAll('th')].filter((h) => visible(h) && isRowHeader(h));
  const bodyRows = () => {
    const trs = [...document.querySelectorAll('tbody tr')].filter((tr) => tr.querySelector(':scope > td') && !tr.querySelector(':scope > th') && visible(tr.querySelector('td')));
    if (trs.length) return trs;
    return [...document.querySelectorAll('[role=row]')].filter((r) => r.querySelector('[role=cell],[role=gridcell]'));
  };
  const cellsOf = (row) => [...row.querySelectorAll(':scope > td, :scope > [role=cell], :scope > [role=gridcell]')];
  const textEl = (el) => {
    // 取承载文字的最内层可见元素，用于文字样式。
    let best = el;
    for (const c of el.querySelectorAll('*')) {
      if (visible(c) && norm(c.textContent) === norm(el.textContent) && c.children.length === 0) { best = c; break; }
    }
    return best;
  };
  // 第一个直接带文字的可见元素（下拉框的占位或已选值、单选项的标签文字）。
  const ownTextEl = (root) => [root, ...root.querySelectorAll('*')].find((e) => visible(e) && ownText(e)) || root;

  // 下拉选择框：ARIA combobox。antd 的 combobox 是框内的小输入框，边框在外层；shadcn 的是触发按钮本身。
  const comboboxes = () => [...document.querySelectorAll('[role=combobox]')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; });
  const comboTrigger = (cb) => {
    let p = cb;
    for (let i = 0; i < 5 && p; i += 1, p = p.parentElement) {
      if (visible(p) && painted(p) && p.getBoundingClientRect().height >= 24) return p;
    }
    return cb;
  };

  // 单选项：带一个可见小圆圈的选项（分段控制器的选项没有圆圈，不算）。
  const choiceEls = () => [...document.querySelectorAll('label,[role=radio]')].filter((e) => visible(e) && isChoice(e));
  const radioIndicator = (el) => [el, ...el.querySelectorAll('*')].filter((c) => visible(c) && painted(c)).find((c) => {
    const b = c.getBoundingClientRect();
    return b.width >= 10 && b.width <= 24 && Math.abs(b.width - b.height) <= 1 && parseFloat(getComputedStyle(c).borderTopLeftRadius) >= b.width / 2 - 1;
  }) || null;
  const forLabel = (e) => (e.id ? document.querySelector(`label[for="${CSS.escape(e.id)}"]`) : null);
  const choiceTextEl = (e) => (norm(e.textContent) ? e : forLabel(e) || e.parentElement || e);
  const choiceText = (e) => norm(choiceTextEl(e).textContent);

  // 分页：与「共 N 条」同一行、在它右侧的可点击项；数字是页码，数字左右的无字按钮是上一页、下一页。
  const pagerRow = (t) => {
    const tb = t.getBoundingClientRect();
    const cy = tb.y + tb.height / 2;
    const clickable = 'a,button,[role=button],[role=link]';
    return [...document.querySelectorAll(`${clickable},li`)].filter((e) => {
      if (!visible(e) || e.getAttribute('role') === 'combobox' || e.closest('[role=combobox]')) return false;
      if (!e.matches(clickable) && (e.querySelector(clickable) || (getComputedStyle(e).cursor !== 'pointer' && !e.hasAttribute('aria-current')))) return false;
      const b = e.getBoundingClientRect();
      return Math.abs(b.y + b.height / 2 - cy) <= 16 && b.x >= tb.x;
    });
  };
  // 分页总数：「共 N 条」且同一行右侧有页码。工具栏里同样写「共 N 条」的列表计数不算（见 count:list）。
  const pagerTotal = () => {
    const els = [...document.querySelectorAll('body *')].filter((e) => visible(e) && /^共\s*\d+\s*条$/.test((e.textContent || '').trim()));
    els.sort((m, n) => m.textContent.length - n.textContent.length);
    return els.find((e) => pagerRow(e).some((x) => /^\d+$/.test(norm(x.textContent)))) || null;
  };
  // 列表计数：工具栏里「共 N 台设备 / 条工单」这类汇总文字，不是分页总数。
  const listCount = () => {
    const pt = pagerTotal();
    const els = [...document.querySelectorAll('body *')].filter((e) => visible(e) && inMain(e) && /^共\s*(\d+|—|-)\s*\S/.test((e.textContent || '').trim()) && (e.textContent || '').trim().length <= 24 && !(pt && (pt === e || pt.contains(e) || e.contains(pt))));
    els.sort((m, n) => m.textContent.length - n.textContent.length || (m.compareDocumentPosition(n) & 4 ? -1 : 1));
    return els.find((e) => ![...e.children].some((c) => (c.textContent || '').trim() === (e.textContent || '').trim())) || null;
  };
  const pagerItem = (which) => {
    const t = pagerTotal();
    if (!t) return null;
    const items = pagerRow(t);
    const nums = items.filter((e) => /^\d+$/.test(norm(e.textContent)));
    if (/^\d+$/.test(which)) return nums.find((e) => norm(e.textContent) === which) || null;
    if (!nums.length) return null;
    const first = nums[0].getBoundingClientRect().x;
    const last = nums[nums.length - 1].getBoundingClientRect().x;
    const empties = items.filter((e) => !norm(e.textContent));
    if (which === 'prev') return empties.filter((e) => e.getBoundingClientRect().x < first).pop() || null;
    if (which === 'next') return empties.find((e) => e.getBoundingClientRect().x > last) || null;
    return null;
  };

  // 第一段可见文字相对 frame 左上角的偏移（取文字本身的排版框，不受包裹元素影响）。
  const textInset = (frame) => {
    const walker = document.createTreeWalker(frame, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent.trim() && visible(n.parentElement) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
    const node = walker.nextNode();
    if (!node) return null;
    const range = document.createRange();
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    const f = frame.getBoundingClientRect();
    const round = (n) => Math.round(n * 10) / 10;
    return { x: round(r.left - f.left), y: round(r.top - f.top) };
  };
  // 分段控制器的轨道：选项外层第一个有底色或描边、且高度与选项相近的元素；找不到时取直接父元素（无底色即与有轨道的一端不同）。
  const choiceTrack = (item) => {
    const ib = item.getBoundingClientRect();
    let p = item.parentElement;
    for (let i = 0; i < 3 && p; i += 1, p = p.parentElement) {
      const b = p.getBoundingClientRect();
      if (visible(p) && painted(p) && b.height <= ib.height + 16) return p;
    }
    return item.parentElement;
  };

  // 壳层：侧栏是左边贴边、高度占满的 aside；顶栏是右侧最上方的 header。
  const shellSider = () => [...document.querySelectorAll('aside')].find((e) => visible(e) && e.getBoundingClientRect().x < 1 && e.getBoundingClientRect().width < 320) || null;
  const shellHeader = () => [...document.querySelectorAll('header')].find((e) => visible(e) && e.getBoundingClientRect().y < 1 && e.getBoundingClientRect().x >= 200) || null;
  const shellLocate = (loc) => {
    if (loc.value === 'sider') return shellSider();
    if (loc.value === 'header') return shellHeader();
    if (loc.value === 'search') return shellHeader()?.querySelector('input') || null;
    if (loc.value === 'breadcrumb') return shellHeader()?.querySelector('nav') || null;
    const sider = shellSider();
    if (!sider) return null;
    const holder = [...sider.querySelectorAll('*')].find((e) => visible(e) && ownText(e) === norm(loc.text));
    if (!holder) return null;
    // antd 菜单项（role=menuitem）里还包着一层链接，先取菜单项本身；shadcn 侧栏没有该角色，取链接或按钮。
    return loc.value === 'nav' ? holder.closest('[role=menuitem]') || holder.closest('a,button') || holder : holder;
  };
  // 与同组下一项的水平间距（页签、分段项、单选项）：同一 tablist / radiogroup / group 内，下一个同类元素的左边减本元素右边。
  const gapToNext = (el) => {
    const role = isChoice(el) ? 'choice' : el.getAttribute('role');
    if (role !== 'tab' && role !== 'choice') return null;
    const group = el.closest('[role=tablist],[role=radiogroup],[role=group]') || el.parentElement;
    if (!group) return null;
    const peers = [...group.querySelectorAll(role === 'tab' ? '[role=tab]' : 'label,[role=radio]')].filter((p) => visible(p) && (role === 'tab' || isChoice(p)));
    const i = peers.indexOf(el);
    if (i < 0 || i === peers.length - 1) return null;
    return Math.round((peers[i + 1].getBoundingClientRect().left - el.getBoundingClientRect().right) * 10) / 10;
  };

  // 描述列表的值：横排时是标签右边的单元格；竖排（标签一行、值一行）时是下一行同一列。
  const descValue = (th) => {
    if (th.nextElementSibling?.tagName === 'TD') return th.nextElementSibling;
    const row = th.parentElement;
    const next = row?.nextElementSibling;
    if (!next) return null;
    return next.children[[...row.children].indexOf(th)] || null;
  };

  // 状态：选中 / 禁用，供规格区分选中项与未选中项；不参与差异比对。
  const stateOf = (el) => {
    const attr = (n) => el.getAttribute(n);
    const input = el.matches('input') ? el : el.querySelector('input[type=radio],input[type=checkbox]');
    const ds = attr('data-state');
    const sel = attr('aria-selected') ?? attr('aria-checked') ?? attr('aria-pressed') ?? (attr('aria-current') ? 'true' : null)
      ?? (input ? String(input.checked) : null) ?? (ds === 'on' || ds === 'active' || ds === 'checked' ? 'true' : ds === 'off' || ds === 'inactive' || ds === 'unchecked' ? 'false' : null);
    return { role: attr('role') || el.tagName.toLowerCase(), selected: sel === null ? null : sel === 'true', disabled: el.matches(':disabled') || attr('aria-disabled') === 'true' };
  };

  const locate = (loc) => {
    switch (loc.by) {
      case 'h1': return document.querySelector('h1');
      case 'placeholder': return [...document.querySelectorAll('input,textarea')].find((e) => visible(e) && e.getAttribute('placeholder') === loc.value) || null;
      case 'button': {
        const name = norm(loc.name);
        const hits = allButtons().filter((b) => norm(b.textContent) === name || norm(b.getAttribute('aria-label')) === name);
        return hits[0] || null;
      }
      case 'columnheader': return headers().find((h) => norm(h.textContent) === norm(loc.name)) || null;
      case 'checkbox': {
        const cbs = [...document.querySelectorAll('input[type=checkbox],[role=checkbox]')].filter((c) => {
          const b = c.getBoundingClientRect();
          return b.width > 0 && b.height > 0;
        });
        return cbs[loc.index] || null;
      }
      case 'cell': {
        const hs = headers();
        const col = hs.findIndex((h) => norm(h.textContent) === norm(loc.column));
        const row = bodyRows()[loc.row];
        if (col < 0 || !row) return null;
        const cell = cellsOf(row)[col];
        if (!cell) return null;
        if (loc.inner === 'tag') {
          const inner = [...cell.querySelectorAll('*')].filter((c) => visible(c) && painted(c) && norm(c.textContent));
          return inner[0] || null;
        }
        return cell;
      }
      case 'text': {
        const name = norm(loc.value);
        // 优先主内容区：左侧导航有同名菜单项。选项类测点（prefer: clickable）再优先可点击元素，因为页面标题也可能同名（如「全部设备」）。
        const holders = textHolders(name);
        const leaf = (loc.prefer === 'clickable' && holders.find((h) => inMain(h) && h.closest('button,[role=button],[role=radio],[role=tab],label'))) || holders.find(inMain) || holders[0];
        if (leaf) return leaf.closest('button,[role=button],[role=radio],[role=tab],label') || leaf;
        // 文字被拆在多个子元素里（如「运行异常」+ 角标「默认」）时，按整体文字匹配可点击元素。
        return [...allButtons(), ...choiceLabels()].find((e) => norm(e.textContent) === name) || null;
      }
      case 'textPattern': {
        const re = new RegExp(loc.value);
        const els = [...document.querySelectorAll('body *')].filter((e) => visible(e) && re.test((e.textContent || '').trim()));
        els.sort((m, n) => m.textContent.length - n.textContent.length);
        return els[0] || null;
      }
      case 'select': return comboboxes().find((cb) => norm(comboTrigger(cb).textContent) === norm(loc.value)) || null;
      case 'radio': return choiceEls().find((e) => radioIndicator(e) && choiceText(e) === norm(loc.value)) || null;
      case 'pager': return loc.value === 'total' ? pagerTotal() : pagerItem(loc.value);
      case 'count': return listCount();
      case 'shell': return shellLocate(loc);
      case 'region': return [...document.querySelectorAll('section[aria-label], form[aria-label], [role=region][aria-label], [role=search][aria-label]')].find((e) => visible(e) && norm(e.getAttribute('aria-label')) === norm(loc.value)) || null;
      case 'choicegroup': {
        const item = choiceEls().find((e) => choiceText(e) === norm(loc.value));
        return item ? choiceTrack(item) : null;
      }
      case 'desc': {
        const label = rowHeaders().find((h) => norm(h.textContent) === norm(loc.label));
        if (!label) return null;
        return loc.value ? descValue(label) : label;
      }
      default: return null;
    }
  };

  // 主内容区：排除左侧导航与顶栏（壳层在工作台路由另测）。
  const inMain = (el) => {
    const b = el.getBoundingClientRect();
    return b.x + scrollX >= 240 && b.y + scrollY >= 56;
  };
  const choiceLabels = () => [...document.querySelectorAll('label')].filter((l) => visible(l) && l.querySelector('input[type=radio]'));
  // 结构比对只看可见文字；只有无障碍名称（aria-label）的另列，不算视觉差异。
  const interactiveNames = (ariaOnly = false) => {
    const names = [];
    for (const el of [...allButtons(), ...choiceLabels()]) {
      if (!inMain(el)) continue;
      const visibleText = norm(el.textContent);
      const n = ariaOnly ? (visibleText ? '' : norm(el.getAttribute('aria-label'))) : visibleText;
      if (n && n.length <= 24 && !names.includes(n)) names.push(n);
    }
    return names;
  };

  // 自动发现：在基准底座上按语义收集测点，其他底座用同一组定位去找。
  const discoverAnchors = () => {
    const out = [{ id: 'h1', slice: 'page', locate: { by: 'h1' } }];
    const used = new Set();
    // 表格里只取首行的可点击项，其余行是同一控件的数据重复。
    const firstRow = bodyRows()[0];
    const notLaterRow = (el) => {
      const row = el.closest('tbody tr, [role=row]');
      return !row || row === firstRow || !row.querySelector('td,[role=cell],[role=gridcell]');
    };
    for (const el of allButtons().filter((e) => inMain(e) && notLaterRow(e))) {
      const n = norm(el.textContent);
      // 纯数字是分页页码，另列为 pager 测点。
      if (!n || n.length > 16 || used.has(n) || /^\d+$/.test(n)) continue;
      used.add(n);
      out.push({ id: `btn:${n}`, slice: 'button', locate: { by: 'button', name: n } });
      if (out.length > 32) break;
    }
    for (const l of choiceLabels().filter(inMain)) {
      const n = norm(l.textContent);
      if (!n || used.has(n)) continue;
      used.add(n);
      out.push({ id: `choice:${n}`, slice: 'button', locate: { by: 'text', value: n, prefer: 'clickable' } });
    }
    const phs = new Set();
    for (const e of [...document.querySelectorAll('input,textarea')].filter((x) => visible(x) && inMain(x))) {
      const p = e.getAttribute('placeholder');
      if (p && !phs.has(p)) { phs.add(p); out.push({ id: `ph:${p}`, slice: 'input', locate: { by: 'placeholder', value: p } }); }
    }
    const hs = headers().filter(inMain).map((h) => norm(h.textContent)).filter(Boolean);
    const row0 = bodyRows()[0];
    for (const h of hs.slice(0, 12)) {
      out.push({ id: `th:${h}`, slice: 'table', locate: { by: 'columnheader', name: h } });
      if (row0) {
        out.push({ id: `cell:${h}`, slice: 'table', locate: { by: 'cell', column: h, row: 0 } });
        const col = headers().findIndex((x) => norm(x.textContent) === h);
        const cell = cellsOf(row0)[col];
        if (cell && [...cell.querySelectorAll('*')].some((c) => visible(c) && painted(c) && norm(c.textContent))) {
          out.push({ id: `tag:${h}`, slice: 'table', locate: { by: 'cell', column: h, row: 0, inner: 'tag' } });
        }
      }
    }
    const cbs = [...document.querySelectorAll('input[type=checkbox],[role=checkbox]')].filter((c) => c.getBoundingClientRect().width > 0 && inMain(c));
    cbs.slice(0, 2).forEach((_, i) => out.push({ id: `cb:${i}`, slice: 'input', locate: { by: 'checkbox', index: i } }));
    // 表单标签与区块标题（字重 ≥ 600 的短文字），覆盖表单页、卡片标题、详情分组。
    const seen = new Set([...used]);
    let titles = 0;
    for (const e of document.querySelectorAll('main *, body *')) {
      if (titles >= 16) break;
      if (!visible(e) || !inMain(e) || e.closest('button,[role=button],a,th,td')) continue;
      const t = ownText(e);
      if (!t || t.length < 2 || t.length > 12 || seen.has(t)) continue;
      const isLabel = e.tagName === 'LABEL';
      const heavy = parseInt(getComputedStyle(e).fontWeight, 10) >= 600 && e.tagName !== 'H1';
      if (!isLabel && !heavy) continue;
      seen.add(t);
      titles += 1;
      out.push({ id: `${isLabel ? 'label' : 'title'}:${t}`, slice: isLabel ? 'form' : 'title', locate: { by: 'text', value: t } });
    }
    if (pagerTotal()) {
      out.push({ id: 'pager:total', slice: 'pager', locate: { by: 'pager', value: 'total' } });
      for (const w of ['prev', '1', '2', 'next']) if (pagerItem(w)) out.push({ id: `pager:${w}`, slice: 'pager', locate: { by: 'pager', value: w } });
    }
    if (listCount()) out.push({ id: 'count:list', slice: 'toolbar', locate: { by: 'count' } });
    // 下拉选择框：按框内显示的文字（占位或已选值）命名。
    const sels = new Set();
    for (const cb of comboboxes()) {
      const trig = comboTrigger(cb);
      const t = norm(trig.textContent);
      if (!inMain(trig) || !t || sels.has(t)) continue;
      sels.add(t);
      out.push({ id: `select:${t}`, slice: 'input', locate: { by: 'select', value: t } });
    }
    // 页面区块：带 aria-label 的 section / form / region / search（如「筛选」「设备列表」），量外框与文字内缩（即用户看到的留白，
    // 不管内边距写在区块本身还是里层元素上）。区块尺寸与留白属于结构，第 4 阶段起纳入规格。
    const regions = new Set();
    for (const e of document.querySelectorAll('section[aria-label], form[aria-label], [role=region][aria-label], [role=search][aria-label]')) {
      const b = e.getBoundingClientRect();
      const n = norm(e.getAttribute('aria-label'));
      if (!n || regions.has(n) || !visible(e) || !inMain(e) || b.width < 200 || b.height < 28) continue;
      regions.add(n);
      out.push({ id: `region:${n}`, slice: 'region', locate: { by: 'region', value: n } });
    }
    // 分段控制器轨道：每组一个测点，按组内第一项文字命名（单选组没有轨道，不记）。
    const tracks = new Set();
    for (const e of choiceEls().filter(inMain)) {
      if (radioIndicator(e)) continue;
      const t = choiceTrack(e);
      if (!t || tracks.has(t)) continue;
      tracks.add(t);
      const first = choiceEls().find((x) => t.contains(x));
      const name = first && choiceText(first);
      if (name) out.push({ id: `choicegroup:${name}`, slice: 'button', locate: { by: 'choicegroup', value: name } });
    }
    // 单选项：量圆圈，文字样式取标签。
    const rads = new Set();
    for (const e of choiceEls().filter(inMain)) {
      const t = choiceText(e);
      if (!t || rads.has(t) || !radioIndicator(e)) continue;
      rads.add(t);
      out.push({ id: `radio:${t}`, slice: 'input', locate: { by: 'radio', value: t } });
    }
    // 详情描述列表：标签与值。
    const descs = new Set();
    for (const th of rowHeaders().filter(inMain)) {
      const t = norm(th.textContent);
      if (!t || descs.has(t) || descs.size >= 12) continue;
      descs.add(t);
      out.push({ id: `desc:${t}`, slice: 'detail', locate: { by: 'desc', label: t } });
      if (descValue(th)) out.push({ id: `descval:${t}`, slice: 'detail', locate: { by: 'desc', label: t, value: true } });
    }
    // 壳层（第 4 阶段起纳入）：侧栏、顶栏、侧栏里的导航项与分组标题、顶栏搜索框与面包屑。
    const sider = shellSider();
    if (sider) {
      out.push({ id: 'shell:sider', slice: 'shell', locate: { by: 'shell', value: 'sider' } });
      const navSeen = new Set();
      for (const e of sider.querySelectorAll('*')) {
        const t = ownText(e);
        if (!t || navSeen.has(t) || !visible(e) || e.getBoundingClientRect().y < 56) continue;
        navSeen.add(t);
        const item = e.closest('a,button,[role=menuitem]');
        out.push(item && sider.contains(item)
          ? { id: `nav:${t}`, slice: 'shell', locate: { by: 'shell', value: 'nav', text: t } }
          : { id: `navgroup:${t}`, slice: 'shell', locate: { by: 'shell', value: 'navgroup', text: t } });
      }
    }
    if (shellHeader()) {
      out.push({ id: 'shell:header', slice: 'shell', locate: { by: 'shell', value: 'header' } });
      if (shellHeader().querySelector('input')) out.push({ id: 'topbar:search', slice: 'shell', locate: { by: 'shell', value: 'search' } });
      if (shellHeader().querySelector('nav')) out.push({ id: 'topbar:breadcrumb', slice: 'shell', locate: { by: 'shell', value: 'breadcrumb' } });
    }
    return out;
  };
  const anchors = discover ? discoverAnchors() : givenAnchors;

  // 退路：主定位找不到时按文字找（同一内容、不同元素类型，例如 antd 描述列表用 th/td、其他底座用 dt/dd）。
  const clickable = 'button,[role=button],[role=radio],[role=tab],[role=menuitem],label,a';
  const fallback = (loc) => {
    if (loc.by === 'button') {
      const t = textHolders(loc.name).find((e) => norm(e.textContent) === norm(loc.name)) || textHolders(loc.name)[0];
      return t ? (t.closest(clickable) || t) : null;
    }
    if (loc.by === 'columnheader') return textHolders(loc.name).find((e) => ownText(e) === norm(loc.name)) || null;
    if (loc.by === 'cell') {
      const label = textHolders(loc.column).find((e) => ownText(e) === norm(loc.column));
      if (!label) return null;
      let value = label.nextElementSibling;
      if (!value && label.parentElement) value = label.parentElement.nextElementSibling;
      if (!value || !visible(value)) return null;
      if (loc.inner === 'tag') return [...value.querySelectorAll('*')].find((c) => visible(c) && painted(c) && norm(c.textContent)) || null;
      return value;
    }
    // 下拉框没有 combobox 角色时（如原生 select 或普通按钮），按显示文字找可点击元素。
    if (loc.by === 'select') {
      return textHolders(loc.value).filter((e) => ownText(e) === norm(loc.value))
        .map((e) => e.closest('button,[role=button],select'))
        .find((b) => b && inMain(b) && b.getBoundingClientRect().height <= 48) || null;
    }
    // 描述列表用 dt/dd 等其他元素时，按标签文字找，值取下一个兄弟元素。
    if (loc.by === 'desc') {
      const label = textHolders(loc.label).find((e) => ownText(e) === norm(loc.label));
      if (!label) return null;
      if (!loc.value) return label;
      return label.nextElementSibling || label.parentElement?.nextElementSibling || null;
    }
    return null;
  };

  const results = {};
  for (const a of anchors) {
    let el = locate(a.locate);
    let viaFallback = false;
    if (!el || !visible(el)) {
      const fb = fallback(a.locate);
      if (fb && visible(fb)) { el = fb; viaFallback = true; }
    }
    if (!el || !visible(el) && a.locate.by !== 'checkbox') { results[a.id] = { found: false }; continue; }
    let vb;
    let tx = textEl(el);
    if (a.locate.by === 'select') { vb = comboTrigger(el); tx = ownTextEl(vb); }
    else if (a.locate.by === 'radio') { vb = radioIndicator(el) || el; tx = ownTextEl(choiceTextEl(el)); }
    else if (a.locate.by === 'columnheader' || a.locate.by === 'desc' || a.locate.by === 'choicegroup' || a.locate.by === 'region' || (a.locate.by === 'shell' && a.locate.value !== 'nav' && a.locate.value !== 'search') || (a.locate.by === 'cell' && !a.locate.inner)) vb = el;
    else vb = visualBox(el);
    results[a.id] = {
      found: true,
      box: box(vb),
      boxStyle: style(vb, BOX_KEYS),
      text: style(tx, TEXT_KEYS),
      // 文字离可见外框左上角的距离：内边距写在内层元素上时（如 antd 分段项），boxStyle.padding 量不到留白，这里能量到。
      textInset: a.locate.by === 'radio' ? null : textInset(vb),
      // 与同组下一项的间距（页签、分段项、单选项），不参与差异比对，供规格的 gapX 使用。
      gapToNext: gapToNext(el),
      label: norm((a.locate.by === 'radio' ? choiceTextEl(el) : a.locate.by === 'select' ? vb : el).textContent).slice(0, 20),
      state: stateOf(el),
      // 表格结构（第 4 阶段结构合同用）：对齐方式与是否固定列。不参与差异比对。
      layout: a.locate.by === 'columnheader' || a.locate.by === 'cell'
        ? { align: getComputedStyle(vb).textAlign.replace(/^start$/, 'left').replace(/^end$/, 'right'), sticky: getComputedStyle(vb).position === 'sticky' }
        : undefined,
      viaFallback
    };
  }
  const struct = {
    columnheaders: headers().map((h) => norm(h.textContent)),
    buttonNames: interactiveNames(),
    ariaOnlyNames: interactiveNames(true),
    buttonsPresent: Object.fromEntries((structure?.buttonNames || []).map((n) => [n, textHolders(n).some((e) => e.closest('button,[role=button],[role=radio],[role=radiogroup],[role=tab],label'))])),
    bodyRowsVisible: bodyRows().length,
    docWidth: document.documentElement.scrollWidth,
    viewportWidth: innerWidth
  };
  return { results, struct, anchors };
}

const NEG_CSS = 'button{min-height:38px!important} th{background-color:rgb(255,0,0)!important}';

// 量一条路由：基准先量（多路由模式下顺带发现测点），其他底座用同一组测点。
async function runRoute(browser, { foundations, baseline, route, viewport, anchors, structure, tolerance, outDir, injections = {} }) {
  mkdirSync(outDir, { recursive: true });
  const raw = {};
  const errors = [];
  const order = [baseline, ...Object.keys(foundations).filter((n) => n !== baseline)];
  let useAnchors = anchors;
  for (const name of order) {
    const page = await browser.newPage({ viewport });
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
    try {
      await page.goto(`${foundations[name]}${route}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForSelector('h1', { timeout: 15000 }).catch(() => {});
      if (injections[name]) await page.addStyleTag({ content: injections[name] });
      await page.waitForTimeout(800);
      const discover = !useAnchors && name === baseline;
      raw[name] = await page.evaluate(measureInPage, { anchors: useAnchors, structure, discover });
      if (discover) useAnchors = raw[name].anchors;
      raw[name].consoleErrors = consoleErrors;
      await page.screenshot({ path: resolve(outDir, `${name}.png`), fullPage: false });
    } catch (e) {
      errors.push({ foundation: name, error: String(e.message || e).slice(0, 300) });
    } finally {
      await page.close();
    }
  }
  if (errors.length) return { errors };

  const tol = tolerance.geometryPx;
  const base = raw[baseline].results;
  const diffs = [];
  for (const a of useAnchors) {
    const b = base[a.id];
    if (!b?.found) continue;
    for (const [name, data] of Object.entries(raw)) {
      if (name === baseline) continue;
      const c = data.results[a.id];
      const push = (prop, expected, actual, kind) => diffs.push({ anchor: a.id, slice: a.slice, foundation: name, prop, kind, expected, actual });
      if (!b?.found || !c?.found) {
        if (b?.found !== c?.found) push('found', !!b?.found, !!c?.found, 'structure');
        continue;
      }
      if (c.viaFallback && !b.viaFallback) push('elementType', 'primary-locator', 'text-fallback', 'structure');
      for (const k of ['x', 'y', 'w', 'h']) {
        if (Math.abs(b.box[k] - c.box[k]) > tol) push(`box.${k}`, b.box[k], c.box[k], 'geometry');
      }
      for (const [k, v] of Object.entries(b.boxStyle)) if (!sameStyle(v, c.boxStyle[k])) push(`box.${k}`, v, c.boxStyle[k], 'style');
      for (const [k, v] of Object.entries(b.text)) if (!sameStyle(v, c.text[k])) push(`text.${k}`, v, c.text[k], 'style');
    }
  }
  const structDiffs = [];
  const bs = raw[baseline].struct;
  for (const [name, data] of Object.entries(raw)) {
    if (name === baseline) continue;
    const s = data.struct;
    if (JSON.stringify(s.columnheaders) !== JSON.stringify(bs.columnheaders)) structDiffs.push({ foundation: name, prop: 'columnheaders', expected: bs.columnheaders, actual: s.columnheaders });
    const missing = bs.buttonNames.filter((n) => !s.buttonNames.includes(n));
    const extra = s.buttonNames.filter((n) => !bs.buttonNames.includes(n));
    if (missing.length) structDiffs.push({ foundation: name, prop: 'buttons.missing', expected: [], actual: missing });
    if (extra.length) structDiffs.push({ foundation: name, prop: 'buttons.extra', expected: [], actual: extra });
    const ariaMissing = bs.ariaOnlyNames.filter((n) => !s.ariaOnlyNames.includes(n));
    const ariaExtra = s.ariaOnlyNames.filter((n) => !bs.ariaOnlyNames.includes(n));
    if (ariaMissing.length || ariaExtra.length) structDiffs.push({ foundation: name, prop: 'a11yNames', kind: 'a11y', expected: [], actual: { missing: ariaMissing, extra: ariaExtra } });
    for (const [btn, present] of Object.entries(bs.buttonsPresent || {})) {
      if (present !== s.buttonsPresent[btn]) structDiffs.push({ foundation: name, prop: `button:${btn}`, expected: present, actual: s.buttonsPresent[btn] });
    }
    if (s.docWidth > s.viewportWidth) structDiffs.push({ foundation: name, prop: 'horizontalOverflow', expected: false, actual: `${s.docWidth}>${s.viewportWidth}` });
  }
  // 基准自己都没找到的测点不计入（否则会被当成「一致」），单独列出。
  const baselineMissing = useAnchors.filter((a) => !base[a.id]?.found).map((a) => a.id);
  const summary = Object.fromEntries(Object.keys(raw).filter((n) => n !== baseline).map((n) => {
    const mine = diffs.filter((d) => d.foundation === n);
    return [n, {
      anchorsMeasured: useAnchors.length - baselineMissing.length,
      baselineMissing,
      anchorsMismatched: new Set(mine.map((d) => d.anchor)).size,
      propMismatches: mine.length,
      byKind: mine.reduce((acc, d) => { acc[d.kind] = (acc[d.kind] || 0) + 1; return acc; }, {}),
      structureMismatches: structDiffs.filter((d) => d.foundation === n).length,
      consoleErrors: raw[n].consoleErrors.length,
      pixel: pixelDiff(resolve(outDir, `${baseline}.png`), resolve(outDir, `${n}.png`))
    }];
  }));
  return { summary, diffs, structDiffs, raw, anchors: useAnchors };
}

const browser = await chromium.launch({ channel: 'msedge', headless: true, timeout: 30000 });
let failed = false;
try {
  if (args.anchors) {
    const anchorsRaw = readFileSync(resolve(KIT, args.anchors), 'utf8');
    const spec = JSON.parse(anchorsRaw);
    const foundations = { ...spec.foundations };
    const injections = {};
    if (args['self-check'] === 'on') {
      foundations[`${spec.baseline}-self`] = foundations[spec.baseline];
      foundations[`${spec.baseline}-neg`] = foundations[spec.baseline];
      injections[`${spec.baseline}-neg`] = NEG_CSS;
    }
    const r = await runRoute(browser, { ...spec, foundations, outDir: outRoot, injections });
    if (r.errors) {
      failed = true;
      writeFileSync(resolve(outRoot, 'errors.json'), JSON.stringify(r.errors, null, 2));
      console.error('运行错误：', JSON.stringify(r.errors));
    } else {
      const report = { probe: 'foundation-parity', mode: 'trial-run-report-only', recordedAt: new Date().toISOString(), route: spec.route, baseline: spec.baseline, tolerance: spec.tolerance, anchors: { path: args.anchors, sha256: sha(anchorsRaw) }, summary: r.summary, diffs: r.diffs, structDiffs: r.structDiffs, raw: r.raw };
      writeFileSync(resolve(outRoot, 'parity-report.json'), JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ summary: r.summary, structDiffs: r.structDiffs.length, out: args.out }, null, 2));
    }
  } else {
    const routesRaw = readFileSync(resolve(KIT, args.routes), 'utf8');
    const spec = JSON.parse(routesRaw);
    const overall = {};
    for (const rt of spec.routes) {
      const foundations = { ...spec.foundations, [`${spec.baseline}-self`]: spec.foundations[spec.baseline] };
      const outDir = resolve(outRoot, rt.id);
      const r = await runRoute(browser, { foundations, baseline: spec.baseline, route: `${spec.basePath}${rt.path}`, viewport: spec.viewport, anchors: null, structure: null, tolerance: spec.tolerance, outDir });
      if (r.errors) {
        failed = true;
        overall[rt.id] = { errors: r.errors };
        console.error(rt.id, '运行错误', JSON.stringify(r.errors));
        continue;
      }
      writeFileSync(resolve(outDir, 'parity-report.json'), JSON.stringify({ probe: 'foundation-parity', mode: 'trial-run-report-only-auto-discover', recordedAt: new Date().toISOString(), route: rt.path, baseline: spec.baseline, tolerance: spec.tolerance, anchors: r.anchors, summary: r.summary, diffs: r.diffs, structDiffs: r.structDiffs, raw: r.raw }, null, 2));
      overall[rt.id] = { path: rt.path, summary: r.summary, structDiffs: r.structDiffs.map((d) => ({ foundation: d.foundation, prop: d.prop, actual: d.actual })) };
      const line = Object.entries(r.summary).map(([n, s]) => `${n} ${s.anchorsMismatched}/${s.anchorsMeasured} 像素${s.pixel.changedPixelRatio === undefined ? '?' : (s.pixel.changedPixelRatio * 100).toFixed(2) + '%'}`).join('  ');
      console.log(`${rt.id.padEnd(16)} ${line}`);
    }
    writeFileSync(resolve(outRoot, 'summary.json'), JSON.stringify({ probe: 'foundation-parity', mode: 'trial-run-report-only-auto-discover', recordedAt: new Date().toISOString(), routesFile: { path: args.routes, sha256: sha(routesRaw) }, baseline: spec.baseline, tolerance: spec.tolerance, routes: overall }, null, 2));
  }
} finally {
  await browser.close();
}
process.exit(failed ? 2 : 0);
