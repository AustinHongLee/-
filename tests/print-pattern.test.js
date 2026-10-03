/** Independent print geometry and physical paper checks. */
import test from 'node:test';
import assert from 'node:assert/strict';
const root = new URL('../dist/assets/', import.meta.url).href;
const { computeJoint, rotateAroundMain } = await import(root + 'geometry.js');
const exp = await import(root + 'exports.js');

function joint(overrides = {}) {
  const p = { mainOD: 300, mainWall: 40, mainLength: 10000, branchOD: 100, branchWall: 8,
    branchLength: 237.8, angle: 10, azimuth: 137, offset: 0, jointType: 'on',
    padEnabled: false, samples: 360, tolerance: 0.1, autoPrecision: true, ...overrides };
  p.jointPosition = p.mainLength / 2 - Math.sqrt((p.mainOD / 2) ** 2 - p.offset ** 2) / Math.tan(p.angle * Math.PI / 180);
  const r = computeJoint(p); assert.equal(r.valid, true, JSON.stringify(r.errors)); return r;
}
const near = (a, b, epsilon = 1e-7) => Math.abs(a - b) <= epsilon;
const includesPoint = (points, target) => points.some(point => near(point[0], target[0]) && near(point[1], target[1]));

test('thick-wall shallow main-local retains EVERY original inner-edge vertex and the full outside hole', () => {
  for (const angle of [7, 10, 19, 52, 128, 170]) for (const jointType of ['on', 'in']) {
    const r = joint({ angle, jointType, offset: 12 }), source = r.templates.find(t => t.id === 'main');
    const patch = exp.createMainOpeningPatch(r), [du, dx] = patch.mapping.cropOrigin;
    const references = patch.references.filter(x => x.type === 'inner-edge').flatMap(x => x.points);
    const sourcePoints = source.references.find(x => x.type === 'inner-edge').points;
    for (const point of sourcePoints) {
      const local = [point[0] - du, point[1] - dx];
      assert.ok(includesPoint(references, local), `angle ${angle}, type ${jointType}: lost inner vertex ${point}`);
      assert.ok(local[0] >= -1e-7 && local[0] <= patch.width + 1e-7);
      assert.ok(local[1] >= -1e-7 && local[1] <= patch.height + 1e-7);
    }
    for (const hole of source.holes) for (const point of hole)
      assert.ok(patch.holes.some(h => includesPoint(h, [point[0] - du, point[1] - dx])));
  }
});

test('inner-hole WORLD geometry independently maps to the preserved main-local reference', () => {
  const r = joint({ offset: -18, angle: 10, azimuth: 221 });
  const patch = exp.createMainOpeningPatch(r), [du, dx] = patch.mapping.cropOrigin;
  const R = r.params.mainOD / 2, references = patch.references.filter(x => x.type === 'inner-edge').flatMap(x => x.points);
  for (const world of r.geometry.main.innerHole3D) {
    const local = rotateAroundMain(world, -r.params.azimuth);
    const theta = Math.atan2(local[1], local[2]);
    const paper = [Math.PI * R + R * theta - du, local[0] - dx];
    assert.ok(includesPoint(references, paper), 'world-to-paper mapping lost or reversed an inner-edge point');
  }
});

test('rounded branch datum is a retained-material ring and never changes absolute cut depths or handedness', () => {
  const r = joint({ mainWall: 10, angle: 52, offset: 12 }), paper = exp.createBranchCuttingWrap(r, { datumStep: 1 });
  const m = paper.mapping, source = r.templates.find(t => t.id === 'branch');
  const outer = source.outer.filter(pt => pt[1] > 1e-9).sort((a, b) => a[0] - b[0]);
  const inner = source.references.find(x => x.type === 'inner-edge').points;
  const absolute = [...outer, ...inner], minimum = Math.min(...absolute.map(p => p[1]));
  assert.ok(near(m.originalDepthOrigin, Math.round(m.originalDepthOrigin)), 'datumStep=1 should give a whole-mm locator');
  assert.ok(m.originalDepthOrigin <= minimum + 1e-7, 'datum must stay on retained material');
  assert.ok(minimum - m.originalDepthOrigin < 1 + 1e-7);
  assert.ok(near(m.localDatumY + m.paperTopDepth, m.originalDepthOrigin));
  const cut = paper.references.find(x => x.type === 'cut-line').points;
  for (const pt of cut) {
    const original = [m.circumference - pt[0], pt[1] + m.paperTopDepth];
    assert.ok(includesPoint(outer, original), 'rounding the datum moved a finished cut');
  }
  const projectedInner = paper.references.find(x => x.type === 'inner-edge').points;
  for (const pt of projectedInner) assert.ok(includesPoint(inner, [m.circumference - pt[0], pt[1] + m.paperTopDepth]));
  assert.equal(cut[0][0], m.circumference); assert.equal(cut.at(-1)[0], 0);
  assert.equal(cut[0][1], cut.at(-1)[1]);
});

