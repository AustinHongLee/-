import test from 'node:test';
import assert from 'node:assert/strict';
import { computeJoint, computeExactStationTable, DEFAULT_PARAMS } from '../dist/assets/geometry.js';
import { freshInputParams } from '../dist/assets/input-setup.js';
import { buildFieldWorkOrderHTML } from '../dist/assets/exports.js';
import { emptyFabricationPlan, geometryRecordKey } from '../dist/assets/fabrication-plan.js';

const ready = () => computeJoint(freshInputParams(DEFAULT_PARAMS));
const pageCount = html => (html.match(/<section class="page /g) || []).length;
const decode = text => text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&');
const processText = html => [...html.matchAll(/<p class="process-text">([\s\S]*?)<\/p>/g)].map(match => decode(match[1])).join('\n');
const records = result => ({ ...emptyFabricationPlan(), count: 24, preGaps: Array.from({ length: 24 }, (_, i) => 1 + i / 100), postGaps: Array.from({ length: 24 }, (_, i) => 2 + i / 100), tackAngles: [0, 90], inspectionKey: geometryRecordKey(result.params), wpsId: 'WPS-101 REV-2', gapBasis: '按工藝圖沿接頭外緣量測', gapMin: 1, gapMax: 3, edgeCondition: 'checked' });

test('blank fabrication yields one page with one complete 12-station ring, not report pages or 1:1 paper', () => {
  const html = buildFieldWorkOrderHTML(ready(), { id: 'J-101' }, { fabrication: emptyFabricationPlan() });
  assert.equal(pageCount(html), 1);
  assert.equal((html.match(/data-station-angle=/g) || []).length, 13);
  assert.match(html, /data-station-angle="360"/);
  assert.match(html, /S01 閉合/);
  assert.doesNotMatch(html, /tile-svg|verification-page|data-fit-index=|requirements-page"/);
  assert.match(html, /D 定位環：距支管自由直端 \d+ mm/);
});

test('stations stay exact for obtuse eccentric joints even when the caller did not provide a field station table', () => {
  const result = computeJoint({ ...freshInputParams(DEFAULT_PARAMS), angle: 128, offset: 15, azimuth: 37 });
  assert.equal(result.valid, true);
  const expected = computeExactStationTable(result, 12);
  const html = buildFieldWorkOrderHTML(result, {});
  for (const station of expected) {
    const row = html.match(new RegExp(`<tr[^>]*data-station-angle="${station.angle}">([\\s\\S]*?)<\\/tr>`));
    assert.ok(row, `Missing angle ${station.angle}`);
    const cells = [...row[1].matchAll(/<td>(.*?)<\/td>/g)].map(match => decode(match[1]));
    assert.equal(cells[2], String(Number(station.circumference.toFixed(3))));
    assert.equal(cells[3], String(Number(station.outerDepth.toFixed(3))));
    assert.equal(cells[4], String(Number(station.innerDepth.toFixed(3))));
  }
  const d = Number(html.match(/D 定位環：距支管自由直端 (\d+) mm/)[1]);
  assert.ok(Number.isInteger(d));
  assert.ok(d <= Math.min(...result.templates.find(template => template.id === 'branch').outer.filter(point => point[1] > 0).map(point => point[1])) + 1e-8);
});

test('zero stock is explicit, and rough depth includes the greater inner/outer depth without losing the finished values', () => {
  const result = ready();
  const html = buildFieldWorkOrderHTML(result, {}, { fabrication: { ...emptyFabricationPlan(), stock: 0 } });
  const expected = computeExactStationTable(result, 12);
  assert.match(html, /粗切深度/);
  for (const station of expected) {
    const row = html.match(new RegExp(`<tr[^>]*data-station-angle="${station.angle}">([\\s\\S]*?)<\\/tr>`));
    const cells = [...row[1].matchAll(/<td>(.*?)<\/td>/g)].map(match => decode(match[1]));
    assert.equal(cells[5], String(Number(Math.max(station.outerDepth, station.innerDepth).toFixed(3))));
  }
  assert.equal(pageCount(html), 1);
});

test('24 measured points keep both phases, each angle, tack references and entered limits', () => {
  const result = ready(), plan = records(result);
  const html = buildFieldWorkOrderHTML(result, {}, { fabrication: plan });
  assert.equal((html.match(/data-fit-index=/g) || []).length, 24);
  for (let i = 0; i < 24; i++) {
    const row = html.match(new RegExp(`<tr data-fit-index="${i}">([\\s\\S]*?)<\\/tr>`));
    assert.ok(row);
    assert.ok(row[1].includes(`${i * 15}°`));
    assert.ok(row[1].includes(`<td>${Number(plan.preGaps[i].toFixed(4))}</td>`));
    assert.ok(row[1].includes(`<td>${Number(plan.postGaps[i].toFixed(4))}</td>`));
  }
  assert.match(html, /WPS-101 REV-2/);
  assert.match(html, /T1/);
  assert.match(html, /T7/);
  assert.equal((html.match(/class="page fit-page"/g) || []).length, 2);
});

test('stale measurements and disposition are reconciled, while entered WPS and weld text remain, without mutating callers', () => {
  const result = ready(), plan = { ...records(result), inspectionKey: 'old-geometry', disposition: 'OLD-REPAIR-DISPOSITION', weldNote: 'KEEP-WELD-NOTE' };
  const beforePlan = JSON.stringify(plan), beforeResult = JSON.stringify(result);
  const html = buildFieldWorkOrderHTML(result, {}, { fabrication: plan });
  assert.doesNotMatch(html, /data-fit-index=|OLD-REPAIR-DISPOSITION/);
  assert.match(html, /實測紀錄已清除/);
  assert.match(html, /WPS-101 REV-2/);
  assert.match(html, /KEEP-WELD-NOTE/);
  assert.equal(JSON.stringify(plan), beforePlan);
  assert.equal(JSON.stringify(result), beforeResult);
});

test('maximum process text, explicit line breaks and markup characters are preserved as escaped text', () => {
  const result = ready(), plan = records(result);
  plan.wpsId = '<unsafe&header>'.padEnd(100, 'W');
  plan.gapBasis = '量測方向<external>'.padEnd(180, '向');
  plan.weldNote = ('A&B <KEEP>\n' + '焊道記錄'.repeat(100)).slice(0, 500);
  plan.disposition = ('處置開始\n' + '修整處置'.repeat(120)).slice(0, 500);
  const html = buildFieldWorkOrderHTML(result, {}, { fabrication: plan });
  assert.match(html, /&lt;unsafe&amp;header&gt;/);
  assert.match(html, /&lt;external&gt;/);
  assert.doesNotMatch(html, /<unsafe&header>|<KEEP>/);
  const text = processText(html).replaceAll('\n', '');
  assert.ok(text.includes(plan.weldNote.replaceAll('\n', '')));
  assert.ok(text.includes(plan.disposition.replaceAll('\n', '')));
});

test('invalid limits and unready geometry stop work-order production', () => {
  assert.throws(() => buildFieldWorkOrderHTML(ready(), {}, { fabrication: { ...emptyFabricationPlan(), gapMin: 3, gapMax: 1 } }), /下限不得大於上限/);
  assert.throws(() => buildFieldWorkOrderHTML({ ...ready(), manufacturingReady: false }), /尚未達到/);
  assert.throws(() => buildFieldWorkOrderHTML(ready(), {}, { orientation: 'landscape' }), /使用直式/);
});
