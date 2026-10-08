// Shared renderers for the fabrication-method cards: the on-screen panel, the A4 work order and the CSV use the same
// drawings and tables, so what is printed is what was reviewed.
import * as V from './tank-method-visuals.js';
import {methodCatalog,stageSummary} from './tank-methods.js';
import {PROCESS_LABELS} from './tank-method-config.js';
const esc=V.esc,fmt=V.fmt;
export const STATUS_LABELS=Object.freeze({ok:'正常',warn:'需判斷',error:'需修正',off:'未加入'});
/** Drawing(s) for one card. `print` shows every pad / manhole instead of the selected one. */
export function cardVisual(card,r,{padNozzle=null,print=false}={}){
  const which=card.fieldScope;
  switch(card.visual){
    case 'rolling':return V.rollingVisual(r);
    case 'flat':return V.flatVisual(r,which);case 'splice':return V.spliceVisual(r,which);case 'cone':return V.coneVisual(r,which);case 'petal':return V.petalVisual(r,which);case 'formed':return V.formedVisual(r,which);
    case 'pad':{const pads=r.attachments.pads.items,men=r.attachments.manholes.items;
      if(print)return pads.map(x=>V.padVisual(r,x.id)).join('')+men.map(x=>V.manholeVisual(r,x.id)).join('');
      const current=pads.find(x=>x.id===padNozzle)?.id??pads[0]?.id;return (pads.length?V.padVisual(r,current):'')+(men.length?V.manholeVisual(r,men[0].id):'');}
    case 'supports':return V.supportVisual(r);case 'rings':return V.ringsVisual(r);case 'access':return V.accessVisual(r);case 'jacket':return V.jacketVisual(r);case 'internals':return V.internalsVisual(r);case 'lifting':return V.liftingVisual(r);
    case 'misc':return V.miscVisual(r);case 'cutting':return V.cuttingVisual(r);case 'heat':return V.heatVisual(r);
    case 'welding':return V.weldMapVisual(r)+V.bevelVisual(r);case 'inspection':return V.toleranceVisual(r)+V.testVisual(r);case 'surface':return V.surfaceVisual(r);case 'level':return V.levelVisual(r);case 'erection':return V.erectionVisual(r);
    default:return '';
  }
}
// Columns whose header ends in a unit (or counts) are numeric and right-aligned.
const numeric=h=>/(mm|m³|m²|kg|L|%|μm|次數|件數|道數|°C|數量|m\/L|m$)/.test(h);
function table(head,rows,{collapsed=false,summary=''}={}){
  if(!rows.length)return '';
  const body=`<div class="tank-method-table"><table><thead><tr>${head.map(h=>`<th${numeric(h)?' class="num"':''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((c,i)=>`<td${numeric(head[i])?' class="num"':''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  return collapsed?`<details class="tank-details"><summary>${esc(summary)}</summary>${body}</details>`:body;
}
/** Tables for one card (HTML). On screen long tables are collapsed; in print everything is shown. */
export function cardTables(card,r,{print=false}={}){
  const pr=r.process;
  if(card.id==='welding'&&pr)return table(['焊縫','型式','長度 m','焊材 kg'],pr.weld.seams.slice(0,print?200:40).map(s=>[esc(s.name),esc(s.kind==='butt'?`${s.groove.type} 對接 t${s.t}`:`角焊 ${s.leg}`),fmt(s.length/1000,2),fmt(s.consumable,2)]))+`<p class="tank-note">${esc(pr.weld.nde.modeLabel)}：${esc(pr.weld.nde.detail.join('；')||'—')}</p>`;
  if(card.id==='cutting'&&pr)return table(['零件','板厚 mm','件數','起割次數','切割長度 m'],pr.cutting.rows.map(x=>[esc(`${x.id} ${x.name}`),x.t===null?'—':fmt(x.t),x.pieces?String(x.pieces):'—',String(x.contours),fmt(x.length/1000,2)]));
  if(card.id==='heat'&&pr?.heat.cycle){const c=pr.heat.cycle,local=r.methods.heat.method==='local';return table(['階段','溫度 °C','時間'],[[local?'起控':'入爐',`≤ ${c.load}`,'—'],['升溫',`${c.load} → ${fmt(c.hold,0)}`,`${fmt(c.upHours,1)} h（≤ ${fmt(c.heatRate,0)} °C/h）`],['持溫',fmt(c.hold,0),`${fmt(c.holdHours*60,0)} 分`],['降溫',`${fmt(c.hold,0)} → ${c.load}`,`${fmt(c.downHours,1)} h（≤ ${fmt(c.coolRate,0)} °C/h）`],[local?'結束':'出爐',`≤ ${c.load}`,local?'保溫緩冷':'靜止空氣冷卻']])+(pr.heat.local?table(['局部熱處理焊縫','長度 m','道數'],pr.heat.local.seams.map(x=>[esc(x.name),fmt(x.length/1000,2),String(x.count)])):'');}
  if(card.id==='inspection'&&pr)return table(['項目','允差','依據'],pr.tolerances.items.map(i=>[esc(i.name),i.value===null?esc(i.formula):`${i.unit.startsWith('±')?'±':''}${fmt(i.value,1)} mm`,esc(i.basis)]))+table(['真空箱焊縫','長度 m','次數'],pr.test.vacuum.map(v=>[esc(v.name),fmt(v.length/1000,1),String(v.count)]));
  if(card.id==='level'&&pr)return table(['液位 mm','容積 m³','%'],pr.strapping.rows.map(x=>[fmt(x.level,0),fmt(x.volume,3),fmt(x.percent,1)]),{collapsed:!print,summary:`完整液位容積表（每 ${fmt(pr.strapping.step,0)} mm）`});
  if(card.id==='surface'&&pr?.surface.paint)return table(['塗層','膜厚 μm','塗佈率 m²/L','用量 L'],pr.surface.paint.coats.map(c=>[esc(c.name),fmt(c.dft,0),fmt(c.spread,2),fmt(c.liters,1)]));
  if(card.bom?.length)return table(['項目','規格','數量','重量 kg'],card.bom.map(b=>[esc(b.name),esc(b.spec),`${fmt(b.qty,0)} ${esc(b.unit)}`,fmt(b.weight,1)]));
  return '';
}
/** A4 pages for the fabrication methods: an overview, then one page per card in use. `page(title, body)` wraps a page. */
export function methodPages(r,page){
  const cards=methodCatalog(r);if(!cards.length)return [];
  const stages=stageSummary(r,cards),pages=[],attention=cards.flatMap(c=>(c.warnings??[]).filter(w=>w.level!=='info').map(w=>({card:c.title,...w})));
  pages.push(page('製作工法總覽',`<h1>製作工法：${esc(r.shapeLabel??'')}</h1><table class="stages"><tr>${stages.map((s,i)=>`<th>${i+1}. ${esc(s.label)}</th>`).join('')}</tr><tr>${stages.map(s=>`<td>${esc(s.value)}${s.issues?`<br><b class="warn">${s.issues} 項待確認</b>`:''}</td>`).join('')}</tr></table><table><thead><tr><th>工法</th><th>狀態</th><th>結論</th></tr></thead><tbody>${cards.map(c=>`<tr${c.status==='off'?' class="off"':''}><td>${esc(c.title)}</td><td>${STATUS_LABELS[c.status]}</td><td>${esc(c.summary)}</td></tr>`).join('')}</tbody></table>${attention.length?`<h2>需確認事項</h2><div class="notice">${attention.slice(0,14).map(w=>`<p><b>${esc(w.card)}</b>：${esc(w.text)}</p>`).join('')}${attention.length>14?`<p>另有 ${attention.length-14} 項，見各工法頁。</p>`:''}</div>`:''}<p>工法頁為估料、下料與施工準備的記錄；強度、規範與 WPS 仍須正式設計與程序確認。</p>`));
  for(const card of cards){
    if(card.optional&&!card.active)continue;
    const metrics=(card.metrics??[]).length?`<table class="metrics"><tr>${card.metrics.map(m=>`<th>${esc(m.label)}</th>`).join('')}</tr><tr>${card.metrics.map(m=>`<td>${esc(m.value)} ${esc(m.unit)}</td>`).join('')}</tr></table>`:'';
    const warnings=(card.warnings??[]).length?`<div class="notice">${card.warnings.map(w=>`<p>${esc(w.text)}</p>`).join('')}</div>`:'';
    const notes=card.notes?.length?`<h2>計算依據與注意事項</h2><ul>${card.notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul>`:'';
    pages.push(page(card.title,`<h1>${esc(card.title)}</h1><p class="status">${esc(card.summary)}${card.status!=='ok'?` · ${STATUS_LABELS[card.status]}`:''}</p><div class="method-visual">${cardVisual(card,r,{print:true})}</div>${metrics}${warnings}${cardTables(card,r,{print:true})}${notes}`));
  }
  return pages;
}
/** CSV rows (arrays) for the fabrication methods: card conclusions, attachment list, welds, NDE, tests, cutting, heat,
 *  surface, level table and erection. */
export function methodCSVRows(r){
  const cards=methodCatalog(r),pr=r.process,att=r.attachments,rows=[];if(!cards.length)return rows;
  rows.push([],['製作工法','狀態','結論']);for(const c of cards)rows.push([c.title,STATUS_LABELS[c.status],c.summary]);
  for(const c of cards)for(const w of c.warnings??[])rows.push(['工法提醒：'+c.title,w.text]);
  if(att?.bom.length){rows.push([],['附件材料','規格','數量','單位','單重 kg','重量 kg','長度 mm']);for(const b of att.bom)rows.push([b.name,b.spec,b.qty,b.unit,b.each,b.weight,b.length??'']);rows.push(['附件合計 kg',att.weight],['空槽估重 kg',att.emptyWeight]);}
  if(!pr)return rows;
  const w=pr.weld;rows.push([],['焊縫','類別','型式','板厚／腳長 mm','長度 mm','熔敷金屬 kg','焊材 kg','焊法','焊材效率']);
  for(const s of w.seams)rows.push([s.name,s.category,s.kind==='butt'?`${s.groove.type} 對接`:'角焊',s.kind==='butt'?s.t:s.leg,s.length,s.metal,s.consumable,PROCESS_LABELS[s.process],s.efficiency]);
  rows.push(['焊縫合計 mm',w.totals.length],['熔敷金屬合計 kg',w.totals.metal],['焊材合計 kg',w.totals.consumable]);if(w.flux)rows.push(['SAW 焊劑約 kg',w.flux]);
  rows.push([],['射線檢驗',w.nde.modeLabel],['RT 處數',w.nde.spots],['RT 長度 mm',w.nde.rtLength],['底片約',w.nde.films]);for(const d of w.nde.detail)rows.push(['RT 明細',d]);if(w.nde.ptNote)rows.push(['PT／MT',w.nde.ptNote]);
  for(const t of pr.tolerances.items)rows.push(['尺寸允差：'+t.name,t.value===null?t.formula:t.value,t.unit,t.basis]);
  const t=pr.test;rows.push([],['盛水試驗',t.hydro?'是':'否'],['試驗水量 m³',t.water],['灌水時間 h',t.fillHours],['試驗總重 kg',t.totalLoad]);if(t.testPressure)rows.push(['試驗壓力 kPa(g)',t.testPressure],['最低點水柱 kPa',t.staticHead]);
  for(const v of t.vacuum)rows.push(['真空箱：'+v.name,v.length,v.count]);if(t.padTests)rows.push(['補強板試漏 片',t.padTests]);
  const c=pr.cutting;rows.push([],['切割零件','板厚 mm','件數','起割次數','切割長度 mm']);for(const x of c.rows)rows.push([`${x.id} ${x.name}`,x.t??'',x.pieces,x.contours,x.length]);
  rows.push(['切割合計 mm',c.total],['穿孔／起割 次',c.pierces],['單面坡口邊 mm',c.bevel.single],['雙面坡口邊 mm',c.bevel.double],['管端坡口 mm',c.bevel.pipe],['型鋼／管鋸切 刀',c.bars+c.pipeEnds]);if(c.cutHours!==undefined)rows.push(['切割工時 h',c.cutHours]);if(c.bevelHours!==undefined)rows.push(['坡口工時 h',c.bevelHours]);
  const h=pr.heat;rows.push([],['PWHT 判定',h.need===true?'需要':h.need===false?'不需':'依 WPS',h.reason],['PWHT 執行',h.perform?'是':'否']);
  if(h.cycle)rows.push(['持溫 °C',h.cycle.hold],['持溫 分',h.cycle.holdHours*60],['升溫上限 °C/h',h.cycle.heatRate],['降溫上限 °C/h',h.cycle.coolRate],['425 °C 以上 h',h.cycle.controlled]);
  if(h.furnace?.heats)rows.push(['入爐次數',h.furnace.heats]);if(h.local)rows.push(['局部持溫帶 mm',h.local.band],['局部 PWHT 焊縫 mm',h.local.length]);
  const s=pr.surface;rows.push([],['表面積','m²']);for(const [k,label] of Object.entries({shellOut:'筒身外',shellIn:'筒身內',topOut:'上端外',topIn:'上端內',bottomOut:'下端外',bottomIn:'下端內',nozzlesOut:'管嘴外',nozzlesIn:'管嘴內',attachments:'附件'}))if(s.areas[k]>0)rows.push([label,s.areas[k]]);
  if(s.paint){rows.push(['塗裝面積 m²',s.paint.area]);for(const coat of s.paint.coats)rows.push(['塗層：'+coat.name,coat.dft+' μm',coat.liters+' L']);}
  if(s.insulation)rows.push(['保溫體積 m³',s.insulation.volume],['外包鋁皮 m²',s.insulation.cladding],['保溫支撐環 圈',s.insulation.rings]);
  rows.push([],['液位 mm','容積 m³','%']);for(const x of pr.strapping.rows)rows.push([x.level,x.volume,x.percent]);rows.push(['使用液位 mm',pr.strapping.working.level,pr.strapping.working.volume]);
  const e=pr.erection;rows.push([],['製作安裝方式',{shop:'工廠整槽',bottomup:'現場正裝',jacking:'倒裝（液壓頂升）',airlift:'倒裝（充氣頂升）'}[e.method]],['運送尺寸 長×寬×高 mm',`${e.envelope.length.toFixed(0)} × ${e.envelope.width.toFixed(0)} × ${e.envelope.height.toFixed(0)}`],['空槽重 kg',e.envelope.weight],['最重單片 kg',e.maxPiece]);
  if(e.jacks)rows.push(['頂升機 台',e.jacks.count]);if(e.air)rows.push(['充氣壓力 kPa',e.air.pressure]);for(const st of e.stages)rows.push(['安裝階段',st.label,st.weight??'']);
  rows.push(['重心（空槽）mm',pr.cg.empty.y,pr.cg.axis],['重心（操作）mm',pr.cg.operating.y]);
  return rows;
}
