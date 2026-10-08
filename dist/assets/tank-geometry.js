// Geometry only. Thickness is a supplied estimating value, never a code design result.
import {endShape,endIssues,END_LABELS,TOP_ENDS,BOTTOM_ENDS,HORIZONTAL_ENDS,BUTT_ENDS,FORMED_ENDS,TORI_PRESETS} from './tank-heads.js';
import {methodDefaults} from './tank-method-config.js';
const deepFreeze=o=>{if(o&&typeof o==='object'){for(const v of Object.values(o))deepFreeze(v);Object.freeze(o);}return o;};
export const TANK_DEFAULTS=Object.freeze({shape:'open',solve:'volume',basis:'inside',diameter:1200,height:2000,volume:2.262,shellThickness:6,endThickness:6,density:7850,fill:90,stockWidth:1500,stockLength:6000,shellLayout:'around',seamLayout:'stagger',trim:5,kerf:3,gap:0,overhang:10,headStraight:25,headGap:2,headBlank:0,headWeight:0,
  orientation:'vertical',top:'flat',bottom:'flat',topThickness:0,topAngle:15,topSmall:0,bottomAngle:60,bottomSmall:100,toriPreset:'asme',toriCrown:1,toriKnuckle:.06,domeRatio:1,seamStart:0,
  service:'unknown',code:'unknown',edition:'',jurisdiction:'',medium:'',material:'',pressure:'',vacuum:'',temperature:'',minTemperature:'',liquidDensity:'',corrosion:'',efficiency:'',nozzles:Object.freeze([]),methods:deepFreeze(methodDefaults())});
export const SHAPES={open:'開口平底槽',flat:'平蓋平底槽',elliptical:'雙 2:1 橢圓封頭',custom:'自訂槽型'};
export const TOP_NAMES=Object.freeze({open:'開口',flat:'平蓋',cone:'錐頂',dome:'拱頂',elliptical:'橢圓上封頭',torispherical:'碟形上封頭',hemispherical:'半球上封頭'});
export const BOTTOM_NAMES=Object.freeze({flat:'平底',cone:'錐底',elliptical:'橢圓下封頭',torispherical:'碟形下封頭',hemispherical:'半球下封頭'});
const LEGACY={open:['vertical','open','flat'],flat:['vertical','flat','flat'],elliptical:['vertical','elliptical','elliptical']};
/** Orientation and end types; the three original presets map onto vertical tanks. */
export function tankEnds(p){const legacy=LEGACY[p.shape];return legacy?{orientation:legacy[0],top:legacy[1],bottom:legacy[2]}:{orientation:p.orientation,top:p.top,bottom:p.bottom};}
export function shapeLabel(p){
  if(p.shape!=='custom')return SHAPES[p.shape]??'';
  const e=tankEnds(p);
  if(e.orientation==='horizontal')return e.top===e.bottom?`臥式槽 · 兩端${END_LABELS[e.top]??''}${e.top==='flat'?'':'封頭'}`.replace('錐形封頭','錐形'):`臥式槽 · A 端${END_LABELS[e.bottom]??''}／B 端${END_LABELS[e.top]??''}`;
  return `立式槽 · ${TOP_NAMES[e.top]??''}＋${BOTTOM_NAMES[e.bottom]??''}`;
}
const thicknessOf=(p,which)=>which==='top'&&Number(p.topThickness)>0?Number(p.topThickness):Number(p.endThickness);
// Petal-built hemispheres are welded straight to the shell: no straight flange (the butt gap still applies).
export function endParams(p,which,di){
  const type=tankEnds(p)[which],preset=TORI_PRESETS[p.toriPreset]??TORI_PRESETS.asme,custom=p.toriPreset==='custom';
  return {type,di,t:thicknessOf(p,which),angle:Number(which==='top'?p.topAngle:p.bottomAngle),small:Number(which==='top'?p.topSmall:p.bottomSmall),crown:custom?Number(p.toriCrown):preset.crown,knuckle:custom?Number(p.toriKnuckle):preset.knuckle,dome:Number(p.domeRatio),straight:FORMED_ENDS.includes(type)&&!(type==='hemispherical'&&p.methods?.layout?.hemiMethod==='petal')?Number(p.headStraight):0};
}
export function buildEnds(p,di){const top=endParams(p,'top',di),bottom=endParams(p,'bottom',di);return {top:endShape(top.type,top),bottom:endShape(bottom.type,bottom)};}
/** Geometric capacity m³ of the straight shell plus both ends (inside surfaces). */
export function tankCapacity(di,h,p){const e=buildEnds(p,di);return (Math.PI*di*di*h/4+e.top.volume+e.bottom.volume)/1e9;}
export function capacity(di,h,shape){return tankCapacity(di,h,typeof shape==='string'?{...TANK_DEFAULTS,shape}:shape);}
const limits={diameter:[1,100000],height:[1,100000],volume:[1e-9,1e6],shellThickness:[.1,300],endThickness:[.1,300],density:[100,30000],fill:[1,100],stockWidth:[10,20000],stockLength:[10,30000],trim:[0,100],kerf:[0,30],gap:[0,30],overhang:[0,1000],headStraight:[0,1000],headGap:[0,30],headBlank:[0,20000],headWeight:[0,1e7],
  topThickness:[0,300],topAngle:[1,89],topSmall:[0,100000],bottomAngle:[1,89],bottomSmall:[0,100000],toriCrown:[.3,3],toriKnuckle:[.01,.5],domeRatio:[.5,3],seamStart:[0,360]};
