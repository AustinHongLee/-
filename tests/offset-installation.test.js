import test from 'node:test';
import assert from 'node:assert/strict';
import {computeOffset} from '../dist/assets/offset-geometry.js';
import {originalWorkbenchPlan as originalRoutePlan,compareRoutePlans} from '../dist/assets/offset-planner.js';
import {installRouteComponents} from '../dist/assets/offset-components.js';
import {offsetProjectJSON,readOffsetProject,buildOffsetWorkOrder,offsetCSV} from '../dist/assets/offset-exports.js';
import {buildRoutePlanWorkOrder,routePlanCSV} from '../dist/assets/offset-plan-exports.js';
import {installationDefaults,reconcileInstallation,analyzeInstallation,installationPhases,installationBodies,installationRouteKey,minimumEntryTravel,readInstallation,blankJointMeasurement,jointClockFrame,jointWorkingSector,absoluteObstacles,installationMotion,installationJointMotion} from '../dist/assets/offset-installation.js';
import {convexClash,cylinderShape,boxShape,sweptShape,shiftedShape,planeClash,add,mul,dot} from '../dist/assets/clearance-geometry.js';
import {installationSceneSVG,jointClockSVG,installationWorkPages} from '../dist/assets/offset-installation-report.js';

const input={basis:'ports',layout:'rolling',run:800,roll:0,rise:500,aAxis:'x+',bAxis:'x-',aPortGap:2,bPortGap:2,aGap:2,bGap:2};
const route=extra=>originalRoutePlan(computeOffset({...input,...extra}));
function measured(p,extra={}){
  const s={...reconcileInstallation(installationDefaults(),p).spec,...extra,environmentConfirmed:true,benchConfirmed:true};
  s.portLengths={a:300,b:300};s.tool={process:'mixed',radial:80,axialA:30,axialB:30,boltRadial:100,boltAxialA:60,boltAxialB:60};
  for(const phase of installationPhases(p,s))s.entries[phase.id].travel=300;
  for(const j of p.joints)s.measurements[j.id]={radial:[150,150,150,150],axialA:90,axialB:90,confirmed:true,boltFit:true};
  return s;
}
const near=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);

test('100 mm from the right at 63% leaves 37 mm, with the motion opposite the starting side',()=>{
 const p=route(),s=measured(p);s.entries.whole.travel=100;const phase=analyzeInstallation(p,s).phases[0],before=structuredClone(phase),pose=installationMotion(phase,.63);
 near(pose.moved,63);near(pose.remaining,37);near(pose.offset[1],-37);assert.deepEqual(pose.toward,[-0,1,-0]);
 assert.deepEqual(installationMotion(phase,0).offset,[0,-100,0]);assert.deepEqual(installationMotion(phase,1).offset,[0,-0,0]);near(installationMotion(phase,2).remaining,0);assert.deepEqual(phase,before);
});
test('internal welds move with the spool while both closure faces retain their actual gap coordinates',()=>{
 const p=route(),s=measured(p),phase=analyzeInstallation(p,s).phases[0],before=structuredClone(p);
 const first=installationJointMotion(p,phase,0),middle=installationJointMotion(p,phase,1),last=installationJointMotion(p,phase,p.joints.length-1);
 assert.equal(first.type,'closing');assert.deepEqual(first.position,p.joints[0].finish);assert.deepEqual(first.target,p.joints[0].start);assert.equal(first.targetFixed,true);
 assert.equal(middle.type,'moving');assert.deepEqual(middle.position,p.joints[1].start.map((v,i)=>(v+p.joints[1].finish[i])/2));
 assert.equal(last.type,'closing');assert.deepEqual(last.position,p.joints.at(-1).start);assert.deepEqual(last.target,p.joints.at(-1).finish);assert.deepEqual(p,before);
});
test('last-piece phases distinguish future joints, completed joints and the two moving closure faces',()=>{
 const p=route(),s=measured(p,{mode:'last',lastPart:'P1'}),r=analyzeInstallation(p,s);
 const a=r.phases[0],closing=r.phases.at(-1);
 assert.equal(installationJointMotion(p,a,p.joints.length-1).type,'future');
 assert.equal(installationJointMotion(p,closing,0).type,'fixed');assert.equal(installationJointMotion(p,closing,1).type,'closing');assert.equal(installationJointMotion(p,closing,2).type,'closing');assert.equal(installationJointMotion(p,closing,3).type,'fixed');
});
test('direction diagram moves internal welds with the part and keeps existing ports stationary',()=>{
 const p=route(),s=measured(p);s.entries.whole.travel=100;const r=analyzeInstallation(p,s);
 const start=installationSceneSVG(p,r,{progress:0,view:'top',interactive:true}),middle=installationSceneSVG(p,r,{progress:.63,view:'top',interactive:true}),finish=installationSceneSVG(p,r,{progress:1,view:'top',interactive:true});
 const joint=svg=>svg.match(/data-install-joint="J2"[\s\S]*?<circle cx="([^"]+)" cy="([^"]+)"/).slice(1).map(Number);
 const a=joint(start),b=joint(middle),c=joint(finish);near(a[0],b[0]);near(a[0],c[0]);assert.ok(a[1]>b[1]&&b[1]>c[1]);near((a[1]-b[1])/(a[1]-c[1]),.63,1e-3);
 const port=svg=>svg.match(/<path d="([^"]+)"[^>]*stroke="#83989f"/)[1];assert.equal(port(start),port(finish));assert.match(middle,/既有 A 口/);assert.match(middle,/既有 B 口/);
});

