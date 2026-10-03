import {resolveElbowAlignment,elbowAlignmentReference} from './elbow-axis.js';
import {computeFormedElbowPad} from './formed-elbow-pad.js';
/** Ideal finite circular elbow + straight branch, millimetres/degrees.
 * No dependency on the existing Site checkout. Torus coordinates are NOT an
 * isometric development of the elbow. Only the straight branch is developed.
 */
export const DEFAULT_ELBOW_PARAMS=Object.freeze({hostType:'elbow',
  mainOD:200,mainWall:6,mainLength:600,jointPosition:300,
  branchOD:100,branchWall:4,branchLength:200,angle:90,jointType:'on',
  rootGap:0,holeGap:.5,projection:0,offset:0,azimuth:0,
  bendRadius:304.8,bendAngle:90,bendPosition:45,surfaceClock:0,branchSwivel:0,elbowAlignment:'free',motherOpening:true,
  padEnabled:false,tolerance:.1,samples:360,autoPrecision:true});
export const ELBOW_SAMPLE_CAP=4096;
const TAU=Math.PI*2,EPS=1e-9,GUARD=1.1;
const FRACTIONS=Array.from({length:7},(_,i)=>(i+1)/8);
const rad=d=>d*Math.PI/180;
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,k)=>a.map(v=>v*k);
const norm=v=>Math.hypot(...v);
const unit=v=>mul(v,1/norm(v));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const distance=(a,b)=>norm(sub(a,b));
const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const close=p=>[...p,[...p[0]]];
const wrap=a=>((a%TAU)+TAU)%TAU;
const unwrap=(a,center)=>center+Math.atan2(Math.sin(a-center),Math.cos(a-center));

export function elbowFrame(beta,bendRadius) {
  const s=Math.sin(beta),c=Math.cos(beta);
  return {center:[bendRadius*s,bendRadius*(1-c),0],tangent:[c,s,0],normal:[s,-c,0],binormal:[0,0,1]};
}
export function torusSurfacePoint(beta,phi,bendRadius,tubeRadius) {
  const f=elbowFrame(beta,bendRadius);
  return add(f.center,mul(add(mul(f.normal,Math.cos(phi)),mul(f.binormal,Math.sin(phi))),tubeRadius));
}
export function torusCoordinates(point,bendRadius) {
  const x=point[0],y=point[1]-bendRadius,z=point[2],planar=Math.hypot(x,y);
  const beta=wrap(Math.atan2(x,-y)),delta=planar-bendRadius,tubeDistance=Math.hypot(delta,z);
  const phi=Math.atan2(z,delta),normal=tubeDistance>EPS?
    [delta*x/(planar*tubeDistance),delta*y/(planar*tubeDistance),z/tubeDistance]:[0,0,0];
  return {beta,phi,tubeDistance,normal};
}

function evaluatePolynomial(c,x) {let y=0;for(let i=c.length-1;i>=0;i--)y=y*x+c[i];return y;}
function polynomialDerivative(c){return c.slice(1).map((v,i)=>v*(i+1));}
function unique(values,tol=1e-11){return values.sort((a,b)=>a-b).filter((v,i,a)=>!i||Math.abs(v-a[i-1])>tol);}
/** Derivative isolation partitions a degree<=4 polynomial into monotone
 * intervals. Recursion is bounded by its degree, not geometric sampling. */
function isolatePolynomial(c,lo,hi) {
  while(c.length>1&&Math.abs(c.at(-1))<1e-16)c=c.slice(0,-1);
  if(c.length<=1)return [];
  if(c.length===2){const t=-c[0]/c[1];return t>=lo-1e-12&&t<=hi+1e-12?[Math.max(lo,Math.min(hi,t))]:[];}
  const critical=isolatePolynomial(polynomialDerivative(c),lo,hi),knots=unique([lo,...critical,hi]);
  const roots=[];
  for(const t of knots)if(Math.abs(evaluatePolynomial(c,t))<1e-13)roots.push(t);
  for(let i=0;i<knots.length-1;i++) {
    let a=knots[i],b=knots[i+1],fa=evaluatePolynomial(c,a),fb=evaluatePolynomial(c,b);
    if(fa*fb>=0)continue;
    for(let k=0;k<60;k++) {
      const m=(a+b)/2,fm=evaluatePolynomial(c,m);
      if(fa*fm<=0){b=m;fb=fm;}else{a=m;fa=fm;}
      if(b-a<1e-14)break;
    }
    roots.push((a+b)/2);
  }
  return unique(roots);
}

/** FULL torus intersections. Finite angular filtering is deliberately left
 * to the caller so remote roots are never silently substituted for near roots.
 * Coefficients and sphere interval use t/(Rc+r); physical signed-distance
 * bisection avoids cancellation in the thin-torus quartic polynomial. */
