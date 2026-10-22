import {shellConstructionPlan} from './tank-shell-plan.js';
import {BUTT_ENDS} from './tank-heads.js';
import {v1102SupportPlan} from './tank-support-plan.js';
import {shellSeamDisplayModel} from './tank-seam-display.js';
const rad=d=>d*Math.PI/180;
const hash=s=>{let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(16).padStart(8,'0');};
const canonical=value=>typeof value==='number'?Number.isFinite(value)?Number(value.toFixed(6)):null:Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonical(value[k])])):value;

/** Identifiers and positions for drawings, work orders and both 3D viewers.
 * Coordinates remain in the tank frame (y along the axis); viewers apply the
 * same orientation transform. Unlocated detail welds never receive fake anchors.
 */
export function tankDrawingModel(r){
  if(!r?.valid)return null;
  const shell=shellConstructionPlan(r),R=r.od/2,heads=[],welds=shell.welds.map(w=>({...w,
    scope:'shell',location:'located',pointsKind:w.kind==='longitudinal'?'line':'ring',
    station:r.frame.bodyBottom+w.z,radius:R,anchor:w.kind==='longitudinal'?[R*Math.sin(rad(w.angle)),r.frame.bodyBottom+w.z+w.length/2,R*Math.cos(rad(w.angle))]:[R,r.frame.bodyBottom+w.z,0]}));
  for(const [which,letter] of [['bottom','A'],['top','B']]){
    if(r.ends[which].type==='open')continue;
    const part=r.parts.find(p=>p.ends?.includes(which))??r.parts.find(p=>p.id===(which==='bottom'?'B':'T')),
      y=which==='bottom'?r.frame.bottomTangent:r.frame.topTangent;
    heads.push({id:'H-'+letter,bomId:part?'BODY.'+part.id:null,which,type:r.ends[which].type,thickness:r.ends[which].t,anchor:[0,y,0]});
    if(BUTT_ENDS.includes(r.ends[which].type)){
      const station=which==='bottom'?r.frame.bodyBottom-r.input.headGap/2:r.frame.bodyTop+r.input.headGap/2,
        t=Math.min(r.input.shellThickness,r.ends[which].t);
      welds.push({id:'W-'+letter,scope:'head',kind:'head',a:'H-'+letter,b:which==='bottom'?'第 1 圈':`第 ${r.courses} 圈`,length:Math.PI*(r.di+t),station,radius:R,anchor:[R,station,0],location:'located',pointsKind:'ring',t});
    }
  }
  const plates=r.assembly.map(p=>({...p,bomId:'BODY.S',raw:[p.length+2*r.input.trim+2*(shell.part.flatEnd||0),p.height+2*r.input.trim,shell.part.thickness],finished:[p.length,p.height,shell.part.thickness],anchor:[R*Math.sin(rad((p.start+p.length/2)/r.circumference*360)),r.frame.bodyBottom+p.z+p.height/2,R*Math.cos(rad((p.start+p.length/2)/r.circumference*360))]}));
  const support=v1102SupportPlan(r),detailWelds=(r.fabricationPlan?.welds??[]).map(w=>support?.zones.find(z=>z.id===w.id)??({...w,scope:'detail',location:'unlocated',anchor:null})),aliases=[];
  for(const w of r.fabricationPlan?.register??[]){
    if(w.source==='detail')continue;
    const ids=w.group==='shell'?welds.filter(x=>x.scope==='shell'&&(w.name.includes('縱')?x.kind==='longitudinal':x.kind==='circumferential')).map(x=>x.id):w.group==='end'&&w.name.includes('筒身對接')?welds.filter(x=>x.id===(w.name.startsWith('A')||w.name.startsWith('底')?'W-A':'W-B')).map(x=>x.id):[];
    if(ids.length)aliases.push({groupId:w.id,ids});
  }
  const mapped=new Set(aliases.map(x=>x.groupId)),unlocatedAuto=(r.fabricationPlan?.register??[]).filter(w=>w.source!=='detail'&&!mapped.has(w.id)).map(w=>({...w,scope:'group',location:'unlocated',anchor:null}));
  const seamClearance=shellSeamDisplayModel(r),dimensions={id:r.di,od:r.od,t:r.input.shellThickness,tangentLength:r.height,bodyLength:r.bodyHeight,bodyBottom:r.frame.bodyBottom,bodyTop:r.frame.bodyTop,headGap:r.input.headGap,gap:r.input.gap,circumference:r.circumference};
  const model={version:2,dimensions,plates,heads,support,seamClearance,welds:[...welds,...detailWelds,...unlocatedAuto],aliases,nozzles:(r.nozzlePlan?.items??[]).map(n=>({id:n.id,mark:n.mark||n.id,face:n.face,height:n.height,od:n.od,thickness:n.thickness,projection:n.projection,host:n.host})),parts:r.fabricationPlan?.bom??[]};
  // Browser and Node trigonometry may differ below a nanometre. Fingerprint
  // engineering quantities, not platform-dependent last digits or display text.
  const pick=(row,keys)=>Object.fromEntries(keys.map(k=>[k,row[k]]));
  model.revision='M-'+hash(JSON.stringify(canonical({dimensions,plates,heads,support,seamClearance,
    welds:model.welds.map(w=>pick(w,['id','scope','kind','a','b','length','station','radius','angle','z','anchor','quantity','size','t','leg','wps','process'])),
    nozzles:model.nozzles,parts:model.parts.map(p=>pick(p,['id','material','kind','quantity','length','width','thickness','od','idiameter','blankLength','blankWidth','holeDiameter','holeCount','slotLength','weightBasis','weight','density']))})));return model;
}

/** Shell-only annotations use local y=0 at the body plate edge. */
export function shellSceneAnnotations(m,step,explode=false){
  const r=m.result,R=r.od/2,offset=c=>explode?(c-1)*r.bodyHeight*.08:0,
    piece=m.piece,angle=(piece.start+piece.length/2)/r.circumference*2*Math.PI,
    labels=[{id:piece.id,kind:'part',text:`${piece.id} · ${Number(piece.length.toFixed(2))} × ${piece.height} × t${r.input.shellThickness}`,anchor:[R*Math.sin(angle),piece.z+piece.height/2+offset(piece.course),R*Math.cos(angle)]}];
  if(['fit','weld'].includes(step))for(const w of m.localWelds){const a=rad(w.angle??90);labels.push({id:w.id,kind:'weld',text:`${w.id} · ${Number(w.length.toFixed(2))} mm`,anchor:w.kind==='longitudinal'?[R*Math.sin(a),w.z+w.length/2+offset(w.course),R*Math.cos(a)]:[R,w.z+offset(w.course),0]});}
  return labels;
}

export function drawingWeldRegister(r){
  const m=tankDrawingModel(r);if(!m)return [];
  return m.welds.map(w=>w.location==='located'?{...w,pathKind:w.kind,kind:'butt',source:'located',name:w.scope==='head'?'封頭－筒身環縫':w.kind==='longitudinal'?'筒身縱縫':'圈間環縫',category:w.kind==='longitudinal'||w.scope==='head'&&r.ends[w.id==='W-A'?'bottom':'top'].type==='hemispherical'?'A':'B',t:w.t??r.input.shellThickness,ready:true}:w);
}
