import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateTank} from '../dist/assets/tank-materials.js';
import {TANK_DEFAULTS} from '../dist/assets/tank-geometry.js';
import {methodDefaults} from '../dist/assets/tank-method-config.js';
import {shellConstructionPlan,normalizeShellRecords} from '../dist/assets/tank-shell-plan.js';
import {shellStepSketch,shellIsoSketch,shellSeamMap} from '../dist/assets/tank-shell-visuals.js';
import {shellWorkOrder,shellDrawingSheet} from '../dist/assets/tank-shell-report.js';
import {tankProject,readTankProject} from '../dist/assets/tank-exports.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const input=(extra={})=>({...TANK_DEFAULTS,shape:'open',solve:'volume',diameter:1100,height:2300,stockWidth:1219.2,stockLength:2438.4,material:'SUS304',density:7930,...extra});

test('shell process preserves the raw/finished distinction and actual stock placement',()=>{
  const r=estimateTank(input()),m=shellConstructionPlan(r,'S3');assert.equal(m.piece.id,'S3');assert.equal(m.stock.id,m.piece.sheet);
  near(m.finished.width+2*m.reserve.circumferential,m.part.width);near(m.finished.height+2*m.reserve.axial,m.part.height);
  near(m.arcAngle*r.circumference/360,m.piece.length);assert.match(m.steps[2].lead,/本片成形圓心角/);
  assert.equal(m.stock.x,m.piece.x);assert.equal(m.stock.y,m.piece.y);assert.equal(m.steps.length,5);
  assert.equal(m.steps[0].id,'layout');assert.ok(m.steps[1].actions.some(a=>a.includes('不可再從成品尺寸扣一次')));
});
test('no-prebend leaves both flat ends in the raw blank until forming, and warns for zero allowance',()=>{
  const methods=methodDefaults();methods.rolling.preBend='no';methods.rolling.flatEnd=80;
  const m=shellConstructionPlan(estimateTank(input({methods})));assert.equal(m.preBend,false);near(m.reserve.circumferential,85);
  near(m.part.width-m.finished.width,170);assert.match(m.steps[2].title,/切端/);assert.match(shellStepSketch(m,'roll'),/每端直邊 80/);
  methods.rolling.flatEnd=0;assert.ok(shellConstructionPlan(estimateTank(input({methods}))).warnings.some(w=>/直邊留長為 0/.test(w)));
});
test('shell weld IDs join the preceding panel, close each course, and total exactly the estimated shell weld length',()=>{
  for(const gap of [0,3])for(const seamLayout of ['stagger','aligned']){
    const r=estimateTank(input({gap,seamLayout})),m=shellConstructionPlan(r,'S3'),L=m.welds.filter(w=>w.kind==='longitudinal'),C=m.welds.filter(w=>w.kind==='circumferential');
    assert.equal(L.length,r.verticalSeams);assert.equal(C.length,r.horizontalSeams);assert.equal(new Set(m.welds.map(w=>w.id)).size,m.welds.length);
    near(m.welds.reduce((s,w)=>s+w.length,0),r.weldLength);
    for(const w of L){const b=r.assembly.find(p=>p.id===w.b),a=r.assembly.find(p=>p.id===w.a);assert.equal(a.course,b.course);assert.equal(a.panel,b.panel===1?r.panelsPerCourse:b.panel-1);near((w.angle* r.circumference/360+gap/2+r.circumference)%r.circumference,b.start);}
    for(const w of C)near(w.z,w.course*(r.courseHeight+gap)-gap/2);
  }
});
test('single-piece course identifies its own closing seam and horizontal datum is A-to-B',()=>{
  const r=estimateTank(input({shape:'custom',orientation:'horizontal',top:'elliptical',bottom:'elliptical',diameter:650,height:1100,stockWidth:1524,stockLength:6096})),m=shellConstructionPlan(r);
  assert.equal(r.panelsPerCourse,1);assert.equal(m.welds[0].self,true);assert.equal(m.datum,'A 端筒身板邊');assert.match(m.steps[3].actions[0],/A 端.*B 端/);
  near(m.template.sagitta,m.template.radius-Math.sqrt(m.template.radius**2-m.template.chord**2/4));
});
test('mismatched geometry gap and groove root gap stay explicit; missing WPS is never a pass',()=>{
  const r=estimateTank(input()),m=shellConstructionPlan(r);assert.ok(m.warnings.some(w=>/兩者不同/.test(w)));assert.equal(m.pending.length,4);
  const m2=shellConstructionPlan(estimateTank(input({gap:2})));assert.ok(!m2.warnings.some(w=>/兩者不同/.test(w)));
  assert.match(m.steps[4].actions[0],/WPS：待填/);assert.match(m.steps[4].actions[1],/不自動指定/);
});
test('rotated pieces keep board coordinates independent of their construction axes',()=>{
  const r=estimateTank(input({shellLayout:'upright'})),m=shellConstructionPlan(r);const b=r.assembly.find(b=>b.rotated);
  assert.ok(b,'fixture must exercise stock rotation');const x=shellConstructionPlan(r,b.id);assert.equal(x.stock.rotated,true);near(x.stock.w,x.part.height);near(x.stock.h,x.part.width);
  near(m.finished.width,m.piece.length);near(m.finished.height,m.piece.height);
});
test('v7 round-trip persists construction records; old project versions have empty records',()=>{
  const records={version:1,project:'TK-101',drawing:'D-001 Rev.A',wps:'WPS-2 Rev.1',tack:'依工序卡',sequence:'見接合圖',acceptance:'ITP-01'};
  const json=tankProject(input({shellConstruction:records}));assert.equal(JSON.parse(json).version,9);assert.deepEqual(readTankProject(json).shellConstruction,records);
  for(const version of [1,5,6]){const p=input();delete p.shellConstruction;assert.equal(readTankProject(JSON.stringify({type:'special-method-tank',version,input:p})).shellConstruction.wps,'');}
  assert.ok(normalizeShellRecords({wps:'a'.repeat(501)}).issues.length);assert.throws(()=>readTankProject(tankProject(input({shellConstruction:[]}))),/施工記錄格式/);
});
test('standalone shell order has all five diagrams, full piece/weld tables, and escapes manual records',()=>{
  const r=estimateTank(input({shellConstruction:{project:'<script>alert(1)</script>',wps:'<b>x</b>'}})),m=shellConstructionPlan(r,'S3'),html=shellWorkOrder(r,'S3'),drawing=shellDrawingSheet(r,'S3');
  assert.match(html,/&lt;script&gt;/);assert.ok(!html.includes('<script>alert(1)</script>'));assert.match(html,/&lt;b&gt;x&lt;\/b&gt;/);
  for(const s of m.steps)assert.ok(html.includes(escTitle(s.title)));
  for(const p of r.assembly)assert.match(html,new RegExp('<td>'+p.id+'</td>'));
  for(const w of m.welds)assert.match(html,new RegExp('<td>'+w.id+'</td>'));
  assert.match(drawing,/width="420mm"/);assert.match(drawing,/height="297mm"/);assert.match(drawing,/草稿／未審核/);
  for(const step of m.steps)assert.ok(!/NaN|undefined|Infinity/.test(shellStepSketch(m,step.id)));
  assert.ok(!/NaN|undefined|Infinity/.test(shellIsoSketch(m)+shellSeamMap(m)));
});
const escTitle=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
test('invalid geometry cannot leak the previous construction sheet',()=>{const r=estimateTank(input({diameter:-1}));assert.equal(shellConstructionPlan(r),null);assert.throws(()=>shellWorkOrder(r),/修正桶槽尺寸/);});
test('machine width uses the raw axial dimension, including trim',()=>{
  const methods=methodDefaults();methods.rolling.machineWidth=1155;methods.rolling.machineThickness=5;methods.rolling.machineMinDiameter=1200;
  const m=shellConstructionPlan(estimateTank(input({methods})));near(m.part.finishedHeight,1150);near(m.part.height,1160);
  for(const pattern of [/有效寬度/,/板厚能力/,/最小捲徑/])assert.ok(m.warnings.some(w=>pattern.test(w)));
});
test('large shell maps retain the selected high course and flag omitted courses',()=>{
  const r=estimateTank(input({diameter:3500,height:20000})),selected=r.assembly.at(-1).id,m=shellConstructionPlan(r,selected),map=shellSeamMap(m,{interactive:true});
  assert.ok(r.courses>5);assert.ok(map.includes('data-shell-piece="'+selected+'"'));assert.match(map,/節錄第/);
  const iso=shellIsoSketch(m);assert.ok(!/NaN|Infinity/.test(iso));assert.ok((iso.match(/<path/g)||[]).length>r.assembly.length);
});
test('missing stock and oversized or malformed manual references stay explicit',()=>{
  const r=estimateTank(input());r.sheets=[];const m=shellConstructionPlan(r);assert.equal(m.stock,null);assert.ok(m.warnings.some(w=>/尚未排入原板/.test(w)));
  assert.equal(normalizeShellRecords({project:'名'.repeat(101)}).issues.length,1);assert.equal(normalizeShellRecords({version:2}).issues.length,1);
  assert.throws(()=>shellWorkOrder(estimateTank(input({shellConstruction:{wps:17}}))),/WPS/);
});
test('shell order stays separate from optional quote errors and includes all long notes',()=>{
  const note=('施工記錄\n').repeat(70),r=estimateTank(input({shellConstruction:{tack:note,sequence:note,acceptance:note}}));r.stockPlan.purchaseIssues=[{message:'報價錯誤'}];
  const html=shellWorkOrder(r);assert.match(html,/筒身施工加工單/);assert.ok(html.includes(note.trim().replace(/\s+/g,' ')));
  assert.ok(!html.includes('採購比價'));assert.match(html,/實測／異常/);
});
