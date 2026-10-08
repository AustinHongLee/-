// Inverse two-elbow assembly from fixed port-face centres and outward port axes.
// Ideal circular elbows only. All gaps are along the respective mating axes.
const rad=n=>n*Math.PI/180,deg=n=>n*180/Math.PI,finite=Number.isFinite;
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,k)=>a.map(v=>v*k);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),length=a=>Math.hypot(...a);
const unit=a=>mul(a,1/length(a)),clamp=x=>Math.max(-1,Math.min(1,x));
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const AXIS_OPTIONS=Object.freeze({'x+':[1,0,0],'x-':[-1,0,0],'y+':[0,1,0],'y-':[0,-1,0],'z+':[0,0,1],'z-':[0,0,-1]});
export function portAxis(p,end){return p[end+'Axis']==='custom'?unit(['X','Y','Z'].map(k=>p[end+'Axis'+k])):AXIS_OPTIONS[p[end+'Axis']];}
const elbowDisplacement=(u,n,r,t)=>add(mul(u,r*Math.sin(t)),mul(n,r*(1-Math.cos(t))));

function solveTangents(D,u,v,specs){
  // Unknown tangent takeouts a,b; w is the line joining their virtual intersections.
  const scale=Math.max(length(D),...specs.map(e=>e.radius),1),tol=Math.max(1e-8,scale*1e-10);
  const evaluate=(a,b)=>{
    const q=sub(sub(D,mul(u,a)),mul(v,b)),travel=length(q);if(travel<1e-10)return null;
    const w=mul(q,1/travel),angles=[Math.acos(clamp(dot(u,w))),Math.acos(clamp(dot(w,v)))];
    const targets=specs.map((e,i)=>e.kind==='factory'?e.takeout:e.radius*Math.tan(angles[i]/2));
    if(!targets.every(finite))return null;
    return {f:[targets[0]-a,targets[1]-b],angles,w,travel,a,b};
  };
  const roots=[],seedAngles=[1,3,5,10,15,22.5,30,40,50,60,70,80,85,89].map(d=>Math.tan(rad(d)/2));
  // Legacy common factors first, then independent per-elbow seeds: an S-curve with two very
  // different bends (e.g. 5° + 15°) is missed when both takeouts start from the same factor.
  const seeds=[...[0,.25,.6,1,2,5].map(f=>[f,f]),...seedAngles.flatMap(x=>seedAngles.map(y=>[x,y]))];
  for(const [fa,fb] of seeds){
    let a=specs[0].kind==='factory'?specs[0].takeout:specs[0].radius*fa,b=specs[1].kind==='factory'?specs[1].takeout:specs[1].radius*fb;
    for(let iteration=0;iteration<70;iteration++){
      const e=evaluate(a,b);if(!e)break;const norm=length(e.f);
      if(norm<tol){if(!roots.some(r=>length(sub(r.w,e.w))<1e-7))roots.push(e);break;}
      const h=Math.max(1e-5,scale*1e-6),ea=evaluate(a+h,b),eb=evaluate(a,b+h);if(!ea||!eb)break;
      const j00=(ea.f[0]-e.f[0])/h,j10=(ea.f[1]-e.f[1])/h,j01=(eb.f[0]-e.f[0])/h,j11=(eb.f[1]-e.f[1])/h,det=j00*j11-j01*j10;if(Math.abs(det)<1e-14)break;
      const da=(-e.f[0]*j11+e.f[1]*j01)/det,db=(-e.f[1]*j00+e.f[0]*j10)/det;
      let accepted=false;
      for(let step=1;step>1/4096;step/=2){const na=a+step*da,nb=b+step*db;if(na<0||nb<0||na>scale*100||nb>scale*100)continue;const ne=evaluate(na,nb);if(ne&&length(ne.f)<norm){a=na;b=nb;accepted=true;break;}}
      if(!accepted)break;
    }
  }
  return roots.sort((a,b)=>a.angles[0]+a.angles[1]-b.angles[0]-b.angles[1]);
}

