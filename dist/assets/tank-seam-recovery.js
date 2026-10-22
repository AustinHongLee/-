import {buildShellLayout,shellCourses,mod} from './tank-shell-layout.js';
import {editableShellSeams,moveShellSeam,shellSeamReadback} from './tank-seam-edit-model.js';
import {shellSeamProfiles,checkShellSeams} from './tank-seam-clearance.js';
import {seamClearanceSettings,seamClearancePending} from './tank-seam-settings.js';

// Solve the one-dimensional feasible intervals, then choose the closest station
// on a .01 mm grid. No sampling, nozzle relocation or topology change is used.
// The tiny reserve only protects floating-point contact tests, not fit-up error.
const STEP=.01,EPS=1e-5;
const arc=(a,b,C)=>Math.min(mod(a-b,C),mod(b-a,C));
const distance=(dx,dy)=>dx>0||dy>0?Math.hypot(Math.max(0,dx),Math.max(0,dy)):Math.max(dx,dy);
// Exclusion interiors are open: two zones touching at their permitted limits
// still leave that shared point feasible, including a zero-width corridor.
const merge=xs=>{const out=[];for(const [a,b] of xs.sort((a,b)=>a[0]-b[0])){const last=out.at(-1);if(last&&a<last[1])last[1]=Math.max(last[1],b);else out.push([a,b]);}return out;};
function available(blocked,lo,hi){
  if(lo>hi)return [];let cursor=lo;const out=[];
  for(const [a,b] of merge(blocked).filter(([a,b])=>b>lo&&a<hi)){if(a>=cursor)out.push([cursor,Math.min(a,hi)]);cursor=Math.max(cursor,b);}
  if(cursor<=hi)out.push([cursor,hi]);return out;
}
// If the fixed horizontal clearance is already sufficient, changing the axial
// endpoint cannot create a collision. Otherwise invert the rectangle distance.
const verticalLimit=(dx,target)=>dx>=target?null:target>0?Math.sqrt(Math.max(0,target**2-Math.max(0,dx)**2)):target;
function layoutProbe(r,plan){
  const input={...r.input,shellLayoutPlan:plan},state=buildShellLayout({input,bodyHeight:r.bodyHeight,circumference:r.circumference,maxHeight:r.shellLayoutState.maxHeight,maxLength:r.shellLayoutState.maxLength});
  return {...r,input,shellLayoutState:state,courseRows:state.rows,assembly:state.assembly};
}
const allProblems=r=>new Set([...(r.shellLayoutState.badSeams??[]),...r.nozzlePlan.items.filter(n=>n.host==='shell').flatMap(n=>checkShellSeams(r,n).hits.map(h=>h.id))]);

