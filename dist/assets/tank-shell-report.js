import {shellPiecePart} from './tank-shell-layout.js';
import {seamClearancePages} from './tank-seam-report.js';
import {shellConstructionPlan,SHELL_RECORD_FIELDS} from './tank-shell-plan.js';
import {shellStepSketch,shellSeamMap,shellIsoSketch,shellOrthographic} from './tank-shell-visuals.js';
import {esc,fmt} from './tank-visuals.js';
import {reportPaginationScript} from './report-pagination.js';
import {tankDrawingModel} from './tank-drawing-model.js';

const required=(r,selected)=>{
  const m=shellConstructionPlan(r,selected);
  if(!m)throw new Error('請先修正桶槽尺寸，再產生筒身加工單。');
  if(r.shellLayoutState?.valid===false)throw new Error(r.shellLayoutState.issues[0].message);if(r.seamClearance?.valid===false)throw new Error(r.seamClearance.issues[0].message);
  if(m.issues.length)throw new Error(m.issues[0].message);
  if(r.fabrication?.valid===false)throw new Error('先修正製作工法：'+r.fabrication.issues[0].message);
  return m;
};
const short=(text,n)=>text.length>n?text.slice(0,n-1)+'…':text;
const rows=(items)=>items.map(row=>'<tr>'+row.map(v=>'<td>'+esc(String(v).replace(/\s+/g,' '))+'</td>').join('')+'</tr>').join('');
const table=(heads,items)=>`<table class="tank-method-table"><thead><tr>${heads.map(x=>'<th>'+esc(x)+'</th>').join('')}</tr></thead><tbody>${rows(items)}</tbody></table>`;

export function shellWorkOrder(r,selected){
  const m=required(r,selected),rec=m.records,pages=[],p=r.input,s=m.part,
    page=(title,body)=>`<section class="page"><header><span>特殊工法工作台 · 筒身施工</span><b>${esc(title)}</b></header>${body}<footer>${esc(rec.project||'未填設備名稱')} · ${esc(short(rec.drawing||'圖號／版次待填',35))} · 單位 mm · 圖非 1:1 · 施工規劃草稿／未審核</footer></section>`;
  pages.push(page('筒身施工總覽',`<h1>${esc(rec.project||'筒身施工加工單')}</h1><p class="status">${m.batch} · ${esc(p.material||'材質待填')} · t${fmt(p.shellThickness)} mm</p><div class="pair"><div>${shellOrthographic(m)}</div><div>${shellIsoSketch(m)}</div></div>${table(['項目','目前專案'],[
    ['筒身板段',fmt(r.bodyHeight,2)+' mm；不含兩端封頭、底蓋與附件'],
    [r.shellLayoutState?.custom?'示範板 '+m.piece.id+' 毛坯':'共同毛坯尺寸',`${fmt(s.width,2)} × ${fmt(s.height,2)} mm；全槽共 ${r.assembly.length} 片，逐片尺寸見清單`],
    ['修邊後成品',`${fmt(s.finishedWidth,2)}（圓周弧長）× ${fmt(s.finishedHeight,2)}（軸向）mm`],
    ['扣料基準',`π × (ID ${fmt(r.di)}＋t ${fmt(p.shellThickness)})；各接縫間隙 ${fmt(p.gap)} mm；未另計收縮補償`],
    ['閱讀方向',m.horizontal?'由 A 端筒身板邊往 B 端編圈；由 A 端看方位順時針':'由筒身下緣向上編圈；俯視方位順時針']
  ])}<p>五步圖解以 ${esc(m.piece.id)} 示範板片工序；每片原板來源、圈位及接縫對象見後續清單。機台程序、WPS 與圖說核定後才可放行施工。</p>`));
  pages.push(page('施工依據與待核對項目',`<h1>施工前先核對</h1>${table(['記錄項目','專案填寫內容'],Object.entries(SHELL_RECORD_FIELDS).map(([k,v])=>[v,rec[k]||'待填']))}${m.warnings.length?'<h2>尺寸／工序待核對</h2><ul>'+m.warnings.map(v=>'<li>'+esc(v)+'</li>').join('')+'</ul>':''}<h2>依據狀態</h2><p>${m.pending.length?'仍缺：'+esc(m.pending.join('、'))+'。':'記錄欄已填寫；填寫本身不代表已審查或核准。'}</p><p>機台：有效寬 ${m.result.methods.rolling.machineWidth||'未填'} mm、板厚能力 ${m.result.methods.rolling.machineThickness||'未填'} mm、最小內徑 ${m.result.methods.rolling.machineMinDiameter||'未填'} mm。能力還需依材質、強度、預彎工況及機台手冊確認。</p><p>本單只涵蓋筒身板段；封頭、管嘴、開孔補強、支承與其焊道另見分件／接合資料。下列空白欄供現場填寫，不自動表示檢查通過。</p>`));
  pages.push(...seamClearancePages(r,page));
  for(const [i,step] of m.steps.entries())pages.push(page(`工序 ${i+1}／5 · ${step.title.split('：')[0]}`,`<h1>${i+1}. ${esc(step.title)}</h1><p class="status">${esc(step.lead)}</p><div class="step-figure">${shellStepSketch(m,step.id)}</div><ol>${step.actions.map(a=>'<li>'+esc(a)+'</li>').join('')}</ol><div class="checkpoint"><b>進入下一步前</b><p>${esc(step.check)}</p></div><p class="record-line">實測／異常：________________________________________________________</p><p class="record-line">作業人：_______________　核對人：_______________　日期：_______________</p>`));
  for(let start=0;start<r.assembly.length;start+=16){
    const pieces=r.assembly.slice(start,start+16);
    pages.push(page('板片下料與圈位表',`<h1>板片清單 ${start+1}–${start+pieces.length}／${r.assembly.length}</h1><p>各片依下表尺寸下料，單位 mm、板厚 t${fmt(s.thickness)}；毛坯包含修邊／直邊，成品已扣接縫間隙。</p>${table(['板號','圈／片','毛坯弧向×軸向','成品弧長×板高','板段起點 mm','起點角 °','原板／左起、上起 mm'],pieces.map(b=>{const bp=shellPiecePart(r,b.id);return [b.id,b.course+' / '+b.panel,fmt(bp.width,2)+' × '+fmt(bp.height,2),fmt(b.length,2)+' × '+fmt(b.height,2),fmt(b.z,2),fmt(b.start/r.circumference*360,2),b.sheet?'#'+b.sheet+' / '+fmt(b.x,2)+', '+fmt(b.y,2)+(b.rotated?' (90°)':''):'未排入'];}))}<p>板段起點從 ${esc(m.datum)} 沿槽軸量測。原板座標是左上角包絡座標；先保留毛坯，成形後再依成品基準修邊。</p>`));
  }
  for(let start=0;start<m.welds.length;start+=13){
    const seams=m.welds.slice(start,start+13);
    pages.push(page('筒身焊道與檢查記錄',`<h1>焊道清單 ${start+1}–${start+seams.length}／${m.welds.length}</h1><p>L＝縱縫，C＝圈間環縫。編號表示位置，不代表施焊先後；長度為板厚中面名目值。</p>${table(['焊道','接合對象','長 mm','中心位置','焊工／檢驗記錄'],seams.map(w=>[w.id,w.self?w.a+' 自身合口':w.a+' ↔ '+w.b,fmt(w.length,2),w.kind==='longitudinal'?fmt(w.angle,2)+'°／第 '+w.course+' 圈':m.datum+' +'+fmt(w.z,2),'　']))}<p>WPS：${esc(rec.wps||'待填')}；檢驗依據：${esc(rec.acceptance||'待填')}。</p>`));
  }
  return `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>筒身施工加工單</title><style>@page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}body{margin:0;background:#edf2ef;color:#243e34;font:13px/1.65 'Microsoft JhengHei',sans-serif}.page{width:186mm;min-height:270mm;margin:12px auto;background:white;padding:16px 18px;position:relative;break-after:page}.page:last-child{break-after:auto}header{display:flex;justify-content:space-between;border-bottom:1px solid #9eb6a8;padding-bottom:8px;font-size:12px}footer{margin-top:22px;padding-top:8px;border-top:1px solid #bccdc2;font-size:10px;color:#60786c}h1{font-size:22px;margin:14px 0 8px;line-height:1.45}h2{font-size:16px}.status{padding:10px 13px;background:#eff5f0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}.shell-svg{width:100%;height:auto;display:block}.step-figure{margin:12px 0}.step-figure .shell-svg{max-height:330px}.checkpoint{border-left:3px solid #538470;background:#f4f7f4;padding:10px 14px}.checkpoint p{margin:3px 0}table{width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed;margin:10px 0}th,td{border:1px solid #c7d3cc;text-align:left;padding:7px;overflow-wrap:anywhere;white-space:pre-wrap}th{background:#edf4ef}td:last-child{min-width:55px}li{padding:3px 0;overflow-wrap:anywhere}.record-line{padding:7px 0;border-bottom:1px solid #dae3dc}p{overflow-wrap:anywhere}@media print{body{background:white}.page{margin:0;width:auto;min-height:270mm;padding:0}header,footer,.checkpoint,li{break-inside:avoid}}</style><body>${pages.join('')}${reportPaginationScript()}</body></html>`;
}

