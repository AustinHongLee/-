import {assemblySketch,esc,fmt} from './tank-visuals.js';
import {editableShellSeams,moveShellSeam,shellSeamReadback,shellAssemblyFrame} from './tank-seam-edit-model.js';
import {mod} from './tank-shell-layout.js';
import {suggestNearestShellSeam} from './tank-seam-recovery.js';
import {seamSuggestionMarkup} from './tank-seam-edit-visuals.js';
const snapshot=r=>r.input.shellLayoutPlan?structuredClone(r.input.shellLayoutPlan):null;

export class TankSeamEditor{
  constructor({root,onChange,rules,onSettings,notify}){
    Object.assign(this,{root,onChange,rules,onSettings,notify,editing:false,selected:'',history:[],drag:null,frame:null,active:false,show3D:false});
    this.wrapper=document.createElement('section');this.wrapper.className='seam-editor';root.before(this.wrapper);
    this.wrapper.innerHTML=`<div class="seam-editor-head"><div><strong>在展開圖調接縫</strong><small>管嘴固定 · 焊道數保留</small></div><button type="button" data-seam-edit-toggle aria-pressed="false">拖曳接縫</button><button type="button" data-seam-edit-3d aria-pressed="false">同步 3D</button></div><div class="seam-editor-controls" hidden><label>選接縫<select data-edit-seam-select aria-label="選擇要移動的接縫"></select></label><label>中心位置 mm<input data-edit-seam-position aria-label="接縫中心位置 mm" type="number" step="any" inputmode="decimal"></label><button type="button" data-seam-edit-undo disabled>復原上一步</button><button type="button" data-seam-edit-settings>距離／板邊設定</button></div>`;
    this.wrapper.append(root);root.classList.add('seam-editor-plot');root.tabIndex=-1;
    this.recoveryPanel=document.createElement('div');this.recoveryPanel.className='seam-editor-recovery';this.recoveryPanel.hidden=true;this.recoveryPanel.setAttribute('aria-live','polite');this.wrapper.append(this.recoveryPanel);
    this.feedback=document.createElement('div');this.feedback.className='seam-editor-feedback';this.feedback.setAttribute('role','status');this.wrapper.append(this.feedback);
    this.preview=document.createElement('aside');this.preview.className='seam-editor-preview';this.preview.hidden=true;this.preview.innerHTML='<header><strong>同一配置 · 組立 3D</strong><button type="button" data-seam-edit-center>置中</button></header><div class="seam-editor-webgl"></div><p>拖曳旋轉、滾輪／雙指縮放；紅色板片超出板料限制，紅色接縫需避讓。</p>';this.wrapper.after(this.preview);
    this.wrapper.addEventListener('click',event=>{
      const target=event.target.closest('button');if(!target)return;
      if(target.hasAttribute('data-seam-edit-toggle')){this.cancelDrag();this.editing=!this.editing;if(!this.selected)this.selected=this.seams()[0]?.id??'';this.render(this.result,this.options);}
      else if(target.hasAttribute('data-seam-edit-undo'))this.undo();
      else if(target.hasAttribute('data-seam-edit-recover'))this.applyNearest();
      else if(target.hasAttribute('data-seam-edit-3d')){this.show3D=!this.show3D;this.render(this.result,this.options);}
      else if(target.hasAttribute('data-seam-edit-settings'))this.onSettings();else if(target.dataset.seamEditNext){this.selected=target.dataset.seamEditNext;this.render(this.result,this.options);this.focusHandle();}else return;
      event.stopPropagation();
    });
    this.preview.addEventListener('click',event=>{if(event.target.closest('[data-seam-edit-center]'))this.viewer?.reset();});
    this.wrapper.addEventListener('input',event=>{if(event.target.closest('.seam-editor-controls'))event.stopPropagation();});
    this.wrapper.addEventListener('change',event=>{if(event.target.hasAttribute('data-edit-seam-select')){this.selected=event.target.value;this.render(this.result,this.options);event.stopPropagation();}else if(event.target.hasAttribute('data-edit-seam-position')){this.setPosition(event.target.value);event.stopPropagation();}});
    root.addEventListener('pointerdown',event=>this.pointerDown(event));root.addEventListener('pointermove',event=>this.pointerMove(event));root.addEventListener('pointerup',event=>this.pointerUp(event));root.addEventListener('pointercancel',()=>this.cancelDrag());root.addEventListener('lostpointercapture',()=>{if(this.drag)this.cancelDrag();});
    this.wrapper.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&this.drag){event.preventDefault();event.stopPropagation();this.cancelDrag();return;}
      if(event.target.hasAttribute('data-edit-seam-position')&&event.key==='Enter'){event.preventDefault();event.stopPropagation();this.setPosition(event.target.value);return;}
      const handle=event.target.closest('[data-edit-seam]');if(!handle||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;
      event.preventDefault();event.stopPropagation();this.selected=handle.dataset.editSeam;const seam=editableShellSeams(this.result).find(s=>s.id===this.selected),ring=seam?.kind==='circumferential';
      if(ring&&!['ArrowUp','ArrowDown'].includes(event.key)||!ring&&!['ArrowLeft','ArrowRight'].includes(event.key))return;
      this.move((event.key==='ArrowUp'||event.key==='ArrowRight'?1:-1)*(event.shiftKey?10:1));this.focusHandle();
    });
  }
  get dragging(){return !!this.drag;}
  seams(){return editableShellSeams(this.result).filter(s=>s.course<=10&&(s.kind==='circumferential'?s.course<10:s.panel<=24));}
  focusHandle(){this.root.querySelector(`[data-edit-seam="${this.selected}"]`)?.focus({preventScroll:true});}
  editRules(){return this.rules();}
  update(plan,live=false){this.mutating=true;try{this.onChange(plan,{live});}finally{this.mutating=false;}}
  move(delta){const before=snapshot(this.result),moved=moveShellSeam(this.result,this.selected,delta,{rules:this.editRules()});if(!moved.ok){this.notify(moved.message);return;}if(Math.abs(moved.delta)<1e-8)return;this.history.push(before);this.history=this.history.slice(-30);this.update(moved.plan);if(moved.clamped)this.notify('已停在相鄰接縫之前；保持板片正尺寸，紅色限制仍需修正。');}
  applyNearest(){
    if(this.dragging)return;
    // Re-evaluate against current inputs: a suggestion displayed before a rules
    // or project change must never apply stale geometry.
    const next=suggestNearestShellSeam(this.result,this.selected,{rules:this.editRules()});
    if(!next.ok){this.notify(next.message);this.render(this.result,this.options);return;}
    this.move(next.delta);this.notify(`${next.id} 已移到 ${fmt(next.position,2)} mm；管嘴固定、焊道數維持 ${next.welds} 道${next.pending.length?'，未填施工尺寸仍待確認':''}。`);
  }
  renderRecovery(data){
    this.recoveryPanel.hidden=!this.editing||!data?.conflict;if(this.recoveryPanel.hidden)return;
    if(this.dragging){this.recoveryPanel.innerHTML='<p>放開後顯示最近可行位置 · 保留管嘴與焊道數</p>';return;}
    const rules=this.editRules(),key=JSON.stringify({input:this.result.input,id:this.selected,rules});
    if(key!==this.recoveryKey){this.recoveryKey=key;this.recovery=suggestNearestShellSeam(this.result,this.selected,{rules});}
    const next=this.recovery;
    if(!next.ok){this.recoveryPanel.innerHTML=`<div><strong>這道接縫還不能直接修好</strong><p>${esc(next.message)}</p></div><button type="button" data-seam-edit-settings>調整分圈／分片 →</button>`;return;}
    const near=next.after.nearest,pending=next.pending.length,ring=data.seam.kind==='circumferential',direction=ring?(this.result.orientation==='horizontal'?(next.delta>0?'往 B 端':'往 A 端'):(next.delta>0?'往上':'往下')):(next.delta>0?'沿圓周正向':'沿圓周反向');
    this.root.querySelector('svg')?.insertAdjacentHTML('beforeend',seamSuggestionMarkup(this.result,shellAssemblyFrame(this.result,{...this.options,editing:true}),next));
    this.recoveryPanel.innerHTML=`<div><strong>最近可行位置${pending?' · 依已填尺寸':''}</strong><p class="seam-editor-recovery-position">${fmt(data.seam.position,2)} <span>→</span> <b>${fmt(next.position,2)} mm</b><small>${direction} ${fmt(Math.abs(next.delta),2)} mm</small></p><p>${near?`${esc(near.nozzle)} ${esc(near.label)}淨距 <b>${fmt(near.actualClearance,1)} mm</b>／需 ${next.pending.some(p=>p.key==='workDistance')?'待填':fmt(near.required,1)+' mm'} · `:''}相鄰板片符合板料限制 · 焊道維持 ${next.welds} 道${next.remaining.length?' · 另 '+next.remaining.length+' 道待處理':''}</p><small>${pending?'還有 '+pending+' 項施工尺寸未填，補齊後需再核對。':'藍色虛線是建議；套用後可復原。'} 位置取至 0.01 mm，未加現場量測公差。</small></div><button type="button" data-seam-edit-recover>移到建議位置 →</button>`;
  }
  setPosition(raw){const value=String(raw).trim()===''?NaN:Number(raw),seam=editableShellSeams(this.result).find(s=>s.id===this.selected);if(!Number.isFinite(value)||!seam){this.notify('請填有效的接縫中心位置。');return;}
    const period=this.result.circumference;if(value<0||value>(seam.kind==='longitudinal'?period:this.result.bodyHeight)){this.notify('中心位置需在展開圖範圍內。');return;}
    let delta=value-seam.position;if(seam.kind==='longitudinal'){delta=mod(delta+period/2,period)-period/2;}this.move(delta);this.wrapper.querySelector('[data-edit-seam-position]').value=Number((editableShellSeams(this.result).find(s=>s.id===this.selected)?.position??value).toFixed(2));
  }
  pointerDown(event){
    const handle=event.target.closest('[data-edit-seam]');if(!this.editing||!handle||event.button!==0||event.isPrimary===false||this.drag)return;
    event.preventDefault();event.stopPropagation();this.selected=handle.dataset.editSeam;const check=moveShellSeam(this.result,this.selected,0,{rules:this.editRules()});if(!check.ok){this.notify(check.message);return;}this.render(this.result,this.options);const svg=this.root.querySelector('svg'),matrix=svg?.getScreenCTM();if(!matrix)return;
    const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());this.drag={pointer:event.pointerId,before:snapshot(this.result),base:this.result,start:point,matrix:matrix.inverse(),map:shellAssemblyFrame(this.result,{...this.options,editing:true}),kind:handle.dataset.seamKind,changed:false};
    this.root.focus({preventScroll:true});this.root.setPointerCapture(event.pointerId);this.root.classList.add('is-dragging');
  }
  pointerMove(event){if(!this.drag||event.pointerId!==this.drag.pointer)return;event.preventDefault();this.queued={x:event.clientX,y:event.clientY};if(this.frame===null)this.frame=requestAnimationFrame(()=>{this.frame=null;this.flush();});}
  flush(){if(!this.drag||!this.queued)return;const point=new DOMPoint(this.queued.x,this.queued.y).matrixTransform(this.drag.matrix);this.queued=null;
    const delta=this.drag.kind==='circumferential'?-(point.y-this.drag.start.y)/this.drag.map.scaleY:(point.x-this.drag.start.x)/this.drag.map.scaleX,moved=moveShellSeam(this.drag.base,this.selected,Math.round(delta*10)/10,{rules:this.editRules()});
    if(!moved.ok||!this.drag.changed&&Math.abs(moved.delta)<1e-8)return;this.drag.changed=true;this.update(moved.plan,true);
  }
  pointerUp(event){if(!this.drag||event.pointerId!==this.drag.pointer)return;event.preventDefault();event.stopPropagation();this.flush();const drag=this.drag;this.drag=null;if(this.frame!==null)cancelAnimationFrame(this.frame);this.frame=null;this.root.classList.remove('is-dragging');if(this.root.hasPointerCapture(event.pointerId))this.root.releasePointerCapture(event.pointerId);
    if(drag.changed){this.history.push(drag.before);this.history=this.history.slice(-30);this.update(snapshot(this.result));}this.focusHandle();
  }
  cancelDrag(){if(!this.drag)return;const drag=this.drag;this.drag=null;this.queued=null;if(this.frame!==null)cancelAnimationFrame(this.frame);this.frame=null;this.root.classList.remove('is-dragging');if(this.root.hasPointerCapture(drag.pointer))this.root.releasePointerCapture(drag.pointer);if(drag.changed)this.update(drag.before);}
  undo(){this.cancelDrag();if(!this.history.length)return;this.update(this.history.pop());this.notify('已復原上一步接縫位置。');}
  reset(){this.cancelDrag();this.history=[];this.selected='';this.context=null;this.recoveryKey=null;}
  setActive(active){const changed=this.active!==active;this.active=active;this.viewer?.setActive(active&&this.show3D);if(changed&&active&&this.show3D)this.update3D();}
  async update3D(){
    if(!this.show3D||!this.active||!this.result?.valid)return;
    if(!this.viewer&&!this.loading){const host=this.preview.querySelector('.seam-editor-webgl');host.textContent='正在準備組立 3D…';this.loading=import('./tank-viewer.js').then(({TankViewer})=>{this.viewer=new TankViewer(host);}).catch(()=>{host.textContent='3D 暫時無法載入，展開圖與距離仍可操作。';}).finally(()=>{this.loading=null;});}
    if(this.loading)await this.loading;if(!this.viewer)return;const read=shellSeamReadback(this.result,this.selected);this.viewer.update(this.result,{preserveCamera:true});this.viewer.setSelected(read?.plates[0]?.id??'S1');const weld=this.viewer.drawing.welds.find(w=>w.id===this.selected),nozzle=this.result.nozzlePlan.items.find(n=>n.id===read?.nearest?.nozzleId),labels=[...(weld?[{id:weld.id,kind:'weld',text:weld.id,anchor:weld.anchor}]:[]),...(nozzle?[{id:nozzle.id,kind:'nozzle',text:nozzle.mark||nozzle.id,anchor:nozzle.face}]:[])];this.viewer.labels.update(labels,this.viewer.drawing.revision);this.viewer.setLabelsVisible(true);this.viewer.setActive(this.active&&this.show3D);this.viewer.resize();
  }
  render(r,options=this.options??{}){
    if(!r?.valid)return;const context=JSON.stringify({...r.input,shellLayoutPlan:null});if(this.context&&this.context!==context&&!this.mutating&&!this.dragging)this.history=[];this.context=context;this.result=r;this.options=options;
    if(!this.seams().some(s=>s.id===this.selected))this.selected=this.seams()[0]?.id??'';
    this.wrapper.classList.toggle('seam-editor-on',this.editing);this.wrapper.querySelector('[data-seam-edit-toggle]').setAttribute('aria-pressed',String(this.editing));this.wrapper.querySelector('[data-seam-edit-toggle]').textContent=this.editing?'完成拖曳':'拖曳接縫';this.wrapper.querySelector('.seam-editor-controls').hidden=!this.editing;
    const select=this.wrapper.querySelector('[data-edit-seam-select]'),markup=this.seams().map(s=>`<option value="${s.id}">${s.id} ${s.kind==='circumferential'?'環縫':'縱縫'}</option>`).join('');if(select.innerHTML!==markup)select.innerHTML=markup;select.value=this.selected;
    const seam=editableShellSeams(r).find(s=>s.id===this.selected),input=this.wrapper.querySelector('[data-edit-seam-position]');if(document.activeElement!==input)input.value=seam?Number(seam.position.toFixed(2)):'';
    this.wrapper.querySelector('[data-seam-edit-undo]').disabled=!this.history.length;
    const others=[...new Set([...(r.shellLayoutState?.badSeams??[]),...r.nozzlePlan.items.flatMap(n=>n.seamCheck?.hits.map(h=>h.id)??[])])].filter(id=>id!==this.selected),next=this.seams().find(s=>others.includes(s.id));const data=shellSeamReadback(r,this.selected),near=data?.nearest,workPending=data?.pending.some(p=>p.key==='workDistance'),stockBad=data?.plates.some(p=>p.reasons.length);const meter=this.editing?`<output class="seam-editor-meter${data?.conflict?' is-bad':''}" aria-live="off"><div><b>${this.selected}</b>${near?` · <span class="seam-editor-meter-nozzle" title="${esc(near.nozzle)}">${esc(near.nozzle)}</span> 淨距 <strong>${fmt(near.actualClearance,1)} mm</strong>／需 ${workPending?'待填':fmt(near.required,1)+' mm'}`:' · 加入管嘴後顯示避讓距離'}</div><small>${stockBad?'毛坯超出原板／板邊限制，板片已標紅':data?.layoutBad?'相鄰圈錯縫距離需修正':near?.overlap?'開孔、焊道或施工距離需避讓':data?.pending.length?'仍有施工距離待填，依已填值顯示':others.length?'此道依已填值已避讓；另 '+others.length+' 道需處理':'接縫中心 '+fmt(seam?.position??0,2)+' mm · 拖動只改相鄰板片'}</small></output>`:'';
    this.root.innerHTML=meter+assemblySketch(r,{...options,interactive:true,editSeams:this.editing,activeSeam:this.selected});
    this.feedback.hidden=!this.editing;this.feedback.classList.toggle('has-conflict',Boolean(data?.conflict));
    if(data){const nearest=data.nearest,rows=data.plates.filter(p=>p.reasons.length),pending=data.pending.length;
      this.feedback.innerHTML=`<div class="seam-editor-live-title"><strong>${this.selected} · ${seam.kind==='circumferential'?(r.orientation==='horizontal'?'距 A 端筒身板邊':'距筒身下緣'):'由 0° 沿中面圓周'} ${fmt(seam.position,2)} mm${seam.kind==='longitudinal'?'／'+fmt(seam.position/r.circumference*360,2)+'°':''}</strong><small>${this.dragging?'移動中 · 放開後保留修改':'水平拖縱縫、上下拖環縫；方向鍵 1 mm，Shift 10 mm'}</small></div>${nearest?`<p class="seam-editor-distance">最近 ${esc(nearest.nozzle)} ${esc(nearest.label)}：焊趾淨距 <b>${fmt(nearest.actualClearance,1)} mm</b>／需 ${pending?'依已填值 ':''}${data.pending.some(p=>p.key==='workDistance')?'待填':fmt(nearest.required,1)+' mm'}${nearest.overlap?(nearest.actualClearance<=0?' · 焊道或開孔相碰':' · 尚差 '+fmt(nearest.shortfall,1)+' mm'):''}</p>`:'<p>尚無筒身管嘴；加入後會即時量測接縫與開孔／補強板的距離。</p>'}${data.stagger!==null?`<p class="seam-editor-stagger">相鄰圈最近縱縫中心距 ${fmt(data.stagger,1)} mm／本案要求 ${fmt(data.requiredStagger,1)} mm</p>`:''}<div class="seam-editor-plate-chips">${data.plates.slice(0,6).map(p=>`<span class="${p.reasons.length?'is-bad':''}"><b>${p.id}</b> 毛坯 ${fmt(p.raw.width,1)} × ${fmt(p.raw.height,1)}${p.reasons.length?' · '+esc(p.reasons.join('、')):''}</span>`).join('')}${data.plates.length>6?'<small>另 '+(data.plates.length-6)+' 片，見板片明細</small>':''}</div>${rows.length?'<p class="seam-editor-blocked">紅色板片不符合原板或板邊限制；位置已保留，修正後才可出加工單。</p>':r.shellLayoutState.valid===false?'<p class="seam-editor-blocked">配置仍有板料／錯縫限制待修正，修正後才可出加工單。</p>':''}${!data.settingsValid?'<p class="seam-editor-blocked">施工距離輸入有誤，請先修正。</p>':pending?'<p class="seam-editor-pending">仍有 '+pending+' 項焊道／施工尺寸未填；目前距離不表示施工已確認。</p>':''}${others.length?`<div class="seam-editor-next"><span>另 ${others.length} 道接縫需處理</span>${next?`<button type="button" data-seam-edit-next="${next.id}">切換到 ${next.id} →</button>`:''}</div>`:''}`;
    }
    this.renderRecovery(data);
    this.preview.hidden=!this.show3D;this.wrapper.parentElement.classList.toggle('seam-editor-3d-open',this.show3D);this.wrapper.querySelector('[data-seam-edit-3d]').setAttribute('aria-pressed',String(this.show3D));this.update3D();if(!this.show3D)this.viewer?.setActive(false);
  }
}
