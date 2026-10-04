import {positioningFrame} from './model-positioning.js';
import {mainAxisSurfaceDatum} from './field-datums.js';
import {elbowEntryDimensions} from './elbow-input.js';
import {resolveElbowAlignment,elbowAlignmentLabel} from './elbow-axis.js';

const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const unit=v=>{const length=Math.hypot(...v);return length>1e-12&&Number.isFinite(length)?v.map(x=>x/length):null;};
const fmt=value=>Number(value.toFixed(1)).toString();
const wrap=value=>((value%360)+360)%360;

/** Eye directions point from the joint towards the camera. The local outward
 * normal keeps the contact on the facing hemisphere; the renderer must still
 * check visibility against the finite host (another elbow section can hide it).
 * Score is the branch axis's unit projected length in the camera plane.
 */
export function jointViewCandidates(params){
  const frame=positioningFrame(params);if(!frame)return null;
  const candidates=[];
  for(const t of [-1,1])for(const s of [-1,1]){
    const direction=unit(frame.normal.map((v,i)=>v+.85*t*frame.tangent[i]+.45*s*frame.side[i]));
    const normalDot=dot(frame.normal,direction);
    const up=unit(frame.normal.map((v,i)=>v-normalDot*direction[i]));
    const branchDot=dot(frame.direction,direction);
    candidates.push({direction,up,score:Math.sqrt(Math.max(0,1-branchDot*branchDot))});
  }
  return candidates.sort((a,b)=>b.score-a.score);
}

function clockText(value,elbow=false){
  const clock=wrap(Number(wrap(value).toFixed(1))),landmarks=elbow?['外背','左側','內腹','右側']:['上側','左側','下側','右側'];
  const nearest=Math.round(clock/90),delta=Math.abs(clock-nearest*90);
  const label=delta<1e-8?landmarks[nearest%4]:elbow
    ?['外背偏左','內腹偏左','內腹偏右','外背偏右'][Math.floor(clock/90)]
    :['左上','左下','右下','右上'][Math.floor(clock/90)];
  return `${label} ${fmt(clock)}°`;
}

/** Short field readbacks describe the physical outside-surface entry, never
 * the straight kernel's virtual centre-plane J. Coaxial elbows resolve their
 * derived location before showing S-back and side.
 */
export function modelPointReadback(params){
  if(!positioningFrame(params))return null;
  const type=params.hostType??'straight';
  if(type==='straight'){
    const datum=mainAxisSurfaceDatum(params);if(!datum)return null;
    return {position:`A 起 ${fmt(datum.axialPosition)} mm · ${clockText(datum.clockAngle)}${params.offset?` · 偏心 ${fmt(params.offset)} mm`:''}`,angle:`與主管軸 ${fmt(params.angle)}°`};
  }
  if(type==='elbow'){
    const p=resolveElbowAlignment(params),entry=elbowEntryDimensions(p);
    return {position:`A 起 S背 ${fmt(entry.back)} mm · ${clockText(p.surfaceClock,true)}`,angle:p.elbowAlignment&&p.elbowAlignment!=='free'?(p.elbowAlignment.endsWith('-axis')?`沿 ${p.elbowAlignment.startsWith('a-')?'A':'B'} 端中心線`:elbowAlignmentLabel(p)):`與截面切線 ${fmt(p.angle)}° · 側轉 ${fmt(p.branchSwivel)}°`};
  }
  return {position:`A 起 X ${fmt(params.jointPosition)} mm · ${clockText(params.surfaceClock)}`,angle:`與母線 ${fmt(params.angle)}° · 側轉 ${fmt(params.branchSwivel)}°`};
}