test('compact pattern plan contains only paper tiles and covers every cut/reference without gaps', () => {
  assert.equal(typeof exp.paperPatternPlan, 'function');
  for (const paper of ['A4', 'A3']) for (const orientation of ['portrait', 'landscape']) {
    const r = joint(), plan = exp.paperPatternPlan(r, { parts: ['branch', 'main'], paper, orientation });
    assert.equal(plan.totalPages, plan.parts.reduce((n, p) => n + p.pageCount, 0));
    for (const part of plan.parts) {
      const t = part.template, points = [t.outer, ...t.holes, ...t.references.map(x => x.points)].flat();
      for (const point of points) assert.ok(part.tiles.some(tile =>
        point[0] >= tile.x - 1e-7 && point[0] <= tile.x + tile.width + 1e-7 &&
        point[1] >= tile.y - 1e-7 && point[1] <= tile.y + tile.height + 1e-7), 'paper plan clipped geometry');
      for (const left of part.tiles) {
        const right = part.tiles.find(t => t.row === left.row && t.column === left.column + 1);
        const below = part.tiles.find(t => t.column === left.column && t.row === left.row + 1);
        if (right) assert.ok(near(left.x + left.width - right.x, plan.paper.overlap));
        if (below) assert.ok(near(left.y + left.height - below.y, plan.paper.overlap));
      }
    }
  }
});

function renderedTileSVGs(html) {
  return [...html.matchAll(/<svg class="tile-svg"([^>]*)>([\s\S]*?)<\/svg>/g)].map(match => ({ attributes: match[1], body: match[2] }));
}
function circles(svg, tile) {
  return [...svg.body.matchAll(/<circle[^>]*cx="([^\"]+)"[^>]*cy="([^\"]+)"[^>]*>/g)].map(m => [Number(m[1]) + tile.x, Number(m[2]) + tile.y]);
}

test('rendered adjacent pages have two registration circles at identical GLOBAL paper coordinates', () => {
  assert.equal(typeof exp.buildPaperPatternHTML, 'function');
  const r = joint({ angle: 10 }), options = { parts: ['branch'], paper: 'A4', orientation: 'portrait' };
  const plan = exp.paperPatternPlan(r, options), html = exp.buildPaperPatternHTML(r, { id: 'PRINT-01' }, options);
  const svgs = renderedTileSVGs(html), tiles = plan.parts.flatMap(p => p.tiles);
  assert.equal(svgs.length, tiles.length);
  const part = plan.parts[0]; let pairs = 0;
  for (let index = 0; index < part.tiles.length; index++) {
    const current = part.tiles[index], currentMarks = circles(svgs[index], current);
    const adjacent = part.tiles.filter(t => (t.row === current.row && t.column === current.column + 1)
      || (t.column === current.column && t.row === current.row + 1));
    for (const next of adjacent) {
      const nextIndex = part.tiles.indexOf(next), nextMarks = circles(svgs[nextIndex], next);
      const shared = currentMarks.filter(point => includesPoint(nextMarks, point));
      assert.ok(shared.length >= 2, `registration mismatch: ${current.row}/${current.column} -> ${next.row}/${next.column}`);
      pairs++;
    }
  }
  assert.ok(pairs >= 3);
});

test('compact HTML preserves physical mm scale, calibration, and excludes report-only pages', () => {
  const r = joint({ mainWall: 10, angle: 52 }), options = { parts: ['branch'], paper: 'A4', orientation: 'landscape' };
  const plan = exp.paperPatternPlan(r, options), html = exp.buildPaperPatternHTML(r, { id: 'PRINT-02' }, options);
  const svgs = renderedTileSVGs(html);
  assert.equal(svgs.length, plan.totalPages);
  for (const svg of svgs) {
    const w = Number(svg.attributes.match(/width="([\d.]+)mm"/)?.[1]);
    const h = Number(svg.attributes.match(/height="([\d.]+)mm"/)?.[1]);
    const view = svg.attributes.match(/viewBox="([\d. ]+)"/)?.[1]?.trim().split(/\s+/).map(Number);
    assert.ok(Number.isFinite(w) && Number.isFinite(h) && view?.length === 4);
    assert.ok(near(w / view[2], 1)); assert.ok(near(h / view[3], 1));
    assert.match(svg.body, /data-scale="1mm-per-svg-unit"/);
  }
  assert.match(html, /data-calibration="horizontal-100mm"/);
  assert.match(html, /data-calibration="vertical-100mm"/);
  assert.match(html, /@page[^}]*297mm 210mm/);
  assert.equal(html.includes('class="page cover"'), false);
  assert.equal(html.includes('幾何驗證與加工依據'), false);
  assert.equal(html.includes('支管圓周分點尺寸表'), false);
  assert.equal(html.includes('試配與點固後根隙紀錄'), false);
});

