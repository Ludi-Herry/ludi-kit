# Ops Canvas 跨模态视觉校准提案

状态：`approved`（2026-07-17）

> 现行状态（2026-08-09）：本提案保留为历史实验决策；其 24-pair 扩样完成门已由 [`image2-quality-pivot-2026-08-09.json`](../../../quality/image2-calibration/image2-quality-pivot-2026-08-09.json) 取代。校准冻结在 5/24 qualified + 1 disputed，剩余 19 组暂停。既有 raw diff、Reviewer 记录、阈值与下方历史数字全部原样保留。

## 结论

固定视觉门判定失败；独立人眼评审接受当前页面作为可用的 Image-to-html 语义重建。两套判定在本次工作流的通过结论上发生冲突。现有阈值保持原值，`visual-diff` 阶段继续记为 `failed`。用户已批准语义例外与后续校准实验；实验尚未完成，也未授权任何 gate 变更。

## 真实配对

- Reference：`reference-image.png`，1440×1100，SHA-256 `78f9dc58ac8cb91e9bda70649a3b0402f5b66bd4bc8df5cfdfd8e39cc505618d`
- Candidate：`ops-canvas-image2-full.png`，1440×1100，SHA-256 `fa316c351bc844db8d7cfa23f572bb68e64fc7af99b280b93440222b89ebae86`
- Main metrics：`visual-diff-artifacts/metrics.json`
- Diagnostic metrics：`calibration-diagnostics/metrics.json`
- Heatmap：`visual-diff-artifacts/heatmap.png`

## 固定门结果

| Scope | SSIM / gate | RMS / gate | Changed pixels / gate | Verdict |
| --- | ---: | ---: | ---: | --- |
| Full page | 0.442871 / ≥0.985 | 0.118726 / ≤0.035 | 11.8380% / ≤2.5% | Fail |
| Composite components | 0.330025 / ≥0.990 | 0.127942 / ≤0.025 | 16.9103% / ≤2.5% | Fail |

全图 RMS 为门限的 3.39 倍，变化像素比例为门限的 4.74 倍。关键区 RMS 为门限的 5.12 倍，变化像素比例为门限的 6.76 倍。

## 分区诊断

| Region | SSIM | RMS | Changed pixels |
| --- | ---: | ---: | ---: |
| Rail | 0.401191 | 0.087555 | 6.9587% |
| Header | 0.415810 | 0.126308 | 8.9083% |
| Overview | 0.560273 | 0.166800 | 15.6856% |
| Foundations | 0.451870 | 0.128909 | 17.1411% |
| Base components | 0.514805 | 0.116853 | 11.0270% |
| Composite components | 0.330025 | 0.127942 | 16.9103% |
| Page shell | 0.334928 | 0.131526 | 12.3301% |

## 人眼结论

独立视觉评审结论为 `ACCEPT`，适用口径是可用的语义重建：

- 页面结构、层级、8 个组件角色、关键文案与表格数据完整。
- 浅色语义色、紧凑密度、状态文字和主要操作关系接近参考图。
- 最大残差集中在字体栅格、约 11px 的 shell 横向位移、Composite 内部尺寸和图标造型。
- Foundations 中的 48px spacing、6/10/14/pill radius 与冻结 token 一致，和生成图中的 64px、4/6/10/14 有意不同。

若交付口径要求逐像素高保真，人眼结论同样会判失败。本次冲突出现在工作流需要一个总通过结论，而语义可用性与像素复刻使用了不同验收口径。

## 原因判断

1. 参考图来自图像生成器，文字与细线带有连续像素纹理；浏览器使用确定性的字体栅格和抗锯齿。
2. 冻结合同要求 240px rail，参考图实测约 229px，形成全高位移带。
3. 实现纠正了生成图中偏离冻结 token 的 typography、spacing 和 radius 样例。
4. 全局 luminance SSIM 对文字基线、图标轮廓和 1px 边框位移非常敏感，当前 heatmap 的高差异区域与这些残差一致。

## 建议批准项

建议批准 `semantic-exception-and-calibration`：

1. 保留现有 full-page 与 critical-region 阈值，任何配置文件和 bundle gate 都不修改。
2. 本次 raw `visual-diff` 继续保留 `failed`；决策记录可将本地 Image-to-html 结果标为 `accepted-with-semantic-exception`。
3. 启动独立跨模态校准实验，至少收集 24 组真实 reference/candidate 配对，覆盖低、中、高三档密度；其中至少 12 组人眼接受、12 组人眼拒绝，并由两位评审独立标注。
4. 对保留集计算当前 SSIM、RMS、变化像素以及分区结果。进入下一次阈值决策前，需要人眼一致率 ≥90%、误接受率 ≤5%、误拒绝率 ≤10%。
5. 实验完成后另提一份带保留集结果的新 gate 提案，再进行第二次批准。当前提案不包含任何新阈值。

## 可选决策

- `approve-semantic-exception-and-calibration`：接受当前语义重建，保留 raw diff 失败记录，并批准后续校准实验。推荐。
- `reject-and-iterate-pixel-fidelity`：不接受语义例外，继续针对字体、shell 几何、Composite 密度和图标做像素迭代。

决策落点：`visual-calibration-decision.json`。

## 决策结果

- 决策：`approve-semantic-exception-and-calibration`
- 本地结果：`accepted-with-semantic-exception`
- Raw visual-diff：继续为 `failed`
- 校准实验：`authorized`，完成度 `0/24`
- Gate 变更：未授权
