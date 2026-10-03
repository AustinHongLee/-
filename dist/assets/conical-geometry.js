/** Finite concentric conical mother + straight circular branch (mm/degrees).
 * X is the mother axis. mainOD is the A-end OD, mainEndOD the B-end OD.
 * mainWall is true normal thickness: the inner radius at a fixed X is
 * R(X) - mainWall * hypot(1,k). No fabricated fitting profile is assumed.
 */
export const DEFAULT_CONICAL_PARAMS=Object.freeze({hostType:'cone',mainOD:323.9,mainEndOD:219.1,mainWall:6,mainLength:350,jointPosition:175,
  branchOD:60.3,branchWall:3.91,branchLength:200,angle:90,surfaceClock:0,branchSwivel:0,jointType:'on',motherOpening:true,
  projection:0,rootGap:0,holeGap:.5,padEnabled:false,tolerance:.1,samples:360,autoPrecision:true});
export const CONICAL_SAMPLE_CAP=4096;
const TAU=2*Math.PI,EPS=1e-8,GUARD=1.1,FRACTIONS=Array.from({length:7},(_,i)=>(i+1)/8);
const rad=d=>d*Math.PI/180,dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,k)=>a.map(v=>v*k),norm=v=>Math.hypot(...v),unit=v=>mul(v,1/norm(v)),distance=(a,b)=>norm(sub(a,b)),lerp=(a,b,t)=>add(a,mul(sub(b,a),t));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],close=p=>[...p,[...p[0]]],wrap=a=>((a%TAU)+TAU)%TAU;
const unwrap=(a,center)=>center+Math.atan2(Math.sin(a-center),Math.cos(a-center));
const shape=p=>{const R0=p.mainOD/2,R1=p.mainEndOD/2,k=(R1-R0)/p.mainLength,s=Math.hypot(1,k);return {R0,R1,k,s};};

export function conicalSurfacePoint(x,phi,params,normalOffset=0){const {R0,k,s}=shape(params),r=R0+k*x+normalOffset*s;return [x,r*Math.sin(phi),r*Math.cos(phi)];}
export function conicalCoordinates(point,params,normalOffset=0){const {R0,k,s}=shape(params),r=Math.hypot(point[1],point[2]);return {x:point[0],phi:Math.atan2(point[1],point[2]),radius:r,normal:[-k/s,point[1]/r/s,point[2]/r/s],normalResidual:(r-R0-k*point[0])/s-normalOffset};}
/** Isometric development of ONE surface; not a neutral-layer metal blank. */
export function conicalDevelopmentPoint(point,params,normalOffset=0,seamAngle=rad(params.surfaceClock??0)-Math.PI){
  const {R0,k,s}=shape(params),phi=unwrap(Math.atan2(point[1],point[2]),seamAngle+Math.PI),rho=(R0+k*point[0]+normalOffset*s)*s/Math.abs(k),a=(phi-seamAngle)*Math.abs(k)/s;
  return [rho*Math.cos(a),rho*Math.sin(a)];
}
export function conicalDevelopmentToWorld(point,params,normalOffset=0,seamAngle=rad(params.surfaceClock??0)-Math.PI){
  const {R0,k,s}=shape(params),rho=norm(point),a=wrap(Math.atan2(point[1],point[0])),x=(rho*Math.abs(k)/s-R0-normalOffset*s)/k,phi=seamAngle+a*s/Math.abs(k);
  return conicalSurfacePoint(x,phi,params,normalOffset);
}

/** Stable analytic quadratic roots. The cone's unwanted negative-radius
 * sheet is removed before roots are returned. Finite X filtering stays at
 * the caller: a remote root must never replace an out-of-bounds near root. */
