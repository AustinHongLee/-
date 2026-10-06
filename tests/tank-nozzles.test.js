import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateTank} from '../dist/assets/tank-materials.js';
import {TANK_DEFAULTS} from '../dist/assets/tank-geometry.js';
import {NOZZLE_DEFAULTS,normalizeNozzles} from '../dist/assets/tank-nozzles.js';
import {tankProject,readTankProject,tankCSV,tankWorkOrder} from '../dist/assets/tank-exports.js';
import {tankCodeGuide} from '../dist/assets/tank-codes.js';
import {assemblySketch} from '../dist/assets/tank-visuals.js';
const n=(data={})=>({...NOZZLE_DEFAULTS,id:'N1',name:'進料',...data});
const plan=(data={},tank={})=>estimateTank({...tank,nozzles:[n(data)]});
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);

test('WN length deducts flange face-to-weld length and root gap exactly once; fishmouth longest edge uses inner-wall chord',()=>{
  const r=plan({inside:25,allowance:12}),a=r.nozzlePlan.items[0];assert.equal(r.nozzlePlan.valid,true);
  const shortest=200+25+6-50-2,sag=600-Math.sqrt(600**2-30**2);
  close(a.minCutLength,shortest);close(a.maxCutLength,shortest+sag);close(a.blankLength,shortest+sag+12);
  close(Math.hypot(...a.face.map((v,i)=>v-a.pipeEnd[i])),52);
  close(Math.hypot(...a.pipeEnd.map((v,i)=>v-a.pipeStart[i])),shortest);
});
test('SO and bare pipes retain the full outside projection plus wall and internal extension',()=>{
  for(const end of ['so','bare']){const a=plan({end,inside:25}).nozzlePlan.items[0];close(a.minCutLength,231);close(Math.hypot(...a.face.map((v,i)=>v-a.pipeEnd[i])),0);}
  assert.match(plan({end:'so'}).nozzlePlan.items[0].warnings.join(' '),/齊平/);
});
test('flat-end nozzle coordinates, wall deduction and angle orientation match assembly dimensions',()=>{
  const r=plan({host:'top',radius:100,angle:90,inside:25},{shape:'flat',endThickness:8}),a=r.nozzlePlan.items[0];
  close(a.minCutLength,181);close(a.maxCutLength,181);close(a.surface[0],100);close(a.surface[1],2016);close(a.face[1],2216);
  assert.deepEqual(a.direction,[0,1,0]);
  const b=plan({host:'bottom',radius:100,angle:180},{shape:'flat'}).nozzlePlan.items[0];close(b.surface[2],-100);close(b.face[1],-200);assert.deepEqual(b.direction,[0,-1,0]);
  assert.equal(plan({angle:360}).nozzlePlan.items[0].angle,0);
});
test('missing flat covers, curved heads and out-of-bound holes reject nozzle exports while retaining valid tank estimates',()=>{
  for(const [data,tank,field] of [
    [{host:'top'},{},'host'],[{host:'top'},{shape:'elliptical'},'host'],[{height:5},{},'height'],
    [{height:1995},{},'height'],[{host:'bottom',radius:590},{},'radius'],[{inside:1200},{},'inside'],
    [{projection:40},{},'projection'],[{od:1200,flangeOD:1500},{},'od']
  ]){const r=plan(data,tank);assert.equal(r.valid,true);assert.equal(r.nozzlePlan.valid,false);assert.ok(r.nozzlePlan.issues.some(i=>i.field===field));assert.throws(()=>tankCSV(r),/管嘴/);assert.throws(()=>tankWorkOrder(r),/管嘴/);}
});
test('attachment weights use annular pipe stock; unknown flange mass is counted separately and body/plate estimates stay unchanged',()=>{
  const base=estimateTank({}),r=estimateTank({nozzles:[n(),n({id:'N2',angle:180,height:500,flangeWeight:3.2}),n({id:'N3',angle:270,height:700,end:'bare'})]}),p=r.nozzlePlan;
  assert.equal(p.valid,true);assert.equal(p.flangeCount,2);assert.equal(p.unknownFlangeWeight,1);close(p.flangeWeight,3.2);
  const area=Math.PI*(60**2-54**2)/4;close(p.items[0].pipeWeight,area*p.items[0].maxCutLength/1e9*7850);
  close(p.extraWeight,p.pipeWeight+3.2);assert.equal(r.netWeight,base.netWeight);assert.equal(r.volume,base.volume);assert.equal(r.stockWeight,base.stockWeight);
});
test('periodic longitudinal seams and horizontal seams warn only on geometric opening overlap',()=>{
  assert.ok(plan({angle:359.9}).nozzlePlan.items[0].warnings.some(s=>s.includes('縱縫')));
  const r=plan({height:1000,angle:45});assert.ok(r.nozzlePlan.items[0].warnings.some(s=>s.includes('環縫')));
  assert.ok(!plan().nozzlePlan.items[0].warnings.some(s=>/縱縫|環縫/.test(s)));
  assert.match(assemblySketch(r),/N1/);assert.match(tankCodeGuide(r.input).concerns.join(' '),/壓溫額定尚未校核/);
});
test('nearby pipe holes and flange envelopes produce advisory interference warnings',()=>{
  const r=estimateTank({nozzles:[n(),n({id:'N2',angle:46})]});assert.equal(r.nozzlePlan.valid,true);
  assert.ok(r.nozzlePlan.items.every(a=>a.warnings.some(s=>s.includes('開孔包絡相交'))));
  assert.ok(r.nozzlePlan.items.every(a=>a.warnings.some(s=>s.includes('法蘭空間包絡相交'))));
  const apart=estimateTank({nozzles:[n(),n({id:'N2',angle:180,height:1500})]});assert.ok(apart.nozzlePlan.items.every(a=>!a.warnings.some(s=>s.includes('相交'))));
});
test('project files retain nozzle data and import older projects without nozzle lists',()=>{
  const input={...TANK_DEFAULTS,nozzles:[n({flangeSpec:'業主圖說 A'})]};assert.deepEqual(readTankProject(tankProject(input)),input);
  const old={...TANK_DEFAULTS};delete old.nozzles;assert.deepEqual(readTankProject(tankProject(old)).nozzles,[]);
  assert.equal(readTankProject(tankProject({...input,nozzles:[n({od:'60'})]})).nozzles[0].od,60);
});
test('malformed nozzle objects, duplicate IDs and invalid measurements cannot enter a saved project',()=>{
  for(const values of [null,{},[n(),n()],[n({extra:1})],[n({od:''})],[n({thickness:31})],[n({id:'bad'})],[n({name:'x'.repeat(121)})],[n({end:'bare',flangeWeight:{bad:1}})],Array.from({length:31},(_,i)=>n({id:'N'+(i+1)}))]){
    assert.ok(normalizeNozzles(values).issues.length);assert.throws(()=>readTankProject(tankProject({...TANK_DEFAULTS,nozzles:values})));
  }
});
test('print and CSV include complete nozzle position, material and uncertainty records with escaped text',()=>{
  const r=plan({host:'bottom',radius:100,name:'<script>進料</script>',flangeSpec:'=HYPERLINK("bad")',reinforcement:'依圖 <A>'}),html=tankWorkOrder(r),csv=tankCSV(r);
  assert.match(html,/管嘴位置與備料總覽/);assert.match(html,/N1 管嘴與法蘭尺寸/);assert.match(html,/平底向下/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>進料/);
  assert.match(csv,/'=HYPERLINK/);assert.match(csv,/最長管長 mm/);assert.match(csv,/法蘭單重未提供只數/);assert.match(html,/局部應力/);
});
