import test from 'node:test';
import assert from 'node:assert/strict';
import {positionFromSurfacePoint,positioningFrame,directionFromWorldVector,hostEndFrames} from '../dist/assets/model-positioning.js';
import {DEFAULT_PARAMS,computeJoint,rotateAroundMain} from '../dist/assets/geometry.js';
import {DEFAULT_ELBOW_PARAMS,computeElbowJoint} from '../dist/assets/elbow-geometry.js';
import {DEFAULT_CONICAL_PARAMS,computeConicalJoint} from '../dist/assets/conical-geometry.js';
import {mainAxisSurfaceDatum,jointPositionForSurface} from '../dist/assets/field-datums.js';

const RAD=Math.PI/180,near=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
const vectorNear=(a,b,eps=1e-9)=>a.forEach((v,i)=>near(v,b[i],eps));
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const unit=v=>v.map(a=>a/Math.hypot(...v));
const straight={...DEFAULT_PARAMS,hostType:'straight',mainLength:1500,branchOD:60.3,padEnabled:false,samples:72,tolerance:1,autoPrecision:false};
const elbow={...DEFAULT_ELBOW_PARAMS,branchOD:60.3,padEnabled:false,samples:72,tolerance:1,autoPrecision:false};
const cone={...DEFAULT_CONICAL_PARAMS,mainLength:800,jointPosition:400,samples:72,tolerance:1,autoPrecision:false};

test('straight surface hits preserve signed eccentricity and compensate azimuth at the actual entry',()=>{
  for(const offset of [-30,0,30])for(const angle of [20,52,90,128,160])for(const clock of [0,35,90,179,270,359]){
    const p={...straight,offset,angle},point=[650,100*Math.sin(clock*RAD),100*Math.cos(clock*RAD)];
    const patch=positionFromSurfacePoint(p,point);assert.ok(patch);
    assert.equal(patch.offset,undefined);
    const next={...p,...patch},f=positioningFrame(next);assert.ok(f);vectorNear(f.origin,point);
    near(mainAxisSurfaceDatum(next).axialPosition,650);
    near(dot(f.normal,f.direction),Math.sin(angle*RAD)*Math.sqrt(10000-offset*offset)/100);
  }
});

test('an approximate cylinder mesh hit projects to the true OD without changing the picked axial position',()=>{
  const clock=31*RAD,point=[500,99.7*Math.sin(clock),99.7*Math.cos(clock)];
  const p={...straight,offset:20},patch=positionFromSurfacePoint(p,point),f=positioningFrame({...p,...patch});
  near(f.origin[0],500);near(Math.hypot(f.origin[1],f.origin[2]),100);
  near(Math.atan2(f.origin[1],f.origin[2]),clock);
});

test('elbow hits recover bend position and the kernel positive Z clock without clipping finite ends',()=>{
  for(const bendPosition of [20,45,70])for(const clock of [0,45,90,180,270,359]){
    const b=bendPosition*RAD,phi=clock*RAD,Rc=elbow.bendRadius,r=elbow.mainOD/2;
    const point=[(Rc+r*Math.cos(phi))*Math.sin(b),Rc-(Rc+r*Math.cos(phi))*Math.cos(b),r*Math.sin(phi)];
    const patch=positionFromSurfacePoint(elbow,point);near(patch.bendPosition,bendPosition);
    const f=positioningFrame({...elbow,...patch});vectorNear(f.origin,point);
    near(f.normal[2],Math.sin(phi));near(Math.hypot(...f.side),1);
  }
  const R=elbow.bendRadius,r=100;
  assert.equal(positionFromSurfacePoint(elbow,[0,-r,0]),null);
  assert.equal(positionFromSurfacePoint(elbow,[R+r,R,0]),null);
  assert.equal(positionFromSurfacePoint(elbow,[-1,-r,0]),null);
  assert.equal(positionFromSurfacePoint(elbow,[R+1,R+1,0]),null);
});

test('cone mesh hits recover X and positive Y clock on the true tapered surface',()=>{
  for(const x of [60,400,700])for(const clock of [0,60,180,270]){
    const phi=clock*RAD,r=cone.mainOD/2+(cone.mainEndOD-cone.mainOD)*x/(2*cone.mainLength);
    const point=[x,r*Math.sin(phi),r*Math.cos(phi)],patch=positionFromSurfacePoint(cone,point);
    const f=positioningFrame({...cone,...patch});vectorNear(f.origin,point);
    near(dot(f.tangent,f.normal),0);near(dot(f.tangent,f.side),0);near(dot(f.normal,f.side),0);
  }
});

test('end-cap and remote hits reject rather than silently moving a joint inside the host',()=>{
  for(const p of [straight,cone])for(const x of [-50,0,p.mainLength,p.mainLength+50])assert.equal(positionFromSurfacePoint(p,[x,0,100]),null);
  assert.equal(positionFromSurfacePoint(straight,[500,0,0]),null);
  assert.equal(positionFromSurfacePoint(elbow,[0,elbow.bendRadius,0]),null);
  assert.equal(positionFromSurfacePoint(cone,[400,0,0]),null);
});

test('positioning frames use kernel direction, and the straight origin is the outer-surface axis entry',()=>{
  const p={...straight,angle:52,offset:12,azimuth:27,jointPosition:jointPositionForSurface({...straight,angle:52,offset:12,azimuth:27},700)};
  const cases=[[p,computeJoint], [{...elbow,surfaceClock:72,angle:63,branchSwivel:20},computeElbowJoint], [{...cone,surfaceClock:217,angle:114,branchSwivel:-18},computeConicalJoint]];
  for(const [params,compute] of cases){
    const r=compute(params);assert.equal(r.valid,true,JSON.stringify(r.errors));
    const f=positioningFrame(params);vectorNear(f.direction,r.geometry.axes.branchDirection);
    if(params.hostType==='straight'){
      const origin=r.geometry.axes.branchOrigin,t=(f.origin[0]-origin[0])/f.direction[0];
      vectorNear(f.origin,origin.map((v,i)=>v+t*f.direction[i]));
      near(Math.hypot(f.origin[1],f.origin[2]),params.mainOD/2);
      assert.notDeepEqual(f.origin,origin);
    }else vectorNear(f.origin,r.geometry.axes.branchOrigin);
  }
});

