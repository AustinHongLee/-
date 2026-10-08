// Regression tests for the 2026-10 independent calculation audit.
// Each test pins a defect that was reproduced with an independent numeric check.
import test from 'node:test';
import assert from 'node:assert/strict';
import {computeConicalJoint,conicalDevelopmentToWorld,conicalPaperToDevelopment} from '../dist/assets/conical-geometry.js';
import {createMainOpeningPatch} from '../dist/assets/exports.js';

const sub=(a,b)=>a.map((v,i)=>v-b[i]),add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,k)=>a.map(v=>v*k),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const norm=v=>Math.hypot(...v),unit=v=>mul(v,1/norm(v));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

test('cone mother paper is not mirrored for a text-out wrap when the cone grows toward B',()=>{
  const base={hostType:'cone',mainLength:350,jointPosition:175,branchOD:60.3,branchWall:3.91,angle:72,surfaceClock:110,jointType:'on',motherOpening:true,holeGap:.5,padEnabled:false,tolerance:.1,samples:180};
  for(const fixture of [{mainOD:323.9,mainEndOD:219.1,branchSwivel:25},{mainOD:219.1,mainEndOD:323.9,branchSwivel:25},{mainOD:219.1,mainEndOD:323.8,mainLength:500,jointPosition:250,branchOD:114.3,branchWall:6,angle:70,surfaceClock:0,branchSwivel:20}]){
    const r=computeConicalJoint({...base,...fixture});assert.equal(r.valid,true,JSON.stringify(r.errors));
    const t=r.templates.find(t=>t.id==='main'),p=r.params,toWorld=P=>conicalDevelopmentToWorld(conicalPaperToDevelopment(P,t.mapping),p,0,t.mapping.seamAngle);
    // Printed paper: x right, y down. A text-out wrap must satisfy T(right) x T(down) = -n_out,
    // the same handedness as the straight main template (U right, X down).
    const P0=t.holes[0][0],h=1e-4,Jx=mul(sub(toWorld(add(P0,[h,0])),toWorld(sub(P0,[h,0]))),.5/h),Jy=mul(sub(toWorld(add(P0,[0,h])),toWorld(sub(P0,[0,h]))),.5/h);
    const W=toWorld(P0),k=r.geometry.conical.k,radius=Math.hypot(W[1],W[2]),outward=unit([-k,W[1]/radius,W[2]/radius]);
    assert.ok(dot(cross(Jx,Jy),outward)<0,`paper handedness for k=${k}`);
    // Every traced hole point lands on the hole-cutting tool cylinder.
    const axes=r.geometry.axes,tool=r.geometry.main.holeToolRadius;
    for(const P of t.holes[0]){const v=sub(toWorld(P),axes.branchOrigin),along=dot(v,axes.branchDirection);assert.ok(Math.abs(norm(sub(v,mul(axes.branchDirection,along)))-tool)<1e-6);}
    // Local-patch A/B crosses land where their printed φ says.
    const patch=createMainOpeningPatch(r);
    for(const cross of Object.values(patch.mapping.positioning)){
      const world=toWorld(add(sub(add(cross.paper,patch.mapping.origin),t.mapping.origin),[0,0]));
      const phi=((Math.atan2(world[1],world[2])*180/Math.PI)+360)%360;assert.ok(Math.abs(((phi-cross.phiDegrees+540)%360)-180)<1e-6,`cross φ ${phi} vs ${cross.phiDegrees}`);
    }
    assert.equal(!!t.mapping.developmentMirrorX,k>0);
  }
});

// ---------------------------------------------------------------- offset tool
import {computeOffset} from '../dist/assets/offset-geometry.js';
import {originalRoutePlan,compareRoutePlans} from '../dist/assets/offset-planner.js';
import {SCENE_VIEWS,directionIcon} from '../dist/assets/offset-input-visuals.js';
import {cutClockSVG} from '../dist/assets/offset-workflow-ui.js';
import {offsetCSV} from '../dist/assets/offset-exports.js';

test('offset sketches use the right-handed frame of the 3D view and print (X front, Y left, Z up)',()=>{
  const [row0,row1]=SCENE_VIEWS.iso.matrix,right=row0,up=row1.map(v=>-v),toward=cross(right,up);
  assert.ok(toward[2]>0,'iso camera must look from above');
  for(const [axis,vector] of [['x+',[1,0,0]],['y+',[0,1,0]],['z+',[0,0,1]]]){
    const projected=[dot(row0,vector),dot(row1,vector)],icon=directionIcon(axis).match(/L([-\d.]+) ([-\d.]+)M/).slice(1).map(Number),arrow=[icon[0]-38,icon[1]-33];
    assert.ok(dot(projected,arrow)>0,`${axis} icon follows the iso projection`);
  }
});

