// 小豆盒 iframe 子端（?editor=1 时由 PreviewApp 挂载）：
// - 接收 theme-preview / clear-preview，只在内存修改 imported deviceOpsTheme 并重渲染，
//   DeviceOpsApp 内部 ConfigProvider 深比较 theme 后真正换肤；清除时逐字段恢复 token 与
//   components overrides，同时把 --do-primary/--do-bg/--do-surface 从 :root 与
//   .device-ops-shell 上撤下。不写文件。
// - selection-mode 开启（选择模式）后，window 捕获阶段拦截点击：只选组件、不触发业务操作；
//   命中 [data-ludi-loc] 上报 component-selected（与 element-detail），未命中显式上报 bridge-error。
//   selection-mode 关闭即交互模式：放行业务点击，不选中。
// - 第二阶段：上报图层树（layer-tree，画布加载后与 DOM 变化后去抖上报）、选中元素的祖先链与计算样式
//   （element-detail），响应 select-element / request-layers，转发 V / I / Ctrl+Z 快捷键。
// - 区块预览（2026-10-03）：theme-preview 的 blocks 是区块操作列表（删除 / 新增同类 / 移动 / 替换），
//   子端对真实 DOM 做可撤回的变换（block-preview.ts），替换候选用 React portal 渲染在原位置；
//   上报 block-state（页面上有哪些区块、看得见的顺序），响应 select-block。只预览，不写源码。
// - 区块写入状态：响应 block-write-state，在被 AI 改写的区块上显示真实运行 / 掉线 / 失败反馈；
//   完成后由父页撤下，失败状态由父页保留 5 秒。这个视觉层不改变页面 DOM 内容或源码。
// - 普通小豆盒不带 ?editor=1，不挂载本组件、不接收任何消息。
// 注意两点：① 本组件必须自渲染 <DeviceOpsApp /> 而不是接收 children —— React 对引用不变的
// children 元素会跳过重渲染；② antd ConfigProvider.useTheme 的记忆比较器对同一对象引用
// 直接判等（rc isEqual 的 a===b 短路），原地改 deviceOpsTheme 后即使重渲染也不会合并出新
// 主题，因此每次草稿生效都用 key={revision} 卸载重建一次 ConfigProvider，确保真正读新值。

import { useEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { DeviceOpsApp } from "../../../projects/tianshu-device-ops/app";
import { deviceOpsComponentStyles, deviceOpsTheme } from "../../../projects/tianshu-device-ops/theme";
import {
  MAX_LAYER_NODES,
  installShortcutForwarding,
  isEditorChild,
  parseEnvelope,
  parseLocAttr,
  parsePreviewPayload,
  postToParent,
  readBounds,
  readStyles,
  type AncestorRef,
  type LayerNode
} from "./bridge";
import type { Loc } from "./api";
import { baseBlockId, cloneIndexOf, instanceDisplayName, type BlockOp } from "./block-ops";
import {
  ATTR_CLONE,
  ATTR_MOUNT,
  applyBlockOps,
  blockOfElement,
  blockPreviewStale,
  clearBlockPreview,
  currentBlockReport,
  findBlockElement,
  findBlockElements,
  visibleBlockElement,
  type BlockMount,
  type BlockReport
} from "./block-preview";
import { templateById } from "./block-templates";
import { baseZhName } from "./element-names";
import { blockById, registryForPath } from "./page-blocks";
import { applyEditorDraft, restoreThemeDraft } from "./theme-apply";
import "./bridge-highlight.css";

const MARKED = "[data-ludi-loc]";

function markedElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(MARKED));
}

function nthOf(el: HTMLElement): number {
  const loc = el.getAttribute("data-ludi-loc");
  return markedElements()
    .filter((item) => item.getAttribute("data-ludi-loc") === loc)
    .indexOf(el);
}

