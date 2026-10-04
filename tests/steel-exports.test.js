import test from 'node:test';
import assert from 'node:assert/strict';
import {computeSteelJoint,computeSteelFaceStations} from '../dist/assets/steel-geometry.js';
import {DEFAULT_STEEL_PARAMS} from '../dist/assets/steel-sections.js';
import {steelStationCSV,steelTemplateLegend,steelPaperPositionRecipe,steelWorkOrderPagePlan,buildSteelWorkOrderHTML} from '../dist/assets/steel-exports.js';
import {emptyFabricationPlan} from '../dist/assets/fabrication-plan.js';

const params={...DEFAULT_STEEL_PARAMS,branchSection:'rhs',hostType:'straight',mainOD:324,mainWall:8,mainLength:1000,
  jointPosition:500,branchOD:60.3,branchWall:3.91,branchLength:200,angle:60,azimuth:25,offset:10,
  motherOpening:false,jointType:'on',rootGap:0,padEnabled:false,samples:72,tolerance:.1,autoPrecision:true};
const ready=()=>{const r=computeSteelJoint(params);assert.equal(r.valid,true,JSON.stringify(r.errors));assert.equal(r.manufacturingReady,true);return r;};
const faceTemplate=r=>r.templates.find(t=>t.mapping?.branchKind==='steel'&&t.mapping?.faceId);

test('steel records stop at invalid, imprecise, open-mother or phantom-hole results',()=>{
  const r=ready();
  for(const invalid of [{...r,valid:false},{...r,manufacturingReady:false},{...r,params:{...r.params,motherOpening:true}},
    {...r,verification:[{status:'fail'}]},{...r,params:{...r.params,tolerance:1e-6}},
    {...r,templates:r.templates.map(t=>t.id==='steel-mother-datum'?{...t,holes:[[[0,0],[1,0],[0,1]]]}:t)},
    {...r,geometry:{...r.geometry,main:{...r.geometry.main,outerHole3D:[[0,0,0],[1,0,0],[0,1,0]]}}}]){
    assert.throws(()=>steelStationCSV(invalid));assert.throws(()=>buildSteelWorkOrderHTML(invalid));assert.throws(()=>steelWorkOrderPagePlan(invalid));
  }
});

test('shared paper placement identifies the actual inner/outer face, physical span and common free end',()=>{
  const r=ready(),t=faceTemplate(r),text=steelPaperPositionRecipe(t);
  assert.match(text,/同一自由直端/);assert.ok(text.includes(t.mapping.faceId));assert.ok(text.includes(t.mapping.edgeStartId));assert.ok(text.includes(t.mapping.edgeEndId));
  assert.match(text,/母管保持封閉/);assert.match(steelTemplateLegend(t),/成品裁線.*母管不開孔/);
  assert.match(text,/u 在紙上從右往左增加/);assert.ok(text.includes(`右邊對 ${t.mapping.edgeStartId}`));assert.ok(text.includes(`左邊對 ${t.mapping.edgeEndId}`));
  assert.equal(steelPaperPositionRecipe({mapping:{coordinateSystem:'branch-outer-wrap'}}),null);
  assert.equal(steelTemplateLegend({mapping:{branchKind:'steel',motherOpening:false}}),null);
});

test('work order and plan reject mismatched per-face datums instead of re-zeroing each face',()=>{
  const r=ready(),templates=structuredClone(r.templates),t=templates.find(t=>t.mapping?.faceId);t.mapping.datumDepth+=1;
  assert.throws(()=>buildSteelWorkOrderHTML({...r,templates}),/同一自由直端與 D/);
});

