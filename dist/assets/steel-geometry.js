import {createSteelSection,sectionPointAt,sectionContains,DEFAULT_STEEL_PARAMS} from './steel-sections.js';
import {rotateAroundMain} from './geometry.js';
import {elbowFrame,torusCoordinates,torusLineIntersections,torusSurfacePoint} from './elbow-geometry.js';
import {resolveElbowAlignment,elbowAlignmentReference} from './elbow-axis.js';
import {conicalSurfacePoint,conicalLineIntersections,conicalCoordinates,conicalDevelopmentPoint,conicalDevelopmentToWorld} from './conical-geometry.js';
import {edgeContactAngles} from './edge-sampling.js';

const TAU=2*Math.PI,EPS=1e-8,CAP=4096,GUARD=1.1,FRACTIONS=[.125,.25,.375,.5,.625,.75,.875];
const DEFAULTS={...DEFAULT_STEEL_PARAMS,hostType:'straight',mainOD:219.1,mainWall:6,mainLength:600,jointPosition:300,
  mainEndOD:168.3,branchOD:60.3,branchWall:3.91,branchLength:200,angle:90,azimuth:0,offset:0,
  bendRadius:304.8,bendAngle:90,bendPosition:45,surfaceClock:0,branchSwivel:0,elbowAlignment:'free',elbowOffset:0,elbowSideOffset:0,
  motherOpening:false,jointType:'on',projection:0,rootGap:0,holeGap:0,padEnabled:false,tolerance:.1,samples:360,autoPrecision:true};
const rad=d=>d*Math.PI/180,dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,k)=>a.map(v=>v*k),norm=v=>Math.hypot(...v),unit=v=>mul(v,1/norm(v)),distance=(a,b)=>norm(sub(a,b)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],lerp=(a,b,t)=>add(a,mul(sub(b,a),t));
const wrap=a=>{a%=TAU;return a<0?a+TAU:a;},unwrap=(a,c)=>c+Math.atan2(Math.sin(a-c),Math.cos(a-c));
const close=p=>[...p,[...p[0]]];
function problem(field,code,message){const error=new RangeError(message);error.field=field;error.code=code;return error;}

export function resolveSteelAlignment(params){return params.hostType==='elbow'?resolveElbowAlignment(params):{...params};}

function validate(raw) {
  const p=resolveSteelAlignment({...DEFAULTS,...raw}),errors=[];
  const error=(field,code,message)=>errors.push({field,code,message});
  for(const field of ['mainOD','mainWall','mainLength','jointPosition','mainEndOD','branchLength','angle','azimuth','offset','bendRadius','bendAngle','bendPosition','surfaceClock','branchSwivel','elbowOffset','elbowSideOffset','rootGap','projection','tolerance','samples']) {
    p[field]=Number(p[field]);if(!Number.isFinite(p[field]))error(field,'steel-section','請輸入有限數值。');
  }
  for(const field of ['mainOD','mainWall','mainLength','branchLength','tolerance'])if(p[field]<=0)error(field,'steel-section','尺寸須大於 0。');
  if(p.mainWall*2>=p.mainOD)error('mainWall','steel-section','母管壁厚須小於外半徑。');
  if(!['straight','elbow','cone'].includes(p.hostType))error('hostType','steel-section','請選直管、彎頭或同心大小管母材。');
  if(p.motherOpening!==false)error('motherOpening','closed-intent','鋼構支材為封閉母管外焊，請明確選「母管不開孔」。');
  if(p.jointType!=='on'||p.projection!==0)error('jointType','closed-intent','鋼構支材只支援外焊贴合；母管不開孔，不可內插或凸入。');
  if(p.padEnabled)error('padEnabled','unsupported-pad','鋼構支材的鞍座、肋板與套箍尚未建模；請關閉圓支管補強板後計算。');
  if(p.rootGap<0)error('rootGap','steel-section','母材外表面法向間隙不可小於 0。');
  if(!Number.isInteger(p.samples)||p.samples<36||p.samples>CAP)error('samples','steel-section','數值取樣須為 36 至 4096 整數。');
  if(typeof p.autoPrecision!=='boolean')error('autoPrecision','steel-section','自動精度設定須為布林值。');
  if(p.angle<=0||p.angle>=180)error('angle','steel-section','支材與母材當地軸／母線夾角須大於 0° 且小於 180°。');
  if(p.hostType==='elbow') {
    if(p.bendRadius<=p.mainOD/2+p.rootGap)error('bendRadius','steel-section','理想環面中心半徑须大於母管外半徑及間隙。');
    if(p.bendAngle<=0||p.bendAngle>180)error('bendAngle','steel-section','彎頭總角須大於 0° 且不超過 180°。');
    if(p.bendPosition<=0||p.bendPosition>=p.bendAngle)error('elbowAlignment','finite-end','支材軸線接點已越出有限彎頭兩端。');
  }else if(p.jointPosition<=0||p.jointPosition>=p.mainLength)error('jointPosition','finite-end','支材軸向位置须位於母材兩端之間。');
  if(p.hostType==='cone') {
    const k=(p.mainEndOD-p.mainOD)/(2*p.mainLength),s=Math.hypot(1,k);
    if(p.mainEndOD<=0||Math.abs(k)<1e-4)error('mainEndOD','steel-section','同心大小管須有正值且不同的兩端外徑；近直管請改直管母材。');
    if(Math.min(p.mainOD,p.mainEndOD)/2<=p.mainWall*s)error('mainWall','steel-section','法向壁厚使大小管小端內孔為零或負值。');
  }
  const section=createSteelSection(p);if(!section.valid)errors.push(...section.errors.map(e=>({...e,code:'steel-section'})));
  if(section.valid&&p.branchSection==='shs')p.sectionHeight=p.sectionWidth;
  return {p,section,errors};
}

