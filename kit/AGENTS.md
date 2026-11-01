# AGENTS.md — Ludi Design Kit 入口手册（技术包：@ai-readable/kit）

> 这是写给 AI Agent 的最高优先级规则。生成任何页面或组件前，先读完本文件。
> 规则冲突时，本文件 > rules/ > recipes/ > 你的默认习惯。

> **仓库说明**：内部验收历史、部分内部项目、AI 产品知识包和 `docs/` 大部分文档没有随仓库提供，本文件提到的相应路径可能不存在。
> 总检查是 `npm run validate` 和 `npm run check:all`。其他要读内部历史的校验命令失败属于预期。真实 Figma 标识已替换为占位符。

---

## 你在用什么

本仓库是一套可选择前端基础设施的 Ludi Design 生成与验收系统：项目合同 + design pack + 组件与 token 读取层 + 页面规则 + 生成器 + 验收 adapter。

你的任务是先读取项目冻结合同，再按 `outputMode` 拼装页面：选择正确的导入面、复用所选基础库、按 recipe 选结构、生成后分别记录技术与视觉结果。

---

## 页面任务机器入口（M0）

项目和页面 ID 已知时，先运行只读上下文编译命令：

```bash
npm run --silent ai-readable -- inspect --project <project-id> --page <page-id> --json
```

- 按输出的 `requiredReads` 顺序读取，并核对每项 SHA-256、原因和权威角色。
- `status: ready` 只表示上下文可读；`readiness.implementation` 仍为 `needs-task-contract`。
- M0 不授予实现权限，`writePolicy.allowedWrites` 固定为空。获得独立 task contract 前保持只读。
- CLI 发现缺页、缺 flow、缺 pattern、缺组件或 design pack 哈希漂移时会 fail-closed。

---

## 固定读取流程（不要跳步）

```text
0. 查项目 business-context.json       确认业务类型与 frontendFoundation 冻结合同
1. 读 AGENTS.md                      ← 你在这里
2. 读合同指定的 design pack          选 framework / foundation / theme / import / adapters
3. 查组件语义目录                    kit-consumer 用 components.manifest；native 用对应 pack
4. native + antd 读取知识清单         页面模板 → 决策卡 → 组件引用 → 命中 Blog → 视觉用例
5. 查 rules/                         布局、状态、反模式约束
6. 查 recipes/                       场景拼装配方
7. 参考 examples/                    模仿真实代码
8. 按 outputMode 规定的 import root 导入
9. 运行合同指定的 technical 与 visual adapters
```

不要凭视觉猜组件，不要一上来就写自定义 UI。

上面的固定流程针对「生成页面」，不跳步。非生成任务按任务类型取最小阅读集，不必全量顺序读：

| 任务类型 | 必读 | 明确不读 |
| --- | --- | --- |
| `library-native + antd` 页面生成 | business-context.json、design pack、rules/、对口 recipe、知识包命中子集 | 全量 Blog 与无关知识包 |
| `kit-consumer` 页面生成 | business-context.json、components.manifest、tokens.manifest、rules/、对口 recipe | antd 知识包 |
| 组件扩展 / 新增 | components.manifest、rules/anti-patterns.md、DESIGN.md | workflows.manifest |
| 验收与证据 | 项目合同 adapters、workflows.manifest 对应 handoff | recipes/ |
| Figma 链路 | workflows.manifest 对应条目、figma/ 证据合同 | 组件知识包 |
| 修改 kit 规则层 | AGENTS.md、DESIGN.md、受影响 rules/ | 项目层合同 |

### 设计知识与外部 Skill 按需读取

