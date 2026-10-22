import {searchShellLayout} from './tank-shell-layout-search.js';
import {shellCourses,shellBatchLabel} from './tank-shell-layout.js';
import {assemblySketch,esc,fmt} from './tank-visuals.js';
const configuration=r=>JSON.stringify(r.input);
const courseTable=(r,before)=>`<div class="shell-layout-table-wrap"><table><thead><tr><th>圈</th><th>板高 mm${before?'（原 → 新）':''}</th><th>起點角</th><th>各片成品弧長 mm</th></tr></thead><tbody>${shellCourses(r).map(c=>`<tr><th>${c.course}</th><td>${before?fmt(shellCourses(before)[c.course-1]?.height??0,2)+' → ':''}${fmt(c.height,2)}</td><td>${fmt(c.startAngle,2)}°</td><td>${c.pieces.map(b=>`<span>${b.id} <b>${fmt(b.length,2)}</b></span>`).join('')}</td></tr>`).join('')}</tbody></table></div>`;

export class TankShellLayoutUI{
  constructor({root,onApply,notify}){
    this.root=root;this.onApply=onApply;this.notify=notify;this.undo=null;
    root.className='shell-layout-workspace';root.innerHTML=`<details><summary><span><strong>連分圈、分片一起避讓</strong><small>管嘴固定 · 先保留焊道數</small></span></summary><div class="shell-layout-content"><p>起縫角轉不開時，調整每圈板高、各片弧長與逐圈起點。毛坯必須放得進目前原板，管嘴與補強板位置保留。</p><div class="shell-layout-rules"><label>最小成品板邊 mm<input data-layout-min="minimumPlateEdge" aria-label="最小成品板邊" type="number" min="0" max="10000" value="200" step="any"><small>避免切出太窄的板條；依設備／工法自訂</small></label><label>相鄰圈縱縫最小錯開 mm<input data-layout-min="minimumStagger" aria-label="相鄰圈縱縫最小錯開" type="number" min="0" max="10000" value="100" step="any"><small>沿外表面量接縫中心距；依圖說自訂</small></label></div><label class="shell-layout-extra"><input type="checkbox" data-layout-extra> 原焊道數找不到時，另找多 1 道縱縫的備案</label><div class="shell-layout-actions"><button type="button" data-layout-search>找避讓配置 <span aria-hidden="true">→</span></button><button type="button" data-layout-reset hidden>回等高／等距分片</button><button type="button" data-layout-undo hidden>復原配置</button></div><p class="shell-layout-status" role="status" aria-live="polite" data-layout-status></p><div data-layout-current></div><div data-layout-proposal></div></div></details>`;
    root.addEventListener('input',e=>{e.stopPropagation();this.cancel();this.proposal=null;this.drawProposal();this.root.querySelector('[data-layout-status]').textContent='條件已修改；可重新找配置，或在展開圖拖曳接縫時採用。';});
    root.addEventListener('change',e=>e.stopPropagation());
    root.addEventListener('click',async e=>{
      if(e.target.closest('[data-layout-search]'))await this.search();
      else if(e.target.closest('[data-layout-apply]')&&this.proposal?.ok){this.undo={shellLayoutPlan:this.result.input.shellLayoutPlan,seamStart:this.result.input.seamStart};const proposal=this.proposal;this.proposal=null;this.onApply({shellLayoutPlan:proposal.input.shellLayoutPlan,seamStart:proposal.input.seamStart});this.notify('已套用逐圈／逐片配置；管嘴位置保留，板料、焊道、2D／3D 與加工單已重算。');}
      else if(e.target.closest('[data-layout-undo]')&&this.undo){const value=this.undo;this.undo=null;this.onApply(value);this.notify('已復原上一個筒身配置。');}
      else if(e.target.closest('[data-layout-reset]')){this.undo={shellLayoutPlan:this.result.input.shellLayoutPlan,seamStart:this.result.input.seamStart};this.onApply({shellLayoutPlan:null});this.notify('已回到依目前板型等高／等距分片；管嘴位置保留。');}
    });
  }
  cancel(){this.controller?.abort();this.controller=null;this.root.querySelector('[data-layout-search]').disabled=false;}
  async search(){
    this.cancel();const controller=new AbortController();this.controller=controller;const button=this.root.querySelector('[data-layout-search]'),status=this.root.querySelector('[data-layout-status]');
    button.disabled=true;this.proposal=null;this.drawProposal();status.textContent='正在比較板高、各片弧長及錯縫位置…';
    const rules=Object.fromEntries([...this.root.querySelectorAll('[data-layout-min]')].map(el=>[el.dataset.layoutMin,el.value.trim()===''?NaN:Number(el.value)]));
    try{const proposal=await searchShellLayout(this.result,{...rules,allowExtraWeld:this.root.querySelector('[data-layout-extra]').checked,signal:controller.signal,onProgress:()=>{status.textContent='正在檢查原板可用尺寸與所有管嘴／補強板施工區…';}});if(controller.signal.aborted)return;this.proposal=proposal;status.textContent=proposal.ok?'找到可供比較的配置；檢查下圖與尺寸後再套用。':proposal.message;this.drawProposal();}
    catch(error){if(!controller.signal.aborted)status.textContent='搜尋未完成：'+error.message;}
    finally{if(this.controller===controller){this.controller=null;button.disabled=false;}}
  }
  render(r){
    const key=configuration(r);if(this.key!==key){this.cancel();this.key=key;this.proposal=null;this.drawProposal();this.root.querySelector('[data-layout-status]').textContent='';}
    this.result=r;this.root.querySelector('[data-layout-reset]').hidden=!r.input.shellLayoutPlan;this.root.querySelector('[data-layout-undo]').hidden=!this.undo;
    const current=this.root.querySelector('[data-layout-current]');current.innerHTML=r.shellLayoutState?.valid===false?`<p class="shell-layout-error" role="alert">${r.shellLayoutState.issues.map(i=>esc(i.message)).join('<br>')}${r.shellLayoutState.custom?'目前保留實際接縫位置並標紅；可直接拖回合適位置。':'目前顯示等分參考圖；請重新找配置或回等分。'}修正後才可輸出加工單。</p>`:r.shellLayoutState?.custom?`<details class="shell-layout-current"><summary>已採用逐圈／逐片配置 · ${shellBatchLabel(r)}</summary>${courseTable(r)}<p>最小板邊 ${fmt(r.input.shellLayoutPlan.rules.minimumPlateEdge)} mm · 相鄰圈錯縫 ${fmt(r.input.shellLayoutPlan.rules.minimumStagger)} mm；兩項為本案操作條件。</p></details>`:'';
  }
  drawProposal(){
    const el=this.root.querySelector('[data-layout-proposal]'),p=this.proposal;if(!p?.ok){el.innerHTML='';return;}
    const r=p.result,before=this.result;
    el.innerHTML=`<article class="shell-layout-proposal"><header><div><h4>${p.extraWelds>0?'備案：多 '+p.extraWelds+' 道縱縫':'維持焊道數的避讓配置'}</h4><p>管嘴／補強板位置固定 · 依已填尺寸未見筒身接縫干涉${p.pending.length?'；仍有 '+p.pending.length+' 項施工尺寸待確認':''}</p></div></header><dl><div><dt>筒身焊道</dt><dd>${before.verticalSeams+before.horizontalSeams} → ${p.welds} 道</dd></div><div><dt>接縫總長</dt><dd>${fmt(before.weldLength/1000,2)} → ${fmt(r.weldLength/1000,2)} m</dd></div><div><dt>已排原板</dt><dd>${before.plateSheets} → ${r.plateSheets} 張</dd></div></dl><div class="shell-layout-preview">${assemblySketch(r,{compact:true,clipId:'shell-layout-preview-clip'})}</div><p>圈高沿槽軸；弧長在板厚中面。已扣接縫間隙，毛坯另含修邊與直邊留料。</p>${courseTable(r,before)}<details><summary>搜尋與使用範圍</summary><p>先比較原焊道數；只有勾選備案，才在找不到時試加一道縱縫。相鄰圈錯縫距離依輸入檢查。採購張數為現有排料估算；這是有限候選中的可行配置，未保證全域最省。封頭分片及端部管嘴基準維持原值。管嘴本身碰撞與規範要求仍依圖說核對。</p></details><button type="button" data-layout-apply>${p.extraWelds>0?'採用增加焊道的備案':'套用這個配置'} <span aria-hidden="true">→</span></button></article>`;
  }
  apply(plan){this.cancel();this.undo=null;this.proposal=null;this.key=null;for(const el of this.root.querySelectorAll('[data-layout-min]'))el.value=plan?.rules?.[el.dataset.layoutMin]??(el.dataset.layoutMin==='minimumPlateEdge'?200:100);}
  focus(){const d=this.root.querySelector('details');d.open=true;this.root.scrollIntoView({block:'center',behavior:'smooth'});this.root.querySelector('[data-layout-search]').focus({preventScroll:true});}
}
