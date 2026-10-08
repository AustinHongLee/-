// Fabrication process estimates: weld inventory and consumables, NDE quantities, dimensional tolerances, testing,
// surface treatment, erection / transport, level–volume table and centre of gravity. Planning values only.
import {G,liquidDensity,endSurfaceArea,insulationEstimate} from './tank-attachments.js';
import {PROCESS_EFFICIENCY,PROCESS_LABELS,pwhtRequired,methodContext} from './tank-method-config.js';
import {horizontalEndVolume,horizontalEndMoment,segmentArea} from './tank-heads.js';
const PI=Math.PI,rad=d=>d*PI/180;
/** Groove cross-section (mm²) for a butt joint of thickness t: I up to squareMax, single V up to vMax, double V above. */
export function grooveFor(t,w){
  const gap=w.rootGap,face=Math.min(w.rootFace,t),half=Math.tan(rad(w.bevelAngle/2)),cap=width=>2/3*width*w.cap;
  if(t<=w.squareMax){const width=gap+3;return {type:'I',t,gap,face:t,depth:0,area:t*gap+2*cap(width),faceWidth:width,rootWidth:width};}
  if(t<=w.vMax){const depth=Math.max(0,t-face),top=gap+2*depth*half;return {type:'V',t,gap,face,depth,angle:w.bevelAngle,area:t*gap+depth*depth*half+cap(top+3)+cap(gap+3),faceWidth:top+3,rootWidth:gap+3};}
  const depth=Math.max(0,(t-face)/2),top=gap+2*depth*half;return {type:'X',t,gap,face,depth,angle:w.bevelAngle,area:t*gap+2*depth*depth*half+2*cap(top+3),faceWidth:top+3,rootWidth:top+3};
}
export const filletArea=leg=>1.1*leg*leg/2;
const JOINT_GROUP={A:'A 類（縱縫／封頭內焊縫）',B:'B 類（環縫）',C:'C 類（平板端／法蘭）',D:'D 類（接管）'};
/** Every weld seam of the estimate with its category, joint type and length. */
export function weldInventory(r,att){
  const p=r.input,ts=p.shellThickness,seams=[],add=(name,group,category,kind,size,length,extra={})=>{if(length>0)seams.push({name,group,category,kind,t:kind==='butt'?size:undefined,leg:kind==='fillet'?size:undefined,length,...extra});};
  add('筒身縱縫','shell','A','butt',ts,r.verticalSeams*r.courseHeight,{count:r.verticalSeams});
  add('筒身環縫','shell','B','butt',ts,r.horizontalSeams*r.circumference,{count:r.horizontalSeams});
  const hasCurb=r.methods.rings.some(x=>x.purpose==='curb');
  for(const which of ['bottom','top']){
    const end=r.ends[which],type=end.type,label=r.orientation==='horizontal'?(which==='bottom'?'A 端':'B 端'):(which==='bottom'?'底部':'頂部');
    if(type==='open')continue;
    const leg=Math.min(ts,end.t,r.methods.welding.filletLeg>0?r.methods.welding.filletLeg:12);
    // The shell stands on the annular ring when there is one, so the shell-to-bottom fillet follows that plate.
    if(type==='flat'){const both=which==='bottom'||r.orientation==='horizontal',tb=r.layouts?.[which]?.method==='annular'?r.layouts[which].thickness:end.t;add(label+'－筒身角焊'+(both?'（內＋外）':'（外側）'),'end','C','fillet',r.methods.welding.filletLeg>0?r.methods.welding.filletLeg:Math.min(ts,tb,12),both?PI*r.di+PI*r.od:PI*r.od);}
    else if(type==='dome'||type==='cone'&&which==='top'&&r.orientation==='vertical'&&hasCurb)add(label+'－包邊角鋼角焊','end','頂','fillet',leg,PI*r.od);
    else add(label+'－筒身對接','end',type==='hemispherical'?'A':'B','butt',Math.min(ts,end.t),PI*(r.di+Math.min(ts,end.t)));
    const layout=r.layouts?.[which];if(!layout)continue;
    if(layout.method==='sector'){add(label+'錐體分片縫','end','A','butt',end.t,layout.radialLength,{count:layout.radialSeams});add(label+'錐體環縫','end','B','butt',end.t,layout.circLength,{count:layout.circSeams});}
    if(layout.method==='petal'){add(label+'瓜瓣縫','end','A','butt',end.t,layout.meridianLength??0,{count:layout.meridianSeams});add(label+'瓜瓣環縫','end','A','butt',end.t,layout.parallelLength??0,{count:layout.parallelSeams});}
    if(layout.method==='strips'){const lap=layout.joint==='lap';add(label+'拼板縫','end','底',lap?'fillet':'butt',end.t,layout.weldLength,{lap});}
    if(layout.method==='annular'){add('環形邊板對接縫','end','底','butt',layout.thickness,layout.ring.radialLength,{count:layout.ring.pieces.length});const lap=layout.centre.joint==='lap';add('中幅板拼板縫','end','底',lap?'fillet':'butt',end.t,layout.centre.weldLength,{lap});
      // Lapped centre plates lie on the ring and are fillet-welded at their edge (inner radius + lap); butt-jointed ones meet the ring edge.
      if(lap)add('中幅板－環形邊板搭接','end','底','fillet',end.t,2*PI*(layout.innerRadius+layout.centre.lap),{lap:true});else add('中幅板－環形邊板對接','end','底','butt',Math.min(end.t,layout.thickness),2*PI*layout.innerRadius);}
  }
  for(const n of r.nozzlePlan?.items??[]){
    add(`${n.id} 接管－${n.host==='shell'?'筒壁':'端部'}`,'nozzle','D','fillet',Math.min(n.thickness,n.hostThickness),2*PI*n.od,{nozzle:n.id});
    if(n.end==='wn')add(`${n.id} 法蘭對焊`,'nozzle','C','butt',n.thickness,PI*n.od,{nozzle:n.id});
    if(n.end==='so')add(`${n.id} 法蘭平焊（內＋外）`,'nozzle','C','fillet',n.thickness,2*PI*n.od,{nozzle:n.id});
  }
  // Attachment fillets follow the welding setting: the chosen leg, else the thinner part capped at 12 mm.
  const legSetting=r.methods.welding.filletLeg;
  for(const w of att?.welds??[])add(w.name,'attachment','附',w.kind,w.kind==='butt'?w.t:legSetting>0?legSetting:Math.min(w.leg,12),w.length);
  return seams;
}
export function weldPlan(r,att){
  const w=r.methods.welding,rho=r.input.density,seams=weldInventory(r,att);
  const eff=(process,override)=>override>0?override:PROCESS_EFFICIENCY[process];
  for(const seam of seams){
    const groove=seam.kind==='butt'?grooveFor(seam.t,w):null,area=groove?groove.area:filletArea(seam.leg);
    const process=seam.kind==='butt'?w.buttProcess:w.filletProcess,efficiency=eff(process,seam.kind==='butt'?w.buttEfficiency:w.filletEfficiency);
    Object.assign(seam,{groove,area,metal:area*seam.length*rho/1e9,process,efficiency});seam.consumable=seam.metal/efficiency;
  }
  const by=key=>Object.values(seams.reduce((acc,s)=>{const k=s[key];(acc[k]??={key:k,length:0,metal:0,consumable:0}).length+=s.length;acc[k].metal+=s.metal;acc[k].consumable+=s.consumable;return acc;},{}));
  const grooves=Object.values(seams.filter(s=>s.groove).reduce((acc,s)=>{const k=s.groove.type+':'+s.t;acc[k]??={...s.groove,length:0,names:[]};acc[k].length+=s.length;if(!acc[k].names.includes(s.name))acc[k].names.push(s.name);return acc;},{})).sort((a,b)=>a.t-b.t);
  const totals={length:seams.reduce((s,x)=>s+x.length,0),butt:seams.filter(x=>x.kind==='butt').reduce((s,x)=>s+x.length,0),fillet:seams.filter(x=>x.kind==='fillet').reduce((s,x)=>s+x.length,0),metal:seams.reduce((s,x)=>s+x.metal,0),consumable:seams.reduce((s,x)=>s+x.consumable,0)};
  const flux=seams.filter(s=>s.process==='saw').reduce((s,x)=>s+x.metal,0);
  return {seams,grooves,byProcess:by('process').map(x=>({...x,label:PROCESS_LABELS[x.key]})),byGroup:by('group'),byCategory:by('category').map(x=>({...x,label:JOINT_GROUP[x.key]??({'附':'附件焊縫','底':'底板／拼板焊縫','頂':'頂板與包邊'}[x.key]??x.key)})),totals,flux,nde:ndePlan(r,seams)};
}
/** API 650 8.1.2 style spot count: one in the first 3 m, then one per additional `each` m and any remaining major fraction. */
export function apiSpots(length,each){if(!(length>0))return 0;const rest=Math.max(0,length-3000);return 1+Math.floor(rest/each)+(rest%each>each/2?1:0);}
function ndePlan(r,seams){
  const p=r.input,m=r.methods.inspection,code=p.code,E=Number(p.efficiency),eSet=String(p.efficiency??'').trim()!=='';
  let mode=m.rt;
  if(mode==='auto')mode=code==='api650'?'api650':code==='asme'?(eSet?(E>=1?'full':E>=.85?'spot':'none'):'spot'):'none';
  const butt=seams.filter(s=>s.kind==='butt'&&['A','B'].includes(s.category)),length=butt.reduce((s,x)=>s+x.length,0),notes=[];
  const nozzles=(r.nozzlePlan?.items??[]).length;
  let spots=0,films=0,rtLength=0,detail=[];
  if(mode==='full'){rtLength=length;films=Math.ceil(length/300);detail.push(`A／B 類對接縫全長 RT ${(length/1000).toFixed(1)} m`);}
  if(mode==='spot'){spots=length>0?Math.ceil(length/15000):0;detail.push(`A／B 類對接縫共 ${(length/1000).toFixed(1)} m：每 15 m 或其餘數 1 處 → ${spots} 處`);rtLength=spots*150;films=spots;notes.push('ASME UW-52(b)：每座容器每 15 m（50 ft）焊縫或其餘數抽 1 處，每處至少 150 mm；另需涵蓋每位焊工的焊縫，不合格須加照 2 處追蹤。');}
  if(mode==='api650'){
    const t=p.shellThickness,vert=r.verticalSeams*r.courseHeight,horiz=r.horizontalSeams*r.circumference,junctions=r.courses>1?2*r.panelsPerCourse*(r.courses-1):0,lowest=r.panelsPerCourse;
    if(t>25){rtLength+=vert;films+=Math.ceil(vert/300);detail.push(`縱縫全長 RT（板厚 > 25 mm）`);spots+=junctions;detail.push(`T 形交會 ${junctions} 處全照`);}
    else{const v=apiSpots(vert,30000);spots+=v;detail.push(`縱縫 ${v} 處（首 3 m 一處、其後每 30 m 一處）`);
      if(t>10){spots+=junctions+2*lowest;detail.push(`板厚 10～25 mm：T 形交會 ${junctions} 處全照；最下圈每道縱縫 2 處（${2*lowest}）`);}else{spots+=lowest;detail.push(`最下圈每道縱縫加 1 處隨機（${lowest}）`);}}
    const h=apiSpots(horiz,60000);spots+=h;detail.push(`環縫 ${h} 處（首 3 m 一處、其後每 60 m 一處）`);
    films+=spots;rtLength+=spots*150;
    notes.push('API 650 8.1.2：以每座槽、同類型與同板厚分組；至少 25% 的縱縫抽照在 T 形交會處，焊工依焊接長度比例分配。此為數量概估，正式依檢驗計畫。');
  }
  if(mode==='none')notes.push(code==='unknown'?'尚未指定規範，未排定射線檢驗；可在用途與規範頁填寫。':'未排定射線檢驗。');
  return {mode,modeLabel:{full:'全部 RT',spot:'抽查 RT（ASME UW-52）',api650:'API 650 抽查',none:'未排 RT'}[mode],spots,films,rtLength,detail,notes,pt:nozzles,ptNote:nozzles?`接管角焊 ${nozzles} 處建議 PT／MT（依規範）`:''};
}
/** Dimensional tolerances for the selected basis. */
export function tolerancePlan(r){
  const p=r.input,choice=r.methods.inspection.standard,basis=choice==='auto'?(p.code==='api650'?'api650':p.code==='asme'?'asme':'none'):choice,items=[],D=r.di;
  if(basis==='api650'){
    const m=D/1000,round=m<12?13:m<45?19:m<75?25:32;
    items.push({key:'plumb',name:'垂直度（頂部相對底部）',value:r.bodyHeight/200,unit:'mm',formula:`筒身高 ${r.bodyHeight.toFixed(0)} ÷ 200`,basis:'API 650 7.5.2'},{key:'round',name:'圓度（半徑，距底角焊 0.3 m 量）',value:round,unit:'± mm',formula:`D ${m.toFixed(1)} m 對應等級`,basis:'API 650 7.5.3（依版次確認）'},{key:'peak',name:'縱縫尖角（900 mm 弧形樣板）',value:13,unit:'mm',basis:'API 650 7.5.4'},{key:'band',name:'環縫凹凸（900 mm 直尺）',value:13,unit:'mm',basis:'API 650 7.5.4'});
  }
  if(basis==='asme'){
    const tIn=p.shellThickness/25.4,A=tIn<=.5?p.shellThickness/4:tIn<=1.5?3.2:tIn<=2?3.2:Math.min(p.shellThickness/16,9.5),B=tIn<=.75?p.shellThickness/4:tIn<=1.5?4.8:tIn<=2?p.shellThickness/8:Math.min(p.shellThickness/8,19);
    items.push({key:'round',name:'圓度（同一斷面最大－最小內徑）',value:.01*D,unit:'mm',formula:`1% × ${D.toFixed(0)}`,basis:'ASME UG-80(a)(1)'},{key:'opening',name:'開孔附近另可加',value:null,unit:'',formula:'2% × 開孔內徑（距開孔中心 1 個內徑內）',basis:'ASME UG-80(a)(2)'});
    if(['elliptical','torispherical','hemispherical'].some(t=>[r.endTypes.top,r.endTypes.bottom].includes(t)))items.push({key:'head',name:'封頭形狀偏差（外凸／內凹）',value:.0125*D,unit:'mm',formula:`+1.25% D／−0.625% D = +${(.0125*D).toFixed(1)}／−${(.00625*D).toFixed(1)}`,basis:'ASME UG-81'});
    items.push({key:'alignA',name:'A 類對接錯邊',value:A,unit:'mm',formula:`t ${p.shellThickness} mm`,basis:'ASME UW-33（依版次確認）'},{key:'alignB',name:'B 類對接錯邊',value:B,unit:'mm',formula:`t ${p.shellThickness} mm`,basis:'ASME UW-33（依版次確認）'});
  }
  return {basis,basisLabel:{api650:'API 650',asme:'ASME VIII-1',none:'只記錄量測方法'}[basis],items};
}
export function testPlan(r,att,weld){
  const p=r.input,m=r.methods.inspection,out={hydro:m.hydro,items:[],vacuum:[],notes:[]};
  const fill=m.hydro?m.testFill/100:0,water=r.volume*fill,mass=water*1000;
  out.water=water;out.waterMass=mass;out.fillHours=water/m.pumpRate;out.totalLoad=(att?.emptyWeight??r.netWeight)+mass;
  out.staticHead=G*levelForVolume(r,water)/1000;// kPa of water at the lowest point at the test level (water level in mm)
  const pressure=Number(p.pressure),pressurised=['pressure','both'].includes(p.service)||String(p.pressure??'').trim()!==''&&pressure>0;
  if(pressurised&&pressure>0){out.testPressure=1.3*pressure*m.lsr;out.notes.push(`ASME UG-99(b)：試驗壓力 ≥ 1.3 × MAWP × LSR = 1.3 × ${pressure} × ${m.lsr} = ${out.testPressure.toFixed(1)} kPa(g)（以設計內壓代 MAWP，正式依計算書）；最低點另加水柱 ${out.staticHead.toFixed(1)} kPa。`);}
  else out.notes.push(p.code==='api650'?'API 650：盛水至最高設計液位做靜水試驗；沉陷與觀察依規範。':'常壓槽：盛水試驗觀察滲漏與沉陷；壓力試驗依規範與合約。');
  const box=Math.max(1,m.boxLength-m.boxOverlap);
  for(const seam of weld?.seams??[])if(seam.group==='end'&&(seam.lap||seam.category==='底'))out.vacuum.push({name:seam.name,length:seam.length,count:Math.ceil(seam.length/box)});
  if(r.endTypes.bottom==='flat'&&r.orientation==='vertical')out.vacuum.push({name:'筒身－底板內側角焊（或滲透）',length:PI*r.di,count:Math.ceil(PI*r.di/box)});
  out.vacuumCount=out.vacuum.reduce((s,x)=>s+x.count,0);
  out.padTests=att?.pads.items.length??0;
  if(out.vacuumCount)out.notes.push(`真空箱 ${m.boxLength} mm 長、重疊 ${m.boxOverlap} mm；API 650 8.6 常用負壓 21～35 kPa，依版次確認。`);
  if(out.padTests)out.notes.push(`補強板 ${out.padTests} 片：由試漏孔通入 ≤ 100 kPa 空氣、肥皂水檢查（API 650 7.3.5），試後封孔依圖說。`);
  return out;
}
export function surfacePlan(r,att){
  const p=r.input,s=r.methods.surface,m2=x=>x/1e6,H=r.bodyHeight,areas={};
  areas.shellOut=m2(PI*r.od*H);areas.shellIn=m2(PI*r.di*H);
  const endArea=(which,side)=>endSurfaceArea(r,which,side);
  areas.topOut=endArea('top','out');areas.topIn=endArea('top','in');areas.bottomOut=endArea('bottom','out');areas.bottomIn=endArea('bottom','in');
  areas.underside=r.endTypes.bottom==='flat'&&r.orientation==='vertical'?m2(PI*(r.od+2*p.overhang)**2/4):0;
  const nozzles=r.nozzlePlan?.items??[];areas.nozzlesOut=m2(nozzles.reduce((t,n)=>t+PI*n.od*n.projection+(n.end==='bare'?0:2*PI*(n.flangeOD**2-n.od**2)/4+PI*n.flangeOD*n.flangeThickness),0));areas.nozzlesIn=m2(nozzles.reduce((t,n)=>t+PI*(n.od-2*n.thickness)*n.maxCutLength,0));
  areas.attachments=(att?.weight??0)*.032;
  const outside=areas.shellOut+areas.topOut+areas.bottomOut+areas.nozzlesOut+areas.attachments+(s.underside?areas.underside:0),inside=areas.shellIn+areas.topIn+areas.bottomIn+areas.nozzlesIn;
  const out={areas,outside,inside,notes:['附件表面積以重量 × 0.032 m²/kg 概估（約 8 mm 厚雙面）；管嘴以外伸管段與法蘭外表面估。']};
  if(s.paint){const area=s.paintSides==='outside'?outside:s.paintSides==='inside'?inside:outside+inside,coats=[['底漆',s.primer],['中塗',s.middle],['面漆',s.finish]].filter(([,dft])=>dft>0).map(([name,dft])=>({name,dft,spread:s.solids*10/dft,liters:area*dft/(s.solids*10)/(1-s.loss/100)}));
    out.paint={area,sides:s.paintSides,coats,liters:coats.reduce((t,c)=>t+c.liters,0),dft:coats.reduce((t,c)=>t+c.dft,0)};out.notes.push('理論塗佈率 = 體積固體份 % × 10 ÷ 乾膜厚 μm（m²/L）；再除以 (1 − 損耗)。噴砂面積同塗裝面積。');}
  if(s.pickling)out.pickling={area:outside+inside};
  if(s.insulation){out.insulation=insulationEstimate(r);out.notes.push('外包鋁皮按 1 m 寬片材、兩向各搭接估面積；保溫釘、支撐環與防水收邊依保溫規範。');}
  return out;
}
/** Level–volume relation (inside geometry). Vertical: level from the lowest inside point; horizontal: from the shell bottom. */
export function volumeAtLevel(r,level){
  const b=r.ends.bottom,t=r.ends.top,ri=r.di/2;
  if(r.orientation==='horizontal'){const H=Math.max(0,Math.min(r.di,level));return (r.height*segmentArea(ri,H)+horizontalEndVolume(b,H)+horizontalEndVolume(t,H))/1e9;}
  const y=Math.max(0,level),hb=b.depth,h=r.height;
  if(y<=hb)return b.fillFromApex(y)/1e9;
  if(y<=hb+h)return (b.volume+PI*ri*ri*(y-hb))/1e9;
  return (b.volume+PI*ri*ri*h+t.fillFromTangent(y-hb-h))/1e9;
}
export function maxLevel(r){return r.orientation==='horizontal'?r.di:r.ends.bottom.depth+r.height+r.ends.top.depth;}
export function levelForVolume(r,volume){let lo=0,hi=maxLevel(r);if(volume<=0)return 0;if(volume>=volumeAtLevel(r,hi))return hi;for(let i=0;i<80;i++){const m=(lo+hi)/2;if(volumeAtLevel(r,m)<volume)lo=m;else hi=m;}return (lo+hi)/2;}
export function strappingTable(r,rows=20){
  const top=maxLevel(r),step=top/rows,list=Array.from({length:rows+1},(_,i)=>{const level=Math.min(top,i*step),volume=volumeAtLevel(r,level);return {level,volume,percent:volume/r.volume*100};});
  const working=levelForVolume(r,r.workingVolume);
  return {top,rows:list,working:{level:working,volume:r.workingVolume,percent:r.input.fill},step};
}
// Thin-shell surface centroid of an end (dish plus straight flange), measured outward from its tangent line.
// Each profile segment is integrated exactly: radius and axial position vary linearly along the segment.
function endCentroid(end){
  if(end.type==='flat'||end.type==='open')return end.t/2;
  let a=0,m=0;const pts=end.profile;
  for(let i=0;i<pts.length-1;i++){const [r0,d0]=pts[i],[r1,d1]=pts[i+1],L=Math.hypot(r1-r0,d1-d0),dr=r1-r0,dd=d1-d0;a+=L*(r0+r1)/2;m+=L*(r0*d0+(r0*dd+d0*dr)/2+dr*dd/3);}
  const s=end.straight||0,rf=end.ri+end.t/2;a+=rf*s;m-=rf*s*s/2;
  return a?m/a:0;
}
export function centreOfGravity(r,att){
  const f=r.frame,items=[],vertical=r.orientation==='vertical';
  items.push({name:'筒身',mass:r.parts.find(x=>x.id==='S').netWeight,y:f.bodyBottom+r.bodyHeight/2});
  const endMass=which=>r.parts.filter(x=>x.ends?.includes(which)).reduce((s,x)=>s+x.netWeight/x.ends.length,0)+r.parts.filter(x=>!x.ends&&x.id!=='S'&&x.id.startsWith(which==='bottom'?'B':'T')).reduce((s,x)=>s+x.netWeight,0);
  items.push({name:'下端',mass:endMass('bottom'),y:f.bottomTangent-endCentroid(r.ends.bottom)},{name:'上端',mass:endMass('top'),y:f.topTangent+endCentroid(r.ends.top)});
  for(const n of r.nozzlePlan?.items??[])items.push({name:n.id,mass:n.pipeWeight+(n.end==='bare'?0:n.flangeWeight),y:(n.pipeStart[1]+n.face[1])/2});
  if(att){
    const g=att.supports?.geometry??{},type=att.supports?.type,groupMass=group=>(group?.bom??[]).reduce((s,x)=>s+x.weight,0),add=(name,mass,y)=>{if(mass>0&&Number.isFinite(y))items.push({name,mass,y});};
    // Support elevation by type (axial frame; horizontal saddles sit at mid-length on average).
    const supportY={legs:(g.top+g.floor)/2,lugs:g.elevation+g.height/2,skirt:(f.bottomTangent+g.floor)/2,anchors:f.bottomTangent+g.height/2,saddles:f.bottomTangent+r.height/2}[type];
    add('支撐',groupMass(att.supports),supportY);
    add('加強圈',groupMass(att.rings),att.rings.items.length?att.rings.items.reduce((s,x)=>s+x.elevation*x.weight,0)/Math.max(1e-9,att.rings.items.reduce((s,x)=>s+x.weight,0)):f.bodyTop);
    add('梯台',groupMass(att.access),vertical?(att.floor+att.top)/2:f.bodyBottom+r.bodyHeight/2);
    add('夾套',groupMass(att.jacket),f.bodyBottom+((att.jacket.geometry?.from??0)+(att.jacket.geometry?.to??r.bodyHeight))/2);
    add('內件',groupMass(att.internals),f.bodyBottom+r.bodyHeight/2);
    add('吊耳',groupMass(att.lifting),vertical?f.bodyTop:f.bottomTangent+r.height/2);
    for(const line of att.misc?.bom??[])add(line.name,line.weight,line.name==='集水坑'?-(att.misc.geometry.sump?.depth??0)/2:vertical?f.bodyBottom+Math.min(1500,r.bodyHeight*.6):f.bottomTangent+r.height/2);
    add('補強板',att.pads.weight,f.bodyBottom+r.bodyHeight/2);add('人孔蓋',att.manholes.weight,f.bodyBottom+r.bodyHeight/3);
  }
  const mass=items.reduce((s,x)=>s+x.mass,0),y=mass?items.reduce((s,x)=>s+x.mass*x.y,0)/mass:0;
  // Operating liquid centroid. Vertical: integrate the level–volume relation; horizontal: cylinder plus each end's axial moment.
  const level=levelForVolume(r,r.workingVolume),liquid=r.workingVolume*liquidDensity(r.input);let ly=0;
  if(vertical){const n=240,base=f.bottomTangent-r.ends.bottom.depth;let prev=0,mom=0;for(let i=1;i<=n;i++){const yy=level*i/n,v=volumeAtLevel(r,yy);mom+=(v-prev)*(base+level*(i-.5)/n);prev=v;}ly=prev?mom/prev:base;}
  else{const ri=r.di/2,H=Math.min(level,r.di),cyl=r.height*segmentArea(ri,H),vb=horizontalEndVolume(r.ends.bottom,H),vt=horizontalEndVolume(r.ends.top,H),total=cyl+vb+vt;
    ly=total>0?(cyl*(f.bottomTangent+r.height/2)+vb*f.bottomTangent-horizontalEndMoment(r.ends.bottom,H)+vt*f.topTangent+horizontalEndMoment(r.ends.top,H))/total:f.bottomTangent+r.height/2;}
  const total=mass+liquid,operating=total?(mass*y+liquid*ly)/total:y;
  return {items,empty:{mass,y},operating:{mass:total,y:operating},liquidY:ly,axis:vertical?'由最低點往上':'由 A 端往 B 端'};
}
/** Outward radial reach of the vessel and the attachments welded to it (nozzles, supports, rings, jackets, flat-end overhang). */
export function vesselReach(r,att){
  const ro=r.od/2,out=[],push=(name,v)=>{if(Number.isFinite(v))out.push([name,v]);};
  for(const n of r.nozzlePlan?.items??[])if(n.host==='shell')push('管嘴',ro+n.projection);
  if(['top','bottom'].some(w=>r.endTypes[w]==='flat'))push('平板外伸',ro+(Number(r.input.overhang)||0));
  const s=att?.supports,g=s?.geometry??{};
  if(s?.type==='legs')push('支腿',g.radius+Math.max(g.size/2,g.base/2));
  if(s?.type==='lugs')push('耳座',ro+g.projection);
  if(s?.type==='skirt')push('基礎環',g.ringOut);
  if(s?.type==='anchors')push('錨固座',ro+g.top);
  for(const x of att?.rings?.items??[])if(x.side==='out')push('加強圈',ro+x.a);
  const j=att?.jacket,jg=j?.geometry??{};
  if(j?.type==='full')push('夾套',jg.id/2+jg.thickness);if(j?.type==='halfpipe')push('半管夾套',ro+jg.pipeOD/2);
  return out;
}
export function erectionPlan(r,att,surface){
  const p=r.input,e=r.methods.erection,out={method:e.method,warnings:[],stages:[]},vertical=r.orientation==='vertical';
  const courseWeight=r.parts[0].netWeight/r.courses,roof=r.parts.filter(x=>(x.ends??[]).includes('top')||x.id.startsWith('T')).reduce((s,x)=>s+x.netWeight/((x.ends?.length)||1),0)+(att?.rings.items.filter(x=>x.purpose==='curb').reduce((s,x)=>s+x.weight,0)??0);
  const pieces=[...r.parts,...(r.attachmentParts??[])].flatMap(part=>part.pieces?part.pieces.map(x=>x.blankWeight??0):Array.from({length:part.quantity},()=>part.kind==='formed'?part.unitWeight??0:(part.blankWeight??0)/part.quantity));
  out.maxPiece=Math.max(0,...pieces);
  // Radial envelope: shell + insulation and every outward projection (only finite values; a support plan with an issue adds none).
  const insulation=surface?.insulation?.thickness??0,reach=vesselReach(r,att);
  const acc=att?.access?.geometry??{},push=(name,v)=>{if(Number.isFinite(v))reach.push([name,v]);};
  if(acc.ladder)push(acc.ladder.cage?'直梯護籠':'直梯',r.od/2+acc.ladder.standoff+(acc.ladder.cage?800:100));
  if(acc.platform)push('平台',r.od/2+acc.platform.width+50);
  if(acc.stair)push('盤梯',acc.stair.outer+50);
  const radial=Math.max(r.od/2+insulation,...reach.map(x=>x[1])),governing=reach.filter(x=>x[1]>=radial-1e-6).map(x=>x[0]);
  out.envelope={width:2*radial,height:vertical?2*radial:2*radial+(r.methods.supports.type==='saddles'?r.methods.supports.clearance:0),length:vertical?r.totalHeight+(['legs','skirt'].includes(r.methods.supports.type)?(r.methods.supports.type==='legs'?r.methods.supports.clearance:Math.max(0,(att?.supports?.geometry?.height??0)-r.frame.bottomTangent)):0):r.totalHeight,weight:att?.emptyWeight??r.netWeight,governing,radial};
  if(e.method==='shop'){
    const over=[['寬',out.envelope.width,e.transportWidth],['高',out.envelope.height,e.transportHeight],['長',out.envelope.length,e.transportLength]].filter(([,v,limit])=>v>limit);
    out.transport={over:over.map(([name,v,limit])=>({name,value:v,limit})),fits:!over.length};
    const access=governing.filter(x=>['直梯','直梯護籠','平台','盤梯'].includes(x));
    if(over.length)out.warnings.push(`整槽運送超出可運尺寸：${over.map(([name,v,limit])=>`${name} ${v.toFixed(0)} > ${limit} mm`).join('、')}${governing.length&&over.some(([name])=>name!=='長')?`（寬度由${governing.join('、')}外伸決定）`:''}；${access.length?`${access.join('、')}可改現場安裝，或`:''}改現場組立、分段運送。`);
    out.stages=['下料與捲板','組立筒身','組立端部','接管與附件','焊接與檢驗','試壓','表面處理','裝車運送'].map(label=>({label}));
  }
  if(e.method==='bottomup'){out.stages=[{label:'鋪底板',weight:r.parts.filter(x=>(x.ends??[]).includes('bottom')||x.id.startsWith('B')).reduce((s,x)=>s+x.netWeight/((x.ends?.length)||1),0)},...Array.from({length:r.courses},(_,i)=>({label:`第 ${i+1} 圈`,weight:courseWeight})),{label:'頂部',weight:roof}];out.notes='由下往上逐圈吊裝，需外側腳手架或爬升平台；吊車依最重單片選用。';}
  if(e.method==='jacking'||e.method==='airlift'){
    if(!vertical)out.warnings.push('倒裝法用於立式現場組立槽。');
    if(r.endTypes.top==='open')out.warnings.push('開口槽沒有頂部可頂升；倒裝前需先裝頂部或加臨時頂圈。');
    // Top course and roof are built at ground level; each lift raises everything above the next course to be added.
    const stages=[{label:`地面組立第 ${r.courses} 圈＋頂部`,weight:0,course:r.courses}];let lifted=roof+courseWeight;
    for(let k=r.courses-1;k>=1;k--){stages.push({label:`頂升後裝第 ${k} 圈`,weight:lifted,course:k});lifted+=courseWeight;}
    out.stages=stages;const max=Math.max(0,...stages.map(s=>s.weight));out.maxLift=max;
    if(r.courses<2)out.warnings.push('只有 1 圈筒身，倒裝法不需頂升。');
    if(e.method==='jacking'){const byLoad=Math.ceil(max*e.jackFactor/(e.jackCapacity*1000)),bySpacing=Math.ceil(PI*r.od/e.jackSpacing);out.jacks={byLoad,bySpacing,count:Math.max(3,byLoad,bySpacing),capacity:e.jackCapacity,factor:e.jackFactor};}
    else{const pa=max*G*e.jackFactor/(PI*(r.di/2/1000)**2);out.air={pressure:pa/1000,mmH2O:pa/G,factor:e.jackFactor};out.warnings.push('充氣頂升需密封底部與筒身間隙、配置平衡導向與限位；壓力為重量換算的最低值。');}
  }
  return out;
}
// ---------------------------------------------------------------- cutting and bevel preparation
const perimeter=points=>{let s=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];s+=Math.hypot(b[0]-a[0],b[1]-a[1]);}return s;};
/** Ramanujan's ellipse perimeter for semi-axes a, b. */
export const ellipsePerimeter=(a,b)=>PI*(3*(a+b)-Math.sqrt((3*a+b)*(a+3*b)));
/** Thermal cutting length of one blank: the outline offset by the trim (or the blank rectangle / circle) plus inner holes. */
export function blankCut(piece,trim,kind){
  if(kind==='circle')return {outer:PI*piece.d,holes:0,contours:1};
  const outer=piece.outline?perimeter(piece.outline)+2*PI*trim:2*(piece.w+piece.h),holes=(piece.holes??[]).reduce((s,h)=>s+perimeter(h),0);
  return {outer,holes,contours:1+(piece.holes?.length??0)};
}
export function cuttingPlan(r,att,weld){
  const p=r.input,c=r.methods.cutting,rows=[],trim=p.trim;
  for(const part of [...r.parts,...(r.attachmentParts??[])]){
    if(part.kind==='formed')continue;
    let length=0,contours=0,pieces=0;
    if(part.pieces)for(const piece of part.pieces){const cut=blankCut(piece,trim);length+=cut.outer+cut.holes;contours+=cut.contours;pieces++;}
    else if(part.kind==='circle'){const d=part.blankDiameter||part.width;length=PI*d*part.quantity;contours=pieces=part.quantity;}
    else{length=2*(part.width+part.height)*part.quantity;contours=pieces=part.quantity;}
    rows.push({id:part.id,name:part.name,t:part.thickness,pieces,contours,length});
  }
  // Openings cut into the shell and ends after rolling / forming (nozzle holes, sump hole).
  const holes=[];
  for(const n of r.nozzlePlan?.items??[])holes.push({id:n.id,length:n.host==='shell'?ellipsePerimeter(n.holeWidth/2,n.hole/2):PI*n.hole});
  const sump=att?.misc?.geometry?.sump;if(sump)holes.push({id:'集水坑',length:PI*sump.hole});
  const skirt=att?.supports?.type==='skirt'?att.supports.geometry:null;for(let i=0;i<(skirt?.openings??0);i++)holes.push({id:'裙座檢查孔',length:PI*skirt.openingDiameter});
  if(holes.length)rows.push({id:'孔',name:'接管開孔（成形後開孔）',t:null,pieces:0,contours:holes.length,length:holes.reduce((s,h)=>s+h.length,0)});
  const total=rows.reduce((s,x)=>s+x.length,0),pierces=rows.reduce((s,x)=>s+x.contours,0);
  // Bevel edges: both plate edges of a V or X butt joint; nozzle-to-flange butt welds bevel the pipe end only.
  const bevel={single:0,double:0,pipe:0};
  for(const seam of weld?.seams??[]){if(seam.kind!=='butt'||!seam.groove||seam.groove.type==='I')continue;if(seam.group==='nozzle'){bevel.pipe+=seam.length;continue;}if(seam.groove.type==='V')bevel.single+=2*seam.length;else bevel.double+=2*seam.length;}
  const bevelLength=bevel.single+bevel.double+bevel.pipe;
  // Saw cuts for sections and pipes: rolled rings in segments, bar items in the attachment list, nozzle pipes (two ends).
  // Ladder, stair and rail bars and support legs are cut to length one piece each; rolled rings once per segment;
  // jacket pipes once per stock length used (half-pipes are also split lengthwise, counted with the pipes).
  const pieces=group=>(group?.bom??[]).filter(b=>b.length>0).reduce((s,b)=>s+b.qty,0),jg=att?.jacket?.geometry??{},stock=r.methods.jacket.stockLength;
  const jacketPipes=att?.jacket?.type==='halfpipe'?Math.ceil(jg.length/(2*stock)):att?.jacket?.type==='coil'?Math.ceil(jg.length/stock):0;
  const bars=pieces(att?.access)+pieces(att?.supports)+(att?.rings.items??[]).reduce((s,x)=>s+(x.segments??0),0)+jacketPipes,pipeEnds=2*(r.nozzlePlan?.items.length??0);
  const out={method:c.method,rows,holes,total,pierces,bevel,bevelLength,bars,pipeEnds,notes:[]};
  if(c.speed>0){out.cutHours=total/c.speed/60+(c.pierce>0?pierces*c.pierce/3600:0);}
  if(c.bevel!=='cut'&&c.bevelSpeed>0)out.bevelHours=bevelLength/c.bevelSpeed/60;
  out.notes.push('切割長度以每件下料外框（含留料）加內孔估；沿用原板邊或共邊切割可再扣除，成形後修邊另計。');
  if(c.bevel==='cut')out.notes.push('同步斜割時坡口邊以斜割速度計（通常比直割慢），依機台切割表。');
  const stainless=r.methods.heat.material==='ss'||/SUS|STS|304|316|不鏽|不銹/i.test(String(p.material??''));
  if(c.method==='oxy'&&stainless)out.warnings=['不鏽鋼不能用火焰切割（氧化物熔點高、無法燃燒切割），請改電漿、雷射或水刀。'];
  out.warnings??=[];
  return out;
}
// ---------------------------------------------------------------- preheat and post-weld heat treatment
/** ASME VIII-1 UCS-56 P-No.1 holding time (h) for a governing thickness t mm. */
export function pwhtHoldHours(t){const inch=t/25.4;return inch<=2?Math.max(.25,inch):2+.25*(inch-2);}
/** UCS-56(d) maximum heating / cooling rates above 425 °C, °C/h, for the thickest shell or head plate. */
export function pwhtRates(t){const inch=Math.max(t/25.4,1e-9);return {heat:Math.max(56,Math.min(222,222/inch)),cool:Math.max(56,Math.min(278,278/inch))};}
export function heatPlan(r,att,weld){
  const p=r.input,h=r.methods.heat,ends=['top','bottom'].filter(w=>r.endTypes[w]!=='open'),t=Math.max(p.shellThickness,...ends.map(w=>r.ends[w].t)),out={material:h.material,t,notes:[],warnings:[],openings:[]};
  const reference=p.code==='asme'?'':'（以 ASME UCS-56 作參考）';
  let need=null,reason;
  if(h.material==='p1'){
    if(t>38){need=true;reason=`最厚板 ${t} mm > 38 mm：P-No.1 需 PWHT${reference}`;}
    else if(t>32){need=h.preheat<95;reason=need?`最厚板 ${t} mm 在 32～38 mm 且未預熱 ≥ 95 °C：需 PWHT${reference}`:`最厚板 ${t} mm 在 32～38 mm，預熱 ${h.preheat} °C ≥ 95 °C：可免 PWHT${reference}`;}
    else{need=false;reason=`最厚板 ${t} mm ≤ 32 mm：依板厚不需 PWHT${reference}`;}
  }else if(h.material==='ss'){need=false;reason='沃斯田鐵不鏽鋼（P-No.8）一般不要求 PWHT（ASME UHA-32）';}
  else reason='其他材質：是否需 PWHT 依 WPS 與規範';
  if(p.code==='api650'&&h.material==='p1'){
    need=false;reason='API 650 儲槽一般不做整槽 PWHT；厚板大開孔組件另做消除應力';
    for(const n of r.nozzlePlan?.items??[])if(n.host==='shell'&&n.od>=323.8&&p.shellThickness>25)out.openings.push(n.id);
    if(out.openings.length)out.warnings.push(`${out.openings.join('、')}：筒身板厚 > 25 mm 且開孔 ≥ NPS 12，開孔組件需預製後消除應力（API 650 5.7.4，600～650 °C、每 25 mm 1 h；依版次確認）。`);
  }
  // One rule decides both this plan and which PWHT inputs the method panel shows.
  need=pwhtRequired(h,methodContext(r));
  out.need=need;out.reason=reason;out.perform=h.pwht==='yes'||h.pwht==='auto'&&need===true;
  if(h.pwht==='no'&&need===true)out.warnings.push('依板厚需 PWHT，目前設定「不做」；請確認規範豁免或改為要做。');
  if(h.preheat>0)out.notes.push(`預熱 ${h.preheat} °C：焊前與層間溫度依 WPS 量測（距坡口兩側各 75 mm 範圍常用作量測區）。`);
  else if(h.material==='p1'&&t>25)out.notes.push('板厚 > 25 mm：含碳量 > 0.30% 時，ASME 附錄 R 建議預熱 80 °C（非強制，以 WPS 為準）。');
  if(!out.perform)return out;
  const rates=pwhtRates(t),hold=pwhtHoldHours(t),T=h.holdTemp,load=425,up=(T-load)/rates.heat,down=(T-load)/rates.cool;
  out.cycle={load,hold:T,holdHours:hold,heatRate:rates.heat,coolRate:rates.cool,upHours:up,downHours:down,controlled:up+hold+down};
  if(h.material==='ss')out.warnings.push('不鏽鋼做熱處理：溫度與時間依材料規格與 WPS；425～870 °C 停留過久會敏化，請確認需求。');
  if(h.material==='p1'&&T<595)out.warnings.push(`持溫 ${T} °C 低於 P-No.1 最低 595 °C；需依 UCS-56.1 延長持溫（例如 565 °C 每 25 mm 2 h）。`);
  // Vessel envelope inside the furnace: tank lying down, nozzles and support lugs included; ladders and platforms are fitted after PWHT.
  const ro=r.od/2,reach=[ro,...vesselReach(r,att).map(x=>x[1])];
  const vertical=r.orientation==='vertical',below=vertical&&att?.supports?.type==='skirt'?Math.max(0,(Number(att.supports.geometry.height)||0)-r.frame.bottomTangent):vertical&&att?.supports?.type==='legs'?r.methods.supports.clearance:0;
  const size={length:r.frame.total+below,diameter:2*Math.max(...reach)};out.size=size;
  if(h.method==='local'){
    const seams=(weld?.seams??[]).filter(s=>s.kind==='butt'&&(s.name==='筒身環縫'||/－筒身對接/.test(s.name)));
    const width=Math.max(...seams.map(s=>s.groove?.faceWidth??10),10),band=width+2*Math.min(t,50);
    out.local={seams:seams.map(s=>({name:s.name,length:s.length,count:s.count??1})),band,length:seams.reduce((s,x)=>s+x.length,0)};
    out.notes.push(`局部 PWHT：持溫帶 = 焊道最寬 ${width.toFixed(0)} mm ＋ 兩側各 min(t, 50) mm = ${band.toFixed(0)} mm（UW-40）；加熱帶與保溫帶寬依熱處理程序。`);
  }else{
    const L=h.furnaceLength,W=h.furnaceWidth,H=h.furnaceHeight,given=L>0&&W>0&&H>0;out.furnace={L,W,H,given};
    if(given){const fitsSection=size.diameter<=Math.min(W,H),fitsLength=size.length<=L;
      out.furnace.fitsSection=fitsSection;out.furnace.fitsLength=fitsLength;
      if(!fitsSection)out.warnings.push(`槽體外徑（含管嘴）Ø${size.diameter.toFixed(0)} 大於爐口 ${W} × ${H} mm；改局部加熱或確認爐子。`);
      else if(!fitsLength){
        if(h.method==='sections'&&L>1500){out.furnace.heats=Math.ceil((size.length-1500)/(L-1500));out.notes.push(`分段入爐 ${out.furnace.heats} 次，每次重疊 ≥ 1.5 m，爐外部分需保溫遮蔽以控制溫度梯度（UW-40(a)(2)）。`);}
        else out.warnings.push(`槽長 ${size.length.toFixed(0)} mm 超過爐長 ${L} mm；改「分段入爐」（重疊 ≥ 1.5 m）或局部加熱。`);
      }else out.furnace.heats=1;
    }else out.notes.push('未填爐內尺寸：入爐前確認爐口與爐長（槽體連管嘴外伸）。');
  }
  out.notes.push(`升溫：425 °C 以上 ≤ ${rates.heat.toFixed(0)} °C/h（222 °C/h ÷ 最厚板英吋數，上限 222、可不低於 56）；降溫：≤ ${rates.cool.toFixed(0)} °C/h（278 ÷ 英吋數、可不低於 56；板厚 < 25 mm 時本工具仍取 278 °C/h，偏保守）；入爐與出爐爐溫 ≤ 425 °C（UCS-56(d)）。`,
    `持溫：${(hold*60).toFixed(0)} 分鐘（P-No.1：≤ 50 mm 每 25 mm 1 h、最少 15 分；> 50 mm 為 2 h ＋ 超過 50 mm 每 25 mm 加 15 分）。`,
    '升溫期間任 4.6 m 長度內溫差 ≤ 140 °C；持溫期間最高與最低溫差 ≤ 83 °C（依版次確認）。','PWHT 需在水壓試驗前完成；PWHT 後不再於受壓件上焊接。');
  return out;
}
/** Runs every process plan for an estimate with planned attachments. */
export function planProcess(r,att){
  const weld=weldPlan(r,att),surface=surfacePlan(r,att);
  return {weld,cutting:cuttingPlan(r,att,weld),heat:heatPlan(r,att,weld),tolerances:tolerancePlan(r),test:testPlan(r,att,weld),surface,strapping:strappingTable(r),cg:centreOfGravity(r,att),erection:erectionPlan(r,att,surface)};
}
