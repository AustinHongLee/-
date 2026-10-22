// Purchased sizes are nominal international feet; keep actual custom stock as the fallback.
export const TANK_STOCKS=Object.freeze([
  Object.freeze({id:'4x8',label:'4′ × 8′',stockWidth:1219.2,stockLength:2438.4}),
  Object.freeze({id:'5x10',label:'5′ × 10′',stockWidth:1524,stockLength:3048}),
  Object.freeze({id:'5x20',label:'5′ × 20′',stockWidth:1524,stockLength:6096})
]);
export const materialKey=s=>String(s??'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
export const stockSelectionKey=(material,t,density)=>JSON.stringify([materialKey(material),Number(t),density===null?null:Number(density)]);
export const stockPreset=p=>TANK_STOCKS.find(s=>Math.abs(s.stockWidth-p.stockWidth)<1e-6&&Math.abs(s.stockLength-p.stockLength)<1e-6);
export const stockLabel=p=>stockPreset(p)?.label??'自訂原板';
export function normalizeStockSelections(value){
  if(value===undefined)return {items:[],issues:[]};
  const items=[],issues=[],seen=new Set(),fail=message=>issues.push({field:'stockSelections',message});
  if(!Array.isArray(value)||value.length>1600){fail('分組用板格式錯誤，最多 1,600 組。');return {items,issues};}
  for(const row of value){
    if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.material!=='string'||row.material.length>200||typeof row.thickness!=='number'||!Number.isFinite(row.thickness)||row.thickness<=0||row.thickness>10000||!(row.density===null||typeof row.density==='number'&&Number.isFinite(row.density)&&row.density>=1&&row.density<=30000)||!(TANK_STOCKS.some(s=>s.id===row.stock)||row.stock==='custom'&&Number.isFinite(row.stockWidth)&&row.stockWidth>0&&row.stockWidth<=20000&&Number.isFinite(row.stockLength)&&row.stockLength>0&&row.stockLength<=30000)) {fail('分組用板需包含有效材質、板厚、密度及板型尺寸。');continue;}
    const item={material:materialKey(row.material),thickness:row.thickness,density:row.density,stock:row.stock,...(row.stock==='custom'?{stockWidth:row.stockWidth,stockLength:row.stockLength}:{})},key=stockSelectionKey(row.material,row.thickness,row.density);
    if(seen.has(key)){fail('相同材質、板厚與密度的板型設定重複。');continue;}seen.add(key);items.push(item);
  }return {items,issues};
}
export function stockFor(p,material,t,density=p.density){
  const selectionKey=stockSelectionKey(material,t,density),choice=Array.isArray(p.stockSelections)?p.stockSelections.find(row=>stockSelectionKey(row.material,row.thickness,row.density)===selectionKey):null,stock=TANK_STOCKS.find(s=>s.id===choice?.stock);
  return {stockWidth:stock?.stockWidth??choice?.stockWidth??p.stockWidth,stockLength:stock?.stockLength??choice?.stockLength??p.stockLength,stockId:stock?.id??(choice?.stock==='custom'?'custom':'inherit'),selectionKey};
}
export function selectStockDimensions(selections,group,board){
  const preset=stockPreset(board);if(preset)return selectStockGroup(selections,group,preset.id);
  return [...selectStockGroup(selections,group,'inherit'),{material:materialKey(group.materialKnown===false?'':group.material),thickness:group.thickness,density:group.density,stock:'custom',stockWidth:board.stockWidth,stockLength:board.stockLength}];
}
export function selectStockGroup(selections,group,stock){
  const key=stockSelectionKey(group.materialKnown===false?'':group.material,group.thickness,group.density),rest=(selections??[]).filter(row=>stockSelectionKey(row.material,row.thickness,row.density)!==key);
  return stock==='inherit'?rest:[...rest,{material:materialKey(group.materialKnown===false?'':group.material),thickness:group.thickness,density:group.density,stock}];
}
