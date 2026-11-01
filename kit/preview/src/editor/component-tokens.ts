// antd 6.5.0 官方组件 token 静态数据（组件级修改 L1，九个 P0 组件）。
// 生成命令（在 kit 目录执行，--offline 不联网）：
//   npm exec --offline -- antd token <组件> --version 6.5.0 --format json
// 生成日期：2026-10-02。Button 36、Table 31、Select 24、Input 17、Modal 6、Drawer 4、Tag 3、Alert 3、Popconfirm 1，共 125 项。
// 每项在 CLI 名称 / 类型 / 中英文说明之上人工补：分组（size 尺寸 / color 颜色 / text 文字 / spacing 间距 / other 其他）、
// 校验（颜色六位 hex；数字按语义逐项范围：字号 10–32 整数、行高 1–3、zIndexPopup 0–3000 整数、其余尺寸 0–96）、
// 是否常用（每组件 1–9 个，默认展开）、结构层对应（partsOf，可空，对照 semantic-structure.ts 的 key）、
// 对比度配对（pair：同组件另一 token 名，或 global:<26 协议字段>，null 无检查）。
// 只读：阴影字符串、FontWeight 枚举、antd 默认 inherit 的 onlyIconSize*、复合 padding 字符串，reason 里写明原因，不开放写回。
// 服务端 editor-server/component-tokens.mjs 有一份内容一致的副本，两处必须同步（backend.test.mjs 有交叉断言）。

export type ComponentTokenGroup = "color" | "text" | "spacing" | "size" | "other";
export type ComponentTokenType = "color" | "number" | "readonly";
export type ComponentTokenDef = {
  name: string;
  type: ComponentTokenType;
  writable: boolean;
  range?: { min: number; max: number; integer?: boolean };
  reason?: string;
  group: ComponentTokenGroup;
  common: boolean;
  description: string;
  descriptionZh: string;
  /** 对比度配对：同组件另一 token 名，或 "global:<26 协议字段>"；null = 无对比度检查 */
  pair: string | null;
  /** 结构层 key（semantic-structure.ts），点选该层时本 token 排在前面 */
  partsOf: string[];
};