export function torusLineIntersections(foot,direction,bendRadius,tubeRadius) {
  const scale=bendRadius+tubeRadius,q=mul(sub(foot,[0,bendRadius,0]),1/scale),d=direction;
  const a=dot(d,d),b=2*dot(q,d),r=bendRadius/scale,h=tubeRadius/scale;
  const c=dot(q,q)+r*r-h*h,A=d[0]*d[0]+d[1]*d[1],B=2*(q[0]*d[0]+q[1]*d[1]),C=q[0]*q[0]+q[1]*q[1];
  const coeff=[c*c-4*r*r*C,2*b*c-4*r*r*B,b*b+2*a*c-4*r*r*A,2*a*b,a*a];
  const center=-dot(q,d)/a,disc=dot(q,d)**2-a*(dot(q,q)-1);
  if(disc<-1e-14)return [];
  const half=Math.sqrt(Math.max(0,disc))/a,lo=center-half,hi=center+half;
  const critical=isolatePolynomial(polynomialDerivative(coeff),lo,hi),knots=unique([lo,...critical,hi]);
  const pointAt=u=>add(foot,mul(d,u*scale));
  const signed=u=>torusCoordinates(pointAt(u),bendRadius).tubeDistance-tubeRadius;
  const values=[];
  for(const u of knots)if(Math.abs(signed(u))<1e-7)values.push(u);
  for(let i=0;i<knots.length-1;i++) {
    let x=knots[i],y=knots[i+1],fx=signed(x),fy=signed(y);
    if(fx*fy>=0)continue;
    for(let iteration=0;iteration<65;iteration++) {
      const mid=(x+y)/2,fm=signed(mid);
      if(fx*fm<=0){y=mid;fy=fm;}else{x=mid;fx=fm;}
      if((y-x)*scale<2e-9)break;
    }
    values.push((x+y)/2);
  }
  return unique(values,1e-8/scale).map(u=>{
    let t=u*scale;
    // Polish using the geometric normal, independent of polynomial Horner.
    for(let k=0;k<5;k++) {
      const point=add(foot,mul(d,t)),info=torusCoordinates(point,bendRadius),res=info.tubeDistance-tubeRadius,gradient=dot(info.normal,d);
      if(Math.abs(gradient)<1e-10||Math.abs(res)<1e-10)break;
      const next=t-res/gradient;
      if(next<lo*scale-1e-7||next>hi*scale+1e-7)break;
      t=next;
    }
    const point=add(foot,mul(d,t)),info=torusCoordinates(point,bendRadius);
    return {t,point,...info,normalDotDirection:dot(info.normal,d),residual:info.tubeDistance-tubeRadius};
  }).filter(root=>Math.abs(root.residual)<1e-6).sort((a,b)=>a.t-b.t);
}

function validate(raw) {
  const p=resolveElbowAlignment({...DEFAULT_ELBOW_PARAMS,...raw}),errors=[],error=(field,message)=>errors.push({field,message});
  for(const field of ['mainOD','mainWall','branchOD','branchWall','branchLength','angle','rootGap','holeGap','projection',
    'bendRadius','bendAngle','bendPosition','surfaceClock','branchSwivel','tolerance','samples']) {
    p[field]=Number(p[field]);if(!Number.isFinite(p[field]))error(field,'請輸入有限數值。');
  }
  for(const f of ['mainOD','mainWall','branchOD','branchWall','branchLength','bendRadius','tolerance'])if(p[f]<=0)error(f,'尺寸必須大於 0。');
  if(p.mainWall*2>=p.mainOD)error('mainWall','主管壁厚須小於外徑的一半。');
  if(p.branchWall*2>=p.branchOD)error('branchWall','支管壁厚須小於外徑的一半。');
  if(p.bendRadius<=p.mainOD/2+p.rootGap)error('bendRadius','理想環面需彎曲中心半徑大於管外半徑與間隙。');
  if(p.bendAngle<=0||p.bendAngle>180)error('bendAngle','此版支援大於 0° 至 180° 的有限彎頭。');
  if(p.bendPosition<=0||p.bendPosition>=p.bendAngle)error('bendPosition','接頭中心須位於彎頭兩端之間。');
  if(p.elbowAlignment==='free'?(p.angle<5||p.angle>175):(p.angle<=0||p.angle>=180))error('angle','支管與當地切線夾角不在有效範圍。');
  if(!['free','a-axis','b-axis'].includes(p.elbowAlignment))error('elbowAlignment','請選有效的中心線定位方式。');
  if(typeof p.motherOpening!=='boolean')error('motherOpening','母管開孔設定須為布林值。');
  if(!p.motherOpening&&(p.jointType!=='on'||p.projection!==0))error('jointType','母管封閉的支撐管只支援外焊貼合，內插須啟用開孔。');
  for(const f of ['rootGap','holeGap','projection'])if(p[f]<0)error(f,'間隙與伸入量不可小於 0。');
  if(!['on','in'].includes(p.jointType))error('jointType','接頭型式須為 on 或 in。');
  if(!Number.isInteger(p.samples)||p.samples<36||p.samples>ELBOW_SAMPLE_CAP)error('samples','取樣段數須為 36 至 4096 的整數。');
  if(typeof p.autoPrecision!=='boolean')error('autoPrecision','自動精度設定須為布林值。');
  if(typeof p.padEnabled!=='boolean')error('padEnabled','補強板設定須為布林值。');
  p.surfaceClock=((p.surfaceClock%360)+360)%360;
  p.branchSwivel=((p.branchSwivel+180)%360+360)%360-180;
  p.hostType='elbow';return {p,errors};
}