test('factory elbows: Ta already spans centre to face, so typed straights are ignored and they are never half-cut',()=>{
  const base={basis:'ports',layout:'rolling',od:114.3,stations:12,run:2000,roll:0,rise:1200,aAxis:'x+',bAxis:'x-',aPortGap:0,bPortGap:0,aGap:0,bGap:0,planExtraGap:0,trimA:0,trimB:0,minStraight:0,planMinPipe:100,planMaxElbows:2,planMaxJoints:8,aKind:'factory',aFactoryAngle:90,bKind:'factory',bFactoryAngle:90,aTakeout:202.4,bTakeout:202.4};
  const pipes=c=>c.plans.filter(p=>!p.original&&p.elbows.every(e=>e.process==='full')).map(p=>p.pipes.map(e=>Number(e.length.toFixed(3))).join('/')).sort();
  assert.deepEqual(pipes(compareRoutePlans({...base,aTangent:50,bTangent:50,planAOtherTangent:50,planBOtherTangent:50})),pipes(compareRoutePlans(base)));
  const half=compareRoutePlans({...base,planMaxElbows:4,run:1500,rise:300,aFactoryAngle:45,bFactoryAngle:45,aTakeout:63.5,bTakeout:63.5});
  for(const plan of half.plans)for(const e of plan.elbows)if(e.kind==='factory'||e.radius!==base.planExtraRadius&&e.takeout===63.5)assert.equal(e.process,'full');
});

test('an original elbow that uses its full donor angle still cuts off a far-end straight',()=>{
  const p={basis:'ports',layout:'rolling',od:114.3,stations:12,run:344.8,roll:0,rise:1000,aAxis:'x+',bAxis:'x-',aRadius:152.4,bRadius:152.4,aDonor:90,bDonor:90,aTangent:20,bTangent:20,aPortGap:0,bPortGap:0,aGap:0,bGap:0,trimA:0,trimB:0,minStraight:0,planAOtherTangent:20,planBOtherTangent:20};
  const r=computeOffset(p);assert.equal(r.valid,true);const plan=originalRoutePlan(r);
  for(const e of plan.elbows){assert.equal(e.process,'full');assert.equal(e.kind,'cut');assert.equal(e.trimFar,20);}
});

test('two-elbow back-solve finds S-curves with very different bends (5° + 15°)',()=>{
  const p={basis:'ports',layout:'rolling',od:114.3,stations:12,run:571.749,roll:0,rise:-7.015,aAxis:'x+',bAxis:'custom',bAxisX:-0.984808,bAxisY:0,bAxisZ:0.173648,aRadius:1500,bRadius:1500,aDonor:90,bDonor:90,aPortGap:0,bPortGap:0,aGap:0,bGap:0,aTangent:0,bTangent:0,minStraight:0};
  const r=computeOffset(p);assert.equal(r.valid,true,JSON.stringify(r.errors));
  assert.ok(Math.abs(r.elbows.a.angle-5)<.01&&Math.abs(r.elbows.b.angle-15)<.01&&Math.abs(r.cutLength-50)<.1);
});

test('port-mode true offset is measured square to the A port axis',()=>{
  const r=computeOffset({basis:'ports',layout:'rolling',run:300,roll:0,rise:1500,aAxis:'z+',bAxis:'z-',aRadius:152.4,bRadius:152.4});assert.equal(r.valid,true);
  assert.ok(Math.abs(r.offset-300)<1e-9);assert.match(offsetCSV(r),/"真正偏移","300"/);
});

test('cut clock highlight and readout always describe the same station',()=>{
  const r=computeOffset({basis:'ports',layout:'rolling',run:800,rise:500,stations:12}),e=r.elbows.a;
  const svg=cutClockSVG(e,114.3,20),highlighted=Number(svg.match(/data-station="(\d+)"[^>]*><circle[^>]*\/><circle[^>]*r="7"/)[1]);
  assert.equal(highlighted,0);assert.match(svg,new RegExp(`沿周長 ${String(Number(e.stations[0].around.toFixed(2)))}`));
});

// ---------------------------------------------------------------- tank tool
import {estimateTank} from '../dist/assets/tank-materials.js';
import {NOZZLE_DEFAULTS,cylindersClash} from '../dist/assets/tank-nozzles.js';
import {tankCSV} from '../dist/assets/tank-exports.js';
const nozzle=(id,o)=>({...NOZZLE_DEFAULTS,id,name:id,...o});

