import { DEFAULT_PARAMS, computeJoint } from './geometry.js';
import { JointViewer } from './viewer.js';
import { templateSVG, templateDXF, stationCSV, projectJSON, readProjectJSON, validateProjectParams, fabricationReadiness, reportPagePlan, buildReportHTML, downloadText, openPrintReport } from './exports.js';

const $=id=>document.getElementById(id);
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=3)=>Number.isFinite(v)?Number(v.toFixed(d)).toString():'—';
const steps=['管材尺寸','接頭型式','補強板','出圖設定'];
const state={params:{...DEFAULT_PARAMS},metadata:{id:'J-001',revision:'1'},mode:'guided',step:0,template:'branch',result:null,revision:0};
let timer,toastTimer;
const viewer=new JointViewer($('viewer'));
const numberField=(key,label,unit='mm',note='',full=false)=>`<div class="field${full?' full':''}" data-field="${key}"><label for="param-${key}">${label}</label><div class="field-wrap"><input id="param-${key}" name="${key}" type="number" step="${key==='samples'?'1':'any'}" inputmode="decimal" value="${esc(state.params[key])}" aria-describedby="note-${key}"><span class="field-unit">${unit}</span></div><small id="note-${key}">${note}</small><small class="field-error" hidden></small></div>`;
const selectField=(key,label,options,note='',full=true)=>`<div class="field${full?' full':''}" data-field="${key}"><label for="param-${key}">${label}</label><select id="param-${key}" name="${key}">${options.map(([value,text])=>`<option value="${value}"${String(state.params[key])===value?' selected':''}>${text}</option>`).join('')}</select>${note?`<small>${note}</small>`:''}<small class="field-error" hidden></small></div>`;

