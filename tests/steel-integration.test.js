import test from 'node:test';
import assert from 'node:assert/strict';
import {computeJoint,DEFAULT_PARAMS} from '../dist/assets/joint-model.js';
import {computeSteelFaceStations} from '../dist/assets/steel-geometry.js';
import {createSteelSection,sectionPointAt} from '../dist/assets/steel-sections.js';
import {endSectionProjection,endOffsetLayout,endAlignmentMarkup,offsetAction,retreatAction} from '../dist/assets/end-alignment-ui.js';
import {projectJSON,readProjectJSON,paperPatternPlan,buildPaperPatternHTML,templateSVG,templateDXF,stationCSV,buildFieldWorkOrderHTML,buildReportHTML,reportPagePlan,paperPositionRecipe} from '../dist/assets/exports.js';
import {isSteelJoint,steelStationCSV,steelWorkOrderPagePlan,buildSteelWorkOrderHTML} from '../dist/assets/steel-exports.js';
import {geometryRecordKey,emptyFabricationPlan,reconcileFitRecords} from '../dist/assets/fabrication-plan.js';

const base={...DEFAULT_PARAMS,branchSection:'rhs',hostType:'straight',motherOpening:false,jointType:'on',padEnabled:false,
  mainOD:324,mainWall:8,mainLength:1000,jointPosition:500,branchLength:200,angle:90,offset:0,azimuth:0,
  rootGap:0,sectionWidth:60,sectionHeight:80,sectionWall:4,sectionWeb:6,sectionFlange:8,sectionRadius:0,sectionRotation:25,sectionSlope:0};
const kinds=['chs','shs','rhs','h','i','l','c'];
const valid=p=>{const r=computeJoint(p);assert.equal(r.valid,true,JSON.stringify(r.errors));assert.equal(r.manufacturingReady,true);return r;};
const near=(a,b,eps=1e-7)=>assert.ok(Math.abs(a-b)<=eps,`${a} != ${b}`);

test('all supported steel profiles dispatch to closed steel geometry while legacy pipe remains unchanged',()=>{
  for(const branchSection of kinds){const r=valid({...base,branchSection});assert.ok(r.geometry.steel);assert.equal(isSteelJoint(r),true);assert.equal(r.params.motherOpening,false);assert.equal(r.params.jointType,'on');assert.deepEqual(r.geometry.main.outerHole3D,[]);}
  const legacy={...DEFAULT_PARAMS,padEnabled:false};delete legacy.branchSection;
  const r=valid(legacy);assert.equal(r.geometry.steel,undefined);assert.equal(isSteelJoint(r),false);
});

test('steel dimensions, radii and rotation save/load exactly and preserve face identity and cut coordinates',()=>{
  for(const branchSection of kinds){
    const first=valid({...base,branchSection,sectionRadius:branchSection==='chs'?0:3}),saved=readProjectJSON(projectJSON(first.params,{id:'STEEL-01'})),again=valid(saved.params);
    assert.equal(saved.params.branchSection,branchSection);assert.equal(saved.params.sectionRotation,25);assert.equal(saved.params.sectionRadius,first.params.sectionRadius);
    assert.deepEqual(again.geometry.steel.faces.map(f=>[f.id,f.cut3D]),first.geometry.steel.faces.map(f=>[f.id,f.cut3D]));
  }
});

test('all 1:1 paper selections are material faces with physical face width and common absolute datum',()=>{
  for(const branchSection of kinds){
    const r=valid({...base,branchSection}),faces=r.geometry.steel.faces,plan=paperPatternPlan(r,{paper:'A4',orientation:'portrait'});
    assert.equal(plan.parts.length,faces.length);assert.equal(new Set(plan.parts.map(p=>p.partID)).size,faces.length);
    const datums=new Set(plan.parts.map(p=>p.template.mapping.datumDepth));assert.equal(datums.size,1);
    for(const part of plan.parts){
      assert.match(part.partID,/^steel-face-/);const t=part.template,f=faces.find(f=>f.id===t.mapping.faceId);assert.ok(f);
      near(t.mapping.faceWidth,f.width??f.length);assert.equal(t.mapping.freeEndDepth,0);assert.equal(t.mapping.motherOpening,false);assert.equal(t.holes.length,0);
      const cut=t.references.find(q=>q.type==='cut-line');assert.ok(cut);
      assert.equal(t.mapping.paperTransform,'steel-face-mirror-x');assert.equal(t.mapping.paperLeftEdge,f.edgeEndId);assert.equal(t.mapping.paperRightEdge,f.edgeStartId);
      for(let i=0;i<f.stations.length;i++){near(cut.points[i][0],t.mapping.faceWidth-f.stations[i].faceDistance);near(cut.points[i][1]+t.mapping.depthOrigin,f.stations[i].depth);}
      for(const point of cut.points)assert.ok(part.tiles.some(tile=>point[0]>=tile.x-1e-7&&point[0]<=tile.x+tile.width+1e-7&&point[1]>=tile.y-1e-7&&point[1]<=tile.y+tile.height+1e-7));
      const svg=templateSVG(t),dxf=templateDXF(t).split('2\r\nENTITIES\r\n')[1];
      assert.match(svg,/width="[\d.]+mm" height="[\d.]+mm"/);assert.match(svg,/母管不開孔/);assert.doesNotMatch(svg,/360°|ANGLE_MARK|CUT_HOLE/);
      assert.match(dxf,/8\r\nCUT_FISHMOUTH\r\n/);assert.doesNotMatch(dxf,/8\r\nCUT_HOLE\r\n/);
      const recipe=paperPositionRecipe(t);assert.ok(recipe.includes(t.mapping.faceId));assert.ok(recipe.includes(t.mapping.edgeStartId));assert.match(recipe,/同一自由直端/);
    }
    const html=buildPaperPatternHTML(r,{}, {paper:'A4',orientation:'portrait'});
    assert.equal((html.match(/data-scale="1mm-per-svg-unit"/g)??[]).length,plan.paperPages);
    assert.doesNotMatch(html,/360°|圓周角度|主管只切孔口/);
  }
});

