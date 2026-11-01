// kit/preview/EDITOR-PROTOCOL.md v1 的客户端类型与请求层。JSON 合同以协议为唯一权威；
// 这里不引入 editor-server 的任何符号，两端各自实现协议。

export const PROTOCOL_VERSION = 1;
export const PROJECT_ID = "tianshu-device-ops";

// 协议主题字段（26 个，与 editor-server/theme.mjs 的 themeKeys 一一对应）：
// 颜色 10 + 字体 2 + 字号/行高 2 + 间距 6 + 控件高度 1 + 圆角与效果 5。
// spaceSm/Md/Lg 只写 generated/styles.css 的 --do-space-*；shadowLevel 由服务端映射 boxShadow 两条 token。
export type ShadowLevel = "none" | "light" | "default" | "deep";

// custom 只作为服务端读出的状态（源码 boxShadow 不是档位值）；客户端不能用它发起写回。
export type ShadowValue = ShadowLevel | "custom";

export type ThemeDraft = {
  colorPrimary: string;
  colorSuccess: string;
  colorWarning: string;
  colorError: string;
  colorInfo: string;
  colorText: string;
  colorTextSecondary: string;
  colorBorder: string;
  colorBgBase: string;
  colorBgContainer: string;
  fontFamily: string;
  fontFamilyCode: string;
  fontSize: number;
  lineHeight: number;
  sizeUnit: number;
  sizeStep: number;
  spaceSm: number;
  spaceMd: number;
  spaceLg: number;
  controlHeight: number;
  borderRadius: number;
  borderRadiusLG: number;
  lineWidth: number;
  shadowLevel: ShadowValue;
  motion: boolean;
  motionUnit: number;
};

export const THEME_KEYS = [
  "colorPrimary",
  "colorSuccess",
  "colorWarning",
  "colorError",
  "colorInfo",
  "colorText",
  "colorTextSecondary",
  "colorBorder",
  "colorBgBase",
  "colorBgContainer",
  "fontFamily",
  "fontFamilyCode",
  "fontSize",
  "lineHeight",
  "sizeUnit",
  "sizeStep",
  "spaceSm",
  "spaceMd",
  "spaceLg",
  "controlHeight",
  "borderRadius",
  "borderRadiusLG",
  "lineWidth",
  "shadowLevel",
  "motion",
  "motionUnit"
] as const;

export type ThemeKey = (typeof THEME_KEYS)[number];

// bootstrap.foundations：「基础」只读分组（图标、布局栅格）的数据，服务端从源码与 antd 派生值读出。
export type IconUsageFile = { file: string; icons: string[]; count: number; note?: string };
export type FoundationsInfo = {
  icons: { library: string; note: string; files: IconUsageFile[] };
  grid: {
    breakpoints: Array<{ token: string; px: number }>;
    siderWidth: number | null;
    contentMaxWidth: number | null;
    sources: string[];
    note: string;
  };
};

export type FileEntry = { file: string; sha256: string };
export type RouteEntry = { id: string; route: string; path: string; title: string };

export type Loc = { file: string; line: number; column: number; component: string };

export type StylePatch = Record<string, number | string | null>;
export type StructureDraft = Record<string, StylePatch>;
export type StructuresDraft = Record<string, StructureDraft>;
export type SlotValue = { kind: "icon"; name: string } | { kind: "text" | "tag"; text: string } | { kind: "none" };
export type InstanceChanges = {
  props?: Record<string, string | number | boolean | null>;
  text?: string;
  slots?: Record<string, SlotValue>;
  styles?: StructureDraft;
};
export type InstanceModel = {
  component: string;
  fields: Array<{ name: string; label: string; type: string; options?: string[]; min?: number; max?: number; value?: string | number | boolean | null; writable: boolean; reason?: string }>;
  text: { writable: boolean; value?: string; reason?: string };
  slots: Array<{ name: string; label: string; writable: boolean; reason?: string; value?: SlotValue }>;
  parts: string[];
  identity: { kind: "single" | "keyed" | "repeated"; expression?: string };
  styles?: { writable: boolean; value?: StructureDraft; reason?: string };
};
export type InstanceDraft = { loc: Loc; instanceKey: string | null; changes: InstanceChanges };

export type RuleStatus = "pass" | "fail" | "blocked";
export type Rule = { id: string; status: RuleStatus; message: string; suggestedValue?: string };

export type Candidate = {
  id: string;
  target: string;
  label: string;
  migratedProps: string[];
  unmappedProps: string[];
  requiresConfirmation: boolean;
};

