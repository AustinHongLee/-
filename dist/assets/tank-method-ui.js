// Fabrication-method panel: stage strip (overview) → component list (conclusions) → one detail (drawing, numbers, inputs).
import {METHOD_SPECS,methodDefaults,methodItemDefaults,fieldActive,methodContext} from './tank-method-config.js';
import {methodCatalog,stageSummary} from './tank-methods.js';
import * as V from './tank-method-visuals.js';
import {sheetSketch} from './tank-visuals.js';
import {cardVisual,cardTables} from './tank-method-report.js';
const esc=V.esc,fmt=V.fmt;
const clone=value=>JSON.parse(JSON.stringify(value));
const GLYPHS={shell:'<path d="M14 10h36v44H14z" fill="#cfe2ea" stroke="#416d82" stroke-width="2.4"/><path d="M14 32h36M32 10v22M24 32v22" stroke="#416d82" stroke-width="1.6"/>',flat:'<ellipse cx="32" cy="34" rx="22" ry="8" fill="#cfe2ea" stroke="#416d82" stroke-width="2.4"/>',cone:'<path d="M10 22h44L32 50z" fill="#cfe2ea" stroke="#416d82" stroke-width="2.4" stroke-linejoin="round"/>',dome:'<path d="M10 44Q32 6 54 44z" fill="#cfe2ea" stroke="#416d82" stroke-width="2.4"/><path d="M32 18v26M20 26l6 18M44 26l-6 18" stroke="#416d82" stroke-width="1.2"/>',elliptical:'<path d="M10 44Q10 18 32 18Q54 18 54 44z" fill="#cfe2ea" stroke="#416d82" stroke-width="2.4"/>',torispherical:'<path d="M10 44Q10 26 20 22Q32 16 44 22Q54 26 54 44z" fill="#cfe2ea" stroke="#416d82" stroke-width="2.4"/>',hemispherical:'<path d="M10 44A22 22 0 0 1 54 44z" fill="#cfe2ea" stroke="#416d82" stroke-width="2.4"/>',opening:'<rect x="10" y="14" width="44" height="36" fill="#cfe2ea" stroke="#416d82" stroke-width="2.4"/><circle cx="32" cy="32" r="11" fill="#efe0c4" stroke="#93652d" stroke-width="2.4"/><circle cx="32" cy="32" r="5" fill="#fff" stroke="#416d82" stroke-width="2"/>',support:'<rect x="16" y="8" width="32" height="30" rx="4" fill="#cfe2ea" stroke="#416d82" stroke-width="2.4"/><path d="M20 38v16M44 38v16M14 54h12M38 54h12" stroke="#416d82" stroke-width="2.6"/>',ring:'<rect x="18" y="8" width="28" height="48" fill="#cfe2ea" stroke="#416d82" stroke-width="2.4"/><path d="M12 24h40M12 40h40" stroke="#c88931" stroke-width="4"/>',ladder:'<path d="M22 6v52M42 6v52M22 14h20M22 24h20M22 34h20M22 44h20M22 54h20" stroke="#416d82" stroke-width="2.4"/>',jacket:'<rect x="18" y="8" width="28" height="48" fill="#cfe2ea" stroke="#416d82" stroke-width="2.4"/><path d="M18 16l28 8M18 28l28 8M18 40l28 8" stroke="#c88931" stroke-width="3"/>',baffle:'<circle cx="32" cy="32" r="22" fill="#cfe2ea" stroke="#416d82" stroke-width="2.4"/><path d="M32 12v8M32 44v8M12 32h8M44 32h8" stroke="#c88931" stroke-width="4"/>',lift:'<path d="M32 6v12M20 30l12-12 12 12" stroke="#416d82" stroke-width="2.4" fill="none"/><rect x="14" y="30" width="36" height="24" rx="3" fill="#cfe2ea" stroke="#416d82" stroke-width="2.4"/>',weld:'<path d="M10 40h44" stroke="#416d82" stroke-width="2.4"/><path d="M16 40c4-10 8-10 12 0s8 10 12 0 8-10 12 0" fill="none" stroke="#c88931" stroke-width="3"/>',inspect:'<circle cx="28" cy="28" r="14" fill="#cfe2ea" stroke="#416d82" stroke-width="2.4"/><path d="M38 38l14 14" stroke="#416d82" stroke-width="4"/>',paint:'<rect x="12" y="10" width="34" height="18" rx="4" fill="#cfe2ea" stroke="#416d82" stroke-width="2.4"/><path d="M46 19h6v12H32v8" fill="none" stroke="#416d82" stroke-width="2.4"/><rect x="28" y="39" width="8" height="16" rx="2" fill="#c88931"/>',level:'<rect x="16" y="8" width="32" height="48" rx="3" fill="#fff" stroke="#416d82" stroke-width="2.4"/><rect x="18" y="30" width="28" height="24" fill="#9fd0e2"/><path d="M52 30h6" stroke="#c88931" stroke-width="3"/>',lug:'<rect x="22" y="8" width="20" height="48" fill="#cfe2ea" stroke="#416d82" stroke-width="2.4"/><path d="M42 30h14v6H42zM42 30l14 0-14-12z" fill="#b5cfdd" stroke="#416d82" stroke-width="2"/><path d="M8 30h14v6H8zM22 30H8l14-12z" fill="#b5cfdd" stroke="#416d82" stroke-width="2"/>',skirt:'<rect x="18" y="6" width="28" height="30" rx="10" fill="#cfe2ea" stroke="#416d82" stroke-width="2.4"/><path d="M18 30v24h28V30" fill="#b5cfdd" stroke="#416d82" stroke-width="2.4"/><path d="M12 54h40" stroke="#416d82" stroke-width="3"/>',saddle:'<circle cx="32" cy="26" r="16" fill="#cfe2ea" stroke="#416d82" stroke-width="2.4"/><path d="M16 32q16 18 32 0v20H16z" fill="#b5cfdd" stroke="#416d82" stroke-width="2"/>',anchor:'<rect x="14" y="8" width="36" height="40" fill="#cfe2ea" stroke="#416d82" stroke-width="2.4"/><path d="M50 36h8v12h-8M8 36h6v12H8" fill="#b5cfdd" stroke="#416d82" stroke-width="2"/><path d="M6 54h52" stroke="#416d82" stroke-width="3"/>',fulljacket:'<rect x="14" y="8" width="36" height="48" rx="3" fill="#efe0c4" stroke="#93652d" stroke-width="2.4"/><rect x="20" y="4" width="24" height="56" fill="#cfe2ea" stroke="#416d82" stroke-width="2.4"/>',coil:'<rect x="14" y="6" width="36" height="52" fill="#fff" stroke="#416d82" stroke-width="2.4"/><path d="M20 16q12 6 24 0M20 28q12 6 24 0M20 40q12 6 24 0" fill="none" stroke="#c88931" stroke-width="3"/>',strips:'<circle cx="32" cy="32" r="24" fill="#cfe2ea" stroke="#416d82" stroke-width="2.4"/><path d="M10 22h44M8 32h48M10 42h44M26 8v14M40 22v10M22 32v10M36 42v14" stroke="#416d82" stroke-width="1.6"/>',annular:'<circle cx="32" cy="32" r="25" fill="#e2d4f0" stroke="#416d82" stroke-width="2.4"/><circle cx="32" cy="32" r="16" fill="#cfe2ea" stroke="#416d82" stroke-width="2"/><path d="M32 7v9M57 32h-9M32 57v-9M7 32h9" stroke="#416d82" stroke-width="1.6"/>',bottomup:'<path d="M10 56h44" stroke="#416d82" stroke-width="3"/><rect x="16" y="40" width="32" height="14" fill="#cfe2ea" stroke="#416d82" stroke-width="2"/><rect x="16" y="24" width="32" height="14" fill="#cfe2ea" stroke="#416d82" stroke-width="2" stroke-dasharray="3 2"/><path d="M32 6v14M26 12l6-6 6 6" fill="none" stroke="#c88931" stroke-width="2.4"/>',jacking:'<path d="M16 18l16-10 16 10z" fill="#cfe2ea" stroke="#416d82" stroke-width="2"/><rect x="16" y="18" width="32" height="14" fill="#cfe2ea" stroke="#416d82" stroke-width="2"/><rect x="16" y="36" width="32" height="14" fill="#fff" stroke="#416d82" stroke-width="2" stroke-dasharray="3 2"/><path d="M10 56h44M12 52V34M52 52V34" stroke="#c88931" stroke-width="3"/>',airlift:'<path d="M16 18l16-10 16 10z" fill="#cfe2ea" stroke="#416d82" stroke-width="2"/><rect x="16" y="18" width="32" height="14" fill="#cfe2ea" stroke="#416d82" stroke-width="2"/><path d="M10 56h44" stroke="#416d82" stroke-width="3"/><path d="M24 50v-12M32 50v-12M40 50v-12M21 41l3-3 3 3M29 41l3-3 3 3M37 41l3-3 3 3" fill="none" stroke="#4b8eaa" stroke-width="2"/>',ship:'<rect x="8" y="22" width="38" height="20" rx="3" fill="#cfe2ea" stroke="#416d82" stroke-width="2.4"/><path d="M46 28h8l4 8v6H46" fill="none" stroke="#416d82" stroke-width="2.4"/><circle cx="18" cy="46" r="4" fill="#416d82"/><circle cx="50" cy="46" r="4" fill="#416d82"/>',
  misc:'<rect x="8" y="10" width="30" height="22" rx="3" fill="#cfe2ea" stroke="#416d82" stroke-width="2.4"/><path d="M13 18h20M13 25h14" stroke="#416d82" stroke-width="1.6"/><rect x="44" y="12" width="12" height="22" rx="3" fill="#b5cfdd" stroke="#416d82" stroke-width="2"/><circle cx="50" cy="19" r="2.6" fill="#fff" stroke="#416d82"/><path d="M6 44H22V56H42V44H58" fill="none" stroke="#416d82" stroke-width="2.6"/><rect x="22" y="44" width="20" height="12" fill="#9fd0e2" fill-opacity=".6"/>',
  cut:'<rect x="6" y="38" width="52" height="14" fill="#cfe2ea" stroke="#416d82" stroke-width="2.4"/><path d="M30 38V52" stroke="#c0392b" stroke-width="2.4" stroke-dasharray="3 2"/><path d="M24 8h12l-2 20h-8z" fill="#b5cfdd" stroke="#416d82" stroke-width="2.2"/><path d="M30 28l-3 8h6z" fill="#c88931"/>',
  heat:'<path d="M8 52h48" stroke="#416d82" stroke-width="2.4"/><path d="M10 50L22 22H42L54 50" fill="none" stroke="#c0392b" stroke-width="3" stroke-linejoin="round"/><path d="M32 8c6 6 6 10 0 14c-6-4-6-8 0-14z" fill="#c88931"/>',
  furnace:'<rect x="6" y="14" width="52" height="38" rx="4" fill="#f6e2bd" stroke="#93652d" stroke-width="2.4"/><rect x="14" y="26" width="36" height="14" rx="7" fill="#cfe2ea" stroke="#416d82" stroke-width="2"/>',
  sections:'<rect x="4" y="14" width="34" height="38" rx="4" fill="#f6e2bd" stroke="#93652d" stroke-width="2.4"/><rect x="10" y="26" width="48" height="14" rx="7" fill="#cfe2ea" stroke="#416d82" stroke-width="2"/><path d="M30 22v22" stroke="#c88931" stroke-width="2.4" stroke-dasharray="3 2"/>',
  local:'<rect x="6" y="26" width="52" height="14" rx="7" fill="#cfe2ea" stroke="#416d82" stroke-width="2"/><rect x="24" y="20" width="16" height="26" fill="#f6e2bd" stroke="#c0392b" stroke-width="2"/><path d="M32 20v26" stroke="#c88931" stroke-width="2.4"/>'};
