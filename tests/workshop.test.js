import test from 'node:test';
import assert from 'node:assert/strict';
const root = new URL('../dist/assets/', import.meta.url);
const { computeJoint, computeExactStationTable } = await import(new URL('geometry.js', root));
const { emptyFabricationPlan, validateFabricationPlan, geometryRecordKey, clearFitRecords, reconcileFitRecords,
  machiningBudget, fitPointStatus, fitPhaseStatus, roughDepth, createRoughCutTemplate, fabricationCSV } = await import(new URL('fabrication-plan.js', root));
const { createBranchCuttingWrap, templateSVG, templateDXF, projectJSON, readProjectJSON, reportPagePlan, buildReportHTML } = await import(new URL('exports.js', root));

function joint(overrides = {}) {
  const p = { mainOD: 300, mainWall: 10, mainLength: 10000, jointPosition: 5000, branchOD: 114.3,
    branchWall: 10, branchLength: 200, angle: 52, azimuth: 0, offset: 12,
    jointType: 'on', rootGap: 1.2, projection: 10, padEnabled: false, samples: 360, tolerance: 0.1,
    autoPrecision: true, ...overrides };
  p.jointPosition = p.mainLength / 2 - Math.sqrt((p.mainOD / 2) ** 2 - p.offset ** 2) / Math.tan(p.angle * Math.PI / 180);
  const r = computeJoint(p); assert.equal(r.valid, true, JSON.stringify(r.errors)); return r;
}
function recordedPlan(result, overrides = {}) {
  return validateFabricationPlan({ ...emptyFabricationPlan(), stock: 3, markError: 0.5, cutError: 1,
    kerf: 2, wpsId: 'WPS-T01 Rev.2', gapMin: 0, gapMax: 3, gapBasis: '沿坡口法線、點固前',
    edgeCondition: 'checked', preGaps: [0, 1, 2, 3], postGaps: [null, null, null, null],
    tackAngles: [0, 180], inspectionKey: geometryRecordKey(result.params), ...overrides });
}
function quadraticDepth(r, theta, radius) {
  const p = r.params, a = p.angle * Math.PI / 180, sa = Math.sin(a), ca = Math.cos(a);
  const y = p.offset + radius * Math.sin(theta), z = radius * Math.cos(theta) * ca;
  const H = p.jointType === 'in' ? p.mainOD / 2 - p.mainWall : p.mainOD / 2 + p.rootGap;
  const A = sa * sa, B = 2 * z * sa, C = y * y + z * z - H * H;
  const t = (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A) - (p.jointType === 'in' ? p.projection : 0);
  return r.geometry.branch.axisEnd - t;
}
function polylineEntities(dxf) {
  const raw = dxf.trim().split(/\r?\n/), pairs = [];
  for (let i = 0; i < raw.length; i += 2) pairs.push([Number(raw[i]), raw[i + 1]]);
  const entities = [];
  for (let i = 0; i < pairs.length; i++) if (pairs[i][0] === 0 && pairs[i][1] === 'LWPOLYLINE') {
    const entity = { vertices: [] };
    for (i++; i < pairs.length && pairs[i][0] !== 0; i++) {
      const [code, value] = pairs[i];
      if (code === 8) entity.layer = value;
      if (code === 70) entity.closed = Number(value);
      if (code === 10) entity.vertices.push([Number(value), Number(pairs[++i][1])]);
    }
    i--; entities.push(entity);
  }
  return entities;
}

test('rough template conservatively covers the continuous wall at sampled angles, using independent cylinder quadratic', () => {
  let checked = 0;
  for (const angle of [7, 52, 90, 128, 173]) for (const offset of [-22, 0, 22]) for (const jointType of ['on', 'in']) {
    const r = joint({ angle, offset, jointType, azimuth: 137 }), base = createBranchCuttingWrap(r);
    const plan = recordedPlan(r, { stock: 4.5 }), template = createRoughCutTemplate(base, plan);
    const ref = template.references.find(row => row.type === 'rough-cut');
    const outer = base.mapping.originalOuterCut, n = outer.length - 1, ro = r.params.branchOD / 2, ri = ro - r.params.branchWall;
    for (let i = 0; i < outer.length; i += Math.max(1, Math.floor(n / 47))) {
      const theta = i === n ? 0 : 2 * Math.PI * i / n, actualRoughDepth = ref.points[i][1] + base.mapping.paperTopDepth;
      for (let j = 0; j <= 16; j++) {
        const depth = quadraticDepth(r, theta, ri + (ro - ri) * j / 16);
        assert.ok(actualRoughDepth - depth >= 4.5 - 1e-8);
        checked++;
      }
    }
  }
  assert.ok(checked > 20000);
});

