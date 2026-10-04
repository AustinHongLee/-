import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { cylindricalUVToWorld, rotateAroundMain } from './geometry.js';
import { torusSurfacePoint, elbowFrame } from './elbow-geometry.js';
import { conicalSurfacePoint,conicalCoordinates } from './conical-geometry.js';

import {jointViewCandidates} from './model-view.js';
import {positioningFrame} from './model-positioning.js';
import {forEachUVTriangle} from './display-tessellation.js';

const TAU = Math.PI * 2;
const open = p => p.slice(0, -1);
const path = points => new THREE.Path(points.map(p => new THREE.Vector2(...p)));

// Display-only tessellation keeps all boundary points. Fixed angular strips
// avoid recursively exploding the long triangles joining a small hole to a pipe.
function curvedSurface(shape,xStep,yStep,map,inward=false){
  const flat=new THREE.ShapeGeometry(shape),attr=flat.getAttribute('position'),points=Array.from({length:attr.count},(_,i)=>[attr.getX(i),attr.getY(i)]),indices=flat.index?.array??Array.from({length:attr.count},(_,i)=>i),positions=[],normals=[];
  forEachUVTriangle(points,indices,{xStep,yStep},(a,b,c)=>{for(const q of[a,b,c]){const {point,normal}=map(q);positions.push(...point);normals.push(...normal.map(v=>inward?-v:v));}});
  flat.dispose();const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));return geo;
}

function conicalSurface(c,p,offset,hole,inward=false){
  const center=(p.surfaceClock??0)*Math.PI/180,lo=center-Math.PI,hi=center+Math.PI,scale=Math.max(...c.outerRadii);
  const outer=[[0,scale*lo],[c.length,scale*lo],[c.length,scale*hi],[0,scale*hi],[0,scale*lo]],shape=new THREE.Shape(open(outer).map(q=>new THREE.Vector2(...q)));
  if(hole?.length)shape.holes=[path(open(hole).map(q=>[q[0],scale*(center+Math.atan2(Math.sin(Math.atan2(q[1],q[2])-center),Math.cos(Math.atan2(q[1],q[2])-center)))]))];
  return curvedSurface(shape,Infinity,scale*Math.PI/36,([x,u])=>{const point=conicalSurfacePoint(x,u/scale,p,offset);return {point,normal:conicalCoordinates(point,p,offset).normal};},inward);
}

function elbowSurface(e,r,hole,inward=false) {
  const phi=e.surfaceClock,lo=phi-Math.PI,hi=phi+Math.PI,R=e.bendRadius;
  const outer=[[0,r*lo],[R*e.bendAngle,r*lo],[R*e.bendAngle,r*hi],[0,r*hi],[0,r*lo]];
  const shape=new THREE.Shape(open(outer).map(p=>new THREE.Vector2(...p)));
  shape.holes=hole?.length?[path(open(hole))]:[];
  return curvedSurface(shape,R*Math.PI/36,r*Math.PI/36,([s,u])=>{const beta=s/R,angle=u/r,f=elbowFrame(beta,R);return {point:torusSurfacePoint(beta,angle,R,r),normal:f.normal.map((v,i)=>v*Math.cos(angle)+f.binormal[i]*Math.sin(angle))};},inward);
}

function formedElbowPadSurface(pad,r,outer,hole,inward=false){
  const R=pad.bendRadius,shape=new THREE.Shape(open(outer).map(q=>new THREE.Vector2(...q)));shape.holes=[path(open(hole))];
  return curvedSurface(shape,R*Math.PI/36,r*Math.PI/36,([x,u])=>{const beta=x/R,phi=u/r,f=elbowFrame(beta,R);return {point:torusSurfacePoint(beta,phi,R,r),normal:f.normal.map((v,i)=>v*Math.cos(phi)+f.binormal[i]*Math.sin(phi))};},inward);
}

function surface(outer, holes, radius, azimuth, inward = false) {
  const shape = new THREE.Shape(open(outer).map(p => new THREE.Vector2(...p)));
  shape.holes = holes.map(h => path(open(h)));
  return curvedSurface(shape,Infinity,radius*Math.PI/36,([x,u])=>({point:cylindricalUVToWorld([x,u],radius,azimuth),normal:rotateAroundMain([0,Math.sin(u/radius),Math.cos(u/radius)],azimuth)}),inward);
}

