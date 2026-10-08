import {esc,fmt,documentHTML,stationTable} from './offset-exports.js';
import {routeElbowFrame,retainedRouteFrame,PROCESS_NAMES,processName} from './offset-planner.js';
import {elbowFabricationSVG,elbowCutSteps} from './offset-fabrication.js';
import {partName,componentFabricationSVG} from './offset-component-ui.js';
import {CONNECTION_NAMES} from './offset-components.js';
const vector=q=>q.map(v=>fmt(v,4)).join('／');
const checked=p=>{if(!p?.valid||p.closureError>1e-5||p.axisError>1e-5)throw new Error('建議未通過端口閉合檢查，無法輸出。');return p;};
export function routePlanTitle(plan){
  if(plan.original)return '原兩彎頭方案';
  const sequence=plan.basePlan?.elements??plan.elements,lead=sequence[0].type==='pipe',tail=sequence.at(-1).type==='pipe';
  return `${plan.elbows.map(e=>fmt(e.angle)).join('°＋')}° · ${lead&&tail?'兩端加直管':lead?'A 端加直管':tail?'B 端加直管':`${plan.pipes.length} 段直管`}`;
}
export function routePlanDiagramSVG(raw){
  const p=checked(raw),points=p.elements.flatMap(e=>e.type!=='elbow'?[e.start,e.finish]:[e.start,...Array.from({length:33},(_,i)=>routeElbowFrame(e,i/32).center),e.finish]);
  points.push(p.context.ports.a,p.context.ports.b);
  const spans=p.envelope.max.map((v,k)=>v-p.envelope.min[k]),areas=[spans[0]*spans[1],spans[0]*spans[2],spans[1]*spans[2]],mainPanel=areas.indexOf(Math.max(...areas));
  const panels=[['X／Y',0,1],['X／Z',0,2],['Y／Z',1,2]].map(([title,x,y],panel)=>{
    const minX=Math.min(...points.map(q=>q[x])),maxX=Math.max(...points.map(q=>q[x])),minY=Math.min(...points.map(q=>q[y])),maxY=Math.max(...points.map(q=>q[y]));
    const scale=Math.min(190/Math.max(maxX-minX,1),125/Math.max(maxY-minY,1)),ox=25+panel*260+(200-(maxX-minX)*scale)/2,oy=110+(maxY-minY)*scale/2;
    const at=q=>[ox+(q[x]-minX)*scale,oy-(q[y]-minY)*scale],xy=q=>q.map(v=>fmt(v,2)).join(','),path=ps=>ps.map((q,i)=>(i?'L':'M')+xy(at(q))).join(' ');
    const elements=p.elements.map(e=>{
      const ps=e.type!=='elbow'?[e.start,e.finish]:[e.start,...Array.from({length:33},(_,i)=>routeElbowFrame(e,i/32).center),e.finish],mid=at(e.type!=='elbow'?e.start.map((v,k)=>(v+e.finish[k])/2):routeElbowFrame(e,.5).center);
      return `<path d="${path(ps)}" fill="none" stroke="${e.type==='component'?'#bb8136':e.type==='pipe'?'#526a7c':'#1975a3'}" stroke-width="${e.type==='pipe'?7:9}" stroke-linecap="round"/>${panel===mainPanel?`<text x="${fmt(mid[0])}" y="${fmt(mid[1]+(e.type==='pipe'?19:-13))}" text-anchor="middle">${e.id}</text>`:''}`;
    }).join('');
    const a=at(p.context.ports.a),b=at(p.context.ports.b),cross=q=>`<path d="M${fmt(q[0]-4)} ${fmt(q[1])}h8M${fmt(q[0])} ${fmt(q[1]-4)}v8" stroke="#182d3d"/>`;
    return `<g>${elements}${cross(a)}${cross(b)}<text x="${fmt(a[0]-10)}" y="${fmt(a[1]+18)}">A</text><text x="${fmt(b[0]+5)}" y="${fmt(b[1]+18)}">B</text><text x="${25+panel*260}" y="23" font-weight="bold">${title} 正投影</text></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 780 225" role="img" aria-label="${esc(routePlanTitle(p))}，${p.jointCount} 個焊口"><g fill="#172c3f" font-size="12" font-family="Arial,Microsoft JhengHei">${panels}<text class="route-legend" x="25" y="220">E＝彎頭 · P＝直管 · C＝指定零件 · A／B＝既有端面中心 · 圖示不按比例，依尺寸表製作</text></g></svg>`;
}
export function routePlanDiagramPanelsHTML(raw){
  const p=checked(raw),svg=routePlanDiagramSVG(p),spans=p.envelope.max.map((v,k)=>v-p.envelope.min[k]),areas=[spans[0]*spans[1],spans[0]*spans[2],spans[1]*spans[2]],order=[0,1,2].sort((a,b)=>areas[b]-areas[a]);
  return `<div class="offset-plan-projections">${order.map(i=>svg.replace('viewBox="0 0 780 225"',`viewBox="${i*260} 0 260 205"`).replace(/<text class="route-legend"[^>]*>[^<]*<\/text>/,'').replace(/aria-label="[^"]*"/,`aria-label="${esc(routePlanTitle(p))} · ${['X／Y','X／Z','Y／Z'][i]} 正投影"`)).join('')}</div>`;
}
export function buildRoutePlanWorkOrder(raw,id='OFF-001',paper='A4'){
  const p=checked(raw),hasComponents=Boolean(p.components?.length),orderTitle=p.original&&hasComponents?'含指定零件組立加工單':'替代組立建議',head=title=>`<h1>${esc(title)} · ${esc(id)}／${p.id}</h1><p>${p.original&&hasComponents?'原兩彎頭加入指定零件':'建議方案，原工單未替換'} · ${esc(routePlanTitle(p))} · OD ${fmt(p.params.od)} mm</p>`,table=(headers,rows)=>`<table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const materialRow=e=>[e.id,e.type==='component'?partName(e):e.type==='pipe'?'直管':`彎頭 Rc ${fmt(e.radius)}`,e.type==='component'?`${fmt(e.length)} mm；實測組立總長`:e.type==='pipe'?`${fmt(e.length)} mm；先下料 ${fmt(e.blankLength)} mm`:`原 ${fmt(e.donor)}° → ${fmt(e.angle,4)}°；${processName(e)}；前直段 ${fmt(e.tangentBefore)}／後直段 ${fmt(e.tangentAfter)} mm`];
  const pages=[head(orderTitle+' · 備料與焊口')+`<div class="summary"><strong>${p.jointCount} 個焊口</strong> · ${p.elbows.length} 彎頭／${p.pipes.length} 直管${hasComponents?`／${p.components.length} 指定零件 · ${p.boltCount} 處螺栓接合`:''}<p>特殊切角 ${p.specialCuts} 次 · 對半切 ${p.halfCuts} 次 · 中心線超出端口範圍最多 ${fmt(p.envelope.maxExcursion)} mm</p></div><div class="route-diagram">${routePlanDiagramSVG(p)}</div><h2>沿 A → B 的材料順序</h2>`+table(['編號','材料','成品尺寸／加工'],p.elements.slice(0,8).map(materialRow))+`<p>直管每段各加 A 端留料 ${fmt(p.params.trimA)}、B 端留料 ${fmt(p.params.trimB)} mm；修磨後按成品尺寸。彎頭備料按每個 E 各一支原件計，不假設切下另一半能作精確角度件。</p><p>閉合誤差 ${fmt(p.closureError,6)} mm，末端軸差 ${fmt(p.axisError,6)}°；這是幾何檢查，沒有判定施工允收。依現場空間、供料、WPS 及焊口需求核對後，才決定是否採用。</p>`];
  for(let start=8;start<p.elements.length;start+=8)pages.push(head('材料順序 · 續表')+table(['編號','材料','成品尺寸／加工'],p.elements.slice(start,start+8).map(materialRow)));
  pages.push(head('定位、直管與間隙')+table(['項目','值'],[['A → B 端面中心 XYZ',vector(p.context.delta)+' mm'],['A／B 向外管軸',vector(p.context.axes.a)+'；'+vector(p.context.axes.b.map(v=>-v))],['中心線超出範圍 XYZ',vector(p.envelope.excursions)+' mm'],[hasComponents?'管路外包 XYZ（按管 OD，未含零件外形）':'保守外包 XYZ（含 OD）',vector(p.envelope.size)+' mm'],['原輸入最短直管',p.params.minStraight?fmt(p.params.minStraight)+' mm':'未指定工法下限'],['建議搜尋最短管段',fmt(p.params.planMinPipe)+' mm（搜尋設定，非焊接允收規範）']])+`<h2>每段直管及彎頭的世界座標</h2>`+table(['編號','起端 XYZ mm','終端 XYZ mm'],p.elements.slice(0,8).map(e=>[e.id,vector(e.start),vector(e.finish)]))+`${p.elements.length>8?'（座標續表見下頁）':''}<h2>組立與加工核對</h2><ol><li>依材料順序標 E／P／C 與 A → B 流向。每段直管按成品長加工，不能把全部餘量只留到最後一個焊口。</li><li>彎頭依表列角度使用或切除；原方案可能需要特殊切角。原件角度、Rc、保留端直段按供料實測；整支件計前後直段，切短端的原直段已切掉；0 代表供料明確無直段。</li><li>${hasComponents?'零件兩端依各 C 的接法與預留，端口零件取代該端原間隙；其他接合沿用原設定。':'端口 G1／G4、首末中間焊口 G2／G3 沿用輸入，其餘焊口使用新增間隙。'}所有數值已納入座標閉合，不能再扣一次。</li><li>按各 E 的外背向量定位。間隙沿各接合管軸量，不沿兩端總 XYZ 斜距量。</li><li>支撐試組，核對 B 端 XYZ、朝向、四周根部間隙及錯邊，再定位點焊複量。</li></ol><p>方案搜尋不是所有可能路徑的全域最佳解。未檢查障礙物、材料自相交、設備接管載荷或焊接收縮，不能用建議的閉合數據判定可強拉。</p>`);
  for(let start=8;start<p.elements.length;start+=12)pages.push(head('零件世界座標 · 續表')+table(['編號','起端 XYZ mm','終端 XYZ mm'],p.elements.slice(start,start+12).map(e=>[e.id,vector(e.start),vector(e.finish)])));
  pages.push(head('各彎頭方向、焊口與保留端')+table(['彎頭','角度／原件','保留端','外背 XYZ 向量'],p.elbows.map(e=>[e.id,`${fmt(e.angle,4)}°／${fmt(e.donor)}°`,e.retain==='outlet'?'後端（靠 B）':'前端（靠 A）',vector(retainedRouteFrame(e).outside)]))+`<p>從保留端朝彎頭內看，以彎頭外背為 0°、右側 90°、內腹 180°、左側 270°。外背向量依同一個現場 XYZ 基準定位；整支件也要核對轉向。</p><h2>各焊口位置與間隙來源</h2>`+table(['焊口／接合','間隙 mm／來源','間隙方向 XYZ'],p.joints.slice(0,10).map((j,i)=>[`${j.id} · ${i===0?'既有 A':p.elements[i-1].id} ↔ ${i===p.elements.length?'既有 B':p.elements[i].id}`,`${fmt(j.amount)}／${CONNECTION_NAMES[j.kind??'weld']}／${j.source}`,vector(j.direction)]))+`<p>原方案與建議方案的焊口數、直管數不同；本單只供此建議，不能與原兩彎頭直管尺寸混用。</p>`);
  for(let start=10;start<p.joints.length;start+=12)pages.push(head('接合位置與間隙 · 續表')+table(['焊口／接合','間隙 mm／來源','間隙方向 XYZ'],p.joints.slice(start,start+12).map((j,k)=>{const i=start+k;return [`${j.id} · ${i===0?'既有 A':p.elements[i-1].id} ↔ ${i===p.elements.length?'既有 B':p.elements[i].id}`,`${fmt(j.amount)}／${CONNECTION_NAMES[j.kind??'weld']}／${j.source}`,vector(j.direction)];})));
  for(const e of p.components??[])pages.push(head(e.id+' · '+partName(e))+componentFabricationSVG(e)+`<p>組立總長從整組兩個接管端面量，已組裝的配對法蘭與墊片包含在總長內。兩端額外接合預留已另外計入，不能再扣一次。按實物核對流向、手輪／操作空間及法蘭孔位；外形為辨識示意。</p><p>組內螺栓接合 ${e.internalBolts} 處；全組現場焊口 ${p.jointCount} 處，螺栓接合 ${p.boltCount} 處。零件組內製造焊道不列現場焊口。</p>`);
  for(const e of p.elbows)if(e.kind==='cut'){
    pages.push(head(e.id+' · '+(e.trimFar?'弧端切除直段':processName(e))+'與標線')+`<p>保留${e.retain==='outlet'?'後端（靠 B）':'前端（靠 A）'}。切短端接中間直管；按上一頁外背向量定位。${e.trimFar?`角度用滿原件，另一端自帶直段 ${fmt(e.trimFar)} mm 在弧端切除。`:''}</p><div class="fabrication">${elbowFabricationSVG(e,p.params.od)}</div>`+elbowCutSteps(e,p.params.od).replace('保留原端口接既有管口；切短的那端接中間直管。','保留端方向按本建議材料順序；中間彎頭不能套用原工單 A／B 端口標記。'));
    for(let start=0;start<e.stations.length;start+=25)pages.push(head(e.id+' · 分點尺寸')+stationTable(e,e.stations.slice(start,start+25))+`<p>表內弧長從保留端弧面起點量；從保留端面量時各加自帶直段 ${fmt(e.tangent)} mm。沿母線貼捲尺，不能量弦長。360° 為閉合核對。</p>`);
  }
  return documentHTML(orderTitle+' '+id+' '+p.id,pages,paper).replace('.summary{','.route-diagram svg{width:190mm;height:55mm}.fabrication svg{width:190mm;height:85mm}.offset-shop-steps{padding-left:5mm;font-size:3.1mm}.offset-shop-steps li{margin-bottom:2mm}.summary{');
}
export function routePlanCSV(raw){
  const p=checked(raw),rows=[['建議方案',p.id,routePlanTitle(p)],['焊口數',p.jointCount],['特殊切角數',p.specialCuts],['對半切數',p.halfCuts],['端口閉合誤差 mm',p.closureError],[],['材料','類型','成品長 mm','先下料長 mm','保留角度 deg','原件角度 deg','Rc mm','前直段 mm','後直段 mm','起端 XYZ','終端 XYZ']];
  for(const e of p.elements)rows.push([e.id,e.type==='component'?partName(e):e.type==='pipe'?'直管':processName(e),e.type!=='elbow'?e.length:'',e.type==='pipe'?e.blankLength:'',e.angle??'',e.donor??'',e.radius??'',e.tangentBefore??'',e.tangentAfter??'',vector(e.start),vector(e.finish)]);
  rows.push([],['接合','預留 mm','接法','來源']);for(const j of p.joints)rows.push([j.id,j.amount,CONNECTION_NAMES[j.kind??'weld'],j.source]);if(p.components?.length)rows.push(['組內及外部螺栓接合數',p.boltCount]);
  const cell=v=>{const value=typeof v==='number'?String(Number(v.toFixed(6))):String(v),safe=typeof v!=='number'&&/^[\s\u0000-\u001f]*[=+@-]/.test(value)?"'"+value:value;return '"'+safe.replaceAll('"','""')+'"';};
  return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
}
