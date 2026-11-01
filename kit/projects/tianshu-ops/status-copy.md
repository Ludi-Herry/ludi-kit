# Status Copy Map — 天枢运营管理平台（项目层）

> 依据 PRD §3.1「状态标签颜色语义」（全平台强约束）。本表是项目层文案映射的唯一来源；kit `Badge` 只接收语义 variant，文案由页面数据适配层按本表提供（规则见 `../../rules/anti-patterns.md`）。

## PRD 语义 → kit Badge variant

| PRD 语义（§3.1） | 典型状态 | kit variant |
| --- | --- | --- |
| success | 合格入库、审核通过、启用中、已裁决 | `success` |
| processing | 烧录中、测试中、投放中 | `processing` |
| warning | 待审核、降级品、RMA 中 | `warning` |
| error | 烧录失败、测试不合格、SN 冲突 | `danger` |
| default | 草稿、已停用、已报废 | `secondary` |
| geekblue（强调态） | 已出货 | `geekblue` |
| cyan（强调态） | 二次入库 | `cyan` |
| purple（强调态） | 灰度中 | `purple` |

## 第一批页面的状态枚举文案

| 业务域 | 状态值 | 显示文案 | PRD 语义 | kit variant |
| --- | --- | --- | --- | --- |
| 收货入库 | `pending-inspection` | 待验收 | warning | `warning` |
| 收货入库 | `received` | 已入场 | success | `success` |
| 收货入库 | `abnormal` | 异常 | error | `danger` |
| 烧录任务 | `flashing` | 烧录中 | processing | `processing` |
| 烧录任务 | `flash-failed` | 烧录失败 | error | `danger` |
| 烧录任务 | `completed` | 已完成 | success | `success` |
| 证书 | `valid` | 有效 | success | `success` |
| 证书 | `pending` | 待发 | processing | `processing` |
| 证书 | `revoked` | 已吊销 | default | `secondary` |
| SN 冲突 | `normal` | 正常 | default | `secondary` |
| SN 冲突 | `quarantined` | 冲突隔离 | error | `danger` |
| SN 冲突 | `resolved` | 已裁决 | success | `success` |
| 角色 | `enabled` | 启用 | success | `success` |
| 角色 | `disabled` | 停用 | default | `secondary` |

## 第二批页面的状态枚举文案（PRD §五 测试/质检/库存/出货、§八 审计日志）

| 业务域 | 状态值 | 显示文案 | PRD 语义 | kit variant |
| --- | --- | --- | --- | --- |
| 设备状态 | `testing` | 测试中 | processing | `processing` |
| 设备状态 | `test_failed` | 测试不合格 | error | `danger` |
| 设备状态 | `in_stock` | 合格入库 | success | `success` |
| 设备状态 | `scrapped` | 已报废 | default | `secondary` |
| 测试判定 | `pass` | 合格 | success | `success` |
| 测试判定 | `fail` | 不合格 | error | `danger` |
| 测试判定 | `pending` | 待判定 | processing | `processing` |
| 测试判定 | `downgraded` | 已降级 | warning | `warning` |
| 测试判定 | `scrapped` | 已报废 | default | `secondary` |
| 返修标记 | `repair` | 返修件 | warning | `warning` |
| 返修标记 | `first_test` | 首测 | default | `secondary` |
| 质检结论 | `qc_pending` | 待质检 | default | `secondary` |
| 质检结论 | `qc_inspecting` | 质检中 | processing | `processing` |
| 质检结论 | `qc_qualified` | 合格放行 | success | `success` |
| 质检结论 | `qc_concession` | 让步接收降级 | warning | `warning` |
| 质检结论 | `qc_rejected` | 拒收 | error | `danger` |
| 检验方式 | `sampling` | 抽检 | default | `secondary` |
| 检验方式 | `full_inspection` | 全检 | processing | `processing` |
| 库存子状态 | `available` | 可用 | success | `success` |
| 库存子状态 | `frozen` | 冻结 | warning | `warning` |
| 库存子状态 | `allocated` | 已分配出货 | processing | `processing` |
| 库存子状态 | `degraded` | 降级品 | warning | `warning` |
| 品质等级 | `good` | 良品 | success | `success` |
| 品质等级 | `degraded_quality` | 降级品 | warning | `warning` |
| 出货单 | `pending` | 待出库 | processing | `processing` |
| 出货单 | `picking` | 拣货中 | processing | `processing` |
| 出货单 | `shipped` | 已发运 | geekblue（强调态） | `geekblue` |
| 出货单 | `partial_shipped` | 部分发运 | warning | `warning` |
| 出货单 | `cancelled` | 已取消 | default | `secondary` |
| 审计·操作结果 | `success` | 成功 | success | `success` |
| 审计·操作结果 | `failed` | 失败 | error | `danger` |
| 审计·敏感标记 | `sensitive` | 敏感操作 | warning | `warning` |
| 审计·风险等级 | `low` | 低风险 | default | `secondary` |
| 审计·风险等级 | `medium` | 中风险 | warning | `warning` |
| 审计·风险等级 | `high` | 高风险 | error | `danger` |