export function conicalLineIntersections(foot,direction,params,normalOffset=0){
  const {R0,k,s}=shape(params),q=R0+k*foot[0]+normalOffset*s,h=k*direction[0],a=direction[1]**2+direction[2]**2-h*h,b=2*(foot[1]*direction[1]+foot[2]*direction[2]-q*h),c=foot[1]**2+foot[2]**2-q*q;
  const scale=Math.max(1,Math.abs(a),Math.abs(b),Math.abs(c)),roots=[];
  if(Math.abs(a)<1e-14){if(Math.abs(b)>1e-14)roots.push(-c/b);}else{
    const disc=b*b-4*a*c,discTolerance=1e-13*Math.max(1,b*b,Math.abs(4*a*c));
    if(disc>=-discTolerance){const h=Math.sqrt(Math.max(0,disc)),q0=-.5*(b+(b>=0?h:-h));if(Math.abs(q0)>1e-14)roots.push(q0/a,c/q0);else roots.push(-b/(2*a));}
  }
  return roots.filter((t,i,a)=>Number.isFinite(t)&&a.findIndex(v=>Math.abs(v-t)<1e-7)===i).map(t=>{const point=add(foot,mul(direction,t)),info=conicalCoordinates(point,params,normalOffset);return {t,point,...info,normalDotDirection:dot(info.normal,direction),residual:info.normalResidual};})
    .filter(q=>R0+k*q.point[0]+normalOffset*s>0&&Math.abs(q.residual)<1e-6).sort((a,b)=>a.t-b.t);
}

function validate(raw){const p={...DEFAULT_CONICAL_PARAMS,...raw},errors=[],error=(field,message)=>errors.push({field,message});
  for(const f of ['mainOD','mainEndOD','mainWall','mainLength','jointPosition','branchOD','branchWall','branchLength','angle','surfaceClock','branchSwivel','projection','rootGap','holeGap','tolerance','samples']){p[f]=Number(p[f]);if(!Number.isFinite(p[f]))error(f,'請輸入有限數值。');}
  for(const f of ['mainOD','mainEndOD','mainWall','mainLength','branchOD','branchWall','branchLength','tolerance'])if(p[f]<=0)error(f,'尺寸必須大於 0。');
  if(Math.abs(p.mainOD-p.mainEndOD)<1e-6)error('mainEndOD','相同端徑請使用直管；此模式需要非退化錐台。');
  const {R0,R1,k,s}=shape(p);if(Math.abs(k)<1e-4)error('mainEndOD','錐度過小，請改用直管模式；扇環展開在此範圍數值不穩定。');
  if(Math.min(R0,R1)<=p.mainWall*s)error('mainWall','法向壁厚造成小端內徑為零或負值。');
  if(p.branchWall*2>=p.branchOD)error('branchWall','支管壁厚須小於外徑的一半。');
  if(p.jointPosition<=0||p.jointPosition>=p.mainLength)error('jointPosition','支管中心須位於 A、B 兩端之間。');
  if(p.angle<5||p.angle>175)error('angle','支管與當地母線夾角須為 5° 至 175°。');
  for(const f of ['projection','rootGap','holeGap'])if(p[f]<0)error(f,'间隙與伸入量不可小於 0。');
  if(!['on','in'].includes(p.jointType))error('jointType','接頭型式須為 on 或 in。');
  if(typeof p.motherOpening!=='boolean')error('motherOpening','母管開孔設定須為布林值。');
  if(!p.motherOpening&&(p.jointType!=='on'||p.projection!==0))error('jointType','母管封閉只支援外焊貼合，內插須開孔。');
  if(typeof p.autoPrecision!=='boolean')error('autoPrecision','自動精度設定須為布林值。');
  if(!Number.isInteger(p.samples)||p.samples<36||p.samples>CONICAL_SAMPLE_CAP)error('samples','取樣段數須為 36 至 4096 的整數。');
  if(p.padEnabled)error('padEnabled','此版錐管補強板尚未支援；請關閉補強板。');
  p.surfaceClock=wrap(rad(p.surfaceClock))*180/Math.PI;p.branchSwivel=unwrap(rad(p.branchSwivel),0)*180/Math.PI;p.hostType='cone';return {p,errors};
}

