import test from 'node:test';
import assert from 'node:assert/strict';
import {createSteelSection,DEFAULT_STEEL_PARAMS} from '../dist/assets/steel-sections.js';
import {steelTypeCards,steelChoicePatch,steelDimensionPatch,steelDimensionsMarkup,steelRotationMarkup,steelRotationAction,steelRotationKeyboardAction} from '../dist/assets/steel-ui.js';

const base={...DEFAULT_STEEL_PARAMS,branchSection:'pipe',branchOD:60.3,branchWall:3.91,jointType:'in',motherOpening:true,projection:10,padEnabled:true};
const example=kind=>({...base,...steelChoicePatch(base,kind)});
const namedInputs=markup=>[...markup.matchAll(/name="([^"]+)"/g)].map(match=>match[1]);

test('all steel graphic choices provide valid custom examples with explicit sealed support intent',()=>{
 const markup=steelTypeCards(base);
 for(const kind of ['chs','shs','rhs','h','i','l','c']){
  assert.ok(markup.includes(`data-steel-section="${kind}"`));
  const p=example(kind),section=createSteelSection(p);
  assert.equal(section.valid,true,JSON.stringify(section.errors));
  assert.equal(p.jointType,'on');assert.equal(p.motherOpening,false);assert.equal(p.projection,0);assert.equal(p.padEnabled,false);
 }
 assert.match(markup,/自訂尺寸示例/);
 assert.deepEqual(steelChoicePatch(example('rhs'),'pipe'),{branchSection:'pipe',jointType:'on',motherOpening:true,projection:0,padEnabled:false});
 assert.equal(steelChoicePatch(base,'not-a-section'),null);
 assert.equal(steelChoicePatch(example('rhs'),'rhs'),null);
});

test('shape-specific dimensions request the required material thicknesses without circular-pipe substitutes',()=>{
 assert.deepEqual(namedInputs(steelDimensionsMarkup(example('shs'))),['sectionWidth','sectionWall','sectionRadius']);
 assert.deepEqual(namedInputs(steelDimensionsMarkup(example('rhs'))),['sectionWidth','sectionHeight','sectionWall','sectionRadius']);
 assert.deepEqual(namedInputs(steelDimensionsMarkup(example('l'))),['sectionWidth','sectionHeight','sectionWall','sectionRadius']);
 for(const kind of ['h','i','c'])assert.deepEqual(namedInputs(steelDimensionsMarkup(example(kind))),['sectionWidth','sectionHeight','sectionWeb','sectionFlange','sectionRadius','sectionSlope']);
 assert.equal(steelDimensionsMarkup(example('chs')),'');
 assert.equal(steelDimensionsMarkup(base),'');
 const shs={...example('shs'),...steelDimensionPatch(example('shs'),'sectionWidth',75)};
 assert.equal(shs.sectionWidth,75);assert.equal(shs.sectionHeight,75);assert.equal(createSteelSection(shs).height,75);
});

test('section drawing uses kernel material faces and preserves real rounded corners and tube holes',()=>{
 for(const kind of ['chs','shs','rhs','h','i','l','c']){
  const p=example(kind),section=createSteelSection(p),markup=steelRotationMarkup(p);
  assert.match(markup,/fill-rule="evenodd"/);assert.doesNotMatch(markup,/NaN|Infinity|先修正截面尺寸/);
  for(const face of section.faces)assert.ok(markup.includes(`data-steel-face="${face.id}"`));
  assert.match(markup,/由支材自由端朝接頭看/);
 }
 const chs=steelRotationMarkup(example('chs'));
 // Each full cylindrical material boundary needs two SVG arcs; a start=end
 // single arc would silently disappear and misrepresent the support as solid.
 assert.ok((chs.match(/A30\.15 30\.15/g)??[]).length>=4);
 assert.ok((chs.match(/A26\.24 26\.24/g)??[]).length>=4);
});

test('rotation ring follows the fabrication datum, leaves material-face clicks alone and supports precise keyboard changes',()=>{
 const p=example('rhs');
 for(const [x,y,angle] of [[254,118,0],[160,212,90],[66,118,180],[160,24,270]])assert.equal(steelRotationAction(p,x,y)?.value,angle);
 assert.equal(steelRotationAction(p,160,118),null);assert.equal(steelRotationAction(p,320,118),null);assert.equal(steelRotationAction(base,254,118),null);
 assert.equal(steelRotationKeyboardAction({...p,sectionRotation:0},'ArrowLeft').value,359);
 assert.equal(steelRotationKeyboardAction({...p,sectionRotation:355},'ArrowRight',{shiftKey:true}).value,10);
 assert.equal(steelRotationKeyboardAction({...p,sectionRotation:NaN},'Home').value,0);
 assert.equal(steelRotationKeyboardAction({...p,sectionRotation:NaN},'ArrowRight'),null);
});

test('straight material faces have separated polygon hit areas rather than zero-size stroked lines',()=>{
 const p=example('h'),section=createSteelSection(p),markup=steelRotationMarkup(p,{selectedFace:'O1'});
 const polygons=[...markup.matchAll(/<polygon points="([^"]+)"[^>]+data-steel-face="([^"]+)"/g)];
 assert.equal(polygons.length,section.faces.filter(face=>face.kind==='line').length);
 for(const [,coordinates,id] of polygons){
  const points=coordinates.split(' ').map(q=>q.split(',').map(Number)),xs=points.map(q=>q[0]),ys=points.map(q=>q[1]);
  assert.ok(Math.max(...xs)>Math.min(...xs),`${id} has width`);assert.ok(Math.max(...ys)>Math.min(...ys),`${id} has height`);
  const face=section.faces.find(face=>face.id===id),mid=[(face.start[0]+face.end[0])/2,(face.start[1]+face.end[1])/2];
  const centre=points.reduce((sum,q)=>[sum[0]+q[0]/4,sum[1]+q[1]/4],[0,0]);
  assert.ok(Math.hypot(centre[0]-mid[0],centre[1]-mid[1])<1e-7);
  // The web's two opposite face targets must not cover the same centre area.
  if(Math.abs(mid[0])===p.sectionWeb/2&&Math.abs(mid[1])<1e-7)
   assert.ok(Math.max(...xs)-Math.min(...xs)<p.sectionWeb);
 }
 assert.match(markup,/aria-pressed="true"[^>]+aria-label="材料面 O1/);
 assert.match(markup,/stroke="#db7d18"[^>]+pointer-events="none"/);
 assert.match(markup,/<circle cx="160" cy="118" r="3"[^>]+pointer-events="none"/,'reference marker cannot steal a thin web face click');
});

test('invalid dimensions and unsupported tapered wings stay visible instead of becoming a plausible flat profile',()=>{
 const invalid={...example('h'),sectionSlope:9},markup=steelRotationMarkup(invalid);
 assert.equal(createSteelSection(invalid).valid,false);assert.match(markup,/先修正截面尺寸/);assert.match(markup,/斜翼緣/);
 assert.match(steelDimensionsMarkup(invalid),/name="sectionSlope"[^>]+value="9"/);
 assert.equal(invalid.sectionSlope,9);
 const blank={...example('rhs'),sectionWidth:NaN};assert.match(steelRotationMarkup(blank),/先修正截面尺寸/);
 assert.match(steelDimensionsMarkup(blank),/name="sectionWidth"[^>]+value=""/);
 assert.doesNotMatch(steelDimensionsMarkup(blank),/value="NaN"/);
});
