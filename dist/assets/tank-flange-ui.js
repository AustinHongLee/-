import {FLANGE_SIZES,FLANGE_CLASSES,FLANGE_FACES,flangeReference,applyFlangeReference,flangeDescription,flangeProvenance,flangeIcon} from './tank-flanges.js';
import {flangeMeasurementSketch} from './tank-nozzle-visuals.js';
import {fmt} from './tank-visuals.js';
export class TankFlangeUI{
  constructor({form,current,onChange}){
    this.form=form;this.current=current;this.onChange=onChange;
    const fields=key=>form.querySelector(`[data-nozzle-field="${key}"]`);
    fields('flangeSize').innerHTML='<option value="">選 NPS 尺寸</option>'+FLANGE_SIZES.map(size=>`<option value="${size}">NPS ${size}″</option>`).join('');
    fields('flangeClass').innerHTML='<option value="">選 Class 等級</option>'+FLANGE_CLASSES.map(c=>`<option value="${c}">Class ${c}</option>`).join('');
    fields('flangeFacing').innerHTML='<option value="">選密封面</option>'+Object.entries(FLANGE_FACES).map(([v,label])=>`<option value="${v}">${label}</option>`).join('');
    for(const button of form.querySelectorAll('[data-flange-end]'))button.querySelector('[data-flange-icon]').innerHTML=flangeIcon(button.dataset.flangeEnd);
    form.addEventListener('click',event=>{
      const target=event.target.closest('[data-flange-end],[data-flange-apply],[data-flange-field]'),n=this.current();if(!target||!n)return;
      if(target.dataset.flangeField){this.focus(target.dataset.flangeField);return;}
      if(target.dataset.flangeEnd){n.end=target.dataset.flangeEnd;if(n.flangeSource==='texas-v1'){const applied=applyFlangeReference(n);if(applied)Object.assign(n,applied);}}
      else {const applied=applyFlangeReference(n);if(!applied)return;Object.assign(n,applied);}
      this.onChange();
    });
    form.addEventListener('keydown',event=>{const target=event.target.closest('svg [data-flange-field]');if(target&&['Enter',' '].includes(event.key)){event.preventDefault();this.focus(target.dataset.flangeField);}});
  }
  focus(key){const field=this.form.querySelector(`[data-nozzle-field="${key}"]`);if(!field||field.closest('[hidden]')){if(!field)return;for(let el=field.parentElement;el;el=el.parentElement)if(el.tagName==='DETAILS')el.open=true;}for(let el=field.parentElement;el;el=el.parentElement)if(el.tagName==='DETAILS')el.open=true;field.focus({preventScroll:true});field.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});field.select?.();}
  edit(key,n){if(['flangeOD','flangeLength','flangeThickness'].includes(key))n.flangeSource='manual';}
  render(n){
    if(!n)return;const $=id=>document.getElementById(id),bare=n.end==='bare',wn=n.end==='wn',ref=flangeReference(n),complete=n.flangeSize&&n.flangeClass&&n.flangeFacing;
    for(const b of this.form.querySelectorAll('[data-flange-end]'))b.setAttribute('aria-pressed',String(b.dataset.flangeEnd===n.end));
    $('tank-nozzle-flange-fields').hidden=bare;$('tank-nozzle-weld-gap-field').hidden=!wn;$('tank-flange-so-field').hidden=n.end!=='so';
    $('tank-flange-length-label').textContent=wn?'L 對焊端 → 密封面 mm':'L 法蘭後端 → 密封面 mm';
    $('tank-flange-length-help').textContent=wn?'含凸面高度；此長度會從直管扣除。':'外形總長，管子穿過法蘭，不從管長扣 L。';
    const shortcuts=[['projection','A 外伸',n.projection],...(!bare?[['flangeLength','L 法蘭總長',n.flangeLength],['flangeOD','D 法蘭外徑',n.flangeOD],wn?['weldGap','g 對焊間隙',n.weldGap]:['soSetback','s 管端退縮',n.soSetback]]:[])];
    $('tank-flange-diagram').innerHTML=flangeMeasurementSketch(n,{interactive:true})+`<div class="tank-flange-shortcuts">${shortcuts.map(([key,label,value])=>`<button type="button" data-flange-field="${key}">${label}<strong>${fmt(value,2)} mm ✎</strong></button>`).join('')}</div>`;
    $('tank-flange-current').textContent=flangeDescription(n)+' · '+flangeProvenance(n);
    $('tank-flange-apply').disabled=!ref;
    $('tank-flange-reference').innerHTML=ref?`<strong>參考外徑 ${fmt(ref.flangeOD,2)} · 盤厚 ${fmt(ref.flangeThickness,2)} · 占長 ${fmt(ref.flangeLength,2)} mm</strong><p>英寸表換算，已包含圖示 RF 凸高 ${fmt(ref.rfHeight,4)} mm。<a href="${ref.source}" target="_blank" rel="noopener">Texas Flange 尺寸來源 ↗</a></p><p>套用會更新上述三項尺寸，單重改為待填；管嘴外徑與管厚保留。</p>`:`<p>${complete?'所選規格尚未收錄參考尺寸，請依實物／供應商圖說填寫。':'先選 NPS、Class 與密封面。'} 已收錄 Class 150／300、NPS ½／¾／1／1½／2／3／4／6 的 WN／SO、RF 參考尺寸。</p>`;
    const deduction=wn?Number(n.flangeLength)+Number(n.weldGap):n.end==='so'?Number(n.soSetback):0;
    $('tank-flange-effect').innerHTML=`<strong>${bare?'裸管端，外伸量到管端':wn?'直管扣：法蘭占長 L ＋對焊間隙 g':'直管只扣：管端退縮 s'}</strong><p>${bare?'無法蘭占長。':wn?`${fmt(n.flangeLength,2)} ＋ ${fmt(n.weldGap,2)} = ${fmt(deduction,2)} mm`:`${fmt(deduction,2)} mm；法蘭總長 L 不扣除。`} 筒壁曲率與下料留料見管料結果。</p>`;
  }
}
