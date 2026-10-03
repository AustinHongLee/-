/** Already formed toroidal reinforcement plate. This module does NOT flatten
 * a doubly curved elbow into a paper/stock pattern and does NOT size a plate
 * for pressure, support loads, weld strength, or code compliance.
 *
 * The plate faces are parallel ideal tori rho=R and rho=R+t. The bore is the
 * branch-axis cylinder of radius branchOD/2+padClearance. Outer shapes are
 * explicitly defined in an angular marking chart, NOT in an isometric flat
 * development. Each chart boundary segment is mapped linearly in beta/phi.
 */
import {torusSurfacePoint,torusCoordinates,torusLineIntersections,elbowFrame} from './elbow-geometry.js';

const TAU=2*Math.PI,EPS=1e-9,PAD_SAMPLE_CAP=4096,PAD_BOUNDARY_CAP=16384,GUARD=1.1;
const FRACTIONS=Array.from({length:7},(_,i)=>(i+1)/8);
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,k)=>a.map(v=>v*k),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const norm=v=>Math.hypot(...v),close=p=>[...p,[...p[0]]];
const wrap=a=>((a%TAU)+TAU)%TAU,unwrap=(a,c)=>c+Math.atan2(Math.sin(a-c),Math.cos(a-c));
const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const pointInPolygon=(p,poly)=>{let inside=false;for(let i=0,j=poly.length-2;i<poly.length-1;j=i++){
  const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
}return inside;};

/** Analytic continuous-thickness distance from a normal line to the bore axis.
 * P(rho)=C(beta)+rho*m(beta,phi); its squared projected distance to the axis is
 * A*rho^2+2B*rho+C. Minimizing this quadratic over the complete [R,R+t] interval
 * is exact; no radial thickness sampling is used for boundary certification.
 */
export function formedElbowPadAxisDistance(beta,phi,context){
  const {bendRadius:Rc,innerRadius:R,outerRadius:Ro,branchOrigin:o,branchDirection:d}=context;
  const f=elbowFrame(beta,Rc),m=add(mul(f.normal,Math.cos(phi)),mul(f.binormal,Math.sin(phi)));
  const project=v=>sub(v,mul(d,dot(v,d))),a=project(sub(f.center,o)),b=project(m),A=dot(b,b),B=dot(a,b);
  const rho=A>1e-20?Math.max(R,Math.min(Ro,-B/A)):R;
  const v=add(a,mul(b,rho));return {distance:norm(v),rho,point:torusSurfacePoint(beta,phi,Rc,rho)};
}

function certifyBoundary(parameters,context,tool){
  let clearance=Infinity;
  for(let i=0;i<parameters.length-1;i++){
    const a=parameters[i],b=parameters[i+1],mid=lerp(a,b,.5);
    // Axis distance is 1-Lipschitz in world space. Uniformly across the entire
    // continuous plate thickness, |dP| <= (Rc+Ro)|d beta|+Ro|d phi|. This bounds
    // all points on the actual straight chart segment, not merely its samples.
    const halfDisplacement=((context.bendRadius+context.outerRadius)*Math.abs(b[0]-a[0])+
      context.outerRadius*Math.abs(b[1]-a[1]))/2;
    clearance=Math.min(clearance,formedElbowPadAxisDistance(mid[0],mid[1],context).distance-tool-halfDisplacement);
  }
  return clearance;
}

/** A straight beta/phi segment maps to a smooth torus curve. The global
 * bound on its second derivative gives a conservative entire-segment chord
 * error bound M/8; this certificate concerns the marking polygon only.
 */
export function formedElbowPadBoundaryChordBound(a,b,context){
  const db=Math.abs(b[0]-a[0]),dp=Math.abs(b[1]-a[1]),Ro=context.outerRadius;
  return ((context.bendRadius+Ro)*db*db+2*Ro*db*dp+Ro*dp*dp)/8;
}
function densifyBoundary(points,{chartX,chartY,context,tolerance},maxLength=2){
  const result=[points[0]];
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1],pa=[a[0]/chartX,a[1]/chartY],pb=[b[0]/chartX,b[1]/chartY];
    const bound=formedElbowPadBoundaryChordBound(pa,pb,context);
    const steps=Math.max(1,Math.ceil(norm(sub(b,a))/maxLength),Math.ceil(Math.sqrt(bound/(tolerance/GUARD))));
    if(result.length+steps>PAD_BOUNDARY_CAP)throw new RangeError('成形補強板外緣已達 16384 點上限仍無法符合曲面弦差容差；請放寬數值輪廓誤差。');
    for(let k=1;k<=steps;k++)result.push(lerp(a,b,k/steps));
  }
  return result;
}

