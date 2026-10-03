/** Field marking sheets for an ALREADY formed toroidal plate. No flat stock
 * outline and no 1:1 wrap/cut claim is made for a double-curvature surface. */
import {computeExactFormedElbowPadLocatorTable} from './formed-elbow-pad.js';
const TAU=2*Math.PI;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(n,d=3)=>Number.isFinite(n)?Number(n.toFixed(d)).toString():'—';
const wrap=a=>((a%TAU)+TAU)%TAU,unwrap=(a,c)=>c+Math.atan2(Math.sin(a-c),Math.cos(a-c));
const SHAPES={circle:'圓形定位外框',ellipse:'橢圓定位外框',obround:'長圓定位外框',rounded:'圓角定位外框'};
const SPLITS={single:'單片',axial:'沿彎曲方向接縫分兩片',circumferential:'沿截面方向接縫分兩片'};
function getPad(input){const pad=input?.geometry?.pad??input?.pad??input;
  if(pad?.hostType!=='elbow'||pad.manufacturing!=='formed-torus-axis-bore')throw new Error('需有有效的已成形彎頭補強板。');return pad;}
const shortArc=(phi,r)=>{const a=wrap(phi);if(Math.min(a,TAU-a)<1e-9)return'外背 0';
  if(Math.abs(a-Math.PI)<1e-9)return`左／右 ${fmt(r*Math.PI)}`;
  return`${a<Math.PI?'左':'右'} ${fmt(r*Math.min(a,TAU-a))}`;};
const path=points=>points.map((p,i)=>`${i?'L':'M'}${fmt(p[0],6)},${fmt(p[1],6)}`).join(' ');
const text=(x,y,s,extra='')=>`<text x="${fmt(x)}" y="${fmt(y)}" ${extra}>${esc(s)}</text>`;

/** Diagram coordinates identify beta/phi; pixel distances have no fabrication
 * scale. Both bore faces are shown at their actual distinct angular positions. */
export function formedElbowPadLocatorSVG(input,{piece=null}={}){
  const pad=getPad(input),Rc=pad.bendRadius,R=pad.innerRadius,Ro=pad.outerRadius;
  const parameters=pad.outerParameter,center=pad.source.joint.geometry.elbow.surfaceClock;
  const faceParameters=(points,r)=>points.map(([s,u])=>[s/Rc,unwrap(u/r,center)]);
  const hole=faceParameters(pad.outerHoleUV,Ro),inner=faceParameters(pad.innerHoleUV,R);
  const all=[...parameters,...hole,...inner],minX=Math.min(...all.map(q=>q[0])),maxX=Math.max(...all.map(q=>q[0]));
  const minY=Math.min(...all.map(q=>q[1])),maxY=Math.max(...all.map(q=>q[1]));
  const map=([beta,phi])=>[48+406*(beta-minX)/(maxX-minX),205-148*(phi-minY)/(maxY-minY)];
  let drawing=`<path d="${path(parameters.map(map))}" fill="#eac28a44" stroke="#a76b26" stroke-width="2"/>`+
    `<path d="${path(hole.map(map))}" fill="white" stroke="#216390" stroke-width="2"/>`+
    `<path d="${path(inner.map(map))}" fill="none" stroke="#74828f" stroke-width="1.2" stroke-dasharray="4 3"/>`;
  if(pad.splitAxis!==null){const axis=pad.splitAxis,c=pad.splitCoordinate,cut=axis===0?[[c,minY],[c,maxY]]:[[minX,c],[maxX,c]];
    drawing+=`<path d="${path(cut.map(map))}" fill="none" stroke="#d97625" stroke-dasharray="5 3"/>`;
    if(piece!==null){const less=piece===0,m=axis===0?[(less?minX+c:c+maxX)/2,(minY+maxY)/2]:[(minX+maxX)/2,(less?minY+c:c+maxY)/2];
      const p=map(m);drawing+=text(p[0],p[1],less?'製作 A 片':'製作 B 片','text-anchor="middle" font-weight="bold"');}
  }
  const count=24;for(let i=0;i<count;i++){const k=Math.round(i*(parameters.length-1)/count),q=parameters[k],p=map(q);
    drawing+=`<g data-pad-edge="${i+1}" data-beta="${fmt(q[0],8)}" data-phi="${fmt(q[1],8)}"><circle cx="${fmt(p[0])}" cy="${fmt(p[1])}" r="2.2" fill="#a76b26"/>${text(p[0]+3,p[1]-3,i+1)}</g>`;}
  const cx=596,cy=133,r=55;
  return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 266" role="img" aria-label="已成形彎頭補強板定位索引，非平板展開，非一比一"><g font-family="Arial, sans-serif" font-size="12" fill="#243749">`+
    text(48,20,'已成形板定位索引 · 非平板展開／非 1:1')+text(48,40,`${SHAPES[pad.shape]} · 外面孔藍線／內面孔灰虛線`)+drawing+
    text(48,227,`${fmt(minX*180/Math.PI)}°`)+text(454,227,`${fmt(maxX*180/Math.PI)}°`,'text-anchor="end"')+
    text(251,247,'彎曲位置 β：A 端 → B 端','text-anchor="middle"')+text(8,65,`${fmt(maxY*180/Math.PI)}°`)+text(8,204,`${fmt(minY*180/Math.PI)}°`)+
    text(cx,22,'截面：由 A 朝 B 看','text-anchor="middle"')+text(cx,43,'外背置上；φ 正向逆時針','text-anchor="middle"')+
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#738292"/>`+text(cx,cy-r-7,'0° 外背','text-anchor="middle"')+
    text(cx-r-5,cy+4,'90° 左','text-anchor="end"')+text(cx+r+5,cy+4,'270° 右')+text(cx,cy+r+18,'180° 腹側','text-anchor="middle"')+
    text(cx,244,'捲尺與當地中心線垂直','text-anchor="middle"')+'</g></svg>';
}
export const elbowPadLocatorSVG=formedElbowPadLocatorSVG;

