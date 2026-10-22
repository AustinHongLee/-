import test from 'node:test';
import assert from 'node:assert/strict';
import {createV1102Input} from '../dist/assets/tank-reference-v1102.js';
import {TANK_DEFAULTS} from '../dist/assets/tank-geometry.js';
import {NOZZLE_DEFAULTS} from '../dist/assets/tank-nozzles.js';
import {estimateTank} from '../dist/assets/tank-materials.js';
import {nozzleLocationModel,nozzlePositionPatch,clusterNozzleMarkers} from '../dist/assets/tank-nozzle-position.js';
import {nozzleLayoutSketch} from '../dist/assets/tank-nozzle-visuals.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<.011,`${a} != ${b}`);

test('the source A-plate distance and TL distance are distinct and the horizontal view runs from A to B',()=>{
  const r=estimateTank(createV1102Input()),m=nozzleLocationModel(r,'N1');assert.equal(m.height,79);assert.equal(m.datumShift,21);assert.equal(m.tlDistance,100);assert.equal(m.body.start,80);assert.equal(m.body.end,440);assert.ok(m.bodyPoint>80&&m.bodyPoint<120);
  const html=nozzleLayoutSketch(r,{selected:'N1',interactive:true});assert.match(html,/79 mm/);assert.match(html,/100 mm/);assert.match(html,/A 端 TL/);assert.match(html,/正上方 0°/);assert.doesNotMatch(html,/data-nozzle-position=/);
});

test('horizontal and vertical pointer coordinates use their actual diagram axis, preserving the same stored distance',()=>{
  const p=createV1102Input(),r=estimateTank(p),n=p.nozzles[0],m=nozzleLocationModel(r,n.id);
  near(nozzlePositionPatch(r,n,'height',{x:m.bodyPoint,y:96}).height,n.height);near(nozzlePositionPatch(r,n,'height',{x:260,y:96}).height,r.bodyHeight/2);
  const v=estimateTank({...TANK_DEFAULTS,nozzles:[{...NOZZLE_DEFAULTS,id:'N1',height:300}]}),vm=nozzleLocationModel(v,'N1');
  near(nozzlePositionPatch(v,v.input.nozzles[0],'height',{x:260,y:vm.bodyPoint}).height,300);assert.ok(vm.body.start>vm.body.end);near(nozzlePositionPatch(v,v.input.nozzles[0],'height',{x:260,y:55}).height,v.bodyHeight-31);
});

test('a parallel off-centre opening round-trips to offset while leaving its axis direction unchanged',()=>{
  const p=createV1102Input(),r=estimateTank(p),n=p.nozzles.find(n=>n.mark==='P1'),m=nozzleLocationModel(r,n.id),patch=nozzlePositionPatch(r,n,'angle',m.endPoint);
  assert.equal(m.parallel,true);assert.notEqual(m.surfaceAngle,m.angle);near(patch.offset,-150);assert.equal(Object.hasOwn(patch,'angle'),false);
  const radial=p.nozzles[0];assert.equal(nozzlePositionPatch(r,radial,'angle',{x:344,y:132}).angle,90);
});

test('head eccentricity uses the same A-end direction system for either head and the centre preserves an existing angle',()=>{
  const p=createV1102Input(),r=estimateTank(p),n=p.nozzles.find(n=>n.host==='top'),m=nozzleLocationModel(r,n.id),patch=nozzlePositionPatch(r,n,'end',m.endPoint);
  near(patch.radius,n.radius);near(patch.angle,n.angle);assert.deepEqual(nozzlePositionPatch(r,n,'end',{x:260,y:132}),{radius:0});
  const html=nozzleLayoutSketch(r,{selected:n.id,interactive:true});assert.match(html,/B 端封頭/);assert.match(html,/偏心方位/);assert.doesNotMatch(html,/marker-end="url/);
});

test('nearby markers become a chooser and every other nozzle remains reachable without repeated labels',()=>{
  const r=estimateTank(createV1102Input()),m=nozzleLocationModel(r,'N1'),groups=clusterNozzleMarkers(m.endMarkers);
  assert.deepEqual(groups.flatMap(g=>g.items.map(p=>p.id)).sort(),m.endMarkers.map(p=>p.id).sort());assert.ok(groups.some(g=>g.items.length>1));
  const html=nozzleLayoutSketch(r,{selected:'N1',interactive:true,cluster:['N2','N3']});assert.match(html,/data-nozzle-cluster=/);assert.match(html,/aria-label="同區管嘴"/);assert.match(html,/data-nozzle-select="N2"/);assert.doesNotMatch(html,/>N2 · 229 mm<|>N3 · 969 mm</);
});

test('an unfinished location is not silently displayed as zero or an editable validated opening',()=>{
  const p=createV1102Input();p.nozzles[0].height='';const r=estimateTank(p),m=nozzleLocationModel(r,'N1'),html=nozzleLayoutSketch(r,{selected:'N1',interactive:true,editing:true});assert.equal(m.height,null);assert.equal(m.bodyPoint,null);assert.match(html,/待填/);assert.doesNotMatch(html,/NaN|Infinity|data-nozzle-position=/);
});

test('the reading view protects position edits while an explicit edit state exposes correctly named controls',()=>{
  const r=estimateTank(createV1102Input()),view=nozzleLayoutSketch(r,{selected:'N1',interactive:true}),edit=nozzleLayoutSketch(r,{selected:'N1',interactive:true,editing:true});
  assert.doesNotMatch(view,/data-nozzle-position=/);assert.match(view,/調整圖上位置/);assert.match(edit,/data-nozzle-position="height"/);assert.match(edit,/data-nozzle-position="angle"/);assert.match(edit,/完成調整/);
  assert.match(nozzleLayoutSketch(r),/^<svg/);
});
