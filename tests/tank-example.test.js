import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createTankExampleSession} from '../dist/assets/tank-example-session.js';
import {createV1102Input} from '../dist/assets/tank-reference-v1102.js';
import {estimateTank} from '../dist/assets/tank-materials.js';
import {readTankProject} from '../dist/assets/tank-exports.js';
import {tankDrawingModel} from '../dist/assets/tank-drawing-model.js';
const store=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),map};};
const key='tank:practice';

test('the downloadable example and one-click recipe include the whole tank, 12 nozzles and both supports',()=>{
  const original=readTankProject(fs.readFileSync(new URL('../dist/examples/V-1102-drawing-study.json',import.meta.url),'utf8'));
  for(const p of [original,createV1102Input()]){const r=estimateTank(p),m=tankDrawingModel(r);assert.ok(r.valid&&r.nozzlePlan.valid&&r.fabrication.valid);assert.equal(r.nozzlePlan.count,12);assert.equal(r.endTypes.top,'elliptical');assert.equal(r.endTypes.bottom,'elliptical');assert.equal(m.support.parts.filter(p=>p.kind==='base').length,2);}
});

test('opening and editing an example never writes the ordinary project draft',()=>{
  const storage=store();storage.setItem('tank','existing project bytes');const s=createTankExampleSession(storage,key),original=createV1102Input();original.diameter=3000;
  s.start(original,createV1102Input(),{task:'plates',view:'dimensions'});original.diameter=9999;
  const working=s.working;working.diameter=700;s.update(working);working.diameter=999;
  assert.equal(storage.getItem('tank'),'existing project bytes');assert.equal(s.original().input.diameter,3000);assert.equal(s.working.diameter,700);assert.equal(s.start(original,createV1102Input()),false);assert.equal(s.working.diameter,700);
});

test('reload retains both practice edits and incomplete original inputs for an exact return',()=>{
  const storage=store(),s=createTankExampleSession(storage,key),input=createV1102Input();input.height='';input.nozzles[0].projection='';const ui={task:'nozzles',view:'3d',hash:'#support',sameEnds:false};
  s.start(input,createV1102Input(),ui);const working=s.working;working.height='';s.update(working);
  const reloaded=createTankExampleSession(storage,key);assert.ok(reloaded.active);assert.equal(reloaded.working.height,'');assert.deepEqual(reloaded.original(),{input,ui});reloaded.finish();assert.equal(reloaded.active,false);assert.equal(storage.getItem(key),null);
});

test('failed example storage does not switch mode or lose the recoverable original',()=>{
  const storage=store(),s=createTankExampleSession(storage,key),save=storage.setItem;storage.setItem=()=>{throw new Error('quota');};assert.throws(()=>s.start(createV1102Input(),createV1102Input()),/quota/);assert.equal(s.active,false);
  storage.setItem=save;s.start(createV1102Input(),createV1102Input());storage.removeItem=()=>{throw new Error('denied');};assert.throws(()=>s.finish(),/denied/);assert.ok(s.active&&s.original());
});

test('a malformed practice record cannot replace an ordinary project',()=>{
  const storage=store();storage.setItem('tank','keep');for(const raw of ['{','{}','{"version":1,"original":{},"working":[]}']){storage.setItem(key,raw);assert.equal(createTankExampleSession(storage,key).active,false);assert.equal(storage.getItem('tank'),'keep');}
});
