/** Steel support records use material-face distance and a common free end.
 * 1:1 face templates are emitted by the steel geometry kernel and printed by
 * the shared SVG/DXF/paper-tile renderer. This module never alters cut lines.
 */
import {computeSteelFaceStations} from './steel-geometry.js';
import {validateFabricationPlan,reconcileFitRecords} from './fabrication-plan.js';
import {mainAxisSurfaceDatum} from './field-datums.js';
import {elbowAlignmentLabel} from './elbow-axis.js';

const LABELS=Object.freeze({chs:'圓形鋼管',shs:'方形鋼管',rhs:'矩形鋼管',h:'H 型鋼',i:'I 型鋼',l:'角鐵',c:'槽鋼'});
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');
const fmt=(x,d=3)=>typeof x==='number'&&Number.isFinite(x)?Number(x.toFixed(d)).toString():'未設定';
const finite=(x,label)=>{if(typeof x!=='number'||!Number.isFinite(x))throw new Error(`${label} 缺少有限數值。`);return x;};
const compact=(x,n)=>Array.from(String(x??'')).slice(0,n).join('');
const chunks=(a,n)=>Array.from({length:Math.ceil(a.length/n)},(_,i)=>a.slice(i*n,(i+1)*n));

export function isSteelJoint(value){
  const p=value?.params??value;
  return !!p&&Object.hasOwn(LABELS,p.branchSection);
}
function requireSteel(result){
  if(!isSteelJoint(result)||result.valid!==true||result.errors?.length)
    throw new Error('請先完成有效的鋼構貼合計算。');
  if(result.params.motherOpening!==false||result.params.jointType!=='on')
    throw new Error('鋼構支材須外焊貼合，母管保持封閉。');
  if(result.manufacturingReady===false||result.precision?.metTolerance===false||result.verification?.some(v=>['fail','error','failed'].includes(v.status)))
    throw new Error('鋼構裁切輪廓尚未通過幾何與精度驗證。');
  if(Number.isFinite(result.params.tolerance)&&result.params.tolerance<1e-5)
    throw new Error('製作匯出的數值解析度下限為 0.00001 mm；請調整數值精度後再匯出。');
  if(!result.geometry?.steel?.faces?.length||!result.templates?.length)
    throw new Error('模型缺少鋼構材料面與紙樣。');
  if(result.geometry?.main?.outerHole3D?.length||result.geometry?.main?.innerHole3D?.length||result.templates.some(t=>t.holes?.length))
    throw new Error('封閉母管定位圖不可包含裁孔輪廓。');
  return result.geometry.steel.faces;
}
function stationCount(options={}){
  const n=options.faceSegments??12;
  if(!Number.isInteger(n)||n<2||n>72)throw new Error('材料面分段數須為 2 至 72 的整數。');
  return n;
}
function faceRows(result,face,count){
  const rows=computeSteelFaceStations(result,face.id,count);
  if(!Array.isArray(rows)||rows.length!==count+1)throw new Error(`材料面 ${face.id} 缺少完整分點。`);
  return rows.map((s,index)=>{
    const faceDistance=finite(s.faceDistance,`${face.id} 沿面距離`),depth=finite(s.depth,`${face.id} 自由直端深度`);
    if(!Array.isArray(s.point)||s.point.length!==3)throw new Error(`材料面 ${face.id} 缺少 3D 對應座標。`);
    s.point.forEach(x=>finite(x,`${face.id} 3D 座標`));
    if(faceDistance<0||depth<0)throw new Error('鋼構分點距離與深度不得為負。');
    return {...s,faceId:face.id,index,faceDistance,depth};
  });
}
function dimensions(p,section){
  const d=section?.dimensions??{};
  const datum=p.hostType==='straight'?mainAxisSurfaceDatum(p):null,
    location=p.hostType==='elbow'?`${elbowAlignmentLabel(p)}；位置 β ${fmt(p.bendPosition)}°／φ ${fmt(p.surfaceClock)}°；與當地切線夾角 ${fmt(p.angle)}°／側轉 ${fmt(p.branchSwivel)}°`:
      p.hostType==='cone'?`母材 A 端軸距 X ${fmt(p.jointPosition)} mm／方位 φ ${fmt(p.surfaceClock)}°；與當地母線夾角 ${fmt(p.angle)}°／側轉 ${fmt(p.branchSwivel)}°`:
      `${datum?`軸線外壁定位：距主管基準端 X ${fmt(datum.axialPosition)} mm／方位 ${fmt(datum.clockAngle)}°`:`虛擬中心面 J ${fmt(p.jointPosition)} mm；軸線未穿主管外壁` }；軸線夾角 ${fmt(p.angle)}°；偏心 ${fmt(p.offset)} mm`;
  const rows=[['母材',p.hostType==='elbow'?`彎頭 Ø${fmt(p.mainOD)} × 壁 ${fmt(p.mainWall)} mm；R ${fmt(p.bendRadius)} mm；${fmt(p.bendAngle)}°`:p.hostType==='cone'?`大小頭 Ø${fmt(p.mainOD)} → Ø${fmt(p.mainEndOD)} mm；長 ${fmt(p.mainLength)} mm`:`直管 Ø${fmt(p.mainOD)} × 壁 ${fmt(p.mainWall)} mm；長 ${fmt(p.mainLength)} mm`],
    ['鋼構支材',`${LABELS[p.branchSection]}；最短軸向成品長 ${fmt(p.branchLength)} mm`],
    ['截面尺寸',p.branchSection==='chs'?`外徑 Ø${fmt(p.branchOD)} × 壁 ${fmt(p.branchWall)} mm`:`寬 ${fmt(d.width??p.sectionWidth)} × 高 ${fmt(d.height??p.sectionHeight)} mm`],
    ['定位與方向',location],
    ['截面旋轉',`${fmt(p.sectionRotation)}°`],['成品貼合間隙',`母材外表面法向 ${fmt(p.rootGap)} mm`],['接法','支材端部裁切貼合；母管保持封閉，母管不開孔']];
  const thickness=[...(['shs','rhs','l'].includes(p.branchSection)?[['sectionWall','管壁／腿厚']]:[]),...(['h','i','c'].includes(p.branchSection)?[['sectionWeb','腹板厚'],['sectionFlange','翼緣厚']]:[]),...(p.branchSection!=='chs'?[['sectionRadius','截面圓角']]:[])].filter(([key])=>Number.isFinite(p[key]));
  if(thickness.length)rows.splice(3,0,['截面實測',thickness.map(([key,label])=>`${label} ${fmt(p[key])} mm`).join('；')]);
  return rows;
}

