// 组件页右栏「样式」页签的组件 token 区（L1），位于结构层信息之上。
// 常用项默认展开，其余收在「全部 token」里、按分组归列、可搜索；
// 每项显示中文说明、当前值（源码行 > 按「基础」草稿派生的默认值 > 矩阵 iframe 的 CSS 变量计算值 > 「由全局派生」）——
// 派生值由服务端用写回同一条 antd 链算出，跟随全局的数值随草稿实时变化（2026-10-05 增补）；
// 状态（跟随全局 / 已单独设置 / 只读），已单独设置的项提供「恢复跟随全局」；
// 只读项（阴影字符串、FontWeight 枚举、复合 padding、antd 默认 inherit 的尺寸）写明原因，不提供输入。
// 点选结构层时，与该层相关的 token 排在本区前面。

import { useMemo, useState, type ReactNode } from "react";
import { ColorPicker, Input, InputNumber } from "antd";
import type { ComponentTokenDraftEntry, ComponentTokenState, ComponentTokenValue } from "./api";
import { COMPONENT_TOKENS, type ComponentTokenDef } from "./component-tokens";

const GROUP_LABEL: Record<ComponentTokenDef["group"], string> = {
  color: "颜色",
  text: "文字",
  spacing: "间距",
  size: "尺寸",
  other: "其他"
};
const GROUP_ORDER: Array<ComponentTokenDef["group"]> = ["color", "text", "spacing", "size", "other"];

function parseComputedNumber(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const match = /^(-?\d+(?:\.\d+)?)(px)?$/.exec(raw.trim());
  return match ? Number(match[1]) : null;
}

function isHex(raw: string | null | undefined): raw is string {
  return Boolean(raw && /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(raw.trim()));
}

type ResolvedValue = { number: number | null; color: string | null; text: string | null };

function resolveValue(def: ComponentTokenDef, draftEntry: ComponentTokenValue | null | undefined, state: ComponentTokenState | undefined, computed: string | null | undefined, derived: string | number | undefined): { value: ResolvedValue; origin: "draft" | "source" | "css" | "derived" } {
  if (draftEntry !== undefined) {
    if (typeof draftEntry === "number") return { value: { number: draftEntry, color: null, text: String(draftEntry) }, origin: "draft" };
    if (draftEntry !== null) return { value: { number: null, color: draftEntry, text: draftEntry }, origin: "draft" };
    // null = 已在草稿里恢复跟随全局：继续往下读有效值（antd 派生呈现），来源仍不算源码行。
  }
  if (state !== undefined && draftEntry === undefined) {
    const value = state.value;
    if (typeof value === "number") return { value: { number: value, color: null, text: String(value) }, origin: "source" };
    return { value: { number: null, color: isHex(String(value)) ? String(value).toLowerCase() : null, text: String(value) }, origin: "source" };
  }
  // 服务端按当前「基础」草稿派生的默认值（2026-10-05）：跟随全局的数值随草稿实时变化，
  // 顺位在矩阵 CSS 变量之前（派生组件 token 的 CSS 变量不随草稿重算，会让跟随值停住）。
  if (derived !== undefined) {
    const text = String(derived);
    if (def.type === "number") {
      const number = parseComputedNumber(text);
      if (number !== null) return { value: { number, color: null, text }, origin: "css" };
    }
    if (isHex(text)) return { value: { number: null, color: text.toLowerCase(), text }, origin: "css" };
    return { value: { number: parseComputedNumber(text), color: null, text }, origin: "css" };
  }
  if (computed !== undefined && computed !== null) {
    if (def.type === "number") {
      const number = parseComputedNumber(computed);
      if (number !== null) return { value: { number, color: null, text: computed }, origin: "css" };
    }
    if (isHex(computed)) return { value: { number: null, color: computed.toLowerCase(), text: computed }, origin: "css" };
    return { value: { number: parseComputedNumber(computed), color: null, text: computed }, origin: "css" };
  }
  return { value: { number: null, color: null, text: null }, origin: "derived" };
}

function unitOf(def: ComponentTokenDef): string {
  if (def.type !== "number") return "";
  if (/LineHeight/.test(def.name) || def.name === "zIndexPopup") return "";
  return "px";
}

