/** Functional visual controls. Geometry remains owned by the verified kernels.
 * SVG pointer coordinates are in the stated viewBox; the app owns events/state.
 * Every preset is a native button. Free point selection also exposes a keyboard
 * slider, and callers retain the existing exact numeric fields in a details fold.
 */
import {elbowAlignmentReference,elbowAlignmentLabel} from './elbow-axis.js';
const RAD=Math.PI/180, DEG=180/Math.PI;
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=2)=>Number.isFinite(v)?Number(v.toFixed(d)).toString():'—';
const norm=d=>((d%360)+360)%360;
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const style=(selected)=>selected?' visual-card-selected':'';
const svg=(body,viewBox='0 0 144 104')=>`<svg viewBox="${viewBox}" aria-hidden="true" focusable="false">${body}</svg>`;
const pipeBody='<path d="M19 53H125V78H19Z" fill="#e8eef5" stroke="#8198ae" stroke-width="2"/><path d="M19 65.5H125" stroke="#a5b6c6" stroke-dasharray="4 3"/>';
const branch=(inside=false,closed=false)=>`<path d="M56 12H88V${inside?83:53}H56Z" fill="#d2edfb" stroke="#1764ad" stroke-width="2"/>${closed?'<path d="M20 53H124M20 78H124" stroke="#8198ae" stroke-width="2"/>':`<path d="M60 53H84M60 78H84" stroke="${inside?'#d2edfb':'white'}" stroke-width="${inside?5:9}"/>`}<path d="M72 9V${inside?91:65}" stroke="#1764ad" stroke-dasharray="4 3"/><path d="M51 52l5-7l5 7m22 0l5-7l5 7" fill="none" stroke="#b3771f" stroke-width="2"/>`;
const card=(field,value,title,subtitle,picture,selected,extra='')=>`<button type="button" class="visual-card${style(selected)}" data-visual-field="${field}" data-visual-value="${esc(value)}" aria-pressed="${selected}" ${extra}>${picture}<strong>${title}</strong>${subtitle?`<span>${subtitle}</span>`:''}<i aria-hidden="true">${selected?'✓':''}</i></button>`;
const group=(label,body,note='',className='')=>`<div class="visual-choice ${className}" role="group" aria-label="${label}"><p class="visual-choice-title">${label}</p>${body}${note?`<p class="visual-help">${note}</p>`:''}</div>`;

export function hostTypeCards(p){
 const straight=svg(`${pipeBody}<ellipse cx="19" cy="65.5" rx="5" ry="12.5" fill="#f8fbfd" stroke="#8198ae"/>`);
 const elbow=svg('<path d="M25 78H49C69 78 87 60 87 40V18H62V40C62 47 56 53 49 53H25Z" fill="#e8eef5" stroke="#8198ae" stroke-width="2"/><path d="M25 65.5H49C62 65.5 74.5 54 74.5 40V18" fill="none" stroke="#a5b6c6" stroke-dasharray="4 3"/>');
 const cone=svg('<path d="M20 30L126 49V77L20 96Z" fill="#e8eef5" stroke="#8198ae" stroke-width="2"/><path d="M20 63H126" stroke="#a5b6c6" stroke-dasharray="4 3"/><ellipse cx="20" cy="63" rx="7" ry="33" fill="#f8fbfd" stroke="#8198ae"/><ellipse cx="126" cy="63" rx="3" ry="14" fill="#f8fbfd" stroke="#8198ae"/>');
 return group('插接的母材',`<div class="visual-card-grid visual-host-grid">${card('hostType','straight','直管','直的母管',straight,!p.hostType||p.hostType==='straight')}${card('hostType','elbow','彎頭','彎曲管身',elbow,p.hostType==='elbow')}${card('hostType','cone','大小管','錐形異徑母管',cone,p.hostType==='cone')}</div>`);
}

