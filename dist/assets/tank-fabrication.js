import {normalizeSupportLayout,supportFitIssues} from './tank-support-layout.js';
// A project-owned fabrication register. Quantities are per assembly; all outputs
// use the same expanded quantities. null means unknown, never a zero-weight part.
export const PART_KINDS={plate:'平板／已知展開板',pipe:'直管',round:'圓棒',ring:'圓板／環板',profile:'異形／成形件',purchased:'採購件'};
export const WELD_KINDS={fillet:'角焊',butt:'對接焊'};
export const FAB_DEFAULT=Object.freeze({version:1,assemblies:Object.freeze([])});
export const fabId=(prefix,items)=>{let n=1;while(items.some(x=>x.id===prefix+n))n++;return prefix+n;};
const number=(v,lo,hi,{integer=false,nullable=true}={})=>{
  if(v===null||v===undefined||v==='')return nullable?null:NaN;
  if(!['number','string'].includes(typeof v)||typeof v==='string'&&!v.trim())return NaN;
  const n=Number(v);return Number.isFinite(n)&&n>=lo&&n<=hi&&(!integer||Number.isInteger(n))?n:NaN;
};
const text=(v,max=160)=>typeof v==='string'&&v.length<=max?v:null;
const ID=/^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const isId=value=>typeof value==='string'&&ID.test(value);
const numeric={length:[.001,1e7],width:[.001,1e7],thickness:[.001,1e4],od:[.001,1e6],idiameter:[0,1e6],density:[1,30000],eachKg:[0,1e9],holeDiameter:[0,1e6],holeCount:[0,10000],slotLength:[.001,1e6],blankLength:[.001,1e7],blankWidth:[.001,1e7],trim:[0,10000]};
export function normalizeFabrication(value){
  const issues=[],assemblies=[],fail=(field,message)=>issues.push({field:'fabricationData.'+field,message});
  if(value===undefined||value===null)return {data:{version:1,assemblies},issues};
  if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1||!Array.isArray(value.assemblies)||value.assemblies.length>80){fail('','分件資料格式錯誤，最多 80 個組件。');return {data:{version:1,assemblies},issues};}
  const ids=new Set();let partCount=0,weldCount=0;
  for(const raw of value.assemblies){
    if(!raw||typeof raw!=='object'||!isId(raw.id)||ids.has(raw.id)){fail('','組件編號無效或重複。');continue;}ids.add(raw.id);
    const path=raw.id,a={id:raw.id};
    for(const key of ['name','note']){const s=text(raw[key]??'',key==='note'?1000:160);if(s===null)fail(path+'.'+key,'組件文字欄位過長或格式錯誤。');a[key]=s??'';}
    a.target=raw.target??'accessory';if(typeof a.target!=='string'){fail(path+'.target','組件歸屬格式錯誤。');a.target='accessory';}if(!['accessory','support'].includes(a.target)&&!/^(?:(?:pad|cover):)?N[1-9]\d{0,3}$/.test(a.target))fail(path+'.target','請選擇附件、支承、管嘴、補強板或蓋板。');
    a.qty=number(raw.qty,1,10000,{integer:true,nullable:false});if(!Number.isFinite(a.qty))fail(path+'.qty','組件套數須為 1～10,000 的整數。');
    if(!['accessory','support'].includes(a.target)&&a.qty!==1)fail(path+'.qty','指定管嘴／補強／蓋板的分件固定為一組，零件數量請填在組內。');
    const support=normalizeSupportLayout(raw.supportLayout,'fabricationData.'+a.id+'.supportLayout');issues.push(...support.issues);if(support.data)a.supportLayout=support.data;
    a.parts=[];a.welds=[];
    if(!Array.isArray(raw.parts)||raw.parts.length>100||!Array.isArray(raw.welds)||raw.welds.length>150){fail(path,'每組最多 100 項分件、150 項焊道。');assemblies.push(a);continue;}
    const local=new Set();
    for(const rawPart of raw.parts){
      if(!rawPart||!isId(rawPart.id)||local.has(rawPart.id)){fail(path,'組內零件編號無效或重複。');continue;}local.add(rawPart.id);
      const p={id:rawPart.id},pp=path+'.'+p.id;
      for(const key of ['name','material','spec','note','unit']){const s=text(rawPart[key]??(key==='unit'?'件':''),key==='note'?1000:160);if(s===null)fail(pp+'.'+key,'分件文字欄位過長或格式錯誤。');p[key]=s??'';}
      p.weightBasis=rawPart.weightBasis??'finished';if(!['finished','blank'].includes(p.weightBasis))fail(pp+'.weightBasis','重量基準須為成品或先備板。');
      p.kind=rawPart.kind;if(!Object.hasOwn(PART_KINDS,p.kind))fail(pp+'.kind','不支援的分件型式。');
      p.stockMode=rawPart.stockMode??'auto';if(!['auto','blank','purchase'].includes(p.stockMode))fail(pp+'.stockMode','請選依尺寸、指定毛坯或外購成品。');
      p.qty=number(rawPart.qty,1,100000,{integer:true,nullable:false});if(!Number.isFinite(p.qty))fail(pp+'.qty','每組分件數量須為 1～100,000 的整數。');
      for(const [key,[min,max]] of Object.entries(numeric)){p[key]=number(rawPart[key],min,max,{integer:key==='holeCount'});if(Number.isNaN(p[key]))fail(pp+'.'+key,'尺寸／重量超出範圍，未知請留空。');}
      if(['pipe','ring'].includes(p.kind)&&p.od!==null){const inside=p.kind==='pipe'?(p.thickness!==null?p.od-2*p.thickness:null):p.idiameter;if(inside!==null&&(inside<0||inside>=p.od||p.kind==='pipe'&&inside===0))fail(pp+'.'+(p.kind==='pipe'?'thickness':'idiameter'),'內徑須小於外徑；管厚須小於半徑。');}
      if(p.holeDiameter>0&&p.holeCount>0&&p.kind==='plate'&&p.length!==null&&p.width!==null){if(p.holeDiameter>Math.min(p.length,p.width)||Math.PI*p.holeDiameter**2/4*p.holeCount>=p.length*p.width)fail(pp+'.holeDiameter','孔徑或孔面積超出板件，請核對。');}
      if(p.slotLength!==null&&(p.holeDiameter<=0||p.slotLength<p.holeDiameter||p.kind!=='plate'||p.length!==null&&p.slotLength>p.length||p.length!==null&&p.width!==null&&((Math.PI*p.holeDiameter**2/4+p.holeDiameter*(p.slotLength-p.holeDiameter))*p.holeCount>=p.length*p.width)))fail(pp+'.slotLength','長孔總長須不小於孔寬，並且位於平板內。');
      a.parts.push(p);partCount++;
    }
    const wids=new Set();
    for(const rawWeld of raw.welds){
      if(!rawWeld||!isId(rawWeld.id)||wids.has(rawWeld.id)){fail(path,'焊道編號無效或重複。');continue;}wids.add(rawWeld.id);
      const w={id:rawWeld.id},wp=path+'.'+w.id;
      for(const key of ['name','a','b','aLocation','bLocation','note','wps']){const s=text(rawWeld[key]??'',key==='note'?1000:160);if(s===null)fail(wp+'.'+key,'焊道文字欄位格式錯誤。');w[key]=s??'';}
      for(const side of ['a','b'])if(!local.has(w[side])&&!['@shell','@top','@bottom','@site'].includes(w[side]))fail(wp+'.'+side,'焊道 '+w.id+' 連到不存在的分件，請重新選擇接件。');
      if(w.a===w.b&&(!w.aLocation.trim()||!w.bLocation.trim()||w.aLocation===w.bLocation))fail(wp+'.bLocation','同一件自接時，請填不同的 A／B 接合邊或位置。');
      w.kind=rawWeld.kind??'fillet';if(!Object.hasOwn(WELD_KINDS,w.kind))fail(wp+'.kind','請選擇角焊或對接焊。');
      w.measure=rawWeld.measure??'manual';if(!['manual','circumference','perimeter'].includes(w.measure))fail(wp+'.measure','不支援的焊長計算方式。');
      w.qty=number(rawWeld.qty,1,100000,{integer:true,nullable:false});if(!Number.isFinite(w.qty))fail(wp+'.qty','每組相同焊道數須為正整數。');
      for(const key of ['length','diameter','size']){w[key]=number(rawWeld[key],.001,1e7);if(Number.isNaN(w[key]))fail(wp+'.'+key,'焊長／尺寸超出範圍，未知請留空。');}
      w.process=rawWeld.process??'inherit';if(!['inherit','smaw','gtaw','gmaw','fcaw','saw'].includes(w.process))fail(wp+'.process','不支援的焊接方式。');
      a.welds.push(w);weldCount++;
    }
    assemblies.push(a);
  }
  if(partCount>1500||weldCount>2000)fail('','分件或焊道過多（最多 1,500／2,000 項）。');
  const owners=new Set();for(const a of assemblies)if(a.target!=='accessory'){if(owners.has(a.target))fail(a.id+'.target','同一支承／管嘴／補強／蓋板只能有一份取代概算的分件表。');owners.add(a.target);}
  return {data:{version:1,assemblies},issues};
}
export function partEstimate(p){
  const missing=[];const need=key=>{if(p[key]===null||p[key]===undefined)missing.push(key);return p[key];};
  let volume=null,area=null;
  if(p.kind==='plate'){const L=need('length'),W=need('width'),t=need('thickness');if(p.holeCount>0)need('holeDiameter');if(p.holeDiameter>0)need('holeCount');if(!missing.length){const d=p.holeDiameter??0,holeArea=Math.PI*d*d/4+d*Math.max(0,(p.slotLength??d)-d);area=L*W-holeArea*(p.holeCount??0);volume=area*t;}}
  if(p.kind==='pipe'){const D=need('od'),t=need('thickness'),L=need('length');if(!missing.length)volume=Math.PI*(D*D-(D-2*t)**2)/4*L;}
  if(p.kind==='round'){const D=need('od'),L=need('length');if(!missing.length)volume=Math.PI*D*D/4*L;}
  if(p.kind==='ring'){const D=need('od'),d=need('idiameter'),t=need('thickness');if(!missing.length)volume=Math.PI*(D*D-d*d)/4*t;}
  // Profile envelopes are not assumed to be solid plates. A supplier's or
  // drawing's unit mass is the only automatic weight for an unspecified shape.
  let eachKg=p.eachKg;
  if(eachKg===null||eachKg===undefined){if(volume!==null&&p.density!==null&&p.density!==undefined)eachKg=volume*p.density/1e9;else {eachKg=null;if(volume!==null)missing.push('density');if(['purchased','profile'].includes(p.kind))missing.push('eachKg');}}
  const dimensionsReady=['purchased','profile'].includes(p.kind)?Boolean(p.spec.trim()):!missing.some(x=>x!=='density'&&x!=='eachKg');
  if(!Number.isFinite(eachKg))eachKg=null;return {eachKg,volume,area,dimensionsReady,missing:[...new Set(missing)]};
}
export function partSpec(p){
  const n=v=>v===null||v===undefined?'待填':String(Math.round(v*100)/100);
  if(p.kind==='plate')return `${p.weightBasis==='blank'?'先備板 ':''}${n(p.length)} × ${n(p.width)} × t${n(p.thickness)} mm${p.holeCount>0?' · '+p.holeCount+(p.slotLength?' 長孔 '+n(p.holeDiameter)+'×'+n(p.slotLength):' 孔 Ø'+n(p.holeDiameter)):''}`;
  if(p.kind==='pipe')return `Ø${n(p.od)} × t${n(p.thickness)} · L ${n(p.length)} mm`;
  if(p.kind==='round')return `Ø${n(p.od)} · 展開 L ${n(p.length)} mm`;
  if(p.kind==='ring')return `Ø${n(p.od)} / Ø${n(p.idiameter)} × t${n(p.thickness)} mm`;
  return p.spec||'規格待填';
}
export function fabricationOwners(data){return new Set((data?.assemblies??[]).filter(a=>a.target!=='accessory').map(a=>a.target));}
export function planFabrication(r,normalized){
  const {data,issues}=normalized,parts=[],welds=[],pending=[],owners=fabricationOwners(data);
  for(const a of data.assemblies){
    if(!['accessory','support'].includes(a.target)&&!r.nozzlePlan.items.some(n=>n.id===a.target.split(':').at(-1)))issues.push({field:'fabricationData.'+a.id+'.target',message:a.id+' 指定的管嘴已不存在，請重新指定。'});
    if(!a.parts.length)pending.push({id:a.id,text:a.id+' 尚無分件'});
    for(const p of a.parts){const e=partEstimate(p),id=a.id+'.'+p.id,quantity=a.qty*p.qty,weight=e.eachKg===null||!Number.isFinite(quantity)?null:e.eachKg*quantity,unknown=p.weightBasis==='blank',ready=e.dimensionsReady&&Boolean(p.material.trim())&&weight!==null&&!unknown;
      const row={...p,...e,id,localId:p.id,assembly:a.id,assemblyName:a.name,assemblyQty:a.qty,perAssembly:p.qty,quantity,weight,spec:partSpec(p),source:'detail',target:a.target,ready,unknown};parts.push(row);if(!ready)pending.push({id,field:'fabricationData.'+id+'.'+(unknown?'note':!e.dimensionsReady?['purchased','profile'].includes(p.kind)?'spec':e.missing[0]:!p.material.trim()?'material':e.missing[0]||'eachKg'),text:id+' '+p.name+'：'+[unknown?'成品淨重待核（已計先備板重量）':'',!e.dimensionsReady?'尺寸／規格待補':'',!p.material.trim()?'材質待填':'',weight===null?'重量未計':''].filter(Boolean).join('、')});}
    issues.push(...supportFitIssues(a,r));
    for(const w of a.welds){const footprint=a.parts.find(p=>p.id===w.b),perimeter=Number.isFinite(footprint?.width)&&Number.isFinite(footprint?.thickness)?2*(footprint.width+footprint.thickness):null,measured=w.measure==='perimeter'?perimeter:w.measure==='circumference'?(w.diameter===null?null:Math.PI*w.diameter):w.length,eachLength=Number.isFinite(measured)?measured:null,quantity=w.qty*a.qty,length=eachLength===null||!Number.isFinite(quantity)?null:eachLength*quantity,ready=length!==null&&Number.isFinite(w.size);
      const row={...w,id:a.id+'.'+w.id,localId:w.id,assembly:a.id,assemblyName:a.name,assemblyQty:a.qty,perAssembly:w.qty,quantity,a:w.a.startsWith('@')?w.a:a.id+'.'+w.a,b:w.b.startsWith('@')?w.b:a.id+'.'+w.b,eachLength,length,ready,source:'detail',group:'detail',category:'附',t:w.kind==='butt'?w.size:undefined,leg:w.kind==='fillet'?w.size:undefined};welds.push(row);if(!ready)pending.push({id:row.id,field:'fabricationData.'+row.id+'.'+(length===null?w.measure==='circumference'?'diameter':'length':'size'),text:row.id+'：'+[length===null?'焊長待填':'',w.size===null?'焊接尺寸待填':''].filter(Boolean).join('、')});}
  }
  return {data,owners,parts,welds,pending,issues,valid:!issues.length,knownWeight:parts.reduce((s,p)=>s+(p.weight??0),0),unknownWeight:parts.filter(p=>p.weight===null).length,knownWeldLength:welds.reduce((s,w)=>s+(w.length??0),0),unknownWelds:welds.filter(w=>!w.ready).length};
}
export function finalizeFabrication(r){
  const f=r.fabricationPlan,auto=[];
  const mm=n=>Number.isFinite(n)?String(Math.round(n*100)/100):'待填';
  for(const p of r.parts){
    const formed=p.kind==='formed'||p.headType,spec=formed?`成形封頭 t${mm(p.thickness)} mm${p.blankDiameter>0?'；供應商毛坯 Ø'+mm(p.blankDiameter):''}`:p.kind==='circle'?`成品 Ø${mm(p.finishedDiameter)} × t${mm(p.thickness)}；先備 Ø${mm(p.blankDiameter)} mm`:p.pieces?`${p.id==='S'?'筒身逐片':'異形'} ${p.quantity} 片，各片毛坯見排料明細 · t${mm(p.thickness)} mm`:`成品 ${mm(p.finishedWidth??p.width)} × ${mm(p.finishedHeight??p.height)} × t${mm(p.thickness)}；先備 ${mm(p.width)} × ${mm(p.height)} mm`;
    auto.push({id:'BODY.'+p.id,name:p.name,assembly:'BODY',assemblyName:'槽體',quantity:p.quantity,perAssembly:p.quantity,assemblyQty:1,kind:p.kind,material:r.input.material||'材質待填',spec,weight:p.netWeight,eachKg:p.pieces?null:p.netWeight/p.quantity,source:'auto',note:p.pieces?'本列為板件群組總重，不把平均重量當單片單重；逐片尺寸見排料表':p.weightEstimated?'曲面估重，供應商確認':'成品估重；孔洞未扣，毛坯留料未計入成品重量'});
  }
  for(const n of r.nozzlePlan.items){
    if(f.owners.has(n.id))continue;
    const common={assembly:'NOZZLE',assemblyName:'管嘴概算',quantity:1,perAssembly:1,assemblyQty:1,source:'auto',unit:'件'};
    if(n.construction==='integral')auto.push({...common,id:'NOZZLE.'+n.id+'.INTEGRAL',name:(n.mark||n.id)+' 一體接件與內管',kind:'purchased',material:n.flangeMaterial||'材質待填',spec:'依接件詳圖拆料',eachKg:n.flangeWeight||null,weight:n.flangeWeight||null,unknown:true,note:'一體頸／內管未拆件，不按一般直管＋短頸法蘭估料'});
    else {
      auto.push({...common,id:'NOZZLE.'+n.id+'.PIPE',name:(n.mark||n.id)+' 接管',kind:'pipe',material:r.input.material||'材質待填',spec:`Ø${n.od} × t${n.thickness} · 最長包絡 ${n.maxCutLength.toFixed(2)} mm`,eachKg:n.pipeWeight,weight:n.pipeWeight,note:'沿用槽體材質／密度；魚口切除未扣，先備長另加留料'});
      if(n.end!=='bare')auto.push({...common,id:'NOZZLE.'+n.id+'.FLANGE',name:(n.mark||n.id)+' 法蘭',kind:'purchased',material:n.flangeMaterial||'材質待填',spec:`${n.flangeSize||'尺寸待核'} Class${n.flangeClass||'待核'} ${n.flangeFacing||''} ${n.end.toUpperCase()}`,eachKg:n.flangeWeight||null,weight:n.flangeWeight||null,unknown:!n.flangeWeight,note:'單重依實物／供應商資料；0 為未提供'});
    }
  }
  for(const n of r.nozzlePlan.items)if(n.padRadius>0&&!r.attachments.pads.items.some(p=>p.id===n.id)&&!f.owners.has('pad:'+n.id))auto.push({id:'NOZZLE.'+n.id+'.PAD',name:(n.mark||n.id)+' 補強板（展開待補）',assembly:'ATT',assemblyName:'附件概算',quantity:1,perAssembly:1,assemblyQty:1,unit:'片',kind:'profile',material:r.input.material||'材質待填',spec:`外徑 ${mm(n.padRadius*2)} × t${mm(n.padThickness)} mm；實際斜交展開待核`,eachKg:null,weight:null,unknown:true,source:'auto',note:'未以徑向圓板替代；重量及原板排料尚未計入'});
  const key=text=>{let h=2166136261;for(const c of text)h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0).toString(36);};
  r.attachments.bom.forEach(p=>auto.push({id:'ATT.'+key(p.name),name:p.name,assembly:'ATT',assemblyName:'附件概算',quantity:p.qty,perAssembly:p.qty,assemblyQty:1,kind:'auto',nozzle:p.nozzle,material:r.input.material||'材質待填',spec:p.spec,unit:p.unit,eachKg:p.each,weight:p.weight,source:'auto',note:'既有工法沿用槽體材料／密度概算，請核對附件實際材質'}));
  for(const a of f.data.assemblies)if(!a.parts.length)auto.push({id:a.id,assembly:a.id,assemblyName:a.name,name:'組件尚未分件',quantity:a.qty,perAssembly:1,assemblyQty:a.qty,unit:'組',kind:'pending',material:'',spec:'分件待建立',eachKg:null,weight:null,ready:false,source:'detail',localId:'',note:a.note});
  f.bom=[...auto,...f.parts];f.register=[...(r.process?.weld.seams??[]).filter(w=>w.source!=='detail').map(w=>({...w,id:'AUTO-W'+key(w.group+'|'+w.name),source:'auto',ready:true})),...f.welds];
  f.groups=Object.values(f.bom.reduce((out,p)=>{const key=p.assembly;const g=out[key]??={id:key,name:p.assemblyName,weight:0,unknown:0,items:0};g.weight+=p.weight??0;g.unknown+=p.weight===null||Boolean(p.unknown)?1:0;g.items++;return out;},Object.create(null)));
  for(const row of f.bom){
    if(row.assembly==='BODY')row.stock=r.parts.find(p=>'BODY.'+p.id===row.id)?.stock;
    else if(row.assembly==='ATT'&&!row.stock){const matches=(r.stockParts??[]).filter(p=>p.group==='attachment'&&(p.name===row.name||row.nozzle&&p.pieces?.some(x=>x.nozzle===row.nozzle)));if(matches.length){const placements=matches.flatMap(p=>(p.stock.placements??[]).filter(x=>!row.nozzle||p.pieces?.[x.piece-1]?.nozzle===row.nozzle));row.stock={status:matches.every(p=>p.stock.status==='packed')?'packed':'pending',sheetIDs:[...new Set(placements.map(x=>x.sheet))]};}}
    if(!row.stock&&row.source==='auto')row.stock={status:['pipe','purchased'].includes(row.kind)||row.kind==='auto'&&!r.attachments.issues.length?'purchase':'pending',sheetIDs:[],message:row.kind==='profile'?'展開毛坯待補':'原板來源待補'};
  }
  f.knownTotalWeight=r.emptyWeight;f.unknownTotal=f.bom.filter(p=>p.weight===null||p.unknown).length;return f;
}
export function createFabricationAssembly(template,id,{density=7850,material='',od=1200}={}){
  const part=(id,name,kind,extra={})=>({id,name,kind,qty:1,material,density,eachKg:null,length:null,width:null,thickness:null,od:null,idiameter:null,holeDiameter:0,holeCount:0,stockMode:'auto',trim:null,blankLength:null,blankWidth:null,spec:'',note:'',unit:'件',...extra});
  const weld=(id,a,b,extra={})=>({id,name:'',a,b,kind:'fillet',qty:1,measure:'manual',length:null,diameter:null,size:null,process:'inherit',wps:'',note:'',...extra});
  const a={id,name:'新附件',target:'accessory',qty:1,note:'新增模板為操作起點；空白尺寸依圖說補齊。',parts:[],welds:[]};
  if(template==='support'){a.name='分件支承';a.target='support';a.qty=2;a.parts=[part('P1','底板','plate',{material:'',length:null,width:null,thickness:null}),part('P2','支承腹板','profile',{spec:'支承腹板外形與孔位依詳圖'}),part('P3','墊板／耐磨板','plate')];a.welds=[weld('W1','P1','P2'),weld('W2','P2','P3'),weld('W3','P3','@shell')];}
  else if(template==='pipe'){a.name='管段組件';a.parts=[part('P1','直管','pipe'),part('P2','法蘭／接件','purchased')];a.welds=[weld('W1','P1','P2',{kind:'butt',measure:'circumference'}),weld('W2','P1','@shell',{measure:'circumference'})];}
  else if(template==='purchase'){a.name='採購附件';a.parts=[part('P1','採購件','purchased')];}
  else{a.name='板件附件';a.parts=[part('P1','板件','plate')];a.welds=[weld('W1','P1','@shell')];}
  return a;
}
