/** Printable field locations for a finite ideal elbow. No flat torus template. */
import {computeExactElbowStationTable,computeExactElbowLocatorTable} from './elbow-geometry.js';
import {validateFabricationPlan,reconcileFitRecords,fitPointStatus,fitPhaseStatus} from './fabrication-plan.js';
import {buildElbowPadPageBodies} from './elbow-pad-field.js';
const TAU=2*Math.PI;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(n,d=3)=>Number.isFinite(n)?Number(n.toFixed(d)).toString():'—';
const digits=r=>Math.max(3,Math.min(8,Math.ceil(-Math.log10(r.params.tolerance))+1));
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
function requireJoint(r){if(r?.valid!==true||!r.geometry?.elbow||r.manufacturingReady!==true)throw new Error('彎頭幾何與採樣裁線精度必須達標後才能製作工單。');if(r.params.motherOpening===false&&r.params.jointType!=='on')throw new Error('母管不開孔僅支援外焊支撐，不能產生內插工單。');if(r.params.tolerance<1e-5)throw new Error('紙本工單支援裁線公差至少 0.00001 mm。');return r;}
function text(x,y,s,attributes=''){return`<text x="${fmt(x)}" y="${fmt(y)}" ${attributes}>${esc(s)}</text>`;}
function path(points){return points.map((p,i)=>`${i?'L':'M'}${fmt(p[0],6)},${fmt(p[1],6)}`).join(' ');}
function rowCount(value,fallback){const n=value??fallback;if(!Number.isInteger(n)||n<4||n>720)throw new Error('工單分點區段須為 4 至 720 的整數。');return n;}
const motherClosed=result=>result.params.motherOpening===false;
function alignmentLabel(params){return params.elbowAlignment==='b-axis'?'B端同軸延伸（軸線重合且方向鎖定）':params.elbowAlignment==='a-axis'?'A端同軸延伸（軸線重合且方向鎖定）':'自由方位';}
/** Same cross-section point, measured from the extrados by its shorter arc.
 * A-to-B view with extrados up: increasing phi is left, decreasing is right. */
export function elbowShortArcMeasurement(result,row){
  const radius=Number(result?.params?.mainOD)/2,phi=Number(row?.phiRad);
  if(!Number.isFinite(radius)||radius<=0||!Number.isFinite(phi))throw new Error('短弧量距需要有效外徑與截面角度。');
  const angle=((phi%TAU)+TAU)%TAU,C=TAU*radius,d=digits(result);
  if(Math.min(angle,TAU-angle)<1e-10)return{direction:'back',distance:0,label:'外背0'};
  if(Math.abs(angle-Math.PI)<1e-10)return{direction:'either',distance:C/2,label:`左/右 ${fmt(C/2,d)}`};
  const left=angle<Math.PI,measure=radius*(left?angle:TAU-angle);
  return{direction:left?'left':'right',distance:measure,label:`${left?'左':'右'} ${fmt(measure,d)}`};
}

