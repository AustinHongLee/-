import test from 'node:test';
import assert from 'node:assert/strict';
import {computeElbowJoint,torusSurfacePoint} from '../dist/assets/elbow-geometry.js';
import {computeFormedElbowPad,computeExactFormedElbowPadLocatorTable} from '../dist/assets/formed-elbow-pad.js';
import {formedElbowPadLocatorSVG,buildElbowPadLocatorHTML,buildElbowPadPageBodies} from '../dist/assets/elbow-pad-field.js';
import {buildElbowWorkOrderHTML,elbowWorkOrderPageCount} from '../dist/assets/elbow-field.js';

const TAU=2*Math.PI,dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const norm=v=>Math.hypot(...v),closeTo=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<=t,`${a} vs ${b}`);
const base={hostType:'elbow',mainOD:200,mainWall:6,branchOD:100,branchWall:4,branchLength:200,
  bendRadius:304.8,bendAngle:90,bendPosition:45,surfaceClock:0,angle:90,branchSwivel:0,
  jointType:'on',motherOpening:true,rootGap:0,holeGap:.5,padEnabled:false,
  samples:72,autoPrecision:false,tolerance:1};
const joint=computeElbowJoint(base);assert.ok(joint.valid&&joint.manufacturingReady);
const options={padThickness:6,padMargin:35,padClearance:1,padShape:'obround',padSplit:'single'};
const padResult=computeFormedElbowPad(joint,options);assert.ok(padResult.valid,JSON.stringify(padResult.errors));
const attached=computeElbowJoint({...base,...options,padEnabled:true});assert.ok(attached.valid&&attached.manufacturingReady,JSON.stringify(attached.errors));

test('normal extrados inner and outer bore stations match independent circular-section solution',()=>{
  const table=computeExactFormedElbowPadLocatorTable(attached,37),Rc=base.bendRadius,R=base.mainOD/2,tool=base.branchOD/2+options.padClearance,beta0=Math.PI/4;
  for(const row of table){const theta=row.angle*Math.PI/180,w=tool*Math.cos(theta),z=tool*Math.sin(theta);
    for(const [name,rho]of[['inner',R],['outer',R+options.padThickness]]){
      const u=Math.sqrt((Rc+Math.sqrt(rho*rho-z*z))**2-w*w),beta=beta0-Math.atan2(w,u),phi=Math.asin(z/rho),t=u-(Rc+R);
      const c=[Rc*Math.sin(beta0),Rc*(1-Math.cos(beta0)),0],m=[Math.sin(beta0),-Math.cos(beta0),0],T=[Math.cos(beta0),Math.sin(beta0),0];
      const point=c.map((v,i)=>v+(R+t)*m[i]-w*T[i]+(i===2?z:0));
      closeTo(row[name].betaRad,beta,1e-9);closeTo(row[name].phiRad,phi,1e-9);closeTo(row[name].axisStation,t);
      assert.ok(norm(sub(row[name].point,point))<1e-7);
      closeTo(row[name].rearDistance,(Rc+rho)*beta);
    }
  }
  assert.equal(table.length,38);
});

test('plate faces are exact parallel torus offsets, with full thickness and distinct face holes',()=>{
  const p=padResult.pad,Rc=p.bendRadius,t=p.outerRadius-p.innerRadius;
  p.outerParameter.forEach(([beta,phi],i)=>{
    const m=[Math.sin(beta)*Math.cos(phi),-Math.cos(beta)*Math.cos(phi),Math.sin(phi)];
    const delta=sub(p.outerBoundary3D[i],p.innerBoundary3D[i]);closeTo(norm(delta),t);
    assert.ok(norm(sub(delta,m.map(v=>v*t)))<1e-7);
    assert.ok(norm(sub(p.outerBoundary3D[i],torusSurfacePoint(beta,phi,Rc,p.outerRadius)))<1e-7);
  });
  const rows=computeExactFormedElbowPadLocatorTable(p,24),q=rows[6];
  assert.notEqual(q.inner.phiRad,q.outer.phiRad);
  closeTo(q.inner.phiRad,Math.asin(51/100),1e-9);closeTo(q.outer.phiRad,Math.asin(51/106),1e-9);
  assert.equal(p.neutralRadius,null);assert.equal(p.mapping.developmentBasis,null);
});