- UI 视觉走查读取 `rules/visual-alignment.md`，明确图标与文字的中线 / 基线 / 光学参照；涉及阴影、裁切或透明窗时执行其中的多状态审计并留原始输出。
- 页面包含指标、趋势、占比或多图联动时，读 `rules/data-visualization.md`；包含流程、状态图、系统关系或拓扑时，读 `rules/flow-diagram.md`。
- 需要外部设计或绘图 Skill 时，先读 `docs/design-skill-routing.md`，按交付物选一个主入口，再加载命中的 reference。普通页面不全量读取科普稿、知识库或所有 Skill。
- M0 当前的 `requiredReads` 只枚举既有固定规则；本节条件读取是补充阅读义务，不声称 CLI 已自动识别新图示类型。`rules/layout.md` 和 `rules/dashboard.md` 也保留条件链接。
- 项目合同与 design pack 决定事实、依赖、Token 和验收；外部 Skill 提供方法。其默认技术栈、字体、配色、目录、初始化、hook 和发布步骤不自动进入项目。
- 来源目录不可用时，使用本包已归纳规则并记录来源未复核；不能编造原文、同步日期或上游版本。维护追溯见仓库 `docs/ANALYSIS-设计知识与Skill整合审计-2026-11-01.md`。

如果项目是 `validation-sandbox`，可推进管线回归、harness 覆盖、preview 验收、feedback 回流和显式 `kit-consumer` canary。新增业务组件、第三方底座选型、真实页面清单必须等 `real-product` brief 补齐。

---

## Ant Design CLI 与设计知识包

`@ant-design/cli` 固定为本项目的 devDependency。它服务于 kit 的 antd 适配层，以及明确选择 `library-native + antd` 的项目源码。AntD 生成还必须读取 `foundations/knowledge/antd-6.5.0/manifest.json` 冻结的设计语言、页面模板、组件决策卡、完整官方 Blog 索引、按组件命中的文章和视觉回归用例。

### 固定约束

- 禁止全局安装 `@ant-design/cli`，禁止运行 `antd setup --client codex`，也不安装官方 antd skill（`npx skills add ant-design/ant-design-cli`）；官方 For Agents 文档的要求已由本文件与知识包承接。
- 所有 CLI 查询显式携带 `--version 6.5.0 --format json`，确保结果对应本项目实际运行版本并可被 Agent 稳定解析。
- CLI 查询结果里标为 deprecated 的 prop、写法不得写进代码，写之前就避开，不等 lint 或 console 报出。
- 组件不在知识包参考集内时，先用 `npm exec --offline -- antd list --version 6.5.0 --format json` 确认 6.5.0 有该组件，再按增量法扩展知识包。
- 忽略 CLI 的「Update available」提示。升级 antd 或 `@ant-design/cli` 属于合同变更：先经 Owner 同意，再跑 `antd changelog` 与 `antd migrate` 出清单，重建知识包后才改代码。
- `antd bug` / `antd bug-cli --submit` 会向外部公开提交，必须先经 Owner 确认；不主动建议向官方上报。
- 官方 Blog 只在维护时联网刷新，必须传入精确 40 位 commit；普通页面生成读取本地快照，不临时联网学习。
- 修改 antd 适配代码前，先查询目标组件；按需补查 demo、semantic DOM 和 token：

```bash
npm exec --offline -- antd info Button --version 6.5.0 --format json
npm exec --offline -- antd doc Button --version 6.5.0 --format json --lang zh
npm exec --offline -- antd demo Button basic --version 6.5.0 --format json
npm exec --offline -- antd semantic Button --version 6.5.0 --format json
npm exec --offline -- antd token Button --version 6.5.0 --format json
```

- 项目级检查统一使用：

```bash
npm run antd:doctor
npm run antd:usage
npm run antd:lint
npm run antd:lint:projects
npm run check:antd
```

### 使用边界

- `kit-consumer` 的 CLI 结果只指导 `src/**` 内部实现，消费代码继续只从 `@ai-readable/kit` barrel 导入 UI。
- `library-native + antd` 的 CLI 结果可以指导合同登记的项目源码，项目直接从 `antd` 与锁定的图标包具名导入。
- `library-native + antd` 生成前必须产生 `generation-knowledge.json`；实际组件均有冻结 CLI 引用，Blog 只选择组件或页面类型命中的子集。按页面卡直接编码的页面用 `generation-plan.json` + `npm run knowledge:plan -- --project <id>` 产出，见 `recipes/prd-to-pages.md`。
- 禁止把 antd demo 直接复制成业务页面，禁止让 CLI/MCP 的页面生成提示绕过 design pack、rules、recipes 和 business context。
- `npm run check:antd` 会发现全部 `library-native + antd` 合同并执行项目级 CLI 与 Blog 派生 lint；任一 warning 或 error 都会失败。
- kit 适配层改动先跑 `npm run antd:lint` 与 `npm run check:dom`；native 项目执行合同指定的 lint/build/browser/visual adapters。

