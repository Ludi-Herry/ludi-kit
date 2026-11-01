# Recipe: List Page

## 结构

```text
PageLayout
├─ PageHeader
├─ FilterPanel
└─ DataSection
   ├─ DataGrid
   └─ BulkActionBar（有选中项时）
```

## 生成步骤

1. 从 PRD 抽出列表对象、筛选条件、主要操作。
2. 用 `FilterPanel.fields` 表达搜索和筛选。
3. 用 `PageHeader.actions` 放新增等页面级操作，用 `DataSection.toolbar` 放导入、导出、刷新等固定数据区工具。
4. 表格列先放识别字段、状态、时间、操作。
5. 状态列用 `Badge`，操作列用 `Button variant="ghost"`。
6. 需要分页时，用 `Pagination` 传给 `DataGrid.pagination`，不要在业务页手写分页按钮。
7. 开启 `rowSelection` 时，用 `selectedRowKeys` 与 `onSelectionChange` 受控记录选择；选中数量大于 0 后渲染 `BulkActionBar`。
8. 批量危险操作使用 `Button danger` + `ConfirmDialog`，确认文案写清选中数量与后果。
