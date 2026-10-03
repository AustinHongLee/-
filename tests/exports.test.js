import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
// Import through a data URL so this test does not require package.json type=module.
const source = await readFile(new URL('../dist/assets/exports.js', import.meta.url), 'utf8');
const mod = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const params = { mainOD: 324, mainWall: 8, mainLength: 1000, jointPosition: 500, branchOD: 168, branchWall: 6,
  branchLength: 450, angle: 60, azimuth: 15, offset: 0, jointType: 'in', projection: 0,
  rootGap: 1, holeGap: 2, padEnabled: true, padShape: 'circle', padSplit: 'axial', padThickness: 6,
  padMargin: 40, padClearance: 2, kFactor: 0.5, tolerance: 0.1 };
const template = { id: 'branch', title: '支管 <script>alert(1)</script>', basis: '實際外徑包覆', width: 500, height: 300,
  outer: [[0, 0], [500, 0], [500, 300], [0, 300], [0, 0]],
  holes: [[[40, 40], [60, 40], [60, 60], [40, 60], [40, 40]]],
  references: [{ points: [[0, 150], [500, 150]], label: '基準 <img>', type: 'datum' }], notes: ['製作備註'] };
const result = { valid: true, params, templates: [template], verification: [{ id: 'error', label: '幾何誤差', value: 0.001, unit: 'mm', tolerance: 0.1, status: 'pass' }],
  stationTable: [{ angle: 0, circumference: 0, outerDepth: 15, innerDepth: null }, { angle: 90, circumference: 131.9469, outerDepth: 60, innerDepth: 58 }], warnings: [], errors: [] };
