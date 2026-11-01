# 组件库编辑器 P0 接口协议 v1

2026-09-30；主线程编写。依据 `../../docs/PLAN-组件库编辑器P0-2026-09-30.md` 与 Owner 本轮补充。A、B 必须按此对接；需要改协议时先交主线程。只服务天枢 `tianshu-device-ops`，只在 Vite dev 开启，监听 `127.0.0.1:5393`。

## 文件所有权与判定

- 主线程：本协议、派工材料、PLAN 结果节；最终全量检查与精确本地提交。
- A：`preview/editor-server/**`、`preview/vite.config.ts`、`preview/package.json` 与该目录 lockfile。实现 API、定位、AST 写回、检查与撤销、临时副本单元测试。不得改 B 文件或永久改天枢源码。
- B：`preview/src/editor/**`、`preview/src/PreviewApp.tsx`、`preview/src/main.tsx`、`preview/README.md`。实现 UI、矩阵、桥接；不得改 A 文件或天枢源码。
- C：`preview/editor-acceptance/**` 与 `projects/tianshu-device-ops/evidence/editor/**`。只运行并记录端到端检查；验收期间通过 API 写回并撤销天枢，不自行改 A/B 实现。主线程负责检查回读。
- 代码核对由 Owner 在另一个只读模型会话完成（Qwen 3.8 Flash 或 GLM 5.3 Flash）；视觉签收由 Owner 完成。所有执行者只报原始检查结果，独立代码/视觉 verdict 均为 `pending-owner-review`。
- 同一问题两轮修不好、发现 P1、必须写分配范围外文件：立即停止，不转给另一模型继续修，不扩大范围，不声明完成。
- Owner 已在本聊天批准：原样运行既有全量 `npm run validate`，允许其自身临时产物创建与清理（含现有 kit 内 `.tmp-*` 路径）。该例外不授权修改检查脚本、阈值、历史证据或其他链路文件；新写的测试临时文件仍放 `%TEMP%/agent-*`。

## 共通格式

JSON；`version: 1`，`projectId: "tianshu-device-ops"`。文件路径一律相对 kit 根、正斜杠，例如 `projects/tianshu-device-ops/generated/DeviceListPage.tsx`；`loc = { file, line, column, component }`，行从 1、列从 0 起。服务端必须重新解析源码校验定位、候选、Hash 与规则，客户端材料不能授予写入权。

成功：`{ ok: true, data: T }`。失败：`{ ok: false, error: { code, message, details? } }`。不得含密钥、系统配置、机器或网络身份数据。

## HTTP API

仅 dev 注册。`/__ludi/*` 不启用 CORS，不接受跨源写请求；写入必须为同源 `Origin`、合法 Host、JSON 与当前启动的 sessionToken（由 bootstrap 返回，放内存，头 `X-Ludi-Session`）。拒绝非回环访问、路径穿越、绝对路径、符号链接越界、额外字段与超大 body；不能接受任意代码、命令或任意文件内容。检查命令为固定白名单，不由请求传入。

