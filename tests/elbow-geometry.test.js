import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ELBOW_PARAMS, computeElbowJoint, computeExactElbowStationTable,
  computeExactElbowHoleTable, torusLineIntersections, torusSurfacePoint,
  torusCoordinates, elbowFrame } from '../dist/assets/elbow-geometry.js';

const rad=x=>x*Math.PI/180;
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const add=(a,b,k=1)=>a.map((v,i)=>v+k*b[i]);
const near=(actual,expected,tolerance=1e-7)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} versus ${expected}`);
const base={mainOD:219.1,mainWall:6,branchOD:114.3,branchWall:6,
  samples:72,padEnabled:false,bendRadius:304.8,bendAngle:90,bendPosition:45,
  surfaceClock:0,branchSwivel:0,angle:90,rootGap:0,holeGap:0};
const residual=(point,Rc,r)=>Math.hypot(Math.hypot(point[0],point[1]-Rc)-Rc,point[2])-r;
const valid=p=>{const r=computeElbowJoint({...base,...p});assert.equal(r.valid,true,JSON.stringify(r.errors));return r;};

test('frame and four cardinal surface points use the specified A/B elbow coordinates',()=>{
  const Rc=304.8,r=109.55,beta=rad(45),f=elbowFrame(beta,Rc);
  near(f.center[0],Rc/Math.sqrt(2));near(f.center[1],Rc*(1-1/Math.sqrt(2)));
  for(const phi of [0,90,180,270]) {
    const p=torusSurfacePoint(beta,rad(phi),Rc,r),q=torusCoordinates(p,Rc);
    near(q.beta,beta,1e-12);near(q.tubeDistance,r);
    near(Math.sin(q.phi),Math.sin(rad(phi)),1e-12);
    near(Math.cos(q.phi),Math.cos(rad(phi)),1e-12);
  }
});

test('radial extrados and belly axis roots match independent analytic full-torus positions',()=>{
  const Rc=304.8,R=109.55,beta=rad(45),f=elbowFrame(beta,Rc);
  for(const [phi,d,expected] of [[0,f.normal,[-2*(Rc+R),-2*Rc,-2*R,0]],
    [Math.PI,f.normal.map(v=>-v),[-2*R,0,2*(Rc-R),2*Rc]]]) {
    const P=torusSurfacePoint(beta,phi,Rc,R),roots=torusLineIntersections(P,d,Rc,R);
    assert.equal(roots.length,4);
    roots.forEach((q,i)=>{near(q.t,expected[i]);near(residual(q.point,Rc,R),0);});
  }
});

test('normal extrados branch cut has independent circular-section analytic cardinal stations',()=>{
  const joint=valid({angle:90}),rows=computeExactElbowStationTable(joint,4),Rc=base.bendRadius;
  const R=base.mainOD/2,b=base.branchOD/2,axis=joint.geometry.branch.axisEnd;
  // theta0: tangent offset only. theta90: binormal offset only.
  const expectedT=[Math.sqrt((Rc+R)**2-b*b)-(Rc+R),Math.sqrt(R*R-b*b)-R];
  near(rows[0].outerDepth,axis-expectedT[0]);near(rows[1].outerDepth,axis-expectedT[1]);
  near(rows[2].outerDepth,rows[0].outerDepth);near(rows[3].outerDepth,rows[1].outerDepth);
});

for(const jointType of ['on','in'])for(const angle of [45,90])test(`8/4 LR90 ${jointType} angle${angle} true torus cuts`,()=>{
  const r=valid({jointType,angle,projection:jointType==='in'?20:0}),R=jointType==='on'?109.55:103.55;
  assert.equal(r.manufacturingReady,true);
  for(const point of [...r.geometry.branch.outerCut,...r.geometry.branch.innerCut])
    near(residual(add(point,r.geometry.axes.branchDirection,jointType==='in'?20:0),304.8,R),0,2e-7);
  assert.equal(r.templates.length,1);assert.equal(r.templates[0].id,'branch');
  assert.equal(r.geometry.pad,null);assert.equal(r.capabilities.wholeHostDevelopment,false);
});

test('normal belly roots on remote torus arm are ignored outside the finite 90 degree elbow',()=>{
  const r=valid({surfaceClock:180});
  // Concave torus throat can put its cut above the axis skin datum, but the
  // distant full-torus roots at +390.5/+609.6 are outside the real bend.
  assert.ok(r.geometry.branch.axisEnd<250);
  assert.ok(r.geometry.branch.outerCut.every(p=>p[0]>=-1e-7&&p[1]<=304.8+1e-7));
});

test('SR back and side work while oversized SR throat cut is rejected',()=>{
  valid({bendRadius:152.4,branchOD:100,branchWall:4});
  valid({bendRadius:152.4,branchOD:100,branchWall:4,surfaceClock:90});
  const throat=computeElbowJoint({...base,bendRadius:152.4,branchOD:100,branchWall:4,surfaceClock:180});
  assert.equal(throat.valid,false);assert.equal(throat.templates.length,0);
});

test('station zero projects minus local tangent; increasing station is clockwise from free end',()=>{
  const r=valid({angle:52,surfaceClock:90,branchSwivel:20}),a=r.geometry.axes;
  near(dot(a.stationZero,a.branchDirection),0,1e-12);near(dot(a.station90,a.branchDirection),0,1e-12);
  near(dot(a.stationZero,a.station90),0,1e-12);
  near(dot(cross(a.stationZero,a.station90),a.branchDirection),-1,1e-12);
  assert.ok(dot(a.stationZero,a.hostTangent)<0);
});

test('arbitrary exact station helper solves directly, with shared finished free-end datum',()=>{
  const r=valid({angle:52,surfaceClock:90,branchSwivel:10,samples:72}),rows=computeExactElbowStationTable(r,23),a=r.geometry.axes;
  assert.equal(rows.length,24);near(rows.at(-1).angle,360);near(dist(rows[0].outerPoint,rows.at(-1).outerPoint),0);
  for(const row of rows) {
    const theta=rad(row.angle),foot=a.branchOrigin.map((v,i)=>v+base.branchOD/2*(a.stationZero[i]*Math.cos(theta)+a.station90[i]*Math.sin(theta)));
    const t=dot(row.outerPoint.map((v,i)=>v-foot[i]),a.branchDirection);
    near(row.outerDepth,r.geometry.branch.axisEnd-t);
    near(residual(row.outerPoint,base.bendRadius,base.mainOD/2),0,2e-7);
    near(row.circumference,Math.PI*base.branchOD*row.angle/360,1e-9);
  }
});

test('exact mother-hole table uses actual outside wall points and rear/belly/circumference distances',()=>{
  for(const jointType of ['on','in']) {
    const r=valid({jointType,surfaceClock:270,angle:60}),rows=computeExactElbowHoleTable(r,24);
    assert.equal(rows.length,25);near(dist(rows[0].point,rows.at(-1).point),0);
    const tool=(jointType==='on'?base.branchOD/2-base.branchWall:base.branchOD/2);
    for(const row of rows) {
      assert.ok(row.phiDegrees>=0&&row.phiDegrees<360);assert.ok(row.phiRad>=0&&row.phiRad<2*Math.PI);
      near(row.betaDegrees,row.betaRad*180/Math.PI);near(row.phiDegrees,row.phiRad*180/Math.PI);
      near(row.rearDistance,(304.8+109.55)*row.betaRad);near(row.bellyDistance,(304.8-109.55)*row.betaRad);
      near(row.circumference,109.55*row.phiRad);
      near(residual(row.point,304.8,109.55),0,2e-7);near(residual(row.innerPoint,304.8,103.55),0,2e-7);
      const delta=row.point.map((v,i)=>v-r.geometry.axes.branchOrigin[i]),axis=dot(delta,r.geometry.axes.branchDirection);
      near(Math.hypot(...delta.map((v,i)=>v-axis*r.geometry.axes.branchDirection[i])),tool,2e-7);
      near(row.inner.rearDistance,(304.8+103.55)*row.inner.betaRad);
    }
  }
});

test('actual retained short branch clears other arm, long branch collides inside finite elbow',()=>{
  const p={surfaceClock:180,bendPosition:30,angle:20,branchOD:10,branchWall:1};
  const short=valid({...p,branchLength:50}),long=computeElbowJoint({...base,...p,branchLength:200});
  assert.ok(short.geometry.branch.axisEnd<2*(304.8-109.55)*Math.sin(rad(20)));
  assert.equal(long.valid,false);assert.match(long.errors[0].message,/干涉/);
});

test('cut overlapping finite bend ends and insertion past first finite inside stop are rejected',()=>{
  const end=computeElbowJoint({...base,bendPosition:2});assert.equal(end.valid,false);assert.match(end.errors[0].message,/端部/);
  const r=valid({jointType:'in'});assert.ok(r.measurements.projectionAvailable>0);
  const deep=computeElbowJoint({...base,jointType:'in',projection:r.measurements.projectionAvailable+1});
  assert.equal(deep.valid,false);assert.match(deep.errors[0].message,/內壁|端面/);
  const touch=computeElbowJoint({...base,jointType:'in',projection:r.measurements.projectionAvailable});
  assert.equal(touch.valid,false);assert.match(touch.errors[0].message,/內壁|端面/);
});

test('rootGap changes outside cut surface; straight host location controls are ignored and preserved',()=>{
  const r=valid({rootGap:1.5}),ignored=valid({rootGap:1.5,offset:25,azimuth:90,jointPosition:510});
  assert.deepEqual(ignored.geometry.branch.outerCut,r.geometry.branch.outerCut);
  assert.equal(ignored.params.offset,25);assert.equal(ignored.params.azimuth,90);assert.equal(ignored.params.jointPosition,510);
  assert.ok(ignored.warnings.some(w=>w.includes('未套用')));
  for(const p of r.geometry.branch.outerCut)near(residual(p,304.8,111.05),0,2e-7);
});

test('large bending radius root residual stays accurate in cylinder limit',()=>{
  const Rc=1e6,R=100,b=50,beta=rad(45),f=elbowFrame(beta,Rc),P=torusSurfacePoint(beta,0,Rc,R);
  const foot=add(P,[0,0,b]),roots=torusLineIntersections(foot,f.normal,Rc,R),root=roots.filter(q=>q.normalDotDirection>0).sort((a,b)=>Math.abs(a.t)-Math.abs(b.t))[0];
  near(root.t,Math.sqrt(R*R-b*b)-R,3e-7);near(root.residual,0,3e-7);
});

test('manual low precision retains preview but blocks manufacturing; auto precision raises sample count',()=>{
  const manual=valid({samples:36,autoPrecision:false,tolerance:.01});
  assert.equal(manual.manufacturingReady,false);assert.equal(manual.templates.length,1);assert.ok(manual.precision.maxChordError>.01);
  const auto=valid({samples:36,autoPrecision:true,tolerance:.01});
  assert.equal(auto.manufacturingReady,true);assert.ok(auto.precision.effectiveSamples>36);
  near(auto.precision.maxChordError,auto.precision.sampledMaxChordError*auto.precision.guardFactor,1e-14);
  assert.ok(auto.wallEnvelope.rigorous===false);assert.equal(auto.capabilities.roughCut,false);
});

test('unsupported pad, non-ring torus, non-outgoing branch and bad exact counts fail clearly',()=>{
  for(const p of [{padEnabled:true},{bendRadius:100},{bendAngle:181},{branchSwivel:100},{bendPosition:0}])
    assert.equal(computeElbowJoint({...base,...p}).valid,false);
  assert.throws(()=>computeExactElbowStationTable(base,0),RangeError);
  assert.throws(()=>computeExactElbowHoleTable(base,3.2),RangeError);
  assert.equal(DEFAULT_ELBOW_PARAMS.hostType,'elbow');
});

test('unmet automatic precision at cap stops production with a clear failure',()=>{
  const r=computeElbowJoint({mainOD:20,mainWall:1,branchOD:5,branchWall:.5,branchLength:20,
    bendRadius:100,samples:36,tolerance:1e-9,autoPrecision:true,padEnabled:false});
  assert.equal(r.valid,false);assert.equal(r.manufacturingReady,false);
  assert.equal(r.precision.effectiveSamples,4096);assert.equal(r.precision.metTolerance,false);
  assert.equal(r.templates.length,0);assert.equal(r.geometry,null);assert.match(r.errors[0].message,/4096/);
});

test('non-quarter-divisible stations cannot miss opposing-wall insertion at theta90',()=>{
  const p={mainOD:200,mainWall:6,branchOD:100,branchWall:4,angle:90,bendRadius:304.8,
    bendPosition:45,surfaceClock:0,jointType:'in',holeGap:0,samples:37,tolerance:1,padEnabled:false};
  const trueStop=2*Math.sqrt(94**2-50**2);
  for(const autoPrecision of [true,false]) {
    const invalid=computeElbowJoint({...p,autoPrecision,projection:159.22});
    assert.equal(invalid.valid,false);assert.equal(invalid.manufacturingReady,false);
    const clear=computeElbowJoint({...p,autoPrecision,projection:0});
    assert.equal(clear.valid,true);near(clear.measurements.projectionAvailable,trueStop);
    assert.equal(clear.wallEnvelope.angularSamples,296);
  }
});
