import * as THREE from 'three';
import {positioningFrame,positionFromSurfacePoint,directionFromWorldVector,hostEndFrames} from './model-positioning.js';

/** The uncut outside surface is the only picking target. Rendered holes,
 * wall faces, split pads and exploded parts never determine a new location. */
export class ModelEditor {
  constructor(viewer,{getParams,onCommit,onPreview,onAlign,onKeyboard,onSelect}) {
    this.viewer=viewer;this.getParams=getParams;this.onCommit=onCommit;
    this.onPreview=onPreview;this.onAlign=onAlign;this.onKeyboard=onKeyboard;this.onSelect=onSelect;
    this.enabled=true;this.params=null;this.result=null;this.draft=null;
    if(!viewer.available)return;
    viewer.editor=this;this.group=new THREE.Group();viewer.scene.add(this.group);
    this.ray=new THREE.Raycaster();this.pointer=new THREE.Vector2();
    this.hoverRing=new THREE.Mesh(new THREE.RingGeometry(.72,1,48),new THREE.MeshBasicMaterial({color:0xffd47b,side:THREE.DoubleSide,transparent:true,opacity:.9,depthTest:true,depthWrite:false}));this.hoverRing.visible=false;viewer.scene.add(this.hoverRing);
    this.hoverLabel=document.createElement('div');this.hoverLabel.className='model-hover-label';this.hoverLabel.hidden=true;this.overlayNote=document.createElement('div');this.overlayNote.className='model-context-note';this.overlayNote.hidden=true;viewer.container.append(this.hoverLabel,this.overlayNote);
    this.activePointers=new Set();this.multiTouch=false;
    viewer.container.addEventListener('pointerdown',event=>{this.activePointers.add(event.pointerId);if(this.activePointers.size>1){this.multiTouch=true;this.tap=null;this.cancelDrag();}},true);
    const release=event=>{this.activePointers.delete(event.pointerId);if(!this.activePointers.size)this.multiTouch=false;};
    viewer.container.addEventListener('pointerup',release,true);viewer.container.addEventListener('pointercancel',release,true);
    this.overlay=document.createElement('div');this.overlay.className='model-handles';viewer.container.append(this.overlay);
    this.leaders=document.createElementNS('http://www.w3.org/2000/svg','svg');this.leaders.setAttribute('class','model-port-leaders');this.leaders.setAttribute('aria-hidden','true');this.overlay.append(this.leaders);
    this.handles={};
    for(const [key,label] of [['A','沿 A 端中心線插管'],['B','沿 B 端中心線插管'],['position','拖曳接點移動位置'],['direction','拖曳藍色端點改變支管方向']]){
      const button=document.createElement('button');button.type='button';button.className='model-handle model-handle-'+key;button.dataset.modelHandle=key;button.setAttribute('aria-label',label);
      button.innerHTML=key==='position'?'<span class="handle-dot">＋</span><span>接點</span>':key==='direction'?'<span class="handle-dot">↗</span><span>拉方向</span>':`${key} 端`;
      this.overlay.append(button);this.handles[key]=button;
      if(key==='A'||key==='B')button.addEventListener('click',()=>{if(this.enabled&&!this.busy&&this.currentParams()&&this.params?.hostType==='elbow'&&this.params.elbowAlignment!==key.toLowerCase()+'-axis')this.onAlign(key);});
      else {button.addEventListener('pointerdown',event=>this.beginDrag(event,key));button.addEventListener('pointermove',event=>this.drag(event));button.addEventListener('pointerup',event=>this.endDrag(event));button.addEventListener('pointercancel',()=>this.cancelDrag());button.addEventListener('keydown',event=>{if(this.enabled&&!this.busy&&this.onKeyboard(key,event))event.preventDefault();});}
    }
    const canvas=viewer.renderer.domElement;
    canvas.addEventListener('pointerdown',event=>{if(this.enabled&&!this.modal&&!this.busy&&!this.multiTouch&&this.currentParams()&&event.button===0)this.tap={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};},true);
    canvas.addEventListener('pointermove',event=>{if(this.tap&&Math.hypot(event.clientX-this.tap.x,event.clientY-this.tap.y)>6)this.tap.moved=true;},true);
    canvas.addEventListener('pointermove',event=>this.hover(event),true);
    canvas.addEventListener('pointerleave',()=>this.clearHover(),true);
    canvas.addEventListener('pointercancel',()=>{this.tap=null;},true);
    canvas.addEventListener('pointerup',event=>{
      const tap=this.tap;this.tap=null;if(!this.enabled||this.modal||this.busy||!this.currentParams()||!tap||tap.id!==event.pointerId||tap.moved)return;
      const part=this.pickPart(event);if(part){this.clearHover();this.onSelect?.(part);return;}
      if(this.locked){this.onPreview('目前沿端口中心線鎖定。先選「自由定位」，再點管身。');return;}
      const point=this.pick(event,true);if(!point)return;
      const patch=positionFromSurfacePoint(this.params,point.toArray());if(patch){this.preview(patch);this.onCommit(patch);}
    },true);
    viewer.container.addEventListener('keydown',event=>{if(event.key==='Escape'&&this.dragging){event.preventDefault();this.cancelDrag();this.viewer.render();}});
  }
  currentParams(){return this.params&&JSON.stringify(this.getParams())===JSON.stringify(this.params);}
  setEnabled(value){this.enabled=value;this.clearHover();if(!value)this.cancelDrag();this.updateDraft();this.viewer.render();}
  setPending(params){if(!this.viewer.available)return;this.clearHover();this.cancelDrag();this.busy=true;this.tap=null;this.params={...params};this.result={valid:false};this.rebuildHost();this.updateDraft();if(!this.viewer.result)this.viewer.fit('joint');this.viewer.render();}
  sync(params,result){if(!this.viewer.available)return;this.cancelDrag();this.busy=false;this.params={...params};this.result=result;this.rebuildHost();this.updateDraft();this.viewer.render();}
  rebuildHost(){
    if(!this.group)return;
    const p=this.params,key=JSON.stringify([p.hostType,p.mainOD,p.mainEndOD,p.mainLength,p.bendRadius,p.bendAngle]);
    if(key===this.hostKey)return;this.hostKey=key;
    if(this.host){this.group.remove(this.host);this.host.geometry.dispose();this.host.material.dispose();this.host=null;}
    if(!Number.isFinite(p.mainOD)||p.mainOD<=0)return;
    let geometry;
    if(p.hostType==='elbow'){
      if(!Number.isFinite(p.bendRadius)||p.bendRadius<=p.mainOD/2||!Number.isFinite(p.bendAngle)||p.bendAngle<=0||p.bendAngle>180)return;
      const curve=new THREE.Curve();curve.getPoint=t=>{const b=t*p.bendAngle*Math.PI/180;return new THREE.Vector3(p.bendRadius*Math.sin(b),p.bendRadius*(1-Math.cos(b)),0);};
      geometry=new THREE.TubeGeometry(curve,Math.max(24,Math.ceil(p.bendAngle/2)),p.mainOD/2,48,false);
    }else{
      if(!Number.isFinite(p.mainLength)||p.mainLength<=0||p.hostType==='cone'&&(!Number.isFinite(p.mainEndOD)||p.mainEndOD<=0))return;
      geometry=new THREE.CylinderGeometry((p.hostType==='cone'?p.mainEndOD:p.mainOD)/2,p.mainOD/2,p.mainLength,96,1,true);
      geometry.rotateZ(-Math.PI/2);geometry.translate(p.mainLength/2,0,0);
    }
    const material=new THREE.MeshStandardMaterial({color:0x849eb6,side:THREE.DoubleSide,transparent:true,opacity:0,depthWrite:false,roughness:.65});
    this.host=new THREE.Mesh(geometry,material);this.group.add(this.host);
    if(!this.ghost){this.ghost=new THREE.Mesh(new THREE.CylinderGeometry(1,1,1,64,1,true),new THREE.MeshStandardMaterial({color:0x50c9f5,side:THREE.DoubleSide,transparent:true,opacity:.5,depthWrite:false}));this.group.add(this.ghost);}
    if(!this.axis){this.axis=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0x65d8ff,depthTest:false}));this.axis.renderOrder=30;this.group.add(this.axis);}
  }
  get locked(){return this.params?.hostType==='elbow'&&(this.params.elbowAlignment??'free')!=='free';}
  updateDraft(){
    if(!this.host){this.frame=null;this.tip=null;if(this.ghost)this.ghost.visible=false;if(this.axis)this.axis.visible=false;this.viewer.model.visible=!!this.result?.valid;this.layout();return;}
    const p={...this.params,...this.draft},frame=positioningFrame(p);this.frame=frame;
    const preview=!!this.draft||!this.result?.valid;
    this.viewer.model.visible=!preview;this.host.material.opacity=preview?.8:0;
    this.host.material.depthWrite=preview;this.host.material.needsUpdate=true;
    this.ghost.visible=preview&&!!frame&&Number.isFinite(p.branchOD)&&p.branchOD>0;this.axis.visible=!!frame&&this.enabled;
    if(!frame){this.layout();return;}
    let length=Math.max(p.mainOD*.8,Number.isFinite(p.branchLength)?p.branchLength:150);
    if(!preview&&this.result.geometry.branch.outerEnd?.length){const ring=this.result.geometry.branch.outerEnd.slice(0,-1),end=ring.reduce((sum,q)=>sum.map((v,i)=>v+q[i]/ring.length),[0,0,0]);length=end.reduce((v,q,i)=>v+(q-frame.origin[i])*frame.direction[i],0);}
    length=Math.max(p.mainOD*.4,length);this.tip=frame.origin.map((v,i)=>v+frame.direction[i]*length);
    this.ghost.position.set(...frame.origin.map((v,i)=>(v+this.tip[i])/2));const radius=Number.isFinite(p.branchOD)&&p.branchOD>0?p.branchOD/2:1;this.ghost.scale.set(radius,length,radius);
    this.ghost.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(...frame.direction));
    this.axis.geometry.dispose();this.axis.geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...frame.origin),new THREE.Vector3(...this.tip)]);
    this.axis.material.color.set(!this.result?.valid&&!this.draft?0xff8b81:0x65d8ff);
    this.layout();
  }
  layout(){
    if(!this.overlay)return;
    const active=this.enabled&&!this.modal&&!!this.frame&&!!this.host;
    this.viewer.model.traverse(item=>{if(item.isSprite)item.visible=!active;});
    this.overlay.hidden=!active;this.viewer.container.classList.toggle('direct-positioning',active);
    this.overlayNote.hidden=true;if(!active)return;
    const box=this.viewer.container.getBoundingClientRect(),project=point=>{const q=new THREE.Vector3(...point).project(this.viewer.camera);return {x:(q.x+1)*box.width/2,y:(1-q.y)*box.height/2,visible:q.z>-1&&q.z<1&&Math.abs(q.x)<1.15&&Math.abs(q.y)<1.15};};
    const placeScreen=(key,q)=>{const button=this.handles[key];button.hidden=!q.visible;const hx=button.offsetWidth/2+4,hy=button.offsetHeight/2+4,dot=button.querySelector('.handle-dot'),shift=dot?button.offsetHeight/2-dot.offsetTop-dot.offsetHeight/2:0;button.style.left=`${Math.max(hx,Math.min(box.width-hx,q.x))}px`;button.style.top=`${Math.max(hy,Math.min(box.height-hy,q.y+shift))}px`;};
    const place=(key,point)=>placeScreen(key,project(point));
    place('position',this.frame.origin);place('direction',this.tip);
    this.handles.position.disabled=this.busy;this.handles.direction.disabled=this.busy;
    const origin=new THREE.Vector3(...this.frame.origin),toward=origin.clone().sub(this.viewer.camera.position);this.group.updateMatrixWorld(true);
    const sight=new THREE.Raycaster(this.viewer.camera.position,toward.clone().normalize()).intersectObject(this.host,false)[0];
    const occluded=sight&&toward.length()-sight.distance>this.params.mainOD*.02;
    this.handles.position.hidden=this.locked||occluded||this.handles.position.hidden;this.handles.direction.hidden=this.locked||this.handles.direction.hidden;
    const a=project(this.frame.origin),b=project(this.tip),stacked=Math.hypot(a.x-b.x,a.y-b.y)<52;
    if(stacked&&!this.handles.position.hidden){this.handles.direction.hidden=true;}
    this.overlayNote.hidden=this.locked||this.busy||!(occluded||stacked);this.overlayNote.textContent=occluded?'接點在背面 → 按「看接點」':stacked?'端點太靠近 → 放大或轉視角':'';
    const occupied=Object.values(this.handles).filter(b=>!b.hidden&&!['A','B'].includes(b.dataset.modelHandle)).map(b=>b.getBoundingClientRect());
    this.leaders.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);let leaders='';
    for(const end of hostEndFrames({...this.params,...this.draft})??[]){
      const button=this.handles[end.id],selected=this.params.elbowAlignment===end.id.toLowerCase()+'-axis';button.disabled=this.busy||this.params.hostType!=='elbow';button.classList.toggle('locked-end',selected);button.setAttribute('aria-pressed',String(selected));button.textContent=this.params.hostType==='elbow'?`${end.id} · 沿中心線`:`${end.id} 端`;
      const q=project(end.center),out=project(end.center.map((v,i)=>v+end.outward[i]*this.params.mainOD/3)),len=Math.hypot(out.x-q.x,out.y-q.y)||1,dx=(out.x-q.x)/len,dy=(out.y-q.y)/len;
      // Keep port buttons beside their mouths and clear of the drag handles.
      const candidates=[[0,0],[dx*40,dy*40],[dx*70,dy*70],[-dy*90,dx*90],[dy*90,-dx*90],[dx*110,dy*110],[-90,-65],[90,-65],[-90,65],[90,65]];
      for(const [x,y] of candidates){placeScreen(end.id,{...q,x:q.x+x,y:q.y+y});const r=button.getBoundingClientRect();if(!occupied.some(s=>r.left<s.right+6&&r.right>s.left-6&&r.top<s.bottom+6&&r.bottom>s.top-6))break;}
      if(!button.hidden){const r=button.getBoundingClientRect();occupied.push(r);const x=r.left-box.left+r.width/2,y=r.top-box.top+r.height/2;if(Math.hypot(x-q.x,y-q.y)>15)leaders+=`<path d="M${q.x} ${q.y}L${x} ${y}"/><circle cx="${q.x}" cy="${q.y}" r="3"/>`;}
    }
    this.leaders.innerHTML=leaders;
  }
  rayAt(event){const box=this.viewer.container.getBoundingClientRect();this.pointer.set((event.clientX-box.left)/box.width*2-1,-(event.clientY-box.top)/box.height*2+1);this.ray.setFromCamera(this.pointer,this.viewer.camera);return this.ray;}
  pickPart(event){
    if(!this.viewer.model.visible)return null;this.viewer.model.updateMatrixWorld(true);
    const entries=Object.entries(this.viewer.parts).filter(([,p])=>p.visible),hits=this.rayAt(event).intersectObjects(entries.map(([,p])=>p),true).filter(q=>q.object.isMesh),first=hits[0];if(!first)return null;
    for(const [key,part] of entries){let item=first.object;while(item&&item!==part)item=item.parent;if(item===part)return ['branch','pad'].includes(key)?key:null;}return null;
  }
  clearHover(){if(this.hoverRing)this.hoverRing.visible=false;if(this.hoverLabel)this.hoverLabel.hidden=true;if(this.viewer.renderer)this.viewer.renderer.domElement.style.cursor='';}
  hover(event){
    this.clearHover();if(!this.enabled||this.modal||this.busy||this.dragging||this.multiTouch||event.pointerType==='touch'||!this.currentParams()||this.tap?.moved){this.viewer.render();return;}
    const part=this.pickPart(event);let text=part==='pad'?'點補強板 → 改板形、厚度與分片':part==='branch'?'點藍色支管 → 改外貼／內插接法':'';
    if(!part&&this.locked){text='沿管口中心線鎖定；先按自由定位';}
    if(!part&&!this.locked){const hit=this.pick(event,true),patch=hit&&positionFromSurfacePoint(this.params,hit.toArray()),frame=patch&&positioningFrame({...this.params,...patch});if(frame){const radius=Math.max(this.params.mainOD*.018,2.5);this.hoverRing.scale.setScalar(radius);this.hoverRing.position.set(...frame.origin.map((v,i)=>v+frame.normal[i]*radius*.12));this.hoverRing.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(...frame.normal));this.hoverRing.visible=true;text='點這裡移接點';}}
    if(text){const box=this.viewer.container.getBoundingClientRect();this.hoverLabel.textContent=text;this.hoverLabel.hidden=false;this.hoverLabel.style.left=`${Math.max(8,Math.min(box.width-this.hoverLabel.offsetWidth-8,event.clientX-box.left+16))}px`;this.hoverLabel.style.top=`${Math.max(8,Math.min(box.height-this.hoverLabel.offsetHeight-8,event.clientY-box.top+18))}px`;this.viewer.renderer.domElement.style.cursor=part?'pointer':this.locked?'not-allowed':'crosshair';}this.viewer.render();
  }
  pick(event,visibleOnly=false){
    if(!this.host)return null;this.group.updateMatrixWorld(true);const ray=this.rayAt(event),hit=ray.intersectObject(this.host,false)[0];if(!hit)return null;
    const patch=positionFromSurfacePoint(this.params,hit.point.toArray()),f=patch&&positioningFrame({...this.params,...patch});
    // An open mouth can expose the back side of the outside proxy. It is not
    // a visible outside surface that the operator can mark.
    if(f&&new THREE.Vector3(...f.normal).dot(ray.ray.direction)>=0)return null;
    if(visibleOnly&&this.viewer.model.visible){
      this.viewer.model.updateMatrixWorld(true);const entries=Object.values(this.viewer.parts).filter(p=>p.visible),first=ray.intersectObjects(entries,true).find(q=>q.object.isMesh);
      if(!first||first.object.userData.pickSurface!=='mother-outer'||Math.abs(first.distance-hit.distance)>Math.max(.5,this.params.mainOD*.004))return null;
    }
    return hit.point;
  }
  preview(patch){this.draft={...patch};this.updateDraft();this.onPreview('定位預覽；放開後重算魚口。');this.viewer.render();}
  beginDrag(event,kind){
    if(!this.enabled||this.modal||this.busy||this.multiTouch||!this.currentParams()||this.locked||event.button!==0||!this.frame)return;
    event.preventDefault();event.stopPropagation();this.viewer.controls.enabled=false;
    this.clearHover();event.currentTarget.focus({preventScroll:true});
    this.dragging={id:event.pointerId,kind,target:event.currentTarget,patch:null};event.currentTarget.setPointerCapture(event.pointerId);
    if(kind==='direction')this.dragging.plane=new THREE.Plane().setFromNormalAndCoplanarPoint(this.viewer.camera.getWorldDirection(new THREE.Vector3()),new THREE.Vector3(...this.tip));
  }
  drag(event){
    const d=this.dragging;if(!d||d.id!==event.pointerId)return;
    let patch;
    if(d.kind==='position'){const point=this.pick(event);if(point)patch=positionFromSurfacePoint(this.params,point.toArray());}
    else{const point=this.rayAt(event).ray.intersectPlane(d.plane,new THREE.Vector3());if(point)patch=directionFromWorldVector(this.params,point.sub(new THREE.Vector3(...positioningFrame(this.params).origin)).toArray());}
    if(patch){d.patch=patch;this.preview(patch);}else if(d.kind==='direction')this.onPreview('方向須朝母材外側；可先轉視角再拉方向。');
  }
  endDrag(event){const d=this.dragging;if(!d||d.id!==event.pointerId)return;this.dragging=null;this.viewer.controls.enabled=true;if(d.target.hasPointerCapture(event.pointerId))d.target.releasePointerCapture(event.pointerId);if(d.patch)this.onCommit(d.patch);else{this.draft=null;this.updateDraft();this.onPreview('');this.viewer.render();}}
  cancelDrag(){if(!this.viewer.available)return;const d=this.dragging;this.dragging=null;if(d?.target.hasPointerCapture(d.id))d.target.releasePointerCapture(d.id);this.viewer.controls.enabled=true;this.draft=null;this.updateDraft();this.onPreview('');}
}