function createHost(p,section) {
  const R=p.mainOD/2,Ri=R-p.mainWall,a=rad(p.angle),clock=rad(p.surfaceClock),swivel=rad(p.branchSwivel),bend=rad(p.bendAngle);
  let origin,T,N,K,d;
  if(p.hostType==='straight') {
    origin=rotateAroundMain([p.jointPosition,p.offset,0],p.azimuth);T=[1,0,0];N=rotateAroundMain([0,0,1],p.azimuth);K=rotateAroundMain([0,1,0],p.azimuth);
    d=rotateAroundMain([Math.cos(a),0,Math.sin(a)],p.azimuth);
  }else if(p.hostType==='elbow') {
    const frame=elbowFrame(rad(p.bendPosition),p.bendRadius);T=frame.tangent;N=add(mul(frame.normal,Math.cos(clock)),[0,0,Math.sin(clock)]);K=add(mul(frame.normal,-Math.sin(clock)),[0,0,Math.cos(clock)]);origin=add(frame.center,mul(N,R));
    d=unit(add(mul(T,Math.cos(a)),mul(add(mul(N,Math.cos(swivel)),mul(K,Math.sin(swivel))),Math.sin(a))));
  }else {
    const k=(p.mainEndOD-p.mainOD)/(2*p.mainLength),s=Math.hypot(1,k);T=[1/s,k*Math.sin(clock)/s,k*Math.cos(clock)/s];N=[-k/s,Math.sin(clock)/s,Math.cos(clock)/s];K=[0,Math.cos(clock),-Math.sin(clock)];origin=conicalSurfacePoint(p.jointPosition,clock,p);
    d=unit(add(mul(T,Math.cos(a)),mul(add(mul(N,Math.cos(swivel)),mul(K,Math.sin(swivel))),Math.sin(a))));
  }
  const e0=unit(sub(mul(T,-1),mul(d,dot(mul(T,-1),d)))),e90=unit(cross(e0,d)),rotation=rad(p.sectionRotation),u=add(mul(e0,Math.cos(rotation)),mul(e90,Math.sin(rotation))),v=add(mul(e0,-Math.sin(rotation)),mul(e90,Math.cos(rotation))),normalDot=dot(N,d),cache=new Map(),reference=p.hostType==='elbow'?elbowAlignmentReference(p):null;
  if(normalDot<=1e-5)throw problem('branchSwivel','steel-contact','支材方向近於相切或朝入母材，請把支材方向轉向外側。');
  const foot=q=>add(origin,add(mul(u,q[0]),mul(v,q[1])));
  const finite=point=>p.hostType==='elbow'?point[0]>=-1e-7&&dot([Math.cos(bend),Math.sin(bend),0],sub(point,[0,p.bendRadius,0]))<=1e-7:point[0]>=-1e-7&&point[0]<=p.mainLength+1e-7;
  const roots=(f,gap=0)=>{
    if(p.hostType==='elbow')return torusLineIntersections(f,d,p.bendRadius,R+gap);
    if(p.hostType==='cone')return conicalLineIntersections(f,d,p,gap);
    const A=d[1]**2+d[2]**2,B=2*(f[1]*d[1]+f[2]*d[2]),C=f[1]**2+f[2]**2-(R+gap)**2,disc=B*B-4*A*C;
    if(A<1e-14||disc<0)return [];
    return [(-B-Math.sqrt(disc))/(2*A),(-B+Math.sqrt(disc))/(2*A)].map(t=>{const point=add(f,mul(d,t)),normal=[0,point[1]/(R+gap),point[2]/(R+gap)];return {t,point,normal,normalDotDirection:dot(normal,d),residual:Math.hypot(point[1],point[2])-(R+gap)};});
  };
  const anchors=new Map();
  const near=(q,gap=p.rootGap,hint)=>{
    const key=`${q[0]}/${q[1]}/${gap}`;if(cache.has(key))return cache.get(key);
    const f=foot(q);let result;
    if(reference&&p.elbowAlignment.endsWith('-edge')) {
      // End-parallel structural outlines use their actual section support,
      // not a circular diameter. A line can have an isolated exit contact at
      // the selected port; its neighbourhood must still pass every face.
      const translated=sub(f,reference.center);let back=dot(translated,reference.normal),z=translated[2],h2=(R+gap-z)*(R+gap+z),h=Math.sqrt(Math.max(0,h2)),advance=h-back;
      if(p.branchSection==='chs'&&hint) {
        const D=R-p.branchOD/2,vectorLength=Math.hypot(p.elbowOffset,p.elbowSideOffset),wb=vectorLength?p.elbowOffset/vectorLength:1,ws=vectorLength?p.elbowSideOffset/vectorLength:0,w=add(mul(reference.normal,wb),[0,0,ws]),contact=wrap(Math.atan2(dot(w,v),dot(w,u))),theta=hint.angle;
        let delta=theta-contact;if(delta>Math.PI)delta-=TAU;else if(delta<-Math.PI)delta+=TAU;
        const sh=Math.sin(delta/2),sd=Math.sin(delta),across=add(mul(u,-Math.sin(contact)),mul(v,Math.cos(contact))),radius=hint.radius,projected=R-(p.branchOD/2-radius),back0=projected*wb,z0=projected*ws,
          db=radius*(-2*wb*sh*sh+dot(across,reference.normal)*sd),dz=radius*(-2*ws*sh*sh+across[2]*sd);
        back=back0+db;z=z0+dz;h2=(R+gap-z0-dz)*(R+gap+z0+dz);h=Math.sqrt(Math.max(0,h2));
        const difference=(gap+p.branchOD/2-radius)*(2*R+gap-p.branchOD/2+radius)+4*D*radius*sh*sh;
        advance=back>=0&&h+back>0?difference/(h+back):h-back;
      }
      const square=advance*(2*p.bendRadius+h+back),limit=2*(p.bendRadius+R+gap)*1e-10;
      if(h2<-limit||square<-limit)throw problem('elbowAlignment','steel-contact','支材材料母線超出母管可接合外壁；同側投影齊線不代表整個截面均能貼合。');
      const along=Math.sqrt(Math.max(0,square)),point=add(add(reference.center,mul(reference.normal,back)),add([0,0,z],mul(reference.direction,along))),info=torusCoordinates(point,p.bendRadius);
      const tangent=square<=0||h2<=0;if(tangent&&!(gap===0&&reference.offsetDistance>EPS&&Math.abs(along)<1e-5&&Math.abs(info.tubeDistance-R)<1e-6))throw problem('elbowAlignment','steel-contact','此截面相切輪廓未形成可製作的連續貼合。');
      result={t:dot(sub(point,f),d),point,normal:info.normal,normalDotDirection:dot(info.normal,d),residual:info.tubeDistance-(R+gap)};
    }else {
      if(!anchors.has(gap)) {
        const candidates=roots(origin,gap).filter(x=>x.normalDotDirection>1e-7);candidates.sort((a,b)=>Math.abs(a.t)-Math.abs(b.t));
        if(!candidates.length)throw problem(p.hostType==='elbow'?'elbowAlignment':'angle','steel-contact','此支材方向沒有穩定母材外壁基準交點。');anchors.set(gap,candidates[0]);
      }
      const candidates=roots(f,gap).filter(x=>x.normalDotDirection>1e-7),anchor=anchors.get(gap);candidates.sort((a,b)=>Math.abs(a.t-anchor.t)-Math.abs(b.t-anchor.t));
      if(!candidates.length)throw problem(p.hostType==='elbow'&&p.elbowAlignment!=='free'?'elbowAlignment':'branchSection','steel-contact','支材材料母線沒有穩定外壁交點；請縮小截面或調整接合位置及方向。');result=candidates[0];
    }
    if(!finite(result.point))throw problem(p.hostType==='elbow'?'elbowAlignment':'jointPosition','finite-end','鋼構切口跨出母材 A／B 端，完整貼合模式不能以端面截斷代替切口。');
    if(Math.abs(result.residual)>1e-6)throw problem('tolerance','steel-contact','支材外壁交點求解殘差超出數值限制。');
    const output={...result,sectionPoint:[...q],foot:f};cache.set(key,output);return output;
  };
  const occupied=point=>{
    if(!finite(point))return false;
    if(p.hostType==='elbow'){const r=torusCoordinates(point,p.bendRadius).tubeDistance;return r>=Ri-1e-7&&r<=R+1e-7;}
    if(p.hostType==='cone'){const r=conicalCoordinates(point,p).normalResidual;return r>=-p.mainWall-1e-7&&r<=1e-7;}
    const r=Math.hypot(point[1],point[2]);return r>=Ri-1e-7&&r<=R+1e-7;
  };
  const caps=f=>{
    const frames=p.hostType==='elbow'?[elbowFrame(0,p.bendRadius),elbowFrame(bend,p.bendRadius)]:[{center:[0,0,0],tangent:[1,0,0]},{center:[p.mainLength,0,0],tangent:[1,0,0]}];
    return frames.flatMap(frame=>{const den=dot(frame.tangent,d);if(Math.abs(den)<1e-12)return [];const t=dot(frame.tangent,sub(frame.center,f))/den;return [{t,point:add(f,mul(d,t))}];});
  };
  const checkRetained=(q,cut,endT)=>{
    if(cut.t>=endT-1e-7)throw problem('branchLength','body-interference','截面材料中的切口到達自由直端，請增加支材最短長度。');
    // Cylinder and positive finite cone are convex; outward exit rays cannot
    // re-enter them. The selected end-parallel torus outer exit is monotone.
    if(p.hostType!=='elbow'||reference&&p.elbowAlignment.endsWith('-edge'))return;
    const f=cut.foot,knots=[cut.t,endT,...roots(f,0).filter(q=>finite(q.point)).map(q=>q.t),...roots(f,-p.mainWall).filter(q=>finite(q.point)).map(q=>q.t),...caps(f).map(q=>q.t)]
      .filter(t=>t>=cut.t-EPS&&t<=endT+EPS).sort((a,b)=>a-b);
    for(let i=1;i<knots.length;i++)if(knots[i]-knots[i-1]>1e-7&&occupied(add(f,mul(d,(knots[i]+knots[i-1])/2))))throw problem('branchLength','body-interference','保留鋼構管身與彎頭另一段或端面材料干涉；請縮短支材或調整位置與方向。');
  };
  const coordinates=point=>{
    if(p.hostType==='elbow'){const q=torusCoordinates(point,p.bendRadius);return {betaDegrees:q.beta*180/Math.PI,phiDegrees:unwrap(q.phi,clock)*180/Math.PI,centerlineDistance:p.bendRadius*q.beta,backSpineDistance:(p.bendRadius+R)*q.beta,circumferentialDistance:R*unwrap(q.phi,clock)};}
    if(p.hostType==='cone'){const q=conicalCoordinates(point,p),k=(p.mainEndOD-p.mainOD)/(2*p.mainLength),phi=wrap(q.phi);return {x:q.x,slantDistance:q.x*Math.hypot(1,k),phiDegrees:phi*180/Math.PI,circumferentialDistance:q.radius*phi,developed:conicalDevelopmentPoint(point,p)};}
    const q=rotateAroundMain(point,-p.azimuth),phi=wrap(Math.atan2(point[1],point[2]));return {x:q[0],phiDegrees:phi*180/Math.PI,circumferentialDistance:R*phi,developed:[R*unwrap(Math.atan2(q[1],q[2]),0)+Math.PI*R,q[0]]};
  };
  return {R,Ri,origin,d,T,N,e0,e90,u,v,foot,near,checkRetained,coordinates,reference,finite};
}

