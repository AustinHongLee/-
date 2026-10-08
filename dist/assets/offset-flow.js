// Flow effects of an offset route, used to explain weld and bend choices to an owner.
//
// Liquids (Newtonian, isothermal, single phase, pipe full): Darcy–Weisbach. Friction factor by Churchill (1977),
// valid for laminar, transitional and turbulent flow. Bends by Rennels & Hudson (2012), any angle and centreline
// radius, arc friction included. Each weld bead is taken as a thin sharp-edged ring orifice (Idelchik, diagram
// 4-14): a real bead is rounded and loses less, so this is a conservative ceiling. In laminar flow the Poiseuille
// loss along the narrowed bead width is added.
// Plastic pellets (pneumatic conveying): the pressure loss depends on solids loading and is not modelled here;
// the route is described by its bends (where pellets strike and slide) and by the weld beads they would hit.
import {ASME_PIPE_SIZES} from './pipe-sizes.js';

// ASME B36.10 standard-weight (STD) wall, mm. Verified 2026-10-08 (Asia/Taipei) against FLOW_REFERENCES 1–2.
export const STD_WALL_MM = Object.freeze({'1/8':1.73,'1/4':2.24,'3/8':2.31,'1/2':2.77,'3/4':2.87,'1':3.38,'1-1/4':3.56,'1-1/2':3.68,'2':3.91,'2-1/2':5.16,'3':5.49,'3-1/2':5.74,'4':6.02,'5':6.55,'6':7.11,'8':8.18,'10':9.27,'12':9.53,'14':9.53,'16':9.53,'18':9.53,'20':9.53,'22':9.53,'24':9.53});
export const FLOW_REFERENCES = Object.freeze([
  {title:'Project Materials: ASME B36.10 pipe sizes and schedules (STD wall, NPS 1/8–24)',url:'https://blog.projectmaterials.com/pipes/pipe-dimensions-asme-36-10-19/'},
  {title:'Werner Sölken (wermac.org): pipe dimensions, STD wall NPS 1/2–2',url:'https://www.wermac.org/pipes/dim_pipes.html'},
  {title:'ASME B31.3 Table 341.3.2, weld reinforcement / internal protrusion (SI column used: ≤6 mm wall 1.5 mm, ≤13 mm 3 mm, ≤25 mm 4 mm, over 25 mm 5 mm); inch column as reproduced in LANL WFP 2-01 Attachment 2',url:'https://engstandards.lanl.gov/esm/welding/vol2/WFP%202-01-Att-2-R1.pdf'},
  {title:'Idelchik, Handbook of Hydraulic Resistance (3rd ed., 1994), diagram 4-14: thin sharp-edged orifice; as implemented in Modelica.Fluid',url:'https://doc.modelica.org/om/Modelica.Fluid.Fittings.BaseClasses.QuadraticTurbulent.LossFactorData.sharpEdgedOrifice.html',use:'liquid'},
  {title:'Rennels & Hudson, Pipe Flow: A Practical and Comprehensive Guide (Wiley, 2012): smooth bend loss coefficient; as implemented in fluids.fittings.bend_rounded',url:'https://fluids.readthedocs.io/fluids.fittings.html',use:'liquid'},
  {title:'Churchill, S. W. (1977), Friction-factor equation spans all fluid-flow regimes, Chemical Engineering 84(24)',url:'https://fluids.readthedocs.io/fluids.friction.html',use:'liquid'}
]);
export const MEDIUM_KINDS = Object.freeze({
  none:Object.freeze({label:'未指定'}),
  water:Object.freeze({label:'水類液體',density:998,viscosity:1,velocity:1.5}),
  viscous:Object.freeze({label:'黏稠液體',density:1100,viscosity:1000,velocity:0.5}),
  pellets:Object.freeze({label:'塑膠粒（氣送）'})
});
export const PIPE_MATERIALS = Object.freeze({carbon:Object.freeze({label:'碳鋼',roughness:0.045}),stainless:Object.freeze({label:'不鏽鋼',roughness:0.015})});
export const DEFAULT_MEDIUM = Object.freeze({kind:'none',flow:null,density:998,viscosity:1,material:'carbon',wall:null,bead:null,finish:'as-welded',pellet:4});
const NUMERIC=['flow','density','viscosity','wall','bead','pellet'];
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const sum=a=>a.reduce((s,v)=>s+v,0);
const show=(v,n=2)=>Number.isFinite(v)?Number(v.toFixed(n)).toString():'—';

