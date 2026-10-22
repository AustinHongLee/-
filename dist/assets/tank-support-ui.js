import {tankDrawingModel} from './tank-drawing-model.js';
import {supportDrawingSheet} from './tank-support-drawing.js';
import {esc,fmt} from './tank-visuals.js';

export class TankSupportUI{
  constructor({root,onEdit,onUpgrade,onUndo,onLoad,onRegistry,onPrint,onDrawing}){
    Object.assign(this,{root,onEdit,onUpgrade,onUndo,onLoad,onRegistry,onPrint,onDrawing,view:'3d',group:'parts',selected:'P4',active:false,viewer:null,loading:null,lastRevision:null});
    root.innerHTML=`<header class="support-heading"><div><span class="support-eyebrow">SUPPORT FABRICATION</span><h2>支承，放在哪裡、怎麼做</h2><p>修改目前專案，圖面、板料與接合資料一起更新。</p></div><div class="support-exports"><button type="button" data-support-action="print" class="support-primary">列印支承加工單</button><button type="button" data-support-action="drawing">下載目前支承圖</button></div></header><div class="support-update"></div><div class="support-empty"></div><div class="support-live"><div class="support-context"><span class="support-revision"></span><span class="support-provenance"></span></div><nav class="support-views" aria-label="支承施工視圖"><button type="button" data-support-view="3d">支承 3D</button><button type="button" data-support-view="drawing">底板與焊接位置</button><button type="button" data-support-view="roll">展開與成形比較</button></nav><div class="support-grid"><div class="support-picture"><div class="support-canvas"></div><div class="support-svg" hidden></div><div class="support-camera"><button type="button" data-support-action="reset">置中</button><button type="button" data-support-action="zoom" hidden>放大圖紙</button><span>拖曳旋轉 · 滾輪／雙指縮放</span></div><p class="support-legend">灰色線框：異形板輪廓待核。黃虛線：接合區，實際焊道範圍依詳圖。</p></div><section class="support-editor"><div class="support-groups"><button type="button" data-support-group="parts">板件</button><button type="button" data-support-group="welds">焊接區</button></div><div class="support-items"></div><div class="support-fields"></div></section></div><details class="support-layout"><summary>支承位置與孔列基準</summary><div class="support-layout-fields"></div></details><details class="support-missing"><summary>這份支承還缺哪些資料？</summary><ul></ul></details></div>`;
    this.$=s=>root.querySelector(s);
    for(const event of ['input','change'])root.addEventListener(event,e=>{
      const bind=e.target.dataset.supportBind;if(!bind)return;e.stopPropagation();const [kind,id,key]=bind.split('|'),value=e.target.type==='number'?(e.target.value===''?null:e.target.value):e.target.value;
      const row=kind==='layout'?this.assembly?.supportLayout:this.assembly?.[kind==='part'?'parts':'welds'].find(p=>p.id===id),current=kind==='layout'&&['stationA','stationB'].includes(key)?row?.stations[key==='stationA'?0:1]:row?.[key];
      if(String(current??'')!==String(value??''))this.onEdit({kind,id,key,value});
    });
    root.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;e.stopPropagation();
      if(b.dataset.supportView){this.view=b.dataset.supportView;this.paintView();}
      else if(b.dataset.supportGroup){this.group=b.dataset.supportGroup;this.selected=this.group==='welds'?'W1':'P4';this.paintEditor();}
      else if(b.dataset.supportSelect){this.selected=b.dataset.supportSelect;this.paintEditor();this.viewer?.selectDrawing(this.assembly.id+'.'+this.selected);}
      else if(b.dataset.supportFix)this.fix(b.dataset.supportFix);
      else{const action=b.dataset.supportAction;if(action==='print')this.onPrint();else if(action==='drawing')this.onDrawing(this.view==='roll'?2:1);else if(action==='reset')this.viewer?.reset();else if(action==='zoom'){const zoom=this.$('.support-svg').classList.toggle('zoomed');b.textContent=zoom?'適合畫面':'放大圖紙';}else if(action==='upgrade')this.onUpgrade();else if(action==='undo')this.onUndo();else if(action==='load')this.onLoad();else if(action==='registry')this.onRegistry(this.assembly?.id,this.group==='welds'?'welds':'parts',this.selected);}
    });
  }
  field(kind,id,key,label,value,{options=null,readonly=false}={}){
    const bind=[kind,id,key].join('|');return `<label>${esc(label)}${options?`<select data-support-bind="${bind}">${options.map(([v,t])=>`<option value="${v}"${String(value??'')===String(v)?' selected':''}>${esc(t)}</option>`).join('')}</select>`:`<input data-support-bind="${bind}" type="${key==='wps'?'text':'number'}" step="any" ${readonly?'readonly':''} value="${esc(value??'')}" placeholder="未知留空" ${key==='wps'?'maxlength="160"':'inputmode="decimal"'}>`}</label>`;
  }
  setActive(value){this.active=value;this.viewer?.setActive(value&&this.view==='3d'&&!!this.model?.support);if(value&&this.view==='3d')this.ensureViewer();}
  async ensureViewer(){
    if(!this.active||this.view!=='3d'||!this.model?.support)return;
    if(!this.viewer&&!this.loading){this.$('.support-canvas').textContent='正在準備支承 3D…';this.loading=import('./tank-viewer.js').then(({TankViewer})=>{this.viewer=new TankViewer(this.$('.support-canvas'),id=>{const p=this.model.support.parts.find(p=>p.id===id);if(p){this.group='parts';this.selected=p.bomId.split('.').at(-1);this.paintEditor();this.viewer.selectDrawing(id);}});}).catch(()=>{this.$('.support-canvas').textContent='3D暫時無法載入，請切換視圖後重試；尺寸與圖紙仍可操作。';}).finally(()=>{this.loading=null;});}
    if(this.loading)await this.loading;
    if(this.viewer&&this.model?.support){if(this.lastRevision!==this.model.revision){this.viewer.update(this.result);this.viewer.setSupportFocus(true);this.lastRevision=this.model.revision;}this.viewer.resize();this.viewer.setActive(this.active&&this.view==='3d');}
  }
  render(result,{updated=false,canUndo=false}={}){
    this.result=result;this.model=tankDrawingModel(result);this.assembly=result?.fabricationPlan?.data.assemblies.find(a=>a.target==='support');const reference=result?.input.referenceCase==='v1102-drawing-study',p=this.assembly?.supportLayout?this.model?.support:null;
    this.$('.support-update').innerHTML=updated?`<p>已更新這份專案的支承資料；其他分件與尺寸保留。${canUndo?'<button type="button" data-support-action="undo">復原這次支承更新</button>':''}</p>`:'';
    this.$('.support-empty').hidden=!!p;this.$('.support-live').hidden=!p;
    for(const b of this.root.querySelectorAll('[data-support-action="print"],[data-support-action="drawing"]'))b.disabled=!p||result?.fabrication?.valid===false;
    if(!p){
      this.viewer?.setActive(false);const seen=new Set(),issues=(result?.fabricationPlan?.issues??[]).filter(i=>{const key=i.field+'|'+i.message;if(!i.field.includes(this.assembly?.id+'.')||seen.has(key))return false;seen.add(key);return true;});
      this.$('.support-empty').innerHTML=issues.length?`<h3>先修正支承設定</h3><ul>${issues.map(i=>`<li>${esc(i.message)} <button type="button" data-support-fix="${esc(i.field)}">前往修正</button></li>`).join('')}</ul>`:reference?`<h3>這份專案仍使用舊支承，或已自行調整拆件</h3><p>新版會把圓孔／長孔底板分開，修正110腳底寬、帶入7/7全周角焊，並加入可修改的支承位置與成形角。其他分件、槽體與管嘴保留。</p><button type="button" data-support-action="upgrade" class="support-primary">用原圖更新這組支承</button>`:`<h3>${this.assembly?'此組支承目前由分件表管理':'目前專案尚未建立支承配置'}</h3><p>可繼續編輯分件，或開啟V-1102範例查看兩組鞍座的施工流程。</p><button type="button" data-support-action="registry">開啟分件表</button><button type="button" data-support-action="load">開啟 V-1102 範例</button>`;
      if(this.assembly?.supportLayout){this.$('.support-live').hidden=false;this.$('.support-picture').hidden=true;this.paintEditor();this.paintLayout();}
      return;
    }
    this.$('.support-picture').hidden=false;this.$('.support-revision').textContent=this.model.revision;
    this.$('.support-provenance').textContent=p.sourceDiff.length?'已修改 '+p.sourceDiff.length+' 項，以目前專案值出圖':'使用目前專案的支承尺寸';
    this.$('.support-missing ul').innerHTML=p.pending.map(item=>`<li><strong>${esc(item.id)}</strong> ${esc(item.text)}</li>`).join('');
    this.paintEditor();this.paintLayout();this.paintView();
  }
  paintEditor(){
    const a=this.assembly;if(!a)return;const rows=this.group==='parts'?a.parts.filter(p=>p.id!=='P5'):a.welds;
    if(!rows.some(p=>p.id===this.selected))this.selected=rows[0]?.id;
    for(const b of this.root.querySelectorAll('[data-support-group]'))b.setAttribute('aria-pressed',String(b.dataset.supportGroup===this.group));
    const listKey=this.group+':'+rows.map(p=>p.id).join(',');if(this.listKey!==listKey){this.listKey=listKey;this.$('.support-items').innerHTML=rows.map(p=>`<button type="button" data-support-select="${p.id}" aria-pressed="${p.id===this.selected}">${esc(a.id+'.'+p.id)}<small>${esc(this.group==='welds'?p.a+' → '+p.b:p.name)}</small></button>`).join('');}for(const b of this.root.querySelectorAll('[data-support-select]'))b.setAttribute('aria-pressed',String(b.dataset.supportSelect===this.selected));
    const p=rows.find(p=>p.id===this.selected);if(!p)return;const field=(key,label,opts={})=>this.field(this.group==='parts'?'part':'weld',p.id,key,label,p[key],opts);
    let fields='',info='';
    if(this.group==='parts'){
      const b=this.result.fabricationPlan.parts.find(x=>x.id===a.id+'.'+p.id);
      const keys=p.id==='P4'?[['length','先備展開長 mm'],['width','板寬 mm'],['thickness','板厚 mm']]:['P1','P6'].includes(p.id)?[['length','底板長 mm'],['width','底板寬 mm'],['thickness','板厚 mm'],['holeDiameter','孔徑／孔寬 mm'],...(p.id==='P6'?[['slotLength','長孔總長 mm']]:[])]:p.id==='P2'?[['thickness','承板板厚 mm'],['eachKg','確認的成品單重 kg']]:[['width','腳底軸向寬 mm'],['thickness','板厚 mm'],['eachKg','確認的成品單重 kg']];
      fields=keys.map(([k,l])=>field(k,l)).join('');
      if(p.id==='P4'&&a.supportLayout){fields+=this.field('layout','','formedAngle','成形角 °',a.supportLayout.formedAngle);const f=this.model?.support?.formed;if(f)info=`<div class="support-calculation"><span>依目前尺寸推導</span><strong>中面弧長 ${fmt(f.formedLength,3)} mm</strong><p>先備差 ${fmt(f.delta,3)} mm；外弧 ${fmt(f.outsideLength,3)} mm。差值處理待核，不能直接當修邊量。</p></div>`;}
      info+=`<p class="support-part-mass">${p.qty} 件 · ${b?.weight===null?'重量待核':fmt(b?.weight??0,3)+' kg'+(p.weightBasis==='blank'?'（先備板，成品淨重待核）':'（已計成品）')}</p><details class="support-source-note"><summary>原圖／分件註記</summary><p class="support-help">${esc(p.note||p.spec)}</p></details>`;
    }else{
      const w=this.result.fabricationPlan.welds.find(x=>x.id===a.id+'.'+p.id);fields=field('size',p.kind==='fillet'?'角焊腳長 mm':'接頭厚度 mm')+field('qty','相同接合數')+field('measure','焊長方式',{options:[['perimeter','依B側腳底寬與厚算全周'],['manual','填單道中心線長'],['circumference','依指定直徑算一整圈']]});
      if(p.measure!=='perimeter')fields+=field(p.measure==='circumference'?'diameter':'length',p.measure==='circumference'?'中心線直徑 mm':'單道長度 mm');fields+=field('wps','WPS／詳圖索引');
      info=`<div class="support-calculation"><span>${p.measure==='perimeter'?'由腳底尺寸即時計算':'依登錄方式計算'}</span><strong>${w?.length===null?'焊長待填':'名目總長 '+fmt(w?.length??0,3)+' mm'}</strong></div><details class="support-source-note"><summary>原圖／接合註記</summary><p class="support-help">${esc(p.note)}</p></details>`;
    }
    const editorKey=this.group+':'+p.id+':'+p.kind+':'+(p.measure??''),title=a.id+'.'+p.id+' '+(p.name||'接合區');
    if(this.editorKey!==editorKey){this.editorKey=editorKey;this.$('.support-fields').innerHTML=`<h3>${esc(title)}</h3><div class="support-field-grid">${fields}</div><div class="support-info">${info}</div><button type="button" data-support-action="registry" class="support-registry-link">在完整分件表修改材質／接合 →</button>`;}
    else{this.$('.support-fields h3').textContent=title;this.patchFields(this.$('.support-fields .support-field-grid'),fields);this.$('.support-info').innerHTML=info;}

  }
  paintLayout(){
    const a=this.assembly,g=a?.supportLayout;if(!g){this.$('.support-layout').hidden=true;return;}this.$('.support-layout').hidden=false;
    const field=(key,label,opts={})=>this.field('layout','',key,label,g[key],opts);
    this.patchFields(this.$('.support-layout-fields'),`<div class="support-field-grid">${this.field('layout','','stationA','A組中心距A端TL mm',g.stations[0])}${this.field('layout','','stationB','B組中心距A端TL mm',g.stations[1])}${field('axisToBase','槽軸至板底 mm')}${field('span','支承跨距 mm')}${field('spanDatum','跨距量哪裡？',{options:[['pending','原圖尺寸面待核'],['centres','兩腳板中心'],['outside','兩腳板外側'],['inside','兩腳板內側']]})}${field('holePitch','兩孔中心距 mm')}${field('holeAxialOffset','孔列距支承中心（沿槽軸）mm')}${field('contactAngle','鞍座接觸角 °')}</div><p class="support-help">孔列偏置未知留空；確認為中心才填0。填入後3D才建立實際孔。跨距尺寸面與異形輪廓仍依詳圖核對。</p>`);
  }
  fix(field){
    const parts=field.split('.'),local=parts[2],key=parts.at(-1);
    if(local==='supportLayout'){
      if(key==='formedAngle'){this.group='parts';this.selected='P4';this.paintEditor();}
      this.$('.support-layout').open=true;this.paintLayout();const bind=key==='formedAngle'?'layout||formedAngle':'layout||'+(key==='stations'?'stationB':key),el=[...this.root.querySelectorAll('[data-support-bind]')].find(el=>el.dataset.supportBind===bind)??this.$('.support-layout input');el?.focus();el?.scrollIntoView({block:'center'});
    }else{
      this.group=this.assembly.welds.some(w=>w.id===local)?'welds':'parts';this.selected=local;this.paintEditor();const bind=[this.group==='welds'?'weld':'part',local,key].join('|'),el=[...this.root.querySelectorAll('[data-support-bind]')].find(el=>el.dataset.supportBind===bind);if(el){el.focus();el.scrollIntoView({block:'center'});}else this.onRegistry(this.assembly.id,this.group,local);
    }
  }
  patchFields(host,html){
    const buffer=document.createElement('div');buffer.innerHTML=html;const previous=[...host.querySelectorAll('[data-support-bind]')],next=[...buffer.querySelectorAll('[data-support-bind]')];
    if(previous.length!==next.length||previous.some((el,i)=>el.dataset.supportBind!==next[i].dataset.supportBind)){host.innerHTML=html;return;}
    for(let i=0;i<next.length;i++)if(document.activeElement!==previous[i])previous[i].value=next[i].value;
  }
  paintView(){
    for(const b of this.root.querySelectorAll('[data-support-view]'))b.setAttribute('aria-pressed',String(b.dataset.supportView===this.view));
    const is3D=this.view==='3d';this.$('.support-canvas').hidden=!is3D;this.$('.support-svg').hidden=is3D;this.$('[data-support-action="reset"]').hidden=!is3D;this.$('[data-support-action="zoom"]').hidden=is3D;this.$('.support-camera span').textContent=is3D?'拖曳旋轉 · 滾輪／雙指縮放':'目前專案的向量圖；放大後可左右移動';
    if(this.model?.support&&!is3D)this.$('.support-svg').innerHTML=supportDrawingSheet(this.result,this.view==='roll'?2:1);
    this.viewer?.setActive(this.active&&is3D&&!!this.model?.support);if(is3D)this.ensureViewer();
  }
}
