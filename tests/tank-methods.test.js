import test from 'node:test';
import assert from 'node:assert/strict';
import {TANK_DEFAULTS} from '../dist/assets/tank-geometry.js';
import {estimateTank} from '../dist/assets/tank-materials.js';
import {grooveFor,filletArea,apiSpots,pwhtHoldHours,pwhtRates,ellipsePerimeter,volumeAtLevel,levelForVolume} from '../dist/assets/tank-process.js';
import {G,NAMEPLATE,GROUNDING_LUG,sectionOffset,sectionArea} from '../dist/assets/tank-attachments.js';
import {methodCatalog} from '../dist/assets/tank-methods.js';
import {methodPages,methodCSVRows,cardVisual,cardTables} from '../dist/assets/tank-method-report.js';
import {METHOD_SPECS,fieldActive,methodContext,pwhtRequired,normalizeMethods} from '../dist/assets/tank-method-config.js';
import {tankProject,readTankProject,tankCSV,tankWorkOrder} from '../dist/assets/tank-exports.js';
import {NOZZLE_DEFAULTS} from '../dist/assets/tank-nozzles.js';
const near=(a,b,tol,msg='')=>assert.ok(Math.abs(a-b)<=tol,`${msg} ${a} vs ${b} (tol ${tol})`);
const rel=(a,b,r=1e-9,msg='')=>near(a,b,Math.abs(b)*r+1e-9,msg);
const M=TANK_DEFAULTS.methods;
const methods=extra=>{const out=structuredClone(M);for(const [k,v] of Object.entries(extra??{}))out[k]=Array.isArray(v)?v:{...M[k],...v};return out;};
const tank=(values={},extra)=>estimateTank({...TANK_DEFAULTS,...values,methods:methods(extra)});
const rho=7850,kg=(area,t)=>area*t*rho/1e9;

