import {shellPiecePart,shellCourses,shellRingStations,shellBatchLabel} from './tank-shell-layout.js';
import {PROCESS_LABELS} from './tank-method-config.js';
import {grooveFor} from './tank-process.js';

export const SHELL_STEPS=Object.freeze([
  {id:'layout',title:'放樣',hint:'認板、畫基準'},
  {id:'cut',title:'下料',hint:'毛坯與修邊線'},
  {id:'roll',title:'預彎／捲板',hint:'板端與目標曲率'},
  {id:'fit',title:'組立點焊',hint:'圈位、接縫、對口'},
  {id:'weld',title:'正式焊接',hint:'焊道與量測記錄'}
]);
import {SHELL_RECORD_FIELDS,normalizeShellRecords} from './tank-shell-records.js';
export {SHELL_RECORD_FIELDS,SHELL_RECORD_DEFAULT,normalizeShellRecords} from './tank-shell-records.js';
const fixed=(v,n=2)=>Number(v.toFixed(n)).toLocaleString('en-US',{maximumFractionDigits:n});
/** Construction coordinates are on the developed plate, independent of its rotation on a stock sheet. */
export function shellConstructionPlan(r,selected='S1'){
  if(!r?.valid)return null;
  const part=shellPiecePart(r,selected),piece=r.assembly.find(p=>p.id===selected)??r.assembly[0];
  if(!part||!piece)return null;
  const p=r.input,m=r.methods,parsed=normalizeShellRecords(p.shellConstruction),records=parsed.data,
    horizontal=r.orientation==='horizontal',datum=horizontal?'A 端筒身板邊':'筒身下緣',
    reserve={circumferential:p.trim+(part.flatEnd||0),axial:p.trim},
    finished={x:reserve.circumferential,y:reserve.axial,width:part.finishedWidth,height:part.finishedHeight},
    source=r.sheets.find(s=>s.id===piece.sheet),
    placement=source?.placements.find(x=>x.label===piece.id||x.part==='S'&&'S'+x.piece===piece.id),
    // Report bounding corners, not a guessed rotation direction of the cut part.
    stock=source&&placement?{id:source.id,material:source.material,width:source.width,length:source.length,x:placement.x,y:placement.y,w:placement.w,h:placement.h,rotated:!!placement.rotated}:null,
    chord=Math.min(500,r.di*.6),ri=r.di/2,
    template={radius:ri,chord,sagitta:ri-Math.sqrt(ri*ri-chord*chord/4)},
    groove=grooveFor(p.shellThickness,m.welding),warnings=[...parsed.issues.map(x=>x.message)];
  if(!stock)warnings.push(piece.id+' 尚未排入原板；先確認料源，勿依此頁直接下料。');
  if(!String(p.material).trim())warnings.push('筒身材質未填，需先核對材料證明與爐批號。');
  if(Math.abs(p.gap-m.welding.rootGap)>.001)warnings.push(`分片扣料間隙 ${fixed(p.gap)} mm，坡口估算根隙 ${fixed(m.welding.rootGap)} mm，兩者不同。請依 WPS 核對並統一；目前尺寸仍按分片間隙扣料。`);
  if(m.rolling.preBend==='no'&&!(part.flatEnd>0))warnings.push('選擇不預彎，但直邊留長為 0；先依機台確認端部切除餘量。');
  if(m.rolling.machineWidth>0&&part.height>m.rolling.machineWidth)warnings.push('毛坯軸向寬度超過捲板機有效寬度。');
  if(m.rolling.machineThickness>0&&p.shellThickness>m.rolling.machineThickness)warnings.push('板厚超過已填的機台板厚能力。');
  if(m.rolling.machineMinDiameter>0&&r.di<m.rolling.machineMinDiameter)warnings.push('目標內徑小於已填的機台最小捲徑。');
  const pending=Object.entries(SHELL_RECORD_FIELDS).filter(([k])=>['wps','tack','sequence','acceptance'].includes(k)&&!records[k]).map(([,v])=>v);
  const welds=[];
  for(const b of r.assembly){
    const row=shellCourses(r)[b.course-1],previous=row.pieces[(b.panel+row.pieces.length-2)%row.pieces.length];
    welds.push({id:`L${b.course}-${b.panel}`,kind:'longitudinal',course:b.course,panel:b.panel,a:previous.id,b:b.id,
      self:previous.id===b.id,length:b.height,z:b.z,angle:((b.start-p.gap/2)/r.circumference*360+360)%360});
  }
  for(const {course:c,z} of shellRingStations(r))welds.push({id:'C'+c,kind:'circumferential',course:c,a:`第 ${c} 圈`,b:`第 ${c+1} 圈`,length:r.circumference,z});
  const localWelds=welds.filter(w=>w.kind==='longitudinal'?w.a===piece.id||w.b===piece.id:w.course===piece.course||w.course===piece.course-1);
  const n=fixed,batch=shellBatchLabel(r),where=`第 ${piece.course} 圈／第 ${piece.panel} 片`,
    axial=`${datum}起 ${n(piece.z)}～${n(piece.z+piece.height)} mm`,
    preBend=m.rolling.preBend==='yes',arcAngle=part.finishedWidth/r.circumference*360;
  const steps=[
    {id:'layout',title:'放樣：先認板，再畫兩種線',lead:`${piece.id} · ${where}，標出朝外面、基準角與捲製方向。`,
      actions:[`核對 ${p.material||'待填材質'}、t${n(p.shellThickness)}、材料證明與爐批號；將 ${piece.id} 標記保留在成品範圍。`,
        stock?`原板 #${stock.id}，左起 ${n(stock.x)}、上起 ${n(stock.y)} mm${stock.rotated?'；這片在原板上轉 90° 排料，取下後依本圖捲向擺正':''}。定位座標為毛坯包絡左上角。`:'尚無原板座標，先回板片排料補齊。',
        `毛坯畫 ${n(part.width)} × ${n(part.height)} mm；內框為成品 ${n(finished.width)} × ${n(finished.height)} mm。量兩條對角線，名目值各 ${n(Math.hypot(part.width,part.height))} mm。`],
      check:'確認板號、毛坯四邊、成品修邊線與捲向；對角線只供矩形放樣核對，允差依圖說。'},
    {id:'cut',title:'下料：沿毛坯線切，保留成形餘量',lead:`先切 ${n(part.width)} × ${n(part.height)} mm，不要先切掉預留的板端。`,
      actions:[`按毛坯外框切割，刀縫 ${n(p.kerf)} mm 已用於原板排料；不可再從成品尺寸扣一次。切割補償依機台設定。`,
        `捲向兩端各留 ${n(reserve.circumferential)} mm${part.flatEnd>0?`（修邊 ${n(p.trim)}＋直邊 ${n(part.flatEnd)}）`:'（修邊留料）'}；軸向兩側各留 ${n(reserve.axial)} mm。`,
        '清除切口毛刺、熔渣與影響成形的缺陷。坡口在成形前或後加工，由核定工序決定，保留成品基準線。'],
      check:'下料後複核毛坯尺寸、板號與邊緣品質；成品內框不是第一刀的切割線。'},
    {id:'roll',title:preBend?'預彎與捲板：兩端曲率也要做到':'捲板與切端：直邊必須留到成形後處理',
      lead:`目標內徑 Ø${n(r.di)} mm；捲向沿 ${n(part.width)} mm，輥軸平行 ${n(part.height)} mm 板邊。本片成形圓心角 ${n(arcAngle)}°。`,
      actions:[preBend?'依機台操作程序處理兩端預彎，檢查板端曲率；此圖不代表特定三輥／四輥機台的進料順序。':`不預彎：兩端各保留 ${n(part.flatEnd)} mm 直邊，確認支承後捲製，再依成品線修除直邊與留料。`,
        '依機台、材質及板厚分道次成形，卸載後檢查回彈與曲率；程式不推算輥壓量、道次或機台安全能力。',
        `內弧樣板參考：R${n(template.radius)}，弦長 ${n(chord)}、弦高 ${n(template.sagitta)} mm。這是成品名目幾何，不是過捲設定或允收公差。`],
      check:`修邊後保留圓周弧長 ${n(finished.width)} × 軸向 ${n(finished.height)} mm；未另計焊接收縮補償。`},
    {id:'fit',title:'組立點焊：先找對圈位與接縫',lead:`${piece.id} 放在${axial}；起點方位 ${n(piece.start/r.circumference*360)}°。`,
      actions:[`依展開圖編號試組各圈；${horizontal?'圈號由 A 端筒身板邊往 B 端增加':'圈號由筒身下緣向上增加'}。左右邊界接起為一圈；${r.courses>1?'相鄰圈'+(r.shellLayoutState?.custom?'依逐圈起點角與各片弧長定位':p.seamLayout==='stagger'?'錯開半片節距':'縱縫對齊'):'本案僅一圈，沒有筒身圈間環縫'}。接管避讓與縫距仍須圖說確認。`,
        `找出本片接縫 ${localWelds.map(w=>w.id).join('、')}。依核定點焊／夾治具計畫維持圓度、錯邊及間隙，不以拉扯硬組取代尺寸修正。`,
        records.tack?'點焊／治具計畫：'+records.tack:'點焊長度、間距、位置及臨時支承尚未填；先在「施工依據」記錄核定做法。'],
      check:`各接縫扣料間隙 ${n(p.gap)} mm；點焊後再量直徑、圈位、錯邊與縫隙。橙線是接縫中心，不代表點焊點數或施焊順序。`},
    {id:'weld',title:'正式焊接：按焊道編號執行與記錄',lead:`筒身 ${welds.filter(w=>w.kind==='longitudinal').length} 道縱縫＋${r.courses-1} 道環縫，合計 ${n(r.weldLength/1000)} m。`,
      actions:[`適用 WPS：${records.wps||'待填'}。目前焊材估算選擇 ${PROCESS_LABELS[m.welding.buttProcess]}、${groove.type} 形坡口；這些估算設定不能代替核定 WPS。`,
        records.sequence?'焊接順序／內外側計畫：'+records.sequence:'正式焊接順序、內外側可達性、翻身／轉胎與清根作法尚待確認；程式不自動指定「先縱後環」。',
        '依核定程序處理點焊、根道、填充、蓋面與道間清理；每道完成後記錄焊工、外觀及尺寸，檢驗範圍與接受準則按 ITP／圖說。'],
      check:records.acceptance?'驗收依據：'+records.acceptance:'圓度、錯邊、縱縫尖角／環縫凹凸及 NDE 接受準則待填；此流程不自動判定合格。'}
  ];
  return {result:r,part,piece,stock,reserve,finished,template,groove,records,issues:parsed.issues,warnings,pending,steps,welds,localWelds,datum,horizontal,batch,axial,preBend,arcAngle};
}
