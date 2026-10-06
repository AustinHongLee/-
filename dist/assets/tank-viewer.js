import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {pieceColor} from './tank-visuals.js';
export class TankViewer{
  constructor(host,onSelect=()=>{},onNozzle=()=>{}){
    this.host=host;this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#eef4f7');this.camera=new THREE.PerspectiveCamera(40,1,.1,1e7);this.renderer=new THREE.WebGLRenderer({antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));host.replaceChildren(this.renderer.domElement);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.autoRotateSpeed=.8;
    this.scene.add(new THREE.HemisphereLight(0xffffff,0x687e8a,2.5));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(1,3,4);this.scene.add(light);this.group=new THREE.Group();this.scene.add(this.group);
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);this.resize();this.setActive(true);
    this.raycaster=new THREE.Raycaster();let down=null;this.renderer.domElement.addEventListener('pointerdown',event=>{down={x:event.clientX,y:event.clientY};});this.renderer.domElement.addEventListener('pointerup',event=>{const start=down;down=null;if(!start||Math.hypot(event.clientX-start.x,event.clientY-start.y)>6)return;const box=this.renderer.domElement.getBoundingClientRect();this.raycaster.setFromCamera(new THREE.Vector2((event.clientX-box.left)/box.width*2-1,-(event.clientY-box.top)/box.height*2+1),this.camera);const hit=this.raycaster.intersectObjects(this.group.children.filter(item=>item.isMesh))[0];if(hit?.object.userData.nozzleId)onNozzle(hit.object.userData.nozzleId);else if(hit?.object.userData.pieceId)onSelect(hit.object.userData.pieceId);});this.renderer.domElement.addEventListener('pointercancel',()=>{down=null;});
  }
  resize(){const {width,height}=this.host.getBoundingClientRect();if(!width||!height)return;this.renderer.setSize(width,height);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();}
  setActive(active){this.controls.enabled=active;let previous=null;this.renderer.setAnimationLoop(active?time=>{const dt=previous===null?0:Math.min((time-previous)/1000,.05);previous=time;this.controls.update(dt);this.renderer.render(this.scene,this.camera);}:null);}
  setSpin(value){this.controls.autoRotate=value;}
  setTransparent(value){for(const item of this.group.children)if(item.isMesh){item.material.transparent=value;item.material.opacity=value?.48:1;item.material.depthWrite=!value;}}
  setSelected(id){this.selected=id;for(const item of this.group.children)if(item.userData.pieceId){item.material.color.set(item.userData.pieceId===id?'#efbd65':item.userData.color);}}
  setNozzleSelected(id){this.selectedNozzle=id;for(const item of this.group.children)if(item.userData.nozzleId)item.material.color.set(item.userData.nozzleId===id?'#e6ad51':item.userData.color);}
  reset(){const r=this.result;if(!r)return;const bounds=new THREE.Box3().setFromObject(this.group),center=bounds.getCenter(new THREE.Vector3()),dimensions=bounds.getSize(new THREE.Vector3()),size=Math.max(dimensions.x,dimensions.y,dimensions.z,1);this.controls.target.copy(center);this.camera.position.copy(center).add(new THREE.Vector3(size*1.4,size*.8,size*1.6));this.camera.near=Math.max(.01,size/10000);this.camera.far=size*100;this.camera.updateProjectionMatrix();this.controls.minDistance=size*.25;this.controls.maxDistance=size*10;this.controls.update();}
  update(r){
    this.result=r;while(this.group.children.length){const item=this.group.children[0];this.group.remove(item);item.geometry?.dispose();item.material?.dispose();}
    const p=r.input,rad=r.di/2,ell=p.shape==='elliptical',base=ell?r.headDepth+p.endThickness:p.endThickness;
    const mesh=(geometry,y=0,color='#84b0c5')=>{const m=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,metalness:.35,roughness:.45,side:THREE.DoubleSide}));m.position.y=y;this.group.add(m);return m;};
    const bodyBottom=base+(ell?p.headStraight+p.headGap:0),outer=rad+p.shellThickness;
    // Bound rendering complexity; the full piece list remains in the estimate and CSV.
    if(r.assembly.length<=500){for(const piece of r.assembly){const angle=piece.start/r.circumference*Math.PI*2,span=piece.length/r.circumference*Math.PI*2,color=pieceColor(piece.id),m=mesh(new THREE.CylinderGeometry(outer,outer,piece.height,Math.max(4,Math.ceil(span/Math.PI*36)),1,true,angle,span),bodyBottom+piece.z+piece.height/2,color);m.userData={pieceId:piece.id,color};
      const points=[new THREE.Vector3(outer*Math.sin(angle),bodyBottom+piece.z,outer*Math.cos(angle)),new THREE.Vector3(outer*Math.sin(angle),bodyBottom+piece.z+piece.height,outer*Math.cos(angle))];this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:'#456477'})));
    }}else mesh(new THREE.CylinderGeometry(outer,outer,r.bodyHeight,72,1,true),bodyBottom+r.bodyHeight/2);
    for(let i=1;i<r.courses;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(outer+.5,Math.max(r.di/800,1),6,96),new THREE.MeshBasicMaterial({color:'#477f99'}));ring.rotation.x=Math.PI/2;ring.position.y=bodyBottom+i*(r.courseHeight+p.gap)-p.gap/2;this.group.add(ring);}
    if(ell){for(const [sign,y] of [[-1,base],[1,base+r.height]]){const profile=[];for(let i=0;i<=48;i++){const t=i/48*Math.PI/2;profile.push(new THREE.Vector2((rad+p.endThickness)*Math.sin(t),sign*(r.headDepth+p.endThickness)*Math.cos(t)));}mesh(new THREE.LatheGeometry(profile,72),y,'#aec9d7');if(p.headStraight)mesh(new THREE.CylinderGeometry(rad+p.endThickness,rad+p.endThickness,p.headStraight,72,1,true),y-sign*p.headStraight/2,'#aec9d7');}}
    else {const er=rad+p.shellThickness+p.overhang;mesh(new THREE.CylinderGeometry(er,er,p.endThickness,72),p.endThickness/2,'#adc8d6');if(p.shape==='flat')mesh(new THREE.CylinderGeometry(er,er,p.endThickness,72),base+r.height+p.endThickness/2,'#adc8d6');}
    for(const n of r.nozzlePlan?.items??[]){const direction=new THREE.Vector3(...n.direction),start=new THREE.Vector3(...n.pipeStart),end=new THREE.Vector3(...n.pipeEnd),axis=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction),add=(geometry,point,color)=>{const m=mesh(geometry,0,color);m.position.copy(point);m.quaternion.copy(axis);m.userData={nozzleId:n.id,color};return m;},length=start.distanceTo(end),center=start.clone().add(end).multiplyScalar(.5);
      add(new THREE.CylinderGeometry(n.od/2,n.od/2,length,32,1,true),center,'#739caf');add(new THREE.CylinderGeometry(n.od/2-n.thickness,n.od/2-n.thickness,length,32,1,true),center,'#7892a0');
      if(n.end!=='bare'){const face=new THREE.Vector3(...n.face),shape=new THREE.Shape();shape.absarc(0,0,n.flangeOD/2,0,Math.PI*2,false);const bore=new THREE.Path();bore.absarc(0,0,n.od/2,0,Math.PI*2,true);shape.holes.push(bore);const disk=mesh(new THREE.ExtrudeGeometry(shape,{depth:n.flangeThickness,bevelEnabled:false,curveSegments:32}),0,'#cdb17f');disk.position.copy(face.clone().addScaledVector(direction,-n.flangeThickness));disk.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),direction);disk.userData={nozzleId:n.id,color:'#cdb17f'};
        const neckLength=n.flangeLength-n.flangeThickness;if(neckLength>0)add(new THREE.CylinderGeometry(Math.min(n.flangeOD*.4,n.od*.72),n.od/2,neckLength,32,1,true),face.clone().addScaledVector(direction,-n.flangeThickness-neckLength/2),'#bca577');}
    }
    this.setSelected(this.selected);this.setNozzleSelected(this.selectedNozzle);this.reset();
  }
}
