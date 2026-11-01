// antd 6.5.0 官方 semantic 结构（组件内部分层）的静态数据，供矩阵点选与图层树使用。
// 生成命令（在 kit 目录执行，--offline 不联网）：
//   npm exec --offline -- antd semantic <Comp> --version 6.5.0 --format json
// 生成日期：2026-10-01。九个组件：Button、Input、Select、Tag、Table、Alert、Modal、Drawer、Popconfirm。
// Input、Select 的 CLI 数据缺失；2026-10-03 按安装包公开 InputSemanticType / SelectSemanticType 补齐，
//   并在矩阵实际 DOM 核对类名。其余七个组件的 key 与 descriptionZh 原样取自命令输出。
// selector 不是命令输出：是按 key 对照 /editor/matrix 实际渲染的 antd 6.5.0 DOM 类名逐一核对后写入的匹配选择器；
//   当前矩阵里不存在对应 DOM 的层（例如 Table 的 title/footer、Drawer 的 extra/dragger、Popconfirm 的 content）
//   不会出现在图层树里，也不会被点选到。升级 antd 版本时需要重新生成并重新核对。

export type SemanticPart = { key: string; descriptionZh: string; selector: string };
export type SemanticComponent = {
  available: boolean;
  note?: string;
  rootSelector: string;
  parts: SemanticPart[];
};

