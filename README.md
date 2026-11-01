# Ludi Design Kit

用 AI 生成 B 端前端页面的完整工具包：设计规则、组件、页面生成器、可视化编辑器、验收器和工程导出。

这个仓库公开供测试，但没有开源许可证，保留所有权利。可以下载、运行和反馈，不能重新发布或用于商业项目。详见 [测试条款](./TEST-TERMS.md) 和 [第三方声明](./THIRD-PARTY-NOTICES.md)。

## 快速开始

需要 Node.js 20.19+ 或 22.12+，以及 npm 10+。

```sh
cd kit
npm ci --ignore-scripts
npm run build
npm --prefix preview ci --ignore-scripts
npm run check:all
```

`check:all` 全部通过，说明环境没问题。然后启动预览：

```sh
cd preview
npm run dev
```

终端会打印实际地址。打开后可以看：

- 首页：项目、组件库和页面样例
- `/editor`：可视化编辑器
- `/device-ops`：小豆盒设备运营示范项目
- `/tianshu/dashboard`：运营平台示范项目

接下来按 [测试清单](./TESTING.md) 逐项测试。

## 目录

| 位置 | 内容 |
| --- | --- |
| `kit/src/` | 组件、图表、交互基础和主题 |
| `kit/rules/`、`kit/recipes/` | 设计规则和页面装配方法 |
| `kit/generator/`、`kit/scripts/` | 页面生成器和各类命令 |
| `kit/preview/` | 预览站和可视化编辑器 |
| `kit/harness/` | 代码验收器 |
| `kit/foundations/` | 多底座适配和设计包 |
| `kit/projects/` | 示范项目 |
| `kit/skills/`、`kit/visual-diff/` | Image2 工作流和视觉差异工具 |
| `docs/` | 工作流路由和交付合同 |

## 范围

本仓库不包含内部验收历史、部分内部项目、AI 产品知识包和真实 Figma 文件标识。AI 产品知识包的版权来源尚未审核，所以没有公开。

`npm run validate` 只跑能验证功能的检查。`package.json` 里其他 `validate:*`、`test:*` 命令有一部分要读内部历史，在这里失败属于已知情况，不用反馈。完整的已知限制见 [测试清单](./TESTING.md)。
