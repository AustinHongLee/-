import {computeOffset,DEFAULT_OFFSET,OFFSET_REFERENCES,offsetSurfaceFrame} from './offset-geometry.js';
import {offsetDiagramSVG} from './offset-diagram.js';
import {elbowFabricationSVG,elbowCutSteps} from './offset-fabrication.js';
import {cross} from './offset-ports.js';
export const esc = v => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const fmt = (v,n=2) => Number.isFinite(v)?Number(v.toFixed(n)).toString():'—';
const exact = v => Number(v.toFixed(6));
function checked(result){if(!result?.valid)throw new Error('尺寸無效，請先修正再匯出。');return result;}
// A project stores measured inputs; manufacturing exports still require a closed, selected route.
function projectInputs(result){if(!result.valid&&!(result.params.basis==='ports'&&result.context))throw new Error(result.errors.map(e=>e.message).join(' '));return result;}
export function offsetProjectJSON(params,id='OFF-001') {
  const r=projectInputs(computeOffset(params));return JSON.stringify({format:'special-method-offset',version:4,id:String(id).slice(0,40),params:r.params},null,2);
}
export function readOffsetProject(text) {
  const data=JSON.parse(text);
  if(data?.format!=='special-method-offset'||![1,2,3,4].includes(data.version)||!data.params||typeof data.params!=='object'||Array.isArray(data.params))throw new Error('不是支援的偏移配管專案。');
  const keys=Object.keys(DEFAULT_OFFSET),expected=data.version===1?keys.slice(0,keys.indexOf('basis')):data.version===2?keys.slice(0,keys.indexOf('planPreference')):data.version===3?keys.filter(k=>k!=='components'):keys;
  const optionalTangents=['planAOtherTangent','planBOtherTangent','planExtraInTangent','planExtraOutTangent'];
  const required=data.version>=3?expected.filter(k=>!optionalTangents.includes(k)):expected;
  if(required.some(k=>!Object.hasOwn(data.params,k))||Object.keys(data.params).some(k=>!expected.includes(k)))throw new Error('偏移配管專案欄位不完整或含未知欄位。');
  const result=projectInputs(computeOffset({...DEFAULT_OFFSET,...(data.version<3?{planMaxJoints:5}:{}),...data.params,...(data.version===1?{basis:'intersections'}:{})}));
  return {params:result.params,id:typeof data.id==='string'?data.id.slice(0,40):'OFF-001'};
}
const csvCell = v => '"'+String(v).replaceAll('"','""')+'"';
export function offsetCSV(result) {
  const r=checked(result),rows=[['項目','值','單位／基準'],['量測模式',r.basis==='ports'?'既有端口':'理論交點',''],['高低差／平面偏移',r.rise,'mm；中心線'],['側移',r.roll,'mm；中心線'],['真正偏移',r.offset,'mm'],[r.basis==='ports'?'端口 ΔX':'Run',r.run,r.basis==='ports'?'mm；端面中心':'mm；兩理論交點沿入口軸'],['Travel',r.travel,'mm；兩理論交點沿斜管軸'],['A 所需彎頭角度',r.elbows.a.angle,'deg'],['B 所需彎頭角度',r.elbows.b.angle,'deg'],['A 端 Ta',r.elbows.a.takeout,'mm'],['B 端 Tb',r.elbows.b.takeout,'mm'],['A 端焊口間隙',r.elbows.a.gap,'mm；G2'],['B 端焊口間隙',r.elbows.b.gap,'mm；G3'],['直管裁切長',r.cutLength,'mm；兩端面沿管軸']];
  if(r.basis==='ports')rows.push(['G1 既有 A 管口',r.params.aPortGap,'mm'],['G4 既有 B 管口',r.params.bPortGap,'mm'],['直管先下料長',r.blankLength,'mm'],['A 保留端直段',r.params.aTangent,'mm'],['B 保留端直段',r.params.bTangent,'mm'],['A 修磨留料',r.params.trimA,'mm'],['B 修磨留料',r.params.trimB,'mm'],['指定最短直管',r.params.minStraight,'mm；0 表示未指定']);
  rows.push([],['彎頭','周向角 deg','原端口沿周長 mm','由保留端沿外表面弧量到切線 mm','由另一端沿外表面弧量到切線 mm']);
  for(const e of Object.values(r.elbows))for(const s of e.stations)rows.push([e.end,s.clock,s.around,s.kept,s.removed]);
  return '\uFEFF'+rows.map(row=>row.map(v=>csvCell(typeof v==='number'?exact(v):v)).join(',')).join('\r\n');
}
function ruler(){return `<svg xmlns="http://www.w3.org/2000/svg" width="118mm" height="118mm" viewBox="0 0 118 118"><g fill="none" stroke="black" stroke-width=".3"><path d="M8 12h100M8 7v10M108 7v10M12 8v100M7 8h10M7 108h10"/>${Array.from({length:9},(_,i)=>`<path d="M${18+10*i} 12v-3M12 ${18+10*i}h-3"/>`).join('')}</g><g font-size="4"><text x="40" y="22">水平 100 mm</text><text x="22" y="60">垂直 100 mm</text><text x="22" y="75">列印比例 100%</text></g></svg>`;}
export function documentHTML(title,pages,paper='A4') {
  const width=paper==='A3'?297:210,height=paper==='A3'?420:297;
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>@page{size:${width}mm ${height}mm;margin:0}*{box-sizing:border-box}body{margin:0;background:#e7ebef;color:#111;font:3.3mm/1.55 Arial,"Microsoft JhengHei",sans-serif}.page{width:${width}mm;height:${height}mm;padding:10mm;margin:5mm auto;background:white;break-after:page;position:relative}.page:last-child{break-after:auto}h1{font-size:5.5mm;margin:0 0 3mm}h2{font-size:4mm;margin:4mm 0 2mm}p{margin:2mm 0}table{border-collapse:collapse;width:100%;font-size:3mm}th,td{border-bottom:.2mm solid #bbb;padding:1.4mm;text-align:left}strong{font-weight:700}.summary{border:.3mm solid;padding:3mm;margin:3mm 0}.summary strong{font-size:7mm}svg{display:block;max-width:none}.order-diagram svg{width:190mm;height:65mm}.order-diagram svg text{fill:#111}.order-diagram svg g[stroke="#e9f1fb"]{stroke:#111}footer{position:absolute;bottom:5mm;left:10mm;right:10mm;border-top:.2mm solid;padding-top:1mm;font-size:2.6mm}nav{position:sticky;top:0;background:white;text-align:center;padding:12px;z-index:1;font-size:14px}button{font:inherit;padding:8px 16px}@media print{body{background:white}.page{margin:0}nav{display:none}*{print-color-adjust:exact}}</style></head><body><nav><button onclick="window.print()">列印／儲存 PDF</button> ${paper} 直式 · 實際尺寸 100% · 關閉頁首頁尾</nav>${pages.map((page,i)=>`<section class="page">${page}<footer>${esc(title)} · ${i+1}／${pages.length} · mm · 依供料與工法核對</footer></section>`).join('')}</body></html>`;
}
function heading(r,id,title){return `<h1>${esc(title)} · ${esc(id)}</h1><p>${r.basis==='ports'?'既有端口反算':r.params.layout==='rolling'?'立體理論偏移':'平面理論偏移'} · OD ${fmt(r.params.od)} mm · A ${fmt(r.elbows.a.angle,4)}°／B ${fmt(r.elbows.b.angle,4)}° · 對焊接合</p>`;}
export function stationTable(e,rows){return `<h2>${e.end} 彎頭：原 ${fmt(e.donor)}° → 保留 ${fmt(e.stations.length?Math.atan2(e.stations[0].point[0],e.radius-e.stations[0].point[2])*180/Math.PI:0,4)}° · Rc ${fmt(e.radius)} mm</h2><table><thead><tr><th>周向 °</th><th>端口周長 mm</th><th>保留端起沿弧 mm</th><th>另一端起沿弧 mm</th></tr></thead><tbody>${rows.map(s=>`<tr><td>${fmt(s.clock)}</td><td>${fmt(s.around)}</td><td>${fmt(s.kept)}</td><td>${fmt(s.removed)}</td></tr>`).join('')}</tbody></table>`;}
export function buildOffsetWorkOrder(result,id='OFF-001',paper='A4',fit=null) {
  if(result?.basis==='ports')return buildPortWorkOrder(checked(result),id,paper,fit);
  const r=checked(result),pages=[heading(r,id,'偏移配管尺寸工單')+`<div class="summary">中間直管裁切長<br><strong>${fmt(r.cutLength)} mm</strong><p>${fmt(r.travel)} − ${fmt(r.elbows.a.takeout)} − ${fmt(r.elbows.b.takeout)} − ${fmt(r.elbows.a.gap)} − ${fmt(r.elbows.b.gap)}</p></div><table>${[['高低差／平面偏移',r.rise],['側移 Roll',r.roll],['真正偏移',r.offset],['Run 理論交點前進距離',r.run],['Travel 理論交點斜距',r.travel],['偏移平面旋轉角（由 +Z 向 +Y，°）',r.rollAngle],['A 端 Ta',r.elbows.a.takeout],['B 端 Tb',r.elbows.b.takeout],['A 端焊口間隙',r.elbows.a.gap],['B 端焊口間隙',r.elbows.b.gap]].map(([k,v])=>`<tr><th>${esc(k)}</th><td>${fmt(v,4)}</td></tr>`).join('')}</table><h2>量測與組裝基準</h2><p>Run／Travel 以兩彎頭中心線延長後的理論交點為基準，不是兩個既有管口的端面距離。入口與出口管軸平行；A 為起端，B 為終端。</p><p>A：${r.elbows.a.kind==='cut'?'切角理想圓弧彎頭':'現成彎頭，Ta 按實測／型錄'}；B：${r.elbows.b.kind==='cut'?'切角理想圓弧彎頭':'現成彎頭，Tb 按實測／型錄'}。間隙為斜管兩端對焊端面沿管軸的間隔，0 表示明確指定無間隙。</p><p>工單為幾何尺寸，未加入切縫、坡口、焊接收縮或修磨留料。</p>`];
  for(const e of Object.values(r.elbows))if(e.kind==='cut')for(let start=0;start<e.stations.length;start+=25)pages.push(heading(r,id,'彎頭切角分點工單')+stationTable(e,e.stations.slice(start,start+25))+`<p>保留原端口，從該端面與彎曲弧面相交的口緣量起。0° 為外背；由保留端沿中心線朝彎頭內看，90° 在右側，180° 為內腹。各點沿同一周向的彎曲母線量弧長，禁止跨點斜量或量直線弦長。360° 為 0° 的閉合核對。</p><p>理想等半徑圓形彎頭；原端有直段、橢圓、成形變形或坡口時，先確認弧面起點與實測半徑。標點連成截面切線，再依工法裁切修磨。</p>`);
  pages[0]=pages[0].replace('<table>', '<div class="order-diagram">'+offsetDiagramSVG(r)+'</div><table>');
  return documentHTML('偏移配管工單 '+id,pages,paper);
}

const vector=(q,n=4)=>q.map(v=>fmt(v,n)).join('，');
function assemblyClock(r,end){
  const axis=end==='a'?r.axes.a:r.axes.b.map(v=>-v),outside=offsetSurfaceFrame(r,end,end==='a'?0:1).outside;
  let ref=[0,0,1],label='+Z 上方',d=axis[2],top=ref.map((v,i)=>v-d*axis[i]);
  if(Math.hypot(...top)<1e-6){ref=[0,1,0];label='+Y 方向';d=axis[1];top=ref.map((v,i)=>v-d*axis[i]);}
  const len=Math.hypot(...top);top=top.map(v=>v/len);const right=cross(axis,top),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),angle=(Math.atan2(dot(outside,right),dot(outside,top))*180/Math.PI+360)%360;
  return `${end.toUpperCase()} 保留端朝彎頭內看：以端面投影的 ${label} 作 12 點，外背在順時針 ${fmt(angle,2)}°。外背向量（X／Y／Z）＝${vector(outside)}。`;
}
function buildPortWorkOrder(r,id,paper,fit){
  const p=r.params,eA=r.elbows.a,eB=r.elbows.b,rows=items=>`<table>${items.map(([k,v])=>`<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>`;
  const pages=[heading(r,id,'端口反算 · 備料與組立加工單')+`<div class="summary">中間直管成品長 <strong>${fmt(r.cutLength)} mm</strong><p>先下料 ${fmt(r.blankLength)} mm → A 端修去 ${fmt(p.trimA)}／B 端修去 ${fmt(p.trimB)} mm → 成品長</p></div><div class="order-diagram">${offsetDiagramSVG(r)}</div><h2>現場量測與備料</h2>`+rows([
    ['量測點',p.datum==='marks'?'現場標記點，已修正到端面中心':'端面中心'],['A → B 量測 X／Y／Z（mm）',vector(r.measured)],['中心修正 A／B（mm）',p.datum==='marks'?vector(r.ports.a)+' ／ '+vector(r.ports.b.map((v,i)=>v-r.measured[i])):'兩端 0，使用端面中心'],['端面中心差 X／Y／Z（mm）',vector(r.delta)],['A／B 管口向外軸',vector(r.axes.a)+' ／ '+vector(r.axes.b.map(v=>-v))],['A 彎頭',`${fmt(eA.donor)}° 原件 → 保留 ${fmt(eA.angle,4)}°，Rc ${fmt(eA.radius)} mm，${eA.kind==='cut'?'需切角':'現成件'}`],['B 彎頭',`${fmt(eB.donor)}° 原件 → 保留 ${fmt(eB.angle,4)}°，Rc ${fmt(eB.radius)} mm，${eB.kind==='cut'?'需切角':'現成件'}`],['直管',`OD ${fmt(p.od)} mm，1 支，下料 ${fmt(r.blankLength)}／成品 ${fmt(r.cutLength)} mm`],['最短直管要求',p.minStraight?`${fmt(p.minStraight)} mm`:'未指定；僅檢查有正長度直管']])+`<p>成品直管＝理論交點斜距 ${fmt(r.travel)} − Ta ${fmt(eA.takeout)} − Tb ${fmt(eB.takeout)} − G2 ${fmt(eA.gap)} − G3 ${fmt(eB.gap)}。G1／G4、原件保留端直段已納入端口反算，不能再扣一次。</p><p>按理想圓形彎頭計算；供料半徑、端口方向及四個焊口依實測／WPS 核對。未計橢圓、收縮、障礙干涉或力學承載。</p>`];
  const gapSketch=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 100" style="width:190mm;height:27mm"><path d="M20 52H700" fill="none" stroke="#7a8e9e" stroke-width="2"/>${[['A 既有口',35],['A 彎頭',185],['直管',360],['B 彎頭',535],['B 既有口',690]].map(([name,x])=>`<rect x="${x-32}" y="37" width="64" height="30" fill="#eaf1f6" stroke="#34546c"/><text x="${x}" y="89" text-anchor="middle" font-size="13">${name}</text>`).join('')}${[['G1',110,p.aPortGap],['G2',270,p.aGap],['G3',450,p.bGap],['G4',610,p.bPortGap]].map(([name,x,g])=>`<text x="${x}" y="23" text-anchor="middle" font-size="14">${name} ${fmt(g)} mm</text><path d="M${x} 30V72" stroke="#b77416" stroke-dasharray="4 3"/>`).join('')}</svg>`;
  pages.push(heading(r,id,'組立方向與四個焊口')+`<h2>焊口位置（順序示意，非等比例）</h2>${gapSketch}`+rows([['G1 既有 A 口 ↔ A 保留口',fmt(p.aPortGap)+' mm，沿 A 管口軸'],['G2 A 切口 ↔ 直管',fmt(p.aGap)+' mm，沿直管軸'],['G3 直管 ↔ B 切口',fmt(p.bGap)+' mm，沿直管軸'],['G4 B 保留口 ↔ 既有 B 口',fmt(p.bPortGap)+' mm，沿 B 管口軸'],['A／B 自帶保留端直段',`${fmt(p.aTangent)}／${fmt(p.bTangent)} mm`]])+`<h2>彎頭的外背朝哪裡？</h2><p>${assemblyClock(r,'a')}</p><p>${assemblyClock(r,'b')}</p><p>先在保留端標外背，再對照現場 XYZ 方向定位。B 彎頭保留端接既有 B 管口，切短端接直管，不能把兩個保留端都朝同一方向裝。</p><h2>直管與試組順序</h2><ol><li>直管先下料 ${fmt(r.blankLength)} mm；先做一端基準，再修兩端到成品 ${fmt(r.cutLength)} mm。</li><li>成品兩端切面垂直管軸。切片在廢料側留線；坡口與鈍邊另按 WPS 製作。</li><li>標 A／B、外背及組立方向。支撐管件，依 G1→G4 預留四個焊口，定位試組。</li><li>從既有 A 端面中心核對 B 的 XYZ；量四周根部間隙、平行度及內外錯邊。原件角度或半徑不符時，先修正尺寸。</li><li>尺寸核對後定位點焊、再複量。焊接及收縮補償依施工工法；本單沒有自動加入收縮量。</li></ol><p>差距不代表可強拉。吊鍊可作支撐／定位用途；本工具沒有材料、壁厚、支撐和設備負載資料，不判定可拉毫米數。</p>`);
  for(const e of Object.values(r.elbows))if(e.kind==='cut'){
    pages.push(heading(r,id,e.end+' 彎頭 · 捲尺標線與切除')+`<div class="fabrication">${elbowFabricationSVG(e,p.od)}</div><h2>沿外表面量，單位 mm</h2>`+rows([['外背／內腹彎曲弧',`${fmt(e.outerArc)}／${fmt(e.innerArc)}`],['右側／左側彎曲弧',`${fmt(e.centerArc)}／${fmt(e.centerArc)}`],['從保留端面量',`各弧長加自帶直段 ${fmt(e.tangent)} mm`],['切掉的外背／內腹彎曲弧',`${fmt(e.stations[0].removed)}／${fmt(e.stations[e.stations.length/2|0].removed)}`]])+elbowCutSteps(e,p.od));
    for(let start=0;start<e.stations.length;start+=25)pages.push(heading(r,id,e.end+' 彎頭 · 周向分點尺寸')+stationTable(e,e.stations.slice(start,start+25))+`<p>周向 0° 外背、90° 右、180° 內腹、270° 左；從保留端朝彎頭內看。端口周長為周向定位尺寸，不是縱向切線距離。</p><p>表內弧長從彎曲弧面起點量；由保留端面量時各加 ${fmt(e.tangent)} mm。另一端的剩餘弧也從該端弧面起點量，不包含該端直段。360° 為閉合核對。</p><p>有限分點標完後平順連成切面。沿廢料側留線切除、修到成品線；不能把周向定位尺或母線當成金屬切線。</p>`);
  }
  if(fit?.valid)pages.push(heading(r,id,'實際尺寸的試組差異')+rows([['A／B 試組角度',`${fmt(fit.aAngle,4)}°／${fmt(fit.bAngle,4)}°`],['試組直管成品長',fmt(fit.straight)+' mm'],['自由組立 B − 目標 B，XYZ',vector(fit.mismatch)+' mm'],['中心差距',fmt(fit.distance,4)+' mm'],['B 管軸角度差',fmt(fit.axisMismatch,4)+'°']])+`<p>保持原組立轉向，依剛性幾何比較，未計變形、力、應力、根部錯邊允差或焊接收縮。幾何差距沒有代表可用吊鍊強拉到位，不能當作可拉量或允收判定。</p>`);
  return documentHTML('端口組立加工單 '+id,pages,paper).replace('.summary{','.fabrication svg{width:190mm;height:85mm}.offset-shop-steps{padding-left:5mm;font-size:3.1mm}.offset-shop-steps li{margin-bottom:2mm}.summary{');
}

