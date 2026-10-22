import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/assets/vendor/three.module.js';
import {estimateTank} from '../dist/assets/tank-materials.js';
import {NOZZLE_DEFAULTS} from '../dist/assets/tank-nozzles.js';
import {editableShellSeams,moveShellSeam,shellSeamReadback,shellAssemblyFrame} from '../dist/assets/tank-seam-edit-model.js';
import {TankSeamEditor} from '../dist/assets/tank-seam-editor.js';
import {shellCourses,shellRingStations,shellCourseAt,mod} from '../dist/assets/tank-shell-layout.js';
import {tankDrawingModel} from '../dist/assets/tank-drawing-model.js';
import {shellWorkOrder} from '../dist/assets/tank-shell-report.js';
import {tankCSV,tankWorkOrder,tankProject,readTankProject} from '../dist/assets/tank-exports.js';
import {assemblySketch} from '../dist/assets/tank-visuals.js';
import {shellSeamDisplayModel} from '../dist/assets/tank-seam-display.js';
import {addShellSeamOverlays} from '../dist/assets/tank-seam-webgl.js';
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const settings={longitudinalWidth:20,circumferentialWidth:30,nozzleWeldReach:8,padWeldReach:10,workDistance:40},rules={minimumPlateEdge:200,minimumStagger:100};
const base=patch=>estimateTank({height:3000,stockWidth:1219.2,stockLength:2438.4,shellLayout:'upright',material:'SUS304',seamClearance:settings,nozzles:[{...NOZZLE_DEFAULTS,id:'N1',angle:25,height:900,od:300,thickness:6,padOD:450,flangeOD:500}],...patch});
function moved(r,id,delta,limits=rules){const value=moveShellSeam(r,id,delta,{rules:limits});assert.ok(value.ok);return estimateTank({...r.input,shellLayoutPlan:value.plan});}
function closed(r){assert.equal(r.shellLayoutState.closed,true);near(r.courseRows.reduce((s,c)=>s+c.height,0)+(r.courses-1)*r.input.gap,r.bodyHeight);for(const c of r.courseRows)near(c.pieces.reduce((s,b)=>s+b.length,0)+c.pieces.length*r.input.gap,r.circumference);}
const seamPos=(r,id)=>editableShellSeams(r).find(s=>s.id===id).position;

test('ring edit changes only adjoining course heights and preserves mouths, all other seams and total weld count',()=>{
  const r=base({height:6000,gap:3}),before=JSON.stringify(r.input),a=moved(r,'C1',125);closed(a);near(a.courseRows[0].height,r.courseRows[0].height+125);near(a.courseRows[1].height,r.courseRows[1].height-125);near(a.courseRows[2].height,r.courseRows[2].height);near(seamPos(a,'C2'),seamPos(r,'C2'));
  near(a.verticalSeams,r.verticalSeams);near(a.horizontalSeams,r.horizontalSeams);assert.deepEqual(a.nozzlePlan.items[0].face,r.nozzlePlan.items[0].face);assert.deepEqual(a.input.nozzles,r.input.nozzles);assert.equal(JSON.stringify(r.input),before);
});

test('internal longitudinal edit moves one seam and reallocates exactly the two adjoining widths',()=>{
  const r=base({gap:3}),a=moved(r,'L1-2',80);closed(a);near(a.assembly[0].length,r.assembly[0].length+80);near(a.assembly[1].length,r.assembly[1].length-80);
  for(const s of editableShellSeams(r)){if(s.id==='L1-2')near(seamPos(a,s.id),s.position+80);else near(seamPos(a,s.id),s.position);}
  assert.deepEqual(a.nozzlePlan.items[0].surface,r.nozzlePlan.items[0].surface);
});

test('closing seam wraps through zero without rotating the other seams or changing stock counts',()=>{
  const r=base({gap:3}),a=moved(r,'L1-1',60);closed(a);near(seamPos(a,'L1-1'),mod(seamPos(r,'L1-1')+60,r.circumference));near(a.assembly[0].length,r.assembly[0].length-60);near(a.assembly[3].length,r.assembly[3].length+60);
  for(const id of ['L1-2','L1-3','L1-4'])near(seamPos(a,id),seamPos(r,id));assert.equal(a.verticalSeams,r.verticalSeams);
});

test('single-panel course closing seam rotates that course independently',()=>{
  const r=base({stockWidth:1500,stockLength:6000,shellLayout:'around',gap:3}),a=moved(r,'L1-1',200);closed(a);near(a.assembly[0].length,r.assembly[0].length);near(seamPos(a,'L1-1'),mod(seamPos(r,'L1-1')+200,r.circumference));near(seamPos(a,'L2-1'),seamPos(r,'L2-1'));
});