function createModel(p) {
  const Rc=p.bendRadius,R=p.mainOD/2,Ri=R-p.mainWall,ro=p.branchOD/2,ri=ro-p.branchWall;
  const beta=rad(p.bendPosition),phi=rad(p.surfaceClock),bend=rad(p.bendAngle),a=rad(p.angle),psi=rad(p.branchSwivel);
  const frame=elbowFrame(beta,Rc),m=add(mul(frame.normal,Math.cos(phi)),mul(frame.binormal,Math.sin(phi)));
  const k=add(mul(frame.normal,-Math.sin(phi)),mul(frame.binormal,Math.cos(phi)));
  const origin=add(frame.center,mul(m,R)),d=unit(add(mul(frame.tangent,Math.cos(a)),mul(add(mul(m,Math.cos(psi)),mul(k,Math.sin(psi))),Math.sin(a))));
  const e0=unit(sub(mul(frame.tangent,-1),mul(d,dot(mul(frame.tangent,-1),d)))),e90=unit(cross(e0,d));
  const normalDotDirection=dot(m,d),seed=new Map(),cache=new Map();
  const normalExtrados=p.surfaceClock===0&&p.angle===90&&p.branchSwivel===0;
  const finite=point=>point[0]>=-1e-7&&dot([Math.cos(bend),Math.sin(bend),0],sub(point,[0,Rc,0]))<=1e-7;
  const coordinate=point=>{const q=torusCoordinates(point,Rc);return {beta:q.beta,phi:unwrap(q.phi,phi),uv:[Rc*q.beta,R*unwrap(q.phi,phi)]};};
  const foot=(radius,theta)=>add(origin,mul(add(mul(e0,Math.cos(theta)),mul(e90,Math.sin(theta))),radius));
  const roots=(f,radius)=>torusLineIntersections(f,d,Rc,radius);
  const anchor=minor=>{
    if(!seed.has(minor)) {
      const candidates=roots(origin,minor).filter(q=>q.normalDotDirection>1e-7);
      const expected=(minor-R)/normalDotDirection;
      candidates.sort((a,b)=>Math.abs(a.t-expected)-Math.abs(b.t-expected));
      if(!candidates.length)throw new Error('此方向無法形成連續近側交線。');
      const q=candidates[0];if(!finite(q.point))throw new Error('接頭交線跨出彎頭端部。');seed.set(minor,q);
    }
    return seed.get(minor);
  };
  const near=(radius,minor,theta)=>{
    theta=wrap(theta);const key=`${radius}/${minor}/${theta.toFixed(13)}`;
    if(cache.has(key))return cache.get(key);
    const f=foot(radius,theta);
    // Exact circular-section solution for the narrowly defined radial
    // extrados case. It is not used for side, belly, swivel or oblique joints.
    if(normalExtrados) {
      const z=radius*Math.sin(theta),w=radius*Math.cos(theta),h2=minor*minor-z*z;
      if(h2<=0)throw new Error('支管切口出現相切或開放交線，請縮小支管或調整位置及角度。');
      const u2=(Rc+Math.sqrt(h2))**2-w*w;
      if(u2<=0)throw new Error('支管切口出現相切或開放交線，請縮小支管或調整位置及角度。');
      const t=Math.sqrt(u2)-(Rc+R),point=add(f,mul(d,t)),info=torusCoordinates(point,Rc),normalDotDirection=dot(info.normal,d);
      if(normalDotDirection<=1e-7)throw new Error('支管切口近於相切，無法形成穩定近側交線。');
      if(!finite(point))throw new Error('支管切口或主管開孔跨出有限彎頭端部。');
      const result={t,point,...info,normalDotDirection,residual:info.tubeDistance-minor,foot:f,
        uv:[Rc*info.beta,minor*unwrap(info.phi,phi)],radius,minor,theta};
      cache.set(key,result);return result;
    }
    const base=anchor(minor),candidates=roots(f,minor).filter(q=>q.normalDotDirection>1e-7);
    candidates.sort((a,b)=>Math.abs(a.t-base.t)-Math.abs(b.t-base.t));
    if(!candidates.length)throw new Error('支管切口出現相切或開放交線，請縮小支管或調整位置及角度。');
    const q=candidates[0];
    if(!finite(q.point))throw new Error('支管切口或主管開孔跨出有限彎頭端部。');
    if(distance(q.point,base.point)>Math.max(4*R,6*radius/Math.max(.1,normalDotDirection)))throw new Error('近側交線跳至另一支環面分支。');
    const result={...q,foot:f,uv:[Rc*q.beta,minor*unwrap(q.phi,phi)],radius,minor,theta};
    cache.set(key,result);return result;
  };
  const endPlanes=f=>{
    const values=[];
    for(const [center,tangent,name] of [[frameAt(0).center,frameAt(0).tangent,'A'],[frameAt(bend).center,frameAt(bend).tangent,'B']]) {
      const den=dot(tangent,d);if(Math.abs(den)<1e-12)continue;
      const t=dot(tangent,sub(center,f))/den,point=add(f,mul(d,t));
      values.push({t,point,name,sectionRadius:distance(point,center)});
    }
    return values;
  };
  function frameAt(b){return elbowFrame(b,Rc);}
  const occupied=point=>{if(!finite(point))return false;const q=torusCoordinates(point,Rc).tubeDistance;return q>=Ri-1e-7&&q<=R+1e-7;};
  const cutMinor=p.jointType==='on'?R+p.rootGap:Ri,projection=p.jointType==='in'?p.projection:0;
  const cut=(radius,theta)=>{
    const q=near(radius,cutMinor,theta),t=q.t-projection,point=add(q.foot,mul(d,t));
    if(projection&&!finite(point))throw new Error('內插伸入後切口越過彎頭端面。');
    return {...q,t,point,unprojectedT:q.t,unprojectedPoint:q.point};
  };
  return {Rc,R,Ri,ro,ri,beta,phi,bend,frame,origin,d,e0,e90,m,normalDotDirection,
    finite,coordinate,foot,roots,near,endPlanes,occupied,cut,cutMinor,projection,normalExtrados};
}

