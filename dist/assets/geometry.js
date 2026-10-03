/**
 * Pipe joint geometry, millimetres and degrees. No CAD or rendering dependency.
 * Main axis X; unrotated near side is +Z; positive azimuth moves +Z toward +Y.
 * UV coordinates are [world X, local circumferential arc length from pipe top].
 * All returned rings include a repeated closing vertex.
 */
export const DEFAULT_PARAMS = Object.freeze({
  mainOD:200, mainWall:6, mainLength:600, jointPosition:300,
  branchOD:100, branchWall:4, branchLength:200, angle:52, azimuth:0,
  offset:0, jointType:'on', projection:0, rootGap:0, holeGap:0.5,
  padEnabled:true, padShape:'circle', padSplit:'single', padThickness:6,
  padMargin:35, padClearance:1, kFactor:0.5, tolerance:0.1, samples:360,
  padManufacturing:'neutral', autoPrecision:true,
});

export const PRECISION_SAMPLE_CAP = 4096;
export const CHORD_GUARD_FACTOR = 1.1;
const CHORD_FRACTIONS = Array.from({length:7},(_,i)=>(i+1)/8);

const TAU = Math.PI * 2;
const EPS = 1e-9;
const rad = d => d * Math.PI / 180;
const length = v => Math.hypot(...v);
const dot = (a,b) => a.reduce((sum,v,i)=>sum+v*b[i],0);
const minus = (a,b) => a.map((v,i)=>v-b[i]);
const distance = (a,b) => length(minus(a,b));
const lerp = (a,b,t) => a.map((v,i)=>v+(b[i]-v)*t);
const close = points => [...points, [...points[0]]];
const open = points => distance(points[0],points.at(-1)) < EPS ? points.slice(0,-1) : points;

export function rotateAroundMain([x,y,z],azimuth) {
  const a=rad(azimuth), c=Math.cos(a), s=Math.sin(a);
  return [x,y*c+z*s,z*c-y*s];
}

export function cylindricalUVToWorld([x,u],radius,azimuth=0) {
  return rotateAroundMain([x,radius*Math.sin(u/radius),radius*Math.cos(u/radius)],azimuth);
}

function signedArea(poly) {
  const p=open(poly);
  return p.reduce((sum,a,i)=> {const b=p[(i+1)%p.length]; return sum+a[0]*b[1]-b[0]*a[1];},0)/2;
}

function orient(poly,ccw=true) {
  const p=open(poly);
  return close((signedArea(p)>0)===ccw?p:[...p].reverse());
}

function pointInPolygon(point,poly) {
  let inside=false;
  const p=open(poly), [x,y]=point;
  for(let i=0,j=p.length-1;i<p.length;j=i++) {
    const [xi,yi]=p[i], [xj,yj]=p[j];
    if((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
  }
  return inside;
}

function pointSegmentDistance(p,a,b) {
  const dx=b[0]-a[0],dy=b[1]-a[1],norm=dx*dx+dy*dy;
  const t=norm?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/norm)):0;
  return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dy*t);
}

function segmentsIntersect(a,b,c,d) {
  const abx=b[0]-a[0],aby=b[1]-a[1],cdx=d[0]-c[0],cdy=d[1]-c[1],acx=c[0]-a[0],acy=c[1]-a[1];
  const den=abx*cdy-aby*cdx;
  if(Math.abs(den)<EPS) return false;
  const t=(acx*cdy-acy*cdx)/den,u=(acx*aby-acy*abx)/den;
  return t>=-EPS && t<=1+EPS && u>=-EPS && u<=1+EPS;
}

export function minimumContourDistance(a,b) {
  let best=Infinity;
  const boxes=poly=>poly.slice(0,-1).map((p,i)=>({minX:Math.min(p[0],poly[i+1][0]),maxX:Math.max(p[0],poly[i+1][0]),
    minY:Math.min(p[1],poly[i+1][1]),maxY:Math.max(p[1],poly[i+1][1])}));
  const ba=boxes(a),bb=boxes(b);
  for(let i=0;i<a.length-1;i++) for(let j=0;j<b.length-1;j++) {
    const dx=Math.max(0,ba[i].minX-bb[j].maxX,bb[j].minX-ba[i].maxX);
    const dy=Math.max(0,ba[i].minY-bb[j].maxY,bb[j].minY-ba[i].maxY);
    if(dx*dx+dy*dy>=best*best)continue;
    if(segmentsIntersect(a[i],a[i+1],b[j],b[j+1])) return 0;
    best=Math.min(best,
      pointSegmentDistance(a[i],b[j],b[j+1]),pointSegmentDistance(a[i+1],b[j],b[j+1]),
      pointSegmentDistance(b[j],a[i],a[i+1]),pointSegmentDistance(b[j+1],a[i],a[i+1]));
  }
  return best;
}

function bounds(points) {
  return {minX:Math.min(...points.map(p=>p[0])),maxX:Math.max(...points.map(p=>p[0])),
    minY:Math.min(...points.map(p=>p[1])),maxY:Math.max(...points.map(p=>p[1]))};
}

function perimeter(points) {
  return points.slice(1).reduce((sum,p,i)=>sum+distance(p,points[i]),0);
}

function makeTemplate(id,title,basis,outer,holes=[],references=[],notes=[],mapping={}) {
  const b=bounds(outer), move=p=>[p[0]-b.minX,p[1]-b.minY];
  return {id,title,basis,outer:orient(outer).map(move),holes:holes.map(p=>orient(p,false).map(move)),
    references:references.map(r=>({...r,points:r.points.map(move)})),
    width:b.maxX-b.minX,height:b.maxY-b.minY,notes,
    mapping:{...mapping,origin:[b.minX,b.minY]}};
}

/** Clip a region with a hole to a half-plane; produce actual cuttable simple rings.
 * Split boundary portions inside the hole are intentionally omitted.
 */
