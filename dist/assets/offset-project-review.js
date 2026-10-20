// Pending checks survive automatic saves. An upgraded file is not evidence that
// an operator has checked the old coordinate or factory-takeout convention.
const TEXT=Object.freeze({
  'legacy-y':'此專案存於舊版（Y 標示右為正）。現在採右手座標：前＋X、左＋Y、上＋Z。請核對 Y、±Y 朝向與量測點修正；若當初往右量為正，須自行反號。程式不自動改實測值。',
  'factory-ta':'此專案的現成彎頭曾另加保留端直段；現在 Ta 即中心至接合端面，直管長度已依此重算，請核對實物／型錄 Ta。'
});
export function legacyReviewKeys(version,p){
  if(version>=5)return [];
  const usesY=p.layout==='rolling'&&Number(p.roll)!==0||['aAxis','bAxis'].some(k=>String(p[k]).startsWith('y'))||['a','b'].some(e=>p[e+'Axis']==='custom'&&Number(p[e+'AxisY'])!==0)||p.datum==='marks'&&(Number(p.aShiftY)!==0||Number(p.bShiftY)!==0);
  return [usesY?'legacy-y':null,['a','b'].some(e=>p[e+'Kind']==='factory'&&Number(p[e+'Tangent'])>0)?'factory-ta':null].filter(Boolean);
}
export function validateOffsetReview(value=[]){
  if(!Array.isArray(value)||value.length>2||value.some(key=>!Object.hasOwn(TEXT,key))||new Set(value).size!==value.length)throw new Error('舊專案核對狀態格式錯誤。');
  return [...value];
}
export const offsetReviewNotice=key=>TEXT[key]??'';
export function acknowledgeOffsetReview(pending,key){return validateOffsetReview(pending).filter(item=>item!==key);}
export function requireOffsetReview(pending){if(validateOffsetReview(pending).length)throw new Error('先完成上方舊專案的方向／Ta 核對，再匯出加工資料。專案仍可儲存與下載。');}