export const COMPONENT_TOKENS: Record<string, ComponentTokenDef[]> = {
  "Button": [
    { name: "contentFontSize", type: "number", writable: true, range: {"min":10,"max":32,"integer":true}, group: "text", common: true, description: "Font size of button content", descriptionZh: "按钮内容字体大小", pair: null, partsOf: ["root","content"] },
    { name: "paddingInline", type: "number", writable: true, range: {"min":0,"max":96}, group: "spacing", common: true, description: "Horizontal padding of button", descriptionZh: "按钮横向内间距", pair: null, partsOf: ["root"] },
    { name: "paddingInlineLG", type: "number", writable: true, range: {"min":0,"max":96}, group: "spacing", common: true, description: "Horizontal padding of large button", descriptionZh: "大号按钮横向内间距", pair: null, partsOf: ["root"] },
    { name: "paddingInlineSM", type: "number", writable: true, range: {"min":0,"max":96}, group: "spacing", common: true, description: "Horizontal padding of small button", descriptionZh: "小号按钮横向内间距", pair: null, partsOf: ["root"] },
    { name: "primaryColor", type: "color", writable: true, group: "color", common: true, description: "Text color of primary button", descriptionZh: "主要按钮文本颜色", pair: "global:colorPrimary", partsOf: ["root","content"] },
    { name: "defaultColor", type: "color", writable: true, group: "color", common: true, description: "Text color of default button", descriptionZh: "默认按钮文本颜色", pair: "defaultBg", partsOf: ["root"] },
    { name: "defaultBg", type: "color", writable: true, group: "color", common: true, description: "Background color of default button", descriptionZh: "默认按钮背景色", pair: null, partsOf: ["root"] },
    { name: "defaultBorderColor", type: "color", writable: true, group: "color", common: true, description: "Border color of default button", descriptionZh: "默认按钮边框颜色", pair: null, partsOf: ["root"] },
    { name: "iconGap", type: "number", writable: true, range: {"min":0,"max":96}, group: "spacing", common: true, description: "Gap between icon and text", descriptionZh: "图标文字间距", pair: null, partsOf: ["icon"] },
    { name: "dangerColor", type: "color", writable: true, group: "color", common: false, description: "Text color of danger button", descriptionZh: "危险按钮文本颜色", pair: "global:colorError", partsOf: [] },
    { name: "dangerShadow", type: "readonly", writable: false, reason: "阴影是完整 CSS 字符串，本批不排版写回；如需调整阴影请改「基础 · 圆角与效果」的档位", group: "other", common: false, description: "Shadow of danger button", descriptionZh: "危险按钮阴影", pair: null, partsOf: [] },
    { name: "dashedBgDisabled", type: "color", writable: true, group: "color", common: false, description: "", descriptionZh: "type='dashed' 禁用状态下的背景颜色", pair: null, partsOf: [] },
    { name: "defaultActiveBg", type: "color", writable: true, group: "color", common: false, description: "Background color of default button when active", descriptionZh: "默认按钮激活态背景色", pair: null, partsOf: [] },
    { name: "defaultActiveBorderColor", type: "color", writable: true, group: "color", common: false, description: "Border color of default button when active", descriptionZh: "默认按钮激活态边框颜色", pair: null, partsOf: [] },
    { name: "defaultActiveColor", type: "color", writable: true, group: "color", common: false, description: "Text color of default button when active", descriptionZh: "默认按钮激活态文字颜色", pair: "defaultActiveBg", partsOf: [] },
    { name: "defaultBgDisabled", type: "color", writable: true, group: "color", common: false, description: "", descriptionZh: "type='default' 禁用状态下的背景颜色", pair: null, partsOf: [] },
    { name: "defaultGhostBorderColor", type: "color", writable: true, group: "color", common: false, description: "Border color of default ghost button", descriptionZh: "默认幽灵按钮边框颜色", pair: null, partsOf: [] },
    { name: "defaultGhostColor", type: "color", writable: true, group: "color", common: false, description: "Text color of default ghost button", descriptionZh: "默认幽灵按钮文本颜色", pair: null, partsOf: [] },
    { name: "defaultHoverBg", type: "color", writable: true, group: "color", common: false, description: "Background color of default button when hover", descriptionZh: "默认按钮悬浮态背景色", pair: null, partsOf: [] },
    { name: "defaultHoverBorderColor", type: "color", writable: true, group: "color", common: false, description: "Border color of default button when hover", descriptionZh: "默认按钮悬浮态边框颜色", pair: null, partsOf: [] },
    { name: "defaultHoverColor", type: "color", writable: true, group: "color", common: false, description: "Text color of default button when hover", descriptionZh: "默认按钮悬浮态文本颜色", pair: "defaultHoverBg", partsOf: [] },
    { name: "defaultShadow", type: "readonly", writable: false, reason: "阴影是完整 CSS 字符串，本批不排版写回；如需调整阴影请改「基础 · 圆角与效果」的档位", group: "other", common: false, description: "Shadow of default button", descriptionZh: "默认按钮阴影", pair: null, partsOf: [] },
    { name: "fontWeight", type: "readonly", writable: false, reason: "字重是枚举字符串（FontWeight），编辑器不确定可写范围，暂不开放写回", group: "text", common: false, description: "Font weight of button", descriptionZh: "文字字重", pair: null, partsOf: [] },
    { name: "ghostBg", type: "color", writable: true, group: "color", common: false, description: "Background color of ghost button", descriptionZh: "幽灵按钮背景色", pair: null, partsOf: [] },
    { name: "linkHoverBg", type: "color", writable: true, group: "color", common: false, description: "Background color of link button on hover", descriptionZh: "链接按钮悬浮态背景色", pair: null, partsOf: [] },
    { name: "onlyIconSize", type: "readonly", writable: false, reason: "antd 默认继承字号（inherit），字符串与数字均可，编辑器无法确定类型，暂不开放写回", group: "size", common: false, description: "Icon size of button when only icon", descriptionZh: "只有图标的按钮图标尺寸", pair: null, partsOf: ["icon"] },
    { name: "onlyIconSizeLG", type: "readonly", writable: false, reason: "antd 默认继承字号（inherit），字符串与数字均可，编辑器无法确定类型，暂不开放写回", group: "size", common: false, description: "Icon size of large button when only icon", descriptionZh: "大号只有图标的按钮图标尺寸", pair: null, partsOf: ["icon"] },
    { name: "onlyIconSizeSM", type: "readonly", writable: false, reason: "antd 默认继承字号（inherit），字符串与数字均可，编辑器无法确定类型，暂不开放写回", group: "size", common: false, description: "Icon size of small button when only icon", descriptionZh: "小号只有图标的按钮图标尺寸", pair: null, partsOf: ["icon"] },
    { name: "primaryShadow", type: "readonly", writable: false, reason: "阴影是完整 CSS 字符串，本批不排版写回；如需调整阴影请改「基础 · 圆角与效果」的档位", group: "other", common: false, description: "Shadow of primary button", descriptionZh: "主要按钮阴影", pair: null, partsOf: [] },
    { name: "solidTextColor", type: "color", writable: true, group: "color", common: false, description: "Text color of solid button", descriptionZh: "默认实心按钮的文本色", pair: null, partsOf: ["root","content"] },
    { name: "textHoverBg", type: "color", writable: true, group: "color", common: false, description: "Background color of text button on hover", descriptionZh: "文本按钮悬浮态背景色", pair: null, partsOf: [] },
    { name: "textTextActiveColor", type: "color", writable: true, group: "color", common: false, description: "Text color of text button when active", descriptionZh: "默认文本按钮激活态文字颜色", pair: null, partsOf: ["content"] },
    { name: "textTextColor", type: "color", writable: true, group: "color", common: false, description: "Text color of text button", descriptionZh: "默认文本按钮的文本色", pair: "global:colorBgContainer", partsOf: ["content"] },
    { name: "textTextHoverColor", type: "color", writable: true, group: "color", common: false, description: "Text color of text button on hover", descriptionZh: "默认文本按钮悬浮态文本颜色", pair: null, partsOf: ["content"] },
    { name: "contentFontSizeLG", type: "number", writable: true, range: {"min":10,"max":32,"integer":true}, group: "text", common: false, description: "Font size of large button content", descriptionZh: "大号按钮内容字体大小", pair: null, partsOf: ["content"] },
    { name: "contentFontSizeSM", type: "number", writable: true, range: {"min":10,"max":32,"integer":true}, group: "text", common: false, description: "Font size of small button content", descriptionZh: "小号按钮内容字体大小", pair: null, partsOf: ["content"] }
  ],
  "Table": [
    { name: "headerBg", type: "color", writable: true, group: "color", common: true, description: "Background color of table header", descriptionZh: "表头背景", pair: null, partsOf: ["root","header.wrapper","header.row","header.cell","title"] },
    { name: "headerColor", type: "color", writable: true, group: "color", common: true, description: "Text color of table header", descriptionZh: "表头文字颜色", pair: "headerBg", partsOf: ["header.wrapper","header.cell"] },
    { name: "cellFontSize", type: "number", writable: true, range: {"min":10,"max":32,"integer":true}, group: "text", common: true, description: "Font size of table cell", descriptionZh: "单元格文字大小（默认大尺寸）", pair: null, partsOf: ["root","body.cell"] },
    { name: "cellPaddingBlock", type: "number", writable: true, range: {"min":0,"max":96}, group: "spacing", common: true, description: "Vertical padding of table cell", descriptionZh: "单元格纵向内间距", pair: null, partsOf: ["header.cell","body.wrapper","body.cell","content"] },
    { name: "cellPaddingInline", type: "number", writable: true, range: {"min":0,"max":96}, group: "spacing", common: true, description: "Horizontal padding of table cell", descriptionZh: "单元格横向内间距（默认大尺寸）", pair: null, partsOf: ["header.cell","body.wrapper","body.cell","content"] },
    { name: "borderColor", type: "color", writable: true, group: "color", common: true, description: "Border color of table", descriptionZh: "表格边框/分割线颜色", pair: null, partsOf: ["root","section"] },
    { name: "rowHoverBg", type: "color", writable: true, group: "color", common: true, description: "Background color of table row on hover", descriptionZh: "表格行悬浮背景色", pair: null, partsOf: ["body.row"] },
    { name: "headerBorderRadius", type: "number", writable: true, range: {"min":0,"max":96}, group: "size", common: true, description: "Border radius of table header", descriptionZh: "表头圆角", pair: null, partsOf: [] },
    { name: "bodySortBg", type: "color", writable: true, group: "color", common: false, description: "Background color of table sorted column", descriptionZh: "表格排序列背景色", pair: null, partsOf: [] },
    { name: "cellFontSizeMD", type: "number", writable: true, range: {"min":10,"max":32,"integer":true}, group: "text", common: false, description: "Font size of table cell (medium)", descriptionZh: "单元格文字大小（中等尺寸）", pair: null, partsOf: ["body.cell"] },
    { name: "cellFontSizeSM", type: "number", writable: true, range: {"min":10,"max":32,"integer":true}, group: "text", common: false, description: "Font size of table cell (small)", descriptionZh: "单元格文字大小（小尺寸）", pair: null, partsOf: ["body.cell"] },
    { name: "cellPaddingBlockMD", type: "number", writable: true, range: {"min":0,"max":96}, group: "spacing", common: false, description: "Vertical padding of table cell (medium)", descriptionZh: "单元格纵向内间距（中等尺寸）", pair: null, partsOf: [] },
    { name: "cellPaddingBlockSM", type: "number", writable: true, range: {"min":0,"max":96}, group: "spacing", common: false, description: "Vertical padding of table cell (small)", descriptionZh: "单元格纵向内间距（小尺寸）", pair: null, partsOf: [] },
    { name: "cellPaddingInlineMD", type: "number", writable: true, range: {"min":0,"max":96}, group: "spacing", common: false, description: "Horizontal padding of table cell (medium)", descriptionZh: "单元格横向内间距（中等尺寸）", pair: null, partsOf: [] },
    { name: "cellPaddingInlineSM", type: "number", writable: true, range: {"min":0,"max":96}, group: "spacing", common: false, description: "Horizontal padding of table cell (small)", descriptionZh: "单元格横向内间距（小尺寸）", pair: null, partsOf: [] },
    { name: "expandIconBg", type: "color", writable: true, group: "color", common: false, description: "Background color of expand icon", descriptionZh: "展开按钮背景色", pair: null, partsOf: [] },
    { name: "filterDropdownBg", type: "color", writable: true, group: "color", common: false, description: "Background color of filter dropdown", descriptionZh: "过滤下拉菜单颜色", pair: null, partsOf: [] },
    { name: "filterDropdownMenuBg", type: "color", writable: true, group: "color", common: false, description: "Background color of filter dropdown menu", descriptionZh: "过滤下拉菜单选项背景", pair: null, partsOf: [] },
    { name: "fixedHeaderSortActiveBg", type: "color", writable: true, group: "color", common: false, description: "Background color of fixed header sort active", descriptionZh: "固定表头排序激活态背景色", pair: null, partsOf: [] },
    { name: "footerBg", type: "color", writable: true, group: "color", common: false, description: "Background color of table footer", descriptionZh: "表格底部背景色", pair: null, partsOf: ["footer"] },
    { name: "footerColor", type: "color", writable: true, group: "color", common: false, description: "Text color of table footer", descriptionZh: "表格底部文字颜色", pair: "footerBg", partsOf: ["footer"] },
    { name: "headerFilterHoverBg", type: "color", writable: true, group: "color", common: false, description: "Background color of header filter on hover", descriptionZh: "表头过滤按钮悬浮背景色", pair: null, partsOf: [] },
    { name: "headerSortActiveBg", type: "color", writable: true, group: "color", common: false, description: "Background color of header sort active", descriptionZh: "表头排序激活态背景色", pair: null, partsOf: [] },
    { name: "headerSortHoverBg", type: "color", writable: true, group: "color", common: false, description: "Background color of header sort on hover", descriptionZh: "表头排序激活态悬浮背景色", pair: null, partsOf: [] },
    { name: "headerSplitColor", type: "color", writable: true, group: "color", common: false, description: "Color of header split line", descriptionZh: "表头分割线颜色", pair: null, partsOf: ["header.cell"] },
    { name: "rowExpandedBg", type: "color", writable: true, group: "color", common: false, description: "Background color of expanded row", descriptionZh: "表格行展开背景色", pair: null, partsOf: [] },
    { name: "rowSelectedBg", type: "color", writable: true, group: "color", common: false, description: "Background color of selected row", descriptionZh: "表格行选中背景色", pair: null, partsOf: ["body.row"] },
    { name: "rowSelectedHoverBg", type: "color", writable: true, group: "color", common: false, description: "Background color of selected row on hover", descriptionZh: "表格行选中悬浮背景色", pair: null, partsOf: ["body.row"] },
    { name: "selectionColumnWidth", type: "number", writable: true, range: {"min":0,"max":96}, group: "size", common: false, description: "Width of selection column", descriptionZh: "选择列宽度", pair: null, partsOf: [] },
    { name: "stickyScrollBarBg", type: "color", writable: true, group: "color", common: false, description: "Background color of sticky scrollbar", descriptionZh: "Sticky 模式下滚动条背景色", pair: null, partsOf: [] },
    { name: "stickyScrollBarBorderRadius", type: "number", writable: true, range: {"min":0,"max":96}, group: "size", common: false, description: "Border radius of sticky scrollbar", descriptionZh: "Sticky 模式下滚动条圆角", pair: null, partsOf: [] }
  ],
  "Select": [
    { name: "selectorBg", type: "color", writable: true, group: "color", common: true, description: "Background color of selector", descriptionZh: "选框背景色", pair: null, partsOf: ["root"] },
    { name: "activeBorderColor", type: "color", writable: true, group: "color", common: true, description: "Border color when active", descriptionZh: "激活态边框色", pair: null, partsOf: ["root"] },
    { name: "hoverBorderColor", type: "color", writable: true, group: "color", common: true, description: "Border color on hover", descriptionZh: "悬浮态边框色", pair: null, partsOf: ["root"] },
    { name: "optionFontSize", type: "number", writable: true, range: {"min":10,"max":32,"integer":true}, group: "text", common: true, description: "Font size of option", descriptionZh: "选项字体大小", pair: null, partsOf: ["root"] },
    { name: "optionHeight", type: "number", writable: true, range: {"min":0,"max":96}, group: "size", common: true, description: "Height of option", descriptionZh: "选项高度", pair: null, partsOf: ["root"] },
    { name: "optionSelectedBg", type: "color", writable: true, group: "color", common: true, description: "Background color of selected option", descriptionZh: "选项选中时背景色", pair: null, partsOf: ["root"] },
    { name: "optionSelectedColor", type: "color", writable: true, group: "color", common: true, description: "Text color of selected option", descriptionZh: "选项选中时文本颜色", pair: "optionSelectedBg", partsOf: ["root"] },
    { name: "multipleItemHeight", type: "number", writable: true, range: {"min":0,"max":96}, group: "size", common: true, description: "Height of multiple item", descriptionZh: "多选标签高度", pair: null, partsOf: ["root"] },
    { name: "activeOutlineColor", type: "color", writable: true, group: "color", common: false, description: "Outline color when active", descriptionZh: "激活态 outline 颜色", pair: null, partsOf: [] },
    { name: "clearBg", type: "color", writable: true, group: "color", common: false, description: "Background color of clear button", descriptionZh: "清空按钮背景色", pair: null, partsOf: [] },
    { name: "multipleItemBg", type: "color", writable: true, group: "color", common: false, description: "Background color of multiple item", descriptionZh: "多选标签背景色", pair: null, partsOf: ["root"] },
    { name: "multipleItemBorderColor", type: "color", writable: true, group: "color", common: false, description: "Border color of multiple item", descriptionZh: "多选标签边框色", pair: null, partsOf: [] },
    { name: "multipleItemBorderColorDisabled", type: "color", writable: true, group: "color", common: false, description: "Border color of multiple item disabled", descriptionZh: "多选标签禁用边框色", pair: null, partsOf: [] },
    { name: "multipleItemColorDisabled", type: "color", writable: true, group: "color", common: false, description: "Text color of multiple item disabled", descriptionZh: "多选标签禁用文本颜色", pair: null, partsOf: [] },
    { name: "multipleItemHeightLG", type: "number", writable: true, range: {"min":0,"max":96}, group: "size", common: false, description: "Height of large multiple item", descriptionZh: "大号多选标签高度", pair: null, partsOf: [] },
    { name: "multipleItemHeightSM", type: "number", writable: true, range: {"min":0,"max":96}, group: "size", common: false, description: "Height of small multiple item", descriptionZh: "小号多选标签高度", pair: null, partsOf: [] },
    { name: "multipleSelectorBgDisabled", type: "color", writable: true, group: "color", common: false, description: "Background of multiple selector when disabled", descriptionZh: "多选框禁用背景", pair: null, partsOf: [] },
    { name: "optionActiveBg", type: "color", writable: true, group: "color", common: false, description: "Background color of option when active", descriptionZh: "选项激活态时背景色", pair: null, partsOf: [] },
    { name: "optionLineHeight", type: "number", writable: true, range: {"min":1,"max":3}, group: "text", common: false, description: "Line height of option", descriptionZh: "选项行高", pair: null, partsOf: [] },
    { name: "optionPadding", type: "readonly", writable: false, reason: "复合 padding 字符串（纵横两段），编辑器不拆开编辑，暂不开放写回", group: "spacing", common: false, description: "Padding of option", descriptionZh: "选项内间距", pair: null, partsOf: [] },
    { name: "optionSelectedFontWeight", type: "readonly", writable: false, reason: "字重是枚举字符串（FontWeight），编辑器不确定可写范围，暂不开放写回", group: "text", common: false, description: "Font weight of selected option", descriptionZh: "选项选中时文本字重", pair: null, partsOf: [] },
    { name: "showArrowPaddingInlineEnd", type: "number", writable: true, range: {"min":0,"max":96}, group: "spacing", common: false, description: "Padding inline end of show arrow", descriptionZh: "箭头的行末内边距", pair: null, partsOf: [] },
    { name: "singleItemHeightLG", type: "number", writable: true, range: {"min":0,"max":96}, group: "size", common: false, description: "Height of single item when large", descriptionZh: "单选大号回填项高度", pair: null, partsOf: [] },
    { name: "zIndexPopup", type: "number", writable: true, range: {"min":0,"max":3000,"integer":true}, group: "other", common: false, description: "z-index of dropdown", descriptionZh: "下拉菜单 z-index", pair: null, partsOf: [] }
  ],
  "Input": [
    { name: "inputFontSize", type: "number", writable: true, range: {"min":10,"max":32,"integer":true}, group: "text", common: true, description: "Font size of input", descriptionZh: "字体大小", pair: null, partsOf: ["root"] },
    { name: "paddingBlock", type: "number", writable: true, range: {"min":0,"max":96}, group: "spacing", common: true, description: "Vertical padding of input", descriptionZh: "输入框纵向内边距", pair: null, partsOf: ["root"] },
    { name: "paddingInline", type: "number", writable: true, range: {"min":0,"max":96}, group: "spacing", common: true, description: "Horizontal padding of input", descriptionZh: "输入框横向内边距", pair: null, partsOf: ["root"] },
    { name: "activeBorderColor", type: "color", writable: true, group: "color", common: true, description: "Border color when active", descriptionZh: "激活态边框色", pair: null, partsOf: ["root"] },
    { name: "hoverBorderColor", type: "color", writable: true, group: "color", common: true, description: "Border color on hover", descriptionZh: "悬浮态边框色", pair: null, partsOf: ["root"] },
    { name: "activeBg", type: "color", writable: true, group: "color", common: true, description: "Background color when active", descriptionZh: "输入框激活状态时背景颜色", pair: null, partsOf: ["root"] },
    { name: "hoverBg", type: "color", writable: true, group: "color", common: true, description: "Background color on hover", descriptionZh: "输入框hover状态时背景颜色", pair: null, partsOf: ["root"] },
    { name: "addonBg", type: "color", writable: true, group: "color", common: true, description: "Background color of addon", descriptionZh: "前/后置标签背景色", pair: null, partsOf: ["root"] },
    { name: "activeShadow", type: "readonly", writable: false, reason: "阴影是完整 CSS 字符串，本批不排版写回；如需调整阴影请改「基础 · 圆角与效果」的档位", group: "other", common: false, description: "Shadow when active", descriptionZh: "激活态阴影", pair: null, partsOf: [] },
    { name: "errorActiveShadow", type: "readonly", writable: false, reason: "阴影是完整 CSS 字符串，本批不排版写回；如需调整阴影请改「基础 · 圆角与效果」的档位", group: "other", common: false, description: "Shadow when active with error status", descriptionZh: "错误状态时激活态阴影", pair: null, partsOf: [] },
    { name: "warningActiveShadow", type: "readonly", writable: false, reason: "阴影是完整 CSS 字符串，本批不排版写回；如需调整阴影请改「基础 · 圆角与效果」的档位", group: "other", common: false, description: "Shadow when active with warning status", descriptionZh: "警告状态时激活态阴影", pair: null, partsOf: [] },
    { name: "inputFontSizeLG", type: "number", writable: true, range: {"min":10,"max":32,"integer":true}, group: "text", common: false, description: "Font size of large input", descriptionZh: "大号字体大小", pair: null, partsOf: ["root"] },
    { name: "inputFontSizeSM", type: "number", writable: true, range: {"min":10,"max":32,"integer":true}, group: "text", common: false, description: "Font size of small input", descriptionZh: "小号字体大小", pair: null, partsOf: ["root"] },
    { name: "paddingBlockLG", type: "number", writable: true, range: {"min":0,"max":96}, group: "spacing", common: false, description: "Vertical padding of large input", descriptionZh: "大号输入框纵向内边距", pair: null, partsOf: [] },
    { name: "paddingBlockSM", type: "number", writable: true, range: {"min":0,"max":96}, group: "spacing", common: false, description: "Vertical padding of small input", descriptionZh: "小号输入框纵向内边距", pair: null, partsOf: [] },
    { name: "paddingInlineLG", type: "number", writable: true, range: {"min":0,"max":96}, group: "spacing", common: false, description: "Horizontal padding of large input", descriptionZh: "大号输入框横向内边距", pair: null, partsOf: [] },
    { name: "paddingInlineSM", type: "number", writable: true, range: {"min":0,"max":96}, group: "spacing", common: false, description: "Horizontal padding of small input", descriptionZh: "小号输入框横向内边距", pair: null, partsOf: [] }
  ],
  "Modal": [
    { name: "contentBg", type: "color", writable: true, group: "color", common: true, description: "Background color of content", descriptionZh: "内容区域背景色", pair: null, partsOf: ["container","body"] },
    { name: "headerBg", type: "color", writable: true, group: "color", common: true, description: "Background color of header", descriptionZh: "顶部背景色", pair: null, partsOf: ["header"] },
    { name: "footerBg", type: "color", writable: true, group: "color", common: true, description: "Background color of footer", descriptionZh: "底部区域背景色", pair: null, partsOf: ["footer"] },
    { name: "titleColor", type: "color", writable: true, group: "color", common: true, description: "Text color of title", descriptionZh: "标题字体颜色", pair: "headerBg", partsOf: ["header","title"] },
    { name: "titleFontSize", type: "number", writable: true, range: {"min":10,"max":32,"integer":true}, group: "text", common: true, description: "Font size of title", descriptionZh: "标题字体大小", pair: null, partsOf: ["title"] },
    { name: "titleLineHeight", type: "number", writable: true, range: {"min":1,"max":3}, group: "text", common: true, description: "Line height of title", descriptionZh: "标题行高", pair: null, partsOf: ["title"] }
  ],
  "Drawer": [
    { name: "draggerSize", type: "number", writable: true, range: {"min":0,"max":96}, group: "size", common: true, description: "Size of resize handle", descriptionZh: "拖拽手柄大小", pair: null, partsOf: ["dragger"] },
    { name: "footerPaddingBlock", type: "number", writable: true, range: {"min":0,"max":96}, group: "spacing", common: true, description: "Vertical padding of footer", descriptionZh: "底部区域纵向内间距", pair: null, partsOf: ["footer"] },
    { name: "footerPaddingInline", type: "number", writable: true, range: {"min":0,"max":96}, group: "spacing", common: true, description: "Horizontal padding of footer", descriptionZh: "底部区域横向内间距", pair: null, partsOf: ["footer"] },
    { name: "zIndexPopup", type: "number", writable: true, range: {"min":0,"max":3000,"integer":true}, group: "other", common: true, description: "z-index of popup", descriptionZh: "弹窗 z-index", pair: null, partsOf: [] }
  ],
  "Tag": [
    { name: "defaultBg", type: "color", writable: true, group: "color", common: true, description: "Default background color", descriptionZh: "默认背景色", pair: null, partsOf: ["root"] },
    { name: "defaultColor", type: "color", writable: true, group: "color", common: true, description: "Default text color", descriptionZh: "默认文字颜色", pair: "defaultBg", partsOf: ["root","icon","content"] },
    { name: "solidTextColor", type: "color", writable: true, group: "color", common: true, description: "Text color of solid variant", descriptionZh: "默认实心标签的文本色", pair: null, partsOf: ["root","content"] }
  ],
  "Alert": [
    { name: "withDescriptionIconSize", type: "number", writable: true, range: {"min":0,"max":96}, group: "size", common: true, description: "Icon size when with description", descriptionZh: "带有描述时的图标尺寸", pair: null, partsOf: ["icon"] },
    { name: "defaultPadding", type: "readonly", writable: false, reason: "复合 padding 字符串（纵横两段），编辑器不拆开编辑，暂不开放写回", group: "spacing", common: false, description: "Default padding", descriptionZh: "默认内间距", pair: null, partsOf: ["section","description"] },
    { name: "withDescriptionPadding", type: "readonly", writable: false, reason: "复合 padding 字符串（纵横两段），编辑器不拆开编辑，暂不开放写回", group: "spacing", common: false, description: "Padding when with description", descriptionZh: "带有描述的内间距", pair: null, partsOf: ["section","description"] }
  ],
  "Popconfirm": [
    { name: "zIndexPopup", type: "number", writable: true, range: {"min":0,"max":3000,"integer":true}, group: "other", common: true, description: "z-index of Popconfirm", descriptionZh: "确认框 z-index", pair: null, partsOf: ["root","container"] }
  ]
};

export const P0_COMPONENT_NAMES = Object.keys(COMPONENT_TOKENS);
