import {createSteelSection,sectionPointAt} from './steel-sections.js';

const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(value,digits=3)=>Number.isFinite(value)?Number(value.toFixed(digits)).toString():'';
const RAD=Math.PI/180;
const norm=angle=>((angle%360)+360)%360;
const TYPES=Object.freeze([
 ['pipe','管線支管','一般圓管接法'],['chs','圓管支撐','CHS · 封閉外焊'],
 ['shs','方管','SHS'],['rhs','矩形管','RHS'],['h','H 型鋼','平翼緣'],
 ['i','I 型鋼','平翼緣'],['l','角鐵','L'],['c','槽鋼','C']
]);
const EXAMPLES=Object.freeze({
 shs:{sectionWidth:60,sectionHeight:60,sectionWall:3,sectionWeb:3,sectionFlange:3,sectionRadius:6},
 rhs:{sectionWidth:60,sectionHeight:40,sectionWall:3,sectionWeb:3,sectionFlange:3,sectionRadius:6},
 h:{sectionWidth:80,sectionHeight:100,sectionWall:6,sectionWeb:5,sectionFlange:8,sectionRadius:6},
 i:{sectionWidth:60,sectionHeight:100,sectionWall:6,sectionWeb:5,sectionFlange:8,sectionRadius:6},
 l:{sectionWidth:50,sectionHeight:75,sectionWall:6,sectionWeb:6,sectionFlange:6,sectionRadius:5},
 c:{sectionWidth:50,sectionHeight:100,sectionWall:6,sectionWeb:5,sectionFlange:8,sectionRadius:6}
});
const FIELD_LABELS=Object.freeze({sectionWidth:'截面寬 b',sectionHeight:'截面高 h',sectionWall:'實際壁厚 t',sectionWeb:'腹板厚 tw',sectionFlange:'翼緣厚 tf',sectionRadius:'實際圓角半徑 r',sectionRotation:'截面轉角',sectionSlope:'翼緣斜度'});
export const sectionFieldLabel=field=>FIELD_LABELS[field]??field;
export const isSteelSection=p=>(p.branchSection??'pipe')!=='pipe';

function icon(kind){
 let body;
 if(kind==='pipe'||kind==='chs')body='<path d="M112 52a40 40 0 1 1-80 0a40 40 0 1 1 80 0M100 52a28 28 0 1 0-56 0a28 28 0 1 0 56 0" fill-rule="evenodd"/>';
 else if(kind==='shs')body='<path d="M37 17H107V87H37ZM47 27V77H97V27Z" fill-rule="evenodd"/>';
 else if(kind==='rhs')body='<path d="M22 27H122V77H22ZM32 37V67H112V37Z" fill-rule="evenodd"/>';
 else if(kind==='h')body='<path d="M27 18H117V32H80V72H117V86H27V72H64V32H27Z"/>';
 else if(kind==='i')body='<path d="M47 10H97V24H78V80H97V94H47V80H66V24H47Z"/>';
 else if(kind==='l')body='<path d="M34 13H112V27H48V91H34Z"/>';
 else body='<path d="M38 12H111V27H53V77H111V92H38Z"/>';
 return `<svg viewBox="0 0 144 104" aria-hidden="true" focusable="false"><g fill="#b9dcec" stroke="#2677a5" stroke-width="2">${body}</g>${kind==='chs'?'<path d="M31 97H114" stroke="#8a99a5" stroke-width="4"/>':''}</svg>`;
}

/** Each graphic represents a material section; dimensions are custom supply
 * measurements, not a standard catalogue or a structural design selection. */
export function steelTypeCards(p){
 const selected=p.branchSection??'pipe';
 return `<div class="steel-choice" role="group" aria-label="支材截形"><p class="steel-choice-title">支材截形</p><div class="steel-shape-grid">${TYPES.map(([value,title,subtitle])=>`<button type="button" class="steel-shape-card" data-steel-section="${value}" aria-pressed="${selected===value}">${icon(value)}<strong>${title}</strong><span>${subtitle}</span></button>`).join('')}</div><p class="steel-help">鋼構支材皆為外焊支撐，母管保持封閉。選「管線支管」會改回外貼開孔。圖卡帶入自訂尺寸示例，請按供料修改。</p></div>`;
}

export function steelChoicePatch(p,value){
 if(!TYPES.some(([kind])=>kind===value))return null;
 if(value===(p.branchSection??'pipe'))return null;
 if(value==='pipe')return {branchSection:value,jointType:'on',motherOpening:true,projection:0,padEnabled:false};
 return {branchSection:value,...(EXAMPLES[value]??{}),sectionRotation:0,sectionSlope:0,jointType:'on',motherOpening:false,projection:0,padEnabled:false};
}