function splitRegion(outer,hole,axis,coordinate,keepLess) {
  const rings=[orient(outer,true),orient(hole,false)],edges=[],crossings=[];
  const inside=p=>keepLess?p[axis]<=coordinate+EPS:p[axis]>=coordinate-EPS;
  for(const ring of rings) for(let i=0;i<ring.length-1;i++) {
    const a=ring[i],b=ring[i+1],ia=inside(a),ib=inside(b);
    if(ia&&ib) edges.push([a,b]);
    else if(ia!==ib) {
      const t=(coordinate-a[axis])/(b[axis]-a[axis]),p=lerp(a,b,t);
      p[axis]=coordinate;
      crossings.push(p);
      edges.push(ia?[a,p]:[p,b]);
    }
  }
  const other=1-axis;
  crossings.sort((a,b)=>a[other]-b[other]);
  const unique=crossings.filter((p,i)=>i===0||distance(p,crossings[i-1])>1e-7);
  // CCW edge direction: x<=cut goes upward; y<=cut goes leftward.
  const forward=axis===0?keepLess:!keepLess;
  for(let i=0;i<unique.length-1;i++) {
    const a=unique[i],b=unique[i+1],mid=lerp(a,b,.5);
    if(pointInPolygon(mid,outer)&&!pointInPolygon(mid,hole)) edges.push(forward?[a,b]:[b,a]);
  }
  const key=p=>p.map(v=>Math.round(v*1e7)).join(',');
  const outgoing=new Map();
  for(const e of edges) {
    if(distance(...e)<1e-8) continue;
    const k=key(e[0]); if(!outgoing.has(k))outgoing.set(k,[]); outgoing.get(k).push(e);
  }
  const results=[];
  while(outgoing.size) {
    const start=outgoing.keys().next().value,poly=[];
    let current=start,steps=0;
    do {
      const list=outgoing.get(current);
      if(!list?.length) throw new Error('補強板分片輪廓未封閉');
      const e=list.pop();if(!list.length)outgoing.delete(current);
      poly.push(e[0]);current=key(e[1]);
      if(++steps>edges.length+1)throw new Error('補強板分片拓樸異常');
    } while(current!==start);
    if(poly.length>=3)results.push(orient(close(poly)));
  }
  return results;
}

/** The formed plate's radial cutter removes any material intersecting the
 * branch-cylinder tool anywhere across the continuous thickness interval.
 * This is an analytic minimization in rho, not a two-face union or rho grid.
 */
function formedNormalEnvelope(p,R,Ro,toolRadius,sa,ca) {
  const e=p.offset,position=p.jointPosition;
  const phiMin=Math.min(Math.asin((e-toolRadius)/R),Math.asin((e-toolRadius)/Ro));
  const phiMax=Math.max(Math.asin((e+toolRadius)/R),Math.asin((e+toolRadius)/Ro));
  const atPhi=phi=>{
    const s=Math.sin(phi),c=Math.cos(phi),A=ca*ca*c*c+s*s;
    let lo=R,hi=Ro;
    if(Math.abs(s)>1e-13) {
      const values=[(e-toolRadius)/s,(e+toolRadius)/s].sort((a,b)=>a-b);
      lo=Math.max(lo,values[0]);hi=Math.min(hi,values[1]);
    }else if(Math.abs(e)>toolRadius+1e-10)return null;
    if(lo>hi+1e-8)return null;
    if(lo>hi){const common=(lo+hi)/2;lo=common;hi=common;}
    const candidates=[lo,hi];
    if(Math.abs(s)>1e-13&&A>1e-24) {
      const w= Math.sign(s)*toolRadius*ca*c/Math.sqrt(A);
      for(const rho of [(e+w)/s,(e-w)/s]) {
        if(rho>=lo-1e-9&&rho<=hi+1e-9)candidates.push(Math.max(lo,Math.min(hi,rho)));
      }
    }
    let minX=Infinity,maxX=-Infinity;
    for(const rho of candidates) {
      const w=rho*s-e,h=Math.sqrt(Math.max(0,toolRadius*toolRadius-w*w));
      minX=Math.min(minX,position+(ca*rho*c-h)/sa);
      maxX=Math.max(maxX,position+(ca*rho*c+h)/sa);
    }
    return {minX,maxX};
  };
  const minimumAt=([x,u])=>{
    const phi=u/Ro,s=Math.sin(phi),c=Math.cos(phi),dx=x-position;
    const A=ca*ca*c*c+s*s,B=sa*ca*dx*c+e*s;
    const rho=A>1e-24?Math.max(R,Math.min(Ro,B/A)):R;
    const axial=sa*dx-ca*rho*c,lateral=rho*s-e;
    return {distanceSquared:axial*axial+lateral*lateral,rho};
  };
  const sample=n=>{
    const half=Math.ceil(n/2),points=[],midpoints=[],probes=[];
    const phiAt=eta=>(phiMin+phiMax)/2-(phiMax-phiMin)*Math.cos(eta)/2;
    const curveAt=(eta,upper)=>{
      const phi=phiAt(eta),range=atPhi(phi);
      if(!range)throw new Error('法線孔包絡超出解析交線範圍。');
      return [upper?range.maxX:range.minX,Ro*phi];
    };
    const append=(point,edgeProbes)=>{
      if(points.length&&distance(points.at(-1),point)<1e-10)return;
      if(points.length) {
        const pp=edgeProbes??CHORD_FRACTIONS.map(t=>lerp(points.at(-1),point,t));
        probes.push(pp);midpoints.push(pp[Math.floor(pp.length/2)]);
      }
      points.push(point);
    };
    // The two sides have smooth cosine spacing at angular tips. Genuine tip
    // straight edges (e=+/-toolRadius) are retained and never forced to a point.
    append(curveAt(0,true));
    for(let i=1;i<=half;i++) {
      const eta0=Math.PI*(i-1)/half,eta1=Math.PI*i/half;
      append(curveAt(eta1,true),CHORD_FRACTIONS.map(t=>curveAt(eta0+(eta1-eta0)*t,true)));
    }
    append(curveAt(Math.PI,false));
    for(let i=half-1;i>=0;i--) {
      const eta0=Math.PI*(i+1)/half,eta1=Math.PI*i/half;
      append(curveAt(eta1,false),CHORD_FRACTIONS.map(t=>curveAt(eta0+(eta1-eta0)*t,false)));
    }
    if(distance(points.at(-1),points[0])>=1e-10)append([...points[0]]);
    else points[points.length-1]=[...points[0]];
    return {points,midpoints,probes};
  };
  return {atPhi,minimumAt,sample,phiMin,phiMax};
}

