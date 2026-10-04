import test from 'node:test';
import assert from 'node:assert/strict';
import {endAlignmentMarkup,endOffsetLayout,alignmentModeAction,offsetAction,offsetSideAction,retreatAction,offsetKeyboardAction} from '../dist/assets/end-alignment-ui.js';

const p={hostType:'elbow',mainOD:219.1,branchOD:60.3,bendRadius:304.8,bendAngle:90,
 elbowAlignment:'a-offset',elbowOffset:20,elbowSideOffset:15};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const attr=(markup,name)=>Number(markup.match(new RegExp(`${name}="([^"]+)"`))?.[1]);

test('choosing coaxial alignment recovers incomplete numeric offsets explicitly',()=>{
 const incomplete={...p,elbowOffset:NaN,elbowSideOffset:5};
 const patch=alignmentModeAction(incomplete,'B','axis');
 assert.deepEqual(patch,{elbowAlignment:'b-axis',elbowOffset:0,elbowSideOffset:0});
 assert.ok(endOffsetLayout({...incomplete,...patch},'B'));
 assert.deepEqual(alignmentModeAction(p,'A','edge'),{elbowAlignment:'a-edge'});
 const edge={...p,elbowAlignment:'b-edge',elbowOffset:3,elbowSideOffset:4};
 const editable=alignmentModeAction(edge,'B','offset');
 near(editable.elbowOffset,79.4*.6);near(editable.elbowSideOffset,79.4*.8);
 near(endOffsetLayout({...edge,...editable},'B').offsetDistance,79.4);
 assert.equal(alignmentModeAction(p,'A','unknown'),null);
});

test('an incomplete offset does not erase the other editable component',()=>{
 const markup=endAlignmentMarkup({...p,elbowOffset:NaN,elbowSideOffset:5},'A');
 assert.match(markup,/name="elbowOffset"[^>]+value=""/);
 assert.match(markup,/name="elbowSideOffset"[^>]+value="5"/);
 assert.match(markup,/class="end-offset-diagram"/);
 assert.doesNotMatch(markup,/data-end-offset-map=/);
});

test('port diagrams preserve the actual diameter ratio and signed offsets in both end views',()=>{
 for(const end of ['A','B']){
  const candidate={...p,elbowAlignment:`${end.toLowerCase()}-offset`},l=endOffsetLayout(candidate,end);
  near((l.branchX-l.cx)/l.scale,(end==='A'?-1:1)*15);
  near((l.cy-l.branchY)/l.scale,20);
  const markup=endAlignmentMarkup(candidate,end);
  const mainRadius=Number(markup.match(/data-end-main-circle[^>]*r="([^"]+)"/)?.[1]);
  const branchRadius=Number(markup.match(/data-end-branch-circle[^>]*r="([^"]+)"/)?.[1]);
  assert.ok(Math.abs(branchRadius/mainRadius-p.branchOD/p.mainOD)<1e-7);
  assert.match(markup,new RegExp(`由 ${end} 管口向彎頭看`));
  assert.match(markup,end==='A'?/\+Z 在左/:/\+Z 在右/);
 }
});

test('click coordinates are exact millimetres with opposite screen directions for global +Z',()=>{
 for(const end of ['A','B']){
  const l=endOffsetLayout(p,end),action=offsetAction(p,end,l.cx+l.sideSign*37.25*l.scale,l.cy+12.75*l.scale);
  assert.equal(action.elbowAlignment,`${end.toLowerCase()}-offset`);
  near(action.elbowOffset,-12.75);near(action.elbowSideOffset,37.25);
 }
});

test('coaxial and free diagrams deliberately become offset mode when moved',()=>{
 for(const elbowAlignment of ['a-axis','b-axis','free']){
  const candidate={...p,elbowAlignment},l=endOffsetLayout(candidate,'B');
  const action=offsetAction(candidate,'B',l.cx+12*l.scale,l.cy-8*l.scale);
  assert.equal(action.elbowAlignment,'b-offset');near(action.elbowOffset,8);near(action.elbowSideOffset,12);
 }
});

test('edge picking preserves the fixed radius-difference distance and only selects direction',()=>{
 for(const end of ['A','B']){
  const candidate={...p,elbowAlignment:`${end.toLowerCase()}-edge`,elbowOffset:1,elbowSideOffset:0},l=endOffsetLayout(candidate,end);
  const action=offsetAction(candidate,end,l.cx+l.sideSign*12*l.scale,l.cy+9*l.scale);
  assert.equal(action.elbowAlignment,`${end.toLowerCase()}-edge`);
  near(action.elbowOffset,-.6);near(action.elbowSideOffset,.8);
  const next=endOffsetLayout({...candidate,...action},end);
  near(next.offsetDistance,(p.mainOD-p.branchOD)/2);
  assert.equal(offsetAction(candidate,end,l.cx,l.cy),null,'centre has no edge direction');
  const markup=endAlignmentMarkup({...candidate,...action},end);
  assert.match(markup,/class="end-common-edge"/);
  assert.match(markup,/不代表 3D 表面相切/);
  assert.match(markup,/齊線可能碰到管口/);
  assert.equal((markup.match(/readonly aria-readonly="true"/g)??[]).length,2);
 }
});