function faceHint(face,s){return face.kind==='arc'?{radius:face.radius,angle:face.startAngle+face.sweep*s/face.length}:undefined;}
function faceGrid(face,p,host,section) {
  const perimeter=section.boundaries[0].segments.reduce((s,f)=>s+f.length,0),count=Math.max(3,Math.ceil(p.samples*face.length/perimeter));
  if(host.reference&&p.elbowAlignment.endsWith('-edge')) {
    const ref=host.reference,length=Math.hypot(p.elbowOffset,p.elbowSideOffset),back=length?p.elbowOffset/length:1,side=length?p.elbowSideOffset/length:0,
      contact=add(ref.center,mul(add(mul(ref.normal,back),[0,0,side]),host.R)),delta=sub(contact,host.origin),q=[dot(delta,host.u),dot(delta,host.v)];
    let parameter;
    if(face.kind==='arc'&&Math.abs(distance(q,face.center)-face.radius)<1e-5){parameter=wrap((Math.atan2(q[1]-face.center[1],q[0]-face.center[0])-face.startAngle)*Math.sign(face.sweep))/Math.abs(face.sweep);}
    else if(face.kind==='line') {
      const line=sub(face.end,face.start);parameter=dot(sub(q,face.start),line)/(face.length*face.length);
      if(distance(q,sectionPointAt(face,Math.max(0,Math.min(1,parameter))*face.length))>1e-5)parameter=undefined;
    }
    if(Number.isFinite(parameter)&&parameter>=-1e-10&&parameter<=1+1e-10) {
      const exact=Math.max(0,Math.min(1,parameter)),angles=edgeContactAngles(Math.min(CAP,Math.max(4,count)),exact*TAU);
      return angles.map(a=>face.length*a/TAU);
    }
  }
  return Array.from({length:count+1},(_,i)=>face.length*i/count);
}

