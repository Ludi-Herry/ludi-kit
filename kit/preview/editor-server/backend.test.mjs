import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, renameSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { EditorService, hash, ALLOWED, THEME, CSS, BASE, LIST_LIMIT, authorize, safePath, middleware } from './service.mjs';
import { readTheme, normalizeTheme, changeTheme, contrast, suggestedColor, suggestedAgainst, SHADOW_LEVELS } from './theme.mjs';
import { COMPONENT_TOKENS as SERVER_COMPONENT_TOKENS, P0_COMPONENT_NAMES } from './component-tokens.mjs';
import { parse, walk, imports, component } from './ast.mjs';
import { analyzeReplacement } from './replacements.mjs';
import { locate, editorPlugin } from './plugin.mjs';
import { Readable } from 'node:stream';

const kitRoot=fileURLToPath(new URL('../..',import.meta.url));
const tempRoot=mkdtempSync(resolve(tmpdir(),'agent-t1-a-'));
console.log(`TEMP_ROOT=${tempRoot}`);
// 只删本次 mkdtemp 建的目录；内含的 junction 指向同一目录下，rmSync 按 lstat 只删链接本身。需要保留现场排查时设 LUDI_KEEP_TEST_TEMP=1。
test.after(()=>{if(process.env.LUDI_KEEP_TEST_TEMP!=='1')rmSync(tempRoot,{recursive:true,force:true});});
let fixtureId=0;
const payload={version:1,projectId:'tianshu-device-ops'};
// 26 个协议字段全量：旧六值 + 第二批新开放字段。所有颜色满足各自对比度配对（写回路径应通过）。
const theme={colorPrimary:'#0050b3',colorSuccess:'#237804',colorWarning:'#ad6800',colorError:'#a8071a',colorInfo:'#003eb3',colorText:'#111827',colorTextSecondary:'#4b5563',colorBorder:'#9ca3af',colorBgBase:'#eeeeee',colorBgContainer:'#fafafa',fontFamily:'Inter, "PingFang SC", sans-serif',fontFamilyCode:"'JetBrains Mono', Consolas, monospace",fontSize:16,lineHeight:1.6,sizeUnit:4,sizeStep:4,spaceSm:10,spaceMd:16,spaceLg:28,controlHeight:32,borderRadius:4,borderRadiusLG:10,lineWidth:2,shadowLevel:'light',motion:false,motionUnit:0.15};
const page=`${BASE}/generated/DeviceListPage.tsx`;
async function checks(patch,save){patch.checks=['preview.tsc','kit.antd:lint:projects','kit.check:antd','browser.edge-smoke'].map(id=>({id,status:'passed',exitCode:0,stdout:'unit-test check double',stderr:''}));save();return true;}
function fixture(options={}) {
  const root=resolve(tempRoot,String(fixtureId++));mkdirSync(root,{recursive:true});
  for(const file of [...ALLOWED,`${BASE}/data.ts`,`${BASE}/store.ts`,`${BASE}/pages.json`,`${BASE}/app.tsx`,`${BASE}/ui.tsx`]) {mkdirSync(dirname(resolve(root,file)),{recursive:true});copyFileSync(resolve(kitRoot,file),resolve(root,file));}
  // 断言依赖固定的主题值，这里用冻结夹具，项目主题改版不应连带这些写回测试。
  copyFileSync(fileURLToPath(new URL('./fixtures/theme.baseline.ts',import.meta.url)),resolve(root,THEME));
  const service=new EditorService({root,runChecks:checks,...options});return {root,service};
}
const expected=(service,files)=>files.map(file=>({file,sha256:hash(service.read(file))}));
function themeRequest(service,override={}) {return {...payload,requestId:randomUUID(),kind:'theme',expectedFiles:expected(service,[THEME,CSS]),theme,route:'/devices',...override};}
function position(source,comp) {
  let loc;const ast=parse(source),bindings=imports(ast);
  walk(ast,node=>{if(!loc&&node.type==='JSXElement'&&component(node.openingElement.name,bindings)===comp)loc={file:page,...node.openingElement.loc.start,component:comp};});
  return {file:page,line:loc.line,column:loc.column,component:comp};
}
function analyze(source,comp,context={}) {return analyzeReplacement(source,position(source,comp),{storeVerified:true,...context});}
// 把 fixture 的两份受管文件转成 CRLF（undo 必须按原字节恢复，含行尾）。
function toCrlf(root,service) {for(const file of [THEME,CSS])writeFileSync(resolve(root,file),service.read(file).toString('utf8').replaceAll('\n','\r\n'));}