1. `GET /__ludi/bootstrap`

   返回 `{ version, projectId, sessionToken, theme, files, routes, components, componentTokens, componentDefaults, tokenRules, foundations }`。

   `files: [{file, sha256}]`；`routes: [{id, route, path, title}]`，path 是可打开的 `/device-ops/...`，动态参数取真实本地种子数据。以现有 `pages.json`/app 登记为准（当前实现登记 14 项，PLAN 的 12 页差异原样记录，不删除已有页）。

   `componentTokens`（2026-10-02 增补，L1）：`{[组件]: {[token]: {value, status, global}}}`，服务端从 `theme.ts` `components.*` 源码读出的每个已写组件项；`global` 为与全局的同步对应（同名 token 或同义词，无对应为 `null`），`status` 为 `following`（源码值等于当前全局有效值，L0 写回继续同步）或 `custom`（已单独设置，L0 写回不覆盖）。未写的 token 不返回，界面按「跟随全局」处理。

   `componentDefaults` 为 antd 6.5.0 按当前全局 token 派生的组件默认值，不含组件覆盖；客户端用它补齐源码未写的文字与背景配对。透明的 Modal headerBg 按 contentBg 合成，服务端提交时重新计算，不信任客户端配对结果。

   `theme` 为「基础」分组的 26 个协议字段：颜色 `colorPrimary / colorSuccess / colorWarning / colorError / colorInfo / colorText / colorTextSecondary / colorBorder / colorBgBase / colorBgContainer`；文字 `fontFamily / fontFamilyCode / fontSize / lineHeight`；间距 `sizeUnit / sizeStep / spaceSm / spaceMd / spaceLg / controlHeight`；圆角与效果 `borderRadius / borderRadiusLG / lineWidth / shadowLevel / motion / motionUnit`。字号/高度等读取 token 声明或 antd 全局默认，不读取组件覆盖；例如全局默认 controlHeight=32，Button 单独的 34 保持 custom。`space*` 三档从 `generated/styles.css` 的 `--do-space-*` 读出（缺失即读取失败，fail closed）；`shadowLevel` 从 `boxShadow` 反查档位表（无显式值按 antd 默认读 `default`，不在档位内读 `custom`）；`lineHeight` 读出保留两位小数。新草稿同步 token 与 following 覆盖项，保留 custom 项。

   `foundations` 为两个只读分组数据：`icons: {library: "@ant-design/icons", note, files: [{file, icons, count}]}`（源码静态扫描具名导入与 JSX 使用次数，合同锁定不开放写回）；`grid: {breakpoints: [{token, px}], siderWidth, contentMaxWidth, sources, note}`（断点取 antd 6.5.0 派生值，壳层宽度从 `app.tsx` 的 `Layout.Sider width` 与 `styles.css` 的 `.device-ops-page max-width` 读出）。

2. `POST /__ludi/candidates`

   请求 `{version, projectId, loc, expectedSha256}`；返回 `{loc, sha256, candidates, rules}`。

   `candidate: { id, target, label, migratedProps: string[], unmappedProps: string[], requiresConfirmation: boolean }`。

   `rule: {id, status: "pass"|"fail"|"blocked", message, suggestedValue?}`。

   候选仅包含三类双向替换：Modal/Drawer、Select/Radio.Group（选项能静态确认且 <=5）、Popconfirm/modal.confirm（确认等级 B/C 可从本地业务结构与 interaction-decisions §1 确定）。无法确认数量、等级、回调或 props 语义时返回 blocked 及原因，不猜测。不能把“没有候选”写成检查通过。

3. `POST /__ludi/patch`

   L0 请求 `{version, projectId, requestId, kind:"theme", expectedFiles:[{file,sha256}], theme, route}`。

   L1 请求（2026-10-02 增补）`{version, projectId, requestId, kind:"component", expectedFiles:[{file,sha256}], component, tokens: {name: value | null}, route}`；只接受九个 P0 组件与静态数据里登记、可写的 token（未登记、只读项按 `BAD_REQUEST` 拒绝）；颜色必须六位 hex，数字逐项范围越界按 `BAD_REQUEST` 拒绝；`null` = 删除该项（恢复跟随全局，组件对象被删空时连同组件键一并删除）。对比度沿用「只拦改成不达标」：两端按本次值、源码覆盖、antd 有效派生值依次解析，透明背景合成后换算；配对任一端（含恢复跟随）实际变成不达标返回 422 RULE_FAILED，无法解析的新颜色写入也拒绝。未改动的现状不达标只提示建议。`expectedFiles` 只含 theme.ts（组件写回不触碰 styles.css）。

   L3 请求 `{version, projectId, requestId, kind:"replace", expectedFiles:[{file,sha256}], loc, candidateId, confirmedUnmappedProps:string[], route}`。

   `requestId` 为客户端 UUID；同一 id+payload 重试返回原结果，不重复写入；同 id 不同 payload 拒绝。theme 必须恰好包含上述 26 个字段，多字段、缺字段或类型不符按 `BAD_REQUEST` 拒绝。替换目标只能使用服务端的候选 id，不能提交代码。存在不可迁移的 props 时先显示清单，并核对逐项确认；存在不可证明安全的语义则直接拒绝，不因确认放开。

   返回 HTTP 202 `{ok:true,data:{patchId,status:"checking",files,rules}}`，客户端轮询下一接口。写回之前任何校验失败不得写文件。执行互斥锁，全部文件先准备并检查 Hash，再原子替换；部分 I/O 失败不得遗留半个 Patch。拒绝覆盖外部并行修改。

4. `GET /__ludi/patch/:id`

   返回完整 Patch（下节），含逐项检查进度、stdout/stderr、截图相对路径、结果。`checking` 尚未结束，不能显示完成。失败不自动隐藏或撤销现场；保留记录并显示撤销。

