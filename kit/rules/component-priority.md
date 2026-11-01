# 组件选择顺序

先从项目选择的前端底座中找语义最准确的组件，再决定扩展或新增。

## 选择步骤

1. 读取 `business-context.json > frontendFoundation.outputMode`。
2. 打开该模式对应的组件语义目录。
3. 选择 `useWhen` 命中最准确的组件。
4. 检查 `avoidWhen`、`doNot` 和对口 recipe。
5. 按合同允许的 import roots 导入。

`kit-consumer` 使用 `components.manifest.json`。`library-native` 和 `custom-native` 使用目标 design pack 登记的组件语义与导入入口。

## 何时扩展

现有组件能通过 props、variant 或样式扩展点表达需求时，扩展现有组件。React 使用 `className`，Vue 使用 `class`。

只有现有组件无法覆盖语义、交互或布局，并且真实项目提供复用证据时，才新增组件。

## 第三方底座边界

- `kit-consumer`：业务页面只从 `@ai-readable/kit` 公共入口导入 UI；第三方实现留在 `src/`。
- `library-native`：业务页面直接从合同锁定的第三方运行时和图标包具名导入。
- `custom-native`：业务页面从合同锁定的本地包、workspace export、registry 或项目源码导入。

新增或替换底座能力时，同步更新组件语义目录、示例和 import validator。
