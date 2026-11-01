# 设计 Skill 路由与边界

按交付物选择一个主 Skill，再读取命中的参考文件。普通页面生成依靠本包规则即可；不以“本机安装过”为全量加载理由，也不把 Skill 的存在当作已实测可用。

## 权威与使用顺序

1. 读取业务合同、页面意图、流程与当前 design pack。
2. 读取受影响的 Kit rules / recipe。
3. 确认是否需要下表中的专项方法，再读取本机对应 `SKILL.md`。
4. 核对当前工具、允许写入、来源、版本、许可证与外部访问，再执行授权内动作。
5. 使用项目已有 technical / browser / visual adapters 及人工验收，记录真实执行结果。

Skill 提供方法；业务事实来自合同，组件与 Token 来自当前底座。它的默认框架、字体、配色、CDN、目录、初始化、hook、安装和发布步骤都不自动成为 Kit 要求。已有设计方向按局部迭代处理，不因 Skill 的审美倾向重设主题。

本机入口默认位于 `~/.agents/skills/<名称>/SKILL.md`；宿主可能提供插件入口，以实际工具与 Skill catalog 为准。跨机器没有对应 Skill 时继续使用 Kit 已归纳规则；若专项交付确实依赖缺失能力，说明缺口。

## 按交付物路由

