// Advisory search: fixed stock angles/full or half bends, added straight lengths.
// Every returned route independently closes both fixed face centres and axes.
import {computeOffset,elbowCutStations} from './offset-geometry.js';
import {cross} from './offset-ports.js';
import {installRouteComponents,componentSlot,componentMinimum} from './offset-components.js';
const rad=n=>n*Math.PI/180,deg=n=>n*180/Math.PI;
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,k)=>a.map(v=>v*k),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=a=>Math.hypot(...a),unit=a=>mul(a,1/norm(a)),clamp=x=>Math.max(-1,Math.min(1,x));
const frameNormal=(u,v)=>unit(sub(v,mul(u,clamp(dot(u,v)))));
const bendMove=(u,v,r)=>mul(add(u,v),r*Math.tan(Math.acos(clamp(dot(u,v)))/2));
const choices=e=>[e.donor,e.donor/2];
const sameAngle=(a,b)=>Math.abs(a-b)<1e-5;
export function processClass(angle,donor){return sameAngle(angle,donor)?'full':sameAngle(angle,donor/2)?'half':'special';}
export const PROCESS_NAMES=Object.freeze({full:'原件整支使用',half:'原彎頭對半切',special:'特殊角度切除'});
export function routeSearchScope(p){
  const valid=Number.isInteger(p.planMaxJoints)&&p.planMaxJoints>=4&&p.planMaxJoints<=24&&[2,3,4].includes(p.planMaxElbows);
  return {valid,effectiveElbows:valid?Math.min(p.planMaxElbows,Math.floor(p.planMaxJoints/2)):0,
    limitedByWelds:valid&&p.planMaxJoints<2*p.planMaxElbows,
    canExpand:valid&&(p.planMaxJoints<8||p.planMaxElbows<4)};
}

