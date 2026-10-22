import {esc,fmt} from './tank-visuals.js';
import {PART_KINDS,WELD_KINDS} from './tank-fabrication.js';
import {stockCSVRows,stockPages,stockStatusText} from './tank-stock-report.js';
import {drawingWeldRegister,tankDrawingModel} from './tank-drawing-model.js';
import {supportDrawingSheet} from './tank-support-drawing.js';
export const maybe=(n,d=2)=>n===null||n===undefined||!Number.isFinite(n)?'待填':fmt(n,d);
export function fabricationRows(r){
  const f=r.fabricationPlan;if(!f)return [];
  const rows=[[],['整槽 BOM：槽體／管嘴／附件概算與分件明細'],['已計重量（含註記先備板） kg',f.knownTotalWeight],['重量不完整項數',f.unknownTotal],['範圍','重量不含焊材；主體未扣開孔；已確認毛坯按材質／板厚分組排料，未完成項另列。'],['零件編號','組件','名稱','來源','材質','規格／成品尺寸','每組數','組數','總數','單位','單重 kg','合計 kg','來源原板','毛坯長 mm','毛坯寬 mm','備料狀態','狀態／註記']];
  for(const p of f.bom)rows.push([p.id,p.assemblyName,p.name,p.source==='detail'?'分件明細':'既有概算',p.material,p.spec,p.perAssembly,p.assemblyQty,p.quantity,p.unit||'件',p.eachKg??'待填',p.weight??'待填',p.stock?.sheetIDs?.join(' / ')||'',p.stock?.width??'',p.stock?.height??'',stockStatusText(p.stock),[p.unknown?'含未計重量':'',p.note].filter(Boolean).join('；')]);
  rows.push([],['分件焊道登錄：不代替焊接詳圖／WPS'],['焊道編號','組件','A 側零件','B 側零件','型式','每組相同道數','組數','總道數','單道中心線長 mm','總長 mm','焊腳／對接厚度 mm','製程','WPS 記錄','註記']);
  for(const w of f.welds)rows.push([w.id,w.assemblyName,w.a,w.b,WELD_KINDS[w.kind],w.perAssembly,w.assemblyQty,w.quantity,w.eachLength??'待填',w.length??'待填',w.size??'待填',w.process,w.wps,w.note]);
  rows.push([],['全槽焊道索引（AUTO 為工法群組概算；逐道位置另拆）'],['焊道編號','來源','名稱','類別','型式','已知中心線總長 mm','焊腳／對接厚度 mm']);
  for(const w of drawingWeldRegister(r))rows.push([w.id,w.location==='zone'?'接合區／範圍待核':w.source==='located'?'圖面逐道':w.source==='detail'?'分件／位置待定':'工法概算／未定位',w.name||w.a+' → '+w.b,w.category,WELD_KINDS[w.kind],w.length??'待填',w.kind==='fillet'?w.leg??'待填':w.t??'待填']);
  rows.push([],['外部接點','@shell 筒身；@top 頂／B 端；@bottom 底／A 端；@site 現場接件'],['分件明細已知焊長 mm',f.knownWeldLength],['待補焊長／尺寸項數',f.unknownWelds]);
  for(const p of f.pending)rows.push(['分件待補',p.id,p.text]);rows.push(...stockCSVRows(r));return rows;
}
const numeric=/^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/;
export function fabricationCSV(r){return '\ufeff'+fabricationRows(r).map(row=>row.map(v=>{if(typeof v==='number')return String(v);let s=String(v??'');if(!numeric.test(s))s=s.replace(/^[\s]*[=+@-]/,s=>"'"+s);return '"'+s.replaceAll('"','""')+'"';}).join(',')).join('\r\n');}
export function fabricationPartGlyph(p){
  const strokes='fill="#d4e5e2" stroke="#367568" stroke-width="2"';
  const shape=p.kind==='pipe'?`<path d="M25 32l64-13v28L25 60z" ${strokes}/><ellipse cx="25" cy="46" rx="9" ry="14" fill="#fff" stroke="#367568" stroke-width="2"/>`:p.kind==='round'?`<path d="M22 46h70" stroke="#50857b" stroke-width="12" stroke-linecap="round"/>`:p.kind==='ring'?`<ellipse cx="60" cy="40" rx="39" ry="24" ${strokes}/><ellipse cx="60" cy="40" rx="17" ry="10" fill="#fff" stroke="#367568" stroke-width="2"/>`:p.kind==='plate'?`<path d="M17 47l54-27 32 18-54 27z" ${strokes}/><path d="M17 47v6l32 18 54-27v-6M49 65v6" fill="none" stroke="#367568" stroke-width="2"/>`:p.kind==='profile'?`<path d="M22 58V21h15v22h45V21h15v37z" ${strokes}/><path d="M36 20q24 24 48 0" fill="none" stroke="#9fbdb5" stroke-dasharray="4 4"/>`:`<rect x="27" y="25" width="66" height="32" rx="7" ${strokes}/><path d="M16 41h11m66 0h11" stroke="#367568" stroke-width="5"/>`;
  return `<svg viewBox="0 0 120 80" aria-hidden="true">${shape}</svg>`;
}
export function fabricationDiagram(a,selected=''){
  if(!a?.parts.length)return '<p>先新增一項分件，再建立接合關係。</p>';
  // Relationship diagram, deliberately not a physical installation drawing.
  return `<div class="fab-diagram" aria-label="分件與焊道關聯圖">${a.parts.map(p=>`<button type="button" data-fab-part="${esc(p.id)}" aria-pressed="${p.id===selected}">${fabricationPartGlyph(p)}<strong>${esc(a.id+'.'+p.id)}</strong><span>${esc(p.name)}</span><small>每組 ${p.qty} ${esc(p.unit||'件')}</small></button>`).join('')}</div><p class="tank-note">分件辨識示意；外形非比例、非加工輪廓。點零件修改尺寸。</p>`;
}
export function weldDiagram(a,w){
  const external={'@shell':'槽體筒身','@top':'頂／B 端','@bottom':'底／A 端','@site':'現場接件'},side=id=>a.parts.find(p=>p.id===id)??{id,name:external[id]||id,kind:'profile'};
  const left=side(w.a),right=side(w.b);
  return `<div class="fab-joint-preview" aria-label="${esc(a.id+'.'+w.id+' 接合示意')}"><div>${fabricationPartGlyph(left)}<strong>${esc(left.id)}</strong><span>${esc(left.name)}</span></div><div><svg viewBox="0 0 120 60" aria-hidden="true"><path d="M5 30h110" stroke="#bc9149" stroke-width="2" stroke-dasharray="5 4"/><path d="M47 35h26L60 15z" fill="#eed4a6" stroke="#b58232" stroke-width="2"/></svg><strong>${esc(a.id+'.'+w.id)}</strong><small>${WELD_KINDS[w.kind]} · ${maybe(w.size)} mm</small></div><div>${fabricationPartGlyph(right)}<strong>${esc(right.id)}</strong><span>${esc(right.name)}</span></div></div><p class="tank-note">接合關係示意；焊道實際位置、雙面配置及坡口依詳圖／WPS。</p>`;
}
const table=(head,rows)=>`<table><thead><tr>${head.map(t=>'<th>'+esc(t)+'</th>').join('')}</tr></thead><tbody>${rows.map(row=>'<tr>'+row.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')}</tbody></table>`;
export function fabricationPages(r,page,{includeStock=true,includeQuotes=false}={}){
  const f=r.fabricationPlan;if(!f)return [];
  const pages=includeStock?stockPages(r,page,{includeQuotes}):[],scope='每組數 × 組數 = 全槽總數。毛坯依材質／板厚分組排料；孔位、異形展開、收縮及焊接詳圖另核。已拆明細的支承／管嘴取代對應概算；補強板、蓋板仍獨立計。';
  for(let i=0;i<f.bom.length;i+=15)pages.push(page('整槽 BOM',`<h1>分件與採購表 ${Math.floor(i/15)+1}</h1><p>已計重量（含註記先備板） ${maybe(f.knownTotalWeight)} kg；${f.unknownTotal} 項含未計重量。${esc(scope)}</p>${table(['編號／名稱','材質','規格','每組 × 組數 = 總數','來源原板','已計 kg'],f.bom.slice(i,i+15).map(p=>[p.id+' '+p.name,p.material,p.spec,`${p.perAssembly} × ${p.assemblyQty} = ${p.quantity} ${p.unit||'件'}`,stockStatusText(p.stock),maybe(p.weight)+(p.unknown?'（部分未計）':'')]))}`));
  const register=drawingWeldRegister(r),model=tankDrawingModel(r);
  if(model.support)for(const n of [1,2])pages.push(page('支承詳圖 '+n,supportDrawingSheet(r,n)));
  if(model.support)pages.push(page('支承待核',`<h1>支承施工前待核</h1>${table(['編號','具體缺項'],model.support.pending.map(p=>[p.id,p.text]))}<p>7/7底部焊腳已讀入；黃色虛線只表示接合區，不能當成核定焊道。</p>`));
  for(let i=0;i<register.length;i+=18)pages.push(page('焊道索引',`<h1>全槽焊道索引 ${Math.floor(i/18)+1}</h1><p>模型 ${model.revision}。L／C 為筒身逐道，W-A／W-B 為兩端對接；與 2D／3D 同號。AUTO 仍是未逐道定位的群組概算。A 編號詳見組內接合表；實際位置及未知尺寸保留待核。</p>${table(['焊道／名稱','來源','型式','已知中心線總長 mm'],register.slice(i,i+18).map(w=>[w.id+' '+(w.name||w.a+' → '+w.b),w.location==='zone'?'接合區／範圍待核':w.source==='located'?'圖面逐道':w.source==='detail'?'分件／未定位':'工法概算／未定位',WELD_KINDS[w.kind],maybe(w.length)]))}`));
  for(const a of f.data.assemblies){const ps=f.parts.filter(p=>p.assembly===a.id),ws=f.welds.filter(w=>w.assembly===a.id);
    pages.push(page(a.id+' 分件與焊道',`<h1>${esc(a.id+' '+a.name)} · ${a.qty} 組</h1><p>${esc(a.note)}</p><h2>組內零件</h2>${table(['編號／名稱','材質','規格','每組／全槽','重量 kg'],ps.map(p=>[p.id+' '+p.name,p.material||'待填',p.spec,`${p.perAssembly} / ${p.quantity}`,maybe(p.weight)]))}<h2>接合關係</h2>${ws.length?table(['焊道','A → B','型式／尺寸','道數','中心線總長 mm','WPS'],ws.map(w=>[w.id,w.a+' → '+w.b,WELD_KINDS[w.kind]+' '+maybe(w.size),w.quantity,maybe(w.length),w.wps||'待核'])):'<p>未登錄焊道；採購組件、螺栓接合或待補，依組件註記。</p>'}<p>焊腳為角焊腳長；對接尺寸為接頭厚度。圓周按 π × 指定焊縫中心線直徑；雙面焊／重複接頭請另填相同道數。未知值不計入焊材合計，製程與 WPS 尚需核定。</p>${ps.some(p=>!p.ready)||ws.some(w=>!w.ready)?'<p class="notice">本組資料尚未齊全；待填尺寸、材質、重量或焊接資料不得視為零。</p>':''}`));
  }return pages;
}