test('null remains unknown, explicit zero is retained, kerf is record-only, and negative/invalid measurements reject', () => {
  const empty = emptyFabricationPlan();
  assert.deepEqual(machiningBudget(empty), { known: false, remaining: null });
  assert.equal(createRoughCutTemplate(createBranchCuttingWrap(joint()), empty), null);
  const zero = validateFabricationPlan({ ...empty, stock: 0, markError: 0, cutError: 0, kerf: 0 });
  assert.deepEqual(machiningBudget(zero), { known: true, remaining: 0 });
  const r = joint(), base = createBranchCuttingWrap(r), f = recordedPlan(r);
  const cut = p => createRoughCutTemplate(base, p).references.find(x => x.type === 'rough-cut').points;
  assert.deepEqual(cut(f), cut({ ...f, kerf: 80 }));
  assert.deepEqual(machiningBudget(f), machiningBudget({ ...f, kerf: 80 }));
  assert.equal(machiningBudget({ ...f, stock: 0.25 }).remaining, -1.25);
  for (const value of [-1, NaN, Infinity, '0', 10001]) {
    assert.throws(() => validateFabricationPlan({ ...empty, stock: value }));
    assert.throws(() => validateFabricationPlan({ ...empty, preGaps: [value, null, null, null] }));
  }
  assert.throws(() => validateFabricationPlan({ ...empty, gapMin: 3, gapMax: 2 }));
  assert.throws(() => validateFabricationPlan({ ...empty, bevelAngle: 90 }));
});

test('geometry changes clear measured records, damage/disposition, while numerical sampling settings keep valid records', () => {
  const r = joint(), f = recordedPlan(r, { postGaps: [1, 1, 1, 1], edgeCondition: 'damaged', disposition: '待核准修復' });
  for (const change of [{ angle: 45 }, { jointPosition: r.params.jointPosition + 1 }, { branchWall: 9 }, { projection: 11 }, { padEnabled: true }]) {
    const reconciled = reconcileFitRecords(f, { ...r.params, ...change });
    assert.equal(reconciled.cleared, true); assert.deepEqual(reconciled.plan.preGaps, Array(4).fill(null));
    assert.deepEqual(reconciled.plan.postGaps, Array(4).fill(null));
    assert.equal(reconciled.plan.edgeCondition, 'unknown'); assert.equal(reconciled.plan.disposition, '');
  }
  const kept = reconcileFitRecords(f, { ...r.params, samples: 720, tolerance: 0.01 });
  assert.equal(kept.cleared, false); assert.deepEqual(kept.plan.preGaps, f.preGaps);
  const cleared = clearFitRecords(f, r.params); assert.deepEqual(cleared.preGaps, Array(4).fill(null));
  assert.deepEqual(cleared.tackAngles, f.tackAngles); assert.equal(cleared.wpsId, f.wpsId);
});

test('missing WPS/basis never accepts measured fit; incomplete, damaged, high/low states remain explicit despite disposition text', () => {
  const r = joint(), f = recordedPlan(r);
  assert.equal(fitPhaseStatus(f).code, 'within');
  assert.equal(fitPointStatus(f, 0).code, 'within'); // Explicit zero gap is measured.
  assert.equal(fitPhaseStatus(f, 'post').code, 'missing');
  for (const change of [{ wpsId: '' }, { gapBasis: '' }, { gapMin: null }, { gapMax: null }]) {
    assert.equal(fitPhaseStatus({ ...f, ...change }).code, 'unknown');
    assert.equal(fitPointStatus({ ...f, ...change }, 0).code, 'unknown');
  }
  assert.equal(fitPhaseStatus({ ...f, edgeCondition: 'unknown' }).code, 'unknown');
  assert.equal(fitPhaseStatus({ ...f, edgeCondition: 'damaged' }).code, 'action');
  assert.equal(fitPhaseStatus({ ...f, preGaps: [4, 1, 2, 3], disposition: '打算補焊' }).code, 'action');
  assert.equal(fitPointStatus({ ...f, gapMin: 0.5 }, 0).code, 'low');
  assert.equal(fitPointStatus({ ...f, preGaps: [-1, 1, 2, 3] }, 0).code, 'invalid');
});

