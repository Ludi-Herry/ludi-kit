// 右侧检查器（280px）：「设计」「改动记录」两个页签，顶部是最近一次写入结果与「撤销最近一次写入」。
// 设计：三层结构——这是什么（区块名与用途 / 元素中文名）→ 能做什么（区块操作与合同提示）→ 外观（3–4 项）；
//   影响面压成一行提示；其余全部收进默认折叠的「更多设置」（组件、源码位置、实际渲染样式、实例与结构层样式、
//   可替换候选、主题值、规则与检查、桥接记录）。不删任何能力。
//   「基础」与组件矩阵按同样原则：常用项在上，其余进「更多设置」。
// 改动记录：Patch 历史、检查进度与撤销；「写入项目」在顶栏，预览撤销 / 重做在顶栏，撤销最近一次写入在顶部结果条。

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Checkbox, Modal, Tabs } from "antd";
import type { BlockProgressStep, Candidate, Patch, Rule } from "./api";
import type { ElementDetail, PartDetail } from "./bridge";
import { BoundsGroup, StylesGroup } from "./DetailGroups";
import { P0_COMPONENTS } from "./nav-data";
import { blockById } from "./page-blocks";
import { baseBlockId, cloneIndexOf, instanceDisplayName } from "./block-ops";
import { SEMANTIC_STRUCTURE } from "./semantic-structure";
import {
  Appearance,
  BlockActions,
  BlockNotice,
  ImpactLine,
  MoreSettings,
  RuleSummary,
  WhatIs,
  elementZhName,
  type AppearanceEdit,
  type BlocksUi,
  type ImpactSummary
} from "./inspector-parts";
import type { BridgeIssue, PatchEntry, SelectionState } from "./state";

const PATCH_KIND_LABEL: Record<Patch["kind"], string> = {
  theme: "主题",
  replace: "组件替换",
  component: "组件样式",
  structure: "内部结构样式",
  instance: "实例修改",
  block: "区块改写",
  undo: "撤销"
};

const PATCH_STATUS_LABEL: Record<Patch["status"], string> = {
  checking: "检查中",
  "checks-passed": "检查通过",
  failed: "检查未通过",
  cancelled: "已取消",
  undone: "已撤销"
};

const PATCH_STATUS_TONE: Record<Patch["status"], string> = {
  checking: "busy",
  "checks-passed": "pass",
  failed: "fail",
  cancelled: "muted",
  undone: "muted"
};

const BLOCK_PROGRESS_LABEL: Record<BlockProgressStep, string> = {
  read: "读取页面源码与合同",
  ai: "AI 改写",
  validate: "校验返回文件",
  checks: "运行项目检查",
  result: "结果"
};

const PROGRESS_STATUS_LABEL = {
  running: "进行中",
  passed: "通过",
  failed: "失败",
  cancelled: "已取消"
} as const;