/** SHS has one supplied side dimension, so its two stored axes remain equal. */
export function steelDimensionPatch(p,field,value){
 if(!Object.hasOwn(FIELD_LABELS,field))return null;
 if(p.branchSection==='shs'&&(field==='sectionWidth'||field==='sectionHeight'))return {sectionWidth:value,sectionHeight:value};
 return {[field]:value};
}

const numberField=(p,key,label,note='',unit='mm')=>`<div class="field steel-field" data-field="${key}"><label for="param-${key}">${esc(label)}</label><div class="field-wrap"><input id="param-${key}" name="${key}" type="number" inputmode="decimal" step="any" value="${fmt(p[key])}" aria-describedby="note-${key}"><span class="field-unit">${unit}</span></div><small id="note-${key}">${esc(note)}</small><small class="field-error" hidden></small></div>`;

export function steelDimensionsMarkup(p){
 const kind=p.branchSection??'pipe';if(kind==='pipe'||kind==='chs')return '';
 const tube=kind==='shs'||kind==='rhs',angle=kind==='l',wing=['h','i','c'].includes(kind);
 const widthLabel=kind==='shs'?'方管邊長 b':angle?'橫腿長 b':'截面寬 b';
 const primary=numberField(p,'sectionWidth',widthLabel,'沿未旋轉截面的 u 方向。')+
  (kind==='shs'?'':numberField(p,'sectionHeight',angle?'直腿長 h':'截面高 h','沿未旋轉截面的 v 方向。'))+
  (tube||angle?numberField(p,'sectionWall',angle?'兩腿實際厚度 t':'實際壁厚 t','按供料／實測填寫。'):numberField(p,'sectionWeb','腹板厚 tw','中央腹板或槽鋼背板的實際厚度。')+numberField(p,'sectionFlange','翼緣厚 tf','上下翼緣的實際厚度。'));
 const radiusLabel=tube?'外圓角半徑 r':'內根圓角半徑 r';
 const radiusNote=tube?'內圓角按 max(r − t, 0) 計算；請核對實際內外角。':'腹板／翼緣或兩腿交界的凹根圓角；不把圓角當直角。';
 return `<div class="steel-dimensions"><p class="steel-help steel-custom-note">自訂實際截面，單位 mm。這些示例尺寸不是標準型號。</p><div class="fields-grid steel-fields">${primary}</div><details id="steel-section-detail" class="advanced-settings"><summary>供料圓角${wing?'與翼緣型式':''}</summary><div class="fields-grid steel-fields">${numberField(p,'sectionRadius',radiusLabel,radiusNote)}${wing?numberField(p,'sectionSlope','翼緣斜度','0° 為平翼緣。斜翼緣目前未支援：保留輸入，停止出圖，不改成 0。','°'):''}</div></details><p class="steel-help">截面定位原點取外框中心；角鐵／槽鋼不把外框中心當材料重心。</p></div>`;
}

const center=[160,118],rotationRadius=94;
const rotated=(point,angle)=>[point[0]*Math.cos(angle)-point[1]*Math.sin(angle),point[0]*Math.sin(angle)+point[1]*Math.cos(angle)];
function segmentPath(face){
 const start=face.start,end=face.end;
 if(face.kind==='arc'){
  const pieces=Math.max(1,Math.ceil(Math.abs(face.sweep)/Math.PI));
  return `M${fmt(start[0],8)} ${fmt(start[1],8)}`+Array.from({length:pieces},(_,i)=>{const point=i===pieces-1?end:sectionPointAt(face,face.length*(i+1)/pieces);return `A${fmt(face.radius,8)} ${fmt(face.radius,8)} 0 0 ${face.sweep>0?1:0} ${fmt(point[0],8)} ${fmt(point[1],8)}`;}).join('');
 }
 return `M${fmt(start[0],8)} ${fmt(start[1],8)}L${fmt(end[0],8)} ${fmt(end[1],8)}`;
}
function boundaryPath(boundary){
 return boundary.segments.map((face,i)=>segmentPath(face).replace(/^M[^AL]+/,(match)=>i?'':match)).join('')+'Z';
}
function safeSection(p){try{return createSteelSection(p);}catch{return null;}}