function createModel(p){const {R0,R1,k,s}=shape(p),phi=rad(p.surfaceClock),a=rad(p.angle),psi=rad(p.branchSwivel),ro=p.branchOD/2,ri=ro-p.branchWall;
  const G=[1/s,k*Math.sin(phi)/s,k*Math.cos(phi)/s],N=[-k/s,Math.sin(phi)/s,Math.cos(phi)/s],K=[0,Math.cos(phi),-Math.sin(phi)],origin=conicalSurfacePoint(p.jointPosition,phi,p),d=unit(add(mul(G,Math.cos(a)),mul(add(mul(N,Math.cos(psi)),mul(K,Math.sin(psi))),Math.sin(a))));
  const e0=unit(sub(mul(G,-1),mul(d,dot(mul(G,-1),d)))),e90=unit(cross(e0,d)),normalDotDirection=dot(N,d),cache=new Map();
  const finite=point=>point[0]>=-1e-7&&point[0]<=p.mainLength+1e-7,foot=(r,t)=>add(origin,mul(add(mul(e0,Math.cos(t)),mul(e90,Math.sin(t))),r));
  const roots=(f,offset)=>conicalLineIntersections(f,d,p,offset),near=(r,offset,theta)=>{theta=wrap(theta);const key=`${r}/${offset}/${theta.toFixed(13)}`;if(cache.has(key))return cache.get(key);const f=foot(r,theta),candidates=roots(f,offset).filter(q=>q.normalDotDirection>1e-7),expected=offset/normalDotDirection;candidates.sort((a,b)=>Math.abs(a.t-expected)-Math.abs(b.t-expected));
    if(!candidates.length)throw new Error('支管切口相切、開放或無穩定近側交線。');const q=candidates[0];if(!finite(q.point))throw new Error('支管切口或母材開孔跨出大小頭端面。');const result={...q,foot:f,theta,radius:r,offset,uv:conicalDevelopmentPoint(q.point,p,offset)};cache.set(key,result);return result;};
  const cutOffset=p.jointType==='in'?-p.mainWall:p.rootGap,projection=p.jointType==='in'?p.projection:0,cut=(r,t)=>{const q=near(r,cutOffset,t),at=q.t-projection,point=add(q.foot,mul(d,at));if(!finite(point))throw new Error('內插伸入後切口越過大小頭端面。');return {...q,t:at,point,unprojectedT:q.t,unprojectedPoint:q.point};};
  const caps=f=>Math.abs(d[0])<1e-12?[]:[0,p.mainLength].map((x,i)=>{const t=(x-f[0])/d[0],point=add(f,mul(d,t));return {t,point,name:i?'B':'A',radius:Math.hypot(point[1],point[2])};});
  const occupied=point=>{if(!finite(point))return false;const r=Math.hypot(point[1],point[2]),R=R0+k*point[0];return r>=R-p.mainWall*s-1e-7&&r<=R+1e-7;};
  return {R0,R1,k,s,phi,G,N,K,origin,d,e0,e90,ro,ri,normalDotDirection,finite,foot,roots,near,cut,caps,occupied,cutOffset,projection};
}

function extrema(fn,values,max){const n=values.length-1,out=[...values];for(let i=0;i<n;i++){const v=values[i],b=values[(i+n-1)%n],a=values[(i+1)%n];if((max?v>=b&&v>=a:v<=b&&v<=a)&&!(v===a&&v===b)){let lo=TAU*(i-1)/n,hi=TAU*(i+1)/n,q=(Math.sqrt(5)-1)/2,x=hi-q*(hi-lo),y=lo+q*(hi-lo),fx=fn(x),fy=fn(y);for(let j=0;j<35;j++){if(max?fx>fy:fx<fy){hi=y;y=x;fy=fx;x=hi-q*(hi-lo);fx=fn(x);}else{lo=x;x=y;fx=fy;y=lo+q*(hi-lo);fy=fn(y);}}out.push(fn((lo+hi)/2));}}return max?Math.max(...out):Math.min(...out);}
const perimeter=p=>p.slice(1).reduce((s,v,i)=>s+distance(v,p[i]),0);
function translatedTemplate(id,title,basis,outer,holes,references,notes,mapping){const xs=outer.map(p=>p[0]),ys=outer.map(p=>p[1]),origin=[Math.min(...xs),Math.min(...ys)],move=p=>sub(p,origin);return {id,title,basis,outer:outer.map(move),holes:holes.map(h=>h.map(move)),references:references.map(r=>({...r,points:r.points.map(move)})),notes,width:Math.max(...xs)-origin[0],height:Math.max(...ys)-origin[1],outerRole:'paper-boundary',mapping:{...mapping,origin}};}

