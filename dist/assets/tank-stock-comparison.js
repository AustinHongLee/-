import {estimateTank} from './tank-materials.js';
import {packTankParts} from './tank-stock-plan.js';
import {TANK_STOCKS,stockPreset,selectStockDimensions} from './tank-stock-config.js';
import {weldInventory} from './tank-process.js';
const cache=new WeakMap();
const weldLength=r=>(r.process?.weld.seams??weldInventory(r,r.attachments)).reduce((sum,w)=>sum+w.length,0);
function metrics(sheets,density,t){
  const purchasedArea=sheets.reduce((sum,s)=>sum+s.length*s.width,0),blankArea=sheets.reduce((sum,s)=>sum+s.placements.reduce((a,x)=>a+x.blankArea,0),0),free=sheets.flatMap(s=>s.free),freeArea=free.reduce((sum,f)=>sum+f.w*f.h,0),largestFree=free.reduce((best,f)=>f.w*f.h>(best?.w??0)*(best?.h??0)?f:best,null),mass=area=>density===null?null:area*t*density/1e9;
  return {sheetCount:sheets.length,purchasedArea,blankArea,weight:mass(purchasedArea),offcutWeight:mass(Math.max(0,purchasedArea-blankArea)),reusableWeight:mass(freeArea),utilization:purchasedArea?blankArea/purchasedArea*100:0,largestFree:largestFree?{w:largestFree.w,h:largestFree.h}:null};
}
/** Each material group is independent. Rebuild automatic developments; fixed detail blanks only need repacking. */
export function compareMaterialStocks(r){
  if(!r?.valid||!r.stockPlan)return {groups:[],changes:[],currentWeight:null,recommendedWeight:null,savingWeight:null,partial:true};
  if(cache.has(r))return cache.get(r);
  const partial=Boolean(r.stockPlan.pending.length||r.materialIssues.length||!r.stockPlan.procurementComplete||r.fabrication?.valid===false),baselineWeld=weldLength(r),groups=[];
  for(const group of r.stockPlan.groups){
    const parts=r.stockParts.filter(p=>group.partIDs.includes(p.id)),automatic=parts.some(p=>p.group!=='fabrication'),quoted=r.sheets.some(s=>s.group===group.id&&s.offerId),currentPreset=stockPreset({stockWidth:group.width,stockLength:group.length}),stocks=[...TANK_STOCKS];
    if(!currentPreset)stocks.push({id:'inherit',label:'目前自訂原板',stockWidth:group.width,stockLength:group.length});
    const options=stocks.map(stock=>{
      let sheets=[],feasible=false,reason='',knownWeldLength=baselineWeld,courses=r.courses,panelsPerCourse=r.panelsPerCourse;
      const selected=!quoted&&Math.abs(stock.stockWidth-group.width)<1e-6&&Math.abs(stock.stockLength-group.length)<1e-6;
      if(automatic){
        const candidate=selected&&!r.input.stockPurchasing.plans.some(p=>p.key===group.selectionKey)?r:estimateTank({...r.input,stockSelections:selectStockDimensions(r.input.stockSelections,group,stock),stockPurchasing:{...r.input.stockPurchasing,plans:[]}},{process:false}),g=candidate.stockPlan?.groups.find(g=>g.selectionKey===group.selectionKey);
        if(candidate.valid&&g){sheets=candidate.sheets.filter(s=>s.group===g.id);feasible=candidate.shellLayoutState?.valid!==false&&g.unplaced===0&&sheets.length>0&&candidate.fabrication.valid;courses=candidate.courses;panelsPerCourse=candidate.panelsPerCourse;knownWeldLength=weldLength(candidate);}
        if(!feasible)reason=candidate.shellLayoutState?.issues?.[0]?.message||candidate.issues?.[0]?.message||candidate.fabrication?.issues?.[0]?.message||candidate.materialIssues?.find(i=>g?.partIDs.includes(i.part))?.message||'此板型無法完整容納本組毛坯';
      }else{
        const rejected=[];sheets=packTankParts(parts.map(p=>({...p,fits:true,perSheet:null})),{...r.input,stockSelections:selectStockDimensions(r.input.stockSelections,group,stock),stockPurchasing:{...r.input.stockPurchasing,plans:[]}},{rejected});feasible=!rejected.length&&sheets.length>0;if(!feasible)reason=rejected.some(x=>x.reason==='count')?'超過排料片數上限':'毛坯放不進此板型';
      }
      return {...stock,...metrics(sheets,group.density,group.thickness),selected,feasible,reason,knownWeldLength,courses,panelsPerCourse};
    });
    const feasible=options.filter(x=>x.feasible).sort((a,b)=>Math.abs(a.purchasedArea-b.purchasedArea)>1e-4?a.purchasedArea-b.purchasedArea:a.sheetCount-b.sheetCount||a.knownWeldLength-b.knownWeldLength||Number(b.selected)-Number(a.selected)),best=feasible[0]??null,current=options.find(x=>x.selected),change=best&&!best.selected?{group,stock:best.id}:null;
    groups.push({group,automatic,quoted,options,best,current,change,savingWeight:best&&current?.feasible&&current.weight!==null&&best.weight!==null?Math.max(0,current.weight-best.weight):null});
  }
  const complete=groups.every(g=>g.best&&g.best.weight!==null),recommendedWeight=complete?groups.reduce((sum,g)=>sum+g.best.weight,0):null,currentWeight=r.stockPlan.stockWeight,savingWeight=recommendedWeight!==null&&currentWeight!==null&&groups.every(g=>g.current?.feasible)?Math.max(0,currentWeight-recommendedWeight):null;
  const model={groups,changes:groups.flatMap(g=>g.change?[g.change]:[]),partial,currentWeight,recommendedWeight,savingWeight,baselineWeld,basis:'同材質／同板厚按採購板面積（密度已知時即重量）由少到多；同量先取張數少、已知焊長短者。沒有報價，不代表最低金額。'};
  cache.set(r,model);return model;
}
export function applyStockRecommendations(r,key=null){
  const comparison=compareMaterialStocks(r);let selections=r.input.stockSelections;
  for(const item of comparison.groups)if(item.best&&(key===null||item.group.selectionKey===key))selections=selectStockDimensions(selections,item.group,item.best);
  return selections;
}
