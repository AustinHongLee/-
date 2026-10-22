// Project-owned positioning for a pair of fabricated saddles. Part dimensions
// stay in the fabrication register; they are never copied into a second BOM.
export const SUPPORT_LAYOUT_DEFAULT={version:1,type:'saddle-pair',stations:[275,825],axisToBase:800,span:590,holePitch:480,holeAxialOffset:null,formedAngle:142,contactAngle:123,spanDatum:'pending'};
export function normalizeSupportLayout(raw,path='supportLayout'){
  const issues=[],fail=message=>issues.push({field:path,message});
  if(raw===undefined||raw===null)return {data:null,issues};
  if(typeof raw!=='object'||Array.isArray(raw)||raw.version!==1||raw.type!=='saddle-pair'){fail('支承配置格式錯誤。');return {data:null,issues};}
  const data={version:1,type:'saddle-pair'};
  const finite=(value,lo,hi)=>value!==''&&value!==null&&['string','number'].includes(typeof value)&&Number.isFinite(Number(value))&&Number(value)>=lo&&Number(value)<=hi;
  if(!Array.isArray(raw.stations)||raw.stations.length!==2||!raw.stations.every(n=>finite(n,0,1e7))||Number(raw.stations[1])<=Number(raw.stations[0]))fail('請依序填入兩組不同的支承站位。');
  data.stations=Array.isArray(raw.stations)?raw.stations.map(Number).slice(0,2):[];
  for(const [key,max] of [['axisToBase',1e7],['span',1e7],['holePitch',1e7],['formedAngle',179.9],['contactAngle',179.9]]){if(!finite(raw[key],.001,max))fail('支承位置、尺寸與角度須填有效正值。');data[key]=Number(raw[key]);}
  data.holeAxialOffset=raw.holeAxialOffset===null||raw.holeAxialOffset===undefined||raw.holeAxialOffset===''?null:Number(raw.holeAxialOffset);
  if(data.holeAxialOffset!==null&&!finite(raw.holeAxialOffset,-1e7,1e7))fail('孔列軸向偏置請填數值，未知留空。');
  data.spanDatum=raw.spanDatum??'pending';if(!['pending','centres','outside','inside'].includes(data.spanDatum))fail('支承跨距基準無效。');
  return {data,issues};
}
export function supportFitIssues(a,r){
  const g=a.supportLayout;if(!g)return [];
  const issues=[],fail=(field,message)=>issues.push({field:'fabricationData.'+a.id+'.'+field,message}),p=id=>a.parts.find(p=>p.id===id),leg=p('P3'),pad=p('P4'),bases=[p('P1'),p('P6')];
  if(r.orientation!=='horizontal')fail('supportLayout','這份兩組鞍座配置適用臥式槽；請先核對方向。');
  if(a.qty!==1||!leg||!pad||bases.some(p=>!p)||leg?.qty!==4||pad?.qty!==2||bases.some(p=>p?.qty!==1))fail('supportLayout','兩組支承配置需一對底板P1／P6、四項腳板P3及兩片耐磨板P4；數量或拆件改動後請重建配置。');
  if(g.stations.some(s=>s>r.height))fail('supportLayout.stations','支承站位超出兩端TL之間，請修正站位。');
  if(g.contactAngle>g.formedAngle)fail('supportLayout.contactAngle','鞍座接觸角超出耐磨板角度。');
  for(const [id,left,right] of [['W1','P1','P3'],['W5','P6','P3'],['W2','P3','P2'],['W3','P2','P4'],['W4','P4','@shell']]){
    const w=a.welds.find(w=>w.id===id);if(!w)continue;
    if(!([w.a,w.b].includes(left)&&[w.a,w.b].includes(right)))fail(id+'.a','此支承配置的'+id+'接合對象已改變，請先核對實際位置配置。');
    if(['W1','W5'].includes(id)&&(w.qty!==2||w.measure==='perimeter'&&w.b!=='P3'))fail(id+'.qty','底部每組兩腳；全周計算須以B側腳板P3為基準，請核對接合數與對象。');
  }
  const R=r.od/2+(pad?.thickness??0),x=g.span/2+(g.spanDatum==='inside'?(leg?.thickness??0)/2:g.spanDatum==='outside'?-(leg?.thickness??0)/2:0);
  if(x>=R)fail('supportLayout.span','支承跨距超出貼合圓，請核對尺寸面與實際跨距。');
  for(const b of bases.filter(Boolean)){
    if(Number.isFinite(b.length)&&g.span+(leg?.thickness??0)>b.length)fail(b.id+'.length','底板長度容不下兩腳，請核對跨距與底板。');
    if(Number.isFinite(b.width)&&Number.isFinite(leg?.width)&&leg.width>b.width)fail(b.id+'.width','腳底軸向寬超出底板，請核對腳底與底板軸向寬。');
    if(Number.isFinite(b.length)&&g.holePitch+(b.holeDiameter??0)>b.length)fail('supportLayout.holePitch','孔距及孔徑超出底板長度。');
    if(g.holeAxialOffset!==null&&Number.isFinite(b.width)&&Math.abs(g.holeAxialOffset)+(b.slotLength??b.holeDiameter??0)/2>b.width/2)fail('supportLayout.holeAxialOffset','孔列軸向偏置會讓孔超出底板。');
    if(Number.isFinite(b.thickness)&&g.axisToBase<=R+b.thickness)fail('supportLayout.axisToBase','槽軸至板底的距離不足以容納耐磨板與底板。');
  }
  return issues;
}
