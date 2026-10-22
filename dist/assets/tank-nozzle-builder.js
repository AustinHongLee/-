import {chooseNozzlePipeSize,flangeSizeForPipe,useNozzleFlangeReference,nozzleFlangeState,pipeSizeForOD,nozzleNumber} from './tank-flange-actions.js';
import {fmt} from './tank-visuals.js';
import {nozzleDirectionLabel} from './tank-nozzle-position.js';
export function canFollowNozzleFlange(n){return n.construction!=='integral'&&n.end!=='bare'&&!!pipeSizeForOD(n.od);}
export function defaultFollowNozzleFlange(n){const s=nozzleFlangeState(n);return canFollowNozzleFlange(n)&&s.applied&&!s.mismatch;}
// Matching is an explicit builder option. Measured and integral fittings never
// become a different nominal flange just because a pipe OD was selected.
export function changeNozzleBuilderSize(n,size,{followFlange=false}={}){
  const next=chooseNozzlePipeSize(n,size);
  if(!followFlange||!pipeSizeForOD(next.od)||next.construction==='integral'||next.end==='bare')return next;
  const specified={...next,flangeSize:flangeSizeForPipe(next.od)};
  return useNozzleFlangeReference(specified)??specified;
}
export function nozzleBuilderSummary(n,r){
  const mark=n.mark||n.id,pipe=pipeSizeForOD(n.od),end=n.construction==='integral'?'一體長頸':n.end==='bare'?'裸管':n.end==='so'?'SO套入法蘭':'WN對焊法蘭';
  const size=(pipe?'NPS '+pipe.nps.replaceAll('-',' ')+' · ':'')+'Ø '+fmt(nozzleNumber(n.od))+' × t'+fmt(nozzleNumber(n.thickness))+' mm';
  const position=n.host==='shell'?(r?.orientation==='horizontal'?'A端板邊 ':'下緣起 ')+fmt(nozzleNumber(n.height))+' mm':(r?.orientation==='horizontal'?(n.host==='bottom'?'A':'B'):'上下'[n.host==='top'?0:1])+'端 · 偏心 '+fmt(nozzleNumber(n.radius))+' mm';
  const angle=nozzleNumber(n.angle),direction=Number.isFinite(angle)?(n.host==='shell'&&n.axisMode!=='parallel'?nozzleDirectionLabel(angle,r?.orientation==='horizontal')+' ':'')+fmt(angle)+'°':'方向待填';
  return {mark,size,end,position:position+' · '+direction,projection:fmt(nozzleNumber(n.projection))+' mm',full:mark+' · '+position+' · '+direction+'｜'+size+'｜外伸 '+fmt(nozzleNumber(n.projection))+' mm · '+end};
}