test('whole-thickness ligament certificate is a conservative bound for every entire outer segment',()=>{
  const p=padResult.pad,source=p.source.joint,Rc=p.bendRadius,R=p.innerRadius,Ro=p.outerRadius,
    origin=source.geometry.axes.branchOrigin,d=source.geometry.axes.branchDirection,tool=51;
  let denseMinimum=Infinity;
  for(let i=0;i<p.outerParameter.length-1;i+=3){const a=p.outerParameter[i],b=p.outerParameter[i+1];
    for(let k=0;k<=12;k++)for(let layer=0;layer<=16;layer++){
      const f=k/12,beta=a[0]+(b[0]-a[0])*f,phi=a[1]+(b[1]-a[1])*f,rho=R+(Ro-R)*layer/16;
      // Independently project a Cartesian point onto the branch-axis line.
      const world=torusSurfacePoint(beta,phi,Rc,rho),v=sub(world,origin),along=dot(v,d),axisDistance=norm(v.map((x,j)=>x-along*d[j]));
      denseMinimum=Math.min(denseMinimum,axisDistance-tool);
    }
  }
  assert.ok(denseMinimum>=p.boundaryCertification.clearance-1e-8);
  assert.ok(p.boundaryCertification.clearance>=options.padMargin);
  assert.equal(p.boundaryCertification.rigorous,true);assert.equal(p.nearBoreValidation.rigorous,false);
});

test('all four marking outlines and three assembly choices remain finite and contained',()=>{
  for(const shape of ['circle','ellipse','obround','rounded'])for(const split of ['single','axial','circumferential']){
    const r=computeFormedElbowPad(joint,{...options,padShape:shape,padSplit:split});assert.ok(r.valid,`${shape} ${split}: ${JSON.stringify(r.errors)}`);
    const p=r.pad;assert.ok(p.outerParameter.every(q=>q[0]>0&&q[0]<Math.PI/2));
    assert.ok(p.boundaryCertification.clearance>=35);
    if(split==='single')assert.equal(p.splitReference3D.length,0);else{
      assert.equal(p.splitReference3D.length,2);assert.equal(p.splitLocator.inner.length,4);assert.equal(p.splitLocator.outer.length,4);
      for(const row of p.splitLocator.outer){const coordinate=p.splitAxis===0?row.betaRad:row.phiRad;closeTo(coordinate,p.splitCoordinate,1e-9);}
    }
  }
});

test('B coaxial and closed mother arrangements retain a separately bored plate',()=>{
  for(const motherOpening of [true,false]){
    const j=computeElbowJoint({...base,mainOD:219.1,branchOD:114.3,elbowAlignment:'b-axis',motherOpening});assert.ok(j.valid);
    const p=computeFormedElbowPad(j,{...options,padShape:'ellipse',padSplit:'axial'});assert.ok(p.valid,JSON.stringify(p.errors));
    const rows=computeExactFormedElbowPadLocatorTable(p,29),d=j.geometry.axes.branchDirection,o=j.geometry.axes.branchOrigin,tool=58.15;
    for(const row of rows)for(const face of ['inner','outer']){const v=sub(row[face].point,o),s=dot(v,d);closeTo(norm(v.map((x,k)=>x-s*d[k])),tool);}
    assert.equal(j.geometry.elbow.outerHole3D.length===0,!motherOpening);
    assert.ok(p.pad.outerHole3D.length>100);
  }
});

test('invalid outer edges, excessive thickness, and insufficient branch length stop the entire joint',()=>{
  for(const bad of [{padMargin:500},{padThickness:300},{branchLength:1},{padClearance:120},{padThickness:NaN}]){
    const r=computeElbowJoint({...base,...options,...bad,padEnabled:true});assert.equal(r.valid,false,JSON.stringify(bad));
    assert.equal(r.manufacturingReady,false);assert.equal(r.geometry,null);assert.equal(r.templates.length,0);assert.ok(r.errors.length);
  }
  const b=computeElbowJoint({...base,mainOD:219.1,branchOD:114.3,elbowAlignment:'b-axis',...options,padShape:'circle',padEnabled:true});
  assert.equal(b.valid,false);assert.match(b.errors.map(q=>q.message).join(''),/半個管周|端部/);
});

