import {v1102Fabrication} from './tank-v1102-fabrication.js';
import {migrateV1102Support} from './tank-support-project.js';
import {supportFitIssues} from './tank-support-layout.js';

const rad=d=>d*Math.PI/180;
// Reusable geometry helpers. Flat stock length and formed sweep are separate
// inputs: a discrepancy is evidence to resolve, never an automatic trim amount.
export function rolledPlateComparison({insideRadius,thickness,angle,blankLength}){
  const meanRadius=insideRadius+thickness/2,formedLength=meanRadius*rad(angle),insideLength=insideRadius*rad(angle),outsideLength=(insideRadius+thickness)*rad(angle);
  return {insideRadius,meanRadius,outsideRadius:insideRadius+thickness,thickness,angle,blankLength,formedLength,insideLength,outsideLength,outsideDelta:blankLength-outsideLength,interpretation:'外弧估長取整屬推測，原圖未註明成形基準。',delta:blankLength-formedLength,blankSweep:blankLength/meanRadius*180/Math.PI,impliedMeanRadius:blankLength/rad(angle),status:'basis-pending'};
}
export const supportArc=(radius,station,angle,count=64)=>Array.from({length:count+1},(_,i)=>{const a=rad(180-angle/2+angle*i/count);return [radius*Math.sin(a),station,radius*Math.cos(a)];});
const rectangle=(x,y,z,dx,dy)=>[[x-dx/2,y-dy/2,z],[x+dx/2,y-dy/2,z],[x+dx/2,y+dy/2,z],[x-dx/2,y+dy/2,z],[x-dx/2,y-dy/2,z]];

