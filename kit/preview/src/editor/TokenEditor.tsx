// 「基础」可写 token 控件：颜色（10 值，含对比度提示）、文字（字体族 / 代码字体 / 基础字号 / 行高）、
// 间距（antd 单位与步长、--do-space 三档、控件高度）、圆角与效果（圆角 / 大圆角 / 线宽 / 阴影档位 / 动效）。
// 数值越界夹回范围并短暂闪烁，不弹错误；对比度与规则拦截在「规则」页签展示并禁用写入。
// 检查器「样式」页签按当前分区挑选分组渲染；派生值只读展示，数值由 antd getDesignToken 算出。
// 图标与布局栅格两个分组是合同 / 结构级只读，不在本组件内（见 FoundationInfo）。

import { useMemo, useState, type ReactNode } from "react";
import { AutoComplete, Button, ColorPicker, InputNumber, Segmented, Select, Switch } from "antd";
import { Copy, TextCursorInput } from "lucide-react";
import type { ShadowLevel, ThemeDraft } from "./api";
import { contrastLevel, deriveTokens, formatPx, upperHex } from "./spec-data";
import {
  clampNumber,
  colorUnchanged,
  contrastRatio,
  fontFamilyProblem,
  nearestCompliantAgainst,
  SHADOW_LEVELS,
  type NumericTokenKey,
  type NumericRange
} from "./theme-rules";

export type TokenGroup = "color" | "typography" | "spacing" | "effects";

export type TokenEditorProps = {
  draft: ThemeDraft;
  disabled: boolean;
  ranges: Record<NumericTokenKey, NumericRange>;
  groups: TokenGroup[];
  showDerived: boolean;
  /** 只渲染派生（只读）区，给右栏「更多设置」用；常用的可编辑项在上面单独渲染。 */
  onlyDerived?: boolean;
  baseline: ThemeDraft | null;
  onChange: (draft: ThemeDraft) => void;
};

type ColorFieldName =
  | "colorPrimary"
  | "colorSuccess"
  | "colorWarning"
  | "colorError"
  | "colorInfo"
  | "colorText"
  | "colorTextSecondary"
  | "colorBorder"
  | "colorBgBase"
  | "colorBgContainer";

type FontFieldName = "fontFamily" | "fontFamilyCode";

function KeyValueRow(props: { label: string; token: string; hint?: string; stack?: boolean; children: ReactNode }) {
  return (
    <>
      <div className={props.stack ? "ludi-kv ludi-kv--stack" : "ludi-kv"}>
        <div className="ludi-kv__label">
          <span>{props.label}</span>
          <code title={props.token}>{props.token}</code>
        </div>
        <div className="ludi-kv__control">{props.children}</div>
      </div>
      {props.hint ? <div className={props.stack ? "ludi-kv__hint ludi-kv__hint--stack" : "ludi-kv__hint"}>{props.hint}</div> : null}
    </>
  );
}

