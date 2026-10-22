import * as THREE from 'three';
import {OffsetViewer} from './offset-viewer.js';
import {layoutInputLabels} from './offset-input-model.js';

// Native callouts follow the animated objects, rather than stacking camera-facing
// sprites at the port. Part IDs are an optional inspection layer.
export class OffsetInstallationViewer extends OffsetViewer {
 constructor(host,options={}){
  super(host,options);this.tags=[];this.tagSelect=options.onSelect;this.showParts=false;
  this.overlay=document.createElement('div');this.overlay.className='installation-model-labels';this.leaders=document.createElementNS('http://www.w3.org/2000/svg','svg');this.leaders.setAttribute('aria-hidden','true');this.overlay.append(this.leaders);host.append(this.overlay);
  this.compass=document.createElementNS('http://www.w3.org/2000/svg','svg');this.compass.classList.add('installation-model-compass');this.compass.setAttribute('viewBox','0 0 84 74');this.compass.setAttribute('role','img');this.compass.setAttribute('aria-label','XYZ 座標方向');this.compassAxes=['X','Y','Z'].map((name,i)=>{const line=document.createElementNS('http://www.w3.org/2000/svg','line'),text=document.createElementNS('http://www.w3.org/2000/svg','text'),color=['#b78336','#38856b','#3988ab'][i];line.setAttribute('stroke',color);text.setAttribute('fill',color);text.textContent=name;this.compass.append(line,text);return {line,text};});host.append(this.compass);
  this.controls.addEventListener('change',()=>this.positionLabels());
 }
 label(text,position,color){
  const anchor=new THREE.Object3D();anchor.position.set(...position);this.group.add(anchor);
  const port=/^[AB] 口$/.test(text),joint=/^J\d+$/.test(text),component=/^C\d+$/.test(text),unknown=component&&this.componentSpecs?.[text]==null,tag=document.createElement(joint?'button':'span');tag.className='installation-model-tag'+(port?' port':'')+(unknown?' unknown':'');tag.textContent=port?'既有 '+text:component?text+(unknown?' 外包未填':' 外包'):text;
  if(joint){tag.type='button';tag.setAttribute('aria-label',text+'，查看接合淨空');tag.addEventListener('click',()=>this.tagSelect?.(text));}
  const line=document.createElementNS('http://www.w3.org/2000/svg','line');this.leaders.append(line);this.overlay.append(tag);this.tags.push({anchor,tag,line,port,component,obstacle:/^O\d/.test(text)});return anchor;
 }
 updateInstallation(plan,inspection,...args){this.componentSpecs=inspection?.spec?.componentOD??{};super.updateInstallation(plan,inspection,...args);}
 clear(){super.clear();for(const item of this.tags??[]){item.tag.remove();item.line.remove();}this.tags=[];}
 setPartLabels(show){this.showParts=show;this.positionLabels();}
 fit(direction=[1,-1,.85]){
  this.fitting=true;this.settle();this.resize();this.group.updateMatrixWorld(true);const points=[];
  this.group.traverse(node=>{const positions=node.geometry?.getAttribute('position');if(positions)for(let i=0;i<positions.count;i++)points.push(new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(node.matrixWorld));});
  // Frame both complete poses, including pipe radii. Fitting only the starting
  // surfaces and the target centreline can clip a closing end on narrow screens.
  for(const {node,base} of this.installationNodes??[]){const positions=node.geometry?.getAttribute('position');if(!positions)continue;for(let i=0;i<positions.count;i++){const p=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(node.matrixWorld).sub(node.position).add(base);points.push(p,p.clone().add(new THREE.Vector3(...this.installationOffset)));}}
  if(points.length){
   const box=new THREE.Box3().setFromPoints(points),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),span=Math.max(...size.toArray(),1),sight=new THREE.Vector3(...direction).normalize(),right=new THREE.Vector3().crossVectors(this.camera.up,sight).normalize(),up=new THREE.Vector3().crossVectors(sight,right).normalize(),tan=Math.tan(this.camera.fov*Math.PI/360);let distance=1;
   for(const point of points){const q=point.clone().sub(center);distance=Math.max(distance,q.dot(sight)+Math.abs(q.dot(up))/tan,q.dot(sight)+Math.abs(q.dot(right))/(tan*this.camera.aspect));}
   distance*=1.2;this.camera.position.copy(center).addScaledVector(sight,distance);this.camera.near=Math.max(.01,span/10000);this.camera.far=Math.max(10000,span*100);this.camera.updateProjectionMatrix();this.controls.target.copy(center);this.controls.minDistance=span*.12;this.controls.maxDistance=distance*6;this.controls.update(0);
  }
  this.fitting=false;this.positionLabels();
 }
 setInstallationProgress(progress){super.setInstallationProgress(progress);this.positionLabels();}
 resize(){const before=this.viewportAspect;super.resize();if(before&&before!==this.viewportAspect&&this.installationPhase&&!this.fitting)this.fit(this.camera.position.clone().sub(this.controls.target).toArray());this.positionLabels();}
 positionLabels(){
  if(!this.tags?.length)return;const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.camera.updateMatrixWorld();const visible=[];
  for(const [i,axis] of (this.compassAxes??[]).entries()){const vector=new THREE.Vector3(...[0,1,2].map(k=>k===i?1:0)).transformDirection(this.camera.matrixWorldInverse),x=36+vector.x*24,y=42-vector.y*24;axis.line.setAttribute('x1',36);axis.line.setAttribute('y1',42);axis.line.setAttribute('x2',x);axis.line.setAttribute('y2',y);axis.text.setAttribute('x',x+(vector.x<-.1?-10:5));axis.text.setAttribute('y',y+(vector.y<.1?12:-4));}
  for(const item of this.tags){const point=item.anchor.getWorldPosition(new THREE.Vector3()).project(this.camera),shown=(item.port||item.component||item.obstacle||this.showParts)&&point.z>=-1&&point.z<=1&&Math.abs(point.x)<1.1&&Math.abs(point.y)<1.1;item.tag.hidden=!shown;item.line.style.display=shown?'':'none';if(shown)visible.push({item,anchor:[(point.x+1)*w/2,(1-point.y)*h/2],width:item.tag.offsetWidth,height:item.tag.offsetHeight});}
  visible.sort((a,b)=>Number(b.item.port)-Number(a.item.port));const placements=layoutInputLabels(visible,w,h);
  for(const [i,{item,anchor}] of visible.entries()){const r=placements[i];item.tag.style.transform=`translate(${r.x}px,${r.y}px)`;item.line.setAttribute('x1',anchor[0]);item.line.setAttribute('y1',anchor[1]);item.line.setAttribute('x2',r.x+r.w/2);item.line.setAttribute('y2',r.y+r.h/2);}
 }
}