export function connectionCards(p){
 const choices=[['on',true,'外貼開孔','管端貼外壁；母管開孔',false],['in',true,'開孔內插','穿過母管壁，可向內凸入',true]];
 if(['elbow','cone'].includes(p.hostType))choices.push(['on',false,'外焊支撐','母管封閉；只修支管魚口',false]);
 return group('支管怎麼接？',`<div class="visual-card-grid">${choices.map(([joint,opening,title,subtitle,inside])=>{
  const selected=p.jointType===joint&&(p.motherOpening!==false)===opening;
  return card('connection',`${joint}-${opening}`,title,subtitle,svg(pipeBody+branch(inside,!opening)),selected,`data-visual-joint="${joint}" data-visual-opening="${opening}"${opening?'':' data-visual-wide="true"'}`);
 }).join('')}</div>`,'藍色是支管，灰色是母管，棕色小三角是接合處。');
}

function alignmentPicture(mode){
 const R=80,r=28,L=Math.sqrt(2*R*r+r*r),delta=Math.atan2(L,R),b=mode==='a-axis'?delta:mode==='b-axis'?Math.PI/2-delta:Math.PI/4;
 const s=.55,pt=(a,minor=0)=>[16+(R+minor)*Math.sin(a)*s,68-(R-(R+minor)*Math.cos(a))*s];
 const path=(minor,reverse=false)=>Array.from({length:25},(_,i)=>pt((reverse?24-i:i)*Math.PI/48,minor)).map((q,i)=>`${i?'L':'M'}${q.map(v=>fmt(v,3)).join(' ')}`).join('');
 const A=pt(0),B=pt(Math.PI/2),P=pt(b,r),end=mode==='a-axis'?[P[0]+25,P[1]]:mode==='b-axis'?[P[0],P[1]+25]:[P[0]+19*Math.sin(b),P[1]+19*Math.cos(b)];
 const body=`<path d="${path(r)}${path(-r,true).replace(/^M/,'L')}Z" fill="#e8eef5" stroke="#8198ae" stroke-width="1.5"/><path d="${path(0)}" fill="none" stroke="#a5b6c6" stroke-dasharray="4 3"/><path d="M${P}L${end}" stroke="#7dc6ed" stroke-width="14"/>${mode==='free'?'':`<path d="M${mode==='a-axis'?A:B}L${end}" stroke="#b3771f" stroke-width="2" stroke-dasharray="4 3"/>`}<circle cx="${P[0]}" cy="${P[1]}" r="3.5" fill="#1764ad"/><text x="5" y="71" fill="#45596e">A</text><text x="${B[0]-4}" y="15" fill="#45596e">B</text>`;
 return svg(body);
}
export function elbowAlignmentCards(p){
 return group('支管中心線怎麼放？',`<div class="visual-card-grid visual-alignment-grid">${[
  ['free','自己選位置','點弧線、再點側面'],['b-axis','對齊 B 端','支管與 B 端中心線重合'],['a-axis','對齊 A 端','支管與 A 端中心線重合']
 ].map(([value,title,sub])=>card('elbowAlignment',value,title,sub,alignmentPicture(value),(p.elbowAlignment??'free')===value)).join('')}</div>`,'A、B 是彎頭兩端。選同軸後，孔位與支管方向一起自動定位。');
}

/** Uniformly fitted projection of the true circular elbow, independent of pixels. */
export function elbowPlanLayout(p){
 const R=Number(p.bendRadius),r=Number(p.mainOD)/2,g=Number(p.bendAngle)*RAD;
 if(![R,r,g].every(Number.isFinite)||R<=0||r<=0||g<=0||g>Math.PI)return null;
 const physical=(b,minor=0)=>[(R+minor)*Math.sin(b),R-(R+minor)*Math.cos(b)];
 const boundary=[];for(let i=0;i<=80;i++){const b=g*i/80;boundary.push(physical(b,r),physical(b,-r));}
 const minX=Math.min(...boundary.map(q=>q[0])),maxX=Math.max(...boundary.map(q=>q[0]));
 const minY=Math.min(...boundary.map(q=>q[1])),maxY=Math.max(...boundary.map(q=>q[1]));
 const scale=Math.min(250/Math.max(1,maxX-minX),158/Math.max(1,maxY-minY));
 const left=35+(250-(maxX-minX)*scale)/2,bottom=191-(158-(maxY-minY)*scale)/2;
 const point=(b,minor=0)=>{const q=physical(b,minor);return [left+(q[0]-minX)*scale,bottom-(q[1]-minY)*scale];};
 const fromPoint=q=>[(q.x-left)/scale+minX,(bottom-q.y)/scale+minY];
 return {R,r,g,scale,point,fromPoint,physicalToPoint:q=>[left+(q[0]-minX)*scale,bottom-(q[1]-minY)*scale]};
}
const polyPath=points=>points.map((q,i)=>`${i?'L':'M'}${q.map(v=>fmt(v,3)).join(' ')}`).join(' ');
const elbowPath=(layout,r,reverse=false)=>polyPath(Array.from({length:49},(_,i)=>layout.point(layout.g*(reverse?48-i:i)/48,r)));
const safeBendValue=(value,p)=>{const end=Number(p.bendAngle),epsilon=Math.min(.1,end/100);return clamp(value,epsilon,end-epsilon);};

