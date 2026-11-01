// 小豆盒 iframe 子端：对真实 DOM 做区块预览变换（删除 / 新增同类 / 移动 / 替换），可整体撤回，不写任何源码。
// 做法：
//   - 删除：给区块元素打 data-ludi-block-hidden，样式里 display:none；只删某副本时只撤那个副本。
//   - 移动：页面根容器是 flex 纵向布局，用 inline style order 重排，不动 React 管理的 DOM 顺序。
//   - 新增同类：克隆区块（去掉 data-ludi-* 与 id，内部元素不可操作），按实例顺序插到对应位置。
//     2026-10-05 起副本是独立实例：克隆元素的标记存实例 id（`${block}#c${n}`），可单独选中与操作。
//   - 替换：原区块隐藏，同一位置放一个挂载容器，由子端用 React portal 渲染候选。
// 所有标记都在页面根容器的直接子元素上；整体撤回就是清掉这些标记与克隆，页面回到原样。

import {
  baseBlockId,
  cloneIndexOf,
  isCloneId,
  planBlocks,
  visibleInstances,
  type BlockOp,
  type BlockPlan
} from "./block-ops";
import type { PageBlock, PageRegistry } from "./page-blocks";

export const ATTR_BLOCK = "data-ludi-block";
export const ATTR_HIDDEN = "data-ludi-block-hidden";
export const ATTR_CLONE = "data-ludi-block-clone";
export const ATTR_MOUNT = "data-ludi-block-mount";
const ATTR_TEMPLATE = "data-ludi-block-template";
const ATTR_ORDER_SET = "data-ludi-block-order-set";
const ATTR_SIG = "data-ludi-block-sig";

export type BlockMount = { key: string; block: string; template: string; el: HTMLElement; copy: boolean };
export type BlockReport = { page: string; present: string[]; visible: string[] };
export type BlockApplyResult = { mounts: BlockMount[]; report: BlockReport; plan: BlockPlan } | null;

const relativeSelector = (block: PageBlock) => block.selector.replace(/^:scope\s*>\s*/, "");

function rootOf(registry: PageRegistry): HTMLElement | null {
  return document.querySelector<HTMLElement>(registry.rootSelector);
}

function isPreviewNode(el: Element): boolean {
  return el.hasAttribute(ATTR_CLONE) || el.hasAttribute(ATTR_MOUNT);
}

// 页面上各区块的**本体**元素（预览克隆与替换容器不算）。
export function findBlockElements(registry: PageRegistry, stack: HTMLElement): Map<string, HTMLElement> {
  const found = new Map<string, HTMLElement>();
  for (const child of Array.from(stack.children) as HTMLElement[]) {
    if (isPreviewNode(child)) continue;
    for (const block of registry.blocks) {
      if (!found.has(block.id) && child.matches(relativeSelector(block))) found.set(block.id, child);
    }
  }
  return found;
}

export function findBlockElement(registry: PageRegistry, id: string): HTMLElement | null {
  const stack = rootOf(registry);
  return stack ? (findBlockElements(registry, stack).get(baseBlockId(id)) ?? null) : null;
}

function previewNodeFor(stack: HTMLElement, instanceId: string): HTMLElement | null {
  return stack.querySelector<HTMLElement>(
    `:scope > [${ATTR_MOUNT}="${instanceId}"], :scope > [${ATTR_CLONE}="${instanceId}"]`
  );
}

// 某个实例当前看得见的那一块：替换后是挂载容器，副本是克隆，否则是原元素；被删除或不在页面上为 null。
export function visibleBlockElement(registry: PageRegistry, instanceId: string): HTMLElement | null {
  const stack = rootOf(registry);
  if (!stack) return null;
  const preview = previewNodeFor(stack, instanceId);
  if (preview && !preview.hasAttribute(ATTR_HIDDEN)) return preview;
  if (isCloneId(instanceId)) return null; // 副本只有预览节点，没有本体元素
  const el = findBlockElements(registry, stack).get(instanceId) ?? null;
  return el && !el.hasAttribute(ATTR_HIDDEN) ? el : null;
}

// 元素属于哪个实例（含区块自身、预览克隆与替换容器）。返回的 id 是实例 id（本体 = 区块 id）。
export function blockOfElement(registry: PageRegistry, el: Element): { id: string; self: boolean } | null {
  const stack = rootOf(registry);
  if (!stack || !stack.contains(el)) return null;
  const preview = el.closest<HTMLElement>(`[${ATTR_CLONE}],[${ATTR_MOUNT}]`);
  if (preview && stack.contains(preview)) {
    const id = (preview.getAttribute(ATTR_CLONE) ?? preview.getAttribute(ATTR_MOUNT) ?? "").trim();
    if (id) return { id, self: el === preview };
  }
  for (const [id, blockEl] of findBlockElements(registry, stack)) {
    if (blockEl === el) return { id, self: true };
    if (blockEl.contains(el)) return { id, self: false };
  }
  return null;
}

