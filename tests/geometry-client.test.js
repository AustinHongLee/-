import test from 'node:test';
import assert from 'node:assert/strict';
import {computeLatestJoint} from '../dist/assets/geometry-client.js';
test('new dimensions cancel earlier background work; only the latest result is delivered',async()=>{
 const workers=[],original=globalThis.Worker;
 class MockWorker{constructor(){workers.push(this);}postMessage(data){this.data=data;}terminate(){this.terminated=true;}}
 globalThis.Worker=MockWorker;
 try{
  const earlier=computeLatestJoint({angle:45});const cancelled=assert.rejects(earlier,e=>e.name==='AbortError');
  const latest=computeLatestJoint({angle:90});await cancelled;
  assert.equal(workers[0].terminated,true);workers[1].onmessage({data:{result:{params:workers[1].data.params}}});
  assert.deepEqual(await latest,{params:{angle:90}});assert.equal(workers[1].terminated,true);
 }finally{if(original===undefined)delete globalThis.Worker;else globalThis.Worker=original;}
});
