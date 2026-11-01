# 天枢控件规格（controls.spec.json）格式

中立 token（`tokens.neutral.json`）只回答「数值是多少」，控件规格回答「每种控件怎么用这些数值」：多高、内边距多少、描边画在哪、底色用哪个角色。剪藏里说的「从第二步到第三步差的那一层」就在这里。

规格与组件库无关。每个底座的套件读这份规格，翻译成该库的写法：antd 写进组件 token，shadcn 写进 `components/ui` 的类名或 CSS 变量，Element Plus 写进 CSS 变量。页面代码不直接写这些数值。

## 结构

```jsonc
{
  "version": "0.1.0",
  "status": "signed",
  "signoff": { "date": "2026-10-13", "by": "Owner", "ref": "docs/PLAN-四底座第5阶段-转正与收口-2026-10-13.md" },  // 签字前为 draft-pending-owner-signoff；签字后改数值要走裁决
  "tokens": "tokens.neutral.json",
  "controls": {
    "<控件 id>": {
      "purpose": "这个控件在天枢里用在哪",
      "parts": {
        "<部位或变体 id>": {
          "props": { "<属性>": <值>, ... },
          "states": { "hover": { ... }, "disabled": { ... } },   // 可选，首屏探针不量
          "baselineAnchors": [ { "route": "devices", "anchor": "btn:查询" } ],
          "unmeasured": "没有基准测点时写原因，校验只警告不失败"
        }
      }
    }
  }
}
```

### 属性词表（与探针测量项一一对应）

| 属性 | 含义 | 探针取值 |
| --- | --- | --- |
| `height` / `width` | 可见外框的高 / 宽（px） | `box.h` / `box.w` |
| `paddingX` / `paddingY` | 左 / 上内边距（px） | `paddingLeft` / `paddingTop` |
| `radius` | 圆角（px） | `borderTopLeftRadius` |
| `borderWidth` / `borderColor` | 上描边宽与色；无描边写 `"none"` | `borderTopWidth` / `borderTopColor` |
| `borderBottomWidth` / `borderBottomColor` | 下描边（表格分隔线用） | `borderBottomWidth` / `borderBottomColor` |
| `background` | 底色 | `backgroundColor` |
| `shadow` | 阴影；无写 `"none"` | `boxShadow` |
| `textColor` / `fontSize` / `fontWeight` / `lineHeight` | 文字 | `text.*` |
| `insetX` / `insetY` | 第一段文字距可见外框左 / 上边的距离（px）。内边距写在内层元素上的控件（如 antd 分段项）用它表达留白，此时不写 `paddingX` | `textInset.x` / `textInset.y` |
| `paddingRight` / `paddingBottom` | 右 / 下内边距（px），左右或上下不对称时写（如列表区上 12、下 16） | `paddingRight` / `paddingBottom` |
| `gapX` | 与同组下一项的水平间距（px），用于页签、分段项、单选项；同组最后一项量不到，测点选前面的项 | `gapToNext` |
| `gapY` | 与下一项的纵向间距（px），如页头整列、表单项之间 | 不测，只能写在无测点（`unmeasured`）的部位 |

无测点部位里的 `gapX` / `gapY` / `insetX` / `insetY` 指向哪两个元素，以该部位 `unmeasured` 说明为准，例如 `formField.colonSlot`（冒号占位左距 2、右距 8）、`steps.item`（两步之间 12、圆点到标题 8）、`table.sortIcon`（与标题间距 4）、`input.rangeSuffix`（日历图标与结束日期间距 4）。

**区块写法**：区块（`panel.*`）同时写实现用的内边距（`paddingX` / `paddingY` / `paddingRight` / `paddingBottom`）与用户看到的留白（`insetX` / `insetY`）。套件只读内边距变量，把它写在带边框的区块元素本身上，不做加减换算；留白只用来验收。

`width` 只在控件宽度固定时写（如复选框 16）；按钮、输入框的宽度由内容或布局决定，不写。

### 值的写法

