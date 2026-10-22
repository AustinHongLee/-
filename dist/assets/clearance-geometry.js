// Convex support geometry in mm. Sweeps cover the complete translation, not
// discrete animation frames. Curved tubes use conservative capsule envelopes.
export const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,k)=>a.map(v=>v*k),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),length=a=>Math.hypot(...a);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],neg=a=>mul(a,-1);
export const unit=a=>mul(a,1/length(a));
export function cylinderShape(a,d,span,radius){
  return {support:v=>{const t=dot(v,d),perp=sub(v,mul(d,t)),n=length(perp),base=add(a,mul(d,t>=0?span:0));return n>1e-12?add(base,mul(perp,radius/n)):base;}};
}
export const boxShape=(min,max)=>({support:v=>v.map((x,i)=>x>=0?max[i]:min[i])});
export const capsuleShape=(a,b,radius)=>({support:v=>add(dot(a,v)>dot(b,v)?a:b,mul(v,radius/Math.max(length(v),1e-30)))});
export const shiftedShape=(shape,offset)=>({support:v=>add(shape.support(v),offset)});
export const sweptShape=(shape,offset)=>({support:v=>add(shape.support(v),dot(v,offset)>=0?offset:[0,0,0])});
export function shapeBounds(shape){const axes=[[1,0,0],[0,1,0],[0,0,1]];return {min:axes.map((v,i)=>shape.support(neg(v))[i]),max:axes.map((v,i)=>shape.support(v)[i])};}
export function convexClash(one,two){
  const b1=one.bounds??shapeBounds(one),b2=two.bounds??shapeBounds(two);
  if(b1.min.some((v,i)=>v>b2.max[i]+1e-8||b1.max[i]<b2.min[i]-1e-8))return false;
  const point=v=>sub(one.support(v),two.support(neg(v))),scale=Math.max(...b1.max.map((v,i)=>v-b1.min[i]),...b2.max.map((v,i)=>v-b2.min[i]),1),eps=scale*1e-10;
  let dir=sub(add(b1.min,b1.max),add(b2.min,b2.max));if(length(dir)<eps)dir=[1,0,0];
  let simplex=[point(dir)];dir=neg(simplex[0]);
  const line=(a,b)=>{const ab=sub(b,a),ao=neg(a);if(dot(ab,ao)>0){simplex=[a,b];dir=cross(cross(ab,ao),ab);if(length(dir)<eps*eps)return true;}else{simplex=[a];dir=ao;}return false;};
  const triangle=(a,b,c)=>{const ab=sub(b,a),ac=sub(c,a),ao=neg(a),abc=cross(ab,ac);
    if(dot(cross(abc,ac),ao)>0){if(dot(ac,ao)>0){simplex=[a,c];dir=cross(cross(ac,ao),ac);return false;}return line(a,b);}
    if(dot(cross(ab,abc),ao)>0)return line(a,b);
    if(Math.abs(dot(abc,ao))<eps*scale*scale)return true;
    if(dot(abc,ao)>0){simplex=[a,b,c];dir=abc;}else{simplex=[a,c,b];dir=neg(abc);}return false;};
  for(let i=0;i<64;i++){
    if(length(dir)<eps)return true;dir=unit(dir);const a=point(dir);if(dot(a,dir)<-eps)return false;
    if(simplex.length===1){if(line(a,simplex[0]))return true;continue;}
    if(simplex.length===2){if(triangle(a,simplex[0],simplex[1]))return true;continue;}
    const [b,c,d]=simplex,ab=sub(b,a),ac=sub(c,a),ad=sub(d,a),ao=neg(a),abc=cross(ab,ac),acd=cross(ac,ad),adb=cross(ad,ab);
    if(dot(abc,ao)>0){if(triangle(a,b,c))return true;continue;}
    if(dot(acd,ao)>0){if(triangle(a,c,d))return true;continue;}
    if(dot(adb,ao)>0){if(triangle(a,d,b))return true;continue;}return true;
  }
  return true;// uncertain convergence stays a possible clash
}
export function planeClash(shape,axis,side,position){const v=[0,0,0];v[axis]=side==='max'?1:-1;return dot(shape.support(v),v)>=position*v[axis]-1e-8;}
