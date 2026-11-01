# Recipe: Detail Page

## 结构

```text
PageLayout
├─ DetailHeader
├─ DescriptionGrid
└─ Tabs
   ├─ Overview
   ├─ Activity
   └─ Settings / Records
```

## 生成步骤

1. `DetailHeader` 放实体名称、状态、主操作。
2. `DescriptionGrid` 放稳定属性。
3. `Tabs` 放可切换分区。
4. 少量记录用 `Table`，复杂记录用 `DataSection > DataGrid`。
