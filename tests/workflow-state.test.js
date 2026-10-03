import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_PARAMS} from '../dist/assets/joint-model.js';
import {settingPanelForField,connectionMode,connectionDraftKey,changeConnection,normalizeFavoriteParams,favoriteIdentity,favoriteSummary} from '../dist/assets/workflow-state.js';

const elbow={...DEFAULT_PARAMS,hostType:'elbow',motherOpening:true,jointType:'on',padEnabled:false,rootGap:2.3,projection:0,holeGap:.7};

test('material, hidden pad and precision errors navigate to their setting panels',()=>{
  for(const field of ['hostType','mainOD','mainEndOD','mainWall','mainLength','branchOD','branchWall','branchLength','bendAngle','bendRadius'])assert.equal(settingPanelForField(field),0,field);
  for(const field of ['angle','jointType','elbowAlignment','motherOpening','jointPosition','surfaceClock','projection','holeGap','rootGap','elbowGeometry','conicalGeometry','unknown'])assert.equal(settingPanelForField(field),1,field);
  for(const field of ['padEnabled','padShape','padMargin','padManufacturing','kFactor'])assert.equal(settingPanelForField(field),2,field);
  for(const field of ['fab.stock','fab.wpsId','fab.pre.0'])assert.equal(settingPanelForField(field),3,field);
  for(const field of ['tolerance','samples','autoPrecision'])assert.equal(settingPanelForField(field),4,field);
});

test('clicking the already selected connection preserves dimensions and original objects',()=>{
  for(const [jointType,motherOpening,projection] of [['on',true,0],['in',true,17],['on',false,0]]){
    const p={...elbow,jointType,motherOpening,projection},drafts={unrelated:{rootGap:1,projection:0,holeGap:2}};
    const next=changeConnection(p,{jointType,motherOpening},drafts);
    assert.equal(next.changed,false);assert.equal(next.params,p);assert.equal(next.drafts,drafts);
    assert.equal(next.params.rootGap,2.3);assert.equal(next.params.projection,projection);assert.equal(next.params.holeGap,.7);
  }
});

test('on, in and closed retain independent connection dimensions through round trips',()=>{
  let p=elbow,drafts={};
  const move=mode=>{const next=changeConnection(p,mode,drafts);p=next.params;drafts=next.drafts;};
  move('in-open');assert.equal(p.rootGap,DEFAULT_PARAMS.rootGap);assert.equal(p.projection,0);assert.equal(p.holeGap,.7);
  p={...p,projection:23.5,holeGap:1.2};
  move('on-closed');assert.equal(p.projection,0);
  p={...p,rootGap:1.8,holeGap:3};
  move('on-open');assert.equal(p.rootGap,2.3);assert.equal(p.projection,0);assert.equal(p.holeGap,.7);
  move('in-open');assert.equal(p.projection,23.5);assert.equal(p.holeGap,1.2);
  move('on-closed');assert.equal(p.rootGap,1.8);assert.equal(p.holeGap,3);assert.equal(p.projection,0);
});

test('connection drafts are isolated by mother shape and do not alter positions or other settings',()=>{
  const original=Object.freeze({...elbow,angle:67,bendPosition:31,branchLength:285}),drafts=Object.freeze({'cone/in-open':Object.freeze({projection:77,holeGap:4,rootGap:9})});
  const next=changeConnection(original,'in-open',drafts);
  assert.equal(next.params.projection,0);assert.equal(next.params.angle,67);assert.equal(next.params.bendPosition,31);assert.equal(next.params.branchLength,285);
  assert.equal(next.drafts['cone/in-open'],drafts['cone/in-open']);assert.equal(original.jointType,'on');assert.equal(Object.keys(drafts).length,1);
  assert.equal(connectionDraftKey(original),'elbow/on-open');assert.equal(connectionMode(next.params),'in-open');
});

test('invalid edits remain available on return and closed material cannot inherit insertion',()=>{
  const p={...elbow,jointType:'in',projection:NaN,holeGap:-1};
  const a=changeConnection(p,'on-closed');assert.equal(a.params.projection,0);
  const b=changeConnection(a.params,'in-open',a.drafts);assert.ok(Number.isNaN(b.params.projection));assert.equal(b.params.holeGap,-1);
  const externalDraft={'elbow/on-closed':{projection:20,rootGap:1.1,holeGap:.9}};
  assert.equal(changeConnection(elbow,'on-closed',externalDraft).params.projection,0);
  assert.throws(()=>changeConnection(elbow,{jointType:'in',motherOpening:false}),RangeError);
  assert.throws(()=>changeConnection({...elbow,hostType:'straight'},'on-closed'),RangeError);
});

