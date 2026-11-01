// 组件矩阵 iframe（/editor/matrix?component=X&editor=1）：
// 使用小豆盒草稿主题与默认 antd prefix 渲染 P0 组件的变体 × 尺寸 × 状态；
// 版式：分组标题 + 白色大卡片，卡片内按变体分小节，每个格子下方是 mono 标签。
// 接收编辑器 theme-preview / clear-preview，只在内存改 deviceOpsTheme 并重渲染，不写文件。

import { useEffect, useReducer, useRef, type ReactNode } from "react";
import { Alert, Button, ConfigProvider, Drawer, Input, Modal, Popconfirm, Select, Space, Table, Tag } from "antd";
import zhCN from "antd/locale/zh_CN";
import type { ColumnsType } from "antd/es/table";
import { SearchOutlined } from "@ant-design/icons";
import "antd/dist/reset.css";
import "./matrix.css";
import { deviceOpsTheme, deviceOpsComponentStyles } from "../../../../projects/tianshu-device-ops/theme";
import {
  installShortcutForwarding,
  isEditorChild,
  parseEnvelope,
  parsePreviewPayload,
  postToParent,
  readBounds,
  readStyles,
  cssVarName,
  cssVarScope
} from "../bridge";
import { SEMANTIC_STRUCTURE } from "../semantic-structure";
import { COMPONENT_TOKENS } from "../component-tokens";
import { applyEditorDraft, restoreThemeDraft } from "../theme-apply";
import "../bridge-highlight.css";

// 矩阵里可点选的层：antd semantic 的 key（不可用的组件只有整体 root）。选择器见 semantic-structure.ts。
type MatrixPart = { key: string; selector: string };
function partsOf(component: string): MatrixPart[] {
  const data = SEMANTIC_STRUCTURE[component];
  if (!data) return [];
  return data.available ? data.parts.map(({ key, selector }) => ({ key, selector })) : [{ key: "root", selector: data.rootSelector }];
}
function depthOf(el: Element): number {
  let depth = 0;
  for (let node = el.parentElement; node; node = node.parentElement) depth += 1;
  return depth;
}
function partElements(selector: string): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).filter((el) => Boolean(el.closest(".ludi-matrix")));
}

type Cell = { label: string; node: ReactNode };
// 一组 = 分组标题 + 白色大卡片；卡片内按 sections 分小节（variant 等），小节可无标题。
type Section = { title?: string; cells: Cell[] };
// stage：Modal / Drawer 内嵌到格子内（overlay），Popconfirm 的气泡留在格子内（popup）。
type MatrixRow = { title: string; sections: Section[]; stage?: "overlay" | "popup" };

const SIZES = ["large", "medium", "small"] as const;

function row(title: string, sections: Section[], stage?: MatrixRow["stage"]): MatrixRow {
  return { title, sections, stage };
}

function flat(cells: Cell[]): Section[] {
  return [{ cells }];
}

type DeviceRow = { sn: string; status: string; seen: string };
const tableColumns: ColumnsType<DeviceRow> = [
  { title: "SN", dataIndex: "sn" },
  { title: "在网状态", dataIndex: "status" },
  { title: "最近上线", dataIndex: "seen" }
];
const tableData: DeviceRow[] = [
  { sn: "TS24090283", status: "在线", seen: "2026-09-30 09:12" },
  { sn: "TS24090291", status: "离线", seen: "2026-09-29 21:47" },
  { sn: "TS24090302", status: "从未上线", seen: "—" }
];

const selectOptions = [
  { label: "在线", value: "online" },
  { label: "离线", value: "offline" },
  { label: "从未上线", value: "never" }
];

