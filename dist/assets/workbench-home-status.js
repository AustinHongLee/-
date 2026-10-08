// Home overview: what each tool was last doing, whether it is ready, and the next click.
// Reads only this browser's saved projects; nothing leaves the machine.
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(value,digits=1)=>Number.isFinite(Number(value))?Number(value).toLocaleString('zh-TW',{maximumFractionDigits:digits}):'—';
const read=key=>{try{return localStorage.getItem(key);}catch{return null;}};
const LABEL={ok:'可出單',warn:'需處理',error:'尺寸待修正',idle:'尚無進度',saved:'已保存'};
const ICON={ok:'✓',warn:'!',error:'✕',idle:'·',saved:'·'};

function card(tool,{tone='idle',title,lines=[],cta}){
  const slot=document.querySelector(`[data-home-status="${tool}"]`);if(!slot)return tone;
  slot.dataset.tone=tone;
  slot.innerHTML=`<p class="home-status-head"><span class="home-status-dot" aria-hidden="true">${ICON[tone]}</span><strong>${esc(LABEL[tone])}</strong>${title?`<span>${esc(title)}</span>`:''}</p>${lines.map(line=>`<p class="home-status-line">${line}</p>`).join('')}`;
  const open=document.querySelector(`[data-home-open="${tool}"]`);if(open&&cta)open.firstChild.textContent=cta+' ';
  return tone;
}

async function offsetStatus(){
  const text=read('special-method-offset-v1');if(!text)return card('offset',{lines:['從預設 XYZ 開始，先量兩個管口。']});
  try{
    const [{readOffsetProject},{computeOffset},{originalRoutePlan}]=await Promise.all([import('./offset-exports.js'),import('./offset-geometry.js'),import('./offset-planner.js')]);
    const {params,id,notices=[]}=readOffsetProject(text),r=computeOffset(params),xyz=`X ${fmt(params.run)} · Y ${fmt(params.roll)} · Z ${fmt(params.rise)}`;
    // Same baseline the tool shows: the original route with any required valves/flanges installed.
    const plan=r.valid&&r.basis==='ports'?originalRoutePlan(r):null,valid=r.valid&&(r.basis!=='ports'||plan?.valid);
    if(valid){const pipes=plan?.pipes??[{length:r.cutLength}],elbows=plan?.elbows??Object.values(r.elbows);return card('offset',{tone:notices.length?'warn':'ok',title:id,lines:[`<b>直管 ${pipes.length>1?'共 ':''}${fmt(pipes.reduce((s,e)=>s+e.length,0),2)} mm</b> · ${elbows.map(e=>fmt(e.angle,1)+'°').join(' / ')}${plan?.components?.length?` · ${plan.components.length} 組零件`:''}`,notices.length?'<em>舊版專案：請核對 Y 方向／現成彎頭 Ta</em>':esc(xyz)],cta:notices.length?'開啟核對':'繼續加工單'});}
    const routeOnly=params.basis==='ports'&&(r.context||r.valid);
    return card('offset',{tone:routeOnly?'warn':'error',title:id,lines:[esc(routeOnly?(r.valid?'原接法放不下指定零件，需選其他接法':'原兩彎頭接不成，需選其他接法'):(r.errors?.[0]?.message??'尺寸需修正')),esc(xyz)],cta:'繼續修正'});
  }catch{return card('offset',{tone:'saved',lines:['有保存的專案，開啟後重新驗證。'],cta:'繼續'});}
}

async function tankStatus(){
  const text=read('special-method-tank-v1');if(!text)return card('tank',{lines:['從預設 Ø1200 × 2000 開始。']});
  try{
    const [{readTankProject},{estimateTank},{NOZZLE_CONFLICT,nozzleIssueKey}]=await Promise.all([import('./tank-exports.js'),import('./tank-materials.js'),import('./tank-nozzles.js')]);
    const r=estimateTank(readTankProject(text)),conflicts=new Set((r.nozzlePlan?.items??[]).flatMap(n=>n.warnings.filter(w=>NOZZLE_CONFLICT.test(w)).map(w=>nozzleIssueKey(n.id,w)))).size;
    const tone=!r.stockComplete||r.nozzlePlan?.valid===false||r.fabrication?.valid===false?'error':conflicts?'warn':'ok';
    return card('tank',{tone,title:r.shapeLabel,lines:[`<b>${fmt(r.volume,3)} m³ · ${fmt(r.emptyWeight??r.netWeight,0)} kg</b> · ${r.stockComplete?r.plateSheets+' 張原板':'原板放不下'}`,`${r.input.basis==='inside'?'內徑':'外徑'} ${fmt(r.input.diameter)} × 直段 ${fmt(r.height)} mm${conflicts?` · <em>${conflicts} 項管嘴衝突</em>`:''}`],cta:'繼續估料'});
  }catch{return card('tank',{tone:'saved',lines:['有保存的專案，開啟後重新驗證。'],cta:'繼續'});}
}

function jointStatus(){
  const text=read('pipe-fabrication:last');if(!text)return card('joint',{lines:['從 8″ 主管 × 4″ 支管、90° 開始。']});
  try{
    const data=JSON.parse(text.replace(/^﻿/,'')),p=data.params??{},m=data.metadata??{};
    const host=p.hostType==='elbow'?`彎頭 Ø${fmt(p.mainOD)}`:p.hostType==='cone'?`大小管 Ø${fmt(p.mainOD)}→${fmt(p.mainEndOD)}`:`直管 Ø${fmt(p.mainOD)}`;
    const steel=p.branchSection&&p.branchSection!=='pipe',branch=steel?`鋼構 ${String(p.branchSection).toUpperCase()}`:`支管 Ø${fmt(p.branchOD)}`,joint=steel||p.motherOpening===false?'封閉外焊':p.jointType==='in'?'內插':'外貼';
    return card('joint',{tone:'saved',title:m.jointId??m.id??'',lines:[`<b>${esc(host)} × ${esc(branch)}</b>`,`${fmt(p.angle)}° · ${joint}`],cta:'繼續放樣'});
  }catch{return card('joint',{lines:['保存資料無法讀取，將從預設開始。']});}
}

const tones=await Promise.all([jointStatus(),offsetStatus(),tankStatus()]);
const active=tones.filter(t=>t!=='idle').length,attention=tones.filter(t=>t==='warn'||t==='error').length;
const overview=document.getElementById('home-overview');
if(overview&&active)overview.innerHTML=`${active} 個工具有保存進度${attention?` · <strong>${attention} 個需要處理</strong>`:' · 都可以繼續'}。點卡片接著做。`;
