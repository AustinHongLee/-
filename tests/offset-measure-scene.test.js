import test from 'node:test';
import assert from 'node:assert/strict';
import {portScene,routeInputScene,sceneReadouts} from '../dist/assets/offset-measure-scene.js';
import {compareRoutePlans,refitRouteGaps} from '../dist/assets/offset-planner.js';
import {gapInputTargets,gapInputValue,withGapInput,jointGapTarget} from '../dist/assets/offset-gap-inputs.js';
const raw={basis:'ports',layout:'rolling',run:800,roll:0,rise:500,aPortGap:2,bPortGap:2,aGap:2,bGap:2,planExtraGap:3,trimA:2,trimB:3,planMaxJoints:8};
const fullLead=(p=raw)=>compareRoutePlans(p).plans.find(r=>!r.original&&r.elbows.length===2&&r.elbows.every(e=>Math.abs(e.angle-90)<1e-6)&&(r.basePlan??r).elements[0].type==='pipe');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('uniform gap editing covers the fifth joint and reallocates two perpendicular straight lengths independently',()=>{
 const plan=fullLead(),before=structuredClone(plan);assert.ok(plan);let p=plan.params;
 for(const target of gapInputTargets(plan))p=withGapInput(p,target,4);
 assert.ok(gapInputTargets(plan).some(t=>t.field==='planExtraGap'));
 const next=refitRouteGaps(plan,p);assert.ok(next?.valid);assert.equal(next.jointCount,5);assert.equal(next.id,plan.id);
 assert.deepEqual(next.joints.map(j=>j.amount),[4,4,4,4,4]);near(next.pipes[0].length,800-2*152.4-12);near(next.pipes[1].length,500-2*152.4-8);
 assert.deepEqual(next.elbows.map(e=>[e.angle,e.u,e.v]),plan.elbows.map(e=>[e.angle,e.u,e.v]));near(next.closureError,0);assert.deepEqual(plan,before);
});
test('negative, incomplete or physically impossible gap edits cannot silently become another fitting arrangement',()=>{
 const plan=fullLead();for(const value of [null,-1,1e6])assert.equal(refitRouteGaps(plan,{...plan.params,aGap:value}),null);
 const next=refitRouteGaps(plan,{...plan.params,aGap:3.5});assert.ok(next?.valid);assert.equal(next.elbows.length,2);near(next.joints.find(j=>j.gapField==='aGap').amount,3.5);
 assert.equal(refitRouteGaps(plan,{...plan.params,aDonor:45}),null);assert.equal(refitRouteGaps(plan,{...plan.params,od:168.3}),null);
});
test('mandatory parts retain their own bolt allowances while uniform edits update only actual welds',()=>{
 const component={id:'C1',kind:'valve',name:'測試閥',target:'a',length:100,leftConnection:'bolt',rightConnection:'weld',leftGap:1,rightGap:2,placement:'center',distance:0,internalBolts:0};
 const plan=fullLead({...raw,components:[component]});assert.ok(plan?.valid);let p=plan.params;
 const targets=gapInputTargets(plan);assert.ok(targets.some(t=>t.componentId==='C1'&&t.field==='rightGap'));assert.ok(!targets.some(t=>t.componentId==='C1'&&t.field==='leftGap'));
 for(const target of targets)p=withGapInput(p,target,4);
 assert.equal(p.components[0].leftGap,1);assert.equal(p.components[0].rightGap,4);
 const next=refitRouteGaps(plan,p);assert.ok(next?.valid);assert.equal(next.components[0].length,100);assert.equal(next.joints.find(j=>j.kind==='bolt').amount,1);assert.ok(next.joints.filter(j=>j.kind!=='bolt').every(j=>j.amount===4));near(next.closureError,0);
 assert.match(routeInputScene(next).svg,/C1 閥組/);
});
test('four-bend assemblies retain stock end tangents and close after their shared added gap changes',()=>{
 const plan=compareRoutePlans({...raw,planPreference:'easy',planExtraInTangent:6,planExtraOutTangent:9}).plans.find(r=>r.elbows.length===4);assert.ok(plan);
 const next=refitRouteGaps(plan,{...plan.params,planExtraGap:4});assert.ok(next?.valid);assert.equal(next.elbows.length,4);
 for(const e of next.elbows.slice(1,-1)){near(e.tangentBefore,6);near(e.tangentAfter,9);}near(next.closureError,0);
});
test('every rendered joint refers to its actual input, and its diagram follows the selected five-joint assembly',()=>{
 const plan=fullLead();for(const joint of plan.joints){const target=jointGapTarget(joint);assert.ok(target);assert.equal(gapInputValue(plan.params,target),joint.amount);}
 for(const view of ['iso','front','top','side']){const scene=routeInputScene(plan,view,'J5');assert.ok(scene);assert.match(scene.svg,/5 個焊口/);assert.equal([...scene.svg.matchAll(/data-input-joint=/g)].length,5);assert.match(scene.svg,/data-input-joint="J5"/);assert.doesNotMatch(scene.svg,/NaN|Infinity/);}
 assert.equal(routeInputScene(null),null);assert.equal(routeInputScene({...plan,valid:false}),null);assert.equal(routeInputScene({...plan,legacy:true}),null);
});
test('signed and incomplete measurements stay explicit without invalid SVG coordinates or mutating the supplied dimensions',()=>{
 for(const [run,roll,rise] of [[1000,300,600],[-1000,-300,-600],[0,0,0],[null,300,600]]){
  const p={...raw,aAxis:'x+',bAxis:'x-',run,roll,rise},before=structuredClone(p);
  for(const view of ['iso','front','top','side']){const scene=portScene(p,view);assert.ok(Number.isFinite(scene.frame.scale));assert.doesNotMatch(scene.svg,/NaN|Infinity/);assert.match(scene.svg,/data-port="a"/);assert.match(scene.svg,/data-port="b"/);}
  assert.deepEqual(p,before);assert.match(sceneReadouts(p),/data-dimension="run"/);
 }
});
