// 右栏「设计」页的三层结构与公共部件：
//   这是什么（WhatIs）→ 能做什么（BlockActions / BlockNotice）→ 外观（Appearance），其余全部收进「更多设置」（MoreSettings）。
// 区块操作只在画布里预览（草稿历史可撤销），合同提示的文字全部来自 page-blocks.ts 里抄自页面合同和模式表的数据。

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, ColorPicker, InputNumber } from "antd";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, CopyPlus, Replace, Trash2 } from "lucide-react";
import type { ElementDetail } from "./bridge";
import type { AiAvailability, BlockAdvice, InstanceChanges, InstanceModel, StylePatch } from "./api";
import { applyStyleFields, instanceBlocked } from "./InstanceEditor";
import { BLOCK_OP_LABEL, baseBlockId, cloneIndexOf, instanceDisplayName, type BlockOp, type BlockOpKind } from "./block-ops";
import { rankTemplates, templateById } from "./block-templates";
import { colorText } from "./DetailGroups";
import { blockById, deleteHint, replaceCriteria, type PageRegistry } from "./page-blocks";
import { elementZhName } from "./element-names";
import "./inspector-blocks.css";

export { elementZhName };

/* ------------------------------------------------------------------ 元素中文名 */

/* ------------------------------------------------------------------ 更多设置 */

const MORE_KEY = "ludi.editor.moreSettings";

