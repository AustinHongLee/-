import test from 'node:test';
import assert from 'node:assert/strict';
import {computeOffset,DEFAULT_OFFSET} from '../dist/assets/offset-geometry.js';
import {compareRoutePlans,routeElbowFrame,retainedRouteFrame,routeSearchScope} from '../dist/assets/offset-planner.js';
import {buildRoutePlanWorkOrder,routePlanCSV,routePlanDiagramSVG} from '../dist/assets/offset-plan-exports.js';
import {offsetProjectJSON,readOffsetProject} from '../dist/assets/offset-exports.js';

const input={basis:'ports',layout:'rolling',run:800,roll:0,rise:500,aPortGap:2,bPortGap:2,aGap:2,bGap:2,planExtraGap:3,trimA:2,trimB:3,stations:24,planMaxJoints:5};
const near=(a,b,tol=1e-6)=>assert.ok(Math.abs(a-b)<tol,`${a} ≠ ${b}`);
const add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,n)=>a.map(v=>v*n);
const comparison=changes=>{const r=compareRoutePlans({...input,...changes});assert.ok(r.valid,r.errors?.join(' '));return r;};

test('advisory comparison preserves input and the original two-elbow manufacturing dimensions',()=>{
  const raw={...input},before=computeOffset(raw),r=compareRoutePlans(raw);
  assert.deepEqual(raw,input);assert.deepEqual(r.original,before);
  assert.equal(r.plans[0].original,true);assert.equal(r.plans[0].jointCount,4);
  near(r.plans[0].pipes[0].length,before.cutLength);assert.equal(r.plans[0].specialCuts,2);
  assert.ok(r.plans.slice(1).every(p=>p.specialCuts===0&&p.jointCount===5));
});

test('two full 90-degree elbows with an added inlet pipe have independent rectangular dimensions and all five gaps',()=>{
  const p=comparison().plans.find(p=>!p.original&&p.elbows.every(e=>Math.abs(e.angle-90)<1e-6)&&p.elements[0].type==='pipe');
  assert.ok(p);near(p.pipes[0].length,800-2*152.4-2-3-2);near(p.pipes[1].length,500-2*152.4-2-2);
  assert.deepEqual(p.joints.map(j=>j.amount),[2,3,2,2,2]);assert.equal(p.elbows.every(e=>e.kind==='factory'),true);
  p.pipes.forEach(e=>near(e.blankLength,e.length+5));near(p.closureError,0);
});

test('45-degree half bends trade one extra weld for simple cuts, with the correct diagonal and lead pipe',()=>{
  const p=comparison().plans.find(p=>p.halfCuts===2&&p.elements[0].type==='pipe');assert.ok(p);
  const theta=Math.PI/4,R=152.4;
  const diagonal=(500-2*R*(1-Math.cos(theta)))/Math.sin(theta)-4;
  const lead=800-500-2*R*Math.tan(theta/2)-7;
  near(p.pipes[0].length,lead);near(p.pipes[1].length,diagonal);assert.equal(p.jointCount,5);
  assert.equal(p.elbows[0].stations.length,25);near(p.elbows[0].stations[0].kept,p.elbows[0].stations.at(-1).kept);
});

test('full stock accounts for both original end tangents, while half cuts remove the far tangent',()=>{
  const base=comparison(),r=comparison({planAOtherTangent:13,planBOtherTangent:17});
  const full=r.plans.find(p=>!p.original&&p.halfCuts===0&&p.elements[0].type==='pipe');
  const old=base.plans.find(p=>!p.original&&p.halfCuts===0&&p.elements[0].type==='pipe');
  assert.ok(full);near(full.pipes[0].length,old.pipes[0].length);near(full.pipes[1].length,old.pipes[1].length-30);
  near(full.elbows[0].tangentAfter,13);near(full.elbows[1].tangentBefore,17);
  const half=r.plans.find(p=>p.halfCuts===2&&p.elements[0].type==='pipe'),oldHalf=base.plans.find(p=>p.halfCuts===2&&p.elements[0].type==='pipe');
  half.pipes.forEach((e,k)=>near(e.length,oldHalf.pipes[k].length));near(half.elbows[0].tangentAfter,0);near(half.elbows[1].tangentBefore,0);
  near(r.plans[0].pipes[0].length,base.plans[0].pipes[0].length);
});

test('additional full elbows keep both end tangents and all routes still close',()=>{
  const r=comparison({planMaxJoints:8,planPreference:'easy',planExtraInTangent:6,planExtraOutTangent:9});
  const loop=r.plans.find(p=>p.elbows.length===4);assert.ok(loop);
  for(const e of loop.elbows.slice(1,-1)){near(e.tangentBefore,6);near(e.tangentAfter,9);}
  near(loop.closureError,0);assert.match(buildRoutePlanWorkOrder(loop),/前直段 6／後直段 9/);
});

