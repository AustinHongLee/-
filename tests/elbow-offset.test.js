import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveElbowAlignment,elbowAlignmentReference,elbowAlignmentLabel,ELBOW_ALIGNMENT_MODES} from '../dist/assets/elbow-axis.js';
import {computeElbowJoint,computeExactElbowStationTable,torusSurfacePoint} from '../dist/assets/elbow-geometry.js';

const rad=d=>d*Math.PI/180,deg=r=>r*180/Math.PI;
const add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,k)=>a.map(v=>v*k),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=v=>Math.hypot(...v);
const near=(a,b,t=2e-7)=>assert.ok(Math.abs(a-b)<=t,`${a} versus ${b}`);
const nearPoint=(a,b,t=2e-7)=>near(norm(sub(a,b)),0,t);
const distanceToAxis=(q,origin,d)=>{const v=sub(q,origin);return norm(sub(v,mul(d,dot(v,d))));};
const tubeDistance=(q,R)=>Math.hypot(Math.hypot(q[0],q[1]-R)-R,q[2]);
const finite=(q,p)=>q[0]>=-1e-7&&dot([Math.cos(rad(p.bendAngle)),Math.sin(rad(p.bendAngle)),0],sub(q,[0,p.bendRadius,0]))<=1e-7;
const base={hostType:'elbow',mainOD:219.1,mainWall:6,branchOD:60.3,branchWall:3.91,
  branchLength:150,bendRadius:304.8,bendAngle:90,bendPosition:45,surfaceClock:0,
  branchSwivel:0,angle:90,elbowAlignment:'a-offset',elbowOffset:0,elbowSideOffset:0,
  motherOpening:true,jointType:'on',rootGap:0,holeGap:0,projection:0,
  padEnabled:false,samples:72,tolerance:1,autoPrecision:false};

// Independent right-triangle construction in the selected end's plane.
function expected(p){
  const A=p.elbowAlignment.startsWith('a-'),g=rad(p.bendAngle),R=p.bendRadius,r=p.mainOD/2,
    center=A?[0,0,0]:[R*Math.sin(g),R*(1-Math.cos(g)),0],
    normal=A?[0,-1,0]:[Math.sin(g),-Math.cos(g),0],direction=A?[1,0,0]:[-Math.cos(g),-Math.sin(g),0];
  let u=p.elbowOffset??0,v=p.elbowSideOffset??0;
  if(p.elbowAlignment.endsWith('-edge')){
    const length=Math.hypot(u,v),m=(p.mainOD-p.branchOD)/2;
    if(length){u=u/length*m;v=v/length*m;}else{u=m;v=0;}
  }
  const origin=add(center,add(mul(normal,u),[0,0,v])),h=Math.sqrt(r*r-v*v),rho=R+h,
    length=Math.sqrt(rho*rho-(R+u)*(R+u)),delta=Math.acos((R+u)/rho),point=add(origin,mul(direction,length));
  return {center,origin,normal,direction,u,v,point,beta:A?delta:g-delta,phi:Math.atan2(v,h)};
}
function resolvedPoint(p){return torusSurfacePoint(rad(p.bendPosition),rad(p.surfaceClock),p.bendRadius,p.mainOD/2);}
function resolvedDirection(p){
  const beta=rad(p.bendPosition),phi=rad(p.surfaceClock),a=rad(p.angle),psi=rad(p.branchSwivel),
    T=[Math.cos(beta),Math.sin(beta),0],N=[Math.sin(beta),-Math.cos(beta),0],
    m=add(mul(N,Math.cos(phi)),[0,0,Math.sin(phi)]),k=add(mul(N,-Math.sin(phi)),[0,0,Math.cos(phi)]);
  return add(mul(T,Math.cos(a)),mul(add(mul(m,Math.cos(psi)),mul(k,Math.sin(psi))),Math.sin(a)));
}
const good=p=>{const r=computeElbowJoint(p);assert.equal(r.valid,true,JSON.stringify(r.errors));return r;};

test('A/B zero parallel offsets coincide with the existing coaxial construction',()=>{
  assert.deepEqual(ELBOW_ALIGNMENT_MODES,['free','a-axis','b-axis','a-offset','b-offset','a-edge','b-edge']);
  for(const end of ['a','b'])for(const bendAngle of [45,90]){
    const p={...base,elbowAlignment:`${end}-offset`,bendAngle},offset=resolveElbowAlignment(p),axis=resolveElbowAlignment({...p,elbowAlignment:`${end}-axis`});
    for(const key of ['bendPosition','surfaceClock','angle','branchSwivel'])near(offset[key],axis[key],1e-11);
    const ref=elbowAlignmentReference(offset);nearPoint(ref.origin,ref.center);near(ref.offsetDistance,0);
  }
});

