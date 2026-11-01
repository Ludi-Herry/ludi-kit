# Synthetic generation readiness

This reference describes the frozen synthetic readiness protocol and its evidence shape. Historical run identities, model profiles, verdicts and artifacts retain their original meaning. Current project status lives in [`../../docs/PROJECT-STATUS.md`](../../docs/PROJECT-STATUS.md).


Blind harness 调试与稳定性 canary 使用结构同构、内容虚构的 synthetic PRD。三个 profile 只保存页数、流程步数、实体规模和字段密度；生成产物固定为 `qualifying=false / scoring=false`，不会写入 blind adoption registry。

```bash
npm run generate:synthetic-blind-prd -- --profile compact-flow-02 --seed 7101 --out <input-dir>
npm run compile:synthetic-semantic-contract -- --input <input-dir>
npm run run:synthetic-readiness -- --workspace <fresh-product-workspace> --input <input-dir> --arm consumer --cycle 1 --evidence <fresh-evidence-dir>
npm run validate:synthetic-readiness -- --summary <fresh-evidence-dir>/readiness-summary.json
```

正式 18-cycle readiness 先冻结一份 consumer tarball，再由 cycle preparer 同时生成 paired input 与两个隔离 workspace。generation Agent 使用固定的 `Claude Code 2.1.221 / claude-sonnet-5 / medium` profile；prompt、exit code、stdout、stderr、时间戳和 frozen-input 前后哈希进入独立 evidence。最初的 Codex profile 在生成前命中外部用量门，双臂 failed command 保留在 `generation-attempt-01`，不进入 18-run matrix：

```bash
npm run freeze:synthetic-consumer-package
npm run prepare:synthetic-readiness-cycle -- --profile compact-flow-02 --seed 7101 --cycle 1 --input <cycle-input-dir> --workspaces <cycle-workspace-root>
npm run run:synthetic-generation-agent -- --workspace <consumer-workspace> --evidence <consumer-generation-evidence> --profile compact-flow-02 --arm consumer --cycle 1 --provider claude --model claude-sonnet-5 --reasoning medium
npm run validate:synthetic-generation-evidence -- --command <consumer-generation-evidence>/command.json
```

consumer workspace 只获得 receipt 固定的带哈希 tarball；control workspace 不含该 tarball 或 receipt。vendor tarball 不复制进 source snapshot，readiness preflight 会在 snapshot 前按 bytes 与 SHA-256 重新核对它。任何 frozen input 漂移都会让 generation evidence 失败。

同一 profile/cycle 的 consumer 与 control 共用 seed，并分别使用新 workspace、新生成源码和独立 artifact identity。产品必须复制冻结输入、提供 `typecheck` / `build` / `preview`，实现 PRD 行为并暴露合同列出的 `data-testid`；产品目录内的 flow test、Vitest/Jest/Playwright 断言会被 readiness preflight 拒绝。

`semantic-contract.json` 由独立 compiler 从 PRD requirement markers 编译，并与 `coverage-oracle.json`、manifest、页面/流程正文和 sample-pack 双向核对。kit 侧 runner 使用隔离启动的真实 Chromium 执行 action、state、side-effect 和 recovery。对外只汇总四项指标：

- `typecheckPass`
- `buildPass`
- `flowSmokePass`
- `previewIdentityPass`（identity、entry、clean shutdown 全部通过）

每个命令目录固定保存 `command.json`、`stdout.log`、`stderr.log`；零输出也保留 0-byte 文件及空文件 SHA-256。完整稳定门为 3 profiles × 2 arms × 3 fresh cycles，共 18 个 canonical summary。该门校验证据完整、paired seed、fresh source/workspace 与身份隔离，不要求四项指标全为 true；失败指标也是正式的非计分 canary 信号。`readiness-attempt-*` 与 `readiness-diagnostic-*` 只保存调试史，不进入矩阵：

```bash
npm run validate:synthetic-readiness -- --root <readiness-root> --require-stability-gate
npm run validate:synthetic-generation-evidence -- --root <readiness-root> --require-stability-gate
```

历史 raw `kitFirstPass`、registry 和 result 保持冻结。现行阶段诊断见 `quality/blind-harness/historical-diagnostics.json`；历史基线由 `npm run freeze:blind-historical-baseline` 校验。
