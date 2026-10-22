import {stockSupplyCSVRows,stockSupplyPages} from './tank-stock-cost-report.js';
import {compareMaterialStocks} from './tank-stock-comparison.js';
import {esc,fmt,sheetSketch,sheetGroups} from './tank-visuals.js';
import {placementLabel} from './tank-stock-plan.js';
const sizes=g=>(g.stockSizes?.length?g.stockSizes.map(x=>fmt(x.length)+' × '+fmt(x.width)+' mm × '+x.quantity+(x.offerId?'（'+x.offerId+'）':'')).join('；'):fmt(g.length)+' × '+fmt(g.width)+' mm');
const weight=n=>Number.isFinite(n)?fmt(n,2)+' kg':'待填密度';
export function stockStatusText(stock){
  if(!stock)return '未對應原板';
  if(stock.sheetIDs?.length)return '原板 #'+stock.sheetIDs.join('、#')+(stock.sourceIDs?.length?' · 料源 '+stock.sourceIDs.join('／'):'')+(stock.status==='weight-pending'?' · 密度待填':'');
  if(stock.status==='purchase')return '外購／非板料';
  return stock.message||'排料資料待補';
}
export function stockSummaryMarkup(r,{interactive=false,selectedGroup='',selectedPart=''}={}){
  const s=r.stockPlan;if(!s)return '';const pending=[...s.pending,...s.materialIssues];
  return `<section class="tank-stock-ledger"><header><div><h3>依材質與板厚備料</h3><p>${s.plateSheets} 張已排原板 · ${s.groups.length} 組材料${pending.length?' · '+pending.length+' 項備料資料待補':''}</p></div>${interactive?'<button type="button" data-stock-group="" class="tank-secondary">全部原板</button>':''}</header><div class="tank-stock-groups">${s.groups.map(g=>`<${interactive?'button type="button" data-stock-group="'+g.id+'" aria-pressed="'+(selectedGroup===g.id)+'"':'article'}><span>${esc(g.material)}</span><strong>t${fmt(g.thickness)} mm <b>${g.sheetCount} 張</b></strong><small>${esc(sizes(g))} · ${weight(g.weight)}</small><small>${g.sheetIDs.length?'原板 #'+g.sheetIDs.join('、#'):'尚未排入原板'}${g.unplaced?' · '+g.unplaced+' 項未排入':''}</small></${interactive?'button':'article'}>`).join('')||'<p>尚無可排入的板件。</p>'}</div><p class="tank-note">${s.stockWeight===null?'已知採購重量 '+weight(s.knownStockWeight)+'，另有 '+s.unknownSheets+' 張密度待填。':'原板採購 '+weight(s.stockWeight)+'；成品重量在 BOM 另列，不重複加計。'}僅相同材質、板厚及密度共板；外購件不占原板。</p>${selectedPart?`<p class="tank-stock-selected">目前標示 ${esc(selectedPart)}</p>`:''}${pending.length?`<details class="tank-details"><summary>${pending.length} 項還不能完成備料，點項目補資料</summary><div class="tank-stock-pending">${pending.map(x=>interactive?`<button type="button" data-stock-focus="${esc(x.field)}">${esc(x.message)} ↗</button>`:`<p>${esc(x.message)}</p>`).join('')}</div></details>`:''}${s.warnings.map(x=>'<p class="tank-note">'+esc(x)+'</p>').join('')}</section>`;
}
export function stockCSVRows(r){
  const s=r.stockPlan;if(!s)return [];
  const rows=[[],['原板採購總表（含已確認的分件毛坯）'],['採購狀態',s.procurementComplete?'可依分組備料（未保證最少張數）':'部分估排，尚有尺寸／材料／重量資料待核'],['已排張數',s.plateSheets],['原板採購重量 kg',s.stockWeight??'未完整，密度待填'],['已知原板採購重量 kg',s.knownStockWeight],['原板分組','材質','板厚 mm','密度 kg/m³','板長 mm','板寬 mm','張數','採購重量 kg','毛坯重量 kg','原板未分配重量 kg','原板編號']];
  for(const g of s.groups)rows.push([g.id,g.material,g.thickness,g.density??'待填',g.mixed?'混合料源（見逐張表）':g.stockSizes?.[0]?.length??g.length,g.mixed?'見逐張表':g.stockSizes?.[0]?.width??g.width,g.sheetCount,g.weight??'待填',g.blankWeight??'待填',g.offcutWeight??'待填',g.sheetIDs.join(' / ')]);
  rows.push([],['下料分件','名稱','材質','板厚 mm','數量','毛坯長 mm','毛坯寬 mm','原板編號','備料狀態']);
  for(const part of s.parts)rows.push([part.id,part.name,part.material||'槽體材質待填',part.thickness,part.pieces?.length??part.quantity,part.width??'',part.height??'',part.sheetIDs?.join(' / ')||'',stockStatusText(part.stock)]);
  rows.push([],['原板','材質','板厚 mm','分件','片號','原板左起 mm','上起 mm','包絡寬 mm','包絡高 mm','轉向','毛坯重量 kg']);
  for(const sheet of s.sheets)for(const item of sheet.placements)rows.push([sheet.id,sheet.material,sheet.thickness,item.part,item.piece,item.x,item.y,item.w,item.h,item.rotated?'90°':'0°',item.blankWeight??'待填']);
  for(const x of [...s.pending,...s.materialIssues])rows.push(['原板備料待補',x.id??x.part,x.field,x.message]);
  for(const w of s.warnings)rows.push(['分料提醒',w]);
  const compare=compareMaterialStocks(r);rows.push([],['分組板型比較／省料建議','依已知毛坯，同材同厚比採購量；沒有單價、加工與運費，不保證最低金額'],['目前已排原板 kg',compare.currentWeight??'未知'],['各組建議原板合計 kg',compare.recommendedWeight??'未完整'],['比目前少買 kg',compare.savingWeight??'待核'],['材質','板厚 mm','密度 kg/m³','板型','板長 mm','板寬 mm','張數','採購 kg','餘料及損耗 kg','可保留矩形餘板 kg','毛坯利用 %','全槽已知焊長 mm','目前使用','省料建議','可行／原因']);
  for(const item of compare.groups)for(const o of item.options)rows.push([item.group.material,item.group.thickness,item.group.density??'待填',o.label,o.stockLength,o.stockWidth,o.feasible?o.sheetCount:'未完整',o.feasible?o.weight??'密度待填':'未完整',o.feasible?o.offcutWeight??'密度待填':'未完整',o.feasible?o.reusableWeight??'密度待填':'未完整',o.feasible?o.utilization:'未完整',o.knownWeldLength,o.selected?'是':'',item.best===o?'是':'',o.feasible?'可排（僅已知毛坯）':o.reason]);
  rows.push(['原板估料說明','矩形包絡順序排料，含刀縫；不保證最少張數，不在孔洞內套排。原板未分配重量=採購原板−毛坯，毛坯內的修邊及孔料另計。']);if(s.purchaseIssues?.length)for(const issue of s.purchaseIssues)rows.push(['輔助報價待修正（未匯出報價）',issue.field,issue.message]);else rows.push(...stockSupplyCSVRows(r));return rows;
}
const table=(head,rows)=>`<table><thead><tr>${head.map(x=>'<th>'+esc(x)+'</th>').join('')}</tr></thead><tbody>${rows.map(row=>'<tr>'+row.map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>').join('')}</tbody></table>`;
export function stockPages(r,page,{includeQuotes=false}={}){
  const s=r.stockPlan;if(!s)return [];
  const pages=includeQuotes?[...stockSupplyPages(r,page)]:[],pending=[...s.pending,...s.materialIssues.map(x=>({...x,id:x.part}))];
  for(let i=0;i<s.groups.length||i===0;i+=12)pages.push(page('原板採購總表',`<h1>按材質與板厚採購</h1><p>已排 ${s.plateSheets} 張；${s.stockWeight===null?'已知重量 '+weight(s.knownStockWeight)+'，另有 '+s.unknownSheets+' 張密度待填':'原板 '+weight(s.stockWeight)}。${s.procurementComplete?'依此分組備料，尚未保證最少張數。':'部分估排，未完成項不得當作零張／零重量。'}</p>${table(['組別／材質','板厚','原板尺寸 mm','張數','重量','原板'],s.groups.slice(i,i+12).map(g=>[g.id+' '+g.material,'t'+fmt(g.thickness),sizes(g),g.sheetCount,weight(g.weight),'#'+g.sheetIDs.join('、#')]))}<p>相同材質／板厚／密度才能共用餘板；重量依各組密度。採購重量與成品重量分開，不將原板重量加入空槽重量。原板未分配重量按採購原板扣毛坯，毛坯內孔料及修邊另計。</p>${s.warnings.map(w=>'<p class="notice">'+esc(w)+'</p>').join('')}`));
  for(let i=0;i<pending.length;i+=12)pages.push(page('原板備料待補',`<h1>尚未完成的板料</h1>${table(['零件','待補資料'],pending.slice(i,i+12).map(x=>[x.id,x.message]))}<p>異形件需先確認展開毛坯；外購件請在分件表指定，不能只用單重推算需要幾張原板。</p>`));
  const comparison=includeQuotes?compareMaterialStocks(r):{groups:[]};
  for(let i=0;i<comparison.groups.length;i+=2)pages.push(page('分組板型比較',`<h1>每組材料怎麼買</h1><p>${comparison.partial?'僅比較已確認毛坯，待補資料另列。':''}目前已排 ${weight(comparison.currentWeight)}；建議合計 ${comparison.recommendedWeight===null?'資料待補':weight(comparison.recommendedWeight)}；可少買 ${comparison.savingWeight===null?'待核':weight(comparison.savingWeight)}。</p>${comparison.groups.slice(i,i+2).map(item=>`<h2>${esc(item.group.material)} · t${fmt(item.group.thickness)} mm</h2><p>${item.best?'省料建議 '+esc(item.best.label)+'，'+item.best.sheetCount+' 張。'+(item.best.utilization<25?'整張利用率偏低，可另詢同材同厚裁切料／餘板價；本表仍按整張計。':''):'沒有可完整排入的板型。'}</p>${table(['板型','張數','採購 kg','餘料／損耗 kg','利用 %','已知焊長 m','狀態'],item.options.map(o=>[o.label,o.feasible?o.sheetCount:'未完整',o.feasible?fmt(o.weight,2):'—',o.feasible?fmt(o.offcutWeight,2):'—',o.feasible?fmt(o.utilization,1):'—',o.feasible?fmt(o.knownWeldLength/1000,2):'—',o.feasible?[o.selected?'目前':'',o===item.best?'省料建議':''].filter(Boolean).join('／'):o.reason]))}`).join('')}<p>${esc(comparison.basis)}不同材質的重量不能直接相減當作價格。餘料含刀縫及形狀廢料，未假設可折抵或回收收入。板型以每組單一尺寸比較，不混搭同組不同板型，未保證最少張數。</p>`));
  const groups=sheetGroups(r);
  for(let i=0;i<groups.length;i+=2)pages.push(page('原板排料示意',groups.slice(i,i+2).map(({sheet,ids})=>`<div class="layout"><h2>${esc(sheet.material)} · t${fmt(sheet.thickness)} · 原板 #${ids.slice(0,10).join('、#')}${ids.length>10?'…':''}</h2><p>${sheet.offerId?'料源 '+esc(sheet.offerId)+' · '+esc(sheet.sourceLabel)+'；':''}同配置 ${ids.length} 張；圖示 #${sheet.id}，${weight(sheet.weight)}。</p>${sheetSketch(sheet,r)}<p>${sheet.placements.slice(0,14).map(item=>`${esc(placementLabel(item))}：左 ${fmt(item.x)}、上 ${fmt(item.y)}，包絡 ${fmt(item.w)} × ${fmt(item.h)} mm`).join('；')}${sheet.placements.length>14?'；完整座標見 CSV。':''}</p></div>`).join('')));
  return pages;
}
