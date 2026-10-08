// Flat developments and plate splicing for tank ends: cone sectors, spherical petals, spliced and annular bottoms.
// All outlines are in mm, in a piece-local frame whose bounding box starts at (0,0). Blanks add `trim` on every side.
const PI=Math.PI,rad=d=>d*PI/180;
const bbox=points=>{let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const [x,y] of points){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}return {x0,y0,x1,y1,w:x1-x0,h:y1-y0};};
const normalize=points=>{const b=bbox(points);return {outline:points.map(([x,y])=>[x-b.x0,y-b.y0]),w:b.w,h:b.h};};
export const fitsStock=(w,h,W,L)=>(w<=L+1e-6&&h<=W+1e-6)||(w<=W+1e-6&&h<=L+1e-6);
export function polygonArea(points){let s=0;for(let i=0;i<points.length;i++){const [x1,y1]=points[i],[x2,y2]=points[(i+1)%points.length];s+=x1*y2-x2*y1;}return Math.abs(s)/2;}
/** Annular sector (bisector along +y, apex at origin). angle in radians. */
export function sectorOutline(rho1,rho2,angle,steps=48){
  const pts=[];for(let i=0;i<=steps;i++){const a=-angle/2+angle*i/steps;pts.push([rho2*Math.sin(a),rho2*Math.cos(a)]);}
  if(rho1>1e-9)for(let i=steps;i>=0;i--){const a=-angle/2+angle*i/steps;pts.push([rho1*Math.sin(a),rho1*Math.cos(a)]);}else pts.push([0,0]);
  return pts;
}
/**
 * Splits an annular-sector development (cone, cone roof, annular ring) into radial bands and equal segments that fit the stock.
 * theta in degrees (total developed angle). bands / segments 0 = automatic (fewest bands, then fewest segments per band).
 */