export function elbowPositionPicker(p){
 const layout=elbowPlanLayout(p);if(!layout)return '<p class="visual-help">先填入有效管徑與彎曲半徑，才可點選位置。</p>';
 const b=Number(p.bendPosition)*RAD,q=layout.point(b),back=(layout.R+layout.r)*b,A=layout.point(0),B=layout.point(layout.g),aligned=(p.elbowAlignment??'free')!=='free';
 const label=aligned?'管口條件自動定位':'① 在彎頭上點選位置';
 const ring=polyPath([layout.point(b,-layout.r),layout.point(b,layout.r)]);
 let axis='';if(aligned){const reference=elbowAlignmentReference(p),contact=layout.point(b,layout.r*Math.cos(p.surfaceClock*RAD)),ref=reference&&layout.physicalToPoint(reference.origin??reference.center);if(ref?.every(Number.isFinite)&&contact.every(Number.isFinite))axis=`<path d="M${ref}L${contact}" stroke="#b3771f" stroke-width="2" stroke-dasharray="5 4"/>`;}
 const controls=aligned?'':`<div class="visual-presets">${[[.25,'靠 A 端'],[.5,'彎頭中央'],[.75,'靠 B 端']].map(([f,t])=>`<button type="button" class="button" data-visual-field="bendPosition" data-visual-value="${fmt(p.bendAngle*f,8)}"${f===.5?' data-visual-intent="center"':''} aria-pressed="${Math.abs(p.bendPosition-p.bendAngle*f)<1e-8}">${t}</button>`).join('')}</div>`;
 return group(label,`<svg class="visual-map elbow-plan-map" viewBox="0 0 320 232" data-visual-map="elbow-position" ${aligned?'role="img"':`role="slider" tabindex="0" aria-label="彎頭插接截面；可點選弧線或按左右鍵調整" aria-valuemin="0" aria-valuemax="${p.bendAngle}" aria-valuenow="${fmt(p.bendPosition,6)}" aria-valuetext="A 端沿外背 ${fmt(back)} mm，截面 ${fmt(p.bendPosition)} 度"`}><path d="${elbowPath(layout,layout.r)}${elbowPath(layout,-layout.r,true).replace(/^M/,'L')}Z" fill="#e8eef5" stroke="#8198ae" stroke-width="1.6"/><path d="${elbowPath(layout,0)}" fill="none" stroke="#a5b6c6" stroke-dasharray="4 3"/><path d="${ring}" stroke="#1764ad" stroke-width="3"/>${axis}<circle cx="${q[0]}" cy="${q[1]}" r="6" fill="#1764ad" stroke="white" stroke-width="2"/><text x="${A[0]-17}" y="${A[1]+7}" class="visual-svg-label">A</text><text x="${B[0]+9}" y="${B[1]-10}" class="visual-svg-label">B</text><text x="160" y="222" text-anchor="middle" class="visual-svg-caption">藍線是所選截面；未表示孔形</text></svg>${controls}<output class="visual-readback">A 端沿外背 <strong>${fmt(back)} mm</strong> · 截面 ${fmt(p.bendPosition)}°</output>`,aligned?elbowAlignmentLabel(p)+'；金線為支管軸平面投影，改尺寸自動重算。':'從 A 端往 B 端量；選在靠近端部處，仍需整個魚口留在母材內。');
}

