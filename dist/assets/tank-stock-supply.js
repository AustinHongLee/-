import {materialKey,stockSelectionKey} from './tank-stock-config.js';
export const PURCHASE_DEFAULT=Object.freeze({version:1,currency:'TWD',offers:Object.freeze([]),plans:Object.freeze([])});
export const SUPPLY_KINDS={standard:'整張板',offcut:'餘板／庫存板',cut:'供應商裁切料'};
const currencies=['TWD','USD','CNY','JPY','EUR'];
const idOK=id=>typeof id==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(id);
const num=(v,lo,hi,integer=false)=>{if(v===null||v===undefined||typeof v==='string'&&!v.trim())return null;if(typeof v!=='number'&&(typeof v!=='string'||!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(v.trim())))return NaN;const n=Number(v);return Number.isFinite(n)&&n>=lo&&n<=hi&&(!integer||Number.isInteger(n))?n:NaN;};
export const roundMoney=n=>Math.round((n+Number.EPSILON)*100)/100;
export function normalizeStockPurchasing(raw){
  const data={version:1,currency:'TWD',offers:[],plans:[]},issues=[],pending=[],fail=(field,message)=>issues.push({field:'stockPurchasing.'+field,message});
  if(raw===undefined)return {data,issues,pending};
  if(!raw||raw.version!==1||!currencies.includes(raw.currency)||!Array.isArray(raw.offers)||raw.offers.length>120||!Array.isArray(raw.plans)||raw.plans.length>120){fail('','供料報價格式錯誤；最多 120 筆料源與 120 組採購方案。');return {data,issues,pending};}
  data.currency=raw.currency;const ids=new Set();
  for(const source of raw.offers){
    if(!source||!idOK(source.id)||ids.has(source.id)){fail('','料源編號無效或重複。');continue;}ids.add(source.id);const o={id:source.id};
    for(const key of ['name','material','supplier','note']){const v=source[key]??'';if(typeof v!=='string'||v.length>(key==='note'?500:200)){fail(o.id+'.'+key,'供料文字格式錯誤或過長。');o[key]='';}else o[key]=key==='material'?materialKey(v):v;}
    o.kind=source.kind??'offcut';if(!Object.hasOwn(SUPPLY_KINDS,o.kind))fail(o.id+'.kind','請選整張板、餘板或裁切料。');
    for(const [key,lo,hi,integer] of [['thickness',.001,10000],['density',1,30000],['length',.001,30000],['width',.001,20000],['quantity',0,20000,true],['unitPrice',0,1e9],['fee',0,1e9]]){o[key]=num(source[key]??(key==='fee'?0:null),lo,hi,integer);if(Number.isNaN(o[key]))fail(o.id+'.'+key,'數值超出範圍；未知請留空。');if(['unitPrice','fee'].includes(key)&&Number.isFinite(o[key]))o[key]=roundMoney(o[key]);}
    if(o.fee===null)o.fee=0;
    const missing=[];if(!o.material)missing.push('材質');for(const key of ['thickness','length','width','unitPrice'])if(o[key]===null)missing.push({thickness:'板厚',length:'長',width:'寬',unitPrice:'單片報價'}[key]);if(o.kind!=='standard'&&o.quantity===null)missing.push('可供數量');
    if(missing.length)pending.push({id:o.id,field:'stockPurchasing.'+o.id+'.'+(!o.material?'material':o.thickness===null?'thickness':o.length===null?'length':o.width===null?'width':o.unitPrice===null?'unitPrice':'quantity'),message:o.id+' '+(o.name||SUPPLY_KINDS[o.kind])+'：待填 '+missing.join('、')});
    data.offers.push(o);
  }
  const keys=new Set();for(const source of raw.plans){if(!source||typeof source.key!=='string'||source.key.length>500||keys.has(source.key)||typeof source.fingerprint!=='string'||source.fingerprint.length>2000000||!['area','long','short'].includes(source.order)||!Array.isArray(source.sequence)||source.sequence.length>20000||source.sequence.some(id=>!idOK(id))){fail('plans','採購方案格式錯誤或重複。');continue;}keys.add(source.key);data.plans.push({key:source.key,order:source.order,sequence:[...source.sequence],fingerprint:source.fingerprint});}
  return {data,issues,pending};
}
export function offersForGroup(offers,group,allGroups){
  const material=group.materialKnown===false?'':group.material;
  return offers.filter(o=>materialKey(o.material)===materialKey(material)&&o.thickness===group.thickness&&(o.density===group.density||o.density===null&&allGroups.filter(g=>materialKey(g.materialKnown===false?'':g.material)===materialKey(material)&&g.thickness===group.thickness).length===1));
}
export const usableOffer=o=>Boolean(Object.hasOwn(SUPPLY_KINDS,o.kind)&&o.material&&Number.isFinite(o.thickness)&&o.thickness>0&&Number.isFinite(o.length)&&o.length>0&&Number.isFinite(o.width)&&o.width>0&&Number.isFinite(o.unitPrice)&&o.unitPrice>=0&&Number.isFinite(o.fee)&&o.fee>=0&&(o.quantity===null&&o.kind==='standard'||Number.isInteger(o.quantity)&&o.quantity>0));
export function expandStockBlanks(parts,{limit=20000}={}){
  const blanks=[];for(const part of parts){if(['formed','bar'].includes(part.kind))continue;const qty=part.pieces?.length??part.quantity;if(!Number.isInteger(qty)||qty<1||qty>limit-blanks.length)return {blanks:[],reason:'板片數量超過排料上限（20,000），請分批比較。'};
    for(let i=0;i<qty;i++){const piece=part.pieces?.[i],w=piece?.w??part.width,h=piece?.h??part.height;if(!(Number.isFinite(w)&&w>0&&Number.isFinite(h)&&h>0))return {blanks:[],reason:part.id+' 毛坯尺寸待填'};blanks.push({part:part.id,piece:i+1,label:part.group==='fabrication'?part.id+'-'+(i+1):part.id+(i+1),w,h,blankArea:piece?.blankArea??(part.kind==='circle'?Math.PI*w*w/4:w*h)});}
  }return {blanks,reason:''};
}
const ordered=(blanks,order)=>blanks.map((b,index)=>({...b,index})).sort((a,b)=>(order==='long'?Math.max(b.w,b.h)-Math.max(a.w,a.h):order==='short'?Math.min(b.w,b.h)-Math.min(a.w,a.h):b.w*b.h-a.w*a.h)||b.w*b.h-a.w*a.h||a.index-b.index);
function fillBoard(remaining,offer,kerf){
  const free=[{x:0,y:0,w:offer.length,h:offer.width}],placements=[],left=[];
  for(const b of remaining){let best=null;for(let i=0;i<free.length;i++){const f=free[i];for(const rotated of [false,true]){const w=rotated?b.h:b.w,h=rotated?b.w:b.h;if(w>f.w+1e-8||h>f.h+1e-8)continue;const score=Math.min(f.w-w,f.h-h)*1e8+(f.w*f.h-w*h);if(!best||score<best.score)best={i,f,w,h,rotated,score};}}
    if(!best){left.push(b);continue;}const {i,f,w,h,rotated}=best;free.splice(i,1);placements.push({...b,x:f.x,y:f.y,w,h,rotated});const dw=f.w-w-kerf,dh=f.h-h-kerf;
    if(dw>dh){if(dw>0)free.push({x:f.x+w+kerf,y:f.y,w:dw,h:f.h});if(dh>0)free.push({x:f.x,y:f.y+h+kerf,w,h:dh});}else{if(dh>0)free.push({x:f.x,y:f.y+h+kerf,w:f.w,h:dh});if(dw>0)free.push({x:f.x+w+kerf,y:f.y,w:dw,h});}
  }return {placements,free,left};
}
export function supplyFingerprint(parts,offers,currency,kerf){
  return JSON.stringify([currency,kerf,parts.map(p=>[p.id,p.kind,p.quantity,p.width,p.height,p.thickness,p.density,p.material,(p.pieces??[]).map(x=>[x.w,x.h,x.blankArea??null])]),[...offers].sort((a,b)=>a.id.localeCompare(b.id)).map(o=>[o.id,o.kind,o.material,o.thickness,o.density,o.length,o.width,o.quantity,o.unitPrice,o.fee])]);
}
export function packSupplySequence(blanks,offers,sequence,order,kerf){
  const byId=new Map(offers.filter(usableOffer).map(o=>[o.id,o])),used=new Map(),sheets=[];let remaining=ordered(blanks,order),cost=0;
  for(const id of sequence){const offer=byId.get(id),count=(used.get(id)??0)+1;if(!offer||offer.quantity!==null&&count>offer.quantity)return {feasible:false,reason:'料源失效、報價未齊或可供數量不足',sheets:[],cost:null};const packed=fillBoard(remaining,offer,kerf);if(!packed.placements.length)return {feasible:false,reason:'採購方案包含無法使用的板片，請重新比較',sheets:[],cost:null};remaining=packed.left;used.set(id,count);cost+=offer.unitPrice+(count===1?offer.fee:0);sheets.push({length:offer.length,width:offer.width,free:packed.free,placements:packed.placements.map(({index,...p})=>p),offerId:id,sourceKind:offer.kind,sourceLabel:offer.name||SUPPLY_KINDS[offer.kind],supplier:offer.supplier,unitPrice:offer.unitPrice,fee:count===1?offer.fee:0,offerQuantity:offer.quantity});}
  return {feasible:remaining.length===0,reason:remaining.length?'可供板料不足，尚有 '+remaining.length+' 片毛坯未排入':'',sheets,remaining:remaining.length,cost:remaining.length?null:roundMoney(cost),used:[...used].map(([id,qty])=>({id,qty}))};
}
/** Bounded beam search over purchasable sheets, not an area-only count. Every returned plan is replayed. */
export function optimizeSupply(parts,offers,{kerf=3,maxNodes=900,beamWidth=12}={}){
  const expanded=expandStockBlanks(parts);if(expanded.reason||!expanded.blanks.length)return {feasible:false,reason:expanded.reason||'尚無可比較毛坯',limited:false};
  if(expanded.blanks.length>1500)return {feasible:false,reason:'報價比較每組最多 1,500 片，請分批；原板估排仍保留',limited:true};
  const available=offers.filter(usableOffer);if(!available.length)return {feasible:false,reason:'尚無尺寸、數量與報價齊全的料源',limited:false};
  if(available.length*expanded.blanks.length>20000)return {feasible:false,reason:'本組料源／板片組合過多，請減少料源或分批比較',limited:true};
  let best=null,nodes=0,limited=false;
  const accept=(sequence,order)=>{const result=packSupplySequence(expanded.blanks,available,sequence,order,kerf);if(result.feasible&&(!best||result.cost<best.cost-1e-8||Math.abs(result.cost-best.cost)<1e-8&&sequence.length<best.sequence.length))best={...result,sequence,order};};
  // Complete single-supplier baselines remain available even when the mixed search is bounded.
  for(const order of ['area','long','short'])for(const offer of available){let remaining=ordered(expanded.blanks,order),sequence=[];while(remaining.length&&(offer.quantity===null||sequence.length<offer.quantity)){const filled=fillBoard(remaining,offer,kerf);if(!filled.placements.length)break;sequence.push(offer.id);remaining=filled.left;}if(!remaining.length)accept(sequence,order);}
  const cheapestArea=Math.min(...available.map(o=>o.unitPrice/(o.length*o.width)));
  for(const order of ['area','long','short']){let beam=[{remaining:ordered(expanded.blanks,order),sequence:[],used:Object.create(null),cost:0}],depth=0;
    while(beam.length&&depth++<Math.min(expanded.blanks.length,20000)){
      const next=[],seen=new Set();for(const state of beam)for(const offer of available){if(++nodes>maxNodes){limited=true;break;}const used=Object.hasOwn(state.used,offer.id)?state.used[offer.id]:0;if(offer.quantity!==null&&used>=offer.quantity)continue;const cost=state.cost+offer.unitPrice+(used===0?offer.fee:0);if(best&&cost>best.cost+1e-8)continue;const filled=fillBoard(state.remaining,offer,kerf);if(!filled.placements.length)continue;const sequence=[...state.sequence,offer.id];if(!filled.left.length){accept(sequence,order);continue;}const counts={...state.used,[offer.id]:used+1},key=JSON.stringify([filled.left.map(x=>x.index),Object.entries(counts).sort()]);if(seen.has(key))continue;seen.add(key);next.push({remaining:filled.left,sequence,used:counts,cost,score:cost+filled.left.reduce((s,b)=>s+b.w*b.h,0)*cheapestArea});}
      if(nodes>maxNodes)break;next.sort((a,b)=>a.score-b.score||a.remaining.length-b.remaining.length||a.cost-b.cost);beam=next.slice(0,beamWidth);
    }if(nodes>maxNodes)break;
  }
  return best?{...best,limited,nodes}:{feasible:false,reason:'已報價且數量可用的板料仍未找到完整排法；可補數量／更大料或調整分片',limited,nodes};
}
