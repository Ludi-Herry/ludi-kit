// 编辑器壳层：顶栏 + 三栏骨架（左导航 240、中栏舞台、右检查器 280）。
// 画布（/editor，/editor/page 同为画布）：小豆盒真实页面，选择模式点选元素 → 图层树 / 只读详情 / antd 候选替换，
//   交互模式放行业务点击；「基础」六个分组（颜色 / 文字 / 图标 / 间距 / 圆角与效果 / 布局栅格，
//   图标与布局栅格只读）与 P0 组件矩阵（点选结构层）。
// 主题草稿（26 字段）→ iframe 预览（有预览撤销 / 重做历史）→ 写入项目 → 检查进度 → 撤销最近一次写入。
// 区块操作（删除 / 新增同类 / 移动 / 替换）进入同一份草稿历史；确认后交给本机 AI 改写页面源码，
// 进度、取消与自动撤销状态均来自服务端 Patch 记录。

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Button, Segmented, Select, Tooltip } from "antd";
import { FastColor } from "@ant-design/fast-color";
import { Redo2, RotateCw, Undo2 } from "lucide-react";
import {
  PROJECT_ID,
  THEME_KEYS,
  blockPatchFile,
  cancelBlockPatch,
  componentPatchFile,
  errorText,
  fetchBlockAdvice,
  fetchBootstrap,
  fetchPatchList,
  fetchCandidates,
  fetchInstance,
  fetchDerivedDefaults,
  fetchImpact,
  fetchPatch,
  findFileSha,
  submitComponentPatch,
  submitBlockPatch,
  submitReplacePatch,
  submitThemePatch,
  submitStructurePatch,
  submitInstancePatch,
  themePatchFiles,
  undoPatch,
  type Candidate,
  type ComponentComputedValues,
  type ComponentTokenDraftEntry,
  type DerivedComponents,
  type ComponentTokensDraft,
  type ComponentTokensState,
  type Patch,
  type PreviewPayload,
  type RouteEntry,
  type ThemeDraft
} from "./api";
import {
  isTextEditingTarget,
  parseBlockState,
  parseComponentValues,
  parseElementDetail,
  parseEnvelope,
  parseLayerTree,
  parsePartDetail,
  parseShortcut,
  postToChild,
  type BlockStatePayload,
  type ComponentSelectedPayload,
  type ElementDetail,
  type LayerTreePayload,
  type PartDetail
} from "./bridge";
import { COMPONENT_TOKENS } from "./component-tokens";
import { ComponentTokenEditor } from "./ComponentTokenEditor";
import { InstanceEditor, StructureEditor } from "./InstanceEditor";
import { ImpactPanel, type ImpactCatalog } from "./ImpactPanel";
import type { InstanceModel, InstanceChanges, StructureDraft } from "./api";
import { locKey } from "./instance-preview";
import "./impact.css";
import { useDraftHistory, type EditorDraft } from "./draft-history";
import { GridInfo, IconsInfo } from "./FoundationInfo";
import { Inspector } from "./Inspector";
import { baseBlockId, type BlockOp, type BlockOpKind } from "./block-ops";
import type { AppearanceEdit, BlocksUi } from "./inspector-parts";
import { blockById, registryForRoute } from "./page-blocks";
import { LayerPanel } from "./LayerPanel";
import { ResizeHandle, usePanelWidths, type PanelSide } from "./PanelResize";
import { Nav } from "./Nav";
import {
  P0_COMPONENTS,
  SYSTEM_SECTIONS,
  type CanvasMode,
  type StageView,
  type SystemId,
  type Workspace
} from "./nav-data";
import { SpecView } from "./SpecView";
import { contrastLevel, deriveTokens, formatPx, upperHex } from "./spec-data";
import { TokenEditor, type TokenGroup } from "./TokenEditor";
import {
  FALLBACK_RANGES,
  NUMERIC_TOKEN_KEYS,
  clampNumber,
  contrastWithWhite,
  parseTokenRules,
  themeClientRules,
  type NumericRange,
  type NumericTokenKey
} from "./theme-rules";
import type { BootstrapState, BridgeIssue, PatchEntry, SelectionState } from "./state";

const FALLBACK_THEME: ThemeDraft = {
  colorPrimary: "#1677ff",
  colorSuccess: "#52c41a",
  colorWarning: "#faad14",
  colorError: "#ff4d4f",
  colorInfo: "#1677ff",
  colorText: "#000000",
  colorTextSecondary: "#595959",
  colorBorder: "#d9d9d9",
  colorBgBase: "#ffffff",
  colorBgContainer: "#ffffff",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', sans-serif",
  fontFamilyCode: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace",
  fontSize: 14,
  lineHeight: 1.57,
  sizeUnit: 4,
  sizeStep: 4,
  spaceSm: 12,
  spaceMd: 16,
  spaceLg: 24,
  controlHeight: 32,
  borderRadius: 6,
  borderRadiusLG: 8,
  lineWidth: 1,
  shadowLevel: "default",
  motion: true,
  motionUnit: 0.1
};

function nowIso(): string {
  return new Date().toISOString();
}

const ALL_GROUPS: TokenGroup[] = ["color", "typography", "spacing", "effects"];

type BlockWriteFeedback = {
  patchId: string;
  page: string;
  blocks: string[];
  status: "running" | "failed" | "unavailable";
};

function tokenGroupsFor(workspace: Workspace): { groups: TokenGroup[]; showDerived: boolean } {
  if (workspace.kind === "system") {
    switch (workspace.id) {
      case "color":
        return { groups: ["color"], showDerived: true };
      case "typography":
        return { groups: ["typography"], showDerived: true };
      case "spacing":
        return { groups: ["spacing"], showDerived: true };
      case "radius":
        return { groups: ["effects"], showDerived: true };
      default:
        // icons / grid 是纯只读分组，右栏由 FoundationInfo 渲染，不走 TokenEditor。
        return { groups: [], showDerived: false };
    }
  }
  return { groups: ALL_GROUPS, showDerived: false };
}