function elapsedText(startedAt: string | undefined, now: number): string | null {
  if (!startedAt) return null;
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start)) return null;
  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function shortSha(sha: string | undefined): string {
  return sha ? sha.slice(0, 8) : "—";
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function InfoGroup({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <section className="ludi-group">
      <h3>{title}</h3>
      {rows.map(([label, value]) => (
        <div className="ludi-kv ludi-kv--readonly" key={label}>
          <div className="ludi-kv__label">
            <span>{label}</span>
          </div>
          <div className="ludi-kv__control">
            <span className="ludi-kv__value">{value}</span>
          </div>
        </div>
      ))}
    </section>
  );
}

function Row({ label, children, stack }: { label: string; children: ReactNode; stack?: boolean }) {
  return (
    <div className={stack ? "ludi-kv ludi-kv--stack" : "ludi-kv"}>
      <div className="ludi-kv__label">
        <span>{label}</span>
      </div>
      <div className="ludi-kv__control ludi-kv__control--start">{children}</div>
    </div>
  );
}

function RuleItem({ rule }: { rule: Rule }) {
  // pass 且带建议色 = 现状不达标但不阻断（主色未改）：琥珀色提示。
  const warn = rule.status === "pass" && Boolean(rule.suggestedValue);
  const statusText = warn ? "现状不达标" : rule.status === "pass" ? "通过" : rule.status === "fail" ? "不通过" : "暂缓";
  return (
    <div className="ludi-rule" data-status={warn ? "warn" : rule.status}>
      <code>
        {rule.id} · {statusText}
      </code>
      <p>{rule.message}</p>
      {rule.suggestedValue ? (
        <span className="ludi-rule__suggestion">
          {warn ? "建议：" : "合规候选："}
          {HEX_COLOR.test(rule.suggestedValue) ? (
            <i className="ludi-rule__swatch" style={{ background: rule.suggestedValue }} />
          ) : null}
          <code>{rule.suggestedValue}</code>
        </span>
      ) : null}
    </div>
  );
}

function PatchRecord({
  entry,
  canUndo,
  busy,
  onUndo,
  onCancelBlock
}: {
  entry: PatchEntry;
  canUndo: boolean;
  busy: boolean;
  onUndo: (patch: Patch) => void;
  onCancelBlock: (patch: Patch) => Promise<void>;
}) {
  const { patch } = entry;
  const [now, setNow] = useState(Date.now());
  const [cancelPending, setCancelPending] = useState(false);
  const progress = patch.progress ?? [];
  const latestAi = [...progress].reverse().find((item) => item.step === "ai") ?? null;
  const aiRunning = patch.kind === "block" && patch.status === "checking" && (!latestAi || latestAi.status === "running");
  useEffect(() => {
    if (!aiRunning || !patch.aiStartedAt) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [aiRunning, patch.aiStartedAt]);
  const finished = patch.checks.filter((check) => check.status === "passed" || check.status === "failed").length;
  const total = patch.checks.length;
  const elapsed = aiRunning ? elapsedText(patch.aiStartedAt, now) : null;
  const downstreamStarted = progress.some((item) => item.step === "validate" || item.step === "checks" || item.step === "result");
  const canCancel = patch.kind === "block" && patch.status === "checking" && !downstreamStarted && (!latestAi || latestAi.status === "running");
  const failedProgress = [...progress].reverse().find((item) => item.status === "failed");
  const failedRule = patch.rules.find((rule) => rule.status === "fail");
  const failedCheck = patch.checks.find((check) => check.status === "failed");
  const humanFailure =
    failedProgress?.message ||
    failedRule?.message ||
    patch.error?.message ||
    patch.error?.cause ||
    failedCheck?.stderr?.split(/\r?\n/, 1)[0] ||
    null;
  return (
    <div className="ludi-patch" data-status={entry.unknown ? "muted" : PATCH_STATUS_TONE[patch.status]}>
      <div className="ludi-patch__head">
        <strong>{PATCH_KIND_LABEL[patch.kind]}</strong>
        <span className="ludi-status-pill" data-tone={entry.unknown ? "muted" : PATCH_STATUS_TONE[patch.status]}>
          {entry.unknown ? "状态未知，请刷新确认" : PATCH_STATUS_LABEL[patch.status]}
        </span>
      </div>
      <div className="ludi-muted ludi-mono">{patch.createdAt}</div>
      {patch.kind === "block" ? (
        <div className="ludi-block-progress">
          {patch.status === "checking" ? (
            <div className="ludi-block-progress__intro">
              <strong>AI 正在改写这一块（通常 1–3 分钟）</strong>
              {elapsed ? <span className="ludi-mono">已用 {elapsed}</span> : null}
            </div>
          ) : null}
          {entry.progressUnavailable ? (
            <div className="ludi-block-progress__unavailable" role="status">进度暂时拿不到；下方只保留最后一次收到的真实状态。</div>
          ) : null}
          {progress.length === 0 && patch.status === "checking" && !entry.progressUnavailable ? (
            <div className="ludi-muted">等待服务端返回第一条进度…</div>
          ) : null}
          {progress.length > 0 ? (
            <ol className="ludi-block-progress__list">
              {progress.map((item, index) => (
                <li data-status={item.status} key={`${item.step}-${item.at}-${index}`}>
                  <i className="ludi-check-dot" data-status={item.status} />
                  <div>
                    <strong>{BLOCK_PROGRESS_LABEL[item.step]}</strong>
                    <span>{item.message || PROGRESS_STATUS_LABEL[item.status]}</span>
                  </div>
                </li>
              ))}
            </ol>
          ) : null}
          {progress.some((item) => item.step === "checks") && patch.checks.length > 0 ? (
            <div className="ludi-block-progress__checks" aria-label="四项检查进度">
              {patch.checks.map((check) => (
                <div key={check.id}>
                  <i className="ludi-check-dot" data-status={check.status} />
                  <span className="ludi-mono">{check.id}</span>
                  <span>{check.status}</span>
                </div>
              ))}
            </div>
          ) : null}
          {patch.status === "failed" ? (
            <div className="ludi-block-progress__result" data-status="failed">
              {humanFailure ? `失败原因：${humanFailure}` : "改写没有通过。"}
              {patch.autoReverted ? " 已自动撤销，项目文件已恢复。" : ""}
            </div>
          ) : null}
          {patch.status === "cancelled" ? <div className="ludi-block-progress__result">已取消；没有写入项目文件。</div> : null}
          {canCancel ? (
            <Button
              danger
              loading={cancelPending}
              onClick={() => {
                setCancelPending(true);
                void onCancelBlock(patch).finally(() => setCancelPending(false));
              }}
              size="small"
            >
              取消改写
            </Button>
          ) : null}
        </div>
      ) : total > 0 ? (
        <div aria-label={`检查进度 ${finished}/${total}`} className="ludi-progress" role="img">
          <div className="ludi-progress__bar" style={{ width: `${Math.round((finished / total) * 100)}%` }} />
        </div>
      ) : null}
      <div className="ludi-muted">
        改了 {patch.files.length} 个文件 · 检查 {finished}/{total} 项有结果
      </div>
      {patch.kind !== "block" && patch.status === "failed" && failedRule ? (
        <div className="ludi-muted">未通过原因：{failedRule.message}</div>
      ) : null}
      {patch.unmappedProps.length > 0 ? (
        <div className="ludi-muted">未自动迁移的属性：{patch.unmappedProps.join("、")}</div>
      ) : null}
      <details>
        <summary>{patch.kind === "block" && patch.status === "failed" ? "查看检查输出" : "详情（文件、检查、规则）"}</summary>
        <div className="ludi-candidate__props">
          {patch.files.map((file) => (
            <span key={file.file} title={file.file}>
              {file.file.split("/").pop()} {shortSha(file.beforeSha256)}→{shortSha(file.afterSha256)}
            </span>
          ))}
        </div>
        <div className="ludi-muted ludi-mono">
          technical：{patch.technical} · codeReview：{patch.codeReview} · visual：{patch.visual}
        </div>
        {patch.error?.cause ? (
          <div className="ludi-rule" data-status="fail">
            <code>AI / 改写错误</code>
            <p>{patch.error.cause}</p>
          </div>
        ) : null}
        {patch.error?.stderr ? <pre>{patch.error.stderr}</pre> : null}
        {patch.rules.map((rule) => (
          <RuleItem key={`${patch.id}-${rule.id}`} rule={rule} />
        ))}
        {patch.checks.map((check) => (
          <details key={`${patch.id}-${check.id}`}>
            <summary>
              <i className="ludi-check-dot" data-status={check.status} />
              <span className="ludi-mono">
                {check.id} · {check.status}
                {typeof check.exitCode === "number" ? ` · exit ${check.exitCode}` : ""}
              </span>
            </summary>
            {check.stdout ? <pre>{check.stdout}</pre> : null}
            {check.stderr ? <pre>{check.stderr}</pre> : null}
            {check.screenshots && check.screenshots.length > 0 ? (
              <pre>{check.screenshots.join("\n")}</pre>
            ) : null}
          </details>
        ))}
      </details>
      {canUndo ? (
        <div>
          <Button disabled={busy} onClick={() => onUndo(patch)} size="small">
            撤销这次写入
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function CandidateCard({
  candidate,
  busy,
  onApply
}: {
  candidate: Candidate;
  busy: boolean;
  onApply: (candidate: Candidate, confirmedUnmappedProps: string[]) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmed, setConfirmed] = useState<string[]>([]);

  const startApply = () => {
    if (candidate.unmappedProps.length === 0) {
      onApply(candidate, []);
      return;
    }
    setConfirmed([]);
    setConfirmOpen(true);
  };

  return (
    <div className="ludi-candidate">
      <div className="ludi-candidate__head">
        <strong>{candidate.label}</strong>
      </div>
      <Row label="迁移 props" stack>
        <div className="ludi-candidate__props">
          {candidate.migratedProps.length > 0 ? (
            candidate.migratedProps.map((prop) => <span key={prop}>迁移 {prop}</span>)
          ) : (
            <span>无需迁移的 props</span>
          )}
        </div>
      </Row>
      {candidate.unmappedProps.length > 0 ? (
        <Row label="需确认" stack>
          <div className="ludi-candidate__props ludi-candidate__props--warn">
            {candidate.unmappedProps.map((prop) => (
              <span key={prop}>{prop}</span>
            ))}
          </div>
        </Row>
      ) : null}
      {candidate.unmappedProps.length > 0 ? (
        <div className="ludi-muted">不可自动迁移，需逐项确认：{candidate.unmappedProps.join("、")}</div>
      ) : null}
      <Button block disabled={busy} onClick={startApply} size="small" type="primary">
        写入替换
      </Button>
      <Modal
        cancelText="取消"
        confirmLoading={busy}
        okButtonProps={{ disabled: confirmed.length !== candidate.unmappedProps.length }}
        okText="确认并写入"
        onCancel={() => setConfirmOpen(false)}
        onOk={() => {
          setConfirmOpen(false);
          onApply(candidate, confirmed);
        }}
        open={confirmOpen}
        title={`替换为 ${candidate.label}`}
      >
        <p>
          以下 props 无法自动迁移，保持原样可能改变语义。逐项确认你已看过并接受，才会写入项目源码。
        </p>
        {candidate.unmappedProps.map((prop) => (
          <div key={prop} style={{ marginBottom: 8 }}>
            <Checkbox
              checked={confirmed.includes(prop)}
              onChange={(event) =>
                setConfirmed((current) =>
                  event.target.checked ? [...current, prop] : current.filter((item) => item !== prop)
                )
              }
            >
              {prop}
            </Checkbox>
          </div>
        ))}
      </Modal>
    </div>
  );
}

export type InspectorView = "canvas" | "matrix" | "system";

export type InspectorProps = {
  view: InspectorView;
  busy: boolean;
  panelTitle: string;
  tokenControls: ReactNode;
  /** 「基础」分区里只读的技术细节与派生阶梯，收进「更多设置」。 */
  systemMore?: ReactNode;
  componentTokens?: ReactNode;
  instanceControls?: ReactNode;
  structureControls?: ReactNode;
  impactControls?: ReactNode;
  impactSummary: ImpactSummary | null;
  themeRules: Rule[];
  selection: SelectionState | null;
  detail: ElementDetail | null;
  partDetail: PartDetail | null;
  onApplyCandidate: (candidate: Candidate, confirmedUnmappedProps: string[]) => void;
  patches: PatchEntry[];
  latestUndoableId: string | null;
  onUndo: (patch: Patch) => void;
  onCancelBlock: (patch: Patch) => Promise<void>;
  bridgeIssues: BridgeIssue[];
  /** 当前页面登记了区块时才有值；没登记为 null（右栏只显示元素信息）。 */
  blocks: BlocksUi | null;
  /** 外观区的编辑入口（与「更多设置」里的实例样式共用同一套写入逻辑）。 */
  appearance: AppearanceEdit;
};

const SYSTEM_PURPOSE: Record<string, string> = {
  颜色: "调整品牌色、状态色和文字、边框、背景色，改动先在画布里预览。",
  文字: "调整字体、字号和行高。",
  图标: "查看项目锁定的图标库（只读）。",
  间距: "调整页面间距和控件高度。",
  圆角与效果: "调整圆角、阴影和动效。",
  布局栅格: "查看页面断点与壳层宽度（只读）。"
};

export function Inspector(props: InspectorProps) {
  const {
    view,
    busy,
    panelTitle,
    tokenControls,
    componentTokens,
    themeRules,
    selection,
    detail,
    partDetail,
    onApplyCandidate,
    patches,
    latestUndoableId,
    onUndo,
    onCancelBlock,
    bridgeIssues,
    blocks,
    appearance
  } = props;

  const [activeKey, setActiveKey] = useState("design");
  const [impactOpen, setImpactOpen] = useState(false);
  const latestPatch = patches[0]?.patch ?? null;
  const undoTarget = patches.find((entry) => entry.patch.id === latestUndoableId)?.patch ?? null;

  // 本次打开页面后新产生的写入或撤销出现时切到「改动记录」，让检查进度可见。
  // 刷新后从服务端读回的历史记录创建得更早，不触发切换，右栏停在「设计」。
  const openedAt = useRef(Date.now());
  const lastPatchId = useRef<string | null>(latestPatch?.id ?? null);
  useEffect(() => {
    const id = latestPatch?.id ?? null;
    const createdAt = latestPatch ? Date.parse(latestPatch.createdAt) : Number.NaN;
    if (id && id !== lastPatchId.current && createdAt >= openedAt.current) setActiveKey("records");
    lastPatchId.current = id;
  }, [latestPatch]);

  const themeSection = (
    <section className="ludi-group ludi-group--theme">
      <h3>主题值</h3>
      {tokenControls}
    </section>
  );

  // 同一元素的详情只在上报与选中一致时展示，避免上一个元素的样式串到新选中的元素上。
  const detailMatches = Boolean(selection && detail && detail.loc.file === selection.loc.file && detail.loc.line === selection.loc.line && detail.loc.column === selection.loc.column);
  const activeDetail = detailMatches ? detail : null;

  const failedCount = themeRules.filter((rule) => rule.status === "fail").length;
  const warnedCount = themeRules.filter((rule) => rule.status === "pass" && Boolean(rule.suggestedValue)).length;
  const firstFailedMessage = themeRules.find((rule) => rule.status === "fail")?.message ?? null;
  // 「现状不达标」只是不阻断的提示，只在基础分区顶部露出；其他视图只在有不通过项（会禁用写入）时露出。
  const ruleSummary = <RuleSummary failed={failedCount} message={firstFailedMessage} warned={view === "system" ? warnedCount : 0} />;

  const rulesSection = (
    <section className="ludi-group">
      <h3>规则与检查</h3>
      {themeRules.map((rule) => (
        <RuleItem key={rule.id} rule={rule} />
      ))}
      {view === "canvas" && selection?.data && selection.data.rules.length > 0 ? (
        <>
          <h3 className="ludi-subtitle">选中位置的服务端规则</h3>
          {selection.data.rules.map((rule) => (
            <RuleItem key={`sel-${rule.id}`} rule={rule} />
          ))}
        </>
      ) : null}
      {latestPatch && latestPatch.rules.length > 0 ? (
        <>
          <h3 className="ludi-subtitle">最近一次写入的服务端规则</h3>
          {latestPatch.rules.map((rule) => (
            <RuleItem key={`latest-${rule.id}`} rule={rule} />
          ))}
        </>
      ) : null}
      {bridgeIssues.length > 0 ? (
        <>
          <h3 className="ludi-subtitle">桥接 / 接口记录</h3>
          {bridgeIssues.map((issue, index) => (
            <div className="ludi-rule" data-status="blocked" key={`${issue.at}-${index}`}>
              <code>
                {issue.code} · {issue.at}
              </code>
              <p>{issue.message}</p>
            </div>
          ))}
        </>
      ) : null}
    </section>
  );

  const impactNode = (
    <>
      {blocks && blocks.ops.some((op) => op.page === blocks.registry.pageId) ? (
        <div className="ludi-impact-line">
          <span className="ludi-impact-line__text">区块改动只在画布里预览，影响面以写入后为准</span>
        </div>
      ) : null}
      <ImpactLine onToggle={() => setImpactOpen((open) => !open)} open={impactOpen} summary={props.impactSummary} />
      {impactOpen ? <div className="ludi-impact-detail">{props.impactControls}</div> : null}
    </>
  );

  const blockNotice = blocks ? <BlockNotice blocks={blocks} showDeleteHint={!selection} /> : null;

  let designPane: ReactNode;
  if (view === "canvas" && selection) {
    const blockInfo = activeDetail?.block ?? null;
    // blockInfo.id 是实例 id：本体 = 区块 id；新增同类副本 = `${block}#c${n}`。
    const instanceId = blockInfo?.id ?? null;
    const regBlock = blocks && instanceId ? blockById(blocks.registry, baseBlockId(instanceId)) : null;
    const instanceName = regBlock ? instanceDisplayName(regBlock.name, cloneIndexOf(instanceId ?? "")) : null;
    const elementName = elementZhName(activeDetail?.comp ?? selection.loc.component, activeDetail?.tag, activeDetail?.text);
    const what =
      blocks && regBlock && blockInfo?.self ? (
        <WhatIs
          basis={regBlock.firstViewportItem ? "首屏必需区块" : regBlock.region?.locked ? "页面模式锁定的区域" : undefined}
          purpose={regBlock.purpose}
          title={instanceName ?? regBlock.name}
        />
      ) : blocks && regBlock ? (
        <WhatIs blockLink={{ name: instanceName ?? regBlock.name, onClick: () => blocks.onSelectBlock(instanceId ?? regBlock.id) }} title={elementName} />
      ) : (
        <WhatIs note={blocks ? undefined : "这个页面还没登记区块"} title={elementName} />
      );
    designPane = (
      <div className="ludi-inspector__pane" key={`${selection.loc.file}:${selection.loc.line}:${selection.loc.column}`}>
        {ruleSummary}
        {blockNotice}
        {what}
        {blocks && regBlock && blockInfo?.self && instanceId ? <BlockActions blockId={instanceId} blocks={blocks} /> : null}
        {impactNode}
        {activeDetail ? (
          <Appearance
            detail={activeDetail}
            edit={{
              ...appearance,
              // 区块被替换后画布上看到的是候选，改原区块的外观没有意义。
              disabled:
                appearance.disabled ||
                Boolean(
                  blocks &&
                    regBlock &&
                    blockInfo?.self &&
                    instanceId &&
                    blocks.ops.some(
                      (op) =>
                        op.page === blocks.registry.pageId &&
                        op.kind === "replace" &&
                        (op.instance === instanceId || (!op.instance && op.block === baseBlockId(instanceId)))
                    )
                )
            }}
            hasText={Boolean(activeDetail.text)}
          />
        ) : null}

        <MoreSettings>
          <section className="ludi-group">
            <h3>组件</h3>
            <Row label={selection.native ? "标签" : "名称"}>
              <span className="ludi-pill">{selection.native ? `<${selection.loc.component}>` : selection.loc.component}</span>
            </Row>
            {selection.loc.component === "Popconfirm" ? (
              <Row label="选中方式">
                <span className="ludi-pill">经触发按钮选中</span>
              </Row>
            ) : null}
          </section>

          <section className="ludi-group">
            <h3>源码位置</h3>
            <div className="ludi-loc">
              {selection.loc.file}:{selection.loc.line}:{selection.loc.column}
            </div>
            {selection.file ? (
              <div className="ludi-sha">sha256 {selection.file.sha256}</div>
            ) : (
              <div className="ludi-rule" data-status="blocked">
                <p>未在 bootstrap.files 找到该文件的 Hash，无法请求候选。</p>
              </div>
            )}
          </section>

          {activeDetail ? (
            <>
              <BoundsGroup bounds={activeDetail.bounds} />
              <StylesGroup styles={activeDetail.styles} />
            </>
          ) : null}

          {props.instanceControls}
          {selection.native ? null : (
            <>
              <section className="ludi-group">
                <h3>可替换候选</h3>
                {selection.loading ? <div className="ludi-muted">候选查询中…</div> : null}
                {selection.error ? (
                  <div className="ludi-rule" data-status="fail">
                    <code>{selection.error.code}</code>
                    <p>{selection.error.message}</p>
                  </div>
                ) : null}
                {selection.data && selection.data.candidates.length === 0 ? (
                  <div className="ludi-muted">服务端没有为这个位置给出替换候选（详因见下方「规则与检查」）。</div>
                ) : null}
                {selection.data?.candidates.map((candidate) => (
                  <CandidateCard busy={busy} candidate={candidate} key={candidate.id} onApply={onApplyCandidate} />
                ))}
              </section>

              {selection.data && selection.data.rules.length > 0 ? (
                <section className="ludi-group">
                  <h3>规则</h3>
                  {selection.data.rules.map((rule) => (
                    <div className="ludi-kv" key={`style-${rule.id}`}>
                      <div className="ludi-kv__label">
                        <code>{rule.id}</code>
                      </div>
                      <div className="ludi-kv__control ludi-kv__control--end">
                        <span className="ludi-status-pill" data-tone={rule.status}>
                          {rule.status === "pass" ? "通过" : rule.status === "fail" ? "不通过" : "暂缓"}
                        </span>
                      </div>
                    </div>
                  ))}
                </section>
              ) : null}
            </>
          )}
          {themeSection}
          {rulesSection}
        </MoreSettings>
      </div>
    );
  } else if (view === "matrix") {
    const label = P0_COMPONENTS.find((item) => item.name === (partDetail?.component ?? panelTitle))?.label ?? panelTitle;
    const meta = partDetail ? SEMANTIC_STRUCTURE[partDetail.component] : undefined;
    const part = partDetail ? meta?.parts.find((item) => item.key === partDetail.key) : undefined;
    const purpose = partDetail
      ? partDetail.key === "root"
        ? "组件整体"
        : (part?.descriptionZh ?? "组件的一部分")
      : "点选组件的某一部分，再改它的颜色、字号等常用项。";
    designPane = (
      <div className="ludi-inspector__pane" key={partDetail ? `${partDetail.component}:${partDetail.key}` : "matrix"}>
        {ruleSummary}
        <WhatIs purpose={purpose} title={label} />
        {impactNode}
        {componentTokens}
        <MoreSettings>
          {partDetail ? (
            <>
              <section className="ludi-group">
                <h3>结构层</h3>
                <Row label="组件">
                  <span className="ludi-pill">{partDetail.component}</span>
                </Row>
                <Row label="层">
                  <span className="ludi-pill ludi-pill--mono">{partDetail.key}</span>
                </Row>
                {part ? <div className="ludi-muted">{part.descriptionZh}</div> : null}
                {meta?.note ? <div className="ludi-muted">{meta.note}</div> : null}
              </section>
              <BoundsGroup bounds={partDetail.bounds} />
              <StylesGroup styles={partDetail.styles} />
            </>
          ) : null}
          {props.structureControls}
          {themeSection}
          {rulesSection}
        </MoreSettings>
      </div>
    );
  } else if (view === "canvas") {
    designPane = (
      <div className="ludi-inspector__pane">
        {ruleSummary}
        {blockNotice}
        <WhatIs
          note={blocks ? undefined : "这个页面还没登记区块"}
          purpose="选择模式下点选页内一块，这里会说明它是什么、能做什么。"
          title="画布"
        />
        {impactNode}
        <MoreSettings>
          {themeSection}
          {rulesSection}
        </MoreSettings>
      </div>
    );
  } else {
    designPane = (
      <div className="ludi-inspector__pane">
        {ruleSummary}
        <WhatIs purpose={SYSTEM_PURPOSE[panelTitle]} title={panelTitle} />
        {impactNode}
        {tokenControls}
        <MoreSettings>
          {props.systemMore}
          {rulesSection}
        </MoreSettings>
      </div>
    );
  }

  const recordPane = (
    <div className="ludi-inspector__pane">
      <h2 className="ludi-inspector__title">改动记录</h2>
      {patches.length === 0 ? (
        <div className="ludi-muted">还没有写入记录。写入项目或替换组件后，检查进度与撤销入口显示在这里。</div>
      ) : (
        patches.map((entry) => (
          <PatchRecord
            busy={busy}
            canUndo={entry.patch.id === latestUndoableId}
            entry={entry}
            key={entry.patch.id}
            onCancelBlock={onCancelBlock}
            onUndo={onUndo}
          />
        ))
      )}
    </div>
  );

  return (
    <div className="ludi-inspector">
      {latestPatch ? (
        <div className="ludi-result" data-status={undoTarget ? PATCH_STATUS_TONE[undoTarget.status] : PATCH_STATUS_TONE[latestPatch.status]}>
          <span>
            最近写入 · {patches[0]?.unknown ? "状态未知，请刷新确认" : PATCH_STATUS_LABEL[latestPatch.status]}
          </span>
          {undoTarget ? (
            <Button disabled={busy} onClick={() => onUndo(undoTarget)} size="small">
              撤销最近一次写入
            </Button>
          ) : null}
        </div>
      ) : null}
      <Tabs
        activeKey={activeKey}
        className="ludi-inspector__tabs"
        items={[
          { key: "design", label: "设计", children: designPane },
          { key: "records", label: "改动记录", children: recordPane }
        ]}
        onChange={setActiveKey}
      />
    </div>
  );
}