function materialProbes(section) {
  const b=section.bounds,points=[],nx=48,ny=48;
  for(let iy=0;iy<=ny;iy++)for(let ix=0;ix<=nx;ix++){
    const q=[b.minX+(b.maxX-b.minX)*ix/nx,b.minY+(b.maxY-b.minY)*iy/ny];if(sectionContains(section,q))points.push(q);
  }
  // Thin webs/legs need thickness strips even when a coarse interior lattice
  // would miss them. Every accepted point is in actual material, never void.
  for(const face of section.faces)for(let i=0;i<=12;i++) {
    const s=face.length*i/12,q=sectionPointAt(face,s),tangent=face.kind==='line'?unit(sub(face.end,face.start)):
      mul([-Math.sin(face.startAngle+face.sweep*s/face.length),Math.cos(face.startAngle+face.sweep*s/face.length)],Math.sign(face.sweep));
    for(const fraction of [.25,.5,.75]){const inside=add(q,mul([-tangent[1],tangent[0]],section.minThickness*fraction));if(sectionContains(section,inside))points.push(inside);}
  }
  return points;
}

function build(raw) {
  const {p,section,errors}=validate(raw),warnings=[];
  const fail=error=>({valid:false,params:p,errors:[...errors,...(error?[{field:error.field??'branchSection',code:error.code??'steel-contact',message:error.message}]:[])],warnings,geometry:null,templates:[],verification:[],measurements:{},stationTable:[],manufacturingReady:false});
  if(errors.length)return fail();let host,faces,probes,cutMax=-Infinity,cutMin=Infinity,chord=0,residual=0,roundTrip=0,motherPaperChord=0,wallChecks=0;
  try {
    host=createHost(p,section);
    const checkedNear=(q,gap,hint,faceId)=>{try{return host.near(q,gap,hint);}catch(error){error.message=`${faceId?`材料面 ${faceId}`:'截面實材'}（u ${q[0].toFixed(2)}／v ${q[1].toFixed(2)} mm）：${error.message}`;throw error;}};
    const checkMotherCoordinates=point=>{
      const coordinates=host.coordinates(point);let back;
      if(p.hostType==='elbow')back=torusSurfacePoint(rad(coordinates.betaDegrees),rad(coordinates.phiDegrees),p.bendRadius,host.R);
      else if(p.hostType==='cone')back=conicalDevelopmentToWorld(coordinates.developed,p);
      else {const phi=(coordinates.developed[0]-Math.PI*host.R)/host.R;back=rotateAroundMain([coordinates.developed[1],host.R*Math.sin(phi),host.R*Math.cos(phi)],p.azimuth);}
      roundTrip=Math.max(roundTrip,distance(back,point));return coordinates.developed;
    };
    faces=section.faces.map(face=>{
      const grid=faceGrid(face,p,host,section),stations=grid.map(s=>{const q=sectionPointAt(face,s),hint=faceHint(face,s),cut=checkedNear(q,p.rootGap,hint,face.id),contact=checkedNear(q,0,hint,face.id),developed=checkMotherCoordinates(contact.point);cutMax=Math.max(cutMax,cut.t);cutMin=Math.min(cutMin,cut.t);residual=Math.max(residual,Math.abs(cut.residual),Math.abs(contact.residual));return {faceDistance:s,sectionPoint:q,cut,contact,developed};});
      for(let i=1;i<stations.length;i++)for(const fraction of FRACTIONS){const s=grid[i-1]+(grid[i]-grid[i-1])*fraction,q=sectionPointAt(face,s),cut=checkedNear(q,p.rootGap,faceHint(face,s),face.id),contact=checkedNear(q,0,faceHint(face,s),face.id);
        chord=Math.max(chord,distance(cut.point,lerp(stations[i-1].cut.point,stations[i].cut.point,fraction)),Math.abs(cut.t-(stations[i-1].cut.t+(stations[i].cut.t-stations[i-1].cut.t)*fraction)),distance(contact.point,lerp(stations[i-1].contact.point,stations[i].contact.point,fraction)));
        const developed=checkMotherCoordinates(contact.point);
        if(developed)motherPaperChord=Math.max(motherPaperChord,distance(developed,lerp(stations[i-1].developed,stations[i].developed,fraction)));
        cutMax=Math.max(cutMax,cut.t);cutMin=Math.min(cutMin,cut.t);residual=Math.max(residual,Math.abs(cut.residual));}
      return {...face,width:face.length,stations};
    });
    probes=materialProbes(section).map(q=>{const cut=checkedNear(q,p.rootGap);cutMax=Math.max(cutMax,cut.t);cutMin=Math.min(cutMin,cut.t);return {q,cut};});
    const endT=cutMax+p.branchLength;
    for(const probe of probes){host.checkRetained(probe.q,probe.cut,endT);wallChecks++;}
    for(const face of faces)for(const row of face.stations){host.checkRetained(row.sectionPoint,row.cut,endT);wallChecks++;}
    for(const face of faces) {
      face.cut3D=face.stations.map(row=>row.cut.point);face.contact3D=face.stations.map(row=>row.contact.point);face.end3D=face.stations.map(row=>add(host.foot(row.sectionPoint),mul(host.d,endT)));
      face.stations=face.stations.map((row,index)=>({faceId:face.id,index,faceDistance:row.faceDistance,depth:endT-row.cut.t,point:row.cut.point,contactPoint:row.contact.point,sectionPoint:row.sectionPoint,motherLocator:host.coordinates(row.contact.point)}));
    }
    const loops=section.boundaries.map(boundary=>{const selected=faces.filter(f=>f.boundaryId===boundary.id),concat=key=>[...selected.flatMap(f=>f[key].slice(0,-1)),[...selected[0][key][0]]];
      return {id:boundary.id,role:boundary.role,sectionPoints:[...selected.flatMap(f=>f.stations.slice(0,-1).map(q=>q.sectionPoint)),[...selected[0].stations[0].sectionPoint]],cut3D:concat('cut3D'),end3D:concat('end3D'),contact3D:concat('contact3D')};});
    const outside=loops.find(loop=>loop.role==='outer'),inside=loops.find(loop=>loop.role==='inner'),main={hostType:p.hostType,outerRadius:host.R,innerRadius:host.Ri,length:p.mainLength,seamRad:rad(p.azimuth)-Math.PI,motherOpening:false,
      outerHoleUV:[],innerHoleUV:[],outerHole3D:[],innerHole3D:[],holeToolRadius:null,outerContact3D:outside.contact3D,innerContact3D:inside?.contact3D??[],mapping:{coordinateSystem:'main-local-cylindrical',azimuth:p.azimuth,motherOpening:false}};
    const geometry={main,pad:null,branch:{outerCut:outside.cut3D,innerCut:inside?.cut3D??[],outerEnd:outside.end3D,innerEnd:inside?.end3D??[],axisEnd:endT},steel:{section,faces,loops,axisEnd:endT,reference:'outside-bounding-box-centre',motherOpening:false},
      axes:{branchOrigin:host.origin,branchDirection:host.d,stationZero:host.e0,station90:host.e90,sectionU:host.u,sectionV:host.v,hostTangent:host.T,hostNormal:host.N,...(host.reference?{reference:host.reference}:{})}};
    if(p.hostType==='elbow')geometry.elbow={bendRadius:p.bendRadius,bendAngle:rad(p.bendAngle),bendPosition:rad(p.bendPosition),surfaceClock:rad(p.surfaceClock),motherOpening:false,outerRadius:host.R,innerRadius:host.Ri,
      outerHoleUV:[],innerHoleUV:[],outerHole3D:[],innerHole3D:[],outerContact3D:outside.contact3D,innerContact3D:inside?.contact3D??[],mapping:{coordinateSystem:'torus-parameters-not-isometric-development'}};
    if(p.hostType==='cone') {
      const k=(p.mainEndOD-p.mainOD)/(2*p.mainLength),s=Math.hypot(1,k),radii=[p.mainOD/2,p.mainEndOD/2];geometry.conical={length:p.mainLength,outerRadii:radii,innerRadii:radii.map(r=>r-p.mainWall*s),k,s,motherOpening:false,
        outerHoleUV:[],innerHoleUV:[],outerHole3D:[],innerHole3D:[],outerContact3D:outside.contact3D,innerContact3D:inside?.contact3D??[],mapping:{coordinateSystem:'conical-outer-isometric-development',seamAngle:rad(p.surfaceClock)-Math.PI}};
      main.outerRadii=radii;main.innerRadii=geometry.conical.innerRadii;
    }
    const depths=faces.flatMap(face=>face.stations.map(row=>row.depth)),datumDepth=Math.floor(Math.min(...depths)),depthOrigin=Math.max(0,datumDepth-10),templates=faces.map(face=>{
      // The printed side faces out of the material. With depth increasing
      // toward the joint, paper x must run opposite the material-boundary
      // direction; this also makes inner faces point into the hollow/void.
      const curve=face.stations.map(row=>[face.length-row.faceDistance,row.depth-depthOrigin]),height=Math.max(...curve.map(q=>q[1]))+5;
      return {id:`steel-face-${face.id}`,title:`${section.label}／${face.label}端部裁線`,basis:face.kind==='arc'?'既有型材圓弧面實際弧長包覆':'既有型材平面 1:1 貼面',outerRole:'paper-boundary',outer:close([[0,0],[face.length,0],[face.length,height],[0,height]]),holes:[],width:face.length,height,
        references:[{type:'cut-line',points:curve,label:'端部成品切線'},{type:'datum',points:[[0,datumDepth-depthOrigin],[face.length,datumDepth-depthOrigin]],label:`D ${datumDepth} mm：由自由直端量`},
          {type:'seam',points:[[0,0],[0,height]],label:face.edgeEndId},{type:'seam',points:[[face.length,0],[face.length,height]],label:face.edgeStartId}],
        notes:['母管保持封閉；本圖只切鋼構端部，不得據此在母管挖孔。',`此面為 ${face.label}，文字面朝材料外側；紙樣左／右邊分別 ${face.edgeEndId}／${face.edgeStartId}，沿面 u 從右邊向左增加。`,`全部材料面共用同一自由直端及 D ${datumDepth} mm 基準，不能各面重設切深零。`,'圓角依輸入實測半徑；不是熱軋型錄預設形狀。','未含坡口、砂輪刀縫、粗切留料、焊接收縮或承載驗證。'],
        mapping:{coordinateSystem:'steel-face-physical-development',branchKind:'steel',hostType:p.hostType,motherOpening:false,faceId:face.id,faceKind:face.kind,faceRole:face.role,edgeStartId:face.edgeStartId,edgeEndId:face.edgeEndId,paperLeftEdge:face.edgeEndId,paperRightEdge:face.edgeStartId,paperTransform:'steel-face-mirror-x',faceWidth:face.length,depthOrigin,datumDepth,freeEndDepth:0,origin:[0,depthOrigin],axisEnd:endT}};
    });
    if(p.hostType!=='elbow') {
      const mirrorCone=p.hostType==='cone'&&p.mainEndOD>p.mainOD,
        footprint=outside.contact3D.map(point=>{const developed=host.coordinates(point).developed;return mirrorCone?[-developed[0],developed[1]]:developed;}),xs=footprint.map(q=>q[0]),ys=footprint.map(q=>q[1]),min=[Math.min(...xs)-25,Math.min(...ys)-25],width=Math.max(...xs)-min[0]+25,height=Math.max(...ys)-min[1]+25;
      const positioning={},crosses=[];
      for(const [name,index] of [['A',0],['B',Math.floor((footprint.length-1)/2)]]) {
        const paper=sub(footprint[index],min),world=outside.contact3D[index],physical=host.coordinates(world);positioning[name]={paper,point:world,...physical};
        crosses.push({type:'datum',points:[[paper[0]-2,paper[1]],[paper[0]+2,paper[1]]],label:`${name} 定位十字（非鑽孔）`},{type:'datum',points:[[paper[0],paper[1]-2],[paper[0],paper[1]+2]],label:''});
      }
      templates.push({id:'steel-mother-datum',title:'鋼構支材貼合定位 · 母管禁止開孔',basis:p.hostType==='cone'?'理想錐面外壁等距紙樣':'母管實際外壁包覆紙樣',outerRole:'paper-boundary',outer:close([[0,0],[width,0],[width,height],[0,height]]),holes:[],width,height,
        references:[{points:footprint.map(q=>sub(q,min)),type:'datum',closed:true,label:'支材外輪廓貼合定位；禁止開孔'},...crosses],notes:['矩形邊界只裁紙；貼合足跡為定位虛線，母材保持封閉。','以母材 A 端為 X／母線距離零；外壁方位 0° 母線為周向零。依 A／B 十字實測座標貼合，十字不是鑽孔位置。'],
        mapping:{coordinateSystem:p.hostType==='cone'?'conical-outer-isometric-development':'main-outer-wrap',branchKind:'steel',hostType:p.hostType,motherOpening:false,origin:min,positioning,...(mirrorCone?{paperTransform:'conical-mirror-x'}:{}),...(p.hostType==='cone'?{seamAngle:rad(p.surfaceClock)-Math.PI}:{azimuth:p.azimuth,seamRad:rad(p.azimuth)-Math.PI,localArcOffset:Math.PI*host.R})}});
    }
    chord=Math.max(chord,motherPaperChord);
    const guarded=chord*GUARD,verification=[{id:'equations',label:'材料母線／母材外壁交點殘差',value:residual,unit:'mm',tolerance:p.tolerance,status:residual<=p.tolerance?'pass':'fail'},
      {id:'roundtrip',label:'母材定位紙樣／曲面分點反包誤差',value:roundTrip,unit:'mm',tolerance:p.tolerance,status:roundTrip<=p.tolerance?'pass':'fail'},
      {id:'chord',label:'各材料面裁線採樣弦差（含數值餘量）',value:guarded,unit:'mm',tolerance:p.tolerance,status:guarded<=p.tolerance?'pass':'warning'},
      ...(p.hostType==='elbow'?[]:[{id:'mother-paper-chord',label:'母材定位紙面裁線弦差（含數值餘量）',value:motherPaperChord*GUARD,unit:'mm',tolerance:p.tolerance,status:motherPaperChord*GUARD<=p.tolerance?'pass':'warning'}]),
      {id:'material-coverage',label:'截面實材格點及薄壁／腹板厚度帶探查',value:probes.length,unit:'points',tolerance:0,status:'pass',basis:'material-only-interior-lattice-and-boundary-thickness-strips'},
      {id:'wall-collision',label:'保留鋼構與有限母材干涉探查',value:wallChecks,unit:'points',tolerance:0,status:'pass',basis:p.hostType==='elbow'?'finite-material-probes':'convex-outward-exit'}];
    warnings.push('以輸入實测截面計算，未代表任何鋼構型錄；根圓角與壁厚須核對實材。','截面實材及保留管身使用邊界與內部格點探查；不是全域包絡、刀具可達性或結構承載證明。');
    if(p.rootGap)warnings.push('間隙為母材外表面法向偏置：直管／彎頭採外半徑偏置，大小管採真法向偏置；不是沿支材軸的同值間隙。');
    const perimeter=section.boundaries[0].segments.reduce((s,f)=>s+f.length,0),measurements={mainCircumference:TAU*host.R,branchCircumference:perimeter,sectionPerimeter:perimeter,sectionArea:section.area,branchMinLength:p.branchLength,branchMaxLength:endT-cutMin,branchAxisEnd:endT,
      branchOuterCutLength:outside.cut3D.slice(1).reduce((s,q,i)=>s+distance(q,outside.cut3D[i]),0),branchInnerCutLength:inside?inside.cut3D.slice(1).reduce((s,q,i)=>s+distance(q,inside.cut3D[i]),0):null,
      mainHoleToolDiameter:null,mainHoleAxialLength:null,mainHoleArcWidth:null,padMinimumMargin:null,padNetArea:0,padNeutralRadius:null,projectedLength:0,datumDepth,depthOrigin};
    return {valid:true,params:p,errors:[],warnings,geometry,templates,verification,measurements,stationTable:faces.flatMap(face=>face.stations),sampling:{sampledMaxChordError:chord,guardFactor:GUARD,motherPaperSampledChordError:p.hostType==='elbow'?null:motherPaperChord},
      wallEnvelope:{method:'boundary-and-material-interior-probes',materialPoints:probes.length,checks:wallChecks,rigorous:false,roughCutSupported:false},capabilities:{steel:true,motherOpening:false,pad:false,roughCut:false,wholeHostDevelopment:false,physicalFaceTemplates:true}};
  }catch(error){return fail(error);}
}

