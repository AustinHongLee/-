import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {estimateTank} from '../dist/assets/tank-materials.js';
import {createV1102Input} from '../dist/assets/tank-reference-v1102.js';
import {tankProject,readTankProject,tankSupportWorkOrder,tankCSV} from '../dist/assets/tank-exports.js';
import {tankDrawingModel} from '../dist/assets/tank-drawing-model.js';
import {supportDrawingSheet} from '../dist/assets/tank-support-drawing.js';
import {tankGeneralArrangement} from '../dist/assets/tank-ga-drawing.js';
import {editSupport,migrateV1102Support,legacyV1102Supports,replaceV1102Support} from '../dist/assets/tank-support-project.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const edit=(input,kind,id,key,value)=>({...input,fabricationData:editSupport(input.fabricationData,{kind,id,key,value})});

test('live blank and formed-angle edits update the same BOM, source sheet, 3D model and printable work order',()=>{
 let input=createV1102Input();input=edit(input,'part','P4','length',900);input=edit(input,'layout','','formedAngle',135);
 const r=estimateTank(input),m=tankDrawingModel(r),p=r.fabricationPlan.parts.find(p=>p.id==='A1.P4'),stock=r.detailPlateParts.find(p=>p.id==='A1.P4');
 assert.equal(r.fabrication.valid,true);assert.equal(p.length,900);assert.equal(p.quantity,2);near(p.weight,18);assert.equal(stock.width,900);assert.equal(m.support.parts.find(p=>p.kind==='rolled').angle,135);assert.deepEqual(m.support.parts.find(p=>p.kind==='rolled').blank,[900,250,5]);near(m.support.formed.formedLength,332.5*135*Math.PI/180);
 const html=tankSupportWorkOrder(r);assert.match(html,/900/);assert.match(html,/135/);assert.ok(html.includes(m.revision));assert.match(html,/18（先備板）/);assert.match(tankCSV(r),/900/);assert.match(supportDrawingSheet(r,2),/900.*展開／135/);assert.match(tankGeneralArrangement(r),/900 \/ 135°/);
 const restored=estimateTank(readTankProject(tankProject(input)));assert.equal(tankDrawingModel(restored).revision,m.revision);assert.equal(restored.fabricationPlan.parts.find(p=>p.id==='A1.P4').blankLength,900);
});

test('foot width changes recalculate all four nominal weld footprints, not just the rendered legs',()=>{
 const input=edit(createV1102Input(),'part','P3','width',120),r=estimateTank(input),m=tankDrawingModel(r);
 for(const id of ['A1.W1','A1.W5']){const w=r.fabricationPlan.welds.find(w=>w.id===id);assert.equal(w.measure,'perimeter');near(w.eachLength,258);near(w.length,516);const zone=m.support.zones.find(w=>w.id===id),length=zone.paths.flatMap(path=>path.slice(1).map((b,i)=>Math.hypot(...b.map((v,k)=>v-path[i][k])))).reduce((a,b)=>a+b,0);near(length,w.length);}
 assert.ok(m.support.parts.filter(p=>p.kind==='profile-zone').every(p=>p.footWidth===120));assert.match(tankSupportWorkOrder(r),/258 \/ 516/);
});

test('unknown hole offset remains unknown until confirmed and impossible offsets block export',()=>{
 let input=createV1102Input();let m=tankDrawingModel(estimateTank(input));assert.ok(m.support.parts.filter(p=>p.kind==='base').every(p=>p.holePosition==='axial-offset-pending'));
 input=edit(input,'layout','','holeAxialOffset',0);m=tankDrawingModel(estimateTank(input));assert.ok(m.support.parts.filter(p=>p.kind==='base').every(p=>p.holePosition==='specified'&&p.holeCenters.every(c=>c[1]===0)));assert.ok(!m.support.pending.some(p=>p.text.includes('孔列沿槽軸的偏置未標')));
 input=edit(input,'layout','','holeAxialOffset',100);const bad=estimateTank(input);assert.equal(bad.fabrication.valid,false);assert.ok(bad.fabrication.issues.some(i=>i.message.includes('孔列')));assert.throws(()=>tankSupportWorkOrder(bad),/修正/);assert.equal(tankDrawingModel(bad).support,null);
});

