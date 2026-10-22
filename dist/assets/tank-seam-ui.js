import {suggestShellSeamStart,criticalSeamHits} from './tank-seam-clearance.js';
import {esc,fmt} from './tank-visuals.js';
import {endSeamHits} from './tank-nozzles.js';
import {SEAM_CLEARANCE_DEFAULT,SEAM_CLEARANCE_FIELDS,seamClearanceSettings,seamClearancePending} from './tank-seam-settings.js';

export function seamAvoidanceMarkup(r,suggestion){
  const nozzles=r.nozzlePlan.items.filter(n=>n.host==='shell'),hits=nozzles.flatMap(n=>criticalSeamHits(n.seamCheck).map(h=>({...h,nozzle:n})));
  const settings=seamClearanceSettings(r),pending=seamClearancePending(r);
  const rings=hits.filter(h=>h.kind==='circumferential'),vertical=hits.filter(h=>h.kind==='longitudinal');
  const title=!settings.valid?'施工距離輸入有誤，請先修正下方尺寸':!r.nozzlePlan.valid?'管嘴尺寸待修正，避縫結果尚未完整':hits.length?`${new Set(hits.map(h=>h.nozzle.id)).size} 個管嘴的開孔／焊接／施工區需避讓`:nozzles.length?(pending.length?'依已填尺寸未見干涉，仍有施工尺寸待確認':'依已填尺寸，管嘴與補強板已滿足本案施工淨距'):'先定排縫；加入管嘴後會一起檢查';
  const list=hits.map(h=>`<li><button type="button" data-nozzle-select="${h.nozzle.id}">${esc(h.nozzle.mark||h.nozzle.id)}</button><span>${esc(h.label)}${h.reason==='geometry'?'跨到':h.reason==='weld'?'焊道碰到':'施工淨距不足：'}${h.kind==='longitudinal'?'縱縫':'環縫'} <b>${h.id}</b>${h.kind==='longitudinal'?` · ${h.a}／${h.b}`:''}${h.reason==='space'?` · 現有 ${fmt(h.actualClearance,1)}／需 ${fmt(h.required,1)} mm，差 ${fmt(h.shortfall,1)} mm`:''}</span></li>`).join('');
  const preview=suggestion?.blockedByEnd?.length?`<p class="tank-seam-explain">此候選起縫角會讓端部管嘴 ${suggestion.blockedByEnd.map(esc).join('、')} 碰到端板分片縫，先保留目前配置；請連同端部排縫核對。</p>`:suggestion?.improves?`<div class="tank-seam-suggestion"><div><strong>建議第 1 圈改從 ${fmt(suggestion.angle,2)}° 起縫</strong><p>筒身縱縫扣除焊道與已填施工淨距後，最小餘裕：${suggestion.currentClearance<0?'目前尚差 '+fmt(-suggestion.currentClearance,1)+' mm':fmt(suggestion.currentClearance,1)+' mm'} → ${fmt(suggestion.clearance,1)} mm</p></div><button type="button" data-seam-apply="${suggestion.angle}">套用起縫角 <span aria-hidden="true">→</span></button></div>`:vertical.length&&r.nozzlePlan.valid?'<p class="tank-seam-explain">單靠轉動起縫，無法同時滿足所有管嘴與補強板的焊道及施工距離；需再調分片方式，或依核定圖說處理。</p>':'';
  return `<div class="tank-seam-readback${hits.length?' has-conflict':''}" role="status"><strong>${title}</strong>${list?`<ul>${list}</ul>`:''}</div>${preview}${rings.length?'<p class="tank-seam-explain">環縫位置由分圈決定，轉起縫角不會移走環縫；請調整分圈／板高，或依核定圖說處理。</p>':''}`;
}

