import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Use the shipped browser modules and Three implementation without a WebGL
// context or npm dependencies. Only their import URLs differ in this harness.
const assets=new URL('../dist/assets/',import.meta.url);
const threeURL=new URL('vendor/three.module.js',assets).href;
async function browserModule(name,imports={}){
  const url=new URL(name,assets),source=await readFile(url,'utf8');
  const linked=source.replace(/from\s+(['"])([^'"]+)\1/g,(_,quote,specifier)=>{
    const target=imports[specifier]??(specifier==='three'?threeURL:new URL(specifier,url).href);
    return `from ${quote}${target}${quote}`;
  });
  return 'data:text/javascript;base64,'+Buffer.from(linked).toString('base64');
}
const orbitURL=await browserModule('vendor/OrbitControls.js');
const {JointViewer}=await import(await browserModule('viewer.js',{'three/addons/controls/OrbitControls.js':orbitURL}));
const {ModelEditor}=await import(await browserModule('model-editor.js'));

function withAnimationFrames(run){
  const saved=['requestAnimationFrame','cancelAnimationFrame'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]);
  let next=1;const pending=new Map(),cancelled=[];
  globalThis.requestAnimationFrame=callback=>{const id=next++;pending.set(id,callback);return id;};
  globalThis.cancelAnimationFrame=id=>{cancelled.push(id);pending.delete(id);};
  const flush=()=>{const callbacks=[...pending.values()];pending.clear();for(const callback of callbacks)callback(16);};
  try{return run({pending,cancelled,flush});}
  finally{for(const[name,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}
}

function viewerFixture(){
  const events=[],viewer=Object.create(JointViewer.prototype);
  Object.assign(viewer,{available:true,scene:{},camera:{},editor:{layout:()=>events.push('layout')},
    renderer:{render:()=>events.push('draw'),domElement:{toDataURL:type=>{assert.equal(type,'image/png');events.push('snapshot');return 'data:image/png;base64,current';}}}});
  return {viewer,events};
}

function editorFixture(params){
  const editor=Object.create(ModelEditor.prototype),capture=new Set([7]),released=[],previews=[],updates=[];
  const target={hasPointerCapture:id=>capture.has(id),releasePointerCapture:id=>{released.push(id);capture.delete(id);},
    setPointerCapture:id=>capture.add(id),focus:()=>{}};
  Object.assign(editor,{enabled:true,params:{...params},draft:{angle:68},calculating:true,busy:false,
    dragging:{id:7,kind:'direction',target,patch:{angle:68}},
    viewer:{available:true,result:{valid:true},controls:{enabled:false},render:()=>updates.push('render')},
    getParams:()=>params,onPreview:value=>previews.push(value),
    clearHover:()=>{},rebuildHost:()=>updates.push('host'),updateDraft:()=>{updates.push('draft');editor.frame={};}});
  return {editor,target,released,capture,previews,updates};
}

test('camera and pointer updates in one animation frame produce one drawing of the latest scene',()=>withAnimationFrames(({pending,flush})=>{
  const {viewer,events}=viewerFixture();
  viewer.render();viewer.render();viewer.render();
  assert.equal(pending.size,1);assert.deepEqual(events,[]);
  flush();assert.deepEqual(events,['layout','draw']);assert.equal(pending.size,0);
  viewer.render();flush();assert.deepEqual(events,['layout','draw','layout','draw']);
}));

test('export flushes the latest scene before taking its image and cancels the queued redraw',()=>withAnimationFrames(({pending,cancelled,flush})=>{
  const {viewer,events}=viewerFixture();viewer.render();const queued=viewer.frameRequest;
  assert.equal(viewer.image(),'data:image/png;base64,current');
  assert.deepEqual(events,['layout','draw','snapshot']);assert.deepEqual(cancelled,[queued]);assert.equal(pending.size,0);
  flush();assert.deepEqual(events,['layout','draw','snapshot']);
  viewer.render();flush();assert.deepEqual(events,['layout','draw','snapshot','layout','draw']);
}));

test('finishing the current calculation preserves an active drag and its unapplied draft',()=>{
  const params={hostType:'straight',mainOD:219.1,angle:65},fixture=editorFixture(params),{editor,target}=fixture;
  const drag=editor.dragging,draft=editor.draft,result={valid:true,geometry:{}};
  editor.sync({...params},result);
  assert.equal(editor.dragging,drag);assert.equal(editor.draft,draft);assert.equal(editor.result,result);
  assert.equal(target.hasPointerCapture(7),true);assert.equal(editor.viewer.controls.enabled,false);
  assert.equal(editor.calculating,false);assert.equal(editor.busy,false);assert.deepEqual(fixture.released,[]);
  assert.deepEqual(fixture.previews,[]);assert.deepEqual(fixture.updates,['host','draft','render']);
});

test('a result for changed parameters ends the old drag, clears its draft, and releases its pointer',()=>{
  const params={hostType:'straight',mainOD:219.1,angle:65},fixture=editorFixture(params),{editor}=fixture;
  const next={...params,angle:72},result={valid:true,geometry:{}};editor.sync(next,result);
  assert.equal(editor.dragging,null);assert.equal(editor.draft,null);assert.deepEqual(fixture.released,[7]);
  assert.equal(fixture.capture.size,0);assert.equal(editor.viewer.controls.enabled,true);
  assert.deepEqual(editor.params,next);assert.equal(editor.result,result);assert.equal(editor.calculating,false);
  assert.deepEqual(fixture.previews,['']);assert.equal(fixture.updates.at(-1),'render');
});

test('a pending background calculation still allows the operator to begin the next model drag',()=>{
  const params={hostType:'straight',mainOD:219.1,angle:65},fixture=editorFixture(params),{editor,target}=fixture;
  editor.dragging=null;editor.draft=null;fixture.capture.clear();editor.setPending(params);
  assert.equal(editor.calculating,true);assert.equal(editor.busy,false);
  let prevented=false;editor.beginDrag({button:0,pointerId:9,currentTarget:target,
    preventDefault:()=>{prevented=true;},stopPropagation:()=>{}},'position');
  assert.equal(prevented,true);assert.equal(editor.dragging?.id,9);assert.equal(editor.dragging?.kind,'position');
  assert.equal(target.hasPointerCapture(9),true);assert.equal(editor.viewer.controls.enabled,false);
  assert.deepEqual(editor.params,params);
});

test('a debounced calculation for the same pending dimensions preserves a newly started drag',()=>{
  const params={hostType:'straight',mainOD:219.1,angle:65},fixture=editorFixture(params),{editor,target}=fixture;
  const drag=editor.dragging,draft=editor.draft;editor.setPending({...params});
  assert.equal(editor.dragging,drag);assert.equal(editor.draft,draft);
  assert.equal(target.hasPointerCapture(7),true);assert.equal(editor.viewer.controls.enabled,false);
  assert.equal(editor.calculating,true);assert.equal(editor.busy,false);assert.deepEqual(fixture.released,[]);
  assert.deepEqual(fixture.previews,[]);assert.equal(editor.result.valid,false);
});

test('pending changed dimensions cancel a drag based on the old dimensions',()=>{
  const params={hostType:'straight',mainOD:219.1,angle:65},fixture=editorFixture(params),{editor}=fixture;
  editor.setPending({...params,mainOD:323.8});
  assert.equal(editor.dragging,null);assert.equal(editor.draft,null);assert.deepEqual(fixture.released,[7]);
  assert.equal(editor.viewer.controls.enabled,true);assert.equal(editor.params.mainOD,323.8);
  assert.equal(editor.calculating,true);assert.equal(editor.busy,false);
});
