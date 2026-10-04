/** Measured prismatic steel sections. No catalog dimensions or inferred
 * rolled fillets: supplied radii describe the actual profile in millimetres.
 * The reference is the outside bounding-box centre, not the centroid. */
export const STEEL_SECTION_TYPES=Object.freeze(['chs','shs','rhs','h','i','l','c']);
export const DEFAULT_STEEL_PARAMS=Object.freeze({branchSection:'rhs',sectionWidth:60,sectionHeight:80,
  sectionWall:4,sectionWeb:6,sectionFlange:8,sectionRadius:0,sectionRotation:0,sectionSlope:0});
const TAU=2*Math.PI,EPS=1e-9;
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,k)=>a.map(v=>v*k),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>a[0]*b[1]-a[1]*b[0],norm=p=>Math.hypot(...p);
const labels={chs:'圓形鋼管支撐',shs:'方管',rhs:'矩形管',h:'H 型鋼',i:'I 型鋼',l:'角鋼',c:'槽鋼'};
const wrap=a=>{a%=TAU;return a<0?a+TAU:a;};
const arcParameter=(face,angle)=>wrap((angle-face.startAngle)*Math.sign(face.sweep))/Math.abs(face.sweep);

export function sectionPointAt(face,distance) {
  if(!face||!Number.isFinite(distance)||distance<-EPS||distance>face.length+EPS)throw new RangeError('材料面距離超出範圍。');
  const t=Math.max(0,Math.min(1,distance/face.length));
  if(t===0)return [...face.start];if(t===1)return [...face.end];
  if(face.kind==='line')return add(face.start,mul(sub(face.end,face.start),t));
  const angle=face.startAngle+face.sweep*t;return [face.center[0]+face.radius*Math.cos(angle),face.center[1]+face.radius*Math.sin(angle)];
}

function roundedBoundary(points,radii,role) {
  const corners=points.map((point,i)=>{
    const before=points[(i+points.length-1)%points.length],after=points[(i+1)%points.length],incoming=sub(point,before),outgoing=sub(after,point),li=norm(incoming),lo=norm(outgoing),u=mul(incoming,1/li),v=mul(outgoing,1/lo),turn=Math.atan2(cross(u,v),dot(u,v)),radius=radii[i]??0;
    if(radius<=0||Math.abs(turn)<1e-12)return {before:point,after:point,tangent:0};
    const tangent=radius*Math.tan(Math.abs(turn)/2),start=sub(point,mul(u,tangent)),end=add(point,mul(v,tangent)),center=add(start,mul([-u[1],u[0]],Math.sign(turn)*radius));
    return {before:start,after:end,tangent,arc:{kind:'arc',start,end,center,radius,startAngle:Math.atan2(start[1]-center[1],start[0]-center[0]),sweep:turn,length:radius*Math.abs(turn)}};
  });
  const segments=[];
  for(let i=0;i<points.length;i++) {
    const j=(i+1)%points.length,edgeLength=norm(sub(points[j],points[i]));
    if(corners[i].tangent+corners[j].tangent>=edgeLength-1e-8)throw new RangeError('實測圓角半徑太大，相鄰圓角已重疊；請縮小根／轉角半徑。');
    const start=corners[i].after,end=corners[j].before,length=norm(sub(end,start));
    if(length>EPS)segments.push({kind:'line',start:[...start],end:[...end],length});
    if(corners[j].arc)segments.push(corners[j].arc);
  }
  return {id:role==='outer'?'O':'I',role,segments};
}
function boundaryArea(boundary) {
  return boundary.segments.reduce((sum,face)=>{
    if(face.kind==='line')return sum+cross(face.start,face.end)/2;
    const a=face.startAngle,b=a+face.sweep,r=face.radius,[x,y]=face.center;
    return sum+(r*r*face.sweep+r*(x*(Math.sin(b)-Math.sin(a))-y*(Math.cos(b)-Math.cos(a))))/2;
  },0);
}