test('rough paper expands lower bounds without moving finished lines or datum; seam closes physically but remains an open cutting reference', () => {
  const r = joint(), base = createBranchCuttingWrap(r), f = recordedPlan(r, { stock: 45 });
  const before = JSON.stringify(base), template = createRoughCutTemplate(base, f), ref = template.references.find(x => x.type === 'rough-cut');
  assert.equal(JSON.stringify(base), before);
  assert.equal(template.mapping.paperTopDepth, base.mapping.paperTopDepth);
  assert.equal(template.mapping.originalDepthOrigin, base.mapping.originalDepthOrigin);
  assert.deepEqual(template.references.find(x => x.type === 'cut-line').points, base.references.find(x => x.type === 'cut-line').points);
  assert.ok(template.height >= Math.max(...ref.points.map(x => x[1])) + 10 - 1e-8);
  assert.ok(template.height > base.height + 30);
  assert.equal(ref.points[0][0], template.mapping.circumference); assert.equal(ref.points.at(-1)[0], 0);
  assert.equal(ref.points[0][1], ref.points.at(-1)[1]); assert.equal(ref.closed, false);
  assert.ok(template.references.filter(x => x.type === 'tack-reference').length === 2);
  assert.equal(template.outer[2][1], template.height);
  assert.equal(template.outer[3][1], template.height);
});

test('version 1 stays compatible; version 2 retains unknown versus zero and validates the fabrication record', () => {
  const r = joint(), f = recordedPlan(r, { stock: 0, markError: null, kerf: 0 });
  const old = readProjectJSON(projectJSON(r.params, { id: 'J01' }));
  assert.equal(old.version, 1); assert.equal(Object.hasOwn(old, 'fabrication'), false);
  const updated = readProjectJSON(projectJSON(r.params, { id: 'J01' }, f));
  assert.equal(updated.version, 2); assert.equal(updated.fabrication.stock, 0);
  assert.equal(updated.fabrication.markError, null); assert.equal(updated.fabrication.kerf, 0);
  assert.deepEqual(updated.fabrication.preGaps, [0, 1, 2, 3]);
  assert.deepEqual(updated.params, r.params);
  const tampered = JSON.parse(projectJSON(r.params, {}, f)); tampered.fabrication.preGaps[0] = -1;
  assert.throws(() => readProjectJSON(JSON.stringify(tampered)));
  tampered.fabrication = f; tampered.version = 1; assert.throws(() => readProjectJSON(JSON.stringify(tampered)));
});

test('SVG exposes ROUGH_CUT separately with long dashed cutting guide and correct legend', () => {
  const r = joint(), template = createRoughCutTemplate(createBranchCuttingWrap(r), recordedPlan(r));
  const svg = templateSVG(template);
  assert.match(svg, /data-layer="ROUGH_CUT"/);
  const guide = svg.match(/<path[^>]*data-layer="ROUGH_CUT"[^>]*>/)?.[0] ?? '';
  assert.ok(/stroke-dasharray="(?:[3-9]|[1-9][0-9])[^\"]*"/.test(guide), 'ROUGH_CUT must have a dash longer than the 2 mm inner-edge dash.');
  assert.match(svg, /粗切留料線/);
});

test('DXF ROUGH_CUT and TACK_REFERENCE are separate layers; rough stays open and follows SVG-visible handedness', () => {
  const r = joint(), template = createRoughCutTemplate(createBranchCuttingWrap(r), recordedPlan(r)), ref = template.references.find(x => x.type === 'rough-cut');
  const entities = polylineEntities(templateDXF(template)), rough = entities.find(x => x.layer === 'ROUGH_CUT');
  assert.ok(rough); assert.equal(rough.closed, 0); assert.equal(rough.vertices.length, ref.points.length);
  assert.equal(entities.filter(x => x.layer === 'TACK_REFERENCE').length, 2);
  assert.ok(Math.abs(rough.vertices[0][0] - template.mapping.circumference) < 1e-6);
  assert.equal(rough.vertices.at(-1)[0], 0);
  assert.ok(Math.abs(rough.vertices[0][1] - (template.height - ref.points[0][1])) < 1e-6);
  assert.equal(rough.vertices[0][1], rough.vertices.at(-1)[1]);
});

