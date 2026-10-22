import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/assets/vendor/three.module.js';
import {estimateTank} from '../dist/assets/tank-materials.js';
import {NOZZLE_DEFAULTS} from '../dist/assets/tank-nozzles.js';
import {searchShellLayout} from '../dist/assets/tank-shell-layout-search.js';
import {normalizeShellLayout,shellPiecePart,shellRingStations,shellCourses} from '../dist/assets/tank-shell-layout.js';
import {shellConstructionPlan} from '../dist/assets/tank-shell-plan.js';
import {tankDrawingModel,shellSceneAnnotations} from '../dist/assets/tank-drawing-model.js';
import {shellWorkOrder,shellDrawingSheet} from '../dist/assets/tank-shell-report.js';
import {tankWorkOrder,tankProject,readTankProject,tankCSV} from '../dist/assets/tank-exports.js';
import {shellSeamDisplayModel} from '../dist/assets/tank-seam-display.js';
import {addShellSeamOverlays} from '../dist/assets/tank-seam-webgl.js';
import {checkShellSeams,suggestShellSeamStart} from '../dist/assets/tank-seam-clearance.js';
import {compareMaterialStocks} from '../dist/assets/tank-stock-comparison.js';
const near=(a,b,epsilon=1e-6)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
const settings={longitudinalWidth:20,circumferentialWidth:30,nozzleWeldReach:8,padWeldReach:10,workDistance:40};
const nozzle=patch=>({...NOZZLE_DEFAULTS,thickness:6,height:1490,od:400,flangeOD:500,...patch});
const hardCase=()=>estimateTank({height:3000,stockWidth:1219.2,stockLength:2438.4,shellLayout:'upright',material:'SUS304',seamClearance:settings,nozzles:[nozzle({id:'N1',angle:0}),nozzle({id:'N2',angle:45})]});
function varied(){
  const r=estimateTank({gap:3,seamClearance:settings,material:'SUS304'}),C=r.circumference;
  return estimateTank({...r.input,shellLayoutPlan:{version:1,referenceStart:0,courses:[{height:850,startAngle:20,lengths:[C-3]},{height:1147,startAngle:130,lengths:[C*.4-3,C*.6-3]}],rules:{minimumPlateEdge:200,minimumStagger:50}}});
}
function assertClosed(r){
  assert.ok(r.shellLayoutState.valid);for(const c of shellCourses(r)){near(c.pieces.reduce((s,b)=>s+b.length,0)+c.pieces.length*r.input.gap,r.circumference);assert.ok(c.height<=r.shellLayoutState.maxHeight+1e-6);for(const b of c.pieces)assert.ok(b.length<=r.shellLayoutState.maxLength+1e-6);}
  near(r.courseRows.reduce((s,c)=>s+c.height,0)+(r.courses-1)*r.input.gap,r.bodyHeight);
}

test('combined search moves a ring and unequal panel boundaries while preserving nozzle geometry and weld count',async()=>{
  const r=hardCase(),snapshot=JSON.stringify(r.input);assert.ok(r.nozzlePlan.items.some(n=>n.seamCheck.hits.some(h=>h.kind==='circumferential')));assert.equal(suggestShellSeamStart(r).improves,false);
  const p=await searchShellLayout(r,{allowExtraWeld:true});assert.ok(p.ok);assert.equal(p.extraWelds,0);assertClosed(p.result);assert.equal(JSON.stringify(r.input),snapshot);
  assert.notEqual(p.result.courseRows[0].height,r.courseRows[0].height);assert.ok(new Set(p.result.courseRows[0].pieces.map(b=>b.length.toFixed(2))).size>1);
  for(const n of p.result.nozzlePlan.items){const before=r.nozzlePlan.items.find(x=>x.id===n.id);assert.deepEqual(n.face,before.face);assert.deepEqual(n.surface,before.surface);assert.equal(n.angle,before.angle);assert.equal(n.height,before.height);assert.equal(checkShellSeams(p.result,n).hits.length,0);}
  assert.equal(p.input.seamStart,r.input.seamStart);assert.equal(p.result.verticalSeams,r.verticalSeams);assert.equal(p.result.horizontalSeams,r.horizontalSeams);
});

