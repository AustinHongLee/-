import test from 'node:test';
import assert from 'node:assert/strict';
import {issueGuidance,repairCandidate,isFitupField} from '../dist/assets/repair-guidance.js';
import {computeJoint,DEFAULT_PARAMS} from '../dist/assets/joint-model.js';
const p={...DEFAULT_PARAMS,hostType:'elbow',mainOD:219.1,mainWall:6,branchOD:60.3,branchWall:3.91,bendRadius:304.8,bendAngle:90,elbowAlignment:'b-edge',elbowOffset:1,elbowSideOffset:0,jointType:'in',motherOpening:true,projection:5,padEnabled:false,samples:72,autoPrecision:false,tolerance:1};
test('end guidance displays actual millimetres and preserves the selected port',()=>{
 const g=issueGuidance({field:'holeGap',code:'mother-opening',message:'內壁沒有交線'},p);
 assert.equal(g.end,'B');assert.match(g.detail,/79\.4/);assert.match(g.title,/完整開孔/);
 assert.ok(g.actions.some(a=>a.id==='closed-support'));assert.deepEqual(p.elbowAlignment,'b-edge');
});
test('insertion cut returns to the original port; depth failures keep the depth field editable',()=>{
 const cut=issueGuidance({field:'elbowAlignment',code:'branch-cut',message:'支管範圍超過內壁'},p);assert.equal(cut.end,'B');assert.match(cut.detail,/超過內壁/);
 const depth=issueGuidance({field:'projection',code:'body-interference',message:'支管碰到另一側內壁'},p);assert.equal(depth.end,null);assert.equal(depth.actionLabel,'前往內插凸入量');
 const g=issueGuidance({field:'elbowAlignment',code:'branch-cut',message:'沒有完整內插交線'},p);
 assert.match(g.title,/完整內插/);assert.ok(g.actions.some(a=>a.id==='closed-support'));
});
test('retreat suggestions keep the opening and insertion intent until explicitly changed',()=>{
 const r=repairCandidate(p,'retreat5');assert.equal(r.elbowAlignment,'b-offset');assert.equal(r.elbowOffset,74.4);
 for(const key of ['jointType','motherOpening','projection','padEnabled','mainWall','tolerance'])assert.equal(r[key],p[key]);
 const invalid=computeJoint(r);assert.equal(invalid.valid,false,'a proposal is not claimed to be a valid repair by construction');
});
test('coaxial repair uses a valid complete calculation without altering joint type',()=>{
 const r=repairCandidate(p,'coaxial');assert.equal(r.jointType,'in');assert.equal(r.projection,5);
 assert.equal(r.elbowOffset,0);assert.equal(r.elbowSideOffset,0);assert.equal(computeJoint(r).valid,true);
});
test('opening retreat uses actual inner-wall room and preserves the selected end and opening intent',()=>{
 for(const jointType of ['on','in']){
  const source={...p,jointType},g=issueGuidance({field:jointType==='in'?'elbowAlignment':'holeGap',code:jointType==='in'?'branch-cut':'mother-opening',message:'內壁交線不完整'},source),r=repairCandidate(source,'opening-retreat');
  assert.ok(g.actions.some(a=>a.id==='opening-retreat'));assert.equal(r.elbowAlignment,'b-offset');
  assert.equal(r.jointType,jointType);assert.equal(r.motherOpening,true);assert.equal(r.projection,5);
  const tool=(jointType==='in'?p.branchOD/2:p.branchOD/2-p.branchWall)+p.holeGap;
  assert.ok(Math.abs(r.elbowOffset+tool-(p.mainOD/2-p.mainWall-1))<1e-10);
  assert.equal(computeJoint(r).valid,true);
 }
});
test('closed support is an explicit change of joint intent, not an automatic retreat',()=>{
 const r=repairCandidate(p,'closed-support');assert.equal(r.motherOpening,false);assert.equal(r.jointType,'on');assert.equal(r.projection,0);
 assert.equal(r.elbowAlignment,'b-edge');assert.equal(r.elbowOffset,1);
});
test('oversized pipe guidance names both actual diameters and points at pipe selection',()=>{
 const g=issueGuidance({field:'branchOD',message:'支管過大'},{...p,branchOD:300});
 assert.equal(g.end,null);assert.match(g.detail,/300 > 主管 Ø219\.1/);assert.equal(g.actionLabel,'選擇支管尺寸');
 const shifted=issueGuidance({field:'elbowGeometry',code:'branch-cut',message:'魚口失交'},{...p,elbowAlignment:'b-offset',branchOD:609.6});assert.equal(shifted.field,'branchOD');assert.equal(shifted.end,null);assert.equal(shifted.actions.length,0);
});
test('unfinished signed offsets are not silently made zero and return to the port',()=>{
 const candidate={...p,elbowOffset:NaN},g=issueGuidance({field:'elbowOffset',message:'請輸入有限數值。'},candidate);
 assert.equal(g.end,'B');assert.match(g.title,/未填|沒有填完整/);assert.match(g.detail,/負數、0 或正數/);assert.ok(!g.actions.some(a=>a.id==='retreat5'));
});
test('pad proposals change only pad margin; a numerical suggestion still requires calculation',()=>{
 const candidate={...p,padEnabled:true,padMargin:50},g=issueGuidance({field:'padMargin',message:'成形板需小於半個管周'},candidate),r=repairCandidate(candidate,'half-pad-margin');
 assert.equal(g.end,null);assert.match(g.title,/包得太寬/);assert.equal(r.padMargin,25);
 for(const key of Object.keys(candidate))if(key!=='padMargin')assert.equal(r[key],candidate[key]);
});
test('fabrication setup and individual fit points route to distinct visible surfaces',()=>{
 for(const field of ['fab.wpsId','fab.gapMin','fab.gapMax','fab.stock','fab.gapBasis'])assert.equal(isFitupField(field),false);
 for(const field of ['fab.pre.0','fab.post.2','fab.tack.90','fab.count','fab.edgeCondition','fab.disposition'])assert.equal(isFitupField(field),true);
 assert.equal(repairCandidate(p,'unknown'),null);
});
