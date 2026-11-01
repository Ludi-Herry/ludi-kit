#!/usr/bin/env node
// 三端一致检查（第 5 阶段 5.3b，门禁；Owner 2026-10-13 定为按需命令，不接入 validate）。
// 依次跑：差异探针 → 各底座结构合同 → 各底座控件规格 → 三端行为断言。改动天枢任一端页面、规格或共用核心时必跑。
// 三端开发服务在线就复用；不在线就自己启动（antd：kit/preview；shadcn、Element Plus：Lab 仓库），跑完只关自己启动的，并等进程完全关闭。
//
// 用法：npm run check:foundation-parity [-- --out <目录>] [--lab <Ludi-foundation-lab 目录>] [--config quality/foundation-parity/routes.tianshu.json] [--no-start]
//   --out 缺省写到系统临时目录；--lab 缺省取环境变量 LUDI_FOUNDATION_LAB，再缺省为仓库同级的 Ludi-foundation-lab。
// 退出码：0 全部通过；1 有检查不通过；2 服务或输入错误（含探针运行失败）。
// 探针本身只出差异清单、不判通过，差异数随汇总打印，供每批与上一批比对。

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const KIT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const noStart = argv.includes('--no-start');
const configPath = resolve(KIT, arg('config', 'quality/foundation-parity/routes.tianshu.json'));
const lab = resolve(arg('lab', process.env.LUDI_FOUNDATION_LAB ?? resolve(KIT, '../../Ludi-foundation-lab')));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = resolve(arg('out', join(tmpdir(), `foundation-parity-${stamp}`)));

if (!existsSync(configPath)) {
  console.error(`找不到配置：${configPath}`);
  process.exit(2);
}
const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
const SERVE_DIRS = { antd: resolve(KIT, 'preview'), shadcn: join(lab, 'shadcn'), 'element-plus': join(lab, 'element-plus') };
const READY_TIMEOUT_MS = 120_000;
const CLOSE_TIMEOUT_MS = 10_000;

mkdirSync(outDir, { recursive: true });
const started = [];
const steps = [];
let infraError = null;

const online = async (url) => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
    return response.ok;
  } catch {
    return false;
  }
};

async function ensureServer(name, base) {
  const url = `${base}${cfg.basePath ?? ''}/`;
  if (await online(url)) {
    console.log(`服务 ${name}：复用 ${url}`);
    return;
  }
  if (noStart) throw new Error(`${name} 不在线（${url}），且指定了 --no-start`);
  const cwd = SERVE_DIRS[name];
  const vite = cwd && join(cwd, 'node_modules/vite/bin/vite.js');
  if (!vite || !existsSync(vite)) throw new Error(`${name} 不在线，也找不到可启动的 Vite：${vite ?? '未登记启动目录'}`);
  const port = new URL(base).port;
  const child = spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', port, '--strictPort'], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  const chunks = [];
  child.stdout.on('data', (c) => chunks.push(c.toString()));
  child.stderr.on('data', (c) => chunks.push(c.toString()));
  const closed = new Promise((done) => child.once('close', done));
  const entry = { name, child, closed, output: () => chunks.join('') };
  started.push(entry);
  console.log(`服务 ${name}：不在线，启动 ${cwd}（端口 ${port}）`);
  const startedAt = Date.now();
  while (Date.now() - startedAt < READY_TIMEOUT_MS) {
    if (child.exitCode !== null) {
      // exit 可能早于输出流读完，先等 close 再取输出（同 N13 的修法）。
      await Promise.race([closed, delay(2_000)]);
      throw new Error(`${name} 启动后退出（code ${child.exitCode}）：${entry.output().trim().slice(-800)}`);
    }
    if (await online(url)) {
      console.log(`服务 ${name}：就绪，用时 ${Date.now() - startedAt}ms`);
      return;
    }
    await delay(500);
  }
  throw new Error(`${name} 在 ${READY_TIMEOUT_MS}ms 内没有就绪`);
}

async function stopStarted() {
  for (const { name, child, closed } of started) {
    if (child.exitCode === null) {
      if (process.platform === 'win32') {
        spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
      } else {
        child.kill('SIGTERM');
      }
    }
    const result = await Promise.race([closed.then(() => 'closed'), delay(CLOSE_TIMEOUT_MS).then(() => 'timeout')]);
    console.log(`服务 ${name}：已关闭本次启动的进程（${result === 'closed' ? '已确认关闭' : `${CLOSE_TIMEOUT_MS}ms 内未确认关闭`}）`);
  }
}

function run(id, script, args) {
  const result = spawnSync(process.execPath, [join(KIT, 'scripts', script), ...args], {
    cwd: KIT,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024
  });
  const log = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  writeFileSync(join(outDir, `${id}.log`), log);
  const lines = log.trim().split(/\r?\n/).filter(Boolean);
  // 结论行优先（控件规格会在结论后再打印警告），找不到再取最后一行。
  const last = lines.findLast((l) => /passed|FAILED|failed|不一致/.test(l)) ?? lines.at(-1) ?? '';
  const status = result.status ?? 2;
  steps.push({ id, status, last });
  console.log(`${status === 0 ? '通过' : status === 1 ? '不通过' : '出错'}  ${id}：${last}`);
  return status;
}

try {
  for (const [name, base] of Object.entries(cfg.foundations)) await ensureServer(name, base);
  const probeDir = join(outDir, 'probe');
  if (run('probe', 'probe-foundation-parity.mjs', ['--routes', configPath, '--out', probeDir]) !== 0) {
    throw new Error('探针没有跑完，后续检查没有输入');
  }
  for (const name of Object.keys(cfg.foundations)) {
    run(`structure-${name}`, 'check-structure-contract.mjs', ['--probe', probeDir, '--foundation', name]);
    run(`control-${name}`, 'check-control-spec.mjs', ['--probe', probeDir, '--foundation', name]);
  }
  run('behavior', 'run-foundation-behavior-parity.mjs', ['--config', configPath, '--out', join(outDir, 'behavior')]);
} catch (error) {
  infraError = error instanceof Error ? error.message : String(error);
  console.error(`出错：${infraError}`);
} finally {
  await stopStarted();
}

const failed = steps.filter((s) => s.status === 1).map((s) => s.id);
const errored = steps.filter((s) => s.status !== 0 && s.status !== 1).map((s) => s.id);
const exitCode = infraError || errored.length ? 2 : failed.length ? 1 : 0;
writeFileSync(join(outDir, 'summary.json'), JSON.stringify({
  suite: 'foundation-parity', recordedAt: new Date().toISOString(), config: configPath, lab,
  started: started.map((s) => s.name), steps, infraError, exitCode
}, null, 2));
console.log(`\n三端一致检查${exitCode === 0 ? '通过' : exitCode === 1 ? `不通过：${failed.join('、')}` : `出错：${[infraError, ...errored].filter(Boolean).join('；')}`}。日志：${outDir}`);
process.exit(exitCode);