test('oversized manual plates retain the actual red geometry, update 3D, and block all work-order exports',()=>{
  const r=base(),a=moved(r,'L1-2',500);closed(a);assert.equal(a.shellLayoutState.valid,false);assert.equal(a.shellLayoutState.custom,true);near(seamPos(a,'L1-2'),seamPos(r,'L1-2')+500);assert.ok(a.shellLayoutState.invalidPieces.includes('S1'));
  const drawing=tankDrawingModel(a);near(drawing.plates[0].finished[0],r.assembly[0].length+500);assert.match(assemblySketch(a),/#f0b4a5/);assert.ok(shellSeamDisplayModel(a).bands.find(b=>b.id==='L1-2').conflict);
  const group=new THREE.Group();addShellSeamOverlays(a,THREE,group);assert.equal(group.children.find(x=>x.userData.weldId==='L1-2').material.color.getHexString(),'c93629');
  for(const output of [tankWorkOrder,tankCSV,shellWorkOrder])assert.throws(()=>output(a),/毛坯/);
  const repaired=moved(a,'L1-2',-500);assert.ok(repaired.shellLayoutState.valid);assert.doesNotThrow(()=>shellWorkOrder(repaired));
});

test('oversized ring keeps the moved station and reports exact adjoining raw dimensions',()=>{
  const r=base(),a=moved(r,'C1',1100);closed(a);assert.equal(a.shellLayoutState.valid,false);near(shellRingStations(a)[0].z,2600);const data=shellSeamReadback(a,'C1');assert.ok(data.plates.some(p=>p.reasons.length));near(data.plates[0].raw.height,2610);near(tankDrawingModel(a).welds.find(w=>w.id==='C1').z,2600);
});

test('distance feedback measures the selected seam even when another seam is closer; pad controls clearance',()=>{
  const r=base(),data=shellSeamReadback(r,'L1-3'),n=r.nozzlePlan.items[0];assert.equal(data.measurements.length,2);assert.ok(data.nearest.actualClearance>1000);assert.equal(data.nearest.envelope,'pad');assert.ok(data.measurements.every(m=>m.id==='L1-3'));
  const physicalFactor=r.circumference/(Math.PI*r.od),p=n.seamCheck.profiles.find(p=>p.kind==='pad'),distance=(Math.min(mod(n.unfoldX-seamPos(r,'L1-3'),r.circumference),mod(seamPos(r,'L1-3')-n.unfoldX,r.circumference))-p.width/2)/physicalFactor-settings.longitudinalWidth/2-settings.padWeldReach;
  near(data.nearest.actualClearance,distance);
});

test('moving a ring into a fixed pad shows clearance conflict in 2D, 3D and the work order at the new station',()=>{
  const r=base(),a=moved(r,'C1',-600),data=shellSeamReadback(a,'C1');assert.ok(a.shellLayoutState.valid);assert.ok(data.conflict);assert.ok(data.nearest.overlap);near(data.seam.position,900);assert.match(assemblySketch(a,{editSeams:true}),/data-seam-conflict="C1"/);assert.ok(shellSeamDisplayModel(a).bands.find(b=>b.id==='C1').conflict);assert.match(shellWorkOrder(a),/需避讓|不足|相交|跨到/);assert.deepEqual(a.input.nozzles,r.input.nozzles);
});

test('adjacent-course staggering violations color both actual seam IDs and can be repaired in place',()=>{
  const r=base(),a=moved(r,'L2-1',-r.circumference/8);assert.equal(a.shellLayoutState.valid,false);assert.ok(a.shellLayoutState.badSeams.includes('L2-1'));assert.ok(a.shellLayoutState.badSeams.includes('L1-1'));near(shellSeamReadback(a,'L2-1').stagger,0);assert.ok(moved(a,'L2-1',r.circumference/8).shellLayoutState.valid);
});

test('dragging cannot reverse/collapse a course or panel; invalid rules and broken closure are rejected',()=>{
  const r=base({gap:3});for(const id of ['C1','L1-1','L1-2'])for(const delta of [-1e9,1e9]){const value=moveShellSeam(r,id,delta,{rules});assert.ok(value.clamped);const a=estimateTank({...r.input,shellLayoutPlan:value.plan});closed(a);assert.ok(a.assembly.every(b=>b.length>=.01&&b.height>=.01));}
  assert.equal(moveShellSeam(r,'L99-1',10).ok,false);assert.equal(moveShellSeam(r,'C1',NaN).ok,false);assert.equal(moveShellSeam(r,'C1',1,{rules:{minimumPlateEdge:NaN,minimumStagger:0}}).ok,false);
  const broken=structuredClone(moveShellSeam(r,'C1',10,{rules}).plan);broken.courses[0].height+=100;const invalid=estimateTank({...r.input,shellLayoutPlan:broken});assert.equal(moveShellSeam(invalid,'C1',10).ok,false);
});

test('proportional pointer scale and SVG handles follow actual course heights, including mobile and wrap',()=>{
  const r=moved(base(),'C1',200);for(const compact of [false,true]){const f=shellAssemblyFrame(r,{compact});near(f.boxes.get(1).h/f.boxes.get(2).h,1700/1300);near(50/f.scaleX,50*r.circumference/f.w);const svg=assemblySketch(r,{editSeams:true,activeSeam:'C1',compact});assert.match(svg,/role="slider"/);assert.match(svg,/aria-label="移動環縫 C1"/);assert.match(svg,/data-edit-seam="L1-1"/);assert.match(svg,/aria-orientation="vertical"/);}
});

test('manual edits save/reopen exactly, preserve the rotation datum, and use the same printed weld position',()=>{
  const r=moved(moved(base({seamStart:30}),'C1',100),'L1-2',50),saved=estimateTank(readTankProject(tankProject(r.input)));assert.deepEqual(saved.assembly,r.assembly);assert.equal(saved.input.seamStart,30);near(tankDrawingModel(saved).welds.find(w=>w.id==='C1').z,1600);assert.match(shellWorkOrder(saved),/1,600/);assert.match(tankCSV(saved),/1600/);
});

test('fixed nozzle stays at the same SVG point when a dragged ring passes its host course',()=>{
  const r=base({gap:3}),map=(r,z)=>{const f=shellAssemblyFrame(r,{editing:true}),c=shellCourseAt(r,z),box=f.boxes.get(c.course);return box.y+(1-(z-c.z)/c.height)*box.h;},start=map(r,900);
  for(const delta of [-700,-600,-599,200]){const a=moved(r,'C1',delta);near(map(a,900),start);const f=shellAssemblyFrame(a,{editing:true});near(f.boxes.get(1).y-f.gapY,f.y+(a.bodyHeight-seamPos(a,'C1'))*f.scaleY);}
});

// Pointer lifecycle integration: real geometry and controller, only browser
// coordinate/capture/animation primitives are replaced in Node.
function controller(){
  const editor=Object.create(TankSeamEditor.prototype),captured=new Set(),calls=[];
  const matrix={a:1,b:0,c:0,d:1,e:0,f:0,inverse(){return this;}};
  Object.assign(editor,{result:base(),selected:'C1',options:{compact:false},editing:true,history:[],frame:null,drag:null,queued:null,rules:()=>rules,notify:()=>{},render(r){this.result=r;},focusHandle(){},root:{querySelector:()=>({getScreenCTM:()=>matrix}),focus(){},setPointerCapture(id){captured.add(id);},hasPointerCapture:id=>captured.has(id),releasePointerCapture(id){captured.delete(id);},classList:{add(){},remove(){}}}});
  editor.onChange=(plan,options)=>{editor.result=estimateTank({...editor.result.input,shellLayoutPlan:plan});calls.push({plan,options});};return {editor,calls,captured};
}
test('pointer moves coalesce, final pending move flushes on release, and one undo restores the whole gesture',()=>{
  const original={DOMPoint:globalThis.DOMPoint,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};let next=1;const frames=new Map();
  globalThis.DOMPoint=class {constructor(x,y){this.x=x;this.y=y;}matrixTransform(){return this;}};globalThis.requestAnimationFrame=fn=>{const id=next++;frames.set(id,fn);return id;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
  try{const {editor,calls,captured}=controller(),handle={dataset:{editSeam:'C1',seamKind:'circumferential'}},event=(x,y,id=1)=>({target:{closest:()=>handle},button:0,isPrimary:true,pointerId:id,clientX:x,clientY:y,preventDefault(){},stopPropagation(){}});
    editor.pointerDown(event(100,200));assert.ok(captured.has(1));const scale=shellAssemblyFrame(editor.result,{editing:true}).scaleY;editor.pointerMove(event(100,200-100*scale));editor.pointerMove(event(100,200-150*scale));assert.equal(calls.length,0);assert.equal(frames.size,1);editor.pointerUp(event(100,200-150*scale));near(seamPos(editor.result,'C1'),1650);assert.equal(editor.history.length,1);assert.equal(editor.dragging,false);assert.equal(captured.size,0);assert.ok(calls.some(c=>c.options.live));editor.undo();near(seamPos(editor.result,'C1'),1500);assert.equal(editor.result.input.shellLayoutPlan,null);
  }finally{Object.assign(globalThis,original);}
});

test('pointer cancellation restores the previous layout and drops queued updates; unrelated pointer is ignored',()=>{
  const original={DOMPoint:globalThis.DOMPoint,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};const frames=new Map();let i=0;
  globalThis.DOMPoint=class {constructor(x,y){this.x=x;this.y=y;}matrixTransform(){return this;}};globalThis.requestAnimationFrame=fn=>{frames.set(++i,fn);return i;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
  try{const {editor,calls}=controller(),handle={dataset:{editSeam:'C1',seamKind:'circumferential'}},event={target:{closest:()=>handle},button:0,isPrimary:true,pointerId:1,clientX:0,clientY:100,preventDefault(){},stopPropagation(){}};editor.pointerDown(event);editor.pointerMove({...event,pointerId:2,clientY:50});assert.equal(frames.size,0);editor.pointerMove({...event,clientY:90});editor.flush();assert.ok(calls.length);editor.pointerMove({...event,clientY:80});editor.cancelDrag();assert.equal(editor.result.input.shellLayoutPlan,null);assert.equal(editor.history.length,0);assert.equal(frames.size,0);editor.flush();near(seamPos(editor.result,'C1'),1500);
  }finally{Object.assign(globalThis,original);}
});