export type CandidatesData = {
  loc: Loc;
  sha256: string;
  candidates: Candidate[];
  rules: Rule[];
};

// ---------------------------------------------------------------- 组件 token（kind:"component"）
// 草稿：组件 → token → 新值；null = 删除该项（恢复跟随全局）。
export type ComponentTokenValue = number | string;
export type ComponentTokenDraftEntry = Record<string, ComponentTokenValue | null>;
export type ComponentTokensDraft = Record<string, ComponentTokenDraftEntry | undefined>;

// bootstrap.componentTokens：服务端从 themes.ts 源码读出每个已写的组件项与其跟随状态。
export type ComponentTokenState = { value: ComponentTokenValue; status: "following" | "custom"; global: string | null };
export type ComponentTokensState = Record<string, Record<string, ComponentTokenState>>;

// 推送子端预览的完整草稿：L0 主题 + 组件 token + L0 跟随状态（子端按它同步覆盖项）。
export type PreviewPayload = {
  theme: ThemeDraft;
  components: ComponentTokensDraft;
  statuses: Record<string, Record<string, "following" | "custom">>;
  structures?: StructuresDraft;
  instances?: InstanceDraft[];
  // 2026-10-03：区块预览操作（只在画布里预览，不写源码）。
  blocks?: import("./block-ops").BlockOp[];
};

// 矩阵子端读出的 CSS 变量计算值：组件 → token → 计算值（读不到为 null）。
export type ComponentComputedValues = Record<string, Record<string, string | null>>;

export type CheckStatus = "queued" | "running" | "passed" | "failed";
export type CheckEntry = {
  id: string;
  status: CheckStatus;
  startedAt?: string;
  endedAt?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  screenshots?: string[];
};

export type PatchStatus = "checking" | "checks-passed" | "failed" | "cancelled" | "undone";
export type PatchKind = "theme" | "replace" | "component" | "structure" | "instance" | "block" | "undo";

export type BlockProgressStep = "read" | "ai" | "validate" | "checks" | "result";
export type BlockProgressStatus = "running" | "passed" | "failed" | "cancelled";
export type BlockProgressEntry = {
  step: BlockProgressStep;
  status: BlockProgressStatus;
  message: string;
  at: string;
};

export type AiAvailability = { available: boolean; reason?: string };
export type BlockAdvice = { sentence: string; cached: boolean };

export type PatchFile = {
  file: string;
  beforeSha256: string;
  afterSha256: string;
  diff: string;
  beforeSnapshot: string;
};

export type Patch = {
  version: number;
  projectId: string;
  id: string;
  requestId: string;
  kind: PatchKind;
  createdAt: string;
  updatedAt: string;
  status: PatchStatus;
  route: string;
  undoOf?: string;
  undoneBy?: string;
  /** kind:block only: the registered page and the exact preview operations sent for rewrite. */
  page?: string;
  ops?: import("./block-ops").BlockOp[];
  progress?: BlockProgressEntry[];
  aiStartedAt?: string;
  autoReverted?: boolean;
  error?: { message?: string; stderr?: string; cause?: string; tempPath?: string };
  files: PatchFile[];
  rules: Rule[];
  unmappedProps: string[];
  checks: CheckEntry[];
  technical: "pending" | "checks-passed" | "failed";
  codeReview: "pending-owner-review";
  visual: "pending-owner-review";
};

export type Bootstrap = {
  version: number;
  projectId: string;
  sessionToken: string;
  theme: Partial<ThemeDraft>;
  files: FileEntry[];
  routes: RouteEntry[];
  components: unknown;
  componentTokens?: ComponentTokensState;
  componentDefaults?: Record<string, Record<string, ComponentTokenValue>>;
  tokenRules: unknown;
  foundations?: FoundationsInfo;
  structureParts?: Record<string, string[]>;
  structures?: StructuresDraft;
  ai?: AiAvailability;
};

export type ApiError = { code: string; message: string; details?: unknown; http: number };

export class EditorApiFailure extends Error {
  readonly error: ApiError;
  constructor(error: ApiError) {
    super(error.message);
    this.name = "EditorApiFailure";
    this.error = error;
  }
}

type SuccessEnvelope<T> = { ok: true; data: T };
type FailureEnvelope = { ok: false; error: { code: string; message: string; details?: unknown } };

let sessionToken: string | null = null;

export function currentSessionToken() {
  return sessionToken;
}

