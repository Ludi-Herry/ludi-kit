# 页面设计规格

写页面代码前，把已经登记的项目事实整理成六节规格。它用于核对页面意图、选型和验收，不替代合同，也不增加实现授权。可以手工按模板填写，无需新增生成器或 schema。

## 输入与产出

从 `projects/<projectId>/business-context.json` 和 `pages.json` 选定一个 `pageId`。先运行 M0 `inspect`，按 `requiredReads` 读取并核对哈希。页面目标、动作、首屏和验收以 `intentCard` 为准；入口、上下文和去向以 `flowCard` 为准；区域顺序以 `layoutTree` 为准。引用的跨页流程回到 `flows.json`。底座和 adapter 以 `frontendFoundation` 为准。

输出到该项目已授权的 `specs/<pageId>.md`。开头登记项目、页面、路由、整理日期和输入路径 / SHA-256；正文只保留下列六节。每项事实标出文件与字段路径，长表可共用一列来源。引用外部 PRD 的细节前，必须实际读取合同登记的来源；仅有指针不能充当事实。

缺失写成“待补：缺少什么；影响哪项生成或验收”。冲突并列记录来源，按项目的权威顺序处理；无法裁决则待补。规格不能把推测升级成需求，不能自行添加状态、移动端任务、权限、示例数据、断点或组件。缺口阻断必要实现时按原合同暂停对应部分，规格本身不额外设置确认门。

## 六节模板

### 1. 目标与用户任务

- 使用角色与业务场景：`business-context.product.audience/scenario`。
- 用户目标、进入时状态、入口与后续目的地：`flowCard`。
- 本页目标、主要与次要动作：`intentCard`。
- 对象及跨页身份：`dataRequirements` 与已登记的流程；未登记则待补。
- 本页范围与不做项：项目合同边界；不从内部样例推导真实需求。

### 2. 信息层级与区块

按 `layoutTree` 逐行列“顺序 / 区块职责 / 首屏要求 / 结构归属 / 来源”。对照 `intentCard.firstViewport` 和 pattern 的 `regions`，保留 locked 区域与 page 插槽的归属。标题、主操作、识别字段和状态轴必须可追溯。合同没有滚动归属、字段清单或尺寸时写待补，不能从截图猜合同。

### 3. 组件选型

列“业务语义 / 合同组件 / manifest 对应物 / 当前底座映射 / 依据或缺口”。`kit-consumer` 查 `components.manifest.json`；`library-native` 查冻结 design pack 与知识清单，manifest 只作语义对照，不能因此从 kit barrel 导入。`custom-native` 依合同登记入口查 registry 或源码映射。

antd 查询用 `npm.cmd exec --offline -- antd info <C> --version 6.5.0 --format json`。已有 `generation-plan.json` 是计划依据，不能声称它已经证明实现。先复用；没有满足语义的对应物时记缺口，真实 brief 与单独写入授权齐备后才考虑扩展或新增。不能用规格自动修改 manifest。

### 4. 状态

逐项列“触发条件 / 载体与文案 / 可用操作 / 恢复出口 / 来源”。至少检查空、加载、错误、无权限四类是否已被合同定义；未定义写待补，不能补造。空状态区分本来无数据与筛选无结果；错误按字段、区块、整页的发生范围放反馈；无权限按角色入口裁剪、动作置灰说明和直达异常页分别核对。状态枚举及语义色追溯 `status-copy.md`，不能用颜色代替文本。

### 5. 响应式

列合同已定的视口 / 断点、区域重排、列隐藏优先级、局部横滚和关键动作位置。移动任务未登记时写待补，不把桌面后台自动改成手机产品。滚动归属未登记时单独标记，留给布局阶段裁决；同一内容路径上的嵌套纵滚与独立区域内滚要分开。

已声明移动任务时补记目标平台、安全区、软键盘弹出 / 收起后的可见区域、操作位置、返回与关闭行为、手势和滚动归属。具体实现复用合同组件；`dvh` / `visualViewport` 只在项目确有需要且目标环境支持时评估，不因引用 Skill 自动引入。专项参考见 [用户开源三套 Skill](../docs/design-skill-routing.md#用户开源三套-skill去重与取舍)。

### 6. 验收点

从 `intentCard.successCriteria` 和相关流程逐条转成“页面与状态 + 前置条件与动作 + 可观察结果 + 来源 + 验证方式”。数值与阈值沿用合同。技术 adapter、真实交互、视觉证据与人工验收分别记录；未执行就写未执行，不能把规格生成或 M0 ready 当作通过。验收需要但尚未定义的条件写待补。

## 六节中的条件补充

仍使用上面六节，不另建平行规格。命中时分别写入信息层级、组件、状态、响应式和验收：

- 图表：用户问题、指标定义、单位、时间 / 时区、粒度、聚合、来源、更新时间、比较基准；筛选联动、下钻与返回范围。读 [data-visualization.md](../rules/data-visualization.md)。
- 流程或关系图：图的语义、角色 / 节点、真实端点、条件、方向、折叠异常、跨组关系；触屏替代 hover、详情与返回。读 [flow-diagram.md](../rules/flow-diagram.md)。
- 输入与多选：默认来源、生效时机、时间限制、全选范围、新对象规则、完整标签名单与未保存退出。
- 视觉细节：按 [visual-alignment.md](../rules/visual-alignment.md) 在当前规格标出图标与文字采用中线、基线还是首行对齐；仅记录真实需要的光学例外。涉及阴影 / 裁切时，把目标组件、状态、截图与原始审计输出列入验收，不新造尺寸阈值。
- 外部 Skill：读 [design-skill-routing.md](../docs/design-skill-routing.md)，记录选用方法、版本来源、工具条件和实际允许写入；Skill 不改变六节事实的权威来源。

## 样张与来源

样张：[天枢全部设备](../projects/tianshu-device-ops/specs/device-list.md)。它展示合同缺口如何保留，不授权修改天枢页面。

方法参考 `@cloudai-design/oneskill@0.6.1`（MIT）的 `CloudAI-UI/design-spec-generator.md` 与 `design-spec-generator/design-spec-template.md`；本 recipe 的六节由派工单定义，使用 kit 自己的合同字段与语汇，不复制其源码或模板文案。版本拆解见 `<local-path-omitted>` §6。
