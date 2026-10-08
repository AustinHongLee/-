// A4 sheet for the owner: two routes side by side, what the extra welds and bends do for this medium,
// a true-scale weld section, and the quality steps that take the weld bead out of the question.
import {esc,fmt,documentHTML} from './offset-exports.js';
import {MEDIUM_KINDS,PIPE_MATERIALS,REGIME_NAMES,FLOW_REFERENCES,routeFlow,compareFlow,pressureText,signedPressure,waterColumnCm,weldBeadK} from './offset-flow.js';
import {flowRouteSVG,weldSectionSVG} from './offset-flow-visuals.js';
import {routePlanTitle} from './offset-plan-exports.js';

const abs=Math.abs,more=(d,unit,digits=2)=>`${d>=0?'多':'少'} ${fmt(abs(d),digits)}${unit==='°'?'':' '}${unit}`;
const weldText=d=>d>0?`多 ${d} 道焊口`:d<0?`少 ${-d} 道焊口`:'焊口數相同';
const table=(head,rows)=>`<table><thead><tr>${head.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((c,i)=>`<${i?'td':'th'}>${esc(c)}</${i?'td':'th'}>`).join('')}</tr>`).join('')}</tbody></table>`;
const beadWords=ctx=>ctx.exposedBead>0?`內凸 ${fmt(ctx.bead,2)} mm`:ctx.finish==='ground'?'內面磨平／控制平順':'與管壁齊平';

/** Headline and supporting sentence, written for the owner. */
export function ownerConclusion(baseFlow,planFlow,ctx){
  if(!planFlow||!ctx?.valid)return null;
  const flushNote=ctx.exposedBead>0?'':'焊道內面平順，焊口本身不再造成阻力或凸起。';
  const laminar=ctx.liquid&&ctx.regime==='laminar'&&ctx.exposedBead>0?`${MEDIUM_KINDS[ctx.kind].label}在這個流速為層流，焊道兩側角落流速很慢，會附著的物料容易積料；焊道內面磨平或以氬焊打底控制平順即可避免。`:'';
  if(!baseFlow){
    if(ctx.liquid){const s=planFlow.dp.total;return {headline:`這個接法壓損 ${pressureText(s)}，約等於 ${fmt(planFlow.equivalentLength,1)} m 直管。`,detail:`彎頭 ${pressureText(planFlow.dp.bends,s)}、焊口 ${pressureText(planFlow.dp.welds,s)}、直管 ${pressureText(planFlow.dp.pipe,s)}。${flushNote}${laminar}`};}
    return {headline:`這個接法總轉角 ${fmt(planFlow.totalTurn,1)}°，共 ${planFlow.welds} 道焊口。`,detail:ctx.exposedBead>0?'焊道內凸會被粒子撞上；內面平順後，焊口不再影響粒子。彎頭外背是主要磨耗與拉絲位置。':'焊道內面平順，粒子碰不到焊道；彎頭外背是主要磨耗與拉絲位置。'};
  }
  const d=compareFlow(baseFlow,planFlow,ctx);
  if(ctx.liquid){
    const s=d.dp.total,column=waterColumnCm(abs(s)),scale=Math.max(abs(planFlow.dp.total),abs(s));
    const headline=`建議方案${weldText(d.welds)}，壓損${s>=0?'多':'少'} ${pressureText(abs(s),scale)}（約 ${fmt(column,column<1?2:1)} cm 水柱），相當於${more(d.equivalentLength,'m',1)} 直管。`;
    const pipe=abs(d.dp.pipe)>=(scale>=1000?5:0.5)?`、直管 ${signedPressure(d.dp.pipe,scale)}`:'';
    const split=ctx.exposedBead>0?`其中焊口 ${signedPressure(d.dp.welds,scale)}、彎頭轉角 ${signedPressure(d.dp.bends,scale)}${pipe}。`:`差異來自彎頭轉角 ${signedPressure(d.dp.bends,scale)}${pipe}。`;
    return {headline,detail:split+flushNote+laminar};
  }
  const headline=`建議方案${weldText(d.welds)}，總轉角${more(d.turn,'°',1)}（${fmt(baseFlow.totalTurn,1)}° → ${fmt(planFlow.totalTurn,1)}°）。`;
  const detail=ctx.exposedBead>0?`焊道內凸 ${fmt(ctx.bead,2)} mm，約粒徑的 ${fmt(ctx.pelletRatio*100,0)}%，粒子會撞上焊道；焊口內面平順後，多出的焊口不再影響粒子。彎頭外背仍是主要磨耗與拉絲位置。`:'焊口內面平順，粒子碰不到焊道，多出的焊口不影響粒子。差別在彎頭：總轉角越小，撞擊與拉絲越少。';
  return {headline,detail};
}

/** What bead control buys: one weld at the input height, at 1 mm, and flush. */
export function beadSensitivity(ctx){
  if(!ctx?.valid||!(ctx.bead>0))return '';
  const heights=[ctx.bead,...(ctx.bead>1?[1]:[]),0];
  if(!ctx.liquid)return `焊道內凸與粒子：${heights.map(h=>h?`${fmt(h,1)} mm＝粒徑的 ${fmt(h/ctx.pellet*100,0)}%`:'平順＝不會撞上').join(' · ')}`;
  const length=h=>weldBeadK(h/1000,ctx.D,ctx.Re,(3*ctx.bead+3)/1000)*ctx.D/ctx.f;
  return `每道焊口換算直管（保守）：${heights.map(h=>h?`內凸 ${fmt(h,1)} mm ≈ ${fmt(length(h),2)} m`:'平順 0 m').join(' · ')}`;
}
function inputsTable(ctx){
  const m=ctx.medium,rows=[['介質',MEDIUM_KINDS[ctx.kind].label]];
  if(ctx.liquid)rows.push(['流量／流速',`${fmt(m.flow,2)} m³/h · ${fmt(ctx.velocity,2)} m/s`],['密度／黏度',`${fmt(m.density,1)} kg/m³ · ${fmt(m.viscosity,3)} mPa·s`],['雷諾數',`${Math.round(ctx.Re).toLocaleString('en-US')}（${REGIME_NAMES[ctx.regime]}）`]);
  else rows.push(['粒徑',`${fmt(ctx.pellet,1)} mm`]);
  rows.push(['管外徑／壁厚／內徑',`${fmt(ctx.od,2)} / ${fmt(ctx.wall,2)}${ctx.medium.wall==null?'（STD）':''} / ${fmt(ctx.idMm,2)} mm`]);
  if(ctx.liquid)rows.push(['管內粗糙度',`${PIPE_MATERIALS[m.material].label} ${fmt(ctx.roughness,3)} mm`]);
  rows.push(['焊道內凸',`${fmt(ctx.bead,2)} mm${ctx.codeBead?'（ASME B31.3 公制欄上限）':''} · ${ctx.finish==='ground'?'計算時視為內面平順':'原焊'}`]);
  return table(['項目','值'],rows);
}
function compareTable(base,plan,ctx,names){
  const cols=[base,plan].filter(Boolean),head=['',...(base?[names[0]]:[]),names[1]];
  const rows=[['焊口',...cols.map(f=>`${f.welds} 道`)],['彎頭／總轉角',...cols.map(f=>`${f.bendCount} 個 · ${fmt(f.totalTurn,1)}°`)],['直管總長',...cols.map(f=>`${fmt(f.straight,2)} m`)]];
  if(ctx.liquid){
    const s=Math.max(...cols.map(f=>abs(f.dp.total))),p=v=>pressureText(v,s);
    rows.push(['壓損：直管',...cols.map(f=>p(f.dp.pipe))],['壓損：彎頭',...cols.map(f=>p(f.dp.bends))],['壓損：焊口（保守上限）',...cols.map(f=>p(f.dp.welds))],['壓損合計',...cols.map(f=>p(f.dp.total))],['換算直管長',...cols.map(f=>`${fmt(f.equivalentLength,1)} m`)]);
  }else rows.push(['最小彎曲半徑',...cols.map(f=>f.minRadiusRatio?`${fmt(f.minRadiusRatio,2)} × 內徑`:'—')],['粒子會撞上的焊道',...cols.map(f=>`${f.exposedWelds} 道`)]);
  return table(head,rows);
}
function elementTable(flow,ctx,name){
  const exposed=ctx.exposedBead>0,s=ctx.liquid?flow.dp.total:0,rows=flow.bends.map(b=>[`${name} ${b.id} 彎頭`,`${fmt(b.angle,2)}° · R/D ${fmt(b.radiusRatio,2)}`,ctx.liquid?`K ${fmt(b.K,3)} · ${pressureText(b.K*ctx.q,s)}`:'外背受撞擊、粒子沿壁滑動']);
  rows.push([`${name} 焊口 ×${flow.welds}`,beadWords(ctx),ctx.liquid?`每道 K ${fmt(ctx.weldK,4)} · 合計 ${pressureText(flow.dp.welds,s)}`:exposed?'粒子會撞上焊道':'粒子碰不到焊道'],[`${name} 直管`,`${fmt(flow.straight,3)} m`,ctx.liquid?`K ${fmt(flow.K.pipe,3)} · ${pressureText(flow.dp.pipe,s)}`:'沿壁滑行']);
  return rows;
}

/** Owner comparison sheet (A4). base may be null when the original two-elbow route is not available. */
export function buildOwnerSheet({base=null,plan,ctx,id='OFF-001',paper='A4',date=new Date()}){
  if(!plan?.valid)throw new Error('先選一個接法，再產生業主比較單。');
  if(!ctx?.valid)throw new Error(ctx?.errors?.[0]?.message??'先在「介質與流體影響」選介質並填好資料。');
  const baseFlow=base?.valid?routeFlow(base,ctx):null,planFlow=routeFlow(plan,ctx),c=ownerConclusion(baseFlow,planFlow,ctx);
  const names=[base?.valid?'原接法':'',plan.original?'原接法':`建議方案 ${plan.id}`],day=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const routes=[baseFlow?[base,baseFlow,names[0]]:null,[plan,planFlow,names[1]]].filter(Boolean);
  const routeCells=routes.map(([p,f,name])=>`<figure>${flowRouteSVG(p,f,ctx,{title:name})}<figcaption>${esc(p.original?'原兩彎頭接法':routePlanTitle(p))} · ${f.welds} 道焊口 · ${f.bendCount} 個彎頭 · 總轉角 ${fmt(f.totalTurn,1)}°${ctx.liquid?` · 壓損 ${pressureText(f.dp.total)}`:''}</figcaption></figure>`).join('');
  const quality=[`可及的焊口內面磨平；磨不到的焊口（封閉焊口、接既有管）以氬焊（GTAW）打底控制內凸${ctx.codeBead?'':`在 ${fmt(ctx.bead,1)} mm 以內`}`,`內凸任何情況不超過 ${fmt(ctx.beadLimit,1)} mm（ASME B31.3 表 341.3.2）`,'對口錯邊依焊接程序書（WPS）控制','每道焊口內面以內視鏡拍照留存','射線或超音波檢查（依合約比例）'];
  const head=`<h1>配管方案比較：焊口與流體影響</h1><p class="meta">${esc(id)} · ${esc(MEDIUM_KINDS[ctx.kind].label)} · ${day}</p>`;
  const page1=head+`<div class="verdict"><strong>${esc(c.headline)}</strong><p>${esc(c.detail)}</p>${(t=>t?`<p class="sense">${esc(t)}</p>`:'')(beadSensitivity(ctx))}</div><div class="routes routes-${routes.length}">${routeCells}</div><h2>焊口剖面（按真實比例）</h2><div class="section">${weldSectionSVG(ctx)}</div><div class="cols"><div><h2>方案數字</h2>${compareTable(baseFlow,planFlow,ctx,names)}</div><div><h2>品質控制（依合約勾選）</h2><ul class="checks">${quality.map(q=>`<li>☐ ${esc(q)}</li>`).join('')}</ul>${ctx.warnings.filter(w=>w.level==='warn').map(w=>`<p class="warn">${esc(w.message)}</p>`).join('')}</div></div>`;
  const method=ctx.liquid?`<p>假設牛頓流體、等溫、單相、滿管流動。壓損 ΔP＝K·ρV²/2。直管 K＝f·L/D，摩擦係數 f 依 Churchill（1977）式，涵蓋層流、過渡流與紊流。彎頭依 Rennels &amp; Hudson（2012）平滑彎管式，適用任意角度與彎曲半徑，已含彎管段本身的摩擦；層流時以同式代入層流 f，屬近似。焊道以銳緣薄孔板計算（Idelchik 圖 4-14）；實際焊道是圓滑凸起，阻力更小，因此焊口數字是保守上限。層流時另加焊道窄段的泊肅葉摩擦。${ctx.finish==='ground'?'本單假設每道焊口內面都已磨平或控制平順。':''}指定零件以直管計，未含閥件本身阻力、管口進出與高程差。結果用於比較方案，不是整條管線的水力計算。</p>`
    :`<p>氣送粒子的壓損取決於固氣比、風速與粒子性質，本單不計算。比較的是粒子會碰到的地方：彎頭外背（撞擊、磨耗與拉絲最集中，總轉角越小越好），以及焊道內凸（粒徑的 ${fmt(ctx.pelletRatio*100,0)}%）。焊口內面平順並控制錯邊後，焊口數不再影響粒子。</p>`;
  const elementRows=routes.flatMap(([,f,name])=>elementTable(f,ctx,name));
  const page2=head+`<div class="basis"><h2>計算依據</h2>${method}<h2>輸入</h2>${inputsTable(ctx)}<h2>各部位</h2>${table(['部位','幾何',ctx.liquid?'阻力':'粒子影響'],elementRows)}<h2>參考資料</h2><ol class="refs">${FLOW_REFERENCES.filter(r=>ctx.liquid||r.use!=='liquid').map(r=>`<li>${esc(r.title)} <span>${esc(r.url)}</span></li>`).join('')}</ol></div>`;
  const css='.meta{color:#555;margin-top:-1mm}.verdict{border:.4mm solid #d0812f;background:#fdf3e8;padding:3mm 4mm;margin:3mm 0}.verdict strong{font-size:4.3mm;line-height:1.45}.verdict p{margin:1.5mm 0 0}.verdict .sense{color:#5a4632;font-size:3mm}.routes{display:grid;gap:4mm;margin:3mm 0}.routes-2{grid-template-columns:1fr 1fr}.routes figure{margin:0;border:.2mm solid #ccd5dc;padding:1mm}.routes svg{width:100%;height:auto}.routes figcaption{font-size:2.8mm;padding:0 1mm 1mm;color:#333}.section svg{width:190mm;height:auto}.cols{display:grid;grid-template-columns:1.1fr 1fr;gap:5mm}.checks{list-style:none;padding:0;margin:0;font-size:3mm}.checks li{margin:1.3mm 0}.warn{border-left:.8mm solid #d0812f;padding-left:2mm;font-size:3mm}.basis p{font-size:3mm;line-height:1.5}.basis table{font-size:2.8mm}.basis th,.basis td{padding:.9mm 1.2mm}.basis h2{margin:3mm 0 1.5mm}.refs{font-size:2.5mm;line-height:1.4;padding-left:5mm;margin:0}.refs li{margin-bottom:.8mm}.refs span{color:#555;word-break:break-all}';
  return documentHTML('業主比較單 '+id,[page1,page2],paper).replace('.summary{',css+'.summary{');
}
