/** End-port alignment controls. The app owns events; the geometry kernel owns
 * validation. Coordinates passed to offsetAction are SVG viewBox coordinates.
 * During a captured drag, reuse the pointerdown params for both its transform
 * and offsetAction so a moving circle cannot change the pointer-to-mm scale. */
import {elbowAlignmentReference} from './elbow-axis.js';
import {createSteelSection,sampleSectionBoundary,sectionSupport} from './steel-sections.js';

const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=3)=>Number.isFinite(v)?Number(v.toFixed(d)).toString():'—';
const finite=v=>Number.isFinite(Number(v));
const endName=end=>String(end).toUpperCase()==='A'?'A':'B';
const modeKind=p=>/-(axis|offset|edge)$/.exec(p.elbowAlignment??'')?.[1]??'offset';
const mode=(end,kind)=>`${endName(end).toLowerCase()}-${kind}`;
const steelKind=p=>p.branchSection&&p.branchSection!=='pipe';
export function endSectionProjection(p,end){
 if(!steelKind(p))return null;
 const section=createSteelSection(p);if(!section.valid)return null;
 const a=Number(p.sectionRotation??0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a),backSign=endName(end)==='A'?1:-1;
 const boundaries=section.boundaries.map(b=>({id:b.id,role:b.role,points:sampleSectionBoundary(section,b.id,96).map(([x,y])=>[backSign*(x*c-y*s),x*s+y*c])}));
 return {section,boundaries,points:boundaries.flatMap(b=>b.points),backSign};
}
const direction=(p)=>{
 const x=Number(p.elbowOffset??0),z=Number(p.elbowSideOffset??0),length=Math.hypot(x,z);
 return !Number.isFinite(length)?[NaN,NaN]:length>0?[x/length,z/length]:[1,0];
};

export function alignmentModeAction(p,end,kind){
 if(!['axis','offset','edge'].includes(kind))return null;
 if(kind==='offset'&&modeKind(p)==='edge'){
  const layout=endOffsetLayout(p,end);
  if(layout)return {elbowAlignment:mode(end,kind),elbowOffset:layout.outward,elbowSideOffset:layout.side};
 }
 return {elbowAlignment:mode(end,kind),...(kind==='axis'?{elbowOffset:0,elbowSideOffset:0}:{})};
}

/** Physical circles and a shared display transform; no manufacturing clamp. */
export function endOffsetLayout(p,end){
 const E=endName(end),mainRadius=Number(p.mainOD)/2,kind=modeKind(p),steel=!!steelKind(p),profile=endSectionProjection(p,E);
 if(steel&&!profile)return null;
 const branchRadius=steel?Math.max(...profile.points.map(q=>Math.hypot(...q))):Number(p.branchOD)/2;
 if(![mainRadius,branchRadius].every(Number.isFinite)||mainRadius<=0||branchRadius<=0)return null;
 const unit=direction(p),support=steel?sectionSupport(p,[(E==='A'?1:-1)*unit[0],unit[1]]):branchRadius,
  edgeDistance=mainRadius-support;
 let outward=kind==='axis'?0:kind==='edge'?edgeDistance*unit[0]:Number(p.elbowOffset??0);
 let side=kind==='axis'?0:kind==='edge'?edgeDistance*unit[1]:Number(p.elbowSideOffset??0);
 if(![outward,side].every(Number.isFinite)||kind==='edge'&&edgeDistance<0)return null;
 const reference=elbowAlignmentReference({...p,elbowAlignment:mode(E,kind)});
 // The reference is the same line used by the finite-elbow solver. Project its
 // actual shift onto the port's outward-back normal and global +Z direction.
 const shift=reference?.offsetVector;
 if(Array.isArray(shift)&&!shift.every(Number.isFinite))return null;
 if(Array.isArray(shift)&&shift.length===3&&shift.every(Number.isFinite)){
  const g=Number(p.bendAngle)*Math.PI/180,normal=E==='A'?[0,-1,0]:[Math.sin(g),-Math.cos(g),0];
  outward=shift.reduce((sum,v,i)=>sum+v*normal[i],0);side=shift[2];
 }
 const sideSign=E==='A'?-1:1,screenX=sideSign*side,screenY=-outward;
 const projected=steel?profile.points.map(q=>[screenX+sideSign*q[1],screenY-q[0]]):null;
 const minX=steel?Math.min(-mainRadius,...projected.map(q=>q[0])):Math.min(-mainRadius,screenX-branchRadius),maxX=steel?Math.max(mainRadius,...projected.map(q=>q[0])):Math.max(mainRadius,screenX+branchRadius);
 const minY=steel?Math.min(-mainRadius,...projected.map(q=>q[1])):Math.min(-mainRadius,screenY-branchRadius),maxY=steel?Math.max(mainRadius,...projected.map(q=>q[1])):Math.max(mainRadius,screenY+branchRadius);
 const scale=Math.min(216/(maxX-minX),146/(maxY-minY));
 const cx=160-(minX+maxX)*scale/2,cy=110-(minY+maxY)*scale/2;
 return {end:E,kind,mainRadius,branchRadius,outward,side,sideSign,edgeDistance,unit,scale,cx,cy,steel,profile,
  branchX:cx+screenX*scale,branchY:cy+screenY*scale,offsetDistance:Math.hypot(outward,side),reference};
}