function shapeBoundary(shape,hole,margin,count,extra){
  const minX=Math.min(...hole.map(q=>q[0])),maxX=Math.max(...hole.map(q=>q[0]));
  const minY=Math.min(...hole.map(q=>q[1])),maxY=Math.max(...hole.map(q=>q[1]));
  const cx=(minX+maxX)/2,cy=(minY+maxY)/2,hx=(maxX-minX)/2,hy=(maxY-minY)/2,m=margin+extra;
  if(shape==='circle'||shape==='ellipse'){
    const r=Math.max(...hole.map(q=>Math.hypot(q[0]-cx,q[1]-cy)))+m;
    const rx=shape==='circle'?r:Math.SQRT2*(hx+m),ry=shape==='circle'?r:Math.SQRT2*(hy+m);
    return {center:[cx,cy],points:close(Array.from({length:count},(_,i)=>[cx+rx*Math.cos(TAU*i/count),cy+ry*Math.sin(TAU*i/count)]))};
  }
  let bx=hx,by=hy,r=m;
  if(shape==='obround'){if(hx>=hy){by=0;r=hy+m;}else{bx=0;r=hx+m;}}
  const points=[],steps=Math.max(16,Math.ceil(count/4));
  for(let j=0;j<4;j++){
    const c=[cx+(j===0||j===3?bx:-bx),cy+(j<2?by:-by)];
    for(let k=0;k<=steps;k++){const a=(j+k/steps)*Math.PI/2,p=[c[0]+r*Math.cos(a),c[1]+r*Math.sin(a)];
      if(!points.length||norm(sub(p,points.at(-1)))>EPS)points.push(p);}
  }
  return {center:[cx,cy],points:close(points)};
}

function splitReferenceLines(parameters,hole,axis,coordinate,holeCrossings){
  const other=1-axis,limits=parameters.map(q=>q[other]),cuts=[Math.min(...limits),Math.max(...limits)];
  for(const polygon of (holeCrossings?[parameters]:[parameters,hole]))for(let i=0;i<polygon.length-1;i++){
    const a=polygon[i],b=polygon[i+1];if((a[axis]<=coordinate&&b[axis]>=coordinate)||(b[axis]<=coordinate&&a[axis]>=coordinate)){
      if(Math.abs(b[axis]-a[axis])<EPS)continue;const q=lerp(a,b,(coordinate-a[axis])/(b[axis]-a[axis]));cuts.push(q[other]);
    }
  }
  if(holeCrossings)cuts.push(...holeCrossings.map(q=>q.parameter[other]));
  const values=[...new Set(cuts.map(q=>q.toFixed(11)))].map(Number).sort((a,b)=>a-b),segments=[];
  const at=v=>axis===0?[coordinate,v]:[v,coordinate];
  for(let i=0;i<values.length-1;i++){
    const m=at((values[i]+values[i+1])/2);if(pointInPolygon(m,parameters)&&!pointInPolygon(m,hole))segments.push([at(values[i]),at(values[i+1])]);
  }
  return segments;
}

function makeModel(joint,p){
  const e=joint.geometry.elbow,a=joint.geometry.axes,R=e.outerRadius,Ro=R+p.padThickness,Rc=e.bendRadius;
  const context={bendRadius:Rc,innerRadius:R,outerRadius:Ro,branchOrigin:a.branchOrigin,branchDirection:a.branchDirection};
  const tool=joint.params.branchOD/2+p.padClearance,phi0=e.surfaceClock,chartX=Rc+R,chartY=R;
  const normalDot=dot(a.hostNormal,a.branchDirection),anchor=new Map(),cache=new Map();
  const finite=q=>q.beta>=-1e-8&&q.beta<=e.bendAngle+1e-8;
  const root=(radius,theta,cacheResult=true)=>{
    const key=`${radius}/${theta.toFixed(13)}`;if(cache.has(key))return cache.get(key);
    if(!anchor.has(radius)){
      const roots=torusLineIntersections(a.branchOrigin,a.branchDirection,Rc,radius).filter(q=>q.normalDotDirection>1e-7);
      const expected=(radius-R)/normalDot;roots.sort((x,y)=>Math.abs(x.t-expected)-Math.abs(y.t-expected));
      if(!roots.length||!finite(roots[0]))throw new Error('補強板法線層的近側孔口跨出有限彎頭或失去交線。');anchor.set(radius,roots[0]);
    }
    const foot=add(a.branchOrigin,mul(add(mul(a.stationZero,Math.cos(theta)),mul(a.station90,Math.sin(theta))),tool));
    const candidates=torusLineIntersections(foot,a.branchDirection,Rc,radius).filter(q=>q.normalDotDirection>1e-7);
    candidates.sort((x,y)=>Math.abs(x.t-anchor.get(radius).t)-Math.abs(y.t-anchor.get(radius).t));
    if(!candidates.length||!finite(candidates[0]))throw new Error('補強板穿厚孔跨出有限彎頭端部或成為相切開放交線。');
    const q=candidates[0],parameter=[q.beta,unwrap(q.phi,phi0)],result={...q,parameter,chart:[chartX*parameter[0],chartY*parameter[1]],radius};
    if(q.t>=joint.geometry.branch.axisEnd-1e-7)throw new Error('補強板外面孔口超過支管自由端；請降低板厚或加長支管。');
    if(cacheResult)cache.set(key,result);return result;
  };
  return {context,R,Ro,Rc,tool,phi0,chartX,chartY,root};
}

