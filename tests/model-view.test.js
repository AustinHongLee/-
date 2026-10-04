import test from 'node:test';
import assert from 'node:assert/strict';
import {jointViewCandidates,modelPointReadback} from '../dist/assets/model-view.js';
import {positioningFrame} from '../dist/assets/model-positioning.js';
import {DEFAULT_PARAMS,rotateAroundMain} from '../dist/assets/geometry.js';
import {DEFAULT_ELBOW_PARAMS} from '../dist/assets/elbow-geometry.js';
import {DEFAULT_CONICAL_PARAMS} from '../dist/assets/conical-geometry.js';
import {jointPositionForSurface} from '../dist/assets/field-datums.js';
import {resolveElbowAlignment} from '../dist/assets/elbow-axis.js';

const near=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const vectorNear=(a,b)=>a.forEach((v,i)=>near(v,b[i]));
const straight={...DEFAULT_PARAMS,hostType:'straight',mainLength:1200,jointPosition:500,angle:52,offset:20,azimuth:17};
const elbow={...DEFAULT_ELBOW_PARAMS,elbowAlignment:'free',bendPosition:42,surfaceClock:67,angle:65,branchSwivel:22};
const cone={...DEFAULT_CONICAL_PARAMS,mainLength:800,jointPosition:400,surfaceClock:225,angle:113,branchSwivel:-14};

test('all local camera candidates face the actual outside normal with a unit orthogonal up vector',()=>{
  for(const p of [straight,elbow,cone]){
    const frame=positioningFrame(p),candidates=jointViewCandidates(p);assert.equal(candidates.length,4);
    for(const c of candidates){
      near(Math.hypot(...c.direction),1);near(Math.hypot(...c.up),1);near(dot(c.direction,c.up),0);
      assert.ok(dot(c.direction,frame.normal)>.7);assert.ok(dot(c.up,frame.normal)>0);
      // Independent projection computes the actual visible branch span.
      const projection=frame.direction.map((v,i)=>v-dot(frame.direction,c.direction)*c.direction[i]);
      near(c.score,Math.hypot(...projection));
    }
    assert.equal(new Set(candidates.map(c=>c.direction.map(v=>v.toFixed(6)).join(','))).size,4);
    for(let i=1;i<candidates.length;i++)assert.ok(candidates[i-1].score>=candidates[i].score);
  }
});

test('camera orientation and scores rotate with the physical straight joint rather than a fixed world camera',()=>{
  for(const change of [37,90,173,269]){
    const baseline=jointViewCandidates(straight),rotated=jointViewCandidates({...straight,azimuth:straight.azimuth+change});
    for(const c of baseline){
      const direction=rotateAroundMain(c.direction,change),up=rotateAroundMain(c.up,change);
      const match=rotated.find(q=>Math.hypot(...q.direction.map((v,i)=>v-direction[i]))<1e-9);assert.ok(match);
      vectorNear(match.up,up);near(match.score,c.score);
    }
  }
});

test('camera candidates rotate consistently around the elbow local tangent as the selected side changes',()=>{
  const rotate=(v,axis,angle)=>{const a=angle*Math.PI/180,co=Math.cos(a),si=Math.sin(a),cross=[axis[1]*v[2]-axis[2]*v[1],axis[2]*v[0]-axis[0]*v[2],axis[0]*v[1]-axis[1]*v[0]];return v.map((x,i)=>x*co+cross[i]*si+axis[i]*dot(axis,v)*(1-co));};
  const axis=positioningFrame(elbow).tangent;
  for(const change of [45,121,270]){
    const baseline=jointViewCandidates(elbow),rotated=jointViewCandidates({...elbow,surfaceClock:elbow.surfaceClock+change});
    for(const c of baseline){
      const direction=rotate(c.direction,axis,-change),up=rotate(c.up,axis,-change);
      const match=rotated.find(q=>Math.hypot(...q.direction.map((v,i)=>v-direction[i]))<1e-9);assert.ok(match);
      vectorNear(match.up,up);near(match.score,c.score);
    }
  }
});

test('straight readback reports the outer-surface distance and actual eccentric clock, not virtual J',()=>{
  const p={...straight,mainOD:200,offset:20,azimuth:0};p.jointPosition=jointPositionForSurface(p,600);
  assert.notEqual(p.jointPosition,600);
  const readback=modelPointReadback(p);
  assert.deepEqual(readback,{position:'A 起 600 mm · 左上 11.5° · 偏心 20 mm',angle:'與主管軸 52°'});
  assert.equal(modelPointReadback({...p,offset:-20,jointPosition:jointPositionForSurface({...p,offset:-20},600)}).position,'A 起 600 mm · 右上 348.5° · 偏心 -20 mm');
});

test('elbow readback uses outside-back arc distance, full section clock, and local tangent angle',()=>{
  const p={...elbow,mainOD:200,bendRadius:300,bendPosition:45,surfaceClock:90,angle:65,branchSwivel:22};
  assert.deepEqual(modelPointReadback(p),{position:'A 起 S背 314.2 mm · 左側 90°',angle:'與截面切線 65° · 側轉 22°'});
  assert.match(modelPointReadback({...p,surfaceClock:205}).position,/內腹偏右 205°$/);
});

test('A and B coaxial views and readbacks resolve location even when derived inputs are stale or nonfinite',()=>{
  for(const alignment of ['a-axis','b-axis']){
    const p={...elbow,elbowAlignment:alignment,bendPosition:NaN,surfaceClock:NaN,angle:NaN,branchSwivel:NaN},resolved=resolveElbowAlignment(p);
    assert.deepEqual(jointViewCandidates(p),jointViewCandidates(resolved));
    assert.deepEqual(modelPointReadback(p),modelPointReadback(resolved));
    assert.match(modelPointReadback(p).position,/^A 起 S背 [\d.]+ mm · 外背 0°$/);
    assert.equal(modelPointReadback(p).angle,`沿 ${alignment==='a-axis'?'A':'B'} 端中心線`);
  }
});

test('conical readback keeps axial X distinct from slant distance and normal angle distinct from global-axis angle',()=>{
  assert.deepEqual(modelPointReadback(cone),{position:'A 起 X 400 mm · 右下 225°',angle:'與母線 113° · 側轉 -14°'});
  assert.match(modelPointReadback({...cone,surfaceClock:359.99}).position,/上側 0°$/);
  assert.match(modelPointReadback({...cone,surfaceClock:-.01}).position,/上側 0°$/);
});

test('bad mother dimensions or nonphysical frames suppress camera and numeric readbacks',()=>{
  const invalid=[null,{}, {...straight,hostType:'unknown'}, {...straight,mainOD:NaN}, {...straight,mainOD:0}, {...straight,mainLength:0}, {...straight,mainWall:straight.mainOD/2}, {...straight,offset:straight.mainOD}, {...straight,angle:0}, {...elbow,bendRadius:elbow.mainOD/2}, {...elbow,bendPosition:0}, {...elbow,branchSwivel:180}, {...cone,mainEndOD:cone.mainOD}, {...cone,mainEndOD:NaN}];
  for(const p of invalid){assert.equal(jointViewCandidates(p),null);assert.equal(modelPointReadback(p),null);}
});
