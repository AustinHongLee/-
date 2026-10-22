const TASKS=[['position','定位與管嘴','同一支，一起做'],['pipe','備料細節','補強與留料'],['flange','法蘭詳設','實測與接合']];
export function nozzleDiagramForField(key){return ['height','radius','angle','host','axisMode','offset'].includes(key)?'position':['od','thickness','projection','inside','end','flangeSize','flangeClass','flangeFacing','construction','neckOD','flangeLength','flangeOD','flangeThickness','weldGap','soSetback'].includes(key)?'section':null;}
export function nozzleTaskForField(key,current='position'){
  if(['projection','inside','end','flangeSize','flangeClass','flangeFacing','flangeMaterial','flangeSpec'].includes(key))return current==='flange'?'flange':'position';
  if(['name','host','kind','height','radius','angle','axisMode','offset','od','thickness'].includes(key))return 'position';
  if(key==='end'||key.startsWith('flange')||['weldGap','soSetback'].includes(key))return 'flange';
  return 'pipe';
}
// Move the existing controls; no duplicated inputs or separate copy of nozzle values.
export function mountNozzleWorkspace(form){
  const $=id=>document.getElementById(id),editor=$('tank-nozzle-editor'),grid=editor.closest('.tank-nozzle-grid'),location=$('tank-nozzle-location'),flange=editor.querySelector('.tank-flange-config');
  const rail=document.createElement('div');rail.className='tank-nozzle-rail';grid.before(rail);rail.append($('tank-nozzle-list'));
  const context=grid.firstElementChild;context.classList.add('tank-nozzle-context');
  const locationCaption=document.createElement('div');locationCaption.className='tank-nozzle-context-caption';locationCaption.innerHTML='<strong id="tank-nozzle-context-title">目前管嘴的位置</strong><button type="button" data-nozzle-task="position">修改位置 ↗</button>';context.prepend(locationCaption);locationCaption.append($('tank-nozzle-3d'));$('tank-nozzle-3d').textContent='看整槽3D ↗';
  const flangeGraphic=document.createElement('div');flangeGraphic.id='tank-nozzle-section';flangeGraphic.hidden=true;location.after(flangeGraphic);flangeGraphic.append($('tank-flange-diagram'),$('tank-flange-effect'));
  const buildAction=document.createElement('button');buildAction.type='button';buildAction.className='tank-nozzle-build-action';buildAction.dataset.nozzleBuild='';buildAction.textContent='接著，在這裡做管嘴 →';location.after(buildAction);
  const memory=document.createElement('p');memory.id='tank-nozzle-position-memory';memory.className='tank-nozzle-position-memory';memory.hidden=true;flangeGraphic.prepend(memory);
  const overview=document.createElement('details');overview.className='tank-nozzle-overview';overview.innerHTML='<summary>全部管嘴的備料合計</summary>';context.append(overview);overview.append($('tank-nozzle-summary'));
  const nav=document.createElement('nav');nav.className='tank-nozzle-task-nav';nav.setAttribute('aria-label','管嘴編輯項目');nav.innerHTML=TASKS.map(([id,label,hint])=>`<button type="button" data-nozzle-task="${id}" aria-pressed="false" aria-controls="tank-nozzle-pane-${id}"><strong>${label}</strong><small>${hint}</small></button>`).join('');editor.querySelector('.tank-part-head').after(nav);
  const compact=matchMedia('(max-width:800px)'),mobileView=document.createElement('details');mobileView.className='tank-nozzle-mobile-view';mobileView.id='tank-nozzle-mobile-view';mobileView.innerHTML='<summary><span id="tank-nozzle-mobile-label">看圖與管料結果</span><span aria-hidden="true">⌄</span></summary>';nav.after(mobileView);
  const panes={};for(const [id] of TASKS){const pane=document.createElement('section');pane.id='tank-nozzle-pane-'+id;pane.dataset.nozzlePane=id;pane.setAttribute('aria-label',TASKS.find(t=>t[0]===id)[1]);panes[id]=pane;editor.append(pane);}
  const label=key=>form.querySelector(`[data-nozzle-field="${key}"]`).closest('label');
  panes.position.append(label('name'),editor.querySelector('.tank-nozzle-kinds'),editor.querySelector('.tank-nozzle-hosts'),$('tank-nozzle-flat-recovery'));
  for(const [task,keys] of [['position',['height','radius','angle']]]){const fields=document.createElement('div');fields.className='tank-fields';fields.dataset.nozzleFields=task;panes[task].append(fields);for(const key of keys)fields.append(label(key));}
  const axis=document.createElement('div');axis.id='tank-nozzle-axis-fields';axis.className='tank-fields';axis.innerHTML='<label>管軸配置<select data-nozzle-field="axisMode"><option value="radial">沿筒身半徑向外</option><option value="parallel">保持方向，平行偏心</option></select></label><label id="tank-nozzle-offset-field">管軸橫向偏心 mm<input data-nozzle-field="offset" type="number" step="any" inputmode="decimal"><small>由 A 端／俯視，方位 0° 時正值在右側；方位角是管軸方向。</small></label>';panes.position.append(axis);
  const construction=document.createElement('div');construction.className='tank-fields';construction.innerHTML='<label class="tank-nozzle-wide">接件構成<select data-nozzle-field="construction"><option value="pipe">直管＋法蘭組焊</option><option value="integral">一體長頸接件（依詳圖）</option></select><small>一體接件保留外形與浸入長，不自動拆算直管下料。</small></label><label id="tank-nozzle-neck-field" hidden>一體接件頸部外徑 mm<input data-nozzle-field="neckOD" type="number" step="any" inputmode="decimal"><small>0＝以接管外徑示意；內部轉接依詳圖。</small></label>';panes.pipe.prepend(construction);
  const build=document.createElement('section');build.id='tank-nozzle-build';build.className='tank-nozzle-build';build.innerHTML='<header><span>接著做這支管嘴</span><h5>管子多大、伸出多長、端部怎麼接？</h5></header><div id="tank-nozzle-build-fields" class="tank-fields"></div><details id="tank-nozzle-custom-pipe" class="tank-details"><summary>實際外徑／非標準管</summary><div class="tank-fields"></div></details><label class="tank-nozzle-follow"><input id="tank-nozzle-follow-flange" type="checkbox">法蘭吋數跟隨管徑（使用尺寸表）</label><p id="tank-nozzle-build-note" class="tank-note"></p><div id="tank-nozzle-quick-ends"></div><details id="tank-nozzle-quick-spec" class="tank-details"><summary>法蘭規格 <strong id="tank-nozzle-quick-spec-title"></strong></summary><div id="tank-nozzle-quick-spec-fields"></div></details><button type="button" class="tank-nozzle-next" data-nozzle-next>再放一支管嘴 ＋</button>';
  panes.position.append(build);
  const preview=document.createElement('button');preview.type='button';preview.className='tank-nozzle-build-preview';preview.dataset.nozzlePreview='';preview.textContent='看管嘴外形 ↗';build.querySelector('header').append(preview);
  const pipeSelect=document.createElement('label');pipeSelect.innerHTML='常用管徑<select id="tank-nozzle-pipe-size" aria-describedby="tank-nozzle-pipe-size-note"></select><small id="tank-nozzle-pipe-size-note">管厚依實際供料填寫；實測外徑可在下方修改。</small>';build.querySelector('#tank-nozzle-build-fields').append(pipeSelect,label('thickness'));build.querySelector('#tank-nozzle-custom-pipe .tank-fields').append(label('od'));
  const shared=document.createElement('div');shared.className='tank-fields tank-nozzle-shared';shared.append(label('projection'),label('inside'));build.querySelector('#tank-nozzle-build-fields').after(shared);
  const ends=flange.querySelector('.tank-flange-choices');$('tank-nozzle-quick-ends').append(ends);
  panes.flange.append(flange);
  const pad=$('tank-nozzle-pad'),other=pad.nextElementSibling;panes.pipe.append($('tank-nozzle-manhole'),pad,other);
  const cut=$('tank-nozzle-cut');context.append(cut);
  // Remove the now empty old field wrapper.
  for(const node of [...editor.children])if(node.classList.contains('tank-fields')&&!node.children.length)node.remove();
  let active='position',diagram='position',onChange=()=>{};
  function showDiagram(next,{open=false}={}){
    diagram=next==='section'?'section':'position';const locating=active==='position'&&diagram==='position';location.hidden=!locating;buildAction.hidden=active!=='position';buildAction.textContent=locating?'接著，在這裡做管嘴 →':'調整這支管嘴的尺寸 →';flangeGraphic.hidden=locating;memory.hidden=active!=='position'||locating;locationCaption.querySelector('[data-nozzle-task]').hidden=locating;
    $('tank-nozzle-context-title').textContent=locating?'目前管嘴的位置':active==='position'?'這支管嘴的組立外形':'從槽壁量到接管端面';
    if(open&&compact.matches&&active==='position')mobileView.open=true;
  }
  function show(task,{focus=false}={}){
    if(!panes[task])return;active=task;grid.dataset.nozzleTask=task;
    for(const [name,pane] of Object.entries(panes))pane.hidden=name!==active;
    for(const button of nav.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.nozzleTask===active));
    shared.hidden=active==='pipe';
    if(active==='flange'){panes.flange.append(shared);flange.querySelector('h5').after(ends);}else{build.querySelector('#tank-nozzle-build-fields').after(shared);$('tank-nozzle-quick-ends').append(ends);}
    if(compact.matches){if(context.parentElement!==mobileView)mobileView.append(context);mobileView.open=active==='position';}else if(context.parentElement!==grid)grid.prepend(context);
    mobileView.hidden=!compact.matches;
    showDiagram(active==='position'?diagram:'section');
    if(focus)nav.querySelector(`[data-nozzle-task="${active}"]`).focus({preventScroll:true});onChange(active);
  }
  form.addEventListener('click',event=>{const button=event.target.closest('[data-nozzle-task]');if(button){if(button.dataset.nozzleTask==='position')diagram='position';show(button.dataset.nozzleTask,{focus:true});}if(event.target.closest('[data-flange-end],[data-flange-class]'))showDiagram('section');});
  form.addEventListener('tank-nozzle-reveal',event=>show(nozzleTaskForField(event.detail.field,active)));
  compact.addEventListener('change',()=>show(active));
  show(active);
  return {show,showDiagram,reveal(key){show(nozzleTaskForField(key,active));const next=nozzleDiagramForField(key);if(next)showDiagram(next);},onChange(callback){onChange=callback;},get current(){return active;},get diagram(){return diagram;}};
}