function distanceToFace(point,face){
 if(face.kind==='line'){
  const dx=face.end[0]-face.start[0],dy=face.end[1]-face.start[1],t=Math.max(0,Math.min(1,((point[0]-face.start[0])*dx+(point[1]-face.start[1])*dy)/(dx*dx+dy*dy)));
  return Math.hypot(point[0]-face.start[0]-t*dx,point[1]-face.start[1]-t*dy);
 }
 const a=Math.atan2(point[1]-face.center[1],point[0]-face.center[0]),delta=norm((a-face.startAngle)*Math.sign(face.sweep)/RAD)*RAD;
 if(delta<=Math.abs(face.sweep)+1e-10)return Math.abs(Math.hypot(point[0]-face.center[0],point[1]-face.center[1])-face.radius);
 return Math.min(Math.hypot(point[0]-face.start[0],point[1]-face.start[1]),Math.hypot(point[0]-face.end[0],point[1]-face.end[1]));
}
function faceTarget(face,faces,scale,selected){
 const attrs=`class="steel-face-hit${selected?' selected':''}" data-steel-face="${esc(face.id)}" tabindex="0" role="button" aria-pressed="${selected}" aria-label="材料面 ${esc(face.id)}：${esc(face.label)}"`,title=`<title>${esc(face.id)} · ${esc(face.label)}</title>`;
 const outline=selected?`<path d="${segmentPath(face)}" fill="none" stroke="#db7d18" stroke-width="${fmt(4/scale,8)}" pointer-events="none"/>`:'';
 if(face.kind==='arc')return `<path d="${segmentPath(face)}" ${attrs} fill="none" stroke="transparent" stroke-width="${fmt(12/scale,8)}">${title}</path>${outline}`;
 // A stroked horizontal/vertical line has a zero-height/width layout box.
 // Give each straight face an actual hit area and keep it separated from a
 // nearby parallel wall; tiny faces also have the explicit button list below.
 const midpoint=sectionPointAt(face,face.length/2),nearest=Math.min(...faces.filter(other=>other.id!==face.id).map(other=>distanceToFace(midpoint,other))),half=Math.max(Number.EPSILON*face.length,Math.min(6/scale,nearest*.32,face.length*.2));
 const tangent=[(face.end[0]-face.start[0])/face.length,(face.end[1]-face.start[1])/face.length],normal=[-tangent[1]*half,tangent[0]*half],trim=Math.min(half,face.length*.12),start=[face.start[0]+tangent[0]*trim,face.start[1]+tangent[1]*trim],end=[face.end[0]-tangent[0]*trim,face.end[1]-tangent[1]*trim],points=[[start[0]+normal[0],start[1]+normal[1]],[end[0]+normal[0],end[1]+normal[1]],[end[0]-normal[0],end[1]-normal[1]],[start[0]-normal[0],start[1]-normal[1]]];
 return `<polygon points="${points.map(q=>q.map(v=>fmt(v,8)).join(',')).join(' ')}" ${attrs} fill="transparent" stroke="none" pointer-events="all">${title}</polygon>${outline}`;
}

/** True section geometry uses the same line/arc material faces as the kernel.
 * SVG u is right and v is down; positive rotation follows u toward v, matching
 * the established view from the free end toward the joint. */
