import {estimateTank} from './tank-materials.js';
import {shellCourses,mod} from './tank-shell-layout.js';
import {shellSeamProfiles,checkShellSeams} from './tank-seam-clearance.js';
import {seamClearanceSettings,seamClearancePending} from './tank-seam-settings.js';

// Closed reachable intervals, with a small fabrication guard against touching.
// This is a bounded constructive search, not a proof of global optimality.
// Reserve enough for the .01-degree position printed in the work order. This
// is numerical rounding protection, not an assumed welding/measurement tolerance.
const guard=r=>Math.max(.1,Math.PI*r.od/360*.01);
const merge=xs=>{
  const out=[];for(const [a,b] of xs.filter(x=>x[1]>=x[0]-1e-8).sort((a,b)=>a[0]-b[0])){const last=out.at(-1);if(last&&a<=last[1]+1e-8)last[1]=Math.max(last[1],b);else out.push([a,b]);}return out;
};
const intersect=(xs,ys)=>{const a=merge(xs),b=merge(ys),out=[];let i=0,j=0;while(i<a.length&&j<b.length){const lo=Math.max(a[i][0],b[j][0]),hi=Math.min(a[i][1],b[j][1]);if(hi>=lo)out.push([lo,hi]);if(a[i][1]<b[j][1])i++;else j++;}return merge(out);};
const complement=(blocked,lo,hi)=>{let cursor=lo;const out=[];for(const [a,b] of merge(blocked).filter(x=>x[1]>=lo&&x[0]<=hi)){if(a>cursor)out.push([cursor,Math.min(a,hi)]);cursor=Math.max(cursor,b);}if(cursor<hi)out.push([cursor,hi]);return out;};
const shift=(xs,lo,hi)=>merge(xs.map(([a,b])=>[a+lo,b+hi]));
const near=(x,a,b)=>Math.min(b,Math.max(a,x));
const unique=xs=>[...new Map(xs.map(x=>[Math.round(x*1e5),x])).values()];
const scoreHeights=(qs,r)=>qs.slice(1,-1).reduce((s,q,i)=>s+(q-(shellCourses(r)[i+1]?.z-r.input.gap/2||q))**2,0);

