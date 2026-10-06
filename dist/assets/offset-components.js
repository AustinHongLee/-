// Required inline assemblies. Length is between the assembly's two mating faces;
// additional interface gaps are counted once, independently of its installed internals.
export const COMPONENT_NAMES={valve:'閥組',flangePair:'法蘭組',custom:'指定零件'};
export const CONNECTION_NAMES={weld:'焊接',bolt:'螺栓接合'};
const add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,n)=>a.map(v=>v*n),distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const numeric=(n,positive=false)=>typeof n==='number'&&Number.isFinite(n)&&n>=(positive?1e-4:0)&&n<=1e6;
export function validateComponents(items){
  if(!Array.isArray(items)||items.length>5)return ['指定零件須為清單，最多五個不同位置。'];
  const errors=[],ids=new Set(),targets=new Set(),keys=['id','kind','name','target','length','leftConnection','rightConnection','leftGap','rightGap','placement','distance','internalBolts'];
  for(const c of items){
    if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).some(k=>!keys.includes(k))){errors.push('零件資料含未知欄位。');continue;}
    if(typeof c.id!=='string'||!/^C[1-9][0-9]{0,3}$/.test(c.id)||ids.has(c.id))errors.push('零件編號無效或重複。');ids.add(c.id);
    if(!Object.hasOwn(COMPONENT_NAMES,c.kind)||typeof c.name!=='string'||c.name.length>60)errors.push('請選零件類型，名稱最多 60 字。');
    if(!['a','b','s1','s2','s3'].includes(c.target)||targets.has(c.target))errors.push('同一直線位置請合併成一組，或選其他位置。');targets.add(c.target);
    if(!numeric(c.length,true))errors.push('請填大於 0 的實測組立總長。');
    if(!['weld','bolt'].includes(c.leftConnection)||!['weld','bolt'].includes(c.rightConnection))errors.push('請選兩端接法。');
    if(!numeric(c.leftGap)||!numeric(c.rightGap))errors.push('兩端接合預留須明確填 0 或正值。');
    if(!['center','fromA','fromB'].includes(c.placement)||!numeric(c.distance))errors.push('請填有效的定位方式及直管預留長度。');
    if(!Number.isInteger(c.internalBolts)||c.internalBolts<0||c.internalBolts>20)errors.push('組內螺栓接合數須為 0–20。');
  }
  return errors;
}
export function componentSlot(c,count){return c.target==='a'?0:c.target==='b'?count:Number(c.target.slice(1));}
export function componentMinimum(c,minimum,endGap=0){
  const occupied=c.length+c.leftGap+c.rightGap;
  if(c.target==='a'||c.target==='b')return Math.max(1e-4,occupied+minimum-endGap);
  return occupied+(c.placement==='center'?minimum*2:c.distance+minimum);
}
export function componentTargetLabel(target){return target==='a'?'A 管口':target==='b'?'B 管口':`第 ${target.slice(1)} 段中間直線`;}
export function installRouteComponents(raw,items=raw?.params?.components??[],minimum=raw?.params?.minStraight??0){
  if(!raw?.valid)return raw;
  const validation=validateComponents(items);if(validation.length)return {...raw,valid:false,componentIssues:validation};
  if(!items.length)return raw;
  const plan=raw.basePlan??raw,count=plan.elbows.length,elements=[],joints=[],issues=[];let finalJoint=null;
  const min=Math.max(1e-4,minimum),matched=new Set();
  const pipe=(source,id,start,length)=>({...source,id,start,finish:add(start,mul(source.direction,length)),length,blankLength:length+plan.params.trimA+plan.params.trimB});
  const gap=(c,side,start,direction)=>({kind:c[side+'Connection'],amount:c[side+'Gap'],source:`${c.id} ${side==='left'?'A 側':'B 側'} ${CONNECTION_NAMES[c[side+'Connection']]}`,direction,start,finish:add(start,mul(direction,c[side+'Gap']))});
  const addPart=(joint,element)=>{joints.push({...joint,kind:joint.kind??'weld'});elements.push(element);};
  for(let i=0;i<plan.elements.length;i++){
    const e=plan.elements[i],before=plan.joints[i],c=e.type==='pipe'?items.find(c=>(['a','b'].includes(c.target)||componentSlot(c,count)<count)&&componentSlot(c,count)===e.slot):null;
    if(!c){addPart(before,e);continue;}matched.add(c.id);
    const atA=c.target==='a',atB=c.target==='b',span=e.length+(atA?before.amount:atB?plan.joints.at(-1).amount:0),remaining=span-c.length-c.leftGap-c.rightGap;
    const left=atA?0:atB?remaining:c.placement==='center'?remaining/2:c.placement==='fromA'?c.distance:remaining-c.distance;
    const right=atB?0:atA?remaining:remaining-left;
    if((!atA&&left<min-1e-6)||(!atB&&right<min-1e-6)){
      const needed=componentMinimum(c,min,0),deficit=Math.max(needed-span,0,atA?0:min-left,atB?0:min-right);
      issues.push(`${c.name||COMPONENT_NAMES[c.kind]}放不進${componentTargetLabel(c.target)}：可用 ${Number(span.toFixed(2))} mm，零件及接合預留 ${Number((c.length+c.leftGap+c.rightGap).toFixed(2))} mm；此定位至少還缺 ${Number(deficit.toFixed(2))} mm。請縮短零件、改定位／位置，或比較含更長直線的接法。`);continue;
    }
    let current=atA?before.start:e.start;
    if(!atA){const p=pipe(e,e.id+(atB?'':'a'),current,left);addPart(before,p);current=p.finish;}
    const first=gap(c,'left',current,e.direction),start=first.finish,finish=add(start,mul(e.direction,c.length));
    addPart(first,{...c,type:'component',direction:e.direction,start,finish,slot:e.slot,sourcePipe:e.id});current=finish;
    const last=gap(c,'right',current,e.direction);
    if(atB)finalJoint=last;else addPart(last,pipe(e,e.id+(atA?'':'b'),last.finish,right));
  }
  for(const c of items)if(!matched.has(c.id))issues.push(`${componentTargetLabel(c.target)}沒有可放${c.name||COMPONENT_NAMES[c.kind]}的直線。${['a','b'].includes(c.target)?'需要含該端直管的接法。':'需要更多彎頭之間的直線。'}請比較其他接法或改位置。`);
  if(issues.length)return {...plan,valid:false,componentIssues:issues};
  joints.push({...finalJoint??plan.joints.at(-1),kind:finalJoint?.kind??'weld'});
  joints.forEach((j,i)=>j.id='J'+(i+1));
  let closure=0;for(let i=0;i<elements.length;i++)closure=Math.max(closure,distance(joints[i].finish,elements[i].start),distance(elements[i].finish,joints[i+1].start));
  closure=Math.max(closure,distance(joints[0].start,plan.context.ports.a),distance(joints.at(-1).finish,plan.context.ports.b));
  if(closure>1e-5)return {...plan,valid:false,componentIssues:['零件組立未通過端面閉合核對，不能輸出加工單。']};
  const pipes=elements.filter(e=>e.type==='pipe'),components=elements.filter(e=>e.type==='component'),totalPipe=pipes.reduce((n,e)=>n+e.length,0);
  return {...plan,params:raw.params,elements,pipes,components,joints,basePlan:plan,baseKey:plan.key,
    jointCount:joints.filter(j=>j.kind==='weld').length,connectionCount:joints.length,
    boltCount:joints.filter(j=>j.kind==='bolt').length+components.reduce((n,c)=>n+c.internalBolts,0),closureError:closure,
    totalPipe,totalLength:plan.totalLength-plan.totalPipe+totalPipe+components.reduce((n,e)=>n+e.length,0),key:plan.key+'|C:'+JSON.stringify(items)};
}
