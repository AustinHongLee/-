import {ASME_PIPE_SIZES} from './pipe-sizes.js';
import {applyFlangeReference,flangeReference,flangeReferenceMatches} from './tank-flanges.js';

export const pipeSizeForOD=od=>ASME_PIPE_SIZES.find(p=>Number.isFinite(Number(od))&&String(od).trim()!==''&&Math.abs(p.odMm-Number(od))<.05)??null;
export const flangeSizeForPipe=od=>pipeSizeForOD(od)?.nps.replace('-',' ')??'';
export const nozzleNumber=value=>typeof value==='number'?value:typeof value==='string'&&value.trim()!==''?Number(value):NaN;
export function flangePipeSize(n){return ASME_PIPE_SIZES.find(p=>p.nps.replace('-',' ')===n.flangeSize)??null;}
// No approximate snapping, wall schedule guesses or material/pressure selection.
export function chooseNozzlePipeSize(n,size){const pipe=ASME_PIPE_SIZES.find(p=>p.nps===size);return pipe?{...n,od:pipe.odMm}:{...n};}
export function useNozzleFlangeReference(n){
  const ref=flangeReference(n);if(!ref)return null;
  const unchanged=['flangeOD','flangeThickness','flangeLength'].every(k=>Math.abs(Number(n[k])-ref[k])<.005);
  return {...applyFlangeReference(n),flangeWeight:unchanged?n.flangeWeight:0};
}
export function changeNozzleFlange(n,key,value){
  const next={...n,[key]:value};
  if(n.flangeSource==='texas-v1'&&['end','flangeSize','flangeClass','flangeFacing'].includes(key))return useNozzleFlangeReference(next)??next;
  if(['flangeOD','flangeLength','flangeThickness'].includes(key))next.flangeSource='manual';
  return next;
}
export function nozzleFlangeState(n){
  const ref=flangeReference(n),applied=n.flangeSource==='texas-v1'&&flangeReferenceMatches(n),pipe=flangePipeSize(n);
  return {reference:ref,applied,stale:n.flangeSource==='texas-v1'&&!applied,mismatch:!!pipe&&Math.abs(pipe.odMm-Number(n.od))>.05,pipe,
    deduction:n.end==='wn'?nozzleNumber(n.flangeLength)+nozzleNumber(n.weldGap):n.end==='so'?nozzleNumber(n.soSetback):0};
}
