import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_PARAMS} from '../dist/assets/joint-model.js';
import {DEFAULT_ELBOW_PARAMS,computeElbowJoint} from '../dist/assets/elbow-geometry.js';
import {elbowAlignmentReference} from '../dist/assets/elbow-axis.js';
import {projectJSON,readProjectJSON,validateProjectParams,buildFieldWorkOrderHTML,createBranchCuttingWrap} from '../dist/assets/exports.js';
import {normalizeFavoriteParams,favoriteIdentity,favoriteSummary} from '../dist/assets/workflow-state.js';
import {geometryRecordKey,emptyFabricationPlan,reconcileFitRecords} from '../dist/assets/fabrication-plan.js';
import {positioningFrame,positionFromSurfacePoint,directionFromWorldVector} from '../dist/assets/model-positioning.js';
import {modelPointReadback} from '../dist/assets/model-view.js';

const base={...DEFAULT_PARAMS,hostType:'elbow',mainOD:219.1,mainWall:6,
  branchOD:60.3,branchWall:3.91,branchLength:200,bendRadius:304.8,bendAngle:90,
  padEnabled:false,motherOpening:true,jointType:'on',rootGap:0,holeGap:.5,
  samples:72,tolerance:1,autoPrecision:false};
const modes=['a-offset','b-offset','a-edge','b-edge'];
const candidate=mode=>({...base,elbowAlignment:mode,elbowOffset:mode.endsWith('-edge')?-1:20,elbowSideOffset:mode.endsWith('-edge')?0:15});
const near=(actual,expected,tolerance=1e-7)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} ≠ ${expected}`);
const valid=params=>{const result=computeElbowJoint(params);assert.equal(result.valid,true,JSON.stringify(result.errors));assert.equal(result.manufacturingReady,true);return result;};

test('complete application and elbow defaults expose both end-plane offset parameters',()=>{
  for(const defaults of [DEFAULT_PARAMS,DEFAULT_ELBOW_PARAMS]){
    assert.equal(defaults.elbowOffset,0);assert.equal(defaults.elbowSideOffset,0);
  }
});

test('all offset and flush choices retain signed parameters through project save/load and exact recomputation',()=>{
  for(const mode of modes){
    const result=valid(candidate(mode)),restored=readProjectJSON(projectJSON(result.params,{title:mode}));
    assert.equal(restored.params.elbowAlignment,mode);
    assert.equal(restored.params.elbowOffset,result.params.elbowOffset);
    assert.equal(restored.params.elbowSideOffset,result.params.elbowSideOffset);
    const again=valid(restored.params);
    assert.deepEqual(again.geometry.branch.outerCut,result.geometry.branch.outerCut);
    assert.deepEqual(again.geometry.axes.reference,result.geometry.axes.reference);
  }
});

test('old coaxial projects load without requiring new optional parameters',()=>{
  const legacy={...base,elbowAlignment:'b-axis'};delete legacy.elbowOffset;delete legacy.elbowSideOffset;
  const restored=readProjectJSON(projectJSON(legacy)).params,result=valid(restored);
  assert.equal(result.params.elbowOffset,0);assert.equal(result.params.elbowSideOffset,0);
  assert.deepEqual(result.geometry.axes.reference.origin,result.geometry.axes.reference.center);
});

test('project schemas reject invalid new fields rather than dropping or coercing them',()=>{
  for(const patch of [{elbowOffset:'20'},{elbowSideOffset:Infinity},{elbowAlignment:'b-parallel'}])
    assert.throws(()=>validateProjectParams({...base,...patch}));
  assert.throws(()=>normalizeFavoriteParams({...base,elbowAlignment:'b-parallel'}),/定位方式/);
});

test('favorites preserve two signed offset dimensions and resolve derived coordinates before comparison',()=>{
  const p=candidate('b-offset'),normalized=normalizeFavoriteParams(p);
  assert.equal(normalized.elbowOffset,20);assert.equal(normalized.elbowSideOffset,15);
  assert.equal(favoriteIdentity({...p,bendPosition:15,surfaceClock:120,angle:90,branchSwivel:30}),favoriteIdentity(p));
  assert.notEqual(favoriteIdentity(p),favoriteIdentity({...p,elbowSideOffset:-15}));
  assert.notEqual(favoriteIdentity(p),favoriteIdentity({...p,elbowAlignment:'b-axis'}));
  assert.match(favoriteSummary(p),/B 端平行偏移/);assert.doesNotMatch(favoriteSummary(p),/A端同軸|B端同軸/);
  assert.match(favoriteSummary(candidate('a-edge')),/A 端同側外輪廓齊線/);
});

test('changing either end-plane offset invalidates previous measured fit-up records even with stale derived fields',()=>{
  const p=candidate('b-offset'),plan={...emptyFabricationPlan(),preGaps:[1,1,1,1],inspectionKey:geometryRecordKey(p)};
  for(const field of ['elbowOffset','elbowSideOffset']){
    const changed={...p,[field]:p[field]+1};
    assert.notEqual(geometryRecordKey(changed),geometryRecordKey(p));
    const checked=reconcileFitRecords(plan,changed);assert.equal(checked.cleared,true);
    assert.deepEqual(checked.plan.preGaps,[null,null,null,null]);
  }
});

test('new constrained modes expose model frames and preserve the port-parallel direction while rejecting free gestures',()=>{
  for(const mode of modes){
    const p=candidate(mode),frame=positioningFrame(p),ref=elbowAlignmentReference(p);
    assert.ok(frame,mode);for(let i=0;i<3;i++)near(frame.direction[i],ref.direction[i]);
    const readback=modelPointReadback(p);assert.ok(readback);
    assert.match(readback.angle,new RegExp(`${mode[0].toUpperCase()} 端${mode.endsWith('-edge')?'同側外輪廓齊線':'平行偏移'}`));
    assert.equal(positionFromSurfacePoint(p,frame.origin),null);
    assert.equal(directionFromWorldVector(p,[1,0,0]),null);
  }
});

test('field work orders and wrap notes name the actual end and perpendicular offset basis',()=>{
  const offset=valid(candidate('b-offset')),html=buildFieldWorkOrderHTML(offset,{id:'OFFSET-B'});
  assert.match(html,/B 端平行偏移/);assert.match(html,/相對 B 管口中心線的垂直偏移 25 mm/);
  assert.match(html,/外背為正、側向 \+Z 為正/);assert.doesNotMatch(html,/B端同軸延伸|A端同軸延伸/);
  const wrap=createBranchCuttingWrap(offset,{stationCount:12});
  assert.ok(wrap.notes.some(note=>/B 端平行偏移/.test(note)));
  assert.ok(!wrap.notes.some(note=>/中心線與支管軸線重合/.test(note)));
  const edge=valid(candidate('a-edge')),edgeHTML=buildFieldWorkOrderHTML(edge,{id:'FLUSH-A'});
  assert.match(edgeHTML,/A 端同側外輪廓齊線/);assert.match(edgeHTML,/垂直偏移 79\.4 mm/);
  assert.match(edgeHTML,/方向輸入不另增加偏移距離/);
});

test('formed reinforcement plate bores retain the same shifted branch axis',()=>{
  const result=valid({...candidate('b-offset'),padEnabled:true,padMargin:20,padThickness:6,padShape:'obround'});
  const pad=result.geometry.pad;assert.ok(pad);
  assert.deepEqual(pad.source.joint.geometry.axes.branchOrigin,result.geometry.axes.branchOrigin);
  assert.deepEqual(pad.source.joint.geometry.axes.branchDirection,result.geometry.axes.branchDirection);
  assert.equal(pad.source.joint.params.elbowOffset,20);assert.equal(pad.source.joint.params.elbowSideOffset,15);
  assert.ok(result.verification.some(check=>check.id==='formed-pad-chord'));
});

test('unreachable shifted axes keep entered offsets, reject output and identify a repairable offset field',()=>{
  for(const patch of [{elbowOffset:2000,elbowSideOffset:15},{elbowOffset:20,elbowSideOffset:2000}]){
    const p={...candidate('b-offset'),...patch},result=computeElbowJoint(p);
    assert.equal(result.valid,false);assert.equal(result.geometry,null);assert.deepEqual(result.templates,[]);
    assert.equal(result.params.elbowOffset,p.elbowOffset);assert.equal(result.params.elbowSideOffset,p.elbowSideOffset);
    assert.ok(result.errors.some(error=>error.field==='elbowOffset'&&/外壁交點/.test(error.message)));
    assert.equal(positioningFrame(p),null);
    assert.throws(()=>createBranchCuttingWrap(result));
  }
});
