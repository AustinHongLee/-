/** Pipe fabrication exports. All geometry is measured in millimetres.
 * No drawing operation changes the size or shape of a supplied contour.
 */
export const PROJECT_FORMAT = 'pipe-fabrication-project';
export const PROJECT_VERSION = 1;

const PARAM_RULES = Object.freeze({
  mainOD: 'positive', mainWall: 'positive', mainLength: 'positive', jointPosition: 'nonnegative',
  branchOD: 'positive', branchWall: 'positive', branchLength: 'positive', angle: 'angle',
  azimuth: 'number', offset: 'number', jointType: ['on', 'in'], projection: 'nonnegative',
  rootGap: 'nonnegative', holeGap: 'nonnegative', padEnabled: 'boolean',
  padShape: ['circle', 'ellipse', 'obround', 'rounded'], padSplit: ['single', 'axial', 'circumferential'],
  padThickness: 'positive', padMargin: 'positive', padClearance: 'nonnegative',
  kFactor: 'factor', tolerance: 'positive', samples: 'samples',
});
const META_KEYS = new Set(['id', 'title', 'name', 'project', 'projectName', 'preparedBy', 'company', 'revision', 'createdAt', 'updatedAt', 'notes']);
const LABELS = Object.freeze({
  mainOD: ['主管實際外徑', 'mm'], mainWall: ['主管壁厚', 'mm'], mainLength: ['主管長度', 'mm'],
  jointPosition: ['接頭距主管基準端', 'mm'], branchOD: ['支管實際外徑', 'mm'], branchWall: ['支管壁厚', 'mm'],
  branchLength: ['支管最短軸向長度', 'mm'], angle: ['主管與支管軸線夾角', '°'], azimuth: ['支管方位角', '°'],
  offset: ['偏心量', 'mm'], jointType: ['接頭型式', ''], projection: ['凸入深度', 'mm'],
  rootGap: ['外貼徑向間隙', 'mm'], holeGap: ['主管孔口每側間隙', 'mm'], padEnabled: ['製作補強板', ''],
  padShape: ['補強板外形', ''], padSplit: ['補強板分片', ''], padThickness: ['補強板厚度', 'mm'],
  padMargin: ['補強板最低留邊', 'mm'], padClearance: ['補強板孔口每側間隙', 'mm'], kFactor: ['中性層係數 K', ''], tolerance: ['幾何公差', 'mm'], samples: ['圓周取樣分點數', '點'],
});
const ENUM_LABELS = Object.freeze({
  on: '外貼式（Set-on）', in: '插入式（Set-in）', circle: '圓形', ellipse: '橢圓形',
  obround: '長圓形', rounded: '圓角矩形', single: '單片', axial: '沿主管軸向分片', circumferential: '沿主管圓周分片',
});

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} 必須是有限數值。`);
  return value;
}
function fmt(value, digits = 3) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return Number(value.toFixed(digits)).toString();
}
function xml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function xmlText(value) { return xml(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); }
function point(value, label) {
  if (!Array.isArray(value) || value.length < 2) throw new Error(`${label} 座標格式錯誤。`);
  return [finite(value[0], label), finite(value[1], label)];
}
function pathPoints(values, label, closed = true) {
  if (!Array.isArray(values) || values.length < (closed ? 3 : 2)) throw new Error(`${label} 缺少有效輪廓。`);
  const output = values.map((p, i) => point(p, `${label} ${i + 1}`));
  if (closed && output.length > 1) {
    const a = output[0], b = output[output.length - 1];
    if (Math.abs(a[0] - b[0]) < 1e-8 && Math.abs(a[1] - b[1]) < 1e-8) output.pop();
  }
  if (closed && output.length < 3) throw new Error(`${label} 至少需要三個不同端點。`);
  return output;
}
function cleanTemplate(template) {
  if (!plainObject(template)) throw new Error('缺少可匯出的樣板。');
  const outer = pathPoints(template.outer, '外輪廓');
  const holes = (template.holes ?? []).map((h, i) => pathPoints(h, `孔口 ${i + 1}`));
  const references = (template.references ?? []).map((r, i) => ({
    points: pathPoints(r.points, `基準線 ${i + 1}`, false), label: String(r.label ?? ''), type: String(r.type ?? 'datum'),
  }));
  const cutPoints = [outer, ...holes].flat();
  const geometryPoints = [...cutPoints, ...references.flatMap(r => r.points)];
  const xs = geometryPoints.map(p => p[0]), ys = geometryPoints.map(p => p[1]);
  const minX = Math.min(0, ...xs), minY = Math.min(0, ...ys);
  const maxX = Math.max(finite(template.width, '樣板寬度'), ...xs), maxY = Math.max(finite(template.height, '樣板高度'), ...ys);
  if (maxX - minX <= 0 || maxY - minY <= 0) throw new Error('樣板尺寸必須大於零。');
  if (maxX - minX > 100000 || maxY - minY > 100000) throw new Error('樣板尺寸超出匯出上限。');
  return { ...template, outer, holes, references, bounds: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY } };
}
function pathD(points, close = true) {
  return points.map((p, i) => `${i ? 'L' : 'M'}${fmt(p[0], 6)},${fmt(p[1], 6)}`).join(' ') + (close ? ' Z' : '');
}
function centroid(points) {
  // Area centroid is useful for holes; fallback handles near-degenerate contours.
  let twiceArea = 0, sx = 0, sy = 0;
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length], cross = p[0] * q[1] - q[0] * p[1];
    twiceArea += cross; sx += (p[0] + q[0]) * cross; sy += (p[1] + q[1]) * cross;
  });
  return Math.abs(twiceArea) > 1e-8 ? [sx / (3 * twiceArea), sy / (3 * twiceArea)]
    : [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];
}
function crossesAt([x, y], size = 2) {
  return `<path d="M${fmt(x - size)},${fmt(y - size)}L${fmt(x + size)},${fmt(y + size)}M${fmt(x - size)},${fmt(y + size)}L${fmt(x + size)},${fmt(y - size)}"/>`;
}
function geometryMarkup(t, options = {}) {
  const outerPath = pathD(t.outer), compound = [outerPath, ...t.holes.map(h => pathD(h))].join(' ');
  const stroke = options.strokeWidth ?? 0.25;
  const keep = options.showKeep !== false;
  let output = `<g fill="none" stroke="#000" stroke-width="${stroke}" stroke-linejoin="round">`;
  if (keep) output += `<path d="${compound}" fill="#f4f4f4" fill-rule="evenodd" stroke="none"/>`;
  output += `<path d="${outerPath}"/><g data-layer="CUT_HOLE">${t.holes.map(h => `<path d="${pathD(h)}"/>`).join('')}</g>`;
  output += `<g data-layer="DATUM" stroke-width="0.2">${t.references.map(r => `<path d="${pathD(r.points, false)}" stroke-dasharray="${r.type === 'seam' || r.type === 'fold' || r.type === 'inner-edge' ? '2 1' : r.type === 'outer-edge' ? '1 1' : '6 1 1 1'}"/><text x="${fmt(r.points[0][0] + 1)}" y="${fmt(r.points[0][1] + 3)}" fill="#000" stroke="none" font-size="2.4">${xmlText(r.label)}</text>`).join('')}</g>`;
  output += `<g data-layer="REMOVE_MARK" stroke-width="0.3">${t.holes.map(h => crossesAt(centroid(h))).join('')}</g></g>`;
  return output;
}
function horizontalRuler(x, y) {
  let ticks = '';
  for (let i = 0; i <= 100; i += 5) {
    const length = i % 10 ? 1.4 : 2.6;
    ticks += `<path d="M${fmt(x + i)},${fmt(y)}v${length}"/>`;
    if (i % 20 === 0) ticks += `<text x="${fmt(x + i)}" y="${fmt(y + 5.3)}" text-anchor="middle" stroke="none" fill="#000" font-size="2.4">${i}</text>`;
  }
  return `<g fill="none" stroke="#000" stroke-width="0.2" data-calibration="horizontal-100mm"><path d="M${x},${y}h100"/>${ticks}<text x="${x + 50}" y="${y + 8.4}" fill="#000" stroke="none" text-anchor="middle" font-size="2.4">水平校正尺 100 mm</text></g>`;
}
function verticalRuler(x, y) {
  let ticks = '';
  for (let i = 0; i <= 100; i += 5) {
    const length = i % 10 ? 1.4 : 2.6;
    ticks += `<path d="M${x},${fmt(y + i)}h${length}"/>`;
    if (i % 20 === 0) ticks += `<text x="${x + 3.5}" y="${fmt(y + i + 0.8)}" fill="#000" stroke="none" font-size="2.4">${i}</text>`;
  }
  return `<g fill="none" stroke="#000" stroke-width="0.2" data-calibration="vertical-100mm"><path d="M${x},${y}v100"/>${ticks}<text transform="translate(${x + 11},${y + 50}) rotate(90)" fill="#000" stroke="none" text-anchor="middle" font-size="2.4">垂直校正尺 100 mm</text></g>`;
}

/** Full size SVG including an external calibration strip and a legend.
 * Any machining allowance must be computed by the geometric kernel first.
 */
export function templateSVG(template, options = {}) {
  const t = cleanTemplate(template);
  if (options.allowance !== undefined && finite(options.allowance, '加工補償') !== 0)
    throw new Error('請先由幾何模組計算加工補償輪廓；匯出器不會自行改變裁切線。');
  const margin = options.margin ?? 8;
  finite(margin, '圖框留白');
  if (margin < 4 || margin > 100) throw new Error('圖框留白須介於 4 與 100 mm。');
  const drawingW = Math.max(t.bounds.width, 108), drawingH = Math.max(t.bounds.height, 108);
  const width = drawingW + margin * 2 + 17, height = drawingH + margin * 2 + 26;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width)}mm" height="${fmt(height)}mm" viewBox="0 0 ${fmt(width)} ${fmt(height)}" role="img" aria-label="${xmlText(t.title)} 1:1 製作樣板">
<title>${xmlText(t.title)} — 原尺寸 1:1</title><desc>${xmlText(t.basis)}。實線為成品輪廓；孔內叉號為切除區。校正尺位於輪廓之外。</desc>
<rect width="100%" height="100%" fill="#fff"/>
<text x="${margin}" y="${margin + 3}" font-size="3.5" font-family="sans-serif" fill="#000">${xmlText(t.title)} · 1:1 · mm</text>
<g font-family="sans-serif" transform="translate(${fmt(margin - t.bounds.minX)},${fmt(margin + 10 - t.bounds.minY)})">${geometryMarkup(t, options)}</g>
${horizontalRuler(margin + 4, margin + 10 + drawingH + 3)}${verticalRuler(margin + drawingW + 3, margin + 14)}
<text x="${margin}" y="${height - 4}" font-family="sans-serif" font-size="2.5">實線＝成品裁切線　點劃線＝量測基準　虛線＝起縫／分片線　×＝孔口切除　灰區＝保留材料</text>
</svg>`;
}