const elbowSides=[[0,'外背'],[45,'左上'],[90,'左側'],[135,'左下'],[180,'內腹'],[225,'右下'],[270,'右側'],[315,'右上']];
const straightSides=[[0,'管頂'],[45,'左上'],[90,'左側'],[135,'左下'],[180,'管底'],[225,'右下'],[270,'右側'],[315,'右上']];
export function physicalStraightClock(p){
 const radius=Number(p.mainOD)/2,offset=Number(p.offset);
 if(!(radius>0)||!Number.isFinite(offset)||Math.abs(offset)>=radius||!Number.isFinite(p.azimuth))return NaN;
 return norm(p.azimuth+Math.asin(offset/radius)*DEG);
}
export function azimuthForSurfaceClock(clock,p){
 const radius=Number(p.mainOD)/2,offset=Number(p.offset);
 if(![clock,radius,offset].every(Number.isFinite)||radius<=0||Math.abs(offset)>=radius)return NaN;
 return norm(clock-Math.asin(offset/radius)*DEG);
}
export function surfaceClockPicker(p){
 const elbow=p.hostType==='elbow',cone=p.hostType==='cone',localClock=elbow||cone,clock=localClock?norm(p.surfaceClock):physicalStraightClock(p),sides=elbow?elbowSides:straightSides,field=localClock?'surfaceClock':'surfaceContactClock',map=elbow?'elbow-clock':cone?'cone-clock':'straight-clock',view=elbow?'由 A 朝 B 看；外背在上':cone?'由 A 朝 B 看；管頂在上':'由主管基準端看向另一端；管頂在上';
 if(!Number.isFinite(clock))return '<p class="visual-help">先修正管徑與偏心，才可選側面。</p>';
 const selected=sides.find(([a])=>Math.abs(a-clock)<1e-7),phi=clock*RAD,q=[160-86*Math.sin(phi),160-86*Math.cos(phi)];
 return group(elbow?'② 在截面上點選側面':'② 點選主管哪一側',`<div class="visual-clock-face"><svg class="visual-map" viewBox="0 0 320 320" role="slider" tabindex="0" data-visual-map="${map}" aria-label="${view}；點圓周或按左右鍵調整" aria-valuemin="0" aria-valuemax="360" aria-valuenow="${fmt(clock,6)}" aria-valuetext="${selected?.[1]??'自訂側面'} ${fmt(clock)} 度"><circle cx="160" cy="160" r="86" fill="#e8eef5" stroke="#8198ae" stroke-width="2"/><circle cx="160" cy="160" r="72" fill="white" stroke="#b8c6d3"/><path d="M160 71V249M71 160H249" stroke="#bdcad6" stroke-dasharray="4 4"/><path d="M160 160L${q}" stroke="#1764ad" stroke-width="2"/><circle cx="${q[0]}" cy="${q[1]}" r="7" fill="#1764ad" stroke="white" stroke-width="2"/><text x="160" y="156" text-anchor="middle" class="visual-svg-caption">${localClock?'A → B':'基準端 → 遠端'}</text><text x="160" y="178" text-anchor="middle" class="visual-svg-label">${fmt(clock)}°</text></svg>${sides.map(([a,name])=>{const x=50-41*Math.sin(a*RAD),y=50-41*Math.cos(a*RAD);return `<button type="button" class="visual-clock-preset" data-visual-field="${field}" data-visual-value="${a}" aria-pressed="${selected?.[0]===a}" aria-label="${name} ${a} 度" style="left:${fmt(x,4)}%;top:${fmt(y,4)}%"><span>${name}</span><small>${a}°</small></button>`;}).join('')}</div><output class="visual-readback">已選 <strong>${selected?.[1]??'自訂側面'} ${fmt(clock)}°</strong></output>`,elbow?'截面從 A 朝 B 看；外背在上、內腹在下，左側是 90°。':cone?'從 A 端朝 B 端看；管頂在上、管底在下，左側是 90°。':'從主管基準端朝另一端看；管頂在上，左側是 90°。藍點包含現有偏心量。');
}

