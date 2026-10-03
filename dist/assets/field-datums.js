/** Physical branch-axis entry point on the main pipe's outside surface.
 * jointPosition remains the legacy virtual centre-plane X coordinate.
 */
export function mainAxisSurfaceDatum(p) {
  const radius=p.mainOD/2,angle=p.angle*Math.PI/180;
  if(![radius,p.offset,p.jointPosition,p.azimuth,angle].every(Number.isFinite)||radius<=0||Math.abs(p.offset)>=radius||Math.abs(Math.sin(angle))<1e-10)return null;
  const z=Math.sqrt(radius*radius-p.offset*p.offset),localAngle=Math.asin(p.offset/radius);
  return {axialPosition:p.jointPosition+z/Math.tan(angle),localAngle,clockAngle:((p.azimuth+localAngle*180/Math.PI)%360+360)%360,circumferenceFromBackSeam:Math.PI*radius+radius*localAngle,z};
}
export function jointPositionForSurface(p,axialPosition) {
  const datum=mainAxisSurfaceDatum({...p,jointPosition:0});
  return datum&&Number.isFinite(axialPosition)?axialPosition-datum.axialPosition:NaN;
}