test('parallel offset resolver preserves signed two-axis displacement and exact global A/B directions',()=>{
  for(const end of ['a','b'])for(const bendAngle of [45,90])for(const [elbowOffset,elbowSideOffset] of [[20,0],[-20,0],[0,20],[0,-20],[20,-20],[-20,20]]){
    const p={...base,mainOD:114.3,branchOD:21.3,branchWall:2.77,elbowAlignment:`${end}-offset`,bendAngle,elbowOffset,elbowSideOffset},e=expected(p),q=resolveElbowAlignment(p),ref=elbowAlignmentReference(q);
    nearPoint(ref.center,e.center);nearPoint(ref.origin,e.origin);nearPoint(ref.normal,e.normal);
    near(ref.offset,elbowOffset);near(ref.sideOffset,elbowSideOffset);near(ref.offsetDistance,Math.hypot(elbowOffset,elbowSideOffset));
    near(q.bendPosition,deg(e.beta));near(q.surfaceClock,deg(e.phi));
    nearPoint(resolvedPoint(q),e.point);nearPoint(resolvedDirection(q),e.direction,1e-12);
    near(distanceToAxis(resolvedPoint(q),ref.origin,ref.direction),0);near(tubeDistance(e.point,p.bendRadius),p.mainOD/2);
  }
});

test('edge alignment equates same-side projected outside outlines, including both lateral directions',()=>{
  for(const end of ['a','b'])for(const vector of [[1,0],[-1,0],[0,1],[0,-1],[3,4],[-3,-4],[0,0]]){
    const p={...base,elbowAlignment:`${end}-edge`,elbowOffset:vector[0],elbowSideOffset:vector[1]},ref=elbowAlignmentReference(p),q=resolveElbowAlignment(p),e=expected(p),D=(p.mainOD-p.branchOD)/2,
      w=mul(ref.offsetVector,1/D);
    near(ref.offsetDistance,D);nearPoint(ref.origin,e.origin);
    near(dot(ref.offsetVector,w)+p.branchOD/2,p.mainOD/2);
    nearPoint(resolvedPoint(q),e.point);nearPoint(resolvedDirection(q),ref.direction,1e-12);
    near(distanceToAxis(resolvedPoint(q),ref.center,ref.direction),D);
    assert.match(elbowAlignmentLabel(p),/同側外輪廓齊線/);
  }
});

test('edge offsets recompute from diameter changes while preserving chosen side',()=>{
  const p={...base,elbowAlignment:'b-edge',elbowOffset:-3,elbowSideOffset:4},a=elbowAlignmentReference(p),b=elbowAlignmentReference({...p,mainOD:273,branchOD:88.9}),c=elbowAlignmentReference({...p,elbowOffset:-300,elbowSideOffset:400});
  near(a.offset,-.6*(219.1-60.3)/2);near(a.sideOffset,.8*(219.1-60.3)/2);
  near(b.offset,-.6*(273-88.9)/2);near(b.sideOffset,.8*(273-88.9)/2);
  nearPoint(c.origin,a.origin);near(c.offsetDistance,a.offsetDistance);
  assert.match(elbowAlignmentLabel({...p,elbowAlignment:'b-offset'}),/B 端平行偏移（外背 -3／側向 4 mm）/);
});

test('finite 45/90 elbows retain exact cut radii and axis references with two-axis offsets',()=>{
  for(const end of ['a','b'])for(const bendAngle of [45,90])for(const elbowSideOffset of [-10,10]){
    const p={...base,mainOD:114.3,branchOD:21.3,branchWall:2.77,elbowAlignment:`${end}-offset`,elbowOffset:-10,elbowSideOffset,bendAngle},r=good(p),ref=elbowAlignmentReference(r.params);
    nearPoint(r.geometry.axes.branchDirection,ref.direction,1e-12);near(distanceToAxis(r.geometry.axes.branchOrigin,ref.origin,ref.direction),0);
    for(const id of ['axis-distance','axis-direction'])assert.equal(r.verification.find(v=>v.id===id).status,'pass');
    for(const row of computeExactElbowStationTable(r,11))for(const [point,radius] of [[row.outerPoint,p.branchOD/2],[row.innerPoint,p.branchOD/2-p.branchWall]]){
      near(distanceToAxis(point,ref.origin,ref.direction),radius);near(tubeDistance(point,p.bendRadius),p.mainOD/2);assert.ok(finite(point,p));
    }
  }
});

