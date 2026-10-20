// Manufacturing counterexamples and independent geometric checks. These are
// deliberately not snapshots of rendered strings or copies of the solver.
import test from 'node:test';
import assert from 'node:assert/strict';
import {offsetProjectJSON,readOffsetProject} from '../dist/assets/offset-exports.js';
import {acknowledgeOffsetReview,requireOffsetReview} from '../dist/assets/offset-project-review.js';
import {createDraftStore} from '../dist/assets/project-persistence.js';
import {jointAngleSensitivity} from '../dist/assets/joint-angle-sensitivity.js';
import {DEFAULT_PARAMS} from '../dist/assets/joint-model.js';
import {routeAngleSensitivity,perturbedRouteEndpoint} from '../dist/assets/offset-angle-sensitivity.js';
import {computeOffset} from '../dist/assets/offset-geometry.js';
import {originalRoutePlan,compareRoutePlans} from '../dist/assets/offset-planner.js';
import {installRouteComponents} from '../dist/assets/offset-components.js';
import {estimateTank} from '../dist/assets/tank-materials.js';
import {NOZZLE_DEFAULTS} from '../dist/assets/tank-nozzles.js';
import {methodCatalog} from '../dist/assets/tank-methods.js';
import {tankWorkOrder,tankCSV,tankProject,readTankProject} from '../dist/assets/tank-exports.js';

const near=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,`${a} vs ${b}`);
const offset={basis:'ports',layout:'rolling',run:2000,rise:1000,roll:0,aAxis:'x+',bAxis:'x-'};
const memory=initial=>{const data=new Map(Object.entries(initial));return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};};

