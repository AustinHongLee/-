import test from 'node:test';
import assert from 'node:assert/strict';
import {TANK_DEFAULTS} from '../dist/assets/tank-geometry.js';
import {estimateTank} from '../dist/assets/tank-materials.js';
import {normalizeFabrication,createFabricationAssembly,partEstimate} from '../dist/assets/tank-fabrication.js';
import {fabricationCSV,fabricationPages} from '../dist/assets/tank-fabrication-report.js';
import {tankProject,readTankProject,tankCSV,tankWorkOrder,tankFabricationWorkOrder} from '../dist/assets/tank-exports.js';
import {NOZZLE_DEFAULTS} from '../dist/assets/tank-nozzles.js';
import {createV1102Input} from '../dist/assets/tank-reference-v1102.js';
const near=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
function sample(){const a=createFabricationAssembly('plate','A1',{material:'SA36',density:7850});a.qty=3;Object.assign(a.parts[0],{qty:2,length:200,width:100,thickness:10,holeDiameter:20,holeCount:2});Object.assign(a.welds[0],{qty:4,length:150,size:5,process:'gtaw',wps:'WPS-07'});return {version:1,assemblies:[a]};}
const input=()=>({...structuredClone(TANK_DEFAULTS),material:'SA240-316L',density:8000,fabricationData:sample()});
test('per-assembly quantities, drilled material volume, mixed densities and welding repetitions expand exactly once',()=>{
  const base=estimateTank({...input(),fabricationData:undefined}),r=estimateTank(input()),f=r.fabricationPlan,p=f.parts[0],w=f.welds[0];assert.equal(r.fabrication.valid,true);assert.equal(p.quantity,6);assert.equal(w.quantity,12);
  const unit=(200*100-2*Math.PI*10**2)*10*7850/1e9;near(p.eachKg,unit);near(p.weight,6*unit);near(r.emptyWeight-base.emptyWeight,6*unit);near(w.length,1800);near(r.process.weld.totals.length-base.process.weld.totals.length,1800);
  const detailed=r.process.weld.seams.find(w=>w.id==='A1.W1');assert.equal(detailed.process,'gtaw');assert.equal(detailed.wps,'WPS-07');near(detailed.metal,1.1*5*5/2*1800*8000/1e9);
  // Loads are kN, not kg, and are recomputed before the support/lifting plan.
  near(r.attachments.loads.operating-base.attachments.loads.operating,6*unit*9.80665/1000);
});
test('tube, round-bar and annular-plate volumes use independent solid geometry',()=>{
  const p=normalizeFabrication(sample()).data.assemblies[0].parts[0];
  near(partEstimate({...p,kind:'pipe',od:100,thickness:5,length:400}).eachKg,Math.PI*(100**2-90**2)/4*400*7850/1e9);
  near(partEstimate({...p,kind:'round',od:16,length:400}).eachKg,Math.PI*8**2*400*7850/1e9);
  near(partEstimate({...p,kind:'ring',od:200,idiameter:100,thickness:12}).eachKg,Math.PI*(100**2-50**2)*12*7850/1e9);
});
test('unknown geometry, supplier mass, material and weld dimensions remain pending instead of becoming zero',()=>{
  const data=sample(),a=data.assemblies[0];a.parts.push({...a.parts[0],id:'P2',kind:'profile',spec:'弧形腹板',eachKg:null});a.parts[0].length=null;a.welds[0].size=null;const r=estimateTank({...input(),fabricationData:data}),f=r.fabricationPlan;
  assert.equal(r.fabrication.valid,true);assert.equal(f.parts[0].weight,null);assert.equal(f.parts[1].weight,null);assert.equal(f.unknownWeight,2);assert.equal(f.unknownWelds,1);assert.equal(r.process.weld.seams.some(w=>w.id==='A1.W1'),false);assert.ok(f.pending.length>=3);assert.equal(r.process.erection.transport.assessed,false);
  const csv=fabricationCSV(r);assert.match(csv,/待填/);assert.match(csv,/A1.W1/);assert.doesNotMatch(csv,/NaN|Infinity/);
});
test('a unit-mass override changes only mass, and does not manufacture missing cut dimensions',()=>{
  const data=sample();Object.assign(data.assemblies[0].parts[0],{length:null,eachKg:3.2});const r=estimateTank({...input(),fabricationData:data}),p=r.fabricationPlan.parts[0];near(p.weight,19.2);assert.equal(p.dimensionsReady,false);assert.equal(p.ready,false);
  Object.assign(data.assemblies[0].parts[0],{kind:'purchased',spec:'M20 螺栓套件',eachKg:0});const zero=estimateTank({...input(),fabricationData:data}).fabricationPlan.parts[0];assert.equal(zero.weight,0);assert.equal(zero.ready,true);
});
test('a detailed support assembly replaces generic support material and welds without double counting',()=>{
  const p=input();p.fabricationData.assemblies[0].target='support';p.methods.supports.type='legs';const withOld=estimateTank(p);p.methods.supports.type='none';const noOld=estimateTank(p);near(withOld.emptyWeight,noOld.emptyWeight);near(withOld.process.weld.totals.length,noOld.process.weld.totals.length);assert.deepEqual(withOld.attachments.supports.bom,[]);assert.equal(withOld.fabricationPlan.parts.length,1);assert.equal(withOld.attachments.supports.warnings.length,0);
});
test('a detailed nozzle takes ownership of its pipe/flange mass and seams but preserves the opening and pad',()=>{
  const p=input();p.fabricationData=undefined;p.nozzles=[{...NOZZLE_DEFAULTS,id:'N1',flangeWeight:6,padOD:170,padThickness:6}];const base=estimateTank(p),a=sample().assemblies[0];a.target='N1';a.qty=1;p.fabricationData={version:1,assemblies:[a]};const r=estimateTank(p),original=base.nozzlePlan.items[0];
  near(r.emptyWeight,base.emptyWeight-original.pipeWeight-6+r.fabricationPlan.knownWeight);near(r.attachments.pads.weight,base.attachments.pads.weight);assert.equal(r.process.weld.seams.filter(w=>w.nozzle==='N1').length,0);assert.equal(r.fabricationPlan.bom.some(p=>p.id==='NOZZLE.N1'),false);near(r.nozzlePlan.items[0].hole,original.hole);
});
test('pad and cover/davit ownership replaces only its selected attachment and cannot duplicate its estimate',()=>{
  for(const target of ['pad:N1','cover:N1']){
    const p=input();p.fabricationData=undefined;p.nozzles=[{...NOZZLE_DEFAULTS,id:'N1',kind:'manhole',height:1000,od:323.9,thickness:9.5,flangeOD:482.6,flangeLength:150,flangeWeight:10,padOD:600,padThickness:6,coverThickness:12,davit:'none'}];const base=estimateTank(p),replaced=target.startsWith('pad')?base.attachments.pads.weight:base.attachments.manholes.weight,a=sample().assemblies[0];a.target=target;a.qty=1;a.welds=[];Object.assign(a.parts[0],{kind:'purchased',spec:'供應商成品套件',eachKg:12,qty:1});p.fabricationData={version:1,assemblies:[a]};const r=estimateTank(p);assert.equal(r.fabrication.valid,true);near(r.emptyWeight,base.emptyWeight-replaced+12);assert.equal(target.startsWith('pad')?r.attachments.pads.items.length:r.attachments.manholes.items.length,0);assert.equal(r.fabricationPlan.bom.some(p=>p.id==='NOZZLE.N1.PAD'),false);assert.equal(readTankProject(tankProject(p)).fabricationData.assemblies[0].target,target);
  }
});
test('circular welds use the specified centreline diameter and explicit joint multiplicity',()=>{
  const p=input(),a=p.fabricationData.assemblies[0];Object.assign(a.welds[0],{measure:'circumference',diameter:100,qty:2});const r=estimateTank(p),w=r.fabricationPlan.welds[0];near(w.eachLength,Math.PI*100);near(w.length,Math.PI*100*2*3);assert.equal(w.quantity,6);
});
test('a rolled single part can weld its own distinct edges, while an unidentified self-joint remains invalid',()=>{
  const p=input(),w=p.fabricationData.assemblies[0].welds[0];w.b='P1';assert.equal(estimateTank(p).fabrication.valid,false);w.aLocation='展開起邊';w.bLocation='展開終邊';const r=estimateTank(p);assert.equal(r.fabrication.valid,true);assert.equal(r.fabricationPlan.welds[0].a,r.fabricationPlan.welds[0].b);assert.equal(readTankProject(tankProject(p)).fabricationData.assemblies[0].welds[0].bLocation,'展開終邊');
});
test('empty replacing assemblies still disclose missing mass rather than declaring a complete zero-weight bill',()=>{
  const p=input(),a=p.fabricationData.assemblies[0];a.parts=[];a.welds=[];a.target='support';const r=estimateTank(p),placeholder=r.fabricationPlan.bom.find(p=>p.id==='A1');assert.equal(placeholder.weight,null);assert.equal(r.fabricationPlan.unknownTotal,1);assert.ok(r.fabricationPlan.pending.some(p=>p.id==='A1'));assert.equal(r.process.erection.transport.assessed,false);
});
test('large valid fabrication projects survive round-trip beyond the former 100 KB project limit',()=>{
  const p=input();p.fabricationData.assemblies=Array.from({length:40},(_,i)=>{const a=structuredClone(p.fabricationData.assemblies[0]);a.id='A'+(i+1);a.parts[0].note='尺寸記錄'.repeat(180);return a;});const text=tankProject(p);assert.ok(new TextEncoder().encode(text).length>100000);assert.equal(readTankProject(text).fabricationData.assemblies.length,40);
});
test('stable part and joint identities survive quantity changes and insertion of unrelated assemblies',()=>{
  const p=input(),r=estimateTank(p),ids=r.fabricationPlan.register.map(w=>w.id);p.fabricationData.assemblies[0].qty=7;p.fabricationData.assemblies.unshift({...createFabricationAssembly('purchase','A9'),parts:[]});const next=estimateTank(p);assert.deepEqual(next.fabricationPlan.register.map(w=>w.id),ids);assert.equal(next.fabricationPlan.parts[0].id,'A1.P1');
});
test('valid IDs which match object property names remain isolated register keys',()=>{
  const p=input();p.fabricationData.assemblies[0].id='constructor';const r=estimateTank(p);assert.equal(r.fabrication.valid,true);assert.ok(r.fabricationPlan.groups.some(g=>g.id==='constructor'));assert.equal(Object.hasOwn(Object,'weight'),false);assert.equal(readTankProject(tankProject(p)).fabricationData.assemblies[0].id,'constructor');
});
test('bad IDs, non-finite/negative dimensions, fractional counts and dangling joint references stop exports',()=>{
  for(const mutate of [a=>delete a.id,a=>a.id=null,a=>a.parts[0].id=undefined,a=>a.welds[0].id=3,a=>a.target={},a=>a.welds[0].process='__proto__',a=>a.qty=1.2,a=>a.parts[0].qty=0,a=>a.parts[0].thickness=-1,a=>a.parts[0].length='Infinity',a=>a.welds[0].b='P999',a=>a.welds[0].b='P1',a=>a.welds[0].qty=0]){
    const p=input();mutate(p.fabricationData.assemblies[0]);const r=estimateTank(p);assert.equal(r.fabrication.valid,false);assert.throws(()=>tankCSV(r));assert.throws(()=>readTankProject(tankProject(p)));
  }
});
test('duplicate assembly/part/joint IDs and ownership conflicts are rejected while missing values are allowed',()=>{
  for(const mutate of [d=>d.assemblies.push(structuredClone(d.assemblies[0])),d=>d.assemblies[0].parts.push(structuredClone(d.assemblies[0].parts[0])),d=>d.assemblies[0].welds.push(structuredClone(d.assemblies[0].welds[0])),d=>{d.assemblies[0].target='support';d.assemblies.push({...structuredClone(d.assemblies[0]),id:'A2'});}]){const d=sample();mutate(d);assert.ok(normalizeFabrication(d).issues.length);}
  const d=sample();d.assemblies[0].parts[0].length=null;assert.equal(normalizeFabrication(d).issues.length,0);
});
test('impossible bores, hole areas and deleted nozzle targets remain actionable errors',()=>{
  for(const changes of [{kind:'pipe',od:100,thickness:50},{kind:'ring',od:100,idiameter:100},{holeDiameter:300,holeCount:1}]){const p=input();Object.assign(p.fabricationData.assemblies[0].parts[0],changes);assert.equal(estimateTank(p).fabrication.valid,false);}
  const p=input();p.fabricationData.assemblies[0].target='N2';p.fabricationData.assemblies[0].qty=1;const r=estimateTank(p);assert.equal(r.fabrication.valid,false);assert.match(r.fabrication.issues[0].field,/A1.target/);
});
test('v4 projects preserve component graphs and v1/v2 without registers migrate to empty reusable data',()=>{
  const p=input(),json=tankProject(p),saved=readTankProject(json);assert.equal(JSON.parse(json).version,9);assert.deepEqual(saved.fabricationData,normalizeFabrication(p.fabricationData).data);near(estimateTank(saved).emptyWeight,estimateTank(p).emptyWeight);
  for(const version of [1,2,3]){const old={...p};delete old.fabricationData;assert.deepEqual(readTankProject(JSON.stringify({type:'special-method-tank',version,input:old})).fabricationData,{version:1,assemblies:[]});}
});
test('shared templates work on horizontal and vertical tanks, independently of the drawing reference',()=>{
  for(const shape of ['open','flat','elliptical'])for(const template of ['support','plate','pipe','purchase']){const p={...structuredClone(TANK_DEFAULTS),shape,fabricationData:{version:1,assemblies:[createFabricationAssembly(template,'A1')]}},r=estimateTank(p);assert.equal(r.valid,true);assert.equal(r.fabrication.valid,true);assert.ok(r.fabricationPlan.parts.length);assert.equal(readTankProject(tankProject(p)).fabricationData.assemblies.length,1);}
});
test('BOM and reports retain pending entries, repeat counts and escaped owner text without spreadsheet formulas',()=>{
  const p=input(),a=p.fabricationData.assemblies[0];a.name='<img src=x onerror=alert(1)>';a.parts[0].name='=HYPERLINK("x")';a.parts[0].eachKg=null;a.parts.push({...a.parts[0],id:'P2',kind:'purchased',spec:'未確認',eachKg:null});const r=estimateTank(p),csv=fabricationCSV(r),html=tankWorkOrder(r),pages=fabricationPages(r,(title,body)=>title+body);
  assert.match(csv,/"'=HYPERLINK/);assert.match(csv,/A1.P2/);assert.match(csv,/A1.W1/);assert.match(csv,/WPS-07/);assert.ok(tankCSV(r).includes('分件焊道登錄'));assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img src=x/);assert.ok(pages.length>=2);assert.match(html,/3 組/);assert.match(html,/資料尚未齊全/);
});
test('dedicated fabrication print includes the BOM, stable weld index and joint tables without unrelated process pages',()=>{
  const r=estimateTank(input()),html=tankFabricationWorkOrder(r);assert.match(html,/分件與採購表/);assert.match(html,/全槽焊道索引/);assert.match(html,/A1.W1/);assert.match(html,/WPS-07/);assert.doesNotMatch(html,/用途與設計條件|液位容積對照/);
});
test('V-1102 has two real support bills, incomplete forged necks and purchased accessories without mass fabrication',()=>{
  const r=estimateTank(createV1102Input()),f=r.fabricationPlan;assert.equal(f.data.assemblies.length,11);assert.equal(f.parts.length,34);assert.equal(f.welds.length,29);
  const get=id=>f.parts.find(p=>p.id===id);assert.equal(get('A1.P1').quantity,1);near(get('A1.P1').weight,(670*140-2*Math.PI*19**2/4)*12*7850/1e9);near(get('A1.P6').weight,(670*140-2*(Math.PI*19**2/4+19*10))*12*7850/1e9);near(get('A1.P4').weight,830*250*5*8000/1e9*2);assert.equal(get('A1.P3').quantity,4);assert.equal(get('A1.P3').weight,null);assert.equal(get('A3.P2').quantity,2);assert.equal(get('A3.P2').weight,null);assert.equal(get('A7.P3').length,null);assert.equal(get('A7.P3').weight,null);assert.equal(f.unknownWelds,27);near(f.bom.reduce((s,p)=>s+(p.weight??0),0),r.emptyWeight);assert.equal(f.bom.some(p=>p.name.includes('SN2')),false);assert.equal(r.process.erection.transport.assessed,false);
  for(const id of ['NOZZLE.N8.PAD','NOZZLE.N9.PAD']){const pad=f.bom.find(p=>p.id===id);assert.ok(pad);assert.equal(pad.weight,null);assert.equal(pad.quantity,1);}
});
