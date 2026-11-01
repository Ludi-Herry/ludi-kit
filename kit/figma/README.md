# Figma alignment layer

这个目录维护代码组件、Token 与 Figma 资产之间的身份和语义映射。当前 workflow 状态从 [`../workflows.manifest.json`](../workflows.manifest.json) 读取，live readback 和截图证据从 `evidence/` 与目标范围合同读取。

## 文件职责

- `component-map.json`：Figma 组件名到代码组件、公共 props、导入入口和示例。
- `variables-map.json`：Figma variable path 到代码 Token 与 CSS variable。
- `variants-map.json`：Figma variant property 到完整公共 props 对象。

## 修改映射

1. 修改 `components.manifest.json` 或 `tokens.manifest.json` 后运行 `npm run sync:figma`。
2. 运行 `npm run validate:figma`。
3. 真实 Library 使用 published component `key` 作为稳定身份；`nodeId` 只作为文件内定位。
4. component set 和 variant 分别登记身份。
5. 业务生成代码按项目的 `frontendFoundation.outputMode` 使用对应导入边界。

团队协作、key 迁移、语义文档和 snapshot diff 规则见 [Figma 资产共创与维护约定](../../docs/Figma资产共创与维护约定.md)。

## Live audit

需要：

- 可访问的 `fileKey`。
- 精确 page、frame、component set 或 node。
- 只读、创建、修改或发布中的最小权限范围。

顺序：

1. 只读目标页面和节点。
2. 解析 published component set 身份和精确属性。
3. 对照 `component-map.json` 与 `variants-map.json` 的公共 props。
4. 记录经过验证的标识，运行 `npm run validate:figma`。
5. 未匹配的设计侧属性保持显式，不用猜测值填补。

## 绑定规则

- 代码组件名是稳定合同。
- Figma 名称可以分组或本地化。
- 每个 variant value 映射到完整公共 props 对象。
- Token 值由 CSS 和 Token manifest 维护，映射层只记录语义对应。
- 缺少 Figma node ID 可以保持显式阻塞；缺少组件或 Token 映射会让验证失败。