function coneIntersections(u,v,a,b){
  const c=dot(u,v),den=1-c*c;if(den<1e-10)return [];
  const x=(Math.cos(rad(a))-c*Math.cos(rad(b)))/den,y=(Math.cos(rad(b))-c*Math.cos(rad(a)))/den;
  const base=add(mul(u,x),mul(v,y)),remaining=1-dot(base,base);if(remaining<-1e-8)return [];
  const n=unit(cross(u,v)),h=Math.sqrt(Math.max(0,remaining));return h<1e-7?[unit(base)]:[unit(add(base,mul(n,h))),unit(sub(base,mul(n,h)))];
}
function solveColumns(cols,D){
  if(cols.length===1){const x=dot(cols[0],D);return norm(sub(D,mul(cols[0],x)))<1e-5?[x]:null;}
  if(cols.length===2){const c=dot(cols[0],cols[1]),den=1-c*c;if(den<1e-9)return null;const a=(dot(cols[0],D)-c*dot(cols[1],D))/den,b=(dot(cols[1],D)-c*dot(cols[0],D))/den;return norm(sub(D,add(mul(cols[0],a),mul(cols[1],b))))<1e-5?[a,b]:null;}
  const det=dot(cols[0],cross(cols[1],cols[2]));if(Math.abs(det)<1e-9)return null;
  return [dot(D,cross(cols[1],cols[2]))/det,dot(cols[0],cross(D,cols[2]))/det,dot(cols[0],cross(cols[1],D))/det];
}
function combinations(n,k,start=0,prefix=[]){if(!k)return [prefix];const out=[];for(let i=start;i<=n-k;i++)out.push(...combinations(n,k-1,i+1,[...prefix,i]));return out;}
function allocateLengths(cols,D,minimum){
  const mins=Array.isArray(minimum)?minimum:cols.map(()=>minimum),remaining=cols.reduce((q,col,i)=>sub(q,mul(col,mins[i])),D),solutions=[];
  for(let count=1;count<=Math.min(3,cols.length);count++)for(const indices of combinations(cols.length,count)){
    const x=solveColumns(indices.map(i=>cols[i]),remaining);if(!x||x.some(v=>!Number.isFinite(v)||v<-1e-6))continue;
    const lengths=[...mins];indices.forEach((i,k)=>lengths[i]+=Math.max(0,x[k]));
    if(norm(sub(D,cols.reduce((q,col,i)=>add(q,mul(col,lengths[i])),[0,0,0])))>1e-5)continue;
    solutions.push(lengths);
  }
  return solutions.sort((a,b)=>a.reduce((s,v)=>s+v,0)-b.reduce((s,v)=>s+v,0))[0]??null;
}
function stockFor(context,count,extra,baseline=false){return Array.from({length:count},(_,i)=>i===0?{...context.specs[0],tangentBefore:context.params.aTangent,tangentAfter:baseline?0:context.params.planAOtherTangent}:i===count-1?{...context.specs[1],tangentBefore:baseline?0:context.params.planBOtherTangent,tangentAfter:context.params.bTangent}:{...extra,tangentBefore:context.params.planExtraInTangent,tangentAfter:context.params.planExtraOutTangent});}
function partsPattern(dirs,stocks,lead,tail){
  const parts=[];
  if(lead)parts.push({type:'pipe',direction:dirs[0],slot:0});
  for(let i=0;i<stocks.length;i++){
    const u=dirs[i],v=dirs[i+1],theta=Math.acos(clamp(dot(u,v)));if(theta<1e-7||theta>Math.PI/2+1e-7)return null;
    const stock=stocks[i],angle=deg(theta);if(angle>stock.donor+1e-5)return null;
    const process=processClass(angle,stock.donor),retain=i===stocks.length-1?'outlet':'inlet';
    parts.push({type:'elbow',...stock,index:i,angle,theta,u,v,n:frameNormal(u,v),process,retain,
      tangentBefore:retain==='outlet'&&process!=='full'?0:stock.tangentBefore,tangentAfter:retain==='inlet'&&process!=='full'?0:stock.tangentAfter});
    if(i<stocks.length-1)parts.push({type:'pipe',direction:v,slot:i+1});
  }
  if(tail)parts.push({type:'pipe',direction:dirs.at(-1),slot:stocks.length});
  return parts;
}
function gapFor(left,right,p){
  if(!left)return {amount:p.aPortGap,source:'既有 A 管口（G1）',direction:right.type==='pipe'?right.direction:right.u};
  if(!right)return {amount:p.bPortGap,source:'既有 B 管口（G4）',direction:left.type==='pipe'?left.direction:left.v};
  if(left.type==='elbow'&&left.index===0&&right.type==='pipe')return {amount:p.aGap,source:'首彎頭到直管（G2）',direction:right.direction};
  if(left.type==='pipe'&&right.type==='elbow'&&right.retain==='outlet')return {amount:p.bGap,source:'直管到末彎頭（G3）',direction:left.direction};
  return {amount:p.planExtraGap,source:'新增焊口間隙',direction:left.type==='pipe'?left.direction:left.v};
}
function routeFromParts(context,parts,lengths,original=false){
  const p=context.params,joints=Array.from({length:parts.length+1},(_,i)=>gapFor(parts[i-1],parts[i],p));
  let current=[...context.ports.a],pipeIndex=0,elbowIndex=0;
  const elements=parts.map((part,i)=>{
    joints[i]={...joints[i],id:'J'+(i+1),start:[...current],finish:add(current,mul(joints[i].direction,joints[i].amount))};current=joints[i].finish;
    const start=[...current];
    if(part.type==='pipe'){
      const length=lengths[pipeIndex++];current=add(current,mul(part.direction,length));return {...part,id:'P'+pipeIndex,start,finish:[...current],length,blankLength:length+p.trimA+p.trimB};
    }
    const arcStart=add(start,mul(part.u,part.tangentBefore)),arcFinish=add(arcStart,bendMove(part.u,part.v,part.radius));
    current=add(arcFinish,mul(part.v,part.tangentAfter));
    const e={...part,id:'E'+(++elbowIndex),end:'E'+elbowIndex,start,arcStart,arcFinish,finish:[...current],tangent:part.tangentBefore+part.tangentAfter};
    e.innerArc=(e.radius-p.od/2)*e.theta;e.centerArc=e.radius*e.theta;e.outerArc=(e.radius+p.od/2)*e.theta;
    e.kind=e.process==='full'?'factory':'cut';e.stations=e.kind==='cut'?elbowCutStations(e.radius,p.od,Math.min(e.angle,e.donor),p.stations,e.donor):[];
    return e;
  });
  const j=joints.at(-1);Object.assign(j,{id:'J'+joints.length,start:[...current],finish:add(current,mul(j.direction,j.amount))});
  const closureError=norm(sub(j.finish,context.ports.b)),axisError=deg(Math.acos(clamp(dot(elements.at(-1).type==='pipe'?elements.at(-1).direction:elements.at(-1).v,context.axes.b))));
  if(!Number.isFinite(closureError)||closureError>1e-5||axisError>1e-5)return null;
  const elbows=elements.filter(e=>e.type==='elbow'),pipes=elements.filter(e=>e.type==='pipe');
  const points=elements.flatMap(e=>{
    if(e.type==='pipe')return [e.start,e.finish];
    const fractions=[0,1];for(let k=0;k<3;k++){const beta=Math.atan2(-e.u[k],e.n[k]);for(const t of [beta,beta+Math.PI,beta-Math.PI])if(t>0&&t<e.theta)fractions.push(t/e.theta);}
    return [e.start,...fractions.map(f=>routeElbowFrame(e,f).center),e.finish];
  });points.push(context.ports.a,context.ports.b);
  const min=[0,1,2].map(k=>Math.min(...points.map(q=>q[k]))),max=[0,1,2].map(k=>Math.max(...points.map(q=>q[k])));
  const excursions=[0,1,2].map(k=>Math.max(0,Math.min(context.ports.a[k],context.ports.b[k])-min[k],max[k]-Math.max(context.ports.a[k],context.ports.b[k])));
  const route={valid:true,context,params:p,elements,elbows,pipes,joints,jointCount:joints.length,closureError,axisError,original,
    specialCuts:elbows.filter(e=>e.process==='special').length,halfCuts:elbows.filter(e=>e.process==='half').length,
    envelope:{min,max,excursions,maxExcursion:Math.max(...excursions),size:min.map((v,k)=>max[k]-v+p.od)},
    totalPipe:pipes.reduce((s,e)=>s+e.length,0),totalLength:pipes.reduce((s,e)=>s+e.length,0)+elbows.reduce((s,e)=>s+e.centerArc+e.tangent,0),
    key:elements.map(e=>e.type==='pipe'?`P${e.length.toFixed(3)}:${e.direction.map(v=>v.toFixed(4))}`:`E${e.angle.toFixed(4)}:${e.radius}:${e.u.map(v=>v.toFixed(4))}:${e.v.map(v=>v.toFixed(4))}`).join('|')};
  return route;
}
function tryRoute(context,dirs,stocks,lead,tail,minimum){
  const parts=partsPattern(dirs,stocks,lead,tail);if(!parts)return null;
  if(!context.params.components.length&&parts.length+1>context.params.planMaxJoints)return null;
  const gaps=Array.from({length:parts.length+1},(_,i)=>gapFor(parts[i-1],parts[i],context.params));
  const fixed=parts.filter(e=>e.type==='elbow').reduce((q,e)=>add(q,add(bendMove(e.u,e.v,e.radius),add(mul(e.u,e.tangentBefore),mul(e.v,e.tangentAfter)))),gaps.reduce((q,g)=>add(q,mul(g.direction,g.amount)),[0,0,0]));
  const pipes=parts.filter(e=>e.type==='pipe');
  if(context.params.components.some(c=>!['a','b'].includes(c.target)&&componentSlot(c,stocks.length)>=stocks.length||!pipes.some(e=>e.slot===componentSlot(c,stocks.length))))return null;
  const mins=pipes.map(e=>{const c=context.params.components.find(c=>componentSlot(c,stocks.length)===e.slot);return c?componentMinimum(c,minimum,c.target==='a'?context.params.aPortGap:c.target==='b'?context.params.bPortGap:0):minimum;});
  const cols=pipes.map(e=>e.direction),lengths=allocateLengths(cols,sub(context.delta,fixed),mins);if(!lengths)return null;
  return routeFromParts(context,parts,lengths);
}
export function routeElbowFrame(e,fraction){
  const t=e.theta*fraction,center=add(e.arcStart,add(mul(e.u,e.radius*Math.sin(t)),mul(e.n,e.radius*(1-Math.cos(t))))),tangent=add(mul(e.u,Math.cos(t)),mul(e.n,Math.sin(t))),outside=sub(mul(e.u,Math.sin(t)),mul(e.n,Math.cos(t)));
  return {center,tangent,outside,side:cross(tangent,outside)};
}
export function retainedRouteFrame(e){const f=routeElbowFrame(e,e.retain==='outlet'?1:0);return e.retain==='outlet'?{...f,tangent:mul(f.tangent,-1),outside:f.outside,side:mul(f.side,-1)}:f;}

