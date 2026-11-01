import { spawn } from 'node:child_process';
import { accessSync, constants, statSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, delimiter, extname, isAbsolute, join, resolve } from 'node:path';

const DEFAULT_COMMAND='dsh --profile ludi-block-ai -';
const DEFAULT_TIMEOUT_MS=600000;
const MAX_TIMEOUT_MS=2147483647;
const WINDOWS_EXECUTABLE_EXTENSIONS=['.COM','.EXE','.CMD','.BAT'];
const WINDOWS_CMD_UNSAFE=/[\r\n%!"&|<>^]/;
const CLAUDE_UNSAFE_OPTIONS=/^(?:--tools|--allowedtools|--allowed-tools|--dangerously-skip-permissions|--allow-dangerously-skip-permissions)(?:=|$)/i;

class AIAdapterError extends Error {
  constructor(code,message,{stderr='',cause}={}) {
    super(message,cause?{cause}:undefined);
    this.name='AIAdapterError';
    this.code=code;
    this.stderr=redact(stderr);
  }
}

function redact(value) {
  return String(value ?? '')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,'Bearer [REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g,'[REDACTED]')
    .replace(/((?:[a-z0-9_-]+[_-])?(?:api[_-]?key|auth[_-]?token|token|password|secret)\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s\r\n]+)/gi,'$1[REDACTED]');
}

function splitCommand(value) {
  const source=value.trim();
  if(source.startsWith('[')) {
    let parsed;
    try { parsed=JSON.parse(source); }
    catch(error) { throw new Error(`LUDI_AI_CMD JSON 无效：${error.message}`); }
    if(!Array.isArray(parsed)||parsed.length===0||parsed.some(item=>typeof item!=='string'))throw new Error('LUDI_AI_CMD JSON 必须是非空字符串数组');
    if(!parsed[0])throw new Error('LUDI_AI_CMD 缺少可执行命令');
    return parsed;
  }
  const result=[];let token='',quote=null,started=false;
  for(let index=0;index<source.length;index++) {
    const character=source[index];
    if(quote) {
      if(character===quote) { quote=null;started=true;continue; }
      if(character==='\\'&&source[index+1]===quote) { token+=quote;index++;started=true;continue; }
      token+=character;started=true;continue;
    }
    if(character==='"'||character==="'") { quote=character;started=true;continue; }
    if(/\s/.test(character)) {
      if(started) { result.push(token);token='';started=false; }
      continue;
    }
    token+=character;started=true;
  }
  if(quote)throw new Error('LUDI_AI_CMD 含未闭合引号');
  if(started)result.push(token);
  if(!result.length||!result[0])throw new Error('LUDI_AI_CMD 缺少可执行命令');
  return result;
}

function executableExtensions(command) {
  if(process.platform!=='win32'||extname(command))return [''];
  const configured=(process.env.PATHEXT??WINDOWS_EXECUTABLE_EXTENSIONS.join(';')).split(';').map(value=>value.toUpperCase()).filter(value=>WINDOWS_EXECUTABLE_EXTENSIONS.includes(value));
  return [...new Set(configured.length?configured:WINDOWS_EXECUTABLE_EXTENSIONS)];
}

function executableFile(candidate) {
  try {
    const info=statSync(candidate);
    if(!info.isFile())return null;
    if(process.platform!=='win32')accessSync(candidate,constants.X_OK);
    return resolve(candidate);
  } catch { return null; }
}

function findExecutable(command) {
  const pathLike=isAbsolute(command)||command.includes('/')||command.includes('\\');
  const names=executableExtensions(command).map(extension=>`${command}${extension}`);
  if(pathLike) {
    for(const name of names) {
      const found=executableFile(isAbsolute(name)?name:resolve(process.cwd(),name));
      if(found)return found;
    }
    return null;
  }
  for(const entry of (process.env.PATH??'').split(delimiter)) {
    const directory=entry.trim().replace(/^"|"$/g,'');
    if(!directory)continue;
    for(const name of names) {
      const found=executableFile(resolve(directory,name));
      if(found)return found;
    }
  }
  return null;
}

function assertSafeWindowsShim(command,args) {
  if(process.platform!=='win32'||!['.cmd','.bat'].includes(extname(command).toLowerCase()))return;
  if([command,...args].some(value=>WINDOWS_CMD_UNSAFE.test(value)))throw new Error('Windows .cmd/.bat 配置包含不安全字符');
}

function timeoutFromEnvironment() {
  const raw=process.env.LUDI_AI_TIMEOUT_MS;
  if(raw===undefined||raw==='')return DEFAULT_TIMEOUT_MS;
  if(!/^\d+$/.test(raw))throw new Error('LUDI_AI_TIMEOUT_MS 必须是正整数毫秒值');
  const timeoutMs=Number(raw);
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>MAX_TIMEOUT_MS)throw new Error(`LUDI_AI_TIMEOUT_MS 必须在 1–${MAX_TIMEOUT_MS} 之间`);
  return timeoutMs;
}

