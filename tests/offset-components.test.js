import test from 'node:test';
import assert from 'node:assert/strict';
import {computeOffset} from '../dist/assets/offset-geometry.js';
import {originalRoutePlan,compareRoutePlans} from '../dist/assets/offset-planner.js';
import {installRouteComponents,validateComponents} from '../dist/assets/offset-components.js';
import {routeSurfaceParts} from '../dist/assets/offset-model-data.js';
import {offsetProjectJSON,readOffsetProject} from '../dist/assets/offset-exports.js';
import {buildRoutePlanWorkOrder,routePlanCSV} from '../dist/assets/offset-plan-exports.js';
import {assemblySVG} from '../dist/assets/offset-workflow-ui.js';
const input={basis:'ports',layout:'rolling',run:800,rise:500,roll:0,aPortGap:3,bPortGap:4,aGap:2,bGap:2,trimA:2,trimB:3};
const component=(changes={})=>({id:'C1',kind:'valve',name:'隔離閥 V-101',target:'s1',length:200,leftConnection:'weld',rightConnection:'weld',leftGap:2,rightGap:3,placement:'center',distance:0,internalBolts:2,...changes});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} ≠ ${b}`);
const closure=plan=>{near(plan.closureError,0);plan.elements.forEach((e,i)=>{for(let k=0;k<3;k++){near(e.start[k],plan.joints[i].finish[k]);near(e.finish[k],plan.joints[i+1].start[k]);}});};
test('inline valve replaces occupied pipe and both gaps exactly once, preserving independently checked faces',()=>{
  const raw=originalRoutePlan(computeOffset(input)),snapshot=structuredClone(raw),plan=installRouteComponents(raw,[component()]);
  assert.equal(plan.valid,true);assert.equal(plan.pipes.length,2);near(plan.totalPipe,raw.totalPipe-205);assert.equal(plan.jointCount,6);assert.equal(plan.boltCount,2);
  near(plan.pipes[0].length,plan.pipes[1].length);for(const p of plan.pipes)near(p.blankLength,p.length+5);closure(plan);assert.deepEqual(raw,snapshot);
});
test('A/B side fixed pipe lengths change installation positions without moving elbow faces',()=>{
  const raw=originalRoutePlan(computeOffset(input));
  for(const placement of ['fromA','fromB']){const p=installRouteComponents(raw,[component({placement,distance:125})]);assert.equal(p.valid,true);near(p.pipes[placement==='fromA'?0:1].length,125);closure(p);assert.deepEqual(p.elbows,raw.elbows);}
});
test('actual bolts and welds are separate counts, including the declared assembled internal interfaces',()=>{
  const p=installRouteComponents(originalRoutePlan(computeOffset(input)),[component({kind:'flangePair',internalBolts:1,leftConnection:'bolt',rightConnection:'bolt'})]);
  assert.equal(p.jointCount,4);assert.equal(p.boltCount,3);assert.equal(p.connectionCount,6);closure(p);
});
test('port insertion replaces the existing boundary gap rather than adding it again',()=>{
  for(const target of ['a','b']){
    const base=compareRoutePlans(input).plans.find(p=>!p.original&&(target==='a'?p.elements[0].type==='pipe':p.elements.at(-1).type==='pipe'));
    assert.ok(base);const p=installRouteComponents(base,[component({target,length:50,leftGap:1,rightGap:2})]);assert.equal(p.valid,true);
    const before=target==='a'?base.pipes[0]:base.pipes.at(-1),after=p.pipes.find(q=>q.id===before.id);
    near(after.length,before.length+(target==='a'?input.aPortGap:input.bPortGap)-53);assert.equal(p.jointCount,base.jointCount+1);closure(p);
    assert.equal(target==='a'?p.elements[0].id:p.elements.at(-1).id,'C1');
  }
});
test('mandatory port parts cause search to add a usable leading/trailing straight and obey the total weld cap',()=>{
  for(const target of ['a','b']){const raw={...input,components:[component({target,length:100})],planMaxJoints:6};const original=originalRoutePlan(computeOffset(raw));assert.equal(original.valid,false);const result=compareRoutePlans(raw);assert.ok(result.plans.length);for(const p of result.plans){assert.ok(p.jointCount<=6);assert.equal(p.components.length,1);assert.ok(p.pipes.every(e=>e.length>=100-1e-6));closure(p);}}
});
test('insufficient space, fixed stubs below minimum, and absent target lines never leave a fabrication result',()=>{
  const raw=originalRoutePlan(computeOffset(input));for(const changes of [{length:10000},{placement:'fromA',distance:10},{target:'s3'}]){const p=installRouteComponents(raw,[component(changes)],100);assert.equal(p.valid,false);assert.ok(p.componentIssues.length);}
});
test('multiple required locations preserve every component and all joints with unequal end gaps',()=>{
  const base=compareRoutePlans({...input,run:1400,rise:1000,planMaxJoints:24}).plans.find(p=>p.elements[0].type==='pipe'&&p.elements.at(-1).type==='pipe');assert.ok(base);
  const parts=[component({id:'C1',target:'a',length:50}),component({id:'C2',target:'s1',length:60}),component({id:'C3',target:'b',length:70,leftConnection:'bolt',rightGap:0})];
  const p=installRouteComponents(base,parts);assert.equal(p.valid,true);assert.equal(p.components.length,3);closure(p);assert.equal(new Set(p.joints.map(j=>j.id)).size,p.joints.length);
});
test('blank or invalid sizes, unknown fields, duplicate ids or duplicate locations are rejected before geometry',()=>{
  for(const changes of [{length:null},{leftGap:null},{length:-1},{leftGap:Infinity},{target:'s4'},{internalBolts:1.5},{kind:'x'},{unknown:1}])assert.ok(validateComponents([component(changes)]).length);
  assert.ok(validateComponents([component(),component({id:'C2'})]).length);assert.ok(validateComponents([component(),component({target:'a'})]).length);
  assert.equal(computeOffset({...input,components:[component({length:null})]}).valid,false);
});
test('v4 projects preserve full measured component inputs and v3 projects migrate to an empty list',()=>{
  const json=offsetProjectJSON({...input,components:[component()]});const data=JSON.parse(json);assert.equal(data.version,4);assert.deepEqual(readOffsetProject(json).params.components,[component()]);
  const old=JSON.parse(offsetProjectJSON(input));old.version=3;delete old.params.components;assert.deepEqual(readOffsetProject(JSON.stringify(old)).params.components,[]);
  data.params.components[0].length=null;assert.throws(()=>readOffsetProject(JSON.stringify(data)));
});
test('3D, SVG, CSV and work orders use every split pipe and measured component length',()=>{
  const plan=originalRoutePlan(computeOffset({...input,components:[component({name:'閥 <V101>'})]}));assert.equal(plan.valid,true);
  const surfaces=routeSurfaceParts(plan);assert.equal(surfaces.length,5);for(const s of surfaces){const e=plan.elements.find(e=>e.id===s.id);for(let k=0;k<3;k++){near(s.frames[0].center[k],e.start[k]);near(s.frames.at(-1).center[k],e.finish[k]);}}
  const svg=assemblySVG(plan,{interactive:true}),html=buildRoutePlanWorkOrder(plan),csv=routePlanCSV(plan);assert.ok(svg.includes('閥 &lt;V101&gt;'));assert.ok(html.includes('實測組立總長'));assert.ok(html.includes('鎖')||html.includes('焊接'));assert.ok(csv.includes('C1'));assert.ok(csv.includes('P1a'));assert.ok(csv.includes('P1b'));assert.ok(html.includes('200 mm'));
});
test('reported port shortage is the single required stub deficit, without counting a nonexistent side',()=>{
  const base=compareRoutePlans(input).plans.find(p=>!p.original&&p.elements[0].type==='pipe');assert.ok(base);
  const available=base.pipes[0].length+input.aPortGap;
  const p=installRouteComponents(base,[component({target:'a',length:available-95,leftGap:2,rightGap:3})],100);
  assert.equal(p.valid,false);assert.match(p.componentIssues[0],/至少還缺 10 mm/);
});
test('required weld metadata points to a concrete cap that can fit mandatory port assemblies',()=>{
  const parts=[component({target:'a',length:100}),component({id:'C2',target:'b',length:100})];
  const limited=compareRoutePlans({...input,components:parts,planMaxJoints:6});assert.equal(limited.plans.length,0);assert.ok(limited.requiredJoints>6);
  const relaxed=compareRoutePlans({...input,components:parts,planMaxJoints:limited.requiredJoints});assert.ok(relaxed.plans.length);assert.ok(relaxed.plans.every(p=>p.jointCount<=limited.requiredJoints));
});
test('the last middle line must be between two elbows, and cannot silently become a trailing port pipe',()=>{
  const base=compareRoutePlans(input).plans.find(p=>!p.original&&p.elements.at(-1).type==='pipe');assert.ok(base);
  const p=installRouteComponents(base,[component({target:'s'+base.elbows.length,length:10})]);assert.equal(p.valid,false);assert.match(p.componentIssues[0],/沒有可放/);
});
test('custom component labels cannot execute spreadsheet formulas, while numeric lengths remain numeric',()=>{
  for(const name of ['=1+1',' +1','\t@SUM(1)','-1']){const p=originalRoutePlan(computeOffset({...input,components:[component({name})]})),csv=routePlanCSV(p);assert.ok(csv.includes('"\''+name+'"'));assert.ok(csv.includes('"200"'));}
});
test('five locations have complete paginated material, coordinates and connection tables',()=>{
  const parts=['a','s1','s2','s3','b'].map((target,i)=>component({id:'C'+(i+1),target,length:50,internalBolts:0,name:'現場指定零件'.repeat(8)}));
  const p=compareRoutePlans({...input,run:6000,rise:3500,planMaxJoints:24,components:parts}).plans[0];assert.ok(p);assert.equal(p.elbows.length,4);assert.equal(p.components.length,5);closure(p);
  const html=buildRoutePlanWorkOrder(p);assert.match(html,/材料順序 · 續表/);assert.match(html,/零件世界座標 · 續表/);assert.match(html,/接合位置與間隙 · 續表/);
  for(const e of p.elements)assert.ok(html.includes(e.id));for(const j of p.joints)assert.ok(html.includes(j.id+' · '));
  assert.equal(computeOffset({...input,basis:'intersections',components:[component()]}).errors[0].field,'basis');
});