test('vertical-seam clearance is measured to the gap centre on both sides of the seam',()=>{
  const at=angle=>estimateTank({gap:6,nozzles:[nozzle('N1',{angle,height:300})]}).nozzlePlan.items[0];
  assert.ok(at(356.7206).warnings.some(w=>w.includes('縱縫')),'hole edge 2.5 mm into the gap must warn');
  assert.ok(!at(3.1844).warnings.some(w=>w.includes('縱縫')),'hole 2.5 mm clear of the gap must not warn');
});

test('shell end joints, WN hubs inside the wall and pipes through another flange are flagged',()=>{
  const ell=estimateTank({shape:'elliptical',nozzles:[nozzle('N1',{height:31})]}).nozzlePlan.items[0];
  assert.ok(ell.warnings.some(w=>w.includes('下封頭對接縫')));
  const open=estimateTank({nozzles:[nozzle('N1',{height:31})]}).nozzlePlan.items[0];
  assert.ok(open.warnings.some(w=>w.includes('底板')));
  const wn=estimateTank({nozzles:[nozzle('N1',{projection:51})]}).nozzlePlan.items[0];
  assert.ok(wn.warnings.some(w=>w.includes('對焊端')));
  const pair=estimateTank({nozzles:[nozzle('N1',{angle:45,height:300,projection:200}),nozzle('N2',{angle:45,height:390,projection:400})]}).nozzlePlan.items;
  assert.ok(pair[0].warnings.some(w=>w.includes('實體相交'))&&pair[1].warnings.some(w=>w.includes('實體相交')));
  // A thin pipe crossing a thin disc, with no sample of either lying near the other's centre.
  assert.equal(cylindersClash({a:[0,-50,0],d:[0,1,0],length:100,radius:10},{a:[-5,0,-80],d:[1,0,0],length:10,radius:120}),true);
  assert.equal(cylindersClash({a:[0,-50,0],d:[0,1,0],length:100,radius:10},{a:[25,0,-80],d:[1,0,0],length:10,radius:120}),false);
});

test('CSV keeps plain negative design values numeric',()=>{
  const csv=tankCSV(estimateTank({minTemperature:'-29',medium:'=cmd'}));
  assert.ok(csv.includes('"-29"')&&!csv.includes("'-29"));assert.ok(csv.includes("'=cmd"));
});

// ---------------------------------------------------------------- elbow host and steel supports
import {computeElbowJoint} from '../dist/assets/elbow-geometry.js';
import {buildElbowWorkOrderHTML} from '../dist/assets/elbow-field.js';
import {computeSteelJoint,computeSteelFaceStations} from '../dist/assets/steel-geometry.js';
import {steelPaperPositionRecipe} from '../dist/assets/steel-exports.js';
import {templateSVG} from '../dist/assets/exports.js';

test('mirror-image ±Z outer-edge-flush elbow joints are both valid and both print',()=>{
  const base={hostType:'elbow',mainOD:168.3,mainWall:6,branchOD:33.4,branchWall:3,branchLength:200,bendRadius:228.6,bendAngle:90,elbowAlignment:'a-edge',elbowOffset:0,elbowSideOffset:1,jointType:'on',rootGap:0,holeGap:0,projection:0,motherOpening:false,padEnabled:false,samples:180,autoPrecision:true,tolerance:.1};
  for(const fixture of [base,{...base,mainOD:323.8,mainWall:8.18,branchOD:21.3,branchWall:3.195,bendRadius:500.271,rootGap:1}])for(const side of [1,-1]){
    const r=computeElbowJoint({...fixture,elbowSideOffset:side});assert.equal(r.valid,true,`side ${side}: ${JSON.stringify(r.errors)}`);assert.doesNotThrow(()=>buildElbowWorkOrderHTML(r));
  }
});

test('elbow branch minimum length includes cuts that bulge inside a thick swivelled wall',()=>{
  const r=computeElbowJoint({hostType:'elbow',mainOD:114.3,mainWall:6,bendRadius:120.015,bendAngle:90,bendPosition:45,branchOD:48.3,branchWall:10.15,branchLength:100,angle:90,surfaceClock:0,branchSwivel:20,jointType:'on',motherOpening:true,holeGap:0,rootGap:0,projection:0,padEnabled:false,samples:180,autoPrecision:true,tolerance:.1});
  assert.equal(r.valid,true,JSON.stringify(r.errors));assert.ok(r.measurements.branchMinLength<100-.15&&r.measurements.branchMinLength>99.7);
});