function pieceOf(pad,row){if(pad.splitAxis===null)return 0;return (pad.splitAxis===0?row.betaRad:row.phiRad)<=pad.splitCoordinate+1e-10?0:1;}
function table(headers,body){return`<table class="pad-table" style="font-size:8.5pt"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;}
function requireJoint(result){if(result?.valid!==true||result.manufacturingReady!==true||!result.geometry?.pad)throw new Error('成形補強板及彎頭幾何必須有效、採樣精度達標後才能產生定位工單。');return getPad(result);}

/** Two A4 duties per plate piece: outside-edge placement and both bore faces.
 * Other-piece face entries are explicitly marked, so a migrating oblique bore
 * is never silently assigned to the wrong half. */
export function buildElbowPadPageBodies(result,{padCount=24}={}){
  const pad=requireJoint(result);if(!Number.isInteger(padCount)||padCount<4||padCount>48)throw new Error('成形板工單分點區段須為 4 至 48。');
  const R=pad.innerRadius,Ro=pad.outerRadius,Rc=pad.bendRadius,params=result.params,source=pad.source.options;
  const hole=computeExactFormedElbowPadLocatorTable(result,padCount),edge=result.formedPad.edgeStationTable;
  const pages=[],pieces=pad.splitAxis===null?[0]:[0,1];
  const chunks=(rows)=>Array.from({length:Math.ceil(rows.length/25)},(_,i)=>rows.slice(i*25,(i+1)*25));
  const common=`母管 Ø${fmt(params.mainOD)}；中心線 R=${fmt(Rc)}；支管 Ø${fmt(params.branchOD)}；板厚 ${fmt(source.padThickness)} mm。${SHAPES[pad.shape]}，${SPLITS[pad.split]}。`;
  for(const piece of pieces){
    const name=pieces.length===1?'單片':piece===0?'A 片':'B 片';
    const edgeRows=edge.filter(q=>pieceOf(pad,q)===piece);
    const edgeTable=table(['點','母管 S背 mm','φ °','母管短弧 mm','板外面短弧 mm'],edgeRows.map(q=>`<tr><td>${q.station+1}</td><td>${fmt(q.motherRearDistance)}</td><td>${fmt(q.phiDegrees,4)}</td><td>${esc(shortArc(q.phiRad,R))}</td><td>${esc(shortArc(q.phiRad,Ro))}</td></tr>`).join(''));
    const seam=pad.splitAxis===null?'':`<p class="note">接縫端點見「兩片共用接縫定位」頁；該頁分列內面、外面精確端點。每段由外緣接到孔緣，孔內不留橋接板材。</p>`;
    pages.push({role:'formed-pad-edge',title:`已成形彎頭補強板 ${name} · 外緣定位`,body:`<p>${esc(common)}</p><p class="notice">先備妥雙曲率成形板，再用本表定位修邊。此頁不能作平板下料、紙張包覆或 1:1 裁切樣板。</p>${formedElbowPadLocatorSVG(result,{piece:pieces.length>1?piece:null})}${edgeTable}${seam}<p class="note">從 A 端沿母管外背量 S背，畫垂直當地中心線的截面；從外背向左／右短弧標點。貼合後沿母管法線對應到板外面；同一 φ 的板外弧長另列。</p><p class="note">連續板厚外緣距支管孔的保守留邊下界 ${fmt(pad.boundaryCertification.clearance)} mm ≥ 設定 ${fmt(source.padMargin)} mm；不代表結構補強面積、承載或焊接設計核准。點間應依 3D 曲線加點修邊。</p>`});
    const holeRows=hole.filter(q=>pieceOf(pad,q.inner)===piece||pieceOf(pad,q.outer)===piece);
    const faceCell=(row,face)=>pieceOf(pad,row)===piece?`${fmt((Rc+R)*row.betaRad)}／${esc(shortArc(row.phiRad,face==='inner'?R:Ro))}`:'另片';
    chunks(holeRows).forEach((part,pageIndex)=>{
    const holeTable=table(['站角 °','內面：母管 S背／短弧 mm','外面：母管 S背／板外短弧 mm','內面 φ °','外面 φ °'],part.map(q=>`<tr data-pad-station="${fmt(q.angle)}"><td>${fmt(q.angle)}</td><td>${faceCell(q.inner,'inner')}</td><td>${faceCell(q.outer,'outer')}</td><td>${pieceOf(pad,q.inner)===piece?fmt(q.inner.phiDegrees,4):'另片'}</td><td>${pieceOf(pad,q.outer)===piece?fmt(q.outer.phiDegrees,4):'另片'}</td></tr>`).join(''));
    pages.push({role:'formed-pad-hole',title:`已成形彎頭補強板 ${name} · 穿厚孔口${pageIndex?'（續）':''}`, body:`<p>${esc(common)}</p><p class="notice">補強板孔 Ø${fmt(params.branchOD+2*source.padClearance)} mm，沿支管軸方向穿厚；內外面孔緣不同，不能沿板厚法線照一條孔線直接割穿。</p><p>站角沿支管：從自由端朝接頭看，0° 為 −當地切線的截面投影，順時針增加；與母管 φ 的方向基準不同。</p>${holeTable}<p class="note">S背欄皆為母管 A 端外背位置，用來找同截面；內面短弧半徑 ${fmt(R)} mm，板外短弧半徑 ${fmt(Ro)} mm。先核對 φ，再量表列短弧。『另片』表示該面的此點歸另一片，不得跨片連成裁線。</p><p class="note">孔隙為支管外半徑加每側 ${fmt(source.padClearance)} mm；各站點重新求理想環面與支管軸圓柱交線，沒有縮放或內外面共用孔線。</p><p class="note">砂輪修磨、坡口、切縫與焊接收縮依現場工法另行處理；先試配並記錄根隙。此表不核准用焊接填補任何尺寸差，也不提供壓力設計。</p>`});
    });
  }
  if(pad.splitAxis!==null){
    const seamRows=[...pad.splitLocator.inner.map(q=>({...q,face:'內面',radius:R})),
      ...pad.splitLocator.outer.map(q=>({...q,face:'外面',radius:Ro}))];
    const seamTable=table(['面／接縫點','端點','母管 S背 mm','φ °','該面短弧 mm'],seamRows.map(q=>{
      const kind=(q.segment===1&&q.end===1)||(q.segment===2&&q.end===2)?'板外緣':'孔緣';
      return`<tr data-pad-seam-face="${q.face}" data-pad-seam-point="${q.segment}-${q.end}"><td>${q.face} ${q.segment}-${q.end}</td><td>${kind}</td><td>${fmt(q.motherRearDistance)}</td><td>${fmt(q.phiDegrees,4)}</td><td>${esc(shortArc(q.phiRad,q.radius))}</td></tr>`;
    }).join(''));
    const coordinate=pad.splitAxis===0?`固定彎曲位置 β=${fmt(pad.splitCoordinate*180/Math.PI,4)}°`:
      `固定截面位置 φ=${fmt(wrap(pad.splitCoordinate)*180/Math.PI,4)}°`;
    pages.push({role:'formed-pad-seam',title:'已成形彎頭補強板 · 兩片共用接縫定位',body:`<p>${esc(common)}</p><p class="notice">本頁同時供 A、B 兩片製作。內面與外面孔緣接縫端點不同，不能共用一套點位；孔內不留板材，也不把接縫切線穿過孔。</p>${formedElbowPadLocatorSVG(result)}<p>${esc(coordinate)}；接縫 1、2 各為一段板外緣至孔緣的材料邊界。</p>${seamTable}<p class="note">從 A 端沿母管外背量 S背，再依 φ 找截面方位。內面短弧用半徑 ${fmt(R)} mm；外面短弧用半徑 ${fmt(Ro)} mm。先在兩面分別標記端點，再按固定 β／φ 的板厚法線曲面分片。</p><p class="note">孔緣端點以理想環面與支管軸孔重新求交，不從稀疏 ${padCount} 站孔表內插。接縫間隙、刀縫、焊道收縮與組裝次序依現場工法另訂；先試配兩片與支管。</p><p class="note">本頁為已成形曲面定位，非平板展開／非 1:1；不核准板厚、補強面積、壓力或焊縫強度。</p>`});
  }
  return pages;
}

export function buildElbowPadLocatorHTML(result,meta={},options={}){
  const pages=buildElbowPadPageBodies(result,options),id=esc(String(meta.id??'J-001').slice(0,32)),revision=esc(String(meta.revision??'1').slice(0,12));
  return`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>${id} 成形彎頭補強板定位工單</title><style>@page{size:A4 portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;font-family:Arial,'Microsoft JhengHei',sans-serif;color:#172b3b}.page{position:relative;width:210mm;height:297mm;padding:10mm 10mm 16mm;break-after:page;overflow:hidden}.page:last-child{break-after:auto}header{display:flex;justify-content:space-between;border-bottom:.4mm solid #253d50;margin-bottom:3mm;padding-bottom:2mm}h1{font-size:14pt;margin:0}.meta{font-size:8.5pt}p{font-size:8.8pt;line-height:1.4;margin:2mm 0;overflow-wrap:anywhere}.notice{border-left:1mm solid #e58b28;padding-left:2mm;background:#fff7e8}.note{font-size:8.5pt;line-height:1.4}svg{display:block;width:100%;height:auto;max-height:52mm;margin:2mm 0}.pad-table{font-size:8.5pt;border-collapse:collapse;width:100%;margin:2mm 0}.pad-table th,.pad-table td{border:.2mm solid #8296a5;padding:.8mm;text-align:center}.pad-table th{background:#edf2f6}footer{position:absolute;bottom:7mm;left:10mm;right:10mm;border-top:.2mm solid #8296a5;padding-top:2mm;display:flex;justify-content:space-between;font-size:8.5pt}.page-content{display:flow-root}@media screen{body{background:#e7ebef}.page{background:white;margin:8mm auto;box-shadow:0 1mm 4mm #0002}}@media print{.page{margin:0}}</style></head><body>${pages.map((p,i)=>`<section class="page" data-role="${p.role}"><header><h1>${esc(p.title)}</h1><div class="meta">接頭 ${id}<br>版次 ${revision}</div></header><main class="page-content">${p.body}</main><footer><span>已成形板定位 · 非平板展開／非 1:1</span><span>${i+1} / ${pages.length}</span></footer></section>`).join('')}</body></html>`;
}
