// Keep one live form. Changing tasks only reveals controls; it never resets values.
const TASKS=[['size','槽型與尺寸','量尺寸'],['plates','選板與排料','看怎麼拼'],['shell','筒身施工','一步一步做'],['nozzles','管嘴與法蘭','放附件'],['fabrication','支承與分件','看組立／拆料'],['methods','製作工法','調整工法'],['codes','設計條件','補資料']];
export function revealControl(element){
  if(element?.dataset.nozzleField)element.closest('form')?.dispatchEvent(new CustomEvent('tank-nozzle-reveal',{detail:{field:element.dataset.nozzleField}}));
  for(let parent=element?.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
  return element;
}
export function mountTankWorkspace(form){
  const $=id=>document.getElementById(id),results=$('tank-results'),measure=form.querySelector('.tank-measure-grid'),config=form.querySelector('.tank-config');
  let current='size';
  const nav=form.querySelector('.tank-result-tabs');nav.id='tank-task-nav';nav.className='tank-task-nav';nav.setAttribute('aria-label','桶槽工作步驟');
  nav.innerHTML=TASKS.map(([id,label,hint],i)=>`<button type="button" data-panel="${id}" aria-pressed="${id===current}" aria-controls="${id==='shell'?'tank-shell-workspace':'tank-task-'+id}"><span>${i+1}</span><strong>${label}<small>${hint}</small></strong></button>`).join('');form.prepend(nav);
  const sizes=document.createElement('section');sizes.id='tank-task-size';sizes.className='tank-size-workspace';sizes.setAttribute('aria-label','槽型與尺寸');nav.after(sizes);sizes.append(measure);
  const shape=document.createElement('details');shape.id='tank-shape-picker';shape.className='tank-shape-picker';shape.innerHTML='<summary><span>槽型</span><strong id="tank-shape-current"></strong><span class="tank-change-label">更換／細節</span></summary>';shape.append(config);measure.querySelector('.tank-size-card').prepend(shape);
  const drawingLink=document.createElement('button');drawingLink.type='button';drawingLink.id='tank-open-drawing';drawingLink.className='tank-secondary';drawingLink.textContent='看尺寸圖 ↓';measure.querySelector('.tank-size-card > h2').append(drawingLink);
  $('tank-material-settings').open=false;
  const summary=document.createElement('div'),totals=document.createElement('details');summary.className='tank-estimate-summary';totals.className='tank-details tank-construction-totals';totals.innerHTML='<summary>尺寸、重量與用料摘要</summary>';totals.append($('tank-totals'));summary.append(results.querySelector('.tank-section-heading'),totals);results.prepend(summary);
  const shell=document.createElement('section');shell.id='tank-shell-workspace';shell.className='tank-card tank-shell';shell.dataset.tankPanel='shell';shell.hidden=true;results.append(shell);
  for(const pane of form.querySelectorAll('[data-tank-panel]'))pane.id=pane.dataset.tankPanel==='shell'?'tank-shell-workspace':'tank-task-'+pane.dataset.tankPanel;
  // Long lists are references, rather than prerequisites for choosing a board.
  const plates=form.querySelector('[data-tank-panel="plates"]');
  const details=document.createElement('details');details.className='tank-details tank-cut-list';details.innerHTML='<summary>逐片下料尺寸與原板座標</summary>';plates.querySelector('.tank-parts-heading').before(details);details.append(plates.querySelector('.tank-parts-heading'),$('tank-parts'),$('tank-sheets'));
  // Construction is the main task. Purchasing remains an optional reference with the same project data.
  const assembly=$('tank-assembly'),settings=document.createElement('details'),aux=document.createElement('details'),boardDefaults=plates.querySelector('.tank-stock-custom'),boardNote=boardDefaults.nextElementSibling;
  settings.id='tank-construction-settings';settings.className='tank-details tank-construction-settings';settings.innerHTML='<summary>調整板型、分片與刀縫</summary><p class="tank-note">板型會影響下料尺寸、分圈與接縫；不同材料組可分別設定。</p>';
  settings.append(plates.querySelector('.tank-layout-options'),boardDefaults,plates.querySelector('.stock-legacy'),$('tank-stock-ledger'),$('tank-stock-usage'));if(boardNote?.tagName==='P')settings.append(boardNote);
  aux.id='tank-stock-aux';aux.className='tank-details tank-construction-aux';aux.innerHTML='<summary>輔助：餘板、裁切料與報價</summary><p class="tank-note">需要比較現有料或報價時再展開，施工尺寸與組立圖仍在上方。</p><label class="tank-construction-print-option"><input id="tank-print-quotes" type="checkbox">估料單附材料報價與比價頁</label>';aux.append($('tank-stock-supply'));
  const diagrams=document.createElement('div'),source=document.createElement('aside');diagrams.className='tank-construction-diagrams';source.id='tank-construction-sheet';source.className='tank-construction-source';source.setAttribute('aria-label','所選板片的原板來源');$('tank-assembly-sketch').before(diagrams);diagrams.append($('tank-assembly-sketch'),source);
  const actions=document.createElement('div');actions.className='tank-construction-actions';actions.setAttribute('role','group');actions.setAttribute('aria-label','接著看施工內容');actions.innerHTML='<button type="button" data-panel="shell">筒身施工圖解 →</button><button type="button" data-construction-settings>調整板型／分片</button><button type="button" data-construction-method="welding">焊道與坡口設定 →</button><button type="button" data-panel="fabrication">分件與接合 →</button>';assembly.append(actions);
  const heading=plates.querySelector('h3');heading.after($('tank-material-issues'),assembly,details,settings,aux);
  // The nozzle editor mounts its own position / pipe / flange task panes.
  const methodList=$('tank-method-list'),methodPicker=document.createElement('details'),compact=matchMedia('(max-width:900px)');
  methodPicker.className='tank-method-picker';methodPicker.innerHTML='<summary>工法部位 <strong id="tank-method-current">筒身捲板</strong><span>更換 ⌄</span></summary>';methodList.before(methodPicker);methodPicker.append(methodList);methodPicker.open=!compact.matches;
  compact.addEventListener('change',()=>{methodPicker.open=!compact.matches;});
  form.addEventListener('click',event=>{if(compact.matches&&event.target.closest('[data-method-select]'))methodPicker.open=false;});
  const visual=$('tank-method-visual'),zoom=document.createElement('div');zoom.className='tank-method-zoom';zoom.setAttribute('role','group');zoom.setAttribute('aria-label','工法圖面大小');zoom.innerHTML='<button type="button" data-method-zoom="fit" aria-pressed="true">看完整圖</button><button type="button" data-method-zoom="detail" aria-pressed="false">放大看細節</button><span>放大後可左右移動</span>';visual.before(zoom);visual.dataset.zoom='fit';
  zoom.addEventListener('click',event=>{const b=event.target.closest('[data-method-zoom]');if(!b)return;visual.dataset.zoom=b.dataset.methodZoom;for(const button of zoom.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button===b));});
  const footer=document.createElement('nav');footer.className='tank-task-footer';footer.setAttribute('aria-label','接續操作');footer.innerHTML='<button type="button" data-tank-previous></button><span></span><button type="button" class="workbench-button" data-tank-next></button>';form.append(footer);
  function keepCurrentVisible(){const b=nav.querySelector('[aria-current="step"]');if(!b||nav.scrollWidth<=nav.clientWidth)return;const delta=b.getBoundingClientRect().left-nav.getBoundingClientRect().left;if(delta<0)nav.scrollLeft+=delta;else if(delta+b.offsetWidth>nav.clientWidth)nav.scrollLeft+=delta+b.offsetWidth-nav.clientWidth;}
  window.addEventListener('resize',()=>requestAnimationFrame(keepCurrentVisible));
  function show(name,{scroll=false}={}){
    if(!TASKS.some(([id])=>id===name))return;
    current=name;form.dataset.tankTask=name;sizes.hidden=name!=='size';results.hidden=name==='size';summary.hidden=name!=='plates';
    for(const pane of form.querySelectorAll('[data-tank-panel]'))pane.hidden=pane.dataset.tankPanel!==name;
    for(const b of nav.querySelectorAll('[data-panel]')){const active=b.dataset.panel===name;b.setAttribute('aria-pressed',String(active));if(active)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');}
    keepCurrentVisible();
    const i=TASKS.findIndex(([id])=>id===name),previous=footer.querySelector('[data-tank-previous]'),next=footer.querySelector('[data-tank-next]');
    results.removeAttribute('aria-labelledby');results.setAttribute('aria-label',TASKS[i][1]);
    previous.hidden=i===0;previous.textContent=i?`← ${TASKS[i-1][1]}`:'';next.textContent=i===TASKS.length-1?'回到選板與估料單':`接著：${TASKS[i+1][1]} →`;footer.querySelector('span').textContent=`${i+1} / ${TASKS.length}`;
    form.dispatchEvent(new CustomEvent('tank-task-change'));
    if(scroll)nav.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
  }
  footer.addEventListener('click',event=>{const i=TASKS.findIndex(([id])=>id===current);if(event.target.closest('[data-tank-previous]'))show(TASKS[Math.max(0,i-1)][0],{scroll:true});if(event.target.closest('[data-tank-next]'))show(TASKS[i===TASKS.length-1?1:i+1][0],{scroll:true});});
  function reveal(element){if(!element)return;show(element.closest('[data-tank-panel]')?.dataset.tankPanel??'size');revealControl(element);}
  function sync(){const text=$('tank-config-label').textContent;$('tank-shape-current').textContent=text;}
  show(current);return {show,reveal,sync,get current(){return current;}};
}