export function straightSurfacePosition(p){
 const radius=Number(p.mainOD)/2,offset=Number(p.offset),a=Number(p.angle)*RAD;
 if(![radius,offset,a,p.jointPosition].every(Number.isFinite)||radius<=0||Math.abs(offset)>=radius||Math.abs(Math.sin(a))<1e-10)return NaN;
 return p.jointPosition+Math.sqrt(radius*radius-offset*offset)/Math.tan(a);
}
export function straightPositionPicker(p){
 const length=Number(p.mainLength),pos=straightSurfacePosition(p);if(!Number.isFinite(pos)||!(length>0))return '<p class="visual-help">先修正主管長度、角度與偏心，才可選位置。</p>';
 const x=28+264*clamp(pos/length,0,1);
 return group('① 點選主管上的位置',`<svg class="visual-map straight-position-map" viewBox="0 0 320 158" role="slider" tabindex="0" data-visual-map="straight-position" aria-label="接頭距主管基準端；點管身或按左右鍵調整" aria-valuemin="0" aria-valuemax="${length}" aria-valuenow="${fmt(pos,6)}" aria-valuetext="距基準端 ${fmt(pos)} mm"><rect x="28" y="39" width="264" height="45" rx="6" fill="#e8eef5" stroke="#8198ae" stroke-width="2"/><path d="M28 61.5H292" stroke="#a5b6c6" stroke-dasharray="5 3"/><path d="M${x} 29V91" stroke="#1764ad" stroke-width="2"/><circle cx="${x}" cy="39" r="7" fill="#1764ad" stroke="white" stroke-width="2"/><path d="M28 90V122M${x} 90V122M28 114H${x}" stroke="#1764ad"/><text x="28" y="145" class="visual-svg-caption">基準端</text><text x="292" y="145" text-anchor="end" class="visual-svg-caption">另一端</text><text x="${clamp((28+x)/2,65,255)}" y="108" text-anchor="middle" class="visual-svg-label">${fmt(pos)} mm</text></svg><div class="visual-presets">${[[.25,'靠基準端'],[.5,'正中間'],[.75,'靠另一端']].map(([f,t])=>`<button type="button" class="button" data-visual-field="surfacePosition" data-visual-value="${fmt(length*f,8)}"${f===.5?' data-visual-intent="center"':''} aria-pressed="${Math.abs(pos-length*f)<1e-7}">${t}</button>`).join('')}</div><output class="visual-readback">距主管基準端 <strong>${fmt(pos)} mm</strong></output>`,'藍點是支管中心線碰到主管外壁的位置；孔形中心可能不同。');
}

/** A straight concentric taper. X is the physical outside-wall contact station. */
export function conePositionPicker(p){
 const length=Number(p.mainLength),diameterA=Number(p.mainOD),diameterB=Number(p.mainEndOD),pos=Number(p.jointPosition);
 if(![length,diameterA,diameterB,pos].every(Number.isFinite)||length<=0||diameterA<=0||diameterB<=0)return '<p class="visual-help">先填入兩端有效外徑與軸長，才可點選位置。</p>';
 const fraction=clamp(pos/length,0,1),x=28+264*fraction,centerY=84,maxDiameter=Math.max(diameterA,diameterB),halfA=42*diameterA/maxDiameter,halfB=42*diameterB/maxDiameter,half=halfA+(halfB-halfA)*fraction;
 const top=centerY-half,bottom=centerY+half;
 return group('① 點選大小管上的位置',`<svg class="visual-map cone-position-map" viewBox="0 0 320 206" role="slider" tabindex="0" data-visual-map="cone-position" aria-label="大小管插接位置；由 A 端沿軸長量，可點管身或按左右鍵調整" aria-valuemin="0" aria-valuemax="${length}" aria-valuenow="${fmt(pos,6)}" aria-valuetext="距 A 端沿軸長 ${fmt(pos)} mm"><path d="M28 ${centerY-halfA}L292 ${centerY-halfB}V${centerY+halfB}L28 ${centerY+halfA}Z" fill="#e8eef5" stroke="#8198ae" stroke-width="2"/><path d="M28 ${centerY}H292" stroke="#a5b6c6" stroke-dasharray="5 3"/><path d="M${x} ${top-9}V${bottom+9}" stroke="#1764ad" stroke-width="2"/><circle cx="${x}" cy="${top}" r="7" fill="#1764ad" stroke="white" stroke-width="2"/><path d="M28 ${centerY+halfA+10}V169M${x} ${bottom+10}V169M28 161H${x}" stroke="#1764ad"/><text x="28" y="24" class="visual-svg-label">A · Ø${fmt(diameterA)}</text><text x="292" y="24" text-anchor="end" class="visual-svg-label">B · Ø${fmt(diameterB)}</text><text x="${clamp((28+x)/2,70,250)}" y="154" text-anchor="middle" class="visual-svg-label">${fmt(pos)} mm</text><text x="160" y="194" text-anchor="middle" class="visual-svg-caption">側視示意，非比例；側面另選</text></svg><div class="visual-presets">${[[.25,'靠 A 端'],[.5,'正中間'],[.75,'靠 B 端']].map(([f,t])=>`<button type="button" class="button" data-visual-field="jointPosition" data-visual-value="${fmt(length*f,8)}"${f===.5?' data-visual-intent="center"':''} aria-pressed="${Math.abs(pos-length*f)<1e-7}">${t}</button>`).join('')}</div><output class="visual-readback">距 A 端沿軸長 <strong>${fmt(pos)} mm</strong></output>`,'藍線是插接截面；距離沿中心軸量，與沿斜面量的距離不同。');
}