test('report includes rough tiles, measured fit states, and conservatively clears stale fit records', () => {
  const r = joint(), f = recordedPlan(r), rough = createRoughCutTemplate(createBranchCuttingWrap(r), f);
  const result = { ...r, templates: [...r.templates, rough] }, options = { parts: ['branch-rough'], fabrication: f, paper: 'A4', orientation: 'portrait' };
  const plan = reportPagePlan(result, options), html = buildReportHTML(result, { id: 'J01' }, options);
  assert.equal(plan.parts[0].template.id, 'branch-rough');
  assert.equal(plan.fabrication.preGaps[0], 0); assert.ok(plan.fabricationPages >= 2);
  assert.match(html, /試配与|試配與/); assert.match(html, /點固後根隙紀錄/);
  assert.match(html, /data-layer="ROUGH_CUT"/);
  assert.equal((html.match(/<section class="page /g) || []).length, plan.totalPages);
  const stale = reportPagePlan(result, { ...options, fabrication: { ...f, inspectionKey: 'another joint' } });
  assert.deepEqual(stale.fabrication.preGaps, Array(4).fill(null));
});

test('fabrication CSV uses exact fit stations and preserves zero/unknown without permitting ordinary formula prefixes', () => {
  const r = joint(), f = recordedPlan(r, { wpsId: '=1+1' }), rows = computeExactStationTable(r, f.count);
  const csv = fabricationCSV(f, rows);
  assert.ok(csv.startsWith('\uFEFF'));
  const lines = csv.trim().split('\r\n'), header = lines.findIndex(line => line.startsWith('"分點角度'));
  assert.ok(header >= 0); assert.equal(lines.length - header, f.count + 1);
  assert.match(csv, /"'\=1\+1"/);
  assert.match(csv, /,"0","",/);
  assert.match(csv, /在填入範圍內/);
});

test('CSV rejects a station grid that would associate measured gaps with the wrong angle', () => {
  const r = joint(), f = recordedPlan(r);
  assert.throws(() => fabricationCSV(f, computeExactStationTable(r, 12)));
  assert.throws(() => fabricationCSV(f, computeExactStationTable(r, 4).slice(0, 3)));
});

test('CSV text with whitespace followed by formula prefixes stays text', () => {
  const r = joint();
  for (const wpsId of ['\t=1+1', '\r=1+1', ' =1+1', '\n@SUM(1)']) {
    const f = recordedPlan(r, { wpsId }), csv = fabricationCSV(f, computeExactStationTable(r, f.count));
    const expected = '"\'' + wpsId + '"';
    assert.ok(csv.includes(expected), 'formula-like text must be prefixed inside its CSV cell');
  }
});

test('invalid draft WPS limits cannot display a within-range status', () => {
  const f=recordedPlan(joint());
  for(const change of [{gapMax:NaN},{gapMax:Infinity},{gapMin:-1},{gapMin:4,gapMax:3}]){
    assert.equal(fitPointStatus({...f,...change},1).code,'invalid');
    assert.equal(fitPhaseStatus({...f,...change}).code,'action');
  }
});

test('all report paper orientations include every fit point and escaped long process notes', () => {
  const r=joint(),f=recordedPlan(r,{count:24,preGaps:Array(24).fill(null),postGaps:Array(24).fill(2),tackAngles:[0,180],weldNote:'<script>\n'+ '工藝記錄'.repeat(95),disposition:'修復待核准。'.repeat(70)});
  const rough=createRoughCutTemplate(createBranchCuttingWrap(r),f),result={...r,templates:[...r.templates,rough]};
  for(const paper of ['A4','A3'])for(const orientation of ['portrait','landscape']){
    const o={paper,orientation,parts:['branch-rough'],fabrication:f};
    const plan=reportPagePlan(result,o),html=buildReportHTML(result,{},o);
    assert.deepEqual(plan.fitSheets.flat(),Array.from({length:24},(_,i)=>i));
    assert.equal((html.match(/<section class="page /g)||[]).length,plan.totalPages);
    assert.ok(!html.includes('<script>\n工藝'));assert.match(html,/&lt;script&gt;/);
    assert.match(html,/<td>P24<\/td>/);assert.equal(plan.processNotePages,1);
  }
});

test('explicit multiline repair records paginate without dropping their lines',()=>{
  const r=joint(),text=Array.from({length:80},(_,i)=>`R${i}`).join('\n'),f=recordedPlan(r,{disposition:text});
  const plan=reportPagePlan(r,{fabrication:f,paper:'A4',orientation:'landscape'});
  assert.ok(plan.processNotePages>1);
  assert.equal(plan.processNotes.flat().filter(e=>e.label.startsWith('修整')).map(e=>e.text).join('\n'),text);
});
