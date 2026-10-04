/** Small, immutable workflow helpers. Geometry validation stays in joint-model.
 * Connection drafts contain only the three connection dimensions. They never
 * contain fabrication measurements, metadata, pipe sizes, or position settings.
 */
import {DEFAULT_PARAMS} from './joint-model.js';
import {resolveElbowAlignment,elbowAlignmentLabel,ELBOW_ALIGNMENT_MODES} from './elbow-axis.js';
import {ASME_PIPE_SIZES} from './pipe-sizes.js';
import {mainAxisSurfaceDatum} from './field-datums.js';

const CONNECTION_FIELDS=Object.freeze(['rootGap','projection','holeGap']);
const HOSTS=Object.freeze(['straight','elbow','cone']);
const MODES=Object.freeze(['on-open','in-open','on-closed']);
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fmt=(value,digits=3)=>Number.isFinite(value)?Number(value.toFixed(digits)).toString():'—';
const norm=value=>((value%360)+360)%360;

/** Error navigation is stable even when an individual input is folded/hidden. */
export function settingPanelForField(field){
  if(typeof field!=='string')return 1;
  if(field.startsWith('fab.'))return 3;
  if(['hostType','mainOD','mainEndOD','mainWall','mainLength','branchOD','branchWall','branchLength','bendAngle','bendRadius'].includes(field))return 0;
  if(field.startsWith('pad')||field==='kFactor')return 2;
  if(['tolerance','samples','autoPrecision'].includes(field))return 4;
  return 1;
}

export function connectionMode(params){
  const type=params.jointType??DEFAULT_PARAMS.jointType;
  const opening=params.motherOpening??DEFAULT_PARAMS.motherOpening;
  if(!['on','in'].includes(type)||typeof opening!=='boolean'||(type==='in'&&!opening))throw new RangeError('請選外貼開孔、開孔內插或母材封閉外焊。');
  return `${type}-${opening?'open':'closed'}`;
}

export function connectionDraftKey(params){
  const host=params.hostType??DEFAULT_PARAMS.hostType;
  if(!HOSTS.includes(host))throw new RangeError('母材型式無效。');
  return `${host}/${connectionMode(params)}`;
}

function readChoice(choice){
  if(typeof choice==='string'){
    if(!MODES.includes(choice))throw new RangeError('接法選擇無效。');
    return {jointType:choice.startsWith('in-')?'in':'on',motherOpening:choice.endsWith('-open')};
  }
  if(!object(choice)||!own(choice,'jointType')||!own(choice,'motherOpening'))throw new TypeError('接法需包含 jointType 與 motherOpening。');
  const output={jointType:choice.jointType,motherOpening:choice.motherOpening};
  connectionMode(output);
  return output;
}

function dimensions(params){
  return Object.fromEntries(CONNECTION_FIELDS.map(field=>[field,params[field]===undefined?DEFAULT_PARAMS[field]:params[field]]));
}

/** Select a connection without losing the other connections' entered dimensions.
 * Usage: changeConnection(params, 'in-open', drafts).
 * The returned objects are new only when the selection changes. Re-clicking the
 * selected card returns the original references, so it cannot trigger a revision
 * or measurement invalidation. Invalid entered numbers are deliberately retained
 * in drafts; the caller must run the normal kernel validation after applying.
 */
export function changeConnection(params,choice,drafts={}){
  if(!object(params)||!object(drafts))throw new TypeError('尺寸與接法草稿需為物件。');
  const selected=readChoice(choice),next={...params,...selected};
  if((params.hostType??DEFAULT_PARAMS.hostType)==='straight'&&!selected.motherOpening)throw new RangeError('直管母材封閉外焊尚未支援。');
  const from=connectionDraftKey(params),to=connectionDraftKey(next);
  if(from===to)return {params,drafts,changed:false};

  const updatedDrafts={...drafts,[from]:dimensions(params)};
  const saved=object(updatedDrafts[to])?updatedDrafts[to]:null;
  // Carry the user's per-side opening gap on the first visit to another mode;
  // root gap and insertion depth are independent and start at existing defaults.
  const first={rootGap:DEFAULT_PARAMS.rootGap,projection:DEFAULT_PARAMS.projection,holeGap:params.holeGap===undefined?DEFAULT_PARAMS.holeGap:params.holeGap};
  for(const field of CONNECTION_FIELDS)next[field]=saved&&saved[field]!==undefined?saved[field]:first[field];
  if(!selected.motherOpening)next.projection=0;
  return {params:next,drafts:updatedDrafts,changed:true};
}