export function EditorShell() {
  const [bootstrapState, setBootstrapState] = useState<BootstrapState>({ status: "loading" });
  const [baseTheme, setBaseTheme] = useState<ThemeDraft | null>(null);
  const history = useDraftHistory();
  const draft = history.draft;
  const [workspace, setWorkspace] = useState<Workspace>({ kind: "canvas" });
  const [view, setView] = useState<StageView>("docs");
  const [canvasMode, setCanvasMode] = useState<CanvasMode>("select");
  const [routeId, setRouteId] = useState<string>("");
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [detail, setDetail] = useState<ElementDetail | null>(null);
  const [partDetail, setPartDetail] = useState<PartDetail | null>(null);
  const [layers, setLayers] = useState<LayerTreePayload | null>(null);
  // 子端上报的区块状态：当前页登记的区块里哪些在页面上、看得见的有效顺序。
  const [blockState, setBlockState] = useState<BlockStatePayload | null>(null);
  // 矩阵子端读回的 CSS 变量计算值：组件 → token → 计算值（读不到为 null）。
  const [componentValues, setComponentValues] = useState<ComponentComputedValues>({});
  // 服务端按当前「基础」草稿派生的组件默认值（2026-10-05）：跟随全局的数值随草稿实时变化。
  const [derivedDefaults, setDerivedDefaults] = useState<DerivedComponents | null>(null);
  const [patches, setPatches] = useState<PatchEntry[]>([]);
  const [blockFeedback, setBlockFeedback] = useState<BlockWriteFeedback | null>(null);
  const [bridgeIssues, setBridgeIssues] = useState<BridgeIssue[]>([]);
  const [frameNonce, setFrameNonce] = useState(0);
  const { widths: panelWidths, update: setPanelWidth } = usePanelWidths();
  const [resizing, setResizing] = useState(false);
  const leftPanelRef = useRef<HTMLElement>(null);
  const rightPanelRef = useRef<HTMLElement>(null);
  const measurePanel = useCallback(
    (side: PanelSide) => () => {
      const self = side === "left" ? leftPanelRef.current : rightPanelRef.current;
      const other = side === "left" ? rightPanelRef.current : leftPanelRef.current;
      return { self: self?.offsetWidth ?? 0, other: other?.offsetWidth ?? 0 };
    },
    []
  );
  const measureLeft = useMemo(() => measurePanel("left"), [measurePanel]);
  const measureRight = useMemo(() => measurePanel("right"), [measurePanel]);
  const bodyStyle = useMemo(() => {
    const style: Record<string, string> = {};
    if (panelWidths.left !== null) style["--ludi-left-w"] = `${panelWidths.left}px`;
    if (panelWidths.right !== null) style["--ludi-right-w"] = `${panelWidths.right}px`;
    return style as CSSProperties;
  }, [panelWidths]);
  const [frameReady, setFrameReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [instanceModel,setInstanceModel]=useState<InstanceModel|null>(null);
  const [instancePending,setInstancePending]=useState(false);
  const [instanceError,setInstanceError]=useState<string|null>(null);
  const [impactCatalog,setImpactCatalog]=useState<ImpactCatalog|null>(null);
  const [impactPending,setImpactPending]=useState(false);
  const [impactError,setImpactError]=useState<string|null>(null);
  const [showBefore,setShowBefore]=useState(false);
  const [stageWidth,setStageWidth]=useState(900);
  const stageRef=useRef<HTMLDivElement|null>(null);

  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const pollTimers = useRef<number[]>([]);
  const blockFeedbackTimer = useRef<number | null>(null);
  // 正在轮询的 Patch：刷新后从列表恢复轮询时避免同一条起两个计时器。
  const polledIds = useRef(new Set<string>());
  const patchListLoaded = useRef(false);
  const selecting = workspace.kind === "canvas" && canvasMode === "select";
  const pushedDraft = useRef<string | null>(null);
  const workspaceName = workspace.kind === "component" ? workspace.name : null;
  const latest = useRef({
    selecting,
    workspaceKind: workspace.kind,
    workspaceName,
    draft,
    bootstrap: bootstrapState.status === "ready" ? bootstrapState.data : null,
    routeId,
    blockFeedback
  });
  latest.current = {
    selecting,
    workspaceKind: workspace.kind,
    workspaceName,
    draft,
    bootstrap: bootstrapState.status === "ready" ? bootstrapState.data : null,
    routeId,
    blockFeedback
  };

  const appendIssue = useCallback((code: string, message: string) => {
    setBridgeIssues((current) => [...current, { at: nowIso(), code, message }]);
  }, []);

  /* -------------------------------------------------------------- bootstrap */

  const loadBootstrap = useCallback(async () => {
    setBootstrapState({ status: "loading" });
    try {
      const data = await fetchBootstrap();
      setBootstrapState({ status: "ready", data });
      const missing: string[] = [];
      const theme: ThemeDraft = { ...FALLBACK_THEME };
      for (const key of THEME_KEYS) {
        const value = data.theme?.[key];
        if (value === undefined || value === null) missing.push(key);
        else (theme as unknown as Record<string, unknown>)[key] = value;
      }
      if (missing.length > 0) {
        appendIssue(
          "BOOTSTRAP_THEME_INCOMPLETE",
          `bootstrap.theme 缺少 ${missing.join("、")}，已按 antd 默认补值；写入以服务端校验为准。`
        );
      }
      setBaseTheme(theme);
      history.init({ theme, components: {} }); // 写入后 bootstrap 刷新：草稿回到项目当前值，预览历史清空
      setRouteId((current) => {
        if (current && data.routes.some((route) => route.id === current)) return current;
        const requested = new URLSearchParams(window.location.search).get("route");
        const matched = requested ? data.routes.find((route) => route.route === requested) : undefined;
        return (matched ?? data.routes.find((route) => route.id === "device-list") ?? data.routes[0])?.id ?? "";
      });
    } catch (cause) {
      setBootstrapState({ status: "error", error: errorText(cause) });
    }
  }, [appendIssue, history.init]);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  /* -------------------------------------------------------------- 导航 */

  useEffect(() => {
    document.title = "组件库编辑器";
  }, []);

  const routes: RouteEntry[] = bootstrapState.status === "ready" ? bootstrapState.data.routes : [];
  const activeRoute = routes.find((route) => route.id === routeId) ?? routes[0] ?? null;
  const selectedId=selection?`${locKey(selection.loc)}|${selection.instanceKey??""}`:"";
  useEffect(()=>{
    let cancelled=false;setInstanceModel(null);setInstanceError(null);
    if(!selection?.file){setInstancePending(false);return;}
    setInstancePending(true);
    fetchInstance(selection.loc,selection.file.sha256,selection.instanceKey??null).then(model=>{
      if(cancelled)return;
      if((selection.instanceCount??1)>1){setInstanceError("该源码节点有多个同标识实例，不能保证只改选中项。");return;}
      setInstanceModel(model);
    }).catch(cause=>{if(!cancelled)setInstanceError(errorText(cause).message);}).finally(()=>{if(!cancelled)setInstancePending(false);});
    return()=>{cancelled=true;};
  },[selectedId,selection?.file?.sha256,selection?.instanceCount]);
  const impactFilter=JSON.stringify(impactScope());
  function impactScope() {
    const globalChanged=baseTheme&&draft&&JSON.stringify(baseTheme)!==JSON.stringify(draft.theme);
    if(globalChanged)return {components:null,loc:null};
    const components=[...new Set([...Object.keys(draft?.components??{}),...Object.keys(draft?.structures??{})])];
    if(components.length)return {components,loc:null};
    if(draft?.instances?.length)return {components:null,loc:draft.instances[0].loc};
    if(workspace.kind==="canvas"&&selection)return {components:null,loc:selection.loc};
    return {components:workspace.kind==="component"?[workspace.name]:null,loc:null};
  }
  useEffect(()=>{
    if(bootstrapState.status!=="ready")return;
    let cancelled=false;setImpactPending(true);setImpactError(null);
    const filter=JSON.parse(impactFilter);
    fetchImpact(filter.components,filter.loc).then(catalog=>{if(!cancelled)setImpactCatalog(catalog);}).catch(cause=>{if(!cancelled){setImpactCatalog(null);setImpactError(errorText(cause).message);}}).finally(()=>{if(!cancelled)setImpactPending(false);});
    return()=>{cancelled=true;};
  },[impactFilter,bootstrapState.status,frameNonce]);
  useEffect(()=>{
    const node=stageRef.current;if(!node)return;
    const observer=new ResizeObserver(()=>setStageWidth(Math.round(node.clientWidth)));
    observer.observe(node);setStageWidth(Math.round(node.clientWidth));return()=>observer.disconnect();
  },[]);

  const resetInspection = useCallback(() => {
    setSelection(null);
    setDetail(null);
    setPartDetail(null);
    setLayers(null);
  }, []);

  const openCanvas = useCallback(() => {
    setWorkspace({ kind: "canvas" });
  }, []);

  const openSystem = useCallback((id: SystemId) => {
    setWorkspace({ kind: "system", id });
    setView("docs");
  }, []);

  const openComponent = useCallback((name: string) => {
    setWorkspace({ kind: "component", name });
  }, []);

  const pickRoute = useCallback(
    (id: string) => {
      setRouteId(id);
      resetInspection();
    },
    [resetInspection]
  );

  /* -------------------------------------------------------------- iframe 桥接 */

  // 推送子端的预览载荷：L0 主题草稿 + 组件 token 草稿 + 跟随状态（L0 写回的同步语义在子端也能正确呈现）。
  const buildPreviewPayload = useCallback((draft: EditorDraft): PreviewPayload => {
    const state = latest.current.bootstrap?.componentTokens;
    const statuses: PreviewPayload["statuses"] = {};
    if (state) {
      for (const [component, entries] of Object.entries(state)) {
        for (const [field, meta] of Object.entries(entries)) (statuses[component] ??= {})[field] = meta.status;
      }
    }
    return { theme: draft.theme, components: draft.components, statuses, structures:draft.structures??{}, instances:draft.instances??[], blocks: draft.blocks??[] };
  }, []);

  const postState = useCallback(
    (frame: HTMLIFrameElement | null) => {
      if (!frame) return;
      const { draft: currentDraft, selecting: currentSelecting, workspaceName: currentComponent } = latest.current;
      if (currentDraft) {
        const payload = buildPreviewPayload(currentDraft);
        postToChild(frame, "theme-preview", payload);
        pushedDraft.current = JSON.stringify(payload);
      }
      postToChild(frame, "selection-mode", { enabled: currentSelecting });
      postToChild(frame, "request-layers", {});
      postToChild(frame, "block-write-state", latest.current.blockFeedback ?? { status: "clear" });
      if (currentComponent) postToChild(frame, "request-component-values", {});
    },
    [buildPreviewPayload]
  );

  const handleComponentSelected = useCallback(
    async (payload: ComponentSelectedPayload) => {
      const files = latest.current.bootstrap?.files ?? [];
      const file = findFileSha(files, payload.loc.file);
      // 小写标签名 = 原生元素：没有替换候选，不向服务端请求，右栏只读。
      const native = /^[a-z]/.test(payload.loc.component);
      const next: SelectionState = {
        native,
        instanceKey:payload.instanceKey??null,
        instanceCount:payload.instanceCount??1,
        loc: payload.loc,
        rect: payload.rect,
        file,
        loading: !native && Boolean(file),
        data: null,
        error: null
      };
      setSelection(next);
      if (native || !file) return;
      try {
        const data = await fetchCandidates(payload.loc, file.sha256);
        setSelection((current) =>
          current && current.loc === payload.loc
            ? { ...current, loading: false, data, error: null }
            : current
        );
      } catch (cause) {
        const error = errorText(cause);
        setSelection((current) =>
          current && current.loc === payload.loc ? { ...current, loading: false, error } : current
        );
      }
    },
    []
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const message = parseEnvelope(event.data);
      if (!message) return;
      switch (message.type) {
        case "ready":
          setFrameReady(true);
          postState(frame);
          return;
        case "layer-tree": {
          const tree = parseLayerTree(message.payload);
          if (tree) setLayers(tree);
          return;
        }
        case "element-detail": {
          const next = parseElementDetail(message.payload);
          if (next) setDetail(next);
          return;
        }
        case "block-state": {
          const next = parseBlockState(message.payload);
          if (next) setBlockState(next);
          return;
        }
        case "part-detail": {
          const next = parsePartDetail(message.payload);
          if (next) setPartDetail(next);
          return;
        }
        case "component-values": {
          const payload = parseComponentValues(message.payload);
          if (payload) setComponentValues((current) => ({ ...current, [payload.component]: payload.values }));
          return;
        }
        case "shortcut": {
          const shortcut = parseShortcut(message.payload);
          if (shortcut) handleShortcutRef.current(shortcut.key, shortcut.ctrl, shortcut.shift);
          return;
        }
        case "component-selected": {
          const payload = message.payload as ComponentSelectedPayload;
          if (!payload?.loc || !payload?.rect) return;
          void handleComponentSelected(payload);
          return;
        }
        case "bridge-error": {
          const payload = message.payload as { code?: unknown; message?: unknown } | undefined;
          appendIssue(
            typeof payload?.code === "string" ? payload.code : "BRIDGE",
            typeof payload?.message === "string" ? payload.message : "子端上报了未携带说明的失败"
          );
          return;
        }
        default:
          return;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [appendIssue, handleComponentSelected, postState]);

  /* -------------------------------------------------------------- 草稿推送（仅内存预览，不写文件） */

  const themeDirty = useMemo(
    () => Boolean(baseTheme && draft && JSON.stringify(baseTheme) !== JSON.stringify(draft.theme)),
    [baseTheme, draft]
  );
  const componentsDirty = useMemo(
    () => Boolean(draft && Object.values(draft.components).some((entries) => entries && Object.keys(entries).length > 0)),
    [draft]
  );
  const blocksDirty = Boolean(draft?.blocks?.length);
  const nonBlockDirty = themeDirty || componentsDirty || Boolean(Object.keys(draft?.structures??{}).length || draft?.instances?.length);
  const dirty = nonBlockDirty || blocksDirty;

  // 草稿变了就推给子页（含撤销回到项目当前值）；与上次推送相同的内容不重复推，避免无谓重建。
  useEffect(() => {
    if (!frameReady || !draft) return;
    const payload = buildPreviewPayload(draft);
    const serialized = JSON.stringify(payload);
    if (serialized === pushedDraft.current) return;
    const timer = window.setTimeout(() => {
      postToChild(frameRef.current, "theme-preview", payload);
      pushedDraft.current = serialized;
    }, 180);
    return () => window.clearTimeout(timer);
  }, [buildPreviewPayload, draft, frameReady]);

  // 「基础」草稿变化后向服务端求按草稿派生的组件默认值（跟随全局联动，防抖合并频繁输入）。
  useEffect(() => {
    if (!draft) {
      setDerivedDefaults(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetchDerivedDefaults(draft.theme)
        .then((components) => { if (!cancelled) setDerivedDefaults(components); })
        .catch(() => { if (!cancelled) setDerivedDefaults(null); });
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [draft]);

  // 选择 / 交互模式变化立即同步给画布子页。
  useEffect(() => {
    if (frameReady) postToChild(frameRef.current, "selection-mode", { enabled: selecting });
  }, [frameReady, selecting]);

  useEffect(() => {
    if (frameReady) postToChild(frameRef.current, "block-write-state", blockFeedback ?? { status: "clear" });
  }, [blockFeedback, frameReady]);

  /* -------------------------------------------------------------- 快捷键：预览撤销 / 重做、V / I */

  const handleShortcutRef = useRef<(key: string, ctrl: boolean, shift: boolean) => void>(() => undefined);
  handleShortcutRef.current = (key, ctrl, shift) => {
    if (ctrl) {
      if (key === "z" && !shift) history.undo();
      else if ((key === "z" && shift) || key === "y") history.redo();
      return;
    }
    if (latest.current.workspaceKind !== "canvas") return;
    if (key === "v") setCanvasMode("select");
    else if (key === "i") setCanvasMode("interact");
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextEditingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      const ctrl = event.ctrlKey || event.metaKey;
      const wanted = ctrl ? key === "z" || key === "y" : !event.altKey && (key === "v" || key === "i");
      if (!wanted) return;
      event.preventDefault();
      handleShortcutRef.current(key, ctrl, event.shiftKey);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => () => {
    pollTimers.current.forEach((timer) => window.clearInterval(timer));
    if (blockFeedbackTimer.current !== null) window.clearTimeout(blockFeedbackTimer.current);
  }, []);

  /* -------------------------------------------------------------- 规则预检 */

  const { ranges, tokenRulesNote } = useMemo(() => {
    const merged = { ...FALLBACK_RANGES };
    if (bootstrapState.status !== "ready") {
      return { ranges: merged, tokenRulesNote: "bootstrap 未就绪，按 antd 默认阶梯预检" };
    }
    const { ranges: parsed, parsed: ok } = parseTokenRules(bootstrapState.data.tokenRules);
    if (ok) {
      for (const [key, value] of Object.entries(parsed) as Array<[NumericTokenKey, NumericRange]>) merged[key] = value;
    }
    return {
      ranges: merged,
      tokenRulesNote: ok ? "阶梯来自 bootstrap tokenRules" : "tokenRules 未能解析，按 antd 默认阶梯预检，服务端为最终判据"
    };
  }, [bootstrapState]);

  const themeRules = useMemo(() => {
    if (!draft) return [];
    const numericRules = NUMERIC_TOKEN_KEYS.map((key) => ({
      id: `editor.theme.${key}.range`,
      source: ranges[key].source
    }));
    return themeClientRules(
      draft.theme,
      [...numericRules, { id: "editor.theme.tokenRules.source", source: tokenRulesNote }],
      baseTheme
    );
  }, [baseTheme, draft, ranges, tokenRulesNote]);

  // 组件 token 草稿的客户端预检（与服务端 normalizeComponentTokens 同语义，服务端仍是最终判据）：
  // 颜色必须六位 hex；数字逐项范围；「文字 ↔ 背景」配对只拦改成不达标，现状不达标给 pass + 建议色。
  const componentRules = useMemo(() => {
    if (!draft) return [];
    const state = latest.current.bootstrap?.componentTokens;
    const defaults = latest.current.bootstrap?.componentDefaults;
    const rules: import("./api").Rule[] = [];
    const resolveColors = (component: string, foreground: string, pair: string, changes: Record<string, number | string | null>) => {
      const effective: Record<string, number | string | undefined> = { ...defaults?.[component] };
      for (const [key, meta] of Object.entries(state?.[component] ?? {})) effective[key] = meta.value;
      for (const [key, value] of Object.entries(changes)) effective[key] = value === null ? defaults?.[component]?.[key] : value;
      const parse = (value: unknown) => value === "transparent" ? new FastColor({ r: 0, g: 0, b: 0, a: 0 }) : typeof value === "string" && /^(?:#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i.test(value) ? new FastColor(value) : null;
      const fg = parse(effective[foreground]);
      const bg = parse(pair.startsWith("global:") ? draft.theme[pair.slice(7) as keyof ThemeDraft] : effective[pair]);
      const underlay = parse(component === "Modal" ? effective.contentBg : draft.theme.colorBgContainer);
      if (!fg || !bg || !underlay) return null;
      const opaqueBackground = bg.onBackground(underlay.onBackground(new FastColor("#ffffff")));
      return [fg.onBackground(opaqueBackground), opaqueBackground] as const;
    };
    for (const [component, entries] of Object.entries(draft.components)) {
      if (!entries) continue;
      const defs = COMPONENT_TOKENS[component] ?? [];
      for (const [key, value] of Object.entries(entries)) {
        const def = defs.find((item) => item.name === key);
        if (!def) continue;
        if (value !== null && def.type === "color" && !/^#[0-9a-f]{6}$/i.test(String(value))) {
          rules.push({ id: `editor.component.${component}.${key}.format`, status: "fail", message: `${component}.${key} 必须是六位十六进制颜色` });
        }
        if (value !== null && def.type === "number" && def.range && (typeof value !== "number" || value < def.range.min || value > def.range.max || (def.range.integer && !Number.isInteger(value)))) {
          rules.push({ id: `editor.component.${component}.${key}.range`, status: "fail", message: `${component}.${key} 超出允许范围 ${def.range.min}–${def.range.max}` });
        }
      }
      for (const def of defs) {
        if (!def.pair || !def.writable) continue;
        const before = resolveColors(component, def.name, def.pair, {});
        const after = resolveColors(component, def.name, def.pair, entries);
        if (!before || !after) {
          const changed = def.name in entries || def.pair in entries || (component === "Modal" && "contentBg" in entries);
          rules.push({ id: `editor.component.${component}.${def.name}.contrast`, status: changed ? "fail" : "pass", message: changed ? "无法解析文字与背景的有效颜色，禁止写入" : "当前配对无法解析；未改动，不阻断其他项" });
          continue;
        }
        const a = after[0].getLuminance(), b = after[1].getLuminance();
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        if (ratio >= 4.5) continue;
        if (after[0].toHexString() !== before[0].toHexString() || after[1].toHexString() !== before[1].toHexString()) {
          rules.push({ id: `editor.component.${component}.${def.name}.contrast`, status: "fail", message: `${component}.${def.name} 与背景对比度 ${ratio.toFixed(2)}:1，低于 4.5:1，禁止写入` });
        } else {
          rules.push({ id: `editor.component.${component}.${def.name}.contrast`, status: "pass", message: `${component}.${def.name} 现状对比度 ${ratio.toFixed(2)} 低于 4.5:1；未改动，不阻断写入` });
        }
      }
    }
    return rules;
  }, [draft]);

  const allRules = useMemo(() => [...themeRules, ...componentRules], [themeRules, componentRules]);

  // 任一预检规则不通过都禁用写入（对比度不达标、字体非法、阴影非档位、--do-space 乱序、组件 token 预检）；服务端复核同语义。
  const rulesFailed = allRules.some((rule) => rule.status === "fail");
  const firstFailedRule = allRules.find((rule) => rule.status === "fail") ?? null;

  /* -------------------------------------------------------------- 写入与轮询 */

  const busy = submitting || patches.some((entry) => entry.patch.status === "checking" && !entry.unknown);

  const updateBlockFeedback = useCallback((patch: Patch, unavailable = false) => {
    if (patch.kind !== "block" || typeof patch.page !== "string" || !Array.isArray(patch.ops)) return;
    const blocks = [...new Set(patch.ops.filter((op) => op.page === patch.page).map((op) => op.block))];
    if (blocks.length === 0) return;
    if (blockFeedbackTimer.current !== null) {
      window.clearTimeout(blockFeedbackTimer.current);
      blockFeedbackTimer.current = null;
    }
    if (patch.status === "checking") {
      setBlockFeedback({ patchId: patch.id, page: patch.page, blocks, status: unavailable ? "unavailable" : "running" });
      return;
    }
    if (patch.status === "failed") {
      setBlockFeedback({ patchId: patch.id, page: patch.page, blocks, status: "failed" });
      blockFeedbackTimer.current = window.setTimeout(() => {
        setBlockFeedback((current) => (current?.patchId === patch.id ? null : current));
        blockFeedbackTimer.current = null;
      }, 5000);
      return;
    }
    setBlockFeedback((current) => (current?.patchId === patch.id ? null : current));
  }, []);

  const upsertPatch = useCallback((patch: Patch) => {
    setPatches((current) => {
      const index = current.findIndex((entry) => entry.patch.id === patch.id);
      if (index === -1) return [{ patch, updatedAt: Date.now() }, ...current];
      const next = [...current];
      next[index] = { patch, updatedAt: Date.now() };
      return next;
    });
    updateBlockFeedback(patch);
  }, [updateBlockFeedback]);

  const markPatchProgressUnavailable = useCallback((id: string) => {
    setPatches((current) =>
      current.map((entry) => (entry.patch.id === id ? { ...entry, progressUnavailable: true } : entry))
    );
    setBlockFeedback((current) => (current?.patchId === id ? { ...current, status: "unavailable" } : current));
  }, []);

  const markPatchUnknown = useCallback((id: string) => {
    setPatches((current) =>
      current.map((entry) => (entry.patch.id === id ? { ...entry, progressUnavailable: true, unknown: true } : entry))
    );
    setBlockFeedback((current) => (current?.patchId === id ? { ...current, status: "unavailable" } : current));
  }, []);

  const refreshAfterTerminal = useCallback(() => {
    void loadBootstrap();
    setFrameNonce((nonce) => nonce + 1);
    setFrameReady(false);
    resetInspection();
  }, [loadBootstrap, resetInspection]);

  const pollPatch = useCallback(
    (id: string, kind?: Patch["kind"]) => {
      if (polledIds.current.has(id)) return;
      polledIds.current.add(id);
      const startedAt = Date.now();
      const maxWait = kind === "block" ? 11 * 60 * 1000 : 6 * 60 * 1000;
      let failures = 0;
      let stopped = false;
      const timer = window.setInterval(async () => {
        if (Date.now() - startedAt > maxWait) {
          // 超时与连续失败一致：停止轮询、释放写入锁，标成「状态未知」，真实状态以服务端为准。
          stopped = true;
          window.clearInterval(timer);
          markPatchUnknown(id);
          appendIssue("POLL_TIMEOUT", `Patch ${id} 超过 ${Math.ceil(maxWait / 60000)} 分钟未到终态，已停止轮询，状态未知，请刷新确认。`);
          return;
        }
        try {
          const patch = await fetchPatch(id);
          failures = 0;
          if (stopped && patch.status === "checking") return;
          upsertPatch(patch);
          if (patch.status !== "checking") {
            stopped = true;
            window.clearInterval(timer);
            refreshAfterTerminal();
          }
        } catch (cause) {
          if (stopped) return;
          failures += 1;
          markPatchProgressUnavailable(id);
          const error = errorText(cause);
          if (failures < 3) {
            appendIssue(error.code, `Patch ${id} 轮询失败（连续第 ${failures} 次，继续重试）：${error.message}`);
            return;
          }
          // 连续 3 次失败：停止轮询并释放写入锁；不把 Patch 标成通过或失败，真实状态以服务端为准。
          stopped = true;
          window.clearInterval(timer);
          markPatchUnknown(id);
          appendIssue(error.code, `Patch ${id} 连续 3 次轮询失败，已停止轮询，状态未知，请刷新确认：${error.message}`);
        }
      }, 1200);
      pollTimers.current.push(timer);
    },
    [appendIssue, markPatchProgressUnavailable, markPatchUnknown, refreshAfterTerminal, upsertPatch]
  );

  // 刷新或服务重启后，从服务端找回最近的改动记录：记录页签与「撤销最近一次写入」随之恢复；
  // 仍在检查中的记录继续轮询。本地已有的条目（刚写入、或已标成状态未知）不被覆盖。
  const syncPatchList = useCallback(async () => {
    try {
      const list = await fetchPatchList();
      setPatches((current) => {
        const local = new Map(current.map((entry) => [entry.patch.id, entry]));
        const merged = list.map((patch) => {
          const existing = local.get(patch.id);
          local.delete(patch.id);
          return existing ?? { patch, updatedAt: Date.now() };
        });
        return [...local.values(), ...merged].sort((a, b) => b.patch.createdAt.localeCompare(a.patch.createdAt));
      });
      for (const patch of list) {
        if (patch.status !== "checking") continue;
        updateBlockFeedback(patch);
        pollPatch(patch.id, patch.kind);
      }
    } catch (cause) {
      const error = errorText(cause);
      appendIssue(error.code, `读取改动记录失败：${error.message}`);
    }
  }, [appendIssue, pollPatch, updateBlockFeedback]);

  useEffect(() => {
    if (bootstrapState.status !== "ready" || patchListLoaded.current) return;
    patchListLoaded.current = true;
    void syncPatchList();
  }, [bootstrapState.status, syncPatchList]);

  // 组件 token 草稿里真正需要写回的项目：值为 null（恢复）但源码本来就没有该行 = 无改动，不发起。
  const collectComponentChanges = useCallback((): Array<{ component: string; tokens: Record<string, number | string | null> }> => {
    const current = latest.current.draft;
    if (!current) return [];
    const state = latest.current.bootstrap?.componentTokens;
    const list: Array<{ component: string; tokens: Record<string, number | string | null> }> = [];
    for (const [component, entries] of Object.entries(current.components)) {
      if (!entries) continue;
      const tokens: Record<string, number | string | null> = {};
      for (const [key, value] of Object.entries(entries)) {
        if (value === undefined) continue;
        if (value === null && !state?.[component]?.[key]) continue;
        tokens[key] = value;
      }
      if (Object.keys(tokens).length > 0) list.push({ component, tokens });
    }
    return list;
  }, []);

  // 链式写入的等待：1.2s 轮询到终态。普通写入上限 6 分钟；区块 AI 改写按服务端 10 分钟超时留 1 分钟收尾。
  const settlePatch = useCallback(
    async (id: string, maxWait = 6 * 60 * 1000): Promise<Patch> => {
      const startedAt = Date.now();
      let failures = 0;
      for (;;) {
        if (Date.now() - startedAt > maxWait) {
          markPatchUnknown(id);
          throw new Error(`Patch ${id} 超过 ${Math.ceil(maxWait / 60000)} 分钟未到终态，已停止等待，真实状态以服务端为准。`);
        }
        let patch: Patch | null = null;
        try {
          patch = await fetchPatch(id);
          failures = 0;
        } catch (cause) {
          failures += 1;
          markPatchProgressUnavailable(id);
          if (failures >= 3) throw cause;
        }
        if (patch) {
          upsertPatch(patch);
          if (patch.status !== "checking") return patch;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
      }
    },
    [markPatchProgressUnavailable, markPatchUnknown, upsertPatch]
  );

  // 「写入项目」共用顶栏按钮：草稿同时含组件 token 与主题改动时，先按组件逐个写回（各自一条 Patch 记录，
  // 全部到终态后才继续下一条），最后写主题——跟随 / 单独设置语义下组件的单独设置行不会被主题写回覆盖。
  const writeAll = useCallback(async () => {
    if (!draft || rulesFailed) return;
    const files = latest.current.bootstrap?.files ?? [];
    if (blocksDirty) {
      if (nonBlockDirty) {
        appendIssue("MIXED_DRAFT", "区块改写与主题、组件或实例草稿需要分开写入，避免刷新时丢失另一类未提交改动。");
        return;
      }
      const ai = latest.current.bootstrap?.ai;
      if (!ai?.available) {
        appendIssue("AI_UNAVAILABLE", `区块改写不可用：${ai?.reason?.trim() || "本机 AI 适配器没有就绪"}`);
        return;
      }
      const grouped = new Map<string, BlockOp[]>();
      for (const op of draft.blocks ?? []) {
        const pageOps = grouped.get(op.page);
        if (pageOps) pageOps.push(op);
        else grouped.set(op.page, [op]);
      }
      const prepared: Array<{ page: string; ops: BlockOp[]; file: NonNullable<ReturnType<typeof blockPatchFile>>; route: string }> = [];
      for (const [page, ops] of grouped) {
        const file = blockPatchFile(files, page);
        if (!file) {
          appendIssue("EXPECTED_FILES_UNKNOWN", `bootstrap.files 中找不到页面 ${page} 的唯一源码 Hash，无法安全发起区块改写。`);
          return;
        }
        const route = latest.current.bootstrap?.routes.find((entry) => entry.id === page)?.route ?? activeRoute?.route ?? "/dashboard";
        prepared.push({ page, ops, file, route });
      }
      setSubmitting(true);
      try {
        for (const item of prepared) {
          const patch = await submitBlockPatch({ page: item.page, ops: item.ops, expectedFiles: [item.file], route: item.route });
          upsertPatch(patch);
          const terminal = patch.status === "checking" ? await settlePatch(patch.id, 11 * 60 * 1000) : patch;
          if (terminal.status === "cancelled") return;
          if (terminal.status !== "checks-passed") {
            throw new Error(terminal.autoReverted ? "区块改写没有通过，项目文件已自动撤销；预览草稿仍保留。" : "区块改写没有通过；详情见「改动记录」。");
          }
        }
        refreshAfterTerminal();
      } catch (cause) {
        const error = errorText(cause);
        appendIssue(error.code, error.message);
      } finally {
        setSubmitting(false);
      }
      return;
    }
    const componentChanges = collectComponentChanges();
    const themeFiles = themePatchFiles(files);
    let themeTsEntry = componentPatchFile(files);
    if (componentChanges.length > 0 && !themeTsEntry) {
      appendIssue("EXPECTED_FILES_UNKNOWN", "bootstrap.files 中找不到 theme.ts 的 Hash，无法安全写入组件 token。");
      return;
    }
    if (themeDirty && !themeFiles) {
      appendIssue("EXPECTED_FILES_UNKNOWN", "bootstrap.files 中找不到 theme.ts 或 generated/styles.css 的 Hash，无法安全写入。");
      return;
    }
    setSubmitting(true);
    try {
      for (const change of componentChanges) {
        const patch = await submitComponentPatch(change.component, change.tokens, [themeTsEntry!], activeRoute?.route ?? "/dashboard");
        upsertPatch(patch);
        const terminal = patch.status === "checking" ? await settlePatch(patch.id) : patch;
        const written = terminal.files.find((file) => /(^|\/)theme\.ts$/.test(file.file));
        if (written) themeTsEntry = { file: written.file, sha256: written.afterSha256 };
        if (terminal.status === "failed") {
          throw new Error(`组件 ${change.component} 写入后的检查未通过，已停止后续写入；详情见「记录」页签。`);
        }
      }
      for(const [component,parts] of Object.entries(draft.structures??{}))for(const [part,styles] of Object.entries(parts)){
        if(!themeTsEntry)throw new Error("缺少组件样式文件 Hash");
        const patch=await submitStructurePatch(component,part,styles,[themeTsEntry],activeRoute?.route??"/dashboard");upsertPatch(patch);
        const terminal=patch.status==="checking"?await settlePatch(patch.id):patch;
        const written=terminal.files[0];if(written)themeTsEntry={file:written.file,sha256:written.afterSha256};
        if(terminal.status!=="checks-passed")throw new Error("结构层写入检查未通过，停止后续写入。");
      }
      for(const instance of draft.instances??[]){
        const file=findFileSha(files,instance.loc.file);if(!file)throw new Error("缺少实例源码 Hash");
        const patch=await submitInstancePatch(instance,[file],activeRoute?.route??"/dashboard");upsertPatch(patch);
        const terminal=patch.status==="checking"?await settlePatch(patch.id):patch;
        if(terminal.status!=="checks-passed")throw new Error("实例写入检查未通过，停止后续写入。");
      }
      if (themeDirty) {
        const cssEntry = themeFiles![1];
        const patch = await submitThemePatch(draft.theme, [themeTsEntry!, cssEntry], activeRoute?.route ?? "/dashboard");
        upsertPatch(patch);
        if (patch.status === "checking") await settlePatch(patch.id);
      }
      refreshAfterTerminal();
    } catch (cause) {
      const error = errorText(cause);
      appendIssue(error.code, error.message);
    } finally {
      setSubmitting(false);
    }
  }, [activeRoute, appendIssue, blocksDirty, collectComponentChanges, draft, nonBlockDirty, rulesFailed, refreshAfterTerminal, settlePatch, themeDirty, upsertPatch]);

  const applyCandidate = useCallback(
    async (candidate: Candidate, confirmedUnmappedProps: string[]) => {
      const current = selection;
      if (!current?.file) return;
      setSubmitting(true);
      try {
        const patch = await submitReplacePatch({
          loc: current.loc,
          candidateId: candidate.id,
          expectedFiles: [current.file],
          confirmedUnmappedProps,
          route: activeRoute?.route ?? "/dashboard"
        });
        upsertPatch(patch);
        if (patch.status === "checking") pollPatch(patch.id, patch.kind);
        else refreshAfterTerminal();
      } catch (cause) {
        const error = errorText(cause);
        appendIssue(error.code, error.message);
      } finally {
        setSubmitting(false);
      }
    },
    [activeRoute, appendIssue, pollPatch, refreshAfterTerminal, selection, upsertPatch]
  );

  // 与服务端撤销规则一致：只有真的改过文件、且尚未撤销的写入才可撤销。
  // 被拒绝的请求（规则未通过、越界等）也会留一条 failed 记录，但没有文件，不能当成撤销目标。
  const latestUndoable = useMemo(() => {
    const target = patches.find(
      (entry) =>
        entry.patch.kind !== "undo" &&
        entry.patch.files.length > 0 &&
        !entry.patch.undoneBy &&
        !entry.patch.autoReverted &&
        (entry.patch.status === "checks-passed" || entry.patch.status === "failed")
    );
    return target?.patch.id ?? null;
  }, [patches]);

  const undo = useCallback(
    async (patch: Patch) => {
      setSubmitting(true);
      try {
        const record = await undoPatch(patch.id);
        upsertPatch(record);
        if (record.status === "checking") pollPatch(record.id, record.kind);
        else refreshAfterTerminal();
      } catch (cause) {
        const error = errorText(cause);
        appendIssue(error.code, error.message);
      } finally {
        setSubmitting(false);
      }
    },
    [appendIssue, pollPatch, refreshAfterTerminal, upsertPatch]
  );

  const cancelBlock = useCallback(
    async (patch: Patch) => {
      if (patch.kind !== "block" || patch.status !== "checking") return;
      try {
        const record = await cancelBlockPatch(patch.id);
        upsertPatch(record);
      } catch (cause) {
        const error = errorText(cause);
        appendIssue(error.code, `取消区块改写失败：${error.message}`);
      }
    },
    [appendIssue, upsertPatch]
  );

  /* -------------------------------------------------------------- 舞台 */

  const showMatrix = workspace.kind === "component";
  const showProject = workspace.kind === "canvas" || (workspace.kind === "system" && view === "project");
  const showFrame = showMatrix || showProject;

  const frameSrc = useMemo(() => {
    if (showMatrix && workspace.kind === "component") {
      return `/editor/matrix?component=${encodeURIComponent(workspace.name)}&editor=1`;
    }
    if (!activeRoute) return null;
    const sep = activeRoute.path.includes("?") ? "&" : "?";
    return `${activeRoute.path}${sep}editor=1`;
  }, [activeRoute, showMatrix, workspace]);

  const frameKey = `${showMatrix ? "matrix" : "project"}|${frameSrc ?? "none"}|${frameNonce}`;

  // 换 iframe（切分区、切页面、写入后重载）后，旧的 ready 不再有效，等新子端上报。
  useEffect(() => {
    setFrameReady(false);
    pushedDraft.current = null;
    setBlockState(null);
    resetInspection();
  }, [frameKey, resetInspection]);

  const reloadFrame = useCallback(() => {
    setFrameReady(false);
    setFrameNonce((nonce) => nonce + 1);
    resetInspection();
  }, [resetInspection]);

  const frameTitle =
    workspace.kind === "canvas"
      ? `画布 · ${activeRoute?.title ?? ""}`
      : showMatrix && workspace.kind === "component"
        ? `组件矩阵 · ${workspace.name}`
        : `应用到项目 · ${activeRoute?.title ?? ""}`;

  // 图层树点击：只发出选中请求，子页滚动到可见、高亮并回报详情。
  const selectNode = useCallback((loc: string, nth: number) => {
    postToChild(frameRef.current, "select-element", { loc, nth });
  }, []);
  const selectPart = useCallback((key: string, nth: number) => {
    postToChild(frameRef.current, "select-part", { key, nth });
  }, []);

  /* -------------------------------------------------------------- 状态行与可用性 */

  const bootstrapError = bootstrapState.status === "error" ? bootstrapState.error : null;

  const statusLine = useMemo(() => {
    if (bootstrapState.status === "loading") return "正在连接本地编辑接口…";
    if (bootstrapError) return `接口不可用：${bootstrapError.code} ${bootstrapError.message}`;
    const unknownEntry = patches.find((entry) => entry.unknown);
    const checking = patches.filter((entry) => entry.patch.status === "checking" && !entry.unknown);
    if (checking.length === 0 && unknownEntry) {
      return `Patch ${unknownEntry.patch.id.slice(0, 8)}… 状态未知，请刷新确认`;
    }
    if (checking.length > 0) {
      const entry = checking[0];
      const patch = entry.patch;
      if (patch.kind === "block") {
        if (entry.progressUnavailable) return "区块改写中 · 进度暂时拿不到";
        const latestProgress = [...(patch.progress ?? [])].reverse()[0];
        return latestProgress?.message || "AI 正在改写这一块（通常 1–3 分钟）";
      }
      const done = patch.checks.filter((check) => check.status === "passed" || check.status === "failed").length;
      return `检查中 ${patch.id.slice(0, 8)}…（${done}/${patch.checks.length} 项有结果）`;
    }
    if (blocksDirty) return "预览中 · 区块改动可交给 AI 写入项目";
    return dirty ? "预览中 · 改动未写入" : "与项目源码一致";
  }, [blocksDirty, bootstrapError, bootstrapState.status, dirty, patches]);

  const writeDisabledReason = useMemo(() => {
    if (bootstrapState.status !== "ready") return "接口未就绪";
    if (!dirty) return "当前没有未写入的改动";
    if (blocksDirty && nonBlockDirty) return "区块改写与主题、组件或实例草稿需要分开写入";
    if (blocksDirty && !bootstrapState.data.ai?.available) {
      return `区块改写不可用：${bootstrapState.data.ai?.reason?.trim() || "本机 AI 适配器没有就绪"}`;
    }
    if (rulesFailed) return `预检未通过：${firstFailedRule?.message ?? "见右栏「更多设置」里的规则与检查"}`;
    if (busy) return "有检查仍在进行";
    if (blocksDirty) {
      const missingPage = [...new Set(draft?.blocks?.map((op) => op.page) ?? [])].find(
        (page) => !blockPatchFile(bootstrapState.data.files, page)
      );
      return missingPage ? `缺少页面 ${missingPage} 的源码 Hash，无法安全写入` : null;
    }
    if (latest.current.bootstrap && !themePatchFiles(latest.current.bootstrap.files)) {
      return "缺少 theme.ts / styles.css 的 Hash，无法安全写入";
    }
    return null;
  }, [blocksDirty, bootstrapState, busy, dirty, draft?.blocks, firstFailedRule, nonBlockDirty, rulesFailed]);

  /* -------------------------------------------------------------- 顶条标题与摘要 */

  const { stripTitle, stripSummary } = useMemo(() => {
    if (workspace.kind === "canvas") {
      return { stripTitle: activeRoute?.title ?? "等待页面清单", stripSummary: "" };
    }
    if (workspace.kind === "component") {
      const item = P0_COMPONENTS.find((entry) => entry.name === workspace.name);
      return {
        stripTitle: workspace.name,
        stripSummary: item ? `${item.label} · ${item.groups.join(" · ")}` : "不在 P0 目录内"
      };
    }
    const title = SYSTEM_SECTIONS.find((section) => section.id === workspace.id)?.label ?? "";
    if (!draft) return { stripTitle: title, stripSummary: "等待接口提供主题值" };
    const ratio = contrastWithWhite(draft.theme.colorPrimary);
    const ratioText = ratio === null ? "无法计算" : `${ratio.toFixed(2)} ${contrastLevel(ratio).label}`;
    switch (workspace.id) {
      case "color":
        return { stripTitle: title, stripSummary: `主色 ${upperHex(draft.theme.colorPrimary)} · 对比度 ${ratioText}` };
      case "typography": {
        const derived = deriveTokens(draft.theme);
        return {
          stripTitle: title,
          stripSummary: `基础字号 ${formatPx(draft.theme.fontSize)} · 行高 ${draft.theme.lineHeight} · h1 ${formatPx(derived.font.headings[0])}`
        };
      }
      case "icons":
        return { stripTitle: title, stripSummary: "图标库由合同锁定，只读" };
      case "spacing":
        return { stripTitle: title, stripSummary: `--do-space ${formatPx(draft.theme.spaceSm)} / ${formatPx(draft.theme.spaceMd)} / ${formatPx(draft.theme.spaceLg)} · 控件高度 ${formatPx(draft.theme.controlHeight)}` };
      case "radius":
        return { stripTitle: title, stripSummary: `圆角 ${formatPx(draft.theme.borderRadius)} · 大圆角 ${formatPx(draft.theme.borderRadiusLG)} · 动效 ${draft.theme.motion ? "开" : "关"}` };
      case "grid":
        return { stripTitle: title, stripSummary: "断点与壳层宽度，只读" };
      default:
        return { stripTitle: title, stripSummary: "" };
    }
  }, [activeRoute, draft, workspace]);

  /* -------------------------------------------------------------- 检查器「样式」内容 */

  const { groups: tokenGroups, showDerived } = tokenGroupsFor(workspace);
  const panelTitle =
    workspace.kind === "component"
      ? workspace.name
      : workspace.kind === "canvas"
        ? "画布"
        : (SYSTEM_SECTIONS.find((section) => section.id === workspace.id)?.label ?? "");

  const foundations = bootstrapState.status === "ready" ? (bootstrapState.data.foundations ?? null) : null;
  // 图标、布局栅格两个只读分区：一眼信息在右栏主区，技术细节（库名、断点名、各文件用量）收进「更多设置」。
  const readonlyInfo =
    workspace.kind === "system" && workspace.id === "icons" ? (
      <IconsInfo icons={foundations?.icons} part="summary" />
    ) : workspace.kind === "system" && workspace.id === "grid" ? (
      <GridInfo grid={foundations?.grid} part="summary" />
    ) : null;
  const readonlyDetails =
    workspace.kind === "system" && workspace.id === "icons" ? (
      <IconsInfo icons={foundations?.icons} part="details" />
    ) : workspace.kind === "system" && workspace.id === "grid" ? (
      <GridInfo grid={foundations?.grid} part="details" />
    ) : null;

  const componentTokenPane =
    workspace.kind === "component" && draft ? (
      <ComponentTokenEditor
        component={workspace.name}
        derived={derivedDefaults?.[workspace.name]}
        disabled={bootstrapState.status !== "ready"}
        draft={draft.components[workspace.name]}
        onChange={(tokens) => {
          const next: EditorDraft = { ...draft, components: { ...draft.components } };
          // undefined = 撤掉这一条草稿（恢复跟随全局）； null = 写入时删除源码行（恢复跟随全局）。
          const merged: Record<string, ComponentTokenDraftEntry[string] | undefined> = { ...(next.components[workspace.name] ?? {}), ...tokens };
          for (const [key, value] of Object.entries(merged)) if (value === undefined) delete merged[key];
          if (Object.keys(merged).length === 0) delete next.components[workspace.name];
          else next.components[workspace.name] = merged as ComponentTokenDraftEntry;
          history.change(next, `component.${workspace.name}.${Object.keys(tokens).sort().join(",")}`);
        }}
        partKey={partDetail && partDetail.component === workspace.name ? partDetail.key : null}
        state={bootstrapState.status === "ready" ? bootstrapState.data.componentTokens?.[workspace.name] : undefined}
        values={componentValues[workspace.name]}
      />
    ) : null;

  const tokenControls = draft ? (
    <>
      {tokenGroups.length > 0 ? (
        <div className="ludi-draft-actions">
          <Button
            disabled={!themeDirty || !baseTheme}
            onClick={() => {
              if (baseTheme) history.change({ ...draft, theme: baseTheme }, "reset");
            }}
            size="small"
          >
            全部还原为项目当前值
          </Button>
        </div>
      ) : null}
      {readonlyInfo}
      {tokenGroups.length > 0 ? (
        <TokenEditor
          baseline={baseTheme}
          disabled={bootstrapState.status !== "ready"}
          draft={draft.theme}
          groups={tokenGroups}
          onChange={(next) => {
            const clamped: ThemeDraft = { ...next };
            for (const key of NUMERIC_TOKEN_KEYS) clamped[key] = clampNumber(next[key], ranges[key]).value;
            const changed = (Object.keys(clamped) as Array<keyof ThemeDraft>).find((key) => clamped[key] !== draft.theme[key]);
            history.change({ ...draft, theme: clamped }, changed ?? "theme");
          }}
          ranges={ranges}
          showDerived={false}
        />
      ) : null}
    </>
  ) : (
    <div className="ludi-muted">
      {bootstrapError ? "接口不可用，主题控件暂不可用。" : "正在连接本地编辑接口…"}
    </div>
  );
  // 由主题值推出来的只读阶梯（派生色阶、标题阶梯等）：放进「更多设置」。
  const systemMore = (
    <>
      {readonlyDetails}
      {draft && showDerived && tokenGroups.length > 0 ? (
        <TokenEditor
          baseline={baseTheme}
          disabled
          draft={draft.theme}
          groups={tokenGroups}
          onChange={() => undefined}
          onlyDerived
          ranges={ranges}
          showDerived
        />
      ) : null}
    </>
  );

  const selectedDraft=draft?.instances?.find(instance=>locKey(instance.loc)=== (selection?locKey(selection.loc):"") && instance.instanceKey===(selection?.instanceKey??null));
  const anotherInstanceDraft=Boolean(draft?.instances?.length&&!selectedDraft);
  const appearanceEdit: AppearanceEdit = {
    model: instanceModel,
    pending: instancePending,
    error: instanceError,
    changes: selectedDraft?.changes,
    instanceKey: selection?.instanceKey ?? null,
    disabled: busy || anotherInstanceDraft || (selection?.instanceCount ?? 1) > 1,
    onChange: (changes: InstanceChanges) => {
      if (!draft || !selection) return;
      history.change({ ...draft, instances: Object.keys(changes).length ? [{ loc: selection.loc, instanceKey: selection.instanceKey ?? null, changes }] : [] }, `instance.${selectedId}`);
    }
  };
  const instancePane=selection?<><InstanceEditor model={instanceModel} pending={instancePending} error={instanceError} changes={selectedDraft?.changes} instanceKey={selection.instanceKey??null} disabled={appearanceEdit.disabled} onChange={appearanceEdit.onChange}/>{anotherInstanceDraft?<p className="ludi-muted">另一实例还有草稿，请先写入或撤销预览改动。</p>:null}</>:null;
  const structureValues:StructureDraft={};
  const structureComponent=workspace.kind==="component"?workspace.name:null;
  if(structureComponent){
    Object.assign(structureValues,bootstrapState.status==="ready"?bootstrapState.data.structures?.[structureComponent]:{});
    for(const [part,fields] of Object.entries(draft?.structures?.[structureComponent]??{}))structureValues[part]={...structureValues[part],...fields};
  }
  const structurePane=structureComponent&&draft&&bootstrapState.status==="ready"?<><p className="ludi-muted">作用于项目内所有 {structureComponent}；单个实例请在画布选择。</p><StructureEditor component={structureComponent} parts={bootstrapState.data.structureParts?.[structureComponent]??[]} values={structureValues} partKey={partDetail?.key??null} disabled={busy} onChange={(part,fields)=>history.change({...draft,structures:{...draft.structures,[structureComponent]:{...draft.structures?.[structureComponent],[part]:{...draft.structures?.[structureComponent]?.[part],...fields}}}},`structure.${structureComponent}.${part}`)}/></>:null;
  const impactPane=<ImpactPanel catalog={impactCatalog} pending={impactPending} error={impactError} viewportWidth={stageWidth} instanceKey={draft?.instances?.[0]?.instanceKey??selection?.instanceKey??null} onPickRoute={page=>{setWorkspace({kind:"canvas"});pickRoute(page.id);setShowBefore(false);}}/>;

  const blockRegistry = workspace.kind === "canvas" && activeRoute ? registryForRoute(activeRoute.id) : null;
  const applyBlockOp = (op: BlockOp) => {
    if (!draft) return;
    const ops = draft.blocks ?? [];
    history.change({ ...draft, blocks: [...ops, op] }, `block.${op.kind}.${op.block}.${ops.length}`);
    // 删除后被删的那个实例不在画布上了，若正是当前选中项，右栏回到未选中状态；撤销一步即可恢复。
    if (op.kind === "delete") {
      const deletedId = op.instance ?? op.block;
      if (detail?.block?.id === deletedId) {
        setSelection(null);
        setDetail(null);
      }
    }
    // 新增同类：产生的副本是独立实例，画布落地后直接选中它（可单独删除/移动/替换/问 AI）。
    if (op.kind === "add") {
      const copy = [...ops, op].filter((item) => item.page === op.page && item.kind === "add" && item.block === op.block).length;
      const iid = `${op.block}#c${copy}`;
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => postToChild(frameRef.current, "select-block", { id: iid }))
      );
    }
  };
  const blocksUi: BlocksUi | null = blockRegistry
    ? {
        registry: blockRegistry,
        visible: blockState?.page === blockRegistry.pageId ? blockState.visible : blockRegistry.blocks.map((block) => block.id),
        ops: draft?.blocks ?? [],
        disabled: busy,
        ai:
          bootstrapState.status === "ready"
            ? (bootstrapState.data.ai ?? { available: false, reason: "接口没有提供 AI 可用状态" })
            : { available: false, reason: "本地编辑接口未就绪" },
        onOp: applyBlockOp,
        onAskAdvice: (block: string, operation: BlockOpKind, state: { activeTemplate?: string | null; instance?: string | null }) =>
          fetchBlockAdvice(blockRegistry.pageId, block, operation, state),
        onSelectBlock: (id) => postToChild(frameRef.current, "select-block", { id }),
        onUndoStep: history.undo
      }
    : null;
  const layerBlockMeta = blockRegistry && detail?.block && !detail.block.self ? blockById(blockRegistry, baseBlockId(detail.block.id)) : null;
  const impactSummary = {
    pending: impactPending,
    error: impactError,
    pages: impactCatalog?.pages.length ?? 0,
    locations: impactCatalog?.locations.length ?? 0
  };

  /* -------------------------------------------------------------- 渲染 */

  const showToggle = workspace.kind === "system";
  const showRouteSelect = showProject && routes.length > 0;

  return (
    <div className={resizing ? "ludi-editor ludi-editor--resizing" : "ludi-editor"}>
      <header className="ludi-editor__topbar">
        <div className="ludi-editor__brand">
          <span aria-hidden="true" className="ludi-editor__mark" />
          <strong>组件库编辑器</strong>
          <small>小豆盒设备运营 · {PROJECT_ID}</small>
        </div>
        <div className="ludi-editor__center">
          <Tooltip title="撤销预览改动（Ctrl+Z）">
            <Button
              aria-label="撤销预览改动"
              className="ludi-icon-button ludi-icon-button--bar"
              disabled={!history.canUndo}
              icon={<Undo2 aria-hidden size={16} strokeWidth={1.75} />}
              onClick={history.undo}
              type="text"
            />
          </Tooltip>
          <Tooltip title="重做预览改动（Ctrl+Shift+Z）">
            <Button
              aria-label="重做预览改动"
              className="ludi-icon-button ludi-icon-button--bar"
              disabled={!history.canRedo}
              icon={<Redo2 aria-hidden size={16} strokeWidth={1.75} />}
              onClick={history.redo}
              type="text"
            />
          </Tooltip>
        </div>
        <div className="ludi-editor__status">
          <span
            className={`ludi-editor__status-dot ludi-editor__status-dot--${
              bootstrapError ? "error" : busy || bootstrapState.status === "loading" ? "busy" : dirty ? "dirty" : "ok"
            }`}
          />
          <span className="ludi-editor__status-text">{statusLine}</span>
          {bootstrapError ? (
            <Button onClick={() => void loadBootstrap()} size="small">
              重试连接
            </Button>
          ) : null}
          <Tooltip title={writeDisabledReason ?? undefined}>
            <span>
              <Button disabled={Boolean(writeDisabledReason)} onClick={writeAll} size="small" type="primary">
                写入项目
              </Button>
            </span>
          </Tooltip>
        </div>
      </header>

      <div className="ludi-editor__body" style={bodyStyle}>
        <aside className="ludi-editor__panel ludi-editor__panel--left" ref={leftPanelRef}>
          <ResizeHandle measure={measureLeft} value={panelWidths.left} onDragChange={setResizing} onResize={(value) => setPanelWidth("left", value)} side="left" />
          <Nav
            layers={
              <LayerPanel
                detail={detail}
                layers={layers}
                blockLink={layerBlockMeta ? { name: layerBlockMeta.name, onClick: () => postToChild(frameRef.current, "select-block", { id: layerBlockMeta.id }) } : null}
                onSelectNode={selectNode}
                onSelectPart={selectPart}
                partDetail={partDetail}
                workspace={workspace}
              />
            }
            onOpenCanvas={openCanvas}
            onOpenComponent={openComponent}
            onOpenSystem={openSystem}
            workspace={workspace}
          />
        </aside>

        <main className="ludi-stage">
          <div className="ludi-stage__bar">
            <div className="ludi-stage__heading">
              <strong>{stripTitle}</strong>
              {stripSummary ? <span>{stripSummary}</span> : null}
            </div>
            <div className="ludi-stage__tools">
              {showRouteSelect ? (
                <Select
                  aria-label="切换应用页面"
                  className="ludi-route-select"
                  onChange={pickRoute}
                  options={routes.map((route) => ({ label: route.title, value: route.id }))}
                  popupMatchSelectWidth={false}
                  size="small"
                  value={activeRoute?.id ?? undefined}
                  variant="filled"
                />
              ) : null}
              {workspace.kind === "canvas" ? (
                <Segmented
                  aria-label="画布模式"
                  onChange={(value) => setCanvasMode(value as CanvasMode)}
                  options={[
                    { label: "选择", value: "select", title: "选择模式（V）：点击只选中元素" },
                    { label: "交互", value: "interact", title: "交互模式（I）：点击正常操作页面" }
                  ]}
                  size="small"
                  value={canvasMode}
                />
              ) : null}
              {showToggle ? (
                <Segmented
                  onChange={(value) => setView(value as StageView)}
                  options={[
                    { label: "规范", value: "docs" },
                    { label: "应用到项目", value: "project" }
                  ]}
                  size="small"
                  value={view}
                />
              ) : null}
              {showFrame ? (
                <Segmented aria-label="修改前后对比" size="small" value={showBefore?"before":"after"} options={[{label:"修改前",value:"before"},{label:"修改后",value:"after"}]} onChange={value=>setShowBefore(value==="before")}/>
              ) : null}
              {showFrame ? (
                <Button
                  aria-label="重新加载预览"
                  className="ludi-icon-button ludi-icon-button--bar"
                  icon={<RotateCw aria-hidden size={15} strokeWidth={1.75} />}
                  onClick={reloadFrame}
                  type="text"
                />
              ) : null}
            </div>
          </div>


          {showFrame ? (
            <div ref={stageRef} className={showMatrix ? "ludi-stage__canvas ludi-stage__canvas--bleed" : "ludi-stage__canvas"}>
              {frameSrc ? (
                <><iframe id="ludi-stage-frame" key={frameKey} ref={frameRef} src={frameSrc} title={frameTitle} style={showBefore?{display:"none"}:undefined}/>{showBefore?<iframe id="ludi-before-frame" src={frameSrc} title={`修改前 · ${frameTitle}（项目当前值，默认页面状态）`} style={{pointerEvents:"none"}}/>:null}</>
              ) : (
                <div className="ludi-stage__empty">
                  <p>接口未提供页面清单，项目预览不可用。</p>
                  <Button onClick={() => void loadBootstrap()}>重试连接</Button>
                </div>
              )}
            </div>
          ) : (
            <div className="ludi-stage__scroll" key={workspace.kind === "system" ? workspace.id : "x"}>
              {draft && workspace.kind === "system" ? (
                <SpecView draft={draft.theme} foundations={foundations} section={workspace.id} />
              ) : (
                <div className="ludi-muted">{bootstrapError ? "接口不可用。" : "正在连接本地编辑接口…"}</div>
              )}
            </div>
          )}
        </main>

        <aside className="ludi-editor__panel ludi-editor__panel--right" ref={rightPanelRef}>
          <ResizeHandle measure={measureRight} value={panelWidths.right} onDragChange={setResizing} onResize={(value) => setPanelWidth("right", value)} side="right" />
          <Inspector
            appearance={appearanceEdit}
            blocks={blocksUi}
            impactSummary={impactSummary}
            bridgeIssues={bridgeIssues}
            busy={busy}
            componentTokens={componentTokenPane}
            instanceControls={instancePane}
            structureControls={structurePane}
            impactControls={impactPane}
            detail={detail}
            latestUndoableId={latestUndoable}
            onApplyCandidate={applyCandidate}
            onCancelBlock={cancelBlock}
            onUndo={undo}
            panelTitle={panelTitle}
            partDetail={partDetail}
            patches={patches}
            selection={selection}
            themeRules={allRules}
            tokenControls={tokenControls}
            systemMore={systemMore}
            view={workspace.kind === "canvas" ? "canvas" : workspace.kind === "component" ? "matrix" : "system"}
          />
        </aside>
      </div>
    </div>
  );
}