test('A4/A3 work orders preserve legible four-face pages and complete station records',()=>{
  const r=ready(),count=(html,role)=>(html.match(new RegExp(`class="page steel-${role}"`,'g'))??[]).length;
  for(const paper of ['A4','A3']){
    const plan=steelWorkOrderPagePlan(r),html=buildSteelWorkOrderHTML(r,{id:'STEEL-PLAN'}, {paper});
    assert.equal(count(html,'overview'),1);assert.equal(count(html,'faces'),Math.ceil(r.geometry.steel.faces.length/4));
    assert.equal((html.match(/<section class="page /g)??[]).length,plan.totalPages);
    assert.equal((html.match(/data-face-station=/g)??[]).length,r.geometry.steel.faces.length*13);
    assert.match(html,paper==='A4'?/size:210mm 297mm/:/size:297mm 420mm/);
  }
  assert.throws(()=>buildSteelWorkOrderHTML(r,{}, {orientation:'landscape'}),/直式/);
  assert.throws(()=>steelStationCSV(r,{faceSegments:1}),/分段數/);
});

test('process notes retain supplied welding records without creating a rough cut or circular fit table',()=>{
  const r=ready(),f={...emptyFabricationPlan(),stock:2,wpsId:'WPS-S1',gapBasis:'O2 面沿面距離 20 mm，沿母面法線量測',weldNote:'先固定 O1，再固定 O3。'},html=buildSteelWorkOrderHTML(r,{},{fabrication:f});
  assert.match(html,/WPS-S1/);assert.match(html,/O2 面沿面距離 20 mm/);assert.match(html,/先固定 O1，再固定 O3/);
  assert.match(html,/只作工法記錄，不會改變各面成品裁線/);assert.doesNotMatch(html,/ROUGH_CUT|data-station-angle|360°|試配根隙 mm/);
});

test('metadata with many explicit newlines is continued on bounded pages and escaped',()=>{
  const r=ready(),note=Array.from({length:80},(_,i)=>`第 ${i+1} 行 <check>`).join('\n'),html=buildSteelWorkOrderHTML(r,{id:'S-1',notes:note});
  const bodies=[...html.matchAll(/<div class="steel-long-note">([\s\S]*?)<\/div>/g)].map(q=>q[1]);
  assert.ok(bodies.length>=3);assert.ok(bodies.every(q=>q.split('\n').length<=34));assert.ok(bodies.join('').includes('第 80 行 &lt;check&gt;'));assert.doesNotMatch(html,/<check>/);
});

test('overview uses real exterior placement and host-specific direction instead of a virtual centre plane',()=>{
  const r=ready(),html=buildSteelWorkOrderHTML(r),R=params.mainOD/2,
    entry=params.jointPosition+Math.sqrt(R*R-params.offset*params.offset)/Math.tan(params.angle*Math.PI/180),
    clock=(params.azimuth+Math.asin(params.offset/R)*180/Math.PI+360)%360,
    text=x=>Number(x.toFixed(3)).toString();
  assert.ok(html.includes(`軸線外壁定位：距主管基準端 X ${text(entry)} mm／方位 ${text(clock)}°`));
  assert.doesNotMatch(html,/距主管基準端 500 mm/);
  assert.match(html,/母材外表面法向 0 mm/);
  for(const hostType of ['cone','elbow']){
    const p={...params,hostType,mainEndOD:219.1,bendRadius:304.8,bendAngle:90,bendPosition:45,surfaceClock:20,branchSwivel:10,angle:90},joint=computeSteelJoint(p);
    assert.equal(joint.valid,true,JSON.stringify(joint.errors));
    const report=buildSteelWorkOrderHTML(joint),match=report.match(/<th>定位與方向<\/th><td>(.*?)<\/td>/);assert.ok(match);
    assert.match(match[1],/側轉 10°/);assert.match(match[1],/φ 20°/);assert.doesNotMatch(match[1],/偏心|距主管基準端/);
    if(hostType==='cone')assert.match(match[1],/母材 A 端軸距 X 500 mm/);
    else assert.match(match[1],/自行定位與定向/);
  }
});

test('mother location tables measure actual contact points on straight, elbow and cone instead of offset cut points',()=>{
  const f=x=>Number(x.toFixed(3)).toString(),wrap=a=>{a%=2*Math.PI;return a<0?a+2*Math.PI:a;};
  for(const hostType of ['straight','elbow','cone']){
    const p={...params,hostType,mainEndOD:219.1,bendRadius:304.8,bendAngle:90,bendPosition:45,surfaceClock:0,branchSwivel:0,rootGap:2,angle:90},r=computeSteelJoint(p);
    assert.equal(r.valid,true,JSON.stringify(r.errors));const html=buildSteelWorkOrderHTML(r),face=r.geometry.steel.faces.find(q=>q.role==='outer'),row=computeSteelFaceStations(r,face.id,4)[1],q=row.contactPoint,R=p.mainOD/2;
    let expected;
    if(hostType==='elbow'){
      const planar=Math.hypot(q[0],q[1]-p.bendRadius),beta=Math.atan2(q[0],p.bendRadius-q[1]),phi=Math.atan2(q[2],planar-p.bendRadius);
      assert.ok(Math.abs(Math.hypot(planar-p.bendRadius,q[2])-R)<1e-7);
      expected=[2,row.faceDistance,(p.bendRadius+R)*beta,(p.bendRadius-R)*beta,R*phi,phi*180/Math.PI];
      assert.match(html,/S背.*S腹.*母圈 U/);assert.match(html,/不能把環面參數圖當整片 1:1/);
    }else{
      const phi=wrap(Math.atan2(q[1],q[2])),k=(p.mainEndOD-p.mainOD)/(2*p.mainLength),radius=hostType==='cone'?R+k*q[0]:R;
      assert.ok(Math.abs(Math.hypot(q[1],q[2])-radius)<1e-7);
      expected=hostType==='cone'?[2,row.faceDistance,q[0],q[0]*Math.hypot(1,k),radius*phi,phi*180/Math.PI]:[2,row.faceDistance,q[0],R*phi,phi*180/Math.PI];
    }
    const match=html.match(new RegExp(`data-mother-face-station="${face.id}-1">([\\s\\S]*?)<\\/tr>`));assert.ok(match);
    assert.deepEqual([...match[1].matchAll(/<td>(.*?)<\/td>/g)].map(q=>q[1]),expected.map(f));
    assert.ok(Math.hypot(...row.point.map((x,i)=>x-q[i]))>1,'normal gap leaves a distinct branch cut');
    assert.equal(steelWorkOrderPagePlan(r).motherPages,Math.ceil(r.geometry.steel.faces.filter(f=>f.role==='outer').length/4));
  }
});
