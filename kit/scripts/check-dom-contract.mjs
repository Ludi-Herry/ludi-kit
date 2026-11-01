// SSR DOM contract checks for antd-migrated components: asserts public API
// props map to the promised rd-* classes and DOM shape without a browser.
// Requires a fresh dist (run via `npm run check:dom`).
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (error?.code === "ERR_UNSUPPORTED_DIR_IMPORT") {
        return nextResolve(`${specifier.replace(/\/$/, "")}/index.js`, context);
      }
      if (error?.code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith(".") && !specifier.endsWith(".js")) {
        return nextResolve(`${specifier}.js`, context);
      }
      throw error;
    }
  }
});

const {
  Button,
  BulkActionBar,
  Card,
  DataGrid,
  DataSection,
  FilterPanel,
  ForbiddenState,
  ImportFlow,
  Input,
  MetricCard,
  AIReadableProvider,
  Select,
  SideNav,
  Stepper,
  Table,
  Textarea,
  ThemeToggle
} = await import("../dist/components.js");

let failures = 0;
const check = (name, html, tests) => {
  for (const [label, pattern] of tests) {
    const ok =
      typeof pattern === "string"
        ? html.includes(pattern)
        : typeof pattern === "function"
          ? pattern(html)
          : pattern.test(html);
    if (!ok) {
      failures += 1;
      console.error(`FAIL ${name}: ${label}\n  html: ${html.slice(0, 400)}`);
    }
  }
  console.log(`checked ${name}`);
};

const withProvider = (child) => renderToStaticMarkup(h(AIReadableProvider, null, child));
const hasNestedLabels = (html) => {
  let depth = 0;
  for (const [tag] of html.matchAll(/<\/?label\b[^>]*>/g)) {
    depth += tag.startsWith("</") ? -1 : 1;
    if (depth > 1) return true;
  }
  return false;
};

