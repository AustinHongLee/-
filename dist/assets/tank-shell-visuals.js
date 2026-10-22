import {shellCourseAt,shellRingStations} from './tank-shell-layout.js';
import {seamOverlaySVG} from './tank-seam-svg.js';
import {shellSeamDisplayModel} from './tank-seam-display.js';
import {esc,fmt,pieceColor} from './tank-visuals.js';

const txt=(x,y,s,cls='sh-text',anchor='start')=>`<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${esc(s)}</text>`;
const line=(x1,y1,x2,y2,cls='sh-line')=>`<path d="M${x1} ${y1}L${x2} ${y2}" class="${cls}"/>`;
const dim=(x1,y1,x2,y2,s)=>line(x1,y1,x2,y2,'sh-dim')+line(x1-4,y1-6,x1+4,y1+6,'sh-dim')+line(x2-4,y2-6,x2+4,y2+6,'sh-dim')+txt((x1+x2)/2,(y1+y2)/2-10,s,'sh-measure','middle');
const svg=(label,body,height=440)=>`<svg xmlns="http://www.w3.org/2000/svg" class="shell-svg" viewBox="0 0 840 ${height}" role="img" aria-label="${esc(label)}"><style>.shell-svg text{font-family:'Microsoft JhengHei',sans-serif}.sh-text{font-size:18px;fill:#34564d}.sh-title{font-size:22px;font-weight:700;fill:#204d42}.sh-small{font-size:14px;fill:#6a8278}.sh-measure{font-size:17px;fill:#326c58}.sh-line{stroke:#5f8276;stroke-width:2;fill:none}.sh-dim{stroke:#82a496;stroke-width:1.4;fill:none}.sh-cut{stroke:#bf7628;stroke-width:3;fill:none;stroke-dasharray:9 6}.sh-finish{stroke:#26816c;stroke-width:2;fill:none;stroke-dasharray:5 5}.sh-seam{stroke:#c98532;stroke-width:4;fill:none}.sh-axis{stroke:#9cafaa;stroke-width:1;stroke-dasharray:7 5;fill:none}.sh-plate{fill:#dbe9e1;stroke:#507b6b;stroke-width:2}.sh-pick{fill:#f7ddac;stroke:#a76c21;stroke-width:2}.sh-white{fill:#fff;stroke:#8ea99c;stroke-width:1.5}</style>${body}</svg>`;

