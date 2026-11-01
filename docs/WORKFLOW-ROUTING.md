# 工作流路由

这份文档只回答一个问题：当前输入应该走哪条工作链路。工作流状态、启动命令和阻塞恢复信息从 [`kit/workflows.manifest.json`](../kit/workflows.manifest.json) 读取；最终交付方式见 [`WORKFLOW-DELIVERABLES.md`](./WORKFLOW-DELIVERABLES.md)。

## 路由决策树

```text
输入是什么？
├─ 文字需求
│  ├─ 新页面、新模块或新项目 ───────────── 链路 1
│  └─ 已有项目的修改、反馈或缺陷 ───────── 链路 8
├─ 参考图、竞品截图或视觉方向
│  ├─ 已有设计规范或组件底座 ───────────── 链路 3
│  └─ 需要探索新方向 ───────────────────── 链路 2
├─ Figma 资产
│  ├─ 组件库生成页面 ───────────────────── 链路 3
│  ├─ 设计规范转代码底座 ───────────────── 链路 4
│  ├─ 移动端页面还原 ───────────────────── 链路 7
│  ├─ 数据大屏或态势大屏 ───────────────── 链路 6
│  └─ 设计稿与实现走查 ─────────────────── 链路 9
├─ 没有既有资产，需要从零建立系统 ───────── 链路 5
└─ kit 打包、安装或跨项目消费 ───────────── 链路 10
```

输入同时命中多条链路时，以主交付物决定主链：

- 最终要交可运行业务页面：链路 1、2、3、7 或 8。
- 最终要交组件底座或设计系统：链路 4 或 5。
- 最终要交交互式大屏：链路 6。
- 最终要交审计结论：链路 9。
- 最终要交可安装 package：链路 10。

## 路由总览

| 链路 | 适用输入 | 对应机器 workflow 或入口 |
| --- | --- | --- |
| 1. PRD → 可运行项目 | PRD、business brief、明确业务需求 | `requirement-to-final-page` |
| 2. 参考图或无稿探索 → 新页面 | 需要新视觉方向，且用户明确选择 exploratory | `image2-to-figma-page` 的 exploratory 路由 |
| 3. 已有规范 → 规范内新页面 | Design.md、Token、组件索引或 Figma Library | `existing-figma-library-to-page`；本地规范走 existing direct |
| 4. Figma 规范 → 代码底座 | Figma variables、styles、components、variants | `figma-spec-to-code-foundation` |
| 5. 0 → 1 设计系统 | 无现成设计资产，已有冻结 design brief | `design-system-zero-to-one` |
| 6. 数据大屏或态势大屏 | 数据、刷新、聚合、性能目标、可选大屏稿 | `figma-3d-situation-screen` |
| 7. Figma 移动端页面还原 | 移动端节点、切图、页面跳转 | 当前作为 existing 路由的移动端变体 |
| 8. 已有项目迭代与反馈回流 | 用户反馈、业务变更、QA finding | feedback queue 与 promotion 工作链 |
| 9. AI 设计走查 | 设计稿与实现截图 | visual-diff 工作链 |
| 10. Kit 发布与跨项目消费 | package、安装、公共导入和消费验证 | pack、installed-package 与 bundle 工作链 |

## 链路 1：PRD → 可运行项目

适用：输入已经说明业务目标、用户、关键流程或页面需求。

开始前：

1. 用 [real business brief 模板](../kit/docs/real-business-brief.template.md) 补齐用户、权限、状态、流程和第一批页面。
2. 创建或更新 `business-context.json`，冻结 `frontendFoundation`。
3. 按 [PRD To Pages](../kit/recipes/prd-to-pages.md) 生成项目合同。

页面按 Layout → Module → Details 推进。每个阶段都从项目合同、目标 design pack、规则和对口 recipe 读取约束。缺少状态枚举、权限矩阵、关键异常或完成标准时暂停生成并补输入。

主交付是可运行项目与稳定路由。可选的 AntD → Figma 校准支路使用 `prd-antd-to-figma-calibrated-page`，不改变 Web 页面先完成验收的顺序。

## 链路 2：参考图或无稿探索 → 新页面

适用：目标需要新的构图、氛围、材质、品牌表达或视觉方向，并且用户选择 `exploratory`。

流程入口是 [image2-to-figma-page Skill](../kit/skills/image2-to-figma-page/SKILL.md)。先冻结产品目标、受众、主任务和视觉 brief，再生成参考方向并由用户选择。选定方向进入可运行页面重建，技术结果、raw diff、Reviewer 结论和用户验收分别记账。