function build(raw){const {p,errors}=validate(raw),warnings=[],fail=(field,message)=>({valid:false,params:p,errors:[...errors,...(message?[{field,message}]:[])],warnings,geometry:null,templates:[],verification:[],measurements:{},stationTable:[],manufacturingReady:false});if(errors.length)return fail();
  const m=createModel(p),n=p.samples;if(m.normalDotDirection<=1e-5)return fail('branchSwivel','支管方向須朝向外法線；目前近於相切或朝內。');
  const opening=p.motherOpening,tool=opening?(p.jointType==='in'?m.ro:m.ri)+p.holeGap:null,radii=[m.ri,(3*m.ri+m.ro)/4,(m.ri+m.ro)/2,(m.ri+3*m.ro)/4,m.ro],angular=Math.min(CONICAL_SAMPLE_CAP,n*8);
  const ring=(r,offset,cut=false)=>{const q=Array.from({length:n},(_,i)=>cut?m.cut(r,TAU*i/n):m.near(r,offset,TAU*i/n));q.push({...q[0],point:[...q[0].point]});return q;};
  let outer,inner,holeOuter=[],holeInner=[],contactOuter=[],contactInner=[],endT,maxDepth,chord=0,residual=0,roundTrip=0,minDot=1,available=Infinity,wallChecks=0;
  try{outer=ring(m.ro,m.cutOffset,true);inner=ring(m.ri,m.cutOffset,true);if(opening){holeOuter=ring(tool,0);holeInner=ring(tool,-p.mainWall);}else{contactOuter=ring(m.ro,0);contactInner=ring(m.ri,0);}
    endT=Math.max(extrema(t=>m.cut(m.ro,t).t,outer.map(q=>q.t),true),extrema(t=>m.cut(m.ri,t).t,inner.map(q=>q.t),true))+p.branchLength;
    maxDepth=endT-extrema(t=>m.cut(m.ro,t).t,outer.map(q=>q.t),false);
    const series=[[m.ro,m.cutOffset,true,outer],[m.ri,m.cutOffset,true,inner],...(opening?[[tool,0,false,holeOuter],[tool,-p.mainWall,false,holeInner]]:[[m.ro,0,false,contactOuter],[m.ri,0,false,contactInner]])];
    for(const [r,offset,isCut,points] of series){const exact=t=>isCut?m.cut(r,t):m.near(r,offset,t);extrema(t=>exact(t).point[0],points.map(q=>q.point[0]),false);extrema(t=>exact(t).point[0],points.map(q=>q.point[0]),true);
      for(let i=0;i<n;i++){const a=points[i],b=points[i+1];residual=Math.max(residual,Math.abs(a.residual));minDot=Math.min(minDot,a.normalDotDirection);roundTrip=Math.max(roundTrip,distance(conicalDevelopmentToWorld(a.uv,p,offset),isCut?a.unprojectedPoint:a.point));
        for(const f of FRACTIONS){const q=exact(TAU*(i+f)/n);chord=Math.max(chord,distance(q.point,lerp(a.point,b.point,f)),distance(q.uv,lerp(a.uv,b.uv,f)));if(isCut)chord=Math.max(chord,Math.abs(q.t-lerp([a.t],[b.t],f)[0]));}}
    }
    const wallCheck=(r,theta)=>{const f=m.foot(r,theta),cut=m.cut(r,theta),nearOuter=m.near(r,0,theta),nearInner=p.jointType==='in'?m.near(r,-p.mainWall,theta):null;
      // A finite single-nappe cone solid is convex. A positive outward normal
      // dot product places the retained ray beyond its supporting plane.
      // Thus set-on rays cannot re-enter any side or end annulus.
      if(p.jointType==='on'){wallChecks++;return Infinity;}
      const stops=m.roots(f,-p.mainWall).filter(q=>q.t<nearInner.t-1e-7&&m.finite(q.point)).map(q=>q.t),caps=m.caps(f);
      stops.push(...caps.filter(q=>q.t<nearInner.t-1e-7&&q.radius<=m.R0+m.k*q.point[0]-p.mainWall*m.s+1e-7).map(q=>q.t));
      const limit=stops.length?nearInner.t-Math.max(...stops):Infinity;available=Math.min(available,limit);if(p.projection>=limit-1e-7)throw new Error('內插伸入量到達另一側內壁或大小頭開口端面。');
      const ts=[cut.t,endT,...m.roots(f,0).filter(q=>m.finite(q.point)).map(q=>q.t),...m.roots(f,-p.mainWall).filter(q=>m.finite(q.point)).map(q=>q.t),...caps.map(q=>q.t)].filter(t=>t>=cut.t-EPS&&t<=endT+EPS).sort((a,b)=>a-b);
      for(let i=0;i<ts.length-1;i++){const t=(ts[i]+ts[i+1])/2;if(ts[i+1]-ts[i]>1e-7&&m.occupied(add(f,mul(m.d,t)))&&!(t>=nearInner.t-1e-7&&t<=nearOuter.t+1e-7))throw new Error('保留支管與大小頭另一側或端面材料干涉。');}
      wallChecks++;return limit;};
    for(const r of radii){const values=Array.from({length:angular},(_,i)=>wallCheck(r,TAU*i/angular));if(p.jointType==='in')extrema(t=>wallCheck(r,t),[...values,values[0]],false);}
  }catch(e){return fail('conicalGeometry',e.message);}
  const C=TAU*m.ro,branchCurve=outer.map((q,i)=>[C*i/n,endT-q.t]),innerCurve=inner.map((q,i)=>[C*i/n,endT-q.t]),branchOutline=close([[0,0],[C,0],...[...branchCurve].reverse()]);
  const branch={id:'branch',title:'大小頭母材／直支管 fishmouth 樣板',basis:'直支管實際外徑包覆',outer:branchOutline,holes:[],references:[{points:innerCurve,type:'inner-edge',label:'內緣對應角度參考（非內徑展開）'},{points:[[0,0],[0,endT-outer[0].t]],type:'seam',label:'0° 起縫基準'}],width:C,height:maxDepth,
    notes:['錐管採兩端外徑間的理想直線錐面；壁厚為真實法向厚度。','0° 為 −當地母線在支管橫截面的投影；站角沿既定 station90 方向增加。','未包含坡口、刀縫、焊接收縮、實物轉接圓弧或橢圓度。',...(opening?[]:['外焊支撐：母材保持封閉，貼合輪廓禁止當開孔切線。'])],mapping:{coordinateSystem:'branch-outer-wrap',circumference:C,axisEnd:endT,origin:[0,0],hostType:'cone'}};
  const sectorAngle=TAU*Math.abs(m.k)/m.s,rho0=m.R0*m.s/Math.abs(m.k),rho1=m.R1*m.s/Math.abs(m.k),rhoMin=Math.min(rho0,rho1),rhoMax=Math.max(rho0,rho1),seam=m.phi-Math.PI;
  const developedBoundary=close([...Array.from({length:n+1},(_,i)=>[rhoMax*Math.cos(sectorAngle*i/n),rhoMax*Math.sin(sectorAngle*i/n)]),...Array.from({length:n+1},(_,i)=>[rhoMin*Math.cos(sectorAngle*(n-i)/n),rhoMin*Math.sin(sectorAngle*(n-i)/n)])]);
  const actualOuter=opening?holeOuter:contactOuter,actualInner=opening?holeInner:contactInner,outerUV=actualOuter.map(q=>q.uv),innerOnOuter=actualInner.map(q=>conicalDevelopmentPoint(conicalSurfacePoint(q.point[0],q.phi,p),p));
  const references=[{points:[[rho0,0],[rho1,0]],type:'seam',label:'A → B 起縫基準'},{points:innerOnOuter,type:'inner-edge',label:opening?'內壁孔口投影參考（非切線）':'支管內緣貼合參考（禁止開孔）'}];if(!opening)references.push({points:outerUV,type:'datum',label:'支管外緣貼合定位（禁止開孔）',closed:true});
  const mapping={coordinateSystem:'conical-outer-isometric-development',hostType:'cone',motherOpening:opening,seamAngle:seam,sectorAngle,slantRadii:[rho0,rho1],k:m.k,s:m.s,normalOffset:0};
  const mother=translatedTemplate('main','大小頭外壁 1:1 包覆定位紙樣','已成形母材外表面等距展開',developedBoundary,opening?[outerUV]:[],references,
    ['扇環為理想大小頭外壁的等距包覆紙樣，不是鋼板中性層落料圖。','起縫設在支管對側；A、B 端位置沿錐面母線量測。',...(opening?['實線孔口是外壁開孔；內壁孔口只作參考。']:['母材保持封閉：只描貼合定位輪廓，禁止依輪廓開孔。'])],mapping);
  // Include smooth boundary sagitta in the numeric print precision gate.
  chord=Math.max(chord,rhoMax*(1-Math.cos(sectorAngle/(2*n))));
  const outerCut=outer.map(q=>q.point),innerCut=inner.map(q=>q.point),endRing=r=>close(Array.from({length:n},(_,i)=>add(m.foot(r,TAU*i/n),mul(m.d,endT))));
  const geometry={branch:{outerCut,innerCut,outerEnd:endRing(m.ro),innerEnd:endRing(m.ri),outerRadius:m.ro,innerRadius:m.ri,axisEnd:endT},
    conical:{length:p.mainLength,outerRadii:[m.R0,m.R1],innerRadii:[m.R0-p.mainWall*m.s,m.R1-p.mainWall*m.s],k:m.k,s:m.s,motherOpening:opening,
      outerHole3D:holeOuter.map(q=>q.point),innerHole3D:holeInner.map(q=>q.point),outerHoleUV:holeOuter.map(q=>q.uv),innerHoleUV:holeInner.map(q=>q.uv),outerContact3D:contactOuter.map(q=>q.point),innerContact3D:contactInner.map(q=>q.point),mapping},
    main:{hostType:'cone',length:p.mainLength,outerRadius:m.R0,innerRadius:m.R0-p.mainWall*m.s,outerRadii:[m.R0,m.R1],innerRadii:[m.R0-p.mainWall*m.s,m.R1-p.mainWall*m.s],outerHole3D:holeOuter.map(q=>q.point),innerHole3D:holeInner.map(q=>q.point),outerHoleUV:holeOuter.map(q=>q.uv),innerHoleUV:holeInner.map(q=>q.uv),holeToolRadius:tool},pad:null,
    axes:{branchOrigin:m.origin,branchDirection:m.d,stationZero:m.e0,station90:m.e90,hostTangent:m.G,hostNormal:m.N}};
  const closure=Math.max(distance(outerCut[0],outerCut.at(-1)),distance(innerCut[0],innerCut.at(-1))),guarded=chord*GUARD,verification=[
    {id:'equations',label:'錐面法向方程距離殘差',value:residual,unit:'mm',tolerance:p.tolerance,status:residual<=p.tolerance?'pass':'fail'},
    {id:'roundtrip',label:'錐面等距展開回算誤差',value:roundTrip,unit:'mm',tolerance:p.tolerance,status:roundTrip<=p.tolerance?'pass':'fail'},
    {id:'closure',label:'近側交線閉合誤差',value:closure,unit:'mm',tolerance:p.tolerance,status:closure<=p.tolerance?'pass':'fail'},
    {id:'chord',label:'採樣弦差（含數值餘量）',value:guarded,unit:'mm',tolerance:p.tolerance,status:guarded<=p.tolerance?'pass':'warning'},
    {id:'wall-collision',label:p.jointType==='on'?'凸錐面外焊管身排除干涉／有限端探查':'有限壁厚與內插止點探查',value:wallChecks,unit:'samples',tolerance:0,status:'pass',basis:p.jointType==='on'?'convex-cone-outward-supporting-plane':'finite-probes'}];
  warnings.push('母材為理想同心直錐台，不適用實物大小頭的轉接圓弧、偏心大小頭或端部直段。','有限壁厚與端部以密集分點及局部極值補查，尚非全壁厚全域包絡證明。');
  const measurements={mainCircumference:TAU*(m.R0+m.k*p.jointPosition),branchCircumference:C,branchMinLength:p.branchLength,branchMaxLength:maxDepth,branchAxisEnd:endT,branchOuterCutLength:perimeter(outerCut),branchInnerCutLength:perimeter(innerCut),mainHoleToolDiameter:opening?tool*2:null,
    mainHoleAxialLength:opening?Math.max(...holeOuter.map(q=>q.x))-Math.min(...holeOuter.map(q=>q.x)):null,mainHoleArcWidth:null,padMinimumMargin:null,padNetArea:0,padNeutralRadius:null,projectionAvailable:Number.isFinite(available)?available:null,projectedLength:m.projection,normalDotDirection:m.normalDotDirection,minIntersectionNormalDot:minDot,conicalSlantLength:p.mainLength*m.s,conicalNormalWall:p.mainWall,conicalSectorAngle:sectorAngle*180/Math.PI};
  const stationTable=outer.map((q,i)=>({hostType:'cone',station:i,angle:360*i/n,circumference:C*i/n,outerDepth:endT-q.t,innerDepth:endT-inner[i].t,outerPoint:q.point,innerPoint:inner[i].point}));
  return {valid:true,params:p,errors:[],warnings,geometry,templates:[branch,mother],verification,measurements,stationTable,sampling:{sampledMaxChordError:chord,guardFactor:GUARD},wallEnvelope:{method:'convex-outward-body-and-finite-radial-angular-insertion-probes',radii,angularSamples:angular,checks:wallChecks,rigorous:false,roughCutSupported:false},capabilities:{motherOpening:opening,pad:false,roughCut:false,wholeHostDevelopment:true}};
}

