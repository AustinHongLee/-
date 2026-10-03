import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyFabricationPlan,clearFitRecords,reconcileFitRecords} from '../dist/assets/fabrication-plan.js';
import {DEFAULT_PARAMS} from '../dist/assets/joint-model.js';
test('new cone end diameters, closed contact and side movement invalidate measured fit while numeric refinement keeps it',()=>{
 const params={...DEFAULT_PARAMS,hostType:'cone',mainEndOD:323.8};
 const recorded=clearFitRecords(emptyFabricationPlan(),params);recorded.preGaps[0]=2;recorded.edgeCondition='checked';
 for(const changed of [{mainEndOD:273},{motherOpening:false},{surfaceClock:45},{branchSwivel:20}]){
  const next=reconcileFitRecords(recorded,{...params,...changed});assert.equal(next.cleared,true);assert.equal(next.plan.preGaps[0],null);assert.equal(next.plan.edgeCondition,'unknown');
 }
 const refined=reconcileFitRecords(recorded,{...params,samples:720,tolerance:.01});assert.equal(refined.cleared,false);assert.equal(refined.plan.preGaps[0],2);
});
