import {computePortOffset,portCenterline,portSurfaceFrame} from './offset-ports.js';
import {validateComponents} from './offset-components.js';
// Two-elbow butt-weld assembly; legacy mode uses parallel theoretical intersections.
// All lengths are mm; travel/run refer to the virtual tangent intersections.
// Cut elbow model: circular torus, no straight tangents at either donor end.
export const OFFSET_REFERENCES = [
  ['Pipe Trades Pro：Offset、Take-out 與彎頭切角', 'https://m.media-amazon.com/images/I/B1OaucCUk7S.pdf'],
  ['Benkan：彎頭尺寸表（PDF 第 8 頁）', 'https://www.benkankikoh.com/en/wp-content/uploads/2016/07/PipeFittings-Catalogue.pdf'],
  ['LANL：管口對位與 cold pulling 說明（附錄 F，第 127 頁起）', 'https://engstandards.lanl.gov/esm/pressure_safety/Section%20REF-3-R0.pdf']
];
export const DEFAULT_OFFSET = Object.freeze({
  layout:'planar', solve:'angle', rise:500, roll:0, run:500, angle:45, od:114.3,
  stations:12, aKind:'cut', bKind:'cut', aRadius:152.4, bRadius:152.4,
  aDonor:90, bDonor:90, aFactoryAngle:45, bFactoryAngle:45,
  aTakeout:63.5, bTakeout:63.5, aGap:0, bGap:0,
  basis:'intersections',datum:'center',aAxis:'x+',bAxis:'x-',
  aAxisX:1,aAxisY:0,aAxisZ:0,bAxisX:-1,bAxisY:0,bAxisZ:0,
  aShiftX:0,aShiftY:0,aShiftZ:0,bShiftX:0,bShiftY:0,bShiftZ:0,
  aPortGap:0,bPortGap:0,trimA:0,trimB:0,minStraight:0,
  aTangent:0,bTangent:0,aRadiusMethod:'radius',bRadiusMethod:'radius',
  aMeasuredArc:(152.4+114.3/2)*Math.PI/2,bMeasuredArc:(152.4+114.3/2)*Math.PI/2,
  planPreference:'welds',planMaxElbows:4,planMaxJoints:8,planMinPipe:100,
  planExtraRadius:152.4,planExtraDonor:90,planExtraGap:0,
  planAOtherTangent:0,planBOtherTangent:0,planExtraInTangent:0,planExtraOutTangent:0,
  planSpaceLimit:'none',planMargin:100,components:Object.freeze([])
});
const rad = n => n*Math.PI/180;
const deg = n => n*180/Math.PI;
const finite = v => typeof v==='number' && Number.isFinite(v);
export const add = (a,b) => a.map((v,i)=>v+b[i]);
export const mul = (a,k) => a.map(v=>v*k);
export const dot = (a,b) => a.reduce((s,v,i)=>s+v*b[i],0);

export function elbowCutStations(radius,od,angle,count=12,donor=90) {
  if(![radius,od,angle,donor].every(finite)||od<=0||radius<=od/2||angle<=0||angle>donor+1e-8||donor>90||![4,8,12,24].includes(count))throw new Error('彎頭切角尺寸或分點數無效。');
  const theta=rad(angle), original=rad(donor),r=od/2;
  return Array.from({length:count+1},(_,i)=>{
    const clock=i*360/count, phi=rad(clock), rho=radius+r*Math.cos(phi);
    return {index:i,clock,around:r*phi,kept:rho*theta,removed:rho*Math.max(0,original-theta),
      point:[rho*Math.sin(theta),r*Math.sin(phi),radius-rho*Math.cos(theta)]};
  });
}

