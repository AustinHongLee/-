import {routeElbowFrame} from './offset-planner.js';
import {add,sub,mul,dot,length,unit,cylinderShape,capsuleShape,boxShape,sweptShape,shapeBounds,convexClash,planeClash} from './clearance-geometry.js';

export const ENTRY_DIRECTIONS=Object.freeze({'x+':[1,0,0],'x-':[-1,0,0],'y+':[0,1,0],'y-':[0,-1,0],'z+':[0,0,1],'z-':[0,0,-1]});
export const ENTRY_LABELS={'x+':'從前方 ＋X','x-':'從後方 −X','y+':'從左側 ＋Y','y-':'從右側 −Y','z+':'從上方 ＋Z','z-':'從下方 −Z',custom:'自訂斜向'};
export const INSTALLATION_SCOPE='只核對已輸入包絡的固定姿態直線搬入；不包含旋轉繞入、吊具／人員通道、彈性強拉、焊接變形、強度或施工核准。彎頭以含弦差餘量的膠囊包絡保守檢查，重疊須調整或實物精查。';
const freshEntry=()=>({from:'y-',vector:[0,-1,0],travel:null});
export const installationDefaults=()=>({version:1,mode:'whole',lastPart:'',selectedPlan:null,routeKey:null,environmentConfirmed:false,benchConfirmed:false,
  portLengths:{a:null,b:null},tool:{process:'mixed',radial:null,axialA:null,axialB:null,boltRadial:null,boltAxialA:null,boltAxialB:null},
  componentOD:{},obstacles:[],entries:{whole:freshEntry(),left:freshEntry(),right:freshEntry(),closing:freshEntry()},measurements:{}});