test('steel mother marks sit under the cut edge along the true normal; face papers state their datum and axes',()=>{
  const gap=3,common={mainOD:219.1,mainWall:6,mainLength:600,jointPosition:300,branchSection:'rhs',sectionWidth:60,sectionHeight:80,sectionWall:4,sectionRadius:6,sectionRotation:30,angle:60,rootGap:gap,branchLength:150};
  const hosts=[{hostType:'straight'},{hostType:'elbow',bendRadius:304.8,bendAngle:90,bendPosition:45},{hostType:'cone',mainEndOD:273}];
  let checked=0;
  for(const host of hosts){
    const r=computeSteelJoint({...common,...host});assert.equal(r.valid,true,`${host.hostType}: ${JSON.stringify(r.errors)}`);const p=r.params,R=p.mainOD/2;
    // Outer-surface residual and outward unit normal at a mother mark, from the host's own analytic surface.
    const surface=c=>{if(p.hostType==='elbow'){const x=c[0],y=c[1]-p.bendRadius,planar=Math.hypot(x,y),tube=[x/planar*(planar-p.bendRadius),y/planar*(planar-p.bendRadius),c[2]],len=norm(tube);return {residual:len-R,normal:mul(tube,1/len)};}
      if(p.hostType==='cone'){const k=(p.mainEndOD-p.mainOD)/(2*p.mainLength),s=Math.hypot(1,k),rho=Math.hypot(c[1],c[2]);return {residual:(rho-R-k*c[0])/s,normal:[-k/s,c[1]/rho/s,c[2]/rho/s]};}
      const rho=Math.hypot(c[1],c[2]);return {residual:rho-R,normal:[0,c[1]/rho,c[2]/rho]};};
    for(const face of r.geometry.steel.section.faces.filter(f=>f.role==='outer'))for(const row of computeSteelFaceStations(r,face.id,8)){
      const q=surface(row.contactPoint),offset=sub(row.point,row.contactPoint);
      assert.ok(Math.abs(q.residual)<1e-6,`${p.hostType} mark off surface ${q.residual}`);
      assert.ok(norm(sub(offset,mul(q.normal,gap)))<1e-6,`${p.hostType} cut point is not ${gap} mm along the normal`);checked++;
    }
  }
  assert.ok(checked>40);
  const r=computeSteelJoint({...common,...hosts[0]}),t=r.templates.find(t=>t.mapping?.faceId);assert.match(steelPaperPositionRecipe(t),/0° 時 u 軸指向母材 A／基準端/);
  const svg=templateSVG(t);assert.doesNotMatch(svg,/X→主管軸向/);assert.match(svg,/U←沿面距離/);
});

// ---------------------------------------------------------------- review follow-ups
import {offsetProjectJSON,readOffsetProject} from '../dist/assets/offset-exports.js';

test('clash test is exact and bounded for huge, very thin flanges',()=>{
  const disk=(a,d,length,radius)=>({a,d,length,radius});
  const started=performance.now();
  assert.equal(cylindersClash(disk([0,0,0],[0,0,1],1,1300),disk([3000,0,0],[0,0,1],1,1300)),false);
  assert.equal(cylindersClash(disk([0,0,0],[0,0,1],1,1300),disk([0,0,-500],[1,0,0],1,1300)),true);
  assert.equal(cylindersClash(disk([0,0,0],[0,0,1],400,.5),disk([800,0,100],[0,0,1],18,750)),false);
  assert.ok(performance.now()-started<50,'three pathological pairs must not take seconds');
  // Coincident solids overlap even though neither boundary enters the other.
  assert.equal(cylindersClash(disk([0,0,0],[0,1,0],100,30),disk([0,0,0],[0,1,0],100,30)),true);
});

test('offset projects are saved as v5; older saves that used Y or factory straights get a one-time notice',()=>{
  const p={basis:'ports',layout:'rolling',run:800,roll:300,rise:500};
  const json=offsetProjectJSON(p),data=JSON.parse(json);assert.equal(data.version,5);assert.deepEqual(readOffsetProject(json).notices,[]);
  data.version=4;const old=readOffsetProject(JSON.stringify(data));assert.equal(old.notices.length,1);assert.match(old.notices[0],/左＋Y/);
  data.params.roll=0;assert.equal(readOffsetProject(JSON.stringify(data)).notices.length,0);
});

test('a factory elbow ignores a blank kept-end straight instead of failing on a hidden field',()=>{
  const r=computeOffset({basis:'ports',layout:'rolling',run:304.8,roll:0,rise:1200,aAxis:'x+',bAxis:'x-',aKind:'factory',aFactoryAngle:90,aTakeout:152.4,bKind:'factory',bFactoryAngle:90,bTakeout:152.4,aTangent:null,bTangent:null});
  assert.equal(r.valid,true,JSON.stringify(r.errors));assert.ok(Math.abs(r.cutLength-(1200-2*152.4))<1e-6);
});