function extremum(fn,values,wantMax) {
  const n=values.length-1,results=[];
  for(let i=0;i<n;i++) {
    const v=values[i],before=values[(i+n-1)%n],after=values[(i+1)%n];
    if(wantMax?v>=before&&v>=after:v<=before&&v<=after) {
      let lo=TAU*(i-1)/n,hi=TAU*(i+1)/n,q=(Math.sqrt(5)-1)/2;
      let x=hi-q*(hi-lo),y=lo+q*(hi-lo),fx=fn(x),fy=fn(y);
      for(let k=0;k<35;k++) {
        if(wantMax?fx>fy:fx<fy){hi=y;y=x;fy=fx;x=hi-q*(hi-lo);fx=fn(x);}
        else{lo=x;x=y;fx=fy;y=lo+q*(hi-lo);fy=fn(y);}
      }
      results.push(fn((lo+hi)/2));
    }
  }
  const all=[...values,...results];return wantMax?Math.max(...all):Math.min(...all);
}
const perimeter=p=>p.slice(1).reduce((sum,v,i)=>sum+distance(v,p[i]),0);

function build(raw) {
  const {p,errors}=validate(raw),warnings=[];
  const fail=(field,message)=>({valid:false,params:p,errors:[...errors,...(message?[{field,message}]:[])],warnings,
    templates:[],geometry:null,verification:[],measurements:{},stationTable:[],manufacturingReady:false});
  if(errors.length)return fail();
  const model=createModel(p),n=p.samples;
  if(model.normalDotDirection<=1e-5)return fail('branchSwivel','支管必須朝主管外表面法線的外側；此方向近於相切或朝內。');
  const opening=p.motherOpening,tool=opening?(p.jointType==='on'?model.ri:model.ro)+p.holeGap:null;
  const circle=(radius,minor,cut=false)=>{
    const ring=Array.from({length:n},(_,i)=>cut?model.cut(radius,TAU*i/n):model.near(radius,minor,TAU*i/n));
    ring.push({...ring[0],point:[...ring[0].point]});return ring;
  };
  let outer,inner,holeOuter=[],holeInner=[],contactOuter=[],contactInner=[],endT,maximumDepth,sampledMaxChordError=0,minimumProjectionClearance=Infinity;
  const wallRadii=[model.ri,(3*model.ri+model.ro)/4,(model.ri+model.ro)/2,(model.ri+3*model.ro)/4,model.ro];
  // Probe each branch segment internally too; collision checks must not rely
  // on mesh endpoints (e.g. 37 stations miss the true 90 degree tip limit).
  const wallAngularSamples=Math.min(ELBOW_SAMPLE_CAP,n*8);
  let wallChecks=0,rootResidual=0,roundTripError=0,minNormalDot=1;
  try {
    if(model.normalExtrados)for(const [radius,minor] of [[model.ro,model.cutMinor],...(opening?[[tool,model.R],[tool,model.Ri]]:[[model.ro,model.R]])]) {
      // For r<minor, |beta-beta0| is maximized at binormal offset z=0:
      // sin(deltaBeta)=r/(Rc+minor). This encloses all intermediate wall radii,
      // rather than inferring finite-end clearance only from sampled loops.
      if(radius>=minor)throw new Error('支管切口出現相切或開放交線，請縮小支管或調整位置及角度。');
      const delta=Math.asin(radius/(model.Rc+minor));
      if(model.beta-delta<0||model.beta+delta>model.bend)throw new Error('支管切口或主管開孔跨出有限彎頭端部。');
    }
    outer=circle(model.ro,model.cutMinor,true);inner=circle(model.ri,model.cutMinor,true);
    if(opening){holeOuter=circle(tool,model.R);holeInner=circle(tool,model.Ri);}else{contactOuter=circle(model.ro,model.R);contactInner=circle(model.ri,model.R);}
    const maxT=Math.max(extremum(t=>model.cut(model.ro,t).t,outer.map(q=>q.t),true),
      extremum(t=>model.cut(model.ri,t).t,inner.map(q=>q.t),true));
    endT=maxT+p.branchLength;
    maximumDepth=endT-extremum(t=>model.cut(model.ro,t).t,outer.map(q=>q.t),false);
    const series=[[model.ro,model.cutMinor,true,outer],[model.ri,model.cutMinor,true,inner],
      ...(opening?[[tool,model.R,false,holeOuter],[tool,model.Ri,false,holeInner]]:[[model.ro,model.R,false,contactOuter],[model.ri,model.R,false,contactInner]])];
    for(const [radius,minor,isCut,ring] of series)for(let i=0;i<n;i++) {
      const a=ring[i],b=ring[i+1];
      if(distance(a.point,b.point)>Math.max(20,TAU*radius/n*15/Math.max(.1,model.normalDotDirection)))
        throw new Error('取樣相鄰交線不連續；近側分支可能跳轉。');
      rootResidual=Math.max(rootResidual,Math.abs(a.residual));minNormalDot=Math.min(minNormalDot,a.normalDotDirection);
      const uv=a.uv,back=torusSurfacePoint(uv[0]/model.Rc,uv[1]/minor,model.Rc,minor);
      roundTripError=Math.max(roundTripError,distance(back,isCut?a.unprojectedPoint:a.point));
      for(const fraction of FRACTIONS) {
        const q=isCut?model.cut(radius,TAU*(i+fraction)/n):model.near(radius,minor,TAU*(i+fraction)/n);
        sampledMaxChordError=Math.max(sampledMaxChordError,distance(q.point,lerp(a.point,b.point,fraction)));
        // Branch circumference is exactly linear in theta, so its planar
        // development chord error is the axis-depth deviation alone.
        if(isCut)sampledMaxChordError=Math.max(sampledMaxChordError,Math.abs(q.t-(a.t+(b.t-a.t)*fraction)));
      }
    }
    // Physical collision is checked only over the retained finite branch.
    // Remote full-torus roots outside the real elbow's arc never count.
    const checkWall=(radius,theta)=>{
      const f=model.foot(radius,theta),nearOuter=model.near(radius,model.R,theta),nearInner=p.jointType==='in'?model.near(radius,model.Ri,theta):null;
      const cut=model.cut(radius,theta),caps=model.endPlanes(f);
      // Normal extrados: after the near cut, u=Rc+R+t grows, and
      // hypot(hypot(u,w)-Rc,z) is monotone. beta converges toward beta0.
      // Thus no retained outward portion can hit another arm or end annulus.
      // Inserted tips still require the first inside-wall/end stop below.
      if(model.normalExtrados) {
        if(p.jointType==='on')return Infinity;
        const z=radius*Math.sin(theta),w=radius*Math.cos(theta),h=Math.sqrt(model.Ri**2-z*z),stops=[];
        for(const planar of [model.Rc-h,model.Rc+h]) {
          const u2=planar*planar-w*w;if(u2<0)continue;
          for(const sign of [-1,1]) {
            const t=sign*Math.sqrt(u2)-(model.Rc+model.R),point=add(f,mul(model.d,t));
            if(t<nearInner.t-1e-6&&model.finite(point))stops.push(t);
          }
        }
        stops.push(...caps.filter(q=>q.t<nearInner.t-1e-6&&q.sectionRadius<=model.Ri+1e-7).map(q=>q.t));
        let available=Infinity;
        if(stops.length) {
          available=nearInner.t-Math.max(...stops);
          minimumProjectionClearance=Math.min(minimumProjectionClearance,available);
          if(p.projection>=available-1e-7)throw new Error('內插切口伸入量達到有限彎頭內壁或開口端面。');
        }
        wallChecks++;return available;
      }
      const outerRoots=model.roots(f,model.R),innerRoots=model.roots(f,model.Ri);
      const candidates=[cut.t,endT,...outerRoots.filter(q=>model.finite(q.point)).map(q=>q.t),
        ...innerRoots.filter(q=>model.finite(q.point)).map(q=>q.t),...caps.map(q=>q.t)].filter(t=>t>=cut.t-EPS&&t<=endT+EPS);
      const knots=unique(candidates,1e-7);
      for(let j=0;j<knots.length-1;j++) {
        const t=(knots[j]+knots[j+1])/2;
        if(knots[j+1]-knots[j]<1e-6||!model.occupied(add(f,mul(model.d,t))))continue;
        const allowedNearWall=p.jointType==='in'&&t>=nearInner.t-1e-7&&t<=nearOuter.t+1e-7;
        if(!allowedNearWall)throw new Error(p.jointType==='in'&&t<nearInner.t?'內插伸入量穿越有限彎頭另一側內壁。':'保留支管管身與有限彎頭另一段或端面材料干涉。');
      }
      for(const cap of caps)if(cap.t>cut.t+1e-7&&cap.t<endT-1e-7&&cap.sectionRadius>=model.Ri-1e-7&&cap.sectionRadius<=model.R+1e-7)
        throw new Error('保留支管管身穿越彎頭端面環形材料。');
      let available=Infinity;
      if(p.jointType==='in') {
        const stops=innerRoots.filter(q=>model.finite(q.point)&&q.t<nearInner.t-1e-6).map(q=>q.t);
        stops.push(...caps.filter(q=>q.t<nearInner.t-1e-6&&q.sectionRadius<=model.Ri+1e-7).map(q=>q.t));
        if(stops.length) {
          available=nearInner.t-Math.max(...stops);
          minimumProjectionClearance=Math.min(minimumProjectionClearance,available);
          if(p.projection>=available-1e-7)throw new Error('內插切口伸入量達到有限彎頭內壁或開口端面。');
        }
      }
      wallChecks++;
      return available;
    };
    for(const radius of model.normalExtrados&&p.jointType==='on'?[]:wallRadii) {
      const available=Array.from({length:wallAngularSamples},(_,i)=>checkWall(radius,TAU*i/wallAngularSamples));
      // Polish sampled local minima of the finite stop distance. This is not
      // a global radial/thickness envelope theorem; it closes angular extrema
      // that otherwise fall between the discrete collision probes.
      if(p.jointType==='in')for(let i=0;i<wallAngularSamples;i++) {
        const v=available[i],before=available[(i+wallAngularSamples-1)%wallAngularSamples],after=available[(i+1)%wallAngularSamples];
        if(!Number.isFinite(v)||v>before||v>after||(v===before&&v===after))continue;
        let lo=TAU*(i-1)/wallAngularSamples,hi=TAU*(i+1)/wallAngularSamples,q=(Math.sqrt(5)-1)/2;
        let x=hi-q*(hi-lo),y=lo+q*(hi-lo),fx=checkWall(radius,x),fy=checkWall(radius,y);
        for(let k=0;k<30;k++) {
          if(fx<fy){hi=y;y=x;fy=fx;x=hi-q*(hi-lo);fx=checkWall(radius,x);}
          else{lo=x;x=y;fx=fy;y=lo+q*(hi-lo);fy=checkWall(radius,y);}
        }
        checkWall(radius,(lo+hi)/2);
      }
    }
  }catch(e){return fail('elbowGeometry',e.message);}
  const C=TAU*model.ro,outerCut=outer.map(q=>q.point),innerCut=inner.map(q=>q.point);
  const endRing=radius=>close(Array.from({length:n},(_,i)=>add(model.foot(radius,TAU*i/n),mul(model.d,endT))));
  const branchCurve=outer.map((q,i)=>[C*i/n,endT-q.t]),innerCurve=inner.map((q,i)=>[C*i/n,endT-q.t]);
  const branchOutline=close([[0,0],[C,0],...[...branchCurve].reverse()]);
  const height=Math.max(...branchCurve.map(q=>q[1]));
  const stationTable=outer.map((q,i)=>({hostType:'elbow',station:i,angle:360*i/n,circumference:C*i/n,
    outerDepth:endT-q.t,innerDepth:endT-inner[i].t,outerPoint:q.point,innerPoint:inner[i].point}));
  const template={id:'branch',title:'彎頭母管／直支管 fishmouth 樣板',basis:'直支管實際外徑包覆',
    outer:branchOutline,holes:[],references:[{points:innerCurve,label:'內緣對應角度參考（非內徑展開）',type:'inner-edge'},
      {points:[[0,0],[0,endT-outer[0].t]],label:'0° 起縫基準',type:'seam'}],width:C,height,
    notes:['主管為有限理想圓形彎頭；此圖只展開直支管外壁。',
      '0° 為 −當地切線在支管橫截面的投影；由自由端朝接頭看，站角順時針增加。',
      '未包含坡口、刀縫、焊接收縮、彎頭橢圓度或實測形變。',
      '彎頭壁厚方向交線未具全域凸性；此版不提供粗切留料包絡。',
      ...(opening?[]:['外焊支撐：母管保持封閉，貼合定位輪廓不得當母管開孔切線。']),
      ...(p.elbowAlignment==='free'?[]:[`${p.elbowAlignment==='b-axis'?'B':'A'} 端中心線與支管軸線重合，延伸方向由同軸條件計算。`])],
    mapping:{coordinateSystem:'branch-outer-wrap',circumference:C,axisEnd:endT,origin:[0,0],hostType:'elbow'}};
  const locator=(q,minor)=>({betaDegrees:q.beta*180/Math.PI,phiDegrees:unwrap(q.phi,model.phi)*180/Math.PI,
    centerlineDistance:model.Rc*q.beta,backSpineDistance:(model.Rc+minor)*q.beta,
    circumferentialDistance:minor*unwrap(q.phi,model.phi),point:q.point});
  const geometry={branch:{outerCut,innerCut,outerEnd:endRing(model.ro),innerEnd:endRing(model.ri),
    outerRadius:model.ro,innerRadius:model.ri,axisEnd:endT},
    elbow:{bendRadius:model.Rc,bendAngle:rad(p.bendAngle),bendPosition:rad(p.bendPosition),surfaceClock:rad(p.surfaceClock),
      motherOpening:opening,outerContact3D:contactOuter.map(q=>q.point),innerContact3D:contactInner.map(q=>q.point),
      outerRadius:model.R,innerRadius:model.Ri,outerHole3D:holeOuter.map(q=>q.point),innerHole3D:holeInner.map(q=>q.point),
      outerHoleUV:holeOuter.map(q=>q.uv),innerHoleUV:holeInner.map(q=>q.uv),
      outerHoleLocator:holeOuter.map(q=>locator(q,model.R)),innerHoleLocator:holeInner.map(q=>locator(q,model.Ri)),
      mapping:{coordinateSystem:'torus-parameters-not-isometric-development',betaScale:model.Rc,
        backSpineScale:model.Rc+model.R,phiScale:model.R,angleUnits:'rad',hostType:'elbow'}},
    main:{hostType:'elbow',outerRadius:model.R,innerRadius:model.Ri,length:model.Rc*model.bend,
      outerHole3D:holeOuter.map(q=>q.point),innerHole3D:holeInner.map(q=>q.point),holeToolRadius:tool},
    pad:null,axes:{branchOrigin:model.origin,branchDirection:model.d,stationZero:model.e0,station90:model.e90,
      hostTangent:model.frame.tangent,hostNormal:model.m}};
  const closure=Math.max(distance(outerCut[0],outerCut.at(-1)),distance(innerCut[0],innerCut.at(-1)));
  const chord=sampledMaxChordError*GUARD;
  const reference=elbowAlignmentReference(p);
  if(reference)geometry.axes.reference=reference;
  const verification=[{id:'equations',label:'理想環面方程距離殘差',value:rootResidual,unit:'mm',tolerance:p.tolerance,status:rootResidual<=p.tolerance?'pass':'fail'},
    {id:'roundtrip',label:'環面角度參數回算誤差（非等距展開）',value:roundTripError,unit:'mm',tolerance:p.tolerance,status:roundTripError<=p.tolerance?'pass':'fail'},
    {id:'closure',label:'近側交線閉合誤差',value:closure,unit:'mm',tolerance:p.tolerance,status:closure<=p.tolerance?'pass':'fail'},
    {id:'chord',label:'採樣弦差（含數值餘量）',value:chord,unit:'mm',tolerance:p.tolerance,status:chord<=p.tolerance?'pass':'warning'},
    {id:'wall-collision',label:model.normalExtrados?'外背法線管身解析排除干涉／伸入探查':'有限管身壁厚探查',
      value:wallChecks,unit:'samples',tolerance:0,status:'pass',basis:model.normalExtrados?'analytic-extrados-radial-monotonicity':'finite-probes'}];
  if(reference){const v=sub(model.origin,reference.center),along=dot(v,reference.direction),axisDistance=norm(sub(v,mul(reference.direction,along))),axisAngle=Math.atan2(norm(cross(model.d,reference.direction)),dot(model.d,reference.direction))*180/Math.PI;
    verification.push({id:'axis-distance',label:`支管與 ${reference.end} 端中心線同軸距離`,value:axisDistance,unit:'mm',tolerance:p.tolerance,status:axisDistance<=p.tolerance?'pass':'fail'},{id:'axis-direction',label:`支管與 ${reference.end} 端延伸方向偏差`,value:axisAngle,unit:'°',tolerance:1e-7,status:axisAngle<=1e-7?'pass':'fail'});
  }
  warnings.push(model.normalExtrados?
    '彎頭採理想環面；外背法線管身以單調距離排除再入壁，伸入餘裕仍用有限壁厚站探查；現場成形偏差與全壁厚粗切包絡未納入。':
    '彎頭採理想環面；現場成形偏差與全壁厚干涉僅有限採樣檢查，未構成嚴格全域包絡證明。');
  if(p.offset||p.azimuth||p.jointPosition!==DEFAULT_ELBOW_PARAMS.jointPosition)warnings.push('彎頭使用彎曲位置／截面方位／支管旋向；直管偏心、方位與 J 參數未套用。');
  const measurements={mainCircumference:TAU*model.R,branchCircumference:C,branchMinLength:p.branchLength,
    branchMaxLength:maximumDepth,branchAxisEnd:endT,branchOuterCutLength:perimeter(outerCut),branchInnerCutLength:perimeter(innerCut),
    mainHoleToolDiameter:opening?2*tool:null,mainHoleAxialLength:null,mainHoleArcWidth:null,padMinimumMargin:null,padNetArea:0,padNeutralRadius:null,
    projectionAvailable:minimumProjectionClearance<Infinity?minimumProjectionClearance:null,
    projectedLength:model.projection,normalDotDirection:model.normalDotDirection,minIntersectionNormalDot:minNormalDot,
    elbowCenterlineLength:model.Rc*model.bend,elbowBackSpineLength:(model.Rc+model.R)*model.bend};
  const result={valid:true,params:p,errors:[],warnings,templates:[template],geometry,verification,measurements,stationTable,
    sampling:{sampledMaxChordError,guardFactor:GUARD},
    wallEnvelope:{method:model.normalExtrados&&p.jointType==='on'?'analytic-extrados-outward-retained-body-clearance':
      'radial-wall-stations-interior-angular-probes-and-polished-insertion-limits',radii:wallRadii,
      angularSamples:model.normalExtrados&&p.jointType==='on'?0:wallAngularSamples,checks:wallChecks,
      retainedBodyMethod:model.normalExtrados?'analytic-extrados-radial-monotonicity':'finite-probes',
      rigorous:false,roughCutSupported:false},capabilities:{motherOpening:opening,roughCut:false,pad:false,wholeHostDevelopment:false}};
  if(p.padEnabled){
    const formed=computeFormedElbowPad(result,p);
    if(!formed.valid){errors.push(...formed.errors);return fail();}
    for(const field of ['padThickness','padMargin','padClearance','padShape','padSplit'])p[field]=formed.params[field];
    result.geometry.pad=formed.pad;
    result.formedPad={stationTable:formed.stationTable,edgeStationTable:formed.edgeStationTable,
      capabilities:formed.capabilities,validation:formed.validation};
    result.capabilities.pad=true;result.capabilities.padFlatDevelopment=false;
    result.verification.push(...formed.verification);result.warnings.push(...formed.warnings);
    Object.assign(result.measurements,formed.measurements);
  }
  return result;
}

