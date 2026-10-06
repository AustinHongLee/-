import test from 'node:test';
import assert from 'node:assert/strict';
import {portScene,scenePoint,sceneDragDelta} from '../dist/assets/offset-input-visuals.js';
import {computeOffset} from '../dist/assets/offset-geometry.js';
import {originalRoutePlan} from '../dist/assets/offset-planner.js';
const input={basis:'ports',layout:'rolling',run:800,roll:300,rise:500};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('screen drags preserve the hidden coordinate and recover signed world movement in every view',()=>{
 for(const view of ['iso','front','top','side'])for(const [run,roll,rise]of [[800,300,500],[-600,200,-400],[0,0,0]]){
  const p={...input,run,roll,rise},frame=portScene(p,view).frame,keys=frame.axes,before=[run,roll,rise],after=[...before];
  after[['run','roll','rise'].indexOf(keys[0])]+=137;after[['run','roll','rise'].indexOf(keys[1])]-=83;
  const a=scenePoint(before,frame),b=scenePoint(after,frame),delta=sceneDragDelta(b.map((v,i)=>v-a[i]),frame);
  near(delta[keys[0]],137);near(delta[keys[1]],-83);
  assert.deepEqual(Object.keys(delta),keys);assert.equal(Object.keys(delta).length,2);
 }
});
test('front and top screen coordinates have the expected physical direction',()=>{
 const front=portScene(input,'front').frame,top=portScene(input,'top').frame;
 const a=sceneDragDelta([front.scale*20,-front.scale*30],front);near(a.run,20);near(a.rise,30);assert.equal(a.roll,undefined);
 const b=sceneDragDelta([top.scale*20,-top.scale*30],top);near(b.run,20);near(b.roll,30);assert.equal(b.rise,undefined);
});
test('the selectable original assembly retains the solved angles, all four gaps and the finished pipe',()=>{
 const raw={...input,aPortGap:2,bPortGap:3,aGap:4,bGap:5,trimA:6,trimB:7,aTangent:8,bTangent:9};
 const result=computeOffset(raw),before=structuredClone(result),plan=originalRoutePlan(result);assert.ok(plan?.valid);assert.deepEqual(result,before);
 assert.equal(plan.jointCount,4);near(plan.pipes[0].length,result.cutLength);near(plan.pipes[0].blankLength,result.blankLength);
 near(plan.elbows[0].angle,result.elbows.a.angle);near(plan.elbows[1].angle,result.elbows.b.angle);near(plan.closureError,0);near(plan.axisError,0);
 assert.equal(originalRoutePlan(computeOffset({...input,od:0})),null);
});
