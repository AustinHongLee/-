import {elbowAlignmentReference} from './elbow-axis.js';
import {retreatAction} from './end-alignment-ui.js';

const names={mainOD:'主管外徑',branchOD:'支管外徑',mainWall:'主管壁厚',branchWall:'支管壁厚',branchLength:'支管長度',bendRadius:'彎曲半徑',bendPosition:'接點位置',angle:'支管角度',elbowOffset:'外背偏移',elbowSideOffset:'側向偏移',padMargin:'補強板留邊',projection:'內插凸入量',holeGap:'孔口每側間隙',rootGap:'貼合間隙',tolerance:'數值輪廓誤差上限','fab.wpsId':'WPS／工法編號與版次','fab.gapBasis':'根隙量測方向／位置','fab.gapMin':'工法根隙下限','fab.gapMax':'工法根隙上限','fab.stock':'粗切留料'};
Object.assign(names,{mainEndOD:'B 端外徑',mainLength:'主管長度',offset:'偏心量',surfaceClock:'截面方位',branchSwivel:'側向角度',padThickness:'補強板厚度',padClearance:'補強板孔口間隙'});
Object.assign(names,{branchSection:'支材截形',sectionWidth:'截面寬 b',sectionHeight:'截面高 h',sectionWall:'實際壁／腿厚 t',sectionWeb:'腹板厚 tw',sectionFlange:'翼緣厚 tf',sectionRadius:'實測圓角半徑 r',sectionRotation:'截面轉角',sectionSlope:'翼緣斜度'});
Object.assign(names,{samples:'取樣段數',autoPrecision:'自動精度'});
const fmt=n=>Number.isFinite(n)?`${Number(n.toFixed(3))}`:'未填完整';
const locked=p=>p.hostType==='elbow'&&/^[ab]-(axis|offset|edge)$/.test(p.elbowAlignment);
const end=p=>p.elbowAlignment?.startsWith('a-')?'A':'B';
const steel=p=>p.branchSection&&p.branchSection!=='pipe';
export const isFitupField=field=>/^fab\.(pre\.|post\.|tack\.|count$|edgeCondition$|disposition$)/.test(field);