---

## 页面生成：由粗到细，分阶段推进

不要把中大型页面一次性生成成一大坨代码。拆成三步，每步都在已稳定的基础上往前走：

| 阶段 | 关注 | 依据 |
| --- | --- | --- |
| ① 布局 Layout | 页面分哪几个区块、各区块大致干嘛、是否响应式栅格 | `patterns.manifest.json` + 页面壳层 |
| ② 模块 Module | 每个区块的功能、展示哪些内容、用哪些组件 | `components.manifest.json` 选型 |
| ③ 细节 Details | 逐区块调颜色、文字、间距、状态 | `rules/` + `tokens.manifest.json` |

配合"先选组件再生成"：选型解决"用什么"，分阶段解决"按什么顺序拼"。

pattern 的可选 `regions` 字段声明区域归属：`owner: "pattern"` 且 `locked: true` 的区域（壳层、筛选区、指标行等）结构按合同锁定，`owner: "page"` 的槽位承载业务内容。布局或壳层漂移返修时先查该字段。

---

## 契约（不可协商）

### 用户交付契约

- 先读取 `workflows.manifest.json` 对应 workflow 的 `handoff`，确认 Primary deliverable、启动方式、入口和 blocked fallback。
- UI / Web / 大屏任务结束前，必须启动或复用唯一 server，确认真实端口，在应用内 Browser 打开主入口并保留为用户可见的 deliverable tab。
- 最终回复先给可打开成品及当前状态，再给源码、截图、metrics、harness 和其他证据路径。
- 截图与 evidence 只能证明质量；它们不能替代可交互页面、Figma node、可安装 package 或可浏览报告。
- `external-blocked` 时按 `blockedDelivery` 交付当前已有材料、阻塞原因和恢复输入；未知 `fileKey`、`nodeId`、`captureId` 保持 `null`。
- 交付形式与十条实际链路的映射见 `../docs/WORKFLOW-DELIVERABLES.md`。

### 基础设施合同

- 生成前必须存在 schema-valid 的 `frontendFoundation`；生成器显式接收该合同并在首次写文件前校验 design pack SHA-256。
- `kit-consumer`：只从 `@ai-readable/kit` barrel 导入；token 与样式按 design pack 的专门入口导入。
- `library-native`：只从合同锁定的第三方包、图标包和项目本地业务组件导入。AntD、Arco、TDesign、Element Plus 均采用 package-native，准确版本进入合同。
- `custom-native`：只从合同锁定的 workspace/local package、源码 registry、Figma 映射入口或项目源码导入。
- shadcn 使用 source-owned 分发；`components.json`、registry 来源与写入目录必须进入合同。
- 未选中的候选库只保留档案，禁止因候选登记安装依赖或打入 kit 包。
- **不复制** showcase / 内部源码，只用公开 API、合同登记的源码分发机制或项目业务组件。

### 图标契约

- 图标选型与许可证记录以 `docs/icon-library-candidates.md` 为准。
- 一个项目只启用一套静态通用图库；动态图标只作为受控扩展。
- `kit-consumer` 只从 `@ai-readable/kit` 获取具名图标组件。
- `library-native` 与 `custom-native` 只从合同锁定的单一静态图库具名导入；小豆盒固定 `@ant-design/icons`。
- 禁止 namespace 全量导入、动态名称映射和未登记的图库依赖。

### 扩展契约

- 优先复用已有组件；能通过 `props` / `variant` / `className` 扩展的，优先扩展。
- **不造现有组件的新变体**。缺文案/能力在 kit 里申请，不行内改写。
- 只有现有组件无法满足语义、交互或布局时，才新增组件。
- 产品特定的状态映射 / 角色徽章 / 枚举值，落在 `src/pages/` 或 `src/features/`，**不改 kit**。
- 业务组件从真实 PRD、流程、状态枚举里产生；`validation-sandbox` 不能作为业务组件路线依据。

### 样式契约

