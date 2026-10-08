/** Process planning and measured fit-up are separate from ideal joint geometry.
 * Null means unknown; no welding limits or tool precision are assumed.
 */
export const FIT_COUNTS = [4, 8, 12, 24];
const NUMBER_KEYS = ['stock','markError','cutError','kerf','gapMin','gapMax','bevelAngle','rootFace'];
const TEXT_LIMITS = {wpsId:100,gapBasis:180,weldNote:500,disposition:500,inspectionKey:10000};
const PARAM_KEYS = ['mainOD','mainWall','mainLength','jointPosition','branchOD','branchWall','branchLength','angle','azimuth','offset','jointType','projection','rootGap','holeGap','padEnabled','padShape','padSplit','padThickness','padMargin','padClearance','kFactor','padManufacturing'];
export function geometryRecordKey(params) { const keys=params.hostType==='cone'?[...PARAM_KEYS,'hostType','mainEndOD','surfaceClock','branchSwivel','motherOpening']:params.hostType==='elbow'?[...PARAM_KEYS,'hostType','bendRadius','bendAngle','bendPosition','surfaceClock','branchSwivel']:[...PARAM_KEYS];if(params.hostType==='elbow'){if(params.elbowAlignment&&params.elbowAlignment!=='free')keys.push('elbowAlignment');if(['a-offset','b-offset','a-edge','b-edge'].includes(params.elbowAlignment))keys.push('elbowOffset','elbowSideOffset');if(params.motherOpening===false)keys.push('motherOpening');}if(params.branchSection&&params.branchSection!=='pipe')keys.push('branchSection','sectionWidth','sectionHeight','sectionWall','sectionWeb','sectionFlange','sectionRadius','sectionRotation','sectionSlope');return JSON.stringify(keys.map(k => [k, params[k]])); }
export function emptyFabricationPlan() {
  return {version:1,tool:'grinder',stock:null,markError:null,cutError:null,kerf:null,wpsId:'',gapMin:null,gapMax:null,gapBasis:'',bevelAngle:null,rootFace:null,weldNote:'',count:4,tackAngles:[],preGaps:Array(4).fill(null),postGaps:Array(4).fill(null),edgeCondition:'unknown',disposition:'',inspectionKey:''};
}
export function validateFabricationPlan(raw = emptyFabricationPlan()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('加工計畫格式不正確。');
  const defaults=emptyFabricationPlan(), p={...defaults,...raw};
  if (Object.keys(raw).some(k=>!Object.hasOwn(defaults,k))) throw new Error('加工計畫包含不支援的欄位。');
  if (p.version!==1 || !FIT_COUNTS.includes(p.count)) throw new Error('加工計畫版本或量測分點數不正確。');
  if (!['grinder','saw','plasma','other'].includes(p.tool) || !['unknown','checked','damaged'].includes(p.edgeCondition)) throw new Error('加工或切口檢查選項不正確。');
  for (const k of NUMBER_KEYS) if(p[k]!==null && (typeof p[k]!=='number'||!Number.isFinite(p[k])||p[k]<0||p[k]>10000)) throw new Error('加工尺寸須為非負有限數值；未知請留白。');
  if(p.bevelAngle!==null && p.bevelAngle>=90) throw new Error('坡口單邊角須小於 90°；此欄只記錄工藝要求。');
  if(p.gapMin!==null && p.gapMax!==null && p.gapMin>p.gapMax) throw new Error('根隙下限不得大於上限。');
  for(const [k,max] of Object.entries(TEXT_LIMITS)) if(typeof p[k]!=='string'||p[k].length>max) throw new Error('工藝文字格式或長度不正確。');
  for(const k of ['preGaps','postGaps']) {
    if(!Array.isArray(p[k])||p[k].length!==p.count||p[k].some(v=>v!==null&&(typeof v!=='number'||!Number.isFinite(v)||v<0||v>10000))) throw new Error('實測根隙須為非負數值，且與分點數一致。');
    p[k]=p[k].slice();
  }
  if(!Array.isArray(p.tackAngles)||new Set(p.tackAngles).size!==p.tackAngles.length||p.tackAngles.some(a=>typeof a!=='number'||!Number.isFinite(a)||a<0||a>=360||Math.abs(a/(360/p.count)-Math.round(a/(360/p.count)))>1e-8)) throw new Error('點固參考位置須使用目前量測分點。');
  p.tackAngles=p.tackAngles.slice().sort((a,b)=>a-b);
  return p;
}
export function clearFitRecords(plan, params) {
  const p=validateFabricationPlan(plan);
  return {...p,preGaps:Array(p.count).fill(null),postGaps:Array(p.count).fill(null),edgeCondition:'unknown',disposition:'',inspectionKey:geometryRecordKey(params)};
}
export function reconcileFitRecords(plan,params) {
  const p=validateFabricationPlan(plan),key=geometryRecordKey(params);
  const stale=p.inspectionKey!==key;
  const cleared=stale&&(p.preGaps.some(v=>v!==null)||p.postGaps.some(v=>v!==null)||p.edgeCondition!=='unknown'||!!p.disposition);
  return {plan:stale?clearFitRecords(p,params):p,cleared};
}
export function machiningBudget(plan) {
  const p=validateFabricationPlan(plan);
  if([p.stock,p.markError,p.cutError].some(v=>v===null)) return {known:false,remaining:null};
  return {known:true,remaining:p.stock-p.markError-p.cutError};
}
export function fitPointStatus(plan,index,phase='pre') {
  const p=plan,g=p[phase==='post'?'postGaps':'preGaps'][index];
  if(g===null) return {code:'missing',label:'未量測'};
  if(!Number.isFinite(g)||g<0) return {code:'invalid',label:'量測需修正'};
  if([p.gapMin,p.gapMax].some(v=>v!==null&&(!Number.isFinite(v)||v<0||v>10000))||(p.gapMin!==null&&p.gapMax!==null&&p.gapMin>p.gapMax)) return {code:'invalid',label:'工法範圍需修正'};
  if(!p.wpsId.trim()||!p.gapBasis.trim()||p.gapMin===null||p.gapMax===null) return {code:'unknown',label:'工法待設定'};
  if(g<p.gapMin) return {code:'low',label:'低於填入下限'};
  if(g>p.gapMax) return {code:'high',label:'超過填入上限'};
  return {code:'within',label:'在填入範圍內'};
}
export function fitPhaseStatus(plan,phase='pre') {
  const rows=Array.from({length:plan.count},(_,i)=>fitPointStatus(plan,i,phase));
  const measured=rows.filter(r=>r.code!=='missing').length;
  let label='已填分點在範圍內',code='within';
  if([plan.gapMin,plan.gapMax].some(v=>v!==null&&(!Number.isFinite(v)||v<0||v>10000))||(plan.gapMin!==null&&plan.gapMax!==null&&plan.gapMin>plan.gapMax)){label='工法範圍需修正';code='action';}
  else if(rows.some(r=>['high','low','invalid'].includes(r.code))||plan.edgeCondition==='damaged'){label='需處置並重新試配';code='action';}
  else if(!plan.wpsId.trim()||!plan.gapBasis.trim()||plan.gapMin===null||plan.gapMax===null){label='待輸入工法與量測基準';code='unknown';}
  else if(measured<plan.count){label='待補分點量測';code='missing';}
  else if(plan.edgeCondition==='unknown'){label='待核對切口狀況';code='unknown';}
  return {code,label,measured,total:plan.count};
}
/** The current straight-host wall depth is convex in branch-wall radius.
 * Thus the two edge depths bound the entire wall for a radial rough cut.
 * This is axial stock, not a weld gap or a tool-centre offset.
 */
