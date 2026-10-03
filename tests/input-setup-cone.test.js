import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_PARAMS,computeJoint} from '../dist/assets/joint-model.js';
import {pipeSizeByNPS,setupFromParams,positionWithIntent} from '../dist/assets/input-setup.js';
const near=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const base={...DEFAULT_PARAMS,hostType:'cone',mainOD:219.1,mainEndOD:323.8,mainLength:600,jointPosition:300,mainWall:6,branchOD:60.3,branchWall:3.91,branchLength:200,angle:90,surfaceClock:37,branchSwivel:0,padEnabled:false};

test('cone physical station stays fixed under size and angle changes, while a centre intent follows length',()=>{
 for(const change of [{angle:60},{angle:120,mainLength:900},{mainOD:323.8,mainEndOD:219.1},{mainOD:273,mainEndOD:168.3,mainLength:800}]){
  const custom=positionWithIntent({...base,...change},{positionMode:'custom',surfaceDistance:220});
  near(custom.jointPosition,220);
  const result=computeJoint(custom);assert.equal(result.valid,true,JSON.stringify(result.errors));
  // Kernel branch origin is independently constructed on the actual cone.
  near(result.geometry.axes.branchOrigin[0],220);
  const r=custom.mainOD/2+(custom.mainEndOD-custom.mainOD)*220/(2*custom.mainLength);
  near(Math.hypot(result.geometry.axes.branchOrigin[1],result.geometry.axes.branchOrigin[2]),r);
  const centered=positionWithIntent({...base,...change},{positionMode:'center'});
  near(centered.jointPosition,centered.mainLength/2);
 }
});

test('cone drafts restore an explicit midpoint lock and standard end sizes without snapping measured diameters',()=>{
 const setup=setupFromParams(base,{positionMode:'center',mainSize:'8',endSize:'12',branchSize:'2'});
 assert.equal(setup.positionMode,'center');assert.equal(setup.mainSize,'8');assert.equal(setup.endSize,'12');
 assert.equal(pipeSizeByNPS('12').odMm,323.8);
 near(positionWithIntent({...base,mainLength:850},setup).jointPosition,425);
 const measured=setupFromParams({...base,mainEndOD:323.9},{positionMode:'center',endSize:'12'});
 assert.equal(measured.endSize,'custom','a physically measured 323.9 mm pipe must not be silently snapped to ASME 323.8 mm');
 const moved=setupFromParams({...base,jointPosition:220},{positionMode:'center'});
 assert.equal(moved.positionMode,'custom');near(moved.surfaceDistance,220);
 near(positionWithIntent({...base,jointPosition:220,mainLength:850},moved).jointPosition,220);
});

test('invalid cone axial input remains invalid, and later physical entry recovers without straight-pipe angle correction',()=>{
 const invalid=positionWithIntent(base,{positionMode:'custom',surfaceDistance:NaN});
 assert.ok(Number.isNaN(invalid.jointPosition));assert.equal(computeJoint(invalid).valid,false);
 const recovered=positionWithIntent({...invalid,angle:60},{positionMode:'custom',surfaceDistance:240});
 near(recovered.jointPosition,240);const result=computeJoint(recovered);
 assert.equal(result.valid,true,JSON.stringify(result.errors));near(result.geometry.axes.branchOrigin[0],240);
});