test('favorite identity merges defaults, sorts keys, normalizes numbers and does not use job metadata',()=>{
  const partial={mainOD:219.1,branchOD:114.3,angle:90,padEnabled:false};
  const complete={...DEFAULT_PARAMS,...partial};
  const reordered=Object.fromEntries(Object.entries(complete).reverse());
  assert.equal(favoriteIdentity(partial),favoriteIdentity(complete));assert.equal(favoriteIdentity(reordered),favoriteIdentity(complete));
  assert.equal(favoriteIdentity({...partial,mainOD:'219.1',id:'J-200',name:'晚班',metadata:{revision:'9'},fabrication:{preGaps:[99]}}),favoriteIdentity(complete));
  const normalized=normalizeFavoriteParams({...partial,offset:-0,azimuth:360,surfaceClock:-360,branchSwivel:720});
  assert.deepEqual(Object.keys(normalized),Object.keys(normalized).sort());assert.equal(normalized.offset,0);assert.equal(normalized.azimuth,0);assert.equal(normalized.surfaceClock,0);assert.equal(normalized.branchSwivel,0);
  assert.throws(()=>favoriteIdentity({...partial,mainWall:''}),TypeError);assert.throws(()=>favoriteIdentity({...partial,motherOpening:'false'}),TypeError);
});

test('dimensions previously colliding under the same OD/OD/angle label remain distinct favorites',()=>{
  const base={...DEFAULT_PARAMS,mainOD:219.1,branchOD:114.3,angle:90,padEnabled:false};
  const variants=[base,{...base,hostType:'elbow'},{...base,hostType:'cone',mainEndOD:323.8},
    {...base,jointType:'in'},{...base,mainWall:7.2},{...base,branchWall:6.02},
    {...base,mainLength:720},{...base,jointPosition:375},{...base,padEnabled:true},
    {...base,hostType:'cone',mainEndOD:273},{...base,hostType:'elbow',motherOpening:false}];
  assert.equal(new Set(variants.map(favoriteIdentity)).size,variants.length);
  // Records with the same complete physical and export setup are a single
  // favorite even when the job number or the order of source keys changes.
  assert.equal(favoriteIdentity({...base,id:'J-001'}),favoriteIdentity({...base,id:'J-998'}));
});

test('derived coaxial values have one favorite identity while distinct alignment choices stay distinct',()=>{
  const b={...elbow,elbowAlignment:'b-axis'};
  assert.equal(favoriteIdentity({...b,angle:90,bendPosition:45,surfaceClock:30,branchSwivel:20}),favoriteIdentity(b));
  assert.notEqual(favoriteIdentity(b),favoriteIdentity({...b,elbowAlignment:'a-axis'}));
  assert.notEqual(favoriteIdentity({...elbow,padEnabled:true,padSplit:'axial'}),favoriteIdentity({...elbow,padEnabled:true,padSplit:'circumferential'}));
});

test('favorite summaries expose the mother, connection, both end diameters, walls, pad and position',()=>{
  const cone=favoriteSummary({...elbow,hostType:'cone',mainOD:219.1,mainEndOD:323.8,branchOD:114.3,mainWall:6,branchWall:4,jointPosition:250,surfaceClock:90,angle:45});
  for(const text of ['大小管 8吋→12吋','支管4吋','外貼開孔','壁6/4mm','A起X250／側90°','45°','無補強板'])assert.ok(cone.includes(text),text);
  const pad=favoriteSummary({...elbow,elbowAlignment:'b-axis',motherOpening:false,padEnabled:true,padShape:'obround',padSplit:'axial'});
  assert.match(pad,/封閉外焊/);assert.match(pad,/B端同軸/);assert.match(pad,/成形補強長圓雙片t6/);assert.ok(pad.length<140);
  const measured=favoriteSummary({...DEFAULT_PARAMS,mainOD:220.2,branchOD:101.6,angle:90,jointPosition:300,padEnabled:false});
  assert.match(measured,/直管 Ø220\.2/);assert.match(measured,/基準端X300／側0°/);
});