/** AutoCAD R2000 ASCII geometry. $INSUNITS=4 denotes millimetres.
 * SVG's downwards Y is inverted so CAD and SVG have the same visible handedness.
 */
export function templateDXF(template, options = {}) {
  const t = cleanTemplate(template), chunks = [];
  const pair = (code, value) => { chunks.push(String(code), String(value)); };
  pair(0, 'SECTION'); pair(2, 'HEADER'); pair(9, '$ACADVER'); pair(1, 'AC1015');
  pair(9, '$INSUNITS'); pair(70, 4); pair(9, '$MEASUREMENT'); pair(70, 1); pair(9, '$LUNITS'); pair(70, 2);
  pair(0, 'ENDSEC'); pair(0, 'SECTION'); pair(2, 'TABLES'); pair(0, 'TABLE'); pair(2, 'LAYER'); pair(70, 5);
  for (const [name, colour] of [['CUT_OUTER', 7], ['CUT_HOLE', 1], ['DATUM', 3], ['SEAM', 5], ['FOLD', 6]]) {
    pair(0, 'LAYER'); pair(2, name); pair(70, 0); pair(62, colour); pair(6, 'CONTINUOUS');
  }
  pair(0, 'ENDTAB'); pair(0, 'ENDSEC'); pair(0, 'SECTION'); pair(2, 'ENTITIES');
  const writePolyline = (points, layer, closed) => {
    pair(0, 'LWPOLYLINE'); pair(100, 'AcDbEntity'); pair(8, layer); pair(100, 'AcDbPolyline');
    pair(90, points.length); pair(70, closed ? 1 : 0);
    for (const [x, y] of points) { pair(10, fmt(x, 6)); pair(20, fmt(options.flipY === false ? y : t.bounds.maxY - y, 6)); }
  };
  writePolyline(t.outer, 'CUT_OUTER', true);
  for (const hole of t.holes) writePolyline(hole, 'CUT_HOLE', true);
  for (const r of t.references) writePolyline(r.points, r.type === 'seam' ? 'SEAM' : r.type === 'fold' ? 'FOLD' : 'DATUM', false);
  pair(0, 'ENDSEC'); pair(0, 'EOF');
  return chunks.join('\r\n') + '\r\n';
}

