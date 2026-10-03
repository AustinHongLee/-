import test from 'node:test';
import assert from 'node:assert/strict';
import {elbowPlanLayout,visualPointerAction,physicalStraightClock,azimuthForSurfaceClock,visualKeyboardAction,visualPresetAction,straightSurfacePosition,hostTypeCards,elbowAlignmentCards,connectionCards,surfaceClockPicker,padShapeCards,conePositionPicker,branchAnglePicker,straightPositionPicker,elbowPositionPicker} from '../dist/assets/visual-selectors.js';
const p={hostType:'elbow',mainOD:219.1,offset:0,azimuth:0,mainLength:1200,jointPosition:600,angle:90,bendRadius:304.8,bendAngle:90,bendPosition:45,surfaceClock:0,elbowAlignment:'free',jointType:'on',motherOpening:true,padShape:'circle'};
test('clicking actual circular elbow projection recovers its measured cross section for 45 through 180 degrees',()=>{
 for(const bendAngle of [45,90,135,180])for(const fraction of [.05,.25,.5,.75,.95]){
  const candidate={...p,bendAngle},layout=elbowPlanLayout(candidate),beta=bendAngle*fraction;
  // Use both inner and outer skins. Selection chooses the same cross section,
  // rather than a linear approximation to the display rectangle.
  for(const minor of [-layout.r,0,layout.r]){
   const [x,y]=layout.point(beta*Math.PI/180,minor),action=visualPointerAction('elbow-position',{x,y},candidate);
   assert.equal(action.field,'bendPosition');assert.ok(Math.abs(action.value-beta)<1e-9,JSON.stringify({bendAngle,beta,minor,action}));
  }
 }
});
test('A end view makes left 90 degrees, right 270 degrees and keeps arbitrary angles',()=>{
 for(const angle of [0,23.71,45,90,180,225,270,315,359.9]){
  const a=angle*Math.PI/180,x=160-86*Math.sin(a),y=160-86*Math.cos(a),action=visualPointerAction('elbow-clock',{x,y},p);
  assert.ok(Math.abs(action.value-angle)<1e-9);
 }
 assert.equal(visualPointerAction('elbow-clock',{x:160,y:160},p),null);
});
test('straight point selection refers to actual wall entry including positive and negative eccentricity',()=>{
 for(const offset of [-80,-20,0,20,80])for(const clock of [0,10,90,180,270,350]){
  const candidate={...p,hostType:'straight',offset,azimuth:azimuthForSurfaceClock(clock,{...p,offset})};
  assert.ok(Math.abs(physicalStraightClock(candidate)-clock)<1e-9);
  const preset=visualPresetAction('surfaceContactClock',clock,candidate);assert.equal(preset.field,'azimuth');
  assert.ok(Math.abs(physicalStraightClock({...candidate,azimuth:preset.value})-clock)<1e-9);
 }
 const invalid={...p,hostType:'straight',offset:p.mainOD/2};
 assert.equal(visualPointerAction('straight-clock',{x:160,y:74},invalid),null);
});
test('straight axial clicks are physical distances, not virtual centre-plane coordinates',()=>{
 const candidate={...p,hostType:'straight',angle:45,offset:20,jointPosition:180};
 assert.ok(Math.abs(straightSurfacePosition(candidate)-(180+Math.sqrt((p.mainOD/2)**2-400)))<1e-10);
 assert.deepEqual(visualPointerAction('straight-position',{x:160,y:50},candidate),{field:'surfacePosition',value:600});
 assert.equal(visualPointerAction('straight-position',{x:999,y:50},candidate).value,1200);
});
test('coaxial mode blocks point and keyboard edits to its derived position and surface angle',()=>{
 for(const mode of ['a-axis','b-axis'])for(const kind of ['elbow-position','elbow-clock']){
  const candidate={...p,elbowAlignment:mode};
  assert.equal(visualPointerAction(kind,{x:240,y:100},candidate),null);
  assert.equal(visualKeyboardAction(kind,'ArrowRight',candidate),null);
 }
});
test('keyboard controls preserve cyclic angles and exclude elbow end faces',()=>{
 assert.equal(visualKeyboardAction('elbow-clock','ArrowRight',{...p,surfaceClock:358}).value,3);
 assert.equal(visualKeyboardAction('elbow-position','Home',p).value,.1);
 assert.equal(visualKeyboardAction('elbow-position','End',p).value,89.9);
 assert.equal(visualKeyboardAction('straight-position','ArrowLeft',{...p,hostType:'straight',jointPosition:0}).value,0);
 assert.equal(visualKeyboardAction('elbow-position','Tab',p),null);
});
test('available pictures expose real button state and correctly separate closed mother from an opening',()=>{
 assert.match(hostTypeCards(p),/data-visual-value="elbow" aria-pressed="true"/);
 assert.match(elbowAlignmentCards({...p,elbowAlignment:'b-axis'}),/data-visual-value="b-axis" aria-pressed="true"/);
 assert.match(connectionCards({...p,motherOpening:false}),/data-visual-joint="on" data-visual-opening="false"/);
 assert.match(surfaceClockPicker({...p,surfaceClock:90}),/aria-label="左側 90 度"/);
 assert.match(padShapeCards({...p,padShape:'obround'}),/data-visual-value="obround" aria-pressed="true"/);
});

