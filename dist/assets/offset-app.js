import {DEFAULT_OFFSET,computeOffset} from './offset-geometry.js';
import {ASME_PIPE_SIZES} from './pipe-sizes.js';
import {nominalElbowRadius} from './elbow-input.js';
import {esc,fmt,offsetProjectJSON,readOffsetProject,offsetCSV,buildOffsetWorkOrder,buildOffsetStripPaper,offsetStripPlan,referencesHTML} from './offset-exports.js';
import {offsetDiagramSVG} from './offset-diagram.js';
import {elbowFabricationSVG,elbowCutSteps} from './offset-fabrication.js';
import {AXIS_OPTIONS,compareOffsetFit} from './offset-ports.js';
import {compareRoutePlans,originalRoutePlan,processClass,PROCESS_NAMES,retainedRouteFrame,routeSearchScope} from './offset-planner.js';
import {routePlanTitle,buildRoutePlanWorkOrder,routePlanCSV} from './offset-plan-exports.js';
import {assemblySVG,pipeFabricationSVG,materialRows,cutClockSVG} from './offset-workflow-ui.js';
import {offsetRecoveryItems,offsetFieldRoute,nextOffsetAction} from './offset-recovery.js';
import {portScene,sceneDragDelta,SCENE_VIEWS,directionIcon,stockElbowSVG,elbowIcon,weldSketchSVG} from './offset-input-visuals.js';
import {COMPONENT_NAMES,CONNECTION_NAMES,validateComponents,componentTargetLabel,installRouteComponents} from './offset-components.js';
import {partName,componentIcon,componentFabricationSVG} from './offset-component-ui.js';
import {mountWorkbenchStatus} from './workbench-status.js';

