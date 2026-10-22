import {shellPiecePart} from './tank-shell-layout.js';
import {fmt} from './tank-visuals.js';
export function shellLayoutPages(r,page){
  if(!r.shellLayoutState?.custom)return [];
  const pages=[];
  for(let start=0;start<r.assembly.length;start+=14)pages.push(page('逐圈／逐片下料尺寸',`<h1>筒身逐片尺寸 ${start+1}–${Math.min(start+14,r.assembly.length)}</h1><p>管嘴位置保留。各圈板高與各片弧長不同，依板號下料；圓周尺寸採板厚中面，已扣接縫間隙。毛坯包含修邊與直邊留料。</p><table><tr><th>板號／圈片</th><th>毛坯弧向×軸向 mm</th><th>成品弧長×板高 mm</th><th>軸向起點 mm</th><th>板片起點 °</th><th>原板</th></tr>${r.assembly.slice(start,start+14).map(b=>{const p=shellPiecePart(r,b.id);return `<tr><td>${b.id} / ${b.course}-${b.panel}</td><td>${fmt(p.width,2)} × ${fmt(p.height,2)}</td><td>${fmt(b.length,2)} × ${fmt(b.height,2)}</td><td>${fmt(b.z,2)}</td><td>${fmt(b.start/r.circumference*360,2)}</td><td>${b.sheet?'#'+b.sheet:'未排入'}</td></tr>`;}).join('')}</table><p>筒身 ${r.verticalSeams} 道縱縫＋${r.horizontalSeams} 道環縫，共 ${fmt(r.weldLength/1000,2)} m。圈號沿槽軸由 A 端／筒身下緣起算；完整焊道編號見筒身加工單。</p><p>搜尋條件：最小成品板邊 ${fmt(r.input.shellLayoutPlan.rules.minimumPlateEdge)} mm，相鄰圈縱縫中心最小錯開 ${fmt(r.input.shellLayoutPlan.rules.minimumStagger)} mm。條件由現場填寫，規範仍須核對。</p>`));
  return pages;
}
