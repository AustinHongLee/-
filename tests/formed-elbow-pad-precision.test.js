import test from 'node:test';
import assert from 'node:assert/strict';
import {computeElbowJoint} from '../dist/assets/elbow-geometry.js';
import {formedElbowPadBoundaryChordBound} from '../dist/assets/formed-elbow-pad.js';
import {fabricationReadiness} from '../dist/assets/exports.js';

const TAU=2*Math.PI,sub=(a,b)=>a.map((x,i)=>x-b[i]),norm=v=>Math.hypot(...v),lerp=(a,b,f)=>a.map((x,i)=>x+(b[i]-x)*f);
const base={hostType:'elbow',mainOD:200,mainWall:6,branchOD:100,branchWall:4,branchLength:200,bendRadius:304.8,bendAngle:90,bendPosition:45,surfaceClock:0,angle:90,branchSwivel:0,jointType:'on',motherOpening:true,rootGap:0,holeGap:.5,padEnabled:true,padThickness:6,padMargin:35,padClearance:1,padShape:'obround',padSplit:'single',samples:36,autoPrecision:true};
// Independent Cartesian torus formula; no production curve, station solver,
// surface mapper or numerical root routine is used by the oracle.
const surface=(beta,phi,Rc,radius)=>[(Rc+radius*Math.cos(phi))*Math.sin(beta),Rc-(Rc+radius*Math.cos(phi))*Math.cos(beta),radius*Math.sin(phi)];
function extradosBore(radius,theta,params){
  const Rc=params.bendRadius,tool=params.branchOD/2+params.padClearance,beta0=params.bendPosition*Math.PI/180;
  const w=tool*Math.cos(theta),z=tool*Math.sin(theta),u=Math.sqrt((Rc+Math.sqrt(radius*radius-z*z))**2-w*w),beta=beta0-Math.atan2(w,u),phi=Math.asin(z/radius);
  return {point:surface(beta,phi,Rc,radius),chart:[(Rc+params.mainOD/2)*beta,params.mainOD/2*phi]};
}

test('tight joint tolerance also refines both formed-plate bores and its curved marking boundary',()=>{
  const r=computeElbowJoint({...base,tolerance:.0001});assert.equal(r.valid,true,JSON.stringify(r.errors));assert.equal(r.manufacturingReady,true);
  const pad=r.geometry.pad;assert.ok(pad.outerHole3D.length-1>1024,'plate cannot remain capped below required host precision');
  let boreError=0,boundaryError=0;
  for(const [face,radius]of[['inner',pad.innerRadius],['outer',pad.outerRadius]]){
    const ring=pad[face+'Hole3D'],uv=pad[face+'HoleUV'],n=ring.length-1;
    for(let i=0;i<n;i++)for(const f of [.2,.4,.6,.8]){
      const q=extradosBore(radius,TAU*(i+f)/n,r.params);
      boreError=Math.max(boreError,norm(sub(q.point,lerp(ring[i],ring[i+1],f))));
      // Convert each face's viewer chart to the common physical marking chart.
      const a=[uv[i][0]*(pad.bendRadius+pad.innerRadius)/pad.bendRadius,uv[i][1]*pad.innerRadius/radius];
      const b=[uv[i+1][0]*(pad.bendRadius+pad.innerRadius)/pad.bendRadius,uv[i+1][1]*pad.innerRadius/radius];
      boreError=Math.max(boreError,norm(sub(q.chart,lerp(a,b,f))));
    }
  }
  for(let i=0;i<pad.outerParameter.length-1;i++)for(const f of [.2,.4,.6,.8]){
    const a=pad.outerParameter[i],b=pad.outerParameter[i+1],q=lerp(a,b,f);
    for(const radius of[pad.innerRadius,pad.outerRadius])boundaryError=Math.max(boundaryError,norm(sub(surface(q[0],q[1],pad.bendRadius,radius),lerp(surface(a[0],a[1],pad.bendRadius,radius),surface(b[0],b[1],pad.bendRadius,radius),f))));
  }
  assert.ok(boreError<=r.params.tolerance,`independent bore error ${boreError}`);
  assert.ok(boundaryError<=r.params.tolerance,`independent edge error ${boundaryError}`);
  assert.ok(r.precision.maxChordError>=Math.max(boreError,boundaryError));
  assert.equal(r.verification.find(v=>v.id==='formed-pad-chord').status,'pass');
});

test('manual low precision cannot release a plate contour that exceeds the requested tolerance',()=>{
  const r=computeElbowJoint({...base,autoPrecision:false,tolerance:.0001});assert.equal(r.valid,true,JSON.stringify(r.errors));
  const plate=r.verification.find(v=>v.id==='formed-pad-chord');assert.ok(plate.value>r.params.tolerance);assert.equal(plate.status,'warning');
  assert.equal(r.manufacturingReady,false);assert.equal(fabricationReadiness(r).ready,false);
});

test('marking-segment second derivative bound covers all offsets and interior fractions',()=>{
  const context={bendRadius:304.8,innerRadius:100,outerRadius:106};
  for(const a of[[.1,-1],[.3,0],[1.2,1.3],[2.7,3]])for(const delta of[[.004,.01],[.02,-.02],[-.05,.03],[0,.03],[.03,0]]){
    const b=a.map((x,i)=>x+delta[i]),bound=formedElbowPadBoundaryChordBound(a,b,context);
    for(let layer=0;layer<=8;layer++)for(let i=1;i<32;i++){
      const radius=100+6*layer/8,f=i/32,q=lerp(a,b,f),error=norm(sub(surface(q[0],q[1],304.8,radius),lerp(surface(a[0],a[1],304.8,radius),surface(b[0],b[1],304.8,radius),f)));
      assert.ok(error<=bound+1e-10,`${error} > ${bound}`);
    }
  }
});

test('unattainable plate boundary precision stops at a bounded allocation and emits no manufacturing geometry',()=>{
  const r=computeElbowJoint({...base,tolerance:1e-10});assert.equal(r.valid,false);assert.equal(r.manufacturingReady,false);
  assert.equal(r.geometry,null);assert.deepEqual(r.templates,[]);assert.ok(r.errors.some(e=>/上限|容差/.test(e.message)));
});
