// Layout and material estimates for normal, set-in nozzles. No pressure design.
import {FLANGE_DEFAULTS,FLANGE_SIZES,FLANGE_CLASSES,FLANGE_FACES,flangeReferenceMatches} from './tank-flanges.js';
export const NOZZLE_HOSTS={shell:'筒壁徑向',top:'平蓋向上',bottom:'平底向下'};
export const NOZZLE_ENDS={wn:'帶頸對焊法蘭',so:'平焊套入法蘭',bare:'裸管端'};
export const NOZZLE_DEFAULTS=Object.freeze({...FLANGE_DEFAULTS,host:'shell',height:300,angle:45,radius:0,od:60,thickness:3,projection:200,inside:0,holeGap:1,allowance:10,end:'wn',flangeOD:150,flangeLength:50,flangeThickness:18,flangeWeight:0,flangeSpec:'',weldGap:2,reinforcement:''});
const numericLimits={height:[0,100000],angle:[0,360],radius:[0,50000],od:[1,20000],thickness:[.1,1000],projection:[1,20000],inside:[0,10000],holeGap:[0,30],allowance:[0,1000],flangeOD:[1,30000],flangeLength:[.1,10000],flangeThickness:[.1,1000],flangeWeight:[0,100000],weldGap:[0,30],soSetback:[0,1000]};
const textKeys=['name','flangeSpec','reinforcement','flangeSize','flangeClass','flangeFacing','flangeMaterial','flangeSource'];
export const nozzleFieldLabel=key=>({height:'距筒身下緣高度',angle:'方位角',radius:'距槽軸偏心',od:'管嘴外徑',thickness:'管嘴管厚',projection:'外壁到端面／密封面',inside:'內壁起凸入',holeGap:'孔口每側間隙',allowance:'管料總修整留料',flangeOD:'法蘭外徑',flangeLength:'法蘭軸向占長',flangeThickness:'法蘭盤厚',flangeWeight:'法蘭單重',weldGap:'對焊端間隙',soSetback:'管端由密封面退縮'})[key]||key;
export function normalizeNozzles(values){
  const issues=[],items=[],ids=new Set(),keys=['id','host','end',...textKeys,...Object.keys(numericLimits)];
  if(!Array.isArray(values)||values.length>30)return {items,issues:[{message:'管嘴須為清單，最多 30 個。'}]};
  for(const raw of values){
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(key=>!keys.includes(key))){issues.push({message:'管嘴資料含未知欄位或格式錯誤。'});continue;}
    const n={...NOZZLE_DEFAULTS,name:'',...raw},issue=(field,message)=>issues.push({id:n.id,field,message});
    if(typeof n.id!=='string'||!/^N[1-9][0-9]{0,3}$/.test(n.id)||ids.has(n.id))issue('id','管嘴編號無效或重複。');ids.add(n.id);
    if(!Object.hasOwn(NOZZLE_HOSTS,n.host))issue('host','選擇筒壁、平蓋或平底位置。');
    if(!Object.hasOwn(NOZZLE_ENDS,n.end))issue('end','選擇管嘴端部接法。');
    for(const [key,values] of [['flangeSize',FLANGE_SIZES],['flangeClass',FLANGE_CLASSES],['flangeFacing',Object.keys(FLANGE_FACES)]])if(n[key]!==''&&!values.includes(n[key]))issue(key,'法蘭規格選項無效。');
    if(!['manual','texas-v1'].includes(n.flangeSource))issue('flangeSource','法蘭尺寸來源無效。');
    for(const key of textKeys)if(typeof n[key]!=='string'||n[key].length>120)issue(key,'管嘴文字需為 120 字以內。');
    for(const [key,[min,max]] of Object.entries(numericLimits)){
      if(!['string','number'].includes(typeof n[key])){issue(key,`${nozzleFieldLabel(key)}需為數值。`);continue;}
      if(n.end==='bare'&&(key.startsWith('flange')||key==='weldGap'))continue;
      if(n.host!=='shell'&&key==='height'||n.host==='shell'&&key==='radius')continue;
      if(n.end!=='wn'&&key==='weldGap')continue;
      if(n.end!=='so'&&key==='soSetback')continue;
      n[key]=typeof n[key]==='string'&&n[key].trim()===''?NaN:Number(n[key]);
      if(!Number.isFinite(n[key])||n[key]<min||n[key]>max)issue(key,`${nozzleFieldLabel(key)}需在 ${min}～${max} 之間。`);
    }
    if(n.thickness*2>=n.od)issue('thickness','管嘴外徑必須大於兩倍管厚。');
    if(n.end!=='bare'&&n.flangeOD<=n.od)issue('flangeOD','法蘭外徑需大於管嘴外徑。');
    if(n.end!=='bare'&&n.flangeThickness>n.flangeLength)issue('flangeThickness','法蘭盤厚不可大於其總軸向占長。');
    if(n.end==='so'&&n.soSetback>=n.flangeLength)issue('soSetback','管端退縮需小於法蘭總長，才有套入長度。');
    n.soSetback=Number(n.soSetback);
    n.angle=n.angle===360?0:n.angle;items.push(n);
  }
  return {items,issues};
}
const shortArc=(a,b,c)=>Math.min(Math.abs(a-b),c-Math.abs(a-b));
export function planTankNozzles(r,values=r.input.nozzles??[]){
  const normalized=normalizeNozzles(values),issues=[...normalized.issues],items=[],p=r.input,ri=r.di/2,ro=r.od/2,rm=r.meanDiameter/2;
  for(const n of normalized.items){
    if(issues.some(issue=>issue.id===n.id))continue;
    const issue=(field,message)=>issues.push({id:n.id,field,message}),hole=n.od+2*n.holeGap,holeRadius=hole/2,theta=n.angle/180*Math.PI;
    if(n.host!=='shell'&&p.shape==='elliptical')issue('host','曲面封頭管嘴尚未納入；請另確認位置、法向與開孔補強。');
    if(n.host==='top'&&p.shape==='open')issue('host','開口槽沒有平蓋；請改為平蓋槽，或將管嘴放在筒壁／平底。');
    if(n.host==='shell'){
      if(hole>=r.di)issue('od','管嘴孔徑需小於槽內徑，才能使用本工具的徑向穿入幾何。');
      if(n.height<holeRadius||n.height+holeRadius>r.bodyHeight)issue('height','開孔超出筒身板邊；請調整高度或管嘴尺寸。');
      if(n.inside>=2*Math.sqrt(Math.max(0,ri*ri-(n.od/2)**2)))issue('inside','內凸管嘴已到達對側內壁，請縮短內凸量。');
    }else {if(n.radius+holeRadius>ri)issue('radius','開孔包絡超出槽內徑範圍；請減少偏心或孔徑。');if(n.inside>=r.height)issue('inside','內凸管嘴已到達對側底／蓋，請縮短內凸量。');}
    if(issues.some(issue=>issue.id===n.id))continue;
    const hostThickness=n.host==='shell'?p.shellThickness:p.endThickness,occupied=n.end==='wn'?n.flangeLength+n.weldGap:n.end==='so'?n.soSetback:0;
    const minCutLength=n.projection+n.inside+hostThickness-occupied,sag=n.host==='shell'?ri-Math.sqrt(ri*ri-(n.od/2)**2):0,maxCutLength=minCutLength+sag;
    if(minCutLength<=0){issue(n.end==='so'?'soSetback':'projection',n.end==='so'?'管端退縮後沒有可用管長；請減少退縮或增加外伸。':'伸出距離不足以容納法蘭占長及對焊間隙；請增加外伸或核對法蘭尺寸。');continue;}
    const bodyBottom=p.shape==='elliptical'?r.headDepth+p.endThickness+p.headStraight+p.headGap:p.endThickness;
    const direction=n.host==='shell'?[Math.sin(theta),0,Math.cos(theta)]:[0,n.host==='top'?1:-1,0];
    const surface=n.host==='shell'?[ro*direction[0],bodyBottom+n.height,ro*direction[2]]:[n.radius*Math.sin(theta),n.host==='top'?p.endThickness+r.height+p.endThickness:0,n.radius*Math.cos(theta)];
    const face=surface.map((v,i)=>v+direction[i]*n.projection),pipeEnd=surface.map((v,i)=>v+direction[i]*(n.projection-occupied)),pipeStart=surface.map((v,i)=>v-direction[i]*(hostThickness+n.inside));
    const blankLength=maxCutLength+n.allowance,pipeArea=Math.PI*(n.od**2-(n.od-2*n.thickness)**2)/4,pipeWeight=pipeArea*maxCutLength/1e9*p.density,blankWeight=pipeArea*blankLength/1e9*p.density;
    const warnings=[],unfoldX=n.angle/360*r.circumference,holeWidth=n.host==='shell'?2*rm*Math.asin(holeRadius/rm):hole;
    let shellPiece=null,verticalClearance=null,horizontalClearance=null;
    if(n.host==='shell'){
      const course=Math.min(r.courses,Math.floor(n.height/(r.courseHeight+p.gap))+1),pieces=r.assembly.filter(piece=>piece.course===course);
      shellPiece=pieces.find(piece=>(unfoldX-piece.start+r.circumference)%r.circumference<=piece.length)?.id??null;
      verticalClearance=Math.min(...pieces.map(piece=>shortArc(unfoldX,piece.start,r.circumference)))-holeWidth/2;
      horizontalClearance=r.courses>1?Math.min(...Array.from({length:r.courses-1},(_,i)=>Math.abs(n.height-((i+1)*(r.courseHeight+p.gap)-p.gap/2))))-holeRadius:null;
      if(verticalClearance<=p.gap/2)warnings.push('開孔包絡碰到筒身縱縫，需調位置或依正式圖說確認。');
      if(horizontalClearance!==null&&horizontalClearance<=p.gap/2)warnings.push('開孔包絡碰到筒身環縫，需調位置或依正式圖說確認。');
    }
    if(n.end!=='bare'&&(!n.flangeSize||!n.flangeClass||!n.flangeFacing||!n.flangeMaterial)&&!n.flangeSpec.trim())warnings.push('法蘭規範、尺寸系列、材質、等級及密封面尚待確認。');
    if(n.end!=='bare'&&[n.flangeSize,n.flangeClass,n.flangeFacing,n.flangeMaterial].some(Boolean)){const missing=[!n.flangeSize?'NPS 尺寸':'',!n.flangeClass?'Class 等級':'',!n.flangeFacing?'密封面':'',!n.flangeMaterial?'材質':''].filter(Boolean);if(missing.length)warnings.push('法蘭規格尚待填寫：'+missing.join('、')+'。');}
    if(n.end!=='bare'&&n.flangeWeight===0)warnings.push('法蘭單重未提供，未計入重量合計。');
    if(n.end==='so')warnings.push(n.soSetback===0?'平焊套入按管端與密封面齊平估長；退縮可在接法設定輸入，焊接位置依圖說／WPS。':`平焊套入管端由密封面退縮 ${n.soSetback} mm，已扣一次；焊接位置依圖說／WPS。`);
    if(n.end!=='bare'&&n.projection<n.flangeLength)warnings.push('法蘭後端伸到槽壁內，請增加外伸或確認接管型式。');
    if(n.end!=='bare'&&n.flangeSource==='texas-v1'&&!flangeReferenceMatches(n))warnings.push('法蘭規格與帶入尺寸已不一致；請重新套用尺寸表或改依實測核對。');
    if(n.end!=='bare'&&n.flangeClass==='2500'&&Number(n.flangeSize)>12)warnings.push('目前標記 Class 2500 且 NPS 大於 12，超出 B16.5 官方此等級的尺寸範圍，須另核對規範。');
    items.push({...n,hole,holeWidth,hostThickness,direction,surface,face,pipeEnd,pipeStart,minCutLength,maxCutLength,blankLength,pipeWeight,blankWeight,unfoldX,shellPiece,verticalClearance,horizontalClearance,warnings});
  }
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){const a=items[i],b=items[j];if(a.host!==b.host)continue;
    const distance=a.host==='shell'?Math.hypot(shortArc(a.unfoldX,b.unfoldX,r.circumference),a.height-b.height):Math.hypot(a.surface[0]-b.surface[0],a.surface[2]-b.surface[2]);
    if(distance<(a.holeWidth+b.holeWidth)/2){a.warnings.push(`與 ${b.id} 的開孔包絡相交，請核對位置。`);b.warnings.push(`與 ${a.id} 的開孔包絡相交，請核對位置。`);}
    const flangeDistance=Math.hypot(...a.face.map((v,k)=>v-b.face[k]));if(a.end!=='bare'&&b.end!=='bare'&&flangeDistance<(a.flangeOD+b.flangeOD)/2){a.warnings.push(`與 ${b.id} 的法蘭空間包絡相交，螺栓／工具空間需另核對。`);b.warnings.push(`與 ${a.id} 的法蘭空間包絡相交，螺栓／工具空間需另核對。`);}
  }
  return {valid:issues.length===0,items,issues,count:values?.length??0,flangeCount:items.filter(n=>n.end!=='bare').length,unknownFlangeWeight:items.filter(n=>n.end!=='bare'&&n.flangeWeight===0).length,pipeBlankLength:items.reduce((sum,n)=>sum+n.blankLength,0),pipeWeight:items.reduce((sum,n)=>sum+n.pipeWeight,0),blankWeight:items.reduce((sum,n)=>sum+n.blankWeight,0),flangeWeight:items.reduce((sum,n)=>sum+(n.end==='bare'?0:n.flangeWeight),0),extraWeight:items.reduce((sum,n)=>sum+n.pipeWeight+(n.end==='bare'?0:n.flangeWeight),0),notes:['管嘴按垂直穿入、近側內壁貼合輪廓估長。筒壁端須修魚口；管料先備最長包絡長＋總留料，重量未扣魚口切除。','帶頸法蘭占長由管端對焊面量到密封面，另扣一次對焊間隙；平焊套入不從直管長扣法蘭占長，只扣指定管端退縮一次。法蘭單重 0 代表未提供。','開孔包絡只供定位和幾何干涉提示，不是 1:1 切割紙樣；主體估重未扣開孔，容積未扣內凸管嘴。','開孔補強、局部應力、外接管線載荷、法蘭壓溫額定及螺栓／墊片配合尚未校核；未自動產生補強板。']};
}
