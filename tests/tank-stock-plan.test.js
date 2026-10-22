import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {estimateTank,compareTankStocks} from '../dist/assets/tank-materials.js';
import {TANK_DEFAULTS} from '../dist/assets/tank-geometry.js';
import {createFabricationAssembly,normalizeFabrication} from '../dist/assets/tank-fabrication.js';
import {createV1102Input} from '../dist/assets/tank-reference-v1102.js';
import {tankProject,readTankProject,tankCSV,tankWorkOrder,tankFabricationWorkOrder} from '../dist/assets/tank-exports.js';
import {fabricationCSV} from '../dist/assets/tank-fabrication-report.js';
import {sheetGroups,sheetSketch,totalsMarkup} from '../dist/assets/tank-visuals.js';
import {stockSummaryMarkup} from '../dist/assets/tank-stock-report.js';
import {stockChoiceMarkup} from '../dist/assets/tank-stock-ui.js';
import {packTankParts} from '../dist/assets/tank-stock-plan.js';
import {NOZZLE_DEFAULTS} from '../dist/assets/tank-nozzles.js';
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
function assembly(extra={},id='A1'){
  const a=createFabricationAssembly('plate',id,{material:'SA36',density:7850});a.welds=[];
  Object.assign(a.parts[0],{length:200,width:100,thickness:6,...extra});return a;
}
const input=(assemblies,extra={})=>({...structuredClone(TANK_DEFAULTS),material:'SA36',diameter:650,height:900,fabricationData:{version:1,assemblies},...extra});
function packingValid(r){
  for(const sheet of r.sheets){
    for(const a of sheet.placements){
      assert.ok(a.x>=0&&a.y>=0&&a.x+a.w<=sheet.length+1e-7&&a.y+a.h<=sheet.width+1e-7);
      const p=r.stockParts.find(p=>p.id===a.part);assert.equal(p.thickness,sheet.thickness);assert.equal(p.density,sheet.density);
      for(const b of sheet.placements)if(a!==b)assert.ok(a.x+a.w+r.input.kerf<=b.x+1e-7||b.x+b.w+r.input.kerf<=a.x+1e-7||a.y+a.h+r.input.kerf<=b.y+1e-7||b.y+b.h+r.input.kerf<=a.y+1e-7,'overlap or missing kerf');
    }
    near(sheet.blankWeight+sheet.offcutWeight,sheet.weight);
  }
  near(r.allocatedBlankWeight+r.offcutWeight,r.stockWeight);
  assert.equal(r.plateSheets,r.stockPlan.groups.reduce((s,g)=>s+g.sheetCount,0));
}
test('same material and thickness use body offcuts; finished mass is expanded once independently of purchased sheets',()=>{
  const a=assembly();a.qty=3;a.parts[0].qty=2;
  const base=estimateTank(input([])),r=estimateTank(input([a]));assert.ok(r.stockComplete);
  assert.equal(r.plateSheets,base.plateSheets);assert.deepEqual(r.fabricationPlan.parts[0].stock.sheetIDs,[1]);
  const placements=r.sheets.flatMap(s=>s.placements).filter(p=>p.part==='A1.P1');assert.equal(placements.length,6);
  near(r.emptyWeight-base.emptyWeight,200*100*6*7850/1e9*6);near(r.stockWeight,base.stockWeight);
  assert.deepEqual(r.fabricationPlan.bom.find(p=>p.id==='A1.P1').stock,r.fabricationPlan.parts[0].stock);
  packingValid(r);
});
test('material, plate thickness and density each isolate raw sheets; whitespace/case normalization is conservative',()=>{
  const r=estimateTank(input([assembly(),assembly({material:' sa36 '},'A2'),assembly({material:'SA240-316L',density:8000},'A3'),assembly({thickness:12},'A4'),assembly({density:7900},'A5')]));
  const sheetFor=id=>r.sheets.find(s=>s.placements.some(x=>x.part===id)).id;
  assert.equal(sheetFor('A1.P1'),sheetFor('A2.P1'));assert.notEqual(sheetFor('A1.P1'),sheetFor('A3.P1'));assert.notEqual(sheetFor('A1.P1'),sheetFor('A4.P1'));assert.notEqual(sheetFor('A1.P1'),sheetFor('A5.P1'));
  assert.equal(r.stockPlan.groups.length,4);assert.match(r.stockPlan.warnings.join(),/不同密度/);packingValid(r);
});
test('per-part trim overrides tank trim and a confirmed blank is not trimmed a second time',()=>{
  const r=estimateTank(input([assembly({trim:0}),assembly({trim:12},'A2'),assembly({stockMode:'blank',blankLength:225,blankWidth:115},'A3')],{trim:5}));
  assert.deepEqual(r.detailPlateParts.map(p=>[p.width,p.height]),[[200,100],[224,124],[225,115]]);
  const flipped=estimateTank(input([assembly({stockMode:'blank',blankLength:100,blankWidth:200})]));assert.equal(flipped.detailPlateParts.length,1);
  const small=estimateTank(input([assembly({stockMode:'blank',blankLength:190,blankWidth:100})]));assert.equal(small.stockComplete,false);assert.match(small.stockPlan.pending[0].message,/小於/);assert.equal(small.detailPlateParts.length,0);
});
test('annular finished mass and full circular raw blank have different weights, and the hole is never reused for nesting',()=>{
  const a=assembly({kind:'ring',od:200,idiameter:100,thickness:10,trim:5}),r=estimateTank(input([a]));
  const row=r.fabricationPlan.parts[0],p=r.detailPlateParts[0],place=r.sheets.flatMap(s=>s.placements).find(x=>x.part===row.id);
  near(row.weight,Math.PI*(200**2-100**2)/4*10*7850/1e9);near(place.blankWeight,Math.PI*210**2/4*10*7850/1e9);assert.equal(p.innerDiameter,100);
  const cut=r.process.cutting.rows.find(x=>x.id===row.id);near(cut.length,Math.PI*(210+100));assert.equal(cut.contours,2);packingValid(r);
});
test('unit-mass overrides do not change raw plate mass, and drilled holes affect finished mass only',()=>{
  const p=input([assembly({eachKg:123,holeDiameter:12,holeCount:2})]),r=estimateTank(p),b=estimateTank(input([assembly()]));
  near(r.fabricationPlan.parts[0].weight,123);near(r.stockWeight,b.stockWeight);near(r.allocatedBlankWeight,b.allocatedBlankWeight);
  near(r.process.cutting.rows.find(x=>x.id==='A1.P1').length,2*(210+110)+Math.PI*12*2);
});
test('unknown density still yields actual sheet count and never masquerades as zero kg or zero percent',()=>{
  const r=estimateTank(input([assembly({material:'CUSTOM',density:null,eachKg:10})]));
  assert.ok(r.plateSheets>0);assert.equal(r.stockWeight,null);assert.equal(r.utilization,null);assert.equal(r.stockComplete,false);
  assert.equal(r.fabricationPlan.parts[0].stock.status,'weight-pending');assert.equal(r.stockPlan.groups.find(g=>g.material==='CUSTOM').weight,null);
  near(r.stockPlan.knownStockWeight,r.sheets.filter(s=>s.weight!==null).reduce((s,x)=>s+x.weight,0));
  assert.match(stockSummaryMarkup(r),/另有 1 張密度待填/);assert.match(totalsMarkup(r),/毛坯利用 待填密度/);assert.doesNotMatch(totalsMarkup(r),/NaN|undefined/);
  assert.match(stockChoiceMarkup({id:'x',label:'x',stockWidth:1500,stockLength:6000,result:r}),/備料未完整/);
});
test('missing material/shape data are explicit pending entries, and purchased/profile supply choices are reusable',()=>{
  const r=estimateTank(input([assembly({material:''}),assembly({length:null},'A2'),assembly({kind:'profile',spec:'折彎件',eachKg:3},'A3'),assembly({stockMode:'purchase'},'A4'),assembly({kind:'profile',spec:'弧板',eachKg:3,stockMode:'blank',blankLength:400,blankWidth:200},'A5')]));
  assert.deepEqual(r.stockPlan.pending.map(x=>x.field),['fabricationData.A1.P1.material','fabricationData.A2.P1.length','fabricationData.A3.P1.stockMode']);
  assert.equal(r.fabricationPlan.parts[3].stock.status,'purchase');assert.equal(r.detailPlateParts.length,1);assert.equal(r.detailPlateParts[0].id,'A5.P1');
  assert.ok(r.process.cutting.rows.some(x=>x.id==='A5.P1'));assert.match(r.process.cutting.notes.join(),/矩形包絡估初切/);
});
test('oversize and excessive quantity are excluded from sheet counts, with repair targets and printed pending entries',()=>{
  const a=assembly({length:20000}),b=assembly({qty:100000},'A2');b.qty=10000;
  const r=estimateTank(input([a,b]));assert.equal(r.stockComplete,false);assert.equal(r.detailPlateParts.length,2);assert.equal(r.sheets.flatMap(s=>s.placements).some(x=>x.part.startsWith('A')),false);
  assert.equal(r.fabricationPlan.parts[0].stock.status,'oversize');assert.equal(r.fabricationPlan.parts[1].stock.status,'limit');assert.match(r.materialIssues.find(x=>x.part==='A2.P1').message,/20,000/);
  assert.match(tankFabricationWorkOrder(r),/A1.P1[\s\S]*放不進原板/);assert.match(tankFabricationWorkOrder(r),/20,000/);assert.match(stockSummaryMarkup(r),/2 項還不能完成備料/);assert.match(stockSummaryMarkup(r),/20,000/);packingValid(r);
});
test('the packer rejects a whole excessive row before expanding its quantity',()=>{
  const rejected=[],p={stockWidth:1000,stockLength:2000,kerf:3,density:7850};
  const sheets=packTankParts([{id:'A',material:'A',density:7850,kind:'rectangle',quantity:1e9,width:10,height:10,thickness:5}],p,{rejected});
  assert.equal(sheets.length,0);assert.equal(rejected[0].reason,'count');
});
test('identical layouts on different materials stay separate in display and print grouping',()=>{
  const parts=['A','B'].map((material,i)=>({id:'P'+i,material,density:7850,kind:'rectangle',quantity:2,width:100,height:100,thickness:5}));
  const sheets=packTankParts(parts,{stockWidth:200,stockLength:500,kerf:3,density:7850});
  // Make the same geometry labels on each sheet to exercise grouping by the stock identity, not the layout.
  for(const s of sheets)for(const x of s.placements)x.part='P';
  assert.equal(sheetGroups({sheets}).length,2);
});
test('all tank shapes and end selections use the shared raw-material ledger',()=>{
  for(const orientation of ['vertical','horizontal'])for(const shape of ['open','flat','elliptical']){
    const r=estimateTank(input([assembly({material:'SUS304',density:7930,thickness:3})],{orientation,shape}));assert.ok(r.valid&&r.fabrication.valid);assert.ok(r.fabricationPlan.parts[0].stock.sheetIDs.length);packingValid(r);
  }
  for(const c of compareTankStocks(input([assembly({thickness:12})])))assert.equal(c.result.stockPlan.groups.find(g=>g.thickness===12).length,c.stockLength);
});
test('project v5 retains stock metadata, while v3 parts without stock settings inherit safe defaults',()=>{
  const p=input([assembly({stockMode:'blank',blankLength:500,blankWidth:300,trim:12})]),json=tankProject(p),saved=readTankProject(json);
  assert.equal(JSON.parse(json).version,9);assert.deepEqual(saved.fabricationData,normalizeFabrication(p.fabricationData).data);
  const old=structuredClone(p);for(const key of ['stockMode','blankLength','blankWidth','trim'])delete old.fabricationData.assemblies[0].parts[0][key];
  const legacy=readTankProject(JSON.stringify({type:'special-method-tank',version:3,input:old}));assert.equal(legacy.fabricationData.assemblies[0].parts[0].stockMode,'auto');assert.equal(legacy.fabricationData.assemblies[0].parts[0].trim,null);
});
test('BOM, CSV, sheets and both print reports agree on source plate and material, and escape user text',()=>{
  const a=assembly({material:'<SS&304>',name:'=danger <plate>',stockMode:'blank',blankLength:220,blankWidth:120}),r=estimateTank(input([a]));
  const row=r.fabricationPlan.parts[0],sheet=r.sheets.find(s=>s.placements.some(x=>x.part===row.id)),svg=sheetSketch(sheet,r,{interactive:true,selected:row.id});
  assert.match(svg,/data-stock-detail="A1.P1"/);assert.match(svg,/A1.P1-1/);assert.match(svg,/&lt;SS&amp;304&gt;/);
  for(const csv of [tankCSV(r),fabricationCSV(r)]){assert.match(csv,/來源原板/);assert.match(csv,/原板採購總表/);assert.match(csv,/'=danger/);assert.match(csv,/A1.P1/);assert.doesNotMatch(csv,/NaN|Infinity/);}
  for(const html of [tankWorkOrder(r),tankFabricationWorkOrder(r)]){assert.match(html,/按材質與板厚採購/);assert.match(html,/來源原板/);assert.match(html,/&lt;SS&amp;304&gt;/);assert.doesNotMatch(html,/<SS&304>/);}
});
test('V-1102 groups 316L, carbon steel and 304 independently; known drawing blanks receive no duplicate allowance',()=>{
  const p=createV1102Input(),r=estimateTank(p);assert.equal(r.plateSheets,4);assert.equal(r.stockPlan.groups.length,3);
  assert.deepEqual(r.stockPlan.groups.map(g=>[g.material,g.thickness,g.sheetCount]),[['SA240-316L',5,2],['SA36 / HDG',12,1],['SA240-304',1.2,1]]);
  near(r.stockWeight,546.16879669248);near(r.emptyWeight,196.9123981525-(4*Math.PI*19**2/4+2*19*10)*12*7850/1e9);
  const wear=r.detailPlateParts.find(p=>p.id==='A1.P4'),base=r.detailPlateParts.find(p=>p.id==='A1.P1');assert.deepEqual([wear.width,wear.height],[830,250]);assert.deepEqual([base.width,base.height],[680,150]);
  assert.equal(r.fabricationPlan.parts.find(p=>p.id==='A5.P2').stock.status,'purchase');packingValid(r);
  const fixture=readTankProject(fs.readFileSync(new URL('../dist/examples/V-1102-drawing-study.json',import.meta.url),'utf8'));assert.deepEqual(fixture.fabricationData,normalizeFabrication(p.fabricationData).data);
});
test('existing automatic reinforcing-pad BOM links to the specific piece on its source sheet',()=>{
  const r=estimateTank(input([],{nozzles:[{...NOZZLE_DEFAULTS,id:'N1',height:450,padOD:170,padThickness:6,flangeWeight:3}]}));
  const row=r.fabricationPlan.bom.find(x=>x.nozzle==='N1');assert.ok(row.stock.sheetIDs.length);
  const source=r.stockParts.find(x=>x.pieces?.some(p=>p.nozzle==='N1'));
  assert.deepEqual(row.stock.sheetIDs,source.sheetIDs);assert.equal(row.stock.status,'packed');packingValid(r);
});
test('unmodeled slanted pads are pending procurement even when no custom fabrication was entered',()=>{
  const p=createV1102Input();p.fabricationData=undefined;const r=estimateTank(p);
  assert.equal(r.stockComplete,false);assert.equal(r.stockPlan.procurementComplete,false);
  assert.ok(r.stockPlan.pending.some(x=>x.field==='nozzles.N8.padOD'));
  assert.equal(r.fabricationPlan.bom.find(x=>x.id==='NOZZLE.N8.PAD').stock.status,'pending');
});