function assertValidResult(result) {
  if (!plainObject(result) || result.valid !== true || (result.errors?.length ?? 0) > 0)
    throw new Error('幾何模型無效，請先修正輸入後再產生製作圖面。');
  if (!Array.isArray(result.templates) || !result.templates.length) throw new Error('模型尚未產生可匯出的樣板。');
  if ((result.verification ?? []).some(v => ['fail', 'error', 'failed'].includes(v.status)))
    throw new Error('幾何驗證未通過，請先修正模型後再產生製作圖面。');
  if ((result.verification ?? []).some(v => ['chord', 'discretization', 'tessellation'].includes(v.id)
    && (['warning', 'warn'].includes(v.status) || (Number.isFinite(v.value) && Number.isFinite(v.tolerance) && v.value > v.tolerance))))
    throw new Error('裁切輪廓的離散誤差超過設定公差，請提高取樣分點數後再產生製作圖面。');
}

/** UI can disable SVG/DXF actions using the same fabrication checks as the report. */
export function fabricationReadiness(result) {
  try { assertValidResult(result); return { ready: true, reason: '' }; }
  catch (error) { return { ready: false, reason: error.message }; }
}

/** UTF-8 BOM lets Excel on Windows detect Traditional Chinese correctly. */
export function stationCSV(result) {
  assertValidResult(result);
  if (!Array.isArray(result.stationTable)) throw new Error('模型缺少圓周分點資料。');
  const csvCell = value => `"${String(value).replace(/"/g, '""')}"`;
  const rows = [['圓周角度 (deg)', '圓周弧長 (mm)', '外緣切口深度 (mm)', '內緣切口深度 (mm)']];
  for (const [i, station] of result.stationTable.entries()) {
    rows.push(['angle', 'circumference', 'outerDepth', 'innerDepth'].map(key => {
      const value = station[key];
      if (value === null || value === undefined) return '';
      return fmt(finite(value, `分點 ${i + 1} ${key}`), 6);
    }));
  }
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function validateProjectParams(params) {
  if (!plainObject(params)) throw new Error('專案參數必須是物件。');
  const clean = {};
  for (const key of Object.keys(params)) {
    if (!Object.prototype.hasOwnProperty.call(PARAM_RULES, key)) throw new Error(`專案包含不支援的參數：${key}`);
    const rule = PARAM_RULES[key], value = params[key];
    if (Array.isArray(rule)) {
      if (!rule.includes(value)) throw new Error(`${LABELS[key]?.[0] ?? key} 選項不正確。`);
    } else if (rule === 'boolean') {
      if (typeof value !== 'boolean') throw new Error(`${key} 必須為布林值。`);
    } else {
      finite(value, LABELS[key]?.[0] ?? key);
      if (Math.abs(value) > 1000000) throw new Error(`${key} 數值超出允許範圍。`);
      if (rule === 'positive' && value <= 0) throw new Error(`${LABELS[key]?.[0] ?? key} 必須大於零。`);
      if (rule === 'nonnegative' && value < 0) throw new Error(`${LABELS[key]?.[0] ?? key} 不得小於零。`);
      if (rule === 'angle' && (value <= 0 || value >= 180)) throw new Error('軸線夾角必須大於 0° 且小於 180°。');
      if (rule === 'factor' && (value < 0 || value > 1)) throw new Error('中性層係數須介於 0 與 1。');
      if (rule === 'samples' && (!Number.isInteger(value) || value < 36 || value > 1440)) throw new Error('圓周取樣分點數須為 36 至 1440 的整數。');
    }
    clean[key] = value;
  }
  for (const key of ['mainOD', 'branchOD', 'angle', 'jointType']) {
    if (!(key in clean)) throw new Error(`專案缺少必要參數：${key}`);
  }
  if (clean.mainWall !== undefined && clean.mainWall * 2 >= clean.mainOD) throw new Error('主管壁厚不得達到外徑的一半。');
  if (clean.branchWall !== undefined && clean.branchWall * 2 >= clean.branchOD) throw new Error('支管壁厚不得達到外徑的一半。');
  if (clean.jointPosition !== undefined && clean.mainLength !== undefined && clean.jointPosition > clean.mainLength)
    throw new Error('接頭位置不得超出主管長度。');
  return clean;
}
function cleanMetadata(metadata = {}) {
  if (!plainObject(metadata)) throw new Error('專案描述必須是物件。');
  const clean = {};
  for (const key of Object.keys(metadata)) {
    if (!META_KEYS.has(key)) throw new Error(`專案包含不支援的描述欄位：${key}`);
    if (typeof metadata[key] !== 'string' || metadata[key].length > (key === 'notes' ? 20000 : 1000))
      throw new Error(`專案描述 ${key} 格式或長度不正確。`);
    clean[key] = metadata[key];
  }
  return clean;
}
export function projectJSON(params, metadata = {}) {
  return JSON.stringify({ format: PROJECT_FORMAT, version: PROJECT_VERSION, params: validateProjectParams(params), metadata: cleanMetadata(metadata) }, null, 2);
}
export function readProjectJSON(text) {
  if (typeof text !== 'string' || text.length > 200000) throw new Error('專案檔格式不正確或超出 200 KB 上限。');
  let data;
  try { data = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw new Error('無法讀取 JSON 專案檔。'); }
  if (!plainObject(data) || Object.keys(data).some(key => !['format', 'version', 'params', 'metadata'].includes(key)))
    throw new Error('專案檔結構不正確。');
  if (data.format !== PROJECT_FORMAT || data.version !== PROJECT_VERSION) throw new Error('不支援此專案格式或版本。');
  return { format: PROJECT_FORMAT, version: PROJECT_VERSION, params: validateProjectParams(data.params), metadata: cleanMetadata(data.metadata ?? {}) };
}

function paperSetup(options) {
  const paper = options.paper ?? 'A4', orientation = options.orientation ?? 'portrait';
  if (!['A4', 'A3'].includes(paper) || !['portrait', 'landscape'].includes(orientation)) throw new Error('請選擇 A4／A3 與直式／橫式紙張。');
  const [short, long] = paper === 'A4' ? [210, 297] : [297, 420];
  const [width, height] = orientation === 'portrait' ? [short, long] : [long, short];
  const margin = options.margin ?? 12, overlap = options.overlap ?? 10;
  finite(margin, '頁邊'); finite(overlap, '拼接重疊');
  if (margin < 8 || margin > 25) throw new Error('報告頁邊須介於 8 與 25 mm。');
  if (overlap < 5 || overlap > 20) throw new Error('拼接重疊須介於 5 與 20 mm。');
  const contentW = width - margin * 2, contentH = height - margin * 2;
  // Drawing header 24 mm, footer/ruler band 22 mm, separate right-hand ruler 17 mm.
  const tileW = contentW - 17, tileH = contentH - 46;
  if (tileW < 110 || tileH < 110) throw new Error('頁邊過大，無法保留 100 mm 雙方向校正尺。');
  return { paper, orientation, width, height, margin, overlap, contentW, contentH, tileW, tileH };
}
function axisTiles(span, viewport, overlap) {
  const count = Math.max(1, Math.ceil(Math.max(0, span - viewport) / (viewport - overlap)) + 1);
  return Array.from({ length: count }, (_, i) => i * (viewport - overlap));
}

function reportStations(result, options) {
  if (options.includeStations === false) return [];
  if (!Array.isArray(result.stationTable)) throw new Error('模型缺少圓周分點資料。');
  let rows = result.stationTable.map((station, index) => {
    if (!plainObject(station)) throw new Error(`分點 ${index + 1} 格式錯誤。`);
    return Object.fromEntries(['angle', 'circumference', 'outerDepth', 'innerDepth'].map(key => {
      const value = station[key];
      if (key === 'innerDepth' && (value === null || value === undefined)) return [key, null];
      return [key, finite(value, `分點 ${index + 1} ${key}`)];
    }));
  });
  if (options.stationCount !== undefined) {
    if (![12, 24, 36, 72].includes(options.stationCount)) throw new Error('報告放樣分點數須為 12、24、36 或 72。');
    rows = Array.from({ length: options.stationCount + 1 }, (_, index) => {
      const angle = index * 360 / options.stationCount;
      const row = rows.find(station => Math.abs(station.angle - angle) < 1e-7);
      if (!row) throw new Error(`目前分點表缺少 ${fmt(angle)}°；請由幾何模組重新取樣。`);
      return row;
    });
  }
  return rows;
}

/** Exposed for the UI: the exact same plan is used by the report renderer. */
export function reportPagePlan(result, options = {}) {
  assertValidResult(result);
  const paper = paperSetup(options);
  if (options.parts !== undefined && !Array.isArray(options.parts)) throw new Error('製作零件選擇格式錯誤。');
  const requested = options.parts === undefined ? null : new Set(options.parts);
  if (requested?.size === 0) throw new Error('請至少選擇一個製作零件。');
  if (requested && [...requested].some(id => !result.templates.some(t => t.id === id))) throw new Error('所選零件不在目前模型中。');
  const selected = result.templates.filter(t => requested === null || requested.has(t.id)).map(cleanTemplate);
  const parts = selected.map(t => {
    // A 3 mm blank around the contour prevents strokes on the tile bounds from being clipped.
    const xs = axisTiles(t.bounds.width + 6, paper.tileW, paper.overlap);
    const ys = axisTiles(t.bounds.height + 6, paper.tileH, paper.overlap);
    return { template: t, columns: xs.length, rows: ys.length, pageCount: xs.length * ys.length,
      tiles: ys.flatMap((y, row) => xs.map((x, column) => ({ row: row + 1, column: column + 1,
        x: t.bounds.minX - 3 + x, y: t.bounds.minY - 3 + y, width: paper.tileW, height: paper.tileH }))) };
  });
  const stationRows = reportStations(result, options);
  const stationCapacity = paper.paper === 'A4' ? (paper.orientation === 'portrait' ? 24 : 18)
    : paper.orientation === 'portrait' ? 48 : 32;
  const stationSheets = [];
  for (let offset = 0; offset < stationRows.length; offset += stationCapacity) {
    stationSheets.push({ rows: stationRows.slice(offset, offset + stationCapacity), offset });
  }
  const coverPages = 2, overviewPages = options.includeOverview ? parts.length : 0;
  const totalPages = coverPages + stationSheets.length + overviewPages + parts.reduce((sum, part) => sum + part.pageCount, 0);
  if (totalPages > 1000) throw new Error('圖面超過 1,000 頁，請改用較大紙張或 DXF 匯出。');
  return { paper, parts, coverPages, overviewPages, stationPages: stationSheets.length, stationRowCount: stationRows.length, stationSheets, totalPages };
}
export function estimateReportPages(result, options = {}) { return reportPagePlan(result, options).totalPages; }

function parameterRows(params, keys) {
  return keys.filter(k => params[k] !== undefined).map(key => {
    const [label, unit] = LABELS[key]; const value = params[key];
    const displayed = typeof value === 'number' ? fmt(value, 6) : typeof value === 'boolean' ? (value ? '是' : '否') : ENUM_LABELS[value] ?? value;
    return `<tr><th>${xmlText(label)}</th><td>${xmlText(displayed)} ${xmlText(unit)}</td></tr>`;
  }).join('');
}
function statusText(status) {
  return ({ pass: '通過', passed: '通過', ok: '通過', warn: '需核對', warning: '需核對', fail: '未通過', failed: '未通過',
    error: '錯誤', 'not-assessed': '未評估', info: '資訊', unverified: '未驗證' })[status] ?? String(status ?? '未評估');
}
function thresholdSymbol(verification) {
  return ['pad-margin', 'pad-inner-fit', 'pad-outer-fit'].includes(verification.id) ? '≥' : '≤';
}
function safeMessages(messages) {
  return (Array.isArray(messages) ? messages : []).map(w => typeof w === 'string' ? w : w.message ?? w.label ?? '').filter(Boolean);
}
function footer(title, page, total) {
  return `<footer>${xmlText(title)} · mm · 幾何製作資料 <span>第 ${page}／${total} 頁</span></footer>`;
}
function tileMarkup(t, tile, part, setup, uid) {
  const { tileW, tileH, contentW, overlap } = setup;
  const neighbor = [tile.column > 1 ? `左接 C${tile.column - 1}` : '', tile.column < part.columns ? `右接 C${tile.column + 1}` : '',
    tile.row > 1 ? `上接 R${tile.row - 1}` : '', tile.row < part.rows ? `下接 R${tile.row + 1}` : ''].filter(Boolean).join(' · ') || '單頁';
  let seams = '';
  const seam = (x1, y1, x2, y2) => `<path d="M${x1},${y1}L${x2},${y2}" stroke="#000" stroke-width="0.2" stroke-dasharray="1 1"/>`;
  if (tile.column > 1) seams += seam(overlap, 0, overlap, tileH);
  if (tile.column < part.columns) seams += seam(tileW - overlap, 0, tileW - overlap, tileH);
  if (tile.row > 1) seams += seam(0, overlap, tileW, overlap);
  if (tile.row < part.rows) seams += seam(0, tileH - overlap, tileW, tileH - overlap);
  // Registration crosses are located halfway through each shared overlap strip.
  // The paired page has the same mark at the same global sheet coordinate.
  const marks = [];
  const xs = [...(tile.column > 1 ? [overlap / 2] : []), ...(tile.column < part.columns ? [tileW - overlap / 2] : [])];
  const ys = [...(tile.row > 1 ? [overlap / 2] : []), ...(tile.row < part.rows ? [tileH - overlap / 2] : [])];
  for (const x of xs) for (const y of [20, tileH - 20]) marks.push([x, y]);
  for (const y of ys) for (const x of [20, tileW - 20]) marks.push([x, y]);
  const registration = marks.map(([x, y]) => `<path d="M${x - 2},${y}h4M${x},${y - 2}v4"/><circle cx="${x}" cy="${y}" r="1.3"/>`).join('');
  return `<svg class="tile-svg" xmlns="http://www.w3.org/2000/svg" width="${contentW}mm" height="${tileH + 16}mm" viewBox="0 0 ${contentW} ${tileH + 16}">
<rect width="100%" height="100%" fill="#fff"/>
<defs><clipPath id="clip-${uid}"><rect x="0" y="0" width="${tileW}" height="${tileH}"/></clipPath></defs>
<g clip-path="url(#clip-${uid})"><g transform="translate(${fmt(-tile.x, 6)},${fmt(-tile.y, 6)})" data-scale="1mm-per-svg-unit">${geometryMarkup(t)}</g></g>
<rect x="0.15" y="0.15" width="${tileW - 0.3}" height="${tileH - 0.3}" stroke="#000" stroke-width="0.2" fill="none"/>
<g data-layer="ASSEMBLY_GUIDE">${seams}<g stroke="#000" stroke-width="0.18" fill="#fff">${registration}</g></g>
${horizontalRuler(4, tileH + 3)}${verticalRuler(tileW + 3, 4)}
<text x="116" y="${tileH + 7}" font-size="2.3">${xmlText(neighbor)}</text>
<text x="116" y="${tileH + 11}" font-size="2.3">拼接重疊 ${overlap} mm · 細點線為拼接導引</text>
</svg>`;
}

/** Printable white/black report. Fabrication pages use true physical 1:1 SVG tiles.
 * assemblySVG is accepted only as caller-generated trusted markup; never use imported text.
 */
export function buildReportHTML(result, meta = {}, options = {}) {
  const plan = reportPagePlan(result, options), p = plan.paper;
  const params = validateProjectParams(result.params);
  const title = String(meta.title ?? meta.name ?? '配管接頭製作報告');
  const jointID = String(meta.id ?? '未編號');
  const revision = String(meta.revision ?? 'A');
  const date = String(meta.createdAt ?? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
  const metaLine = `接頭：${jointID}　專案：${meta.project ?? meta.projectName ?? '—'}　版次：${revision}　製作：${meta.preparedBy ?? '—'}　日期：${date}`;
  let pageNumber = 0;
  const pages = [];
  const page = (body, className = '') => {
    pageNumber++;
    pages.push(`<section class="page ${className}" data-page="${pageNumber}">${body}${footer(`接頭 ${jointID} · ${title}`, pageNumber, plan.totalPages)}</section>`);
  };
  const firstKeys = ['mainOD', 'mainWall', 'mainLength', 'jointPosition', 'branchOD', 'branchWall', 'branchLength', 'angle', 'azimuth', 'offset'];
  const secondKeys = Object.keys(LABELS).filter(key => !firstKeys.includes(key));
  const jointDescription = params.jointType === 'in'
    ? `插入式：支管穿入主管孔口；端口依模型設定 ${params.projection > 0 ? `凸入 ${fmt(params.projection)} mm` : '齊主管內壁'}。`
    : '外貼式：支管端口依主管外壁切出 fishmouth，支管貼合主管外壁。';
  page(`<header><h1>${xmlText(title)} · ${xmlText(jointID)}</h1><p>${xmlText(metaLine)}</p></header>
<div class="joint-description">${xmlText(jointDescription)}</div>
<div class="parameter-grid"><div><h2>管件與位置</h2><table>${parameterRows(params, firstKeys)}</table></div><div><h2>接合與補強板</h2><table>${parameterRows(params, secondKeys)}</table></div></div>
${options.assemblySVG ? `<div class="assembly-preview">${options.assemblySVG}</div><p class="small">組立預覽（示意比例）；請以尺寸與 1:1 樣板施工。</p>` : ''}
<div class="note"><strong>製作與列印基準</strong><p>所有尺寸單位為 mm。SVG／DXF 輪廓保持模型尺寸；本報告的拼接頁為 1:1。列印選擇「實際大小／100%」，關閉符合頁面、頁首與頁尾，選用 ${p.paper} ${p.orientation === 'portrait' ? '直式' : '橫式'}。每頁以水平與垂直校正尺各量得 100 mm 後，再使用樣板。</p><p>實線為成品輪廓。灰區為保留材料，孔內叉號為切除區；外輪廓以外也應切除。細點線與圈十字是紙張拼接導引，不是切割線。</p></div>
<p class="small">所選零件：${plan.parts.map(part => xmlText(part.template.title)).join('、')}。報告共 ${plan.totalPages} 頁，其中分點尺寸表 ${plan.stationPages} 頁、1:1 樣板 ${plan.parts.reduce((n, part) => n + part.pageCount, 0)} 頁。</p>`, 'cover');
  const verificationRows = (result.verification ?? []).map(v => `<tr><td>${xmlText(v.label)}</td><td>${typeof v.value === 'number' ? fmt(v.value, 8) : xmlText(v.value ?? '—')} ${xmlText(v.unit)}</td><td>${v.tolerance === null || v.tolerance === undefined ? '—' : typeof v.tolerance === 'number' ? `${thresholdSymbol(v)} ${fmt(v.tolerance, 8)}` : xmlText(v.tolerance)}</td><td>${xmlText(statusText(v.status))}</td></tr>`).join('');
  const warnings = safeMessages(result.warnings);
  const notes = plan.parts.flatMap(part => (part.template.notes ?? []).map(note => `${part.template.title}：${note}`));
  page(`<header><h1>幾何驗證與加工依據</h1><p>${xmlText(metaLine)}</p></header>
<div class="verification-columns"><div><table class="verification"><thead><tr><th>驗證項目</th><th>計算值</th><th>公差／門檻</th><th>結果</th></tr></thead><tbody>${verificationRows || '<tr><td colspan="4">模型未提供額外驗證數據。</td></tr>'}</tbody></table>
<h2>各零件展開基準</h2><table>${plan.parts.map(part => `<tr><th>${xmlText(part.template.title)}</th><td>${xmlText(part.template.basis)}<br>輪廓範圍 ${fmt(part.template.bounds.width)} × ${fmt(part.template.bounds.height)} mm；拼接 ${part.rows} 列 × ${part.columns} 欄</td></tr>`).join('')}</table>
</div><div>
${warnings.length ? `<h2>需要核對</h2><ul>${warnings.map(w => `<li>${xmlText(w)}</li>`).join('')}</ul>` : ''}
${notes.length ? `<h2>製作備註</h2><ul>${notes.map(n => `<li>${xmlText(n)}</li>`).join('')}</ul>` : ''}
${meta.notes ? `<p>${xmlText(meta.notes)}</p>` : ''}
<div class="note"><strong>驗證範圍</strong><p>本報告驗證模型的幾何關係與展開尺寸。未進行承壓設計、補強有效面積、焊接強度、疲勞或材料合格判定；補強板的幾何吻合不代表承壓補強合格。</p><p>切割刀縫、坡口、成形回彈與現場修配餘量，需依製程設定或另行核對。試組前確認管徑、壁厚、接頭方向、內外面、版次與校正尺。</p></div></div></div>`, 'verification-page');
  plan.stationSheets.forEach((sheet, index) => {
    const rows = sheet.rows.map((station, i) => {
      const closing = Math.abs(station.angle - 360) < 1e-7;
      return `<tr><td>${closing ? '0（閉合）' : sheet.offset + i}</td><td>${fmt(station.angle, 6)}°</td><td>${fmt(station.circumference)}</td><td>${fmt(station.outerDepth)}</td><td>${station.innerDepth === null ? '—' : fmt(station.innerDepth)}</td></tr>`;
    }).join('');
    page(`<header><h1>支管圓周分點尺寸表 · ${index + 1}／${plan.stationPages}</h1><p>${xmlText(metaLine)}</p></header>
<p class="small">${xmlText(ENUM_LABELS[params.jointType])} · 支管外徑 ${fmt(params.branchOD)} mm · 共 ${plan.stationRowCount} 筆 · 本頁 ${fmt(sheet.rows[0].angle, 6)}° 至 ${fmt(sheet.rows.at(-1).angle, 6)}° · 尺寸單位 mm</p>
<table class="station-table"><thead><tr><th>分點</th><th>圓周角度</th><th>外徑管周弧長</th><th>外緣切口深度</th><th>內緣切口深度</th></tr></thead><tbody>${rows}</tbody></table>
<div class="note station-note"><strong>現場量測基準</strong><p>沿支管實際外徑圓周，由 0° 起縫基準按樣板正向累加弧長；外緣與內緣深度皆由同一支管直端面，沿管軸方向量至相應切口。內緣使用相同圓周角度對應外徑分點，供壁厚修磨核對，並非內徑周長放樣。</p><p>360° 是 0° 接縫的閉合列。分點尺寸為成品線；請另核對刀縫、坡口與修配留料。請配合 1:1 樣板上的 0°、180° 與方向基準使用。</p></div>`, 'station-page');
  });
  for (const part of plan.parts) {
    const t = part.template;
    if (options.includeOverview) {
      const availableW = p.contentW, availableH = p.contentH - 46;
      page(`<header><h1>${xmlText(t.title)} · 圖面總覽</h1><p>${xmlText(t.basis)}</p></header>
<svg xmlns="http://www.w3.org/2000/svg" width="${availableW}mm" height="${availableH}mm" viewBox="${fmt(t.bounds.minX - 4)} ${fmt(t.bounds.minY - 4)} ${fmt(t.bounds.width + 8)} ${fmt(t.bounds.height + 8)}" preserveAspectRatio="xMidYMid meet">${geometryMarkup(t, { strokeWidth: Math.max(t.bounds.width / availableW, t.bounds.height / availableH) * 0.3 })}</svg>
<p>此頁為縮放總覽；不得直接作為裁切樣板。後續 ${part.pageCount} 頁為真正 1:1 分頁。</p>`, 'overview');
    }
    for (const tile of part.tiles) {
      const nextPage = pageNumber + 1;
      page(`<header class="tile-header"><h1>${xmlText(t.title)} · R${tile.row} C${tile.column} · 1:1</h1>
<p>接頭 ${xmlText(jointID)} · 版次 ${xmlText(revision)} · ${part.rows} 列 × ${part.columns} 欄 · ${xmlText(t.basis)}</p>
<p>全圖基準座標：X ${fmt(tile.x)} / Y ${fmt(tile.y)} mm · 按相同零件編號、列欄與圈十字對位</p></header>
${tileMarkup(t, tile, part, p, `p${nextPage}`)}
<p class="tile-legend">實線＝成品裁切線　點劃線＝量測基準　虛線＝起縫／分片線　×＝孔口切除　灰區＝保留材料</p>`, 'fabrication');
    }
  }
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${xmlText(jointID)} · ${xmlText(title)}</title>
<style>
@page { size: ${p.width}mm ${p.height}mm; margin: 0; }
* { box-sizing: border-box; } html, body { margin: 0; padding: 0; color: #000; font-family: "Noto Sans TC", "Microsoft JhengHei", Arial, sans-serif; font-size: 3mm; line-height: 1.45; }
body { background: #e7e7e7; } .page { width: ${p.width}mm; height: ${p.height}mm; padding: ${p.margin}mm; margin: 6mm auto; position: relative; background: #fff; overflow: hidden; break-after: page; page-break-after: always; }
.page:last-child { break-after: auto; page-break-after: auto; } header { border-bottom: .35mm solid #000; margin-bottom: 4mm; padding-bottom: 2mm; } h1 { font-size: 5mm; margin: 0 0 1.5mm; line-height: 1.25; } h2 { font-size: 3.5mm; margin: 3mm 0 1.5mm; } p { margin: 1.5mm 0; } .small { font-size: 2.5mm; }
table { width: 100%; border-collapse: collapse; font-size: 2.7mm; } th, td { border: .2mm solid #000; padding: 1.2mm 1.5mm; vertical-align: top; text-align: left; } th { font-weight: 600; } .parameter-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; } .parameter-grid th { width: 56%; } .joint-description { font-size: 3.2mm; border-left: 1mm solid #000; padding: 2mm 3mm; margin: 3mm 0; }
.note { border: .3mm solid #000; padding: 2.5mm; margin-top: 4mm; font-size: 2.6mm; } ul { margin: 1mm 0; padding-left: 5mm; font-size: 2.6mm; } footer { position: absolute; left: ${p.margin}mm; right: ${p.margin}mm; bottom: 5mm; border-top: .2mm solid #000; padding-top: 1mm; font-size: 2.3mm; } footer span { float: right; }
.verification-columns { display: ${p.orientation === 'landscape' ? 'grid' : 'block'}; grid-template-columns: 1fr 1fr; gap: 5mm; } ${p.orientation === 'landscape' ? '.verification-page table, .verification-page ul, .verification-page .note { font-size: 2.8mm; } .verification-page h2 { margin-top: 2mm; } .verification-page .note { margin-top: 2mm; }' : ''}
.station-table { margin-top: 3mm; font-size: 2.7mm; } .station-table td { text-align: right; font-variant-numeric: tabular-nums; } .station-table td:first-child { text-align: center; } .station-note { margin-top: 3mm; }
.assembly-preview { height: ${p.orientation === 'landscape' ? 22 : 38}mm; margin-top: 3mm; text-align: center; overflow: hidden; } .assembly-preview svg { max-width: 100%; height: 100%; }
.tile-header { height: 24mm; margin: 0; border: 0; padding: 0; overflow: hidden; } .tile-header h1 { font-size: 4mm; } .tile-header p { font-size: 2.5mm; } .tile-svg { display: block; max-width: none; } .tile-legend { font-size: 2.3mm; margin: 1mm 0; }
.print-controls { position: sticky; top: 0; z-index: 2; padding: 12px; background: #fff; border-bottom: 1px solid #555; text-align: center; font-size: 14px; } .print-controls button { margin: 0 8px; padding: 8px 18px; cursor: pointer; }
@media print { html, body { background: #fff; } .page { margin: 0; box-shadow: none; } .print-controls { display: none; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body><nav class="print-controls"><button onclick="window.print()">列印／另存 PDF</button><span>請設定 ${p.paper} ${p.orientation === 'portrait' ? '直式' : '橫式'}、實際大小 100%、關閉頁首與頁尾。先確認兩方向校正尺。</span></nav>${pages.join('\n')}</body></html>`;
}

/** Downloads UTF-8 content. Use directly from an explicit user action. */
export function downloadText(text, filename, mimeType = 'text/plain;charset=utf-8') {
  if (typeof document === 'undefined') throw new Error('下載功能需在瀏覽器中執行。');
  const blob = new Blob([text], { type: mimeType }), url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = String(filename).replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_');
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Opens the ready-to-print report. Popup blockers fall back to a downloadable HTML file. */
export function openPrintReport(html, filename = '配管製作報告.html') {
  if (typeof window === 'undefined') throw new Error('列印功能需在瀏覽器中執行。');
  const reportWindow = window.open('', '_blank');
  if (!reportWindow) { downloadText(html, filename, 'text/html;charset=utf-8'); return { opened: false, downloaded: true }; }
  reportWindow.opener = null;
  reportWindow.document.open(); reportWindow.document.write(html); reportWindow.document.close();
  // A blank window can inherit the parent CSP; bind through trusted code so
  // printing still works if an inline onclick attribute is disallowed.
  const printButton = reportWindow.document.querySelector('.print-controls button');
  if (printButton) printButton.onclick = () => reportWindow.print();
  return { opened: true, downloaded: false };
}