/** A parameter index plus a cross-section legend, deliberately not 1:1. */
export function elbowLocatorSVG(result,rows){
  requireJoint(result);rows=rows??computeExactElbowLocatorTable(result,24);const closed=motherClosed(result),locatorTitle=closed?'貼合定位索引圖':'母孔定位索引圖';
  if(!Array.isArray(rows)||rows.length<3||rows.some(r=>![r.rearDistance,r.phiRad,r.circumference].every(Number.isFinite)))throw new Error(closed?'貼合定位點資料不完整。':'母孔定位點資料不完整。');
  const r=result.params.mainOD/2,center=result.params.surfaceClock*Math.PI/180;
  const data=rows.map(q=>[q.rearDistance,r*(center+Math.atan2(Math.sin(q.phiRad-center),Math.cos(q.phiRad-center)))]);
  const minX=Math.min(...data.map(p=>p[0])),maxX=Math.max(...data.map(p=>p[0])),minY=Math.min(...data.map(p=>p[1])),maxY=Math.max(...data.map(p=>p[1]));
  const map=p=>[52+398*(p[0]-minX)/Math.max(1e-9,maxX-minX),207-148*(p[1]-minY)/Math.max(1e-9,maxY-minY)];
  let plot=`<path d="M52 59V207H450" fill="none" stroke="#738292"/><path d="${path(data.map(map))}" fill="none" stroke="#28628e" stroke-width="2"/>`;
  const stride=Math.max(1,Math.ceil((rows.length-1)/24));
  rows.forEach((q,i)=>{if(i===rows.length-1||i%stride)return;const[x,y]=map(data[i]);plot+=`<g data-station="${i}" data-s="${fmt(q.rearDistance,8)}" data-u="${fmt(q.circumference,8)}"><circle cx="${fmt(x)}" cy="${fmt(y)}" r="3" fill="#e57127"/>${text(x+4,y-4,i+1)}</g>`;});
  const cx=594,cy=133,rr=62;
  return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 270" role="img" aria-label="${closed?'彎頭貼合定位索引':'彎頭母孔定位索引'}，非一比一展開"><defs><marker id="elbow-positive-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0L6 3L0 6Z" fill="#e57127"/></marker></defs><g font-family="sans-serif" font-size="12" fill="#233447">${text(52,22,`${locatorTitle} · 非 1:1`)}${text(52,42,`S背 ${fmt(minX)}–${fmt(maxX)} mm；圖中 U 使用連續角度`)}${plot}${text(52,228,fmt(minX))}${text(450,228,fmt(maxX),'text-anchor="end"')}${text(249,249,'S背：從 A 端沿外背脊量 mm','text-anchor="middle"')}${text(8,73,fmt(maxY))}${text(8,207,fmt(minY))}${text(594,22,'同截面：从 A 朝 B 看','text-anchor="middle"')}${text(594,42,'外背置上；正向逆時針','text-anchor="middle"')}<circle cx="${cx}" cy="${cy}" r="${rr}" fill="none" stroke="#738292"/><path d="M${cx},${cy-rr}A${rr},${rr} 0 0 0 ${cx-rr},${cy}" fill="none" stroke="#e57127" stroke-width="2" marker-end="url(#elbow-positive-arrow)"/>${text(cx,cy-rr-7,'0° 外背','text-anchor="middle"')}${text(cx-rr-8,cy+4,'90° +Z','text-anchor="end"')}${text(cx+rr+8,cy+4,'270° −Z')}${text(cx,cy+rr+18,'180° 腹側','text-anchor="middle"')}${text(594,242,'U 從外背沿箭頭量；0 與整圈同點','text-anchor="middle"')}</g></svg>`;
}

