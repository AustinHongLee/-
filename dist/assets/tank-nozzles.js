// Layout and material estimates for normal, set-in nozzles. No pressure design.
import {FLANGE_DEFAULTS,FLANGE_SIZES,FLANGE_CLASSES,FLANGE_FACES,flangeReferenceMatches} from './tank-flanges.js';
export const NOZZLE_HOSTS={shell:'筒壁徑向',top:'平蓋向上',bottom:'平底向下'};
export const NOZZLE_ENDS={wn:'帶頸對焊法蘭',so:'平焊套入法蘭',bare:'裸管端'};
export const NOZZLE_DEFAULTS=Object.freeze({...FLANGE_DEFAULTS,host:'shell',height:300,angle:45,radius:0,od:60,thickness:3,projection:200,inside:0,holeGap:1,allowance:10,end:'wn',flangeOD:150,flangeLength:50,flangeThickness:18,flangeWeight:0,flangeSpec:'',weldGap:2,reinforcement:'',kind:'nozzle',padOD:0,padThickness:0,coverThickness:0,davit:'davit'});
const numericLimits={height:[0,100000],angle:[0,360],radius:[0,50000],od:[1,20000],thickness:[.1,1000],projection:[1,20000],inside:[0,10000],holeGap:[0,30],allowance:[0,1000],flangeOD:[1,30000],flangeLength:[.1,10000],flangeThickness:[.1,1000],flangeWeight:[0,100000],weldGap:[0,30],soSetback:[0,1000],padOD:[0,40000],padThickness:[0,300],coverThickness:[0,1000]};
const textKeys=['name','flangeSpec','reinforcement','flangeSize','flangeClass','flangeFacing','flangeMaterial','flangeSource'];
export const nozzleFieldLabel=key=>({padOD:'補強板外徑',padThickness:'補強板厚',coverThickness:'人孔蓋板厚',height:'距筒身下緣高度',angle:'方位角',radius:'距槽軸偏心',od:'管嘴外徑',thickness:'管嘴管厚',projection:'外壁到端面／密封面',inside:'內壁起凸入',holeGap:'孔口每側間隙',allowance:'管料總修整留料',flangeOD:'法蘭外徑',flangeLength:'法蘭軸向占長',flangeThickness:'法蘭盤厚',flangeWeight:'法蘭單重',weldGap:'對焊端間隙',soSetback:'管端由密封面退縮'})[key]||key;
export const NOZZLE_CONFLICT=/相交|碰到|低於|無法|伸到|不一致|超出/;
export const nozzleHasConflict=n=>(n?.warnings??[]).some(w=>NOZZLE_CONFLICT.test(w));
/** One key per physical issue: a pair warning written from both nozzles' side collapses to one entry. */
export function nozzleIssueKey(id,warning){const partner=warning.match(/與 (N\d+) 的/)?.[1];if(!partner)return id+'|'+warning;const pair=[id,partner].sort().join('|');return pair+(warning.includes('實體相交')?'|solid':warning.includes('開孔包絡')?'|hole':warning.includes('法蘭空間')?'|flange':'|'+warning.replace(partner,'#'));}
export function normalizeNozzles(values){
  const issues=[],items=[],ids=new Set(),keys=['id','host','end','kind','davit',...textKeys,...Object.keys(numericLimits)];
  if(!Array.isArray(values)||values.length>30)return {items,issues:[{message:'管嘴須為清單，最多 30 個。'}]};
  for(const raw of values){
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(key=>!keys.includes(key))){issues.push({message:'管嘴資料含未知欄位或格式錯誤。'});continue;}
    const n={...NOZZLE_DEFAULTS,name:'',...raw},issue=(field,message)=>issues.push({id:n.id,field,message});
    if(typeof n.id!=='string'||!/^N[1-9][0-9]{0,3}$/.test(n.id)||ids.has(n.id))issue('id','管嘴編號無效或重複。');ids.add(n.id);
    if(!Object.hasOwn(NOZZLE_HOSTS,n.host))issue('host','選擇筒壁、平蓋或平底位置。');
    if(!Object.hasOwn(NOZZLE_ENDS,n.end))issue('end','選擇管嘴端部接法。');
    if(!['nozzle','manhole'].includes(n.kind))issue('kind','選擇管嘴或人孔。');
    if(!['davit','hinge','none'].includes(n.davit))issue('davit','選擇人孔蓋開啟方式。');
    for(const [key,values] of [['flangeSize',FLANGE_SIZES],['flangeClass',FLANGE_CLASSES],['flangeFacing',Object.keys(FLANGE_FACES)]])if(n[key]!==''&&!values.includes(n[key]))issue(key,'法蘭規格選項無效。');
    if(!['manual','texas-v1'].includes(n.flangeSource))issue('flangeSource','法蘭尺寸來源無效。');
    for(const key of textKeys)if(typeof n[key]!=='string'||n[key].length>120)issue(key,'管嘴文字需為 120 字以內。');
    for(const [key,[min,max]] of Object.entries(numericLimits)){
      if(!['string','number'].includes(typeof n[key])){issue(key,`${nozzleFieldLabel(key)}需為數值。`);continue;}
      if(n.end==='bare'&&(key.startsWith('flange')||key==='weldGap'))continue;
      if(n.host!=='shell'&&key==='height'||n.host==='shell'&&key==='radius')continue;
      if(n.end!=='wn'&&key==='weldGap')continue;
      if(n.kind!=='manhole'&&key==='coverThickness')continue;
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
// --- Outside-the-tank solids for clash checks (mm). A cylinder is {a,d,length,radius}: start, unit axis.
const vsub=(a,b)=>a.map((v,i)=>v-b[i]),vadd=(a,b)=>a.map((v,i)=>v+b[i]),vmul=(a,k)=>a.map(v=>v*k),vdot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),vnorm=a=>Math.hypot(...a);
const vcross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],vneg=a=>a.map(v=>-v);
// Exact distance from a point to a SOLID finite cylinder (0 inside).
export function pointCylinderDistance(q,c){const w=vsub(q,c.a),t=vdot(w,c.d),radial=vnorm(vsub(w,vmul(c.d,t))),dt=Math.max(0,-t,t-c.length),dr=Math.max(0,radial-c.radius);return Math.hypot(dt,dr);}
// Farthest point of a solid cylinder in direction v (closed-form support mapping).
function support(c,v){const along=vdot(v,c.d),perp=vsub(v,vmul(c.d,along)),n=vnorm(perp),base=vadd(c.a,vmul(c.d,along>=0?c.length:0));return n>1e-12?vadd(base,vmul(perp,c.radius/n)):base;}
// Boolean GJK on the Minkowski difference of two convex solids: exact, a few dozen support calls,
// independent of how large or thin the parts are (no sampling, no memory growth).
function gjkIntersects(c1,c2){
  const point=v=>vsub(support(c1,v),support(c2,vneg(v))),centre=c=>vadd(c.a,vmul(c.d,c.length/2)),scale=Math.max(c1.length,c1.radius,c2.length,c2.radius,1),eps=1e-10*scale;
  let dir=vsub(centre(c1),centre(c2));if(vnorm(dir)<eps)return true;
  let simplex=[point(dir)];dir=vneg(simplex[0]);
  const line=(a,b)=>{const ab=vsub(b,a),ao=vneg(a);if(vdot(ab,ao)>0){simplex=[a,b];dir=vcross(vcross(ab,ao),ab);if(vnorm(dir)<eps*eps)return true;}else{simplex=[a];dir=ao;}return false;};
  const triangle=(a,b,c)=>{const ab=vsub(b,a),ac=vsub(c,a),ao=vneg(a),abc=vcross(ab,ac);
    if(vdot(vcross(abc,ac),ao)>0){if(vdot(ac,ao)>0){simplex=[a,c];dir=vcross(vcross(ac,ao),ac);return false;}return line(a,b);}
    if(vdot(vcross(ab,abc),ao)>0)return line(a,b);
    const side=vdot(abc,ao);if(Math.abs(side)<eps*scale*scale)return true;
    if(side>0){simplex=[a,b,c];dir=abc;}else{simplex=[a,c,b];dir=vneg(abc);}return false;};
  for(let iteration=0;iteration<64;iteration++){
    const length=vnorm(dir);if(length<eps)return true;dir=vmul(dir,1/length);
    const a=point(dir);if(vdot(a,dir)<=eps)return false;
    if(simplex.length===1){if(line(a,simplex[0]))return true;continue;}
    if(simplex.length===2){if(triangle(a,simplex[0],simplex[1]))return true;continue;}
    const [b,c,d]=simplex,ab=vsub(b,a),ac=vsub(c,a),ad=vsub(d,a),ao=vneg(a),abc=vcross(ab,ac),acd=vcross(ac,ad),adb=vcross(ad,ab);
    if(vdot(abc,ao)>0){if(triangle(a,b,c))return true;continue;}
    if(vdot(acd,ao)>0){if(triangle(a,c,d))return true;continue;}
    if(vdot(adb,ao)>0){if(triangle(a,d,b))return true;continue;}
    return true;
  }
  return true;// not converged: report as touching rather than silently missing a clash
}
// True when two solid cylinders overlap by more than ~2×`margin` mm (both shrunk by the margin, then exact GJK).
// The margin only absorbs exact tangency; any real interference above 0.1 mm is reported.
export function cylindersClash(c1,c2,margin=.05){
  const shrink=c=>{const m=Math.min(margin,c.radius*.25,c.length*.25);return {a:vadd(c.a,vmul(c.d,m)),d:c.d,length:c.length-2*m,radius:c.radius-m};};
  const reach=c=>Math.hypot(c.length/2,c.radius),mid=c=>vadd(c.a,vmul(c.d,c.length/2));if(vnorm(vsub(mid(c1),mid(c2)))>reach(c1)+reach(c2))return false;
  return gjkIntersects(shrink(c1),shrink(c2));
}
const clashCache=new Map();
function solidClash(a,b){const sa=nozzleSolids(a),sb=nozzleSolids(b),key=JSON.stringify([sa,sb],(k,v)=>typeof v==='number'?Math.round(v*1e6)/1e6:v);
  if(clashCache.has(key))return clashCache.get(key);const hit=sa.flatMap(x=>sb.map(y=>[x,y])).find(([x,y])=>cylindersClash(x,y))??null;
  if(clashCache.size>400)clashCache.delete(clashCache.keys().next().value);clashCache.set(key,hit);return hit;}