function isFailureEnvelope(raw: unknown): raw is FailureEnvelope {
  return (
    typeof raw === "object" &&
    raw !== null &&
    (raw as { ok?: unknown }).ok === false &&
    typeof (raw as { error?: { message?: unknown } }).error?.message === "string"
  );
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(sessionToken ? { "X-Ludi-Session": sessionToken } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new EditorApiFailure({
      code: "NETWORK",
      http: 0,
      message: `本地编辑接口不可达（${method} ${url}）：${reason}`
    });
  }

  let raw: unknown = null;
  const text = await response.text().catch(() => "");
  if (text.length > 0) {
    try {
      raw = JSON.parse(text);
    } catch {
      throw new EditorApiFailure({
        code: "BAD_RESPONSE",
        http: response.status,
        message: `接口返回了非 JSON 内容（HTTP ${response.status}）`,
        details: text.slice(0, 500)
      });
    }
  }

  if (isFailureEnvelope(raw)) {
    throw new EditorApiFailure({ ...raw.error, http: response.status });
  }
  if (!response.ok) {
    throw new EditorApiFailure({
      code: `HTTP_${response.status}`,
      http: response.status,
      message: `接口返回 HTTP ${response.status}，未携带协议错误体`,
      details: typeof raw === "object" && raw !== null ? raw : text.slice(0, 500)
    });
  }
  if (typeof raw === "object" && raw !== null && (raw as { ok?: unknown }).ok === true) {
    return (raw as SuccessEnvelope<T>).data;
  }
  // 协议要求 { ok, data }；容忍直接返回 data 的实现差异，但不做任何额外解释。
  return raw as T;
}

export async function fetchBootstrap(): Promise<Bootstrap> {
  const data = await request<Bootstrap>("GET", "/__ludi/bootstrap");
  if (!data || typeof data.sessionToken !== "string" || data.sessionToken.length === 0) {
    throw new EditorApiFailure({
      code: "BAD_RESPONSE",
      http: 200,
      message: "bootstrap 未返回有效的 sessionToken"
    });
  }
  sessionToken = data.sessionToken;
  return data;
}

export async function fetchCandidates(loc: Loc, expectedSha256: string): Promise<CandidatesData> {
  return request<CandidatesData>("POST", "/__ludi/candidates", {
    version: PROTOCOL_VERSION,
    projectId: PROJECT_ID,
    loc,
    expectedSha256
  });
}

export function fetchInstance(loc: Loc, expectedSha256: string, instanceKey: string | null): Promise<InstanceModel> {
  return request("POST", "/__ludi/instance", { version: PROTOCOL_VERSION, projectId: PROJECT_ID, loc, expectedSha256, instanceKey });
}

export function fetchImpact(components: string[] | null, loc: Loc | null): Promise<import("./ImpactPanel").ImpactCatalog> {
  return request("POST", "/__ludi/impact", { version: PROTOCOL_VERSION, projectId: PROJECT_ID, components, loc });
}

export async function submitStructurePatch(component: string, part: string, styles: StylePatch, expectedFiles: FileEntry[], route: string): Promise<Patch> {
  const acceptance = await request("POST", "/__ludi/patch", {version:PROTOCOL_VERSION,projectId:PROJECT_ID,requestId:crypto.randomUUID(),kind:"structure",component,part,styles,expectedFiles,route});
  return resolveAcceptedPatch(acceptance, "结构层写回");
}

export async function submitInstancePatch(instance: InstanceDraft, expectedFiles: FileEntry[], route: string): Promise<Patch> {
  const acceptance = await request("POST", "/__ludi/patch", {version:PROTOCOL_VERSION,projectId:PROJECT_ID,requestId:crypto.randomUUID(),kind:"instance",...instance,expectedFiles,route});
  return resolveAcceptedPatch(acceptance, "实例写回");
}

// 协议 HTTP API 3：PATCH 提交返回 HTTP 202 受理体 {patchId,status:"checking",files,rules}，
// 不是完整 Patch 记录。两个提交路径只读受理体的 patchId，再按 GET 拉全量；
// 受理体异常时明确失败，不把不完整对象交给界面状态或拿去轮询。
type PatchAcceptance = { patchId?: unknown };

async function resolveAcceptedPatch(acceptance: unknown, operation: string): Promise<Patch> {
  const patchId = (acceptance as PatchAcceptance | null)?.patchId;
  if (typeof patchId !== "string" || patchId.length === 0) {
    throw new EditorApiFailure({
      code: "BAD_RESPONSE",
      http: 202,
      message: `${operation}受理体缺少有效的 patchId（缺失、空值或类型错误），不继续查询完整记录`,
      details: acceptance
    });
  }
  const patch = await fetchPatch(patchId);
  if (patch.id !== patchId || !Array.isArray(patch.checks)) {
    throw new EditorApiFailure({
      code: "BAD_RESPONSE",
      http: 200,
      message: `${operation}的完整 Patch 记录形状异常：id 与受理 patchId 不一致，或 checks 不是数组`,
      details: { patchId, id: patch?.id, checksIsArray: Array.isArray(patch?.checks) }
    });
  }
  return patch;
}

