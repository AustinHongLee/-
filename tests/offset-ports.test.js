import test from 'node:test';
import assert from 'node:assert/strict';
import {computeOffset,DEFAULT_OFFSET,offsetCenterline,offsetSurfaceFrame,dot} from '../dist/assets/offset-geometry.js';
import {compareOffsetFit,cross} from '../dist/assets/offset-ports.js';
import {offsetProjectJSON,readOffsetProject,buildOffsetWorkOrder,offsetCSV,offsetStripPlan} from '../dist/assets/offset-exports.js';
import {elbowFabricationSVG} from '../dist/assets/offset-fabrication.js';
const norm=a=>Math.hypot(...a),unit=a=>a.map(v=>v/norm(a)),add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,k)=>a.map(v=>v*k),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const rad=n=>n*Math.PI/180,deg=n=>n*180/Math.PI,near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const valid=p=>{const r=computeOffset({basis:'ports',layout:'rolling',run:800,rise:500,...p});assert.ok(r.valid,JSON.stringify(r.errors));return r;};

// Independent integration of the tangent direction, with no takeout formula.
function integrateBend(start,toward,radius,angle){let p=[0,0,0];const N=20000,step=rad(angle)/N;for(let i=0;i<N;i++){const t=(i+.5)*step;p=add(p,mul(add(mul(start,Math.cos(t)),mul(toward,Math.sin(t))),radius*step));}return p;}
function fixture({u=[1,0,0],seed=[0,0,1],a=37,b=59,ra=152.4,rb=200,straight=600,gaps=[2,3,4,5],tangents=[12,8],twist=.6}={}){
  u=unit(u);const n=unit(sub(seed,mul(u,dot(seed,u)))),w=add(mul(u,Math.cos(rad(a))),mul(n,Math.sin(rad(a))));
  const inPlane=unit(sub(u,mul(w,dot(u,w)))),side=unit(cross(w,inPlane)),toward=add(mul(inPlane,Math.cos(twist)),mul(side,Math.sin(twist))),v=add(mul(w,Math.cos(rad(b))),mul(toward,Math.sin(rad(b))));
  const D=add(add(add(mul(u,gaps[0]+tangents[0]),integrateBend(u,n,ra,a)),mul(w,straight+gaps[1]+gaps[2])),add(integrateBend(w,toward,rb,b),mul(v,gaps[3]+tangents[1])));
  const params={basis:'ports',layout:'rolling',run:D[0],roll:D[1],rise:D[2],aAxis:'custom',bAxis:'custom',aAxisX:u[0],aAxisY:u[1],aAxisZ:u[2],bAxisX:-v[0],bAxisY:-v[1],bAxisZ:-v[2],aRadius:ra,bRadius:rb,aPortGap:gaps[0],aGap:gaps[1],bGap:gaps[2],bPortGap:gaps[3],aTangent:tangents[0],bTangent:tangents[1]};
  return {params,u,v,w,D,a,b,ra,rb,straight};
}

test('fixed face-centre XYZ yields different angles from theoretical intersection inputs',()=>{
  const port=valid({roll:0}),legacy=computeOffset({layout:'rolling',solve:'run',run:800,rise:500});
  assert.ok(port.elbows.a.angle>legacy.angle);assert.ok(Math.abs(port.cutLength-legacy.cutLength)>10);
  near(port.elbows.a.angle,35.43654619183437);near(port.cutLength,764.9836599561831);
});

test('inverse assembly recovers independently integrated 3D bends, unequal angles/radii and all four gaps',()=>{
  for(const c of [{},{u:[0,0,1],seed:[1,0,0],a:25,b:70,twist:1.3},{u:[-2,1,.7],seed:[1,0,1],a:62,b:42,ra:250,rb:150,twist:-1.1},{a:90,b:90,twist:0,straight:1100}]){
    const f=fixture(c),r=valid(f.params);near(r.elbows.a.angle,f.a,2e-6);near(r.elbows.b.angle,f.b,2e-6);near(r.cutLength,f.straight,2e-6);
    near(r.closureError,0,1e-5);for(let i=0;i<3;i++)near(r.direction[i],f.w[i],1e-7);
    const fa=offsetSurfaceFrame(r,'a',0),fb=offsetSurfaceFrame(r,'b',1);for(let i=0;i<3;i++){near(fa.tangent[i],f.u[i]);near(fb.tangent[i],f.v[i]);}
    const a=offsetCenterline(r,'a',1),b=offsetCenterline(r,'b',0);near(norm(sub(b,a)),r.cutLength+r.params.aGap+r.params.bGap);
    for(const end of ['a','b'])for(const fraction of [0,.2,.6,1]){const frame=offsetSurfaceFrame(r,end,fraction);near(norm(frame.tangent),1);near(norm(frame.side),1);near(dot(frame.side,frame.outside),0);near(dot(frame.tangent,frame.outside),0);}
  }
});

test('axis presets support perpendicular ports and signed rolling measurements',()=>{
  const r=valid({bAxis:'z-',roll:0});near(r.elbows.a.angle+r.elbows.b.angle,90);assert.ok(Math.abs(r.elbows.a.angle-r.elbows.b.angle)>20);
  const negative=valid({run:-800,roll:-300,rise:-500,aAxis:'x-',bAxis:'x+'});near(negative.delta[0],-800);assert.ok(negative.closureError<1e-5);
});

