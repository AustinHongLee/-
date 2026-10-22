import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/assets/vendor/three.module.js';
import {estimateTank} from '../dist/assets/tank-materials.js';
import {NOZZLE_DEFAULTS} from '../dist/assets/tank-nozzles.js';
import {SEAM_CLEARANCE_DEFAULT,normalizeSeamClearance,seamClearancePending} from '../dist/assets/tank-seam-settings.js';
import {checkShellSeams,suggestShellSeamStart} from '../dist/assets/tank-seam-clearance.js';
import {shellSeamDisplayModel} from '../dist/assets/tank-seam-display.js';
import {addShellSeamOverlays} from '../dist/assets/tank-seam-webgl.js';
import {seamAvoidanceMarkup} from '../dist/assets/tank-seam-ui.js';
import {tankDrawingModel} from '../dist/assets/tank-drawing-model.js';
import {tankProject,readTankProject,tankCSV,tankWorkOrder} from '../dist/assets/tank-exports.js';
import {shellWorkOrder} from '../dist/assets/tank-shell-report.js';
import {tankGeneralArrangement} from '../dist/assets/tank-ga-drawing.js';
import {assemblySketch} from '../dist/assets/tank-visuals.js';
const settings={longitudinalWidth:20,circumferentialWidth:30,nozzleWeldReach:8,padWeldReach:10,workDistance:100};
const n=(patch={})=>({...NOZZLE_DEFAULTS,id:'N1',height:500,angle:20,...patch});
const plan=(patch={},s=settings,tank={})=>estimateTank({height:1000,...tank,seamClearance:s,nozzles:[n(patch)]});
const near=(a,b,epsilon=1e-7)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);

test('weld widths and toe-to-toe distance use actual outside-surface mm; root gap is not added twice',()=>{
  for(const [gap,width] of [[6,20],[6,2],[0,20]]){
    const r=plan({}, {...settings,longitudinalWidth:width},{gap}),a=r.nozzlePlan.items[0],h=a.seamCheck.profiles[0].longitudinal;
    const factor=Math.PI*r.od/r.circumference,expected=(a.unfoldX-a.holeWidth/2+gap/2)*factor-Math.max(gap,width)/2-settings.nozzleWeldReach;
    near(h.actualClearance,expected);near(h.clearance,expected-settings.workDistance);
    assert.equal(h.weldWidth,Math.max(gap,width));
  }
});

test('pad working-space conflict is found while both the opening and pad are geometrically clear',()=>{
  const r=plan({padOD:180},{...settings,workDistance:120}),p=r.nozzlePlan.items[0].seamCheck;
  assert.ok(!p.profiles[0].longitudinal.overlap);
  const pad=p.profiles[1].longitudinal;assert.equal(pad.geometryOverlap,false);assert.equal(pad.reason,'space');assert.ok(pad.shortfall>0);
  assert.match(seamAvoidanceMarkup(r,suggestShellSeamStart(r)),/補強板包絡施工淨距不足/);
  assert.match(r.nozzlePlan.items[0].warnings.join(' '),/施工預留區碰到/);
});

test('exact requested positive distance is accepted; one tenth of a millimetre below is deficient',()=>{
  const r=plan(),actual=r.nozzlePlan.items[0].seamCheck.profiles[0].longitudinal.actualClearance;
  assert.equal(plan({}, {...settings,workDistance:actual}).nozzlePlan.items[0].seamCheck.profiles[0].longitudinal.overlap,false);
  const h=plan({}, {...settings,workDistance:actual+.1}).nozzlePlan.items[0].seamCheck.profiles[0].longitudinal;
  assert.equal(h.overlap,true);near(h.shortfall,.1);
});

test('ring width and working space can conflict without the hole crossing; rotating never removes that conflict',()=>{
  const r=plan({height:900,angle:0},{...settings,workDistance:60},{height:2000}),h=r.nozzlePlan.items[0].seamCheck.profiles[0].circumferential;
  near(h.actualClearance,46);near(h.shortfall,14);assert.equal(h.reason,'space');
  const proposal=suggestShellSeamStart(r);assert.ok(proposal.improves);
  const revised=estimateTank({...r.input,seamStart:proposal.angle});assert.ok(revised.nozzlePlan.items[0].seamCheck.hits.some(h=>h.id==='C1'));
});

test('finite neighbouring-course seam measures to the weld end rather than claiming a nonexistent weld overlap',()=>{
  const r=plan({height:940,angle:180},{...settings,nozzleWeldReach:10,workDistance:40},{height:2000}),hit=r.nozzlePlan.items[0].seamCheck.hits.find(h=>h.id==='L2-1');
  assert.ok(hit);near(hit.actualClearance,19);assert.equal(hit.reason,'space');near(hit.shortfall,21);
});

