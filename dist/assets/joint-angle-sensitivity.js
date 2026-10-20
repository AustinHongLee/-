import {computeJoint,computeExactStationTable} from './joint-model.js';

// A sensitivity comparison, never a substitute tolerance or a cutting envelope.
// Re-evaluate the same free-end datum and clock positions at angle ± deviation.
export function jointAngleSensitivity(params,deviation){
  if(typeof deviation!=='number'||!Number.isFinite(deviation)||deviation<=0||deviation>5)return {valid:false,message:'試算角度偏差須大於 0 且不超過 5°。'};
  if((params.hostType??'straight')!=='straight'||params.branchSection&&params.branchSection!=='pipe')return {valid:false,message:'這項試算目前適用直圓母管與圓形支管；彎頭、大小管與鋼構截面需另作試配。'};
  const angles=[params.angle,params.angle-deviation,params.angle+deviation];
  const results=angles.map(angle=>computeJoint({...params,angle,padEnabled:false,autoPrecision:false,samples:180}));
  const bad=results.findIndex(r=>!r.valid);
  if(bad!==-1)return {valid:false,message:`${angles[bad]}° 時超出可計算幾何：${results[bad].errors?.[0]?.message??'請核對尺寸'}。這組量角誤差無法直接套用同一紙樣。`};
  const datum=results[0].geometry.branch.axisEnd;
  // Each calculation normally moves the free end to preserve minimum retained
  // length. Hold its axial datum here, or that re-fit would hide cutting error.
  const rows=results.map(r=>computeExactStationTable(r,72).map(s=>({...s,outerDepth:s.outerDepth+datum-r.geometry.branch.axisEnd,innerDepth:s.innerDepth+datum-r.geometry.branch.axisEnd})));let maximum={difference:0,clock:0,edge:'outer',angle:params.angle};
  for(let j=1;j<rows.length;j++)for(let i=0;i<72;i++)for(const edge of ['outer','inner']){
    const difference=Math.abs(rows[j][i][edge+'Depth']-rows[0][i][edge+'Depth']);
    if(difference>maximum.difference)maximum={difference,clock:rows[0][i].angle,edge,angle:angles[j]};
  }
  return {valid:true,deviation,angles,rows,maximum,stations:72,
    scope:'固定自由直端沿支管軸的基準距離與周向，比較成品切線；72 分點取樣，不是連續最大誤差保證。未合併管徑、橢圓度、刀縫或焊接收縮。'};
}
