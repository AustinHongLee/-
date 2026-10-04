/** Subdivide an already triangulated UV surface on a shared zero-origin grid.
 * Clipping retains its outer/inner boundary edges; manufacturing contours are
 * neither sampled again nor moved. Returned vertices belong only to the display.
 */

const same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
const twiceArea=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);

function clip(polygon,axis,bound,keepAbove){
  const output=[];
  let previous=polygon.at(-1),previousInside=keepAbove?previous[axis]>=bound:previous[axis]<=bound;
  const append=point=>{if(!output.length||!same(output.at(-1),point))output.push(point);};
  for(const current of polygon){
    const inside=keepAbove?current[axis]>=bound:current[axis]<=bound;
    if(inside!==previousInside){
      const t=(bound-previous[axis])/(current[axis]-previous[axis]);
      const point=t===0?[...previous]:t===1?[...current]:[
        previous[0]+t*(current[0]-previous[0]),previous[1]+t*(current[1]-previous[1])];
      point[axis]=bound;append(point);
    }
    if(inside)append(current);
    previous=current;previousInside=inside;
  }
  if(output.length>1&&same(output[0],output.at(-1)))output.pop();
  return output;
}

function span(polygon,axis,step){
  let low=Infinity,high=-Infinity;
  for(const point of polygon){low=Math.min(low,point[axis]);high=Math.max(high,point[axis]);}
  const first=Math.floor(low/step),last=Math.ceil(high/step)-1;
  if(!Number.isSafeInteger(first)||!Number.isSafeInteger(last))throw new RangeError('UV grid indices exceed exact integer range.');
  return {first,last,count:Math.max(0,last-first+1)};
}

function strips(polygon,axis,step,visit){
  if(step===Infinity){visit(polygon);return;}
  const {first,last}=span(polygon,axis,step);
  for(let cell=first;cell<=last;cell++){
    const lower=clip(polygon,axis,cell*step,true);if(lower.length<3)continue;
    const piece=clip(lower,axis,(cell+1)*step,false);if(piece.length>=3)visit(piece);
  }
}

/** Emit triangles with UV spans no greater than xStep/yStep.
 * `points` is an array of [x,y]; `indices` may be an Array or integer TypedArray.
 * Positive grid steps and Infinity are supported. The fan preserves the input
 * winding, skips exactly zero-area pieces, and keeps representable tiny pieces.
 * Each emission receives independent arrays. Return the number emitted.
 */
export function forEachUVTriangle(points,indices,{xStep=Infinity,yStep=Infinity}={},emit){
  if(!Array.isArray(points)||points.some(point=>!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite)))throw new TypeError('UV points must be finite [x,y] pairs.');
  if(!indices||typeof indices.length!=='number'||indices.length%3!==0)throw new TypeError('UV indices must contain complete triangles.');
  for(const index of indices)if(!Number.isInteger(index)||index<0||index>=points.length)throw new RangeError('UV triangle index is out of range.');
  for(const step of [xStep,yStep])if(!(step>0)||step!==Infinity&&!Number.isFinite(step))throw new RangeError('UV grid steps must be positive or Infinity.');
  if(typeof emit!=='function')throw new TypeError('UV triangle emitter is required.');
  const steps=[xStep,yStep];let count=0;
  const fan=polygon=>{for(let i=1;i<polygon.length-1;i++){
    const a=polygon[0],b=polygon[i],c=polygon[i+1];
    if(twiceArea(a,b,c)===0)continue;
    emit([...a],[...b],[...c]);count++;
  }};
  for(let i=0;i<indices.length;i+=3){
    const triangle=[points[indices[i]],points[indices[i+1]],points[indices[i+2]]];
    if(twiceArea(...triangle)===0)continue;
    if(xStep===Infinity&&yStep===Infinity){fan(triangle);continue;}
    // Split first along the axis with fewer occupied strips, then inspect only
    // each strip's remaining-axis bounds, rather than its original empty bbox.
    const first=xStep===Infinity?1:yStep===Infinity?0:span(triangle,0,xStep).count<=span(triangle,1,yStep).count?0:1;
    strips(triangle,first,steps[first],piece=>strips(piece,1-first,steps[1-first],fan));
  }
  return count;
}