const $=id=>document.getElementById(id),storageKey='special-method-offset-v1';
const supplyKeys=['Kind','Donor','Radius','RadiusMethod','MeasuredArc','FactoryAngle','Takeout','Tangent'];
let params={...DEFAULT_OFFSET,basis:'ports',solve:'run',layout:'rolling',run:800},id='OFF-001',result,baseline=null,stage=1,sharedStock=true,activePlan=null,routePlans=null,planGeneration=0,piece='P1',selected=0,showErrors=false;
let editor='position',selectedPort=null,sceneView='iso',sceneFrame=null,dragState=null,dragTick=null,suppressPortClick=0;
let issues=[],activeIssueId=null,attemptedCalculation=false,searchPending=false;
let viewer=null,viewerPromise=null,view='offset',printHTML='',printTitle='',toastTimer;
let solutionViewer=null,solutionViewerPromise=null,solutionView='3d',solutionViewerPlan=null,solutionViewerFailed=false;
let componentDraft=null,componentIssues=[],legacyNotices=[];
function toast(message){$('offset-toast').textContent=message;$('offset-toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('offset-toast').hidden=true,4500);}
const number=value=>value.trim()===''?null:Number(value);
const nps=()=>ASME_PIPE_SIZES.find(p=>p.odMm===params.od)?.nps??'custom';
function field(name,label,value,help=''){return `<div class="field"><label for="offset-${name}">${label}</label><input id="offset-${name}" name="${name}" type="number" step="any" inputmode="decimal" value="${value??''}">${help?`<small>${help}</small>`:''}</div>`;}
function suppliesMatch(){const keys=params.aKind==='factory'?['Kind','FactoryAngle','Takeout','Tangent']:['Kind','Donor','RadiusMethod',params.aRadiusMethod==='radius'?'Radius':'MeasuredArc','Tangent'];return keys.every(k=>params['a'+k]===params['b'+k]);}
function copySupply(){for(const k of supplyKeys)params['b'+k]=params['a'+k];elbowFields('b');}
function elbowFields(end){
  const open=$('elbow-'+end+'-fields').querySelector('.supply-details')?.open??false;
  const kind=params[end+'Kind'],method=params[end+'RadiusMethod'],ports=params.basis==='ports',radius=nominalElbowRadius(nps(),'lr');
  const main=kind==='factory'?field(end+'FactoryAngle','現成角度 °',params[end+'FactoryAngle'])+field(end+'Takeout','中心至接合端面 mm',params[end+'Takeout']):field(end+'Donor','原彎頭角度 °',params[end+'Donor'])+(ports&&method!=='radius'?field(end+'MeasuredArc',method==='outerArc'?'完整外背弧 mm':'完整內腹弧 mm',params[end+'MeasuredArc']):field(end+'Radius','中心線半徑 Rc mm',params[end+'Radius']));
  $('elbow-'+end+'-fields').innerHTML=`<p class="supply-mode-help">原件可切成所需角度；整支使用保持原角度。</p><div class="supply-choice-grid">${[['cut','90° 原件',90],['cut','45° 原件',45],['factory','整支 '+fmt(params[end+'FactoryAngle'])+'°',params[end+'FactoryAngle']]].map(([k,label,angle])=>`<button type="button" class="visual-choice" data-supply-kind="${k}"${k==='cut'?` data-donor="${angle}"`:''} data-supply-end="${end}" aria-pressed="${kind===k&&(k==='factory'||params[end+'Donor']===angle)}">${elbowIcon(angle)}<span>${label}</span></button>`).join('')}</div><div id="stock-sketch-${end}" class="stock-sketch">${stockElbowSVG(params,end)}</div>${kind==='cut'&&radius?`<button type="button" class="stock-preset" data-radius-end="${end}">帶入 ${esc(nps())} 吋 90° LR：Rc ${fmt(radius)}</button>`:''}<details class="workflow-advanced supply-details"${open?' open':''}><summary>輸入精確尺寸／供料細節</summary><div class="fields-grid">${main}</div><div class="field"><label for="offset-${end}Kind">彎頭取得方式</label><select id="offset-${end}Kind" name="${end}Kind"><option value="cut"${kind==='cut'?' selected':''}>原件切成需要角度</option><option value="factory"${kind==='factory'?' selected':''}>現成固定角度</option></select></div>${kind==='cut'&&ports?`<div class="field"><label for="offset-${end}RadiusMethod">半徑怎麼取得？</label><select id="offset-${end}RadiusMethod" name="${end}RadiusMethod">${[['radius','直接填 Rc／型錄尺寸'],['outerArc','捲尺量完整外背弧'],['innerArc','捲尺量完整內腹弧']].map(([v,t])=>`<option value="${v}"${method===v?' selected':''}>${t}</option>`).join('')}</select></div><p class="offset-help">完整弧長排除兩端直段；Rc 不是外背半徑。</p>`:''}${ports&&kind!=='factory'?field(end+'Tangent','保留端自帶直段 mm',params[end+'Tangent'],'從端面量到圓弧起點；明確無直段填 0。'):''}</details>`;
}
function portFields(){
  $('port-orientation-fields').innerHTML=['a','b'].map(end=>`<div class="port-direction"><div class="field"><label for="offset-${end}Axis">${end.toUpperCase()} 口朝向</label><select id="offset-${end}Axis" name="${end}Axis">${[...Object.keys(AXIS_OPTIONS).map(k=>[k,k[1]+k[0].toUpperCase()]),['custom','自訂斜向']].map(([v,t])=>`<option value="${v}"${params[end+'Axis']===v?' selected':''}>${t}</option>`).join('')}</select></div><div class="fields-grid offset-vector" id="${end}-axis-vector"${params[end+'Axis']==='custom'?'':' hidden'}>${['X','Y','Z'].map(k=>field(end+'Axis'+k,k+' 分量',params[end+'Axis'+k])).join('')}</div></div>`).join('')+'<p class="field-note">朝向＝從既有管內，穿過管口朝新接管。常見相向：A +X、B −X。</p>';
  $('port-shift-fields').innerHTML=['a','b'].map(end=>`<p class="offset-help">${end.toUpperCase()} 標記點 → 端面中心</p><div class="fields-grid offset-vector">${['X','Y','Z'].map(k=>field(end+'Shift'+k,'Δ'+k+' mm',params[end+'Shift'+k])).join('')}</div>`).join('');
}
function readInputs(){for(const key of Object.keys(DEFAULT_OFFSET)){const c=$('offset-inputs').elements.namedItem(key);if(c)params[key]=typeof DEFAULT_OFFSET[key]==='number'?number(c.value):c.value;}}
function syncInputs(){
  for(const key of Object.keys(DEFAULT_OFFSET)){const c=$('offset-inputs').elements.namedItem(key);if(c)c.value=params[key]??'';}
  $('offset-nps').value=nps();$('offset-id').value=id;sharedStock=suppliesMatch();$('offset-same-stock').checked=sharedStock;elbowFields('a');elbowFields('b');portFields();syncVisibility();
}
function gapKeys(){return params.basis==='ports'?['aPortGap','aGap','bGap','bPortGap']:['aGap','bGap'];}
function syncVisibility(){
  const ports=params.basis==='ports',rolling=params.layout==='rolling',angle=!ports&&params.solve==='angle';
  $('port-datum-fields').hidden=!ports;$('port-orientation-fields').hidden=!ports;$('legacy-solve-fields').hidden=ports;$('port-shift-fields').hidden=params.datum!=='marks';
  $('roll-field').hidden=!rolling;$('angle-field').hidden=!angle;$('run-field').hidden=angle;$('offset-plans').hidden=!ports;$('gap-g1').hidden=!ports;$('gap-g4').hidden=!ports;
  for(const key of ['trimA','trimB','minStraight'])$('offset-'+key).closest('.field').hidden=!ports;
  $('rise-label').textContent=ports?'Z 高低 mm':'高低差 Set mm';document.querySelector('label[for="offset-run"]').textContent=ports?'X 前後 mm':'理論交點 Run mm';
  for(const end of ['a','b'])$(end+'-axis-vector').hidden=params[end+'Axis']!=='custom';
  $('stock-b-section').hidden=sharedStock;$('stock-a-title').textContent=sharedStock?'兩端彎頭':'A 端彎頭';$('stock-a-title').hidden=sharedStock;
  $('plan-margin-field').hidden=params.planSpaceLimit!=='margin'&&document.activeElement?.name!=='planMargin';
  document.querySelector('.offset-plan-options summary').textContent=`比較條件：${{welds:'焊口少',easy:'加工容易',compact:'空間小'}[params.planPreference]??'請選排序'}，上限 ${params.planMaxJoints??'—'} 個焊口`;
  const values=gapKeys().map(k=>params[k]),same=values.every(v=>v===values[0]);
  if(document.activeElement!==$('offset-all-gap'))$('offset-all-gap').value=same?(values[0]??''):'';
  $('offset-all-gap').placeholder=same?'':'各焊口不同';$('gap-shared-note').textContent=same?'依現場工法／WPS 填寫。':'目前各別間隙不同，展開下方可修改；填此欄會統一間隙。';
  $('measurement-help').textContent=ports?'同一個 XYZ 基準，從 A 量到 B。選邊緣／標記點時，補各端到中心的修正量。':'Run／Travel 從中心線理論交點量，不能填既有管口端面間距。切換模式後須重新核對量測基準。';
}
function originalView(){
  const plan=originalRoutePlan(result);componentIssues=plan?.componentIssues??[];if(plan?.valid){const elements=plan.elements.map(e=>e.type==='elbow'?{...e,id:e.index===0?'A':'B',end:e.index===0?'A':'B'}:e);return {...plan,elements,elbows:elements.filter(e=>e.type==='elbow')};}
  if(params.components.length)return null;
  if(!result.valid)return null;
  const elbow=(end)=>({...result.elbows[end],id:end.toUpperCase(),type:'elbow',process:result.elbows[end].kind==='factory'?'full':processClass(result.elbows[end].angle,result.elbows[end].donor)}),pipe={id:'P1',type:'pipe',length:result.cutLength,blankLength:result.blankLength};
  return {valid:true,original:true,legacy:true,elements:[elbow('a'),pipe,elbow('b')],elbows:[elbow('a'),elbow('b')],pipes:[pipe],jointCount:2,params:result.params};
}
const workRoute=()=>activePlan??baseline;
function renderComponentPanel(){
  $('component-panel').hidden=params.basis!=='ports'&&!params.components.length;
  $('component-list').innerHTML=params.components.length?`<div class="component-chips">${params.components.map(c=>`<button type="button" class="component-chip" data-edit-component="${c.id}">${componentIcon(c.kind)}<span>${esc(c.id)} ${esc(c.name||COMPONENT_NAMES[c.kind])}<small>${esc(componentTargetLabel(c.target))} · ${fmt(c.length)} mm</small></span></button>`).join('')}</div>`:'';
  const plan=workRoute(),over=plan?.components?.length&&plan.jointCount>params.planMaxJoints;
  $('component-fit-message').innerHTML=!plan&&componentIssues.length?componentIssues.map(message=>`<p>${esc(message)}</p>`).join('')+'<button type="button" class="button" data-component-search>找放得下零件的接法 →</button>':over?`<p>此接法含零件後有 ${plan.jointCount} 個現場焊口，超過建議搜尋上限 ${params.planMaxJoints} 個。</p><button type="button" class="button" data-component-joint-limit="${plan.jointCount}">提高到 ${plan.jointCount} 個焊口，再比較接法 →</button>`:'';
  if(!plan&&params.components.length&&!routePlans?.plans.length&&routePlans?.requiredJoints)$('component-fit-message').insertAdjacentHTML('beforeend',`<p>找到的接法含指定零件後至少 ${routePlans.requiredJoints} 個焊口，目前上限 ${params.planMaxJoints} 個。</p><button type="button" class="button" data-component-joint-limit="${routePlans.requiredJoints}">提高到 ${routePlans.requiredJoints} 個焊口，再比較接法 →</button>`);
}
function openComponentEditor(target=null,id=null){
  const existing=params.components.find(c=>c.id===id||!id&&c.target===target);
  const used=new Set(params.components.map(c=>c.target)),available=['s1','a','b','s2','s3'].find(t=>!used.has(t));
  if(!existing&&!available){toast('各位置已有零件，點現場零件圖卡修改整組尺寸。');return;}
  const nextID='C'+(Math.max(0,...params.components.map(c=>Number(c.id.slice(1))))+1),gap=params.planExtraGap??0;
  componentDraft=existing?{...existing}:{id:nextID,kind:'valve',name:'',target:target&&!used.has(target)?target:available,length:null,leftConnection:'weld',rightConnection:'weld',leftGap:gap,rightGap:gap,placement:'center',distance:0,internalBolts:0};
  const source=workRoute()?.basePlan??workRoute();
  $('component-target').innerHTML=['a','s1','s2','s3','b'].map(t=>{const slot=t==='a'?0:t==='b'?source?.elbows.length:Number(t.slice(1)),pipe=source?.pipes?.find(e=>e.slot===slot);return `<option value="${t}"${used.has(t)&&t!==existing?.target?' disabled':''}>${esc(componentTargetLabel(t))}${pipe?'（'+esc(pipe.id)+'）':''}</option>`;}).join('');
  for(const key of ['target','length','name','leftConnection','rightConnection','leftGap','rightGap','placement','distance','internalBolts'])$('component-'+key).value=componentDraft[key]??'';
  $('component-editor-title').textContent=existing?'修改 '+existing.id+' · '+(existing.name||COMPONENT_NAMES[existing.kind]):'加入現場零件';$('component-remove').hidden=!existing;
  $('component-form-error').hidden=true;renderComponentDraft();$('component-editor').showModal();$('component-length').focus();
}
function readComponentDraft(){
  for(const key of ['target','length','name','leftConnection','rightConnection','leftGap','rightGap','placement','distance','internalBolts'])componentDraft[key]=['length','leftGap','rightGap','distance','internalBolts'].includes(key)?number($('component-'+key).value):$('component-'+key).value;
  if(componentDraft.placement==='center'||['a','b'].includes(componentDraft.target))componentDraft.distance=0;
}
function renderComponentDraft(){
  $('component-kind-options').innerHTML=Object.entries(COMPONENT_NAMES).map(([kind,name])=>`<button type="button" data-component-kind="${kind}" aria-pressed="${componentDraft.kind===kind}">${componentIcon(kind)}${name}</button>`).join('');
  $('component-sketch').innerHTML=componentFabricationSVG({...componentDraft,type:'component'});
  const atPort=['a','b'].includes(componentDraft.target);$('component-position-fields').hidden=atPort;$('component-distance-field').hidden=componentDraft.placement==='center';$('component-distance-label').textContent=(componentDraft.placement==='fromB'?'B':'A')+' 側成品直管長 mm';
}
async function applyComponents(next){
  const previous=activePlan?{...(activePlan.basePlan??activePlan),id:activePlan.id}:null;params.components=next;result=computeOffset(params);baseline=originalView();invalidatePlans();
  if(previous){const current=installRouteComponents({...previous,params:result.params,context:{...previous.context,params:result.params}},next,previous.original?params.minStraight:Math.max(params.minStraight,params.planMinPipe));if(current?.valid)activePlan=current;else componentIssues=current?.componentIssues??componentIssues;}
  $('component-editor').close();piece='P1';selected=0;stage=2;renderSolution();renderWork();saveDraft();focusStage();
  if(!workRoute()?.valid&&result.context){$('offset-plans').open=true;await comparePlans();}
}
const projectReady=()=>result.valid||params.basis==='ports'&&Boolean(result.context);
function saveDraft(){if(projectReady())try{localStorage.setItem(storageKey,offsetProjectJSON(params,id));}catch{}}
function metrics(items){return `<dl class="workflow-metrics">${items.map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`;}
function renderErrors(){
  issues=offsetRecoveryItems(result,{sharedStock});
  const visible=showErrors&&issues.length>0&&!activePlan&&!(params.basis==='ports'&&result.context);
  $('offset-errors').hidden=!visible;
  $('offset-errors').innerHTML=visible?`<div><strong>${issues.length} 處需要處理</strong><span>${esc(issues[0].title)}</span></div><button type="button" class="button" data-recovery-issue="${esc(issues[0].id)}">帶我修正 →</button>${issues.length>1?`<details><summary>查看其他問題</summary>${issues.slice(1).map(i=>`<button type="button" data-recovery-issue="${esc(i.id)}">${esc(i.title)} →</button>`).join('')}</details>`:''}`:'';
  const current=issues.find(i=>i.id===activeIssueId)??issues.find(i=>i.route.editor===editor)??issues[0];
  $('offset-repair').hidden=!visible||stage!==1||!(current?.route.editor===editor||current?.secondary.some(a=>a.route.editor===editor));
  $('offset-repair').innerHTML=current?`<h3>${esc(current.title)}</h3><p>${esc(current.detail)}</p><div class="recovery-actions"><button type="button" data-recovery-issue="${esc(current.id)}">${esc(current.actionLabel)} →</button>${current.secondary.map((a,index)=>`<button type="button" data-recovery-secondary="${esc(current.id)}" data-secondary-index="${index}">${esc(a.label)} →</button>`).join('')}${current.canCompare?'<button type="button" data-recovery-compare>比較其他接法 →</button>':''}</div>`:'';
  for(const node of document.querySelectorAll('[data-recovery-feedback]'))node.remove();
  for(const c of document.querySelectorAll('[data-core-issue]')){c.removeAttribute('aria-invalid');c.removeAttribute('aria-describedby');c.removeAttribute('data-core-issue');c.closest('.field')?.classList.remove('needs-review');}
  for(const i of visible?issues:[]){const c=controlFor(i.sourceRoute.field);if(!c)continue;const feedback=document.createElement('small');feedback.id='recovery-'+i.sourceRoute.field;feedback.dataset.recoveryFeedback='true';feedback.className='field-feedback';feedback.textContent=i.reason;c.dataset.coreIssue=i.id;c.setAttribute('aria-describedby',feedback.id);if(i.inputError)c.setAttribute('aria-invalid','true');else c.closest('.field')?.classList.add('needs-review');c.closest('.field')?.append(feedback);}
  document.querySelectorAll('[data-editor-tab]').forEach(b=>{const count=visible?issues.filter(i=>i.route.editor===b.dataset.editorTab).length:0;b.querySelector('.recovery-count')?.remove();if(count)b.insertAdjacentHTML('beforeend',`<span class="recovery-count" aria-label="${count} 處需要處理">${count}</span>`);});
  document.querySelectorAll('.scene-issue').forEach(el=>el.classList.remove('scene-issue'));
  if(visible)for(const i of issues){const f=i.sourceRoute.field;let selectors=[];if(['run','roll','rise'].includes(f))selectors=[`[data-dimension="${f}"]`];else if(/^[ab]Axis/.test(f))selectors=[`[data-port="${f[0]}"]`,`[data-endpoint="${f[0]}"]`];else if(/Gap$/.test(f))selectors=[`[data-gap="${f}"]`];else selectors=[`[data-supply-field="${f}"]`];for(const sel of selectors)document.querySelectorAll(sel).forEach(el=>el.classList.add('scene-issue'));}
}
function controlFor(field){const choices=[...document.querySelectorAll(`[name="${CSS.escape(field)}"]`)];return choices.find(c=>c.type==='radio'&&c.checked)??choices[0]??null;}
function jumpToRecovery(item,override=null){
  if(!item)return;showErrors=true;activeIssueId=item.id;
  const route=override??item.route;stage=route.stage;updateStages();
  if(stage===1){selectedPort=route.graphicalAxis?route.end:null;setEditor(route.editor);renderInputVisuals();renderErrors();}
  else{$('offset-plans').open=true;document.querySelector('.offset-plan-options').open=true;if(route.field==='planMargin')$('plan-margin-field').hidden=false;}
  let c=controlFor(route.field);
  if(route.graphicalAxis)c=$('direction-options').querySelector(`[data-axis-choice="${params[route.field]}"]`)??$('direction-options').querySelector('button');
  if(c){for(let d=c.closest('details');d;d=d.parentElement?.closest('details'))d.open=true;c.closest('.field')?.scrollIntoView({block:'center',behavior:'instant'});c.focus({preventScroll:true});if(!c.closest('.field'))c.scrollIntoView({block:'center',behavior:'instant'});}
  else{$('offset-repair').scrollIntoView({block:'center',behavior:'instant'});}
  updateStages();
}
function nextWorkflow(){
  const action=nextOffsetAction({stage,editor,attempted:attemptedCalculation,valid:Boolean(workRoute()?.valid),issues,comparison:routePlans});
  if(action.action==='repair'){showErrors=true;renderErrors();jumpToRecovery(action.issue);}
  else if(action.action==='editor'){setEditor(action.editor);if(phoneLayout.matches)document.querySelector('.input-editor').scrollIntoView({block:'start',behavior:'instant'});}
  else if(action.action==='calculate')goTo(2);
  else if(action.action==='search')exploreOtherRoutes();
  else if(action.action==='choose')focusRouteChoices();
  else if(action.action==='limits')jumpToRecovery({id:'plan-check',route:offsetFieldRoute('planMaxJoints',params)});
  else if(action.action==='comparison-repair')jumpToRecovery({id:'plan-check',route:offsetFieldRoute(action.issue.field,params)});
  else if(action.action==='work')goTo(3);
  else preview('order');
}
async function exploreOtherRoutes(){
  if(!result.context){showErrors=true;renderErrors();jumpToRecovery(issues[0]);return;}
  attemptedCalculation=true;stage=2;renderSolution();$('offset-plans').open=true;await comparePlans();focusStage();
}
function focusStage(){window.scrollTo({top:0,behavior:'instant'});const h=document.querySelector(`[data-stage="${stage}"] .workflow-stage-head h2`);h.tabIndex=-1;h.focus({preventScroll:true});}
function focusRouteChoices(){
  stage=2;renderSolution();$('offset-plans').open=true;
  $('offset-plan-status').textContent='請點下方一張接法圖卡，查看組立圖、管長與加工方式。';
  const card=$('offset-plan-cards').querySelector('button');
  card?.scrollIntoView({block:'center',behavior:'instant'});card?.focus({preventScroll:true});
}
function renderRouteContext(){
  const scope=routeSearchScope(params),unavailable=params.basis==='ports'&&result.context&&!baseline;
  const box=$('offset-route-context');box.hidden=params.basis!=='ports'||!unavailable&&!scope.limitedByWelds;if(box.hidden)return;
  const candidates=routePlans?.valid?routePlans.plans.filter(p=>!p.original).length:0;
  const title=unavailable?(activePlan?`已選 ${activePlan.elbows.length} 彎頭接法，${activePlan.jointCount} 個焊口。`:searchPending?'正在搜尋其他接法…':candidates?`找到 ${candidates} 個接法，請點圖卡選擇。`:'原兩彎頭接法不成立，改比較其他配置。'):'目前的焊口上限限制了彎頭數。';
  box.innerHTML=`<strong>${esc(title)}</strong><p>搜尋最多 ${fmt(params.planMaxElbows)} 個彎頭、${fmt(params.planMaxJoints)} 個焊口（含兩端）。${scope.limitedByWelds?`此焊口上限實際只容許 ${scope.effectiveElbows} 個彎頭；三彎頭至少需 6 個焊口，四彎頭至少需 8 個。`:''}</p>${scope.canExpand?'<button type="button" class="button" data-expand-search>允許搜尋 3／4 彎頭（最多 8 焊口） →</button>':''}${unavailable?`<small>新增供料 ${fmt(params.planExtraDonor)}°／Rc ${fmt(params.planExtraRadius)} mm · 新增焊口間隙 ${fmt(params.planExtraGap)} mm，可在比較條件修改。</small><details><summary>查看原兩彎頭接法的限制</summary><p>${result.errors.map(e=>esc(e.message)).join('<br>')}<br>這些限制只針對原兩彎頭配置；候選接法各自核對端口位置、朝向、供料角度及管長。</p></details>`:''}`;
}

function renderSolution(){
  const plan=workRoute();$('measurement-summary').textContent=params.basis==='ports'?`X ${fmt(params.run)} · Y ${fmt(params.layout==='rolling'?params.roll:0)} · Z ${fmt(params.rise)} mm`:'理論交點量測模式';
  $('solution-title').textContent=activePlan?routePlanTitle(activePlan):'原兩彎頭接法';$('offset-status').textContent=activePlan?'建議 '+activePlan.id:'原方案';
  $('solution-note').textContent=(activePlan?(baseline?(d=>d>0?`比原接法多 ${d} 個焊口。`:d<0?`比原接法少 ${-d} 個焊口。`:'焊口數與原接法相同。')(activePlan.jointCount-baseline.jointCount):`${activePlan.elbows.length} 個彎頭、${activePlan.pipes.length} 段直管，端口位置與朝向已通過幾何閉合核對。`):'旋轉核對接管方向；點圖上的零件，看加工方式。')+(plan?.components?.length?` 含 ${plan.components.length} 組指定零件、${plan.boltCount} 處螺栓接合；零件外形為辨識示意。`:'');
  document.querySelector('.solution-card').hidden=!plan;$('choose-title').textContent=plan?'先看焊口少的接法':'找其他可行的接法';
  $('solution-diagram').innerHTML=plan?(plan.legacy?offsetDiagramSVG(result):assemblySVG(plan,{interactive:true})):'<p class="workflow-empty">目前無法完成兩彎頭接法，可展開下方找其他接法。</p>';
  $('solution-diagram').classList.toggle('legacy-diagram',Boolean(plan?.legacy));
  $('offset-values').innerHTML=plan?metrics([[plan.legacy?'中間焊口':'焊口',plan.jointCount+' 個'],['彎頭',plan.elbows.length+' 個'],['直管',plan.pipes.length+' 段']])+`<table class="material-table"><tbody>${materialRows(plan)}</tbody></table>`:'';
  renderComponentPanel();renderErrors();renderRouteContext();updateStages();
}
function renderWork(){
  const plan=workRoute();$('job-choice').textContent=plan?`${activePlan?'建議 '+activePlan.id:'原兩彎頭接法'} · ${plan.jointCount} ${plan.legacy?'個中間焊口':'個焊口'}`:'';
  $('job-material-rows').innerHTML=materialRows(plan);$('offset-csv').disabled=!plan?.valid;
  const elements=plan?.elements??[];if(!elements.some(e=>e.id===piece))piece=elements.find(e=>e.type==='pipe')?.id??elements[0]?.id??'';
  $('cut-end').innerHTML=elements.map(e=>`<option value="${esc(e.id)}"${piece===e.id?' selected':''}>${esc(e.id)} · ${esc(partName(e))}${e.type==='elbow'?' '+fmt(e.angle,4)+'°':''}</option>`).join('');
  $('workflow-model').hidden=!plan?.valid;$('workflow-fit').hidden=Boolean(activePlan)||params.components.length>0||!result.valid||params.basis!=='ports';
  $('cut-station-count').value=params.stations??'';renderPieceRail();renderCut();updatePaper();renderFit();setView(view,false);updateStages();
}
function renderCut(){
  const plan=workRoute(),e=plan?.elements.find(e=>e.id===piece);
  for(const id of ['offset-cut-values','offset-fabrication-diagram','offset-cut-steps','offset-station-rows'])$(id).innerHTML='';
  $('station-details').hidden=true;$('offset-cut-note').textContent='';$('cut-piece-title').textContent=e?`${e.id} · ${partName(e)}${e.type==='pipe'?'加工':e.type==='elbow'?' '+fmt(e.angle,4)+'°':'組立'}`:'';
  if(!e)return;
  if(e.stations?.length&&(!(selected>=0)||selected>e.stations.length-1))selected=0;
  if(e.type==='component'){
    $('offset-cut-values').innerHTML=`<p class="cut-instruction">依實物組立總長 <strong>${fmt(e.length)} mm</strong> 備料，不切除閥體或法蘭。</p>`;
    $('offset-fabrication-diagram').innerHTML=componentFabricationSVG(e);
    $('offset-cut-steps').innerHTML=`<ol class="offset-shop-steps"><li>核對 ${esc(e.name||COMPONENT_NAMES[e.kind])}，包含組內配對件的接管端面距離 ${fmt(e.length)} mm。</li><li>A 側 ${CONNECTION_NAMES[e.leftConnection]}，額外預留 ${fmt(e.leftGap)} mm；B 側 ${CONNECTION_NAMES[e.rightConnection]}，額外預留 ${fmt(e.rightGap)} mm。已計入管長，不重複扣。</li><li>按組立圖試組，核對閥流向、法蘭孔位與實物操作空間。</li></ol><button type="button" class="button component-inline-action" data-edit-component="${e.id}">修改這組零件／位置</button>`;return;
  }
  if(e.type==='pipe'){
    const allowances=plan.legacy?{...params,trimA:0,trimB:0}:params;
    $('offset-cut-values').innerHTML=`<p class="cut-instruction">先下料 <strong>${fmt(e.blankLength)} mm</strong>，修到成品 <strong>${fmt(e.length)} mm</strong>。</p>`;
    $('offset-fabrication-diagram').innerHTML=pipeFabricationSVG(e,allowances);
    $('offset-cut-steps').innerHTML=`<ol class="offset-shop-steps"><li>在管身標 ${esc(e.id)}，按先下料長標線並切除。</li><li>兩端修磨到成品 ${fmt(e.length)} mm；接合預留已扣入，不能再扣一次。</li><li>依 WPS 製作坡口、鈍邊；和相鄰零件試組，核對四周間隙及錯邊。</li></ol>${!plan.legacy?`<button type="button" class="button component-inline-action" data-add-component="${e.slot===0?'a':e.slot===plan.elbows.length?'b':'s'+e.slot}">這段要加閥／法蘭</button>`:''}`;return;
  }
  if(e.kind==='factory'){
    $('offset-cut-values').innerHTML='<p class="cut-instruction">這支整件使用，不需要切角。</p>';
    $('offset-fabrication-diagram').innerHTML=plan.legacy?'':assemblySVG(plan);
    $('offset-cut-steps').innerHTML=`<ol class="offset-shop-steps"><li>核對實物 ${fmt(e.angle)}°、Rc ${fmt(e.radius)} mm${plan.legacy?'':`，前直段 ${fmt(e.tangentBefore)}／後直段 ${fmt(e.tangentAfter)} mm`}。</li><li>按組立圖定位轉向，再和相鄰管段試組。</li></ol>`;return;
  }
  $('station-details').hidden=false;
  $('offset-cut-values').innerHTML=`<p class="cut-instruction">原 ${fmt(e.donor)}°，保留 <strong>${fmt(e.angle,4)}°</strong>。${e.trimFar?`<br><small>角度剛好用滿原件，但另一端自帶直段 ${fmt(e.trimFar)} mm 必須在弧端切除。</small>`:''}</p>`+metrics([['外背從端面量',fmt(e.outerArc+(e.tangent??0))+' mm'],['內腹從端面量',fmt(e.innerArc+(e.tangent??0))+' mm'],['左右側從端面量',fmt(e.centerArc+(e.tangent??0))+' mm']]);
  const cutSVG=elbowFabricationSVG(e,params.od);
  $('offset-fabrication-diagram').innerHTML='<div class="fabrication-panels">'+cutSVG.replace('viewBox="0 0 740 325"','viewBox="0 0 430 325"')+cutClockSVG(e,params.od,selected)+'</div>';
  $('offset-cut-steps').innerHTML=elbowCutSteps(e,params.od).replace('保留原端口接既有管口；切短的那端接中間直管。',activePlan?`保留${e.retain==='outlet'?'後端（靠 B）':'前端（靠 A）'}，依材料順序接合。`:'保留原端口接既有管口；切短的那端接中間直管。');
  $('offset-station-rows').innerHTML=e.stations.map((s,i)=>`<tr tabindex="0" data-station="${i}" class="${i===selected?'selected':''}" aria-label="${esc(e.id)} ${fmt(s.clock)} 度，沿弧 ${fmt(s.kept)} 毫米"><td>${fmt(s.clock)}</td><td>${fmt(s.around)}</td><td>${fmt(s.kept)}</td><td>${fmt(s.removed)}</td></tr>`).join('');
  $('offset-cut-note').textContent=`分點表從弧面起點量；從端面量時加直段 ${fmt(e.tangent??0)} mm。沿曲面量，不能拉直量弦長。`;
  if(activePlan){const outside=retainedRouteFrame(e).outside;$('offset-cut-note').textContent+=` 外背朝 XYZ ${outside.map(v=>fmt(v,4)).join('／')}。`;}
}
function updatePaper(){
  const hasCut=!activePlan&&result.valid&&Object.values(result.elbows).some(e=>e.kind==='cut');$('print-offset-strips').hidden=Boolean(activePlan);$('print-offset-strips').disabled=!hasCut;
  if(activePlan){$('offset-paper-count').textContent='這個建議可列印完整分點加工單。';return;}
  if(!hasCut){$('offset-paper-count').textContent='整支彎頭可印尺寸加工單。';return;}
  try{const plan=offsetStripPlan(result,$('offset-paper').value);$('offset-paper-count').textContent=`切角量尺 ${plan.pages} 頁 · 列印 100%，核對 100 mm 校正尺。`;}catch(e){$('print-offset-strips').disabled=true;$('offset-paper-count').textContent=e.message;}
}
// Lazily mounted: render paths may run before this line during module start-up.
var statusStripInstance;// var + function declaration: both are usable before this line runs.
function statusStripUpdate(model){(statusStripInstance??=mountWorkbenchStatus(document.querySelector('.workbench-nav'))).update(model);}
// Glanceable state: one tone, the numbers a fitter acts on, and every open problem one click away.
function renderStatus(){
  const plan=workRoute(),valid=Boolean(plan?.valid),measured=params.basis==='ports'?`X ${fmt(params.run)} · Y ${fmt(params.layout==='planar'?0:params.roll)} · Z ${fmt(params.rise)}`:`偏移 ${fmt(params.rise)}${params.layout==='rolling'?' · 側移 '+fmt(params.roll):''}`,list=[];
  // Once a valid alternative route is chosen, the original route's problems are history, not blockers.
  for(const item of issues)list.push({level:valid&&activePlan?'info':item.inputError?'error':'warn',text:item.title+(item.detail?'：'+item.detail:''),actionLabel:item.actionLabel??'帶我修正',action:()=>{if(stage!==1)goTo(1);showErrors=true;renderErrors();jumpToRecovery(item);}});
  for(const notice of legacyNotices)list.push({level:'warn',text:notice,actionLabel:'已核對',action:()=>{legacyNotices=legacyNotices.filter(n=>n!==notice);renderStatus();}});
  for(const message of componentIssues)list.push({level:'warn',text:message,actionLabel:'看零件',action:()=>{if(stage!==2&&workRoute()?.valid!==undefined)goTo(2);$('component-panel')?.scrollIntoView({behavior:'smooth',block:'center'});}});
  const pipes=plan?.pipes??[],elbows=plan?.elbows??[];
  const metrics=valid?[{label:pipes.length>1?'直管總長':'直管成品',value:fmt(pipes.reduce((s,e)=>s+e.length,0)),unit:'mm'},{label:'彎頭',value:elbows.map(e=>fmt(e.angle,1)+'°').join(' / ')||'—',quiet:elbows.length>2},{label:'焊口',value:String(plan.jointCount??'—'),unit:'個'},{label:'量測',value:measured,quiet:true}]:[{label:'量測',value:measured,quiet:true}];
  const inputErrors=list.some(i=>i.level==='error'),routeMissing=!valid&&params.basis==='ports'&&Boolean(result.context);
  const title=valid?(stage===3?'可出加工單':activePlan?`已選 ${activePlan.id} 接法`:'原兩彎頭接法成立'):inputErrors?'尺寸待修正':routeMissing?'原接法不成立 · 選其他接法':'接法不成立';
  if(routeMissing&&!list.length)list.push({level:'warn',text:'端口資料完整，但原兩彎頭接不成；請比較其他接法或調整供料。',actionLabel:'找接法',action:()=>exploreOtherRoutes()});
  statusStripUpdate({tone:valid?(list.some(i=>i.level!=='info')?'warn':'ok'):inputErrors?'error':'warn',title,detail:valid?`${plan.elbows.length} 彎頭 · ${plan.pipes.length} 段直管${plan.components?.length?' · '+plan.components.length+' 組零件':''}`:'修正後才會出加工單',metrics,issues:list});
  // Stepper: each step carries its own result so progress reads without opening it.
  const summaries={1:result.context||result.valid?measured:'待量測',2:valid?(activePlan?`${activePlan.id} · ${plan.jointCount} 焊口`:`原接法 · ${plan.jointCount} 焊口`):routeMissing?'需選其他接法':'—',3:valid?`${plan.elements.length} 件加工`:'—'};
  document.querySelectorAll('[data-step]').forEach(b=>{const n=Number(b.dataset.step);let small=b.querySelector('.step-summary');if(!small){small=document.createElement('small');small.className='step-summary';b.append(small);}small.textContent=summaries[n];
    b.dataset.state=n===1?(inputErrors?'error':result.context||result.valid?'done':'todo'):n===2?(valid?'done':routeMissing?'warn':'todo'):(valid&&stage===3?'current':valid?'ready':'todo');});
}
function updateStages(){
  const measurable=result.valid||Boolean(result.context),valid=Boolean(workRoute()?.valid);
  document.querySelectorAll('[data-stage]').forEach(el=>el.hidden=Number(el.dataset.stage)!==stage);
  document.querySelectorAll('[data-step]').forEach(b=>{const n=Number(b.dataset.step);if(n===stage)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');b.disabled=n>1&&(!measurable||searchPending);});
  $('workflow-progress').textContent=stage===1?{position:params.basis==='ports'?'現場端口':'理論交點',stock:'手邊供料',gaps:'焊口與留料'}[editor]:`第 ${stage}／3 步`;$('workflow-prev').hidden=stage===1&&editor==='position';
  const next=nextOffsetAction({stage,editor,attempted:attemptedCalculation,valid,issues,comparison:routePlans});
  $('workflow-next').textContent=searchPending?'正在搜尋接法…':next.action==='editor'?`下一步：${next.editor==='stock'?'選彎頭材料':'留焊口間隙'}`:({repair:'帶我修正',calculate:'查看接法',search:'搜尋可行接法',choose:'展開接法，點圖選擇',limits:'調整搜尋條件','comparison-repair':'修正搜尋條件',work:'看加工單',print:'列印加工單／PDF'}[next.action]);$('workflow-next').disabled=searchPending||stage===3&&!valid;
  if(stage===1){$('measure-title').textContent={position:params.basis==='ports'?'先量兩個端口的距離':'量中心線交點的偏移',stock:'再確認手邊彎頭與管徑',gaps:'最後填焊口間隙與留料'}[editor];document.querySelector('[data-stage="1"] .workflow-stage-head>p').textContent={position:params.basis==='ports'?'填現場實測值，點圖可粗調與選朝向。':'填理論交點尺寸或已知角度，依選定基準計算。',stock:'確認原件角度與實際尺寸，兩端相同只填一次。',gaps:'間隙從管長扣除，修磨留料另加。'}[editor];}
  viewer?.setActive(stage===3&&$('workflow-model').open&&valid);
  syncSolutionViewer();
  renderStatus();
}
function stopSolutionSpin(){solutionViewer?.setAutoRotate(false);const button=document.querySelector('[data-solution-motion="spin"]');button.setAttribute('aria-pressed','false');button.textContent='自動旋轉';}
function syncSolutionViewer(){
  const plan=workRoute(),live=solutionView==='3d'&&!solutionViewerFailed,active=stage===2&&live&&Boolean(plan?.valid);
  $('solution-live').hidden=!live;$('solution-diagram').hidden=live;
  document.querySelectorAll('[data-solution-view]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.solutionView===(live?'3d':'diagram')));button.disabled=button.dataset.solutionView==='3d'&&solutionViewerFailed;});
  document.querySelectorAll('[data-solution-motion]').forEach(button=>button.disabled=!solutionViewer);
  $('solution-view-hint').textContent=live?'拖曳旋轉 · 滾輪／雙指縮放 · 點零件看加工':solutionViewerFailed?'3D 無法啟用，點示意中的零件仍可看加工。':'點彎頭或直管，查看那一件的加工方式。';
  solutionViewer?.setActive(active);
  if(!active){stopSolutionSpin();if(!plan?.valid&&solutionViewer){solutionViewer.clear();solutionViewerPlan=null;}return;}
  if(!solutionViewer){ensureSolutionViewer();return;}
  if(solutionViewerPlan!==plan){stopSolutionSpin();solutionViewer.resize();if(plan.legacy)solutionViewer.update(result);else solutionViewer.updateRoute(plan);solutionViewerPlan=plan;}
}
async function ensureSolutionViewer(){
  if(solutionViewerPromise)return solutionViewerPromise;
  solutionViewerPromise=(async()=>{
    try{const {OffsetViewer}=await import('./offset-viewer.js');solutionViewer=new OffsetViewer($('solution-viewer'),{onSelect:part=>choosePiece(part,true),onInteract:stopSolutionSpin,jointLabels:false});}
    catch{solutionViewerFailed=true;}
    syncSolutionViewer();
  })();return solutionViewerPromise;
}
function goTo(next){
  if(next>1&&!workRoute()?.valid){
    attemptedCalculation=true;
    if(params.basis==='ports'&&result.context){
      if(routePlans){stage=2;renderSolution();if(next===3)nextWorkflow();else focusStage();}
      else exploreOtherRoutes().then(()=>{if(next===3)nextWorkflow();});
      return;
    }
    showErrors=true;renderErrors();jumpToRecovery(issues[0]);return;
  }
  if(next>1)attemptedCalculation=true;stage=next;renderSolution();if(next===3)renderWork();window.scrollTo({top:0,behavior:'instant'});
  focusStage();
}

function invalidatePlans(){const had=routePlans!==null;routePlans=null;activePlan=null;planGeneration++;$('offset-plan-cards').replaceChildren();$('offset-plan-limits').hidden=true;$('compare-offset-plans').disabled=!result.context;$('offset-plan-status').textContent=had?'條件已變更，重新找接法後再比較。':'';}
function render(keepChoice=false){
  const key=keepChoice?activePlan?.key:null;result=computeOffset(params);baseline=originalView();
  if(keepChoice&&routePlans){routePlans=compareRoutePlans(params);activePlan=key?routePlans.plans.find(p=>p.key===key)??null:null;renderPlans();}else invalidatePlans();
  syncVisibility();renderInputVisuals();
  $('save-offset').disabled=!projectReady();$('offset-csv').disabled=!workRoute()?.valid;renderSolution();renderWork();saveDraft();
}
function renderPlans(){
  if(!routePlans?.valid){$('offset-plan-status').innerHTML=(routePlans?.issues??[]).map(i=>`<span class="compare-issue">${esc(i.message)}<button type="button" data-compare-field="${esc(i.field)}">前往這個比較條件 →</button></span>`).join('')||esc(routePlans?.errors.join(' ')??'');renderRouteContext();updateStages();return;}
  const alternatives=routePlans.plans.filter(p=>!p.original);
  $('offset-plan-status').textContent=alternatives.length?`${alternatives.length} 個備選；點選後看圖與尺寸，再決定是否使用。`:'目前的焊口、供料與管段限制下，沒有找到其他接法。';
  const choices=[...(baseline?[{...baseline,id:'original'}]:[]),...alternatives];
  $('offset-plan-cards').innerHTML=choices.map(p=>`<button type="button" class="plan-option" data-plan="${esc(p.id)}" aria-pressed="${p.original?!activePlan:activePlan?.id===p.id}"><span class="plan-thumb" aria-hidden="true">${assemblySVG(p)}</span><span class="plan-option-label">${p.original?'原兩彎頭接法':esc(routePlanTitle(p))}<small>${p.elbows.length} 個彎頭 · ${p.pipes.length} 段直管 · ${p.specialCuts??0} 次特殊切角 · ${p.halfCuts??0} 次對半切</small><small>總直管 ${fmt(p.totalPipe)} mm · ${p.envelope.maxExcursion>1e-5?'中心線繞出 '+fmt(p.envelope.maxExcursion)+' mm':'中心線在端口 XYZ 範圍內'}</small></span><span class="plan-welds">${p.jointCount} 焊口${!p.original&&baseline?.valid?`<small>${p.jointCount>=baseline.jointCount?'多':'少'} ${Math.abs(p.jointCount-baseline.jointCount)} 個</small>`:''}</span></button>`).join('');
  if(!alternatives.length)$('offset-plan-status').innerHTML+='<div class="recovery-actions"><button type="button" data-compare-field="planMaxJoints">核對焊口與搜尋限制 →</button><button type="button" data-back-stock>核對手邊供料 →</button></div>';
  $('offset-plan-limits').hidden=false;$('offset-plan-limitation').textContent=routePlans.limitation;
  renderComponentPanel();renderRouteContext();updateStages();
}
async function comparePlans(){
  if(searchPending)return;searchPending=true;const generation=planGeneration;$('compare-offset-plans').disabled=true;$('offset-plan-status').textContent='正在找接法…';renderRouteContext();updateStages();await new Promise(r=>setTimeout(r,0));
  try{const comparison=compareRoutePlans({...params});if(generation!==planGeneration)return;routePlans=comparison;renderPlans();}catch(e){$('offset-plan-status').textContent=e.message;}finally{searchPending=false;if(generation===planGeneration)$('compare-offset-plans').disabled=!result.context;renderRouteContext();updateStages();}
}
function download(text,type,filename){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function fileID(){return (id.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').trim()||'OFF-001').slice(0,40);}
function fitResult(){return compareOffsetFit(result,number($('fit-a').value),number($('fit-b').value),number($('fit-length').value));}
function renderFit(){
  const enabled=result.valid&&params.basis==='ports'&&!activePlan&&!params.components.length;for(const k of ['fit-a','fit-b','fit-length','fit-use-plan','fit-round'])$(k).disabled=!enabled;
  if(!enabled||['fit-a','fit-b','fit-length'].every(k=>$(k).value==='')){$('offset-fit-result').textContent='帶入理論尺寸，或填實際成品尺寸。';return;}
  const f=fitResult();$('offset-fit-result').innerHTML=f.valid?metrics([['B 端 ΔX',fmt(f.mismatch[0])+' mm'],['B 端 ΔY',fmt(f.mismatch[1])+' mm'],['B 端 ΔZ',fmt(f.mismatch[2])+' mm'],['管軸角度差',fmt(f.axisMismatch,4)+'°']]):`<p>${esc(f.message)}</p>`;
}
function useFit(round=false){$('fit-a').value=round?Math.round(result.elbows.a.angle*2)/2:result.elbows.a.angle;$('fit-b').value=round?Math.round(result.elbows.b.angle*2)/2:result.elbows.b.angle;$('fit-length').value=result.cutLength;renderFit();}
function preview(kind){
  try{if(!workRoute()?.valid)throw new Error('先選可容納所有指定零件的接法，再列印加工單。');const paper=$('offset-paper').value,fit=fitResult();printTitle=kind==='strips'?'彎頭切角量尺':activePlan?activePlan.id+' 建議加工單':'偏移配管加工單';printHTML=kind==='strips'?buildOffsetStripPaper(result,id,paper):activePlan||baseline?.components?.length?buildRoutePlanWorkOrder(workRoute(),id,paper):buildOffsetWorkOrder(result,id,paper,fit.valid?fit:null);$('offset-preview-title').textContent=printTitle;$('offset-print-frame').srcdoc=printHTML;$('offset-preview').showModal();}catch(e){toast(e.message);}
}
function setView(next,reset=true){
  if(activePlan||baseline?.components?.length){
    const plan=workRoute();
    if(next!=='offset'&&!plan.elements.some(e=>e.id===next))next='offset';view=next;
    document.querySelector('.offset-view-tabs').innerHTML=[['offset','整組'],...plan.elements.map(e=>[e.id,e.id])].map(([key,label])=>`<button type="button" class="button" data-view="${esc(key)}" aria-pressed="${view===key}">${esc(label)}</button>`).join('');
    const element=plan.elements.find(e=>e.id===view);
    $('offset-model-title').textContent=view==='offset'?`${plan.id} · 整組配管`:`${view} · ${partName(element)}`;
    $('offset-model-note').textContent=element?.kind==='cut'?'橙圈為切面，白線為選定母線。':view==='offset'?'彎頭藍色、直管灰色、零件金色 · 拖曳旋轉、雙指縮放。':'金圈為接合端面 · 拖曳旋轉、雙指縮放。';
    if(stage===3&&$('workflow-model').open)viewer?.updateRoute(plan,view,selected,reset);
  }else{
    if(next!=='offset'&&(!result.valid||result.elbows[next]?.kind!=='cut'))next='offset';view=next;
    document.querySelector('.offset-view-tabs').innerHTML=[['offset','整組'],['a','A 彎頭'],['b','B 彎頭']].map(([key,label])=>`<button type="button" class="button" data-view="${key}" aria-pressed="${view===key}"${key!=='offset'&&(!result.valid||result.elbows[key]?.kind!=='cut')?' disabled':''}>${label}</button>`).join('');
    $('offset-model-title').textContent=view==='offset'?'A 到 B 的配管':`${view.toUpperCase()} 彎頭切角`;$('offset-model-note').textContent=view==='offset'?'A 藍色／B 橙色 · 拖曳旋轉、雙指縮放':'橙圈為切面，白線為選定母線。';
    if(stage===3&&$('workflow-model').open)viewer?.update(result,view,selected,reset);
  }
}
async function ensureViewer(){
  if(!viewerPromise)viewerPromise=(async()=>{try{const {OffsetViewer}=await import('./offset-viewer.js');viewer=new OffsetViewer($('offset-viewer'));setView(view);updateStages();}catch{$('offset-viewer').textContent='3D 無法啟用，尺寸示意與加工單仍可使用。';}})();
  await viewerPromise;setView(view);updateStages();
}

function setEditor(next){editor=next;document.querySelectorAll('[data-editor-panel]').forEach(el=>el.hidden=el.dataset.editorPanel!==editor);document.querySelectorAll('[data-editor-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.editorTab===editor)));if(result){renderErrors();updateStages();}}
function renderInputVisuals(){
  const ports=params.basis==='ports';document.querySelector('.port-scene-card').hidden=!ports;document.querySelector('.workflow-input-grid').classList.toggle('legacy-input',!ports);$('weld-sketch').hidden=!ports;
  const scene=portScene(params,sceneView,selectedPort,dragState?.frame);sceneFrame=scene.frame;$('port-sketch').innerHTML=scene.svg;
  document.querySelectorAll('[data-scene-view]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.sceneView===sceneView));b.disabled=params.layout==='planar'&&['top','side'].includes(b.dataset.sceneView);});
  const axes=SCENE_VIEWS[sceneView].axes.map(k=>({run:'X',roll:'Y',rise:'Z'}[k])).join('／');$('port-scene-hint').textContent=`拖 B 粗調 ${axes} · 點尺寸精確輸入 · 點 A／B 選朝向`;
  const presets=[['facing','相向','x+','x-'],['corner','轉角','x+','z-'],['same','同向','x+','x+']];
  $('orientation-presets').hidden=!ports;$('endpoint-choices').hidden=!ports;$('direction-picker').hidden=!ports||selectedPort===null;
  $('orientation-presets').innerHTML=presets.map(([key,label,a,b])=>`<button type="button" class="visual-choice" data-orientation="${key}" aria-pressed="${params.aAxis===a&&params.bAxis===b}"><span class="orientation-icons">${directionIcon(a)}${directionIcon(b)}</span><span>${label}</span></button>`).join('');
  $('endpoint-choices').innerHTML=['a','b'].map(end=>`<button type="button" data-endpoint="${end}" aria-pressed="${selectedPort===end}">${end.toUpperCase()} 口 <span>${axisLabel(params[end+'Axis'])}</span> ✎</button>`).join('');
  if(selectedPort){$('direction-picker-title').textContent=selectedPort.toUpperCase()+' 口朝哪裡？';$('direction-options').innerHTML=[['x+','前'],['x-','後'],['y+','左'],['y-','右'],['z+','上'],['z-','下']].map(([value,label])=>`<button type="button" class="visual-choice" data-axis-choice="${value}" aria-pressed="${params[selectedPort+'Axis']===value}">${directionIcon(value)}<span>${label} ${axisLabel(value)}</span></button>`).join('')+'<button type="button" class="custom-axis" data-axis-choice="custom">斜向／填精確方向分量</button>';}
  for(const end of ['a','b']){const sketch=$('stock-sketch-'+end);if(sketch)sketch.innerHTML=stockElbowSVG(params,end);document.querySelectorAll(`[data-supply-kind][data-supply-end="${end}"]`).forEach(b=>b.setAttribute('aria-pressed',String(params[end+'Kind']===b.dataset.supplyKind&&(!b.dataset.donor||Number(b.dataset.donor)===params[end+'Donor']))));}
  $('weld-sketch').innerHTML=weldSketchSVG(params);
}
function axisLabel(value){return value==='custom'?'自訂斜向':value?.length===2?value[1]+value[0].toUpperCase():'—';}
function chooseEndpoint(end){selectedPort=end;setEditor('position');renderInputVisuals();}
function focusDimension(key){setEditor('position');if(key==='roll'&&params.layout==='planar')return;const c=$('offset-'+key);if(c.hidden||c.closest('[hidden]'))return;c.focus();c.select();}
function activateVisual(target){
  const port=target.closest('[data-port]');if(port){chooseEndpoint(port.dataset.port);return;}
  const dim=target.closest('[data-dimension]');if(dim){focusDimension(dim.dataset.dimension);return;}
  const supply=target.closest('[data-supply-field]');if(supply){setEditor('stock');const c=$('offset-'+supply.dataset.supplyField);const d=c?.closest('details');if(d)d.open=true;c?.focus();c?.select();return;}
  const gap=target.closest('[data-gap]');if(gap){setEditor('gaps');$('port-allowances').open=true;const c=$('offset-'+gap.dataset.gap);c.focus();c.select();}
}
function renderPieceRail(){const plan=workRoute();$('piece-rail').innerHTML=(plan?.elements??[]).map(e=>`<button type="button" data-piece="${esc(e.id)}" aria-pressed="${piece===e.id}" aria-label="加工 ${esc(e.id)} ${esc(partName(e))}">${e.type==='component'?componentIcon(e.kind):e.type==='pipe'?'<svg viewBox="0 0 76 62" aria-hidden="true"><path d="M13 38h50" stroke="currentColor" stroke-width="15"/></svg>':elbowIcon(e.angle)}<span>${esc(e.id)}</span><small>${e.type==='elbow'?fmt(e.angle,2)+'°':esc(partName(e))}</small></button>`).join('');}
function choosePiece(value,open=false){piece=value;selected=0;if(open)goTo(3);else{renderPieceRail();$('cut-end').value=piece;renderCut();}setView(activePlan||baseline?.components?.length?piece:['A','B'].includes(piece)?piece.toLowerCase():'offset');}
$('offset-nps').innerHTML=ASME_PIPE_SIZES.map(p=>`<option value="${esc(p.nps)}">${esc(p.nps)} 吋</option>`).join('')+'<option value="custom">實測外徑</option>';
let restored=false;try{const saved=localStorage.getItem(storageKey);if(saved){const data=readOffsetProject(saved);params=data.params;id=data.id;legacyNotices=data.notices??[];restored=true;}}catch{}
const phoneLayout=matchMedia('(max-width:720px)');
$('job-material-details').open=!phoneLayout.matches;
phoneLayout.addEventListener('change',event=>$('job-material-details').open=!event.matches);
syncInputs();$('offset-references').innerHTML=referencesHTML();render();$('project-restored').textContent=restored?'已恢復上次尺寸。':'專案儲存在這台裝置。';
$('offset-inputs').addEventListener('submit',e=>{e.preventDefault();nextWorkflow();});
$('offset-inputs').addEventListener('input',e=>{
  if(e.target.id==='offset-same-stock'){sharedStock=e.target.checked;if(sharedStock)copySupply();render();return;}
  if(e.target.id==='offset-all-gap'){for(const k of gapKeys()){params[k]=number(e.target.value);$('offset-'+k).value=e.target.value;}render();return;}
  if(!e.target.name)return;readInputs();const name=e.target.name;if(name==='stations'){render(true);return;}
  if(['aKind','bKind','aRadiusMethod','bRadiusMethod'].includes(name))elbowFields(name[0]);
  if(name==='basis'){elbowFields('a');elbowFields('b');toast('量測基準已切換，請重新核對尺寸。');}
  if(sharedStock&&name.startsWith('a')&&supplyKeys.some(k=>name==='a'+k))copySupply();
  if(name==='od'){$('offset-nps').value=nps();elbowFields('a');elbowFields('b');}
  render();
});
$('offset-nps').addEventListener('change',()=>{const size=ASME_PIPE_SIZES.find(p=>p.nps===$('offset-nps').value);if(size){params.od=size.odMm;$('offset-od').value=params.od;elbowFields('a');elbowFields('b');render();}else $('offset-od').focus();});
$('offset-inputs').addEventListener('click',e=>{const b=e.target.closest('[data-radius-end]');if(b){const end=b.dataset.radiusEnd,r=nominalElbowRadius(nps(),'lr');if(r!==null){params[end+'Radius']=r;params[end+'RadiusMethod']='radius';elbowFields(end);if(sharedStock&&end==='a')copySupply();render();}}});
$('offset-plans').addEventListener('input',e=>{if(e.target.name){readInputs();render();}});
$('offset-plans').addEventListener('toggle',()=>{if($('offset-plans').open&&!routePlans)comparePlans();});
$('compare-offset-plans').addEventListener('click',comparePlans);
$('offset-plan-cards').addEventListener('click',e=>{const b=e.target.closest('[data-plan]');if(!b)return;activePlan=b.dataset.plan==='original'?null:routePlans?.plans.find(p=>p.id===b.dataset.plan)??null;piece='P1';selected=0;renderPlans();renderSolution();renderWork();focusStage();});
$('cut-station-count').addEventListener('input',()=>{params.stations=number($('cut-station-count').value);$('offset-stations').value=params.stations;render(true);});
for(const b of document.querySelectorAll('[data-step]'))b.addEventListener('click',()=>goTo(Number(b.dataset.step)));
for(const b of document.querySelectorAll('[data-edit-inputs]'))b.addEventListener('click',()=>goTo(1));
for(const b of document.querySelectorAll('[data-back-choice]'))b.addEventListener('click',()=>goTo(2));
$('workflow-next').addEventListener('click',nextWorkflow);$('workflow-prev').addEventListener('click',()=>stage===1?setEditor(editor==='gaps'?'stock':'position'):goTo(stage-1));
$('cut-end').addEventListener('change',()=>choosePiece($('cut-end').value));
function chooseStation(e){const row=e.target.closest('[data-station]');if(!row)return;selected=Number(row.dataset.station);renderCut();if(e.type==='keydown')$('offset-fabrication-diagram').querySelector(`[data-station="${selected}"]`)?.focus();if(activePlan||baseline?.components?.length)setView(piece,false);else if(['A','B'].includes(piece))setView(piece.toLowerCase(),false);}
$('offset-station-rows').addEventListener('click',chooseStation);$('offset-station-rows').addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();chooseStation(e);}});
$('workflow-model').addEventListener('toggle',()=>{if($('workflow-model').open)ensureViewer();else viewer?.setActive(false);});
document.querySelector('.offset-view-tabs').addEventListener('click',event=>{const b=event.target.closest('[data-view]');if(!b)return;if(b.dataset.view!=='offset'){piece=activePlan||baseline?.components?.length?b.dataset.view:b.dataset.view.toUpperCase();$('cut-end').value=piece;selected=0;renderPieceRail();renderCut();}setView(b.dataset.view);});
$('reset-offset-view').addEventListener('click',()=>viewer?.fit());
document.addEventListener('click',event=>{
  const add=event.target.closest('[data-add-component]'),edit=event.target.closest('[data-edit-component]');if(add){if(params.basis!=='ports'){toast('先切換成既有端口量測模式，再指定零件。');return;}openComponentEditor(add.dataset.addComponent||null);}else if(edit)openComponentEditor(null,edit.dataset.editComponent);
  else if(event.target.closest('[data-component-search]'))exploreOtherRoutes();
  else if(event.target.closest('[data-component-joint-limit]')){params.planMaxJoints=Number(event.target.closest('[data-component-joint-limit]').dataset.componentJointLimit);$('offset-planMaxJoints').value=params.planMaxJoints;syncVisibility();renderComponentPanel();comparePlans();saveDraft();}
});
$('component-cancel').addEventListener('click',()=>$('component-editor').close());
$('component-kind-options').addEventListener('click',event=>{const button=event.target.closest('[data-component-kind]');if(!button)return;readComponentDraft();componentDraft.kind=button.dataset.componentKind;componentDraft.internalBolts=componentDraft.kind==='flangePair'?1:0;$('component-internalBolts').value=componentDraft.internalBolts;renderComponentDraft();});
$('component-form').addEventListener('input',()=>{readComponentDraft();renderComponentDraft();$('component-form-error').hidden=true;});
$('component-form').addEventListener('submit',event=>{event.preventDefault();readComponentDraft();const next=[...params.components.filter(c=>c.id!==componentDraft.id),{...componentDraft}],errors=validateComponents(next);if(errors.length){$('component-form-error').hidden=false;$('component-form-error').textContent=errors.join(' ');$('component-length').focus();return;}applyComponents(next);});
$('component-remove').addEventListener('click',()=>applyComponents(params.components.filter(c=>c.id!==componentDraft.id)));
document.querySelector('.solution-view-tabs').addEventListener('click',event=>{const button=event.target.closest('[data-solution-view]');if(!button)return;solutionView=button.dataset.solutionView;syncSolutionViewer();});
document.querySelector('.solution-view-tools').addEventListener('click',event=>{
  const button=event.target.closest('[data-solution-motion]');if(!button||!solutionViewer)return;
  const action=button.dataset.solutionMotion;
  if(action==='spin'){const spin=button.getAttribute('aria-pressed')!=='true';solutionViewer.setAutoRotate(spin);button.setAttribute('aria-pressed',String(spin));button.textContent=spin?'暫停旋轉':'自動旋轉';}
  else if(action==='reset'){stopSolutionSpin();solutionViewer.fit();}else solutionViewer.zoom(action==='in'?.8:1.25);
});
$('solution-viewer').addEventListener('keydown',event=>{
  if(!solutionViewer||stage!==2)return;const angles={ArrowLeft:[-.18,0],ArrowRight:[.18,0],ArrowUp:[0,-.18],ArrowDown:[0,.18]};
  if(angles[event.key]){event.preventDefault();stopSolutionSpin();solutionViewer.orbit(...angles[event.key]);}
  else if(['+','=','-','_','f','F'].includes(event.key)){event.preventDefault();stopSolutionSpin();if(event.key.toLowerCase()==='f')solutionViewer.fit();else solutionViewer.zoom(['+','='].includes(event.key)?.8:1.25);}
});
for(const k of ['fit-a','fit-b','fit-length'])$(k).addEventListener('input',renderFit);
$('fit-use-plan').addEventListener('click',()=>useFit());$('fit-round').addEventListener('click',()=>useFit(true));
$('offset-paper').addEventListener('change',updatePaper);$('offset-id').addEventListener('input',()=>{id=$('offset-id').value;saveDraft();});
$('save-offset').addEventListener('click',()=>{try{download(offsetProjectJSON(params,id),'application/json',fileID()+'.offset.json');}catch(e){toast(e.message);}});
$('load-offset').addEventListener('click',()=>$('offset-file').click());
$('offset-file').addEventListener('change',async()=>{const file=$('offset-file').files[0];if(!file)return;try{if(file.size>100000)throw new Error('專案檔案過大。');const data=readOffsetProject(await file.text());params=data.params;id=data.id;legacyNotices=data.notices??[];piece='P1';selected=0;stage=1;editor='position';attemptedCalculation=false;showErrors=false;setEditor('position');syncInputs();render();toast('已載入，先核對現場尺寸。');}catch(e){toast('載入失敗：'+e.message);}$('offset-file').value='';});
$('offset-csv').addEventListener('click',()=>{try{download(activePlan||baseline?.components?.length?routePlanCSV(workRoute()):offsetCSV(result),'text/csv;charset=utf-8',fileID()+(activePlan?'.'+activePlan.id:'')+'.csv');}catch(e){toast(e.message);}});
$('print-offset-strips').addEventListener('click',()=>preview('strips'));
$('close-offset-preview').addEventListener('click',()=>$('offset-preview').close());
$('download-offset-print').addEventListener('click',()=>download(printHTML,'text/html;charset=utf-8',fileID()+'.'+printTitle+'.html'));
$('print-offset-preview').addEventListener('click',()=>{const f=$('offset-print-frame');f.contentWindow.focus();f.contentWindow.print();});

for(const b of document.querySelectorAll('[data-editor-tab]'))b.addEventListener('click',()=>setEditor(b.dataset.editorTab));
for(const b of document.querySelectorAll('[data-scene-view]'))b.addEventListener('click',()=>{sceneView=b.dataset.sceneView;renderInputVisuals();});
$('offset-inputs').addEventListener('click',event=>{
 const t=event.target,b=t.closest('button');
 if(t.closest('#port-sketch')&&Date.now()<suppressPortClick)return;
 activateVisual(t);
 if(!b)return;
 if(b.dataset.endpoint){chooseEndpoint(b.dataset.endpoint);return;}
 if(b.dataset.orientation){const values={facing:['x+','x-'],corner:['x+','z-'],same:['x+','x+']}[b.dataset.orientation];params.aAxis=values[0];params.bAxis=values[1];portFields();selectedPort=null;render();return;}
 if(b.dataset.axisChoice){params[selectedPort+'Axis']=b.dataset.axisChoice;portFields();render();if(b.dataset.axisChoice==='custom'){$('measurement-details').open=true;$('offset-'+selectedPort+'AxisX').focus();}return;}
 if(b.dataset.supplyKind){const end=b.dataset.supplyEnd;params[end+'Kind']=b.dataset.supplyKind;if(b.dataset.donor)params[end+'Donor']=Number(b.dataset.donor);elbowFields(end);if(sharedStock&&end==='a')copySupply();render();return;}
 if(b.dataset.donor){const end=b.dataset.supplyEnd;params[end+'Donor']=Number(b.dataset.donor);$('offset-'+end+'Donor').value=params[end+'Donor'];if(sharedStock&&end==='a')copySupply();render();}
});
$('offset-inputs').addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)&&event.target.matches('g[role=button]')){event.preventDefault();activateVisual(event.target);}});
$('close-direction-picker').addEventListener('click',()=>{selectedPort=null;renderInputVisuals();});
function sceneCoords(event,svg){return new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse());}
const sketch=$('port-sketch');
sketch.addEventListener('pointerdown',event=>{
 if(event.button!==0||!event.target.closest('[data-port=b]')||params.basis!=='ports')return;
 const svg=sketch.querySelector('svg'),point=sceneCoords(event,svg);dragState={pointer:event.pointerId,start:[point.x,point.y],values:{run:params.run,roll:params.roll,rise:params.rise},frame:sceneFrame,moved:false,latest:null};sketch.setPointerCapture(event.pointerId);event.preventDefault();
});
function applySceneDrag(){if(!dragState?.latest)return;const delta=sceneDragDelta(dragState.latest,dragState.frame);for(const [key,value]of Object.entries(delta)){params[key]=Math.round((dragState.values[key]??0)+value);$('offset-'+key).value=params[key];}render();}
sketch.addEventListener('pointermove',event=>{if(!dragState||event.pointerId!==dragState.pointer)return;const q=sceneCoords(event,sketch.querySelector('svg')),delta=[q.x-dragState.start[0],q.y-dragState.start[1]];if(!dragState.moved&&Math.hypot(...delta)<5)return;dragState.moved=true;dragState.latest=delta;if(dragTick===null)dragTick=requestAnimationFrame(()=>{dragTick=null;applySceneDrag();});});
function endSceneDrag(event){if(!dragState||event.pointerId!==dragState.pointer)return;cancelAnimationFrame(dragTick);dragTick=null;applySceneDrag();const moved=dragState.moved;dragState=null;suppressPortClick=Date.now()+300;if(sketch.hasPointerCapture(event.pointerId))sketch.releasePointerCapture(event.pointerId);if(moved)renderInputVisuals();else chooseEndpoint('b');}
sketch.addEventListener('pointerup',endSceneDrag);sketch.addEventListener('pointercancel',endSceneDrag);
for(const element of [$('solution-diagram'),$('piece-rail')]){element.addEventListener('click',event=>{const part=event.target.closest('[data-piece]');if(part)choosePiece(part.dataset.piece,element.id==='solution-diagram');});element.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)&&event.target.matches('g[data-piece]')){event.preventDefault();choosePiece(event.target.dataset.piece,true);}});}

