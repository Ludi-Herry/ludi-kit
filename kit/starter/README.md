# Ludi Design Starter

Starter 验证独立业务项目能从 `@ai-readable/kit` 公共入口导入组件并完成构建。

## 运行

在 `kit/starter/` 执行：

```powershell
npm ci
npm run dev
```

生产构建：

```powershell
npm run build
```

新页面使用 `PageLayout → PageHeader → 业务模块` 的结构。项目页面保留独立路由和业务上下文，不放进组件 showcase。