test('groove cross-sections: I, single V and X areas match trapezoid + parabolic cap geometry',()=>{
  const w={rootGap:2,rootFace:2,bevelAngle:60,cap:1.5,squareMax:6,vMax:20},tan30=Math.tan(Math.PI/6),cap=width=>2/3*width*1.5;
  rel(grooveFor(6,w).area,6*2+2*cap(2+3),1e-12,'I');
  // Single V, t = 12: root gap rectangle + two bevel triangles (depth 10) + face and root reinforcement.
  const depth=10,top=2+2*depth*tan30;rel(grooveFor(12,w).area,12*2+2*(depth*depth*tan30/2)+cap(top+3)+cap(2+3),1e-12,'V');
  // X, t = 40: two bevel depths of 19 mm, reinforcement on both faces.
  const d=19,topX=2+2*d*tan30;rel(grooveFor(40,w).area,40*2+4*(d*d*tan30/2)+2*cap(topX+3),1e-12,'X');
  assert.equal(grooveFor(6,w).type,'I');assert.equal(grooveFor(20,w).type,'V');assert.equal(grooveFor(21,w).type,'X');
  rel(filletArea(10),1.1*50,1e-12,'fillet with 10% convexity');
});
test('API 650 spot counts: first 3 m, then one per interval plus a major remaining fraction',()=>{
  assert.equal(apiSpots(0,30000),0);assert.equal(apiSpots(2500,30000),1);assert.equal(apiSpots(33000,30000),2);
  assert.equal(apiSpots(50000,30000),3);assert.equal(apiSpots(46000,30000),2);assert.equal(apiSpots(63000,60000),2);
});
test('PWHT holding time and UCS-56 rates follow the inch rules, with the 15-minute minimum and 56 °C/h floor',()=>{
  rel(pwhtHoldHours(25.4),1);rel(pwhtHoldHours(12.7),.5);rel(pwhtHoldHours(5),.25);rel(pwhtHoldHours(50.8),2);rel(pwhtHoldHours(76.2),2.25);rel(pwhtHoldHours(127),2.75);
  assert.deepEqual(pwhtRates(12.7),{heat:222,cool:278});
  const r2=pwhtRates(50.8);rel(r2.heat,111);rel(r2.cool,139);
  assert.deepEqual(pwhtRates(152.4),{heat:56,cool:56});
});
test('PWHT decision: P-No.1 thresholds, preheat exemption, API 650 opening assemblies, stainless and other materials',()=>{
  const plan=(t,code,heat)=>tank({shellThickness:t,endThickness:t,code},{heat}).process.heat;
  assert.equal(plan(32,'asme',{}).need,false);assert.equal(plan(35,'asme',{}).need,true);assert.equal(plan(35,'asme',{preheat:95}).need,false);
  assert.equal(plan(39,'asme',{preheat:200}).need,true);assert.equal(plan(39,'asme',{material:'ss'}).need,false);assert.equal(plan(39,'asme',{material:'other'}).need,null);
  // Required but switched off is flagged; switched on without requirement still plans the cycle.
  assert.ok(plan(40,'asme',{pwht:'no'}).warnings.some(w=>/需 PWHT/.test(w)));
  const forced=plan(10,'asme',{pwht:'yes'});assert.equal(forced.perform,true);rel(forced.cycle.holdHours,10/25.4);
  // API 650: no whole-tank PWHT; NPS 12+ openings in plates over 25 mm are listed.
  const nozzle={...NOZZLE_DEFAULTS,id:'N1',name:'大開孔',od:323.8,thickness:9.53,height:800,angle:0,projection:250,flangeOD:485,end:'bare'};
  const api=estimateTank({...TANK_DEFAULTS,diameter:6000,height:6000,shellThickness:26,code:'api650',nozzles:[nozzle],methods:methods()});
  assert.equal(api.process.heat.need,false);assert.deepEqual(api.process.heat.openings,['N1']);
});
test('heat-treatment inputs appear exactly when the plan performs PWHT (one shared rule)',()=>{
  for(const [t,heat] of [[10,{}],[40,{}],[35,{preheat:100}],[10,{pwht:'yes'}],[40,{pwht:'no'}],[40,{material:'other'}]]){
    const r=tank({shellThickness:t,endThickness:t,code:'asme'},{heat}),ctx=methodContext(r);
    assert.equal(fieldActive(METHOD_SPECS.heat.fields.method,r.methods.heat,ctx),r.process.heat.perform,JSON.stringify(heat));
    assert.equal(pwhtRequired(r.methods.heat,ctx),r.process.heat.need);
  }
});
test('PWHT cycle: ramp and cooling times from the rate limits; furnace fit, sectional heats and local soak band',()=>{
  const r=tank({orientation:'horizontal',shape:'custom',top:'elliptical',bottom:'elliptical',shellThickness:40,endThickness:40,code:'asme'},{heat:{furnaceLength:1800,furnaceWidth:2000,furnaceHeight:2000,method:'sections'},supports:{type:'saddles'}});
  const h=r.process.heat,c=h.cycle,rates=pwhtRates(40);
  rel(c.upHours,(595-425)/rates.heat);rel(c.downHours,(595-425)/rates.cool);rel(c.controlled,c.upHours+c.holdHours+c.downHours);
  assert.equal(h.furnace.heats,Math.ceil((h.size.length-1500)/(1800-1500)));
  const local=tank({shellThickness:40,endThickness:40,code:'asme'},{heat:{method:'local'}}).process.heat;
  const face=grooveFor(40,local&&r.methods.welding).faceWidth;rel(local.local.band,face+2*40,1e-12,'soak band = widest weld + min(t, 50) each side');
});
test('cutting length: blank rectangles, circles, piece outlines and shell holes add up independently',()=>{
  const n={...NOZZLE_DEFAULTS,id:'N1',name:'出口',od:114.3,thickness:6,height:500,angle:30,projection:150,end:'bare'};
  const r=estimateTank({...TANK_DEFAULTS,nozzles:[n],methods:methods()}),c=r.process.cutting;
  let expected=0;
  for(const part of [...r.parts,...r.attachmentParts]){if(part.kind==='formed')continue;
    if(part.pieces)for(const piece of part.pieces){let p=0;const o=piece.outline;if(o){for(let i=0;i<o.length;i++){const a=o[i],b=o[(i+1)%o.length];p+=Math.hypot(b[0]-a[0],b[1]-a[1]);}p+=2*Math.PI*r.input.trim;}else p=2*(piece.w+piece.h);expected+=p;}
    else if(part.kind==='circle')expected+=Math.PI*part.blankDiameter*part.quantity;else expected+=2*(part.width+part.height)*part.quantity;}
  const item=r.nozzlePlan.items[0];expected+=ellipsePerimeter(item.holeWidth/2,item.hole/2);
  rel(c.total,expected,1e-12);rel(ellipsePerimeter(50,50),2*Math.PI*50,1e-12,'Ramanujan exact for a circle');
  assert.equal(c.pipeEnds,2);
  // Speed given → hours; stainless with oxy-fuel is refused.
  const timed=tank({},{cutting:{speed:1000,pierce:30}}).process.cutting;rel(timed.cutHours,timed.total/1000/60+timed.pierces*30/3600);
  assert.ok(tank({material:'SUS304'},{cutting:{method:'oxy'}}).process.cutting.warnings.length===1);
});
test('bevel edges: both plate edges of V and X butt joints, none for I joints',()=>{
  const thin=tank({shellThickness:6,endThickness:6}).process.cutting;assert.equal(thin.bevelLength,0);
  const r=tank({shellThickness:12,endThickness:12}),w=r.process.weld,c=r.process.cutting;
  const v=w.seams.filter(s=>s.kind==='butt'&&s.groove.type==='V'&&s.group!=='nozzle').reduce((s,x)=>s+2*x.length,0);rel(c.bevel.single,v);
});
test('small fittings: nameplate, grounding lugs and sump weights, welds and placement checks',()=>{
  const r=tank({diameter:3000,height:3000},{misc:{nameplate:true,grounding:3,sump:true,sumpDiameter:610,sumpDepth:300,sumpOffset:0}});
  const m=r.attachments.misc,t=r.ends.bottom.t;
  rel(m.bom.find(b=>b.name==='銘牌座').weight,kg(NAMEPLATE.w*NAMEPLATE.h+2*NAMEPLATE.h*NAMEPLATE.standoff,NAMEPLATE.t));
  rel(m.bom.find(b=>b.name==='接地耳').weight,3*kg(GROUNDING_LUG.w*GROUNDING_LUG.h-Math.PI*GROUNDING_LUG.hole**2/4,GROUNDING_LUG.t));
  rel(m.bom.find(b=>b.name==='集水坑').weight,kg(Math.PI*610**2/4,t)+kg(Math.PI*(610+t)*300,t));
  assert.ok(r.process.cutting.holes.some(h=>h.id==='集水坑'));
  assert.equal(r.fabrication.valid,true);
  for(const [offset,ok] of [[0,true],[400,false],[405,true],[1600,false]]){const x=tank({diameter:3000,height:3000},{misc:{sump:true,sumpOffset:offset}});assert.equal(x.fabrication.valid,ok,'offset '+offset);}
  // Not offered on a cone bottom.
  const cone=tank({shape:'custom',top:'open',bottom:'cone'},{misc:{sump:true}});assert.equal(cone.attachments.misc.geometry.sump,undefined);
});
test('support loads split the operating and test weight; lifting sling force from the sling angle',()=>{
  const r=tank({shape:'custom',top:'flat',bottom:'cone',diameter:1500,height:2000},{supports:{type:'legs',count:4},lifting:{enabled:true,slingAngle:60,factor:1.25,share:2}});
  // Everything the supports carry: body, nozzles, pads, manholes and every other attachment (lifting lug plates included).
  const a=r.attachments,sum=g=>(g?.bom??[]).reduce((t,x)=>t+x.weight,0),pre=r.netWeight+(r.nozzlePlan?.extraWeight??0)+a.pads.weight+a.manholes.weight+sum(a.rings)+sum(a.jacket)+sum(a.internals)+sum(a.misc)+sum(a.access)+sum(a.lifting);
  rel(a.supports.loads.operating*4,(pre+r.workingVolume*1000)*G/1000,1e-9);
  rel(a.supports.loads.test*4,(pre+r.volume*1000)*G/1000,1e-9);
  const l=a.lifting.loads;rel(l.sling,l.vertical/Math.sin(Math.PI/3));rel(l.horizontal,l.vertical/Math.tan(Math.PI/3));
  rel(l.vertical,l.weight*G*1.25/2/1000);
});
test('angle rings roll on their centroid radius; attachment fillets follow the welding leg setting',()=>{
  const ring={id:'R1',purpose:'stiffener',section:'angle',a:75,b:75,t:8,position:1000,side:'out',make:'rolled',barLength:6000,weld:'continuous'};
  const r=tank({diameter:2000,height:3000},{rings:[ring]}),item=r.attachments.rings.items[0];
  const leg=75*8,rest=67*8,centroid=(leg*4+rest*(8+33.5))/(leg+rest);rel(sectionOffset('angle',75,75,8),centroid);rel(item.radius,r.od/2+centroid);
  const legs=tank({},{supports:{type:'legs'}}).process.weld.seams.filter(s=>s.group==='attachment');assert.ok(legs.every(s=>s.kind!=='fillet'||s.leg<=12));
  const set=tank({},{supports:{type:'legs'},welding:{filletLeg:5}}).process.weld.seams.filter(s=>s.group==='attachment'&&s.kind==='fillet');assert.ok(set.length&&set.every(s=>s.leg===5));
});
test('transport envelope includes platforms and nozzles and names what governs the width',()=>{
  const r=tank({diameter:2000,height:3000},{access:{platform:true,platformWidth:1000},erection:{method:'shop'}}),e=r.process.erection;
  rel(e.envelope.width,2*(r.od/2+1050));assert.deepEqual(e.envelope.governing,['平台']);
  assert.ok(e.warnings.some(w=>/平台可改現場安裝/.test(w)));
});
test('level table: the working level returns the working volume; exact quartile levels invert the volume',()=>{
  for(const values of [{shape:'custom',top:'cone',bottom:'cone'},{shape:'custom',orientation:'horizontal',top:'torispherical',bottom:'hemispherical'}]){
    const r=tank(values);rel(volumeAtLevel(r,r.process.strapping.working.level),r.workingVolume,1e-9);
    for(const k of [.25,.5,.75])rel(volumeAtLevel(r,levelForVolume(r,r.volume*k)),r.volume*k,1e-9);
  }
});
test('method cards: new topics present, standing disclaimers stay in notes and do not raise the status',()=>{
  const r=tank({},{supports:{type:'lugs'},internals:{baffles:true},jacket:{type:'halfpipe'},lifting:{enabled:true}}),cards=methodCatalog(r),by=id=>cards.find(c=>c.id===id);
  for(const id of ['cutting','heat','misc'])assert.ok(by(id),id);
  for(const id of ['supports','internals','jacket','lifting']){assert.equal(by(id).status,'ok',id);assert.ok(by(id).notes.length>0,id+' keeps its note');}
  assert.equal(by('misc').status,'off');
});
const configs=[
  [{}, {}],
  [{shape:'custom',top:'cone',bottom:'cone',diameter:2400,height:3000},{supports:{type:'legs'},access:{ladder:true,platform:true,roofRail:true},misc:{nameplate:true,grounding:2}}],
  [{shape:'custom',top:'dome',bottom:'flat',diameter:9000,height:7200,shellThickness:10,endThickness:8,code:'api650'},{layout:{bottom:'annular'},supports:{type:'anchors'},access:{stair:true},rings:[{id:'R1',purpose:'curb',section:'angle',a:75,b:75,t:8,position:0,side:'out',make:'rolled',barLength:6000,weld:'continuous'}],erection:{method:'jacking'},misc:{sump:true,sumpOffset:1100},surface:{paint:true,insulation:true}}],
  [{shape:'custom',orientation:'horizontal',top:'elliptical',bottom:'flat',shellThickness:40,endThickness:40,code:'asme'},{supports:{type:'saddles'},heat:{method:'local'},lifting:{enabled:true}}],
  [{shape:'custom',top:'torispherical',bottom:'hemispherical',diameter:2400,height:3000,shellThickness:10,endThickness:10},{layout:{hemiMethod:'petal'},supports:{type:'skirt',skirtHeight:1600},jacket:{type:'coil'},internals:{baffles:true}}],
  [{shape:'custom',top:'flat',bottom:'flat',diameter:4000,height:2000},{layout:{bottom:'strips',top:'strips'},supports:{type:'lugs'},jacket:{type:'full'}}]
];
test('every card drawing and table renders finite SVG for vertical, horizontal and API layouts',()=>{
  for(const [values,extra] of configs){const r=tank(values,extra);assert.equal(r.valid,true);assert.equal(r.fabrication.valid,true,JSON.stringify(r.fabrication.issues));
    for(const card of methodCatalog(r)){if(card.optional&&!card.active)continue;const html=cardVisual(card,r,{print:true})+cardTables(card,r,{print:true});
      assert.doesNotMatch(html,/NaN|undefined|Infinity/,card.id+' '+JSON.stringify(values));
      assert.equal((html.match(/<svg/g)??[]).length,(html.match(/<\/svg>/g)??[]).length,card.id);}
  }
});
test('A4 work order and CSV carry the method pages, welds, cutting, heat and level table',()=>{
  const [values,extra]=configs[2],r=tank(values,extra),page=(title,body)=>`<section><b>${title}</b>${body}</section>`,pages=methodPages(r,page);
  const active=methodCatalog(r).filter(c=>!(c.optional&&!c.active)).length;assert.equal(pages.length,1+active);
  const rows=methodCSVRows(r),labels=rows.map(x=>x[0]);for(const key of ['焊縫','切割零件','PWHT 判定','液位 mm','附件材料','製作安裝方式'])assert.ok(labels.includes(key),key);
  const html=tankWorkOrder(r);assert.match(html,/製作工法總覽/);assert.doesNotMatch(html,/NaN|undefined/);
  const csv=tankCSV(r);assert.match(csv,/集水坑/);assert.match(csv,/液位 mm/);
});
test('projects keep the new method groups and fill defaults for older files',()=>{
  const input={...TANK_DEFAULTS,methods:methods({misc:{nameplate:true,grounding:2},cutting:{speed:1200},heat:{preheat:80}})};
  const back=readTankProject(tankProject(input));assert.equal(back.methods.misc.grounding,2);assert.equal(back.methods.cutting.speed,1200);assert.equal(back.methods.heat.preheat,80);
  const old=structuredClone(input.methods);delete old.misc;delete old.cutting;delete old.heat;
  const filled=readTankProject(JSON.stringify({type:'special-method-tank',version:2,input:{...input,methods:old}}));assert.deepEqual(filled.methods.heat,normalizeMethods({},methodContext(estimateTank(TANK_DEFAULTS))).methods.heat);
});
// ---------------------------------------------------------------- regressions from the independent audit
test('centre of gravity: support elevations by type, exact cone-end centroid, straight flange and horizontal liquid moment',()=>{
  const lugs=tank({diameter:2000,height:3000,shape:'custom',top:'flat',bottom:'flat'},{supports:{type:'lugs',lugElevation:2000,lugHeight:250}});
  const g=lugs.attachments.supports.geometry;rel(lugs.process.cg.items.find(i=>i.name==='支撐').y,g.elevation+g.height/2);
  const anchors=tank({diameter:2000,height:3000,shape:'custom',top:'flat',bottom:'flat'},{supports:{type:'anchors'}});
  rel(anchors.process.cg.items.find(i=>i.name==='支撐').y,anchors.frame.bottomTangent+anchors.attachments.supports.geometry.height/2);
  // Cone frustum surface centroid from the big end: h·(R1 + 2R2) / (3·(R1 + R2)) on the profile radii.
  const c=tank({shape:'custom',top:'flat',bottom:'cone',bottomAngle:60,bottomSmall:100,diameter:2400,height:3000}),e=c.ends.bottom,R1=e.ri,R2=e.small/2;
  rel(c.process.cg.items.find(i=>i.name==='下端').y,c.frame.bottomTangent-e.depth*(R1+2*R2)/(3*(R1+R2)),1e-9);
  // Horizontal, unequal ends, full: independent axial integration of the liquid.
  const h=tank({shape:'custom',orientation:'horizontal',top:'flat',bottom:'hemispherical',diameter:2000,height:3000,fill:100}),f=h.frame,ri=h.di/2,b=h.ends.bottom;
  let v=Math.PI*ri*ri*h.height,m=v*(f.bottomTangent+h.height/2);const n=4000;for(let i=0;i<n;i++){const d=b.depth*(i+.5)/n,dv=Math.PI*b.radiusAt(d)**2*b.depth/n;v+=dv;m+=dv*(f.bottomTangent-d);}
  near(h.process.cg.liquidY,m/v,.5,'horizontal liquid centroid');
});
test('pointed cone outer apex is h + t/cosβ; petal hemispheres have no straight flange',()=>{
  const r=tank({shape:'custom',top:'flat',bottom:'cone',bottomAngle:60,bottomSmall:0,endThickness:6});rel(r.ends.bottom.outer,r.ends.bottom.depth+6/Math.cos(Math.PI/3));
  const formed=tank({shape:'custom',top:'flat',bottom:'hemispherical',headStraight:50}),petal=tank({shape:'custom',top:'flat',bottom:'hemispherical',headStraight:50},{layout:{hemiMethod:'petal'}});
  assert.equal(petal.ends.bottom.straight,0);rel(petal.bodyHeight-formed.bodyHeight,50);
});
test('transport and furnace envelopes stay finite and include rings, legs, anchors, jackets and flat overhang',()=>{
  const bad=tank({orientation:'horizontal',shape:'custom',top:'elliptical',bottom:'elliptical',shellThickness:40,endThickness:40,code:'asme'},{supports:{type:'lugs'}});
  assert.equal(bad.fabrication.valid,false);for(const v of Object.values(bad.process.erection.envelope))if(typeof v==='number')assert.ok(Number.isFinite(v));assert.ok(Number.isFinite(bad.process.heat.size.diameter));
  const ring={id:'R1',purpose:'wind',section:'angle',a:250,b:90,t:10,position:1500,side:'out',make:'rolled',barLength:6000,weld:'continuous'};
  const r=tank({diameter:3388,height:3000,shellThickness:6},{rings:[ring]});rel(r.process.erection.envelope.width,2*(r.od/2+250));
  const legs=tank({diameter:3388,height:3000,shape:'custom',top:'flat',bottom:'cone'},{supports:{type:'legs'}}),lg=legs.attachments.supports.geometry;rel(legs.process.erection.envelope.width,2*Math.max(legs.od/2+legs.input.overhang,lg.radius+Math.max(lg.size/2,lg.base/2)));
});
test('hydro static head follows the test level; ASME spot RT counts one per 15 m of total spot weld',()=>{
  const r=tank({shape:'custom',orientation:'horizontal',top:'elliptical',bottom:'elliptical',diameter:2000,height:5000},{inspection:{testFill:90}}),t=r.process.test;
  rel(t.staticHead,G*levelForVolume(r,r.volume*.9)/1000,1e-9);
  const s=tank({shape:'custom',top:'elliptical',bottom:'elliptical',diameter:1000,height:2000,code:'asme',efficiency:.85}),w=s.process.weld;
  const total=w.seams.filter(x=>x.kind==='butt'&&['A','B'].includes(x.category)).reduce((a,x)=>a+x.length,0);assert.equal(w.nde.spots,Math.ceil(total/15000));
});
test('saddle tops, skirt course seams, annular shell fillet and the centre-plate joint are in the weld list',()=>{
  const sd=tank({orientation:'horizontal',shape:'custom',top:'elliptical',bottom:'elliptical',diameter:1200},{supports:{type:'saddles',contactAngle:120,ribs:4,saddleWidth:200}}),g=sd.attachments.supports.geometry;
  rel(sd.attachments.welds.find(w=>w.name==='腹板／筋板－墊板').length,2*(2*g.Rs*Math.PI*120/180+2*4*200));
  rel(g.hCentre,300-g.baseThickness-g.wearThickness);
  const sk=tank({shape:'custom',top:'elliptical',bottom:'elliptical',diameter:2400,height:3000,stockWidth:1500},{supports:{type:'skirt',skirtHeight:2000}});
  const ts=sk.input.shellThickness;rel(sk.attachments.welds.find(w=>w.name==='裙座環縫').length,Math.PI*(sk.od-ts));
  const an=tank({diameter:9000,height:6000,shellThickness:12,endThickness:6},{layout:{bottom:'annular',annularThickness:10}}),seam=an.process.weld.seams.find(x=>/筒身角焊/.test(x.name));
  assert.equal(seam.leg,10);rel(an.process.weld.seams.find(x=>x.name==='中幅板－環形邊板搭接').length,2*Math.PI*(an.layouts.bottom.innerRadius+30));
  const butt=tank({diameter:9000,height:6000},{layout:{bottom:'annular',joint:'butt'}});assert.ok(butt.process.weld.seams.some(x=>x.name==='中幅板－環形邊板對接'&&x.kind==='butt'));
});
test('unequal angle rings: area t(a+b−t), centroid with the shell leg b, seam reach on the shell leg, weld on the contact circle',()=>{
  rel(sectionArea.angle(100,8,75),8*(100+75-8));rel(sectionOffset('angle',100,75,8),(75*8*4+92*8*(8+46))/(8*(100+75-8)));
  const ring={id:'R1',purpose:'stiffener',section:'channel',a:75,b:200,t:8,position:0,side:'out',make:'rolled',barLength:6000,weld:'continuous'};
  const r0=tank({diameter:2000,height:3000,stockWidth:1500});const seam=r0.courseHeight+r0.input.gap/2;
  const r=tank({diameter:2000,height:3000,stockWidth:1500},{rings:[{...ring,position:seam+90}]});assert.ok(r.attachments.rings.warnings.some(w=>/環縫太近/.test(w)),'90 mm from a seam under a 200 mm web');
  rel(r.attachments.welds.find(w=>w.name==='R1 加強圈').length,2*Math.PI*r.od/2);
});
test('closed roof rail posts, single count of rolled ring segments, cage from 2 m, rungs over the climb only',()=>{
  const r=tank({diameter:3000,height:6000},{access:{roofRail:true,ladder:true,cage:'yes',postPitch:1500,rungPitch:300}}),acc=r.attachments.access.geometry;
  assert.equal(acc.roofRail.posts,Math.ceil(Math.PI*(r.od+100)/1500));assert.equal(acc.ladder.cage.start,2000);assert.equal(acc.ladder.rungs,Math.floor(acc.ladder.rise/300));
  const ring={id:'R1',purpose:'stiffener',section:'angle',a:75,b:75,t:8,position:1200,side:'out',make:'rolled',barLength:6000,weld:'continuous'};
  const x=tank({diameter:3000,height:6000},{rings:[ring]});assert.equal(x.process.cutting.bars,x.attachments.rings.items[0].segments);
});
test('PWHT hold temperature below 450 °C is rejected as an input issue',()=>{
  const r=tank({shellThickness:40,endThickness:40,code:'asme'},{heat:{holdTemp:400}});assert.ok(r.fabrication.issues.some(i=>i.field==='methods.heat.holdTemp'));
});
