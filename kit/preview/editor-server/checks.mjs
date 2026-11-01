import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { safePath, EVIDENCE } from './service.mjs';
import { EDITOR_PORT } from './port.mjs';

const CHECKS = ['preview.tsc','kit.antd:lint:projects','kit.check:antd','browser.edge-smoke'];
export function runCommand(args,cwd,timeoutMs=120000) {
  return new Promise(resolveResult=>{
    const child=spawn(process.execPath,args,{cwd,windowsHide:true,env:{...process.env,NO_UPDATE_CHECK:'1'},stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='',timedOut=false,done=false;
    const consume=(key,chunk)=>{if(key==='stdout')stdout+=chunk.toString();else stderr+=chunk.toString();if(stdout.length+stderr.length>4*1024*1024){stderr+='\n检查输出超过 4 MiB，已停止';child.kill();}};
    child.stdout.on('data',c=>consume('stdout',c));child.stderr.on('data',c=>consume('stderr',c));
    const timer=setTimeout(()=>{timedOut=true;if(process.platform==='win32')spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill('SIGKILL');},timeoutMs);
    const finish=result=>{if(done)return;done=true;clearTimeout(timer);resolveResult({...result,stdout,stderr,timedOut});};
    child.on('error',e=>{stderr+=e.message;finish({exitCode:null});});
    child.on('close',(exitCode,signal)=>finish({exitCode,signal}));
  });
}
async function smoke(root,patch) {
  const require=createRequire(resolve(root,'package.json'));
  const {chromium}=require('@playwright/test');
  const path=patch.route.startsWith('/device-ops/')?patch.route:`/device-ops${patch.route}`;
  const screenshots=[];let browser;
  try {
    browser=await chromium.launch({channel:'msedge',headless:true,timeout:30000});
    for(const width of [1440,1024]) {
      const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];
      page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});page.on('pageerror',error=>errors.push(error.message));
      await page.goto(`http://127.0.0.1:${EDITOR_PORT}${path}`,{waitUntil:'networkidle',timeout:30000});
      const heading=page.locator('h1').first();await heading.waitFor({state:'visible',timeout:15000});
      if(!(await heading.innerText()).trim())throw new Error('主标题为空');
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
      const screenshot=`${EVIDENCE}/${patch.id}-${width}.png`;
      const absolute=safePath(root,screenshot,[screenshot]);
      await page.screenshot({path:absolute,fullPage:true});screenshots.push(screenshot);
      if(errors.length||overflow)throw new Error(JSON.stringify({consoleErrors:errors,overflow,width}));
      await page.close();
    }
    return {exitCode:0,stdout:'Edge: networkidle; visible main heading; console=0; overflow=0; 1440/1024',stderr:'',screenshots};
  }catch(error){return {exitCode:null,stdout:'',stderr:error.message,screenshots};}
  finally{await browser?.close();}
}
export function createCheckRunner(root) {
  root=resolve(root);
  return async(patch,save)=>{
    patch.checks=CHECKS.map(id=>({id,status:'queued'}));save();
    const npm=process.env.npm_execpath ?? resolve(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
    const specs=[{args:[resolve(root,'preview/node_modules/typescript/bin/tsc'),'--noEmit'],cwd:resolve(root,'preview')},{args:[npm,'run','antd:lint:projects'],cwd:root},{args:[npm,'run','check:antd'],cwd:root}];
    let success=true;
    for(let i=0;i<CHECKS.length;i++) {
      const check=patch.checks[i];check.status='running';check.startedAt=new Date().toISOString();save();
      const result=i<3?await runCommand(specs[i].args,specs[i].cwd,i===2?180000:120000):await smoke(root,patch);
      Object.assign(check,result,{endedAt:new Date().toISOString(),status:result.exitCode===0&&!result.timedOut?'passed':'failed'});save();
      if(check.status==='failed') {success=false;if(patch.kind==='block')break;}
      // Continue the fixed independent checks: a tsc failure never erases an AntD or browser result.
    }
    return success;
  };
}
