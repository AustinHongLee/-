import test from 'node:test';
import assert from 'node:assert/strict';
import {computeOffset} from '../dist/assets/offset-geometry.js';
import {compareRoutePlans} from '../dist/assets/offset-planner.js';
import {offsetRecoveryItems,offsetFieldRoute,nextOffsetAction} from '../dist/assets/offset-recovery.js';
const sample={basis:'ports',layout:'rolling',run:800,roll:0,rise:500,aPortGap:2,aGap:2,bGap:2,bPortGap:2};
const recover=(overrides,options)=>{const result=computeOffset({...sample,...overrides});assert.equal(result.valid,false);return {result,items:offsetRecoveryItems(result,options)};};

test('blank XYZ is distinct from zero and leads back to the measured coordinate',()=>{
 const {result,items}=recover({run:null});assert.equal(result.context,undefined);assert.equal(items[0].inputError,true);
 assert.equal(items[0].route.field,'run');assert.equal(items[0].route.editor,'position');assert.match(items[0].detail,/明確填 0/);
 assert.equal(computeOffset(sample).valid,true);
});
test('impossible geometry leads to directions or supply while preserving fixed measured XYZ',()=>{
 const {result,items}=recover({run:100}),before=structuredClone(result);assert.ok(result.context);
 assert.equal(items[0].code,'route-unavailable');assert.equal(items[0].inputError,false);assert.equal(items[0].route.field,'aAxis');
 assert.equal(items[0].route.graphicalAxis,true);assert.equal(items[0].secondary[0].route.field,'aRadius');
 assert.match(items[0].detail,/96 mm/);assert.match(items[0].detail,/304.8 mm/);assert.equal(items[0].canCompare,true);
 assert.deepEqual(result,before);assert.equal(result.params.run,100);
});
test('insufficient donor states required versus available angle and shared-stock recovery edits the shared source',()=>{
 const {result,items}=recover({aDonor:20,bDonor:20},{sharedStock:true});assert.equal(items.length,1);
 assert.equal(items[0].code,'stock-angle');assert.equal(items[0].route.field,'aDonor');assert.equal(items[0].route.editor,'stock');
 assert.equal(items[0].sources.length,2);assert.ok(items[0].requiredAngle>35&&items[0].requiredAngle<36);
 assert.match(items[0].detail,/原件只有 20°/);assert.match(items[0].title,/兩端/);assert.equal(result.params.aDonor,20);
 const independent=recover({bDonor:20},{sharedStock:false}).items;assert.equal(independent[0].route.field,'bDonor');
});
test('factory mismatch and invalid donor values provide different recovery without changing stock type',()=>{
 const {result,items}=recover({aKind:'factory',aFactoryAngle:90,aTakeout:152.4});assert.equal(items[0].code,'fixed-angle');
 assert.equal(items[0].route.field,'aFactoryAngle');assert.match(items[0].detail,/整件是 90°/);assert.equal(result.params.aKind,'factory');
 const bad=recover({aDonor:null}).items;assert.equal(bad[0].inputError,true);assert.equal(bad[0].code,'input');assert.match(bad[0].detail,/未填/);
});
test('a separate B radius and an incomplete custom direction lead to the actual hidden controls',()=>{
 const {items}=recover({bRadius:30},{sharedStock:false});assert.equal(items[0].route.editor,'stock');assert.equal(items[0].route.end,'b');
 assert.equal(items[0].route.field,'bRadius');assert.match(items[0].detail,/57.15 mm/);
 const custom=recover({aAxis:'custom',aAxisX:1,aAxisY:null,aAxisZ:0}).items;
 assert.equal(custom[0].route.field,'aAxisY');assert.equal(custom[0].route.graphicalAxis,false);
 const route=offsetFieldRoute('bRadius',computeOffset(sample).params,{sharedStock:true});assert.equal(route.field,'aRadius');
});
test('too-short pipe explains the shortfall and preserves the shop minimum for other routes',()=>{
 const {result,items}=recover({minStraight:1000});assert.equal(items[0].code,'short-pipe');assert.equal(items[0].route.editor,'gaps');
 assert.equal(items[0].route.field,'minStraight');assert.match(items[0].detail,/下限 1000 mm/);assert.ok(result.errors[0].cutLength<1000);
 assert.equal(result.params.minStraight,1000);assert.equal(items[0].canCompare,true);
});
test('next action checks each input panel before calculation and keeps failed calculation repairable',()=>{
 const incomplete=recover({aRadius:null}).items;
 const state={stage:1,editor:'position',attempted:false,valid:false,issues:incomplete};
 assert.deepEqual(nextOffsetAction(state),{action:'editor',editor:'stock'});
 assert.equal(nextOffsetAction({...state,editor:'stock'}).action,'repair');
 const geometry=recover({run:100}).items;
 assert.equal(nextOffsetAction({...state,issues:geometry}).action,'editor');
 assert.equal(nextOffsetAction({...state,editor:'gaps',issues:geometry}).action,'calculate');
 assert.equal(nextOffsetAction({...state,attempted:true,issues:geometry}).action,'search');
 assert.equal(nextOffsetAction({...state,stage:2,issues:geometry}).action,'search');
 assert.equal(nextOffsetAction({...state,attempted:true,valid:true}).action,'calculate');
 assert.equal(nextOffsetAction({...state,stage:2,valid:true}).action,'work');
});
test('invalid comparison conditions retain named fields so the repair opens the right option',()=>{
 const comparison=compareRoutePlans({...sample,planMaxJoints:null,planExtraRadius:30,planMinPipe:-1});assert.equal(comparison.valid,false);
 assert.deepEqual(new Set(comparison.issues.map(i=>i.field)),new Set(['planMaxJoints','planMinPipe','planExtraRadius']));
 assert.equal(comparison.errors.length,comparison.issues.length);
 for(const issue of comparison.issues){const route=offsetFieldRoute(issue.field,sample);assert.equal(route.stage,2);assert.equal(route.field,issue.field);}
});
test('legacy intersection mode also identifies angle shortages without losing the original values',()=>{
 const r=computeOffset({basis:'intersections',angle:45,aDonor:20});assert.equal(r.valid,false);
 const item=offsetRecoveryItems(r)[0];assert.equal(item.code,'stock-angle');assert.equal(item.requiredAngle,45);assert.equal(item.route.field,'aDonor');
 assert.equal(r.params.aDonor,20);
 const short=computeOffset({basis:'intersections',solve:'angle',angle:45,rise:50});assert.equal(short.valid,false);
 assert.equal(offsetRecoveryItems(short)[0].route.field,'angle');
});

test('alternative search leads to choosing a route or editing limits while incomplete measurements still require repair',()=>{
 const state={stage:2,editor:'position',attempted:true,valid:false,issues:recover({run:100}).items};
 assert.equal(nextOffsetAction({...state,comparison:{valid:true,plans:[{original:false}]}}).action,'choose');
 assert.equal(nextOffsetAction({...state,comparison:{valid:true,plans:[]}}).action,'limits');
 const issue={field:'planMaxJoints',message:'上限未填'};
 assert.deepEqual(nextOffsetAction({...state,comparison:{valid:false,issues:[issue]}}),{action:'comparison-repair',issue});
 assert.equal(nextOffsetAction({...state,valid:true,comparison:{valid:true,plans:[{original:false}]}}).action,'work');
 assert.equal(nextOffsetAction({...state,stage:1,issues:recover({run:null}).items}).action,'repair');
});
