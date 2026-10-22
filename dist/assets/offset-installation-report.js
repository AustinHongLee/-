import {analyzeInstallation,absoluteObstacles,ENTRY_LABELS,installationMotion,installationJointMotion} from './offset-installation.js';
import {routeElbowFrame} from './offset-planner.js';
import {add,mul} from './clearance-geometry.js';
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const fmt=v=>Number.isFinite(v)?Number(v.toFixed(2)).toString():'未量';
export const CHECK_LABELS={clear:'已核對',review:'需調整／精查',unverified:'待核對',unmeasured:'未完成量測',tight:'淨空不足','model-review':'包絡需精查','bench-confirmed':'預組空間已確認','bench-pending':'預組空間待確認'};
const vector=v=>v.map(fmt).join('／');
export function jointClockSVG(joint,{interactive=false,required=null,compact=false}={}){
  if(!joint)return '';
  const arcs=Array.from({length:4},(_,i)=>{const a=(i*90-45)*Math.PI/180,b=(i*90+45)*Math.PI/180,r=65,point=t=>[105+r*Math.sin(t),106-r*Math.cos(t)],u=point(a),v=point(b),state=joint.role==='bench'?'unmeasured':joint.checks[i].status;
    return `<path d="M${u.join(' ')} A${r} ${r} 0 0 1 ${v.join(' ')}" fill="none" stroke="${{clear:'#45876c',tight:'#b75339','model-review':'#bd9350',unmeasured:'#c6d2c3'}[state]}" stroke-width="12" stroke-linecap="round"/>`;}).join('');
  const buttons=['0° 上側','90° 右側','180° 下側','270° 左側'].map((label,i)=>{const a=i*Math.PI/2,x=105+98*Math.sin(a),y=106-91*Math.cos(a);return `<g${interactive?` role="button" tabindex="0" data-space-sector="${i}" aria-label="修改 ${esc(label)}整個象限最小淨空"`:''}><rect x="${x-38}" y="${y-20}" width="76" height="44" rx="9" fill="white" stroke="#d2dfe6"/><text x="${x}" y="${y-2}" text-anchor="middle" font-size="10">${label}</text><text x="${x}" y="${y+13}" text-anchor="middle" font-size="12">${fmt(joint.measurement.radial[i])}${joint.measurement.radial[i]!==null?' mm':''}</text></g>`;}).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${compact?'-35 -5 280 230':'-35 -5 455 230'}" role="${interactive?'group':'img'}" aria-label="${joint.id} 從 A 側朝 B 側看，四象限整段最小淨空"><g font-family="Arial,Microsoft JhengHei" fill="#315468">${arcs}<path d="M105 39v134M38 106h134" stroke="#bfcfbb" stroke-width="1" stroke-dasharray="2 5"/><circle cx="105" cy="106" r="43" fill="#fcfdf9" stroke="#a9bfa9" stroke-width="1.5"/><text x="105" y="102" text-anchor="middle" font-weight="bold">${joint.id}</text><text x="105" y="120" text-anchor="middle" font-size="11">往 B 看</text>${buttons}${compact?'':`<text x="226" y="55" font-size="13">四象限各量整段最窄處</text><text x="226" y="80" font-size="12">徑向需要：${fmt(required)} mm</text><text x="226" y="110" font-size="12">A 側軸向：${fmt(joint.measurement.axialA)} mm</text><text x="226" y="135" font-size="12">B 側軸向：${fmt(joint.measurement.axialB)} mm</text><text x="226" y="169" font-size="11">0° 基準為 ${esc(joint.frame.reference)}</text><text x="226" y="190" font-size="11">留白＝未量；0＝貼住障礙物</text>`}</g></svg>`;
}
export function installationSceneSVG(plan,inspection,{phaseIndex=0,progress=1,view='iso',selectedJoint=null,interactive=false}={}){
  if(!inspection?.valid)return '';
  const phase=inspection.phases[phaseIndex]??inspection.phases[0],offset=installationMotion(phase,progress).offset,moving=new Set(phase.movingIds),fixed=new Set(phase.fixedIds),origin=plan.context.ports.a;
  const curves=plan.elements.map(e=>({e,points:e.type==='elbow'?[e.start,...Array.from({length:25},(_,i)=>routeElbowFrame(e,i/24).center),e.finish]:[e.start,e.finish]}));
  const project=q=>{q=q.map((v,i)=>v-origin[i]);return view==='front'?[q[0],-q[2]]:view==='top'?[q[0],-q[1]]:view==='side'?[q[1],-q[2]]:[(q[0]+q[1])*.866,q[0]*.5-q[1]*.5-q[2]];};
  const ports=['a','b'].map(end=>({end,face:plan.context.ports[end],stub:add(plan.context.ports[end],mul(plan.context.axes[end],(end==='a'?-1:1)*(inspection.spec.portLengths[end]??plan.params.od*2)))}));
  const points=curves.flatMap(({points})=>points.concat(points.map(q=>add(q,phase.offset)))).concat(ports.flatMap(p=>[p.face,p.stub])).map(project),low=[0,1].map(k=>Math.min(...points.map(q=>q[k]))),high=[0,1].map(k=>Math.max(...points.map(q=>q[k]))),scale=Math.min(610/Math.max(100,high[0]-low[0]),270/Math.max(100,high[1]-low[1]));
  const at=q=>{const p=project(q);return [45+(610-(high[0]-low[0])*scale)/2+(p[0]-low[0])*scale,40+(270-(high[1]-low[1])*scale)/2+(p[1]-low[1])*scale];},path=ps=>ps.map((p,i)=>(i?'L':'M')+at(p).map(fmt).join(' ')).join(' '),hits=new Set([...phase.hits.map(h=>h.fixed),...(inspection.joints.find(j=>j.id===selectedJoint)?.modelHits??[]).map(h=>h.id)]);
  const obstacleSvg=absoluteObstacles(plan,inspection.spec).map(o=>{
    const color=hits.has(o.id)?'#b75339':'#8b9eaa';
    if(o.type==='box'&&[...o.min,...o.max].every(v=>v!==null)){
      const corners=Array.from({length:8},(_,i)=>at([i&1?o.max[0]:o.min[0],i&2?o.max[1]:o.min[1],i&4?o.max[2]:o.min[2]])),edges=[];for(let i=0;i<8;i++)for(const bit of [1,2,4])if(!(i&bit))edges.push(`M${corners[i].join(' ')}L${corners[i|bit].join(' ')}`);
      return `<path d="${edges.join(' ')}" fill="none" stroke="${color}" stroke-width="2"/><text x="${fmt(corners[0][0])}" y="${fmt(corners[0][1]-8)}" fill="${color}" font-size="12">${esc(o.name||o.id)}</text>`;
    }
    if(o.type==='plane'&&o.position!==null){
      const k=o.axis,axes=[0,1,2].filter(i=>i!==k),span=Math.max(...plan.envelope.size,inspection.spec.entries[phase.id].travel??0,200)*.65,center=origin.map((v,i)=>i===k?o.position:v+(plan.context.ports.b[i]-v)/2),q=[-1,1].map(sign=>{const p=[...center];p[axes[0]]+=sign*span;return p;});
      return `<path d="${path(q)}" stroke="${color}" stroke-width="5" stroke-dasharray="5 3"/><text x="${fmt(at(center)[0])}" y="${fmt(at(center)[1]-8)}" fill="${color}" font-size="11">${esc(o.name||o.id)} · ${'XYZ'[k]} ${o.side==='max'?'≥':'≤'} ${fmt(o.position-origin[k])}</text>`;
    }return '';
  }).join('');
  const routeSvg=curves.map(({e,points})=>{
    const active=moving.has(e.id),visible=active||fixed.has(e.id),color=active?'#237fa2':'#607e90',shifted=active?points.map(q=>add(q,offset)):points,mid=at(shifted[Math.floor(shifted.length/2)]);
    return `<path d="${path(points)}" fill="none" stroke="#cad6df" stroke-width="7" stroke-dasharray="4 4"/>${visible?`<path d="${path(shifted)}" fill="none" stroke="${color}" stroke-width="11" stroke-linecap="round"/><text x="${fmt(mid[0]+8)}" y="${fmt(mid[1]-12)}" font-size="13" fill="${color}">${e.id}</text>`:''}`;
  }).join('');
  const joints=inspection.joints.map(j=>{const motion=installationJointMotion(plan,phase,j.index);if(motion.type==='future')return '';const q=at(motion.type==='fixed'?motion.position:add(motion.position,offset)),target=motion.type==='closing'?at(motion.target):null,color=j.id===selectedJoint?'#d3983d':['tight','model-review'].includes(j.status)?'#b75339':j.status==='clear'||j.status==='bench-confirmed'?'#2e7d59':'#7c929f';return `<g${interactive?` role="button" tabindex="0" data-install-joint="${j.id}" aria-label="查看 ${j.id} ${j.left} 接 ${j.right} 空間"`:''}>${target?`<circle cx="${fmt(target[0])}" cy="${fmt(target[1])}" r="9" fill="none" stroke="#bb9862" stroke-dasharray="3 3"/>`:''}<circle cx="${fmt(q[0])}" cy="${fmt(q[1])}" r="${interactive?14:8}" fill="white" stroke="${color}" stroke-width="2"/><text x="${fmt(q[0]+13)}" y="${fmt(q[1]+18)}" fill="${color}" font-size="12">${j.id}</text></g>`;}).join('');
  const portSvg=ports.map(p=>{const q=at(p.face);return `<path d="${path([p.stub,p.face])}" fill="none" stroke="#83989f" stroke-width="11"/><circle cx="${fmt(q[0])}" cy="${fmt(q[1])}" r="5" fill="white" stroke="#617b85"/><text x="${fmt(q[0]-18)}" y="${fmt(q[1]-19)}" font-size="12" fill="#526e79">既有 ${p.end.toUpperCase()} 口</text>`;}).join('');
  const first=curves.find(c=>moving.has(c.e.id)).points[0],a=at(add(first,phase.offset)),b=at(first);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 370" role="${interactive?'group':'img'}" aria-label="${esc(phase.title)}搬入與接合空間示意"><defs><marker id="install-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="none" stroke="#c28b37"/></marker></defs><g font-family="Arial,Microsoft JhengHei">${obstacleSvg}${routeSvg}${portSvg}<path d="M${a.join(' ')}L${b.join(' ')}" stroke="#c28b37" stroke-width="2" stroke-dasharray="4 3" marker-end="url(#install-arrow)"/>${joints}<text x="20" y="345" fill="#456477" font-size="12">${esc(phase.title)} · ${esc(ENTRY_LABELS[phase.entry.from])} · 行程 ${fmt(phase.entry.travel)} mm</text><text x="20" y="365" fill="#71889b" font-size="11">藍：本步搬入　灰：已固定　虛線：目標位置；示意不按比例，障礙物以同一 XYZ 輸入</text></g></svg>`;
}
const table=(head,rows)=>`<table><thead><tr>${head.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
export function installationWorkPages(plan,spec){
  const r=analyzeInstallation(plan,spec),head=title=>`<h1>組立與接合空間 · ${title}</h1>`;
  if(!r.valid)return [head('待核對')+`<div class="summary">${esc(r.message)}</div><p>本單的幾何下料尺寸不代表已確認可搬入或可施焊。</p>`];
  spec=r.spec;
  const pages=[head(CHECK_LABELS[r.status])+`<div class="summary"><strong style="font-size:5mm">${esc(r.headline)}</strong><p>${spec.mode==='whole'?'先預組整段，再搬入':'兩側預組件先固定，最後放入 '+esc(spec.lastPart)}；現場接合 ${r.fieldCount} 處，預組接合 ${r.benchCount} 處。</p></div>`+table(['步驟','搬入零件','狀態'],r.phases.map((p,i)=>[i+1+'. '+p.title,p.movingIds.join('、'),CHECK_LABELS[p.status]]))+`<h2>工具所需操作包絡（使用者填寫，不是標準允收值）</h2>`+table(['工法','徑向 mm','A 側軸向 mm','B 側軸向 mm'],[[{mixed:'手工焊／氬焊',smaw:'手工電焊',gtaw:'氬焊'}[spec.tool.process],fmt(spec.tool.radial),fmt(spec.tool.axialA),fmt(spec.tool.axialB)],...(plan.joints.some(j=>j.kind==='bolt')?[['螺栓接合',fmt(spec.tool.boltRadial),fmt(spec.tool.boltAxialA),fmt(spec.tool.boltAxialB)]]:[])])+`<p>障礙物座標以修正後 A 端面中心為 0，前＋X、左＋Y、上＋Z。已建模同 OD 既有直管：A ${fmt(spec.portLengths.a)}／B ${fmt(spec.portLengths.b)} mm；端口法蘭、設備及支架須另建模。</p><p>預組空間／翻轉及內部接合：${spec.benchConfirmed?'已由現場確認':'待確認'}。搬入環境及起始位置：${spec.environmentConfirmed?'已由現場確認':'待確認'}。</p><p>${esc(r.scope)} 彎頭中心線弦差包絡餘量最多 ${fmt(r.modelPadding)} mm，端部膠囊亦屬保守包絡。</p><p>核對人：____________　日期：____________　圖面／WPS 參照：____________</p>`];
  const chunks=(rows,size,make)=>{for(let start=0;start<rows.length;start+=size)pages.push(make(rows.slice(start,start+size),start));};
  for(const [i,p] of r.phases.entries()){
    pages.push(head(`${i+1}. ${p.title}`)+`<div style="width:100%;height:85mm">${installationSceneSVG(plan,r,{phaseIndex:i}).replace('viewBox="0 0 700 370"','width="175mm" height="85mm" viewBox="0 0 700 370"')}</div>`+table(['項目','核對內容'],[['本步固定',p.fixedIds.join('、')||'既有 A／B 管'],['起始位置',ENTRY_LABELS[p.entry.from]+'；目標位置加 XYZ '+vector(p.offset)+' mm'],['搬入行程',fmt(p.entry.travel)+' mm；脫離自身目標包絡需 '+fmt(p.minimumTravel)+' mm'],['狀態',CHECK_LABELS[p.status]+(p.shortTravel?'；目前行程不足以代表完整搬入':'')],['包絡重疊',p.hits.length?p.hits.length+' 組（明細見後續頁）':'已填條件內未發現']])+`<h2>現場操作順序</h2><ol><li>先在工作台預組本步零件，確認內部接合及可翻轉空間；支撐與吊具另核對。</li><li>保持姿態，沿指定直線搬入。遇包絡重疊先調整方向／順序或實物精查，不能用吊鍊強拉補償。</li><li>先核對所有對口的 XYZ、朝向、四象限根隙及錯邊，再定位點焊。</li><li>本步對外接合 ${p.jointIndices.map(k=>plan.joints[k].id).join('、')} 核對操作空間；依正式工法完成焊接／鎖固後，再裝下一步。</li></ol>`);
    chunks(p.hits,10,(rows,start)=>head(`${i+1}. 搬入包絡重疊${start?'（續）':''}`)+table(['搬入零件','固定物／障礙物'],rows.map(h=>[h.moving,h.fixed+' · '+h.name]))+`<p>已檢查整段直線行程；包絡重疊需先調整或實物精查。</p>`);
  }
  chunks(r.joints,5,(rows,start)=>head('逐口空間量測'+(start?'（續）':''))+`<p>從 A 側朝 B 側看，0° 為 +Z 投影（管軸接近垂直時改 +Y）。各徑向值代表整個 90° 象限及所需軸向範圍的最小淨空；軸向值涵蓋整圈所需徑向範圍。焊接從管外表面、螺栓從所填最大外包外緣量。相鄰彎頭及零件細部由實測核對。</p>`+table(['接合／當步','上／右／下／左徑向 mm','A／B 軸向 mm','核對結果'],rows.map(j=>[`${j.id} ${j.left} ↔ ${j.right} · ${j.role==='bench'?'工作台預組':j.phaseTitle} · ${j.kind==='bolt'?'螺栓':'焊接'}`,j.role==='bench'?'工作台另核對':j.measurement.radial.map(fmt).join('／'),j.role==='bench'?'—':fmt(j.measurement.axialA)+'／'+fmt(j.measurement.axialB),CHECK_LABELS[j.status]+(j.modelHits.length?'；操作包絡明細見後頁':'')+(j.kind==='bolt'&&!j.measurement.boltFit&&j.role==='field'?'；螺栓置入及孔位待核對':'')]))+`<p>未量與 0 分開列示。工具需求、實測或整個操作包絡確認缺漏時，不判為足夠。現場口按當步已裝上的零件核對；工作台口由現場確認翻轉及接近空間。</p><p>${esc(r.scope)}</p>`);
  const accessHits=r.joints.flatMap(j=>[...new Set(j.modelHits.map(h=>h.id))].map(id=>{const hits=j.modelHits.filter(h=>h.id===id);return [j.id+' · '+j.phaseTitle,[...new Set(hits.map(h=>h.sector*90+'°'))].join('／'),id+' · '+hits[0].name];}));
  chunks(accessHits,10,(rows,start)=>head('操作包絡需精查'+(start?'（續）':''))+table(['接合／當步','受影響象限','固定物／障礙物'],rows)+`<p>四象限工具包絡採連續角度的保守凸包；模型重疊不可被手填足夠的淨空覆蓋。核對實物及輸入資料，調整後重算。</p>`);
  chunks(r.environmentPending,10,(rows,start)=>head('尚待補資料'+(start?'（續）':''))+`<ul>${rows.map(t=>`<li>${esc(t)}</li>`).join('')}</ul><p>資料未補齊前，本單不能證明可搬入或可完成接合。</p>`);
  chunks(spec.obstacles,8,(rows,start)=>head('障礙物紀錄'+(start?'（續）':''))+`<p>相對 A 端面中心，前＋X、左＋Y、上＋Z；平面為整個半空間，局部梁、架及設備應用箱體包絡。</p>`+table(['障礙物','包絡 mm'],rows.map(o=>[o.id+' '+o.name,o.type==='plane'?`禁入 ${'XYZ'[o.axis]} ${o.side==='max'?'≥':'≤'} ${fmt(o.position)}`:'最小角點 '+vector(o.min)+'；最大角點 '+vector(o.max)])));
  if(plan.components?.length)pages.push(head('指定零件外包')+table(['零件','最大外包直徑 mm'],plan.components.map(c=>[c.id+' '+(c.name||''),fmt(spec.componentOD[c.id])]))+`<p>最大外包含法蘭、手輪及突出物；以同軸圓柱保守涵蓋整組實測長度。未量時不能判為可搬入。</p>`);
  chunks(r.selfClashes,12,(rows,start)=>head('零件包絡需精查'+(start?'（續）':''))+table(['零件','可能重疊'],rows)+`<p>這是保守外包檢查，先核對實物／外形與路徑。未處理前，不能將幾何閉合視為可施工。</p>`);
  return pages;
}
export function installationCSVRows(plan,spec){
  const r=analyzeInstallation(plan,spec);if(!r.valid)return [[],['組立與接合空間','待核對',r.message]];
  spec=r.spec;
  const rows=[[],['組立與接合空間',CHECK_LABELS[r.status],r.headline],['最後放入方式',spec.mode,spec.lastPart],['工具工法',spec.tool.process],['焊接所需 徑向／A側／B側 mm',spec.tool.radial??'未量',spec.tool.axialA??'未量',spec.tool.axialB??'未量'],['環境完整性已由現場確認',spec.environmentConfirmed?'是':'否'],['預組空間已由現場確認',spec.benchConfirmed?'是':'否']];
  rows.push(['螺栓所需 徑向／A側／B側 mm',spec.tool.boltRadial??'未量',spec.tool.boltAxialA??'未量',spec.tool.boltAxialB??'未量'],['既有管檢查長 A／B mm',spec.portLengths.a??'未量',spec.portLengths.b??'未量']);
  for(const c of plan.components??[])rows.push(['零件最大外包直徑 mm',c.id,spec.componentOD[c.id]??'未量']);
  for(const p of r.phases){rows.push(['搬入步驟',p.title,p.movingIds.join('/'),ENTRY_LABELS[p.entry.from],p.entry.travel??'未量',p.minimumTravel,CHECK_LABELS[p.status]]);for(const hit of p.hits)rows.push(['包絡重疊',p.id,hit.moving,hit.name]);}
  rows.push(['接合','預組／現場','上 mm','右 mm','下 mm','左 mm','A側軸向 mm','B側軸向 mm','整象限最小值已確認','螺栓置入與孔位已確認','結果']);
  for(const j of r.joints)rows.push([j.id,j.role,...j.measurement.radial.map(v=>v??'未量'),j.measurement.axialA??'未量',j.measurement.axialB??'未量',j.measurement.confirmed?'是':'否',j.measurement.boltFit?'是':'否',CHECK_LABELS[j.status]]);
  for(const j of r.joints)rows.push(['接合位置與當步',j.id,j.phaseTitle??'工作台預組',...j.position,...j.axis]);
  for(const j of r.joints)for(const h of j.modelHits)rows.push(['接合操作包絡重疊',j.id,h.sector,h.name]);
  for(const o of spec.obstacles)rows.push(['障礙物',o.id,o.name,o.type,o.type==='plane'?`${'XYZ'[o.axis]} ${o.side==='max'?'>=':'<='} ${fmt(o.position)}`:vector(o.min)+' → '+vector(o.max)]);
  for(const s of r.environmentPending)rows.push(['待核對',s]);rows.push(['檢查範圍',r.scope]);return rows;
}