$('offset-fabrication-diagram').addEventListener('click',chooseStation);
$('offset-fabrication-diagram').addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)&&event.target.matches('[data-station]')){event.preventDefault();chooseStation(event);}});

$('offset-inputs').addEventListener('focusout',event=>{if(event.relatedTarget?.closest('button,summary,a,[role="button"]'))return;const name=event.target.name;if(!showErrors&&name&&issues.some(i=>i.inputError&&i.sources.some(e=>e.field===name))){showErrors=true;renderErrors();updateStages();}});
for(const panel of [$('offset-errors'),$('offset-repair')])panel.addEventListener('click',event=>{
 const link=event.target.closest('[data-recovery-issue]');if(link){jumpToRecovery(issues.find(i=>i.id===link.dataset.recoveryIssue));return;}
 const secondary=event.target.closest('[data-recovery-secondary]');if(secondary){const i=issues.find(i=>i.id===secondary.dataset.recoverySecondary);jumpToRecovery(i,i?.secondary[Number(secondary.dataset.secondaryIndex)]?.route);return;}
 if(event.target.closest('[data-recovery-compare]'))exploreOtherRoutes();
});
$('offset-plan-status').addEventListener('click',event=>{const field=event.target.closest('[data-compare-field]');if(field){const route=offsetFieldRoute(field.dataset.compareField,params);jumpToRecovery({id:'plan-check',route});return;}if(event.target.closest('[data-back-stock]')){stage=1;setEditor('stock');updateStages();document.querySelector('.input-editor').scrollIntoView({block:'start',behavior:'instant'});}});
$('offset-route-context').addEventListener('click',event=>{if(!event.target.closest('[data-expand-search]'))return;params.planMaxElbows=4;params.planMaxJoints=Math.max(8,params.planMaxJoints);$('offset-planMaxElbows').value=params.planMaxElbows;$('offset-planMaxJoints').value=params.planMaxJoints;render();exploreOtherRoutes();});
