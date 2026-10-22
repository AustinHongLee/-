import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateTank,compareTankStocks} from '../dist/assets/tank-materials.js';
import {TANK_DEFAULTS} from '../dist/assets/tank-geometry.js';
import {createFabricationAssembly} from '../dist/assets/tank-fabrication.js';
import {createV1102Input} from '../dist/assets/tank-reference-v1102.js';
import {compareMaterialStocks,applyStockRecommendations} from '../dist/assets/tank-stock-comparison.js';
import {normalizeStockSelections,stockSelectionKey,selectStockGroup,stockFor} from '../dist/assets/tank-stock-config.js';
import {tankProject,readTankProject,tankCSV,tankWorkOrder,tankFabricationWorkOrder} from '../dist/assets/tank-exports.js';
import {stockPurchaseMarkup} from '../dist/assets/tank-stock-purchase-ui.js';
import {stockCSVRows} from '../dist/assets/tank-stock-report.js';
const near=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
const choice=(material,t,density,stock)=>({material,thickness:t,density,stock});
function detail(extra={},id='A1'){const a=createFabricationAssembly('plate',id,{material:'SA36',density:7850});a.welds=[];Object.assign(a.parts[0],{length:200,width:100,thickness:12,...extra});return a;}
const input=(assemblies=[],extra={})=>({...structuredClone(TANK_DEFAULTS),material:'SUS304',density:7930,diameter:900,height:1800,fabricationData:{version:1,assemblies},...extra});
function check(r){
  for(const s of r.sheets){
    const group=r.stockPlan.groups.find(g=>g.id===s.group),board=stockFor(r.input,group.materialKnown?group.material:'',s.thickness,s.density);assert.equal(s.length,board.stockLength);assert.equal(s.width,board.stockWidth);
    for(const a of s.placements){assert.ok(a.x+a.w<=s.length+1e-7&&a.y+a.h<=s.width+1e-7);for(const b of s.placements)if(a!==b)assert.ok(a.x+a.w+r.input.kerf<=b.x+1e-7||b.x+b.w+r.input.kerf<=a.x+1e-7||a.y+a.h+r.input.kerf<=b.y+1e-7||b.y+b.h+r.input.kerf<=a.y+1e-7);}
    near(s.weight,s.width*s.length*s.thickness*s.density/1e9);near(s.blankWeight+s.offcutWeight,s.weight);
  }
  near(r.stockWeight,r.stockPlan.groups.reduce((sum,g)=>sum+g.weight,0));near(r.allocatedBlankWeight+r.offcutWeight,r.stockWeight);
}
test('independent material/thickness choices can use three stock sizes simultaneously',()=>{
  const p=input([detail(),detail({material:'SUS316L',density:8000,thickness:3},'A2')],{stockSelections:[choice('SUS304',6,7930,'5x20'),choice('SA36',12,7850,'4x8'),choice('SUS316L',3,8000,'5x10')]}),r=estimateTank(p);assert.ok(r.valid&&r.fabrication.valid);check(r);
  assert.deepEqual(r.stockPlan.groups.map(g=>[g.material,g.thickness,g.length]),[['SUS304',6,6096],['SA36',12,2438.4],['SUS316L',3,3048]]);
});
test('same material with a different density cannot inherit another group selection',()=>{
  const r=estimateTank(input([detail({density:7800}),detail({},'A2')],{stockSelections:[choice(' sa36 ',12,7850,'4x8')]}));check(r);
  assert.equal(r.stockPlan.groups.find(g=>g.material==='SA36'&&g.density===7800).length,6000);assert.equal(r.stockPlan.groups.find(g=>g.material==='SA36'&&g.density===7850).length,2438.4);
});
test('shell stock rebuilds actual courses, panels, BOM source mapping and known weld length',()=>{
  const p=input([],{height:4100}),small=estimateTank({...p,stockSelections:[choice('SUS304',6,7930,'4x8')]}),large=estimateTank({...p,stockSelections:[choice('SUS304',6,7930,'5x20')]});
  assert.ok(small.courses>large.courses);assert.ok(small.parts[0].quantity>large.parts[0].quantity);assert.ok(small.process.weld.totals.length>large.process.weld.totals.length);check(small);check(large);
  assert.equal(small.fabricationPlan.bom.find(p=>p.id==='BODY.S').quantity,small.parts[0].quantity);for(const piece of small.assembly)assert.ok(small.sheets.find(s=>s.id===piece.sheet).placements.some(p=>p.label===piece.id));
});
test('spliced flat ends, conical sheets and petals regenerate against their own thickness stock',()=>{
  for(const end of ['flat','cone','dome']){const p=input([],{shape:'custom',top:end,bottom:'flat',diameter:2800,height:2500,shellThickness:10,endThickness:8,topThickness:8});p.methods.layout.bottom='strips';p.methods.layout.top='strips';
    const small=estimateTank({...p,stockSelections:[choice('SUS304',8,7930,'4x8')]}),large=estimateTank({...p,stockSelections:[choice('SUS304',8,7930,'5x20')]});assert.ok(small.fabrication.valid,JSON.stringify(small.fabrication.issues));assert.ok(large.fabrication.valid);check(small);check(large);assert.notEqual(JSON.stringify(small.parts.slice(1).map(p=>[p.quantity,p.width,p.height])),JSON.stringify(large.parts.slice(1).map(p=>[p.quantity,p.width,p.height])));assert.equal(small.parts[0].quantity,large.parts[0].quantity);
  }
});
test('annular ring and centre plate use their separate thickness choices in the same end layout',()=>{
  const p=input([],{diameter:9000,height:6000,shellThickness:12,endThickness:6,stockSelections:[choice('SUS304',10,7930,'4x8'),choice('SUS304',6,7930,'5x20')]});p.methods.layout.bottom='annular';p.methods.layout.annularThickness=10;const r=estimateTank(p);assert.ok(r.fabrication.valid,JSON.stringify(r.fabrication.issues));check(r);assert.equal(r.stockPlan.groups.find(g=>g.thickness===10).length,2438.4);assert.equal(r.stockPlan.groups.find(g=>g.thickness===6).length,6096);
});
test('skirt, plate-cut rings and jacket regenerate automatic pieces for selected stock',()=>{
  const p=input([],{shape:'elliptical',diameter:2400,height:3000,shellThickness:10,endThickness:10,stockSelections:[choice('SUS304',8,7930,'4x8')]});p.methods.supports.type='skirt';p.methods.supports.skirtThickness=8;p.methods.supports.skirtHeight=2000;
  p.methods.jacket.type='full';p.methods.jacket.jacketThickness=8;p.methods.jacket.from=0;p.methods.jacket.to=2500;
  p.methods.rings=[{id:'R1',purpose:'stiffener',section:'flat',a:100,b:0,t:8,position:1000,side:'out',make:'plate',barLength:6000,weld:'both'}];
  const r=estimateTank(p);assert.ok(r.fabrication.valid,JSON.stringify(r.fabrication.issues));check(r);const g=r.stockPlan.groups.find(g=>g.thickness===8);assert.ok(g.partIDs.includes('JS'));assert.ok(g.partIDs.some(id=>id.startsWith('R')));assert.ok(r.attachmentParts.find(p=>p.id==='JS').pieces.every(x=>Math.min(x.w,x.h)<=1219.2));
});
test('fixed detail blank comparison never changes finished dimensions or unit mass',()=>{
  const p=input([detail({length:1600,width:1100,qty:4,eachKg:99})]),r=estimateTank(p),before=JSON.stringify(r),c=compareMaterialStocks(r),item=c.groups.find(x=>x.group.material==='SA36');assert.equal(item.automatic,false);
  for(const o of item.options){const actual=estimateTank({...p,stockSelections:selectStockGroup(p.stockSelections,item.group,o.id)}),g=actual.stockPlan.groups.find(x=>x.selectionKey===item.group.selectionKey);assert.equal(o.sheetCount,g.sheetCount);near(o.weight,g.weight);near(o.offcutWeight,g.offcutWeight);assert.equal(actual.fabricationPlan.parts[0].weight,396);}
  assert.equal(JSON.stringify(r),before);assert.equal(compareMaterialStocks(r),c);
});
test('V-1102 mixed procurement saves 52.0257024 kg on known blanks, and no finished mass is added twice',()=>{
  const r=estimateTank(createV1102Input()),c=compareMaterialStocks(r);assert.equal(c.partial,true);assert.deepEqual(c.groups.map(x=>[x.group.material,x.best.id]),[['SA240-316L','5x10'],['SA36 / HDG','4x8'],['SA240-304','4x8']]);near(c.savingWeight,52.0257024);
  const next=estimateTank({...r.input,stockSelections:applyStockRecommendations(r)});assert.equal(next.plateSheets,3);near(next.stockWeight,494.14309429248);near(next.stockWeight,c.recommendedWeight);near(next.emptyWeight,r.emptyWeight);check(next);assert.equal(next.input.stockSelections.length,3);assert.equal(compareMaterialStocks(next).changes.length,0);
});
test('infeasible stock is retained for correction and can never win by reporting zero purchased sheets',()=>{
  const r=estimateTank(input([detail({length:5000,width:1400})],{stockSelections:[choice('SA36',12,7850,'4x8')]})),c=compareMaterialStocks(r),item=c.groups.find(x=>x.group.material==='SA36');assert.ok(item);assert.equal(item.current.feasible,false);assert.equal(item.current.sheetCount,0);assert.equal(item.best.id,'5x20');assert.equal(c.savingWeight,null);assert.equal(item.savingWeight,null);assert.ok(r.stockPlan.groups.find(g=>g.material==='SA36').unplaced);assert.match(stockPurchaseMarkup(r),/目前配置未完成，不計節省差額/);
  const none=compareMaterialStocks(estimateTank(input([detail({length:9000,width:3000})]))).groups.find(x=>x.group.material==='SA36');assert.equal(none.best,null);assert.match(stockPurchaseMarkup(estimateTank(input([detail({length:9000,width:3000})]))),/尚有材料組需調整|套用可比較組的建議/);
});
test('density-unknown groups rank by area without inventing kilograms or zero savings',()=>{
  const r=estimateTank(input([detail({material:'X',density:null,eachKg:1})])),c=compareMaterialStocks(r),item=c.groups.find(x=>x.group.material==='X');assert.ok(item.best);assert.equal(item.best.weight,null);assert.equal(c.recommendedWeight,null);assert.equal(c.savingWeight,null);assert.equal(item.best.id,'4x8');assert.match(stockPurchaseMarkup(r),/板面積/);
});
test('a cheaper current custom size stays in the comparison, instead of forcing a larger standard sheet',()=>{
  const r=estimateTank(input([detail()],{stockWidth:1000,stockLength:2000})),item=compareMaterialStocks(r).groups.find(x=>x.group.material==='SA36');assert.equal(item.options.length,4);assert.equal(item.best.id,'inherit');assert.equal(item.best.selected,true);
});
test('restoring inheritance and unnamed material selections do not accumulate duplicate keys',()=>{
  const r=estimateTank(input([],{material:''})),g=r.stockPlan.groups[0];let rows=selectStockGroup([],g,'4x8');rows=selectStockGroup(rows,g,'5x20');assert.equal(rows.length,1);assert.equal(rows[0].material,'');assert.deepEqual(selectStockGroup(rows,g,'inherit'),[]);assert.equal(normalizeStockSelections(rows).issues.length,0);
});
test('project v5 preserves material choices; v1–v4 projects and supplied input stay unchanged',()=>{
  const p=input([detail()],{stockSelections:[choice('SA36',12,7850,'4x8')]}),json=tankProject(p),saved=readTankProject(json);assert.equal(JSON.parse(json).version,9);assert.deepEqual(saved.stockSelections,p.stockSelections);near(estimateTank(saved).stockWeight,estimateTank(p).stockWeight);
  for(const version of [1,2,3,4]){const old=structuredClone(p);delete old.stockSelections;assert.deepEqual(readTankProject(JSON.stringify({type:'special-method-tank',version,input:old})).stockSelections,[]);}
  const baseline=JSON.stringify(p);compareMaterialStocks(estimateTank(p));assert.equal(JSON.stringify(p),baseline);
});
test('malformed choices, duplicate normalized keys, invalid density and injected IDs are rejected on import',()=>{
  for(const rows of [null,{},[null],[choice('A',6,0,'4x8')],[choice('A',-1,7850,'4x8')],[choice('A',6,7850,'bad')],[choice('a',6,7850,'4x8'),choice(' A ',6,7850,'5x20')]]){assert.ok(normalizeStockSelections(rows).issues.length);assert.throws(()=>readTankProject(tankProject(input([],{stockSelections:rows}))));}
  const rows=[choice('__proto__',6,null,'4x8')];assert.equal(normalizeStockSelections(rows).issues.length,0);assert.equal(stockSelectionKey('a',6,null),stockSelectionKey(' A ',6,null));
});
test('mixed sheet dimensions, comparison recommendations and unknown scope survive BOM/CSV and both reports',()=>{
  const r=estimateTank(createV1102Input()),next=estimateTank({...r.input,stockSelections:applyStockRecommendations(r)});const rows=stockCSVRows(next),text=rows.map(x=>x.join('|')).join('\n');assert.match(text,/分組板型比較/);assert.match(text,/5′ × 10′/);assert.match(text,/494.143094/);
  for(const html of [tankWorkOrder(next,{includeQuotes:true}),tankFabricationWorkOrder(next,{includeQuotes:true})]){assert.match(html,/每組材料怎麼買/);assert.match(html,/未混搭|不混搭/);assert.match(html,/494.14/);assert.match(html,/省料建議/);assert.doesNotMatch(html,/NaN|Infinity/);}
  const csv=tankCSV(next);for(const s of next.sheets)assert.match(csv,new RegExp(`${s.id},${s.thickness},${s.length},${s.width},`));
  const a=detail({material:'<SS&304>',name:'=formula'}),m=stockPurchaseMarkup(estimateTank(input([a])));assert.match(m,/&lt;SS&amp;304&gt;/);assert.doesNotMatch(m,/<SS&304>/);
});
test('uniform-size comparison intentionally resets overrides and never mislabels a mixed plan as uniform',()=>{
  const p=input([detail()],{stockSelections:[choice('SA36',12,7850,'5x20')]});for(const option of compareTankStocks(p))for(const sheet of option.result.sheets){assert.equal(sheet.length,option.stockLength);assert.equal(sheet.width,option.stockWidth);}
});