test('weld cap excludes extra joints, and search minimum never silently alters the original',()=>{
  assert.deepEqual(comparison({planMaxJoints:4}).plans.map(p=>p.original),[true]);
  const r=comparison({planMinPipe:250});assert.equal(r.plans[0].original,true);
  assert.ok(r.plans.slice(1).every(p=>p.pipes.every(e=>e.length>=250-1e-6)));
  near(r.plans[0].pipes[0].length,computeOffset(input).cutLength);
});

test('nonparallel ports can use fixed 90/45 bends and three straight pipes when six joints are allowed',()=>{
  const r=comparison({roll:300,bAxis:'z-',planMaxJoints:6});
  const p=r.plans.find(p=>!p.original&&p.jointCount===6);assert.ok(p);assert.equal(p.pipes.length,3);
  assert.ok(p.elbows.every(e=>['half','full'].includes(e.process)));near(p.closureError,0);near(p.axisError,0);
  near(p.elements.at(-1).direction[2],1);assert.equal(p.joints.filter(j=>j.source==='新增焊口間隙').length,2);
});

test('axis permutation and marked-port translations retain equivalent fabrication sizes',()=>{
  const base=comparison({roll:300}),turned=comparison({run:300,roll:800,aAxis:'y+',bAxis:'y-'});
  assert.equal(base.plans.length,turned.plans.length);
  base.plans.forEach((p,i)=>p.pipes.forEach((e,k)=>near(e.length,turned.plans[i].pipes[k].length)));
  const shifted=comparison({datum:'marks',aShiftX:15,aShiftY:-20,aShiftZ:35,bShiftX:15,bShiftY:-20,bShiftZ:35});
  shifted.plans.forEach((p,i)=>{
    p.pipes.forEach((e,k)=>near(e.length,comparison().plans[i].pipes[k].length));
    p.joints[0].start.forEach((v,k)=>near(v,[15,-20,35][k]));
    p.joints.at(-1).finish.forEach((v,k)=>near(v,[815,-20,535][k]));
  });
});

test('tape-measured donor arcs supply the same physical radius to suggested routes',()=>{
  const R=152.4,r=114.3/2,theta=Math.PI/2;
  const tape=comparison({aRadiusMethod:'outerArc',aMeasuredArc:(R+r)*theta,bRadiusMethod:'innerArc',bMeasuredArc:(R-r)*theta,aRadius:900,bRadius:900});
  const base=comparison();assert.equal(tape.plans.length,base.plans.length);
  tape.plans.forEach((p,i)=>{p.elbows.forEach(e=>near(e.radius,R));p.pipes.forEach((e,k)=>near(e.length,base.plans[i].pipes[k].length));});
});

test('explicitly raising the weld cap permits a four-bend loop; limiting excursion removes it',()=>{
  const open=comparison({planMaxJoints:8,planPreference:'easy'});
  const loop=open.plans.find(p=>p.elbows.length===4);assert.ok(loop);assert.equal(loop.jointCount,8);assert.ok(loop.envelope.maxExcursion>300);
  const limited=comparison({planMaxJoints:8,planPreference:'easy',planSpaceLimit:'margin',planMargin:0});
  assert.ok(limited.filteredSpace>0);assert.ok(limited.plans.every(p=>p.original||p.envelope.maxExcursion<1e-5));
  assert.equal(limited.plans[0].original,true);
});

test('all presented routes close under numerical tangent integration, retaining the specified gaps and end axes',()=>{
  for(const config of [{planMaxJoints:8,planPreference:'easy'},{roll:300,bAxis:'z-',planMaxJoints:8,aTangent:12,bTangent:7},{rise:-500,roll:-200,planMaxJoints:6},{run:1435,roll:1000,rise:2071,bAxis:'y+',planMaxJoints:8}]){
    for(const p of comparison(config).plans){
      let q=[...p.context.ports.a];
      for(let i=0;i<p.elements.length;i++){
        q=add(q,mul(p.joints[i].direction,p.joints[i].amount));const e=p.elements[i];
        e.start.forEach((v,k)=>near(q[k],v,1e-4));
        if(e.type==='pipe')q=add(q,mul(e.direction,e.length));
        else{
          q=add(q,mul(e.u,e.tangentBefore));
          // Integrate tangent over arc length independently of the route displacement solver.
          const steps=4000,h=e.theta/steps;let move=[0,0,0];
          for(let j=0;j<=steps;j++){
            const t=j*h,weight=j===0||j===steps?.5:1;
            const tangent=add(mul(e.u,Math.cos(t)),mul(e.n,Math.sin(t)));
            move=add(move,mul(tangent,weight*e.radius*h));
          }
          q=add(add(q,move),mul(e.v,e.tangentAfter));
        }
        e.finish.forEach((v,k)=>near(q[k],v,1e-4));
      }
      const last=p.joints.at(-1);q=add(q,mul(last.direction,last.amount));q.forEach((v,k)=>near(v,p.context.ports.b[k],1e-4));
      assert.equal(p.joints.length,p.elements.length+1);
    }
  }
});

