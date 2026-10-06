import test from 'node:test';
import assert from 'node:assert/strict';
import {compareRoutePlans} from '../dist/assets/offset-planner.js';
import {routeSurfaceParts} from '../dist/assets/offset-model-data.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const vectorNear=(a,b)=>a.forEach((v,i)=>near(v,b[i]));
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const checkFrame=f=>{
  for(const v of [f.center,f.tangent,f.outside,f.side])assert.ok(v.every(Number.isFinite));
  for(const v of [f.tangent,f.outside,f.side])near(Math.hypot(...v),1);
  near(dot(f.tangent,f.outside),0);near(dot(f.tangent,f.side),0);near(dot(f.outside,f.side),0);
};
const comparison=changes=>compareRoutePlans({basis:'ports',layout:'rolling',run:800,roll:0,rise:500,planMaxJoints:8,...changes});

test('a valid three-elbow choice renders all six parts even though the original two-elbow solution failed',()=>{
  const routes=comparison({run:1435,roll:1000,rise:2071,bAxis:'y+'});assert.equal(routes.original.valid,false);
  const plan=routes.plans[0],before=structuredClone(plan),parts=routeSurfaceParts(plan);
  assert.equal(plan.elbows.length,3);assert.equal(parts.length,6);
  assert.deepEqual(parts.map(p=>p.id),plan.elements.map(e=>e.id));
  parts.forEach((part,i)=>{
    vectorNear(part.frames[0].center,plan.elements[i].start);
    vectorNear(part.frames.at(-1).center,plan.elements[i].finish);
    part.frames.forEach(checkFrame);
  });
  assert.deepEqual(plan,before);
});

test('four-elbow 3D includes both factory straight ends and keeps each arc on its specified radius',()=>{
  const plan=comparison({planPreference:'easy',aTangent:5,bTangent:7,planAOtherTangent:13,planBOtherTangent:17,planExtraInTangent:6,planExtraOutTangent:9}).plans.find(p=>p.elbows.length===4);
  assert.ok(plan);const parts=routeSurfaceParts(plan);
  for(const e of plan.elbows){
    const frames=parts.find(p=>p.id===e.id).frames;
    vectorNear(frames[0].center,e.start);vectorNear(frames.at(-1).center,e.finish);
    const arc=frames.slice(e.tangentBefore>0?1:0,e.tangentAfter>0?-1:undefined);
    assert.equal(arc.length,49);
    const center=e.arcStart.map((v,k)=>v+e.n[k]*e.radius);
    for(const frame of arc)near(Math.hypot(...frame.center.map((v,k)=>v-center[k])),e.radius);
    vectorNear(arc[0].center,e.arcStart);vectorNear(arc.at(-1).center,e.arcFinish);
    frames.forEach(checkFrame);
  }
});

test('vertical and inclined pipe surfaces have finite perpendicular cross sections',()=>{
  for(const direction of [[0,0,1],[0,0,-1],[1,0,0],[0,1,0],[.6,0,.8]]){
    const pipe={id:'P1',type:'pipe',direction,start:[10,20,30],finish:direction.map((v,k)=>[10,20,30][k]+200*v),length:200};
    const model=routeSurfaceParts({valid:true,elements:[pipe]})[0];model.frames.forEach(checkFrame);
    vectorNear(model.middle,direction.map((v,k)=>pipe.start[k]+100*v));
  }
});

test('single-part views isolate the requested pipe or elbow and invalid plans clear model data',()=>{
  const plan=comparison({run:1435,roll:1000,rise:2071,bAxis:'y+'}).plans[0];
  for(const e of plan.elements){const parts=routeSurfaceParts(plan,e.id);assert.equal(parts.length,1);assert.equal(parts[0].id,e.id);}
  assert.deepEqual(routeSurfaceParts(plan,'E99'),[]);
  assert.deepEqual(routeSurfaceParts({...plan,valid:false}),[]);assert.deepEqual(routeSurfaceParts(null),[]);
});