/** Clicking a coaxial/free diagram becomes a parallel offset. Clicking an edge
 * diagram selects its direction only: the radius difference remains fixed. */
export function offsetAction(p,end,svgX,svgY){
 if(![svgX,svgY].every(Number.isFinite)||svgX<0||svgX>320||svgY<0||svgY>220)return null;
 const layout=endOffsetLayout(p,end);if(!layout)return null;
 const outward=(layout.cy-svgY)/layout.scale,side=(svgX-layout.cx)/(layout.scale*layout.sideSign);
 if(layout.kind==='edge'){
  const length=Math.hypot(outward,side);if(length<1e-10)return null;
  return {elbowAlignment:mode(end,'edge'),elbowOffset:outward/length,elbowSideOffset:side/length};
 }
 return {elbowAlignment:mode(end,'offset'),elbowOffset:outward,elbowSideOffset:side};
}

/** Native shortcut buttons share the same semantics as the diagram. */
export function offsetSideAction(p,end,side){
 const unit={outer:[1,0],inner:[-1,0],'z-plus':[0,1],'z-minus':[0,-1]}[side];if(!unit)return null;
 const layout=endOffsetLayout(p,end);if(!layout)return null;
 const edge=layout.kind==='edge',distance=edge?1:layout.offsetDistance||10;
 return {elbowAlignment:mode(end,edge?'edge':'offset'),elbowOffset:unit[0]*distance,elbowSideOffset:unit[1]*distance};
}

/** Explicitly move toward the port centre and unlock the fixed edge distance.
 * Stopping at the centre is the stated retreat operation, not a hidden fit fix. */
export function retreatAction(p,end,amount=5){
 if(!finite(amount)||Number(amount)<0)return null;
 const layout=endOffsetLayout(p,end);if(!layout)return null;
 const distance=layout.offsetDistance,next=Math.max(0,distance-Number(amount));
 const unit=distance>0?[layout.outward/distance,layout.side/distance]:direction(p);
 return {elbowAlignment:mode(end,'offset'),elbowOffset:unit[0]*next,elbowSideOffset:unit[1]*next};
}

/** Arrow keys move in the displayed direction. Edge mode keeps its fixed length
 * and changes direction; Home returns offset mode to the port centre. */