export function steelStationCSV(result,options={}){
  const faces=requireSteel(result),count=stationCount(options),rows=[['面號','材料面','分點','沿面距離 u (mm)','自由直端起算深度 (mm)','X (mm)','Y (mm)','Z (mm)']];
  for(const face of faces)for(const s of faceRows(result,face,count))rows.push([face.id,face.label??face.id,`${face.id}-${String(s.index+1).padStart(2,'0')}`,fmt(s.faceDistance,6),fmt(s.depth,6),...s.point.map(x=>fmt(x,6))]);
  const cell=value=>`"${String(value).replaceAll('"','""')}"`;
  return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}

export function steelTemplateLegend(template){
  if(template.id==='steel-mother-datum')return '母管保持封閉；貼合虛線及十字只定位；細點外框只裁紙；禁止依足跡開孔';
  if(template.mapping?.branchKind!=='steel'||!template.mapping?.faceId)return null;
  return '粗實線＝此材料面的成品裁線；細點外框只裁紙；點劃線＝共同長度基準；同號邊對齊；母管不開孔';
}
export function steelPaperPositionRecipe(template){
  const m=template.mapping??{};
  if(template.id==='steel-mother-datum'){
    const points=m.positioning;
    if(!points?.A||!points?.B)throw new Error('母面紙樣缺少 A／B 實際定位十字。');
    if(m.hostType==='cone')return `找母材 A 端與管頂 0° 母線。定位 A：軸向 X ${fmt(points.A.x)}／母線 S ${fmt(points.A.slantDistance)} mm／方位 ${fmt(points.A.phiDegrees)}°；B：X ${fmt(points.B.x)}／S ${fmt(points.B.slantDistance)} mm／方位 ${fmt(points.B.phiDegrees)}°。文字面朝外；兩十字對準實測位置。貼合虛線只描位置，母管保持封閉；十字不是鑽孔。`;
    return `找主管基準端與管頂 0° 母線。定位 A：距基準端 X ${fmt(points.A.x)} mm／由管頂周向 U ${fmt(points.A.circumferentialDistance)} mm／方位 ${fmt(points.A.phiDegrees)}°；B：X ${fmt(points.B.x)}／U ${fmt(points.B.circumferentialDistance)} mm／方位 ${fmt(points.B.phiDegrees)}°。由基準端向另一端看，沿逆時針量 U；文字面朝外，對準實物與紙樣兩十字。貼合虛線只描位置，母管保持封閉；十字不是鑽孔。`;
  }
  if(m.branchKind!=='steel'||!m.faceId)return null;
  const D=finite(m.datumDepth,'材料面共同基準'),origin=finite(m.depthOrigin,'紙樣上邊位置'),width=finite(m.faceWidth,'材料面寬度');
  const edges=m.paperTransform==='steel-face-mirror-x'?`紙樣右邊對 ${m.edgeStartId}，左邊對 ${m.edgeEndId}；u 在紙上從右往左增加。`:`沿面從 ${m.edgeStartId} 邊到 ${m.edgeEndId} 邊。`;
  const datum=Number.isFinite(m.sectionRotation)?`截面基準：轉角 0° 時 u 軸指向母材 A／基準端（母材切線投影到支材端面）；由自由端朝接頭看順時針轉 ${fmt(m.sectionRotation)}° 即目前截面，${m.edgeStartId} 依此找到。`:'';
  return `${datum}找 ${m.faceId} 面（${m.faceRole==='inner'?'內側':'外側'}${m.faceKind==='arc'?'弧面':'平面'}）。全部材料面從同一自由直端沿支材軸量 ${fmt(D)} mm，畫共同 D 基準線；對準紙樣 D 線。${edges}實長 ${fmt(width)} mm${m.faceKind==='arc'?'，用弧長貼合曲面':''}。紙樣上邊距自由直端 ${fmt(origin)} mm；文字面朝材料面外側。同號邊只作對位，母管保持封閉。`;
}