function configuration() {
  const raw=process.env.LUDI_AI_CMD?.trim()||DEFAULT_COMMAND;
  const [requested,...args]=splitCommand(raw);
  if(requested.includes('\0')||args.some(value=>value.includes('\0')))throw new Error('LUDI_AI_CMD 不能包含 NUL');
  const command=findExecutable(requested);
  if(!command)throw new Error(`找不到 AI CLI：${requested}`);
  const name=basename(command).toLowerCase().replace(/\.(?:com|exe|cmd|bat)$/,'');
  assertSafeWindowsShim(command,args);
  if(name==='claude'&&args.some(value=>CLAUDE_UNSAFE_OPTIONS.test(value)))throw new Error('Claude 配置不能覆盖适配器的禁用工具边界');
  return {command,args,kind:name==='codex'?'codex':name==='claude'?'claude':name==='dsh'?'dsh':'custom',timeoutMs:timeoutFromEnvironment()};
}

export function aiStatus() {
  try { configuration();return {available:true}; }
  catch(error) { return {available:false,reason:error.message}; }
}

function windowsArgument(value) {
  let output='"',slashes=0;
  for(const character of String(value)) {
    if(character==='\\') { slashes++;continue; }
    if(character==='"') { output+='\\'.repeat(slashes*2+1)+'"';slashes=0;continue; }
    output+='\\'.repeat(slashes)+character;slashes=0;
  }
  return output+'\\'.repeat(slashes*2)+'"';
}

function spawnConfigured(command,args,options) {
  const extension=extname(command).toLowerCase();
  if(process.platform==='win32'&&(extension==='.cmd'||extension==='.bat')) {
    assertSafeWindowsShim(command,args);
    const comspec=process.env.ComSpec||'cmd.exe';
    const commandLine=[command,...args].map(windowsArgument).join(' ');
    return spawn(comspec,['/d','/v:off','/s','/c',`"${commandLine}"`],{...options,shell:false,windowsVerbatimArguments:true});
  }
  return spawn(command,args,{...options,shell:false});
}