export function computeElbowJoint(raw={}) {
  const requestedSamples=Number(raw.samples??DEFAULT_ELBOW_PARAMS.samples);
  let result=build(raw),n=result.params.samples,error=result.verification.find(v=>v.id==='chord')?.value??null;
  while(result.valid&&result.params.autoPrecision&&error>result.params.tolerance&&n<ELBOW_SAMPLE_CAP) {
    n=Math.min(ELBOW_SAMPLE_CAP,Math.max(n+4,Math.ceil(n*Math.max(1.35,Math.sqrt(error/result.params.tolerance)*1.12)/4)*4));
    result=build({...raw,samples:n});error=result.verification.find(v=>v.id==='chord')?.value??null;
  }
  const met=result.valid&&error!==null&&error<=result.params.tolerance;
  const precision={requestedSamples,effectiveSamples:result.params.samples,cap:ELBOW_SAMPLE_CAP,auto:result.params.autoPrecision,
    metTolerance:met,maxChordError:error,tolerance:result.params.tolerance,
    sampledMaxChordError:result.sampling?.sampledMaxChordError??null,guardFactor:GUARD,
    method:'sampled-interior-eighth-points-with-numerical-margin'};
  if(result.valid&&result.params.autoPrecision&&!met)return {...result,valid:false,geometry:null,templates:[],stationTable:[],
    errors:[{field:'tolerance',message:'已達 4096 段上限仍未符合採樣弦差容差；已停止製作輸出。'}],precision,manufacturingReady:false};
  return {...result,precision,manufacturingReady:result.valid&&met&&result.verification.every(v=>v.status!=='fail')};
}