- **禁止硬编码** token 已覆盖的颜色、间距、圆角、阴影。用 `var(--color-...)` / 语义变量。
- 不写内联 `style`，除非数值是动态的。
- 同一业务语义只对应一种视觉表达（见 `rules/anti-patterns.md` 的 Badge 规则）。

### 流程契约

- 页面先按 recipe 选结构，再按 Layout→Module→Details 生成。
- 运行 workflow 时，每完成一个 stage、attempt 或决策点立即向该 run 的 `events.jsonl` 追加事件；closeout 写 `run.final.json` 前必须确认事件流完整，禁止改写或删除已有事件。
- **输出后必须过合同 adapters**：静态检查（导入边界/组件语义/token/布局/反模式/a11y）+ 运行时（build、真实交互、console、overflow、DOM 渲染）+ 独立视觉检查。
- 每个正式页面至少执行一个关键交互，并按 pageId/route 保存步骤与断言。
- technical 与 visual 使用独立状态和证据文件；任一侧失败时保留真实失败，另一侧结果不能覆盖。
- 图表先按 `rules/data-visualization.md` 选现有组件；DOM/CSS 简图仅用于其能力范围，引第三方图表库前确认它支持业务数据传入、包体可控，并遵守基础设施合同。

### QA 修复回写纪律

- QA finding 先归类到需求、页面意图、流程、样例数据、规则/recipe、组件/token 或实现。
- 修改生成产物时，同一批次更新对应权威输入；文件由人工维护时，在 evidence 中明确所有权。
- generator-owned 文件从更新后的输入重新生成，禁止只在产物中保留修复。
- 人工维护的 generated 文件在 feedback evidence 中记录来源、受影响 flow 和验证命令。
- 先跑受影响的定向检查，再跑 `npm run validate`；流程变化同时跑对应 flow spec。
- evidence 同时记录权威输入与最终实现的 SHA-256。
- `createdAt` 在 2026-08-06 及之后的 promoted 条目必须带 `promotionEvidence.evidencePolicy: strict-v1`，且 `promotion.destination` 必须出现在 `implementation.files` 中并通过 SHA-256 校验；否则修复只留在某个项目的产物里，下次生成新项目会复现同一缺陷。

### 执行、审查与止损

遵守全局 AGENTS.md 的「执行、审查与止损」和「需求判断与持续执行」。本项目补充两点：

- 稀缺输入包括真实 PRD、Holdout 和私有输入，按全局规则的“稀缺真实输入”处理。
- 计划、盘点、止损说明和长分析写入 `docs/`，沿用 `PLAN-*`、`ANALYSIS-*` 命名。

规则背景（为什么这样定、旧版止损条款原文）见 `../docs/NOTES-kit规则背景.md`。

#### 验证路由

