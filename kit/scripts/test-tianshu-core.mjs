#!/usr/bin/env node
// 天枢共用核心测试（第 4 阶段，试运行，不接入 validate）：用真实的天枢数据与 store 验证 core/ 下的框架无关逻辑。
// 用法：node scripts/test-tianshu-core.mjs
// 先用 esbuild 把 core 打包成一个 ESM 模块再导入（core 按打包器风格写导入，Node 不能直接运行）。

import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const KIT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const esbuild = createRequire(resolve(KIT, 'preview/package.json'))('esbuild');
const entry = `
export * from './core/deviceList';
export * from './core/firmware';
export * from './core/firmwareForm';
export * from './core/feedback';
export * from './core/rmaList';
export * from './core/deviceDetail';
export * from './core/flashingList';
export * from './core/flashingForm';
export * from './core/passportList';
export * from './core/passportDetail';
export * from './core/alerts';
export * from './core/alertRules';
export * from './core/binding';
export * from './core/dashboard';
export * from './core/number';
export * from './core/sort';
export * from './core/text';
// canStartRma 在 deviceDetail 与 passportDetail 同名同义（star 导出重名会被静默排除），显式转出一次。
export { canStartRma } from './core/deviceDetail';
export { tableLayout, filterGrid } from './core/structure';
export { devices } from './data';
export { deviceOpsStore, unresolvedAlertCountBySn, activatedRangeDates } from './store';
`;
const built = await esbuild.build({
  stdin: { contents: entry, resolveDir: resolve(KIT, 'projects/tianshu-device-ops'), loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent', nodePaths: [resolve(KIT, 'node_modules')]
});
const core = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

const memory = (init = {}) => {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), dump: () => Object.fromEntries(m) };
};
const state = core.deviceOpsStore.getState();
const devices = state.devices;
const unresolved = core.unresolvedAlertCountBySn(state.alerts);
const rangeDates = core.activatedRangeDates;
const results = [];
const test = (name, fn) => { try { fn(); results.push([name, true]); } catch (e) { results.push([name, false, e.message]); } };

test('首次进入：没有网址参数和记忆时，默认看「运行异常」', () => {
  const s = core.initialDeviceListState({ search: '', storage: memory(), rangeDates });
  assert.equal(s.viewKey, 'abnormal');
  assert.deepEqual(s.filters, core.emptyFilters);
  assert.equal(s.phase, 'all');
});
test('旧格式日期记忆（{from, to}）恢复成 [开始, 结束]，筛选与已存视图都能命中', () => {
  const old = { ...core.emptyFilters, activated: { from: '2024-08-01', to: '2024-08-31' }, factory: { from: 'x' } };
  const s = core.initialDeviceListState({
    search: '',
    storage: memory({ 'device-ops:last-filter': { filters: old, phase: 'all' }, 'device-ops:views': { views: [{ id: 'v1', name: '八月激活', base: 'all', filters: old }], defaultView: null } }),
    rangeDates
  });
  assert.deepEqual(s.filters.activated, ['2024-08-01', '2024-08-31']);
  assert.equal(s.filters.factory, null);
  assert.deepEqual(s.views[0].filters.activated, ['2024-08-01', '2024-08-31']);
});
test('从别处带 sn 跳来：以网址为准并回到「全部设备」', () => {
  const s = core.initialDeviceListState({ search: '?sn=TS2408', storage: memory({ 'device-ops:views': { views: [], defaultView: 'ready' } }), rangeDates });
  assert.equal(s.viewKey, 'all');
  assert.equal(s.filters.sn, 'TS2408');
});
test('工作台「今日新激活」跳来：激活时间范围与 store 同源', () => {
  const s = core.initialDeviceListState({ search: '?activated=today', storage: memory(), rangeDates });
  assert.deepEqual(s.filters.activated, rangeDates('today'));
});
test('online 参数不是合法状态时忽略', () => {
  const s = core.initialDeviceListState({ search: '?online=bogus&batch=B2408', storage: memory(), rangeDates });
  assert.deepEqual(s.filters.onlines, []);
  assert.deepEqual(s.filters.batches, ['B2408']);
});
test('恢复记忆时去掉手机号', () => {
  const s = core.initialDeviceListState({ search: '', storage: memory({ 'device-ops:last-filter': { filters: { ...core.emptyFilters, phone: '138', models: ['TS-N2'] }, phase: 'running' } }), rangeDates });
  assert.equal(s.filters.phone, '');
  assert.deepEqual(s.filters.models, ['TS-N2']);
  assert.equal(s.phase, 'running');
});
test('默认视图指向已删除的「我的视图」时，回到角色默认', () => {
  const s = core.initialDeviceListState({ search: '', storage: memory({ 'device-ops:views': { views: [], defaultView: 'my:9' } }), rangeDates });
  assert.equal(s.viewKey, 'abnormal');
});
test('「运行异常」= 离线或有未处理告警', () => {
  const d = core.deriveDeviceList({ devices, unresolved, applied: core.emptyFilters, phase: 'all', viewKey: 'abnormal', views: [] });
  const expected = devices.filter((x) => x.online === 'offline' || (unresolved.get(x.sn) ?? 0) > 0).length;
  assert.equal(d.rows.length, expected);
  assert.ok(expected > 0, '样例数据里应有运行异常的设备');
});
test('阶段计数按「视图 + 已生效筛选」统计，各阶段之和等于全部', () => {
  const d = core.deriveDeviceList({ devices, unresolved, applied: core.emptyFilters, phase: 'all', viewKey: 'all', views: [] });
  assert.equal(d.phaseCounts.all, devices.length);
  assert.equal(d.phaseCounts.production + d.phaseCounts.running + d.phaseCounts.after_sales, d.phaseCounts.all);
});
test('选中的阶段在当前范围内为 0 时回到「全部」', () => {
  const d = core.deriveDeviceList({ devices, unresolved, applied: { ...core.emptyFilters, sn: 'NO-SUCH-SN' }, phase: 'running', viewKey: 'all', views: [] });
  assert.equal(d.activePhase, 'all');
  assert.equal(d.rows.length, 0);
});
test('默认排序：未处理告警多的在前，同数时最近心跳在前', () => {
  const d = core.deriveDeviceList({ devices, unresolved, applied: core.emptyFilters, phase: 'all', viewKey: 'all', views: [] });
  for (let i = 1; i < d.rows.length; i += 1) {
    const a = unresolved.get(d.rows[i - 1].sn) ?? 0, b = unresolved.get(d.rows[i].sn) ?? 0;
    assert.ok(a > b || (a === b && (d.rows[i - 1].lastHeartbeat ?? '') >= (d.rows[i].lastHeartbeat ?? '')), `第 ${i} 行顺序不对`);
  }
});
test('点表头排序三态（antd 原生）：新列升序 → 降序 → 清除；默认降序列首次点击即清除', () => {
  assert.deepEqual(core.toggleSort(null, 'heartbeat'), { key: 'heartbeat', dir: 'asc' });
  assert.deepEqual(core.toggleSort({ key: 'heartbeat', dir: 'asc' }, 'heartbeat'), { key: 'heartbeat', dir: 'desc' });
  assert.equal(core.toggleSort({ key: 'heartbeat', dir: 'desc' }, 'heartbeat'), null);
  assert.deepEqual(core.toggleSort({ key: 'alerts', dir: 'desc' }, 'heartbeat'), { key: 'heartbeat', dir: 'asc' });
  // 初始 alerts 降序：第一次点击就清除，再点从升序开始。
  assert.deepEqual(core.DEFAULT_SORT, { key: 'alerts', dir: 'desc' });
  assert.equal(core.toggleSort(core.DEFAULT_SORT, 'alerts'), null);
  assert.deepEqual(core.toggleSort(null, 'alerts'), { key: 'alerts', dir: 'asc' });
});
test('设备列表清除排序后：行顺序等于默认口径（antd 数据源本身按告警降序、心跳降序），与按列排序不同', () => {
  const ids = (sort) => core.deriveDeviceList({ devices, unresolved, applied: core.emptyFilters, phase: 'all', viewKey: 'all', views: [], ...(sort === undefined ? {} : { sort }) }).rows.map((d) => d.sn);
  assert.deepEqual(ids(null), ids(undefined));
  assert.deepEqual(ids(null), ids(core.DEFAULT_SORT));
  assert.notDeepEqual(ids({ key: 'heartbeat', dir: 'asc' }), ids(null));
});
test('保存视图：名称必填、不能重名；手机号不进视图；编号递增', () => {
  assert.equal(core.viewNameError('  ', []), '请填写视图名称');
  const views = [{ id: '3', name: '华南离线', base: 'all', filters: core.emptyFilters }];
  assert.equal(core.viewNameError('华南离线', views), '已有同名视图，请换一个名称');
  assert.equal(core.viewNameError('新视图', views), null);
  const v = core.createSavedView(views, { name: ' 新视图 ', base: 'abnormal', filters: { ...core.emptyFilters, phone: '138' }, phase: 'running' });
  assert.equal(v.id, '4');
  assert.equal(v.name, '新视图');
  assert.equal(v.filters.phone, '');
});
test('删除默认视图后，默认回到角色默认', () => {
  const next = core.removeSavedView({ views: [{ id: '1', name: 'a', base: 'all', filters: core.emptyFilters }], defaultView: 'my:1' }, '1');
  assert.deepEqual(next, { views: [], defaultView: null });
  assert.equal(core.isDefaultView(null, 'abnormal'), true);
});
test('本页全选框三态', () => {
  assert.equal(core.pageSelectionState(['a', 'b'], ['a', 'b', 'c']), true);
  assert.equal(core.pageSelectionState(['a', 'b'], ['b']), 'indeterminate');
  assert.equal(core.pageSelectionState(['a', 'b'], []), false);
  assert.equal(core.pageSelectionState([], ['a']), false);
});
test('结构合同读取层：固定列偏移与 antd 实测一致（多选框 48 → SN 左 48，操作列右 0）', () => {
  const t = core.tableLayout('devices');
  assert.deepEqual(t.selection.style, { width: 48, minWidth: 48, position: 'sticky', left: 0 });
  assert.equal(t.column('sn').style.left, 48);
  assert.equal(t.column('actions').style.right, 0);
  assert.equal(t.column('alerts').textAlign, 'right');
  assert.equal(t.visibleAt('model', 1199), false);
  assert.equal(t.visibleAt('model', 1200), true);
  assert.equal(t.visibleAt('shippedAt', 1440), false);
  assert.equal(t.totalWidth(['sn', 'alerts']), 48 + 156 + 124);
});

