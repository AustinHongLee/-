import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateTank} from '../dist/assets/tank-materials.js';
import {NOZZLE_DEFAULTS} from '../dist/assets/tank-nozzles.js';
import {moveShellSeam,editableShellSeams,shellSeamReadback,shellAssemblyFrame} from '../dist/assets/tank-seam-edit-model.js';
import {seamSuggestionMarkup} from '../dist/assets/tank-seam-edit-visuals.js';
import {suggestNearestShellSeam} from '../dist/assets/tank-seam-recovery.js';
import {checkShellSeams,shellSeamProfiles} from '../dist/assets/tank-seam-clearance.js';
import {TankSeamEditor} from '../dist/assets/tank-seam-editor.js';
import {tankDrawingModel} from '../dist/assets/tank-drawing-model.js';
import {shellWorkOrder} from '../dist/assets/tank-shell-report.js';
import {shellSeamDisplayModel} from '../dist/assets/tank-seam-display.js';
import {tankCSV,tankProject,readTankProject} from '../dist/assets/tank-exports.js';
const settings={longitudinalWidth:20,circumferentialWidth:30,nozzleWeldReach:8,padWeldReach:10,workDistance:40},rules={minimumPlateEdge:200,minimumStagger:100};
const nozzle=patch=>({...NOZZLE_DEFAULTS,id:'N1',angle:25,height:900,od:300,thickness:6,padOD:450,flangeOD:500,...patch});
const base=patch=>estimateTank({diameter:1200,height:3000,gap:2,stockWidth:1219.2,stockLength:2438.4,shellLayout:'upright',material:'SUS304',seamClearance:settings,nozzles:[nozzle()],methods:{layout:{bottom:'strips'}},...patch});
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const position=(r,id)=>editableShellSeams(r).find(s=>s.id===id).position;
const move=(r,id,delta)=>estimateTank({...r.input,shellLayoutPlan:moveShellSeam(r,id,delta,{rules}).plan});
const applied=(r,next)=>estimateTank({...r.input,shellLayoutPlan:next.plan});
const count=r=>r.verticalSeams+r.horizontalSeams;
function invariant(r,next){assert.ok(next.ok,next.message);const a=applied(r,next);assert.ok(a.valid);assert.equal(shellSeamReadback(a,next.id).conflict,false);assert.deepEqual(a.input.nozzles,r.input.nozzles);assert.equal(count(a),count(r));assert.equal(a.input.seamStart,r.input.seamStart);for(const s of editableShellSeams(r))if(s.id!==next.id)near(position(a,s.id),s.position);return a;}
function nearestStepBlocked(r,next){const closer=move(r,next.id,next.delta-Math.sign(next.delta)*.01);assert.ok(shellSeamReadback(closer,next.id).conflict,'One grid step closer must still violate a constraint');}

test('nearest longitudinal station wraps through 0°, clears the controlling pad and preserves every other seam',()=>{
  const r=base(),saved=JSON.stringify(r.input),s=suggestNearestShellSeam(r,'L1-1',{rules}),a=invariant(r,s);assert.ok(s.delta<0);assert.equal(s.after.nearest.envelope,'pad');assert.ok(s.after.nearest.actualClearance>=40);nearestStepBlocked(r,s);assert.equal(JSON.stringify(r.input),saved);assert.equal(s.extraWelds,0);near(s.position,position(a,'L1-1'));assert.equal(s.precision,.01);
  const p=shellSeamProfiles(r,r.nozzlePlan.items[0]).find(p=>p.kind==='pad'),radius=p.width/2+(10+10+40)*p.scaleX,boundary=r.nozzlePlan.items[0].unfoldX-radius+r.circumference;
  assert.ok(s.position<=boundary&&boundary-s.position<.011);
});

test('ring recovery chooses the closest side, not a balanced or maximum-clearance layout',()=>{
  const r=move(base(),'C1',-590),s=suggestNearestShellSeam(r,'C1',{rules});invariant(r,s);assert.ok(s.delta>0);near(s.position,1190);nearestStepBlocked(r,s);assert.ok(s.remaining.length,'Existing unrelated longitudinal conflicts remain explicit');
});

