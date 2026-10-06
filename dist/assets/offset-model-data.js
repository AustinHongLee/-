import {add,mul} from './offset-geometry.js';
import {cross} from './offset-ports.js';
import {routeElbowFrame} from './offset-planner.js';

// Use each validated part's actual mating faces, including its factory straight ends.
export function routeSurfaceParts(plan,piece='offset'){
  if(!plan?.valid)return [];
  return plan.elements.filter(e=>piece==='offset'||e.id===piece).map(e=>{
    let frames;
    if(e.type!=='elbow'){
      const axis=e.direction,reference=Math.abs(axis[2])<.9?[0,0,1]:[0,1,0];
      const perpendicular=cross(axis,reference),outside=mul(perpendicular,1/Math.hypot(...perpendicular));
      const frame={tangent:axis,outside,side:cross(axis,outside)};
      frames=[{...frame,center:e.start},{...frame,center:e.finish}];
    }else{
      frames=Array.from({length:49},(_,i)=>routeElbowFrame(e,i/48));
      if(e.tangentBefore>0)frames.unshift({...frames[0],center:e.start});
      if(e.tangentAfter>0)frames.push({...frames.at(-1),center:e.finish});
    }
    const middle=e.type!=='elbow'?add(e.start,mul(e.direction,e.length/2)):routeElbowFrame(e,.5).center;
    return {id:e.id,type:e.type,element:e,frames,middle};
  });
}
