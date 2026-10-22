export function jointGapTarget(joint){return joint?.gapField?{field:joint.gapField,componentId:joint.componentId??null}:null;}
export function gapTargetKey(target){return (target.componentId??'params')+':'+target.field;}
export function gapInputTargets(plan){
  const targets=new Map();for(const j of plan?.joints??[]){if(j.kind==='bolt')continue;const t=jointGapTarget(j);if(t)targets.set(gapTargetKey(t),t);}return [...targets.values()];
}
export function gapInputValue(params,target){return target.componentId?params.components.find(c=>c.id===target.componentId)?.[target.field]:params[target.field];}
export function withGapInput(params,target,value){return target.componentId?{...params,components:params.components.map(c=>c.id===target.componentId?{...c,[target.field]:value}:c)}:{...params,[target.field]:value};}