const cardFull = renderToStaticMarkup(
  h(Card, { title: "T", extra: "E", footer: h("button", null, "F"), padding: "sm", bordered: false, variant: "ghost" }, "body")
);
check("Card full", cardFull, [
  ["root classes", /class="[^"]*rd-card[^"]*rd-card--sm[^"]*rd-card--ghost[^"]*rd-card--borderless/],
  ["antd borderless variant", /ant-card[^"]*(borderless|ant-card-borderless)/],
  ["h2 title kept", /<h2>T<\/h2>/],
  ["header class", "rd-card__header"],
  ["extra class", "rd-card__extra"],
  ["body class", "rd-card__body"],
  ["footer rendered", "rd-card__footer"],
  ["footer content", "<button>F</button>"]
]);

const cardPlain = renderToStaticMarkup(h(Card, { title: "OnlyTitle" }, "body"));
check("Card plain", cardPlain, [
  ["md default", "rd-card--md"],
  ["default variant class", "rd-card--default"],
  ["no footer", (html) => !html.includes("rd-card__footer")],
  ["not borderless", (html) => !html.includes("borderless")]
]);

const metric = renderToStaticMarkup(
  h(MetricCard, { label: "L", value: "42", unit: "%", delta: "+1", trend: "up", hint: "hint", icon: h("i", null, "*") })
);
check("MetricCard", metric, [
  ["root", "rd-metric"],
  ["label class", "rd-metric__label"],
  ["label text", "<span>L</span>"],
  ["icon", "<i>*</i>"],
  ["value class", "rd-metric__value"],
  ["strong value", "<strong>42</strong>"],
  ["unit", "<span>%</span>"],
  ["meta trend", "rd-metric__meta--up"],
  ["hint", "<span>hint</span>"]
]);

const stepper = renderToStaticMarkup(
  h(Stepper, {
    currentKey: "b",
    items: [
      { key: "a", title: "Step A", description: "descA" },
      { key: "b", title: "Step B", description: "descB" },
      { key: "c", title: "Step C" }
    ]
  })
);
check("Stepper", stepper, [
  ["root", "rd-stepper"],
  ["visual tree hidden", /rd-stepper__visual[^>]*aria-hidden="true"/],
  ["semantic ordered list", /<ol aria-label="流程步骤" class="rd-sr-only">/],
  ["current step exposed", /<li aria-current="step"><span>当前步骤：<\/span>Step B/],
  ["completed state exposed", /<li><span>已完成：<\/span>Step A/],
  ["item class", "rd-stepper__item"],
  ["done on first", /rd-stepper__item--done/],
  ["active on second", /rd-stepper__item--active/],
  ["icon class", "rd-stepper__index"],
  ["numbers kept", /rd-stepper__index[^>]*>(<[^>]+>)*1/],
  ["title slot", "rd-stepper__title"],
  ["strong title", "<strong>Step A</strong>"],
  ["description small", "<small>descA</small>"],
  ["rail class for hiding", "rd-stepper__rail"]
]);

const sideNav = renderToStaticMarkup(
  h(SideNav, {
    activeKey: "orders",
    items: [
      { key: "orders", label: "订单" },
      { key: "inventory", label: "库存" }
    ]
  })
);
check("SideNav", sideNav, [
  ["active page semantics", /<a aria-current="page"[^>]*><span>订单<\/span><\/a>/],
  ["inactive link has no current state", (html) => !/<a aria-current="page"[^>]*><span>库存<\/span>/.test(html)]
]);

const dangerButton = withProvider(h(Button, { danger: true, variant: "ghost" }, "删除"));
check("Button danger semantics", dangerButton, [
  ["ghost appearance kept", "rd-button--ghost"],
  ["antd danger semantics", "ant-btn-dangerous"],
  ["danger does not force primary", (html) => !html.includes("ant-btn-primary")]
]);

const legacyDangerButton = withProvider(h(Button, { variant: "danger" }, "删除"));
check("Button legacy danger variant", legacyDangerButton, [
  ["legacy class kept", "rd-button--danger"],
  ["danger semantics kept", "ant-btn-dangerous"],
  ["legacy primary appearance kept", "ant-btn-primary"]
]);

const loadingButton = withProvider(h(Button, { loading: true }, "保存"));
check("Button loading icon", loadingButton, [
  ["kit spinner", "rd-spinner"],
  ["decorative spinner hidden", /<span aria-hidden="true" class="rd-spinner"><\/span>/],
  ["loading state exposed", /<button[^>]*aria-busy="true"/],
  ["no English loading label", (html) => !/aria-label="loading"/i.test(html)]
]);

const input = withProvider(h(Input, { label: "项目名称", placeholder: "请输入项目名称" }));
check("Input label", input, [
  ["visible label", /<div class="rd-form-field"><label class="rd-form-field__label" for="([^"]+)">项目名称<\/label>/],
  ["label targets input", (html) => {
    const id = html.match(/<label class="rd-form-field__label" for="([^"]+)"/)?.[1];
    return Boolean(id && html.includes(`id="${id}"`));
  }],
  ["field wrapper is not a label", (html) => !html.includes('<label class="rd-form-field"')]
]);

const invalidInput = withProvider(
  h(Input, { "aria-describedby": "project-name-error", label: "项目名称", status: "error" })
);
check("Input error semantics", invalidInput, [
  ["invalid state exposed", /<input[^>]*aria-invalid="true"/],
  ["error description linked", /<input[^>]*aria-describedby="project-name-error"/]
]);

const textarea = withProvider(h(Textarea, { label: "范围说明", placeholder: "请说明范围" }));
check("Textarea label", textarea, [
  ["visible label", /<label class="rd-form-field__label" for="[^"]+">范围说明<\/label>/],
  ["label targets textarea", (html) => {
    const id = html.match(/<label class="rd-form-field__label" for="([^"]+)"/)?.[1];
    return Boolean(id && html.includes(`<textarea id="${id}"`));
  }]
]);

const invalidTextarea = withProvider(
  h(Textarea, { "aria-describedby": "scope-error", label: "范围说明", status: "error" })
);
check("Textarea error semantics", invalidTextarea, [
  ["invalid state exposed", /<textarea[^>]*aria-invalid="true"/],
  ["error description linked", /<textarea[^>]*aria-describedby="scope-error"/]
]);

const select = withProvider(
  h(Select, { label: "负责人", options: [], placeholder: "请选择负责人" })
);
check("Select label and icon", select, [
  ["visible label", /<label class="rd-form-field__label" for="[^"]+">负责人<\/label>/],
  ["label targets combobox", (html) => {
    const id = html.match(/<label class="rd-form-field__label" for="([^"]+)"/)?.[1];
    return Boolean(id && html.includes(`id="${id}"`) && html.includes('role="combobox"'));
  }],
  ["decorative Ant icon arrow", /<span role="img" aria-hidden="true" class="anticon anticon-down rd-select__arrow">/],
  ["no English down label", (html) => !/aria-label="down"/i.test(html)]
]);