test('position and base edits propagate to the end view and geometry; incompatible positions are actionable errors',()=>{
 let input=edit(createV1102Input(),'layout','','stationA',300);input=edit(input,'layout','','axisToBase',850);input=edit(input,'part','P1','length',700);
 const r=estimateTank(input),p=tankDrawingModel(r).support,svg=supportDrawingSheet(r);assert.equal(p.parts.find(p=>p.id==='A1.P1').station-r.frame.bottomTangent,300);assert.equal(p.floor,-850);assert.match(svg,/700/);assert.match(svg,/850/);assert.match(tankGeneralArrangement(r),/525 · 支承中心距/);
 input=edit(input,'layout','','stationB',1300);const bad=estimateTank(input);assert.equal(bad.fabrication.valid,false);assert.ok(bad.fabrication.issues.some(i=>i.field.endsWith('supportLayout.stations')&&i.message.includes('站位')));
});

test('only exact shipped legacy support records migrate; user dimensions, WPS and other assemblies are preserved',()=>{
 for(const legacy of legacyV1102Supports()){
   const input=createV1102Input();input.fabricationData.assemblies[0]=legacy;input.fabricationData.assemblies[1].note='keep this custom note';
   const before=JSON.stringify(input),migration=migrateV1102Support(input);assert.equal(migration.changed,true);assert.ok(migration.input.fabricationData.assemblies[0].supportLayout);assert.equal(migration.input.fabricationData.assemblies[1].note,'keep this custom note');assert.equal(JSON.stringify(input),before);assert.deepEqual(migration.previous,legacy);assert.equal(migrateV1102Support(migration.input).changed,false);
   input.fabricationData.assemblies[0].parts[0].length=710;assert.equal(migrateV1102Support(input).changed,false);
 }
 const input=createV1102Input();input.fabricationData.assemblies[0]=legacyV1102Supports()[1];input.fabricationData.assemblies[0].welds[0].wps='site-WPS';assert.equal(migrateV1102Support(input).changed,false);
 const replaced=replaceV1102Support(input.fabricationData);assert.equal(replaced.previous.welds[0].wps,'site-WPS');assert.deepEqual(replaced.data.assemblies.slice(1),input.fabricationData.assemblies.slice(1));
});

test('a saved layout works on another horizontal tank without source identity or a hardcoded assembly ID',()=>{
 const input=createV1102Input();input.referenceCase='';input.diameter=700;const a=input.fabricationData.assemblies[0];a.id='SUPPORT';a.name='另一個桶槽的支承';
 const r=estimateTank(input),m=tankDrawingModel(r);assert.equal(r.fabrication.valid,true);assert.equal(m.support.id,'SUPPORT');assert.ok(m.support.parts.every(p=>p.bomId.startsWith('SUPPORT.')));near(m.support.formed.insideRadius,355);assert.match(supportDrawingSheet(r),/SUPPORT.P6/);assert.match(tankSupportWorkOrder(r),/另一個桶槽/);
});

test('the actual workbench mounts the editable support workspace, upgrades drafts and prints the live project',()=>{
 const html=fs.readFileSync(new URL('../dist/tank.html',import.meta.url),'utf8'),app=fs.readFileSync(new URL('../dist/assets/tank-app.js',import.meta.url),'utf8'),workspace=fs.readFileSync(new URL('../dist/assets/tank-workspace.js',import.meta.url),'utf8');
 assert.match(html,/id="tank-support-workspace"/);assert.match(html,/assets\/tank-support.css/);assert.match(workspace,/支承與分件/);assert.match(app,/new TankSupportUI/);assert.match(app,/migrateV1102Support\(values\)/);assert.match(app,/tankSupportWorkOrder\(result\)/);assert.match(app,/#support/);assert.match(app,/selectFabricationPiece/);
});
