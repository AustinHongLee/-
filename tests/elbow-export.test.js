/** Read-only integration checks; run against the current Site checkout.
 * Override PIPE_ELBOW_TEST_ROOT to test another checkout. No browser required.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL,fileURLToPath } from 'node:url';

const root = process.env.PIPE_ELBOW_TEST_ROOT ?? fileURLToPath(new URL('../',import.meta.url));
const load = name => import(pathToFileURL(`${root}/dist/assets/${name}.js`));
const [{ computeJoint, computeExactStationTable, DEFAULT_PARAMS }, exp, fab] = await Promise.all([
  load('joint-model'), load('exports'), load('fabrication-plan'),
]);
const near = (a, b, epsilon = 1e-7, label = '') => assert.ok(Math.abs(a - b) <= epsilon,
  `${label}: ${a} != ${b} (allow ${epsilon})`);
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const subtract = (a, b) => a.map((x, i) => x - b[i]);
const fixtures = [];
for (const jointType of ['on', 'in']) for (const angle of [45, 90]) {
  const result = computeJoint({ ...DEFAULT_PARAMS, hostType: 'elbow',
    mainOD: 219.1, mainWall: 6, branchOD: 114.3, branchWall: 4, branchLength: 200,
    bendRadius: 304.8, bendAngle: 90, bendPosition: 45, surfaceClock: 0, branchSwivel: 0,
    angle, jointType, rootGap: 1, holeGap: .5, projection: jointType === 'in' ? 5 : 0,
    padEnabled: false, samples: 37, tolerance: .1, autoPrecision: true, offset: 0, azimuth: 0,
  });
  fixtures.push({ result, name: `${jointType}/${angle} degrees` });
}
const stockPlan = { ...fab.emptyFabricationPlan(), stock: 3, markError: .5, cutError: 1, kerf: 1.6 };

test('8/4 inch on/in 45/90 routes to finite elbow with non-divisible adaptive sample count', () => {
  for (const { result: r, name } of fixtures) {
    assert.equal(r.valid, true, `${name}: ${JSON.stringify(r.errors)}`);
    assert.equal(r.manufacturingReady, true, name);
    assert.equal(r.params.hostType, 'elbow');
    assert.ok(r.geometry.elbow, name);
    assert.ok(!r.templates.some(t => t.id === 'main'), 'a torus must not acquire a flat mother wrap');
    assert.equal(r.capabilities.wholeHostDevelopment, false);
    assert.equal(r.capabilities.roughCut, false);
    assert.ok(r.params.samples > 37, 'fixture must exercise adaptive resampling');
    assert.notEqual(r.params.samples % 24, 0, 'fixture must not accidentally contain every 15-degree mark');
  }
});

test('exact fabrication stations refer to actual 3D branch edges and original free-end depth', () => {
  for (const { result: r, name } of fixtures) {
    const stations = computeExactStationTable(r, 24), axes = r.geometry.axes;
    assert.equal(stations.length, 25);
    for (let i = 0; i < stations.length; i++) {
      const s = stations[i];
      near(s.angle, i * 15, 1e-9, name);
      near(s.circumference, Math.PI * r.params.branchOD * i / 24, 1e-8, name);
      for (const [edge, radius] of [['outer', r.params.branchOD / 2], ['inner', r.params.branchOD / 2 - r.params.branchWall]]) {
        const displacement = subtract(s[`${edge}Point`], axes.branchOrigin);
        const axial = dot(displacement, axes.branchDirection);
        const radial = displacement.map((x, j) => x - axial * axes.branchDirection[j]);
        near(Math.hypot(...radial), radius, 1e-7, `${name} ${edge} radius`);
        near(s[`${edge}Depth`], r.geometry.branch.axisEnd - axial, 1e-7, `${name} free-end datum`);
      }
    }
    near(stations[0].outerDepth, stations.at(-1).outerDepth);
    near(stations[0].innerDepth, stations.at(-1).innerDepth);
  }
});

test('mouth paper preserves every original cut in millimetres with outward mirror handedness', () => {
  for (const { result: r, name } of fixtures) {
    const wrap = exp.createBranchCuttingWrap(r, { stationCount: 24, datumStep: 1 });
    const m = wrap.mapping, c = Math.PI * r.params.branchOD;
    near(m.circumference, c, 1e-8, name);
    assert.equal(m.paperTransform, 'branch-mirror-x');
    assert.equal(m.turnHandedness, 'clockwise-view-from-free-end');
    assert.ok(Number.isInteger(m.originalDepthOrigin));
    near(m.localDatumY + m.paperTopDepth, m.originalDepthOrigin);
    near(wrap.width, c + m.glueTab);
    for (const [source, type] of [[m.originalOuterCut, 'cut-line'], [m.originalInnerEdge, 'inner-edge']]) {
      const visible = wrap.references.find(ref => ref.type === type)?.points;
      assert.equal(visible.length, source.length);
      for (let i = 0; i < visible.length; i++) {
        near(visible[i][0] + source[i][0], c, 1e-8, `${name} wrap X`);
        near(visible[i][1] + m.paperTopDepth, source[i][1], 1e-8, `${name} original depth`);
      }
    }
    const outer = wrap.references.find(ref => ref.type === 'cut-line');
    assert.equal(outer.closed, false, 'the paper frame must not close the metal mouth cut');
    near(outer.points[0][0], c); near(outer.points.at(-1)[0], 0);
    const expectedStations = computeExactStationTable(r, 24);
    for (const [i, s] of m.stations.entries()) {
      const expected = expectedStations[i];
      near(s.outerDepth, expected.outerDepth, 1e-7, name);
      near(s.innerDepth, expected.innerDepth, 1e-7, name);
    }
  }
});

test('full paper and repeated conversion do not erase the physical free-end datum', () => {
  const r = fixtures[0].result, original = r.templates.find(t => t.id === 'branch');
  const full = exp.createBranchFieldTemplate(original, r);
  near(full.mapping.originalDepthOrigin, 0);
  assert.equal(full.mapping.localCuttingWrap, false);
  assert.deepEqual(exp.createBranchFieldTemplate(full, r), full);
  const fullRecipe = exp.paperPositionRecipe(full);
  assert.ok(!/平板下料|先切平板|捲彎/.test(fullRecipe), 'full branch wrap must not use the flat-pad recipe');
  assert.match(fullRecipe, /自由直端|自由端/);
  const local = exp.createBranchCuttingWrap({ ...r, templates: [full] }, { datumStep: 1 });
  assert.deepEqual(local.mapping.originalOuterCut, full.mapping.originalOuterCut);
  assert.deepEqual(local.mapping.originalInnerEdge, full.mapping.originalInnerEdge);
  for (const point of local.references.find(ref => ref.type === 'cut-line').points)
    assert.ok(point[1] + local.mapping.paperTopDepth >= r.params.branchLength - 1e-7);
});

test('fixed report stations are computed exactly even when adaptive samples miss 15-degree marks', () => {
  for (const { result: r, name } of fixtures) {
    const plan = exp.reportPagePlan(r, { parts: ['branch'], stationCount: 24, branchPattern: 'local' });
    const rows = plan.stationSheets.flatMap(sheet => sheet.rows), exact = computeExactStationTable(r, 24);
    assert.equal(rows.length, 25, name);
    for (let i = 0; i < rows.length; i++) {
      near(rows[i].angle, exact[i].angle);
      near(rows[i].outerDepth, exact[i].outerDepth, 1e-7, name);
      near(rows[i].innerDepth, exact[i].innerDepth, 1e-7, name);
    }
  }
});

test('elbow paper recipes name the local tangent and retain ideal-surface limitations', () => {
  const r = fixtures[0].result, wrap = exp.createBranchCuttingWrap(r, { datumStep: 1 });
  const recipe = exp.paperPositionRecipe(wrap), notes = wrap.notes.join('\n');
  assert.ok(!/平行主管軸線|0° 母線朝主管基準端/.test(`${recipe}\n${notes}`),
    'elbow paper still describes a global straight mother axis');
  assert.match(`${recipe}\n${notes}`, /切線|切向/);
  assert.match(notes, /理想/);
  assert.match(notes, /粗切|包絡/);
});

test('SVG/DXF have 1:1 mm calibration, mirrored open mouth cut, and no torus hole cut', () => {
  const wrap = exp.createBranchCuttingWrap(fixtures[0].result, { datumStep: 1 });
  const svg = exp.templateSVG(wrap);
  const outer = svg.match(/<svg[^>]*width="([\d.]+)mm"[^>]*height="([\d.]+)mm"[^>]*viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  assert.ok(outer);
  near(Number(outer[1]), Number(outer[3]), 1e-9); near(Number(outer[2]), Number(outer[4]), 1e-9);
  assert.match(svg, /data-calibration="horizontal-100mm"/);
  assert.match(svg, /data-calibration="vertical-100mm"/);
  assert.match(svg, /data-layer="PAPER_BOUNDARY"/);
  const fish = svg.match(/<path d="([^"]+)" data-layer="CUT_FISHMOUTH"/);
  assert.ok(fish); assert.doesNotMatch(fish[1], /Z\s*$/);
  assert.doesNotMatch(svg, /<g data-layer="CUT_HOLE">\s*<path/);
  const dxf = exp.templateDXF(wrap);
  assert.match(dxf, /\$INSUNITS\r\n70\r\n4/);
  const entities = dxf.split('0\r\nLWPOLYLINE\r\n').slice(1);
  const cut = entities.find(entity => /8\r\nCUT_FISHMOUTH\r\n/.test(entity));
  assert.ok(cut); assert.match(cut, /70\r\n0\r\n/);
  const coordinates = [...cut.matchAll(/10\r\n([-\d.]+)\r\n20\r\n([-\d.]+)\r\n/g)].map(m => [Number(m[1]), Number(m[2])]);
  const expected = wrap.references.find(ref => ref.type === 'cut-line').points;
  assert.equal(coordinates.length, expected.length);
  for (let i = 0; i < coordinates.length; i++) {
    near(coordinates[i][0], expected[i][0], 1e-6);
    near(coordinates[i][1] + expected[i][1], wrap.height, 1e-6);
  }
});

test('compact branch paper pages cover every metal cut at physical scale', () => {
  const r = fixtures[0].result;
  const plan = exp.paperPatternPlan(r, { parts: ['branch-local'], orientation: 'landscape' });
  assert.equal(plan.parts.length, 1);
  for (const { template: t, tiles } of plan.parts) for (const ref of t.references) for (const [x, y] of ref.points)
    assert.ok(tiles.some(tile => x >= tile.x - 1e-7 && x <= tile.x + tile.width + 1e-7 &&
      y >= tile.y - 1e-7 && y <= tile.y + tile.height + 1e-7), 'reference clipped by tiling');
});

test('elbow project roundtrip retains all physical placement parameters', () => {
  const r = fixtures[2].result;
  const restored = exp.readProjectJSON(exp.projectJSON(r.params, { id: 'ELBOW-8x4', revision: 'B' }));
  for (const key of ['hostType', 'bendRadius', 'bendAngle', 'bendPosition', 'surfaceClock', 'branchSwivel', 'jointType', 'projection'])
    assert.equal(restored.params[key], r.params[key], key);
});

test('mother opening wrap rejects elbow even if stale straight main template is present', () => {
  const r = fixtures[0].result;
  assert.throws(() => exp.createMainOpeningPatch(r));
  const staleMain = { id: 'main', title: 'legacy straight mother', basis: 'outer wall',
    outer: [[0, 0], [700, 0], [700, 600], [0, 600], [0, 0]], width: 700, height: 600,
    holes: [[[200, 250], [300, 250], [300, 350], [200, 350], [200, 250]]], references: [], notes: [],
    mapping: { coordinateSystem: 'main-outer-wrap', origin: [0, 0] } };
  const withLegacy = { ...r, templates: [...r.templates, staleMain] };
  assert.throws(() => exp.createMainOpeningPatch(withLegacy), /彎頭|展開|曲面|不支援/);
  assert.throws(() => exp.paperPatternPlan(withLegacy, { parts: ['main-local'], orientation: 'landscape' }), /彎頭|展開|曲面|不支援/);
  assert.throws(() => exp.reportPagePlan(withLegacy, { parts: ['main'], mainPattern: 'full', includeStations: false }), /彎頭|展開|曲面|不支援/);
});

test('elbow rejects straight-host rough-cut envelope at kernel and print entry points', () => {
  const r = fixtures[0].result, wrap = exp.createBranchCuttingWrap(r);
  assert.throws(() => fab.createRoughCutTemplate(wrap, stockPlan), /彎頭|粗切|包絡|不支援/);
  assert.throws(() => exp.paperPatternPlan(r, { parts: ['branch-rough'], fabrication: stockPlan, orientation: 'landscape' }), /彎頭|粗切|包絡|不支援/);
});

test('field work order does not publish an unproved elbow rough-cut depth column', () => {
  const r = fixtures[0].result;
  const html = exp.buildFieldWorkOrderHTML(r, { id: 'ELBOW-WO' }, { fabrication: stockPlan });
  assert.ok(!/<th>粗切深度/.test(html), 'elbow work order publishes the unproved max(inner,outer)+stock depth');
  const branchPage=html.match(/data-role="branch">([\s\S]*?)<\/section>/)[1];
  const rows = [...branchPage.matchAll(/<tr[^>]*data-station-angle="([\d.]+)"[^>]*>([\s\S]*?)<\/tr>/g)];
  assert.equal(rows.length, 13);
  const exact = computeExactStationTable(r, 12);
  rows.forEach((m, i) => {
    near(Number(m[1]), exact[i].angle);
    const cells = [...m[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(cell => cell[1]);
    near(Number(cells[2]), exact[i].outerDepth, .0051);
    near(Number(cells[4]), exact[i].innerDepth, .0051);
  });
});

test('elbow fabrication CSV leaves all rough depths blank regardless of caller override', () => {
  const r=fixtures[0].result,plan={...stockPlan,count:4,preGaps:Array(4).fill(null),postGaps:Array(4).fill(null)};
  const exact=computeExactStationTable(r,4);
  assert.ok(exact.every(s=>s.hostType==='elbow'));
  assert.ok(r.stationTable.every(s=>s.hostType==='elbow'));
  for(const stations of [exact,exact.map((s,i)=>i?{...s,hostType:'straight'}:s)])for(const options of [{},{roughCutSupported:true}]){
    const csv=fab.fabricationCSV(plan,stations,options);
    assert.match(csv,/粗切深度留白/);
    const rows=csv.split('\r\n').filter(line=>/^"(?:0|90|180|270)",/.test(line));
    assert.equal(rows.length,4);
    assert.ok(rows.every(line=>line.split(',')[3]==='""'));
  }
});

test('dense elbow report counts branch station sheets separately from process records', () => {
  const r=fixtures[0].result,options={stationCount:72},plan=exp.reportPagePlan(r,options),html=exp.buildReportHTML(r,{},options);
  assert.equal(plan.totalPages,8);
  assert.equal(plan.stationPages,6);
  assert.equal(plan.stationSheets.length,6);
  assert.equal(plan.stationSheets.flatMap(sheet=>sheet.rows).length,73);
  assert.equal(plan.fabricationPages,0);
  assert.equal((html.match(/data-role="branch"/g)||[]).length,plan.stationPages);
  assert.equal((html.match(/<section class="page"/g)||[]).length,plan.totalPages);
});
