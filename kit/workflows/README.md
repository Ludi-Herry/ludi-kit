# Workflow registry

[`../workflows.manifest.json`](../workflows.manifest.json) 是 canonical workflow 的机器权威来源。每条 workflow 维护输入、路由、产物、验收、证据、完成状态和用户交付方式。

## 查当前状态

读取目标 workflow 的：

- `completion.status` 与 `completion.remaining`
- `handoff.target`
- `handoff.open`
- `handoff.blockedDelivery`

人类路由说明见 [`../../docs/WORKFLOW-ROUTING.md`](../../docs/WORKFLOW-ROUTING.md)，交付规则见 [`../../docs/WORKFLOW-DELIVERABLES.md`](../../docs/WORKFLOW-DELIVERABLES.md)。这些页面不保存 manifest 字段的完整副本。

## 验证

从 `kit/` 运行：

```powershell
npm run validate:workflows
npm run validate:workflow-events
```

validator 检查 schema、canonical ID、路径引用、完成状态、handoff 和正反 fixture。workflow run 在 stage、attempt 和决策点追加 `events.jsonl`；closeout 前验证事件流，再写 `run.final.json`。

## 证据边界

Figma evidence、workflow evidence 和项目 evidence 保持各自职责。缺少外部目标、权限或输入时，使用明确阻塞状态，并让未知标识保持 `null`。