function loft(a,b) {
  const positions=[];
  for(let i=0;i<a.length-1;i++) positions.push(...a[i],...a[i+1],...b[i],...a[i+1],...b[i+1],...b[i]);
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.computeVertexNormals(); return geo;
}

export class JointViewer {
  constructor(container) {
    this.container=container; this.parts={}; this.pickMeshes=[]; this.view='joint'; this.result=null;
    this.flags={explode:false,transparent:false,section:false};
    try {
      this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
      this.renderer.localClippingEnabled=true;
      this.renderer.setClearColor(0x13253d,1);
      this.renderer.domElement.setAttribute('aria-label','可拖曳旋轉的主管、支管與補強板模型');
      this.renderer.domElement.setAttribute('role','img');
      container.querySelector('svg')?.remove();
      container.prepend(this.renderer.domElement);
      this.scene=new THREE.Scene();
      this.camera=new THREE.PerspectiveCamera(35,1,.1,100000);
      this.camera.up.set(0,0,1);
      this.controls=new OrbitControls(this.camera,this.renderer.domElement);
      this.controls.enableDamping=false;
      this.controls.addEventListener('change',()=>this.render());
      this.scene.add(new THREE.HemisphereLight(0xcfe9ff,0x26323b,2.3));
      const key=new THREE.DirectionalLight(0xffffff,3.3);key.position.set(400,-600,900);this.scene.add(key);
      const fill=new THREE.DirectionalLight(0xaad6ff,2);fill.position.set(-400,600,100);this.scene.add(fill);
      this.model=new THREE.Group();this.scene.add(this.model);
      this.marker=new THREE.Mesh(new THREE.SphereGeometry(3,16,12),new THREE.MeshBasicMaterial({color:0xffcf6a,depthTest:false}));
      this.marker.renderOrder=20;this.marker.visible=false;this.scene.add(this.marker);
      this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.resize();
      this.available=true;
    } catch(error) {
      this.available=false;
      container.querySelector('svg')?.remove();
      const message=document.createElement('div');message.className='viewer-fallback';message.textContent='3D 無法啟用。請使用支援 WebGL 的瀏覽器；下方展開圖與幾何驗證仍可操作。';container.append(message);
      container.querySelector('.viewer-hint').textContent='此瀏覽器無法啟用 3D；幾何計算與圖面匯出仍可使用。';
    }
  }
  resize() {
    if(!this.renderer)return;
    const {width,height}=this.container.getBoundingClientRect();
    if(width<=0||height<=0)return;
    this.renderer.setSize(width,height,false);this.camera.aspect=width/Math.max(1,height);this.camera.updateProjectionMatrix();this.render();
  }
  material(color) {return new THREE.MeshStandardMaterial({color,roughness:.48,metalness:.35,side:THREE.DoubleSide});}
  mesh(geo,mat,group) {geo.computeBoundingBox();const mesh=new THREE.Mesh(geo,mat);mesh.userData.part=group.name;group.add(mesh);this.pickMeshes.push(mesh);return mesh;}
  intersectModel(ray){if(!this.model.visible)return null;this.model.updateMatrixWorld(true);return ray.intersectObjects(this.pickMeshes.filter(mesh=>mesh.visible&&mesh.parent.visible),false)[0]??null;}
  line(points,color,group,dashed=false) {
    const geo=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p)));
    const mat=dashed?new THREE.LineDashedMaterial({color,dashSize:5,gapSize:3}):new THREE.LineBasicMaterial({color});
    const line=new THREE.Line(geo,mat);if(dashed)line.computeLineDistances();group.add(line);return line;
  }
  label(text,point,group,size=30){
    const canvas=document.createElement('canvas');canvas.width=192;canvas.height=80;const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffffed';ctx.fillRect(0,0,192,80);ctx.fillStyle='#173b5c';ctx.font='bold 44px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,96,40);
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),depthTest:false}));sprite.position.set(...point);sprite.scale.set(size*2.4,size,1);sprite.renderOrder=12;group.add(sprite);
  }
  clear() {
    if(!this.available)return;
    this.model.traverse(item=>{item.geometry?.dispose();if(item.material){item.material.map?.dispose();item.material.dispose();}});
    this.model.clear();this.marker.visible=false;this.parts={};this.pickMeshes=[];if(this.editor)this.editor.layoutKey=null;this.render();
  }
  update(result) {
    if(!this.available)return;
    const first=!this.result;this.result=result;this.clear();if(!result.valid)return;
    const {main:m,branch:b,pad,axes}=result.geometry,p=result.params;
    for(const id of ['main','branch','pad']) {const group=new THREE.Group();group.name=id;this.parts[id]=group;this.model.add(group);}
    const mainMat=this.material(0x8195ab),branchMat=this.material(0x55b9df),padMat=this.material(0xdba05b);
    if(p.hostType==='elbow') {
      const e=result.geometry.elbow;
      for(const[r,hole,inward]of[[e.outerRadius,e.outerHoleUV,false],[e.innerRadius,e.innerHoleUV,true]])this.mesh(elbowSurface(e,r,hole,inward),mainMat.clone(),this.parts.main).userData.pickSurface=inward?'mother-inner':'mother-outer';
      if(e.motherOpening!==false)this.mesh(loft(e.outerHole3D,e.innerHole3D),mainMat.clone(),this.parts.main);
      const ring=(beta,r)=>Array.from({length:97},(_,i)=>torusSurfacePoint(beta,TAU*i/96,e.bendRadius,r));
      for(const beta of[0,e.bendAngle]){this.mesh(loft(ring(beta,e.outerRadius),ring(beta,e.innerRadius)),mainMat.clone(),this.parts.main);this.line(ring(beta,e.outerRadius),0xa7bbd0,this.parts.main);}
      if(e.motherOpening===false)this.line(e.outerContact3D,0xe5a343,this.parts.main,true);else this.line(e.outerHole3D,0xc4d4e8,this.parts.main);
      for(const phi of[0,Math.PI])this.line(Array.from({length:65},(_,i)=>torusSurfacePoint(e.bendAngle*i/64,phi,e.bendRadius,e.outerRadius+.3)),0x677e99,this.parts.main,true);
      const a=elbowFrame(0,e.bendRadius),end=elbowFrame(e.bendAngle,e.bendRadius),labelSize=Math.max(12,p.mainOD*.12);
      this.label('A 端',a.center.map((v,i)=>v-a.tangent[i]*labelSize*1.5),this.parts.main,labelSize);
      if(axes.reference){const ref=axes.reference,len=b.axisEnd+p.mainOD,guide=this.line([ref.center,axes.branchOrigin.map((v,i)=>v+axes.branchDirection[i]*len)],0xffd16a,this.parts.main,true);guide.material.depthTest=false;guide.renderOrder=10;}
      this.label('B 端',end.center.map((v,i)=>v+end.tangent[i]*labelSize*1.5),this.parts.main,labelSize);
    } else if(p.hostType==='cone'){
      const c=result.geometry.conical;
      for(const[offset,hole,inward]of[[0,c.outerHole3D,false],[-p.mainWall,c.innerHole3D,true]])this.mesh(conicalSurface(c,p,offset,hole,inward),mainMat.clone(),this.parts.main).userData.pickSurface=inward?'mother-inner':'mother-outer';
      if(c.motherOpening!==false)this.mesh(loft(c.outerHole3D,c.innerHole3D),mainMat.clone(),this.parts.main);
      const ring=(x,offset)=>Array.from({length:97},(_,i)=>conicalSurfacePoint(x,TAU*i/96,p,offset));
      for(const x of[0,c.length]){this.mesh(loft(ring(x,0),ring(x,-p.mainWall)),mainMat.clone(),this.parts.main);this.line(ring(x,0),0xa7bbd0,this.parts.main);}
      this.line(c.motherOpening===false?c.outerContact3D:c.outerHole3D,c.motherOpening===false?0xe5a343:0xc4d4e8,this.parts.main,c.motherOpening===false);
      const seam=c.mapping.seamAngle;this.line([conicalSurfacePoint(0,seam,p,.3),conicalSurfacePoint(c.length,seam,p,.3)],0x677e99,this.parts.main,true);
      const size=Math.max(12,Math.min(...c.outerRadii)*.24);this.label('A 端',[-size*1.5,0,0],this.parts.main,size);this.label('B 端',[c.length+size*1.5,0,0],this.parts.main,size);
    } else {
    const ring=(x,r)=>Array.from({length:97},(_,i)=>cylindricalUVToWorld([x,r*(-Math.PI+TAU*i/96)],r,p.azimuth));
    for(const [r,hole,inward] of [[m.outerRadius,m.outerHoleUV,false],[m.innerRadius,m.innerHoleUV,true]]) {
      const outer=[[0,-Math.PI*r],[m.length,-Math.PI*r],[m.length,Math.PI*r],[0,Math.PI*r],[0,-Math.PI*r]];
      this.mesh(surface(outer,[hole],r,p.azimuth,inward),mainMat.clone(),this.parts.main).userData.pickSurface=inward?'mother-inner':'mother-outer';
    }
    this.mesh(loft(m.outerHole3D,m.innerHole3D),mainMat.clone(),this.parts.main);
    for(const x of [0,m.length]) {
      this.mesh(loft(ring(x,m.outerRadius),ring(x,m.innerRadius)),mainMat.clone(),this.parts.main);
      this.line(ring(x,m.outerRadius),0xa7bbd0,this.parts.main);
    }
    this.line(m.outerHole3D,0xc4d4e8,this.parts.main);
    const seam=[cylindricalUVToWorld([0,-Math.PI*m.outerRadius],m.outerRadius+.3,p.azimuth),cylindricalUVToWorld([m.length,-Math.PI*m.outerRadius],m.outerRadius+.3,p.azimuth)];
    this.line(seam,0x677e99,this.parts.main,true);
    }
    for(const [a,c] of [[b.outerCut,b.outerEnd],[b.innerCut,b.innerEnd],[b.outerCut,b.innerCut],[b.outerEnd,b.innerEnd]])this.mesh(loft(a,c),branchMat.clone(),this.parts.branch);
    this.line(b.outerCut,0xa7e8ff,this.parts.branch);this.line(b.outerEnd,0xa7e8ff,this.parts.branch);
    this.line([b.outerCut[0],b.outerEnd[0]],0xc6f0ff,this.parts.branch,true);
    if(pad?.hostType==='elbow'){
      this.mesh(formedElbowPadSurface(pad,pad.innerRadius,pad.innerBoundaryUV,pad.innerHoleUV,true),padMat.clone(),this.parts.pad);
      this.mesh(formedElbowPadSurface(pad,pad.outerRadius,pad.outerBoundaryUV,pad.outerHoleUV),padMat.clone(),this.parts.pad);
      this.mesh(loft(pad.innerBoundary3D,pad.outerBoundary3D),padMat.clone(),this.parts.pad);
      this.mesh(loft(pad.innerHole3D,pad.outerHole3D),padMat.clone(),this.parts.pad);
      this.line(pad.outerBoundary3D,0xffd099,this.parts.pad);this.line(pad.outerHole3D,0xffd099,this.parts.pad);
      for(const line of pad.splitReference3D??[])this.line(line,0x72491d,this.parts.pad);
    }else if(pad) {
      const basisRadius=pad.developmentRadius??pad.neutralRadius;
      const innerOuter=pad.outerUV.map(([x,u])=>[x,u*pad.innerRadius/basisRadius]);
      const outerOuter=pad.outerUV.map(([x,u])=>[x,u*pad.outerRadius/basisRadius]);
      const formed=pad.manufacturing==='formed-normal';
      const innerHole=formed?pad.cutHoleUV.map(([x,u])=>[x,u*pad.innerRadius/basisRadius]):pad.innerHoleUV;
      const outerHole=formed?pad.cutHoleUV.map(([x,u])=>[x,u*pad.outerRadius/basisRadius]):pad.outerHoleUV;
      const innerHole3D=formed?pad.cutHoleInner3D:pad.innerHole3D,outerHole3D=formed?pad.cutHoleOuter3D:pad.outerHole3D;
      this.mesh(surface(innerOuter,[innerHole],pad.innerRadius,p.azimuth,true),padMat.clone(),this.parts.pad);
      this.mesh(surface(outerOuter,[outerHole],pad.outerRadius,p.azimuth),padMat.clone(),this.parts.pad);
      const a=innerOuter.map(uv=>cylindricalUVToWorld(uv,pad.innerRadius,p.azimuth));
      const c=outerOuter.map(uv=>cylindricalUVToWorld(uv,pad.outerRadius,p.azimuth));
      this.mesh(loft(a,c),padMat.clone(),this.parts.pad);this.mesh(loft(innerHole3D,outerHole3D),padMat.clone(),this.parts.pad);
      this.line(c,0xffd099,this.parts.pad);this.line(outerHole3D,0xffd099,this.parts.pad);
      // Trace actual split-piece boundaries on the formed outer face.
      if(pad.split!=='single')for(const t of result.templates.filter(t=>t.id.startsWith('pad-'))) {
        const uv=t.mapping.paperAxes==='u-x'
          ?t.outer.map(([u,x])=>[x+t.mapping.origin[1],u+t.mapping.origin[0]])
          :t.outer.map(([x,u])=>[x+t.mapping.origin[0],u+t.mapping.origin[1]]);
        this.line(uv.map(([x,u])=>cylindricalUVToWorld([x,(u/basisRadius)*(pad.outerRadius+.2)],pad.outerRadius+.2,p.azimuth)),0x72491d,this.parts.pad);
      }
    }
    mainMat.dispose();branchMat.dispose();padMat.dispose();
    // The branch's 0° seam appears as a dashed line matching the wrap template.
    this.applyFlags();if(first)this.fit();this.render();
  }
  applyFlags() {
    if(!this.result?.valid||!this.available)return;
    const p=this.result.params,d=this.result.geometry.axes.branchDirection;
    this.parts.branch.position.set(...d.map(v=>v*(this.flags.explode?70:0)));
    const outward=this.result.geometry.pad?.hostType==='elbow'?this.result.geometry.axes.hostNormal.map(v=>v*(this.flags.explode?35:0)):rotateAroundMain([0,0,this.flags.explode?35:0],p.azimuth);this.parts.pad.position.set(...outward);
    const origin=this.result.geometry.axes.branchOrigin??[0,0,0],local=p.hostType==='elbow'||p.hostType==='cone',normal=local?this.result.geometry.axes.station90:rotateAroundMain([0,1,0],p.azimuth);
    const plane=new THREE.Plane(new THREE.Vector3(...normal),local?-normal.reduce((sum,v,i)=>sum+v*origin[i],0):-p.offset);
    this.model.traverse(o=>{if(o.isMesh){o.material.transparent=this.flags.transparent;o.material.opacity=this.flags.transparent?.32:1;o.material.depthWrite=!this.flags.transparent;o.material.clippingPlanes=this.flags.section?[plane]:[];o.material.needsUpdate=true;}});
    this.render();
  }
  setFlag(name,value) {this.flags[name]=value;this.applyFlags();}
  setLayer(name,value) {if(this.parts[name]){this.parts[name].visible=value;this.render();}}
  fit(view=this.view) {
    if(!this.available||!this.result?.valid&&!this.editor?.host)return;
    this.resize();
    this.view=view;
    const displayingProxy=this.editor?.host&&!this.model.visible;
    const fitModel=displayingProxy?this.editor.group:this.result?.valid?this.model:this.editor.group;
    fitModel.updateMatrixWorld(true);const box=new THREE.Box3();
    fitModel.traverse(object=>{if(!object.isMesh||!object.visible)return;if(!object.geometry.boundingBox)object.geometry.computeBoundingBox();box.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));});
    if(box.isEmpty())return;const center=box.getCenter(new THREE.Vector3());
    const params=displayingProxy?{...this.editor.params,...this.editor.draft}:this.result?.params??this.editor.params,frame=view==='joint'?positioningFrame(params):null;
    let candidates=frame?jointViewCandidates(params):null;
    if(candidates){
      const radius=Math.max(params.mainOD,params.branchOD),origin=new THREE.Vector3(...frame.origin),tip=this.editor?.tip??frame.origin.map((v,i)=>v+frame.direction[i]*params.branchLength);
      center.copy(origin).lerp(new THREE.Vector3(...tip),.28);
      // Contact-oriented views also account for an elbow's other arm.
      this.editor?.group?.updateMatrixWorld(true);
      const host=this.editor?.host;
      if(host){const distance=Math.max(box.getSize(new THREE.Vector3()).length()*3,radius*4);candidates=candidates.map(c=>{const eye=origin.clone().addScaledVector(new THREE.Vector3(...c.direction),distance),ray=new THREE.Raycaster(eye,origin.clone().sub(eye).normalize()),hit=ray.intersectObject(host,false)[0];return {...c,visible:!hit||eye.distanceTo(origin)-hit.distance<params.mainOD*.02};}).sort((a,b)=>Number(b.visible)-Number(a.visible)||b.score-a.score);}
    }
    const elbowPlan=(this.result?.params??this.editor.params).hostType==='elbow'&&view==='front';
    if(candidates)this.camera.up.set(...candidates[0].up);else this.camera.up.set(0,elbowPlan?1:0,elbowPlan?0:1);
    const dir=candidates?new THREE.Vector3(...candidates[0].direction):elbowPlan?new THREE.Vector3(0,0,1):view==='front'?new THREE.Vector3(0,-1,.04):view==='side'?new THREE.Vector3(1,0,.04):new THREE.Vector3(1,-1.5,1.1).normalize();
    this.camera.position.copy(center).add(dir);this.camera.lookAt(center);this.camera.updateMatrixWorld();
    const inverse=this.camera.matrixWorldInverse, projected=[];
    fitModel.updateMatrixWorld(true);
    fitModel.traverse(object=>{
      if(!object.isMesh||!object.visible)return;
      const mother=object===this.editor?.host||object.parent===this.parts.main||this.parts.main&&(()=>{let p=object;while(p&&p!==this.parts.main)p=p.parent;return !!p;})();
      // Conservative bounding-box corners fit every visible part without a
      // vertex-by-vertex scan. Joint view uses the local mother context below.
      if(candidates&&mother)return;const bounds=object.geometry.boundingBox;
      for(const x of[bounds.min.x,bounds.max.x])for(const y of[bounds.min.y,bounds.max.y])for(const z of[bounds.min.z,bounds.max.z])projected.push(new THREE.Vector3(x,y,z).applyMatrix4(object.matrixWorld).applyMatrix4(inverse));
    });
    if(candidates)for(const t of [-.55,.55])for(const s of [-.4,.4])for(const n of [-.15,.15])projected.push(new THREE.Vector3(...frame.origin.map((v,i)=>v+params.mainOD*(t*frame.tangent[i]+s*frame.side[i]+n*frame.normal[i]))).applyMatrix4(inverse));
    const extent=axis=>{let low=Infinity,high=-Infinity;for(const point of projected){low=Math.min(low,point[axis]);high=Math.max(high,point[axis]);}return high-low;};
    const depth=extent('z')/2, halfAngle=Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2));
    const screenRadius=candidates?projected.reduce((r,p)=>Math.max(r,Math.abs(p.y),Math.abs(p.x)/this.camera.aspect),0):Math.max(extent('y'),extent('x')/this.camera.aspect)/2;
    const distance=(screenRadius/halfAngle+depth)*1.12;
    this.controls.target.copy(center);this.camera.position.copy(center).addScaledVector(dir,distance);this.camera.near=Math.max(.1,distance/10000);this.camera.far=Math.max(distance,box.getSize(new THREE.Vector3()).length())*20;
    this.camera.updateProjectionMatrix();this.controls.update();this.render();
  }
  highlight(index) {
    if(!this.available||!this.result?.valid)return;
    const pts=this.result.geometry.branch.outerCut,pt=pts[Math.min(pts.length-1,index)];
    this.marker.position.set(...pt);this.marker.position.add(this.parts.branch.position);this.marker.visible=true;this.render();
  }
  highlightPoint(point) {
    if(!this.available||!this.result?.valid||!Array.isArray(point)||point.length!==3)return;
    this.marker.position.set(...point);this.marker.position.add(this.parts.branch.position);this.marker.visible=true;this.render();
  }
  highlightMother(point){if(!this.available||!this.result?.valid)return;this.marker.position.set(...point);this.marker.visible=true;this.render();}
  draw(){if(this.renderer&&this.scene&&this.camera){this.editor?.layout();this.renderer.render(this.scene,this.camera);}}
  render(){if(this.frameRequest||!this.renderer)return;this.frameRequest=requestAnimationFrame(()=>{this.frameRequest=null;this.draw();});}
  image(){if(!this.available)return '';if(this.frameRequest){cancelAnimationFrame(this.frameRequest);this.frameRequest=null;}this.draw();return this.renderer.domElement.toDataURL('image/png');}
}