function padBoundary(shape,hole,margin,n,cylinderRadius) {
  const b=bounds(hole),cx=(b.minX+b.maxX)/2,cy=(b.minY+b.maxY)/2;
  const hx=(b.maxX-b.minX)/2,hy=(b.maxY-b.minY)/2;
  const radius=Math.max(...hole.map(p=>Math.hypot(p[0]-cx,p[1]-cy)))+margin;
  const make=(extra)=>{
    if(shape==='circle'||shape==='ellipse') {
      const rx=shape==='circle'?radius+extra:Math.SQRT2*(hx+margin+extra);
      const ry=shape==='circle'?radius+extra:Math.SQRT2*(hy+margin+extra);
      const at=a=>[cx+rx*Math.cos(a),cy+ry*Math.sin(a)];
      return {outer:close(Array.from({length:n},(_,i)=>at(TAU*i/n))),
        midpoints:Array.from({length:n},(_,i)=>at(TAU*(i+.5)/n)),
        probes:Array.from({length:n},(_,i)=>CHORD_FRACTIONS.map(t=>at(TAU*(i+t)/n)))};
    }
    // Explicit arcs plus straight edges avoid replacing the straight/arc join
    // with a discontinuous corner parameterization. Midpoints are exact on
    // either the arc or the straight edge and support exterior chord checks.
    let bx=hx,by=hy,r=margin+extra;
    if(shape==='obround') {
      if(hx>=hy){by=0;r=hy+margin+extra;}else{bx=0;r=hx+margin+extra;}
    }
    const pts=[],midpoints=[],probes=[],quarter=Math.max(8,Math.ceil(n/4));
    const append=(p,mid,edgeProbes)=>{
      if(pts.length&&distance(pts.at(-1),p)<EPS)return;
      if(pts.length) {
        midpoints.push(mid??lerp(pts.at(-1),p,.5));
        probes.push(edgeProbes??CHORD_FRACTIONS.map(t=>lerp(pts.at(-1),p,t)));
      }
      pts.push(p);
    };
    const appendStraight=p=>{
      if(!pts.length){append(p);return;}
      const start=pts.at(-1),steps=Math.max(1,Math.ceil(Math.abs(p[1]-start[1])/(TAU*cylinderRadius/n)));
      for(let i=1;i<=steps;i++)append(lerp(start,p,i/steps));
    };
    for(let j=0;j<4;j++) {
      const center=[cx+(j===0||j===3?bx:-bx),cy+(j<2?by:-by)];
      const at=a=>[center[0]+r*Math.cos(a),center[1]+r*Math.sin(a)];
      appendStraight(at(j*Math.PI/2));
      for(let k=1;k<=quarter;k++) {
        append(at((j+k/quarter)*Math.PI/2),at((j+(k-.5)/quarter)*Math.PI/2),
          CHORD_FRACTIONS.map(t=>at((j+(k-1+t)/quarter)*Math.PI/2)));
      }
    }
    if(distance(pts[0],pts.at(-1))>=EPS)appendStraight([...pts[0]]);
    else pts[pts.length-1]=[...pts[0]];
    return {outer:pts,midpoints,probes};
  };
  let extra=Math.max(.005,margin*(1-Math.cos(Math.PI/n))*2),boundary=make(extra),outer=boundary.outer;
  let gap=minimumContourDistance(outer,hole);
  for(let attempt=0;gap<margin-1e-7&&attempt<5;attempt++) {
    extra+=margin-gap+.001;boundary=make(extra);outer=boundary.outer;gap=minimumContourDistance(outer,hole);
  }
  return {outer,midpoints:boundary.midpoints,probes:boundary.probes,gap,center:[cx,cy]};
}

function validate(raw) {
  const p={...DEFAULT_PARAMS,...raw},errors=[];
  const error=(field,message)=>errors.push({field,message});
  for(const field of ['mainOD','mainWall','mainLength','jointPosition','branchOD','branchWall','branchLength',
    'angle','azimuth','offset','projection','rootGap','holeGap','padThickness','padMargin','padClearance','kFactor','tolerance','samples']) {
    p[field]=Number(p[field]);
    if(!Number.isFinite(p[field]))error(field,'請輸入有限數值。');
  }
  for(const f of ['mainOD','mainWall','mainLength','branchOD','branchWall','branchLength','tolerance']) {
    if(p[f]<=0)error(f,'尺寸必須大於 0。');
  }
  if(p.mainWall*2>=p.mainOD)error('mainWall','主管壁厚須小於外徑的一半。');
  if(p.branchWall*2>=p.branchOD)error('branchWall','支管壁厚須小於外徑的一半。');
  if(p.angle<5||p.angle>175)error('angle','支援夾角為 5° 至 175°。');
  for(const f of ['projection','rootGap','holeGap','padClearance'])if(p[f]<0)error(f,'間隙與伸入長度不可小於 0。');
  if(!['on','in'].includes(p.jointType))error('jointType','接頭型式須為外貼 on 或內插 in。');
  if(p.motherOpening!==undefined&&typeof p.motherOpening!=='boolean')error('motherOpening','母管開孔設定須為布林值。');
  if(p.motherOpening===false)error('motherOpening','直管母材封閉外焊尚未支援；請選開孔接法，或使用彎頭／大小管的外焊支撐。');
  if(!['circle','ellipse','obround','rounded'].includes(p.padShape))error('padShape','補強板外形無效。');
  if(!['single','axial','circumferential'].includes(p.padSplit))error('padSplit','補強板分片方式無效。');
  if(!['neutral','formed-normal'].includes(p.padManufacturing))error('padManufacturing','補強板工法須為 neutral 或 formed-normal。');
  if(typeof p.autoPrecision!=='boolean')error('autoPrecision','自動精度設定須為布林值。');
  if(p.padEnabled) {
    if(p.padThickness<=0)error('padThickness','補強板厚度必須大於 0。');
    if(p.padMargin<=0)error('padMargin','補強板最低留邊必須大於 0。');
    if(p.kFactor<0||p.kFactor>1)error('kFactor','中性層係數須介於 0 與 1。');
  }
  if(!Number.isInteger(p.samples)||p.samples<36||p.samples>PRECISION_SAMPLE_CAP)error('samples',`取樣數須為 36 至 ${PRECISION_SAMPLE_CAP} 的整數。`);
  p.azimuth=((p.azimuth%360)+360)%360;
  return {p,errors};
}

