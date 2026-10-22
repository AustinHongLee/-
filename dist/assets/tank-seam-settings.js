export const SEAM_CLEARANCE_DEFAULT=Object.freeze({longitudinalWidth:null,circumferentialWidth:null,nozzleWeldReach:null,padWeldReach:null,workDistance:null});
export const SEAM_CLEARANCE_FIELDS=Object.freeze({longitudinalWidth:'筒身縱縫焊道總寬',circumferentialWidth:'筒身環縫焊道總寬',nozzleWeldReach:'管嘴開孔外緣至焊趾',padWeldReach:'補強板外緣至焊趾',workDistance:'焊趾間施工淨距'});
export function normalizeSeamClearance(raw){
  const data={...SEAM_CLEARANCE_DEFAULT},issues=[];
  if(raw===undefined)return {data,issues,valid:true};
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!Object.hasOwn(data,k)))return {data,issues:[{field:'seamClearance',message:'排縫焊道與施工距離格式錯誤。'}],valid:false};
  for(const key of Object.keys(data)){
    const value=raw[key];if(value===null||value===undefined||typeof value==='string'&&!value.trim())continue;
    if(!['string','number'].includes(typeof value)||!Number.isFinite(Number(value))||Number(value)<0||Number(value)>10000){issues.push({field:'seamClearance.'+key,message:SEAM_CLEARANCE_FIELDS[key]+'需填 0～10,000 mm；未確認時可留白。'});continue;}
    data[key]=Number(value);
  }
  return {data,issues,valid:issues.length===0};
}
export function seamClearanceSettings(r){return r.seamClearance??normalizeSeamClearance(r.input?.seamClearance);}
export function seamClearancePending(r){
  if(!(r.nozzlePlan?.items??[]).some(n=>n.host==='shell'))return [];
  const {data}=seamClearanceSettings(r),keys=['longitudinalWidth','nozzleWeldReach','workDistance'];
  if(r.courses>1)keys.push('circumferentialWidth');
  if(r.nozzlePlan.items.some(n=>n.host==='shell'&&n.padRadius>n.hole/2))keys.push('padWeldReach');
  return keys.filter(k=>data[k]===null).map(key=>({key,label:SEAM_CLEARANCE_FIELDS[key]}));
}