test('legacy direction and Ta reviews survive any number of auto saves and separate acknowledgements',()=>{
  const raw=JSON.parse(offsetProjectJSON({...offset,roll:300,aKind:'factory',aTangent:8}));raw.version=4;
  let p=readOffsetProject(JSON.stringify(raw));assert.deepEqual(p.review,['legacy-y','factory-ta']);
  const initial=structuredClone(p.params);
  for(let i=0;i<3;i++)p=readOffsetProject(offsetProjectJSON(p.params,p.id,p.medium,p.review));
  assert.deepEqual(p.params,initial);assert.equal(p.notices.length,2);assert.throws(()=>requireOffsetReview(p.review),/核對/);
  p.review=acknowledgeOffsetReview(p.review,'legacy-y');p=readOffsetProject(offsetProjectJSON(p.params,p.id,p.medium,p.review));
  assert.deepEqual(p.review,['factory-ta']);assert.throws(()=>requireOffsetReview(p.review));
  p.review=acknowledgeOffsetReview(p.review,'factory-ta');p=readOffsetProject(offsetProjectJSON(p.params,p.id,p.medium,p.review));
  assert.doesNotThrow(()=>requireOffsetReview(p.review));assert.equal(p.params.roll,300);
});
test('v5 coordinate conventions remain unchanged; malformed acknowledgement flags cannot suppress checks',()=>{
  const raw=JSON.parse(offsetProjectJSON({...offset,roll:300}));raw.version=5;delete raw.review;
  assert.deepEqual(readOffsetProject(JSON.stringify(raw)).review,[]);
  for(const review of [null,{},['unknown'],['legacy-y','legacy-y']])assert.throws(()=>readOffsetProject(JSON.stringify({...raw,version:6,review})),/核對/);
  assert.throws(()=>offsetProjectJSON(offset,'OFF',null,['unknown']));
});
test('failed storage preserves the previous project and keeps the unsaved valid JSON downloadable',()=>{
  const storage=memory({project:'original'}),store=createDraftStore(storage,'project');
  storage.setItem=()=>{throw new Error('QuotaExceededError');};
  const result=store.write('new valid JSON');assert.equal(result.saved,false);assert.equal(result.kind,'error');
  assert.equal(storage.getItem('project'),'original');assert.equal(store.draft,'new valid JSON');
});
test('a stale tab cannot overwrite another tab; explicit overwrite retains the displaced project',()=>{
  const storage=memory({project:'A'}),one=createDraftStore(storage,'project'),two=createDraftStore(storage,'project');
  assert.equal(one.write('B').saved,true);assert.equal(storage.getItem('project:previous'),'A');
  assert.equal(two.write('C').kind,'conflict');assert.equal(storage.getItem('project'),'B');assert.equal(two.draft,'C');
  assert.equal(two.write('C',{overwrite:true}).saved,true);assert.equal(storage.getItem('project:previous'),'B');assert.equal(storage.getItem('project'),'C');
  one.changedElsewhere('C');assert.equal(one.state.kind,'conflict');assert.equal(one.write('D').kind,'conflict');
});
test('successful migration retains prior raw data; invalid edits never replace the last valid draft',()=>{
  const storage=memory({project:'v4 raw'}),store=createDraftStore(storage,'project');store.write('v6 with checks');store.write('v6 after review');
  assert.equal(storage.getItem('project:previous'),'v4 raw');store.pending('invalid dimensions');
  assert.equal(store.state.kind,'dirty');assert.equal(store.draft,'v6 after review');assert.equal(storage.getItem('project'),'v6 after review');
  assert.equal(store.write('v6 after review').saved,true);
  const unchanged=memory({project:'current raw'}),again=createDraftStore(unchanged,'project');again.write('current raw');again.write('edited');assert.equal(unchanged.getItem('project:previous'),'current raw');
});
test('blocked storage reads never claim a successful save',()=>{
  const store=createDraftStore({getItem(){throw new Error('SecurityError');},setItem(){throw new Error('SecurityError');}},'project');
  assert.equal(store.state.kind,'error');assert.equal(store.write('{}').saved,false);assert.equal(store.draft,'{}');
});
test('unreadable saved projects are not silently replaced by startup defaults',()=>{
  const storage=memory({project:'damaged original JSON'}),store=createDraftStore(storage,'project');store.protectSaved();store.pending('calculating defaults');
  assert.equal(store.write('valid default project').kind,'recovery');assert.equal(storage.getItem('project'),'damaged original JSON');assert.equal(store.original,'damaged original JSON');assert.equal(store.draft,'valid default project');
  assert.equal(store.write('user-reviewed replacement',{overwrite:true}).saved,true);assert.equal(storage.getItem('project:previous'),'damaged original JSON');assert.equal(storage.getItem('project'),'user-reviewed replacement');
});
test('recovery protection survives repeated valid recalculations and failed replacement writes',()=>{
  const storage=memory({project:'old raw'}),store=createDraftStore(storage,'project');store.protectSaved();
  storage.setItem=()=>{throw new Error('full');};assert.equal(store.write('candidate',{overwrite:true}).saved,false);assert.equal(store.write('another candidate').kind,'recovery');assert.equal(storage.getItem('project'),'old raw');assert.equal(store.original,'old raw');
});

