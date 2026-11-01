# Recipe: Form Page

## 结构

```text
PageLayout
├─ PageHeader
├─ Stepper? 
├─ FormSection*
└─ action bar
```

## 生成步骤

1. 按业务分组字段，生成多个 `FormSection`。
2. 单行字段用 `Input`，长文本用 `Textarea`，枚举用 `Select`。
3. 有任务依赖或明确阶段的流程加 `Stepper`；独立字段优先分组，按 `rules/form.md` 判断。
4. 主操作用一个 `Button variant="primary"`。

设置型表单（自服务设置 / 系统配置）另见 [settings-page.md](./settings-page.md) 与 `rules/settings.md`。
