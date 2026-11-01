# Recipe: Settings Page

## 结构

系统配置模式：

```text
AppShell
└─ PageLayout
   ├─ PageHeader
   ├─ 分类导航（SideNav 或 Tabs，按功能模块 / 影响范围分组）
   ├─ FormSection+（常用项在前，高级设置折叠在后）
   └─ action bar（仅手动保存模式）
```

自服务设置模式：

```text
PageLayout
├─ PageHeader
└─ FormSection+
```

## 生成步骤

1. 先判模式：操作者是管理员且改动影响全局或他人 → 系统配置模式，启用 `rules/settings.md` 的全部配置契约；否则按自服务设置。
2. 按业务语义把配置项分组成多个 `FormSection`；系统配置模式再加分类导航。
3. 每个配置项回显当前生效值；带单位的字段在 label 或输入后缀标注单位。
4. 立即生效的二元项用 `Switch`；需确认后生效的多选用 `CheckboxGroup`；结构化输入（IP / 端口 / Cron）用 `Input` 并挂即时校验。
5. 危险操作接 `ConfirmDialog`。
6. 手动保存模式：页面底部一个 `Button variant="primary"`，离开未保存页面给提醒。

## 窄屏降级

- 分类导航收成 `Tabs`，设置项全部纵向堆叠（沿用 layout rules 的移动端约束）。
- 同屏分栏的实时预览改为提交后回显结果摘要。
- 依赖悬停的提示改为始终可见的行内说明。
