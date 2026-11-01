// 右栏只读详情：尺寸与位置（DOM bounds）、实际渲染样式（只取宽高、内外边距、字号字重行高、颜色、背景、边框、圆角）。
// 数据来自子页的 getComputedStyle / getBoundingClientRect；像素值取整显示，悬停可看原始值，不提供编辑。

import type { ReactNode } from "react";
import type { ElementStyles, SelectionRect } from "./bridge";

function num(value: number): string {
  return String(Math.round(value));
}

// 计算样式里的像素值（含 "8.3px 11px" 这类复合值）逐个取整。
function roundPx(value: string): string {
  return value.replace(/-?\d*\.?\d+px/g, (match) => `${Math.round(parseFloat(match))}px`);
}

// rgb()/rgba() 转 #hex；带透明度时保留原值。其他写法原样返回。
export function colorText(value: string): { text: string; swatch: string | null } {
  const match = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)$/.exec(value.trim());
  if (!match) return { text: value || "—", swatch: value ? value : null };
  const alpha = match[4] === undefined ? 1 : Number(match[4]);
  if (alpha === 0) return { text: "透明", swatch: null };
  const hex = `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  return alpha === 1 ? { text: hex, swatch: value } : { text: value, swatch: value };
}

function Line({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  return (
    <div className="ludi-kv ludi-kv--readonly">
      <div className="ludi-kv__label">
        <span>{label}</span>
      </div>
      <div className="ludi-kv__control">
        <span className="ludi-kv__value" title={title}>
          {children}
        </span>
      </div>
    </div>
  );
}

function ColorLine({ label, value }: { label: string; value: string }) {
  const { text, swatch } = colorText(value);
  return (
    <Line label={label}>
      {swatch ? <i className="ludi-swatch" style={{ background: swatch }} /> : null}
      {text}
    </Line>
  );
}

export function BoundsGroup({ bounds }: { bounds: SelectionRect }) {
  return (
    <section className="ludi-group">
      <h3>尺寸与位置</h3>
      <Line label="位置" title={`${bounds.x} , ${bounds.y}`}>
        {num(bounds.x)} , {num(bounds.y)}
      </Line>
      <Line label="尺寸" title={`${bounds.width} × ${bounds.height}`}>
        {num(bounds.width)} × {num(bounds.height)}
      </Line>
    </section>
  );
}

export function StylesGroup({ styles }: { styles: ElementStyles }) {
  const box = (a: string, b: string, c: string, d: string) => [styles[a], styles[b], styles[c], styles[d]].join(" ");
  const px = (label: string, raw: string) => (
    <Line label={label} title={raw}>
      {roundPx(raw)}
    </Line>
  );
  return (
    <section className="ludi-group">
      <h3>渲染样式</h3>
      {px("宽 × 高", `${styles.width} × ${styles.height}`)}
      {px("外边距", box("marginTop", "marginRight", "marginBottom", "marginLeft"))}
      {px("内边距", box("paddingTop", "paddingRight", "paddingBottom", "paddingLeft"))}
      {px("字号", styles.fontSize)}
      <Line label="字重">{styles.fontWeight}</Line>
      {px("行高", styles.lineHeight)}
      <ColorLine label="文字颜色" value={styles.color} />
      <ColorLine label="背景色" value={styles.backgroundColor} />
      {px("边框", `${styles.borderTopWidth} ${styles.borderTopStyle}`)}
      <ColorLine label="边框颜色" value={styles.borderTopColor} />
      {px("圆角", styles.borderRadius)}
    </section>
  );
}

export function ReadOnlyNote() {
  return <div className="ludi-readonly">该层修改在下一期开放</div>;
}
