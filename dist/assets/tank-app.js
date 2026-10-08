import {TANK_DEFAULTS,fieldLabel,tankEnds,TOP_NAMES,BOTTOM_NAMES} from './tank-geometry.js';
import {TOP_ENDS,BOTTOM_ENDS,HORIZONTAL_ENDS,FORMED_ENDS,BUTT_ENDS,END_LABELS} from './tank-heads.js';
import {TankMethodUI} from './tank-method-ui.js';
import {methodCatalog} from './tank-methods.js';
import {endGlyph} from './tank-method-visuals.js';
import {estimateTank,compareTankStocks,stockPreset,stockLabel,shellLayoutLabel} from './tank-materials.js';
import {tankCodeGuide,CODE_SOURCES} from './tank-codes.js';
import {tankProject,readTankProject,tankCSV,tankWorkOrder} from './tank-exports.js';
import {esc,fmt,tankSketch,rollSketch,sheetSketch,assemblySketch,pieceColor,totalsMarkup} from './tank-visuals.js';
import {TankNozzleUI} from './tank-nozzle-ui.js';
import {nozzleIssueKey} from './tank-nozzles.js';
import {mountWorkbenchStatus} from './workbench-status.js';
const $=id=>document.getElementById(id),form=$('tank-inputs'),key='special-method-tank-v1';
let solve='volume',result=null,view='dimensions',viewer=null,viewerPromise=null,spin=false,transparent=false,order='',toastTimer,selectedPiece='S1',nozzleHighlighted=null;
const control=name=>form.querySelector(`[name="${name}"]`);
const nozzleUI=new TankNozzleUI({form,onChange:render,onSelect:id=>{nozzleHighlighted=id;if(id)panel('nozzles');if(result?.valid)renderAssembly();viewer?.setNozzleSelected(id);},onShape:()=>{setConfig({...currentConfig(),top:'flat'});render();},on3D:async()=>{nozzleHighlighted=nozzleUI.selected;if(result?.valid)renderAssembly();await setView('3d');viewer?.setNozzleSelected(nozzleHighlighted);$('tank-3d-area').scrollIntoView({behavior:'smooth',block:'center'});}});
const methodUI=new TankMethodUI({form,onChange:render,openPanel:name=>{panel(name);document.querySelector(`[data-tank-panel="${name}"]`)?.scrollIntoView({behavior:'smooth',block:'start'});}});
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
}
function input(){const values={...TANK_DEFAULTS,solve,nozzles:nozzleUI.values(),methods:methodUI.values()};for(const el of form.querySelectorAll('input[name],select[name]')){if(el.type==='radio'&&!el.checked)continue;values[el.name]=el.value;}return values;}
function renderStocks(p){
  for(const button of form.querySelectorAll('[data-shell-layout]'))button.setAttribute('aria-pressed',String(button.dataset.shellLayout===p.shellLayout));
  for(const button of form.querySelectorAll('[data-seam-layout]'))button.setAttribute('aria-pressed',String(button.dataset.seamLayout===p.seamLayout));
  const comparisons=compareTankStocks(p),complete=comparisons.map(c=>c.result).filter(r=>r.valid&&r.stockComplete),lightest=Math.min(...complete.map(r=>r.stockWeight)),shortest=Math.min(...complete.map(r=>r.weldLength));
  $('tank-stock-options').innerHTML=comparisons.map(c=>{const r=c.result,selected=stockPreset(p)?.id===c.id,badges=r.valid&&r.stockComplete?[Math.abs(r.stockWeight-lightest)<1e-6?'原板最輕':'',Math.abs(r.weldLength-shortest)<1e-6?'筒身接縫最短':''].filter(Boolean):[];return `<button type="button" data-stock="${c.id}" data-stock-width="${c.stockWidth}" data-stock-length="${c.stockLength}" aria-pressed="${selected}" aria-label="選用 ${c.label}" class="tank-stock-option"><span class="tank-stock-title"><strong>${c.label}</strong><span>${selected?'已選用':'選用 →'}</span></span><svg viewBox="0 0 170 55" aria-hidden="true"><rect x="8" y="5" width="${c.stockLength/6096*150}" height="${c.stockWidth/1524*40}" rx="2" fill="#c1dde8" stroke="#5d90a6"/></svg><small>${fmt(c.stockWidth)} × ${fmt(c.stockLength)} mm</small>${r.valid?`<b>${r.stockComplete?r.plateSheets+' 張原板':'底／蓋／封頭放不下'}</b><span>${r.stockComplete?'採購':'可排部分'} ${fmt(r.stockWeight)} kg · 餘料 ${fmt(r.offcutWeight)} kg</span><span>筒身 ${r.courses} 圈 × ${r.panelsPerCourse} 片 · ${r.verticalSeams} 縱縫＋${r.horizontalSeams} 環縫</span><span>筒身焊縫約 ${fmt(r.weldLength/1000,2)} m · 毛坯利用 ${fmt(r.utilization)}%</span>${!r.stockComplete?'<span class="tank-stock-warning">目前底／蓋按整片；須另做拼板配置。</span>':''}`:'<span class="tank-stock-warning">'+esc(r.issues[0].message)+'</span>'}${badges.length?'<span class="tank-stock-badges">'+badges.join(' · ')+'</span>':''}</button>`;}).join('');
  $('tank-stock-current').textContent=`目前：${stockLabel(p)} · ${fmt(Number(p.stockWidth))} × ${fmt(Number(p.stockLength))} mm。${stockPreset(p)?'':'可點上方卡片改用常見尺寸。'}`;
}
function renderAssembly(){
  const r=result;if(!r.valid)return;
  if(!r.assembly.some(piece=>piece.id===selectedPiece))selectedPiece='S1';const piece=r.assembly.find(piece=>piece.id===selectedPiece),s=r.parts[0];
  $('tank-assembly-sketch').innerHTML=assemblySketch(r,{interactive:true,selected:selectedPiece,compact:matchMedia('(max-width:500px)').matches,selectedNozzle:nozzleHighlighted??''});
  $('tank-assembly-summary').textContent=`${shellLayoutLabel(r.input)} · ${r.courses} 圈，每圈 ${r.panelsPerCourse} 片；${r.verticalSeams} 道縱縫＋${r.horizontalSeams} 道環縫，約 ${fmt(r.weldLength/1000,2)} m。`;
  const nozzle=r.nozzlePlan.items.find(n=>n.id===nozzleHighlighted);
  $('tank-3d-selection').textContent=nozzle?`目前選取 ${nozzle.id} ${nozzle.name} · Ø ${fmt(nozzle.od)} mm · 外伸至端面 ${fmt(nozzle.projection)} mm。管端及法蘭外形示意，螺栓孔未建模。`:r.assembly.length>500?'板片超過 500 片，3D 顯示筒身輪廓；完整分片位置見下方展開圖／CSV。':`目前選取 ${piece.id} · 由底第 ${piece.course} 圈第 ${piece.panel} 片 · 原板 #${piece.sheet??'未排入'}。點 3D 板片或管嘴可換選。`;
  $('tank-piece-detail').innerHTML=`<strong>${piece.id} · 從底部第 ${piece.course} 圈，第 ${piece.panel} 片</strong><p>先下料 ${fmt(s.width,2)} × ${fmt(s.height,2)} × t${fmt(s.thickness)} mm；修邊後圓周長 ${fmt(s.finishedWidth,2)} × 高 ${fmt(s.finishedHeight,2)} mm。</p><p>${piece.sheet?`取自原板 #${piece.sheet}：左起 ${fmt(piece.x)}、上起 ${fmt(piece.y)} mm${piece.rotated?'（轉 90° 排料）':''}`:'尚未排入原板'} · 本圈起縫 ${fmt(piece.angle)}°；這片起點 ${fmt(piece.start/r.circumference*360)}°。角度以第 1 圈起縫為 0°，俯視順時針。</p>`;
  $('tank-piece-buttons').innerHTML=r.assembly.slice(0,60).map(piece=>`<button type="button" data-piece="${piece.id}" aria-pressed="${piece.id===selectedPiece}" style="--piece-color:${pieceColor(piece.id)}">${piece.id}<small>第 ${piece.course} 圈</small></button>`).join('')+(r.assembly.length>60?'<p class="tank-note">前 60 片快速選取；完整編號與位置見 CSV。</p>':'');
  const visible=r.sheets.slice(0,12);if(piece.sheet&&!visible.some(sheet=>sheet.id===piece.sheet))visible.push(r.sheets.find(sheet=>sheet.id===piece.sheet));
  $('tank-sheets').innerHTML=visible.map(sheet=>`<article class="tank-sheet"><h4>原板 #${sheet.id} · t${fmt(sheet.thickness)} mm</h4>${sheetSketch(sheet,r,{interactive:true,selected:selectedPiece})}<details><summary>看下料位置尺寸</summary><p>${sheet.placements.slice(0,30).map(item=>`${esc(item.part+item.piece)}：從左 ${fmt(item.x)}、從上 ${fmt(item.y)}；包絡 ${fmt(item.w)} × ${fmt(item.h)} mm`).join('<br>')}${sheet.placements.length>30?'<br>完整座標可下載 CSV。':''}</p></details></article>`).join('')+(r.sheets.length>12?'<p class="tank-note">畫面顯示前 12 張及選取零件所在原板；完整排料見估料單／CSV。</p>':'');
  $('tank-stock-usage').textContent=`本配置原板 ${fmt(r.stockWeight)} kg，已排入毛坯 ${fmt(r.allocatedBlankWeight)} kg，餘料／切割損耗約 ${fmt(r.offcutWeight)} kg（毛坯利用 ${fmt(r.utilization)}%）。${r.stockComplete?'':'未排入的零件尚未計入採購重量。'}`;
  viewer?.setSelected(nozzleHighlighted?null:selectedPiece);
}
function selectPiece(id,origin){if(!result?.valid||!result.assembly.some(piece=>piece.id===id))return;const container=origin?.closest('#tank-piece-buttons,#tank-sheets,#tank-assembly-sketch')?.id,focused=document.activeElement===origin;nozzleHighlighted=null;viewer?.setNozzleSelected(null);selectedPiece=id;renderAssembly();if(focused&&container)document.querySelector(`#${container} [data-piece="${id}"]`)?.focus({preventScroll:true});}
function projectInput(p,r){return {...p,[solve]:Number(r.input[solve].toFixed(solve==='volume'?6:3))};}
function apply(values){solve=values.solve;nozzleUI.apply(values.nozzles);methodUI.apply(values.methods);nozzleHighlighted=nozzleUI.selected;for(const el of form.querySelectorAll('input[name],select[name]')){if(!Object.hasOwn(values,el.name))continue;if(el.type==='radio')el.checked=el.value===values[el.name];else el.value=values[el.name];}}
function toast(message){$('tank-toast').textContent=message;$('tank-toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('tank-toast').hidden=true,4500);}
function download(text,type,name){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function panel(name){for(const el of document.querySelectorAll('[data-tank-panel]'))el.hidden=el.dataset.tankPanel!==name;for(const el of document.querySelectorAll('[data-panel]'))el.setAttribute('aria-pressed',String(el.dataset.panel===name));}
function focusField(name){
  if(name?.startsWith('methods')){panel('methods');methodUI.focus(name);return;}
  if(['shape','orientation','top','bottom'].includes(name)){form.querySelector('.tank-config')?.scrollIntoView({behavior:'smooth',block:'center'});form.querySelector('[data-end]')?.focus({preventScroll:true});return;}
  if(name===solve){toast('這個尺寸目前由程式反算；先選另一組已知尺寸即可自行輸入。');form.querySelector('[data-solve]').focus();return;}
  const el=control(name);if(!el)return;
  const parent=el.closest('[data-tank-panel]');if(parent)panel(parent.dataset.tankPanel);for(let ancestor=el.parentElement;ancestor;ancestor=ancestor.parentElement)if(ancestor.tagName==='DETAILS')ancestor.open=true;
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
function openNozzle(id,field){if(id)nozzleUI.select(id);panel('nozzles');requestAnimationFrame(()=>{const el=field&&form.querySelector(`[data-nozzle-field="${field}"]`);const target=el&&!el.closest('[hidden]')?el:$('tank-nozzle-add')?.closest('section');target?.scrollIntoView({behavior:'smooth',block:'center'});if(el&&!el.closest('[hidden]'))el.focus({preventScroll:true});});}
function renderStatus(p){
  const r=result,issues=[];
  if(!r.valid){for(const issue of r.issues)issues.push({level:'error',text:issue.message,actionLabel:'前往修改',action:()=>focusField(issue.field)});statusStripUpdate({tone:'error',title:'尺寸待修正',detail:'修正後才會估料與出圖',issues,metrics:[]});return;}
  for(const issue of r.materialIssues){const part=[...r.parts].find(x=>x.id===issue.part),end=part?.ends?.[0]??(part?.id?.startsWith('T')?'top':part?.id?.startsWith('B')?'bottom':null);
    issues.push(part?.kind==='circle'&&end&&r.endTypes[end]==='flat'?{level:'error',text:issue.message,actionLabel:'改用拼板',action:()=>{methodUI.set('layout.'+end,'strips');panel('methods');methodUI.select(end);}}:{level:'error',text:issue.message,actionLabel:'修改原板',action:()=>focusField(issue.field)});}
  for(const issue of r.fabrication?.issues??[])issues.push({level:'error',text:'工法：'+issue.message,actionLabel:'修改',action:()=>focusField(issue.field)});
  for(const card of methodCatalog(r))for(const w of card.warnings??[])if(w.level!=='error'||!card.optional)issues.push({level:w.level==='error'?'error':w.level==='info'?'info':'warn',text:`${card.title}：${w.text}`,actionLabel:'看工法',action:()=>{panel('methods');methodUI.select(card.id);}});
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
    metrics:[{label:'幾何容積',value:fmt(r.volume,3),unit:'m³',quiet:true},{label:'空槽估重',value:fmt(r.emptyWeight??r.netWeight),unit:'kg'},{label:'原板',value:r.stockComplete?String(r.plateSheets):'—',unit:r.stockComplete?'張'+(r.formedHeads?`＋${r.formedHeads} 封頭`:''):'待換板'},{label:'焊材',value:r.process?fmt(r.process.weld.totals.consumable,0):'—',unit:'kg',quiet:true}]});
}
function render(){
  const p=input();result=estimateTank(p);for(const el of form.querySelectorAll('[aria-invalid]'))el.removeAttribute('aria-invalid');
  for(const el of form.querySelectorAll('[data-solve]'))el.setAttribute('aria-pressed',String(el.dataset.solve===solve));
  for(const name of ['diameter','height','volume']){const el=control(name);el.readOnly=name===solve;el.setAttribute('aria-label',(name===solve?'反算的':'')+fieldLabel(name));if(name===solve&&result.valid)el.value=Number(result.input[name].toFixed(name==='volume'?6:3));if(name===solve&&!result.valid)el.value='';}
  $('tank-diameter-label').textContent=(p.basis==='inside'?'內徑':'外徑')+' mm';
  const cfg=currentConfig(),butt=[cfg.top,cfg.bottom].some(t=>BUTT_ENDS.includes(t)),horizontalTank=cfg.orientation==='horizontal';
  $('tank-height-label').textContent=horizontalTank?'切線間直段長度 mm':butt?'切線間直段高度 mm':'直筒內部高度 mm';
  $('tank-height-note').textContent=butt||horizontalTank?'直段從一端切線量到另一端切線，包含封頭直邊與對接間隙；總'+(horizontalTank?'長':'高')+'另加兩端深度。':'高度為底板內面到上緣／頂蓋內面的直筒高度；總高另加底／蓋板厚。';
  $('tank-end-label').firstChild.textContent=horizontalTank?'端部估料板厚 mm':cfg.top!=='open'&&Number(p.topThickness)>0?'底部估料板厚 mm':'底／蓋／封頭估料板厚 mm';
  renderConfig();
  $('tank-errors').hidden=result.valid;$('tank-errors').innerHTML=result.valid?'':result.issues.map(issue=>`<button type="button" data-focus="${issue.field}">${esc(issue.message)} →</button>`).join('');for(const issue of result.issues)control(issue.field)?.setAttribute('aria-invalid','true');
  $('tank-sketch').innerHTML=tankSketch(result);$('tank-preview').disabled=!result.valid||result.nozzlePlan?.valid===false||result.fabrication?.valid===false;$('tank-csv').disabled=$('tank-preview').disabled;
  $('tank-dimension-shortcuts').innerHTML=result.valid?`<button type="button" data-focus="diameter">${p.basis==='inside'?'內徑':'外徑'} ${fmt(result.input.diameter)} mm ✎</button><button type="button" data-focus="height">直段 ${fmt(result.height)} mm ✎</button>`:'';
  $('tank-dimension-shortcuts').hidden=view==='3d';
  $('tank-scene-note').textContent=!result.valid?'請先修正尺寸，圖面與 3D 才能更新。':view==='3d'?'拖曳旋轉 · 滾輪／雙指縮放 · 圖面為組立示意':'點直徑／高度標籤，直接修改尺寸。';
  renderCodes(result.valid?result.input:p);
  renderStocks(p);
  nozzleUI.render(result);
  methodUI.render(result);
  $('tank-assembly').hidden=!result.valid;$('tank-stock-usage').hidden=!result.valid;
  if(!result.valid){$('tank-totals').innerHTML='<div class="tank-total"><span>尺寸待修正</span><p>修正上方標記欄位後，估料與圖面會重新出現。</p></div>';$('tank-parts').replaceChildren();$('tank-sheets').replaceChildren();$('tank-rolling').replaceChildren();$('tank-material-issues').hidden=true;$('tank-assumptions').replaceChildren();$('tank-viewer').hidden=true;viewer?.setActive(false);renderStatus(p);return;}
  const r=result,s=r.parts[0];$('tank-viewer').hidden=false;
  $('tank-totals').innerHTML=totalsMarkup(r);
  $('tank-material-issues').hidden=!r.materialIssues.length;$('tank-material-issues').innerHTML=r.materialIssues.map(issue=>`<button type="button" data-focus="${issue.field}">${esc(issue.message)} → 修改原板</button>`).join('');
  for(const issue of r.materialIssues)control(issue.field)?.setAttribute('aria-invalid','true');
  $('tank-parts').innerHTML=r.parts.map(part=>`<article class="tank-part"><div class="tank-part-head"><h3>${esc(part.id+' · '+part.name)}</h3><span>${part.quantity} ${part.kind==='formed'?'只':'片'}</span></div><p class="tank-cut-size">${part.kind==='formed'?'內徑 '+fmt(r.di)+' · t'+fmt(part.thickness)+' mm':part.kind==='circle'?'先下料 Ø '+fmt(part.blankDiameter,2)+' × t'+fmt(part.thickness)+' mm':'先下料 '+fmt(part.width,2)+' × '+fmt(part.height,2)+' × t'+fmt(part.thickness)+' mm'}</p><p>${part.kind==='rectangle'?`修邊後 ${fmt(part.finishedWidth,2)} × ${fmt(part.finishedHeight,2)} mm · ${r.courses} 圈，每圈 ${r.panelsPerCourse} 片`:part.finishedDiameter?'成品圓徑 '+fmt(part.finishedDiameter,2)+' mm':`封頭深度約 ${fmt(r.headDepth)} mm · 直邊 ${fmt(r.input.headStraight)} mm${part.weightEstimated?' · 重量按曲面概算':''}`}</p><p>成品估重 ${fmt(part.netWeight)} kg${part.sheetIDs.length?' · 排在原板 #'+part.sheetIDs.slice(0,8).join('、#')+(part.sheetIDs.length>8?'…':''):part.kind==='formed'?' · 向封頭廠商訂製':' · 尚未排入原板'}</p></article>`).join('');
  renderAssembly();
  $('tank-assumptions').innerHTML='<ul>'+r.notes.map(note=>'<li>'+esc(note)+'</li>').join('')+'</ul>';
  $('tank-rolling').innerHTML=`<ol class="tank-rolling-list"><li>板厚中面周長：π ×（${fmt(r.di)}＋${fmt(r.input.shellThickness)}）= <b>${fmt(r.circumference,2)} mm</b>。</li><li>每圈 ${r.panelsPerCourse} 片；縱向接縫各留 ${fmt(r.input.gap)} mm，修邊後每片長 <b>${fmt(s.finishedWidth,2)} mm</b>。</li><li>分 ${r.courses} 圈；圈間接縫共 ${fmt((r.courses-1)*r.input.gap)} mm，修邊後每片高 <b>${fmt(s.finishedHeight,2)} mm</b>。</li><li>各邊留 ${fmt(r.input.trim)} mm：先下料 <b>${fmt(s.width,2)} × ${fmt(s.height,2)} mm</b>。預彎、夾持與焊接收縮餘量依機台與工法另確認。</li><li>筒身共有 ${r.verticalSeams} 道縱縫、${r.horizontalSeams} 道環縫，接縫中心線總長約 ${fmt(r.weldLength/1000,2)} m（底蓋／封頭與附件另計）。接縫錯位、坡口與間隙依圖說及 WPS。</li></ol>${[r.endTypes.top,r.endTypes.bottom].some(t=>BUTT_ENDS.includes(t))?'<p class="tank-note">筒身高度已扣除對接端部的直邊及端部對接間隙。封頭毛坯由供應商確認；不把曲面面積當成下料圓徑。</p>':''}`;
  renderStatus(p);
  if(r.nozzlePlan.valid)try{localStorage.setItem(key,tankProject(projectInput(p,r)));}catch{/* Storage is optional. */}
  if(viewer){viewer.update(r);viewer.setSelected(nozzleHighlighted?null:selectedPiece);viewer.setNozzleSelected(nozzleHighlighted);viewer.setTransparent(transparent);viewer.setActive(view==='3d');}
}
async function setView(next){
  view=next;for(const el of document.querySelectorAll('[data-tank-view]'))el.setAttribute('aria-pressed',String(el.dataset.tankView===view));$('tank-sketch').hidden=view==='3d';$('tank-3d-area').hidden=view!=='3d';
  $('tank-dimension-shortcuts').hidden=view==='3d';
  $('tank-scene-note').textContent=view==='3d'?'拖曳旋轉 · 滾輪／雙指縮放 · 圖面為組立示意':'點直徑／高度標籤，直接修改尺寸。';
  if(view!=='3d'){viewer?.setActive(false);return;}
  if(!result.valid){$('tank-scene-note').textContent='請先修正尺寸，3D 才能更新。';return;}
  if(!viewer){
    if(!viewerPromise){$('tank-viewer').textContent='正在準備桶槽 3D…';viewerPromise=import('./tank-viewer.js').then(({TankViewer})=>{viewer=new TankViewer($('tank-viewer'),selectPiece,id=>nozzleUI.select(id));if(result.valid)viewer.update(result);viewer.setSelected(nozzleHighlighted?null:selectedPiece);viewer.setNozzleSelected(nozzleHighlighted);viewer.setSpin(spin);viewer.setTransparent(transparent);viewer.setActive(view==='3d'&&result.valid);}).catch(()=>{viewerPromise=null;$('tank-viewer').textContent='3D 未能載入；可切回尺寸圖繼續估料，再重新點「旋轉 3D」重試。';});}await viewerPromise;
  }else{viewer.resize();viewer.setActive(result.valid);}
}
form.addEventListener('submit',event=>event.preventDefault());form.addEventListener('input',event=>{if(!methodUI.edit(event.target))nozzleUI.edit(event.target);render();});form.addEventListener('change',event=>{if(event.target.id==='tank-same-ends'){const e=currentConfig();if(event.target.checked)setConfig({...e,top:e.bottom});}if(!methodUI.edit(event.target))nozzleUI.edit(event.target);render();});
matchMedia('(max-width:500px)').addEventListener('change',()=>{if(result?.valid)renderAssembly();});
form.addEventListener('click',event=>{
  const config=event.target.closest('[data-orientation],[data-end]');
  if(config){const e=currentConfig();
    if(config.dataset.orientation){const o=config.dataset.orientation;if(o==='horizontal'){const ok=t=>HORIZONTAL_ENDS.includes(t);setConfig({orientation:o,top:ok(e.top)?e.top:'elliptical',bottom:ok(e.bottom)?e.bottom:'elliptical'});}else setConfig({...e,orientation:o});}
    else{const which=config.dataset.end,value=config.dataset.value,same=e.orientation==='horizontal'&&$('tank-same-ends').checked;setConfig(same?{...e,top:value,bottom:value}:{...e,[which]:value});}
    const focus=config.dataset.end?`[data-end="${config.dataset.end}"][data-value="${config.dataset.value}"]`:`[data-orientation="${config.dataset.orientation}"]`;render();form.querySelector(focus)?.focus({preventScroll:true});return;}
  const button=event.target.closest('[data-solve],[data-panel],[data-focus],[data-tank-view],[data-stock],[data-shell-layout],[data-seam-layout],[data-piece]');if(!button)return;
  if(button.dataset.solve){solve=button.dataset.solve;render();}
  else if(button.dataset.panel)panel(button.dataset.panel);
  else if(button.dataset.focus)focusField(button.dataset.focus);
  else if(button.dataset.tankView)setView(button.dataset.tankView);
  else if(button.dataset.stock){const id=button.dataset.stock,focused=document.activeElement===button;control('stockWidth').value=button.dataset.stockWidth;control('stockLength').value=button.dataset.stockLength;render();if(focused)form.querySelector(`[data-stock="${id}"]`)?.focus({preventScroll:true});}
  else if(button.dataset.shellLayout){control('shellLayout').value=button.dataset.shellLayout;render();}
  else if(button.dataset.seamLayout){control('seamLayout').value=button.dataset.seamLayout;render();}
  else if(button.dataset.piece)selectPiece(button.dataset.piece,button);
});
form.addEventListener('keydown',event=>{const target=event.target.closest('svg [data-focus],svg [data-piece]');if(target&&['Enter',' '].includes(event.key)){event.preventDefault();if(target.dataset.piece)selectPiece(target.dataset.piece,target);else focusField(target.dataset.focus);}});
$('tank-piece-3d').addEventListener('click',async()=>{await setView('3d');$('tank-3d-area').scrollIntoView({behavior:'smooth',block:'center'});});
$('tank-spin').addEventListener('click',()=>{spin=!spin;viewer?.setSpin(spin);$('tank-spin').setAttribute('aria-pressed',String(spin));});
$('tank-transparent').addEventListener('click',()=>{transparent=!transparent;viewer?.setTransparent(transparent);$('tank-transparent').setAttribute('aria-pressed',String(transparent));});$('tank-reset').addEventListener('click',()=>viewer?.reset());
$('tank-preview').addEventListener('click',()=>{try{order=tankWorkOrder(result);$('tank-print-frame').srcdoc=order;$('tank-print-preview').showModal();}catch(error){toast(error.message);}});$('tank-close-preview').addEventListener('click',()=>$('tank-print-preview').close());
$('tank-download-order').addEventListener('click',()=>download(order,'text/html;charset=utf-8','桶槽估料單.html'));$('tank-print-order').addEventListener('click',()=>{const frame=$('tank-print-frame');frame.contentWindow.focus();frame.contentWindow.print();});
$('tank-csv').addEventListener('click',()=>{try{download(tankCSV(result),'text/csv;charset=utf-8','桶槽估料.csv');}catch(error){toast(error.message);}});
$('tank-save').addEventListener('click',()=>{if(!result.valid||!result.nozzlePlan.valid){toast('先修正尺寸與管嘴資料，再儲存專案。');return;}download(tankProject(projectInput(input(),result)),'application/json','桶槽專案.json');});
$('tank-load').addEventListener('click',()=>$('tank-file').click());$('tank-file').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>100000)throw new Error('專案檔過大。');apply(readTankProject(await file.text()));render();toast('桶槽專案已載入。');}catch(error){toast(error.message);}finally{event.target.value='';}});
$('tank-code-sources').innerHTML=CODE_SOURCES.map(source=>`<a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.label)} ↗</a>`).join('');
try{const saved=localStorage.getItem(key);if(saved){apply(readTankProject(saved));$('tank-project-status').textContent='已還原上次桶槽尺寸。';}}catch{/* A damaged or older project must not prevent startup. */}
render();
