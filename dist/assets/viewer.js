import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { cylindricalUVToWorld, rotateAroundMain } from './geometry.js';
import { torusSurfacePoint, elbowFrame } from './elbow-geometry.js';
import { conicalSurfacePoint,conicalCoordinates } from './conical-geometry.js';

const TAU = Math.PI * 2;
const open = p => p.slice(0, -1);
const path = points => new THREE.Path(points.map(p => new THREE.Vector2(...p)));

function conicalSurface(c,p,offset,hole,inward=false){
  const center=(p.surfaceClock??0)*Math.PI/180,lo=center-Math.PI,hi=center+Math.PI,scale=Math.max(...c.outerRadii);
  const outer=[[0,scale*lo],[c.length,scale*lo],[c.length,scale*hi],[0,scale*hi],[0,scale*lo]],shape=new THREE.Shape(open(outer).map(q=>new THREE.Vector2(...q)));
  if(hole?.length)shape.holes=[path(open(hole).map(q=>[q[0],scale*(center+Math.atan2(Math.sin(Math.atan2(q[1],q[2])-center),Math.cos(Math.atan2(q[1],q[2])-center)))]))];
  const flat=new THREE.ShapeGeometry(shape),attr=flat.getAttribute('position'),indices=flat.index?.array??Array.from({length:attr.count},(_,i)=>i),positions=[],normals=[];
  const add=(a,b,d,depth=0)=>{const pairs=[[a,b,d],[b,d,a],[d,a,b]],size=e=>Math.abs(e[0][1]-e[1][1])/scale,worst=pairs.reduce((best,e)=>size(e)>size(best)?e:best);
    if(size(worst)>Math.PI/36&&depth<17){const[u,v,w]=worst,mid=u.map((x,i)=>(x+v[i])/2);add(u,mid,w,depth+1);add(mid,v,w,depth+1);return;}
    for(const[x,u]of[a,b,d]){const q=conicalSurfacePoint(x,u/scale,p,offset),normal=conicalCoordinates(q,p,offset).normal;positions.push(...q);normals.push(...normal.map(v=>inward?-v:v));}};
  for(let i=0;i<indices.length;i+=3)add(...Array.from(indices.slice(i,i+3),j=>[attr.getX(j),attr.getY(j)]));flat.dispose();const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));return geo;
}

function elbowSurface(e,r,hole,inward=false) {
  const phi=e.surfaceClock,lo=phi-Math.PI,hi=phi+Math.PI,R=e.bendRadius;
  const outer=[[0,r*lo],[R*e.bendAngle,r*lo],[R*e.bendAngle,r*hi],[0,r*hi],[0,r*lo]];
  const shape=new THREE.Shape(open(outer).map(p=>new THREE.Vector2(...p)));
  shape.holes=hole?.length?[path(open(hole))]:[];
  const flat=new THREE.ShapeGeometry(shape),attr=flat.getAttribute('position');
  const indices=flat.index?.array??Array.from({length:attr.count},(_,i)=>i),positions=[],normals=[];
  const add=(a,b,c,depth=0)=>{
    const pairs=[[a,b,c],[b,c,a],[c,a,b]],size=p=>Math.max(Math.abs(p[0][0]-p[1][0])/R,Math.abs(p[0][1]-p[1][1])/r);
    const worst=pairs.reduce((best,p)=>size(p)>size(best)?p:best);
    if(size(worst)>Math.PI/36&&depth<17){const[u,v,w]=worst,mid=u.map((x,i)=>(x+v[i])/2);add(u,mid,w,depth+1);add(mid,v,w,depth+1);return;}
    for(const [s,u]of[a,b,c]){const beta=s/R,angle=u/r,f=elbowFrame(beta,R);positions.push(...torusSurfacePoint(beta,angle,R,r));normals.push(...f.normal.map((v,i)=>(v*Math.cos(angle)+f.binormal[i]*Math.sin(angle))*(inward?-1:1)));}
  };
  for(let i=0;i<indices.length;i+=3)add(...Array.from(indices.slice(i,i+3),j=>[attr.getX(j),attr.getY(j)]));
  flat.dispose();const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));return geo;
}

function formedElbowPadSurface(pad,r,outer,hole,inward=false){
  const R=pad.bendRadius,shape=new THREE.Shape(open(outer).map(q=>new THREE.Vector2(...q)));shape.holes=[path(open(hole))];
  const flat=new THREE.ShapeGeometry(shape),attr=flat.getAttribute('position'),indices=flat.index?.array??Array.from({length:attr.count},(_,i)=>i),positions=[],normals=[];
  const add=(a,b,c,depth=0)=>{const pairs=[[a,b,c],[b,c,a],[c,a,b]],size=q=>Math.max(Math.abs(q[0][0]-q[1][0])/R,Math.abs(q[0][1]-q[1][1])/r),worst=pairs.reduce((v,q)=>size(q)>size(v)?q:v);if(size(worst)>Math.PI/36&&depth<17){const[u,v,w]=worst,mid=u.map((x,i)=>(x+v[i])/2);add(u,mid,w,depth+1);add(mid,v,w,depth+1);return;}for(const[x,u]of[a,b,c]){const beta=x/R,phi=u/r,f=elbowFrame(beta,R);positions.push(...torusSurfacePoint(beta,phi,R,r));normals.push(...f.normal.map((v,i)=>(v*Math.cos(phi)+f.binormal[i]*Math.sin(phi))*(inward?-1:1)));}};
  for(let i=0;i<indices.length;i+=3)add(...Array.from(indices.slice(i,i+3),j=>[attr.getX(j),attr.getY(j)]));flat.dispose();const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));return geo;
}