export const blankJointMeasurement=()=>({radial:[null,null,null,null],axialA:null,axialB:null,confirmed:false,boltFit:false});
const number=(v,{negative=false,positive=false}={})=>v===null||typeof v==='number'&&Number.isFinite(v)&&v>=(negative?-1e6:positive?1e-4:0)&&v<=1e6;
function object(value,keys,label){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))throw new Error(label+'格式錯誤。');}
function text(v,max){return typeof v==='string'&&v.length<=max;}
function bool(v){return typeof v==='boolean';}
export function readInstallation(value){
  if(value===null||value===undefined)return installationDefaults();
  const d=installationDefaults();object(value,Object.keys(d),'組立檢查');const s={...d,...structuredClone(value)};
  if(s.version!==1||!['whole','last'].includes(s.mode)||!text(s.lastPart,16)||s.selectedPlan!==null&&!text(s.selectedPlan,16000)||s.routeKey!==null&&!text(s.routeKey,30000)||!bool(s.environmentConfirmed)||!bool(s.benchConfirmed))throw new Error('組立檢查版本或核對狀態錯誤。');
  object(s.portLengths,['a','b'],'既有管長');if(!['a','b'].every(k=>number(s.portLengths[k],{positive:true})))throw new Error('既有管檢查長度須大於 0，未量請留白。');
  object(s.tool,Object.keys(d.tool),'工具空間');if(!['mixed','smaw','gtaw'].includes(s.tool.process)||Object.keys(d.tool).filter(k=>k!=='process').some(k=>!number(s.tool[k],{positive:k==='radial'||k==='boltRadial'})))throw new Error('工具徑向需要須大於 0，軸向需要可填 0 或正值；未量請留白。');
  object(s.entries,Object.keys(d.entries),'搬入步驟');for(const id of Object.keys(d.entries)){
    const e=s.entries[id];object(e,['from','vector','travel'],'搬入資料');if(![...Object.keys(ENTRY_DIRECTIONS),'custom'].includes(e.from)||!Array.isArray(e.vector)||e.vector.length!==3||e.vector.some(v=>v===null||!number(v,{negative:true}))||!number(e.travel,{positive:true})||e.from==='custom'&&length(e.vector)<1e-8)throw new Error('搬入方向與行程無效；行程需大於 0，自訂方向不可全為 0。');
  }
  if(!s.componentOD||typeof s.componentOD!=='object'||Array.isArray(s.componentOD)||Object.entries(s.componentOD).some(([id,v])=>!/^C\d{1,4}$/.test(id)||!number(v,{positive:true})))throw new Error('零件最大外包直徑無效。');
  if(!Array.isArray(s.obstacles)||s.obstacles.length>12)throw new Error('最多可設定 12 個障礙物。');const ids=new Set();
  for(const o of s.obstacles){
    object(o,['id','name','type','axis','side','position','min','max'],'障礙物');
    if(!/^O\d{1,4}$/.test(o.id)||ids.has(o.id)||!text(o.name,50)||!['plane','box'].includes(o.type))throw new Error('障礙物編號、名稱或類型無效。');ids.add(o.id);
    if(o.type==='plane'&&(![0,1,2].includes(o.axis)||!['min','max'].includes(o.side)||!number(o.position,{negative:true})))throw new Error('平面障礙物位置無效。');
    if(o.type==='box'&&[o.min,o.max].some(v=>!Array.isArray(v)||v.length!==3||v.some(x=>!number(x,{negative:true}))))throw new Error('箱體需填兩個角點 XYZ，未量請留白。');
    if(o.type==='box'&&o.min.some((v,i)=>v!==null&&o.max[i]!==null&&v>=o.max[i]))throw new Error('箱體每個方向的最小座標須小於最大座標。');
  }
  if(!s.measurements||typeof s.measurements!=='object'||Array.isArray(s.measurements)||Object.keys(s.measurements).length>32)throw new Error('接合空間量測格式錯誤。');
  for(const [id,m] of Object.entries(s.measurements)){
    object(m,Object.keys(blankJointMeasurement()),'接合量測');if(!/^J\d{1,2}$/.test(id)||!Array.isArray(m.radial)||m.radial.length!==4||m.radial.some(v=>!number(v))||!number(m.axialA)||!number(m.axialB)||!bool(m.confirmed)||!bool(m.boltFit))throw new Error('接合淨空須為 0 或正值，未量請留白；整圈核對需明確確認。');
  }
  return s;
}
export function installationRouteKey(plan){
  if(!plan?.valid||plan.legacy||!plan.context?.ports)return null;
  return JSON.stringify([plan.params.od,plan.context.ports,plan.context.axes,plan.elements.map(e=>[e.id,e.type,e.start,e.finish,e.radius??null,e.theta??null,e.u??null,e.n??null,e.direction??null,e.tangentBefore??0,e.tangentAfter??0]),plan.joints.map(j=>[j.id,j.kind??'weld',j.start,j.finish,j.direction])]);
}
export function reconcileInstallation(value,plan){
  const s=readInstallation(value),key=installationRouteKey(plan);if(!key)return {spec:s,changed:false};
  const last=plan.elements.find(e=>e.id===s.lastPart)??[...plan.pipes].sort((a,b)=>b.length-a.length)[0]??plan.elements[0];
  const changed=s.routeKey!==null&&s.routeKey!==key;
  return {spec:{...s,lastPart:last.id,selectedPlan:plan.key,routeKey:key,...(s.routeKey!==key?{environmentConfirmed:false,benchConfirmed:false,measurements:{}}:{})},changed};
}
export function installationPhases(plan,spec){
  const ids=plan.elements.map(e=>e.id),n=ids.length;
  if(spec.mode==='whole')return [{id:'whole',title:'預組整段搬入',movingIds:ids,fixedIds:[],jointIndices:[0,n]}];
  const k=ids.indexOf(spec.lastPart);if(k<0)throw new Error('先選最後放入的零件。');
  return [...(k?[{id:'left',title:'裝 A 側預組件',movingIds:ids.slice(0,k),fixedIds:[],jointIndices:[0]}]:[]),...(k<n-1?[{id:'right',title:'裝 B 側預組件',movingIds:ids.slice(k+1),fixedIds:ids.slice(0,k),jointIndices:[n]}]:[]),{id:'closing',title:'最後放入 '+ids[k],movingIds:[ids[k]],fixedIds:ids.filter(id=>id!==ids[k]),jointIndices:[k,k+1]}];
}
export function installationBodies(plan,spec){
  const out=[];for(const e of plan.elements){
    const radius=(e.type==='component'?(spec.componentOD[e.id]??plan.params.od):plan.params.od)/2;
    const shapes=[];let padding=0;
    if(e.type!=='elbow')shapes.push(cylinderShape(e.start,e.direction,e.length,radius));
    else{
      if(e.tangentBefore>0)shapes.push(cylinderShape(e.start,e.u,e.tangentBefore,radius));
      const count=Math.max(1,Math.ceil(e.theta/(Math.PI/24)));padding=e.radius*(1-Math.cos(e.theta/count/2));
      for(let i=0;i<count;i++)shapes.push(capsuleShape(routeElbowFrame(e,i/count).center,routeElbowFrame(e,(i+1)/count).center,radius+padding));
      if(e.tangentAfter>0)shapes.push(cylinderShape(e.arcFinish,e.v,e.tangentAfter,radius));
    }
    for(const shape of shapes)shape.bounds=shapeBounds(shape);out.push({id:e.id,shapes,padding});
  }
  for(const end of ['a','b']){
    const inward=mul(plan.context.axes[end],end==='a'?-1:1),span=spec.portLengths[end]??plan.params.od*2,a=plan.context.ports[end];
    const shape=cylinderShape(a,inward,span,plan.params.od/2);shape.bounds=shapeBounds(shape);out.push({id:end==='a'?'port-a':'port-b',shapes:[shape],padding:0});
  }
  return out;
}
export function absoluteObstacles(plan,spec){
  return spec.obstacles.map(o=>o.type==='plane'?{...o,position:o.position===null?null:o.position+plan.context.ports.a[o.axis]}:{...o,min:o.min.map((v,i)=>v===null?null:v+plan.context.ports.a[i]),max:o.max.map((v,i)=>v===null?null:v+plan.context.ports.a[i])});
}
const obstacleComplete=o=>o.type==='plane'?o.position!==null:[...o.min,...o.max].every(v=>v!==null);
function contactSeparated(plan,movingId,fixedId,offset){
  for(let i=0;i<plan.joints.length;i++){
    const j=plan.joints[i],left=i?plan.elements[i-1].id:'port-a',right=i===plan.elements.length?'port-b':plan.elements[i].id,projection=dot(offset,j.direction);
    // Each <=90° elbow (Rc > OD/2), straight pipe and measured cylindrical
    // component lies on its own side of the flat mating plane. This avoids
    // treating a capsule's spherical overhang as a real end-face collision.
    if(movingId===right&&fixedId===left&&projection>=-j.amount-1e-8)return true;
    if(movingId===left&&fixedId===right&&projection<=j.amount+1e-8)return true;
  }
  return false;
}
export function entryDirection(entry){return ENTRY_DIRECTIONS[entry.from]??unit(entry.vector);}
export function installationMotion(phase,progress=1){
  const t=Number.isFinite(progress)?Math.max(0,Math.min(1,progress)):0,travel=phase.entry.travel;
  return {progress:t,offset:mul(phase.offset,1-t),travel,moved:travel===null?null:travel*t,remaining:travel===null?null:travel*(1-t),toward:mul(entryDirection(phase.entry),-1)};
}
// Internal welds belong to the moving spool. A closure has a moving face and a
// separate stationary/target face; these must not be drawn as one floating weld.
export function installationJointMotion(plan,phase,index){
  const j=plan.joints[index],left=index?plan.elements[index-1].id:'port-a',right=index===plan.elements.length?'port-b':plan.elements[index].id;
  const moving=new Set(phase.movingIds),fixed=new Set([...phase.fixedIds,'port-a','port-b']),a=moving.has(left),b=moving.has(right);
  if(a&&b)return {type:'moving',position:mul(add(j.start,j.finish),.5)};
  if(a||b)return {type:'closing',position:a?j.start:j.finish,target:a?j.finish:j.start,targetFixed:fixed.has(a?right:left)};
  return {type:fixed.has(left)&&fixed.has(right)?'fixed':'future',position:mul(add(j.start,j.finish),.5)};
}
export function minimumEntryTravel(plan,spec,phase){
  const direction=entryDirection(spec.entries[phase.id]),bodies=installationBodies(plan,spec).filter(b=>phase.movingIds.includes(b.id));
  const min=Math.min(...bodies.flatMap(b=>b.shapes.map(s=>dot(s.support(mul(direction,-1)),direction)))),max=Math.max(...bodies.flatMap(b=>b.shapes.map(s=>dot(s.support(direction),direction))));
  return max-min+1;// separate the starting envelope from its final envelope by 1 mm
}
const status=(pending,hits)=>hits?'review':pending?'unverified':'clear';
export function jointClockFrame(axis){
  const reference=Math.abs(axis[2])<.95?[0,0,1]:[0,1,0],top=unit(sub(reference,mul(axis,dot(axis,reference)))),right=[axis[1]*top[2]-axis[2]*top[1],axis[2]*top[0]-axis[0]*top[2],axis[0]*top[1]-axis[1]*top[0]];
  return {top,right,reference:reference[2]?'+Z 上方投影':'+Y 左方投影'};
}
// Support of the convex hull of a complete 90-degree annular working sector,
// extruded along the pipe axis. It covers every clock angle, not four rays.
export function jointWorkingSector(joint,radius,reach,axialA,axialB,index){
  const lo=(index*90-45)*Math.PI/180,hi=(index*90+45)*Math.PI/180;
  return {support:v=>{
    const a=dot(v,joint.frame.top),b=dot(v,joint.frame.right),candidates=[lo,hi],angle=Math.atan2(b,a);
    for(let turn=-2;turn<=2;turn++){const t=angle+turn*Math.PI*2;if(t>=lo&&t<=hi)candidates.push(t);}
    const theta=candidates.reduce((best,t)=>a*Math.cos(t)+b*Math.sin(t)>a*Math.cos(best)+b*Math.sin(best)?t:best),m=a*Math.cos(theta)+b*Math.sin(theta),r=m>=0?radius+reach:radius,direction=add(mul(joint.frame.top,Math.cos(theta)),mul(joint.frame.right,Math.sin(theta)));
    return add(add(joint.position,mul(joint.axis,dot(v,joint.axis)>=0?axialB:-axialA)),mul(direction,r));
  }};
}
export function inspectJointAccess(plan,spec,site){
  return plan.joints.map((j,index)=>{
    const kind=j.kind??'weld',role=site.has(index)?'field':'bench',m=spec.measurements[j.id]??blankJointMeasurement(),needs=kind==='bolt'?[spec.tool.boltRadial,spec.tool.boltAxialA,spec.tool.boltAxialB]:[spec.tool.radial,spec.tool.axialA,spec.tool.axialB],available=[...m.radial,m.axialA,m.axialB],required=[...Array(4).fill(needs[0]),needs[1],needs[2]],checks=available.map((v,i)=>({available:v,required:required[i],status:v===null||required[i]===null?'unmeasured':v+1e-8<required[i]?'tight':'clear'}));
    const state=role==='bench'?(spec.benchConfirmed?'bench-confirmed':'bench-pending'):checks.some(c=>c.status==='tight')?'tight':checks.some(c=>c.status==='unmeasured')||!m.confirmed||kind==='bolt'&&!m.boltFit?'unmeasured':'clear';
    const adjacent=[plan.elements[index-1],plan.elements[index]].filter(Boolean),referenceRadius=kind==='bolt'?Math.max(plan.params.od,...adjacent.filter(e=>e.type==='component').map(e=>spec.componentOD[e.id]??plan.params.od))/2:plan.params.od/2;
    return {id:j.id,index,kind,role,referenceRadius,position:mul(add(j.start,j.finish),.5),axis:j.direction,frame:jointClockFrame(j.direction),measurement:m,checks,status:state,modelHits:[],left:index?plan.elements[index-1].id:'既有 A',right:index===plan.elements.length?'既有 B':plan.elements[index].id};
  });
}
export function analyzeInstallation(plan,value){
  if(!installationRouteKey(plan))return {valid:false,status:'unverified',message:'先選端口模式的有效接法，才能核對組立順序。'};
  let s;try{s=readInstallation(value);}catch(error){return {valid:false,status:'unverified',message:error.message};}
  const bound=s.routeKey===installationRouteKey(plan);if(!bound)s={...s,environmentConfirmed:false,benchConfirmed:false,measurements:{}};
  for(const c of plan.components??[])if(s.componentOD[c.id]!==undefined&&s.componentOD[c.id]!==null&&s.componentOD[c.id]<plan.params.od)return {valid:false,status:'unverified',message:c.id+' 最大外包直徑不能小於接管 OD。'};
  let phases;try{phases=installationPhases(plan,s);}catch(error){return {valid:false,status:'unverified',message:error.message};}
  const bodies=installationBodies(plan,s),obstacles=absoluteObstacles(plan,s),environmentPending=[];
  if(!bound)environmentPending.push('尺寸或接法已改變，需重新綁定並量測。');
  if(!s.environmentConfirmed)environmentPending.push('尚未確認搬入範圍的完整障礙物、起始位置與吊運通道。');
  for(const end of ['a','b'])if(s.portLengths[end]===null)environmentPending.push(end.toUpperCase()+' 口後方既有直管的檢查長度未量。');
  for(const c of plan.components??[])if(s.componentOD[c.id]===undefined||s.componentOD[c.id]===null)environmentPending.push(c.id+' 最大外包（含手輪／法蘭）未量。');
  if((plan.components??[]).some(c=>c.internalBolts>0)&&!s.benchConfirmed)environmentPending.push('指定零件的組內接合／預組空間尚未確認。');
  for(const o of obstacles)if(!obstacleComplete(o))environmentPending.push((o.name||o.id)+' 尺寸未填完整。');
  const selfClashes=[];for(let i=0;i<plan.elements.length;i++)for(let j=i+2;j<plan.elements.length;j++)if(bodies[i].shapes.some(a=>bodies[j].shapes.some(b=>convexClash(a,b))))selfClashes.push([bodies[i].id,bodies[j].id]);
  const evaluated=phases.map(phase=>{
    const entry=s.entries[phase.id],offset=mul(entryDirection(entry),entry.travel??0),fixed=bodies.filter(b=>phase.fixedIds.includes(b.id)||b.id.startsWith('port-')),hits=[],minimumTravel=minimumEntryTravel(plan,s,phase);
    for(const moving of bodies.filter(b=>phase.movingIds.includes(b.id))){
      const swept=moving.shapes.map(shape=>{const result=sweptShape(shape,offset);result.bounds=shapeBounds(result);return result;});
      for(const o of obstacles.filter(obstacleComplete))if(swept.some(shape=>o.type==='plane'?planeClash(shape,o.axis,o.side,o.position):convexClash(shape,boxShape(o.min,o.max))))hits.push({moving:moving.id,fixed:o.id,name:o.name||o.id,type:'obstacle'});
      for(const other of fixed){if(contactSeparated(plan,moving.id,other.id,offset))continue;if(swept.some(a=>other.shapes.some(b=>convexClash(a,b))))hits.push({moving:moving.id,fixed:other.id,name:other.id==='port-a'?'A 口既有管':other.id==='port-b'?'B 口既有管':other.id,type:'part'});}
    }
    const shortTravel=entry.travel===null||entry.travel<minimumTravel-1e-7;
    return {...phase,entry,offset,minimumTravel,shortTravel,hits,status:status(shortTravel||environmentPending.length,hits.length)};
  });
  const site=new Set(phases.flatMap(p=>p.jointIndices)),joints=inspectJointAccess(plan,s,site);
  for(const j of joints.filter(j=>j.role==='field')){
    const closure=phases.find(p=>p.jointIndices.includes(j.index));j.phaseId=closure.id;j.phaseTitle=closure.title;
    const needs=j.kind==='bolt'?[s.tool.boltRadial,s.tool.boltAxialA,s.tool.boltAxialB]:[s.tool.radial,s.tool.axialA,s.tool.axialB];if(needs.some(v=>v===null))continue;
    const adjacent=new Set([j.index?plan.elements[j.index-1].id:'port-a',j.index===plan.elements.length?'port-b':plan.elements[j.index].id]);
    for(let sector=0;sector<4;sector++){
      const shape=jointWorkingSector(j,j.referenceRadius,...needs,sector);shape.bounds=shapeBounds(shape);
      for(const o of obstacles.filter(obstacleComplete))if(o.type==='plane'?planeClash(shape,o.axis,o.side,o.position):convexClash(shape,boxShape(o.min,o.max)))j.modelHits.push({sector,id:o.id,name:o.name||o.id});
      // Adjacent curved pieces / component detail are covered by the operator's
      // full working-envelope measurements, rather than spherical end caps.
      const present=new Set([...closure.movingIds,...closure.fixedIds,'port-a','port-b']);
      for(const b of bodies.filter(b=>present.has(b.id)&&!adjacent.has(b.id)))if(b.shapes.some(other=>convexClash(shape,other)))j.modelHits.push({sector,id:b.id,name:b.id==='port-a'?'A 口既有管':b.id==='port-b'?'B 口既有管':b.id});
      if(j.modelHits.some(h=>h.sector===sector)&&j.checks[sector].status!=='tight')j.checks[sector].status='model-review';
    }
    if(j.modelHits.length&&j.status!=='tight')j.status='model-review';
  }
  const tight=joints.filter(j=>['tight','model-review'].includes(j.status)),pending=joints.filter(j=>['unmeasured','bench-pending'].includes(j.status));
  const outcome=status(environmentPending.length||evaluated.some(p=>p.status==='unverified')||pending.length,selfClashes.length||evaluated.some(p=>p.hits.length)||tight.length);
  return {valid:true,status:outcome,spec:s,phases:evaluated,joints,environmentPending,selfClashes,modelPadding:Math.max(0,...bodies.map(b=>b.padding)),scope:INSTALLATION_SCOPE,
    fieldCount:joints.filter(j=>j.role==='field').length,benchCount:joints.filter(j=>j.role==='bench').length,
    headline:outcome==='review'?'有包絡重疊或接合淨空不足':outcome==='clear'?'已輸入條件下，搬入與接合空間核對完成':'組入／接合仍有資料待核對'};
}