export function v1102SupportPlan(r){
  if(!r?.valid||r.orientation!=='horizontal'||r.attachments.supports.type!=='none')return null;
  let assembly=r.fabricationPlan?.data.assemblies.find(a=>a.target==='support');
  if(assembly&&!assembly.supportLayout){const migration=migrateV1102Support(r.input);if(migration.changed)assembly=migration.input.fabricationData.assemblies.find(a=>a.target==='support');}
  if(!assembly?.supportLayout||supportFitIssues(assembly,r).length)return null;
  const a=assembly,g=a.supportLayout,part=id=>a.parts.find(p=>p.id===id),A=part('P1'),B=part('P6'),P=part('P4'),L=part('P3'),S=part('P2');
  if(![A?.length,A?.width,A?.thickness,B?.length,B?.width,B?.thickness,P?.length,P?.width,P?.thickness,L?.width,L?.thickness,S?.thickness].every(n=>Number.isFinite(n)&&n>0))return null;
  const prefix=a.id+'.',formed=rolledPlateComparison({insideRadius:r.od/2,thickness:P.thickness,angle:g.formedAngle,blankLength:P.length}),
    base={length:A.length,width:A.width,thickness:A.thickness,holes:g.holePitch,holeDiameter:A.holeDiameter,slotLength:B.slotLength,holeAxialOffset:g.holeAxialOffset},
    seat={angle:g.contactAngle,thickness:S.thickness,span:g.span,footWidth:L.width,topWidth:null,axialWidth:null,spanDatum:g.spanDatum},
    floor=-g.axisToBase,baseTop=floor+A.thickness,stations=g.stations,parts=[],zones=[],pending=[];
  const defaults=v1102Fabrication().assemblies[0],sourceDiff=[];
  if(r.input.referenceCase==='v1102-drawing-study'){
    for(const p of a.parts){const source=defaults.parts.find(x=>x.id===p.id);if(source)for(const key of ['length','width','thickness','holeDiameter','holeCount','slotLength','qty'])if((p[key]??null)!==(source[key]??null))sourceDiff.push(prefix+p.id+' '+key);}
    for(const key of ['axisToBase','span','holePitch','formedAngle','contactAngle','holeAxialOffset','spanDatum'])if(g[key]!==defaults.supportLayout[key])sourceDiff.push(key);
    if(g.stations.some((v,i)=>v!==defaults.supportLayout.stations[i]))sourceDiff.push('支承站位');
  }
  if(g.holeAxialOffset===null)pending.push({id:prefix+'P1 / '+prefix+'P6',text:'孔列沿槽軸的偏置未標；孔距已知，不能直接預設孔列置中鑽孔。'});
  pending.push({id:prefix+'P2 / '+prefix+'P3',text:S.thickness+'t鞍座的各板分界、上寬／斜邊轉折、頂弧及跨距尺寸面需詳圖確認。異形板尚無核定切割輪廓與毛坯。'});
  pending.push({id:prefix+'P4',text:'先備展開與成形角的半徑／切端基準待核。中面差'+formed.delta.toFixed(3)+' mm；外弧'+formed.outsideLength.toFixed(3)+' mm。外弧取整屬推測，不能直接指定差值為修邊、回彈或焊縮。'});
  pending.push({id:prefix+'W2 / W3 / W4',text:'鞍座上部、鞍座／耐磨板、耐磨板／筒體為接合區；實際拆件及焊道範圍需詳圖確認。'});
  if(a.welds.some(w=>['W1','W5'].includes(w.id)&&!w.wps))pending.push({id:prefix+'W1 / W5',text:'底部原圖7/7全周符號已讀入；WPS、端部收尾、允差及鍍鋅／不鏽鋼接合程序待核。'});
  pending.push({id:prefix+'P5',text:'錨栓長度、螺帽墊圈與固定／滑動配置待核。'});
  const x=g.span/2+(g.spanDatum==='inside'?L.thickness/2:g.spanDatum==='outside'?-L.thickness/2:0);
  for(let i=0;i<2;i++){
    const suffix=i+1,station=r.frame.bottomTangent+stations[i],b=i?B:A,topBase=floor+b.thickness;
    parts.push({id:prefix+b.id,bomId:prefix+b.id,kind:'base',anchor:[0,station,topBase],station,dimensions:[b.length,b.width,b.thickness],holeDiameter:b.holeDiameter,slotLength:b.slotLength,holePattern:b.slotLength?'slot':'round',holeCenters:[[-g.holePitch/2,g.holeAxialOffset],[g.holePitch/2,g.holeAxialOffset]],holePosition:g.holeAxialOffset===null?'axial-offset-pending':'specified'});
    parts.push({id:prefix+'P4-'+suffix,bomId:prefix+'P4',kind:'rolled',anchor:[0,station,-formed.outsideRadius],station,radius:formed.insideRadius,thickness:P.thickness,angle:g.formedAngle,width:P.width,blank:[P.length,P.width,P.thickness],status:'formed-basis-pending'});
    parts.push({id:prefix+'P2-'+suffix,bomId:prefix+'P2',kind:'contact-zone',anchor:[0,station,-formed.outsideRadius-S.thickness],station,radius:formed.outsideRadius,angle:g.contactAngle,thickness:S.thickness,axialWidth:null,status:'outline-pending'});
    for(const [j,sign] of [-1,1].entries()){
      const top=-Math.sqrt(formed.outsideRadius**2-x*x),id=prefix+'P3-'+(i*2+j+1);
      parts.push({id,bomId:prefix+'P3',kind:'profile-zone',anchor:[sign*x,station,(topBase+top)/2],station,x:sign*x,bottom:topBase,previewTop:top,thickness:L.thickness,footWidth:L.width,topWidth:null,outline:null,cutReady:false,status:'outline-pending'});
    }
    const weld=r.fabricationPlan.welds.find(w=>w.id===prefix+(i?'W5':'W1'));
    if(weld)zones.push({...weld,location:'zone',pointsKind:'paths',anchor:[-x,station,topBase],paths:[-x,x].map(xx=>rectangle(xx,station,topBase,L.thickness,L.width)),positionStatus:g.spanDatum==='pending'?'跨距尺寸面待核；底部接合區可辨識':'底部接合區；端部收尾依詳圖',scope:'detail'});
  }
  for(const local of ['W2','W3','W4']){
    const id=prefix+local,w=r.fabricationPlan.welds.find(w=>w.id===id),paths=[];if(!w)continue;
    for(const stationTL of stations){const y=r.frame.bottomTangent+stationTL;
      if(local==='W2')for(const sign of [-1,1]){const z=-Math.sqrt(formed.outsideRadius**2-x*x);paths.push([[sign*x,y-L.width/2,z],[sign*x,y+L.width/2,z]]);}
      if(local==='W3')paths.push(supportArc(formed.outsideRadius,y,g.contactAngle));
      if(local==='W4'){
        paths.push(supportArc(formed.meanRadius,y-P.width/2,g.formedAngle),supportArc(formed.meanRadius,y+P.width/2,g.formedAngle));
        for(const angle of [180-g.formedAngle/2,180+g.formedAngle/2])paths.push([y-P.width/2,y+P.width/2].map(s=>[formed.meanRadius*Math.sin(rad(angle)),s,formed.meanRadius*Math.cos(rad(angle))]));
      }
    }
    zones.push({...w,scope:'detail',location:'zone',pointsKind:'paths',anchor:paths[0][Math.floor(paths[0].length/2)],paths,positionStatus:'接合區示意；實際焊道形式／範圍待核'});
  }
  return {id:a.id,name:a.name,source:r.input.referenceCase==='v1102-drawing-study'?'V-1102_3.pdf / 原頁2/34':'專案支承配置',layout:g,sourceDiff,base,bases:[A,B],seat,formed,floor,baseTop,stations,parts,zones,pending,profileCutReady:false,
    knownDimensions:[[stations.join(' / '),'支承中心，從A端TL量'],[String(stations[1]-stations[0]),'支承中心距'],[String(g.axisToBase),'槽軸至底板下表面'],[A.length+' × '+A.width+' × '+A.thickness,'A側底板外形'],[B.length+' × '+B.width+' × '+B.thickness,'B側底板外形'],[String(g.span),'支承跨距；基準：'+g.spanDatum],[String(g.holePitch),'底板孔距'],[String(L.width),'腳底軸向寬'],['Ø'+A.holeDiameter+' / '+B.holeDiameter+' × '+(B.slotLength??B.holeDiameter),'A側圓孔／B側孔'],[S.thickness+'t / '+g.contactAngle+'°','鞍座板厚／接觸範圍'],[P.length+' × '+P.width+' × '+P.thickness+' / '+g.formedAngle+'°','耐磨板先備／成形角']],
    corrections:['原圖150是接地片距底板高度，並非立板寬。','未知9t輪廓用線框；不當作已定案實心方柱。','兩側底板分列扣孔重量；孔列偏置未填時不給鑽孔座標。']};
}