export async function submitThemePatch(
  theme: ThemeDraft,
  expectedFiles: FileEntry[],
  route: string
): Promise<Patch> {
  const acceptance = await request<PatchAcceptance>("POST", "/__ludi/patch", {
    version: PROTOCOL_VERSION,
    projectId: PROJECT_ID,
    requestId: crypto.randomUUID(),
    kind: "theme",
    expectedFiles,
    theme,
    route
  });
  return resolveAcceptedPatch(acceptance, "主题写回");
}

// 组件 token 写回：tokens 里的 null 表示删除该项（恢复跟随全局）。
export async function submitComponentPatch(
  component: string,
  tokens: Record<string, ComponentTokenValue | null>,
  expectedFiles: FileEntry[],
  route: string
): Promise<Patch> {
  const acceptance = await request<PatchAcceptance>("POST", "/__ludi/patch", {
    version: PROTOCOL_VERSION,
    projectId: PROJECT_ID,
    requestId: crypto.randomUUID(),
    kind: "component",
    expectedFiles,
    component,
    tokens,
    route
  });
  return resolveAcceptedPatch(acceptance, "组件 token 写回");
}

export async function submitReplacePatch(params: {
  loc: Loc;
  candidateId: string;
  expectedFiles: FileEntry[];
  confirmedUnmappedProps: string[];
  route: string;
}): Promise<Patch> {
  const acceptance = await request<PatchAcceptance>("POST", "/__ludi/patch", {
    version: PROTOCOL_VERSION,
    projectId: PROJECT_ID,
    requestId: crypto.randomUUID(),
    kind: "replace",
    expectedFiles: params.expectedFiles,
    loc: params.loc,
    candidateId: params.candidateId,
    confirmedUnmappedProps: params.confirmedUnmappedProps,
    route: params.route
  });
  return resolveAcceptedPatch(acceptance, "组件替换写回");
}

export async function submitBlockPatch(params: {
  page: string;
  ops: import("./block-ops").BlockOp[];
  expectedFiles: FileEntry[];
  route: string;
}): Promise<Patch> {
  const acceptance = await request<PatchAcceptance>("POST", "/__ludi/patch", {
    version: PROTOCOL_VERSION,
    projectId: PROJECT_ID,
    requestId: crypto.randomUUID(),
    kind: "block",
    expectedFiles: params.expectedFiles,
    page: params.page,
    ops: params.ops,
    route: params.route
  });
  return resolveAcceptedPatch(acceptance, "区块 AI 改写");
}

export async function cancelBlockPatch(patchId: string): Promise<Patch> {
  const data = await request<Patch | { patchId?: unknown } | null>("POST", "/__ludi/cancel", {
    version: PROTOCOL_VERSION,
    projectId: PROJECT_ID,
    patchId
  });
  if (data && typeof (data as Patch).id === "string") return data as Patch;
  const id = data && typeof data === "object" ? (data as { patchId?: unknown }).patchId : undefined;
  return fetchPatch(typeof id === "string" && id.length > 0 ? id : patchId);
}

const blockAdviceCache = new Map<string, BlockAdvice>();

export async function fetchBlockAdvice(
  page: string,
  block: string,
  operation: import("./block-ops").BlockOpKind,
  state: { activeTemplate?: string | null; instance?: string | null } = {}
): Promise<BlockAdvice> {
  const key = `${page}\u0000${block}\u0000${operation}`;
  // 建议与缓存都要跟随当前合成状态：换了替换模板、或问的是某个副本，必须重新思考（Owner 验收 #4）。
  const cleanState = {
    ...(state.activeTemplate ? { activeTemplate: state.activeTemplate } : {}),
    ...(state.instance ? { instance: state.instance } : {})
  };
  const cacheKey = `${key} ${JSON.stringify(cleanState)}`;
  const local = blockAdviceCache.get(cacheKey);
  if (local) return { ...local, cached: true };
  const advice = await request<BlockAdvice>("POST", "/__ludi/block-advice", {
    version: PROTOCOL_VERSION,
    projectId: PROJECT_ID,
    page,
    block,
    operation,
    state: cleanState
  });
  if (!advice || typeof advice.sentence !== "string" || typeof advice.cached !== "boolean") {
    throw new EditorApiFailure({
      code: "BAD_RESPONSE",
      http: 200,
      message: "AI 建议返回体缺少 sentence / cached"
    });
  }
  blockAdviceCache.set(cacheKey, advice);
  return advice;
}

