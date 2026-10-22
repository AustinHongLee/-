import {outerProfile} from './tank-heads.js';
import {esc,fmt} from './tank-visuals.js';
import {tankDrawingModel} from './tank-drawing-model.js';
import {seamZoneSurfacePath} from './tank-seam-display.js';

// A vector general arrangement, derived from the same solved geometry as 3D.
// Fabrication details, approvals and unknown dimensions are not synthesized.
export function tankGeneralArrangement(r){
  if(!r?.valid||!r.nozzlePlan?.valid)throw new Error('先修正槽體與管嘴位置，再輸出配置圖。');
  if(r.shellLayoutState?.valid===false)throw new Error(r.shellLayoutState.issues[0].message);if(r.seamClearance?.valid===false)throw new Error('先修正焊道與施工距離，再輸出配置圖。');
  if(r.orientation!=='horizontal')throw new Error('目前配置草圖先支援臥式槽。');
  if(r.nozzlePlan.items.length>12)throw new Error('目前 A3 配置草圖最多容納 12 個管嘴；更多管嘴需先分頁。');
  const s=.40,front=[145,340],end=[1190,340],f=r.frame,ro=r.od/2,ports=r.nozzlePlan.items,
    project=(p,view)=>view==='front'?[front[0]+p[1]*s,front[1]-p[2]*s]:[end[0]+p[0]*s,end[1]-p[2]*s];
  const text=(x,y,value,cls='label',anchor='middle')=>`<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${esc(value)}</text>`,
    line=(x1,y1,x2,y2,cls='edge')=>`<path d="M${x1} ${y1}L${x2} ${y2}" class="${cls}"/>`,
    poly=(pts,cls='edge')=>`<path d="${pts.map((p,i)=>(i?'L':'M')+p.join(' ')).join('')}Z" class="${cls}"/>`;
  const dim=(a,b,y,label)=>line(a,y-7,a,y+7,'dimension')+line(b,y-7,b,y+7,'dimension')+line(a,y,b,y,'dimension')+text((a+b)/2,y-10,label,'dimtext');
  let g='';
  const drawing=tankDrawingModel(r);
  const left=outerProfile(r.ends.bottom),right=outerProfile(r.ends.top),tA=f.bottomTangent,tB=f.topTangent,
    outline=[...left.map(([radius,d])=>project([0,tA-d,radius],'front')).reverse(),...right.map(([radius,d])=>project([0,tB+d,radius],'front')),...right.map(([radius,d])=>project([0,tB+d,-radius],'front')).reverse(),...left.map(([radius,d])=>project([0,tA-d,-radius],'front'))];
  g+=poly(outline,'body')+`<circle cx="${end[0]}" cy="${end[1]}" r="${ro*s}" class="body"/>`;
  for(const y of [f.bodyBottom,f.bodyTop]){const a=project([0,y,ro],'front'),b=project([0,y,-ro],'front');g+=line(...a,...b,'seam');}
  if(drawing.seamClearance.active){
    const sc=drawing.seamClearance,values=sc.settings,mm=v=>v===null?'待填':fmt(v);
    g+=text(60,42,`施工避讓 mm：縱縫寬 ${mm(values.longitudinalWidth)}／環縫寬 ${mm(values.circumferentialWidth)} · 孔緣至焊趾 ${mm(values.nozzleWeldReach)}／補強板至焊趾 ${mm(values.padWeldReach)} · 焊趾淨距 ${mm(values.workDistance)}（依現場輸入）`,'small','start');
    for(const zone of sc.zones)for(const view of ['front','end']){const pts=seamZoneSurfacePath(r,zone).map(p=>project(p,view));g+=`<path data-seam-zone="${zone.id}" d="${pts.map((p,i)=>(i?'L':'M')+p.join(' ')).join('')}Z" fill="none" stroke="${zone.conflict?'#c53d2e':'#437ab1'}" stroke-width="1.5" stroke-dasharray="5 3"/>`;}
    for(const b of sc.bands){const a=b.angle*Math.PI/180,half=b.width*sc.scaleX/r.circumference*Math.PI,pts=b.kind==='longitudinal'?[[ro*Math.sin(a-half),f.bodyBottom+b.z,ro*Math.cos(a-half)],[ro*Math.sin(a+half),f.bodyBottom+b.z,ro*Math.cos(a+half)],[ro*Math.sin(a+half),f.bodyBottom+b.z+b.length,ro*Math.cos(a+half)],[ro*Math.sin(a-half),f.bodyBottom+b.z+b.length,ro*Math.cos(a-half)]]:[[0,f.bodyBottom+b.z-b.width/2,-ro],[0,f.bodyBottom+b.z-b.width/2,ro],[0,f.bodyBottom+b.z+b.width/2,ro],[0,f.bodyBottom+b.z+b.width/2,-ro]];g+=`<path data-seam-band="${b.id}" d="${pts.map((p,i)=>(i?'L':'M')+project(p,'front').join(' ')).join('')}Z" fill="${b.conflict?'#c53d2e':'#bd853b'}" fill-opacity=".35"/>`;}
  }
  const xa=project([0,tA,0],'front')[0],xb=project([0,tB,0],'front')[0];
  g+=line(front[0]-90,front[1],xb+180,front[1],'axis')+line(end[0]-220,end[1],end[0]+310,end[1],'axis')+line(end[0],end[1]-235,end[0],end[1]+360,'axis');
  for(const x of [xa,xb])g+=line(x,75,x,front[1]+ro*s+24,'axis');
  g+=dim(xa,xb,65,`${fmt(r.height)} T.L. - T.L.`)+text(xa,91,'A · T.L.','small')+text(xb,91,'B · T.L.','small');
  // Draw cylinders in each orthographic projection. End-on circular faces are
  // visible as circles, rather than being turned into a fictitious short pipe.
  for(const view of ['front','end'])for(const n of ports){
    const a=project(n.surface,view),b=project(n.face,view),d=[b[0]-a[0],b[1]-a[1]],len=Math.hypot(...d),radius=(n.construction==='integral'?(n.neckOD||n.od):n.od)/2*s,
      flange=n.end!=='bare',fr=n.flangeOD/2*s;
    if(len<.01){g+=`<circle cx="${b[0]}" cy="${b[1]}" r="${(flange?n.flangeOD:n.od)/2*s}" class="hidden"/>`;continue;}
    const normal=[-d[1]/len,d[0]/len],rect=(start,finish,R,cls)=>poly([[start[0]+normal[0]*R,start[1]+normal[1]*R],[finish[0]+normal[0]*R,finish[1]+normal[1]*R],[finish[0]-normal[0]*R,finish[1]-normal[1]*R],[start[0]-normal[0]*R,start[1]-normal[1]*R]],cls),
      back=flange?b.map((v,i)=>v-d[i]/len*n.flangeThickness*s):b;
    g+=rect(a,back,radius,n.construction==='integral'?'integral':'pipe');if(flange)g+=rect(back,b,fr,'flange');
    g+=line(a[0]-d[0]/len*8,a[1]-d[1]/len*8,b[0]+d[0]/len*10,b[1]+d[1]/len*10,'axis');
    if(n.inside>0){const inner=project(n.pipeStart,view);g+=rect(inner,a,n.od/2*s,'hidden');}
  }
  // Labels are grouped by axial station; coincident front/back ports share a
  // leader in the elevation and remain separately identified in the schedule.
  const groups=new Map();for(const n of ports.filter(n=>n.host==='shell'&&n.angle===0)){const key=n.height;groups.set(key,[...(groups.get(key)??[]),n]);}
  for(const group of groups.values()){const p=project(group[0].face,'front');g+=line(p[0],p[1]-10,p[0],125,'leader')+text(p[0],114,group.map(n=>n.mark||n.id).join(' / '),'small');}
  for(const n of ports.filter(n=>n.host!=='shell'||n.angle!==0)){const p=project(n.face,'front'),dx=n.kind==='manhole'?110:n.host==='bottom'?-24:n.host==='top'?24:26,dy=n.kind==='manhole'?-45:35;g+=line(p[0],p[1],p[0]+dx,p[1]+dy,'leader')+text(p[0]+dx,p[1]+dy+16,n.mark||n.id,'small');}
  const xdim=end[0]-170;g+=line(xdim,end[1]-ro*s,xdim,end[1]+ro*s,'dimension')+line(xdim-6,end[1]-ro*s,xdim+6,end[1]-ro*s,'dimension')+line(xdim-6,end[1]+ro*s,xdim+6,end[1]+ro*s,'dimension')+text(xdim-12,end[1],`ID ${fmt(r.di)}`,'dimtext','end');
  if(drawing.support){
    const support=drawing.support,floor=front[1]-support.floor*s,baseY=end[1]-support.floor*s,base=support.bases[0];
    for(const part of support.parts){
      if(part.kind==='base')for(const view of ['front','end']){const [L,W,t]=part.dimensions,a=project([-L/2,part.station-W/2,support.floor+t],view),b=project([L/2,part.station+W/2,support.floor],view);g+=poly([[a[0],a[1]],[b[0],a[1]],[b[0],b[1]],[a[0],b[1]]],'reference');}
      if(part.kind==='profile-zone')for(const view of ['front','end']){const a=project([part.x,part.station-part.footWidth/2,part.previewTop],view),b=project([part.x,part.station+part.footWidth/2,part.bottom],view);g+=line(...a,a[0],b[1],'hidden')+line(a[0],b[1],...b,'hidden')+line(...b,b[0],a[1],'hidden');}
      if(part.kind==='rolled'){
        const pts=Array.from({length:65},(_,i)=>{const a=(180-part.angle/2+part.angle*i/64)*Math.PI/180;return project([(part.radius+part.thickness)*Math.sin(a),part.station,(part.radius+part.thickness)*Math.cos(a)],'end');});g+=poly(pts,'hidden');
        const top=(part.radius+part.thickness)*Math.cos((180-part.angle/2)*Math.PI/180),a=project([0,part.station-part.width/2,top],'front'),b=project([0,part.station+part.width/2,-part.radius-part.thickness],'front');g+=poly([[a[0],a[1]],[b[0],a[1]],[b[0],b[1]],[a[0],b[1]]],'hidden');
      }
    }
    g+=dim(end[0]-base.length*s/2,end[0]+base.length*s/2,baseY+28,fmt(base.length)+' · '+support.id+'.P1 / P6');
    const xc=end[0]+285;g+=line(xc,end[1],xc,baseY,'dimension')+text(xc+10,(end[1]+baseY)/2,fmt(-support.floor),'dimtext','start');
    const x1=project([0,tA+support.stations[0],0],'front')[0],x2=project([0,tA+support.stations[1],0],'front')[0];g+=dim(x1,x2,floor+28,fmt(support.stations[1]-support.stations[0])+' · 支承中心距')+text(x1,floor-22,support.id+'.W1','small')+text(x2,floor-22,support.id+'.W5','small');
    g+=text(420,710,support.id+'.P2 / P3：輪廓待核；P4：'+fmt(support.formed.blankLength)+' / '+fmt(support.formed.angle)+'°（詳支承圖）','small');
  }
  // Physical weld IDs replace only their aggregate aliases; unknown detail
  // welds retain register entries without fabricated drawing locations.
  for(const w of drawing.welds.filter(w=>w.location==='located')){
    const a=project(w.anchor,'front');
    if(w.pointsKind==='line'){
      const x1=project([0,w.station,0],'front')[0],x2=project([0,w.station+w.length,0],'front')[0];
      g+=`<path d="M${x1} ${a[1]}H${x2}" stroke="#b67825" stroke-width="2" stroke-dasharray="7 4" fill="none"/>`+text((x1+x2)/2,a[1]+22,w.id,'label');
    }else{
      const x=project([0,w.station,0],'front')[0],left=w.id==='W-A';
      g+=`<path d="M${x} ${front[1]-ro*s}V${front[1]+ro*s}" stroke="#b67825" stroke-width="2" fill="none"/>`+line(x,front[1]+ro*s,x+(left?-48:48),510,'leader')+text(x+(left?-48:48),530,w.id,'label');
    }
  }
  const middle=(f.bodyBottom+f.bodyTop)/2;
  g+=text(project([0,middle,0],'front')[0],front[1]+42,drawing.plates.map(p=>p.id).slice(0,5).join(' / ')+' · 筒板','label');
  for(const h of drawing.heads){const x=project(h.anchor,'front')[0],left=h.which==='bottom';g+=line(x,front[1],x+(left?-95:95),front[1]+175,'leader')+text(x+(left?-95:95),front[1]+197,h.id,'label');}
  g+=text(450,735,'主視圖 · 模型尺寸投影','viewtitle')+text(1200,735,'端視圖 · 由 A 端看','viewtitle')+text(60,757,'模型 '+drawing.revision+' · S1 為程式筒板號；與原圖藍色 S1~S12 註記不同。','small','start');
  const headers=['原圖口號','NPS / 等級','站位／安裝面','管軸','外伸／內凸 mm','接件及下料狀態'],widths=[110,170,300,230,200,410],tx=60,ty=778,rh=21;
  let x=tx;for(let i=0;i<headers.length;i++){g+=text(x+8,ty+16,headers[i],'tablehead','start');x+=widths[i];}
  g+=line(tx,ty+rh,1480,ty+rh,'tableline');
  for(let i=0;i<ports.length;i++){const n=ports[i],row=[n.mark||n.id,`${n.flangeSize} / ${n.flangeClass} ${n.flangeFacing}`,n.host==='shell'?`A 板邊 +${fmt(n.height)}`:n.host==='bottom'?'A 封頭':'B 封頭',n.host==='shell'?(n.axisMode==='parallel'?`${fmt(n.angle)}° · 偏心 ${fmt(n.offset)}`:`徑向 ${fmt(n.angle)}°`):`軸向 · 偏心 ${fmt(n.radius)}`,`${fmt(n.projection)} / ${fmt(n.inside)}`,n.cutReady?'WN 組焊 · 管長另見估料單':'LWN 一體 · 詳圖分件待補'];x=tx;for(let k=0;k<row.length;k++){g+=text(x+8,ty+rh*(i+1)+16,row[k],'tabletext','start');x+=widths[k];}g+=line(tx,ty+rh*(i+2),1480,ty+rh*(i+2),'tableline');}
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420mm" height="297mm" viewBox="0 0 1600 1132" role="img" aria-label="桶槽重建總體配置草圖"><style>text{font-family:'Microsoft JhengHei','Noto Sans CJK TC',sans-serif;fill:#243e48}.edge,.body,.pipe,.flange,.integral,.reference,.hidden{stroke:#314f5e;stroke-width:1.3;fill:white;stroke-linejoin:round}.body{fill:#f5f8fa}.pipe{fill:#e6eff3}.flange,.integral{fill:#f5eddf}.axis{stroke:#91a6af;stroke-width:.8;stroke-dasharray:10 4 2 4;fill:none}.seam{stroke:#839aa5;stroke-width:1;stroke-dasharray:4 3}.leader{stroke:#6d8491;stroke-width:.8;fill:none}.dimension{stroke:#69887c;stroke-width:1;fill:none}.dimtext{font-size:13px;fill:#426b5c}.small{font-size:12px}.label{font-size:14px}.viewtitle{font-size:16px;font-weight:bold}.hidden{fill:none;stroke-dasharray:5 4;stroke:#94a3ab}.reference{fill:#edf1f0;stroke:#7b9387;stroke-dasharray:6 3}.tablehead{font-size:12px;font-weight:bold}.tabletext{font-size:11px}.tableline{stroke:#c8d4d9;stroke-width:.7}.title{font-size:22px;font-weight:bold}.note{font-size:12px;fill:#617d73}</style><rect width="1600" height="1132" fill="white"/><rect x="20" y="20" width="1560" height="1092" fill="none" stroke="#526d7a"/>${g}${text(60,1090,`${r.input.referenceCase?'V-1102 · ':''}桶槽重建總體配置草圖`,'title','start')}${text(1540,1081,'單位 mm · 非固定比例 · 草稿／未審核','note','end')}${text(1540,1100,'未含完整坡口、焊道、開孔補強與附件詳圖；不可直接作製作圖','note','end')}</svg>`;
}