function matrixRows(component: string): MatrixRow[] | null {
  switch (component) {
    case "Button":
      return [
        row(
          "变体 × 尺寸",
          (["primary", "default", "dashed", "link", "text"] as const).map((type) => ({
            title: type,
            cells: SIZES.map((size) => ({
              label: size,
              node: (
                <Button key={`${type}-${size}`} type={type} size={size}>
                  保存
                </Button>
              )
            }))
          }))
        ),
        row(
          "状态",
          flat([
            { label: "禁用", node: <Button disabled>保存</Button> },
            { label: "加载中", node: <Button loading>保存</Button> },
            { label: "危险", node: <Button danger type="primary">删除</Button> },
            { label: "图标", node: <Button icon={<SearchOutlined aria-hidden="true" aria-label={undefined} />}>查询</Button> }
          ])
        )
      ];
    case "Input":
      return [
        row(
          "变体 × 尺寸",
          (["outlined", "filled", "borderless"] as const).map((variant) => ({
            title: variant,
            cells: SIZES.map((size) => ({
              label: size,
              node: <Input key={`${variant}-${size}`} placeholder="输入设备 SN" size={size} style={{ width: 180 }} variant={variant} />
            }))
          }))
        ),
        row(
          "状态",
          flat([
            { label: "默认值", node: <Input defaultValue="TS24090283" style={{ width: 180 }} /> },
            { label: "禁用", node: <Input disabled placeholder="输入设备 SN" style={{ width: 180 }} /> },
            { label: "错误", node: <Input placeholder="输入设备 SN" status="error" style={{ width: 180 }} /> },
            { label: "警告", node: <Input placeholder="输入设备 SN" status="warning" style={{ width: 180 }} /> },
            {
              label: "前后缀",
              node: (
                <Input prefix="SN" suffix=".cn" allowClear showCount defaultValue="24090283" placeholder="编号" style={{ width: 240 }} />
              )
            }
          ])
        )
      ];
    case "Select":
      return [
        row(
          "变体 × 尺寸",
          (["outlined", "filled", "borderless"] as const).map((variant) => ({
            title: variant,
            cells: SIZES.map((size) => ({
              label: size,
              node: (
                <Select
                  key={`${variant}-${size}`}
                  defaultValue="online"
                  options={selectOptions}
                  size={size}
                  style={{ width: 140 }}
                  variant={variant}
                />
              )
            }))
          }))
        ),
        row(
          "状态",
          flat([
            { label: "占位", node: <Select options={selectOptions} placeholder="选择状态" style={{ width: 140 }} /> },
            { label: "禁用", node: <Select defaultValue="online" disabled options={selectOptions} style={{ width: 140 }} /> },
            { label: "错误", node: <Select defaultValue="online" options={selectOptions} status="error" style={{ width: 140 }} /> },
            { label: "加载中", node: <Select loading options={selectOptions} style={{ width: 140 }} /> },
            {
              label: "多选",
              node: (
                <Select
                  defaultValue={["online", "offline"]}
                  mode="multiple"
                  options={selectOptions}
                  style={{ width: 220 }}
                />
              )
            }
          ])
        )
      ];
    case "Tag":
      return [
        row(
          "变体",
          (["filled", "solid", "outlined"] as const).map((variant) => ({
            title: variant,
            cells: [
              { label: "blue", node: <Tag color="blue" variant={variant}>生产中</Tag> },
              { label: "success", node: <Tag color="success" variant={variant}>在线</Tag> },
              { label: "warning", node: <Tag color="warning" variant={variant}>待复核</Tag> }
            ]
          }))
        ),
        row(
          "颜色",
          flat([
            { label: "default", node: <Tag>默认</Tag> },
            { label: "blue", node: <Tag color="blue">blue</Tag> },
            { label: "cyan", node: <Tag color="cyan">cyan</Tag> },
            { label: "purple", node: <Tag color="purple">purple</Tag> },
            { label: "error", node: <Tag color="error">error</Tag> }
          ])
        ),
        row(
          "状态",
          flat([
            { label: "可关闭", node: <Tag closable color="blue">烧录成功</Tag> },
            { label: "无边框", node: <Tag color="default" variant="filled">未收货</Tag> }
          ])
        )
      ];
    case "Table":
      return [
        row(
          "尺寸",
          flat(
            SIZES.map((size) => ({
              label: size,
              node: (
                <Table<DeviceRow>
                  columns={tableColumns}
                  dataSource={tableData}
                  key={size}
                  pagination={false}
                  rowKey="sn"
                  size={size}
                  style={{ width: 400 }}
                />
              )
            }))
          )
        ),
        row(
          "状态",
          flat([
            {
              label: "加载中",
              node: <Table<DeviceRow> columns={tableColumns} dataSource={tableData} loading rowKey="sn" style={{ width: 400 }} />
            },
            {
              label: "空数据",
              node: <Table<DeviceRow> columns={tableColumns} dataSource={[]} rowKey="sn" style={{ width: 400 }} />
            },
            {
              label: "带边框",
              node: (
                <Table<DeviceRow> bordered columns={tableColumns} dataSource={tableData} pagination={false} rowKey="sn" style={{ width: 400 }} />
              )
            }
          ])
        )
      ];
    case "Alert":
      return [
        row(
          "类型",
          flat(
            (["info", "success", "warning", "error"] as const).map((type) => ({
              label: type,
              node: (
                <Alert
                  description="烧录批次 BF-2026-09 共 240 台设备即将到期。"
                  key={type}
                  title="证书即将到期"
                  showIcon
                  style={{ width: 400 }}
                  type={type}
                />
              )
            }))
          )
        ),
        row(
          "变体与状态",
          flat([
            {
              label: "filled",
              node: <Alert title="推送任务已开始" showIcon style={{ width: 400 }} type="info" variant="filled" />
            },
            {
              label: "可关闭",
              node: <Alert closable title="固件校验通过" showIcon style={{ width: 400 }} type="success" />
            }
          ])
        )
      ];
    case "Modal":
      return [
        row(
          "内嵌",
          flat([
            {
              label: "确认删除",
              node: (
                <Modal cancelText="取消" focusable={{ trap: false, focusTriggerAfterClose: false }} getContainer={false} okText="确认删除" open style={{ top: 20 }} title="删除所选设备" width={300}>
                  将永久删除 3 台设备，删除后数据不可恢复。
                </Modal>
              )
            },
            {
              label: "提交中",
              node: (
                <Modal cancelText="取消" focusable={{ trap: false, focusTriggerAfterClose: false }} getContainer={false} loading okText="恢复出厂" open style={{ top: 20 }} title="恢复出厂设置" width={300}>
                  设备 TS24090283 将清空用户数据并回到出厂状态。
                </Modal>
              )
            }
          ]),
          "overlay"
        )
      ];
    case "Drawer":
      return [
        row(
          "内嵌",
          flat([
            {
              label: "查看详情",
              node: (
                <Drawer focusable={{ trap: false, focusTriggerAfterClose: false }} getContainer={false} open title="设备 TS24090283" size={240}>
                  私有云存储硬件 · 48 盘位 · 固件 v2.4.1
                </Drawer>
              )
            },
            {
              label: "带底部操作",
              node: (
                <Drawer
                  footer={
                    <Space>
                      <Button>取消</Button>
                      <Button type="primary">保存</Button>
                    </Space>
                  }
                  focusable={{ trap: false, focusTriggerAfterClose: false }}
                  getContainer={false}
                  open
                  title="编辑告警规则"
                  size={240}
                >
                  触发阈值持续 5 分钟后通知值班运维。
                </Drawer>
              )
            }
          ]),
          "overlay"
        )
      ];
    case "Popconfirm":
      return [
        row(
          "触发",
          flat([
            {
              label: "删除确认",
              node: (
                <Popconfirm
                  cancelText="取消"
                  getPopupContainer={(node) => node.parentElement ?? document.body}
                  okText="删除"
                  open
                  placement="bottomLeft"
                  title="确认删除设备 TS24090283？"
                >
                  <Button danger type="primary">删除</Button>
                </Popconfirm>
              )
            },
            {
              label: "静默确认",
              node: (
                <Popconfirm
                  cancelText="取消"
                  getPopupContainer={(node) => node.parentElement ?? document.body}
                  okText="静默"
                  open
                  placement="bottomLeft"
                  title="静默这条告警 24 小时？"
                >
                  <Button>静默 24 小时</Button>
                </Popconfirm>
              )
            }
          ]),
          "popup"
        )
      ];
    default:
      return null;
  }
}

