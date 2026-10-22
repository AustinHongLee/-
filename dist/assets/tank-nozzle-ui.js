import {NOZZLE_DEFAULTS,nozzleHostLabel,nozzleFieldLabel,nozzleHasConflict} from './tank-nozzles.js';
import {nozzleLayoutSketch} from './tank-nozzle-visuals.js';
import {nozzlePositionPatch} from './tank-nozzle-position.js';
import {changeNozzleBuilderSize,canFollowNozzleFlange,defaultFollowNozzleFlange,nozzleBuilderSummary} from './tank-nozzle-builder.js';
import {esc,fmt} from './tank-visuals.js';
import {TankFlangeUI} from './tank-flange-ui.js';
import {mountNozzleWorkspace} from './tank-nozzle-workspace.js';
import {ASME_PIPE_SIZES} from './pipe-sizes.js';
import {pipeSizeForOD,useNozzleFlangeReference,nozzleFlangeState} from './tank-flange-actions.js';
const displayName=n=>n.mark&&n.name?.startsWith(n.mark+' · ')?n.name.slice(n.mark.length+3):n.name;
export class TankNozzleUI{
  constructor({form,onChange,onSelect,onShape,on3D}){
    this.form=form;this.onChange=onChange;this.onSelect=onSelect;this.items=[];this.selected=null;this.positionEditing=false;this.positionView='body';this.clusterIds=[];this.followFlange=new Map();
    this.workspace=mountNozzleWorkspace(form);
    document.getElementById('tank-nozzle-pipe-size').innerHTML='<option value="custom">自訂實際外徑</option>'+ASME_PIPE_SIZES.map(p=>`<option value="${p.nps}">NPS ${p.nps} · Ø ${p.odMm} mm</option>`).join('');
    this.compact=matchMedia('(max-width:500px)');this.compact.addEventListener('change',()=>{if(this.result)this.render(this.result);});
    this.flangeUI=new TankFlangeUI({form,current:()=>this.current(),onChange:()=>{this.onChange();this.sync();}});
    this.workspace.onChange(()=>{if(this.current())this.flangeUI.render(this.current());});
    form.addEventListener('click',event=>{
      const button=event.target.closest('[data-nozzle-add],[data-nozzle-select],[data-nozzle-remove],[data-nozzle-host],[data-nozzle-kind],[data-nozzle-issue],#tank-nozzle-3d,[data-nozzle-shape],[data-nozzle-map-edit],[data-nozzle-cluster],[data-nozzle-focus],[data-nozzle-location-view],[data-nozzle-build],[data-nozzle-next],[data-nozzle-preview]');if(!button)return;
      if(button.hasAttribute('data-nozzle-build')){this.positionEditing=false;this.render(this.result);this.workspace.show('position');this.workspace.showDiagram('section');const field=document.getElementById('tank-nozzle-pipe-size');field.focus({preventScroll:true});document.getElementById('tank-nozzle-build').scrollIntoView({block:'center',behavior:'smooth'});return;}
      if(button.hasAttribute('data-nozzle-preview')){this.workspace.showDiagram('section',{open:true});document.getElementById('tank-nozzle-section').scrollIntoView({block:'center',behavior:'smooth'});return;}
      if(button.hasAttribute('data-nozzle-next')){const issue=this.result?.nozzlePlan?.issues.find(i=>i.id===this.selected);if(issue){this.workspace.reveal(issue.field);const field=this.form.querySelector(`[data-nozzle-field="${issue.field}"]`);for(let parent=field?.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;field?.focus();field?.scrollIntoView({block:'center'});}else document.getElementById('tank-nozzle-add').click();return;}
      if(button.dataset.nozzleLocationView){this.positionView=button.dataset.nozzleLocationView;this.clusterIds=[];this.render(this.result);return;}
      if(button.hasAttribute('data-nozzle-map-edit')){this.positionEditing=!this.positionEditing;this.clusterIds=[];this.render(this.result);return;}
      if(button.dataset.nozzleCluster){this.clusterIds=button.dataset.nozzleCluster.split('|').filter(id=>this.items.some(n=>n.id===id));this.render(this.result);document.querySelector('.nozzle-map-choices')?.scrollIntoView({block:'nearest'});return;}
      if(button.dataset.nozzleFocus){const key=button.dataset.nozzleFocus;this.workspace.reveal(key);const field=this.form.querySelector(`[data-nozzle-field="${key}"]`);field?.focus();field?.select?.();field?.scrollIntoView({block:'nearest'});return;}
      if(button.hasAttribute('data-nozzle-add')){if(this.items.length>=30)return;const id='N'+(Math.max(0,...this.items.map(n=>Number(n.id.slice(1))))+1);this.items.push(useNozzleFlangeReference({...NOZZLE_DEFAULTS,id,name:'新管嘴',od:60.3,flangeSize:'2',flangeClass:'150',flangeFacing:'RF',height:Number(Math.min(300,(this.result?.bodyHeight??2000)/2).toFixed(2))}));this.selected=id;this.positionEditing=true;this.positionView='body';this.clusterIds=[];this.workspace.show('position');this.workspace.showDiagram('position');this.onChange();this.sync();this.onSelect(id);document.getElementById('tank-nozzle-location').scrollIntoView({block:'center',behavior:'smooth'});}
      else if(button.dataset.nozzleSelect){const fromChoices=!!button.closest('.nozzle-map-choices');this.select(button.dataset.nozzleSelect);if(fromChoices)document.querySelector('.nozzle-map-heading')?.scrollIntoView({block:'center'});}
      else if(button.hasAttribute('data-nozzle-remove')){this.flangeUI.modes.delete(this.selected);this.items=this.items.filter(n=>n.id!==this.selected);this.selected=this.items[0]?.id??null;this.onChange();this.sync();this.onSelect(this.selected);}
      else if(button.dataset.nozzleHost){const n=this.current();if(n){n.host=button.dataset.nozzleHost;this.onChange();this.sync();}}
      // Manhole: example neck / flange sizes so the cover can be estimated at once (verify against the drawing).
      else if(button.dataset.nozzleKind){const n=this.current();if(n){n.kind=button.dataset.nozzleKind;if(n.kind==='manhole'&&Number(n.od)<400)Object.assign(n,{od:508,thickness:8,projection:250,flangeOD:700,flangeThickness:40,flangeLength:120,flangeWeight:0,flangeSource:'manual',name:!n.name||n.name==='新管嘴'?'人孔':n.name});this.onChange();this.sync();}}
      else if(button.dataset.nozzleIssue){this.select(button.dataset.nozzleIssue);this.workspace.reveal(button.dataset.field??'host');const field=this.form.querySelector(`[data-nozzle-field="${button.dataset.field}"]`)??this.form.querySelector('[data-nozzle-host]');for(let parent=field?.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;field?.focus();field?.scrollIntoView({behavior:'smooth',block:'center'});}
      else if(button.dataset.nozzleShape)onShape(button.dataset.nozzleShape);
      else if(button.id==='tank-nozzle-3d')on3D();
    });
    form.addEventListener('focusin',event=>{const key=event.target.dataset.nozzleField,wanted=key==='height'?'body':['angle','radius','offset'].includes(key)?'end':null;if(this.workspace.current==='position'){if(wanted){this.workspace.showDiagram('position');if(wanted!==this.positionView){this.positionView=wanted;this.clusterIds=[];this.render(this.result);}}else if(['od','thickness','projection','inside','end','flangeSize','flangeClass','flangeFacing'].includes(key)||['tank-nozzle-pipe-size','tank-nozzle-follow-flange'].includes(event.target.id))this.workspace.showDiagram('section');}});
    let pointerStart=null;
    form.addEventListener('pointerdown',event=>{pointerStart=event.target.closest('[data-nozzle-position]')?{x:event.clientX,y:event.clientY}:null;});
    form.addEventListener('pointerup',event=>{
      const start=pointerStart;pointerStart=null;if(!start||Math.hypot(event.clientX-start.x,event.clientY-start.y)>8)return;
      const target=event.target.closest('[data-nozzle-position]'),n=this.current(),r=this.result;if(!target||!n||!r?.valid)return;
      const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(target.getScreenCTM().inverse());
      const patch=nozzlePositionPatch(r,n,target.dataset.nozzlePosition,point);if(!patch)return;Object.assign(n,patch);
      this.onChange();this.sync();this.onSelect(n.id);
    });
    form.addEventListener('keydown',event=>{
      const cluster=event.target.closest('svg [data-nozzle-cluster]');if(cluster&&['Enter',' '].includes(event.key)){event.preventDefault();this.clusterIds=cluster.dataset.nozzleCluster.split('|');this.render(this.result);document.querySelector('.nozzle-map-choices button')?.focus();return;}
      const selected=event.target.closest('svg [data-nozzle-select]');if(selected&&['Enter',' '].includes(event.key)){event.preventDefault();this.select(selected.dataset.nozzleSelect);return;}
      const target=event.target.closest('[data-nozzle-position]'),n=this.current(),r=this.result;if(!target||!n||!r?.valid||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();
      const plus=['ArrowUp','ArrowRight'].includes(event.key),factor=event.shiftKey?5:1,kind=target.dataset.nozzlePosition;
      if(kind==='height')n.height=Math.max(Number(n.od)/2+Number(n.holeGap),Math.min(r.bodyHeight-Number(n.od)/2-Number(n.holeGap),Number(n.height)+(plus?10:-10)*factor));
      else if(kind==='end'&&['ArrowUp','ArrowDown'].includes(event.key))n.radius=Math.max(0,Math.min(r.di/2-Number(n.od)/2-Number(n.holeGap),Number(n.radius)+(plus?10:-10)*factor));
      else if(kind==='angle'&&n.axisMode==='parallel'){const limit=Math.max(0,r.di/2-Number(n.od)/2-Number(n.holeGap)-.01);n.offset=Math.max(-limit,Math.min(limit,Number(n.offset)+(plus?10:-10)*factor));}
      else n.angle=(Number(n.angle)+(plus?5:-5)*factor+360)%360;
      this.onChange();this.sync();this.onSelect(n.id);this.form.querySelector(`[data-nozzle-position="${kind}"]`)?.focus({preventScroll:true});
    });
  }
  current(){return this.items.find(n=>n.id===this.selected);}
  followsFlange(n){return defaultFollowNozzleFlange(n)&&this.followFlange.get(n.id)!==false;}
  values(){return this.items.map(n=>({...n}));}
  apply(values){this.items=(values??[]).map(n=>({...NOZZLE_DEFAULTS,name:'',...n}));this.selected=this.items[0]?.id??null;this.positionEditing=false;this.positionView='body';this.clusterIds=[];this.followFlange.clear();this.flangeUI.modes.clear();this.flangeUI.renderedId=null;this.sync();}
  edit(target){const n=this.current();if(!n)return false;if(target.id==='tank-nozzle-follow-flange'){this.followFlange.set(n.id,target.checked);if(target.checked){const pipe=pipeSizeForOD(n.od);if(pipe)Object.assign(n,changeNozzleBuilderSize(n,pipe.nps,{followFlange:true}));this.flangeUI.modes.set(n.id,'catalog');this.sync();}return true;}if(target.id==='tank-nozzle-pipe-size'){if(target.value==='custom'){const field=this.form.querySelector('[data-nozzle-field="od"]');this.workspace.reveal('od');document.getElementById('tank-nozzle-custom-pipe').open=true;field.focus();field.select();return true;}const follow=this.followsFlange(n);Object.assign(n,changeNozzleBuilderSize(n,target.value,{followFlange:follow}));this.followFlange.set(n.id,follow);this.sync();return true;}const field=target.dataset.nozzleField;if(!field)return false;n[field]=target.value;if(['od','flangeLength','flangeOD','flangeThickness'].includes(field))this.followFlange.set(n.id,false);if(field==='construction'&&n.construction==='integral'){n.end='wn';n.flangeSource='manual';this.followFlange.set(n.id,false);this.flangeUI.modes.set(n.id,'manual');}this.flangeUI.edit(field,n);if(['flangeSize','flangeClass','flangeFacing','construction'].includes(field))this.sync();return true;}
  select(id){if(!this.items.some(n=>n.id===id))return;if(this.selected!==id)this.positionEditing=false;this.clusterIds=[];this.selected=id;this.render(this.result);this.sync();this.onSelect(id);const rail=document.getElementById('tank-nozzle-list'),button=rail.querySelector(`[data-nozzle-select="${id}"]`);if(button){const b=button.getBoundingClientRect(),box=rail.getBoundingClientRect();if(b.left<box.left)rail.scrollLeft+=b.left-box.left;else if(b.right>box.right)rail.scrollLeft+=b.right-box.right;}}
  sync(){const n=this.current();if(!n)return;for(const field of this.form.querySelectorAll('[data-nozzle-field]'))field.value=n[field.dataset.nozzleField]??'';document.getElementById('tank-nozzle-pipe-size').value=pipeSizeForOD(n.od)?.nps??'custom';}
  render(r){
    this.result=r;const $=id=>document.getElementById(id),n=this.current(),plan=r?.nozzlePlan;
    $('tank-nozzle-editor').hidden=!n;$('tank-nozzle-empty').hidden=!!this.items.length;$('tank-nozzle-add').disabled=this.items.length>=30;
    $('tank-nozzle-editor').closest('.tank-nozzle-grid').hidden=!n;
    $('tank-nozzle-pipe-size').value=pipeSizeForOD(n?.od)?.nps??'custom';
    $('tank-nozzle-list').innerHTML=this.items.map(item=>`<button type="button" data-nozzle-select="${item.id}" aria-pressed="${item.id===this.selected}"><strong>${esc(item.mark||item.id)} ${esc(displayName(item)||'未命名')}</strong><small>${item.kind==='manhole'?'人孔 · ':''}${esc(item.host==='shell'&&item.axisMode==='parallel'?'筒壁平行偏心':nozzleHostLabel(item.host,r))} · Ø ${esc(item.od)} mm${Number(item.padOD)>0?' · 補強板':''}</small></button>`).join('');
    $('tank-nozzle-location').innerHTML=nozzleLayoutSketch(r,{selected:this.selected,interactive:!!n,compact:this.compact.matches,editing:this.positionEditing,cluster:this.clusterIds,view:this.positionView});
    $('tank-nozzle-summary').innerHTML=plan?`<strong>${plan.count} 個管嘴 · ${plan.flangeCount} 只法蘭</strong><p>管料最長包絡＋留料共 ${fmt(plan.pipeBlankLength,2)} mm；已知附件估重 ${fmt(plan.accountedWeight??plan.extraWeight)} kg${plan.unknownFlangeWeight?'，'+plan.unknownFlangeWeight+' 只法蘭單重未計':''}。${plan.unknownPipeCount?'另有 '+plan.unknownPipeCount+' 個一體接件與內管未拆料、重量未計。':''}${plan.items.some(n=>n.detailedAssembly)?'已改分件的管料／法蘭不加計在此；改計明細見整槽 BOM。':''}${!plan.valid?'尚有管嘴資料待修正，合計僅含可計算部分。':''}</p>`:'<p>先修正桶槽尺寸。</p>';
    for(const field of this.form.querySelectorAll('[data-nozzle-field]'))field.removeAttribute('aria-invalid');
    $('tank-nozzle-errors').hidden=!plan?.issues.length;$('tank-nozzle-errors').innerHTML=(plan?.issues??[]).map(issue=>`<button type="button" data-nozzle-issue="${esc(issue.id??this.selected??'')}" data-field="${esc(issue.field??'')}">${esc(issue.id??'管嘴')}：${esc(issue.message)} →</button>`).join('');
    if(!n){$('tank-nozzle-cut').replaceChildren();return;}
    this.flangeUI.render(n);
    const summary=nozzleBuilderSummary(n,r),flangeState=nozzleFlangeState(n),following=this.followsFlange(n);$('tank-nozzle-position-memory').textContent=summary.full;
    $('tank-nozzle-follow-flange').disabled=!canFollowNozzleFlange(n);$('tank-nozzle-follow-flange').checked=canFollowNozzleFlange(n)&&following;
    $('tank-nozzle-quick-spec').hidden=n.end==='bare';$('tank-nozzle-quick-spec-title').textContent=`NPS ${n.flangeSize||'待選'} · Class ${n.flangeClass||'待選'} · ${n.flangeFacing||'面待選'}`;
    $('tank-nozzle-build-note').textContent=n.construction==='integral'?'一體長頸接件：保留圖說尺寸；接件構成可在「備料細節」修改。':n.end==='bare'?'外伸量到裸管端；若要接法蘭，直接選下方接法。':flangeState.stale?'這組規格尚未帶入有效尺寸；請到法蘭詳設核對實測值。':flangeState.mismatch?'管徑與法蘭吋數不同；可勾選跟隨管徑，或保留原接法到法蘭詳設核對。':following?'改管徑時會一起帶入同吋數法蘭；Class與接合面沿用目前選擇。':'保留目前法蘭尺寸；要一起換吋數，再勾選跟隨管徑。';
    this.form.querySelector('[data-nozzle-next]').disabled=this.items.length>=30;
    $('tank-nozzle-editor-title').textContent=(n.mark||n.id)+' · '+(displayName(n)||'未命名管嘴');
    for(const button of this.form.querySelectorAll('[data-nozzle-host]')){button.setAttribute('aria-pressed',String(button.dataset.nozzleHost===n.host));button.textContent=button.dataset.nozzleHost==='shell'&&n.axisMode==='parallel'?'筒壁平行偏心':nozzleHostLabel(button.dataset.nozzleHost,r);}
    for(const button of this.form.querySelectorAll('[data-nozzle-kind]'))button.setAttribute('aria-pressed',String(button.dataset.nozzleKind===(n.kind??'nozzle')));
    $('tank-nozzle-manhole').hidden=n.kind!=='manhole';
    this.form.querySelector('[data-nozzle-field="angle"]').closest('label').querySelector('small').textContent=(r?.orientation==='horizontal'?'統一由 A 端看：0°向上、順時針。':'由上往下看：以0°為基準、順時針。')+(n.host==='shell'?'角度為管軸方向。':'角度為偏心位置方向，管軸沿槽軸。');$('tank-nozzle-axis-fields').hidden=n.host!=='shell';$('tank-nozzle-offset-field').hidden=n.axisMode!=='parallel';$('tank-nozzle-neck-field').hidden=n.construction!=='integral';
    const heightLabel=$('tank-nozzle-height-field');if(heightLabel?.firstChild)heightLabel.firstChild.textContent=r?.orientation==='horizontal'?'距筒身 A 端板邊 mm':'距筒身板下緣 mm';
    $('tank-nozzle-height-field').hidden=n.host!=='shell';$('tank-nozzle-radius-field').hidden=n.host==='shell';$('tank-nozzle-flange-fields').hidden=n.end==='bare';$('tank-nozzle-weld-gap-field').hidden=n.end!=='wn'||n.construction==='integral';
    $('tank-nozzle-flat-recovery').hidden=!(n.host==='top'&&r?.endTypes?.top==='open');
    for(const issue of plan?.issues??[])if(issue.id===n.id)this.form.querySelector(`[data-nozzle-field="${issue.field}"]`)?.setAttribute('aria-invalid','true');
    const item=plan?.items.find(item=>item.id===n.id);$('tank-nozzle-cut').innerHTML=item?`<div class="tank-nozzle-readback"><strong>管料先備 ${fmt(item.blankLength,2)} mm</strong><p>${item.host==='shell'?'魚口端':'平口端'}最短／最長 ${fmt(item.minCutLength,2)} / ${fmt(item.maxCutLength,2)} mm，總修整留料 ${fmt(item.allowance)} mm。${item.shellPiece?'開孔中心在 '+item.shellPiece+'。':''}</p><p>管段估重 ${fmt(item.pipeWeight,2)} kg${item.end!=='bare'?'；法蘭 '+(item.flangeWeight>0?fmt(item.flangeWeight,2)+' kg':'單重待提供'):''}。</p>${item.warnings.length?`<details class="tank-nozzle-note-list"><summary>${nozzleHasConflict(item)?'有幾何／規格問題需核對':item.warnings.length+' 項備料提醒'}</summary>${item.warnings.map(message=>'<p class="tank-nozzle-warning">'+esc(message)+'</p>').join('')}</details>`:''}</div>`:'<p class="tank-note">修正上方管嘴資料後，尺寸圖會更新。</p>';
    if(item?.cutReady===false)$('tank-nozzle-cut').innerHTML='<div class="tank-nozzle-readback"><strong>一體長頸接件 · 依詳圖分件</strong><p>已保留位置、外伸與內凸量。頸部、轉接與浸入管的焊接分界尚未建立，不提供直管下料長；接件與內管重量未計。</p></div>';
    if(item?.detailedAssembly)$('tank-nozzle-cut').innerHTML=`<div class="tank-nozzle-readback"><strong>管料／法蘭已改用 ${esc(item.detailedAssembly)} 分件</strong><p>此頁保留端口幾何定位；備料、焊道與重量依分件表，不重複加計原概算。補強與蓋板依工法另列。</p><button type="button" data-open-fabrication="${esc(item.detailedAssembly)}" class="tank-secondary">查看分件與焊道 ↗</button></div>`;
    $('tank-nozzle-mobile-label').textContent=this.workspace.current==='position'?'定位圖／管嘴外形 · 點開查看':item?(item.cutReady===false?'一體接件 · 查看圖面':'管料先備 '+fmt(item.blankLength,2)+' mm · 展開圖面'):'尺寸待修正 · 查看圖面';
  }
}
