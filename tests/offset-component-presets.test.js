import test from 'node:test';
import assert from 'node:assert/strict';
import {computeOffset} from '../dist/assets/offset-geometry.js';
import {originalRoutePlan,compareRoutePlans} from '../dist/assets/offset-planner.js';
import {validateComponents,installRouteComponents} from '../dist/assets/offset-components.js';
import {defaultComponentFlange,componentFlangeReference,flangePairLength,componentLengthBasis} from '../dist/assets/offset-component-presets.js';
import {componentLocations,componentPlacementPreview} from '../dist/assets/offset-component-placement.js';
import {offsetProjectJSON,readOffsetProject} from '../dist/assets/offset-exports.js';
import {buildRoutePlanWorkOrder,routePlanCSV} from '../dist/assets/offset-plan-exports.js';
import {offsetRecoveryItems} from '../dist/assets/offset-recovery.js';

const input={basis:'ports',layout:'rolling',run:800,rise:500,roll:0,od:60.3};
const flange=(data={})=>{const f={...defaultComponentFlange(60.3),gasket:3,...data};return {id:'C1',kind:'flangePair',name:'',target:'s1',length:flangePairLength(f),leftConnection:'weld',rightConnection:'weld',leftGap:2,rightGap:4,placement:'center',distance:0,internalBolts:1,flange:f};};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('a pair of RF WN flanges consumes two verified bevel-to-face lengths and exactly one compressed gasket',()=>{
  const c=flange(),ref=componentFlangeReference(c.flange),raw=originalRoutePlan(computeOffset(input)),plan=installRouteComponents(raw,[c]);
  near(ref.flangeLength,(2.44+1/16)*25.4);near(c.length,130.127);assert.equal(plan.valid,true);
  near(plan.totalPipe,raw.totalPipe-c.length-6);near(plan.closureError,0);assert.equal(plan.boltCount,1);assert.equal(plan.jointCount,raw.jointCount+2);
  const higher=flange({pressureClass:'300'});near(higher.length,142.827);near(higher.length-c.length,12.7);
});
test('gasket zero is explicit and missing, nominal strings or invalid gasket thickness never produce a length',()=>{
  near(flangePairLength({...flange().flange,gasket:0}),127.127);
  for(const gasket of [null,'3',-1,NaN,Infinity,101])assert.equal(flangePairLength({...flange().flange,gasket}),null);
});
test('SO, unrecorded sizes, higher classes and other faces never borrow WN RF reference lengths',()=>{
  for(const delta of [{end:'so'},{size:'14'},{pressureClass:'600'},{facing:'FF'},{facing:'RTJ'}]){
    const c=flange(delta);assert.equal(c.length,null);assert.ok(validateComponents([c],input.od).length);
    c.flange.mode='measured';c.length=205;assert.deepEqual(validateComponents([c],input.od),[]);
    const raw=originalRoutePlan(computeOffset(input)),p=installRouteComponents(raw,[c]);assert.equal(p.valid,true);near(raw.totalPipe-p.totalPipe,211);
  }
});
test('reference provenance cannot survive changed lengths, mismatched pipe size, connections or injected fields',()=>{
  const c=flange();
  for(const changed of [{...c,length:c.length+1},{...c,leftConnection:'bolt'},{...c,internalBolts:0},{...c,flange:{...c.flange,source:'fake'}},{...c,flange:{...c.flange,gasket:'3'}}])assert.ok(validateComponents([changed],input.od).length);
  const wrong=computeOffset({...input,od:114.3,components:[c]});assert.equal(wrong.valid,false);assert.match(wrong.errors[0].message,/OD 不同/);
  const recovery=offsetRecoveryItems(wrong)[0];assert.equal(recovery.route.field,'components');assert.equal(recovery.route.editor,'stock');assert.equal(recovery.actionLabel,'修改零件規格／尺寸');
});
test('reference and measured records round trip without relabelling legacy measurements',()=>{
  for(const c of [flange(),{...flange(),length:155.6,flange:{...flange().flange,mode:'measured'}}]){
    const saved=offsetProjectJSON({...input,components:[c]});assert.deepEqual(readOffsetProject(saved).params.components,[c]);
  }
  const legacy=flange();delete legacy.flange;legacy.length=189;assert.deepEqual(readOffsetProject(offsetProjectJSON({...input,components:[legacy]})).params.components,[legacy]);assert.equal(componentLengthBasis(legacy),'實測組立總長');
  const tampered=JSON.parse(offsetProjectJSON({...input,components:[flange()]}));tampered.params.components[0].length=12;assert.throws(()=>readOffsetProject(JSON.stringify(tampered)));
});
test('material exports distinguish manufacturer reference and measured length and retain the selected specification',()=>{
  const c=flange(),plan=originalRoutePlan(computeOffset({...input,components:[c]})),html=buildRoutePlanWorkOrder(plan),csv=routePlanCSV(plan);
  for(const value of ['NPS 2','Class 150','WN','RF','Texas Flange','壓緊墊片 3']){assert.ok(html.includes(value),value);assert.ok(csv.includes(value),value);}
  assert.ok(!html.includes('130.13 mm；實測組立總長'));
  const measured={...c,length:188,flange:{...c.flange,mode:'measured'}};
  const m=buildRoutePlanWorkOrder(originalRoutePlan(computeOffset({...input,components:[measured]})));assert.ok(m.includes('188 mm；實測組立總長'));
});
test('placement preview reports actual remaining pipe, unavailable lines and fixed-stub shortages without mutating the route',()=>{
  const raw=originalRoutePlan(computeOffset(input)),before=structuredClone(raw),c=flange();
  const fits=componentPlacementPreview(raw,[],c,20);assert.equal(fits.state,'fit');assert.equal(fits.pipes.length,2);near(fits.pipes.reduce((n,p)=>n+p.length,0),raw.totalPipe-c.length-6);
  const shortage=componentPlacementPreview(raw,[],{...c,length:10000,flange:{...c.flange,mode:'measured'}},100);assert.equal(shortage.state,'search');assert.match(shortage.message,/放不進/);
  assert.equal(componentPlacementPreview(raw,[],{...c,target:'s3'},100).state,'search');
  assert.equal(componentPlacementPreview(raw,[],{...c,placement:'fromA',distance:10},100).state,'search');
  assert.deepEqual(raw,before);
  assert.equal(componentPlacementPreview(null,[],c,100,input.od).state,'search');
  assert.match(componentPlacementPreview(null,[],c,100,114.3).message,/OD 不同/);
});
test('location picker cannot mistake a trailing pipe for another middle straight, and distinguishes occupied locations',()=>{
  const raw=compareRoutePlans(input).plans.find(p=>p.elbows.length===2&&p.elements.at(-1).type==='pipe');assert.ok(raw);
  const list=componentLocations(raw,[{...flange(),target:'b'}]);assert.equal(list.find(l=>l.target==='s2').pipe,null);assert.equal(list.find(l=>l.target==='s3').pipe,null);assert.equal(list.find(l=>l.target==='b').occupied,'C1');assert.ok(list.find(l=>l.target==='b').span>0);
  assert.equal(componentLocations(raw,[{...flange(),target:'b'}],'C1').find(l=>l.target==='b').occupied,null);
});
test('common flange size follows the pipe OD, including fractional NPS; unsupported diameters stay measured',()=>{
  assert.equal(defaultComponentFlange(48.3).size,'1 1/2');assert.equal(defaultComponentFlange(48.3).mode,'reference');assert.equal(defaultComponentFlange(219.1).mode,'reference');assert.equal(defaultComponentFlange(355.6).mode,'measured');assert.equal(defaultComponentFlange(200).size,'');assert.equal(defaultComponentFlange(200).mode,'measured');
});
test('expanded common-size references keep each class own OD and WN length, including fractional sizes and NPS 12',()=>{
  const samples=[['1 1/4','150',4.62,2.19],['2 1/2','300',7.5,2.94],['3 1/2','300',9,3.13],['5','150',10,3.44],['8','150',13.5,3.94],['10','300',17.5,4.56],['12','150',19,4.44],['12','300',20.5,5.06]];
  for(const [size,pressureClass,od,length] of samples){const ref=componentFlangeReference({...flange().flange,size,pressureClass});near(ref.flangeOD,od*25.4);near(ref.flangeLength,(length+1/16)*25.4);}
});