const glyph=name=>`<svg viewBox="0 0 64 64" aria-hidden="true">${GLYPHS[name]??GLYPHS.shell}</svg>`;
// Picture choices for the decisions that change what gets built.
const CHOICE_ICONS={'supports.type':{none:'flat',legs:'support',lugs:'lug',skirt:'skirt',saddles:'saddle',anchors:'anchor'},'jacket.type':{none:'shell',halfpipe:'jacket',full:'fulljacket',coil:'coil'},'layout.bottom':{single:'flat',strips:'strips',annular:'annular'},'layout.top':{single:'flat',strips:'strips'},'erection.method':{shop:'ship',bottomup:'bottomup',jacking:'jacking',airlift:'airlift'},'heat.method':{furnace:'furnace',sections:'sections',local:'local'}};
// Which layout fields belong to the bottom / top end card.
const LAYOUT_SCOPE={bottom:['bottom','joint','lap','gap','annularWidth','annularProjection','annularThickness','coneBottomBands','coneBottomSegments','hemiMethod','petalBands','petals','crownDiameter'],top:['top','joint','lap','gap','coneTopBands','coneTopSegments','hemiMethod','petalBands','petals','crownDiameter']};
function layoutRelevant(key,which,g,r){
  const type=r.endTypes[which],method=which==='bottom'?g.bottom:g.top;
  if(key==='bottom'||key==='top')return type==='flat'&&key===which;
  if(['joint','lap','gap'].includes(key))return type==='flat'&&method!=='single'&&(key==='joint'||key==='lap'&&g.joint==='lap'||key==='gap'&&g.joint==='butt');
  if(key.startsWith('annular'))return which==='bottom'&&type==='flat'&&g.bottom==='annular';
  if(key.startsWith('coneBottom'))return which==='bottom'&&type==='cone';
  if(key.startsWith('coneTop'))return which==='top'&&type==='cone';
  if(key==='hemiMethod')return type==='hemispherical';
  if(['petalBands','petals','crownDiameter'].includes(key))return type==='dome'||type==='hemispherical'&&g.hemiMethod==='petal';
  return true;
}
const ADD_DEFAULTS={supports:r=>({type:r.orientation==='horizontal'?'saddles':r.endTypes.bottom==='flat'?'anchors':'legs'}),access:r=>({ladder:true,platform:r.orientation==='vertical'}),jacket:()=>({type:'halfpipe'}),internals:()=>({baffles:true}),lifting:()=>({enabled:true}),misc:()=>({nameplate:true,grounding:2})};
export class TankMethodUI{
  constructor({form,onChange,openPanel}){
    this.form=form;this.onChange=onChange;this.openPanel=openPanel;this.state=methodDefaults();this.selected='shell';this.stage=null;this.fieldsKey='';this.result=null;this.padNozzle=null;
    form.addEventListener('click',event=>{
      const el=event.target.closest('[data-method-select],[data-method-stage],[data-method-add],[data-method-remove],[data-method-choice],[data-method-nozzle],[data-method-action],[data-method-off]');if(!el||!form.contains(el))return;
      if(el.dataset.methodSelect){this.select(el.dataset.methodSelect);return;}
      if(el.dataset.methodStage){this.stage=this.stage===el.dataset.methodStage?null:el.dataset.methodStage;this.render(this.result);return;}
      if(el.dataset.methodAdd){this.add(el.dataset.methodAdd);return;}
      if(el.dataset.methodRemove){const [group,index]=el.dataset.methodRemove.split('.');this.state[group].splice(Number(index),1);this.state[group].forEach((item,i)=>{item.id='R'+(i+1);});this.fieldsKey='';this.onChange();return;}
      if(el.dataset.methodOff){this.turnOff(el.dataset.methodOff);return;}
      if(el.dataset.methodChoice){this.setPath(el.dataset.methodChoice,el.dataset.value);this.fieldsKey='';this.onChange();return;}
      if(el.dataset.methodNozzle){this.padNozzle=el.dataset.methodNozzle;this.render(this.result);return;}
      if(el.dataset.methodAction){this.openPanel?.(el.dataset.methodAction);}
    });
  }
  values(){return clone(this.state);}
  apply(methods){const base=methodDefaults();if(methods&&typeof methods==='object')for(const [group,value] of Object.entries(methods)){if(!Object.hasOwn(base,group))continue;if(Array.isArray(base[group]))base[group]=Array.isArray(value)?clone(value):[];else if(value&&typeof value==='object')Object.assign(base[group],clone(value));}this.state=base;this.fieldsKey='';}
  setPath(path,value){const keys=path.split('.');let target=this.state;for(let i=0;i<keys.length-1;i++)target=target[keys[i]];const key=keys[keys.length-1],field=this.fieldOf(path);target[key]=field?.type==='bool'?value===true||value==='true':field?.type==='number'?value:String(value);}
  fieldOf(path){const [group,a,b]=path.split('.'),spec=METHOD_SPECS[group];if(!spec)return null;return spec.list?spec.item[b]:spec.fields[a];}
  edit(target){const path=target.dataset?.methodField;if(!path)return false;this.setPath(path,target.type==='checkbox'?target.checked:target.value);if(target.type==='checkbox'||target.tagName==='SELECT')this.fieldsKey='';return true;}
  set(path,value){this.setPath(path,value);this.fieldsKey='';this.onChange();}
  add(group){
    const r=this.result;if(!r?.valid)return;
    if(group==='rings'){if(this.state.rings.length>=12)return;const item=methodItemDefaults('rings'),first=!this.state.rings.length;item.purpose=first&&['open','cone','dome'].includes(r.endTypes.top)&&r.orientation==='vertical'?'curb':'stiffener';item.position=item.purpose==='curb'?0:Number((r.bodyHeight/2).toFixed(0));this.state.rings.push({id:'R'+(this.state.rings.length+1),...item});}
    else if(ADD_DEFAULTS[group])Object.assign(this.state[group],ADD_DEFAULTS[group](r));
    this.selected=group;this.fieldsKey='';this.onChange();
  }
  turnOff(group){const off={supports:{type:'none'},access:{ladder:false,stair:false,platform:false,roofRail:false},jacket:{type:'none'},internals:{baffles:false},lifting:{enabled:false},misc:{nameplate:false,grounding:0,sump:false}}[group];if(group==='rings')this.state.rings=[];else if(off)Object.assign(this.state[group],off);this.fieldsKey='';this.onChange();}
  select(id){this.selected=id;this.fieldsKey='';this.render(this.result);document.getElementById('tank-method-detail')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});}
  /** Focus a `methods.…` field path: open its card and input. */
  focus(path){
    const [,group]=path.split('.'),card=this.cards?.find(c=>c.groups?.includes(group)&&(group!=='layout'||LAYOUT_SCOPE[c.fieldScope]?.includes(path.split('.')[2])))??this.cards?.find(c=>c.groups?.includes(group));
    if(card)this.selected=card.id;this.fieldsKey='';this.render(this.result);
    const el=this.form.querySelector(`[data-method-field="${path.slice(8)}"],[data-method-choice="${path.slice(8)}"]`);el?.scrollIntoView({behavior:'smooth',block:'center'});el?.focus({preventScroll:true});
  }
  fieldMarkup(path,f,value){
    const help=f.help?`<small>${esc(f.help)}</small>`:'';
    if(f.type==='bool')return `<label class="tank-switch"><input type="checkbox" data-method-field="${path}" ${value?'checked':''}><span>${esc(f.label)}</span>${help}</label>`;
    if(f.type==='select'){const options=Object.entries(f.options),icons=CHOICE_ICONS[path.replace(/\.\d+\./,'.')];
      if(icons)return `<div class="tank-method-choice-field"><span>${esc(f.label)}</span><div class="tank-method-cards" role="group" aria-label="${esc(f.label)}">${options.map(([v,l])=>`<button type="button" data-method-choice="${path}" data-value="${esc(v)}" aria-pressed="${String(value)===v}">${icons[v]?glyph(icons[v]):''}<span>${esc(l)}</span></button>`).join('')}</div>${help}</div>`;
      if(options.length<=6)return `<div class="tank-method-choice-field"><span>${esc(f.label)}</span><div class="tank-method-choice" role="group" aria-label="${esc(f.label)}">${options.map(([v,l])=>`<button type="button" data-method-choice="${path}" data-value="${esc(v)}" aria-pressed="${String(value)===v}">${esc(l)}</button>`).join('')}</div>${help}</div>`;
      return `<label>${esc(f.label)}<select data-method-field="${path}">${options.map(([v,l])=>`<option value="${esc(v)}" ${String(value)===v?'selected':''}>${esc(l)}</option>`).join('')}</select>${help}</label>`;}
    if(f.type==='text')return `<label class="tank-nozzle-wide">${esc(f.label)}<input type="text" maxlength="${f.max}" data-method-field="${path}" value="${esc(value)}">${help}</label>`;
    return `<label>${esc(f.label)}<input type="number" step="any" inputmode="decimal" data-method-field="${path}" value="${esc(value)}">${help}</label>`;
  }
  fieldsFor(card,r){
    const ctx=methodContext(r),out=[];
    for(const group of card.groups??[]){
      const spec=METHOD_SPECS[group];
      if(spec.list){this.state[group].forEach((item,i)=>{const fields=Object.entries(spec.item).filter(([,f])=>fieldActive(f,item,ctx)).map(([key,f])=>this.fieldMarkup(`${group}.${i}.${key}`,f,item[key])).join('');out.push(`<fieldset class="tank-method-item"><legend>${esc(item.id)} · ${esc(spec.item.purpose.options[item.purpose]??'')}</legend><button type="button" class="tank-method-remove" data-method-remove="${group}.${i}">移除</button><div class="tank-fields">${fields}</div></fieldset>`);});
        out.push(`<button type="button" class="tank-secondary tank-method-additem" data-method-add="${group}">＋ 加一圈</button>`);continue;}
      const values=this.state[group],entries=Object.entries(spec.fields).filter(([key,f])=>fieldActive(f,values,ctx)&&(group!=='layout'||LAYOUT_SCOPE[card.fieldScope]?.includes(key)&&layoutRelevant(key,card.fieldScope,values,r)));
      // Keep the spec order (a switch is followed by its own numbers); consecutive numbers share a two-column grid.
      let grid=[];const flush=()=>{if(grid.length)out.push(`<div class="tank-fields">${grid.join('')}</div>`);grid=[];};
      for(const [key,f] of entries){const markup=this.fieldMarkup(`${group}.${key}`,f,values[key]);if(f.type==='select'||f.type==='bool'){flush();out.push(`<div class="tank-method-choices">${markup}</div>`);}else grid.push(markup);}
      flush();
    }
    return out.join('');
  }
  visualFor(card,r){
    if(card.visual==='pad'){const pads=r.attachments.pads.items,current=pads.find(x=>x.id===this.padNozzle)?.id??pads[0]?.id;const chips=pads.length>1?`<div class="tank-method-chips" role="group" aria-label="選擇補強板">${pads.map(x=>`<button type="button" data-method-nozzle="${x.id}" aria-pressed="${x.id===current}">${x.id}</button>`).join('')}</div>`:'';
      return (pads.length?chips:'<div class="tank-method-empty">尚未設定補強板：到「管嘴／法蘭」填補強板外徑。<button type="button" class="tank-secondary" data-method-action="nozzles">前往管嘴 →</button></div>')+cardVisual(card,r,{padNozzle:current});}
    return cardVisual(card,r);
  }
  /** Where the card's plate pieces sit on the purchased stock (first two sheets). */
  sheetsFor(card,r){
    if(!['bottom','top'].includes(card.id))return '';
    const ids=new Set(r.parts.filter(part=>part.ends?.includes(card.id)||!part.ends&&part.id.startsWith(card.id==='bottom'?'B':'T')).filter(part=>part.kind!=='formed').map(part=>part.id));
    const sheets=r.sheets.filter(sheet=>sheet.placements.some(item=>ids.has(item.part)));if(!sheets.length)return '';
    return `<div class="tank-method-sheets"><p class="tank-note">排在原板 #${sheets.slice(0,8).map(x=>x.id).join('、#')}${sheets.length>8?'…':''}（共 ${sheets.length} 張，含共用餘料）</p>${sheets.slice(0,2).map(sheet=>sheetSketch(sheet,r)).join('')}</div>`;
  }
  tablesFor(card,r){return cardTables(card,r);}
  render(r){
    this.result=r;const list=document.getElementById('tank-method-list');if(!list)return;
    const flow=document.getElementById('tank-method-flow'),detail=document.getElementById('tank-method-detail');
    if(!r?.valid){list.innerHTML='';flow.innerHTML='';detail.querySelector('#tank-method-head').innerHTML='<p class="tank-note">修正尺寸後，工法與圖面會出現。</p>';for(const id of ['tank-method-visual','tank-method-metrics','tank-method-warnings','tank-method-fields','tank-method-tables','tank-method-notes'])document.getElementById(id).innerHTML='';return;}
    if(!r.process&&!r.fabrication?.valid){/* attachment inputs need fixing: still show cards */}
    const cards=methodCatalog(r);this.cards=cards;if(!cards.some(c=>c.id===this.selected))this.selected='shell';
    const stages=stageSummary(r,cards);
    flow.innerHTML=stages.map((s,i)=>`<button type="button" data-method-stage="${s.id}" aria-pressed="${this.stage===s.id}"${s.issues?' data-alert="true"':''}><span>${i+1}</span><strong>${esc(s.label)}</strong><small>${esc(s.value)}</small>${s.issues?`<em>${s.issues}</em>`:''}</button>`).join('<i aria-hidden="true">›</i>');
    list.innerHTML=cards.map(c=>{const dim=this.stage&&!c.stages.includes(this.stage);return `<button type="button" class="tank-method-row" data-method-select="${c.id}" aria-pressed="${c.id===this.selected}" data-status="${c.status}"${dim?' data-dim="true"':''}>${glyph(c.glyph)}<span><strong>${esc(c.title)}</strong><small>${esc(c.summary)}</small></span>${c.status==='off'?'<b class="tank-method-plus">＋</b>':`<i class="tank-method-dot" aria-label="${{ok:'正常',warn:'需判斷',error:'需修正'}[c.status]}"></i>`}</button>`;}).join('');
    const card=cards.find(c=>c.id===this.selected);
    const statusLabel={ok:'',warn:'需你判斷',error:'需修正',off:'未加入'}[card.status];
    document.getElementById('tank-method-head').innerHTML=`<div><h3>${esc(card.title)}</h3><p>${esc(card.summary)}</p></div>${statusLabel?`<span class="tank-method-status" data-status="${card.status}">${statusLabel}</span>`:''}${card.optional&&card.active?`<button type="button" class="tank-secondary tank-method-off" data-method-off="${card.groups[0]}">移除</button>`:''}${card.optional&&!card.active&&card.id!=='supports'&&card.id!=='jacket'?`<button type="button" class="workbench-button" data-method-add="${card.groups[0]}">＋ 加入${esc(card.title)}</button>`:''}`;
    document.getElementById('tank-method-visual').innerHTML=card.optional&&!card.active?'':this.visualFor(card,r)+this.sheetsFor(card,r);
    document.getElementById('tank-method-metrics').innerHTML=(card.metrics??[]).map(m=>`<div${m.quiet?' class="quiet"':''}${m.alert?' data-alert="true"':''}><dt>${esc(m.label)}</dt><dd>${esc(m.value)}${m.unit?`<small>${esc(m.unit)}</small>`:''}</dd></div>`).join('');
    document.getElementById('tank-method-warnings').innerHTML=(card.warnings??[]).map(w=>`<p class="tank-method-warning" data-level="${w.level}">${esc(w.text)}${w.action==='splice'?' <button type="button" class="tank-secondary" data-method-choice="layout.'+(card.fieldScope==='top'?'top':'bottom')+'" data-value="strips">改用拼板</button>':w.action==='codes'?' <button type="button" class="tank-secondary" data-method-action="codes">填規範</button>':''}</p>`).join('');
    const key=JSON.stringify([card.id,card.groups,card.groups?.map(g=>JSON.stringify(this.state[g])),r.endTypes,r.orientation]);
    const fields=document.getElementById('tank-method-fields');
    // Keep the input elements while typing; rebuild only when the visible field set changes.
    const structure=JSON.stringify([card.id,card.groups,card.groups?.map(g=>{const spec=METHOD_SPECS[g];return spec.list?this.state[g].map(item=>Object.keys(spec.item).filter(k=>fieldActive(spec.item[k],item,methodContext(r)))):Object.keys(spec.fields).filter(k=>fieldActive(spec.fields[k],this.state[g],methodContext(r))&&(g!=='layout'||layoutRelevant(k,card.fieldScope,this.state[g],r)));}),card.groups?.map(g=>Object.entries(METHOD_SPECS[g].fields??{}).filter(([,f])=>f.type==='select'||f.type==='bool').map(([k])=>this.state[g][k]))]);
    if(structure!==this.fieldsKey){this.fieldsKey=structure;fields.innerHTML=this.fieldsFor(card,r);}
    void key;
    for(const el of this.form.querySelectorAll('[data-static-fields]'))el.hidden=el.dataset.staticFields!==card.staticFields;
    document.getElementById('tank-method-tables').innerHTML=this.tablesFor(card,r);
    document.getElementById('tank-method-notes').innerHTML=card.notes?.length?`<details class="tank-details"><summary>計算依據與注意事項</summary><ul>${card.notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul></details>`:'';
    for(const el of fields.querySelectorAll('[data-method-field]'))el.removeAttribute('aria-invalid');
    for(const issue of r.fabrication?.issues??[]){const el=fields.querySelector(`[data-method-field="${issue.field.slice(8)}"]`);el?.setAttribute('aria-invalid','true');}
  }
}