test('a closer ring station is rejected if extending a fixed longitudinal seam would hit another nozzle',()=>{
  const r=move(base({nozzles:[nozzle(),nozzle({id:'N2',angle:0,height:1100,od:20,thickness:2,padOD:0,flangeOD:60,end:'bare'})]}),'C1',-500),s=suggestNearestShellSeam(r,'C1',{rules});
  invariant(r,s);assert.ok(s.delta<0);near(s.position,610);
  const closer=move(r,'C1',190),n=closer.nozzlePlan.items.find(n=>n.id==='N2');assert.equal(shellSeamReadback(closer,'C1').conflict,false);assert.ok(checkShellSeams(closer,n,{seamId:'L1-1'}).hits.length);assert.equal(checkShellSeams(r,r.nozzlePlan.items.find(n=>n.id==='N2'),{seamId:'L1-1'}).hits.length,0);
  assert.equal(checkShellSeams(applied(r,s),n,{seamId:'L1-1'}).hits.length,0);
});

test('oversized panel is repaired at the nearest stock limit, with the same number of plates and welds',()=>{
  const r=move(base({nozzles:[]}),'L1-2',500),s=suggestNearestShellSeam(r,'L1-2',{rules}),a=invariant(r,s);assert.ok(a.shellLayoutState.valid);near(a.assembly[0].length,a.shellLayoutState.maxLength);assert.ok(s.delta<0);nearestStepBlocked(r,s);
});

test('nearest ring repair observes raw stock height and smallest finished plate edge',()=>{
  for(const delta of [1100,-1400]){const r=move(base({nozzles:[]}),'C1',delta),s=suggestNearestShellSeam(r,'C1',{rules}),a=invariant(r,s);assert.ok(a.shellLayoutState.valid);assert.ok(a.courseRows.every(c=>c.height>=200&&c.height<=a.shellLayoutState.maxHeight));nearestStepBlocked(r,s);}
});

test('stagger conflict moves to the nearest physical center distance rather than a half-panel pitch',()=>{
  const initial=base({nozzles:[]}),plan=moveShellSeam(initial,'L2-1',0,{rules}).plan;plan.courses[1].startAngle=plan.courses[0].startAngle;
  const r=estimateTank({...initial.input,shellLayoutPlan:plan}),s=suggestNearestShellSeam(r,'L2-1',{rules}),a=invariant(r,s);assert.ok(s.after.stagger>=100);assert.ok(Math.abs(s.delta)<101);nearestStepBlocked(r,s);assert.ok(a.shellLayoutState.badSeams.length,'Other aligned pairs remain explicit');
});

test('one-panel course can rotate its closing seam without changing the single plate length',()=>{
  const r=base({height:2000,stockWidth:2500,stockLength:6000,shellLayout:'around',nozzles:[nozzle({angle:0})]}),s=suggestNearestShellSeam(r,'L1-1',{rules}),a=invariant(r,s);assert.equal(r.panelsPerCourse,1);near(a.assembly[0].length,r.assembly[0].length);nearestStepBlocked(r,s);
});

test('finite seam outside a nozzle axial working envelope is not incorrectly excluded by its angular footprint',()=>{
  const r=move(base({height:6000,nozzles:[nozzle({height:5000,angle:90})]}),'L1-2',500),s=suggestNearestShellSeam(r,'L1-2',{rules});invariant(r,s);assert.ok(s.after.nearest.actualClearance>1000);nearestStepBlocked(r,s);
});

test('no single-seam solution keeps geometry intact and never adds a weld',()=>{
  const r=base({height:4400,nozzles:[nozzle({height:2200,padOD:1100,flangeOD:1200})]}),before=JSON.stringify(r.input),s=suggestNearestShellSeam(r,'C1',{rules});assert.equal(s.ok,false);assert.match(s.message,/只移這一道/);assert.ok(s.constraints.some(s=>s.includes('原板')));assert.equal(JSON.stringify(r.input),before);
});

test('two forbidden zone limits meeting at exactly one grid station retain that feasible point',()=>{
  const small=nozzle({od:40,thickness:3,padOD:0,end:'bare',flangeOD:60,angle:22.5}),temp=base({nozzles:[small]}),p=shellSeamProfiles(temp,temp.nozzlePlan.items[0])[0],radius=p.height/2+p.weldReach+15+p.workDistance;
  const r=move(base({nozzles:[{...small,height:1000-radius},{...small,id:'N2',height:1000+radius}]}),'C1',-550),s=suggestNearestShellSeam(r,'C1',{rules});invariant(r,s);near(s.position,1000);nearestStepBlocked(r,s);
});