test('unequal course heights/counts share exact blank sizes, stock placement, mass and weld lengths',()=>{
  const r=varied();assertClosed(r);assert.deepEqual(r.courseRows.map(c=>c.pieces.length),[1,2]);assert.equal(r.assembly.length,3);const m=shellConstructionPlan(r,'S2');near(m.part.height,1157);near(m.finished.height,1147);near(shellRingStations(r)[0].z,851.5);
  near(r.longitudinalWeldLength,850+2*1147);near(r.weldLength,850+2*1147+r.circumference);near(r.process.weld.seams.find(w=>w.name==='筒身縱縫').length,r.longitudinalWeldLength);
  const area=r.assembly.reduce((s,b)=>s+b.length*b.height,0),blank=r.assembly.reduce((s,b)=>{const p=shellPiecePart(r,b.id);return s+p.width*p.height;},0);near(r.parts[0].netWeight,area*6*7850/1e9);near(r.parts[0].blankWeight,blank*6*7850/1e9);
  for(const b of r.assembly){const bp=shellPiecePart(r,b.id),sheet=r.sheets.find(s=>s.id===b.sheet),placement=sheet.placements.find(p=>p.label===b.id);near(placement.rotated?placement.h:placement.w,bp.width);near(placement.rotated?placement.w:placement.h,bp.height);}
  assert.equal(m.welds.find(w=>w.id==='L2-1').a,'S3');assert.equal(m.welds.find(w=>w.id==='L2-2').a,'S2');
});

test('2D, shared drawing, actual WebGL bands and per-piece work orders retain the same weld station and dimensions',()=>{
  const r=varied(),drawing=tankDrawingModel(r),display=shellSeamDisplayModel(r),group=new THREE.Group();addShellSeamOverlays(r,THREE,group);
  const ring=drawing.welds.find(w=>w.id==='C1');near(ring.z,851.5);near(display.bands.find(w=>w.id==='C1').z,ring.z);
  for(const b of r.assembly){const plate=drawing.plates.find(p=>p.id===b.id),bp=shellPiecePart(r,b.id);near(plate.raw[0],bp.width);near(plate.raw[1],bp.height);near(plate.finished[1],b.height);}
  const band=group.children.find(o=>o.userData.weldId==='L2-1');near(band.geometry.parameters.height,1147);near(band.position.y,r.frame.bodyBottom+853+1147/2);
  const annotations=shellSceneAnnotations(shellConstructionPlan(r,'S2'),'weld');near(annotations.find(a=>a.id==='L2-1').anchor[1],853+1147/2);
  const order=shellWorkOrder(r,'S2');assert.match(order,/1,157/);assert.match(order,/851.5/);assert.match(order,/C1/);assert.doesNotMatch(order,/共同毛坯尺寸/);assert.match(shellDrawingSheet(r,'S2'),/C1/);assert.match(tankWorkOrder(r),/逐圈／逐片下料尺寸/);assert.doesNotMatch(tankWorkOrder(r),/每片修邊後高/);assert.match(tankCSV(r),/毛坯弧向 mm/);
});

test('stock/thickness/length changes never silently export an obsolete custom plan',()=>{
  const r=varied();for(const patch of [{height:2500},{diameter:1400},{stockWidth:600,stockLength:900}]){const changed=estimateTank({...r.input,...patch});assert.ok(changed.valid);assert.equal(changed.shellLayoutState.valid,false);assert.equal(changed.shellLayoutState.custom,Boolean(patch.stockWidth));if(patch.stockWidth)assert.deepEqual(changed.assembly.map(b=>[b.start,b.length,b.z,b.height]),r.assembly.map(b=>[b.start,b.length,b.z,b.height]));assert.throws(()=>tankWorkOrder(changed),/分圈|分片|毛坯/);assert.throws(()=>shellWorkOrder(changed),/分圈|分片|毛坯/);assert.throws(()=>tankCSV(changed),/分圈|分片|毛坯/);}
  const options=compareMaterialStocks(r).groups.find(g=>g.group.partIDs.includes('S')).options;assert.equal(options.find(o=>o.id==='4x8').feasible,false);
});

test('v9 saves actual sizes and known constraints; legacy projects retain automatic equal division',async()=>{
  const p=await searchShellLayout(hardCase()),json=tankProject(p.input);assert.equal(JSON.parse(json).version,9);const saved=readTankProject(json),r=estimateTank(saved);assertClosed(r);assert.deepEqual(r.assembly,p.result.assembly);assert.deepEqual(saved.shellLayoutPlan,p.input.shellLayoutPlan);
  for(const version of [1,7,8])assert.equal(readTankProject(JSON.stringify({type:'special-method-tank',version,input:{height:2000}})).shellLayoutPlan,null);
});

test('extra weld is opt-in, is clearly counted, and is unnecessary when the original count works',async()=>{
  const r=estimateTank({height:1000,stockWidth:1219.2,stockLength:2438.4,shellLayout:'upright',material:'SUS304',seamClearance:settings,nozzles:[36,108,180,252,324].map((angle,i)=>nozzle({id:'N'+(i+1),height:500,angle,od:500,flangeOD:600}))});
  assert.equal((await searchShellLayout(r)).ok,false);const p=await searchShellLayout(r,{allowExtraWeld:true});assert.ok(p.ok);assert.equal(p.extraWelds,1);assert.equal(p.result.verticalSeams,r.verticalSeams+1);assert.equal(p.result.horizontalSeams,r.horizontalSeams);assert.ok(p.result.nozzlePlan.items.every(n=>!n.seamCheck.hits.length));assertClosed(p.result);
});

