# Status Copy Map（validation-sandbox）

> 本项目是 `validation-sandbox`，此映射表仅演示「项目层文案映射」的结构，供管线验证和 harness 验收使用。它由 fb-20260707-001 从 kit 级规则降级而来，不作为任何真实业务的文案依据。

同一组底层状态值在不同业务域显示不同文案，语义 variant 保持稳定：

| 业务域 | 状态值 | 显示文案 | variant |
| --- | --- | --- | --- |
| 权限 | `active` | 启用 | `success` |
| 权限 | `review` | 复核中 | `warning` |
| 权限 | `risk` | 风险 | `danger` |
| 库存 | `healthy` | 充足 | `success` |
| 库存 | `low` | 偏低 | `warning` |
| 库存 | `risk` | 风险 | `danger` |

生成本项目权限页时，状态列显示 `启用 / 复核中 / 风险`，不复用库存页的 `充足 / 偏低 / 风险` 文案。通用原则见 `../../recipes/badge-variants.md` 与 `../../rules/anti-patterns.md`。
