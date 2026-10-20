const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>Number.isFinite(v)?Number(v.toFixed(2)).toString():'—';
export function mountAngleCheck(root,{title,current,analyze,kind}){
  root.classList.add('field-angle-check');root.innerHTML=`<summary>${esc(title)}</summary><div class="field-angle-body"><p>填你想檢查的量角／加工偏差。預填 ±0.5° 是試算假設，不是工具精度或允收值。</p><label>角度偏差 ± °<input type="number" min="0" max="5" step="any" inputmode="decimal" value="0.5" data-angle-deviation></label><button type="button" class="button" data-angle-calculate>重新試算</button><div data-angle-output role="status">展開後試算目前尺寸。</div></div>`;
  let key=null;
  const output=root.querySelector('[data-angle-output]'),field=root.querySelector('input');
  function calculate(){
    const value=field.value.trim()===''?NaN:Number(field.value),r=analyze(current(),value);
    if(!r.valid){output.innerHTML=`<p>${esc(r.message)}</p>`;return;}
    if(kind==='joint'){
      const all=r.rows.flatMap(rows=>rows.map(s=>s.outerDepth)),lo=Math.min(...all),range=Math.max(1,Math.max(...all)-lo),path=rows=>rows.map((s,i)=>`${i?'L':'M'}${20+s.angle/360*460},${30+(s.outerDepth-lo)/range*120}`).join(' ');
      output.innerHTML=`<strong>72 分點中的最大切線差 ${fmt(r.maximum.difference)} mm</strong><p>${fmt(r.maximum.clock)}° 母線的${r.maximum.edge==='outer'?'外緣':'內緣'}；試算角度 ${fmt(r.maximum.angle)}°。</p><svg viewBox="0 0 500 185" role="img" aria-label="原角度與正負角度偏差的外緣切線比較">${r.rows.map((rows,i)=>`<path d="${path(rows)}" fill="none" stroke="${['#206c89','#bd813b','#8b659e'][i]}" stroke-width="2"${i?' stroke-dasharray="5 3"':''}/>`).join('')}<text x="20" y="178" font-size="13" fill="#456477">藍：原角度　橙：−偏差　紫：＋偏差</text></svg><p>先核對量角方法，再決定留料與試配；不要把這個差值直接當成擴孔量。</p><small>${esc(r.scope)}</small>`;
    }else output.innerHTML=`<strong>已試算組合中，最大端口偏差 ${fmt(r.maximum.distance)} mm</strong><dl>${r.maximum.mismatch.map((v,i)=>`<div><dt>Δ${'XYZ'[i]}</dt><dd>${fmt(v)} mm</dd></div>`).join('')}<div><dt>管軸角差</dt><dd>${fmt(r.maximum.axisMismatch)}°</dd></div></dl><p>各彎頭偏差：${r.maximum.errors.map((v,i)=>`E${i+1} ${v>0?'+':''}${fmt(v)}°`).join('／')}。先核對角度與試組，不能據此決定吊鍊強拉。</p><small>${esc(r.scope)}</small>`;
  }
  root.addEventListener('toggle',()=>{if(root.open)calculate();});
  root.addEventListener('click',event=>{if(event.target.closest('[data-angle-calculate]'))calculate();});
  root.addEventListener('input',event=>{event.stopPropagation();output.textContent='偏差已修改，按「重新試算」更新。';});
  root.addEventListener('change',event=>event.stopPropagation());
  return {sync(nextKey){if(nextKey===key)return;key=nextKey;output.textContent='尺寸或接法已變更，按「重新試算」核對。';},calculate};
}