export class TankSeamUI{
  constructor({root,onChange,notify}){
    this.root=root;this.onChange=onChange;this.notify=notify;this.undo=null;this.result=null;this.data={...SEAM_CLEARANCE_DEFAULT};
    root.innerHTML='<div class="tank-seam-heading"><div><h4>開孔先避縫，再下料</h4><p>固定管嘴位置，調整筒身板片的圓周起點。</p></div><label>第 1 圈起縫角 °<input name="seamStart" aria-label="第 1 圈起縫角" type="number" min="0" max="360" step="any" inputmode="decimal" value="0"></label></div><div data-seam-readback></div><button type="button" data-seam-undo hidden>復原這次起縫調整</button>';
    root.insertAdjacentHTML('beforeend',`<details class="tank-seam-settings" open><summary>焊道與施工距離 <span data-seam-fill-status></span></summary><p>依圖說／WPS 與現場工具填寫，單位 mm；未確認留白，確認不需預留可填 0。</p><div class="tank-seam-fields">${Object.entries(SEAM_CLEARANCE_FIELDS).map(([k,label])=>`<label>${label} mm<input data-seam-field="${k}" type="number" min="0" max="10000" step="any" inputmode="decimal" placeholder="未確認"><small>${k.includes('Width')?'以中心線向兩側各一半；填內外側較大的焊道總寬':k==='workDistance'?'由兩側焊趾量起，留給焊接、打磨與檢驗操作':'由開孔／板片外緣，量至這側焊道最外焊趾'}</small></label>`).join('')}</div><div data-seam-setting-errors role="alert" hidden></div><p class="tank-seam-measure-rule">避讓＝管嘴／補強板焊道外伸 ＋ 施工淨距 ＋ 筒身焊道半寬；根隙不重複加。</p><details class="tank-seam-scope"><summary>尺寸怎麼量／本次避讓範圍</summary><p>旋轉排縫會同步更新板片位置、2D／3D 與加工單；管嘴位置不移動。只比較筒身縱縫、圈間環縫、開孔及補強板的包絡，已填焊道寬度與施工淨距一起計入。焊道總寬以中心線向兩側各占一半；與根隙取較大者，不重複相加。施工淨距沿筒身外表面展開、由兩側焊趾量起。矩形包絡為保守示意；尺寸依現場圖說／WPS，不自動判定規範合格。</p></details></details>`);
    root.addEventListener('input',event=>{const key=event.target.dataset.seamField;if(key)this.data[key]=event.target.value.trim()===''?null:event.target.value;});
    this.input=root.querySelector('input');this.body=root.querySelector('[data-seam-readback]');this.undoButton=root.querySelector('[data-seam-undo]');
    this.undoButton.textContent='復原';this.undoButton.setAttribute('aria-label','復原這次起縫調整');root.querySelector('.tank-seam-heading').append(this.undoButton);
    root.addEventListener('click',event=>{
      const apply=event.target.closest('[data-seam-apply]'),undo=event.target.closest('[data-seam-undo]');
      if(apply&&this.suggestion?.improves){const angle=this.suggestion.angle;this.undo={from:Number(this.input.value),to:angle};this.input.value=angle;this.onChange();this.input.focus({preventScroll:true});this.notify(`已改為 ${fmt(angle,2)}° 起縫；管嘴位置保留，板片、焊道與加工單已重算。`);}
      else if(undo&&this.undo){this.input.value=this.undo.from;this.undo=null;this.onChange();this.input.focus({preventScroll:true});this.notify('已復原起縫角。');}
    });
  }
  values(){return {...this.data};}
  apply(data){this.data={...SEAM_CLEARANCE_DEFAULT,...data};for(const el of this.root.querySelectorAll('[data-seam-field]'))el.value=this.data[el.dataset.seamField]??'';this.root.querySelector('.tank-seam-settings').open=Object.values(this.data).some(v=>v===null);this.undo=null;}
  focus(field){const el=this.root.querySelector(`[data-seam-field="${field?.split('.').pop()}"]`)??this.root.querySelector('[data-seam-field]');this.root.querySelector('.tank-seam-settings').open=true;el.scrollIntoView({block:'center',behavior:'smooth'});el.focus({preventScroll:true});}
  render(r){
    if(this.result!==r){this.result=r;this.suggestion=seamLayoutSuggestion(r);}
    this.input.parentElement.firstChild.textContent=r.shellLayoutState?.custom?'整組旋轉基準 °':'第 1 圈起縫角 °';this.input.setAttribute('aria-label',r.shellLayoutState?.custom?'整組旋轉基準':'第 1 圈起縫角');this.body.innerHTML=seamAvoidanceMarkup(r,this.suggestion);
    const settings=seamClearanceSettings(r),pending=seamClearancePending(r),errors=this.root.querySelector('[data-seam-setting-errors]');errors.hidden=settings.valid;errors.innerHTML=settings.issues.map(i=>'<p>'+esc(i.message)+'</p>').join('');
    this.root.querySelector('[data-seam-fill-status]').textContent=!settings.valid?'尺寸待修正':pending.length?pending.length+' 項待確認':'本案適用尺寸已填';
    for(const el of this.root.querySelectorAll('[data-seam-field]'))el.setAttribute('aria-invalid',String(settings.issues.some(i=>i.field.endsWith('.'+el.dataset.seamField))));
    if(this.undo&&Number(r.input.seamStart)!==this.undo.to)this.undo=null;
    this.undoButton.hidden=!this.undo;
  }
}

// Some fabricated ends share the existing starting-angle datum. Never propose
// resolving a shell crossing by silently creating a new end-opening crossing.
export function seamLayoutSuggestion(r){
  const suggestion=suggestShellSeamStart(r);if(!suggestion?.improves)return suggestion;
  const probe={...r,input:{...r.input,seamStart:suggestion.angle}},blockedByEnd=[];
  for(const n of r.nozzlePlan.items.filter(n=>n.host!=='shell')){
    const radius=Math.max(n.hole/2,n.padRadius),before=endSeamHits(r,n.host,n.surface[0],n.surface[2],radius),after=endSeamHits(probe,n.host,n.surface[0],n.surface[2],radius);
    if(after.some(hit=>!before.includes(hit)))blockedByEnd.push(n.mark||n.id);
  }
  return blockedByEnd.length?{...suggestion,improves:false,blockedByEnd}:suggestion;
}