function ancestorChain(el: HTMLElement): AncestorRef[] {
  const chain: AncestorRef[] = [];
  for (let a = el.parentElement?.closest<HTMLElement>(MARKED) ?? null; a; a = a.parentElement?.closest<HTMLElement>(MARKED) ?? null) {
    chain.unshift({
      loc: a.getAttribute("data-ludi-loc") ?? "",
      comp: a.getAttribute("data-ludi-comp") ?? "",
      nth: nthOf(a)
    });
    if (chain.length >= 200) break;
  }
  return chain;
}

function ownText(el: HTMLElement): string {
  return Array.from(el.childNodes)
    .filter((node) => node.nodeType === 3)
    .map((node) => node.textContent ?? "")
    .join("")
    .trim()
    .slice(0, 14);
}

// 元素文字（给右栏起中文名用）：自身文本优先，其次结构很浅的元素取全部文本。
function labelText(el: HTMLElement): string {
  const own = ownText(el);
  if (own) return own;
  if (el.childElementCount > 2) return "";
  return (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 14);
}

function sameMounts(a: BlockMount[], b: BlockMount[]): boolean {
  return a.length === b.length && a.every((item, index) => item.key === b[index].key && item.template === b[index].template);
}

// 区块预览里看得见的那一块的标签：替换后叫「新区块名 · 预览」，副本带「（新增 n）」，没动过就是区块名。
function previewLabel(shown: HTMLElement, blockName: string): string {
  const cloneName = shown.getAttribute("data-ludi-clone-label") ?? blockName;
  if (shown.hasAttribute(ATTR_MOUNT)) {
    const template = templateById(shown.getAttribute("data-ludi-block-template") ?? "");
    return `${cloneName === blockName ? template?.name ?? blockName : `${cloneName}→${template?.name}`} · 预览`;
  }
  if (shown.hasAttribute(ATTR_CLONE)) return `${cloneName} · 预览`;
  return blockName;
}

type BlockWriteState = {
  page: string;
  blocks: string[];
  status: "running" | "failed" | "unavailable";
};

function parseBlockWriteState(raw: unknown): BlockWriteState | null | "clear" {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as { page?: unknown; blocks?: unknown; status?: unknown };
  if (value.status === "clear") return "clear";
  if (value.status !== "running" && value.status !== "failed" && value.status !== "unavailable") return null;
  if (typeof value.page !== "string" || !Array.isArray(value.blocks) || !value.blocks.every((id) => typeof id === "string")) return null;
  return { page: value.page, blocks: [...new Set(value.blocks)], status: value.status };
}

// 可见标记元素树：按文档顺序截断到 MAX_LAYER_NODES，父节点一定排在子节点之前。
// nth 是该 loc 在整页全部标记元素（含不可见）中的序号，与 select-element 的查找口径一致。
function collectLayers() {
  const counts = new Map<string, number>();
  const all = markedElements().map((el) => {
    const loc = el.getAttribute("data-ludi-loc") ?? "";
    const nth = counts.get(loc) ?? 0;
    counts.set(loc, nth + 1);
    return { el, loc, nth };
  });
  const visible = all.filter(({ el }) => el.getClientRects().length > 0);
  const list = visible.slice(0, MAX_LAYER_NODES);
  const index = new Map<Element, number>();
  list.forEach(({ el }, i) => index.set(el, i));
  const registry = registryForPath(window.location.pathname);
  const stack = registry ? document.querySelector<HTMLElement>(registry.rootSelector) : null;
  const blockEls = registry && stack ? findBlockElements(registry, stack) : null;
  const blockIdOf = new Map<Element, string>();
  blockEls?.forEach((blockEl, id) => blockIdOf.set(blockEl, id));
  const nodes: LayerNode[] = list.map(({ el, loc, nth }, i) => {
    let parent = el.parentElement?.closest<HTMLElement>(MARKED) ?? null;
    while (parent && !index.has(parent)) parent = parent.parentElement?.closest<HTMLElement>(MARKED) ?? null;
    const t = ownText(el);
    return { i, p: parent ? (index.get(parent) ?? -1) : -1, loc, comp: el.getAttribute("data-ludi-comp") ?? "", nth, t: t || undefined, b: blockIdOf.get(el) };
  });
  return {
    kind: "page" as const,
    nodes,
    total: visible.length,
    truncated: visible.length > MAX_LAYER_NODES,
    route: `${window.location.pathname}${window.location.search}`
  };
}