function sectionIndex(faces,rotation){
  const a=rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  const paths=faces.map(face=>({face,points:(face.stations??[]).map(q=>q.sectionPoint).filter(q=>Array.isArray(q)&&q.length===2&&q.every(Number.isFinite)).map(([x,y])=>[x*c-y*s,x*s+y*c])})).filter(q=>q.points.length>1);
  if(!paths.length)return '';
  const points=paths.flatMap(q=>q.points),xs=points.map(q=>q[0]),ys=points.map(q=>q[1]),
    x0=Math.min(...xs),y0=Math.min(...ys),w=Math.max(...xs)-x0,h=Math.max(...ys)-y0,pad=Math.max(w,h)*.2+5;
  const colours=['#0057b7','#b64200','#4b6b00','#7b267b','#007a73','#9e273b'];
  return `<figure class="steel-section-index"><svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0-pad} ${y0-pad} ${w+2*pad} ${h+2*pad}" role="img" aria-label="鋼構材料面號索引">${paths.map(({face,points},i)=>{const m=points[Math.floor(points.length/2)];return `<path d="${points.map((q,j)=>`${j?'L':'M'}${q[0]},${q[1]}`).join(' ')}" stroke="${colours[i%colours.length]}" stroke-width="${Math.max(w,h)/100}" fill="none"/><text x="${m[0]}" y="${m[1]}" font-size="${Math.max(w,h)/18}" fill="${colours[i%colours.length]}" text-anchor="middle" paint-order="stroke" stroke="#fff" stroke-width="${Math.max(w,h)/60}">${esc(face.id)}</text>`;}).join('')}${(()=>{const y=y0+h+pad*.62,x1=x0+w*.42,x2=x0+w+pad*.72,a=Math.max(w,h)/28,sw=Math.max(w,h)/150;return `<path d="M${x1} ${y}H${x2}" stroke="#55707f" stroke-width="${sw}"/><path d="M${x2} ${y}l${-a} ${-a*.55}v${a*1.1}z" fill="#55707f"/><text x="${x1}" y="${y-a*.5}" font-size="${Math.max(w,h)/20}" fill="#55707f">A／基準端</text>`;})()}</svg><figcaption>從自由端朝接頭看；圖右（→）＝母材 A／基準端方向，截面旋轉 ${fmt(rotation)}°。面號索引為示意比例；各面紙樣另印 1:1。</figcaption></figure>`;
}
function motherPages(result,faces,options){
  const p=result.params,count=options.motherFaceSegments??4;
  if(!Number.isInteger(count)||count<2||count>72)throw new Error('母材定位每面分段數須為 2 至 72 的整數。');
  const source=faces.filter(f=>f.role==='outer').flatMap(face=>chunks(faceRows(result,face,count),13).map((rows,index)=>({face,rows,index}))),
    elbow=p.hostType==='elbow',cone=p.hostType==='cone',headers=elbow?['點','面 u','S背','S腹','母圈 U','φ °']:cone?['點','面 u','X','S母線','母圈 U','φ °']:['點','面 u','X','母圈 U','φ °'],
    R=p.mainOD/2,k=cone?(p.mainEndOD-p.mainOD)/(2*p.mainLength):0,
    explanation=elbow?'從 A 端沿外背量 S背，或沿內腹量 S腹；在同一彎頭截面從外背 0° 依方位 φ 量 U。S背／S腹都是實際弧長。彎頭使用分點定位，不能把環面參數圖當整片 1:1 包覆紙樣。':cone?'母材 A 端為 X＝0；從方位 0° 母線量 S，再在該截面依方位 φ 量 U。U 使用該點當地周長。大小頭母材定位紙樣按錐面真實展開另印。':'先建立主管基準端和管頂 0° 母線；X 從基準端沿主管軸量，U 從管頂沿主管外周量。主管貼合定位紙樣另印並按 A／B 十字對位。',
    rowsHTML=rows=>rows.map(s=>{
      const m=s.motherLocator;if(!m||!Array.isArray(s.contactPoint))throw new Error('鋼構分點缺少實際母材貼合定位。');
      let values;
      if(elbow){const beta=finite(m.betaDegrees,'彎頭位置 β')*Math.PI/180;values=[s.index+1,s.faceDistance,finite(m.backSpineDistance,'外背弧長'),(p.bendRadius-R)*beta,finite(m.circumferentialDistance,'母圈弧長'),finite(m.phiDegrees,'彎頭方位')];}
      else if(cone){const x=finite(m.x,'大小頭軸距'),phi=finite(m.phiDegrees,'大小頭方位');values=[s.index+1,s.faceDistance,x,finite(m.slantDistance,'母線距離'),(R+k*x)*phi*Math.PI/180,phi];}
      else{values=[s.index+1,s.faceDistance,finite(m.x,'主管軸距'),finite(m.circumferentialDistance,'主管周向距離'),finite(m.phiDegrees,'主管方位')];}
      return `<tr data-mother-face-station="${esc(s.faceId)}-${s.index}">${values.map((v,i)=>`<td>${i===0?v:fmt(v)}</td>`).join('')}</tr>`;
    });
  return chunks(source,4).map((sheet,index)=>({role:'mother',title:`母管封閉貼合定位${index?'（續）':''}`,body:`<p class="steel-common-datum">母管不開孔；依面號與沿面距離找到相同支材點，只描貼合位置。${esc(explanation)}</p><div class="steel-face-grid">${sheet.map(({face,rows,index})=>`<article class="steel-face-card"><h2>${esc(face.id)} · ${esc(face.label)}${index?'（續）':''}</h2><p>${esc(face.edgeStartId)} → ${esc(face.edgeEndId)}；每面 ${count} 分段</p><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rowsHTML(rows).join('')}</tbody></table></article>`).join('')}</div><p class="steel-scope">線性尺寸單位 mm。表列實際母材外壁位置，已依成品切線的法向間隙返回母面；分點間連線只作定位，須對照支材成品與 3D 試配核對。${elbow?'φ／U 由 A 朝 B 看逆時針為正；可為負值，表示從外背往相反周向量。':cone?'φ 從母材 A 朝 B 看，0° 位於管頂，逆時針為正；U 和 S 不可互換。':'由基準端向另一端看，管頂為 φ＝0°；φ 與 U 沿逆時針增加，兩者使用同一管頂基準。'}定位十字與貼合足跡不是鑽孔或母管裁線。</p>`}));
}
function longNotePages(label,text){
  const result=[];let part='',lines=0,column=0;
  for(const c of String(text??'')){
    if(part&&(part.length>=900||lines>=31)){result.push(part);part='';lines=0;column=0;}
    part+=c;
    if(c==='\n'){lines++;column=0;}else if(c!=='\r'){column++;if(column>=46){lines++;column=0;}}
  }
  if(part)result.push(part);
  return result.map((body,i)=>({role:'notes',title:`${label}${i?'（續）':''}`,body:`<div class="steel-long-note">${esc(body)}</div>`}));
}
function steelPageBodies(result,meta,options){
  const faces=requireSteel(result),count=stationCount(options),p=result.params,
    records=faces.map(face=>({face,rows:faceRows(result,face,count)})),pages=[],
    datumSet=new Set(result.templates.filter(t=>t.mapping?.branchKind==='steel'&&t.mapping?.faceId).map(t=>t.mapping.datumDepth));
  if(datumSet.size!==1)throw new Error('各材料面紙樣必須使用同一自由直端與 D 基準。');
  const D=finite([...datumSet][0],'材料面共同 D 基準'),table=rows=>`<table class="steel-dimensions">${rows.map(([label,value])=>`<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`).join('')}</table>`;
  pages.push({role:'overview',title:'鋼構支材貼合放樣工單',body:`${table(dimensions(p,result.geometry.steel.section))}${sectionIndex(faces,p.sectionRotation)}<div class="steel-datum"><strong>所有材料面共用自由直端 0 mm；D＝${fmt(D)} mm</strong><p>沿支材軸從同一自由直端量 D，逐面畫同一基準線。各面沿面距離 u 從該面起始邊量；相鄰面用同號邊對齊。</p></div><ol class="steel-sequence"><li>核對截面、實際板厚、面號、轉角與母材位置。</li><li>各面先標線，再切磨、試配及點固後重測。</li><li>列印 1:1 分面紙樣：實際大小 100%，核對水平／垂直 100 mm 校正尺；按拼頁十字對齊。</li></ol><p class="steel-scope">母管不開孔。工單供尺寸核對，材料面紙樣另印；不跨接槽口或中空區。截面圓角、坡口與工具可達性依目前模型及工法另核對，幾何貼合不驗證支撐荷重或焊道承載。</p>`});
  // Four short tables per page; large requested counts continue a face under
  // the same ID and absolute depth datum rather than shrinking printed text.
  const cards=records.flatMap(({face,rows})=>chunks(rows,13).map((part,index)=>({face,rows:part,index})));
  for(const [pageIndex,sheet] of chunks(cards,4).entries())pages.push({role:'faces',title:`材料面成品分點 · ${pageIndex+1}`,body:`<p class="steel-common-datum">全部深度從同一自由直端沿軸量。D ${fmt(D)} mm；u 沿材料面從起始邊增加；母管不開孔。</p><div class="steel-face-grid">${sheet.map(({face,rows,index})=>`<article class="steel-face-card" data-steel-face="${esc(face.id)}"><h2>${esc(face.id)} · ${esc(face.label??face.id)}${index?'（續）':''}</h2><p>${esc(face.edgeStartId)} → ${esc(face.edgeEndId)}；${face.kind==='arc'?'弧長':'實長'} ${fmt(face.width??face.length)} mm</p><table><thead><tr><th>點</th><th>沿面 u<br>mm</th><th>直端深度<br>mm</th><th>距 D<br>mm</th></tr></thead><tbody>${rows.map(s=>`<tr data-face-station="${esc(face.id)}-${s.index}"><td>${s.index+1}</td><td>${fmt(s.faceDistance)}</td><td>${fmt(s.depth)}</td><td>${fmt(s.depth-D)}</td></tr>`).join('')}</tbody></table></article>`).join('')}</div><p class="steel-scope">表列成品分點；點間直線只作標記，精細裁線以相同面號的 1:1 紙樣為準。內側材料面依實際表面對位，不能把內面尺寸當外面標切。</p>`});
  pages.push(...motherPages(result,faces,options));
  if(options.fabrication!==undefined){
    const original=validateFabricationPlan(options.fabrication),{plan:f,cleared}=reconcileFitRecords(original,p),entries=[['工具',{grinder:'砂輪機切磨',saw:'鋸切',plasma:'電漿',other:'其他'}[f.tool]],['沿軸留料記錄',`${fmt(f.stock)} mm`],['標線／切磨偏差記錄',`±${fmt(f.markError)}／±${fmt(f.cutError)} mm`],['實測切縫',`${fmt(f.kerf)} mm`],['工法／版次',f.wpsId||'未設定'],['根隙量測位置與方向',f.gapBasis||'未設定'],['工法根隙範圍',`${fmt(f.gapMin)}～${fmt(f.gapMax)} mm`]];
    if(f.wpsId||f.gapBasis||[f.stock,f.markError,f.cutError,f.kerf,f.gapMin,f.gapMax].some(v=>v!==null))pages.push({role:'process',title:'鋼構加工與工法記錄',body:`${table(entries)}<p class="steel-scope">留料、切縫及工具偏差只作工法記錄，不會改變各面成品裁線。試配量測須記錄面號、沿面距離及量測方向；依工法修磨、點固並重測。${cleared?'尺寸已改，原試配紀錄已清除。':''}</p>`});
    pages.push(...longNotePages('焊接工法與順序記錄',f.weldNote),...longNotePages('修整與處置記錄',f.disposition));
  }
  if(options.includeValidation){
    for(const [i,rows] of chunks(result.verification??[],16).entries())pages.push({role:'validation',title:`鋼構幾何與展開核對${i?'（續）':''}`,body:`<table><thead><tr><th>核對項目</th><th>數值</th><th>門檻</th><th>狀態</th></tr></thead><tbody>${rows.map(v=>`<tr><td>${esc(v.label)}</td><td>${esc(typeof v.value==='number'?fmt(v.value,8):v.value)} ${esc(v.unit)}</td><td>${esc(typeof v.tolerance==='number'?fmt(v.tolerance,8):v.tolerance??'—')}</td><td>${esc(v.status==='pass'?'通過':v.status)}</td></tr>`).join('')}</tbody></table><p class="steel-scope">本頁記錄理想母材與鋼構的幾何核對。母壁保持封閉；沒有母孔裁切資料。支撐荷重、局部母壁變形及焊道承載須另有設計資料。</p>`});
    const warnings=(result.warnings??[]).map(w=>typeof w==='string'?w:w.message??'').filter(Boolean).join('\n');
    pages.push(...longNotePages('模型與加工需核對事項',warnings));
  }
  const detail=Object.entries(meta).filter(([k,v])=>v!==undefined&&v!==null&&String(v).trim()&&(!['id','revision'].includes(k)||String(v).length>(k==='id'?32:12))).map(([k,v])=>`${({id:'接頭',revision:'版次',title:'標題',name:'名稱',project:'專案',projectName:'專案',preparedBy:'製作',company:'公司',createdAt:'建立日期',updatedAt:'更新日期',notes:'備註'})[k]??k}：${String(v)}`).join('\n\n');
  pages.push(...longNotePages('專案資料與備註',detail));
  return {pages,records,D};
}