export function offsetKeyboardAction(p,end,key,{shiftKey=false}={}){
 const layout=endOffsetLayout(p,end);if(!layout)return null;
 if(key==='Home')return layout.kind==='edge'?{elbowAlignment:mode(end,'edge'),elbowOffset:1,elbowSideOffset:0}:
  {elbowAlignment:mode(end,'offset'),elbowOffset:0,elbowSideOffset:0};
 const delta={ArrowUp:[1,0],ArrowDown:[-1,0],ArrowRight:[0,layout.sideSign],ArrowLeft:[0,-layout.sideSign]}[key];
 if(!delta)return null;
 const step=shiftKey?5:1;
 let outward=layout.outward+delta[0]*step,side=layout.side+delta[1]*step;
 if(layout.kind==='edge'){
  if(layout.offsetDistance===0){outward=layout.unit[0]+delta[0]*step;side=layout.unit[1]+delta[1]*step;}
  const length=Math.hypot(outward,side);if(length<1e-10)return null;
  outward/=length;side/=length;
 }
 return {elbowAlignment:mode(end,layout.kind==='edge'?'edge':'offset'),elbowOffset:outward,elbowSideOffset:side};
}

const centerCross=(x,y,size=7)=>`<path d="M${fmt(x-size,6)} ${fmt(y,6)}H${fmt(x+size,6)}M${fmt(x,6)} ${fmt(y-size,6)}V${fmt(y+size,6)}" class="end-center-cross"/>`;
function sectionMarkup(profile,sideSign,x,y,scale){
 const path=profile.boundaries.map(b=>b.points.map((q,i)=>`${i?'L':'M'}${fmt(x+sideSign*q[1]*scale,6)} ${fmt(y-q[0]*scale,6)}`).join(' ')+' Z').join(' ');
 return `<path d="${path}" fill-rule="evenodd" data-end-branch-section class="end-branch-circle"/>`;
}
function cardPicture(p,kind,end){
 if(steelKind(p)){
  const layout=endOffsetLayout({...p,elbowAlignment:mode(end,kind),elbowOffset:kind==='offset'?Number(p.mainOD)*.15:1,elbowSideOffset:0},end);
  if(!layout)return '';
  const scale=26/Math.max(layout.mainRadius,layout.branchRadius),cy=39,x=48+layout.sideSign*layout.side*scale,y=cy-layout.outward*scale;
  return `<svg viewBox="0 0 96 78" aria-hidden="true" focusable="false"><circle cx="48" cy="${cy}" r="${fmt(layout.mainRadius*scale,6)}" class="end-main-circle"/>${sectionMarkup(layout.profile,layout.sideSign,x,y,scale)}${centerCross(48,cy,4)}<circle cx="${fmt(x,6)}" cy="${fmt(y,6)}" r="2" class="end-branch-centre"/>${kind==='edge'?`<path d="M14 ${fmt(cy-layout.mainRadius*scale,6)}H82" class="end-common-edge"/>`:kind==='offset'?`<path d="M48 ${cy}L${fmt(x,6)} ${fmt(y,6)}" class="end-offset-line"/>`:''}</svg>`;
 }
 const main=Number(p.mainOD)/2,branch=Number(p.branchOD)/2;
 if(![main,branch].every(Number.isFinite)||main<=0||branch<=0)return '';
 const scale=26/Math.max(main,branch),r=main*scale,b=branch*scale;
 const shift=kind==='axis'?0:kind==='edge'?(main-branch)*scale:main*.3*scale;
 const cy=39,branchY=cy-shift;
 return `<svg viewBox="0 0 96 78" aria-hidden="true" focusable="false"><circle cx="48" cy="${cy}" r="${fmt(r,6)}" class="end-main-circle"/><circle cx="48" cy="${fmt(branchY,6)}" r="${fmt(b,6)}" class="end-branch-circle"/>${centerCross(48,cy,4)}<circle cx="48" cy="${fmt(branchY,6)}" r="2" class="end-branch-centre"/>${kind==='edge'?`<path d="M14 ${fmt(cy-r,6)}H82" class="end-common-edge"/>`:kind==='offset'?`<path d="M48 ${cy}V${fmt(branchY,6)}" class="end-offset-line"/>`:''}</svg>`;
}
function diagram(p,end,layoutParams){
 const actual=endOffsetLayout(p,end),fixed=layoutParams?endOffsetLayout(layoutParams,end):null;
 if(!actual)return `<p class="end-alignment-note end-alignment-invalid">${steelKind(p)?'先核對鋼構截面尺寸、轉角與偏移方向；外沿齊線需要有效截面及主管外徑。':modeKind(p)==='edge'&&Number(p.branchOD)>Number(p.mainOD)?'支管外徑大於主管，這種外沿齊線無法成立。請改用平行偏移。':'先輸入有效管徑與偏移量，才能顯示端口截面。'}</p>`;
 const {cx,cy,scale}=fixed??actual,branchX=cx+actual.sideSign*actual.side*scale,branchY=cy-actual.outward*scale;
 const r=actual.mainRadius*scale,b=actual.branchRadius*scale;
 const [outer,z]=actual.unit,nx=actual.sideSign*z,ny=-outer,tx=-ny,ty=nx;
 const edgeX=cx+r*nx,edgeY=cy+r*ny;
 const edge=actual.kind==='edge'?`<path d="M${fmt(edgeX-tx*87,6)} ${fmt(edgeY-ty*87,6)}L${fmt(edgeX+tx*87,6)} ${fmt(edgeY+ty*87,6)}" class="end-common-edge"/><circle cx="${fmt(edgeX,6)}" cy="${fmt(edgeY,6)}" r="3" class="end-edge-point"/>`:'';
 const left=actual.end==='A'?'+Z':'−Z',right=actual.end==='A'?'−Z':'+Z';
 const accessible=`由 ${actual.end} 管口向彎頭看；外背在上。支管往外背 ${fmt(actual.outward)} mm，側向 ${fmt(actual.side)} mm。${actual.kind==='edge'?'點選方向，依實際截面與轉角計算偏移。':`點選或拖曳${actual.steel?'藍色截面':'藍圈'}中心，方向鍵每次 1 mm，Shift 每次 5 mm。`}`;
 return `<svg class="end-offset-map" viewBox="0 0 320 220" data-end-offset-map="${actual.end}" data-end-scale="${fmt(scale,12)}" data-end-center-x="${fmt(cx,12)}" data-end-center-y="${fmt(cy,12)}" role="group" tabindex="0" aria-label="${esc(accessible)}"><rect x="0" y="0" width="320" height="220" fill="transparent"/><text x="160" y="18" text-anchor="middle" class="end-map-caption">外背 ↑</text><text x="160" y="215" text-anchor="middle" class="end-map-caption">內腹 ↓</text><text x="10" y="108" class="end-map-caption">${left}</text><text x="310" y="108" text-anchor="end" class="end-map-caption">${right}</text><path d="M${fmt(cx-r-10,6)} ${fmt(cy,6)}H${fmt(cx+r+10,6)}M${fmt(cx,6)} ${fmt(cy-r-10,6)}V${fmt(cy+r+10,6)}" class="end-port-datum"/><circle data-end-main-circle cx="${fmt(cx,6)}" cy="${fmt(cy,6)}" r="${fmt(r,6)}" class="end-main-circle"/><path d="M${fmt(cx,6)} ${fmt(cy,6)}L${fmt(branchX,6)} ${fmt(branchY,6)}" class="end-offset-line"/>${actual.steel?sectionMarkup(actual.profile,actual.sideSign,branchX,branchY,scale):`<circle data-end-branch-circle cx="${fmt(branchX,6)}" cy="${fmt(branchY,6)}" r="${fmt(b,6)}" class="end-branch-circle"/>`}${centerCross(cx,cy)}${edge}<circle cx="${fmt(branchX,6)}" cy="${fmt(branchY,6)}" r="22" fill="transparent" data-end-offset-handle/><circle cx="${fmt(branchX,6)}" cy="${fmt(branchY,6)}" r="5" class="end-branch-centre"/></svg><p class="end-map-basis">由 ${actual.end} 管口向彎頭看 · 外背朝上 · +Z 在${actual.end==='A'?'左':'右'}<span>灰圈：主管 Ø${fmt(p.mainOD)}　${actual.steel?`藍色截面：${esc(actual.profile.section.label)} · 轉角 ${fmt(p.sectionRotation)}°`:`藍圈：支管 Ø${fmt(p.branchOD)}`}</span></p>`;
}

