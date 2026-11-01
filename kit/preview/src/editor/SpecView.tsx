// 「规范」视图：把当前草稿的 token 画成卡片（上半可视示意、下半 mono 标签），按六个基础分组组织。
// 示意图用 CSS 按草稿数值绘制，不渲染 antd 组件（「控件取值」区块除外，用嵌套 ConfigProvider 隔离），
// 数值全部来自草稿、antd 派生（spec-data.ts）与 bootstrap.foundations 的源码读数，不含手写常量。

import { useMemo, type CSSProperties, type ReactNode } from "react";
import { Button, Card as AntCard, ConfigProvider, Input, Tag } from "antd";
import type { FoundationsInfo, ShadowLevel, ThemeDraft } from "./api";
import type { SystemId } from "./nav-data";
import {
  contrastBetween,
  contrastLevel,
  deriveTokens,
  formatPx,
  sampleTheme,
  upperHex
} from "./spec-data";
import { contrastWithWhite, nearestCompliantPrimary, SHADOW_LEVELS } from "./theme-rules";

function Block(props: { title: string; desc: string; children: ReactNode }) {
  return (
    <section className="ludi-spec__block">
      <h2>{props.title}</h2>
      <p>{props.desc}</p>
      {props.children}
    </section>
  );
}

function Card(props: {
  sample: ReactNode;
  label: string;
  note?: string;
  sampleClass?: string;
  sampleStyle?: CSSProperties;
  tone?: "fail";
  footWrap?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const body = (
    <>
      <div className={`ludi-card__sample ${props.sampleClass ?? ""}`} style={props.sampleStyle}>
        {props.sample}
      </div>
      <div className={props.footWrap ? "ludi-card__foot ludi-card__foot--wrap" : "ludi-card__foot"}>
        <code>{props.label}</code>
        {props.note ? <span>{props.note}</span> : null}
      </div>
    </>
  );
  if (props.onClick) {
    return (
      <button className="ludi-card ludi-card--action" onClick={props.onClick} title={props.title} type="button">
        {body}
      </button>
    );
  }
  return (
    <div className="ludi-card" data-tone={props.tone}>
      {body}
    </div>
  );
}

type SpecProps = {
  draft: ThemeDraft;
  foundations?: FoundationsInfo | null;
};

function swatch(color: string): CSSProperties {
  return { background: color };
}

function PairCard(props: { fg: string; bg: string; label: string; note?: string }) {
  const ratio = contrastBetween(props.fg, props.bg);
  const level = contrastLevel(ratio);
  return (
    <Card
      label={props.label}
      note={props.note}
      sample={
        <span className="ludi-pair" style={{ color: props.fg }}>
          {ratio === null ? "—" : ratio.toFixed(2)} · {level.label}
        </span>
      }
      sampleClass="ludi-card__sample--pair"
      sampleStyle={swatch(props.bg)}
      tone={level.tone === "fail" ? "fail" : undefined}
    />
  );
}

function SwatchCard({ token, color, note }: { token: string; color: string; note?: string }) {
  return <Card label={`${token} · ${upperHex(color)}`} note={note} sample={null} sampleClass="ludi-card__sample--swatch" sampleStyle={swatch(color)} />;
}

function ColorSpec({ draft }: SpecProps) {
  const ratio = contrastWithWhite(draft.colorPrimary);
  const suggestion = ratio !== null && ratio < 4.5 ? nearestCompliantPrimary(draft.colorPrimary) : null;
  const derived = useMemo(() => deriveTokens(draft), [draft]);
  return (
    <>
      <Block desc="每组文字与底色的对比度，按 WCAG 判定；把值改成低于 4.5:1 时禁止写入，未改动的现状只提示。" title="前景与背景">
        <div className="ludi-spec__grid">
          <PairCard
            bg={draft.colorPrimary}
            fg="#ffffff"
            label="colorPrimary / 白字"
            note={suggestion ? `推荐 ${upperHex(suggestion)}` : undefined}
          />
          <PairCard bg="#ffffff" fg={draft.colorError} label="colorError / 白字" />
          <PairCard bg={draft.colorBgBase} fg={draft.colorText} label="colorText / colorBgBase" />
          <PairCard bg={draft.colorBgContainer} fg={draft.colorText} label="colorText / colorBgContainer" />
          <PairCard bg={draft.colorBgContainer} fg={draft.colorTextSecondary} label="次级文字 / colorBgContainer" />
          <PairCard bg={draft.colorBgContainer} fg={draft.colorPrimary} label="colorPrimary / colorBgContainer" />
        </div>
      </Block>
      <Block desc="品牌与功能色刷新按钮、告警与链接。成功 / 警告 / 信息色只显示对比度，不拦截。" title="品牌与功能色">
        <div className="ludi-spec__grid">
          <SwatchCard color={draft.colorPrimary} token="colorPrimary" />
          <SwatchCard color={draft.colorSuccess} token="colorSuccess" />
          <SwatchCard color={draft.colorWarning} token="colorWarning" />
          <SwatchCard color={draft.colorError} token="colorError" />
          <SwatchCard color={draft.colorInfo} token="colorInfo" />
        </div>
      </Block>
      <Block desc="正文与次级文字、边框与两级背景；前三个同步 styles.css 的 --do-text* 与 --do-border。" title="文字与边框">
        <div className="ludi-spec__grid">
          <SwatchCard color={draft.colorText} note="--do-text" token="colorText" />
          <SwatchCard color={draft.colorTextSecondary} note="--do-text-secondary" token="colorTextSecondary" />
          <SwatchCard color={draft.colorBorder} note="--do-border" token="colorBorder" />
          <SwatchCard color={draft.colorBgBase} note="--do-bg" token="colorBgBase" />
          <SwatchCard color={draft.colorBgContainer} note="--do-surface" token="colorBgContainer" />
        </div>
      </Block>
      <Block desc="主色由 antd 算法派生的悬停、按下、边框与浅底阶梯，只读。" title="主色派生色阶（只读）">
        <div className="ludi-spec__grid">
          <SwatchCard color={derived.color.primaryHover} token="colorPrimaryHover" />
          <SwatchCard color={derived.color.primaryActive} token="colorPrimaryActive" />
          <SwatchCard color={derived.color.primaryBorder} token="colorPrimaryBorder" />
          <SwatchCard color={derived.color.primaryBorderHover} token="colorPrimaryBorderHover" />
          <SwatchCard color={derived.color.primaryBg} token="colorPrimaryBg" />
          <SwatchCard color={derived.color.primaryBgHover} token="colorPrimaryBgHover" />
        </div>
      </Block>
    </>
  );
}

function TypographySpec({ draft }: SpecProps) {
  const derived = useMemo(() => deriveTokens(draft), [draft]);
  const family: CSSProperties = { fontFamily: draft.fontFamily };
  const codeFamily: CSSProperties = { fontFamily: draft.fontFamilyCode };
  const headingLabels = ["h1", "h2", "h3", "h4", "h5"];
  const bodySizes: Array<[string, string, number]> = [
    ["fontSizeSM", "小号", derived.font.sm],
    ["fontSize", "正文", derived.font.base],
    ["fontSizeLG", "大号", derived.font.lg],
    ["fontSizeXL", "特大", derived.font.xl]
  ];
  return (
    <>
      <Block desc="项目正文与代码的字体栈，写回时末尾缺少通用族会自动补回退栈；可直接编辑，也可在主栏选常用栈。" title="字体族">
        <div className="ludi-spec__grid ludi-spec__grid--wide">
          <Card
            footWrap
            label="fontFamily · 正文"
            note={draft.fontFamily}
            sample={
              <div className="ludi-specimen" style={family}>
                <strong>Ag</strong>
                <span>ABCDEFGHIJKLMNOPQRSTUVWXYZ</span>
                <span>abcdefghijklmnopqrstuvwxyz</span>
                <span>设备运营 固件推送 0123456789</span>
              </div>
            }
          />
          <Card
            footWrap
            label="fontFamilyCode · 代码与数值"
            note={draft.fontFamilyCode}
            sample={
              <div className="ludi-specimen" style={codeFamily}>
                <strong>Ag</strong>
                <span>colorPrimary · #1677FF</span>
                <span>TS24090283 · v2.4.1</span>
                <span>0123456789 !@#$%^&amp;*()</span>
              </div>
            }
          />
        </div>
      </Block>
      <Block desc="由基础字号派生的标题阶梯（只读），改动基础字号时整体缩放。" title="标题">
        <div className="ludi-spec__stack">
          {derived.font.headings.map((size, index) => (
            <Card
              key={headingLabels[index]}
              label={`${headingLabels[index]} · fontSizeHeading${index + 1} · ${formatPx(size)}`}
              note="由基础字号派生"
              sample={
                <span className="ludi-heading-sample" style={{ ...family, fontSize: size }}>
                  设备运营平台 · 固件推送
                </span>
              }
            />
          ))}
        </div>
      </Block>
      <Block desc="正文与辅助文字的字号阶梯，行高跟随草稿的 lineHeight。" title="正文与行高">
        <div className="ludi-spec__stack">
          {bodySizes.map(([token, name, size]) => (
            <Card
              key={token}
              label={`${token} · ${formatPx(size)}`}
              note={name}
              sample={
                <span className="ludi-heading-sample" style={{ ...family, fontSize: size, lineHeight: draft.lineHeight, color: draft.colorText }}>
                  设备 TS24090283 已在线，最近一次上线 2026-09-30 09:12。
                </span>
              }
            />
          ))}
        </div>
      </Block>
    </>
  );
}

function IconsSpec({ foundations }: SpecProps) {
  const icons = foundations?.icons;
  if (!icons) return <div className="ludi-muted">接口未提供图标用量数据。</div>;
  const total = icons.files.reduce((sum, file) => sum + file.count, 0);
  return (
    <>
      <Block desc="图标库由项目合同锁定，编辑器只读展示用量；换库等于换底座，不在编辑器内调整。" title="图标库（只读）">
        <div className="ludi-spec__grid">
          <Card
            label={`${icons.library} · 合同锁定`}
            note={`${total} 处使用 · ${icons.files.length} 个文件`}
            sample={<span className="ludi-pair">@ant-design/icons</span>}
            sampleClass="ludi-card__sample--pair"
          />
        </div>
      </Block>
      <Block desc="从项目源码静态扫描的各文件图标用量（具名导入与 JSX 使用次数），只读。" title="各文件用量（只读）">
        <div className="ludi-icon-table" role="table" aria-label="各文件图标用量">
          <div className="ludi-icon-table__row ludi-icon-table__row--head" role="row">
            <span role="columnheader">文件</span>
            <span role="columnheader">次数</span>
            <span role="columnheader">图标</span>
          </div>
          {icons.files.map((file) => (
            <div className="ludi-icon-table__row" key={file.file} role="row">
              <span className="ludi-icon-table__file" role="cell" title={file.file}>
                {file.file.split("/").pop() ?? file.file}
              </span>
              <code role="cell">{file.count} 处</code>
              <span className="ludi-icon-table__chips" role="cell">
                {file.icons.map((icon) => (
                  <i className="ludi-chip" key={icon}>
                    {icon}
                  </i>
                ))}
              </span>
            </div>
          ))}
        </div>
      </Block>
    </>
  );
}

function SpacingSpec({ draft }: SpecProps) {
  const derived = useMemo(() => deriveTokens(draft), [draft]);
  const levels: Array<[string, string, number, "small" | "medium" | "large"]> = [
    ["controlHeightSM", "SM", derived.control.sm, "small"],
    ["controlHeight", "默认", derived.control.base, "medium"],
    ["controlHeightLG", "LG", derived.control.lg, "large"]
  ];
  const spaces: Array<[string, number]> = [
    ["--do-space-sm", draft.spaceSm],
    ["--do-space-md", draft.spaceMd],
    ["--do-space-lg", draft.spaceLg]
  ];
  const ladder: Array<[string, number]> = [
    ["paddingXS / marginXS", derived.space.xs],
    ["paddingSM / marginSM", derived.space.sm],
    ["padding / margin", derived.space.md],
    ["paddingLG / marginLG", derived.space.lg],
    ["paddingXL / marginXL", derived.space.xl]
  ];
  return (
    <>
      <Block desc="antd 间距体系的基数，派生整套内边距与外边距阶梯。" title="antd 间距基数">
        <div className="ludi-spec__grid">
          <Card
            label={`sizeUnit · ${formatPx(draft.sizeUnit)}`}
            sample={<span className="ludi-height-bar" style={{ height: 12, width: draft.sizeUnit * 8 }} />}
            sampleClass="ludi-card__sample--bar"
          />
          <Card
            label={`sizeStep · ${formatPx(draft.sizeStep)}`}
            sample={<span className="ludi-height-bar" style={{ height: 12, width: draft.sizeStep * 8 }} />}
            sampleClass="ludi-card__sample--bar"
          />
        </div>
      </Block>
      <Block desc="小豆盒 styles.css 的三档间距变量，壳层与页面的留白都从这里取；保持 sm ≤ md ≤ lg。" title="--do-space 三档">
        <div className="ludi-spec__grid">
          {spaces.map(([token, value]) => (
            <Card
              key={token}
              label={`${token} · ${formatPx(value)}`}
              sample={<span className="ludi-height-bar" style={{ height: 12, width: value * 4 }} />}
              sampleClass="ludi-card__sample--bar"
              note="按 4 倍宽绘制"
            />
          ))}
        </div>
      </Block>
      <Block desc="控件高度由基准值派生出 SM 与 LG 两档，条形按真实像素绘制。" title="控件高度">
        <div className="ludi-spec__grid">
          {levels.map(([token, name, value]) => (
            <Card
              key={token}
              label={`${token} · ${formatPx(value)}`}
              note={name}
              sample={<span className="ludi-height-bar" style={{ height: value }} />}
              sampleClass="ludi-card__sample--bar"
            />
          ))}
        </div>
      </Block>
      <Block desc="同一档高度下按钮与输入框的实际尺寸。" title="控件取值">
        <div className="ludi-spec__grid ludi-spec__grid--wide">
          <Card
            label="Button · SM / 默认 / LG"
            sample={
              <ThemedScope draft={draft}>
                <div className="ludi-row">
                  {levels.map(([token, , , size]) => (
                    <Button key={token} size={size} type="primary">
                      保存
                    </Button>
                  ))}
                </div>
              </ThemedScope>
            }
          />
          <Card
            label="Input · SM / 默认 / LG"
            sample={
              <ThemedScope draft={draft}>
                <div className="ludi-column">
                  {levels.map(([token, , , size]) => (
                    <Input key={token} placeholder="输入设备 SN" size={size} style={{ width: 180 }} />
                  ))}
                </div>
              </ThemedScope>
            }
          />
        </div>
      </Block>
      <Block desc="由 sizeUnit 与 sizeStep 派生的内边距 / 外边距阶梯（antd 两边取值一致），只读。" title="派生 padding / margin 阶梯（只读）">
        <div className="ludi-spec__grid">
          {ladder.map(([token, value]) => (
            <Card
              key={token}
              label={`${token} · ${formatPx(value)}`}
              sample={<span className="ludi-height-bar" style={{ height: 12, width: value * 4 }} />}
              sampleClass="ludi-card__sample--bar"
              note="按 4 倍宽绘制"
            />
          ))}
        </div>
      </Block>
    </>
  );
}

// 控件取值卡片里放真实 antd 组件：嵌套 ConfigProvider 用默认前缀 "ant" 与外壳的 "ludi" 隔离，
// 主题只由当前草稿与小豆盒固定值组成（inherit:false，不继承外壳的黑色主题）。
function ThemedScope({ draft, children }: { draft: ThemeDraft; children: ReactNode }) {
  const theme = useMemo(
    () => sampleTheme(draft),
    [draft]
  );
  return (
    <ConfigProvider button={{ autoInsertSpace: false }} prefixCls="ant" theme={theme}>
      {children}
    </ConfigProvider>
  );
}

function RadiusEffectsSpec({ draft }: SpecProps) {
  const derived = useMemo(() => deriveTokens(draft), [draft]);
  // 小数值的差异在 1:1 下肉眼难辨，圆角示意按 4 倍放大绘制，标签仍写真实数值。
  const corner = (radius: number): CSSProperties => ({ borderTopLeftRadius: Math.min(radius * 4, 72) });
  const steps: Array<[string, number, string | undefined]> = [
    ["borderRadiusXS", derived.radius.xs, undefined],
    ["borderRadiusSM", derived.radius.sm, undefined],
    ["borderRadius", derived.radius.base, "基准"],
    ["borderRadiusLG", derived.radius.lg, undefined]
  ];
  const shadowLevels = Object.keys(SHADOW_LEVELS) as ShadowLevel[];
  return (
    <>
      <Block desc="整套圆角由基准值与大圆角组成，它也是按钮与输入框的圆角。示意图按 4 倍放大绘制，标签是真实数值。" title="基准值">
        <div className="ludi-spec__grid">
          <Card
            label={`borderRadius · ${formatPx(draft.borderRadius)}`}
            sample={<div className="ludi-corner" style={corner(draft.borderRadius)} />}
            sampleClass="ludi-card__sample--corner"
          />
          <Card
            label={`borderRadiusLG · ${formatPx(draft.borderRadiusLG)}`}
            sample={<div className="ludi-corner" style={corner(draft.borderRadiusLG)} />}
            sampleClass="ludi-card__sample--corner"
          />
          <Card
            label={`lineWidth · ${formatPx(draft.lineWidth)}`}
            note="线宽"
            sample={
              <div className="ludi-linewidth">
                <span className="ludi-linewidth__rule" style={{ borderTop: `${draft.lineWidth}px solid ${draft.colorText}` }} />
                <span className="ludi-linewidth__box" style={{ border: `${draft.lineWidth}px solid ${draft.colorBorder}`, borderRadius: derived.radius.sm }} />
              </div>
            }
            sampleClass="ludi-card__sample--bar"
          />
        </div>
      </Block>
      <Block desc="antd 由基准值派生的圆角阶梯，从最紧到最圆。示意图按 4 倍放大绘制，标签是真实数值。" title="圆角阶梯">
        <div className="ludi-spec__grid">
          {steps.map(([token, value, note]) => (
            <Card key={token} label={`${token} · ${formatPx(value)}`} note={note} sample={<div className="ludi-corner" style={corner(value)} />} sampleClass="ludi-card__sample--corner" />
          ))}
        </div>
      </Block>
      <Block desc="圆角与线宽在真实控件上的取值，每张卡片的标签写明所用的阶梯。" title="控件取值">
        <div className="ludi-spec__grid ludi-spec__grid--wide">
          <Card
            label="Button · borderRadius"
            sample={
              <ThemedScope draft={draft}>
                <Button type="primary">保存</Button>
              </ThemedScope>
            }
          />
          <Card
            label="Input · borderRadius"
            sample={
              <ThemedScope draft={draft}>
                <Input placeholder="输入设备 SN" style={{ width: 180 }} />
              </ThemedScope>
            }
          />
          <Card
            label="Tag · borderRadiusSM"
            sample={
              <ThemedScope draft={draft}>
                <Tag color="blue">生产中</Tag>
              </ThemedScope>
            }
          />
          <Card
            label="Card · borderRadiusLG"
            sample={
              <ThemedScope draft={draft}>
                <AntCard size="small" style={{ width: 160 }}>
                  设备 TS24090283
                </AntCard>
              </ThemedScope>
            }
          />
        </div>
      </Block>
      <Block desc="阴影按档位写入 boxShadow 与 boxShadowSecondary 两条 token；当前草稿的档位已在右栏选中。" title="阴影档位">
        <div className="ludi-spec__grid">
          {shadowLevels.map((level) => (
            <Card
              key={level}
              label={`${SHADOW_LEVELS[level].label} · ${level}${draft.shadowLevel === level ? " · 当前" : ""}`}
              sample={
                <span
                  className="ludi-shadow-box"
                  style={{ boxShadow: SHADOW_LEVELS[level].boxShadow === "none" ? "none" : SHADOW_LEVELS[level].boxShadow }}
                />
              }
              sampleClass="ludi-card__sample--shadow"
            />
          ))}
        </div>
      </Block>
      <Block desc="antd 组件过渡动效总开关与快慢基数（单次过渡的时长单位，秒）。" title="动效">
        <div className="ludi-spec__grid">
          <Card
            label={`motion · ${draft.motion ? "开" : "关"}`}
            note={draft.motion ? "组件过渡启用" : "组件过渡停用"}
            sample={<span className="ludi-pair">{draft.motion ? "开" : "关"}</span>}
            sampleClass="ludi-card__sample--pair"
          />
          <Card
            label={`motionUnit · ${draft.motionUnit}s`}
            note="时长基数"
            sample={<span className="ludi-pair">{draft.motionUnit}s</span>}
            sampleClass="ludi-card__sample--pair"
          />
        </div>
      </Block>
    </>
  );
}

function GridSpec({ foundations }: SpecProps) {
  const grid = foundations?.grid;
  if (!grid) return <div className="ludi-muted">接口未提供栅格数据。</div>;
  const axisMax = 1600;
  return (
    <>
      <Block desc="antd 6.5.0 的六档响应式断点（getDesignToken 派生），按 0–1600px 横轴等比标注，页面结构级设置，本批只读。" title="antd 断点（只读）">
        <div className="ludi-ruler" role="img" aria-label={`断点标尺：${grid.breakpoints.map((item) => `${item.token} ${item.px}px`).join("，")}`}>
          <span className="ludi-ruler__zero">0</span>
          {/* 末端恰有断点（XXL = 1600）时刻度已写出数值，不再重复画轴端标签，避免两行文字叠在一起。 */}
          {grid.breakpoints.some((item) => item.px === axisMax) ? null : <span className="ludi-ruler__end">{axisMax}px</span>}
          <div className="ludi-ruler__track" />
          {grid.breakpoints.map((item, index) => (
            <div
              className={index % 2 === 1 ? "ludi-ruler__tick ludi-ruler__tick--high" : "ludi-ruler__tick"}
              key={item.token}
              style={{ left: `calc(5% + ${(item.px / axisMax) * 90}%)` }}
            >
              <span className="ludi-ruler__value">{item.px}</span>
              <i className="ludi-ruler__mark" />
              <span className="ludi-ruler__token">{item.token.replace("screen", "")}</span>
            </div>
          ))}
        </div>
      </Block>
      <Block desc="从小豆盒源码读出的壳层宽度：app.tsx 的 Sider width 与 styles.css 的 .device-ops-page max-width；示意按 232 + 1440 = 1672px 总宽等比绘制，本批只读。" title="小豆盒壳层（只读）">
        <div className="ludi-shell-scale" role="img" aria-label={`壳层示意：侧栏 ${grid.siderWidth}px + 内容最大宽 ${grid.contentMaxWidth}px`}>
          <div className="ludi-shell-scale__sider" style={{ width: `${((grid.siderWidth ?? 0) / ((grid.siderWidth ?? 0) + (grid.contentMaxWidth ?? 0))) * 100}%` }}>
            <span>侧栏 {grid.siderWidth === null ? "未定位" : `${grid.siderWidth}px`}</span>
          </div>
          <div className="ludi-shell-scale__content">
            <span>内容最大宽度 {grid.contentMaxWidth === null ? "未定位" : `${grid.contentMaxWidth}px`}</span>
          </div>
        </div>
        <p className="ludi-spec__note">来源：{grid.sources.join("、")}</p>
      </Block>
    </>
  );
}

export function SpecView(props: SpecProps & { section: SystemId }) {
  switch (props.section) {
    case "color":
      return <ColorSpec {...props} />;
    case "typography":
      return <TypographySpec {...props} />;
    case "icons":
      return <IconsSpec {...props} />;
    case "spacing":
      return <SpacingSpec {...props} />;
    case "radius":
      return <RadiusEffectsSpec {...props} />;
    case "grid":
      return <GridSpec {...props} />;
    default:
      return <ColorSpec {...props} />;
  }
}