5. `POST /__ludi/undo`

   请求 `{version,projectId,requestId,patchId}`；仅撤销最近未撤销 Patch，先验证当前 Hash 等于该 Patch after；外部漂移返回冲突不覆盖。恢复原始 bytes（含 CRLF/LF）并生成 `kind:"undo"` 记录，包含 `undoOf`、前后 Hash。服务重启后也能从 evidence 安全找到合法记录与原始快照。快照只能位于 editor evidence 内，不能携带其他项目文件。

6. `GET /__ludi/patches`（2026-10-02 增补）

   只读，与 `GET /__ludi/patch/:id` 同样的来源校验，不接受查询参数。返回 `{ok:true,data:Patch[]}`：按 `createdAt` 新到旧，最多 30 条，含服务启动时从 evidence 读回的记录。界面在加载完成后读取一次，用来在刷新或服务重启后恢复记录页签与「撤销最近一次写入」，并对仍在 `checking` 的记录继续轮询；本地已有的条目不被覆盖。撤销规则不变，仍以服务端「最近未撤销 Patch」为准。

## Patch 记录

### 2026-10-04 区块 AI 改写增补（第 3 期）

- `bootstrap.ai = {available, reason?}`：只检查本机 CLI 配置与可执行文件可用性，不读取登录凭据；登录或网络失败仍在实际请求时报告。
- `POST /__ludi/patch` 新增 `{version,projectId,requestId,kind:"block",expectedFiles,page,ops,route}`。`page`、`route`、`ops[].block` 必须属于共享 `page-blocks.ts` 的登记，候选来自 `block-templates.tsx`；仅一份对应页面 Hash，操作字段严格沿用 `block-ops.ts`。服务端从页面合同和源码重新组织输入，客户端不传代码、路径或命令。
- 立即返回 HTTP 202 `{patchId,status:"checking",files:[],rules:[]}`；这是受理，尚未写入。AI 返回后解析整份页面、校验合同允许的 import、具名 antd/图标、新增危险写法和颜色。保持原行尾，重新核对 Hash，先存原字节快照再只写这一页。默认 `dsh --profile ludi-block-ai -`（2026-10-04 起由 codex 换成本机 DeepSeek Harness；profile 已禁用文件/命令/联网/子代理工具，模型固定 `deepseek-official / deepseek-flash` = DeepSeek-V41-Flash），prompt 走 stdin、答案取 stdout；`LUDI_AI_CMD` 可选 `codex exec`、`claude -p` 或 JSON argv 固定假脚本；`LUDI_AI_TIMEOUT_MS` 默认 600000。认证依赖现有 CLI/账户配置，服务不读取或记录密钥。
- 进度选用**查询**：继续 `GET /__ludi/patch/:id`，始终 HTTP 200 返回完整记录。`kind:"block"` 新增 `page`、`ops`、`aiStartedAt`、`progress:[{step,status,message,at}]`；`step` 为 `read / ai / validate / checks / result`，`status` 为 `running / passed / failed / cancelled`。每条事件在真实步骤开始或结束时追加，持久化且不靠定时器推进。四项检查仍使用 `checks` 的 queued/running/passed/failed 状态；区块改写首次失败即停止后续检查，后续 queued 表示未执行。客户端只根据这些状态显示清单；失联显示「进度暂时拿不到」。已用时间由真实 `aiStartedAt` 算出。
- `GET /__ludi/block-result/:id` 读取异步结果：进行中与成功 HTTP 200；返回文件非法时 HTTP **422 RULE_FAILED**，检查失败 HTTP 500 CHECK_FAILED，AI 不可用 503 / 调用失败 502 / 超时 504。错误包含 `patchId`，完整原始 CLI 错误（凭据脱敏）和检查输出仍在 Patch。界面轮询进度接口以免丢失失败清单。
- AI 返回前 `POST /__ludi/cancel {version,projectId,patchId}` 可取消，HTTP 200 `{patchId,cancelling:true}` 只代表请求已受理；进程关闭后记录终态 `cancelled`，页面字节不写入。AI 返回后拒绝取消，避免打断写入事务。重启时未完成记录标 failed；已写入的 block 会核对 Hash 后自动还原，不覆盖外部改动。
- 四项检查不通过，block 自动还原原字节，记录 `status:"failed"`、`autoReverted:true`、`error:{code,http,message,details?}` 并保留快照、diff 与全部已运行检查输出。恢复冲突保留 `rollbackError`，绝不宣称已撤销。成功记录 `checks-passed` 并支持现有 undo；自动还原记录不占据撤销入口。其他写入类型继续遵守既有保留现场规则。
- 画布按 `page + ops[].block` 标出被改写区域，显示描边、遮罩和「AI 改写中」；结束清除，失败提示色保留 5 秒。删除预览的区块在等待时恢复原位置用于显示目标。进度丢失不伪造成功或失败。
- `POST /__ludi/block-advice {version,projectId,page,block,operation,state}`，operation 为 delete/replace/add/move。显式点「问 AI」才调用，返回 `{sentence,cached}`，按页面、区块、操作与 state 缓存；只提供建议，不放行或阻止写入。不可用时按钮置灰并说明原因。

