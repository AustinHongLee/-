import test from 'node:test';
import assert from 'node:assert/strict';
import {computeJoint,DEFAULT_PARAMS} from '../dist/assets/joint-model.js';
import {computeJoint as straightJoint} from '../dist/assets/geometry.js';
import {projectJSON,readProjectJSON,buildPaperPatternHTML,fabricationReadiness} from '../dist/assets/exports.js';

test('a saved straight closed-mother flag cannot silently produce a flow hole',()=>{
  const params={...DEFAULT_PARAMS,hostType:'straight',jointType:'on',motherOpening:false,padEnabled:false};
  const saved=readProjectJSON(projectJSON(params,{id:'CLOSED-STRAIGHT'}));
  for(const compute of [computeJoint,straightJoint]){
    const r=compute(saved.params);assert.equal(r.valid,false);assert.equal(fabricationReadiness(r).ready,false);
    assert.equal(r.templates.length,0);assert.equal(r.geometry,null);
    assert.ok(r.errors.some(e=>e.field==='motherOpening'));
    assert.throws(()=>buildPaperPatternHTML(r),/尺寸|有效|修正|封閉/);
  }
});
test('legacy straight configurations and explicit open on/in remain valid; mistyped flags are rejected',()=>{
  const legacy={...DEFAULT_PARAMS,padEnabled:false};delete legacy.motherOpening;
  assert.ok(straightJoint(legacy).valid);
  for(const jointType of ['on','in']){const r=computeJoint({...DEFAULT_PARAMS,jointType,motherOpening:true,padEnabled:false});assert.ok(r.valid);assert.ok(r.templates.find(t=>t.id==='main').holes.length>0);}
  const r=straightJoint({...DEFAULT_PARAMS,motherOpening:'false'});assert.equal(r.valid,false);assert.ok(r.errors.some(e=>e.field==='motherOpening'));
});