test('explicit retreat changes edge mode to a controllable offset toward the centre',()=>{
 const candidate={...p,elbowAlignment:'b-edge',elbowOffset:3,elbowSideOffset:4};
 const action=retreatAction(candidate,'B',5);
 assert.equal(action.elbowAlignment,'b-offset');
 const expected=(p.mainOD-p.branchOD)/2-5;
 near(action.elbowOffset,expected*.6);near(action.elbowSideOffset,expected*.8);
 assert.deepEqual(retreatAction(candidate,'B',999),{elbowAlignment:'b-offset',elbowOffset:0,elbowSideOffset:0});
 assert.equal(retreatAction(candidate,'B',NaN),null);
 assert.equal(retreatAction(candidate,'B',-1),null);
 assert.match(endAlignmentMarkup(candidate,'B'),/data-end-retreat="5"/);
});

test('four native side shortcuts keep distance, with an explicit 10 mm initial offset',()=>{
 const distance=Math.hypot(p.elbowOffset,p.elbowSideOffset);
 assert.deepEqual(offsetSideAction(p,'B','inner'),{elbowAlignment:'b-offset',elbowOffset:-distance,elbowSideOffset:0});
 assert.deepEqual(offsetSideAction({...p,elbowAlignment:'a-axis'},'A','z-plus'),{elbowAlignment:'a-offset',elbowOffset:0,elbowSideOffset:10});
 const edge={...p,elbowAlignment:'a-edge'};
 assert.deepEqual(offsetSideAction(edge,'A','z-minus'),{elbowAlignment:'a-edge',elbowOffset:0,elbowSideOffset:-1});
 assert.equal(offsetSideAction(p,'A','unknown'),null);
 const markup=endAlignmentMarkup({...p,elbowAlignment:'a-axis'},'A');
 assert.match(markup,/按鈕會偏移 10 mm/);
});

test('arrow keys use screen directions and real millimetres, while edge mode keeps its length',()=>{
 for(const end of ['A','B']){
  const l=endOffsetLayout(p,end),right=offsetKeyboardAction(p,end,'ArrowRight');
  near(right.elbowSideOffset,p.elbowSideOffset+l.sideSign);near(right.elbowOffset,p.elbowOffset);
  near(offsetKeyboardAction(p,end,'ArrowUp',{shiftKey:true}).elbowOffset,p.elbowOffset+5);
  assert.equal(offsetKeyboardAction(p,end,'Tab'),null);
  assert.deepEqual(offsetKeyboardAction(p,end,'Home'),{elbowAlignment:`${end.toLowerCase()}-offset`,elbowOffset:0,elbowSideOffset:0});
  const edge={...p,elbowAlignment:`${end.toLowerCase()}-edge`},action=offsetKeyboardAction(edge,end,'ArrowDown');
  near(endOffsetLayout({...edge,...action},end).offsetDistance,(p.mainOD-p.branchOD)/2);
 }
});

test('captured drags retain their original map transform while showing the current circles',()=>{
 const start={...p,elbowOffset:0,elbowSideOffset:0},next={...p,elbowOffset:70,elbowSideOffset:400};
 const initial=endAlignmentMarkup(start,'A'),during=endAlignmentMarkup(next,'A',{layoutParams:start});
 for(const name of ['data-end-scale','data-end-center-x','data-end-center-y'])near(attr(initial,name),attr(during,name));
 const normal=endAlignmentMarkup(next,'A');
 assert.notEqual(attr(initial,'data-end-scale'),attr(normal,'data-end-scale'));
 assert.match(during,/value="400"/);
});

test('large numeric offsets are displayed without silently clamping, and invalid diagram coordinates are rejected',()=>{
 const candidate={...p,elbowOffset:-2000,elbowSideOffset:1500},l=endOffsetLayout(candidate,'A');
 near(l.outward,-2000);near(l.side,1500);
 const markup=endAlignmentMarkup(candidate,'A');
 assert.match(markup,/name="elbowOffset"[^>]+value="-2000"/);
 assert.match(markup,/name="elbowSideOffset"[^>]+value="1500"/);
 assert.doesNotMatch(markup,/<input[^>]+\b(?:min|max)=/);
 for(const [x,y]of [[-1,100],[321,100],[100,-1],[100,221],[NaN,100],[100,Infinity]])assert.equal(offsetAction(p,'A',x,y),null);
 assert.equal(endOffsetLayout({...p,elbowOffset:Infinity},'A'),null);
 assert.equal(endOffsetLayout({...p,elbowAlignment:'a-edge',elbowOffset:NaN},'A'),null,'an invalid edge direction must not become the default outer direction');
 assert.equal(endOffsetLayout({...p,mainOD:0},'A'),null);
 const invalid=endAlignmentMarkup({...p,branchOD:300,elbowAlignment:'a-edge'},'A');
 assert.match(invalid,/支管外徑大於主管/);assert.doesNotMatch(invalid,/data-end-offset-map=/);
});

test('mode cards, numeric controls and diagram have independent semantic hooks',()=>{
 const markup=endAlignmentMarkup({...p,elbowAlignment:'b-offset'},'B');
 for(const value of ['b-axis','b-offset','b-edge'])assert.match(markup,new RegExp(`data-visual-field="elbowAlignment" data-visual-value="${value}"`));
 assert.match(markup,/data-visual-value="b-offset" aria-pressed="true"/);
 assert.match(markup,/data-end-offset-map="B"/);assert.doesNotMatch(markup,/data-visual-map=/);
 assert.match(markup,/id="param-elbowOffset" name="elbowOffset"/);
 assert.match(markup,/id="param-elbowSideOffset" name="elbowSideOffset"/);
 assert.match(markup,/tabindex="0" aria-label="/);
 assert.match(markup,/data-end-offset-handle/);
});