test('analytic elbow extrema bound every sampled curve point and retained clock frames face into the elbow',()=>{
  for(const p of comparison({planMaxJoints:8,planPreference:'easy'}).plans)for(const e of p.elbows){
    for(let i=0;i<=100;i++)routeElbowFrame(e,i/100).center.forEach((v,k)=>assert.ok(v>=p.envelope.min[k]-1e-6&&v<=p.envelope.max[k]+1e-6));
    const f=retainedRouteFrame(e),expected=e.retain==='outlet'?e.v.map(v=>-v):e.u;f.tangent.forEach((v,k)=>near(v,expected[k]));
    near(Math.hypot(...f.outside),1);near(Math.hypot(...f.side),1);
  }
});

test('a factory-angle mismatch still permits alternative full/half stock routes without emitting the invalid original',()=>{
  const r=comparison({aKind:'factory',bKind:'factory',aFactoryAngle:90,bFactoryAngle:90,aTakeout:152.4,bTakeout:152.4});
  assert.equal(r.original.valid,false);assert.ok(r.plans.length>0);assert.ok(r.plans.every(p=>!p.original));
});

test('comparison settings are validated separately from original manufacturing data',()=>{
  for(const invalid of [{planMaxJoints:3},{planMaxElbows:5},{planExtraGap:null},{planExtraRadius:30},{planPreference:'unknown'},{planExtraDonor:180}]){
    const raw={...input,...invalid};assert.equal(computeOffset(raw).valid,true);const r=compareRoutePlans(raw);assert.equal(r.valid,false);assert.equal(r.plans.length,0);
  }
  assert.equal(compareRoutePlans({basis:'intersections'}).valid,false);
  assert.equal(compareRoutePlans({...input,aAxis:'custom',aAxisX:0,aAxisY:0,aAxisZ:0}).valid,false);
});

test('route orders include each part and joint, actual cut angles, and escaped identifiers',()=>{
  const p=comparison().plans.find(p=>p.halfCuts===2),html=buildRoutePlanWorkOrder(p,'<現場>');
  assert.match(html,/&lt;現場&gt;/);assert.doesNotMatch(html,/<現場>/);assert.match(html,/原工單未替換/);
  assert.equal((html.match(/<section class="page">/g)||[]).length,7);
  assert.equal((html.match(/<td>360<\/td>/g)||[]).length,2);
  p.elements.forEach(e=>assert.ok(html.includes(e.id)));p.joints.forEach(j=>assert.ok(html.includes(j.id)));
  assert.match(html,/沿外表面量/);assert.match(html,/新增焊口間隙/);assert.match(routePlanDiagramSVG(p),/X／Y 正投影/);
  const csv=routePlanCSV(p);assert.ok(csv.startsWith('\uFEFF'));assert.match(csv,/"焊口數","5"/);assert.match(csv,/"原彎頭對半切"/);
});

test('full factory route needs three base pages and invalid closure cannot be exported',()=>{
  const p=comparison().plans.find(p=>!p.original&&p.halfCuts===0),html=buildRoutePlanWorkOrder(p);
  assert.equal((html.match(/<section class="page">/g)||[]).length,3);
  assert.throws(()=>buildRoutePlanWorkOrder({...p,closureError:1}));assert.throws(()=>routePlanCSV({...p,valid:false}));
});

