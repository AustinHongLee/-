import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateTank} from '../dist/assets/tank-materials.js';
import {NOZZLE_DEFAULTS} from '../dist/assets/tank-nozzles.js';
import {checkShellSeams,suggestShellSeamStart} from '../dist/assets/tank-seam-clearance.js';
import {tankDrawingModel} from '../dist/assets/tank-drawing-model.js';
import {tankWorkOrder,tankProject,readTankProject} from '../dist/assets/tank-exports.js';
import {seamAvoidanceMarkup,seamLayoutSuggestion} from '../dist/assets/tank-seam-ui.js';
import {shellWorkOrder} from '../dist/assets/tank-shell-report.js';
import {assemblySketch} from '../dist/assets/tank-visuals.js';
const nozzle=(patch={})=>({...NOZZLE_DEFAULTS,id:'N1',angle:0,...patch});
const plan=(patch={},input={})=>estimateTank({...input,nozzles:[nozzle(patch)]});

test('opening crossing a course boundary also checks the adjacent staggered longitudinal seam',()=>{
  const r=plan({height:990,angle:180}),n=r.nozzlePlan.items[0];
  assert.equal(r.courses,2);assert.equal(r.courseHeight,1000);
  assert.ok(n.seamCheck.hits.some(h=>h.id==='L2-1'));
  assert.ok(n.seamCheck.hits.some(h=>h.id==='C1'));
  assert.match(n.warnings.join(' '),/縱縫 L2-1/);
  assert.match(assemblySketch(r),/data-seam-conflict="L2-1"/);
  assert.match(shellWorkOrder(r),/管嘴與接縫施工距離/);
  assert.match(shellWorkOrder(r),/L2-1/);
  assert.ok(!plan({height:900,angle:180}).nozzlePlan.items[0].seamCheck.hits.some(h=>h.kind==='longitudinal'));
});

test('pad-only crossing is checked in adjacent courses even when the opening is clear of the ring seam',()=>{
  const n=plan({height:940,angle:180,padOD:240}).nozzlePlan.items[0];
  assert.ok(!n.seamCheck.hits.some(h=>h.envelope==='opening'));
  assert.ok(n.seamCheck.hits.some(h=>h.envelope==='pad'&&h.id==='L2-1'));
  assert.match(n.warnings.join(' '),/補強板碰到筒身縱縫 L2-1/);
});

test('seam identities and angles match the shared drawing / 3D model, including root-gap edges at the wrap',()=>{
  const r=plan({angle:359.9},{gap:4}),n=r.nozzlePlan.items[0],hit=n.seamCheck.hits.find(h=>h.kind==='longitudinal');
  const w=tankDrawingModel(r).welds.find(w=>w.id===hit.id);
  assert.ok(w);assert.equal(hit.a,w.a);assert.equal(hit.b,w.b);assert.ok(Math.abs(hit.angle-w.angle)<1e-8);
  const profile=n.seamCheck.profiles[0];assert.equal(profile.longitudinal.clearance,profile.longitudinal.edgeDistance-2);
});

test('suggestion rotates only the seam layout, preserves nozzle geometry and purchasing, and survives project save',()=>{
  const r=plan({angle:90,od:400,thickness:6,flangeOD:500,height:743},{height:3000,stockWidth:1219.2,stockLength:2438.4,shellLayout:'upright'}),proposal=suggestShellSeamStart(r);
  assert.equal(r.panelsPerCourse,4);assert.ok(proposal.improves);assert.ok(proposal.clearance>200);
  const revised=estimateTank({...r.input,seamStart:proposal.angle}),a=r.nozzlePlan.items[0],b=revised.nozzlePlan.items[0];
  assert.ok(!b.seamCheck.hits.length);assert.deepEqual(a.face,b.face);assert.equal(a.height,b.height);assert.equal(a.angle,b.angle);
  assert.equal(r.plateSheets,revised.plateSheets);assert.equal(r.stockWeight,revised.stockWeight);assert.equal(r.netWeight,revised.netWeight);
  assert.deepEqual(r.parts,revised.parts);assert.equal(readTankProject(tankProject(revised.input)).seamStart,proposal.angle);
  assert.notDeepEqual(tankDrawingModel(r).plates.map(p=>p.anchor),tankDrawingModel(revised).plates.map(p=>p.anchor));
});

test('rotation never claims to resolve a ring-seam conflict, and the same weld ID is printed',()=>{
  const r=plan({angle:0,height:1000}),proposal=suggestShellSeamStart(r);
  assert.ok(proposal.improves);
  const revised=estimateTank({...r.input,seamStart:proposal.angle});
  assert.ok(revised.nozzlePlan.items[0].seamCheck.hits.some(h=>h.id==='C1'));
  assert.match(seamAvoidanceMarkup(revised,suggestShellSeamStart(revised)),/轉起縫角不會移走環縫/);
  assert.match(tankWorkOrder(revised),/環縫 C1/);
});

test('incompatible fixed nozzles do not receive a claim that all longitudinal seams can be avoided',()=>{
  const r=estimateTank({height:1000,stockWidth:1219.2,stockLength:2438.4,shellLayout:'upright',nozzles:[nozzle({od:600,thickness:6,angle:0,height:500,flangeOD:700}),nozzle({id:'N2',od:600,thickness:6,angle:45,height:500,flangeOD:700})]});
  const proposal=suggestShellSeamStart(r);assert.ok(proposal);assert.equal(proposal.improves,false);assert.ok(proposal.clearance<0);
  assert.match(seamAvoidanceMarkup(r,proposal),/無法同時滿足所有管嘴與補強板的焊道及施工距離/);
});

test('no suggestion is produced from incomplete nozzle geometry or from a tank without shell nozzles',()=>{
  assert.equal(suggestShellSeamStart(plan({thickness:100})),null);
  assert.equal(suggestShellSeamStart(estimateTank({})),null);
  assert.equal(checkShellSeams(estimateTank({}),{host:'top'}),null);
  assert.match(seamAvoidanceMarkup(plan({thickness:100}),null),/結果尚未完整/);
});

test('automatic proposal is withheld when the shared starting angle would create a new end-nozzle crossing',()=>{
  const r=estimateTank({shape:'custom',orientation:'vertical',top:'cone',bottom:'flat',topSmall:0,nozzles:[nozzle(),nozzle({id:'N2',host:'top',angle:180,radius:200})]});
  assert.equal(r.nozzlePlan.valid,true);
  assert.equal(suggestShellSeamStart(r).improves,true);
  const proposal=seamLayoutSuggestion(r);assert.equal(proposal.improves,false);assert.deepEqual(proposal.blockedByEnd,['N2']);
  assert.match(seamAvoidanceMarkup(r,proposal),/先保留目前配置/);
});
