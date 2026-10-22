import {shellCourses,shellRingStations,shellPiecePart,mod} from './tank-shell-layout.js';
import {checkShellSeams} from './tank-seam-clearance.js';
import {seamClearancePending,seamClearanceSettings} from './tank-seam-settings.js';

export function editableShellSeams(r){
  if(!r?.valid)return [];
  return [...r.assembly.map(b=>({id:`L${b.course}-${b.panel}`,kind:'longitudinal',course:b.course,panel:b.panel,position:mod(b.start-r.input.gap/2,r.circumference)})),...shellRingStations(r).map(({course,z})=>({id:'C'+course,kind:'circumferential',course,position:z}))];
}
export function planFromShell(r,rules=r.input.shellLayoutPlan?.rules??{minimumPlateEdge:0,minimumStagger:0}){
  return {version:1,referenceStart:Number(r.input.seamStart),courses:shellCourses(r).map(c=>({height:c.height,startAngle:c.startAngle,lengths:c.pieces.map(b=>b.length)})),rules:{...rules}};
}
/** Move only the two adjoining edges; positive ring delta is toward B/up. */
export function moveShellSeam(r,id,delta,{rules}={}){
  const seam=editableShellSeams(r).find(s=>s.id===id);
  if(!seam||!Number.isFinite(delta))return {ok:false,message:'接縫或移動距離無效。'};
  if(r.input.shellLayoutPlan&&r.shellLayoutState?.closed===false)return {ok:false,message:'先恢復閉合的筒身配置，再拖曳接縫。'};
  const plan=planFromShell(r,rules),course=plan.courses[seam.course-1];let used=delta,affected=[];
  if(Object.values(plan.rules).some(v=>!Number.isFinite(v)||v<0||v>10000))return {ok:false,message:'請先把最小板邊／錯縫距離填為 0～10,000 mm。'};
  if(seam.kind==='circumferential'){
    const next=plan.courses[seam.course];used=Math.min(next.height-.02,Math.max(.02-course.height,delta));course.height+=used;next.height-=used;
    affected=shellCourses(r).filter(c=>c.course===seam.course||c.course===seam.course+1).flatMap(c=>c.pieces.map(b=>b.id));
  }else{
    const j=seam.panel-1,n=course.lengths.length,previous=(j+n-1)%n;
    if(n>1){used=Math.min(course.lengths[j]-.02,Math.max(.02-course.lengths[previous],delta));course.lengths[previous]+=used;course.lengths[j]-=used;}
    if(j===0)course.startAngle=mod(course.startAngle+used/r.circumference*360,360);
    affected=[...new Set([shellCourses(r)[seam.course-1].pieces[previous].id,shellCourses(r)[seam.course-1].pieces[j].id])];
  }
  return {ok:true,plan,delta:used,clamped:Math.abs(used-delta)>1e-7,affected,position:seam.kind==='longitudinal'?mod(seam.position+used,r.circumference):seam.position+used};
}
export function shellSeamReadback(r,id){
  const seam=editableShellSeams(r).find(s=>s.id===id);if(!seam)return null;
  const measurements=[];
  for(const n of r.nozzlePlan.items.filter(n=>n.host==='shell')){
    const check=checkShellSeams(r,n,{seamId:id});
    for(const p of check.profiles){const h=seam.kind==='longitudinal'?p.longitudinal:p.circumferential;if(h)measurements.push({...h,nozzle:n.mark||n.id,nozzleId:n.id,envelope:p.kind,label:p.label});}
  }
  measurements.sort((a,b)=>a.clearance-b.clearance);
  const row=shellCourses(r)[seam.course-1],pieces=seam.kind==='circumferential'?[...row.pieces,...shellCourses(r)[seam.course].pieces]:[...new Set([row.pieces[(seam.panel+row.pieces.length-2)%row.pieces.length],row.pieces[seam.panel-1]])];
  const plates=pieces.map(b=>({id:b.id,length:b.length,height:b.height,raw:shellPiecePart(r,b.id),reasons:r.shellLayoutState?.pieceIssues?.find(i=>i.id===b.id)?.reasons??[]}));
  let stagger=null;if(seam.kind==='longitudinal')for(const c of shellCourses(r).filter(c=>Math.abs(c.course-seam.course)===1))for(const b of c.pieces){const position=mod(b.start-r.input.gap/2,r.circumference),distance=Math.min(mod(position-seam.position,r.circumference),mod(seam.position-position,r.circumference))*Math.PI*r.od/r.circumference;if(stagger===null||distance<stagger)stagger=distance;}
  return {seam,measurements,nearest:measurements[0]??null,plates,stagger,requiredStagger:r.input.shellLayoutPlan?.rules?.minimumStagger??0,pending:seamClearancePending(r),settingsValid:seamClearanceSettings(r).valid,layoutBad:r.shellLayoutState?.badSeams?.includes(id)??false,conflict:measurements.some(m=>m.overlap)||Boolean(r.shellLayoutState?.badSeams?.includes(id))};
}

// The same proportional course mapping is used for display and pointer deltas.
export function shellAssemblyFrame(r,{compact=false,editing=false}={}){
  const shownCourses=Math.min(r.courses,10),shownPanels=Math.min(r.panelsPerCourse,24),row=editing?Math.min(compact?170:180,660/shownCourses):compact?82:56,x=compact?52:80,w=compact?290:560,y=58,h=shownCourses*row,shownRows=shellCourses(r).slice(0,shownCourses),totalHeight=shownRows.reduce((sum,c)=>sum+c.height,0),boxes=new Map();let topY=y;
  if(editing){
    // Editing uses one affine axial scale, including the real root gaps. A
    // fixed nozzle must not jump when a moving ring passes its host course.
    const span=shownRows.at(-1).z+shownRows.at(-1).height,scaleY=h/span;
    for(const c of shownRows)boxes.set(c.course,{y:y+(span-c.z-c.height)*scaleY,h:c.height*scaleY});
    return {shownCourses,shownPanels,row,x,w,y,h,boxes,scaleX:w/r.circumference,scaleY,gapY:r.input.gap*scaleY/2};
  }
  for(const c of [...shownRows].reverse()){const box={y:topY,h:c.height/totalHeight*shownCourses*(row-6)};boxes.set(c.course,box);topY+=box.h+6;}
  return {shownCourses,shownPanels,row,x,w,y,h,boxes,scaleX:w/r.circumference,scaleY:shownCourses*(row-6)/totalHeight,gapY:3};
}