function computeJointAtSamples(raw={}) {
  const {p,errors}=validate(raw),warnings=[];
  const failed=()=>({valid:false,params:p,errors,warnings,templates:[],geometry:null,verification:[],measurements:{},stationTable:[]});
  if(errors.length)return failed();
  const R=p.mainOD/2,Ri=R-p.mainWall,ro=p.branchOD/2,ri=ro-p.branchWall;
  const a=rad(p.angle),sa=Math.sin(a),ca=Math.cos(a),n=p.samples;
  const direction=rotateAroundMain([ca,0,sa],p.azimuth),origin=rotateAroundMain([p.jointPosition,p.offset,0],p.azimuth);
  const toolRadius=(p.jointType==='on'?ri:ro)+p.holeGap;
  const padTool=ro+p.padClearance,cutR=p.jointType==='on'?R+p.rootGap:Ri;
  const projection=p.jointType==='in'?p.projection:0;
  const error=(field,message)=>errors.push({field,message});
  if(Math.abs(p.offset)+ro>=cutR-EPS)error('offset','支管外緣超出此接頭的封閉交線範圍，請減少偏心、支管直徑或調整接法。');
  if(Math.abs(p.offset)+toolRadius>=Ri-EPS)error('holeGap','主管內壁孔無法形成單一封閉近側輪廓，請減少孔徑或偏心。');
  if(p.padEnabled&&Math.abs(p.offset)+padTool>=R-EPS)error('padClearance','補強板孔無法形成封閉近側輪廓，請減少支管孔徑或偏心。');
  if(errors.length)return failed();
  // Surface parameter follows the branch circumference, starting on the p-axis.
  const evalAt=(radius,hostRadius,theta,shift=0)=>{
    const y=p.offset+radius*Math.sin(theta),z=Math.sqrt(Math.max(0,hostRadius*hostRadius-y*y));
    const t=(z-radius*Math.cos(theta)*ca)/sa-shift;
    const local=[p.jointPosition-radius*Math.cos(theta)*sa+t*ca,y,radius*Math.cos(theta)*ca+t*sa];
    return {t,local,world:rotateAroundMain(local,p.azimuth),uv:[local[0],hostRadius*Math.asin(y/hostRadius)]};
  };
  const sample=(radius,hostRadius,shift=0)=>{
    const result=Array.from({length:n},(_,i)=>evalAt(radius,hostRadius,TAU*i/n,shift));
    result.push({...result[0],local:[...result[0].local],world:[...result[0].world],uv:[...result[0].uv]});
    return result;
  };
  // Resolve extrema analytically from derivative roots rather than trusting the
  // polygon stations for finite-pipe clearance and minimum finished length.
  const extrema=(radius,hostRadius,shift=0,kind='x')=>{
    const derivative=theta=>{
      const y=p.offset+radius*Math.sin(theta),h=Math.sqrt(hostRadius*hostRadius-y*y);
      const zPrime=-y*radius*Math.cos(theta)/h;
      return kind==='x'?(ca*zPrime+radius*Math.sin(theta))/sa:
        (zPrime+radius*Math.sin(theta)*ca)/sa;
    };
    const candidates=[0],grid=Math.max(128,n);
    for(let i=0;i<grid;i++) {
      let lo=TAU*i/grid,hi=TAU*(i+1)/grid,fl=derivative(lo),fh=derivative(hi);
      if(Math.abs(fl)<1e-10)candidates.push(lo);
      if(fl*fh<0) {
        for(let k=0;k<48;k++) {
          const mid=(lo+hi)/2,fm=derivative(mid);
          if(fl*fm<=0){hi=mid;fh=fm;}else{lo=mid;fl=fm;}
        }
        candidates.push((lo+hi)/2);
      }
    }
    const values=candidates.map(theta=>{const s=evalAt(radius,hostRadius,theta,shift);return kind==='x'?s.local[0]:s.t;});
    return {min:Math.min(...values),max:Math.max(...values)};
  };
  const oc=sample(ro,cutR,projection),ic=sample(ri,cutR,projection);
  if(projection>0) {
    // Analytic minimum available near-to-far inner-wall distance over every station.
    const maxLateral=Math.abs(p.offset)+ro;
    const available=2*Math.sqrt(Ri*Ri-maxLateral*maxLateral)/sa;
    if(projection>=available-1e-7)error('projection',`內插伸入量會碰到另一側內壁；本組尺寸須小於 ${available.toFixed(2)} mm。`);
  }
  const oh=sample(toolRadius,R),ih=sample(toolRadius,Ri);
  const cutExtents=[[ro,cutR,projection],[ri,cutR,projection],[toolRadius,R,0],[toolRadius,Ri,0]].map(args=>extrema(...args));
  if(Math.min(...cutExtents.map(e=>e.min))<-EPS||Math.max(...cutExtents.map(e=>e.max))>p.mainLength+EPS)
    error('jointPosition','接頭切口或主管開孔跨出主管端部；請移動接頭位置、加長主管或調整角度。');
  if(errors.length)return failed();
  const outerTExtents=extrema(ro,cutR,projection,'t'),innerTExtents=extrema(ri,cutR,projection,'t');
  const endT=Math.max(outerTExtents.max,innerTExtents.max)+p.branchLength;
  const end=(radius)=>{
    const pts=Array.from({length:n},(_,i)=>{
      const theta=TAU*i/n;
      return rotateAroundMain([p.jointPosition-radius*Math.cos(theta)*sa+endT*ca,
        p.offset+radius*Math.sin(theta),radius*Math.cos(theta)*ca+endT*sa],p.azimuth);
    });return close(pts);
  };
  const outerCut=oc.map(s=>s.world),innerCut=ic.map(s=>s.world);
  const C=TAU*ro,branchCut=oc.map((s,i)=>[C*i/n,endT-s.t]);
  const innerReference=ic.map((s,i)=>[C*i/n,endT-s.t]);
  const branchOutline=close([[0,0],[C,0],...[...branchCut].reverse()]);
  const stationTable=oc.map((s,i)=>({angle:360*i/n,circumference:C*i/n,outerDepth:endT-s.t,innerDepth:endT-ic[i].t}));
  const templates=[makeTemplate('branch','支管 fishmouth 包覆樣板','支管實際外徑包覆',branchOutline,[],[
    {points:innerReference,label:'內緣對應角度參考（非內徑展開）',type:'inner-edge'},
    {points:[[0,0],[0,endT-oc[0].t]],label:'0° 起縫基準',type:'seam'},
    {points:[[C/2,0],[C/2,endT-evalAt(ro,cutR,Math.PI,projection).t]],label:'180°',type:'station'},
  ],['外輪廓為成品切線；尚未套用坡口、刀縫、粗切留料或焊接收縮。',
    '內緣虛線按外徑相同角度投影供壁厚修磨參考，並非內壁包覆樣板。'],
    {coordinateSystem:'branch-outer-wrap',circumference:C,axisEnd:endT})];
  const mainC=TAU*R;
  const mainHole=oh.map(s=>[s.uv[1]+mainC/2,s.uv[0]]);
  const innerHoleReference=ih.map(s=>[R*(s.uv[1]/Ri)+mainC/2,s.uv[0]]);
  templates.push(makeTemplate('main','主管開孔包覆樣板','主管實際外徑包覆',close([[0,0],[mainC,0],[mainC,p.mainLength],[0,p.mainLength]]),[mainHole],[
    {points:innerHoleReference,label:'內壁孔緣投影參考',type:'inner-edge'},
    {points:[[mainC/2,0],[mainC/2,p.mainLength]],label:'接頭方位基準',type:'centerline'},
    ...(p.jointPosition>=0&&p.jointPosition<=p.mainLength?[{points:[[0,p.jointPosition],[mainC,p.jointPosition]],label:'虛擬中心面軸基準 X',type:'centerline'}]:[]),
  ],[p.jointType==='on'?'外貼孔徑工具：支管內半徑＋開孔徑向間隙。':'內插孔徑工具：支管外半徑＋開孔徑向間隙。',
    '起縫位於接頭方位的對面；本圖為外壁包覆，不是主管板材捲製下料。'],
    {coordinateSystem:'main-outer-wrap',azimuth:p.azimuth,seamRad:rad(p.azimuth)-Math.PI,localArcOffset:mainC/2}));
  let pad=null,padGap=null,padArea=0,padInnerClearance=null,padOuterClearance=null,
    padHoleAxialLength=null,padHoleArcWidth=null,envelopeEquationError=0;
  if(p.padEnabled) {
    const Rn=R+p.kFactor*p.padThickness,Ro=R+p.padThickness;
    const formed=p.padManufacturing==='formed-normal',basisRadius=formed?Ro:Rn;
    const pi=sample(padTool,R),po=sample(padTool,Ro),pn=sample(padTool,Rn);
    const envelope=formed?formedNormalEnvelope(p,R,Ro,padTool,sa,ca):null;
    let envelopeContour;
    try {envelopeContour=envelope?.sample(n);}catch(e){error('padManufacturing',e.message);return failed();}
    const hole=formed?envelopeContour.points:pn.map(s=>s.uv);
    const boundary=padBoundary(p.padShape,hole,p.padMargin,Math.max(128,n),basisRadius);
    const outer=boundary.outer,b=bounds(outer);
    if(b.minX<-EPS||b.maxX>p.mainLength+EPS)error('padMargin','補強板外形跨出主管端部；請移動接頭位置、加長主管或縮小留邊。');
    if(b.maxY-b.minY>=TAU*basisRadius-EPS)error('padMargin','補強板展開超過主管一整周，會自我重疊；請縮小尺寸。');
    if(errors.length)return failed();
    // Thickness makes an oblique bore migrate axially between faces. A pad
    // enclosing its neutral-layer hole can still have its actual face holes
    // break through the exterior. Compare every face at the same angular
    // coordinates on the neutral development, not at equal arc lengths.
    const faceClearance=(radius,label)=>{
      const count=n*4;
      const dense=close(Array.from({length:count},(_,i)=>{
        const s=evalAt(padTool,radius,TAU*i/count);
        return [s.uv[0],basisRadius*s.uv[1]/radius];
      }));
      const clearance=minimumContourDistance(outer,dense);
      if(clearance<=EPS||dense.some(point=>!pointInPolygon(point,outer)))
        error('padMargin',`補強板${label}孔緣切穿板外緣，無法形成完整環板；請增大留邊、減少板厚或調整角度。最低留邊設定基準為${formed?'外表面包絡孔':'中性面'}。`);
      return clearance;
    };
    padInnerClearance=faceClearance(R,'內面');
    padOuterClearance=faceClearance(Ro,'外面');
    if(errors.length)return failed();
    padGap=boundary.gap;padArea=Math.abs(signedArea(outer))-Math.abs(signedArea(hole));
    const idealNeutralExtents=extrema(padTool,Rn);
    if(formed) {
      const faceExtents=[extrema(padTool,R),extrema(padTool,Ro)];
      padHoleAxialLength=Math.max(...faceExtents.map(e=>e.max))-Math.min(...faceExtents.map(e=>e.min));
      padHoleArcWidth=basisRadius*(envelope.phiMax-envelope.phiMin);
      for(const point of [...hole,...envelopeContour.probes.flat()]) {
        envelopeEquationError=Math.max(envelopeEquationError,Math.abs(Math.sqrt(envelope.minimumAt(point).distanceSquared)-padTool));
      }
    }else{
      padHoleAxialLength=idealNeutralExtents.max-idealNeutralExtents.min;
      padHoleArcWidth=Rn*(Math.asin((p.offset+padTool)/Rn)-Math.asin((p.offset-padTool)/Rn));
    }
    const layerUV=radius=>hole.map(([x,u])=>[x,u*radius/basisRadius]);
    pad={neutralRadius:Rn,outerUV:outer,innerHoleUV:pi.map(s=>s.uv),outerHoleUV:po.map(s=>s.uv),neutralHoleUV:pn.map(s=>s.uv),
      innerHole3D:pi.map(s=>s.world),outerHole3D:po.map(s=>s.world),neutralHole3D:pn.map(s=>s.world),
      innerRadius:R,outerRadius:Ro,split:p.padSplit,
      manufacturing:p.padManufacturing,developmentRadius:basisRadius,
      cutHoleUV:hole,
      cutHoleInnerUV:formed?layerUV(R):pi.map(s=>s.uv),
      cutHoleOuterUV:formed?layerUV(Ro):po.map(s=>s.uv),
      cutHoleNeutralUV:formed?layerUV(Rn):pn.map(s=>s.uv),
      cutHoleInner3D:formed?layerUV(R).map(uv=>cylindricalUVToWorld(uv,R,p.azimuth)):pi.map(s=>s.world),
      cutHoleOuter3D:formed?layerUV(Ro).map(uv=>cylindricalUVToWorld(uv,Ro,p.azimuth)):po.map(s=>s.world),
      cutHoleNeutral3D:formed?layerUV(Rn).map(uv=>cylindricalUVToWorld(uv,Rn,p.azimuth)):pn.map(s=>s.world),
      cutHoleProbesUV:formed?envelopeContour.probes:null,
      outerMidpointsUV:boundary.midpoints,
      outerProbesUV:boundary.probes,
      mapping:{coordinateSystem:'main-local-cylindrical',azimuth:p.azimuth,outerBoundaryRadius:basisRadius,
        basisRadius,manufacturing:p.padManufacturing,
        developmentBasis:formed?'formed-plate-outer-surface':'neutral-layer'}};
    const padNotes=formed?[
      '此樣板貼於已彎補強板外表面，以板厚法線（主管徑向）切割。',
      `外表面放樣半徑 ${Ro.toFixed(3)} mm；孔為全部連續板厚 [${R.toFixed(3)}, ${Ro.toFixed(3)}] mm 的精確法線包絡。`,
      'K 係數不參與此外表面放樣；本圖不是平板中性層下料樣板。',
      '最低留邊依外表面包絡孔計算；灰色理想交線只供設計參考。',
    ]:['外形定義於中性層展開面；最低留邊依中性層孔輪廓計算。',
      '已檢查板材內外面孔完整包含於外形；最低留邊要求僅套用中性面。',
      `中性層半徑 ${Rn.toFixed(3)} mm，K=${p.kFactor}；實際成形須依材料與設備校正。`,
      '孔線為成形後斜孔的中性層交線；板厚內外孔緣不同，需依成形與修孔工法製作。'];
    const templateBasis=formed?'已彎板外表面包覆／全厚度法線孔':'中性層板材展開';
    if(p.padSplit==='single') {
      templates.push(makeTemplate('pad',formed?'已彎補強板法線切孔樣板':'補強板中性層展開',templateBasis,outer,[hole],[
        {points:pi.map(s=>[s.uv[0],basisRadius*s.uv[1]/R]),label:'內側理想交線投影',type:'inner-edge'},
        {points:po.map(s=>[s.uv[0],basisRadius*s.uv[1]/Ro]),label:'外側理想交線投影',type:'outer-edge'},
      ],padNotes,pad.mapping));
    } else {
      const axis=p.padSplit==='axial'?1:0,cut=boundary.center[axis];
      let count=0;
      try {
        for(const less of [true,false])for(const piece of splitRegion(outer,hole,axis,cut,less)) {
          count++;templates.push(makeTemplate(`pad-${count}`,`補強板分片 ${count}`,templateBasis,piece,[],[],[
            ...padNotes,p.padSplit==='axial'?'接縫沿主管軸向。':'接縫沿主管圓周方向。',
            '本輪廓已扣除孔內接縫，不含穿越開孔的重複裁切線。'],{...pad.mapping,splitAxis:axis,splitCoordinate:cut}));
        }
      }catch(e){error('padSplit',e.message);return failed();}
      if(count!==2){error('padSplit','此補強板不能形成兩片單純輪廓，請調整分片方式。');return failed();}
    }
  }
  let equationError=0,roundTripError=0,chordError=0,independentIntersectionError=0;
  for(const [radius,hostRadius,shift,series] of [[ro,cutR,projection,oc],[ri,cutR,projection,ic],[toolRadius,R,0,oh],[toolRadius,Ri,0,ih]]) {
    for(let i=0;i<n;i++) {
      const s=series[i],unprojected=s.local.map((v,j)=>v+shift*[ca,0,sa][j]);
      const relative=minus(s.local,[p.jointPosition,p.offset,0]);
      const d=dot(relative,[ca,0,sa]);
      const radial=length(minus(relative,[d*ca,0,d*sa]));
      equationError=Math.max(equationError,Math.abs(radial-radius),Math.abs(Math.hypot(unprojected[1],unprojected[2])-hostRadius));
      // Independently intersect a generic WORLD-coordinate line and the main
      // cylinder. This path never calls evalAt or its solved saddle expression.
      // Its foot is on the branch axis's perpendicular plane at axis station 0.
      const theta=TAU*i/n,foot=rotateAroundMain([
        p.jointPosition-radius*Math.cos(theta)*sa,
        p.offset+radius*Math.sin(theta),radius*Math.cos(theta)*ca,
      ],p.azimuth);
      const A=direction[1]*direction[1]+direction[2]*direction[2];
      const B=2*(foot[1]*direction[1]+foot[2]*direction[2]);
      const Cq=foot[1]*foot[1]+foot[2]*foot[2]-hostRadius*hostRadius;
      const discriminant=B*B-4*A*Cq;
      const nearRoot=(-B+Math.sqrt(Math.max(0,discriminant)))/(2*A);
      const independentPoint=foot.map((v,j)=>v+nearRoot*direction[j]);
      const unprojectedWorld=s.world.map((v,j)=>v+shift*direction[j]);
      independentIntersectionError=Math.max(independentIntersectionError,distance(independentPoint,unprojectedWorld));
      if(!shift)roundTripError=Math.max(roundTripError,distance(s.world,cylindricalUVToWorld(s.uv,hostRadius,p.azimuth)));
      for(const fraction of CHORD_FRACTIONS) {
        const probe=evalAt(radius,hostRadius,TAU*(i+fraction)/n,shift);
        chordError=Math.max(chordError,distance(probe.world,lerp(series[i].world,series[i+1].world,fraction)));
        if(!shift)chordError=Math.max(chordError,distance(probe.uv,lerp(series[i].uv,series[i+1].uv,fraction)));
      }
    }
  }
  if(pad)for(const [radius,uv,world] of [[pad.innerRadius,pad.innerHoleUV,pad.innerHole3D],[pad.outerRadius,pad.outerHoleUV,pad.outerHole3D],[pad.neutralRadius,pad.neutralHoleUV,pad.neutralHole3D]]) {
    uv.forEach((v,i)=>roundTripError=Math.max(roundTripError,distance(world[i],cylindricalUVToWorld(v,radius,p.azimuth))));
    for(let i=0;i<n;i++)for(const fraction of CHORD_FRACTIONS) {
      const probe=evalAt(padTool,radius,TAU*(i+fraction)/n),basis=pad.developmentRadius;
      chordError=Math.max(chordError,distance(probe.world,lerp(world[i],world[i+1],fraction)),distance(
        [probe.uv[0],probe.uv[1]*basis/radius],lerp([uv[i][0],uv[i][1]*basis/radius],[uv[i+1][0],uv[i+1][1]*basis/radius],fraction)));
    }
  }
  if(pad)for(let i=0;i<pad.outerUV.length-1;i++) {
    const aa=pad.outerUV[i],bb=pad.outerUV[i+1],R=pad.developmentRadius;
    pad.outerProbesUV[i].forEach((probe,j)=>{
      const fraction=CHORD_FRACTIONS[j];
      chordError=Math.max(chordError,distance(probe,lerp(aa,bb,fraction)),distance(
        cylindricalUVToWorld(probe,R,p.azimuth),lerp(cylindricalUVToWorld(aa,R,p.azimuth),cylindricalUVToWorld(bb,R,p.azimuth),fraction)));
    });
  }
  if(pad?.cutHoleProbesUV)for(let i=0;i<pad.cutHoleUV.length-1;i++) {
    const aa=pad.cutHoleUV[i],bb=pad.cutHoleUV[i+1],R=pad.developmentRadius;
    pad.cutHoleProbesUV[i].forEach((probe,j)=>{
      const fraction=CHORD_FRACTIONS[j];
      chordError=Math.max(chordError,distance(probe,lerp(aa,bb,fraction)));
      for(const layer of [pad.innerRadius,pad.neutralRadius,pad.outerRadius]) {
        const wrap=p=>cylindricalUVToWorld([p[0],p[1]*layer/R],layer,pad.mapping.azimuth);
        chordError=Math.max(chordError,distance(wrap(probe),lerp(wrap(aa),wrap(bb),fraction)));
      }
    });
  }
  const closure=Math.max(...[outerCut,innerCut,oh.map(s=>s.world),ih.map(s=>s.world)].map(points=>distance(points[0],points.at(-1))));
  const sampledMaxChordError=chordError;
  chordError*=CHORD_GUARD_FACTOR;
  const verification=[
    {id:'independent-intersection',label:'獨立二次方程求交差',value:independentIntersectionError,unit:'mm',tolerance:p.tolerance,status:independentIntersectionError<=p.tolerance?'pass':'fail'},
    {id:'equations',label:projection?'交線方程誤差（伸入前）':'交線方程誤差',value:equationError,unit:'mm',tolerance:p.tolerance,status:equationError<=p.tolerance?'pass':'fail'},
    {id:'roundtrip',label:'圓柱展開回包誤差',value:roundTripError,unit:'mm',tolerance:p.tolerance,status:roundTripError<=p.tolerance?'pass':'fail'},
    {id:'closure',label:'交線閉合誤差',value:closure,unit:'mm',tolerance:p.tolerance,status:closure<=p.tolerance?'pass':'fail'},
    {id:'chord',label:'採樣弦差（含數值餘量）',value:chordError,unit:'mm',tolerance:p.tolerance,status:chordError<=p.tolerance?'pass':'warning'},
  ];
  if(pad)verification.push({id:'pad-margin',label:p.padManufacturing==='formed-normal'?'補強板外表面包絡孔最低留邊':'補強板中性面最低留邊',value:padGap,unit:'mm',tolerance:p.padMargin,status:padGap>=p.padMargin-1e-7?'pass':'fail'},
    {id:'pad-inner-fit',label:`內面孔包容餘裕（${p.padManufacturing==='formed-normal'?'外表面':'中性'}座標）`,value:padInnerClearance,unit:'mm',tolerance:0,status:'pass'},
    {id:'pad-outer-fit',label:`外面孔包容餘裕（${p.padManufacturing==='formed-normal'?'外表面':'中性'}座標）`,value:padOuterClearance,unit:'mm',tolerance:0,status:'pass'});
  if(pad&&p.padManufacturing==='formed-normal')verification.push({id:'formed-envelope',label:'全板厚法線包絡方程誤差',value:envelopeEquationError,unit:'mm',tolerance:p.tolerance,status:envelopeEquationError<=p.tolerance?'pass':'fail'});
  if(chordError>p.tolerance)warnings.push(`目前取樣弦差 ${chordError.toFixed(3)} mm 超過 ${p.tolerance} mm；請提高取樣數或放寬離散容差。`);
  if(p.angle<20||p.angle>160)warnings.push('接近主管軸向的斜插會產生很長的開孔與切口，請核對可加工空間。');
  if(p.jointType==='on'&&p.projection>0)warnings.push('伸入量僅用於內插；此外貼接頭未套用伸入量。');
  if(p.jointType==='in'&&p.rootGap>0)warnings.push('外貼徑向間隙僅用於外貼；此內插接頭未套用該間隙。');
  const geometry={branch:{outerCut,innerCut,outerEnd:end(ro),innerEnd:end(ri),outerRadius:ro,innerRadius:ri,axisEnd:endT},
    main:{outerRadius:R,innerRadius:Ri,length:p.mainLength,seamRad:rad(p.azimuth)-Math.PI,
      outerHoleUV:oh.map(s=>s.uv),innerHoleUV:ih.map(s=>s.uv),outerHole3D:oh.map(s=>s.world),innerHole3D:ih.map(s=>s.world),
      holeToolRadius:toolRadius,mapping:{coordinateSystem:'main-local-cylindrical',azimuth:p.azimuth}},pad,
    axes:{branchDirection:direction,branchOrigin:origin}};
  const hb=bounds(oh.map(s=>s.uv));
  const measurements={mainCircumference:mainC,branchCircumference:C,branchMinLength:p.branchLength,
    branchMaxLength:endT-outerTExtents.min,branchAxisEnd:endT,
    branchOuterCutLength:perimeter(outerCut),branchInnerCutLength:perimeter(innerCut),
    mainHoleAxialLength:hb.maxX-hb.minX,mainHoleArcWidth:hb.maxY-hb.minY,mainHoleToolDiameter:2*toolRadius,
    padMinimumMargin:padGap,padNetArea:padArea,padNeutralRadius:pad?.neutralRadius??null,
    padInnerEdgeClearanceNeutral:p.padManufacturing==='neutral'?padInnerClearance:null,
    padOuterEdgeClearanceNeutral:p.padManufacturing==='neutral'?padOuterClearance:null,
    padInnerEdgeClearanceBasis:padInnerClearance,padOuterEdgeClearanceBasis:padOuterClearance,
    padDevelopmentRadius:pad?.developmentRadius??null,padHoleAxialLength,padHoleArcWidth,
    mainSeamAzimuth:((p.azimuth+180)%360),projectedLength:projection};
  return {valid:true,params:p,errors,warnings,templates,geometry,verification,measurements,stationTable,
    sampling:{sampledMaxChordError,guardFactor:CHORD_GUARD_FACTOR}};
}