### 2026-10-05（其二）派生默认值接口与跟随语义

- `POST /__ludi/derive {version,projectId,theme}` 只读派生：按给定的 26 字段全局主题（形状校验同 L0 写回，规则结果不参与判定），用写回同一条 antd 链（`getDesignToken` + 各组件 prepare）返回 `{components}`。不写文件；校验失败 BAD_REQUEST。编辑器在「基础」草稿变化后防抖调用，供组件 token 面板显示「跟随全局」项的当前派生值——跟随语义为：草稿阶段跟随草稿全局，写入后跟随项目全局（Owner 追问的语义裁决）。
- 组件 token 数值顺位：草稿 > 源码行 > 草稿派生默认值 > 矩阵 CSS 变量计算值 > 「由全局派生」占位。派生组件 token 的 CSS 变量不会随草稿重算，故派生顺位在 CSS 变量之前，防止跟随值停住。

### 2026-10-05 实例模型与建议状态增补（Owner 体验验收第 1–6 项）

- op 新增可选 `instance`：操作只作用于该实例。实例 id：区块本体 = 区块 id；「新增同类」第 n 个副本 = `` `${block}#c${n}` ``（n 从 1 起，按区块分别数）。delete 不带 instance 时删本体与全部副本；move/replace 不带 instance 时只作用本体。副本可被单独选中、删除、移动、替换、问 AI，与本体互不绑定（Owner 验收第 5 项）。非法 instance 标识（不含字母数字以外的字符集外的符号）按 `BAD_REQUEST` 拒绝。
- `state = {activeTemplate?, instance?}`（对象可空但字段必传）：advice 的 prompt 围绕 operation 给建议（replace 谈候选取舍、add 谈增设是否合适、move 谈顺序、delete 才谈该不该删），缓存 key 含 state——换掉替换模板、或问的是某个副本，都重新生成（Owner 验收第 2、4 项）。
- 预览期间右栏影响面不消失：预览行（「以写入后为准」）+ 正常影响面行同时显示（Owner 验收第 1 项）。
- 替换 / 新增预览后，画布高亮框跟随当前可见元素（替换容器或克隆），portal 内容落地后再对一次矩形，不按空容器压线（Owner 验收第 3 项）。
- 组件 token 「恢复跟随全局」在草稿态同样可用：源码本无该行时直接撤掉草稿，源码已有单独设置时草稿置 null 走写入删除（Owner 验收第 6 项）。
- 本轮 Owner 指定端口 **5420**，不使用 5410；真实验收每次写入后尽快 undo 并核对原字节。全量 `npm run validate` 由沙盒外主线程运行。本轮 `LUDI_AI_KEEP_TEMP=1` 与 `LUDI_KEEP_TEST_TEMP=1` 保留一次性测试文件，不执行删除、提交或 push。

### 2026-10-03 影响面与实例合同增补

