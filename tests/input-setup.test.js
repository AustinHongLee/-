import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PARAMS, computeJoint } from '../dist/assets/geometry.js';
import { ASME_PIPE_SIZES } from '../dist/assets/pipe-sizes.js';
import { pipeSizeByNPS,pipeSizeByOD,setupFromParams,positionWithIntent,freshInputParams } from '../dist/assets/input-setup.js';
import { mainAxisSurfaceDatum } from '../dist/assets/field-datums.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('ASME inch choices use tabulated pipe OD, including small nominal sizes',()=>{
  assert.equal(ASME_PIPE_SIZES.length,24);assert.equal(new Set(ASME_PIPE_SIZES.map(s=>s.nps)).size,24);
  for(const [nps,diameter] of [['1/2',21.3],['2',60.3],['4',114.3],['8',219.1],['10',273],['12',323.8],['24',609.6]])assert.equal(pipeSizeByNPS(nps).odMm,diameter);
  assert.notEqual(pipeSizeByNPS('2').odMm,2*25.4);
});
test('fresh projects use standard inch sizes and the actual centre position',()=>{
  const p=freshInputParams(DEFAULT_PARAMS);assert.equal(p.mainOD,219.1);assert.equal(p.branchOD,114.3);
  near(mainAxisSurfaceDatum(p).axialPosition,p.mainLength/2);assert.equal(computeJoint(p).valid,true);
});
test('legacy and measured diameters are never snapped to a standard pipe',()=>{
  const p={...DEFAULT_PARAMS},original=JSON.stringify(p),setup=setupFromParams(p);
  assert.equal(setup.mainSize,'custom');assert.equal(setup.branchSize,'custom');assert.equal(setup.positionMode,'custom');
  assert.equal(pipeSizeByOD(219.099),null);assert.equal(pipeSizeByOD(219.1).nps,'8');
  near(setup.surfaceDistance,mainAxisSurfaceDatum(p).axialPosition);assert.equal(JSON.stringify(p),original);
});
test('centre stays centred and a custom physical distance stays fixed when shape changes',()=>{
  const base=freshInputParams(DEFAULT_PARAMS);
  for(const angle of [10,52,90,128,170])for(const offset of [-15,0,15])for(const mainOD of [219.1,323.8]){
    const p={...base,mainLength:1000,angle,offset,mainOD};
    near(mainAxisSurfaceDatum(positionWithIntent(p,{positionMode:'center'})).axialPosition,500);
    near(mainAxisSurfaceDatum(positionWithIntent(p,{positionMode:'custom',surfaceDistance:425})).axialPosition,425);
  }
});
test('restore honours explicit saved intent but never infers a centre lock',()=>{
  const p=freshInputParams(DEFAULT_PARAMS);
  assert.equal(setupFromParams(p).positionMode,'custom');
  assert.equal(setupFromParams(p,{positionMode:'center'}).positionMode,'center');
  assert.equal(setupFromParams({...p,jointPosition:p.jointPosition+1},{positionMode:'center'}).positionMode,'custom');
  assert.equal(setupFromParams(p,{mainSize:'6'}).mainSize,'8');
  assert.equal(setupFromParams(p,{mainSize:'custom'}).mainSize,'custom');
});
test('invalid input stays invalid and a subsequent physical entry can recover',()=>{
  const p=freshInputParams(DEFAULT_PARAMS);
  const invalid=positionWithIntent(p,{positionMode:'custom',surfaceDistance:NaN});assert.ok(Number.isNaN(invalid.jointPosition));
  near(mainAxisSurfaceDatum(positionWithIntent(invalid,{positionMode:'custom',surfaceDistance:300})).axialPosition,300);
});
test('reapplying an anchor recovers after azimuth was temporarily empty',()=>{
  const setup={positionMode:'custom',surfaceDistance:350};
  const invalid=positionWithIntent({...freshInputParams(DEFAULT_PARAMS),azimuth:NaN,angle:60},setup);
  assert.ok(Number.isNaN(invalid.jointPosition));
  const recovered=positionWithIntent({...invalid,azimuth:0},setup);
  near(mainAxisSurfaceDatum(recovered).axialPosition,350);
  assert.equal(computeJoint(recovered).valid,true);
});
