import {shellRingStations} from './tank-shell-layout.js';
import {seamClearanceSettings,seamClearancePending,SEAM_CLEARANCE_FIELDS} from './tank-seam-settings.js';
import {shellSeamProfiles} from './tank-seam-clearance.js';
const mod=(v,p)=>((v%p)+p)%p;
export function shellSeamDisplayModel(r){
  const scaleX=r.circumference/(Math.PI*r.od),settings=seamClearanceSettings(r),active=Object.values(settings.data).some(v=>v!==null)||Boolean(r.shellLayoutState?.badSeams?.length)||(r.nozzlePlan?.items??[]).some(n=>n.seamCheck?.hits.length),hits=(r.nozzlePlan?.items??[]).flatMap(n=>n.seamCheck?.hits??[]),conflicts=new Set([...hits.map(h=>h.id),...(r.shellLayoutState?.badSeams??[])]);
  const bands=r.assembly.map(b=>({id:`L${b.course}-${b.panel}`,kind:'longitudinal',course:b.course,angle:mod(b.start-r.input.gap/2,r.circumference)/r.circumference*360,z:b.z,length:b.height,width:Math.max(r.input.gap,settings.data.longitudinalWidth??0),conflict:conflicts.has(`L${b.course}-${b.panel}`)}));
  for(const {course:c,z} of shellRingStations(r))bands.push({id:'C'+c,kind:'circumferential',course:c,z,width:Math.max(r.input.gap,settings.data.circumferentialWidth??0),conflict:conflicts.has('C'+c)});
  const zones=active?(r.nozzlePlan?.items??[]).filter(n=>n.host==='shell').flatMap(n=>shellSeamProfiles(r,n).map(p=>({id:n.id+'-'+p.kind,nozzleId:n.id,mark:n.mark||n.id,kind:p.kind,label:p.label,x:n.unfoldX,z:n.height,width:p.width,height:p.height,scaleX:p.scaleX,weldReach:p.weldReach,workDistance:p.workDistance,conflict:(n.seamCheck?.hits??[]).some(h=>h.envelope===p.kind)}))):[];
  return {scaleX,settings:settings.data,valid:settings.valid,pending:seamClearancePending(r),active,bands,zones};
}
// Rounded working-distance offset around the rectangular weld envelope. Points
// stay in developed mm so 2D, WebGL and the work order share one footprint.
export function seamZoneOutline(zone,{working=true}={}){
  const halfW=zone.width/2+zone.weldReach*zone.scaleX,halfH=zone.height/2+zone.weldReach,r=working?zone.workDistance:0,points=[];
  for(const [cx,cy,start] of [[halfW,halfH,0],[-halfW,halfH,90],[-halfW,-halfH,180],[halfW,-halfH,270]])for(let i=0;i<=8;i++){
    const a=(start+i*90/8)*Math.PI/180;points.push([zone.x+cx+r*Math.cos(a)*zone.scaleX,zone.z+cy+r*Math.sin(a)]);
  }
  return [...points,points[0]];
}
// Subdivide developed horizontal edges before wrapping. Joining just the four
// corners makes chords inside the shell, hiding the working zone behind steel.
export function seamZoneSurfacePath(r,zone,{working=true,radius=r.od/2,bodyBottom=r.frame.bodyBottom}={}){
  const flat=seamZoneOutline(zone,{working}),out=[];
  for(let i=1;i<flat.length;i++){const a=flat[i-1],b=flat[i],steps=Math.max(1,Math.min(2048,Math.ceil(Math.abs(b[0]-a[0])/r.circumference*Math.PI*2/.04)));
    for(let j=0;j<steps;j++){const t=j/steps,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t,angle=x/r.circumference*Math.PI*2;out.push([radius*Math.sin(angle),bodyBottom+z,radius*Math.cos(angle)]);}
  }
  return [...out,out[0]];
}
export function seamSettingsRows(r){
  const s=seamClearanceSettings(r),pending=seamClearancePending(r);
  return [...Object.entries(SEAM_CLEARANCE_FIELDS).map(([k,label])=>[label,s.data[k]===null?'未填':s.data[k]+' mm']),['填寫狀態',s.valid?(pending.length?'待確認：'+pending.map(p=>p.label).join('、'):'本案適用欄位已填，仍依圖說／WPS 核對'):'尺寸輸入有誤，暫不作施工避讓判定']];
}
