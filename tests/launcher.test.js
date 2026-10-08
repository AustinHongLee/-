import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import http from 'node:http';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const read=file=>readFileSync(new URL('../'+file,import.meta.url));
const launcher=()=>read('啟動工作台.cmd').toString('latin1');

test('double-click launcher is a plain ASCII cmd file with CRLF and no PowerShell',()=>{
  const raw=read('啟動工作台.cmd'),cmd=raw.toString('latin1');
  assert.ok([...raw].every(b=>b<128),'ASCII only: cmd.exe reads the file with the console code page');
  assert.match(cmd,/\r\n/);assert.doesNotMatch(cmd.replace(/\r\n/g,''),/\n/,'CRLF only: cmd.exe can miss labels in LF files');
  assert.match(read('.gitattributes').toString(),/^\*\.cmd text eol=crlf$/m);
  assert.doesNotMatch(cmd,/powershell|\.ps1/i,'no PowerShell, hidden window or execution-policy bypass');
  assert.match(cmd,/^call "%NODE%" "%~dp0scripts\\serve\.mjs" --open\r$/m);
  const labels=new Set([...cmd.matchAll(/^:(\w+)\r$/gm)].map(m=>m[1]));
  for(const [,name] of cmd.matchAll(/(?:call |goto ):(\w+)/g))assert.ok(labels.has(name),`label :${name}`);
});
test('launcher starts each Node.js candidate once, skips unusable copies and offers an install',()=>{
  const cmd=launcher();
  for(const where of [/where node/,/%ProgramFiles%\\nodejs\\node\.exe/,/%LOCALAPPDATA%\\Programs\\nodejs\\node\.exe/,/codex-primary-runtime/])assert.match(cmd,where);
  assert.match(cmd,/call "%~1" --version >"%TEMP%\\workbench-node\.txt"/);
  assert.ok(cmd.includes('set "MAJOR=0"')&&cmd.includes('if /i "%VER:~0,1%"=="v" for /f "tokens=1 delims=." %%M in ("%VER:~1%") do set /a "MAJOR=%%M"'),'only a real vNN.x answer counts');
  assert.match(cmd,/if %MAJOR% LSS 20/);assert.match(cmd,/cannot start/);assert.match(cmd,/needs 20 or newer/);
  assert.match(cmd,/where winget[^\r\n]*\|\| exit \/b 0/);assert.match(cmd,/choice \/c YN/);assert.match(cmd,/winget install --id OpenJS\.NodeJS\.LTS/);
});
test('launcher messages are UTF-8 Chinese text files shown under code page 65001',()=>{
  const cmd=launcher(),names=[...cmd.matchAll(/type "%~dp0scripts\\launcher\\([\w-]+\.txt)"/g)].map(m=>m[1]);
  assert.match(cmd,/chcp 65001/);assert.deepEqual(names.sort(),['install.txt','no-node.txt','stopped.txt']);
  for(const name of names){
    const raw=read('scripts/launcher/'+name),text=new TextDecoder('utf-8',{fatal:true}).decode(raw);
    assert.notDeepEqual([...raw.subarray(0,3)],[0xef,0xbb,0xbf],'no BOM: type would print it');
    assert.match(text,/[一-鿿]/);
  }
  assert.doesNotMatch(read('scripts/launcher/install.txt').toString(),/\n$/,'the Y/N answer stays on the question line');
  assert.match(read('scripts/launcher/no-node.txt').toString(),/winget install OpenJS\.NodeJS\.LTS/);
  assert.match(read('.gitattributes').toString(),/^scripts\/launcher\/\*\.txt text eol=crlf$/m);
});

const serve=(env,args=[])=>spawn(process.execPath,['scripts/serve.mjs',...args],{cwd:root,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
function finished(child){
  let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error('still running: '+out+err));},8000);child.on('exit',code=>{clearTimeout(timer);resolve({code,out,err});});});
}
function ready(child){
  let out='';child.stdout.on('data',d=>out+=d);
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('not ready: '+out)),8000);
    child.stdout.on('data',()=>{const m=out.match(/http:\/\/127\.0\.0\.1:(\d+)\//);if(m){clearTimeout(timer);resolve({port:Number(m[1]),output:()=>out});}});
    child.on('exit',code=>{clearTimeout(timer);reject(new Error(`exited ${code}: ${out}`));});});
}
const holder=answer=>new Promise(resolve=>{const s=http.createServer(answer);s.listen(0,'127.0.0.1',()=>resolve(s));});

test('a second launch reuses the workbench already running from this folder',async()=>{
  const first=serve({PORT:'0'});
  try{
    const {port}=await ready(first),second=await finished(serve({PORT:String(port)}));
    assert.equal(second.code,0);assert.match(second.out,new RegExp(`已在執行：http://127\\.0\\.0\\.1:${port}/`));
  }finally{first.kill();}
});
test('a port held by another program or another folder’s workbench is named, not reused',async()=>{
  const other=await holder((q,s)=>{s.writeHead(404);s.end();});
  const elsewhere=await holder((q,s)=>{s.writeHead(200,{'Content-Type':'application/json'});s.end(JSON.stringify({app:'special-method-workbench',workspace:'/elsewhere/dist'}));});
  try{
    const a=await finished(serve({PORT:String(other.address().port)}));
    assert.equal(a.code,1);assert.match(a.err,/已被其他程式使用/);assert.match(a.err,/set PORT=4174/);
    const b=await finished(serve({PORT:String(elsewhere.address().port)}));
    assert.equal(b.code,1);assert.match(b.err,/另一個資料夾的工作台（\/elsewhere\/dist）/);
  }finally{other.close();elsewhere.close();}
});
test('--open keeps serving when no browser can be started, and an invalid PORT is explained',{skip:process.platform==='win32'&&'would open a browser'},async()=>{
  const child=serve({PORT:'0',PATH:''},['--open']);
  try{
    const {port,output}=await ready(child);
    const status=await (await fetch(`http://127.0.0.1:${port}/__workbench`)).json();
    assert.equal(status.app,'special-method-workbench');assert.match(output(),/請保持這個視窗開啟/);
  }finally{child.kill();}
  const bad=await finished(serve({PORT:'abc'}));
  assert.equal(bad.code,1);assert.match(bad.err,/PORT 須為 0–65535/);
});