test('offset dummy and inserted cut points obey distinct outer/inner-wall bases without changing the parallel axis',()=>{
  for(const end of ['a','b'])for(const jointType of ['on','in']){
    const p={...base,elbowAlignment:`${end}-offset`,elbowOffset:15,elbowSideOffset:-20,jointType,motherOpening:jointType==='in',rootGap:jointType==='on'?1.2:0,projection:jointType==='in'?5:0},r=good(p),ref=elbowAlignmentReference(r.params),minor=jointType==='on'?p.mainOD/2+p.rootGap:p.mainOD/2-p.mainWall;
    for(const row of computeExactElbowStationTable(r,11)){
      near(distanceToAxis(row.outerPoint,ref.origin,ref.direction),p.branchOD/2);
      near(tubeDistance(add(row.outerPoint,mul(ref.direction,p.projection)),p.bendRadius),minor);
      assert.ok(finite(row.outerPoint,p));
    }
    if(jointType==='on')assert.deepEqual(r.geometry.elbow.outerHole3D,[]);
  }
});

test('closed external edge cuts retain a continuous selected-port contact instead of rejecting its zero gradient',()=>{
  for(const end of ['a','b']){
    const inside={...base,elbowAlignment:`${end}-edge`,elbowOffset:-1,elbowSideOffset:0,motherOpening:false};good(inside);
    for(const [elbowOffset,elbowSideOffset] of [[1,0],[0,1],[0,-1]]){
      const p={...inside,elbowOffset,elbowSideOffset},q=resolveElbowAlignment(p);assert.ok(Number.isFinite(q.bendPosition));
      const r=good({...p,autoPrecision:true,tolerance:.1});assert.equal(r.manufacturingReady,true);
      assert.equal(r.geometry.elbow.portEdgeContact.end,end.toUpperCase());
      assert.equal(r.geometry.elbow.portEdgeContact.kind,'isolated-continuous-closed-cut-contact');
      assert.deepEqual(r.geometry.elbow.outerHole3D,[]);
    }
  }
});

test('misses, tangencies, and malformed offsets never silently return a valid moved position',()=>{
  for(const patch of [{elbowOffset:1e6},{elbowOffset:-1e6},{elbowSideOffset:base.mainOD/2},{elbowSideOffset:-base.mainOD/2},{elbowOffset:NaN},{elbowSideOffset:Infinity},
    {elbowAlignment:'a-edge',branchOD:base.mainOD+1}]){
    const p={...base,...patch},q=resolveElbowAlignment(p);assert.ok(Number.isNaN(q.bendPosition),JSON.stringify(p));
    const r=computeElbowJoint(p);assert.equal(r.valid,false);assert.deepEqual(r.templates,[]);
  }
  for(const end of ['a','b']){
    const p={...base,elbowAlignment:`${end}-offset`,bendAngle:20},q=resolveElbowAlignment(p);
    assert.ok(end==='a'?q.bendPosition>p.bendAngle:q.bendPosition<0);
    assert.equal(computeElbowJoint(p).valid,false);
  }
});

test('offset and edge insertion remain blocked at end-plane or wall collisions',()=>{
  for(const end of ['a','b']){
    const p={...base,elbowAlignment:`${end}-offset`,elbowOffset:10,elbowSideOffset:10,jointType:'in'},r=good(p);
    assert.ok(r.measurements.projectionAvailable>0);
    const blocked=computeElbowJoint({...p,projection:r.measurements.projectionAvailable+.1});
    assert.equal(blocked.valid,false);assert.deepEqual(blocked.templates,[]);
    assert.ok(blocked.errors.some(e=>/端面|內壁|碰/.test(e.message)),JSON.stringify(blocked.errors));
    const inward={...p,elbowAlignment:`${end}-edge`,elbowOffset:-1,elbowSideOffset:0},e=good(inward);
    assert.equal(computeElbowJoint({...inward,projection:e.measurements.projectionAvailable+.1}).valid,false);
  }
});