test('impossible axial working zone reports no candidate without moving or deleting nozzles',async()=>{
  const r=hardCase(),copy=JSON.stringify(r.input),p=await searchShellLayout(estimateTank({...r.input,seamClearance:{...settings,workDistance:2000}}));assert.equal(p.ok,false);assert.match(p.message,/軸向施工區/);assert.equal(copy,JSON.stringify(r.input));
});

test('unknown distance fields remain pending; invalid rules and cancellation never produce an applyable plan',async()=>{
  const r=hardCase(),unknown=estimateTank({...r.input,seamClearance:{...settings,workDistance:null}}),p=await searchShellLayout(unknown);assert.ok(p.ok);assert.ok(p.pending.some(f=>f.key==='workDistance'));
  assert.equal((await searchShellLayout(r,{minimumPlateEdge:-1})).ok,false);assert.equal((await searchShellLayout(r,{signal:AbortSignal.abort()})).cancelled,true);
});

test('malformed plans, under-minimum blanks and mis-staggered adjacent seams remain explicit',()=>{
  assert.equal(normalizeShellLayout({...varied().input.shellLayoutPlan,rules:true}).valid,false);assert.equal(normalizeShellLayout({version:1,courses:[]}).valid,false);
  const r=varied(),plan=structuredClone(r.input.shellLayoutPlan);plan.courses[1].startAngle=20;const bad=estimateTank({...r.input,shellLayoutPlan:plan});assert.equal(bad.shellLayoutState.valid,false);assert.match(bad.shellLayoutState.issues[0].message,/錯開/);
  plan.courses[1].startAngle=130;plan.rules.minimumPlateEdge=900;assert.equal(estimateTank({...r.input,shellLayoutPlan:plan}).shellLayoutState.valid,false);
});

test('global rotation preserves per-course geometry and adjacent seam staggering',()=>{
  const r=varied(),rotated=estimateTank({...r.input,seamStart:30});assertClosed(rotated);assert.deepEqual(rotated.assembly.map(b=>[b.length,b.height,b.z]),r.assembly.map(b=>[b.length,b.height,b.z]));for(let i=0;i<r.assembly.length;i++)near((rotated.assembly[i].start-r.assembly[i].start+r.circumference)%r.circumference,r.circumference/12);
});

test('printed angle/size rounding retains clearance rather than turning a numerical near-miss into contact',async()=>{
  const p=await searchShellLayout(hardCase()),plan=structuredClone(p.input.shellLayoutPlan),round=v=>Math.round(v*100)/100,g=p.result.input.gap,C=p.result.circumference;
  for(const c of plan.courses){c.startAngle=round(c.startAngle);c.height=round(c.height);c.lengths=c.lengths.map(round);c.lengths[c.lengths.length-1]=C-c.lengths.length*g-c.lengths.slice(0,-1).reduce((s,v)=>s+v,0);}
  plan.courses.at(-1).height=p.result.bodyHeight-(plan.courses.length-1)*g-plan.courses.slice(0,-1).reduce((s,c)=>s+c.height,0);
  const r=estimateTank({...p.input,shellLayoutPlan:plan});assertClosed(r);assert.ok(r.nozzlePlan.items.every(n=>!n.seamCheck.hits.length));
});

test('unequal-height course lifting and heaviest blank use actual mass rather than a course average',()=>{
  const base=varied(),r=estimateTank({...base.input,methods:{...base.methods,erection:{...base.methods.erection,method:'bottomup'}}});
  for(const c of r.courseRows){const expected=c.pieces.reduce((s,b)=>s+b.length*b.height*6*7850/1e9,0);near(r.process.erection.stages.find(s=>s.label==='第 '+c.course+' 圈').weight,expected);}
  const blanks=r.parts[0].pieces.map(b=>b.blankWeight);assert.ok(blanks.every(Number.isFinite));assert.ok(r.process.erection.maxPiece>=Math.max(...blanks)-1e-7);
});

test('nonzero joint gaps and un-prebent end allowances survive the avoidance search and every stock blank',async()=>{
  const base=hardCase(),r=estimateTank({...base.input,gap:4,methods:{...base.methods,rolling:{...base.methods.rolling,preBend:'no',flatEnd:60}}}),p=await searchShellLayout(r);assert.ok(p.ok);assertClosed(p.result);
  for(const b of p.result.assembly){const part=shellPiecePart(p.result,b.id);near(part.width,b.length+2*r.input.trim+120);near(part.height,b.height+2*r.input.trim);assert.ok(part.width<=1219.2+1e-6);}
  assert.ok(p.result.nozzlePlan.items.every(n=>!n.seamCheck.hits.length));
});
