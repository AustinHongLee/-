import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONICAL_PARAMS,computeConicalJoint,computeExactConicalStationTable,computeExactConicalLocatorTable,conicalSurfacePoint,conicalDevelopmentPoint,conicalDevelopmentToWorld,conicalLineIntersections} from '../dist/assets/conical-geometry.js';
import {createMainOpeningPatch,createBranchCuttingWrap,paperPatternPlan,buildFieldWorkOrderHTML,buildReportHTML,reportPagePlan,projectJSON,readProjectJSON,templateDXF} from '../dist/assets/exports.js';
const norm=v=>Math.hypot(...v),sub=(a,b)=>a.map((v,i)=>v-b[i]),add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,k)=>a.map(v=>v*k),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),distance=(a,b)=>norm(sub(a,b));
const near=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);
const p0={...DEFAULT_CONICAL_PARAMS};
const config=p=>{const R0=p.mainOD/2,k=(p.mainEndOD-p.mainOD)/(2*p.mainLength),s=Math.hypot(1,k);return {R0,k,s};};
function signed(point,p,offset=0){const {R0,k,s}=config(p);return (Math.hypot(point[1],point[2])-R0-k*point[0])/s-offset;}
// Independent geometric signed-distance scan + bisection. No production
// quadratic coefficients, roots or near-root selector are used by this oracle.
function oracleRay(foot,d,p,offset){let previous=-2500,old=signed(add(foot,mul(d,previous)),p,offset);const answers=[];for(let t=previous+2;t<=2500;t+=2){const f=signed(add(foot,mul(d,t)),p,offset);if((old<0&&f>=0)||(old<=0&&f>0)||(old>0&&f<=0)){let lo=previous,hi=t,flo=old;for(let i=0;i<65;i++){const m=(lo+hi)/2,fm=signed(add(foot,mul(d,m)),p,offset);if(flo*fm<=0)hi=m;else{lo=m;flo=fm;}}const root=(lo+hi)/2;const eps=.00001,slope=(signed(add(foot,mul(d,root+eps)),p,offset)-signed(add(foot,mul(d,root-eps)),p,offset))/(2*eps);if(slope>0&&!answers.some(v=>Math.abs(v-root)<1e-7))answers.push(root);}previous=t;old=f;}assert.equal(answers.length,1,'one outward-facing cone crossing expected');return answers[0];}

test('oblique fishmouth cuts match independent signed-distance bisection on normal-thickness outer/inner cones',()=>{
  for(const fixture of [{angle:65,surfaceClock:37,branchSwivel:20,jointType:'on',rootGap:1.2},{angle:112,surfaceClock:221,branchSwivel:-18,jointType:'in',projection:16},{mainOD:219.1,mainEndOD:323.9,angle:72,surfaceClock:110,branchSwivel:9,jointType:'in',projection:8}]){
    const r=computeConicalJoint({...fixture,samples:72}),p=r.params;assert.equal(r.valid,true,JSON.stringify(r.errors));const a=r.geometry.axes,rows=computeExactConicalStationTable(r,12),ro=p.branchOD/2,ri=ro-p.branchWall,offset=p.jointType==='in'?-p.mainWall:p.rootGap;
    for(const row of rows.slice(0,-1)){const theta=row.angle*Math.PI/180;for(const [radius,point,depth] of [[ro,row.outerPoint,row.outerDepth],[ri,row.innerPoint,row.innerDepth]]){const foot=add(a.branchOrigin,mul(add(mul(a.stationZero,Math.cos(theta)),mul(a.station90,Math.sin(theta))),radius)),t=oracleRay(foot,a.branchDirection,p,offset)-(p.jointType==='in'?p.projection:0);near(r.geometry.branch.axisEnd-depth,t,1e-7);assert.ok(distance(add(foot,mul(a.branchDirection,t)),point)<1e-7);}}}
});