export function computePortOffset(p,cutStations){
  let context=null;
  const errors=[],error=(field,message,details={})=>errors.push({field,message,...details}),invalid=()=>({valid:false,params:p,errors,...(context?{context}:{})});
  if(!['planar','rolling'].includes(p.layout))error('layout','請選平面或立體偏移。');
  if(!['center','marks'].includes(p.datum))error('datum','請選端面中心或量測標記點。');
  if(![4,8,12,24].includes(p.stations))error('stations','請選 4／8／12／24 分點。');
  if(!finite(p.od)||typeof p.od!=='number'||p.od<=0||p.od>10000)error('od','實際外徑須為 0–10000 mm 之間的正值。');
  for(const key of ['run','rise',...(p.layout==='rolling'?['roll']:[])])if(typeof p[key]!=='number'||!finite(p[key])||Math.abs(p[key])>1e7)error(key,'X／Y／Z 必須是有限尺寸，絕對值不超過 10000000 mm。');
  if(p.datum==='marks')for(const end of ['a','b'])for(const k of ['X','Y','Z'])if(typeof p[end+'Shift'+k]!=='number'||!finite(p[end+'Shift'+k])||Math.abs(p[end+'Shift'+k])>1e7)error(end+'Shift'+k,'量測點到端面中心的修正量必須是有限尺寸。');
  // A factory elbow has no separate kept-end straight (its Ta reaches the mating face); the hidden field is not validated.
  for(const key of ['aPortGap','bPortGap','aGap','bGap','aTangent','bTangent','trimA','trimB','minStraight'])if(!(key==='aTangent'&&p.aKind==='factory'||key==='bTangent'&&p.bKind==='factory'))if(typeof p[key]!=='number'||!finite(p[key])||p[key]<0||p[key]>1e6)error(key,'焊口間隙、保留端直段、修磨留料與最短管段須為 0–1000000 mm，空白不代表 0。');
  const specs=[];
  for(const end of ['a','b']){
    const label=end.toUpperCase(),axis=p[end+'Axis'];
    if(!Object.hasOwn(AXIS_OPTIONS,axis)&&axis!=='custom')error(end+'Axis',`${label} 端請選管口朝向。`);
    if(axis==='custom'){const vec=['X','Y','Z'].map(k=>p[end+'Axis'+k]);if(!vec.every(n=>typeof n==='number'&&finite(n)&&Math.abs(n)<=1e7)||length(vec)<1e-8)error(end+'AxisX',`${label} 端方向向量不能空白、非有限或全部為 0。`);}
    const kind=p[end+'Kind'];let radius=p[end+'Radius'],takeout=p[end+'Takeout'];
    if(!['cut','factory'].includes(kind))error(end+'Kind',`${label} 端請選現成或切角彎頭。`);
    if(kind==='cut'){
      const donor=p[end+'Donor'];if(typeof donor!=='number'||!finite(donor)||donor<=0||donor>90)error(end+'Donor',`${label} 端原彎頭角度須大於 0 且不超過 90°。`);
      const method=p[end+'RadiusMethod'];
      if(!['radius','outerArc','innerArc'].includes(method))error(end+'RadiusMethod',`${label} 端請選半徑的取得方式。`);
      if(method!=='radius'){
        const arc=p[end+'MeasuredArc'];if(typeof arc!=='number'||!finite(arc)||arc<=0||arc>1e7)error(end+'MeasuredArc',`${label} 端原件完整弧長須為正值，且不包含端部直段。`);
        radius=arc/rad(donor)+(method==='outerArc'?-p.od/2:p.od/2);
      }
      if(typeof radius!=='number'||!finite(radius)||radius<=p.od/2||radius>1e6)error(method==='radius'?end+'Radius':end+'MeasuredArc',`${label} 端 Rc 必須大於 OD／2，且不超過 1000000 mm。`);
    }else{
      const angle=p[end+'FactoryAngle'];
      if(typeof angle!=='number'||!finite(angle)||angle<=0||angle>90)error(end+'FactoryAngle',`${label} 端現成彎頭角度須大於 0 且不超過 90°。`);
      if(typeof takeout!=='number'||!finite(takeout)||takeout<=0||takeout>1e6)error(end+'Takeout',`${label} 端須填實測／型錄扣除量。`);
      radius=takeout/Math.tan(rad(angle)/2);
      if(radius<=p.od/2)error(end+'Takeout',`${label} 端扣除量所對應的圓弧半徑小於 OD／2，無法預覽。`);
    }
    specs.push({end:label,kind,radius,takeout,donor:kind==='factory'?p[end+'FactoryAngle']:p[end+'Donor'],gap:p[end+'Gap'],portGap:p[end+'PortGap'],tangent:kind==='factory'?0:p[end+'Tangent']});
  }
  if(errors.length)return invalid();
  const measured=[p.run,p.layout==='rolling'?p.roll:0,p.rise],shift=end=>p.datum==='marks'?['X','Y','Z'].map(k=>p[end+'Shift'+k]):[0,0,0];
  const ports={a:shift('a'),b:add(measured,shift('b'))},delta=sub(ports.b,ports.a),u=portAxis(p,'a'),v=mul(portAxis(p,'b'),-1);
  const start=add(ports.a,mul(u,p.aPortGap+specs[0].tangent)),finish=sub(ports.b,mul(v,p.bPortGap+specs[1].tangent)),D=sub(finish,start);
  context={params:p,ports,delta,measured,axes:{a:u,b:v},specs};
  const roots=solveTangents(D,u,v,specs),positive=roots.filter(e=>e.travel-e.a-e.b-p.aGap-p.bGap>1e-6);
  const solution=positive.find(e=>e.angles.every(t=>t>1e-7&&t<=Math.PI/2+1e-8))??positive[0];
  if(!solution){error('run','目前的端口位置、方向與彎頭半徑找不到正長度直管的兩彎頭接法。可改端口方向、半徑或增加接頭；此結果不能用強拉補足。',{code:'route-unavailable'});return invalid();}
  const {w,angles,travel,a:Ta,b:Tb}=solution,elbows={};
  for(let i=0;i<2;i++){
    const end=i?'b':'a',e=specs[i],theta=angles[i],angle=deg(theta),takeout=i?Tb:Ta;
    if(angle<1e-5)error(end+'Axis',`${e.end} 端幾乎不需彎頭，請改成直管接法；本工具要求兩個彎頭。`,{code:'straight-end',requiredAngle:angle});
    if(angle>90+1e-6)error(end+'Axis',`${e.end} 端需要 ${angle.toFixed(4)}°，超出本版單個彎頭最大 90°。`,{code:'angle-limit',requiredAngle:angle});
    if(e.kind==='cut'&&angle<=90+1e-6&&angle>e.donor+1e-7)error(end+'Donor',`${e.end} 端需要 ${angle.toFixed(4)}°，手邊 ${e.donor}° 彎頭不足，請換料或改接法。`,{code:'stock-angle',requiredAngle:angle,availableAngle:e.donor});
    if(e.kind==='factory'&&angle<=90+1e-6&&Math.abs(angle-p[end+'FactoryAngle'])>1e-5)error(end+'FactoryAngle',`${e.end} 端所需 ${angle.toFixed(4)}° 與現成件不符，請改用切角彎頭或核對端口位置。`,{code:'fixed-angle',requiredAngle:angle,availableAngle:p[end+'FactoryAngle']});
    const n=unit(sub(w,mul(i?v:u,Math.cos(theta))));
    const stations=e.kind==='cut'&&angle>1e-5&&angle<=e.donor+1e-7&&angle<=90+1e-7?cutStations(e.radius,p.od,Math.min(angle,e.donor,90),p.stations,e.donor):[];
    elbows[end]={...e,takeout,theta,angle,stations,n,innerArc:(e.radius-p.od/2)*theta,centerArc:e.radius*theta,outerArc:(e.radius+p.od/2)*theta};
  }
  const faceDistance=travel-Ta-Tb,cutLength=faceDistance-p.aGap-p.bGap;
  if(cutLength<p.minStraight)error('minStraight',`直管僅 ${cutLength.toFixed(2)} mm，小於指定最短焊接管段 ${p.minStraight} mm。請改半徑／配置。`,{code:'short-pipe',cutLength,minimum:p.minStraight});
  if(!finite(travel)||travel>1e9)error('run','組立尺寸過大，請核對量測單位。');
  if(errors.length)return invalid();
  const r={valid:true,params:p,errors,context,basis:'ports',ports,measured,delta,start,finish,axes:{a:u,b:v},direction:w,elbows,travel,faceDistance,cutLength,blankLength:cutLength+p.trimA+p.trimB,
    angle:deg(angles[0]),theta:angles[0],run:delta[0],roll:delta[1],rise:delta[2],offset:length(sub(delta,mul(u,dot(u,delta)))),rollAngle:deg(Math.atan2(delta[1],delta[2])),
    plane:elbows.a.n,intersections:{a:add(start,mul(u,Ta)),b:sub(finish,mul(v,Tb))},solutionCount:positive.length};
  const endpoint=add(add(add(start,elbowDisplacement(u,elbows.a.n,elbows.a.radius,angles[0])),mul(w,cutLength+p.aGap+p.bGap)),elbowDisplacement(w,unit(sub(v,mul(w,Math.cos(angles[1])))),elbows.b.radius,angles[1]));
  r.closureError=length(sub(endpoint,finish));
  if(!finite(r.closureError)||r.closureError>Math.max(1e-5,length(D)*1e-9)){error('run','端口閉合檢查失敗，無法產生加工單。',{code:'closure'});return invalid();}
  return r;
}

