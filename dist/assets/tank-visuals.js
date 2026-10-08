import {elevation} from './tank-method-visuals.js';
import {TOP_NAMES,BOTTOM_NAMES} from './tank-geometry.js';
import {END_LABELS} from './tank-heads.js';
export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const fmt=(n,d=1)=>Number.isFinite(n)?n.toLocaleString('zh-TW',{maximumFractionDigits:d}):'—';
export const pieceColor=id=>['#add5df','#bddcc2','#dac7e6','#e9d3a9','#bacce4','#e5bec3'][((Number(String(id).slice(1))||1)-1)%6];
// Elevation of any configuration (vertical or horizontal, every end type), with the working liquid level.
export function tankSketch(g,{interactive=true}={}){
  if(!g?.valid)return '<div class="tank-empty">核對右側尺寸後，桶槽圖會更新。</div>';
  const vertical=g.orientation!=='horizontal',W=520,H=420,f=g.frame,od=g.od/2,ri=g.di/2;
  const e=elevation(g,vertical?{x:150,y:92,w:220,h:252}:{x:62,y:112,w:396,h:166});
  const target=(field,x,y,label)=>`<g ${interactive?`data-focus="${field}" tabindex="0" role="button" aria-label="修改${esc(label)}"`:''}><rect x="${x-74}" y="${y-20}" width="148" height="40" rx="7" fill="#fff" stroke="#c5dce6"/><text x="${x}" y="${y+5}" text-anchor="middle" fill="#206c89" font-size="14">${esc(label)}</text></g>`;
  const level=g.process?.strapping?.working?.level;
  let liquid='';
  if(Number.isFinite(level)){const a=vertical?e.to([-od,0]):e.to([-ri,0]),b=vertical?e.to([od,f.bottomTangent-g.ends.bottom.depth+level]):e.to([-ri+level,f.total]),c=vertical?e.to([-od,f.bottomTangent-g.ends.bottom.depth+level]):e.to([-ri+level,0]);
    // Liquid body plus a clear surface line, both clipped to the tank outline.
    liquid=`<g clip-path="url(#tank-sketch-clip)"><rect x="${Math.min(a[0],b[0])}" y="${Math.min(a[1],b[1])}" width="${Math.abs(b[0]-a[0])}" height="${Math.abs(b[1]-a[1])}" fill="#6fbcdc" fill-opacity=".5"/><path d="M${c[0]} ${b[1]}H${b[0]}" stroke="#1f7fa8" stroke-width="2.2"/></g>`;}
  let dims,labels;
  if(vertical){
    const left=e.to([-od,0])[0],right=e.to([od,0])[0],top=e.to([0,f.total])[1],yb=e.to([0,f.bottomTangent])[1],yt=e.to([0,f.topTangent])[1],x=right+28;
    dims=`<path d="M${left} ${top-26}H${right}M${left} ${top-31}V${top-21}M${right} ${top-31}V${top-21}" stroke="#bb8136" stroke-width="2"/><path d="M${x} ${yt}V${yb}M${x-6} ${yt}H${x+6}M${x-6} ${yb}H${x+6}" stroke="#bb8136" stroke-width="2"/>`;
    labels=target('diameter',(left+right)/2,top-58,`${g.input.basis==='inside'?'內徑':'外徑'} ${fmt(g.input.diameter)} mm`)+target('height',Math.min(W-78,x+80),(yt+yb)/2,`直段 ${fmt(g.height)} mm`);
  }else{
    const xa=e.to([0,f.bottomTangent])[0],xb=e.to([0,f.topTangent])[0],bottom=e.to([-od,0])[1],topY=e.to([od,0])[1],x0=e.to([0,0])[0]-18;
    dims=`<path d="M${xa} ${bottom+26}H${xb}M${xa} ${bottom+21}V${bottom+31}M${xb} ${bottom+21}V${bottom+31}" stroke="#bb8136" stroke-width="2"/><path d="M${x0} ${topY}V${bottom}M${x0-6} ${topY}H${x0+6}M${x0-6} ${bottom}H${x0+6}" stroke="#bb8136" stroke-width="2"/>`;
    labels=target('diameter',Math.max(80,x0+70),topY-34,`${g.input.basis==='inside'?'內徑':'外徑'} ${fmt(g.input.diameter)} mm`)+target('height',(xa+xb)/2,bottom+58,`切線間 ${fmt(g.height)} mm`);
  }
  const ends=vertical?`上 ${TOP_NAMES[g.endTypes.top]} · 下 ${BOTTOM_NAMES[g.endTypes.bottom]}`:`A 端 ${END_LABELS[g.endTypes.bottom]} · B 端 ${END_LABELS[g.endTypes.top]}`;
  return `<svg viewBox="0 0 ${W} ${H}" role="${interactive?'group':'img'}" aria-label="${interactive?'桶槽尺寸示意，點尺寸修改':'桶槽尺寸示意'}"><defs><linearGradient id="tank-metal"${vertical?'':' x2="0" y2="1"'}><stop stop-color="#87aabb"/><stop offset=".4" stop-color="#d1e3eb"/><stop offset="1" stop-color="#74a0b4"/></linearGradient><clipPath id="tank-sketch-clip"><path d="${e.outline}"/></clipPath></defs><path d="${e.outline}" fill="url(#tank-metal)" stroke="#416d82" stroke-width="2"/>${liquid}${g.courses?e.seamLines():''}${g.endTypes.top==='open'&&vertical?`<path d="M${e.to([-ri,f.topTangent]).join(' ')}L${e.to([ri,f.topTangent]).join(' ')}" stroke="#244d62" stroke-width="5"/>`:''}${dims}${labels}<text x="${W/2}" y="${H-38}" text-anchor="middle" font-size="13" fill="#617086">${esc(ends)} · ${vertical?'總高':'總長'}約 ${fmt(g.totalHeight)} mm</text><text x="${W/2}" y="${H-18}" text-anchor="middle" font-size="11" fill="#8294a0">${Number.isFinite(level)?`藍色＝使用容量 ${fmt(g.input.fill)}% 液位 · `:''}尺寸示意 · 直段定義見右側</text></svg>`;
}
export function plateSketch(part,p){
  if(part.kind==='formed')return '<div class="tank-empty">封頭向廠商訂製；請提供內徑、板厚、直邊、材質與設計要求。</div>';
  const w=510,h=150,x=20,y=30,s=Math.min(w/p.stockLength,h/p.stockWidth),sw=p.stockLength*s,sh=p.stockWidth*s;
  const pack=part.pack,count=pack.columns*pack.rows,pw=(pack.rotated?part.height:part.width)*s,ph=(pack.rotated?part.width:part.height)*s;
  let cells='';const shown=Math.min(count,24,part.quantity);
  for(let i=0;i<shown;i++){const px=x+(i%pack.columns)*(pw+p.kerf*s),py=y+Math.floor(i/pack.columns)*(ph+p.kerf*s);cells+=part.kind==='circle'?`<circle cx="${px+pw/2}" cy="${py+ph/2}" r="${pw/2}" fill="#afd0df" stroke="#206c89"/>`:`<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="#afd0df" stroke="#206c89"/>`;}
  return `<svg viewBox="0 0 550 ${sh+70}" role="img" aria-label="${esc(part.name)}原板方格排料示意"><text x="20" y="19" font-size="13" fill="#617086">原板 ${fmt(p.stockLength)} × ${fmt(p.stockWidth)} mm</text><rect x="${x}" y="${y}" width="${sw}" height="${sh}" fill="#edf2f5" stroke="#97aebc"/>${cells}${count===0?`<text x="${x+sw/2}" y="${y+sh/2}" text-anchor="middle" fill="#9b6025" font-size="14">零件放不進這張原板</text>`:''}<text x="20" y="${sh+55}" font-size="12" fill="#617086">${count?`每張最多 ${count} 片 · 圖示首張${count>24?'（最多顯示 24 片）':''}`:'換較寬／較長的原板，或另做拼板設計'}</text></svg>`;
}
export function rollSketch(r){
  const s=r.parts[0];return `<svg viewBox="0 0 550 235" role="img" aria-label="捲板展開，兩側修邊留料與成品尺寸"><rect x="30" y="45" width="455" height="130" fill="#fff0db" stroke="#c6924c"/><rect x="40" y="55" width="435" height="110" fill="#d2e4eb" stroke="#206c89" stroke-dasharray="5 4"/><path d="M40 195H475M40 190V200M475 190V200" stroke="#206c89"/><text x="258" y="213" text-anchor="middle" fill="#206c89" font-size="14">圓周方向 ${fmt(s.finishedWidth,2)} mm</text><text x="258" y="29" text-anchor="middle" fill="#93652d" font-size="14">先下料長 ${fmt(s.width,2)} × 高 ${fmt(s.height,2)} mm</text><text x="258" y="113" text-anchor="middle" fill="#24526c" font-size="16">沿圓周方向捲成圓筒 →</text><text x="258" y="139" text-anchor="middle" fill="#617086" font-size="12">每邊修料 ${fmt(r.input.trim)} mm · 每圈 ${r.panelsPerCourse} 片</text></svg>`;
}
export function assemblySketch(r,{interactive=false,selected='',compact=false,selectedNozzle=''}={}){
  const shownCourses=Math.min(r.courses,10),shownPanels=Math.min(r.panelsPerCourse,24),row=compact?82:56,x=compact?52:80,w=compact?290:560,y=58,h=shownCourses*row;
  let cells='';
  for(const piece of r.assembly){if(piece.course>shownCourses||piece.panel>shownPanels)continue;const start=piece.start/r.circumference*w,width=piece.length/r.circumference*w,py=y+(shownCourses-piece.course)*row;
    const chunks=[{left:start,width:Math.min(width,w-start)}];if(start+width>w)chunks.push({left:0,width:start+width-w});
    cells+=chunks.map(chunk=>{const picked=piece.id===selected;return `<g ${interactive?`data-piece="${piece.id}" role="button" tabindex="0" aria-label="查看 ${piece.id}，第 ${piece.course} 圈第 ${piece.panel} 片"`:''}><title>${piece.id}：第 ${piece.course} 圈第 ${piece.panel} 片；原板 #${piece.sheet??'未排入'}</title><rect x="${x+chunk.left}" y="${py}" width="${chunk.width}" height="${row-6}" fill="${picked?'#efbd65':pieceColor(piece.id)}" stroke="${picked?'#a96d20':'#547d91'}" stroke-width="${picked?3:1}"/>${chunk.width>28?`<text x="${x+chunk.left+chunk.width/2}" y="${py+row/2+4}" text-anchor="middle" font-size="${compact?24:15}" fill="#24526c">${piece.id}</text>`:''}</g>`;}).join('');
  }
  let openings='';for(const n of r.nozzlePlan?.items??[]){if(n.host!=='shell')continue;const course=Math.floor(n.height/(r.courseHeight+r.input.gap))+1;if(course>shownCourses)continue;
    const centerX=x+n.unfoldX/r.circumference*w,centerY=y+(shownCourses-course)*row+(1-(n.height-(course-1)*(r.courseHeight+r.input.gap))/r.courseHeight)*(row-6),rx=Math.max(4,n.holeWidth/r.circumference*w/2),ry=Math.max(4,n.hole/r.courseHeight*(row-6)/2);
    for(const shift of [-w,0,w]){const px=centerX+shift;if(px+rx<x||px-rx>x+w)continue;openings+=`<g ${interactive?`data-nozzle-select="${n.id}" role="button" tabindex="0" aria-label="選取管嘴 ${n.id}"`:''}><ellipse cx="${px}" cy="${centerY}" rx="${rx}" ry="${ry}" fill="${(n.warnings??[]).some(w=>/相交|碰到|低於|無法|伸到|不一致|超出/.test(w))?'#fde3e0':'#fff'}" fill-opacity=".9" stroke="${n.id===selectedNozzle?'#a86b20':(n.warnings??[]).some(w=>/相交|碰到|低於|無法|伸到|不一致|超出/.test(w))?'#c0392b':'#24526c'}" stroke-width="2"/><text x="${px+rx+4}" y="${centerY-5}" font-size="${compact?18:12}" fill="#24526c">${n.id}</text></g>`;}
  }
  const labels=Array.from({length:shownCourses},(_,i)=>{const course=shownCourses-i,first=r.assembly[(course-1)*r.panelsPerCourse];return `<text x="${x-10}" y="${y+i*row+row/2}" text-anchor="end" font-size="13" fill="#456477">第 ${course} 圈</text><text x="${x+w+14}" y="${y+i*row+row/2}" font-size="12" fill="#617086">${fmt(first.angle)}°</text>`;}).join('');
  const footer=compact?`<text x="${x}" y="${y+h+22}" font-size="13" fill="#456477">底部 ↑ · 左右接成一圈</text>`:`<text x="${x}" y="${y+h+22}" font-size="12" fill="#456477">底部 ↑ · 每圈成品高 ${fmt(r.courseHeight,2)} mm · 筒身間隙 ${fmt(r.input.gap)} mm</text><text x="${x}" y="${y+h+43}" font-size="11" fill="#617086">${r.input.seamLayout==='stagger'?'相鄰圈錯開半片節距；跨左右邊界的相同編號為同一片。':'縱縫對齊配置；接縫交會須依正式設計確認。'}${r.courses>10||r.panelsPerCourse>24?' 圖顯示底部前 10 圈／每圈前 24 片；完整編號見 CSV。':''}</text>`;
  return `<svg viewBox="0 0 ${compact?400:720} ${h+(compact?105:125)}" role="${interactive?'group':'img'}" aria-label="筒身分片組立展開圖，從底部往上分圈，標示下料編號與縱縫位置"><defs><clipPath id="tank-opening-clip"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath></defs><text x="${x}" y="22" font-size="14" fill="#24526c">${compact?'筒身展開（由槽內側看）· 點板片查看':'展開一圈（由槽內側看）：左右兩邊接起來，就是筒身'}</text><path d="M${x} 38H${x+w}" stroke="#ba8238"/><text x="${x+w/2}" y="36" text-anchor="middle" font-size="12" fill="#93652d">中面圓周 ${fmt(r.circumference,2)} mm</text><text x="${x+w+14}" y="48" font-size="11" fill="#617086">起縫角</text><text x="${x+w}" y="${y+h+(compact?42:64)}" text-anchor="end" font-size="11" fill="#617086">角度 → 向右增加＝俯視順時針</text>${cells}${labels}<g clip-path="url(#tank-opening-clip)">${openings}</g><path d="M${x} 50V${y+h}M${x+w} 50V${y+h}" stroke="#ba8238" stroke-dasharray="5 4"/>${footer}</svg>`;
}
export function sheetSketch(sheet,r,{interactive=false,selected=''}={}){
  const p=r.input,s=Math.min(510/p.stockLength,145/p.stockWidth),x=20,y=30,w=p.stockLength*s,h=p.stockWidth*s,all=[...r.parts,...(r.attachmentParts??[])];
  const cells=sheet.placements.slice(0,80).map(item=>{const part=all.find(part=>part.id===item.part),piece=part?.pieces?.[item.piece-1],id=item.part+item.piece,px=x+item.x*s,py=y+item.y*s,pw=item.w*s,ph=item.h*s;
    const color=id===selected?'#efbd65':part.group==='attachment'?'#e2d4f0':part.kind==='circle'?'#ead0a6':['sector','petal','annular'].includes(part.kind)?'#d8e6c9':part.kind==='spliced'?(piece?.plate?.kind==='full'?'#cfe2ea':'#efe0c4'):pieceColor(id);
    let shape;
    if(piece?.outline){const ow=Math.max(...piece.outline.map(q=>q[0])),oh=Math.max(...piece.outline.map(q=>q[1])),trimX=((item.rotated?item.h:item.w)-ow)/2,trimY=((item.rotated?item.w:item.h)-oh)/2;
      const map=([ox,oy])=>item.rotated?[px+(trimY+oy)*s,py+(trimX+(ow-ox))*s]:[px+(trimX+ox)*s,py+(trimY+oy)*s];
      const ring=points=>points.map(map).map(([a,b])=>`${a.toFixed(1)},${b.toFixed(1)}`).join(' ');
      shape=`<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="none" stroke="#c5d5de" stroke-dasharray="2 2"/><polygon points="${ring(piece.outline)}" fill="${color}" stroke="#547d91"/>${(piece.holes??[]).map(hole=>`<polygon points="${ring(hole)}" fill="#edf2f5" stroke="#547d91"/>`).join('')}`;}
    else shape=part.kind==='circle'?`<circle cx="${px+pw/2}" cy="${py+ph/2}" r="${pw/2}" fill="${color}" stroke="#8e734d"/>`:`<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="${color}" stroke="#206c89" stroke-width="${id===selected?2.5:1}"/>`;
    return `<g ${interactive&&item.part==='S'?`data-piece="${id}" role="button" tabindex="0" aria-label="查看 ${id}，原板 ${sheet.id}"`:''}><title>${esc(part.name)} ${id}：毛坯 ${fmt(item.w,1)} × ${fmt(item.h,1)} mm</title>${shape}${pw>25&&ph>14?`<text x="${px+pw/2}" y="${py+ph/2+4}" font-size="11" fill="#24526c" text-anchor="middle">${esc(id)}</text>`:''}</g>`;}).join('');
  return `<svg viewBox="0 0 550 ${h+65}" role="${interactive?'group':'img'}" aria-label="原板 ${sheet.id}，厚 ${fmt(sheet.thickness)} mm 的排料"><text x="20" y="19" font-size="12" fill="#617086">${fmt(p.stockLength)} × ${fmt(p.stockWidth)} × t${fmt(sheet.thickness)} mm</text><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#edf2f5" stroke="#97aebc"/>${cells}<text x="20" y="${h+52}" font-size="11" fill="#617086">原板左上角起算 · 刀縫 ${fmt(p.kerf)} mm${sheet.placements.length>80?' · 圖僅顯示前 80 片':''}</text></svg>`;
}
export function sheetGroups(r){
  const groups=new Map();for(const sheet of r.sheets){const key=JSON.stringify([sheet.thickness,sheet.placements.map(({part,x,y,w,h})=>[part,x,y,w,h])]);if(!groups.has(key))groups.set(key,{sheet,ids:[]});groups.get(key).ids.push(sheet.id);}return [...groups.values()];
}
// Result tiles: each number carries its own picture (fill level, weight split, plate usage).
export function totalsMarkup(r){
  const fill=Math.max(0,Math.min(100,r.input.fill));
  // Mini elevation of the real configuration, filled to the working level.
  const e=elevation(r,{x:4,y:4,w:56,h:70}),level=r.process?.strapping?.working?.level,vertical=r.orientation!=='horizontal',f=r.frame;
  let water='';if(Number.isFinite(level)){const a=vertical?e.to([-r.od/2,0]):e.to([-r.di/2,0]),b=vertical?e.to([r.od/2,f.bottomTangent-r.ends.bottom.depth+level]):e.to([-r.di/2+level,f.total]);water=`<rect x="${Math.min(a[0],b[0])}" y="${Math.min(a[1],b[1])}" width="${Math.abs(b[0]-a[0])}" height="${Math.abs(b[1]-a[1])}" fill="#9fd0e2" clip-path="url(#tank-glyph-clip)"/>`;}
  const glyph=`<svg viewBox="0 0 64 78" class="tank-total-glyph" aria-hidden="true"><defs><clipPath id="tank-glyph-clip"><path d="${e.outline}"/></clipPath></defs><path d="${e.outline}" fill="#eef5f8" stroke="none"/>${water}<path d="${e.outline}" fill="none" stroke="#416d82" stroke-width="1.6"/></svg>`;
  // The bar splits exactly the headline (shell + ends); nozzle pipes, flanges and attachments are listed separately.
  const np=r.nozzlePlan??{},endWeight=r.parts.filter(p=>p.id!=='S').reduce((s,p)=>s+(p.netWeight??0),0),segments=[['筒身',r.parts.find(p=>p.id==='S')?.netWeight??0,'#7fa9bd'],['端部',endWeight,'#c7ad7c']].filter(s=>s[1]>1e-9);
  const total=segments.reduce((s,x)=>s+x[1],0)||1;
  const bar=`<div class="tank-weight-bar" role="img" aria-label="${esc(segments.map(s=>`${s[0]} ${fmt(s[1])} kg`).join('，'))}">${segments.map(s=>`<span style="flex:${(s[1]/total).toFixed(4)};background:${s[2]}" title="${esc(s[0])} ${fmt(s[1])} kg"></span>`).join('')}</div><ul class="tank-weight-legend">${segments.map(s=>`<li><i style="background:${s[2]}"></i>${esc(s[0])} <b>${fmt(s[1])}</b></li>`).join('')}</ul>`;
  const extras=(np.extraWeight??0)+(r.attachments?.weight??0),empty=r.emptyWeight??r.netWeight;
  const area=(sheet)=>sheet.placements.reduce((sum,item)=>{const part=[...r.parts,...(r.attachmentParts??[])].find(p=>p.id===item.part);return sum+(part?.kind==='circle'?Math.PI*item.w*item.w/4:item.w*item.h);},0);
  const sheetArea=r.input.stockLength*r.input.stockWidth,shown=r.sheets.slice(0,10),aspect=Math.max(.25,Math.min(1,r.input.stockWidth/r.input.stockLength));
  const plates=r.stockComplete?`<div class="tank-plate-icons" role="img" aria-label="${r.plateSheets} 張原板，各張使用比例">${shown.map(sheet=>{const used=Math.min(1,area(sheet)/sheetArea);return `<span style="aspect-ratio:${(1/aspect).toFixed(3)}" title="原板 #${sheet.id}：使用約 ${fmt(used*100,0)}%"><i style="width:${(used*100).toFixed(1)}%"></i></span>`;}).join('')}${r.sheets.length>10?`<em>+${r.sheets.length-10}</em>`:''}</div>`:'<p class="tank-total-alert">有零件放不進原板</p>';
  const util=Math.max(0,Math.min(100,r.utilization));
  return `<div class="tank-total tank-total-visual">${glyph}<div><span>幾何容積</span><strong>${fmt(r.volume,3)} m³</strong><p>約 ${fmt(r.volume*1000)} L · 使用 ${fmt(fill)}% ＝ ${fmt(r.workingVolume,3)} m³${Number.isFinite(level)?` · 液位 ${fmt(level,0)} mm`:''}</p></div></div>`+
    `<div class="tank-total"><span>主體成品估重</span><strong>${fmt(r.netWeight)} kg</strong>${bar}<p>${extras>0?`管嘴、法蘭與附件另 ${fmt(extras)} kg${np.unknownFlangeWeight?`（${np.unknownFlangeWeight} 只法蘭未填單重）`:''} · 空槽約 <b>${fmt(empty)}</b> kg`:'附件另估；'}${extras>0?'':'主體不扣開孔'}</p></div>`+
    `<div class="tank-total"><span>${r.stockComplete?'依此配置備料':'採購配置未完成'}</span><strong>${r.stockComplete?r.plateSheets+' 張原板':'須換板／另做拼板'}${r.formedHeads&&r.stockComplete?` ＋ ${r.formedHeads} 只封頭`:''}</strong>${plates}<div class="tank-util" aria-label="毛坯利用 ${fmt(util,0)}%"><span style="width:${util.toFixed(1)}%"></span></div><p>毛坯利用 ${fmt(util,0)}% · 原板約 ${fmt(r.stockWeight)} kg${r.formedHeads?'，另購成形封頭':''}</p></div>`;
}
