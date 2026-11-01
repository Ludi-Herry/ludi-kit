# T1 B 界面实现说明（2026-09-30）

PLAN §5 B 批，合同 `kit/preview/EDITOR-PROTOCOL.md` v1。本文只记事实、证据与缺口；technical 只报命令原始结果，codeReview / visual = pending-owner-review。

## 交付文件（全部在授权范围内）

新建 `kit/preview/src/editor/`：

- `api.ts` — 协议类型（Bootstrap / Candidates / Patch / 错误信封）与 fetch 客户端；sessionToken 存内存、`X-Ludi-Session` 头；同 id 重试由服务端幂等兜底、客户端 `requestId=crypto.randomUUID()`；`findFileSha` 用 bootstrap.files 精确匹配、后缀唯一兜底；`themePatchFiles` 定位 theme.ts 与 generated/styles.css。
- `theme-rules.ts` — WCAG 相对亮度对比度（白字 ≥ 4.5:1，与服务端同语义）；不达标计算最近合规色（按亮度线性调暗，首个合规 hex 作 suggestedValue）；三档数值阶梯与夹回；`tokenRules` 未知形状时容忍解析并显式记录回退。
- `theme-apply.ts` — 子端只内存改 imported `deviceOpsTheme`：六值写入 token；components overrides 只绑两类可证明关系（同名字段、原值与某 token 原值完全相等的别名，如 Layout.bodyBg↔colorBgBase）；其余字段不动。`--do-primary/--do-bg/--do-surface` 同步到 `:root` 与 `.device-ops-shell`，clear 时逐字段恢复快照并移除内联变量。`--do-border/--do-text` 等无对应六值的不动。
- `bridge.ts` — 信封 `{channel:"ludi-editor",version:1,projectId,type,payload}`；`targetOrigin=location.origin`，父侧校验 `event.origin===location.origin` 且 `event.source===当前 iframe.contentWindow`，子侧校验 origin 且 `source===window.parent`；`parseLocAttr` 解析 `data-ludi-loc="文件:行:列"` 末尾两段。
- `DeviceOpsEditorBridge.tsx` — 小豆盒子端（仅 `?editor=1` 挂载，普通小豆盒不接收消息）：ready/theme-preview/clear-preview/selection-mode/component-selected/bridge-error；selection 用 window 捕获阶段拦截点击并 stopPropagation（先于 app.tsx 的 document 捕获导航）；命中 `[data-ludi-loc]` 高亮并上报，未命中显式上报 LOCATE_FAILED。
- `matrix/MatrixView.tsx` + `matrix.css` — `/editor/matrix?component=X&editor=1`；9 个 P0 组件各自矩阵（Button/Input/Select 为 变体×尺寸 + 状态；Tag/Table/Alert/Modal/Drawer/Popconfirm 为 变体/尺寸/状态 按各自 API 能力铺开，Modal/Drawer 用 `getContainer={false}` 内嵌、Popconfirm 用 open 静态展示）；antd 6.5.0 尺寸值为 large/medium/small（与知识包 component-reference 核对）。
- `EditorApp.tsx` — 入口分发：矩阵 route lazy 独立 chunk；外壳 `ConfigProvider prefixCls="ludi"` + 独立中性主题 + `cssVar:{key:"ludi"}` + `hashed:false`。
- `EditorShell.tsx` — 三栏骨架、两表面路由（/editor 与 /editor/page?route=..，pushState+popstate）；bootstrap 装载与显式错误态；草稿 180ms 去抖推主题；patch 202 后轮询 `GET /__ludi/patch/:id`（1.2s，6 分钟超时显式记录）；终态后刷新 bootstrap 并重载 iframe；撤销仅限最近未撤销且终态的 Patch；候选的 unmappedProps 逐项确认后才写入。
- `Inspector.tsx` — 检查器「属性 / 规则」两页签 + 底部动作条；Patch 记录含前后 SHA、diff 文件、规则、逐项检查 status/exitCode/stdout/stderr/screenshots 原文，`technical` 原始值直显，`codeReview`/`visual` 显示 pending-owner-review。
- `TokenEditor.tsx` — 六值五组控件；数值越界夹回并短闪（CSS animation），不弹错误；ColorPicker(hex, showText)。
- `state.ts` — 壳层 UI 状态类型；`editor.css` — `--ludi-*` 变量与全部外壳样式；`bridge-highlight.css` — 子端高亮相随 PreviewApp chunk 加载。

修改：

- `src/main.tsx` — 按路由拆分 lazy：/editor* 走 EditorApp；既有 Lab 走 lazy PreviewApp，入口行为不变。
- `src/PreviewApp.tsx` — `import "./styles.css"` 从 main.tsx 移入本文件末尾（仍在全部组件/项目 import 之后，CSS 相对顺序不变）；`/device-ops*` 在 `?editor=1` 时挂 `DeviceOpsEditorBridge`，普通访问不挂。
- `preview/README.md` — 新增 T1 入口说明。

未改：`vite.config.ts`、`package.json`/lock、`editor-server/**`、小豆盒源码、根 kit 与 PLAN（A 与主线程文件；git status 中它们的改动来自 A/主线程）。

## 关键技术取证

DeviceOpsApp 内部自带 `ConfigProvider theme={deviceOpsTheme}`。为贯彻落实「真正覆盖而不是只包外层」：