export function createSteelSection(raw={}) {
  const p={...DEFAULT_STEEL_PARAMS,...raw},errors=[],error=(field,message)=>errors.push({field,message});
  if(!STEEL_SECTION_TYPES.includes(p.branchSection))error('branchSection','請選圓鋼管、方管、矩形管、H／I、角鋼或槽鋼截面。');
  for(const field of ['sectionWidth','sectionHeight','sectionWall','sectionWeb','sectionFlange','sectionRadius','sectionRotation','sectionSlope']){p[field]=Number(p[field]);if(!Number.isFinite(p[field]))error(field,'截面尺寸必須是有限數值。');}
  if(p.sectionRadius<0)error('sectionRadius','實測圓角半徑不可小於 0。');
  if(p.sectionSlope!==0)error('sectionSlope','目前只計算平翼緣的實測自訂截面；斜翼緣須輸入完整實測形狀，不能用平翼緣替代。');
  const kind=p.branchSection,W=kind==='shs'?p.sectionWidth:p.sectionWidth,H=kind==='shs'?W:p.sectionHeight,t=p.sectionWall,tw=p.sectionWeb,tf=p.sectionFlange,r=p.sectionRadius;
  if(kind==='chs') {
    p.branchOD=Number(p.branchOD);p.branchWall=Number(p.branchWall);
    if(!Number.isFinite(p.branchOD)||p.branchOD<=0)error('branchOD','鋼管實際外徑必須大於 0。');
    if(!Number.isFinite(p.branchWall)||p.branchWall<=0||2*p.branchWall>=p.branchOD)error('branchWall','鋼管壁厚須大於 0 且小於外半徑。');
  }else{
    if(W<=0)error('sectionWidth','截面寬度須大於 0。');if(H<=0)error('sectionHeight','截面高度須大於 0。');
    if(['shs','rhs','l'].includes(kind)&&t<=0)error('sectionWall','實際壁／腿厚須大於 0。');
    if(['shs','rhs'].includes(kind)&&2*t>=Math.min(W,H))error('sectionWall','方矩形管壁厚造成內孔為零或負值。');
    if(kind==='l'&&t>=Math.min(W,H))error('sectionWall','角鋼腿厚須小於兩腿尺寸。');
    if(['h','i','c'].includes(kind)) {
      if(tw<=0||tw>=W)error('sectionWeb','腹板厚須大於 0 且小於截面寬。');
      if(tf<=0||2*tf>=H)error('sectionFlange','翼緣厚须大於 0 且小於高度一半。');
    }
    if(['shs','rhs'].includes(kind)&&2*r>=Math.min(W,H))error('sectionRadius','外轉角半徑須小於短邊的一半。');
  }
  if(errors.length)return {valid:false,errors,kind};
  let boundaries=[],width=W,height=H,minThickness=t;
  try {
    if(kind==='chs') {
      const R=p.branchOD/2,Ri=R-p.branchWall;width=height=2*R;minThickness=p.branchWall;
      boundaries=[{id:'O',role:'outer',segments:[{kind:'arc',start:[R,0],end:[R,0],center:[0,0],radius:R,startAngle:0,sweep:TAU,length:TAU*R}]},
        {id:'I',role:'inner',segments:[{kind:'arc',start:[Ri,0],end:[Ri,0],center:[0,0],radius:Ri,startAngle:0,sweep:-TAU,length:TAU*Ri}]}];
    }else if(kind==='shs'||kind==='rhs') {
      const rectangle=(w,h)=>[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]];
      boundaries=[roundedBoundary(rectangle(W,H),[r,r,r,r],'outer'),roundedBoundary(rectangle(W-2*t,H-2*t).reverse(),Array(4).fill(Math.max(0,r-t)),'inner')];
    }else if(kind==='l') {
      const x=-W/2,y=-H/2,points=[[x,y],[x+W,y],[x+W,y+t],[x+t,y+t],[x+t,y+H],[x,y+H]];
      boundaries=[roundedBoundary(points,[0,0,0,r,0,0],'outer')];
    }else if(kind==='c') {
      const x=-W/2,y=-H/2,points=[[x,y],[x+W,y],[x+W,y+tf],[x+tw,y+tf],[x+tw,y+H-tf],[x+W,y+H-tf],[x+W,y+H],[x,y+H]];
      boundaries=[roundedBoundary(points,[0,0,0,r,r,0,0,0],'outer')];minThickness=Math.min(tw,tf);
    }else {
      const x=-W/2,y=-H/2,points=[[x,y],[x+W,y],[x+W,y+tf],[tw/2,y+tf],[tw/2,y+H-tf],[x+W,y+H-tf],[x+W,y+H],[x,y+H],[x,y+H-tf],[-tw/2,y+H-tf],[-tw/2,y+tf],[x,y+tf]];
      boundaries=[roundedBoundary(points,[0,0,0,r,r,0,0,0,0,r,r,0],'outer')];minThickness=Math.min(tw,tf);
    }
  }catch(error){return {valid:false,errors:[{field:'sectionRadius',message:error.message}],kind};}
  const faces=[];
  for(const boundary of boundaries)boundary.segments.forEach((face,index)=>{
    face.id=`${boundary.id}${index+1}`;face.role=boundary.role;face.boundaryId=boundary.id;
    face.label=`${face.id} ${boundary.role==='inner'?'內面':'外面'}${face.kind==='arc'?'／實測圓弧':''}`;
    face.edgeStartId=`${boundary.id}E${index+1}`;face.edgeEndId=`${boundary.id}E${(index+1)%boundary.segments.length+1}`;faces.push(face);
  });
  const area=boundaries.reduce((s,b)=>s+boundaryArea(b),0);
  return {valid:true,errors:[],kind,label:labels[kind],origin:'bounding-box-center',
    bounds:{minX:-width/2,maxX:width/2,minY:-height/2,maxY:height/2},width,height,area,minThickness,
    dimensions:{width,height,wall:kind==='chs'?p.branchWall:t,web:tw,flange:tf,radius:r,rotation:p.sectionRotation,slope:0},boundaries,faces};
}