export function sectorLayout({rhoIn,rhoOut,theta,stockWidth:W,stockLength:L,trim=0,bands=0,segments=0,maxBands=16}){
  const total=rad(theta),usableW=W-2*trim,usableL=L-2*trim;
  if(!(rhoOut>rhoIn)||!(total>0)||!(usableW>0&&usableL>0))return {valid:false,reason:'展開尺寸或原板尺寸無效。'};
  const tryBands=nb=>{const width=(rhoOut-rhoIn)/nb,out=[];
    for(let k=0;k<nb;k++){const rho1=rhoIn+k*width,rho2=rho1+width;let chosen=null;
      for(let ns=segments||1;ns<=(segments||720);ns++){const shape=normalize(sectorOutline(rho1,rho2,total/ns));if(fitsStock(shape.w,shape.h,usableW,usableL)){chosen={ns,shape};break;}}
      if(!chosen)return null;out.push({index:k+1,rho1,rho2,segments:chosen.ns,angle:theta/chosen.ns,...chosen.shape});}
    return out;};
  let list=null,nb=bands||1;
  for(;nb<=(bands||maxBands);nb++){list=tryBands(nb);if(list)break;}
  if(!list)return {valid:false,reason:bands||segments?'指定的分圈／分片數放不進原板；改為自動或換較大的原板。':'展開扇形分片後仍放不進原板；請換較大的原板。'};
  const pieces=[];for(const band of list)for(let i=0;i<band.segments;i++)pieces.push({band:band.index,index:i+1,w:band.w,h:band.h,outline:band.outline,area:polygonArea(band.outline),offset:band.index%2===0?band.angle/2:0});
  const radial=list.reduce((s,b)=>s+b.segments*(b.rho2-b.rho1),0),circ=list.slice(1).reduce((s,b)=>s+b.rho1*total,0);
  return {valid:true,bands:list,pieces,rhoIn,rhoOut,theta,radialSeams:list.reduce((s,b)=>s+b.segments,0),circSeams:list.length-1,radialLength:radial,circLength:circ,weldLength:radial+circ};
}
/** Flat petal (gore) between polar angles phi1..phi2 on a sphere of radius R, one of n around. Meridian-arc / parallel-arc approximation. */
export function petalOutline(R,phi1,phi2,n,steps=32){
  const S=R*(phi2-phi1),half=s=>PI*R*Math.sin(phi1+s/R)/n;
  // End edges follow the tangent-cone development of each parallel: an arc of radius R·tan φ centred on the crown side,
  // passing through the petal corners (±w, s) and bulging by its sagitta toward the outer side.
  const edge=(phi,s,w,reverse)=>{const rho=phi<PI/2-1e-9?R*Math.tan(phi):Infinity,pts=[];
    for(let i=0;i<=12;i++){const x=reverse?w-2*w*i/12:-w+2*w*i/12;pts.push([x,s+(Number.isFinite(rho)?Math.sqrt(Math.max(0,rho*rho-x*x))-Math.sqrt(Math.max(0,rho*rho-w*w)):0)]);}return pts;};
  const right=[],left=[];for(let i=1;i<steps;i++){const s=S*i/steps,w=half(s);right.push([w,s]);left.unshift([-w,s]);}
  return [...edge(phi1,0,half(0),false),...right,...edge(phi2,S,half(S),true),...left];
}
/** Crown disc + bands of petals for a spherical cap (dome roof or hemispherical head). */
export function petalLayout({sphereRadius:R,polarMax,crownDiameter=0,stockWidth:W,stockLength:L,trim=0,bands=0,petals=0}){
  const usableW=W-2*trim,usableL=L-2*trim,short=Math.min(usableW,usableL),long=Math.max(usableW,usableL);
  if(!(R>0&&polarMax>0)||!(short>0))return {valid:false,reason:'球面或原板尺寸無效。'};
  const capArc=R*polarMax,diameter=2*R*Math.sin(polarMax);
  const crown=crownDiameter>0?crownDiameter:Math.min(short,.4*diameter);
  if(crown>short+1e-6)return {valid:false,reason:'中心頂板大於原板，請縮小中心板或換較寬的原板。'};
  // A cap whose whole developed arc fits one plate is pressed in one piece (automatic) or when the crown disc covers it.
  if(crown/2>=capArc-1e-6||!crownDiameter&&2*capArc<=short)return {valid:true,single:true,crownDiameter:2*capArc,crownAngle:polarMax,bands:[],pieces:[],weldLength:0,meridianSeams:0,parallelSeams:0};
  const phiC=crown/2/R,span=polarMax-phiC;
  const build=nb=>{const out=[];for(let k=0;k<nb;k++){const phi1=phiC+span*k/nb,phi2=phiC+span*(k+1)/nb;let chosen=null;
      for(let n=petals||4;n<=(petals||720);n++){const shape=normalize(petalOutline(R,phi1,phi2,n));if(fitsStock(shape.w,shape.h,usableW,usableL)){chosen={n,shape};break;}}
      if(!chosen)return null;out.push({index:k+1,phi1,phi2,petals:chosen.n,length:R*(phi2-phi1),...chosen.shape});}
    return out;};
  let list=null;for(let nb=bands||Math.max(1,Math.ceil(R*span/long)),limit=bands||40;nb<=limit;nb++){list=build(nb);if(list)break;}
  if(!list)return {valid:false,reason:'瓜瓣分片後仍放不進原板；請換較大的原板或縮小中心板。'};
  const pieces=[];for(const band of list)for(let i=0;i<band.petals;i++)pieces.push({band:band.index,index:i+1,w:band.w,h:band.h,outline:band.outline,area:polygonArea(band.outline)});
  const meridian=list.reduce((s,b)=>s+b.petals*b.length,0),parallel=[phiC,...list.slice(1).map(b=>b.phi1)].reduce((s,phi)=>s+2*PI*R*Math.sin(phi),0);
  return {valid:true,single:false,crownDiameter:crown,crownAngle:phiC,bands:list,pieces,meridianSeams:list.reduce((s,b)=>s+b.petals,0),parallelSeams:list.length,meridianLength:meridian,parallelLength:parallel,weldLength:meridian+parallel};
}
/**
 * Splices a circular flat plate (bottom or flat cover) from rectangular stock: parallel strips with staggered cross joints.
 * joint 'lap' overlaps plates by `lap`; 'butt' leaves `gap`. Returns each plate's rectangle, the bounding box it needs inside the
 * circle (the cut blank, before trim) and the weld seams inside the circle.
 */