const anglePicture=angle=>{const a=angle*RAD,cx=72,cy=74,end=[cx+39*Math.cos(a),cy-39*Math.sin(a)];return svg(`<path d="M14 69H130V87H14Z" fill="#e8eef5" stroke="#8198ae"/><path d="M${cx} ${cy}L${end}" stroke="#7dc6ed" stroke-width="19"/><path d="M${cx} ${cy}L${end}" stroke="#1764ad" stroke-dasharray="4 3"/><path d="M18 97H126l-5 -3m5 3l-5 3" fill="none" stroke="#8198ae"/><text x="14" y="106" font-size="8" fill="#62758a">A／基準端</text><text x="130" y="106" text-anchor="end" font-size="8" fill="#62758a">B／遠端</text><text x="72" y="18" text-anchor="middle" fill="#1764ad">${angle}°</text>`);};
export function branchAnglePicker(p){
 if(p.hostType==='elbow'&&(p.elbowAlignment??'free')!=='free')return `<output class="visual-readback">${esc(elbowAlignmentLabel(p))} · 自動角度 <strong>${fmt(p.angle,4)}°</strong></output>`;
 return group('支管要直插，還是斜插？',`<div class="visual-card-grid visual-angle-grid">${[45,90,135].map(a=>card('angle',a,a===90?'正向插接':a===45?'斜向 B／遠端':'斜向 A／基準端',`${a}°`,anglePicture(a),Math.abs(p.angle-a)<1e-8)).join('')}</div>`,p.hostType==='elbow'?'角度以所選截面的母管切線為基準；側向旋轉可在精確設定中調整。':p.hostType==='cone'?'角度以插接處當地母線切線為基準；90° 是垂直錐面插接。側向旋轉可在精確設定中調整。':'角度以主管軸線為基準；90° 是垂直插接。');
}

export function padShapeCards(p){
 const body=shape=>svg(`${shape}<ellipse cx="72" cy="52" rx="14" ry="16" fill="white" stroke="#b3771f" stroke-width="2"/>`);
 const choices=[['circle','圓形',body('<circle cx="72" cy="52" r="36" fill="#f9eddc" stroke="#b3771f" stroke-width="2"/>')],['ellipse','橢圓形',body('<ellipse cx="72" cy="52" rx="49" ry="34" fill="#f9eddc" stroke="#b3771f" stroke-width="2"/>')],['obround','長圓形',body('<rect x="22" y="20" width="100" height="64" rx="32" fill="#f9eddc" stroke="#b3771f" stroke-width="2"/>')],['rounded','圓角矩形',body('<rect x="22" y="20" width="100" height="64" rx="10" fill="#f9eddc" stroke="#b3771f" stroke-width="2"/>')]];
 return group('補強板外形',`<div class="visual-card-grid">${choices.map(([v,t,pic])=>card('padShape',v,t,'',pic,p.padShape===v)).join('')}</div>`,p.hostType==='elbow'?'這是成形板定位座標中的外形；雙向曲面不能當平板下料。留邊不足會停止出圖。':'這是展開基準面的外形；成形後貼合管身。留邊不足會停止出圖。');
}

