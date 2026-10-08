import test from 'node:test';
import assert from 'node:assert/strict';
import {churchillFriction,bendLossK,weldBeadK,spaldingUPlus,wallVelocityRatio,standardWall,beadLimit,normalizeMedium,analyzeMedium,routeFlow,compareFlow,planFlowLine,mediumSummary,suggestedFlow,DEFAULT_MEDIUM} from '../dist/assets/offset-flow.js';
import {flowRouteSVG,weldSectionSVG} from '../dist/assets/offset-flow-visuals.js';
import {buildOwnerSheet,ownerConclusion,beadSensitivity} from '../dist/assets/offset-flow-report.js';
import {compareRoutePlans} from '../dist/assets/offset-planner.js';
import {DEFAULT_OFFSET} from '../dist/assets/offset-geometry.js';
import {offsetProjectJSON,readOffsetProject} from '../dist/assets/offset-exports.js';

const rel=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(b)),`${a} ≠ ${b}`);
const plans=compareRoutePlans({basis:'ports',layout:'rolling',run:800,roll:0,rise:500,planMaxJoints:8}).plans;
const original=plans[0],half=plans.find(p=>p.halfCuts===2&&p.jointCount===5&&p.elements[0].type==='pipe'),square=plans.find(p=>p.jointCount===5&&p.elbows.every(e=>e.kind==='factory')&&p.elements[0].type==='pipe');
const water={kind:'water',flow:59.1,density:998,viscosity:1},viscous={kind:'viscous',flow:14.8,density:1100,viscosity:1000},pellets={kind:'pellets',pellet:4};