// A UI view of the already validated original assembly; comparison options do not alter it.
export function originalRoutePlan(result){
  if(!result?.valid||result.basis!=='ports')return null;
  const context=result.context,stocks=stockFor(context,2,{},true),parts=partsPattern([context.axes.a,result.direction,context.axes.b],stocks,false,false);
  const plan=parts?routeFromParts(context,parts,[result.cutLength],true):null;
  return plan?installRouteComponents({...plan,id:'original'}):null;
}

export function compareRoutePlans(raw){
  const original=computeOffset(raw),p=original.params,errors=[],issues=[],error=(field,message)=>{errors.push(message);issues.push({field,message});};
  if(p.basis!=='ports')return {valid:false,errors:['端口模式才能比較替代組立方案。'],plans:[]};
  if(!original.context)return {valid:false,errors:original.errors.map(e=>e.message),plans:[]};
  if(!['welds','easy','compact'].includes(p.planPreference))error('planPreference','請選焊口少、加工容易或佔用空間小。');
  if(![2,3,4].includes(p.planMaxElbows))error('planMaxElbows','建議搜尋上限為 2／3／4 個彎頭。');
  if(!Number.isInteger(p.planMaxJoints)||p.planMaxJoints<4||p.planMaxJoints>24)error('planMaxJoints','焊口上限須為 4–24 個。');
  for(const key of ['planMinPipe','planExtraGap','planMargin','planAOtherTangent','planBOtherTangent','planExtraInTangent','planExtraOutTangent'])if(typeof p[key]!=='number'||!Number.isFinite(p[key])||p[key]<0||p[key]>1e6)error(key,'建議管段、間隙、空間及原件直段須為 0–1000000 mm。');
  if(typeof p.planExtraRadius!=='number'||!Number.isFinite(p.planExtraRadius)||p.planExtraRadius<=p.od/2||p.planExtraRadius>1e6)error('planExtraRadius','新增彎頭 Rc 須大於 OD／2，且不超過 1000000 mm。');
  if(typeof p.planExtraDonor!=='number'||!Number.isFinite(p.planExtraDonor)||p.planExtraDonor<=0||p.planExtraDonor>90)error('planExtraDonor','新增原件角度須大於 0 且不超過 90°。');
  if(!['none','margin'].includes(p.planSpaceLimit))error('planSpaceLimit','請選是否限制繞出範圍。');
  if(errors.length)return {valid:false,errors,issues,plans:[]};
  const context=original.context,{a:u,b:v}=context.axes,extra={radius:p.planExtraRadius,donor:p.planExtraDonor,kind:'cut'},minimum=Math.max(p.minStraight,p.planMinPipe,1e-4),found=new Map();let filteredSpace=0,requiredJoints=null;
  const accept=raw=>{if(!raw)return;const plan=installRouteComponents(raw,p.components,raw.original?p.minStraight:minimum);if(!plan?.valid)return;if(!plan.original&&p.planSpaceLimit==='margin'&&plan.envelope.maxExcursion>p.planMargin+1e-5){filteredSpace++;return;}if(!plan.original&&plan.jointCount>p.planMaxJoints){requiredJoints=requiredJoints===null?plan.jointCount:Math.min(requiredJoints,plan.jointCount);return;}if(!found.has(plan.key))found.set(plan.key,plan);};
  if(original.valid){const stocks=stockFor(context,2,extra,true),parts=partsPattern([u,original.direction,v],stocks,false,false);if(parts)accept(routeFromParts(context,parts,[original.cutLength],true));}
  const test=(dirs,stocks)=>{for(const [lead,tail]of [[false,false],[true,false],[false,true],[true,true]])accept(tryRoute(context,dirs,stocks,lead,tail,minimum));};
  const c=dot(u,v),transverse=sub(context.delta,mul(u,dot(u,context.delta)));
  const planeSeeds=[];
  if(norm(transverse)>1e-7)planeSeeds.push(unit(transverse));
  if(Math.abs(c)<1-1e-8)planeSeeds.push(unit(sub(v,mul(u,c))));
  if(!planeSeeds.length)planeSeeds.push(unit(cross(u,Math.abs(u[2])<.9?[0,0,1]:[0,1,0])));
  for(const count of [2,3,4]){
    if(count>p.planMaxElbows||count*2>p.planMaxJoints)continue;
    const stocks=stockFor(context,count,extra),patterns=[];
    const make=(i,angles)=>{if(i===count){patterns.push(angles);return;}for(const a of choices(stocks[i]))make(i+1,[...angles,a]);};make(0,[]);
    for(const n of planeSeeds)for(const angles of patterns)for(let mask=0;mask<(1<<count);mask++){
      let phi=0;const dirs=[u];for(let i=0;i<count;i++){phi+=(mask&(1<<i)?1:-1)*rad(angles[i]);dirs.push(add(mul(u,Math.cos(phi)),mul(n,Math.sin(phi))));}
      if(norm(sub(dirs.at(-1),v))<1e-6)test(dirs,stocks);
    }
    if(count===2&&Math.abs(c)<1-1e-8)for(const a of choices(stocks[0]))for(const b of choices(stocks[1]))for(const w of coneIntersections(u,v,a,b))test([u,w,v],stocks);
    if(count===3){
      const reference=planeSeeds[0],side=unit(cross(u,reference));
      for(const a of choices(stocks[0]))for(const b of choices(stocks[1]))for(const last of choices(stocks[2]))for(let clock=0;clock<360;clock+=15){
        const n=add(mul(reference,Math.cos(rad(clock))),mul(side,Math.sin(rad(clock)))),w1=add(mul(u,Math.cos(rad(a))),mul(n,Math.sin(rad(a))));
        for(const w2 of coneIntersections(w1,v,b,last))test([u,w1,w2,v],stocks);
      }
    }
  }
  const tuple=plan=>p.planPreference==='easy'?[plan.specialCuts,plan.halfCuts,plan.jointCount,plan.envelope.maxExcursion,plan.totalLength]:p.planPreference==='compact'?[plan.envelope.maxExcursion,plan.jointCount,plan.specialCuts,plan.totalLength]:[plan.jointCount,plan.specialCuts,plan.envelope.maxExcursion,plan.totalLength,plan.halfCuts];
  const all=[...found.values()].sort((a,b)=>{const aa=tuple(a),bb=tuple(b);for(let i=0;i<aa.length;i++)if(Math.abs(aa[i]-bb[i])>1e-6)return aa[i]-bb[i];return 0;}),plans=[];
  // Keep materially distinct process/weld/space choices, rather than dozens of clocks.
  const reference=all.find(p=>p.original);if(reference)plans.push({...reference,id:'R1'});
  const families=new Set();for(const plan of all){if(plan.original)continue;const key=[plan.jointCount,plan.elbows.map(e=>`${e.angle.toFixed(3)}:${e.process}`).join('-'),Math.round(plan.envelope.maxExcursion/25),plan.elements[0].type,plan.elements.at(-1).type].join('|');if(families.has(key))continue;families.add(key);plans.push({...plan,id:'R'+(plans.length+1)});if(plans.length>=8)break;}
  return {valid:true,errors:[],context,original,plans,candidateCount:found.size,filteredSpace,minimum,requiredJoints,
    limitation:'建議搜尋整支／對半原件，最多四彎頭；三彎頭另取每 15° 的首端轉向候選，四彎頭限同彎曲平面。沒有遍歷所有路徑，也沒有檢查現場障礙或材料自相交。'};
}