export function roughDepth(outerDepth,innerDepth,stock) {
  if([outerDepth,innerDepth,stock].some(v=>!Number.isFinite(v))||stock<0) throw new Error('粗切深度或留料不正確。');
  return Math.max(outerDepth,innerDepth)+stock;
}
export function createRoughCutTemplate(base,plan) {
  if(['elbow','cone'].includes(base?.mapping?.hostType))throw new Error('此母材尚未提供連續全壁厚粗切留料包絡；請使用成品魚口紙樣。');
  const p=validateFabricationPlan(plan); if(p.stock===null) return null;
  const m=base.mapping,outer=m?.originalOuterCut,inner=m?.originalInnerEdge;
  if(!outer?.length||inner?.length!==outer.length||m.paperTransform!=='branch-mirror-x') throw new Error('加工樣帶缺少同角度內外緣資料。');
  const c=m.circumference,top=m.paperTopDepth;
  const rough=outer.map((pt,i)=>{if(Math.abs(pt[0]-inner[i][0])>1e-6)throw new Error('內外緣角度不一致。');return [c-pt[0],roughDepth(pt[1],inner[i][1],p.stock)-top];});
  const height=Math.max(base.height,...rough.map(pt=>pt[1]+10));
  const references=base.references.map(ref=>({...ref,points:ref.type==='seam'?ref.points.map(([x,y])=>[x,y===base.height?height:y]):ref.points.map(pt=>pt.slice())}));
  references.push({type:'rough-cut',points:rough,label:'',closed:false});
  for(const angle of p.tackAngles){const x=c*(1-angle/360);references.push({type:'tack-reference',points:[[x-1.5,m.localDatumY-1.5],[x+1.5,m.localDatumY+1.5]],label:`T ${angle}°`,labelPosition:[Math.min(c-2,Math.max(2,x)),m.localDatumY+6],textAnchor:x>c/2?'end':'start',closed:false});}
  return {...base,id:'branch-rough',title:'支管粗切與成品修磨樣帶',height,
    outer:[[0,0],[base.width,0],[base.width,height],[0,height],[0,0]],references,
    materialOutline:[[0,Math.max(0,-top)],[c,Math.max(0,-top)],...rough,[0,Math.max(0,-top)]],
    notes:[...base.notes.map(note=>note.includes('CUT_FISHMOUTH')?'成品修磨線 CUT_FISHMOUTH 為粗實線；先沿 ROUGH_CUT 長虛線粗切留料，再逐步修磨成品外緣與內緣；裁紙邊與貼合舌只用於紙樣。':note),`粗切線 ROUGH_CUT：同角度內外成品緣取較深者，再沿支管軸留 ${p.stock} mm；由同一自由直端量深度。粗切後分別修磨內、外成品緣。`,
      '粗切線為直圓母管、支管壁沿徑向切穿的全壁厚留料基準；砂輪方向及偏擺需另控制。切縫放在粗切線的廢料側，保留標線；實測刀縫沒有自動轉成刀具中心線或焊接根隙。',
      'T 記號只指定點固參考母線；實際焊點在接頭焊縫，記號所在定位環不是焊點。點固尺寸與順序依工藝單，完成後重新量根隙。'],
    mapping:{...m,roughStock:p.stock,roughDepths:rough.map(([x,y])=>[c-x,y+top]),roughEnvelopeBasis:'straight-host-radial-through-branch-wall'}};
}
export function fabricationCSV(plan,stations,options={}) {
  const p=validateFabricationPlan(plan),safe=s=>{const text=String(s??'');return '"'+(/^\s*[=+@\-]/.test(text)&&!/^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/.test(text)?"'"+text:text).replaceAll('"','""')+'"';};
  if(!Array.isArray(stations)||stations.length<p.count||stations.slice(0,p.count).some((s,i)=>!s||!Number.isFinite(s.angle)||Math.abs(s.angle-i*360/p.count)>1e-7||!Number.isFinite(s.outerDepth)||!Number.isFinite(s.innerDepth))) throw new Error('尺寸分點須與實測分點角度一致。');
  const rows=[['加工與試配紀錄（未填值為未知；範圍核對不代表焊接核准）'],['加工工具',p.tool],['沿軸粗切留料 mm',p.stock??''],['預估標線最大沿軸偏差 ±mm',p.markError??''],['預估切磨最大沿軸偏差 ±mm',p.cutError??''],['實測切縫寬度 mm',p.kerf??''],['坡口單邊角 °（工藝記錄）',p.bevelAngle??''],['鈍邊 mm（工藝記錄）',p.rootFace??''],['切口狀況',p.edgeCondition],['焊道／點固／順序記錄',p.weldNote],['修整／修復處置紀錄',p.disposition],[],['分點角度 °','成品外緣深度 mm','成品內緣深度 mm','粗切深度 mm（沿支管軸）','試配根隙 mm','點固後根隙 mm','點固參考','工法編號/版次','根隙量測方向/位置','根隙下限 mm','根隙上限 mm','試配記錄狀態','點固後記錄狀態']];
  const roughSupported=options.roughCutSupported!==false&&!stations.some(s=>['elbow','cone'].includes(s?.hostType));
  if(!roughSupported)rows.splice(1,0,['彎頭未提供全壁厚粗切包絡；留料是使用者工藝記錄，粗切深度留白']);
  stations.slice(0,p.count).forEach((s,i)=>rows.push([s.angle,s.outerDepth,s.innerDepth,p.stock===null||!roughSupported?'':roughDepth(s.outerDepth,s.innerDepth,p.stock),p.preGaps[i]??'',p.postGaps[i]??'',p.tackAngles.includes(s.angle)?'是':'',p.wpsId,p.gapBasis,p.gapMin??'',p.gapMax??'',fitPointStatus(p,i).label,fitPointStatus(p,i,'post').label]));
  return '\uFEFF'+rows.map(r=>r.map(safe).join(',')).join('\r\n')+'\r\n';
}
