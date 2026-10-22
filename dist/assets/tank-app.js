import {TankSeamEditor} from './tank-seam-editor.js';
import {TankShellLayoutUI} from './tank-shell-layout-ui.js';
import {shellPiecePart,shellBatchLabel,shellCourses} from './tank-shell-layout.js';
import {mountDraftPersistence} from './project-persistence.js';
import {createTankExampleSession} from './tank-example-session.js';
import {mountTankWorkspace,revealControl} from './tank-workspace.js';
import {TankStockSupplyUI} from './tank-stock-supply-ui.js';
import {TankShellUI} from './tank-shell-ui.js';
import {TankSupportUI} from './tank-support-ui.js';
import {migrateV1102Support,replaceV1102Support,editSupport} from './tank-support-project.js';
import {supportDrawingSheet} from './tank-support-drawing.js';
import {shellWorkOrder,shellDrawingSheet} from './tank-shell-report.js';
import {stockPurchaseMarkup} from './tank-stock-purchase-ui.js';
import {compareMaterialStocks,applyStockRecommendations} from './tank-stock-comparison.js';
import {TANK_STOCKS,selectStockGroup,selectStockDimensions} from './tank-stock-config.js';
import {stockSummaryMarkup,stockStatusText} from './tank-stock-report.js';
import {placementLabel} from './tank-stock-plan.js';
import {TANK_DEFAULTS,fieldLabel,tankEnds,TOP_NAMES,BOTTOM_NAMES} from './tank-geometry.js';
import {TOP_ENDS,BOTTOM_ENDS,HORIZONTAL_ENDS,FORMED_ENDS,BUTT_ENDS,END_LABELS} from './tank-heads.js';
import {TankMethodUI} from './tank-method-ui.js';
import {TankFabricationUI} from './tank-fabrication-ui.js';
import {methodCatalog} from './tank-methods.js';
import {endGlyph} from './tank-method-visuals.js';
import {estimateTank,stockPreset,stockLabel,shellLayoutLabel} from './tank-materials.js';
import {tankCodeGuide,CODE_SOURCES} from './tank-codes.js';
import {tankProject,readTankProject,tankCSV,tankWorkOrder,tankFabricationWorkOrder,tankSupportWorkOrder} from './tank-exports.js';
import {esc,fmt,tankSketch,rollSketch,sheetSketch,assemblySketch,pieceColor,totalsMarkup} from './tank-visuals.js';
import {TankNozzleUI} from './tank-nozzle-ui.js';
import {TankSeamUI} from './tank-seam-ui.js';
import {seamClearancePending} from './tank-seam-settings.js';
import {nozzleIssueKey} from './tank-nozzles.js';
import {mountWorkbenchStatus} from './workbench-status.js';
import {V1102_ID,createV1102Input,v1102ReviewMarkup} from './tank-reference-v1102.js';
import {tankGeneralArrangement} from './tank-ga-drawing.js';
import {v1102Fabrication} from './tank-v1102-fabrication.js';
const $=id=>document.getElementById(id),form=$('tank-inputs'),key='special-method-tank-v1';
const workspace=mountTankWorkspace(form);
const projectDraft=mountDraftPersistence({key,name:'桶槽專案'});
let exampleStorage;try{exampleStorage=window.sessionStorage;}catch{exampleStorage={getItem(){return null;},setItem(){throw new Error('無法保留原專案，請先下載專案備份。');},removeItem(){}};}
const exampleSession=createTankExampleSession(exampleStorage,key+':practice');
let solve='volume',result=null,view='dimensions',viewer=null,viewerPromise=null,spin=false,transparent=false,labelsVisible=false,order='',toastTimer,selectedPiece='S1',selectedStockGroup='',selectedStockPart='',nozzleHighlighted=null,referenceCase='',appliedInput={},supportUndo=null,supportUpdated=false;
$('tank-reset').insertAdjacentHTML('beforebegin','<button type="button" id="tank-labels" aria-pressed="false">板號／焊道</button>');
$('tank-viewer').closest('.tank-scene-card').insertAdjacentHTML('afterbegin','<div id="tank-example-scene-head" class="tank-example-scene-head" hidden><div><strong>V-1102 整槽範本</strong><small>內徑650 × 直段1100 mm · 12個管嘴 · 2組支承</small></div><button type="button" data-example-return>回到我的專案</button></div>');
$('tank-3d-area').insertAdjacentHTML('beforeend','<aside id="tank-example-guide" class="tank-example-guide" hidden><strong>看懂整顆，再挑一個部位試試</strong><div><button type="button" data-example-task="shell">① 筒身怎麼做</button><button type="button" data-example-task="nozzles">② 12 個管嘴與法蘭</button><button type="button" data-example-task="fabrication">③ 兩組支承與焊接區</button></div><p>拖曳看背面、滾輪或雙指縮放；需要對照零件時，再開啟「板號／焊道」。</p></aside>');
form.addEventListener('tank-task-change',()=>{viewer?.setActive(view==='3d'&&workspace.current==='size'&&!!result?.valid);shellUI?.setActive(workspace.current==='shell');supportUI?.setActive(workspace.current==='fabrication');seamEditor?.setActive(workspace.current==='plates');});
const control=name=>form.querySelector(`[name="${name}"]`);
const nozzleUI=new TankNozzleUI({form,onChange:render,onSelect:id=>{nozzleHighlighted=id;if(id)panel('nozzles');if(result?.valid)renderAssembly();viewer?.setNozzleSelected(id);},onShape:()=>{setConfig({...currentConfig(),top:'flat'});render();},on3D:async()=>{nozzleHighlighted=nozzleUI.selected;if(result?.valid)renderAssembly();await setView('3d');viewer?.setNozzleSelected(nozzleHighlighted);$('tank-3d-area').scrollIntoView({behavior:'smooth',block:'center'});}});
const methodUI=new TankMethodUI({form,onChange:render,openPanel:name=>{panel(name);document.querySelector(`[data-tank-panel="${name}"]`)?.scrollIntoView({behavior:'smooth',block:'start'});}});
const fabricationUI=new TankFabricationUI({root:$('tank-fabrication-workspace'),onChange:render,onStock:openStockPart,onPrint:()=>{try{order=tankFabricationWorkOrder(result,{includeQuotes:$('tank-print-quotes').checked});$('tank-print-frame').srcdoc=order;$('tank-print-preview').showModal();}catch(error){toast(error.message);}}});
const supplyUI=new TankStockSupplyUI({root:$('tank-stock-supply'),onChange:render,onApply:patch=>{appliedInput.stockSelections=patch.stockSelections;render();},notify:toast});
const seamUI=new TankSeamUI({root:$('tank-seam-workspace'),onChange:render,notify:toast});
$('tank-seam-workspace').insertAdjacentHTML('afterend','<div id="tank-shell-layout-workspace"></div>');
const shellLayoutUI=new TankShellLayoutUI({root:$('tank-shell-layout-workspace'),notify:toast,onApply:patch=>{Object.assign(appliedInput,patch);if(patch.seamStart!==undefined)control('seamStart').value=patch.seamStart;seamUI.undo=null;render();}});
const seamEditor=new TankSeamEditor({root:$('tank-assembly-sketch'),notify:toast,rules:()=>Object.fromEntries([...$('tank-shell-layout-workspace').querySelectorAll('[data-layout-min]')].map(el=>[el.dataset.layoutMin,el.value.trim()===''?NaN:Number(el.value)])),onSettings:()=>{seamEditor.editing=false;seamEditor.render(result);shellLayoutUI.focus();},onChange:(plan,{live=false}={})=>{appliedInput.shellLayoutPlan=plan;seamUI.undo=null;render({liveSeam:live});}});
const shellUI=new TankShellUI({root:$('tank-shell-workspace'),onChange:render,onSelect:id=>selectPiece(id),onPrint:()=>{try{order=shellWorkOrder(result,selectedPiece);$('tank-print-frame').srcdoc=order;$('tank-print-preview').showModal();}catch(error){toast(error.message);}},onDrawing:()=>{try{download(shellDrawingSheet(result,selectedPiece),'image/svg+xml;charset=utf-8','筒身施工圖草稿.svg');}catch(error){toast(error.message);}},onSettings:step=>{panel('methods');methodUI.select(['fit','weld'].includes(step)?'welding':'shell');},notify:toast});
const supportUI=new TankSupportUI({root:$('tank-support-workspace'),onEdit:patch=>{fabricationUI.apply(editSupport(fabricationUI.values(),patch));render();},onUpgrade:()=>{
  try{const current=fabricationUI.values(),index=current.assemblies.findIndex(a=>a.target==='support'),updated=replaceV1102Support(current);supportUndo={previous:updated.previous,index};supportUpdated=true;fabricationUI.apply(updated.data);render();panel('fabrication');toast('已更新目前專案的支承；其他分件保留，尺寸與加工單同步重算。');}catch(error){toast(error.message);}
},onUndo:()=>{if(!supportUndo)return;const data=fabricationUI.values();data.assemblies=data.assemblies.filter(a=>a.target!=='support');if(supportUndo.previous)data.assemblies.splice(Math.max(0,supportUndo.index),0,supportUndo.previous);supportUndo=null;supportUpdated=false;fabricationUI.apply(data);render();toast('已復原支承更新，其他分件保留。');},onLoad:()=>openTankExample('fabrication'),onRegistry:(a,tab,id)=>{
  $('tank-fabrication-details').open=true;fabricationUI.selected=a||fabricationUI.selected;fabricationUI.tab=tab||'parts';if(tab==='welds')fabricationUI.weld=id;else fabricationUI.part=id;fabricationUI.render(result);$('tank-fabrication-details').scrollIntoView({block:'start',behavior:'smooth'});
},onPrint:()=>{try{order=tankSupportWorkOrder(result);$('tank-print-frame').srcdoc=order;$('tank-print-preview').showModal();}catch(error){toast(error.message);}},onDrawing:page=>{try{download(supportDrawingSheet(result,page),'image/svg+xml;charset=utf-8','目前專案-支承施工圖'+page+'.svg');}catch(error){toast(error.message);}}});
// Tank configuration: orientation + end types are hidden inputs; the three original presets keep their own shape ids.
const LEGACY={open:['vertical','open','flat'],flat:['vertical','flat','flat'],elliptical:['vertical','elliptical','elliptical']};
function currentConfig(){return tankEnds({shape:control('shape').value,orientation:control('orientation').value,top:control('top').value,bottom:control('bottom').value});}
function setConfig({orientation,top,bottom}){let shape='custom';for(const [id,[o,t,b]] of Object.entries(LEGACY))if(o===orientation&&t===top&&b===bottom)shape=id;control('shape').value=shape;control('orientation').value=orientation;control('top').value=top;control('bottom').value=bottom;}
function renderConfig(){
  const e=currentConfig(),horizontal=e.orientation==='horizontal',same=$('tank-same-ends').checked;
  for(const b of form.querySelectorAll('[data-orientation]'))b.setAttribute('aria-pressed',String(b.dataset.orientation===e.orientation));
  const chips=(which,list,names)=>list.map(type=>`<button type="button" data-end="${which}" data-value="${type}" aria-pressed="${e[which]===type}">${endGlyph(type,{position:which})}<span>${names[type]??END_LABELS[type]}</span></button>`).join('');
  $('tank-top-label').textContent=horizontal?'B 端':'上端';$('tank-bottom-label').textContent=horizontal?'A 端':'下端';
  $('tank-top-choices').innerHTML=chips('top',horizontal?HORIZONTAL_ENDS:TOP_ENDS,horizontal?END_LABELS:TOP_NAMES);$('tank-bottom-choices').innerHTML=chips('bottom',horizontal?HORIZONTAL_ENDS:BOTTOM_ENDS,horizontal?END_LABELS:BOTTOM_NAMES);
  $('tank-same-ends-field').hidden=!horizontal;$('tank-top-choices').closest('.tank-end-row').hidden=horizontal&&same;$('tank-bottom-label').textContent=horizontal?(same?'兩端':'A 端'):'下端';
  const ends=[e.top,e.bottom],show={topAngle:e.top==='cone',topSmall:e.top==='cone',bottomAngle:e.bottom==='cone',bottomSmall:e.bottom==='cone',toriPreset:ends.includes('torispherical'),toriCrown:ends.includes('torispherical')&&control('toriPreset').value==='custom',toriKnuckle:ends.includes('torispherical')&&control('toriPreset').value==='custom',domeRatio:e.top==='dome',topThickness:e.top!=='open',overhang:ends.includes('flat'),headStraight:ends.some(t=>FORMED_ENDS.includes(t)),headGap:ends.some(t=>BUTT_ENDS.includes(t))};
  for(const el of form.querySelectorAll('[data-end-param]'))el.hidden=!show[el.dataset.endParam];
  $('tank-head-supplier').hidden=!ends.some(t=>FORMED_ENDS.includes(t));
  const word={top:horizontal?'B 端':'頂部',bottom:horizontal?'A 端':'底部'};
  for(const el of form.querySelectorAll('[data-end-text]')){const key=el.dataset.endText,which=key.startsWith('top')?'top':'bottom';el.textContent=key.endsWith('Angle')?`${word[which]}錐面與水平夾角 °`:key.endsWith('Small')?`${word[which]}錐小端內徑 mm`:`${word.top}板厚 mm`;}
  $('tank-config-label').textContent=horizontal?`臥式：A 端${END_LABELS[e.bottom]}、B 端${END_LABELS[e.top]}`:`立式：${TOP_NAMES[e.top]}＋${BOTTOM_NAMES[e.bottom]}`;
  workspace.sync();
}
function input(){const values={...TANK_DEFAULTS,...appliedInput,solve,referenceCase,seamClearance:seamUI.values(),nozzles:nozzleUI.values(),methods:methodUI.values(),fabricationData:fabricationUI.values(),stockPurchasing:supplyUI.values(),shellConstruction:shellUI.values()};for(const el of form.querySelectorAll('input[name],select[name]')){if(el.type==='radio'&&!el.checked)continue;values[el.name]=el.value;}return values;}
function renderStocks(p){
  for(const button of form.querySelectorAll('[data-shell-layout]'))button.setAttribute('aria-pressed',String(button.dataset.shellLayout===p.shellLayout));
  for(const button of form.querySelectorAll('[data-seam-layout]'))button.setAttribute('aria-pressed',String(button.dataset.seamLayout===p.seamLayout));
  $('tank-stock-options').innerHTML=TANK_STOCKS.map(c=>`<button type="button" data-stock="${c.id}" data-stock-width="${c.stockWidth}" data-stock-length="${c.stockLength}" aria-pressed="${stockPreset(p)?.id===c.id}">${c.label}</button>`).join('');
  $('tank-stock-current').textContent=`未個別指定的材料組使用：${stockLabel(p)} · ${fmt(Number(p.stockWidth))} × ${fmt(Number(p.stockLength))} mm。已指定的材料組保留自己的板型。`;
}
function renderAssembly({liveSeam=false}={}){
  const r=result;if(!r.valid)return;
  if(!liveSeam){seamUI.render(r);shellLayoutUI.render(r);}
  if(!r.assembly.some(piece=>piece.id===selectedPiece))selectedPiece='S1';const piece=r.assembly.find(piece=>piece.id===selectedPiece),s=shellPiecePart(r,selectedPiece);
  seamEditor.render(r,{selected:selectedPiece,compact:matchMedia('(max-width:500px)').matches,selectedNozzle:nozzleHighlighted??''});
  $('tank-assembly-summary').textContent=`${shellLayoutLabel(r.input)} · ${shellBatchLabel(r)}；${r.verticalSeams} 道縱縫＋${r.horizontalSeams} 道環縫，約 ${fmt(r.weldLength/1000,2)} m。`;
  const nozzle=r.nozzlePlan.items.find(n=>n.id===nozzleHighlighted);
  $('tank-3d-selection').textContent=nozzle?`目前選取 ${nozzle.mark||nozzle.id} ${nozzle.mark&&nozzle.name.startsWith(nozzle.mark+' · ')?nozzle.name.slice(nozzle.mark.length+3):nozzle.name} · Ø ${fmt(nozzle.od)} mm · 外伸至端面 ${fmt(nozzle.projection)} mm。管端及法蘭外形示意，螺栓孔未建模。`:exampleSession.active?`整槽組立示例 · ${r.nozzlePlan.count} 個管嘴 · 兩組支承。點管嘴或支承可進入對應編輯區；灰線框為輪廓待核。`:r.assembly.length>500?'板片超過 500 片，3D 顯示筒身輪廓；完整分片位置見下方展開圖／CSV。':`目前選取 ${piece.id} · 由底第 ${piece.course} 圈第 ${piece.panel} 片 · 原板 #${piece.sheet??'未排入'}。點 3D 板片或管嘴可換選。`;
  $('tank-piece-detail').innerHTML=`<strong>${piece.id} · 從底部第 ${piece.course} 圈，第 ${piece.panel} 片</strong><p>先下料 ${fmt(s.width,2)} × ${fmt(s.height,2)} × t${fmt(s.thickness)} mm；修邊後圓周長 ${fmt(s.finishedWidth,2)} × 高 ${fmt(s.finishedHeight,2)} mm。</p><p>${piece.sheet?`取自原板 #${piece.sheet}：左起 ${fmt(piece.x)}、上起 ${fmt(piece.y)} mm${piece.rotated?'（轉 90° 排料）':''}`:'尚未排入原板'} · 本圈起縫 ${fmt(piece.angle)}°；這片起點 ${fmt(piece.start/r.circumference*360)}°。角度沿用固定方位 0° 基準，俯視順時針；調起縫不移動管嘴。</p>`;
  $('tank-piece-buttons').innerHTML=r.assembly.slice(0,60).map(piece=>`<button type="button" data-piece="${piece.id}" aria-pressed="${piece.id===selectedPiece}" style="--piece-color:${pieceColor(piece.id)}">${piece.id}<small>第 ${piece.course} 圈</small></button>`).join('')+(r.assembly.length>60?'<p class="tank-note">前 60 片快速選取；完整編號與位置見 CSV。</p>':'');
  const source=r.sheets.find(sheet=>sheet.id===piece.sheet);
  $('tank-construction-sheet').innerHTML=source?`<header><span>這片從哪裡切？</span><strong>${esc(piece.id)} · 原板 #${source.id}</strong></header>${sheetSketch(source,r,{interactive:true,selected:piece.id})}<p>左上角起算。點板片編號，對照筒身上的組立位置。</p>`:'<header><span>這片從哪裡切？</span><strong>'+esc(piece.id)+' 尚未排入原板</strong></header><p>先調整板型或分片，再確認下料尺寸。</p><button type="button" data-construction-settings>調整板型／分片</button>';
  if(!liveSeam)renderSheets();
  viewer?.setSelected(nozzleHighlighted?null:selectedPiece);
  if(!liveSeam)shellUI.render(r,selectedPiece);
}
function renderSheets(){
  const r=result;if(!r?.valid)return;
  if(selectedStockGroup&&!r.stockPlan.groups.some(g=>g.id===selectedStockGroup))selectedStockGroup='';
  const selected=r.stockParts.find(p=>p.id===selectedStockPart);if(selectedStockPart&&!selected)selectedStockPart='';
  if($('tank-stock-aux').open)supplyUI.render(r);
  const purchase=$('tank-stock-purchase'),openKeys=purchase.children.length?[...purchase.querySelectorAll('[data-stock-buy-key][open]')].map(el=>decodeURIComponent(el.dataset.stockBuyKey)):undefined;if(purchase.closest('.stock-legacy').open)purchase.innerHTML=stockPurchaseMarkup(r,{openKeys});
  $('tank-stock-ledger').innerHTML=stockSummaryMarkup(r,{interactive:true,selectedGroup:selectedStockGroup,selectedPart:selectedStockPart});
  const group=r.stockPlan.groups.find(g=>g.id===selectedStockGroup);for(const el of $('tank-parts').querySelectorAll('[data-raw-part]'))el.hidden=selectedStockPart?el.dataset.rawPart!==selectedStockPart:group?!group.partIDs.includes(el.dataset.rawPart):false;
  const pool=r.sheets.filter(s=>(!selectedStockGroup||s.group===selectedStockGroup)&&(!selectedStockPart||s.placements.some(x=>x.part===selectedStockPart))),visible=pool.slice(0,12);
  if(!selectedStockGroup&&!selectedStockPart){const piece=r.assembly.find(p=>p.id===selectedPiece);if(piece?.sheet&&!visible.some(s=>s.id===piece.sheet))visible.push(r.sheets.find(s=>s.id===piece.sheet));}
  $('tank-sheets').innerHTML=visible.map(sheet=>`<article class="tank-sheet"><h4>${sheet.offerId?esc(sheet.offerId)+' · ':''}原板 #${sheet.id} · ${esc(sheet.material)} · t${fmt(sheet.thickness)} mm</h4>${sheetSketch(sheet,r,{interactive:true,selected:selectedStockPart||selectedPiece})}<details><summary>看下料位置尺寸</summary><p>${sheet.placements.slice(0,30).map(item=>`${esc(placementLabel(item))}：從左 ${fmt(item.x)}、從上 ${fmt(item.y)}；包絡 ${fmt(item.w)} × ${fmt(item.h)} mm`).join('<br>')}${sheet.placements.length>30?'<br>完整座標可下載 CSV。':''}</p></details></article>`).join('')+(pool.length>12?'<p class="tank-note">顯示此篩選前 12 張；完整排料見估料單／CSV。</p>':'');
  $('tank-stock-usage').textContent=`本配置已排 ${r.plateSheets} 張；${r.stockWeight===null?'已知原板採購 '+fmt(r.stockPlan.knownStockWeight)+' kg，另有密度待填':'原板 '+fmt(r.stockWeight)+' kg'}，毛坯 ${fmt(r.allocatedBlankWeight)} kg，原板未分配重量 ${fmt(r.offcutWeight)} kg。${r.stockComplete?'':'尚有備料資料未完成，未排入項不算零張。'}`;
}
function openStockPart(id){
  selectedStockPart=id;selectedStockGroup='';panel('plates');renderAssembly();document.querySelector('.tank-cut-list').open=true;$('tank-sheets').scrollIntoView({block:'start',behavior:'smooth'});
}
function selectPiece(id,origin){if(!result?.valid||!result.assembly.some(piece=>piece.id===id))return;const container=origin?.closest('#tank-piece-buttons,#tank-sheets,#tank-assembly-sketch,#tank-construction-sheet')?.id,focused=document.activeElement===origin;nozzleHighlighted=null;viewer?.setNozzleSelected(null);selectedPiece=id;renderAssembly();if(focused&&container)document.querySelector(`#${container} [data-piece="${id}"]`)?.focus({preventScroll:true});}
function selectFabricationPiece(id){const p=result?.fabricationPlan?.parts.find(p=>p.id===id||id.startsWith(p.id+'-'));if(p){panel('fabrication');if(p.target==='support'){supportUI.group='parts';supportUI.selected=p.localId;supportUI.paintEditor();supportUI.viewer?.selectDrawing(id);}else focusField('fabricationData.'+p.id);}else selectPiece(id);}
function projectInput(p,r){return {...p,[solve]:Number(r.input[solve].toFixed(solve==='volume'?6:3))};}
function exampleMode(){
  const active=exampleSession.active;document.body.classList.toggle('tank-example-active',active);$('tank-example-entry').hidden=active;$('tank-example-mode').hidden=!active;$('tank-example-guide').hidden=!active;$('tank-example-scene-head').hidden=!active;
}
async function openTankExample(task='size'){
  if(!exampleSession.active){
    try{exampleSession.start(input(),createV1102Input(),{task:workspace.current,view,selectedPiece,nozzleHighlighted,spin,transparent,labelsVisible,sameEnds:$('tank-same-ends').checked,hash:location.hash});}
    catch(error){toast('無法保留原專案：'+error.message);return;}
    apply(exampleSession.working);nozzleHighlighted=null;selectedPiece='S1';spin=false;transparent=false;labelsVisible=false;$('tank-same-ends').checked=true;
    history.replaceState(null,'',location.pathname+location.search);$('tank-spin').setAttribute('aria-pressed','false');$('tank-transparent').setAttribute('aria-pressed','false');$('tank-labels').setAttribute('aria-pressed','false');viewer?.setSpin(false);viewer?.setLabelsVisible(false);render();
  }
  document.querySelector('.tank-project').open=false;$('tank-reference').open=false;
  if(task==='size'){await setView('3d');viewer?.reset();$('tank-task-size').scrollIntoView({block:'start'});}else{panel(task);(task==='fabrication'?$('tank-support-workspace'):$('tank-task-'+task))?.scrollIntoView({block:'start'});}
}
async function returnFromExample(){
  const original=exampleSession.original();if(!original)return;
  try{exampleSession.finish();}catch{toast('無法結束範本練習，原專案仍保留。');return;}
  apply(original.input);const ui=original.ui??{};selectedPiece=ui.selectedPiece??'S1';nozzleHighlighted=ui.nozzleHighlighted??null;spin=!!ui.spin;transparent=!!ui.transparent;labelsVisible=!!ui.labelsVisible;$('tank-same-ends').checked=ui.sameEnds!==false;
  $('tank-spin').setAttribute('aria-pressed',String(spin));$('tank-transparent').setAttribute('aria-pressed',String(transparent));$('tank-labels').setAttribute('aria-pressed',String(labelsVisible));viewer?.setSpin(spin);viewer?.setLabelsVisible(labelsVisible);
  history.replaceState(null,'',location.pathname+location.search+(ui.hash??''));render();await setView(ui.view==='3d'?'3d':'dimensions');if(ui.task&&ui.task!=='size')panel(ui.task);else $('tank-task-size').scrollIntoView({block:'start'});toast('已回到原本的專案，保留看範本前的修改。');
}
function apply(values){seamEditor.reset();const migration=migrateV1102Support(values);values=migration.input;supportUpdated=migration.changed;supportUndo=migration.changed?{previous:migration.previous,index:0}:null;$('tank-fabrication-details').open=!values.fabricationData?.assemblies?.some(a=>a.supportLayout);appliedInput={...values};referenceCase=values.referenceCase??'';solve=values.solve;nozzleUI.apply(values.nozzles);seamUI.apply(values.seamClearance);shellLayoutUI.apply(values.shellLayoutPlan);methodUI.apply(values.methods);fabricationUI.apply(values.fabricationData);supplyUI.apply(values.stockPurchasing);shellUI.apply(values.shellConstruction);nozzleHighlighted=nozzleUI.selected;for(const el of form.querySelectorAll('input[name],select[name]')){if(!Object.hasOwn(values,el.name))continue;if(el.type==='radio')el.checked=el.value===values[el.name];else el.value=values[el.name];}}
function toast(message){$('tank-toast').textContent=message;$('tank-toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('tank-toast').hidden=true,4500);}
function download(text,type,name){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function panel(name){const changed=workspace.current!==name;if(name==='fabrication')$('tank-reference').open=false;workspace.show(name);if(name!=='size')viewer?.setActive(false);if(name==='fabrication'&&changed)$('tank-support-workspace').scrollIntoView({block:'start'});}
function focusField(name){
  if(name?.startsWith('shellLayoutPlan')){panel('plates');shellLayoutUI.focus();return;}if(name?.startsWith('seamClearance')){panel('plates');seamUI.focus(name);return;}
  if(name?.startsWith('stockPurchasing')){panel('plates');$('tank-stock-aux').open=true;supplyUI.render(result);supplyUI.focus(name);return;}
  if(name==='stockSelections'){panel('plates');$('tank-construction-settings').open=true;document.querySelector('.stock-legacy').open=true;renderSheets();const body=result?.stockPlan?.groups.find(g=>g.partIDs.includes('S')),row=[...$('tank-stock-purchase').querySelectorAll('[data-stock-buy-key]')].find(el=>decodeURIComponent(el.dataset.stockBuyKey)===body?.selectionKey);if(row)row.open=true;(row??$('tank-stock-purchase')).scrollIntoView({block:'start',behavior:'smooth'});return;}
  if(name?.startsWith('nozzles.')){const [,id,field]=name.split('.');openNozzle(id,field);return;}
  if(name?.startsWith('fabricationData')){panel('fabrication');if(name.includes('.supportLayout')){$('tank-support-workspace').querySelector('.support-layout').open=true;$('tank-support-workspace').scrollIntoView({block:'start'});return;}$('tank-fabrication-details').open=true;fabricationUI.focus(name);return;}
  if(name?.startsWith('methods')){panel('methods');methodUI.focus(name);return;}
  if(['shape','orientation','top','bottom'].includes(name)){workspace.show('size');$('tank-shape-picker').open=true;form.querySelector('.tank-config')?.scrollIntoView({behavior:'smooth',block:'center'});form.querySelector('[data-end]')?.focus({preventScroll:true});return;}
  if(name===solve){workspace.show('size');toast('這個尺寸目前由程式反算；先選另一組已知尺寸即可自行輸入。');form.querySelector('[data-solve]').focus();return;}
  const el=control(name);if(!el)return;
  workspace.reveal(el);
  el.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});el.focus({preventScroll:true});if(el.tagName==='INPUT')el.select();
}
function renderCodes(p){
  const guide=tankCodeGuide(p);
  $('tank-code-summary').innerHTML=`<div class="tank-code-status"><h3>${esc(guide.title)}</h3><p>${esc(guide.summary)}</p><small>${esc(guide.status)}</small></div>${guide.concerns.length?'<div class="tank-code-concerns">'+guide.concerns.map(c=>'<p>'+esc(c)+'</p>').join('')+'</div>':''}`;
  $('tank-code-missing').innerHTML=`<div class="tank-code-gaps"><p>${guide.recorded?'條件已記錄，仍須完成正式設計與審查。':'還需要確認以下資料；點項目可直接填寫：'}</p><div>${[...guide.numericIssues,...guide.missing].map(issue=>`<button type="button" data-focus="${issue.field}">${esc(issue.label)}</button>`).join('')}</div></div>`;
  $('tank-code-checks').innerHTML='<ul>'+guide.checks.map(c=>'<li>'+esc(c)+'</li>').join('')+'</ul>';
  $('tank-efficiency-field').hidden=!(['pressure','vacuum','both'].includes(p.service)||p.code==='asme'||Number(p.pressure)>0||Number(p.vacuum)>0||String(p.efficiency).trim()!=='');
  for(const issue of guide.numericIssues)control(issue.field)?.setAttribute('aria-invalid','true');
}
// Lazily mounted: render paths may run before this line during module start-up.
var statusStripInstance;// var + function declaration: both are usable before this line runs.
function statusStripUpdate(model){(statusStripInstance??=mountWorkbenchStatus(document.querySelector('.workbench-nav'),{sticky:true})).update(model);}
const CONFLICT=/相交|碰到|低於|無法|伸到|不一致|超出/;
function openNozzle(id,field){if(id)nozzleUI.select(id);panel('nozzles');requestAnimationFrame(()=>{const el=field&&form.querySelector(`[data-nozzle-field="${field}"]`);revealControl(el);const target=el&&!el.closest('[hidden]')?el:$('tank-nozzle-add')?.closest('section');target?.scrollIntoView({behavior:'smooth',block:'center'});if(el&&!el.closest('[hidden]'))el.focus({preventScroll:true});});}
function renderStatus(p){
  const r=result,issues=[];
  if(!r.valid){if(!exampleSession.active)projectDraft.pending('尺寸待修正，目前修改尚未保存');for(const issue of r.issues)issues.push({level:'error',text:issue.message,actionLabel:'前往修改',action:()=>focusField(issue.field)});statusStripUpdate({tone:'error',title:'尺寸待修正',detail:'修正後才會估料與出圖',issues,metrics:[]});return;}
  for(const x of r.stockPlan.purchaseIssues??[])issues.push({level:'warn',text:'輔助報價：'+x.message,actionLabel:'修正報價',action:()=>focusField(x.field)});
  for(const x of r.stockPlan.purchasePending)issues.push({level:'warn',text:x.message,actionLabel:'重比採購',action:()=>focusField(x.field)});
  for(const x of r.stockPlan.pending)issues.push({level:'warn',text:x.message,actionLabel:'補備料',action:()=>focusField(x.field)});
  for(const issue of r.materialIssues){const part=[...r.parts].find(x=>x.id===issue.part),end=part?.ends?.[0]??(part?.id?.startsWith('T')?'top':part?.id?.startsWith('B')?'bottom':null);
    issues.push(part?.kind==='circle'&&end&&r.endTypes[end]==='flat'?{level:'error',text:issue.message,actionLabel:'改用拼板',action:()=>{methodUI.set('layout.'+end,'strips');panel('methods');methodUI.select(end);}}:{level:'error',text:issue.message,actionLabel:issue.field?.startsWith('fabricationData')?'修改分件':'修改原板',action:()=>focusField(issue.field)});}
  for(const issue of r.fabrication?.issues??[])issues.push({level:'error',text:'工法：'+issue.message,actionLabel:'修改',action:()=>focusField(issue.field)});
  const methodWarnings=new Set();for(const card of methodCatalog(r))for(const w of card.warnings??[])if((w.level!=='error'||!card.optional)&&!methodWarnings.has(w.text)){methodWarnings.add(w.text);issues.push({level:w.level==='error'?'error':w.level==='info'?'info':'warn',text:`${card.title}：${w.text}`,actionLabel:'看工法',action:()=>{panel('methods');methodUI.select(card.id);}});}
  if(r.fabricationPlan.pending.length){const first=r.fabricationPlan.pending[0];issues.push({level:'warn',text:`分件／焊道有 ${r.fabricationPlan.pending.length} 項資料待補`,actionLabel:'補分件',action:()=>focusField(first.field||'fabricationData.'+first.id)});}
  for(const issue of r.shellLayoutState?.issues??[])issues.push({level:'error',text:issue.message,actionLabel:'重排筒身',action:()=>focusField('shellLayoutPlan')});
  for(const issue of r.seamClearance?.issues??[])issues.push({level:'error',text:issue.message,actionLabel:'修正施工距離',action:()=>focusField(issue.field)});
  const seamPending=seamClearancePending(r);if(seamPending.length)issues.push({level:'warn',text:`排縫仍有 ${seamPending.length} 項焊道／施工距離待確認`,actionLabel:'填施工距離',action:()=>focusField('seamClearance.'+seamPending[0].key)});
  const np=r.nozzlePlan??{items:[],issues:[]};
  for(const issue of np.issues??[])issues.push({level:'error',text:(issue.id?issue.id+'：':'')+issue.message,actionLabel:'修改管嘴',action:()=>openNozzle(issue.id,issue.field)});
  const pairSeen=new Set();
  for(const n of np.items??[])for(const w of n.warnings){
    const partner=w.match(/與 (N\d+) 的/)?.[1],key=nozzleIssueKey(n.id,w);
    if(pairSeen.has(key))continue;pairSeen.add(key);
    issues.push({level:CONFLICT.test(w)?'warn':'info',text:partner?`${n.id} ↔ ${partner}：${w.replace(`與 ${partner} 的`,'')}`:`${n.id}：${w}`,actionLabel:'看管嘴',action:()=>openNozzle(n.id)});
  }
  const guide=tankCodeGuide(r.input),pending=[...guide.numericIssues,...guide.missing];
  for(const issue of guide.numericIssues)issues.push({level:'warn',text:issue.label,actionLabel:'修改',action:()=>focusField(issue.field)});
  for(const concern of guide.concerns)issues.push({level:/管嘴及法蘭/.test(concern)?'info':'warn',text:concern,actionLabel:'看規範',action:()=>{panel('codes');$('tank-code-summary')?.scrollIntoView({behavior:'smooth',block:'center'});}});
  if(guide.missing.length)issues.push({level:'info',text:`設計條件尚缺 ${guide.missing.length} 項（估料可先進行）`,actionLabel:'補資料',action:()=>{panel('codes');$('tank-code-missing')?.scrollIntoView({behavior:'smooth',block:'center'});}});
  const blocking=issues.some(i=>i.level==='error'),warns=issues.filter(i=>i.level==='warn').length;
  statusStripUpdate({tone:blocking?'error':warns?'warn':'ok',title:blocking?(!r.stockComplete?'採購未完成':r.fabrication?.valid===false?'工法設定需修正':'管嘴需修正'):warns?'可估料 · 需你判斷':'估料完成',
    detail:`${r.shapeLabel??''} · ${r.input.basis==='inside'?'內徑':'外徑'} ${fmt(r.input.diameter)} × 直段 ${fmt(r.height)} mm`,issues,
    metrics:[{label:'幾何容積',value:fmt(r.volume,3),unit:'m³',quiet:true},{label:r.incompleteFabrication?'已計重量':'空槽估重',value:fmt(r.emptyWeight??r.netWeight),unit:'kg'},{label:'原板',value:String(r.plateSheets),unit:r.stockComplete?'張'+(r.formedHeads?`＋${r.formedHeads} 封頭`:''):'張已排 · 待補'},{label:'焊材',value:r.process?fmt(r.process.weld.totals.consumable,0):'—',unit:'kg',quiet:true}]});
}
function render({liveSeam=false}={}){
  const p=input();exampleMode();if(exampleSession.active){try{exampleSession.update(p);}catch{toast('範本修改尚未保存，原專案仍保留。');}}result=estimateTank(p);if(liveSeam&&seamEditor.dragging){renderAssembly({liveSeam:true});$('tank-preview').disabled=result.shellLayoutState?.valid===false||result.seamClearance?.valid===false||!result.nozzlePlan.valid||result.fabrication?.valid===false;$('tank-csv').disabled=$('tank-preview').disabled;projectDraft.pending('接縫移動中，放開後更新保存狀態');if(viewer){viewer.update(result);viewer.setSelected(selectedPiece);viewer.setTransparent(transparent);}return;}seamEditor.setActive(workspace.current==='plates'&&result.valid);$('tank-example-scene-head').querySelector('small').textContent=result.valid?`內徑 ${fmt(result.di)} × 直段 ${fmt(result.height)} mm · ${result.nozzlePlan.count} 個管嘴`:'尺寸尚未填完；修正後會更新整槽 3D。';$('tank-reference').hidden=p.referenceCase!==V1102_ID;if(p.referenceCase===V1102_ID)$('tank-reference').innerHTML=v1102ReviewMarkup(result);for(const el of form.querySelectorAll('[aria-invalid]'))el.removeAttribute('aria-invalid');
  for(const el of form.querySelectorAll('[data-solve]'))el.setAttribute('aria-pressed',String(el.dataset.solve===solve));
  for(const name of ['diameter','height','volume']){const el=control(name);el.readOnly=name===solve;el.setAttribute('aria-label',(name===solve?'反算的':'')+fieldLabel(name));if(name===solve&&result.valid)el.value=Number(result.input[name].toFixed(name==='volume'?6:3));if(name===solve&&!result.valid)el.value='';}
  $('tank-diameter-label').textContent=(p.basis==='inside'?'內徑':'外徑')+' mm';
  const cfg=currentConfig(),butt=[cfg.top,cfg.bottom].some(t=>BUTT_ENDS.includes(t)),horizontalTank=cfg.orientation==='horizontal';
  $('tank-height-label').textContent=horizontalTank?'切線間直段長度 mm':butt?'切線間直段高度 mm':'直筒內部高度 mm';
  $('tank-height-note').textContent=butt||horizontalTank?'直段從一端切線量到另一端切線，包含封頭直邊與對接間隙；總'+(horizontalTank?'長':'高')+'另加兩端深度。':'高度為底板內面到上緣／頂蓋內面的直筒高度；總高另加底／蓋板厚。';
  $('tank-end-label').firstChild.textContent=horizontalTank?'端部估料板厚 mm':cfg.top!=='open'&&Number(p.topThickness)>0?'底部估料板厚 mm':'底／蓋／封頭估料板厚 mm';
  renderConfig();
  $('tank-errors').hidden=result.valid;$('tank-errors').innerHTML=result.valid?'':result.issues.map(issue=>`<button type="button" data-focus="${issue.field}">${esc(issue.message)} →</button>`).join('');for(const issue of result.issues)control(issue.field)?.setAttribute('aria-invalid','true');
  $('tank-sketch').innerHTML=tankSketch(result,{compact:matchMedia('(max-width:500px)').matches});$('tank-preview').disabled=!result.valid||result.nozzlePlan?.valid===false||result.fabrication?.valid===false||result.seamClearance?.valid===false||result.shellLayoutState?.valid===false;$('tank-csv').disabled=$('tank-preview').disabled;
  $('tank-dimension-shortcuts').innerHTML=result.valid?`<button type="button" data-focus="diameter">${p.basis==='inside'?'內徑':'外徑'} ${fmt(result.input.diameter)} mm ✎</button><button type="button" data-focus="height">直段 ${fmt(result.height)} mm ✎</button>`:'';
  $('tank-dimension-shortcuts').hidden=view==='3d';
  $('tank-scene-note').textContent=!result.valid?'請先修正尺寸，圖面與 3D 才能更新。':view==='3d'?`拖曳旋轉 · 滾輪／雙指縮放 · 圖面為組立示意${seam3DNote()}`:'點直徑／高度標籤，直接修改尺寸。';
  renderCodes(result.valid?result.input:p);
  renderStocks(p);
  nozzleUI.render(result);
  methodUI.render(result);
  fabricationUI.render(result);supportUI.render(result,{updated:supportUpdated,canUndo:!!supportUndo});
  $('tank-support-entry').hidden=p.referenceCase!==V1102_ID;$('tank-support-entry').innerHTML=p.referenceCase===V1102_ID?`<div><strong>支承施工已接入目前專案</strong><small>可修改尺寸、核對3D與焊接區，直接列印支承加工單。</small></div><button type="button" data-open-support>開啟支承施工 →</button>`:'';
  if(!result.valid)shellUI.render(result,selectedPiece);
  $('tank-assembly').hidden=!result.valid;$('tank-stock-usage').hidden=!result.valid;
  if(!result.valid){$('tank-totals').innerHTML='<div class="tank-total"><span>尺寸待修正</span><p>修正上方標記欄位後，估料與圖面會重新出現。</p></div>';$('tank-parts').replaceChildren();$('tank-sheets').replaceChildren();$('tank-stock-ledger').replaceChildren();$('tank-stock-purchase').replaceChildren();$('tank-stock-supply').replaceChildren();$('tank-rolling').replaceChildren();$('tank-material-issues').hidden=true;$('tank-assumptions').replaceChildren();$('tank-viewer').hidden=true;viewer?.setActive(false);renderStatus(p);return;}
  const r=result,s=r.parts[0];$('tank-viewer').hidden=false;
  $('tank-totals').innerHTML=totalsMarkup(r);
  $('tank-material-issues').hidden=!r.materialIssues.length;$('tank-material-issues').innerHTML=r.materialIssues.map(issue=>`<button type="button" data-focus="${issue.field}">${esc(issue.message)} → 前往修改</button>`).join('');
  for(const issue of r.materialIssues)control(issue.field)?.setAttribute('aria-invalid','true');
  $('tank-parts').innerHTML=r.parts.map(part=>`<article class="tank-part" data-raw-part="${esc(part.id)}"><div class="tank-part-head"><h3>${esc(part.id+' · '+part.name)}</h3><span>${part.quantity} ${part.kind==='formed'?'只':'片'}</span></div><p class="tank-cut-size">${part.kind==='formed'?'內徑 '+fmt(r.di)+' · t'+fmt(part.thickness)+' mm':part.kind==='circle'?'先下料 Ø '+fmt(part.blankDiameter,2)+' × t'+fmt(part.thickness)+' mm':(part.id==='S'&&part.pieces?'逐片毛坯見筒身加工單；最大包絡 ':'先下料 ')+fmt(part.width,2)+' × '+fmt(part.height,2)+' × t'+fmt(part.thickness)+' mm'}</p><p>${part.kind==='rectangle'?`${part.pieces?'各片成品尺寸見展開圖／加工單':'修邊後 '+fmt(part.finishedWidth,2)+' × '+fmt(part.finishedHeight,2)+' mm'} · ${shellBatchLabel(r)}`:['sector','petal'].includes(part.kind)?'毛坯以矩形包絡估料；展開與分片見「製作工法」。':part.finishedDiameter?'成品圓徑 '+fmt(part.finishedDiameter,2)+' mm':`封頭深度約 ${fmt(r.headDepth)} mm · 直邊 ${fmt(r.input.headStraight)} mm${part.weightEstimated?' · 重量按曲面概算':''}`}</p><p>成品估重 ${fmt(part.netWeight)} kg${part.sheetIDs.length?' · 排在原板 #'+part.sheetIDs.slice(0,8).join('、#')+(part.sheetIDs.length>8?'…':''):part.kind==='formed'?' · 向封頭廠商訂製':' · 尚未排入原板'}</p></article>`).join('')+[...r.attachmentParts,...r.detailPlateParts].map(part=>`<article class="tank-part" data-raw-part="${esc(part.id)}"><div class="tank-part-head"><h3>${esc(part.id+' · '+part.name)}</h3><span>${part.quantity} 片</span></div><p>${esc(part.material)} · t${fmt(part.thickness)} mm</p><p class="tank-cut-size">${part.pieces?'各片包絡見原板圖／CSV':'先備 '+fmt(part.width,2)+' × '+fmt(part.height,2)+' mm'}</p><p>${esc(stockStatusText(part.stock))}${part.group==='fabrication'?' · 成品 '+fmt(part.netWeight)+' kg':''}</p>${part.group==='fabrication'?`<button type="button" class="tank-secondary" data-stock-focus="fabricationData.${esc(part.id)}">修改分件 ↗</button>`:''}</article>`).join('');
  renderAssembly();
  $('tank-assumptions').innerHTML='<ul>'+r.notes.map(note=>'<li>'+esc(note)+'</li>').join('')+'</ul>';
  $('tank-rolling').innerHTML=`<ol class="tank-rolling-list"><li>板厚中面周長：π ×（${fmt(r.di)}＋${fmt(r.input.shellThickness)}）= <b>${fmt(r.circumference,2)} mm</b>。</li><li>${shellBatchLabel(r)}；縱向接縫各留 ${fmt(r.input.gap)} mm，S1 修邊後弧長 <b>${fmt(shellPiecePart(r,'S1').finishedWidth,2)} mm</b>；其他片依分片清單。</li><li>分 ${r.courses} 圈；圈間接縫共 ${fmt((r.courses-1)*r.input.gap)} mm，各圈成品板高 <b>${shellCourses(r).map(c=>fmt(c.height,2)).join('／')} mm</b>。</li><li>各邊留 ${fmt(r.input.trim)} mm：S1 先下料 <b>${fmt(shellPiecePart(r,'S1').width,2)} × ${fmt(shellPiecePart(r,'S1').height,2)} mm</b>；逐片毛坯尺寸見筒身加工單。預彎、夾持與焊接收縮餘量依機台與工法另確認。</li><li>筒身共有 ${r.verticalSeams} 道縱縫、${r.horizontalSeams} 道環縫，接縫中心線總長約 ${fmt(r.weldLength/1000,2)} m（底蓋／封頭與附件另計）。接縫錯位、坡口與間隙依圖說及 WPS。</li></ol>${[r.endTypes.top,r.endTypes.bottom].some(t=>BUTT_ENDS.includes(t))?'<p class="tank-note">筒身高度已扣除對接端部的直邊及端部對接間隙。封頭毛坯由供應商確認；不把曲面面積當成下料圓徑。</p>':''}`;
  renderStatus(p);
  if(!exampleSession.active){if(r.shellLayoutState?.valid!==false&&r.seamClearance?.valid!==false&&r.nozzlePlan.valid&&r.fabrication?.valid!==false&&!r.stockPlan.purchaseIssues.length)projectDraft.write(tankProject(projectInput(p,r)));else projectDraft.pending(r.stockPlan.purchaseIssues.length?'報價資料待修正；施工內容仍可使用，目前修改尚未保存':'分片、管嘴、工法或施工距離待修正，目前修改尚未保存');}
  if(viewer){viewer.update(r);viewer.setSelected(nozzleHighlighted||exampleSession.active?null:selectedPiece);viewer.setNozzleSelected(nozzleHighlighted);viewer.setTransparent(transparent);viewer.setLabelsVisible(labelsVisible);viewer.setActive(view==='3d'&&workspace.current==='size');}
}
function seam3DNote(){return Object.values(result?.seamClearance?.data??{}).some(v=>v!==null)?' · 金色焊道帶／虛線施工區／紅色需避讓':'';}
async function setView(next){
  workspace.show('size');
  view=next;for(const el of document.querySelectorAll('[data-tank-view]'))el.setAttribute('aria-pressed',String(el.dataset.tankView===view));$('tank-sketch').hidden=view==='3d';$('tank-3d-area').hidden=view!=='3d';
  $('tank-dimension-shortcuts').hidden=view==='3d';
  $('tank-scene-note').textContent=view==='3d'?`拖曳旋轉 · 滾輪／雙指縮放 · 圖面為組立示意${seam3DNote()}`:'點直徑／高度標籤，直接修改尺寸。';
  if(view!=='3d'){viewer?.setActive(false);return;}
  if(!result.valid){$('tank-scene-note').textContent='請先修正尺寸，3D 才能更新。';return;}
  if(!viewer){
    if(!viewerPromise){$('tank-viewer').textContent='正在準備桶槽 3D…';viewerPromise=import('./tank-viewer.js').then(({TankViewer})=>{viewer=new TankViewer($('tank-viewer'),selectFabricationPiece,id=>nozzleUI.select(id));if(result.valid)viewer.update(result);viewer.setSelected(nozzleHighlighted||exampleSession.active?null:selectedPiece);viewer.setNozzleSelected(nozzleHighlighted);viewer.setSpin(spin);viewer.setTransparent(transparent);viewer.setLabelsVisible(labelsVisible);viewer.setActive(view==='3d'&&result.valid&&workspace.current==='size');}).catch(()=>{viewerPromise=null;$('tank-viewer').textContent='3D 未能載入；可切回尺寸圖繼續估料，再重新點「旋轉 3D」重試。';});}await viewerPromise;
  }else{viewer.resize();viewer.setLabelsVisible(labelsVisible);viewer.setActive(result.valid);}
}
form.addEventListener('submit',event=>event.preventDefault());form.addEventListener('input',event=>{if(!methodUI.edit(event.target))nozzleUI.edit(event.target);render();});form.addEventListener('change',event=>{if(event.target.id==='tank-same-ends'){const e=currentConfig();if(event.target.checked)setConfig({...e,top:e.bottom});}if(!methodUI.edit(event.target))nozzleUI.edit(event.target);render();});
matchMedia('(max-width:500px)').addEventListener('change',()=>{if(result?.valid){renderAssembly();$('tank-sketch').innerHTML=tankSketch(result,{compact:matchMedia('(max-width:500px)').matches});}});
$('tank-stock-aux').addEventListener('toggle',()=>{if($('tank-stock-aux').open&&result?.valid)supplyUI.render(result);});
document.querySelector('.stock-legacy').addEventListener('toggle',()=>{if(document.querySelector('.stock-legacy').open&&result?.valid)renderSheets();});
form.addEventListener('click',event=>{
  const settings=event.target.closest('[data-construction-settings]');if(settings){focusField('stockSelections');return;}
  const method=event.target.closest('[data-construction-method]');if(method){panel('methods');methodUI.select(method.dataset.constructionMethod);return;}
  const inherit=event.target.closest('[data-stock-inherit]');if(inherit){const key=decodeURIComponent(inherit.dataset.stockInherit),item=compareMaterialStocks(result).groups.find(x=>x.group.selectionKey===key);if(item){appliedInput.stockSelections=selectStockGroup(input().stockSelections,item.group,'inherit');supplyUI.data.plans=supplyUI.data.plans.filter(p=>p.key!==key);render();}return;}
  const choose=event.target.closest('[data-stock-choose]'),best=event.target.closest('[data-stock-best]');
  if(choose||best){const model=compareMaterialStocks(result),key=decodeURIComponent(choose?.dataset.stockChoose??best.dataset.stockBest);if(choose){const item=model.groups.find(x=>x.group.selectionKey===key),option=item?.options.find(x=>x.id===choose.dataset.stockSize&&x.feasible);if(!option)return;appliedInput.stockSelections=selectStockDimensions(input().stockSelections,item.group,option);}else appliedInput.stockSelections=applyStockRecommendations(result,key==='all'?null:key);supplyUI.data.plans=supplyUI.data.plans.filter(p=>key!=='all'&&p.key!==key);render();const restore=choose?form.querySelector(`[data-stock-choose="${encodeURIComponent(key)}"][data-stock-size="${choose.dataset.stockSize}"]`):form.querySelector('.stock-buy-group > summary');restore?.focus({preventScroll:true});toast('已更新分組用板；BOM、原板張數與排料同步重算。');return;}

  const stockDetail=event.target.closest('[data-stock-detail]'),stockFocus=event.target.closest('[data-stock-focus]'),stockGroup=event.target.closest('[data-stock-group]');if(stockDetail){focusField('fabricationData.'+stockDetail.dataset.stockDetail);return;}if(stockFocus){focusField(stockFocus.dataset.stockFocus);return;}if(stockGroup){selectedStockGroup=stockGroup.dataset.stockGroup;selectedStockPart='';renderSheets();document.querySelector('.tank-cut-list').open=true;$('tank-sheets').scrollIntoView({block:'start',behavior:'smooth'});return;}
  const fabOpen=event.target.closest('[data-open-fabrication]');if(fabOpen){panel('fabrication');$('tank-fabrication-details').open=true;fabricationUI.selected=fabOpen.dataset.openFabrication;fabricationUI.tab='parts';fabricationUI.render(result);$('tank-fabrication-workspace').scrollIntoView({block:'start',behavior:'smooth'});return;}
  const config=event.target.closest('[data-orientation],[data-end]');
  if(config){const e=currentConfig();
    if(config.dataset.orientation){const o=config.dataset.orientation;if(o==='horizontal'){const ok=t=>HORIZONTAL_ENDS.includes(t);setConfig({orientation:o,top:ok(e.top)?e.top:'elliptical',bottom:ok(e.bottom)?e.bottom:'elliptical'});}else setConfig({...e,orientation:o});}
    else{const which=config.dataset.end,value=config.dataset.value,same=e.orientation==='horizontal'&&$('tank-same-ends').checked;setConfig(same?{...e,top:value,bottom:value}:{...e,[which]:value});}
    const focus=config.dataset.end?`[data-end="${config.dataset.end}"][data-value="${config.dataset.value}"]`:`[data-orientation="${config.dataset.orientation}"]`;render();form.querySelector(focus)?.focus({preventScroll:true});return;}
  const button=event.target.closest('[data-solve],[data-panel],[data-focus],[data-tank-view],[data-stock],[data-shell-layout],[data-seam-layout],[data-piece]');if(!button)return;
  if(button.dataset.solve){solve=button.dataset.solve;render();}
  else if(button.dataset.panel){panel(button.dataset.panel);if(button.dataset.panel==='size'&&view==='3d')setView('3d');}
  else if(button.dataset.focus)focusField(button.dataset.focus);
  else if(button.dataset.tankView)setView(button.dataset.tankView);
  else if(button.dataset.stock){const id=button.dataset.stock,focused=document.activeElement===button;control('stockWidth').value=button.dataset.stockWidth;control('stockLength').value=button.dataset.stockLength;render();if(focused)form.querySelector(`[data-stock="${id}"]`)?.focus({preventScroll:true});}
  else if(button.dataset.shellLayout){control('shellLayout').value=button.dataset.shellLayout;render();}
  else if(button.dataset.seamLayout){control('seamLayout').value=button.dataset.seamLayout;render();}
  else if(button.dataset.piece)selectPiece(button.dataset.piece,button);
});
form.addEventListener('keydown',event=>{const target=event.target.closest('svg [data-focus],svg [data-piece],svg [data-stock-detail]');if(target&&['Enter',' '].includes(event.key)){event.preventDefault();if(target.dataset.stockDetail)focusField('fabricationData.'+target.dataset.stockDetail);else if(target.dataset.piece)selectPiece(target.dataset.piece,target);else focusField(target.dataset.focus);}});
$('tank-piece-3d').addEventListener('click',async()=>{await setView('3d');$('tank-3d-area').scrollIntoView({behavior:'smooth',block:'center'});});
$('tank-open-drawing').addEventListener('click',async()=>{await setView('dimensions');form.querySelector('.tank-scene-card').scrollIntoView({behavior:'smooth',block:'center'});});
$('tank-spin').addEventListener('click',()=>{spin=!spin;viewer?.setSpin(spin);$('tank-spin').setAttribute('aria-pressed',String(spin));});
$('tank-labels').addEventListener('click',()=>{labelsVisible=!labelsVisible;viewer?.setLabelsVisible(labelsVisible);$('tank-labels').setAttribute('aria-pressed',String(labelsVisible));});
$('tank-transparent').addEventListener('click',()=>{transparent=!transparent;viewer?.setTransparent(transparent);$('tank-transparent').setAttribute('aria-pressed',String(transparent));});$('tank-reset').addEventListener('click',()=>viewer?.reset());
$('tank-preview').addEventListener('click',()=>{try{order=tankWorkOrder(result,{includeQuotes:$('tank-print-quotes').checked});$('tank-print-frame').srcdoc=order;$('tank-print-preview').showModal();}catch(error){toast(error.message);}});$('tank-close-preview').addEventListener('click',()=>$('tank-print-preview').close());
$('tank-download-order').addEventListener('click',()=>download(order,'text/html;charset=utf-8',order.includes('<title>筒身施工加工單</title>')?'筒身施工加工單.html':'桶槽估料單.html'));$('tank-print-order').addEventListener('click',()=>{const frame=$('tank-print-frame');frame.contentWindow.focus();frame.contentWindow.print();});
$('tank-csv').addEventListener('click',()=>{try{download(tankCSV(result),'text/csv;charset=utf-8','桶槽估料.csv');}catch(error){toast(error.message);}});
$('tank-save').addEventListener('click',()=>{if(result?.stockPlan?.purchaseIssues?.length){toast('輔助報價資料待修正，再儲存包含報價的專案；施工內容仍可使用。');focusField(result.stockPlan.purchaseIssues[0].field);return;}if(!result.valid||!result.nozzlePlan.valid||result.fabrication?.valid===false||result.seamClearance?.valid===false||result.shellLayoutState?.valid===false){toast('先修正尺寸、管嘴、工法與施工距離，再儲存專案。');return;}download(tankProject(projectInput(input(),result)),'application/json','桶槽專案.json');});
$('tank-reference-load').addEventListener('click',()=>openTankExample());
$('tank-example-open').addEventListener('click',()=>openTankExample());
$('tank-example-return').addEventListener('click',returnFromExample);
$('tank-example-scene-head').addEventListener('click',event=>{if(event.target.closest('[data-example-return]'))returnFromExample();});
$('tank-example-save').addEventListener('click',()=>$('tank-save').click());
$('tank-example-guide').addEventListener('click',event=>{const b=event.target.closest('[data-example-task]');if(b){panel(b.dataset.exampleTask);(b.dataset.exampleTask==='fabrication'?$('tank-support-workspace'):$('tank-task-'+b.dataset.exampleTask))?.scrollIntoView({block:'start'});}});
$('tank-reference').addEventListener('click',event=>{const port=event.target.closest('[data-reference-port]'),view=event.target.closest('[data-reference-view]');if(event.target.closest('[data-reference-fabrication]')){if(fabricationUI.values().assemblies.length){toast('已有分件資料，請在分件頁逐組調整。');return;}fabricationUI.apply(v1102Fabrication());render();panel('fabrication');toast('已補入原圖分件草稿，保留目前槽體與管嘴尺寸；請核對分件是否適用。');}else if(port){panel('nozzles');nozzleUI.select(port.dataset.referencePort);document.getElementById('tank-nozzle-editor').scrollIntoView({block:'start'});}else if(event.target.closest('[data-reference-drawing]')){try{download(tankGeneralArrangement(result),'image/svg+xml;charset=utf-8','桶槽重建配置草圖.svg');}catch(error){toast(error.message);}}else if(view){if(view.dataset.referenceView==='3d')setView('3d');else if(view.dataset.referenceView==='support'){panel('fabrication');location.hash='support';}else panel('nozzles');}});
$('tank-load').addEventListener('click',()=>$('tank-file').click());$('tank-file').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>32000000)throw new Error('專案檔過大。');const loaded=readTankProject(await file.text());if(exampleSession.active)exampleSession.finish();apply(loaded);render();toast('桶槽專案已載入。');}catch(error){toast(error.message);}finally{event.target.value='';}});
$('tank-code-sources').innerHTML=CODE_SOURCES.map(source=>`<a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.label)} ↗</a>`).join('');
try{const saved=localStorage.getItem(key);if(saved){apply(readTankProject(saved));$('tank-project-status').textContent='已還原上次桶槽尺寸。';}}catch{projectDraft.protectSaved();}
if(exampleSession.active){apply(exampleSession.working);nozzleHighlighted=null;}
render();
function openTaskFromHash(){if(location.hash==='#shell')panel('shell');else if(location.hash==='#support'){panel('fabrication');$('tank-support-workspace').scrollIntoView({block:'start'});}}
if(exampleSession.active)setView('3d').then(()=>$('tank-task-size').scrollIntoView({block:'start'}));else openTaskFromHash();window.addEventListener('hashchange',openTaskFromHash);
$('tank-support-entry').addEventListener('click',event=>{if(event.target.closest('[data-open-support]')){panel('fabrication');location.hash='support';$('tank-support-workspace').scrollIntoView({block:'start',behavior:'smooth'});}});
