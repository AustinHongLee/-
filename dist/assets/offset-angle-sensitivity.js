const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,k)=>a.map(x=>x*k),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>Math.hypot(...a);
const rotate=(v,axis,t)=>add(add(mul(v,Math.cos(t)),mul(cross(axis,v),Math.sin(t))),mul(axis,dot(axis,v)*(1-Math.cos(t))));
const apply=(matrix,v)=>matrix.reduce((out,col,i)=>add(out,mul(col,v[i])),[0,0,0]);

// Forward assembly of rigid parts, transporting every subsequent part, joint gap
// and component after each perturbed elbow. No inverse re-fit hides the error.
export function perturbedRouteEndpoint(plan,errors){
  if(!plan?.valid||!plan.context?.ports||!Array.isArray(plan.elements)||!plan.elements.length)return {valid:false,message:'先選一個已通過端口閉合檢查的接法。'};
  if(!Array.isArray(errors)||errors.length!==plan.elbows.length||errors.some(x=>!Number.isFinite(x)||Math.abs(x)>5))return {valid:false,message:'每個彎頭的角度偏差須在 ±5° 內。'};
  let matrix=[[1,0,0],[0,1,0],[0,0,1]],position=[...plan.context.ports.a],previous=plan.context.ports.a,index=0;
  for(const element of plan.elements){
    position=add(position,apply(matrix,sub(element.start,previous)));
    if(element.type==='elbow'){
      const delta=errors[index++]*Math.PI/180,theta=element.theta+delta;
      if(!(theta>0&&theta<Math.PI))return {valid:false,message:'試算角度跨過 0° 或 180°，超出這項敏感度試算。'};
      const axis=cross(element.u,element.n),exit=add(mul(element.u,Math.cos(theta)),mul(element.n,Math.sin(theta)));
      const displacement=add(add(mul(element.u,(element.tangentBefore??0)+element.radius*Math.sin(theta)),mul(element.n,element.radius*(1-Math.cos(theta)))),mul(exit,element.tangentAfter??0));
      position=add(position,apply(matrix,displacement));
      const before=matrix;matrix=[[1,0,0],[0,1,0],[0,0,1]].map(v=>apply(before,rotate(v,axis,delta)));
    }else position=add(position,apply(matrix,sub(element.finish,element.start)));
    previous=element.finish;
  }
  position=add(position,apply(matrix,sub(plan.context.ports.b,previous)));
  const mismatch=sub(position,plan.context.ports.b),axis=apply(matrix,plan.context.axes.b),axisMismatch=Math.acos(Math.max(-1,Math.min(1,dot(axis,plan.context.axes.b))))*180/Math.PI;
  return {valid:true,endpoint:position,mismatch,distance:norm(mismatch),axisMismatch,errors:[...errors]};
}
export function routeAngleSensitivity(plan,deviation){
  if(typeof deviation!=='number'||!Number.isFinite(deviation)||deviation<=0||deviation>5)return {valid:false,message:'試算角度偏差須大於 0 且不超過 5°。'};
  const n=plan?.elbows?.length;if(!n||n<2||n>4)return {valid:false,message:'先選一個 2～4 彎頭的端口接法。'};
  const baseline=perturbedRouteEndpoint(plan,Array(n).fill(0));
  if(!baseline.valid)return baseline;
  if(baseline.distance>1e-4||baseline.axisMismatch>1e-4)return {valid:false,message:'目前接法無法重建相同端口，這項試算暫不提供。'};
  const scenarios=Array.from({length:2**n},(_,mask)=>perturbedRouteEndpoint(plan,Array.from({length:n},(_,i)=>(mask&(1<<i)?1:-1)*deviation)));
  if(scenarios.some(s=>!s.valid))return scenarios.find(s=>!s.valid);
  const maximum=scenarios.reduce((a,b)=>b.distance>a.distance?b:a);
  return {valid:true,deviation,baseline,scenarios,maximum,
    scope:`逐一試算 ${scenarios.length} 組各彎頭 ±${deviation}° 的端點組合；直管、間隙、零件長度及原轉向固定。不是完整連續誤差上界，也不是可強拉的距離。`};
}
