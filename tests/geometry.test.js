import test from 'node:test';
import assert from 'node:assert/strict';
import {computeJoint,rotateAroundMain,cylindricalUVToWorld,minimumContourDistance,computeExactStationTable,PRECISION_SAMPLE_CAP} from '../dist/assets/geometry.js';

const near=(actual,expected,tolerance=1e-8)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} differs from ${expected}`);
const norm=p=>Math.hypot(...p);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const TAU=2*Math.PI;
const params={samples:72,padEnabled:false,autoPrecision:false};
function requireValid(p={}) {const r=computeJoint({...params,...p});assert.equal(r.valid,true,JSON.stringify(r.errors));return r;}
function area(poly) {return Math.abs(poly.slice(0,-1).reduce((s,p,i)=>s+p[0]*poly[i+1][1]-poly[i+1][0]*p[1],0)/2);}

// Independent generic line/cylinder quadratic; this deliberately does not use
// the kernel's trigonometric solved expression.
function lineCylinder(foot,direction,R) {
  const A=direction[1]**2+direction[2]**2;
  const B=2*(foot[1]*direction[1]+foot[2]*direction[2]);
  const C=foot[1]**2+foot[2]**2-R**2;
  const disc=B*B-4*A*C;
  return [(-B-Math.sqrt(disc))/(2*A),(-B+Math.sqrt(disc))/(2*A)];
}

test('90° external saddle has independent exact depths',()=>{
  const r=requireValid({angle:90,branchWall:5,holeGap:0});
  near(r.geometry.branch.outerCut[0][2],100);
  near(r.geometry.branch.outerCut[18][2],Math.sqrt(100**2-50**2));
  near(r.stationTable[18].outerDepth,200+100-Math.sqrt(7500));
  near(r.measurements.mainHoleAxialLength,90);
  near(r.measurements.mainHoleArcWidth,2*100*Math.asin(45/100));
  near(r.geometry.main.holeToolRadius,45);
});

test('90° set-in reaches inner wall and uses branch OD for the hole',()=>{
  const on=requireValid({angle:90,branchWall:5,holeGap:0});
  const inside=requireValid({angle:90,jointType:'in',branchWall:5,holeGap:0});
  near(inside.geometry.branch.outerCut[18][2],Math.sqrt(94**2-50**2));
  near(inside.measurements.mainHoleAxialLength,100);
  near(inside.measurements.mainHoleArcWidth,2*100*Math.asin(.5));
  assert.ok(inside.measurements.mainHoleArcWidth>on.measurements.mainHoleArcWidth);
});

test('oblique and offset cut is independently confirmed by quadratic roots',()=>{
  for(const angle of [17,52,90,130,169])for(const offset of [-12,0,22]) {
    const r=requireValid({mainLength:2200,jointPosition:1100,angle,offset,rootGap:1.2});
    const a=angle*Math.PI/180,b=[Math.cos(a),0,Math.sin(a)],R=101.2;
    for(let i=0;i<72;i++) {
      const theta=2*Math.PI*i/72;
      const foot=[1100-50*Math.cos(theta)*Math.sin(a),offset+50*Math.sin(theta),50*Math.cos(theta)*Math.cos(a)];
      const roots=lineCylinder(foot,b,R),point=foot.map((v,j)=>v+roots[1]*b[j]);
      near(norm(sub(point,r.geometry.branch.outerCut[i])),0,1e-7);
    }
  }
});

test('live independent quadratic verification covers angles, offsets, rotation and projection',()=>{
  for(const angle of [9,47,90,134,172])for(const azimuth of [0,73,219])for(const jointType of ['on','in']) {
    const r=requireValid({mainLength:6000,jointPosition:3000,angle,azimuth,offset:-17,jointType,
      projection:jointType==='in'?12:0,rootGap:jointType==='on'?1.3:0,tolerance:1e-7});
    const check=r.verification.find(v=>v.id==='independent-intersection');
    assert.ok(check);
    assert.equal(check.label,'獨立二次方程求交差');
    assert.equal(check.status,'pass');
    assert.ok(check.value<1e-7);
  }
});

test('projection moves each inner-wall cut along the axis and preserves tube radius',()=>{
  const a=requireValid({jointType:'in',angle:43,offset:12});
  const b=requireValid({jointType:'in',angle:43,offset:12,projection:25});
  const axis=b.geometry.axes.branchDirection;
  a.geometry.branch.outerCut.forEach((p,i)=>{
    const delta=sub(b.geometry.branch.outerCut[i],p);
    delta.forEach((v,j)=>near(v,-25*axis[j]));
    const v=sub(b.geometry.branch.outerCut[i],b.geometry.axes.branchOrigin),t=dot(v,axis);
    near(norm(v.map((v,j)=>v-t*axis[j])),50);
  });
  b.verification.filter(v=>v.id!=='chord').forEach(v=>assert.equal(v.status,'pass'));
});

test('projection equal to opposite-wall clearance is blocked',()=>{
  const clearance=2*Math.sqrt(94**2-70**2)/Math.sin(Math.PI/4);
  assert.equal(computeJoint({...params,jointType:'in',angle:45,offset:20,projection:clearance}).valid,false);
  requireValid({jointType:'in',angle:45,offset:20,projection:clearance-.01});
});

test('azimuth 90° rotates pipe top to +Y and leaves all fabrication templates invariant',()=>{
  const a=requireValid({angle:55,offset:10,padEnabled:true});
  const b=requireValid({angle:55,offset:10,padEnabled:true,azimuth:90});
  a.geometry.branch.outerCut.forEach((p,i)=>{
    const rotated=rotateAroundMain(p,90);
    rotated.forEach((v,j)=>near(v,b.geometry.branch.outerCut[i][j]));
  });
  assert.deepEqual(a.templates,b.templates.map((t,i)=>({...t,mapping:a.templates[i].mapping})));
  near(b.geometry.axes.branchDirection[2],0);
  assert.ok(b.geometry.axes.branchDirection[1]>0);
});

test('main and pad local cylindrical UV coordinates wrap back exactly',()=>{
  const r=requireValid({padEnabled:true,angle:63,azimuth:207,offset:17});
  for(const [R,uv,points] of [
    [100,r.geometry.main.outerHoleUV,r.geometry.main.outerHole3D],
    [94,r.geometry.main.innerHoleUV,r.geometry.main.innerHole3D],
    [103,r.geometry.pad.neutralHoleUV,r.geometry.pad.neutralHole3D],
  ])uv.forEach((p,i)=>near(norm(sub(cylindricalUVToWorld(p,R,207),points[i])),0));
});

test('pad inner, outer and neutral holes follow their own cylinder radius',()=>{
  const r=requireValid({padEnabled:true,angle:90,padClearance:0});
  const pad=r.geometry.pad;
  near(pad.neutralRadius,103);
  for(const [R,uv,world] of [[100,pad.innerHoleUV,pad.innerHole3D],[106,pad.outerHoleUV,pad.outerHole3D],[103,pad.neutralHoleUV,pad.neutralHole3D]]) {
    near(Math.max(...uv.map(p=>p[1]))-Math.min(...uv.map(p=>p[1])),2*R*Math.asin(50/R));
    world.forEach(p=>near(Math.hypot(p[1],p[2]),R));
  }
  assert.notDeepEqual(pad.innerHoleUV,pad.outerHoleUV);
});

for(const padShape of ['circle','ellipse','obround','rounded'])for(const padSplit of ['single','axial','circumferential']) {
  test(`pad ${padShape}/${padSplit} retains margin and real cuttable contours`,()=>{
    const r=requireValid({padEnabled:true,padShape,padSplit,offset:14,angle:57});
    const pad=r.geometry.pad;
    assert.ok(minimumContourDistance(pad.outerUV,pad.neutralHoleUV)>=35-1e-7);
    const pieces=r.templates.filter(t=>t.id.startsWith('pad'));
    assert.equal(pieces.length,padSplit==='single'?1:2);
    for(const t of pieces) {
      assert.deepEqual(t.outer[0],t.outer.at(-1));
      assert.ok(t.width>0&&t.height>0);
      assert.ok(t.outer.every(p=>p[0]>=-1e-7&&p[1]>=-1e-7));
      assert.equal(t.holes.length,padSplit==='single'?1:0);
    }
    const target=area(pad.outerUV)-area(pad.neutralHoleUV);
    const net=pieces.reduce((sum,t)=>sum+area(t.outer)-t.holes.reduce((s,h)=>s+area(h),0),0);
    near(net,target,1e-5);
    if(padSplit!=='single') {
      const axis=padSplit==='axial'?1:0,other=1-axis;
      const coords=pad.neutralHoleUV.map(p=>p[axis]),cut=(Math.min(...coords)+Math.max(...coords))/2;
      const intersectionValues=[];
      const hole=pad.neutralHoleUV;
      for(let i=0;i<hole.length-1;i++)if((hole[i][axis]<cut)!==(hole[i+1][axis]<cut)) {
        const t=(cut-hole[i][axis])/(hole[i+1][axis]-hole[i][axis]);
        intersectionValues.push(hole[i][other]+t*(hole[i+1][other]-hole[i][other]));
      }
      const low=Math.min(...intersectionValues),high=Math.max(...intersectionValues);
      for(const t of pieces)for(let i=0;i<t.outer.length-1;i++) {
        const a=t.outer[i].map((v,j)=>v+t.mapping.origin[j]),b=t.outer[i+1].map((v,j)=>v+t.mapping.origin[j]);
        if(Math.abs(a[axis]-cut)<1e-7&&Math.abs(b[axis]-cut)<1e-7) {
          const mid=(a[other]+b[other])/2;
          assert.ok(mid<=low+1e-7||mid>=high-1e-7,'seam illegally crosses the opening');
        }
      }
    }
  });
}

test('station table and external outline share circumference and end datum',()=>{
  const r=requireValid({samples:73,angle:61,offset:11});
  assert.equal(r.stationTable.length,74);
  near(r.stationTable.at(-1).circumference,100*Math.PI);
  near(r.stationTable.at(-1).outerDepth,r.stationTable[0].outerDepth);
  assert.ok(Math.min(...r.stationTable.map(s=>s.outerDepth))>=200-1e-7);
  const end=r.geometry.branch.outerEnd,axis=r.geometry.axes.branchDirection,origin=r.geometry.axes.branchOrigin;
  end.forEach(p=>near(dot(sub(p,origin),axis),r.measurements.branchAxisEnd));
});

test('midpoint chord check catches coarse oblique sampling and improves at higher density',()=>{
  const a=requireValid({angle:25,samples:36,tolerance:.001,mainLength:1800,jointPosition:900});
  const b=requireValid({angle:25,samples:360,tolerance:.001,mainLength:1800,jointPosition:900});
  const err=r=>r.verification.find(v=>v.id==='chord');
  assert.equal(err(a).status,'warning');
  assert.ok(err(b).value<err(a).value/90);
  const theta=Math.PI/36,point=[900-50*Math.cos(theta)/Math.sin(25*Math.PI/180)+Math.sqrt(10000-(50*Math.sin(theta))**2)/Math.tan(25*Math.PI/180),50*Math.sin(theta),Math.sqrt(10000-(50*Math.sin(theta))**2)];
  const mid=a.geometry.branch.outerCut[0].map((v,i)=>(v+a.geometry.branch.outerCut[1][i])/2);
  assert.ok(norm(sub(point,mid))<=err(a).value+1e-7);
});

test('chord verification includes the pad exterior and its cylindrical wrapping',()=>{
  const r=requireValid({mainLength:1000,jointPosition:500,branchOD:20,branchWall:2,angle:90,
    padEnabled:true,padMargin:100,padShape:'circle',samples:360,tolerance:.001});
  const pad=r.geometry.pad,outer=pad.outerUV,cx=(Math.min(...outer.map(p=>p[0]))+Math.max(...outer.map(p=>p[0])))/2;
  const planarRadius=Math.max(...outer.map(p=>p[0]))-cx;
  const planarSag=planarRadius*(1-Math.cos(Math.PI/360));
  const verification=r.verification.find(v=>v.id==='chord');
  assert.ok(verification.value>=planarSag-1e-7);
  assert.equal(verification.status,'warning');
  assert.ok(r.warnings.length>0);
  const rounded=requireValid({padEnabled:true,padShape:'rounded',samples:360,tolerance:.1});
  assert.equal(rounded.verification.find(v=>v.id==='chord').status,'pass');
});

test('thick oblique pad cannot have its face bores cut through the pad exterior',()=>{
  const steep={mainLength:6000,jointPosition:3000,angle:10,padEnabled:true,padThickness:30,
    padMargin:35,padShape:'circle',samples:360};
  const r=computeJoint(steep);
  assert.equal(r.valid,false);
  assert.equal(r.templates.length,0);
  assert.ok(r.errors.some(e=>e.field==='padMargin'&&e.message.includes('內面')));
  assert.ok(r.errors.some(e=>e.field==='padMargin'&&e.message.includes('外面')));
  const larger=requireValid({...steep,padMargin:130,padShape:'ellipse'});
  assert.ok(larger.measurements.padInnerEdgeClearanceNeutral>0);
  assert.ok(larger.measurements.padOuterEdgeClearanceNeutral>0);
  assert.equal(larger.verification.find(v=>v.id==='pad-margin').label,'補強板中性面最低留邊');
  requireValid({...steep,padThickness:6,padShape:'ellipse'});
});

test('invalid dimensions and nonclosed intersections produce actionable field errors',()=>{
  for(const [patch,field] of [
    [{mainWall:100},'mainWall'],[{branchWall:50},'branchWall'],[{angle:0},'angle'],
    [{angle:180},'angle'],[{mainOD:NaN},'mainOD'],[{samples:35},'samples'],
    [{offset:60},'offset'],[{branchOD:188,jointType:'in'},'offset'],
    [{projection:-1},'projection'],[{padEnabled:true,kFactor:2},'kFactor'],
  ]) {
    const r=computeJoint({...params,...patch});
    assert.equal(r.valid,false,JSON.stringify(patch));
    assert.ok(r.errors.some(e=>e.field===field));
    assert.equal(r.templates.length,0);
  }
});

test('finite main pipe ends reject host holes, fishmouth and repad overhangs',()=>{
  for(const p of [{angle:90,jointPosition:20},{angle:52,jointPosition:550},{angle:90,jointPosition:70,padEnabled:true}]) {
    const r=computeJoint({...params,...p});
    assert.equal(r.valid,false);
    assert.ok(r.errors.some(e=>['jointPosition','padMargin'].includes(e.field)));
  }
});

test('disabled repad is absent and explicit radial root gap increases fishmouth radius',()=>{
  const r=requireValid({angle:90,rootGap:2});
  assert.equal(r.geometry.pad,null);
  assert.equal(r.templates.length,2);
  r.geometry.branch.outerCut.forEach(p=>near(Math.hypot(p[1],p[2]),102));
});

const formedCase={padEnabled:true,padManufacturing:'formed-normal',mainLength:1600,jointPosition:800,padClearance:0};

test('formed-normal exact hole envelope reproduces all three dimensional references',()=>{
  for(const [p,width,height] of [
    [{mainOD:200,branchOD:100,angle:52,padThickness:6,padClearance:0},131.58953526629818,111.00294042683937],
    [{mainOD:219.1,branchOD:114.3,angle:45,padThickness:6,padClearance:0},167.64461017924486,126.83195311124098],
    [{mainOD:200,branchOD:100,angle:30,padThickness:12,padClearance:1},224.78460969082653,119.88139302173437],
  ]) {
    const r=requireValid({...formedCase,...p,samples:360});
    near(r.measurements.padHoleAxialLength,width,1e-8);near(r.measurements.padHoleArcWidth,height,1e-8);
    near(r.geometry.pad.developmentRadius,p.mainOD/2+p.padThickness);
    assert.equal(r.geometry.pad.mapping.developmentBasis,'formed-plate-outer-surface');
    assert.equal(r.verification.find(v=>v.id==='formed-envelope').status,'pass');
    assert.ok(r.verification.find(v=>v.id==='formed-envelope').value<1e-7);
  }
});

// Generic world-space point-to-axis distance, minimizing independently over
// thickness with a golden-section search. It knows no envelope x-side formula.
function worldDistanceToBranch(r,[x,u],rho) {
  const pad=r.geometry.pad,p=cylindricalUVToWorld([x,u*rho/pad.developmentRadius],rho,r.params.azimuth);
  const v=sub(p,r.geometry.axes.branchOrigin),b=r.geometry.axes.branchDirection,t=dot(v,b);
  return norm(v.map((v,i)=>v-t*b[i]));
}
function goldenMinimum(fn,lo,hi) {
  const q=(Math.sqrt(5)-1)/2;
  let x=hi-q*(hi-lo),y=lo+q*(hi-lo),fx=fn(x),fy=fn(y);
  for(let i=0;i<90;i++) {
    if(fx<fy){hi=y;y=x;fy=fx;x=hi-q*(hi-lo);fx=fn(x);}
    else{lo=x;x=y;fx=fy;y=lo+q*(hi-lo);fy=fn(y);}
  }
  return Math.min(fn(lo),fn(hi),fx,fy);
}

test('continuous-thickness envelope agrees with independent world minimization and exceeds two-face union',()=>{
  for(const [offset,azimuth,angle] of [[0,0,52],[23,74,30],[-23,231,127]]) {
    const r=requireValid({...formedCase,offset,azimuth,angle,padThickness:12,samples:144});
    const pad=r.geometry.pad,b=r.params.branchOD/2+r.params.padClearance;
    let interiorOnly=false;
    for(const uv of pad.cutHoleUV) {
      const minimum=goldenMinimum(rho=>worldDistanceToBranch(r,uv,rho),pad.innerRadius,pad.outerRadius);
      near(minimum,b,1e-6);
      if(Math.min(worldDistanceToBranch(r,uv,pad.innerRadius),worldDistanceToBranch(r,uv,pad.outerRadius))>b+.001)
        interiorOnly=true;
    }
    assert.equal(interiorOnly,true,'interior thickness must affect at least one boundary station');
    pad.cutHoleUV.forEach((uv,i)=>{
      near(norm(sub(cylindricalUVToWorld([uv[0],uv[1]*pad.innerRadius/pad.developmentRadius],pad.innerRadius,azimuth),pad.cutHoleInner3D[i])),0);
      near(norm(sub(cylindricalUVToWorld(uv,pad.outerRadius,azimuth),pad.cutHoleOuter3D[i])),0);
    });
  }
});

test('offset equal to tool radius retains its real zero-angle connecting edge',()=>{
  for(const offset of [-20,20]) {
    const r=requireValid({...formedCase,branchOD:40,branchWall:2,offset,angle:52,padThickness:12,samples:144});
    const vertices=r.geometry.pad.cutHoleUV.filter(p=>Math.abs(p[1])<1e-8);
    assert.ok(vertices.length>=2);
    const span=Math.max(...vertices.map(p=>p[0]))-Math.min(...vertices.map(p=>p[0]));
    near(span,12/Math.tan(52*Math.PI/180),1e-6);
    assert.deepEqual(r.geometry.pad.cutHoleUV[0],r.geometry.pad.cutHoleUV.at(-1));
  }
});

test('formed-normal outside-surface hole and templates are independent of K factor',()=>{
  const a=requireValid({...formedCase,kFactor:.2}),b=requireValid({...formedCase,kFactor:.8});
  assert.deepEqual(a.geometry.pad.cutHoleUV,b.geometry.pad.cutHoleUV);
  assert.deepEqual(a.templates.filter(t=>t.id.startsWith('pad')),b.templates.filter(t=>t.id.startsWith('pad')));
  assert.notEqual(a.geometry.pad.neutralRadius,b.geometry.pad.neutralRadius);
  const n=requireValid({...formedCase,padManufacturing:'neutral',kFactor:.2});
  assert.notEqual(n.geometry.pad.developmentRadius,a.geometry.pad.developmentRadius);
  assert.notDeepEqual(n.geometry.pad.cutHoleUV,a.geometry.pad.cutHoleUV);
});

for(const shape of ['circle','ellipse','obround','rounded'])for(const split of ['single','axial','circumferential']) {
  test(`formed-normal ${shape}/${split} has complete material and split contours`,()=>{
    const r=requireValid({...formedCase,padShape:shape,padSplit:split,offset:15,angle:60,padThickness:10});
    const pad=r.geometry.pad,pieces=r.templates.filter(t=>t.id.startsWith('pad'));
    assert.equal(pieces.length,split==='single'?1:2);
    assert.ok(minimumContourDistance(pad.outerUV,pad.cutHoleUV)>=35-1e-7);
    const sum=pieces.reduce((s,t)=>s+area(t.outer)-t.holes.reduce((s,h)=>s+area(h),0),0);
    near(sum,area(pad.outerUV)-area(pad.cutHoleUV),1e-5);
    assert.ok(pieces.every(t=>t.mapping.basisRadius===110));
  });
}

test('automatic precision increases resolution iteratively to the requested sampled chord tolerance',()=>{
  const r=requireValid({...formedCase,angle:30,padThickness:12,offset:20,samples:36,tolerance:.002,autoPrecision:true});
  assert.ok(r.precision.effectiveSamples>36);
  assert.equal(r.precision.requestedSamples,36);
  assert.equal(r.params.samples,r.precision.effectiveSamples);
  assert.equal(r.precision.metTolerance,true);
  assert.ok(r.precision.maxChordError<=.002);
  assert.equal(r.manufacturingReady,true);
});

test('controller-transition peak uses dense probes and disclosed numerical guard before allowing fabrication',()=>{
  const p={...formedCase,mainLength:10000,jointPosition:5000,angle:90,offset:20,
    padThickness:30,padMargin:55,padShape:'ellipse',padClearance:1,samples:300,tolerance:.0167};
  const manual=requireValid({...p,autoPrecision:false});
  assert.equal(manual.manufacturingReady,false);
  assert.ok(manual.precision.maxChordError>.0167);
  assert.equal(manual.precision.guardFactor,1.1);
  near(manual.precision.maxChordError,manual.precision.sampledMaxChordError*1.1);
  const auto=requireValid({...p,autoPrecision:true});
  assert.ok(auto.precision.effectiveSamples>300);
  assert.equal(auto.manufacturingReady,true);
});

test('manual coarse geometry remains previewable and fabrication readiness is false',()=>{
  const r=requireValid({angle:25,samples:36,tolerance:.001,mainLength:1800,jointPosition:900,autoPrecision:false});
  assert.equal(r.precision.effectiveSamples,36);
  assert.equal(r.precision.metTolerance,false);
  assert.equal(r.manufacturingReady,false);
  assert.ok(r.templates.length>0);
});

test('automatic precision stops fabrication clearly when the cap cannot satisfy tolerance',()=>{
  const r=computeJoint({...params,angle:25,samples:36,tolerance:1e-10,mainLength:1800,jointPosition:900,autoPrecision:true});
  assert.equal(r.valid,false);assert.equal(r.manufacturingReady,false);
  assert.equal(r.precision.effectiveSamples,PRECISION_SAMPLE_CAP);
  assert.equal(r.precision.cap,4096);
  assert.equal(r.precision.metTolerance,false);
  assert.equal(r.templates.length,0);
  assert.ok(r.errors.some(e=>e.field==='tolerance'&&e.message.includes('4096')));
});

test('exact station helper uses analytic geometry at arbitrary divisions rather than mesh interpolation',()=>{
  const r=requireValid({samples:36,angle:43,offset:-17,azimuth:214,jointType:'in',projection:8});
  const stations=computeExactStationTable(r,23),p=r.params,a=p.angle*Math.PI/180,b=[Math.cos(a),0,Math.sin(a)];
  assert.equal(stations.length,24);
  stations.forEach((row,i)=>{
    const theta=i===23?0:TAU*i/23;
    const foot=[p.jointPosition-50*Math.cos(theta)*Math.sin(a),p.offset+50*Math.sin(theta),50*Math.cos(theta)*Math.cos(a)];
    const roots=lineCylinder(foot,b,94);
    near(row.outerDepth,r.geometry.branch.axisEnd-roots[1]+8,1e-7);
    const expected=rotateAroundMain(foot.map((v,j)=>v+(roots[1]-8)*b[j]),p.azimuth);
    row.outerPoint.forEach((v,j)=>near(v,expected[j],1e-7));
  });
  const station1=stations[1],meshIndex=36/23,lo=Math.floor(meshIndex),t=meshIndex-lo;
  const interpolated=r.stationTable[lo].outerDepth+(r.stationTable[lo+1].outerDepth-r.stationTable[lo].outerDepth)*t;
  assert.ok(Math.abs(station1.outerDepth-interpolated)>.001);
  near(stations[23].outerDepth,stations[0].outerDepth);
  assert.deepEqual(computeExactStationTable(r.params,23),stations);
  assert.throws(()=>computeExactStationTable(r,0),RangeError);
});
