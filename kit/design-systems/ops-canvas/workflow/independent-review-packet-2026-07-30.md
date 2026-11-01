# Ops Canvas Image2 独立校准评审包

状态：`ready-for-two-independent-reviews`

配对：`ops-canvas-2026-07-17`

全局校准计数：`2 collected / 1 qualified / 24 required`

## 本轮目标

为已采集的 Ops Canvas reference/candidate 配对补两份正式、互相隔离的独立评审记录。评审只补人工标签，不修改 raw diff、固定阈值、semantic exception、截图或既有验收表。

2026-07-17 的实现方自评和旧视觉意见不计本轮独立名额。两名 reviewer 必须对冻结输入重新盲标。

## 冻结输入

两位 reviewer 必须使用同一组文件，按 1440×1100、100% 缩放查看：

| 输入 | 路径 | SHA-256 |
| --- | --- | --- |
| Reference | `design-systems/ops-canvas/workflow/reference-image.png` | `78f9dc58ac8cb91e9bda70649a3b0402f5b66bd4bc8df5cfdfd8e39cc505618d` |
| Candidate | `output/playwright/ops-canvas-image2-full.png` | `fa316c351bc844db8d7cfa23f572bb68e64fc7af99b280b93440222b89ebae86` |
| Browser/interaction evidence | `design-systems/ops-canvas/workflow/browser-evidence.json` | `21166f062a283ef4d8a819014ad8fb7c53e0d6361ab3d05f28ceaa272995d55e` |
| Machine metrics | `design-systems/ops-canvas/workflow/visual-diff-artifacts/metrics.json` | `715daf74376b3bd3051149a3fd51cbf4954decb57f829ac9115c7145a91961cb` |
| Heatmap | `design-systems/ops-canvas/workflow/visual-diff-artifacts/heatmap.png` | `48ac5252e92c1ae89c1d1e95fd86fb695bcfe1d117e293f8d98a0dc51d03f470` |

## 独立性要求

每位 reviewer 必须同时满足：

1. 没有参与 reference prompt、页面实现、截图生成、diff 脚本或本配对既有决策；
2. 提交前看不到另一位 reviewer 的标签和理由；
3. 冻结人工标签前不查看 machine metrics、heatmap、旧 calibration proposal 或 decision；
4. 使用唯一 reviewer ID，并明确记录独立性声明；
5. 自己观察 Reference 与 Candidate，不引用实现方结论替代判断。

任一项不满足，该记录只作补充意见，不计 qualified。

## 评审顺序

1. 只打开 Reference 与 Candidate，全图同尺寸并排查看。
2. 检查页面任务结构：左侧导航、顶部产品标题与主题切换、概览 CTA 与统计、Foundations、Base components、Composite components、Page shell contract。
3. 检查关键语义：42/08/02 指标、颜色/字阶/间距/圆角样例、按钮/Badge/Input/Card、指标卡、筛选器、工单表格与壳层尺寸。
4. 检查可读性与误导风险：文字、状态、列关系、主次层级、遮挡、截断和视觉噪音。
5. 冻结 `calibrationLabel`、语义结论、像素保真结论和理由。
6. 再读 Browser/interaction evidence，记录它是否支持相同任务；不得据此改写已经冻结的视觉标签。
7. 最后查看 metrics 与 heatmap，记录机器结果是否符合预期；raw verdict 保持原值。

## 标签口径

- `calibrationLabel: accepted`：Candidate 保留相同任务、信息结构、关键状态和操作层级，没有会误导或阻断使用的视觉问题。允许字体栅格、轻微几何和装饰细节差异。
- `calibrationLabel: rejected`：缺失或错置关键结构、状态或操作，存在不可读、遮挡、强误导，或用户无法完成 Reference 表达的同一任务。
- `pixelFidelityVerdict` 单独填写 `accepted` / `rejected`；它不覆盖 `calibrationLabel`。
- `confidence` 使用 `high` / `medium` / `low`；低置信度必须写明不确定来源。

## 每位 reviewer 的返回格式

每位 reviewer 返回一份完整 JSON，由主线程保存至：

`design-systems/ops-canvas/workflow/reviews/ops-canvas-2026-07-17.<reviewer-id>.json`

```json
{
  "version": "1.0.0",
  "pairId": "ops-canvas-2026-07-17",
  "reviewerId": "FILL_UNIQUE_REVIEWER_ID",
  "reviewedAt": "FILL_ISO_8601_TIMESTAMP",
  "independence": {
    "participatedInImplementationOrEvidence": false,
    "sawOtherReviewerDecisionBeforeSubmission": false,
    "sawMachineMetricsBeforeFreezingLabel": false,
    "statement": "I reviewed the frozen reference and candidate independently."
  },
  "inputs": {
    "referenceSha256": "78f9dc58ac8cb91e9bda70649a3b0402f5b66bd4bc8df5cfdfd8e39cc505618d",
    "candidateSha256": "fa316c351bc844db8d7cfa23f572bb68e64fc7af99b280b93440222b89ebae86"
  },
  "calibrationLabel": "FILL_accepted_OR_rejected",
  "semanticVerdict": "FILL_accepted_OR_rejected",
  "pixelFidelityVerdict": "FILL_accepted_OR_rejected",
  "interactionEvidenceSupportsTask": "FILL_yes_OR_no",
  "blockingFindings": [],
  "reasonCodes": [
    "FILL_SHORT_STABLE_REASON_CODE"
  ],
  "rationale": "FILL_CONCISE_EVIDENCE_BASED_REASON",
  "confidence": "FILL_high_OR_medium_OR_low",
  "machineResultMatchedExpectation": "FILL_yes_OR_no_AFTER_LABEL_FREEZE"
}
```

## 计数与回写条件

- 两份记录都通过独立性和输入哈希检查后，本配对才具备完整人工证据。
- 两位 reviewer 标签一致时，配对进入 accepted 或 rejected 配额，并将全局计数从 `1 qualified` 更新为 `2 qualified`。
- 标签冲突时登记为 `reviewed-disputed`，不进入 accepted/rejected 配额；保留原始记录，等待单独裁决。
- 回写必须保留 `machineVerdict: failed`、`rawGateOverride: false`、固定阈值和 `gateChangeAuthorized: false`。
- 本配对完成后仍需继续收集其余 22 对，并满足两名独立 reviewer、人眼一致率 ≥90%、误接受率 ≤5%、误拒绝率 ≤10%，才能另提 gate 决策。
