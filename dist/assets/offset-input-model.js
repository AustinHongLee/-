import {AXIS_OPTIONS,cross} from './offset-ports.js';

const vector=q=>Array.isArray(q)&&q.length===3&&q.every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e7);
const add=(a,b)=>a.map((v,i)=>v+b[i]);
export const INPUT_CAMERA_VIEWS=Object.freeze({iso:{sight:[1,-1,.85],up:[0,0,1]},front:{sight:[0,-1,0],up:[0,0,1]},top:{sight:[0,0,1],up:[0,1,0]},side:{sight:[1,0,0],up:[0,0,1]}});

// Face centres and measurement marks are distinct datums. Never replace a missing
// dimension or direction with zero just to keep a model on screen.
export function inputSceneData(p,plan=null){
 if(!['center','marks'].includes(p.datum)||!['planar','rolling'].includes(p.layout))return null;
 const measured=[p.run,p.layout==='planar'?0:p.roll,p.rise];
 if(!vector(measured)||!Number.isFinite(p.od)||p.od<=0||p.od>10000)return null;
 const shifts={},axes={};
 for(const end of ['a','b']){
  shifts[end]=p.datum==='marks'?['X','Y','Z'].map(k=>p[end+'Shift'+k]):[0,0,0];
  const raw=p[end+'Axis']==='custom'?['X','Y','Z'].map(k=>p[end+'Axis'+k]):AXIS_OPTIONS[p[end+'Axis']];
  if(!vector(shifts[end])||!vector(raw)||Math.hypot(...raw)<1e-8)return null;
  axes[end]=raw.map(v=>v/Math.hypot(...raw));
 }
 const ports={a:shifts.a,b:add(measured,shifts.b)},marks={a:[0,0,0],b:measured};
 const corners=[marks.a,[measured[0],0,0],[measured[0],measured[1],0],marks.b];
 const dimensions=['run','roll','rise'].map((key,i)=>({key,axis:'XYZ'[i],amount:measured[i],start:corners[i],finish:corners[i+1]}));
 // Route geometry must belong to these exact faces; a stale solution is not a preview.
 const route=plan?.valid&&!plan.legacy&&Math.abs(plan.params?.od-p.od)<1e-7&&['a','b'].every(end=>vector(plan.context?.ports?.[end])&&Math.hypot(...ports[end].map((v,i)=>v-plan.context.ports[end][i]))<1e-5&&vector(plan.context?.axes?.[end])&&Math.hypot(...axes[end].map((v,i)=>v-plan.context.axes[end][i]*(end==='a'?1:-1)))<1e-7)?plan:null;
 return {ports,marks,axes,dimensions,marked:p.datum==='marks',od:p.od,route};
}

export function inputPortFrame(axis){
 const reference=Math.abs(axis[2])<.9?[0,0,1]:[0,1,0],normal=cross(axis,reference),n=Math.hypot(...normal),outside=normal.map(v=>v/n);
 return {tangent:axis,outside,side:cross(axis,outside)};
}

// Spread projected labels in two screen directions, with leaders back to their
// true 3D anchors. Merely shifting vertically can leave adjacent welds overlapping.
export function layoutInputLabels(items,width,height){
 const occupied=[{x:0,y:0,w:155,h:28},{x:0,y:height-70,w:78,h:70}],placements=[];
 const overlap=(a,b)=>Math.max(0,Math.min(a.x+a.w+4,b.x+b.w)-Math.max(a.x-4,b.x))*Math.max(0,Math.min(a.y+a.h+4,b.y+b.h)-Math.max(a.y-4,b.y));
 for(const item of items){
  const [px,py]=item.anchor,w=item.width,h=item.height;let best=null;
  for(let row=-4;row<=4;row++)for(let column=-3;column<=3;column++){
   const box={x:Math.max(5,Math.min(width-w-5,px-w/2+column*(w+9))),y:Math.max(5,Math.min(height-h-5,py-h-10+row*(h+9))),w,h};
   const cost=occupied.reduce((sum,r)=>sum+overlap(box,r),0)*1e4+Math.hypot(box.x+w/2-px,box.y+h/2-py)+(row>0?3:0);
   if(!best||cost<best.cost)best={...box,cost};
  }
  occupied.push(best);placements.push(best);
 }
 return placements;
}