/** Return semantic app actions, without reading or changing DOM/state. */
export function visualPointerAction(kind,q,p){
 if(!q||![q.x,q.y].every(Number.isFinite))return null;
 if(kind==='elbow-position'){
  if((p.elbowAlignment??'free')!=='free')return null;const layout=elbowPlanLayout(p);if(!layout)return null;
  const [x,y]=layout.fromPoint(q);let b=Math.atan2(x,layout.R-y);if(b<0)b+=Math.PI*2;
  if(b>layout.g){const A=layout.point(0),B=layout.point(layout.g);b=Math.hypot(q.x-A[0],q.y-A[1])<Math.hypot(q.x-B[0],q.y-B[1])?0:layout.g;}
  return {field:'bendPosition',value:safeBendValue(b*DEG,p)};
 }
 if(kind==='elbow-clock'||kind==='straight-clock'||kind==='cone-clock'){
  if(kind==='elbow-clock'&&(p.elbowAlignment??'free')!=='free')return null;
  if(Math.hypot(q.x-160,q.y-160)<24)return null;
  const clock=norm(Math.atan2(160-q.x,160-q.y)*DEG);
  const localClock=kind!=='straight-clock',value=localClock?clock:azimuthForSurfaceClock(clock,p);
  return Number.isFinite(value)?{field:localClock?'surfaceClock':'azimuth',value}:null;
 }
 if(kind==='straight-position'&&Number.isFinite(p.mainLength)&&p.mainLength>0)return {field:'surfacePosition',value:clamp((q.x-28)/264,0,1)*p.mainLength};
 if(kind==='cone-position'&&Number.isFinite(p.mainLength)&&p.mainLength>0)return {field:'jointPosition',value:clamp((q.x-28)/264,0,1)*p.mainLength};
 return null;
}
export function visualPresetAction(field,value,p){
 const number=Number(value);if(field==='surfaceContactClock'){const azimuth=azimuthForSurfaceClock(number,p);return Number.isFinite(azimuth)?{field:'azimuth',value:azimuth}:null;}
 if(['bendPosition','surfaceClock','surfacePosition','jointPosition','angle'].includes(field))return Number.isFinite(number)?{field,value:number}:null;
 return {field,value};
}
export function visualKeyboardAction(kind,key,p,{shiftKey=false}={}){
 const negative=['ArrowLeft','ArrowDown'].includes(key),positive=['ArrowRight','ArrowUp'].includes(key),home=key==='Home',end=key==='End';if(!negative&&!positive&&!home&&!end)return null;
 const direction=negative?-1:1;
 if(kind==='elbow-position'){
  if((p.elbowAlignment??'free')!=='free')return null;
  return {field:'bendPosition',value:safeBendValue(home?0:end?p.bendAngle:p.bendPosition+direction*(shiftKey?5:1),p)};
 }
 if(kind==='elbow-clock'||kind==='straight-clock'||kind==='cone-clock'){
  if(kind==='elbow-clock'&&(p.elbowAlignment??'free')!=='free')return null;
  const localClock=kind!=='straight-clock',clock=localClock?p.surfaceClock:physicalStraightClock(p),next=norm(home?0:end?359:clock+direction*(shiftKey?15:5));
  const value=localClock?next:azimuthForSurfaceClock(next,p);
  return Number.isFinite(value)?{field:localClock?'surfaceClock':'azimuth',value}:null;
 }
 if(kind==='straight-position'){
  const pos=straightSurfacePosition(p),next=home?0:end?p.mainLength:pos+direction*(shiftKey?10:1);
  return Number.isFinite(next)?{field:'surfacePosition',value:clamp(next,0,p.mainLength)}:null;
 }
 if(kind==='cone-position'&&Number.isFinite(p.mainLength)&&p.mainLength>0){
  const pos=Number(p.jointPosition),next=home?0:end?p.mainLength:pos+direction*(shiftKey?10:1);
  return Number.isFinite(next)?{field:'jointPosition',value:clamp(next,0,p.mainLength)}:null;
 }
 return null;
}


