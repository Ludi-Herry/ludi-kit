# Recipe: Table vs DataGrid

| 场景 | 组件 |
| --- | --- |
| 少量只读行，不分页 | `Table` |
| 有分页、排序、选择、批量操作 | `DataGrid` |
| 键值属性 | `DescriptionGrid` |

升级信号：列越来越多、需要批量处理、需要后端分页时，从 `Table` 换成 `DataGrid`。