export function endAlignmentMarkup(p,end,{layoutParams}={}){
 const E=endName(end),kind=modeKind(p),actual=endOffsetLayout(p,E),edge=kind==='edge';
 const cards=[['axis','同軸','中心線重合'],['offset','平行偏移','點圖移動中心'],['edge','外沿齊線','同一側外輪廓']].map(([k,title,note])=>{
  const value=mode(E,k),selected=p.elbowAlignment===value;
  return `<button type="button" class="end-alignment-card" data-visual-field="elbowAlignment" data-visual-value="${value}" aria-pressed="${selected}">${cardPicture(p,k,E)}<strong>${title}</strong><span>${note}</span>${selected?'<i aria-hidden="true">✓</i>':''}</button>`;
 }).join('');
 const sides=[['outer','外背'],['inner','內腹'],['z-plus',`${E==='A'?'左':'右'}側 (+Z)`],['z-minus',`${E==='A'?'右':'左'}側 (−Z)`]];
 const unit=actual?.offsetDistance>0?[actual.outward/actual.offsetDistance,actual.side/actual.offsetDistance]:direction(p);
 const selectedSide=Math.abs(unit[0]-1)<1e-8?'outer':Math.abs(unit[0]+1)<1e-8?'inner':Math.abs(unit[1]-1)<1e-8?'z-plus':Math.abs(unit[1]+1)<1e-8?'z-minus':null;
 const shortcutNote=edge?'點圖或按下方方向，選哪一側齊線。':`點圖、拖藍點移動；方向按鈕沿用偏移長度${actual?.offsetDistance===0?'（目前為零，按鈕會偏移 10 mm）':''}。`;
 const outward=actual?.outward??(edge?NaN:Number(p.elbowOffset??0)),side=actual?.side??(edge?NaN:Number(p.elbowSideOffset??0));
 const value=v=>Number.isFinite(v)?fmt(v,6):'';
 return `<div class="end-alignment-body" data-end-alignment="${E}"><p class="end-alignment-caption">支管沿 ${E} 管口方向延伸，選中心線怎麼對齊。</p><div class="end-alignment-cards" role="group" aria-label="${E} 管口對齊方式">${cards}</div><div class="end-offset-diagram">${diagram(p,E,layoutParams)}</div><p class="end-alignment-note end-shortcut-note">${shortcutNote}</p><div class="end-offset-sides" role="group" aria-label="偏移方向">${sides.map(([s,label])=>`<button type="button" data-end-offset-side="${s}" aria-pressed="${selectedSide===s&&kind!=='axis'}">${label}</button>`).join('')}</div><div class="end-offset-fields"><label for="param-elbowOffset"><span>往外背偏移 <small>mm</small></span><input id="param-elbowOffset" name="elbowOffset" type="number" step="any" inputmode="decimal" value="${value(outward)}" data-end-offset-field${edge?' readonly aria-readonly="true"':''}/><small>負值＝往內腹</small></label><label for="param-elbowSideOffset"><span>側向偏移 (+Z) <small>mm</small></span><input id="param-elbowSideOffset" name="elbowSideOffset" type="number" step="any" inputmode="decimal" value="${value(side)}" data-end-offset-field${edge?' readonly aria-readonly="true"':''}/><small>正值＝${E==='A'?'向左':'向右'}</small></label></div>${edge?`<p class="end-alignment-note end-edge-note">金線＝同側外輪廓齊線，偏移為 ${fmt(actual?.edgeDistance)} mm${steelKind(p)?`（依實際截面、轉角及方向計算）`:``}；不代表 3D 表面相切。齊線可能碰到管口；看 3D 檢查，必要時向中心退讓。</p><button type="button" class="end-retreat-button" data-end-retreat="5">往中心退讓 5 mm · 改為可調偏移</button>`:'<p class="end-alignment-note">負值與自訂偏移都保留；是否能加工，依 3D 與完整魚口檢查結果。</p>'}</div>`;
}