test('impossible perpendicular plate dimension is explained rather than suggesting a misleading move',()=>{
  const r=move(base({nozzles:[]}),'C1',1100);assert.match(suggestNearestShellSeam(r,'L1-2',{rules}).message,/板高/);
  const a=move(base({nozzles:[]}),'L1-2',500);assert.match(suggestNearestShellSeam(a,'C1',{rules}).message,/板寬/);
});

test('unknown weld dimensions stay pending; invalid inputs and broken closure cannot produce a suggestion',()=>{
  const r=move(base({seamClearance:{}}),'C1',-600),s=suggestNearestShellSeam(r,'C1',{rules});invariant(r,s);assert.ok(s.pending.length);assert.ok(s.after.nearest.actualClearance>0);
  assert.equal(suggestNearestShellSeam(r,'C1',{rules:{...rules,minimumPlateEdge:NaN}}).ok,false);
  assert.equal(suggestNearestShellSeam(r,'C99',{rules}).ok,false);
  const plan=structuredClone(r.input.shellLayoutPlan);plan.courses[0].height+=10;assert.equal(suggestNearestShellSeam(estimateTank({...r.input,shellLayoutPlan:plan}),'C1',{rules}).ok,false);
  assert.equal(suggestNearestShellSeam(base({nozzles:[]}), 'C1',{rules}).alreadyClear,true);
});

test('applied station is identical in 2D/3D display, drawing model, work order, CSV and saved project',()=>{
  const r=move(base(),'C1',-590),s=suggestNearestShellSeam(r,'C1',{rules}),a=invariant(r,s);near(tankDrawingModel(a).welds.find(w=>w.id==='C1').z,s.position);near(shellSeamDisplayModel(a).bands.find(b=>b.id==='C1').z,s.position);assert.equal(shellSeamDisplayModel(a).bands.find(b=>b.id==='C1').conflict,false);assert.match(shellWorkOrder(a),/1,190/);assert.match(tankCSV(a),/1189/);const saved=estimateTank(readTankProject(tankProject(a.input)));assert.deepEqual(saved.assembly,a.assembly);near(position(saved,'C1'),s.position);
});

test('one-click application rechecks current geometry and rules, creates one undo step and restores exact prior layout',()=>{
  const r=move(base(),'C1',-590),editor=Object.create(TankSeamEditor.prototype),messages=[];let currentRules=rules;
  Object.assign(editor,{result:r,selected:'C1',history:[],drag:null,editRules:()=>currentRules,notify:m=>messages.push(m),render(){},cancelDrag(){}});editor.onChange=plan=>{editor.result=estimateTank({...editor.result.input,shellLayoutPlan:plan});};
  editor.recovery=suggestNearestShellSeam(r,'C1',{rules});const stale=editor.recovery.position;
  currentRules={minimumPlateEdge:1300,minimumStagger:100};editor.applyNearest();assert.equal(editor.history.length,0);near(position(editor.result,'C1'),position(r,'C1'));
  currentRules=rules;editor.result=move(r,'C1',-20);const prior=structuredClone(editor.result.input.shellLayoutPlan);editor.applyNearest();assert.equal(editor.history.length,1);assert.notEqual(position(editor.result,'C1'),stale);assert.equal(shellSeamReadback(editor.result,'C1').conflict,false);editor.undo();assert.deepEqual(editor.result.input.shellLayoutPlan,prior);assert.ok(messages.some(m=>m.includes('焊道數維持')));
});

test('suggested line uses the same physical display scale on desktop and phone without changing the real seam',()=>{
  for(const id of ['C1','L1-1'])for(const compact of [true,false]){
    const r=id==='C1'?move(base(),'C1',-590):base(),s=suggestNearestShellSeam(r,id,{rules}),frame=shellAssemblyFrame(r,{editing:true,compact}),line=seamSuggestionMarkup(r,frame,s),before=position(r,id);
    assert.match(line,new RegExp('data-seam-suggested="'+id+'"'));assert.match(line,/pointer-events="none"/);
    const coordinates=line.match(/ d="M([\d.]+) ([\d.]+)/);assert.ok(coordinates);
    if(id==='C1'){const y=frame.y+(r.bodyHeight-s.position)*frame.scaleY;near(Number(coordinates[1]),frame.x);near(Number(coordinates[2]),y);}
    else near(Number(coordinates[1]),frame.x+s.position*frame.scaleX);
    near(position(r,id),before);assert.equal(seamSuggestionMarkup(r,frame,{ok:false}),'');
  }
});