function steelGuidance(error,p){
 const field=error.field??'',label=names[field]??'鋼構接合條件',kind=p.branchSection,
   W=p.sectionWidth,H=kind==='shs'?W:p.sectionHeight,t=p.sectionWall,tw=p.sectionWeb,tf=p.sectionFlange,
   dimensions=kind==='chs'?`圓管 Ø${fmt(p.branchOD)} × 壁厚 ${fmt(p.branchWall)} mm`:`截面 ${fmt(W)} × ${fmt(H)} mm；轉角 ${fmt(p.sectionRotation)}°`;
 let title=`調整${label}`,detail=error.message,actionLabel=`前往${label}`,routeField=field,port=null,actions=[];
 if(field==='sectionSlope'){
  title='這份供料是斜翼緣，目前不能用平翼緣代算';detail=`目前翼緣斜度 ${fmt(p.sectionSlope)}°。本版只支援平翼緣 0°；保留供料輸入，停止出圖。請核對實物型式，不把實際斜度改成 0 來通過計算。`;
 }else if(field.startsWith('section')){
  let condition='須輸入有效的供料／實測數值。';
  if(field==='sectionWidth'||field==='sectionHeight')condition='尺寸須大於 0。';
  else if(field==='sectionWall')condition=`厚度須大於 0 且小於 ${fmt(Math.min(W,H)/(kind==='l'?1:2))} mm。`;
  else if(field==='sectionWeb')condition=`腹板厚須大於 0 且小於寬度 ${fmt(W)} mm。`;
  else if(field==='sectionFlange')condition=`翼緣厚須大於 0 且小於高度的一半 ${fmt(H/2)} mm。`;
  else if(field==='sectionRadius'){
   const limit=['shs','rhs'].includes(kind)?Math.min(W,H)/2:kind==='l'?Math.min(W-t,H-t):kind==='c'?Math.min(W-tw,(H-2*tf)/2):Math.min((W-tw)/2,(H-2*tf)/2);
   condition=Number.isFinite(limit)&&limit>0?`半徑須為 0 或正數，且小於 ${fmt(limit)} mm，讓相鄰圓角保有材料直邊。`:'請先填有效寬、高與厚度，再核對相鄰圓角是否重疊。';
  }else if(field==='sectionRotation')condition='截面轉角須為有限角度；由自由端朝接頭看，u 轉向 v 為順時針正向。';
  detail=`${dimensions}；目前${label} ${fmt(p[field])}${field==='sectionRotation'?'°':' mm'}。${condition} ${error.message} 請依實際供料修改，不自動縮薄、抹除圓角或改截形。`;
  if(kind==='shs'&&field==='sectionHeight')routeField='sectionWidth';
 }else if(error.code==='steel-contact'){
  title='這一段材料面還不能完整貼合母材';
  detail=`${dimensions}。${error.message} 請調整支材位置、方向、截面轉角或核對實際寬高；缺少交點的位置不會補成直線。H／槽鋼／角鐵的空區不是材料，支材中心線不必穿過實材。`;
  if(locked(p)){port=end(p);actionLabel=`回到 ${port} 端調整支材定位`;}
  else{routeField=p.hostType==='elbow'?'bendPosition':'jointPosition';actionLabel='回到模型調整接合位置';}
 }else if(error.code==='finite-end'){
  title='鋼構材料切口超過母材管口';detail=`${dimensions}。${error.message} 整個材料切口都要留在有限母材內；先調整接合位置，再核對轉角與截面尺寸。`;
  if(locked(p)){port=end(p);actionLabel=`回到 ${port} 端截面調整`;}
  else{routeField=p.hostType==='elbow'?'bendPosition':'jointPosition';actionLabel='移動接合位置';}
 }else if(error.code==='body-interference'){
  title='保留的鋼構支材與母管另一段碰撞';detail=`${dimensions}；目前最短成品長 ${fmt(p.branchLength)} mm。${error.message} 請核對保留長度與支材方向；不能只把魚口尖端算對就出圖。`;
  if(locked(p)){port=end(p);actionLabel=`回到 ${port} 端核對方向與定位`;}
  else{routeField='angle';actionLabel='核對支材方向';}
 }else if(error.code==='closed-intent'||['motherOpening','jointType','projection'].includes(field)){
  title='鋼構支材須使用母管封閉外焊';detail=`${dimensions}。此模式只裁切支材端部，母管不開孔、支材不內插。${error.message}`;routeField='branchSection';actionLabel='核對支材與接法';
  actions=[{id:'steel-closed',label:'檢查改為母管封閉外焊',note:'保留實際截面尺寸與定位；取消開孔、內插及未支援的圓管補強板，完整計算通過才套用。'}];
 }else if(error.code==='unsupported-pad'||field==='padEnabled'){
  title='鋼構的鞍座／墊板尚未加入此模型';detail='鋼構支材不能套用圓支管的補強板孔徑與留邊。先完成端部貼合；鞍座、肋板或套箍需要另建明確尺寸。';
  actions=[{id:'steel-without-pad',label:'檢查只計算鋼構端部貼合',note:'關閉目前補強板，保留截面與接法；完整計算通過才套用。'}];
 }else if(field==='branchOD'||field==='branchWall'){
  detail=kind==='chs'?`目前${label} ${fmt(p[field])} mm。${field==='branchWall'?`壁厚須大於 0 且小於外半徑 ${fmt(p.branchOD/2)} mm。`:'實際外徑須大於 0。'} ${error.message} 請依圓管供料填寫。`:`此支材採用實際截面寬、高與板厚，不能用圓管外徑當成支材尺寸。${error.message}`;
  if(kind!=='chs'){routeField='sectionWidth';actionLabel='核對實際截面尺寸';}
 }else if(field==='mainOD'||field==='mainEndOD'||field==='mainWall'){
  const k=p.hostType==='cone'?(p.mainEndOD-p.mainOD)/(2*p.mainLength):0,
    maxWall=p.hostType==='cone'?Math.min(p.mainOD,p.mainEndOD)/(2*Math.hypot(1,k)):p.mainOD/2;
  detail=`目前${label} ${fmt(p[field])} mm。${field==='mainWall'?`母材壁厚須大於 0 且小於 ${fmt(maxWall)} mm。`:'母材實際外徑須大於 0。'} ${error.message} 請依母材供料核對。`;
 }else if(field==='tolerance'){
  title='裁線輪廓精度尚未達標';detail=`目前數值輪廓誤差上限 ${fmt(p.tolerance)} mm。${error.message} 截面尺寸與實際圓角保持原值；調整取樣設定後重新核對裁線。`;
  if(!p.autoPrecision)actions=[{id:'steel-auto-precision',label:'檢查使用自動加密裁線',note:'保留目前誤差上限與實際截面，完整計算通過才套用。'}];
 }else if(field==='branchLength')detail=`目前最短成品長 ${fmt(p.branchLength)} mm。${error.message} 由共同自由直端量到材料裁線；需要整個保留支材都通過檢查。`;
 else if(locked(p)&&['elbowAlignment','elbowOffset','elbowSideOffset','elbowGeometry','bendPosition','angle','surfaceClock','branchSwivel'].includes(field)){
  title='這個鋼構管口定位條件尚未成立';detail=`${dimensions}。${error.message} 同側齊線依已旋轉真實截面外輪廓計算，不能沿用圓支管外徑差。`;port=end(p);actionLabel=`回到 ${port} 端調整真實截面定位`;
 }
 return {field,title,detail,reason:error.message,actionLabel,end:port,routeField,actions};
}
function openingRetreat(p,reference){
 if(!reference||!Number.isFinite(reference.offsetDistance)||reference.offsetDistance<=0)return null;
 const tool=(p.jointType==='in'?p.branchOD/2:p.branchOD/2-p.branchWall)+p.holeGap,
   available=p.mainOD/2-p.mainWall-tool,
   // A visible positioning allowance, not a solver epsilon or weld allowance.
   target=Math.max(0,available-1);
 if(!Number.isFinite(available)||available<1||target>=reference.offsetDistance)return null;
 const scale=target/reference.offsetDistance;
 return {params:{...p,elbowAlignment:`${end(p).toLowerCase()}-offset`,elbowOffset:reference.offset*scale,elbowSideOffset:reference.sideOffset*scale},distance:reference.offsetDistance-target};
}