function heightPlans(r,count,minimum){
  const EPS=guard(r),g=r.input.gap,H=r.bodyHeight,min=minimum+g,max=r.shellLayoutState.maxHeight+g,start=-g/2,end=H+g/2;
  if(count*min>end-start+1e-7||count*max<end-start-1e-7)return [];
  const settings=seamClearanceSettings(r).data,blocked=[];
  for(const n of r.nozzlePlan.items.filter(n=>n.host==='shell'))for(const p of shellSeamProfiles(r,n)){
    const reach=p.height/2+p.weldReach+Math.max(g,settings.circumferentialWidth??0)/2+p.workDistance+EPS;
    blocked.push([n.height-reach,n.height+reach]);
  }
  const allowed=complement(blocked,0,H),reachable=[[[start,start]]];
  for(let i=1;i<count;i++)reachable.push(intersect(shift(reachable.at(-1),min,max),allowed));
  if(!intersect(reachable.at(-1),[[end-max,end-min]]).length)return [];
  let beam=[{reverse:[end]}];
  for(let i=count-1;i>=1;i--){
    const next=[];for(const b of beam){const q=b.reverse.at(-1),available=intersect(reachable[i],[[q-max,q-min]]),target=(end-start)*i/count+start;
      for(const [a,z] of available)for(const v of unique([near(target,a,z),near(shellCourses(r)[i]?.z-g/2||target,a,z),a,z,(a+z)/2]))next.push({reverse:[...b.reverse,v]});
    }
    beam=next.sort((a,b)=>scoreHeights([start,...a.reverse.slice().reverse()],r)-scoreHeights([start,...b.reverse.slice().reverse()],r)).slice(0,32);
  }
  return beam.map(b=>[start,...b.reverse.slice().reverse()]).map(qs=>qs.slice(1).map((q,i)=>({z:qs[i]+g/2,height:q-qs[i]-g})));
}
function circularAllowed(blocks,C){
  if(blocks.some(b=>b[1]-b[0]>=C))return [];
  return complement(blocks.flatMap(([a,b])=>{const start=mod(a,C),len=b-a;return start+len>C?[[start,C],[0,start+len-C]]:[[start,start+len]];}),0,C);
}
function panelPlans(r,row,count,previous,rules){
  const EPS=guard(r),C=r.circumference,g=r.input.gap,min=rules.minimumPlateEdge+g,max=r.shellLayoutState.maxLength+g,scale=C/(Math.PI*r.od),blocked=[],settings=seamClearanceSettings(r).data;
  if(count*min>C+1e-7||count*max<C-1e-7)return [];
  for(const n of r.nozzlePlan.items.filter(n=>n.host==='shell'))for(const p of shellSeamProfiles(r,n)){
    const dy=Math.max(0,row.z-(n.height+p.height/2+p.weldReach),n.height-p.height/2-p.weldReach-(row.z+row.height));
    if(dy>p.workDistance+EPS)continue;
    const work=Math.sqrt(Math.max(0,(p.workDistance+EPS)**2-dy**2)),radius=p.width/2+(p.weldReach+Math.max(g,settings.longitudinalWidth??0)/2+work+EPS)*scale;
    blocked.push([n.unfoldX-radius,n.unfoldX+radius]);
  }
  if(previous&&rules.minimumStagger>0)for(const a of previous.centers)blocked.push([a-rules.minimumStagger*scale-EPS,a+rules.minimumStagger*scale+EPS]);
  const allowed=circularAllowed(blocked,C);if(!allowed.length)return [];
  const old=shellCourses(r)[row.course-1],preferred=old?mod(old.pieces[0].start-g/2,C):Number(r.input.seamStart)/360*C-g/2;
  // Reachability changes when a corridor end meets a multiple of a pitch bound.
  let points=unique(allowed.flatMap(([a,b])=>[a,b,(a+b)/2,near(mod(preferred,C),a,b)]));
  const ends=allowed.flat();for(const a of ends)for(let i=1;i<=count;i++)points.push(mod(a+i*min,C),mod(a-i*min,C),mod(a+i*max,C),mod(a-i*max,C));
  points=unique(points).sort((a,b)=>a-b);points=unique([...points,...points.map((p,i)=>(p+(points[i+1]??points[0]+C))/2% C)]).filter(p=>allowed.some(([a,b])=>p>=a-1e-8&&p<=b+1e-8));
  points.sort((a,b)=>Math.min(mod(a-preferred,C),mod(preferred-a,C))-Math.min(mod(b-preferred,C),mod(preferred-b,C)));
  const results=[];
  for(const s of points.slice(0,800)){
    const unwrapped=merge([-1,0,1,2].flatMap(k=>allowed.map(([a,b])=>[a+k*C,b+k*C]))),reachable=[[[s,s]]];
    for(let i=1;i<count;i++)reachable.push(intersect(shift(reachable.at(-1),min,max),intersect(unwrapped,[[s,s+C]])));
    let available=intersect(reachable.at(-1),[[s+C-max,s+C-min]]);if(!available.length)continue;
    let next=s+C,centers=[];
    for(let i=count-1;i>=1;i--){available=intersect(reachable[i],[[next-max,next-min]]);const target=s+C*i/count,options=available.map(([a,b])=>near(target,a,b)).sort((a,b)=>Math.abs(a-target)-Math.abs(b-target));next=options[0];centers.unshift(next);}
    centers.unshift(s);const lengths=centers.map((a,i)=>(centers[i+1]??s+C)-a-g),spread=lengths.reduce((v,l)=>v+(l-(C/count-g))**2,0)/C**2;
    results.push({centers:centers.map(c=>mod(c,C)),lengths,startAngle:mod((s+g/2)/C*360,360),height:row.height,score:spread});
  }
  const seen=new Set();return results.sort((a,b)=>a.score-b.score).filter(p=>{const key=p.centers.map(x=>Math.round(x*100)).join(',');if(seen.has(key))return false;seen.add(key);return true;}).slice(0,8);
}