/** Support of the rotated real material profile in the supplied section-plane
 * direction. The direction is expressed in unrotated e0/e90 coordinates. */
export function sectionSupport(params,direction) {
  const section=createSteelSection(params);if(!section.valid||!Array.isArray(direction)||direction.length!==2||direction.some(v=>!Number.isFinite(v)))return NaN;
  const a=(Number(params.sectionRotation)||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a),n=[direction[0]*c+direction[1]*s,-direction[0]*s+direction[1]*c];
  let support=-Infinity;
  for(const face of section.boundaries[0].segments) {
    support=Math.max(support,dot(face.start,n),dot(face.end,n));
    if(face.kind==='arc') {
      const angle=Math.atan2(n[1],n[0]);if(arcParameter(face,angle)<=1+1e-12)support=Math.max(support,dot(face.center,n)+face.radius*norm(n));
    }
  }
  return support;
}

export function sampleSectionBoundary(section,boundaryId='O',circleSamples=64) {
  const boundary=section.boundaries.find(b=>b.id===boundaryId);if(!boundary)throw new RangeError('找不到材料邊界。');
  const points=[];
  for(const face of boundary.segments) {
    const count=face.kind==='arc'?Math.max(2,Math.ceil(circleSamples*Math.abs(face.sweep)/TAU)):1;
    for(let i=0;i<count;i++)points.push(sectionPointAt(face,face.length*i/count));
  }
  return [...points,[...points[0]]];
}

export function sectionContains(section,point) {
  if(!section?.valid||!Array.isArray(point)||point.some(v=>!Number.isFinite(v)))return false;
  const [x,y0]=point,y=y0+1e-10;let crossings=0;
  for(const face of section.faces) {
    if(face.kind==='line') {
      const v=sub(face.end,face.start),l2=dot(v,v),t=Math.max(0,Math.min(1,dot(sub(point,face.start),v)/l2));
      if(norm(sub(point,add(face.start,mul(v,t))))<1e-8)return true;
      if((face.start[1]>y)!==(face.end[1]>y)) {
        const at=face.start[0]+(y-face.start[1])*v[0]/v[1];if(at>x)crossings++;
      }
    }else {
      const delta=sub(point,face.center),angle=Math.atan2(delta[1],delta[0]);
      if(Math.abs(norm(delta)-face.radius)<1e-8&&arcParameter(face,angle)<=1+1e-10)return true;
      const sine=(y-face.center[1])/face.radius;if(Math.abs(sine)>=1)continue;
      const first=Math.asin(sine);
      for(const a of [first,Math.PI-first]) {
        const at=face.center[0]+face.radius*Math.cos(a),t=arcParameter(face,a);
        if(at>x&&t<1)crossings++;
      }
    }
  }
  return crossings%2===1;
}
