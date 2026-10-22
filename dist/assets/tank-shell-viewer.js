import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {pieceColor} from './tank-visuals.js';
import {shellSceneAnnotations,tankDrawingModel} from './tank-drawing-model.js';
import {TankSceneLabels} from './tank-scene-labels.js';
import {addShellSeamOverlays} from './tank-seam-webgl.js';
const rad=d=>d*Math.PI/180;
// Closed shell sectors retain the actual inner/outer radii and plate thickness.
function sector(inner,outer,height,start,span){
  const shape=new THREE.Shape(),n=Math.max(8,Math.ceil(span*18));
  shape.moveTo(outer*Math.sin(start),outer*Math.cos(start));
  for(let i=1;i<=n;i++){const a=start+span*i/n;shape.lineTo(outer*Math.sin(a),outer*Math.cos(a));}
  for(let i=n;i>=0;i--){const a=start+span*i/n;shape.lineTo(inner*Math.sin(a),inner*Math.cos(a));}
  shape.closePath();
  const g=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,steps:1});
  // Local 2D x/y becomes x/z; extrusion becomes the positive tank axis y.
  g.applyMatrix4(new THREE.Matrix4().set(1,0,0,0,0,0,1,0,0,1,0,0,0,0,0,1));return g;
}
export class ShellConstructionViewer{
  constructor(host,onSelect){
    this.host=host;this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#edf4ef');this.group=new THREE.Group();this.scene.add(this.group);
    this.camera=new THREE.PerspectiveCamera(38,1,.1,1e7);this.renderer=new THREE.WebGLRenderer({antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));host.replaceChildren(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label','筒身 3D，拖曳旋轉，滾輪或雙指縮放；亦可使用下方縮放及視角按鈕');
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;
    this.labels=new TankSceneLabels(host,THREE);
    this.scene.add(new THREE.HemisphereLight('#ffffff','#637d6f',2.8));const light=new THREE.DirectionalLight('#ffffff',2.2);light.position.set(1,3,2);this.scene.add(light);
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);this.ray=new THREE.Raycaster();let down=null;
    this.renderer.domElement.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});
    this.renderer.domElement.addEventListener('pointerup',e=>{const a=down;down=null;if(!a||Math.hypot(e.clientX-a[0],e.clientY-a[1])>6)return;const b=this.renderer.domElement.getBoundingClientRect();this.ray.setFromCamera(new THREE.Vector2((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1),this.camera);const hit=this.ray.intersectObjects(this.group.children.filter(c=>c.userData.piece))[0];if(hit)onSelect(hit.object.userData.piece);});
    this.renderer.domElement.addEventListener('pointercancel',()=>{down=null;});this.resize();
  }
  resize(){const b=this.host.getBoundingClientRect();if(!b.width||!b.height)return;this.renderer.setSize(b.width,b.height);this.camera.aspect=b.width/b.height;this.camera.updateProjectionMatrix();}
  setActive(v){this.controls.enabled=v;this.renderer.setAnimationLoop(v?()=>{this.controls.update();this.renderer.render(this.scene,this.camera);this.labels.render(this.camera,this.group);}:null);}
  clear(){for(const o of [...this.group.children]){this.group.remove(o);o.geometry?.dispose();o.material?.dispose();}}
  update(m,step,explode=false){
    const r=m.result,key=JSON.stringify([r.di,r.od,r.bodyHeight,r.courses,r.panelsPerCourse,r.input.gap,r.input.seamStart,r.input.seamLayout,r.input.shellLayoutPlan,r.input.seamClearance,r.input.nozzles,r.orientation,explode,step,m.piece.id]);
    if(key===this.key)return;const first=!this.model,shapeChanged=this.shapeKey!==JSON.stringify([r.di,r.od,r.bodyHeight,r.orientation,explode]);this.key=key;this.shapeKey=JSON.stringify([r.di,r.od,r.bodyHeight,r.orientation,explode]);this.model=m;this.clear();
    this.group.matrixAutoUpdate=false;this.group.matrix.copy(m.horizontal?new THREE.Matrix4().set(0,1,0,0,0,0,1,0,1,0,0,0,0,0,0,1):new THREE.Matrix4().makeScale(1,1,-1));this.group.matrixWorldNeedsUpdate=true;
    const offset=c=>explode?(c-1)*r.bodyHeight*.08:0,ri=r.di/2,ro=r.od/2;
    const patches=r.assembly.length<=500?r.assembly:[m.piece];
    for(const b of patches){const selected=b.id===m.piece.id,mat=new THREE.MeshStandardMaterial({color:r.shellLayoutState?.invalidPieces?.includes(b.id)?'#cf6250':selected?'#e9b65f':pieceColor(b.id),metalness:.22,roughness:.6,transparent:!selected,opacity:selected?1:.45,depthWrite:selected,side:THREE.DoubleSide}),mesh=new THREE.Mesh(sector(ri,ro,b.height,rad(b.start/r.circumference*360),rad(b.length/r.circumference*360)),mat);mesh.position.y=b.z+offset(b.course);mesh.userData.piece=b.id;this.group.add(mesh);}
    if(r.assembly.length>500){const shell=new THREE.Mesh(new THREE.CylinderGeometry(ro,ro,r.bodyHeight,80,1,true),new THREE.MeshStandardMaterial({color:'#8ead9c',transparent:true,opacity:.18,depthWrite:false,side:THREE.DoubleSide}));shell.position.y=r.bodyHeight/2;this.group.add(shell);}
    if(['fit','weld'].includes(step))for(const w of m.welds.filter(w=>r.assembly.length<=500||m.localWelds.some(l=>l.id===w.id))){
      const local=m.localWelds.some(l=>l.id===w.id),points=w.kind==='longitudinal'?
        [new THREE.Vector3((ro+1)*Math.sin(rad(w.angle)),w.z+offset(w.course),(ro+1)*Math.cos(rad(w.angle))),new THREE.Vector3((ro+1)*Math.sin(rad(w.angle)),w.z+offset(w.course)+w.length,(ro+1)*Math.cos(rad(w.angle)))]:
        Array.from({length:129},(_,i)=>new THREE.Vector3((ro+1)*Math.sin(i*Math.PI/64),w.z+offset(w.course),(ro+1)*Math.cos(i*Math.PI/64)));
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:local?'#b76720':'#557e6a'}));line.userData.weldId=w.id;this.group.add(line);
    }
    if(['fit','weld'].includes(step))addShellSeamOverlays(r,THREE,this.group,{bodyBottom:0,offset,showZones:!explode});
    this.labels.update(shellSceneAnnotations(m,step,explode),tankDrawingModel(r).revision);
    if(first||shapeChanged)this.reset();this.resize();
  }
  reset(direction='iso'){
    if(!this.model)return;this.resize();const bounds=new THREE.Box3().setFromObject(this.group),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),radius=Math.max(1,size.length()/2),fov=THREE.MathUtils.degToRad(this.camera.fov),distance=radius/Math.sin(Math.min(fov/2,Math.atan(Math.tan(fov/2)*this.camera.aspect)))*1.12;
    const dir=direction==='end'?(this.model.horizontal?new THREE.Vector3(-1,0,0):new THREE.Vector3(0,1,.001)):new THREE.Vector3(1,.65,1.3).normalize();this.controls.target.copy(center);this.camera.position.copy(center).addScaledVector(dir,distance);this.camera.near=Math.max(.01,radius/10000);this.camera.far=radius*200;this.camera.updateProjectionMatrix();this.controls.minDistance=radius*.35;this.controls.maxDistance=radius*20;this.controls.update();
  }
  zoom(factor){const v=this.camera.position.clone().sub(this.controls.target);v.setLength(Math.max(this.controls.minDistance,Math.min(this.controls.maxDistance,v.length()*factor)));this.camera.position.copy(this.controls.target).add(v);this.controls.update();}
  selectDrawing(id){this.labels.select(id);for(const o of this.group.children)if(o.userData.weldId)o.material.color.set(o.userData.weldId===id?'#d34e21':o.userData.color??'#b76720');}
  dispose(){this.setActive(false);this.observer.disconnect();this.controls.dispose();this.labels.dispose();this.clear();this.renderer.dispose();}
}
