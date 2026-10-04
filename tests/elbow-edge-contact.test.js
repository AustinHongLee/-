import test from 'node:test';
import assert from 'node:assert/strict';
import {computeElbowJoint,computeExactElbowStationTable,torusCoordinates} from '../dist/assets/elbow-geometry.js';
import {elbowAlignmentReference} from '../dist/assets/elbow-axis.js';

const TAU=2*Math.PI,rad=d=>d*Math.PI/180;
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=v=>Math.hypot(...v);
const near=(a,b,t=2e-7)=>assert.ok(Math.abs(a-b)<=t,`${a} differs from ${b}`);
const nearPoint=(a,b,t=2e-7)=>near(norm(sub(a,b)),0,t);
const base={hostType:'elbow',mainOD:219.1,mainWall:6,branchOD:60.3,branchWall:3.91,
  branchLength:150,bendRadius:304.8,bendAngle:90,elbowAlignment:'a-edge',elbowOffset:1,elbowSideOffset:0,
  motherOpening:false,jointType:'on',rootGap:0,holeGap:0,projection:0,padEnabled:false,samples:37,tolerance:.1,autoPrecision:true};
const valid=patch=>{const r=computeElbowJoint({...base,...patch});assert.equal(r.valid,true,JSON.stringify(r.errors));assert.equal(r.manufacturingReady,true);return r;};
const axisRadius=(point,origin,direction)=>{const v=sub(point,origin),along=dot(v,direction);return norm(v.map((x,i)=>x-along*direction[i]));};
const finite=(point,p)=>point[0]>=-1e-7&&dot([Math.cos(rad(p.bendAngle)),Math.sin(rad(p.bendAngle)),0],sub(point,[0,p.bendRadius,0]))<=1e-7;

test('A/B outside-back and either side exact edge cuts are closed, precise, finite and keep the mother sealed',()=>{
  for(const end of ['a','b'])for(const bendAngle of [45,90])for(const [elbowOffset,elbowSideOffset] of [[1,0],[0,1],[0,-1],[3,4]]) {
    const r=valid({elbowAlignment:`${end}-edge`,bendAngle,elbowOffset,elbowSideOffset}),ref=elbowAlignmentReference(r.params),contact=r.geometry.elbow.portEdgeContact;
    near(ref.offsetDistance,79.4);assert.equal(contact.end,end.toUpperCase());
    near(dot(sub(contact.point,ref.center),ref.direction),0);near(norm(sub(contact.point,ref.center)),base.mainOD/2);
    near(Math.min(...r.geometry.branch.outerCut.map(point=>norm(sub(point,contact.point)))),0);
    for(const points of [r.geometry.branch.outerCut,r.geometry.branch.innerCut,r.geometry.elbow.outerContact3D]) {
      nearPoint(points[0],points.at(-1));
      for(const point of points){near(torusCoordinates(point,base.bendRadius).tubeDistance,base.mainOD/2);assert.ok(finite(point,r.params));}
    }
    assert.deepEqual(r.geometry.elbow.outerHole3D,[]);assert.deepEqual(r.geometry.elbow.innerHole3D,[]);
    assert.equal(r.params.motherOpening,false);assert.equal(r.params.jointType,'on');
    for(const id of ['equations','roundtrip','closure','axis-distance','axis-direction','edge-alignment','wall-collision'])assert.equal(r.verification.find(v=>v.id===id).status,'pass');
    assert.equal(r.verification.find(v=>v.id==='wall-collision').basis,'analytic-end-parallel-outer-exit-monotonicity');
    assert.ok(r.precision.maxChordError<=.1);assert.ok(r.precision.contourSegments<=4096);
  }
});

test('contact-aware mesh preserves real angles, developed circumference and exact external/inner stations',()=>{
  const r=valid({elbowOffset:0,elbowSideOffset:1}),ref=elbowAlignmentReference(r.params),rows=r.stationTable,template=r.templates[0],C=Math.PI*base.branchOD;
  assert.equal(r.sampling.angularMethod,'fourth-power-port-contact-grid');
  assert.equal(rows.length,r.precision.contourSegments+1);
  near(rows[0].angle,0);near(rows.at(-1).angle,360);near(rows.at(-1).circumference,C);
  const increments=rows.slice(1).map((q,i)=>q.angle-rows[i].angle);
  assert.ok(Math.max(...increments)>100*Math.min(...increments));
  rows.forEach((q,i)=>{
    near(q.circumference,C*q.angle/360);
    near(template.references[0].points[i][0],q.circumference);
    near(template.references[0].points[i][1],q.innerDepth);
    near(axisRadius(q.outerPoint,ref.origin,ref.direction),base.branchOD/2);
    near(axisRadius(q.innerPoint,ref.origin,ref.direction),base.branchOD/2-base.branchWall);
  });
  for(const row of computeExactElbowStationTable(r,17)) {
    near(row.circumference,C*row.angle/360);
    for(const point of [row.outerPoint,row.innerPoint])near(torusCoordinates(point,base.bendRadius).tubeDistance,base.mainOD/2);
  }
});

