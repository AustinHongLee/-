import test from 'node:test';
import assert from 'node:assert/strict';
import {edgeContactAngles} from '../dist/assets/edge-sampling.js';
import {computeElbowJoint,computeExactElbowStationTable} from '../dist/assets/elbow-geometry.js';

const TAU=2*Math.PI,rad=x=>x*Math.PI/180;
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const near=(a,b,eps=2e-6)=>assert.ok(Math.abs(a-b)<=eps,`${a} differs from ${b}`);
const base={hostType:'elbow',mainOD:219.1,mainWall:6,branchOD:60.3,branchWall:3.91,
  branchLength:150,bendRadius:304.8,bendAngle:90,elbowAlignment:'a-edge',
  elbowOffset:1,elbowSideOffset:0,motherOpening:false,jointType:'on',rootGap:0,
  holeGap:0,projection:0,padEnabled:false,samples:72,tolerance:.1,autoPrecision:true};

// This construction uses the port plane and a circle/torus right triangle.
// It does not call the production torus root finder or alignment resolver.
function exitAt(p,theta,radius=p.branchOD/2,minor=p.mainOD/2){
  const R=p.mainOD/2,ro=p.branchOD/2,D=R-ro,length=Math.hypot(p.elbowOffset,p.elbowSideOffset),
    nx=p.elbowOffset/length,nz=p.elbowSideOffset/length,alpha=Math.atan2(nz,nx);
  let delta=(theta-alpha)%TAU;
  if(delta>Math.PI)delta-=TAU;else if(delta< -Math.PI)delta+=TAU;
  const halfSine=Math.sin(delta/2),w=(D+radius)*nx-2*radius*nx*halfSine**2-radius*nz*Math.sin(delta),
    z=(D+radius)*nz-2*radius*nz*halfSine**2+radius*nx*Math.sin(delta),
    disk=(ro-radius)*(2*R-ro+radius)+4*D*radius*halfSine**2,
    radial=(minor-R)*(minor+R)+disk,h2=w*w+radial;
  if(h2 < -1e-8)return null;
  const h=Math.sqrt(Math.max(0,h2)),difference=w>=0?(h+w?radial/(h+w):0):h-w,
    x2=difference*(2*p.bendRadius+h+w);
  if(x2 < -1e-8)return null;
  return [Math.sqrt(Math.max(0,x2)),w,z];
}
function portCoordinates(p,end,point){
  const g=rad(p.bendAngle),c=end==='a'?[0,0,0]:[p.bendRadius*Math.sin(g),p.bendRadius*(1-Math.cos(g)),0],
    d=end==='a'?[1,0,0]:[-Math.cos(g),-Math.sin(g),0],
    n=end==='a'?[0,-1,0]:[Math.sin(g),-Math.cos(g),0],q=sub(point,c);
  return [dot(q,d),dot(q,n),q[2]];
}
function assertIndependentExit(p,end,point,radius,minor){
  const q=portCoordinates(p,end,point),D=(p.mainOD-p.branchOD)/2,
    alpha=Math.atan2(p.elbowSideOffset,p.elbowOffset),u=D*Math.cos(alpha),v=D*Math.sin(alpha),
    theta=Math.atan2(q[2]-v,q[1]-u);
  let expected=exitAt(p,theta,radius,minor);
  // Recovering theta from a transformed exact pole magnifies floating-point
  // coordinate noise through the square-root inverse. Its port datum is exact.
  const directionLength=Math.hypot(p.elbowOffset,p.elbowSideOffset),
    contact=[0,minor*p.elbowOffset/directionLength,minor*p.elbowSideOffset/directionLength];
  if(radius===p.branchOD/2&&minor===p.mainOD/2&&Math.hypot(...sub(q,contact))<1e-8)expected=contact;
  assert.ok(expected,'the independently constructed near exit must exist');
  near(Math.hypot(q[1]-u,q[2]-v),radius);
  // The inverse of a lateral square-root tip amplifies double-precision
  // transformed-coordinate noise. Bound it well below the 0.1 mm contour goal.
  expected.forEach((x,i)=>near(q[i],x,i===0&&q[0]<.001?5e-5:2e-6));
  near(Math.hypot(Math.hypot(q[0],p.bendRadius+q[1])-p.bendRadius,q[2]),minor);
  assert.ok(q[0]>=-1e-6,'the selected near exit lies inside its port half-plane');
  assert.ok(Math.atan2(q[0],p.bendRadius+q[1])<=rad(p.bendAngle)+1e-7,
    'the near exit must remain inside the other finite end');
  // Moving outward from this exit increases torus distance. Retained branch
  // material therefore cannot re-enter any part of the full parent torus.
  for(const step of [1e-4,.1,10,100])assert.ok(
    Math.hypot(Math.hypot(q[0]+step,p.bendRadius+q[1])-p.bendRadius,q[2])>=minor-1e-7);
}