test('cone position clicks select the physical axial wall-contact station in either taper direction',()=>{
 for(const [mainOD,mainEndOD]of [[219.1,114.3],[114.3,219.1]]){
  const cone={...p,hostType:'cone',mainOD,mainEndOD,mainLength:360,jointPosition:90,angle:45,offset:40};
  for(const fraction of [0,.13,.25,.5,.75,.89,1]){
   const result=visualPointerAction('cone-position',{x:28+264*fraction,y:72},cone);
   assert.equal(result.field,'jointPosition');
   assert.ok(Math.abs(result.value-360*fraction)<1e-10);
  }
  assert.deepEqual(visualPointerAction('cone-position',{x:-500,y:40},cone),{field:'jointPosition',value:0});
  assert.deepEqual(visualPointerAction('cone-position',{x:900,y:40},cone),{field:'jointPosition',value:360});
 }
 assert.equal(visualPointerAction('cone-position',{x:160,y:50},{...p,mainLength:NaN}),null);
});

test('cone wall location uses local surface clock and never applies straight eccentricity correction',()=>{
 const cone={...p,hostType:'cone',mainEndOD:114.3,surfaceClock:90,offset:999,azimuth:NaN};
 const markup=surfaceClockPicker(cone);
 assert.match(markup,/data-visual-map="cone-clock"/);
 assert.match(markup,/data-visual-field="surfaceClock" data-visual-value="90" aria-pressed="true"/);
 assert.match(markup,/由 A 朝 B 看；管頂在上/);
 assert.doesNotMatch(markup,/偏心量/);
 for(const angle of [0,41.37,90,180,270,359.9]){
  const a=angle*Math.PI/180,result=visualPointerAction('cone-clock',{x:160-86*Math.sin(a),y:160-86*Math.cos(a)},cone);
  assert.equal(result.field,'surfaceClock');assert.ok(Math.abs(result.value-angle)<1e-9);
 }
 assert.deepEqual(visualKeyboardAction('cone-clock','ArrowRight',{...cone,surfaceClock:358}),{field:'surfaceClock',value:3});
});

test('cone keyboard axial location is exact millimetres, with clamp and no branch-angle displacement',()=>{
 const cone={...p,hostType:'cone',mainEndOD:114.3,mainLength:360,jointPosition:120,angle:45};
 assert.deepEqual(visualKeyboardAction('cone-position','ArrowRight',cone),{field:'jointPosition',value:121});
 assert.deepEqual(visualKeyboardAction('cone-position','ArrowLeft',cone,{shiftKey:true}),{field:'jointPosition',value:110});
 assert.deepEqual(visualKeyboardAction('cone-position','Home',cone),{field:'jointPosition',value:0});
 assert.deepEqual(visualKeyboardAction('cone-position','End',cone),{field:'jointPosition',value:360});
 assert.equal(visualKeyboardAction('cone-position','ArrowRight',{...cone,jointPosition:359.8}).value,360);
 assert.equal(visualPresetAction('jointPosition','270',cone).value,270);
});

test('cone pictures label both end diameters and axis-length location while elbow pads identify a formed coordinate outline',()=>{
 const cone={...p,hostType:'cone',mainEndOD:114.3,mainLength:360,jointPosition:180};
 const markup=conePositionPicker(cone);
 assert.match(markup,/A · Ø219.1/);assert.match(markup,/B · Ø114.3/);
 assert.match(markup,/data-visual-map="cone-position"/);
 assert.match(markup,/data-visual-field="jointPosition" data-visual-value="180" data-visual-intent="center" aria-pressed="true"/);
 assert.match(markup,/距 A 端沿軸長/);assert.match(markup,/側視示意，非比例/);
 assert.match(branchAnglePicker(cone),/當地母線切線/);
 assert.match(padShapeCards(p),/成形板定位座標/);
 assert.match(padShapeCards(p),/不能當平板下料/);
 assert.doesNotMatch(padShapeCards(p),/這是展開基準面的外形/);
});

test('midpoint presets distinguish a persistent centre intent from arbitrary point selection for every mother shape',()=>{
 for(const markup of [straightPositionPicker({...p,hostType:'straight'}),elbowPositionPicker(p),conePositionPicker({...p,hostType:'cone',mainEndOD:114.3})]){
  assert.equal((markup.match(/data-visual-intent="center"/g)??[]).length,1);
  assert.match(markup,/<button[^>]+data-visual-intent="center"[^>]+>(正中間|彎頭中央)<\/button>/);
 }
 const action=visualPointerAction('cone-position',{x:160,y:50},{...p,hostType:'cone',mainEndOD:114.3});
 assert.equal(action.value,p.mainLength/2);
 assert.equal(action.intent,undefined,'manually touching the midpoint is still a physical-distance choice');
});

test('cone closed-mother connections remain selected when a saved sealed support is restored',()=>{
 const markup=connectionCards({...p,hostType:'cone',motherOpening:false});
 assert.match(markup,/<button[^>]+aria-pressed="true"[^>]+data-visual-joint="on" data-visual-opening="false"/);
 assert.match(markup,/母管封閉；只修支管魚口/);
 assert.equal((markup.match(/aria-pressed="true"/g)??[]).length,1);
});