test('straight direction updates preserve the picked entry while allowing acute and obtuse angles',()=>{
  for(const offset of [-25,0,25])for(const azimuth of [0,45,250])for(const angle of [12,52,90,128,168]){
    const p={...straight,offset,azimuth,jointPosition:jointPositionForSurface({...straight,offset,azimuth},700)};
    const target=rotateAroundMain([Math.cos(angle*RAD),0,Math.sin(angle*RAD)],azimuth);
    const patch=directionFromWorldVector(p,target);assert.ok(patch);near(patch.angle,angle);
    assert.equal(patch.azimuth,undefined);assert.equal(patch.offset,undefined);
    const f=positioningFrame({...p,...patch});near(f.origin[0],700);vectorNear(f.direction,target);
  }
});

test('straight direction rejects inward, tangent and unsupported near-axial gestures',()=>{
  const p={...straight,angle:90,offset:0,azimuth:0,jointPosition:700};
  for(const v of [[0,0,-1],[1,0,0],[0,1,0],[1,0,1e-7],[-1,0,1e-7]])assert.equal(directionFromWorldVector(p,v),null);
  // Out-of-plane movement is projected into the existing branch radial plane.
  const patch=directionFromWorldVector(p,[1,.2,1]);near(patch.angle,45);
});

test('elbow and cone direction inverses recover independent angle and swivel gestures',()=>{
  for(const p of [{...elbow,surfaceClock:83},{...cone,surfaceClock:217}])for(const angle of [18,45,90,135,162])for(const branchSwivel of [-65,-20,0,25,65]){
    const f=positioningFrame({...p,angle,branchSwivel});assert.ok(f);
    const patch=directionFromWorldVector(p,f.direction);assert.ok(patch);near(patch.angle,angle);near(patch.branchSwivel,branchSwivel);
    vectorNear(positioningFrame({...p,...patch}).direction,f.direction);
    vectorNear(positioningFrame({...p,...patch}).origin,positioningFrame(p).origin);
  }
});

test('outward gestures are required for doubly curved and conical hosts without automatic reversal',()=>{
  for(const p of [elbow,cone]){
    const f=positioningFrame(p);
    for(const v of [f.normal.map(v=>-v),f.tangent,f.side,unit(f.tangent.map((v,i)=>v+f.normal[i]*1e-7))])assert.equal(directionFromWorldVector(p,v),null);
    assert.equal(directionFromWorldVector(p,[0,0,0]),null);
  }
});

test('A and B coaxial modes remain true port axes and ignore location or direction gestures',()=>{
  const ends=hostEndFrames(elbow);
  for(const [mode,end] of [['a-axis',ends[0]],['b-axis',ends[1]]]){
    const p={...elbow,elbowAlignment:mode,bendPosition:NaN,surfaceClock:NaN,angle:NaN,branchSwivel:NaN};
    const f=positioningFrame(p);assert.ok(f);
    const inward=end.outward.map(v=>-v);vectorNear(f.direction,inward);
    const delta=f.origin.map((v,i)=>v-end.center[i]),t=dot(delta,inward);
    vectorNear(delta,inward.map(v=>v*t));
    assert.equal(positionFromSurfacePoint(p,[300,30,10]),null);
    assert.equal(directionFromWorldVector(p,[0,0,1]),null);
  }
});

test('port frames are exact centres and outward normals for straight, tapered, 45/90/180 degree elbows',()=>{
  for(const p of [straight,cone])assert.deepEqual(hostEndFrames(p),[
    {id:'A',center:[0,0,0],outward:[-1,0,0],label:'A 端管口'},
    {id:'B',center:[p.mainLength,0,0],outward:[1,0,0],label:'B 端管口'}]);
  for(const bendAngle of [45,90,180]){
    const p={...elbow,bendAngle},ends=hostEndFrames(p),a=bendAngle*RAD;
    vectorNear(ends[1].center,[p.bendRadius*Math.sin(a),p.bendRadius*(1-Math.cos(a)),0]);
    vectorNear(ends[1].outward,[Math.cos(a),Math.sin(a),0]);near(Math.hypot(...ends[1].outward),1);
  }
});

test('invalid host shapes and nonfinite gestures safely return no action',()=>{
  for(const p of [null,{}, {...straight,hostType:'unknown'},{...straight,mainOD:NaN},{...straight,mainWall:100},{...straight,mainLength:0},{...elbow,bendRadius:90},{...elbow,bendAngle:200},{...cone,mainEndOD:cone.mainOD},{...cone,mainLength:Infinity}]){
    assert.equal(positionFromSurfacePoint(p,[400,0,100]),null);
    assert.equal(positioningFrame(p),null);
    assert.equal(directionFromWorldVector(p,[0,0,1]),null);
    assert.deepEqual(hostEndFrames(p),[]);
  }
  for(const v of [null,[],[1,2],[1,2,3,4],[1,NaN,3],[Infinity,0,1]]){
    assert.equal(positionFromSurfacePoint(straight,v),null);assert.equal(directionFromWorldVector(straight,v),null);
  }
  assert.equal(positionFromSurfacePoint({...straight,offset:100},[500,0,100]),null);
});
