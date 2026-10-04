import test from 'node:test';
import assert from 'node:assert/strict';
import {issueGuidance,repairCandidate} from '../dist/assets/repair-guidance.js';

const base={branchSection:'rhs',sectionWidth:60,sectionHeight:40,sectionWall:3,sectionWeb:5,sectionFlange:8,sectionRadius:6,sectionRotation:0,sectionSlope:0,
 hostType:'straight',mainOD:219.1,mainWall:6,mainLength:500,jointPosition:250,branchOD:60.3,branchWall:3.91,branchLength:200,
 elbowAlignment:'free',jointType:'on',motherOpening:false,projection:0,padEnabled:false,autoPrecision:true,tolerance:.1};

test('steel material-contact failures route to actual position and explain why empty centre is allowed',()=>{
 const error={field:'branchSection',code:'steel-contact',message:'O3 的材料母線沒有交點，截面 u=30、v=20 mm。'};
 const guide=issueGuidance(error,{...base,branchSection:'h'});
 assert.equal(guide.routeField,'jointPosition');assert.equal(guide.end,null);assert.match(guide.detail,/O3/);assert.match(guide.detail,/中心線不必穿過實材/);assert.deepEqual(guide.actions,[]);
 const aligned=issueGuidance({...error,field:'elbowAlignment'},{...base,hostType:'elbow',elbowAlignment:'b-edge',elbowOffset:1,elbowSideOffset:0});
 assert.equal(aligned.end,'B');assert.deepEqual(aligned.actions,[]);
 for(const id of ['retreat5','opening-retreat','coaxial','closed-support','half-pad-margin'])assert.equal(repairCandidate({...base,hostType:'elbow',elbowAlignment:'b-edge'},id),null);
});

test('actual thickness, radius and tapered-wing mistakes display measured values and their true shape conditions',()=>{
 const wall=issueGuidance({field:'sectionWall',code:'steel-section',message:'壁厚造成內孔為零。'},{...base,sectionWall:22});
 assert.match(wall.detail,/22 mm/);assert.match(wall.detail,/小於 20 mm/);assert.deepEqual(wall.actions,[]);
 const hRadius=issueGuidance({field:'sectionRadius',code:'steel-section',message:'相鄰圓角重疊。'},{...base,branchSection:'h',sectionWidth:80,sectionHeight:100,sectionWeb:5,sectionFlange:8,sectionRadius:40});
 assert.match(hRadius.detail,/小於 37.5 mm/);assert.match(hRadius.detail,/40 mm/);
 const taper=issueGuidance({field:'sectionSlope',code:'steel-section',message:'斜翼緣未支援。'},{...base,branchSection:'i',sectionSlope:9});
 assert.match(taper.detail,/9°/);assert.match(taper.detail,/不把實際斜度改成 0/);assert.deepEqual(taper.actions,[]);
 const shs=issueGuidance({field:'sectionHeight',message:'尺寸無效。'},{...base,branchSection:'shs'});assert.equal(shs.routeField,'sectionWidth');
});

test('explicit steel intent repairs preserve dimensions and precision rather than use circular pipe shortcuts',()=>{
 const p={...base,motherOpening:true,jointType:'in',projection:10,padEnabled:true,sectionRotation:37};
 const guide=issueGuidance({field:'motherOpening',code:'closed-intent',message:'鋼構須封閉外焊。'},p);
 assert.equal(guide.actions[0].id,'steel-closed');
 const candidate=repairCandidate(p,'steel-closed');
 for(const field of ['sectionWidth','sectionHeight','sectionWall','sectionWeb','sectionFlange','sectionRadius','sectionRotation','jointPosition','tolerance'])assert.equal(candidate[field],p[field]);
 assert.equal(candidate.motherOpening,false);assert.equal(candidate.jointType,'on');assert.equal(candidate.projection,0);assert.equal(candidate.padEnabled,false);
 const precise=repairCandidate({...base,autoPrecision:false},'steel-auto-precision');assert.equal(precise.autoPrecision,true);assert.equal(precise.tolerance,.1);assert.equal(precise.sectionRadius,6);
});