function ReadonlyRow({ label, value, swatch, stack }: { label: string; value: string; swatch?: string; stack?: boolean }) {
  if (stack) {
    return (
      <div className="ludi-kv ludi-kv--readonly ludi-kv--stack">
        <div className="ludi-kv__label">
          <code title={label}>{label}</code>
        </div>
        <div className="ludi-kv__control ludi-kv__control--start">
          <span className="ludi-kv__value ludi-kv__value--start">
            {swatch ? <i className="ludi-swatch" style={{ background: swatch }} /> : null}
            {value}
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className="ludi-kv ludi-kv--readonly">
      <div className="ludi-kv__label">
        <code title={label}>{label}</code>
      </div>
      <div className="ludi-kv__control">
        <span className="ludi-kv__value">
          {swatch ? <i className="ludi-swatch" style={{ background: swatch }} /> : null}
          {value}
        </span>
      </div>
    </div>
  );
}

function NumberField(props: {
  label: string;
  token?: string;
  unit: string;
  value: number;
  range: NumericRange;
  disabled: boolean;
  onValue: (value: number) => void;
}) {
  const [flashKey, setFlashKey] = useState(0);
  const { label, unit, value, range, disabled, onValue } = props;
  return (
    <KeyValueRow hint={`${range.min}–${range.max}${unit ? ` ${unit}` : ""}`} label={label} token={props.token ?? label}>
      <div className={flashKey > 0 ? "ludi-number-wrap ludi-field__flash" : "ludi-number-wrap"} key={`flash-${flashKey}`}>
        <InputNumber
          aria-label={`${label}（${range.min} 到 ${range.max}${unit ? ` ${unit}` : ""}）`}
          className="ludi-number"
          controls={false}
          disabled={disabled}
          max={range.max}
          min={range.min}
          onChange={(raw) => {
            if (typeof raw !== "number" || Number.isNaN(raw)) return;
            const { value: clamped, clamped: wasClamped } = clampNumber(raw, range);
            if (wasClamped) setFlashKey((key) => key + 1);
            onValue(clamped);
          }}
          step={range.step}
          value={value}
        />
        {unit ? <span className="ludi-kv__unit">{unit}</span> : null}
      </div>
    </KeyValueRow>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      aria-label={label}
      className="ludi-icon-button"
      data-done={done}
      onClick={() => {
        try {
          void navigator.clipboard?.writeText(text);
          setDone(true);
          window.setTimeout(() => setDone(false), 1200);
        } catch {
          setDone(false);
        }
      }}
      type="button"
    >
      <Copy aria-hidden size={14} strokeWidth={1.75} />
    </button>
  );
}

function ColorField(props: {
  label: string;
  field: ColorFieldName;
  value: string;
  disabled: boolean;
  hint?: string;
  copyLabel: string;
  onValue: (field: ColorFieldName, value: string) => void;
}) {
  const { label, field, value, disabled, hint, copyLabel, onValue } = props;
  return (
    <KeyValueRow hint={hint} label={label} token={field}>
      <ColorPicker
        aria-label={`${label}颜色`}
        className="ludi-color-field"
        disabled={disabled}
        format="hex"
        onChange={(color) => onValue(field, color.toHexString())}
        showText
        value={value}
      />
      <CopyButton label={copyLabel} text={upperHex(value)} />
    </KeyValueRow>
  );
}

// 对比度提示（客户端镜像服务端语义）：只拦「把值改成不达标」；构成配对的值都未改动时现状不达标给琥珀色提示。
function ContrastNote(props: {
  label: string;
  fg: string;
  fgBaseline: string | null | undefined;
  bg: string;
  bgBaseline: string | null | undefined;
}) {
  const ratio = contrastRatio(props.fg, props.bg);
  if (ratio === null) return <div className="ludi-note" data-tone="fail">{props.label} 不是可解析的 hex 颜色</div>;
  const level = contrastLevel(ratio);
  const current = ratio < 4.5 && colorUnchanged(props.fg, props.fgBaseline) && colorUnchanged(props.bg, props.bgBaseline);
  const suggestion = ratio < 4.5 ? nearestCompliantAgainst(props.fg, props.bg) : null;
  return (
    <div className="ludi-note" data-tone={ratio >= 4.5 ? "pass" : current ? "warn" : "fail"}>
      <span>
        {current ? (
          <>
            现状不达标 · <code>{ratio.toFixed(2)}</code>
          </>
        ) : (
          <>
            {props.label} <code>{ratio.toFixed(2)}</code> · {ratio >= 4.5 ? level.label : "低于 4.5:1"}
          </>
        )}
      </span>
      {suggestion ? (
        <span className="ludi-note__suggest">
          {current ? "建议" : "推荐"}
          <i style={{ background: suggestion }} />
          <code>{upperHex(suggestion)}</code>
        </span>
      ) : null}
    </div>
  );
}

// 功能色（成功 / 警告 / 信息）只显示对白对比度数值，不拦截。
function RatioNote({ label, color }: { label: string; color: string }) {
  const ratio = contrastRatio(color, "#ffffff");
  return (
    <div className="ludi-note" data-tone="pass">
      <span>
        {label} <code>{ratio === null ? "—" : ratio.toFixed(2)}</code> · 仅提示
      </span>
    </div>
  );
}

const FONT_PRESETS: Array<{ label: string; value: string }> = [
  { label: "系统默认（小豆盒现用栈）", value: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif' },
  { label: "苹方", value: '"PingFang SC", "Microsoft YaHei", sans-serif' },
  { label: "思源黑体", value: '"Source Han Sans SC", "Noto Sans SC", "PingFang SC", sans-serif' },
  { label: "微软雅黑", value: '"Microsoft YaHei", "PingFang SC", sans-serif' },
  { label: "Inter", value: 'Inter, "PingFang SC", "Microsoft YaHei", sans-serif' }
];

const CODE_FONT_PRESETS: Array<{ label: string; value: string }> = [
  { label: "antd 默认等宽栈", value: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace" },
  { label: "JetBrains Mono", value: "'JetBrains Mono', 'SFMono-Regular', Consolas, monospace" },
  { label: "Cascadia Code", value: "'Cascadia Code', 'SFMono-Regular', Consolas, monospace" }
];

type LocalFontAccess = { queryLocalFonts?: () => Promise<Array<{ family: string }>> };

// 字体族：主选常用栈（可自由输入），支持 Local Font Access 读取本机字体（特性检测，需点击授权）。
// 行版式为纵向（标签一行、全宽输入一行、提示一行），字体栈在输入框里完整可编辑。
function FontField(props: {
  label: string;
  field: FontFieldName;
  value: string;
  disabled: boolean;
  onValue: (field: FontFieldName, value: string) => void;
}) {
  const { label, field, value, disabled, onValue } = props;
  const presets = field === "fontFamilyCode" ? CODE_FONT_PRESETS : FONT_PRESETS;
  const localFontsSupported = typeof (window as LocalFontAccess).queryLocalFonts === "function";
  const [localFonts, setLocalFonts] = useState<string[] | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [usedLocal, setUsedLocal] = useState(false);
  const problem = fontFamilyProblem(value);

  const readLocalFonts = async () => {
    const access = window as LocalFontAccess;
    if (typeof access.queryLocalFonts !== "function") return;
    try {
      const fonts = await access.queryLocalFonts();
      const families = [...new Set(fonts.map((font) => font.family))].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
      setLocalFonts(families);
      setLocalError(null);
    } catch {
      setLocalFonts(null);
      setLocalError("未读取到本机字体（授权被拒绝或浏览器不支持），仍可手动输入字体名。");
    }
  };

  const pickLocal = (family: string) => {
    const quoted = /^[\p{L}\p{N}-]+$/u.test(family) ? family : `"${family}"`;
    const parts = value.split(",").map((item) => item.trim());
    parts[0] = quoted;
    onValue(field, parts.filter(Boolean).join(", "));
    setUsedLocal(true);
  };

  return (
    <>
      <KeyValueRow hint="写回时末尾缺少通用族会自动补回退栈" label={label} stack token={field}>
        <AutoComplete
          aria-label={label}
          className="ludi-font-field"
          disabled={disabled}
          onChange={(text) => onValue(field, text)}
          options={presets.map((preset) => ({ label: preset.label, value: preset.value }))}
          value={value}
        />
      </KeyValueRow>
      {problem ? (
        <div className="ludi-note" data-tone="fail">
          {problem}
        </div>
      ) : null}
      {localFontsSupported ? (
        <div className="ludi-local-fonts">
          <Button
            disabled={disabled}
            icon={<TextCursorInput aria-hidden size={14} strokeWidth={1.75} />}
            onClick={() => void readLocalFonts()}
            size="small"
          >
            读取本机字体
          </Button>
          {localError ? <span className="ludi-muted">{localError}</span> : null}
          {localFonts ? (
            <Select
              aria-label="选择本机字体"
              className="ludi-local-fonts__select"
              onChange={pickLocal}
              options={localFonts.map((family) => ({ label: family, value: family }))}
              placeholder="选择本机字体作为首选"
              showSearch
              size="small"
              value={null}
            />
          ) : null}
          {usedLocal ? <span className="ludi-muted">已选本机字体：仅本机安装，其他电脑会回退到栈内后续字体。</span> : null}
        </div>
      ) : null}
    </>
  );
}

const SHADOW_OPTIONS = (Object.keys(SHADOW_LEVELS) as ShadowLevel[]).map((level) => ({
  label: SHADOW_LEVELS[level].label,
  value: level
}));

export function TokenEditor({ draft, disabled, ranges, groups, showDerived, onlyDerived, baseline, onChange }: TokenEditorProps) {
  const setToken = (patch: Partial<ThemeDraft>) => onChange({ ...draft, ...patch });
  const derived = useMemo(() => deriveTokens(draft), [draft]);
  const has = (group: TokenGroup) => groups.includes(group);
  const onColor = (field: ColorFieldName, value: string) => setToken({ [field]: value });
  const onNumber = (field: NumericTokenKey, value: number) => setToken({ [field]: value });
  const onFont = (field: FontFieldName, value: string) => setToken({ [field]: value });
  // --do-space 三档保持 sm ≤ md ≤ lg：编辑任一档时把相邻档夹到合法区间（服务端仍做最终拒绝）。
  const onSpace = (field: "spaceSm" | "spaceMd" | "spaceLg", value: number) => {
    const next = { ...draft, [field]: value };
    if (field === "spaceSm") {
      next.spaceMd = Math.max(next.spaceMd, value);
      next.spaceLg = Math.max(next.spaceLg, next.spaceMd);
    } else if (field === "spaceMd") {
      next.spaceSm = Math.min(next.spaceSm, value);
      next.spaceLg = Math.max(next.spaceLg, value);
    } else {
      next.spaceMd = Math.min(next.spaceMd, value);
      next.spaceSm = Math.min(next.spaceSm, next.spaceMd);
    }
    onChange(next);
  };

  const numberRow = (field: NumericTokenKey, label: string, unit = "px", token?: string) => (
    <NumberField
      disabled={disabled}
      key={field}
      label={label}
      onValue={(value) => onNumber(field, value)}
      range={ranges[field]}
      token={token ?? field}
      unit={unit}
      value={draft[field]}
    />
  );

  return (
    <>
      {has("color") && !onlyDerived ? (
        <section className="ludi-group">
          <h3>颜色</h3>
          <h4 className="ludi-subtitle">品牌与功能色</h4>
          <ColorField copyLabel="复制主色值" disabled={disabled} field="colorPrimary" label="主色" onValue={onColor} value={draft.colorPrimary} />
          <ContrastNote bg="#ffffff" bgBaseline="#ffffff" fg={draft.colorPrimary} fgBaseline={baseline?.colorPrimary} label="主色 / 白字" />
          <ColorField copyLabel="复制成功色值" disabled={disabled} field="colorSuccess" label="成功" onValue={onColor} value={draft.colorSuccess} />
          <RatioNote color={draft.colorSuccess} label="成功色 / 白字" />
          <ColorField copyLabel="复制警告色值" disabled={disabled} field="colorWarning" label="警告" onValue={onColor} value={draft.colorWarning} />
          <RatioNote color={draft.colorWarning} label="警告色 / 白字" />
          <ColorField copyLabel="复制错误色值" disabled={disabled} field="colorError" label="错误" onValue={onColor} value={draft.colorError} />
          <ContrastNote bg="#ffffff" bgBaseline="#ffffff" fg={draft.colorError} fgBaseline={baseline?.colorError} label="错误色 / 白字" />
          <ColorField copyLabel="复制信息色值" disabled={disabled} field="colorInfo" label="信息" onValue={onColor} value={draft.colorInfo} />
          <RatioNote color={draft.colorInfo} label="信息色 / 白字" />
          <h4 className="ludi-subtitle">文字与边框</h4>
          <ColorField copyLabel="复制文字色值" disabled={disabled} field="colorText" hint="同步页面文字色" label="文字" onValue={onColor} value={draft.colorText} />
          <ContrastNote bg={draft.colorBgContainer} bgBaseline={baseline?.colorBgContainer} fg={draft.colorText} fgBaseline={baseline?.colorText} label="文字 / 容器底色" />
          <ContrastNote bg={draft.colorBgBase} bgBaseline={baseline?.colorBgBase} fg={draft.colorText} fgBaseline={baseline?.colorText} label="文字 / 页面底色" />
          <ColorField copyLabel="复制次级文字色值" disabled={disabled} field="colorTextSecondary" hint="同步页面次级文字色" label="次级文字" onValue={onColor} value={draft.colorTextSecondary} />
          <ContrastNote bg={draft.colorBgContainer} bgBaseline={baseline?.colorBgContainer} fg={draft.colorTextSecondary} fgBaseline={baseline?.colorTextSecondary} label="次级文字 / 容器底色" />
          <ColorField copyLabel="复制边框色值" disabled={disabled} field="colorBorder" hint="同步页面边框色" label="边框" onValue={onColor} value={draft.colorBorder} />
          <h4 className="ludi-subtitle">背景</h4>
          <ColorField copyLabel="复制页面底色值" disabled={disabled} field="colorBgBase" label="页面底色" onValue={onColor} value={draft.colorBgBase} />
          <ColorField copyLabel="复制容器底色值" disabled={disabled} field="colorBgContainer" label="容器底色" onValue={onColor} value={draft.colorBgContainer} />
        </section>
      ) : null}
      {has("color") && showDerived ? (
        <section className="ludi-group">
          <h3>派生色阶（只读）</h3>
          <ReadonlyRow label="colorPrimaryHover" swatch={derived.color.primaryHover} value={upperHex(derived.color.primaryHover)} />
          <ReadonlyRow label="colorPrimaryActive" swatch={derived.color.primaryActive} value={upperHex(derived.color.primaryActive)} />
          <ReadonlyRow label="colorPrimaryBorder" swatch={derived.color.primaryBorder} value={upperHex(derived.color.primaryBorder)} />
          <ReadonlyRow label="colorPrimaryBorderHover" swatch={derived.color.primaryBorderHover} value={upperHex(derived.color.primaryBorderHover)} />
          <ReadonlyRow label="colorPrimaryBg" swatch={derived.color.primaryBg} value={upperHex(derived.color.primaryBg)} />
          <ReadonlyRow label="colorPrimaryBgHover" swatch={derived.color.primaryBgHover} value={upperHex(derived.color.primaryBgHover)} />
        </section>
      ) : null}

      {has("typography") && !onlyDerived ? (
        <section className="ludi-group">
          <h3>文字</h3>
          <FontField disabled={disabled} field="fontFamily" label="字体族" onValue={onFont} value={draft.fontFamily} />
          <FontField disabled={disabled} field="fontFamilyCode" label="代码字体" onValue={onFont} value={draft.fontFamilyCode} />
          {numberRow("fontSize", "基础字号")}
          {numberRow("lineHeight", "行高", "")}
        </section>
      ) : null}
      {has("typography") && showDerived ? (
        <section className="ludi-group">
          <h3>标题阶梯（只读，由基础字号派生）</h3>
          {derived.font.headings.map((size, index) => (
            <ReadonlyRow key={`h${index + 1}`} label={`fontSizeHeading${index + 1}`} value={formatPx(size)} />
          ))}
        </section>
      ) : null}

      {has("spacing") && !onlyDerived ? (
        <section className="ludi-group">
          <h3>间距</h3>
          {numberRow("sizeUnit", "间距单位")}
          {numberRow("sizeStep", "间距步长")}
          <NumberField disabled={disabled} label="空间 · 小" onValue={(value) => onSpace("spaceSm", value)} range={ranges.spaceSm} token="--do-space-sm" unit="px" value={draft.spaceSm} />
          <NumberField disabled={disabled} label="空间 · 中" onValue={(value) => onSpace("spaceMd", value)} range={ranges.spaceMd} token="--do-space-md" unit="px" value={draft.spaceMd} />
          <NumberField disabled={disabled} label="空间 · 大" onValue={(value) => onSpace("spaceLg", value)} range={ranges.spaceLg} token="--do-space-lg" unit="px" value={draft.spaceLg} />
          {numberRow("controlHeight", "控件高度")}
        </section>
      ) : null}
      {has("spacing") && showDerived ? (
        <section className="ludi-group">
          <h3>派生阶梯（只读）</h3>
          <ReadonlyRow label="controlHeightSM" value={formatPx(derived.control.sm)} />
          <ReadonlyRow label="controlHeightLG" value={formatPx(derived.control.lg)} />
          <ReadonlyRow label="padding / margin 阶梯" stack value={[derived.space.xs, derived.space.sm, derived.space.md, derived.space.lg, derived.space.xl].map(formatPx).join(" / ")} />
        </section>
      ) : null}

      {has("effects") && !onlyDerived ? (
        <section className="ludi-group">
          <h3>圆角与效果</h3>
          {numberRow("borderRadius", "圆角")}
          {numberRow("borderRadiusLG", "大圆角")}
          {numberRow("lineWidth", "线宽")}
          <KeyValueRow label="阴影" token="boxShadow">
            <Segmented
              aria-label="阴影档位"
              disabled={disabled || draft.shadowLevel === "custom"}
              onChange={(level) => setToken({ shadowLevel: level as ShadowLevel })}
              options={SHADOW_OPTIONS}
              size="small"
              value={draft.shadowLevel === "custom" ? undefined : draft.shadowLevel}
            />
          </KeyValueRow>
          {draft.shadowLevel === "custom" ? (
            <div className="ludi-note" data-tone="fail">
              源码中的阴影值不是档位值，请先在源码对齐后再用编辑器调整。
            </div>
          ) : null}
          <KeyValueRow hint="关闭后 antd 组件的过渡动效停用" label="动效" token="motion">
            <Switch
              aria-label="动效开关"
              checked={draft.motion}
              disabled={disabled}
              onChange={(checked) => setToken({ motion: checked })}
              size="small"
            />
          </KeyValueRow>
          {numberRow("motionUnit", "动效快慢", "s")}
        </section>
      ) : null}
      {has("effects") && showDerived ? (
        <section className="ludi-group">
          <h3>圆角阶梯（只读）</h3>
          <ReadonlyRow label="borderRadiusXS" value={formatPx(derived.radius.xs)} />
          <ReadonlyRow label="borderRadiusSM" value={formatPx(derived.radius.sm)} />
        </section>
      ) : null}
    </>
  );
}
