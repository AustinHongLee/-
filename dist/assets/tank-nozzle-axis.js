// A shell nozzle remains perpendicular to the tank axis. Offset nozzles keep
// their chosen direction instead of being forced to follow a shell radius.
export function shellNozzleAxis(n,{ri,ro,rm=ri}){
  const theta=Number(n.angle)*Math.PI/180,offset=n.axisMode==='parallel'?Number(n.offset):0,
    direction=[Math.sin(theta),0,Math.cos(theta)],cross=[Math.cos(theta),0,-Math.sin(theta)],rp=Number(n.od)/2,
    holeR=rp+Number(n.holeGap),root=(R,x)=>Math.sqrt(Math.max(0,R*R-x*x)),outer=root(ro,offset),inner=root(ri,offset),
    near=root(ri,Math.max(0,Math.abs(offset)-rp)),far=root(ri,Math.abs(offset)+rp),
    surfaceAngle=((Number(n.angle)+Math.asin(Math.max(-1,Math.min(1,offset/ro)))*180/Math.PI)%360+360)%360,
    openingLow=Number(n.angle)*Math.PI/180+Math.asin(Math.max(-1,Math.min(1,(offset-holeR)/ri))),
    openingHigh=Number(n.angle)*Math.PI/180+Math.asin(Math.max(-1,Math.min(1,(offset+holeR)/ri))),
    openingCenter=(openingLow+openingHigh)/2;
  return {offset,direction,cross,outer,inner,near,far,wall:outer-inner,surfaceAngle,
    surface:direction.map((v,i)=>v*outer+cross[i]*offset),
    openingAngle:((openingCenter*180/Math.PI)%360+360)%360,
    holeWidth:rm*(openingHigh-openingLow),minWall:outer-near,maxWall:outer-far,
    valid:Number.isFinite(offset)&&Math.abs(offset)+holeR<ri};
}