function terminateTree(child) {
  if(!child.pid||child.exitCode!==null||child.signalCode!==null)return Promise.resolve();
  if(process.platform!=='win32') {
    try { process.kill(-child.pid,'SIGKILL'); }
    catch { try { child.kill('SIGKILL'); } catch {} }
    return Promise.resolve();
  }
  return new Promise(resolveKill=>{
    let killer;
    try { killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',shell:false}); }
    catch { try { child.kill(); } catch {} resolveKill();return; }
    let settled=false;
    const finish=()=>{if(!settled){settled=true;resolveKill();}};
    killer.once('error',()=>{try { child.kill('SIGKILL'); } catch {} finish();});
    killer.once('close',exitCode=>{if(exitCode!==0)try { child.kill('SIGKILL'); } catch {} finish();});
  });
}

function runChild({command,args,prompt,signal,timeoutMs,mode}) {
  return new Promise((resolveResult,rejectResult)=>{
    let child;
    try {
      child=spawnConfigured(command,args,{
        detached:process.platform!=='win32',
        env:{...process.env,NO_UPDATE_CHECK:'1',LUDI_AI_MODE:mode},
        stdio:['pipe','pipe','pipe'],
        windowsHide:true
      });
    } catch(error) {
      rejectResult(new AIAdapterError(error.code==='ENOENT'||error.code==='EACCES'?'AI_UNAVAILABLE':'AI_FAILED','无法启动本机 AI CLI',{cause:error}));
      return;
    }
    const stdout=[];const stderr=[];let stopReason=null,spawnError=null,inputError=null,killPromise=Promise.resolve();
    const stop=reason=>{
      if(stopReason||child.exitCode!==null||child.signalCode!==null)return;
      stopReason=reason;clearTimeout(timer);killPromise=terminateTree(child);
    };
    const onAbort=()=>stop('cancelled');
    child.stdout.on('data',chunk=>stdout.push(Buffer.from(chunk)));
    child.stderr.on('data',chunk=>stderr.push(Buffer.from(chunk)));
    child.stdin.on('error',error=>{if(error.code!=='EPIPE')inputError=error;});
    child.once('error',error=>{spawnError=error;});
    const timer=setTimeout(()=>stop('timeout'),timeoutMs);
    signal?.addEventListener('abort',onAbort,{once:true});
    if(signal?.aborted)onAbort();
    if(!stopReason)child.stdin.end(prompt);else child.stdin.destroy();
    child.once('close',async(exitCode,exitSignal)=>{
      clearTimeout(timer);signal?.removeEventListener('abort',onAbort);
      await killPromise;
      const rawStderr=Buffer.concat(stderr).toString('utf8');
      if(stopReason==='cancelled') { rejectResult(new AIAdapterError('CANCELLED','AI 改写已取消',{stderr:rawStderr}));return; }
      if(stopReason==='timeout') { rejectResult(new AIAdapterError('AI_TIMEOUT',`AI CLI 超过 ${timeoutMs}ms 未完成`,{stderr:rawStderr}));return; }
      if(spawnError) {
        const unavailable=spawnError.code==='ENOENT'||spawnError.code==='EACCES'||spawnError.code==='EPERM';
        rejectResult(new AIAdapterError(unavailable?'AI_UNAVAILABLE':'AI_FAILED',unavailable?'本机 AI CLI 不可用':'AI CLI 启动失败',{stderr:rawStderr,cause:spawnError}));return;
      }
      if(inputError) { rejectResult(new AIAdapterError('AI_FAILED','无法把 prompt 发送给 AI CLI',{stderr:rawStderr,cause:inputError}));return; }
      if(exitCode!==0||exitSignal) { rejectResult(new AIAdapterError('AI_FAILED',`AI CLI 执行失败（exit ${exitCode ?? exitSignal}）`,{stderr:rawStderr}));return; }
      resolveResult({stdout:Buffer.concat(stdout).toString('utf8'),stderr:rawStderr});
    });
  });
}

function invocation(config,outputFile) {
  if(config.kind==='codex') {
    const args=[...config.args];
    if(args[0]!=='exec')args.unshift('exec');
    args.push('-c','model=gpt-6.1-sol','-c','model_reasoning_effort=high','-s','read-only','--output-last-message',outputFile,'-');
    return {command:config.command,args};
  }
  if(config.kind==='claude') {
    const args=[...config.args];
    if(!args.includes('-p')&&!args.includes('--print'))args.push('-p');
    args.push('--tools','');
    return {command:config.command,args};
  }
  if(config.kind==='dsh') {
    // dsh headless：任务走 stdin（参数里已有字面量 `-`），答案在 stdout。不追加任何参数，
    // profile（默认 ludi-block-ai）已禁用文件/命令/联网/子代理工具，模型固定 deepseek-flash。
    if(!config.args.includes('-'))throw new Error('dsh 配置缺少 stdin 占位参数 `-`');
    return {command:config.command,args:[...config.args]};
  }
  return {command:config.command,args:[...config.args]};
}

export async function runAI({prompt,signal,mode='rewrite'}={}) {
  if(typeof prompt!=='string')throw new AIAdapterError('AI_FAILED','prompt 必须是字符串');
  if(typeof mode!=='string'||!mode)throw new AIAdapterError('AI_FAILED','mode 必须是非空字符串');
  if(signal?.aborted)throw new AIAdapterError('CANCELLED','AI 改写已取消');
  let config;
  try { config=configuration(); }
  catch(error) { throw new AIAdapterError('AI_UNAVAILABLE',error.message,{cause:error}); }
  let tempDirectory=null,outputFile=null,result,failure=null,cleanupFailure=null;
  try {
    if(config.kind==='codex') {
      tempDirectory=await mkdtemp(join(tmpdir(),'agent-ludi-ai-'));
      outputFile=join(tempDirectory,'output-last-message.txt');
    }
    const command=invocation(config,outputFile);
    const processResult=await runChild({...command,prompt,signal,timeoutMs:config.timeoutMs,mode});
    if(config.kind==='codex') {
      try { result=await readFile(outputFile,'utf8'); }
      catch(error) { throw new AIAdapterError('AI_FAILED','AI CLI 结果读取失败',{stderr:processResult.stderr,cause:error}); }
    } else result=processResult.stdout;
    if(!result.trim())throw new AIAdapterError('AI_FAILED','AI CLI 没有返回内容',{stderr:processResult.stderr});
  } catch(error) {
    failure=error instanceof AIAdapterError?error:new AIAdapterError('AI_FAILED','AI CLI 结果读取失败',{cause:error});
  }
  if(tempDirectory&&process.env.LUDI_AI_KEEP_TEMP!=='1') {
    try { await rm(tempDirectory,{recursive:true,force:true}); }
    catch(error) { cleanupFailure=error; }
  }
  if(failure) {
    if(tempDirectory&&process.env.LUDI_AI_KEEP_TEMP==='1')failure.tempPath=outputFile;
    if(cleanupFailure)failure.cleanupError=redact(cleanupFailure.message);
    throw failure;
  }
  if(cleanupFailure)throw new AIAdapterError('AI_FAILED','AI 临时文件清理失败',{cause:cleanupFailure});
  return result;
}