- `POST /__ludi/impact`：`{version,projectId,components:null|string[],loc:null|Loc}`，只读返回 `{pages,locations,scope,files}`。源码位置不代表渲染实例数量；客户端另在默认状态逐页读取可见 DOM，未挂载浮层与失败必须说明。
- `POST /__ludi/instance`：`{version,projectId,loc,expectedSha256,instanceKey:null|string}`，只读重新解析登记页面并返回字段、静态文本、插槽、结构层与稳定身份模型。已写入的纯静态 key 条件分支按所选 instanceKey 读取，允许再次编辑并保留其他 key 的值。动态表达式、事件、ref、受控值与业务数据不可修改。
- `kind:"structure"` 写入：`{version,projectId,requestId,kind,expectedFiles:[theme.ts Hash],component,part,styles,route}`；样式写入 `deviceOpsComponentStyles`，由项目与矩阵 ConfigProvider 的组件配置消费。仅登记语义层及数字范围、成对不透明颜色（对比度 ≥4.5）。颜色清空须使用源码撤销。
- `kind:"instance"` 写入：`{version,projectId,requestId,kind,expectedFiles:[页面 Hash],loc,instanceKey:null|string,changes,route}`。`changes` 仅注册展示 props、静态 text、固定图标/文本/Tag/none 插槽与有限语义 styles；不接受代码。重复节点必须有可证明的稳定 key，不能使用 nth 永久定位。动态属性或含业务行为的插槽拒绝覆盖。
- 两种新写入沿用文件白名单、同源会话、幂等、Hash、原子写入、四项检查、持久化历史与原字节撤销。内存预览由仅 dev 启用的受控函数实现，生产构建不注入。新范围的独立代码核对由 Reviewer 承担；视觉签收仍独立待 Owner。

存 `projects/tianshu-device-ops/evidence/editor/<时间戳>-<kind>-<id>.json`；唯一、追加，不覆盖既有 evidence。字段：

```ts
type Patch = {
  version: 1; projectId: "tianshu-device-ops"; id: string;
  requestId: string; kind: "theme" | "replace" | "component" | "structure" | "instance" | "undo";
  createdAt: string; updatedAt: string;
  status: "checking" | "checks-passed" | "failed" | "undone";
  route: string; undoOf?: string; undoneBy?: string;
  files: Array<{file: string; beforeSha256: string; afterSha256: string;
    diff: string; beforeSnapshot: string}>;
  rules: Array<{id: string; status: "pass"|"fail"|"blocked"; message: string}>;
  unmappedProps: string[];
  checks: Array<{id: string; status: "queued"|"running"|"passed"|"failed";
    startedAt?: string; endedAt?: string; exitCode?: number;
    stdout?: string; stderr?: string; screenshots?: string[]}>;
  technical: "pending" | "checks-passed" | "failed";
  codeReview: "pending-owner-review";
  visual: "pending-owner-review";
};
```

`checks-passed` 只代表命令与断言结果，不代表 Owner 验收通过。拒绝、写回失败及撤销也留下记录；未写文件的拒绝记录不需要伪造前后 Hash。每项检查有超时、真实 exitCode；停止/超时为 failed。顺序：preview `tsc --noEmit` → kit `antd:lint:projects` → kit `check:antd` → Edge 浏览器冒烟（所涉实际路由，networkidle，主标题出现，无 console error、无横向溢出、截图）。不得运行根安装、根构建等写范围外产物的命令。

## L0 与 L3 写回规则