// 浮层与格子边缘的留白，和格子之间的纵向间距一致。
const STAGE_GAP = 20;

// 浮层是绝对定位或固定定位，不占格子高度。按浮层实际尺寸（offset* 不受入场缩放动画影响）
// 给格子补足空间：气泡在格子下方补底部留白；内嵌弹窗按上边距对称留出下边距。
function StageSample({ stage, children }: { stage?: MatrixRow["stage"]; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sample = ref.current;
    if (!sample || (stage !== "popup" && stage !== "overlay")) return;
    let frame = 0;
    const fit = () => {
      if (stage === "popup") {
        const floating = sample.querySelector<HTMLElement>(".ant-popover, .ant-select-dropdown, .ant-tooltip");
        // 先清掉上一轮补的留白再量，否则留白算进格子高度，下一轮会判成「放得下」又把留白去掉。
        sample.style.paddingBottom = "";
        const overflow = floating ? floating.offsetTop + floating.offsetHeight - sample.clientHeight : 0;
        if (overflow > 0) sample.style.paddingBottom = `${overflow + STAGE_GAP}px`;
      } else {
        // 同一行的内嵌格子一起算：先回到样式表的默认高度，再取「弹窗上边距对称留白」所需高度的最大值，
        // 整行统一成这个高度，弹窗放得下就保持默认。
        const row = Array.from(
          (sample.closest(".ludi-matrix__cells") ?? sample).querySelectorAll<HTMLElement>('.ludi-matrix__sample[data-stage="overlay"]')
        );
        row.forEach((cell) => (cell.style.height = ""));
        const base = sample.clientHeight;
        const required = Math.max(
          base,
          ...row.map((cell) => {
            const dialog = cell.querySelector<HTMLElement>(".ant-modal");
            return dialog ? dialog.offsetTop * 2 + dialog.offsetHeight : 0;
          })
        );
        if (required > base) row.forEach((cell) => (cell.style.height = `${required}px`));
      }
    };
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    });
    const watch = () => sample.querySelectorAll<HTMLElement>(".ant-popover, .ant-select-dropdown, .ant-tooltip, .ant-modal").forEach((node) => observer.observe(node));
    const mutations = new MutationObserver(() => { watch(); fit(); });
    mutations.observe(sample, { childList: true, subtree: true });
    watch();
    frame = requestAnimationFrame(fit);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      mutations.disconnect();
    };
  }, [stage]);
  return (
    <div className="ludi-matrix__sample" data-stage={stage} ref={ref}>
      {children}
    </div>
  );
}

