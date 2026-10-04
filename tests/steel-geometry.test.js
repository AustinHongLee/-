import test from 'node:test';
import assert from 'node:assert/strict';
import {computeSteelJoint,computeSteelFaceStations} from '../dist/assets/steel-geometry.js';
import {conicalCoordinates,conicalDevelopmentToWorld} from '../dist/assets/conical-geometry.js';
import {torusCoordinates} from '../dist/assets/elbow-geometry.js';
import {elbowAlignmentReference} from '../dist/assets/elbow-axis.js';
import {sectionPointAt,sectionContains} from '../dist/assets/steel-sections.js';
const near=(a,b,t=2e-7)=>assert.ok(Math.abs(a-b)<=t,`${a} vs ${b}`),sub=(a,b)=>a.map((v,i)=>v-b[i]),norm=v=>Math.hypot(...v),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const base={mainOD:219.1,mainWall:6,mainLength:600,jointPosition:300,mainEndOD:168.3,bendRadius:304.8,bendAngle:90,bendPosition:45,angle:90,branchLength:150,sectionWidth:60,sectionHeight:80,sectionWall:4,sectionWeb:6,sectionFlange:8,sectionRadius:2,sectionRotation:0,sectionSlope:0,branchOD:60.3,branchWall:3.91,motherOpening:false,jointType:'on',projection:0,padEnabled:false,rootGap:0,samples:72,tolerance:.1,autoPrecision:true};
const good=p=>{const r=computeSteelJoint({...base,...p});assert.ok(r.valid,JSON.stringify(r.errors));assert.equal(r.manufacturingReady,true);return r;};
const residual=(point,p)=>p.hostType==='elbow'?torusCoordinates(point,p.bendRadius).tubeDistance-p.mainOD/2:p.hostType==='cone'?conicalCoordinates(point,p).normalResidual:Math.hypot(point[1],point[2])-p.mainOD/2;

test('seven steel sections on all three mothers yield real per-face templates without any mother opening',()=>{
  for(const hostType of ['straight','elbow','cone'])for(const branchSection of ['chs','shs','rhs','h','i','l','c']) {
    const r=good({hostType,branchSection});assert.equal(r.capabilities.steel,true);assert.equal(r.capabilities.motherOpening,false);
    assert.deepEqual(r.geometry.main.outerHole3D,[]);assert.deepEqual(r.geometry.main.innerHole3D,[]);assert.equal(r.geometry.main.holeToolRadius,null);
    assert.ok(r.geometry.steel.faces.length>=2);assert.ok(r.wallEnvelope.materialPoints>0);assert.equal(r.wallEnvelope.rigorous,false);
    const depths=r.templates.filter(t=>t.id.startsWith('steel-face-')).map(t=>t.mapping.depthOrigin);assert.ok(depths.every(d=>d===depths[0]));
    for(const face of r.geometry.steel.faces) {
      const t=r.templates.find(t=>t.mapping.faceId===face.id);near(t.width,face.width);assert.equal(t.outerRole,'paper-boundary');assert.deepEqual(t.holes,[]);
      assert.equal(t.mapping.motherOpening,false);assert.equal(t.mapping.freeEndDepth,0);
      for(const row of face.stations){near(residual(row.point,r.params),0);near(row.depth,r.geometry.steel.axisEnd-dot(sub(row.point,r.geometry.axes.branchOrigin),r.geometry.axes.branchDirection));assert.ok(row.depth>=base.branchLength-1e-6);}
    }
    for(const loop of r.geometry.steel.loops){near(norm(sub(loop.cut3D[0],loop.cut3D.at(-1))),0);assert.equal(loop.sectionPoints.length,loop.cut3D.length);assert.equal(loop.end3D.length,loop.cut3D.length);}
    if(hostType==='elbow')assert.ok(!r.templates.some(t=>t.id==='steel-mother-datum'));
  }
});

