// Route each actual solver issue to its editable source, without changing measured data.
const finite=Number.isFinite,fmt=n=>finite(n)?String(Number(n.toFixed(2))):'未填',stockKeys=['Kind','Donor','Radius','RadiusMethod','MeasuredArc','FactoryAngle','Takeout','Tangent'];
const names={run:'X 前後距離',roll:'Y 左右距離',rise:'Z 高低距離',angle:'彎頭角度',od:'實際外徑',aPortGap:'G1 間隙',aGap:'G2 間隙',bGap:'G3 間隙',bPortGap:'G4 間隙',trimA:'起端修磨留料',trimB:'終端修磨留料',minStraight:'最短直管',stations:'分點數',basis:'量測基準',datum:'量測點',layout:'平面／立體量測',solve:'已知尺寸'};
export function offsetFieldRoute(field,p,{sharedStock=false}={}){
 let key=field;
 if(sharedStock&&stockKeys.some(k=>key==='b'+k))key='a'+key.slice(1);
 if(/^[ab]Axis[XYZ]$/.test(key)){
  const end=key[0],bad=['X','Y','Z'].find(k=>!finite(p[end+'Axis'+k])||Math.abs(p[end+'Axis'+k])>1e7);if(bad)key=end+'Axis'+bad;
 }
 const plan=key.startsWith('plan'),stock=key==='od'||stockKeys.some(k=>key==='a'+k||key==='b'+k),gap=/PortGap$|^[ab]Gap$|^trim|^minStraight$|^stations$/.test(key);
 return {field:key,stage:plan?2:1,editor:stock?'stock':gap?'gaps':'position',end:/^[ab](Axis|Kind|Donor|Radius|Measured|Factory|Takeout|Tangent)/.test(key)?key[0]:null,graphicalAxis:/^[ab]Axis$/.test(key)&&p[key]!=='custom'};
}
function parallelSpace(r){
 const c=r.context;if(!c)return '';
 const u=c.axes.a,v=c.axes.b;if(u.some((x,i)=>Math.abs(x-v[i])>1e-8))return '';
 const forward=c.delta.reduce((s,x,i)=>s+x*u[i],0)-c.params.aPortGap-c.params.bPortGap-(c.specs[0].tangent??0)-(c.specs[1].tangent??0),
       axial=c.delta.reduce((s,x,i)=>s+x*u[i],0),side=Math.hypot(...c.delta.map((x,i)=>x-axial*u[i])),sum=c.specs.reduce((s,e)=>s+e.radius,0);
 // A necessary bound for parallel ends when the transverse distance >= sum of radii.
 if(side>=sum&&forward<sum)return `沿管軸扣除端部間隙與直段後只有 ${fmt(forward)} mm；這兩支彎頭即使用到 90°，也至少需 ${fmt(sum)} mm 的軸向空間。`;
 return '';
}
export function offsetRecoveryItems(result,{sharedStock=false}={}){
 const p=result.params,items=[];
 for(const error of result.errors??[]){
  const route=offsetFieldRoute(error.field,p,{sharedStock}),field=route.field,end=field[0],both=sharedStock&&stockKeys.some(k=>field==='a'+k),label=both?'兩端':route.end?route.end.toUpperCase()+' 端':'',code=error.code??'input',inputError=code==='input',name=names[field]??`${label} ${field.slice(1)}`;
  let title=`核對${name}`,detail=error.message,actionLabel=`前往${name}`,target=route,secondary=[];
  if(['run','roll','rise'].includes(field)&&inputError){title=finite(p[field])?`${name}超出可計算範圍`:`請填${name}`;detail=p.basis==='ports'?'填 A 到 B 的實測距離，反方向用負值；沒有這個方向的偏移請明確填 0。':'填中心線理論交點之間的實測尺寸。';actionLabel=`填${name}`;}
  else if(field==='od'){title='先確認管子的實際外徑';detail=`目前 ${fmt(p.od)} mm。可選公稱吋數帶入外徑，或填大於 0 的實測外徑。`;actionLabel='選管徑／填外徑';}
  else if(/Radius$|MeasuredArc$/.test(field)&&!field.startsWith('plan')){
   title=`${label}彎頭半徑還不能使用`;const arc=field.endsWith('MeasuredArc');detail=arc?`請量原件完整${p[end+'RadiusMethod']==='outerArc'?'外背':'內腹'}弧，排除端部直段；反算的 Rc 須大於外徑一半 ${fmt(p.od/2)} mm。`:`外徑 ${fmt(p.od)} mm，中心線 Rc 必須大於 ${fmt(p.od/2)} mm；目前填 ${fmt(p[field])} mm。請核對實物半徑。`;actionLabel=arc?'量／填完整弧長':'核對彎頭 Rc';
  }else if(code==='stock-angle'){
   title=`${label}原件角度不夠`;detail=`接合需要 ${fmt(error.requiredAngle)}°，手邊原件只有 ${fmt(error.availableAngle)}°。確認是否另有較大角度原件；位置固定時也可比較其他接法。`;actionLabel='選較大角度原件';
  }else if(code==='fixed-angle'){
   title=`${label}現成彎頭對不上`;detail=`這支整件是 ${fmt(error.availableAngle)}°，目前接合需要 ${fmt(error.requiredAngle)}°。核對手邊供料，或改選可切角原件並量實際 Rc。`;actionLabel='核對供料／選切角原件';
  }else if(code==='short-pipe'){
   title='中間直管短於現場下限';detail=`算出的成品 ${fmt(error.cutLength)} mm，下限 ${fmt(error.minimum)} mm，少 ${fmt(error.minimum-error.cutLength)} mm。核對下限是否填對；也可保留此下限比較其他配置。`;actionLabel='核對最短直管';
  }else if(code==='route-unavailable'){
   title='現有位置與供料放不下兩彎頭';detail=p.basis==='ports'?(parallelSpace(result)||'這組位置、朝向與彎頭尺寸，沒有正長度的中間直管。')+' 先核對管口朝向或供料尺寸；端口固定時可比較其他配置。':'理論交點間距不足以容納兩個彎頭與焊口間隙。核對量測基準、已知角度與供料尺寸。';target=offsetFieldRoute(p.basis==='ports'?'aAxis':p.solve==='angle'?'angle':'run',p,{sharedStock});actionLabel=p.basis==='ports'?'核對兩個管口朝向':'核對交點量測／已知角度';secondary=[{label:'核對彎頭尺寸',route:offsetFieldRoute(p.aKind==='factory'?'aTakeout':p.basis==='ports'&&p.aRadiusMethod!=='radius'?'aMeasuredArc':'aRadius',p,{sharedStock})}];
  }else if(code==='angle-limit'||code==='straight-end'){
   title=code==='angle-limit'?`${label}單個彎頭轉不過去`:`${label}幾乎不需要彎頭`;detail=code==='angle-limit'?`目前需要 ${fmt(error.requiredAngle)}°，本工具單個彎頭上限 90°。先核對該管口朝向；位置固定時比較更多接件的配置。`:'這一端接近直線，原兩彎頭配置不適用。核對朝向，或比較含直管的其他配置。';actionLabel=`核對 ${label}朝向`;
  }else if(/^[ab]Axis/.test(field)){
   title=`${label}朝向沒有定義完整`;detail='可直接用方向圖卡選；斜向填 X／Y／Z 分量，至少一個不為 0。';actionLabel=`選 ${label}朝向`;
  }else if(/Donor$|FactoryAngle$/.test(field)){
   title=`${label}原件角度尚未填對`;detail=`填實物角度，大於 0 且不超過 90°；目前 ${fmt(p[field])}°。`;actionLabel='填原件角度';
  }else if(/Gap$|^trim|Tangent$|^minStraight$/.test(field)){
   title=`${names[field]??label+'保留端直段'}尚未填對`;detail=`目前 ${fmt(p[field])} mm。填 0 或正值；空白表示尚未量／指定，不能當 0。`;actionLabel='填間隙／直段／留料';
  }else if(field==='stations'){title='請選分點數';detail='可選 4／8／12／24 分點。';actionLabel='選分點數';}
  const id=target.field+':'+code,existing=items.find(i=>i.id===id);
  if(existing){existing.sources.push(error);if(finite(error.requiredAngle)&&error.requiredAngle>(existing.requiredAngle??-Infinity)){existing.requiredAngle=error.requiredAngle;existing.detail=detail;}continue;}
  items.push({id,title,detail,reason:error.message,actionLabel,route:target,sourceRoute:route,sources:[error],inputError,code,requiredAngle:error.requiredAngle,secondary,canCompare:Boolean(result.context)&&p.basis==='ports'});
 }
 return items;
}
export function nextOffsetAction({stage,editor,attempted,valid,issues=[],comparison=null}){
 const searchable=issues.some(i=>i.canCompare)&&issues.every(i=>!i.inputError);
 if(stage===3)return {action:'print'};
 if(stage===2){
  if(valid)return {action:'work'};
  if(comparison?.issues?.length)return {action:'comparison-repair',issue:comparison.issues[0]};
  if(comparison?.valid)return {action:comparison.plans.some(p=>!p.original)?'choose':'limits'};
  return searchable?{action:'search'}:{action:'repair',issue:issues[0]};
 }
 if(attempted)return valid?{action:'calculate'}:searchable?{action:'search'}:{action:'repair',issue:issues[0]};
 const blocking=issues.find(i=>i.inputError&&i.route.stage===1&&i.route.editor===editor);if(blocking)return {action:'repair',issue:blocking};
 return editor==='position'?{action:'editor',editor:'stock'}:editor==='stock'?{action:'editor',editor:'gaps'}:{action:'calculate'};
}