/** Iterative precision controller. Analytic geometry is recalculated at a
 * higher polygon density; this never recursively calls computeJoint.
 * The check uses interior samples, not a rigorous global error theorem.
 */
export function computeJoint(raw={}) {
  const requestedSamples=Number(raw.samples??DEFAULT_PARAMS.samples);
  let result=computeJointAtSamples(raw),effectiveSamples=result.params.samples;
  const auto=result.params.autoPrecision;
  let maxChordError=result.verification.find(v=>v.id==='chord')?.value??null;
  while(result.valid&&auto&&maxChordError>result.params.tolerance&&effectiveSamples<PRECISION_SAMPLE_CAP) {
    const ratio=Math.sqrt(maxChordError/result.params.tolerance);
    const next=Math.min(PRECISION_SAMPLE_CAP,Math.max(effectiveSamples+4,Math.ceil(effectiveSamples*Math.max(1.35,ratio*1.12)/4)*4));
    result=computeJointAtSamples({...raw,samples:next});effectiveSamples=result.params.samples;
    maxChordError=result.verification.find(v=>v.id==='chord')?.value??null;
  }
  const metTolerance=result.valid&&maxChordError!==null&&maxChordError<=result.params.tolerance;
  const precision={requestedSamples,effectiveSamples,cap:PRECISION_SAMPLE_CAP,auto,
    metTolerance,maxChordError,tolerance:result.params.tolerance,
    sampledMaxChordError:result.sampling?.sampledMaxChordError??null,guardFactor:CHORD_GUARD_FACTOR,
    method:'sampled-interior-eighth-points-with-numerical-margin'};
  if(result.valid&&auto&&!metTolerance) {
    return {...result,valid:false,geometry:null,templates:[],stationTable:[],
      errors:[...result.errors,{field:'tolerance',message:`自動精度已達 ${PRECISION_SAMPLE_CAP} 段上限，取樣弦差 ${maxChordError.toPrecision(5)} mm 仍超過 ${result.params.tolerance} mm。請調整容差或幾何；已停止製作輸出。`}],
      precision,manufacturingReady:false};
  }
  const manufacturingReady=result.valid&&metTolerance&&result.verification.every(v=>v.status!=='fail');
  if(result.valid&&!manufacturingReady)result.warnings.push('離散輪廓僅供預覽；尚未達製作容差，請提高取樣數或開啟自動精度。');
  return {...result,precision,manufacturingReady};
}