function flat(m,cut){
  const s=m.part,F=m.finished,x=125,y=95,w=590,h=240,
    // Leave narrow reserves visible, with an explicit note that these bands are exaggerated.
    dx=Math.min(w*.23,Math.max(15,w*F.x/s.width)),dy=Math.min(h*.23,Math.max(13,h*F.y/s.height));
  return svg(cut?'毛坯切割與成形後修邊線':'筒身平板放樣與捲向',
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" class="sh-plate"/>`+
    `<path d="M${x} ${y}h${dx}v${h}h-${dx}ZM${x+w-dx} ${y}h${dx}v${h}h-${dx}Z" fill="#f0d6ad"/>`+
    `<rect x="${x+dx}" y="${y+dy}" width="${w-2*dx}" height="${h-2*dy}" class="sh-finish"/>`+
    (cut?`<rect x="${x}" y="${y}" width="${w}" height="${h}" class="sh-cut"/>`:
      line(x,y,x+w,y+h,'sh-axis')+line(x+w,y,x,y+h,'sh-axis'))+
    dim(x,y-25,x+w,y-25,`毛坯捲向長 ${fmt(s.width,2)} mm`)+
    line(x-27,y,x-27,y+h,'sh-dim')+txt(x-38,y+h/2-8,'軸向','sh-measure','end')+txt(x-38,y+h/2+17,fmt(s.height,2),'sh-measure','end')+
    txt(x+50,y+69,m.piece.id+' · 朝外面','sh-title')+txt(x+50,y+98,`成品 ${fmt(F.width,2)} × ${fmt(F.height,2)} mm`)+
    `<path d="M${x+210} ${y+156}h190m-17-9 17 9-17 9" stroke="#2a7a60" stroke-width="3" fill="none"/>`+txt(x+305,y+184,'沿此方向捲成圓弧','sh-small','middle')+
    `<circle cx="${x}" cy="${y}" r="6" fill="#1e6a54"/>`+txt(x-8,y-10,'基準角','sh-small','end')+
    txt(125,370,`兩端各留 ${fmt(m.reserve.circumferential,2)} mm · 軸向兩側各留 ${fmt(m.reserve.axial,2)} mm`,'sh-measure')+
    txt(125,401,cut?'橙虛線：第一刀毛坯線　綠虛線：成形後修邊線':'對角線名目長 '+fmt(Math.hypot(s.width,s.height),2)+' mm · 量兩條核對矩形','sh-small')+
    txt(125,425,'留料帶為辨識加寬，實際依標示尺寸；圖非 1:1。','sh-small'));
}
function rolling(m){
  const pre=m.preBend,span=m.arcAngle*Math.PI/180,count=Math.max(8,Math.ceil(span*12)),arc=Array.from({length:count+1},(_,i)=>{const a=-Math.PI/2-span/2+span*i/count;return [625+80*Math.cos(a),130+55*Math.sin(a)];});
  return svg('兩端板端處理、捲製方向與內弧樣板',
    txt(45,42,'① '+(pre?'處理兩端預彎':'保留直邊，捲後切端'),'sh-title')+
    `<path d="${pre?'M65 144Q85 105 115 105H305Q335 105 355 144':'M65 128H355'}" fill="none" stroke="#518675" stroke-width="11" stroke-linecap="round"/>`+
    `<path d="M90 165v-38M330 165v-38" class="sh-dim"/>`+txt(210,195,pre?'兩端都核對曲率':'每端直邊 '+fmt(m.part.flatEnd)+' mm','sh-measure','middle')+
    txt(450,42,'② 捲製、卸載後量測','sh-title')+
    `<ellipse cx="625" cy="130" rx="80" ry="55" class="sh-axis"/><path d="M${arc.map(p=>p.join(' ')).join('L')}" fill="none" stroke="#80ad96" stroke-width="10"/>`+
    [ [578,192],[670,192],[624,150] ].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="17" class="sh-white"/>`).join('')+
    txt(625,237,`目標 ID ${fmt(m.result.di)} · t${fmt(m.part.thickness)}`,'sh-measure','middle')+txt(625,259,`本片 ${fmt(m.arcAngle,2)}° · 虛線為完整圓參考`,'sh-small','middle')+
    txt(45,277,'③ 內弧樣板：名目幾何','sh-title')+
    `<path d="M75 318Q215 418 355 318" stroke="#81a894" fill="none" stroke-width="7"/>`+
    line(75,318,355,318,'sh-axis')+line(215,318,215,366,'sh-dim')+
    txt(215,305,'弦長 '+fmt(m.template.chord,2)+' mm','sh-measure','middle')+
    txt(375,354,'弦高 '+fmt(m.template.sagitta,2)+' mm','sh-measure')+
    txt(450,390,'內弧 R'+fmt(m.template.radius)+' · 不代表過捲設定','sh-small')+
    txt(45,425,'機構、板端與曲率為操作概念圖；道次、回彈及支承依機台程序。','sh-small'));
}
/** A developed shell map: every weld identifier is generated once in the shared plan. */
export function shellSeamMap(m,{interactive=false,all=false}={}){
  const r=m.result,rows=Math.min(r.courses,all?14:5),cols=Math.min(r.panelsPerCourse,all?24:12),h=rows*82+120,x=110,w=620,y=55,rh=70,
    first=Math.max(1,Math.min(m.piece.course-Math.floor(rows/2),r.courses-rows+1)),firstPanel=Math.max(1,Math.min(m.piece.panel-Math.floor(cols/2),r.panelsPerCourse-cols+1));
  let g=txt(35,28,'筒身展開 · 左右接起成一圈','sh-title');
  for(let j=0;j<rows;j++){
    const c=first+j,yy=y+(rows-1-j)*82;
    g+=txt(15,yy+30,'第 '+c+' 圈','sh-measure')+txt(15,yy+52,m.horizontal?'A → B':'下 → 上','sh-small');
    g+=`<rect x="${x}" y="${yy}" width="${w}" height="${rh}" fill="#f0f3ef" stroke="#d3ded5"/>`;
    for(const b of r.assembly.filter(b=>b.course===c&&b.panel>=firstPanel&&b.panel<firstPanel+cols)){
      const xx=x+b.start/r.circumference*w,ww=b.length/r.circumference*w,
        segments=xx+ww>x+w?[[xx,x+w-xx],[x,xx+ww-x-w]]:[[xx,ww]],selected=b.id===m.piece.id;
      for(const [sx,sw] of segments){
        const attrs=interactive?` data-shell-piece="${b.id}" tabindex="0" role="button" aria-label="選取 ${b.id} 第 ${c} 圈"`:'';
        g+=`<g${attrs}><rect x="${sx}" y="${yy}" width="${Math.max(.2,sw)}" height="${rh}" class="${selected?'sh-pick':'sh-plate'}"/>${sw>26?txt(sx+sw/2,yy+40,b.id,'sh-text','middle'):''}</g>`;
      }
    }
    for(const weld of m.welds.filter(b=>b.kind==='longitudinal'&&b.course===c&&b.panel>=firstPanel&&b.panel<firstPanel+cols)){
      const xx=x+weld.angle/360*w;
      g+=line(xx,yy,xx,yy+rh,'sh-seam')+txt(Math.max(x+14,Math.min(x+w-16,xx+7)),yy+15,weld.id,'sh-small');
    }
    if(c>1)g+=line(x,yy+rh+6,x+w,yy+rh+6,'sh-seam')+txt(x+w+12,yy+rh+12,'C'+(c-1),'sh-small');
  }
  const mapZ=z=>{const row=shellCourseAt(r,z);return y+(first+rows-1-row.course)*82+(1-(z-row.z)/row.height)*rh;};
  g+=`<defs><clipPath id="shell-seam-overlay-clip"><rect x="${x}" y="${y}" width="${w}" height="${rows*82-12}"/></clipPath></defs>`+seamOverlaySVG(r,{x,width:w,mapZ,courseRect:c=>({y:y+(first+rows-1-c)*82,h:rh}),first,last:first+rows-1,clipId:'shell-seam-overlay-clip'});
  if(shellSeamDisplayModel(r).active)g+=txt(x,h-45,'金色：焊道帶 · 虛線：施工區 · 紅色：需避讓','sh-small');
  g+=txt(x,h-24,`0° → 360° · ${m.horizontal?'由 A 端看':'俯視'}順時針 · 橙線為接縫中心`,'sh-small');
  if(rows<r.courses||cols<r.panelsPerCourse)g+=txt(x,h-2,`節錄第 ${first}–${first+rows-1} 圈、第 ${firstPanel}–${firstPanel+cols-1} 片；完整編號見加工單。`,'sh-small');
  return svg('筒身板片與 L 縱縫 C 環縫位置',g,h);
}
function welding(m){
  const g=m.groove,face=Math.min(14,g.face/g.t*100),shape=g.type==='I'?'M100 80H270V230H100Z M325 80H495V230H325Z':g.type==='V'?`M100 80H195L270 ${215-face}V230H100Z M495 80H400L325 ${215-face}V230H495Z`:
    `M100 80H195L270 ${155-face/2}V${155+face/2}L195 230H100Z M495 80H400L325 ${155-face/2}V${155+face/2}L400 230H495Z`;
  return svg('筒身焊接坡口估算截面與作業面確認',
    txt(45,40,`${g.type} 形坡口 · 估算設定示意`,'sh-title')+`<path d="${shape}" class="sh-plate"/>`+
    dim(270,267,325,267,`根隙 ${fmt(g.gap)} mm`)+
    txt(560,110,`板厚 t${fmt(g.t)} mm`)+txt(560,145,g.type==='I'?'I 形對接':`夾角 ${fmt(g.angle)}°`)+
    txt(560,180,`鈍邊 ${fmt(g.face)} mm`)+txt(560,215,'不指定焊道層數','sh-small')+
    txt(45,318,`目前扣料間隙 ${fmt(m.result.input.gap)} mm；與 WPS 核對後才施工。`,'sh-measure')+
    txt(45,363,'先確認：根部作業 → 內／外側可達性 → 翻身／清根 → 檢驗','sh-text')+
    txt(45,410,'正式順序、道次、焊材、溫度與接受準則依核定 WPS／ITP。','sh-small'));
}
export function shellStepSketch(m,step){return step==='layout'?flat(m,false):step==='cut'?flat(m,true):step==='roll'?rolling(m):step==='fit'?shellSeamMap(m,{interactive:true}):welding(m);}

/** Printable isometric companion, using the same piece angles/axial stations as WebGL. */
export function shellIsoSketch(m){
  const r=m.result,R=r.od/2,project=(a,z)=>{
    const x=R*Math.sin(a),v=R*Math.cos(a),q=m.horizontal?[z,v,x]:[x,z,v];
    return {x:(q[0]-q[2])*.7071,y:(q[0]+q[2])*.4082-q[1]*.8165,depth:q[0]+q[2]+q[1]*.7};
  },pieces=r.assembly.length<=500?r.assembly:r.assembly.filter(p=>p.course===m.piece.course).slice(0,500),faces=[];
  // Tessellate before projecting: a closed full-circle path projects to two disks,
  // rather than the lateral wall. Small quads also allow a proper painter order.
  for(const p of pieces){
    const a=p.start/r.circumference*2*Math.PI,span=p.length/r.circumference*2*Math.PI,n=Math.max(3,Math.ceil(span*10));
    for(let i=0;i<n;i++){
      const a0=a+span*i/n,a1=a+span*(i+1)/n,points=[project(a0,p.z),project(a1,p.z),project(a1,p.z+p.height),project(a0,p.z+p.height)];
      faces.push({points,color:p.id===m.piece.id?'#efc783':pieceColor(p.id),depth:points.reduce((s,q)=>s+q.depth,0)/4});
    }
  }
  const bounds=faces.flatMap(f=>f.points).reduce((b,p)=>({minX:Math.min(b.minX,p.x),maxX:Math.max(b.maxX,p.x),minY:Math.min(b.minY,p.y),maxY:Math.max(b.maxY,p.y)}),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity}),{minX,maxX,minY,maxY}=bounds,scale=Math.min(650/Math.max(1,maxX-minX),290/Math.max(1,maxY-minY)),cx=(minX+maxX)/2,cy=(minY+maxY)/2;
  const body=faces.sort((a,b)=>a.depth-b.depth).map(f=>`<path d="M${f.points.map(p=>[420+(p.x-cx)*scale,225+(p.y-cy)*scale].join(' ')).join('L')}Z" fill="${f.color}" fill-opacity=".82" stroke="${f.color}" stroke-width=".5"/>`).join('');
  return svg('筒身等角輔助視圖',txt(30,35,'筒身等角輔助視圖','sh-title')+body+txt(30,418,`選取 ${m.piece.id} · ${r.assembly.length>500?'節錄選取圈板片；完整位置見清單':'成品板片位置'} · 非固定比例`,'sh-small'));
}
export function shellOrthographic(m){
  const r=m.result,s=Math.min(320/r.bodyHeight,250/r.od),L=r.bodyHeight*s,D=r.od*s,x=75,y=90;
  let front='';
  if(m.horizontal){
    front+=`<rect x="${x}" y="120" width="${L}" height="${D}" class="sh-plate"/>`;
    for(const {course:c,z} of shellRingStations(r)){const xx=x+z*s;front+=line(xx,120,xx,120+D,'sh-seam')+txt(xx,108,'C'+c,'sh-small','middle');}
    front+=dim(x,120+D+38,x+L,120+D+38,`筒身板段 ${fmt(r.bodyHeight,2)} mm`)+txt(x,80,'A 端 → B 端','sh-small');
  }else{
    front+=`<rect x="${x}" y="${y}" width="${D}" height="${L}" class="sh-plate"/>`;
    for(const {course:c,z} of shellRingStations(r)){const yy=y+L-z*s;front+=line(x,yy,x+D,yy,'sh-seam')+txt(x+D+12,yy+6,'C'+c,'sh-small');}
    front+=line(x+D+45,y,x+D+45,y+L,'sh-dim')+txt(x+D+55,y+L/2-8,fmt(r.bodyHeight,2),'sh-measure')+txt(x+D+55,y+L/2+15,'板段 mm','sh-small')+txt(x,y-15,'上緣','sh-small')+txt(x,y+L+25,'筒身下緣','sh-small');
  }
  const cy=230;
  return svg('筒身軸向及端面尺寸圖',txt(35,35,'筒身主視圖／端視圖','sh-title')+front+
    `<circle cx="640" cy="${cy}" r="${D/2}" class="sh-plate"/><circle cx="640" cy="${cy}" r="${r.di*s/2}" fill="white" stroke="#628976"/>`+
    line(640-D/2-18,cy,640+D/2+18,cy,'sh-axis')+
    txt(640,cy+D/2+38,`ID ${fmt(r.di)} / OD ${fmt(r.od)}`,'sh-measure','middle')+
    txt(640,cy+D/2+65,`t${fmt(r.input.shellThickness)} mm`,'sh-small','middle'),Math.max(440,m.horizontal?120+D+100:y+L+60));
}