test('normal wall and root gap are physical shortest distances, not radial reductions',()=>{
  const r=computeConicalJoint({rootGap:2.5,mainOD:500,mainEndOD:180,mainLength:350,branchOD:40,branchWall:3}),p=r.params;assert.equal(r.valid,true,JSON.stringify(r.errors));const {s}=config(p);
  near(r.geometry.conical.outerRadii[0]-r.geometry.conical.innerRadii[0],p.mainWall*s);assert.ok(Math.abs(p.mainWall*s-p.mainWall)>.1);
  for(const q of r.geometry.branch.outerCut)near(signed(q,p),2.5);for(const q of r.geometry.conical.innerHole3D)near(signed(q,p),-p.mainWall);
});

test('cone development preserves local first fundamental form and closes exact end circumferences',()=>{
  for(const p of [p0,{...p0,mainOD:219.1,mainEndOD:323.9,surfaceClock:133}]){const {R0,k,s}=config(p);for(const x of [0,70,240,p.mainLength])for(const phi of [-.4,.4,2]){const dx=.0001,dt=.000001,q=conicalSurfacePoint(x,phi,p),u=conicalDevelopmentPoint(q,p);near(distance(u,conicalDevelopmentPoint(conicalSurfacePoint(x+dx,phi,p),p))/dx,s,2e-7);near(distance(u,conicalDevelopmentPoint(conicalSurfacePoint(x,phi+dt,p),p))/dt,R0+k*x,1e-5);assert.ok(distance(conicalDevelopmentToWorld(u,p),q)<1e-7);}
    const r=computeConicalJoint(p),mapping=r.geometry.conical.mapping;for(const [radius,rho] of [[p.mainOD/2,mapping.slantRadii[0]],[p.mainEndOD/2,mapping.slantRadii[1]]])near(rho*mapping.sectorAngle,2*Math.PI*radius);near(Math.abs(mapping.slantRadii[1]-mapping.slantRadii[0]),p.mainLength*s);}
});

test('sealed outside support has a contact footprint and no imaginary hole/template cut',()=>{
  const r=computeConicalJoint({motherOpening:false,holeGap:200});assert.equal(r.valid,true,JSON.stringify(r.errors));assert.deepEqual(r.geometry.conical.outerHole3D,[]);assert.deepEqual(r.geometry.conical.innerHole3D,[]);assert.equal(r.measurements.mainHoleToolDiameter,null);assert.equal(r.templates.find(t=>t.id==='main').holes.length,0);assert.ok(r.geometry.conical.outerContact3D.length>36);const rows=computeExactConicalLocatorTable(r);assert.ok(rows.every(q=>q.basis==='attachment-outer-footprint-not-cut'));assert.ok(r.templates.find(t=>t.id==='main').notes.some(x=>x.includes('禁止')));
  const open=computeConicalJoint({motherOpening:true,holeGap:200});assert.equal(open.valid,false,'huge actual hole must be rejected, unlike unused closed-mother holeGap');
});

test('projection is limited by opposite inner wall, with the finite stop measured from near inner face',()=>{
  const r=computeConicalJoint({jointType:'in',projection:10,samples:72});assert.equal(r.valid,true,JSON.stringify(r.errors));const p=r.params,a=r.geometry.axes,{R0,k,s}=config(p),available=r.measurements.projectionAvailable;assert.ok(available>200&&available<300);
  const rejected=computeConicalJoint({...p,projection:available+.01});assert.equal(rejected.valid,false);assert.ok(rejected.errors.some(e=>e.message.includes('內插')));
  // Dense independent point check across the actual retained annular wall.
  for(let j=0;j<=8;j++){const radius=p.branchOD/2-p.branchWall+p.branchWall*j/8;for(let i=0;i<128;i++){const theta=2*Math.PI*i/128,foot=add(a.branchOrigin,mul(add(mul(a.stationZero,Math.cos(theta)),mul(a.station90,Math.sin(theta))),radius)),inner=oracleRay(foot,a.branchDirection,p,-p.mainWall),outer=oracleRay(foot,a.branchDirection,p,0);for(let t=inner-10;t<=r.geometry.branch.axisEnd;t+=5){const q=add(foot,mul(a.branchDirection,t));if(q[0]<0||q[0]>p.mainLength)continue;const rad=Math.hypot(q[1],q[2]),R=R0+k*q[0];if(rad>=R-p.mainWall*s+1e-7&&rad<=R-1e-7)assert.ok(t>=inner-1e-7&&t<=outer+1e-7);}}}
});