/** Exact branch angular stations, independent of display polygon resolution.
 * Input may be a successful computeJoint result (preferred) or raw params.
 * Returns N+1 stations including 360°, using the same straight-end datum as
 * the 3D model. No interpolation of stationTable or mesh vertices is used.
 */
export function computeExactStationTable(input,segments=12) {
  if(!Number.isInteger(segments)||segments<1||segments>PRECISION_SAMPLE_CAP)
    throw new RangeError(`分點區段須為 1 至 ${PRECISION_SAMPLE_CAP} 的整數。`);
  const joint=input?.params&&typeof input.valid==='boolean'?input:
    computeJoint({...input,padEnabled:false,autoPrecision:false});
  if(!joint.valid||!joint.geometry)throw new RangeError('無效接頭無法產生精確分點表。');
  const p=joint.params,a=rad(p.angle),sa=Math.sin(a),ca=Math.cos(a);
  const R=p.jointType==='on'?p.mainOD/2+p.rootGap:p.mainOD/2-p.mainWall;
  const ro=p.branchOD/2,ri=ro-p.branchWall,projection=p.jointType==='in'?p.projection:0;
  const endT=joint.geometry.branch.axisEnd;
  const cutT=(radius,theta)=>(Math.sqrt(R*R-(p.offset+radius*Math.sin(theta))**2)-radius*Math.cos(theta)*ca)/sa-projection;
  const cutPoint=(radius,theta)=>{
    const t=cutT(radius,theta);
    return rotateAroundMain([p.jointPosition-radius*Math.cos(theta)*sa+t*ca,
      p.offset+radius*Math.sin(theta),radius*Math.cos(theta)*ca+t*sa],p.azimuth);
  };
  return Array.from({length:segments+1},(_,i)=>{
    const theta=i===segments?0:TAU*i/segments;
    return {station:i,angle:360*i/segments,circumference:TAU*ro*i/segments,
      outerDepth:endT-cutT(ro,theta),innerDepth:endT-cutT(ri,theta),
      outerPoint:cutPoint(ro,theta),innerPoint:cutPoint(ri,theta)};
  });
}