const branch={...DEFAULT_PARAMS,mainOD:219.1,mainWall:6,mainLength:2000,jointPosition:1000,branchOD:114.3,branchWall:6,angle:15,rootGap:0};
test('angle sensitivity keeps a fixed axial free-end datum instead of re-fitting away the cutting error',()=>{
  const r=jointAngleSensitivity(branch,.5);assert.equal(r.valid,true);const rad=a=>a*Math.PI/180;
  // At the 180° outside generatrix, t = R csc(alpha) + r cot(alpha).
  const cut=a=>(109.55+57.15*Math.cos(rad(a)))/Math.sin(rad(a));
  const expected=cut(14.5)-cut(15);
  near(r.rows[0][36].outerDepth-r.rows[1][36].outerDepth,expected);
  near(r.maximum.difference,expected);near(r.maximum.difference,21.9621924367,1e-6);
  assert.equal(r.maximum.clock,180);assert.equal(r.maximum.angle,14.5);assert.equal(r.stations,72);
  assert.equal(r.rows[1].length,73);assert.equal(branch.angle,15);
});
test('sensitivity refuses unsupported hosts and invalid perturbed angles without clamping',()=>{
  for(const p of [{...branch,hostType:'cone'},{...branch,branchSection:'rhs'},{...branch,angle:.2}])assert.equal(jointAngleSensitivity(p,.5).valid,false);
  for(const d of [0,-1,Infinity,NaN,6,'0.5'])assert.equal(jointAngleSensitivity(branch,d).valid,false);
});
test('two-bend forward error agrees with an independent planar arc construction',()=>{
  const plan=originalRoutePlan(computeOffset(offset));assert.equal(plan.valid,true);
  const snapshot=structuredClone(plan),e1=plan.elbows[0],e2=plan.elbows[1],L=plan.pipes[0].length,d=.5*Math.PI/180;
  const a=e1.theta+d,b=e2.theta+d,R=e1.radius;
  const expected=[R*Math.sin(a)+L*Math.cos(a)+R*(Math.sin(a)-Math.sin(a-b)),0,R*(1-Math.cos(a))+L*Math.sin(a)+R*(Math.cos(a-b)-Math.cos(a))];
  const r=perturbedRouteEndpoint(plan,[.5,.5]);assert.equal(r.valid,true);expected.forEach((v,i)=>near(r.endpoint[i],v,1e-6));near(r.axisMismatch,0);
  const all=routeAngleSensitivity(plan,.5);assert.equal(all.scenarios.length,4);near(all.maximum.distance,19.52367088,1e-6);assert.deepEqual(plan,snapshot);
});
test('forward reconstruction includes unequal gaps, retained tangents and real inline components',()=>{
  const p={...offset,aPortGap:3,bPortGap:4,aGap:2,bGap:5,aTangent:8,bTangent:11};
  const raw=originalRoutePlan(computeOffset(p)),plan=installRouteComponents(raw,[{id:'C1',kind:'valve',name:'V1',target:'s1',length:200,leftConnection:'weld',rightConnection:'weld',leftGap:2,rightGap:3,placement:'center',distance:0,internalBolts:0}]);
  assert.equal(plan.valid,true);const r=perturbedRouteEndpoint(plan,[0,0]);assert.equal(r.valid,true);near(r.distance,0);near(r.axisMismatch,0);
  assert.equal(routeAngleSensitivity(plan,.5).valid,true);
  const routes=compareRoutePlans({...offset,run:1435,rise:2071,roll:1000,bAxis:'y+',planMaxJoints:8}).plans;
  assert.ok(routes.some(x=>x.elbows.length===3));
  for(const route of routes){const result=routeAngleSensitivity(route,.5);assert.equal(result.valid,true,result.message);near(result.baseline.distance,0);assert.equal(result.scenarios.length,2**route.elbows.length);}
});
test('four sequential quarter turns close a circle; signed errors change the end axis independently',()=>{
  const R=200,headings=[[1,0,0],[0,0,1],[-1,0,0],[0,0,-1],[1,0,0]],points=[[0,0,0],[200,0,200],[0,0,400],[-200,0,200],[0,0,0]];
  const elbows=Array.from({length:4},(_,i)=>({type:'elbow',theta:Math.PI/2,radius:R,u:headings[i],v:headings[i+1],n:headings[i+1],start:points[i],finish:points[i+1]}));
  const p={valid:true,context:{ports:{a:points[0],b:points[4]},axes:{b:[1,0,0]}},elbows,elements:elbows};
  const r=routeAngleSensitivity(p,.5);assert.equal(r.valid,true);assert.equal(r.scenarios.length,16);near(r.baseline.distance,0);
  near(perturbedRouteEndpoint(p,[.5,.5,.5,.5]).axisMismatch,2,1e-6);
  assert.equal(routeAngleSensitivity({...p,valid:false},.5).valid,false);
});