- 数字：像素（`fontWeight` 除外，是字重数值）。
- `"token:<路径>"`：引用中立 token，例如 `"token:color.brand.base"`、`"token:radius.base"`。**颜色、圆角、字号、字重能用 token 就用 token**，规格里不出现新色值。
- `"transparent"`：透明底或透明描边。
- `"none"`：无描边、无阴影。
- 只有 token 里确实没有、又是控件专属的数值，才写死像素，例如按钮高 34、表头上下内边距 16。

### 基准测点

`baselineAnchors` 列出 antd 现版里属于这个部位的测点（取自最新一次探针报告 `<输出目录>/<路由>/parity-report.json` 的 `anchors[].id`，第 3 阶段第二轮起是 `kit/workflows/evidence/foundation-parity-2026-10-10/phase3-round2/routes/`）。

#### 测点类型

探针在 antd 上按语义自动发现测点，只用角色、文字、占位符和表头名定位，不依赖组件库类名：

| 前缀 | 量的是什么 | 文字样式取自 |
| --- | --- | --- |
| `h1` | 页面主标题 | 标题本身 |
| `btn:<文字>` | 按钮、链接、分栏（`state.role` 为 `tab` 的是状态分栏）的可见外框 | 按钮文字 |
| `choice:<文字>` | 分段控制器或单选组的每一项，只量选项本身（未选中项不会量成外层轨道） | 选项文字 |
| `radio:<标签>` | 单选项的小圆圈 | 标签文字 |
| `select:<框内文字>` | 下拉选择框的可见外框 | 占位或已选值 |
| `ph:<占位>` | 输入框的可见外框 | 输入框 |
| `th:<列名>` / `cell:<列名>` | 表头单元格 / 首行单元格 | 单元格文字 |
| `tag:<列名>` | 首行单元格里的标签 | 标签文字 |
| `desc:<标签>` / `descval:<标签>` | 详情描述列表的标签 / 值（横排取右侧单元格，竖排取下一行同一列） | 标签 / 值文字 |
| `cb:<序号>` | 复选框 | — |
| `label:<文字>` / `title:<文字>` | 表单标签 / 字重 ≥ 600 的区块或卡片标题 | 文字本身 |
| `pager:total` / `pager:prev` / `pager:<页码>` / `pager:next` | 分页总数（「共 N 条」且同一行有页码）/ 上一页 / 页码 / 下一页 | 文字或图标 |
| `count:list` | 工具栏里的列表计数，如「共 11 台设备」「共 6 条」；不是分页总数 | 文字本身 |

每个测点还记录 `state`：`role`、`selected`（是否选中，取 ARIA 或单选框的勾选状态）、`disabled`。规格用它区分同一控件的选中项与未选中项；`state` 不参与两端差异比对。校验脚本逐个比对：规格里的每个属性，必须等于这些测点在 antd 上的实测值。同一部位列多个测点，可以发现 antd 自己在不同页面上的不一致，这类情况上报，不要自行挑一个。

## 校验

```bash
node scripts/check-control-spec.mjs
```

检查结构与属性词表、token 引用能否解析，以及规格值与 antd 基准测点逐项一致（几何容差 1px，颜色与字重完全一致）。退出码 0 表示通过，1 表示有不一致，2 表示输入错误。

## 图标库（2026-10-18 起）

天枢两端套件页面统一用 antd 同源图标：shadcn 用 `@ant-design/icons@6.3.2`，Element Plus 用 `@ant-design/icons-vue@7.0.1`，图标画法与 antd 基准一致（ANALYSIS §5 第 1 问 Owner 已签）。

这是天枢项目的取舍，`foundations/catalog.json` 与通用 design pack（`shadcn-4.13.1-components-v2.json`、`element-plus-2.14.3-components-v2.json`）里的默认图标库仍是 `lucide-react` / `@element-plus/icons-vue`：catalog 图标锁定由 `validate-foundations` 校验，并作用于所有选这两个底座的项目，改动要单独裁决。Lab 两端源码已不再引用默认图标库，package.json 里的依赖暂留。
