// Small reference table, not a complete ASME catalogue or pressure-rating engine.
// Texas Flange Class 150/300 drawings label O, T, SO L, WN L2 in inches.
// Their T and L/L2 dimension arrows exclude the separately drawn 1/16 inch RF.
export const FLANGE_SOURCES={
  '150':'https://texasflange.com/products/flange-dims-weights/ansi-b16-5-forged-flanges/class-150/',
  '300':'https://texasflange.com/products/flange-dims-weights/ansi-b16-5-forged-flanges/class-300/'
};
export const FLANGE_DEFAULTS=Object.freeze({flangeSize:'',flangeClass:'',flangeFacing:'',flangeMaterial:'',flangeSource:'manual',soSetback:0});
export const FLANGE_SIZES=['1/2','3/4','1','1 1/4','1 1/2','2','2 1/2','3','3 1/2','4','5','6','8','10','12','14','16','18','20','22','24'];
export const FLANGE_CLASSES=['150','300','400','600','900','1500','2500'];
export const FLANGE_FACES={RF:'RF 凸面',FF:'FF 平面',RTJ:'RTJ 環接面'};
// [NPS, O, T, SO L, WN L2]. Reference dimensions only; no bore or weights.
const rows={
  '150':[['1/2',3.5,.38,.56,1.81],['3/4',3.88,.44,.56,2],['1',4.25,.5,.62,2.12],['1 1/2',5,.62,.81,2.38],['2',6,.69,.94,2.44],['3',7.5,.88,1.12,2.69],['4',9,.88,1.25,2.94],['6',11,.94,1.5,3.44]],
  '300':[['1/2',3.75,.5,.81,2],['3/4',4.62,.56,.94,2.19],['1',4.88,.62,1,2.38],['1 1/2',6.12,.75,1.13,2.63],['2',6.5,.81,1.25,2.69],['3',8.25,1.06,1.63,3.06],['4',10,1.19,1.82,3.32],['6',12.5,1.38,2,3.82]]
};
const mm=inches=>Number((inches*25.4).toFixed(4));
export function flangeReference(n){
  if(!['wn','so'].includes(n.end)||n.flangeFacing!=='RF')return null;
  const row=rows[n.flangeClass]?.find(r=>r[0]===n.flangeSize);if(!row)return null;
  return {flangeOD:mm(row[1]),flangeThickness:mm(row[2]+1/16),flangeLength:mm(row[n.end==='wn'?4:3]+1/16),source:FLANGE_SOURCES[n.flangeClass],rfHeight:mm(1/16)};
}
export function applyFlangeReference(n){
  const reference=flangeReference(n);if(!reference)return null;
  return {...n,flangeOD:reference.flangeOD,flangeThickness:reference.flangeThickness,flangeLength:reference.flangeLength,flangeSource:'texas-v1',flangeWeight:0};
}
export function flangeReferenceMatches(n){const ref=flangeReference(n);return !!ref&&['flangeOD','flangeThickness','flangeLength'].every(k=>Math.abs(Number(n[k])-ref[k])<.005);}
export function flangeDescription(n){
  if(n.end==='bare')return '裸管端';
  const parts=[n.flangeSize?'NPS '+n.flangeSize:'',n.flangeClass?'Class '+n.flangeClass:'',n.flangeFacing,n.flangeMaterial,n.flangeSpec];
  return [n.flangeSize||n.flangeClass?'ASME B16.5':'',...parts].filter(Boolean).join(' · ')||'規格待確認';
}
export function flangeProvenance(n){return n.flangeSource==='texas-v1'?(flangeReferenceMatches(n)?'Texas Flange 英寸尺寸表換算，含圖示 RF 凸高；待供應商覆核':'尺寸或規格已變更，請重新套用尺寸表或改依實測核對'):'依實測／供應商圖說輸入';}
export function flangeIcon(end){
  const pipe='<path d="M8 31H72V47H8" fill="#abcddc" stroke="#416d82"/><path d="M8 36H72V42H8" fill="#fff" stroke="#7d9bad"/>';
  return `<svg viewBox="0 0 110 78" aria-hidden="true">${end==='wn'?'<path d="M8 31H54V47H8" fill="#abcddc" stroke="#416d82"/><path d="M8 36H54V42H8" fill="#fff" stroke="#7d9bad"/><path d="M61 29L82 23V12H97V66H82V55L61 49Z" fill="#e2caa6" stroke="#a07b45"/><path d="M61 36H97V42H61" fill="#fff" stroke="#7d9bad"/>':end==='so'?pipe+'<path d="M49 27H74V12H91V66H74V51H49Z" fill="#e2caa6" stroke="#a07b45"/><path d="M8 31H89V47H8" fill="#abcddc" stroke="#416d82"/><path d="M8 36H89V42H8" fill="#fff" stroke="#7d9bad"/>':pipe}<path d="M5 39H104" stroke="#91acbb" stroke-dasharray="4 4"/></svg>`;
}
