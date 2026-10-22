import {flangeReference,FLANGE_SIZES,FLANGE_CLASSES,FLANGE_FACES,FLANGE_SOURCES} from './tank-flanges.js';
import {ASME_PIPE_SIZES} from './pipe-sizes.js';

export {FLANGE_SIZES,FLANGE_CLASSES,FLANGE_FACES,FLANGE_SOURCES};
export function defaultComponentFlange(od){
  const size=ASME_PIPE_SIZES.find(p=>Math.abs(p.odMm-od)<.05)?.nps.replace('-', ' ')??'';
  const f={mode:'measured',size,pressureClass:'150',facing:'RF',end:'wn',gasket:null};
  if(componentFlangeReference(f))f.mode='reference';
  return f;
}
export function componentFlangeReference(f){
  return f?flangeReference({end:f.end,flangeSize:f.size,flangeClass:f.pressureClass,flangeFacing:f.facing}):null;
}
export function flangePairLength(f){
  const ref=componentFlangeReference(f);
  // Two WN bevel ends, two RF faces and ONE compressed internal gasket.
  // SO hubs overlap the pipe: their overall length cannot be deducted this way.
  if(f?.end!=='wn'||!ref||typeof f.gasket!=='number'||!Number.isFinite(f.gasket)||f.gasket<0||f.gasket>100)return null;
  return Number((2*ref.flangeLength+f.gasket).toFixed(4));
}
export function componentFlangeErrors(c,od=null){
  const f=c.flange;if(f===undefined)return [];
  const keys=['mode','size','pressureClass','facing','end','gasket'];
  if(c.kind!=='flangePair'||!f||typeof f!=='object'||Array.isArray(f)||Object.keys(f).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(f,k)))return ['法蘭規格資料無效。'];
  if(!['measured','reference'].includes(f.mode)||!['',...FLANGE_SIZES].includes(f.size)||!['',...FLANGE_CLASSES].includes(f.pressureClass)||!['',...Object.keys(FLANGE_FACES)].includes(f.facing)||!['','wn','so'].includes(f.end))return ['請選有效的法蘭尺寸、Class、型式與接面。'];
  if(f.gasket!==null&&(typeof f.gasket!=='number'||!Number.isFinite(f.gasket)||f.gasket<0||f.gasket>100))return ['墊片壓緊厚度須填 0–100 mm；0 代表實際無墊片。'];
  if(f.mode==='reference'){
    if(f.end!=='wn'||!componentFlangeReference(f))return ['此規格尚未收錄 WN／RF 計長尺寸，請改用實測總長。'];
    if(f.gasket===null)return ['請填墊片壓緊後厚度；實際無墊片時填 0。'];
    const length=flangePairLength(f);
    if(length===null)return ['參考計長限已收錄的 WN／RF；請填墊片壓緊厚度，或改用實測總長。'];
    if(typeof c.length!=='number'||!Number.isFinite(c.length)||Math.abs(c.length-length)>.0001)return ['法蘭組長與所選規格不符，請重新帶入或改為實測。'];
    if(c.leftConnection!=='weld'||c.rightConnection!=='weld'||c.internalBolts!==1)return ['參考計長是一對 WN 法蘭：外側兩端對焊、組內一處螺栓接合。其他組合請改用實測。'];
    const size=ASME_PIPE_SIZES.find(p=>p.nps.replace('-',' ')===f.size);
    if(od!==null&&(!size||Math.abs(size.odMm-od)>.05))return ['法蘭管徑與目前管 OD 不同；需要異徑接管時，請把配對件一併量入實測總長。'];
  }
  return [];
}
export function componentSpecification(c){
  const f=c.flange;
  return f?[f.size||f.pressureClass?'ASME B16.5':'',f.size?'NPS '+f.size:'',f.pressureClass?'Class '+f.pressureClass:'',f.end.toUpperCase(),f.facing].filter(Boolean).join(' · '):'';
}
export function componentLengthBasis(c){
  if(c.flange?.mode!=='reference')return '實測組立總長';
  const ref=componentFlangeReference(c.flange);
  return `Texas Flange 參考計長：2 × ${ref.flangeLength} + 壓緊墊片 ${c.flange.gasket} mm（含 RF；待實物覆核）`;
}
