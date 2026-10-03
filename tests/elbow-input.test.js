import test from 'node:test';
import assert from 'node:assert/strict';
import {nominalElbowRadius,bendPositionFromBack,elbowEntryDimensions} from '../dist/assets/elbow-input.js';
import {setupFromParams,positionWithIntent} from '../dist/assets/input-setup.js';
import {geometryRecordKey,emptyFabricationPlan,reconcileFitRecords,fabricationCSV} from '../dist/assets/fabrication-plan.js';
import {DEFAULT_PARAMS,computeJoint,computeExactStationTable} from '../dist/assets/joint-model.js';
const p={...DEFAULT_PARAMS,hostType:'elbow',mainOD:219.1,branchOD:114.3,angle:90,padEnabled:false,bendRadius:304.8,bendAngle:90,bendPosition:45};
test('90 degree LR/SR use tabulated small-size exceptions and never fabricate 45 degree radius',()=>{
 assert.equal(nominalElbowRadius('1/2','lr'),38.1);assert.equal(nominalElbowRadius('3/4','lr'),38.1);
 assert.equal(nominalElbowRadius('1/2','sr'),null);assert.equal(nominalElbowRadius('8','lr'),304.8);assert.equal(nominalElbowRadius('8','sr'),203.2);
 assert.equal(nominalElbowRadius('8','lr',45),null);assert.equal(nominalElbowRadius('custom','lr'),null);
});
test('field back-spine distance is not centreline arc length; physical input roundtrips',()=>{
 const d=elbowEntryDimensions(p);assert.ok(Math.abs(d.back-325.4297290012352)<1e-6);
 assert.ok(Math.abs(bendPositionFromBack(d.back,p)-45)<1e-12);
 assert.ok(Math.abs(d.back-p.bendRadius*Math.PI/4)>80);
 assert.equal(elbowEntryDimensions({...p,surfaceClock:360}).around,0);
});
test('changing an elbow bend preserves centre intent and leaves straight virtual coordinates unchanged',()=>{
 const setup=setupFromParams(p);assert.equal(setup.radiusMode,'lr');assert.equal(setup.bendPositionMode,'center');
 const next=positionWithIntent({...p,bendAngle:45},setup);assert.equal(next.bendPosition,22.5);assert.equal(next.jointPosition,p.jointPosition);
 const custom=setupFromParams(p,{bendPositionMode:'custom',radiusMode:'custom'});assert.equal(custom.radiusMode,'custom');assert.ok(Math.abs(positionWithIntent({...p,bendAngle:45},custom).bendPosition-45)<1e-12);
 const resized=positionWithIntent({...p,bendRadius:330},custom);assert.ok(Math.abs(elbowEntryDimensions(resized).back-custom.bendBackDistance)<1e-10);
});
test('each elbow geometry control invalidates measured fit records while numerical sampling does not',()=>{
 const f={...emptyFabricationPlan(),inspectionKey:geometryRecordKey(p),preGaps:[1,null,null,null]};
 for(const [key,v]of Object.entries({bendRadius:305,bendAngle:91,bendPosition:46,surfaceClock:90,branchSwivel:2,hostType:'straight'}))assert.equal(reconcileFitRecords(f,{...p,[key]:v}).cleared,true,key);
 assert.equal(reconcileFitRecords(f,{...p,samples:720}).cleared,false);
});
test('elbow fabrication CSV records intended stock without manufacturing a rough depth',()=>{
 const r=computeJoint(p);assert.equal(r.valid,true);const rows=computeExactStationTable(r,4),f={...emptyFabricationPlan(),stock:7};
 const csv=fabricationCSV(f,rows,{roughCutSupported:false});assert.match(csv,/未提供全壁厚粗切包絡/);
 for(const line of csv.split('\r\n').filter(q=>/^"(0|90|180|270)",/.test(q)))assert.equal(line.split(',')[3],'""');
});
