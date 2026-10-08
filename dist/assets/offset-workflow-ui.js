import {esc,fmt} from './offset-exports.js';
import {routeElbowFrame,PROCESS_NAMES,processName} from './offset-planner.js';
import {partName,componentIcon} from './offset-component-ui.js';

export function assemblySVG(plan,{interactive=false,selected=null}={}){
  if(!plan?.valid)return '';
  const project=q=>[(q[0]-q[1])*.866,-(q[0]+q[1])*.5-q[2]],curves=plan.elements.map(e=>e.type!=='elbow'?[e.start,e.finish]:[e.start,...Array.from({length:49},(_,i)=>routeElbowFrame(e,i/48).center),e.finish]);
  const points=curves.flat().concat([plan.context.ports.a,plan.context.ports.b]).map(project),min=[0,1].map(k=>Math.min(...points.map(q=>q[k]))),max=[0,1].map(k=>Math.max(...points.map(q=>q[k]))),scale=Math.min(550/Math.max(max[0]-min[0],1),205/Math.max(max[1]-min[1],1));
  const at=q=>{const t=project(q);return [75+(550-(max[0]-min[0])*scale)/2+(t[0]-min[0])*scale,65+(205-(max[1]-min[1])*scale)/2+(t[1]-min[1])*scale];},xy=q=>q.map(v=>fmt(v)).join(' '),path=points=>points.map((q,i)=>(i?'L':'M')+xy(at(q))).join(' ');
  const parts=plan.elements.map((e,i)=>{
    const center=at(e.type!=='elbow'?e.start.map((v,k)=>(v+e.finish[k])/2):routeElbowFrame(e,.5).center),color=e.id===selected?'#df963b':e.type==='component'?'#bb8136':e.type==='pipe'?'#61788c':'#25809d';
    const symbol=e.type==='component'?componentIcon(e.kind).replace('viewBox="0 0 100 62"',`x="${fmt(center[0]-36)}" y="${fmt(center[1]-36)}" width="72" height="45" style="color:${color}"`):'';
    return `<g${interactive?` class="assembly-piece" data-piece="${esc(e.id)}" role="button" tabindex="0" aria-label="加工 ${esc(e.id)} ${esc(partName(e))}"`:''}>${interactive?`<rect x="${fmt(center[0]-48)}" y="${fmt(center[1]-43)}" width="96" height="90" fill="transparent"/>`:''}<path d="${path(curves[i])}" fill="none" stroke="#173a50" stroke-width="22" stroke-linejoin="round" stroke-linecap="round"/><path d="${path(curves[i])}" fill="none" stroke="${color}" stroke-width="17" stroke-linejoin="round" stroke-linecap="round"/>${symbol}<text x="${fmt(center[0])}" y="${fmt(center[1]+(e.type==='elbow'?-24:32))}" text-anchor="middle">${esc(e.id)}${e.type==='component'?' '+esc(partName(e)):e.type==='elbow'?' 彎頭':''}</text></g>`;
  }).join('');
  const ports=['a','b'].map(end=>{const q=at(plan.context.ports[end]);return `<circle cx="${fmt(q[0])}" cy="${fmt(q[1])}" r="12" fill="#fff" stroke="#173a50" stroke-width="3"/><text x="${fmt(q[0]+(end==='a'?-18:18))}" y="${fmt(q[1]+5)}" text-anchor="${end==='a'?'end':'start'}" font-weight="bold">${end.toUpperCase()} 口</text>`;}).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 330" role="${interactive?'group':'img'}" aria-label="所選接法，${plan.jointCount} 個焊口，${plan.elbows.length} 個彎頭，${plan.pipes.length} 段直管"><g font-family="Arial,Microsoft JhengHei" font-size="16" fill="#27465e">${parts}${ports}<g stroke="#7c93a6" stroke-width="1.5"><path d="M54 296l30-16M54 296l-30-16M54 296v-31"/></g><g font-size="11" fill="#71889b"><text x="87" y="281">X 前</text><text x="4" y="281">Y 左</text><text x="47" y="259">Z 上</text></g><text x="650" y="312" text-anchor="end" font-size="12" fill="#71889b">組立示意 · 尺寸依加工單</text></g></svg>`;
}