export function computeExactElbowStationTable(input,segments=12) {
  if(!Number.isInteger(segments)||segments<1||segments>ELBOW_SAMPLE_CAP)throw new RangeError('分點區段须为 1 至 4096 的整數。');
  const joint=input?.params&&typeof input.valid==='boolean'?input:computeElbowJoint({...input,samples:72,autoPrecision:false,padEnabled:false});
  if(!joint.valid||!joint.geometry)throw new RangeError('無效彎頭接頭無法產生分點表。');
  const model=createModel(joint.params),endT=joint.geometry.branch.axisEnd,C=TAU*model.ro;
  return Array.from({length:segments+1},(_,i)=>{
    const theta=i===segments?0:TAU*i/segments,outer=model.cut(model.ro,theta),inner=model.cut(model.ri,theta);
    return {hostType:'elbow',station:i,angle:360*i/segments,circumference:C*i/segments,
      outerDepth:endT-outer.t,innerDepth:endT-inner.t,outerPoint:outer.point,innerPoint:inner.point};
  });
}

/** Exact OUTSIDE-surface mother-hole stations. Distances describe locating
 * points on the formed elbow, not a flat pattern of its doubly curved wall.
 * count is the number of intervals; the final row closes the first point.
 */
export function computeExactElbowHoleTable(input,count=24) {
  if(!Number.isInteger(count)||count<1||count>ELBOW_SAMPLE_CAP)throw new RangeError('母孔分點區段须为 1 至 4096 的整數。');
  const joint=input?.params&&typeof input.valid==='boolean'?input:computeElbowJoint({...input,samples:72,autoPrecision:false,padEnabled:false});
  if(!joint.valid||!joint.geometry)throw new RangeError('無效彎頭接頭無法產生母孔分點表。');
  if(joint.params.motherOpening===false)throw new RangeError('母管保持封閉，沒有開孔分點；請使用貼合定位表。');
  const model=createModel(joint.params),tool=(joint.params.jointType==='on'?model.ri:model.ro)+joint.params.holeGap;
  const rowCoordinates=(root,radius)=>{
    const phiRad=wrap(root.phi),betaRad=root.beta;
    return {point:root.point,betaDegrees:betaRad*180/Math.PI,betaRad,
      phiDegrees:phiRad*180/Math.PI,phiRad,
      rearDistance:(model.Rc+radius)*betaRad,bellyDistance:(model.Rc-radius)*betaRad,
      circumference:radius*phiRad};
  };
  return Array.from({length:count+1},(_,i)=>{
    const theta=i===count?0:TAU*i/count,
      outer=model.near(tool,model.R,theta),inner=model.near(tool,model.Ri,theta);
    return {station:i,angle:360*i/count,...rowCoordinates(outer,model.R),
      innerPoint:inner.point,inner:rowCoordinates(inner,model.Ri)};
  });
}


