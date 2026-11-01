# 全部设备 · 页面设计规格

项目 `tianshu-device-ops`，页面 `device-list`，路由 `/devices`（应用入口 `/device-ops/devices`）；整理于 2026-10-04。此为现有合同的规格样张，不改项目输入或实现，不登记新的验收通过。

输入以项目目录为相对根：`pages.json`（SHA-256 `b96cfbc9d883d18d0350501097ddb3fbfcc500717f56fa6c8891e68c67635e35`）、`business-context.json`（`21b7980277fae18838bb161e88fe01e043791c3df99957ffa9b68ad07063ddd4`）、`flows.json`（`7c4a342d2654d514e0ff84bfe53ded8ffcbca57d96a346fd96ff0f91183f1454`）。2026-10-04 M0 输出 `status=ready`，16 项 requiredReads 哈希相符；它只证明上下文可读，写入范围由本次派工单单独授权。

下文 `P` 指 `pages.json#/pages[id=device-list]`，`B` 指 `business-context.json`，`F` 指 `flows.json#/flows[id=device-inspection]`。辅助状态文案来自 `status-copy.md`，语义组件来自 `kit/components.manifest.json`，原生组件允许集来自冻结 `kit/foundations/design-packs/antd-6.5.0-ui-coverage-batch2.json`。

## 1. 目标与用户任务

小豆盒面向运维、客服、生产管理和平台管理员。用户围绕同一台设备的 SN 协作，管理生产、出货、激活、在网运行、告警和售后；信息密度优先，中性调性。（`B.product.audience/scenario`）

用户在一张表里定位需要处理的设备并判断轻重缓急。入口是侧栏“设备生命周期 → 全部设备”或全局搜索 SN；下一步到 `/devices/:sn` 或 `/alerts`。生命周期状态与在网状态分开呈现。（`P.flowCard`）

本页按角色默认视角浏览全部设备，通过阶段、状态和筛选收窄。主操作是“查询”，次操作是保存为我的视图、导出当前结果、重置筛选和列设置。（`P.intentCard`）设备巡检流程中，运维的默认视角为运行异常；定位后到详情判断，再进入告警处置或发起 RMA。（`F.businessState/userGoal/steps`）

对象为 `Device` 与 `AlertRecord`。（`P.dataRequirements`）不接真实心跳、推送、工单接口，不扩展消费端 App、广告或页面卡以外功能。（`B.boundaries.doNotBuild`）待补：仅凭这些合同字段不能列出完整筛选字段、表格列及全角色默认视图矩阵，需从已登记页面卡 / PRD 补齐。

## 2. 信息层级与区块

| 顺序 | 区块与职责 | 首屏与归属 | 来源 |
| --- | --- | --- | --- |
| 1 | 页面标题、当前视图与视图切换 | 首屏；页面标题不放进内容卡片 | `P.layoutTree[0]`、`intentCard.firstViewport[0]`；`rules/layout.md` |
| 2 | 阶段分布，帮助判断并收窄设备范围 | 首屏；依据当前视图与生效筛选计数 | `P.layoutTree[1]`、`intentCard.successCriteria[4]` |
| 3 | 5 个常驻筛选与 6 个收纳筛选 | 首屏；pattern 的 filter 区锁定 | `P.layoutTree[2]`、`intentCard.firstViewport[2]`；`patterns.manifest.json#list-page.regions` |
| 4 | 工具栏与设备表格，定位对象并进入后续任务 | 首屏表格；data 区属于页面插槽 | `P.layoutTree[3]`、`intentCard.firstViewport[3]`；`patterns.manifest.json#list-page.regions` |
| 5 | 已选操作条，呈现批量上下文 | 选中后底部浮出；无选中不展示 | `P.layoutTree[4]`、`intentCard.successCriteria[3]` |

pattern 的 shell 区也由 pattern 拥有并锁定。待补：合同没有指定本页各区高度、滚动归属和字段完整清单，规格不从现有 CSS 反推这些决定。

## 3. 组件选型

底座为 React 19.2.7、antd 6.5.0、`@ant-design/icons` 6.3.2，`library-native + package-native`；UI 从合同允许的原生包和项目本地入口导入。（`B.frontendFoundation`）下表的原生映射是选型建议，允许集已对照 design pack；它不把 kit 语义组件变成原生导入，也不声称整个组合已有等价封装。页面实际组件仍按 `generation-plan.json` 和冻结知识清单核对。