export function pipeFabricationSVG(e,p){
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 240" role="img" aria-label="${esc(e.id)} 直管，先下料 ${fmt(e.blankLength)}，修磨至成品 ${fmt(e.length)} 毫米"><g font-family="Arial,Microsoft JhengHei" fill="#27465e" text-anchor="middle"><rect x="100" y="72" width="480" height="76" rx="5" fill="#e7eff4" stroke="#61788c" stroke-width="2"/><path d="M116 60v103M564 60v103" stroke="#25809d" stroke-width="3"/><path d="M100 181h480M100 172v18M580 172v18" stroke="#61788c"/><text x="340" y="207" font-size="17">先下料 ${fmt(e.blankLength)} mm</text><text x="340" y="117" font-size="24" font-weight="bold">成品 ${fmt(e.length)} mm</text><text x="128" y="45" font-size="13">起端修磨 ${fmt(p.trimA)} mm</text><text x="552" y="45" font-size="13">終端修磨 ${fmt(p.trimB)} mm</text><text x="340" y="232" font-size="11" fill="#71889b">留料範圍為示意 · 按成品尺寸修磨</text></g></svg>`;
}

export function materialRows(plan){
  if(!plan)return '';
  return plan.elements.map(e=>`<tr><td>${esc(e.id)}<small>${esc(partName(e))}</small></td><td>${e.type==='component'?`<strong>${fmt(e.length)}</strong> mm<small>實測組立總長</small>`:e.type==='pipe'?`<strong>${fmt(e.length)}</strong> mm<small>先下料 ${fmt(e.blankLength)} mm</small>`:`<strong>${fmt(e.angle,4)}°</strong><small>${esc(processName(e))}</small>`}</td></tr>`).join('');
}

export function cutClockSVG(e,od,selected=0){
 const count=e.stations.length-1,pick=Number.isInteger(selected)&&selected>=0&&selected<=count?selected:0,index=pick%count,s=e.stations[pick],at=clock=>{const a=clock*Math.PI/180;return [155+70*Math.sin(a),132-70*Math.cos(a)];},q=at(s.clock);
 const marks=e.stations.slice(0,-1).map((v,i)=>{const p=at(v.clock);return `<g class="clock-station" role="button" tabindex="0" data-station="${i}" aria-label="周向 ${fmt(v.clock)} 度，端面沿弧 ${fmt(v.kept+(e.tangent??0))} 毫米"><circle cx="${fmt(p[0])}" cy="${fmt(p[1])}" r="11" fill="transparent"/><circle cx="${fmt(p[0])}" cy="${fmt(p[1])}" r="${i===index?7:3.5}" fill="${i===index?'#c7832c':'#25809d'}"/></g>`;}).join('');
 return `<svg class="cut-clock" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 310 325" role="group" aria-label="彎頭端面互動分點，點圓周看捲尺量距"><g font-family="Arial,Microsoft JhengHei" font-size="12" fill="#274052"><text x="155" y="20" text-anchor="middle">從保留端，朝彎頭內看</text><circle cx="155" cy="132" r="70" fill="white" stroke="#34576f" stroke-width="2"/><path d="M85 132h140M155 62v140" stroke="#b9cbd7" stroke-dasharray="3 3"/><text x="155" y="47" text-anchor="middle">0° 外背</text><text x="245" y="136">90° 右</text><text x="65" y="136" text-anchor="end">270° 左</text><text x="155" y="224" text-anchor="middle">180° 內腹</text><path d="M155 132L${fmt(q[0])} ${fmt(q[1])}" stroke="#c7832c" stroke-width="2"/>${marks}<text x="155" y="252" text-anchor="middle" fill="#71889b" font-size="11">點圓周選分點 · 沿周長 ${fmt(s.around)} mm</text><text x="155" y="279" text-anchor="middle" font-size="15" font-weight="600">${fmt(s.clock)}° · 端面沿弧 ${fmt(s.kept+(e.tangent??0))} mm</text><text x="155" y="306" text-anchor="middle" font-size="11" fill="#71889b">弧長 ${fmt(s.kept)} ＋直段 ${fmt(e.tangent??0)} mm</text></g></svg>`;
}