function relevant(field,input,e){
  const ends=[e.top,e.bottom],formed=ends.some(t=>FORMED_ENDS.includes(t)),butt=ends.some(t=>BUTT_ENDS.includes(t));
  if(field==='overhang')return ends.includes('flat');
  if(['headStraight','headBlank','headWeight'].includes(field))return formed;
  if(field==='headGap')return butt;
  if(field==='topThickness')return input.shape==='custom'&&e.top!=='open';
  if(field==='topAngle'||field==='topSmall')return e.top==='cone';
  if(field==='bottomAngle'||field==='bottomSmall')return e.bottom==='cone';
  if(field==='toriCrown'||field==='toriKnuckle')return ends.includes('torispherical')&&input.toriPreset==='custom';
  if(field==='domeRatio')return e.top==='dome';
  return true;
}
export function solveTank(values={}){
  const input={...TANK_DEFAULTS,...values},issues=[];
  const issue=(field,message)=>issues.push({field,message});
  if(!Object.hasOwn(SHAPES,input.shape))issue('shape','選擇支援的桶槽形狀。');
  if(!['volume','height','diameter'].includes(input.solve))issue('solve','選擇已知的兩個尺寸。');
  if(!['inside','outside'].includes(input.basis))issue('basis','選擇內徑或外徑基準。');
  if(!['around','upright'].includes(input.shellLayout))issue('shellLayout','選擇筒身原板方向。');
  if(!['stagger','aligned'].includes(input.seamLayout))issue('seamLayout','選擇筒身縱縫配置。');
  if(input.shape==='custom'){
    if(!['vertical','horizontal'].includes(input.orientation))issue('orientation','選擇立式或臥式。');
    const horizontal=input.orientation==='horizontal';
    if(!(horizontal?HORIZONTAL_ENDS:TOP_ENDS).includes(input.top))issue('top',horizontal?'臥式槽的端部選平板、錐形或封頭。':'選擇支援的頂部型式。');
    if(!(horizontal?HORIZONTAL_ENDS:BOTTOM_ENDS).includes(input.bottom))issue('bottom',horizontal?'臥式槽的端部選平板、錐形或封頭。':'選擇支援的底部型式。');
  }
  const e=tankEnds(input);
  if([e.top,e.bottom].includes('torispherical')&&!Object.hasOwn(TORI_PRESETS,input.toriPreset))issue('toriPreset','選擇碟形封頭型式。');
  if(issues.length)return {valid:false,input,issues};
  for(const [field,[min,max]] of Object.entries(limits)){
    // Fields that do not apply to this configuration are not validated, but numeric text still becomes a number.
    if(field===input.solve||!relevant(field,input,e)){const v=input[field];if(typeof v==='string'&&v.trim()!==''&&Number.isFinite(Number(v)))input[field]=Number(v);continue;}
    const value=input[field];input[field]=typeof value==='string'&&value.trim()===''?NaN:Number(value);
    if(!Number.isFinite(input[field])||input[field]<min||input[field]>max)issue(field,`${fieldLabel(field)}需在 ${min}～${max} 之間。`);
  }
  if(issues.length)return {valid:false,input,issues};
  const inside=d=>input.basis==='outside'?d-2*input.shellThickness:d;
  let di=input.solve==='diameter'?0:inside(input.diameter),h=input.height;
  if(input.solve!=='diameter'&&di<=0)issue('diameter','外徑必須大於兩倍筒身板厚。');
  if(issues.length)return {valid:false,input,issues};
  if(input.solve==='height'){const ends=buildEnds(input,di);h=(input.volume*1e9-ends.top.volume-ends.bottom.volume)/(Math.PI*di*di/4);}
  if(input.solve==='diameter'){
    let lo=0,hi=100000-(input.basis==='outside'?2*input.shellThickness:0);
    if(tankCapacity(hi,h,input)<input.volume)return {valid:false,input,issues:[{field:'volume',message:'此容積所需直徑超過 100,000 mm，請核對容積與高度。'}]};
    for(let i=0;i<100;i++){const mid=(lo+hi)/2;if(tankCapacity(mid,h,input)<input.volume)lo=mid;else hi=mid;}di=(lo+hi)/2;
  }
  const diameter=input.basis==='inside'?di:di+2*input.shellThickness;
  if(!(di>0)||diameter<1||diameter>100000)issue('volume','此容積算出的直徑超出工具範圍，請改尺寸或容積。');
  if(!(h>=1)||h>100000)issue(input.solve==='height'?'volume':'height','容積不足以容納端部，或算出的直段高度超出工具範圍。');
  if(issues.length)return {valid:false,input,issues};
  for(const which of ['top','bottom']){const o=endParams(input,which,di),field=o.type==='cone'?which+'Small':o.type==='torispherical'?(input.toriPreset==='custom'?'toriKnuckle':'toriPreset'):o.type==='dome'?'domeRatio':which;for(const x of endIssues(o.type,o,field))issue(x.field,(which==='top'?(e.orientation==='horizontal'?'B 端：':'頂部：'):(e.orientation==='horizontal'?'A 端：':'底部：'))+x.message);}
  if(issues.length)return {valid:false,input,issues};
  const ends=buildEnds(input,di),butt=end=>BUTT_ENDS.includes(end.type)?end.straight+input.headGap:0;
  const bodyHeight=h-butt(ends.top)-butt(ends.bottom);
  for(const which of ['top','bottom'])if(FORMED_ENDS.includes(ends[which].type)&&input.headBlank>0&&input.headBlank<di+2*ends[which].t){issue('headBlank','封頭毛坯小於封頭口部外徑，請向供應商確認毛坯尺寸。');break;}
  if(!(bodyHeight>0))issue(input.solve==='height'?'volume':'height','端部直邊與對接間隙已占滿直段；增加高度／容積，或核對封頭直邊。');
  if(input.stockWidth<=2*input.trim)issue('stockWidth','板寬必須大於兩側留料，請換較寬的板或減少留料。');
  if(input.stockLength<=2*input.trim)issue('stockLength','板長必須大於兩側留料，請換較長的板或減少留料。');
  if(issues.length)return {valid:false,input,issues};
  const shellVolume=Math.PI*di*di*h/4/1e9,v=shellVolume+(ends.top.volume+ends.bottom.volume)/1e9;
  const bottomTangent=ends.bottom.outer,bodyBottom=bottomTangent+butt(ends.bottom),topTangent=bottomTangent+h;
  const frame={bottomTangent,bodyBottom,bodyTop:bodyBottom+bodyHeight,topTangent,total:topTangent+ends.top.outer};
  const headDepth=FORMED_ENDS.includes(ends.bottom.type)?ends.bottom.depth:FORMED_ENDS.includes(ends.top.type)?ends.top.depth:0;
  return {valid:true,input:{...input,diameter,height:h,volume:v},issues:[],di,od:di+2*input.shellThickness,meanDiameter:di+input.shellThickness,height:h,bodyHeight,headDepth,totalHeight:frame.total,volume:v,workingVolume:v*input.fill/100,
    orientation:e.orientation,endTypes:{top:e.top,bottom:e.bottom},ends,frame,shellVolume,endVolumes:{top:ends.top.volume/1e9,bottom:ends.bottom.volume/1e9}};
}
export function fieldLabel(field){return ({diameter:'直徑 mm',height:'直段高度 mm',volume:'幾何容積 m³',shellThickness:'筒身板厚 mm',endThickness:'底／蓋／封頭板厚 mm',density:'材料密度 kg/m³',fill:'使用容量比例 %',stockWidth:'原板寬 mm',stockLength:'原板長 mm',trim:'每邊留料 mm',kerf:'切割刀縫 mm',gap:'筒身對接間隙 mm',overhang:'平底／平蓋外伸 mm',headStraight:'封頭直邊 mm',headGap:'封頭對接間隙 mm',headBlank:'供應商指定毛坯直徑 mm',headWeight:'每只封頭實重 kg',
  topThickness:'頂部板厚 mm（0 = 同底部）',topAngle:'頂部錐面與水平夾角 °',topSmall:'頂部錐體小端內徑 mm',bottomAngle:'底部錐面與水平夾角 °',bottomSmall:'底部錐體小端內徑 mm',toriCrown:'碟形冠部半徑 ÷ 外徑',toriKnuckle:'碟形轉角半徑 ÷ 外徑',domeRatio:'拱頂半徑 ÷ 內徑',seamStart:'第 1 圈縱縫起點角 °'})[field]||field;}
