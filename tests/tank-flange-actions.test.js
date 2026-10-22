import test from 'node:test';
import assert from 'node:assert/strict';
import {NOZZLE_DEFAULTS} from '../dist/assets/tank-nozzles.js';
import {estimateTank} from '../dist/assets/tank-materials.js';
import {tankProject,readTankProject,tankWorkOrder,tankCSV} from '../dist/assets/tank-exports.js';
import {pipeSizeForOD,flangeSizeForPipe,chooseNozzlePipeSize,useNozzleFlangeReference,changeNozzleFlange,nozzleFlangeState} from '../dist/assets/tank-flange-actions.js';
import {nozzleTaskForField} from '../dist/assets/tank-nozzle-workspace.js';
import {flangeMeasurementSketch} from '../dist/assets/tank-nozzle-visuals.js';

const nozzle=(changes={})=>({...NOZZLE_DEFAULTS,id:'N1',name:'進料',od:60.3,flangeSize:'2',flangeClass:'150',flangeFacing:'RF',...changes});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('an explicitly adopted flange reference follows Class and WN/SO changes, with one deduction and no movement of the face',()=>{
  const original=useNozzleFlangeReference(nozzle()),higher=changeNozzleFlange(original,'flangeClass','300'),so=changeNozzleFlange(higher,'end','so');
  near(higher.flangeLength,(2.69+1/16)*25.4);near(so.flangeLength,(1.25+1/16)*25.4);
  const a=estimateTank({nozzles:[original]}).nozzlePlan.items[0],b=estimateTank({nozzles:[higher]}).nozzlePlan.items[0],c=estimateTank({nozzles:[so]}).nozzlePlan.items[0];
  near(a.minCutLength-b.minCutLength,6.35);near(c.minCutLength,206);assert.deepEqual(a.face,b.face);assert.deepEqual(a.face,c.face);
  assert.equal(nozzleFlangeState(higher).applied,true);assert.equal(nozzleFlangeState(so).deduction,0);
});
test('custom measured sizes are retained when choosing another nominal specification or fitting type',()=>{
  const n=nozzle({od:16,flangeLength:48.5,flangeOD:152,flangeThickness:18,flangeWeight:3.8}),before=structuredClone(n);
  for(const [key,value] of [['flangeClass','300'],['flangeSize','4'],['end','so']]){const changed=changeNozzleFlange(n,key,value);for(const dimension of ['flangeLength','flangeOD','flangeThickness','flangeWeight','od','thickness','projection'])assert.equal(changed[dimension],n[dimension]);assert.equal(changed.flangeSource,'manual');}
  assert.deepEqual(n,before);
});
test('reference refresh retains a known mass for identical geometry and clears it only when dimensions change',()=>{
  const n={...useNozzleFlangeReference(nozzle()),flangeWeight:4.7};assert.equal(useNozzleFlangeReference(n).flangeWeight,4.7);
  assert.equal(changeNozzleFlange(n,'flangeClass','150').flangeWeight,4.7);assert.equal(changeNozzleFlange(n,'flangeClass','300').flangeWeight,0);assert.equal(n.flangeWeight,4.7);
});
test('unsupported Class, face or size keeps the previous dimensions visibly stale, without substituting a different reference',()=>{
  const n=useNozzleFlangeReference(nozzle());
  for(const [key,value] of [['flangeClass','600'],['flangeFacing','RTJ'],['flangeSize','14']]){const changed=changeNozzleFlange(n,key,value),state=nozzleFlangeState(changed);assert.equal(state.reference,null);assert.equal(state.applied,false);assert.equal(state.stale,true);assert.equal(changed.flangeLength,n.flangeLength);assert.equal(useNozzleFlangeReference(changed),null);}
});
test('manual dimension edits revoke reference provenance while retaining unrelated measured dimensions',()=>{
  const n=useNozzleFlangeReference(nozzle({projection:300,inside:25,allowance:14})),changed=changeNozzleFlange(n,'flangeLength','91.2');assert.equal(changed.flangeSource,'manual');assert.equal(changed.flangeOD,n.flangeOD);assert.equal(changed.projection,300);assert.equal(changed.inside,25);assert.equal(changed.allowance,14);
  const next=changeNozzleFlange(changed,'flangeClass','300');assert.equal(next.flangeLength,'91.2');assert.equal(nozzleFlangeState(next).applied,false);
});
test('pipe nominal shortcuts change OD alone and never snap a custom OD or infer pipe wall thickness',()=>{
  const n=nozzle({od:16,thickness:2.5,flangeSize:'4',flangeLength:81}),chosen=chooseNozzlePipeSize(n,'1-1/2');near(chosen.od,48.3);assert.equal(chosen.thickness,2.5);assert.equal(chosen.flangeSize,'4');assert.equal(chosen.flangeLength,81);
  assert.equal(pipeSizeForOD(16),null);assert.equal(pipeSizeForOD(''),null);assert.equal(pipeSizeForOD(60),null);assert.equal(flangeSizeForPipe(48.3),'1 1/2');assert.equal(flangeSizeForPipe(168.3),'6');assert.deepEqual(chooseNozzlePipeSize(n,'custom'),n);
});
test('pipe-to-flange nominal mismatch is explicit and no matching action silently runs during a reference selection',()=>{
  const n=useNozzleFlangeReference(nozzle({od:16})),state=nozzleFlangeState(n);assert.equal(state.mismatch,true);near(state.pipe.odMm,60.3);assert.equal(n.od,16);
  assert.equal(nozzleFlangeState({...n,od:60.3}).mismatch,false);
});
test('empty weld gap or SO setback is unknown rather than zero in the live deduction readback',()=>{
  assert.ok(Number.isNaN(nozzleFlangeState(nozzle({weldGap:''})).deduction));assert.ok(Number.isNaN(nozzleFlangeState(nozzle({end:'so',soSetback:' '})).deduction));assert.equal(nozzleFlangeState(nozzle({end:'so',soSetback:0})).deduction,0);
});
test('field recovery opens the appropriate short task, keeping shared projection accessible from the flange diagram',()=>{
  for(const key of ['height','angle','radius','host'])assert.equal(nozzleTaskForField(key,'flange'),'position');
  for(const key of ['od','thickness'])assert.equal(nozzleTaskForField(key,'flange'),'position');
  for(const key of ['holeGap','padOD','coverThickness'])assert.equal(nozzleTaskForField(key,'flange'),'pipe');
  for(const key of ['flangeOD','flangeLength','weldGap','soSetback'])assert.equal(nozzleTaskForField(key,'position'),'flange');
  for(const key of ['flangeSize','flangeClass','flangeFacing'])assert.equal(nozzleTaskForField(key,'position'),'position');
  assert.equal(nozzleTaskForField('projection','flange'),'flange');assert.equal(nozzleTaskForField('inside','position'),'position');
});
test('reference changes and custom measurements survive JSON and retain source and correct dimensions in reports',()=>{
  const ref=changeNozzleFlange(useNozzleFlangeReference(nozzle()),'flangeClass','300'),custom=nozzle({id:'N2',od:16,flangeSize:'',flangeClass:'',flangeFacing:'',flangeLength:48.5,height:1000,angle:225});
  const r=estimateTank({nozzles:[ref,custom]}),loaded=readTankProject(tankProject(r.input));assert.equal(loaded.nozzles[0].flangeClass,'300');near(loaded.nozzles[1].flangeLength,48.5);near(loaded.nozzles[1].od,16);assert.match(tankWorkOrder(r),/Class 300/);assert.match(tankCSV(r),/Texas Flange/);
});
test('the editable section diagram accepts input strings and keeps blank dimensions visibly unknown',()=>{
  const svg=flangeMeasurementSketch(nozzle({projection:'210',flangeLength:'63.5635',flangeOD:'152.4',weldGap:'2'}),{interactive:true});assert.match(svg,/外伸 A 210 mm/);assert.match(svg,/L 63.56 mm/);assert.match(svg,/D 152.4/);
  const blank=flangeMeasurementSketch(nozzle({weldGap:''}));assert.match(blank,/間隙 g — mm/);assert.doesNotMatch(blank,/間隙 g 0 mm/);
});
