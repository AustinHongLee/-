import test from 'node:test';
import assert from 'node:assert/strict';
import {forEachUVTriangle} from '../dist/assets/display-tessellation.js';
import {Shape,Path,ShapeGeometry,Vector2} from '../dist/assets/vendor/three.module.js';

const signedArea=([a,b,c])=>((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;
const area=triangles=>triangles.reduce((sum,triangle)=>sum+Math.abs(signedArea(triangle)),0);
const near=(a,b,tolerance=1e-10)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
const collect=(points,indices,options)=>{const triangles=[];const count=forEachUVTriangle(points,indices,options,(...triangle)=>triangles.push(triangle));assert.equal(count,triangles.length);return triangles;};
const checkSpans=(triangles,{xStep=Infinity,yStep=Infinity})=>{for(const triangle of triangles)for(const [axis,step] of [[0,xStep],[1,yStep]]){
  const values=triangle.map(point=>point[axis]);assert.ok(Math.max(...values)-Math.min(...values)<=step+1e-10);
}};

test('convex clipping conserves area and input winding across a two-axis grid',()=>{
  const points=[[-2.7,-1.4],[5.3,-.6],[.1,4.8]],indices=new Uint16Array([0,1,2]),options={xStep:.75,yStep:.6};
  for(const order of [indices,new Uint16Array([0,2,1])]){
    const triangles=collect(points,order,options),sign=Math.sign(signedArea([...order].map(i=>points[i])));
    near(area(triangles),area([[points[0],points[1],points[2]]]));checkSpans(triangles,options);
    for(const triangle of triangles)assert.equal(Math.sign(signedArea(triangle)),sign);
  }
});

test('grid stays at world UV zero for negative coordinates and exact grid-edge vertices',()=>{
  const points=[[-4,-2],[0,-2],[0,2],[-4,2]],triangles=collect(points,[0,1,2,0,2,3],{xStep:1,yStep:1});
  near(area(triangles),16);checkSpans(triangles,{xStep:1,yStep:1});
  for(const triangle of triangles)for(const point of triangle){assert.ok(point[0]>=-4&&point[0]<=0);assert.ok(point[1]>=-2&&point[1]<=2);}
});

test('one-axis and unbounded grids do not invent another-axis restrictions',()=>{
  const points=[[0,-20],[100,.001],[0,20]],indices=[0,1,2];
  const unbounded=collect(points,indices,{});assert.deepEqual(unbounded,[[...points]]);
  for(const options of [{xStep:7},{yStep:3},{xStep:Infinity,yStep:Infinity}]){
    const triangles=collect(points,indices,options);near(area(triangles),2000);checkSpans(triangles,options);
  }
});

test('tiny normal triangles survive and exactly collinear triangles produce no fragments',()=>{
  const points=[[1e-12,2e-12],[2e-12,2e-12],[1e-12,3e-12]],triangles=collect(points,[0,1,2],{xStep:5e-13,yStep:5e-13});
  assert.ok(triangles.length);near(area(triangles)/5e-25,1,1e-12);
  assert.equal(collect([[0,0],[1,1],[2,2]],[0,1,2],{xStep:.2,yStep:.2}).length,0);
});

test('inputs and emissions are independent even if the callback mutates its received vertices',()=>{
  const points=Object.freeze([[0,0],[3,0],[0,3]].map(Object.freeze)),indices=Object.freeze([0,1,2]),snapshot=JSON.stringify({points,indices});
  let count=0;forEachUVTriangle(points,indices,{xStep:1,yStep:1},(a,b,c)=>{assert.ok([...a,...b,...c].every(Number.isFinite));a[0]=Infinity;b[1]=Infinity;c[0]=Infinity;count++;});
  assert.ok(count>1);assert.equal(JSON.stringify({points,indices}),snapshot);
});

test('pretriangulated holes stay empty, and original inner-boundary vertices survive',()=>{
  const shape=new Shape([[-4,-3],[4,-3],[4,3],[-4,3]].map(point=>new Vector2(...point))),hole=[[-1,-1],[-1,1],[1,1],[1,-1]];
  shape.holes=[new Path(hole.map(point=>new Vector2(...point)))];
  const geometry=new ShapeGeometry(shape),attribute=geometry.attributes.position,points=Array.from({length:attribute.count},(_,i)=>[attribute.getX(i),attribute.getY(i)]),triangles=collect(points,geometry.index.array,{xStep:.7,yStep:.8});
  near(area(triangles),44);checkSpans(triangles,{xStep:.7,yStep:.8});
  for(const triangle of triangles){const middle=[0,1].map(axis=>triangle.reduce((sum,p)=>sum+p[axis],0)/3);assert.ok(!(middle[0]>-1&&middle[0]<1&&middle[1]>-1&&middle[1]<1));}
  const vertices=triangles.flat();for(const original of hole)assert.ok(vertices.some(p=>p[0]===original[0]&&p[1]===original[1]));
  geometry.dispose();
});

test('long skinny input cuts into occupied cells without a recursive binary-tree triangle explosion',()=>{
  const points=[[0,0],[600,628],[600,628.1]],triangles=collect(points,[0,1,2],{xStep:20,yStep:17.45});
  near(area(triangles),30,1e-8);checkSpans(triangles,{xStep:20,yStep:17.45});
  assert.ok(triangles.length<250,`${triangles.length} fragments for a thin diagonal`);
});

test('invalid indices, nonfinite coordinates, and nonpositive grid steps reject before emitting',()=>{
  const points=[[0,0],[1,0],[0,1]],emit=()=>assert.fail('invalid input emitted a triangle');
  for(const step of [0,-1,NaN,-Infinity,null])assert.throws(()=>forEachUVTriangle(points,[0,1,2],{xStep:step},emit),RangeError);
  for(const indices of [[0,1],[0,1,3],[-1,1,2],[0,.5,2]])assert.throws(()=>forEachUVTriangle(points,indices,{},emit));
  assert.throws(()=>forEachUVTriangle([[0,0],[1,NaN],[0,1]],[0,1,2],{},emit),TypeError);
  assert.throws(()=>forEachUVTriangle(points,[0,1,2],{xStep:1e-20},emit),RangeError);
});