- 对比度沿用「只拦把值改成不达标」语义，前后端共用算法：把构成配对的值改成对比度 <4.5:1 的组合时规则为 `fail`，禁止写回（422 `RULE_FAILED`），提供最近合规色；配对值与源码当前值一致（未改动）时，即使现状不达标也不阻断其他 Token 写回，规则以 `pass` 返回并在 message 与 `suggestedValue` 中给出现状对比度与建议色。适用四组配对：`colorPrimary` 与 `colorError`（白字在实心按钮上，对白 ≥4.5:1）；`colorText` 对 `colorBgContainer` 与 `colorBgBase`（两组都 ≥4.5:1）；`colorTextSecondary` 对 `colorBgContainer`。`colorSuccess / colorWarning / colorInfo` 只在规则 message 中显示对白对比度数值，不拦截。当前主题读取失败时按 `BAD_REQUEST` 失败，不放行。
- 数值范围：阶梯字段吸附夹回（`fontSize` 12–20 步 2、`controlHeight` 24–48 步 2、`borderRadius` 与 `borderRadiusLG` 0–16 步 2，均沿用既有行为，必须容纳圆角 4、高度 32）；严格字段越界一律 `BAD_REQUEST`：`lineHeight` 1.3–2.0；`sizeUnit / sizeStep` 2–8 整数；`spaceSm / spaceMd / spaceLg`（`--do-space-*`）4–48 整数且必须满足 sm ≤ md ≤ lg；`lineWidth` 1–3 整数；`motionUnit` 0.05–0.2。客户端越界在界面上夹回并短暂高亮，服务端一律拒绝。
- 字体族是逗号分隔列表：只接受字母、数字、中文、空格、连字符、引号与逗号，长度 ≤300，白名单天然排除 `; { } < > \ /` 与 `url(`；列表归一为「逗号+空格」分隔，末尾没有通用族（sans-serif / serif / monospace 等）时按字段自动补 `sans-serif`（fontFamily）或 `monospace`（fontFamilyCode）。界面主选常用字体栈；「读取本机字体」用 Local Font Access（`window.queryLocalFonts`，只做特性检测、不支持就隐藏入口、需用户点击授权），选本机字体时提示「仅本机安装，其他电脑会回退」。
- `shadowLevel` 只能取 `none / light / default / deep` 四档，由服务端固定档位表展开为 `boxShadow` 与 `boxShadowSecondary` 两行 token 写回（客户端不能提交任意阴影字符串）；源码读出的阴影不在档位内时为 `custom`，任何主题写回按 `BAD_REQUEST` 拒绝，需先手工对齐。`motion` 为布尔开关。
- `theme.ts` token 与 components overrides 同步（2026-10-02 改为跟随 / 单独设置）：写回前先读源码，组件项的值等于**改动前**的全局有效值（token 声明或 antd 种子/回退，不看组件覆盖）视为「跟随」，继续按同名（如 `Button.borderRadius / controlHeight`）或名称对应（`itemBorderRadius → borderRadius`、`bodyBg → colorBgBase`、`headerBg / siderBg → colorBgContainer`、`borderColor → colorBorder`）同步写回；与全局值不等的组件项视为「已单独设置」，L0 写回不覆盖。源码里没有的 token 按现有 `colorLink` 做法在 token 末尾追加一行（保持原换行符与缩进）。CSS 同步：`--do-primary` 对 colorPrimary、`--do-bg` 对 colorBgBase、`--do-surface` 对 colorBgContainer、`--do-text` 对 colorText、`--do-text-secondary` 对 colorTextSecondary、`--do-border` 对 colorBorder、`--do-space-sm / md / lg` 对 spaceSm / spaceMd / spaceLg，在 `:root` 与 `.device-ops-shell` 两个现有选择器的重复声明全部同步，必需声明缺失即失败。字号/圆角/高度对应 CSS 若不存在不要改无关 CSS。colorPrimary 联动写 `colorLink`（派生写入，非独立字段；antd 种子 token 默认为空会回退 colorInfo，colorLinkHover/Active 由 antd 从 colorLink 再派生）。iframe 预览同样跟随（跟随状态以 bootstrap.componentTokens 下发；含 `--do-text*`、`--do-border`、`--do-space-*` 与阴影档位的内存同步）。
- L1 组件 token 写回（`editor-server/components.mjs`）：改 `theme.ts` 的 `components.<组件>`；组件键不存在时按单行对象格式新增（如 `Modal: { titleFontSize: 18 }`），项不存在时在对象内追加，项存在时原位替换，`null` 删除该行；保持原换行符。组件对象被删空时连同组件键一并删除（若 `components` 因此为空，保留空对象）。对比度三项语义只拦「改成不达标」（422 `RULE_FAILED`，字节不变）。撤销沿用现有快照机制，与 L0 共用「撤销最近一次写入」。
- L3 使用固定 `@babel/parser@7.29.9` + `recast@0.24.0`；保留其余原字节及行尾。diff 只涉及被替换节点和所需 import。Modal onCancel ↔ Drawer onClose、footer/extra、Radio value/onChange、confirm 回调和 children 需逐项证明语义；无法映射不静默丢失。表达式、别名与已有 import 不得重复或破坏。
- 插件仅 dev（`apply:"serve"`，生产构建零注入）、仅天枢目录；注入两类标记：来自 antd 的 JSX（具名别名与 Radio.Group），以及小写单标识符的原生标签（`data-ludi-comp` 为标签名）。大写非 antd 本地组件、Fragment、成员表达式里非 antd 的、命名空间标签不注入，它们渲染出的原生元素各自带标记。定位数据为 `data-ludi-loc="文件:行:列"`、`data-ludi-comp`。替换候选只对 antd 组件给出，原生元素的 loc 一律不可替换（`replacement.semantic` 为 `blocked`，无候选）。映射不可定位的 DOM 要明确说明，不能制造假源码位置。build 不注册插件，产物零 `data-ludi-*` 注入。

