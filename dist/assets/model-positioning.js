import {rotateAroundMain} from './geometry.js';
import {mainAxisSurfaceDatum,jointPositionForSurface} from './field-datums.js';
import {elbowFrame,torusSurfacePoint,torusCoordinates} from './elbow-geometry.js';
import {resolveElbowAlignment} from './elbow-axis.js';
import {conicalSurfacePoint} from './conical-geometry.js';

/** Model controls use physical outside-surface entry points, not virtual
 * branch origins. These helpers project a mesh hit onto the ideal surface;
 * they do not certify the resulting fishmouth or clearances. */
const DEG=Math.PI/180,END_EPS=1e-9,NORMAL_MIN=1e-5;
const add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,k)=>a.map(v=>v*k);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const finiteVector=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
const unit=v=>{if(!finiteVector(v))return null;const n=Math.hypot(...v);return n>1e-12?mul(v,1/n):null;};
const wrapDegrees=a=>((a%360)+360)%360;
const finite=(...v)=>v.every(Number.isFinite);
const interior=(x,length)=>x>END_EPS&&x<length-END_EPS;
const freeAngle=a=>Number.isFinite(a)&&a>=5&&a<=175;
const alignment=p=>p.elbowAlignment??'free';
const locked=p=>p?.hostType==='elbow'&&alignment(p)!=='free';

// Validate only the host and quantities needed by a control. A new position
// may repair an invalid old position; unrelated fabrication inputs stay intact.
function hostShape(p){
  if(!p||typeof p!=='object')return null;
  const type=p.hostType??'straight',R=p.mainOD/2;
  if(!Number.isFinite(p.mainOD)||R<=0)return null;
  if(p.mainWall!==undefined&&(!Number.isFinite(p.mainWall)||p.mainWall<=0||p.mainWall>=R))return null;
  if(type==='straight')return Number.isFinite(p.mainLength)&&p.mainLength>0?{type,R,length:p.mainLength}:null;
  if(type==='elbow'){
    if(!finite(p.bendRadius,p.bendAngle)||p.bendRadius<=R||p.bendAngle<=0||p.bendAngle>180||!['free','a-axis','b-axis'].includes(alignment(p)))return null;
    return {type,R,Rc:p.bendRadius,bend:p.bendAngle*DEG};
  }
  if(type==='cone'){
    if(!finite(p.mainEndOD,p.mainLength)||p.mainEndOD<=0||p.mainLength<=0)return null;
    const R1=p.mainEndOD/2,k=(R1-R)/p.mainLength,s=Math.hypot(1,k);
    if(Math.abs(k)<1e-4||(p.mainWall!==undefined&&Math.min(R,R1)<=p.mainWall*s))return null;
    return {type,R,R1,k,s,length:p.mainLength};
  }
  return null;
}

/** Return a parameter patch for a hit on the uncut mother outside mesh.
 * End caps, undefined radial coordinates and locked coaxial joints reject;
 * finite-end violations are never clamped into a different location. */
export function positionFromSurfacePoint(params,point){
  const h=hostShape(params);
  if(!h||!finiteVector(point)||locked(params))return null;
  if(h.type==='straight'){
    if(!interior(point[0],h.length)||Math.hypot(point[1],point[2])<=1e-12||!freeAngle(params.angle)||!Number.isFinite(params.offset)||Math.abs(params.offset)>=h.R)return null;
    const clock=Math.atan2(point[1],point[2])/DEG;
    const azimuth=wrapDegrees(clock-Math.asin(params.offset/h.R)/DEG);
    const jointPosition=jointPositionForSurface({...params,azimuth},point[0]);
    return Number.isFinite(jointPosition)?{jointPosition,azimuth}:null;
  }
  if(h.type==='elbow'){
    // torusCoordinates preserves the kernel's +Z clock convention.
    if(Math.hypot(point[0],point[1]-h.Rc)<=1e-12)return null;
    const q=torusCoordinates(point,h.Rc);
    if(!finite(q.beta,q.phi,q.tubeDistance)||q.tubeDistance<=1e-12||q.beta<=1e-10||q.beta>=h.bend-1e-10)return null;
    return {bendPosition:q.beta/DEG,surfaceClock:wrapDegrees(q.phi/DEG)};
  }
  if(!interior(point[0],h.length)||Math.hypot(point[1],point[2])<=1e-12)return null;
  return {jointPosition:point[0],surfaceClock:wrapDegrees(Math.atan2(point[1],point[2])/DEG)};
}