/** Pressure in the unit that keeps digits readable: Pa below 1 kPa, kPa above. `scale` picks the unit for a group. */
export function pressureText(pa,scale=pa){
  const big=Math.abs(scale)>=1000;
  return big?`${show(pa/1000,2)} kPa`:`${show(pa,Math.abs(scale)<10?1:0)} Pa`;
}
/** Signed difference with the same unit rule, e.g. "+160 Pa" or "−0.31 kPa". */
export const signedPressure=(pa,scale=pa)=>`${pa>=0?'+':'−'}${pressureText(Math.abs(pa),scale)}`;
/** Pressure as a water column (cm H₂O, 1000 kg/m³), the figure an owner can picture. */
export const waterColumnCm=pa=>pa/(1000*9.80665)*100;

/** Keeps only known keys with valid types; anything else falls back to the default. */
export function normalizeMedium(raw){
  const m={...DEFAULT_MEDIUM};
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return m;
  if(Object.hasOwn(MEDIUM_KINDS,raw.kind))m.kind=raw.kind;
  for(const k of NUMERIC)if(raw[k]===null||finite(raw[k]))m[k]=raw[k];
  if(Object.hasOwn(PIPE_MATERIALS,raw.material))m.material=raw.material;
  if(['as-welded','ground'].includes(raw.finish))m.finish=raw.finish;
  return m;
}
export const isLiquid=kind=>kind==='water'||kind==='viscous';
export function standardWall(od){const size=ASME_PIPE_SIZES.find(s=>Math.abs(s.odMm-od)<0.05);return size?STD_WALL_MM[size.nps]??null:null;}
/** ASME B31.3 Table 341.3.2 limit on internal weld protrusion, SI column (wall ≤6, ≤13, ≤25 mm). */
export function beadLimit(wall){return !(wall>0)?NaN:wall<=6?1.5:wall<=13?3:wall<=25?4:5;}
/** Flow (m³/h) giving the kind's typical velocity, rounded to two significant figures. */
export function suggestedFlow(kind,idMm){
  const v=MEDIUM_KINDS[kind]?.velocity;if(!v||!(idMm>0))return null;
  return Number((v*Math.PI*(idMm/1000)**2/4*3600).toPrecision(2));
}

/** Darcy friction factor, all regimes (Churchill 1977), evaluated in logs so large Re cannot overflow. */
export function churchillFriction(Re,relativeRoughness=0){
  const lnA=16*Math.log(Math.abs(2.457*Math.log(1/((7/Re)**0.9+0.27*relativeRoughness)))),lnB=16*Math.log(37530/Re);
  const big=Math.max(lnA,lnB),lnAB=big+Math.log(Math.exp(lnA-big)+Math.exp(lnB-big));
  return 8*((8/Re)**12+Math.exp(-1.5*lnAB))**(1/12);
}
/** Smooth bend of any deflection angle (deg) and centreline radius ratio r/D (Rennels & Hudson 2012). */
export function bendLossK(angleDeg,radiusRatio,f){
  const a=angleDeg*Math.PI/180,s=Math.sin(a/2);
  return f*a*radiusRatio+(0.10+2.4*f)*s+6.6*f*(Math.sqrt(s)+s)/radiusRatio**(4*a/Math.PI);
}
/** One girth-weld bead of height h (m) in bore D (m), referenced to the pipe velocity: a thin sharp-edged ring
 *  orifice (Idelchik diagram 4-14), plus in laminar flow the Poiseuille excess over the bead width w (m). */
export function weldBeadK(h,D,Re,w){
  if(!(h>0))return 0;
  const d=D-2*h,area=(d/D)**2,open=1-area,orifice=(open+0.707*open**0.375)**2/area**2;
  return orifice+(Re<2300?64/Re*(w/D)*((D/d)**4-1):0);
}
/** Spalding's law of the wall: u⁺ for a given y⁺ (κ = 0.41, B = 5.0), by bisection. */
export function spaldingUPlus(yPlus){
  const k=0.41,e=Math.exp(-k*5),y=u=>u+e*(Math.exp(k*u)-1-k*u-(k*u)**2/2-(k*u)**3/6);
  let lo=0,hi=60;for(let i=0;i<80;i++){const mid=(lo+hi)/2;if(y(mid)<yPlus)lo=mid;else hi=mid;}return (lo+hi)/2;
}
/** Local velocity at height y (m) above the wall, as a fraction of the mean velocity. */
export function wallVelocityRatio(y,D,Re,f){
  if(!(y>0))return 0;
  if(Re<2300){const s=Math.min(1,2*y/D);return 2*(2*s-s*s);}
  const friction=Math.sqrt(f/8),centre=1+1.33*Math.sqrt(f);
  return Math.min(centre,spaldingUPlus(y/D*Re*friction)*friction);
}
const regimeOf=Re=>Re<2300?'laminar':Re<4000?'transitional':'turbulent';
export const REGIME_NAMES=Object.freeze({laminar:'層流',transitional:'過渡流',turbulent:'紊流'});

