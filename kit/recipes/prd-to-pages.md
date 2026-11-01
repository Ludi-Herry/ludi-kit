# PRD 转页面

把需求转换成可验证的项目合同，再进入页面生成。

## 需求对齐五问

1. 谁使用产品，最常见的任务是什么。
2. 核心业务对象、状态和状态变化是什么。
3. 页面范围是什么，页面之间怎样跳转。
4. 桌面端与移动端分别承担什么任务。
5. 当前目标是原型、工程基线还是已有项目改造。

先列出角色、业务对象、页面和跨页流程，再标出缺失、冲突或会改变架构的决定。只追问会改变页面范围、状态模型或交付边界的问题；其他低影响空缺使用明确假设推进。

包含图表、流程 / 关系图、多选或外部设计 Skill 时，补问 [business brief 的条件设计问题](../docs/real-business-brief.template.md#9-conditional-design-questions)，将答案写回既有合同支持的位置；已确定的事实不重复问。

状态枚举、权限矩阵或空态行为缺失时，暂停并向人确认。

## Business context gate

生成前验证 `business-context.json`，重点检查 `contextType` 与 `frontendFoundation`。

- `validation-sandbox`：只用于生成链路和规则回归。
- `real-product`：可以形成页面范围、业务组件和前端底座决策。

首次写文件前冻结 output mode、framework、准确包版本、分发、design pack SHA、图标、theme/reset/import 和四类 adapters。真实 brief 未完成时，暂停新增泛化页面和组件。

## 生成知识清单

生成页面前可选：按 [页面设计规格](./design-spec.md) 把已有 `flowCard`、`intentCard`、`layoutTree` 与业务合同整理为六节规格；缺失标“待补”，不增加需求或实现授权。

`library-native + antd` 项目写页面代码前冻结 `generation-knowledge.json`：

- 走生成器（project-description 带 `content`）时，由生成器一并产出。
- 按页面卡直接编码时，先在项目根写 `generation-plan.json`，逐页列出计划使用的 antd 组件，再运行 `npm run knowledge:plan -- --project <projectId>`。知识包缺少某个组件的冻结参考时命令失败，先扩展知识包，不凭默认经验使用。
- 实现中新增组件，先改 `generation-plan.json` 并重跑命令，再写代码。`npm run check:knowledge-coverage` 核对源码导入与清单一致（试运行，只报告）。

## 页面合同

从 PRD 提取：

- 用户角色和权限。
- 核心任务与跨页流程。
- 数据实体和稳定对象身份。
- 状态流转、异常和恢复。
- 高频操作和危险操作。

每个页面的 `intentCard` 至少回答：

| 项 | 内容 |
| --- | --- |
| 目标 | 用户来这里完成什么 |
| 入口 | 从哪里进入 |
| 输出 | 完成后状态怎样变化 |
| 组件 | 使用哪些选定底座组件和业务组合 |

需要追溯时，使用 schema 当前支持的 `prdAnchor`、`referenceImplementations` 和 `antiPatterns`。字段定义由项目 schema 维护。

## 连续示例数据

使用 `sample-pack.json` 的项目遵守：

- `business-context.json.samplePack` 指向项目内 sample pack。
- 演示对象的 `type/id` 在项目内稳定且唯一。
- `pages.json.dataRequirements` 只引用已登记实体。
- 页面从生成的 sample-data 入口读取对象，避免逐页复制同一实体。
- 时间使用带时区 ISO 8601；金额和数量记录币种或单位。

## 流程验收

先验证 sample pack，再为最高价值流程建立 `flow-acceptance.json`。

- 编译器生成的 `draft` 只用于补充合同。
- 人工补齐动作、稳定对象、预期路由、状态、断言来源和副作用后，才能改为 `approved`。
- 首条流程至少覆盖两页、一个稳定对象、一次可观察变化，以及结果目的地或恢复路径。
- Playwright 断言映射到 `flows.json.successCriteria` 或页面 `prdAnchor`。
- 只检查 URL、标题或按钮存在不能证明业务流程通过。
- 流程变化先跑对应 spec，再跑项目要求的验证。
