import test from 'node:test';
import assert from 'node:assert/strict';
import {endShape,horizontalEndVolume,segmentArea,equalAreaBlank,formingStrain} from '../dist/assets/tank-heads.js';
import {sectorLayout,petalLayout,circleSplice,annularLayout,polygonArea} from '../dist/assets/tank-layouts.js';
import {solveTank,tankCapacity,TANK_DEFAULTS,shapeLabel} from '../dist/assets/tank-geometry.js';
import {estimateTank,rectCircleArea} from '../dist/assets/tank-materials.js';
import {NOZZLE_DEFAULTS} from '../dist/assets/tank-nozzles.js';
const near=(a,b,tol,msg='')=>assert.ok(Math.abs(a-b)<=tol,`${msg} ${a} vs ${b} (tol ${tol})`);
const rel=(a,b,r=1e-9,msg='')=>near(a,b,Math.abs(b)*r+1e-9,msg);
// Plain composite Simpson, independent of the module's adaptive integrator.
const simpson=(f,a,b,n=20000)=>{if(!(b>a))return 0;const h=(b-a)/n;let s=f(a)+f(b);for(let i=1;i<n;i++)s+=f(a+i*h)*(i%2?4:2);return s*h/3;};
const ends=[['cone',{di:1200,t:6,angle:60,small:100}],['cone',{di:3000,t:8,angle:9.5,small:0}],['elliptical',{di:1200,t:6}],['torispherical',{di:1200,t:6,crown:1,knuckle:.06}],['torispherical',{di:2400,t:10,crown:.8,knuckle:.154}],['hemispherical',{di:1500,t:8}],['dome',{di:6000,t:6,dome:1}],['dome',{di:6000,t:6,dome:.8}]];