function seamHoleRoots(model,radius,axis,coordinate,count){
  const roots=[];
  for(let i=0;i<count;i++){
    let a=TAU*i/count,b=TAU*(i+1)/count,fa=model.root(radius,a).parameter[axis]-coordinate,fb=model.root(radius,b===TAU?0:b).parameter[axis]-coordinate;
    if(Math.abs(fa)<1e-10)roots.push(model.root(radius,a));
    if(fa*fb>=0)continue;
    for(let k=0;k<45;k++){const m=(a+b)/2,fm=model.root(radius,m).parameter[axis]-coordinate;if(fa*fm<=0){b=m;fb=fm;}else{a=m;fa=fm;}}
    roots.push(model.root(radius,(a+b)/2));
  }
  return roots.filter((q,i)=>!roots.slice(0,i).some(r=>norm(sub(q.point,r.point))<1e-7));
}

export function computeFormedElbowPad(joint,options={}){
  const p={padThickness:6,padMargin:35,padClearance:1,padShape:'circle',padSplit:'single',...joint?.params,...options};
  const errors=[],error=(field,message)=>errors.push({field,message});
  const fail=()=>({valid:false,errors,warnings:[],geometry:null,pad:null,stationTable:[],edgeStationTable:[],verification:[],
    capabilities:{formedPad:true,flatDevelopment:false,oneToOnePaperTemplate:false,structuralDesign:false}});
  if(!joint?.valid||!joint.geometry?.elbow||joint.params.hostType!=='elbow')error('padEnabled','需先有有效的彎頭插管模型。');
  for(const f of ['padThickness','padMargin','padClearance']){p[f]=Number(p[f]);if(!Number.isFinite(p[f])||p[f]<(f==='padClearance'?0:EPS))error(f,'補強板尺寸須為有效正數，孔隙可為零。');}
  if(!['circle','ellipse','obround','rounded'].includes(p.padShape))error('padShape','請選有效的成形板定位外形。');
  if(!['single','axial','circumferential'].includes(p.padSplit))error('padSplit','請選單片、沿彎曲方向分兩片或沿截面方向分兩片。');
  if(errors.length)return fail();
  const e=joint.geometry.elbow;
  if(e.bendRadius<=e.outerRadius+p.padThickness)error('padThickness','彎曲中心半徑須大於含板厚的外半徑，避免內彎自交。');
  if(errors.length)return fail();
  const model=makeModel(joint,p),{context,R,Ro,Rc,tool,chartX,chartY,root}=model;
  const n=Math.max(128,Math.min(PAD_SAMPLE_CAP,joint.params.samples??360)),levels=9,loops=[];
  let maximumResidual=0,minimumNormalDot=1,minimumBranchFreeEnd=Infinity;
  let sampledBoreChordError=0,boundaryChordBound=0;
  try{
    for(let layer=0;layer<levels;layer++){
      const radius=R+p.padThickness*layer/(levels-1),loop=[];
      for(let i=0;i<n;i++){
        const q=root(radius,TAU*i/n);maximumResidual=Math.max(maximumResidual,Math.abs(q.residual));
        minimumNormalDot=Math.min(minimumNormalDot,q.normalDotDirection);minimumBranchFreeEnd=Math.min(minimumBranchFreeEnd,joint.geometry.branch.axisEnd-q.t);
        loop.push(q);
      }
      const closedLoop=[...loop,loop[0]];
      // Only the two visible manufacturing face contours are discretized.
      // Intermediate plate layers are bore-topology probes, not a whole-
      // thickness global chord or interference theorem. Avoid caching probes.
      if(layer===0||layer===levels-1)for(let i=0;i<n;i++)for(const fraction of FRACTIONS){
        const q=root(radius,TAU*(i+fraction)/n,false),a=closedLoop[i],b=closedLoop[i+1];
        sampledBoreChordError=Math.max(sampledBoreChordError,norm(sub(q.point,lerp(a.point,b.point,fraction))),norm(sub(q.chart,lerp(a.chart,b.chart,fraction))));
        maximumResidual=Math.max(maximumResidual,Math.abs(q.residual));
        minimumNormalDot=Math.min(minimumNormalDot,q.normalDotDirection);
        minimumBranchFreeEnd=Math.min(minimumBranchFreeEnd,joint.geometry.branch.axisEnd-q.t);
      }
      loops.push(closedLoop);
    }
  }catch(cause){error('padGeometry',cause.message);return fail();}
  const chartPoints=loops.flatMap(loop=>loop.map(q=>q.chart));
  let outer,outerParameter,certificate=-Infinity,shape,extra=0;
  try{for(let iteration=0;iteration<30;iteration++){
    shape=shapeBoundary(p.padShape,chartPoints,p.padMargin,n,extra);outer=densifyBoundary(shape.points,{chartX,chartY,context,tolerance:joint.params.tolerance});
    outerParameter=outer.map(([x,y])=>[x/chartX,y/chartY]);
    const betaMin=Math.min(...outerParameter.map(q=>q[0])),betaMax=Math.max(...outerParameter.map(q=>q[0]));
    const phiSpan=Math.max(...outerParameter.map(q=>q[1]))-Math.min(...outerParameter.map(q=>q[1]));
    if(betaMin<=1e-8||betaMax>=e.bendAngle-1e-8){error('padMargin','含板厚的補強板外緣跨出彎頭端部；請減少留邊或調整插管位置。');return fail();}
    if(phiSpan>=Math.PI){error('padMargin','此版成形板需小於半個管周的局部貼合面；請縮小外形或留邊。');return fail();}
    certificate=certifyBoundary(outerParameter,context,tool);
    const enclosed=chartPoints.every(q=>pointInPolygon(q,outer));
    if(certificate>=p.padMargin-1e-8&&enclosed)break;
    extra+=Math.max(1,p.padMargin-certificate)*1.15;
  }}catch(cause){error('tolerance',cause.message);return fail();}
  if(certificate<p.padMargin-1e-8){error('padMargin','無法證明完整板厚外緣的最低留邊，請調整板形與接頭方向。');return fail();}
  for(let i=0;i<outerParameter.length-1;i++)boundaryChordBound=Math.max(boundaryChordBound,formedElbowPadBoundaryChordBound(outerParameter[i],outerParameter[i+1],context));
  const guardedChord=Math.max(sampledBoreChordError*GUARD,boundaryChordBound*GUARD);
  const inner=loops[0],outerHole=loops.at(-1),map=radius=>outerParameter.map(([beta,phi])=>torusSurfacePoint(beta,phi,Rc,radius));
  const holeUV=(loop,radius)=>loop.map(q=>[Rc*q.parameter[0],radius*q.parameter[1]]);
  const splitAxis=p.padSplit==='axial'?1:0,splitCoordinate=shape.center[splitAxis]/(splitAxis?chartY:chartX);
  const splitCrossings=p.padSplit==='single'?[]:loops.map(loop=>seamHoleRoots(model,loop[0].radius,splitAxis,splitCoordinate,n));
  const splitLayers=p.padSplit==='single'?[]:loops.map((loop,i)=>splitReferenceLines(outerParameter,loop.map(q=>q.parameter),splitAxis,splitCoordinate,splitCrossings[i]));
  if(p.padSplit!=='single'&&splitLayers.some(segments=>segments.length!==2)){error('padSplit','此補強板的接縫不能形成兩段外緣至孔口接線，請改為單片或另一分片方向。');return fail();}
  const splitSegments=splitLayers.at(-1)??[];
  const pad={hostType:'elbow',manufacturing:'formed-torus-axis-bore',shape:p.padShape,split:p.padSplit,
    innerRadius:R,outerRadius:Ro,neutralRadius:null,bendRadius:Rc,outerParameter,
    // These face charts are for triangulating a 3D curved face only.
    innerBoundaryUV:outerParameter.map(([beta,phi])=>[Rc*beta,R*phi]),
    outerBoundaryUV:outerParameter.map(([beta,phi])=>[Rc*beta,Ro*phi]),
    innerBoundary3D:map(R),outerBoundary3D:map(Ro),
    innerHoleUV:holeUV(inner,R),outerHoleUV:holeUV(outerHole,Ro),
    innerHole3D:inner.map(q=>q.point),outerHole3D:outerHole.map(q=>q.point),
    splitReference3D:splitSegments.map(segment=>segment.map(([beta,phi])=>torusSurfacePoint(beta,phi,Rc,Ro))),
    splitReferenceInner3D:(splitLayers[0]??[]).map(segment=>segment.map(([beta,phi])=>torusSurfacePoint(beta,phi,Rc,R))),
    splitAxis:p.padSplit==='single'?null:splitAxis,splitCoordinate:p.padSplit==='single'?null:splitCoordinate,
    mapping:{coordinateSystem:'torus-parameters-not-isometric-development',betaScale:Rc,
      innerPhiScale:R,outerPhiScale:Ro,shapeChartBetaScale:chartX,shapeChartPhiScale:chartY,
      developmentBasis:null,units:'mm/rad',hostType:'elbow'},
    // A compact snapshot excludes geometry.pad so attaching this result to the
    // original joint never creates a circular object graph.
    source:{joint:{valid:true,params:{...joint.params,padEnabled:false},geometry:{elbow:{bendRadius:e.bendRadius,
      bendAngle:e.bendAngle,surfaceClock:e.surfaceClock,outerRadius:e.outerRadius,innerRadius:e.innerRadius},
      axes:{branchOrigin:[...joint.geometry.axes.branchOrigin],branchDirection:[...joint.geometry.axes.branchDirection],
        stationZero:[...joint.geometry.axes.stationZero],station90:[...joint.geometry.axes.station90],hostNormal:[...joint.geometry.axes.hostNormal]},
      branch:{axisEnd:joint.geometry.branch.axisEnd}}},
      options:{padThickness:p.padThickness,padMargin:p.padMargin,padClearance:p.padClearance,padShape:p.padShape,padSplit:p.padSplit}},
    boundaryCertification:{method:'continuous-thickness-axis-distance-quadratic-and-segment-Lipschitz-bound',
      rigorous:true,clearance:certificate,required:p.padMargin,segmentDefinition:'linear-in-beta-phi'},
    nearBoreValidation:{method:'positive-normal-near-root-layer-loops',rigorous:false,layers:levels,angularSamples:n}};
  const coordinates=(q,radius)=>({point:q.point,betaRad:q.parameter[0],phiRad:q.parameter[1],
    betaDegrees:q.parameter[0]*180/Math.PI,phiDegrees:wrap(q.parameter[1])*180/Math.PI,
    rearDistance:(Rc+radius)*q.parameter[0],bellyDistance:(Rc-radius)*q.parameter[0],
    circumference:radius*wrap(q.parameter[1]),axisStation:q.t});
  const splitCoordinateRows=(segments,radius)=>segments.flatMap((segment,i)=>segment.map((parameter,j)=>{
    const [beta,phi]=parameter,point=torusSurfacePoint(beta,phi,Rc,radius);
    return {segment:i+1,end:j+1,point,betaRad:beta,phiRad:phi,betaDegrees:beta*180/Math.PI,
      phiDegrees:wrap(phi)*180/Math.PI,rearDistance:(Rc+radius)*beta,motherRearDistance:(Rc+R)*beta,
      circumference:radius*wrap(phi)};
  }));
  pad.splitLocator={inner:splitCoordinateRows(splitLayers[0]??[],R),outer:splitCoordinateRows(splitLayers.at(-1)??[],Ro)};
  const stationTable=Array.from({length:25},(_,i)=>{const theta=i===24?0:TAU*i/24,a=root(R,theta),b=root(Ro,theta);
    return {station:i,angle:360*i/24,inner:coordinates(a,R),outer:coordinates(b,Ro),innerPoint:a.point,outerPoint:b.point};});
  const edgeStationTable=Array.from({length:25},(_,i)=>{const k=i===24?0:Math.round(i*(outerParameter.length-1)/24),[beta,phi]=outerParameter[k];
    return {station:i,betaRad:beta,phiRad:phi,betaDegrees:beta*180/Math.PI,phiDegrees:wrap(phi)*180/Math.PI,
      rearDistance:(Rc+Ro)*beta,circumference:Ro*wrap(phi),point:torusSurfacePoint(beta,phi,Rc,Ro),
      innerPoint:torusSurfacePoint(beta,phi,Rc,R),motherRearDistance:(Rc+R)*beta};});
  const verification=[{id:'formed-pad-bore-equations',label:'成形補強板內外面孔口方程殘差',value:maximumResidual,unit:'mm',tolerance:joint.params.tolerance,status:maximumResidual<=joint.params.tolerance?'pass':'fail'},
    {id:'formed-pad-chord',label:'成形補強板孔口採樣與曲面外緣弦差（含數值餘量）',value:guardedChord,unit:'mm',tolerance:joint.params.tolerance,status:guardedChord<=joint.params.tolerance?'pass':'warning',basis:'face-bore-interior-probes-and-marking-segment-second-derivative-bound'},
    {id:'formed-pad-whole-thickness-margin',label:'補強板連續板厚外緣最低留邊下界',value:certificate,unit:'mm',tolerance:p.padMargin,status:'pass',basis:pad.boundaryCertification.method},
    {id:'formed-pad-free-end',label:'板外孔口至支管自由端餘裕（採樣）',value:minimumBranchFreeEnd,unit:'mm',tolerance:0,status:'pass'},
    {id:'formed-pad-layer-checks',label:'成形板近側孔口層與站點探查',value:levels*n,unit:'samples',tolerance:0,status:'pass',basis:'finite-probes-not-global-proof'}];
  return {valid:true,errors:[],params:p,pad,geometry:pad,stationTable,edgeStationTable,verification,
    measurements:{padMinimumMargin:certificate,padThickness:p.padThickness,padBoreDiameter:2*tool,padNetArea:null,padNeutralRadius:null},
    warnings:['彎頭板為預先成形雙曲率曲面；定位圖座標不可當平板 1:1 展開裁切。',
      '外形名稱定義於角度定位圖；實際曲面邊緣依分點座標製作。',
      '孔口以有限環面近側根逐層探查；完整板厚外緣留邊另有連續厚度保守下界。',
      '未驗證補強面積、板厚選型、支撐承載、焊縫強度或壓力管規範。'],
    capabilities:{formedPad:true,flatDevelopment:false,oneToOnePaperTemplate:false,structuralDesign:false,
      continuousThicknessBoundaryMargin:true,globalBoreTopologyProof:false,splitLocator:p.padSplit!=='single'},
    sampling:{sampledMaxChordError:Math.max(sampledBoreChordError,boundaryChordBound),guardFactor:GUARD,
      sampledBoreChordError,boundaryChordBound,boreSamples:n,outerBoundaryPoints:outerParameter.length},
    validation:{minimumNormalDot,nearBoreLayers:levels,nearBoreSamples:n,boundaryClearanceRigorous:true,globalTopologyRigorous:false}};
}