test('a continuous translation sweep catches a 1 mm obstacle missed by both animation endpoints',()=>{
  const body=cylinderShape([0,0,0],[1,0,0],100,10),box=boxShape([49,149.5,-.5],[51,150.5,.5]),offset=[0,300,0];
  assert.equal(convexClash(body,box),false);assert.equal(convexClash(shiftedShape(body,offset),box),false);assert.equal(convexClash(sweptShape(body,offset),box),true);
  assert.equal(convexClash(sweptShape(body,offset),boxShape([49,149,11],[51,151,12])),false);
});
test('finite cylinders keep flat mating faces; tangency is a possible contact, not free clearance',()=>{
  const a=cylinderShape([0,0,0],[1,0,0],100,10);
  assert.equal(convexClash(a,cylinderShape([101,0,0],[1,0,0],100,10)),false);
  assert.equal(convexClash(a,cylinderShape([99,0,0],[1,0,0],100,10)),true);
  assert.equal(convexClash(a,cylinderShape([0,20,0],[1,0,0],100,10)),true);
  assert.equal(convexClash(a,cylinderShape([0,20.001,0],[1,0,0],100,10)),false);
});
test('half-space checks use the actual pipe radius and entire sweep extent',()=>{
  const body=cylinderShape([0,0,0],[1,0,0],100,10),sweep=sweptShape(body,[0,-300,0]);
  assert.equal(planeClash(sweep,1,'min',-310),true);assert.equal(planeClash(sweep,1,'min',-311),false);assert.equal(planeClash(sweep,2,'max',11),false);
});
test('default empty measurements never declare a geometrically closed route installable',()=>{
  const p=route(),s=reconcileInstallation(installationDefaults(),p).spec,r=analyzeInstallation(p,s);
  assert.equal(p.valid,true);assert.equal(r.valid,true);assert.equal(r.status,'unverified');assert.equal(r.phases[0].shortTravel,true);assert.ok(r.environmentPending.length>=3);assert.equal(r.joints[0].status,'unmeasured');
});
test('a fully measured side-entry case has no artificial mating-capsule clash and does not change pipe/weld counts',()=>{
  const p=route(),before=structuredClone(p),s=measured(p),r=analyzeInstallation(p,s);
  assert.equal(r.status,'clear');assert.deepEqual(r.phases[0].hits,[]);assert.equal(r.fieldCount,2);assert.equal(r.benchCount,2);assert.ok(r.modelPadding>0);assert.deepEqual(p,before);
});
test('wall contact is detected from outside diameter rather than centreline only',()=>{
  const p=route(),s=measured(p);s.obstacles=[{id:'O1',name:'左牆',type:'plane',axis:1,side:'max',position:50}];
  const r=analyzeInstallation(p,s);assert.equal(r.status,'review');assert.ok(r.phases[0].hits.some(h=>h.fixed==='O1'));
  s.obstacles[0].position=200;assert.equal(analyzeInstallation(p,s).status,'clear');
});
test('a wall outside the tube but inside the welding-tool reach overrides optimistic handwritten clearances',()=>{
  const p=route(),s=measured(p);s.obstacles=[{id:'O1',name:'焊具側牆',type:'plane',axis:1,side:'max',position:100}];
  const r=analyzeInstallation(p,s);assert.deepEqual(r.phases[0].hits,[]);assert.equal(r.status,'review');assert.equal(r.joints[0].status,'model-review');assert.ok(r.joints[0].modelHits.some(h=>h.id==='O1'));assert.ok(r.joints[0].checks.some(c=>c.status==='model-review'));
  assert.match(installationWorkPages(p,s).join(''),/焊具側牆/);assert.match(offsetCSV(computeOffset(input),s),/接合操作包絡重疊/);
});
test('working sectors cover every clock angle and both axial extremes against independent dense annular samples',()=>{
  for(const axis of [[1,0,0],[0,0,1],[.6,0,.8]])for(let sector=0;sector<4;sector++){
    const joint={position:[23,-40,15],axis,frame:jointClockFrame(axis)},shape=jointWorkingSector(joint,57,80,30,45,sector);
    for(let v=0;v<12;v++){
      const dir=[Math.sin(v*1.7),Math.cos(v*.9),Math.sin(v*.3+.2)],actual=dot(shape.support(dir),dir);let brute=-Infinity;
      for(let k=0;k<=2000;k++){const angle=((sector*90-45)+k*90/2000)*Math.PI/180;
        for(const r of [57,137])for(const x of [-30,45]){const point=joint.position.map((c,i)=>c+x*axis[i]+r*(Math.cos(angle)*joint.frame.top[i]+Math.sin(angle)*joint.frame.right[i]));brute=Math.max(brute,dot(point,dir));}
      }
      assert.ok(actual>=brute-1e-8);near(actual,brute,.001);
    }
  }
});
test('a small obstacle between clock rays is found throughout the axial working extent',()=>{
  const p=route(),s=measured(p),j=analyzeInstallation(p,s).joints[0];s.obstacles=[{id:'O1',name:'槍身旁支架',type:'box',min:[j.position[0]-24,-70,68],max:[j.position[0]-22,-68,70]}];
  const r=analyzeInstallation(p,s);assert.deepEqual(r.phases[0].hits,[]);assert.ok(r.joints[0].modelHits.some(h=>h.id==='O1'));assert.equal(r.status,'review');
});
test('joint access is evaluated before later assemblies are installed, according to the selected sequence',()=>{
  const p=route(),s=measured(p,{mode:'last',lastPart:'P1'});s.tool.radial=2000;s.tool.axialA=1000;s.tool.axialB=1000;
  const r=analyzeInstallation(p,s),first=r.joints[0];assert.equal(first.phaseId,'left');assert.equal(first.phaseTitle,'裝 A 側預組件');assert.ok(first.modelHits.every(h=>!['P1','B'].includes(h.id)));
  assert.equal(r.joints[1].phaseId,'closing');assert.equal(r.joints.at(-1).phaseId,'right');
});
test('a thin mid-path bracket is found even when the start and final poses are clear',()=>{
  const p=route(),s=measured(p),pipe=p.pipes[0],c=pipe.start.map((v,i)=>(v+pipe.finish[i])/2);s.obstacles=[{id:'O1',name:'途中小支架',type:'box',min:[c[0]-1,-151,c[2]-1],max:[c[0]+1,-149,c[2]+1]}];
  const r=analyzeInstallation(p,s);assert.equal(r.status,'review');assert.ok(r.phases[0].hits.some(h=>h.moving===pipe.id&&h.fixed==='O1'));
});
test('short final-position nudges cannot certify a complete entry from outside the target envelope',()=>{
  const p=route(),s=measured(p);s.entries.whole.travel=1;const r=analyzeInstallation(p,s);
  assert.equal(r.phases[0].shortTravel,true);assert.equal(r.status,'unverified');assert.ok(r.phases[0].minimumTravel>p.params.od);
  s.entries.whole.travel=minimumEntryTravel(p,s,installationPhases(p,s)[0]);assert.equal(analyzeInstallation(p,s).status,'clear');
});
test('axial insertion of a welded spool between fixed facing ports exposes the blocking end',()=>{
  const p=route(),s=measured(p);s.entries.whole.from='x+';s.entries.whole.travel=1500;const r=analyzeInstallation(p,s);
  assert.equal(r.status,'review');assert.ok(r.phases[0].hits.some(h=>h.fixed==='port-b'));
});
test('last-part installation makes separate A-arm, B-arm and closing steps and identifies all field closures',()=>{
  const p=route(),s=measured(p,{mode:'last',lastPart:'P1'}),r=analyzeInstallation(p,s);
  assert.deepEqual(r.phases.map(p=>p.id),['left','right','closing']);assert.deepEqual(r.phases[2].movingIds,['P1']);assert.deepEqual(r.phases[1].fixedIds,['A']);
  assert.equal(r.fieldCount,4);assert.equal(r.benchCount,0);assert.equal(r.status,'clear');
  s.entries.closing.from='x+';s.entries.closing.travel=1500;assert.equal(analyzeInstallation(p,s).status,'review');
});
test('choosing an end part last never invents an empty assembly step',()=>{
  const p=route();for(const e of [p.elements[0],p.elements.at(-1)]){
    const s=measured(p,{mode:'last',lastPart:e.id}),phases=installationPhases(p,s);assert.equal(phases.length,2);assert.ok(phases.every(p=>p.movingIds.length));
  }
  const bad=measured(p);bad.mode='last';bad.lastPart='missing';assert.equal(analyzeInstallation(p,bad).valid,false);
});
test('all four angular sectors and both axial sides must meet independently entered tool needs',()=>{
  const p=route(),s=measured(p),id=p.joints[0].id;s.measurements[id].radial[2]=79;
  let r=analyzeInstallation(p,s);assert.equal(r.status,'review');assert.equal(r.joints[0].checks[2].status,'tight');
  s.measurements[id].radial[2]=null;assert.equal(analyzeInstallation(p,s).status,'unverified');s.measurements[id].radial[2]=80;s.measurements[id].axialB=29;assert.equal(analyzeInstallation(p,s).status,'review');
  s.measurements[id].axialB=30;s.measurements[id].confirmed=false;assert.equal(analyzeInstallation(p,s).status,'unverified');s.measurements[id].confirmed=true;assert.equal(analyzeInstallation(p,s).status,'clear');
  s.tool.radial=null;assert.equal(analyzeInstallation(p,s).status,'unverified');
});
test('unknown and zero measured space remain different; zero tool radial reach is not accepted',()=>{
  const p=route(),s=measured(p),id=p.joints[0].id;s.measurements[id].radial[0]=0;assert.equal(analyzeInstallation(p,s).joints[0].checks[0].status,'tight');
  s.measurements[id].radial[0]=null;assert.equal(analyzeInstallation(p,s).joints[0].checks[0].status,'unmeasured');s.tool.radial=0;assert.equal(analyzeInstallation(p,s).valid,false);
});
test('workbench welds need a separate physical-access confirmation',()=>{
  const p=route(),s=measured(p);s.benchConfirmed=false;const r=analyzeInstallation(p,s);assert.equal(r.status,'unverified');assert.ok(r.joints.filter(j=>j.role==='bench').every(j=>j.status==='bench-pending'));
});
test('valve/flange envelopes and external bolted access are never assumed from illustrative 3D dimensions',()=>{
  const p=installRouteComponents(route(),[{id:'C1',kind:'valve',name:'閥',target:'s1',length:160,leftConnection:'bolt',rightConnection:'weld',leftGap:2,rightGap:2,placement:'center',distance:0,internalBolts:1}]);assert.equal(p.valid,true);
  const s=measured(p,{mode:'last',lastPart:'C1'});assert.equal(analyzeInstallation(p,s).status,'unverified');s.componentOD.C1=220;let r=analyzeInstallation(p,s);assert.equal(r.status,'clear');
  const bolt=r.joints.find(j=>j.kind==='bolt'&&j.role==='field');assert.ok(bolt);s.measurements[bolt.id].boltFit=false;assert.equal(analyzeInstallation(p,s).joints.find(j=>j.id===bolt.id).status,'unmeasured');
  s.componentOD.C1=50;assert.equal(analyzeInstallation(p,s).valid,false);
});
test('environment confirmation cannot hide incomplete boxes or unknown component dimensions',()=>{
  const p=route(),s=measured(p);s.obstacles=[{id:'O1',name:'未量',type:'box',min:[0,null,0],max:[1,2,3]}];
  const r=analyzeInstallation(p,s);assert.equal(r.status,'unverified');assert.match(r.environmentPending.join(' '),/未填完整/);
});
test('route or port geometry edits clear measured evidence, but station-count edits keep it',()=>{
  const p=route(),s=measured(p),changed=reconcileInstallation(s,route({run:801}));assert.equal(changed.changed,true);assert.equal(changed.spec.environmentConfirmed,false);assert.deepEqual(changed.spec.measurements,{});
  const stations=reconcileInstallation(s,route({stations:24}));assert.equal(stations.changed,false);assert.deepEqual(stations.spec.measurements,s.measurements);
  const stale=analyzeInstallation(route({run:801}),s);assert.equal(stale.status,'unverified');assert.ok(stale.joints.filter(j=>j.role==='field').every(j=>j.status==='unmeasured'));assert.equal(stale.spec.environmentConfirmed,false);
});
test('custom entry vectors are normalised and clock frames stay orthogonal, including vertical joints',()=>{
  const p=route(),s=measured(p);s.entries.whole.from='custom';s.entries.whole.vector=[0,-20,0];near(analyzeInstallation(p,s).phases[0].offset[1],-300);
  for(const axis of [[1,0,0],[0,0,1],[0,0,-1],[.6,0,.8]]){const f=jointClockFrame(axis);near(dot(f.top,axis),0);near(dot(f.right,axis),0);near(dot(f.top,f.right),0);near(Math.hypot(...f.top),1);}
});
test('mark-based ports keep obstacle coordinates relative to corrected A without changing physical inputs',()=>{
  const p=route({datum:'marks',aShiftX:100,aShiftY:-50,aShiftZ:30}),s=measured(p);s.obstacles=[{id:'O1',name:'上方',type:'plane',axis:2,side:'max',position:600},{id:'O2',name:'架',type:'box',min:[0,0,0],max:[10,20,30]}];
  const boxes=absoluteObstacles(p,s);near(boxes[0].position,600+p.context.ports.a[2]);assert.deepEqual(boxes[1].min,p.context.ports.a);assert.deepEqual(s.obstacles[1].min,[0,0,0]);
});
test('v7 project round-trips selected multi-elbow route, obstacles, tools and unknown measurements',()=>{
  const p=compareRoutePlans({...input,run:1435,roll:1000,rise:2071,bAxis:'y+',planMaxJoints:8}).plans[0],s=measured(p);s.measurements.J1.radial[0]=null;s.obstacles=[{id:'O1',name:'支架',type:'box',min:[100,-300,50],max:[200,-250,100]}];
  const saved=offsetProjectJSON(p.params,'TEST',null,[],s),back=readOffsetProject(saved);assert.equal(JSON.parse(saved).version,7);assert.deepEqual(back.installation,s);assert.equal(back.installation.selectedPlan,p.key);assert.deepEqual(back.params,p.params);
  const reload=compareRoutePlans(back.params).plans.find(p=>p.key===back.installation.selectedPlan);assert.ok(reload);assert.equal(installationRouteKey(reload),s.routeKey);
});
test('v1–v6 without installation records migrate to unknown, and malformed records fail closed',()=>{
  const data=JSON.parse(offsetProjectJSON(route().params));for(const version of [4,5,6]){data.version=version;delete data.installation;assert.equal(readOffsetProject(JSON.stringify(data)).installation.environmentConfirmed,false);}
  for(const patch of [{tool:{bad:1}},{entries:{whole:{from:'custom',vector:[0,0,0],travel:10}}},{obstacles:[{id:'O1',name:'x',type:'box',min:[5,0,0],max:[1,1,1]}]},{environmentConfirmed:'yes'}])assert.throws(()=>readInstallation({...installationDefaults(),...patch}));
});
test('work order, CSV and diagrams use the same findings and escape obstacle names',()=>{
  const p=route(),s=measured(p);s.obstacles=[{id:'O1',name:'<script>bad</script>',type:'plane',axis:1,side:'max',position:50}];const r=analyzeInstallation(p,s),pages=installationWorkPages(p,s),html=buildOffsetWorkOrder(computeOffset(input),'TEST','A4',null,s),csv=offsetCSV(computeOffset(input),s),svg=installationSceneSVG(p,r);
  assert.match(html,/組立與接合空間/);assert.match(html,/需調整／精查/);assert.match(html,/&lt;script&gt;bad/);assert.doesNotMatch(pages.join(''),/<script>bad/);assert.match(csv,/包絡重疊/);assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
  const clock=jointClockSVG(r.joints[0],{required:80});assert.match(clock,/整段最小淨空/);assert.match(clock,/A 側軸向/);
  s.obstacles[0].name='=SUM(1,2)';assert.ok(offsetCSV(computeOffset(input),s).includes("'=SUM"));assert.ok(routePlanCSV(p,s).includes("'=SUM"));
});
test('unverified and stale evidence are printed as unknown rather than a previously green result',()=>{
  const p=route(),s=measured(p);const other=route({run:802}),html=buildRoutePlanWorkOrder(other,'STALE','A4',s);assert.match(html,/資料待核對/);assert.match(html,/未量/);assert.doesNotMatch(html,/搬入與接合空間核對完成/);
});
test('the original A/B-labelled workbench route keeps measured evidence through JSON, CSV and its printed order',()=>{
  const p=route(),s=measured(p),loaded=readOffsetProject(offsetProjectJSON(p.params,'AB',null,[],s)),reload=originalRoutePlan(computeOffset(loaded.params));
  assert.deepEqual(reload.elbows.map(e=>e.id),['A','B']);assert.equal(installationRouteKey(reload),s.routeKey);assert.equal(analyzeInstallation(reload,loaded.installation).status,'clear');
  assert.match(buildOffsetWorkOrder(computeOffset(loaded.params),'AB','A4',null,loaded.installation),/搬入與接合空間核對完成/);assert.match(offsetCSV(computeOffset(loaded.params),loaded.installation),/搬入與接合空間核對完成/);
});
test('three- and four-bend routes retain every phase and joint in the installation report',()=>{
  const plans=compareRoutePlans({...input,planPreference:'easy',planMaxJoints:8,aTangent:5,bTangent:7,planAOtherTangent:13,planBOtherTangent:17,planExtraInTangent:6,planExtraOutTangent:9}).plans;
  for(const count of [3,4]){const p=plans.find(p=>p.elbows.length===count);assert.ok(p);const s=measured(p,{mode:'last',lastPart:p.pipes[1].id}),r=analyzeInstallation(p,s);assert.equal(r.valid,true);const html=installationWorkPages(p,s).join('');for(const j of p.joints)assert.ok(html.includes(j.id));for(const ph of r.phases)assert.ok(html.includes(ph.title));}
});
