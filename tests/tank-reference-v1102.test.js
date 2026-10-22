import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TANK_DEFAULTS} from '../dist/assets/tank-geometry.js';
import {NOZZLE_DEFAULTS} from '../dist/assets/tank-nozzles.js';
import {shellNozzleAxis} from '../dist/assets/tank-nozzle-axis.js';
import {estimateTank} from '../dist/assets/tank-materials.js';
import {tankProject,readTankProject,tankCSV,tankWorkOrder} from '../dist/assets/tank-exports.js';
import {createV1102Input,V1102_ID,V1102_PORTS,v1102Review,v1102BaseMatches} from '../dist/assets/tank-reference-v1102.js';
import {tankGeneralArrangement} from '../dist/assets/tank-ga-drawing.js';
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} ≠ ${b}`);
test('off-centre parallel nozzle keeps its direction, round surface and independently sampled cut lengths',()=>{
  const n={...NOZZLE_DEFAULTS,id:'N1',axisMode:'parallel',offset:150,angle:0,od:60.3,thickness:3.91,projection:200,flangeLength:60,flangeOD:152,flangeThickness:20,weldGap:2};
  const p={...TANK_DEFAULTS,shape:'custom',orientation:'horizontal',top:'elliptical',bottom:'elliptical',diameter:650,height:1100,shellThickness:5,endThickness:5,nozzles:[n]},r=estimateTank(p),v=r.nozzlePlan.items[0];
  assert.ok(r.nozzlePlan.valid);assert.deepEqual(v.direction,[0,0,1]);near(v.surface[0],150);near(Math.hypot(v.surface[0],v.surface[2]),330);near(v.face[2],Math.sqrt(330**2-150**2)+200);
  const lengths=Array.from({length:10001},(_,i)=>{const cross=150+n.od/2*Math.cos(2*Math.PI*i/10000);return v.face[2]-n.flangeLength-n.weldGap-Math.sqrt(325**2-cross**2);});near(v.minCutLength,Math.min(...lengths));near(v.maxCutLength,Math.max(...lengths));
  const neg=shellNozzleAxis({...n,offset:-150},{ri:325,ro:330,rm:327.5});near(neg.surface[0],-150);near(neg.holeWidth,v.holeWidth);near((neg.openingAngle+v.unfoldX/r.circumference*360)%360,0,1e-5);
});
test('parallel openings at or past the tangent and dip pipes reaching the far wall are rejected',()=>{
  const p=createV1102Input();p.nozzles=[{...p.nozzles[7],offset:300}];let r=estimateTank(p);assert.equal(r.nozzlePlan.valid,false);assert.ok(r.nozzlePlan.issues.some(i=>i.field==='offset'));
  p.nozzles=[{...p.nozzles[0],axisMode:'parallel',offset:150,inside:600}];r=estimateTank(p);assert.equal(r.nozzlePlan.valid,false);assert.ok(r.nozzlePlan.issues.some(i=>i.field==='inside'));
});
test('drawing reconstruction has the 12 active marks, exact TL stations, parallel ports and five integral assemblies',()=>{
  const p=createV1102Input(),r=estimateTank(p);assert.ok(r.valid&&r.nozzlePlan.valid&&r.fabrication.valid);assert.equal(r.nozzlePlan.count,12);assert.equal(r.nozzlePlan.unknownPipeCount,5);assert.ok(v1102BaseMatches(r));
  assert.equal(p.nozzles.some(n=>n.mark==='SN2'),false);near(r.volume,Math.PI*650**2/4*1100/1e9+Math.PI*650**3/12/1e9);near(r.bodyHeight,1058);
  for(const source of V1102_PORTS){const n=r.nozzlePlan.items.find(n=>n.mark===source.mark);assert.ok(n);if(source.station!==undefined)near(n.surface[1]-r.frame.bottomTangent,source.station);if(source.offset){near(n.surface[0],source.offset);assert.deepEqual(n.direction,[0,0,1]);near(n.face[2],493.9387691339814);}if(source.integral){assert.equal(n.cutReady,false);assert.equal(n.blankLength,null);assert.equal(n.pipeWeight,0);assert.equal(r.process.weld.seams.some(s=>s.nozzle===n.id),false);}}
  assert.ok(r.fabrication.warnings.some(w=>w.includes('一體長頸')));assert.ok(r.fabrication.warnings.some(w=>w.includes('平行偏心')));
});
test('integral assemblies cannot silently adopt an ordinary flange table or claim pipe cuts in printed / CSV records',()=>{
  const p=createV1102Input(),r=estimateTank(p),csv=tankCSV(r),html=tankWorkOrder(r);assert.match(csv,/V-1102 圖面重建草稿/);assert.match(csv,/不拆算直管下料/);assert.match(html,/不提供直管下料長/);assert.match(html,/0.4 m³/);assert.match(html,/0.4369 m³/);assert.match(html,/480 C.L./);assert.match(html,/詳圖待核/);
  p.nozzles[0].flangeSource='texas-v1';assert.equal(estimateTank(p).nozzlePlan.valid,false);
});
test('project retains source identity, original marks and geometry through load/save; changes are disclosed',()=>{
  const p=readTankProject(tankProject(createV1102Input()));assert.equal(p.referenceCase,V1102_ID);assert.equal(p.nozzles[5].mark,'SV1');assert.equal(p.nozzles[7].offset,-150);assert.equal(v1102Review(estimateTank(p)).portRows.some(row=>row.changed),false);
  p.nozzles[7].offset=-140;assert.equal(v1102Review(estimateTank(p)).portRows.find(row=>row.source.mark==='P1').changed,true);p.diameter=700;assert.equal(v1102BaseMatches(estimateTank(p)),false);
  const raw=JSON.parse(tankProject(p));raw.input.referenceCase='unknown';assert.throws(()=>readTankProject(JSON.stringify(raw)),/不支援/);
});
test('the shipped reconstruction is a valid project identical to the source recipe',()=>{
  const shipped=readTankProject(fs.readFileSync(new URL('../dist/examples/V-1102-drawing-study.json',import.meta.url),'utf8'));assert.deepEqual(shipped.nozzles,readTankProject(tankProject(createV1102Input())).nozzles);
});
test('arrangement drawing uses solved dimensions and original marks, discloses draft scope, and refuses unsupported sheets',()=>{
  const p=createV1102Input(),svg=tankGeneralArrangement(estimateTank(p));for(const mark of V1102_PORTS.map(p=>p.mark))assert.ok(svg.includes('>'+mark+'<')||svg.includes(mark+' /'));assert.match(svg,/1,100 T.L. - T.L./);assert.match(svg,/ID 650/);assert.match(svg,/不可直接作製作圖/);assert.doesNotMatch(svg,/ISSUED|APPROVED|SN2/);
  p.height=1200;assert.match(tankGeneralArrangement(estimateTank(p)),/1,200 T.L. - T.L./);p.orientation='vertical';assert.throws(()=>tankGeneralArrangement(estimateTank(p)),/臥式/);
});
test('drawing-specific neck openings, weld preparation and inspection do not inherit unrelated defaults',()=>{
  const p=createV1102Input(),r=estimateTank(p);near(r.nozzlePlan.items[0].hole,69);near(r.nozzlePlan.items[1].hole,53);near(r.parts[0].finishedWidth,r.circumference-2);assert.equal(r.process.weld.seams.find(s=>s.name==='筒身縱縫').groove.type,'V');assert.equal(r.process.weld.nde.spots,null);assert.match(r.process.weld.nde.modeLabel,/20% MIN/);p.methods.inspection.rt='full';assert.equal(estimateTank(p).process.weld.nde.mode,'full');
});
test('missing source assemblies and blind-cover dimensions cannot become a transport clearance or invented cover bill',()=>{
  const r=estimateTank(createV1102Input()),html=tankWorkOrder(r);assert.equal(r.incompleteFabrication,true);assert.equal(r.process.erection.transport.fits,null);assert.equal(r.process.erection.transport.assessed,false);assert.equal(r.attachments.manholes.items.length,0);assert.doesNotMatch(html,/t · 可整槽運送/);assert.match(html,/不作運送判定/);assert.match(html,/整槽重量、重心與施工載荷尚未確定/);
});
