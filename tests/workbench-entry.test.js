import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const root=new URL('../',import.meta.url),boot=await readFile(new URL('../dist/assets/workbench-boot.js',import.meta.url),'utf8');
let server,base;
before(async()=>{
  server=spawn(process.execPath,['scripts/serve.mjs'],{cwd:root,env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});
  base=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(new Error('Server did not become ready')),8000);server.on('error',reject);server.on('exit',code=>reject(new Error('Server exited '+code)));server.stdout.on('data',data=>{output+=data;const found=output.match(/http:\/\/127\.0\.0\.1:\d+\//);if(found){clearTimeout(timer);resolve(found[0]);}});});
});
after(()=>{server?.kill();});
function page(protocol,tool){
  const nodes=new Map();for(const id of ['workbench-tool','workbench-startup','boot-title','boot-message','boot-guide','boot-home','boot-open','boot-retry','boot-details','boot-error'])nodes.set(id,{hidden:!['workbench-tool','workbench-startup','boot-title','boot-message'].includes(id),dataset:{tool},textContent:'',addEventListener(){},removeAttribute(){},classList:{add(){}}});
  return {nodes,context:{document:{getElementById:id=>nodes.get(id)},location:{protocol,reload(){}},window:{dispatchEvent(){}},Event:class{}}};
}
test('direct file opening blocks incomplete tools and points each to its full HTTP entry before importing modules',()=>{
  for(const tool of ['joint','offset','tank']){const p=page('file:',tool);let imports=0;new vm.Script(boot,{importModuleDynamically(){imports++;throw new Error('Modules must not load on file URLs');}}).runInNewContext(p.context);assert.equal(imports,0);assert.equal(p.nodes.get('workbench-tool').hidden,true);assert.equal(p.nodes.get('boot-guide').hidden,false);assert.equal(p.nodes.get('boot-open').href,`http://127.0.0.1:4173/${tool}.html`);assert.match(p.nodes.get('boot-title').textContent,/啟動入口/);}
});
test('module failures show recovery rather than leaving a partly usable tool',async()=>{
  for(const tool of ['joint','offset','tank']){const p=page('http:',tool);new vm.Script(boot,{importModuleDynamically(){return Promise.reject(new Error('Missing module'));}}).runInNewContext(p.context);await new Promise(resolve=>setImmediate(resolve));assert.equal(p.nodes.get('workbench-tool').hidden,true);assert.equal(p.nodes.get('workbench-startup').hidden,false);assert.equal(p.nodes.get('boot-retry').hidden,false);assert.equal(p.nodes.get('boot-details').hidden,false);assert.match(p.nodes.get('boot-title').textContent,/未能完整載入/);}
});
test('file home keeps tool choices while linking to served full tools',async()=>{
  const source=await readFile(new URL('../dist/assets/workbench-home.js',import.meta.url),'utf8'),guide={hidden:true},links=['joint.html','offset.html'].map(toolPage=>({dataset:{toolPage},href:toolPage}));
  new vm.Script(source).runInNewContext({location:{protocol:'file:'},document:{getElementById:()=>guide,querySelectorAll:()=>links}});
  assert.equal(guide.hidden,false);assert.deepEqual(links.map(l=>l.href),['http://127.0.0.1:4173/joint.html','http://127.0.0.1:4173/offset.html']);
});
test('one server delivers the homepage, three complete entry graphs, styles, 3D dependencies and worker',async()=>{
  const status=await (await fetch(new URL('__workbench',base))).json();assert.equal(status.app,'special-method-workbench');assert.equal(status.workspace,fileURLToPath(new URL('../dist',import.meta.url)));
  const seen=new Set(),resolve=(specifier,from)=>specifier==='three'?new URL('assets/vendor/three.module.js',base):specifier==='three/addons/controls/OrbitControls.js'?new URL('assets/vendor/OrbitControls.js',base):new URL(specifier,from);
  const visit=async url=>{if(seen.has(url.href))return;seen.add(url.href);const response=await fetch(url);assert.equal(response.status,200,url.href);const text=await response.text();if(url.pathname.endsWith('.js')){assert.match(response.headers.get('content-type'),/javascript/);for(const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g))await visit(resolve(m[1],url));}if(url.pathname.endsWith('.html'))for(const m of text.matchAll(/(?:src|href)="(assets\/[^" ]+)"/g))await visit(new URL(m[1],url));return text;};
  const home=await visit(new URL('index.html',base));assert.match(home,/href="joint.html"/);assert.match(home,/href="offset.html"/);assert.match(home,/href="tank.html"/);
  for(const tool of ['joint','offset','tank']){const html=await visit(new URL(tool+'.html',base));assert.match(html,/workbench-boot.js/);assert.match(html,/工具首頁/);assert.doesNotMatch(html,/<script type="module" src=/);}
  await visit(new URL('assets/app.js',base));await visit(new URL('assets/offset-app.js',base));await visit(new URL('assets/tank-app.js',base));await visit(new URL('assets/geometry-worker.js',base));assert.ok([...seen].some(s=>s.endsWith('/vendor/three.module.js')));
});