const invalidSelect = withProvider(
  h(Select, {
    "aria-describedby": "owner-error",
    label: "负责人",
    options: [],
    status: "error"
  })
);
check("Select error semantics", invalidSelect, [
  ["invalid state exposed", (html) => /<input[^>]*role="combobox"/.test(html) && html.includes('aria-invalid="true"')],
  ["error description linked", (html) => /<input[^>]*role="combobox"/.test(html) && html.includes('aria-describedby="owner-error"')]
]);

const filterPanel = withProvider(
  h(FilterPanel, {
    fields: [
      { name: "keyword", label: "关键字" },
      { name: "status", label: "状态", type: "select", options: [] }
    ]
  })
);
check("FilterPanel labels", filterPanel, [
  ["text label closes before control", /<label for="([^"]+)">关键字<\/label><span/],
  ["select label closes before control", /<label for="([^"]+)">状态<\/label><div class="ant-select/],
  ["labels target controls", (html) => [...html.matchAll(/<label for="([^"]+)"/g)].every((match) => html.includes(`id="${match[1]}"`))],
  ["no nested labels", (html) => !hasNestedLabels(html)],
  ["select fallback placeholder", "请选择状态"],
  ["fallback placeholder is visible", /ant-select-placeholder" style="visibility:visible">请选择状态/]
]);

const bulkActionBar = withProvider(
  h(BulkActionBar, { selectedCount: 3, onClearSelection: () => {} }, h(Button, { danger: true }, "批量删除"))
);
check("BulkActionBar", bulkActionBar, [
  ["region name", /<section aria-label="批量操作" class="rd-bulk-action-bar">/],
  ["live selected count", /<span aria-live="polite" role="status">已选择 <strong>3<\/strong> 项<\/span>/],
  ["clear selection action", "取消选择"],
  ["action group", /aria-label="已选条目操作" class="rd-bulk-action-bar__actions" role="group"/],
  ["danger action", "ant-btn-dangerous"]
]);

const hiddenBulkActionBar = renderToStaticMarkup(h(BulkActionBar, { selectedCount: 0 }, "操作"));
check("BulkActionBar hidden", hiddenBulkActionBar, [
  ["zero selection renders nothing", (html) => html === ""],
  ["non-finite selections render nothing", () => [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]
    .every((selectedCount) => renderToStaticMarkup(h(BulkActionBar, { selectedCount }, "操作")) === "")]
]);

const focusableDataSection = withProvider(h(DataSection, { title: "订单列表" }, h("p", null, "数据")));
check("DataSection focus fallback", focusableDataSection, [
  ["programmatic focus target", /<section class="rd-data-section rd-data-section--default" tabindex="-1">/],
  ["section heading", "<h2>订单列表</h2>"]
]);

