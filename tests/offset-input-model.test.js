import test from 'node:test';
import assert from 'node:assert/strict';
import {inputSceneData,inputPortFrame,INPUT_CAMERA_VIEWS,layoutInputLabels} from '../dist/assets/offset-input-model.js';
import {DEFAULT_OFFSET} from '../dist/assets/offset-geometry.js';
import {compareRoutePlans} from '../dist/assets/offset-planner.js';
import {cross} from '../dist/assets/offset-ports.js';

const p={...DEFAULT_OFFSET,basis:'ports',layout:'rolling',run:1000,roll:300,rise:600,datum:'center',aAxis:'x+',bAxis:'x-'};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('3D keeps measured XYZ distinct from shifted port faces, including negative distances',()=>{
 const input={...p,datum:'marks',run:-1000,roll:-300,aShiftX:20,aShiftY:40,aShiftZ:-10,bShiftX:-5,bShiftY:70,bShiftZ:100},before=structuredClone(input);
 const scene=inputSceneData(input);assert.deepEqual(scene.marks,{a:[0,0,0],b:[-1000,-300,600]});assert.deepEqual(scene.ports,{a:[20,40,-10],b:[-1005,-230,700]});
 assert.deepEqual(scene.dimensions.map(d=>[d.key,d.amount,d.start,d.finish]),[['run',-1000,[0,0,0],[-1000,0,0]],['roll',-300,[-1000,0,0],[-1000,-300,0]],['rise',600,[-1000,-300,0],[-1000,-300,600]]]);assert.deepEqual(input,before);
});
test('3D refuses unknown measurements, invalid shifts, diameters and zero custom direction vectors',()=>{
 for(const change of [{run:null},{roll:NaN},{rise:Infinity},{od:0},{aAxis:'unknown'},{aAxis:'custom',aAxisX:0,aAxisY:0,aAxisZ:0},{datum:'marks',aShiftX:null}])assert.equal(inputSceneData({...p,...change}),null);
 const scene=inputSceneData({...p,layout:'planar',roll:null});assert.equal(scene.dimensions[1].amount,0);assert.deepEqual(scene.ports.b,[1000,0,600]);
});
test('3D uses selected route geometry and discards a route for a different face, axis or diameter',()=>{
 const plans=compareRoutePlans(p).plans,selected=plans.find(r=>!r.original&&r.jointCount===5);assert.ok(selected?.valid);
 const scene=inputSceneData(selected.params,selected);assert.equal(scene.route,selected);assert.equal(scene.route.joints.length,5);assert.equal(scene.route.elements,selected.elements);
 for(const change of [{run:1001},{bAxis:'y+'},{od:168.3}])assert.equal(inputSceneData({...selected.params,...change},selected).route,null);
 assert.equal(inputSceneData(p,{...selected,valid:false}).route,null);assert.equal(inputSceneData(p,{...selected,legacy:true}).route,null);
});
test('port cross sections stay orthonormal for every direction, including sloped and vertical ports',()=>{
 for(const direction of [[1,0,0],[-1,0,0],[0,1,0],[0,0,-1],[1/3,2/3,2/3]]){
  const f=inputPortFrame(direction);near(Math.hypot(...f.outside),1);near(Math.hypot(...f.side),1);near(f.outside.reduce((sum,v,i)=>sum+v*direction[i],0),0);assert.deepEqual(cross(f.tangent,f.outside),f.side);
 }
});
test('3D preset camera views have a right-handed screen orientation consistent with dimension drawings',()=>{
 for(const [name,view] of Object.entries(INPUT_CAMERA_VIEWS)){
  const right=cross(view.up,view.sight),up=cross(view.sight,right);assert.ok(Math.hypot(...right)>0);if(name==='iso'){assert.ok(right[0]>0&&right[1]>0);assert.ok(up[2]>0);}if(name==='front')assert.ok(right[0]>0&&up[2]>0);if(name==='top')assert.ok(right[0]>0&&up[1]>0);if(name==='side')assert.ok(right[1]>0&&up[2]>0);
 }
});

test('nearby port and weld labels spread without overlap inside a narrow phone model',()=>{
 for(const width of [249,319,535]){
  const labels=[[88,175],[width-55,100],[88,175],[105,180],[120,190],[width-70,100],[width-55,100]].map((anchor,i)=>({anchor,width:i<2?50:44,height:44})),placements=layoutInputLabels(labels,width,295);
  for(const [i,a] of placements.entries()){
   assert.ok(a.x>=0&&a.y>=0&&a.x+a.w<=width&&a.y+a.h<=295);
   for(const b of placements.slice(i+1))assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y,`overlap at ${width}px`);
  }
 }
});
