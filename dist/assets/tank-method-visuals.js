// SVG drawings for the fabrication-method panel and work order. Pure functions of an estimate; no DOM access.
import {outerProfile} from './tank-heads.js';
import {padOutline} from './tank-attachments.js';
import {grooveFor,levelForVolume} from './tank-process.js';
const PI=Math.PI,rad=d=>d*PI/180;
export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const fmt=(n,d=1)=>Number.isFinite(n)?n.toLocaleString('zh-TW',{maximumFractionDigits:d}):'—';
const C={metal:'#416d82',fill:'#d1e5ed',fill2:'#b5cfdd',dim:'#93652d',text:'#24526c',quiet:'#617086',light:'#c5d5de',warn:'#c0392b',warnFill:'#fde3e0',accent:'#c88931',ok:'#3f8a5f',paper:'#f4f7f9'};
const pts=list=>list.map(([x,y])=>`${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
const pathOf=(list,close=true)=>list.length?'M'+list.map(([x,y])=>`${x.toFixed(1)} ${y.toFixed(1)}`).join('L')+(close?'Z':''):'';
const text=(x,y,value,{size=12,color=C.quiet,anchor='start',weight=400}={})=>`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" fill="${color}" text-anchor="${anchor}"${weight!==400?` font-weight="${weight}"`:''}>${esc(value)}</text>`;
function dim(x1,y1,x2,y2,label,{offset=0,color=C.dim,size=12,side=1}={}){
  const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy)||1,nx=-dy/len*offset,ny=dx/len*offset,a=[x1+nx,y1+ny],b=[x2+nx,y2+ny],tx=-dy/len*5,ty=dx/len*5,mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
  const angle=Math.atan2(dy,dx)*180/PI,flip=angle>90||angle<-90,rot=flip?angle+180:angle;
  return `<g class="dim"><path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}M${a[0]-tx} ${a[1]-ty}L${a[0]+tx} ${a[1]+ty}M${b[0]-tx} ${b[1]-ty}L${b[0]+tx} ${b[1]+ty}" stroke="${color}" fill="none"/>${offset?`<path d="M${x1} ${y1}L${a[0]} ${a[1]}M${x2} ${y2}L${b[0]} ${b[1]}" stroke="${color}" stroke-dasharray="2 3" opacity=".6"/>`:''}<text transform="translate(${mid[0].toFixed(1)} ${mid[1].toFixed(1)}) rotate(${rot.toFixed(1)})" y="${-6*side}" font-size="${size}" fill="${color}" text-anchor="middle">${esc(label)}</text></g>`;
}
// Clip-path ids must be unique when several drawings share one page (A4 order, galleries).
let clipSeq=0;const uid=prefix=>`${prefix}-${++clipSeq}`;
const svg=(w,h,body,label)=>`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}" class="tank-method-svg">${body}</svg>`;
const legend=(x,y,items)=>items.map(([color,label],i)=>`<rect x="${x}" y="${y+i*18-9}" width="12" height="12" rx="2" fill="${color}" stroke="${C.metal}" stroke-width=".6"/>${text(x+18,y+i*18+1,label,{size:11})}`).join('');
/** Fits data-space boxes into a drawing area: returns a mapper and the scale. */
function fit(bounds,box){const s=Math.min(box.w/(bounds.x1-bounds.x0||1),box.h/(bounds.y1-bounds.y0||1)),ox=box.x+(box.w-(bounds.x1-bounds.x0)*s)/2,oy=box.y+(box.h-(bounds.y1-bounds.y0)*s)/2;return {s,map:([x,y])=>[ox+(x-bounds.x0)*s,oy+(bounds.y1-y)*s],mapX:x=>ox+(x-bounds.x0)*s,mapY:y=>oy+(bounds.y1-y)*s};}
// ---------------------------------------------------------------- tank outline (axial frame → drawing)
/** Outer outline of the tank in (radial, axial) coordinates, right half from bottom to top. */
export function outlineHalf(r){
  const f=r.frame,ro=r.od/2,out=[],b=r.ends.bottom,t=r.ends.top,p=r.input;
  if(b.type==='flat'){const er=ro+(p.overhang??0);out.push([0,0],[er,0],[er,b.t],[ro,b.t]);}
  else{const prof=outerProfile(b);for(let i=prof.length-1;i>=0;i--)out.push([Math.max(0,prof[i][0]),f.bottomTangent-prof[i][1]]);out.push([ro,f.bottomTangent]);}
  if(t.type==='open'){out.push([ro,f.topTangent],[r.di/2,f.topTangent]);return {points:out,open:true};}
  if(t.type==='flat'){const er=ro+(p.overhang??0);out.push([ro,f.topTangent],[er,f.topTangent],[er,f.topTangent+t.t],[0,f.topTangent+t.t]);}
  else{out.push([ro,f.topTangent]);for(const [x,d] of outerProfile(t))out.push([Math.max(0,x),f.topTangent+d]);out.push([0,f.topTangent+t.outer]);}
  return {points:out,open:false};
}
/** Elevation scene: vertical tanks stand, horizontal tanks lie with the A end on the left. */
export function elevation(r,box,{extra={}}={}){
  const vertical=r.orientation==='vertical',half=outlineHalf(r),ro=r.od/2+([r.endTypes.top,r.endTypes.bottom].includes('flat')?Number(r.input.overhang)||0:0);
  const ext={left:extra.left??0,right:extra.right??0,below:extra.below??0,above:extra.above??0};
  const bounds=vertical?{x0:-ro-ext.left,x1:ro+ext.right,y0:-ext.below,y1:r.frame.total+ext.above}:{x0:-ext.left,x1:r.frame.total+ext.right,y0:-ro-ext.below,y1:ro+ext.above};
  const f=fit(bounds,box),to=([radial,axial])=>vertical?f.map([radial,axial]):f.map([axial,radial]);
  const right=half.points,left=right.map(([x,y])=>[-x,y]).reverse();
  const outline=half.open?pathOf([...left.slice(0,-1).map(to),...right.slice(1).map(to)],false)+`M${to([r.di/2,r.frame.topTangent]).join(' ')}L${to([-r.di/2,r.frame.topTangent]).join(' ')}`:pathOf([...right.map(to),...left.map(to)]);
  return {vertical,to,s:f.s,outline,body:`<path d="${outline}" fill="${C.fill}" stroke="${C.metal}" stroke-width="1.6"/>`,seamLines:()=>{let s='';for(let i=1;i<r.courses;i++){const y=r.frame.bodyBottom+i*(r.courseHeight+r.input.gap)-r.input.gap/2;const a=to([-r.od/2,y]),b=to([r.od/2,y]);s+=`<path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}" stroke="${C.metal}" stroke-width=".6" stroke-dasharray="4 3" opacity=".6"/>`;}return s;}};
}
// ---------------------------------------------------------------- end type glyphs (pickers)
export function endGlyph(type,{position='top',horizontal=false}={}){
  const shapes={open:'M14 34V18M50 34V18',flat:'M10 16H54V20H10Z',cone:'M12 30L32 10L52 30Z',dome:'M12 30Q32 6 52 30Z',elliptical:'M12 30Q12 12 32 12Q52 12 52 30Z',torispherical:'M12 30Q12 18 20 15Q32 10 44 15Q52 18 52 30Z',hemispherical:'M12 30A20 20 0 0 1 52 30Z'};
  const d=shapes[type]??shapes.flat,flip=position==='bottom'?'transform="translate(0 44) scale(1 -1)"':'';
  const shell=type==='open'?'':'<path d="M12 30V40M52 30V40" stroke="#416d82" stroke-width="2"/>';
  return `<svg viewBox="0 0 64 44" aria-hidden="true"${horizontal?' class="is-horizontal"':''}><g ${flip}>${shell}<path d="${d}" fill="${type==='open'?'none':'#b5cfdd'}" stroke="#416d82" stroke-width="2" stroke-linejoin="round"/>${type==='open'?'<path d="M10 40H54" stroke="#416d82" stroke-width="2" stroke-dasharray="3 3"/>':''}</g></svg>`;
}
// ---------------------------------------------------------------- shell rolling
export function rollingVisual(r){
  const s=r.parts[0],m=r.methods.rolling,flat=s.flatEnd??0,strain=50*r.input.shellThickness/(r.meanDiameter/2);
  const W=560,H=250,plate=`<rect x="40" y="40" width="300" height="70" fill="#fff0db" stroke="#c6924c"/>${flat>0?`<rect x="40" y="40" width="22" height="70" fill="#f3c7c0" stroke="${C.warn}"/><rect x="318" y="40" width="22" height="70" fill="#f3c7c0" stroke="${C.warn}"/>`:''}<rect x="${40+(flat>0?22:0)+6}" y="46" width="${300-2*(flat>0?22:0)-12}" height="58" fill="#d2e4eb" stroke="#206c89" stroke-dasharray="5 4"/>`;
  const rolls=`<g transform="translate(430 95)"><circle cx="0" cy="-28" r="22" fill="#e7eef2" stroke="${C.metal}" stroke-width="2"/><circle cx="-34" cy="22" r="18" fill="#e7eef2" stroke="${C.metal}" stroke-width="2"/><circle cx="34" cy="22" r="18" fill="#e7eef2" stroke="${C.metal}" stroke-width="2"/><path d="M-72 -6Q0 -2 72 -40" fill="none" stroke="#c6924c" stroke-width="5"/>${m.preBend==='yes'?'':`<path d="M-72 -6H-48" stroke="${C.warn}" stroke-width="5"/>`}</g>`;
  const gauge=strain==null?'':`<g transform="translate(40 168)">${text(0,0,'冷作成形率（外纖維伸長）',{size:12,color:C.text})}<rect x="0" y="10" width="300" height="10" rx="5" fill="#e7eef2"/><rect x="0" y="10" width="${Math.min(300,strain/10*300).toFixed(1)}" height="10" rx="5" fill="${strain>5?C.warn:'#4b8eaa'}"/><path d="M150 6V24" stroke="${C.dim}" stroke-dasharray="2 2"/>${text(150,38,'5%',{size:10,color:C.dim,anchor:'middle'})}${text(306,20,fmt(strain,2)+'%',{size:12,color:strain>5?C.warn:C.text})}</g>`;
  return svg(W,H,`${text(40,24,`先下料 ${fmt(s.width,1)} × ${fmt(s.height,1)} mm`,{size:13,color:C.dim})}${plate}${dim(40+(flat>0?22:0)+6,128,340-(flat>0?22:0)-6,128,`圓周 ${fmt(s.finishedWidth,1)} mm`,{color:'#206c89'})}${flat>0?text(40,146,`兩端直邊各 ${fmt(flat)} mm，捲後切除`,{size:11,color:C.warn}):text(40,146,'板端先預彎，捲後只修留料',{size:11})}${rolls}${text(430,165,m.preBend==='yes'?'三輥捲板（先預彎）':'未預彎：板端留直邊',{size:11,anchor:'middle'})}${gauge}`,'筒身捲板：下料尺寸、捲板方式與成形率');
}
// ---------------------------------------------------------------- end developments
function sectorPieceSVG(outline,{x,y,s,fill='#d2e4eb',stroke=C.metal,rotate=0}){
  const b=outline.reduce((a,[px,py])=>({x0:Math.min(a.x0,px),y0:Math.min(a.y0,py),x1:Math.max(a.x1,px),y1:Math.max(a.y1,py)}),{x0:Infinity,y0:Infinity,x1:-Infinity,y1:-Infinity});
  const list=outline.map(([px,py])=>[x+(px-b.x0)*s,y+(b.y1-py)*s]);return `<polygon points="${pts(list)}" fill="${fill}" stroke="${stroke}" stroke-width="1.2"${rotate?` transform="rotate(${rotate} ${x} ${y})"`:''}/>`;
}
export function coneVisual(r,which){
  const end=r.ends[which],layout=r.layouts[which],dev=end.development,W=620,H=330,beta=end.angle,top=which==='top';
  // Left: side profile (shell stub on the big end) with diameter, depth and cone angle.
  const R=end.ri,rs=end.small/2,h=end.depth,sc=Math.min(220/(2*R),140/Math.max(h,1)),cx=150,base=top?240:100,dir=top?-1:1,tipY=base+dir*h*sc;
  const big=[[cx-R*sc,base],[cx+R*sc,base]],tip=[[cx+rs*sc,tipY],[cx-rs*sc,tipY]],stub=base-dir*30;
  const side=`<path d="M${big[0][0]} ${stub}V${base}M${big[1][0]} ${stub}V${base}" stroke="${C.metal}" stroke-width="1.5"/><polygon points="${pts([big[0],big[1],tip[0],tip[1]])}" fill="${C.fill}" stroke="${C.metal}" stroke-width="1.5"/>`
    +dim(big[0][0],stub-dir*14,big[1][0],stub-dir*14,'Ø'+fmt(r.di),{side:top?-1:1})
    +dim(big[1][0]+20,base,big[1][0]+20,tipY,'深 '+fmt(h,0),{size:11})
    +`<path d="M${big[0][0]+26} ${base}A26 26 0 0 ${top?0:1} ${big[0][0]+26*Math.cos(rad(beta))} ${base+dir*26*Math.sin(rad(beta))}" fill="none" stroke="${C.dim}"/>`+text(big[0][0]+30,top?base+16:base-8,'β '+fmt(beta,1)+'°',{size:11,color:C.dim})
    +(rs>0?text(cx,tipY+dir*16+4,'小端 Ø'+fmt(end.small),{size:11,anchor:'middle'}):text(cx,tipY+dir*14+4,'尖頂',{size:11,anchor:'middle'}));
  // Right: developed annular sector (bisector up, apex at origin), fitted to its own bounding box so any angle fits.
  const theta=rad(dev.theta),rho=dev.rhoOut,rhoIn=dev.rhoIn,pt=(rr,a)=>[rr*Math.sin(a),rr*Math.cos(a)],samples=[];
  for(let i=0;i<=96;i++){const a=-theta/2+theta*i/96;samples.push(pt(rho,a));if(rhoIn>1)samples.push(pt(rhoIn,a));}if(!(rhoIn>1))samples.push([0,0]);
  const bx={x0:Math.min(...samples.map(q=>q[0])),x1:Math.max(...samples.map(q=>q[0])),y0:Math.min(...samples.map(q=>q[1])),y1:Math.max(...samples.map(q=>q[1]))},F=fit(bx,{x:340,y:58,w:260,h:236});
  let sectors='';const bands=layout?.bands??[];
  for(const band of bands){const step=rad(band.angle),off=band.index%2===0?step/2:0;for(let k=0;k<band.segments;k++){const a0=-theta/2+off+k*step,a1=Math.min(theta/2,a0+step);if(a1<=a0)continue;const n=Math.max(8,Math.ceil((a1-a0)/PI*96)),list=[];for(let i=0;i<=n;i++)list.push(F.map(pt(band.rho2,a0+(a1-a0)*i/n)));for(let i=n;i>=0;i--)list.push(F.map(pt(band.rho1,a0+(a1-a0)*i/n)));sectors+=`<polygon points="${pts(list)}" fill="${(band.index+k)%2?'#d2e4eb':'#e6f0f4'}" stroke="${C.metal}" stroke-width="1"/>`;}
    if(off>0){const a0=-theta/2,a1=-theta/2+off,n=8,list=[];for(let i=0;i<=n;i++)list.push(F.map(pt(band.rho2,a0+(a1-a0)*i/n)));for(let i=n;i>=0;i--)list.push(F.map(pt(band.rho1,a0+(a1-a0)*i/n)));sectors+=`<polygon points="${pts(list)}" fill="#e6f0f4" stroke="${C.metal}" stroke-width="1"/>`;}}
  const apex=F.map([0,0]),edge=F.map(pt(rho,theta/2));
  const devText=`<path d="M${apex[0]} ${apex[1]}L${edge[0]} ${edge[1]}" stroke="${C.dim}" stroke-dasharray="4 3"/><circle cx="${apex[0]}" cy="${apex[1]}" r="2.5" fill="${C.dim}"/>${text((apex[0]+edge[0])/2+6,(apex[1]+edge[1])/2-6,'R '+fmt(dev.rhoOut,1),{size:11,color:C.dim})}${rhoIn>Math.max(10,.02*rho)?text(apex[0]-8,apex[1]+4,'r '+fmt(rhoIn,1),{size:11,anchor:'end',color:C.dim}):''}${text(470,26,`展開扇形 ${fmt(dev.theta,2)}°`,{size:13,color:C.text,anchor:'middle',weight:600})}${text(470,44,layout?`${bands.length} 圈 · 共 ${layout.pieces.length} 片（${bands.map(b=>b.segments).join('＋')}）`:'',{size:11,anchor:'middle'})}`;
  return svg(W,H,`${text(20,24,top?'錐頂側視':'錐底側視',{size:13,color:C.text,weight:600})}${side}<g>${sectors}</g>${devText}${text(20,H-12,'展開以板厚中面：R = 中面大端半徑 ÷ cos β，扇形角 = 360° × cos β',{size:10})}`,'錐體展開與分片');
}
export function petalVisual(r,which){
  const layout=r.layouts[which],W=620,H=330;if(!layout)return '';
  const sphere=layout.sphere,R=sphere.radius,phiMax=sphere.polarMax,cx=150,cy=158,sc=112/(R*Math.sin(phiMax)),ring=phi=>R*Math.sin(phi)*sc;
  let plan=`<circle cx="${cx}" cy="${cy}" r="${ring(phiMax)}" fill="${C.fill}" stroke="${C.metal}" stroke-width="1.5"/>`;
  if(!layout.single){plan+=`<circle cx="${cx}" cy="${cy}" r="${ring(layout.crownAngle)}" fill="#e6f0f4" stroke="${C.metal}"/>`;for(const band of layout.bands){plan+=`<circle cx="${cx}" cy="${cy}" r="${ring(band.phi2)}" fill="none" stroke="${C.metal}" stroke-width=".8"/>`;for(let k=0;k<band.petals;k++){const a=k/band.petals*2*PI;plan+=`<path d="M${cx+ring(band.phi1)*Math.sin(a)} ${cy-ring(band.phi1)*Math.cos(a)}L${cx+ring(band.phi2)*Math.sin(a)} ${cy-ring(band.phi2)*Math.cos(a)}" stroke="${C.metal}" stroke-width=".8"/>`;}}}
  let petal='';if(!layout.single&&layout.bands.length){const band=layout.bands[layout.bands.length-1],o=band.outline,w=band.w,h=band.h,s=Math.min(160/w,250/h);petal=`<g>${text(470,24,`最外圈瓜瓣（${band.petals} 片）`,{size:13,color:C.text,anchor:'middle',weight:600})}${sectorPieceSVG(o,{x:470-w*s/2,y:40,s})}${dim(470-w*s/2,40+h*s+14,470+w*s/2,40+h*s+14,'最寬 '+fmt(w,1),{size:11})}${dim(470+w*s/2+16,40,470+w*s/2+16,40+h*s,'長 '+fmt(h,1),{size:11})}</g>`;}
  const summary=layout.single?`整片壓製：展開圓徑 Ø${fmt(layout.crownDiameter,0)}`:`中心板 Ø${fmt(layout.crownDiameter,0)} ＋ ${layout.bands.map(b=>b.petals+' 片').join('＋')} 瓜瓣`;
  return svg(W,H,`${text(20,24,r.ends[which].type==='dome'?'拱頂俯視分瓣':'半球封頭俯視分瓣',{size:13,color:C.text,weight:600})}${plan}${text(cx,cy+ring(phiMax)+24,summary,{size:12,anchor:'middle',color:C.text})}${petal}${text(20,H-12,'瓜瓣以經線弧長 × 緯線弧寬近似展開，壓製成形後修邊',{size:10})}`,'球面分瓣展開');
}
export function spliceVisual(r,which){
  const layout=r.layouts[which],splice=layout.method==='annular'?layout.centre:layout,W=620,H=380,R=layout.method==='annular'?layout.outerRadius:splice.diameter/2,sc=170/R,cx=200,cy=190,map=(x,y)=>[cx+x*sc,cy-y*sc];
  let plates='';for(const p of splice.plates){const [x0,y0]=map(p.x0,p.y1),w=(p.x1-p.x0)*sc,h=(p.y1-p.y0)*sc;plates+=`<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${p.kind==='full'?'#cfe2ea':'#efe0c4'}" fill-opacity=".85" stroke="${C.metal}" stroke-width=".7"/>`;}
  let ring='';if(layout.method==='annular'){ring=`<circle cx="${cx}" cy="${cy}" r="${(layout.outerRadius*sc).toFixed(1)}" fill="#e2d4f0" stroke="${C.metal}"/><circle cx="${cx}" cy="${cy}" r="${(layout.innerRadius*sc).toFixed(1)}" fill="#fff" stroke="${C.metal}"/>`;const n=layout.ring.pieces.length;for(let k=0;k<n;k++){const a=k/n*2*PI;ring+=`<path d="M${cx+layout.innerRadius*sc*Math.sin(a)} ${cy-layout.innerRadius*sc*Math.cos(a)}L${cx+layout.outerRadius*sc*Math.sin(a)} ${cy-layout.outerRadius*sc*Math.cos(a)}" stroke="${C.metal}"/>`;}}
  const clipR=(layout.method==='annular'?layout.innerRadius+splice.lap:splice.diameter/2)*sc;
  const shell=`<circle cx="${cx}" cy="${cy}" r="${(r.od/2*sc).toFixed(1)}" fill="none" stroke="${C.text}" stroke-width="1.6" stroke-dasharray="6 4"/>`;
  const junction=(splice.junctions??[]).map(j=>{const [x,y]=map(j.x,j.y);const near=(layout.method==='annular'?j.edge:r.di/2-Math.hypot(j.x,j.y))<300;return `<circle cx="${x}" cy="${y}" r="${near?3.5:2.2}" fill="${near?C.warn:C.text}"/>`;}).join('');
  const info=[`${splice.plates.length} 片：整板 ${splice.full}、異形邊板 ${splice.sketch}`,`${splice.joint==='lap'?'搭接 '+splice.lap+' mm':'對接間隙 '+splice.gap+' mm'} · 焊縫 ${fmt(splice.weldLength/1000,1)} m`,layout.method==='annular'?`環形邊板 ${layout.ring.pieces.length} 片 · 寬 ${fmt(layout.outerRadius-layout.innerRadius,0)} mm`:'',splice.minJunctionEdge!==null?`三板交會點距外緣最近 ${fmt(splice.minJunctionEdge,0)} mm`:''].filter(Boolean);
  const clip=uid('splice-'+which);
  return svg(W,H,`<defs><clipPath id="${clip}"><circle cx="${cx}" cy="${cy}" r="${clipR.toFixed(1)}"/></clipPath></defs>${ring}<g clip-path="url(#${clip})">${plates}</g><circle cx="${cx}" cy="${cy}" r="${clipR.toFixed(1)}" fill="none" stroke="${C.metal}" stroke-width="1.4"/>${shell}${junction}${info.map((t,i)=>text(400,60+i*22,t,{size:12,color:i?C.quiet:C.text,weight:i?400:600})).join('')}${legend(400,170,[['#cfe2ea','整張原板'],['#efe0c4','異形邊板（沿圓弧切）'],...(layout.method==='annular'?[['#e2d4f0','環形邊板']]:[])])}${text(400,250,layout.method==='annular'?'紅點＝距環形邊板接縫 < 300 mm 的三板交會':'虛線圓＝筒身外徑；紅點＝距筒身 < 300 mm 的三板交會',{size:10})}${text(400,268,'（API 650：三板搭接點距筒身與彼此 ≥ 300 mm）',{size:10})}`,'底板拼接排版');
}
export function flatVisual(r,which){
  const end=r.ends[which],fd=r.od+2*r.input.overhang,W=520,H=220,sc=150/fd;
  return svg(W,H,`<ellipse cx="150" cy="120" rx="${fd*sc}" ry="${fd*sc*.32}" fill="${C.fill}" stroke="${C.metal}" stroke-width="1.5"/><ellipse cx="150" cy="120" rx="${r.od/2*sc*2/2}" ry="${r.od/2*sc*.32}" fill="none" stroke="${C.metal}" stroke-dasharray="5 4"/>${dim(150-fd*sc,170,150+fd*sc,170,'成品 Ø'+fmt(fd,1))}${text(320,90,`整片圓板 t${fmt(end.t)}`,{size:13,color:C.text,weight:600})}${text(320,112,`下料 Ø${fmt(fd+2*r.input.trim,1)}（各邊留 ${fmt(r.input.trim)}）`,{size:12})}${text(320,134,`外伸筒身外壁 ${fmt(r.input.overhang)} mm`,{size:12})}`,'平板端部下料');
}
export function formedVisual(r,which){
  const end=r.ends[which],W=560,H=270,R=end.ri+end.t,depth=end.outer+end.straight,sc=Math.min(220/(2*R),150/depth),cx=150,down=which==='bottom'&&r.orientation==='vertical';
  // Base = the weld line to the shell; the head bulges away from the shell (up for a top head, down for a bottom head).
  const base=down?70:200,dir=down?1:-1,Y=d=>base+dir*d*sc;
  const prof=outerProfile(end),right=prof.map(([x,d])=>[cx+x*sc,Y(end.straight+d)]),left=right.map(([x,y])=>[2*cx-x,y]).reverse();
  const shell=`<path d="M${cx-R*sc} ${base}V${base-dir*26}M${cx+R*sc} ${base}V${base-dir*26}" stroke="${C.metal}" stroke-width="1.5"/>${text(cx,base-dir*12+4,'筒身',{size:10,anchor:'middle'})}`;
  const shape=`<polygon points="${pts([[cx+R*sc,base],...right,...left,[cx-R*sc,base]])}" fill="${C.fill}" stroke="${C.metal}" stroke-width="1.5"/><path d="M${cx-R*sc} ${Y(end.straight)}H${cx+R*sc}" stroke="${C.metal}" stroke-dasharray="4 3"/>`;
  const rows=[['內徑',fmt(r.di)],['深度（內）',fmt(end.depth,1)],['直邊',fmt(end.straight)],...(end.type==='torispherical'?[['冠部 R',fmt(end.crown,1)],['轉角 r',fmt(end.knuckle,1)]]:[]),['板厚',fmt(end.t)]];
  const odDim=down?dim(cx-R*sc,base-40,cx+R*sc,base-40,'外徑 Ø'+fmt(r.di+2*end.t)):dim(cx-R*sc,base+40,cx+R*sc,base+40,'外徑 Ø'+fmt(r.di+2*end.t),{side:-1});
  return svg(W,H,`${shell}${shape}${odDim}${dim(cx+R*sc+22,base,cx+R*sc+22,Y(depth),'總深 '+fmt(depth,1),{size:11})}${text(cx-R*sc-6,Y(end.straight)+4,'直邊',{size:10,anchor:'end'})}${rows.map(([k,v],i)=>text(330,50+i*24,k,{size:12})+text(520,50+i*24,v+' mm',{size:12,color:C.text,anchor:'end'})).join('')}`,'成形封頭尺寸');
}
// ---------------------------------------------------------------- openings
export function padVisual(r,nozzleId){
  const n=r.nozzlePlan?.items.find(x=>x.id===nozzleId)??r.nozzlePlan?.items.find(x=>x.padRadius>0);
  const W=560,H=280;if(!n)return '';
  const pad=r.attachments?.pads.items.find(x=>x.id===n.id),Rp=n.padRadius||Math.max(n.hole,n.od),rn=r.od/2+(n.padThickness||r.input.shellThickness)/2,shape=n.host==='shell'?padOutline(Rp,n.od/2+1.5,rn):{outer:Array.from({length:73},(_,i)=>[Rp*Math.cos(i/72*2*PI),Rp*Math.sin(i/72*2*PI)]),inner:Array.from({length:73},(_,i)=>[(n.od/2+1.5)*Math.cos(i/72*2*PI),(n.od/2+1.5)*Math.sin(i/72*2*PI)])};
  const ext=Math.max(...shape.outer.map(([x,y])=>Math.max(Math.abs(x),Math.abs(y)))),sc=110/ext,cx=150,cy=145,map=([x,y])=>[cx+x*sc,cy-y*sc];
  const w=pad?.w??2*Math.max(...shape.outer.map(q=>q[0])),h=pad?.h??2*Rp;
  return svg(W,H,`${text(20,24,`${n.id} 補強板展開（平板下料）`,{size:13,color:C.text,weight:600})}<path d="${pathOf(shape.outer.map(map))}${pathOf(shape.inner.map(map))}" fill="#efe0c4" fill-rule="evenodd" stroke="${C.dim}" stroke-width="1.4"/><circle cx="${cx}" cy="${cy-(Rp*.6)*sc}" r="3" fill="none" stroke="${C.dim}"/>${dim(cx-w/2*sc,cy+Rp*sc+18,cx+w/2*sc,cy+Rp*sc+18,'展開寬 '+fmt(w,1))}${dim(cx+ext*sc+16,cy+h/2*sc,cx+ext*sc+16,cy-h/2*sc,'高 '+fmt(h,1))}${[[`外徑（俯視）Ø${fmt(2*Rp,0)}`],[`開孔 Ø${fmt(n.od+3,1)}`],[`板厚 ${fmt(n.padThickness||r.input.shellThickness)} mm`],[n.host==='shell'?`捲成 R${fmt(r.od/2,0)} 貼筒身`:'平板／依端部曲面壓製'],[pad?`估重 ${fmt(pad.weight,1)} kg`:'']].map(([t],i)=>text(330,70+i*24,t,{size:12,color:i?C.quiet:C.text})).join('')}${text(330,200,'小圓＝試漏孔（試驗後封孔依圖說）',{size:10})}${text(20,H-12,n.host==='shell'?'沿筒身展開：寬 = 2·Rn·asin(Rp/Rn)，Rn 為補強板中面半徑':'端部補強板以平面圓環估',{size:10})}`,'補強板展開');
}
export function manholeVisual(r,nozzleId){
  const m=r.attachments?.manholes.items.find(x=>x.id===nozzleId)??r.attachments?.manholes.items[0];if(!m)return '';
  const n=r.nozzlePlan.items.find(x=>x.id===m.id),W=560,H=250,sc=160/Math.max(m.diameter,n.projection+60),x0=60,yc=125;
  const neck=`<rect x="${x0}" y="${yc-n.od/2*sc}" width="${n.projection*sc}" height="${n.od*sc}" fill="${C.fill}" stroke="${C.metal}"/>`,flange=`<rect x="${x0+(n.projection-n.flangeThickness)*sc}" y="${yc-m.diameter/2*sc}" width="${n.flangeThickness*sc}" height="${m.diameter*sc}" fill="#e2caa6" stroke="#a07b45"/>`,cover=`<rect x="${x0+n.projection*sc+2}" y="${yc-m.diameter/2*sc}" width="${m.coverThickness*sc}" height="${m.diameter*sc}" fill="#cfb58a" stroke="#a07b45"/>`;
  const davit=m.davit==='davit'?`<path d="M${x0+n.projection*sc+m.coverThickness*sc+2} ${yc-m.diameter/2*sc-6}Q${x0+n.projection*sc+40} ${yc-m.diameter/2*sc-60} ${x0+n.projection*sc-40} ${yc-m.diameter/2*sc-50}V${yc+20}" fill="none" stroke="${C.text}" stroke-width="3"/>`:m.davit==='hinge'?`<circle cx="${x0+n.projection*sc+8}" cy="${yc+m.diameter/2*sc+10}" r="6" fill="none" stroke="${C.text}" stroke-width="2"/>`:'';
  return svg(W,H,`<rect x="${x0-14}" y="20" width="14" height="${H-50}" fill="${C.fill2}" stroke="${C.metal}"/>${neck}${flange}${cover}${davit}${text(330,60,`${m.id} 人孔 · 蓋板 Ø${fmt(m.diameter,0)} × ${fmt(m.coverThickness)}`,{size:13,color:C.text,weight:600})}${text(330,84,`蓋板 ${fmt(m.coverWeight,1)} kg${m.davitWeight?` ＋ ${m.davit==='davit'?'吊桿':'鉸鏈'} ${fmt(m.davitWeight,1)} kg`:''}`,{size:12})}${text(330,108,`頸管 Ø${fmt(n.od)} × ${fmt(n.thickness)} · 外伸 ${fmt(n.projection)}`,{size:12})}${text(330,132,'螺栓、墊片與把手依法蘭規格另列',{size:11})}`,'人孔組立');
}
// ---------------------------------------------------------------- supports
export function supportVisual(r){
  const s=r.attachments?.supports;if(!s||s.type==='none')return emptyCard('尚未選擇支撐');
  const W=620,H=340,g=s.geometry,vertical=r.orientation==='vertical';
  if(s.type==='saddles'){
    const e=elevation(r,{x:20,y:44,w:340,h:200},{extra:{below:g.clearance}});
    const saddle=g.positions.map(y=>{const top=e.to([-r.od/2,y]),bottom=e.to([-r.od/2-g.clearance,y]),w=g.width*e.s;return `<rect x="${top[0]-w/2}" y="${top[1]}" width="${w}" height="${bottom[1]-top[1]}" fill="${C.fill2}" stroke="${C.metal}"/>`;}).join('');
    const ground=e.to([-r.od/2-g.clearance,0]),end=e.to([-r.od/2-g.clearance,r.frame.total]),gy=ground[1];
    const tangents=[r.frame.bottomTangent,r.frame.topTangent],aDims=g.positions.map((y,i)=>{const a=e.to([0,tangents[i]])[0],b=e.to([0,y])[0];return `<path d="M${a} ${gy+4}V${gy+26}" stroke="${C.dim}" stroke-dasharray="2 2" opacity=".7"/>${dim(Math.min(a,b),gy+20,Math.max(a,b),gy+20,'A '+fmt(g.A,0),{size:11})}`;}).join('');
    const Rs=g.Rs,sc=Math.min(100/Rs,(H-96)/(2*Rs+g.hCentre)),cx=500,cy=48+Rs*sc,half=rad(g.theta/2),arcAt=(R,a)=>[cx+R*Math.sin(a)*sc,cy+R*Math.cos(a)*sc],arc=Array.from({length:25},(_,i)=>arcAt(Rs,-half+2*half*i/24));
    const webBottom=cy+(Rs+g.hCentre)*sc,wear=g.wearAngle?(()=>{const h2=rad(g.wearAngle/2),outer=Array.from({length:25},(_,i)=>arcAt(Rs,-h2+2*h2*i/24)),inner=Array.from({length:25},(_,i)=>arcAt(r.od/2,h2-2*h2*i/24));return `<polygon points="${pts([...outer,...inner])}" fill="${C.accent}" fill-opacity=".55" stroke="${C.dim}" stroke-width=".8"/>`;})():'';
    const endView=`<circle cx="${cx}" cy="${cy}" r="${r.od/2*sc}" fill="${C.fill}" stroke="${C.metal}" stroke-width="1.5"/><polygon points="${pts([[cx-g.webW/2*sc,webBottom],[cx+g.webW/2*sc,webBottom],...arc.slice().reverse()])}" fill="${C.fill2}" stroke="${C.metal}"/>${wear}<path d="M${cx} ${cy}L${arc[0][0]} ${arc[0][1]}M${cx} ${cy}L${arc[24][0]} ${arc[24][1]}" stroke="${C.dim}" stroke-dasharray="3 3"/>${text(cx,cy+30,g.theta+'°',{size:12,color:C.dim,anchor:'middle'})}<path d="M${cx-g.webW/2*sc-20} ${webBottom}H${cx+g.webW/2*sc+20}" stroke="${C.quiet}" stroke-width="2"/>${g.wearAngle?text(cx,webBottom+18,`墊板包角 ${g.wearAngle}°`,{size:10,anchor:'middle',color:C.dim}):''}`;
    return svg(W,H,`${e.body}${saddle}<path d="M${ground[0]} ${gy}L${end[0]} ${gy}" stroke="${C.quiet}" stroke-width="2"/>${aDims}${text(20,26,'側視：鞍座位置',{size:13,color:C.text,weight:600})}${endView}${text(cx,26,'端視：包角與腹板',{size:13,color:C.text,weight:600,anchor:'middle'})}`,'鞍座配置');
  }
  const e=elevation(r,{x:20,y:30,w:300,h:270},{extra:{below:s.type==='legs'?-g.floor+20:s.type==='skirt'?-g.floor+20:20,left:s.type==='lugs'?g.projection+40:100,right:s.type==='lugs'?g.projection+40:100}});
  let parts='';
  if(s.type==='legs'){for(const a of g.angles){const x=Math.sin(rad(a))*g.radius;if(Math.cos(rad(a))<-.2)continue;const top=e.to([x,g.top]),bottom=e.to([x,g.floor]);parts+=`<rect x="${top[0]-g.size/2*e.s}" y="${top[1]}" width="${Math.max(3,g.size*e.s)}" height="${bottom[1]-top[1]}" fill="${C.fill2}" stroke="${C.metal}"/><rect x="${bottom[0]-g.base/2*e.s}" y="${bottom[1]-4}" width="${g.base*e.s}" height="4" fill="${C.metal}"/>`;}}
  if(s.type==='skirt'){const top=e.to([-r.od/2,r.frame.bottomTangent]),bottom=e.to([r.od/2,g.floor]);parts+=`<rect x="${top[0]}" y="${top[1]}" width="${bottom[0]-top[0]}" height="${bottom[1]-top[1]}" fill="${C.fill2}" fill-opacity=".7" stroke="${C.metal}"/>${g.openings?`<circle cx="${(top[0]+bottom[0])/2}" cy="${bottom[1]-Math.min(g.height*.4,g.openingDiameter)*e.s}" r="${g.openingDiameter/2*e.s}" fill="#fff" stroke="${C.metal}"/>`:''}`;const ring=e.to([-g.ringOut,g.floor]),ring2=e.to([g.ringOut,g.floor]);parts+=`<rect x="${ring[0]}" y="${ring[1]-5}" width="${ring2[0]-ring[0]}" height="5" fill="${C.metal}"/>`;}
  if(s.type==='lugs'){const drawn=new Set();for(const a of g.angles){const x=Math.sin(rad(a));if(Math.abs(x)<.3)continue;const side=Math.sign(x);if(drawn.has(side))continue;drawn.add(side);const root=e.to([side*r.od/2,g.elevation]),tipX=root[0]+side*g.projection*e.s,beam=Math.max(30,g.projection*e.s+24);parts+=`<polygon points="${pts([[root[0],root[1]],[tipX,root[1]],[root[0],root[1]-g.height*e.s]])}" fill="${C.fill2}" stroke="${C.metal}"/><rect x="${(side>0?root[0]+4:root[0]-4-beam).toFixed(1)}" y="${root[1].toFixed(1)}" width="${beam.toFixed(1)}" height="7" fill="${C.quiet}"/>`;}parts+=text(20,H-18,'耳座坐在鋼構樑上（樑另計）',{size:11});}
  if(s.type==='anchors'){for(const a of g.angles){const x=Math.sin(rad(a));if(Math.cos(rad(a))<-.2)continue;const p0=e.to([x*(r.od/2+g.top/2),0]);parts+=`<rect x="${p0[0]-g.top/2*e.s}" y="${p0[1]-g.height*e.s}" width="${g.top*e.s}" height="${g.height*e.s}" fill="${C.fill2}" stroke="${C.metal}"/>`;}}
  const floorY=e.to([0,s.type==='legs'?g.floor:s.type==='skirt'?g.floor:0])[1];
  const plan=`<g transform="translate(470 170)"><circle r="80" fill="${C.fill}" stroke="${C.metal}" stroke-width="1.5"/>${(g.angles??g.bolts??[]).map(a=>`<circle cx="${(Math.sin(rad(a))*90).toFixed(1)}" cy="${(-Math.cos(rad(a))*90).toFixed(1)}" r="${s.type==='skirt'?4:7}" fill="${C.accent}" stroke="#fff" stroke-width="1.5"/>`).join('')}${text(0,-100,'0°',{size:11,anchor:'middle',color:C.dim})}${text(0,120,'俯視方位（順時針）',{size:11,anchor:'middle'})}</g>`;
  return svg(W,H,`${e.body}${parts}${s.type==='lugs'?'':`<path d="M20 ${floorY}H330" stroke="${C.quiet}" stroke-width="2"/>`}${plan}${text(20,22,s.summary??'',{size:13,color:C.text,weight:600})}`,'支撐配置');
}
// ---------------------------------------------------------------- rings, access, jacket, internals, lifting
export function ringsVisual(r){
  const items=r.attachments?.rings.items??[];if(!items.length)return emptyCard('尚未加入加強圈');
  const W=620,H=Math.max(330,316+Math.min(4,items.length-1)*17),e=elevation(r,{x:20,y:30,w:280,h:280});
  const marks=items.map(x=>{const a=e.to([-r.od/2-(x.side==='out'?x.a:0),x.elevation]),b=e.to([r.od/2+(x.side==='out'?x.a:0),x.elevation]);return `<path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}" stroke="${C.accent}" stroke-width="4"/>${text(b[0]+6,b[1]+4,x.id,{size:11,color:C.dim})}`;}).join('');
  const first=items[0],sc=Math.min(110/Math.max(first.a,first.b||first.a),2),ox=420,oy=110;
  const section=first.section==='flat'?`<rect x="${ox}" y="${oy}" width="${first.a*sc}" height="${first.t*sc}" fill="${C.fill2}" stroke="${C.metal}"/>`:first.section==='angle'?`<path d="M${ox} ${oy}h${first.t*sc}v${(first.b-first.t)*sc}h${(first.a-first.t)*sc}v${first.t*sc}h${-first.a*sc}z" fill="${C.fill2}" stroke="${C.metal}"/>`:`<path d="M${ox} ${oy}h${first.a*sc}v${first.t*sc}h${-(first.a-first.t)*sc}v${(first.b-2*first.t)*sc}h${(first.a-first.t)*sc}v${first.t*sc}h${-first.a*sc}z" fill="${C.fill2}" stroke="${C.metal}"/>`;
  return svg(W,H,`${e.body}${e.seamLines()}${marks}<rect x="${ox-14}" y="${oy-30}" width="8" height="160" fill="${C.fill}" stroke="${C.metal}"/>${section}${text(ox,oy-40,first.id+' '+first.spec,{size:13,color:C.text,weight:600})}${text(ox,oy+146,`中性軸 R${fmt(first.radius,1)} · 展開 ${fmt(first.length/1000,2)} m`,{size:11})}${text(ox,oy+164,first.plate?'板材切割環板':`型鋼 ${first.segments} 段（定尺 ${fmt(first.barLength)}）`,{size:11})}${text(ox,oy+182,`估重 ${fmt(first.weight,1)} kg`,{size:11})}${items.slice(1,5).map((x,i)=>text(ox,oy+206+i*17,`${x.id} ${x.spec} @${fmt(x.position,0)} · ${fmt(x.weight,0)} kg`,{size:10,color:C.quiet})).join('')}`,'加強圈位置與斷面');
}
export function accessVisual(r){
  const a=r.attachments?.access;if(!a||!(a.geometry.ladder||a.geometry.stair||a.geometry.platform||a.geometry.roofRail))return emptyCard('尚未加入梯台');
  const W=620,H=360,g=a.geometry,vertical=r.orientation==='vertical';
  if(g.stair){
    const st=g.stair,C1=2*PI*st.inner,dx=280,sx=dx/Math.max(C1,st.inner*rad(st.sweep)),sy=230/st.rise,ox=40,oy=300;
    const startX=ox+st.inner*rad(st.start)*sx,endX=startX+st.inner*rad(st.sweep)*sx;
    const band=`<rect x="${ox}" y="${oy-st.rise*sy}" width="${C1*sx}" height="${st.rise*sy}" fill="${C.fill}" stroke="${C.metal}"/><polygon points="${pts([[startX,oy],[startX+st.going*sx*3,oy],[endX+st.going*sx*3,oy-st.rise*sy],[endX,oy-st.rise*sy]])}" fill="#efe0c4" stroke="${C.dim}"/>`;
    const steps=Array.from({length:Math.min(60,st.risers)},(_,i)=>{const x=startX+(endX-startX)*i/st.risers,y=oy-st.rise*sy*i/st.risers;return `<path d="M${x} ${y}h${st.going*sx*3}" stroke="${C.dim}" stroke-width=".6"/>`;}).join('');
    const plan=`<g transform="translate(500 160)"><circle r="60" fill="${C.fill}" stroke="${C.metal}"/><path d="${arcPath(0,0,78,st.start,st.start+st.sweep)}" fill="none" stroke="${C.accent}" stroke-width="10" stroke-opacity=".7"/>${text(0,-90,'俯視盤梯範圍',{size:11,anchor:'middle'})}</g>`;
    return svg(W,H,`${text(20,24,`盤梯 ${st.risers} 級 · 級高 ${fmt(st.step,0)} · 踏面 ${fmt(st.going,0)} mm · 繞 ${fmt(st.sweep,0)}°`,{size:13,color:C.text,weight:600})}${band}${steps}${text(ox,oy+18,'筒身展開（由外側看）',{size:11})}${plan}${text(400,280,`內桁 ${fmt(st.innerLen/1000,2)} m · 外桁 ${fmt(st.outerLen/1000,2)} m`,{size:12})}`,'盤梯展開');
  }
  const e=elevation(r,{x:40,y:30,w:260,h:300},{extra:{below:-Math.min(0,g.ladder?.floor??0),above:g.ladder?(g.ladder.top-(vertical?r.frame.total:r.od))+50:200,right:400}});
  let draw='';
  if(g.ladder){const L=g.ladder,x=r.od/2+L.standoff,top=e.to([x,vertical?L.top:L.top]),bottom=e.to([x,L.floor]),w=Math.max(6,L.width*e.s);draw+=`<path d="M${top[0]} ${top[1]}V${bottom[1]}M${top[0]+w} ${top[1]}V${bottom[1]}" stroke="${C.text}" stroke-width="1.5"/>`;const n=Math.min(80,L.rungs);for(let i=0;i<n;i++){const y=bottom[1]-(bottom[1]-top[1])*(i+.5)/n;draw+=`<path d="M${top[0]} ${y}h${w}" stroke="${C.text}" stroke-width=".6"/>`;}if(L.cage){const cs=e.to([x,L.floor+L.cage.start]);draw+=`<rect x="${top[0]-6}" y="${top[1]}" width="${w+12}" height="${cs[1]-top[1]}" fill="none" stroke="${C.accent}" stroke-dasharray="3 3"/>`;}}
  if(g.platform){const a0=e.to([r.od/2,vertical?r.frame.bodyTop:r.od]),w=g.platform.width*e.s;draw+=`<rect x="${a0[0]}" y="${a0[1]-4}" width="${w}" height="5" fill="${C.dim}"/><path d="M${a0[0]+w} ${a0[1]-4}v${-1100*e.s}" stroke="${C.dim}"/>`;}
  if(g.roofRail){const a=e.to([-r.od/2,vertical?r.frame.bodyTop:r.od]),b=e.to([r.od/2,vertical?r.frame.bodyTop:r.od]);draw+=`<path d="M${a[0]} ${a[1]-1100*e.s}H${b[0]}M${a[0]} ${a[1]}v${-1100*e.s}M${b[0]} ${b[1]}v${-1100*e.s}" stroke="${C.dim}" stroke-dasharray="4 3"/>`;}
  return svg(W,H,`${e.body}${draw}${text(20,22,a.summary,{size:13,color:C.text,weight:600})}${g.ladder?text(360,80,`直梯 ${fmt(g.ladder.length/1000,2)} m · 踏條 ${g.ladder.rungs} 支 @${g.ladder.pitch}`,{size:12,color:C.text})+text(360,104,g.ladder.cage?`護籠由離地 ${fmt(g.ladder.cage.start,0)} mm 起 · ${g.ladder.cage.hoops} 環`:'未加護籠',{size:12})+(g.ladder.rest?text(360,128,`需中間平台約 ${g.ladder.rest} 處`,{size:12,color:C.warn}):''):''}${g.platform?text(360,160,`平台 ${fmt(g.platform.width)} × ${fmt(g.platform.length)} mm`,{size:12}):''}${g.roofRail?text(360,184,`槽頂欄杆 ${fmt(g.roofRail.length/1000,1)} m · 柱 ${g.roofRail.posts} 支`,{size:12}):''}`,'梯台配置');
}
function arcPath(cx,cy,R,a0,a1){const p=a=>[cx+R*Math.sin(rad(a)),cy-R*Math.cos(rad(a))],s=p(a0),e=p(Math.min(a1,a0+359.9));return `M${s[0].toFixed(1)} ${s[1].toFixed(1)}A${R} ${R} 0 ${a1-a0>180?1:0} 1 ${e[0].toFixed(1)} ${e[1].toFixed(1)}`;}
export function jacketVisual(r){
  const j=r.attachments?.jacket;if(!j||j.type==='none')return emptyCard('尚未加入夾套或盤管');
  const W=620,H=320,g=j.geometry;
  if(j.type==='halfpipe'||j.type==='coil'){
    const circ=j.type==='coil'?PI*g.diameter:PI*r.od,sx=320/circ,sy=240/r.bodyHeight,ox=40,oy=280;let lines='';const turns=Math.min(80,Math.ceil(g.turns));
    for(let i=0;i<turns;i++){const y0=g.from+i*g.pitch,y1=Math.min(g.to,y0+g.pitch);lines+=`<path d="M${ox} ${oy-y0*sy}L${ox+circ*sx*(y1-y0)/g.pitch} ${oy-y1*sy}" stroke="${C.accent}" stroke-width="${Math.max(1.5,g.pipeOD*sy)}" stroke-opacity=".75"/>`;}
    return svg(W,H,`<rect x="${ox}" y="${oy-r.bodyHeight*sy}" width="${circ*sx}" height="${r.bodyHeight*sy}" fill="${C.fill}" stroke="${C.metal}"/>${lines}${text(ox,24,j.summary,{size:13,color:C.text,weight:600})}${text(ox,oy+18,j.type==='coil'?'內盤管展開（盤管中心徑）':'筒身外表面展開',{size:11})}${text(400,90,`螺距 ${fmt(g.pitch)} mm · ${fmt(g.turns,1)} 圈`,{size:12,color:C.text})}${text(400,114,`總長 ${fmt(g.length/1000,1)} m`,{size:12})}${g.helixAngle?text(400,138,`螺旋角 ${fmt(g.helixAngle,2)}°`,{size:12}):''}${j.type==='halfpipe'?`<g transform="translate(470 210)"><rect x="-60" y="-6" width="120" height="12" fill="${C.fill2}" stroke="${C.metal}"/><path d="M-30 -6A30 30 0 0 1 30 -6" fill="none" stroke="${C.accent}" stroke-width="4"/>${text(0,30,'半管兩側角焊於筒身',{size:11,anchor:'middle'})}</g>`:''}`,'夾套展開');
  }
  const e=elevation(r,{x:30,y:30,w:280,h:270}),a=e.to([-r.od/2-g.gap,r.frame.bodyBottom+g.from]),b=e.to([r.od/2+g.gap,r.frame.bodyBottom+g.to]);
  return svg(W,H,`${e.body}<rect x="${a[0]-g.thickness*e.s}" y="${b[1]}" width="${b[0]-a[0]+2*g.thickness*e.s}" height="${a[1]-b[1]}" fill="none" stroke="${C.accent}" stroke-width="2.5"/>${text(30,22,j.summary,{size:13,color:C.text,weight:600})}${text(360,90,`夾套內徑 Ø${fmt(g.id,0)} · t${fmt(g.thickness)}`,{size:12})}${text(360,114,`上下封閉環各 1 圈`,{size:12})}`,'整體夾套');
}
export function internalsVisual(r){
  const i=r.attachments?.internals;if(!i?.geometry?.angles)return emptyCard('尚未加入擋板');
  const g=i.geometry,W=520,H=260,R=r.di/2,sc=100/R,cx=140,cy=130;
  const baffles=g.angles.map(a=>{const c=Math.cos(rad(a)),s=Math.sin(rad(a)),r0=(R-g.gap-g.width)*sc,r1=(R-g.gap)*sc;return `<path d="M${cx+s*r0} ${cy-c*r0}L${cx+s*r1} ${cy-c*r1}" stroke="${C.accent}" stroke-width="5"/>`;}).join('');
  return svg(W,H,`<circle cx="${cx}" cy="${cy}" r="${R*sc}" fill="${C.fill}" stroke="${C.metal}" stroke-width="1.5"/>${baffles}${text(280,80,i.summary,{size:13,color:C.text,weight:600})}${text(280,104,`離壁 ${fmt(g.gap,0)} mm · 長 ${fmt(g.length,0)} mm`,{size:12})}${text(280,128,`t${fmt(g.thickness)} · 支架 ${r.methods.internals.baffleBrackets} 只／片`,{size:12})}`,'擋板配置');
}
export function liftingVisual(r){
  const l=r.attachments?.lifting;if(!l?.loads)return emptyCard('尚未加入吊耳');
  const W=560,H=300,g=l.geometry,e=elevation(r,{x:150,y:120,w:260,h:160}),vertical=r.orientation==='vertical';
  const lugs=vertical?[e.to([-r.od/2,r.frame.bodyTop]),e.to([r.od/2,r.frame.bodyTop])]:[e.to([r.od/2,r.frame.bottomTangent+r.height*.2]),e.to([r.od/2,r.frame.topTangent-r.height*.2])];
  const hook=[(lugs[0][0]+lugs[1][0])/2,Math.min(lugs[0][1],lugs[1][1])-Math.tan(rad(g.slingAngle))*Math.abs(lugs[1][0]-lugs[0][0])/2];
  const slings=lugs.map(p=>`<path d="M${hook[0]} ${Math.max(10,hook[1])}L${p[0]} ${p[1]}" stroke="${C.text}" stroke-width="1.5"/>`).join('');
  return svg(W,H,`${e.body}${slings}${lugs.map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="${C.accent}"/>`).join('')}<circle cx="${hook[0]}" cy="${Math.max(10,hook[1])}" r="6" fill="none" stroke="${C.text}" stroke-width="2"/>${text(20,30,`吊重 ${fmt(l.loads.weight/1000,2)} t × ${l.loads.factor}`,{size:13,color:C.text,weight:600})}${text(20,54,`每只吊耳垂直 ${fmt(l.loads.vertical,1)} kN`,{size:12})}${text(20,78,`吊索拉力 ${fmt(l.loads.sling,1)} kN（${g.slingAngle}°）`,{size:12})}${text(20,102,`水平分力 ${fmt(l.loads.horizontal,1)} kN`,{size:12})}`,'吊裝受力');
}
// ---------------------------------------------------------------- welding
export const WELD_COLORS=Object.freeze({A:'#4b8eaa',B:'#c88931',C:'#7a5aa6',D:'#3f8a5f','附':'#8a97a3','底':'#a0603a','頂':'#a0603a'});
/** Category of the end-to-shell joint, matching the weld inventory. */
function endJointCategory(r,which){
  const type=r.endTypes[which],curb=r.methods.rings.some(x=>x.purpose==='curb');
  if(type==='flat')return 'C';
  if(type==='dome'||type==='cone'&&which==='top'&&r.orientation==='vertical'&&curb)return '頂';
  return type==='hemispherical'?'A':'B';
}
/** Plan (or end) view of one end with its seams, nozzles and the joint to the shell. Plan angles run clockwise from the top. */
export function endSeamPlan(r,which,cx,cy,Rpx){
  const end=r.ends[which],type=end.type,layout=r.layouts?.[which],start=Number(r.input.seamStart)||0,colors=WELD_COLORS;
  const flatOut=type==='flat'?r.od/2+(Number(r.input.overhang)||0):r.od/2,rOuter=Math.max(flatOut,layout?.method==='annular'?layout.outerRadius:0),s=Rpx/rOuter;
  const P=(x,z)=>[cx+x*s,cy-z*s],polar=(rho,deg)=>P(rho*Math.sin(rad(deg)),rho*Math.cos(rad(deg)));
  const line=(a,b,color,w=1.5)=>`<path d="M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}" stroke="${color}" stroke-width="${w}"/>`;
  const ring=(rho,color,w=1.5,dash='')=>`<circle cx="${cx}" cy="${cy}" r="${Math.max(.5,rho*s).toFixed(1)}" fill="none" stroke="${color}" stroke-width="${w}"${dash?` stroke-dasharray="${dash}"`:''}/>`;
  let g=`<circle cx="${cx}" cy="${cy}" r="${(flatOut*s).toFixed(1)}" fill="${type==='open'?'#fff':C.fill}" stroke="${C.metal}" stroke-width="1"${type==='open'?' stroke-dasharray="4 3"':''}/>`,note='';
  if(type==='open')return {svg:g+text(cx,cy+4,'開口',{size:11,anchor:'middle'}),note:'開口'};
  if(layout?.method==='sector'){
    const cos=Math.cos(Math.atan2(end.depth,Math.max(1e-9,end.ri-end.small/2)));
    for(const band of layout.bands){const pitch=360/band.segments,off=band.index%2===0?pitch/2:0;if(band.index>1)g+=ring(band.rho1*cos,colors.B);
      for(let k=0;k<band.segments;k++){const a=start+off+k*pitch;g+=line(polar(band.rho1*cos,a),polar(band.rho2*cos,a),colors.A);}}
    if(layout.rhoIn>1)g+=`<circle cx="${cx}" cy="${cy}" r="${(layout.rhoIn*cos*s).toFixed(1)}" fill="#fff" stroke="${C.metal}"/>`;
    note=`${layout.pieces.length} 片扇形板`;
  }else if(layout?.method==='petal'){
    const R=layout.sphere.radius,pr=phi=>R*Math.sin(phi);
    if(layout.single)note='整片壓製';
    else{g+=ring(pr(layout.crownAngle),colors.A);for(const band of layout.bands){if(band.index>1)g+=ring(pr(band.phi1),colors.A);for(let k=0;k<band.petals;k++){const a=start+k*360/band.petals;g+=line(polar(pr(band.phi1),a),polar(pr(band.phi2),a),colors.A);}}note=`中心板＋${layout.pieces.length} 瓣`;}
  }else if(layout?.method==='strips'||layout?.method==='annular'){
    const splice=layout.method==='strips'?layout:layout.centre,c=colors['底'];
    for(const seam of splice.rowSeams)g+=line(P(-seam.length/2,seam.y),P(seam.length/2,seam.y),c,1.2);
    for(const seam of splice.crossSeams)g+=line(P(seam.x,seam.y0),P(seam.x,seam.y1),c,1.2);
    if(layout.method==='annular'){g+=ring(layout.innerRadius+(splice.joint==='lap'?splice.lap:0),c,1.6)+ring(layout.outerRadius,C.metal,1);const n=layout.ring.pieces.length;for(let k=0;k<n;k++){const a=start+k*360/n;g+=line(polar(layout.innerRadius,a),polar(layout.outerRadius,a),c,1.6);}note=`環形邊板 ${n} 片＋中幅 ${splice.plates.length} 片`;}
    else note=`拼板 ${splice.plates.length} 片`;
  }else if(type==='flat')note='整片圓板';
  else{if(type==='torispherical'&&end.junctionRadius)g+=ring(end.junctionRadius,C.metal,.8,'3 3');else if(type==='elliptical')g+=ring(.8*r.di/2,C.metal,.8,'3 3');note='外購成形封頭';}
  g+=ring(r.od/2,colors[endJointCategory(r,which)],2.6);
  const sump=which==='bottom'?r.attachments?.misc?.geometry?.sump:null;
  if(sump){const [x,y]=P(sump.x,sump.z);g+=`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${Math.max(3,sump.diameter/2*s).toFixed(1)}" fill="#9fd0e2" stroke="${colors['附']}" stroke-width="1.6"/>`;}
  for(const n of r.nozzlePlan?.items??[])if(n.host===which){const [x,y]=P(n.surface[0],n.surface[2]);g+=`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${Math.max(2.5,n.od/2*s).toFixed(1)}" fill="#fff" stroke="${colors.D}" stroke-width="1.6"/>`;}
  return {svg:g,note};
}
export function weldMapVisual(r){
  const w=r.process?.weld;if(!w)return '';
  const colors=WELD_COLORS,vertical=r.orientation==='vertical',rows=[...w.byCategory].sort((a,b)=>b.length-a.length).slice(0,8);
  const ox=40,top=40,sw=340,sh=Math.min(150,sw*r.bodyHeight/r.circumference),oy=top+sh,sx=sw/r.circumference,sy=sh/r.bodyHeight,W=620,H=Math.round(Math.max(oy+186,110+rows.length*26));
  let lines=`<rect x="${ox}" y="${top}" width="${sw}" height="${sh}" fill="${C.fill}" stroke="${C.metal}"/>`;
  for(const piece of r.assembly.slice(0,600)){const x=ox+piece.start*sx,y0=oy-piece.z*sy,y1=oy-(piece.z+piece.height)*sy;lines+=`<path d="M${x} ${y0}V${y1}" stroke="${colors.A}" stroke-width="2"/>`;}
  for(let i=1;i<r.courses;i++){const y=oy-(i*(r.courseHeight+r.input.gap)-r.input.gap/2)*sy;lines+=`<path d="M${ox} ${y}H${ox+sw}" stroke="${colors.B}" stroke-width="2"/>`;}
  const edge=which=>colors[r.endTypes[which]==='open'?'':endJointCategory(r,which)]??'none';
  lines+=`<path d="M${ox} ${oy}H${ox+sw}" stroke="${edge('bottom')}" stroke-width="3"/><path d="M${ox} ${top}H${ox+sw}" stroke="${edge('top')}" stroke-width="3"/>`;
  for(const n of r.nozzlePlan?.items??[])if(n.host==='shell'){const x=ox+n.unfoldX*sx,y=oy-n.height*sy;lines+=`<circle cx="${x}" cy="${y}" r="${Math.max(3,n.hole/2*sx)}" fill="none" stroke="${colors.D}" stroke-width="2"/>`;}
  // End views below the development: left = top end (vertical) / A end (horizontal).
  const order=vertical?['top','bottom']:['bottom','top'],name=which=>vertical?(which==='top'?'頂部':'底部'):(which==='bottom'?'A 端':'B 端'),cy=oy+30+62;
  const ends=order.map((which,i)=>{const cx=ox+85+i*170,plan=endSeamPlan(r,which,cx,cy,58);return plan.svg+text(cx,cy+80,`${name(which)} · ${plan.note}`,{size:11,anchor:'middle',color:C.text});}).join('');
  const legendRows=rows.map((c,i)=>`<rect x="420" y="${52+i*26}" width="14" height="14" rx="3" fill="${colors[c.key]??'#999'}"/>${text(442,64+i*26,c.label,{size:11,color:C.text})}${text(612,64+i*26,fmt(c.length/1000,1)+' m',{size:11,anchor:'end'})}`).join('');
  const total=`${text(420,70+rows.length*26,`合計 ${fmt(w.totals.length/1000,1)} m`,{size:12,color:C.text,weight:600})}${text(420,90+rows.length*26,`對接 ${fmt(w.totals.butt/1000,1)} m · 角焊 ${fmt(w.totals.fillet/1000,1)} m`,{size:11})}`;
  return svg(W,H,`${text(ox,24,'焊道圖：筒身展開（由槽內側看）',{size:13,color:C.text,weight:600})}${lines}${text(ox,oy+26,vertical?'端部（俯視，方位順時針）':'兩端（端視）',{size:11})}${ends}${legendRows}${total}`,'焊道分類圖');
}
export function bevelVisual(r){
  const w=r.process?.weld;if(!w?.grooves.length)return '';
  const list=w.grooves.slice(0,4),W=620,H=200,cell=W/list.length;
  return svg(W,H,list.map((g,i)=>{const cx=cell*i+cell/2,t=g.t,s=Math.min(60/Math.max(t,4),6),half=Math.tan(rad((g.angle??60)/2)),gap=g.gap*s/2,top=40,bottom=top+t*s;
    let left,right;
    if(g.type==='I'){left=[[cx-80,top],[cx-gap,top],[cx-gap,bottom],[cx-80,bottom]];right=left.map(([x,y])=>[2*cx-x,y]);}
    else if(g.type==='V'){const face=g.face*s,o=(t-g.face)*s*half;left=[[cx-80,top],[cx-gap-o,top],[cx-gap,bottom-face],[cx-gap,bottom],[cx-80,bottom]];right=left.map(([x,y])=>[2*cx-x,y]);}
    else{const face=g.face*s,d=(t-g.face)/2*s,o=d*half,mid=top+d;left=[[cx-80,top],[cx-gap-o,top],[cx-gap,mid],[cx-gap,mid+face],[cx-gap-o,bottom],[cx-80,bottom]];right=left.map(([x,y])=>[2*cx-x,y]);}
    return `<polygon points="${pts(left)}" fill="${C.fill2}" stroke="${C.metal}"/><polygon points="${pts(right)}" fill="${C.fill2}" stroke="${C.metal}"/>${text(cx,24,`${g.type==='I'?'I 形':g.type==='V'?'單邊 V':'X 形'} · t${fmt(t)}`,{size:12,color:C.text,anchor:'middle',weight:600})}${text(cx,bottom+22,g.type==='I'?`間隙 ${fmt(g.gap)}`:`間隙 ${fmt(g.gap)} · ${g.angle}° · 鈍邊 ${fmt(g.face)}`,{size:10,anchor:'middle'})}${text(cx,bottom+40,`${fmt(g.area,1)} mm² · ${fmt(g.length/1000,1)} m`,{size:10,anchor:'middle',color:C.text})}`;}).join(''),'坡口斷面');
}
// ---------------------------------------------------------------- inspection & testing
export function toleranceVisual(r){
  const t=r.process?.tolerances;if(!t)return '';
  const W=620,H=250,items=t.items;
  const round=`<g transform="translate(110 130)"><circle r="70" fill="${C.fill}" stroke="${C.metal}" stroke-width="1.5"/>${Array.from({length:8},(_,i)=>{const a=i*PI/4;return `<path d="M0 0L${70*Math.sin(a)} ${-70*Math.cos(a)}" stroke="${C.dim}" stroke-dasharray="2 3"/>`;}).join('')}${text(0,96,'圓度：8 個方位量半徑／直徑',{size:11,anchor:'middle'})}</g>`;
  const plumb=`<g transform="translate(290 40)"><rect x="0" y="0" width="70" height="160" fill="${C.fill}" stroke="${C.metal}"/><path d="M78 0V160" stroke="${C.text}" stroke-dasharray="3 3"/><circle cx="78" cy="164" r="4" fill="${C.text}"/>${text(35,186,'垂直度：吊線量頂底偏差',{size:11,anchor:'middle'})}</g>`;
  const list=items.slice(0,5).map((it,i)=>text(400,60+i*34,it.name,{size:11})+text(612,60+i*34,it.value===null?it.formula:`${it.unit.startsWith('±')?'±':''}${fmt(it.value,1)} mm`,{size:13,color:C.text,anchor:'end',weight:600})+text(612,76+i*34,it.basis,{size:9,anchor:'end'})).join('');
  return svg(W,H,`${round}${plumb}${items.length?list:text(400,80,'未指定規範：記錄量測方法與實測值',{size:12})}${text(20,24,t.basis==='none'?'尺寸檢驗：量測方法':'尺寸檢驗（依 '+t.basisLabel+'）',{size:13,color:C.text,weight:600})}`,'尺寸公差與量測方法');
}
export function testVisual(r){
  const t=r.process?.test;if(!t)return '';
  const W=620,H=300,e=elevation(r,{x:30,y:30,w:240,h:250}),vertical=r.orientation==='vertical',clip=uid('test-clip');
  const level=t.hydro?Math.min(1,r.input.methods?.inspection?.testFill??1):0;
  const fill=r.methods.inspection.testFill/100,water=vertical?(()=>{const y=(r.ends.bottom.depth+r.height+r.ends.top.depth)*fill,a=e.to([-r.od/2,0]),b=e.to([r.od/2,r.frame.bottomTangent-r.ends.bottom.depth+y]);return `<rect x="${a[0]}" y="${b[1]}" width="${b[0]-a[0]}" height="${a[1]-b[1]}" fill="#9fd0e2" fill-opacity=".55" clip-path="url(#${clip})"/>`;})():(()=>{const a=e.to([-r.od/2,0]),b=e.to([-r.od/2+r.di*fill,r.frame.total]);return `<rect x="${a[0]}" y="${b[1]}" width="${b[0]-a[0]}" height="${a[1]-b[1]}" fill="#9fd0e2" fill-opacity=".55" clip-path="url(#${clip})"/>`;})();
  void level;
  return svg(W,H,`<defs><clipPath id="${clip}"><path d="${e.outline}"/></clipPath></defs>${e.body}${t.hydro?water:''}${text(300,50,t.hydro?`盛水 ${fmt(t.water,1)} m³（${fmt(t.waterMass/1000,1)} t）`:'未排盛水試驗',{size:13,color:C.text,weight:600})}${t.hydro?text(300,74,`灌水約 ${fmt(t.fillHours,1)} h · 試驗總重 ${fmt(t.totalLoad/1000,1)} t`,{size:12}):''}${t.testPressure?text(300,98,`試驗壓力 ${fmt(t.testPressure,1)} kPa(g)＋水柱 ${fmt(t.staticHead,1)} kPa`,{size:12,color:C.text}):''}${t.vacuumCount?text(300,122,`真空箱 ${t.vacuumCount} 次`,{size:12}):''}${t.padTests?text(300,146,`補強板試漏 ${t.padTests} 片（≤ 100 kPa）`,{size:12}):''}${(r.process.weld.nde.spots||r.process.weld.nde.rtLength)?text(300,170,`射線 ${r.process.weld.nde.modeLabel}：${r.process.weld.nde.spots?r.process.weld.nde.spots+' 處':fmt(r.process.weld.nde.rtLength/1000,1)+' m'}`,{size:12}):''}`,'試驗配置');
}
// ---------------------------------------------------------------- surface, level, erection
export function surfaceVisual(r){
  const s=r.process?.surface;if(!s)return '';
  const W=620,H=260,a=s.areas,rows=[['筒身外',a.shellOut],['筒身內',a.shellIn],['上端外',a.topOut],['上端內',a.topIn],['下端外',a.bottomOut],['下端內',a.bottomIn],['管嘴',a.nozzlesOut+a.nozzlesIn],['附件',a.attachments]].filter(x=>x[1]>1e-6),max=Math.max(...rows.map(x=>x[1]));
  const bars=rows.map(([k,v],i)=>`${text(20,46+i*24,k,{size:11})}<rect x="80" y="${36+i*24}" width="${Math.max(1,v/max*170).toFixed(1)}" height="12" rx="3" fill="${k.includes('內')?'#9fc4d4':'#4b8eaa'}"/>${text(318,46+i*24,fmt(v,1)+' m²',{size:11,anchor:'end',color:C.text})}`).join('');
  let right='';if(s.paint){right+=text(360,46,`塗裝 ${fmt(s.paint.area,1)} m² · 總膜厚 ${fmt(s.paint.dft,0)} μm`,{size:13,color:C.text,weight:600})+s.paint.coats.map((c,i)=>`<rect x="360" y="${62+i*30}" width="${Math.max(20,c.dft/3)}" height="20" fill="${['#c9b38a','#9fb7c4','#5e8fa8'][i]}" stroke="${C.metal}"/>${text(360+Math.max(20,c.dft/3)+10,76+i*30,`${c.name} ${c.dft} μm · ${fmt(c.liters,1)} L`,{size:11})}`).join('');}
  if(s.insulation)right+=text(360,180,`保溫 ${fmt(s.insulation.thickness)} mm · ${fmt(s.insulation.volume,2)} m³ · 鋁皮 ${fmt(s.insulation.cladding,1)} m²`,{size:12,color:C.text});
  if(!right)right=text(360,80,'塗裝、保溫或酸洗可在下方開啟',{size:12});
  return svg(W,H,`${text(20,22,'表面積',{size:13,color:C.text,weight:600})}${bars}${right}`,'表面積與塗裝');
}
export function levelVisual(r){
  const st=r.process?.strapping;if(!st)return '';
  const W=620,H=300,ox=60,oy=260,w=300,h=220,maxV=r.volume,curve=st.rows.map(x=>[ox+x.volume/maxV*w,oy-x.level/st.top*h]);
  const work=[ox+st.working.volume/maxV*w,oy-st.working.level/st.top*h];
  return svg(W,H,`<rect x="${ox}" y="${oy-h}" width="${w}" height="${h}" fill="${C.paper}" stroke="${C.light}"/><polyline points="${pts(curve)}" fill="none" stroke="#206c89" stroke-width="2.4"/><path d="M${ox} ${work[1]}H${work[0]}V${oy}" fill="none" stroke="${C.accent}" stroke-dasharray="4 3"/><circle cx="${work[0]}" cy="${work[1]}" r="5" fill="${C.accent}"/>${text(ox-8,oy-h+10,fmt(st.top,0),{size:10,anchor:'end'})}${text(ox-8,oy,'0',{size:10,anchor:'end'})}${text(ox+w,oy+16,fmt(maxV,2)+' m³',{size:10,anchor:'end'})}${text(ox,oy+16,'0',{size:10})}${text(ox,24,r.orientation==='vertical'?'液位（由最低點起 mm）↔ 容積':'液位（由筒底起 mm）↔ 容積',{size:13,color:C.text,weight:600})}${(()=>{const label=`使用 ${fmt(r.input.fill)}%：液位 ${fmt(st.working.level,0)} mm`,room=work[0]+8+label.length*7.2<ox+w,y=work[1]-8<oy-h+14?work[1]+18:work[1]-8;return text(room?work[0]+8:work[0]-8,y,label,{size:11,color:C.dim,anchor:room?'start':'end'});})()}${[[`滿液位`,`${fmt(st.top,0)} mm`,`${fmt(maxV,3)} m³`,true],[`使用 ${fmt(r.input.fill)}%`,`${fmt(st.working.level,0)} mm`,`${fmt(st.working.volume,3)} m³`,true],...[75,50,25].map(k=>[`${k}%`,`${fmt(levelForVolume(r,maxV*k/100),0)} mm`,`${fmt(maxV*k/100,3)} m³`,false])].map(([a,b,c,strong],i)=>text(392,60+i*26,a,{size:12,color:strong?C.text:C.quiet,weight:strong?600:400})+text(520,60+i*26,b,{size:12,color:C.text,anchor:'end'})+text(612,60+i*26,c,{size:11,anchor:'end'})).join('')}`,'液位容積對照');
}
export function erectionVisual(r){
  const e=r.process?.erection;if(!e)return '';
  const W=620,H=260;
  if(e.method==='jacking'||e.method==='airlift'){const stages=e.stages,max=Math.max(1,...stages.map(s=>s.weight)),bw=Math.min(60,520/stages.length);
    return svg(W,H,`${text(20,24,e.method==='jacking'?`倒裝法（液壓頂升）· 頂升機 ${e.jacks?.count??'—'} 台`:`倒裝法（充氣頂升）· 需 ${fmt(e.air?.pressure,2)} kPa（${fmt(e.air?.mmH2O,0)} mmH₂O）`,{size:13,color:C.text,weight:600})}${stages.map((s,i)=>{const h=s.weight/max*150,x=40+i*(bw+8);return `<rect x="${x}" y="${210-h}" width="${bw}" height="${h}" rx="3" fill="${i===stages.length-1?C.accent:'#4b8eaa'}"/>${text(x+bw/2,226,s.course?'第'+s.course+'圈':'',{size:10,anchor:'middle'})}${text(x+bw/2,204-h,fmt(s.weight/1000,1)+'t',{size:10,anchor:'middle',color:C.text})}`;}).join('')}${e.jacks?text(20,250,`依荷重 ${e.jacks.byLoad} 台、依間距 ${e.jacks.bySpacing} 台 · 每台 ${e.jacks.capacity} t · 係數 ${e.jacks.factor}`,{size:11}):''}`,'倒裝頂升荷重');}
  if(e.method==='bottomup'){const stages=e.stages,max=Math.max(1,...stages.map(s=>s.weight??0)),bw=Math.min(50,540/stages.length);return svg(W,H,`${text(20,24,'正裝法：逐圈往上吊裝',{size:13,color:C.text,weight:600})}${stages.map((s,i)=>{const h=(s.weight??0)/max*150,x=40+i*(bw+6);return `<rect x="${x}" y="${210-h}" width="${bw}" height="${h}" rx="3" fill="#4b8eaa"/>${text(x+bw/2,226,s.label.replace('第 ','').replace(' 圈','圈'),{size:9,anchor:'middle'})}`;}).join('')}${text(20,250,`最重單片 ${fmt(e.maxPiece,0)} kg（吊車選用）`,{size:11})}`,'正裝吊裝');}
  const env=e.envelope,limit=r.methods.erection,sc=Math.min(240/Math.max(env.length,limit.transportLength),120/Math.max(env.width,env.height,limit.transportWidth,limit.transportHeight));
  return svg(W,H,`${text(20,24,'整槽運送尺寸',{size:13,color:C.text,weight:600})}<rect x="40" y="60" width="${limit.transportLength*sc}" height="${limit.transportWidth*sc}" fill="none" stroke="${C.quiet}" stroke-dasharray="5 4"/><rect x="40" y="60" width="${env.length*sc}" height="${env.width*sc}" fill="${e.transport?.fits?'#cfe2ea':C.warnFill}" stroke="${e.transport?.fits?C.metal:C.warn}"/>${text(40,60+Math.max(env.width,limit.transportWidth)*sc+20,`長 ${fmt(env.length,0)} × 寬 ${fmt(env.width,0)} × 高 ${fmt(env.height,0)} mm · ${fmt(env.weight/1000,2)} t`,{size:12,color:C.text})}${text(40,60+Math.max(env.width,limit.transportWidth)*sc+40,env.governing?.length?`寬度由${env.governing.join('、')}外伸決定${env.governing.some(x=>['直梯','直梯護籠','平台','盤梯'].includes(x))?'；梯台可改現場安裝以縮小尺寸':''}`:'虛線＝可運尺寸（依運輸商）',{size:11})}`,'運輸尺寸');
}
function emptyCard(message){return `<div class="tank-method-empty">${esc(message)}</div>`;}
// ---------------------------------------------------------------- small fittings, cutting, heat treatment
export function miscVisual(r){
  const g=r.attachments?.misc?.geometry;if(!g||!(g.nameplate||g.grounding||g.sump))return emptyCard('尚未加入銘牌座、接地耳或集水坑');
  const panels=[];
  if(g.nameplate){const n=g.nameplate,s=.6;panels.push({w:200,draw:x=>`${text(x,24,'銘牌座',{size:13,color:C.text,weight:600})}<rect x="${x}" y="40" width="${n.w*s}" height="${n.h*s}" rx="3" fill="${C.fill2}" stroke="${C.metal}"/><path d="M${x+14} ${60}h${n.w*s-28}M${x+14} ${74}h${n.w*s-48}M${x+14} ${88}h${n.w*s-36}" stroke="${C.metal}" stroke-width="1.4" opacity=".6"/>${dim(x,40+n.h*s+20,x+n.w*s,40+n.h*s+20,`${n.w} × ${n.h} × ${n.t}`,{size:10})}<g transform="translate(${x+20} ${40+n.h*s+40})"><rect x="0" y="0" width="10" height="60" fill="${C.fill}" stroke="${C.metal}"/><rect x="10" y="12" width="${n.standoff*.6}" height="6" fill="${C.fill2}" stroke="${C.metal}"/><rect x="10" y="42" width="${n.standoff*.6}" height="6" fill="${C.fill2}" stroke="${C.metal}"/><rect x="${10+n.standoff*.6}" y="6" width="5" height="48" fill="${C.fill2}" stroke="${C.metal}"/>${text(58,34,`離壁 ${n.standoff}（保溫用）`,{size:10})}</g>`});}
  if(g.grounding){const q=g.grounding,s=1;panels.push({w:150,draw:x=>`${text(x,24,`接地耳 × ${q.count}`,{size:13,color:C.text,weight:600})}<rect x="${x+20}" y="40" width="${q.w*s}" height="${q.h*s}" rx="4" fill="${C.fill2}" stroke="${C.metal}"/><circle cx="${x+20+q.w*s/2}" cy="${40+q.h*s*.35}" r="${q.hole/2*s}" fill="#fff" stroke="${C.metal}"/>${dim(x+20,40+q.h*s+14,x+20+q.w*s,40+q.h*s+14,`${q.w} × ${q.h}`,{size:10})}${text(x+20,40+q.h*s+40,`t${q.t} · 孔 Ø${q.hole}`,{size:11})}${text(x+20,40+q.h*s+58,'焊於支撐或筒身下部',{size:10})}`});}
  if(g.sump){const sp=g.sump,R=r.di/2,ps=60/R,sc=Math.min(150/(sp.diameter+200),110/Math.max(sp.depth+60,1));panels.push({w:250,draw:x=>{const cx=x+125,top=70,w=sp.diameter*sc,d=sp.depth*sc;return `${text(x,24,`集水坑 Ø${fmt(sp.diameter,0)} × ${fmt(sp.depth,0)}`,{size:13,color:C.text,weight:600})}<path d="M${x} ${top}H${cx-w/2}V${top+d}H${cx+w/2}V${top}H${x+250}" fill="none" stroke="${C.metal}" stroke-width="3"/><rect x="${cx-w/2}" y="${top}" width="${w}" height="${d}" fill="#9fd0e2" fill-opacity=".35"/>${dim(cx-w/2,top+d+22,cx+w/2,top+d+22,'Ø'+fmt(sp.diameter,0),{size:10})}${dim(cx+w/2+14,top,cx+w/2+14,top+d,fmt(sp.depth,0),{size:10})}${text(x,top-8,'槽底板',{size:10})}<g transform="translate(${cx} ${top+d+90})"><circle r="${R*ps}" fill="${C.fill}" stroke="${C.metal}"/><circle cx="${sp.x*ps}" cy="${-sp.z*ps}" r="${Math.max(3,sp.diameter/2*ps)}" fill="#9fd0e2" stroke="${C.metal}"/>${text(R*ps+10,4,sp.offset>0?`距筒壁 ${fmt(sp.offset,0)} · ${fmt(sp.angle,0)}°`:'置中',{size:10})}</g>`;}});}
  let x=20;const body=panels.map(p=>{const out=p.draw(x);x+=p.w+20;return out;}).join('');
  return svg(Math.max(560,x),300,body,'銘牌座、接地耳與集水坑');
}
const CUT_LABELS={oxy:'火焰切割',plasma:'電漿切割',laser:'雷射切割',waterjet:'水刀'};
export function cuttingVisual(r){
  const c=r.process?.cutting;if(!c)return '';
  const rows=[...c.rows].sort((a,b)=>b.length-a.length).slice(0,9),max=Math.max(1,...rows.map(x=>x.length)),W=620,H=Math.max(270,70+rows.length*26);
  const bars=rows.map((row,i)=>{const y=58+i*26,w=row.length/max*125;return `${text(20,y+11,`${row.id} ${row.name}`.slice(0,13),{size:11,color:C.text})}<rect x="150" y="${y}" width="${Math.max(2,w).toFixed(1)}" height="14" rx="3" fill="${row.id==='孔'?C.accent:'#4b8eaa'}"/>${text(340,y+11,fmt(row.length/1000,1)+' m',{size:11,anchor:'end'})}`;}).join('');
  const edge=(x,y,type,label,value)=>{const plate=type==='pipe'?`<rect x="${x}" y="${y+6}" width="46" height="12" fill="${C.fill2}" stroke="${C.metal}"/><path d="M${x+46} ${y+6}L${x+56} ${y+12}L${x+46} ${y+18}" fill="${C.fill2}" stroke="${C.metal}"/>`:type==='single'?`<path d="M${x} ${y}H${x+40}L${x+56} ${y+24}H${x}Z" fill="${C.fill2}" stroke="${C.metal}"/>`:`<path d="M${x} ${y}H${x+44}L${x+56} ${y+12}L${x+44} ${y+24}H${x}Z" fill="${C.fill2}" stroke="${C.metal}"/>`;return `${plate}${text(x+68,y+10,label,{size:11,color:C.text})}${text(x+68,y+25,fmt(value/1000,1)+' m',{size:12,color:C.text,weight:600})}`;};
  const right=`${text(370,62,`${CUT_LABELS[c.method]} · 穿孔 ${c.pierces} 次`,{size:12,color:C.text})}${c.cutHours!==undefined?text(370,82,`切割約 ${fmt(c.cutHours,1)} h`,{size:12,color:C.text}):text(370,82,'填切割速度即可估工時',{size:11})}${text(370,116,`坡口加工：${{cut:'同步斜割',machine:'坡口機／刨邊機',grind:'砂輪修磨'}[r.methods.cutting.bevel]}`,{size:12,color:C.text,weight:600})}${(()=>{const list=[['single','單面坡口邊（V）',c.bevel.single],['double','雙面坡口邊（X）',c.bevel.double],['pipe','管端坡口',c.bevel.pipe]].filter(x=>x[2]>0);return list.length?list.map(([type,label,value],i)=>edge(370,130+i*36,type,label,value)).join(''):text(370,140,'全部 I 形對接，不需開坡口',{size:12})+text(370,158,'（板厚 ≤ I 形門檻，可在焊接頁調整）',{size:10});})()}${c.bevelHours!==undefined?text(370,250,`坡口約 ${fmt(c.bevelHours,1)} h`,{size:12,color:C.text}):''}`;
  return svg(W,H,`${text(20,26,`切割長度 ${fmt(c.total/1000,1)} m`,{size:13,color:C.text,weight:600})}${text(20,44,'依零件（下料外框＋內孔）',{size:10})}${bars}${right}`,'切割長度與坡口');
}
export function heatVisual(r){
  const h=r.process?.heat;if(!h)return '';
  const W=620,H=290,m=r.methods.heat;
  if(!h.perform){
    // Thickness gauge against the P-No.1 thresholds.
    const x0=40,w=320,max=Math.max(60,h.t*1.15),X=v=>x0+Math.min(v,max)/max*w,y=110;
    const zones=m.material==='p1'?`<rect x="${x0}" y="${y}" width="${X(32)-x0}" height="16" fill="#cfe6d6"/><rect x="${X(32)}" y="${y}" width="${X(38)-X(32)}" height="16" fill="#f6e2bd"/><rect x="${X(38)}" y="${y}" width="${x0+w-X(38)}" height="16" fill="${C.warnFill}"/>${text(X(16),y+34,'不需',{size:10,anchor:'middle'})}${text((X(32)+X(38))/2,y+34,'預熱 ≥95 °C 可免',{size:10,anchor:'middle'})}${text((X(38)+x0+w)/2,y+34,'需 PWHT',{size:10,anchor:'middle',color:C.warn})}${text(X(32),y-6,'32',{size:10,anchor:'middle'})}${text(X(38),y-6,'38 mm',{size:10,anchor:'middle'})}`:`<rect x="${x0}" y="${y}" width="${w}" height="16" fill="${C.paper}" stroke="${C.light}"/>`;
    const marker=`<path d="M${X(h.t)} ${y-14}V${y+20}" stroke="${C.text}" stroke-width="2.4"/>${text(X(h.t),y+56,`最厚板 ${fmt(h.t)} mm`,{size:12,color:C.text,anchor:'middle',weight:600})}`;
    if(r.input.code==='api650'&&m.material==='p1'){
      // API 650 tanks: no whole-tank PWHT; thick-plate large openings are stress-relieved as prefabricated assemblies.
      const list=h.openings.length?h.openings.map((id,i)=>text(40,96+i*20,`${id}：預製開孔組件 600～650 °C × 每 25 mm 1 h`,{size:12,color:C.warn})).join(''):text(40,96,'沒有需要消除應力的大開孔（NPS 12 以上且筒身板厚 > 25 mm）',{size:12});
      return svg(W,200,`${text(20,26,'API 650：整槽不做 PWHT',{size:13,color:C.text,weight:600})}${text(20,52,`最厚板 ${fmt(h.t)} mm · ${m.preheat>0?`預熱 ${m.preheat} °C`:'未設定預熱'}`,{size:12})}${list}`,'PWHT 判定');
    }
    return svg(W,240,`${text(20,26,m.material==='p1'?'P-No.1 碳鋼：依板厚判斷 PWHT':'PWHT 判定',{size:13,color:C.text,weight:600})}${zones}${m.material==='p1'?marker:''}${text(390,80,h.need===false?'不需 PWHT':h.need===true?'需 PWHT（目前未做）':'依 WPS 判定',{size:15,color:h.need===true?C.warn:C.text,weight:600})}${wrapText(390,104,h.reason,14,{size:11})}${m.preheat>0?text(390,190,`預熱 ${m.preheat} °C（焊前與層間）`,{size:12,color:C.text}):text(390,190,'未設定預熱',{size:11})}`,'PWHT 判定');
  }
  const cy=h.cycle,x0=60,y0=240,w=300,hh=190,tMax=cy.controlled+1.4,X=t=>x0+t/tMax*w,Y=T=>y0-T/700*hh;
  const t1=cy.upHours,t2=t1+cy.holdHours,t3=t2+cy.downHours;
  const grid=[0,200,425,600].map(T=>`<path d="M${x0} ${Y(T)}H${x0+w}" stroke="${C.light}" stroke-dasharray="${T===425?'5 4':'2 4'}"/>${text(x0-6,Y(T)+4,String(T),{size:10,anchor:'end'})}`).join('');
  const curve=`<path d="M${X(0)} ${Y(cy.load)}L${X(t1)} ${Y(cy.hold)}L${X(t2)} ${Y(cy.hold)}L${X(t3)} ${Y(cy.load)}" fill="none" stroke="${C.warn}" stroke-width="2.6"/><path d="M${X(0)} ${Y(30)}L${X(0)} ${Y(cy.load)}M${X(t3)} ${Y(cy.load)}Q${X(t3+.6)} ${Y(120)} ${X(tMax)} ${Y(60)}" fill="none" stroke="${C.warn}" stroke-width="1.6" stroke-dasharray="4 3"/>`;
  const labels=`${text((X(0)+X(t1))/2-6,(Y(cy.load)+Y(cy.hold))/2,`≤ ${fmt(cy.heatRate,0)} °C/h`,{size:10,color:C.dim,anchor:'end'})}${text((X(t1)+X(t2))/2,Y(cy.hold)-8,`${fmt(cy.hold,0)} °C × ${fmt(cy.holdHours*60,0)} 分`,{size:11,color:C.text,anchor:'middle',weight:600})}${text((X(t2)+X(t3))/2+8,(Y(cy.load)+Y(cy.hold))/2,`≤ ${fmt(cy.coolRate,0)} °C/h`,{size:10,color:C.dim})}${text(X(0)+4,Y(cy.load)+14,m.method==='local'?'≤ 425 °C 起控':'≤ 425 °C 入爐',{size:10})}${text(X(t3)+4,Y(cy.load)-6,m.method==='local'?'≤ 425 °C 保溫緩冷':'≤ 425 °C 出爐',{size:10})}${text(x0+w,y0+16,`${fmt(cy.controlled,1)} h（425 °C 以上）`,{size:10,anchor:'end'})}${text(x0,y0+16,'0',{size:10})}`;
  let right='';
  if(m.method==='local'&&h.local){const band=h.local.band,s=Math.min(1.2,140/Math.max(band*2,1));right=`${text(390,60,'局部加熱：環縫持溫帶',{size:12,color:C.text,weight:600})}<rect x="400" y="80" width="200" height="110" fill="${C.fill}" stroke="${C.metal}"/><rect x="${500-band*s/2}" y="80" width="${band*s}" height="110" fill="${C.warnFill}" stroke="${C.warn}" stroke-dasharray="3 2"/><path d="M500 80V190" stroke="${C.accent}" stroke-width="3"/>${dim(500-band*s/2,212,500+band*s/2,212,`持溫帶 ${fmt(band,0)} mm`,{size:10})}${text(390,240,`${h.local.seams.reduce((s,x)=>s+x.count,0)} 道環縫 · ${fmt(h.local.length/1000,1)} m`,{size:11})}`;}
  else{const f=h.furnace,size=h.size,L=f?.given?f.L:size.length*1.2,Hh=f?.given?Math.min(f.W,f.H):size.diameter*1.3,s=Math.min(200/Math.max(L,size.length),110/Math.max(Hh,size.diameter)),fx=400,fy=80,bad=f?.given&&(!f.fitsSection||(!f.fitsLength&&!(f.heats>1)));
    right=`${text(390,60,f?.given?`爐內 ${fmt(f.L,0)} × ${fmt(f.W,0)} × ${fmt(f.H,0)}`:'爐內尺寸未填（虛線為示意）',{size:12,color:C.text,weight:600})}<rect x="${fx}" y="${fy}" width="${L*s}" height="${Hh*s}" fill="none" stroke="${C.quiet}" stroke-dasharray="5 4"/><rect x="${fx+4}" y="${fy+(Hh-size.diameter)*s/2}" width="${size.length*s}" height="${size.diameter*s}" rx="${Math.min(10,size.diameter*s/3)}" fill="${bad?C.warnFill:C.fill}" stroke="${bad?C.warn:C.metal}"/>${f?.heats>1?Array.from({length:f.heats},(_,i)=>{const shift=f.L-1500,x=fx+4+shift*s*i,w=Math.min(f.L,size.length-shift*i)*s;return `<rect x="${x.toFixed(1)}" y="${(fy+Hh*s+8+i*8).toFixed(1)}" width="${w.toFixed(1)}" height="5" rx="2" fill="${C.accent}" fill-opacity=".75"/>`;}).join(''):''}${text(390,fy+Hh*s+22+(f?.heats>1?f.heats*8:0),`槽長 ${fmt(size.length,0)} · 外徑 Ø${fmt(size.diameter,0)}（含管嘴）`,{size:11})}${f?.heats>1?text(390,fy+Hh*s+40+f.heats*8,`分 ${f.heats} 次入爐（色條＝各次加熱段）`,{size:11,color:C.text})+text(390,fy+Hh*s+57+f.heats*8,'相鄰兩次重疊 ≥ 1.5 m',{size:11}):''}`;}
  return svg(W,H,`${text(20,26,`PWHT 熱循環（最厚板 ${fmt(h.t)} mm）`,{size:13,color:C.text,weight:600})}${grid}${curve}${labels}${right}`,'PWHT 熱循環與入爐');
}
/** Wraps text into lines of about `units` CJK widths. CJK characters may break anywhere; latin words, numbers and units stay
 *  whole; closing punctuation stays with the text before it. */
function wrapText(x,y,value,units,opts){
  const tokens=String(value??'').match(/[A-Za-z0-9.,+\-/°%≤≥×·~]+(?:\s?(?:mm|kPa|m|h|°C))?|\s+|[^\sA-Za-z0-9]/g)??[],cjk=ch=>/[\u2E80-\uFFEF]/.test(ch),width=tok=>[...tok].reduce((t,c)=>t+(cjk(c)?1:.56),0),closing=/^[：，；、。）」』,.;:!?%]$/;
  const lines=[];let line='',w=0;
  for(const tok of tokens){const tw=width(tok);if(/^\s+$/.test(tok)&&!line)continue;
    if(w+tw>units&&line&&!closing.test(tok)){lines.push(line.trimEnd());line=/^\s+$/.test(tok)?'':tok;w=line?tw:0;continue;}
    line+=tok;w+=tw;}
  if(line.trim())lines.push(line.trimEnd());
  return lines.slice(0,6).map((l,i)=>text(x,y+i*17,l,opts)).join('');
}
