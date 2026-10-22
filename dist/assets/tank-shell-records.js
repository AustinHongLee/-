export const SHELL_RECORD_FIELDS=Object.freeze({
  project:'專案／設備名稱',drawing:'圖號／版次',wps:'適用 WPS 編號／版次',
  tack:'點焊與夾治具計畫',sequence:'焊接順序／內外側作業計畫',acceptance:'尺寸公差／檢驗計畫依據'
});
export const SHELL_RECORD_DEFAULT=Object.freeze({version:1,project:'',drawing:'',wps:'',tack:'',sequence:'',acceptance:''});
export const SHELL_RECORD_LIMITS=Object.freeze({project:100,drawing:100,wps:120,tack:500,sequence:500,acceptance:500});
export function normalizeShellRecords(raw){
  const data={...SHELL_RECORD_DEFAULT},issues=[];
  if(raw==null)return {data,issues};
  if(typeof raw!=='object'||Array.isArray(raw))return {data,issues:[{field:'shellConstruction',message:'筒身施工記錄格式錯誤。'}]};
  if(raw.version!==undefined&&raw.version!==1)issues.push({field:'shellConstruction',message:'不支援此筒身施工記錄版本。'});
  for(const [key,label] of Object.entries(SHELL_RECORD_FIELDS)){
    const v=raw[key];if(v===undefined)continue;
    if(typeof v!=='string'||v.length>SHELL_RECORD_LIMITS[key])issues.push({field:'shellConstruction.'+key,message:label+'需為 '+SHELL_RECORD_LIMITS[key]+' 字以內的文字。'});
    else data[key]=v.trim();
  }
  return {data,issues};
}