test('筛选区栅格：全部设备页 5 列、列间距 16', () => {
  const g = core.filterGrid('devices');
  assert.equal(g.columns, 5);
  assert.deepEqual(g.style, { display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', columnGap: 16 });
});
test('筛选区窄屏回落与 antd 的 max-width 一致：正好 1200 宽就回落 3 列，1201 不回落', () => {
  assert.equal(core.filterGrid('devices', 1200).columns, 3);
  assert.equal(core.filterGrid('devices', 1201).columns, 5);
  assert.equal(core.filterGrid('binding', 1024).style.gridTemplateColumns, 'repeat(2, minmax(0, 1fr))');
  // 「更多筛选」不写列数时与常驻行同一栅格（反馈页两行同用自动排列）
  const f = core.filterGrid('feedback');
  assert.equal(f.style.gridTemplateColumns, 'repeat(auto-fit, minmax(200px, 1fr))');
  assert.deepEqual(f.moreStyle, f.style);
});


// ============ 第 4 阶段 4.4：其余页面控制器（只追加，既有测试与打包方式不变）============
// ---- core/firmware.ts + core/firmwareForm.ts（批次 A）----
// ---- core/firmware.ts ----
test('首次进入：没有网址参数和记忆时，两个 Tab 都是空筛选', () => {
  const s = core.initialFirmwareState({ search: '', tab: 'version', storage: memory() });
  assert.deepEqual(s.vDraft, core.emptyVersionFilters);
  assert.deepEqual(s.vApplied, core.emptyVersionFilters);
  assert.deepEqual(s.tDraft, core.emptyTaskFilters);
  assert.deepEqual(s.tApplied, core.emptyTaskFilters);
});
test('工作台「待灰度版本」跳来：?status=testing 整份预置版本筛选，会话记忆让位', () => {
  const s = core.initialFirmwareState({
    search: 'tab=version&status=testing',
    tab: 'version',
    storage: memory({ 'device-ops:firmware-version-filters': { draft: { ...core.emptyVersionFilters, keyword: 'v2.2' }, applied: { ...core.emptyVersionFilters, keyword: 'v2.2' } } })
  });
  assert.deepEqual(s.vDraft.statuses, ['testing']);
  assert.deepEqual(s.vApplied.statuses, ['testing']);
  assert.equal(s.vDraft.keyword, '');
});
test('?status= 无法识别时回退到会话记忆', () => {
  const s = core.initialFirmwareState({
    search: 'tab=version&status=bogus',
    tab: 'version',
    storage: memory({ 'device-ops:firmware-version-filters': { draft: { ...core.emptyVersionFilters, keyword: 'v2.2' }, applied: { ...core.emptyVersionFilters, keyword: 'v2.2' } } })
  });
  assert.equal(s.vDraft.keyword, 'v2.2');
});
test('推送任务 Tab 的 ?status=fused 预置到任务筛选', () => {
  const s = core.initialFirmwareState({ search: 'tab=push-task&status=fused', tab: 'push-task', storage: memory() });
  assert.deepEqual(s.tDraft.statuses, ['fused']);
  assert.deepEqual(s.vDraft, core.emptyVersionFilters);
});
test('未知 tab 与缺省都归一到固件版本', () => {
  assert.equal(core.resolveFirmwareTab(null), 'version');
  assert.equal(core.resolveFirmwareTab('task'), 'version');
  assert.equal(core.resolveFirmwareTab('push-task'), 'push-task');
  assert.equal(core.firmwareTabNeedsNormalization('push-task'), false);
  assert.equal(core.firmwareTabNeedsNormalization(null), true);
});
test('版本默认排序：发布时间新的在前，草稿（无发布时间）沉底', () => {
  const rows = core.deriveVersionRows(state.firmwareVersions, core.emptyVersionFilters);
  assert.equal(rows[0].id, 'v2.4.1');
  assert.equal(rows.at(-1).id, 'v2.4.2-beta.1');
});
test('固件两张表排序三态：新列升序 → 降序 → 清除；初始降序列首次点击即清除；清除后回默认口径', () => {
  const v = { key: 'releasedAt', dir: 'desc' };
  assert.equal(core.nextColumnSort(v, 'releasedAt'), null);
  assert.deepEqual(core.nextColumnSort(null, 'releasedAt'), { key: 'releasedAt', dir: 'asc' });
  assert.deepEqual(core.nextColumnSort(v, 'ratio'), { key: 'ratio', dir: 'asc' });
  assert.deepEqual(core.nextColumnSort({ key: 'ratio', dir: 'asc' }, 'ratio'), { key: 'ratio', dir: 'desc' });
  assert.equal(core.nextColumnSort({ key: 'ratio', dir: 'desc' }, 'ratio'), null);
  const t = { key: 'createdAt', dir: 'desc' };
  assert.equal(core.nextColumnSort(t, 'createdAt'), null);
  assert.deepEqual(core.nextColumnSort(t, 'failureRate'), { key: 'failureRate', dir: 'asc' });
  const ids = (rows) => rows.map((r) => r.id);
  assert.deepEqual(ids(core.deriveVersionRows(state.firmwareVersions, core.emptyVersionFilters, null)), ids(core.deriveVersionRows(state.firmwareVersions, core.emptyVersionFilters)));
  assert.deepEqual(ids(core.derivePushTaskRows(state.pushTasks, core.emptyTaskFilters, null)), ids(core.derivePushTaskRows(state.pushTasks, core.emptyTaskFilters)));
});
test('筛选条件组合后为空：关键词 v2.4 + 状态已停用', () => {
  const rows = core.deriveVersionRows(state.firmwareVersions, { ...core.emptyVersionFilters, keyword: 'v2.4', statuses: ['deprecated'] });
  assert.equal(rows.length, 0);
});
test('灰度比例区间筛选只命中区间内的灰度版本，未灰度版本被排除', () => {
  const rows = core.deriveVersionRows(state.firmwareVersions, { ...core.emptyVersionFilters, ratioMin: '1', ratioMax: '30' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'v2.4.0');
});
test('任务筛选：按状态命中已熔断任务；关键词可搜编号', () => {
  assert.equal(core.derivePushTaskRows(state.pushTasks, { ...core.emptyTaskFilters, statuses: ['fused'] }).length, 1);
  assert.equal(core.derivePushTaskRows(state.pushTasks, { ...core.emptyTaskFilters, statuses: ['fused'] })[0].id, 'PT-20260910-01');
  assert.equal(core.derivePushTaskRows(state.pushTasks, { ...core.emptyTaskFilters, keyword: '全量' }).length, 2);
});
test('灰度比例区间校验：下限大于上限、非整数分别给出对应提示', () => {
  assert.equal(core.ratioRangeError({ ratioMin: '90', ratioMax: '10' }), '灰度比例下限不能大于上限');
  assert.equal(core.ratioRangeError({ ratioMin: '1.5', ratioMax: '' }), '灰度比例区间需为 0–100 的整数');
  assert.equal(core.ratioRangeError({ ratioMin: '', ratioMax: '101' }), '灰度比例区间需为 0–100 的整数');
  assert.equal(core.ratioRangeError({ ratioMin: '10', ratioMax: '30' }), null);
});
test('发布时间范围超过 365 天被拒绝，正好 365 天放行', () => {
  assert.equal(core.releasedRangeError(['2026-01-01', '2027-01-10']), '发布时间范围不能超过 365 天');
  assert.equal(core.releasedRangeError(['2026-01-01', '2027-01-01']), null);
});
test('批量停用：混入测试中 / 灰度中版本即不可用', () => {
  assert.equal(core.bulkDisableEligible(['v2.3.1', 'v2.4.0-rc.1'], state.firmwareVersions), true);
  assert.equal(core.bulkDisableEligible(['v2.2.8'], state.firmwareVersions), false);
  assert.equal(core.bulkDisableEligible(['v2.4.0'], state.firmwareVersions), false);
  assert.equal(core.bulkDisableEligible(['v2.4.1', 'v2.3.1'], state.firmwareVersions), false);
});
test('回滚候选：同机型已全量历史版本，排除自身与未全量', () => {
  const source = state.firmwareVersions.find((v) => v.id === 'v2.4.0');
  const candidates = core.rollbackCandidates(source, state.firmwareVersions).map((v) => v.id);
  assert.deepEqual(candidates, ['v2.3.1']);
  assert.equal(core.rollbackConfirmDisabled({ candidateCount: 1, targetId: 'v2.3.1', reason: '升级失败率超阈值' }), false);
  assert.equal(core.rollbackConfirmDisabled({ candidateCount: 1, targetId: 'v2.3.1', reason: '失败' }), true);
  assert.equal(core.rollbackConfirmDisabled({ candidateCount: 1, targetId: undefined, reason: '升级失败率超阈值' }), true);
});
test('行内动作口径：草稿可编辑/提交/删除，灰度中可推送可回滚，已全量可停用', () => {
  const draft = state.firmwareVersions.find((v) => v.id === 'v2.4.2-beta.1');
  const canary = state.firmwareVersions.find((v) => v.id === 'v2.4.0');
  const released = state.firmwareVersions.find((v) => v.id === 'v2.3.1');
  const testing = state.firmwareVersions.find((v) => v.id === 'v2.4.1');
  assert.equal(core.versionActionAllowed(draft, 'edit'), true);
  assert.equal(core.versionActionAllowed(draft, 'submitTest'), true);
  assert.equal(core.versionActionAllowed(draft, 'deleteDraft'), true);
  assert.equal(core.versionActionAllowed(draft, 'newPushTask'), false);
  assert.equal(core.versionActionAllowed(canary, 'newPushTask'), true);
  assert.equal(core.versionActionAllowed(canary, 'rollback'), true);
  assert.equal(core.versionActionAllowed(canary, 'disable'), false);
  assert.equal(core.versionActionAllowed(released, 'disable'), true);
  assert.equal(core.versionActionAllowed(released, 'edit'), false);
  assert.equal(core.versionActionAllowed(testing, 'newPushTask'), true);
  assert.equal(core.versionActionAllowed(testing, 'rollback'), false);
});
test('任务动作口径：执行中可暂停不可恢复；已熔断只能看提示', () => {
  const running = state.pushTasks.find((t) => t.id === 'PT-20260927-01');
  const paused = state.pushTasks.find((t) => t.id === 'PT-20260915-01');
  const fused = state.pushTasks.find((t) => t.id === 'PT-20260910-01');
  const completed = state.pushTasks.find((t) => t.id === 'PT-20260818-01');
  assert.equal(core.pushTaskActionAllowed(running, 'pause'), true);
  assert.equal(core.pushTaskActionAllowed(running, 'resume'), false);
  assert.equal(core.pushTaskActionAllowed(running, 'cancel'), true);
  assert.equal(core.pushTaskActionAllowed(paused, 'resume'), true);
  assert.equal(core.pushTaskActionAllowed(fused, 'cancel'), false);
  assert.equal(core.pushTaskActionAllowed(completed, 'pause'), false);
  assert.equal(core.pushTaskShowsFusedNote(fused), true);
  assert.equal(core.pushTaskShowsFusedNote(running), false);
});
test('绑定设备数：已出货且运行该版本的设备计数，与种子同源', () => {
  const counts = core.boundDeviceCountByVersion(devices);
  const expected = devices.filter((d) => d.firmware && d.shippedAt).length;
  assert.equal([...counts.values()].reduce((a, b) => a + b, 0), expected);
  assert.equal(counts.get('v2.3.1') ?? 0, devices.filter((d) => d.firmware === 'v2.3.1' && d.shippedAt).length);
});
test('新建推送任务草稿校验：全部缺失时五个错误齐全，合法草稿通过', () => {
  const errors = core.pushTaskDraftErrors({ name: '', versionId: null, model: null, ratio: '', threshold: '' });
  assert.deepEqual(Object.keys(errors).sort(), ['model', 'name', 'ratio', 'threshold', 'versionId']);
  assert.equal(errors.ratio, '灰度比例需为 1–100 的整数');
  const valid = core.pushTaskDraftErrors({ name: 'v2.4.1 灰度 10%', versionId: 'v2.4.1', model: 'TS-N2', ratio: '10', threshold: '10' });
  assert.deepEqual(valid, {});
  assert.equal(core.pushTaskDraftErrors({ name: '   ', versionId: 'x', model: 'y', ratio: '10', threshold: '10' }).name, '请填写任务名称');
});
test('预估生效范围：机型必选；省份与 SN 清单按 antd 口径叠加', () => {
  const all = core.estimatePushTarget({ model: 'TS-N2', batches: [], provinces: [], fromVersions: [], ratio: 100 });
  const expected = devices.filter((d) => d.model === 'TS-N2' && d.lifecycle === 'shipped').length;
  assert.equal(all.hit, expected);
  assert.equal(all.estimate, expected);
  assert.equal(core.estimatePushTarget({ model: null, batches: [], provinces: [], fromVersions: [], ratio: 10 }).hit, 0);
  const withSn = core.estimatePushTarget({
    model: 'TS-N2',
    batches: [],
    provinces: [],
    fromVersions: [],
    ratio: 10,
    snList: [devices.find((d) => d.model === 'TS-N2' && d.lifecycle === 'shipped').sn]
  });
  assert.equal(withSn.hit, 1);
  assert.equal(withSn.estimate, 1);
});
test('SN 清单解析：合法 / 机型不符 / 重复 / 不存在分桶正确', () => {
  const shipped = devices.filter((d) => d.lifecycle === 'shipped');
  const n2 = shipped.find((d) => d.model === 'TS-N2');
  const n4 = shipped.find((d) => d.model === 'TS-N4 Pro');
  const parsed = core.parseSnList(`${n2.sn.toLowerCase()} ${n4.sn}, ${n2.sn} ; NOPE-1`, devices, 'TS-N2');
  assert.deepEqual(parsed.valid, [n2.sn]);
  assert.deepEqual(parsed.wrongModel, [n4.sn]);
  assert.deepEqual(parsed.duplicated, [n2.sn]);
  assert.deepEqual(parsed.unknown, ['NOPE-1']);
});
test('逐台结果：失败计数含失败与超时；按结果与 SN 关键词过滤', () => {
  const taskResults = state.pushResults.filter((r) => r.taskId === 'PT-20260927-01');
  assert.equal(core.pushResultFailedCount(taskResults), 1);
  assert.equal(core.filterPushResults(taskResults, { result: 'failed', snKeyword: '' }).length, 1);
  assert.equal(core.filterPushResults(taskResults, { result: '', snKeyword: taskResults[0].sn.slice(-4).toLowerCase() }).length, 1);
  assert.equal(core.filterPushResults(taskResults, { result: 'failed', snKeyword: 'TS' }).length, 1);
});
test('定向摘要、执行时间窗与 KMS 密钥标签的展示口径', () => {
  const running = state.pushTasks.find((t) => t.id === 'PT-20260927-01');
  assert.equal(core.targetingText(running), '批次 B2407 / B2408 / B2409；起始版本 v2.3.1');
  assert.equal(core.windowText(running), '不限');
  assert.match(core.kmsKeyLabel('v2.4.1'), /^kms:tianshu-fw-\*\*\*\*-[0-9a-f]{4}$/);
  assert.equal(core.kmsKeyLabel('v2.4.1'), core.kmsKeyLabel('v2.4.1'));
});

// ---- core/firmwareForm.ts ----
test('版本号校验：必填、格式、重复各有对应提示；编辑时不查重复', () => {
  const base = { version: '', models: ['TS-N2'], note: '', changelog: '0123456789', issueId: '', signMethod: 'kms' };
  const ctx = (editing) => ({ versions: state.firmwareVersions, editing });
  assert.equal(core.firmwareFieldError('version', { ...base, version: ' ' }, ctx(false)), '请填写固件版本号');
  assert.equal(core.firmwareFieldError('version', { ...base, version: '2.4.0' }, ctx(false)), '固件版本号格式不正确（如 v2.4.0 或 v2.4.0-rc.1）');
  assert.equal(core.firmwareFieldError('version', { ...base, version: 'v2.4.0' }, ctx(false)), '版本 v2.4.0 已存在');
  assert.equal(core.firmwareFieldError('version', { ...base, version: 'v2.4.0' }, ctx(true)), null);
  assert.equal(core.firmwareFieldError('version', { ...base, version: 'v9.9.9-rc1' }, ctx(false)), null);
});
test('固件版本号 / 问题单号不先 trim：两侧有空格即格式错误，选填空串仍通过（对齐 antd 原串 pattern）', () => {
  const base = { version: '', models: ['TS-N2'], note: '', changelog: '0123456789', issueId: '', signMethod: 'kms' };
  const ctx = (editing) => ({ versions: state.firmwareVersions, editing });
  const formatMessage = '固件版本号格式不正确（如 v2.4.0 或 v2.4.0-rc.1）';
  assert.equal(core.firmwareFieldError('version', { ...base, version: ' v9.9.9' }, ctx(false)), formatMessage);
  assert.equal(core.firmwareFieldError('version', { ...base, version: 'v9.9.9 ' }, ctx(false)), formatMessage);
  assert.equal(core.firmwareFieldError('version', { ...base, version: ' v2.4.0 ' }, ctx(false)), formatMessage);
  assert.equal(core.firmwareFieldError('version', { ...base, version: 'v9.9.9' }, ctx(false)), null);
  const issueMessage = '关联问题单号格式应为 ISSUE-123 / BUG-123 / TASK-123';
  assert.equal(core.firmwareFieldError('issueId', { ...base, issueId: ' TASK-887' }, ctx(false)), issueMessage);
  assert.equal(core.firmwareFieldError('issueId', { ...base, issueId: 'TASK-887 ' }, ctx(false)), issueMessage);
  assert.equal(core.firmwareFieldError('issueId', { ...base, issueId: '  ' }, ctx(false)), issueMessage);
  assert.equal(core.firmwareFieldError('issueId', { ...base, issueId: '' }, ctx(false)), null);
});
test('变更日志：必填与最短按去空白计，最长按原文计', () => {
  const base = { version: 'v9.9.9', models: ['TS-N2'], note: '', changelog: '0123456789', issueId: '', signMethod: 'kms' };
  const ctx = { versions: state.firmwareVersions, editing: false };
  assert.equal(core.firmwareFieldError('changelog', { ...base, changelog: '   ' }, ctx), '请填写变更日志');
  assert.equal(core.firmwareFieldError('changelog', { ...base, changelog: ' 短日志 ' }, ctx), '变更日志至少 10 字');
  assert.equal(core.firmwareFieldError('changelog', { ...base, changelog: 'x'.repeat(5001) }, ctx), '变更日志不超过 5000 字');
  assert.equal(core.firmwareFieldError('note', { ...base, note: 'x'.repeat(201) }, ctx), '目标版本说明不超过 200 字');
  assert.equal(core.firmwareFieldError('models', { ...base, models: [] }, ctx), '机型至少选择 1 个');
  assert.equal(core.firmwareFieldError('models', { ...base, models: ['a', 'b', 'c', 'd', 'e', 'f'] }, ctx), '机型最多选择 5 个');
  assert.equal(core.firmwareFieldError('issueId', { ...base, issueId: 'XYZ-1' }, ctx), '关联问题单号格式应为 ISSUE-123 / BUG-123 / TASK-123');
  assert.equal(core.firmwareFieldError('issueId', { ...base, issueId: 'TASK-887' }, ctx), null);
});
test('文件选择规则：扩展名与大小不合规时给出具体提示', () => {
  assert.equal(core.packageFileCheck('fw.txt', 1024), '固件包仅支持 .bin / .img / .zip 格式');
  assert.equal(core.packageFileCheck('fw.bin', 600 * 1024 * 1024), '固件包不能超过 512 MB');
  assert.equal(core.packageFileCheck('fw.bin', 1024), null);
  assert.equal(core.signFileCheck('sign.txt', 1024), '签名文件仅支持 .sig / .pem 格式');
  assert.equal(core.signFileCheck('sign.sig', 20 * 1024 * 1024), '签名文件不能超过 10 MB');
  assert.equal(core.signFileCheck('sign.pem', 1024), null);
});
test('提交前置条件：提交测试必须有固件包，手动签名必须有签名文件', () => {
  assert.equal(core.submitBlockReason({ forTesting: true, hasPackage: false, signMethod: 'kms', hasSignFile: false }), '提交测试前请上传固件包');
  assert.equal(core.submitBlockReason({ forTesting: false, hasPackage: true, signMethod: 'manual', hasSignFile: false }), '选择手动签名时请上传签名文件（.sig / .pem）');
  assert.equal(core.submitBlockReason({ forTesting: true, hasPackage: true, signMethod: 'kms', hasSignFile: false }), null);
  assert.equal(core.submitBlockReason({ forTesting: false, hasPackage: false, signMethod: 'kms', hasSignFile: false }), null);
});
test('草稿可编辑口径与未保存改动判定', () => {
  assert.equal(core.versionEditable(state.firmwareVersions.find((v) => v.id === 'v2.4.2-beta.1')), true);
  assert.equal(core.versionEditable(state.firmwareVersions.find((v) => v.id === 'v2.3.1')), false);
  assert.equal(core.versionEditable(undefined), true);
  assert.equal(core.packageInfoChanged(null, null), false);
  assert.equal(core.packageInfoChanged({ fileName: 'fw.bin', sizeBytes: 1, md5: 'x' }, null), true);
});
test('MD5 回填本地确定性生成，32 位十六进制且同名同值', () => {
  const md5 = core.pseudoMd5('tianshu-firmware-v2.4.1.bin', 222298112);
  assert.match(md5, /^[0-9a-f]{32}$/);
  assert.equal(md5, core.pseudoMd5('tianshu-firmware-v2.4.1.bin', 222298112));
});

// ---- core/feedback.ts（批次 B）----
test('反馈默认提交时间范围是最近 30 天且起点为当天 00:00（antd 口径）', () => {
  const init = core.initialFeedbackState({ search: '', storage: memory(), now: Date.now() });
  assert.deepEqual(init.filters.submittedRange, ['2026-08-29 00:00', '2026-09-28 15:00']);
  assert.equal(init.filters.ticketId, '');
  assert.equal(init.currentTicketId, null);
  assert.equal(init.manualPrefill.open, false);
});
test('网址预置参数覆盖记忆：ticket 同时驱动详情抽屉', () => {
  const t = state.feedbackTickets[0];
  const store = memory({ 'tianshu_feedback_filter_pref': { savedAt: Date.now(), values: { priorities: ['P1'] } } });
  const init = core.initialFeedbackState({ search: `?ticket=${t.id}&sn=TS1&sla=overdue&status=pending&create=1&userId=U1&phone=138****&appVersion=3.2.4`, storage: store, now: Date.now() });
  assert.equal(init.filters.ticketId, t.id);
  assert.equal(init.filters.sn, 'TS1');
  assert.equal(init.filters.slaState, 'overdue');
  assert.deepEqual(init.filters.statuses, ['pending']);
  assert.deepEqual(init.filters.priorities, ['P1']);
  assert.equal(init.currentTicketId, t.id);
  assert.deepEqual(init.manualPrefill, { open: true, userId: 'U1', contact: '138****', sn: 'TS1', appVersion: '3.2.4' });
});
test('超过 24 小时的筛选记忆被忽略', () => {
  const store = memory({ 'tianshu_feedback_filter_pref': { savedAt: Date.now() - 25 * 3600 * 1000, values: { priorities: ['P1'] } } });
  const init = core.initialFeedbackState({ search: '', storage: store, now: Date.now() });
  assert.deepEqual(init.filters.priorities, []);
});
test('填了反馈编号就只按编号精确单查（大小写不敏感），其余条件短路', () => {
  const tickets = state.feedbackTickets;
  const t = tickets.find((x) => x.status === 'processing');
  const filters = { ...core.initialFeedbackFilters, ticketId: t.id.toLowerCase(), priorities: ['P3'], statuses: ['closed'] };
  const rows = tickets.filter((x) => core.matchesFeedbackFilters(x, filters));
  assert.deepEqual(rows.map((x) => x.id), [t.id]);
});
test('组合筛选后为空，Tab 计数同样为空', () => {
  const tickets = state.feedbackTickets;
  const filters = { ...core.initialFeedbackFilters, statuses: ['rejected'], sn: 'TS-X-DOES-NOT-EXIST' };
  assert.equal(tickets.filter((x) => core.matchesFeedbackFilters(x, filters)).length, 0);
  const counts = core.statusTabCounts(tickets, filters);
  assert.equal(counts.all, 0);
  assert.equal(counts.rejected, 0);
});
test('Tab 与状态筛选双向联动：单状态停在该状态，多选/清空回「全部」', () => {
  assert.equal(core.tabKeyForStatuses([]), 'all');
  assert.equal(core.tabKeyForStatuses(['awaiting_user']), 'awaiting_user');
  assert.equal(core.tabKeyForStatuses(['pending', 'closed']), 'all');
  assert.deepEqual(core.statusesForTab('closed'), ['closed']);
  assert.deepEqual(core.statusesForTab('all'), []);
});
test('状态流转守卫与行内主推动作：终态全部拒绝', () => {
  const tickets = state.feedbackTickets;
  const byStatus = (s) => tickets.find((x) => x.status === s);
  const pending = byStatus('pending');
  const resolved = byStatus('resolved');
  const terminal = byStatus('closed') ?? byStatus('rejected');
  assert.ok(pending && resolved && terminal);
  assert.equal(core.canReceive(pending), true);
  assert.equal(core.isAssignable(pending), true);
  assert.equal(core.canClose(resolved), true);
  assert.equal(core.canResolve(resolved), false);
  assert.equal(core.canReply(resolved), false);
  for (const fn of [core.canReceive, core.canReply, core.canResolve, core.canClose, core.canReject, core.isAssignable]) {
    assert.equal(fn(terminal), false);
  }
  assert.equal(core.rowPrimaryAction(pending.status), 'receive');
  assert.equal(core.rowPrimaryAction('awaiting_user'), 'resolve');
  assert.equal(core.rowPrimaryAction('closed'), null);
});
test('驳回与回复校验按 antd 文案与原始输入判定', () => {
  assert.equal(core.rejectReasonError(''), '驳回原因必填');
  assert.equal(core.rejectReasonError('1234'), '驳回原因至少 5 个字');
  assert.equal(core.rejectReasonError('x'.repeat(201)), '驳回原因不得超过 200 字');
  assert.equal(core.rejectReasonError('该工单信息不足，予以驳回'), null);
  assert.equal(core.replyContentError(''), '请输入回复内容');
  assert.equal(core.replyContentError('x'.repeat(501)), '回复内容不得超过 500 字');
  assert.equal(core.replyContentError('已联系用户说明进度'), null);
});
test('客服代录校验：SN 必须存在，空串字段规整为 undefined', () => {
  const t = state.feedbackTickets.find((x) => x.sn);
  assert.deepEqual(core.manualTicketFieldErrors({ content: '客户反馈风扇异响', sn: t.sn }, devices), {});
  assert.deepEqual(core.manualTicketFieldErrors({ content: '', sn: '' }, devices), { content: '请输入反馈内容' });
  const bad = core.manualTicketFieldErrors({ content: '内容', sn: 'TS00000000NONE' }, devices);
  assert.equal(bad.sn, '系统内未找到该 SN 对应的设备');
  const normalized = core.normalizeManualForm({ type: 'fault', priority: 'P2', content: '  原始输入保留  ', sn: '', userId: '', contact: '', appVersion: '' });
  assert.equal(normalized.sn, undefined);
  assert.equal(normalized.userId, undefined);
  assert.equal(normalized.content, '  原始输入保留  ');
});
test('客服代录 SN 带首尾空格：校验通过的合法 SN 去空格后提交，只有空格按未关联', () => {
  const sn = devices[0].sn;
  assert.deepEqual(core.manualTicketFieldErrors({ content: '内容', sn: ` ${sn} ` }, devices), {});
  const base = { type: 'fault', priority: 'P2', content: '内容', userId: '', contact: '', appVersion: '' };
  assert.equal(core.normalizeManualForm({ ...base, sn: ` ${sn} ` }).sn, sn);
  assert.equal(core.normalizeManualForm({ ...base, sn: '   ' }).sn, undefined);
});
test('筛选记忆不写入隐私字段（编号 / SN / 处理人）', () => {
  const payload = core.filterPrefToStore({ ...core.initialFeedbackFilters, ticketId: 'FB123', sn: 'TS1', assignee: '周', priorities: ['P2'] }, 1000);
  assert.equal(payload.savedAt, 1000);
  assert.deepEqual(payload.values.priorities, ['P2']);
  assert.ok(!('ticketId' in payload.values) && !('sn' in payload.values) && !('assignee' in payload.values));
});
test('导出超过 5,000 条被拦截并给出提示；指派默认人选为第一位客服', () => {
  assert.equal(core.exportBlockedReason(5000), null);
  assert.match(core.exportBlockedReason(5001), /超出 5,000 条上限/);
  const staff = [{ value: '运维 · 周启明' }, { value: '客服 · 许知遥' }];
  assert.equal(core.defaultAssigneeValue(staff), '客服 · 许知遥');
});
test('排序：默认按 SLA 剩余升序；新列升序 → 降序 → 清除，清除后行保持传入顺序', () => {
  const tickets = state.feedbackTickets;
  const sorted = [...tickets].sort(core.compareTickets(core.FEEDBACK_DEFAULT_SORT));
  const deltas = sorted.map(core.slaDeltaMinutes);
  assert.deepEqual([...deltas].sort((a, b) => a - b), deltas);
  // 初始 SLA 升序：点它先变降序，再点清除，再点回升序。
  assert.deepEqual(core.toggleFeedbackSort(core.FEEDBACK_DEFAULT_SORT, 'sla'), { key: 'sla', dir: 'desc' });
  assert.equal(core.toggleFeedbackSort({ key: 'sla', dir: 'desc' }, 'sla'), null);
  assert.deepEqual(core.toggleFeedbackSort(null, 'sla'), { key: 'sla', dir: 'asc' });
  assert.deepEqual(core.toggleFeedbackSort(core.FEEDBACK_DEFAULT_SORT, 'priority'), { key: 'priority', dir: 'asc' });
  assert.deepEqual(core.toggleFeedbackSort({ key: 'priority', dir: 'asc' }, 'priority'), { key: 'priority', dir: 'desc' });
  assert.equal(core.toggleFeedbackSort({ key: 'priority', dir: 'desc' }, 'priority'), null);
  const shuffled = [...tickets].reverse();
  assert.deepEqual([...shuffled].sort(core.compareTickets(null)).map((t) => t.id), shuffled.map((t) => t.id));
  assert.notDeepEqual(sorted.map((t) => t.id), shuffled.map((t) => t.id));
});

// ---- core/rmaList.ts + core/deviceDetail.ts（批次 C）----
test('RMA 网址直达：sn/rma/status=open 以网址为准，rma 同时打开详情抽屉', () => {
  const rma = state.rmas[0];
  const s = core.initialRmaListState({ search: `?sn=${rma.sn}&rma=${rma.id}&status=open`, storage: memory(), now: Date.now() });
  assert.equal(s.filters.sn, rma.sn);
  assert.equal(s.filters.rmaId, rma.id);
  assert.deepEqual(s.filters.decisions, ['pending_decision']);
  assert.equal(s.openId, rma.id);
  assert.equal(s.createPrefill, null);
});
test('RMA 客户反馈转退货直达：new=1 预填 SN 与来源工单', () => {
  const shippedSn = devices.find((device) => device.lifecycle === 'shipped').sn;
  const s = core.initialRmaListState({ search: `?new=1&sn=${shippedSn}&source_feedback=FB-1`, storage: memory(), now: Date.now() });
  assert.deepEqual(s.createPrefill, { sn: shippedSn, sourceFeedbackId: 'FB-1' });
  assert.equal(s.filters.sn, shippedSn);
});
test('RMA 筛选记忆：24 小时内恢复，超时或损坏按空筛选', () => {
  const savedAt = 1_760_000_000_000;
  const store = memory({ [core.RMA_STORAGE_KEYS.filter]: { savedAt, filters: { ...core.emptyRmaFilters, sn: 'TS2408', reasons: ['function_issue'] } } });
  const fresh = core.initialRmaListState({ search: '', storage: store, now: savedAt + 60_000 });
  assert.equal(fresh.filters.sn, 'TS2408');
  assert.deepEqual(fresh.filters.reasons, ['function_issue']);
  const stale = core.initialRmaListState({ search: '', storage: store, now: savedAt + core.RMA_FILTER_TTL + 1 });
  assert.deepEqual(stale.filters, core.emptyRmaFilters);
  const broken = core.initialRmaListState({ search: '', storage: { getItem: () => '{oops', setItem: () => {} }, now: savedAt });
  assert.deepEqual(broken.filters, core.emptyRmaFilters);
});
test('RMA 筛选口径：单号不足 4 位不过滤，SN 精确匹配，待裁决与工作台卡片同源', () => {
  const rmas = state.rmas;
  assert.equal(core.filterRmaRecords(rmas, { ...core.emptyRmaFilters, rmaId: 'RMA' }).length, rmas.length);
  const bySn = core.filterRmaRecords(rmas, { ...core.emptyRmaFilters, sn: rmas[0].sn.toLowerCase() });
  assert.deepEqual(bySn.map((record) => record.id), [rmas[0].id]);
  const pendingDecision = core.filterRmaRecords(rmas, { ...core.emptyRmaFilters, decisions: ['pending_decision'] });
  const expected = rmas.filter((record) => record.decisionMethod === 'pending_decision');
  assert.deepEqual(pendingDecision.map((record) => record.id).sort(), expected.map((record) => record.id).sort());
  assert.ok(expected.length > 0, '样例数据里应有待裁决单');
});
test('RMA 筛选组合后为空 + 默认按发起时间降序', () => {
  const empty = core.filterRmaRecords(state.rmas, { ...core.emptyRmaFilters, createdRange: ['2020-01-01', '2020-01-31'] });
  assert.equal(empty.length, 0);
  const rows = core.filterRmaRecords(state.rmas, core.emptyRmaFilters);
  for (let i = 1; i < rows.length; i += 1) assert.ok(rows[i - 1].createdAt >= rows[i].createdAt);
});
test('RMA 行操作状态机：各状态只露出对应操作', () => {
  const rmas = state.rmas;
  const deviceBySn = (sn) => devices.find((device) => device.sn === sn);
  const pending = rmas.find((record) => record.arrivalStatus === 'pending');
  assert.deepEqual(core.rmaRowActions(pending, deviceBySn(pending.sn)), {
    canEdit: true, canConfirmArrival: true, canInspect: false, decisionMethod: null, canExportScrapCert: false
  });
  const arrived = rmas.find((record) => record.arrivalStatus === 'arrived_pending_check');
  assert.deepEqual(core.rmaRowActions(arrived, deviceBySn(arrived.sn)), {
    canEdit: false, canConfirmArrival: false, canInspect: true, decisionMethod: null, canExportScrapCert: false
  });
  assert.equal(core.rmaRowActions(rmas.find((record) => record.arrivalStatus === 'inspecting'), undefined).canInspect, true);
  const inspected = rmas.find((record) => record.arrivalStatus === 'inspected' && record.decisionMethod === 'pending_decision');
  // 已检测待裁决：只露出与检测结论相符的一种处理方式。
  assert.equal(core.rmaRowActions(inspected, deviceBySn(inspected.sn)).decisionMethod, inspected.conclusion);
  // 已裁决待关闭的历史单：不再露出裁决；设备已报废的可导出凭证。
  const scrapped = rmas.find((record) => deviceBySn(record.sn)?.lifecycle === 'scrapped');
  assert.equal(core.rmaRowActions(scrapped, deviceBySn(scrapped.sn)).decisionMethod, null);
  assert.equal(core.rmaRowActions(scrapped, deviceBySn(scrapped.sn)).canExportScrapCert, true);
});
test('RMA 批量关闭资格：全选当前在途单不可关；已裁决且设备离开的可关', () => {
  const rmas = state.rmas;
  const deviceBySn = (sn) => devices.find((device) => device.sn === sn);
  const inFlight = rmas.filter((record) => deviceBySn(record.sn)?.lifecycle === 'rma');
  const bad = core.rmaCloseEligibility(inFlight, deviceBySn);
  assert.equal(bad.ineligibleCount, inFlight.length);
  assert.equal(bad.disabled, true);
  assert.equal(bad.reason, `所选项中有 ${inFlight.length} 条不满足关闭条件（需已裁决且设备已离开退货流程）`);
  const history = rmas.filter((record) => record.decisionMethod !== 'pending_decision');
  const good = core.rmaCloseEligibility(history, deviceBySn);
  assert.equal(good.ineligibleCount, 0);
  assert.equal(good.disabled, false);
  assert.equal(good.reason, null);
  assert.ok(history.length > 0, '样例数据里应有已裁决历史单');
});
test('RMA 新建校验：SN 必填与格式、原因来源必填、「其他」必填描述', () => {
  const shippedSn = devices.find((device) => device.lifecycle === 'shipped').sn;
  const base = { sn: shippedSn, reasonCode: 'function_issue', source: 'ecommerce', description: '' };
  assert.deepEqual(core.createRmaErrors(base), {});
  assert.equal(core.createRmaErrors({ ...base, sn: '' }).sn, '请输入 SN');
  assert.equal(core.createRmaErrors({ ...base, sn: 'TS 2408' }).sn, 'SN 只能包含数字与大写字母');
  assert.equal(core.createRmaErrors({ ...base, reasonCode: '' }).reasonCode, '请选择退货原因');
  assert.equal(core.createRmaErrors({ ...base, reasonCode: 'other' }).description, '原因选择「其他」时请填写问题描述');
  assert.equal(core.createRmaErrors({ ...base, description: 'x'.repeat(501) }).description, '问题描述不超过 500 字');
});
test('RMA 选填文本纯空格报错、空串通过（描述 / 检测备注 / 裁决说明，沿用各自规则的文案）', () => {
  const shippedSn = devices.find((device) => device.lifecycle === 'shipped').sn;
  const create = { sn: shippedSn, reasonCode: 'function_issue', source: 'ecommerce', description: '' };
  const otherMessage = '原因选择「其他」时请填写问题描述';
  assert.equal(core.createRmaErrors({ ...create, description: '   ' }).description, otherMessage);
  assert.equal(core.createRmaErrors({ ...create, description: '' }).description, undefined);
  assert.equal(core.editRmaErrors({ reasonCode: 'function_issue', source: 'ecommerce', description: '  ' }).description, otherMessage);
  assert.deepEqual(core.editRmaErrors({ reasonCode: 'function_issue', source: 'ecommerce', description: '' }), {});
  const inspect = { conclusion: 'repair', appearanceScore: 'B', functionChecks: ['开机自检'], inspectNote: '   ' };
  assert.equal(core.inspectRmaErrors(inspect).inspectNote, '检测结论为「报废」时检测备注必填');
  assert.deepEqual(core.inspectRmaErrors({ ...inspect, inspectNote: '' }), {});
  assert.equal(core.decideRmaErrors({ decisionNote: '  ', expectedRepairDate: null }, 'restock').decisionNote, '报废裁决说明必填');
  assert.deepEqual(core.decideRmaErrors({ decisionNote: '', expectedRepairDate: null }, 'restock'), {});
});
test('RMA 发起时间排序三态：初始降序首次点击即清除，清除后行保持传入顺序', () => {
  assert.equal(core.toggleRmaSort(core.DEFAULT_RMA_SORT), null);
  assert.deepEqual(core.toggleRmaSort(null), { key: 'createdAt', dir: 'asc' });
  assert.deepEqual(core.toggleRmaSort({ key: 'createdAt', dir: 'asc' }), { key: 'createdAt', dir: 'desc' });
  const reversed = state.rmas.slice().reverse();
  assert.deepEqual(core.filterRmaRecords(reversed, core.emptyRmaFilters, null).map((r) => r.id), reversed.map((r) => r.id));
  assert.deepEqual(core.filterRmaRecords(reversed, core.emptyRmaFilters).map((r) => r.createdAt), reversed.map((r) => r.createdAt).sort().reverse());
});
test('自然日差：按日历日数，不经毫秒与时区', () => {
  assert.equal(core.naturalDayDiff('2026-01-01', '2026-01-31'), 30);
  assert.equal(core.naturalDayDiff('2025-09-28', '2026-09-28'), 365);
  assert.equal(core.naturalDayDiff('2026-09-28', '2025-09-28'), -365);
  assert.equal(core.naturalDayDiff('2024-02-28', '2024-03-01'), 2);
  assert.equal(core.naturalDayDiff('2026-03-07', '2026-03-09'), 2);
  assert.equal(core.naturalDayDiff('2026-10-31', '2026-11-02'), 2);
  assert.equal(core.naturalDayDiff('2026-01-01', '2026-01-01 23:59'), 0);
  assert.equal(core.naturalDayDiff('2025-01-01', '2026-01-02'), core.RMA_CREATED_RANGE_SPAN_DAYS);
  assert.ok(Math.abs(core.naturalDayDiff('2025-01-01', '2026-01-03')) > core.RMA_CREATED_RANGE_SPAN_DAYS);
  assert.ok(Number.isNaN(core.naturalDayDiff('2026-01-01', 'abc')));
});
test('RMA 检测校验：结论/评分/功能检测必填，报废必填备注', () => {
  const base = { conclusion: 'repair', appearanceScore: 'B', functionChecks: ['开机自检'], inspectNote: '' };
  assert.deepEqual(core.inspectRmaErrors(base), {});
  assert.equal(core.inspectRmaErrors({ ...base, conclusion: '' }).conclusion, '请选择检测结论');
  assert.equal(core.inspectRmaErrors({ ...base, appearanceScore: '' }).appearanceScore, '请选择外观评分');
  assert.equal(core.inspectRmaErrors({ ...base, functionChecks: [] }).functionChecks, '功能检测至少选择 1 项');
  assert.equal(core.inspectRmaErrors({ ...base, conclusion: 'scrap' }).inspectNote, '检测结论为「报废」时检测备注必填');
});
test('RMA 裁决校验：报废必填说明，返修必填预计完成日期', () => {
  assert.equal(core.decideRmaErrors({ decisionNote: '', expectedRepairDate: null }, 'scrap').decisionNote, '报废裁决说明必填');
  assert.deepEqual(core.decideRmaErrors({ decisionNote: '正常损耗', expectedRepairDate: null }, 'restock'), {});
  assert.equal(core.decideRmaErrors({ decisionNote: '', expectedRepairDate: null }, 'repair').expectedRepairDate, '返修裁决请填写预计返修完成日期');
  assert.deepEqual(core.decideRmaErrors({ decisionNote: '', expectedRepairDate: '2026-10-01' }, 'repair'), {});
});
test('设备详情：返回标签按来源页映射，未知来源回落「全部设备」', () => {
  assert.equal(core.backLabelFor('/exceptions/rma?sn=TS'), '退货 RMA');
  assert.equal(core.backLabelFor('/tianshu/device-ops/alerts'), '告警处置');
  assert.equal(core.backLabelFor('/lifecycle/passport/TS24070101'), '数字护照');
  assert.equal(core.backLabelFor('/unknown/page'), '全部设备');
});
test('设备详情：未处理告警聚合与最高级别，计数与告警处置页同源', () => {
  const anySn = state.alerts.find((alert) => alert.status === 'open' || alert.status === 'processing').sns[0];
  const scope = core.deviceDetailScope({ sn: anySn, alerts: state.alerts, feedbackTickets: state.feedbackTickets });
  const expectActive = state.alerts.filter((alert) => alert.sns.includes(anySn) && (alert.status === 'open' || alert.status === 'processing'));
  assert.equal(scope.activeAlerts.length, expectActive.length);
  assert.ok(scope.activeAlerts.length > 0, '样例数据里应有未处理告警的设备');
  assert.equal(scope.topLevel, expectActive.map((alert) => alert.level).sort()[0]);
  assert.equal(scope.unresolvedCount, (unresolved.get(anySn) ?? 0));
  const none = core.deviceDetailScope({ sn: 'NO-SUCH-SN', alerts: state.alerts, feedbackTickets: state.feedbackTickets });
  assert.equal(none.activeAlerts.length, 0);
  assert.equal(none.unresolvedCount, 0);
  assert.equal(none.openTicketCount, 0);
});
test('设备详情：仅出货设备可发起 RMA；原因与来源必填', () => {
  assert.equal(core.canStartRma({ lifecycle: 'shipped' }), true);
  assert.equal(core.canStartRma({ lifecycle: 'rma' }), false);
  assert.deepEqual(core.startRmaErrors({ reason: '', source: '' }), { reason: '请选择退货原因', source: '请选择退货来源' });
  assert.deepEqual(core.startRmaErrors({ reason: 'function_issue', source: 'ecommerce' }), {});
});

// ---- core/flashingList.ts + core/flashingForm.ts（批次 D）----
test('工作台「待烧录发证」跳来：以网址为准、非法状态过滤、不叠记忆时间', () => {
  const s = core.initialFlashingListState({
    search: '?status=flashing,flash_failed,bogus&sn=TS',
    storage: memory({ 'device-ops:flashing-filter': { ...core.emptyFlashingFilters, startedAt: ['2026-01-01', '2026-01-01'] } })
  });
  assert.deepEqual(s.filters.lifecycles, ['flashing', 'flash_failed']);
  assert.equal(s.filters.sn, 'TS');
  assert.equal(s.filters.startedAt, null);
});
test('无网址时恢复上次筛选记忆（本页无隐私字段，全条件可记忆）', () => {
  const stored = { ...core.emptyFlashingFilters, models: ['TS-N2'], stations: ['FLASH-01'], retryMin: 1 };
  const s = core.initialFlashingListState({ search: '', storage: memory({ 'device-ops:flashing-filter': stored }) });
  assert.deepEqual(s.filters.models, ['TS-N2']);
  assert.deepEqual(s.filters.stations, ['FLASH-01']);
  assert.equal(s.filters.retryMin, 1);
});
test('筛选匹配：设备状态筛只留对应记录；与不存在 SN 组合后为空', () => {
  const records = state.flashingRecords;
  const bySn = new Map(devices.map((d) => [d.sn, d]));
  const hit = records.filter((r) => core.matchesFlashingFilters(r, bySn.get(r.sn), { ...core.emptyFlashingFilters, lifecycles: ['flash_failed'] }));
  assert.ok(hit.length > 0, '样例数据里应有烧录失败的记录');
  assert.ok(hit.every((r) => bySn.get(r.sn)?.lifecycle === 'flash_failed'));
  const none = records.filter((r) => core.matchesFlashingFilters(r, bySn.get(r.sn), { ...core.emptyFlashingFilters, sn: 'NO-SUCH-SN' }));
  assert.equal(none.length, 0);
});
test('重试次数上下限双边卡死记录', () => {
  const target = state.flashingRecords.find((r) => r.retryCount > 0);
  assert.ok(target, '样例数据里应有重试过的记录');
  const bySn = new Map(devices.map((d) => [d.sn, d]));
  assert.equal(core.matchesFlashingFilters(target, bySn.get(target.sn), { ...core.emptyFlashingFilters, retryMin: target.retryCount + 1 }), false);
  assert.equal(core.matchesFlashingFilters(target, bySn.get(target.sn), { ...core.emptyFlashingFilters, retryMax: target.retryCount - 1 }), false);
  assert.equal(core.matchesFlashingFilters(target, bySn.get(target.sn), { ...core.emptyFlashingFilters, retryMin: target.retryCount, retryMax: target.retryCount }), true);
});
test('固件版本筛选：草稿与停用不进选项、按机型联动；蓝点是已全量/灰度的最高版本', () => {
  const versions = state.firmwareVersions;
  const opts = core.flashingFilterVersions(versions, []);
  assert.ok(opts.length > 0);
  assert.ok(opts.every((o) => !['draft', 'deprecated'].includes(versions.find((v) => v.version === o.value).status)));
  const onlyN2 = core.flashingFilterVersions(versions, ['TS-N2']);
  assert.ok(onlyN2.every((o) => versions.find((v) => v.version === o.value).models.includes('TS-N2')));
  const latest = core.latestPublishedVersion(versions);
  assert.ok(latest);
  assert.ok(['released', 'canary'].includes(versions.find((v) => v.version === latest).status));
});
test('批量可用性：全是进行中放行批量失败；混入一条非进行中即拦下', () => {
  const records = state.flashingRecords;
  const lifecycleOf = (sn) => devices.find((d) => d.sn === sn)?.lifecycle;
  const processing = records.filter((r) => r.result === 'processing');
  assert.ok(processing.length >= 1, '样例数据里应有进行中的记录');
  const okBulk = core.flashingBulkAvailability(processing, lifecycleOf);
  assert.equal(okBulk.markFail.ok, true);
  assert.equal(okBulk.scrap.ok, false);
  const other = records.find((r) => r.result !== 'processing');
  assert.ok(other);
  const mixed = core.flashingBulkAvailability([processing[0], other], lifecycleOf);
  assert.equal(mixed.markFail.ok, false);
  assert.equal(mixed.markFail.reason, '仅选中行全部为「烧录·发证」时可用');
});
test('批量报废只放行「失败且达上限且设备烧录失败」的组合', () => {
  const records = state.flashingRecords;
  const lifecycleOf = (sn) => devices.find((d) => d.sn === sn)?.lifecycle;
  const scrappable = records.filter((r) => r.result === 'failed' && r.retryCount >= r.retryLimit && lifecycleOf(r.sn) === 'flash_failed');
  assert.ok(scrappable.length > 0, '样例数据里应有可报废的记录');
  assert.equal(core.flashingBulkAvailability(scrappable.slice(0, 2), lifecycleOf).scrap.ok, true);
  const retryable = records.find((r) => r.result === 'failed' && r.retryCount < r.retryLimit);
  assert.ok(retryable);
  assert.equal(core.flashingBulkAvailability([scrappable[0], retryable], lifecycleOf).scrap.ok, false);
});
test('行内操作显隐与 store 前置同源：进行中可标成功、查证书只认已签发', () => {
  const processing = state.flashingRecords.find((r) => r.result === 'processing');
  const device = devices.find((d) => d.sn === processing.sn);
  assert.equal(core.canMarkFlash(device), true);
  assert.equal(core.canRetryFlash(processing, device), false);
  assert.equal(core.canScrapFlash(processing, device), false);
  assert.equal(core.canViewFlashingCert(processing), processing.certState === 'cert_issued');
});
test('失败登记表单口径：缺分类、空描述、超 500 字都拦下', () => {
  assert.ok(core.flashingFailureFormError({ category: null, description: '写入失败' }) !== null);
  assert.ok(core.flashingFailureFormError({ category: '其他', description: '   ' }) !== null);
  assert.ok(core.flashingFailureFormError({ category: '其他', description: 'x'.repeat(501) }) !== null);
  assert.equal(core.flashingFailureFormError({ category: '其他', description: '写入校验失败，已重测' }), null);
});
test('烧录列表排序三态：初始烧录时间降序，首次点击即清除；新列升序；清除后行保持传入顺序', () => {
  assert.deepEqual(core.DEFAULT_FLASHING_SORT, { key: 'startedAt', dir: 'desc' });
  assert.equal(core.toggleFlashingSort(core.DEFAULT_FLASHING_SORT, 'startedAt'), null);
  assert.deepEqual(core.toggleFlashingSort(null, 'startedAt'), { key: 'startedAt', dir: 'asc' });
  assert.deepEqual(core.toggleFlashingSort(core.DEFAULT_FLASHING_SORT, 'retry'), { key: 'retry', dir: 'asc' });
  assert.deepEqual(core.toggleFlashingSort({ key: 'retry', dir: 'asc' }, 'retry'), { key: 'retry', dir: 'desc' });
  assert.equal(core.toggleFlashingSort({ key: 'retry', dir: 'desc' }, 'retry'), null);
  const records = state.flashingRecords.slice().reverse();
  const cleared = core.sortFlashingRecords(records, null);
  assert.deepEqual(cleared.map((r) => r.sn), records.map((r) => r.sn));
  assert.notStrictEqual(cleared, records);
  const asc = core.sortFlashingRecords(records, { key: 'startedAt', dir: 'asc' }).map((r) => r.startedAt);
  assert.deepEqual([...asc].sort(), asc);
  const desc = core.sortFlashingRecords(records, core.DEFAULT_FLASHING_SORT).map((r) => r.startedAt);
  assert.deepEqual([...desc].sort().reverse(), desc);
});
test('任务名称：查重命中种子、允许中间空格、超长与非法字符拦截', () => {
  const names = state.flashingTasks.map((t) => t.taskName);
  const v = core.initialFlashingFormValues;
  assert.equal(core.validateFlashingField('taskName', { ...v, taskName: '  ' }, names), '请填写任务名称');
  assert.equal(core.validateFlashingField('taskName', { ...v, taskName: names[0] }, names), '任务名称已存在');
  assert.equal(core.validateFlashingField('taskName', { ...v, taskName: 'B2411 首批烧录' }, names), null);
  assert.equal(core.validateFlashingField('taskName', { ...v, taskName: 'a'.repeat(65) }, names), '任务名称不超过 64 字');
  assert.equal(core.validateFlashingField('taskName', { ...v, taskName: 'bad@name' }, names), '任务名称仅支持中文、字母、数字、空格与 _-. 字符');
});
test('重试上限 1–10 整数；截止 SN 必须不小于起始 SN', () => {
  const v = core.initialFlashingFormValues;
  const message = '重试上限最大 10 次，超限设备将自动进入报废流程';
  assert.equal(core.validateFlashingField('retryLimit', { ...v, retryLimit: '0' }, []), message);
  assert.equal(core.validateFlashingField('retryLimit', { ...v, retryLimit: '11' }, []), message);
  assert.equal(core.validateFlashingField('retryLimit', { ...v, retryLimit: '2.5' }, []), message);
  assert.equal(core.validateFlashingField('retryLimit', { ...v, retryLimit: '5' }, []), null);
  const range = { ...v, scopeType: 'sn_range', snStart: 'TS24100451', snEnd: 'TS24100437' };
  assert.equal(core.validateFlashingField('snEnd', range, []), '截止 SN 需不小于起始 SN（字典序）');
});
test('SN 范围起止不先 trim：两侧有空格即格式错误，空串仍是必填提示（对齐 antd 原串 pattern）', () => {
  const v = { ...core.initialFlashingFormValues, scopeType: 'sn_range', snStart: 'TS24100437', snEnd: 'TS24100451' };
  assert.equal(core.validateFlashingField('snStart', v, []), null);
  assert.equal(core.validateFlashingField('snEnd', v, []), null);
  assert.equal(core.validateFlashingField('snStart', { ...v, snStart: ' TS24100437' }, []), '起始 SN 仅支持大写字母与数字');
  assert.equal(core.validateFlashingField('snStart', { ...v, snStart: '   ' }, []), '起始 SN 仅支持大写字母与数字');
  assert.equal(core.validateFlashingField('snEnd', { ...v, snEnd: 'TS24100451 ' }, []), '截止 SN 仅支持大写字母与数字');
  assert.equal(core.validateFlashingField('snStart', { ...v, snStart: '' }, []), '请填写起始 SN');
  assert.equal(core.validateFlashingField('snEnd', { ...v, snEnd: '' }, []), '请填写截止 SN');
});
test('重试次数输入归整参数与 antd InputNumber 一致：烧录新建 1–10、烧录列表筛选 0–999、告警规则只取整', () => {
  assert.deepEqual(core.FLASHING_RETRY_LIMIT_INTEGER, { min: 1, max: 10 });
  assert.deepEqual(core.FLASHING_RETRY_FILTER_INTEGER, { min: 0, max: 999 });
  assert.deepEqual(core.ALERT_RULE_INTEGER_INPUT, {});
  assert.equal(core.normalizeInteger('1.5', core.FLASHING_RETRY_LIMIT_INTEGER), '2');
  assert.equal(core.normalizeInteger('0', core.FLASHING_RETRY_LIMIT_INTEGER), '1');
  assert.equal(core.normalizeInteger('11', core.FLASHING_RETRY_LIMIT_INTEGER), '10');
  assert.equal(core.normalizeInteger('0.4', core.FLASHING_RETRY_FILTER_INTEGER), '0');
  assert.equal(core.normalizeInteger('1000', core.FLASHING_RETRY_FILTER_INTEGER), '999');
  assert.equal(core.normalizeInteger('150.5', core.ALERT_RULE_INTEGER_INPUT), '151');
  assert.equal(core.normalizeInteger('0', core.ALERT_RULE_INTEGER_INPUT), '0');
  assert.equal(core.normalizeInteger('-3.2', core.ALERT_RULE_INTEGER_INPUT), '-3');
});
test('按批次解析命中全部批次内收货入场设备；SN 列表逐行点名重复/非法/不存在/非收货', () => {
  const v = core.initialFlashingFormValues;
  const byBatch = core.flashingScopeResult(devices, { ...v, batches: ['B2410'] });
  const expected = devices.filter((d) => d.lifecycle === 'received' && d.batch === 'B2410');
  assert.ok(expected.length > 0);
  assert.equal(byBatch.devices.length, expected.length);
  assert.deepEqual(byBatch.errors, []);
  const goodSn = expected[0].sn;
  const notReceivedSn = devices.find((d) => d.lifecycle !== 'received').sn;
  const res = core.flashingScopeResult(devices, { ...v, scopeType: 'sn_list', snList: `${goodSn}\n${goodSn}\nabc\nZZZ999\n${notReceivedSn}` });
  assert.deepEqual(res.devices.map((d) => d.sn), [goodSn]);
  assert.ok(res.errors[0].includes('第 2 行') && res.errors[0].includes('重复'));
  assert.ok(res.errors[1].includes('第 3 行') && res.errors[1].includes('非法字符'));
  assert.ok(res.errors[2].includes('第 4 行') && res.errors[2].includes('不存在'));
  assert.ok(res.errors[3].includes('第 5 行') && res.errors[3].includes('不是收货入场状态'));
});
test('SN 范围混入非收货设备时报错并点名第一台；单台收货设备的单点范围正常放行', () => {
  const sns = devices.map((d) => d.sn).sort();
  const res = core.flashingScopeResult(devices, { ...core.initialFlashingFormValues, scopeType: 'sn_range', snStart: sns[0], snEnd: sns[sns.length - 1] });
  assert.equal(res.devices.length, 0);
  assert.ok(res.errors[0].includes('当前不是收货入场状态，不能加入烧录任务'));
  const one = devices.find((d) => d.lifecycle === 'received');
  const ok = core.flashingScopeResult(devices, { ...core.initialFlashingFormValues, scopeType: 'sn_range', snStart: one.sn, snEnd: one.sn });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.devices.map((d) => d.sn), [one.sn]);
});
test('提交载荷：关闭签发时模板置空、sn_range 的 scopeValue 去首尾空格、retryLimit 转数字', () => {
  const base = { ...core.initialFlashingFormValues, taskName: '临时任务', model: 'TS-N2', firmwareVersion: 'v2.4.0', stations: ['FLASH-01'], issueCert: false, certTemplate: '标准设备证书模板 v2', retryLimit: '4', scopeType: 'sn_range', snStart: ' TS24100437 ', snEnd: 'TS24100451' };
  const built = core.buildFlashingTaskForm(base, ['TS24100437']);
  assert.equal(built.certTemplate, null);
  assert.equal(built.scopeValue, 'TS24100437 ~ TS24100451');
  assert.equal(built.retryLimit, 4);
  const listBuilt = core.buildFlashingTaskForm({ ...base, issueCert: true, certTemplate: '标准设备证书模板 v2', scopeType: 'sn_list', snList: 'TS24100437' }, ['TS24100437']);
  assert.equal(listBuilt.scopeValue, '1 台');
  assert.equal(listBuilt.certTemplate, '标准设备证书模板 v2');
});
test('范围错误落字段：批量未选落 batches、sn_list 有错落 snList', () => {
  const v = core.initialFlashingFormValues;
  const f1 = core.flashingScopeErrorField(v, core.flashingScopeResult(devices, v));
  assert.deepEqual(f1, { key: 'batches', message: '当前设备范围没有可烧录的设备（需为收货入场状态）' });
  const listValues = { ...v, scopeType: 'sn_list', snList: 'abc' };
  const f2 = core.flashingScopeErrorField(listValues, core.flashingScopeResult(devices, listValues));
  assert.equal(f2.key, 'snList');
  assert.ok(f2.message.includes('非法字符'));
});

// ---- core/passportList.ts + core/passportDetail.ts（批次 E）----
test('护照筛选：网址 sn 整条覆盖记忆并去首尾空格', () => {
  const anySn = devices[0].sn;
  const init = core.initialPassportFilters({
    search: `sn=${anySn} `,
    storage: memory({ [core.PASSPORT_STORAGE_KEYS.filters]: { ...core.emptyPassportFilters, model: 'TS-N4 Pro' } })
  });
  assert.deepEqual(init, { ...core.emptyPassportFilters, sn: anySn });
});

test('护照筛选：无网址时恢复记忆并归一化，SN 只按前缀命中不命中后缀', () => {
  const init = core.initialPassportFilters({
    search: '',
    storage: memory({ [core.PASSPORT_STORAGE_KEYS.filters]: { ...core.emptyPassportFilters, sn: '  TS24 ', model: 'TS-N2', qc: ['qc_pass'], rmaStatus: 'has_rma' } })
  });
  assert.equal(init.sn, 'TS24');
  assert.equal(init.model, 'TS-N2');
  assert.deepEqual(init.qc, ['qc_pass']);
  assert.equal(init.rmaStatus, 'has_rma');
  const first = devices[0];
  assert.equal(core.matchesPassportFilters(first, { ...core.emptyPassportFilters, sn: first.sn.slice(0, 4) }), true);
  const suffix = first.sn.slice(-4);
  assert.equal(first.sn.includes(suffix) && suffix !== first.sn.slice(0, 4), true);
  assert.equal(core.matchesPassportFilters(first, { ...core.emptyPassportFilters, sn: suffix }), false);
});

test('护照筛选：组合条件取交集，RMA 有无与公开状态双向互斥、出厂日期含边界', () => {
  const hasRma = devices.filter((d) => core.matchesPassportFilters(d, { ...core.emptyPassportFilters, rmaStatus: 'has_rma' }));
  const noRma = devices.filter((d) => core.matchesPassportFilters(d, { ...core.emptyPassportFilters, rmaStatus: 'no_rma' }));
  assert.equal(hasRma.length + noRma.length, devices.length);
  assert.equal(hasRma.length > 0 && hasRma.every((d) => d.rmaCount > 0), true);
  const published = devices.find((d) => d.passportPublish.publicEnabled);
  assert.equal(core.matchesPassportFilters(published, { ...core.emptyPassportFilters, publishStatus: 'published' }), true);
  assert.equal(core.matchesPassportFilters(published, { ...core.emptyPassportFilters, publishStatus: 'unpublished' }), false);
  const shipped = devices.find((d) => d.shippedAt);
  assert.equal(core.matchesPassportFilters(shipped, { ...core.emptyPassportFilters, factoryDateRange: [shipped.shippedAt, shipped.shippedAt] }), true);
  assert.equal(devices.some((d) => core.matchesPassportFilters(d, { ...core.emptyPassportFilters, factoryDateRange: ['2025-01-01', '2025-12-31'] })), false);
  assert.equal(core.hasActiveFilters({ ...core.emptyPassportFilters, model: 'TS-N2' }), true);
  assert.equal(core.hasActiveFilters(core.emptyPassportFilters), false);
});

test('护照排序：默认出厂日期降序且未出货排后，表头排序升→降→回默认', () => {
  const rows = [...devices].sort(core.comparePassportsByDefault);
  const shippedDates = devices.filter((d) => d.shippedAt).map((d) => d.shippedAt).sort((a, b) => b.localeCompare(a));
  assert.equal(rows[0].shippedAt, shippedDates[0]);
  const unshipped = devices.filter((d) => !d.shippedAt);
  assert.deepEqual(rows.slice(-unshipped.length).map((d) => d.shippedAt), unshipped.map(() => null));
  assert.equal([...rows].sort(core.comparePassports({ key: 'lifecycle', dir: 'asc' }))[0].lifecycle, 'received');
  assert.equal([...rows].sort(core.comparePassports({ key: 'rmaCount', dir: 'desc' }))[0].rmaCount, Math.max(...devices.map((d) => d.rmaCount)));
  assert.deepEqual(core.togglePassportSort(null, 'rmaCount'), { key: 'rmaCount', dir: 'asc' });
  assert.deepEqual(core.togglePassportSort({ key: 'rmaCount', dir: 'asc' }, 'rmaCount'), { key: 'rmaCount', dir: 'desc' });
  assert.equal(core.togglePassportSort({ key: 'rmaCount', dir: 'desc' }, 'rmaCount'), null);
});

test('出厂日期跨度超过 366 天给 antd 警告文案，合法跨度与空范围放行', () => {
  assert.equal(core.factoryDateRangeError(['2025-01-01', '2026-01-05']), '出厂日期跨度不能超过 366 天，请重新选择');
  assert.equal(core.factoryDateRangeError(['2026-07-01', '2026-12-31']), null);
  assert.equal(core.factoryDateRangeError(null), null);
});

test('批量公开操作：混选置灰原因与 antd 文案一致，基准配置强制开启公开', () => {
  const shipped = devices.filter((d) => d.lifecycle === 'shipped');
  const inStock = devices.find((d) => d.lifecycle === 'in_stock');
  assert.equal(core.canBatchPublish(shipped.slice(0, 3)), true);
  assert.equal(core.canBatchPublish([shipped[0], inStock]), false);
  assert.equal(core.BATCH_PUBLISH_BLOCKED_REASON, '选中项中包含不支持此操作的记录（仅出货设备支持公开）');
  assert.equal(core.BATCH_CLOSE_BLOCKED_REASON, '选中项中包含不支持此操作的记录（仅已公开设备支持关闭）');
  const published = devices.filter((d) => d.passportPublish.publicEnabled);
  assert.equal(core.canBatchClosePublish(published.slice(0, 3)), true);
  assert.equal(core.canBatchClosePublish([published[0], devices.find((d) => !d.passportPublish.publicEnabled)]), false);
  assert.equal(core.canSetPublishScope(inStock), false);
  assert.equal(core.canGenerateQrCode(shipped[0]), true);
  const closed = devices.find((d) => !d.passportPublish.publicEnabled);
  const cfg = core.batchPublishBaseConfig(closed);
  assert.equal(cfg.publicEnabled, true);
  assert.equal(cfg.showRma, closed.passportPublish.showRma);
  assert.equal(cfg.remark, closed.passportPublish.remark);
});

test('公开范围表单：备注与 RMA-时间轴依赖校验，关时间轴连带关 RMA', () => {
  assert.equal(core.publishRemarkError('很'.repeat(200)), null);
  assert.match(core.publishRemarkError('很'.repeat(201)), /200/);
  assert.equal(core.publishRmaTimelineError({ showRma: true, showTimeline: false }), '「公开 RMA 售后历史」需要同时开启「公开生命周期时间轴」');
  assert.equal(core.publishRmaTimelineError({ showRma: true, showTimeline: true }), null);
  const off = core.withTimelineToggled({ ...devices[0].passportPublish, showRma: true, showTimeline: true }, false);
  assert.equal(off.showTimeline, false);
  assert.equal(off.showRma, false);
});

test('时间轴事件分组：RMA 组含退回/返修/二次入库，取消勾选即从列表消失', () => {
  const rmaDevice = devices.find((d) => state.passportEvents.some((e) => e.sn === d.sn && e.kind === 'rma'));
  const events = state.passportEvents.filter((e) => e.sn === rmaDevice.sn);
  const onlyRma = core.filterPassportEvents(events, ['rma']);
  assert.equal(onlyRma.length > 0, true);
  assert.equal(onlyRma.every((e) => ['rma', 'repaired', 'restocked'].includes(e.kind)), true);
  const withoutRma = core.filterPassportEvents(events, core.ALL_EVENT_GROUPS.filter((g) => g !== 'rma'));
  assert.equal(withoutRma.some((e) => ['rma', 'repaired', 'restocked'].includes(e.kind)), false);
  const flashFailedDevice = devices.find((d) => d.lifecycle === 'flash_failed');
  const flashGroup = core.filterPassportEvents(state.passportEvents.filter((e) => e.sn === flashFailedDevice.sn), ['flash']);
  assert.equal(flashGroup.some((e) => e.kind === 'flash_failed'), true);
});

test('对外预览：消费者时间轴剔除烧录失败、返修与 RMA 节点，证书指纹按签发状态脱敏', () => {
  const rmaDevice = devices.find((d) => state.passportEvents.some((e) => e.sn === d.sn && e.kind === 'rma'));
  const events = state.passportEvents.filter((e) => e.sn === rmaDevice.sn);
  const publicEvents = core.publicTimelineEvents(events);
  assert.equal(events.some((e) => e.kind === 'rma'), true);
  assert.equal(publicEvents.some((e) => ['flash_failed', 'repaired', 'rma'].includes(e.kind)), false);
  assert.equal(publicEvents.length, events.length - events.filter((e) => ['flash_failed', 'repaired', 'rma'].includes(e.kind)).length);
  assert.equal(core.certFingerprintOf(devices.find((d) => d.cert === 'cert_pending')), '—');
  const issued = devices.find((d) => d.cert === 'cert_issued');
  const fingerprint = core.certFingerprintOf(issued);
  assert.ok(fingerprint.startsWith('SHA256:'));
  assert.equal(fingerprint.includes('…'), true);
  assert.equal(core.certFingerprintOf(issued), fingerprint);
});

test('发起 RMA：仅已出货设备可用，原因与退货来源必填文案来自控制器', () => {
  assert.equal(core.canStartRma(devices.find((d) => d.lifecycle === 'shipped')), true);
  assert.equal(core.canStartRma(devices.find((d) => d.lifecycle === 'in_stock')), false);
  assert.equal(core.START_RMA_BLOCKED_REASON, '仅已出货设备可发起退货 RMA');
  assert.equal(core.RMA_DIALOG_DEFAULT_SOURCE, 'ecommerce');
  assert.deepEqual(core.rmaFormErrors({ reason: '', source: '' }), { reason: '请选择退货原因', source: '请选择退货来源' });
  assert.deepEqual(core.rmaFormErrors({ reason: 'function_issue', source: 'ecommerce' }), { reason: null, source: null });
});

test('返回链接文案与节点颜色按 antd 口径', () => {
  assert.equal(core.passportBackLabel('/devices/TS240700101'), '设备详情');
  assert.equal(core.passportBackLabel('/devices'), '全部设备');
  assert.equal(core.passportBackLabel('/alerts'), '数字护照');
  assert.equal(core.passportBackLabel(null), '数字护照');
  assert.equal(core.passportNodeColor('activation'), 'geekblue');
  assert.equal(core.passportNodeColor('scrapped'), 'gray');
});

// ---- core/alerts.ts + core/alertRules.ts + core/binding.ts（批次 F）----
const alertById = (id) => state.alerts.find((a) => a.id === id);
const ruleById = (id) => state.alertRules.find((r) => r.id === id);
const userById = (id) => state.appUsers.find((u) => u.userId === id);

test('告警初始落位：?status / ?tab 预置分栏，?alert 直达单条落其分栏，带 sn 落到有结果的分栏', () => {
  const alerts = state.alerts;
  assert.equal(core.initialAlertsState({ search: '', alerts }).tab, 'open');
  assert.equal(core.initialAlertsState({ search: '?status=processing', alerts }).tab, 'processing');
  assert.equal(core.initialAlertsState({ search: '?tab=muted', alerts }).tab, 'muted');
  const viaAlert = core.initialAlertsState({ search: '?alert=AL-0926-007', alerts });
  assert.equal(viaAlert.tab, 'ticketed');
  assert.equal(viaAlert.selectedId, 'AL-0926-007');
  const snOfProcessing = alertById('AL-0927-005').sns[0];
  const viaSn = core.initialAlertsState({ search: `?sn=${snOfProcessing}`, alerts });
  assert.equal(viaSn.tab, 'processing');
  assert.equal(viaSn.keyword, snOfProcessing);
});
test('非法网址参数忽略：type/level/status 不合法时回默认', () => {
  const init = core.initialAlertsState({ search: '?type=bogus&level=P9&status=nope', alerts: state.alerts });
  assert.equal(init.type, undefined);
  assert.equal(init.level, undefined);
  assert.equal(init.tab, 'open');
});
test('筛选计数按当前筛选重算，分栏列表按级别 P1→P3、同级首次发现新→旧', () => {
  const filtered = core.filterAlerts(state.alerts, { type: undefined, level: undefined, keyword: '' });
  assert.deepEqual(core.alertTabCounts(filtered), { open: 4, processing: 2, ticketed: 1, resolved: 1, muted: 1 });
  const p1Only = core.filterAlerts(state.alerts, { type: undefined, level: 'P1', keyword: '' });
  assert.deepEqual(p1Only.map((a) => a.id), ['AL-0928-001', 'AL-0928-002']);
  const openList = core.listAlertsForTab(filtered, 'open');
  assert.deepEqual(openList.map((a) => a.id), ['AL-0928-002', 'AL-0928-001', 'AL-0928-003', 'AL-0928-006']);
  const combined = core.filterAlerts(state.alerts, { type: 'offline_rate_exceeded', level: 'P1', keyword: 'b2409' });
  assert.deepEqual(combined.map((a) => a.id), ['AL-0928-001']);
});
test('动作可用性：已处理只留重新打开，已转工单不再转，终态不给出修改类动作', () => {
  assert.equal(core.canTicketAlert(alertById('AL-0928-001')), true);
  assert.equal(core.canTicketAlert(alertById('AL-0926-007')), false);
  assert.equal(core.canTicketAlert(alertById('AL-0925-008')), false);
  assert.equal(core.canModifyAlert(alertById('AL-0925-008')), false);
  assert.equal(core.canModifyAlert(alertById('AL-0924-009')), false);
  assert.equal(core.canReopenAlert(alertById('AL-0925-008')), true);
  assert.equal(core.canReopenAlert(alertById('AL-0924-009')), false);
  assert.equal(core.alertStepActionEnabled(alertById('AL-0926-007'), 'ticket'), false);
  assert.equal(core.alertStepActionEnabled(alertById('AL-0926-007'), 'devices'), true);
});
test('处置离开当前分栏时自动选中下一条，没有下一条取上一条', () => {
  const openList = core.listAlertsForTab(state.alerts, 'open');
  assert.equal(core.nextAlertSelectionId(openList, 'AL-0928-001'), 'AL-0928-003');
  assert.equal(core.nextAlertSelectionId(openList, 'AL-0928-006'), 'AL-0928-003');
  assert.equal(core.nextAlertSelectionId(openList, openList[openList.length - 1].id), openList[openList.length - 2].id);
});
test('返回网址查询串记下分栏、选中项与筛选', () => {
  const qs = core.alertsReturnSearch({ tab: 'processing', selectedId: 'AL-0927-004', keyword: ' TS24090269 ', type: 'offline_rate_exceeded', level: 'P1' });
  assert.equal(qs, 'tab=processing&id=AL-0927-004&sn=TS24090269&type=offline_rate_exceeded&level=P1');
  const minimal = core.alertsReturnSearch({ tab: 'open', selectedId: null, keyword: '  ', type: undefined, level: undefined });
  assert.equal(minimal, 'tab=open');
});
test('受影响去向：单台直详情，批次带「批次+离线」筛选去全部设备', () => {
  assert.deepEqual(core.affectedTarget(alertById('AL-0928-002')), { kind: 'device', sn: alertById('AL-0928-002').sns[0] });
  assert.deepEqual(core.affectedTarget(alertById('AL-0928-001')), { kind: 'devicesBatchOffline', batch: 'B2409' });
  assert.deepEqual(core.affectedTarget(alertById('AL-0927-004')), { kind: 'devicesAll' });
  assert.equal(core.affectedLabel(alertById('AL-0928-002')), '查看设备详情');
  assert.equal(core.affectedLabel(alertById('AL-0928-001')), '查看受影响设备');
});
test('转工单预填三段描述与级别映射，提交时中文选项映射回实体枚举', () => {
  const alert = alertById('AL-0928-001');
  const prefill = core.ticketPrefillFor(alert);
  assert.equal(prefill.type, '故障');
  assert.equal(prefill.priority, '紧急');
  assert.equal(prefill.assignee, undefined);
  assert.ok(prefill.description.startsWith(`发生了什么：${alert.happened}`));
  assert.ok(prefill.description.includes(`影响：\n1. ${alert.impact[0]}`));
  assert.ok(prefill.description.includes('建议处理：'));
  assert.equal(core.ticketAssigneeError(undefined), '请选择处理人');
  assert.equal(core.ticketAssigneeError('运维 · 周启明'), null);
  assert.deepEqual(
    core.ticketFormPayload({ type: '咨询', priority: '低', assignee: '运维 · 周启明', description: 'd' }, 'P1'),
    { assignee: '运维 · 周启明', type: 'consult', priority: 'P3', content: 'd' }
  );
  assert.deepEqual(
    core.ticketFormPayload({ type: '没见过的类型', priority: 'bogus', assignee: 'X', description: '' }, alert.level),
    { assignee: 'X', type: 'fault', priority: 'P1', content: '' }
  );
});
test('标记已处理校验：必填结论，选「其他」时备注必填', () => {
  assert.equal(core.resolveConclusionError(''), '请选择处理结论');
  assert.equal(core.resolveConclusionError('已恢复'), null);
  assert.equal(core.resolveNoteError('其他', '  '), '选择“其他”时请填写备注');
  assert.equal(core.resolveNoteError('其他', '换了风扇'), null);
  assert.equal(core.resolveNoteError('已恢复', ''), null);
});
test('标记已处理备注选填也拦纯空格（antd whitespace:true）：非「其他」填纯空格报错，空串通过', () => {
  const message = '选择“其他”时请填写备注';
  assert.equal(core.resolveNoteError('已恢复', '   '), message);
  assert.equal(core.resolveNoteError('已恢复', ''), null);
  assert.equal(core.resolveNoteError('已恢复', ' 已更换电源 '), null);
  assert.equal(core.resolveNoteError('其他', ''), message);
  assert.equal(core.resolveNoteError('其他', '\t'), message);
});

test('规则列表：计数按类型筛选重算，默认排序启用在先、同态按最近触发倒序、从未触发排后、停用垫底', () => {
  const rules = state.alertRules;
  const all = core.deriveAlertRules({ rules, typeFilter: undefined, statusFilter: 'all' });
  assert.deepEqual(all.counts, { all: 5, enabled: 4, disabled: 1 });
  assert.deepEqual(all.rows.map((r) => r.id), ['AR-0921-01', 'AR-0926-01', 'AR-0921-02', 'AR-0901-01', 'AR-0924-01']);
  const byType = core.deriveAlertRules({ rules, typeFilter: 'offline_rate_exceeded', statusFilter: 'all' });
  assert.deepEqual(byType.counts, { all: 3, enabled: 2, disabled: 1 });
  assert.deepEqual(byType.rows.map((r) => r.id), ['AR-0921-01', 'AR-0901-01', 'AR-0924-01']);
  const disabled = core.deriveAlertRules({ rules, typeFilter: undefined, statusFilter: 'disabled' });
  assert.deepEqual(disabled.rows.map((r) => r.id), ['AR-0924-01']);
});
test('最近触发的规则-告警对应：每条规则取首次发现最晚的一条告警', () => {
  const map = core.latestAlertByRule(state.alerts);
  assert.equal(map.get('AR-0921-02').id, 'AL-0928-003');
  assert.equal(map.get('AR-0921-01').id, 'AL-0928-001');
  assert.equal(map.get('AR-0924-01').id, 'AL-0924-009');
  assert.equal(map.get('AR-0901-01'), undefined);
  assert.equal(map.has('AR-NOPE'), false);
});
test('编辑回填与提交校验主路径：合法草稿无错误，载荷按类型带字段且名称去空白', () => {
  const rule = ruleById('AR-0921-01');
  const draft = core.ruleDraftFromRule(rule);
  assert.deepEqual(draft, {
    type: 'offline_rate_exceeded', scope: 'batch', target: 'B2409', thresholdPct: '10', offlineDays: '',
    pushTaskScope: '', pushTaskIds: [], notifyUsers: ['运维 · 周启明', '运维 · 顾清和'], name: 'B2409 批次离线率 ≥10%'
  });
  assert.deepEqual(core.ruleDraftErrors(draft), {});
  const payload = core.rulePayloadFromDraft({ ...draft, name: '  新名字  ' });
  assert.equal(payload.name, '新名字');
  assert.equal(payload.scope, 'batch');
  assert.equal(payload.target, 'B2409');
  assert.equal(payload.thresholdPct, 10);
  assert.equal(payload.offlineDays, undefined);
  assert.equal(payload.pushTaskScope, undefined);
});
test('逐项校验失败路径：空类型、阈值越界、天数越界、指定任务缺任务、缺通知对象、名称超限', () => {
  const empty = core.ruleDraftErrors(core.emptyRuleDraft());
  assert.equal(empty.type, '请选择规则类型');
  assert.equal(empty.notifyUsers, '请选择通知对象');
  assert.equal(empty.name, '请填写规则名称');
  const rate = core.ruleDraftErrors({ ...core.emptyRuleDraft(), type: 'offline_rate_exceeded', thresholdPct: '0' });
  assert.equal(rate.scope, '请选择适用范围');
  assert.equal(rate.target, '请选择目标对象');
  assert.equal(rate.thresholdPct, '阈值需为 1–100 的整数');
  const days = core.ruleDraftErrors({ ...core.emptyRuleDraft(), type: 'offline_duration_exceeded', offlineDays: '91' });
  assert.equal(days.offlineDays, '离线天数需为 1–90 的整数');
  const upgrade = core.ruleDraftErrors({ ...core.emptyRuleDraft(), type: 'upgrade_fail_rate_exceeded', thresholdPct: '5', pushTaskScope: 'specified', pushTaskIds: [] });
  assert.equal(upgrade.pushTaskIds, '指定任务时至少选择 1 个推送任务');
  const longName = core.ruleDraftErrors({ ...core.emptyRuleDraft(), type: 'offline_duration_exceeded', offlineDays: '7', notifyUsers: ['X'], name: '长'.repeat(51) });
  assert.equal(longName.name, '规则名称不超过 50 字');
  assert.equal(core.integerInputError('', '阈值', 1, 100), '请填写阈值');
  assert.equal(core.integerInputError('3.5', '阈值', 1, 100), '阈值需为 1–100 的整数');
});
test('切换类型保留名称与通知对象、清空其余字段；全部任务范围不提交指定任务', () => {
  const draft = {
    type: 'offline_rate_exceeded', scope: 'batch', target: 'B2409', thresholdPct: '10', offlineDays: '',
    pushTaskScope: '', pushTaskIds: [], notifyUsers: ['运维 · 周启明'], name: '我的规则'
  };
  const next = core.ruleDraftAfterTypeChange(draft, 'upgrade_fail_rate_exceeded');
  assert.equal(next.type, 'upgrade_fail_rate_exceeded');
  assert.deepEqual(next.scope, '');
  assert.deepEqual(next.thresholdPct, '');
  assert.deepEqual(next.notifyUsers, ['运维 · 周启明']);
  assert.equal(next.name, '我的规则');
  const payload = core.rulePayloadFromDraft({ ...next, thresholdPct: '5', pushTaskScope: 'all', pushTaskIds: ['PT-1'] });
  assert.deepEqual(payload.pushTaskIds, []);
  const specified = core.rulePayloadFromDraft({ ...next, thresholdPct: '5', pushTaskScope: 'specified', pushTaskIds: ['PT-1'] });
  assert.deepEqual(specified.pushTaskIds, ['PT-1']);
});

test('查手机号 / 用户 ID 得模式 A（用户加绑定设备），用户 ID 大小写不敏感', () => {
  const source = { appUsers: state.appUsers, bindings: state.bindings, devices };
  const byPhone = core.executeBindingLookup({ type: 'phone', value: '13400001613' }, source);
  assert.equal(byPhone.status, 'mode_a');
  if (byPhone.status !== 'mode_a') return;
  assert.equal(byPhone.user.userId, 'U100002');
  assert.equal(byPhone.boundDevices.length, 1);
  assert.equal(byPhone.boundDevices[0].binding.sn, 'TS24070108');
  assert.ok(byPhone.boundDevices[0].device);
  const byUserId = core.executeBindingLookup({ type: 'userId', value: 'u100001' }, source);
  assert.equal(byUserId.status, 'mode_a');
  if (byUserId.status !== 'mode_a') return;
  assert.equal(byUserId.user.phone, '13300001000');
  assert.equal(core.executeBindingLookup({ type: 'phone', value: '19900000000' }, source).status, 'not_found');
});
test('查 SN 得模式 B：多人绑定按人列全；有设备无绑定是 sn_zero_bound，查无此机是 not_found', () => {
  const source = { appUsers: state.appUsers, bindings: state.bindings, devices };
  const bySn = core.executeBindingLookup({ type: 'sn', value: 'ts24070108' }, source);
  assert.equal(bySn.status, 'mode_b');
  if (bySn.status !== 'mode_b') return;
  assert.equal(bySn.sn, 'TS24070108');
  assert.equal(bySn.bindings.length, 2);
  assert.deepEqual(bySn.bindings.map((r) => r.binding.userId), ['U100002', 'U200005']);
  assert.ok(bySn.bindings.every((r) => r.user));
  const freeSn = devices.find((d) => !state.bindings.some((b) => b.sn === d.sn))?.sn;
  assert.ok(freeSn, '种子数据里应有未绑定设备');
  assert.deepEqual(core.executeBindingLookup({ type: 'sn', value: freeSn }, source), { status: 'sn_zero_bound', sn: freeSn });
  assert.equal(core.executeBindingLookup({ type: 'sn', value: 'NO-SUCH-SN' }, source).status, 'not_found');
});
test('检索口径：三框互斥全空不查，手机号必须 11 位完整数字，手机号优先于用户 ID，再优先于 SN', () => {
  assert.deepEqual(core.searchTargetFromInputs({ phone: '', userId: '', sn: '' }), { kind: 'none' });
  assert.deepEqual(
    core.searchTargetFromInputs({ phone: '138', userId: '', sn: '' }),
    { kind: 'invalid', warning: '请输入完整 11 位手机号（不支持模糊/前缀查询）' }
  );
  assert.deepEqual(core.searchTargetFromInputs({ phone: ' 13400001613 ', userId: 'U100001', sn: '' }), { kind: 'query', target: { type: 'phone', value: '13400001613' } });
  assert.deepEqual(core.searchTargetFromInputs({ phone: '', userId: ' U100001 ', sn: 'TS24070101' }), { kind: 'query', target: { type: 'userId', value: 'U100001' } });
  assert.deepEqual(core.searchTargetFromInputs({ phone: '', userId: '', sn: ' TS24070101 ' }), { kind: 'query', target: { type: 'sn', value: 'TS24070101' } });
  const fields = core.searchFieldStates({ phone: '138', userId: '', sn: '' });
  assert.equal(fields.userIdDisabled, true);
  assert.equal(fields.snDisabled, true);
  assert.equal(fields.searchDisabled, false);
  assert.equal(core.searchFieldStates({ phone: '', userId: '', sn: '' }).searchDisabled, true);
});
test('网址带入查询按 sn → user_id（userId）→ phone 优先级', () => {
  assert.deepEqual(core.bindingQueryFromUrl('?sn=S1&user_id=U1&phone=P1'), { type: 'sn', value: 'S1' });
  assert.deepEqual(core.bindingQueryFromUrl('?user_id=U1&userId=U2'), { type: 'userId', value: 'U1' });
  assert.deepEqual(core.bindingQueryFromUrl('?userId=U2&phone=P1'), { type: 'userId', value: 'U2' });
  assert.deepEqual(core.bindingQueryFromUrl('?phone= 13300001000 '), { type: 'phone', value: '13300001000' });
  assert.equal(core.bindingQueryFromUrl('?foo=bar'), null);
});
test('长期未活跃：距锚点超过 30 天才标记（真实用户 U100014 中标、U100001 不标）', () => {
  assert.equal(core.isLongInactive(userById('U100014').lastActiveAt, core.BINDING_ANCHOR_DAY), true);
  assert.equal(core.isLongInactive(userById('U100001').lastActiveAt, core.BINDING_ANCHOR_DAY), false);
  assert.equal(core.isLongInactive('2026-08-28 12:00', '2026-09-28'), true);
  assert.equal(core.isLongInactive('2026-08-29', '2026-09-28'), false);
  assert.equal(core.isLongInactive('', '2026-09-28'), false);
});
test('敏感字段查看需填原因；新建反馈跳转参数带首台绑定 SN 且手机号脱敏', () => {
  assert.equal(core.canRevealSensitive('  '), false);
  assert.equal(core.canRevealSensitive('用户求助需要核对联系方式'), true);
  const user = userById('U100001');
  const firstSn = state.bindings.find((b) => b.userId === 'U100001')?.sn;
  const qs = core.feedbackCreateSearch({ user, firstSn, fromUrl: '/users/binding?sn=TS24070101' });
  const params = new URLSearchParams(qs);
  assert.equal(params.get('create'), '1');
  assert.equal(params.get('userId'), 'U100001');
  assert.equal(params.get('phone'), '133****1000');
  assert.equal(params.get('appVersion'), '3.1.0');
  assert.equal(params.get('sn'), 'TS24070101');
  assert.equal(params.get('from'), '/users/binding?sn=TS24070101');
  const noSn = new URLSearchParams(core.feedbackCreateSearch({ user, firstSn: undefined, fromUrl: '/x' }));
  assert.equal(noSn.get('sn'), null);
});
test('绑定时间排序：首点升序再点降序，未点保持原序；超过 10 条才分页', () => {
  const rows = state.bindings.filter((b) => b.sn === 'TS24070108').map((binding) => ({ binding }));
  assert.deepEqual(core.sortByBoundAt(rows, null).map((r) => r.binding.userId), ['U100002', 'U200005']);
  assert.deepEqual(core.sortByBoundAt(rows, 'asc').map((r) => r.binding.userId), ['U100002', 'U200005']);
  assert.deepEqual(core.sortByBoundAt(rows, 'desc').map((r) => r.binding.userId), ['U200005', 'U100002']);
  assert.equal(core.toggleSortDir(null), 'asc');
  assert.equal(core.toggleSortDir('asc'), 'desc');
  assert.equal(core.toggleSortDir('desc'), null);
  // 降序再点清除后回到原始绑定顺序。
  assert.deepEqual(core.sortByBoundAt(rows, core.toggleSortDir('desc')).map((r) => r.binding.userId), rows.map((r) => r.binding.userId));
  const reversedRows = [...rows].reverse();
  assert.deepEqual(core.sortByBoundAt(reversedRows, null).map((r) => r.binding.userId), reversedRows.map((r) => r.binding.userId));
  assert.equal(core.showBindingPagination(10), false);
  assert.equal(core.showBindingPagination(11), true);
});

// ---- core/dashboard.ts（批次 G）----
test('工作台计数与目标列表口径同源，快速入口卡恒为 0', () => {
  const counts = core.dashboardCardCounts({
    alerts: state.alerts, devices, firmwareVersions: state.firmwareVersions,
    pushTasks: state.pushTasks, rmas: state.rmas, feedbackTickets: state.feedbackTickets,
    timeRange: state.dashboard.timeRange
  });
  assert.equal(counts['offline-alerts'], state.alerts.filter((a) => a.status === 'open').length);
  assert.equal(counts['pending-rma'], 4);
  assert.equal(counts['gray-versions'], state.firmwareVersions.filter((v) => v.status === 'testing').length);
  assert.equal(counts['fused-push-tasks'], state.pushTasks.filter((t) => t.status === 'fused').length);
  const [start, end] = rangeDates(state.dashboard.timeRange);
  assert.equal(counts['today-activated'], devices.filter((d) => d.activatedAt && d.activatedAt >= start && d.activatedAt <= end).length);
  assert.equal(counts['sn-lookup'], 0);
  assert.equal(counts['binding-lookup'], 0);
});

test('dataState 参数：整页注入与单卡注入成立，未知卡 id 不注入', () => {
  assert.deepEqual(core.parseDataState(null), { whole: 'ready', injected: null });
  assert.deepEqual(core.parseDataState('loading'), { whole: 'loading', injected: null });
  assert.deepEqual(core.parseDataState('error:offline-alerts'), { whole: 'ready', injected: { id: 'offline-alerts', state: 'error' } });
  assert.deepEqual(core.parseDataState('error:not-a-card'), { whole: 'ready', injected: null });
  assert.equal(core.dashboardCardState('gray-versions', 'loading', null), 'loading');
  assert.equal(core.dashboardCardState('gray-versions', 'ready', { id: 'offline-alerts', state: 'error' }), 'ready');
});

test('权限剥夺：被 no: 的卡片既不进可见库也不在看板上，看板顺序不变', () => {
  const denied = core.parseDeniedPermissions('no:production:rma:view,production:fleet:view');
  assert.equal(denied.has('production:rma:view'), true);
  assert.equal(core.parseDeniedPermissions('readonly').size, 0);
  const visible = core.visibleCardDefs(denied);
  assert.equal(visible.some((d) => d.id === 'pending-rma'), false);
  const board = core.deriveDashboardBoard(state.dashboard.orderedCardIds, visible);
  assert.deepEqual(board.map((d) => d.id), state.dashboard.orderedCardIds.filter((id) => visible.some((d) => d.id === id)));
  assert.equal(core.showDashboardGuide('ready', board.length) === false, board.length > 0);
  assert.equal(core.showDashboardGuide('ready', 0), true);
  assert.equal(core.showDashboardGuide('empty', 99), true);
});

test('Top 5 待处理告警：只收 open、级别优先且同级新发现在前', () => {
  const top = core.openAlertsTopFive(state.alerts);
  assert.equal(top.every((a) => a.status === 'open'), true);
  assert.equal(top.length, Math.min(5, state.alerts.filter((a) => a.status === 'open').length));
  const expected = state.alerts
    .filter((a) => a.status === 'open')
    .sort((a, b) => a.level.localeCompare(b.level) || b.firstSeenAt.localeCompare(a.firstSeenAt))
    .slice(0, 5)
    .map((a) => a.id);
  assert.deepEqual(top.map((a) => a.id), expected);
});

test('Top 5 熔断任务：只收 fused 且按创建时间新到旧', () => {
  const top = core.fusedTasksTopFive(state.pushTasks);
  assert.equal(top.every((t) => t.status === 'fused'), true);
  for (let i = 1; i < top.length; i++) assert.ok(top[i - 1].createdAt >= top[i].createdAt);
  assert.equal(core.topFiveCardIds.includes('sla-overdue-feedback'), false);
});

test('离线告警卡提示与角标语义随是否含 P1 切换，待办卡永远是 normal', () => {
  const def = core.cardById.get('offline-alerts');
  assert.equal(core.dashboardHint(def, true), '含 P1 告警，请优先处理');
  assert.equal(core.dashboardHint(def, false), '无 P1 告警，按发现时间顺序处理');
  assert.equal(core.dashboardBadgeTone(def, true), 'high');
  assert.equal(core.dashboardBadgeTone(def, false), 'mid');
  assert.equal(core.dashboardBadgeTone(core.cardById.get('sla-overdue-feedback'), false), 'high');
  assert.equal(core.dashboardBadgeTone(core.cardById.get('pending-rma'), true), 'normal');
});

test('重试只去掉 dataState 并保留其余参数；加入所选按注册表顺序', () => {
  assert.equal(core.retrySearch('dataState=error&activated=today'), 'activated=today');
  assert.equal(core.retrySearch('activated=today'), 'activated=today');
  assert.equal(core.retrySearch('dataState=error:offline-alerts'), '');
  assert.deepEqual(core.dashboardCardsToAdd(['sla-overdue-feedback', 'pending-rma']).map((d) => d.id), ['pending-rma', 'sla-overdue-feedback']);
});

test('抽屉分组：组序与卡序都跟随注册表', () => {
  const groups = core.dashboardDrawerGroups(core.visibleCardDefs(new Set()));
  const flat = groups.flatMap((g) => g.defs.map((d) => d.id));
  assert.equal(flat.length, 10);
  assert.equal(new Set(flat).size, 10);
  const firstSeen = [...new Set(flat.map((id) => core.cardById.get(id).sourceModule))];
  assert.deepEqual(groups.map((g) => g.module), firstSeen);
});

test('normalizeInteger：对齐 antd InputNumber precision=0 的失焦归整', () => {
  assert.equal(core.normalizeInteger('1.5'), '2');
  assert.equal(core.normalizeInteger('2.4'), '2');
  assert.equal(core.normalizeInteger('2.5'), '3');
  assert.equal(core.normalizeInteger('-1.5'), '-2');
  assert.equal(core.normalizeInteger('-2.4'), '-2');
  assert.equal(core.normalizeInteger('-0.4'), '0');
  assert.equal(core.normalizeInteger('7'), '7');
  assert.equal(core.normalizeInteger('3.'), '3');
  assert.equal(core.normalizeInteger('.5'), '1');
  assert.equal(core.normalizeInteger('0', { min: 1, max: 10 }), '1');
  assert.equal(core.normalizeInteger('11', { min: 1, max: 10 }), '10');
  assert.equal(core.normalizeInteger('1.5', { min: 1, max: 10 }), '2');
  assert.equal(core.normalizeInteger('9.5', { min: 1, max: 10 }), '10');
  assert.equal(core.normalizeInteger('10.4', { min: 1, max: 10 }), '10');
  assert.equal(core.normalizeInteger('-5', { min: 0 }), '0');
  assert.equal(core.normalizeInteger('', { min: 1, max: 10 }), '');
  assert.equal(core.normalizeInteger('   ', { min: 1, max: 10 }), '');
  assert.equal(core.normalizeInteger('abc', { min: 1, max: 10 }), 'abc');
  assert.equal(core.normalizeInteger('1.2.3'), '1.2.3');
  assert.equal(core.normalizeInteger('-'), '-');
  assert.equal(core.normalizeInteger(' 5 '), '5');
});
test('选填文本空白判定：必填空串 / 纯空白违反，选填仅「非空的纯空白」违反', () => {
  assert.equal(core.violatesNotBlank('', true), true);
  assert.equal(core.violatesNotBlank('  ', true), true);
  assert.equal(core.violatesNotBlank('', false), false);
  assert.equal(core.violatesNotBlank('  ', false), true);
  assert.equal(core.violatesNotBlank(' a ', false), false);
});
test('通用排序三态函数：新列升序、升→降、降→清除', () => {
  assert.deepEqual(core.nextSortState(null, 'a'), { key: 'a', dir: 'asc' });
  assert.deepEqual(core.nextSortState({ key: 'a', dir: 'asc' }, 'b'), { key: 'b', dir: 'asc' });
  assert.deepEqual(core.nextSortState({ key: 'a', dir: 'asc' }, 'a'), { key: 'a', dir: 'desc' });
  assert.equal(core.nextSortState({ key: 'a', dir: 'desc' }, 'a'), null);
  assert.equal(core.nextSortDirection(null), 'asc');
  assert.equal(core.nextSortDirection('asc'), 'desc');
  assert.equal(core.nextSortDirection('desc'), null);
});

const failed = results.filter((r) => !r[1]);
for (const [name, ok, msg] of results) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `：${msg}`}`);
console.log(failed.length ? `tianshu core FAILED: ${failed.length}/${results.length}` : `tianshu core passed: ${results.length} 项`);
process.exit(failed.length ? 1 : 0);
