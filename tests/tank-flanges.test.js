import test from 'node:test';
import assert from 'node:assert/strict';
import {NOZZLE_DEFAULTS,normalizeNozzles} from '../dist/assets/tank-nozzles.js';
import {flangeReference,applyFlangeReference,flangeReferenceMatches,flangeDescription} from '../dist/assets/tank-flanges.js';
import {estimateTank} from '../dist/assets/tank-materials.js';
import {TANK_DEFAULTS} from '../dist/assets/tank-geometry.js';
import {tankProject,readTankProject,tankCSV,tankWorkOrder} from '../dist/assets/tank-exports.js';
const n=(data={})=>({...NOZZLE_DEFAULTS,id:'N1',name:'進料',flangeSize:'2',flangeClass:'150',flangeFacing:'RF',flangeMaterial:'ASTM A105',...data});
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);

test('manufacturer inch reference adds separately drawn RF height exactly once to plate thickness and WN face-to-weld length',()=>{
  const r=flangeReference(n());close(r.flangeOD,152.4);close(r.flangeThickness,(.69+1/16)*25.4);close(r.flangeLength,(2.44+1/16)*25.4);close(r.rfHeight,25.4/16);
  const higher=flangeReference(n({flangeClass:'300'}));close(higher.flangeOD,165.1);close(higher.flangeThickness,(.81+1/16)*25.4);close(higher.flangeLength,(2.69+1/16)*25.4);
});
test('SO uses its own hub length; unsupported classes, sizes and faces never substitute a different flange',()=>{
  close(flangeReference(n({end:'so'})).flangeLength,(.94+1/16)*25.4);
  close(flangeReference(n({end:'so',flangeClass:'300'})).flangeLength,(1.25+1/16)*25.4);
  for(const data of [{flangeClass:'600'},{flangeSize:'8'},{flangeFacing:'FF'},{flangeFacing:'RTJ'},{end:'bare'},{flangeSize:''}]){assert.equal(flangeReference(n(data)),null);assert.equal(applyFlangeReference(n(data)),null);}
});
test('applying a reference preserves measured pipe geometry and process data, and clears old flange mass',()=>{
  const original=n({od:60,thickness:4,flangeWeight:8.8,soSetback:3,flangeSpec:'圖說 A'}),applied=applyFlangeReference(original);
  assert.equal(original.flangeWeight,8.8);assert.equal(applied.od,60);assert.equal(applied.thickness,4);assert.equal(applied.soSetback,3);assert.equal(applied.flangeSpec,'圖說 A');assert.equal(applied.flangeWeight,0);assert.equal(applied.flangeSource,'texas-v1');assert.equal(flangeReferenceMatches(applied),true);
  const r=estimateTank({nozzles:[applied]});close(r.nozzlePlan.items[0].minCutLength,200+6-(2.44+1/16)*25.4-2);assert.equal(r.nozzlePlan.unknownFlangeWeight,1);
});
test('SO pipe setback affects cut length and endpoint by exactly the chosen distance, independently of flange overall length and WN gap',()=>{
  const base=applyFlangeReference(n({end:'so'})),r=estimateTank({nozzles:[{...base,soSetback:3,weldGap:22}]});assert.equal(r.nozzlePlan.valid,true);const a=r.nozzlePlan.items[0];
  close(a.minCutLength,203);close(Math.hypot(...a.face.map((v,i)=>v-a.pipeEnd[i])),3);
  const shorter=estimateTank({nozzles:[{...base,flangeSource:'manual',flangeLength:22,soSetback:3}]});close(shorter.nozzlePlan.items[0].minCutLength,a.minCutLength);
  for(const setback of [-1,'',26,10000])assert.equal(estimateTank({nozzles:[{...base,soSetback:setback}]}).nozzlePlan.valid,false);
  const noPipe=estimateTank({nozzles:[{...base,projection:1,soSetback:20}]});assert.equal(noPipe.nozzlePlan.valid,false);assert.ok(noPipe.nozzlePlan.issues.some(i=>i.field==='soSetback'));
});
test('reference provenance warns when metadata and dimensions diverge; actual measurements remain allowed',()=>{
  const source=applyFlangeReference(n()),changed={...source,flangeClass:'300'};assert.equal(flangeReferenceMatches(changed),false);
  assert.ok(estimateTank({nozzles:[changed]}).nozzlePlan.items[0].warnings.some(w=>w.includes('不一致')));
  const manual={...changed,flangeSource:'manual',flangeLength:60};assert.ok(!estimateTank({nozzles:[manual]}).nozzlePlan.items[0].warnings.some(w=>w.includes('不一致')));
  assert.ok(estimateTank({nozzles:[n({flangeSize:'14',flangeClass:'2500'})]}).nozzlePlan.items[0].warnings.some(w=>w.includes('尺寸範圍')));
});
test('older nozzle projects inherit blank specification records without changing measured dimensions',()=>{
  const legacy={id:'N1',end:'so',od:60,thickness:3,flangeOD:150,flangeLength:50,flangeThickness:18,flangeSpec:'舊圖說：2 inch 150#'};
  const restored=readTankProject(tankProject({...TANK_DEFAULTS,nozzles:[legacy]})).nozzles[0];assert.equal(restored.soSetback,0);assert.equal(restored.flangeSize,'');assert.equal(restored.flangeClass,'');assert.equal(restored.flangeSource,'manual');assert.equal(restored.flangeLength,50);assert.equal(restored.flangeSpec,legacy.flangeSpec);
  const complete={...TANK_DEFAULTS,nozzles:[applyFlangeReference(n({end:'so',soSetback:3}))]};assert.deepEqual(readTankProject(tankProject(complete)),complete);
  for(const data of [{flangeClass:'500'},{flangeFacing:'other'},{flangeSize:'26'},{flangeSource:'fake'},{flangeMaterial:{bad:1}}])assert.ok(normalizeNozzles([n(data)]).issues.length);
});
test('print and CSV retain NPS, Class, face, material, source and setback without exposing injected markup',()=>{
  const a=applyFlangeReference(n({end:'so',soSetback:3,flangeMaterial:'<b>ASTM A105</b>',flangeSpec:'=SUM(1,2)'})),r=estimateTank({nozzles:[a]}),html=tankWorkOrder(r),csv=tankCSV(r);
  assert.match(flangeDescription(a),/NPS 2.*Class 150.*RF/);assert.match(html,/NPS 2/);assert.match(html,/Class 150/);assert.match(html,/&lt;b&gt;ASTM A105&lt;\/b&gt;/);assert.doesNotMatch(html,/<b>ASTM A105<\/b>/);assert.match(html,/法蘭尺寸來源/);assert.match(html,/管端退縮 3 mm/);assert.match(csv,/SO 管端退縮 mm/);assert.match(csv,/'=SUM/);assert.match(csv,/Texas Flange/);
});
