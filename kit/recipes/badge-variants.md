# Recipe: Badge Variants

`Badge` variant 由业务语义决定。

| variant | 用途 |
| --- | --- |
| `success` | 完成、可用、健康 |
| `warning` | 待处理、预警、需关注 |
| `danger` | 错误、阻断、危险 |
| `info` | 中性提示 |
| `processing` | 进行中、处理中 |
| `primary` | 当前、主状态 |
| `secondary` | 次要状态 |
| `geekblue` / `cyan` / `purple` | 项目已定义稳定映射的分类强调态 |

同一业务语义全项目只用一种 variant。

## 业务域文案

当同一组状态值服务不同业务域时，先在页面或生成层建立文案映射，再把语义 variant 传给 `Badge`：

- 文案映射属于**项目层**资产，维护在各项目目录（`projects/<id>/status-copy.md`），kit 层不写死任何业务域的状态枚举。
- 不同业务域即使共享底层状态值，也各自维护自己的显示文案，不互相复用。
- `Badge` 只接收语义 variant；文案差异不产生新的 variant。
- `geekblue` / `cyan` / `purple` 只承载项目层已定义的分类映射，不临时拿来装饰页面。

示例见 `projects/sample-inventory-erp/status-copy.md`（validation-sandbox，仅演示映射结构，不作为业务依据）。