- `npm run validate` 是全量检查的唯一权威入口，第一步 `validate:integrity`（`scripts/check-frozen-files.mjs`）校验 `quality/frozen-files.json` 登记的冻结文件没有被改动（数量以脚本输出为准）。release、receipt freeze、冻结证据更新、CI 和需要登记新全量通过的任务必须使用它。
- 新一轮授权、冻结或 receipt 定稿后，用 `node scripts/check-frozen-files.mjs --freeze <集合id> <文件...>` 往登记表追加一个集合；不再为单轮冻结新写 validate/test 脚本或 npm 命令。已登记的集合只追加、不修改。
- 已关闭的 Image2 轮次的历史检查收在 `npm run validate:image2-history`，不进全量链与 CI，只在获准给历史 evidence 追加新记录或人工审计时手动运行；它在锚点表登记的快照 commit 的临时 worktree 里重放当时的判定。历史文件的防篡改只靠 `validate:integrity`。Image2 校准 batch-01 的回执锁定了当时的 `projects/tianshu-ops/prd.mdx`，已于 2026-11-01 移入这里重放；在当前工作区直接运行 `test:image2-calibration` 或 `validate:image2-calibration` 会因产品改名报哈希不一致，这不是新回归。
- 同一 worktree 已有一次全量通过后，普通重复复验使用 `npm run validate:incremental`。它先复核 Image2 与 blind 的受保护文件集；受管输入无变化时报告 `skipped-by-unchanged`，代码或机器合同变化时自动回到全量。保护集的当前数量由 baseline 与脚本输出维护。
- 改动小豆盒（`projects/tianshu-device-ops`）任一端的页面、`core/`、`design-systems/tianshu/` 规格，或 Lab 仓库里 shadcn / Element Plus 的小豆盒页面时，必跑 `npm run check:foundation-parity`（探针 → 结构合同 → 控件规格 → 三端行为断言，失败即非零）。它依赖三端开发服务和 Lab 仓库，不在线时自己启动，不接入 `npm run validate`。
- 精确暂存的纯文档提交使用 `npm run validate:docs -- --staged`。它只接受 `docs/**/*.md`、`kit/AGENTS.md` 和仓库根 Markdown；混入代码、JSON、规则/recipe/skill/evidence Markdown 时失败并要求改走定向门或全量。
- `skipped-by-unchanged` 与 `passed-docs-only` 只证明复用条件或文档范围成立，不能登记为新的全量通过、发布证据或冻结 receipt。
- 新增自动检查（validator、reviewer、schema 校验）先试运行：只报告结果、不拦截；通过既有负例并至少抓到一次真实失败后，才接入全量链。禁止同一批既写新检查又修改它所校验的判据。接入后的自动通过项按风险抽样人工复核。
- validator 读取结构化合同、manifest、receipt 或 evidence；人类状态页只提供摘要与可定位链接。禁止把 `PROJECT-STATUS.md`、`GOAL-PROGRESS.md` 等文档的原始字符串当作机器门输入。

### Git

- **可以自行本地提交**：一批工作完成、相关检查通过后（纯文档用 `validate:docs -- --staged`，其余按上面的验证路由），Agent 可以直接 `git commit`，不必逐次询问。提交前看 `git diff --cached --stat`，暂存区只能有本批文件；出现不属于本批的文件就停手（可能有别的会话在改）。commit message 用英文，汇报时给出 commit hash。
- 不提交：未通过检查的改动、Owner 暂缓的批次、别的会话留下的改动。
- 先问 Owner：`push`、`rebase`、`reset --hard`、`commit --amend`、强制推送、改写历史、删除分支或 tag。

---

## 生成前 / 生成后 检查清单

**生成前**

- [ ] 项目 `business-context.json` 是 `real-product` 吗？如果只是 `validation-sandbox`，本次是否只做管线验证？
- [ ] `frontendFoundation` 是否冻结 outputMode、framework、准确包版本、分发、来源、许可证、hash、图标、theme/reset/import 与四类 adapters？
- [ ] design pack 的 SHA-256 是否与合同一致？
- [ ] 页面 archetype 判断了吗？（list / dashboard / detail / form）
- [ ] 对应 recipe 读了吗？
- [ ] 图表或关系图是否已读对应规则，核对数据口径、真实连接、跨端任务和外部 Skill 边界？
- [ ] 需要的组件在 manifest 里都能找到吗？找不到的，是该扩展现有组件，还是真的要新增？

**生成后**

- [ ] 实际 import 是否完全符合当前 `outputMode`？
- [ ] 有没有导入未选中的 UI 库、图标库或未登记本地入口？
- [ ] 有没有硬编码颜色/圆角/阴影？
- [ ] 有没有卡片套卡片、页面标题塞进内容卡片？
- [ ] 有没有自造已有组件的新变体？
- [ ] `npm run build` 过了吗？浏览器打开无报错、DOM 有内容吗？
- [ ] 每页关键交互、console、overflow 和视觉状态是否分别落盘？
- [ ] technical 与 visual 是否分别记录原始 verdict？
- [ ] Primary deliverable 已启动并在 Browser 中打开给用户了吗？
- [ ] 最终回复是否先给可打开入口，再给源码与证据？

---

## 反模式速查（详见 rules/anti-patterns.md）

卡片套卡片 · 页面级标题塞进内容卡片 · 按钮重写一套样式 · 用近似色替代 token · 组件间距靠 margin 硬堆 · 表格页没有筛选区 · 详情页套用列表页结构 · Drawer 和 Dialog 乱用 · Badge 用颜色而非语义。