export async function searchShellLayout(r,{minimumPlateEdge=200,minimumStagger=100,allowExtraWeld=false,signal,onProgress=()=>{}}={}){
  if(signal?.aborted)return {ok:false,cancelled:true};
  const rules={minimumPlateEdge:Number(minimumPlateEdge),minimumStagger:Number(minimumStagger)};
  if(Object.values(rules).some(v=>!Number.isFinite(v)||v<0||v>10000))return {ok:false,message:'最小板邊及相鄰圈錯縫距離請填 0～10,000 mm。'};
  if(!r?.valid||!r.nozzlePlan?.valid||!seamClearanceSettings(r).valid)return {ok:false,message:'先修正筒身、管嘴及焊道／施工距離尺寸，再找配置。'};
  if(r.courses>12||r.panelsPerCourse>24)return {ok:false,limited:true,message:'目前自動避讓搜尋支援最多 12 圈、每圈 24 片；此案仍保留原配置，請分段規劃。'};
  const pending=seamClearancePending(r),count=r.courses,originalCounts=shellCourses(r).map(c=>c.pieces.length),topologies=[originalCounts];
  if(allowExtraWeld)for(let i=0;i<count;i++)topologies.push(originalCounts.map((n,j)=>n+(i===j?1:0)));
  const heights=heightPlans(r,count,rules.minimumPlateEdge);
  if(!heights.length)return {ok:false,message:'管嘴／補強板的軸向施工區，配合原板可用板高與最小板邊，未找到可放置環縫的位置。需換板型、調整施工距離依據，或另評估增加分圈。',pending};
  let attempts=0,candidates=[],lastYield=Date.now();
  for(const counts of topologies){
    for(const hs of heights){
      if(signal?.aborted)return {ok:false,cancelled:true};
      let beam=[{courses:[],score:0}];
      for(let i=0;i<count&&beam.length;i++){
        const next=[];for(const b of beam)for(const p of panelPlans(r,{...hs[i],course:i+1},counts[i],b.courses.at(-1),rules))next.push({courses:[...b.courses,p],score:b.score+p.score});
        beam=next.sort((a,b)=>a.score-b.score).slice(0,6);
        if(Date.now()-lastYield>35){onProgress({attempts:++attempts});await new Promise(resolve=>setTimeout(resolve,0));lastYield=Date.now();if(signal?.aborted)return {ok:false,cancelled:true};}
      }
      for(const b of beam){
        const plan={version:1,referenceStart:Number(r.input.seamStart),courses:b.courses.map(({height,startAngle,lengths})=>({height,startAngle,lengths})),rules},input={...r.input,shellLayoutPlan:plan},probe=estimateTank(input,{process:false});
        if(!probe.valid||!probe.shellLayoutState.valid||probe.assembly.some(p=>!p.sheet)||probe.nozzlePlan.items.some(n=>n.host==='shell'&&checkShellSeams(probe,n).hits.length))continue;
        const welds=probe.verticalSeams+probe.horizontalSeams,change=probe.courseRows.reduce((s,c,i)=>s+Math.abs(c.height-shellCourses(r)[i].height),0)/r.bodyHeight;
        candidates.push({input,result:probe,welds,score:b.score+change*.03,sheets:probe.plateSheets});
      }
      if(candidates.length>=6)break;
    }
    if(candidates.length)break; // Never add a weld when the original count works.
  }
  candidates.sort((a,b)=>a.welds-b.welds||(Math.abs(a.result.weldLength-b.result.weldLength)>.1?a.result.weldLength-b.result.weldLength:0)||a.sheets-b.sheets||a.score-b.score);
  if(!candidates.length)return {ok:false,limited:true,pending,message:'這次搜尋未找到同時符合原板、開孔／補強板施工區及錯縫距離的配置；管嘴位置維持原值。可調整最小板邊／錯縫距離、換板型，或勾選另找多 1 道縱縫的備案。這不代表所有可能排法都不可行。'};
  const best=candidates[0];return {ok:true,...best,result:estimateTank(best.input),pending,extraWelds:best.welds-r.verticalSeams-r.horizontalSeams,limited:true,attempts};
}