/** A shell-only vector drawing sheet, a foundation for later full vessel fabrication drawings. */
export function shellDrawingSheet(r,selected){
  const m=required(r,selected),model=tankDrawingModel(r),embed=(content,x,y,w,h)=>content.replace('<svg ',`<svg x="${x}" y="${y}" width="${w}" height="${h}" `),rec=m.records;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420mm" height="297mm" viewBox="0 0 1600 1132" role="img" aria-label="筒身施工圖草稿"><rect width="1600" height="1132" fill="white"/><rect x="22" y="22" width="1556" height="1088" fill="none" stroke="#476c59"/><g font-family="Microsoft JhengHei,sans-serif" fill="#244d3b"><text x="55" y="63" font-size="25">${esc(short(rec.project||'筒身施工圖',40))} · 草稿／未審核</text><text x="1540" y="85" font-size="16" text-anchor="end">${esc(short(rec.drawing||'圖號／版次待填',35))} · 單位 mm · 非固定比例</text></g>${embed(shellOrthographic(m),40,90,760,400)}${embed(shellIsoSketch(m),810,90,740,400)}${embed(shellStepSketch(m,'layout'),40,500,760,420)}${embed(shellSeamMap(m),810,500,740,420)}<g font-family="Microsoft JhengHei,sans-serif" fill="#244d3b" font-size="16"><path d="M22 950H1578" stroke="#476c59"/><text x="50" y="987">材質 ${esc(short(r.input.material||'待填',45))} · t${fmt(r.input.shellThickness)} · ${m.batch} · 共 ${r.assembly.length} 片</text><text x="50" y="1020">L＝縱縫／C＝圈間環縫；完整板片、焊道與施工步驟見同專案「筒身加工單」。</text><text x="50" y="1053">不含封頭、管嘴、支承詳圖；機台、收縮補償、WPS、尺寸公差與檢驗須核定。</text><text x="50" y="1086">模型 ${model.revision} · ${m.warnings.length?esc(m.warnings[0].slice(0,65)):'WPS：'+esc((rec.wps||'待填').slice(0,65))}</text></g></svg>`;
}
