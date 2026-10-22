import {materialKey,stockFor,stockSelectionKey} from './tank-stock-config.js';
import {offersForGroup,supplyFingerprint,expandStockBlanks,packSupplySequence,roundMoney} from './tank-stock-supply.js';
export {materialKey} from './tank-stock-config.js';
// One stock ledger for geometry parts and project-owned fabrication parts.
// Finished mass and purchased plate mass are different accounts.
export const STOCK_MODES={auto:'依零件尺寸加留料',blank:'指定展開毛坯／矩形包絡',purchase:'外購成品，不列原板'};
const kg=(area,t,rho)=>Number.isFinite(rho)?area*t*rho/1e9:null;
const positive=n=>Number.isFinite(n)&&n>0;
export const placementLabel=item=>item.label??item.part+item.piece;
export const stockMaterial=part=>materialKey(part.material)||'槽體材質待填';
const fits=(w,h,p)=>w<=p.stockLength+1e-8&&h<=p.stockWidth+1e-8||h<=p.stockLength+1e-8&&w<=p.stockWidth+1e-8;
const groupKey=(part,p)=>stockSelectionKey(part.material,part.thickness,part.density===undefined?p.density:part.density);
const piecesOf=part=>part.pieces??Array.from({length:part.quantity},()=>({w:part.width,h:part.height,blankArea:part.kind==='circle'?Math.PI*part.width**2/4:part.width*part.height}));

/** First-fit guillotine packing; no hole nesting or inferred shape cutting. */
export function packTankParts(parts,p,{rejected=[],limit=20000,purchasePending=[]}={}){
  const sheets=[],buckets=new Map();let count=0;
  const groups=new Map(),handled=new Set();
  for(const part of parts){if(['formed','bar'].includes(part.kind))continue;const key=groupKey(part,p);if(!groups.has(key))groups.set(key,{key,selectionKey:key,material:part.material,materialKnown:Boolean(materialKey(part.material)),thickness:part.thickness,density:part.density===undefined?p.density:part.density,parts:[]});groups.get(key).parts.push(part);}
  for(const group of groups.values()){
    const plan=p.stockPurchasing?.plans.find(x=>x.key===group.key);if(!plan)continue;
    const usedIDs=new Set(plan.sequence),offers=offersForGroup(p.stockPurchasing.offers,group,[...groups.values()]),fingerprint=supplyFingerprint(group.parts,offers.filter(o=>usedIDs.has(o.id)),p.stockPurchasing.currency,p.kerf),expanded=expandStockBlanks(group.parts,{limit:limit-count});
    const packed=plan.fingerprint===fingerprint&&!expanded.reason?packSupplySequence(expanded.blanks,offers,plan.sequence,plan.order,p.kerf):null;
    if(!packed?.feasible){purchasePending.push({id:group.material,field:'stockPurchasing.plans',message:(group.material||'材質待填')+' t'+group.thickness+'：採購方案已失效，請重新比較並套用；目前回到未報價的原板估排。'});continue;}
    for(const part of group.parts)handled.add(part.id);count+=expanded.blanks.length;
    for(const sheet of packed.sheets){sheets.push({...sheet,id:sheets.length+1,key:group.key,material:stockMaterial(group),materialKnown:group.materialKnown,thickness:group.thickness,density:group.density,currency:p.stockPurchasing.currency,placements:sheet.placements.map(item=>({...item,blankWeight:kg(item.blankArea,group.thickness,group.density)}))});}
  }
  for(const part of parts){
    if(handled.has(part.id))continue;
    const board={...p,...stockFor(p,part.material,part.thickness,part.density===undefined?p.density:part.density)};
    if(['formed','bar'].includes(part.kind))continue;
    const quantity=part.pieces?.length??part.quantity;
    if(!Number.isInteger(quantity)||quantity<1||quantity>limit-count){rejected.push({part,reason:'count'});continue;}
    if(part.fits===false||part.perSheet===0||!positive(part.thickness)){rejected.push({part,reason:'size'});continue;}
    const pieces=piecesOf(part);
    if(pieces.some(x=>!positive(x.w)||!positive(x.h)||!fits(x.w,x.h,board))){rejected.push({part,reason:'size'});continue;}
    count+=quantity;
    const key=groupKey(part,board),candidates=buckets.get(key)??[];if(!buckets.has(key))buckets.set(key,candidates);
    for(let piece=0;piece<pieces.length;piece++){
      const source=pieces[piece],pw=source.w,ph=source.h;let chosen=null;
      for(const sheet of candidates){for(let i=0;i<sheet.free.length;i++){const f=sheet.free[i];for(const rotated of [false,true]){const w=rotated?ph:pw,h=rotated?pw:ph;if(w<=f.w+1e-8&&h<=f.h+1e-8){chosen={sheet,index:i,f,w,h,rotated};break;}}if(chosen)break;}if(chosen)break;}
      if(!chosen){const sheet={id:sheets.length+1,key,material:stockMaterial(part),materialKnown:Boolean(materialKey(part.material)),density:part.density===undefined?p.density:part.density,thickness:part.thickness,width:board.stockWidth,length:board.stockLength,free:[{x:0,y:0,w:board.stockLength,h:board.stockWidth}],placements:[]};sheets.push(sheet);candidates.push(sheet);const rotated=!(pw<=board.stockLength+1e-8&&ph<=board.stockWidth+1e-8);chosen={sheet,index:0,f:sheet.free[0],w:rotated?ph:pw,h:rotated?pw:ph,rotated};}
      const {sheet,index,f,w,h,rotated}=chosen;sheet.free.splice(index,1);
      const area=source.blankArea??(part.kind==='circle'?Math.PI*pw*pw/4:pw*ph),blankWeight=kg(area,part.thickness,part.density===undefined?p.density:part.density);
      sheet.placements.push({part:part.id,piece:piece+1,label:part.group==='fabrication'?part.id+'-'+(piece+1):part.id+(piece+1),x:f.x,y:f.y,w,h,rotated,blankArea:area,blankWeight});
      const dw=f.w-w-p.kerf,dh=f.h-h-p.kerf;
      if(dw>dh){if(dw>0)sheet.free.push({x:f.x+w+p.kerf,y:f.y,w:dw,h:f.h});if(dh>0)sheet.free.push({x:f.x,y:f.y+h+p.kerf,w,h:dh});}
      else{if(dh>0)sheet.free.push({x:f.x,y:f.y+h+p.kerf,w:f.w,h:dh});if(dw>0)sheet.free.push({x:f.x+w+p.kerf,y:f.y,w:dw,h});}
    }
  }return sheets;
}

