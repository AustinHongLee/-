/** End-parallel constraints for an ideal finite circular elbow.
 * Offset coordinates lie in the selected A/B end plane: elbowOffset is
 * positive toward the extrados; elbowSideOffset is positive along global Z.
 * In edge mode those coordinates specify a direction only. The distance is
 * recomputed from the outside radii, keeping the two same-side outlines flush.
 */
export const ELBOW_ALIGNMENT_MODES=Object.freeze(['free','a-axis','b-axis','a-offset','b-offset','a-edge','b-edge']);
const rad=d=>d*Math.PI/180,deg=r=>r*180/Math.PI;
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const mul=(a,k)=>a.map(v=>v*k);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const format=v=>Number.isFinite(v)?Number(v.toFixed(2)).toString():'—';

function alignmentData(params){
  const mode=params.elbowAlignment??'free';
  if(!ELBOW_ALIGNMENT_MODES.includes(mode)||mode==='free')return null;
  const end=mode.startsWith('a-')?'A':'B',g=rad(Number(params.bendAngle)),R=Number(params.bendRadius),
    center=end==='A'?[0,0,0]:[R*Math.sin(g),R*(1-Math.cos(g)),0],
    normal=end==='A'?[0,-1,0]:[Math.sin(g),-Math.cos(g),0],
    direction=end==='A'?[1,0,0]:[-Math.cos(g),-Math.sin(g),0];
  let offset=0,sideOffset=0;
  if(!mode.endsWith('-axis')){
    offset=Number(params.elbowOffset??0);sideOffset=Number(params.elbowSideOffset??0);
    if(mode.endsWith('-edge')){
      const distance=(Number(params.mainOD)-Number(params.branchOD))/2,length=Math.hypot(offset,sideOffset);
      if(!Number.isFinite(distance)||distance<0||!Number.isFinite(length))offset=sideOffset=NaN;
      else if(length===0){offset=distance;sideOffset=0;}
      else{offset=distance*(offset/length);sideOffset=distance*(sideOffset/length);}
    }
  }
  const offsetVector=add(mul(normal,offset),[0,0,sideOffset]);
  return {end,center,origin:add(center,offsetVector),direction,normal,offsetVector,
    offsetDistance:Math.hypot(offset,sideOffset),offset,sideOffset};
}

export function resolveElbowAlignment(params){
  const p={...params},mode=p.elbowAlignment??'free';
  if(mode==='free')return p;
  if(!ELBOW_ALIGNMENT_MODES.includes(mode))return p;
  const R=Number(p.bendRadius),r=Number(p.mainOD)/2,gamma=Number(p.bendAngle);
  // Keep the established coaxial arithmetic unchanged.
  if(mode.endsWith('-axis')){
    const delta=deg(Math.atan2(Math.sqrt(2*R*r+r*r),R));
    return {...p,bendPosition:mode==='b-axis'?gamma-delta:delta,surfaceClock:0,
      angle:mode==='b-axis'?180-delta:delta,branchSwivel:0};
  }
  const ref=alignmentData(p),z=ref.sideOffset,h2=(r-z)*(r+z),base=R+ref.offset,
    h=Math.sqrt(h2),rho=R+h,t2=(rho-base)*(rho+base),distance=Math.sqrt(t2);
  // No root is moved into the finite elbow. NaN rejects misses/tangencies,
  // while an out-of-range beta remains out of range for the core validator.
  if(![R,r,ref.offset,z].every(Number.isFinite)||R<=0||r<=0||h2<=0||t2<=0)
    return {...p,bendPosition:NaN,surfaceClock:NaN,angle:NaN,branchSwivel:NaN};
  const delta=Math.atan2(distance,base),beta=ref.end==='A'?delta:rad(gamma)-delta,
    phi=Math.atan2(z,h),tangent=[Math.cos(beta),Math.sin(beta),0],
    normal=[Math.sin(beta),-Math.cos(beta),0],m=add(mul(normal,Math.cos(phi)),[0,0,Math.sin(phi)]),
    k=add(mul(normal,-Math.sin(phi)),[0,0,Math.cos(phi)]),
    angle=Math.acos(Math.max(-1,Math.min(1,dot(ref.direction,tangent)))),
    swivel=Math.atan2(dot(ref.direction,k),dot(ref.direction,m));
  return {...p,bendPosition:deg(beta),surfaceClock:deg(phi),angle:deg(angle),branchSwivel:deg(swivel)};
}
export function elbowAlignmentReference(params){
  // center is the original port center; origin is the constrained parallel
  // branch-axis reference. They coincide only in coaxial/zero-offset modes.
  return alignmentData(params);
}
export function elbowAlignmentLabel(p){
  const ref=alignmentData(p),mode=p.elbowAlignment??'free';
  if(!ref)return '自行定位與定向';
  if(mode.endsWith('-axis'))return `${ref.end} 端中心線同軸延伸`;
  const components=`外背 ${format(ref.offset)}／側向 ${format(ref.sideOffset)} mm`;
  return mode.endsWith('-edge')?`${ref.end} 端同側外輪廓齊線（${components}）`:
    `${ref.end} 端平行偏移（${components}）`;
}