test('oblique rotated profiles retain orthonormal axes, real face widths and exact arbitrary face stations',()=>{
  for(const hostType of ['straight','elbow','cone'])for(const branchSection of ['rhs','h','l','c']) {
    const r=good({hostType,branchSection,angle:57,sectionRotation:33,surfaceClock:25,branchSwivel:12,offset:10,azimuth:35}),axes=r.geometry.axes;
    near(norm(axes.sectionU),1);near(norm(axes.sectionV),1);near(dot(axes.sectionU,axes.sectionV),0);near(dot(axes.sectionU,axes.branchDirection),0);near(dot(axes.sectionV,axes.branchDirection),0);
    for(const face of r.geometry.steel.faces)for(const row of computeSteelFaceStations(r,face.id,7)) {
      near(row.faceDistance,face.width*row.index/7);near(residual(row.point,r.params),0);
      const vector=sub(row.point,axes.branchOrigin);near(dot(vector,axes.sectionU),row.sectionPoint[0]);near(dot(vector,axes.sectionV),row.sectionPoint[1]);
    }
  }
});

test('closed intent, unsupported plate work, partial fit and finite mother ends block fabrication explicitly',()=>{
  for(const [patch,code] of [[{motherOpening:true},'closed-intent'],[{jointType:'in'},'closed-intent'],[{projection:1},'closed-intent'],[{padEnabled:true},'unsupported-pad'],[{sectionHeight:250},'steel-contact'],[{jointPosition:1},'finite-end']]) {
    const r=computeSteelJoint({...base,hostType:'straight',branchSection:'rhs',...patch});assert.equal(r.valid,false);assert.equal(r.manufacturingReady,false);assert.equal(r.geometry,null);assert.deepEqual(r.templates,[]);assert.ok(r.errors.some(e=>e.code===code),JSON.stringify(r.errors));
  }
});

test('material retained beyond a short throat weld may hit the other finite elbow arm',()=>{
  const p={hostType:'elbow',branchSection:'shs',sectionWidth:10,sectionWall:1,sectionRadius:0,bendPosition:30,surfaceClock:180,angle:20};good({...p,branchLength:50});
  const long=computeSteelJoint({...base,...p,branchLength:200});assert.equal(long.valid,false);assert.ok(long.errors.some(e=>e.code==='body-interference'));assert.deepEqual(long.templates,[]);
});

test('sealed circular structural supports preserve valid A/B external edge cusp without reverting to a flow hole',()=>{
  for(const end of ['a','b'])for(const [elbowOffset,elbowSideOffset] of [[1,0],[0,1],[0,-1]]) {
    const r=good({hostType:'elbow',branchSection:'chs',elbowAlignment:`${end}-edge`,elbowOffset,elbowSideOffset}),ref=elbowAlignmentReference(r.params);
    near(ref.offsetDistance,79.4);assert.deepEqual(r.geometry.elbow.outerHole3D,[]);assert.equal(r.params.motherOpening,false);
  }
});

test('outer normal gap is measured consistently on cylinder, torus and true-normal cone offset surfaces',()=>{
  for(const hostType of ['straight','elbow','cone']) {
    const r=good({hostType,branchSection:'rhs',rootGap:1.2});
    for(const face of r.geometry.steel.faces)for(const row of computeSteelFaceStations(r,face.id,5)) {near(residual(row.point,r.params),1.2);near(residual(row.contactPoint,r.params),0);}
  }
});