function readMore(): boolean {
  try {
    return window.localStorage.getItem(MORE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMore(open: boolean) {
  try {
    window.localStorage.setItem(MORE_KEY, open ? "1" : "0");
  } catch {
    /* 隐私窗口等拿不到存储时只在本次生效 */
  }
}

export function MoreSettings({ children, summary }: { children: ReactNode; summary?: string }) {
  const [open, setOpen] = useState(readMore);
  return (
    <section className="ludi-more" data-open={open}>
      <button
        aria-expanded={open}
        className="ludi-more__toggle"
        onClick={() => {
          const next = !open;
          setOpen(next);
          writeMore(next);
        }}
        type="button"
      >
        {open ? <ChevronDown aria-hidden size={14} strokeWidth={2} /> : <ChevronRight aria-hidden size={14} strokeWidth={2} />}
        <span className="ludi-more__label">更多设置</span>
        {summary ? <span className="ludi-more__summary">{summary}</span> : null}
      </button>
      {open ? <div className="ludi-more__body">{children}</div> : null}
    </section>
  );
}

/* ------------------------------------------------------------------ 外观 */

function pxText(raw: string): string {
  return raw.replace(/-?\d*\.?\d+px/g, (match) => `${Math.round(parseFloat(match))}px`);
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ludi-kv ludi-kv--readonly">
      <div className="ludi-kv__label">
        <span>{label}</span>
      </div>
      <div className="ludi-kv__control">
        <span className="ludi-kv__value">{children}</span>
      </div>
    </div>
  );
}

function ColorValue({ value }: { value: string }) {
  const { text, swatch } = colorText(value);
  return (
    <>
      {swatch ? <i className="ludi-swatch" style={{ background: swatch }} /> : null}
      {text}
    </>
  );
}

// 外观：背景色、圆角、内边距、文字颜色直接在这里改，写入逻辑与校验和「更多设置」里的结构层样式是同一套
// （applyStyleFields → 实例草稿 → 预览 → 写入时的服务端校验），这里不另存一份。
export type AppearanceEdit = {
  model: InstanceModel | null;
  pending: boolean;
  error: string | null;
  changes: InstanceChanges | undefined;
  instanceKey: string | null;
  /** 忙、另一个实例已有草稿、或区块已被替换时只读。 */
  disabled: boolean;
  onChange: (changes: InstanceChanges) => void;
};

function toHex(css: string): string | null {
  if (/^#[0-9a-f]{6}$/i.test(css.trim())) return css.trim();
  const match = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)$/.exec(css.trim());
  if (!match || (match[4] !== undefined && Number(match[4]) !== 1)) return null;
  return `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, "0")).join("")}`;
}

const SIDES = ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"] as const;

export function Appearance({ detail, hasText, edit }: { detail: ElementDetail; hasText: boolean; edit: AppearanceEdit }) {
  const styles = detail.styles;
  const { model } = edit;
  const part = model ? (model.parts.includes("root") ? "root" : (model.parts[0] ?? "root")) : "root";
  const draftFields = edit.changes?.styles?.[part] ?? {};
  const sourceFields = model?.styles?.value?.[part] ?? {};
  const effective = (key: string): string | number | null | undefined => (key in draftFields ? draftFields[key] : sourceFields[key]);
  const num = (key: string, fallback: string): number => {
    const value = effective(key);
    return typeof value === "number" ? value : parseFloat(fallback) || 0;
  };
  const apply = (fields: StylePatch) => {
    if (model) edit.onChange(applyStyleFields(model, edit.changes, part, fields));
  };
  const textColor = typeof effective("color") === "string" ? String(effective("color")) : toHex(styles.color);
  const bgColor = typeof effective("backgroundColor") === "string" ? String(effective("backgroundColor")) : toHex(styles.backgroundColor);
  const blocked = !model || !model.styles?.writable || !textColor || instanceBlocked(model, edit.instanceKey, edit.disabled);
  const radius = num("borderRadius", styles.borderRadius);
  const sides = SIDES.map((key) => num(key, styles[key]));
  const sameSides = sides.every((value) => value === sides[0]);

  if (blocked) {
    // 只读展示：背景色、圆角、内边距、文字颜色，按元素实际有的取。
    const rows: Array<{ key: string; label: string; node: ReactNode }> = [];
    if (colorText(styles.backgroundColor).text !== "透明") rows.push({ key: "bg", label: "背景色", node: <ColorValue value={styles.backgroundColor} /> });
    const radiusText = pxText(styles.borderRadius);
    if (radiusText && !/^0(px)?$/.test(radiusText)) rows.push({ key: "radius", label: "圆角", node: radiusText });
    const padding = SIDES.map((key) => pxText(styles[key])).join(" ");
    if (!/^(0(px)? ?)+$/.test(padding)) rows.push({ key: "pad", label: "内边距", node: padding });
    if (hasText || rows.length === 0) rows.push({ key: "color", label: "文字颜色", node: <ColorValue value={styles.color} /> });
    return (
      <section className="ludi-group ludi-appearance">
        <h3>外观</h3>
        {rows.slice(0, 4).map((row) => (
          <Line key={row.key} label={row.label}>
            {row.node}
          </Line>
        ))}
        {edit.pending ? <div className="ludi-muted">正在读取可改的项…</div> : null}
        {!edit.pending && model && !model.styles?.writable ? <div className="ludi-muted">这一项暂时不能在这里改。</div> : null}
      </section>
    );
  }
  return (
    <section className="ludi-group ludi-appearance">
      <h3>外观</h3>
      <div className="ludi-kv">
        <div className="ludi-kv__label">
          <span>背景色</span>
        </div>
        <div className="ludi-kv__control ludi-kv__control--start">
          <ColorPicker
            aria-label="外观 背景色"
            className="ludi-color-field"
            format="hex"
            onChange={(color) => apply({ backgroundColor: color.toHexString(), color: textColor })}
            showText={() => bgColor ?? colorText(styles.backgroundColor).text}
            value={bgColor ?? undefined}
          />
        </div>
      </div>
      <div className="ludi-kv">
        <div className="ludi-kv__label">
          <span>圆角</span>
        </div>
        <div className="ludi-kv__control ludi-kv__control--start">
          <InputNumber
            aria-label="外观 圆角"
            className="ludi-number"
            controls={false}
            max={32}
            min={0}
            onChange={(value) => {
              if (typeof value === "number") apply({ borderRadius: value });
            }}
            value={radius}
          />
          <span className="ludi-kv__unit">px</span>
        </div>
      </div>
      <div className="ludi-kv">
        <div className="ludi-kv__label">
          <span>内边距</span>
        </div>
        <div className="ludi-kv__control ludi-kv__control--start">
          <InputNumber
            aria-label="外观 内边距"
            className="ludi-number"
            controls={false}
            max={96}
            min={0}
            onChange={(value) => {
              if (typeof value === "number") apply(Object.fromEntries(SIDES.map((key) => [key, value])));
            }}
            placeholder="各边不同"
            value={sameSides ? sides[0] : null}
          />
          <span className="ludi-kv__unit">px</span>
        </div>
      </div>
      <div className="ludi-kv">
        <div className="ludi-kv__label">
          <span>文字颜色</span>
        </div>
        <div className="ludi-kv__control ludi-kv__control--start">
          <ColorPicker
            aria-label="外观 文字颜色"
            className="ludi-color-field"
            disabled={!bgColor}
            format="hex"
            onChange={(color) => { if (bgColor) apply({ color: color.toHexString(), backgroundColor: bgColor }); }}
            showText
            value={textColor}
          />
        </div>
      </div>
      <div className="ludi-muted">{bgColor ? "文字色和背景色一起校验，写入项目时对比度不低于 4.5:1。" : "背景透明或半透明，先选背景色，再改文字颜色。"}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ 影响面一行 */

export type ImpactSummary = { pending: boolean; error: string | null; pages: number; locations: number };

export function ImpactLine({
  summary,
  open,
  onToggle
}: {
  summary: ImpactSummary | null;
  open: boolean;
  onToggle: () => void;
}) {
  let text = "正在计算影响面…";
  if (summary?.error) text = "影响面暂时算不出来";
  else if (summary && !summary.pending) {
    text = summary.pages === 0 ? "改动不会影响其他页面" : `会影响 ${summary.pages} 个页面、${summary.locations} 处`;
  }
  return (
    <div className="ludi-impact-line" data-open={open}>
      <span className="ludi-impact-line__text">{text}</span>
      <button aria-expanded={open} aria-label="查看影响面详情" className="ludi-impact-line__button" onClick={onToggle} type="button">
        {open ? "收起" : "查看详情"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ 区块：这是什么 + 能做什么 */

export type BlocksUi = {
  registry: PageRegistry;
  /** 页面上看得见的实例 id（本体 = 区块 id，新增同类副本 = `${block}#c${n}`），按有效顺序（子端上报）。 */
  visible: string[];
  ops: BlockOp[];
  disabled: boolean;
  ai: AiAvailability;
  onOp: (op: BlockOp) => void;
  onAskAdvice: (
    block: string,
    operation: BlockOpKind,
    state: { activeTemplate?: string | null; instance?: string | null }
  ) => Promise<BlockAdvice>;
  onSelectBlock: (id: string) => void;
  onUndoStep: () => void;
};

export function WhatIs({
  title,
  purpose,
  blockLink,
  note,
  basis
}: {
  title: string;
  purpose?: string;
  /** 页面合同里最关键的一条依据（如「首屏必需区块」），没有就不显示。 */
  basis?: string;
  blockLink?: { name: string; onClick: () => void };
  note?: string;
}) {
  return (
    <div className="ludi-what">
      {blockLink ? (
        <button aria-label={`选中所在区块：${blockLink.name}`} className="ludi-what__block" onClick={blockLink.onClick} type="button">
          所在区块：{blockLink.name}
          <ChevronRight aria-hidden size={12} strokeWidth={2} />
        </button>
      ) : null}
      <h2 className="ludi-inspector__title ludi-what__title">{title}</h2>
      {purpose ? <p className="ludi-what__purpose">{purpose}</p> : null}
      {basis ? <p className="ludi-what__basis">{basis}</p> : null}
      {note ? <p className="ludi-muted">{note}</p> : null}
    </div>
  );
}

// 候选缩略图：用候选模板本身渲染（独立的 /editor/block-thumb 页面，带小豆盒主题与样式），整页缩小后当预览图，不用点就看得出长什么样。
const THUMB_WIDTH = 640;
const THUMB_HEIGHT = 300;

function TemplateThumb({ id, name }: { id: string; name: string }) {
  const box = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(240);
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setWidth(Math.max(120, node.clientWidth)));
    observer.observe(node);
    setWidth(Math.max(120, node.clientWidth));
    return () => observer.disconnect();
  }, []);
  const scale = width / THUMB_WIDTH;
  return (
    <div className="ludi-thumb" ref={box} style={{ height: Math.round(THUMB_HEIGHT * scale) }}>
      <iframe
        aria-hidden="true"
        className="ludi-thumb__frame"
        src={`/editor/block-thumb?template=${encodeURIComponent(id)}`}
        style={{ height: THUMB_HEIGHT, transform: `scale(${scale})`, width: THUMB_WIDTH }}
        tabIndex={-1}
        title={`${name}预览图`}
      />
    </div>
  );
}

export function BlockActions({ blocks, blockId }: { blocks: BlocksUi; blockId: string }) {
  // blockId 是实例 id：本体 = 区块 id；新增同类副本 = `${block}#c${n}`。操作只作用于这个实例。
  const { registry, ops, visible, disabled, ai, onOp, onAskAdvice } = blocks;
  const baseId = baseBlockId(blockId);
  const copyIndex = cloneIndexOf(blockId);
  const block = blockById(registry, baseId);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [adviceOperation, setAdviceOperation] = useState<BlockOpKind>("delete");
  const [advice, setAdvice] = useState<BlockAdvice | null>(null);
  const [advicePending, setAdvicePending] = useState(false);
  const [adviceError, setAdviceError] = useState<string | null>(null);
  useEffect(() => {
    setAdviceOperation("delete");
    setAdvice(null);
    setAdviceError(null);
    setAdvicePending(false);
  }, [registry.pageId, blockId]);
  if (!block) return null;
  const index = visible.indexOf(blockId);
  const canUp = index > 0;
  const canDown = index !== -1 && index < visible.length - 1;
  const current =
    [...ops].reverse().find((op) => op.page === registry.pageId && op.instance === blockId && op.kind === "replace")?.template ?? null;
  const ranked = rankTemplates(registry, block);
  const criteria = replaceCriteria(block);
  const chooseAdviceOperation = (operation: BlockOpKind) => {
    setAdviceOperation(operation);
    setAdvice(null);
    setAdviceError(null);
  };
  const fire = (kind: BlockOp["kind"], extra: Partial<BlockOp> = {}) => {
    chooseAdviceOperation(kind);
    onOp({ page: registry.pageId, kind, block: baseId, instance: blockId, ...extra });
  };
  const askAdvice = async () => {
    if (!ai.available || advicePending) return;
    setAdvicePending(true);
    setAdviceError(null);
    try {
      setAdvice(
        await onAskAdvice(baseId, adviceOperation, {
          activeTemplate: adviceOperation === "replace" ? current : undefined,
          instance: copyIndex ? blockId : undefined
        })
      );
    } catch (cause) {
      setAdviceError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setAdvicePending(false);
    }
  };
  return (
    <section className="ludi-group ludi-block-actions">
      <h3>能做什么</h3>
      <div className="ludi-block-actions__row" role="group" aria-label="区块操作">
        <Button
          aria-expanded={replaceOpen}
          disabled={disabled}
          icon={<Replace aria-hidden size={14} strokeWidth={1.75} />}
          onClick={() => {
            chooseAdviceOperation("replace");
            setReplaceOpen((open) => !open);
          }}
          size="small"
        >
          替换
        </Button>
        <Button disabled={disabled} icon={<CopyPlus aria-hidden size={14} strokeWidth={1.75} />} onClick={() => fire("add")} size="small">
          新增同类
        </Button>
        <Button danger disabled={disabled} icon={<Trash2 aria-hidden size={14} strokeWidth={1.75} />} onClick={() => fire("delete")} size="small">
          删除
        </Button>
        <Button
          aria-label="上移"
          disabled={disabled || !canUp}
          icon={<ArrowUp aria-hidden size={14} strokeWidth={1.75} />}
          onClick={() => fire("move", { dir: -1 })}
          size="small"
        >
          上移
        </Button>
        <Button
          aria-label="下移"
          disabled={disabled || !canDown}
          icon={<ArrowDown aria-hidden size={14} strokeWidth={1.75} />}
          onClick={() => fire("move", { dir: 1 })}
          size="small"
        >
          下移
        </Button>
      </div>
      <div className="ludi-block-advice" aria-live="polite">
        <div className="ludi-block-advice__head">
          <Button disabled={disabled || !ai.available || advicePending} loading={advicePending} onClick={() => void askAdvice()} size="small">
            问 AI
          </Button>
          <span className="ludi-muted">针对{BLOCK_OP_LABEL[adviceOperation]}</span>
          {advice?.cached ? <span className="ludi-pill ludi-pill--status ludi-pill--draft">缓存结果</span> : null}
        </div>
        {!ai.available ? <div className="ludi-muted">AI 建议不可用：{ai.reason?.trim() || "本机 AI 适配器没有就绪"}</div> : null}
        {advice ? <p className="ludi-block-advice__sentence">{advice.sentence}</p> : null}
        {adviceError ? <p className="ludi-block-advice__error">AI 建议暂时拿不到：{adviceError}</p> : null}
      </div>
      {replaceOpen ? (
        <div className="ludi-replace" aria-label="替换候选">
          {criteria.length > 0 ? (
            <div className="ludi-replace__criteria">
              <strong>{block.name}替换后仍需满足</strong>
              <ul>
                {criteria.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="ludi-replace__list">
            {ranked.map(({ template, recommended }) => (
              <div className="ludi-candidate ludi-replace__item" data-current={current === template.id} key={template.id}>
                <div className="ludi-candidate__head">
                  <strong>{template.name}</strong>
                  {recommended ? <span className="ludi-pill ludi-pill--status ludi-pill--custom">推荐</span> : null}
                  {current === template.id ? <span className="ludi-pill ludi-pill--status ludi-pill--draft">预览中</span> : null}
                </div>
                <TemplateThumb id={template.id} name={template.name} />
                <div className="ludi-muted">{template.description}</div>
                <Button
                  aria-label={`用「${template.name}」替换${block.name}`}
                  block
                  disabled={disabled || current === template.id}
                  onClick={() => fire("replace", { template: template.id })}
                  size="small"
                >
                  预览替换
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

// 每做一步区块预览，提示框重挂一次并滚进视野；右栏停在下方时也能看到这一步的结果。
function revealNotice(el: HTMLDivElement | null) {
  el?.scrollIntoView({ block: "nearest" });
}

// 最近一次区块预览改动：说明这一步做了什么、依据合同给出的提示、一键撤销这一步。
export function BlockNotice({ blocks, showDeleteHint }: { blocks: BlocksUi; showDeleteHint: boolean }) {
  const { registry, ops } = blocks;
  const pageOps = ops.filter((op) => op.page === registry.pageId);
  const last = pageOps[pageOps.length - 1];
  if (!last) return null;
  if (last.kind === "delete" && !showDeleteHint) return null;
  const block = blockById(registry, last.block);
  if (!block) return null;
  // 这一步作用的实例：新增是刚产生的副本；其余按 op.instance 落到本体或某个副本。
  const targetId =
    last.kind === "add"
      ? `${last.block}#c${pageOps.filter((op, index) => index <= pageOps.length - 1 && op.kind === "add" && op.block === last.block).length}`
      : (last.instance ?? last.block);
  const name = instanceDisplayName(block.name, cloneIndexOf(targetId));
  let title = "";
  let lines: string[] = [];
  if (last.kind === "delete") {
    title = `已预览删除「${name}」`;
    lines = deleteHint(registry, block)?.lines ?? [];
  } else if (last.kind === "add") title = `已预览新增一个「${block.name}」的副本（现在的「${name}」可单独操作）`;
  else if (last.kind === "move") title = `已预览${last.dir === -1 ? "上移" : "下移"}「${name}」`;
  else title = `已预览把「${name}」换成「${templateById(last.template ?? "")?.name ?? "候选"}」`;
  return (
    <div className="ludi-block-notice" data-tone={lines.length > 0 ? "warn" : "info"} key={pageOps.length} ref={revealNotice} role="status">
      <div className="ludi-block-notice__head">
        <strong>{title}</strong>
        <Button onClick={blocks.onUndoStep} size="small">
          撤销这一步
        </Button>
      </div>
      <div className="ludi-muted">只在画布里预览，还没写入项目。</div>
      {lines.map((line) => (
        <p className="ludi-block-hint" data-tone="warn" key={line}>
          {line}
        </p>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ 规则摘要 */

export function RuleSummary({ failed, warned, message }: { failed: number; warned: number; message: string | null }) {
  if (failed === 0 && warned === 0) return null;
  return (
    <div className="ludi-rule-summary" data-tone={failed > 0 ? "fail" : "warn"}>
      {failed > 0 ? `有 ${failed} 项检查不通过${message ? `：${message}` : ""}` : `有 ${warned} 项现状不达标，不影响写入`}
      <span className="ludi-muted">　详情在「更多设置」。</span>
    </div>
  );
}