function placementFrame(params){
  const h=hostShape(params);if(!h)return null;
  const p=h.type==='elbow'?resolveElbowAlignment(params):params;
  if(h.type==='straight'){
    if(!finite(p.offset,p.angle,p.jointPosition,p.azimuth)||Math.abs(p.offset)>=h.R||!freeAngle(p.angle))return null;
    const d=mainAxisSurfaceDatum(p);if(!d||!interior(d.axialPosition,h.length))return null;
    const clock=d.clockAngle*DEG;
    return {origin:[d.axialPosition,h.R*Math.sin(clock),h.R*Math.cos(clock)],tangent:[1,0,0],normal:[0,Math.sin(clock),Math.cos(clock)],side:[0,Math.cos(clock),-Math.sin(clock)]};
  }
  if(h.type==='elbow'){
    if(!finite(p.bendPosition,p.surfaceClock)||p.bendPosition<=0||p.bendPosition>=p.bendAngle)return null;
    const beta=p.bendPosition*DEG,phi=p.surfaceClock*DEG,f=elbowFrame(beta,h.Rc);
    return {origin:torusSurfacePoint(beta,phi,h.Rc,h.R),tangent:f.tangent,
      normal:add(mul(f.normal,Math.cos(phi)),mul(f.binormal,Math.sin(phi))),
      side:add(mul(f.normal,-Math.sin(phi)),mul(f.binormal,Math.cos(phi)))};
  }
  if(!finite(p.jointPosition,p.surfaceClock)||!interior(p.jointPosition,h.length))return null;
  const phi=p.surfaceClock*DEG,sin=Math.sin(phi),cos=Math.cos(phi);
  return {origin:conicalSurfacePoint(p.jointPosition,phi,p),tangent:[1/h.s,h.k*sin/h.s,h.k*cos/h.s],
    normal:[-h.k/h.s,sin/h.s,cos/h.s],side:[0,cos,-sin]};
}

/** The exact physical entry and kernel direction. normal is the true mother
 * outside normal. For an eccentric straight joint it differs from the radial
 * vector of the supported branch direction plane. */
export function positioningFrame(params){
  const f=placementFrame(params);if(!f)return null;
  const p=params.hostType==='elbow'?resolveElbowAlignment(params):params;
  const constrained=params.hostType==='elbow'&&locked(params);
  if(!Number.isFinite(p.angle)||(constrained?!(p.angle>0&&p.angle<180):!freeAngle(p.angle)))return null;
  const a=p.angle*DEG;
  let direction;
  if((p.hostType??'straight')==='straight')direction=rotateAroundMain([Math.cos(a),0,Math.sin(a)],p.azimuth);
  else{
    if(!Number.isFinite(p.branchSwivel))return null;
    const psi=p.branchSwivel*DEG;
    direction=add(mul(f.tangent,Math.cos(a)),mul(add(mul(f.normal,Math.cos(psi)),mul(f.side,Math.sin(psi))),Math.sin(a)));
  }
  direction=unit(direction);
  return direction&&dot(f.normal,direction)>NORMAL_MIN?{...f,direction}:null;
}

/** Return an outward parameter patch, never reverse an inward gesture.
 * Straight directions project into the existing X/radial direction plane;
 * changing angle also adjusts virtual J to preserve the physical entry. */
export function directionFromWorldVector(params,vector){
  if(locked(params))return null;
  const f=placementFrame(params),v=unit(vector);if(!f||!v||dot(f.normal,v)<=NORMAL_MIN)return null;
  if((params.hostType??'straight')==='straight'){
    const radial=rotateAroundMain([0,0,1],params.azimuth),axial=dot(v,f.tangent),transverse=dot(v,radial);
    if(transverse<=1e-12)return null;
    const direction=unit(add(mul(f.tangent,axial),mul(radial,transverse)));
    if(!direction||dot(f.normal,direction)<=NORMAL_MIN)return null;
    const angle=Math.atan2(transverse,axial)/DEG;if(!freeAngle(angle))return null;
    const jointPosition=jointPositionForSurface({...params,angle},f.origin[0]);
    return Number.isFinite(jointPosition)?{angle,jointPosition}:null;
  }
  // G/N/K (or T/N/K) are the exact orthonormal bases used by the kernels.
  const angle=Math.acos(Math.max(-1,Math.min(1,dot(v,f.tangent))))/DEG;
  if(!freeAngle(angle))return null;
  const branchSwivel=Math.atan2(dot(v,f.side),dot(v,f.normal))/DEG;
  return {angle,branchSwivel};
}

/** Geometric port centres and normals pointing out of the finite host.
 * Coaxial elbow selection uses elbowAlignment, not a point on the end cap. */
export function hostEndFrames(params){
  const h=hostShape(params);if(!h)return [];
  if(h.type==='elbow'){
    const b=elbowFrame(h.bend,h.Rc);
    return [{id:'A',center:[0,0,0],outward:[-1,0,0],label:'A 端管口'},
      {id:'B',center:b.center,outward:b.tangent,label:'B 端管口'}];
  }
  return [{id:'A',center:[0,0,0],outward:[-1,0,0],label:'A 端管口'},
    {id:'B',center:[h.length,0,0],outward:[1,0,0],label:'B 端管口'}];
}
