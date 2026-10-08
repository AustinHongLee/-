import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {offsetSurfaceFrame,offsetCenterline,add,mul} from './offset-geometry.js';
import {cross} from './offset-ports.js';
import {routeSurfaceParts} from './offset-model-data.js';

export class OffsetViewer {
  constructor(host,{onSelect=null,onInteract=null,jointLabels=true}={}) {
    this.jointLabels=jointLabels;
    this.host=host;this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#13253d');
    this.camera=new THREE.PerspectiveCamera(40,1,.1,1e8);this.camera.up.set(0,0,1);
    this.renderer=new THREE.WebGLRenderer({antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    host.replaceChildren(this.renderer.domElement);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;
    this.controls.autoRotateSpeed=1;
    const canvas=this.renderer.domElement,pointers=new Set();let press=null;
    canvas.addEventListener('pointerdown',event=>{onInteract?.();pointers.add(event.pointerId);press=pointers.size===1&&event.button===0?{id:event.pointerId,x:event.clientX,y:event.clientY,moved:false}:null;});
    canvas.addEventListener('pointermove',event=>{if(press?.id===event.pointerId&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>6)press.moved=true;});
    canvas.addEventListener('pointerup',event=>{
      const click=press?.id===event.pointerId&&!press.moved&&pointers.size===1&&Math.hypot(event.clientX-press.x,event.clientY-press.y)<=6;
      pointers.delete(event.pointerId);press=null;if(!click||!onSelect)return;
      const rect=canvas.getBoundingClientRect(),pointer=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),ray=new THREE.Raycaster();
      ray.setFromCamera(pointer,this.camera);const part=ray.intersectObjects(this.group.children,true).find(hit=>hit.object.userData.piece)?.object.userData.piece;if(part)onSelect(part);
    });
    canvas.addEventListener('pointercancel',event=>{pointers.delete(event.pointerId);press=null;});
    canvas.addEventListener('wheel',()=>onInteract?.(),{passive:true});
    this.scene.add(new THREE.HemisphereLight(0xffffff,0x30405a,2.4));
    const light=new THREE.DirectionalLight(0xffffff,2.6);light.position.set(1,-2,3);this.scene.add(light);
    this.group=new THREE.Group();this.scene.add(this.group);
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);this.resize();
    this.setActive(true);
  }
  setActive(active){if(this.active===active)return;this.active=active;this.controls.enabled=active;let previous=null;this.renderer.setAnimationLoop(active?time=>{const delta=previous===null?0:Math.min((time-previous)/1000,.05);previous=time;this.controls.update(delta);this.renderer.render(this.scene,this.camera);}:null);}
  setAutoRotate(active){this.controls.autoRotate=active;}
  settle(){const damping=this.controls.enableDamping,spin=this.controls.autoRotate;this.controls.enableDamping=false;this.controls.autoRotate=false;this.controls.update();this.controls.enableDamping=damping;this.controls.autoRotate=spin;}
  zoom(factor){this.settle();const offset=this.camera.position.clone().sub(this.controls.target),distance=THREE.MathUtils.clamp(offset.length()*factor,this.controls.minDistance,this.controls.maxDistance);this.camera.position.copy(this.controls.target).add(offset.setLength(distance));this.controls.update(0);}
  orbit(horizontal,vertical){this.settle();const rotation=new THREE.Quaternion().setFromUnitVectors(this.camera.up,new THREE.Vector3(0,1,0)),offset=this.camera.position.clone().sub(this.controls.target).applyQuaternion(rotation),spherical=new THREE.Spherical().setFromVector3(offset);spherical.theta+=horizontal;spherical.phi=THREE.MathUtils.clamp(spherical.phi+vertical,.05,Math.PI-.05);offset.setFromSpherical(spherical).applyQuaternion(rotation.invert());this.camera.position.copy(this.controls.target).add(offset);this.controls.update(0);}
  resize(){const width=this.host.clientWidth,height=this.host.clientHeight;if(!width||!height)return;const aspect=width/height;if(this.viewportAspect&&this.viewportAspect!==aspect){const offset=this.camera.position.clone().sub(this.controls.target);this.camera.position.copy(this.controls.target).add(offset.multiplyScalar(Math.max(1,1/aspect)/Math.max(1,1/this.viewportAspect)));}this.viewportAspect=aspect;this.renderer.setSize(width,height,false);this.camera.aspect=aspect;this.camera.updateProjectionMatrix();}
  clear(){while(this.group.children.length){const node=this.group.children[0];this.group.remove(node);node.traverse(o=>{o.geometry?.dispose();const dispose=m=>{m.map?.dispose();m.dispose();};if(Array.isArray(o.material))o.material.forEach(dispose);else if(o.material)dispose(o.material);});}}
  mesh(frames,r,color,opacity=1){
    const points=[],normals=[],indices=[],count=40;
    for(const f of frames)for(let i=0;i<=count;i++){
      const phi=i/count*Math.PI*2,n=add(mul(f.outside,Math.cos(phi)),mul(f.side,Math.sin(phi)));
      points.push(...add(f.center,mul(n,r)));normals.push(...n);
    }
    for(let j=0;j<frames.length-1;j++)for(let i=0;i<count;i++){const a=j*(count+1)+i,b=a+count+1;indices.push(a,b,a+1,b,b+1,a+1);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setIndex(indices);
    const material=new THREE.MeshStandardMaterial({color,roughness:.5,metalness:.15,side:THREE.DoubleSide,transparent:opacity<1,opacity,depthWrite:opacity===1});
    const mesh=new THREE.Mesh(geometry,material);this.group.add(mesh);return mesh;
  }
  line(points,color,dashed=false){const geo=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p)));const material=dashed?new THREE.LineDashedMaterial({color,dashSize:this.span/40,gapSize:this.span/65}):new THREE.LineBasicMaterial({color});const line=new THREE.Line(geo,material);line.computeLineDistances();this.group.add(line);}
  label(text,position,color='#fff'){const canvas=document.createElement('canvas'),c=canvas.getContext('2d');c.font='bold 26px Arial';canvas.width=Math.ceil(c.measureText(text).width)+24;canvas.height=54;c.fillStyle='rgba(10,24,40,.85)';c.fillRect(0,0,canvas.width,54);c.fillStyle=color;c.font='bold 26px Arial';c.textAlign='center';c.fillText(text,canvas.width/2,36);const map=new THREE.CanvasTexture(canvas),sprite=new THREE.Sprite(new THREE.SpriteMaterial({map,depthTest:false,sizeAttenuation:false}));sprite.position.set(...position);sprite.scale.set(.055*canvas.width/54,.055,1);this.group.add(sprite);return sprite;}
  updateRoute(plan,piece='offset',selected=0,reset=true){
    if(piece!=='offset'){
      const elbow=plan?.elements.find(e=>e.id===piece&&e.type==='elbow'&&e.kind==='cut');
      if(elbow){this.update({valid:true,params:plan.params,travel:elbow.radius,elbows:{a:elbow,b:elbow}},'a',selected,reset);return;}
    }
    this.clear();if(!plan?.valid)return;
    this.result={route:true};this.view=piece;this.span=Math.max(...plan.envelope.size,plan.params.od,1);
    const radius=plan.params.od/2,parts=routeSurfaceParts(plan,piece);
    for(const part of parts){
      const color=part.type==='component'?'#e3ad56':part.type==='pipe'?'#c0cedc':'#74caff';
      this.mesh(part.frames,radius,color).userData.piece=part.id;
      if(part.type==='component'){
        const e=part.element,frame=part.frames[0],band=(fraction,width,r)=>this.mesh([{...frame,center:add(e.start,mul(e.direction,e.length*fraction-width/2))},{...frame,center:add(e.start,mul(e.direction,e.length*fraction+width/2))}],r,color).userData.piece=e.id;
        const thickness=Math.min(e.length*.08,radius*.22);band(.1,thickness,radius*1.65);band(.9,thickness,radius*1.65);
        if(e.kind==='flangePair'){band(.46,thickness,radius*1.8);band(.54,thickness,radius*1.8);}else{
          band(.5,e.length*.3,radius*1.35);
          if(e.kind==='valve'){const top=add(part.middle,mul(frame.outside,radius*3));this.line([part.middle,top],color);const wheel=new THREE.Mesh(new THREE.TorusGeometry(radius*.75,radius*.09,8,32),new THREE.MeshStandardMaterial({color}));wheel.position.set(...top);wheel.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(...frame.outside));wheel.userData.piece=e.id;this.group.add(wheel);}
        }
      }
      this.label(part.id,add(part.middle,mul(part.frames[Math.floor(part.frames.length/2)].outside,radius*2)),color).userData.piece=part.id;
    }
    const ring=(center,frame,color)=>this.line(Array.from({length:65},(_,i)=>add(center,mul(add(mul(frame.outside,Math.cos(i*Math.PI/32)),mul(frame.side,Math.sin(i*Math.PI/32))),radius))),color);
    if(piece==='offset'){
      for(const joint of plan.joints){
        const part=parts.find(p=>p.id===plan.elements[plan.joints.indexOf(joint)]?.id)??parts.at(-1);
        const frame=joint===plan.joints.at(-1)?part.frames.at(-1):part.frames[0];
        ring(joint.start,frame,'#ffd479');if(joint.amount>0)ring(joint.finish,frame,'#ffd479');
        if(this.jointLabels)this.label(joint.id,add(joint.start,mul(frame.side,radius*2.4)),'#ffd479');
      }
      for(const end of ['a','b']){
        const port=plan.context.ports[end],frame=end==='a'?parts[0].frames[0]:parts.at(-1).frames.at(-1);
        const outward=mul(plan.context.axes[end],end==='a'?1:-1),stub=add(port,mul(outward,-Math.min(this.span/8,plan.params.od*2)));
        this.mesh([{...frame,center:stub},{...frame,center:port}],radius,'#657f98');ring(port,frame,'#fff');
        // Port tag sits on the existing stub, so it never collides with a short elbow's own tag.
        this.label(end.toUpperCase()+' 口',add(stub,mul(frame.outside,radius*2.2)));
      }
    }else for(const part of parts){ring(part.frames[0].center,part.frames[0],'#ffd479');ring(part.frames.at(-1).center,part.frames.at(-1),'#ffd479');}
    if(reset)this.fit();
  }
  update(r,view='offset',selected=0,reset=true){
    this.clear();if(!r?.valid)return;this.result=r;this.view=view;this.span=Math.max(r.travel,r.params.od,r.elbows.a.radius,r.elbows.b.radius);
    const radius=r.params.od/2;
    if(view==='offset') {
      for(const end of ['a','b'])this.mesh(Array.from({length:49},(_,i)=>offsetSurfaceFrame(r,end,i/48)),radius,end==='a'?'#74caff':'#efb06f').userData.piece=end.toUpperCase();
      const start=add(offsetCenterline(r,'a',1),mul(r.direction,r.elbows.a.gap));
      const finish=add(offsetCenterline(r,'b',0),mul(r.direction,-r.elbows.b.gap));
      const f=offsetSurfaceFrame(r,'a',1);this.mesh([{...f,center:start},{...f,center:finish}],radius,'#c0cedc').userData.piece='P1';
      const ext=Math.min(r.travel/5,r.params.od*2),x=[1,0,0];
      const a=offsetSurfaceFrame(r,'a',0),b=offsetSurfaceFrame(r,'b',1);
      if(r.basis==='ports'){
        for(const end of ['a','b']){
          const frame=end==='a'?a:b,axis=r.axes[end],port=r.ports[end],outward=mul(axis,end==='a'?1:-1),e=r.elbows[end];
          const original=add(port,mul(outward,-ext));this.mesh([{...frame,center:original},{...frame,center:port}],radius,'#657f98');
          const mouth=add(port,mul(outward,e.portGap));
          if(e.tangent>0)this.mesh([{...frame,center:mouth},frame],radius,end==='a'?'#74caff':'#efb06f');
          this.line(Array.from({length:65},(_,i)=>add(port,mul(add(mul(frame.outside,Math.cos(i*Math.PI/32)),mul(frame.side,Math.sin(i*Math.PI/32))),radius))),'#ffffff');
          this.group.add(new THREE.ArrowHelper(new THREE.Vector3(...outward),new THREE.Vector3(...port),Math.max(radius*1.5,this.span*.08),0xe2effb));
          this.label(end.toUpperCase()+' 口',add(port,mul(frame.outside,radius*1.9)),end==='a'?'#8ad3ff':'#ffc891');
          if(this.jointLabels)this.label(end==='a'?'G1':'G4',add(mouth,mul(frame.side,radius*1.6)));
        }
        this.line([r.ports.a,r.ports.b],'#a5c5e7',true);
        const p=r.ports.a,q=r.ports.b;this.line([p,[q[0],p[1],p[2]],[q[0],q[1],p[2]],q],'#5b7798',true);
        if(this.jointLabels){this.label('G2',add(start,mul(f.side,radius*1.6)));this.label('G3',add(finish,mul(f.side,radius*1.6)));}
      }else{this.mesh([{...a,center:add(a.center,mul(x,-ext))},a],radius,'#74caff');this.mesh([b,{...b,center:add(b.center,mul(x,ext))}],radius,'#efb06f');}
      this.line([r.intersections.a,r.intersections.b],'#a5c5e7',true);
      if(r.basis!=='ports'){const p=r.intersections.b;this.line([[0,0,0],[p[0],0,0],[p[0],p[1],0],p],'#5b7798',true);}
    } else {
      const e=r.elbows[view];if(e.kind!=='cut'){if(reset)this.fit();return;}
      const theta=e.theta,frame=beta=>({center:[e.radius*Math.sin(beta),0,e.radius*(1-Math.cos(beta))],outside:[Math.sin(beta),0,-Math.cos(beta)],side:[0,1,0]});
      this.mesh(Array.from({length:65},(_,i)=>frame(theta*i/64)),radius,view==='a'?'#74caff':'#efb06f');
      if(e.tangent>0)this.mesh([{...frame(0),center:[-e.tangent,0,0]},frame(0)],radius,view==='a'?'#74caff':'#efb06f');
      const donor=e.donor*Math.PI/180;
      if(donor>theta+1e-10)this.mesh(Array.from({length:33},(_,i)=>frame(theta+(donor-theta)*i/32)),radius,'#a8b5c5',.18);
      const f=frame(theta);this.line(Array.from({length:65},(_,i)=>add(f.center,mul(add(mul(f.outside,Math.cos(i*Math.PI/32)),mul(f.side,Math.sin(i*Math.PI/32))),radius))),'#ffd479');
      const station=e.stations[Math.min(selected,e.stations.length-1)];
      if(station){const phi=station.clock*Math.PI/180;this.line(Array.from({length:65},(_,i)=>{const q=frame(theta*i/64);return add(q.center,mul(add(mul(q.outside,Math.cos(phi)),mul(q.side,Math.sin(phi))),radius));}),'#ffffff');const dot=new THREE.Mesh(new THREE.SphereGeometry(radius*.045,12,8),new THREE.MeshBasicMaterial({color:'#fff'}));dot.position.set(...station.point);this.group.add(dot);}
      this.line(Array.from({length:65},(_,i)=>frame(donor*i/64).center),'#8298b3',true);
    }
    if(reset)this.fit();
  }
  fit(){
    this.settle();this.resize();
    const box=new THREE.Box3().setFromObject(this.group);if(box.isEmpty())return;
    const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),span=Math.max(size.x,size.y,size.z,1);
    const plane=this.result?.plane??[0,0,1];
    const normal=this.result?.basis==='ports'?cross(this.result.axes.a,plane):[0,-plane[2],plane[1]];
    const sight=this.result?.route?new THREE.Vector3(-1,-1,.85):this.view==='offset'?new THREE.Vector3(normal[0]+.22,normal[1]-.15,normal[2]+.22):new THREE.Vector3(.3,-1,.3);
    sight.normalize();const right=new THREE.Vector3().crossVectors(this.camera.up,sight).normalize(),up=new THREE.Vector3().crossVectors(sight,right).normalize();
    const tan=Math.tan(this.camera.fov*Math.PI/360);let distance=1;
    const include=point=>{const q=point.sub(center),depth=q.dot(sight);distance=Math.max(distance,depth+Math.abs(q.dot(up))/tan,depth+Math.abs(q.dot(right))/(tan*this.camera.aspect));};
    this.group.traverse(node=>{const positions=node.geometry?.getAttribute('position');if(positions)for(let i=0;i<positions.count;i++)include(new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(node.matrixWorld));else if(node.isSprite)include(node.getWorldPosition(new THREE.Vector3()));});distance*=1.16;
    this.camera.position.copy(center).add(sight.multiplyScalar(distance));this.camera.near=Math.max(.01,span/10000);this.camera.far=Math.max(10000,span*100);this.camera.updateProjectionMatrix();this.controls.minDistance=span*.12;this.controls.maxDistance=distance*6;this.controls.target.copy(center);this.controls.update(0);
  }
}