function surface(outer, holes, radius, azimuth, inward = false) {
  const shape = new THREE.Shape(open(outer).map(p => new THREE.Vector2(...p)));
  shape.holes = holes.map(h => path(open(h)));
  const flat = new THREE.ShapeGeometry(shape), attr = flat.getAttribute('position');
  const indices = flat.index?.array ?? Array.from({ length: attr.count }, (_, i) => i);
  const positions = [], normals = [];
  // Subdivide in angle before rolling the planar triangles onto the cylinder.
  const add = (a,b,c,depth=0) => {
    const pairs = [[a,b,c],[b,c,a],[c,a,b]];
    const worst = pairs.reduce((best,p) => Math.abs(p[0][1]-p[1][1]) > Math.abs(best[0][1]-best[1][1]) ? p : best);
    if (Math.abs(worst[0][1]-worst[1][1])/radius > Math.PI/36 && depth < 13) {
      const [u,v,w] = worst, mid = u.map((x,i)=>(x+v[i])/2);
      add(u,mid,w,depth+1); add(mid,v,w,depth+1); return;
    }
    for (const p of [a,b,c]) {
      positions.push(...cylindricalUVToWorld(p,radius,azimuth));
      const normal=rotateAroundMain([0,Math.sin(p[1]/radius),Math.cos(p[1]/radius)],azimuth);
      normals.push(...normal.map(v=>inward?-v:v));
    }
  };
  for(let i=0;i<indices.length;i+=3) {
    const tri=Array.from(indices.slice(i,i+3), j=>[attr.getX(j),attr.getY(j)]);
    add(...tri);
  }
  flat.dispose();
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  return geo;
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
    this.container=container; this.parts={}; this.view='iso'; this.result=null;
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
  mesh(geo,mat,group) {const mesh=new THREE.Mesh(geo,mat);group.add(mesh);return mesh;}
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
    this.model.clear();this.marker.visible=false;this.parts={};this.render();
  }
  update(result) {
    if(!this.available)return;
    const first=!this.result;this.result=result;this.clear();if(!result.valid)return;
    const {main:m,branch:b,pad,axes}=result.geometry,p=result.params;
    for(const id of ['main','branch','pad']) {const group=new THREE.Group();this.parts[id]=group;this.model.add(group);}
    const mainMat=this.material(0x8195ab),branchMat=this.material(0x55b9df),padMat=this.material(0xdba05b);
    if(p.hostType==='elbow') {
      const e=result.geometry.elbow;
      for(const[r,hole,inward]of[[e.outerRadius,e.outerHoleUV,false],[e.innerRadius,e.innerHoleUV,true]])this.mesh(elbowSurface(e,r,hole,inward),mainMat.clone(),this.parts.main);
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
      for(const[offset,hole,inward]of[[0,c.outerHole3D,false],[-p.mainWall,c.innerHole3D,true]])this.mesh(conicalSurface(c,p,offset,hole,inward),mainMat.clone(),this.parts.main);
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
      this.mesh(surface(outer,[hole],r,p.azimuth,inward),mainMat.clone(),this.parts.main);
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
    const fitModel=this.result?.valid?this.model:this.editor.group;
    fitModel.updateMatrixWorld(true);const box=new THREE.Box3();
    fitModel.traverse(object=>{if(!object.isMesh||!object.visible)return;object.geometry.computeBoundingBox();box.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));});
    if(box.isEmpty())return;const center=box.getCenter(new THREE.Vector3());
    const elbowPlan=(this.result?.params??this.editor.params).hostType==='elbow'&&view==='front';
    this.camera.up.set(0,elbowPlan?1:0,elbowPlan?0:1);
    const dir=elbowPlan?new THREE.Vector3(0,0,1):view==='front'?new THREE.Vector3(0,-1,.04):view==='side'?new THREE.Vector3(1,0,.04):new THREE.Vector3(1,-1.5,1.1).normalize();
    this.camera.position.copy(center).add(dir);this.camera.lookAt(center);this.camera.updateMatrixWorld();
    const inverse=this.camera.matrixWorldInverse, projected=[];
    fitModel.updateMatrixWorld(true);
    fitModel.traverse(object=>{
      const attr=object.geometry?.getAttribute('position');if(!object.isMesh||!object.visible||!attr)return;
      for(let i=0;i<attr.count;i++)projected.push(new THREE.Vector3().fromBufferAttribute(attr,i).applyMatrix4(object.matrixWorld).applyMatrix4(inverse));
    });
    const extent=axis=>{let low=Infinity,high=-Infinity;for(const point of projected){low=Math.min(low,point[axis]);high=Math.max(high,point[axis]);}return high-low;};
    const depth=extent('z')/2, halfAngle=Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2));
    const distance=(Math.max(extent('y'),extent('x')/this.camera.aspect)/2/halfAngle+depth)*1.12;
    this.controls.target.copy(center);this.camera.position.copy(center).addScaledVector(dir,distance);this.camera.near=Math.max(.1,distance/10000);this.camera.far=distance*20;
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
  render() {if(this.renderer&&this.scene&&this.camera){this.editor?.layout();this.renderer.render(this.scene,this.camera);}}
  image() {if(!this.available)return '';this.render();return this.renderer.domElement.toDataURL('image/png');}
}