test('end volumes and partial fills agree with independent Simpson integration of the inside profile',()=>{
  for(const [type,o] of ends){const e=endShape(type,o),f=d=>Math.PI*e.radiusAt(d)**2;
    rel(e.volume,simpson(f,0,e.depth),1e-9,type+' volume');
    for(const k of [.1,.37,.5,.81]){const y=e.depth*k;rel(e.fillFromApex(y),simpson(f,e.depth-y,e.depth),1e-9,type+' apex fill');rel(e.fillFromTangent(y),simpson(f,0,y),1e-9,type+' tangent fill');}
  }
});
test('textbook closed forms: 2:1 head π·Di³/24, hemisphere 2/3·π·R³, cone frustum, spherical cap; torispherical depth',()=>{
  rel(endShape('elliptical',{di:2000,t:0}).volume,Math.PI*2000**3/24);
  rel(endShape('hemispherical',{di:2000,t:0}).volume,2/3*Math.PI*1000**3);
  const c=endShape('cone',{di:2000,t:0,angle:45,small:400});rel(c.depth,800);rel(c.volume,Math.PI*800*(1000**2+1000*200+200**2)/3);
  const d=endShape('dome',{di:2000,t:0,dome:1.2}),h=2400-Math.sqrt(2400**2-1000**2);rel(d.depth,h);rel(d.volume,Math.PI*h*h*(3*2400-h)/3);
  // ASME F&D on a 1212 OD: L = 1212, r = 72.72, depth = L − √((L−r)² − (Ri−r)²).
  const t=endShape('torispherical',{di:1200,t:6,crown:1,knuckle:.06});rel(t.depth,1212-Math.sqrt((1212-72.72)**2-(600-72.72)**2));
  // The crown and knuckle meet tangentially: radius and slope are continuous at the junction.
  const dj=t.knuckleDepth,eps=1e-6;near(t.radiusAt(dj-eps),t.radiusAt(dj+eps),1e-3);near((t.radiusAt(dj)-t.radiusAt(dj-1e-3))/1e-3,(t.radiusAt(dj+1e-3)-t.radiusAt(dj))/1e-3,1e-3);
});
test('mid-surface areas: cone lateral area, hemisphere 2πRm², dome cap, torispherical against numeric surface of revolution',()=>{
  const cone=endShape('cone',{di:1200,t:6,angle:60,small:100}),beta=Math.PI/3,big=600+3*Math.sin(beta),tip=50+3*Math.sin(beta);rel(cone.midArea,Math.PI*(big+tip)*(550/Math.cos(beta)));
  rel(endShape('hemispherical',{di:1500,t:8}).midArea,2*Math.PI*754**2);
  const tori=endShape('torispherical',{di:1200,t:6,crown:1,knuckle:.06});
  // Mid-surface = inside surface offset by t/2: same centres, radii L+t/2 and r+t/2.
  const L=1212+3,rk=72.72+3,a=600-72.72,b=tori.b,phiJ=tori.phiJ,psiJ=tori.psiJ;
  const knuckle=simpson(f=>2*Math.PI*(a+rk*Math.cos(f))*rk,0,phiJ),crown=simpson(s=>2*Math.PI*L*Math.sin(s)*L,0,psiJ);rel(tori.midArea,knuckle+crown,1e-9);
  assert.ok(b>0);
});
test('horizontal head partial volumes: closed forms match a 3-D grid count; full level equals the head volume',()=>{
  for(const [type,o] of ends.filter(([type])=>type!=='dome')){const e=endShape(type,o),R=e.ri;
    near(horizontalEndVolume(e,2*R),e.volume,e.volume*1e-12);near(horizontalEndVolume(e,0),0,1e-9);
    let last=-1;for(let k=1;k<=20;k++){const v=horizontalEndVolume(e,2*R*k/20);assert.ok(v>=last-1e-6,'monotonic');last=v;}
    // Independent check by integrating the wetted section area over the axis with a plain Simpson rule.
    for(const H of [.23*R,R,1.61*R]){const ref=simpson(d=>{const r=e.radiusAt(d);return segmentArea(r,H-(R-r));},0,e.depth,40000);rel(horizontalEndVolume(e,H),ref,2e-6,type+' H='+H.toFixed(1));}
  }
  // Brute-force voxel count on a coarse torispherical head (≈0.5% agreement expected from the grid).
  const e=endShape('torispherical',{di:1000,t:0,crown:1,knuckle:.1}),R=500,H=310,n=200;let inside=0;
  for(let i=0;i<n;i++)for(let j=0;j<n;j++)for(let k=0;k<n;k++){const d=(i+.5)/n*e.depth,y=(j+.5)/n*2*R-R,z=(k+.5)/n*2*R-R;if(Math.hypot(y,z)<=e.radiusAt(d)&&y+R<=H)inside++;}
  const voxel=inside/n**3*e.depth*4*R*R;rel(horizontalEndVolume(e,H),voxel,2e-3,'voxel');
});
test('cone development closes: outer arc equals mean circumference; sectors split to fit the stock and keep the total angle',()=>{
  const e=endShape('cone',{di:12000,t:6,angle:9.5,small:0}),dev=e.development;
  rel(dev.rhoOut*dev.theta*Math.PI/180,2*Math.PI*dev.bigRadius);rel(dev.rhoOut-dev.rhoIn,e.development.slant);
  const layout=sectorLayout({rhoIn:dev.rhoIn,rhoOut:dev.rhoOut,theta:dev.theta,stockWidth:1500,stockLength:6000,trim:5});
  assert.equal(layout.valid,true);
  for(const band of layout.bands){near(band.segments*band.angle,dev.theta,1e-9);assert.ok((band.w+10<=6000&&band.h+10<=1500)||(band.w+10<=1500&&band.h+10<=6000));}
  const area=layout.pieces.reduce((s,p)=>s+p.area,0);rel(area,Math.PI*(dev.rhoOut**2-dev.rhoIn**2)*dev.theta/360,2e-3,'sector area');
  const forced=sectorLayout({rhoIn:100,rhoOut:900,theta:180,stockWidth:1500,stockLength:6000,segments:3});assert.equal(forced.bands[0].segments,3);
  assert.equal(sectorLayout({rhoIn:0,rhoOut:9000,theta:300,stockWidth:500,stockLength:500,bands:1,segments:1}).valid,false);
});
test('petals: n petals reproduce each parallel circumference and fit the stock; crown disc covers the polar cap',()=>{
  const e=endShape('dome',{di:10000,t:6,dome:1}),layout=petalLayout({sphereRadius:e.sphere.radius,polarMax:e.sphere.polarMax,stockWidth:1500,stockLength:6000,trim:5});
  assert.equal(layout.valid,true);assert.ok(layout.bands.length>=1);
  for(const band of layout.bands){const outline=band.outline,width=Math.max(...outline.map(p=>p[0]))-Math.min(...outline.map(p=>p[0]));
    rel(width*band.petals,2*Math.PI*e.sphere.radius*Math.sin(band.phi2),1e-9,'outer parallel');
    assert.ok((band.w+10<=6000&&band.h+10<=1500)||(band.w+10<=1500&&band.h+10<=6000));}
  near(layout.crownAngle*e.sphere.radius*2,layout.crownDiameter,1e-9);
  const small=petalLayout({sphereRadius:500,polarMax:.3,stockWidth:1500,stockLength:6000});assert.equal(small.single,true);
});
test('spliced circle: every point of the disc is covered, full plates stay inside, laps overlap, junction distances reported',()=>{
  for(const joint of ['lap','butt']){const D=9000,s=circleSplice({diameter:D,stockWidth:1524,stockLength:6096,trim:5,joint,lap:40,gap:2}),R=D/2;
    assert.equal(s.valid,true);
    for(const plate of s.plates){assert.ok(plate.w<=6086+1e-6&&plate.h<=1514+1e-6);if(plate.kind==='full')for(const [x,y] of [[plate.x0,plate.y0],[plate.x1,plate.y1],[plate.x0,plate.y1],[plate.x1,plate.y0]])assert.ok(Math.hypot(x,y)<=R+1e-6);}
    let uncovered=0;for(let i=0;i<4000;i++){const a=i*2.399963,r=R*Math.sqrt((i+.5)/4000),x=r*Math.cos(a),y=r*Math.sin(a);const covered=s.plates.some(p=>x>=p.x0-1e-6&&x<=p.x1+1e-6&&y>=p.y0-1e-6&&y<=p.y1+1e-6);
      const gapZone=joint==='butt'&&(s.rows.some((row,k)=>k&&y>s.rows[k-1].y1&&y<row.y0)||s.plates.some((p,k)=>{const q=s.plates[k+1];return q&&q.row===p.row&&x>p.x1&&x<q.x0&&y>=p.y0&&y<=p.y1;}));if(!covered&&!gapZone)uncovered++;}
    assert.equal(uncovered,0,joint+' coverage');
    assert.ok(s.weldLength>0&&s.rowSeams.length===s.rows.length-1);
    if(joint==='lap')assert.ok(s.junctions.length>0&&s.minJunctionEdge>0);
  }
  const single=circleSplice({diameter:1000,stockWidth:1524,stockLength:3048,trim:5});assert.equal(single.plates.length,1);assert.equal(single.weldLength,0);
});
test('rectangle-circle area matches analytic quarter disc and sliver cases',()=>{
  rel(rectCircleArea(0,1000,0,1000,1000),Math.PI*1e6/4,1e-9);rel(rectCircleArea(-2000,2000,-2000,2000,1000),Math.PI*1e6,1e-9);
  const h=300,seg=1000**2*Math.acos(700/1000)-700*Math.sqrt(1000**2-700**2);rel(rectCircleArea(-1000,1000,700,1000,1000),seg,1e-9);
});
test('annular bottom: ring segments fit the stock, centre plates reach under the ring by the lap',()=>{
  const a=annularLayout({innerRadius:5400,outerRadius:6070,stockWidth:1500,stockLength:6000,trim:5,lap:40});assert.equal(a.valid,true);
  near(a.ring.pieces.length*a.ring.bands[0].angle,360,1e-9);near(a.centre.diameter,2*(5400+40),1e-9);
});
test('custom tanks: capacity solve modes round-trip for cone, torispherical, hemispherical and dome ends; horizontal labels',()=>{
  const cases=[{shape:'custom',top:'cone',bottom:'cone',topAngle:20,bottomAngle:60,bottomSmall:150},{shape:'custom',top:'torispherical',bottom:'torispherical',toriPreset:'klopper'},{shape:'custom',top:'dome',bottom:'hemispherical',domeRatio:.9},{shape:'custom',orientation:'horizontal',top:'elliptical',bottom:'torispherical',toriPreset:'korbbogen'}];
  for(const c of cases){const r=solveTank({...c,diameter:1800,height:3200});assert.equal(r.valid,true,JSON.stringify(r.issues));
    rel(r.volume,tankCapacity(1800,3200,r.input));
    rel(solveTank({...c,solve:'height',diameter:1800,volume:r.volume}).height,3200,1e-9);
    rel(solveTank({...c,solve:'diameter',height:3200,volume:r.volume}).di,1800,1e-9);
    rel(r.frame.total,r.frame.topTangent+r.ends.top.outer);}
  assert.match(shapeLabel({...TANK_DEFAULTS,shape:'custom',orientation:'horizontal',top:'elliptical',bottom:'elliptical'}),/臥式/);
  assert.match(shapeLabel({...TANK_DEFAULTS,shape:'custom',top:'cone',bottom:'flat'}),/錐頂＋平底/);
  for(const bad of [{shape:'custom',orientation:'horizontal',top:'open'},{shape:'custom',bottom:'dome'},{shape:'custom',top:'cone',topSmall:5000},{shape:'custom',top:'torispherical',toriPreset:'custom',toriKnuckle:.49,toriCrown:.4}])assert.equal(solveTank(bad).valid,false,JSON.stringify(bad));
});
test('legacy shapes and their custom equivalents produce the same estimate',()=>{
  for(const [shape,top,bottom] of [['open','open','flat'],['flat','flat','flat'],['elliptical','elliptical','elliptical']]){
    const a=estimateTank({shape,diameter:1600,height:2600,endThickness:8}),b=estimateTank({shape:'custom',top,bottom,diameter:1600,height:2600,endThickness:8});
    rel(a.volume,b.volume);rel(a.netWeight,b.netWeight);assert.equal(a.plateSheets,b.plateSheets);assert.deepEqual(a.parts.map(p=>[p.id,p.name,p.quantity]),b.parts.map(p=>[p.id,p.name,p.quantity]));
  }
});
test('cone, dome and spliced bottoms nest without overlaps and weigh by mid-surface area',()=>{
  const r=estimateTank({shape:'custom',top:'dome',bottom:'cone',bottomAngle:45,bottomSmall:200,diameter:4200,height:3000,methods:{layout:{}}});assert.equal(r.valid,true,JSON.stringify(r.issues));
  const cone=r.parts.find(p=>p.id==='BK');rel(cone.netWeight,r.ends.bottom.midArea/1e6*r.input.endThickness/1000*7850);
  const dome=r.parts.filter(p=>p.id==='TC'||p.id==='TP').reduce((s,p)=>s+p.netWeight,0);rel(dome,r.ends.top.midArea/1e6*r.input.endThickness/1000*7850,1e-9);
  const big=estimateTank({shape:'flat',diameter:9000,height:4000,methods:{layout:{bottom:'strips',top:'strips'}}});assert.equal(big.valid,true);assert.equal(big.stockComplete,true);
  for(const result of [r,big])for(const sheet of result.sheets){for(const i of sheet.placements){assert.ok(i.x>=-1e-9&&i.y>=-1e-9&&i.x+i.w<=result.input.stockLength+1e-6&&i.y+i.h<=result.input.stockWidth+1e-6);}
    for(let i=0;i<sheet.placements.length;i++)for(let j=i+1;j<sheet.placements.length;j++){const a=sheet.placements[i],b=sheet.placements[j],k=result.input.kerf;assert.ok(a.x+a.w+k<=b.x+1e-6||b.x+b.w+k<=a.x+1e-6||a.y+a.h+k<=b.y+1e-6||b.y+b.h+k<=a.y+1e-6);}}
  // Spliced weight includes the lap overlaps, so it exceeds the plain disc weight by roughly seam length × lap.
  const disc=Math.PI*(big.od+20)**2/4/1e6*.006*7850,spliced=big.parts.find(p=>p.id==='BS');assert.ok(spliced.netWeight>disc&&spliced.netWeight<disc*1.05);
  const legacy=estimateTank({shape:'flat',diameter:9000,height:4000});assert.equal(legacy.stockComplete,false);
});
test('axis-parallel nozzles on curved ends: lengths follow the inside / outside surfaces independently computed',()=>{
  const n={...NOZZLE_DEFAULTS,id:'N1',name:'頂部',host:'top',radius:300,od:114.3,thickness:6,projection:200,inside:0,end:'bare'};
  const r=estimateTank({shape:'elliptical',diameter:1200,height:2000,endThickness:6,nozzles:[n]}),a=r.nozzlePlan.items[0];assert.equal(r.nozzlePlan.valid,true,JSON.stringify(r.nozzlePlan.issues));
  const c=300,dIn=x=>c*Math.sqrt(1-(x/600)**2);
  // Outside surface of the head at the nozzle centre (offset ellipse): numeric distance search.
  let outAt=0;{let best=Infinity;for(let k=0;k<=200000;k++){const u=k/200000*Math.PI/2,x=600*Math.cos(u),y=c*Math.sin(u),nx=c*Math.cos(u),ny=600*Math.sin(u),m=Math.hypot(nx,ny),ox=x+6*nx/m,oy=y+6*ny/m;if(Math.abs(ox-300)<best){best=Math.abs(ox-300);outAt=oy;}}}
  near(a.minCutLength,200+outAt-dIn(300-57.15),.05);near(a.maxCutLength,200+outAt-dIn(300+57.15),.05);
  near(a.surface[1],r.frame.topTangent+outAt,.05);assert.deepEqual(a.direction,[0,1,0]);
  const cone=estimateTank({shape:'custom',top:'flat',bottom:'cone',bottomAngle:60,bottomSmall:120,diameter:1200,height:2000,nozzles:[{...n,host:'bottom',radius:0,od:114.3}]});assert.equal(cone.nozzlePlan.valid,true);
  const outlet=cone.nozzlePlan.items[0];near(outlet.minCutLength,outlet.maxCutLength,1e-9);near(outlet.surface[1],cone.frame.bottomTangent-cone.ends.bottom.outer,1e-6);
});
test('forming strain uses the ASME UG-79 single/double curvature forms; equal-area blank is reference only',()=>{
  near(formingStrain(6,603,'single'),50*6/603,1e-12);near(formingStrain(6,150,'double'),3,1e-12);assert.equal(formingStrain(6,0,'single'),null);
  const head=endShape('elliptical',{di:1200,t:6,straight:25});rel(equalAreaBlank(head),Math.sqrt(4*(head.midArea+Math.PI*1206*25)/Math.PI));
  assert.ok(equalAreaBlank(head)/1200>1.15&&equalAreaBlank(head)/1200<1.25);
});
