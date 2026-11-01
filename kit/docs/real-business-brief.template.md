# Real business brief template

Copy this file into the target project as `business-brief.md`. Complete the brief before creating or changing `business-context.json`.

## 1. Product

- Product name:
- One-sentence purpose:
- Business scenario:
- Current stage: experiment / MVP / internal tool / commercial product
- First release success criteria:

## 2. Users and permissions

| Role | Frequent goal | Permission boundary | Risk |
| --- | --- | --- | --- |
|  |  |  |  |

## 3. Core workflows

| Workflow | Entry | Key pages | Observable success |
| --- | --- | --- | --- |
|  |  |  |  |

## 4. First page set

| Page | User goal | Information density | Interaction complexity | Key states |
| --- | --- | --- | --- | --- |
|  |  | low / medium / high | low / medium / high |  |

## 5. Data and states

| Entity | Key fields | State transitions | Exceptions and recovery |
| --- | --- | --- | --- |
|  |  |  |  |

## 6. Business component candidates

| Component | Repeated use case | Source workflow | Existing composition tried | Why a new component may be needed |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## 7. Frontend foundation

- Output mode: `kit-consumer` / `library-native` / `custom-native`
- Framework and exact version:
- Foundation and exact version or content identity:
- Distribution model:
- Runtime and icon packages:
- Design pack source and hash:
- Theme entry and CSS reset:
- Allowed import roots:
- License and source:
- Lint adapter:
- Build adapter:
- Browser adapter:
- Visual adapter:
- Selection reason:
- Main risk:

## 8. First acceptance slice

- Primary deliverable and how the user opens it:
- One key workflow:
- One exception or recovery path:
- Required viewports:
- Accessibility requirements:
- Performance or bundle limits:
- Evidence owner and storage path:

## 9. Conditional design questions

只填写本批页面命中的项目；没有该类任务时记不适用。答案写回现有业务合同、页面卡、流程或规格中 schema 已支持的位置，不新增平行合同。

| 场景 | 需要确定的事实 |
| --- | --- |
| 图表 / 看板 | 用户要作什么判断；指标、单位、聚合、来源、时间 / 时区、刷新；联动、下钻、返回与导出范围；0、缺失与失败怎样区分 |
| 流程 / 关系图 | 图的语义；角色 / 对象、真实端点、方向、分支条件、异常；折叠后保留什么；移动端任务与跨组关系怎样可达 |
| 多条件 / 时间 / 多选 | 生效时机、默认范围、最大跨度、全选范围、新对象入选规则；长标签与完整名单入口 |
| 输入与浮层 | 必填与格式、默认值来源、保存时机、未保存退出、失败恢复、焦点与返回位置 |
| 已声明的移动任务 | 平台与真实运行环境、安全区、键盘弹出后的可见区域、关键操作可达、返回 / 关闭与滚动归属；原生与 Web 的触控尺寸口径 |
| 外部设计 / 绘图 Skill | 交付物、主 Skill 与命中 reference；其来源版本、所需工具、允许写入；与 design pack 的冲突及处理 |

对应阅读：[图表](../rules/data-visualization.md)、[流程与关系图](../rules/flow-diagram.md)、[Skill 路由](./design-skill-routing.md)。案例数字和 Skill 默认值仅作候选，项目阈值需要自身依据。

## Ready to generate

Generation can start when roles, states, permissions, page scope, one observable workflow and `frontendFoundation` are complete. Missing decisions that change scope or state behavior must be resolved first.
