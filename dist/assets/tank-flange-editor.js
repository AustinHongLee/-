import {FLANGE_SIZES,FLANGE_CLASSES,FLANGE_FACES,flangeDescription,flangeProvenance,flangeIcon} from './tank-flanges.js';
import {flangeMeasurementSketch} from './tank-nozzle-visuals.js';
import {flangeSizeForPipe,useNozzleFlangeReference,changeNozzleFlange,nozzleFlangeState,nozzleNumber} from './tank-flange-actions.js';
import {fmt,esc} from './tank-visuals.js';

export class TankFlangeUI{
  constructor({form,current,onChange}){
    this.form=form;this.current=current;this.onChange=onChange;this.modes=new Map();this.renderedId=null;
    const fields=key=>form.querySelector(`[data-nozzle-field="${key}"]`);
    fields('flangeSize').innerHTML='<option value="">選 NPS 尺寸</option>'+FLANGE_SIZES.map(size=>`<option value="${size}">NPS ${size}″</option>`).join('');
    fields('flangeClass').innerHTML='<option value="">選 Class 等級</option>'+FLANGE_CLASSES.map(c=>`<option value="${c}">Class ${c}</option>`).join('');
    fields('flangeFacing').innerHTML='<option value="">選接合面</option>'+Object.entries(FLANGE_FACES).map(([v,label])=>`<option value="${v}">${label}</option>`).join('');
    for(const button of form.querySelectorAll('[data-flange-end]'))button.querySelector('[data-flange-icon]').innerHTML=flangeIcon(button.dataset.flangeEnd);
    form.addEventListener('click',event=>{
      const button=event.target.closest('[data-flange-end],[data-flange-apply],[data-flange-field],[data-flange-mode],[data-flange-class],[data-flange-pipe],[data-flange-match-pipe]'),n=this.current();if(!button||!n)return;
      if(button.dataset.flangeField){this.focus(button.dataset.flangeField);return;}
      if(button.dataset.flangeMode){this.modes.set(n.id,button.dataset.flangeMode);if(button.dataset.flangeMode==='manual')n.flangeSource='manual';document.getElementById('tank-flange-dimensions').open=button.dataset.flangeMode==='manual';}
      else if(button.dataset.flangeEnd)Object.assign(n,changeNozzleFlange(n,'end',button.dataset.flangeEnd));
      else if(button.dataset.flangeClass)Object.assign(n,changeNozzleFlange(n,'flangeClass',button.dataset.flangeClass));
      else if(button.hasAttribute('data-flange-pipe')){const size=flangeSizeForPipe(n.od);if(!size)return;Object.assign(n,changeNozzleFlange(n,'flangeSize',size));}
      else if(button.hasAttribute('data-flange-match-pipe')){const pipe=nozzleFlangeState(n).pipe;if(!pipe)return;n.od=pipe.odMm;}
      else {const applied=useNozzleFlangeReference(n);if(!applied)return;Object.assign(n,applied);this.modes.set(n.id,'catalog');}
      this.onChange();
    });
    form.addEventListener('keydown',event=>{const target=event.target.closest('svg [data-flange-field]');if(target&&['Enter',' '].includes(event.key)){event.preventDefault();this.focus(target.dataset.flangeField);}});
  }
  focus(key){
    const field=this.form.querySelector(`[data-nozzle-field="${key}"]`);if(!field)return;
    this.form.dispatchEvent(new CustomEvent('tank-nozzle-reveal',{detail:{field:key}}));
    for(let parent=field.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
    field.focus({preventScroll:true});field.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});field.select?.();
  }
  edit(key,n){Object.assign(n,changeNozzleFlange(n,key,n[key]));}
  render(n){
    if(!n)return;const $=id=>document.getElementById(id),bare=n.end==='bare',wn=n.end==='wn',state=nozzleFlangeState(n),ref=state.reference;
    if(!this.modes.has(n.id))this.modes.set(n.id,n.flangeSource==='texas-v1'?'catalog':'manual');
    const integral=n.construction==='integral';if(integral)this.modes.set(n.id,'manual');const mode=this.modes.get(n.id),catalog=mode==='catalog';
    for(const b of this.form.querySelectorAll('[data-flange-end],[data-flange-mode="catalog"]'))b.disabled=integral;
    if(this.renderedId!==n.id){$('tank-flange-dimensions').open=!catalog;this.renderedId=n.id;}
    for(const b of this.form.querySelectorAll('[data-flange-end]'))b.setAttribute('aria-pressed',String(b.dataset.flangeEnd===n.end));
    for(const b of this.form.querySelectorAll('[data-flange-mode]'))b.setAttribute('aria-pressed',String(b.dataset.flangeMode===mode));
    for(const b of this.form.querySelectorAll('[data-flange-class]'))b.setAttribute('aria-pressed',String(b.dataset.flangeClass===n.flangeClass));
    $('tank-nozzle-flange-fields').hidden=bare;$('tank-nozzle-weld-gap-field').hidden=!wn||integral;$('tank-flange-so-field').hidden=n.end!=='so';
    $('tank-flange-catalog-controls').hidden=!catalog;$('tank-flange-manual-spec').hidden=catalog;
    const inline=this.form.querySelector('.tank-nozzle-grid')?.dataset.nozzleTask==='position',specification=$('tank-flange-specification'),container=$(inline?'tank-nozzle-quick-spec-fields':catalog?'tank-flange-catalog-controls':'tank-flange-manual-spec');if(specification.parentElement!==container){if(catalog&&!inline)container.prepend(specification);else container.append(specification);}
    $('tank-flange-dimensions-summary').textContent=`L ${fmt(nozzleNumber(n.flangeLength))} · D ${fmt(nozzleNumber(n.flangeOD))} mm`;
    $('tank-flange-spec-summary').textContent=[n.flangeFacing||'接合面待選',n.flangeMaterial||'材質待填'].join(' · ');
    $('tank-flange-length-label').textContent=wn?'L 對焊端 → 密封面 mm':'L 法蘭後端 → 密封面 mm';
    $('tank-flange-length-help').textContent=wn?'含凸面高度；此長度會從直管扣除。':'管子穿過法蘭，L 只作外形參考，不從管長扣。';
    const shortcuts=[['projection','A 外伸',n.projection],...(!bare?[['flangeLength','L 法蘭總長',n.flangeLength],['flangeOD','D 法蘭外徑',n.flangeOD],...(integral?[]:[wn?['weldGap','g 對焊間隙',n.weldGap]:['soSetback','s 管端退縮',n.soSetback]])]:[])];
    $('tank-flange-diagram').innerHTML=flangeMeasurementSketch(n,{interactive:true})+`<div class="tank-flange-shortcuts">${shortcuts.map(([key,label,value])=>`<button type="button" data-flange-field="${key}"><span>${label}</span><strong>${fmt(nozzleNumber(value),2)} mm <span aria-hidden="true">↗</span></strong></button>`).join('')}</div>`;
    $('tank-flange-current').textContent=state.stale?'規格已變更，原尺寸尚未更新':state.applied?'目前採用尺寸表 · '+flangeDescription({...n,flangeMaterial:'',flangeSpec:''}):'目前採用實測／圖說尺寸';
    $('tank-flange-current').dataset.state=state.stale?'stale':state.applied?'reference':'manual';
    $('tank-flange-provenance-detail').textContent=flangeProvenance(n);
    const pipeSize=flangeSizeForPipe(n.od),pipeButton=this.form.querySelector('[data-flange-pipe]');pipeButton.disabled=!pipeSize;pipeButton.textContent=pipeSize?'沿用管嘴 NPS '+pipeSize:'管嘴為自訂外徑';
    const mismatch=$('tank-flange-pipe-match');mismatch.hidden=!state.mismatch||bare;
    if(state.mismatch){mismatch.querySelector('p').textContent=`法蘭 NPS ${n.flangeSize} 對應管外徑 ${fmt(state.pipe.odMm)} mm；管嘴目前 ${fmt(Number(n.od))} mm。異徑接法需另核對。`;mismatch.querySelector('button').textContent=`管嘴也改為 ${fmt(state.pipe.odMm)} mm`;}
    $('tank-flange-apply').disabled=!ref||state.applied;$('tank-flange-apply').textContent=state.applied?'✓ 已帶入，切換規格即時更新':'使用這組參考尺寸';
    $('tank-flange-reference').dataset.state=state.applied?'applied':ref?'available':'missing';
    $('tank-flange-reference').innerHTML=ref?`<div class="tank-flange-reference-values"><span>總長 L<strong>${fmt(ref.flangeLength,2)}<small>mm</small></strong></span><span>外徑 D<strong>${fmt(ref.flangeOD,2)}<small>mm</small></strong></span><span>盤厚<strong>${fmt(ref.flangeThickness,2)}<small>mm</small></strong></span></div><p>${state.applied?'正在使用':'可帶入的參考尺寸'} · 含 RF 凸高 · <a href="${esc(ref.source)}" target="_blank" rel="noopener">尺寸來源 ↗</a></p>`:`<p>${!n.flangeSize||!n.flangeClass||!n.flangeFacing?'選 NPS、Class 與接合面，再帶入參考尺寸。':'此規格尚未收錄，請改用實測／圖說尺寸。'}</p><small>已收錄 Class 150／300、NPS ½～12 的常用 WN／SO、RF。</small>`;
    $('tank-flange-effect').innerHTML=`<strong>${bare?'裸管端，不扣法蘭長':wn?'直管扣除 '+fmt(state.deduction,2)+' mm':'直管只扣退縮 '+fmt(state.deduction,2)+' mm'}</strong><p>${bare?'A 外伸量到管端面。':wn?`L ${fmt(nozzleNumber(n.flangeLength),2)} ＋ g ${fmt(nozzleNumber(n.weldGap),2)}；已計入下方管料。`:'SO 的 L 不扣管長；退縮已計入下方管料。'}</p>`;
    if(integral){$('tank-flange-current').textContent='一體長頸接件 · 依圖說記錄';$('tank-flange-length-label').textContent='L 接件頸部總長 mm（示意外形）';$('tank-flange-length-help').textContent='不套用一般 WN 總長，也不從中反算直管下料。';$('tank-flange-effect').innerHTML='<strong>一體接件，不拆成短頸法蘭＋直管</strong><p>頸部、內管、轉接與焊接分界依詳圖；若要改為組焊接法，先到「備料細節」修改接件構成。</p>';}
  }
}
