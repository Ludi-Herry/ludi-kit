// 画布元素与图层的中文名（右栏「这是什么」、左栏图层树共用）。

export const COMPONENT_ZH: Record<string, string> = {
  Button: "按钮",
  Input: "输入框",
  "Input.Search": "搜索框",
  Select: "下拉选择",
  Tag: "标签",
  Table: "表格",
  Alert: "提示条",
  Modal: "对话框",
  Drawer: "抽屉",
  Popconfirm: "气泡确认",
  Form: "表单",
  "Form.Item": "表单项",
  DatePicker: "日期选择",
  "DatePicker.RangePicker": "日期范围选择",
  RangePicker: "日期范围选择",
  Segmented: "分段选择",
  Space: "间距容器",
  Checkbox: "复选框",
  "Checkbox.Group": "复选框组",
  Radio: "单选",
  "Radio.Group": "单选组",
  Switch: "开关",
  Tooltip: "文字提示",
  Popover: "气泡卡片",
  Skeleton: "骨架屏",
  Badge: "徽标",
  Menu: "菜单",
  Layout: "布局",
  Card: "卡片",
  Tabs: "标签页",
  Pagination: "分页",
  Empty: "空状态",
  Statistic: "数值统计",
  Divider: "分割线",
  Breadcrumb: "面包屑",
  Result: "结果页",
  Spin: "加载中",
  Dropdown: "下拉菜单",
  Descriptions: "描述列表",
  Steps: "步骤条",
  Progress: "进度条",
  Upload: "上传",
  Typography: "文字",
  "Typography.Text": "文字",
  "Typography.Link": "链接",
  "Typography.Title": "标题",
  Row: "栅格行",
  Col: "栅格列",
  Flex: "弹性容器",
  "Layout.Header": "布局 / 页头",
  "Layout.Content": "布局 / 内容区",
  "Layout.Sider": "布局 / 侧栏",
  "Layout.Footer": "布局 / 页脚",
  Link: "链接",
  Title: "标题",
  Text: "文字",
  Paragraph: "段落",
  App: "应用",
  ConfigProvider: "主题容器"
};

export const TAG_ZH: Record<string, string> = {
  div: "容器",
  section: "容器",
  header: "页头",
  footer: "页脚",
  main: "主体",
  nav: "导航",
  aside: "侧栏",
  span: "文字",
  p: "段落",
  h1: "标题",
  h2: "标题",
  h3: "标题",
  h4: "标题",
  a: "链接",
  button: "按钮",
  strong: "强调文字",
  em: "强调文字",
  ul: "列表",
  ol: "列表",
  li: "列表项",
  label: "标签文字",
  input: "输入框",
  img: "图片",
  form: "表单",
  table: "表格",
  i: "图标",
  svg: "图标"
};

// 中文名：antd 组件与原生标签都给中文；没有语义的 div / section 叫「容器」；查不到的 antd 组件叫「组件」。英文标识留给 title 悬停提示。
export function baseZhName(comp: string, tag?: string): string {
  const native = /^[a-z]/.test(comp);
  return COMPONENT_ZH[comp] ?? (native ? TAG_ZH[comp] : undefined) ?? (tag ? TAG_ZH[tag] : undefined) ?? (native ? "元素" : "组件");
}

export function elementZhName(comp: string, tag: string | undefined, text: string | undefined): string {
  const base = baseZhName(comp, tag);
  return text ? `${base} · ${text}` : base;
}

