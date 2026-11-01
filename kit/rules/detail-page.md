# Detail Page Rules

## 结构

详情页用 `DetailHeader → DescriptionGrid → Tabs`。

## 选型

- 实体名称、状态、主操作：`DetailHeader`
- 只读属性：`DescriptionGrid`
- 分区内容：`Tabs`
- 分区小表：`Table`
- 分区大数据：`DataSection > DataGrid`

## 禁令

- 不要把详情页套成列表页。
- 不要用 `DataGrid` 展示少量键值信息。
- 不要在详情页重复放多个页面级标题。