test('exact edge open-on may succeed with sufficient branch wall and never changes the selected connection',()=>{
  for(const end of ['a','b'])for(const [elbowOffset,elbowSideOffset] of [[1,0],[0,1],[0,-1]]) {
    const p={elbowAlignment:`${end}-edge`,elbowOffset,elbowSideOffset,branchWall:8,holeGap:.5},closed=valid(p),open=valid({...p,motherOpening:true});
    assert.equal(open.params.motherOpening,true);assert.equal(open.params.jointType,'on');
    assert.ok(open.geometry.elbow.outerHole3D.length>36);assert.ok(open.geometry.elbow.innerHole3D.length>36);
    assert.deepEqual(open.geometry.branch.outerCut,closed.geometry.branch.outerCut);
    assert.deepEqual(open.geometry.branch.innerCut,closed.geometry.branch.innerCut);
    for(const point of open.geometry.elbow.innerHole3D)near(torusCoordinates(point,base.bendRadius).tubeDistance,base.mainOD/2-base.mainWall);
  }
});

test('missing inner-wall intersections distinguish an impossible flow hole from an impossible inserted fishmouth',()=>{
  for(const end of ['a','b'])for(const [elbowOffset,elbowSideOffset] of [[1,0],[0,1],[0,-1]])for(const jointType of ['on','in']) {
    const r=computeElbowJoint({...base,elbowAlignment:`${end}-edge`,elbowOffset,elbowSideOffset,motherOpening:true,jointType});
    assert.equal(r.valid,false);assert.equal(r.manufacturingReady,false);assert.equal(r.geometry,null);assert.deepEqual(r.templates,[]);
    assert.equal(r.params.motherOpening,true);assert.equal(r.params.jointType,jointType);
    assert.equal(r.errors[0].code,jointType==='on'?'mother-opening':'branch-cut');
    assert.equal(r.errors[0].field,jointType==='on'?'holeGap':'elbowAlignment');
    assert.match(r.errors[0].message,/103\.55 mm/);assert.match(r.errors[0].message,/保持.*接法需向中心退讓/);
  }
});

test('finite opposite-end crossings, nonisolated tangencies and precision failures still stop output',()=>{
  for(const end of ['a','b']) {
    const r=computeElbowJoint({...base,elbowAlignment:`${end}-edge`,bendAngle:25});
    assert.equal(r.valid,false);assert.equal(r.errors[0].code,'finite-end');assert.equal(r.geometry,null);
  }
  const sameDiameter=computeElbowJoint({...base,branchOD:base.mainOD,branchWall:6});
  assert.equal(sameDiameter.valid,false);assert.equal(sameDiameter.manufacturingReady,false);assert.deepEqual(sameDiameter.templates,[]);
  for(const [elbowOffset,elbowSideOffset] of [[1,0],[0,1],[0,-1]]) {
    const capTouchingHole=computeElbowJoint({...base,elbowOffset,elbowSideOffset,motherOpening:true,branchWall:6.5,holeGap:.5});
    assert.equal(capTouchingHole.valid,false);assert.equal(capTouchingHole.errors[0].code,'mother-opening');
  }
  const preview=computeElbowJoint({...base,elbowOffset:0,elbowSideOffset:1,samples:37,tolerance:.001,autoPrecision:false});
  assert.equal(preview.valid,true);assert.equal(preview.manufacturingReady,false);assert.equal(preview.precision.metTolerance,false);
});

test('root-gap retains the external pipe axis and leaves all retained generators outside the ideal mother',()=>{
  const r=valid({elbowOffset:0,elbowSideOffset:-1,rootGap:1.2}),ref=elbowAlignmentReference(r.params);
  for(const row of computeExactElbowStationTable(r,23))for(const point of [row.outerPoint,row.innerPoint]) {
    near(torusCoordinates(point,base.bendRadius).tubeDistance,base.mainOD/2+1.2);
    for(const advance of [.001,1,50,140]) {
      const retained=point.map((v,i)=>v+advance*ref.direction[i]);
      assert.ok(torusCoordinates(retained,base.bendRadius).tubeDistance>base.mainOD/2);
    }
  }
});