export function circleSplice({diameter,stockWidth:W,stockLength:L,trim=0,joint='lap',lap=30,gap=2,stagger=true}){
  const R=diameter/2,We=W-2*trim,Le=L-2*trim,lapJoint=joint==='lap';
  if(!(R>0&&We>0&&Le>0))return {valid:false,reason:'原板或圓板尺寸無效。'};
  if(lapJoint&&!(lap<We&&lap<Le))return {valid:false,reason:'搭接量需小於板寬與板長。'};
  const pitchY=lapJoint?We-lap:We+gap,pitchX=lapJoint?Le-lap:Le+gap;
  const rows=Math.max(1,Math.ceil(lapJoint?(diameter-lap)/(We-lap):(diameter+gap)/(We+gap))),span=rows*We-(rows-1)*(lapJoint?lap:-gap);
  if(rows>400)return {valid:false,reason:'拼板列數過多，請換較大的原板。'};
  const chordX=y=>Math.sqrt(Math.max(0,R*R-y*y)),near=(a,b)=>a<=0&&b>=0?0:Math.min(Math.abs(a),Math.abs(b));
  // One joint lattice for all rows: centred on the widest row (fewest plates there), odd rows shifted half a plate (staggered).
  const widest=Math.max(...Array.from({length:rows},(_,k)=>{const y0=-span/2+k*pitchY;return chordX(near(y0,y0+We));})),m0=Math.max(1,Math.ceil(lapJoint?(2*widest-lap)/(Le-lap):(2*widest+gap)/(Le+gap)));
  const origin=-(m0*Le-(m0-1)*(lapJoint?lap:-gap))/2;
  const plates=[],rowList=[];
  for(let k=0;k<rows;k++){
    const y0=-span/2+k*pitchY,y1=y0+We,yNear=near(y0,y1);if(yNear>=R)continue;
    const X=chordX(yNear),offset=origin+(stagger&&k%2===1?pitchX/2:0);
    // Plates j cover [offset + j·pitch, … + Le].
    const first=Math.floor((-X-offset)/pitchX)-1,row={index:rowList.length+1,y0,y1,plates:[]};
    for(let j=first;;j++){const x0=offset+j*pitchX,x1=x0+Le;if(x0>=X)break;if(x1<=-X)continue;
      const cx0=Math.max(x0,-X),cx1=Math.min(x1,X),xNear=near(cx0,cx1),Y=chordX(xNear),cy0=Math.max(y0,-Y),cy1=Math.min(y1,Y);if(!(cx1>cx0&&cy1>cy0))continue;
      const inside=[[x0,y0],[x1,y0],[x0,y1],[x1,y1]].every(([x,y])=>x*x+y*y<=R*R+1e-6);
      const plate={id:'',row:row.index,x0,x1,y0,y1,cut:{x0:cx0,x1:cx1,y0:cy0,y1:cy1},w:cx1-cx0,h:cy1-cy0,kind:inside?'full':'sketch'};
      row.plates.push(plate);plates.push(plate);}
    rowList.push(row);
  }
  plates.forEach((plate,i)=>{plate.id=String(i+1);});
  // Weld seams inside the circle: along strips (between rows) and across strips (plate ends).
  const rowSeams=[],crossSeams=[],junctions=[];
  for(let i=0;i<rowList.length-1;i++){const a=rowList[i],b=rowList[i+1],y=lapJoint?b.y0:(a.y1+b.y0)/2,len=2*chordX(y);if(len>0)rowSeams.push({y,length:len});}
  for(const row of rowList)for(let i=0;i<row.plates.length-1;i++){const left=row.plates[i],right=row.plates[i+1],x=lapJoint?right.x0:(left.x1+right.x0)/2,Y=chordX(x),y0=Math.max(row.y0,-Y),y1=Math.min(row.y1,Y);if(y1>y0){crossSeams.push({row:row.index,x,y0,y1,length:y1-y0});for(const y of [row.y0,row.y1])if(x*x+y*y<R*R)junctions.push({x,y,edge:R-Math.hypot(x,y)});}}
  const rowLength=rowSeams.reduce((s,x)=>s+x.length,0),crossLength=crossSeams.reduce((s,x)=>s+x.length,0);
  return {valid:true,diameter,joint,lap:lapJoint?lap:0,gap:lapJoint?0:gap,rows:rowList,plates,full:plates.filter(p=>p.kind==='full').length,sketch:plates.filter(p=>p.kind==='sketch').length,rowSeams,crossSeams,junctions,rowLength,crossLength,weldLength:rowLength+crossLength,
    minJunctionEdge:junctions.length?junctions.reduce((m,j)=>Math.min(m,j.edge),Infinity):null,minJunctionSpacing:minSpacing(junctions)};
}
/** Closest distance between distinct junction points; sorted sweep keeps large bottoms fast. */
function minSpacing(points){
  const list=[...points].sort((a,b)=>a.x-b.x);let best=Infinity;
  for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length&&list[j].x-list[i].x<best;j++){const d=Math.hypot(list[i].x-list[j].x,list[i].y-list[j].y);if(d>1e-6&&d<best)best=d;}
  return Number.isFinite(best)?best:null;
}
/** API-650-style annular bottom: segmented annular ring under the shell plus spliced centre plates lapped onto it. */
export function annularLayout({innerRadius,outerRadius,stockWidth,stockLength,trim=0,joint='lap',lap=30,gap=2,segments=0}){
  const ring=sectorLayout({rhoIn:innerRadius,rhoOut:outerRadius,theta:360,stockWidth,stockLength,trim,bands:1,segments});
  if(!ring.valid)return {valid:false,reason:'環形邊板放不進原板：'+ring.reason};
  const centre=circleSplice({diameter:2*(innerRadius+(joint==='lap'?lap:0)),stockWidth,stockLength,trim,joint,lap,gap});
  if(!centre.valid)return {valid:false,reason:centre.reason};
  return {valid:true,ring,centre,innerRadius,outerRadius,radialJoints:ring.pieces.length,weldLength:ring.radialLength+centre.weldLength+2*PI*innerRadius};
}