let checks = 0;
const check = (title, fn) => { fn(); checks++; console.log(`✓ ${title}`); };
check('SVG preserves physical mm and puts calibration outside the cut', () => {
  const svg = mod.templateSVG(template);
  assert.match(svg, /width="533mm" height="342mm"/);
  assert.match(svg, /M0,0 L500,0 L500,300 L0,300 Z/);
  assert.match(svg, /data-calibration="horizontal-100mm"/);
  assert.match(svg, /data-calibration="vertical-100mm"/);
  assert.ok(!svg.includes('<script>alert'));
  assert.ok(svg.includes('&lt;script&gt;'));
  assert.throws(() => mod.templateSVG(template, { allowance: 2 }), /幾何模組/);
});
check('DXF has millimetre units, closed cuts, and open references', () => {
  const dxf = mod.templateDXF(template), lines = dxf.trim().split('\r\n');
  assert.match(dxf, /\$INSUNITS\r\n70\r\n4/);
  assert.match(dxf, /AC1015/);
  const entities = dxf.split('0\r\nLWPOLYLINE\r\n').slice(1);
  assert.equal(entities.length, 3);
  assert.match(entities[0], /90\r\n4\r\n70\r\n1/);
  assert.match(entities[1], /90\r\n4\r\n70\r\n1/);
  assert.match(entities[2], /90\r\n2\r\n70\r\n0/);
  assert.equal(lines.length % 2, 0);
  assert.equal((entities[0].match(/\r\n10\r\n/g) ?? []).length, 4);
});
check('CSV carries a UTF-8 BOM and numeric depths', () => {
  const csv = mod.stationCSV(result);
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  assert.match(csv, /"90","131.9469","60","58"/);
  assert.match(csv, /"0","0","15",""/);
  assert.throws(() => mod.stationCSV({ ...result, stationTable: [{ angle: '=HYPERLINK()', circumference: 0 }] }), /有限數值/);
});
check('Project JSON round-trips known params and rejects incompatible data', () => {
  const project = mod.readProjectJSON(mod.projectJSON(params, { title: '測試', revision: 'B' }));
  assert.deepEqual(project.params, params);
  assert.equal(project.metadata.title, '測試');
  assert.throws(() => mod.readProjectJSON('{}'), /格式或版本/);
  assert.throws(() => mod.readProjectJSON(mod.projectJSON(params).replace('"version": 1', '"version": 9')), /格式或版本/);
  assert.throws(() => mod.projectJSON({ ...params, script: 'alert(1)' }), /不支援的參數/);
  assert.throws(() => mod.projectJSON({ ...params, angle: 0 }), /夾角/);
  assert.throws(() => mod.projectJSON({ ...params, mainWall: 200 }), /壁厚/);
  assert.throws(() => mod.projectJSON({ ...params, offset: Infinity }), /有限數值/);
  assert.throws(() => mod.readProjectJSON('{"format":"pipe-fabrication-project","version":1,"params":{"__proto__":{"polluted":true}}}'), /不支援的參數/);
  assert.equal({}.polluted, undefined);
});
check('Page plan covers the entire original contour at 1:1 with overlap', () => {
  const plan = mod.reportPagePlan(result, { paper: 'A4', orientation: 'portrait' });
  assert.equal(plan.paper.tileW, 169);
  assert.equal(plan.paper.tileH, 227);
  const part = plan.parts[0];
  assert.equal(part.columns, 4); assert.equal(part.rows, 2); assert.equal(part.pageCount, 8);
  assert.equal(plan.totalPages, 11);
  assert.equal(plan.stationPages, 1);
  assert.equal(mod.estimateReportPages(result), 11);
  assert.equal(part.tiles[0].x, -3);
  assert.equal(part.tiles[1].x - part.tiles[0].x, 159);
  assert.ok(part.tiles.at(-1).x + part.tiles.at(-1).width >= template.width + 3);
  assert.ok(part.tiles.at(-1).y + part.tiles.at(-1).height >= template.height + 3);
  assert.equal(mod.estimateReportPages(result, { includeOverview: true }), 12);
  assert.equal(mod.estimateReportPages(result, { includeStations: false }), 10);
  assert.throws(() => mod.estimateReportPages(result, { parts: [] }), /至少選擇/);
  assert.throws(() => mod.estimateReportPages(result, { parts: ['missing'] }), /所選零件/);
});
check('Report has physical paper dimensions, two rulers per tile, and escaped text', () => {
  const html = mod.buildReportHTML(result, { id: 'J-TEST', title: '</title><script>bad()</script>', notes: '<img src=x onerror=bad()>' });
  assert.match(html, /@page \{ size: 210mm 297mm; margin: 0;/);
  assert.match(html, /width="186mm" height="243mm" viewBox="0 0 186 243"/);
  assert.equal((html.match(/data-scale="1mm-per-svg-unit"/g) ?? []).length, 8);
  assert.equal((html.match(/data-calibration="horizontal-100mm"/g) ?? []).length, 8);
  assert.equal((html.match(/data-calibration="vertical-100mm"/g) ?? []).length, 8);
  assert.equal((html.match(/<section class="page /g) ?? []).length, 11);
  assert.ok(html.includes('R2 C4'));
  assert.ok(!html.includes('<script>bad()'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img src=x'));
  assert.ok(html.includes('插入式'));
  assert.ok(html.includes('未進行承壓設計'));
  assert.equal((html.match(/<footer>接頭 J-TEST/g) ?? []).length, mod.estimateReportPages(result));
  assert.ok(html.includes('接頭：J-TEST'));
});
check('Invalid geometry and failed verification block all fabrication output reports', () => {
  assert.throws(() => mod.buildReportHTML({ ...result, valid: false }), /幾何模型無效/);
  assert.throws(() => mod.buildReportHTML({ ...result, verification: [{ status: 'fail' }] }), /幾何驗證未通過/);
  assert.throws(() => mod.estimateReportPages({ ...result, templates: [{ ...template, outer: [[0, 0], [Infinity, 0], [1, 1]] }] }), /有限數值/);
  const coarse = { ...result, verification: [{ id: 'chord', value: 0.2, tolerance: 0.1, status: 'warning' }] };
  assert.throws(() => mod.buildReportHTML(coarse), /離散誤差/);
  assert.equal(mod.fabricationReadiness(coarse).ready, false);
  assert.equal(mod.fabricationReadiness(result).ready, true);
});
check('Landscape A3 dimensions and multipart selection share the same page plan', () => {
  const extra = { ...template, id: 'pad', title: '補強板', width: 80, height: 80, outer: [[0, 0], [80, 0], [80, 80], [0, 80], [0, 0]], holes: [], references: [] };
  const r = { ...result, templates: [template, extra] };
  const plan = mod.reportPagePlan(r, { paper: 'A3', orientation: 'landscape', parts: ['pad'] });
  assert.equal(plan.paper.width, 420); assert.equal(plan.paper.height, 297);
  assert.equal(plan.totalPages, 4); assert.equal(plan.parts.length, 1);
  const html = mod.buildReportHTML(r, {}, { paper: 'A3', orientation: 'landscape', parts: ['pad'] });
  assert.match(html, /@page \{ size: 420mm 297mm/);
});
const kernelSource = await readFile(new URL('../dist/assets/geometry.js', import.meta.url), 'utf8');
const kernel = await import(`data:text/javascript;base64,${Buffer.from(kernelSource).toString('base64')}`);
check('Paper station tables retain exact values and the closing row in all paper orientations', () => {
  const r = kernel.computeJoint(kernel.DEFAULT_PARAMS);
  for (const stationCount of [12, 24, 36, 72]) {
    for (const paper of ['A4', 'A3']) for (const orientation of ['portrait', 'landscape']) {
      const options = { paper, orientation, stationCount };
      const plan = mod.reportPagePlan(r, options);
      const capacity = paper === 'A4' ? (orientation === 'portrait' ? 24 : 18) : orientation === 'portrait' ? 48 : 32;
      assert.equal(plan.stationRowCount, stationCount + 1);
      assert.equal(plan.stationPages, Math.ceil((stationCount + 1) / capacity));
      const rows = plan.stationSheets.flatMap(sheet => sheet.rows);
      assert.equal(rows.length, stationCount + 1);
      assert.equal(rows[0].angle, 0);
      assert.equal(rows.at(-1).angle, 360);
      assert.equal(rows.at(-1).circumference, r.stationTable.at(-1).circumference);
      const html = mod.buildReportHTML(r, {}, options);
      assert.equal((html.match(/<section class="page station-page"/g) ?? []).length, plan.stationPages);
      assert.equal((html.match(/<section class="page /g) ?? []).length, plan.totalPages);
      assert.ok(html.includes('0（閉合）'));
      assert.ok(html.indexOf('支管圓周分點尺寸表') < html.indexOf('class="page fabrication"'));
      assert.ok(html.includes('皆由同一支管直端面'));
    }
  }
  // The UI may supply its already-selected table: never silently resample it.
  const selectedRows = r.stationTable.filter((_, i) => i % 15 === 0);
  const selectedPlan = mod.reportPagePlan({ ...r, stationTable: selectedRows });
  assert.equal(selectedPlan.stationRowCount, 25);
  assert.deepEqual(selectedPlan.stationSheets.flatMap(sheet => sheet.rows), selectedRows);
  assert.throws(() => mod.reportPagePlan(r, { stationCount: 17 }), /放樣分點數/);
  assert.throws(() => mod.reportPagePlan(result, { stationCount: 24 }), /缺少/);
  assert.throws(() => mod.reportPagePlan({ ...r, stationTable: [{ angle: 0, circumference: NaN, outerDepth: 1 }] }), /有限數值/);
});
check('Actual geometry kernel output exports in both joint modes and all split modes', () => {
  for (const jointType of ['on', 'in']) for (const padSplit of ['single', 'axial', 'circumferential']) {
    const r = kernel.computeJoint({ ...kernel.DEFAULT_PARAMS, jointType, padSplit });
    assert.equal(r.valid, true, JSON.stringify(r.errors));
    assert.doesNotThrow(() => mod.readProjectJSON(mod.projectJSON(r.params)));
    assert.ok(mod.stationCSV(r).startsWith('\uFEFF'));
    const html = mod.buildReportHTML(r, { title: '實際模型驗證' });
    assert.ok(html.includes('主管孔口每側間隙'));
    assert.ok(html.includes('獨立二次方程求交差'));
    for (const id of ['pad-inner-fit', 'pad-outer-fit']) {
      const v = r.verification.find(v => v.id === id);
      assert.ok(v, `missing ${id}`);
      assert.ok(html.includes(`<td>${v.label}</td><td>${Number(v.value.toFixed(8))} mm</td><td>≥ 0</td>`));
    }
    assert.equal((html.match(/<section class="page /g) ?? []).length, mod.estimateReportPages(r));
    for (const t of r.templates) {
      assert.ok(mod.templateSVG(t).includes('1:1'));
      assert.ok(mod.templateDXF(t).endsWith('0\r\nEOF\r\n'));
    }
  }
});
console.log(`${checks} export checks passed.`);