const componentSource = readFileSync(new URL("../src/components.tsx", import.meta.url), "utf8");
check("ConfirmDialog interaction guards", componentSource, [
  ["backdrop cannot cancel", 'mask={{ closable: false }}'],
  ["cancel receives initial focus", /cancelButtonProps=\{\{[\s\S]*?autoFocus: true/],
  ["description is linked", /panelRef=\{\(node\) => node\?\.setAttribute\("aria-describedby", descriptionId\)\}/],
  ["danger action uses semantic button", /danger \? "rd-button--danger" : "rd-button--primary"/],
  ["loading blocks keyboard close", 'keyboard={!loading}'],
  ["loading guards cancel callback", /onCancel=\{\(\) => \{\s*if \(!loading\) onCancel\(\);/],
  ["loading guards confirm callback", /onOk=\{\(\) => \{\s*if \(!loading\) onConfirm\(\);/],
  ["focus returns to trigger", /focusTriggerAfterClose: true/],
  ["focus remains trapped", /focusTriggerAfterClose: true, trap: true/],
  ["removed trigger uses stable fallback", /activeElement === document\.body \|\| !activeElement\.isConnected/],
  ["fallback target must remain mounted", /focusFallbackRef\?\.current\?\.isConnected/],
  ["fallback receives focus", /focusFallbackRef\.current\.focus\(\)/]
]);

const importReady = withProvider(
  h(ImportFlow, {
    status: "ready",
    accept: ".xml,.xlsx",
    fileName: "parser.xml",
    helpText: "仅支持 xml/xlsx",
    validationError: "文件字段缺失",
    actions: h(Button, null, "提交导入")
  })
);
check("ImportFlow ready", importReady, [
  ["state root", /class="[^"]*rd-import-flow[^"]*rd-import-flow--ready/],
  ["state attribute", 'data-status="ready"'],
  ["label targets file input", (html) => {
    const id = html.match(/<label class="rd-import-flow__file" for="([^"]+)"/)?.[1];
    return Boolean(id && html.includes(`id="${id}"`) && html.includes('type="file"'));
  }],
  ["accepted types", 'accept=".xml,.xlsx"'],
  ["selected file announced", /aria-live="polite"[^>]*>已选择：parser.xml/],
  ["validation alert", /role="alert">文件字段缺失/],
  ["action group", 'aria-label="导入流程操作"']
]);

const importProcessing = withProvider(h(ImportFlow, { status: "processing", fileName: "parser.xml" }));
check("ImportFlow processing", importProcessing, [
  ["busy state", /<section aria-busy="true"/],
  ["file input disabled", /<input[^>]*disabled=""[^>]*type="file"/],
  ["live processing copy", /role="status">正在校验并导入，请保持页面打开…/]
]);

const importSuccess = withProvider(h(ImportFlow, { status: "success", fileName: "parser.xml", details: "解析规则已启用" }));
check("ImportFlow success", importSuccess, [
  ["success status", /class="[^"]*rd-import-flow--success/],
  ["result role", /class="rd-import-flow__result" role="status"/],
  ["details", "解析规则已启用"]
]);

const importError = withProvider(h(ImportFlow, { status: "error", details: "缺少 event_type" }));
check("ImportFlow error", importError, [
  ["error state", /class="[^"]*rd-import-flow--error/],
  ["result alert", /class="rd-import-flow__result" role="alert"/],
  ["details", "缺少 event_type"]
]);

const forbidden = renderToStaticMarkup(
  h(ForbiddenState, {
    description: "缺少 platform:rbac:read 权限",
    actions: h(Button, { variant: "outline" }, "返回工作台")
  })
);
check("ForbiddenState", forbidden, [
  ["root", "rd-forbidden-state"],
  ["decorative code", /aria-hidden="true" class="rd-forbidden-state__code">403/],
  ["heading linkage", (html) => {
    const titleId = html.match(/aria-labelledby="([^"]+)"/)?.[1];
    return Boolean(titleId && html.includes(`<h1 id="${titleId}">无权访问此页面</h1>`));
  }],
  ["permission detail", "platform:rbac:read"],
  ["actions named", 'aria-label="无权限页面操作"']
]);

const repeatedRow = { id: "same", name: "重复记录" };
const dataGrid = withProvider(
  h(DataGrid, {
    columns: [{ key: "name", title: "名称" }],
    dataSource: [repeatedRow, repeatedRow],
    density: "compact",
    onRow: (_record, index) => ({ "data-source-index": index }),
    rowClassName: (_record, index) => `source-row-${index}`,
    rowSelection: true,
    selectedRowKeys: ["0"],
    onSelectionChange: () => {},
    sortable: true
  })
);
check("DataGrid row contracts", dataGrid, [
  ["duplicate object first key", 'data-row-key="0"'],
  ["duplicate object second key", 'data-row-key="1"'],
  ["unique first row selection name", 'aria-label="选择第 1 行"'],
  ["unique second row selection name", 'aria-label="选择第 2 行"'],
  ["rowClassName receives source index", /class="[^"]*source-row-1/],
  ["onRow receives source index", 'data-source-index="1"'],
  ["controlled first row selected", "ant-table-row-selected"],
  ["sortable description localized", 'aria-description="可排序"'],
  ["compact density public modifier", "rd-data-grid--compact"],
  ["compact density reaches antd", "ant-table-small"],
  ["no English sortable description", (html) => !html.includes('aria-description="sortable"')]
]);

const table = withProvider(
  h(Table, {
    columns: [{ key: "name", title: "名称" }],
    dataSource: [repeatedRow, repeatedRow],
    density: "compact",
    rowKey: (_record, index) => String(index)
  })
);
check("Table duplicate records", table, [
  ["rowKey callback receives first index", 'data-row-key="0"'],
  ["rowKey callback receives second index", 'data-row-key="1"'],
  ["compact density public modifier", "rd-table-wrap--compact"],
  ["compact density reaches antd", "ant-table-small"]
]);

const toggle = renderToStaticMarkup(h(ThemeToggle, { value: "calm" }));
check("ThemeToggle", toggle, [
  ["root", "rd-theme-toggle"],
  ["item class", "rd-theme-toggle__item"],
  ["label slot", "rd-theme-toggle__label"],
  ["radio inputs", /type="radio"/],
  ["Chinese option labels", (html) => html.includes(">鲜明<") && html.includes(">沉静<")],
  ["active marker on calm", /rd-theme-toggle__item--active[^>]*>\s*沉静\s*</],
  ["no active marker on vivid", (html) => !/rd-theme-toggle__item--active[^>]*>\s*鲜明\s*</.test(html)]
]);

const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const badgePalette = {
  primary: "#2f6fed",
  "primary-calm": "#28786c",
  secondary: "#667085",
  "secondary-calm": "#687572",
  success: "#17875d",
  warning: "#b25e09",
  danger: "#d92d20",
  info: "#2161b5",
  geekblue: "#2f54eb",
  cyan: "#13c2c2",
  purple: "#722ed1"
};
const hexToRgb = (hex) => [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
const mixRgb = (color, target, colorShare) => color.map((value, index) => value * colorShare + target[index] * (1 - colorShare));
const luminance = (color) => {
  const linear = color.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};
const contrastRatio = (left, right) => {
  const [lighter, darker] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
};
const softBadgeRatios = Object.entries(badgePalette).map(([name, hex]) => {
  const color = hexToRgb(hex);
  const textShare = name === "cyan" ? 0.6 : 0.85;
  return [name, contrastRatio(mixRgb(color, [0, 0, 0], textShare), mixRgb(color, [255, 255, 255], 0.12))];
});
check("Badge soft contrast", styles, [
  ["default soft text is darkened", "color-mix(in srgb, var(--badge-color) 85%, black)"],
  ["cyan receives stronger darkening", "--badge-soft-text: color-mix(in srgb, var(--badge-color) 60%, black)"],
  ["all soft variants meet 4.5:1", () => softBadgeRatios.every(([, ratio]) => ratio >= 4.5)]
]);

const previewHtml = readFileSync(new URL("../preview/index.html", import.meta.url), "utf8");
check("Preview document language", previewHtml, [
  ["Chinese document language", '<html lang="zh-CN">'],
  ["Chinese title", "<title>AI-readable Kit 预览</title>"]
]);

const starterHtml = readFileSync(new URL("../starter/index.html", import.meta.url), "utf8");
check("Starter document language", starterHtml, [
  ["Chinese document language", '<html lang="zh-CN">'],
  ["Chinese title", "<title>AI-readable 起步模板</title>"]
]);

const listExample = readFileSync(new URL("../examples/list-page.tsx", import.meta.url), "utf8");
check("List example status copy", listExample, [
  ["semantic status map", "orderStatusCopy"],
  ["no raw status output", (source) => !source.includes("{String(record.status)}")]
]);

const sampleGenerator = readFileSync(new URL("./generate-project-pages.mjs", import.meta.url), "utf8");
const generatedSample = readFileSync(new URL("../projects/sample-inventory-erp/generated/pages.tsx", import.meta.url), "utf8");
check("Sample status copy", `${sampleGenerator}\n${generatedSample}`, [
  ["variant copy map exists in generator and output", (source) => (source.match(/const toneCopy =/g) ?? []).length === 2],
  ["no raw variant output", (source) => !source.includes("<Badge variant={tone}>{tone}</Badge>")]
]);

const order = ["--done", "--active"].map((mark) => stepper.indexOf(mark));
if (!(order[0] >= 0 && order[1] > order[0])) {
  failures += 1;
  console.error("FAIL Stepper: done should precede active in markup");
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nALL DOM CONTRACT CHECKS PASSED");
