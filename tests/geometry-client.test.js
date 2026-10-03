import test from 'node:test';
import assert from 'node:assert/strict';
import {computeJoint,DEFAULT_PARAMS} from '../dist/assets/joint-model.js';

let clientNumber=0;
async function freshClient(){return import(`../dist/assets/geometry-client.js?test=${++clientNumber}`);}
async function withMockWorker(run){
  const workers=[],original=globalThis.Worker;
  class MockWorker{
    constructor(url,options){this.url=url;this.options=options;workers.push(this);}
    postMessage(data){this.data=structuredClone(data);}
    terminate(){this.terminated=true;}
    deliver(result){this.onmessage({data:{result}});}
  }
  globalThis.Worker=MockWorker;
  try{await run({workers,computeLatestJoint:(await freshClient()).computeLatestJoint});}
  finally{if(original===undefined)delete globalThis.Worker;else globalThis.Worker=original;}
}
const fakeResult=params=>({valid:true,params:structuredClone(params),templates:[{id:'branch',outer:[[1,2],[3,4]],references:[]}],geometry:{branch:{outerCut:[[10,20,30]]}},verification:[]});
const simple={...DEFAULT_PARAMS,hostType:'straight',mainOD:200,branchOD:100,angle:90,jointPosition:300,padEnabled:false,samples:36,autoPrecision:false,tolerance:100};

test('new dimensions cancel earlier background work; only the latest result is delivered',async()=>withMockWorker(async({workers,computeLatestJoint})=>{
  const earlier=computeLatestJoint({angle:45}),cancelled=assert.rejects(earlier,e=>e.name==='AbortError');
  const staleHandler=workers[0].onmessage,latest=computeLatestJoint({angle:90});await cancelled;
  assert.equal(workers[0].terminated,true);assert.equal(workers[1].options.type,'module');assert.match(workers[1].url.pathname,/geometry-worker\.js$/);
  staleHandler({data:{result:fakeResult({angle:45})}});
  workers[1].deliver(fakeResult({angle:90}));assert.equal((await latest).params.angle,90);assert.equal(workers[1].terminated,true);
  const again=await computeLatestJoint({angle:90});assert.equal(again.params.angle,90);assert.equal(workers.length,2);
}));

test('identical in-flight requests share one worker and each subscriber owns its result',async()=>withMockWorker(async({workers,computeLatestJoint})=>{
  const original={angle:90,mainOD:219.1},a=computeLatestJoint(original),b=computeLatestJoint({mainOD:219.1,angle:90});
  original.mainOD=999;assert.equal(workers.length,1);assert.equal(workers[0].data.params.mainOD,219.1);
  const delivered=fakeResult(workers[0].data.params);workers[0].deliver(delivered);
  const [one,two]=await Promise.all([a,b]);assert.notEqual(one,two);assert.notEqual(one.templates,two.templates);
  one.templates[0].outer[0][0]=600;one.templates.push({id:'app-added'});one.geometry.branch.outerCut[0][0]=700;
  assert.equal(two.templates[0].outer[0][0],1);assert.equal(two.templates.length,1);assert.equal(two.geometry.branch.outerCut[0][0],10);
  delivered.templates[0].outer[0][0]=800;
  const cached=await computeLatestJoint({mainOD:219.1,angle:90});assert.equal(workers.length,1);assert.equal(cached.templates[0].outer[0][0],1);assert.equal(cached.templates.length,1);
  cached.templates[0].references.push({type:'field-datum'});
  assert.equal((await computeLatestJoint({angle:90,mainOD:219.1})).templates[0].references.length,0);
}));

test('the one-entry cache cancels a different active request and does not retain older valid entries',async()=>withMockWorker(async({workers,computeLatestJoint})=>{
  const a=computeLatestJoint({angle:90});workers[0].deliver(fakeResult({angle:90}));await a;
  const b=computeLatestJoint({angle:45}),bShared=computeLatestJoint({angle:45});
  const rejected=Promise.all([assert.rejects(b,e=>e.name==='AbortError'),assert.rejects(bShared,e=>e.name==='AbortError')]);
  const cached=await computeLatestJoint({angle:90});await rejected;assert.equal(cached.params.angle,90);assert.equal(workers[1].terminated,true);assert.equal(workers.length,2);
  const newest=computeLatestJoint({angle:135});workers[2].deliver(fakeResult({angle:135}));await newest;
  const prior=computeLatestJoint({angle:90});assert.equal(workers.length,4);workers[3].deliver(fakeResult({angle:90}));await prior;
}));

test('invalid results and worker calculation failures are never cached',async()=>withMockWorker(async({workers,computeLatestJoint})=>{
  const params={angle:0},a=computeLatestJoint(params),b=computeLatestJoint(params);
  workers[0].deliver({valid:false,params,errors:[{field:'angle',message:'invalid'}]});
  const [one,two]=await Promise.all([a,b]);one.errors[0].message='changed';assert.equal(two.errors[0].message,'invalid');
  const again=computeLatestJoint(params);assert.equal(workers.length,2);workers[1].deliver({valid:false,params,errors:[]});await again;
  const failure=computeLatestJoint({angle:5}),rejected=assert.rejects(failure,/calculation failed/);
  workers[2].onmessage({data:{error:'calculation failed'}});await rejected;assert.equal(workers[2].terminated,true);
  const retry=computeLatestJoint({angle:5});assert.equal(workers.length,4);workers[3].deliver(fakeResult({angle:5}));await retry;
  const invalidAfterValid=computeLatestJoint(params);workers[4].deliver({valid:false,params,errors:[]});await invalidAfterValid;
  assert.equal((await computeLatestJoint({angle:5})).params.angle,5);assert.equal(workers.length,5);
}));