const cone={shape:'custom',top:'flat',bottom:'cone',diameter:1200,height:2000,bottomAngle:60,bottomSmall:200,endThickness:6};
const nozzle=extra=>({...NOZZLE_DEFAULTS,id:'N1',name:'出口',host:'bottom',end:'bare',od:60,thickness:3,projection:200,inside:0,...extra});
test('cone small end is an opening, not a phantom plate for a centred or rim-crossing nozzle',()=>{
  for(const radius of [0,100,120,132]){const r=estimateTank({...cone,nozzles:[nozzle({radius})]});assert.equal(r.valid,true);assert.equal(r.nozzlePlan.valid,false);assert.ok(r.nozzlePlan.issues.some(i=>i.field==='radius'&&/既有開口/.test(i.message)));assert.throws(()=>tankWorkOrder(r));}
  assert.equal(estimateTank({...cone,nozzles:[nozzle({radius:136.3})]}).nozzlePlan.valid,true,'outside corner at 100 + 6 sin60, hole radius 31');
  const match=estimateTank({...cone,nozzles:[nozzle({radius:0,od:200})]});assert.equal(match.nozzlePlan.valid,false,'small-end butt connection needs a different model');
});
test('a nozzle fully on the cone face has the independent analytical axial saddle length',()=>{
  const r=estimateTank({...cone,nozzles:[nozzle({radius:250,holeGap:0})]}),n=r.nozzlePlan.items[0];assert.equal(r.nozzlePlan.valid,true,JSON.stringify(r.nozzlePlan.issues));
  // Offset outer cone: z_out - z_in = t / cos(beta). The circle extrema are r_c +/- r_pipe.
  const beta=Math.PI/3,sag=30*Math.tan(beta),mid=200+6/Math.cos(beta);
  near(n.minCutLength,mid-sag,1e-5);near(n.maxCutLength,mid+sag,1e-5);
});
test('opening rim checks apply to pads, top cones, and either horizontal end',()=>{
  for(const padOD of [160,110]){const pad=estimateTank({...cone,nozzles:[nozzle({radius:160,padOD,padThickness:6})]});assert.equal(pad.nozzlePlan.valid,false);assert.ok(pad.nozzlePlan.issues.some(i=>i.field==='padOD'));}
  for(const orientation of ['vertical','horizontal'])for(const host of ['top','bottom']){
    const r=estimateTank({...cone,orientation,top:'cone',topAngle:60,topSmall:200,nozzles:[nozzle({host,radius:0})]});assert.equal(r.nozzlePlan.valid,false,orientation+' '+host);
  }
});
test('PWHT and inspection are references; P-No.1 thickness rules do not exempt stainless',()=>{
  const ss=estimateTank({code:'asme',shellThickness:39,endThickness:39,methods:{heat:{material:'ss'}}});assert.equal(ss.process.heat.need,null);
  const cards=methodCatalog(ss);for(const id of ['heat','inspection']){const c=cards.find(x=>x.id===id);assert.equal(c.reference,true);assert.match(c.notes.join(' '),/未依輸入版次切換/);}
  assert.match(cards.find(c=>c.id==='heat').summary,/待確認/);
  const thin=estimateTank({code:'asme',shellThickness:6,endThickness:6});const html=tankWorkOrder(thin);assert.match(html,/厚度條件未觸發/);assert.doesNotMatch(html,/不需 PWHT/);assert.match(tankCSV(thin),/這項條件未觸發/);
});
test('hydrostatic reference needs explicit MAWP; design pressure never fills it silently',()=>{
  const input={code:'asme',service:'pressure',pressure:800};
  const pending=estimateTank(input);assert.equal(pending.process.test.pressurePending,true);assert.equal(pending.process.test.testPressure,undefined);assert.match(tankCSV(pending),/待填核定 MAWP/);
  const specified=estimateTank({...input,methods:{inspection:{mawp:1000,lsr:1.1}}});near(specified.process.test.testPressure,1430);assert.equal(specified.process.test.pressurePending,false);
  const file=readTankProject(tankProject(specified.input));assert.equal(file.methods.inspection.mawp,1000);
  const inactive=estimateTank({...input,methods:{inspection:{mawp:1000,hydro:false}}});assert.equal(inactive.process.test.testPressure,undefined);near(inactive.process.test.water,0);
});
