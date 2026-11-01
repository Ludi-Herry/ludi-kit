# Ludi Design 产品官网

正式入口：<http://127.0.0.1:5403/>。当前为本地可交互版本，视觉等待 Owner 验收，未公开部署。

用户已选择「产品舞台」。主线为 AI 界面质量、页面秩序、设计与实现对齐及跨组件库适配；编辑器作为辅助操作展示。

## 运行与构建

在 `<local-path-omitted>` 执行，复用 `preview/node_modules`，无需新增安装：

```powershell
node preview/node_modules/vite/bin/vite.js --config preview/website/vite.config.mjs
node preview/node_modules/vite/bin/vite.js build --config preview/website/vite.config.mjs
```

服务器固定回环地址与端口，端口被占用时直接报错；不要启动第二个实例或自动跳其他端口。

```powershell
node preview/website/scripts/check-website.mjs
```

检查证据采用 `evidence/formal-check-<timestamp>/`。旧初稿证据保持原样，只证明初稿时的状态。

## 素材与内容边界

`public/media/product-*.png` 是当前天枢业务页面截图。`editor-*.png` 是辅助编辑器截图。官网播放 `editor-demo-short.webm`，23.8 秒，原始视频与裁切记录分别保留。

视频只展示页面、颜色与按钮组件导航，未执行项目写入。规则前后、跨底座适配和参数联动均为明确标注的官网示意。实际跨底座整页视觉一致性仍需人工验收。

体验入口依赖已有本地产品服务 `5393`；官网本身通过 `5403` 独立运行，图片和视频不依赖产品服务在线。

合同与 design pack 在写源码前核验；修改 pack 后必须更新 `business-context.json` 的 SHA-256。正文由 AGY 文案路由生成、主线程核对，请求与响应在 `evidence/`。

设计研究与事故记录：[官网研究](../../../docs/ANALYSIS-产品宣传官网研究-2026-10-10.md)。所有截图、模型回执、原失败和验收记录作为证据保留；未创建一次性临时文件。