export function DeviceOpsEditorBridge() {
  const [themeRevision, bump] = useReducer((count: number) => count + 1, 0);
  const [mounts, setMounts] = useState<BlockMount[]>([]);
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const blockButtonRef = useRef<HTMLButtonElement | null>(null);
  const blockButtonTarget = useRef<string | null>(null);
  const selectBlockRef = useRef<(id: string, scroll: boolean, only?: HTMLElement) => void>(() => undefined);
  const blockOpsRef = useRef<BlockOp[]>([]);
  const runBlocksRef = useRef<(force: boolean) => void>(() => undefined);
  const lastBaseSig = useRef("");

  useEffect(() => {
    if (!isEditorChild()) return;

    let selectedEl: HTMLElement | null = null;
    // 选中的是区块自身时的区块 id：区块被替换 / 重排后，高亮要跟到新位置。
    let selectedBlock: string | null = null;
    let lastReportSig = "";
    let blockWriteState: BlockWriteState | null = null;
    const blockWriteNodes = new Map<string, HTMLDivElement>();
    const blockRects = new Map<string, { left: number; top: number; width: number; height: number }>();

    const clearBlockWriteNodes = () => {
      for (const node of blockWriteNodes.values()) node.remove();
      blockWriteNodes.clear();
    };
    const rememberBlockRects = () => {
      const registry = registryForPath(window.location.pathname);
      if (!registry) return;
      for (const block of registry.blocks) {
        const el = visibleBlockElement(registry, block.id) ?? findBlockElement(registry, block.id);
        if (!el || el.getClientRects().length === 0) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        blockRects.set(block.id, {
          left: rect.left + window.scrollX,
          top: rect.top + window.scrollY,
          width: rect.width,
          height: rect.height
        });
      }
    };
    const paintBlockWriteNodes = () => {
      const registry = registryForPath(window.location.pathname);
      if (!blockWriteState || !registry || blockWriteState.page !== registry.pageId) {
        clearBlockWriteNodes();
        return;
      }
      const wanted = new Set(blockWriteState.blocks);
      for (const [id, node] of blockWriteNodes) {
        if (!wanted.has(id)) {
          node.remove();
          blockWriteNodes.delete(id);
        }
      }
      for (const id of wanted) {
        const shown = visibleBlockElement(registry, id);
        let rect: { left: number; top: number; width: number; height: number } | null = null;
        if (shown && shown.getClientRects().length > 0) {
          const current = shown.getBoundingClientRect();
          rect = { left: current.left, top: current.top, width: current.width, height: current.height };
          blockRects.set(id, {
            left: current.left + window.scrollX,
            top: current.top + window.scrollY,
            width: current.width,
            height: current.height
          });
        } else {
          const cached = blockRects.get(id);
          if (cached) rect = { ...cached, left: cached.left - window.scrollX, top: cached.top - window.scrollY };
        }
        let node = blockWriteNodes.get(id);
        if (!node) {
          node = document.createElement("div");
          node.className = "ludi-devops-bridge-rewrite";
          node.setAttribute("aria-hidden", "true");
          document.body.append(node);
          blockWriteNodes.set(id, node);
        }
        node.dataset.status = blockWriteState.status;
        node.dataset.label =
          blockWriteState.status === "running"
            ? "AI 改写中"
            : blockWriteState.status === "failed"
              ? "改写失败"
              : "进度暂时拿不到";
        node.hidden = !rect || rect.width <= 0 || rect.height <= 0;
        if (!rect) continue;
        node.style.left = `${rect.left}px`;
        node.style.top = `${rect.top}px`;
        node.style.width = `${rect.width}px`;
        node.style.height = `${rect.height}px`;
      }
    };

    const clearLocalHighlight = () => {
      selectedEl = null;
      selectedBlock = null;
      blockButtonTarget.current = null;
      const el = highlightRef.current;
      if (el) el.hidden = true;
    };
    const paintHighlight = (rect: DOMRect) => {
      const el = highlightRef.current;
      if (!el) return;
      el.hidden = rect.width === 0 && rect.height === 0;
      el.dataset.flip = rect.y < 24 ? "inside" : "above";
      el.style.left = `${rect.x}px`;
      el.style.top = `${rect.y}px`;
      el.style.width = `${rect.width}px`;
      el.style.height = `${rect.height}px`;
    };
    const showLocalHighlight = (el: HTMLElement, label: string, upBlock?: { id: string; name: string } | null) => {
      selectedEl = el;
      const box = highlightRef.current;
      if (box) box.dataset.label = label;
      const button = blockButtonRef.current;
      blockButtonTarget.current = upBlock?.id ?? null;
      if (button) {
        button.hidden = !upBlock;
        button.textContent = upBlock ? `选中所在区块：${upBlock.name}` : "";
      }
      paintHighlight(el.getBoundingClientRect());
    };
    // 滚动 / 缩放后高亮跟随选中元素；元素被重渲染移除后撤下高亮。
    let frame = 0;
    const refreshHighlight = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (selectedEl) {
          if (!selectedEl.isConnected) clearLocalHighlight();
          else paintHighlight(selectedEl.getBoundingClientRect());
        }
        paintBlockWriteNodes();
      });
    };

    const announce = (hit: HTMLElement, reportLoc: Loc, opts?: { shown?: HTMLElement; block?: { id: string; self: boolean } }) => {
      // shown：区块被替换后，画布上看得见的是替换容器，矩形与样式取它，定位仍用原区块元素。
      const shown = opts?.shown ?? hit;
      const rect = shown.getBoundingClientRect();
      const instanceKey = hit.getAttribute("data-ludi-key");
      const reportAttr = `${reportLoc.file}:${reportLoc.line}:${reportLoc.column}`;
      const instanceCount = Array.from(document.querySelectorAll('[data-ludi-loc]')).filter(el=>el.getAttribute("data-ludi-loc")===reportAttr && (instanceKey===null || el.getAttribute("data-ludi-key")===instanceKey)).length;
      const registry = registryForPath(window.location.pathname);
      const block = opts?.block ?? (registry ? blockOfElement(registry, hit) : null);
      // block.id 是实例 id（本体 = 区块 id，副本 = `${block}#c${n}`）；合同元数据按所属区块查。
      const blockMeta = registry && block ? blockById(registry, baseBlockId(block.id)) : null;
      const instanceName = blockMeta ? instanceDisplayName(blockMeta.name, cloneIndexOf(block?.id ?? "")) : null;
      selectedBlock = block?.self ? block.id : null;
      showLocalHighlight(
        shown,
        blockMeta && block?.self ? previewLabel(shown, instanceName ?? "区块") : baseZhName(reportLoc.component, hit.tagName.toLowerCase()),
        blockMeta && !block?.self ? { id: block?.id ?? "", name: instanceName ?? blockMeta.name } : null
      );
      postToParent("component-selected", {
        loc: reportLoc,
        instanceKey,
        instanceCount,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      });
      const selfLoc = hit.getAttribute("data-ludi-loc") ?? "";
      postToParent("element-detail", {
        loc: reportLoc,
        selfLoc,
        comp: hit.getAttribute("data-ludi-comp") ?? "",
        tag: hit.tagName.toLowerCase(),
        nth: nthOf(hit),
        ownerComp: reportLoc.component !== (hit.getAttribute("data-ludi-comp") ?? "") ? reportLoc.component : undefined,
        ancestors: ancestorChain(hit),
        bounds: readBounds(shown),
        styles: readStyles(shown),
        text: labelText(shown) || undefined,
        block: block ?? undefined
      });
    };

    // 选中一个区块（按登记的区块 id）：定位仍用原区块元素，看得见的那块（替换容器或原元素）负责高亮与矩形。
    const selectBlockById = (id: string, scroll: boolean, only?: HTMLElement) => {
      const registry = registryForPath(window.location.pathname);
      const original = registry ? findBlockElement(registry, id) : null;
      const shown = only ?? (registry ? visibleBlockElement(registry, id) : null);
      if (!registry || !original || !shown) {
        postToParent("bridge-error", { code: "LOCATE_FAILED", message: `区块已不在页面上：${id}` });
        return;
      }
      const loc = parseLocAttr(original.getAttribute("data-ludi-loc") ?? "", original.getAttribute("data-ludi-comp"));
      if (!loc) {
        postToParent("bridge-error", { code: "LOC_PARSE_FAILED", message: `区块缺少定位标记：${id}` });
        return;
      }
      if (scroll) shown.scrollIntoView({ block: "center", inline: "nearest" });
      window.requestAnimationFrame(() => announce(original, loc, { shown, block: { id, self: true } }));
    };
    selectBlockRef.current = selectBlockById;

    /* ---- 区块预览：把外壳草稿里的操作列表应用到真实 DOM ---- */
    const retargetBlockHighlight = () => {
      const registry = registryForPath(window.location.pathname);
      if (!registry || !selectedBlock) return;
      const shown = visibleBlockElement(registry, selectedBlock);
      if (!shown) {
        clearLocalHighlight();
        return;
      }
      const meta = blockById(registry, selectedBlock);
      showLocalHighlight(shown, previewLabel(shown, meta?.name ?? "区块"));
    };
    const postBlockState = (report: BlockReport | null) => {
      if (!report) return;
      const signature = JSON.stringify(report);
      if (signature === lastReportSig) return;
      lastReportSig = signature;
      postToParent("block-state", report);
    };
    let blockObserver: MutationObserver | null = null;
    const runBlocks = (force: boolean) => {
      const registry = registryForPath(window.location.pathname);
      if (!registry) return;
      const ops = blockOpsRef.current;
      if (!force && !blockPreviewStale(registry, ops)) return;
      // 删除预览会让原区块 display:none；变换前记住文档坐标，写入中仍能在原槽位给出反馈。
      rememberBlockRects();
      const result = applyBlockOps(registry, ops);
      blockObserver?.takeRecords();
      if (!result) return;
      setMounts((current) => (sameMounts(current, result.mounts) ? current : result.mounts));
      postBlockState(result.report);
      retargetBlockHighlight();
      paintBlockWriteNodes();
      // portal 内容异步落地，连续两帧再对一次选中框（替换瞬间空容器会把高亮压成一条线）。
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => {
          retargetBlockHighlight();
          paintBlockWriteNodes();
        })
      );
    };
    runBlocksRef.current = runBlocks;
    let blockFrame = 0;
    blockObserver = new MutationObserver(() => {
      if (blockFrame) return;
      blockFrame = window.requestAnimationFrame(() => {
        blockFrame = 0;
        runBlocks(false);
      });
    });
    blockObserver.observe(document.body, { childList: true, subtree: true });

    const selection = { enabled: false };

    const onClickCapture = (event: MouseEvent) => {
      if (!selection.enabled) return;
      const target = event.target as HTMLElement | null;
      // 高亮框里的「选中所在区块」按钮自己处理点击。
      if (target && highlightRef.current?.contains(target)) return;
      event.preventDefault();
      event.stopPropagation();
      // 点到区块的替换容器或预览克隆：选中**这个实例**（副本与本体互不绑定）。
      const previewHit = target?.closest?.(`[${ATTR_MOUNT}],[${ATTR_CLONE}]`) as HTMLElement | null;
      if (previewHit) {
        const id = (previewHit.getAttribute(ATTR_CLONE) ?? previewHit.getAttribute(ATTR_MOUNT) ?? "").trim();
        if (id) selectBlockById(id, false, previewHit);
        return;
      }
      const hit = target?.closest?.("[data-ludi-loc]") as HTMLElement | null;
      if (!hit) {
        clearLocalHighlight();
        postToParent("bridge-error", {
          code: "LOCATE_FAILED",
          message: "该位置没有可定位的组件标记（data-ludi-loc 缺失或非 antd JSX）"
        });
        return;
      }
      const loc = parseLocAttr(hit.getAttribute("data-ludi-loc") ?? "", hit.getAttribute("data-ludi-comp"));
      if (!loc) {
        clearLocalHighlight();
        postToParent("bridge-error", {
          code: "LOC_PARSE_FAILED",
          message: `定位标记无法解析：${hit.getAttribute("data-ludi-loc") ?? ""}`
        });
        return;
      }
      // Popconfirm 等无自身 DOM 的包裹组件：插件把 data-ludi-owner-* 注入其唯一触发子元素。
      // 命中元素（或 target 到命中元素之间的祖先）带 owner 标记时上报包裹组件的 loc，rect 仍取命中元素。
      let reportLoc = loc;
      for (let el: HTMLElement | null = target; el; el = el.parentElement) {
        const ownerLocAttr = el.getAttribute("data-ludi-owner-loc");
        if (ownerLocAttr) {
          const ownerLoc = parseLocAttr(ownerLocAttr, el.getAttribute("data-ludi-owner-comp"));
          if (ownerLoc) reportLoc = ownerLoc;
          break;
        }
        if (el === hit) break;
      }
      announce(hit, reportLoc);
    };

    // 父页按 loc 请求选中（图层树点击）：滚动到可见后上报，语义同点选；不走 owner 上报。
    const selectByLoc = (locAttr: string, nth: number) => {
      const list = markedElements().filter((item) => item.getAttribute("data-ludi-loc") === locAttr);
      const el = list[nth] ?? list[0];
      if (!el) {
        postToParent("bridge-error", { code: "LOCATE_FAILED", message: `图层树节点已不在页面中：${locAttr}` });
        return;
      }
      const loc = parseLocAttr(locAttr, el.getAttribute("data-ludi-comp"));
      if (!loc) return;
      el.scrollIntoView({ block: "center", inline: "nearest" });
      window.requestAnimationFrame(() => announce(el, loc));
    };

    // 图层树：画布加载、路由切换、抽屉弹窗打开等 DOM 变化后去抖上报，内容没变就不重复上报。
    let lastSignature = "";
    const reportLayers = (force: boolean) => {
      const tree = collectLayers();
      const signature = `${tree.route}|${tree.total}|${tree.nodes.map((node) => `${node.loc}#${node.p}`).join(",")}`;
      if (!force && signature === lastSignature) return;
      lastSignature = signature;
      postToParent("layer-tree", tree);
    };
    const reportBlockState = () => {
      const registry = registryForPath(window.location.pathname);
      if (registry) postBlockState(currentBlockReport(registry, blockOpsRef.current));
    };
    let layerTimer = 0;
    const scheduleLayers = () => {
      window.clearTimeout(layerTimer);
      layerTimer = window.setTimeout(() => {
        if (selectedEl && !selectedEl.isConnected) clearLocalHighlight();
        reportLayers(false);
        reportBlockState();
        rememberBlockRects();
        paintBlockWriteNodes();
        // 替换容器里的候选内容经 portal 异步落地；DOM 稳定后再对一次选中框，
        // 否则替换瞬间按空容器量到的高度会把高亮压成一条线（Owner 验收 #3）。
        retargetBlockHighlight();
      }, 500);
    };
    const observer = new MutationObserver(scheduleLayers);
    observer.observe(document.body, { childList: true, subtree: true });

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== window.parent) return;
      const message = parseEnvelope(event.data);
      if (!message) return;
      switch (message.type) {
        case "theme-preview": {
          const payload = parsePreviewPayload(message.payload);
          if (!payload) {
            postToParent("bridge-error", { code: "BAD_THEME_PAYLOAD", message: "theme-preview 载荷不是合法的 {theme, components, statuses}" });
            return;
          }
          blockOpsRef.current = payload.blocks ?? [];
          // 只有区块操作变了就不重建整页（保留筛选、勾选等页面状态），其余草稿变化仍重建一次。
          const baseSignature = JSON.stringify({ t: payload.theme, c: payload.components, s: payload.statuses, st: payload.structures, i: payload.instances });
          if (baseSignature === lastBaseSig.current) {
            runBlocks(true);
            return;
          }
          lastBaseSig.current = baseSignature;
          applyEditorDraft(payload);
          bump();
          return;
        }
        case "clear-preview": {
          restoreThemeDraft();
          clearLocalHighlight();
          lastBaseSig.current = "";
          blockOpsRef.current = [];
          const registry = registryForPath(window.location.pathname);
          if (registry) clearBlockPreview(registry);
          setMounts([]);
          bump();
          return;
        }
        case "selection-mode": {
          const enabled =
            typeof message.payload === "object" &&
            message.payload !== null &&
            (message.payload as { enabled?: unknown }).enabled === true;
          selection.enabled = enabled;
          if (!enabled) clearLocalHighlight();
          return;
        }
        case "request-layers": {
          reportLayers(true);
          reportBlockState();
          return;
        }
        case "block-write-state": {
          const next = parseBlockWriteState(message.payload);
          if (!next) {
            postToParent("bridge-error", { code: "BAD_BLOCK_WRITE_STATE", message: "block-write-state 载荷不合法" });
            return;
          }
          blockWriteState = next === "clear" ? null : next;
          rememberBlockRects();
          paintBlockWriteNodes();
          return;
        }
        case "select-block": {
          const id = (message.payload as { id?: unknown } | undefined)?.id;
          if (typeof id === "string") selectBlockById(id, true);
          return;
        }
        case "select-element": {
          const payload = message.payload as { loc?: unknown; nth?: unknown } | undefined;
          if (typeof payload?.loc === "string" && typeof payload.nth === "number") selectByLoc(payload.loc, payload.nth);
          return;
        }
        default:
          return;
      }
    };

    window.addEventListener("click", onClickCapture, true);
    window.addEventListener("message", onMessage);
    window.addEventListener("scroll", refreshHighlight, true);
    window.addEventListener("resize", refreshHighlight);
    const removeShortcuts = installShortcutForwarding();
    postToParent("ready", { route: `${window.location.pathname}${window.location.search}` });
    scheduleLayers();

    return () => {
      window.removeEventListener("click", onClickCapture, true);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("scroll", refreshHighlight, true);
      window.removeEventListener("resize", refreshHighlight);
      removeShortcuts();
      observer.disconnect();
      blockObserver?.disconnect();
      clearBlockWriteNodes();
      window.clearTimeout(layerTimer);
      if (frame) window.cancelAnimationFrame(frame);
      if (blockFrame) window.cancelAnimationFrame(blockFrame);
    };
  }, []);

  // 整页重建（草稿生效）后，等新页面渲染出来再把区块预览补上；之后由 MutationObserver 兜底。
  useEffect(() => {
    runBlocksRef.current(true);
  }, [themeRevision]);

  return (
    <>
      <DeviceOpsApp key={themeRevision} />
      <div ref={highlightRef} className="ludi-devops-bridge-highlight" hidden>
        <button
          className="ludi-devops-bridge-block-btn"
          hidden
          onClick={() => {
            if (blockButtonTarget.current) selectBlockRef.current(blockButtonTarget.current, false);
          }}
          ref={blockButtonRef}
          type="button"
        />
      </div>
      {mounts.map((mount) => {
        const template = templateById(mount.template);
        if (!template) return null;
        return createPortal(
          <ConfigProvider
            {...deviceOpsComponentStyles}
            button={{ ...deviceOpsComponentStyles.button, autoInsertSpace: false }}
            key={themeRevision}
            locale={zhCN}
            theme={deviceOpsTheme}
          >
            {template.render()}
          </ConfigProvider>,
          mount.el,
          mount.key
        );
      })}
    </>
  );
}
