import {shellCourses,shellRingStations} from './tank-shell-layout.js';
// Conservative rectangular opening/pad envelopes on the developed shell.
// User-supplied weld widths and toe-to-toe working distance; no code minima.
import {seamClearanceSettings} from './tank-seam-settings.js';
const mod=(x,p)=>((x%p)+p)%p;
const arc=(a,b,p)=>Math.min(mod(a-b,p),mod(b-a,p));
const EPS=1e-7;
export function criticalSeamHits(check){const hits=new Map();for(const h of check?.hits??[])if(!hits.has(h.id)||h.clearance<hits.get(h.id).clearance)hits.set(h.id,h);return [...hits.values()];}
const boxDistance=(dx,dy)=>dx>0||dy>0?Math.hypot(Math.max(0,dx),Math.max(0,dy)):Math.max(dx,dy);
function clearanceResult(profile,actualClearance,geometryOverlap){
  const clearance=actualClearance-profile.workDistance,overlap=clearance< -EPS||actualClearance<=EPS;
  return {actualClearance,required:profile.workDistance,clearance,overlap,geometryOverlap,reason:geometryOverlap?'geometry':actualClearance<=EPS?'weld':'space',shortfall:Math.max(0,-clearance)};
}

export function shellSeamProfiles(r,n){
  const profiles=[{kind:'opening',label:'開孔包絡',width:n.holeWidth,height:n.hole}];
  if(n.padRadius>n.hole/2){const radius=r.od/2+n.padThickness/2;
    profiles.push({kind:'pad',label:'補強板包絡',width:2*radius*Math.asin(Math.min(1,n.padRadius/radius)),height:2*n.padRadius});}
  const settings=seamClearanceSettings(r).data;
  return profiles.map(p=>({...p,scaleX:r.circumference/(Math.PI*r.od),weldReach:settings[p.kind==='pad'?'padWeldReach':'nozzleWeldReach']??0,workDistance:settings.workDistance??0}));
}

function touchedCourses(r,n,profile){
  const lo=n.height-profile.height/2-profile.weldReach-profile.workDistance,hi=n.height+profile.height/2+profile.weldReach+profile.workDistance;
  return shellCourses(r).filter(c=>c.z<=hi+1e-7&&c.z+c.height>=lo-1e-7);
}

export function checkShellSeams(r,n,{seamStart=Number(r.input.seamStart)||0,seamId=null}={}){
  if(n.host!=='shell')return null;
  const settings=seamClearanceSettings(r).data;
  const C=r.circumference,gap=r.input.gap,delta=(seamStart-(Number(r.input.seamStart)||0))/360*C;
  const profiles=shellSeamProfiles(r,n).map(profile=>{
    let longitudinal=null,circumferential=null;const contacts=[];
    for(const row of seamId?shellCourses(r):touchedCourses(r,n,profile)){
      const course=row.course;
      for(let index=0;index<row.pieces.length;index++){
      const piece=row.pieces[index];
      if(seamId&&seamId!==`L${course}-${piece.panel}`)continue;
      const seam=mod(piece.start+delta-gap/2,C),edgeDistance=(arc(n.unfoldX,seam,C)-profile.width/2)/profile.scaleX;
      const previous=row.pieces[(index+row.pieces.length-1)%row.pieces.length];
      const dy=Math.max(piece.z-(n.height+profile.height/2),n.height-profile.height/2-(piece.z+piece.height));
      const width=Math.max(gap,settings.longitudinalWidth??0),actualClearance=boxDistance(edgeDistance-width/2-profile.weldReach,dy-profile.weldReach);
      const hit={id:`L${course}-${piece.panel}`,kind:'longitudinal',course,a:previous.id,b:piece.id,angle:seam/C*360,edgeDistance,weldWidth:width,...clearanceResult(profile,actualClearance,edgeDistance-gap/2<=EPS&&dy<=EPS)};
      if(!longitudinal||hit.clearance<longitudinal.clearance)longitudinal=hit;
      if(hit.overlap)contacts.push(hit);
      }
    }
    for(const {course,z} of shellRingStations(r)){
      if(seamId&&seamId!=='C'+course)continue;
      const edgeDistance=Math.abs(n.height-z)-profile.height/2;
      const width=Math.max(gap,settings.circumferentialWidth??0),actualClearance=edgeDistance-width/2-profile.weldReach;
      const hit={id:'C'+course,kind:'circumferential',course,z,edgeDistance,weldWidth:width,...clearanceResult(profile,actualClearance,edgeDistance-gap/2<=EPS)};
      if(!circumferential||hit.clearance<circumferential.clearance)circumferential=hit;
      if(hit.overlap)contacts.push(hit);
    }
    return {...profile,longitudinal,circumferential,contacts};
  });
  return {profiles,hits:profiles.flatMap(p=>p.contacts.map(h=>({...h,envelope:p.kind,label:p.label})))};
}