// Reference values: fluids 1.3.1 (Churchill_1977, bend_rounded method='Rennels'), computed independently in Python.
test('friction factor and bend loss match the independent fluids implementation',()=>{
  for(const [Re,e,f] of [[100,1e-3,0.6400000000000001],[1500,4e-4,0.04266666852029734],[3000,4e-4,0.04326843450760723],[2e5,4.4e-4,0.018611608697734594],[1e6,1e-5,0.011858160518513692],[1e8,1e-3,0.01963296934826636]])rel(churchillFriction(Re,e),f);
  for(const [a,rd,f,K] of [[90,1.5,0.0185,0.22970079073205402],[45,1.5,0.0185,0.15855990762122674],[35.44,1.49,0.0185,0.13735347422611544],[90,1,0.02,0.34040415208162156],[30,5,0.015,0.10045703532890754],[90,1.5,0.64,5.570909168528143]])rel(bendLossK(a,rd,f),K);
  rel(churchillFriction(2,0),32);assert.ok(Number.isFinite(churchillFriction(1e9,0)));
});
test('weld bead: zero when flush, Idelchik sharp-edged ring orifice otherwise, plus laminar narrowing',()=>{
  assert.equal(weldBeadK(0,0.1,1e5,0.01),0);
  // Idelchik diagram 4-14 (Modelica.Fluid sharpEdgedOrifice): ζ = [(1−f)+0.707(1−f)^0.375]²/f², pipe-velocity based.
  const D=0.10226,h=0.0016,f=((D-2*h)/D)**2,orifice=((1-f)+0.707*(1-f)**0.375)**2/f**2;
  rel(weldBeadK(h,D,2e5,0.0078),orifice);rel(orifice,0.11,0.05);
  rel(weldBeadK(h,D,100,0.0078),orifice+64/100*(0.0078/D)*((D/(D-2*h))**4-1));
  assert.ok(weldBeadK(0.003,D,2e5,0.012)>weldBeadK(0.001,D,2e5,0.006));
});
test('near-wall velocity: Poiseuille in laminar flow, Spalding wall law in turbulent flow',()=>{
  for(const yPlus of [1,30,150,1000]){const u=spaldingUPlus(yPlus),k=0.41,e=Math.exp(-k*5);rel(u+e*(Math.exp(k*u)-1-k*u-(k*u)**2/2-(k*u)**3/6),yPlus,1e-9);}
  rel(spaldingUPlus(1000),Math.log(1000)/0.41+5,1e-3);
  rel(wallVelocityRatio(0.05,0.1,100,0.64),2);rel(wallVelocityRatio(0.0016,0.1,100,0.64),2*(2*0.032-0.032**2));
  const turbulent=wallVelocityRatio(0.0016,0.10226,2.04e5,0.0186);assert.ok(turbulent>0.75&&turbulent<0.9,String(turbulent));assert.equal(wallVelocityRatio(0,0.1,1e5,0.02),0);
});
test('standard wall and ASME B31.3 bead limits',()=>{
  assert.equal(standardWall(114.3),6.02);assert.equal(standardWall(323.8),9.53);assert.equal(standardWall(21.3),2.77);assert.equal(standardWall(115),null);
  assert.deepEqual([6,6.02,6.35,13,13.1,25,30].map(beadLimit),[1.5,3,3,3,4,4,5]);assert.ok(Number.isNaN(beadLimit(NaN)));assert.ok(Number.isNaN(beadLimit(0)));
  assert.equal(suggestedFlow('water',102.26),44);assert.equal(suggestedFlow('viscous',102.26),15);assert.equal(suggestedFlow('pellets',102.26),null);
});
test('medium input is normalized and validated with actionable messages',()=>{
  assert.deepEqual(normalizeMedium({kind:'lava',flow:'10',wall:-1,finish:'polished',extra:1}),{...DEFAULT_MEDIUM,wall:-1});
  assert.equal(analyzeMedium({kind:'none'},114.3).valid,false);
  assert.deepEqual(analyzeMedium({kind:'water'},114.3).errors.map(e=>e.field),['flow']);
  assert.deepEqual(analyzeMedium({kind:'water',flow:10},115).errors.map(e=>e.field),['wall']);
  assert.ok(analyzeMedium({kind:'water',flow:10,wall:6},115).valid);
  assert.deepEqual(analyzeMedium({kind:'pellets',pellet:0.1},114.3).errors.map(e=>e.field),['pellet']);
  assert.deepEqual(analyzeMedium({kind:'water',flow:10,bead:30},114.3).errors.map(e=>e.field),['bead']);
  assert.ok(analyzeMedium({kind:'water',flow:0.5},13.7).valid,'NPS 1/4: the default 1.5 mm limit bead is accepted');
});
test('liquid analysis: velocity, regime, per-weld loss and warnings',()=>{
  const ctx=analyzeMedium(water,114.3);
  assert.equal(ctx.valid,true);assert.equal(ctx.wall,6.02);assert.equal(ctx.bead,3);assert.equal(ctx.codeBead,true);rel(ctx.idMm,102.26);
  rel(ctx.velocity,1.998865268703517,1e-12);rel(ctx.Re,203995.15445286638,1e-12);rel(ctx.f,0.018576708840236305,1e-12);rel(ctx.weldK,0.23217675995534548,1e-12);
  assert.equal(ctx.regime,'turbulent');assert.deepEqual(ctx.warnings.map(w=>[w.level,w.field]),[['info','bead']]);
  assert.deepEqual(analyzeMedium({...water,bead:1},114.3).warnings,[]);
  assert.match(analyzeMedium({...water,flow:120},114.3).warnings.find(w=>w.level==='warn').message,/流速 4\.06 m\/s/);
  const thick=analyzeMedium(viscous,114.3);assert.equal(thick.regime,'laminar');assert.match(thick.warnings.find(w=>w.level==='warn').message,/^黏稠液體在這個流速為層流/);
  assert.match(analyzeMedium({...water,flow:0.01},114.3).warnings.find(w=>w.level==='warn').message,/^水類液體在這個流速為層流/);
  const ground=analyzeMedium({...viscous,finish:'ground'},114.3);assert.equal(ground.weldK,0);assert.deepEqual(ground.warnings.map(w=>w.level),['info']);assert.ok(ground.asWeldedK>0);
  const pel=analyzeMedium(pellets,114.3);assert.equal(pel.liquid,false);rel(pel.pelletRatio,0.75);assert.match(pel.warnings.find(w=>w.level==='warn').message,/約粒徑的 75%/);
  assert.deepEqual(analyzeMedium({...pellets,finish:'ground'},114.3).warnings.map(w=>w.level),['info','info']);
  assert.equal(analyzeMedium({...pellets,bead:0.2},114.3).warnings.filter(w=>w.level==='warn').length,0,'a bead under 10% of the pellet is not flagged');
  assert.equal(mediumSummary(ctx),'水類液體 · 59.1 m³/h · 2 m/s · 紊流');
});
test('route pressure loss matches an independent Python recomputation of the same routes',()=>{
  // fluids 1.3.1: ΔP = (f·L/D + Σ Rennels bends + n·weld)·ρV²/2 for the straight lengths, bends and welds of each route.
  // Default bead = ASME B31.3 SI-column limit for a 6.02 mm wall (3 mm); weld = Idelchik sharp-edged ring orifice.
  for(const [medium,expected] of [[water,[[277.0656805929779,549.3905055598347,1851.596397641347],[273.30566818736213,635.7987264015201,2314.4954970516837],[250.05259052506892,921.8117627264462,2314.4954970516837]]],
    [viscous,[[1171.786031862134,1818.6730354699027,148.1023599244401],[1155.8839179406286,2054.151830911138,185.1279499055501],[1057.5403354941668,2725.6095866727355,185.1279499055501]]]]){
    const ctx=analyzeMedium(medium,114.3);
    [original,half,square].forEach((p,i)=>{const f=routeFlow(p,ctx);rel(f.dp.pipe,expected[i][0],1e-9);rel(f.dp.bends,expected[i][1],1e-9);rel(f.dp.welds,expected[i][2],1e-9);rel(f.dp.total,expected[i].reduce((s,v)=>s+v,0),1e-9);});
  }
});
test('comparison: welds add little, turning angle adds most, and the card line says so in kPa and metres',()=>{
  const ctx=analyzeMedium(water,114.3),base=routeFlow(original,ctx),alt=routeFlow(half,ctx),d=compareFlow(base,alt,ctx);
  assert.equal(d.welds,1);rel(d.turn,90-original.elbows.reduce((s,e)=>s+e.angle,0));
  rel(d.dp.welds,ctx.weldK*ctx.q);rel(d.dp.total,d.dp.welds+d.dp.bends+d.dp.pipe);
  assert.equal(planFlowLine(alt,base,ctx),'壓損 3.22 kPa · 比原接法 +0.55 kPa（≈ 多 1.5 m 直管）');
  assert.equal(planFlowLine(base,base,ctx),'壓損 2.68 kPa（比較基準）');
  const slow=analyzeMedium({...water,flow:5,bead:1},114.3),sb=routeFlow(original,slow),sa=routeFlow(half,slow);
  assert.match(planFlowLine(sa,sb,slow),/^壓損 \d+ Pa · 比原接法 \+\d+(\.\d)? Pa（≈ 多 0\.\d m 直管）$/,'small values switch to Pa instead of printing 0 kPa');
  const pel=analyzeMedium(pellets,114.3),pb=routeFlow(original,pel),pa=routeFlow(square,pel);
  assert.equal(pa.totalTurn,180);assert.equal(pa.exposedWelds,5);assert.equal(planFlowLine(pa,pb,pel),'總轉角 180°（原接法 70.9°） · 5 道焊口的內凸會被粒子撞上');
  const flat=analyzeMedium({...pellets,bead:0},114.3);assert.equal(planFlowLine(routeFlow(square,flat),routeFlow(original,flat),flat),'總轉角 180°（原接法 70.9°） · 焊口與管壁齊平');
  assert.equal(routeFlow(original,analyzeMedium({...pellets,finish:'ground'},114.3)).exposedWelds,0);
  const legacy={valid:true,legacy:true,jointCount:2,elements:[{type:'elbow',angle:45,radius:152.4},{type:'pipe',length:500},{type:'elbow',angle:45,radius:152.4}]};
  assert.equal(routeFlow(legacy,ctx).welds,2);assert.equal(flowRouteSVG(legacy,routeFlow(legacy,ctx),ctx),'');
});
test('pictures: route marks bends and risky welds; weld section is true scale with unique ids',()=>{
  const ctx=analyzeMedium(viscous,114.3),svg=flowRouteSVG(half,routeFlow(half,ctx),ctx,{title:'建議方案'});
  assert.match(svg,/^<svg/);assert.equal((svg.match(/<circle[^>]*r="5.5" fill="#d0812f"/g)??[]).length,5);assert.match(svg,/45°/);
  const calm=flowRouteSVG(half,routeFlow(half,analyzeMedium(water,114.3)),analyzeMedium(water,114.3));assert.equal((calm.match(/<circle[^>]*r="5.5" fill="#d0812f"/g)??[]).length,0);
  const a=weldSectionSVG(ctx),b=weldSectionSVG(analyzeMedium(pellets,114.3));
  assert.match(a,/原焊 · 內凸 3 mm/);assert.match(a,/兩側角落流速很慢/);assert.match(b,/撞上焊道/);assert.match(a,/內徑 102.3 mm/);
  assert.notEqual(a.match(/id="steel-(\d+)"/)[1],b.match(/id="steel-(\d+)"/)[1]);
  assert.equal(weldSectionSVG(analyzeMedium({kind:'none'},114.3)),'');
});
test('owner sheet: conclusion, both routes, true-scale section, quality checks and basis, for each medium',()=>{
  for(const medium of [water,viscous,pellets]){
    const ctx=analyzeMedium(medium,114.3),html=buildOwnerSheet({base:original,plan:half,ctx,id:'OFF-9',date:new Date(2026,9,8)});
    const c=ownerConclusion(routeFlow(original,ctx),routeFlow(half,ctx),ctx);
    assert.ok(html.includes(c.headline));assert.equal((html.match(/<svg/g)??[]).length,3);assert.match(html,/焊口剖面（按真實比例）/);assert.match(html,/OFF-9 · .* · 2026-10-08/);
    assert.match(html,/☐ 可及的焊口內面磨平；磨不到的焊口（封閉焊口、接既有管）以氬焊（GTAW）打底控制內凸/);assert.match(html,/☐ 內凸任何情況不超過 3 mm（ASME B31.3 表 341.3.2）/);assert.match(html,/計算依據/);assert.equal(html.includes('Churchill'),ctx.liquid);
  }
  const ctx=analyzeMedium(water,114.3);
  assert.equal(ownerConclusion(routeFlow(original,ctx),routeFlow(half,ctx),ctx).headline,'建議方案多 1 道焊口，壓損多 0.55 kPa（約 5.6 cm 水柱），相當於多 1.5 m 直管。');
  assert.equal(beadSensitivity(ctx),'每道焊口換算直管（保守）：內凸 3 mm ≈ 1.28 m · 內凸 1 mm ≈ 0.37 m · 平順 0 m');
  assert.equal(beadSensitivity(analyzeMedium(pellets,114.3)),'焊道內凸與粒子：3 mm＝粒徑的 75% · 1 mm＝粒徑的 25% · 平順＝不會撞上');
  assert.equal((buildOwnerSheet({plan:half,ctx}).match(/<svg/g)??[]).length,2);
  assert.throws(()=>buildOwnerSheet({base:original,plan:null,ctx}),/先選一個接法/);
  assert.throws(()=>buildOwnerSheet({base:original,plan:half,ctx:analyzeMedium({kind:'water'},114.3)}),/請填流量/);
});
test('project file carries the medium; older files and readers are unaffected',()=>{
  const params={...DEFAULT_OFFSET,basis:'ports',solve:'run',layout:'rolling',run:800},saved=JSON.parse(offsetProjectJSON(params,'OFF-1',{...viscous,finish:'ground'}));
  assert.equal(saved.version,5);assert.equal(saved.medium.kind,'viscous');assert.equal(saved.medium.finish,'ground');
  assert.deepEqual(readOffsetProject(JSON.stringify(saved)).medium,normalizeMedium({...viscous,finish:'ground'}));
  assert.equal(JSON.parse(offsetProjectJSON(params,'OFF-1',{kind:'none'})).medium,undefined);
  assert.equal(readOffsetProject(offsetProjectJSON(params,'OFF-1')).medium,null);
  assert.equal(readOffsetProject(JSON.stringify({...saved,medium:{kind:'lava'}})).medium.kind,'none');
});