test('mother datum paper A/B crosses correspond to real field distances and an exact physical wrap',()=>{
  for(const [hostType,mainEndOD] of [['straight',168.3],['cone',168.3],['cone',273]]) {
    const r=good({hostType,mainEndOD,branchSection:'rhs',azimuth:35,surfaceClock:23}),t=r.templates.find(t=>t.id==='steel-mother-datum');assert.equal(t.holes.length,0);assert.equal(t.mapping.motherOpening,false);
    for(const datum of Object.values(t.mapping.positioning)) {
      near(datum.x,datum.point[0]);assert.ok(datum.phiDegrees>=0&&datum.phiDegrees<360);assert.ok(datum.circumferentialDistance>=0);
      const developed=datum.paper.map((q,i)=>q+t.mapping.origin[i]);if(t.mapping.paperTransform==='conical-mirror-x')developed[0]*=-1;
      if(hostType==='cone')near(norm(sub(conicalDevelopmentToWorld(developed,r.params,0,t.mapping.seamAngle),datum.point)),0);
      else {const R=r.params.mainOD/2,phi=(developed[0]-Math.PI*R)/R+r.params.azimuth*Math.PI/180;near(norm(sub([developed[1],R*Math.sin(phi),R*Math.cos(phi)],datum.point)),0);}
    }
    if(hostType==='cone'&&mainEndOD>base.mainOD)assert.equal(t.mapping.paperTransform,'conical-mirror-x');
    assert.equal(r.verification.find(v=>v.id==='roundtrip').status,'pass');
    const paperChord=r.verification.find(v=>v.id==='mother-paper-chord');assert.equal(paperChord.status,'pass');assert.ok(r.precision.maxChordError>=paperChord.value);near(paperChord.value,r.sampling.motherPaperSampledChordError*1.1);
  }
});

test('printed material faces face outwards, including inner walls and root arcs, and invert to the true cut points',()=>{
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  for(const branchSection of ['chs','rhs','h','l','c']) {
    const r=good({hostType:'straight',branchSection,sectionRotation:27,angle:63,sectionRadius:6}),axes=r.geometry.axes;
    for(const face of r.geometry.steel.faces) {
      const template=r.templates.find(t=>t.mapping.faceId===face.id),curve=template.references.find(ref=>ref.type==='cut-line').points;
      assert.equal(template.mapping.paperTransform,'steel-face-mirror-x');assert.equal(template.mapping.paperLeftEdge,face.edgeEndId);assert.equal(template.mapping.paperRightEdge,face.edgeStartId);
      curve.forEach((paper,i)=>{
        const s=face.width-paper[0],depth=paper[1]+template.mapping.depthOrigin,q=sectionPointAt(face,s);
        const world=axes.branchOrigin.map((x,j)=>x+axes.sectionU[j]*q[0]+axes.sectionV[j]*q[1]+axes.branchDirection[j]*(r.geometry.steel.axisEnd-depth));
        near(norm(sub(world,face.stations[i].point)),0);
      });
      const delta=Math.min(.001,face.width/100),before=sectionPointAt(face,face.width/2-delta),after=sectionPointAt(face,face.width/2+delta),tangent=sub(after,before),length=norm(tangent),out=[tangent[1]/length,-tangent[0]/length],mid=sectionPointAt(face,face.width/2),outWorld=axes.sectionU.map((x,j)=>x*out[0]+axes.sectionV[j]*out[1]),tWorld=axes.sectionU.map((x,j)=>x*tangent[0]+axes.sectionV[j]*tangent[1]);
      const printedFront=cross(axes.branchDirection.map(x=>-x),tWorld.map(x=>-x));assert.ok(dot(printedFront,outWorld)>0);
      assert.equal(sectionContains(r.geometry.steel.section,mid.map((x,i)=>x-.01*out[i])),true);
      assert.equal(sectionContains(r.geometry.steel.section,mid.map((x,i)=>x+.01*out[i])),false);
    }
  }
});

test('low manual density stays preview-only while automatic face refinement enables manufacturing',()=>{
  const p={...base,hostType:'elbow',branchSection:'chs',elbowAlignment:'a-edge',elbowOffset:0,elbowSideOffset:1,samples:37,tolerance:.03};
  const manual=computeSteelJoint({...p,autoPrecision:false});assert.equal(manual.valid,true);assert.equal(manual.manufacturingReady,false);
  const auto=computeSteelJoint({...p,autoPrecision:true});assert.equal(auto.valid,true);assert.equal(auto.manufacturingReady,true);assert.ok(auto.precision.effectiveSamples>37);
  assert.throws(()=>computeSteelFaceStations(auto,'MISSING',12));assert.throws(()=>computeSteelFaceStations(auto,'O1',0));
});
