import {v1102Fabrication} from './tank-v1102-fabrication.js';
import {normalizeFabrication} from './tank-fabrication.js';

const reference='v1102-drawing-study';
const normalized=a=>normalizeFabrication({version:1,assemblies:[a]}).data.assemblies[0];
export function currentV1102Support(){return structuredClone(v1102Fabrication().assemblies[0]);}
// Exact old shipped records only. A changed dimension, note, hole or WPS is a
// user's edit and must not be silently replaced during draft restoration.
export function legacyV1102Supports(){
  const r1=currentV1102Support();delete r1.supportLayout;for(const w of r1.welds)if(['W1','W5'].includes(w.id)){w.measure='manual';w.length=238;}
  const r0=currentV1102Support();delete r0.supportLayout;r0.qty=2;r0.name='V-1102 分件支承';r0.note='原圖兩組，中心位於 A 端 TL +275／825；中心距 550。9t 板件外形、孔位與各焊腳尚待核。830×250×5 為原圖捲板展開，成品弧角 142°；不另假定收縮留料。';
  const parts=Object.fromEntries(r0.parts.map(p=>[p.id,p]));
  Object.assign(parts.P1,{name:'支承底板',holeCount:0,holeDiameter:0,note:'外形毛重；螺栓孔位尚待核，未扣孔。'});
  Object.assign(parts.P2,{name:'弧形承板',qty:1,spec:'9t 弧形承板；接觸角 123°，展開及修邊待核',note:''});
  Object.assign(parts.P3,{name:'立板',kind:'plate',stockMode:'auto',qty:2,width:150,spec:'',note:'高度及上緣外形未取得；150 為軸向包絡，尚非定案下料。'});
  Object.assign(parts.P4,{qty:1,weightBasis:'finished',note:'圖示展開尺寸；捲後弧角 142°。'});
  Object.assign(parts.P5,{qty:2,material:'SA325 / SA194-2H / HDG',spec:'5/8″固定螺栓組，長度及墊圈配置待確認'});
  r0.parts=r0.parts.filter(p=>p.id!=='P6');
  r0.welds=r0.welds.filter(w=>w.id!=='W5').map(w=>({...w,measure:'manual',qty:['W1','W2'].includes(w.id)?2:1,length:null,size:null,process:'gtaw',aLocation:'',bLocation:'',note:'依原圖詳圖／WPS 補焊長與尺寸。'}));
  return [r0,r1];
}
export function migrateV1102Support(input){
  if(input.referenceCase!==reference)return {input,changed:false,previous:null};
  const current=input.fabricationData?.assemblies.find(a=>a.target==='support');
  if(!current||current.supportLayout||!legacyV1102Supports().some(a=>JSON.stringify(normalized(a))===JSON.stringify(normalized(current))))return {input,changed:false,previous:null};
  return {input:{...input,fabricationData:{...input.fabricationData,assemblies:input.fabricationData.assemblies.map(a=>a===current?currentV1102Support():a)}},changed:true,previous:structuredClone(current)};
}
export function replaceV1102Support(data){
  const next=structuredClone(data),previous=next.assemblies.find(a=>a.target==='support');
  const replacement=currentV1102Support();if(next.assemblies.some(a=>a!==previous&&a.id==='A1'))throw Error('A1已被其他組件使用，請先核對分件編號。');
  if(previous)next.assemblies[next.assemblies.indexOf(previous)]=replacement;else next.assemblies.unshift(replacement);
  return {data:next,previous:previous??null};
}
/** Apply a live edit to the one register. Known blank and footprint calculations
 * follow the edited part instead of leaving a stale second set of dimensions. */
export function editSupport(data,{kind,id,key,value}){
  const next=structuredClone(data),a=next.assemblies.find(a=>a.target==='support');if(!a)return next;
  if(kind==='layout'){
    if(key==='stationA'||key==='stationB')a.supportLayout.stations[key==='stationA'?0:1]=value;else a.supportLayout[key]=value;
  }else{
    const row=a[kind==='part'?'parts':'welds'].find(p=>p.id===id);if(!row)return next;
    if(kind==='part'&&row.stockMode==='blank')for(const [dim,blank] of [['length','blankLength'],['width','blankWidth']])if(key===dim&&Number(row[blank])===Number(row[dim]))row[blank]=value;
    row[key]=value;
  }
  return next;
}