/** Re-solve exact inner/outer face bore stations for a different field table
 * count; do not interpolate a mesh station or rescale one face's hole. */
export function computeExactFormedElbowPadStations(input,count=24){
  if(!Number.isInteger(count)||count<1||count>4096)throw new RangeError('補強板孔口分點區段須為 1 至 4096 的整數。');
  const pad=input?.geometry?.pad??input?.pad??input;
  if(!pad?.source?.joint?.valid)throw new RangeError('需先有有效的成形彎頭補強板。');
  const {joint,options}=pad.source,model=makeModel(joint,options),{R,Ro,Rc,root}=model;
  const coordinates=(q,radius)=>({point:q.point,betaRad:q.parameter[0],phiRad:q.parameter[1],
    betaDegrees:q.parameter[0]*180/Math.PI,phiDegrees:wrap(q.parameter[1])*180/Math.PI,
    rearDistance:(Rc+radius)*q.parameter[0],bellyDistance:(Rc-radius)*q.parameter[0],
    circumference:radius*wrap(q.parameter[1]),axisStation:q.t});
  return Array.from({length:count+1},(_,i)=>{const theta=i===count?0:TAU*i/count,a=root(R,theta),b=root(Ro,theta);
    return {station:i,angle:360*i/count,inner:coordinates(a,R),outer:coordinates(b,Ro),innerPoint:a.point,outerPoint:b.point};});
}

export const computeExactFormedElbowPadLocatorTable=computeExactFormedElbowPadStations;
