// End geometry for tank bottoms, roofs and heads, in the tank's axial frame.
// Lengths mm, volumes mm³. d = axial distance outward from the tangent line: 0 at the shell, `depth` at the inside apex.
// The inside surface drives capacity; the mid-surface drives weight and flat developments.
const PI=Math.PI,rad=deg=>deg*PI/180;
export const END_LABELS=Object.freeze({open:'開口',flat:'平板',cone:'錐形',dome:'拱頂',elliptical:'2:1 橢圓',torispherical:'碟形',hemispherical:'半球'});
export const TOP_ENDS=Object.freeze(['open','flat','cone','dome','elliptical','torispherical','hemispherical']);
export const BOTTOM_ENDS=Object.freeze(['flat','cone','elliptical','torispherical','hemispherical']);
export const HORIZONTAL_ENDS=Object.freeze(['flat','cone','elliptical','torispherical','hemispherical']);
export const FORMED_ENDS=Object.freeze(['elliptical','torispherical','hemispherical']);
/** Ends butt-welded to the shell edge (their straight flange and joint gap shorten the shell plate). */
export const BUTT_ENDS=Object.freeze(['cone','elliptical','torispherical','hemispherical']);
export const TORI_PRESETS=Object.freeze({
  asme:Object.freeze({label:'ASME F&D',crown:1,knuckle:.06,note:'內側冠部半徑 L = Do，轉角半徑 r = 6% Do（ASME UG-32 標準碟形；r 不得小於 3 倍板厚）'}),
  klopper:Object.freeze({label:'Klöpper',crown:1,knuckle:.1,note:'DIN 28011：內側 R = Da，r = 0.1 Da'}),
  korbbogen:Object.freeze({label:'Korbbogen',crown:.8,knuckle:.154,note:'DIN 28013：內側 R = 0.8 Da，r = 0.154 Da'}),
  custom:Object.freeze({label:'自訂',crown:null,knuckle:null,note:'依封頭廠圖面，填內側冠部／轉角半徑對外徑的比例'})
});

/** Area of a circle of `radius` filled to `depth` from its lowest point. */
export function segmentArea(radius,depth){
  if(!(radius>0)||!(depth>0))return 0;if(depth>=2*radius)return PI*radius*radius;
  const h=radius-depth;return radius*radius*Math.acos(Math.max(-1,Math.min(1,h/radius)))-h*Math.sqrt(Math.max(0,2*radius*depth-depth*depth));
}
/** Composite adaptive Simpson on [a,b]; `tol` is the absolute tolerance of the whole integral. */
export function integrate(f,a,b,tol=1e-9,panels=8){
  if(!(b>a))return 0;
  const step=(a,b,fa,fm,fb,whole,eps,depth)=>{const m=(a+b)/2,l=(a+m)/2,r=(m+b)/2,fl=f(l),fr=f(r),left=(m-a)*(fa+4*fl+fm)/6,right=(b-m)*(fm+4*fr+fb)/6,delta=left+right-whole;
    if(depth>=40||Math.abs(delta)<=15*eps)return left+right+delta/15;return step(a,m,fa,fl,fm,left,eps/2,depth+1)+step(m,b,fm,fr,fb,right,eps/2,depth+1);};
  let sum=0;const h=(b-a)/panels;
  for(let i=0;i<panels;i++){const x0=a+i*h,x1=i===panels-1?b:x0+h,f0=f(x0),f1=f(x1),fm=f((x0+x1)/2);sum+=step(x0,x1,f0,fm,f1,(x1-x0)*(f0+4*fm+f1)/6,tol/panels,0);}
  return sum;
}
const offsetCurve=(points,t)=>points.map((p,i)=>{const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],dr=b[0]-a[0],dd=b[1]-a[1],n=Math.hypot(dr,dd)||1;return [p[0]+t*dd/n,p[1]-t*dr/n];});
// Outward normal of a profile running from the shell (r=ri,d=0) toward the apex is (dd,-dr)/|…| — pointing to larger r and larger d.