## iframe postMessage 桥接

仅同源父子 window；必须检查 `event.origin === location.origin` 和 `event.source` 为对应 iframe.contentWindow / parent，固定 `targetOrigin`，禁止 `"*"`。普通天枢不接收，只在 `?editor=1` 接收。

统一 envelope：`{channel:"ludi-editor",version:1,projectId:"tianshu-device-ops",type,payload}`。

- 子→父 `ready`：`{route}`；父重发当前草稿与 picking 状态。
- 父→子 `theme-preview`：2026-10-02 起载荷为 `{theme, components, statuses}`（L0 主题草稿；组件 token 草稿，null = 恢复跟随全局；`statuses` 为 bootstrap.componentTokens 的跟随状态，子端据此决定 L0 预览是否同步组件覆盖项）。只改变当前内存；必须真正覆盖 DeviceOpsApp 内部 ConfigProvider 的 token/组件覆盖，并同步 :root 与 shell 的 --do-*，不触碰源码。不得仅外包 Provider 后声称生效。可在内存维护原主题快照并恢复。
- 父→子 `selection-mode`：`{enabled:boolean}`。开启（画布「选择」模式）时点击只选组件，不触发其原业务操作；关闭（画布「交互」模式）后放行业务点击，可点开抽屉、弹窗。
- 父→子 `request-component-values`（2026-10-02 增补，矩阵子端）：`{}`，请求上报当前组件全部登记 token 的 CSS 变量计算值。
- 子→父 `component-values`（2026-10-02 增补）：`{component, values:{[token]: string | null}}`，矩阵子端从 `documentElement` 计算样式里按 antd token2CSSVar 规则（cssVar.key = device-ops）读出；读不到为 null，界面标「由全局派生」，不编造数值。
- 子→父 `component-selected`：`{loc,rect:{x,y,width,height}}`，rect 相对 iframe viewport；父查询候选与文件 Hash。无法定位只显示原因。
- 父→子 `clear-preview`：`{}`，恢复原主题与高亮。
- 子→父 `bridge-error`：`{code,message}`，显式显示失败。

第二阶段新增消息（同一 envelope 与校验，旧消息语义与命中优先级、Popconfirm owner 上报不变）：

- 子→父 `layer-tree`：天枢页面子端 `{kind:"page",nodes:[{i,p,loc,comp,nth,t?,b?}],total,truncated,route}`，nodes 为当前页可见的 `data-ludi-loc` 元素，按文档顺序、父先于子，`p` 为父节点下标（无为 -1），`loc` 为 `文件:行:列`，`comp` 为 `data-ludi-comp`，`nth` 为同一 loc 在整页标记元素中的序号，`t` 为元素自身文本前 14 字，`b` 为登记区块根节点的区块 id（供图层树显示中文名）；节点上限 1500，超过截断并置 `truncated`，`total` 为可见标记元素总数。矩阵子端 `{kind:"matrix",component,rootCount,parts:[{key,count}]}`，`key` 取自 antd 6.5.0 semantic 结构。画布加载后、DOM 变化后（去抖，内容未变不重复上报）与收到 `request-layers` 时上报。
- 子→父 `element-detail`：选中元素后与 `component-selected` 一起上报，`{loc,selfLoc,comp,tag,nth,ownerComp?,ancestors:[{loc,comp,nth}],bounds:{x,y,width,height},styles}`。`ancestors` 为标记祖先链（根在前），`styles` 只含宽高、内外边距、字号字重行高、颜色、背景色、边框（宽/样式/色）、圆角的计算样式字符串。
- 子→父 `part-detail`：矩阵里选中组件某一层后上报，`{component,key,nth,tag,bounds,styles}`，`key` 为 semantic key，`root` 表示组件整体。
- 子→父 `shortcut`：子端文档里按 V / I / Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y 且焦点不在文本输入时转发，`{key,ctrl,shift}`；父页据此切换选择 / 交互模式与预览撤销、重做。
- 父→子 `request-layers`：`{}`，请求重新上报图层树（子端 `ready` 后父页发送一次）。
- 父→子 `select-element`：`{loc,nth}`，页面子端按 loc 找同 loc 的第 nth 个标记元素，滚动到可见、高亮并回报 `component-selected` 与 `element-detail`；找不到回 `bridge-error`（`LOCATE_FAILED`）。图层树点击使用它，不走 owner 上报。
- 父→子 `select-part`：`{key,nth}`，矩阵子端选中第 nth 个匹配该层的元素并回报 `part-detail`。
- 子端高亮：1.5px 蓝色描边加组件名标签（`data-label`），随滚动、缩放跟随，元素被重渲染移除后撤下。