test('cuts that would cross either mother end are rejected, even if the axis surface point is inside',()=>{
  for(const x of [.1,p0.mainLength-.1]){const r=computeConicalJoint({jointPosition:x,samples:37,autoPrecision:false});assert.equal(r.valid,false);assert.ok(r.errors.some(e=>e.message.includes('端面')));}
});

test('axis-parallel insertion stops at a real opening end before a remote infinite-cone root',()=>{
  const fixture={mainOD:323.9,mainEndOD:219.1,mainLength:350,jointPosition:175,branchOD:30,branchWall:2,jointType:'in',angle:12,projection:5,samples:72};const r=computeConicalJoint(fixture);assert.equal(r.valid,true,JSON.stringify(r.errors));assert.ok(r.measurements.projectionAvailable<300);const bad=computeConicalJoint({...fixture,projection:400});assert.equal(bad.valid,false);assert.ok(bad.errors.some(e=>e.message.includes('端面')||e.message.includes('伸入')));
});

test('precision gate grows sampling and fails safely when printing tolerance exceeds the cap',()=>{
  const r=computeConicalJoint({samples:36,tolerance:.001});assert.equal(r.manufacturingReady,true,JSON.stringify(r.errors));assert.ok(r.precision.effectiveSamples>36);assert.ok(r.precision.maxChordError<=.001);
  const tooTight=computeConicalJoint({samples:36,tolerance:1e-10});assert.equal(tooTight.valid,false);assert.deepEqual(tooTight.templates,[]);assert.equal(tooTight.precision.effectiveSamples,4096);
});

test('same diameter, tip cone, too-thick small end, inward direction and unsupported pad cannot produce reports',()=>{
  for(const raw of [{mainEndOD:p0.mainOD},{mainEndOD:0},{mainEndOD:10},{branchSwivel:110},{padEnabled:true},{jointType:'in',motherOpening:false},{motherOpening:'false'}]){const r=computeConicalJoint(raw);assert.equal(r.valid,false,JSON.stringify(raw));assert.deepEqual(r.templates,[]);assert.equal(r.manufacturingReady,false);}
});

test('rotating the side rotates real cuts and preserves the fabrication station dimensions',()=>{
  const a=computeConicalJoint({surfaceClock:0,angle:73}),b=computeConicalJoint({surfaceClock:90,angle:73});assert.equal(a.valid,true);assert.equal(b.valid,true);const ta=computeExactConicalStationTable(a),tb=computeExactConicalStationTable(b);for(let i=0;i<ta.length;i++){near(ta[i].outerDepth,tb[i].outerDepth);assert.ok(distance([ta[i].outerPoint[0],ta[i].outerPoint[2],-ta[i].outerPoint[1]],tb[i].outerPoint)<1e-7);}
});

test('exact requested station tables use actual angles, close at circumference and independently locate the mother',()=>{
  const r=computeConicalJoint({angle:75,surfaceClock:42,branchSwivel:12});assert.equal(r.valid,true);const station=computeExactConicalStationTable(r,7),locator=computeExactConicalLocatorTable(r,19);assert.equal(station.length,8);near(station.at(-1).circumference,Math.PI*r.params.branchOD);assert.ok(distance(station[0].outerPoint,station.at(-1).outerPoint)<1e-8);assert.equal(locator.length,20);for(const row of locator){near(signed(row.point,r.params),0);const d=sub(row.point,r.geometry.axes.branchOrigin),axial=dot(d,r.geometry.axes.branchDirection);near(norm(sub(d,mul(r.geometry.axes.branchDirection,axial))),r.geometry.main.holeToolRadius);}
});

test('quadratic routine excludes the negative sheet and returns distances satisfying cone geometry',()=>{
  const p={...p0,mainOD:400,mainEndOD:100,mainLength:300},roots=conicalLineIntersections([150,0,0],[0,0,1],p);assert.equal(roots.length,2);near(roots[0].t,-125);near(roots[1].t,125);const x=1000,remote=conicalLineIntersections([x,0,0],[0,0,1],p);assert.equal(remote.length,0,'radius beyond the cone apex is invalid even if squared equation roots exist');
});

