import test from 'node:test';
import assert from 'node:assert/strict';
import {NOZZLE_DEFAULTS} from '../dist/assets/tank-nozzles.js';
import {useNozzleFlangeReference,nozzleFlangeState} from '../dist/assets/tank-flange-actions.js';
import {changeNozzleBuilderSize,canFollowNozzleFlange,defaultFollowNozzleFlange,nozzleBuilderSummary} from '../dist/assets/tank-nozzle-builder.js';
import {estimateTank} from '../dist/assets/tank-materials.js';
import {tankProject,readTankProject,tankCSV,tankWorkOrder} from '../dist/assets/tank-exports.js';
import {nozzleTaskForField,nozzleDiagramForField} from '../dist/assets/tank-nozzle-workspace.js';
const nozzle=()=>useNozzleFlangeReference({...NOZZLE_DEFAULTS,id:'N1',name:'進料',od:60.3,thickness:3.91,flangeSize:'2',flangeClass:'150',flangeFacing:'RF'});

test('a linked pipe choice updates nominal flange dimensions while preserving the placed face and user wall thickness',()=>{
  const n=nozzle(),before=structuredClone(n),next=changeNozzleBuilderSize(n,'4',{followFlange:true});assert.equal(defaultFollowNozzleFlange(n),true);assert.equal(next.od,114.3);assert.equal(next.thickness,3.91);assert.equal(next.flangeSize,'4');assert.equal(next.flangeClass,'150');assert.equal(nozzleFlangeState(next).applied,true);assert.notEqual(next.flangeOD,n.flangeOD);assert.deepEqual(n,before);
  const a=estimateTank({nozzles:[n]}).nozzlePlan.items[0],b=estimateTank({nozzles:[next]}).nozzlePlan.items[0];assert.deepEqual(a.surface,b.surface);assert.deepEqual(a.face,b.face);assert.notEqual(a.blankLength,b.blankLength);assert.ok(b.blankLength>0);assert.ok(b.blankWeight>a.blankWeight);
});

test('measured fittings stay measured unless following a reference was explicitly selected',()=>{
  const n={...nozzle(),flangeSource:'manual',flangeLength:91.2,flangeOD:333,flangeThickness:27,flangeWeight:6.5};assert.equal(defaultFollowNozzleFlange(n),false);
  const next=changeNozzleBuilderSize(n,'3');assert.equal(next.od,88.9);for(const key of ['flangeSource','flangeSize','flangeLength','flangeOD','flangeThickness','flangeWeight','projection'])assert.equal(next[key],n[key]);
  const adopted=changeNozzleBuilderSize(n,'3',{followFlange:true});assert.equal(adopted.flangeSize,'3');assert.equal(adopted.flangeSource,'texas-v1');assert.equal(adopted.flangeWeight,0);
});

test('an unsupported class retains supplied dimensions and cannot become a different reference rating',()=>{
  const n={...nozzle(),flangeClass:'600'},next=changeNozzleBuilderSize(n,'3',{followFlange:true});assert.equal(next.flangeClass,'600');assert.equal(next.flangeSize,'3');assert.equal(next.flangeLength,n.flangeLength);assert.equal(nozzleFlangeState(next).stale,true);
});

test('bare pipes and integral necks do not acquire a WN flange when their pipe size is chosen',()=>{
  for(const n of [{...nozzle(),end:'bare'},{...nozzle(),construction:'integral',flangeSource:'manual',flangeLength:235}]){assert.equal(canFollowNozzleFlange(n),false);const next=changeNozzleBuilderSize(n,'3',{followFlange:true});for(const key of ['end','construction','flangeSize','flangeLength','flangeOD','flangeThickness','flangeSource'])assert.equal(next[key],n[key]);}
});

test('a completed basic edit is the same saved nozzle used by material and work-order calculations',()=>{
  const n={...changeNozzleBuilderSize(nozzle(),'3',{followFlange:true}),projection:250,inside:30},r=estimateTank({nozzles:[n]}),restored=estimateTank(readTankProject(tankProject(r.input)));
  assert.ok(r.nozzlePlan.valid);assert.deepEqual(restored.nozzlePlan.items,r.nozzlePlan.items);assert.equal(r.nozzlePlan.count,1);assert.equal(r.nozzlePlan.flangeCount,1);assert.match(tankCSV(r),/NPS 3/);assert.match(tankWorkOrder(r),/250/);assert.match(nozzleBuilderSummary(n,r).full,/88.9/);assert.match(nozzleBuilderSummary(n,r).full,/外伸 250 mm/);
});

test('basic recovery stays in the combined builder while measured flange details retain their dedicated page',()=>{
  for(const key of ['height','angle','od','thickness','projection','inside','end','flangeSize','flangeClass'])assert.equal(nozzleTaskForField(key),'position');
  for(const key of ['flangeLength','flangeOD','flangeThickness','weldGap'])assert.equal(nozzleTaskForField(key),'flange');
  for(const key of ['od','thickness','projection','inside','flangeSize'])assert.equal(nozzleDiagramForField(key),'section');for(const key of ['height','angle','offset'])assert.equal(nozzleDiagramForField(key),'position');
});
