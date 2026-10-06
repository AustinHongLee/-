import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_OFFSET,computeOffset,elbowCutStations,offsetCenterline,offsetSurfaceFrame,dot} from '../dist/assets/offset-geometry.js';
import {offsetProjectJSON,readOffsetProject,offsetCSV,buildOffsetWorkOrder,buildOffsetStripPaper,offsetStripPlan,measuringStripSVG} from '../dist/assets/offset-exports.js';
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} vs ${b}`);
const minus=(a,b)=>a.map((v,i)=>v-b[i]);
const magnitude=v=>Math.hypot(...v);
const valid=p=>{const r=computeOffset(p);assert.equal(r.valid,true,JSON.stringify(r.errors));return r;};

test('simple 45 offset distinguishes theoretical travel, two different takeouts and two independent gaps',()=>{
  const r=valid({rise:2000,aKind:'factory',bKind:'factory',aTakeout:127,bTakeout:126,aGap:2,bGap:3});
  near(r.travel,2828.42712474619);near(r.run,2000);near(r.cutLength,2570.42712474619);
  near(r.faceDistance-r.cutLength,5);assert.equal(r.elbows.a.stations.length,0);
});
test('3-4-5 rolling offsets are invariant under signed directions and reverse solve the same endpoints',()=>{
  for(const [rise,roll]of [[300,400],[-300,400],[300,-400],[-300,-400],[0,500],[500,0]]){
    const a=valid({layout:'rolling',rise,roll,angle:45}),b=valid({layout:'rolling',rise,roll,solve:'run',run:500});
    near(a.offset,500);near(a.travel,Math.sqrt(500000));near(b.travel,a.travel);near(b.angle,a.angle);near(b.cutLength,a.cutLength);
    near(magnitude(a.direction),1);near(a.direction[1]*a.travel,roll);near(a.direction[2]*a.travel,rise);
  }
  near(valid({layout:'rolling',rise:-300,roll:400}).rollAngle,126.869897645844);
});
test('90 degree two elbow offsets have zero theoretical run and still require positive inter-elbow pipe',()=>{
  const r=valid({angle:90,rise:1000});near(r.run,0);near(r.travel,1000);near(r.cutLength,695.2);
  const b=valid({solve:'run',run:0,rise:1000});near(b.angle,90);near(b.cutLength,r.cutLength);
});
test('factory fitting angles must match computed angle; cutting cannot exceed donor angle',()=>{
  assert.equal(computeOffset({solve:'run',run:800,aKind:'factory'}).valid,false);
  assert.equal(computeOffset({angle:60,aDonor:45}).valid,false);
  assert.equal(computeOffset({aKind:'factory',aFactoryAngle:44.9}).valid,false);
  assert.equal(valid({angle:37,aDonor:37,bDonor:37}).elbows.a.stations[0].removed,0);
});
test('empty, mistyped, nonfinite and impossible sizes cannot retain a fabrication result',()=>{
  for(const p of [{rise:null},{rise:0},{od:0},{od:'114.3'},{angle:0},{angle:91},{angle:1e-300},{run:-1,solve:'run'},{aRadius:57.15},{aRadius:Infinity},{aGap:null},{bGap:-1},{aTakeout:0,aKind:'factory'},{stations:9},{layout:'wrong'},{solve:'wrong'},{aKind:'wrong'},{rise:100,angle:90}]){
    const r=computeOffset(p);assert.equal(r.valid,false,JSON.stringify(p));assert.ok(r.errors.length);
    assert.throws(()=>buildOffsetWorkOrder(r));assert.throws(()=>buildOffsetStripPaper(r));
  }
  assert.equal(valid({layout:'planar',roll:null}).roll,0);
});
test('actual elbow tangent endpoints independently close the requested offset and straight-pipe axis',()=>{
  for(const angle of [22.5,37,45,60,90])for(const sign of [-1,1]){
    const r=valid({layout:'rolling',rise:1000*sign,roll:700,angle,aRadius:160,bRadius:200,aGap:2,bGap:4});
    const a=offsetCenterline(r,'a',1),b=offsetCenterline(r,'b',0),d=minus(b,a);
    near(magnitude(d),r.faceDistance);near(dot(d,r.direction),r.faceDistance);
    for(let i=0;i<3;i++)near(d[i],r.direction[i]*r.faceDistance);
    const entry=offsetCenterline(r,'a',0),exit=offsetCenterline(r,'b',1);
    near(entry[1],0);near(entry[2],0);near(exit[1],700);near(exit[2],1000*sign);
    for(const end of ['a','b'])for(const fraction of [0,.3,1]){
      const f=offsetSurfaceFrame(r,end,fraction);near(magnitude(f.tangent),1);near(dot(f.tangent,f.outside),0);near(dot(f.tangent,f.side),0);near(dot(f.side,f.outside),0);
    }
  }
});
test('cut marks lie on a single plane normal to the retained outlet and their arc lengths agree with numerical integration',()=>{
  const Rc=152.4,od=114.3,angle=37,theta=angle*Math.PI/180,rows=elbowCutStations(Rc,od,angle,24,90);
  const c=[Rc*Math.sin(theta),0,Rc*(1-Math.cos(theta))],normal=[Math.cos(theta),0,Math.sin(theta)];
  for(const s of rows){
    near(dot(minus(s.point,c),normal),0);near(magnitude(minus(s.point,c)),od/2);
    // Independent dense polyline in 3D, rather than reusing the arc-length formula.
    const phi=s.clock*Math.PI/180,rho=Rc+od/2*Math.cos(phi);let length=0,previous=[0,od/2*Math.sin(phi),Rc-rho];
    for(let i=1;i<=10000;i++){const b=theta*i/10000,q=[rho*Math.sin(b),od/2*Math.sin(phi),Rc-rho*Math.cos(b)];length+=magnitude(minus(q,previous));previous=q;}
    near(s.kept,length,1e-6);
  }
  near(rows[0].kept-rows[12].kept,od*theta);near(rows[0].kept,rows[24].kept);near(rows[24].around,Math.PI*od);
});
test('project JSON preserves fabrication mode and all dimensions, rejects unrelated or incomplete projects',()=>{
  const params={...DEFAULT_OFFSET,layout:'rolling',rise:-500,roll:300,aKind:'factory',aGap:2},text=offsetProjectJSON(params,'現場 OFF-002');
  const data=readOffsetProject(text);assert.deepEqual(data.params,params);assert.equal(data.id,'現場 OFF-002');
  assert.throws(()=>readOffsetProject('{"version":1,"params":{}}'));
  const incomplete=JSON.parse(text);delete incomplete.params.od;assert.throws(()=>readOffsetProject(JSON.stringify(incomplete)));
  const wrong=JSON.parse(text);wrong.params.aGap=null;assert.throws(()=>readOffsetProject(JSON.stringify(wrong)));
});
test('CSV preserves signed offsets, independent gaps and true closed station data with UTF-8 BOM',()=>{
  const r=valid({layout:'rolling',rise:-500,roll:300,aGap:0,bGap:2}),csv=offsetCSV(r);
  assert.ok(csv.startsWith('\uFEFF'));assert.match(csv,/"高低差／平面偏移","-500"/);assert.match(csv,/"A 端焊口間隙","0"/);assert.match(csv,/"B 端焊口間隙","2"/);
  assert.match(csv,/"A","360"/);assert.match(csv,/"B","360"/);
});
test('physical measuring-strip tiles overlap by 10mm and retain every station endpoint exactly once or in the overlap',()=>{
  const r=valid({od:219.1,aRadius:600,bRadius:500,rise:3000,angle:60,stations:24});
  for(const paper of ['A4','A3']){
    const plan=offsetStripPlan(r,paper),groups=new Map();
    for(const row of plan.rows){const key=row.end+'-'+row.station.index;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);assert.match(measuringStripSVG(row),new RegExp(`width="${plan.width}mm"`));}
    assert.equal(groups.size,48);
    for(const group of groups.values()){
      for(let i=1;i<group.length;i++)near(group[i-1].start+group[i-1].width-group[i].start,10);
      assert.equal(group[0].start,0);assert.ok(group.at(-1).start+group.at(-1).width>=group[0].station.kept+5);
    }
    const html=buildOffsetStripPaper(r,'OFF-TEST',paper);assert.equal((html.match(/<section class="page">/g)||[]).length,plan.pages);
    assert.match(html,/水平 100 mm/);assert.match(html,/垂直 100 mm/);assert.match(html,/量尺寬度只供拿取/);
  }
});
test('paper safeguards prevent pathological output and factory-only mode still prints an order',()=>{
  const r=valid({aKind:'factory',bKind:'factory'});assert.throws(()=>offsetStripPlan(r));assert.match(buildOffsetWorkOrder(r),/現成彎頭/);
  const giant=valid({aRadius:999999,bRadius:999999,rise:1e7});assert.throws(()=>offsetStripPlan(giant));
  assert.throws(()=>offsetStripPlan(valid({}),'A5'));
});
test('printable work orders escape user labels and retain full 24-point tables including closure',()=>{
  const html=buildOffsetWorkOrder(valid({stations:24}),'A<img src=x onerror=alert(1)>');
  assert.match(html,/A&lt;img/);assert.doesNotMatch(html,/<img src=x/);assert.equal((html.match(/<td>360<\/td>/g)||[]).length,2);
  assert.match(html,/沿弧/);assert.match(html,/兩個既有管口/);
});
