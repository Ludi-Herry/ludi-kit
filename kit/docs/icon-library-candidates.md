# 图标库候选与启用规则

本页记录选型维度和启用边界。候选的机器档案由 `foundations/catalog.json` 维护；项目选中的包名、准确版本、许可证和图标策略由该项目的 `business-context.json > frontendFoundation` 维护。

## 候选方向

| 图标库 | 适用场景 | 主要约束 |
| --- | --- | --- |
| [Ant Design Icons](https://ant.design/components/icon/) | Ant Design 后台与管理端 | 与 Ant Design 版本和语义保持一致 |
| [Lucide](https://lucide.dev/) | 中性 Web 产品 | 同项目保持统一描边规格 |
| [Tabler Icons](https://tabler.io/icons) | 工业、设备和复杂业务 | 启用前核对领域覆盖与包体 |
| [Phosphor Icons](https://github.com/phosphor-icons/react) | 消费和内容产品 | 项目内冻结单一权重策略 |
| [Hugeicons Free](https://www.npmjs.com/package/%40hugeicons/react) | 长尾领域图标补缺 | 只使用经过许可证审查的 Free 资产 |
| [Remix Icon](https://github.com/Remix-Design/remixicon/blob/master/License) | 需要 line/fill 成对表达的移动端 | 启用前复核再分发与品牌用途限制 |
| [Lucide Animated](https://lucide-animated.com/) | 已选择 Lucide 项目的受控动效 | 必须提供静态和 reduced-motion 回退 |

## 选择步骤

1. 先检查项目已有 Figma Library、品牌资产和组件库。
2. 用真实页面列出常用操作、状态和领域对象。
3. 选一套静态通用图库，替换少量真实图标验证语义、视觉和 bundle。
4. 记录精确包、版本、许可证、来源、视觉规格和复核日期。
5. 把选择写入项目 `frontendFoundation`，再安装依赖。

## 启用边界

- 一个项目只启用一套静态通用图库。
- Logo、品牌标识和核心领域图标保持项目资产。
- 动态图标提供 `prefers-reduced-motion` 静态回退；触屏状态不能只靠 hover。
- 使用具名导入，禁止 namespace 全量导入、动态名称映射和运行时整包检索。
- `kit-consumer` 页面从 `@ai-readable/kit` 获取图标组件。
- `library-native` 和 `custom-native` 页面按项目合同使用锁定入口。
- 候选库未被项目选中时，不安装、不打包。
