# 天枢结构合同（structure.tables.json）格式

控件规格回答「一个按钮长什么样」，结构合同回答「页面怎么摆」。第一版管表格、分页与筛选区栅格：有哪些列、什么顺序、多宽、固定在哪一侧、怎么对齐、多宽的屏幕才显示。各底座照合同摆表格，不再各自手写列宽。

初稿数值取自 antd 天枢现版的列定义（`generated/*Page.tsx` 里的 `columns`），Owner 2026-10-13 已签字，现在是权威。antd 页面目前仍不读这份合同（原因见 `docs/PLAN-四底座第4阶段-共用核心与结构合同-2026-10-11.md`），校验脚本每次拿 antd 实测比对合同，防止两边漂移。

## 结构

```jsonc
{
  "version": "0.1.0",
  "status": "signed",
  "signoff": { "date": "2026-10-13", "by": "Owner", "ref": "docs/PLAN-四底座第5阶段-转正与收口-2026-10-13.md" },  // 签字前为 draft-pending-owner-signoff；签字后改数值要走裁决
  "referenceViewport": { "width": 1440, "height": 900 },
  "breakpoints": { "xl": 1200 },
  "tables": {
    "<路由 id，与 routes.tianshu.json 一致>": {
      "source": "antd 列定义所在文件",
      "selection": true,            // 首列是否为多选框列
      "selectionWidth": 48,         // 多选框列宽；有左侧固定列时它也固定在最左
      "pagination": { "totalPlacement": "beforeItems" },  // 分页：「共 N 条」紧挨页码左侧，与页码一起靠右
      "columns": [
        {
          "header": "SN",             // 表头文字，与页面一致
          "key": "sn",                // 列标识，取 antd 列定义的 key / dataIndex
          "width": 156,               // 声明宽度（px）；不写表示按内容撑开
          "fixed": "left",            // 固定列：left / right；不写表示不固定
          "align": "right",           // 对齐：left（默认，可不写）/ center / right
          "responsive": "xl",         // 只在该断点及以上显示；不写表示始终显示
          "defaultHidden": true       // 默认隐藏（可在「列设置」里打开）；校验列顺序时跳过
        }
      ]
    }
  }
}
```

一条路由只记录参考视口下首屏可见的那张表。同一页有多张表（如固件页的版本列表与推送任务）时，先记首屏那张，其余写进 `note`，后续扩展。

## 筛选区栅格

```jsonc
"filters": {
  "<路由 id>": { "region": "筛选", "columns": 5, "gap": 16 }   // 区块 aria-label、每行列数、列间距（px）
  // 可选："template": "180px 140px minmax(0, 320px)" 固定轨道，或 "repeat(auto-fit, minmax(200px, 1fr))" 自动排列（与 columns 二选一）；
  //       "below": { "xl": 3 } 视口 ≤ 断点时的列数；"moreColumns": 3 「更多筛选」展开区的列数，不写时与常驻行同一栅格
}
```

区块内容宽 = 区块宽 − 左右留白；每列宽 = (内容宽 − 列间距 × (列数 − 1)) / 列数。筛选项按列对齐，项数少于列数时右侧留空，不拉伸。读取层 `core/structure.ts` 的 `filterGrid(路由, 视口宽)` 按合同给出容器样式（含窄屏回落与「更多筛选」区）。

`below` 的判定与 antd 页面的 `@media (max-width: N)` 一致：视口 ≤ 断点就回落，正好 1200 宽时也回落。表格列的 `responsive` 是另一套口径（antd Table 断点，视口 ≥ 断点才显示），两者共用 `breakpoints` 的数值。

校验只看参考视口：等宽列校验宽度与起点；自动排列先按参考视口换算出列数，再按等宽列校验；固定轨道只校验写成 px 的轨道宽度。

## 行内标签筛选区（filterInline）

标签在左、输入框在右的检索行（如用户与绑定页）不走栅格，用 `filterInline` 描述：

```jsonc
"filterInline": {
  "<路由 id>": {
    "region": "检索表单",      // 区块 aria-label，同 filters
    "gap": 16,                 // 相邻字段的间距（px）
    "fields": [
      { "label": "手机号", "probe": "ph:请输入11位手机号", "labelWidth": 55 }  // 数组顺序即字段从左到右的顺序；label 写 label: 测点的文字（by=text，空白已去），probe 写输入框测点 id；labelWidth 记标签实测宽（antd 标签是内容自适应宽，只作护栏）
    ],
    "button": { "text": "查询", "gap": 16 }  // 行尾提交按钮的测点文字，与末字段的间距
  }
}
```

校验只看参考视口：标签与输入框同行（y 相差 ≤1px）、标签右缘紧贴输入框左缘（间距 ±1px）、标签宽与 `labelWidth` 相差 ≤1px、字段从左到右按数组顺序、相邻字段与末字段到按钮的间距等于 `gap`（各 ±1px）。输入框宽度不在这里记，仍由 `filters` 的 `template` 轨道护栏负责；窄屏回落（`below`）同样看 `filters`。字段顺序不对时直接报「字段顺序」，不再比间距。该格式 2026-10-13 先试运行，同日抓到 Element Plus 查询按钮间距 14 的真实失败（Owner 定为要修）后转正：不一致计入错误，`--self-check` 含间距与字段顺序两个负例。

## 校验

```bash
node scripts/check-structure-contract.mjs --probe <探针输出目录> [--foundation antd|shadcn]
```

读探针报告逐路由比对以下四项，退出码 0 通过，1 有不一致，2 输入错误：
- **列顺序**：页面表头（`struct.columnheaders`）等于合同列顺序。多选框列记为空表头；默认隐藏的列跳过。
- **列宽**：写了 `width` 的列，`th:<表头>` 测点的可见宽度与合同相差不超过 1px。
- **对齐**：表头单元格的对齐方式（`layout.align`）等于合同。
- **固定列**：表头单元格是否 `position: sticky`（`layout.sticky`）与合同一致。
- **筛选区栅格**：区块内第一行的输入框与下拉框，宽度等于列宽、起点落在列上（各 ±1px）。
- **行内标签筛选区**：字段顺序、标签在左同行紧贴输入框、标签宽、字段间距、按钮与末字段的间距。
- **分页布局**：`totalPlacement: beforeItems` 时，`pager:total` 与 `pager:prev` 的间距在 0–16px。

探针只给每页前 12 个表头建测点，超出部分只校验列顺序，并以警告列出。

## 能力边界

合同只管表格、分页和检索区这类列表骨架。详情区内部的排布（比如告警详情元信息的行距、描述列表的标签宽）不进合同，也不再扩格式（第 5 阶段 5.4 定，2026-10-13）：这类排布由各底座的描述列表组件自带，三端差异由探针 diffs 登记、逐条裁决。