/** Canonical complete parameter record for a favorite, using current defaults.
 * Only known parameter keys participate; titles, IDs, metadata and measured fit
 * records cannot affect its identity. No dimensions are rounded or snapped to an
 * ASME size. Cyclic orientation angles and derived coaxial coordinates normalize
 * to the same representation. Numeric precision settings remain in the record:
 * a favorite restores the complete verified setup, including its export intent.
 */
export function normalizeFavoriteParams(raw={}){
  if(!object(raw))throw new TypeError('常用尺寸需為尺寸物件。');
  let merged={};
  for(const [key,fallback] of Object.entries(DEFAULT_PARAMS)){
    let value=own(raw,key)&&raw[key]!==undefined?raw[key]:fallback;
    if(typeof fallback==='number'){
      // Numeric strings can occur in a migration from form-backed favorites.
      if(typeof value==='string'&&value.trim()!=='')value=Number(value);
      if(typeof value!=='number'||!Number.isFinite(value))throw new TypeError(`常用尺寸 ${key} 需為有限數值。`);
      if(Object.is(value,-0))value=0;
    }else if(typeof value!==typeof fallback)throw new TypeError(`常用尺寸 ${key} 型別不正確。`);
    merged[key]=value;
  }
  if(!HOSTS.includes(merged.hostType))throw new RangeError('母材型式無效。');
  if(!ELBOW_ALIGNMENT_MODES.includes(merged.elbowAlignment))throw new RangeError('端口定位方式無效。');
  connectionMode(merged);
  for(const field of ['azimuth','surfaceClock','branchSwivel'])merged[field]=norm(merged[field]);
  if(merged.hostType==='elbow')merged=resolveElbowAlignment(merged);
  return Object.fromEntries(Object.keys(merged).sort().map(key=>[key,merged[key]]));
}

export function favoriteIdentity(params){
  return JSON.stringify(normalizeFavoriteParams(params));
}

function sizeLabel(diameter){
  const size=ASME_PIPE_SIZES.find(item=>item.odMm===diameter);
  return size?`${size.nps.replace('-',' ')}吋`:`Ø${fmt(diameter)}`;
}

/** Plain Chinese text, suitable for a select option or compact preview.
 * The caller escapes it if inserting it into HTML. The label is never a key.
 */
export function favoriteSummary(raw){
  const p=normalizeFavoriteParams(raw),mode=connectionMode(p);
  const connection={'on-open':'外貼開孔','in-open':'開孔內插','on-closed':'封閉外焊'}[mode];
  const material=p.hostType==='cone'?`大小管 ${sizeLabel(p.mainOD)}→${sizeLabel(p.mainEndOD)}`:
    p.hostType==='elbow'?`彎頭${fmt(p.bendAngle)}° ${sizeLabel(p.mainOD)}`:`直管 ${sizeLabel(p.mainOD)}`;
  let location;
  if(p.hostType==='elbow')location=p.elbowAlignment==='free'?`A起${fmt(p.bendPosition)}°／側${fmt(p.surfaceClock)}°`:
    p.elbowAlignment.endsWith('-axis')?`${p.elbowAlignment.startsWith('b-')?'B':'A'}端同軸`:elbowAlignmentLabel(p);
  else if(p.hostType==='cone')location=`A起X${fmt(p.jointPosition)}／側${fmt(p.surfaceClock)}°`;
  else {
    const d=mainAxisSurfaceDatum(p);
    location=d?`基準端X${fmt(d.axialPosition)}／側${fmt(d.clockAngle)}°`:`中心面X${fmt(p.jointPosition)}`;
  }
  const shape={circle:'圓形',ellipse:'橢圓',obround:'長圓',rounded:'圓角'}[p.padShape]??p.padShape;
  const pad=p.padEnabled?`${p.hostType==='elbow'?'成形':''}補強${shape}${p.padSplit==='single'?'單片':'雙片'}t${fmt(p.padThickness)}`:'無補強板';
  return `${material}／支管${sizeLabel(p.branchOD)} · ${connection} · 壁${fmt(p.mainWall)}/${fmt(p.branchWall)}mm · ${location} · ${fmt(p.angle)}° · ${pad}`;
}