export const SEMANTIC_STRUCTURE: Record<string, SemanticComponent> = {
  "Button": {
    "available": true,
    "rootSelector": ".ant-btn",
    "parts": [
      {
        "key": "root",
        "descriptionZh": "根元素，包含边框样式、背景色、内边距、圆角、阴影效果、过渡动画、光标样式、文字权重、对齐方式等完整的按钮外观样式",
        "selector": ".ant-btn"
      },
      {
        "key": "icon",
        "descriptionZh": "图标元素，包含图标的字体大小、颜色继承、SVG 样式重置等图标显示相关样式",
        "selector": ".ant-btn-icon"
      },
      {
        "key": "content",
        "descriptionZh": "内容元素，包装按钮文本内容，控制文本的不换行显示、居中对齐、中文字符间距优化等文本排版样式",
        "selector": ".ant-btn > span:not([class*=\"ant-btn-\"])"
      }
    ]
  },
  "Input": {
    "available": true,
    "note": "CLI 未提供结构数据；依据 antd 6.5.0 公开 InputSemanticType 与实际 DOM。",
    "rootSelector": ".ant-input-affix-wrapper, .ant-input:not(.ant-input-affix-wrapper .ant-input)",
    "parts": [
      { "key": "root", "descriptionZh": "输入框整体", "selector": ".ant-input-affix-wrapper, .ant-input:not(.ant-input-affix-wrapper .ant-input)" },
      { "key": "input", "descriptionZh": "文本输入区域", "selector": "input.ant-input" },
      { "key": "prefix", "descriptionZh": "前缀内容", "selector": ".ant-input-prefix" },
      { "key": "suffix", "descriptionZh": "后缀内容", "selector": ".ant-input-suffix" },
      { "key": "clear", "descriptionZh": "清空按钮", "selector": ".ant-input-clear-icon:not(.ant-input-clear-icon-hidden)" },
      { "key": "count", "descriptionZh": "字数统计", "selector": ".ant-input-show-count-suffix" }
    ]
  },
  "Select": {
    "available": true,
    "note": "CLI 未提供结构数据；依据 antd 6.5.0 公开 SelectSemanticType 与实际 DOM。",
    "rootSelector": ".ant-select",
    "parts": [
      { "key": "root", "descriptionZh": "选择器整体", "selector": ".ant-select" },
      { "key": "prefix", "descriptionZh": "前缀内容", "selector": ".ant-select-prefix" },
      { "key": "suffix", "descriptionZh": "箭头与后缀内容", "selector": ".ant-select-suffix" },
      { "key": "input", "descriptionZh": "搜索输入区域", "selector": ".ant-select-input" },
      { "key": "placeholder", "descriptionZh": "占位文字", "selector": ".ant-select-placeholder" },
      { "key": "content", "descriptionZh": "选择内容区域", "selector": ".ant-select-content" },
      { "key": "item", "descriptionZh": "已选项目", "selector": ".ant-select-selection-item" },
      { "key": "itemContent", "descriptionZh": "已选项目内容", "selector": ".ant-select-selection-item-content" },
      { "key": "itemRemove", "descriptionZh": "已选项目移除按钮", "selector": ".ant-select-selection-item-remove" },
      { "key": "clear", "descriptionZh": "清空按钮", "selector": ".ant-select-clear" },
      { "key": "popup.root", "descriptionZh": "下拉面板", "selector": ".ant-select-dropdown" },
      { "key": "popup.list", "descriptionZh": "选项列表", "selector": ".ant-select-dropdown .rc-virtual-list" },
      { "key": "popup.listItem", "descriptionZh": "下拉选项", "selector": ".ant-select-item-option" }
    ]
  },
  "Tag": {
    "available": true,
    "rootSelector": ".ant-tag",
    "parts": [
      {
        "key": "root",
        "descriptionZh": "根元素，包含行内块布局、自动高度、内边距、字体大小、行高、禁止换行、背景色、边框、圆角、透明度、过渡动画、文本对齐、相对定位等标签的基础样式",
        "selector": ".ant-tag"
      },
      {
        "key": "icon",
        "descriptionZh": "图标元素，包含字体大小、颜色、光标样式、过渡动画等图标的显示样式",
        "selector": ".ant-tag > .anticon:not(.ant-tag-close-icon)"
      },
      {
        "key": "content",
        "descriptionZh": "内容元素，包含文本内容的颜色、字体样式等内容区域的样式",
        "selector": ".ant-tag > span"
      },
      {
        "key": "close",
        "descriptionZh": "关闭元素，包含关闭按钮的布局、光标样式、过渡动画等交互样式",
        "selector": ".ant-tag-close-icon"
      }
    ]
  },
  "Table": {
    "available": true,
    "rootSelector": ".ant-table-wrapper",
    "parts": [
      {
        "key": "root",
        "descriptionZh": "根元素，包含字体大小、背景色、圆角、滚动条颜色等表格容器的基础样式",
        "selector": ".ant-table-wrapper"
      },
      {
        "key": "title",
        "descriptionZh": "标题元素，包含表格标题的样式和布局",
        "selector": ".ant-table-title"
      },
      {
        "key": "content",
        "descriptionZh": "内容元素，包含表格内容区域的样式和布局",
        "selector": ".ant-table-content"
      },
      {
        "key": "header.wrapper",
        "descriptionZh": "头部容器元素，包含表头的布局和容器样式",
        "selector": ".ant-table-thead"
      },
      {
        "key": "header.row",
        "descriptionZh": "头部行元素，包含表头行的布局和样式",
        "selector": ".ant-table-thead > tr"
      },
      {
        "key": "header.cell",
        "descriptionZh": "头部单元格元素，包含相对定位、内边距、文字换行、背景色、文字颜色、字体权重等表头单元格样式",
        "selector": ".ant-table-thead .ant-table-cell"
      },
      {
        "key": "section",
        "descriptionZh": "容器元素，包含清除浮动、最大宽度、滚动条背景等表格包装容器样式",
        "selector": ".ant-table-container"
      },
      {
        "key": "body.wrapper",
        "descriptionZh": "主体容器元素，包含表格主体的布局和容器样式",
        "selector": ".ant-table-tbody"
      },
      {
        "key": "body.row",
        "descriptionZh": "主体行元素，包含数据行的悬浮效果、选中状态、展开状态等交互样式",
        "selector": ".ant-table-row"
      },
      {
        "key": "body.cell",
        "descriptionZh": "主体单元格元素，包含相对定位、内边距、文字换行等数据单元格的基础样式",
        "selector": ".ant-table-tbody .ant-table-cell"
      },
      {
        "key": "footer",
        "descriptionZh": "底部元素，包含表格底部的背景色、文字颜色等样式",
        "selector": ".ant-table-footer"
      },
      {
        "key": "pagination.root",
        "descriptionZh": "分页根元素，包含分页组件的基础样式和布局",
        "selector": ".ant-pagination"
      },
      {
        "key": "pagination.item",
        "descriptionZh": "分页单项元素，包含分页项的样式和交互效果",
        "selector": ".ant-pagination-item"
      }
    ]
  },
  "Alert": {
    "available": true,
    "rootSelector": ".ant-alert",
    "parts": [
      {
        "key": "root",
        "descriptionZh": "根元素，包含边框、背景色、内边距、圆角、位置布局等警告提示框的基础样式",
        "selector": ".ant-alert"
      },
      {
        "key": "icon",
        "descriptionZh": "图标元素，包含图标的颜色、行高、外边距等样式，支持不同类型的状态图标",
        "selector": ".ant-alert-icon"
      },
      {
        "key": "section",
        "descriptionZh": "内容元素，采用 flex 布局控制内容区域的排版和最小宽度",
        "selector": ".ant-alert-section"
      },
      {
        "key": "title",
        "descriptionZh": "标题元素，包含标题文字的颜色、字体等样式",
        "selector": ".ant-alert-title"
      },
      {
        "key": "description",
        "descriptionZh": "描述元素，包含描述文字的字体大小、行高等排版样式",
        "selector": ".ant-alert-description"
      },
      {
        "key": "actions",
        "descriptionZh": "操作组元素，包含操作按钮的布局和间距样式",
        "selector": ".ant-alert-actions"
      },
      {
        "key": "close",
        "descriptionZh": "关闭按钮元素，包含按钮的基础样式",
        "selector": ".ant-alert-close-icon"
      }
    ]
  },
  "Modal": {
    "available": true,
    "rootSelector": ".ant-modal-root",
    "parts": [
      {
        "key": "root",
        "descriptionZh": "根元素，包含相对定位、顶部位置、宽度、最大宽度、外边距、底部内边距等模态框容器的基础布局样式",
        "selector": ".ant-modal-root"
      },
      {
        "key": "mask",
        "descriptionZh": "遮罩层元素，包含固定定位、层级、背景色、动画过渡等遮罩层的样式",
        "selector": ".ant-modal-mask"
      },
      {
        "key": "container",
        "descriptionZh": "Modal 容器元素，包含相对定位、背景色、背景裁剪、边框、圆角、阴影、指针事件、内边距等模态框主体样式",
        "selector": ".ant-modal-container"
      },
      {
        "key": "wrapper",
        "descriptionZh": "包裹层元素，一般用于动画容器，包含动画和过渡效果的样式",
        "selector": ".ant-modal-wrap"
      },
      {
        "key": "header",
        "descriptionZh": "头部元素，包含头部内边距、下边框等头部区域样式",
        "selector": ".ant-modal-header"
      },
      {
        "key": "title",
        "descriptionZh": "标题元素，包含外边距、颜色、字体权重、字体大小、行高、文字换行等标题文字样式",
        "selector": ".ant-modal-title"
      },
      {
        "key": "body",
        "descriptionZh": "内容元素，包含内容区域的背景色、内边距等内容展示样式",
        "selector": ".ant-modal-body"
      },
      {
        "key": "footer",
        "descriptionZh": "底部元素，包含底部的背景色、内边距、上边框、圆角等底部区域样式",
        "selector": ".ant-modal-footer"
      },
      {
        "key": "close",
        "descriptionZh": "预览关闭按钮元素，设置按钮的基础样式",
        "selector": ".ant-modal-close"
      }
    ]
  },
  "Drawer": {
    "available": true,
    "rootSelector": ".ant-drawer",
    "parts": [
      {
        "key": "root",
        "descriptionZh": "根元素，包含固定定位、层级控制、指针事件、颜色等抽屉容器的基础样式和布局控制",
        "selector": ".ant-drawer"
      },
      {
        "key": "mask",
        "descriptionZh": "遮罩层元素，包含绝对定位、层级、背景色、指针事件等遮罩层的样式和交互控制",
        "selector": ".ant-drawer-mask"
      },
      {
        "key": "section",
        "descriptionZh": "Drawer 容器元素，包含flex布局、宽高、溢出控制、背景色、指针事件等抽屉主体的样式",
        "selector": ".ant-drawer-section"
      },
      {
        "key": "header",
        "descriptionZh": "头部元素，包含flex布局、对齐方式、内边距、字体大小、行高、下边框等头部区域的样式",
        "selector": ".ant-drawer-header"
      },
      {
        "key": "title",
        "descriptionZh": "标题元素，包含flex占比、外边距、字体权重、字体大小、行高等标题文字的样式",
        "selector": ".ant-drawer-title"
      },
      {
        "key": "extra",
        "descriptionZh": "额外元素，包含flex固定布局等额外操作内容的样式控制",
        "selector": ".ant-drawer-extra"
      },
      {
        "key": "body",
        "descriptionZh": "内容元素，包含flex占比、最小尺寸、内边距、溢出滚动等内容区域的展示和布局样式",
        "selector": ".ant-drawer-body"
      },
      {
        "key": "footer",
        "descriptionZh": "底部元素，包含flex收缩、内边距、上边框等底部操作区域的样式",
        "selector": ".ant-drawer-footer"
      },
      {
        "key": "dragger",
        "descriptionZh": "拖拽元素，用于调整抽屉大小的拖拽手柄，包含绝对定位、背景透明、指针事件控制、hover状态样式、拖拽状态样式等",
        "selector": ".ant-drawer-dragger"
      },
      {
        "key": "close",
        "descriptionZh": "关闭按钮元素，包含按钮的基础样式",
        "selector": ".ant-drawer-close"
      }
    ]
  },
  "Popconfirm": {
    "available": true,
    "rootSelector": ".ant-popconfirm",
    "parts": [
      {
        "key": "root",
        "descriptionZh": "根元素，设置绝对定位、层级、变换原点、箭头指向和弹层容器样式",
        "selector": ".ant-popconfirm"
      },
      {
        "key": "container",
        "descriptionZh": "容器元素，设置背景色、内边距、圆角、阴影、边框和内容展示样式",
        "selector": ".ant-popover-container"
      },
      {
        "key": "icon",
        "descriptionZh": "图标元素，设置确认图标的尺寸、颜色和布局样式",
        "selector": ".ant-popconfirm-message-icon"
      },
      {
        "key": "title",
        "descriptionZh": "标题元素，设置标题文本样式和间距",
        "selector": ".ant-popconfirm-title"
      },
      {
        "key": "content",
        "descriptionZh": "描述元素，设置描述文本样式和布局",
        "selector": ".ant-popconfirm-description"
      },
      {
        "key": "arrow",
        "descriptionZh": "箭头元素，设置宽高、位置、颜色和边框样式",
        "selector": ".ant-popover-arrow"
      }
    ]
  }
};