function TokenRow({
  def,
  draftEntry,
  state,
  computed,
  derived,
  related,
  disabled,
  onSet,
  onRestore
}: {
  def: ComponentTokenDef;
  draftEntry: ComponentTokenValue | null | undefined;
  state: ComponentTokenState | undefined;
  computed: string | null | undefined;
  derived: string | number | undefined;
  related: boolean;
  disabled: boolean;
  onSet: (value: ComponentTokenValue) => void;
  onRestore: () => void;
}) {
  const { value, origin } = resolveValue(def, draftEntry, state, computed, derived);
  const unit = unitOf(def);

  let statusLabel = "跟随全局";
  let statusTone: "muted" | "custom" | "readonly" | "draft" = "muted";
  if (!def.writable) {
    statusLabel = "只读";
    statusTone = "readonly";
  } else if (draftEntry !== undefined) {
    statusLabel = "草稿未写入";
    statusTone = "draft";
  } else if (state) {
    if (state.status === "custom") {
      statusLabel = "已单独设置";
      statusTone = "custom";
    }
  }

  const statusNode = (
    <span className={`ludi-pill ludi-pill--status ludi-pill--${statusTone}`}>{statusLabel}</span>
  );

  let control: ReactNode;
  if (!def.writable) {
    control = (
      <>
        <span className="ludi-kv__value" title={value.text ?? undefined}>
          {origin === "derived" ? "由全局派生" : value.text}
        </span>
        <div className="ludi-kv__hint ludi-kv__hint--stack">{def.reason}</div>
      </>
    );
  } else if (def.type === "color") {
    control = (
      <div className="ludi-ctok__field">
        <ColorPicker
          aria-label={`${def.descriptionZh}（${def.name}）`}
          className="ludi-color-field ludi-ctok__color"
          disabled={disabled}
          format="hex"
          onChange={(color) => {
            const next = color?.toHexString();
            if (next && next !== value.color) onSet(next);
          }}
          showText
          value={value.color}
        />
        {def.writable && value.color === null && value.text === null ? (
          <span className="ludi-muted">由全局派生</span>
        ) : null}
      </div>
    );
  } else {
    control = (
      <div className="ludi-ctok__field">
        <InputNumber
          aria-label={`${def.descriptionZh}（${def.name}）`}
          className="ludi-number ludi-ctok__number"
          controls={false}
          disabled={disabled}
          max={def.range?.max}
          min={def.range?.min}
          onChange={(raw) => {
            if (typeof raw !== "number" || Number.isNaN(raw)) return;
            onSet(def.range?.integer ? Math.round(raw) : raw);
          }}
          placeholder={origin === "derived" ? "由全局派生" : undefined}
          step={def.range?.integer ? 1 : 0.05}
          value={value.number}
        />
        {unit ? <span className="ludi-kv__unit">{unit}</span> : null}
      </div>
    );
  }

  return (
    <div className={related ? "ludi-kv ludi-kv--ctok ludi-kv--related" : "ludi-kv ludi-kv--ctok"} data-origin={origin} key={def.name}>
      <div className="ludi-kv__label">
        <span>{def.descriptionZh}</span>
        <code title={def.descriptionZh}>{def.name}</code>
      </div>
      <div className="ludi-kv__control ludi-kv__control--start">
        <div className="ludi-ctok__meta">
          {statusNode}
          {def.writable && (draftEntry !== undefined || state?.status === "custom") ? (
            <button className="ludi-ctok__restore" disabled={disabled} onClick={onRestore} type="button">
              恢复跟随全局
            </button>
          ) : null}
        </div>
        {control}
      </div>
    </div>
  );
}