test('version 4 retains advisory settings, and version 2 migration supplies weld-first defaults',()=>{
  const raw={...input,planMaxJoints:6,planPreference:'compact'},json=offsetProjectJSON(raw);
  assert.equal(JSON.parse(json).version,4);assert.equal(readOffsetProject(json).params.planMaxJoints,6);
  const early=JSON.parse(json);for(const key of ['planAOtherTangent','planBOtherTangent','planExtraInTangent','planExtraOutTangent'])delete early.params[key];
  assert.equal(readOffsetProject(JSON.stringify(early)).params.planAOtherTangent,0);
  const oldKeys=Object.keys(DEFAULT_OFFSET).slice(0,Object.keys(DEFAULT_OFFSET).indexOf('planPreference'));
  const oldParams=Object.fromEntries(oldKeys.map(k=>[k,JSON.parse(json).params[k]]));
  const old=readOffsetProject(JSON.stringify({format:'special-method-offset',version:2,params:oldParams}));
  assert.equal(old.params.basis,'ports');assert.equal(old.params.planPreference,'welds');assert.equal(old.params.planMaxJoints,5);
  delete oldParams.aGap;assert.throws(()=>readOffsetProject(JSON.stringify({format:'special-method-offset',version:2,params:oldParams})));
});

test('the reported XYZ and outward B +Y direction need a three-elbow route, not a larger single elbow',()=>{
  const raw={...input,run:1435,roll:1000,rise:2071,aAxis:'x+',bAxis:'y+',planExtraGap:0,planMaxJoints:DEFAULT_OFFSET.planMaxJoints},before=structuredClone(raw);
  const original=computeOffset(raw);assert.equal(original.valid,false);assert.ok(original.context);
  assert.deepEqual(original.errors.map(e=>e.code),['angle-limit']);assert.ok(original.errors[0].requiredAngle>116&&original.errors[0].requiredAngle<117);
  for(const cap of [5,6])assert.equal(compareRoutePlans({...raw,planMaxJoints:cap}).plans.length,0);
  const result=compareRoutePlans(raw);assert.ok(result.valid);assert.ok(result.plans.length>0);assert.deepEqual(raw,before);
  assert.equal(Math.min(...result.plans.map(p=>p.jointCount)),7);assert.ok(result.plans.every(p=>!p.original&&p.elbows.length>=3));
  for(const p of result.plans){assert.ok(p.closureError<1e-5&&p.axisError<1e-5);assert.ok(p.elbows.every(e=>e.angle<=90+1e-6&&e.angle<=e.donor+1e-6));assert.ok(p.pipes.every(e=>e.length>=100-1e-6));}
});
test('weld-first ranking keeps compact half-cut routes ahead of long all-full detours at the same joint count',()=>{
  const r=comparison({run:1435,roll:1000,rise:2071,bAxis:'y+',planMaxJoints:8}),first=r.plans[0];
  assert.equal(first.jointCount,7);assert.equal(first.specialCuts,0);assert.ok(first.halfCuts>0);
  assert.ok(first.envelope.maxExcursion<200);assert.ok(first.totalPipe<4000);
  for(let i=1;i<r.plans.length;i++)assert.ok(r.plans[i].envelope.maxExcursion>=r.plans[i-1].envelope.maxExcursion-1e-6);
});
test('search scope explains when the joint limit makes a nominal four-elbow search effectively two',()=>{
  assert.deepEqual(routeSearchScope({...DEFAULT_OFFSET,planMaxJoints:5}),{valid:true,effectiveElbows:2,limitedByWelds:true,canExpand:true});
  assert.equal(routeSearchScope({...DEFAULT_OFFSET,planMaxJoints:6}).effectiveElbows,3);
  assert.deepEqual(routeSearchScope(DEFAULT_OFFSET),{valid:true,effectiveElbows:4,limitedByWelds:false,canExpand:false});
  assert.equal(routeSearchScope({...DEFAULT_OFFSET,planMaxElbows:2}).effectiveElbows,2);
  assert.equal(routeSearchScope({...DEFAULT_OFFSET,planMaxJoints:null}).valid,false);
});
test('measured multi-elbow projects survive JSON round-trip while invalid manufacturing exports stay blocked',()=>{
  const raw={...input,run:1435,roll:1000,rise:2071,bAxis:'y+',planMaxJoints:8},original=computeOffset(raw);
  const loaded=readOffsetProject(offsetProjectJSON(raw,'三彎頭試算'));assert.deepEqual(loaded.params,original.params);assert.equal(loaded.id,'三彎頭試算');
  const restored=compareRoutePlans(loaded.params);assert.ok(restored.plans.length>0);assert.equal(restored.original.valid,false);
  assert.throws(()=>offsetProjectJSON({...raw,roll:null}));assert.throws(()=>offsetProjectJSON({...raw,aRadius:30}));
  const bad=JSON.parse(offsetProjectJSON(raw));bad.params.aGap=null;assert.throws(()=>readOffsetProject(JSON.stringify(bad)));
  const order=buildRoutePlanWorkOrder(restored.plans[0]);assert.match(order,/7/);assert.ok(order.includes('E3'));assert.ok(order.includes('P3'));
});