function branchIndex(result,rows,D){
  const C=result.measurements.branchCircumference,max=Math.max(...rows.flatMap(q=>[q.outerDepth-D,q.innerDepth-D]),1),map=(x,y)=>[20+640*x/C,160-120*y/max];
  const outer=rows.map(q=>map(q.circumference,q.outerDepth-D)),inner=rows.map(q=>map(q.circumference,q.innerDepth-D));
  return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 190" role="img" aria-label="支管分點與定位環示意，非一比一"><g fill="none"><path d="M20 160H660" stroke="#728296" stroke-dasharray="5 3"/><path d="${path(outer)}" stroke="#28628e" stroke-width="2"/><path d="${path(inner)}" stroke="#95a0ad" stroke-dasharray="4 3"/></g><g font-family="sans-serif" font-size="13" fill="#233447">${text(20,18,'尺寸示意 · 非 1:1；深度從同一自由直端量')}${text(20,180,`0° 起縫；定位環 D=${fmt(D)} mm`)}${text(660,180,'360° 回起縫','text-anchor="end"')}${text(360,150,'D 定位環：各點距環＝成品深度 − D','text-anchor="middle"')}</g></svg>`;
}
function pointSegment(p,a,b){const ab=b.map((v,j)=>v-a[j]),den=ab.reduce((s,v)=>s+v*v,0),t=den?Math.max(0,Math.min(1,p.reduce((s,v,j)=>s+(v-a[j])*ab[j],0)/den)):0;return distance(p,a.map((v,j)=>v+t*ab[j]));}
function motherPolylineEstimate(result,count,rows){
  const subdivisions=Math.min(8,Math.floor(4096/count)),dense=computeExactElbowLocatorTable(result,count*subdivisions);let error=0;
  for(let i=0;i<count;i++)for(let j=1;j<subdivisions;j++)error=Math.max(error,pointSegment(dense[i*subdivisions+j].point,rows[i].point,rows[i+1].point));
  return error*1.1;
}
function processPlan(result,raw){if(raw===undefined)return null;const p=validateFabricationPlan(raw),reconciled=reconcileFitRecords(p,result.params);return{...reconciled,meaningful:p.tool!=='grinder'||p.wpsId.trim()||p.gapBasis.trim()||p.weldNote.trim()||p.disposition.trim()||p.edgeCondition!=='unknown'||p.tackAngles.length||[p.stock,p.markError,p.cutError,p.kerf,p.gapMin,p.gapMax,p.bevelAngle,p.rootFace,...p.preGaps,...p.postGaps].some(v=>v!==null)};}
const chunk=(list,n)=>Array.from({length:Math.ceil(list.length/n)},(_,i)=>list.slice(i*n,(i+1)*n));
// Bound both characters and visual lines; many explicit newlines must not
// overflow a page just because the total character count remains small.
function noteChunks(s,n=600){const pages=[];let part='',chars=0,column=0,lines=1;for(const c of String(s)){const extra=c==='\n'||(c!=='\r'&&column>=46)?1:0;if(part&&(chars>=n||lines+extra>34)){pages.push(part);part='';chars=0;column=0;lines=1;}part+=c;chars++;if(c==='\n'){lines++;column=0;}else if(c!=='\r'){if(column>=46){lines++;column=0;}column++;}}if(part)pages.push(part);return pages;}
const META_LABELS={id:'接頭編號',revision:'版次',title:'標題',name:'名稱',project:'專案',projectName:'專案名稱',preparedBy:'製作／繪製',company:'公司',date:'日期',createdAt:'建立日期',updatedAt:'更新日期',notes:'專案備註'};
function metadataPages(meta){if(!meta||typeof meta!=='object'||Array.isArray(meta))throw new Error('工單描述必須是物件。');const entries=Object.entries(meta).filter(([k,v])=>v!==undefined&&v!==null&&String(v).trim()&&(!['id','revision'].includes(k)||String(v).length>(k==='id'?32:12)));if(!entries.length)return[];const content=entries.map(([k,v])=>`${META_LABELS[k]??k}：${String(v)}`).join('\n\n');return noteChunks(content).map((text,i)=>({role:'metadata',title:i?'專案資料與備註（續）':'專案資料與備註',body:`<div class="long-note">${esc(text)}</div>`}));}
const compact=(value,max)=>{const s=String(value??'');return Array.from(s).length>max?Array.from(s).slice(0,max-1).join('')+'…':s;};
function pageBodies(result,options={}){
  requireJoint(result);const p=result.params,d=digits(result),branchCount=rowCount(options.branchCount,12),motherCount=rowCount(options.motherCount,24),branch=computeExactElbowStationTable(result,branchCount),mother=computeExactElbowLocatorTable(result,motherCount),D=Math.floor(p.branchLength),pages=[],closed=motherClosed(result),alignment=alignmentLabel(p);
  const dimensions=`彎頭 Ø${fmt(p.mainOD)} × 壁 ${fmt(p.mainWall)} mm；支管 Ø${fmt(p.branchOD)} × 壁 ${fmt(p.branchWall)} mm；${closed?'外焊支撐／母管封閉（母管不開孔）':p.jointType==='in'?'內插':'外貼'}。`;
  const angles=`中心線 R=${fmt(p.bendRadius)} mm；彎角 ${fmt(p.bendAngle)}°；位置 β=${fmt(p.bendPosition)}°；截面 φ=${fmt(p.surfaceClock)}°；當地切線夾角 α=${fmt(p.angle)}°；支管旋向 ${fmt(p.branchSwivel)}°；${alignment}。`;
  const setup=p.jointType==='in'?`內插凸入量 ${fmt(p.projection)} mm（從近側內壁沿支管軸）；孔口每側間隙 ${fmt(p.holeGap)} mm。`:`貼合徑向間隙 ${fmt(p.rootGap)} mm。${closed?'母管保持封閉。':`孔口每側間隙 ${fmt(p.holeGap)} mm。`}`;
  chunk(branch,13).forEach((rows,i)=>pages.push({role:'branch',title:i?'支管成品分點（續）':closed?'外焊支撐支管成品分點工單':'直支管成品分點工單',body:`<p>${esc(dimensions)}</p><p>${esc(angles)}</p><p>${esc(setup)}</p><p class="notice">從同一自由直端沿支管軸量深度；先畫 D=${fmt(D)} mm 定位環，再由環量各點偏移。從自由端朝接頭看，0° 沿 −當地切線的截面投影，站角順時針增加。</p>${i?'':branchIndex(result,branch,D)}<table><thead><tr><th>角度 °</th><th>外周距 mm</th><th>外緣深度 mm</th><th>外緣距 D mm</th><th>內緣深度 mm</th><th>內緣距 D mm</th></tr></thead><tbody>${rows.map(q=>`<tr data-station-angle="${fmt(q.angle)}"><td>${fmt(q.angle)}</td><td>${fmt(q.circumference,d)}</td><td>${fmt(q.outerDepth,d)}</td><td>${fmt(q.outerDepth-D,d)}</td><td>${fmt(q.innerDepth,d)}</td><td>${fmt(q.innerDepth-D,d)}</td></tr>`).join('')}</tbody></table><p class="note">分點座標為精確角度求交。表中點間直線不是精細裁線；支管另印 1:1 外徑包覆 fishmouth 樣板，並修磨內、外成品緣。內緣是同角度參考，不能當內徑包覆展開。</p><p class="note">理想圓形彎頭與直圓支管；未含現場橢圓度、坡口、刀縫或焊接收縮。${p.padEnabled?'已成形補強板另附曲面定位頁；不提供平板展開。':'此版未啟用彎頭補強板。'}不提供粗切全壁厚留料包絡。</p>`}));
  const estimate=motherPolylineEstimate(result,motherCount,mother);
  const axisText=p.elbowAlignment==='b-axis'?'B端同軸延伸':p.elbowAlignment==='a-axis'?'A端同軸延伸':'自由方位';
  const motherDimensions=`母管 Ø${fmt(p.mainOD)}×${fmt(p.mainWall)}；支管 Ø${fmt(p.branchOD)}×${fmt(p.branchWall)} mm；R=${fmt(p.bendRadius)} mm；彎角 ${fmt(p.bendAngle)}°；β=${fmt(p.bendPosition)}°／φ=${fmt(p.surfaceClock)}°；${axisText}；${closed?'母管不開孔':p.jointType==='on'?'外貼開孔':'開孔內插'}。`;
  chunk(mother,25).forEach((rows,i)=>pages.push({role:'mother',title:closed?(i?'彎頭貼合定位（續）':'彎頭貼合定位工單'):(i?'彎頭母孔分點（續）':'彎頭母孔分點定位工單'),body:`<p>${esc(motherDimensions)}</p><p class="notice">${closed?'母管不開孔；足跡只供貼合標記，禁止依輪廓切除母管。':'表列母管外壁孔口。'}定位索引圖不是整片 1:1 展開。從 A 端量 S背，再於同一截面從外背沿箭頭量 U。</p>${i?'':elbowLocatorSVG(result,mother)}<table class="mother-table"><thead><tr><th>點</th><th>β °</th><th>S背 mm</th><th>S腹 mm</th><th>φ °</th><th>U mm</th><th>省力量法 mm</th></tr></thead><tbody>${rows.map(q=>`<tr><td>${q.station+1}</td><td>${fmt(q.betaDegrees,4)}</td><td>${fmt(q.rearDistance,d)}</td><td>${fmt(q.bellyDistance,d)}</td><td>${fmt(q.phiDegrees,4)}</td><td>${fmt(q.circumference,d)}</td><td>${esc(elbowShortArcMeasurement(result,q).label)}</td></tr>`).join('')}</tbody></table><p class="note">S背／S腹從 A 端量，U 從外背逆時針量；省力欄沿左／右短弧定位同點。0 與 ${fmt(Math.PI*p.mainOD,d)} mm 為同點。</p><p class="note">用背／腹兩點和治具校正同截面；捲尺須垂直當地中心線。由 A 朝 B 看、外背在上：90° 左，270° 右。</p><p class="note">${motherCount} 區段僅作定位；點間硬連直線的 3D 密採偏差估計約 ${fmt(estimate,5)} mm（含 1.1 餘量），不保證達到核心 ${fmt(p.tolerance,5)} mm 公差。需加點／依 3D 核對修磨。${closed?'表列支管外緣貼合足跡；母管保持封閉，支管內外緣另修磨。':'表列外壁孔口；內緣與壁厚配合 3D，不能沿外壁法線直接割穿當貫穿刀路。'}</p>`}));
  if(result.geometry.pad)pages.push(...buildElbowPadPageBodies(result,options));
  const fabrication=processPlan(result,options.fabrication);
  if(fabrication?.meaningful){const f=fabrication.plan,rows=Array.from({length:f.count},(_,i)=>({angle:i*360/f.count,pre:f.preGaps[i],post:f.postGaps[i],a:fitPointStatus(f,i),b:fitPointStatus(f,i,'post')}));
    chunk(rows,12).forEach((points,i)=>pages.push({role:'process',title:i?'加工與試配紀錄（續）':'加工與試配紀錄',body:`<p>工具：${esc({grinder:'砂輪／磨切',saw:'鋸切',plasma:'電漿',other:'其他'}[f.tool])}；切縫 ${fmt(f.kerf)} mm；坡口 ${fmt(f.bevelAngle)}°；鈍邊 ${fmt(f.rootFace)} mm。</p><p class="notice">使用者沿軸留料 ${fmt(f.stock)} mm；預估標線偏差 ±${fmt(f.markError)} mm；預估切磨偏差 ±${fmt(f.cutError)} mm。這些僅為工藝估計與紀錄，不生成彎頭全壁厚粗切包絡，不自動改成品裁線。</p><p>工法／版次：${esc(f.wpsId||'未填')}；根隙範圍 ${fmt(f.gapMin)}–${fmt(f.gapMax)} mm。</p><p>量測基準：${esc(f.gapBasis||'未填')}。</p>${fabrication.cleared?'<p class="notice">舊試配紀錄與目前幾何不一致，已清除舊實測值，請重新量測。</p>':''}<table><thead><tr><th>角度 °</th><th>試配根隙 mm</th><th>狀態</th><th>點固後 mm</th><th>狀態</th></tr></thead><tbody>${points.map(q=>`<tr data-station-angle="${fmt(q.angle)}"><td>${fmt(q.angle)}</td><td>${fmt(q.pre)}</td><td>${esc(q.a.label)}</td><td>${fmt(q.post)}</td><td>${esc(q.b.label)}</td></tr>`).join('')}</tbody></table><p>試配：${esc(fitPhaseStatus(f).label)}；點固後：${esc(fitPhaseStatus(f,'post').label)}。範圍比對不代表焊接核准。</p><p>點固參考：${esc(f.tackAngles.length?f.tackAngles.map(a=>`${fmt(a)}°`).join('、'):'未填')}；切口狀況：${esc({unknown:'尚未核對',checked:'已核對',damaged:'有損傷需處置'}[f.edgeCondition])}。</p>`}));
    const notes=[f.weldNote.trim()?`焊道／點固順序：${f.weldNote}`:'',f.disposition.trim()?`修整／處置：${f.disposition}`:''].filter(Boolean).join('\n\n');
    if(notes&&Array.from(notes).length<=200&&notes.split(/\r\n|\r|\n/).length<=4)pages.at(-1).body+=`<div class="long-note">${esc(notes)}</div>`;
    else for(const text of noteChunks(notes))pages.push({role:'process-notes',title:'工藝與處置文字紀錄',body:`<div class="long-note">${esc(text)}</div><p class="note">文字為使用者填入的工藝紀錄；此版未產生粗切留料包絡，也未自動設定焊接要求。</p>`});
  }
  const analyticBody=result.wallEnvelope?.retainedBodyMethod==='analytic-extrados-radial-monotonicity';
  const collisionThreshold=analyticBody?'外背法線解析排除再入壁':'完成有限探查';
  const collisionDescription=analyticBody?`外背法線保留管身以距離單調性解析排除再入母管；內插停止位置另外探查 ${fmt(result.wallEnvelope?.checks,0)} 站。`:`實際壁厚探查 ${fmt(result.wallEnvelope?.checks,0)} 站。`;
  if(options.includeValidation)pages.push({role:'validation',title:'理想彎頭幾何與數值驗證',body:`<table><thead><tr><th>檢查</th><th>數值</th><th>單位</th><th>門檻</th><th>結果</th></tr></thead><tbody>${result.verification.map(v=>`<tr><td>${esc(v.label)}</td><td>${fmt(v.value,8)}</td><td>${esc(v.unit)}</td><td>${v.id==='wall-collision'?collisionThreshold:v.id==='formed-pad-layer-checks'?'有限探查':['formed-pad-whole-thickness-margin','formed-pad-free-end'].includes(v.id)?'≥ '+fmt(v.tolerance,8):'≤ '+fmt(v.tolerance,8)}</td><td>${esc(v.status)}</td></tr>`).join('')}</tbody></table><p>幾何離散點數：要求 ${fmt(result.precision.requestedSamples,0)}，實際 ${fmt(result.precision.effectiveSamples,0)}；${result.precision.auto?'自動加密':'手動'}。</p><p>每段 7 個內部點的採樣弦差 ${fmt(result.precision.sampledMaxChordError,8)} mm × ${fmt(result.precision.guardFactor)} 數值餘量 = ${fmt(result.precision.maxChordError,8)} mm；目標 ${fmt(p.tolerance,8)} mm。</p><p class="notice">方程殘差代表理想環面求交誤差；採樣弦差、有限支管壁厚干涉探查不是連續全域嚴格誤差／包絡證明。紙本稀疏定位點的點間偏差另列在${closed?'貼合定位頁':'母孔頁'}。</p><p>${esc(collisionDescription)}未包含實物橢圓度、製作偏差或結構／壓力設計核准。</p><p>${esc(result.warnings.join('\n'))}</p>`});
  pages.push(...metadataPages(options.metadata??options.meta??{}));
  return pages;
}
export function elbowWorkOrderPageCount(result,options={}){return pageBodies(result,options).length;}
export function elbowWorkOrderPageRoles(result,options={}){return pageBodies(result,options).map(page=>page.role);}
export function buildElbowWorkOrderHTML(result,meta={},options={}){
  const pages=pageBodies(result,{...options,metadata:meta}),id=esc(compact(meta.id??'J-001',32)),revision=esc(compact(meta.revision??'1',12));
  return`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>${id} 彎頭製作工單</title><style>@page{size:A4 portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,'Microsoft JhengHei',sans-serif;color:#172b3b}body{background:#e7ebef}.page{position:relative;width:210mm;height:297mm;padding:10mm 10mm 16mm;background:#fff;break-after:page;overflow:hidden}.page:last-child{break-after:auto}.page-header{display:flex;justify-content:space-between;border-bottom:.4mm solid #253d50;padding-bottom:2mm;margin-bottom:3mm}h1{font-size:5mm;margin:0}h2{font-size:4mm;margin:0}p{font-size:3.1mm;line-height:1.45;margin:2mm 0;overflow-wrap:anywhere}.meta{font-size:2.7mm}.notice{border-left:1mm solid #e58b28;padding-left:2mm;background:#fff7e8}.note{font-size:2.8mm;line-height:1.4}svg{display:block;width:100%;height:auto;max-height:59mm;margin:2mm 0}table{border-collapse:collapse;width:100%;font-size:3.2mm;margin:3mm 0}th,td{border:.2mm solid #8296a5;padding:1.2mm 1mm;text-align:center}th{background:#edf2f6;font-weight:600}.mother-table{font-size:3.0mm}.mother-table th,.mother-table td{padding:.75mm 1mm}.page-footer{position:absolute;bottom:7mm;left:10mm;right:10mm;border-top:.2mm solid #8296a5;padding-top:2mm;font-size:2.5mm;display:flex;justify-content:space-between}.long-note{white-space:pre-wrap;overflow-wrap:anywhere;font-size:3mm;line-height:1.65}.page-content{display:flow-root}.pad-table{font-size:3mm!important}.pad-table th,.pad-table td{padding:.75mm .8mm}.page[data-role^="formed-pad"] .note,.page[data-role^="formed-pad"] .meta,.page[data-role^="formed-pad"] .page-footer{font-size:3mm}.page[data-role^="formed-pad"] svg{max-height:49mm}@media screen{.page{margin:8mm auto;box-shadow:0 1mm 4mm #0002}}@media print{body{background:white}.page{margin:0;box-shadow:none}}</style></head><body>${pages.map((p,i)=>`<section class="page" data-page="${i+1}" data-role="${p.role}"><header class="page-header"><h1>${esc(p.title)}</h1><div class="meta">接頭 ${id}<br>版次 ${revision}</div></header><main class="page-content">${p.body}</main><footer class="page-footer"><span>${id} · 版次 ${revision} · 理想彎頭／直支管</span><span>${i+1} / ${pages.length}</span></footer></section>`).join('')}</body></html>`;
}