test('edge mesh retains exact contact and true strictly increasing circle angles for odd/even resolutions',()=>{
  for(const samples of [37,72,144,4096])for(const contact of [0,Math.PI/2,Math.PI,1.234,TAU-1e-4]){
    const a=edgeContactAngles(samples,contact);
    assert.equal(a[0],0);assert.equal(a.at(-1),TAU);assert.ok(a.includes(contact));
    assert.ok(a.length>=samples+1&&a.length<=Math.min(samples+3,4097));
    for(let i=1;i<a.length;i++)assert.ok(a[i]>a[i-1]);
  }
  assert.throws(()=>edgeContactAngles(37,NaN));
  assert.throws(()=>edgeContactAngles(3,0));
});

test('fourth-power angular mesh converges lateral square-root fishmouth tips without moving the tip',()=>{
  for(const sign of [-1,1]){
    const p={...base,elbowOffset:0,elbowSideOffset:sign},contact=sign>0?Math.PI/2:3*Math.PI/2;
    const tip=exitAt(p,contact);near(tip[0],0);near(tip[1],0);near(tip[2],sign*p.mainOD/2);
    const errors=[72,144,288,576].map(samples=>{
      const angles=edgeContactAngles(samples,contact);let worst=0;
      for(let i=1;i<angles.length;i++){
        const a=exitAt(p,angles[i-1]),b=exitAt(p,angles[i]);
        for(const fraction of [.125,.25,.5,.75,.875]){
          const q=exitAt(p,angles[i-1]+fraction*(angles[i]-angles[i-1]));
          worst=Math.max(worst,Math.hypot(...q.map((x,j)=>x-a[j]-(b[j]-a[j])*fraction)));
        }
      }
      return worst;
    });
    for(let i=1;i<errors.length;i++)assert.ok(errors[i]<errors[i-1]);
    assert.ok(errors.at(-1)<.1,`last geometric chord error ${errors.at(-1)} mm`);
  }
});

test('A/B outer-back and both lateral edge fishmouths are closed true near exits on 45/90 degree elbows',()=>{
  for(const end of ['a','b'])for(const bendAngle of [45,90])for(const side of [[1,0],[0,1],[0,-1]]){
    const p={...base,elbowAlignment:`${end}-edge`,bendAngle,elbowOffset:side[0],elbowSideOffset:side[1]},r=computeElbowJoint(p);
    assert.equal(r.valid,true,JSON.stringify(r.errors));assert.equal(r.manufacturingReady,true);
    const R=p.mainOD/2,alpha=Math.atan2(side[1],side[0]);
    for(const [points,radius] of [[r.geometry.branch.outerCut,p.branchOD/2],[r.geometry.branch.innerCut,p.branchOD/2-p.branchWall]]){
      assert.ok(points.length>36);assert.deepEqual(points[0],points.at(-1));
      for(const q of points)assertIndependentExit(p,end,q,radius,R);
    }
    const nearest=Math.min(...r.geometry.branch.outerCut.map(q=>{
      const x=portCoordinates(p,end,q);return Math.hypot(x[0],x[1]-R*Math.cos(alpha),x[2]-R*Math.sin(alpha));
    }));
    assert.ok(nearest<2e-7,`the legitimate contact at the selected port must be retained: ${nearest}`);
    assert.deepEqual(r.geometry.elbow.outerHole3D,[]);
    for(const q of computeExactElbowStationTable(r,12)){
      assertIndependentExit(p,end,q.outerPoint,p.branchOD/2,R);
      assertIndependentExit(p,end,q.innerPoint,p.branchOD/2-p.branchWall,R);
    }
  }
});

test('inner-belly alignment uses the positive outer exit rather than the zero-distance far root',()=>{
  for(const end of ['a','b'])for(const bendAngle of [45,90]){
    const p={...base,bendRadius:914.4,bendAngle,elbowAlignment:`${end}-edge`,elbowOffset:-1},r=computeElbowJoint(p);
    assert.equal(r.valid,true,JSON.stringify(r.errors));
    for(const q of r.geometry.branch.outerCut){assertIndependentExit(p,end,q,p.branchOD/2,p.mainOD/2);assert.ok(portCoordinates(p,end,q)[0]>100);}
  }
});

test('inner insertion and open-hole inner-wall misses remain real failures while thin-wall set-on can work',()=>{
  for(const end of ['a','b'])for(const side of [[1,0],[0,1],[0,-1]]){
    const p={...base,elbowAlignment:`${end}-edge`,elbowOffset:side[0],elbowSideOffset:side[1]},contact=Math.atan2(side[1],side[0]);
    assert.equal(exitAt(p,contact,p.branchOD/2,p.mainOD/2-p.mainWall),null,
      'the actual inner wall cannot contain the outer branch-circle tip');
    assert.equal(exitAt(p,contact,p.branchOD/2-p.branchWall,p.mainOD/2-p.mainWall),null,
      'the default set-on bore crosses the selected port inner-wall boundary');
    for(const patch of [{motherOpening:true,jointType:'in'},{motherOpening:true,jointType:'on'}]){
      const r=computeElbowJoint({...p,...patch});assert.equal(r.valid,false);assert.deepEqual(r.templates,[]);
    }
    const thin={...p,motherOpening:true,mainWall:1},r=computeElbowJoint(thin);
    assert.equal(r.valid,true,JSON.stringify(r.errors));
    for(const q of r.geometry.elbow.innerHole3D)assertIndependentExit(thin,end,q,thin.branchOD/2-thin.branchWall,thin.mainOD/2-thin.mainWall);
  }
});
