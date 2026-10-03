/** End-axis extension constraints for an ideal finite circular elbow. */
export function resolveElbowAlignment(params){
  const p={...params},mode=p.elbowAlignment??'free';
  if(mode==='free')return p;
  if(!['a-axis','b-axis'].includes(mode))return p;
  const R=Number(p.bendRadius),r=Number(p.mainOD)/2,gamma=Number(p.bendAngle);
  const delta=Math.atan2(Math.sqrt(2*R*r+r*r),R)*180/Math.PI;
  return {...p,bendPosition:mode==='b-axis'?gamma-delta:delta,surfaceClock:0,
    angle:mode==='b-axis'?180-delta:delta,branchSwivel:0};
}
export function elbowAlignmentReference(params){
  const mode=params.elbowAlignment??'free';if(mode==='free')return null;
  const g=Number(params.bendAngle)*Math.PI/180,R=Number(params.bendRadius);
  return mode==='a-axis'?{end:'A',center:[0,0,0],direction:[1,0,0]}:
    {end:'B',center:[R*Math.sin(g),R*(1-Math.cos(g)),0],direction:[-Math.cos(g),-Math.sin(g),0]};
}
export const elbowAlignmentLabel=p=>p.elbowAlignment==='b-axis'?'B 端中心線同軸延伸':p.elbowAlignment==='a-axis'?'A 端中心線同軸延伸':'自行定位與定向';
