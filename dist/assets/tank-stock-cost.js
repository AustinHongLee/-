import {estimateTank} from './tank-materials.js';
import {TANK_STOCKS,selectStockDimensions} from './tank-stock-config.js';
import {offersForGroup,usableOffer,optimizeSupply,supplyFingerprint,roundMoney} from './tank-stock-supply.js';
import {weldInventory} from './tank-process.js';
export const PURCHASE_MODES={whole:'只買整張板',pieces:'只用餘板／裁切料',mixed:'允許整張／餘板／裁切混買'};
const cache=new WeakMap();
const knownWeld=r=>(r.process?.weld.seams??weldInventory(r,r.attachments)).reduce((n,w)=>n+w.length,0);
const better=(a,b)=>!b||a.cost<b.cost-.005||Math.abs(a.cost-b.cost)<.005&&(a.knownWeldLength<b.knownWeldLength-1e-6||Math.abs(a.knownWeldLength-b.knownWeldLength)<1e-6&&a.sheetCount<b.sheetCount);
export function supplyLines(sheets,offers){
  const groups=new Map();for(const sheet of sheets){if(!sheet.offerId)continue;const o=offers.find(x=>x.id===sheet.offerId);if(!o)continue;if(!groups.has(o.id))groups.set(o.id,{...o,used:0,subtotal:0,sheetIDs:[]});const line=groups.get(o.id);line.used++;line.subtotal+=sheet.unitPrice+sheet.fee;if(sheet.id)line.sheetIDs.push(sheet.id);}
  return [...groups.values()].map(x=>({...x,subtotal:roundMoney(x.subtotal),remaining:x.quantity===null?null:x.quantity-x.used}));
}
/** Prices are per physical sheet/piece. No scrap credit, unquoted supply or area-only coverage. */
export function compareStockPurchases(r){
  if(!r?.valid||!r.stockPlan)return {groups:[],partial:true};if(cache.has(r))return cache.get(r);
  const purchase=r.input.stockPurchasing,baselineWeld=knownWeld(r),groups=[];
  for(const group of r.stockPlan.groups){
    const offers=offersForGroup(purchase.offers,group,r.stockPlan.groups),parts=r.stockParts.filter(p=>group.partIDs.includes(p.id)),automatic=parts.some(p=>p.group!=='fabrication'),dims=[{stockWidth:group.width,stockLength:group.length}],seen=new Set(dims.map(s=>s.stockLength+'x'+s.stockWidth));
    if(automatic)for(const d of [...TANK_STOCKS,...offers.filter(usableOffer).map(o=>({stockWidth:o.width,stockLength:o.length}))]){const key=d.stockLength+'x'+d.stockWidth;if(!seen.has(key)){seen.add(key);dims.push(d);}}
    const variants=dims.slice(0,10),bestByMode=new Map();let limited=dims.length>10,validGeometry=false,geometryReason='';
    for(const development of variants){
      const same=development.stockWidth===group.width&&development.stockLength===group.length;
      const candidate=automatic&&!same?estimateTank({...r.input,stockSelections:selectStockDimensions(r.input.stockSelections,group,development),stockPurchasing:{...purchase,plans:[]}},{process:false}):r;
      const g=candidate.stockPlan?.groups.find(x=>x.selectionKey===group.selectionKey);
      if(!candidate.valid||candidate.shellLayoutState?.valid===false||!g||!candidate.fabrication.valid){geometryReason=candidate.issues?.[0]?.message||candidate.fabrication?.issues?.[0]?.message||'請先補齊分片／工法設定';continue;}validGeometry=true;
      const demands=candidate.stockParts.filter(p=>g.partIDs.includes(p.id));if(demands.length!==parts.length)continue;
      for(const [mode,name] of Object.entries(PURCHASE_MODES)){
        const supplies=offers.filter(o=>mode==='whole'?o.kind==='standard':mode==='pieces'?o.kind!=='standard':true),packed=optimizeSupply(demands,supplies,{kerf:r.input.kerf});limited||=packed.limited;
        if(!packed.feasible)continue;
        const purchasedArea=packed.sheets.reduce((n,s)=>n+s.length*s.width,0),blankArea=packed.sheets.reduce((n,s)=>n+s.placements.reduce((a,b)=>a+b.blankArea,0),0),free=packed.sheets.flatMap(s=>s.free),freeArea=free.reduce((n,f)=>n+f.w*f.h,0),largestFree=free.reduce((b,f)=>!b||f.w*f.h>b.w*b.h?f:b,null),mass=area=>group.density===null?null:area*group.thickness*group.density/1e9;
        const option={...packed,mode,name,development,automatic,knownWeldLength:knownWeld(candidate),courses:candidate.courses,panelsPerCourse:candidate.panelsPerCourse,sheetCount:packed.sheets.length,purchasedArea,blankArea,weight:mass(purchasedArea),offcutWeight:mass(Math.max(0,purchasedArea-blankArea)),reusableWeight:mass(freeArea),freeArea,largestFree,utilization:blankArea/purchasedArea*100,lines:supplyLines(packed.sheets,offers),fingerprint:supplyFingerprint(demands,offers.filter(o=>packed.sequence.includes(o.id)),purchase.currency,r.input.kerf)};
        if(better(option,bestByMode.get(mode)))bestByMode.set(mode,option);
      }
    }
    const options=Object.entries(PURCHASE_MODES).map(([mode,name])=>bestByMode.get(mode)??{mode,name,feasible:false,cost:null,reason:!offers.some(usableOffer)?'沒有尺寸、數量與報價齊全的同材同厚料源':!validGeometry?geometryReason:'可用數量／尺寸不足，或本次搜尋未找到完整排法'}),best=options.reduce((b,o)=>o.feasible&&better(o,b)?o:b,null),whole=bestByMode.get('whole');
    groups.push({group,offers,automatic,options,best,limited,unquoted:offers.filter(o=>o.unitPrice===null).length,incomplete:offers.filter(o=>!usableOffer(o)).length,baselineWeld,saving:best&&whole?roundMoney(Math.max(0,whole.cost-best.cost)):null});
  }
  const all=groups.length>0&&groups.every(x=>x.best),allWhole=groups.length>0&&groups.every(x=>x.options[0].feasible),total=all?roundMoney(groups.reduce((n,x)=>n+x.best.cost,0)):null,wholeTotal=allWhole?roundMoney(groups.reduce((n,x)=>n+x.options[0].cost,0)):null;
  const model={groups,currency:purchase.currency,total,wholeTotal,saving:total!==null&&wholeTotal!==null?roundMoney(Math.max(0,wholeTotal-total)):null,partial:!r.stockPlan.procurementComplete||r.fabrication.valid===false||r.stockPlan.pending.length>0,limited:groups.some(x=>x.limited)};cache.set(r,model);return model;
}
export function applyPurchaseOption(r,key,mode='best'){
  const item=compareStockPurchases(r).groups.find(x=>x.group.selectionKey===key),option=mode==='best'?item?.best:item?.options.find(o=>o.mode===mode);if(!option?.feasible)throw new Error('本組尚無完整可採購的排法，請先補料源報價與數量。');
  const purchase=r.input.stockPurchasing;return {stockSelections:selectStockDimensions(r.input.stockSelections,item.group,option.development),stockPurchasing:{...purchase,plans:[...purchase.plans.filter(p=>p.key!==key),{key,sequence:option.sequence,order:option.order,fingerprint:option.fingerprint}]}};
}
