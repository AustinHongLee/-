import {NOZZLE_DEFAULTS,NOZZLE_HOSTS,nozzleFieldLabel} from './tank-nozzles.js';
import {nozzleLayoutSketch} from './tank-nozzle-visuals.js';
import {esc,fmt} from './tank-visuals.js';
import {TankFlangeUI} from './tank-flange-ui.js';
export class TankNozzleUI{
  constructor({form,onChange,onSelect,onShape,on3D}){
    this.form=form;this.onChange=onChange;this.onSelect=onSelect;this.items=[];this.selected=null;
    this.compact=matchMedia('(max-width:500px)');this.compact.addEventListener('change',()=>{if(this.result)this.render(this.result);});
    this.flangeUI=new TankFlangeUI({form,current:()=>this.current(),onChange:()=>{this.onChange();this.sync();}});
    form.addEventListener('click',event=>{
      const button=event.target.closest('[data-nozzle-add],[data-nozzle-select],[data-nozzle-remove],[data-nozzle-host],[data-nozzle-issue],#tank-nozzle-3d,[data-nozzle-shape]');if(!button)return;
      if(button.hasAttribute('data-nozzle-add')){if(this.items.length>=30)return;const id='N'+(Math.max(0,...this.items.map(n=>Number(n.id.slice(1))))+1);this.items.push({...NOZZLE_DEFAULTS,id,name:'新管嘴',height:Number(Math.min(300,(this.result?.bodyHeight??2000)/2).toFixed(2))});this.selected=id;this.onChange();this.sync();this.onSelect(id);}
      else if(button.dataset.nozzleSelect)this.select(button.dataset.nozzleSelect);
      else if(button.hasAttribute('data-nozzle-remove')){this.items=this.items.filter(n=>n.id!==this.selected);this.selected=this.items[0]?.id??null;this.onChange();this.sync();this.onSelect(this.selected);}
      else if(button.dataset.nozzleHost){const n=this.current();if(n){n.host=button.dataset.nozzleHost;this.onChange();this.sync();}}
      else if(button.dataset.nozzleIssue){this.select(button.dataset.nozzleIssue);const field=this.form.querySelector(`[data-nozzle-field="${button.dataset.field}"]`)??this.form.querySelector('[data-nozzle-host]');for(let parent=field?.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;field?.focus();field?.scrollIntoView({behavior:'smooth',block:'center'});}
      else if(button.dataset.nozzleShape)onShape(button.dataset.nozzleShape);
      else if(button.id==='tank-nozzle-3d')on3D();
    });
    let pointerStart=null;
    form.addEventListener('pointerdown',event=>{pointerStart=event.target.closest('[data-nozzle-position]')?{x:event.clientX,y:event.clientY}:null;});
    form.addEventListener('pointerup',event=>{
      const start=pointerStart;pointerStart=null;if(!start||Math.hypot(event.clientX-start.x,event.clientY-start.y)>8)return;
      const target=event.target.closest('[data-nozzle-position]'),n=this.current(),r=this.result;if(!target||!n||!r?.valid)return;
      const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(target.getScreenCTM().inverse());
      if(target.dataset.nozzlePosition==='height')n.height=Number(Math.max(n.od/2+Number(n.holeGap),Math.min(r.bodyHeight-n.od/2-Number(n.holeGap),(250-point.y)/190*r.bodyHeight)).toFixed(2));
      else {const x=point.x-335,y=145-point.y,distance=Math.hypot(x,y);if(distance>=8)n.angle=Number(((Math.atan2(x,y)*180/Math.PI+360)%360).toFixed(2));if(target.dataset.nozzlePosition==='end')n.radius=Number(Math.min(Math.max(0,r.di/2-n.od/2-Number(n.holeGap)),distance/65*r.di/2).toFixed(2));}
      this.onChange();this.sync();this.onSelect(n.id);
    });
    form.addEventListener('keydown',event=>{
      const selected=event.target.closest('svg [data-nozzle-select]');if(selected&&['Enter',' '].includes(event.key)){event.preventDefault();this.select(selected.dataset.nozzleSelect);return;}
      const target=event.target.closest('[data-nozzle-position]'),n=this.current(),r=this.result;if(!target||!n||!r?.valid||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();
      const plus=['ArrowUp','ArrowRight'].includes(event.key),factor=event.shiftKey?5:1,kind=target.dataset.nozzlePosition;
      if(kind==='height')n.height=Math.max(Number(n.od)/2+Number(n.holeGap),Math.min(r.bodyHeight-Number(n.od)/2-Number(n.holeGap),Number(n.height)+(plus?10:-10)*factor));
      else if(kind==='end'&&['ArrowUp','ArrowDown'].includes(event.key))n.radius=Math.max(0,Math.min(r.di/2-Number(n.od)/2-Number(n.holeGap),Number(n.radius)+(plus?10:-10)*factor));
      else n.angle=(Number(n.angle)+(plus?5:-5)*factor+360)%360;
      this.onChange();this.sync();this.onSelect(n.id);this.form.querySelector(`[data-nozzle-position="${kind}"]`)?.focus({preventScroll:true});
    });
  }
  current(){return this.items.find(n=>n.id===this.selected);}
  values(){return this.items.map(n=>({...n}));}
  apply(values){this.items=(values??[]).map(n=>({...NOZZLE_DEFAULTS,name:'',...n}));this.selected=this.items[0]?.id??null;this.sync();}
  edit(target){const field=target.dataset.nozzleField,n=this.current();if(!field||!n)return false;n[field]=target.value;this.flangeUI.edit(field,n);return true;}
  select(id){if(!this.items.some(n=>n.id===id))return;this.selected=id;this.render(this.result);this.sync();this.onSelect(id);}
  sync(){const n=this.current();if(!n)return;for(const field of this.form.querySelectorAll('[data-nozzle-field]'))field.value=n[field.dataset.nozzleField]??'';}
  render(r){
    this.result=r;const $=id=>document.getElementById(id),n=this.current(),plan=r?.nozzlePlan;
    $('tank-nozzle-editor').hidden=!n;$('tank-nozzle-empty').hidden=!!this.items.length;$('tank-nozzle-add').disabled=this.items.length>=30;
    $('tank-nozzle-list').innerHTML=this.items.map(item=>`<button type="button" data-nozzle-select="${item.id}" aria-pressed="${item.id===this.selected}"><strong>${item.id} ${esc(item.name||'未命名')}</strong><small>${NOZZLE_HOSTS[item.host]} · Ø ${esc(item.od)} mm</small></button>`).join('');
    $('tank-nozzle-location').innerHTML=nozzleLayoutSketch(r,{selected:this.selected,interactive:!!n,compact:this.compact.matches});
    $('tank-nozzle-summary').innerHTML=plan?`<strong>${plan.count} 個管嘴 · ${plan.flangeCount} 只法蘭</strong><p>管料最長包絡＋留料共 ${fmt(plan.pipeBlankLength,2)} mm；已知附件估重 ${fmt(plan.extraWeight)} kg${plan.unknownFlangeWeight?'，'+plan.unknownFlangeWeight+' 只法蘭單重未計':''}。${!plan.valid?'尚有管嘴資料待修正，合計僅含可計算部分。':''}</p>`:'<p>先修正桶槽尺寸。</p>';
    for(const field of this.form.querySelectorAll('[data-nozzle-field]'))field.removeAttribute('aria-invalid');
    $('tank-nozzle-errors').hidden=!plan?.issues.length;$('tank-nozzle-errors').innerHTML=(plan?.issues??[]).map(issue=>`<button type="button" data-nozzle-issue="${esc(issue.id??this.selected??'')}" data-field="${esc(issue.field??'')}">${esc(issue.id??'管嘴')}：${esc(issue.message)} →</button>`).join('');
    if(!n){$('tank-nozzle-cut').replaceChildren();return;}
    this.flangeUI.render(n);
    $('tank-nozzle-editor-title').textContent=n.id+' · 尺寸與接法';
    for(const button of this.form.querySelectorAll('[data-nozzle-host]'))button.setAttribute('aria-pressed',String(button.dataset.nozzleHost===n.host));
    $('tank-nozzle-height-field').hidden=n.host!=='shell';$('tank-nozzle-radius-field').hidden=n.host==='shell';$('tank-nozzle-flange-fields').hidden=n.end==='bare';$('tank-nozzle-weld-gap-field').hidden=n.end!=='wn';
    $('tank-nozzle-flat-recovery').hidden=!(n.host==='top'&&r?.input.shape==='open');
    for(const issue of plan?.issues??[])if(issue.id===n.id)this.form.querySelector(`[data-nozzle-field="${issue.field}"]`)?.setAttribute('aria-invalid','true');
    const item=plan?.items.find(item=>item.id===n.id);$('tank-nozzle-cut').innerHTML=item?`<div class="tank-nozzle-readback"><strong>管料先備 ${fmt(item.blankLength,2)} mm</strong><p>${item.host==='shell'?'魚口端':'平口端'}最短／最長 ${fmt(item.minCutLength,2)} / ${fmt(item.maxCutLength,2)} mm，總修整留料 ${fmt(item.allowance)} mm。${item.shellPiece?'開孔中心在 '+item.shellPiece+'。':''}</p><p>管段估重 ${fmt(item.pipeWeight,2)} kg${item.end!=='bare'?'；法蘭 '+(item.flangeWeight>0?fmt(item.flangeWeight,2)+' kg':'單重待提供'):''}。</p>${item.warnings.map(message=>'<p class="tank-nozzle-warning">'+esc(message)+'</p>').join('')}</div>`:'<p class="tank-note">修正上方管嘴資料後，尺寸圖會更新。</p>';
  }
}