test('local mother paper preserves the isometric hole with a rigid crop translation and real surface datums',()=>{
  for(const motherOpening of [true,false]){const r=computeConicalJoint({motherOpening,angle:73,surfaceClock:42}),source=r.templates.find(t=>t.id==='main'),patch=createMainOpeningPatch(r),rows=patch.mapping.positioning;
    assert.ok(patch.width<200&&patch.height<200,'small branch mother patch should fit one A4');assert.equal(patch.mapping.hostType,'cone');assert.equal(patch.holes.length,motherOpening?1:0);
    if(motherOpening)for(let i=0;i<source.holes[0].length;i++)assert.ok(distance(add(source.holes[0][i],source.mapping.origin),add(patch.holes[0][i],patch.mapping.origin))<1e-7);
    for(const q of Object.values(rows)){const world=conicalDevelopmentToWorld(add(q.paper,patch.mapping.origin),r.params);near(q.x,world[0]);near(q.slant,world[0]*r.geometry.conical.s);near(q.arc,Math.hypot(world[1],world[2])*q.phiDegrees*Math.PI/180);}
    const plan=paperPatternPlan(r,{parts:['main-local']});assert.equal(plan.paperPages,1);const dxf=templateDXF(patch);assert.ok(dxf.includes('PAPER_BOUNDARY'));if(!motherOpening)assert.equal(dxf.split('CUT_HOLE').length,2,'closed paper includes CUT_HOLE only in layer definition, never an actual entity');
  }
});

test('cone export stations cannot fall back to straight cylinder depth equations',()=>{
  const r=computeConicalJoint({angle:67,surfaceClock:39,branchSwivel:13,samples:37,autoPrecision:false,tolerance:1}),wrap=createBranchCuttingWrap(r,{stationCount:12,datumStep:1}),exact=computeExactConicalStationTable(r,12);assert.equal(r.manufacturingReady,true);
  for(let i=0;i<exact.length;i++)near(wrap.mapping.stations[i].outerDepth,exact[i].outerDepth);assert.ok(wrap.notes.some(q=>q.includes('當地母線')));assert.equal(paperPatternPlan(r,{parts:['branch-local','main-local']}).paperPages,2);
});

test('field document separates true fishmouth dimensions from mother X/S/phi/local-U and marks closed mother unambiguously',()=>{
  const r=computeConicalJoint(),field=buildFieldWorkOrderHTML(r),report=buildReportHTML(r);assert.equal((field.match(/<section class="page"/g)||[]).length,2);assert.equal((report.match(/<section class="page"/g)||[]).length,reportPagePlan(r).totalPages);assert.ok(field.includes('24')||field.includes('360°'));assert.ok(field.includes('X 軸距'));assert.ok(field.includes('S 母線'));assert.ok(field.includes('當圈 U'));assert.ok(field.includes('真實法向厚度'));assert.ok(!field.includes('外貼徑向間隙'));
  const closed=buildFieldWorkOrderHTML(computeConicalJoint({motherOpening:false}));assert.ok(closed.includes('禁止開孔'));assert.ok(closed.includes('外焊支撐'));assert.ok(!closed.includes('下表為母材外壁孔口'));
});

test('project save/load keeps both end diameters and cone-specific frame values without silently becoming straight',()=>{
  const r=computeConicalJoint({mainOD:500,mainEndOD:250,angle:71,surfaceClock:42,branchSwivel:17,jointType:'in',projection:15}),saved=readProjectJSON(projectJSON(r.params)),loaded=computeConicalJoint(saved.params);assert.equal(saved.params.hostType,'cone');assert.equal(saved.params.mainEndOD,250);assert.equal(loaded.valid,true,JSON.stringify(loaded.errors));for(const key of ['mainOD','mainEndOD','surfaceClock','branchSwivel','projection','motherOpening'])assert.equal(loaded.params[key],r.params[key]);near(loaded.measurements.branchMaxLength,r.measurements.branchMaxLength);
});
