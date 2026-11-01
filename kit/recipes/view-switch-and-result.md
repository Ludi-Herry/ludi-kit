# 视图切换与结果页（antd native）

## 适用场景

- 同一份内容换视角或换筛选范围（如"全部设备 / 运行异常 / 售后中"），2–5 个互斥选项，原地更新：用 `Segmented`。
- 内容本身不同、各自有操作与加载状态的并列分区：用 `Tabs`。
- 整页级结果：无权限、对象不存在、提交成功或失败，并给出下一步：用 `Result`。
- 区块或列表内暂无数据：用 `Empty`；短暂反馈用 `message`，内嵌提示用 `Alert`。

## 边界

- `Segmented` 不做导航，也不做表单字段；选项多或标签长时改用 `Select`。
- `Result` 只占整页或整块主区域，不放进表格、卡片内部。
- 未开放功能页按真实产品写权限说明与返回路径，不写"即将上线""演示"之类字眼。

冻结参考与决策卡见 `foundations/knowledge/antd-6.5.0` 的 ui-coverage 扩展（`decision-cards.ui-coverage.json`）。
