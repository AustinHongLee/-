import * as THREE from 'three';
import {positioningFrame,positionFromSurfacePoint,directionFromWorldVector,hostEndFrames} from './model-positioning.js';
import {createSteelSection,sampleSectionBoundary} from './steel-sections.js';

function previewSectionGeometry(p){
  const section=createSteelSection(p);if(!section.valid)return null;
  const boundaries=section.boundaries.map(b=>sampleSectionBoundary(section,b.id,48).slice(0,-1).map(q=>new THREE.Vector2(...q))),shape=new THREE.Shape(boundaries[0]);
  shape.holes=boundaries.slice(1).map(points=>new THREE.Path(points));const geometry=new THREE.ExtrudeGeometry(shape,{depth:1,bevelEnabled:false,steps:1});geometry.translate(0,0,-.5);return geometry;
}

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
    for(const [key,label] of [['A','A 端對齊設定：同軸、偏移或外沿齊線'],['B','B 端對齊設定：同軸、偏移或外沿齊線'],['position','拖曳接點移動位置'],['direction','拖曳藍色端點改變支管方向']]){
      const button=document.createElement('button');button.type='button';button.className='model-handle model-handle-'+key;button.dataset.modelHandle=key;button.setAttribute('aria-label',label);
      button.innerHTML=key==='position'?'<span class="handle-dot">＋</span><span>接點</span>':key==='direction'?'<span class="handle-dot">↗</span><span>拉方向</span>':`${key} 端`;
      this.overlay.append(button);this.handles[key]=button;
      if(key==='A'||key==='B')button.addEventListener('click',()=>{if(this.enabled&&!this.busy&&this.currentParams()&&this.params?.hostType==='elbow')this.onAlign(key);});
      else {button.addEventListener('pointerdown',event=>this.beginDrag(event,key));button.addEventListener('pointermove',event=>this.drag(event));button.addEventListener('pointerup',event=>this.endDrag(event));button.addEventListener('pointercancel',()=>this.cancelDrag());button.addEventListener('keydown',event=>{if(this.enabled&&!this.busy&&this.onKeyboard(key,event))event.preventDefault();});}
    }
    const canvas=viewer.renderer.domElement;
    canvas.addEventListener('pointerdown',event=>{if(this.enabled&&!this.modal&&!this.busy&&!this.multiTouch&&this.currentParams()&&event.button===0)this.tap={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};},true);
    canvas.addEventListener('pointermove',event=>{if(this.tap&&Math.hypot(event.clientX-this.tap.x,event.clientY-this.tap.y)>6)this.tap.moved=true;},true);
    canvas.addEventListener('pointermove',event=>this.scheduleHover(event),true);
    canvas.addEventListener('pointerleave',()=>this.clearHover(),true);
    canvas.addEventListener('pointercancel',()=>{this.tap=null;},true);
    canvas.addEventListener('pointerup',event=>{
      const tap=this.tap;this.tap=null;if(!this.enabled||this.modal||this.busy||!this.currentParams()||!tap||tap.id!==event.pointerId||tap.moved)return;
      const visibleHit=this.modelHit(event),part=this.pickPart(event,visibleHit);if(part){this.clearHover();this.onSelect?.(part,visibleHit.object.userData.steelFace);return;}
      if(this.locked){this.onPreview('目前沿管口方向定位。點管口改偏移，或選「自由定位」。');return;}
      const point=this.pick(event,true,visibleHit);if(!point)return;
      const patch=positionFromSurfacePoint(this.params,point.toArray());if(patch){this.preview(patch);this.onCommit(patch);}
    },true);
    viewer.container.addEventListener('keydown',event=>{if(event.key==='Escape'&&this.dragging){event.preventDefault();this.cancelDrag();this.viewer.render();}});
  }
  currentParams(){return this.params&&JSON.stringify(this.getParams())===JSON.stringify(this.params);}
  setEnabled(value){this.enabled=value;this.clearHover();if(!value)this.cancelDrag();this.updateDraft();this.viewer.render();}
  setPending(params){
    if(!this.viewer.available)return;
    const keepDrag=this.calculating&&JSON.stringify(params)===JSON.stringify(this.params);
    this.clearHover();if(!keepDrag)this.cancelDrag();this.calculating=true;this.busy=false;this.tap=null;this.params={...params};this.result={valid:false};this.rebuildHost();this.updateDraft();if(!this.viewer.result)this.viewer.fit('joint');this.viewer.render();
  }
  sync(params,result){if(!this.viewer.available)return;const keepDrag=this.dragging&&JSON.stringify(params)===JSON.stringify(this.params);if(!keepDrag)this.cancelDrag();this.calculating=false;this.busy=false;this.params={...params};this.result=result;this.rebuildHost();this.updateDraft();this.viewer.render();}
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
    if(!this.ghost){this.ghost=new THREE.Mesh(new THREE.CylinderGeometry(1,1,1,64,1,true),new THREE.MeshStandardMaterial({color:0x50c9f5,side:THREE.DoubleSide,transparent:true,opacity:.5,depthWrite:false}));this.ghost.userData.part='branch';this.group.add(this.ghost);}
    if(!this.axis){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6),3));this.axis=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0x65d8ff,depthTest:false}));this.axis.renderOrder=30;this.group.add(this.axis);}
  }
  get locked(){return this.params?.hostType==='elbow'&&(this.params.elbowAlignment??'free')!=='free';}
  updateDraft(){
    if(!this.host){this.frame=null;this.tip=null;if(this.ghost)this.ghost.visible=false;if(this.axis)this.axis.visible=false;this.viewer.model.visible=!!this.result?.valid;this.layout();return;}
    const p={...this.params,...this.draft},frame=positioningFrame(p);this.frame=frame;
    const preview=!!this.draft||!this.result?.valid;
    this.viewer.model.visible=!preview;this.host.material.opacity=preview?.8:0;
    this.host.material.depthWrite=preview;
    const steel=p.branchSection&&p.branchSection!=='pipe',profileKey=JSON.stringify(steel?[p.branchSection,p.branchOD,p.branchWall,p.sectionWidth,p.sectionHeight,p.sectionWall,p.sectionWeb,p.sectionFlange,p.sectionRadius,p.sectionSlope]:['pipe']);
    if(profileKey!==this.profileKey){const geometry=steel?previewSectionGeometry(p):new THREE.CylinderGeometry(1,1,1,64,1,true);this.ghost.geometry.dispose();this.ghost.geometry=geometry??new THREE.BufferGeometry();this.profileValid=!!geometry;this.profileKey=profileKey;}
    this.ghost.visible=preview&&!!frame&&this.profileValid;this.axis.visible=!!frame&&this.enabled;
    if(!frame){this.layout();return;}
    let length=Math.max(p.mainOD*.8,Number.isFinite(p.branchLength)?p.branchLength:150);
    if(!preview&&this.result.geometry.branch.outerEnd?.length){const ring=this.result.geometry.branch.outerEnd.slice(0,-1),end=ring.reduce((sum,q)=>sum.map((v,i)=>v+q[i]/ring.length),[0,0,0]);length=end.reduce((v,q,i)=>v+(q-frame.origin[i])*frame.direction[i],0);}
    length=Math.max(p.mainOD*.4,length);this.tip=frame.origin.map((v,i)=>v+frame.direction[i]*length);
    this.ghost.position.set(...frame.origin.map((v,i)=>(v+this.tip[i])/2));const radius=Number.isFinite(p.branchOD)&&p.branchOD>0?p.branchOD/2:1;this.ghost.scale.set(radius,length,radius);
    if(steel){
      const d=new THREE.Vector3(...frame.direction),u=new THREE.Vector3(...frame.tangent).negate();u.addScaledVector(d,-u.dot(d)).normalize();const v=u.clone().cross(d).normalize(),theta=p.sectionRotation*Math.PI/180,ur=u.clone().multiplyScalar(Math.cos(theta)).addScaledVector(v,Math.sin(theta)),vr=v.clone().multiplyScalar(Math.cos(theta)).addScaledVector(u,-Math.sin(theta));
      this.ghost.matrixAutoUpdate=false;this.ghost.matrix.makeBasis(ur,vr,d.multiplyScalar(length));this.ghost.matrix.setPosition(new THREE.Vector3(...frame.origin.map((q,i)=>(q+this.tip[i])/2)));
    }else{this.ghost.matrixAutoUpdate=true;this.ghost.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(...frame.direction));}
    const axisPosition=this.axis.geometry.getAttribute('position');axisPosition.setXYZ(0,...frame.origin);axisPosition.setXYZ(1,...this.tip);axisPosition.needsUpdate=true;this.axis.geometry.computeBoundingSphere();
    this.axis.material.color.set(!this.result?.valid&&!this.draft?0xff8b81:0x65d8ff);
    this.layout();
  }
  layout(){
    if(!this.overlay)return;
    const active=this.enabled&&!this.modal&&!!this.host;
    const box=this.viewer.container.getBoundingClientRect(),camera=this.viewer.camera;camera.updateMatrixWorld();const layoutKey=JSON.stringify([active,box.width,box.height,camera.matrixWorld.elements,camera.projectionMatrix.elements,this.frame?.origin,this.tip,this.hostKey,this.locked,this.busy,this.params?.elbowAlignment]);if(layoutKey===this.layoutKey)return;this.layoutKey=layoutKey;
    this.viewer.model.traverse(item=>{if(item.isSprite)item.visible=!active;});
    this.overlay.hidden=!active;this.viewer.container.classList.toggle('direct-positioning',active);
    this.overlayNote.hidden=true;if(!active)return;
    const project=point=>{const q=new THREE.Vector3(...point).project(camera);return {x:(q.x+1)*box.width/2,y:(1-q.y)*box.height/2,visible:q.z>-1&&q.z<1&&Math.abs(q.x)<1.15&&Math.abs(q.y)<1.15};};
    const measure=key=>{const button=this.handles[key],dot=button.querySelector('.handle-dot'),width=button.offsetWidth,height=button.offsetHeight;return {width,height,shift:dot?height/2-dot.offsetTop-dot.offsetHeight/2:0};};
    const placed={};
    const placeScreen=(key,q,size=null,write=true)=>{const button=this.handles[key];if(write)button.hidden=!q.visible;size??=measure(key);const hx=size.width/2+4,hy=size.height/2+4,x=Math.max(hx,Math.min(box.width-hx,q.x)),y=Math.max(hy,Math.min(box.height-hy,q.y+size.shift)),r={left:box.left+x-size.width/2,right:box.left+x+size.width/2,top:box.top+y-size.height/2,bottom:box.top+y+size.height/2,width:size.width,height:size.height};if(write){const left=`${x}px`,top=`${y}px`;if(button.style.left!==left)button.style.left=left;if(button.style.top!==top)button.style.top=top;placed[key]=r;}return r;};
    const place=(key,point)=>placeScreen(key,project(point));
    if(this.frame&&this.tip){
    place('position',this.frame.origin);place('direction',this.tip);
    this.handles.position.disabled=this.busy;this.handles.direction.disabled=this.busy;
    const origin=new THREE.Vector3(...this.frame.origin),toward=origin.clone().sub(this.viewer.camera.position);this.group.updateMatrixWorld(true);
    const sight=new THREE.Raycaster(this.viewer.camera.position,toward.clone().normalize()).intersectObject(this.host,false)[0];
    const occluded=sight&&toward.length()-sight.distance>this.params.mainOD*.02;
    this.handles.position.hidden=this.locked||occluded||this.handles.position.hidden;this.handles.direction.hidden=this.locked||this.handles.direction.hidden;
    const a=project(this.frame.origin),b=project(this.tip),stacked=Math.hypot(a.x-b.x,a.y-b.y)<52;
    if(stacked&&!this.handles.position.hidden){this.handles.direction.hidden=true;}
    this.overlayNote.hidden=this.locked||this.busy||!(occluded||stacked);this.overlayNote.textContent=occluded?'接點在背面 → 按「看接點」':stacked?'端點太靠近 → 放大或轉視角':'';
    }else{this.handles.position.hidden=true;this.handles.direction.hidden=true;}
    const occupied=['position','direction'].filter(key=>!this.handles[key].hidden).map(key=>placed[key]);
    this.leaders.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);let leaders='';
    for(const end of hostEndFrames({...this.params,...this.draft})??[]){
      const button=this.handles[end.id],selected=this.params.elbowAlignment?.startsWith(end.id.toLowerCase()+'-');button.disabled=this.busy||this.params.hostType!=='elbow';button.classList.toggle('locked-end',selected);button.setAttribute('aria-pressed',String(!!selected));const kind=this.params.elbowAlignment?.split('-')[1],text=this.params.hostType==='elbow'?`${end.id} · ${selected?{axis:'同軸',offset:'平行偏移',edge:'外沿齊線'}[kind]??'管口':'對齊設定'}`:`${end.id} 端`;if(button.textContent!==text)button.textContent=text;
      const q=project(end.center),out=project(end.center.map((v,i)=>v+end.outward[i]*this.params.mainOD/3)),len=Math.hypot(out.x-q.x,out.y-q.y)||1,dx=(out.x-q.x)/len,dy=(out.y-q.y)/len;
      // Keep port buttons beside their mouths and clear of the drag handles.
      const candidates=[[0,0],[dx*40,dy*40],[dx*70,dy*70],[-dy*90,dx*90],[dy*90,-dx*90],[dx*110,dy*110],[-90,-65],[90,-65],[-90,65],[90,65]];
      button.hidden=!q.visible;if(button.hidden)continue;const size=measure(end.id);let chosen=q;
      for(const [x,y] of candidates){chosen={...q,x:q.x+x,y:q.y+y};const r=placeScreen(end.id,chosen,size,false);if(!occupied.some(s=>r.left<s.right+6&&r.right>s.left-6&&r.top<s.bottom+6&&r.bottom>s.top-6))break;}
      const r=placeScreen(end.id,chosen,size);occupied.push(r);const x=r.left-box.left+r.width/2,y=r.top-box.top+r.height/2;if(Math.hypot(x-q.x,y-q.y)>15)leaders+=`<path d="M${q.x} ${q.y}L${x} ${y}"/><circle cx="${q.x}" cy="${q.y}" r="3"/>`;
    }
    if(this.leaders.innerHTML!==leaders)this.leaders.innerHTML=leaders;
  }
  rayAt(event){const box=this.viewer.container.getBoundingClientRect();this.pointer.set((event.clientX-box.left)/box.width*2-1,-(event.clientY-box.top)/box.height*2+1);this.ray.setFromCamera(this.pointer,this.viewer.camera);return this.ray;}
  modelHit(event){const ray=this.rayAt(event);if(!this.viewer.model.visible&&this.ghost?.visible){this.group.updateMatrixWorld(true);return ray.intersectObjects([this.host,this.ghost],false)[0]??null;}return this.viewer.intersectModel(ray);}
  pickPart(event,hit=this.modelHit(event)){const key=hit?.object.userData.part;return ['branch','pad'].includes(key)?key:null;}
  scheduleHover(event){this.queuedHover={clientX:event.clientX,clientY:event.clientY,pointerType:event.pointerType};if(this.hoverRequest)return;this.hoverRequest=requestAnimationFrame(()=>{this.hoverRequest=null;const queued=this.queuedHover;this.queuedHover=null;if(queued)this.hover(queued);});}
  clearHover(){if(this.hoverRequest){cancelAnimationFrame(this.hoverRequest);this.hoverRequest=null;}this.queuedHover=null;const changed=this.hoverRing?.visible||this.hoverLabel&&!this.hoverLabel.hidden;if(this.hoverRing)this.hoverRing.visible=false;if(this.hoverLabel)this.hoverLabel.hidden=true;if(this.viewer.renderer)this.viewer.renderer.domElement.style.cursor='';if(changed)this.viewer.render();}
  hover(event){
    this.clearHover();if(!this.enabled||this.modal||this.busy||this.dragging||this.multiTouch||event.pointerType==='touch'||!this.currentParams()||this.tap?.moved)return;
    const visibleHit=this.modelHit(event),part=this.pickPart(event,visibleHit);let text=part==='pad'?'點補強板 → 改板形、厚度與分片':part==='branch'?'點藍色支管 → 改外貼／內插接法':'';
    if(!part&&this.locked){text='點管口改偏移／齊線；自由定位可解除條件';}
    if(!part&&!this.locked){const hit=this.pick(event,true,visibleHit),patch=hit&&positionFromSurfacePoint(this.params,hit.toArray()),frame=patch&&positioningFrame({...this.params,...patch});if(frame){const radius=Math.max(this.params.mainOD*.018,2.5);this.hoverRing.scale.setScalar(radius);this.hoverRing.position.set(...frame.origin.map((v,i)=>v+frame.normal[i]*radius*.12));this.hoverRing.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(...frame.normal));this.hoverRing.visible=true;text='點這裡移接點';}}
    if(text){const box=this.viewer.container.getBoundingClientRect();this.hoverLabel.textContent=text;this.hoverLabel.hidden=false;this.hoverLabel.style.left=`${Math.max(8,Math.min(box.width-this.hoverLabel.offsetWidth-8,event.clientX-box.left+16))}px`;this.hoverLabel.style.top=`${Math.max(8,Math.min(box.height-this.hoverLabel.offsetHeight-8,event.clientY-box.top+18))}px`;this.viewer.renderer.domElement.style.cursor=part?'pointer':this.locked?'not-allowed':'crosshair';}this.viewer.render();
  }
  pick(event,visibleOnly=false,visibleHit=undefined){
    if(!this.host)return null;this.group.updateMatrixWorld(true);const ray=this.rayAt(event),hit=ray.intersectObject(this.host,false)[0];if(!hit)return null;
    const patch=positionFromSurfacePoint(this.params,hit.point.toArray()),f=patch&&positioningFrame({...this.params,...patch});
    // An open mouth can expose the back side of the outside proxy. It is not
    // a visible outside surface that the operator can mark.
    if(f&&new THREE.Vector3(...f.normal).dot(ray.ray.direction)>=0)return null;
    if(visibleOnly&&this.viewer.model.visible){
      const first=visibleHit===undefined?this.viewer.intersectModel(ray):visibleHit;
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