export function computeOffset(raw={}) {
  const p={...DEFAULT_OFFSET,...raw}, errors=[];
  const componentErrors=validateComponents(p.components);
  if(componentErrors.length)return {valid:false,params:p,errors:componentErrors.map(message=>({field:'components',message,code:'input'}))};
  if(p.components.length&&p.basis!=='ports')return {valid:false,params:p,errors:[{field:'basis',message:'指定閥／法蘭請使用既有端口量測模式。',code:'input'}]};
  if(p.basis==='ports')return computePortOffset(p,elbowCutStations);
  const error=(field,message,details={})=>errors.push({field,message,...details});
  if(p.basis!=='intersections')error('basis','請選端口量測或理論交點模式。');
  if(!['planar','rolling'].includes(p.layout))error('layout','請選平面或立體偏移。');
  if(!['angle','run'].includes(p.solve))error('solve','請選已知角度或已知前進距離。');
  if(![4,8,12,24].includes(p.stations))error('stations','請選 4／8／12／24 分點。');
  if(!finite(p.od)||p.od<=0||p.od>10000)error('od','實際外徑須大於 0，且不超過 10000 mm。');
  for(const key of ['rise',...(p.layout==='rolling'?['roll']:[])])if(!finite(p[key])||Math.abs(p[key])>1e7)error(key,'請填有限的偏移尺寸（絕對值不超過 10000000 mm）。');
  if(p.solve==='angle'&&(!finite(p.angle)||p.angle<=0||p.angle>90))error('angle','彎頭角度須大於 0 且不超過 90°。');
  if(p.solve==='run'&&(!finite(p.run)||p.run<0||p.run>1e7))error('run','理論交點前進距離須為 0–10000000 mm。');
  const rise=p.rise,roll=p.layout==='rolling'?p.roll:0,offset=Math.hypot(rise,roll);
  if(finite(offset)&&offset===0)error('rise','偏移量不能為 0；平面模式請填高低差／側移量。');
  if(errors.length)return {valid:false,params:p,errors};
  const theta=p.solve==='angle'?rad(p.angle):Math.atan2(offset,p.run);
  const angle=deg(theta),run=p.solve==='run'?p.run:(Math.abs(angle-90)<1e-10?0:offset/Math.tan(theta));
  const travel=Math.hypot(run,offset), direction=[run/travel,roll/travel,rise/travel];
  if(!finite(travel)||travel>1e9||theta===0){error('angle','角度過小或尺寸過大，理論斜距超過 1000000000 mm。');return {valid:false,params:p,errors};}
  const elbows={};
  for(const end of ['a','b']) {
    const label=end.toUpperCase(),kind=p[end+'Kind'],gap=p[end+'Gap'];
    if(!['factory','cut'].includes(kind)){error(end+'Kind',`${label} 端請選現成或切角彎頭。`);continue;}
    if(!finite(gap)||gap<0||gap>1e6)error(end+'Gap',`${label} 端焊口間隙須為 0–1000000 mm，空白不代表 0。`);
    let takeout,radius,stations=[];
    if(kind==='factory') {
      takeout=p[end+'Takeout'];
      if(!finite(takeout)||takeout<=0||takeout>1e6)error(end+'Takeout',`${label} 端請填實測／型錄中心至接合端面尺寸 Ta／Tb（大於 0）。`);
      const factory=p[end+'FactoryAngle'];
      if(!finite(factory)||Math.abs(factory-angle)>1e-7)error(end+'FactoryAngle',`${label} 端現成彎頭角度須與所需 ${angle.toFixed(4)}° 一致；可改用切角彎頭。`,{code:'fixed-angle',requiredAngle:angle,availableAngle:factory});
      radius=takeout/Math.tan(theta/2); // preview-only equivalent circle, never cut marks
    } else {
      radius=p[end+'Radius'];
      const donor=p[end+'Donor'];
      if(!finite(radius)||radius<=p.od/2||radius>1e6)error(end+'Radius',`${label} 端中心線半徑 Rc 必須大於外徑一半，且不超過 1000000 mm。`);
      if(!finite(donor)||donor<=0||donor>90||donor+1e-8<angle)error(end+'Donor',`${label} 端原彎頭角度須介於所需角度與 90° 之間。`,finite(donor)&&donor>0&&donor<=90&&donor<angle?{code:'stock-angle',requiredAngle:angle,availableAngle:donor}:{});
      if(finite(radius)&&radius>p.od/2&&finite(donor)&&donor+1e-8>=angle&&donor<=90)stations=elbowCutStations(radius,p.od,angle,p.stations,donor);
      takeout=radius*Math.tan(theta/2);
    }
    elbows[end]={end:label,kind,gap,takeout,radius,donor:p[end+'Donor'],stations,theta,angle,
      innerArc:(radius-p.od/2)*theta,centerArc:radius*theta,outerArc:(radius+p.od/2)*theta};
  }
  if(errors.length)return {valid:false,params:p,errors};
  const faceDistance=travel-elbows.a.takeout-elbows.b.takeout;
  const cutLength=faceDistance-elbows.a.gap-elbows.b.gap;
  if(!finite(cutLength)||cutLength<=1e-6)error('run','兩端彎頭與焊口間隙已佔滿斜向距離，無法容納正長度直管；增加偏移／前進距離或更換彎頭。',{code:'route-unavailable',cutLength});
  const result={valid:errors.length===0,params:p,errors,basis:'intersections',rise,roll,offset,angle,theta,run,travel,direction,blankLength:cutLength,
    rollAngle:deg(Math.atan2(roll,rise)),faceDistance,cutLength,elbows,
    intersections:{a:[0,0,0],b:[run,roll,rise]},plane:[0,roll/offset,rise/offset]};
  return result;
}

// Actual tangent-end centreline points; B has opposite curvature to A.
export function offsetCenterline(result,end,fraction) {
  if(!result.valid||!['a','b'].includes(end)||!finite(fraction)||fraction<0||fraction>1)throw new Error('模型參數無效。');
  if(result.basis==='ports')return portCenterline(result,end,fraction);
  const e=result.elbows[end],x=[1,0,0],n=result.plane,t=result.theta;
  if(end==='a')return add(add(mul(x,-e.takeout+e.radius*Math.sin(t*fraction)),mul(n,e.radius*(1-Math.cos(t*fraction)))),result.intersections.a);
  const remaining=t*(1-fraction);
  return add(add(mul(x,e.takeout-e.radius*Math.sin(remaining)),mul(n,-e.radius*(1-Math.cos(remaining)))),result.intersections.b);
}

export function offsetSurfaceFrame(result,end,fraction) {
  if(result.basis==='ports')return portSurfaceFrame(result,end,fraction);
  const beta=result.theta*(end==='a'?fraction:1-fraction),sign=end==='a'?1:-1;
  const tangent=add([Math.cos(beta),0,0],mul(result.plane,Math.sin(beta)));
  const outside=mul(add([Math.sin(beta),0,0],mul(result.plane,-Math.cos(beta))),sign);
  const side=[0,result.plane[2],-result.plane[1]];
  return {center:offsetCenterline(result,end,fraction),tangent,outside,side:mul(side,sign)};
}