function MatrixContent({ component }: { component: string }) {
  const rows = matrixRows(component);
  if (!rows) {
    return (
      <div className="ludi-matrix__unknown">
        组件 {component} 不在 P0 矩阵目录内（Button、Input、Select、Tag、Table、Alert、Modal、Drawer、Popconfirm）。
      </div>
    );
  }
  return (
    <div className="ludi-matrix">
      {rows.map((matrixRow, rowIndex) => (
        <section className="ludi-matrix__group" key={`${matrixRow.title}-${rowIndex}`}>
          <h2>{matrixRow.title}</h2>
          <div className="ludi-matrix__card">
            {matrixRow.sections.map((section, sectionIndex) => (
              <div className="ludi-matrix__section" key={`${section.title ?? "s"}-${sectionIndex}`}>
                {section.title ? <h3>{section.title}</h3> : null}
                <div className="ludi-matrix__cells">
                  {section.cells.map((cell, cellIndex) => (
                    <div className="ludi-matrix__cell" key={`${cell.label}-${cellIndex}`}>
                      <StageSample stage={matrixRow.stage}>{cell.node}</StageSample>
                      <label>{cell.label}</label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function MatrixView() {
  // 同小豆盒桥接：ConfigProvider.useTheme 对同引用主题直接判等，原地改后用 key 重建一次 provider。
  const [themeRevision, bump] = useReducer((count: number) => count + 1, 0);
  const component = new URLSearchParams(window.location.search).get("component") ?? "Button";
  const highlightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isEditorChild()) return;
    const parts = partsOf(component);
    let selected: HTMLElement | null = null;

    const hide = () => {
      selected = null;
      if (highlightRef.current) highlightRef.current.hidden = true;
    };
    const paint = () => {
      const box = highlightRef.current;
      if (!box || !selected) return;
      const rect = selected.getBoundingClientRect();
      box.hidden = false;
      box.dataset.flip = rect.y < 24 ? "inside" : "above";
      box.style.left = `${rect.x}px`;
      box.style.top = `${rect.y}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
    };
    const announce = (el: HTMLElement, key: string, nth: number) => {
      selected = el;
      if (highlightRef.current) highlightRef.current.dataset.label = key === "root" ? component : `${component} › ${key}`;
      paint();
      postToParent("part-detail", {
        component,
        key,
        nth,
        tag: el.tagName.toLowerCase(),
        bounds: readBounds(el),
        styles: readStyles(el)
      });
    };

    // 点选：每个层各自 closest，取最深的匹配（嵌套层里最内层优先）。
    const onClickCapture = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest?.(".ludi-matrix")) return;
      event.preventDefault();
      event.stopPropagation();
      let best: { el: HTMLElement; key: string; selector: string; depth: number } | null = null;
      for (const part of parts) {
        const el = target.closest<HTMLElement>(part.selector);
        if (!el) continue;
        const depth = depthOf(el);
        if (!best || depth > best.depth) best = { el, key: part.key, selector: part.selector, depth };
      }
      if (!best) {
        hide();
        return;
      }
      announce(best.el, best.key, partElements(best.selector).indexOf(best.el));
    };
    // 矩阵里的控件只用来看结构，选中时不让 mousedown 触发下拉等交互。
    const onMouseDownCapture = (event: MouseEvent) => {
      if ((event.target as HTMLElement | null)?.closest?.(".ludi-matrix")) event.stopPropagation();
    };

    let layerTimer = 0;
    let lastSignature = "";
    const reportLayers = (force: boolean) => {
      const root = parts.find((part) => part.key === "root");
      const tree = {
        kind: "matrix" as const,
        component,
        rootCount: root ? partElements(root.selector).length : 0,
        parts: parts
          .filter((part) => part.key !== "root")
          .map((part) => ({ key: part.key, count: partElements(part.selector).length }))
          .filter((part) => part.count > 0)
      };
      const signature = JSON.stringify(tree);
      if (!force && signature === lastSignature) return;
      lastSignature = signature;
      postToParent("layer-tree", tree);
    };
    const scheduleLayers = () => {
      window.clearTimeout(layerTimer);
      layerTimer = window.setTimeout(() => {
        if (selected && !selected.isConnected) hide();
        reportLayers(false);
      }, 300);
    };
    const observer = new MutationObserver(scheduleLayers);
    observer.observe(document.body, { childList: true, subtree: true });
    const onScrollOrResize = () => paint();
    window.addEventListener("click", onClickCapture, true);
    window.addEventListener("mousedown", onMouseDownCapture, true);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    const removeShortcuts = installShortcutForwarding();
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== window.parent) return;
      const message = parseEnvelope(event.data);
      if (!message) return;
      if (message.type === "theme-preview") {
        const payload = parsePreviewPayload(message.payload);
        if (!payload) return;
        applyEditorDraft(payload);
        bump();
      } else if (message.type === "clear-preview") {
        restoreThemeDraft();
        bump();
      } else if (message.type === "request-component-values") {
        // 读当前组件全部登记 token 的 CSS 变量计算值（antd 把变量挂在 cssVar.key 命名的作用域类上），读不到为 null。
        const defs = COMPONENT_TOKENS[component] ?? [];
        const style = getComputedStyle(cssVarScope() ?? document.documentElement);
        const values: Record<string, string | null> = {};
        for (const def of defs) {
          const raw = style.getPropertyValue(cssVarName(component, def.name)).trim();
          values[def.name] = raw === "" ? null : raw;
        }
        postToParent("component-values", { component, values });
      } else if (message.type === "request-layers") {
        reportLayers(true);
      } else if (message.type === "select-part") {
        const payload = message.payload as { key?: unknown; nth?: unknown } | undefined;
        const part = parts.find((item) => item.key === payload?.key);
        const list = part ? partElements(part.selector) : [];
        const nth = typeof payload?.nth === "number" ? payload.nth : 0;
        const el = list[nth] ?? list[0];
        if (!part || !el) {
          postToParent("bridge-error", { code: "LOCATE_FAILED", message: `矩阵里没有这一层：${String(payload?.key)}` });
          return;
        }
        el.scrollIntoView({ block: "center", inline: "nearest" });
        window.requestAnimationFrame(() => announce(el, part.key, Math.max(0, list.indexOf(el))));
      }
    };
    window.addEventListener("message", onMessage);
    postToParent("ready", { route: "/editor/matrix" });
    scheduleLayers();
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("click", onClickCapture, true);
      window.removeEventListener("mousedown", onMouseDownCapture, true);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      removeShortcuts();
      observer.disconnect();
      window.clearTimeout(layerTimer);
    };
  }, [component]);

  return (
    <>
      <ConfigProvider {...deviceOpsComponentStyles} button={{ ...deviceOpsComponentStyles.button, autoInsertSpace: false }} key={themeRevision} locale={zhCN} theme={deviceOpsTheme}>
        <MatrixContent component={component} />
      </ConfigProvider>
      <div className="ludi-devops-bridge-highlight" hidden ref={highlightRef} />
    </>
  );
}