test('every contacted seam is reported when a wide working zone covers multiple panels',()=>{
  const r=plan({angle:45},{...settings,workDistance:1000},{stockWidth:1219.2,stockLength:2438.4,shellLayout:'upright'});
  assert.equal(r.panelsPerCourse,4);assert.ok(r.nozzlePlan.items[0].seamCheck.hits.filter(h=>h.kind==='longitudinal').length>=2);
  assert.equal(suggestShellSeamStart(r).improves,false);
});

test('suggestion respects welds and work zones and leaves the fixed nozzle, BOM and purchasing unchanged',()=>{
  const r=plan({angle:90,height:743,od:400,thickness:6,padOD:500,flangeOD:600},settings,{height:3000,stockWidth:1219.2,stockLength:2438.4,shellLayout:'upright'}),proposal=suggestShellSeamStart(r);
  assert.ok(proposal.improves);assert.ok(proposal.clearance>0);
  const revised=estimateTank({...r.input,seamStart:proposal.angle});
  assert.ok(!revised.nozzlePlan.items[0].seamCheck.hits.length);assert.deepEqual(r.nozzlePlan.items[0].face,revised.nozzlePlan.items[0].face);
  assert.equal(r.plateSheets,revised.plateSheets);assert.equal(r.emptyWeight,revised.emptyWeight);assert.deepEqual(r.parts,revised.parts);
});

test('unfilled values remain unknown while explicit zero is a deliberate input, including legacy projects',()=>{
  const r=plan({},SEAM_CLEARANCE_DEFAULT);assert.equal(seamClearancePending(r).length,3);
  assert.equal(seamClearancePending(plan({},{...settings,workDistance:0})).length,0);
  for(const version of [1,7]){const input={...r.input};delete input.seamClearance;assert.deepEqual(readTankProject(JSON.stringify({type:'special-method-tank',version,input})).seamClearance,SEAM_CLEARANCE_DEFAULT);}
  const json=tankProject(plan().input);assert.equal(JSON.parse(json).version,9);assert.deepEqual(readTankProject(json).seamClearance,settings);
});

test('invalid distances stay editable, suppress suggestions and block saving imports and construction exports',()=>{
  for(const value of [-1,Infinity,true,{},'bad',10001]){
    const raw={...settings,workDistance:value};assert.equal(normalizeSeamClearance(raw).valid,false);
    const r=plan({},raw);assert.equal(r.valid,true);assert.equal(r.seamClearance.valid,false);assert.equal(suggestShellSeamStart(r),null);
    assert.throws(()=>tankWorkOrder(r),/施工|距離|淨距/);assert.throws(()=>shellWorkOrder(r),/施工|距離|淨距/);
    if(Number.isFinite(value)||typeof value!=='number')assert.throws(()=>readTankProject(tankProject(r.input)),/施工|距離|淨距/);
  }
});

test('2D, actual Three.js meshes and print/CSV share the weld identifiers, width and zone dimensions',()=>{
  const r=plan({padOD:180},{...settings,workDistance:120}),model=shellSeamDisplayModel(r),group=new THREE.Group();addShellSeamOverlays(r,THREE,group);
  const band=model.bands.find(b=>b.id==='L1-1'),mesh=group.children.find(m=>m.isMesh&&m.userData.weldId===band.id);
  near(mesh.geometry.parameters.thetaLength*r.od/2,band.width);near(mesh.position.y,r.frame.bodyBottom+band.z+band.length/2);
  assert.ok(group.children.some(o=>o.isLine&&o.userData.nozzleId==='N1'));assert.ok(!Array.from(group.children.flatMap(o=>Array.from(o.geometry.attributes.position.array))).some(Number.isNaN));
  for(const line of group.children.filter(o=>o.isLine)){const p=line.geometry.attributes.position;for(let i=1;i<p.count;i++){const x=(p.getX(i)+p.getX(i-1))/2,z=(p.getZ(i)+p.getZ(i-1))/2;assert.ok(Math.hypot(x,z)>r.od/2,'working-zone chords must remain outside the steel');}}
  assert.match(assemblySketch(r),/data-seam-band="L1-1"/);assert.match(assemblySketch(r),/data-seam-zone="N1-pad"/);
  for(const text of [tankWorkOrder(r),shellWorkOrder(r),tankCSV(r)]){assert.match(text,/焊趾/);assert.match(text,/施工/);assert.match(text,/L1-1/);assert.match(text,/120/);}
  const ga=tankGeneralArrangement(plan({},settings,{shape:'custom',orientation:'horizontal',top:'elliptical',bottom:'elliptical',height:1500}));assert.match(ga,/data-seam-zone="N1-opening"/);assert.match(ga,/焊趾淨距 100/);
  const changed=plan({padOD:180},{...settings,workDistance:121});assert.notEqual(tankDrawingModel(r).revision,tankDrawingModel(changed).revision);
  for(const child of group.children){child.geometry.dispose();child.material.dispose();}
});
