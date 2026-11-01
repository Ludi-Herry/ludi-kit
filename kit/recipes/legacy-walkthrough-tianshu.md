# legacy 走查要点（天枢原型版）（草案）

适用：T6/T7 链路对 `<local-path-omitted>` 合成旧产品的读码、延展与验收。这是草案，不注册 canonical workflow。背景与读取顺序见 [legacy-source-baseline.md](legacy-source-baseline.md)；老项目内部写法以 `legacy/docs/legacy-profile.md` 正式版为准。

## 走查心法

走查目标是「读懂它怎么写，按它的写法延伸」，不是评判它写得好不好。不顺眼的写法记入 legacy-profile 的「已知异味」，不逐行改写老代码；只有骨架确实放不下新需求时才停下来升级。

## 读码定位清单

按顺序走：README（启动、端口、验收入口）→ `docs/source-map.json`（路由 ↔ Figma 参考图映射与哈希）→ `docs/legacy-profile.md`（写法说明，带文件:行）→ `src/domain/pages.js`（groups + 每页 columns/filters/form/actions，页面差异的唯一事实源）→ 候选用法（`src/views/resource/index.vue`、`src/mixins/list-page.js`、`src/mock/database.js`）→ `evidence/`（验收记录、失败件）。实际文件与测试是权威，说明文档不代替运行结果。

## 验收必须核对的习惯点

- 权限双层：UI 按 `canWrite`/`canDelete` **隐藏**按钮，mock adapter 凭 `X-Role` 二次拦截；两层都要受验，缺一不可。
- 状态转移走 `db.transition` 动作字典，禁止在页面里直接改数据；新增动作时 UI 词表与 mock 字典两处同步。
- 新页面字段必须进入 columns/filters/form 白名单，否则 seed 会静默丢弃字段（`src/mock/seed.js` allowed 集合）。
- 空态与故障路径（`?state=empty/error`）必须与正常态一起验收。
- Element UI 固定列会复制整表 DOM：行计数、按钮定位断言必须锚定 `.el-table__body-wrapper`，否则遇到双 DOM 假断言。
- dev 固定端口 5396 strictPort；浏览器证据用独立 headless 上下文（`scripts/browser-check.mjs` / `scripts/extend-check.mjs` 模式），不污染用户预览数据。

## T6 执行记录入口

2026-10-05 延展三页（全部设备/设备详情/告警处置）：断言与截图存本仓 `kit/workflows/evidence/legacy-extend-2026-10-05/` 与 `legacy/evidence/extend-t6/`，交回文件 `kit/preview/editor-dispatch/G-legacy-t6-outcome-2026-10-05.md`。
