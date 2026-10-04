import test from 'node:test';
import assert from 'node:assert/strict';
import {createSteelSection,sectionPointAt,sectionContains,sectionSupport,sampleSectionBoundary} from '../dist/assets/steel-sections.js';
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<=t,`${a} vs ${b}`),dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const good=p=>{const s=createSteelSection(p);assert.ok(s.valid,JSON.stringify(s.errors));return s;};

test('all steel profiles have closed true material boundaries and serializable face metadata',()=>{
  for(const branchSection of ['chs','shs','rhs','h','i','l','c']) {
    const section=good({branchSection,branchOD:60.3,branchWall:3.91,sectionRadius:2});
    assert.ok(section.area>0);assert.equal(section.origin,'bounding-box-center');assert.deepEqual(JSON.parse(JSON.stringify(section)),section);
    for(const boundary of section.boundaries)boundary.segments.forEach((face,i)=>{
      near(dist(face.end,boundary.segments[(i+1)%boundary.segments.length].start),0);
      assert.equal(face.edgeEndId,boundary.segments[(i+1)%boundary.segments.length].edgeStartId);
      near(dist(sectionPointAt(face,0),face.start),0);near(dist(sectionPointAt(face,face.length),face.end),0);
      if(face.kind==='arc')near(face.length,face.radius*Math.abs(face.sweep));
    });
    const outline=sampleSectionBoundary(section);near(dist(outline[0],outline.at(-1)),0);
  }
});

test('sharp profiles reproduce independent material areas and hollow/concave voids are excluded',()=>{
  const p={sectionWidth:60,sectionHeight:80,sectionWall:4,sectionWeb:6,sectionFlange:8,sectionRadius:0};
  const chs=good({...p,branchSection:'chs',branchOD:60,branchWall:4});near(chs.area,Math.PI*(30**2-26**2));assert.equal(sectionContains(chs,[0,0]),false);assert.equal(sectionContains(chs,[28,0]),true);
  const rhs=good({...p,branchSection:'rhs'});near(rhs.area,60*80-52*72);assert.equal(sectionContains(rhs,[0,0]),false);assert.equal(sectionContains(rhs,[28,0]),true);
  const shs=good({...p,branchSection:'shs'});near(shs.area,60*60-52*52);assert.equal(shs.height,60);
  const h=good({...p,branchSection:'h'});near(h.area,2*60*8+6*(80-16));assert.equal(sectionContains(h,[0,0]),true);assert.equal(sectionContains(h,[20,0]),false);
  const c=good({...p,branchSection:'c'});near(c.area,2*60*8+6*(80-16));assert.equal(sectionContains(c,[-28,0]),true);assert.equal(sectionContains(c,[0,0]),false);
  const l=good({...p,branchSection:'l'});near(l.area,4*(60+80-4));assert.equal(sectionContains(l,[-28,0]),true);assert.equal(sectionContains(l,[0,0]),false);
});

test('measured root radii add material only at concave roots; tube corner arcs retain their actual inner radius',()=>{
  for(const branchSection of ['h','i','l','c']) {
    const sharp=good({branchSection,sectionRadius:0}),rounded=good({branchSection,sectionRadius:3});
    const roots={h:4,i:4,l:1,c:2}[branchSection];near(rounded.area-sharp.area,roots*9*(1-Math.PI/4));
    assert.equal(rounded.faces.filter(f=>f.kind==='arc').length,roots);
  }
  const rhs=good({branchSection:'rhs',sectionRadius:8,sectionWall:4});
  assert.ok(rhs.faces.filter(f=>f.role==='outer'&&f.kind==='arc').every(f=>f.radius===8));
  assert.ok(rhs.faces.filter(f=>f.role==='inner'&&f.kind==='arc').every(f=>f.radius===4));
});

test('rotated section support equals the maximum actual geometry projection, including asymmetric sections',()=>{
  for(const branchSection of ['rhs','l','c','h'])for(const sectionRotation of [0,23,90,147]) {
    const p={branchSection,sectionRadius:2,sectionRotation},section=good(p),a=sectionRotation*Math.PI/180;
    for(const n of [[1,0],[0,1],[.6,.8],[-.8,.6]]) {
      const points=sampleSectionBoundary(section,'O',720),sampled=Math.max(...points.map(([x,y])=>(x*Math.cos(a)-y*Math.sin(a))*n[0]+(x*Math.sin(a)+y*Math.cos(a))*n[1]));
      const h=sectionSupport(p,n);assert.ok(h>=sampled-1e-8);assert.ok(h-sampled<.001);
    }
  }
});

test('impossible thickness, overlapping roots, unsupported slopes and malformed profiles produce field errors',()=>{
  for(const [patch,field] of [[{branchSection:'rhs',sectionWall:40},'sectionWall'],[{branchSection:'l',sectionRadius:80},'sectionRadius'],[{branchSection:'h',sectionWeb:80},'sectionWeb'],[{branchSection:'i',sectionFlange:80},'sectionFlange'],[{branchSection:'c',sectionSlope:5},'sectionSlope'],[{branchSection:'chs',branchOD:60,branchWall:40},'branchWall']]) {
    const s=createSteelSection(patch);assert.equal(s.valid,false);assert.ok(s.errors.some(e=>e.field===field));
  }
  assert.ok(Number.isNaN(sectionSupport({branchSection:'none'},[1,0])));
});