export function steelWorkOrderPagePlan(result,options={}){
  const {pages,records}=steelPageBodies(result,options.metadata??{},options),number=role=>pages.filter(p=>p.role===role).length;
  return {totalPages:pages.length,coverPages:number('overview'),notePages:number('notes')+number('validation'),fabricationPages:number('process'),stationPages:number('faces')+number('mother'),motherPages:number('mother'),stationRowCount:records.reduce((n,r)=>n+r.rows.length,0),stationSheets:records.map(r=>({faceId:r.face.id,rows:r.rows})),parts:[]};
}

export function buildSteelWorkOrderHTML(result,metadata={},options={}){
  if(!metadata||typeof metadata!=='object'||Array.isArray(metadata))throw new Error('工單描述必須是物件。');
  const paper=options.paper??'A4';if(!['A4','A3'].includes(paper))throw new Error('請選 A4 或 A3 紙張。');
  if(options.orientation&&!['portrait','auto'].includes(options.orientation))throw new Error('鋼構尺寸工單使用直式；1:1 紙樣可另選方向。');
  const width=paper==='A4'?210:297,height=paper==='A4'?297:420,{pages}=steelPageBodies(result,metadata,options),
    id=compact(metadata.id??'未編號',32),revision=compact(metadata.revision??'1',12),
    date=compact(metadata.updatedAt??metadata.createdAt??new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),24);
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(id)} · 鋼構貼合工單</title><style>
@page{size:${width}mm ${height}mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;color:#000;font-family:"Microsoft JhengHei",sans-serif;font-size:3.2mm;line-height:1.4}body{background:#e9e9e9}.page{position:relative;width:${width}mm;min-height:${height}mm;padding:10mm 10mm 15mm;margin:6mm auto;background:#fff;break-after:page;page-break-after:always}.page:last-child{break-after:auto;page-break-after:auto}header{border-bottom:.35mm solid;margin-bottom:4mm}h1{font-size:5mm;margin:0 0 1.5mm}header p{font-size:2.9mm;margin:0 0 2mm}h2{font-size:3.5mm;margin:0 0 1mm}p{margin:1.5mm 0}table{width:100%;border-collapse:collapse;font-size:3mm}td,th{border:.2mm solid;padding:.8mm 1mm;text-align:right;vertical-align:top;overflow-wrap:anywhere}th:first-child,td:first-child{text-align:left}.steel-dimensions th{width:29%}.steel-dimensions td{text-align:left}.steel-face-grid{display:grid;grid-template-columns:1fr 1fr;gap:6mm 4mm}.steel-face-card{break-inside:avoid}.steel-face-card p{font-size:2.7mm}.steel-face-card td{font-variant-numeric:tabular-nums}.steel-common-datum,.steel-datum{border:.35mm solid;padding:2mm}.steel-section-index{margin:3mm auto;text-align:center}.steel-section-index svg{height:55mm;max-width:95%;width:120mm}.steel-section-index figcaption,.steel-scope{font-size:2.8mm}.steel-scope{border-top:.2mm solid;margin-top:3mm;padding-top:2mm}.steel-sequence{padding-left:6mm}.steel-long-note{white-space:pre-wrap;overflow-wrap:anywhere;font-size:3.2mm;line-height:5.5mm}footer{position:absolute;left:10mm;right:10mm;bottom:5mm;border-top:.2mm solid;font-size:2.7mm}footer span{float:right}.print-controls{position:sticky;top:0;background:#fff;padding:12px;display:flex;gap:16px;align-items:center;border-bottom:1px solid #aaa}.print-controls button{font:inherit;padding:8px 14px}@media print{body{background:#fff}.page{margin:0}.print-controls{display:none}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body><nav class="print-controls"><button type="button" onclick="window.print()">列印／另存 PDF</button><span>${paper} 直式尺寸工單；1:1 材料面紙樣另印。</span></nav>${pages.map((page,i)=>`<section class="page steel-${page.role}" data-page="${i+1}"><header><h1>${esc(page.title)}</h1><p>接頭 ${esc(id)} · 版次 ${esc(revision)} · ${esc(date)}</p></header>${page.body}<footer>母管不開孔 · 材料面深度共用自由直端 <span>${i+1}／${pages.length}</span></footer></section>`).join('')}</body></html>`;
}
