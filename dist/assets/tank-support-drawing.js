import {tankDrawingModel} from './tank-drawing-model.js';
import {supportArc} from './tank-support-plan.js';
import {esc,fmt} from './tank-visuals.js';

// Both live workbench and print/export call this with the CURRENT solved result.
export function supportDrawingSheet(r,page=1){
  const m=tankDrawingModel(r),p=m?.support;if(!p)throw Error('支承配置或尺寸尚未完成，請先修正支承頁。');
  const f=p.formed,g=p.layout,[A,B]=p.bases,L=p.parts.find(x=>x.kind==='profile-zone'),prefix=p.id+'.',project=r.input.shellConstruction?.project||(r.input.referenceCase?'V-1102':'桶槽');
  const t=(x,y,s,c='txt',anchor='start')=>`<text x="${x}" y="${y}" class="${c}" text-anchor="${anchor}">${esc(s)}</text>`,
    path=(points,c='edge',close=false)=>`<path class="${c}" d="${points.map((v,i)=>(i?'L':'M')+v.join(' ')).join('')}${close?'Z':''}"/>`,
    rect=(x,y,w,h,c='plate')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" class="${c}"/>`,
    line=(x1,y1,x2,y2,c='dim')=>path([[x1,y1],[x2,y2]],c),
    dim=(x1,x2,y,s)=>line(x1,y,x2,y)+line(x1,y-6,x1,y+6)+line(x2,y-6,x2,y+6)+t((x1+x2)/2,y-9,s,'small','middle');
  let out=t(55,65,project+' · '+(page===1?'支承組立、底板與焊接位置':fmt(f.blankLength)+' 展開／'+fmt(f.angle)+'°成形比較'),'title')+t(55,96,`模型 ${m.revision} · ${p.sourceDiff.length?'已修改'+p.sourceDiff.length+'項，以目前專案值出圖':'目前專案尺寸'} · 單位 mm`,'small');
  if(page===1){
    const cx=340,cy=340,s=Math.min(.5,400/g.axisToBase,360/Math.max(A.length,B.length,r.od)),proj=([x,y,z])=>[cx+x*s,cy-z*s],floor=cy+g.axisToBase*s;
    out+=t(65,145,'端視 · A端看（兩組）','head')+`<circle cx="${cx}" cy="${cy}" r="${r.od/2*s}" class="shell"/>`;
    for(const R of [f.insideRadius,f.outsideRadius])out+=path(supportArc(R,0,f.angle).map(proj),'pad');
    out+=path(supportArc(f.outsideRadius+p.seat.thickness/2,0,p.seat.angle).map(proj),'weld');
    for(const part of p.parts.filter(x=>x.kind==='profile-zone').slice(0,2))out+=line(cx+part.x*s,cy-part.previewTop*s,cx+part.x*s,floor-A.thickness*s,'unknown');
    out+=rect(cx-A.length*s/2,floor-A.thickness*s,A.length*s,A.thickness*s)+dim(cx-A.length*s/2,cx+A.length*s/2,floor+35,fmt(A.length)+' 底板')+dim(cx-g.span*s/2,cx+g.span*s/2,floor+75,fmt(g.span)+' 支承跨距（'+(g.spanDatum==='pending'?'尺寸面待核':{centres:'中心',outside:'外側',inside:'內側'}[g.spanDatum])+'）');
    out+=line(135,cy,135,floor)+line(128,cy,142,cy)+line(128,floor,142,floor)+t(65,560,fmt(g.axisToBase)+' 槽軸至板底','small');
    out+=line(cx-r.od*s/2-25,cy,cx+r.od*s/2+25,cy,'axis')+t(cx,310,'ID'+fmt(r.di)+' / OD'+fmt(r.od),'small','middle')+t(cx,365,fmt(p.seat.angle)+'° 鞍座接觸區','small','middle')+t(cx,395,fmt(f.angle)+'° 耐磨板成形角','small','middle');
    out+=t(510,535,prefix+'P4-1 / -2','txt')+line(495,528,440,490,'leader');
    out+=line(cx+L.x*s,cy-L.previewTop*s,125,457,'weld')+t(85,481,prefix+'W2 接合區','wlabel')+line(cx,cy+f.outsideRadius*s,490,566,'weld')+t(510,590,prefix+'W3','wlabel');
    const end=supportArc(f.insideRadius,0,f.angle).at(-1);out+=line(...proj(end),585,420,'weld')+t(600,438,prefix+'W4','wlabel');
    out+=t(65,675,prefix+'P2 / '+prefix+'P3 · 異形板輪廓待核','warn')+t(65,704,'虛線是配置包絡；上緣、斜邊、頂弧及板件分界未確認。','small');
    const wA=p.zones.find(w=>w.localId==='W1'),wB=p.zones.find(w=>w.localId==='W5');
    out+=t(65,850,prefix+'W1 '+(wA?.size??'待填')+' / '+(wA?.size??'待填')+'；'+prefix+'W5 '+(wB?.size??'待填')+' / '+(wB?.size??'待填')+' 全周角焊','wlabel');
    out+=t(65,880,`腳底${fmt(L.footWidth)}×${fmt(L.thickness)}，名目周界${fmt(2*(L.footWidth+L.thickness))}；焊長依登錄的計算方式。`,'small');
    for(let i=0;i<2;i++){
      const b=i?B:A,yy=185+i*285,k=Math.min(480/b.length,105/b.width),x=850,bw=b.length*k,bh=b.width*k,cyHole=yy+(b.width/2+(g.holeAxialOffset??0))*k;
      out+=t(x,yy-25,prefix+b.id+(i?' · B側底板':' · A側底板'),'head')+rect(x,yy,bw,bh)+line(x,cyHole,x+bw,cyHole,'axis');
      for(const sign of [-1,1]){const xx=x+bw/2+sign*g.holePitch*k/2,d=b.holeDiameter*k,h=(b.slotLength??b.holeDiameter)*k;out+=`<rect x="${xx-d/2}" y="${cyHole-h/2}" width="${d}" height="${h}" rx="${d/2}" class="${g.holeAxialOffset===null?'hole':'hole-known'}"/>`;}
      out+=dim(x,x+bw,yy+bh+35,fmt(b.length))+dim(x+(b.length-g.holePitch)*k/2,x+(b.length+g.holePitch)*k/2,yy+bh+70,fmt(g.holePitch)+' 孔距')+t(x+bw+15,yy+65,fmt(b.width)+' / t'+fmt(b.thickness),'small');
      out+=t(x,yy+bh+110,b.holeCount+' '+(b.slotLength?'長孔'+fmt(b.holeDiameter)+'×'+fmt(b.slotLength):'孔Ø'+fmt(b.holeDiameter))+'；'+(b.slotLength?'長方向沿槽軸。':'中心距橫向板邊'+fmt((b.length-g.holePitch)/2)+'。'),'small');
    }
    out+=t(850,780,g.holeAxialOffset===null?'孔列軸向偏置未填':'孔列軸向偏置 '+fmt(g.holeAxialOffset)+' mm',g.holeAxialOffset===null?'warn':'head')+t(850,810,g.holeAxialOffset===null?'孔列畫於示意中心線，不可直接當鑽孔座標。':'孔型與偏置已同步到3D及加工單；仍依核定圖說施工。','small');
    out+=t(850,900,'腳底軸向寬 '+fmt(L.footWidth)+' mm','head')+t(850,932,'兩組中心 A端TL +'+p.stations.map(v=>fmt(v)).join(' / +')+'；中心距'+fmt(p.stations[1]-p.stations[0])+'。','small');
    out+=t(65,940,'W2 腳板／鞍座；W3 鞍座／耐磨板；W4 耐磨板／筒體。','small')+t(65,973,'黃虛線只表示接合區，不代表已核定連續焊或四邊滿焊。','small');
  }else{
    const pad=p.parts.find(x=>x.kind==='rolled'),k=Math.min(570/f.blankLength,170/pad.width),bw=f.blankLength*k,bh=pad.width*k;
    out+=t(65,150,prefix+'P4-1 / -2 · 先備板各1片','head')+rect(100,195,bw,bh,'padblank')+dim(100,100+bw,395,fmt(f.blankLength)+' 先備展開')+t(690,280,fmt(pad.width)+' 寬 / t'+fmt(f.thickness),'txt');
    out+=t(100,435,'BOM按先備板計重；成形修端後淨重與餘量待確認。','small');
    const cx=1125,cy=215,scale=Math.min(.8,268/f.outsideRadius),proj=([x,y,z])=>[cx+x*scale,cy-z*scale];
    for(const R of [f.insideRadius,f.outsideRadius]){out+=path(supportArc(R,0,f.angle).map(proj),'pad');out+=path(supportArc(R,0,f.blankSweep).map(proj),'delta');}
    out+=t(900,150,'成形比較 · 同一份專案','head')+t(cx,335,'設定 '+fmt(f.angle)+'°','txt','middle')+t(cx,370,fmt(f.blankLength)+'對應 '+fmt(f.blankSweep,3)+'°','warn','middle');
    const rows=[['貼合名目半徑','內R'+fmt(f.insideRadius)+' / 中面R'+fmt(f.meanRadius)+' / 外R'+fmt(f.outsideRadius)],[fmt(f.angle)+'°內弧長',fmt(f.insideLength,3)+' mm'],[fmt(f.angle)+'°中面弧長',fmt(f.formedLength,3)+' mm'],[fmt(f.angle)+'°外弧長',fmt(f.outsideLength,3)+' mm；與先備長差 '+fmt(Math.abs(f.outsideDelta),3)+' mm'],['先備與中面弧長差',fmt(f.delta,3)+' mm；不是已確認修邊或收縮量'],['先備長全部保留時','中面R'+fmt(f.meanRadius)+'時角度 '+fmt(f.blankSweep,3)+'°'],['先備長與設定角同時成立','中面R須為 '+fmt(f.impliedMeanRadius,3)+'；貼合半徑待確認'],['計算基準','外弧估長取整屬推測；原圖未註明，不能據此自行指定切端量。']];
    let yy=520;for(const [a,b] of rows){out+=rect(65,yy,1470,37,'row')+t(82,yy+25,a,'txt')+t(480,yy+25,b,'txt');yy+=37;}
    out+=t(65,865,'異形板與成形基準的待核項','head')+t(65,902,'腳底軸向寬'+fmt(L.footWidth)+'、板厚'+fmt(L.thickness)+'；跨距'+fmt(g.span)+'、接觸角'+fmt(g.contactAngle)+'°。','txt')+t(65,935,'上緣、斜邊轉折、頂弧與板件分界未齊，不輸出封閉切割輪廓。','warn')+t(65,975,'施工：標號備料 → 確認成形／切端基準 → 預彎捲製 → 實物試貼 → 依核定程序點固及焊接。','small');
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420mm" height="297mm" viewBox="0 0 1600 1132" role="img" aria-label="支承施工詳圖"><style>text{font-family:'Microsoft JhengHei',sans-serif;fill:#29444e}.title{font-size:27px;font-weight:bold}.head{font-size:21px;font-weight:bold}.txt{font-size:18px}.small{font-size:16px}.warn{font-size:18px;fill:#a86925}.wlabel{font-size:19px;fill:#ad7023}.edge,.plate,.shell{stroke:#456576;stroke-width:1.7;fill:#edf3f5}.padblank{stroke:#987645;stroke-width:2;fill:#f4e9ce}.pad{stroke:#96733d;stroke-width:3;fill:none}.unknown,.hole{stroke:#8999a4;stroke-width:2;stroke-dasharray:9 6;fill:none}.hole-known{stroke:#456576;stroke-width:2;fill:white}.axis{stroke:#a7b9c1;stroke-dasharray:10 4 2 4;fill:none}.dim,.leader{stroke:#5f897d;stroke-width:1;fill:none}.weld,.delta{stroke:#c48729;stroke-width:2;stroke-dasharray:6 4;fill:none}.row{fill:#f4f7f5;stroke:white}</style><rect width="1600" height="1132" fill="white"/><rect x="20" y="20" width="1560" height="1092" fill="none" stroke="#537080"/>${out}${t(55,1065,p.source+' · 目前專案出圖 · 未知值保留待核','small')}${t(1540,1095,`支承詳圖 ${page}/2 · 模型 ${m.revision} · 未審核`,'small','end')}</svg>`;
}
