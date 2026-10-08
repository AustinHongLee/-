import test from 'node:test';
import assert from 'node:assert/strict';
import {createSteelSection,sectionContains} from '../dist/assets/steel-sections.js';
import {computeSteelJoint,computeSteelFaceStations} from '../dist/assets/steel-geometry.js';

const close=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} differs from ${b}`);
const common={mainOD:219.1,mainWall:6,mainLength:600,jointPosition:300,angle:90,
  motherOpening:false,jointType:'on',projection:0,padEnabled:false,branchLength:200,
  sectionWidth:60,sectionHeight:80,sectionWall:4,sectionWeb:6,sectionFlange:8,
  sectionRadius:0,sectionRotation:0,sectionSlope:0,tolerance:.1,samples:144};

test('material classification agrees with independent rectangle unions and hollow tube subtraction',()=>{
  const W=60,H=80,t=4,tw=6,tf=8;
  const truth={
    rhs:(x,y)=>Math.abs(x)<W/2&&Math.abs(y)<H/2&&!(Math.abs(x)<W/2-t&&Math.abs(y)<H/2-t),
    h:(x,y)=>Math.abs(x)<W/2&&Math.abs(y)<H/2&&(Math.abs(x)<tw/2||Math.abs(y)>H/2-tf),
    i:(x,y)=>Math.abs(x)<W/2&&Math.abs(y)<H/2&&(Math.abs(x)<tw/2||Math.abs(y)>H/2-tf),
    l:(x,y)=>Math.abs(x)<W/2&&Math.abs(y)<H/2&&(x<-W/2+t||y<-H/2+t),
    c:(x,y)=>Math.abs(x)<W/2&&Math.abs(y)<H/2&&(x<-W/2+tw||Math.abs(y)>H/2-tf),
  };
  // Nonintegral coordinates intentionally avoid boundary classification rules.
  for(const [kind,occupied] of Object.entries(truth)){
    const section=createSteelSection({...common,branchSection:kind});
    assert.equal(section.valid,true);
    for(let x=-32.37;x<32;x+=2)for(let y=-42.23;y<42;y+=2)
      assert.equal(sectionContains(section,[x,y]),occupied(x,y),`${kind} at ${x},${y}`);
  }
  const tube=createSteelSection({...common,branchSection:'chs',branchOD:60,branchWall:4});
  for(const q of [[0,0],[25,0],[0,-25],[17,17]])assert.equal(sectionContains(tube,q),false);
  for(const q of [[28,0],[0,-28],[20,20]])assert.equal(sectionContains(tube,q),true);
});

test('actual root and corner radii preserve independently calculated material area',()=>{
  const W=60,H=80,t=4,tw=6,tf=8,r=6,corner=1-Math.PI/4;
  const expected={rhs:W*H-(4-Math.PI)*r*r-((W-2*t)*(H-2*t)-(4-Math.PI)*(r-t)**2),
    l:W*t+H*t-t*t+corner*r*r,
    c:2*W*tf+(H-2*tf)*tw+2*corner*r*r,
    h:2*W*tf+(H-2*tf)*tw+4*corner*r*r};
  for(const [kind,area] of Object.entries(expected)){
    const section=createSteelSection({...common,branchSection:kind,sectionRadius:r});
    assert.equal(section.valid,true);close(section.area,area);
  }
  const l=createSteelSection({...common,branchSection:'l',sectionRadius:r});
  const knee=[-W/2+t,-H/2+t];
  assert.equal(sectionContains(l,[knee[0]+.6,knee[1]+.6]),true,'fillet adds real material at the former concave corner');
  assert.equal(sectionContains(l,[knee[0]+r,knee[1]+r]),false,'the centre of the concave arc remains void');
});

test('rotated real material faces cut an analytic cylinder and share one physical free end and paper datum',()=>{
  const R=common.mainOD/2,rotation=33*Math.PI/180,gap=1.7;
  for(const kind of ['rhs','h','l','c','chs']){
    const result=computeSteelJoint({...common,branchSection:kind,branchOD:60,branchWall:4,sectionRadius:4,sectionRotation:33,rootGap:gap});
    assert.equal(result.valid,true,JSON.stringify(result.errors));
    assert.equal(result.geometry.main.outerHole3D.length,0);
    const end=result.geometry.steel.axisEnd;
    const datums=new Set(result.templates.filter(t=>t.mapping?.faceId).map(t=>t.mapping.datumDepth));
    assert.equal(datums.size,1);
    for(const face of result.geometry.steel.section.faces){
      const rows=computeSteelFaceStations(result,face.id,13),template=result.templates.find(t=>t.mapping?.faceId===face.id);
      close(template.width,face.length);
      for(const row of rows){
        const [u,v]=row.sectionPoint,x=300-u*Math.cos(rotation)+v*Math.sin(rotation),y=u*Math.sin(rotation)+v*Math.cos(rotation);
        // Mother mark = foot of the true surface normal under the finished cut point (gap is a normal offset).
        const z=Math.sqrt((R+gap)**2-y*y),scale=R/(R+gap);
        close(row.point[0],x);close(row.point[1],y);close(row.point[2],z);
        close(row.contactPoint[0],x);close(row.contactPoint[1],y*scale);close(row.contactPoint[2],z*scale);close(row.depth,end-z);
      }
      close(rows.at(-1).faceDistance,face.length);
      if(face.kind==='arc'){
        const first=rows[0].sectionPoint,second=rows[1].sectionPoint;
        const a=Math.atan2(first[1]-face.center[1],first[0]-face.center[0]),b=Math.atan2(second[1]-face.center[1],second[0]-face.center[0]);
        close(Math.abs(Math.atan2(Math.sin(b-a),Math.cos(b-a)))*face.radius,face.length/13);
      }
      // Paper coordinates refer to the same measured free end, including arcs.
      for(const [index,q] of template.references.find(r=>r.type==='cut-line').points.entries()){
        const measured=result.geometry.steel.faces.find(f=>f.id===face.id).stations[index];
        // Looking at the material face from outside reverses its traversed U:
        // left-to-right on the printed front is edgeEnd to edgeStart.
        close(q[0],face.length-measured.faceDistance);
        close(q[1]+template.mapping.depthOrigin,measured.depth);
      }
    }
  }
});

test('open-section void at the reference centre does not prevent a valid support',()=>{
  for(const kind of ['rhs','l','c']){
    const result=computeSteelJoint({...common,branchSection:kind});
    assert.equal(result.valid,true,JSON.stringify(result.errors));
    assert.equal(sectionContains(result.geometry.steel.section,[0,0]),false);
    assert.equal(result.geometry.steel.reference,'outside-bounding-box-centre');
  }
});

test('finite mother ends and re-entry into a second elbow wall stop drawing without changing the intent',()=>{
  const end=computeSteelJoint({...common,branchSection:'rhs',jointPosition:15});
  assert.equal(end.valid,false);assert.ok(end.errors.some(e=>e.code==='finite-end'));
  const p={...common,branchSection:'rhs',sectionWidth:20,sectionHeight:20,sectionWall:2,
    hostType:'elbow',bendAngle:180,bendRadius:304.8,bendPosition:10,surfaceClock:180,angle:45};
  const short=computeSteelJoint({...p,branchLength:200}),long=computeSteelJoint({...p,branchLength:300});
  assert.equal(short.valid,true,JSON.stringify(short.errors));
  // Independent torus membership of actual RHS wall material q=(9,0).
  // This point is beyond the short free end and inside the opposite wall.
  const beta=10*Math.PI/180,a=45*Math.PI/180,B=304.8,R=219.1/2,s=290;
  const T=[Math.cos(beta),Math.sin(beta)],N=[-Math.sin(beta),Math.cos(beta)],
    d=[T[0]*Math.cos(a)+N[0]*Math.sin(a),T[1]*Math.cos(a)+N[1]*Math.sin(a)],
    u=[-d[1],d[0]],origin=[(B-R)*Math.sin(beta),B-(B-R)*Math.cos(beta)],
    point=[origin[0]+9*u[0]+s*d[0],origin[1]+9*u[1]+s*d[1]],
    tubeDistance=Math.abs(Math.hypot(point[0],point[1]-B)-B),hostAngle=Math.atan2(point[0],B-point[1]);
  assert.ok(hostAngle>0&&hostAngle<Math.PI);assert.ok(tubeDistance>R-6&&tubeDistance<R);
  assert.ok(short.geometry.steel.axisEnd<s);
  assert.equal(long.valid,false);assert.ok(long.errors.some(e=>e.code==='body-interference'));
  assert.equal(long.templates.length,0);assert.equal(long.params.motherOpening,false);
});