test('the exact stable key does not round nearby dimensions or alias invalid special values',async()=>withMockWorker(async({workers,computeLatestJoint})=>{
  const p={angle:90,mainOD:219.1},first=computeLatestJoint(p);workers[0].deliver(fakeResult(p));await first;
  const changed=computeLatestJoint({...p,mainOD:219.10000000001});assert.equal(workers.length,2);workers[1].deliver(fakeResult(workers[1].data.params));await changed;
  const invalid=computeLatestJoint({angle:NaN}),cancelled=assert.rejects(invalid,e=>e.name==='AbortError');
  const nullValue=computeLatestJoint({angle:null});await cancelled;assert.equal(workers.length,4);workers[3].deliver({valid:false,params:{angle:null}});await nullValue;
  const absent=computeLatestJoint({}),cancelAbsent=assert.rejects(absent,e=>e.name==='AbortError');
  const undefinedValue=computeLatestJoint({angle:undefined});await cancelAbsent;assert.equal(workers.length,6);workers[5].deliver({valid:false,params:{angle:undefined}});await undefinedValue;
}));

test('malformed latest input cancels previous subscribers instead of delivering stale geometry',async()=>withMockWorker(async({workers,computeLatestJoint})=>{
  const first=computeLatestJoint({angle:90}),shared=computeLatestJoint({angle:90});
  const oldRejected=Promise.all([assert.rejects(first,e=>e.name==='AbortError'),assert.rejects(shared,e=>e.name==='AbortError')]);
  const cyclic={angle:45};cyclic.self=cyclic;
  await assert.rejects(computeLatestJoint(cyclic),/循環/);await oldRejected;assert.equal(workers[0].terminated,true);
  const good=computeLatestJoint({angle:45});workers[1].deliver(fakeResult({angle:45}));await good;
}));

test('native worker load errors fall back to the same kernel and cache isolated geometry',async()=>withMockWorker(async({workers,computeLatestJoint})=>{
  const a=computeLatestJoint(simple),b=computeLatestJoint({...simple});assert.equal(workers.length,1);
  workers[0].onerror(new Error('worker could not load'));
  const [one,two]=await Promise.all([a,b]);assert.equal(one.valid,true);assert.deepEqual(one,computeJoint(simple));assert.notEqual(one,two);assert.equal(workers[0].terminated,true);
  one.templates.push({id:'custom'});const cached=await computeLatestJoint(simple);assert.equal(workers.length,1);assert.deepEqual(cached,computeJoint(simple));
}));

test('missing or unavailable Worker preserves fallback results, cloning and bounded cache',async()=>{
  const original=globalThis.Worker;
  try{
    delete globalThis.Worker;const a=(await freshClient()).computeLatestJoint;
    const one=await a(simple);one.templates[0].outer[0][0]=-100;const two=await a({...simple});assert.deepEqual(two,computeJoint(simple));
    globalThis.Worker=class{constructor(){throw new Error('blocked');}};
    const b=(await freshClient()).computeLatestJoint;assert.deepEqual(await b(simple),computeJoint(simple));
  }finally{if(original===undefined)delete globalThis.Worker;else globalThis.Worker=original;}
});

test('actual formed elbow pad survives clone/cache round trips without sharing app-added templates',async()=>{
  const original=globalThis.Worker;delete globalThis.Worker;
  try{
    const computeLatestJoint=(await freshClient()).computeLatestJoint;
    const p={...DEFAULT_PARAMS,hostType:'elbow',mainOD:200,mainWall:6,branchOD:100,branchWall:4,branchLength:200,
      bendRadius:304.8,bendAngle:90,bendPosition:45,surfaceClock:0,angle:90,branchSwivel:0,jointType:'on',motherOpening:true,
      rootGap:0,holeGap:.5,padEnabled:true,padThickness:6,padMargin:35,padClearance:1,padShape:'obround',padSplit:'single',
      samples:72,autoPrecision:false,tolerance:1};
    const one=await computeLatestJoint(p);assert.equal(one.valid,true,JSON.stringify(one.errors));assert.ok(one.geometry.pad);assert.doesNotThrow(()=>JSON.stringify(one));
    const expected=structuredClone(one);one.geometry.pad.outerBoundary3D[0][0]+=42;one.templates.push({id:'app-added'});
    const two=await computeLatestJoint({...p});assert.deepEqual(two,expected);assert.notEqual(two.geometry.pad,one.geometry.pad);assert.doesNotThrow(()=>JSON.stringify(two));
  }finally{if(original===undefined)delete globalThis.Worker;else globalThis.Worker=original;}
});