const generations = new WeakMap<HTMLElement, number>();
let generationCounter = 0;
function generationOf(el: HTMLElement): number {
  let value = generations.get(el);
  if (value === undefined) {
    value = ++generationCounter;
    generations.set(el, value);
  }
  return value;
}

function stripClone(root: HTMLElement) {
  const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
  for (const node of nodes) {
    for (const attr of Array.from(node.attributes)) if (attr.name.startsWith("data-ludi-")) node.removeAttribute(attr.name);
    node.removeAttribute("id");
  }
  root.removeAttribute("aria-label");
}

export function buildReport(registry: PageRegistry, ops: BlockOp[], present: string[]): BlockReport {
  const ids = registry.blocks.map((block) => block.id);
  const plan = planBlocks(ids, ops, registry.pageId);
  const visible = visibleInstances(plan, present);
  // present 给外壳对齐用：本体在页面上的区块 id + 操作产生的实例 id。
  const all = [...present, ...Object.keys(plan.instances).filter((id) => isCloneId(id))];
  return { page: registry.pageId, present: all, visible };
}

// 不改 DOM，只读当前页面上有哪些区块、看得见的有哪些。
export function currentBlockReport(registry: PageRegistry, ops: BlockOp[]): BlockReport | null {
  const stack = rootOf(registry);
  if (!stack) return null;
  const els = findBlockElements(registry, stack);
  const present = registry.blocks.map((block) => block.id).filter((id) => els.has(id));
  return buildReport(registry, ops, present);
}

function revert(registry: PageRegistry, stack: HTMLElement) {
  for (const child of Array.from(stack.children) as HTMLElement[]) {
    if (child.hasAttribute(ATTR_CLONE)) {
      child.remove();
      continue;
    }
    child.removeAttribute(ATTR_HIDDEN);
    if (child.hasAttribute(ATTR_ORDER_SET)) {
      child.style.removeProperty("order");
      child.removeAttribute(ATTR_ORDER_SET);
    }
  }
}

function applySignature(registry: PageRegistry, ops: BlockOp[], present: string[]): string {
  return JSON.stringify({ ops: ops.filter((op) => op.page === registry.pageId), present });
}

// 是否需要（重新）应用：根容器里还没有当前操作的签名，或区块元素被 React 换过。
export function blockPreviewStale(registry: PageRegistry, ops: BlockOp[]): boolean {
  const stack = rootOf(registry);
  if (!stack) return false;
  const els = findBlockElements(registry, stack);
  const present = registry.blocks.map((block) => block.id).filter((id) => els.has(id));
  const pageOps = ops.filter((op) => op.page === registry.pageId);
  if (pageOps.length === 0) {
    return stack.hasAttribute(ATTR_SIG);
  }
  if (stack.getAttribute(ATTR_SIG) !== applySignature(registry, ops, present)) return true;
  for (const [id, el] of els) if (el.getAttribute(ATTR_BLOCK) !== id) return true;
  return false;
}

