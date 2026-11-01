# Import / Export Flow

## 何时使用

- 文件导入包含选择、校验、处理中、成功、失败时，使用 `ImportFlow`。
- 同步导出使用 `Button` 触发业务下载回调，并在业务页说明导出范围。
- 异步导出出现任务排队、进度、失败重试等真实复用证据后，再提交 feedback promotion。

## 导入状态

`status` 是唯一状态源：`ready → processing → success | error`。网络请求、文件校验与状态迁移由业务页控制；组件负责一致的反馈、可访问语义和操作区。

```tsx
<ImportFlow
  status={status}
  accept=".xml,.xlsx"
  fileName={fileName}
  helpText="单次导入一个文件，处理期间请保持页面打开。"
  validationError={validationError}
  onFileSelect={(file) => setFileName(file?.name ?? "")}
  actions={<Button onClick={submit}>提交导入</Button>}
/>
```

## 导出边界

- 点击前说明当前筛选范围与敏感字段权限。
- 大文件异步导出要反馈任务已创建、查看位置与失败后的下一步。
- kit 当前没有 `ExportFlow`；现有 SA/天枢页面只证明了按钮式导出，继续使用公共 `Button`。

## 禁止

- 组件内部自行上传、轮询或下载。
- 用 Toast 代替完整失败原因。
- 处理中允许重复提交。