test('CSV and reports use face distances and the shared free-end depth instead of circular stations',()=>{
  const r=valid({...base,branchSection:'l'}),csv=stationCSV(r);
  assert.equal(csv.charCodeAt(0),0xFEFF);assert.equal(csv,steelStationCSV(r));assert.match(csv,/面號.*沿面距離.*自由直端起算深度/);assert.doesNotMatch(csv,/圓周角度|circumference/);
  for(const f of r.geometry.steel.faces){const q=computeSteelFaceStations(r,f.id,12)[4];assert.ok(csv.includes(`"${Number(q.faceDistance.toFixed(6))}","${Number(q.depth.toFixed(6))}"`));}
  const work=buildFieldWorkOrderHTML(r,{id:'STEEL-02'}),full=buildReportHTML(r,{id:'STEEL-02'}),plan=reportPagePlan(r),count=html=>(html.match(/<section class="page /g)??[]).length;
  assert.match(work,/母管不開孔/);assert.match(work,/共用自由直端/);assert.doesNotMatch(work,/360°|主管孔口每側|ANGLE_MARK/);
  assert.equal(count(full),plan.totalPages);assert.equal(count(work),steelWorkOrderPagePlan(r,{metadata:{id:'STEEL-02'}}).totalPages);
});

test('steel metadata stays escaped, large face tables continue without losing their absolute depth',()=>{
  const r=valid(base),meta={id:'</h1><script>bad()</script>',notes:'<img src=x onerror=bad()>'},html=buildSteelWorkOrderHTML(r,meta,{faceSegments:36});
  assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('&lt;img'));assert.doesNotMatch(html,/<script>|<img src/);
  assert.equal((html.match(/data-face-station=/g)??[]).length,r.geometry.steel.faces.length*37);
  assert.match(html,/（續）/);assert.doesNotMatch(html,/360°/);
});

test('old measured values are cleared when steel rotation or physical profile changes',()=>{
  const r=valid(base),f={...emptyFabricationPlan(),preGaps:[1,1,1,1],postGaps:[1,1,1,1],inspectionKey:geometryRecordKey(r.params)};
  for(const change of [{sectionRotation:26},{sectionWidth:61},{branchSection:'h'},{sectionRadius:3}]){
    const p={...r.params,...change};assert.notEqual(geometryRecordKey(p),geometryRecordKey(r.params));const result=reconcileFitRecords(f,p);assert.equal(result.cleared,true);assert.ok(result.plan.preGaps.every(x=>x===null));
  }
});

test('A/B steel port diagrams project the actual rotated concave or hollow profile, with correct edge support',()=>{
  for(const branchSection of ['shs','rhs','h','i','l','c'])for(const end of ['A','B']){
    const p={...base,hostType:'elbow',branchSection,elbowAlignment:`${end.toLowerCase()}-edge`,elbowOffset:3,elbowSideOffset:4},shape=createSteelSection(p),projection=endSectionProjection(p,end),l=endOffsetLayout(p,end);
    assert.ok(shape.valid);assert.ok(projection);assert.equal(projection.boundaries.length,shape.boundaries.length);
    const a=25*Math.PI/180,c=Math.cos(a),s=Math.sin(a),sign=end==='A'?1:-1;
    shape.boundaries.forEach((b,i)=>{const q=sectionPointAt(b.segments[0],0),expected=[sign*(q[0]*c-q[1]*s),q[0]*s+q[1]*c];near(projection.boundaries[i].points[0][0],expected[0]);near(projection.boundaries[i].points[0][1],expected[1]);});
    const support=Math.max(...projection.boundaries[0].points.map(([u,v])=>.6*u+.8*v));near(l.edgeDistance+support,p.mainOD/2);
    const markup=endAlignmentMarkup(p,end);assert.match(markup,/data-end-branch-section/);assert.doesNotMatch(markup,/data-end-branch-circle|藍圈：支管/);assert.match(markup,/依實際截面/);
    const move=offsetAction(p,end,l.cx+30,l.cy-20);assert.ok(move);const retreat=retreatAction(p,end,5);near(Math.hypot(retreat.elbowOffset,retreat.elbowSideOffset),l.offsetDistance-5);
  }
});

test('steel diagram ignores stale round-pipe OD and rejects an impossible projected support rather than shrinking it',()=>{
  const p={...base,hostType:'elbow',branchSection:'rhs',elbowAlignment:'a-edge',elbowOffset:1,elbowSideOffset:0};
  const a=endOffsetLayout({...p,branchOD:20},'A'),b=endOffsetLayout({...p,branchOD:1000},'A');near(a.outward,b.outward);near(a.scale,b.scale);
  assert.equal(endOffsetLayout({...p,sectionWidth:400},'A'),null);
  assert.equal(endOffsetLayout({...p,sectionSlope:1},'A'),null);
});