/** Resolves the medium against the pipe OD: bore, velocity, Re, per-weld loss, and what to warn about. */
export function analyzeMedium(raw,od){
  const m=normalizeMedium(raw),errors=[],warnings=[],liquid=isLiquid(m.kind);
  if(m.kind==='none')return {kind:'none',valid:false,liquid:false,errors,warnings,medium:m};
  const stdWall=finite(od)?standardWall(od):null,wall=m.wall??stdWall;
  if(!(od>0))errors.push({field:'od',message:'先在「彎頭材料」填管外徑。'});
  else if(wall===null)errors.push({field:'wall',message:'這個外徑不是 ASME 標準管，請填管壁厚。'});
  else if(!(wall>0&&wall<od/2))errors.push({field:'wall',message:'管壁厚須大於 0，且小於外徑的一半。'});
  const idMm=od>0&&wall>0&&wall<od/2?od-2*wall:NaN,limit=beadLimit(wall),bead=m.bead??limit;
  if(Number.isFinite(idMm)&&!(bead>=0&&bead<idMm/4))errors.push({field:'bead',message:'焊道內凸須在 0 到內徑的 1/4 之間。'});
  if(liquid){
    if(!(m.flow>0&&m.flow<1e6))errors.push({field:'flow',message:'請填流量（m³/h，大於 0）。'});
    if(!(m.density>=300&&m.density<=3000))errors.push({field:'density',message:'密度須在 300–3000 kg/m³。'});
    if(!(m.viscosity>=0.1&&m.viscosity<=1e6))errors.push({field:'viscosity',message:'黏度須在 0.1–1,000,000 mPa·s。'});
  }else if(!(m.pellet>=0.5&&m.pellet<=30))errors.push({field:'pellet',message:'粒徑須在 0.5–30 mm。'});
  const base={kind:m.kind,liquid,medium:m,od,wall,stdWall,idMm,beadLimit:limit,bead,finish:m.finish,codeBead:m.bead==null};
  if(errors.length)return {...base,valid:false,errors,warnings};
  const D=idMm/1000,exposed=m.finish==='ground'?0:bead,width=(3*bead+3)/1000;
  if(m.finish==='ground')warnings.push({level:'info',field:'finish',message:'假設每道焊口內面都能磨平或以氬焊打底控制平順；做不到的焊口（例如封閉焊口），請改選原焊並填預期內凸。'});
  else if(m.bead==null)warnings.push({level:'info',field:'bead',message:`焊道內凸先用規範上限 ${show(bead,1)} mm；填入實際或承諾的值（例如氬焊打底控制在 1 mm 以內），結果會更接近實況。`});
  if(!liquid){
    const ratio=bead/m.pellet;
    if(exposed>0&&ratio>=0.1)warnings.push({level:'warn',field:'finish',message:`焊道內凸 ${show(bead,1)} mm，約粒徑的 ${show(ratio*100,0)}%：粒子撞上焊道會碎成粉屑。建議可及焊口內面磨平，其餘以氬焊打底控制內凸，並控制對口錯邊。`});
    warnings.push({level:'info',message:'彎頭外背是粒子撞擊與磨耗最集中的位置，拉絲也主要發生在彎頭的滑動段；同樣能接通時，總轉角越小越好。'});
    return {...base,valid:true,errors,warnings,D,exposedBead:exposed,pellet:m.pellet,pelletRatio:ratio};
  }
  const area=Math.PI*D*D/4,velocity=m.flow/3600/area,mu=m.viscosity/1000,Re=m.density*velocity*D/mu,roughness=PIPE_MATERIALS[m.material].roughness;
  const f=churchillFriction(Re,roughness/idMm),q=m.density*velocity**2/2,perMeter=f/D*q;
  const weldK=weldBeadK(exposed/1000,D,Re,width),asWeldedK=weldBeadK(bead/1000,D,Re,width),regime=regimeOf(Re);
  if(velocity>3)warnings.push({level:'warn',field:'flow',message:`流速 ${show(velocity)} m/s，高於一般常用的 1–3 m/s；焊道與彎頭外背的沖蝕風險提高。`});
  if(regime==='transitional')warnings.push({level:'info',message:'雷諾數在 2300–4000 的過渡流區，壓損估算誤差較大。'});
  if(regime==='laminar'&&exposed>0)warnings.push({level:'warn',field:'finish',message:`${MEDIUM_KINDS[m.kind].label}在這個流速為層流：焊道兩側角落流速很慢，會附著或固化的物料容易從這裡開始積料。建議焊道內面磨平或以氬焊打底控制平順。`});
  return {...base,valid:true,errors,warnings,D,exposedBead:exposed,roughness,velocity,Re,regime,f,q,perMeter,weldK,asWeldedK,
    weldLength:weldK*D/f,asWeldedLength:asWeldedK*D/f,beadVelocity:wallVelocityRatio(bead/1000,D,Re,f)};
}

