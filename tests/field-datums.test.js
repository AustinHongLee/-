import assert from 'node:assert/strict';
import test from 'node:test';
import { mainAxisSurfaceDatum, jointPositionForSurface } from '../dist/assets/field-datums.js';
import { computeJoint } from '../dist/assets/geometry.js';
import { projectJSON, readProjectJSON, reportPagePlan } from '../dist/assets/exports.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('field position is the actual outside cylinder entry, not the virtual origin',()=>{
  const p={mainOD:200,angle:52,offset:0,azimuth:0,jointPosition:300},d=mainAxisSurfaceDatum(p);
  near(d.axialPosition,378.12856265067175);near(d.clockAngle,0);
  near(jointPositionForSurface(p,300),221.87143734932825);
});
test('physical field coordinate roundtrips signed offsets and obtuse angles',()=>{
  for(const angle of [30,52,90,128,150])for(const offset of [-15,0,15])for(const azimuth of [0,45,270]){
    const p={mainOD:200,angle,offset,azimuth,jointPosition:300},d=mainAxisSurfaceDatum(p);
    near(offset*offset+d.z*d.z,10000);
    const t=d.z/Math.sin(angle*Math.PI/180);near(d.axialPosition,p.jointPosition+t*Math.cos(angle*Math.PI/180));
    near(jointPositionForSurface(p,d.axialPosition),p.jointPosition);
    near(d.circumferenceFromBackSeam,Math.PI*100+100*Math.atan2(offset,d.z));
  }
});
test('an empty input does not prevent recovery on the next valid entry',()=>{
  const p={mainOD:200,angle:90,offset:15,azimuth:35,jointPosition:NaN};
  assert.equal(mainAxisSurfaceDatum(p),null);near(jointPositionForSurface(p,300),300);
  assert.ok(Number.isNaN(jointPositionForSurface({...p,offset:100},300)));
});
test('shallow physical entries can use virtual origins outside the finite pipe',()=>{
  for(const angle of [10,170]){
    const p={mainOD:200,mainLength:1000,branchOD:20,branchWall:2,angle,padEnabled:false,jointPosition:0,offset:0,azimuth:0};
    p.jointPosition=jointPositionForSurface(p,500);
    assert.ok(angle===10?p.jointPosition<0:p.jointPosition>p.mainLength);
    const r=computeJoint(p);assert.equal(r.valid,true,JSON.stringify(r.errors));
    near(readProjectJSON(projectJSON(r.params)).params.jointPosition,p.jointPosition);
    assert.ok(reportPagePlan(r,{parts:['main'],includeStations:false}).totalPages>0);
    for(const t of r.templates.filter(t=>t.id==='main'))for(const ref of t.references)for(const [,x] of ref.points)assert.ok(x>=0&&x<=1000);
    const invalid=computeJoint({...p,jointPosition:jointPositionForSurface(p,5)});
    assert.equal(invalid.valid,false);assert.ok(invalid.errors.some(e=>e.field==='jointPosition'));
  }
});
