import {seamSettingsRows} from './tank-seam-display.js';
import {seamClearanceSettings,seamClearancePending} from './tank-seam-settings.js';
import {esc,fmt,assemblySketch} from './tank-visuals.js';
export function seamDistanceRows(r){
  const pending=seamClearancePending(r).length,rows=[];
  for(const n of r.nozzlePlan?.items??[])for(const p of n.seamCheck?.profiles??[])for(const h of [p.longitudinal,p.circumferential].filter(Boolean))rows.push([n.mark||n.id,p.kind==='pad'?'補強板':'管嘴',h.id,h.actualClearance<0?'重疊 '+fmt(-h.actualClearance,1):fmt(h.actualClearance,1),fmt(h.required,1),h.clearance<0?'尚差 '+fmt(-h.clearance,1):'餘裕 '+fmt(h.clearance,1),h.overlap?'需避讓':pending?'依已填尺寸暫算':'符合輸入距離']);
  return rows;
}
const table=(heads,rows)=>`<table><thead><tr>${heads.map(h=>'<th>'+esc(h)+'</th>').join('')}</tr></thead><tbody>${rows.map(row=>'<tr>'+row.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')}</tbody></table>`;
export function seamClearancePages(r,page){
  if(!seamClearanceSettings(r).valid)throw new Error('先修正焊道與施工距離，再產生加工單。');
  if(!(r.nozzlePlan?.items??[]).some(n=>n.host==='shell'))return [];
  const pages=[page('焊道與施工避讓尺寸',`<h1>排縫前核對焊道與施工空間</h1>${table(['現場填寫項目','本專案尺寸'],seamSettingsRows(r))}<p>筒身焊道總寬以中心線向兩側各一半，與根隙取較大者；管嘴／補強板焊道由外緣向外占用，施工淨距沿筒身外表面展開、從兩側焊趾量起，不重複加根隙。</p><div class="assembly">${assemblySketch(r)}</div><p>金色為焊道帶，實線外框為接管／補強板焊趾包絡，虛線為施工範圍，紅色為需避讓。矩形及偏移包絡為保守規劃示意；未確認尺寸保留待填，填 0 為明確不預留。</p><p>採固定方位 0° 基準；管嘴位置維持不動。筒身縱縫、圈間環縫的幾何與已填作業尺寸一起檢查，不代表 ASME 或其他規範審查通過。</p>`)];
  const rows=seamDistanceRows(r);for(let i=0;i<rows.length;i+=12)pages.push(page('管嘴與接縫施工距離',`<h1>焊趾淨距對照 ${i+1}–${Math.min(rows.length,i+12)}／${rows.length}</h1><p>每個包絡列出最近縱縫與環縫；板號、L／C 焊道編號與 2D／3D 共用。單位 mm。</p>${table(['管嘴','範圍','焊道','現有焊趾淨距','施工要求','差額','狀態'],rows.slice(i,i+12))}<p>「重疊」表示焊道占用包絡已相交；正淨距仍需達到所填施工要求。距離未填時只依已填部分暫算，不能當作施工空間已確認；環縫不足須調分圈或依核定圖說處理。</p>`));
  return pages;
}