// Axial depth of a surface at radius r, from a profile polyline running from the shell (largest r) to the apex.
function depthOnPolyline(points,r){
  if(!points.length)return 0;if(r>=points[0][0])return points[0][1];
  for(let i=0;i<points.length-1;i++){const [r0,d0]=points[i],[r1,d1]=points[i+1];if(r<=r0&&r>=r1){const f=r0===r1?0:(r0-r)/(r0-r1);return d0+f*(d1-d0);}}
  return points[points.length-1][1];
}
function finish(end,profile){
  end.volume=end.volumeBetween(0,end.depth);
  end.profile=profile;
  // Inside depth d(r) (inverse of radiusAt) and outside depth for axis-parallel nozzles on the end.
  // Elliptical outside surface (an offset curve, not an ellipse): dense polyline sampled by the ellipse angle.
  if(!end.outerDepthAt){const fine=end.type==='elliptical'?Array.from({length:721},(_,i)=>{const u=i/720*PI/2;return [end.a*Math.cos(u),end.c*Math.sin(u)];}):Array.from({length:401},(_,i)=>{const d=end.depth*i/400;return [end.radiusAt(d),d];});const outer=offsetCurve(fine,end.t);outer.push([0,end.outer]);end.outerDepthAt=r=>depthOnPolyline(outer,Math.max(0,r));}
  end.fillFromApex=y=>end.volumeBetween(Math.max(0,end.depth-Math.max(0,y)),end.depth);
  end.fillFromTangent=y=>end.volumeBetween(0,Math.min(end.depth,Math.max(0,y)));
  return end;
}
/**
 * Builds one end. type: open | flat | cone | dome | elliptical | torispherical | hemispherical.
 * di inside shell diameter, t end thickness, angle cone wall angle from horizontal (deg), small cone small-end inside diameter,
 * crown / knuckle torispherical inside radii as fractions of the head OD (Do = di + 2t), dome dome radius as a multiple of di.
 */