export function issueGuidance(error,p){
 if(steel(p)&&!error.field?.startsWith('fab.'))return steelGuidance(error,p);
 const field=error.code==='branch-cut'&&p.branchOD>p.mainOD?'branchOD':error.field??'',label=names[field]??(field.startsWith('fab.')?'加工紀錄':'接合位置'),alignment=locked(p),reference=alignment?elbowAlignmentReference(p):null;
 let title=`調整${label}`,detail=error.message,actionLabel=`前往${label}`,actions=[];
 const endIssue=alignment&&!['projection','branchOD'].includes(field)&&(['elbowAlignment','elbowOffset','elbowSideOffset','elbowGeometry','angle','bendPosition','surfaceClock','branchSwivel'].includes(field)||['mother-opening','branch-cut','body-interference','finite-end','tangent-open'].includes(error.code));
 if(endIssue){
  const edge=p.elbowAlignment.endsWith('-edge');
  title=error.code==='mother-opening'?(edge?'這個齊線位置無法形成完整開孔':'母孔內壁未形成封閉輪廓'):error.code==='branch-cut'?(p.jointType==='in'?(edge?'這個齊線位置無法完整內插':'支管內插交線不完整'):'支管魚口交線不完整'):error.code==='body-interference'?'支管保留段碰到母材':error.code==='finite-end'?'接合輪廓超過彎頭管口':'這個管口定位尚未形成可製作輪廓';
  detail=`${end(p)} 端：外背 ${fmt(reference?.offset)}／側向 ${fmt(reference?.sideOffset)} mm；主管 Ø${fmt(p.mainOD)}、支管 Ø${fmt(p.branchOD)}。${error.code?error.message:p.motherOpening!==false?'目前保留開孔接法，還要讓內壁交線完整。':'目前母管封閉；仍須檢查整條魚口、管口邊界及保留管身。'}`;
  actionLabel=`回到 ${end(p)} 端截面調整`;
  if(/有限數值/.test(error.message)){title=`${label}還沒有填完整`;detail='偏移可填負數、0 或正數；請填完尺寸，或明確選擇同軸將兩個偏移量歸零。';}
  const suggested=['mother-opening','branch-cut'].includes(error.code)?openingRetreat(p,reference):null;
  if(suggested)actions.push({id:'opening-retreat',label:`檢查往中心退讓 ${fmt(suggested.distance)} mm`,note:'保留目前接法；內壁範圍另留 1 mm 定位餘量，完整計算通過才套用。'});
  else if(Number.isFinite(reference?.offsetDistance)&&reference.offsetDistance>0)actions.push({id:'retreat5',label:`檢查往中心退讓 ${Math.min(5,reference.offsetDistance).toFixed(1)} mm`,note:'保留目前接法；通過完整計算才套用。'});
  actions.push({id:'coaxial',label:`檢查改為 ${end(p)} 端同軸`,note:'改變定位條件，保留目前接法。'});
  if((error.code==='mother-opening'||error.code==='branch-cut'&&p.jointType==='in')&&p.motherOpening!==false)actions.push({id:'closed-support',label:'檢查改為外焊支撐・母管不開孔',note:'會改成封閉外焊，取消內插凸入。'});
 }else if(field==='branchOD'&&alignment&&p.branchOD>p.mainOD){
  const edge=p.elbowAlignment.endsWith('-edge');title=edge?'支管比主管大，不能採用這個齊線條件':'支管尺寸尚未形成封閉魚口';detail=`目前支管 Ø${fmt(p.branchOD)} > 主管 Ø${fmt(p.mainOD)} mm。${edge?'選較小支管，或回到管口改定位方式；尺寸符合後仍要完整驗證。':'先核對支管尺寸，或回到管口調整定位；重新計算後確認完整魚口。'}`;actionLabel='選擇支管尺寸';
 }else if(/有限數值/.test(error.message)){
  title=`${label}還沒有填完整`;detail=['mainOD','branchOD','branchLength','bendRadius','tolerance'].includes(field)?'請輸入大於 0 的實際尺寸。':field==='mainWall'||field==='branchWall'?`請填實際壁厚，大於 0 且小於 ${fmt((field==='mainWall'?p.mainOD:p.branchOD)/2)} mm。`:['elbowOffset','elbowSideOffset','offset'].includes(field)?'偏移可填負數、0 或正數；空白不能當成 0。':'請填寫這個欄位的有效數字。';
 }else if(field==='padMargin'){
  title=/端部|管口|兩端/.test(error.message)?'補強板外緣超過母材管口':/半|整周|重疊/.test(error.message)?'補強板包得太寬':'補強板留邊尚未滿足完整貼合';detail=`目前留邊 ${fmt(p.padMargin)} mm。${error.message} 調整的是補強板，支管定位不會自動改變。`;actionLabel='調整補強板留邊';
  if(Number.isFinite(p.padMargin)&&p.padMargin>0)actions.push({id:'half-pad-margin',label:`檢查留邊改為 ${fmt(p.padMargin/2)} mm`,note:'只改板的留邊；通過完整計算才套用。'});
 }else if(field==='mainWall'||field==='branchWall')detail=`目前 ${fmt(p[field])} mm；須大於 0 且小於外徑的一半 ${fmt((field==='mainWall'?p.mainOD:p.branchOD)/2)} mm。請依實際供料填寫。`;
 else if(field==='projection'){title='調整內插凸入量';detail=`目前凸入 ${fmt(p.projection)} mm。${error.message} 保留內插接法，減少凸入量後重新計算。`;}
 else if(field.startsWith('fab.')){title=`加工紀錄：${label}`;detail=error.message;actionLabel=isFitupField(field)?'前往對應試配紀錄':`填寫${label}`;}
 return {field,title,detail,reason:error.message,actionLabel,end:endIssue?end(p):null,actions};
}

/** Suggestions change explicit dimensions/intent only. Caller must validate the
 * complete candidate and ensure the source parameters have not changed. */
export function repairCandidate(p,id){
 if(steel(p)){
  if(id==='steel-closed')return {...p,jointType:'on',motherOpening:false,projection:0,padEnabled:false};
  if(id==='steel-without-pad')return {...p,padEnabled:false};
  if(id==='steel-auto-precision')return {...p,autoPrecision:true};
  return null;
 }
 if(id==='opening-retreat'&&locked(p))return openingRetreat(p,elbowAlignmentReference(p))?.params??null;
 if(id==='retreat5'&&locked(p)){const patch=retreatAction(p,end(p),5);return patch?{...p,...patch}:null;}
 if(id==='coaxial'&&locked(p))return {...p,elbowAlignment:`${end(p).toLowerCase()}-axis`,elbowOffset:0,elbowSideOffset:0};
 if(id==='closed-support'&&locked(p))return {...p,jointType:'on',motherOpening:false,projection:0};
 if(id==='half-pad-margin'&&Number.isFinite(p.padMargin)&&p.padMargin>0)return {...p,padMargin:p.padMargin/2};
 return null;
}