/** Per-route totals for one analysed medium. Components count as straight pipe; bolted joints carry no bead. */
export function routeFlow(plan,ctx){
  if(!plan?.valid||!plan.elements?.length||!ctx?.valid)return null;
  let straight=0;const bends=[];
  for(const e of plan.elements){
    if(e.type==='elbow'){straight+=(e.tangentBefore??0)+(e.tangentAfter??0);bends.push({id:e.id,angle:e.angle,radiusRatio:e.radius/ctx.idMm});}
    else straight+=e.length??0;
  }
  for(const j of plan.joints??[])straight+=j.amount??0;
  const welds=plan.joints?plan.joints.filter(j=>(j.kind??'weld')==='weld').length:plan.jointCount,straightM=straight/1000;
  const out={kind:ctx.kind,liquid:ctx.liquid,straight:straightM,bends,welds,bendCount:bends.length,totalTurn:sum(bends.map(b=>b.angle)),
    minRadiusRatio:bends.length?Math.min(...bends.map(b=>b.radiusRatio)):null};
  if(!ctx.liquid)return {...out,exposedWelds:ctx.exposedBead>0?welds:0};
  for(const b of bends)b.K=bendLossK(b.angle,b.radiusRatio,ctx.f);
  const K={pipe:ctx.f*straightM/ctx.D,bends:sum(bends.map(b=>b.K)),welds:welds*ctx.weldK};K.total=K.pipe+K.bends+K.welds;
  const dp=Object.fromEntries(Object.entries(K).map(([k,v])=>[k,v*ctx.q]));
  return {...out,K,dp,equivalentLength:K.total*ctx.D/ctx.f};
}
/** Plan minus base: pressure (Pa) and its equivalent straight pipe (m) for liquids; turns and welds for pellets. */
export function compareFlow(base,plan,ctx){
  if(!base||!plan)return null;
  const turn=plan.totalTurn-base.totalTurn,welds=plan.welds-base.welds,bends=plan.bendCount-base.bendCount;
  if(!ctx.liquid)return {turn,welds,bends,exposedWelds:plan.exposedWelds-base.exposedWelds};
  const parts=Object.fromEntries(['pipe','bends','welds','total'].map(k=>[k,plan.dp[k]-base.dp[k]]));
  return {turn,welds,bends,dp:parts,equivalentLength:parts.total/ctx.perMeter,ratio:base.dp.total>0?parts.total/base.dp.total:null};
}

const beadState=ctx=>ctx.exposedBead>0?`內凸 ${show(ctx.bead,1)} mm`:ctx.finish==='ground'?'內面磨平':'與管壁齊平';
export function mediumSummary(ctx){
  if(!ctx||ctx.kind==='none')return '未指定（選填，用來向業主說明焊口與彎頭的影響）';
  const name=MEDIUM_KINDS[ctx.kind].label;
  if(!ctx.valid)return `${name} · 尚缺資料`;
  if(!ctx.liquid)return `${name} · 粒徑 ${show(ctx.pellet,1)} mm · 焊道${beadState(ctx)}`;
  return `${name} · ${show(ctx.medium.flow,2)} m³/h · ${show(ctx.velocity)} m/s · ${REGIME_NAMES[ctx.regime]}`;
}
/** One quiet line for a route card. */
export function planFlowLine(flow,baseFlow,ctx){
  if(!flow||!ctx?.valid)return '';
  if(!ctx.liquid){
    const turn=`總轉角 ${show(flow.totalTurn,1)}°${baseFlow&&flow!==baseFlow?`（原接法 ${show(baseFlow.totalTurn,1)}°）`:''}`;
    return `${turn} · ${flow.exposedWelds?`${flow.exposedWelds} 道焊口的內凸會被粒子撞上`:`焊口${beadState(ctx)}`}`;
  }
  if(!baseFlow||flow===baseFlow)return `壓損 ${pressureText(flow.dp.total)}（比較基準）`;
  const d=compareFlow(baseFlow,flow,ctx),scale=Math.max(Math.abs(flow.dp.total),Math.abs(d.dp.total));
  return `壓損 ${pressureText(flow.dp.total,scale)} · 比原接法 ${signedPressure(d.dp.total,scale)}（≈ ${d.dp.total>=0?'多':'少'} ${show(Math.abs(d.equivalentLength),1)} m 直管）`;
}
