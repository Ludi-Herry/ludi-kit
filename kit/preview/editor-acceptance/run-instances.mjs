// Real editor preview + guarded writes, fixed checks and byte-exact undo.
// From kit: node preview/editor-acceptance/run-instances.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { previewTransform } from '../editor-server/instances.mjs';
const KIT=resolve(new URL('../..',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
const req=createRequire(resolve(KIT,'package.json')), {chromium}=req('@playwright/test');
const BASE=`http://127.0.0.1:${process.env.LUDI_EDITOR_PORT||5410}`, PAGE='projects/tianshu-device-ops/generated/DeviceListPage.tsx',THEME='projects/tianshu-device-ops/theme.ts';
const OUT=resolve(KIT,`projects/tianshu-device-ops/evidence/editor/instances-round-${Date.now()}`);
mkdirSync(OUT,{recursive:true});console.log(`EVIDENCE=${OUT}`);
const hash=file=>createHash('sha256').update(readFileSync(resolve(KIT,file))).digest('hex');
const managed=JSON.parse(readFileSync(resolve(KIT,'preview/editor-dispatch/baseline.json'),'utf8')).files.map(f=>f.file.replace(/^kit\//,''));
const before=new Map(managed.map(file=>[file,hash(file)]));
const records=[],errors=[],undoTargets=[];let token,active,browser;
const save=(file,value)=>writeFileSync(resolve(OUT,file),JSON.stringify(value,null,2)+'\n');
function check(step,ok,detail){records.push({step,status:ok?'pass':'fail',detail});save('run-log.json',{records,errors});console.log(`${ok?'PASS':'FAIL'} ${step}`);if(!ok)throw new Error(step);}
async function api(method,path,body){let r;for(let attempt=0;attempt<3;attempt++){try{r=await fetch(BASE+path,{method,headers:{Origin:BASE,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),...(token?{'X-Ludi-Session':token}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});break;}catch(error){if(method!=='GET'||attempt===2)throw error;await new Promise(r=>setTimeout(r,1000));}}const json=await r.json();if(!json.ok)throw new Error(`${path}: ${JSON.stringify(json.error)}`);return json.data;}
async function boot(){const b=await api('GET','/__ludi/bootstrap');token=b.sessionToken;return b;}
async function poll(id){const until=Date.now()+15*60*1000;while(Date.now()<until){const p=await api('GET',`/__ludi/patch/${id}`);if(p.status!=='checking'){save(`patch-${id}.json`,p);return p;}await new Promise(r=>setTimeout(r,2500));}throw new Error('Patch timeout');}
async function write(request){await boot();const snapshot=new Map(managed.map(file=>[file,hash(file)])),requestId=randomUUID(),body={version:1,projectId:'tianshu-device-ops',requestId,route:'/devices',...request};let p;
 try{p=await api('POST','/__ludi/patch',body);}catch(error){const list=await api('GET','/__ludi/patches'),found=list.find(p=>p.requestId===requestId);if(!found)throw error;p={patchId:found.id};}
 active=p.patchId;undoTargets.push({id:active,snapshot});const result=await poll(active);check(`${request.kind}.checks`,result.status==='checks-passed'&&result.checks.length===4&&result.checks.every(c=>c.status==='passed'),{id:active,status:result.status});return result;}
async function undo(){if(!active)return;await poll(active);await boot();const target=undoTargets.at(-1),original=active,body={version:1,projectId:'tianshu-device-ops',requestId:randomUUID(),patchId:active};let p;try{p=await api('POST','/__ludi/undo',body);}catch(error){const list=await api('GET','/__ludi/patches'),found=list.find(p=>p.requestId===body.requestId);if(!found)throw error;p={patchId:found.id};}const result=await poll(p.patchId);check('undo.checks',result.status==='checks-passed',{original,status:result.status});undoTargets.pop();active=undoTargets.at(-1)?.id??null;check('undo.bytes',managed.every(file=>hash(file)===target.snapshot.get(file)),{matched:managed.length});}
function watch(page){page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});}
const selector=loc=>`[data-ludi-loc="${loc.file}:${loc.line}:${loc.column}"]`;
// 2026-10-03 右栏改版：实例、结构层、主题等详情收进默认折叠的「更多设置」，读取或操作前先展开（展开状态存在 localStorage）。
async function openMoreSettings(page){const toggle=page.getByRole('button',{name:'更多设置'}).first();await toggle.waitFor({state:'visible',timeout:15000});if((await toggle.getAttribute('aria-expanded'))==='false'){await toggle.click();await new Promise(r=>setTimeout(r,300));}}
async function main(){
 const source=readFileSync(resolve(KIT,PAGE),'utf8'),target=previewTransform(source,PAGE).targets.find(t=>t.component==='Button'&&t.text.value==='查看'&&t.identity.kind==='keyed');
 check('keyed.source',Boolean(target),target?.identity);const loc=target.loc;
 browser=await chromium.launch({channel:'msedge',headless:true,timeout:30000});const context=await browser.newContext({viewport:{width:1440,height:900}});
 const editor=await context.newPage();watch(editor);await editor.goto(BASE+'/editor',{waitUntil:'networkidle'});
 const stage=()=>editor.frameLocator('#ludi-stage-frame');await stage().locator(selector(loc)).first().waitFor({state:'visible'});
 const key=await stage().locator(selector(loc)).first().getAttribute('data-ludi-key');check('keyed.dom',Boolean(key),{key});
 if(process.argv.includes('--layers-only')){
  for(const [component,label,part,field,value,css,expected] of [
   ['Input','输入框','prefix','fontSize','20','.ant-input-prefix','20px'],
   ['Select','选择器','itemContent','fontWeight','700','.ant-select-selection-item-content','700']
  ]){
   await editor.getByRole('button',{name:`${component} ${label}`,exact:true}).click();const layer=editor.getByRole('tree',{name:'组件结构层'}).getByRole('button',{name:new RegExp(`^${part} ×`)});await layer.waitFor({state:'visible'});await layer.click();
   await openMoreSettings(editor);const input=editor.getByRole('spinbutton',{name:`${component}.${part}.${field}`,exact:true});await input.fill(value);await input.press('Tab');
   await editor.waitForFunction(({css,field,expected})=>Array.from(document.querySelector('#ludi-stage-frame')?.contentDocument?.querySelectorAll(css)??[]).every(el=>getComputedStyle(el)[field]===expected),{css,field,expected});
   const values=await stage().locator(css).evaluateAll((els,field)=>els.map(el=>getComputedStyle(el)[field]),field);check(`layers.${component}.preview`,values.length>0&&values.every(v=>v===expected),{values});check(`layers.${component}.bytes`,managed.every(file=>hash(file)===before.get(file)),{matched:managed.length});await editor.screenshot({path:resolve(OUT,`layers-${component}.png`)});await editor.getByRole('button',{name:'撤销预览改动',exact:true}).click();
  }
  check('console',errors.length===0,errors);save('result.json',{status:'pass',mode:'layers-only',sourceHashes:[...before].map(([file,sha256])=>({file,sha256})),records});console.log('INSTANCES-LAYERS-PASS');return;
 }
 if(process.argv.includes('--reedit-only')){
  await editor.close();
  await write({kind:'instance',loc,instanceKey:key,changes:{text:'核验设备',props:{danger:true},styles:{content:{fontWeight:600}},slots:{icon:{kind:'icon',name:'InfoCircleOutlined'}}},expectedFiles:[{file:PAGE,sha256:hash(PAGE)}]});
  const writtenSource=readFileSync(resolve(KIT,PAGE),'utf8'),writtenLoc=previewTransform(writtenSource,PAGE).targets.find(t=>t.component==='Button'&&t.identity.expression===target.identity.expression&&t.text?.value==='查看').loc;
  const model=await api('POST','/__ludi/instance',{version:1,projectId:'tianshu-device-ops',loc:writtenLoc,expectedSha256:hash(PAGE),instanceKey:key});
  check('reedit.model',model.text.writable&&model.text.value==='核验设备'&&model.fields.find(f=>f.name==='danger').value===true,model);save('reedit-model.json',model);
  const revised=await context.newPage();watch(revised);await revised.goto(BASE+'/editor',{waitUntil:'networkidle'});
  const revisedStage=revised.frameLocator('#ludi-stage-frame'),chosen=revisedStage.locator(`${selector(writtenLoc)}[data-ludi-key="${key}"]`);
  await chosen.waitFor({state:'visible'});await chosen.click();await openMoreSettings(revised);const input=revised.getByRole('textbox',{name:'实例文案',exact:true});await input.waitFor({state:'visible'});
  check('reedit.control',(await input.inputValue())==='核验设备',{value:await input.inputValue()});await input.fill('再次核验');
  await revised.waitForFunction(()=>document.querySelector('#ludi-stage-frame')?.contentDocument?.body.textContent.includes('再次核验'));
  const texts=await revisedStage.locator(selector(writtenLoc)).allTextContents();check('reedit.preview.isolation',texts.filter(t=>t==='再次核验').length===1&&texts.filter(t=>t==='查看').length>=1,texts);await revised.screenshot({path:resolve(OUT,'reedit-preview.png')});await revised.close();
  await write({kind:'instance',loc:writtenLoc,instanceKey:key,changes:{text:'再次核验',styles:{content:{fontWeight:700}}},expectedFiles:[{file:PAGE,sha256:hash(PAGE)}]});
  const live=await context.newPage();watch(live);await live.goto(BASE+'/device-ops/devices?editor=1',{waitUntil:'networkidle'});const changed=live.getByRole('link',{name:'再次核验',exact:true});await changed.waitFor({state:'visible'});
  check('reedit.canvas',await changed.count()===1&&await live.getByRole('link',{name:'查看',exact:true}).count()>=1,{key});check('reedit.retained.slot',await changed.locator('.anticon-info-circle').count()===1,{icon:'InfoCircleOutlined'});check('reedit.style',await changed.locator('span:not(.ant-btn-icon)').last().evaluate(el=>getComputedStyle(el).fontWeight)==='700',{fontWeight:'700'});await live.screenshot({path:resolve(OUT,'reedit-written.png')});
  await undo();await undo();check('console',errors.length===0,errors);check('baseline.end',managed.every(file=>hash(file)===before.get(file)),{matched:managed.length});save('result.json',{status:'pass',mode:'reedit-only',sourceHashes:[...before].map(([file,sha256])=>({file,sha256})),records});console.log('INSTANCES-REEDIT-PASS');return;
 }
 await stage().locator(selector(loc)).first().click();await openMoreSettings(editor);await editor.getByRole('textbox',{name:'实例文案',exact:true}).waitFor({state:'visible'});await editor.getByRole('textbox',{name:'实例文案',exact:true}).fill('核验设备');
 await editor.waitForFunction(()=>document.querySelector('#ludi-stage-frame')?.contentDocument?.body.textContent.includes('核验设备'));
 const previewText=await stage().locator(selector(loc)).allTextContents();check('preview.isolation',previewText.filter(t=>t==='核验设备').length===1&&previewText.filter(t=>t==='查看').length>=1,previewText);
 check('preview.bytes',managed.every(file=>hash(file)===before.get(file)),{matched:managed.length});await editor.screenshot({path:resolve(OUT,'instance-preview.png')});
 await editor.getByText('修改前',{exact:true}).click();await editor.frameLocator('#ludi-before-frame').locator(selector(loc)).first().waitFor({state:'visible'});
 check('compare.before',(await editor.frameLocator('#ludi-before-frame').locator(selector(loc)).allTextContents()).every(t=>t==='查看'),{original:'查看'});await editor.screenshot({path:resolve(OUT,'instance-before.png')});
 await editor.getByText('修改后',{exact:true}).click();await editor.getByRole('button',{name:'撤销预览改动',exact:true}).click();
 await editor.getByRole('button',{name:'查看影响面详情',exact:true}).click();await editor.locator('.ludi-impact__page-count').filter({hasText:'1 个已渲染实例'}).first().waitFor({state:'visible',timeout:30000});
 check('impact.keyed',await editor.locator('.ludi-impact__page').count()===1,{pages:1,key});await editor.screenshot({path:resolve(OUT,'impact-keyed.png')});
 for(const width of [1280,1440]){await editor.setViewportSize({width,height:900});check(`editor.reachable.${width}`,await editor.getByRole('button',{name:'查看影响面详情',exact:true}).isVisible(),{width});}
 await editor.close();
 const page=await context.newPage();watch(page);const render=async()=>{await page.goto(BASE+'/device-ops/devices?editor=1',{waitUntil:'networkidle'});await page.locator(selector(loc)).first().waitFor({state:'visible'});};
 await render();
 await write({kind:'structure',component:'Button',part:'root',styles:{fontSize:20},expectedFiles:[{file:THEME,sha256:hash(THEME)}]});await render();
 check('structure.canvas',await page.locator(selector(loc)).first().evaluate(el=>getComputedStyle(el).fontSize)==='20px',{fontSize:'20px'});await page.screenshot({path:resolve(OUT,'structure-written.png')});await undo();await render();
 check('structure.restore',await page.locator(selector(loc)).first().evaluate(el=>getComputedStyle(el).fontSize)==='14px',{fontSize:'14px'});
 await write({kind:'instance',loc,instanceKey:key,changes:{text:'核验设备',props:{danger:true},styles:{content:{fontWeight:600}},slots:{icon:{kind:'icon',name:'InfoCircleOutlined'}}},expectedFiles:[{file:PAGE,sha256:hash(PAGE)}]});
 await page.goto(BASE+'/device-ops/devices?editor=1',{waitUntil:'networkidle'});await page.getByRole('link',{name:'核验设备',exact:true}).waitFor({state:'visible'});
 const changed=page.getByRole('link',{name:'核验设备',exact:true});check('instance.canvas',await changed.count()===1&&await page.getByRole('link',{name:'查看',exact:true}).count()>=1,{key});
 check('instance.slot',await changed.locator('.anticon-info-circle').count()===1,{icon:'InfoCircleOutlined'});
 check('instance.style',await changed.locator('span:not(.ant-btn-icon)').last().evaluate(el=>getComputedStyle(el).fontWeight)==='600',{fontWeight:'600'});
 await page.screenshot({path:resolve(OUT,'instance-written.png')});await undo();await render();check('instance.restore',(await page.locator(selector(loc)).allTextContents()).every(t=>t==='查看'),{original:'查看'});
 check('console',errors.length===0,errors);check('baseline.end',managed.every(file=>hash(file)===before.get(file)),{matched:managed.length});save('result.json',{status:'pass',sourceHashes:[...before].map(([file,sha256])=>({file,sha256})),records});console.log('INSTANCES-ACCEPTANCE-PASS');
}
try{await main();}catch(error){save('failure.json',{error:error.message,records,errors});console.error(error);process.exitCode=1;}finally{while(active)try{await undo();}catch(error){save('undo-failure.json',{error:error.message,active});process.exitCode=1;break;}await browser?.close();}
