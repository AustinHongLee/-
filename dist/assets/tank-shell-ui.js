import {SHELL_STEPS,SHELL_RECORD_FIELDS,normalizeShellRecords,shellConstructionPlan} from './tank-shell-plan.js';
import {shellStepSketch} from './tank-shell-visuals.js';
import {esc,fmt} from './tank-visuals.js';
import {SHELL_RECORD_LIMITS} from './tank-shell-records.js';

export class TankShellUI{
  constructor({root,onChange,onSelect,onPrint,onDrawing,onSettings,notify}){
    Object.assign(this,{root,onChange,onSelect,onPrint,onDrawing,onSettings,notify,step:'layout',view:'guide',zoom:false,active:false,explode:false,viewer:null,loading:null,data:normalizeShellRecords().data});
    root.innerHTML=`<header class="shell-heading"><div><span class="shell-eyebrow">SHELL FABRICATION</span><h2>筒身，一步一步做</h2><p>同一個板號，從平板一路對照到組立位置。</p></div><div class="shell-exports"><button type="button" data-shell-print class="shell-primary">列印筒身加工單</button><button type="button" data-shell-drawing>下載筒身圖 SVG</button></div></header>
      <nav class="shell-step-nav" aria-label="筒身施工工序">${SHELL_STEPS.map((s,i)=>`<button type="button" data-shell-step="${s.id}" aria-pressed="false"><span>${i+1}</span><strong>${s.title}<small>${s.hint}</small></strong></button>`).join('')}</nav>
      <p class="shell-invalid" hidden>請先回「槽型與尺寸」修正尺寸；施工圖將隨專案重新產生。</p>
      <div class="shell-live"><div class="shell-context"><label>目前板片<select data-shell-selection aria-label="施工板片"></select></label><p class="shell-piece-meta"></p><button type="button" data-shell-settings>調整施工參數</button></div>
      <div class="shell-alerts"></div><div class="shell-work-grid"><div class="shell-picture"><div class="shell-view-tabs" role="group" aria-label="施工輔助視圖"><button type="button" data-shell-view="guide" aria-pressed="true">這一步圖解</button><button type="button" data-shell-view="3d" aria-pressed="false">筒身 3D</button><button type="button" data-shell-zoom aria-pressed="false">放大圖解</button></div><div class="shell-diagram"></div><div class="shell-3d" hidden><div class="shell-webgl"></div><div class="shell-camera"><button type="button" data-shell-camera="iso">置中</button><button type="button" data-shell-camera="end">看端面</button><button type="button" data-shell-camera="in" aria-label="放大筒身 3D">＋</button><button type="button" data-shell-camera="out" aria-label="縮小筒身 3D">−</button><button type="button" data-shell-explode aria-pressed="false">分圈展開</button></div><p class="shell-3d-note"></p></div></div><article class="shell-instructions" aria-live="polite"></article></div>
      <details class="shell-records"><summary>施工依據 <span class="shell-record-state"></span></summary><p>這些欄位會存入專案及加工單。請記錄核定文件；填寫不代表審核通過。</p><div class="shell-record-grid">${Object.entries(SHELL_RECORD_FIELDS).map(([k,v])=>`<label>${esc(v)}${['project','drawing','wps'].includes(k)?`<input data-shell-record="${k}" maxlength="${SHELL_RECORD_LIMITS[k]}" placeholder="${k==='wps'?'例如 WPS-01 Rev.2':'待填'}">`:`<textarea data-shell-record="${k}" maxlength="500" rows="2" placeholder="記錄專案核定做法／文件編號"></textarea>`}</label>`).join('')}</div></details>
      <details class="shell-weld-details"><summary>板片與接縫對照 <span></span></summary><div class="shell-weld-table"></div></details>
      <p class="shell-scope">目前涵蓋筒身板段。封頭、管嘴與支承見原分件資料；完整製作圖仍需加入附件詳圖與審核。</p><details class="shell-sources"><summary>圖解參考</summary><p><a href="https://www.davi.com/en/products/plate-rolls" target="_blank" rel="noopener">DAVI 捲板與預彎</a> · <a href="https://www.twi-global.com/technical-knowledge/job-knowledge/distortion-control-prevention-by-fabrication-techniques-036" target="_blank" rel="noopener">TWI 點焊／變形控制</a>。概念說明，現場仍依機台手冊、圖說與核定 WPS。</p></details></div>`;
    this.$=s=>root.querySelector(s);
    root.addEventListener('input',event=>{const f=event.target.dataset.shellRecord;if(f){event.stopPropagation();this.data[f]=event.target.value;this.$('.shell-record-state').textContent='修改中，離開欄位後更新';}else if(event.target.matches('[data-shell-selection]'))event.stopPropagation();});
    root.addEventListener('change',event=>{if(event.target.dataset.shellRecord){event.stopPropagation();this.onChange();}else if(event.target.matches('[data-shell-selection]')){event.stopPropagation();this.onSelect(event.target.value);}});
    root.addEventListener('focusout',event=>{if(event.target.dataset.shellRecord&&JSON.stringify(this.values())!==JSON.stringify(this.result?.input.shellConstruction))this.onChange();});
    root.addEventListener('click',event=>{
      const b=event.target.closest('button,[data-shell-piece]');if(!b)return;
      if(b.dataset.shellStep){const next=b.closest('.shell-next');this.step=b.dataset.shellStep;this.render(this.result,this.selected);if(next)this.$('.shell-picture').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
      else if(b.hasAttribute('data-shell-zoom')){this.zoom=!this.zoom;this.render(this.result,this.selected);}
      else if(b.dataset.shellView){this.view=b.dataset.shellView;this.render(this.result,this.selected);}
      else if(b.dataset.shellPiece)this.onSelect(b.dataset.shellPiece);
      else if(b.hasAttribute('data-shell-print'))this.onPrint();
      else if(b.hasAttribute('data-shell-drawing'))this.onDrawing();
      else if(b.hasAttribute('data-shell-settings'))this.onSettings(this.step);
      else if(b.dataset.shellCamera){const a=b.dataset.shellCamera;if(a==='in'||a==='out')this.viewer?.zoom(a==='in'?.8:1.25);else this.viewer?.reset(a);}
      else if(b.hasAttribute('data-shell-explode')){this.explode=!this.explode;this.render(this.result,this.selected);}
      else if(b.hasAttribute('data-shell-records')){this.$('.shell-records').open=true;this.$('[data-shell-record="wps"]').focus();}
      else return;
      event.stopPropagation();
    });
    root.addEventListener('keydown',event=>{const el=event.target.closest('svg [data-shell-piece]');if(el&&['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();this.onSelect(el.dataset.shellPiece);}});
  }
  values(){for(const el of this.root.querySelectorAll('[data-shell-record]'))this.data[el.dataset.shellRecord]=el.value;return {...this.data};}
  apply(raw){this.data=normalizeShellRecords(raw).data;for(const el of this.root.querySelectorAll('[data-shell-record]'))el.value=this.data[el.dataset.shellRecord];}
  setActive(v){this.active=v;this.viewer?.setActive(v&&this.view==='3d'&&!!this.model);if(v&&this.view==='3d')this.ensureViewer();}
  async ensureViewer(){
    if(!this.active||this.view!=='3d'||!this.model)return;
    if(!this.viewer&&!this.loading){
      this.$('.shell-webgl').textContent='正在準備筒身 3D…';
      this.loading=import('./tank-shell-viewer.js').then(({ShellConstructionViewer})=>{this.viewer=new ShellConstructionViewer(this.$('.shell-webgl'),id=>this.onSelect(id));}).catch(()=>{this.$('.shell-webgl').textContent='3D 暫時無法載入，圖解與加工單仍可使用。重新點「筒身 3D」可重試。';}).finally(()=>{this.loading=null;});
    }
    if(this.loading)await this.loading;
    if(this.viewer&&this.model){this.viewer.update(this.model,this.step,this.explode);this.viewer.resize();this.viewer.setActive(this.active&&this.view==='3d');}
  }
  render(result,selected='S1'){
    this.result=result;this.selected=selected;const m=this.model=shellConstructionPlan(result,selected),valid=!!m;
    this.$('.shell-invalid').hidden=valid;this.$('.shell-live').hidden=!valid;
    this.$('[data-shell-print]').disabled=!valid;this.$('[data-shell-drawing]').disabled=!valid;
    if(!valid){this.viewer?.setActive(false);return;}
    const r=result,i=SHELL_STEPS.findIndex(s=>s.id===this.step),step=m.steps[i],picker=this.$('[data-shell-selection]');
    const options=r.assembly.map(p=>`<option value="${p.id}">${p.id} · 第 ${p.course} 圈／第 ${p.panel} 片</option>`).join('');if(picker.innerHTML!==options)picker.innerHTML=options;picker.value=m.piece.id;
    this.$('.shell-piece-meta').textContent=`${m.batch} · ${r.input.material||'材質待填'} t${fmt(r.input.shellThickness)} · ${m.axial}`;
    for(const b of this.root.querySelectorAll('[data-shell-step]')){const active=b.dataset.shellStep===this.step;b.setAttribute('aria-pressed',String(active));if(active)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');}
    const warn=[...(r.shellLayoutState?.issues??[]).map(i=>i.message),...m.warnings];this.$('.shell-alerts').innerHTML=warn.length?`<details><summary>先核對：${esc(warn[0])}${warn.length>1?'（另 '+(warn.length-1)+' 項）':''}</summary><ul>${warn.map(w=>'<li>'+esc(w)+'</li>').join('')}</ul></details>`:'';
    for(const b of this.root.querySelectorAll('[data-shell-view]'))b.setAttribute('aria-pressed',String(b.dataset.shellView===this.view));
    this.$('.shell-diagram').hidden=this.view!=='guide';this.$('.shell-3d').hidden=this.view!=='3d';
    this.$('.shell-diagram').dataset.zoom=this.zoom?'detail':'fit';this.$('[data-shell-zoom]').hidden=this.view==='3d';this.$('[data-shell-zoom]').setAttribute('aria-pressed',String(this.zoom));this.$('[data-shell-zoom]').textContent=this.zoom?'收合圖解':'放大圖解';
    this.$('.shell-diagram').innerHTML=shellStepSketch(m,this.step)+(this.zoom?'<p class="shell-pan-note">← 左右滑動看完整圖 →</p>':'');
    this.$('.shell-instructions').innerHTML=`<span class="shell-eyebrow">工序 ${i+1} / 5</span><h3>${esc(step.title)}</h3><p class="shell-lead">${esc(step.lead)}</p><ol>${step.actions.map(v=>'<li>'+esc(v)+'</li>').join('')}</ol><div class="shell-check"><strong>${i===4?'完成後核對':'下一步前，先檢查'}</strong><p>${esc(step.check)}</p></div><nav class="shell-next" aria-label="切換施工工序">${i>0?`<button type="button" data-shell-step="${SHELL_STEPS[i-1].id}">← 上一步</button>`:''}${i<4?`<button type="button" data-shell-step="${SHELL_STEPS[i+1].id}" class="shell-primary">接著：${SHELL_STEPS[i+1].title} →</button>`:'<button type="button" data-shell-print class="shell-primary">列印工序與記錄表</button>'}</nav>`;
    this.$('.shell-record-state').textContent=m.pending.length?'還有 '+m.pending.length+' 項施工依據待填':'記錄已填 · 尚需審核';
    this.$('.shell-weld-details summary span').textContent=m.piece.id+' · '+m.localWelds.map(w=>w.id).join('、');
    this.$('.shell-weld-table').innerHTML=`<table><thead><tr><th>焊道</th><th>接合對象</th><th>名目長 mm</th><th>接縫中心</th></tr></thead><tbody>${m.localWelds.map(w=>`<tr><td>${w.id}</td><td>${esc(w.self?w.a+' 自身合口':w.a+' ↔ '+w.b)}</td><td>${fmt(w.length,2)}</td><td>${w.kind==='longitudinal'?fmt(w.angle,2)+'°':esc(m.datum)+' +'+fmt(w.z,2)+' mm'}</td></tr>`).join('')}</tbody></table><p>編號表示位置，不代表焊接先後；環縫是整圈接縫，本表不重複計算。</p>`;
    this.$('[data-shell-explode]').setAttribute('aria-pressed',String(this.explode));
    this.$('.shell-3d-note').textContent=`拖曳旋轉 · 滾輪／雙指縮放 · 金色 ${m.piece.id}${['fit','weld'].includes(this.step)?'；橙線為本片接縫中心':''}。${this.explode?'分圈展開只供辨識，間距為示意。':'依成品位置顯示，非機台捲製動畫。'}${Object.values(r.seamClearance?.data??{}).some(v=>v!==null)&&['fit','weld'].includes(this.step)?'金色焊道帶／虛線施工區／紅色需避讓。':''}${r.assembly.length>500?'超過 500 片，3D 僅細畫選取片；完整清單見加工單。':''}`;
    for(const button of this.root.querySelectorAll('[data-shell-print],[data-shell-drawing]'))button.disabled=r.shellLayoutState?.valid===false||r.seamClearance?.valid===false;
    if(this.view==='3d')this.ensureViewer();else this.viewer?.setActive(false);
  }
}
