import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateTank} from '../dist/assets/tank-materials.js';
import {createV1102Input} from '../dist/assets/tank-reference-v1102.js';
import {tankDrawingModel,drawingWeldRegister,shellSceneAnnotations} from '../dist/assets/tank-drawing-model.js';
import {shellConstructionPlan} from '../dist/assets/tank-shell-plan.js';
import {tankGeneralArrangement} from '../dist/assets/tank-ga-drawing.js';
import {shellDrawingSheet} from '../dist/assets/tank-shell-report.js';
import {fabricationRows} from '../dist/assets/tank-fabrication-report.js';
import {readTankProject,tankProject} from '../dist/assets/tank-exports.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('V1102 physical IDs map to existing BOM without counting two more heads',()=>{
 const r=estimateTank(createV1102Input()),m=tankDrawingModel(r);assert.equal(m.plates[0].id,'S1');assert.equal(m.plates[0].bomId,'BODY.S');assert.deepEqual(m.heads.map(x=>x.id),['H-A','H-B']);assert.ok(m.heads.every(h=>h.bomId==='BODY.H'));assert.equal(m.parts.find(x=>x.id==='BODY.H').quantity,2);
 near(m.plates[0].finished[0],2055.7431881013144);near(m.plates[0].raw[0],2065.7431881013144);
});
test('main seams and aggregate aliases conserve the original estimated length',()=>{
 const r=estimateTank(createV1102Input()),m=tankDrawingModel(r),located=m.welds.filter(w=>w.location==='located');assert.deepEqual(located.map(w=>w.id),['L1-1','W-A','W-B']);
 for(const a of m.aliases){const original=r.fabricationPlan.register.find(w=>w.id===a.groupId);near(original.length,m.welds.filter(w=>a.ids.includes(w.id)).reduce((s,w)=>s+w.length,0));}
 near(located.find(w=>w.id==='W-A').station-r.frame.bottomTangent,20);near(located.find(w=>w.id==='W-B').station-r.frame.bottomTangent,1080);
 const rows=drawingWeldRegister(r);assert.equal(new Set(rows.map(w=>w.id)).size,rows.length);for(const a of m.aliases)assert.ok(!rows.some(w=>w.id===a.groupId));
});
test('unlocated joints retain canonical IDs and never receive made-up 3D anchors',()=>{
 const r=estimateTank(createV1102Input()),m=tankDrawingModel(r);assert.equal(m.welds.filter(w=>w.scope==='detail').length,29);assert.ok(m.welds.filter(w=>w.location==='unlocated').every(w=>w.anchor===null));assert.ok(m.welds.some(w=>w.id==='A1.W1'));assert.equal(m.nozzles.length,12);assert.ok(!m.nozzles.some(n=>n.mark==='SN2'));
});
test('2D drawing, canonical report and 3D anchors share identifiers and dimensions',()=>{
 const r=estimateTank(createV1102Input()),m=tankDrawingModel(r),scene=shellSceneAnnotations(shellConstructionPlan(r),'weld'),ga=tankGeneralArrangement(r),sheet=shellDrawingSheet(r),rows=fabricationRows(r);
 for(const id of ['S1','H-A','H-B','L1-1','W-A','W-B'])assert.ok(ga.includes(id));assert.ok(ga.includes(m.revision));assert.ok(sheet.includes(m.revision));
 for(const id of ['L1-1','W-A','W-B'])assert.ok(rows.some(row=>row[0]===id));
 const label=scene.find(x=>x.id==='L1-1'),w=m.welds.find(x=>x.id==='L1-1');near(label.anchor[1]+r.frame.bodyBottom,w.anchor[1]);near(label.anchor[0],w.anchor[0]);near(label.anchor[2],w.anchor[2]);assert.match(scene.find(x=>x.id==='S1').text,/2055.74/);
});
test('model revision is stable across project persistence and changes with geometry',()=>{
 const p=createV1102Input(),r=estimateTank(p),m=tankDrawingModel(r);assert.equal(tankDrawingModel(estimateTank(readTankProject(tankProject(p)))).revision,m.revision);
 p.headGap=3;const next=tankDrawingModel(estimateTank(p));assert.notEqual(next.revision,m.revision);assert.notEqual(next.plates[0].finished[1],m.plates[0].finished[1]);assert.equal(tankDrawingModel(estimateTank({...p,diameter:-1})),null);
});
test('cross-runtime rounding noise does not change the engineering model revision',()=>{
 const r=estimateTank(createV1102Input()),before=tankDrawingModel(r).revision;r.assembly[0].start+=1e-10;assert.equal(tankDrawingModel(r).revision,before);r.assembly[0].start+=.01;assert.notEqual(tankDrawingModel(r).revision,before);
});