> 库龄预警（正常 / 90–180 天黄 / >180 天红）按 PRD §五·库存 7.6 为**行内文本颜色**，禁止做成 Tag，不进本表；generated 层用 kit token（`--color-status-warning` / `--color-status-danger`）落 CSS 类。

## 逆向、广告与内容批次状态枚举

| 业务域 | 状态值 | 显示文案 | PRD 语义 | kit variant |
| --- | --- | --- | --- | --- |
| RMA 到件 | `pending_arrival` | 待到件 | processing | `processing` |
| RMA 到件 | `arrived_pending_inspection` | 已到件-待检 | warning | `warning` |
| RMA 到件 | `under_inspection` | 检测中 | processing | `processing` |
| RMA 到件 | `inspection_done` | 已检测 | success | `success` |
| RMA 到件 | `closed` | 已关闭 | default | `secondary` |
| RMA 检测结论 | `pending` | 待检测 | default | `secondary` |
| RMA 检测结论 | `repairable` | 可返修 | warning | `warning` |
| RMA 检测结论 | `restockable` | 可二次入库 | success | `success` |
| RMA 检测结论 | `scrap` | 报废 | error | `danger` |
| RMA 裁决 | `pending` | 待裁决 | default | `secondary` |
| RMA 裁决 | `repair` | 返修 | warning | `warning` |
| RMA 裁决 | `restock` | 二次入库 | cyan（强调态） | `cyan` |
| RMA 裁决 | `scrap` | 报废 | default | `secondary` |
| 设备状态 | `rma` | 退货 RMA | warning | `warning` |
| 投放计划 | `draft` | 草稿 | default | `secondary` |
| 投放计划 | `pending_review` | 待审 | warning | `warning` |
| 投放计划 | `active` | 投放中 | processing | `processing` |
| 投放计划 | `paused` | 已暂停 | warning | `warning` |
| 投放计划 | `ended` | 已结束 | success | `success` |
| 投放计划 | `budget_exhausted` | 超预算停投 | error | `danger` |
| 广告对账 | `pending` | 待对账 | default | `secondary` |
| 广告对账 | `processing` | 对账中 | processing | `processing` |
| 广告对账 | `success` | 对平 | success | `success` |
| 广告对账 | `diff_pending` | 差异待处理 | warning | `warning` |
| 广告对账 | `diff_appealed` | 差异已申诉 | processing | `processing` |
| 广告对账 | `closed` | 已核销 | success | `success` |
| 内容排期 | `processing` | 待生效 | processing | `processing` |
| 内容排期 | `success` | 生效中 | success | `success` |
| 内容排期 | `ended` | 已结束 | default | `secondary` |
| 内容排期 | `error` | 冲突待解决 | error | `danger` |
| 内容排期 | `cancelled` | 已取消 | default | `secondary` |
| 内容审批 | `pending` | 待审批 | warning | `warning` |
| 内容审批 | `approved` | 审批通过 | success | `success` |
| 内容审批 | `rejected` | 已驳回 | error | `danger` |
| 内容发布 | `scheduled` | 待生效 | processing | `processing` |
| 内容发布 | `active` | 已生效 | success | `success` |
| 内容发布 | `inactive` | 已下架 | default | `secondary` |

## 非状态维度（§3.1.1，禁用语义色）

- 业务域 Tag 固定映射：生产=geekblue、广告=purple、内容=cyan、平台=default。
- 优先级（P1/P2/P3）用中性灰度阶或纯文本，不占用语义色。