/** Marking footprint for a closed mother, or actual outer-hole stations. */
export function computeExactElbowLocatorTable(input,count=24){
  const joint=input?.params&&typeof input.valid==='boolean'?input:computeElbowJoint(input);
  if(joint.params.motherOpening!==false)return computeExactElbowHoleTable(joint,count);
  if(!Number.isInteger(count)||count<1||count>ELBOW_SAMPLE_CAP)throw new RangeError('貼合分點區段須為 1 至 4096 的整數。');
  if(!joint.valid||!joint.geometry)throw new RangeError('無效彎頭接頭無法產生貼合分點表。');
  const model=createModel(joint.params),coordinates=root=>{const phiRad=wrap(root.phi),betaRad=root.beta;return {point:root.point,betaRad,betaDegrees:betaRad*180/Math.PI,phiRad,phiDegrees:phiRad*180/Math.PI,rearDistance:(model.Rc+model.R)*betaRad,bellyDistance:(model.Rc-model.R)*betaRad,circumference:model.R*phiRad};};
  return Array.from({length:count+1},(_,i)=>{const theta=i===count?0:TAU*i/count,outer=model.near(model.ro,model.R,theta),inner=model.near(model.ri,model.R,theta);return {station:i,angle:360*i/count,basis:'attachment-outer-footprint-not-cut',...coordinates(outer),innerPoint:inner.point,inner:coordinates(inner)};});
}