function renderForm() {
  const p=state.params;
  const onDiagram='<svg viewBox="0 0 90 38" aria-hidden="true"><path d="M4 26H86M4 34H86" stroke="#75889e" stroke-width="2"/><path d="M35 3V26H55V3" fill="#c1e5f5" stroke="#1d68b5" stroke-width="2"/><path d="M41 27H49" stroke="#fff" stroke-width="8"/></svg>';
  const inDiagram='<svg viewBox="0 0 90 38" aria-hidden="true"><path d="M4 26H33M57 26H86M4 34H33M57 34H86" stroke="#75889e" stroke-width="2"/><path d="M35 3V34H55V3" fill="#c1e5f5" stroke="#1d68b5" stroke-width="2"/></svg>';
  const groups=[
    `<p class="step-description">輸入量測外徑；DN／NPS 公稱尺寸不可直接當作外徑。</p><div class="fields-grid">${numberField('mainOD','主管實際外徑')}${numberField('mainWall','主管壁厚')}${numberField('mainLength','主管長度')}${numberField('jointPosition','接頭軸位置','mm','距主管基準端')}${numberField('branchOD','支管實際外徑')}${numberField('branchWall','支管壁厚')}${numberField('branchLength','支管最短成品長度','mm','直端到最高切口，沿支管軸向',true)}</div>`,
    `<div class="connection-options"><button type="button" class="connection-option" data-joint="on" aria-pressed="${p.jointType==='on'}">${onDiagram}外貼式 · Set-on</button><button type="button" class="connection-option" data-joint="in" aria-pressed="${p.jointType==='in'}">${inDiagram}內插式 · Set-in</button></div><p class="field-note">${p.jointType==='on'?'管端貼合主管外壁，主管孔按支管內徑開孔。':'支管穿過主管壁，管端貼齊內壁或向內凸入。'}</p><div class="fields-grid">${numberField('angle','軸線夾角','°','相對主管軸；90° 為垂直')}${numberField('azimuth','繞主管方位','°','0° 管頂；90° 朝 +Y')}${numberField('offset','偏心量','mm','局部側向；正值朝 +Y')}${p.jointType==='on'?numberField('rootGap','外貼徑向間隙','mm','沿主管徑向放大切口'):numberField('projection','內插凸入深度','mm','從內壁沿支管軸向伸入')}${numberField('holeGap','主管孔口間隙','mm','每側放大量',true)}</div><div class="angle-presets">${[30,45,60,90].map(a=>`<button type="button" class="button" data-angle="${a}">${a}°</button>`).join('')}</div>`,
    `<label class="check-field"><input type="checkbox" name="padEnabled"${p.padEnabled?' checked':''}>加入補強板</label><div id="pad-fields"${p.padEnabled?'':' hidden'}><div class="fields-grid">${selectField('padShape','展開下料外形',[['circle','圓形'],['ellipse','橢圓形'],['obround','長圓形'],['rounded','圓角矩形']],'圓形指平板下料外形；成形後貼合主管曲面。')}${selectField('padSplit','分片方式',[['single','單片'],['axial','兩片：接縫沿主管軸向'],['circumferential','兩片：接縫沿主管圓周']])}${numberField('padThickness','補強板厚度')}${numberField('padMargin','最低留邊','mm','中性層孔緣至外緣')}${numberField('padClearance','板孔間隙','mm','相對支管外徑，每側')}${numberField('kFactor','中性層係數 K','','0–1；預設 0.5，需成形校正')}</div><p class="field-note">最低留邊決定外形尺寸。補強需求面積與有效厚度另依設計規範確認。</p></div>`,
    `<div class="fields-grid">${numberField('tolerance','幾何與離散公差','mm','弦差超限將停止製作匯出',true)}${selectField('samples','圓周幾何取樣',[['180','180 點'],['360','360 點'],['720','720 點'],['1440','1440 點']],'取樣越密，裁線越細。此設定與尺寸表分點數不同。')}</div><p class="field-note">SVG／DXF 保留實際毫米尺寸。報告可用 A4／A3 拼接列印，包含重疊對位及雙方向校正尺。</p><button type="button" id="step-report" class="button primary">設定現場報告</button>`
  ];
  $('parameter-form').innerHTML=groups.map((html,i)=>`<section class="form-group" data-step="${i}"${state.mode==='guided'&&state.step!==i?' hidden':''}><h3>${i+1}. ${steps[i]}</h3>${html}</section>`).join('');
  const samples=$('param-samples');if(![...samples.options].some(o=>Number(o.value)===p.samples))samples.add(new Option(`${p.samples} 點`,p.samples));samples.value=String(p.samples);
  $('steps').innerHTML=steps.map((text,i)=>`<button type="button" data-step-button="${i}" aria-pressed="${state.mode==='guided'&&i===state.step}"><span class="step-number">${i+1}</span>${text}</button>`).join('');
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===state.mode)));
  $('previous-step').disabled=state.step===0;$('next-step').textContent=state.step===3?'製作報告':'下一步';document.querySelector('.step-actions').hidden=state.mode==='expert';displayErrors();
}
function notify(text) {$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
function displayErrors() {
  document.querySelectorAll('[data-field]').forEach(el=>{const err=state.result?.errors.find(e=>e.field===el.dataset.field);el.querySelector('input,select')?.setAttribute('aria-invalid',String(!!err));const target=el.querySelector('.field-error');target.hidden=!err;target.textContent=err?.message??'';});
  const errors=state.result?.errors??[];$('form-errors').hidden=!errors.length;$('form-errors').textContent=errors.map(e=>e.message).join(' ');
}
function compute() {
  clearTimeout(timer);state.result=computeJoint(state.params);state.revision++;
  const r=state.result,readiness=fabricationReadiness(r);viewer.update(r);document.querySelectorAll('[data-layer]').forEach(el=>viewer.setLayer(el.dataset.layer,el.checked));displayErrors();
  $('model-title').textContent=r.params.jointType==='on'?'外貼式接頭 · Set-on':'內插式接頭 · Set-in';
  $('geometry-status').textContent=r.valid?(readiness.ready?'幾何驗證通過':'裁線精度待調整'):'尺寸需修正';$('geometry-status').classList.toggle('error',!readiness.ready);
  $('model-summary').textContent=r.valid?`${fmt(r.params.angle)}° · 主管 Ø${fmt(r.params.mainOD)} / 支管 Ø${fmt(r.params.branchOD)} · 孔工具 Ø${fmt(r.measurements.mainHoleToolDiameter)}`:'請修正左側尺寸，模型與圖面暫停。';
  for(const id of ['svg-export','dxf-export','csv-export','report-button','step-report']){const el=$(id);if(el){el.disabled=!readiness.ready;el.title=readiness.reason;}}
  if(!r.templates.some(t=>t.id===state.template))state.template=r.templates[0]?.id??'';
  $('part-tabs').innerHTML=r.templates.map(t=>`<button type="button" role="tab" data-template="${t.id}" aria-selected="${t.id===state.template}">${t.id==='branch'?'B 支管':t.id==='main'?'A 主管':t.id==='pad'?'C 補強板':`C${t.id.split('-')[1]} 分片`}</button>`).join('');
  renderPattern();renderVerification();renderStations();$('revision-status').textContent=`接頭 ${state.metadata.id} · 本機第 ${state.revision} 次計算`;
  if(r.valid)try{localStorage.setItem('pipe-fabrication:last',projectJSON(state.params,state.metadata));}catch{}
  if($('report-dialog').open)updateReportPlan();
}
function currentTemplate() {return state.result.templates.find(t=>t.id===state.template);}
function renderPattern() {
  const t=currentTemplate(),svg=$('pattern');if(!t){svg.replaceChildren();$('pattern-title').textContent='尚無有效圖面';$('pattern-size').textContent='';$('pattern-note').textContent='請先修正尺寸。';return;}
  $('pattern-title').textContent=t.title;$('pattern-size').textContent=`${fmt(t.width,2)} × ${fmt(t.height,2)} mm · ${t.basis}`;$('pattern-note').textContent=t.notes.join(' ');
  const w=Math.max(300,svg.clientWidth),h=svg.clientHeight||280,margin=32,scale=Math.min((w-margin*2)/t.width,(h-margin*2)/t.height),x0=(w-t.width*scale)/2,y0=(h-t.height*scale)/2;
  svg.setAttribute('viewBox',`0 0 ${w} ${h}`);const points=p=>p.map(([x,y],i)=>`${i?'L':'M'}${fmt(x0+x*scale,5)},${fmt(y0+y*scale,5)}`).join(' '),d=[t.outer,...t.holes].map(p=>points(p)+'Z').join(' ');
  svg.innerHTML=`<defs><pattern id="pattern-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" stroke="#e6ecf3" fill="none" stroke-width=".7"/></pattern></defs><rect width="${w}" height="${h}" fill="url(#pattern-grid)"/><path d="${d}" fill="#eaf2fc" fill-rule="evenodd" stroke="#1d68b5" stroke-width="1.7" stroke-linejoin="round"/>${t.references.map(ref=>`<path d="${points(ref.points)}" fill="none" stroke="${ref.type==='inner-edge'?'#b57933':'#7d8d9e'}" stroke-width="1" stroke-dasharray="5 4"/>`).join('')}<text x="${w/2}" y="${h-7}" text-anchor="middle">${fmt(t.width,2)} mm</text><text x="${Math.max(5,x0-7)}" y="${h/2}" text-anchor="end" transform="rotate(-90 ${Math.max(5,x0-7)} ${h/2})">${fmt(t.height,2)} mm</text>`;
  if(t.id==='branch')svg.insertAdjacentHTML('beforeend',`<text x="${x0+4}" y="${Math.max(14,y0-9)}">0° 起縫</text><text x="${x0+t.width*scale-4}" y="${Math.max(14,y0-9)}" text-anchor="end">360°</text>`);
}
function renderVerification() {
  const r=state.result,vfmt=v=>v!==0&&Math.abs(v)<.000001?v.toExponential(2):fmt(v,6);
  $('verification-rows').innerHTML=r.verification.map(v=>`<tr><td>${esc(v.label)}</td><td>${vfmt(v.value)} ${v.unit}</td><td>${['pad-margin','pad-inner-fit','pad-outer-fit'].includes(v.id)?'≥':'≤'} ${fmt(v.tolerance,6)} ${v.unit}</td><td class="${v.status==='pass'?'pass':'fail'}">${v.status==='pass'?'通過':v.status==='warning'?'需調整':'未通過'}</td></tr>`).join('');
  $('validation-summary').textContent=r.valid?`主管孔 ${fmt(r.measurements.mainHoleAxialLength,2)} × ${fmt(r.measurements.mainHoleArcWidth,2)} mm（軸向 × 周向）；支管切深 ${fmt(r.measurements.branchMinLength,2)}–${fmt(r.measurements.branchMaxLength,2)} mm${r.params.padEnabled?`；補強板淨面積 ${fmt(r.measurements.padNetArea/100,2)} cm²`:''}`:'模型無效，請先修正尺寸。';$('warnings').innerHTML=r.warnings.map(w=>`<p>${esc(w)}</p>`).join('');
}
function tableResult() {
  const r=state.result;if(!r.valid)return r;const count=Number($('station-count').value),rows=r.stationTable,n=rows.length-1;
  const stationTable=Array.from({length:count+1},(_,i)=>{const f=i*n/count,index=Math.min(n-1,Math.floor(f)),t=f-index,row={};for(const key of ['angle','circumference','outerDepth','innerDepth'])row[key]=rows[index][key]*(1-t)+rows[index+1][key]*t;return row;});return {...r,stationTable};
}
function renderStations() {$('station-rows').innerHTML=tableResult().stationTable.map((s,i)=>`<tr tabindex="0" data-station="${i}" aria-label="${fmt(s.angle)}度切口"><td>${fmt(s.angle)}</td><td>${fmt(s.circumference)}</td><td>${fmt(s.outerDepth)}</td><td>${fmt(s.innerDepth)}</td></tr>`).join('');}
function reportOptions() {return {paper:$('report-paper').value,orientation:$('report-orientation').value,parts:[...$('report-parts').querySelectorAll('input:checked')].map(i=>i.value),assemblySVG:assemblySVG()};}
function assemblySVG() {const data=viewer.image();return data?`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 440"><image href="${data}" x="0" y="0" width="800" height="440" preserveAspectRatio="xMidYMid meet"/></svg>`:'';}
function updateReportPlan() {try{const plan=reportPagePlan(tableResult(),reportOptions());$('report-pages').textContent=`共 ${plan.totalPages} 頁：資料與驗證 ${plan.coverPages} 頁、分點尺寸 ${plan.stationPages} 頁；${plan.parts.map(p=>`${p.template.title} ${p.pageCount} 頁（${p.columns} × ${p.rows} 拼接）`).join('；')}。`;$('print-report').disabled=false;$('download-report').disabled=false;}catch(e){$('report-pages').textContent=e.message;$('print-report').disabled=true;$('download-report').disabled=true;}}
function openReport() {if(!fabricationReadiness(state.result).ready)return;$('report-parts').innerHTML='<legend>包含零件</legend>'+state.result.templates.map(t=>`<label><input type="checkbox" value="${t.id}" checked>${esc(t.title)}</label>`).join('');updateReportPlan();$('report-dialog').showModal();}
function filename(suffix) {return `${state.metadata.id.replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g,'_')||'joint'}-${suffix}`;}
function safeAction(fn,manufacturing=true) {try{if(manufacturing&&state.result!==null){const readiness=fabricationReadiness(state.result);if(!readiness.ready)throw new Error(readiness.reason);}fn();}catch(error){notify(error.message);}}

$('parameter-form').addEventListener('submit',e=>e.preventDefault());
$('parameter-form').addEventListener('input',event=>{const el=event.target;if(!el.name)return;const value=el.type==='checkbox'?el.checked:el.tagName==='SELECT'&&el.name!=='samples'?el.value:el.value===''?NaN:Number(el.value);state.params[el.name]=value;if(el.name==='padEnabled')$('pad-fields').hidden=!value;for(const id of ['svg-export','dxf-export','csv-export','report-button','step-report'])if($(id))$(id).disabled=true;$('geometry-status').textContent='重新計算中…';clearTimeout(timer);timer=setTimeout(compute,120);});
$('parameter-form').addEventListener('click',e=>{const joint=e.target.closest('[data-joint]'),angle=e.target.closest('[data-angle]');if(joint){state.params.jointType=joint.dataset.joint;state.params.projection=0;state.params.rootGap=0;renderForm();compute();}if(angle){state.params.angle=Number(angle.dataset.angle);$('param-angle').value=state.params.angle;compute();}if(e.target.closest('#step-report'))openReport();});
$('steps').addEventListener('click',e=>{const b=e.target.closest('[data-step-button]');if(b){state.step=Number(b.dataset.stepButton);state.mode='guided';renderForm();}});
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{state.mode=b.dataset.mode;renderForm();}));
$('previous-step').addEventListener('click',()=>{state.step=Math.max(0,state.step-1);renderForm();});$('next-step').addEventListener('click',()=>{if(state.step===3)openReport();else{state.step++;renderForm();}});
$('part-tabs').addEventListener('click',e=>{const b=e.target.closest('[data-template]');if(b){state.template=b.dataset.template;$('part-tabs').querySelectorAll('button').forEach(el=>el.setAttribute('aria-selected',String(el===b)));renderPattern();}});
for(const id of ['validation','stations','instructions'])$(`${id}-tab`).addEventListener('click',()=>{for(const key of ['validation','stations','instructions']){$(`${key}-tab`).setAttribute('aria-selected',String(key===id));$(`${key}-panel`).hidden=key!==id;}});
for(const [id,flag] of [['explode-view','explode'],['transparent-view','transparent'],['section-view','section']])$(id).addEventListener('click',()=>{const pressed=$(id).getAttribute('aria-pressed')!=='true';$(id).setAttribute('aria-pressed',String(pressed));viewer.setFlag(flag,pressed);});
document.querySelectorAll('[data-camera]').forEach(b=>b.addEventListener('click',()=>viewer.fit(b.dataset.camera)));$('fit-view').addEventListener('click',()=>viewer.fit());document.querySelectorAll('[data-layer]').forEach(el=>el.addEventListener('change',()=>viewer.setLayer(el.dataset.layer,el.checked)));
$('station-count').addEventListener('change',renderStations);
function highlightStation(e) {const row=e.target.closest('[data-station]');if(!row)return;viewer.highlight(Math.round(Number(row.dataset.station)*state.result.params.samples/Number($('station-count').value)));$('station-rows').querySelectorAll('tr').forEach(r=>r.classList.toggle('selected',r===row));}
$('station-rows').addEventListener('click',highlightStation);$('station-rows').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();highlightStation(e);}});
$('svg-export').addEventListener('click',()=>safeAction(()=>downloadText(templateSVG(currentTemplate()),filename(`${state.template}.svg`),'image/svg+xml;charset=utf-8')));$('dxf-export').addEventListener('click',()=>safeAction(()=>downloadText(templateDXF(currentTemplate()),filename(`${state.template}.dxf`),'application/dxf')));$('csv-export').addEventListener('click',()=>safeAction(()=>downloadText(stationCSV(tableResult()),filename('分點尺寸.csv'),'text/csv;charset=utf-8')));
$('save-project').addEventListener('click',()=>safeAction(()=>{compute();if(!state.result.valid)throw new Error('請先修正尺寸再儲存專案。');downloadText(projectJSON(state.params,{...state.metadata,updatedAt:new Date().toISOString()}),filename('專案.json'),'application/json');notify('已儲存專案參數，可使用「載入專案」恢復。');},false));$('load-project').addEventListener('click',()=>$('project-file').click());
$('project-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>200000)throw new Error('專案檔不得超過 200 KB。');const project=readProjectJSON(await file.text()),candidate={...DEFAULT_PARAMS,...project.params},r=computeJoint(candidate);if(!r.valid)throw new Error(r.errors.map(e=>e.message).join(' '));state.params=candidate;state.metadata={id:'J-001',revision:'1',...project.metadata};$('joint-id').value=state.metadata.id;renderForm();compute();viewer.fit();notify('專案已載入，幾何與圖面已重新驗證。');}catch(error){notify(error.message);}finally{e.target.value='';}});
$('joint-id').addEventListener('input',()=>{state.metadata.id=$('joint-id').value.trim()||'J-001';$('revision-status').textContent=`接頭 ${state.metadata.id} · 本機第 ${state.revision} 次計算`;});$('report-button').addEventListener('click',openReport);
for(const id of ['report-paper','report-orientation','report-parts'])$(id).addEventListener('change',updateReportPlan);
$('download-report').addEventListener('click',()=>safeAction(()=>{downloadText(buildReportHTML(tableResult(),state.metadata,reportOptions()),filename('現場報告.html'),'text/html;charset=utf-8');notify('報告已下載，可離線開啟並列印成 PDF。');}));
$('print-report').addEventListener('click',()=>safeAction(()=>{const status=openPrintReport(buildReportHTML(tableResult(),state.metadata,reportOptions()),filename('現場報告.html'));if(!status.opened)notify('瀏覽器阻擋了新視窗，已改為下載報告，請開啟檔案列印。');}));
new ResizeObserver(()=>renderPattern()).observe($('pattern'));
try{const saved=localStorage.getItem('pipe-fabrication:last');if(saved){const project=readProjectJSON(saved),params={...DEFAULT_PARAMS,...project.params};if(computeJoint(params).valid){state.params=params;state.metadata={...state.metadata,...project.metadata};$('joint-id').value=state.metadata.id;}}}catch{}
renderForm();compute();

// Optional browser-native tools act on the same validated state as the form.
function registerTools() {
  if(!document.modelContext?.registerTool)return;
  const context=document.modelContext,lifecycle=new AbortController(),textResult=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
  const register=tool=>Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(error=>console.warn(error.message));
  register({name:'read_pipe_joint',description:'Read the visible pipe joint dimensions, selected template and geometric fabrication validation.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:async()=>textResult({params:state.params,metadata:state.metadata,selectedTemplate:state.template,valid:state.result.valid,verification:state.result.verification,errors:state.result.errors,templates:state.result.templates.map(t=>({id:t.id,title:t.title,width:t.width,height:t.height}))})});
  register({name:'configure_pipe_joint',description:'Apply dimensions to the visible single main/branch pipe joint. Invalid geometry is rejected without changing current state.',inputSchema:{type:'object',properties:{params:{type:'object',properties:Object.fromEntries(Object.entries(DEFAULT_PARAMS).map(([k,v])=>[k,{type:typeof v==='boolean'?'boolean':typeof v==='number'?'number':'string'}])),additionalProperties:false}},required:['params'],additionalProperties:false},annotations:{readOnlyHint:false},execute:async({params})=>{if(!params||typeof params!=='object'||Array.isArray(params))throw new Error('尺寸參數必須是物件。');const candidate={...state.params,...params};validateProjectParams(candidate);const result=computeJoint(candidate);if(!result.valid)throw new Error(result.errors.map(e=>e.message).join(' '));state.params=candidate;renderForm();compute();return textResult({valid:state.result.valid,verification:state.result.verification});}});
  register({name:'select_pipe_template',description:'Select and inspect a current manufacturing template in the drawing pane; does not create or send files.',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false},annotations:{readOnlyHint:false},execute:async({id})=>{if(!state.result.templates.some(t=>t.id===id))throw new Error('未知的零件圖面。');state.template=id;compute();const t=currentTemplate();return textResult({id:t.id,title:t.title,width:t.width,height:t.height,basis:t.basis});}});
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
try{registerTools();}catch(error){console.warn('Browser model context unavailable:',error.message);}
