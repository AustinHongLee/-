import {componentSlot,componentTargetLabel,installRouteComponents,validateComponents} from './offset-components.js';

export function componentLocations(plan,items=[],editingId=null){
  const base=plan?.basePlan??plan;
  return ['a','s1','s2','s3','b'].map(target=>{
    const slot=componentSlot({target},base?.elbows?.length),pipe=target.startsWith('s')&&slot>=base?.elbows?.length?null:base?.pipes?.find(p=>p.slot===slot);
    const occupied=items.find(c=>c.id!==editingId&&c.target===target);
    const span=pipe?pipe.length+(target==='a'?base.joints[0].amount:target==='b'?base.joints.at(-1).amount:0):null;
    return {target,label:componentTargetLabel(target),pipe:pipe?.id??null,span,occupied:occupied?.id??null,
      note:occupied?'已有 '+occupied.id:pipe?'可用 '+Number(span.toFixed(2))+' mm':['a','b'].includes(target)?'需含端部直管的接法':'需更多彎頭之間的直線'};
  });
}
export function componentPlacementPreview(plan,items,draft,minimum,od=plan?.params?.od){
  const next=[...items.filter(c=>c.id!==draft.id),draft];
  const errors=validateComponents(next,od);
  if(errors.length)return {state:'incomplete',message:errors[0],pipes:[]};
  if(!plan?.valid)return {state:'search',message:'尚無可用接法；加入尺寸後會搜尋可容納零件的接法。',pipes:[]};
  const installed=installRouteComponents(plan,next,minimum);
  if(!installed?.valid)return {state:'search',message:installed.componentIssues?.[0]??'目前接法放不下；套用後會比較其他接法。',pipes:[]};
  const c=installed.components.find(c=>c.id===draft.id),pipeIds=new Set([installed.elements[installed.elements.indexOf(c)-1]?.id,installed.elements[installed.elements.indexOf(c)+1]?.id]);
  return {state:'fit',message:'目前接法放得下',pipes:installed.pipes.filter(p=>pipeIds.has(p.id)),welds:installed.jointCount,bolts:installed.boltCount};
}