function nozzleSolids(n){const solids=[],d=n.direction,flange=n.end!=='bare';
  const pipeEnd=flange?vadd(n.face,vmul(d,-n.flangeThickness)):n.face,pipeLength=vdot(vsub(pipeEnd,n.surface),d);
  if(pipeLength>1e-6)solids.push({kind:'pipe',a:n.surface,d,length:pipeLength,radius:n.od/2});
  if(flange)solids.push({kind:'flange',a:vadd(n.face,vmul(d,-n.flangeThickness)),d,length:n.flangeThickness,radius:n.flangeOD/2});
  return solids;}
const PAD_NOTE='補強板為幾何記錄：外徑、厚度與是否需要依正式開孔補強計算；試漏孔與焊接依圖說。';
/** Context-aware host names (vertical: top/bottom ends; horizontal: B/A ends). */
export function nozzleHostLabel(host,r){
  if(host==='shell')return NOZZLE_HOSTS.shell;const horizontal=r?.orientation==='horizontal',type=r?.endTypes?.[host];
  if(horizontal)return (host==='bottom'?'A 端':'B 端')+(type==='flat'?'平板':type==='cone'?'錐體':'封頭')+'軸向';
  if(!type||type==='flat')return NOZZLE_HOSTS[host];return host==='top'?({cone:'錐頂',dome:'拱頂'}[type]??'上封頭')+'垂直向上':({cone:'錐底'}[type]??'下封頭')+'垂直向下';
}
const endWord=(which,r)=>{const horizontal=r.orientation==='horizontal',type=r.endTypes[which];if(horizontal)return which==='bottom'?'A 端':'B 端';return which==='bottom'?({flat:'底板',cone:'錐底'}[type]??'下封頭'):({flat:'頂蓋',cone:'錐頂',dome:'拱頂'}[type]??'上封頭');};
// Seams on an end (cone segments, petals, spliced plates) for opening clearance checks, in plan coordinates.
function endSeamHits(r,which,x,z,radius){
  const layout=r.layouts?.[which],hits=[];if(!layout)return hits;
  const rho=Math.hypot(x,z),angle=((Math.atan2(x,z)*180/Math.PI)+360)%360,start=Number(r.input.seamStart)||0;
  const radialSeamClash=(segments,offset,ringRadius)=>{if(!(segments>0))return false;const pitch=360/segments;for(let k=0;k<segments;k++){const seam=(start+offset+k*pitch)%360;let d=Math.abs(angle-seam);d=Math.min(d,360-d);if(rho*Math.sin(Math.min(Math.PI/2,d*Math.PI/180))<radius&&d<90)return true;}return ringRadius!==undefined&&rho<radius;};
  if(layout.method==='sector'){const cos=Math.cos(Math.atan2(r.ends[which].depth,Math.max(1e-9,r.ends[which].ri-r.ends[which].small/2)));
    for(const band of layout.bands){const inner=band.rho1*cos,outer=band.rho2*cos;if(rho+radius>inner&&rho-radius<outer&&radialSeamClash(band.segments,band.index%2===0?180/band.segments:0))hits.push('錐體分片縫');if(band.index>1&&Math.abs(rho-inner)<radius)hits.push('錐體環縫');}}
  if(layout.method==='petal'){const R=layout.sphere.radius,ring=phi=>R*Math.sin(phi);if(Math.abs(rho-ring(layout.crownAngle))<radius)hits.push('中心板環縫');
    for(const band of layout.bands){const inner=ring(band.phi1),outer=ring(band.phi2);if(rho+radius>inner&&rho-radius<outer&&radialSeamClash(band.petals,0))hits.push('瓜瓣縫');if(band.index>1&&Math.abs(rho-inner)<radius)hits.push('瓜瓣環縫');}}
  if(layout.method==='strips'||layout.method==='annular'){const splice=layout.method==='strips'?layout:layout.centre;
    if(splice.rowSeams.some(seam=>Math.abs(z-seam.y)<radius&&Math.abs(x)<seam.length/2))hits.push('拼板縱向縫');
    if(splice.crossSeams.some(seam=>Math.abs(x-seam.x)<radius&&z+radius>seam.y0&&z-radius<seam.y1))hits.push('拼板橫向縫');
    if(layout.method==='annular'&&Math.abs(rho-layout.innerRadius-(layout.centre.joint==='lap'?layout.centre.lap:0))<radius)hits.push(layout.centre.joint==='lap'?'中幅板搭接縫':'中幅板對接縫');
    if(layout.method==='annular'&&rho+radius>layout.innerRadius&&radialSeamClash(layout.ring.pieces.length,0))hits.push('環形邊板對接縫');}
  return [...new Set(hits)];
}
export function planTankNozzles(r,values=r.input.nozzles??[]){
  const normalized=normalizeNozzles(values),issues=[...normalized.issues],items=[],p=r.input,ri=r.di/2,ro=r.od/2,rm=r.meanDiameter/2;
  const frame=r.frame??{bottomTangent:p.endThickness,bodyBottom:p.endThickness,topTangent:p.endThickness+r.height},endTypes=r.endTypes??{top:p.shape==='open'?'open':p.shape,bottom:p.shape==='elliptical'?'elliptical':'flat'},vertical=(r.orientation??'vertical')==='vertical';
  for(const n of normalized.items){
    if(issues.some(issue=>issue.id===n.id))continue;
    const issue=(field,message)=>issues.push({id:n.id,field,message}),hole=n.od+2*n.holeGap,holeRadius=hole/2,theta=n.angle/180*Math.PI;
    const which=n.host==='top'?'top':'bottom',end=n.host==='shell'?null:r.ends?.[which];
    if(n.host==='top'&&endTypes.top==='open')issue('host','開口槽沒有頂蓋；請改槽型，或將管嘴放在筒壁／底部。');
    if(n.host==='shell'){
      if(hole>=r.di)issue('od','管嘴孔徑需小於槽內徑，才能使用本工具的徑向穿入幾何。');
      if(n.height<holeRadius||n.height+holeRadius>r.bodyHeight)issue('height','開孔超出筒身板邊；請調整高度或管嘴尺寸。');
      if(n.inside>=2*Math.sqrt(Math.max(0,ri*ri-(n.od/2)**2)))issue('inside','內凸管嘴已到達對側內壁，請縮短內凸量。');
    }else if(!issues.some(x=>x.id===n.id)){
      if(n.radius+holeRadius>ri)issue('radius','開孔包絡超出槽內徑範圍；請減少偏心或孔徑。');
      const other=r.ends?.[which==='top'?'bottom':'top'],reach=r.height+(end?end.depthAt(n.radius):0)+(other?other.depthAt(n.radius):0);
      if(n.inside>=reach)issue('inside',`內凸管嘴已到達對側${vertical?'底／蓋':'端部'}，請縮短內凸量。`);
    }
    if(issues.some(issue=>issue.id===n.id))continue;
    const hostThickness=n.host==='shell'?p.shellThickness:(end?.t??p.endThickness),occupied=n.end==='wn'?n.flangeLength+n.weldGap:n.end==='so'?n.soSetback:0;
    // Ends: axis-parallel pipe through the end surface. The face sits `projection` beyond the outside surface at the nozzle centre;
    // the inside end follows the inside surface (offset by `inside`) around the pipe's outside circle.
    const outerAt=end?end.outerDepthAt(n.radius):0,innerNear=end?end.depthAt(Math.abs(n.radius-n.od/2)):0,innerFar=end?end.depthAt(Math.min(ri,n.radius+n.od/2)):0,axialWall=end?outerAt-end.depthAt(n.radius):hostThickness;
    const minCutLength=n.host==='shell'?n.projection+n.inside+hostThickness-occupied:n.projection+n.inside-occupied+outerAt-innerNear,sag=n.host==='shell'?ri-Math.sqrt(ri*ri-(n.od/2)**2):innerNear-innerFar,maxCutLength=minCutLength+sag;
    if(minCutLength<=0){issue(n.end==='so'?'soSetback':'projection',n.end==='so'?'管端退縮後沒有可用管長；請減少退縮或增加外伸。':'伸出距離不足以容納法蘭占長及對焊間隙；請增加外伸或核對法蘭尺寸。');continue;}
    const bodyBottom=frame.bodyBottom;
    const direction=n.host==='shell'?[Math.sin(theta),0,Math.cos(theta)]:[0,n.host==='top'?1:-1,0];
    const surface=n.host==='shell'?[ro*direction[0],bodyBottom+n.height,ro*direction[2]]:[n.radius*Math.sin(theta),n.host==='top'?frame.topTangent+outerAt:frame.bottomTangent-outerAt,n.radius*Math.cos(theta)];
    const face=surface.map((v,i)=>v+direction[i]*n.projection),pipeEnd=surface.map((v,i)=>v+direction[i]*(n.projection-occupied)),pipeStart=surface.map((v,i)=>v-direction[i]*(axialWall+n.inside));
    const blankLength=maxCutLength+n.allowance,pipeArea=Math.PI*(n.od**2-(n.od-2*n.thickness)**2)/4,pipeWeight=pipeArea*maxCutLength/1e9*p.density,blankWeight=pipeArea*blankLength/1e9*p.density;
    const warnings=[],unfoldX=n.angle/360*r.circumference,holeWidth=n.host==='shell'?2*rm*Math.asin(Math.min(1,holeRadius/ri)):hole;
    const padRadius=n.padOD>0?n.padOD/2:0,padThickness=n.padOD>0?(n.padThickness>0?n.padThickness:hostThickness):0;
    if(n.padOD>0&&n.padOD<=hole)issue('padOD','補強板外徑需大於開孔直徑。');
    let shellPiece=null,verticalClearance=null,horizontalClearance=null;
    if(n.host==='shell'){
      const course=Math.min(r.courses,Math.floor(n.height/(r.courseHeight+p.gap))+1),pieces=r.assembly.filter(piece=>piece.course===course);
      shellPiece=pieces.find(piece=>(unfoldX-piece.start+r.circumference)%r.circumference<=piece.length)?.id??null;
      const seamArc=Math.min(...pieces.map(piece=>shortArc(unfoldX,(piece.start-p.gap/2+r.circumference)%r.circumference,r.circumference))),seamHeights=Array.from({length:r.courses-1},(_,i)=>(i+1)*(r.courseHeight+p.gap)-p.gap/2);
      verticalClearance=seamArc-holeWidth/2;
      horizontalClearance=r.courses>1?Math.min(...seamHeights.map(h=>Math.abs(n.height-h)))-holeRadius:null;
      if(verticalClearance<=p.gap/2)warnings.push('開孔包絡碰到筒身縱縫，需調位置或依正式圖說確認。');
      if(horizontalClearance!==null&&horizontalClearance<=p.gap/2)warnings.push('開孔包絡碰到筒身環縫，需調位置或依正式圖說確認。');
      if(padRadius>holeRadius){const padWidth=2*(ro+padThickness/2)*Math.asin(Math.min(1,padRadius/(ro+padThickness/2)));
        if(verticalClearance>p.gap/2&&seamArc-padWidth/2<=p.gap/2)warnings.push('補強板碰到筒身縱縫，需調位置或依正式圖說確認。');
        if(horizontalClearance!==null&&horizontalClearance>p.gap/2&&Math.min(...seamHeights.map(h=>Math.abs(n.height-h)))-padRadius<=p.gap/2)warnings.push('補強板碰到筒身環縫，需調位置或依正式圖說確認。');}
      // Shell end joints: butt seams of heads / cones (touch rule at the gap centre, headGap/2 beyond the shell edge),
      // or the shell-to-bottom / shell-to-cover fillet welds, whose leg reaches about one shell thickness along the shell.
      const reachBelow=n.height-Math.max(holeRadius,padRadius),reachAbove=r.bodyHeight-n.height-Math.max(holeRadius,padRadius),fillet=p.shellThickness,butt=t=>['cone','elliptical','torispherical','hemispherical'].includes(t);
      const what=padRadius>holeRadius?'補強板':'開孔包絡';
      if(butt(endTypes.bottom)?reachBelow<=1e-9:reachBelow<fillet)warnings.push(butt(endTypes.bottom)?`${what}碰到${endWord('bottom',r)}對接縫，需調位置或依正式圖說確認。`:`${what}進入筒身與${vertical?'底板':'A 端板'}的角焊縫區（約一個板厚 ${fillet} mm），需調位置或依正式圖說確認。`);
      if(endTypes.top!=='open'&&(butt(endTypes.top)?reachAbove<=1e-9:reachAbove<fillet))warnings.push(butt(endTypes.top)?`${what}碰到${endWord('top',r)}對接縫，需調位置或依正式圖說確認。`:`${what}進入筒身與${vertical?(endTypes.top==='dome'?'拱頂':'頂蓋'):'B 端板'}的焊縫區（約一個板厚 ${fillet} mm），需調位置或依正式圖說確認。`);
      if(vertical&&n.end!=='bare'&&bodyBottom+n.height-n.flangeOD/2<0)warnings.push(`法蘭外緣低於槽底 ${(n.flangeOD/2-bodyBottom-n.height).toFixed(1)} mm，安裝與螺栓空間需另核對。`);
    }else if(end){
      const x=surface[0],z=surface[2],envelope=Math.max(holeRadius,padRadius);
      for(const hit of endSeamHits(r,which,x,z,envelope))warnings.push(`${padRadius>holeRadius?'補強板':'開孔包絡'}碰到${endWord(which,r)}${hit}，需調位置或依正式圖說確認。`);
      if(end.type==='torispherical'&&n.radius+envelope>end.junctionRadius)warnings.push(`開孔${padRadius>holeRadius?'或補強板':''}進入碟形封頭轉角區（冠部半徑 ${end.junctionRadius.toFixed(0)} mm 以外），開孔與補強依規範另確認。`);
      if(end.type==='elliptical'&&n.radius+holeRadius>.4*r.di)warnings.push('開孔超出橢圓封頭中心 0.8D 範圍（ASME 球面部分），開孔與補強依規範另確認。');
      if(end.type==='cone'&&n.radius-holeRadius<end.small/2&&n.radius+holeRadius>end.small/2)warnings.push('開孔跨到錐體小端開口邊緣，請改位置或把小端出口直接設為管嘴。');
      if(end.type!=='flat'&&sag>0)warnings.push(`端部為曲面：管端內側依曲面修切，最短／最長差 ${sag.toFixed(1)} mm。`);
    }
    if(n.end!=='bare'&&(!n.flangeSize||!n.flangeClass||!n.flangeFacing||!n.flangeMaterial)&&!n.flangeSpec.trim())warnings.push('法蘭規範、尺寸系列、材質、等級及密封面尚待確認。');
    if(n.end!=='bare'&&[n.flangeSize,n.flangeClass,n.flangeFacing,n.flangeMaterial].some(Boolean)){const missing=[!n.flangeSize?'NPS 尺寸':'',!n.flangeClass?'Class 等級':'',!n.flangeFacing?'密封面':'',!n.flangeMaterial?'材質':''].filter(Boolean);if(missing.length)warnings.push('法蘭規格尚待填寫：'+missing.join('、')+'。');}
    if(n.end!=='bare'&&n.flangeWeight===0)warnings.push('法蘭單重未提供，未計入重量合計。');
    if(n.end==='so')warnings.push(n.soSetback===0?'平焊套入按管端與密封面齊平估長；退縮可在接法設定輸入，焊接位置依圖說／WPS。':`平焊套入管端由密封面退縮 ${n.soSetback} mm，已扣一次；焊接位置依圖說／WPS。`);
    // The flange's back must clear the outside surface on the near side of a sloping end too.
    const nearOutside=end?end.outerDepthAt(Math.abs(n.radius-n.flangeOD/2))-outerAt:0;
    if(n.end!=='bare'&&n.projection-nearOutside<n.flangeLength)warnings.push(`法蘭後端伸到${n.host==='shell'?'槽壁':'端部外表面'}內，請增加外伸或確認接管型式。`);
    else if(n.end==='wn'&&n.projection-n.flangeLength-n.weldGap<0)warnings.push('帶頸法蘭對焊端（含對焊間隙）落在槽壁外表面以內，無法施焊；請增加外伸。');
    if(n.end!=='bare'&&n.flangeSource==='texas-v1'&&!flangeReferenceMatches(n))warnings.push('法蘭規格與帶入尺寸已不一致；請重新套用尺寸表或改依實測核對。');
    if(n.end!=='bare'&&n.flangeClass==='2500'&&Number(n.flangeSize)>12)warnings.push('目前標記 Class 2500 且 NPS 大於 12，超出 B16.5 官方此等級的尺寸範圍，須另核對規範。');
    if(n.kind==='manhole'&&n.end==='bare')warnings.push('人孔未設法蘭與蓋板；請選擇法蘭接法以估算人孔蓋。');
    items.push({...n,hole,holeWidth,hostThickness,direction,surface,face,pipeEnd,pipeStart,minCutLength,maxCutLength,blankLength,pipeWeight,blankWeight,unfoldX,shellPiece,verticalClearance,horizontalClearance,padRadius,padThickness,warnings});
  }
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){const a=items[i],b=items[j];if(a.host!==b.host)continue;
    const distance=a.host==='shell'?Math.hypot(shortArc(a.unfoldX,b.unfoldX,r.circumference),a.height-b.height):Math.hypot(a.surface[0]-b.surface[0],a.surface[2]-b.surface[2]);
    if(distance<(a.holeWidth+b.holeWidth)/2){a.warnings.push(`與 ${b.id} 的開孔包絡相交，請核對位置。`);b.warnings.push(`與 ${a.id} 的開孔包絡相交，請核對位置。`);}
    else if((a.padRadius||b.padRadius)&&distance<Math.max(a.padRadius,a.hole/2)+Math.max(b.padRadius,b.hole/2)){a.warnings.push(`與 ${b.id} 的補強板重疊，請核對位置或改為共用補強板。`);b.warnings.push(`與 ${a.id} 的補強板重疊，請核對位置或改為共用補強板。`);}
    const flangeDistance=Math.hypot(...a.face.map((v,k)=>v-b.face[k]));if(a.end!=='bare'&&b.end!=='bare'&&flangeDistance<(a.flangeOD+b.flangeOD)/2){a.warnings.push(`與 ${b.id} 的法蘭空間包絡相交，螺栓／工具空間需另核對。`);b.warnings.push(`與 ${a.id} 的法蘭空間包絡相交，螺栓／工具空間需另核對。`);}
  }
  //槽外實體：任一管嘴的管身穿過另一法蘭盤、法蘭盤互撞或管身互撞（含不同安裝面）。
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){const a=items[i],b=items[j],clash=solidClash(a,b);
    if(clash){const name=s=>s.kind==='flange'?'法蘭盤':'管身';a.clashes=[...(a.clashes??[]),b.id];b.clashes=[...(b.clashes??[]),a.id];a.warnings.push(`${name(clash[0])}與 ${b.id} 的${name(clash[1])}實體相交，請改位置、外伸或方位。`);b.warnings.push(`${name(clash[1])}與 ${a.id} 的${name(clash[0])}實體相交，請改位置、外伸或方位。`);}
  }
  const pads=items.filter(n=>n.padRadius>0);
  return {valid:issues.length===0,items,issues,count:values?.length??0,flangeCount:items.filter(n=>n.end!=='bare').length,unknownFlangeWeight:items.filter(n=>n.end!=='bare'&&n.flangeWeight===0).length,pipeBlankLength:items.reduce((sum,n)=>sum+n.blankLength,0),pipeWeight:items.reduce((sum,n)=>sum+n.pipeWeight,0),blankWeight:items.reduce((sum,n)=>sum+n.blankWeight,0),flangeWeight:items.reduce((sum,n)=>sum+(n.end==='bare'?0:n.flangeWeight),0),extraWeight:items.reduce((sum,n)=>sum+n.pipeWeight+(n.end==='bare'?0:n.flangeWeight),0),padCount:pads.length,manholeCount:items.filter(n=>n.kind==='manhole').length,notes:['管嘴按垂直穿入（筒壁徑向、端部平行槽軸）、近側內壁貼合輪廓估長。曲面端須修魚口；管料先備最長包絡長＋總留料，重量未扣魚口切除。','帶頸法蘭占長由管端對焊面量到密封面，另扣一次對焊間隙；平焊套入不從直管長扣法蘭占長，只扣指定管端退縮一次。法蘭單重 0 代表未提供。','開孔包絡只供定位和幾何干涉提示，不是 1:1 切割紙樣；主體估重未扣開孔，容積未扣內凸管嘴。','開孔補強、局部應力、外接管線載荷、法蘭壓溫額定及螺栓／墊片配合尚未校核。'+(pads.length?PAD_NOTE:'補強板可在管嘴設定填外徑後估料。')]};
}
