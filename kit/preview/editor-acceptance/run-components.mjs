// L1: nine real component writes, fixed checks, API undo and byte restoration.
// Run from kit: LUDI_EDITOR_PORT=5410 node preview/editor-acceptance/run-components.mjs
// --inspect renders the same probes without writing. Evidence never overwrites a prior run.
// --preview captures the editor and its memory-only preview, without component writes.
// --canvas-only verifies registered business routes (including existing error/overlay states).
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { COMPONENT_TOKENS } from '../editor-server/component-tokens.mjs';

const PREVIEW = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KIT = resolve(PREVIEW, '..'), REPO = resolve(KIT, '..');
const BASE = `http://127.0.0.1:${process.env.LUDI_EDITOR_PORT || 5410}`;
const THEME = 'projects/tianshu-device-ops/theme.ts';
const OUT = resolve(KIT, `projects/tianshu-device-ops/evidence/editor/components-round-${Date.now()}`);
const inspect = process.argv.includes('--inspect');
const previewOnly = process.argv.includes('--preview');
const canvasOnly = process.argv.includes('--canvas-only');
const require = createRequire(resolve(KIT, 'package.json'));
const { chromium } = require('@playwright/test');
const { FastColor } = require('@ant-design/fast-color');
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const baseline = JSON.parse(readFileSync(resolve(PREVIEW, 'editor-dispatch/baseline.json'), 'utf8')).files;
const baselineDiff = () => baseline.filter(f => sha(resolve(REPO, f.file)) !== f.sha256).map(f => f.file);
const cases = [
  { component:'Button', token:'contentFontSize', value:20, selector:'.ant-btn:not(.ant-btn-lg):not(.ant-btn-sm)', property:'fontSize', canvas:{route:'/devices'} },
  { component:'Input', token:'inputFontSize', value:20, selector:'.ant-input:not(.ant-input-lg):not(.ant-input-sm)', property:'fontSize', canvas:{route:'/alerts',selector:'.device-ops-alert-filters .ant-input'} },
  { component:'Select', token:'optionFontSize', value:20, selector:'.ant-select-item-option', property:'fontSize', openSelect:true, canvas:{route:'/alerts',select:'.device-ops-alert-filters .ant-select'} },
  { component:'Tag', token:'defaultBg', value:'#d0e6fa', selector:'.ant-tag:text-is("默认")', property:'backgroundColor', canvas:{route:'/system/alert-rules',selector:'.ant-table-tbody .ant-tag'} },
  { component:'Table', token:'cellPaddingInline', value:24, selector:'.ant-table-cell:not(.ant-table-selection-column):not(.device-ops-col-actions)', property:'paddingLeft', canvas:{route:'/devices'} },
  { component:'Alert', token:'withDescriptionIconSize', value:36, selector:'.ant-alert-with-description .ant-alert-icon', property:'fontSize', canvas:{route:'/alerts',query:'dataState=error'} },
  { component:'Modal', token:'titleFontSize', value:20, selector:'.ant-modal-title', property:'fontSize', canvas:{route:'/exceptions/rma',open:'新建 RMA 单'} },
  { component:'Drawer', token:'footerPaddingInline', value:24, selector:'.ant-drawer-footer', property:'paddingLeft', canvas:{route:'/system/alert-rules',open:'新建规则'} },
  { component:'Popconfirm', token:'zIndexPopup', value:2200, selector:'.ant-popconfirm', property:'zIndex', canvas:{route:'/system/alert-rules',trigger:'.ant-table-tbody button[role="switch"][aria-checked="true"]'} }
];
// Targeted continuation keeps already-passed component evidence instead of repeating writes.
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice(7).split(',');
if (only?.some(name => !cases.some(item => item.component === name))) throw new Error('Unknown component in --only');
const selectedCases = only ? cases.filter(item => only.includes(item.component)) : cases;
let sessionToken, browser, activePatch;
const records = [], errors = [];
function save(name, value) { writeFileSync(resolve(OUT, name), JSON.stringify(value, null, 2) + '\n'); }
function check(step, ok, detail) {
  records.push({ at:new Date().toISOString(), step, status:ok?'pass':'fail', detail });
  save('run-log.json', { baseUrl:BASE, inspect, canvasOnly, records, errors });
  console.log(`${ok?'PASS':'FAIL'} ${step}`);
  if (!ok) throw new Error(`${step}: ${JSON.stringify(detail)}`);
}
async function api(method, path, body) {
  const headers = { Accept:'application/json', Origin:BASE };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (sessionToken) headers['X-Ludi-Session'] = sessionToken;
  const res = await fetch(BASE + path, { method, headers, body:body===undefined?undefined:JSON.stringify(body), signal:AbortSignal.timeout(30000) });
  return { status:res.status, body:await res.json() };
}
async function bootstrap() {
  const r = await api('GET', '/__ludi/bootstrap');
  if (r.status !== 200 || !r.body.ok) throw new Error('Bootstrap unavailable');
  sessionToken = r.body.data.sessionToken;
  return r.body.data;
}
async function poll(id) {
  const until = Date.now() + 15 * 60 * 1000;
  while (Date.now() < until) {
    const r = await api('GET', `/__ludi/patch/${id}`);
    if (r.status !== 200 || !r.body.ok) throw new Error(`Patch read failed: ${id}`);
    if (r.body.data.status !== 'checking') return r.body.data;
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error(`Patch still checking: ${id}`);
}
async function submit(path, request) {
  try { return await api('POST', path, request); }
  catch (error) {
    // A lost response is not permission to create a new request.
    const list = await api('GET', '/__ludi/patches');
    const found = list.body?.data?.find(p => p.requestId === request.requestId);
    if (found) return { status:202, body:{ok:true,data:{patchId:found.id}} };
    return api('POST', path, request); // identical UUID and payload: server idempotency applies
  }
}
async function undo(id, before) {
  await bootstrap();
  const r = await submit('/__ludi/undo', {version:1,projectId:'tianshu-device-ops',requestId:randomUUID(),patchId:id});
  if (r.status !== 202 || !r.body.ok) throw new Error(`Undo rejected: ${JSON.stringify(r.body.error)}`);
  const patch = await poll(r.body.data.patchId);
  save(`undo-${id}.json`, patch);
  check(`${id}.undo`, patch.status === 'checks-passed' && sha(resolve(KIT, THEME)) === before, { status:patch.status, byteRestored:sha(resolve(KIT, THEME))===before });
  activePatch = undefined;
}
function watch(page, label) {
  page.on('pageerror', e => errors.push({label,message:e.message}));
  page.on('console', e => { if (e.type()==='error') errors.push({label,message:e.text()}); });
}
async function prepare(page, item) {
  if (item.openSelect) {
    const target = page.locator('.ant-select').first();
    await target.waitFor({state:'visible'});
    await target.click();
  }
  await page.locator(item.selector).first().waitFor({state:'visible',timeout:15000});
}
async function measure(page, item) {
  await prepare(page, item);
  return page.locator(item.selector).first().evaluate((element, property) => getComputedStyle(element)[property], item.property);
}
function equals(value, expected) {
  if (typeof expected === 'number') return Math.abs(Number.parseFloat(value) - expected) < 0.01;
  const c = new FastColor(expected);
  return value === `rgb(${c.r}, ${c.g}, ${c.b})`;
}
async function matrix(page, item) {
  // Standalone probes use normal interactions; editor=1 captures clicks for layer selection.
  await page.goto(`${BASE}/editor/matrix?component=${item.component}`, {waitUntil:'networkidle'});
  return measure(page, item);
}
async function canvas(page, item) {
  const spec = item.canvas;
  await page.goto(`${BASE}/device-ops${spec.route}?editor=1${spec.query?'&'+spec.query:''}`, {waitUntil:'networkidle'});
  if (spec.open) await page.getByRole('button',{name:spec.open,exact:true}).click();
  if (spec.trigger) await page.locator(spec.trigger).first().click();
  if (spec.dirty) {
    await page.locator('.ant-drawer .ant-select').first().click();
    await page.getByText('单台离线超 N 天',{exact:true}).click();
    await page.locator('.ant-drawer-footer').getByRole('button',{name:'取消',exact:true}).click();
  }
  const probe = {...item,selector:spec.selector??item.selector,openSelect:Boolean(spec.select)};
  if (spec.select) {
    await page.locator(spec.select).first().click();
    probe.openSelect = false;
  }
  return measure(page, probe);
}
async function preview(context) {
  const page = await context.newPage();watch(page,'preview');
  await page.goto(`${BASE}/editor`,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Button 按钮',exact:true}).click();
  const input = page.getByRole('spinbutton',{name:'按钮内容字体大小（contentFontSize）',exact:true});
  await input.waitFor({state:'visible'});
  await page.frameLocator('iframe').locator('.ant-btn').first().waitFor({state:'visible'});
  await page.screenshot({path:resolve(OUT,'editor-initial.png')});
  const before = sha(resolve(KIT, THEME));
  const frame = () => page.frames().find(f => f.url().includes('/editor/matrix?'));
  await input.fill('20');await input.press('Tab');
  await frame().waitForFunction(() => getComputedStyle(document.querySelector('.ant-btn:not(.ant-btn-lg):not(.ant-btn-sm)')).fontSize === '20px');
  check('preview.matrix',sha(resolve(KIT,THEME))===before,{fontSize:'20px',sourceUnchanged:true});
  await page.screenshot({path:resolve(OUT,'preview-matrix.png')});
  await page.getByRole('button',{name:'画布 小豆盒页面',exact:true}).click();
  const application = () => page.frames().find(f => f.url().includes('/device-ops/'));
  await page.locator('iframe').waitFor({state:'visible'});
  await page.frameLocator('iframe').locator('.device-ops-shell .ant-btn').first().waitFor({state:'visible'});
  await application().waitForFunction(() => getComputedStyle(document.querySelector('.ant-btn:not(.ant-btn-lg):not(.ant-btn-sm)')).fontSize === '20px');
  check('preview.canvas',sha(resolve(KIT,THEME))===before,{fontSize:'20px',sourceUnchanged:true});
  await page.screenshot({path:resolve(OUT,'preview-canvas.png')});
  await page.getByRole('button',{name:'撤销预览改动',exact:true}).click();
  check('preview.undo',sha(resolve(KIT,THEME))===before,{sourceUnchanged:true});
  await page.close();
}
async function main() {
  const differences = baselineDiff();
  if (differences.length) throw new Error(`Baseline mismatch; no writes: ${JSON.stringify(differences)}`);
  mkdirSync(OUT,{recursive:true});console.log(`EVIDENCE=${OUT}`);
  check('baseline.start',true,{matched:baseline.length});
  await bootstrap();
  browser = await chromium.launch({channel:'msedge',headless:true,timeout:30000});
  const context = await browser.newContext({viewport:{width:1440,height:900}});
  if (!inspect && !canvasOnly) await preview(context);
  if (previewOnly) {
    check('console',errors.length===0,errors);
    check('baseline.end',baselineDiff().length===0,{matched:baseline.length});
    save('result.json',{status:'previewed',componentWrites:0,records});
    console.log('PREVIEW-PASS');
    return;
  }
  const page = await context.newPage();watch(page,'matrix');
  const application = await context.newPage();watch(application,'canvas');
  for (const item of selectedCases) {
    const def = COMPONENT_TOKENS[item.component].find(d => d.name===item.token);
    check(`${item.component}.registered`,Boolean(def?.writable),{token:item.token});
    for (const width of [1440,1280]) {
      await page.setViewportSize({width,height:width===1440?900:800});
      const target = canvasOnly ? application : page;
      await target.setViewportSize({width,height:width===1440?900:800});
      const value = canvasOnly ? await canvas(target,item) : await matrix(page,item);
      const overflow = await target.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      check(`${item.component}.${canvasOnly?'canvas.':''}reachable.${width}`,!overflow,{value,overflow,route:canvasOnly?item.canvas.route:undefined});
      await target.screenshot({path:resolve(OUT,`${item.component}-${canvasOnly?'canvas-':''}${width}.png`)});
    }
    if (inspect) continue;
    const beforeValue = await matrix(page,item), beforeHash = sha(resolve(KIT,THEME));
    const beforeCanvas = item.canvas ? await canvas(application,item) : undefined;
    check(`${item.component}.different-value`,!equals(beforeValue,item.value),{beforeValue,newValue:item.value});
    await bootstrap();
    const req = {version:1,projectId:'tianshu-device-ops',requestId:randomUUID(),kind:'component',expectedFiles:[{file:THEME,sha256:beforeHash}],component:item.component,tokens:{[item.token]:item.value},route:canvasOnly?item.canvas.route:'/devices'};
    const accepted = await submit('/__ludi/patch',req);
    check(`${item.component}.accepted`,accepted.status===202&&accepted.body.ok,{status:accepted.status,error:accepted.body.error});
    activePatch = {id:accepted.body.data.patchId,before:beforeHash};
    const patch = await poll(activePatch.id);save(`patch-${item.component}.json`,patch);
    check(`${item.component}.checks`,patch.status==='checks-passed'&&patch.checks.every(c=>c.status==='passed'&&c.exitCode===0),{status:patch.status,checks:patch.checks.map(c=>({id:c.id,exitCode:c.exitCode}))});
    const state = await bootstrap();
    check(`${item.component}.source`,state.componentTokens[item.component]?.[item.token]?.value===item.value,{token:item.token,value:state.componentTokens[item.component]?.[item.token]?.value});
    const written = await matrix(page,item);
    check(`${item.component}.matrix.changed`,equals(written,item.value),{before:beforeValue,after:written});
    if (item.canvas) {
      const writtenCanvas = await canvas(application,item);
      check(`${item.component}.canvas.changed`,equals(writtenCanvas,item.value),{before:beforeCanvas,after:writtenCanvas});
      await application.screenshot({path:resolve(OUT,`${item.component}-canvas-written.png`)});
    }
    if (item.component==='Button') {
      const list = await api('GET','/__ludi/patches');
      check('history.list',list.body.data.some(p=>p.id===patch.id&&p.kind==='component'),{patchId:patch.id});
      await application.goto(`${BASE}/editor`,{waitUntil:'networkidle'});await application.reload({waitUntil:'networkidle'});
      check('history.undo-after-refresh',await application.getByRole('button',{name:'撤销最近一次写入',exact:true}).isEnabled(),{patchId:patch.id});
    }
    await undo(activePatch.id,beforeHash);
    const restored = await matrix(page,item);
    check(`${item.component}.matrix.restored`,restored===beforeValue,{before:beforeValue,after:restored});
    if (item.canvas) {
      const restoredCanvas = await canvas(application,item);
      check(`${item.component}.canvas.restored`,restoredCanvas===beforeCanvas,{before:beforeCanvas,after:restoredCanvas});
      await application.screenshot({path:resolve(OUT,`${item.component}-canvas-restored.png`)});
    }
    check(`${item.component}.baseline`,baselineDiff().length===0,{matched:baseline.length});
  }
  check('console',errors.length===0,errors);
  check('baseline.end',baselineDiff().length===0,{matched:baseline.length});
  save('result.json',{status:inspect?'inspected':'passed',componentWrites:inspect?0:selectedCases.length,matrixComponents:inspect&&canvasOnly?[]:selectedCases.map(i=>i.component),canvasComponents:canvasOnly?selectedCases.map(i=>i.component):inspect?[]:selectedCases.filter(i=>i.canvas).map(i=>i.component),records});
  console.log(`${inspect?'COMPONENTS-INSPECT-PASS':'COMPONENTS-PASS'} (${selectedCases.length}/9 this run)`);
}
try { await main(); }
catch (error) {
  console.error(error.message);process.exitCode=1;
  if (activePatch) {
    try { await poll(activePatch.id);await undo(activePatch.id,activePatch.before); }
    catch (restoreError) { console.error(`Undo needs attention: ${restoreError.message}`); }
  }
  if (records.length) save('failure.json',{status:'failed',message:error.message,baselineDifferences:baselineDiff(),records,errors});
}
finally { await browser?.close(); }
