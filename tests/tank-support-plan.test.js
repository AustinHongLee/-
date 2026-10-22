import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateTank} from '../dist/assets/tank-materials.js';
import {createV1102Input} from '../dist/assets/tank-reference-v1102.js';
import {v1102SupportPlan,rolledPlateComparison} from '../dist/assets/tank-support-plan.js';
import {tankDrawingModel,drawingWeldRegister} from '../dist/assets/tank-drawing-model.js';
import {supportDrawingSheet} from '../dist/assets/tank-support-drawing.js';
import {fabricationRows,fabricationPages} from '../dist/assets/tank-fabrication-report.js';
import {normalizeFabrication} from '../dist/assets/tank-fabrication.js';
import {readTankProject,tankProject} from '../dist/assets/tank-exports.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('source stock and formed sweep cannot silently become the same length or a trim instruction',()=>{
 const p=rolledPlateComparison({insideRadius:330,thickness:5,angle:142,blankLength:830});
 near(p.formedLength,824.0572063291227);near(p.outsideLength,335*142*Math.PI/180);near(p.outsideDelta,830-p.outsideLength);assert.ok(Math.abs(p.outsideDelta)<.3);assert.match(p.interpretation,/推測/);near(p.delta,5.942793670877336);near(p.blankSweep,143.0240511153634);near(p.impliedMeanRadius,334.8978661680164);assert.equal(p.status,'basis-pending');
 const other=rolledPlateComparison({insideRadius:600,thickness:8,angle:90,blankLength:950});near(other.formedLength,604*Math.PI/2);
});

test('round and slotted bases have separate canonical parts, stock and net weights',()=>{
 const r=estimateTank(createV1102Input()),m=tankDrawingModel(r),p=m.parts.find(p=>p.id==='A1.P1'),q=m.parts.find(p=>p.id==='A1.P6');
 assert.equal(p.quantity,1);assert.equal(q.quantity,1);assert.equal(p.holeCount,2);assert.equal(q.slotLength,29);near(p.weight-q.weight,2*19*10*12*7850/1e9);assert.ok(p.stock.sheetIDs.length);assert.ok(q.stock.sheetIDs.length);
 for(const part of m.support.parts.filter(p=>p.kind==='base')){assert.equal(part.holePosition,'axial-offset-pending');assert.equal(part.holeCenters[0][1],null);}
 const changed=createV1102Input();changed.fabricationData.assemblies[0].parts.find(p=>p.id==='P6').slotLength=18;assert.ok(normalizeFabrication(changed.fabricationData).issues.some(i=>i.field.endsWith('slotLength')));
});

test('all support geometry and weld zones use the same tank frame but incomplete outlines stay non-cuttable',()=>{
 const r=estimateTank(createV1102Input()),m=tankDrawingModel(r),p=m.support;
 assert.deepEqual(p.stations,[275,825]);assert.equal(p.baseTop,-788);assert.equal(p.seat.footWidth,110);assert.equal(p.seat.topWidth,null);assert.equal(p.profileCutReady,false);
 assert.ok(p.parts.filter(p=>p.kind==='profile-zone').every(p=>p.outline===null&&p.cutReady===false));
 const pads=p.parts.filter(p=>p.kind==='rolled');near(pads[0].station-r.frame.bottomTangent,275);near(pads[1].station-pads[0].station,550);assert.deepEqual(pads[0].blank,[830,250,5]);
 assert.ok(m.parts.filter(p=>['A1.P2','A1.P3'].includes(p.id)).every(p=>p.weight===null));const pad=m.parts.find(p=>p.id==='A1.P4');assert.equal(pad.weightBasis,'blank');assert.equal(pad.unknown,true);assert.equal(pad.ready,false);near(pad.weight,16.6);assert.equal(r.detailPlateParts.find(p=>p.id==='A1.P4').netWeight,null);
 const zones=m.welds.filter(w=>w.location==='zone');assert.equal(zones.length,5);assert.ok(zones.every(w=>w.anchor&&w.paths.length));
 const bottom=zones.filter(w=>['A1.W1','A1.W5'].includes(w.id));near(bottom.reduce((a,w)=>a+w.length,0),952);for(const w of bottom){assert.equal(w.size,7);const length=w.paths.flatMap(path=>path.slice(1).map((b,i)=>Math.hypot(...b.map((v,k)=>v-path[i][k])))).reduce((a,b)=>a+b,0);near(length,w.length);}
 assert.ok(zones.filter(w=>!bottom.includes(w)).every(w=>w.length===null&&w.size===null&&!w.ready));
 assert.ok(drawingWeldRegister(r).filter(w=>w.location==='zone').every(w=>w.kind==='fillet'&&w.wps===''));
});

test('support drawing, report, stored project and 3D labels share IDs and revision',()=>{
 const input=createV1102Input(),r=estimateTank(input),m=tankDrawingModel(r),svg=supportDrawingSheet(r),svg2=supportDrawingSheet(r,2),rows=fabricationRows(r),pages=fabricationPages(r,(title,body)=>title+body,{includeStock:false}).join('');
 for(const id of ['A1.P1','A1.P6','A1.P3','A1.W1','W5'])assert.ok(svg.includes(id));for(const id of ['A1.P1','A1.P6','A1.W1','A1.W5'])assert.ok(rows.some(row=>row[0]===id));
 assert.ok(svg.includes(m.revision));assert.ok(svg2.includes(m.revision));assert.match(svg2,/824.057/);assert.match(svg2,/143.024/);assert.match(svg2,/5.943/);assert.match(pages,/孔列軸向偏置/);
 const restored=estimateTank(readTankProject(tankProject(input)));assert.equal(tankDrawingModel(restored).revision,m.revision);assert.equal(restored.fabricationPlan.parts.find(p=>p.id==='A1.P6').slotLength,29);
});

test('project-owned layouts update geometry when edited, and unrelated unpositioned supports stay unlocated',()=>{
 const input=createV1102Input(),before=tankDrawingModel(estimateTank(input)).revision;input.fabricationData.assemblies[0].parts.find(p=>p.id==='P1').length=700;
 const r=estimateTank(input),m=tankDrawingModel(r);assert.ok(m.support);assert.equal(m.support.parts.find(p=>p.id==='A1.P1').dimensions[0],700);assert.ok(m.support.sourceDiff.includes('A1.P1 length'));assert.notEqual(m.revision,before);assert.match(supportDrawingSheet(r),/700/);
 input.referenceCase='';delete input.fabricationData.assemblies[0].supportLayout;const unrelated=estimateTank(input);assert.equal(v1102SupportPlan(unrelated),null);assert.ok(tankDrawingModel(unrelated).welds.filter(w=>w.assembly==='A1').every(w=>w.location==='unlocated'&&w.anchor===null));assert.throws(()=>supportDrawingSheet(unrelated),/尚未完成/);
});
