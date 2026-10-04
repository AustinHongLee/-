import {elbowAlignmentReference} from './elbow-axis.js';
import {retreatAction} from './end-alignment-ui.js';

const names={mainOD:'主管外徑',branchOD:'支管外徑',mainWall:'主管壁厚',branchWall:'支管壁厚',branchLength:'支管長度',bendRadius:'彎曲半徑',bendPosition:'接點位置',angle:'支管角度',elbowOffset:'外背偏移',elbowSideOffset:'側向偏移',padMargin:'補強板留邊',projection:'內插凸入量',holeGap:'孔口每側間隙',rootGap:'貼合間隙',tolerance:'數值輪廓誤差上限','fab.wpsId':'WPS／工法編號與版次','fab.gapBasis':'根隙量測方向／位置','fab.gapMin':'工法根隙下限','fab.gapMax':'工法根隙上限','fab.stock':'粗切留料'};
Object.assign(names,{mainEndOD:'B 端外徑',mainLength:'主管長度',offset:'偏心量',surfaceClock:'截面方位',branchSwivel:'側向角度',padThickness:'補強板厚度',padClearance:'補強板孔口間隙'});
const fmt=n=>Number.isFinite(n)?`${Number(n.toFixed(3))}`:'未填完整';
const locked=p=>p.hostType==='elbow'&&/^[ab]-(axis|offset|edge)$/.test(p.elbowAlignment);
const end=p=>p.elbowAlignment?.startsWith('a-')?'A':'B';
export const isFitupField=field=>/^fab\.(pre\.|post\.|tack\.|count$|edgeCondition$|disposition$)/.test(field);
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
 if(id==='opening-retreat'&&locked(p))return openingRetreat(p,elbowAlignmentReference(p))?.params??null;
 if(id==='retreat5'&&locked(p)){const patch=retreatAction(p,end(p),5);return patch?{...p,...patch}:null;}
 if(id==='coaxial'&&locked(p))return {...p,elbowAlignment:`${end(p).toLowerCase()}-axis`,elbowOffset:0,elbowSideOffset:0};
 if(id==='closed-support'&&locked(p))return {...p,jointType:'on',motherOpening:false,projection:0};
 if(id==='half-pad-margin'&&Number.isFinite(p.padMargin)&&p.padMargin>0)return {...p,padMargin:p.padMargin/2};
 return null;
}