export async function fetchPatch(id: string): Promise<Patch> {
  return request<Patch>("GET", `/__ludi/patch/${encodeURIComponent(id)}`);
}

export type DerivedComponents = Record<string, Record<string, string | number>>;

// 只读派生：给 26 字段全局草稿，服务端按 antd 自己的链返回组件默认值（2026-10-05）。
// 面板上「跟随全局」的数值随草稿实时变化；服务端不写文件。
export async function fetchDerivedDefaults(theme: ThemeDraft): Promise<DerivedComponents> {
  const data = await request<{ components: DerivedComponents }>("POST", "/__ludi/derive", {
    version: PROTOCOL_VERSION,
    projectId: PROJECT_ID,
    theme
  });
  if (!data || typeof data !== "object" || typeof data.components !== "object" || data.components === null) {
    throw new EditorApiFailure({ code: "BAD_RESPONSE", http: 200, message: "派生默认值返回体缺少 components" });
  }
  return data.components;
}

// 最近的 Patch 记录（新到旧，服务端截取最近 30 条）；刷新或服务重启后用它找回记录页签与撤销入口。
export async function fetchPatchList(): Promise<Patch[]> {
  const data = await request<Patch[]>("GET", "/__ludi/patches");
  if (!Array.isArray(data)) throw new EditorApiFailure({ code: "BAD_RESPONSE", http: 200, message: "Patch 列表不是数组" });
  return data;
}

// 协议未固定 undo 的成功返回体：可能是完整 Patch，也可能只有 { patchId }。
// 两种形状都接受，随后统一以 GET /__ludi/patch/:id 拉全量。
export async function undoPatch(patchId: string): Promise<Patch> {
  const data = await request<Patch | { patchId: string }>("POST", "/__ludi/undo", {
    version: PROTOCOL_VERSION,
    projectId: PROJECT_ID,
    requestId: crypto.randomUUID(),
    patchId
  });
  if (data && typeof (data as Patch).id === "string") return data as Patch;
  const id = (data as { patchId?: unknown }).patchId;
  if (typeof id === "string" && id.length > 0) return fetchPatch(id);
  throw new EditorApiFailure({
    code: "BAD_RESPONSE",
    http: 200,
    message: "undo 返回体缺少 id / patchId，无法定位撤销记录"
  });
}

export function findFileSha(files: FileEntry[], locFile: string): FileEntry | null {
  const exact = files.find((entry) => entry.file === locFile);
  if (exact) return exact;
  // 服务端路径相对 kit 根；定位插件的 file 若只给到包内相对路径，用后缀匹配兜底，且要求唯一。
  const suffixMatches = files.filter(
    (entry) => entry.file.endsWith(`/${locFile}`) || locFile.endsWith(`/${entry.file}`)
  );
  return suffixMatches.length === 1 ? suffixMatches[0] : null;
}

export function themePatchFiles(files: FileEntry[]): FileEntry[] | null {
  const themeTs = files.find((entry) => /(^|\/)theme\.ts$/.test(entry.file));
  const stylesCss = files.find((entry) => /(^|\/)generated\/styles\.css$/.test(entry.file));
  if (!themeTs || !stylesCss) return null;
  return [themeTs, stylesCss];
}

// 组件写回只涉及 theme.ts 一个文件。
export function componentPatchFile(files: FileEntry[]): FileEntry | null {
  return files.find((entry) => /(^|\/)theme\.ts$/.test(entry.file)) ?? null;
}

// 页面 id 与生成文件遵循 pages.json / generated 的既有 kebab-case → PascalCase 约定。
// 只从 bootstrap.files 的白名单结果中取唯一命中，不自行拼一个未经服务端登记的路径。
export function blockPatchFile(files: FileEntry[], page: string): FileEntry | null {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page)) return null;
  const stem = page
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join("");
  const suffix = `/generated/${stem}Page.tsx`;
  const matches = files.filter((entry) => entry.file.endsWith(suffix));
  return matches.length === 1 ? matches[0] : null;
}

export function errorText(cause: unknown): ApiError {
  if (cause instanceof EditorApiFailure) return cause.error;
  const message = cause instanceof Error ? cause.message : String(cause);
  return { code: "UNKNOWN", http: 0, message };
}
