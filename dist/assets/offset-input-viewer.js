import * as THREE from 'three';
import {OffsetViewer} from './offset-viewer.js';
import {INPUT_CAMERA_VIEWS,inputPortFrame,layoutInputLabels} from './offset-input-model.js';
import {fmt} from './offset-exports.js';

const add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,s)=>a.map(v=>v*s);
const colors=['#b78336','#38856b','#3988ab'];

// Dedicated input camera: editing a field can rebuild geometry without moving the
// operator's viewpoint. OrbitControls never writes to the measurement parameters.
export class OffsetInputViewer extends OffsetViewer {
 constructor(host,{onSelect,onOrbit,onPreset,onFailure}={}){
  super(host,{jointLabels:false,onSelect});
  this.onSelect=onSelect;this.labels=[];this.cameraView='iso';
  this.controls.enablePan=false;this.controls.rotateSpeed=.7;
  this.controls.addEventListener('change',()=>this.positionLabels());
  this.controls.addEventListener('start',()=>onOrbit?.());
  const canvas=this.renderer.domElement;
  canvas.tabIndex=0;canvas.setAttribute('role','img');canvas.setAttribute('aria-label','可旋轉的管口與接法 3D。方向鍵旋轉，加減鍵縮放，F 鍵置中。');canvas.setAttribute('aria-describedby','port-scene-hint');
  canvas.addEventListener('keydown',event=>{
   if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','f','F'].includes(event.key))return;
   event.preventDefault();if(event.key.startsWith('Arrow'))onOrbit?.();
   if(event.key==='ArrowLeft')this.orbit(-.16,0);else if(event.key==='ArrowRight')this.orbit(.16,0);else if(event.key==='ArrowUp')this.orbit(0,-.12);else if(event.key==='ArrowDown')this.orbit(0,.12);else if(['+','='].includes(event.key))this.zoom(.8);else if(event.key==='-')this.zoom(1.25);else{this.fit();onPreset?.(this.cameraView);}
  });
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.setActive(false);onFailure?.();});
  this.overlay=document.createElement('div');this.overlay.className='input-model-labels';host.append(this.overlay);
  this.leaders=document.createElementNS('http://www.w3.org/2000/svg','svg');this.leaders.setAttribute('aria-hidden','true');this.overlay.append(this.leaders);
  this.compass=document.createElementNS('http://www.w3.org/2000/svg','svg');this.compass.setAttribute('viewBox','0 0 84 74');this.compass.setAttribute('role','img');this.compass.setAttribute('aria-label','XYZ 座標方向');this.compass.classList.add('input-model-compass');
  this.compassAxes=['X','Y','Z'].map((name,i)=>{const line=document.createElementNS('http://www.w3.org/2000/svg','line'),text=document.createElementNS('http://www.w3.org/2000/svg','text');line.setAttribute('stroke',colors[i]);line.setAttribute('stroke-width','1.7');text.setAttribute('fill',colors[i]);text.textContent=name;this.compass.append(line,text);return {line,text};});host.append(this.compass);
 }
 clear(){super.clear();for(const item of this.labels??[])item.button.remove();this.labels=[];this.leaders?.replaceChildren();}
 tag(text,point,key,kind,color){
  const button=document.createElement('button');button.type='button';button.className='input-model-tag '+kind;const chip=document.createElement('span');chip.textContent=text;button.append(chip);button.style.setProperty('--tag-color',color);
  button.setAttribute('aria-label',kind==='port'?text+'，更改朝向':kind==='joint'?text+'，填接合預留':text+'，修改尺寸');
  button.addEventListener('click',()=>this.onSelect?.(key));this.overlay.append(button);
  const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('stroke',color);this.leaders.append(line);
  this.labels.push({button,point:new THREE.Vector3(...point),line,kind});return button;
 }
 ring(point,axis,r,color,key){
  const mesh=new THREE.Mesh(new THREE.TorusGeometry(r,Math.max(r*.045,this.span*.0007),8,48),new THREE.MeshStandardMaterial({color,roughness:.65}));
  mesh.position.set(...point);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(...axis));mesh.userData.piece=key;this.group.add(mesh);return mesh;
 }
 updateInput(data,{task='position',joint=null,port=null}={}){
  if(!data)return;const first=!this.data;
  this.data=data;this.task=task;
  if(data.route){
   this.updateRoute(data.route,'offset',0,false);
   // Native projected labels stay readable on light backgrounds and are accessible.
   for(const node of [...this.group.children])if(node.isSprite){this.group.remove(node);node.material.map?.dispose();node.material.dispose();}
   for(const node of this.group.children)if(node.isMesh&&node.material?.color&&node.userData.piece)node.material.color.set(node.userData.piece.startsWith('P')?'#a6babc':node.userData.piece.startsWith('E')?'#56a8ad':'#cda05f');
  }else{
   this.clear();this.span=Math.max(Math.hypot(...data.marks.b),data.od*4,1);this.result={route:true};
   for(const end of ['a','b']){const f=inputPortFrame(data.axes[end]),stub=add(data.ports[end],mul(data.axes[end],-Math.max(data.od*1.4,this.span*.07)));this.mesh([{...f,center:stub},{...f,center:data.ports[end]}],data.od/2,'#7a9299').userData.piece='port:'+end;}
  }
  const radius=data.od/2;
  for(const end of ['a','b']){
   const center=data.ports[end],axis=data.axes[end],color=end==='a'?'#287775':'#416c9e';
   this.ring(center,axis,radius,port===end?'#c18b38':color,'port:'+end);
   const arrow=new THREE.ArrowHelper(new THREE.Vector3(...axis),new THREE.Vector3(...center),Math.max(data.od*.8,this.span*.055),color,.035*this.span,.018*this.span);this.group.add(arrow);
   this.tag(end.toUpperCase()+' 口',center,'port:'+end,'port',color).setAttribute('aria-pressed',String(port===end));
  }
  if(task==='position'){
   for(const [i,d] of data.dimensions.entries()){
    this.line([d.start,d.finish],colors[i],true);
    if(Math.abs(d.amount)>1e-8)this.tag(`${d.axis} ${fmt(d.amount)} mm`,mul(add(d.start,d.finish),.5),'dimension:'+d.key,'dimension',colors[i]);
   }
   if(data.marked)for(const end of ['a','b']){
    this.line([data.marks[end],data.ports[end]],'#8d9a94',true);
    const dot=new THREE.Mesh(new THREE.SphereGeometry(Math.max(radius*.12,this.span*.004),12,8),new THREE.MeshBasicMaterial({color:'#a1aaa4'}));dot.position.set(...data.marks[end]);this.group.add(dot);
   }
  }
  if(data.route)for(const j of data.route.joints){
   const point=mul(add(j.start,j.finish),.5),color=task==='gaps'&&j.id===joint?'#c58b32':'#bba67c';
   this.ring(point,j.direction,radius*1.04,color,'joint:'+j.id);
   if(task==='gaps'&&(data.route.joints.length<=8||j.id===joint))this.tag(j.id,point,'joint:'+j.id,'joint',color).setAttribute('aria-pressed',String(j.id===joint));
  }
  // A light reference floor gives depth without implying obstacles or clearances.
  const all=Object.values(data.ports),floor=Math.min(...all.map(p=>p[2]))-radius*1.4;
  const grid=new THREE.GridHelper(this.span*1.25,10,'#c7d7cf','#e2eae5');grid.rotation.x=Math.PI/2;grid.position.set((all[0][0]+all[1][0])/2,(all[0][1]+all[1][1])/2,floor);grid.material.transparent=true;grid.material.opacity=.45;this.scene.remove(this.grid);this.grid?.geometry.dispose();this.grid?.material.dispose();this.grid=grid;this.scene.add(grid);
  const bounds=new THREE.Box3().setFromPoints([...Object.values(data.ports),...Object.values(data.marks),...Object.entries(data.ports).map(([end,p])=>add(p,mul(data.axes[end],-data.od*2))),...(data.route?[data.route.envelope.min,data.route.envelope.max]:[])].map(p=>new THREE.Vector3(...p))).expandByScalar(radius);
  const nextFrame={center:bounds.getCenter(new THREE.Vector3()),span:Math.max(...bounds.getSize(new THREE.Vector3()).toArray(),1)};
  if(first)this.fit();else if(this.contentFrame){
   // Re-centre changing geometry while keeping the chosen orbit and zoom ratio.
   const delta=nextFrame.center.clone().sub(this.contentFrame.center),ratio=nextFrame.span/this.contentFrame.span,offset=this.camera.position.clone().sub(this.controls.target).multiplyScalar(ratio);
   this.controls.target.add(delta);this.camera.position.copy(this.controls.target).add(offset);this.camera.near=Math.max(.01,nextFrame.span/10000);this.camera.far=Math.max(10000,nextFrame.span*100);this.camera.updateProjectionMatrix();this.controls.minDistance=Math.max(data.od,nextFrame.span*.08);this.controls.maxDistance=Math.max(offset.length()*8,nextFrame.span*8);this.controls.update(0);this.positionLabels();
  }
  this.contentFrame=nextFrame;
 }
 fit(view=this.cameraView){
  if(!this.group)return;this.settle();this.resize();this.cameraView=view;
  const preset=INPUT_CAMERA_VIEWS[view]??INPUT_CAMERA_VIEWS.iso;
  this.camera.up.set(...preset.up);
  this.group.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(this.group);if(box.isEmpty())return;
  const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),span=Math.max(size.x,size.y,size.z,1),sight=new THREE.Vector3(...preset.sight).normalize();
  const right=new THREE.Vector3().crossVectors(this.camera.up,sight).normalize(),up=new THREE.Vector3().crossVectors(sight,right).normalize(),tan=Math.tan(this.camera.fov*Math.PI/360);let distance=1;
  const include=point=>{const q=point.sub(center);distance=Math.max(distance,q.dot(sight)+Math.abs(q.dot(up))/tan,q.dot(sight)+Math.abs(q.dot(right))/(tan*this.camera.aspect));};
  // Fit actual surfaces instead of empty bounding-box corners on a diagonal route.
  this.group.traverse(node=>{const positions=node.geometry?.getAttribute('position');if(positions)for(let i=0;i<positions.count;i++)include(new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(node.matrixWorld));});
  distance*=1.24;this.camera.position.copy(center).addScaledVector(sight,distance);this.camera.near=Math.max(.01,span/10000);this.camera.far=Math.max(10000,span*100);this.camera.updateProjectionMatrix();this.controls.target.copy(center);this.controls.minDistance=Math.max(this.data?.od??1,span*.08);this.controls.maxDistance=distance*8;this.controls.update(0);this.positionLabels();
 }
 resize(){super.resize();this.positionLabels();}
 positionLabels(){
  if(!this.labels?.length)return;const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.camera.updateMatrixWorld();const visibleLabels=[];
  for(const [i,axis] of (this.compassAxes??[]).entries()){const v=new THREE.Vector3(...[0,1,2].map(k=>k===i?1:0)).transformDirection(this.camera.matrixWorldInverse),x=36+v.x*24,y=42-v.y*24;axis.line.setAttribute('x1',36);axis.line.setAttribute('y1',42);axis.line.setAttribute('x2',x);axis.line.setAttribute('y2',y);axis.text.setAttribute('x',x+(v.x<-.1?-10:5));axis.text.setAttribute('y',y+(v.y<.1?12:-4));}
  // Labels share exact 3D anchors, then spread on screen to keep close joints legible.
  for(const item of this.labels){
   const p=item.point.clone().project(this.camera),visible=p.z>=-1&&p.z<=1&&Math.abs(p.x)<1.12&&Math.abs(p.y)<1.12;item.button.hidden=!visible;item.line.style.display=visible?'':'none';if(!visible)continue;
   visibleLabels.push({item,anchor:[(p.x+1)*w/2,(1-p.y)*h/2],width:item.button.offsetWidth||52,height:item.button.offsetHeight||36});
  }
  const placements=layoutInputLabels(visibleLabels,w,h);
  for(const [i,{item,anchor:[px,py]}] of visibleLabels.entries()){const {x,y,w:bw,h:bh}=placements[i];item.button.style.transform=`translate(${x}px,${y}px)`;item.line.setAttribute('x1',px);item.line.setAttribute('y1',py);item.line.setAttribute('x2',x+bw/2);item.line.setAttribute('y2',y+bh/2);}
 }
 dispose(){this.setActive(false);this.observer.disconnect();this.controls.dispose();this.clear();this.grid?.geometry.dispose();this.grid?.material.dispose();this.renderer.dispose();this.host.replaceChildren();}
}