// Narrow measuring strips: only the dotted centreline carries true physical length.
// A torus is not developable. These are station arc rulers, NOT a 2D full-surface wrap.
export function offsetStripPlan(result,paper='A4') {
  const r=checked(result);if(!['A4','A3'].includes(paper))throw new Error('請選 A4 或 A3。');
  const width=paper==='A3'?277:190,overlap=10,step=width-overlap,rows=[];
  for(const e of Object.values(r.elbows))if(e.kind==='cut')for(const station of e.stations.slice(0,-1)){
    const count=Math.max(1,Math.ceil((station.kept+10-overlap)/step));
    if(count>200)throw new Error('量尺過長，請使用分點尺寸工單及捲尺。');
    for(let i=0;i<count;i++)rows.push({end:e.end,station,start:i*step,segment:i+1,count,width,step,overlap});
  }
  if(!rows.length)throw new Error('請至少選一端切角彎頭，才能列印切角量尺。');
  const perPage=paper==='A3'?14:9;
  if(Math.ceil(rows.length/perPage)>200)throw new Error('紙樣超過 200 頁，請改用分點尺寸工單。');
  return {width,overlap,rows,perPage,pages:1+Math.ceil(rows.length/perPage)};
}
export function measuringStripSVG(row) {
  const {station:s,start,width,segment,count,end,step}=row,cut=5+s.kept-start;
  const ticks=[];
  for(let value=Math.ceil(Math.max(0,start-5)/10)*10;value<=Math.min(s.kept,start+width-5);value+=10){const x=5+value-start;ticks.push(`<path d="M${exact(x)} 11v${value%50===0?5:3}"/>${value%50===0?`<text x="${exact(x)}" y="20" text-anchor="middle">${value}</text>`:''}`);}
  const joins=[];
  for(const j of [segment-1,segment])if(j>0&&j<count){const x=5+j*step-start;joins.push(`<path d="M${exact(x-2)} 9h4M${exact(x)} 7v4"/><text x="${exact(x)}" y="5" text-anchor="middle">接${j}</text>`);}
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="23mm" viewBox="0 0 ${width} 23" style="overflow:hidden"><title>${end} ${fmt(s.clock)}° · 沿弧 ${fmt(s.kept)} mm · 第 ${segment}/${count} 段</title><g fill="none" stroke="black" stroke-width=".2"><rect x=".3" y=".3" width="${width-.6}" height="22.4" stroke-dasharray="1 1"/><path d="M${exact(Math.max(0,5-start))} 11H${exact(Math.min(width,cut))}" stroke-dasharray=".6 1"/>${start===0?'<path d="M5 7v9"/>':''}${cut>=0&&cut<=width?`<path d="M${exact(cut)} 7v9" stroke-width=".4"/>`:''}</g><g font-size="2.3" font-family="Arial,Microsoft JhengHei" stroke="black" stroke-width=".2">${ticks.map(t=>t.replaceAll('<text','<text stroke="none"')).join('')}${joins.map(t=>t.replaceAll('<text','<text stroke="none"')).join('')}</g><text x="${width/2}" y="8" text-anchor="middle" font-size="2.5">${end} · ${fmt(s.clock)}° · 端口周長 ${fmt(s.around)} · ${segment}/${count} · 沿弧 ${fmt(s.kept)} mm</text></svg>`;
}
export function buildOffsetStripPaper(result,id='OFF-001',paper='A4') {
  const r=checked(result),plan=offsetStripPlan(r,paper),pages=[heading(r,id,'彎頭切角 1:1 分點量尺')+ruler()+`<h2>先校正，再沿母線量弧長</h2><ol><li>列印選「實際尺寸／100%」，關閉符合頁面與頁首頁尾；量水平、垂直 100 mm 尺。</li><li>選對 A／B 彎頭與周向角。保留端口的外背是 0°；由該端朝彎頭內看，右側 90°、內腹 180°。</li><li>以端口周長分點表建立 0／90／180／270° 等母線。沿彎曲弧面保持同一周向，不斜量。</li><li>沿虛點中心線裁成 2–3 mm 細條貼合；紙框只裁紙，文字留作辨識。多段量尺保留 10 mm 重疊，同母線同號「接」十字對齊。</li><li>起端刻線對準保留端口的弧面起點，量尺中心線沿指定母線貼合；末端刻線是切角標記。</li><li>將分點連成截面切線，依工法裁切修磨。有限分點須再核對切面，不可沿量尺長邊切金屬。</li></ol><p>只保證理想圓形彎頭的母線弧長。雙曲率表面無整片平紙的等距展開；量尺寬度只供拿取，讀中心線。原端直段與坡口不包含於起算弧長。</p>`];
  for(let i=0;i<plan.rows.length;i+=plan.perPage)pages.push(heading(r,id,'切角分點量尺 · 原尺寸 1:1')+`<p>起端對保留端弧面口緣，沿指定母線貼中心線；末端刻線為切角標記。單位 mm。</p>${plan.rows.slice(i,i+plan.perPage).map(row=>measuringStripSVG(row)).join('')}`);
  return documentHTML('彎頭切角量尺 '+id,pages,paper);
}
export function referencesHTML(){return OFFSET_REFERENCES.map(([title,url])=>`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(title)}</a>`).join(' · ');}