export function endShape(type,{di,t=0,angle=45,small=0,crown=1,knuckle=.06,dome=1,straight=0}={}){
  const ri=di/2,base={type,ri,di,t,straight};
  if(type==='open'||type==='flat'){
    const end={...base,depth:0,outer:type==='flat'?t:0,radiusAt:()=>ri,volumeBetween:()=>0,midArea:0,minRadius:Infinity,curvature:'none',depthAt:()=>0,outerDepthAt:()=>type==='flat'?t:0};
    return finish(end,[[ri,0],[0,0]]);
  }
  if(type==='cone'){
    const beta=rad(angle),tan=Math.tan(beta),rs=Math.max(0,small/2),h=(ri-rs)*tan,sin=Math.sin(beta),cos=Math.cos(beta);
    const big=ri+t/2*sin,tip=rs+t/2*sin,slant=(ri-rs)/cos;
    // Outer extent along the axis: a frustum's small-end corner sits at h + t·cosβ; a pointed cone's outer apex at h + t/cosβ.
    const outer=rs>0?h+t*cos:h+t/cos;
    const end={...base,angle,small:2*rs,depth:h,outer,radiusAt:d=>ri-Math.min(h,Math.max(0,d))/tan,
      volumeBetween:(d0,d1)=>{d0=Math.max(0,d0);d1=Math.min(h,d1);if(!(d1>d0))return 0;const r0=ri-d0/tan,r1=ri-d1/tan;return PI*tan/3*(r0**3-r1**3);},
      midArea:PI*(big+tip)*slant,minRadius:rs>0?tip/sin:0,curvature:'single',
      depthAt:r=>Math.min(h,Math.max(0,(ri-r)*tan)),outerDepthAt:r=>Math.min(outer,Math.max(0,(ri-r)*tan+t/cos)),
      // Mean-surface flat development: an annular sector (ρ = r / cos β, sector angle 360° × cos β).
      development:{bigRadius:big,smallRadius:tip,slant,rhoOut:big/cos,rhoIn:tip/cos,theta:360*cos}};
    return finish(end,[[ri,0],[rs,h]]);
  }
  if(type==='elliptical'){
    const a=ri,c=ri/2,am=(di+t)/2,cm=di/4+t/2,e=Math.sqrt(1-cm*cm/am/am);
    const end={...base,a,c,depth:c,outer:c+t,radiusAt:d=>a*Math.sqrt(Math.max(0,1-(Math.min(c,Math.max(0,d))/c)**2)),
      volumeBetween:(d0,d1)=>{d0=Math.max(0,d0);d1=Math.min(c,d1);if(!(d1>d0))return 0;return PI*a*a*((d1-d0)-(d1**3-d0**3)/(3*c*c));},
      // Legacy thin-shell mid-surface area of the half oblate spheroid (kept identical to earlier estimates).
      midArea:PI*am*am*(1+(1-e*e)*Math.atanh(e)/e),minRadius:cm*cm/am,curvature:'double',
      depthAt:r=>c*Math.sqrt(Math.max(0,1-(Math.min(a,Math.max(0,r))/a)**2)),
      horizontalClosed:H=>{H=Math.max(0,Math.min(2*a,H));return PI*c*H*H*(3*a-H)/(6*a);}};
    return finish(end,Array.from({length:49},(_,i)=>{const u=i/48*PI/2;return [a*Math.cos(u),c*Math.sin(u)];}));
  }
  if(type==='hemispherical'){
    const R=ri,Rm=ri+t/2;
    const end={...base,depth:R,outer:R+t,radiusAt:d=>Math.sqrt(Math.max(0,R*R-Math.min(R,Math.max(0,d))**2)),
      volumeBetween:(d0,d1)=>{d0=Math.max(0,d0);d1=Math.min(R,d1);if(!(d1>d0))return 0;return PI*(R*R*(d1-d0)-(d1**3-d0**3)/3);},
      midArea:2*PI*Rm*Rm,minRadius:Rm,curvature:'double',sphere:{radius:Rm,polarMax:PI/2},
      depthAt:r=>Math.sqrt(Math.max(0,R*R-r*r)),outerDepthAt:r=>Math.sqrt(Math.max(0,(R+t)**2-r*r)),
      horizontalClosed:H=>{H=Math.max(0,Math.min(2*R,H));return PI*H*H*(3*R-H)/6;}};
    return finish(end,Array.from({length:49},(_,i)=>{const u=i/48*PI/2;return [R*Math.cos(u),R*Math.sin(u)];}));
  }
  if(type==='dome'){
    const Rd=dome*di,b=Math.sqrt(Math.max(0,Rd*Rd-ri*ri)),h=Rd-b,psi=Math.asin(Math.min(1,ri/Rd)),Rm=Rd+t/2;
    const end={...base,domeRadius:Rd,depth:h,outer:h+t,radiusAt:d=>Math.sqrt(Math.max(0,Rd*Rd-(Math.min(h,Math.max(0,d))+b)**2)),
      volumeBetween:(d0,d1)=>{d0=Math.max(0,d0);d1=Math.min(h,d1);if(!(d1>d0))return 0;return PI*(Rd*Rd*(d1-d0)-((d1+b)**3-(d0+b)**3)/3);},
      midArea:2*PI*Rm*Rm*(1-Math.cos(psi)),minRadius:Rm,curvature:'double',sphere:{radius:Rm,polarMax:psi},
      depthAt:r=>Math.max(0,Math.sqrt(Math.max(0,Rd*Rd-r*r))-b),outerDepthAt:r=>Math.max(0,Math.sqrt(Math.max(0,(Rd+t)**2-r*r))-b)};
    return finish(end,Array.from({length:49},(_,i)=>{const u=psi*(1-i/48);return [Rd*Math.sin(u),Rd*Math.cos(u)-b];}));
  }
  if(type==='torispherical'){
    const Do=di+2*t,L=crown*Do,rk=knuckle*Do,a=ri-rk,b=Math.sqrt(Math.max(0,(L-rk)**2-a*a)),h=L-b;
    const sinPhi=b/(L-rk),dj=rk*sinPhi,phiJ=Math.asin(Math.min(1,sinPhi)),psiJ=PI/2-phiJ;
    const Fk=x=>(a*a+rk*rk)*x-x**3/3+a*(x*Math.sqrt(Math.max(0,rk*rk-x*x))+rk*rk*Math.asin(Math.min(1,x/rk)));
    const Fc=x=>L*L*x-(x+b)**3/3,G=x=>x<=dj?Fk(x):Fk(dj)+Fc(x)-Fc(dj);
    const rm=rk+t/2,Lm=L+t/2;
    const end={...base,crown:L,knuckle:rk,a,b,depth:h,outer:h+t,knuckleDepth:dj,phiJ,psiJ,
      radiusAt:d=>{d=Math.min(h,Math.max(0,d));return d<=dj?a+Math.sqrt(Math.max(0,rk*rk-d*d)):Math.sqrt(Math.max(0,L*L-(d+b)**2));},
      volumeBetween:(d0,d1)=>{d0=Math.max(0,d0);d1=Math.min(h,d1);if(!(d1>d0))return 0;return PI*(G(d1)-G(d0));},
      midArea:2*PI*rm*(a*phiJ+rm*Math.sin(phiJ))+2*PI*Lm*Lm*(1-Math.cos(psiJ)),minRadius:rm,curvature:'double',
      // Knuckle (torus) outside the junction radius, crown (sphere) inside it; the outer surface keeps the same centres.
      depthAt:r=>{const rj=a*L/(L-rk);return r>=rj?Math.sqrt(Math.max(0,rk*rk-(r-a)**2)):Math.sqrt(Math.max(0,L*L-r*r))-b;},
      outerDepthAt:r=>{const rj=a*(L+t)/(L-rk);return r>=rj?Math.sqrt(Math.max(0,(rk+t)**2-(r-a)**2)):Math.sqrt(Math.max(0,(L+t)**2-r*r))-b;},
      junctionRadius:a*L/(L-rk)};
    const knucklePts=Array.from({length:25},(_,i)=>{const f=i/24*phiJ;return [a+rk*Math.cos(f),rk*Math.sin(f)];}),crownPts=Array.from({length:25},(_,i)=>{const s=psiJ*(1-(i+1)/25);return [L*Math.sin(s),L*Math.cos(s)-b];});
    return finish(end,[...knucklePts,...crownPts]);
  }
  throw new Error('不支援的端部型式：'+type);
}
/** Outside surface profile (offset by the end thickness), for drawings and 3D. */
export function outerProfile(end){if(end.type==='open')return [];if(end.type==='flat')return [[end.ri,0],[end.ri,end.t],[0,end.t]];return offsetCurve(end.profile,end.t);}
/** Volume of one end when the tank lies horizontal, liquid `level` measured from the shell's inside bottom. */
export function horizontalEndVolume(end,level){
  const R=end.ri;if(!(end.depth>0)||!(level>0))return 0;if(level>=2*R)return end.volume;
  if(end.horizontalClosed)return end.horizontalClosed(level);
  const f=d=>{const r=end.radiusAt(d);return segmentArea(r,level-(R-r));};
  // Split where the liquid plane is tangent to a section (r = R-level below, r = level-R above) so each piece is smooth.
  const cuts=[0,end.depth];for(const target of [R-level,level-R])if(target>0&&target<R){let lo=0,hi=end.depth;for(let i=0;i<80;i++){const m=(lo+hi)/2;if(end.radiusAt(m)>target)lo=m;else hi=m;}cuts.push((lo+hi)/2);}
  cuts.sort((x,y)=>x-y);let sum=0;const tol=PI*R*R*end.depth*1e-11;
  for(let i=0;i<cuts.length-1;i++)sum+=integrate(f,cuts[i],cuts[i+1],tol/(cuts.length-1));
  return sum;
}
/** First moment ∫ d·A(d) dd of a horizontal end's liquid about its tangent line (d measured outward), mm⁴. */
export function horizontalEndMoment(end,level){
  const R=end.ri;if(!(end.depth>0)||!(level>0))return 0;const L=Math.min(level,2*R);
  const f=d=>{const r=end.radiusAt(d);return d*segmentArea(r,L-(R-r));};
  const cuts=[0,end.depth];for(const target of [R-L,L-R])if(target>0&&target<R){let lo=0,hi=end.depth;for(let i=0;i<80;i++){const m=(lo+hi)/2;if(end.radiusAt(m)>target)lo=m;else hi=m;}cuts.push((lo+hi)/2);}
  cuts.sort((x,y)=>x-y);let sum=0;const tol=PI*R*R*end.depth*end.depth*1e-11;
  for(let i=0;i<cuts.length-1;i++)sum+=integrate(f,cuts[i],cuts[i+1],tol/(cuts.length-1));
  return sum;
}
/** Equal-area blank estimate for a formed head (mid-surface plus straight flange). Reference only: forming thins and stretches. */
export function equalAreaBlank(end){if(!['elliptical','torispherical','hemispherical','dome'].includes(end.type))return null;const flange=PI*(end.di+end.t)*end.straight;return Math.sqrt(4*(end.midArea+flange)/PI);}
/** Extreme-fibre forming strain %, ASME UG-79 form: single curvature 50t/Rf, double curvature 75t/Rf (flat start, Ro = ∞). */
export function formingStrain(t,radius,curvature){if(!(radius>0)||curvature==='none')return null;return (curvature==='double'?75:50)*t/radius;}
export function endIssues(type,o,field){
  const issues=[],add=message=>issues.push({field,message});
  if(type==='cone'){
    if(!(o.angle>=1&&o.angle<=89))add('錐面與水平夾角需在 1°～89° 之間。');
    if(!(o.small>=0&&o.small<o.di-1))add('錐體小端內徑需小於槽內徑。');
  }
  if(type==='torispherical'){
    const Do=o.di+2*o.t,L=o.crown*Do,r=o.knuckle*Do;
    if(!(o.crown>0&&o.knuckle>0))add('碟形封頭冠部與轉角半徑比例需大於 0。');
    else if(!(r<o.di/2))add('碟形轉角半徑需小於槽內半徑。');
    else if(!(L>o.di/2))add('碟形冠部半徑需大於槽內半徑，才能與轉角相切。');
  }
  if(type==='dome'&&!(o.dome*o.di>=o.di/2))add('拱頂半徑需不小於槽內半徑（半徑比 ≥ 0.5 × 內徑）。');
  return issues;
}
