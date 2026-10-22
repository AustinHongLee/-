import {TANK_DEFAULTS} from './tank-geometry.js';
import {NOZZLE_DEFAULTS} from './tank-nozzles.js';
import {applyFlangeReference} from './tank-flanges.js';
import {esc,fmt} from './tank-visuals.js';
import {v1102Fabrication} from './tank-v1102-fabrication.js';
import {normalizeFabrication} from './tank-fabrication.js';

export const V1102_ID='v1102-drawing-study';
export const V1102_PORTS=Object.freeze([
  {mark:'N1',size:'1 1/2',od:48.3,t:5.08,station:100,integral:true,neck:67,inside:550,service:'進料／浸入管'},
  {mark:'N2',size:'1',od:33.4,t:4.55,station:250,integral:true,neck:51,inside:550,service:'泵最小流量／浸入管'},
  {mark:'N3',size:'2',od:60.3,t:3.91,station:990,angle:180,pad:160,inside:0,service:'泵出口／防渦流器'},
  {mark:'N4',size:'1 1/2',od:48.3,t:3.68,station:770,offset:150,integral:true,neck:67,service:'排氣'},
  {mark:'SN1',size:'3',od:88.9,t:5.49,station:600,pad:190,service:'備用／盲板'},
  {mark:'SV1',size:'1 1/2',od:48.3,t:3.68,station:420,offset:-150,integral:true,neck:67,service:'SV1（用途未填）'},
  {mark:'T1',size:'1 1/2',od:48.3,t:3.68,host:'bottom',radius:175,angle:180,integral:true,neck:67,service:'溫度儀表'},
  {mark:'P1',size:'2',od:60.3,t:3.91,station:770,offset:-150,pad:160,service:'壓力儀表'},
  {mark:'L1',size:'3',od:88.9,t:5.49,station:420,offset:150,pad:190,service:'雷達液位'},
  {mark:'L2a',size:'3',od:88.9,t:5.49,station:950,pad:190,service:'膜片式液位上口'},
  {mark:'L2b',size:'3',od:88.9,t:5.49,host:'top',radius:175,angle:180,pad:190,service:'膜片式液位下口'},
  {mark:'H1',size:'12',od:323.9,t:9.52,station:550,angle:90,pad:600,projection:250,kind:'manhole',service:'手孔／吊桿蓋'}
]);
export const V1102_NOTES=Object.freeze([
  ['來源','單頁附件','來源為使用者提供的 V-1102_3.pdf：附件只有 1 頁掃描製作圖，頁腳標示 2/34，另有藍色 A～P／S1～S12 對照標記。其他頁及完整設計計算書不在本附件中。'],
  ['已讀圖','槽體','臥式，內徑 650、切線間距 1100、筒板與封頭名義厚 5 mm；SA240-316L。封頭圖註成形後最薄 4.3 mm，尚未作成形減薄校核。'],
  ['已讀圖','開口與改版','12 個有效開口，全部 Class 150 RF；SN2 已在表中刪除，不建立。原圖名稱保留，N1～N12 為程式內部編號。'],
  ['推導','偏心管軸','L1／N4 與 SV1／P1 的橫向偏心暫取 ±150 mm：由外伸 200、端面高 494 與外半徑 330 推得約 150。端視左右依圖建立；未標尺寸，仍須確認方向與偏心。'],
  ['推導','浸入管','N1／N2 端面至管底 755，外伸 200、壁厚 5，因此內凸包絡為 550 mm。保留整體包絡；分件表已登錄長頸、縮徑與管段，分界尺寸、透氣孔及分段焊口仍待核。'],
  ['推導','切線與焊口','TL 到 WL 中心 20，採詳圖根隙 2，換成程式封頭直邊 19＋間隙 2；筒板成品軸長 1058 mm，管嘴站位從板邊起算，減去 21。筒身縱縫亦留 2 mm；主縫依圖示 V60°、鈍邊 1.5、根隙 2 記錄，不套用工具原本薄板 I 形坡口。GTAW／FCAW 多製程尚未分道。這是圖面換算，需以實際封頭直邊與 WPS 覆核。'],
  ['參考','法蘭與管料','一般 WN 的盤徑、盤厚與總長使用工具既有參考表，原圖未逐一標尺寸；單重未知。LWN 只參考同 NPS／Class 的盤徑與盤厚，頸部採圖示外徑，頸長包絡暫取 235；不套用短頸 WN 管長。Sch 40S／80S 管料尺寸另對照 Atlas Steels 廠商表；H1 管厚採圖示 9.52；盲蓋只畫示意外形，厚度未知，不用 WN 盤厚推蓋板重量。'],
  ['待核對','封頭口投影','T1／L2b 採各接件詳圖的外伸 200、偏心 175；表中 480 C.L. 與側視基準的關係未能單憑這張圖釐清，不能當作已完成端口定位驗證。'],
  ['分件草稿','支承與附件','支承兩組TL+275／825、中心距550，底板670×140×12、腳底軸向寬110、兩側15、支承跨距590、孔距480、槽軸至板底800。A側2孔Ø19，B側2長孔19×29（軸向）；孔列軸向偏置未標。150為接地片高度，不是立板寬。底部7/7全周角焊可讀；9t鞍座的拆件、上緣／斜邊及590尺寸面待核。830×250×5先備板與142°成形分開記錄；中面R332.5下弧長824.057，差5.943未指定處理；外弧830.253接近830，可能按外弧取整，此為推測。灰線框為待核包絡，黃虛線為接合區。'],
  ['估料設定','原圖未指定','原板先用 4×8 呎、密度 8000 kg/m³、修邊 5、刀縫 3、管料留長 10 mm、起縫方位 45°；使用率 90% 只是估料設定，並非圖面 0.4 m³ 的液位或有效容量。封頭毛坯、單重、收縮餘量未提供。'],
  ['待設計','規範條件','照錄 ASME VIII Div.1、F.V.～3.5 kg/cm²G／80°C、E=0.85、CA=0、RT 20% MIN、PWHT NO、水壓 4.6 kg/cm²。未取得完整計算書、材料證明、版次、最低設計溫度或試驗應力比，不判定承壓、外壓或試驗合格。'],
  ['差異','容量與重量','原圖記容量 0.4 m³、空重 540／操作 880／滿水 970 kg。程式幾何容量另算，未扣內件；重量只列已計部分，不以調密度或板厚湊原圖重量。']
]);
export function createV1102Input(){
  // TL→WL centre = 20; root opening = 2: head straight 19, plate edge 21.
  const p={...structuredClone(TANK_DEFAULTS),referenceCase:V1102_ID,shape:'custom',orientation:'horizontal',top:'elliptical',bottom:'elliptical',solve:'volume',basis:'inside',diameter:650,height:1100,shellThickness:5,endThickness:5,topThickness:5,headStraight:19,headGap:2,density:8000,stockWidth:1219.2,stockLength:2438.4,seamStart:45,material:'SA240-316L',service:'both',code:'asme',pressure:343.23275,temperature:80,corrosion:0,efficiency:.85};
  p.gap=2;p.methods.heat.material='ss';p.methods.heat.pwht='no';p.methods.welding.buttProcess='gtaw';p.methods.welding.filletProcess='gtaw';p.methods.welding.squareMax=1;p.methods.welding.bevelAngle=60;p.methods.welding.rootFace=1.5;p.methods.welding.rootGap=2;p.methods.inspection.rt='drawing';p.methods.misc.nameplate=false;
  p.nozzles=V1102_PORTS.map((port,i)=>{
    let n={...NOZZLE_DEFAULTS,id:'N'+(i+1),mark:port.mark,name:port.mark+' · '+port.service,host:port.host??'shell',height:port.station===undefined?0:port.station-21,angle:port.angle??0,radius:port.radius??0,axisMode:port.offset?'parallel':'radial',offset:port.offset??0,od:port.od,thickness:port.t,projection:port.projection??200,inside:port.inside??0,flangeSize:port.size,flangeClass:'150',flangeFacing:'RF',flangeMaterial:'SA182-F316L',padOD:port.pad??0,padThickness:port.pad?5:0,kind:port.kind??'nozzle',reinforcement:'V-1102 原圖詳圖；補強及採購尚待核對'};
    n=applyFlangeReference(n);
    if(port.integral)Object.assign(n,{construction:'integral',neckOD:port.neck,flangeLength:235,flangeSource:'manual',flangeSpec:'LWN 一體接件；盤尺寸為同規格參考，頸長包絡待核，不拆算管長'});
    return n;
  });
  p.fabricationData=v1102Fabrication();return p;
}
export function v1102BaseMatches(r){return r?.valid&&r.input.referenceCase===V1102_ID&&r.orientation==='horizontal'&&r.endTypes.top==='elliptical'&&r.endTypes.bottom==='elliptical'&&Math.abs(r.di-650)<.01&&Math.abs(r.height-1100)<.01&&Math.abs(r.input.shellThickness-5)<.01&&Math.abs(r.input.endThickness-5)<.01&&Math.abs(r.input.topThickness-5)<.01;}
export function v1102Review(r){
  const p=r.input,ports=p.nozzles??[],expected=createV1102Input();
  const changed=[];for(const key of ['shape','orientation','top','bottom','basis','diameter','height','shellThickness','endThickness','topThickness','headStraight','headGap'])if(String(p[key])!==String(expected[key]))changed.push(key);
  if(JSON.stringify(normalizeFabrication(p.fabricationData).data)!==JSON.stringify(normalizeFabrication(expected.fabricationData).data))changed.push('fabricationData');
  const portRows=V1102_PORTS.map((source,i)=>{const n=ports.find(n=>n.mark===source.mark),e=expected.nozzles[i];return {source,n,changed:!n||['host','height','radius','angle','axisMode','offset','od','thickness','projection','inside','construction','neckOD','end','flangeSize','flangeClass','flangeFacing'].some(k=>String(n[k])!==String(e[k]))};});
  return {changed,portRows,extra:ports.filter(n=>!V1102_PORTS.some(s=>s.mark===n.mark)),pending:true};
}
export function v1102ReviewMarkup(r){
  const review=v1102Review(r),altered=review.changed.length+review.portRows.filter(p=>p.changed).length+review.extra.length;
  return `<summary><span><strong>V-1102 · 圖面重建草稿</strong><small>12 個原圖開口 · ${altered?altered+' 處已調整':'槽體與端口已建立'} · 分件與焊道仍待核</small></span><span aria-hidden="true">⌄</span></summary><div class="tank-reference-body"><p>這份專案用來核對工作台能否表達原圖。3D 可檢視位置；待核對與未拆件項目會跟著專案、CSV 與估料單保留。</p><div class="tank-reference-metrics"><span>內徑<strong>${fmt(r.di)} mm</strong></span><span>切線間距<strong>${fmt(r.height)} mm</strong></span><span>幾何容量<strong>${fmt(r.volume,4)} m³</strong></span><span>原圖容量<strong>0.4 m³</strong></span></div><div class="tank-reference-actions"><button type="button" data-reference-view="support">支承施工／修改尺寸 ↗</button><button type="button" data-reference-view="3d">看重建 3D ↗</button><button type="button" data-reference-view="nozzles">核對管嘴與法蘭 ↗</button>${!(r.input.fabricationData?.assemblies?.length)?'<button type="button" data-reference-fabrication>補入原圖分件草稿（保留目前尺寸）</button>':''}<button type="button" data-reference-drawing>下載目前配置草圖 SVG ↓</button><a href="examples/V-1102-drawing-study.json" download>下載原始重建專案 ↓</a></div>${altered?'<p class="tank-nozzle-warning">已修改來源尺寸、端口或分件，以下仍保留原圖參考；不表示與原圖一致。</p>':''}<div class="tank-reference-table"><table><thead><tr><th>原圖</th><th>用途</th><th>NPS</th><th>位置基準</th><th>接件</th><th>與重建初值</th></tr></thead><tbody>${review.portRows.map(({source:s,n,changed})=>`<tr><td>${n?`<button type="button" data-reference-port="${n.id}">${esc(s.mark)} ↗</button>`:esc(s.mark)}</td><td>${esc(s.service)}</td><td>${esc(s.size)}</td><td>${s.host?(s.host==='bottom'?'A':'B')+' 封頭，向下偏心 175':`A 端 TL +${s.station} mm${s.offset?'，橫向 '+s.offset:''}`}</td><td>${s.integral?'LWN 一體':s.kind?'手孔 WN':'WN 組焊'}</td><td>${changed?'已修改／缺少':'一致（待核點仍保留）'}</td></tr>`).join('')}</tbody></table></div><details><summary>讀圖依據、推導與目前缺口</summary>${V1102_NOTES.map(([state,title,detail])=>`<article><span>${esc(state)}</span><div><strong>${esc(title)}</strong><p>${esc(detail)}</p></div></article>`).join('')}<p>管料尺寸參考：<a href="https://atlassteels.com.au/wp-content/uploads/2021/08/Atlas-Steels-Product-Manual-Section-3.pdf" target="_blank" rel="noopener">Atlas Steels 不鏽鋼管表 ↗</a>。本案例不重製原圖的簽章、發行或審核標示。</p></details></div>`;
}
export function v1102Report(r){return `<h1>V-1102 圖面重建草稿</h1><p class="notice">位置與估料驗證案；尚未還原完整製造詳圖，不能直接下料製造。原圖容量 0.4 m³；本專案幾何容量 ${fmt(r.volume,4)} m³。已修改值以本次專案為準。</p><table><tr><th>狀態</th><th>項目</th><th>依據與差異</th></tr>${V1102_NOTES.map(row=>'<tr>'+row.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')}</table>`;}