export function planPlateStock(baseParts,fabrication,p){
  const pending=[],details=[],excluded=[],rows=new Map(),issue=(row,key,message)=>{
    const entry={id:row.id,part:row.id,field:`fabricationData.${row.id}.${key}`,message:row.id+' '+row.name+'：'+message};pending.push(entry);row.stock.message=entry.message;return entry;
  };
  for(const part of baseParts){part.material=p.material||'';part.density=p.density;part.stock={status:['formed','bar'].includes(part.kind)?'purchase':'pending',sheetIDs:[]};}
  for(const row of fabrication.parts){
    const mode=row.stockMode??'auto';rows.set(row.id,row);row.stock={status:'pending',sheetIDs:[],mode};
    if(!['plate','ring','profile'].includes(row.kind)||mode==='purchase'){row.stock.status='purchase';row.stock.message='外購／管棒料，不占原板';excluded.push(row);continue;}
    if(!Number.isInteger(row.quantity)||row.quantity<1){issue(row,'qty','數量未有效設定，未排料');continue;}
    if(row.kind==='profile'&&mode==='auto'){issue(row,'stockMode','請指定已確認的展開毛坯，或改列外購成品');continue;}
    if(!materialKey(row.material)){issue(row,'material','材質待填，暫不與其他材料共板');continue;}
    if(!positive(row.thickness)){issue(row,'thickness','板厚待填，未排料');continue;}
    const trim=mode==='auto'?(row.trim??p.trim):0;
    let width,height,kind='rectangle',missing;
    if(mode==='blank'){width=row.blankLength;height=row.blankWidth;missing=!positive(width)?'blankLength':!positive(height)?'blankWidth':null;}
    else if(row.kind==='ring'){width=height=positive(row.od)?row.od+2*trim:null;kind='circle';missing=!positive(row.od)?'od':null;}
    else{width=positive(row.length)?row.length+2*trim:null;height=positive(row.width)?row.width+2*trim:null;missing=!positive(row.length)?'length':!positive(row.width)?'width':null;}
    if(missing){issue(row,missing,'毛坯尺寸待填，未排料');continue;}
    // A declared blank may be larger than a finished piece, never smaller.
    if(mode==='blank'&&row.kind!=='profile'){
      const fw=row.kind==='ring'?row.od:row.length,fh=row.kind==='ring'?row.od:row.width;
      if(positive(fw)&&positive(fh)&&!((width>=fw-1e-8&&height>=fh-1e-8)||(height>=fw-1e-8&&width>=fh-1e-8))){issue(row,'blankLength','毛坯包絡小於所填成品尺寸，未排料');continue;}
    }
    const area=kind==='circle'?Math.PI*width**2/4:width*height,density=positive(row.density)?row.density:null,board=stockFor(p,row.material,row.thickness,density);
    const part={id:row.id,name:row.name,group:'fabrication',bomId:row.id,material:row.material,density,thickness:row.thickness,width,height,quantity:row.quantity,kind,trim,innerDiameter:row.kind==='ring'?row.idiameter:null,blankArea:area,blankWeight:density===null?null:kg(area,row.thickness,density)*row.quantity,netWeight:row.weightBasis==='blank'?null:row.weight,fits:fits(width,height,board),perSheet:fits(width,height,board)?null:0,stock:row.stock};
    details.push(part);Object.assign(row.stock,{width,height,trim,blankUnitWeight:kg(area,row.thickness,density),message:mode==='blank'?'按指定毛坯；不另加留料':`各邊留料 ${trim} mm`});
    if(density===null)issue(row,'density','密度待填，張數可估、採購重量未知');
  }
  const parts=[...baseParts,...details],rejected=[],purchasePending=[],sheets=packTankParts(parts,p,{rejected,purchasePending}),byId=new Map(parts.map(part=>[part.id,part]));
  const materialIssues=[];
  for(const {part,reason} of rejected){
    const field=part.group==='fabrication'?`fabricationData.${part.id}.${reason==='count'?'qty':(rows.get(part.id).stockMode==='blank'?'blankLength':rows.get(part.id).kind==='ring'?'od':'length')}`:part.group==='attachment'?'methods':p.stockWidth<p.stockLength?'stockWidth':'stockLength';
    const message=reason==='count'?`${part.id} 數量超過可排料上限（本次最多 20,000 片），請分批規劃。`:`${part.id} ${part.name} 毛坯放不進原板；請換板型或調整分片／毛坯尺寸。`;
    materialIssues.push({field,part:part.id,message});part.stock={...part.stock,status:reason==='count'?'limit':'oversize',message};if(rows.has(part.id))rows.get(part.id).stock=part.stock;
  }
  const placements=new Map();
  for(const sheet of sheets)for(const item of sheet.placements){if(!placements.has(item.part))placements.set(item.part,[]);placements.get(item.part).push({sheet:sheet.id,piece:item.piece,label:item.label,x:item.x,y:item.y,w:item.w,h:item.h,rotated:item.rotated});}
  for(const part of parts){
    const located=placements.get(part.id)??[];part.sheetIDs=[...new Set(located.map(x=>x.sheet))];
    if(located.length){Object.assign(part.stock,{status:part.density===null?'weight-pending':'packed',sheetIDs:part.sheetIDs,sourceIDs:[...new Set(sheets.filter(s=>part.sheetIDs.includes(s.id)&&s.offerId).map(s=>s.offerId))],placements:located,width:part.width,height:part.height});}
    if(rows.has(part.id))rows.get(part.id).stock=part.stock;
  }
  const groups=new Map();
  for(const part of parts){
    if(['formed','bar'].includes(part.kind))continue;
    const board=stockFor(p,part.material,part.thickness,part.density),key=groupKey(part,{...p,...board});
    if(!groups.has(key))groups.set(key,{id:'G'+(groups.size+1),key,selectionKey:board.selectionKey,material:stockMaterial(part),materialKnown:Boolean(materialKey(part.material)),thickness:part.thickness,density:part.density,width:board.stockWidth,length:board.stockLength,stockId:board.stockId,sheetIDs:[],partIDs:[],knownWeight:0,weight:0,blankWeight:0,offcutWeight:0,purchasedArea:0,blankArea:0,unplaced:0});
    const group=groups.get(key);group.partIDs.push(part.id);if(!part.sheetIDs?.length)group.unplaced++;
  }
  for(const sheet of sheets){
    sheet.weight=kg(sheet.width*sheet.length,sheet.thickness,sheet.density);
    sheet.blankWeight=sheet.placements.some(x=>x.blankWeight===null)?null:sheet.placements.reduce((sum,x)=>sum+x.blankWeight,0);
    sheet.offcutWeight=sheet.weight===null||sheet.blankWeight===null?null:Math.max(0,sheet.weight-sheet.blankWeight);
    sheet.utilization=sheet.placements.reduce((sum,x)=>sum+x.blankArea,0)/(sheet.width*sheet.length)*100;
    const group=groups.get(sheet.key);
    sheet.group=group.id;group.sheetIDs.push(sheet.id);for(const item of sheet.placements)if(!group.partIDs.includes(item.part))group.partIDs.push(item.part);
    group.purchasedArea+=sheet.width*sheet.length;group.blankArea+=sheet.placements.reduce((sum,x)=>sum+x.blankArea,0);group.knownWeight+=sheet.weight??0;group.weight=group.weight===null||sheet.weight===null?null:group.weight+sheet.weight;group.blankWeight=group.blankWeight===null||sheet.blankWeight===null?null:group.blankWeight+sheet.blankWeight;group.offcutWeight=group.offcutWeight===null||sheet.offcutWeight===null?null:group.offcutWeight+sheet.offcutWeight;
  }
  const groupList=[...groups.values()].map(g=>{const actual=sheets.filter(s=>s.key===g.key),sizes=new Map();for(const s of actual){const key=JSON.stringify([s.length,s.width,s.offerId??'']);if(!sizes.has(key))sizes.set(key,{length:s.length,width:s.width,offerId:s.offerId??null,sourceLabel:s.sourceLabel??'整張板（未報價）',quantity:0});sizes.get(key).quantity++;}return {...g,sheetCount:actual.length,stockSizes:[...sizes.values()],mixed:sizes.size>1,cost:actual.length&&!g.unplaced&&actual.every(s=>Number.isFinite(s.unitPrice))?roundMoney(actual.reduce((n,s)=>n+s.unitPrice+s.fee,0)):null};}),unknownSheets=sheets.filter(s=>s.weight===null).length;
  const pricedSheets=sheets.filter(s=>Number.isFinite(s.unitPrice)),knownCost=roundMoney(pricedSheets.reduce((n,s)=>n+s.unitPrice+s.fee,0)),cost=sheets.length&&pricedSheets.length===sheets.length&&!materialIssues.length&&!pending.length?knownCost:null;
  const knownStockWeight=sheets.reduce((s,x)=>s+(x.weight??0),0),knownAllocatedBlankWeight=sheets.reduce((s,x)=>s+(x.blankWeight??0),0),knownOffcutWeight=sheets.reduce((s,x)=>s+(x.offcutWeight??0),0);
  const stockWeight=unknownSheets?null:knownStockWeight,allocatedBlankWeight=unknownSheets?null:knownAllocatedBlankWeight,offcutWeight=unknownSheets?null:knownOffcutWeight;
  const unweighedBlankParts=parts.filter(part=>!['formed','bar'].includes(part.kind)&&part.blankWeight===null),knownBlankWeight=parts.reduce((s,part)=>s+(part.blankWeight??0),0);
  const warnings=[];const densities=new Map();for(const group of groupList){const key=JSON.stringify([group.material,group.thickness]);if(!densities.has(key))densities.set(key,new Set());densities.get(key).add(group.density);}
  if([...densities.values()].some(set=>set.size>1))warnings.push('相同材質／板厚填了不同密度，本次分開用板；請核對材料密度。');
  if(groupList.some(g=>!g.materialKnown))warnings.push('槽體材質尚未指定：沿用槽體的板件暫作同一組估排，不能直接當材料採購規格。');
  return {parts,detailParts:details,sheets,groups:groupList,pending,excluded,materialIssues,warnings,purchasePending,knownCost,cost,currency:p.stockPurchasing?.currency??'TWD',unpricedSheets:sheets.length-pricedSheets.length,stockComplete:!materialIssues.length&&!pending.length,procurementComplete:!materialIssues.length&&!pending.length&&groupList.every(g=>g.materialKnown),plateSheets:sheets.length,stockWeight,knownStockWeight,allocatedBlankWeight,knownAllocatedBlankWeight,offcutWeight,knownOffcutWeight,unknownSheets,blankWeight:unweighedBlankParts.length?null:knownBlankWeight,knownBlankWeight,utilization:stockWeight===null?null:stockWeight?allocatedBlankWeight/stockWeight*100:0,byId};
}