export function computeSteelJoint(raw={}) {
  const requestedSamples=Number(raw.samples??DEFAULTS.samples);let result=build(raw),n=result.params.samples,error=result.verification.find(v=>v.id==='chord')?.value??null;
  while(result.valid&&result.params.autoPrecision&&error>result.params.tolerance&&n<CAP){n=Math.min(CAP,Math.max(n+4,Math.ceil(n*Math.max(1.35,Math.sqrt(error/result.params.tolerance)*1.12)/4)*4));result=build({...raw,samples:n});error=result.verification.find(v=>v.id==='chord')?.value??null;}
  const met=result.valid&&error!==null&&error<=result.params.tolerance,precision={requestedSamples,effectiveSamples:result.params.samples,cap:CAP,auto:result.params.autoPrecision,metTolerance:met,maxChordError:error,tolerance:result.params.tolerance,sampledMaxChordError:result.sampling?.sampledMaxChordError??null,guardFactor:GUARD,method:'per-material-face-interior-eighth-probes-with-numerical-margin'};
  if(result.valid&&result.params.autoPrecision&&!met)return {...result,valid:false,geometry:null,templates:[],stationTable:[],errors:[{field:'tolerance',code:'tolerance',message:'鋼構各面裁線已達取樣上限，仍未符合製作容差；請調整容差或接合位置。'}],precision,manufacturingReady:false};
  return {...result,precision,manufacturingReady:result.valid&&met&&result.verification.every(v=>v.status!=='fail')};
}

export function computeSteelFaceStations(input,faceId,count=12) {
  if(!Number.isInteger(count)||count<1||count>CAP)throw new RangeError('材料面分點須為 1 至 4096 整數。');
  const result=input?.params&&typeof input.valid==='boolean'?input:computeSteelJoint(input);
  if(!result.valid||!result.geometry?.steel)throw new RangeError('無效鋼構接頭不能產生材料面分點。');
  const face=result.geometry.steel.section.faces.find(face=>face.id===faceId);if(!face)throw new RangeError('找不到材料面。');
  const host=createHost(result.params,result.geometry.steel.section),endT=result.geometry.steel.axisEnd;
  return Array.from({length:count+1},(_,index)=>{const s=face.length*index/count,q=sectionPointAt(face,s),cut=host.near(q,result.params.rootGap,faceHint(face,s)),contact=host.near(q,0,faceHint(face,s));
    return {faceId,index,faceDistance:s,depth:endT-cut.t,point:cut.point,contactPoint:contact.point,sectionPoint:q,motherLocator:host.coordinates(contact.point)};});
}