export function suggestNearestShellSeam(r,id,{rules=r?.input?.shellLayoutPlan?.rules??{minimumPlateEdge:0,minimumStagger:0}}={}){
  const fail=(message,extra={})=>({ok:false,message,...extra});
  if(!r?.valid||!r.nozzlePlan?.valid||!seamClearanceSettings(r).valid)return fail('先修正筒身、管嘴與施工距離的輸入，才能找修正位置。');
  const unchanged=moveShellSeam(r,id,0,{rules});if(!unchanged.ok)return fail(unchanged.message);
  const baseline=layoutProbe(r,unchanged.plan),before=shellSeamReadback(baseline,id),seam=before.seam;
  if(!before.conflict)return fail('這道接縫依已填尺寸沒有衝突。',{alreadyClear:true});
  const C=r.circumference,g=r.input.gap,rows=shellCourses(baseline),row=rows[seam.course-1],settings=seamClearanceSettings(r).data,nozzles=r.nozzlePlan.items.filter(n=>n.host==='shell'),profiles=nozzles.flatMap(n=>shellSeamProfiles(r,n).map(p=>({n,p}))),min=Math.max(.02,rules.minimumPlateEdge),blocked=[],constraints=new Set();
  let lo,hi;const stationary=[];
  const bound=(a,b,label)=>{lo=Math.max(lo,a);hi=Math.min(hi,b);constraints.add(label);};
  const circularBlock=(center,radius,label)=>{
    constraints.add(label);if(radius*2>=C){blocked.push([lo-1,hi+1]);return;}
    const origin=center-seam.position;
    for(let k=Math.ceil((lo-origin-radius)/C);k<=Math.floor((hi-origin+radius)/C);k++)blocked.push([origin-radius+k*C,origin+radius+k*C]);
  };
  if(seam.kind==='longitudinal'){
    if(row.height<min-1e-6||row.height>r.shellLayoutState.maxHeight+1e-6)return fail('這圈板高不合目前原板／最小板邊；只移這道縱縫無法修正，需一起調整環縫。');
    const n=row.pieces.length,previous=row.pieces[(seam.panel+n-2)%n],current=row.pieces[seam.panel-1],max=r.shellLayoutState.maxLength;
    if(n===1){if(current.length<min-1e-6||current.length>max+1e-6)return fail('整圈單片的弧長放不進目前原板；旋轉合口縫無法改變板寬。');lo=-C/2;hi=C/2;}
    else{lo=Math.max(min-previous.length,current.length-max);hi=Math.min(max-previous.length,current.length-min);}
    constraints.add('原板可用尺寸／最小板邊');
    for(const {n,p} of profiles){
      const dy=Math.max(row.z-n.height-p.height/2,n.height-p.height/2-row.z-row.height)-p.weldReach,target=Math.max(p.workDistance,EPS);
      if(dy>=target)continue;
      const reach=Math.sqrt(Math.max(0,target**2-Math.max(0,dy)**2)),radius=p.width/2+(Math.max(g,settings.longitudinalWidth??0)/2+p.weldReach+reach)*p.scaleX;
      circularBlock(n.unfoldX,radius,(n.mark||n.id)+' '+p.label+'施工區');
    }
    if(rules.minimumStagger>0)for(const c of rows.filter(c=>Math.abs(c.course-seam.course)===1))for(const b of c.pieces)circularBlock(mod(b.start-g/2,C),rules.minimumStagger*C/(Math.PI*r.od),'相鄰圈縱縫錯開距離');
  }else{
    const next=rows[seam.course],max=r.shellLayoutState.maxHeight;
    if([...row.pieces,...next.pieces].some(b=>b.length<min-1e-6||b.length>r.shellLayoutState.maxLength+1e-6))return fail('相鄰圈有板寬不合目前原板／最小板邊；只移這道環縫無法修正，需一起調整縱縫。');
    lo=Math.max(min-row.height,next.height-max);hi=Math.min(max-row.height,next.height-min);constraints.add('原板可用尺寸／最小板邊');
    for(const {n,p} of profiles){
      const radius=p.height/2+p.weldReach+Math.max(g,settings.circumferentialWidth??0)/2+Math.max(p.workDistance,EPS);
      blocked.push([n.height-radius-seam.position,n.height+radius-seam.position]);constraints.add((n.mark||n.id)+' '+p.label+'施工區');
      // Moving the ring changes the finite longitudinal seam endpoints in both
      // courses. Do not introduce, or deepen, a collision on those fixed seams.
      for(const c of [row,next])for(const b of c.pieces){
        const dx=(arc(n.unfoldX,mod(b.start-g/2,C),C)-p.width/2)/p.scaleX-Math.max(g,settings.longitudinalWidth??0)/2-p.weldReach;
        const dy=Math.max(c.z-n.height-p.height/2,n.height-p.height/2-c.z-c.height)-p.weldReach,original=distance(dx,dy),target=Math.min(original,Math.max(p.workDistance,EPS)),limit=verticalLimit(dx,target);
        if(limit===null)continue;
        const label=(n.mark||n.id)+' 與相鄰縱縫 L'+c.course+'-'+b.panel;
        if(c.course===row.course){if(c.z-n.height-p.height/2-p.weldReach>=limit-1e-9)continue;bound(-Infinity,n.height-p.height/2-p.weldReach-limit+g/2-seam.position,label);}
        else{if(n.height-p.height/2-c.z-c.height-p.weldReach>=limit-1e-9)continue;bound(n.height+p.height/2+p.weldReach+limit-g/2-seam.position,Infinity,label);}
        stationary.push({nozzle:n.id,kind:p.kind,id:`L${c.course}-${b.panel}`,actual:original});
      }
    }
  }
  const intervals=available(blocked,lo,hi),candidates=[];
  for(const [a,b] of intervals){
    const first=Math.ceil((seam.position+a-1e-9)/STEP)*STEP,last=Math.floor((seam.position+b+1e-9)/STEP)*STEP;
    if(first>last+1e-9)continue;
    const station=Math.max(first,Math.min(last,Math.round(seam.position/STEP)*STEP));candidates.push(station-seam.position);
  }
  candidates.sort((a,b)=>Math.abs(a)-Math.abs(b)||a-b);
  for(const delta of candidates){
    const moved=moveShellSeam(baseline,id,delta,{rules});if(!moved.ok||moved.clamped)continue;
    const probe=layoutProbe(r,moved.plan),after=shellSeamReadback(probe,id);
    if(!probe.shellLayoutState.closed||after.conflict||after.plates.some(p=>p.reasons.length))continue;
    if(probe.shellLayoutState.badSeams.some(s=>!baseline.shellLayoutState.badSeams.includes(s)))continue;
    if(stationary.some(s=>{const n=nozzles.find(n=>n.id===s.nozzle),p=checkShellSeams(probe,n,{seamId:s.id}).profiles.find(p=>p.kind===s.kind);return p.longitudinal.actualClearance<Math.min(s.actual,p.workDistance)-1e-6;}))continue;
    const remaining=allProblems(probe);remaining.delete(id);
    return {ok:true,id,plan:moved.plan,delta,position:moved.position,before,after,remaining:[...remaining],pending:seamClearancePending(r),precision:STEP,welds:r.verticalSeams+r.horizontalSeams,extraWelds:0};
  }
  return fail('以 0.01 mm 定位精度，只移這一道接縫，未找到同時符合板料、施工淨距與錯縫要求的位置；可連相鄰分圈／分片一起調整，管嘴仍固定。',{constraints:[...constraints],precision:STEP});
}
