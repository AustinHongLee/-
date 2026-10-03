import test from'node:test';import assert from'node:assert/strict';
import{computeElbowJoint,computeExactElbowHoleTable}from'../dist/assets/elbow-geometry.js';
import{buildElbowWorkOrderHTML,elbowLocatorSVG,elbowWorkOrderPageCount,elbowShortArcMeasurement}from'../dist/assets/elbow-field.js';
import{emptyFabricationPlan,geometryRecordKey}from'../dist/assets/fabrication-plan.js';
const params={mainOD:200,mainWall:6,branchOD:100,branchWall:4,branchLength:200,angle:90,surfaceClock:0,bendRadius:304.8,bendPosition:45,padEnabled:false,holeGap:0,samples:180,autoPrecision:true,tolerance:.1};
const result=computeElbowJoint(params);assert.ok(result.valid&&result.manufacturingReady,JSON.stringify(result.errors));
const pages=html=>(html.match(/<section class="page"/g)||[]).length;
test('default two physical A4 pages have exact branch and mother duties',()=>{
  const html=buildElbowWorkOrderHTML(result,{id:'E-001',revision:'3'});assert.equal(pages(html),2);assert.equal(elbowWorkOrderPageCount(result),2);
  assert.match(html,/@page\{size:A4 portrait;margin:0\}/);assert.match(html,/width:210mm;height:297mm/);assert.match(html,/data-role="branch"/);assert.match(html,/data-role="mother"/);
  assert.match(html,/D=200 mm/);assert.match(html,/定位索引圖不是整片 1:1 展開/);assert.match(html,/12|360/);assert.match(html,/3D 密採偏差估計/);
  
});
test('outer-back field numbers agree with independent circle section values',()=>{
  const R=304.8,r=100,b=46,beta0=Math.PI/4,rows=computeExactElbowHoleTable(result,24),theta0=rows[0],theta90=rows[6];
  const beta=beta0-Math.asin(b/(R+r));assert.ok(Math.abs(theta0.rearDistance-(R+r)*beta)<1e-7);assert.ok(Math.abs(theta0.bellyDistance-(R-r)*beta)<1e-7);assert.equal(theta0.circumference,0);
  assert.ok(Math.abs(theta90.circumference-r*Math.asin(b/r))<1e-7);
  const svg=elbowLocatorSVG(result,rows);assert.match(svg,new RegExp('data-s="'+Number(((R+r)*beta).toFixed(8))+'"'));assert.match(svg,/viewBox="0 0 720 270"/);
});
test('cross-section view from A to B labels plus90 left and270 right',()=>{
  const svg=elbowLocatorSVG(result),left=svg.match(/<text x="([\d.]+)"[^>]*>90° \+Z<\/text>/),right=svg.match(/<text x="([\d.]+)"[^>]*>270° −Z<\/text>/);assert.ok(left&&right);assert.ok(Number(left[1])<594&&Number(right[1])>594);assert.match(svg,/逆時針/);
});
test('short arc at phi270 measures right one quarter circle and cardinal labels are explicit',()=>{
  const C=Math.PI*result.params.mainOD,quarter=elbowShortArcMeasurement(result,{phiRad:3*Math.PI/2});assert.equal(quarter.direction,'right');assert.ok(Math.abs(quarter.distance-C/4)<1e-10);assert.match(quarter.label,/^右 /);
  assert.equal(elbowShortArcMeasurement(result,{phiRad:0}).label,'外背0');assert.equal(elbowShortArcMeasurement(result,{phiRad:2*Math.PI}).label,'外背0');assert.match(elbowShortArcMeasurement(result,{phiRad:Math.PI}).label,/^左\/右 /);
  const html=buildElbowWorkOrderHTML(result);assert.match(html,/<th>省力量法 mm<\/th>/);assert.match(html,/U 從外背逆時針量/);assert.match(html,/省力欄沿左／右短弧定位同點/);
});
test('short arcs at arbitrary normalized angles identify the same physical cross-section point',()=>{
  const r=result.params.mainOD/2,beta=.31,Rc=result.params.bendRadius;
  const point=phi=>[(Rc+r*Math.cos(phi))*Math.sin(beta),Rc-(Rc+r*Math.cos(phi))*Math.cos(beta),r*Math.sin(phi)];
  for(let i=0;i<=123;i++){const phi=-4*Math.PI+i*.17123,short=elbowShortArcMeasurement(result,{phiRad:phi}),walk=short.direction==='right'?-short.distance/r:short.distance/r,a=point(phi),b=point(walk);assert.ok(Math.hypot(...a.map((v,j)=>v-b[j]))<1e-9);assert.ok(short.distance<=Math.PI*r+1e-9);}
});
test('validation is an additional page, with sampled limits and physical units',()=>{
  const html=buildElbowWorkOrderHTML(result,{}, {includeValidation:true});assert.equal(pages(html),3);assert.equal(elbowWorkOrderPageCount(result,{includeValidation:true}),3);assert.match(html,/data-role="validation"/);assert.match(html,/不是連續全域嚴格/);assert.match(html,/外背法線解析排除再入壁/);assert.match(html,/以距離單調性解析/);
});
test('generic joint validation retains the finite probe method label',()=>{
  const r=computeElbowJoint({...params,surfaceClock:90,samples:36,tolerance:1});assert.ok(r.manufacturingReady);
  const html=buildElbowWorkOrderHTML(r,{}, {includeValidation:true});assert.match(html,/完成有限探查/);assert.doesNotMatch(html,/外背法線解析排除再入壁/);
});
test('stock-only process records stay printed without claiming a rough-cut envelope',()=>{
  const html=buildElbowWorkOrderHTML(result,{}, {fabrication:{...emptyFabricationPlan(),stock:3}});assert.equal(pages(html),3);assert.match(html,/使用者沿軸留料 3 mm/);assert.match(html,/不生成彎頭全壁厚粗切包絡/);assert.doesNotMatch(html,/粗切深度/);
});
test('mother paper identifies outside mouth and rejects a normal through-cut reading',()=>{
 const html=buildElbowWorkOrderHTML(result);assert.match(html,/表列外壁孔口/);assert.match(html,/內緣與壁厚配合 3D/);assert.match(html,/不能沿外壁法線直接割穿當貫穿刀路/);
});
test('24 measured process points paginate and preserve stock and estimated errors',()=>{
 const f={...emptyFabricationPlan(),count:24,stock:2,markError:.7,cutError:1.2,preGaps:Array(24).fill(null),postGaps:Array(24).fill(null)};
 const html=buildElbowWorkOrderHTML(result,{}, {fabrication:f});assert.equal(pages(html),4);assert.equal((html.match(/data-role="process"/g)||[]).length,2);assert.match(html,/預估標線偏差 ±0.7 mm/);assert.match(html,/預估切磨偏差 ±1.2 mm/);assert.match(html,/<td>345<\/td>/);
});
test('short weld and disposition notes stay on the last process page',()=>{
  const f={...emptyFabricationPlan(),stock:2,weldNote:'沿對稱點固順序施作。',disposition:'孔內緣依 3D 修磨後重新試配。',inspectionKey:geometryRecordKey(result.params)};
  const html=buildElbowWorkOrderHTML(result,{}, {fabrication:f});assert.equal(pages(html),3);assert.doesNotMatch(html,/data-role="process-notes"/);assert.match(html,/沿對稱點固順序施作。/);assert.match(html,/孔內緣依 3D 修磨後重新試配。/);
});
test('150 explicit note lines remain complete across bounded text pages',()=>{
  const text=Array.from({length:150},(_,i)=>`${i%10}\n`).join(''),f={...emptyFabricationPlan(),stock:2,weldNote:text};
  const html=buildElbowWorkOrderHTML(result,{}, {fabrication:f}),contents=Array.from(html.matchAll(/data-role="process-notes"[\s\S]*?<div class="long-note">([\s\S]*?)<\/div>/g),m=>m[1]);assert.ok(contents.length>=5);assert.equal(contents.join(''),'焊道／點固順序：'+text);assert.ok(contents.every(s=>s.split('\n').length<=34));
});
test('saved optional metadata is escaped, printed completely, and safely paginated',()=>{
 const meta={id:'E-024',revision:'4',title:'<script>TITLE</script>',name:'孔位名称',project:'PX-241',projectName:'現場專案',preparedBy:'張師傅',company:'測試公司',date:'2026-10-04',createdAt:'2026-10-01',updatedAt:'2026-10-03',notes:('備註<&>\n').repeat(160)};
 const html=buildElbowWorkOrderHTML(result,meta);assert.ok(pages(html)>3);assert.equal(pages(html),elbowWorkOrderPageCount(result,{metadata:meta}));assert.match(html,/&lt;script&gt;TITLE/);assert.doesNotMatch(html,/<script>/);for(const value of ['孔位名称','PX-241','現場專案','張師傅','測試公司','2026-10-04','2026-10-01','2026-10-03'])assert.match(html,new RegExp(value));assert.equal((html.match(/備註&lt;&amp;&gt;/g)||[]).length,160);
});
test('WPS/fit statuses keep measured limits separate and paginate long notes safely',()=>{
  const f={...emptyFabricationPlan(),wpsId:'<script>alert(1)</script>',gapBasis:'沿軸量接頭根隙',gapMin:1,gapMax:3,edgeCondition:'checked',preGaps:[2,4,null,2],postGaps:[2,2,2,2],inspectionKey:geometryRecordKey(result.params),weldNote:'<img src=x onerror=alert(1)>'.repeat(15),disposition:'需修磨。'.repeat(100)};
  const html=buildElbowWorkOrderHTML(result,{id:'E<svg onload=1>',revision:'<b>1</b>'},{fabrication:f,includeValidation:true});assert.equal(pages(html),elbowWorkOrderPageCount(result,{fabrication:f,includeValidation:true}));assert.ok(pages(html)>3);assert.doesNotMatch(html,/<script|<img|<svg onload|<b>1/);assert.match(html,/&lt;script&gt;/);assert.match(html,/超過填入上限/);assert.match(html,/在填入範圍內/);assert.match(html,/process-notes/);
});
test('stale fit measurements do not appear on current geometry',()=>{
  const f={...emptyFabricationPlan(),wpsId:'W-1',gapBasis:'field',gapMin:1,gapMax:3,preGaps:[9999.777,9999.777,9999.777,9999.777],inspectionKey:'different-joint'};
  const html=buildElbowWorkOrderHTML(result,{}, {fabrication:f});assert.match(html,/已清除舊實測值/);assert.doesNotMatch(html,/<td>9999\.777<\/td>/);
});
test('changing only the elbow bend radius invalidates earlier fit records',()=>{
  const changed=computeElbowJoint({...params,bendRadius:406.4});assert.ok(changed.valid&&changed.manufacturingReady);
  const f={...emptyFabricationPlan(),wpsId:'W-1',gapBasis:'field',gapMin:1,gapMax:3,preGaps:[9998.777,9998.777,9998.777,9998.777],inspectionKey:geometryRecordKey(result.params)};
  const html=buildElbowWorkOrderHTML(changed,{}, {fabrication:f});assert.match(html,/已清除舊實測值/);assert.doesNotMatch(html,/<td>9998\.777<\/td>/);
});
test('manual precision failure is prevented from becoming a fabrication workorder',()=>{
  const r=computeElbowJoint({...params,samples:36,autoPrecision:false,tolerance:.0001});assert.ok(r.valid);assert.equal(r.manufacturingReady,false);assert.throws(()=>buildElbowWorkOrderHTML(r),/必須達標/);
});
test('invalid fabrication instructions and inconsistent locator rows are rejected',()=>{
  assert.throws(()=>buildElbowWorkOrderHTML(result,{}, {fabrication:{...emptyFabricationPlan(),gapMin:3,gapMax:1}}),/下限/);
  assert.throws(()=>elbowLocatorSVG(result,[{rearDistance:NaN},{},{}]),/不完整/);
});