通用 B 端页面默认不走这条链。当前 Image2 执行资格和输入锁以 [项目状态](./PROJECT-STATUS.md#image2) 及机器策略记录为准。

## 链路 3：已有规范 → 规范内新页面

适用：项目已有 Design.md、Token、组件清单、组件库或真实 Figma Library。

- 本地规范：冻结 Design.md、Token、component index 和 design pack 哈希，走 existing direct。
- Figma Library：只读回 variables、variants、组件身份和使用语义，再用 `existing-figma-library-to-page` 生成页面。

页面保持既有视觉语言和组件语义。典型页面只能提供使用语义候选；设计师确认后才进入 design pack。Figma key、node ID 和快照维护规则见 [Figma 资产共创与维护约定](./Figma资产共创与维护约定.md)。

## 链路 4：Figma 规范 → 代码底座与复合组件装配

适用：主交付是可安装的代码底座、Token、组件映射以及业务复合组件装配。

读取 Figma variables、styles、component sets 与 variants，产出 tokens、component index、theme mapping 和只读同步合同。代码装配与映射检索入口为全局 Skill [`figma-arco-component-assembler`](~/.agents/skills/figma-arco-component-assembler/SKILL.md)（含 `search-component-map.mjs` 检索脚本），按页面类型选型并弹性适配项目实现。

主交付包含 package 和可浏览组件目录。新消费方能够安装、具名导入并完成构建后，交付才闭合。

## 链路 5：0 → 1 设计系统与规范画布

适用：没有可复用设计资产，已经冻结产品方向和 design brief。

按颜色、字体、圆角与间距、效果、基础原子组件、复合组件和页面壳层逐步建立系统。Figma 内基础原子组件搭建、规范画布与使用文档统一使用全局 Skill [`figma-component-builder`](~/.agents/skills/figma-component-builder/SKILL.md)（绑定项目图标 catalog、强制 Auto Layout、Figma 只读抽取防脏）。教程入口位于 [文档中心](./README.md#教程与学习材料)。

产出至少包含 Design.md、Token、component index、页面壳层和可浏览规范页。

## 链路 6：数据大屏或态势大屏

适用：输入包含数据来源、刷新方式、聚合规则、异常状态、目标 viewport 和性能目标。

- **主选（方案 A · 免切图高保真原型）**：统一入口为全局 Skill [`sa-situation-screen`](~/.agents/skills/sa-situation-screen/SKILL.md)。从 Figma 逐节点提取真实 Token，纯代码单文件 HTML 原型（CSS Grid + ECharts 分层渲染 + 1920/1366/1024 三档响应式与容器查询，严禁整屏 scale 缩放），通过帧率探针与阴影审计后验收。
- **3D WebGL 专属**：涉及复杂三维地球、模型下钻时，走 [Figma 3D Situation Screen Skill](../kit/skills/figma-3d-situation-screen/SKILL.md)。
- **切图交接兜底**：当团队明确需要导出静态切图资产包时，走全局 Skill [`dashboard-cutout-prep`](~/.agents/skills/dashboard-cutout-prep/SKILL.md) 准备切图 Frame 与自检表。

主交付是可全屏运行的大屏原型与经过性能/阴影审计的验收证据。

## 链路 7：Figma 移动端页面还原

适用：输入是移动端 Figma 节点和页面流程。

当前走链路 3 的移动端变体，操作说明见 [移动端页面还原](./05_移动端页面还原.md)。页面按移动任务重新组织，并验证触控、safe area、手势、跳转和横向溢出。

当真实需求证明移动端需要独立机器合同时，再评审是否扩充 canonical workflow 集合。

## 链路 8：已有项目迭代与反馈回流

适用：修改现有页面，处理业务变更、用户反馈或 QA finding。

先将 finding 归类到需求、页面意图、流程、样例数据、规则、组件、Token 或实现。promotion 工具只生成草案和应用计划；源码修改保持人工审阅。修改生成产物时，同批更新权威输入并重新验证关键流程。

主交付是更新后的同一产品路由或 release build。feedback record、diff 和回归结果属于支持证据。

## 链路 9：AI 设计走查

适用：需要比较设计稿与开发实现。

入口是 [AI 辅助设计走查](./12_AI_辅助设计走查.md) 和 [visual diff runner](../kit/visual-diff/README.md)。每个 finding 应包含严重度、页面、位置、证据、建议和处理状态。

主交付是可浏览的问题清单或差异报告。截图和 heatmap 服务于定位，不能代替问题结论。

## 链路 10：Kit 发布与跨项目消费

适用：验证 package、公共导入、安装或跨目录运行。

流程包含 build、确定性 pack、隔离安装、公共 API 导入、runner/generator cross-cwd 和 bundle 检查。具体命令从 [`kit/package.json`](../kit/package.json) 读取。

主交付是可安装 package、安装命令和最小消费示例。哈希、文件清单、bundle 与 smoke 结果作为支持证据。

## 共用规则

- 每条链路开始前读取对应 workflow 的 `completion` 和 `handoff`。
- 页面生成前必须存在 schema-valid 的 `frontendFoundation`。
- 技术与视觉结果分开记录；失败 verdict 原样保留。
- 需要外部输入时，交付当前已有材料、缺失字段、权限范围和恢复步骤。
- 新规则只在真实案例命中缺口后增加，避免为未发生的场景预铺合同。
