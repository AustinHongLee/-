import {esc,fmt} from './offset-exports.js';
import {COMPONENT_NAMES,validateComponents} from './offset-components.js';
import {componentIcon,componentFabricationSVG} from './offset-component-ui.js';
import {componentLocations,componentPlacementPreview} from './offset-component-placement.js';
import {defaultComponentFlange,componentFlangeReference,flangePairLength,FLANGE_SIZES,FLANGE_CLASSES,FLANGE_FACES} from './offset-component-presets.js';

// Keep form controls mounted while typing. Only the diagrams and summary change.
export function mountComponentEditor(dialog,{current,onApply,onMessage=()=>{}}){
  const $=id=>dialog.querySelector('#component-'+id),form=$('form');
  let draft=null,context=null,locations=[],profiles={},manualLength=null;
  const keys=['length','name','leftConnection','rightConnection','leftGap','rightGap','placement','distance','internalBolts'];
  const numeric=new Set(['length','leftGap','rightGap','distance','internalBolts']);
  const num=input=>input.value.trim()===''?null:Number(input.value);
  $('kind-options').innerHTML=Object.entries(COMPONENT_NAMES).map(([kind,label])=>`<button type="button" data-component-kind="${kind}" aria-pressed="false">${componentIcon(kind)}<span>${label}</span></button>`).join('');
  for(const [id,values] of [['flange-size',FLANGE_SIZES],['flange-class',FLANGE_CLASSES],['flange-facing',Object.keys(FLANGE_FACES)]]){
    $(id).innerHTML='<option value="">'+(id==='flange-size'?'選管徑':'未指定')+'</option>'+values.map(value=>`<option value="${value}">${id==='flange-size'?'NPS ':id==='flange-class'?'Class ':''}${esc(id==='flange-facing'?FLANGE_FACES[value]:value)}</option>`).join('');
  }
  function populate(){
    for(const key of keys)$(key).value=draft[key]??'';
    if(draft.flange){const f=draft.flange;for(const [id,key] of [['flange-size','size'],['flange-class','pressureClass'],['flange-facing','facing'],['flange-end','end'],['gasket','gasket']])$(id).value=f[key]??'';}
  }
  function read(){
    for(const key of keys)draft[key]=numeric.has(key)?num($(key)):$(key).value;
    if(draft.placement==='center'||['a','b'].includes(draft.target))draft.distance=0;
    if(draft.kind==='flangePair'){
      const f=draft.flange;for(const [id,key] of [['flange-size','size'],['flange-class','pressureClass'],['flange-facing','facing'],['flange-end','end']])f[key]=$(id).value;
      f.gasket=num($('gasket'));
      if(f.mode==='reference')draft.length=flangePairLength(f);
      else manualLength=draft.length;
    }
  }
  function renderLocations(){
    locations=componentLocations(context.plan,context.params.components,draft.id);
    const button=l=>`<button type="button" data-component-target="${l.target}" aria-pressed="${l.target===draft.target}"${l.occupied?' disabled':''}><strong>${esc(l.label.replace('第 ','').replace(' 段中間直線',' 段直管'))}</strong><small>${esc(l.occupied?'已有 '+l.occupied:l.pipe?l.pipe+' · '+fmt(l.span)+' mm':'需換接法')}</small></button>`;
    const primary=locations.filter(l=>['a','b',draft.target].includes(l.target)||l.pipe||l.occupied),other=locations.filter(l=>!primary.includes(l));
    $('targets').innerHTML=`<div class="component-target-grid">${primary.map(button).join('')}</div>${other.length?`<details class="component-other-locations"><summary>其他位置 · 需換接法</summary><div class="component-target-grid">${other.map(button).join('')}</div></details>`:''}`;
    const count=context.plan?.elbows.length??2,visible=locations.filter(l=>['a','b'].includes(l.target)||Number(l.target.slice(1))<count),step=520/(visible.length-1);
    $('route-map').innerHTML=`<svg viewBox="0 0 600 90" role="img" aria-label="沿 A 到 B 的位置示意，非比例圖"><path d="M40 37H560" fill="none" stroke="#b8cdca" stroke-width="9"/>${visible.map((l,i)=>`<g data-component-target="${l.target}"><circle cx="${40+i*step}" cy="37" r="${l.target===draft.target?17:12}" fill="${l.target===draft.target?'#257970':'#fff'}" stroke="#257970" stroke-width="2"/><text x="${40+i*step}" y="77" text-anchor="middle" font-size="15" fill="#365b60">${l.target==='a'?'A 口':l.target==='b'?'B 口':esc(l.pipe??'直管 '+l.target.slice(1))}</text></g>${i<visible.length-1?`<path d="M${40+(i+.5)*step-9} 30v14h18" fill="none" stroke="#7f9c98" stroke-width="4"/>`:''}`).join('')}</svg>`;
    const location=locations.find(l=>l.target===draft.target);
    $('location-note').textContent=location?.occupied?'此位置已有其他零件，請選另一處。':location?.span!==null?'圖上沿 A → B 展開；長度已含此位置可替換的端部間隙。':location.note+'；套用後會重新比較接法。';
  }
  function render(){
    $('editor-title').textContent=(context.editing?'修改 '+draft.id:'加入 '+draft.id)+' · '+(draft.name||COMPONENT_NAMES[draft.kind]);
    const flange=draft.kind==='flangePair',reference=flange&&draft.flange.mode==='reference',ref=flange?componentFlangeReference(draft.flange):null;
    dialog.querySelectorAll('[data-component-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.componentKind===draft.kind)));
    dialog.querySelectorAll('[data-component-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.componentMode===draft.flange?.mode)));
    dialog.querySelectorAll('[data-component-class]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.componentClass===draft.flange?.pressureClass)));
    $('flange-fields').hidden=!flange;$('gasket-field').hidden=!reference;$('length').readOnly=reference;
    $('length-label').textContent=reference?'法蘭組計算總長 mm':'實測組立總長 mm';
    if(reference)$('length').value=draft.length??'';
    const supported=ref&&draft.flange.end==='wn';
    dialog.querySelector('[data-component-mode="reference"]').disabled=!supported;
    $('flange-reference-note').textContent=!flange?'':!supported?(draft.flange.end==='so'?'SO 管子會穿入法蘭，請用整組接管端面實測總長；不能直接扣兩片法蘭長度。':'此管徑／Class／接面尚未收錄計長尺寸，請改用實測總長。'):reference?`兩支 WN（每支 ${fmt(ref.flangeLength,4)} mm，含 RF）＋一片壓緊墊片。`:'保留實測總長；所選規格作材料標記。';
    $('flange-reference-link').hidden=!ref;if(ref)$('flange-reference-link').href=ref.source;
    for(const key of ['leftConnection','rightConnection','internalBolts'])$(key).disabled=reference;
    const atPort=['a','b'].includes(draft.target);$('position-fields').hidden=atPort;$('distance-field').hidden=draft.placement==='center';$('distance-label').textContent=(draft.placement==='fromB'?'B':'A')+' 側成品直管長 mm';
    $('sketch').innerHTML=componentFabricationSVG({...draft,type:'component'});
    const used=[draft.length,draft.leftGap,draft.rightGap].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0)?draft.length+draft.leftGap+draft.rightGap:null;
    $('consumption').textContent=used===null?'總佔長待填':`佔用 ${fmt(used)} mm`;
    $('connection-summary').textContent=`A 側${draft.leftConnection==='weld'?'焊接':'螺栓'} ${fmt(draft.leftGap)} · B 側${draft.rightConnection==='weld'?'焊接':'螺栓'} ${fmt(draft.rightGap)} mm`;
    const preview=componentPlacementPreview(context.plan,context.params.components,draft,context.minimum,context.params.od);
    $('fit-preview').dataset.state=preview.state;$('fit-title').textContent=preview.state==='fit'?'目前接法放得下':preview.state==='search'?'需要比較其他接法':'尺寸預覽';
    $('fit-detail').textContent=preview.state==='fit'?`${preview.pipes.map(p=>p.id+' 剩 '+fmt(p.length)+' mm').join(' · ')}；全組 ${preview.welds} 焊口、${preview.bolts} 處螺栓接合。`:preview.message;
    $('submit').textContent=preview.state==='search'?'套用並找接法':'套用，重算管長';
  }
  function clearError(){ $('form-error').hidden=true;dialog.querySelectorAll('[aria-invalid=true]').forEach(input=>input.removeAttribute('aria-invalid')); }
  function showError(message,id){$('form-error').hidden=false;$('form-error').textContent=message;const input=$(id);input.setAttribute('aria-invalid','true');let p=input.parentElement;while(p!==dialog){if(p.tagName==='DETAILS')p.open=true;p=p.parentElement;}input.focus();input.scrollIntoView({block:'nearest'});}
  function invalidField(){
    const f=draft.flange;
    if(f?.mode==='reference'){
      if(!componentFlangeReference(f)||f.end!=='wn')return 'flange-size';
      if(f.gasket===null||f.gasket<0||f.gasket>100||!Number.isFinite(f.gasket))return 'gasket';
    }
    for(const key of ['length','leftGap','rightGap','distance','internalBolts']){const n=draft[key];if(n===null||!Number.isFinite(n)||n<0||n>1e6||key==='length'&&n===0||key==='internalBolts'&&(!Number.isInteger(n)||n>20))return key;}
    return 'length';
  }
  dialog.addEventListener('click',event=>{
    const kind=event.target.closest('[data-component-kind]'),target=event.target.closest('[data-component-target]'),mode=event.target.closest('[data-component-mode]'),pressureClass=event.target.closest('[data-component-class]');
    if(!kind&&!target&&!mode&&!pressureClass)return;read();clearError();
    if(kind&&kind.dataset.componentKind!==draft.kind){
      profiles[draft.kind]={draft:structuredClone(draft),manualLength};const next=kind.dataset.componentKind,saved=profiles[next];
      draft={...(saved?.draft??draft),kind:next,target:draft.target};
      if(!saved){draft.length=null;draft.name='';draft.internalBolts=next==='flangePair'?1:0;delete draft.flange;if(next==='flangePair')draft.flange=defaultComponentFlange(context.params.od);}
      if(next==='flangePair'&&draft.flange.mode==='reference'){draft.leftConnection='weld';draft.rightConnection='weld';draft.internalBolts=1;draft.length=flangePairLength(draft.flange);}
      manualLength=saved?.manualLength??null;populate();
    }else if(target){const location=locations.find(l=>l.target===target.dataset.componentTarget);if(location?.occupied)return;draft.target=target.dataset.componentTarget;$('distance').value=draft.distance;renderLocations();$('targets').querySelector(`[data-component-target="${draft.target}"]`).focus({preventScroll:true});}
    else if(mode){const next=mode.dataset.componentMode;if(draft.flange.mode!==next){if(next==='reference'){manualLength=draft.length;draft.leftConnection=draft.rightConnection='weld';draft.internalBolts=1;draft.length=flangePairLength(draft.flange);}else draft.length=manualLength;draft.flange.mode=next;populate();}}
    else if(pressureClass){draft.flange.pressureClass=pressureClass.dataset.componentClass;$('flange-class').value=draft.flange.pressureClass;if(draft.flange.mode==='reference')draft.length=flangePairLength(draft.flange);}
    render();
  });
  form.addEventListener('input',()=>{read();if(draft.flange?.mode==='reference'&&(!componentFlangeReference(draft.flange)||draft.flange.end!=='wn')){draft.flange.mode='measured';draft.length=manualLength;$('length').value=manualLength??'';}clearError();render();});
  form.addEventListener('submit',event=>{event.preventDefault();read();const next=[...context.params.components.filter(c=>c.id!==draft.id),structuredClone(draft)],errors=validateComponents(next,context.params.od);if(errors.length){showError(errors.join(' '),errors.some(e=>e.includes('OD 不同'))?'flange-size':invalidField());return;}onApply(next);});
  $('cancel').addEventListener('click',()=>dialog.close());
  $('remove').addEventListener('click',()=>onApply(context.params.components.filter(c=>c.id!==draft.id)));
  return {open(target=null,id=null){
    context=current();const {params,plan}=context;context.minimum=plan?.original?params.minStraight:Math.max(params.minStraight,params.planMinPipe);
    const existing=params.components.find(c=>c.id===id||!id&&c.target===target),locationsNow=componentLocations(plan,params.components,existing?.id),available=locationsNow.find(l=>!l.occupied&&l.pipe&&l.target.startsWith('s'))??locationsNow.find(l=>!l.occupied);context.editing=Boolean(existing);
    if(!existing&&!available){onMessage('各位置已有零件，點零件圖卡修改整組尺寸。');return;}
    const gap=params.planExtraGap??0;
    draft=existing?structuredClone(existing):{id:'C'+(Math.max(0,...params.components.map(c=>Number(c.id.slice(1))))+1),kind:'valve',name:'',target:target&&!locationsNow.find(l=>l.target===target)?.occupied?target:available.target,length:null,leftConnection:'weld',rightConnection:'weld',leftGap:gap,rightGap:gap,placement:'center',distance:0,internalBolts:0};
    if(draft.kind==='flangePair'&&!draft.flange)draft.flange={mode:'measured',size:'',pressureClass:'',facing:'',end:'',gasket:null};
    profiles={};manualLength=draft.flange?.mode==='measured'?draft.length:null;populate();clearError();renderLocations();render();
    $('remove').hidden=!existing;
    $('advanced').open=false;dialog.showModal();$('cancel').focus();$('editor-scroll').scrollTop=0;
    const errors=existing?validateComponents([draft],params.od):[];if(errors.length)showError(errors[0],errors.some(e=>e.includes('OD 不同'))?'flange-size':invalidField());
  }};
}