| 交付物 / 任务 | 主入口与可复用内容 | 使用边界 |
| --- | --- | --- |
| 既有产品 UI 的审查、层级与局部打磨 | `impeccable`：Operate / Read 模式、按任务加载 playbook、真实渲染后集中修复 | 保留现有视觉与产品事实；先检查下面的读写边界 |
| 营销页、作品集的新视觉方向 | `design-taste-frontend`：明确方向、图像与排版、浏览器复核 | 仅命中该任务时用；品牌、字体、素材来源与范围仍由项目确定；普通后台不默认加入装饰性重设计 |
| 独立 HTML / React 作品或演示 | `web-design-engineer`：独立原型的结构和呈现方法 | 原型转入 Kit 时重核导入、组件与 Token，不能把演示依赖直接带入消费包 |
| 流程、泳道、状态、架构和关系图；静态分层或爆炸图 | `diagram-design`：节点与边的语义、减交叉、标签、可编辑 HTML / SVG 与导出 | 先读 [flow-diagram.md](../rules/flow-diagram.md)；用现有项目样式映射其 style guide；普通关系图不升级成机械作品 |
| 通过实体机械解释机制，需慢放、分解和联动读数 | `anatomy`：事实模型、几何、运动、读数一致，按目标做图形验证 | 明确真实结构与机械类比的边界；只用于专项解释图，不能当业务画布或普通 KPI 图表 |
| 明确要求材质解释图 / 栅格图解 | `guizang-material-illustration` | 保留图解语义与来源；图像不能替代真实数据图表、可编辑流程或交互证据 |
| 非商业文章、研究、作品集的编辑叙事图 | `lieflat-charts`：结论驱动选图、数值与视觉编码一致 | 本机包为 PolyForm Noncommercial 1.0.0；商业 Kit 默认排除其代码与模板，另有商业授权再评估。小字号、外部字体、hover 和默认动效不能直接移入产品 |
| 修改 Beautiful Mermaid 编辑器本身 | `beautiful-mermaid-editor` | 它指导 editor 源码，不作为通用制图入口；普通 Mermaid 图不为此引入编辑器工程 |
| 桌面 Agent 产品、输入法、滚动和多窗口 | `desktop-agent-ui` | 仅真实桌面 Agent 需求触发，不给所有 B 端项目增加会话和 Agent 能力 |
| B 端规范与设计系统审阅 | 用户开源的 [b-end-design-system-skill](https://github.com/Ludi-Herry/b-end-design-system-skill/tree/f56256e0a7432bd2d60d317eb33048f2c09df296)，Skill 名 `b-end-design-system` | 作为补充参考；与 Kit 重合的组件优先、页面骨架、Token、确认和走查规则沿用 Kit，按下节去重 |
| 已有 C 端 / 移动端任务 | 用户开源的 [mobile-design-system-skill](https://github.com/Ludi-Herry/mobile-design-system-skill/tree/093c88e90265e2b43efbca88c00800321abb2461)，Skill 名 `mobile-design-system` | 用于 safe area、导航手势、软键盘与 Bottom Sheet 的专项提问和验收；按目标平台与合同取子集，不把所有 C 端等同手机产品 |
| 输入、按钮、焦点、手势或动效细节 | `emil-design-eng` / `apple-design`：只选命中主题 | 保留既有字阶与组件；Motion 等示例不授予新增依赖权限；动效还需遵守 reduced-motion |
| 底座选型 | `pick-ui-library` | 仅尚未选定或明确要求重新选型时用；合同已冻结时不重开比较 |
| Figma / 开发交接 | `design-handoff` | 标注 Token、props、状态和断点的方法挂到既有 workflow；不重复生成平行交接合同 |
| 数据大屏 | 既有 [situation-screen](../recipes/situation-screen.md) 与 `sa-situation-screen`；3D 用本包 [figma-3d-situation-screen](../skills/figma-3d-situation-screen/SKILL.md) | 本机 SA Skill 含具体项目背景，复用方法并核对目标合同；不照搬项目坐标、数据、素材或风格 |
| UI 文案 | `ux-writing` | 保留项目术语、中文受众、真实原因与恢复动作，不自行增加产品承诺 |

`anatomy-explainer` 面向配音、字幕和视频，不属于 Kit 产品 UI 主链。明确要求 Hairline / 发光交互作品时再查 `hairline-create` / `iso-glow`，普通图示继续走 `diagram-design`。

## 用户开源三套 Skill：去重与取舍

2026-11-01 已按 GitHub `main` 的实际提交读取三套公开内容：桌面 `44653f97065f71de662a07d1aa4547870962b029`，B 端 `f56256e0a7432bd2d60d317eb33048f2c09df296`，移动端 `093c88e90265e2b43efbca88c00800321abb2461`。本机已装桌面入口与该公开版本并非逐字一致；共享 Skill 目录未找到后两套的 `SKILL.md`，此处登记公开参考，不声称已经安装或运行。

| 内容 | Kit 的唯一维护位置 | 如何融合 |
| --- | --- | --- |
| 图文光学对齐、阴影 / 裁切、验收记录 | [visual-alignment.md](../rules/visual-alignment.md) | 只补判定与复测步骤，layout / spec / review 引用它；不复制三套同类检查单 |
| 组件优先、语义 Token、页面骨架、表单与浮层 | 既有 rules / recipes / 组件与项目 manifest | 直接复用 Kit；外部 manifest 是语义目录，不是可导入组件，也不能取代 Kit 的实现登记 |
| IME、持续内容、通知、焦点和返回 | interaction-decisions、form、interaction-controls 与项目合同 | 首批已纳入的规则保留原位置；桌面窗口和多窗口部分仅在桌面需求触发 |
| safe area、软键盘、平台返回与手势 | brief / design-spec 的响应式节、design-review 的移动专项项 | 仅已声明的移动任务补齐平台与实测；原生 pt / dp 不直接等同 CSS px，不引入独立移动合同 |

读取参考时保留以下边界：

- 三套中的固定字体档数、像素、阴影、边框和偏移值不覆盖冻结 design pack；暗色字重、500ms 输入守卫、分栏比例和性能宣称仍需目标项目证据。
- B / 移动两套 Python 审计脚本只做若干源码正则匹配，无法证明图文对齐、触控面积、阴影、运行交互或完整设计合规；成功输出不能作为 Kit 视觉通过证据。既有适配器、截图与人工核对继续生效。
- B 端模板包含自行实现的浮层；移动 Bottom Sheet 模板修改 body 样式且未实现完整拖拽闭环。两套模板都有示例主题类。只参考结构，不迁入这些实现；项目使用已登记的成熟组件和 Token。
- 移动资料提到安全区与键盘行为，但本次未在其 references / 脚本 / 模板中找到 `dvh` 或 `visualViewport` 方案。键盘弹出后的真实可用高度仍由项目实现并验证，不能宣称参考模板已经解决。

这次接入的是知识与调用边界，未安装后两套、未复制模板、未运行外部审计或修改三个公开仓库。

## Impeccable 的具体边界

本机 4.8.0 会把同名 `PRODUCT.md`、`DESIGN.md` 当上下文；Kit 根 `PRODUCT.md` 与 `kit/DESIGN.md` 承担各自既有职责，不能合并成它的默认产物。

- 本轮审计只读取了 Skill 与脚本，没有运行初始化、context、doctor 或重设计。
- `context` 的静态实现包含上游版本请求和本机缓存写入。M0 的 `allowedWrites=[]` 不能被该流程覆盖；只读任务可直接阅读现有资料与所需 reference。
- `doctor --json` 是报告入口，`doctor --fix` 则可修改项目标记、移动 sidecar。需要诊断时先按任务范围取报告，不因发现漂移自动修复。
- `document`、redesign、初始化、配置和 hook 操作按实际 task contract 的文件范围执行。此次规范接入不授权重写 Kit 基线、安装 hook 或创建平行 Token 真相。
- launcher 受限时按宿主允许方式读取已有上下文；工具安全拒绝继续有效，不通过换工具绕过。

## 同步与可用性记录

2026-11-01 静态核验：本次核验的 16 个本机 Skill 均有入口。维护台账记录 Impeccable 4.8.0 / `5e745ace7e151feb2a93d360d0281fe39448b857`，Taste 2.1.4 / `6010f91a…`，Anatomy / `bc943e40c59998be5da61f9d39c6a983b1116099`，Garden（web-design-engineer 来源）manifest 1.3.0 / `aaf9a82f…`。省略的 SHA 仅是台账短标识，不用于自动拉取或可复现锁定。

本地来源依据：`~/.agents/skills/UPSTREAM-MAINTENANCE.md`、各 Skill 的 `SKILL.md`、`UPSTREAM.md` 与 lock。`diagram-design` 2.6 自身、`beautiful-mermaid-editor`、材质图与部分本地 Skill 未查到完整固定上游提交，保留“待补来源”，不称已锁定。

本轮定向打开了 [Impeccable](https://github.com/pbakaus/impeccable)、[Taste](https://github.com/Leonxlnx/taste-skill)、[Anatomy](https://github.com/wheresryan22/anatomy) 的官方仓库，核对其用途与依赖说明。未做本机与全部上游 HEAD 的逐文件比对，也未安装、升级或执行 Skill 端到端；“本机同步记录”“当前官方说明”“本项目实跑”分开记账。

上游变化时只复核命中的 Skill：记录来源与版本、比对本地定制、确认合同冲突、在真实授权任务中验证。普通页面生成读取本地规则，不联网追最新、不全量同步。接入方法能复用，不代表整个工具链已经在 Kit 中通过验收。
