// Attachment fabrication estimates: geometry, cut lists and weights for supports, rings, access, jackets, internals,
// lifting lugs, reinforcing pads and manhole covers. Loads are plain statics for planning; no strength design is done.
import {sectorLayout,polygonArea} from './tank-layouts.js';
export const G=9.80665;
const PI=Math.PI,rad=d=>d*PI/180;
// angle(a, t, b): legs a and b (b defaults to a for equal angles).
export const sectionArea={pipe:(D,t)=>PI*(D*D-(D-2*t)**2)/4,angle:(a,t,b=a)=>t*(a+b-t),flat:(w,t)=>w*t,channel:(h,b,t)=>t*(h+2*b-2*t),round:d=>PI*d*d/4};
const kgm=(area,rho)=>area*rho/1e6;
const plateKg=(area,t,rho)=>area*t*rho/1e9;
/** Distance from the shell surface to the section centroid, for the ring's rolling (neutral) radius.
 *  flat: bar standing out a; channel: web a against the shell, flanges b projecting; angle: leg b against the shell, leg a projecting. */
export function sectionOffset(section,a,b,t){
  if(section==='flat')return a/2;
  if(section==='channel'){const web=a*t,flange=(b-t)*t;return (web*t/2+2*flange*(t+(b-t)/2))/(web+2*flange);}
  const shellLeg=(b>0?b:a)*t,rest=(a-t)*t;return (shellLeg*t/2+rest*(t+(a-t)/2))/(shellLeg+rest);
}
/** Liquid density for loads: the recorded design value, else water. */
export function liquidDensity(p){const v=Number(p.liquidDensity);return String(p.liquidDensity??'').trim()!==''&&Number.isFinite(v)&&v>0?v:1000;}
function bomLine(name,spec,qty,unit,eachKg,extra={}){return {name,spec,qty,unit,each:eachKg,weight:qty*eachKg,...extra};}
// Developed outline of a pad on a cylinder: the pad edge is the cylinder of radius Rp around the nozzle axis,
// unrolled on the pad's neutral radius rn: s = rn·asin(Rp·cosψ / rn), v = Rp·sinψ.
export function padOutline(Rp,Rh,rn,steps=72){
  const ring=(R,dir)=>Array.from({length:steps+1},(_,i)=>{const psi=(dir>0?i:steps-i)/steps*2*PI;return [rn*Math.asin(Math.max(-1,Math.min(1,R*Math.cos(psi)/rn))),R*Math.sin(psi)];});
  return {outer:ring(Rp,1),inner:ring(Rh,-1)};
}
function padPlan(r){
  const p=r.input,rho=p.density,items=[];
  for(const n of r.nozzlePlan?.items??[]){if(!(n.padRadius>0))continue;
    const t=n.padThickness,holeR=n.od/2+1.5,shell=n.host==='shell';
    const shape=shell?padOutline(n.padRadius,holeR,r.od/2+t/2):{outer:Array.from({length:73},(_,i)=>[n.padRadius*Math.cos(i/72*2*PI),n.padRadius*Math.sin(i/72*2*PI)]),inner:Array.from({length:73},(_,i)=>[holeR*Math.cos(-i/72*2*PI),holeR*Math.sin(-i/72*2*PI)])};
    const area=polygonArea(shape.outer)-polygonArea(shape.inner),xs=shape.outer.map(q=>q[0]),ys=shape.outer.map(q=>q[1]),w=Math.max(...xs)-Math.min(...xs),h=Math.max(...ys)-Math.min(...ys);
    items.push({id:n.id,name:n.name,host:n.host,t,od:2*n.padRadius,hole:2*holeR,w,h,area,outline:shape,weight:plateKg(area,t,rho),rollRadius:shell?r.od/2:null,weld:{outer:PI*2*n.padRadius,inner:PI*n.od,leg:Math.min(t,n.hostThickness)}});
  }
  return items;
}
function manholePlan(r){
  const p=r.input,rho=p.density;
  return (r.nozzlePlan?.items??[]).filter(n=>n.kind==='manhole'&&n.end!=='bare').map(n=>{const t=n.coverThickness>0?n.coverThickness:n.flangeThickness,cover=plateKg(PI*n.flangeOD**2/4,t,rho),arm=n.davit==='davit'?kgm(sectionArea.round(Math.max(25,n.flangeOD/20)),rho)*(n.flangeOD*1.6)/1000:n.davit==='hinge'?plateKg(150*120*2,Math.max(12,t/2),rho):0;
    return {id:n.id,name:n.name,diameter:n.flangeOD,coverThickness:t,coverWeight:cover,davit:n.davit,davitWeight:arm,handles:2,weight:cover+arm};});
}
const anglesFrom=(start,count)=>Array.from({length:count},(_,i)=>(start+i*360/count)%360);
function supportPlan(r,loads){
  const p=r.input,s=r.methods.supports,rho=p.density,f=r.frame,ro=r.od/2,vertical=r.orientation==='vertical',out={type:s.type,bom:[],plates:[],welds:[],warnings:[],issues:[],notes:[],geometry:{}};
  if(s.type==='none'){
    if(!vertical)out.warnings.push('臥式槽需要鞍座支撐；請在支撐選「鞍座」。');
    else if(r.endTypes.bottom!=='flat')out.warnings.push('底部為錐形或封頭，槽體不能直接座落；請加支腿、耳座或裙座。');
    return out;
  }
  const field=key=>'methods.supports.'+key,issue=(key,message)=>out.issues.push({field:field(key),message});
  if(!vertical&&s.type!=='saddles')issue('type','臥式槽請選鞍座；支腿、耳座、裙座與錨固座用於立式槽。');
  if(vertical&&s.type==='saddles')issue('type','鞍座用於臥式槽；立式槽請選支腿、耳座、裙座或錨固座。');
  if(out.issues.length)return out;
  const per=n=>({operating:loads.operating/n,test:loads.test/n});
  if(s.type==='legs'){
    const section=s.legSection,size=s.legSize,t=s.legThickness,area=section==='pipe'?sectionArea.pipe(size,t):sectionArea.angle(size,t);
    if(section==='pipe'&&2*t>=size)issue('legThickness','管厚需小於外徑的一半。');
    if(section==='angle'&&t>=size)issue('legThickness','角鋼厚需小於邊寬。');
    if(out.issues.length)return out;
    const length=f.bodyBottom+s.attach+s.clearance,angles=anglesFrom(s.startAngle,s.count),radius=ro+(section==='pipe'?size/2:size*.29);
    if(s.attach>r.bodyHeight)issue('attach','支腿搭接長超過筒身高度。');
    const base=Math.max(size+100,150),padW=size+100,padH=s.attach+100;
    out.bom.push(bomLine('支腿',section==='pipe'?`鋼管 Ø${size} × ${t}`:`角鋼 L${size} × ${size} × ${t}`,s.count,'支',kgm(area,rho)*length/1000,{length}));
    out.bom.push(bomLine('支腿底板',`${base} × ${base} × ${s.plateThickness}`,s.count,'片',plateKg(base*base,s.plateThickness,rho)));
    out.bom.push(bomLine('支腿墊板（筒身）',`${padW} × ${padH} × ${p.shellThickness}（捲 R${(ro).toFixed(0)}）`,s.count,'片',plateKg(padW*padH,p.shellThickness,rho)));
    out.plates.push({id:'LB',name:'支腿底板',t:s.plateThickness,pieces:angles.map(()=>({w:base,h:base,area:base*base}))},{id:'LP',name:'支腿墊板',t:p.shellThickness,pieces:angles.map(()=>({w:padW,h:padH,area:padW*padH}))});
    out.welds.push({name:'支腿－墊板',kind:'fillet',leg:Math.min(t,p.shellThickness),length:s.count*(2*s.attach+(section==='pipe'?PI*size/2:size))},{name:'墊板－筒身',kind:'fillet',leg:p.shellThickness,length:s.count*2*(padW+padH)},{name:'支腿－底板',kind:'fillet',leg:Math.min(t,s.plateThickness),length:s.count*(section==='pipe'?PI*size:2*size)});
    if(r.endTypes.bottom==='flat'&&p.overhang>0)out.warnings.push(`平底外伸 ${p.overhang} mm 會頂到支腿；支腿需避開底板外伸，或把外伸改小。`);
    out.geometry={angles,radius,length,top:f.bodyBottom+s.attach,floor:-s.clearance,size,section,base};
    out.loads=per(s.count);
    out.summary=`${s.count} 支腿，每支 ${(length/1000).toFixed(2)} m`;
    return out;
  }
  if(s.type==='lugs'){
    const elevation=s.lugElevation>0?s.lugElevation:r.bodyHeight*2/3,angles=anglesFrom(s.startAngle,s.count),t=s.plateThickness;
    if(elevation>r.bodyHeight)issue('lugElevation','耳座高度超出筒身。');
    const gusset=s.lugHeight*s.lugProjection*.6,padW=s.lugWidth+100,padH=s.lugHeight+100;
    out.bom.push(bomLine('耳座底板',`${s.lugProjection} × ${s.lugWidth} × ${t}`,s.count,'片',plateKg(s.lugProjection*s.lugWidth,t,rho)),bomLine('耳座筋板',`${s.lugProjection} × ${s.lugHeight} × ${t}（斜切）`,2*s.count,'片',plateKg(gusset,t,rho)),bomLine('耳座墊板',`${padW} × ${padH} × ${p.shellThickness}`,s.count,'片',plateKg(padW*padH,p.shellThickness,rho)));
    out.plates.push({id:'GB',name:'耳座底板',t,pieces:angles.map(()=>({w:s.lugProjection,h:s.lugWidth,area:s.lugProjection*s.lugWidth}))},{id:'GR',name:'耳座筋板',t,pieces:angles.flatMap(()=>[0,1].map(()=>({w:s.lugProjection,h:s.lugHeight,area:gusset})))},{id:'GP',name:'耳座墊板',t:p.shellThickness,pieces:angles.map(()=>({w:padW,h:padH,area:padW*padH}))});
    out.welds.push({name:'耳座板件',kind:'fillet',leg:t,length:s.count*(2*s.lugHeight+2*s.lugProjection+s.lugWidth)*2},{name:'墊板－筒身',kind:'fillet',leg:p.shellThickness,length:s.count*2*(padW+padH)});
    out.geometry={angles,elevation:f.bodyBottom+elevation,projection:s.lugProjection,width:s.lugWidth,height:s.lugHeight};
    out.loads=per(s.count);out.summary=`${s.count} 只耳座，距筒身下緣 ${elevation.toFixed(0)} mm`;
    out.notes.push('耳座偏心造成的筒壁局部應力未計算；載荷與補強依設計。');
    return out;
  }
  if(s.type==='skirt'){
    const ts=s.skirtThickness>0?s.skirtThickness:p.shellThickness,height=s.skirtHeight,floor=f.bottomTangent-height;
    if(floor>-1e-9)issue('skirtHeight',`裙座高需大於下端外凸深度 ${f.bottomTangent.toFixed(0)} mm，槽底才會離地。`);
    if(out.issues.length)return out;
    if(r.endTypes.bottom==='flat')out.warnings.push('平底槽通常直接座落基礎；裙座多用於封頭或錐底槽。');
    const mean=r.od-ts,circ=PI*mean,panelLen=p.stockLength-2*p.trim,panels=Math.ceil(circ/panelLen),courseH=p.stockWidth-2*p.trim,courses=Math.ceil(height/courseH);
    const pw=circ/panels+2*p.trim,ph=height/courses+2*p.trim,ringIn=r.od/2-ts-s.ringInside,ringOut=r.od/2+s.ringOutside,bt=Math.max(s.plateThickness,20);
    const ring=sectorLayout({rhoIn:ringIn,rhoOut:ringOut,theta:360,stockWidth:p.stockWidth,stockLength:p.stockLength,trim:p.trim,bands:1});
    if(!ring.valid)issue('ringOutside','基礎環分片放不進原板：'+ring.reason);
    if(out.issues.length)return out;
    const skirtArea=circ*height-s.openings*PI*s.openingDiameter**2/4;
    out.bom.push(bomLine('裙座筒板',`${panels * courses} 片 · t${ts}`,1,'組',plateKg(skirtArea,ts,rho)),bomLine('基礎環',`Ø${(2*ringOut).toFixed(0)}／Ø${(2*ringIn).toFixed(0)} × ${bt}（${ring.pieces.length} 片）`,1,'組',plateKg(PI*(ringOut**2-ringIn**2),bt,rho)));
    const chairW=s.boltDiameter*3+2*s.plateThickness,chairGusset=s.chairHeight*s.ringOutside*.6;
    out.bom.push(bomLine('地腳螺栓座（壓板＋2 筋板）',`螺栓 M${s.boltDiameter}`,s.boltCount,'組',plateKg(s.ringOutside*chairW,s.plateThickness,rho)+2*plateKg(chairGusset,s.plateThickness,rho)),bomLine('地腳螺栓',`M${s.boltDiameter}`,s.boltCount,'支',0));
    if(s.openings)out.bom.push(bomLine('裙座檢查孔',`Ø${s.openingDiameter}（加強圈另依圖）`,s.openings,'處',0));
    out.plates.push({id:'KS',name:'裙座筒板',t:ts,pieces:Array.from({length:panels*courses},()=>({w:pw,h:ph,area:(pw-2*p.trim)*(ph-2*p.trim)}))},{id:'KR',name:'基礎環',t:bt,pieces:ring.pieces.map(x=>({w:x.w+2*p.trim,h:x.h+2*p.trim,outline:x.outline,area:x.area}))},{id:'KC',name:'螺栓座板',t:s.plateThickness,pieces:Array.from({length:s.boltCount*3},(_,i)=>i%3===0?{w:s.ringOutside,h:chairW,area:s.ringOutside*chairW}:{w:s.ringOutside,h:s.chairHeight,area:chairGusset})});
    out.welds.push({name:'裙座－下端',kind:'fillet',leg:ts,length:PI*r.od},{name:'裙座縱縫',kind:'butt',t:ts,length:panels*height},...(courses>1?[{name:'裙座環縫',kind:'butt',t:ts,length:(courses-1)*circ}]:[]),{name:'裙座－基礎環',kind:'fillet',leg:ts,length:2*PI*mean},{name:'螺栓座',kind:'fillet',leg:s.plateThickness,length:s.boltCount*(2*s.chairHeight+2*s.ringOutside)*2});
    out.geometry={height,thickness:ts,floor,ringIn,ringOut,bolts:anglesFrom(s.startAngle,s.boltCount),boltCircle:(ringIn+ts+ringOut)/2+s.ringOutside*.15,openings:s.openings,openingDiameter:s.openingDiameter,ring};
    out.loads={operating:loads.operating,test:loads.test,bearing:loads.operating*1000/(PI*(ringOut**2-ringIn**2))};
    out.summary=`裙座高 ${height.toFixed(0)} mm · ${s.boltCount} 支地腳螺栓`;
    return out;
  }
  if(s.type==='saddles'){
    const L=r.height,A=s.saddleA>0?s.saddleA:.2*L,theta=s.contactAngle,b=s.saddleWidth,t=s.plateThickness,tw=s.wearPlate?p.shellThickness:0,Rs=ro+tw,bt=Math.max(t,16);
    if(2*A>=L)issue('saddleA','鞍座位置 A 需小於切線間長的一半。');
    if(out.issues.length)return out;
    // Clearance is ground to the shell's lowest outside point; base plate and wear plate take part of it.
    const half=rad(theta/2),webW=2*Rs*Math.sin(half),hCentre=s.clearance-bt-tw,hHorn=hCentre+Rs*(1-Math.cos(half));
    if(!(hCentre>20))issue('clearance','槽底離地太低，鞍座腹板高度不足；請加大離地高度。');
    if(out.issues.length)return out;
    const arc=x=>hCentre+Rs-Math.sqrt(Math.max(0,Rs*Rs-x*x));
    const web=[[-webW/2,0],[webW/2,0],...Array.from({length:25},(_,i)=>{const x=webW/2-webW*i/24;return [x,arc(x)];}),[-webW/2,0]];web.pop();
    const webArea=polygonArea(web),ribX=Array.from({length:s.ribs},(_,i)=>-webW/2+webW*(i+.5)/s.ribs),ribs=ribX.map(x=>({w:b,h:arc(x),area:b*arc(x)}));
    const wearAngle=theta+12,wearLen=(ro+tw/2)*rad(wearAngle),wearW=b+100,baseL=webW+100;
    out.bom.push(bomLine('鞍座腹板',`${webW.toFixed(0)} × ${hHorn.toFixed(0)} × ${t}（上緣 R${Rs.toFixed(0)}）`,2,'片',plateKg(webArea,t,rho)),bomLine('鞍座筋板',`${s.ribs} 片／座 × ${t}`,2*s.ribs,'片',ribs.reduce((x,q)=>x+plateKg(q.area,t,rho),0)/s.ribs),bomLine('鞍座底板',`${baseL.toFixed(0)} × ${b} × ${bt}`,2,'片',plateKg(baseL*b,bt,rho)));
    if(s.wearPlate)out.bom.push(bomLine('鞍座墊板',`${wearLen.toFixed(0)} × ${wearW} × ${tw}（包角 ${wearAngle}°，捲 R${ro.toFixed(0)}）`,2,'片',plateKg(wearLen*wearW,tw,rho)));
    out.plates.push({id:'DW',name:'鞍座腹板',t,pieces:[0,1].map(()=>({w:webW,h:hHorn,outline:web.map(([x,y])=>[x+webW/2,y]),area:webArea}))},{id:'DR',name:'鞍座筋板',t,pieces:[...ribs,...ribs]},{id:'DB',name:'鞍座底板',t:bt,pieces:[0,1].map(()=>({w:baseL,h:b,area:baseL*b}))});
    if(s.wearPlate)out.plates.push({id:'DP',name:'鞍座墊板',t:tw,pieces:[0,1].map(()=>({w:wearLen,h:wearW,area:wearLen*wearW}))});
    // Web top (both sides along the contact arc) and rib tops weld to the wear plate, or straight to the shell without one.
    const topWeld=2*(2*Rs*rad(theta)+2*s.ribs*b);
    out.welds.push({name:'腹板／筋板／底板',kind:'fillet',leg:Math.min(t,10),length:2*(2*webW+2*ribs.reduce((x,q)=>x+q.h+q.w,0))},{name:s.wearPlate?'腹板／筋板－墊板':'腹板／筋板－筒身',kind:'fillet',leg:Math.min(t,10),length:topWeld});
    if(s.wearPlate)out.welds.push({name:'墊板－筒身',kind:'fillet',leg:tw,length:2*2*(wearLen+wearW)});
    out.geometry={A,positions:[f.bottomTangent+A,f.topTangent-A],theta,width:b,clearance:s.clearance,webW,hCentre,hHorn,Rs,wearAngle:s.wearPlate?wearAngle:0,ribs:ribX,web,baseThickness:bt,wearThickness:tw};
    out.loads=per(2);
    out.summary=`2 座鞍座 · 包角 ${theta}° · A = ${A.toFixed(0)} mm`;
    out.notes.push('鞍座處筒身應力（Zick 分析）、固定／滑動端與地腳螺栓未計算，依設計確認。');
    if(A>.2*L+1e-6)out.warnings.push(`A = ${A.toFixed(0)} mm 大於 0.2 × 切線間長，鞍座處筒身彎矩較大，請依設計確認。`);
    return out;
  }
  if(s.type==='anchors'){
    const angles=anglesFrom(s.startAngle,s.boltCount),t=s.plateThickness,top=s.boltDiameter*4,gusset=s.chairHeight*top*.6;
    if(r.endTypes.bottom!=='flat')out.warnings.push('錨固座多用於平底槽；封頭或錐底槽請改用裙座或支腿。');
    out.bom.push(bomLine('錨固座頂板',`${top} × ${top} × ${t}`,s.boltCount,'片',plateKg(top*top,t,rho)),bomLine('錨固座筋板',`${s.chairHeight} × ${top} × ${t}`,2*s.boltCount,'片',plateKg(gusset,t,rho)),bomLine('地腳螺栓',`M${s.boltDiameter}`,s.boltCount,'支',0));
    out.plates.push({id:'AC',name:'錨固座板',t,pieces:angles.flatMap(()=>[{w:top,h:top,area:top*top},{w:top,h:s.chairHeight,area:gusset},{w:top,h:s.chairHeight,area:gusset}])});
    out.welds.push({name:'錨固座',kind:'fillet',leg:t,length:s.boltCount*(2*s.chairHeight*2+2*top)});
    out.geometry={angles,height:s.chairHeight,top};
    out.loads={...per(s.boltCount),bearing:r.endTypes.bottom==='flat'?loads.operating*1000/(PI*(r.od/2+p.overhang)**2):null};
    out.summary=`${s.boltCount} 組錨固座`;
    out.notes.push('上舉力（風、地震、內壓）與螺栓尺寸未計算，依設計確認。');
    return out;
  }
  return out;
}
function ringPlan(r){
  const p=r.input,rho=p.density,ro=r.od/2,ri=r.di/2,out={items:[],bom:[],plates:[],welds:[],warnings:[],issues:[],notes:[]};
  r.methods.rings.forEach((ring,index)=>{
    const field=key=>`methods.rings.${index}.${key}`,a=ring.a,b=ring.section==='flat'?0:ring.b,t=ring.t;
    if(t>=a)out.issues.push({field:field('t'),message:`${ring.id}：厚度需小於邊寬。`});
    if(ring.section!=='flat'&&t>=b)out.issues.push({field:field('b'),message:`${ring.id}：厚度需小於另一邊寬。`});
    if(ring.purpose==='curb'&&r.endTypes.top!=='open'&&!['cone','dome','flat'].includes(r.endTypes.top))out.warnings.push(`${ring.id}：上端為封頭，頂部包邊角鋼通常用於開口、錐頂或拱頂槽。`);
    // Axial width on the shell: flat bar thickness, angle shell leg b, channel web b.
    const contact=ring.section==='flat'?t:b,position=ring.purpose==='curb'?r.bodyHeight-contact/2:ring.position;
    if(position<0||position>r.bodyHeight)out.issues.push({field:field('position'),message:`${ring.id}：位置超出筒身高度 0～${r.bodyHeight.toFixed(0)} mm。`});
    if(out.issues.length)return;
    const area=ring.section==='angle'?sectionArea.angle(a,t,b):ring.section==='channel'?sectionArea.channel(b,a,t):sectionArea.flat(a,t);
    const offset=sectionOffset(ring.section==='channel'?'channel':ring.section,ring.section==='channel'?b:a,ring.section==='channel'?a:b,t),radius=ring.side==='out'?ro+offset:ri-offset,length=2*PI*radius;
    const segments=ring.make==='plate'&&ring.section==='flat'?null:Math.ceil(length/ring.barLength),weight=kgm(area,rho)*length/1000;
    const spec=ring.section==='angle'?`L${a} × ${b} × ${t}`:ring.section==='channel'?`[${b} × ${a} × ${t}`:`FB ${a} × ${t}`;
    let plate=null;
    if(ring.make==='plate'&&ring.section==='flat'){const inner=ring.side==='out'?ro:ri-a,outer=inner+a,layout=sectorLayout({rhoIn:inner,rhoOut:outer,theta:360,stockWidth:p.stockWidth,stockLength:p.stockLength,trim:p.trim,bands:1});
      if(!layout.valid){out.issues.push({field:field('make'),message:`${ring.id}：環板分片放不進原板。`});return;}
      plate={id:'R'+(index+1),name:`${ring.id} 環板`,t,pieces:layout.pieces.map(x=>({w:x.w+2*p.trim,h:x.h+2*p.trim,outline:x.outline,area:x.area}))};out.plates.push(plate);}
    const weldFactor=ring.weld==='both'?2:1;
    const item={id:ring.id,purpose:ring.purpose,section:ring.section,spec,position,elevation:r.frame.bodyBottom+position,side:ring.side,radius,length,segments,barLength:ring.barLength,weight,offset,a,b,t,plate:!!plate,area};
    out.items.push(item);
    out.bom.push(bomLine({curb:'頂部包邊角鋼',wind:'抗風圈',stiffener:'加強圈',vacuum:'真空加強圈'}[ring.purpose]+' '+ring.id,spec+(plate?'（板材切割）':`（${segments} 段，定尺 ${ring.barLength}）`),1,'圈',weight,{length}));
    // Welded where the ring touches the shell: outside rings on the outer surface, inside rings on the inner surface.
    const contactLength=2*PI*(ring.side==='out'?ro:ri);
    out.welds.push({name:ring.id+' 加強圈',kind:'fillet',leg:Math.min(t,p.shellThickness,8),length:contactLength*weldFactor*(ring.weld==='stitch'?.5:1)*(ring.weld==='stitch'?2:1)});
    const seams=Array.from({length:r.courses-1},(_,i)=>(i+1)*(r.courseHeight+p.gap)-p.gap/2),reach=contact/2+20;
    if(ring.purpose!=='curb'&&seams.some(h=>Math.abs(h-position)<reach))out.warnings.push(`${ring.id} 與筒身環縫太近，焊縫重疊；請錯開位置。`);
    for(const n of r.nozzlePlan?.items??[])if(n.host==='shell'&&Math.abs(n.height-position)<Math.max(n.hole/2,n.padRadius||0)+reach)out.warnings.push(`${ring.id} 經過 ${n.id} 開孔／補強板範圍；請改位置或在該處斷開加強圈。`);
  });
  return out;
}
function accessPlan(r,ctx){
  const p=r.input,a=r.methods.access,rho=p.density,ro=r.od/2,out={bom:[],welds:[],warnings:[],issues:[],notes:[],geometry:{}},bars=(name,spec,area,length,count=1)=>out.bom.push(bomLine(name,spec,count,'件',kgm(area,rho)*length/1000,{length}));
  const top=ctx.top,floor=ctx.floor,rise=top-floor,vertical=r.orientation==='vertical';
  if(a.ladder){
    // Rungs over the climb; the extension above the landing carries the side rails only.
    const length=rise+a.extension,rungs=Math.floor(rise/a.rungPitch),cage=a.cage==='yes'||a.cage==='auto'&&rise>6000,brackets=Math.ceil(length/2000)+1;
    bars('直梯側板','FB 65 × 10',sectionArea.flat(65,10),length,2);bars('踏條','Ø22 圓鋼',sectionArea.round(22),a.ladderWidth+20,rungs);bars('直梯支架','FB 65 × 10',sectionArea.flat(65,10),2*(a.standoff+100),brackets);
    let cageInfo=null;if(cage){const start=Math.min(2000,rise),span=length-start,hoops=Math.ceil(span/900)+1,hoop=PI*350+700;bars('護籠環','FB 50 × 6',sectionArea.flat(50,6),hoop,hoops);bars('護籠直條','FB 50 × 6',sectionArea.flat(50,6),span,5);cageInfo={start,span,hoops};}
    const rest=Math.max(0,Math.ceil(rise/9000)-1);
    if(rise>6000&&!cage)out.warnings.push('梯長超過 6 m 未加護籠：依職安設施規則第 37 條，需每 6 m 設平台或裝防墜器（槽體固定梯可用防墜裝置）。');
    if(rise>6000&&cage&&rest>0)out.warnings.push(`梯長 ${(rise/1000).toFixed(1)} m：依職安設施規則第 37 條每 9 m 以下設平台，需約 ${rest} 處中間平台。`);
    out.welds.push({name:'直梯支架',kind:'fillet',leg:6,length:brackets*2*(65*2+10*2)});
    out.geometry.ladder={angle:a.ladderAngle,length,rise,rungs,pitch:a.rungPitch,width:a.ladderWidth,standoff:a.standoff,cage:cageInfo,rest,floor,top:top+a.extension};
    if(!vertical)out.notes.push('臥式槽直梯通常只到槽頂平台；高度以槽頂外表面估算。');
  }
  if(a.stair){
    if(!vertical)out.issues.push({field:'methods.access.stair',message:'盤梯沿立式筒身繞行；臥式槽請改用直梯或斜梯平台。'});
    else{
      const risers=Math.ceil(rise/a.stairRise),step=rise/risers,going=step/Math.tan(rad(a.stairAngle)),inner=ro+a.stairGap,outer=inner+a.stairWidth,walk=(inner+outer)/2,travel=rise/Math.tan(rad(a.stairAngle)),sweep=travel/walk;
      const innerLen=Math.hypot(inner*sweep,rise),outerLen=Math.hypot(outer*sweep,rise),posts=Math.ceil(outerLen/a.postPitch)+1,brackets=Math.ceil(innerLen/2000)+1;
      bars('盤梯內側桁','FB 200 × 10（捲螺旋）',sectionArea.flat(200,10),innerLen);bars('盤梯外側桁','FB 200 × 10（捲螺旋）',sectionArea.flat(200,10),outerLen);
      out.bom.push(bomLine('踏板（格柵）',`${a.stairWidth} × ${Math.max(200,going).toFixed(0)}`,risers-1,'片',a.stairWidth*Math.max(200,going)/1e6*32));
      bars('盤梯欄杆（上＋中欄）','鋼管 Ø42.7 × 2.8',sectionArea.pipe(42.7,2.8),outerLen,2);bars('欄杆柱','鋼管 Ø42.7 × 2.8',sectionArea.pipe(42.7,2.8),a.railHeight,posts);bars('盤梯支架','L65 × 65 × 6',sectionArea.angle(65,6),a.stairGap+250,brackets);
      if(sweep>2*PI)out.warnings.push('盤梯超過一整圈，會與自己重疊；請加大斜角、加中間平台或改直梯。');
      if(going<200)out.warnings.push(`踏面深約 ${going.toFixed(0)} mm，偏窄；可降低斜角或增加級高。`);
      out.welds.push({name:'盤梯支架',kind:'fillet',leg:6,length:brackets*2*(65*2)});
      out.geometry.stair={start:a.stairStart,sweep:sweep*180/PI,inner,outer,rise,risers,step,going,innerLen,outerLen,floor,top};
    }
  }
  const rail=(name,length,closed=false)=>{const posts=Math.ceil(length/a.postPitch)+(closed?0:1);bars(name+'（上＋中欄）','鋼管 Ø42.7 × 2.8',sectionArea.pipe(42.7,2.8),length,2);bars(name+'柱','鋼管 Ø42.7 × 2.8',sectionArea.pipe(42.7,2.8),a.railHeight,posts);bars(name+'腳趾板','FB 100 × 6',sectionArea.flat(100,6),length);return posts;};
  if(a.platform){const area=a.platformWidth*a.platformLength;out.bom.push(bomLine('平台格柵',`${a.platformWidth} × ${a.platformLength}`,1,'片',area/1e6*32));bars('平台框架','L65 × 65 × 6',sectionArea.angle(65,6),2*(a.platformWidth+a.platformLength));const posts=rail('平台欄杆',a.platformLength+2*a.platformWidth);out.geometry.platform={width:a.platformWidth,length:a.platformLength,posts,area};}
  if(a.roofRail){const length=PI*(r.od+100);const posts=rail('槽頂周邊欄杆',length,true);out.geometry.roofRail={length,posts};}
  if(a.railHeight<900&&(a.platform||a.roofRail||a.stair))out.warnings.push('欄杆高低於 90 cm。');
  out.summary=[a.ladder?'直梯':'',a.stair&&vertical?'盤梯':'',a.platform?'平台':'',a.roofRail?'周邊欄杆':''].filter(Boolean).join('＋')||'未加梯台';
  return out;
}
function jacketPlan(r){
  const p=r.input,j=r.methods.jacket,rho=p.density,ro=r.od/2,out={type:j.type,bom:[],plates:[],welds:[],warnings:[],issues:[],notes:[],geometry:{}};
  if(j.type==='none')return out;
  const from=j.from,to=j.to>0?j.to:r.bodyHeight-150,span=to-from;
  if(!(span>0)||to>r.bodyHeight)out.issues.push({field:'methods.jacket.to',message:`夾套範圍需在筒身 0～${r.bodyHeight.toFixed(0)} mm 內，且終點高於起點。`});
  if(out.issues.length)return out;
  for(const n of r.nozzlePlan?.items??[])if(n.host==='shell'&&j.type!=='coil'&&n.height+n.hole/2>from&&n.height-n.hole/2<to)out.warnings.push(`${n.id} 位於夾套範圍內，需加穿越套管或改位置。`);
  if(j.type==='halfpipe'){
    if(2*j.pipeThickness>=j.pipeOD)out.issues.push({field:'methods.jacket.pipeThickness',message:'管厚需小於外徑的一半。'});
    if(j.pitch<j.pipeOD+20)out.warnings.push(`螺距 ${j.pitch} mm 小於半管外徑＋20 mm，兩側角焊空間不足。`);
    const turns=span/j.pitch,turn=Math.hypot(2*PI*ro,j.pitch),length=turns*turn,half=kgm(sectionArea.pipe(j.pipeOD,j.pipeThickness),rho)/2,pipes=Math.ceil(length/(2*j.stockLength));
    out.bom.push(bomLine('半管夾套',`Ø${j.pipeOD} × ${j.pipeThickness} 對剖（${pipes} 支 ${j.stockLength} mm 管料）`,1,'組',half*length/1000,{length}));
    out.welds.push({name:'半管兩側角焊',kind:'fillet',leg:Math.min(j.pipeThickness,p.shellThickness),length:2*length});
    out.geometry={from,to,turns,pitch:j.pitch,length,pipeOD:j.pipeOD,helixAngle:Math.atan2(j.pitch,2*PI*ro)*180/PI};
    out.summary=`半管 ${turns.toFixed(1)} 圈 · ${(length/1000).toFixed(1)} m`;
    out.notes.push('半管需冷彎成螺旋；入出口管嘴、排氣與試壓依設計另加。');
    return out;
  }
  if(j.type==='full'){
    const id=r.od+2*j.jacketGap,t=j.jacketThickness,mean=id+t,circ=PI*mean,panels=Math.ceil(circ/(p.stockLength-2*p.trim)),courses=Math.ceil(span/(p.stockWidth-2*p.trim));
    const ring=sectorLayout({rhoIn:ro,rhoOut:id/2+t,theta:360,stockWidth:p.stockWidth,stockLength:p.stockLength,trim:p.trim,bands:1});
    if(!ring.valid){out.issues.push({field:'methods.jacket.jacketGap',message:'夾套封閉環放不進原板。'});return out;}
    const pw=circ/panels+2*p.trim,ph=span/courses+2*p.trim;
    out.bom.push(bomLine('夾套筒板',`ID ${id.toFixed(0)} × t${t} × ${span.toFixed(0)}（${panels*courses} 片）`,1,'組',plateKg(circ*span,t,rho)),bomLine('夾套封閉環',`Ø${(id+2*t).toFixed(0)}／Ø${r.od.toFixed(0)} × ${t}`,2,'圈',plateKg(PI*((id/2+t)**2-ro*ro),t,rho)));
    out.plates.push({id:'JS',name:'夾套筒板',t,pieces:Array.from({length:panels*courses},()=>({w:pw,h:ph,area:(pw-2*p.trim)*(ph-2*p.trim)}))},{id:'JR',name:'夾套封閉環',t,pieces:[...ring.pieces,...ring.pieces].map(x=>({w:x.w+2*p.trim,h:x.h+2*p.trim,outline:x.outline,area:x.area}))});
    out.welds.push({name:'夾套縱縫／環縫',kind:'butt',t,length:panels*span+(courses-1)*circ},{name:'封閉環',kind:'fillet',leg:t,length:2*(PI*r.od+PI*(id+2*t))});
    out.geometry={from,to,gap:j.jacketGap,thickness:t,id};out.summary=`整體夾套 ${span.toFixed(0)} mm 高 · 環隙 ${j.jacketGap} mm`;
    return out;
  }
  const dc=j.coilDiameter>0?j.coilDiameter:.8*r.di;
  if(dc+j.pipeOD>r.di-100)out.issues.push({field:'methods.jacket.coilDiameter',message:'盤管中心徑加管外徑需比槽內徑小 100 mm 以上。'});
  if(2*j.pipeThickness>=j.pipeOD)out.issues.push({field:'methods.jacket.pipeThickness',message:'管厚需小於外徑的一半。'});
  if(out.issues.length)return out;
  const turns=span/j.pitch,length=turns*Math.hypot(PI*dc,j.pitch),pipes=Math.ceil(length/j.stockLength),supports=Math.ceil(turns*j.supportsPerTurn);
  out.bom.push(bomLine('內盤管',`Ø${j.pipeOD} × ${j.pipeThickness}（${pipes} 支 ${j.stockLength} mm）`,1,'組',kgm(sectionArea.pipe(j.pipeOD,j.pipeThickness),rho)*length/1000,{length}),bomLine('盤管支架','L50 × 50 × 5',supports,'只',kgm(sectionArea.angle(50,5),rho)*.4));
  out.welds.push({name:'盤管對接',kind:'butt',t:j.pipeThickness,length:pipes*PI*j.pipeOD},{name:'盤管支架',kind:'fillet',leg:5,length:supports*200});
  out.geometry={from,to,turns,pitch:j.pitch,length,diameter:dc,pipeOD:j.pipeOD,supports};out.summary=`內盤管 Ø${dc.toFixed(0)} · ${turns.toFixed(1)} 圈`;
  return out;
}
function internalsPlan(r){
  const p=r.input,b=r.methods.internals,rho=p.density,out={bom:[],plates:[],welds:[],warnings:[],issues:[],notes:[],geometry:{}};
  if(!b.baffles)return out;
  const w=b.baffleWidth>0?b.baffleWidth:r.di/12,gap=b.baffleGap>0?b.baffleGap:w/6,length=Math.max(100,r.height-200),angles=anglesFrom(0,b.baffleCount);
  if(w+gap>=r.di/4)out.issues.push({field:'methods.internals.baffleWidth',message:'擋板寬＋離壁超過內半徑一半，請減少。'});
  if(out.issues.length)return out;
  out.bom.push(bomLine('擋板',`${w.toFixed(0)} × ${length.toFixed(0)} × ${b.baffleThickness}`,b.baffleCount,'片',plateKg(w*length,b.baffleThickness,rho)),bomLine('擋板支架','FB 50 × 8',b.baffleCount*b.baffleBrackets,'只',kgm(sectionArea.flat(50,8),rho)*(gap+80)/1000*2));
  out.plates.push({id:'IB',name:'擋板',t:b.baffleThickness,pieces:angles.map(()=>({w,h:length,area:w*length}))});
  out.welds.push({name:'擋板支架',kind:'fillet',leg:6,length:b.baffleCount*b.baffleBrackets*4*58});
  out.geometry={angles,width:w,gap,length,thickness:b.baffleThickness};out.summary=`${b.baffleCount} 片擋板 · 寬 ${w.toFixed(0)} mm`;
  out.notes.push('擋板寬與離壁為攪拌槽常用經驗比例，實際依攪拌設計確認。');
  return out;
}
function liftingPlan(r,emptyWeight){
  const p=r.input,l=r.methods.lifting,rho=p.density,out={bom:[],plates:[],welds:[],warnings:[],issues:[],notes:[],geometry:{}};
  if(!l.enabled)return out;
  if(l.share>l.count)out.issues.push({field:'methods.lifting.share',message:'受力吊耳數不能多於吊耳數。'});
  if(l.hole>=l.lugWidth)out.issues.push({field:'methods.lifting.hole',message:'吊孔需小於吊耳寬。'});
  if(out.issues.length)return out;
  const area=l.lugWidth*l.lugHeight-PI*l.hole**2/4,weight=emptyWeight+l.count*plateKg(area,l.lugThickness,rho);
  const vertical=weight*G*l.factor/l.share/1000,sling=vertical/Math.sin(rad(l.slingAngle)),horizontal=vertical/Math.tan(rad(l.slingAngle));
  out.bom.push(bomLine('吊耳',`${l.lugWidth} × ${l.lugHeight} × ${l.lugThickness}，孔 Ø${l.hole}`,l.count,'只',plateKg(area,l.lugThickness,rho)));
  out.plates.push({id:'LL',name:'吊耳',t:l.lugThickness,pieces:Array.from({length:l.count},()=>({w:l.lugWidth,h:l.lugHeight,area}))});
  out.welds.push({name:'吊耳',kind:'fillet',leg:Math.min(l.lugThickness,p.shellThickness,12),length:l.count*2*(l.lugWidth+l.lugThickness)});
  out.geometry={count:l.count,slingAngle:l.slingAngle,width:l.lugWidth,height:l.lugHeight,thickness:l.lugThickness,hole:l.hole};
  out.loads={weight,vertical,sling,horizontal,factor:l.factor,share:l.share};
  out.summary=`${l.count} 只吊耳 · 每只 ${vertical.toFixed(1)} kN（吊索 ${sling.toFixed(1)} kN）`;
  out.notes.push('吊耳板、銷孔承壓、撕裂與焊縫強度未校核；吊具與吊車能力依吊裝計畫。');
  if(l.slingAngle<45)out.warnings.push('吊索與水平夾角小於 45°，水平分力大，建議加吊梁或增加吊索長度。');
  return out;
}
/** Outside or inside surface of one end, m². A vertical flat bottom's outside counts only the overhang ring (underside separate). */
export function endSurfaceArea(r,which,side){
  const e=r.ends[which],p=r.input,m2=x=>x/1e6;if(e.type==='open')return 0;
  if(e.type==='flat'){const fd=r.od+2*(Number(p.overhang)||0);return side==='in'?m2(PI*r.di**2/4):which==='bottom'&&r.orientation==='vertical'?m2(PI*(fd*fd-r.od*r.od)/4):m2(PI*fd*fd/4);}
  return m2(e.midArea+PI*(r.di+e.t)*(e.straight||0));
}
/** Insulation volume (m³), weight (kg) and cladding (m²) from the surface settings; null when not insulated. */
export function insulationEstimate(r){
  const s=r.methods.surface;if(!s.insulation)return null;
  const t=s.insulationThickness,ro=r.od/2,H=r.bodyHeight,top=s.insulationTop?endSurfaceArea(r,'top','out'):0,bottom=s.insulationBottom?endSurfaceArea(r,'bottom','out'):0;
  const volume=PI*((ro+t)**2-ro*ro)*H/1e9+(top+bottom)*t/1000,cladding=(PI*(r.od+2*t)*H/1e6+top+bottom)*(1+2*s.claddingOverlap/1000),rings=Math.floor(H/s.supportPitch)+1;
  return {thickness:t,volume,weight:volume*s.insulationDensity,cladding,rings,ringLength:PI*(r.od+2*t)*rings};
}
/** Weight of the lifting lug plates alone (independent of the lifted load). */
export function liftingLugWeight(r){const l=r.methods.lifting;return l.enabled?l.count*plateKg(l.lugWidth*l.lugHeight-PI*l.hole**2/4,l.lugThickness,r.input.density):0;}
// Small fittings every tank tends to need: nameplate bracket, grounding lugs and a bottom drain sump.
export const NAMEPLATE={w:200,h:150,t:6,standoff:50};
export const GROUNDING_LUG={w:50,h:100,t:10,hole:14};
function miscPlan(r){
  const p=r.input,m=r.methods.misc,rho=p.density,out={bom:[],plates:[],welds:[],warnings:[],issues:[],notes:[],geometry:{}};
  const vertical=r.orientation==='vertical',flatBottom=r.endTypes.bottom==='flat';
  if(m.nameplate){const n=NAMEPLATE,plate=plateKg(n.w*n.h,n.t,rho),legs=2*plateKg(n.h*n.standoff,n.t,rho);
    out.bom.push(bomLine('銘牌座',`${n.w} × ${n.h} × ${n.t}＋支架 2 片（離壁 ${n.standoff}）`,1,'組',plate+legs));
    out.plates.push({id:'MN',name:'銘牌座',t:n.t,pieces:[{w:n.w,h:n.h,area:n.w*n.h},{w:n.h,h:n.standoff,area:n.h*n.standoff},{w:n.h,h:n.standoff,area:n.h*n.standoff}]});
    out.welds.push({name:'銘牌座支架',kind:'fillet',leg:Math.min(n.t,p.shellThickness),length:2*2*(n.h+n.t)});out.geometry.nameplate={...n};}
  if(m.grounding>0){const g=GROUNDING_LUG,area=g.w*g.h-PI*g.hole**2/4;
    out.bom.push(bomLine('接地耳',`${g.w} × ${g.h} × ${g.t}，孔 Ø${g.hole}`,m.grounding,'只',plateKg(area,g.t,rho)));
    out.plates.push({id:'MG',name:'接地耳',t:g.t,pieces:Array.from({length:m.grounding},()=>({w:g.w,h:g.h,area}))});
    out.welds.push({name:'接地耳',kind:'fillet',leg:Math.min(6,p.shellThickness),length:m.grounding*2*(g.w+g.t)});out.geometry.grounding={count:m.grounding,...g};}
  if(m.sump&&vertical&&flatBottom){
    const D=m.sumpDiameter,depth=m.sumpDepth,t=m.sumpThickness>0?m.sumpThickness:r.ends.bottom.t,radius=m.sumpOffset>0?r.di/2-m.sumpOffset:0,before=out.issues.length;
    if(m.sumpOffset>0&&m.sumpOffset<D/2+100)out.issues.push({field:'methods.misc.sumpOffset',message:`集水坑離筒壁太近：中心距筒壁至少 ${(D/2+100).toFixed(0)} mm（坑半徑＋100）。`});
    if(radius<0)out.issues.push({field:'methods.misc.sumpOffset',message:`集水坑中心距筒壁超過槽內半徑 ${(r.di/2).toFixed(0)} mm；填 0 置中。`});
    if(Math.abs(radius)+D/2>r.di/2-100&&out.issues.length===before)out.issues.push({field:'methods.misc.sumpDiameter',message:'集水坑太大，放不進槽底（需離筒壁 100 mm 以上）。'});
    if(out.issues.length===before){
      const wall=PI*(D+t),disc=PI*D*D/4,trim=p.trim;
      out.bom.push(bomLine('集水坑',`Ø${D} × 深 ${depth} × t${t}（坑底圓板＋捲圓坑壁）`,1,'組',plateKg(disc,t,rho)+plateKg(wall*depth,t,rho)));
      out.plates.push({id:'MS',name:'集水坑',t,pieces:[{w:D+2*trim,h:D+2*trim,area:disc,outline:Array.from({length:48},(_,i)=>[D/2+D/2*Math.cos(i/48*2*PI),D/2+D/2*Math.sin(i/48*2*PI)])},{w:wall+2*trim,h:depth+2*trim,area:wall*depth}]});
      out.welds.push({name:'集水坑壁縱縫',kind:'butt',t,length:depth},{name:'坑壁－坑底',kind:'fillet',leg:t,length:PI*D},{name:'坑壁－槽底板',kind:'fillet',leg:Math.min(t,r.ends.bottom.t),length:PI*D});
      out.geometry.sump={diameter:D,depth,t,offset:m.sumpOffset,angle:m.sumpAngle,radius,x:radius*Math.sin(rad(m.sumpAngle)),z:radius*Math.cos(rad(m.sumpAngle)),hole:D,volume:PI*D*D/4*depth/1e9};
      out.notes.push('集水坑需配合基礎預留凹坑；排放接管與坑底補強依圖面。','集水坑容積未計入槽體容積與液位表。');
    }
  }
  const parts=[m.nameplate?'銘牌座':'',m.grounding>0?`接地耳 ${m.grounding}`:'',out.geometry.sump?`集水坑 Ø${m.sumpDiameter}`:''].filter(Boolean);
  out.summary=parts.join('＋')||'未加入';out.active=parts.length>0;
  return out;
}
/** Plates from attachments, as estimate parts (id, name, thickness, pieces) ready for nesting. */
export function attachmentParts(plan,p){
  const out=[];
  for(const group of [plan.pads,plan.supports,plan.rings,plan.jacket,plan.internals,plan.lifting,plan.misc]){
    for(const plate of group?.plates??[])out.push(plate);
  }
  return out;
}
/**
 * Plans every attachment for a valid estimate `r` (with nozzle plan). Returns per-group results, plate parts for nesting,
 * a combined bill of materials, weld list, weights and loads.
 */