1. 引用不变的 children 元素会被 React 跳过重渲染，因此 bridge 自渲染 `<DeviceOpsApp />`。
2. antd `useTheme`（node_modules/antd/es/config-provider/hooks/useTheme.js）的记忆比较器是 `(prev,next)=>prev.some((p,i)=>!isEqual(p,next[i],true))`；`@rc-component/util isEqual` 第一行 `a===b→true`，即同引用对象原地改后比较仍判等、memo 不更新。因此每次草稿生效用 `key={revision}` 卸载重建 ConfigProvider，保证读到新值（矩阵同法）。`deviceOpsStore` 为模块级，remount 不丢数据；页面组件态会随 remount 重置，属已知取舍。
3. components overrides 绑定规则打印自当前源码即可复核：Button.controlHeight/borderRadius（同名）、Menu.itemBorderRadius=6=borderRadius、Layout.bodyBg=#f6f8fb=colorBgBase、Layout.headerBg/siderBg=#ffffff=colorBgContainer；Table.headerBg=#f8fafc 不匹配任何六值，保持不动。

## Checks（原始结果，不自评）

- `cd kit/preview && npx tsc --noEmit` → 输出为空，`tsc_exit=0`（最后一轮 19.078s）。其实现期间首轮报 5 个错误（相对路径少上一级 3 处、CSS 变量对联合类型 2 处），修掉后两轮通过。
- antd 版本核对（kit/ 下执行）：
  - `npm exec --offline -- antd list --version 6.5.0 --format json` → 71 组件，ColorPicker/Segmented/Tabs/Slider/InputNumber/Tooltip/Empty/Spin/Checkbox 均在场。
  - `antd info ColorPicker --version 6.5.0 --format json` → value/onChange/onChangeComplete/showText/format 可用。
  - 知识包 `foundations/knowledge/antd-6.5.0/component-reference/{Button,Select,Input,Table,Tag,Alert,Modal,Drawer,Popconfirm}.json`：size 均为 `large|medium|small`（Table 默认 large）；Popconfirm 6.5.0 未 deprecated；Modal/Drawer 有 `getContainer`、`loading`。
- node `antd@6.5.0`、`@ant-design/icons@6.3.2`（kit lockfile 既有，未安装任何东西）。
- 文案红线：`rg "演示|示例|样例|概念|模拟|Demo|Sample" kit/preview/src/editor` → 无匹配。

## 未验证项与缺口（等 A/C）

1. A 后端在收尾中（editor-server/ 现已存在），所有 `/__ludi/*` 实际响应未验证；B 对以下协议未钉死处做了显式容忍并在界面记录：
   - `bootstrap.tokenRules` 形状未知 → 容忍解析多种形状，解析失败显式记录「按 antd 默认阶梯预检，服务端为最终判据」；
   - `bootstrap.theme` 缺字段 → 回退 antd 默认并记录 `BOOTSTRAP_THEME_INCOMPLETE`；
   - `undo` 返回体未固定 → 同时接受完整 Patch 或 `{patchId}` 再拉全量；
   - loc.file 与 bootstrap.files 路径口径 → 精确匹配优先、后缀唯一兜底，匹配不到显式提示不发请求；
   - `components` 字段形状未钉死 → 界面 P0 目录用固定九项，不依赖该字段。
2. 未起任何服务与浏览器（5393 留给 C）；端到端运行证据（协议 §6 八项）全部等 C。`npm run build` 未跑（只占检查要求的 tsc；避免改写共享 dist）。
3. 已知取舍：iframe 内 SPA 导航后 query 中 `editor=1` 丢失但不影响已挂载桥接（不再整页加载）；草稿 remount 重置页面组件态；selection 只拦 click 不拦键盘交互；父层高亮在 iframe 滚动后可能漂移（子层独立高亮为准）；如果 dev server 重启，旧 sessionToken 的写操作会收到 INVALID_SESSION，刷新页面重新连接即可（界面显示原始 error）。
4. 视觉与代码评审：pending-owner-review。本说明不构成 GO 判定。

## 临时文件

本轮未创建临时文件/临时目录；`npx tsc --noEmit` 未修改 `preview/tsconfig.tsbuildinfo`（git status 未见其变化）。无需清理项。

## 视觉重做（2026-10-01，参考 DS Manager）

只换外壳的信息架构与视觉，写回协议、桥接消息、点选逻辑不变。上文对界面形态的描述（左栏 Token、检查器「属性 / 规则」与底部动作条）以本节为准：

- 顶栏：产品名 + 项目、撤销（图标按钮，`aria-label="撤销最近一次写入"`）、状态点与文字、黑色主按钮「写入项目」。
- 左导航 240px：系统（概览 / 颜色 / 字号 / 圆角 / 密度）、组件（P0 九个）、检查（页面检查入口，进入后出现路由下拉）；底部「当前选中」。
- 中栏：顶条（分区名 + 摘要）；系统分区有「规范 / 应用到项目」切换，规范是 Token 卡片，应用到项目是小豆盒 iframe 加路由页签；组件分区是矩阵 iframe。
- 右栏 280px：「样式 / 规则 / 记录」。样式页签按分区分组显示 Token 控件（概览与组件显示全部分组），页面检查时显示组件 / 源码位置 / 可替换候选 / 规则。写入后自动切到「记录」查看检查进度。
- 新增文件：`Nav.tsx`、`nav-data.ts`（目录数据，文件名不能与 Nav.tsx 仅大小写不同）、`SpecView.tsx`、`spec-data.ts`（派生 Token 交给 antd `theme.getDesignToken`，对比度复用 `theme-rules.ts`）。
- 页面检查高亮：由小豆盒 iframe 内的桥接元素绘制（1.5px 蓝色描边 + 组件名标签，`bridge-highlight.css` 与 `DeviceOpsEditorBridge.tsx` 的 `showLocalHighlight`）；外壳不再叠加第二层高亮。
- Patch 轮询：单次失败不停止，连续 3 次失败才停止并把该记录显示为「状态未知，请刷新确认」（`PatchEntry.unknown`），同时释放写入锁，不标成通过或失败。