test('default ASME 8/4 inch 90-degree mouth needs 2 A4 sheets or 1 A3 sheet with automatic orientation', () => {
  const r = joint({ mainOD: 219.1, mainWall: 6, mainLength: 600, branchOD: 114.3, branchWall: 4,
    branchLength: 200, angle: 90, azimuth: 0, offset: 0 });
  for (const [paper, expected] of [['A4', 2], ['A3', 1]]) {
    const plan = exp.paperPatternPlan(r, { parts: ['branch-local'], paper, orientation: 'auto', includeGuide: false });
    assert.equal(plan.paperPages, expected); assert.equal(plan.totalPages, expected);
    assert.equal(plan.guidePages, 0); assert.equal(plan.paper.orientation, 'landscape');
    assert.equal(plan.parts.length, 1); assert.equal(plan.parts[0].template.mapping.circumference, Math.PI * 114.3);
  }
});

test('includeGuide adds exactly one page without changing paper coordinates, geometry, orientation, or paper tile count', () => {
  const r = joint({ mainOD: 219.1, mainWall: 6, mainLength: 600, branchOD: 114.3, branchWall: 4,
    branchLength: 200, angle: 90, azimuth: 0, offset: 0 });
  for (const paper of ['A4', 'A3']) {
    const options = { parts: ['branch-local', 'main-local'], paper, orientation: 'auto' };
    const plain = exp.paperPatternPlan(r, { ...options, includeGuide: false });
    const guide = exp.paperPatternPlan(r, { ...options, includeGuide: true });
    assert.equal(guide.guidePages, 1); assert.equal(plain.guidePages, 0);
    assert.equal(guide.totalPages, plain.totalPages + 1); assert.equal(guide.paperPages, plain.paperPages);
    assert.deepEqual(guide.paper, plain.paper); assert.deepEqual(guide.parts, plain.parts);
    const a = renderedTileSVGs(exp.buildPaperPatternHTML(r, { id: 'GUIDE01' }, { ...options, includeGuide: false }));
    const b = renderedTileSVGs(exp.buildPaperPatternHTML(r, { id: 'GUIDE01' }, { ...options, includeGuide: true }));
    assert.equal(a.length, b.length); assert.equal(a.length, plain.paperPages);
    assert.deepEqual(a.map(svg => svg.attributes), b.map(svg => svg.attributes));
  }
});

test('pad guide handles pad datum positioning without assuming main-local A/B points', () => {
  const r = joint({ mainOD: 219.1, mainWall: 6, mainLength: 600, branchOD: 114.3, branchWall: 4,
    branchLength: 200, angle: 90, azimuth: 0, offset: 0, padEnabled: true });
  assert.doesNotThrow(() => exp.buildPaperPatternHTML(r, { id: 'PAD01' }, { parts: ['pad'], paper: 'A4', includeGuide: true }));
});

test('paired registration IDs are unique to their part and transparent so they cannot erase cutting lines', () => {
  const r = joint({ angle: 10 }), options = { parts: ['branch-local', 'main-local'], paper: 'A4', orientation: 'portrait' };
  const plan = exp.paperPatternPlan(r, options), html = exp.buildPaperPatternHTML(r, {}, options), svgs = renderedTileSVGs(html);
  const seen = new Map(); let index = 0;
  for (const part of plan.parts) for (const tile of part.tiles) {
    const svg = svgs[index++];
    assert.match(svg.body, /<g[^>]*data-layer="ASSEMBLY_GUIDE"[^>]*fill="none"/);
    for (const mark of svg.body.matchAll(/<g data-registration="([^\"]+)">([\s\S]*?)<\/g>/g)) {
      const key = mark[1], circle = mark[2].match(/<circle[^>]*cx="([^\"]+)"[^>]*cy="([^\"]+)"/);
      assert.ok(key.startsWith(part.prefix + '-'), 'each registration label must identify its part');
      assert.ok(circle); const point = [tile.x + Number(circle[1]), tile.y + Number(circle[2])];
      const entries = seen.get(key) ?? []; entries.push(point); seen.set(key, entries);
    }
  }
  assert.ok(seen.size > 2);
  for (const [key, entries] of seen) {
    assert.equal(entries.length, 2, `${key} must identify exactly one matching page pair`);
    assert.ok(near(entries[0][0], entries[1][0]) && near(entries[0][1], entries[1][1]));
  }
});
