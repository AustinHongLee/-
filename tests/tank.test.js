import test from 'node:test';
import assert from 'node:assert/strict';
import {solveTank,TANK_DEFAULTS} from '../dist/assets/tank-geometry.js';
import {estimateTank,rectanglePacking,TANK_STOCKS,compareTankStocks,stockPreset} from '../dist/assets/tank-materials.js';
import {tankCodeGuide} from '../dist/assets/tank-codes.js';
import {tankProject,readTankProject,tankCSV,tankWorkOrder} from '../dist/assets/tank-exports.js';
import {assemblySketch} from '../dist/assets/tank-visuals.js';
const close=(a,b,eps=1e-7)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
test('internal dimensions and independently calculated cylinder capacity agree in all solve modes',()=>{
  const d=2000,h=3000,v=3*Math.PI;
  const r=solveTank({diameter:d,height:h});assert.equal(r.valid,true);close(r.volume,v);close(r.workingVolume,.9*v);
  close(solveTank({solve:'height',diameter:d,volume:v}).height,h);
  close(solveTank({solve:'diameter',height:h,volume:v}).di,d);
});
test('outer diameter deducts both walls and inverse solve returns outer dimensions',()=>{
  const r=solveTank({basis:'outside',diameter:2012,height:3000,shellThickness:6});close(r.di,2000);close(r.volume,3*Math.PI);
  close(solveTank({basis:'outside',solve:'diameter',height:3000,volume:3*Math.PI,shellThickness:6}).input.diameter,2012);
  assert.equal(solveTank({basis:'outside',diameter:10,shellThickness:6}).valid,false);
});
test('two ideal 2:1 heads add exact half-ellipsoid volume, but straight flanges and end gaps shorten barrel stock',()=>{
  const r=estimateTank({shape:'elliptical',diameter:2000,height:3000,headStraight:40,headGap:3});assert.equal(r.valid,true);
  close(r.volume,3*Math.PI+2*Math.PI/3);close(r.totalHeight,4012);close(r.headDepth,500);close(r.bodyHeight,2914);
  close(solveTank({shape:'elliptical',solve:'height',diameter:2000,volume:r.volume,headStraight:40,headGap:3}).height,3000);
  close(solveTank({shape:'elliptical',solve:'diameter',height:3000,volume:r.volume,headStraight:40,headGap:3}).di,2000);
  assert.equal(r.formedHeads,2);assert.equal(r.parts[1].kind,'formed');assert.equal(r.parts[1].weightEstimated,true);
});
test('impossible capacity/straight height and blank diameters are actionable errors without fabricated results',()=>{
  for(const input of [{shape:'elliptical',solve:'height',diameter:2000,volume:.1},{shape:'elliptical',height:30},{shape:'elliptical',headBlank:500}]){const r=estimateTank(input);assert.equal(r.valid,false);assert.ok(r.issues.length);assert.equal(r.parts,undefined);}
  assert.equal(solveTank({height:''}).valid,false);assert.equal(solveTank({density:'x'}).valid,false);
  assert.equal(solveTank({solve:'diameter',height:1,volume:1e6}).valid,false);
  assert.equal(solveTank({solve:'height',diameter:1000,volume:1e-6}).valid,false);
  assert.equal(solveTank({shape:'elliptical',overhang:-1}).valid,true);
});
test('plate length and height close assembled dimensions including all circumferential and course gaps',()=>{
  const r=estimateTank({diameter:2000,height:3500,stockLength:3000,stockWidth:1500,gap:3,trim:8});assert.equal(r.valid,true);
  const s=r.parts[0];close(s.finishedWidth*r.panelsPerCourse+r.panelsPerCourse*3,r.circumference);close(s.finishedHeight*r.courses+(r.courses-1)*3,r.bodyHeight);
  close(s.width,s.finishedWidth+16);close(s.height,s.finishedHeight+16);
  close(s.netWeight,s.finishedWidth*s.finishedHeight*s.quantity/1e9*6*7850);
});
test('stock packing includes kerf, rotation and exact edge fits',()=>{
  assert.equal(rectanglePacking(500,500,1000,1000,0).columns*rectanglePacking(500,500,1000,1000,0).rows,4);
  assert.equal(rectanglePacking(500,500,1000,1000,3).columns*rectanglePacking(500,500,1000,1000,3).rows,1);
  const r=rectanglePacking(1400,700,1500,800,3);assert.equal(r.rotated,true);assert.equal(r.columns*r.rows,1);
});
function verifyPacking(r){
  for(const sheet of r.sheets){for(const item of sheet.placements){assert.ok(item.x>=0&&item.y>=0);assert.ok(item.x+item.w<=r.input.stockLength+1e-7);assert.ok(item.y+item.h<=r.input.stockWidth+1e-7);assert.equal(sheet.thickness,r.parts.find(p=>p.id===item.part).thickness);}
    for(let i=0;i<sheet.placements.length;i++)for(let j=i+1;j<sheet.placements.length;j++){const a=sheet.placements[i],b=sheet.placements[j],k=r.input.kerf;assert.ok(a.x+a.w+k<=b.x+1e-7||b.x+b.w+k<=a.x+1e-7||a.y+a.h+k<=b.y+1e-7||b.y+b.h+k<=a.y+1e-7,'pieces overlap or lack kerf');}}
  for(const part of r.parts)if(part.kind!=='formed'&&part.perSheet>0)assert.equal(r.sheets.flatMap(s=>s.placements).filter(i=>i.part===part.id).length,part.quantity);
}
test('same thickness bottoms use barrel offcuts and procurement does not double-count shared sheets',()=>{
  const r=estimateTank({shape:'flat'});assert.equal(r.plateSheets,2);assert.deepEqual(r.parts[1].sheetIDs,[1,2]);assert.equal(r.parts[1].quantity,2);close(r.stockWeight,2*1.5*6*.006*7850);verifyPacking(r);
  const separate=estimateTank({shape:'flat',endThickness:8});assert.equal(separate.plateSheets,3);assert.deepEqual(separate.parts[1].sheetIDs,[3]);verifyPacking(separate);
});
test('different sizes, thicknesses and supply blanks stay inside plates with no overlaps',()=>{
  for(const shape of ['open','flat','elliptical'])for(const diameter of [700,1200,2000]){const r=estimateTank({shape,diameter,height:4100,endThickness:8,stockWidth:2500,stockLength:8000,gap:2,headBlank:2400});assert.equal(r.valid,true);assert.equal(r.stockComplete,true);verifyPacking(r);}
});
test('oversized bottom is reported as unresolved, not converted into a misleading area-based sheet count',()=>{
  const r=estimateTank({diameter:2500,stockWidth:1500});assert.equal(r.valid,true);assert.equal(r.stockComplete,false);assert.equal(r.parts[1].sheets,null);assert.equal(r.parts[1].sheetIDs.length,0);assert.match(r.materialIssues[0].message,/放不進原板/);assert.match(tankWorkOrder(r),/未完成/);assert.match(tankCSV(r),/待解決/);
  assert.equal(estimateTank({stockWidth:2000,stockLength:1000}).materialIssues[0].field,'stockLength');
});
test('flat plate weights use outside wall and overhang, while a real supplied head weight overrides approximation',()=>{
  const r=estimateTank({diameter:1200,shellThickness:6,endThickness:8,overhang:10,trim:5});close(r.parts[1].finishedDiameter,1232);close(r.parts[1].blankDiameter,1242);close(r.parts[1].netWeight,Math.PI*1.232**2/4*.008*7850);
  const head=estimateTank({shape:'elliptical',headWeight:150,headBlank:1600,stockWidth:1800});assert.equal(head.formedHeads,0);assert.equal(head.parts[1].netWeight,300);assert.equal(head.parts[1].weightEstimated,false);assert.equal(head.parts[1].kind,'circle');verifyPacking(head);
});
test('invalid material/stock/fragmentation sizes do not hang or create cutting results',()=>{
  for(const input of [{stockWidth:10,trim:5},{stockLength:10,trim:5},{stockWidth:15,trim:5,height:10000},{shape:'cone'},{solve:'other'},{fill:0},{kerf:-1}])assert.equal(estimateTank(input).valid,false);
});
test('vacuum below 15 psig is still guided to external-pressure design; no automatic exemption or pass',()=>{
  const r=tankCodeGuide({...TANK_DEFAULTS,service:'vacuum',vacuum:80,pressure:0});assert.match(r.title,/容器設計/);assert.ok(r.concerns.some(c=>/失穩/.test(c)));assert.ok(r.concerns.some(c=>/平底/.test(c)));assert.match(r.summary,/不是.*豁免線/);assert.match(r.status,/尚未完成/);
});
test('API scope conflict, inconsistent service and invalid input values remain visible',()=>{
  const r=tankCodeGuide({...TANK_DEFAULTS,service:'atmospheric',code:'api650',shape:'elliptical',pressure:200,efficiency:1.5,temperature:20,minTemperature:50});assert.ok(r.concerns.some(c=>/操作類別/.test(c)));assert.ok(r.concerns.some(c=>/附加要求/.test(c)));assert.equal(r.numericIssues.length,2);
});
test('fully recorded conditions never claim a completed ASME thickness calculation or certification',()=>{
  const p={...TANK_DEFAULTS,service:'pressure',code:'asme',edition:'2025 (contract)',jurisdiction:'Owner jurisdiction',medium:'water',material:'specified grade',pressure:500,vacuum:0,temperature:100,minTemperature:-10,liquidDensity:1000,corrosion:0,efficiency:1};const r=tankCodeGuide(p);assert.equal(r.recorded,true);assert.equal(r.missing.length,0);assert.match(r.status,/尚未完成/);assert.ok(r.checks.length>=5);
});
test('projects round-trip known fields, ignore extra keys and reject malformed or incompatible formats',()=>{
  const p={...TANK_DEFAULTS,shape:'elliptical',headWeight:120,edition:'contract edition'};assert.deepEqual(readTankProject(tankProject(p)),p);
  const edited=JSON.parse(tankProject(p));edited.input.extra='ignore';assert.equal(readTankProject(JSON.stringify(edited)).extra,undefined);
  for(const text of ['{}','bad',JSON.stringify({type:'special-method-tank',version:2,input:p}),tankProject({...p,height:-1}),tankProject({...p,medium:{bad:1}})])assert.throws(()=>readTankProject(text));
});
test('print and CSV retain gaps, procurement, uncertainties and escaped owner-entered text',()=>{
  const r=estimateTank({shape:'elliptical',service:'vacuum',medium:'<script>alert(1)</script>',material:'=HYPERLINK("bad")',headStraight:40,headGap:3,gap:2,trim:8});const html=tankWorkOrder(r),csv=tankCSV(r);
  assert.match(html,/桶槽估料單/);assert.match(html,/板厚尚待|板厚.*尚未|尚未完成/);assert.match(html,/原板排料示意/);assert.match(html,/40 \/ 3 mm/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>alert/);assert.match(csv,/'=HYPERLINK/);assert.ok(csv.startsWith('\ufeff'));
  assert.throws(()=>tankWorkOrder(estimateTank({height:0})));assert.throws(()=>tankCSV(estimateTank({height:0})));
});
test('imperial stock presets use exact international feet and do not mislabel metric custom stock',()=>{
  assert.deepEqual(TANK_STOCKS.map(s=>[s.stockWidth,s.stockLength]),[[1219.2,2438.4],[1524,3048],[1524,6096]]);
  assert.equal(stockPreset({stockWidth:1500,stockLength:6000}),undefined);
  assert.equal(stockPreset({stockWidth:'1524',stockLength:'6096'}).id,'5x20');
});
test('stock comparison preserves owner inputs and reports incomplete bottom procurement',()=>{
  const p={...TANK_DEFAULTS,gap:2,trim:7,endThickness:8},snapshot={...p},comparisons=compareTankStocks(p);assert.deepEqual(p,snapshot);
  assert.equal(comparisons[0].result.stockComplete,false);assert.equal(comparisons[0].result.parts[1].sheetIDs.length,0);
  for(const c of comparisons){assert.equal(c.result.valid,true);assert.equal(c.result.input.gap,2);assert.equal(c.result.input.trim,7);assert.equal(c.result.input.endThickness,8);verifyPacking(c.result);}
});
test('upright plates reduce rings but still close circumference and height with real gaps',()=>{
  const p={diameter:1000,height:2400,stockWidth:1524,stockLength:6096,gap:3,trim:5},r=estimateTank({...p,shellLayout:'upright'}),horizontal=estimateTank({...p,shellLayout:'around'});
  assert.equal(r.courses,1);assert.equal(r.panelsPerCourse,3);assert.equal(horizontal.courses,2);assert.equal(horizontal.panelsPerCourse,1);
  close(r.panelLength*3+9,Math.PI*1006);close(r.courseHeight,2400);assert.equal(r.horizontalSeams,0);close(r.weldLength,3*2400);verifyPacking(r);
  const boundary=estimateTank({height:2*(1524-10)+3,stockWidth:1524,stockLength:6096,gap:3});assert.equal(boundary.courses,2);close(boundary.courseHeight,1514);
});
test('all stock directions close and fit even with unequal thicknesses and rotation',()=>{
  for(const stock of TANK_STOCKS)for(const shellLayout of ['around','upright'])for(const shape of ['open','flat','elliptical']){const r=estimateTank({...stock,shape,shellLayout,diameter:900,height:3700,gap:2,trim:8,endThickness:8});assert.equal(r.valid,true);assert.equal(r.stockComplete,true);close(r.panelsPerCourse*(r.panelLength+2),r.circumference);close(r.courses*r.courseHeight+(r.courses-1)*2,r.bodyHeight);verifyPacking(r);}
});
test('course pieces retain unique source sheets, bottom-up elevations and half-pitch stagger',()=>{
  const r=estimateTank({diameter:1200,height:3400,stockWidth:1524,stockLength:3048,gap:3});assert.equal(r.courses,3);assert.equal(r.panelsPerCourse,2);assert.equal(r.assembly.length,6);
  assert.deepEqual(r.assembly.map(p=>[p.id,p.course,p.panel]),[['S1',1,1],['S2',1,2],['S3',2,1],['S4',2,2],['S5',3,1],['S6',3,2]]);
  for(const piece of r.assembly){close(piece.z,(piece.course-1)*(r.courseHeight+3));close(piece.angle,piece.course%2===0?90:0);const sheet=r.sheets.find(s=>s.id===piece.sheet);const item=sheet.placements.find(i=>i.part+i.piece===piece.id);close(piece.x,item.x);close(piece.y,item.y);assert.ok(piece.start>=0&&piece.start<r.circumference);}
  const aligned=estimateTank({...r.input,seamLayout:'aligned'});assert.ok(aligned.assembly.every(p=>p.offset===0));close(aligned.weldLength,r.weldLength);close(aligned.stockWeight,r.stockWeight);
  const one=estimateTank({stockLength:6096});close(one.assembly[1].angle,180);
});
test('allocated blank and offcut weight balance purchased stock, including circle envelope waste',()=>{
  for(const p of [{},{endThickness:8},{diameter:2500},{shape:'elliptical',headBlank:1600,stockWidth:1800},{shellLayout:'upright',stockWidth:1524,stockLength:6096}]){const r=estimateTank(p);assert.equal(r.valid,true);close(r.allocatedBlankWeight+r.offcutWeight,r.stockWeight);assert.ok(r.utilization>0&&r.utilization<=100);close(r.utilization,r.allocatedBlankWeight/r.stockWeight*100);if(r.stockComplete)close(r.blankWeight,r.allocatedBlankWeight);else assert.ok(r.blankWeight>r.allocatedBlankWeight);}
});
test('assembly wrap uses the same ID for boundary pieces and prints no interactive buttons',()=>{
  const r=estimateTank({stockWidth:1524,stockLength:3048}),svg=assemblySketch(r,{interactive:true,selected:'S3'}),print=assemblySketch(r);
  assert.equal((svg.match(/data-piece="S4"/g)||[]).length,2);assert.match(svg,/第 2 圈/);assert.match(svg,/#3/);assert.match(svg,/#efbd65/);assert.doesNotMatch(print,/data-piece=|tabindex=/);
});
test('new layouts persist in projects and appear with procurement comparisons and source mapping in exports',()=>{
  const p={...TANK_DEFAULTS,stockWidth:1524,stockLength:3048,shellLayout:'upright',seamLayout:'aligned'},r=estimateTank(p);assert.deepEqual(readTankProject(tankProject(p)),p);
  const old={...p};delete old.shellLayout;delete old.seamLayout;assert.equal(readTankProject(tankProject(old)).shellLayout,'around');assert.equal(readTankProject(tankProject(old)).seamLayout,'stagger');
  for(const bad of [{shellLayout:'bad'},{seamLayout:'bad'}])assert.equal(estimateTank(bad).valid,false);
  const html=tankWorkOrder(r),csv=tankCSV(r);assert.match(html,/板型與筒身組立/);assert.match(html,/5′ × 10′/);assert.match(html,/直立分片/);assert.match(html,/不完整/);assert.match(csv,/來源原板/);assert.match(csv,/餘料及切割損耗/);assert.match(csv,/筒身焊縫長 mm/);
});
