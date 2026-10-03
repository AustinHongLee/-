import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveElbowAlignment,elbowAlignmentReference} from '../dist/assets/elbow-axis.js';
import {computeElbowJoint,computeExactElbowStationTable,computeExactElbowHoleTable,
  computeExactElbowLocatorTable} from '../dist/assets/elbow-geometry.js';
import {projectJSON,readProjectJSON,stationCSV,createBranchCuttingWrap,
  templateSVG,templateDXF,fabricationReadiness} from '../dist/assets/exports.js';

const TAU=2*Math.PI,rad=x=>x*Math.PI/180,deg=x=>x*180/Math.PI;
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const add=(a,b,k=1)=>a.map((v,i)=>v+k*b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const norm=v=>Math.hypot(...v),distance=(a,b)=>norm(sub(a,b));
const near=(a,b,t=2e-7)=>assert.ok(Math.abs(a-b)<=t,`${a} versus ${b}`);
const nearPoint=(a,b,t=2e-7)=>assert.ok(distance(a,b)<=t,`${a} versus ${b}`);
const tubeDistance=(q,Rc)=>Math.hypot(Math.hypot(q[0],q[1]-Rc)-Rc,q[2]);
const lineDistance=(point,origin,d)=>{const v=sub(point,origin);return norm(sub(v,d.map(x=>x*dot(v,d))));};
const base={hostType:'elbow',mainOD:219.1,mainWall:6,branchOD:114.3,branchWall:6,
  branchLength:200,bendRadius:304.8,bendAngle:90,bendPosition:45,surfaceClock:0,
  branchSwivel:0,angle:90,elbowAlignment:'b-axis',motherOpening:true,
  jointType:'on',rootGap:0,holeGap:0,projection:0,padEnabled:false,samples:72,tolerance:1,autoPrecision:false};
const good=patch=>{const r=computeElbowJoint({...base,...patch});assert.equal(r.valid,true,JSON.stringify(r.errors));return r;};

// Independent circular-section construction. This does not call the axis
// resolver or the torus quartic kernel.
function construction(p) {
  const Rc=p.bendRadius,R=p.mainOD/2,g=rad(p.bendAngle),L=Math.sqrt(2*Rc*R+R*R),delta=Math.acos(Rc/(Rc+R));
  if(p.elbowAlignment==='a-axis')return {center:[0,0,0],d:[1,0,0],e0:[0,-1,0],e90:[0,0,1],
    P:[L,0,0],beta:delta,alpha:delta,L,R,Rc};
  const center=[Rc*Math.sin(g),Rc*(1-Math.cos(g)),0],d=[-Math.cos(g),-Math.sin(g),0],e0=[-Math.sin(g),Math.cos(g),0],e90=[0,0,1];
  return {center,d,e0,e90,P:add(center,d,L),beta:g-delta,alpha:Math.PI-delta,L,R,Rc};
}
function sectionPoint(p,r,theta,minor,projection=0) {
  const c=construction(p),z=r*Math.sin(theta),h=Math.sqrt(minor*minor-z*z),sign=p.elbowAlignment==='a-axis'?1:-1,
    v=c.Rc+sign*r*Math.cos(theta),u=Math.sqrt((c.Rc+h)**2-v*v);
  return {point:add(add(add(c.center,c.e0,r*Math.cos(theta)),c.e90,r*Math.sin(theta)),c.d,u-projection),t:u-c.L-projection,u};
}

for(const mode of ['a-axis','b-axis'])test(`${mode} resolves true reference-axis position and direction, not parallelism alone`,()=>{
  const p={...base,elbowAlignment:mode},r=good({elbowAlignment:mode}),c=construction(p),resolved=resolveElbowAlignment(p);
  near(resolved.bendPosition,deg(c.beta),1e-12);near(resolved.angle,deg(c.alpha),1e-12);
  nearPoint(r.geometry.axes.branchOrigin,c.P);nearPoint(r.geometry.axes.branchDirection,c.d,1e-12);
  nearPoint(r.geometry.axes.stationZero,c.e0,1e-12);nearPoint(r.geometry.axes.station90,c.e90,1e-12);
  const ref=elbowAlignmentReference(resolved);nearPoint(ref.center,c.center);nearPoint(ref.direction,c.d,1e-12);
  near(lineDistance(r.geometry.axes.branchOrigin,c.center,c.d),0);
  near(tubeDistance(r.geometry.axes.branchOrigin,p.bendRadius),p.mainOD/2);
  for(const id of ['axis-distance','axis-direction'])assert.equal(r.verification.find(v=>v.id===id).status,'pass');
});

test('old middle-section angle45/135 rays are parallel but displaced from A/B centerline',()=>{
  const Rc=base.bendRadius,R=base.mainOD/2,P=[(Rc+R)/Math.sqrt(2),Rc-(Rc+R)/Math.sqrt(2),0],offset=Rc-(Rc+R)/Math.sqrt(2);
  const T=[1/Math.sqrt(2),1/Math.sqrt(2),0],N=[1/Math.sqrt(2),-1/Math.sqrt(2),0];
  const A=T.map((v,i)=>v*Math.cos(rad(45))+N[i]*Math.sin(rad(45))),B=T.map((v,i)=>v*Math.cos(rad(135))+N[i]*Math.sin(rad(135)));
  nearPoint(A,[1,0,0],1e-12);nearPoint(B,[0,-1,0],1e-12);
  near(lineDistance(P,[0,0,0],A),offset);near(lineDistance(P,[Rc,Rc,0],B),offset);
  near(offset,11.810305215353992);assert.ok(offset>10);
});

test('locked axis fields recompute from radius and OD while free fields remain user controlled',()=>{
  const poisoned={...base,bendPosition:7,angle:12,surfaceClock:270,branchSwivel:35};
  for(const patch of [{bendRadius:350},{mainOD:200},{bendRadius:500,mainOD:273.1}]) {
    const p={...poisoned,...patch},r=resolveElbowAlignment(p),c=construction(p);
    near(r.bendPosition,deg(c.beta),1e-12);near(r.angle,deg(c.alpha),1e-12);assert.equal(r.surfaceClock,0);assert.equal(r.branchSwivel,0);
    assert.notEqual(r.bendPosition,poisoned.bendPosition);
  }
  const free={...poisoned,elbowAlignment:'free'};assert.deepEqual(resolveElbowAlignment(free),free);assert.equal(elbowAlignmentReference(free),null);
});

for(const jointType of ['on','in'])test(`B90 ${jointType} exact branch and mother-hole cuts retain coaxial line with gaps`,()=>{
  const p={...base,jointType,rootGap:jointType==='on'?1.25:0,holeGap:.75,projection:jointType==='in'?20:0},r=good(p),c=construction(p);
  near(lineDistance(r.geometry.axes.branchOrigin,c.center,c.d),0);nearPoint(r.geometry.axes.branchDirection,c.d,1e-12);
  const target=jointType==='on'?c.R+p.rootGap:c.R-p.mainWall;
  for(const row of computeExactElbowStationTable(r,23))for(const [point,radius,key] of [[row.outerPoint,p.branchOD/2,'outerDepth'],[row.innerPoint,p.branchOD/2-p.branchWall,'innerDepth']]) {
    const q=sectionPoint(p,radius,rad(row.angle),target,p.projection);
    nearPoint(point,q.point);near(row[key],r.geometry.branch.axisEnd-q.t);
  }
  const tool=(jointType==='on'?p.branchOD/2-p.branchWall:p.branchOD/2)+p.holeGap,rows=computeExactElbowHoleTable(r,24);
  near(r.measurements.mainHoleToolDiameter,2*tool);
  for(const row of rows) {
    nearPoint(row.point,sectionPoint(p,tool,rad(row.angle),c.R).point);
    nearPoint(row.innerPoint,sectionPoint(p,tool,rad(row.angle),c.R-p.mainWall).point);
    near(lineDistance(row.point,c.center,c.d),tool);
  }
});

for(const mode of ['a-axis','b-axis'])test(`finite45 ${mode} rejects 4-inch contact crossing end, accepts OD21.3`,()=>{
  const p={...base,bendAngle:45,elbowAlignment:mode,motherOpening:false},large=computeElbowJoint(p);
  assert.equal(large.valid,false);assert.ok(large.errors.some(e=>/端部|端面/.test(e.message)));
  const small=good({...p,branchOD:21.3,branchWall:2.77}),R=p.mainOD/2,Rc=p.bendRadius,b=21.3/2;
  const deltaMax=Math.acos((Rc-b)/(Rc+R)),deltaMin=Math.acos((Rc+b)/(Rc+R));
  assert.ok(deltaMax<rad(45));
  const rows=computeExactElbowLocatorTable(small,24);
  const betas=rows.map(row=>row.betaRad),expectedMin=mode==='b-axis'?rad(45)-deltaMax:deltaMin,expectedMax=mode==='b-axis'?rad(45)-deltaMin:deltaMax;
  near(Math.min(...betas),expectedMin);near(Math.max(...betas),expectedMax);
});

test('equal outside diameters touch B end tangentially and cannot pass a stable closed fishmouth',()=>{
  const r=computeElbowJoint({...base,motherOpening:false,branchOD:base.mainOD,branchWall:4});
  assert.equal(r.valid,false);assert.equal(r.manufacturingReady,false);assert.equal(r.templates.length,0);
});

test('B coaxial insertion stops at the open B-end inside disk, including exact touch',()=>{
  const p={...base,jointType:'in'},r=good(p),Ri=p.mainOD/2-p.mainWall,b=p.branchOD/2;
  const available=Math.sqrt((p.bendRadius+Ri)**2-(p.bendRadius+b)**2);
  near(r.measurements.projectionAvailable,available,2e-6);
  good({...p,projection:available-.01});
  for(const projection of [available,available+.01]) {
    const invalid=computeElbowJoint({...p,projection});assert.equal(invalid.valid,false);assert.match(invalid.errors[0].message,/端面|內壁/);
  }
});

test('closed mother has branch-OD contact footprint and branch-ID reference both on outside host',()=>{
  const r=good({motherOpening:false}),p=r.params,c=construction(p),rows=computeExactElbowLocatorTable(r,24);
  for(const host of [r.geometry.elbow,r.geometry.main])for(const key of ['outerHole3D','innerHole3D'])assert.deepEqual(host[key],[]);
  for(const key of ['outerHoleUV','innerHoleUV','outerHoleLocator','innerHoleLocator'])assert.deepEqual(r.geometry.elbow[key],[]);
  assert.equal(r.geometry.main.holeToolRadius,null);assert.equal(r.measurements.mainHoleToolDiameter,null);
  assert.equal(r.capabilities.motherOpening,false);assert.equal(rows.length,25);
  for(const row of rows) {
    assert.equal(row.basis,'attachment-outer-footprint-not-cut');
    nearPoint(row.point,sectionPoint(p,p.branchOD/2,rad(row.angle),c.R).point);
    nearPoint(row.innerPoint,sectionPoint(p,p.branchOD/2-p.branchWall,rad(row.angle),c.R).point);
    near(tubeDistance(row.point,c.Rc),c.R);near(tubeDistance(row.innerPoint,c.Rc),c.R);
    near(row.rearDistance,(c.Rc+c.R)*row.betaRad);near(row.inner.rearDistance,(c.Rc+c.R)*row.inner.betaRad);
    near(row.circumference,c.R*row.phiRad);near(row.inner.circumference,c.R*row.inner.phiRad);
  }
  assert.throws(()=>computeExactElbowHoleTable(r,24),/封閉|沒有開孔/);
});

test('closed mother cut/contact points are invariant to host thickness and unused hole gap',()=>{
  const a=good({motherOpening:false}),b=good({motherOpening:false,mainWall:80,holeGap:30});
  nearPoint(a.geometry.axes.branchOrigin,b.geometry.axes.branchOrigin);
  assert.deepEqual(a.geometry.branch.outerCut,b.geometry.branch.outerCut);
  assert.deepEqual(a.geometry.branch.innerCut,b.geometry.branch.innerCut);
  assert.deepEqual(computeExactElbowLocatorTable(a,23),computeExactElbowLocatorTable(b,23));
});

test('OD198 wall1 external dummy fits mainOD200 wall6 without inner-wall hole gate',()=>{
  const r=good({motherOpening:false,mainOD:200,branchOD:198,branchWall:1}),rows=computeExactElbowLocatorTable(r,24);
  assert.equal(r.geometry.elbow.outerHole3D.length,0);assert.ok(r.geometry.elbow.outerContact3D.length>0);
  for(const row of rows)near(tubeDistance(row.point,r.params.bendRadius),100);
});

test('closed mother cannot silently accept insertion or projected inward tube',()=>{
  for(const patch of [{jointType:'in'},{projection:1}]) {
    const r=computeElbowJoint({...base,motherOpening:false,...patch});assert.equal(r.valid,false);
    assert.ok(r.errors.some(e=>/封閉|開孔/.test(e.message)));
  }
});

test('axis/closed JSON roundtrip recomputes the same exact geometry and branch exports',()=>{
  const r=good({motherOpening:false}),text=projectJSON(r.params,{title:'B 同軸外焊支撐'}),project=readProjectJSON(text),again=computeElbowJoint(project.params);
  assert.equal(project.params.elbowAlignment,'b-axis');assert.equal(project.params.motherOpening,false);
  assert.equal(again.valid,true);assert.deepEqual(again.geometry.branch.outerCut,r.geometry.branch.outerCut);
  assert.equal(fabricationReadiness(r).ready,true);assert.match(stationCSV(r),/外緣切口深度/);
  const wrap=createBranchCuttingWrap(r,{stationCount:24});assert.match(templateSVG(wrap),/<svg/);assert.match(templateDXF(wrap),/CUT_FISHMOUTH/);
  const poisoned={...project.params,bendPosition:70,angle:70};const locked=computeElbowJoint(poisoned);
  assert.equal(locked.valid,true);nearPoint(locked.geometry.axes.branchOrigin,r.geometry.axes.branchOrigin);
});

test('malformed axis enum and nonboolean mother-opening configuration are rejected',()=>{
  for(const patch of [{elbowAlignment:'parallel'},{motherOpening:'false'}]) {
    assert.throws(()=>projectJSON({...base,...patch}),/選項|布林/);
    const r=computeElbowJoint({...base,...patch});assert.equal(r.valid,false);
  }
});