test('bootstrap reads global defaults independently of component overrides; all 14 real registrations',()=>{
  const {service}=fixture(),b=service.bootstrap();assert.equal(b.routes.length,14);assert.equal(b.theme.fontSize,14);assert.equal(b.theme.controlHeight,32);assert.equal(b.theme.borderRadius,6);assert.equal(b.routes.find(r=>r.id==='device-detail').path,'/device-ops/devices/TS24070101');assert.equal(b.sessionToken.length,64);assert.ok(b.routes.every(r=>!r.path.includes(':')));
  assert.equal(b.theme.colorSuccess,'#52c41a');assert.equal(b.theme.colorError,'#ff4d4f');assert.equal(b.theme.lineHeight,1.57);assert.equal(b.theme.spaceSm,12);assert.equal(b.theme.spaceMd,16);assert.equal(b.theme.spaceLg,24);assert.equal(b.theme.borderRadiusLG,8);assert.equal(b.theme.shadowLevel,'default');assert.equal(b.theme.motion,true);assert.equal(b.theme.motionUnit,0.1);assert.equal(b.theme.fontFamilyCode,"'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace");
  assert.ok(b.foundations.grid.breakpoints.some(x=>x.token==='screenXS'&&x.px===480));assert.ok(b.foundations.grid.breakpoints.some(x=>x.token==='screenXXL'&&x.px===1600));assert.equal(b.foundations.grid.siderWidth,232);assert.equal(b.foundations.grid.contentMaxWidth,1440);
  const icons=b.foundations.icons;assert.equal(icons.library,'@ant-design/icons');assert.ok(icons.files.length>0&&icons.files.every(f=>f.count>=0));assert.ok(icons.files.some(f=>f.file.endsWith('app.tsx')&&f.icons.includes('LockOutlined')));
});
test('theme synchronizes token, all relevant existing component overrides, duplicate CSS; undo restores original bytes after restart',async()=>{
  const {root,service}=fixture();const before=[service.read(THEME),service.read(CSS)];
  const req=themeRequest(service),response=service.patch(req);assert.equal(response.status,'checking');await service.completion;
  const source=service.read(THEME).toString(),css=service.read(CSS).toString();assert.deepEqual(readTheme(source,css),theme);assert.match(source,/itemBorderRadius: 4/);assert.match(source,/bodyBg: "#eeeeee"/);assert.match(source,/headerBg: "#fafafa"/);assert.match(source,/borderColor: "#9ca3af"/);assert.match(css,/--do-primary: #0050b3;/);assert.match(css,/--do-text: #111827;/);assert.match(css,/--do-text-secondary: #4b5563;/);assert.match(css,/--do-border: #9ca3af;/);assert.match(css,/--do-space-sm: 10px;/);assert.equal(service.get(response.patchId).technical,'checks-passed');
  const second=new EditorService({root,runChecks:checks}),undo=second.undo({...payload,requestId:randomUUID(),patchId:response.patchId});await second.completion;
  assert.deepEqual(second.read(THEME),before[0]);assert.deepEqual(second.read(CSS),before[1]);assert.equal(second.get(undo.patchId).undoOf,response.patchId);assert.equal(second.get(response.patchId).status,'undone');
  assert.throws(()=>second.undo({...payload,requestId:randomUUID(),patchId:response.patchId}),e=>e.code==='UNDO_CONFLICT');
});
test('CSS repeated declarations in both selectors, numeric clamp, contrast rejection before writes',()=>{
  const original=readFileSync(resolve(kitRoot,THEME),'utf8');const vars='--do-primary: #1677ff; --do-bg: #f6f8fb; --do-surface: #ffffff; --do-text: #1f2937; --do-text-secondary: #6b7280; --do-border: #d8dee8; --do-space-sm: 12px; --do-space-md: 16px; --do-space-lg: 24px;';
  const css=`:root { ${vars} }\r\n.device-ops-shell { ${vars} }`;
  const [output,next]=changeTheme(original,css,theme);assert.equal(next.match(/#0050b3/g).length,2);assert.equal(next.match(/#eeeeee/g).length,2);assert.equal(next.match(/#fafafa/g).length,2);assert.equal(next.match(/--do-text: #111827/g).length,2);assert.equal(next.match(/--do-text-secondary: #4b5563/g).length,2);assert.equal(next.match(/--do-border: #9ca3af/g).length,2);assert.equal(next.match(/--do-space-sm: 10px/g).length,2);assert.ok(!next.includes('--do-radius'));parse(output);
  assert.match(output,/colorLink: "#0050b3"/,'LF 写回派生 colorLink 等于新主色');
  const [crlfOutput]=changeTheme(original.replaceAll('\n','\r\n'),css,theme);assert.match(crlfOutput,/colorLink: "#0050b3"/,'CRLF 写回派生 colorLink 等于新主色');assert.ok(!crlfOutput.replaceAll('\r\n','').includes('\n'),'CRLF 不混入 lone LF');parse(crlfOutput);
  const [again]=changeTheme(output,css,theme);assert.equal(again.match(/colorLink:/g).length,1,'重复写回替换而非新增 colorLink');
  assert.equal(normalizeTheme({...theme,borderRadius:3,controlHeight:999}).theme.borderRadius,2);assert.equal(normalizeTheme({...theme,controlHeight:999}).theme.controlHeight,48);assert.ok(contrast(suggestedColor('#aaaaaa'))>=4.5);
  const {service}=fixture();const bytes=service.read(THEME);assert.throws(()=>service.patch(themeRequest(service,{theme:{...theme,colorPrimary:'#ffffff'}})),e=>e.code==='RULE_FAILED');assert.deepEqual(service.read(THEME),bytes);
});
test('current primary below 4.5:1 unchanged: other tokens still write, rule is non-blocking pass with suggestion',async()=>{
  const {service}=fixture();const current=service.bootstrap().theme;assert.equal(current.colorPrimary,'#1677ff');assert.ok(contrast(current.colorPrimary)<4.5);
  const response=service.patch(themeRequest(service,{theme:{...current,borderRadius:4}}));assert.equal(response.status,'checking');await service.completion;
  const rule=service.get(response.patchId).rules.find(r=>r.id==='token.colorPrimary');assert.equal(rule.status,'pass');assert.match(rule.message,/现状主色对比度 [0-9].[0-9]{2} 低于 4.5:1，建议 #[0-9a-f]{6}/);assert.ok(contrast(rule.suggestedValue)>=4.5);
  const written=readTheme(service.read(THEME).toString(),service.read(CSS).toString());assert.equal(written.borderRadius,4);assert.equal(written.colorPrimary,'#1677ff');assert.equal(service.get(response.patchId).technical,'checks-passed');
});
test('primary changed from non-compliant current to another non-compliant value is rejected with bytes unchanged',()=>{
  const {service}=fixture();const current=service.bootstrap().theme;assert.equal(current.colorPrimary,'#1677ff');const before=[service.read(THEME),service.read(CSS)];
  assert.throws(()=>service.patch(themeRequest(service,{theme:{...current,colorPrimary:'#faad14'}})),e=>e.code==='RULE_FAILED'&&e.details.rules[0].status==='fail'&&Boolean(e.details.rules[0].suggestedValue));
  assert.deepEqual(service.read(THEME),before[0]);assert.deepEqual(service.read(CSS),before[1]);
  assert.equal(normalizeTheme({...current,colorPrimary:'#1677FF'},current).rules[0].status,'pass','规范化后相同视为未改');assert.equal(normalizeTheme({...current,colorPrimary:'#1677ff'}).rules[0].status,'fail','未提供当前主色时按改动处理');
});
test('unreadable current theme fails closed: no write, no downgrade to allow',()=>{
  const {root,service}=fixture();writeFileSync(resolve(root,THEME),'export const notTheme = 1;');const css=service.read(CSS),theme0=service.read(THEME);
  assert.throws(()=>service.patch(themeRequest(service,{theme:{...theme,colorPrimary:'#0050b3'}})),e=>e.code==='BAD_REQUEST');assert.deepEqual(service.read(THEME),theme0);assert.deepEqual(service.read(CSS),css);
});
test('idempotency accepts identical reordered payload, persists across restart; conflicts never overwrite',async()=>{
  const {root,service}=fixture();const req=themeRequest(service),result=service.patch(req);await service.completion;assert.deepEqual(service.patch({...req,theme:{...theme}}),result);assert.throws(()=>service.patch({...req,theme:{...theme,fontSize:18}}),e=>e.code==='REQUEST_ID_CONFLICT');
  const resumed=new EditorService({root,runChecks:checks});assert.deepEqual(resumed.patch(req),result);
  const before=resumed.read(CSS);writeFileSync(resolve(root,CSS),Buffer.concat([before,Buffer.from('\n/* external */')]));assert.throws(()=>resumed.undo({...payload,requestId:randomUUID(),patchId:result.patchId}),e=>e.code==='UNDO_CONFLICT');assert.match(resumed.read(CSS).toString(),/external/);
});
test('whitelist, traversal, absolute path, extra fields, bad hash; symlink escape blocks',()=>{
  const {root,service}=fixture();for(const path of ['../theme.ts',THEME.replace('theme.ts','../theme.ts'),'C:/theme.ts',`${BASE}/store.ts`,THEME.replaceAll('/','\\')])assert.throws(()=>safePath(root,path),e=>e.code==='PATH_NOT_ALLOWED');
  assert.throws(()=>service.patch(themeRequest(service,{code:'danger'})),e=>e.code==='BAD_REQUEST');assert.throws(()=>service.patch(themeRequest(service,{expectedFiles:expected(service,[THEME,CSS]).map(x=>({...x,sha256:'0'.repeat(64)}))})),e=>e.code==='HASH_CONFLICT');
  const other=resolve(tempRoot,'outside-owned-fixture');mkdirSync(other,{recursive:true});const link=resolve(root,'linked-root');symlinkSync(other,link,'junction');console.log(`OWNED_JUNCTION=${link}`);assert.throws(()=>safePath(link,THEME),e=>e.code==='PATH_NOT_ALLOWED');
});
test('transaction rolls all original bytes back on second-file I/O failure',()=>{
  let calls=0;const {service}=fixture({io:{rename:(a,b)=>{if(++calls===2)throw new Error('injected second rename failure');renameSync(a,b);}}});
  const before=[service.read(THEME),service.read(CSS)];assert.throws(()=>service.patch(themeRequest(service)),e=>e.code==='WRITE_FAILED');assert.deepEqual(service.read(THEME),before[0]);assert.deepEqual(service.read(CSS),before[1]);
});
test('failed checks preserve edited source, stdout and stderr; mutual exclusion until terminal',async()=>{
  let finish;const pending=new Promise(r=>finish=r);const {service}=fixture({runChecks:async(p,save)=>{await pending;p.checks=[{id:'preview.tsc',status:'failed',exitCode:2,stdout:'raw stdout',stderr:'raw stderr'},{id:'kit.check:antd',status:'passed',exitCode:0,stdout:'independent pass'}];save();return false;}});
  const result=service.patch(themeRequest(service));assert.throws(()=>service.patch(themeRequest(service)),e=>e.code==='PATCH_BUSY');finish();await service.completion;const p=service.get(result.patchId);assert.equal(p.status,'failed');assert.equal(p.checks[0].stderr,'raw stderr');assert.equal(p.checks[1].status,'passed');assert.equal(readTheme(service.read(THEME).toString(),service.read(CSS).toString()).colorPrimary,theme.colorPrimary);assert.equal(p.visual,'pending-owner-review');assert.equal(p.codeReview,'pending-owner-review');
});
for(const eol of ['\n','\r\n'])test(`Modal/Drawer bidirectional default buttons, alias imports, untouched bytes (${JSON.stringify(eol)})`,()=>{
  const prefix=`import { Modal as Dialog, Button, Space } from "antd";${eol}// untouched${eol}export function Page(){ return (`;
  const suffix=`); }${eol}// byte-preserved tail${eol}`;
  const source=prefix+'<Dialog open={open} onCancel={() => close()} onOk={save} title="编辑" />'+suffix;
  const result=analyze(source,'Modal');assert.equal(result.candidates.length,1,JSON.stringify(result.rules));assert.ok(result.output.endsWith(suffix));assert.ok(result.output.includes(prefix));assert.match(result.output,/onClick=\{save\}/);assert.match(result.output,/onClose=/);assert.ok(!result.output.replaceAll('\r\n','').includes('\n')||eol==='\n');
  const reverse=analyze(result.output,'Drawer');assert.equal(reverse.candidates.length,1,JSON.stringify(reverse.rules));assert.match(reverse.output,/onCancel=/);assert.match(reverse.output,/footer=/);parse(reverse.output);
});
test('Select/Radio.Group preserves scalar selection via event adapter; static <=5 options; unmapped placeholder explicit',()=>{
  const source='import { Select as Choice } from "antd"; const options = [{ value: "a", label: "甲" }, { value: "b", label: "乙" }]; const set = (value) => save(value); export function Page(){return <Choice options={options} value={value} onChange={set} placeholder="选择" />;}';
  const forward=analyze(source,'Select');assert.equal(forward.candidates.length,1,JSON.stringify(forward.rules));assert.deepEqual(forward.candidates[0].unmappedProps,['placeholder']);assert.match(forward.output,/ludiEvent.target.value/);
  const reverse=analyze(forward.output,'Radio.Group');assert.equal(reverse.candidates.length,1,JSON.stringify(reverse.rules));assert.ok(!reverse.output.includes('ludiEvent.target.value'));parse(reverse.output);
  for(const props of ['options={getOptions()}','options={options} allowClear','options={options} mode="multiple"','options={options} onChange={(value, option) => save(option)}']) {
    const r=analyze(source.replace('options={options} value={value} onChange={set} placeholder="选择"',props),'Select');assert.equal(r.candidates.length,0);assert.equal(r.rules[0].status,'blocked');
  }
});
test('confirmation bidirectional with source-owned B proof; C upgrades only; text/unknown callback/changed store cannot grant permission',()=>{
  const base='import { App, Button, Popconfirm } from "antd"; import { deviceOpsStore } from "../store"; export function Page(){const {modal}=App.useApp();return ';
  const source=base+'<Popconfirm title="停用？" description="告警不会补发" onConfirm={() => deviceOpsStore.setRuleEnabled(rule.id, false)}><Button>停用</Button></Popconfirm>; }';
  const forward=analyze(source,'Popconfirm');assert.equal(forward.candidates.length,1,JSON.stringify(forward.rules));assert.match(forward.output,/modal.confirm/);assert.match(forward.output,/onOk:/);
  const reverse=analyze(forward.output,'Button');assert.equal(reverse.candidates.length,1,JSON.stringify(reverse.rules));assert.match(reverse.output,/onConfirm=/);
  const c=analyze(source.replace('setRuleEnabled(rule.id, false)','cancelTask(task.id)'),'Popconfirm');assert.equal(c.candidates.length,1);assert.equal(analyze(c.output,'Button').rules[0].status,'blocked');
  assert.equal(analyze(source.replace('deviceOpsStore.setRuleEnabled(rule.id, false)','unknownAction()'),'Popconfirm').rules[0].status,'blocked');assert.equal(analyze(source,'Popconfirm',{storeVerified:false}).rules[0].status,'blocked');
});
test('replacement endpoint recomputes candidate, exact unmapped confirmation and hash; unknown loc blocked',async()=>{
  const {root,service}=fixture();const source='import { Select } from "antd"; export function Page(){return <Select options={[{value:"a",label:"甲"}]} placeholder="选择" />;}';writeFileSync(resolve(root,page),source);
  const loc=position(source,'Select'),sha256=hash(Buffer.from(source)),r=service.candidates({...payload,loc,expectedSha256:sha256});assert.equal(r.candidates.length,1);
  const req={...payload,requestId:randomUUID(),kind:'replace',loc,candidateId:r.candidates[0].id,expectedFiles:expected(service,[page]),confirmedUnmappedProps:[],route:'/devices'};
  assert.throws(()=>service.patch(req),e=>e.code==='UNMAPPED_PROPS');assert.equal(service.read(page).toString(),source);
  const result=service.patch({...req,requestId:randomUUID(),confirmedUnmappedProps:['placeholder']});await service.completion;assert.equal(service.get(result.patchId).status,'checks-passed');
  const unknown=analyzeReplacement(source,{...loc,column:999},{storeVerified:true});assert.equal(unknown.rules[0].status,'blocked');
});
test('dev locator: imported antd JSX (aliases, Radio.Group) plus lowercase native tags; local components, Fragment, non-antd members not injected; shadowed bindings blocked; serve-only plugin',()=>{
  const source='import { Button as Action, Radio } from "antd"; const Box=()=>null; export function Page(){return <div><Action /><Radio.Group /><Box /></div>;}';const located=locate(source,page);assert.equal(located.match(/data-ludi-comp=/g).length,3);assert.match(located,/data-ludi-comp="Button"/);assert.match(located,/data-ludi-comp="Radio.Group"/);assert.match(located,/<div data-ludi-loc="[^"]+" data-ludi-comp="div" \{\.\.\.__ludiPreviewProps\d+\(/);parse(located);assert.ok(!/<Box [^>]*data-ludi/.test(located),'大写本地组件不注入');
  const nativeSource='import { Button } from "antd"; import * as ns from "./ns"; const Box=()=>null; export function Page(){return <><Box /><ns.Thing /><section><span>a</span><svg><path d="M0 0" /></svg><Button><b>x</b></Button></section></>;}';
  const nativeLocated=locate(nativeSource,page);parse(nativeLocated);assert.deepEqual([...nativeLocated.matchAll(/data-ludi-comp="([^"]+)"/g)].map(m=>m[1]).sort(),['Button','b','path','section','span','svg']);assert.ok(!/<(?:Box|ns.Thing)[^>]*data-ludi/.test(nativeLocated),'Fragment、本地组件与非 antd 成员表达式不注入');
  assert.equal(locate(nativeLocated,page),nativeLocated,'重复注入幂等');assert.equal(editorPlugin(kitRoot).apply,'serve');assert.equal(editorPlugin(kitRoot).transform(source,resolve(kitRoot,'projects/other/Page.tsx')),null);
  const shadow='import { Button } from "antd"; export function Page(Button){return <Button />;}';assert.equal(locate(shadow,page),shadow);
  const generic='import { Segmented, Table } from "antd"; type Row={value:string}; export function Page(){return <div><Segmented<string> options={[]} onChange={save} /><Table<Row> dataSource={[]} /></div>;}';
  const locatedGeneric=locate(generic,page);parse(locatedGeneric);assert.match(locatedGeneric,/<Segmented<string> data-ludi-loc=/);assert.match(locatedGeneric,/<Table<Row> data-ludi-loc=/);
  const gAst=parse(generic),gBindings=imports(gAst),gLocs=[];
  walk(gAst,n=>{if(n.type==='JSXElement'&&component(n.openingElement.name,gBindings))gLocs.push(n.openingElement.loc.start);});
  assert.equal(gLocs.length,2);for(const {line,column} of gLocs)assert.ok(locatedGeneric.includes(`data-ludi-loc="${page}:${line}:${column}"`),`${line}:${column}`);
  const pc='import { Button, Popconfirm } from "antd"; export function Page(){return <Popconfirm title="x" onConfirm={f}><Button>删</Button></Popconfirm>;}';
  const locatedPc=locate(pc,page);parse(locatedPc);assert.match(locatedPc,/data-ludi-comp="Popconfirm"/);assert.match(locatedPc,/<Button data-ludi-loc="[^"]+" data-ludi-comp="Button" data-ludi-owner-loc="[^"]+" data-ludi-owner-comp="Popconfirm" \{\.\.\.__ludiPreviewProps\d+\(/);
  const pcAst=parse(pc),pcBindings=imports(pcAst);let pcLoc;walk(pcAst,n=>{if(n.type==='JSXElement'&&component(n.openingElement.name,pcBindings)==='Popconfirm'&&!pcLoc)pcLoc=n.openingElement.loc.start;});
  assert.ok(locatedPc.includes(`data-ludi-owner-loc="${page}:${pcLoc.line}:${pcLoc.column}"`),'owner loc = Popconfirm loc');
  for(const bad of ['<Popconfirm title="x"><Button>删</Button><Button>留</Button></Popconfirm>','<Popconfirm title="x">{ok && <Button>删</Button>}</Popconfirm>','<Popconfirm title="x">纯文本</Popconfirm>'])assert.ok(!locate(`import { Button, Popconfirm } from "antd"; export function Page(){return ${bad};}`,page).includes('data-ludi-owner-loc'),bad);
  const pcGeneric=locate('import { Button, Popconfirm } from "antd"; type P={a:number}; export function Page(){return <Popconfirm title="x"><Button<P>>删</Button></Popconfirm>;}',page);parse(pcGeneric);assert.match(pcGeneric,/<Button<P> data-ludi-loc=/);assert.match(pcGeneric,/<Button<P> [^>]*data-ludi-owner-loc=/);
});
test('native element loc is not replaceable: blocked, no candidates (service untouched)',()=>{
  const source='import { Button } from "antd"; export function Page(){return <div><Button>保存</Button></div>;}';const located=locate(source,page),m=/<div data-ludi-loc="[^:]+:([0-9]+):([0-9]+)" data-ludi-comp="div"/.exec(located);assert.ok(m);
  const native=analyzeReplacement(source,{file:page,line:Number(m[1]),column:Number(m[2]),component:'div'},{storeVerified:true});assert.deepEqual(native.candidates,[]);assert.equal(native.rules[0].status,'blocked');
  const {service}=fixture();assert.equal(service.candidates({...payload,loc:{file:page,line:Number(m[1]),column:Number(m[2]),component:'div'},expectedSha256:hash(service.read(page))}).candidates.length,0);
});
test('dev locator accepts all 14 real generated pages plus app.tsx and ui.tsx (read-only); every lowercase tag is injected and still parses',()=>{
  const files=[...ALLOWED.filter(f=>f.endsWith('Page.tsx')),`${BASE}/app.tsx`,`${BASE}/ui.tsx`];assert.equal(files.length,16);
  let owners=0;
  for(const file of files){const source=readFileSync(resolve(kitRoot,file),'utf8');let out='';assert.doesNotThrow(()=>{out=locate(source,file);},file);parse(out);const hits=out.match(/data-ludi-owner-loc=/g);owners+=hits?hits.length:0;if(file.endsWith('FirmwarePage.tsx'))assert.ok(out.includes('data-ludi-owner-loc="projects/tianshu-device-ops/generated/FirmwarePage.tsx:415:'),'FirmwarePage:415 owner injection');}
  assert.ok(owners>=1,'at least one owner injection');console.log(`OWNER_INJECTIONS=${owners}`);
  let natives=0;for(const file of files){const source=readFileSync(resolve(kitRoot,file),'utf8'),out=locate(source,file);const ast=parse(source);let expectedNatives=0;walk(ast,n=>{if(n.type==='JSXOpeningElement'&&n.name.type==='JSXIdentifier'&&/^[a-z]/.test(n.name.name))expectedNatives++;});const got=[...out.matchAll(/data-ludi-comp="([a-z][^"]*)"/g)].length;assert.equal(got,expectedNatives,file);natives+=got;}
  assert.ok(natives>100,'native tags injected across the 16 files');console.log(`NATIVE_INJECTIONS=${natives}`);
});
test('patch list survives restart, newest first, capped, served read-only over GET /__ludi/patches',async()=>{
  const {root,service}=fixture();const written=service.patch(themeRequest(service));await service.completion;
  const second=new EditorService({root,runChecks:checks}),undone=second.undo({...payload,requestId:randomUUID(),patchId:written.patchId});await second.completion;
  const third=new EditorService({root,runChecks:checks}),list=third.list();
  assert.ok(list.length<=LIST_LIMIT);assert.deepEqual(list.slice(0,2).map(p=>p.id),[undone.patchId,written.patchId]);
  assert.equal(list[1].status,'undone');assert.equal(list[1].undoneBy,undone.patchId);assert.equal(list[0].undoOf,written.patchId);
  for(let i=1;i<list.length;i++)assert.ok(list[i-1].createdAt>=list[i].createdAt,'newest first');
  list[0].status='tampered';assert.notEqual(third.get(undone.patchId).status,'tampered');
  const request=Readable.from([]);Object.assign(request,{url:'/__ludi/patches',method:'GET',headers:{host:'127.0.0.1:5393',origin:'http://127.0.0.1:5393'},socket:{remoteAddress:'127.0.0.1'}});
  const response={setHeader:()=>{},end:body=>response.body=JSON.parse(body)};await middleware(third,5393)(request,response,()=>assert.fail());
  assert.equal(response.statusCode??200,200);assert.ok(response.body.ok);assert.deepEqual(response.body.data.map(p=>p.id),third.list().map(p=>p.id));
});
test('HTTP source, Host, session, content type, oversized body; no CORS',async()=>{
  const good={host:'127.0.0.1:5393',origin:'http://127.0.0.1:5393','x-ludi-session':'token','content-type':'application/json'};
  authorize(good,'127.0.0.1',5393,'token',true);
  for(const patch of [{origin:'https://evil.example'},{host:'evil.example:5393'},{'x-ludi-session':'wrong'},{'content-type':'text/plain'},{origin:undefined}])assert.throws(()=>authorize({...good,...patch},'127.0.0.1',5393,'token',true));
  assert.throws(()=>authorize(good,'192.0.2.1',5393,'token',true),e=>e.code==='UNAUTHORIZED_ORIGIN');
  const {service}=fixture(),request=Readable.from([Buffer.alloc(33000)]);Object.assign(request,{url:'/__ludi/patch',method:'POST',headers:{...good,'x-ludi-session':service.sessionToken},socket:{remoteAddress:'127.0.0.1'}});
  const headers={},response={setHeader:(k,v)=>headers[k]=v,end:body=>response.body=JSON.parse(body)};await middleware(service,5393)(request,response,()=>assert.fail());assert.equal(response.statusCode,413);assert.equal(response.body.error.code,'BODY_TOO_LARGE');assert.ok(!('Access-Control-Allow-Origin' in headers));
});

/* ------------------------------------------------------------------ round7：「基础」变量扩充
   每个新可写值做一次「写回 + 撤销字节复原」，LF 与 CRLF 各一轮；另补范围越界拒绝、
   字体非法字符拒绝与自动补栈、对比度三种语义、阴影非档位 fail-closed、纯 CSS 字段不动 theme.ts。 */

// 20 个新开放值：只改该值，其余取服务端读出的当前值。
const NEW_VALUES=[
  ['colorSuccess','#1d7202',/colorSuccess: "#1d7202"/,null],
  ['colorWarning','#8a4b00',/colorWarning: "#8a4b00"/,null],
  ['colorError','#8c0616',/colorError: "#8c0616"/,null],
  ['colorInfo','#002c8c',/colorInfo: "#002c8c"/,null],
  ['colorText','#0f172a',/colorText: "#0f172a"/,/--do-text: #0f172a;/],
  ['colorTextSecondary','#374151',/colorTextSecondary: "#374151"/,/--do-text-secondary: #374151;/],
  ['colorBorder','#64748b',/colorBorder: "#64748b"/,/--do-border: #64748b;/],
  ['fontFamily','"Source Han Sans SC", sans-serif',/fontFamily:\s+"\\"Source Han Sans SC\\", sans-serif"/,null],
  ['fontFamilyCode',"'JetBrains Mono', monospace",/fontFamilyCode: "'JetBrains Mono', monospace"/,null],
  ['lineHeight',1.8,/lineHeight: 1\.8\b/,null],
  ['sizeUnit',6,/sizeUnit: 6/,null],
  ['sizeStep',2,/sizeStep: 2/,null],
  ['spaceSm',8,null,/--do-space-sm: 8px;/],
  ['spaceMd',20,null,/--do-space-md: 20px;/],
  ['spaceLg',32,null,/--do-space-lg: 32px;/],
  ['borderRadiusLG',12,/borderRadiusLG: 12/,null],
  ['lineWidth',2,/lineWidth: 2/,null],
  ['shadowLevel','deep',/boxShadowSecondary: "0 9px 28px 8px rgba\(0, 0, 0, 0\.06\)/,null],
  ['motion',false,/motion: false/,null],
  ['motionUnit',0.2,/motionUnit: 0\.2\b/,null]
];
for(const eol of ['lf','crlf'])for(const [key,value,themeMatch,cssMatch] of NEW_VALUES) {
  test(`new writable token writes back and undo restores bytes (${key}, ${eol})`,async()=>{
    const {root,service}=fixture();if(eol==='crlf')toCrlf(root,service);
    const before=[service.read(THEME),service.read(CSS)],current=service.bootstrap().theme;
    const response=service.patch(themeRequest(service,{theme:{...current,[key]:value}}));assert.equal(response.status,'checking');await service.completion;
    const source=service.read(THEME).toString(),css=service.read(CSS).toString();
    if(themeMatch)assert.match(source,themeMatch,`${key} 写进 theme.ts`);if(cssMatch)assert.match(css,cssMatch,`${key} 同步 styles.css`);
    if(eol==='crlf'){assert.ok(!source.replaceAll('\r\n','').includes('\n'),'theme.ts CRLF 不混入 lone LF');assert.ok(!css.replaceAll('\r\n','').includes('\n'),'styles.css CRLF 不混入 lone LF');}
    assert.equal(service.get(response.patchId).technical,'checks-passed');
    const second=new EditorService({root,runChecks:checks});const undo=second.undo({...payload,requestId:randomUUID(),patchId:response.patchId});await second.completion;
    assert.deepEqual(second.read(THEME),before[0],'theme.ts 撤销按原字节恢复');assert.deepEqual(second.read(CSS),before[1],'styles.css 撤销按原字节恢复');assert.equal(second.get(response.patchId).status,'undone');
  });
}

test('range rules reject out-of-range and non-integer values before any write',()=>{
  const {service}=fixture();const base=service.bootstrap().theme;const before=[service.read(THEME),service.read(CSS)];
  for(const [key,value] of [['lineHeight',1.2],['lineHeight',2.1],['sizeUnit',1],['sizeUnit',9],['sizeUnit',4.5],['sizeStep',9],['spaceSm',3],['spaceLg',49],['spaceMd',12.5],['lineWidth',0],['lineWidth',4],['motionUnit',0.01],['motionUnit',0.21]]) {
    assert.throws(()=>service.patch(themeRequest(service,{theme:{...base,[key]:value}})),e=>e.code==='BAD_REQUEST'&&e.message.includes(key),`${key}=${value} 应被越界拒绝`);
  }
  assert.throws(()=>service.patch(themeRequest(service,{theme:{...base,spaceSm:40,spaceMd:16}})),e=>e.code==='BAD_REQUEST'&&/sm ≤ md ≤ lg/.test(e.message),'--do-space 乱序拒绝');
  assert.deepEqual(service.read(THEME),before[0]);assert.deepEqual(service.read(CSS),before[1]);
});
test('font family charset whitelist rejects bad characters and overlong; missing generic auto-appends',async()=>{
  for(const bad of ['Inter; rm -rf','{Inter}','Inter}','Inter<','Inter>','Inter/Next','Inter\\Next','url(//evil)','a'.repeat(301)]) {
    const {service}=fixture();const current=service.bootstrap().theme;const bytes=service.read(THEME);
    assert.throws(()=>service.patch(themeRequest(service,{theme:{...current,fontFamily:bad}})),e=>e.code==='BAD_REQUEST',`拒绝非法字体：${bad.slice(0,24)}`);assert.deepEqual(service.read(THEME),bytes);
  }
  const {root,service}=fixture();const before=[service.read(THEME),service.read(CSS)];const current=service.bootstrap().theme;
  const response=service.patch(themeRequest(service,{theme:{...current,fontFamily:'思源黑体, "Microsoft YaHei"',fontFamilyCode:'JetBrains Mono'}}));await service.completion;
  const source=service.read(THEME).toString();
  assert.match(source,/思源黑体, \\"Microsoft YaHei\\", sans-serif/,'正文缺通用族自动补 sans-serif');
  assert.match(source,/fontFamilyCode: "JetBrains Mono, monospace"/,'代码字体缺通用族自动补 monospace');
  const second=new EditorService({root,runChecks:checks});const undo=second.undo({...payload,requestId:randomUUID(),patchId:response.patchId});await second.completion;
  assert.deepEqual(second.read(THEME),before[0]);assert.deepEqual(second.read(CSS),before[1]);
});
test('contrast semantics for the new guards: unchanged current warns but writes, changed to non-compliant is rejected',async()=>{
  const {root,service}=fixture();const current=service.bootstrap().theme;const before=[service.read(THEME),service.read(CSS)];
  const response=service.patch(themeRequest(service,{theme:{...current,borderRadius:4}}));await service.completion;
  const rule=service.get(response.patchId).rules.find(r=>r.id==='token.colorError');
  assert.equal(current.colorError,'#ff4d4f');assert.ok(contrast(current.colorError)<4.5,'前提：现状错误色不达标');
  assert.equal(rule.status,'pass','未改动的现状错误色不拦截');assert.match(rule.message,/现状错误色对比度 [0-9].[0-9]{2} 低于 4.5:1，建议 #[0-9a-f]{6}/);assert.ok(contrast(rule.suggestedValue)>=4.5);
  const undo=service.undo({...payload,requestId:randomUUID(),patchId:response.patchId});await service.completion;assert.equal(service.get(response.patchId).status,'undone');
  assert.throws(()=>service.patch(themeRequest(service,{theme:{...current,colorError:'#faad14'}})),e=>e.code==='RULE_FAILED'&&e.details.rules.find(r=>r.id==='token.colorError').status==='fail'&&Boolean(e.details.rules.find(r=>r.id==='token.colorError').suggestedValue),'改成不达标的错误色必须拒绝');
  assert.throws(()=>service.patch(themeRequest(service,{theme:{...current,colorText:'#ffffff'}})),e=>e.code==='RULE_FAILED'&&e.details.rules.find(r=>r.id==='token.colorText').status==='fail','文字色改成不达标必须拒绝');
  assert.throws(()=>service.patch(themeRequest(service,{theme:{...current,colorBgBase:'#303030'}})),e=>e.code==='RULE_FAILED'&&e.details.rules.find(r=>r.id==='token.colorText').status==='fail','页面底色改成拖垮文字对比度同样拒绝');
  assert.deepEqual(service.read(THEME),before[0]);assert.deepEqual(service.read(CSS),before[1]);
});
test('unchanged non-compliant current text color warns without blocking other token writes',async()=>{
  const {root,service}=fixture();
  const themeBefore=service.read(THEME).toString();writeFileSync(resolve(root,THEME),themeBefore.replace('"#1f2937"','"#8a94a6"'));
  const cssBefore=service.read(CSS).toString();writeFileSync(resolve(root,CSS),cssBefore.replace('--do-text: #1f2937','--do-text: #8a94a6'));
  const current=service.bootstrap().theme;assert.equal(current.colorText,'#8a94a6');
  const response=service.patch(themeRequest(service,{theme:{...current,borderRadius:4}}));await service.completion;
  const rule=service.get(response.patchId).rules.find(r=>r.id==='token.colorText');
  assert.equal(rule.status,'pass','未改动的现状文字色不拦截');assert.match(rule.message,/现状文字色对比度 [0-9].[0-9]{2} 低于 4.5:1，建议 #[0-9a-f]{6}/);
});
test('API bypass with non-compliant color gets 422 RULE_FAILED and no bytes change',async()=>{
  const {service}=fixture();const before=[service.read(THEME),service.read(CSS)];const current=service.bootstrap().theme;
  const good={host:'127.0.0.1:5393',origin:'http://127.0.0.1:5393','x-ludi-session':service.sessionToken,'content-type':'application/json'};
  const body=JSON.stringify({...payload,requestId:randomUUID(),kind:'theme',expectedFiles:expected(service,[THEME,CSS]),theme:{...current,colorText:'#ffffff'},route:'/devices'});
  const request=Readable.from([Buffer.from(body)]);Object.assign(request,{url:'/__ludi/patch',method:'POST',headers:{...good,'content-length':String(Buffer.byteLength(body))},socket:{remoteAddress:'127.0.0.1'}});
  const response={setHeader(){},end(chunk){response.body=JSON.parse(chunk);}};await middleware(service,5393)(request,response,()=>assert.fail());
  assert.equal(response.statusCode,422);assert.equal(response.body.error.code,'RULE_FAILED');assert.ok(Array.isArray(response.body.error.details?.rules));
  assert.notEqual(response.body.error.message,'主色未通过对比度规则','错误文案应来自失败规则本身');
  assert.deepEqual(service.read(THEME),before[0]);assert.deepEqual(service.read(CSS),before[1]);
});
test('source shadow outside levels reads as custom and blocks theme writes (fail closed)',()=>{
  const {root,service}=fixture();
  const themeBefore=service.read(THEME);writeFileSync(resolve(root,THEME),themeBefore.toString().replace('wireframe: false','boxShadow: "0 1px 2px rgba(0, 0, 0, 0.5)",\n    wireframe: false'));
  const current=service.bootstrap().theme;assert.equal(current.shadowLevel,'custom');
  const before=[service.read(THEME),service.read(CSS)];
  assert.throws(()=>service.patch(themeRequest(service,{theme:{...current}})),e=>e.code==='BAD_REQUEST'&&/阴影/.test(e.message));
  assert.deepEqual(service.read(THEME),before[0]);assert.deepEqual(service.read(CSS),before[1]);
});
test('CSS-only spacing tokens update styles.css and keep every theme.ts value unchanged',async()=>{
  const {root,service}=fixture();const before=[service.read(THEME),service.read(CSS)];const current=service.bootstrap().theme;
  const response=service.patch(themeRequest(service,{theme:{...current,spaceSm:14}}));await service.completion;
  assert.match(service.read(CSS).toString(),/--do-space-sm: 14px;/);
  // 26 字段快照写回会把缺失 token 按当前值追加进 theme.ts，值层面不允许有任何变化（除本次 spaceSm）。
  assert.deepEqual(readTheme(service.read(THEME).toString(),service.read(CSS).toString()),{...current,spaceSm:14});
  assert.equal(service.get(response.patchId).technical,'checks-passed');
  const second=new EditorService({root,runChecks:checks});const undo=second.undo({...payload,requestId:randomUUID(),patchId:response.patchId});await second.completion;
  assert.deepEqual(second.read(THEME),before[0]);assert.deepEqual(second.read(CSS),before[1]);
});
test('shadow level expands to both boxShadow tokens; antd default maps to the default level',()=>{
  const original=readFileSync(resolve(kitRoot,THEME),'utf8'),css=readFileSync(resolve(kitRoot,CSS),'utf8');
  assert.equal(readTheme(original,css).shadowLevel,'default','无显式 boxShadow 时按 antd 默认档读出');
  const [output]=changeTheme(original,css,{...theme,shadowLevel:'none'});assert.match(output,/boxShadow: "none"/);assert.match(output,/boxShadowSecondary: "none"/);assert.equal(readTheme(output,css).shadowLevel,'none');
  assert.ok(Object.values(SHADOW_LEVELS).every(level=>typeof level.boxShadow==='string'&&typeof level.boxShadowSecondary==='string'));
  assert.ok(contrast(suggestedAgainst('#9ca3af','#ffffff'))>=4.5);
});

/* ------------------------------------------------------------------ round8：组件 token（L1）
   颜色、数字、恢复跟随全局三类写回 + 撤销字节复原（LF / CRLF 各一轮）；非登记组件 / token、
   只读 token、越界与非整数、非 hex 拒绝且文件不变；对比度三语义与全局配对；
   L0 写回时「跟随」项被同步、「已单独设置」项不被覆盖；静态数据两端交叉断言。 */

function componentRequest(service,component,tokens,override={}) {
  return {...payload,requestId:randomUUID(),kind:'component',expectedFiles:expected(service,[THEME]),component,tokens,route:'/devices',...override};
}

test('component token static data: client TS and server mjs stay in sync (cross assertion)',()=>{
  const clientText=readFileSync(resolve(kitRoot,'preview/src/editor/component-tokens.ts'),'utf8');
  const pick=(text)=>{
    const out={};let cur=null;
    for(const line of text.split('\n')){
      const cm=line.match(/^  "([A-Za-z]+)": \[$/);if(cm){cur=cm[1];out[cur]=[];continue;}
      if(cur&&line.includes('name:')){
        const name=(line.match(/name:\s?"([A-Za-z]+)"/)??[])[1];
        const pair=(line.match(/pair:\s?(null|"(?:[^"\\]|\\.)*")/)??[])[1];
        out[cur].push([name,/writable:\s?true/.test(line),pair?JSON.parse(pair):null]);
      }
    }
    return out;
  };
  const client=pick(clientText);
  const sortByName=(list)=>[...list].sort((a,b)=>a[0].localeCompare(b[0]));
  for(const component of P0_COMPONENT_NAMES){
    const server=SERVER_COMPONENT_TOKENS[component].map(t=>[t.name,t.writable,t.pair]);
    assert.deepEqual(sortByName(client[component]??[]),sortByName(server),`${component} 两端 token 登记必须一致`);
  }
});

const COMPONENT_WRITE_CASES=[
  ['color','Button',{defaultColor:'#123456'},/Button: \{ borderRadius: 6, controlHeight: 34, defaultColor: "#123456" \}/],
  ['number','Table',{headerBorderRadius:12},/Table: \{ borderColor: "#d8dee8", headerBg: "#f8fafc", headerBorderRadius: 12 \}/],
  ['restore-follow','Table',{borderColor:null},/Table: \{ headerBg: "#f8fafc" \}/]
];
for(const eol of ['lf','crlf'])for(const [label,component,tokens,match] of COMPONENT_WRITE_CASES) {
  test(`component token writes back and undo restores bytes (${label}:${component}, ${eol})`,async()=>{
    const {root,service}=fixture();if(eol==='crlf')toCrlf(root,service);
    const before=[service.read(THEME),service.read(CSS)];
    const response=service.patch(componentRequest(service,component,tokens));assert.equal(response.status,'checking');await service.completion;
    const source=service.read(THEME).toString();assert.match(source,match,`${label} 写回 theme.ts`);
    if(eol==='crlf')assert.ok(!source.replaceAll('\r\n','').includes('\n'),'theme.ts CRLF 不混入 lone LF');
    assert.equal(service.get(response.patchId).technical,'checks-passed');
    assert.deepEqual(service.read(CSS),before[1],'组件写回不触碰 styles.css');
    const second=new EditorService({root,runChecks:checks});const undo=second.undo({...payload,requestId:randomUUID(),patchId:response.patchId});await second.completion;
    assert.deepEqual(second.read(THEME),before[0],'撤销按原字节恢复');assert.equal(second.get(response.patchId).status,'undone');
  });
}

test('component key created when missing and whole key removed when emptied (Modal)',async()=>{
  const {root,service}=fixture();const before=[service.read(THEME),service.read(CSS)];
  const response=service.patch(componentRequest(service,'Modal',{titleFontSize:18,titleColor:'#1f2937'}));await service.completion;
  const source=service.read(THEME).toString();assert.match(source,/,\n    Modal: \{ titleFontSize: 18, titleColor: "#1f2937" \}\n  \}/,'组件键不存在时按多行格式新增单行对象');
  const second=new EditorService({root,runChecks:checks});const undo=second.undo({...payload,requestId:randomUUID(),patchId:response.patchId});await second.completion;
  assert.deepEqual(second.read(THEME),before[0]);
  const again=service.patch(componentRequest(service,'Modal',{titleFontSize:18}));await service.completion;
  const remove=service.patch(componentRequest(service,'Modal',{titleFontSize:null}));await service.completion;
  assert.deepEqual(service.read(THEME),before[0],'删空组件对象连同组件键删除，回到原字节');
});

test('component tokens: unregistered component/token, readonly, out of range, non-hex, non-integer all rejected with bytes unchanged',()=>{
  const {service}=fixture();const before=[service.read(THEME),service.read(CSS)];
  const cases=[
    ['Badge',{contentFontSize:16},/不在九个 P0 组件登记范围/],
    ['Button',{noSuchToken:16},/未登记 token/],
    ['Button',{onlyIconSize:16},/只读：antd 默认继承字号/],
    ['Button',{fontWeight:'500'},/只读：字重/],
    ['Button',{contentFontSize:33},/超出允许范围 10–32/],
    ['Button',{contentFontSize:16.5},/必须为整数/],
    ['Modal',{titleLineHeight:3.5},/超出允许范围 1–3/],
    ['Modal',{titleLineHeight:0.5},/超出允许范围 1–3/],
    ['Button',{paddingInline:97},/超出允许范围 0–96/],
    ['Select',{zIndexPopup:3001},/超出允许范围 0–3000/],
    ['Select',{zIndexPopup:1050.5},/必须为整数/],
    ['Button',{defaultColor:'red'},/必须为六位十六进制颜色/],
    ['Table',{headerColor:'#gggggg'},/必须为六位十六进制颜色/],
    ['Button',{contentFontSize:null},/不产生任何改动/],
    ['Modal',{titleColor:null},/源码中没有记录/]
  ];
  for(const [component,tokens,pattern] of cases)assert.throws(()=>service.patch(componentRequest(service,component,tokens)),e=>e.code==='BAD_REQUEST'&&pattern.test(e.message),`${component} ${JSON.stringify(tokens)} 应被 BAD_REQUEST 拒绝`);
  assert.throws(()=>service.patch(componentRequest(service,'Button',{})),e=>e.code==='BAD_REQUEST'&&/tokens 必须至少包含一项/.test(e.message));
  assert.throws(()=>service.patch(componentRequest(service,'Button',{defaultColor:'#123456'},function(){const r=componentRequest(service,'Button',{defaultColor:'#123456'});return {...r,extraField:1};}())),e=>e.code==='BAD_REQUEST','额外协议字段拒绝');
  assert.throws(()=>service.patch(componentRequest(service,'Button',{defaultColor:'#123456'},function(){const r=componentRequest(service,'Button',{defaultColor:'#123456'});return {...r,expectedFiles:expected(service,[THEME]).map(x=>({...x,sha256:'0'.repeat(64)}))};}())),e=>e.code==='HASH_CONFLICT');
  assert.deepEqual(service.read(THEME),before[0]);assert.deepEqual(service.read(CSS),before[1]);
});

test('component contrast: unchanged non-compliant current warns but writes; changed to non-compliant is rejected (422, bytes unchanged); compliant passes; global pair enforced',async()=>{
  const {root,service}=fixture();
  const themeBefore=service.read(THEME).toString();
  writeFileSync(resolve(root,THEME),themeBefore.replace('Table: { borderColor: "#d8dee8", headerBg: "#f8fafc" }','Table: { borderColor: "#d8dee8", headerBg: "#f8fafc", headerColor: "#f8fafc" }'));
  const before=[service.read(THEME),service.read(CSS)];
  const response=service.patch(componentRequest(service,'Table',{headerBorderRadius:12}));await service.completion;
  const rule=service.get(response.patchId).rules.find(r=>r.id==='component.Table.headerColor.contrast');
  assert.equal(rule.status,'pass','未改动的现状不达标配对不拦截');assert.match(rule.message,/现状对比度 [0-9]+\.[0-9]{2} 低于 4.5:1，建议 #[0-9a-f]{6}/);assert.equal(service.get(response.patchId).technical,'checks-passed');
  const second=new EditorService({root,runChecks:checks});const undo=second.undo({...payload,requestId:randomUUID(),patchId:response.patchId});await second.completion;assert.deepEqual(second.read(THEME),before[0]);
  assert.throws(()=>service.patch(componentRequest(service,'Table',{headerColor:'#ffffff'})),e=>e.code==='RULE_FAILED'&&e.details.rules.find(r=>r.id==='component.Table.headerColor.contrast').status==='fail'&&Boolean(e.details.rules.find(r=>r.id==='component.Table.headerColor.contrast').suggestedValue),'改成不达标的表头文字色必须拒绝');
  assert.deepEqual(service.read(THEME),before[0]);
  const pass=service.patch(componentRequest(service,'Table',{headerColor:'#1f2937'}));await service.completion;
  assert.match(service.read(THEME).toString(),/headerColor: "#1f2937"/);assert.equal(service.get(pass.patchId).technical,'checks-passed');
  const third=new EditorService({root,runChecks:checks});const undo2=third.undo({...payload,requestId:randomUUID(),patchId:pass.patchId});await third.completion;
  assert.throws(()=>service.patch(componentRequest(service,'Button',{primaryColor:'#eeeeee'})),e=>e.code==='RULE_FAILED'&&/Button\.primaryColor 与背景对比度/.test(e.details.rules.find(r=>r.status==='fail').message),'全局配对：文字改成新的不达标颜色必须拒绝');
  const solid=service.patch(componentRequest(service,'Button',{primaryColor:'#101010'}));await service.completion;
  assert.match(service.read(THEME).toString(),/primaryColor: "#101010"/);
});

test('API bypass for component kind gets 422 RULE_FAILED and no bytes change',async()=>{
  const {service}=fixture();const before=[service.read(THEME),service.read(CSS)];
  const good={host:'127.0.0.1:5393',origin:'http://127.0.0.1:5393','x-ludi-session':service.sessionToken,'content-type':'application/json'};
  const body=JSON.stringify({...payload,requestId:randomUUID(),kind:'component',expectedFiles:expected(service,[THEME]),component:'Button',tokens:{primaryColor:'#eeeeee'},route:'/devices'});
  const request=Readable.from([Buffer.from(body)]);Object.assign(request,{url:'/__ludi/patch',method:'POST',headers:{...good,'content-length':String(Buffer.byteLength(body))},socket:{remoteAddress:'127.0.0.1'}});
  const response={setHeader(){},end(chunk){response.body=JSON.parse(chunk);}};await middleware(service,5393)(request,response,()=>assert.fail());
  assert.equal(response.statusCode,422);assert.equal(response.body.error.code,'RULE_FAILED');assert.ok(Array.isArray(response.body.error.details?.rules));
  assert.deepEqual(service.read(THEME),before[0]);assert.deepEqual(service.read(CSS),before[1]);
});

test('idempotency for component kind: same requestId+payload replays, different payload conflicts',async()=>{
  const {root,service}=fixture();const request=componentRequest(service,'Button',{defaultColor:'#0f172a'});
  const result=service.patch(request);await service.completion;
  assert.deepEqual(service.patch(request),result);assert.throws(()=>service.patch({...request,tokens:{defaultColor:'#111111'}}),e=>e.code==='REQUEST_ID_CONFLICT');
  const resumed=new EditorService({root,runChecks:checks});assert.deepEqual(resumed.patch(request),result);
});

test('L0 theme write: following items sync, customized items are left alone; bootstrap.componentTokens reports status',async()=>{
  const {root,service}=fixture();
  writeFileSync(resolve(root,THEME),service.read(THEME).toString().replace('Table: { borderColor: "#d8dee8", headerBg: "#f8fafc" }','Table: { borderColor: "#123456", headerBg: "#f8fafc" }'));
  const b=service.bootstrap();
  assert.equal(b.componentTokens.Button.borderRadius.status,'following','Button.borderRadius 与全局有效值一致，跟随');
  assert.equal(b.componentTokens.Button.controlHeight.status,'custom','Button.controlHeight 34 与全局默认 32 不同，已单独设置');
  assert.equal(b.componentTokens.Menu.itemBorderRadius.status,'following');
  assert.equal(b.componentTokens.Table.borderColor.status,'custom','Table.borderColor 与全局 colorBorder 不同，已单独设置');
  assert.equal(b.componentTokens.Table.headerBg.status,'custom','Table.headerBg 与 colorBgContainer 不同，已单独设置');
  assert.equal(b.componentTokens.Layout.headerBg.status,'following');
  const current=b.theme;
  const response=service.patch(themeRequest(service,{theme:{...current,borderRadius:4,controlHeight:40,colorBorder:'#64748b',colorBgBase:'#eeeeee'}}));await service.completion;
  assert.equal(service.get(response.patchId).technical,'checks-passed');
  const source=service.read(THEME).toString();
  assert.match(source,/Button: \{ borderRadius: 4, controlHeight: 34 \}/,'跟随的圆角被同步，单独高度保持 34');
  assert.match(source,/Menu: \{ itemBorderRadius: 4, itemHeight: 38 \}/,'跟随的 Menu.itemBorderRadius 同步为 4');
  assert.match(source,/Table: \{ borderColor: "#123456", headerBg: "#f8fafc" \}/,'已单独设置的 Table 两项都不被 L0 覆盖');
  assert.match(source,/Layout: \{ bodyBg: "#eeeeee", headerBg: "#ffffff", siderBg: "#ffffff" \}/,'Layout 跟随项被同步');
  const second=new EditorService({root,runChecks:checks});const undo=second.undo({...payload,requestId:randomUUID(),patchId:response.patchId});await second.completion;
  assert.match(second.read(THEME).toString(),/Table: \{ borderColor: "#123456",/,'撤销后 Table.borderColor 恢复');
});

test('derived component colors: changing either side rejects unreadable Table and Modal pairs without source writes',async()=>{
  const {service}=fixture();const before=service.read(THEME);
  for(const [component,tokens] of [['Table',{headerBg:'#1f2937'}],['Modal',{titleColor:'#ffffff'}],['Modal',{contentBg:'#1f2937'}]]) {
    assert.throws(()=>service.patch(componentRequest(service,component,tokens)),e=>e.code==='RULE_FAILED',`${component} 派生配对必须拒绝`);
    assert.deepEqual(service.read(THEME),before);
  }
  assert.equal(service.bootstrap().componentDefaults.Table.headerColor,'#1f2937');
  const accepted=service.patch(componentRequest(service,'Table',{headerBg:'#ffffff'}));await service.completion;
  assert.equal(service.get(accepted.patchId).technical,'checks-passed');
  service.undo({...payload,requestId:randomUUID(),patchId:accepted.patchId});await service.completion;
  assert.deepEqual(service.read(THEME),before);
});

test('unchanged derived non-compliant color warns, while removing a safe background cannot create unreadable text',async()=>{
  const {service}=fixture();
  const unchanged=service.patch(componentRequest(service,'Button',{primaryColor:'#ffffff'}));await service.completion;
  assert.equal(service.get(unchanged.patchId).technical,'checks-passed');
  assert.match(service.get(unchanged.patchId).rules.find(r=>r.id==='component.Button.primaryColor.contrast').message,/现状对比度/);
  service.undo({...payload,requestId:randomUUID(),patchId:unchanged.patchId});await service.completion;
  const custom=service.patch(componentRequest(service,'Modal',{titleColor:'#ffffff',headerBg:'#101010'}));await service.completion;
  const bytes=service.read(THEME);
  assert.throws(()=>service.patch(componentRequest(service,'Modal',{headerBg:null})),e=>e.code==='RULE_FAILED');
  assert.deepEqual(service.read(THEME),bytes);
  service.undo({...payload,requestId:randomUUID(),patchId:custom.patchId});await service.completion;
});

test('derive endpoint: preview-seeded component defaults follow the draft global, invalid shapes reject',async()=>{
  const {service}=fixture();
  const bigger=service.derive({...payload,theme:{...theme,fontSize:18,lineHeight:1.6}});
  assert.equal(bigger.components.Input.inputFontSize,18,'按草稿 18 派生的 Input.inputFontSize = 18');
  assert.equal(bigger.components.Input.inputFontSizeLG,20);
  const smaller=service.derive({...payload,theme:{...theme,fontSize:12}});
  assert.equal(smaller.components.Input.inputFontSize,12,'按草稿 12 派生同样成立');
  assert.equal(bigger.components.Table.cellFontSize,18);
  const current=service.bootstrap();
  assert.equal(current.componentDefaults.Input.inputFontSize,14,'bootstrap 派生仍按项目当前值（theme.ts fontSize 14），不受 derive 影响');
  assert.throws(()=>service.derive({...payload,theme:{...theme,fontSize:'大'}}),e=>e.code==='BAD_REQUEST');
  assert.throws(()=>service.derive({...payload,theme:{fontSize:16}}),e=>e.code==='BAD_REQUEST','缺字段的散包主题不派生');
});