test('measurement marks are converted separately to face centres without changing a verified assembly',()=>{
  const f=fixture(),base=valid(f.params),shiftA=[4,-6,20],shiftB=[-8,2,12],measured=add(sub(f.D,shiftB),shiftA);
  const r=valid({...f.params,datum:'marks',run:measured[0],roll:measured[1],rise:measured[2],aShiftX:4,aShiftY:-6,aShiftZ:20,bShiftX:-8,bShiftY:2,bShiftZ:12});
  near(r.cutLength,base.cutLength);near(r.elbows.a.angle,base.elbows.a.angle);for(let i=0;i<3;i++)near(r.delta[i],f.D[i]);
});

test('tape-only original outer/inner arc measurements recover Rc, excluding stock tangent extensions',()=>{
  for(const method of ['outerArc','innerArc']){
    const arc=(152.4+(method==='outerArc'?1:-1)*114.3/2)*Math.PI/2,r=valid({aRadiusMethod:method,aMeasuredArc:arc,aTangent:15});
    near(r.elbows.a.radius,152.4);assert.equal(r.elbows.a.tangent,15);
    const direct=valid({aTangent:15});near(r.cutLength,direct.cutLength);near(r.elbows.a.outerArc,direct.elbows.a.outerArc);
  }
});

test('donor limits, zero-angle routes, factory mismatch and weld space prevent issuing a wrong order',()=>{
  for(const p of [{aDonor:22.5},{bAxis:'x+'},{rise:0,roll:0},{aKind:'factory',aFactoryAngle:90},{minStraight:2000},{aPortGap:null},{bGap:-1},{run:null},{aAxis:'custom',aAxisX:0,aAxisY:0,aAxisZ:0},{datum:'marks',aShiftX:null},{aRadiusMethod:'outerArc',aMeasuredArc:1}]){
    const r=computeOffset({basis:'ports',layout:'rolling',run:800,rise:500,...p});assert.equal(r.valid,false,JSON.stringify(p));assert.throws(()=>buildOffsetWorkOrder(r));
  }
  const f=fixture(),r=valid({...f.params,aKind:'factory',aFactoryAngle:f.a,aTakeout:f.ra*Math.tan(rad(f.a)/2)});near(r.cutLength,f.straight,2e-6);assert.equal(r.elbows.a.stations.length,0);
});

test('rough blank and minimum weld-to-weld straight length are separate from the four root gaps',()=>{
  const f=fixture(),r=valid({...f.params,trimA:3,trimB:5,minStraight:500});near(r.cutLength,600,2e-6);near(r.blankLength,608,2e-6);
  assert.match(buildOffsetWorkOrder(r),/G1 2 mm/);assert.match(buildOffsetWorkOrder(r),/G4 5 mm/);
});

test('rigid actual-dimension comparison measures position and pipe-axis mismatch without a cold-pull allowance',()=>{
  const f=fixture(),r=valid(f.params),exact=compareOffsetFit(r,r.elbows.a.angle,r.elbows.b.angle,r.cutLength);assert.ok(exact.valid);near(exact.distance,0,1e-5);near(exact.axisMismatch,0,1e-5);
  const longer=compareOffsetFit(r,r.elbows.a.angle,r.elbows.b.angle,r.cutLength+10);near(longer.distance,10);for(let i=0;i<3;i++)near(longer.mismatch[i],r.direction[i]*10);
  const altered=compareOffsetFit(r,r.elbows.a.angle+.5,r.elbows.b.angle,r.cutLength);assert.ok(altered.distance>1);assert.ok(altered.axisMismatch>.1);
  assert.equal(compareOffsetFit(r,91,45,600).valid,false);assert.equal(compareOffsetFit(r,45,45,null).valid,false);
  assert.match(buildOffsetWorkOrder(r,'試組','A4',altered),/不能當作可拉量或允收判定/);
});

test('v2 projects preserve datum/directions/stock/gaps; original v1 projects keep their theoretical datum',()=>{
  const f=fixture(),r=valid(f.params),saved=readOffsetProject(offsetProjectJSON(r.params));assert.deepEqual(saved.params,r.params);
  const legacyKeys=Object.keys(DEFAULT_OFFSET).slice(0,Object.keys(DEFAULT_OFFSET).indexOf('basis')),params=Object.fromEntries(legacyKeys.map(k=>[k,DEFAULT_OFFSET[k]]));
  const old=readOffsetProject(JSON.stringify({format:'special-method-offset',version:1,params}));assert.equal(old.params.basis,'intersections');
  delete params.od;assert.throws(()=>readOffsetProject(JSON.stringify({format:'special-method-offset',version:1,params})));
});

test('nonparallel shop order and measuring strips use each elbow angle and contain tape-cutting drawings',()=>{
  const r=valid({bAxis:'z-',stations:24,roll:0}),html=buildOffsetWorkOrder(r,'<現場>');
  assert.match(html,/&lt;現場&gt;/);assert.equal((html.match(/<section class="page">/g)||[]).length,6);assert.equal((html.match(/<td>360<\/td>/g)||[]).length,2);
  assert.match(html,/沿外表面量/);assert.match(html,/外背在順時針/);assert.match(html,/G1／G4/);
  const plan=offsetStripPlan(r);assert.ok(plan.rows.find(q=>q.end==='B').station.kept>plan.rows.find(q=>q.end==='A').station.kept);
  assert.match(offsetCSV(r),/B 所需彎頭角度/);assert.match(elbowFabricationSVG(r.elbows.b,r.params.od),new RegExp(String(Number(r.elbows.b.angle.toFixed(4)))));
});
