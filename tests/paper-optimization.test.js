/** Independent checks of manufacturing paper identity and proper rigid print
 * placement. Production geometry is kept separate from the printed coordinate
 * system; every calibration ruler remains in the unrotated physical mm frame. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {computeJoint,DEFAULT_PARAMS} from '../dist/assets/joint-model.js';
import {paperPatternPlan,buildPaperPatternHTML,paperTileRegistration,templateSVG} from '../dist/assets/exports.js';

const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
const valid=params=>{const r=computeJoint(params);assert.ok(r.valid&&r.manufacturingReady,JSON.stringify(r.errors));return r;};
const straight=extra=>valid({...DEFAULT_PARAMS,mainOD:323.9,mainWall:6,mainLength:2000,jointPosition:1000,branchOD:60.3,branchWall:3.91,branchLength:200,angle:25,padEnabled:false,...extra});
const cone=extra=>valid({hostType:'cone',mainOD:323.9,mainEndOD:219.1,mainLength:700,jointPosition:350,mainWall:6,branchOD:60.3,branchWall:3.91,branchLength:200,angle:65,branchSwivel:0,surfaceClock:37,jointType:'on',motherOpening:true,padEnabled:false,tolerance:.1,samples:360,autoPrecision:true,...extra});
const points=t=>[t.outer,...t.holes,...t.references.map(r=>r.points)].flat();
const printPoint=(p,part)=>{const[a,b,c,d,e,f]=part.printTransform;return[a*p[0]+c*p[1]+e,b*p[0]+d*p[1]+f];};
const tiles=html=>[...html.matchAll(/<svg class="tile-svg"([^>]*)>([\s\S]*?)<\/svg>/g)].map(m=>({attributes:m[1],body:m[2]}));

test('one actual shallow 2-inch fishmouth saves an A4 page by a proper 90-degree print rotation',()=>{
  const result=straight(),snapshot=structuredClone(result.templates),options={parts:['branch-local'],paper:'A4',orientation:'auto'};
  const baseline=paperPatternPlan(result,{...options,optimizePieces:false}),optimized=paperPatternPlan(result,options);
  assert.equal(baseline.paperPages,2);assert.equal(optimized.paperPages,1);
  assert.equal(optimized.paper.orientation,'portrait');assert.equal(optimized.parts[0].printRotation,90);
  assert.deepEqual(result.templates,snapshot,'printing must not alter fishmouth geometry or its physical mapping');
  const original=paperPatternPlan(result,{...options,orientation:'portrait'}).parts[0].template;
  assert.deepEqual(optimized.parts[0].template,original,'paper rotation belongs to the print plan, never the template');
  assert.match(buildPaperPatternHTML(result,{},options),/圖形為省紙轉 90°/);
});

test('all three mother shapes and cylinder reinforcement retain every cut, inner edge, and dense segment point after page optimization',()=>{
  const elbow=valid({hostType:'elbow',mainOD:219.1,mainWall:6,branchOD:60.3,branchWall:3.91,branchLength:200,bendRadius:304.8,bendAngle:90,bendPosition:45,surfaceClock:40,angle:65,branchSwivel:0,jointType:'on',motherOpening:true,padEnabled:false,tolerance:.1,samples:360,autoPrecision:true});
  const fixtures=[{r:straight(),parts:['branch-local','main-local']},{r:straight({branchOD:114.3,angle:40}),parts:['branch-local','main-local']},{r:straight({padEnabled:true,padShape:'obround',padSplit:'axial',padMargin:35}),parts:['branch-local','pad-1','pad-2']},{r:cone(),parts:['branch-local','main-local','main-conical']},{r:cone({motherOpening:false}),parts:['branch-local','main-local']},{r:elbow,parts:['branch-local']}];
  for(const{r,parts}of fixtures)for(const paper of['A4','A3']){
    const optimized=paperPatternPlan(r,{parts,paper,orientation:'auto'}),baseline=paperPatternPlan(r,{parts,paper,orientation:'auto',optimizePieces:false});
    assert.ok(optimized.paperPages<=baseline.paperPages);
    for(const part of optimized.parts){
      const[a,b,c,d]=part.printTransform;near(a*d-b*c,1);near(a*a+b*b,1);near(c*c+d*d,1);near(a*c+b*d,0);
      const inside=p=>assert.ok(part.tiles.some(t=>p[0]>=t.x-1e-7&&p[0]<=t.x+t.width+1e-7&&p[1]>=t.y-1e-7&&p[1]<=t.y+t.height+1e-7),'no sheet covers a physical drawing point');
      const all=points(part.template);for(const p of all)inside(printPoint(p,part));
      for(const polyline of[part.template.outer,...part.template.holes,...part.template.references.map(q=>q.points)])for(let i=1;i<polyline.length;i++)for(const f of[.25,.5,.75])inside(printPoint(polyline[i-1].map((v,k)=>v+(polyline[i][k]-v)*f),part));
      // Dense independent box samples catch tiling gaps, including retained
      // paper material between cuts and references, rather than just vertices.
      const B=part.template.bounds;for(let i=0;i<=10;i++)for(let j=0;j<=10;j++)inside(printPoint([B.minX+B.width*i/10,B.minY+B.height*j/10],part));
      for(let i=1;i<all.length;i+=Math.max(1,Math.floor(all.length/23))){const p=all[0],q=all[i],pp=printPoint(p,part),pq=printPoint(q,part);near(Math.hypot(q[0]-p[0],q[1]-p[1]),Math.hypot(pq[0]-pp[0],pq[1]-pp[1]));}
    }
  }
});

test('canonical part aliases print once and conical local/full paper have distinct stable page identities',()=>{
  const r=cone(),options={parts:['branch','branch-local','main','main-local','main-conical']};
  const plan=paperPatternPlan(r,options);assert.equal(plan.parts.length,3);
  assert.deepEqual(plan.parts.map(p=>p.partID),['branch-local','main-local','main-conical']);
  assert.deepEqual(plan.parts.map(p=>p.prefix),['B','M','MF']);
  const reordered=paperPatternPlan(r,{parts:['main-conical','main-local','branch-local']});
  for(const p of plan.parts)assert.equal(reordered.parts.find(q=>q.partID===p.partID).prefix,p.prefix);
  const html=buildPaperPatternHTML(r,{},options),headings=[...html.matchAll(/<header class="tile-header"><h1>([^　]+)　/g)].map(m=>m[1]);
  assert.equal(new Set(headings).size,headings.length);assert.ok(headings.includes('M1')&&headings.includes('MF1'));
  assert.throws(()=>paperPatternPlan(r,{parts:['main-local',{}]}),/代號必須為文字/);
});

test('each printed registration identity is paired exactly twice at the same global point across distinct pieces',()=>{
  const r=cone({branchOD:114.3,angle:40}),plan=paperPatternPlan(r,{parts:['branch-local','main-local','main-conical'],orientation:'portrait',optimizePieces:true});
  const seen=new Map();for(const part of plan.parts)for(const tile of part.tiles)for(const mark of paperTileRegistration(part,tile,plan.paper)){
    assert.ok(mark.key.startsWith(part.prefix+'-'));
    const entry=seen.get(mark.key)??[];entry.push({part:part.partID,p:[tile.x+mark.x,tile.y+mark.y]});seen.set(mark.key,entry);
  }
  assert.ok(seen.size>10);for(const[key,entries]of seen){assert.equal(entries.length,2,key);assert.equal(entries[0].part,entries[1].part);near(entries[0].p[0],entries[1].p[0]);near(entries[0].p[1],entries[1].p[1]);}
});

test('rigid rotated drawing leaves both 100-mm calibrations outside its transform and distinguishes paper trim from metal cut',()=>{
  const r=straight(),html=buildPaperPatternHTML(r,{}, {parts:['branch-local'],orientation:'auto'}),rendered=tiles(html);assert.equal(rendered.length,1);
  for(const tile of rendered){
    const W=Number(tile.attributes.match(/width="([\d.]+)mm"/)[1]),H=Number(tile.attributes.match(/height="([\d.]+)mm"/)[1]),view=tile.attributes.match(/viewBox="([^\"]+)"/)[1].split(' ').map(Number);near(W/view[2],1);near(H/view[3],1);
    assert.match(tile.body,/data-print-rotation="90" transform="matrix\(0 1 -1 0 /);
    const frame=tile.body.indexOf('data-layer="PAPER_TILE_BORDER"');assert.ok(frame>tile.body.indexOf('data-print-rotation="90"'));
    assert.ok(tile.body.indexOf('data-calibration="horizontal-100mm"')>frame);assert.ok(tile.body.indexOf('data-calibration="vertical-100mm"')>frame);
    assert.match(tile.body,/data-calibration="horizontal-100mm"><path d="M[^\"]+h100"/);assert.match(tile.body,/data-calibration="vertical-100mm"><path d="M[^\"]+v100"/);
    assert.match(tile.body,/data-layer="PAPER_TILE_BORDER"[^>]+stroke-dasharray="1 1"/);assert.match(tile.body,/data-layer="CUT_FISHMOUTH" stroke-width="\.4"/);
  }
  assert.match(html,/沿細點頁框裁外白邊/);assert.match(html,/保留 10 mm 圖形重疊/);
});

test('full cone legends never describe the outer paper sector as metal plate cutting geometry',()=>{
  const r=cone(),html=buildPaperPatternHTML(r,{}, {parts:['main-conical']});
  assert.match(html,/細點扇環／矩形只裁紙/);assert.match(html,/外壁包覆紙樣，非鋼板落料/);assert.ok(!html.includes('實線＝金屬輪廓'));
  assert.ok(!html.includes('主管周向弧長 U →'));assert.ok(!templateSVG(r.templates.find(t=>t.id==='main')).includes('主管周向弧長 U →'),'a conical sector cannot acquire a cylindrical rectangular U axis');
  const closed=buildPaperPatternHTML(cone({motherOpening:false}),{}, {parts:['main-conical']});assert.match(closed,/禁止依輪廓開孔/);assert.match(closed,/虛線＝貼合定位/);
});
