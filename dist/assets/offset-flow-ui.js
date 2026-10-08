// "介質與流體影響" panel inside the route comparison: medium inputs, one quiet status line, what to watch for,
// a true-scale weld section, and the owner sheet button. Optional: with no medium chosen nothing else changes.
import {esc,fmt} from './offset-exports.js';
import {MEDIUM_KINDS,PIPE_MATERIALS,REGIME_NAMES,normalizeMedium,analyzeMedium,mediumSummary,routeFlow,planFlowLine,suggestedFlow,standardWall,beadLimit,isLiquid} from './offset-flow.js';
import {weldSectionSVG} from './offset-flow-visuals.js';

let medium=normalizeMedium(null),od=NaN,ctx=analyzeMedium(medium,od),root=null,hooks={},owner={ready:false,hint:''},baseCache=null,baseFor=null;
const $=id=>root?.querySelector('#'+id);
const pipeLength=m=>m>=1?`${fmt(m,2)} m`:`${fmt(m*100,m<0.1?1:0)} cm`;
const numberField=(key,label,placeholder='')=>`<div class="field"><label for="flow-${key}">${esc(label)}</label><input id="flow-${key}" data-medium="${key}" type="number" min="0" step="any" inputmode="decimal" value="${medium[key]??''}" placeholder="${esc(placeholder)}"></div>`;
const selectField=(key,label,options)=>`<div class="field"><label for="flow-${key}">${esc(label)}</label><select id="flow-${key}" data-medium="${key}">${options.map(([v,t])=>`<option value="${v}"${medium[key]===v?' selected':''}>${esc(t)}</option>`).join('')}</select></div>`;

function bodyHTML(){
  const kinds=`<div class="flow-kinds" role="group" aria-label="介質">${Object.entries(MEDIUM_KINDS).map(([k,v])=>`<button type="button" data-medium-kind="${k}" aria-pressed="${medium.kind===k}">${esc(v.label)}</button>`).join('')}</div>`;
  if(medium.kind==='none')return kinds+'<p class="offset-help">選介質後，每個接法多一行流體影響，並可產生給業主的比較單。不選則不影響接法比較。</p>';
  const liquid=isLiquid(medium.kind);
  const fields=(liquid?numberField('flow','流量 m³/h')+numberField('density','密度 kg/m³')+numberField('viscosity','黏度 mPa·s（cP）'):numberField('pellet','粒徑 mm'))
    +numberField('wall','管壁厚 mm')+(liquid?selectField('material','管材',Object.entries(PIPE_MATERIALS).map(([k,v])=>[k,v.label])):'')
    +numberField('bead','焊道內凸 mm')+selectField('finish','焊道內面',[['as-welded','原焊'],['ground','內面平順']]);
  return `${kinds}<div class="fields-grid">${fields}</div><div id="flow-status" class="flow-status" role="status"></div><div id="flow-section" class="flow-section"></div><p class="flow-swipe">← 左右滑動看完整剖面 →</p><div class="flow-owner"><button type="button" class="button primary" id="flow-owner-sheet">產生業主比較單</button><small id="flow-owner-hint"></small></div>`;
}
function refresh(){
  ctx=analyzeMedium(medium,od);baseCache=null;baseFor=null;
  if(!root)return;
  root.querySelector('#offset-flow-summary').textContent=mediumSummary(ctx);
  if(medium.kind==='none')return;
  const std=standardWall(od),wallInput=$('flow-wall'),beadInput=$('flow-bead'),limit=beadLimit(medium.wall??std??NaN);
  if(wallInput)wallInput.placeholder=std?`${fmt(std,2)}（STD）`:'非標準管：必填';
  if(beadInput)beadInput.placeholder=Number.isFinite(limit)?`${fmt(limit,1)}（上限）`:'';
  const status=$('flow-status');
  if(!ctx.valid){status.innerHTML=ctx.errors.map(e=>`<p class="flow-warn">${esc(e.message)}</p>`).join('');$('flow-section').innerHTML='';}
  else{
    const line=ctx.liquid?`內徑 ${fmt(ctx.idMm,2)} mm · 流速 ${fmt(ctx.velocity,2)} m/s · Re ${Math.round(ctx.Re).toLocaleString('en-US')}（${REGIME_NAMES[ctx.regime]}）· 一道焊口 ≈ ${pipeLength(ctx.asWeldedLength)} 直管${ctx.exposedBead>0?'':'（磨平後為 0）'}`
      :`內徑 ${fmt(ctx.idMm,2)} mm · 焊道 ${fmt(ctx.bead,2)} mm＝粒徑的 ${fmt(ctx.pelletRatio*100,0)}%${ctx.exposedBead>0?'':'（已磨平）'}`;
    status.innerHTML=`<p>${esc(line)}</p>`+ctx.warnings.map(w=>`<p class="${w.level==='warn'?'flow-warn':'flow-note'}">${esc(w.message)}</p>`).join('');
    $('flow-section').innerHTML=weldSectionSVG(ctx);
  }
  const button=$('flow-owner-sheet'),hint=$('flow-owner-hint');
  button.disabled=!ctx.valid||!owner.ready;hint.textContent=!ctx.valid?'先補齊上方資料。':owner.ready?'並列原接法與已選接法，可列印或存 PDF。':owner.hint;
}
function rebuild(){if(!root)return;root.querySelector('#offset-flow-body').innerHTML=bodyHTML();refresh();}
function changed(){refresh();hooks.onChange?.();}

export function initFlowPanel(element,{onChange,onOwnerSheet}={}){
  root=element;hooks={onChange,onOwnerSheet};rebuild();
  root.addEventListener('click',event=>{
    const kind=event.target.closest('[data-medium-kind]')?.dataset.mediumKind;
    if(kind){
      if(kind===medium.kind)return;
      const preset=MEDIUM_KINDS[kind];medium={...medium,kind};
      if(preset.density){medium.density=preset.density;medium.viscosity=preset.viscosity;medium.flow=suggestedFlow(kind,od-2*(medium.wall??standardWall(od)??NaN));}
      rebuild();hooks.onChange?.();return;
    }
    if(event.target.closest('#flow-owner-sheet'))hooks.onOwnerSheet?.();
  });
  root.addEventListener('input',event=>{
    const key=event.target.dataset?.medium;if(!key)return;
    const value=event.target.value;medium={...medium,[key]:event.target.tagName==='SELECT'?value:value.trim()===''?null:Number(value)};
    changed();
  });
}
export function setFlowOd(value){if(value===od)return;od=value;refresh();}
export function getMedium(){return {...medium};}
export function setMedium(value){medium=normalizeMedium(value);rebuild();}
export function flowContext(){return ctx;}
/** Whether the owner sheet can be made now, and what to tell the user if not. */
export function setOwnerSheetState(ready,hint=''){owner={ready,hint};if(root&&medium.kind!=='none')refresh();}
/** One quiet line for a route card; the original route is the comparison base. */
export function flowCardLine(plan,baseline){
  if(!ctx?.valid||!plan?.valid)return '';
  const flow=routeFlow(plan,ctx);if(!flow)return '';
  if(plan.original)return planFlowLine(flow,flow,ctx);
  const usable=baseline?.valid&&!baseline.legacy;
  if(usable&&baseFor!==baseline){baseCache=routeFlow(baseline,ctx);baseFor=baseline;}
  return planFlowLine(flow,usable?baseCache:null,ctx);
}
export const flowMediumKind=()=>medium.kind;