export function computeConicalJoint(raw={}){const requestedSamples=Number(raw.samples??DEFAULT_CONICAL_PARAMS.samples);let r=build(raw),n=r.params.samples,error=r.verification.find(v=>v.id==='chord')?.value??null;
  while(r.valid&&r.params.autoPrecision&&error>r.params.tolerance&&n<CONICAL_SAMPLE_CAP){n=Math.min(CONICAL_SAMPLE_CAP,Math.max(n+4,Math.ceil(n*Math.max(1.35,Math.sqrt(error/r.params.tolerance)*1.12)/4)*4));r=build({...raw,samples:n});error=r.verification.find(v=>v.id==='chord')?.value??null;}
  const met=r.valid&&error!==null&&error<=r.params.tolerance,precision={requestedSamples,effectiveSamples:r.params.samples,cap:CONICAL_SAMPLE_CAP,auto:r.params.autoPrecision,metTolerance:met,maxChordError:error,tolerance:r.params.tolerance,sampledMaxChordError:r.sampling?.sampledMaxChordError??null,guardFactor:GUARD,method:'sampled-interior-eighth-points-with-numerical-margin'};
  if(r.valid&&r.params.autoPrecision&&!met)return {...r,valid:false,geometry:null,templates:[],stationTable:[],errors:[{field:'tolerance',message:'已達 4096 段上限仍未符合容差；停止製作輸出。'}],precision,manufacturingReady:false};return {...r,precision,manufacturingReady:r.valid&&met&&r.verification.every(v=>v.status!=='fail')};
}
export function computeExactConicalStationTable(input,count=12){if(!Number.isInteger(count)||count<1||count>CONICAL_SAMPLE_CAP)throw new RangeError('分點區段須為 1 至 4096 的整數。');const joint=input?.params&&typeof input.valid==='boolean'?input:computeConicalJoint(input);if(!joint.valid||!joint.geometry)throw new RangeError('無效大小頭無法產生分點表。');const m=createModel(joint.params),end=joint.geometry.branch.axisEnd,C=TAU*m.ro;return Array.from({length:count+1},(_,i)=>{const theta=i===count?0:TAU*i/count,o=m.cut(m.ro,theta),v=m.cut(m.ri,theta);return {hostType:'cone',station:i,angle:360*i/count,circumference:C*i/count,outerDepth:end-o.t,innerDepth:end-v.t,outerPoint:o.point,innerPoint:v.point};});}
export function computeExactConicalLocatorTable(input,count=24){if(!Number.isInteger(count)||count<1||count>CONICAL_SAMPLE_CAP)throw new RangeError('定位分點區段須為 1 至 4096 的整數。');const joint=input?.params&&typeof input.valid==='boolean'?input:computeConicalJoint(input);if(!joint.valid||!joint.geometry)throw new RangeError('無效大小頭無法產生定位表。');const p=joint.params,m=createModel(p),r=p.motherOpening?(p.jointType==='in'?m.ro:m.ri)+p.holeGap:m.ro;return Array.from({length:count+1},(_,i)=>{const theta=i===count?0:TAU*i/count,q=m.near(r,0,theta),phi=wrap(q.phi);return {station:i,angle:360*i/count,x:q.x,slantDistance:q.x*m.s,phiDegrees:phi*180/Math.PI,circumference:(m.R0+m.k*q.x)*phi,point:q.point,developed:q.uv,basis:p.motherOpening?'mother-outer-hole':'attachment-outer-footprint-not-cut'};});}