| 业务语义 | 合同组件，均有 manifest 条目 | 底座映射建议与限制 |
| --- | --- | --- |
| 页面壳与页头 | `PageLayout`、`PageHeader` | 原生 `Layout`、`Typography` 与项目结构；不导入 kit wrapper |
| 同页视图 | `Tabs` | `Tabs` 或计划中的 `Segmented`；选择依据须来自登记页面卡 |
| 筛选 | `FilterPanel`、`Select`、`Input`、`RangePicker` | `Form`、`Select`、`Input`、`DatePicker.RangePicker` 组合；`RangePicker` 不是独立包导入 |
| 结果区与表格 | `DataSection`、`DataGrid`、`Pagination` | 项目工具栏 + `Table` 自带分页；不重复造分页器 |
| 业务状态 | `Badge` | 项目状态映射 + `Tag`，依 `status-copy.md`；枚举文案留在项目层 |
| 操作 | `Button` | 原生 `Button`；主次、危险与禁用由语义选择 |
| 批量上下文 | `BulkActionBar` | 项目本地布局 + `Button`，不新增公共 wrapper |
| 高风险确认 | `ConfirmDialog` | 原生 `Modal`；确认对象、范围与后果须来自业务合同 |

来源：`P.componentPlan`、`components.manifest.json`、design pack `components/imports`，本地 `generation-plan.json`。待补：本样张不扩写未在合同中定义的批量动作、确认文案或低风险动作确认等级。

## 4. 状态

| 状态 | 合同事实与载体 | 操作 / 恢复与待补 | 来源 |
| --- | --- | --- | --- |
| 无数据 | 与筛选无结果分开；文案“暂无设备数据” | 待补：无数据下一步的权限与业务条件 | `P.intentCard.successCriteria[2]`；`status-copy.md#通用文案` |
| 筛选无结果 | 说明没有符合条件的设备，保留条件 | “重置筛选”恢复查询范围 | `status-copy.md#通用文案`；`recipes/empty-loading-error.md` |
| 加载 | 合同要求有处理；具体载体待补 | 不能把加载展示为 0 条或无数据 | `P.intentCard.successCriteria[2]`；`recipes/empty-loading-error.md` |
| 错误 | 合同要求失败可重试 | 待补：错误对象、载体、具体文案与重试条件 | `P.intentCard.successCriteria[2]` |
| 无权限 | 无导出权限有处理；按钮置灰 + 提示 / 未开放功能页 | 文案“当前账号无导出权限”；待补：本页完整权限矩阵与申请路径 | `P.intentCard.successCriteria[2]`；`B.criticalStates`；`status-copy.md#通用文案` |

生命周期与在网状态分别显示；在网状态只对已出货设备有意义。告警级别 P1/P2/P3 用中性灰度，不占状态色。（`B.criticalStates`）具体标签追溯 `status-copy.md`，例如在线用 success、离线用 warning；不能从色彩猜业务状态。

## 5. 响应式

已有合同明确：默认排序列“未处理告警”在所有宽度可见，操作列平铺不设更多菜单，数值 0 显示 0。（`P.intentCard.successCriteria[5]`）布局需保证上述关键列和操作可访问，不能为了缩窄隐藏默认排序依据。

待补：`pages.json` / `business-context.json` 没有冻结支持视口、断点、列宽、其他列的隐藏顺序、移动端任务或横滚策略。源页面卡登记 1440px 桌面亮色基准，但本节不把它自动扩为移动端合同；后续生成应实际读卡核对。本次走查脚本的 1440×900 与 1024×900 是试运行采样，不是产品新增阈值。

## 6. 验收点

| 条件与操作 | 可观察结果 | 来源 | 验证方式 |
| --- | --- | --- | --- |
| 初次进入并展开收纳筛选 | 常驻恰好 5 个、收纳恰好 6 个 | `P.intentCard.successCriteria[0]` | 浏览器计数与人工核对字段；字段名待补 |
| 设置普通条件与绑定手机号后刷新 | 普通条件保留、手机号清空 | `P.intentCard.successCriteria[1]` | 浏览器刷新前后断言，不记录完整手机号 |
| 分别进入无数据、筛选无结果、加载、失败、无导出权限 | 状态可区分；失败有重试，无权限有处理 | `P.intentCard.successCriteria[2]` | 状态交互证据；缺失载体待补 |
| 批量选中设备 | 底部出现已选操作条 | `P.intentCard.successCriteria[3]` | 浏览器关键交互与视觉核对 |
| 切换视图、生效筛选、选择阶段，再保存视图 | 阶段计数同范围；互斥阶段灰态为 0；阶段选择被保存 | `P.intentCard.successCriteria[4]` | 行集合与计数断言，重入保存视图核对 |
| 在已定视口查看默认视图和表格 | 视图名旁有默认标记；操作平铺；排序列可见；0 不变成占位符 | `P.intentCard.successCriteria[5]` | DOM 与视觉；支持视口待补 |
| 进入巡检流程，点击 SN，再发起 RMA 并确认 | 首屏含阶段 / 五筛选 / 表格；异常详情有 warning 告警横幅；RMA 后详情与列表同步 | `F.successCriteria` | 既有跨页流程证据，不能仅检查 URL |

技术合同分别指定 `lint.react-antd-project`、`build.vite-react`、`browser.playwright-react`、`visual.playwright-screenshot`。（`B.frontendFoundation.adapters`）本样张未重新执行这些 adapter，也未取得新的人工视觉签收；这不影响规格产出，但不能将其记成页面再次通过验收。
