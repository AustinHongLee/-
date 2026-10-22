import {readTankProject} from './tank-exports.js';
import {estimateTank} from './tank-materials.js';
import {tankDrawingModel} from './tank-drawing-model.js';
import {shellConstructionPlan} from './tank-shell-plan.js';
import {tankGeneralArrangement} from './tank-ga-drawing.js';
import {shellDrawingSheet} from './tank-shell-report.js';
import {supportDrawingSheet} from './tank-support-drawing.js';
import {TankViewer} from './tank-viewer.js';
import {ShellConstructionViewer} from './tank-shell-viewer.js';
import {esc,fmt} from './tank-visuals.js';
const $=id=>document.getElementById(id);let full=null,shell=null,view='3d',r,model;
try{
  const response=await fetch('./V-1102-review-project.json');if(!response.ok)throw Error('無法讀取檢視專案');
  r=estimateTank(readTankProject(await response.text()));model=tankDrawingModel(r);$('revision').textContent=model.revision;
  const mainItems=[...model.plates.map(p=>({id:p.id,text:p.finished.map(x=>fmt(x,2)).join(' × ')+'（成品）'})),...model.heads.map(h=>({id:h.id,text:`ID ${fmt(r.di)} · 名目 t${fmt(h.thickness)}`})),...model.welds.filter(w=>w.location==='located').map(w=>({id:w.id,text:`焊長 ${fmt(w.length,2)}${w.kind==='longitudinal'?' · '+fmt(w.angle,3)+'°':''}`}))];
  const supportParts=model.parts.filter(p=>p.assembly==='A1'&&p.id!=='A1.P5').map(p=>({id:p.id,text:['A1.P2','A1.P3'].includes(p.id)?'9t異形板 · 輪廓／拆件待核':p.id==='A1.P4'?'先備830×250×5 · 2片；3D尾碼-1／-2':p.spec+'；孔列偏置待核'})),supportWelds=(model.support?.zones??[]).map(w=>({id:w.id,text:w.size?`7 / 7全周 · 名目總長${fmt(w.length,2)} · WPS待核`:'接合區可辨識 · 焊道形式／範圍待核'}));
  let supportGroup='parts';
  function renderRows(){const isSupport=view.startsWith('support'),items=isSupport?(supportGroup==='parts'?supportParts:supportWelds):mainItems;$('support-filter').hidden=!isSupport;$('rows').innerHTML=items.map(p=>`<tr><td><button data-select="${p.id}">${p.id}</button></td><td>${esc(p.text)}</td></tr>`).join('');for(const b of document.querySelectorAll('[data-support-group]'))b.setAttribute('aria-pressed',String(b.dataset.supportGroup===supportGroup));}
  for(const b of document.querySelectorAll('[data-support-group]'))b.onclick=()=>{supportGroup=b.dataset.supportGroup;renderRows();};
  renderRows();
  if(model.support){$('support-pending').innerHTML=model.support.pending.map(p=>`<li><strong>${esc(p.id)}</strong> ${esc(p.text)}</li>`).join('');$('formed-summary').textContent=`830展開 / 142°成形分開核對：貼合OD660、板厚5，中面R332.5時弧長${fmt(model.support.formed.formedLength,3)}，差${fmt(model.support.formed.delta,3)} mm。外弧${fmt(model.support.formed.outsideLength,3)}接近830，可能採外弧取整，原圖基準待核。`;}
  $('pending').textContent=`另有 ${model.welds.filter(w=>w.location==='unlocated').length} 筆接合／群組尚未定位；支承另有5組接合區，實際焊道範圍待核。`;
  full=new TankViewer($('full'),id=>select(id));full.update(r);full.setActive(true);
  for(const b of document.querySelectorAll('[data-view]'))b.addEventListener('click',()=>setView(b.dataset.view));
  $('rows').addEventListener('click',e=>{const b=e.target.closest('[data-select]');if(b)select(b.dataset.select);});
  $('zoom').onclick=()=>{const zoomed=$('svg').classList.toggle('zoomed');$('zoom').textContent=zoomed?'適合畫面':'放大圖紙';};
  $('reset').onclick=()=>{if(['3d','support3d'].includes(view))full.reset();else shell?.reset();};$('end').onclick=()=>{if(view!=='shell')setView('shell');shell?.reset('end');};
  function select(id){if(view==='shell'&&!shellSceneIDs.has(id))setView(id.startsWith('A1.')?'support3d':'3d');for(const b of document.querySelectorAll('[data-select]'))b.setAttribute('aria-pressed',String(b.dataset.select===id));$('selected').textContent='目前核對：'+id+' · 模型 '+model.revision;full?.selectDrawing(id);shell?.selectDrawing(id);for(const node of $('svg').querySelectorAll('text'))if(node.textContent===id||node.textContent.startsWith(id+' ·')){node.style.fill='#b95c21';node.style.fontWeight='700';}}
  const shellSceneIDs=new Set([...model.plates.map(p=>p.id),...model.welds.filter(w=>w.scope==='shell').map(w=>w.id)]);
  function setView(next){
    view=next;$('svg').classList.remove('zoomed');$('zoom').textContent='放大圖紙';$('zoom').hidden=!['ga','plate','support2d','supportroll'].includes(view);for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',String(b.dataset.view===view));
    $('full').hidden=!['3d','support3d'].includes(view);$('shell').hidden=view!=='shell';$('svg').hidden=!['ga','plate','support2d','supportroll'].includes(view);full.setActive(['3d','support3d'].includes(view));shell?.setActive(view==='shell');
    if(view==='shell'){if(!shell){shell=new ShellConstructionViewer($('shell'),id=>select(id));shell.update(shellConstructionPlan(r),'weld');}shell.resize();shell.setActive(true);select(model.plates[0].id);}
    if(['3d','support3d'].includes(view)){full.resize();full.setSupportFocus(view==='support3d');full.setActive(true);}
    if(view==='support2d')$('svg').innerHTML=supportDrawingSheet(r,1);if(view==='supportroll')$('svg').innerHTML=supportDrawingSheet(r,2);if(view==='ga')$('svg').innerHTML=tankGeneralArrangement(r);if(view==='plate')$('svg').innerHTML=shellDrawingSheet(r);
    renderRows();$('end').hidden=!['3d','shell'].includes(view);
    for(const id of ['reset'])$(id).hidden=['ga','plate','support2d','supportroll'].includes(view);$('hint').textContent=['ga','plate','support2d','supportroll'].includes(view)?'向量圖稿 · 與 PDF 使用相同資料':'拖曳旋轉 · 滾輪／雙指縮放';
  }
}catch(e){$('full').innerHTML='<p class="error">'+esc(e.message)+'</p>';full?.setActive(false);}