export function planAttachments(r){
  const p=r.input,rho=p.density,liquid=liquidDensity(p);
  const pads=padPlan(r),manholes=manholePlan(r);
  const padWeight=pads.reduce((s,x)=>s+x.weight,0),manholeWeight=manholes.reduce((s,x)=>s+x.weight,0);
  const rings=ringPlan(r),jacket=jacketPlan(r),internals=internalsPlan(r),misc=miscPlan(r);
  const groupWeight=g=>(g.bom??[]).reduce((s,x)=>s+x.weight,0);
  // Support geometry does not depend on the load: plan it once for the floor level, then again with the full load.
  const vertical=r.orientation==='vertical',f=r.frame,clearance=r.methods.supports.clearance,layout=supportPlan(r,{operating:0,test:0});
  // Climb for ladders/stairs: vertical tanks in the axial frame (floor below the lowest point when raised on supports),
  // horizontal tanks from the floor to the top of the shell (heights measured up from the shell bottom).
  const floor=vertical?(layout.type==='legs'?-clearance:layout.type==='skirt'?(layout.geometry.floor??0):0):-(layout.type==='saddles'?clearance:0);
  const top=vertical?f.bodyTop:r.od;
  const access=accessPlan(r,{top,floor}),insulation=insulationEstimate(r);
  // Loads for supports: everything carried (body, nozzles, every attachment, insulation) + liquid; test = water to the test fill.
  const preliminary=r.netWeight+(r.nozzlePlan?.extraWeight??0)+padWeight+manholeWeight+groupWeight(rings)+groupWeight(jacket)+groupWeight(internals)+groupWeight(misc);
  const carried=preliminary+groupWeight(access)+liftingLugWeight(r)+(insulation?.weight??0);
  const operatingLiquid=r.workingVolume*liquid,testWater=r.volume*1000*(r.methods.inspection.hydro?r.methods.inspection.testFill/100:1);
  const supportLoads={operating:(carried+operatingLiquid)*G/1000,test:(carried+testWater)*G/1000};
  const supports=supportPlan(r,supportLoads);
  const lifting=liftingPlan(r,preliminary+groupWeight(supports)+groupWeight(access));
  const weight=padWeight+manholeWeight+[rings,jacket,internals,supports,access,lifting,misc].reduce((s,g)=>s+groupWeight(g),0);
  const issues=[...supports.issues,...rings.issues,...access.issues,...jacket.issues,...internals.issues,...lifting.issues,...misc.issues];
  const warnings=[...supports.warnings,...rings.warnings,...access.warnings,...jacket.warnings,...internals.warnings,...lifting.warnings,...misc.warnings];
  const shift=(points,x0,y0)=>points.map(([x,y])=>[x-x0,y-y0]);
  const padPlates=pads.length?Object.values(pads.reduce((acc,x)=>{const key=String(x.t);if(!acc[key])acc[key]={id:'NP'+(Object.keys(acc).length?Object.keys(acc).length+1:''),name:`補強板 t${x.t}`,t:x.t,pieces:[]};const x0=Math.min(...x.outline.outer.map(q=>q[0])),y0=Math.min(...x.outline.outer.map(q=>q[1]));acc[key].pieces.push({w:x.w+2*p.trim,h:x.h+2*p.trim,outline:shift(x.outline.outer,x0,y0),holes:[shift(x.outline.inner,x0,y0)],area:x.area,nozzle:x.id});return acc;},{})):[];
  const plan={pads:{items:pads,plates:padPlates,weight:padWeight},manholes:{items:manholes,weight:manholeWeight},supports,rings,access,jacket,internals,lifting,misc,weight,emptyWeight:r.netWeight+(r.nozzlePlan?.extraWeight??0)+weight,issues,warnings,top,floor,
    loads:{...supportLoads,operatingLiquid,testWater,liquidDensity:liquid,liquidAssumed:liquid===1000&&String(p.liquidDensity??'').trim()===''},
    bom:[...pads.map(x=>bomLine('補強板 '+x.id,`Ø${x.od.toFixed(0)}／Ø${x.hole.toFixed(0)} × ${x.t}${x.rollRadius?`（捲 R${x.rollRadius.toFixed(0)}）`:''}`,1,'片',x.weight)),...manholes.map(x=>bomLine('人孔蓋 '+x.id,`Ø${x.diameter} × ${x.coverThickness}${x.davit==='davit'?'＋吊桿':x.davit==='hinge'?'＋鉸鏈':''}`,1,'組',x.weight)),...supports.bom,...rings.bom,...access.bom,...jacket.bom,...internals.bom,...lifting.bom,...misc.bom],
    welds:[...pads.flatMap(x=>[{name:'補強板外緣 '+x.id,kind:'fillet',leg:x.weld.leg,length:x.weld.outer},{name:'補強板內緣 '+x.id,kind:'fillet',leg:x.weld.leg,length:x.weld.inner}]),...supports.welds,...rings.welds,...access.welds,...jacket.welds,...internals.welds,...lifting.welds,...misc.welds]};
  plan.parts=[...padPlates,...supports.plates,...rings.plates,...jacket.plates,...internals.plates,...lifting.plates,...misc.plates];
  return plan;
}