// 应用操作；返回需要渲染的替换容器、区块状态与实例归约。没有根容器返回 null。
export function applyBlockOps(registry: PageRegistry, ops: BlockOp[]): BlockApplyResult {
  const stack = rootOf(registry);
  if (!stack) return null;
  const els = findBlockElements(registry, stack);
  const ids = registry.blocks.map((block) => block.id);
  const present = ids.filter((id) => els.has(id));
  const pageOps = ops.filter((op) => op.page === registry.pageId);
  const plan = planBlocks(ids, pageOps, registry.pageId);
  const visible = visibleInstances(plan, present);

  revert(registry, stack);
  for (const [id, el] of els) el.setAttribute(ATTR_BLOCK, id);

  // 清掉不再需要的预览节点（实例没了 / 删除 / 副本从克隆换成模板挂载或反过来）。
  const wantMount = new Map<string, string>(); // instanceId -> template
  const wantClone = new Set<string>();
  for (const iid of visible) {
    const info = plan.instances[iid];
    if (!info) continue;
    if (isCloneId(iid)) {
      if (info.replacement) wantMount.set(iid, info.replacement);
      else wantClone.add(iid);
    } else if (info.replacement) wantMount.set(iid, info.replacement);
  }
  for (const node of Array.from(stack.querySelectorAll<HTMLElement>(`:scope > [${ATTR_CLONE}], :scope > [${ATTR_MOUNT}]`))) {
    const iid = (node.getAttribute(ATTR_CLONE) ?? node.getAttribute(ATTR_MOUNT) ?? "").trim();
    const keep = (wantClone.has(iid) && node.hasAttribute(ATTR_CLONE)) || (wantMount.get(iid) && node.hasAttribute(ATTR_MOUNT) && node.getAttribute(ATTR_TEMPLATE) === wantMount.get(iid));
    if (!keep) node.remove();
  }

  if (pageOps.length === 0) {
    stack.removeAttribute(ATTR_SIG);
    return { mounts: [], report: buildReport(registry, ops, present), plan };
  }

  // 槽位：非区块的子元素保持原位置，实例按可见顺序依次占用区块原来占着的槽位；
  // 实例多于区块时（新增同类）继续往后排。
  const children = (Array.from(stack.children) as HTMLElement[]).filter((child) => !isPreviewNode(child));
  const slotOf = new Map<HTMLElement, number>();
  children.forEach((child, index) => slotOf.set(child, index));
  const blockSlots = present.map((id) => slotOf.get(els.get(id)!)!).sort((a, b) => a - b);
  const lastSlot = blockSlots.length ? blockSlots[blockSlots.length - 1] : children.length - 1;
  const slotForInstance = new Map<string, number>();
  visible.forEach((iid, index) => slotForInstance.set(iid, index < blockSlots.length ? blockSlots[index] : lastSlot + 1 + (index - blockSlots.length)));
  const setOrder = (el: HTMLElement, value: number) => {
    el.style.order = String(value);
    el.setAttribute(ATTR_ORDER_SET, "1");
  };
  const elOfBlock = new Map<HTMLElement, string>();
  for (const [id, el] of els) elOfBlock.set(el, id);
  for (const child of children) {
    const blockId = elOfBlock.get(child);
    const slot = blockId ? (slotForInstance.get(blockId) ?? slotOf.get(child)!) : slotOf.get(child)!;
    setOrder(child, (slot + 1) * 10);
  }

  const mounts: BlockMount[] = [];
  // 先安排本体元素（隐藏或保留），再按实例顺序落克隆与挂载容器。
  let anchor: HTMLElement | null = null;
  for (const iid of visible) {
    const info = plan.instances[iid];
    const block = registry.blocks.find((item) => item.id === info.block);
    if (!block) continue;
    const base = ((slotForInstance.get(iid) ?? 0) + 1) * 10;
    if (!isCloneId(iid)) {
      const el = els.get(iid);
      if (!el) continue;
      if (info.replacement) {
        el.setAttribute(ATTR_HIDDEN, "1");
        let mount = previewNodeFor(stack, iid);
        if (!mount) {
          mount = document.createElement("div");
          mount.setAttribute(ATTR_MOUNT, iid);
          mount.className = "ludi-block-mount";
          el.after(mount);
        } else if (mount.previousElementSibling !== el) {
          el.after(mount);
        }
        mount.removeAttribute(ATTR_HIDDEN);
        mount.setAttribute(ATTR_TEMPLATE, info.replacement);
        setOrder(mount, base);
        mounts.push({ key: `${iid}:${generationOf(mount)}`, block: iid, template: info.replacement, el: mount, copy: false });
        anchor = mount;
      } else {
        anchor = el;
      }
      continue;
    }
    // 副本：替换 → 挂载容器；否则 → 克隆本体。
    const original = els.get(info.block);
    if (!original) continue;
    if (info.replacement) {
      let mount = previewNodeFor(stack, iid);
      if (!mount) {
        mount = document.createElement("div");
        mount.setAttribute(ATTR_MOUNT, iid);
        mount.className = "ludi-block-mount";
        mount.setAttribute("aria-hidden", "true");
        (anchor ?? original).after(mount);
      }
      mount.removeAttribute(ATTR_HIDDEN);
      mount.setAttribute(ATTR_TEMPLATE, info.replacement);
      mount.setAttribute("data-ludi-clone-label", `${block.name}（新增 ${cloneIndexOf(iid) ?? ""}）`);
      setOrder(mount, base);
      mounts.push({ key: `${iid}:${generationOf(mount)}`, block: info.block, template: info.replacement, el: mount, copy: true });
      anchor = mount;
    } else {
      const clone = original.cloneNode(true) as HTMLElement;
      stripClone(clone);
      clone.setAttribute(ATTR_CLONE, iid);
      clone.setAttribute("aria-hidden", "true");
      // 副本内部不接收鼠标、也不进入 Tab 顺序；点副本本身等于选中这个实例。
      clone.querySelectorAll<HTMLElement>("a, button, input, select, textarea, [tabindex]").forEach((el) => el.setAttribute("tabindex", "-1"));
      clone.setAttribute("data-ludi-clone-label", `${block.name}（新增 ${cloneIndexOf(iid) ?? ""}）`);
      setOrder(clone, base);
      (anchor ?? original).after(clone);
      anchor = clone;
    }
  }
  // 已删除的本体隐藏（顺序无所谓，反正不可见）。
  for (const iid of plan.order) {
    const info = plan.instances[iid];
    if (isCloneId(iid) || !info?.deleted) continue;
    els.get(iid)?.setAttribute(ATTR_HIDDEN, "1");
  }

  stack.setAttribute(ATTR_SIG, applySignature(registry, ops, present));
  return { mounts, report: buildReport(registry, ops, present), plan };
}

// 整体撤回：清掉标记、克隆与替换容器。
export function clearBlockPreview(registry: PageRegistry) {
  const stack = rootOf(registry);
  if (!stack) return;
  revert(registry, stack);
  for (const mount of Array.from(stack.querySelectorAll<HTMLElement>(`:scope > [${ATTR_MOUNT}]`))) mount.remove();
  stack.removeAttribute(ATTR_SIG);
}
