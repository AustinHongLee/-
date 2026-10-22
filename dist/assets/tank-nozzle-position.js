const numeric=value=>value===null||value===undefined||String(value).trim()===''?null:Number.isFinite(Number(value))?Number(value):null;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export const NOZZLE_POSITION_VIEWS=Object.freeze({horizontal:{start:80,end:440,axis:96},vertical:{start:190,end:55,axis:260},end:{cx:260,cy:132,r:84}});
export function nozzleDirectionLabel(angle,horizontal=true){
  const a=((angle%360)+360)%360;
  const cardinal={0:horizontal?'正上方':'0°基準方向',90:'右側',180:horizontal?'正下方':'180°方向',270:'左側'};
  return cardinal[a]??(horizontal?(a<90?'右上方':a<180?'右下方':a<270?'左下方':'左上方'):'圓周 '+a+'°方向');
}
export function nozzleLocationModel(r,selected){
  if(!r?.valid)return null;
  const raw=r.input.nozzles?.find(n=>n.id===selected),solved=r.nozzlePlan?.items.find(n=>n.id===selected),n=solved??raw;
  if(!n)return null;
  const horizontal=r.orientation==='horizontal',host=n.host??'shell',body=NOZZLE_POSITION_VIEWS[horizontal?'horizontal':'vertical'],end=NOZZLE_POSITION_VIEWS.end,height=numeric(n.height),angle=numeric(n.angle),radius=numeric(n.radius),offset=numeric(n.offset),parallel=host==='shell'&&n.axisMode==='parallel';
  const bodyPoint=height===null?null:body.start+(body.end-body.start)*height/r.bodyHeight;
  const surfaceAngle=numeric(solved?.surfaceAngle)??angle;
  const point=(item)=>{const a=Number(item.surfaceAngle??item.angle)*Math.PI/180,rr=item.host==='shell'?end.r:Number(item.radius)/(r.di/2)*end.r;return {x:end.cx+rr*Math.sin(a),y:end.cy-rr*Math.cos(a)};};
  const endPoint=surfaceAngle===null||host!=='shell'&&radius===null?null:point({...n,surfaceAngle});
  const datumShift=r.frame.bodyBottom-r.frame.bottomTangent;
  return {n,solved:!!solved,horizontal,host,parallel,height,angle,radius,offset,bodyPoint,endPoint,body,end,datumShift,tlDistance:height===null?null:height+datumShift,surfaceAngle,
    bodyMarkers:(r.nozzlePlan?.items??[]).filter(item=>item.host==='shell'&&item.id!==n.id).map(item=>({id:item.id,mark:item.mark||item.id,name:item.name,x:horizontal?body.start+(body.end-body.start)*item.height/r.bodyHeight:body.axis,y:horizontal?body.axis:body.start+(body.end-body.start)*item.height/r.bodyHeight})),
    endMarkers:(r.nozzlePlan?.items??[]).filter(item=>item.host===host&&item.id!==n.id).map(item=>({id:item.id,mark:item.mark||item.id,name:item.name,...point(item)}))};
}
// Cluster close markers into a choice, without changing their stored geometry.
export function clusterNozzleMarkers(markers,distance=20){
  const groups=[];
  for(const marker of markers){const nearby=groups.filter(g=>g.items.some(p=>Math.hypot(p.x-marker.x,p.y-marker.y)<distance));
    if(!nearby.length)groups.push({items:[marker]});
    else{const target=nearby[0];target.items.push(marker);for(const other of nearby.slice(1)){target.items.push(...other.items);groups.splice(groups.indexOf(other),1);}}
  }
  return groups.map(g=>({items:g.items,x:g.items.reduce((s,p)=>s+p.x,0)/g.items.length,y:g.items.reduce((s,p)=>s+p.y,0)/g.items.length}));
}
export function nozzlePositionPatch(r,n,kind,point){
  if(!r?.valid)return null;
  const od=numeric(n.od),gap=numeric(n.holeGap),angle=numeric(n.angle);if(od===null||gap===null||angle===null)return null;
  if(kind==='height'){
    const v=NOZZLE_POSITION_VIEWS[r.orientation==='horizontal'?'horizontal':'vertical'],at=r.orientation==='horizontal'?point.x:point.y,margin=od/2+gap;
    if(r.bodyHeight<2*margin)return null;
    return {height:Number(clamp((at-v.start)/(v.end-v.start)*r.bodyHeight,margin,r.bodyHeight-margin).toFixed(2))};
  }
  const {cx,cy,r:rad}=NOZZLE_POSITION_VIEWS.end,x=point.x-cx,y=cy-point.y,distance=Math.hypot(x,y),limit=Math.max(0,r.di/2-od/2-gap);
  if(kind==='angle'&&n.axisMode==='parallel'){const a=angle*Math.PI/180;return {offset:Number(clamp((x*Math.cos(a)-y*Math.sin(a))/rad*r.od/2,-Math.max(0,limit-.01),Math.max(0,limit-.01)).toFixed(2))};}
  const patch={};if(distance>=8)patch.angle=Number(((Math.atan2(x,y)*180/Math.PI+360)%360).toFixed(2));
  if(kind==='end')patch.radius=Number(clamp(distance/rad*r.di/2,0,limit).toFixed(2));
  return patch;
}