export function portCenterline(r,end,fraction){
  const e=r.elbows[end],t=e.theta*(end==='a'?fraction:1-fraction);
  if(end==='a')return add(r.start,elbowDisplacement(r.axes.a,e.n,e.radius,t));
  return sub(r.finish,elbowDisplacement(r.axes.b,e.n,e.radius,t));
}
export function portSurfaceFrame(r,end,fraction){
  const e=r.elbows[end],beta=e.theta*(end==='a'?fraction:1-fraction),u=r.axes[end];
  const tangent=add(mul(u,Math.cos(beta)),mul(e.n,Math.sin(beta))),outside=mul(sub(mul(u,Math.sin(beta)),mul(e.n,Math.cos(beta))),end==='a'?1:-1);
  return {center:portCenterline(r,end,fraction),tangent,outside,side:mul(cross(tangent,outside),end==='a'?1:-1)};
}

// Compare rigid fabricated pieces with the planned endpoint; never an allowable pull.
export function compareOffsetFit(r,aAngle,bAngle,straight){
  if(!r?.valid||r.basis!=='ports')return {valid:false,message:'試組比較需使用端口量測模式。'};
  if(![aAngle,bAngle,straight].every(n=>typeof n==='number'&&finite(n))||aAngle<=0||bAngle<=0||aAngle>90||bAngle>90||straight<=0)return {valid:false,message:'試組角度須大於 0 且不超過 90°，直管須為正長度。'};
  for(const [end,angle]of [['a',aAngle],['b',bAngle]])if(r.elbows[end].kind==='cut'&&angle>r.elbows[end].donor+1e-7)return {valid:false,message:`${end.toUpperCase()} 試組角度超過手邊原件角度。`};
  const ta=rad(aAngle),tb=rad(bAngle),eA=r.elbows.a,eB=r.elbows.b,u=r.axes.a;
  const w=add(mul(u,Math.cos(ta)),mul(eA.n,Math.sin(ta))),normalB=unit(cross(r.direction,r.axes.b));
  // Preserve the planned inter-elbow clocking by transporting B's bend normal.
  const rotate=(vec,axis,t)=>add(add(mul(vec,Math.cos(t)),mul(cross(axis,vec),Math.sin(t))),mul(axis,dot(axis,vec)*(1-Math.cos(t))));
  const normalA=unit(cross(u,eA.n)),transported=rotate(normalB,normalA,ta-eA.theta),towardB=unit(cross(transported,w));
  const exitAxis=add(mul(w,Math.cos(tb)),mul(towardB,Math.sin(tb)));
  const end=add(add(add(add(r.ports.a,mul(u,r.params.aPortGap+eA.tangent)),elbowDisplacement(u,eA.n,eA.radius,ta)),mul(w,straight+eA.gap+eB.gap)),add(elbowDisplacement(w,towardB,eB.radius,tb),mul(exitAxis,r.params.bPortGap+eB.tangent)));
  const mismatch=sub(end,r.ports.b);
  return {valid:true,endpoint:end,mismatch,distance:length(mismatch),axisMismatch:deg(Math.acos(clamp(dot(exitAxis,r.axes.b)))),aAngle,bAngle,straight};
}