// With equal-width shell panels the layout repeats once per panel pitch. Each
// opening (and each affected staggered course) contributes a circular exclusion
// interval. Evaluate its antipode and weighted interval midpoints; choose the
// greatest minimum circumferential gap. Round, then re-evaluate the actual angle.
export function suggestShellSeamStart(r){
  if(!r?.valid||!r.nozzlePlan?.valid||!seamClearanceSettings(r).valid||!r.assembly.every(b=>Math.abs(b.length-r.assembly[0].length)<1e-6))return null;
  const nozzles=r.nozzlePlan.items.filter(n=>n.host==='shell');if(!nozzles.length)return null;
  const settings=seamClearanceSettings(r).data,hostHalf=Math.max(r.input.gap,settings.longitudinalWidth??0)/2;
  const C=r.circumference,P=C/r.panelsPerCourse,current=mod(Number(r.input.seamStart)||0,360),constraints=[];
  for(const n of nozzles)for(const p of shellSeamProfiles(r,n))for(const row of touchedCourses(r,n,p)){
    const first=row.pieces[0],offset=first.start-current/360*C;
    const dy=Math.max(0,first.z-(n.height+p.height/2+p.weldReach),n.height-p.height/2-p.weldReach-(first.z+first.height));
    const workX=Math.sqrt(Math.max(0,p.workDistance**2-dy**2));
    const point={phase:mod(n.unfoldX-offset+r.input.gap/2,P),radius:p.width/2+(p.weldReach+hostHalf+workX)*p.scaleX};
    if(!constraints.some(c=>arc(c.phase,point.phase,P)<EPS&&Math.abs(c.radius-point.radius)<EPS))constraints.push(point);
  }
  if(!constraints.length)return null;
  const score=x=>Math.min(...constraints.map(c=>arc(x,c.phase,P)-c.radius));
  const candidates=[current/360*C,...constraints.map(c=>c.phase+P/2)];
  for(const a of constraints)for(const b of constraints){const d=mod(b.phase-a.phase,P),at=(d+a.radius-b.radius)/2;if(at>=0&&at<=d)candidates.push(a.phase+at);}
  let best={angle:current,clearance:score(current/360*C),movement:0};
  for(const candidate of candidates){
    const base=mod(candidate,P)/C*360,period=360/r.panelsPerCourse;
    // Keep the closest equivalent rotation so panel numbers move as little as possible.
    const k=Math.round((current-base)/period),options=[k-1,k,k+1].map(i=>mod(base+i*period,360));
    const raw=options.sort((a,b)=>{const d=arc(a,current,360)-arc(b,current,360);return Math.abs(d)<EPS?a-b:d;})[0],angle=mod(Math.round(raw*100)/100,360),clearance=score(angle/360*C),movement=arc(angle,current,360);
    if(clearance>best.clearance+EPS||Math.abs(clearance-best.clearance)<=EPS&&movement<best.movement)best={angle,clearance,movement};
  }
  const netAt=angle=>Math.min(...nozzles.flatMap(n=>checkShellSeams(r,n,{seamStart:angle}).profiles.map(p=>p.longitudinal?.clearance??Infinity)));
  const currentClearance=netAt(current),clearance=netAt(best.angle);
  return {current,...best,currentClearance,clearance,improves:clearance>EPS&&clearance>currentClearance+.5};
}
