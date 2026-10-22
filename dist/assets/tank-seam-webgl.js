import {shellCourseAt} from './tank-shell-layout.js';
import {shellSeamDisplayModel,seamZoneSurfacePath} from './tank-seam-display.js';
// One developed-mm footprint, wrapped onto the same outside shell in both viewers.
export function addShellSeamOverlays(r,THREE,group,{bodyBottom=r.frame.bodyBottom,offset=()=>0,showZones=true}={}){
  const model=shellSeamDisplayModel(r);if(!model.active)return model;
  const radius=r.od/2+Math.max(.8,r.od/2500),color=bad=>bad?'#c93629':'#bd853b';
  for(const band of model.bands.slice(0,1000)){
    if(!(band.width>0)&&band.conflict){
      const angle=band.angle*Math.PI/180,base=bodyBottom+band.z+offset(band.course),pts=band.kind==='longitudinal'?[[radius*Math.sin(angle),base,radius*Math.cos(angle)],[radius*Math.sin(angle),base+band.length,radius*Math.cos(angle)]]:Array.from({length:129},(_,i)=>[radius*Math.sin(i*Math.PI/64),base,radius*Math.cos(i*Math.PI/64)]),line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(p=>new THREE.Vector3(...p))),new THREE.LineBasicMaterial({color:color(true)}));
      line.userData={weldId:band.id,color:color(true),clearanceOverlay:true};group.add(line);
    }
    if(!(band.width>0))continue;
    const arc=Math.min(Math.PI*2,band.width*model.scaleX/r.circumference*Math.PI*2),angle=band.angle*Math.PI/180;
    const geometry=band.kind==='longitudinal'?new THREE.CylinderGeometry(radius,radius,band.length,Math.max(2,Math.ceil(arc*20)),1,true,angle-arc/2,arc):new THREE.CylinderGeometry(radius,radius,band.width,96,1,true);
    const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:color(band.conflict),transparent:true,opacity:band.conflict?.65:.38,depthWrite:false,side:THREE.DoubleSide}));
    mesh.position.y=bodyBottom+band.z+offset(band.course)+(band.kind==='longitudinal'?band.length/2:0);mesh.userData={weldId:band.id,color:color(band.conflict),clearanceOverlay:true};group.add(mesh);
  }
  if(showZones)for(const zone of model.zones){
    const course=shellCourseAt(r,zone.z).course;
    for(const working of [false,true]){
      if(working&&zone.workDistance===0)continue;
      const pts=seamZoneSurfacePath(r,zone,{working,radius:radius+1,bodyBottom:bodyBottom+offset(course)}).map(p=>new THREE.Vector3(...p));
      const c=zone.conflict?'#cf392b':working?'#437ab1':'#bd853b',material=working?new THREE.LineDashedMaterial({color:c,dashSize:Math.max(2,r.od/160),gapSize:Math.max(1,r.od/250),depthTest:true}):new THREE.LineBasicMaterial({color:c,depthTest:true});
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),material);line.computeLineDistances();line.userData={nozzleId:zone.nozzleId,color:c,clearanceOverlay:true};group.add(line);
    }
  }
  return model;
}
