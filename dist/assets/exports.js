/** Pipe fabrication exports. All geometry is measured in millimetres.
 * No drawing operation changes the size or shape of a supplied contour.
 */
export const PROJECT_FORMAT = 'pipe-fabrication-project';
export const PROJECT_VERSION = 1;

const PARAM_RULES = Object.freeze({
  mainOD: 'positive', mainWall: 'positive', mainLength: 'positive', jointPosition: 'number',
  branchOD: 'positive', branchWall: 'positive', branchLength: 'positive', angle: 'angle',
  azimuth: 'number', offset: 'number', jointType: ['on', 'in'], projection: 'nonnegative',
  rootGap: 'nonnegative', holeGap: 'nonnegative', padEnabled: 'boolean',
  padShape: ['circle', 'ellipse', 'obround', 'rounded'], padSplit: ['single', 'axial', 'circumferential'],
  padThickness: 'positive', padMargin: 'positive', padClearance: 'nonnegative',
  kFactor: 'factor', tolerance: 'positive', samples: 'samples',
  padManufacturing: ['neutral', 'formed-normal'], autoPrecision: 'boolean',
});
const META_KEYS = new Set(['id', 'title', 'name', 'project', 'projectName', 'preparedBy', 'company', 'revision', 'createdAt', 'updatedAt', 'notes']);
const LABELS = Object.freeze({
  mainOD: ['主管實際外徑', 'mm'], mainWall: ['主管壁厚', 'mm'], mainLength: ['主管長度', 'mm'],
  jointPosition: ['主管中心面軸基準 X（虛擬）', 'mm'], branchOD: ['支管實際外徑', 'mm'], branchWall: ['支管壁厚', 'mm'],
  branchLength: ['支管最短軸向長度', 'mm'], angle: ['主管與支管軸線夾角', '°'], azimuth: ['支管方位角', '°'],
  offset: ['偏心量', 'mm'], jointType: ['接頭型式', ''], projection: ['凸入深度', 'mm'],
  rootGap: ['外貼徑向間隙', 'mm'], holeGap: ['主管孔口每側間隙', 'mm'], padEnabled: ['製作補強板', ''],
  padShape: ['補強板外形', ''], padSplit: ['補強板分片', ''], padThickness: ['補強板厚度', 'mm'],
  padMargin: ['補強板最低留邊', 'mm'], padClearance: ['補強板孔口每側間隙', 'mm'], kFactor: ['中性層係數 K', ''], tolerance: ['數值輪廓誤差', 'mm'], samples: ['圓周取樣分點數', '點'],
  padManufacturing: ['補強板製作方式', ''], autoPrecision: ['自動達到數值精度', ''],
});
const ENUM_LABELS = Object.freeze({
  on: '外貼式（Set-on）', in: '插入式（Set-in）', circle: '圓形', ellipse: '橢圓形',
  obround: '長圓形', rounded: '圓角矩形', single: '單片', axial: '沿主管軸向分片', circumferential: '沿主管圓周分片',
  neutral: '平板彎製', 'formed-normal': '已彎板法線切孔',
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
    labelPosition: r.labelPosition ? point(r.labelPosition, `基準線 ${i + 1} 文字位置`) : null,
    textAnchor: r.textAnchor === 'end' ? 'end' : 'start',
    closed: r.closed === true, arrow: r.arrow === true,
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
function paperBoundary(t) {
  return t.outerRole === 'paper-boundary' || ['main', 'main-local'].includes(t.id);
}
function arrowTip(points) {
  const b = points.at(-1), a = points.at(-2), dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
  if (length < 1e-9) return '';
  const ux = dx / length, uy = dy / length, size = 1.8;
  return `<path d="M${fmt(b[0])},${fmt(b[1])}L${fmt(b[0] - ux * size - uy * .65)},${fmt(b[1] - uy * size + ux * .65)}L${fmt(b[0] - ux * size + uy * .65)},${fmt(b[1] - uy * size - ux * .65)}Z" fill="#000" stroke="none"/>`;
}
function glueMarkup(t) {
  const { circumference: c, glueTab: tab } = t.mapping ?? {};
  if (!(tab > 0) || !Number.isFinite(c)) return '';
  let hatch = '';
  for (let y = -tab; y < t.height; y += 4) {
    const a = Math.max(0, -y), b = Math.min(tab, t.height - y);
    if (a < b) hatch += `<path d="M${fmt(c + a)},${fmt(y + a)}L${fmt(c + b)},${fmt(y + b)}"/>`;
  }
  return `<g data-layer="GLUE_TAB"><rect x="${fmt(c)}" y="0" width="${fmt(tab)}" height="${fmt(t.height)}" fill="#fff" stroke="none"/><g stroke="#666" stroke-width=".15" fill="none">${hatch}</g><text x="${fmt(c + tab / 2)}" y="${fmt(t.height / 2)}" transform="rotate(90 ${fmt(c + tab / 2)} ${fmt(t.height / 2)})" text-anchor="middle" font-size="2.5" fill="#000">貼合舌 ${fmt(tab)} mm${t.height > 60 ? ' · 不切管材' : ''}</text></g>`;
}
function geometryMarkup(t, options = {}) {
  const outerPath = pathD(t.outer), compound = [outerPath, ...t.holes.map(h => pathD(h))].join(' ');
  const stroke = options.strokeWidth ?? 0.25;
  const keep = options.showKeep !== false;
  let output = `<g fill="none" stroke="#000" stroke-width="${stroke}" stroke-linejoin="round">`;
  if (keep) output += `<path d="${t.materialOutline ? pathD(t.materialOutline) : compound}" fill="#f4f4f4" fill-rule="evenodd" stroke="none"/>`;
  output += glueMarkup(t);
  output += `<path d="${outerPath}"${paperBoundary(t) ? ' data-layer="PAPER_BOUNDARY" stroke-width="0.18" stroke-dasharray="1 1"' : ''}/><g data-layer="CUT_HOLE">${t.holes.map(h => `<path d="${pathD(h)}"/>`).join('')}</g>`;
  output += `<g data-layer="DATUM" stroke-width="0.2">${t.references.map(r => `<path d="${pathD(r.points, r.closed && r.type !== 'cut-line')}"${r.type === 'cut-line' ? ' data-layer="CUT_FISHMOUTH" stroke-width=".4"' : ` stroke-dasharray="${r.type === 'tick' ? 'none' : r.type === 'seam' || r.type === 'fold' || r.type === 'inner-edge' ? '2 1' : r.type === 'outer-edge' ? '1 1' : '6 1 1 1'}"`}/>${r.arrow ? arrowTip(r.points) : ''}<text x="${fmt(r.labelPosition?.[0] ?? r.points[0][0] + 1)}" y="${fmt(r.labelPosition?.[1] ?? r.points[0][1] + 3)}" text-anchor="${r.textAnchor}" fill="#000" stroke="none" font-size="2.4">${xmlText(r.label)}</text>`).join('')}</g>`;
  output += `<g data-layer="REMOVE_MARK" stroke-width="0.3">${t.holes.map(h => crossesAt(centroid(h))).join('')}</g></g>`;
  if ((t.id === 'branch' || t.mapping?.coordinateSystem === 'branch-outer-wrap') && t.mapping?.paperTransform !== 'branch-mirror-x') {
    output += `<g data-layer="ANGLE_MARK" fill="#000" font-size="2.4"><text x="1" y="3">0° 起縫</text><text x="${fmt(t.width - 31)}" y="3">360° 同起縫</text><text x="${fmt(t.width / 2)}" y="5" text-anchor="middle">圓周弧長 →</text></g>`;
  } else if (t.id === 'main' && !t.mapping?.cropOrigin) {
    output += `<g data-layer="ANGLE_MARK" fill="#000" font-size="2.4"><text x="1" y="3">0° 背面起縫</text><text x="${fmt(t.width - 31)}" y="3">360° 同起縫</text><text x="${fmt(t.width / 2)}" y="5" text-anchor="middle">主管周向弧長 U →</text></g>`;
  }
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
function svgTextLines(value, width, size) {
  const lines = []; let line = '', span = 0;
  for (const char of String(value)) {
    const w = char.charCodeAt(0) <= 127 ? size * .6 : size;
    if (line && span + w > width) { lines.push(line); line = ''; span = 0; }
    line += char; span += w;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}
function svgTextBlock(lines, x, y, size, lineHeight) {
  return lines.map((line, i) => `<text x="${fmt(x)}" y="${fmt(y + i * lineHeight)}" font-size="${size}" font-family="sans-serif" fill="#000">${xmlText(line)}</text>`).join('');
}

/** Full size SVG including an external calibration strip and a legend.
 * Any machining allowance must be computed by the geometric kernel first.
 */
export function templateSVG(template, options = {}) {
  const t = cleanTemplate(fieldTemplate(template));
  if (options.allowance !== undefined && finite(options.allowance, '加工補償') !== 0)
    throw new Error('請先由幾何模組計算加工補償輪廓；匯出器不會自行改變裁切線。');
  const margin = options.margin ?? 8;
  finite(margin, '圖框留白');
  if (margin < 4 || margin > 100) throw new Error('圖框留白須介於 4 與 100 mm。');
  const drawingW = Math.max(t.bounds.width, 108), drawingH = Math.max(t.bounds.height, 108);
  const width = drawingW + margin * 2 + 17;
  const identity = `接頭 ${options.id ?? template.jointID ?? '未編號'} · 版次 ${options.revision ?? template.revision ?? 'A'}`;
  const titleLines = svgTextLines(`${t.title} · 1:1 · mm`, width - 2 * margin, 3.5);
  const identityLines = svgTextLines(`${identity} · 輪廓 ${fmt(t.bounds.width)} × ${fmt(t.bounds.height)} mm`, width - 2 * margin, 2.4);
  const basisLines = svgTextLines(`${t.basis} · ${templateAxes(t)}`, width - 2 * margin, 2.2);
  const legendLines = svgTextLines(templateLegend(t), width - 2 * margin, 2.5);
  const extraTitle = (titleLines.length - 1) * 4, extraIdentity = (identityLines.length - 1) * 3;
  const headerHeight = 10 + extraTitle + extraIdentity + (basisLines.length - 1) * 2.8;
  const height = drawingH + margin * 2 + 16 + headerHeight + (legendLines.length - 1) * 3;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width)}mm" height="${fmt(height)}mm" viewBox="0 0 ${fmt(width)} ${fmt(height)}" role="img" aria-label="${xmlText(t.title)} 1:1 製作樣板">
<title>${xmlText(t.title)} — 原尺寸 1:1</title><desc>${xmlText(t.basis)}。${xmlText(templateLegend(t))}。校正尺位於輪廓之外。</desc>
<rect width="100%" height="100%" fill="#fff"/>
${svgTextBlock(titleLines, margin, margin + 3, 3.5, 4)}
${svgTextBlock(identityLines, margin, margin + 6.5 + extraTitle, 2.4, 3)}
${svgTextBlock(basisLines, margin, margin + 9.3 + extraTitle + extraIdentity, 2.2, 2.8)}
<g font-family="sans-serif" transform="translate(${fmt(margin - t.bounds.minX)},${fmt(margin + headerHeight - t.bounds.minY)})">${geometryMarkup(t, options)}</g>
${horizontalRuler(margin + 4, margin + headerHeight + drawingH + 3)}${verticalRuler(margin + drawingW + 3, margin + headerHeight + 4)}
${svgTextBlock(legendLines, margin, height - 4 - (legendLines.length - 1) * 3, 2.5, 3)}
</svg>`;
}

/** AutoCAD R2000 ASCII geometry. $INSUNITS=4 denotes millimetres.
 * SVG's downwards Y is inverted so CAD and SVG have the same visible handedness.
 */
export function templateDXF(template, options = {}) {
  const t = cleanTemplate(fieldTemplate(template)), chunks = [];
  const pair = (code, value) => { chunks.push(String(code), String(value)); };
  pair(0, 'SECTION'); pair(2, 'HEADER'); pair(9, '$ACADVER'); pair(1, 'AC1015');
  pair(9, '$INSUNITS'); pair(70, 4); pair(9, '$MEASUREMENT'); pair(70, 1); pair(9, '$LUNITS'); pair(70, 2);
  if (options.id !== undefined) { pair(999, `JOINT_ID=${encodeURIComponent(String(options.id))}`); pair(999, `REVISION=${encodeURIComponent(String(options.revision ?? 'A'))}`); }
  pair(0, 'ENDSEC'); pair(0, 'SECTION'); pair(2, 'TABLES'); pair(0, 'TABLE'); pair(2, 'LAYER'); pair(70, 7);
  for (const [name, colour] of [['CUT_OUTER', 7], ['CUT_HOLE', 1], ['DATUM', 3], ['SEAM', 5], ['FOLD', 6], ['PAPER_BOUNDARY', 8], ['CUT_FISHMOUTH', 1]]) {
    pair(0, 'LAYER'); pair(2, name); pair(70, 0); pair(62, colour); pair(6, 'CONTINUOUS');
  }
  pair(0, 'ENDTAB'); pair(0, 'ENDSEC'); pair(0, 'SECTION'); pair(2, 'ENTITIES');
  const writePolyline = (points, layer, closed) => {
    pair(0, 'LWPOLYLINE'); pair(100, 'AcDbEntity'); pair(8, layer); pair(100, 'AcDbPolyline');
    pair(90, points.length); pair(70, closed ? 1 : 0);
    for (const [x, y] of points) { pair(10, fmt(x, 6)); pair(20, fmt(options.flipY === false ? y : t.bounds.maxY - y, 6)); }
  };
  writePolyline(t.outer, paperBoundary(t) ? 'PAPER_BOUNDARY' : 'CUT_OUTER', true);
  for (const hole of t.holes) writePolyline(hole, 'CUT_HOLE', true);
  for (const r of t.references) writePolyline(r.closed && r.type !== 'cut-line' ? pathPoints(r.points, '閉合參考線') : r.points,
    r.type === 'cut-line' ? 'CUT_FISHMOUTH' : r.type === 'seam' ? 'SEAM' : r.type === 'fold' ? 'FOLD' : 'DATUM', r.type !== 'cut-line' && r.closed);
  pair(0, 'ENDSEC'); pair(0, 'EOF');
  return chunks.join('\r\n') + '\r\n';
}

function assertValidResult(result) {
  if (!plainObject(result) || result.valid !== true || (result.errors?.length ?? 0) > 0)
    throw new Error('幾何模型無效，請先修正輸入後再產生製作圖面。');
  if (!Array.isArray(result.templates) || !result.templates.length) throw new Error('模型尚未產生可匯出的樣板。');
  if (typeof result.params?.tolerance === 'number' && result.params.tolerance < 1e-5)
    throw new Error('製作匯出的數值解析度下限為 0.00001 mm；更小數值輪廓誤差可保留數學預覽，請調整數值精度後再匯出。');
  if (result.manufacturingReady === false || result.precision?.metTolerance === false)
    throw new Error('裁切輪廓尚未達到設定的數值輪廓誤差；請啟用自動精度或提高取樣分點數。');
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
      return fmt(finite(value, `分點 ${i + 1} ${key}`), Math.max(6, stationDigits(result.params?.tolerance)));
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
      if (rule === 'samples' && (!Number.isInteger(value) || value < 36 || value > 4096)) throw new Error('圓周取樣分點數須為 36 至 4096 的整數。');
    }
    clean[key] = value;
  }
  for (const key of ['mainOD', 'branchOD', 'angle', 'jointType']) {
    if (!(key in clean)) throw new Error(`專案缺少必要參數：${key}`);
  }
  if (clean.mainWall !== undefined && clean.mainWall * 2 >= clean.mainOD) throw new Error('主管壁厚不得達到外徑的一半。');
  if (clean.branchWall !== undefined && clean.branchWall * 2 >= clean.branchOD) throw new Error('支管壁厚不得達到外徑的一半。');
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

function clipPolylineToRectangle(points, bounds) {
  const sections = [];
  let current = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b[0] - a[0], dy = b[1] - a[1];
    let start = 0, end = 1, keep = true;
    const p = [-dx, dx, -dy, dy], q = [a[0] - bounds.minX, bounds.maxX - a[0], a[1] - bounds.minY, bounds.maxY - a[1]];
    for (let j = 0; j < 4; j++) {
      if (Math.abs(p[j]) < 1e-12) { if (q[j] < 0) keep = false; continue; }
      const r = q[j] / p[j];
      if (p[j] < 0) start = Math.max(start, r); else end = Math.min(end, r);
    }
    if (!keep || start > end || end < 0 || start > 1) { if (current.length > 1) sections.push(current); current = []; continue; }
    const first = [a[0] + start * dx, a[1] + start * dy], last = [a[0] + end * dx, a[1] + end * dy];
    if (current.length && Math.hypot(current.at(-1)[0] - first[0], current.at(-1)[1] - first[1]) > 1e-7) {
      sections.push(current); current = [];
    }
    if (!current.length) current.push(first);
    if (Math.hypot(last[0] - current.at(-1)[0], last[1] - current.at(-1)[1]) > 1e-9) current.push(last);
  }
  if (current.length > 1) sections.push(current);
  return sections;
}

/** A local paper pattern around the full, unscaled main opening.
 * X is the parent template's circumferential arc; Y is its axial position.
 * No crop may truncate a hole. This is a paper boundary, not a metal outer cut.
 */
export function createMainOpeningPatch(result, options = {}) {
  if (!plainObject(result) || result.valid !== true) throw new Error('請先產生有效的主管開孔模型。');
  const source = result.templates?.find(t => t.id === 'main');
  if (!source) throw new Error('模型缺少主管整周樣板。');
  const t = cleanTemplate(source);
  if (!t.holes.length) throw new Error('主管樣板缺少完整開孔輪廓。');
  const margin = options.margin ?? 25;
  finite(margin, '局部紙樣留邊');
  if (margin < 5 || margin > 500) throw new Error('局部紙樣留邊須介於 5 與 500 mm。');
  const points = t.holes.flat();
  const hole = { minX: Math.min(...points.map(p => p[0])), maxX: Math.max(...points.map(p => p[0])),
    minY: Math.min(...points.map(p => p[1])), maxY: Math.max(...points.map(p => p[1])) };
  const stock = { minX: Math.min(...t.outer.map(p => p[0])), maxX: Math.max(...t.outer.map(p => p[0])),
    minY: Math.min(...t.outer.map(p => p[1])), maxY: Math.max(...t.outer.map(p => p[1])) };
  if (hole.minX < stock.minX - 1e-6 || hole.maxX > stock.maxX + 1e-6 || hole.minY < stock.minY - 1e-6 || hole.maxY > stock.maxY + 1e-6)
    throw new Error('主管開孔跨出完整樣板邊界，無法產生包含全孔的局部紙樣。');
  const b = { minX: Math.max(stock.minX, hole.minX - margin), maxX: Math.min(stock.maxX, hole.maxX + margin),
    minY: Math.max(stock.minY, hole.minY - margin), maxY: Math.min(stock.maxY, hole.maxY + margin) };
  const width = b.maxX - b.minX, height = b.maxY - b.minY;
  const move = p => [p[0] - b.minX, p[1] - b.minY];
  const notes = [...(t.notes ?? [])];
  if (b.minX > hole.minX - margin + 1e-7 || b.maxX < hole.maxX + margin - 1e-7 || b.minY > hole.minY - margin + 1e-7 || b.maxY < hole.maxY + margin - 1e-7)
    notes.push(`要求 ${fmt(margin)} mm 紙樣留邊在主管端部或起縫邊界縮短；完整孔口保持不裁切。`);
  const origin = Array.isArray(t.mapping?.origin) ? t.mapping.origin : [0, 0];
  const circumferentialOrigin = origin[0] + b.minX, axialOrigin = origin[1] + b.minY;
  const references = t.references.flatMap(r => clipPolylineToRectangle(r.points, b).map((segment, index) => ({
    ...r, points: segment.map(move), label: index ? '' : r.label,
    labelPosition: r.labelPosition ? [Math.max(2, Math.min(width - 2, r.labelPosition[0] - b.minX)), Math.max(3, Math.min(height - 2, r.labelPosition[1] - b.minY))] : null,
    closed: false,
  })));
  const markInset = Math.min(5, margin / 2, width / 4, height / 4);
  const a = [markInset, markInset], c = [width - markInset, markInset];
  for (const [name, p] of [['A', a], ['B', c]]) {
    references.push({ points: [[p[0] - 2, p[1]], [p[0] + 2, p[1]]], label: `${name}：X ${fmt(axialOrigin + p[1])} / U ${fmt(circumferentialOrigin + p[0])} mm`,
      labelPosition: name === 'A' ? [p[0] + 2, p[1] + 3] : [p[0] - 2, p[1] + 7], textAnchor: name === 'B' ? 'end' : 'start', type: 'datum' });
    references.push({ points: [[p[0], p[1] - 2], [p[0], p[1] + 2]], label: '', type: 'datum' });
  }
  notes.push(`本圖為主管外壁局部紙樣；細點外框只裁紙，金屬只切孔口實線。未更改孔口尺寸。`);
  notes.push(`紙樣左上角：距主管基準端 ${fmt(axialOrigin)} mm；由主管整周 0° 起縫沿周向弧長 ${fmt(circumferentialOrigin)} mm。`);
  notes.push(`A 定位點：軸向 ${fmt(axialOrigin + a[1])} mm／弧長 ${fmt(circumferentialOrigin + a[0])} mm；B：軸向 ${fmt(axialOrigin + c[1])} mm／弧長 ${fmt(circumferentialOrigin + c[0])} mm。`);
  notes.push(`由主管基準端看向另一端（+X），周向弧長沿逆時針增加；先按接頭方位建立背面 0° 起縫，360° 回到同一接縫。`);
  notes.push(`紙樣文字面朝外；橫向箭頭 U→為周向弧長增加，縱向 X↓遠離主管基準端。A/B 十字為定位記號，不是鑽孔或切線。`);
  return { ...source, id: 'main-local', title: '主管開孔局部包覆樣板', basis: '主管實際外徑局部包覆（非中性層）',
    width, height, outer: [[0, 0], [width, 0], [width, height], [0, height], [0, 0]], holes: t.holes.map(h => { const points = h.map(move); return [...points, [...points[0]]]; }),
    references, notes, outerRole: 'paper-boundary',
    mapping: { ...t.mapping, coordinateSystem: 'main-outer-local-wrap', sourceTemplate: 'main',
      origin: [circumferentialOrigin, axialOrigin], cropOrigin: [b.minX, b.minY], fullMainCircumference: stock.maxX - stock.minX,
      positioning: { A: { arc: circumferentialOrigin + a[0], axial: axialOrigin + a[1] }, B: { arc: circumferentialOrigin + c[0], axial: axialOrigin + c[1] } } } };
}

function branchSource(template) {
  const m = template.mapping ?? {};
  const c = finite(m.circumference, '支管外徑周長');
  if (c <= 0) throw new Error('支管外徑周長必須大於零。');
  const copy = values => values.map(p => point(p, '支管切口'));
  const originalOuterCut = m.originalOuterCut ? copy(m.originalOuterCut)
    : copy(template.outer).filter(p => p[1] > 1e-9 && p[0] >= -1e-7 && p[0] <= c + 1e-7).sort((a, b) => a[0] - b[0]);
  const uniqueOuter = originalOuterCut.filter((p, i, all) => !i || Math.hypot(p[0] - all[i - 1][0], p[1] - all[i - 1][1]) > 1e-8);
  if (uniqueOuter.length < 3 || Math.abs(uniqueOuter[0][0]) > 1e-6 || Math.abs(uniqueOuter.at(-1)[0] - c) > 1e-6)
    throw new Error('支管樣板缺少完整一周的 fishmouth 切口。');
  const inner = m.originalInnerEdge ?? template.references?.find(r => r.type === 'inner-edge')?.points ?? [];
  return { c, outer: uniqueOuter, inner: copy(inner), mapping: m };
}
function branchExactStation(result, angle, source) {
  const known = result?.stationTable?.find(s => Math.abs(s.angle - angle) < 1e-8);
  if (known && Number.isFinite(known.outerDepth)) return known;
  const p = result?.params;
  if (!p || !Number.isFinite(source.mapping.axisEnd)) throw new Error('請提供精確支管分點資料或完整幾何參數。');
  const a = p.angle * Math.PI / 180, theta = angle * Math.PI / 180, ro = p.branchOD / 2;
  const host = p.jointType === 'in' ? p.mainOD / 2 - p.mainWall : p.mainOD / 2 + p.rootGap;
  const depth = radius => {
    const y = p.offset + radius * Math.sin(theta), radicand = host * host - y * y;
    if (radicand < -1e-8) throw new Error('支管分點超出有效交線。');
    const t = (Math.sqrt(Math.max(0, radicand)) - radius * Math.cos(theta) * Math.cos(a)) / Math.sin(a)
      - (p.jointType === 'in' ? p.projection : 0);
    return source.mapping.axisEnd - t;
  };
  return { angle, circumference: source.c * angle / 360, outerDepth: depth(ro), innerDepth: depth(ro - p.branchWall) };
}
function branchPaper(template, result, options, local) {
  if (template.mapping?.paperTransform === 'branch-mirror-x' && !local && !template.mapping?.localCuttingWrap) return template;
  const source = branchSource(template), c = source.c;
  const tab = options.tab ?? 15, margin = local ? options.margin ?? 10 : 0, stationCount = options.stationCount ?? 24;
  finite(tab, '貼合舌寬度'); finite(margin, '口部紙樣留白');
  if (tab < 5 || tab > 100 || margin < 0 || margin > 100) throw new Error('貼合舌須為 5–100 mm；留白須為 0–100 mm。');
  if (![12, 24, 36, 72].includes(stationCount)) throw new Error('纸樣分點須為 12、24、36 或 72。');
  const all = [...source.outer, ...source.inner], minOuter = Math.min(...source.outer.map(p => p[1]));
  const minDepth = Math.min(...all.map(p => p[1])), maxDepth = Math.max(...all.map(p => p[1]));
  const top = local ? minDepth - margin : Math.min(0, minDepth), height = maxDepth - top + (local ? margin : 0), width = c + tab;
  const datumY = local ? minOuter - top : -top, originalDepthOrigin = local ? minOuter : 0;
  const move = p => [c - p[0], p[1] - top];
  const outerCut = source.outer.map(move), innerEdge = source.inner.map(move);
  const references = [
    { points: outerCut, label: '', type: 'cut-line', closed: false },
    ...(innerEdge.length > 1 ? [{ points: innerEdge, label: '', type: 'inner-edge', closed: false }] : []),
    { points: [[c, 0], [c, height]], label: c < 120 ? '0° 接縫' : '0° 接縫／貼合舌起點', type: 'seam', labelPosition: [c - 2, height - 3], textAnchor: 'end' },
    { points: [[0, 0], [0, height]], label: c < 120 ? '360° 同縫' : '360°＝0° 同一母線', type: 'seam', labelPosition: [2, height - 3] },
    { points: [[0, datumY], [c, datumY]], label: local ? `${c < 120 ? '定位環：直端 +' : '定位環線：距自由直端 '}${fmt(minOuter, 6)} mm` : '自由直端面 · 深度 0 mm', type: 'datum', labelPosition: [c < 120 ? 2 : c / 2, Math.min(height - 2, datumY + 3)], textAnchor: c < 120 ? 'start' : 'end' },
  ];
  const tickY = local ? datumY : Math.min(14, height / 3);
  const labelCount = [stationCount, 12, 4, 2].find(count => c / count >= 8) ?? 2;
  const labelStride = stationCount / labelCount;
  const stationRows = [];
  for (let i = 0; i <= stationCount; i++) {
    const angle = i * 360 / stationCount, x = c - c * i / stationCount;
    if (result?.params) stationRows.push(branchExactStation(result, angle, source));
    references.push({ points: [[x, Math.max(0, tickY - 2)], [x, Math.min(height, tickY + 2)]], label: i % labelStride === 0 ? `${fmt(angle)}°` : '', type: 'tick',
      labelPosition: [Math.min(c - 1, Math.max(1, x)), Math.max(3, tickY - 3)], textAnchor: i === 0 ? 'end' : 'start' });
  }
  const arrowY = Math.min(height - 4, tickY + 10);
  if (c > 25 && height > 20) references.push({ points: [[c * .7, arrowY], [c * .3, arrowY]], arrow: true, label: c < 160 ? '角度正向 ←' : 'θ 正向 ←（自由端朝接頭看：順時針）', type: 'direction', labelPosition: [c * .7, arrowY + 3], textAnchor: 'end' });
  // Preserve extra physical datums supplied by the caller, using the same original coordinates.
  if (!template.mapping?.paperTransform) for (const r of template.references ?? []) {
    if (!['inner-edge', 'seam', 'station'].includes(r.type)) references.push({ ...r, points: r.points.map(move), labelPosition: r.labelPosition ? move(r.labelPosition) : undefined });
  }
  const notes = [
    '文字面朝外包覆：0° 在紙樣右側，360° 在左側；兩側是同一母線。由自由直端看向接頭，角度正向為順時針，紙上角度往左增加。',
    `支管實際外徑周長 ${fmt(c, 6)} mm；右側 ${fmt(tab)} mm 斜線區只作貼合舌，覆在左側 0–${fmt(tab)} mm 紙區。細點矩形只裁紙，粗實線 CUT_FISHMOUTH 才切管材，內緣虛線只供壁厚修磨。`,
    ...(local ? [`先由自由直端面沿管軸量 ${fmt(minOuter, 6)} mm 畫定位環線，對準紙樣定位環線；紙樣只截取口部，並未把切口重新當成深度零。${top < 0 ? `紙樣上緣需凸出直端 ${fmt(-top, 6)} mm，可修掉空白，但不可移動定位環線。` : `紙樣上緣距自由直端 ${fmt(top, 6)} mm。`}`] : [top < 0 ? `紙樣深度 0 定位線對準自由直端面，紙緣凸出直端 ${fmt(-top, 6)} mm；所有內外緣共用原直端基準。` : '紙樣上緣對準自由直端面；所有外緣、內緣深度共用這個直端基準。']),
    '0° 母線位於通過支管軸線且平行主管軸線的平面，徑向朝主管基準端的一側；有偏心時兩條實際軸線未必共面。',
  ];
  return { ...template, id: local ? 'branch-local' : 'branch', title: local ? '支管口部短包覆紙樣' : '支管整長包覆紙樣',
    basis: '支管實際外徑，文字面朝外（深度由自由直端量）', width, height, outerRole: 'paper-boundary',
    outer: [[0, 0], [width, 0], [width, height], [0, height], [0, 0]], holes: [], references, notes,
    materialOutline: [[0, Math.max(0, -top)], [c, Math.max(0, -top)], ...outerCut, [0, Math.max(0, -top)]],
    mapping: { ...source.mapping, sourceTemplate: 'branch', coordinateSystem: 'branch-outer-wrap', circumference: c,
      paperTransform: 'branch-mirror-x', turnHandedness: 'clockwise-view-from-free-end', localCuttingWrap: local,
      originalOuterCut: source.outer, originalInnerEdge: source.inner, originalDepthOrigin, localDatumY: datumY,
      paperTopDepth: top, glueTab: tab, stationCount, stations: stationRows, origin: [0, top] } };
}

/** Full branch paper, with outward-facing handedness and separate open metal cut. */
export function createBranchFieldTemplate(template, result, options = {}) {
  return branchPaper(template, result, options, false);
}
/** Short mouth paper. Locate its datum ring from the original free straight end. */
export function createBranchCuttingWrap(result, options = {}) {
  if (!plainObject(result) || result.valid !== true) throw new Error('請先產生有效的支管模型。');
  const source = result.templates?.find(t => t.id === 'branch');
  if (!source) throw new Error('模型缺少支管樣板。');
  return branchPaper(source, result, options, true);
}
function pointInRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
/** Pad field paper uses U horizontally and X vertically, preserving its true cut. */
export function createPadFieldTemplate(template, result) {
  if (template.mapping?.paperAxes === 'u-x') return template;
  const t = cleanTemplate(template), move = p => [p[1], p[0]], baseOrigin = t.mapping?.origin ?? [0, 0];
  const outer = [...t.outer.map(move), move(t.outer[0])], holes = t.holes.map(h => [...h.map(move), move(h[0])]);
  const references = t.references.map(r => ({ ...r, points: r.points.map(move), labelPosition: r.labelPosition ? move(r.labelPosition) : undefined }));
  // Find an actual piece of retained material, so direction arrows never float in the hole.
  const keep = p => pointInRing(p, outer) && !holes.some(h => pointInRing(p, h));
  const length = Math.min(10, t.width / 12, t.height / 12);
  let anchor;
  for (let y = t.width / 12; y < t.width && !anchor; y += t.width / 12) for (let x = t.height / 12; x < t.height && !anchor; x += t.height / 12)
    if ([0, .25, .5, .75, 1].every(s => keep([x + length * s, y]) && keep([x, y + length * s]))) anchor = [x, y];
  if (anchor) {
    references.push({ points: [anchor, [anchor[0] + length, anchor[1]]], type: 'direction', arrow: true, label: 'U →', labelPosition: [anchor[0], anchor[1] - 1] });
    references.push({ points: [anchor, [anchor[0], anchor[1] + length]], type: 'direction', arrow: true, label: 'X ↓', labelPosition: [anchor[0] + 1, anchor[1] + length] });
    references.push({ points: [[anchor[0] - .6, anchor[1]], [anchor[0] + .6, anchor[1]]], type: 'datum',
      label: `定位 X ${fmt(baseOrigin[0] + anchor[1], 6)} / U ${fmt(baseOrigin[1] + anchor[0], 6)} mm`,
      labelPosition: [anchor[0] + 1, anchor[1] + 3] });
    references.push({ points: [[anchor[0], anchor[1] - .6], [anchor[0], anchor[1] + .6]], type: 'datum', label: '' });
  }
  const basisRadius = t.mapping?.basisRadius ?? (result?.params ? result.params.mainOD / 2 + (result.params.padManufacturing === 'formed-normal' ? result.params.padThickness : result.params.kFactor * result.params.padThickness) : null);
  const datumU = anchor ? baseOrigin[1] + anchor[0] : null;
  const mainArc = anchor && Number.isFinite(basisRadius) && result?.params ? Math.PI * result.params.mainOD / 2 + result.params.mainOD / 2 * datumU / basisRadius : null;
  const splitAxis = t.mapping?.splitAxis, splitCoordinate = t.mapping?.splitCoordinate;
  if ((splitAxis === 0 || splitAxis === 1) && Number.isFinite(splitCoordinate)) {
    const localCoordinate = splitCoordinate - baseOrigin[splitAxis], paperAxis = 1 - splitAxis;
    const seams = [];
    for (let i = 0; i < outer.length - 1; i++) {
      const a = outer[i], b = outer[i + 1];
      if (Math.abs(a[paperAxis] - localCoordinate) < 1e-6 && Math.abs(b[paperAxis] - localCoordinate) < 1e-6 && Math.hypot(a[0] - b[0], a[1] - b[1]) > 2)
        seams.push([a, b]);
    }
    seams.sort((a, b) => (a[0][1 - paperAxis] + a[1][1 - paperAxis]) - (b[0][1 - paperAxis] + b[1][1 - paperAxis]));
    seams.forEach(([a, b], index) => references.push({ points: [a, b], type: 'seam',
      label: `S${index + 1} 對合 · 配對相鄰片同號`, labelPosition: [(a[0] + b[0]) / 2 + 1, (a[1] + b[1]) / 2 + 2] }));
  }
  return { ...template, width: t.height, height: t.width, outer, holes, references,
    notes: [...(template.notes ?? []), `紙面橫向 U 為此板展開基準半徑的局部周向弧長（接頭方位正面母線 U=0），縱向 X 遠離主管基準端；紙框左上 X ${fmt(baseOrigin[0], 6)} / U ${fmt(baseOrigin[1], 6)} mm。定位十字位於保留材料。${mainArc !== null ? `該定位十字對主管外壁：距基準端 X ${fmt(baseOrigin[0] + anchor[1], 6)} mm，由背面起縫周向弧長 ${fmt(mainArc, 6)} mm。` : '按接頭方位與定位 X/U 核對板件，局部 U 不可直接當主管整周弧長。'}${template.mapping?.manufacturing === 'formed-normal' || result?.params?.padManufacturing === 'formed-normal' ? '文字面朝已彎板外側，尺寸使用板外表面。' : '此圖為平板彎製中性層下料，K 不代表已彎板外表面。'}分片 S 同號對合，對合標記不另增加裁切線。`],
    mapping: { ...t.mapping, paperAxes: 'u-x', baseOrigin: [...baseOrigin], origin: [baseOrigin[1], baseOrigin[0]],
      positioning: anchor ? { datum: { paper: [...anchor], axial: baseOrigin[0] + anchor[1], arc: datumU, mainOuterArc: mainArc } } : null,
      originalOuter: t.outer.map(p => [...p]), originalHoles: t.holes.map(h => h.map(p => [...p])) } };
}
function fieldTemplate(template, result) {
  if (template.mapping?.coordinateSystem === 'branch-outer-wrap' && !template.mapping?.paperTransform)
    return createBranchFieldTemplate(template, result);
  if (template.mapping?.coordinateSystem === 'main-local-cylindrical' && !template.mapping?.paperAxes)
    return createPadFieldTemplate(template, result);
  return template;
}

/** Compare orientations for the requested paper size without changing geometry. */
export function suggestReportOptions(result, options = {}) {
  const base = { ...options, paper: options.paper ?? 'A4' };
  const alternatives = ['portrait', 'landscape'].map(orientation => {
    const candidate = { ...base, orientation };
    return { options: candidate, pages: reportPagePlan(result, candidate).totalPages };
  });
  alternatives.sort((a, b) => a.pages - b.pages || (a.options.orientation === 'portrait' ? -1 : 1));
  const selected = alternatives[0];
  return { options: selected.options, pages: selected.pages, alternatives,
    savedPages: alternatives.at(-1).pages - selected.pages };
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
  if (options.orientation === 'auto') return reportPagePlan(result, suggestReportOptions(result, options).options);
  const paper = paperSetup(options);
  if (options.mainPattern !== undefined && !['full', 'local'].includes(options.mainPattern)) throw new Error('主管樣板須為整周 full 或局部 local。');
  if (options.branchPattern !== undefined && !['full', 'local'].includes(options.branchPattern)) throw new Error('支管樣板須為整長 full 或口部 local。');
  if (options.parts !== undefined && !Array.isArray(options.parts)) throw new Error('製作零件選擇格式錯誤。');
  const requested = options.parts === undefined ? null : new Set(options.parts);
  if (requested?.size === 0) throw new Error('請至少選擇一個製作零件。');
  if (requested && [...requested].some(id => !result.templates.some(t => t.id === id))) throw new Error('所選零件不在目前模型中。');
  const selected = result.templates.filter(t => requested === null ? !['main-local', 'branch-local'].includes(t.id) : requested.has(t.id)).map(t => {
    if (t.id === 'main' && options.mainPattern === 'local') return cleanTemplate({ ...createMainOpeningPatch(result, { margin: options.localMargin ?? 25 }), id: 'main' });
    if (t.id === 'branch' && options.branchPattern === 'local') return cleanTemplate({ ...createBranchCuttingWrap(result, { tab: options.branchTab ?? 15, margin: options.branchMargin ?? 10, stationCount: options.stationCount ?? 24 }), id: 'branch' });
    return cleanTemplate(fieldTemplate(t, result));
  });
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
  const notes = [...new Set(parts.flatMap(part => (part.template.notes ?? []).map(note => `${part.template.title}：${note}`)))];
  const fieldDrawing = parts.some(part => part.template.mapping?.paperTransform || part.template.mapping?.paperAxes);
  const noteSheets = [];
  if (fieldDrawing && notes.join('').length > 500) {
    const capacity = paper.paper === 'A4' ? 1000 : 1800;
    let sheet = [], count = 0;
    for (const note of notes) {
      if (sheet.length && count + note.length > capacity) { noteSheets.push(sheet); sheet = []; count = 0; }
      sheet.push(note); count += note.length;
    }
    if (sheet.length) noteSheets.push(sheet);
  }
  const coverPages = 2, overviewPages = options.includeOverview ? parts.length : 0;
  const totalPages = coverPages + noteSheets.length + stationSheets.length + overviewPages + parts.reduce((sum, part) => sum + part.pageCount, 0);
  if (totalPages > 1000) throw new Error('圖面超過 1,000 頁，請改用較大紙張或 DXF 匯出。');
  return { paper, parts, coverPages, overviewPages, notePages: noteSheets.length, noteSheets, stationPages: stationSheets.length, stationRowCount: stationRows.length, stationSheets, totalPages };
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
function templateAxes(template) {
  if (template.id === 'main' || template.id === 'main-local' || template.mapping?.coordinateSystem === 'main-outer-wrap' || template.mapping?.coordinateSystem === 'main-outer-local-wrap')
    return 'U→周向逆時針；X↓離基準端';
  if (template.mapping?.paperTransform === 'branch-mirror-x') return `θ←順時針（自由端看接頭）；深度↓${template.mapping.localCuttingWrap ? `定位環距直端 ${fmt(template.mapping.originalDepthOrigin)} mm` : '由自由直端量'}`;
  if (template.id === 'branch' || template.mapping?.coordinateSystem === 'branch-outer-wrap') return '0°→360°；深度↓由直端面量';
  if (template.mapping?.paperAxes === 'u-x') return 'U→主管周向；X↓離基準端';
  return 'X→主管軸向；U↓主管周向';
}
function templateLegend(t) {
  if (t.mapping?.paperTransform === 'branch-mirror-x') return '粗實線＝魚口金屬切線；細點框只裁紙；斜線區＝貼合舌；內緣虛線供修磨';
  if (t.id === 'main' || t.id === 'main-local') return '孔口實線＝金屬切線；細點框只裁紙；×＝孔口切除；十字只作定位';
  return '實線＝金屬輪廓；點劃線＝基準；虛線＝分片對合／內緣；×＝孔口切除';
}
function mainSurfaceEntry(params) {
  const r = params.mainOD / 2, offset = params.offset ?? 0, a = params.angle * Math.PI / 180;
  if (!(Math.abs(offset) < r) || Math.abs(Math.sin(a)) < 1e-12) return '';
  const position = params.jointPosition + Math.sqrt(r * r - offset * offset) / Math.tan(a);
  const angle = (((params.azimuth ?? 0) + Math.asin(offset / r) * 180 / Math.PI) % 360 + 360) % 360;
  return `<tr><th>支管軸線穿主管外表面<br>（實體定位）</th><td>距基準端 ${fmt(position, 6)} mm<br>方位角 ${fmt(angle, 6)}°</td></tr>`;
}
function padManufacturingText(params) {
  if (!params.padEnabled) return '本接頭未加補強板。';
  if (params.padManufacturing === 'formed-normal') return '已彎板法線切孔：樣板以補強板外表面（主管外半徑＋板厚）包覆，孔口按全板厚法線切孔包絡計算。中性層 K 不參與此基準；此圖不可當成平板彎製的中性層下料圖。';
  return '平板彎製：依主管外半徑＋K×板厚的中性層展開供板材下料。K 須依材料與設備校正，成形後核對孔口內外緣並依工法修孔。此圖不可當成已彎板外表面的包覆樣板。';
}
function thresholdSymbol(verification) {
  return ['pad-margin', 'pad-inner-fit', 'pad-outer-fit'].includes(verification.id) ? '≥' : '≤';
}
function stationDigits(tolerance) {
  return Math.max(3, Math.min(8, Number.isFinite(tolerance) && tolerance > 0 ? Math.ceil(-Math.log10(tolerance)) + 1 : 3));
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
  const params = { padManufacturing: 'neutral', autoPrecision: true, ...validateProjectParams(result.params) };
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
  const secondKeys = Object.keys(LABELS).filter(key => !firstKeys.includes(key) && !(key === 'kFactor' && params.padManufacturing === 'formed-normal'));
  const jointDescription = params.jointType === 'in'
    ? `插入式：支管穿入主管孔口；端口依模型設定 ${params.projection > 0 ? `凸入 ${fmt(params.projection)} mm` : '齊主管內壁'}。`
    : '外貼式：支管端口依主管外壁切出 fishmouth，支管貼合主管外壁。';
  page(`<header><h1>${xmlText(title)} · ${xmlText(jointID)}</h1><p>${xmlText(metaLine)}</p></header>
<div class="joint-description">${xmlText(jointDescription)}</div>
<div class="parameter-grid"><div><h2>管件與位置</h2><table>${parameterRows(params, firstKeys)}${mainSurfaceEntry(params)}</table></div><div><h2>接合與補強板</h2><table>${parameterRows(params, secondKeys)}</table></div></div>
${options.assemblySVG ? `<div class="assembly-preview">${options.assemblySVG}</div><p class="small">組立預覽（示意比例）；請以尺寸與 1:1 樣板施工。</p>` : ''}
<div class="note quick-steps"><strong>現場製作摘要 · 按順序完成</strong><ol><li>核對接頭 ${xmlText(jointID)}、版次、管徑壁厚與基準端；內插／外貼按剖面與尺寸組裝。</li><li>列印 ${p.paper} ${p.orientation === 'portrait' ? '直式' : '橫式'}，實際大小 100%；關閉縮放及頁首頁尾，量水平與垂直校正尺各為 100 mm。</li><li>同一零件按 R/C 列欄與圈十字拼接；先建立 0° 起縫，360° 回到同一接縫，文字面朝外包覆。</li><li>主管只切孔口實線，細點外框只裁紙；魚口按成品線裁切。先核對尺寸與留料，再試組、修磨及焊接。</li></ol></div>
<p class="small">所選零件：${plan.parts.map(part => xmlText(part.template.title)).join('、')}。報告共 ${plan.totalPages} 頁，其中分點尺寸表 ${plan.stationPages} 頁、1:1 樣板 ${plan.parts.reduce((n, part) => n + part.pageCount, 0)} 頁。</p>`, 'cover');
  const verificationRows = (result.verification ?? []).map(v => `<tr><td>${xmlText(v.label)}</td><td>${typeof v.value === 'number' ? fmt(v.value, 8) : xmlText(v.value ?? '—')} ${xmlText(v.unit)}</td><td>${v.tolerance === null || v.tolerance === undefined ? '—' : typeof v.tolerance === 'number' ? `${thresholdSymbol(v)} ${fmt(v.tolerance, 8)}` : xmlText(v.tolerance)}</td><td>${xmlText(statusText(v.status))}</td></tr>`).join('');
  const warnings = safeMessages(result.warnings);
  const notes = plan.notePages ? [] : [...new Set(plan.parts.flatMap(part => (part.template.notes ?? []).map(note => `${part.template.title}：${note}`)))];
  page(`<header><h1>幾何驗證與加工依據</h1><p>${xmlText(metaLine)}</p></header>
<div class="verification-columns"><div><table class="verification"><thead><tr><th>驗證項目</th><th>計算值</th><th>數值誤差／門檻</th><th>結果</th></tr></thead><tbody>${verificationRows || '<tr><td colspan="4">模型未提供額外驗證數據。</td></tr>'}</tbody></table>
<h2>各零件展開基準</h2><table>${plan.parts.map(part => `<tr><th>${xmlText(part.template.title)}</th><td>${xmlText(part.template.basis)}<br>輪廓範圍 ${fmt(part.template.bounds.width)} × ${fmt(part.template.bounds.height)} mm；拼接 ${part.rows} 列 × ${part.columns} 欄</td></tr>`).join('')}</table>
<h2>補強板製程基準</h2><p class="small">${xmlText(padManufacturingText(params))}</p>
${result.precision ? `<p class="small">取樣：要求 ${xmlText(result.precision.requestedSamples)}／實際 ${xmlText(result.precision.effectiveSamples)} 點；${result.precision.auto ? '自動精度' : '手動精度'}。每段 7 個內部點的採樣弦差 ${fmt(result.precision.sampledMaxChordError ?? result.precision.maxChordError, 8)} mm × ${fmt(result.precision.guardFactor ?? 1.1)} 數值餘量 = ${fmt(result.precision.maxChordError, 8)} mm；目標數值輪廓誤差 ${fmt(result.precision.tolerance, 8)} mm。這是離散採樣檢查，並非連續曲線誤差的嚴格數學上界，也不是現場加工公差保證。</p>` : ''}
</div><div>
${warnings.length ? `<h2>需要核對</h2><ul>${warnings.map(w => `<li>${xmlText(w)}</li>`).join('')}</ul>` : ''}
${notes.length ? `<h2>製作備註</h2><ul>${notes.map(n => `<li>${xmlText(n)}</li>`).join('')}</ul>` : ''}
${meta.notes ? `<p>${xmlText(meta.notes)}</p>` : ''}
<div class="note"><strong>驗證範圍與方向</strong><p>本報告驗證模型幾何、全板厚開孔基準及展開尺寸。未進行承壓設計、補強有效面積、焊接強度、疲勞或材料合格判定；幾何吻合不代表承壓補強合格。</p><p>由主管基準端看向另一端，主管周向弧長沿逆時針增加；先按接頭方位建立背面起縫。支管由自由直端面朝接頭看，角度沿順時針增加；0° 位於通過支管軸線且平行主管軸線的平面，徑向朝主管基準端；偏心接頭兩條實際軸線未必共面。</p><p>灰區保留，孔內×切除；裁紙邊、貼合舌、定位十字與拼接線不得當金屬切線。刀縫、坡口、回彈與修配餘量需依製程核對。</p></div></div></div>`, 'verification-page');
  plan.noteSheets.forEach((notes, index) => page(`<header><h1>紙樣定位與現場操作 · ${index + 1}／${plan.notePages}</h1><p>${xmlText(metaLine)}</p></header><p>先以 100% 列印並核對雙方向 100 mm 校正尺，再拼接、建立管件基準與貼合紙樣。</p><ul class="field-notes">${notes.map(note => `<li>${xmlText(note)}</li>`).join('')}</ul><div class="note">各樣板定位值以 mm 表示。先核對接頭編號、版次、內插／外貼與實際管徑；紙樣貼合後先劃線與試組，再依核准工法裁切修磨。</div>`, 'field-notes-page'));
  plan.stationSheets.forEach((sheet, index) => {
    const rows = sheet.rows.map((station, i) => {
      const closing = Math.abs(station.angle - 360) < 1e-7;
      const digits = stationDigits(params.tolerance);
      return `<tr><td>${closing ? '0（閉合）' : sheet.offset + i}</td><td>${fmt(station.angle, 6)}°</td><td>${fmt(station.circumference, digits)}</td><td>${fmt(station.outerDepth, digits)}</td><td>${station.innerDepth === null ? '—' : fmt(station.innerDepth, digits)}</td></tr>`;
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
<p>模板座標 ${fmt(tile.x)} / ${fmt(tile.y)} mm · ${xmlText(templateAxes(t))} · 輪廓 ${fmt(t.bounds.width)}×${fmt(t.bounds.height)} mm</p></header>
${tileMarkup(t, tile, part, p, `p${nextPage}`)}
<p class="tile-legend">${xmlText(templateLegend(t))}</p>`, 'fabrication');
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
.verification-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; } .verification-page h2 { margin-top: 2mm; } .verification-page .note { margin-top: 2mm; } .verification-page td { overflow-wrap: anywhere; } ${p.orientation === 'landscape' ? '.verification-page table, .verification-page ul, .verification-page .note { font-size: 2.8mm; } .cover table { font-size: 2.5mm; } .cover th, .cover td { padding: .8mm 1.2mm; } .cover .quick-steps { line-height: 1.35; font-size: 2.5mm; }' : ''}
.quick-steps ol { margin: 1mm 0 0; padding-left: 5mm; font-size: inherit; }
.field-notes { font-size: 3mm; line-height: 1.65; } .field-notes li { margin-bottom: 3mm; }
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