区块预览新增消息（2026-10-03，同一 envelope 与校验；只在页面子端、只预览，不写源码；区块表见 `src/editor/page-blocks.ts`，目前只登记 device-list）：

- 父→子 `theme-preview` 载荷多一个可选字段 `blocks`：区块操作列表 `[{page, kind, block, dir?, template?}]`，`kind` 为 `delete / add / move / replace`，`block` 是区块表里的区块 id，`dir`（move）取 -1 上移、1 下移，`template`（replace）是候选库 `block-templates.tsx` 的候选 id。操作按顺序归约（`block-ops.ts` 的 `planBlocks`）；其余草稿字段没变、只有 `blocks` 变时子端不重建整页，直接对 DOM 重新应用。
- 子端对根容器 `.device-ops-stack` 的直接子元素做可撤回的变换：删除与替换给原区块打 `data-ludi-block-hidden`；移动用 inline `order` 重排（flex 纵向布局，不动 React 管理的 DOM 顺序）；新增同类插入 `data-ludi-block-clone` 克隆（去掉 `data-ludi-*` 与 `id`，内部元素不可操作，点副本等于选中所属区块）；替换在原位置放 `data-ludi-block-mount` 容器，由子端用 React portal 渲染候选。撤回（操作列表清空或收到 `clear-preview`）清掉全部标记、克隆与容器。
- 子→父 `block-state`：`{page, present, visible}`，`present` 为区块表里当前在页面上的区块 id，`visible` 为看得见的区块 id（按有效顺序）。画布加载、DOM 变化、应用操作后上报，内容没变不重复上报。
- 父→子 `select-block`：`{id}`，选中该区块（定位用原区块元素，高亮与矩形取当前看得见的那块），回报 `component-selected` 与 `element-detail`；区块不在页面上回 `bridge-error`（`LOCATE_FAILED`）。
- `element-detail` 多两个可选字段：`text`（元素自身文字前 14 字）与 `block: {id, self}`（元素属于哪个区块，`self` 为 true 表示选中的就是区块本身）。选中区块自身时高亮标签显示中文区块名；选中区块内部元素时高亮框右上角出现「选中所在区块」按钮，点击等同 `select-block`。点到替换容器或预览克隆视为选中它所属的区块。

组件矩阵在编辑器自己的 iframe 路由 `/editor/matrix?component=Button&editor=1`；组件矩阵使用天枢草稿主题、默认 antd prefix，外壳使用独立 --ludi-* 与 prefixCls="ludi"。外壳不得 import 天枢全局 styles；现有 PreviewApp 静态引入项目造成的 CSS 污染需在 B 的入口路由选择中隔离（可 lazy load，保持原预览入口）。不得全局重置被编辑页。

## 错误码

`BAD_REQUEST` 400；`UNAUTHORIZED_ORIGIN`/`INVALID_SESSION` 403；`PATH_NOT_ALLOWED` 403；`NOT_FOUND` 404；`HASH_CONFLICT`/`PATCH_BUSY`/`UNDO_CONFLICT`/`REQUEST_ID_CONFLICT` 409；`RULE_FAILED`/`UNSUPPORTED_REPLACEMENT`/`UNMAPPED_PROPS` 422；`BODY_TOO_LARGE` 413；`WRITE_FAILED`/`CHECK_FAILED` 500；`CHECK_TIMEOUT` 504。响应 message 为可理解中文；保留诊断 details 在证据中，不把内部栈堆在界面。

## 集成证据与停止

C 分开记录 PLAN §6 八项原始结果、实际路由清单、前后 Hash、console/overflow、1440 与 1024 截图、交互步骤、检查输出。真实写回必须全部通过撤销 API 恢复原 bytes，最终 Hash 与开工快照一致；baseline 已有未提交文件也不得覆盖。主线程原样运行全量 validate，按上述 Owner 临时产物例外执行。独立核对与视觉签收尚未返回时不宣告 P0 已验收，不把执行者的运行结果转为评审通过。
