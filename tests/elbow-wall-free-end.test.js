import test from 'node:test';
import assert from 'node:assert/strict';
import {computeElbowJoint} from '../dist/assets/elbow-geometry.js';
import {fabricationReadiness} from '../dist/assets/exports.js';

const base={mainOD:200,mainWall:6,bendRadius:304.8,bendAngle:90,bendPosition:45,surfaceClock:0,angle:85,branchSwivel:0,branchOD:100,branchWall:20,branchLength:.001,jointType:'on',motherOpening:true,samples:72,autoPrecision:false,tolerance:1,padEnabled:false};
const M=base.bendRadius+base.mainOD/2,delta=(90-base.angle)*Math.PI/180;
// In the beta bending plane, the extrados is an independent circle of radius
// M about (0,Rc). A branch wall radius r at theta=pi cuts at this exact t.
const circleCut=r=>Math.sqrt(M*M-(M*Math.sin(delta)-r)**2)-M*Math.cos(delta);

test('a wall-interior cut beyond the free end is rejected even when both face contours had positive lengths',()=>{
  const ro=base.branchOD/2,ri=ro-base.branchWall,oldEnd=Math.max(circleCut(ro),circleCut(ri))+base.branchLength;
  const criticalRadius=M*Math.sin(delta),criticalCut=M*(1-Math.cos(delta));
  assert.ok(criticalRadius>ri&&criticalRadius<ro);assert.ok(oldEnd<criticalCut);
  // The midpoint-quarter radius used by the collision probes also violates
  // the independent circular-section solution; no interpolation is involved.
  assert.ok(circleCut(35)>oldEnd);
  const r=computeElbowJoint(base);assert.equal(r.valid,false);assert.equal(r.manufacturingReady,false);
  assert.equal(r.geometry,null);assert.deepEqual(r.templates,[]);assert.equal(fabricationReadiness(r).ready,false);
  assert.ok(r.errors.some(e=>e.field==='branchLength'&&/自由直端/.test(e.message)));
});

test('exact wall-interior touch stops output and a positive retained clearance recovers the same geometry',()=>{
  const criticalRadius=M*Math.sin(delta),ro=criticalRadius+5,ri=criticalRadius-5;
  const contactLength=M-Math.sqrt(M*M-25),fixture={...base,branchOD:2*ro,branchWall:ro-ri,branchLength:contactLength};
  const touching=computeElbowJoint(fixture);assert.equal(touching.valid,false);assert.ok(touching.errors.some(e=>e.field==='branchLength'));
  const positive=computeElbowJoint({...fixture,branchLength:contactLength+.001});assert.equal(positive.valid,true,JSON.stringify(positive.errors));assert.equal(positive.manufacturingReady,true);
  const exactCut=M*(1-Math.cos(delta));assert.ok(Math.abs(positive.geometry.branch.axisEnd-exactCut-.001)<1e-7);
  assert.equal(positive.params.branchLength,contactLength+.001,'gate must not silently extend the requested value');
});