export function steelRotationMarkup(p,{selectedFace=null}={}){
 if(!isSteelSection(p))return '';
 const section=safeSection(p),valid=section?.valid&&Array.isArray(section.boundaries),angle=Number.isFinite(p.sectionRotation)?p.sectionRotation:0,rad=angle*RAD;
 let sectionMarkup='',faces=[],error='',errorDescription='';
 if(valid){
  faces=section.faces??section.boundaries.flatMap(boundary=>boundary.segments.map(face=>({...face,role:boundary.role})));
  const points=faces.flatMap(face=>[face.start,face.end,...(face.kind==='arc'?Array.from({length:9},(_,i)=>sectionPointAt(face,face.length*i/8)):[])]),radius=Math.max(1,...points.map(point=>Math.hypot(...point))),scale=78/radius;
  const material=section.boundaries.map(boundary=>boundaryPath(boundary)).join('');
  sectionMarkup=`<g transform="translate(${center}) scale(${fmt(scale,8)}) rotate(${fmt(angle,8)})"><path d="${material}" fill="#beddec" fill-rule="evenodd" stroke="#2677a5" stroke-width="${fmt(1.4/scale,8)}"/>${faces.map(face=>faceTarget(face,faces,scale,selectedFace===face.id)).join('')}</g>`;
  sectionMarkup+=faces.filter(face=>face.role!=='inner'&&face.length*scale>=24).map(face=>{const midpoint=sectionPointAt(face,face.length/2),q=rotated(midpoint,rad),length=Math.hypot(...q),offset=length?8/length:0;return `<text x="${fmt(center[0]+q[0]*scale+q[0]*offset)}" y="${fmt(center[1]+q[1]*scale+q[1]*offset+4)}" text-anchor="middle" class="steel-face-label">${esc(face.id)}</text>`;}).join('');
 }else{
  const issue=section?.errors?.[0];
  error=`<text x="160" y="112" text-anchor="middle" class="steel-diagram-error">先修正截面尺寸</text><text x="160" y="136" text-anchor="middle" class="steel-diagram-caption">${issue?.field==='sectionSlope'?'斜翼緣目前未支援':'請核對供料尺寸與實際圓角'}</text>`;
  errorDescription=`<p class="steel-help" role="status">${esc(issue?.message??'截面尚無有效輪廓。')}</p>`;
 }
 const handle=[center[0]+rotationRadius*Math.cos(rad),center[1]+rotationRadius*Math.sin(rad)];
 const shortcuts=[0,90,180,270].map(value=>`<button type="button" data-visual-field="sectionRotation" data-visual-value="${value}" aria-pressed="${Math.abs(norm(angle)-value)<1e-8}">${value}°</button>`).join('');
 return `<div class="steel-rotation"><p class="steel-choice-title">截面朝哪個方向？</p><svg class="steel-rotation-map" viewBox="0 0 320 260" data-visual-map="steel-rotation" role="slider" tabindex="0" aria-label="鋼構截面轉角，由支材自由端朝接頭看，順時針為正" aria-valuemin="0" aria-valuemax="360" aria-valuenow="${fmt(norm(angle))}"><circle cx="${center[0]}" cy="${center[1]}" r="${rotationRadius}" fill="none" stroke="#becbd5" stroke-dasharray="3 4"/><path d="M160 118H270M160 118V226" fill="none" stroke="#9aadb9" stroke-width="1"/><path d="M265 114L271 118L265 122M156 221L160 227L164 221" fill="none" stroke="#9aadb9"/><text x="276" y="122" class="steel-datum-label">u</text><text x="268" y="106" text-anchor="end" class="steel-diagram-caption">0° → 母材 A／基準端</text><text x="156" y="243" class="steel-datum-label">v</text>${sectionMarkup}${error}<circle cx="160" cy="118" r="3" fill="#1764ad" pointer-events="none"/><circle cx="${fmt(handle[0])}" cy="${fmt(handle[1])}" r="9" fill="#1764ad" stroke="white" stroke-width="2"/><text x="160" y="259" text-anchor="middle" class="steel-diagram-caption">由支材自由端朝接頭看 · 順時針為正</text></svg>${errorDescription}<div class="steel-rotation-shortcuts" role="group" aria-label="截面轉角快速選擇">${shortcuts}</div><div class="steel-rotation-number">${numberField(p,'sectionRotation','截面轉角','點外圈、按方向鍵，或填精確角度。','°')}</div>${faces.length?`<details id="steel-material-faces" class="advanced-settings"><summary>材料面代號與紙樣</summary><div class="steel-face-buttons">${faces.map(face=>`<button type="button" data-steel-face="${esc(face.id)}" aria-pressed="${selectedFace===face.id}"><b>${esc(face.id)}</b><span>${esc(face.label)}</span></button>`).join('')}</div><p class="steel-help">面代號與裁切紙樣一致；圖上較小的面可由這裡選取。</p></details>`:''}</div>`;
}

export function steelRotationAction(p,x,y){
 if(!isSteelSection(p)||![x,y].every(Number.isFinite))return null;
 const distance=Math.hypot(x-center[0],y-center[1]);
 if(distance<82||distance>116)return null;
 return {field:'sectionRotation',value:Math.round(norm(Math.atan2(y-center[1],x-center[0])/RAD)*10)/10};
}
export function steelRotationKeyboardAction(p,key,{shiftKey=false}={}){
 if(!isSteelSection(p))return null;
 if(key==='Home')return {field:'sectionRotation',value:0};
 const direction=['ArrowLeft','ArrowUp'].includes(key)?-1:['ArrowRight','ArrowDown'].includes(key)?1:0;
 if(!direction||!Number.isFinite(p.sectionRotation))return null;
 return {field:'sectionRotation',value:norm(p.sectionRotation+direction*(shiftKey?15:1))};
}