export function ComponentTokenEditor({
  component,
  partKey,
  state,
  values,
  draft,
  derived,
  disabled,
  onChange
}: {
  component: string;
  partKey: string | null;
  state: Record<string, ComponentTokenState> | undefined;
  values: Record<string, string | null> | undefined;
  draft: ComponentTokenDraftEntry | undefined;
  /** 服务端按当前「基础」草稿派生的组件默认值：跟随全局的数值随草稿实时变化。 */
  derived: Record<string, string | number> | undefined;
  disabled: boolean;
  onChange: (tokens: Record<string, ComponentTokenValue | null | undefined>) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");
  const defs = useMemo(() => COMPONENT_TOKENS[component] ?? [], [component]);
  const relatedSet = useMemo(
    () => new Set(defs.filter((def) => def.partsOf.includes(partKey ?? "")).map((def) => def.name)),
    [defs, partKey]
  );
  const order = (list: ComponentTokenDef[]) =>
    [...list].sort((a, b) => {
      const ra = relatedSet.has(a.name) ? 0 : 1;
      const rb = relatedSet.has(b.name) ? 0 : 1;
      if (ra !== rb) return ra - rb;
      return defs.indexOf(a) - defs.indexOf(b);
    });
  const commonDefs = order(defs.filter((def) => def.common));
  const restDefs = defs.filter((def) => !def.common);
  // 源码里已写、但 CLI 静态数据没有登记的组件项（如 Button.borderRadius / controlHeight 这类共享项）：
  // 只读展示当前值与跟随状态，单独调整走「基础」统一入口，L1 不把它们作为组件 token 写回。
  const sourceOnlyItems = useMemo(() => {
    if (!state) return [];
    const registered = new Set(defs.map((def) => def.name));
    return Object.entries(state).filter(([name]) => !registered.has(name));
  }, [defs, state]);
  const query = search.trim().toLowerCase();
  const searched = query
    ? order(restDefs.filter((def) => `${def.name} ${def.description} ${def.descriptionZh}`.toLowerCase().includes(query)))
    : null;
  const expanded = showAll || searched !== null;

  const renderRow = (def: ComponentTokenDef) => (
    <TokenRow
      computed={values?.[def.name]}
      def={def}
      derived={derived?.[def.name]}
      disabled={disabled}
      draftEntry={draft?.[def.name]}
      key={def.name}
      onRestore={() => {
        const entry = state?.[def.name];
        // 源码里没有这一行（本来就在跟随全局）：撤掉草稿本身，回到跟随；
        // 源码里已单独设置：草稿置 null（写入时删掉那行），同样是恢复跟随。
        if (entry) onChange({ [def.name]: null });
        else onChange({ [def.name]: undefined });
      }}
      onSet={(value) => onChange({ [def.name]: value })}
      related={relatedSet.has(def.name)}
      state={state?.[def.name]}
    />
  );

  return (
    <section className="ludi-group ludi-group--ctok">
      <h3>常用样式</h3>
      <div className="ludi-ctok__list">
        {commonDefs.map(renderRow)}
        {sourceOnlyItems.map(([name, item]) => (
          <div className="ludi-kv ludi-kv--ctok" key={name}>
            <div className="ludi-kv__label">
              <span>共享样式的组件覆盖</span>
              <code title={name}>{name}</code>
            </div>
            <div className="ludi-kv__control ludi-kv__control--start">
              <div className="ludi-ctok__meta">
                <span className={item.status === "custom" ? "ludi-pill ludi-pill--status ludi-pill--custom" : "ludi-pill ludi-pill--status ludi-pill--muted"}>
                  {item.status === "custom" ? "已单独设置" : "跟随全局"}
                </span>
              </div>
              <span className="ludi-kv__value">{String(item.value)}</span>
              <span className="ludi-kv__hint ludi-kv__hint--stack">
                {item.status === "custom" ? "此值已单独设置，全局改动会保留；本项不在官方组件样式清单内，此处只读" : `跟随全局设置，经「基础」统一调整，此处只读`}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className={expanded ? "ludi-ctok__more ludi-ctok__more--open" : "ludi-ctok__more"}>
        <div className="ludi-ctok__more-head">
          <button
            aria-expanded={expanded}
            className="ludi-ctok__more-toggle"
            onClick={() => setShowAll((current) => !current)}
            type="button"
          >
            全部样式
            <span className="ludi-ctok__more-count">{restDefs.length} 项</span>
          </button>
          <Input
            aria-label="搜索组件 token"
            className="ludi-ctok__search"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索名称或说明"
            size="small"
            value={search}
          />
        </div>
        {expanded ? (
          <div className="ludi-ctok__list">
            {GROUP_ORDER.map((group) => {
              const list = (searched ?? order(restDefs)).filter((def) => def.group === group);
              if (list.length === 0) return null;
              return (
                <div className="ludi-ctok__group" key={group}>
                  <h4 className="ludi-subtitle">{GROUP_LABEL[group]}</h4>
                  {list.map(renderRow)}
                </div>
              );
            })}
            {(searched ?? restDefs).length === 0 ? <div className="ludi-muted">没有匹配的样式项。</div> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