test('attaching a formed plate adds no false flat template and remains serializable',()=>{
  assert.ok(attached.geometry.pad);assert.equal(attached.capabilities.pad,true);assert.equal(attached.capabilities.padFlatDevelopment,false);
  assert.deepEqual(attached.templates.map(t=>t.id),['branch']);assert.equal(attached.measurements.padNetArea,null);
  assert.doesNotThrow(()=>JSON.stringify(attached));
  assert.equal(attached.formedPad.capabilities.flatDevelopment,false);assert.equal(attached.formedPad.capabilities.structuralDesign,false);
});

test('field report identifies formed faces and places two pad duties in the existing A4 order',()=>{
  const svg=formedElbowPadLocatorSVG(attached),html=buildElbowWorkOrderHTML(attached,{id:'E-PAD'}),standalone=buildElbowPadLocatorHTML(attached);
  assert.match(svg,/非平板展開／非 1:1/);assert.match(svg,/外面孔藍線／內面孔灰虛線/);
  assert.equal(elbowWorkOrderPageCount(attached),4);assert.match(html,/data-role="formed-pad-edge"/);assert.match(html,/data-role="formed-pad-hole"/);
  assert.match(html,/沿支管軸方向穿厚/);assert.match(html,/母管短弧 mm/);assert.match(html,/板外面短弧 mm/);
  assert.match(standalone,/font-size:8.5pt/);assert.match(standalone,/width:210mm;height:297mm/);
  assert.doesNotMatch(html,/此版不提供彎頭補強板/);
});

test('two-piece and 48-point duties paginate without discarding migrated face positions',()=>{
  const j=computeElbowJoint({...base,...options,padSplit:'axial',padEnabled:true});assert.ok(j.valid&&j.manufacturingReady);
  const pages=buildElbowPadPageBodies(j,{padCount:48});assert.equal(pages.filter(q=>q.role==='formed-pad-edge').length,2);
  assert.ok(pages.every(q=>(q.body.match(/data-pad-station=/g)||[]).length<=25));
  assert.equal(pages.filter(q=>q.role==='formed-pad-seam').length,1);assert.ok(pages.some(q=>q.body.includes('A 片'))||pages.some(q=>q.title.includes('A 片')));
  assert.ok(pages.some(q=>q.title.includes('B 片')));
});

test('two-piece seam page retains exact distinct inner and outer hole endpoints outside the sparse bore grid',()=>{
  const j=computeElbowJoint({...base,mainOD:219.1,branchOD:114.3,elbowAlignment:'b-axis',...options,padSplit:'axial',padEnabled:true});
  assert.ok(j.valid&&j.manufacturingReady);const pages=buildElbowPadPageBodies(j),seam=pages.find(q=>q.role==='formed-pad-seam');
  assert.ok(seam);assert.equal((seam.body.match(/data-pad-seam-face="內面"/g)||[]).length,4);
  assert.equal((seam.body.match(/data-pad-seam-face="外面"/g)||[]).length,4);
  assert.equal((seam.body.match(/<tr data-pad-seam/g)||[]).length,8);assert.match(seam.body,/不能共用一套點位/);
  assert.match(seam.body,/不從稀疏 24 站孔表內插/);
  const inner=j.geometry.pad.splitLocator.inner,outer=j.geometry.pad.splitLocator.outer;
  assert.ok(inner.some((q,i)=>norm(sub(q.point,outer[i].point))>options.padThickness+.0001));
  for(const q of [...inner,...outer]){const exact=Number(q.motherRearDistance.toFixed(3)).toString();assert.ok(seam.body.includes(exact));}
  assert.ok(pages.filter(q=>q.role==='formed-pad-edge').every(q=>!q.body.includes('data-pad-seam-face')));
});
