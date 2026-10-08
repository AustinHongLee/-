import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {pieceColor} from './tank-visuals.js';
import {outerProfile} from './tank-heads.js';
const rad=d=>d*Math.PI/180;
// Helix around the tank axis in the tank frame (y = axis).
class Helix extends THREE.Curve{constructor(radius,y0,y1,a0,sweep){super();Object.assign(this,{radius,y0,y1,a0,sweep});}getPoint(t,target=new THREE.Vector3()){const a=rad(this.a0+this.sweep*t);return target.set(this.radius*Math.sin(a),this.y0+(this.y1-this.y0)*t,this.radius*Math.cos(a));}}
export class TankViewer{
  constructor(host,onSelect=()=>{},onNozzle=()=>{}){
    this.host=host;this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#eef4f7');this.camera=new THREE.PerspectiveCamera(40,1,.1,1e7);this.renderer=new THREE.WebGLRenderer({antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));host.replaceChildren(this.renderer.domElement);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.autoRotateSpeed=.8;
    this.scene.add(new THREE.HemisphereLight(0xffffff,0x687e8a,2.5));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(1,3,4);this.scene.add(light);this.group=new THREE.Group();
    // Plan angles run CLOCKWISE seen from above (plan view, A4, CSV). The estimate's (sinθ, y, cosθ) mapping and
    // CylinderGeometry run counter-clockwise in three.js (y up), so mirror z once here; data coordinates stay unchanged.
    this.group.scale.z=-1;this.scene.add(this.group);
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
    const p=r.input,f=r.frame,rad0=r.di/2,vertical=r.orientation!=='horizontal';
    // Vertical: mirror z so plan angles run clockwise from above. Horizontal: tank axis → world x, angle 0° → up,
    // clockwise when seen from the A end (world = (local y, local z, local x)).
    this.group.matrixAutoUpdate=false;
    this.group.matrix.copy(vertical?new THREE.Matrix4().makeScale(1,1,-1):new THREE.Matrix4().set(0,1,0,0,0,0,1,0,1,0,0,0,0,0,0,1));this.group.matrixWorldNeedsUpdate=true;
    const mesh=(geometry,y=0,color='#84b0c5')=>{const m=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,metalness:.35,roughness:.45,side:THREE.DoubleSide}));m.position.y=y;this.group.add(m);return m;};
    const bodyBottom=f.bodyBottom,outer=rad0+p.shellThickness;
    // Bound rendering complexity; the full piece list remains in the estimate and CSV.
    if(r.assembly.length<=500){for(const piece of r.assembly){const angle=piece.start/r.circumference*Math.PI*2,span=piece.length/r.circumference*Math.PI*2,color=pieceColor(piece.id),m=mesh(new THREE.CylinderGeometry(outer,outer,piece.height,Math.max(4,Math.ceil(span/Math.PI*36)),1,true,angle,span),bodyBottom+piece.z+piece.height/2,color);m.userData={pieceId:piece.id,color};
      const points=[new THREE.Vector3(outer*Math.sin(angle),bodyBottom+piece.z,outer*Math.cos(angle)),new THREE.Vector3(outer*Math.sin(angle),bodyBottom+piece.z+piece.height,outer*Math.cos(angle))];this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:'#456477'})));
    }}else mesh(new THREE.CylinderGeometry(outer,outer,r.bodyHeight,72,1,true),bodyBottom+r.bodyHeight/2);
    for(let i=1;i<r.courses;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(outer+.5,Math.max(r.di/800,1),6,96),new THREE.MeshBasicMaterial({color:'#477f99'}));ring.rotation.x=Math.PI/2;ring.position.y=bodyBottom+i*(r.courseHeight+p.gap)-p.gap/2;this.group.add(ring);}
    for(const which of ['bottom','top']){
      const end=r.ends[which],sign=which==='bottom'?-1:1,tangent=which==='bottom'?f.bottomTangent:f.topTangent;
      if(end.type==='open')continue;
      if(end.type==='flat'){const er=outer+p.overhang;mesh(new THREE.CylinderGeometry(er,er,end.t,72),which==='bottom'?end.t/2:f.topTangent+end.t/2,'#adc8d6');continue;}
      const profile=outerProfile(end).map(([x,d])=>new THREE.Vector2(Math.max(0,x),tangent+sign*d));profile.push(new THREE.Vector2(0,tangent+sign*end.outer));
      mesh(new THREE.LatheGeometry(which==='bottom'?profile:profile.slice().reverse(),72),0,'#aec9d7');
      if(end.straight)mesh(new THREE.CylinderGeometry(rad0+end.t,rad0+end.t,end.straight,72,1,true),tangent-sign*end.straight/2,'#aec9d7');
    }
    for(const n of r.nozzlePlan?.items??[]){const bad=(n.warnings??[]).some(w=>/相交|碰到|低於|無法|伸到|不一致|超出/.test(w)),direction=new THREE.Vector3(...n.direction),start=new THREE.Vector3(...n.pipeStart),end=new THREE.Vector3(...n.pipeEnd),axis=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction),add=(geometry,point,color)=>{const m=mesh(geometry,0,color);m.position.copy(point);m.quaternion.copy(axis);m.userData={nozzleId:n.id,color};return m;},length=start.distanceTo(end),center=start.clone().add(end).multiplyScalar(.5);
      add(new THREE.CylinderGeometry(n.od/2,n.od/2,length,32,1,true),center,bad?'#d0675e':'#739caf');add(new THREE.CylinderGeometry(n.od/2-n.thickness,n.od/2-n.thickness,length,32,1,true),center,'#7892a0');
      if(n.end!=='bare'){const face=new THREE.Vector3(...n.face),shape=new THREE.Shape();shape.absarc(0,0,n.flangeOD/2,0,Math.PI*2,false);const bore=new THREE.Path();bore.absarc(0,0,n.od/2,0,Math.PI*2,true);shape.holes.push(bore);const disk=mesh(new THREE.ExtrudeGeometry(shape,{depth:n.flangeThickness,bevelEnabled:false,curveSegments:32}),0,'#cdb17f');disk.position.copy(face.clone().addScaledVector(direction,-n.flangeThickness));disk.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),direction);disk.userData={nozzleId:n.id,color:bad?'#de8f86':'#cdb17f'};if(bad)disk.material.color.set('#de8f86');
        const neckLength=n.flangeLength-n.flangeThickness;if(neckLength>0)add(new THREE.CylinderGeometry(Math.min(n.flangeOD*.4,n.od*.72),n.od/2,neckLength,32,1,true),face.clone().addScaledVector(direction,-n.flangeThickness-neckLength/2),'#bca577');
        if(n.kind==='manhole'){const cover=mesh(new THREE.CylinderGeometry(n.flangeOD/2,n.flangeOD/2,n.coverThickness||n.flangeThickness,48),0,'#b99d6d');cover.position.copy(face.clone().addScaledVector(direction,(n.coverThickness||n.flangeThickness)/2+2));cover.quaternion.copy(axis);cover.userData={nozzleId:n.id,color:'#b99d6d'};}}
      if(n.padRadius>0&&n.host==='shell'){const theta=n.angle*Math.PI/180,half=Math.asin(Math.min(1,n.padRadius/(outer+n.padThickness/2))),pad=mesh(new THREE.CylinderGeometry(outer+n.padThickness/2,outer+n.padThickness/2,2*n.padRadius,24,1,true,theta-half,2*half),bodyBottom+n.height,'#d9c08f');pad.userData={nozzleId:n.id,color:'#d9c08f'};}
    }
    this.attachments(r,mesh);
    this.setSelected(this.selected);this.setNozzleSelected(this.selectedNozzle);this.reset();
  }
  attachments(r,mesh){
    const a=r.attachments;if(!a)return;
    const f=r.frame,ro=r.od/2,ri=r.di/2,steel='#8fa7b4',accent='#c9a467',vertical=r.orientation!=='horizontal';
    const put=(geometry,[x,y,z],color=steel,rotY=0)=>{const m=mesh(geometry,0,color);m.position.set(x,y,z);m.rotation.y=rotY;return m;};
    const polar=(radius,angle,y)=>[radius*Math.sin(rad(angle)),y,radius*Math.cos(rad(angle))];
    const s=a.supports,g=s.geometry??{};
    if(s.type==='legs')for(const ang of g.angles){const [x,,z]=polar(g.radius,ang,0),len=g.top-g.floor;put(new THREE.CylinderGeometry(g.size/2,g.size/2,len,20),[x,(g.top+g.floor)/2,z]);put(new THREE.BoxGeometry(g.base,12,g.base),[x,g.floor+6,z],steel,rad(ang));}
    if(s.type==='lugs')for(const ang of g.angles){put(new THREE.BoxGeometry(g.projection,14,g.width),polar(ro+g.projection/2,ang,g.elevation),steel,rad(ang-90));put(new THREE.BoxGeometry(g.projection,g.height,12),polar(ro+g.projection/2,ang,g.elevation+g.height/2),steel,rad(ang-90));}
    if(s.type==='skirt'){const h=f.bottomTangent-g.floor;mesh(new THREE.CylinderGeometry(ro,ro,h,72,1,true),g.floor+h/2,steel);const ring=mesh(new THREE.RingGeometry(g.ringIn,g.ringOut,72),g.floor+1,'#7f97a4');ring.rotation.x=-Math.PI/2;}
    if(s.type==='anchors')for(const ang of g.angles)put(new THREE.BoxGeometry(g.top,g.height,g.top),polar(ro+g.top/2,ang,f.bottomTangent+g.height/2),steel,rad(ang));
    if(s.type==='saddles'){for(const y of g.positions){const shape=new THREE.Shape(g.web.map(([u,v])=>new THREE.Vector2(u,v))),web=mesh(new THREE.ExtrudeGeometry(shape,{depth:r.methods.supports.plateThickness,bevelEnabled:false}),0,steel);web.rotation.x=Math.PI/2;const bt=g.baseThickness??16;web.position.set(0,y+r.methods.supports.plateThickness/2,-(ro+g.clearance)+bt);
      put(new THREE.BoxGeometry(g.webW+100,g.width,bt),[0,y,-(ro+g.clearance)+bt/2]);
      if(g.wearAngle){const half=rad(g.wearAngle/2),rw=ro+(g.wearThickness??r.input.shellThickness)/2;mesh(new THREE.CylinderGeometry(rw,rw,g.width+100,32,1,true,Math.PI-half,2*half),y,'#9fb3bf');}}}
    for(const ring of a.rings.items){const inner=ring.side==='out'?ro:ri-ring.a,band=mesh(new THREE.RingGeometry(inner,inner+ring.a,96),ring.elevation,accent);band.rotation.x=-Math.PI/2;if(ring.section!=='flat'){const leg=ring.section==='angle'?ring.b:ring.b;mesh(new THREE.CylinderGeometry(ring.side==='out'?ro+ring.t/2:ri-ring.t/2,ring.side==='out'?ro+ring.t/2:ri-ring.t/2,leg,96,1,true),ring.elevation+leg/2,accent);}}
    const acc=a.access.geometry??{};
    if(acc.ladder){const L=acc.ladder,ang=vertical?L.angle:90,radial=ro+L.standoff,center=polar(radial,ang,0),tangent=[Math.cos(rad(ang)),0,-Math.sin(rad(ang))],y0=vertical?L.floor:0,y1=vertical?L.top:0;
      if(vertical){for(const side of [-1,1]){const x=center[0]+tangent[0]*side*(L.width/2+5),z=center[2]+tangent[2]*side*(L.width/2+5);put(new THREE.BoxGeometry(10,y1-y0,65),[x,(y0+y1)/2,z],steel,rad(ang));}
        for(let i=0;i<Math.min(L.rungs,120);i++){const y=y0+L.pitch*(i+1);if(y>y1)break;put(new THREE.BoxGeometry(L.width,20,20),[center[0],y,center[2]],steel,rad(ang));}
        if(L.cage)for(let y=y0+L.cage.start;y<=y1;y+=900){const hoop=mesh(new THREE.TorusGeometry(350,5,6,24,Math.PI),y,'#7f97a4');hoop.rotation.x=Math.PI/2;hoop.rotation.z=rad(ang)+Math.PI/2;hoop.position.x=polar(radial+120,ang,0)[0];hoop.position.z=polar(radial+120,ang,0)[2];}}
      else{const yA=f.bottomTangent+300,zb=-(ro+r.methods.supports.clearance),zt=ro+L.length-L.rise;for(const side of [-1,1])put(new THREE.BoxGeometry(65,10,zt-zb),[radial,yA+side*(L.width/2+5),(zb+zt)/2]);for(let z=zb+L.pitch;z<zt;z+=L.pitch)put(new THREE.BoxGeometry(20,L.width,20),[radial,yA,z]);}}
    if(acc.stair){const st=acc.stair,inner=new Helix(st.inner,st.floor,st.top,st.start,st.sweep),outerH=new Helix(st.outer,st.floor,st.top,st.start,st.sweep),rail=new Helix(st.outer,st.floor+r.methods.access.railHeight,st.top+r.methods.access.railHeight,st.start,st.sweep),seg=Math.max(24,Math.ceil(st.sweep/4));
      mesh(new THREE.TubeGeometry(inner,seg,18,6),0,steel);mesh(new THREE.TubeGeometry(outerH,seg,18,6),0,steel);mesh(new THREE.TubeGeometry(rail,seg,14,6),0,'#c0a070');
      for(let i=1;i<st.risers&&i<240;i++){const t=i/st.risers,ang=st.start+st.sweep*t;put(new THREE.BoxGeometry(st.outer-st.inner,25,Math.max(150,st.going)),polar((st.inner+st.outer)/2,ang,st.floor+st.rise*t),'#b5c2ca',rad(ang-90));}}
    if(acc.platform){const ang=r.methods.access.ladderAngle;put(new THREE.BoxGeometry(acc.platform.width,30,acc.platform.length),polar(ro+acc.platform.width/2,ang,vertical?f.bodyTop:ro),'#b5c2ca',rad(ang-90));}
    if(acc.roofRail&&vertical){const t=mesh(new THREE.TorusGeometry(ro+50,14,6,120),f.bodyTop+r.methods.access.railHeight,'#c0a070');t.rotation.x=Math.PI/2;}
    const j=a.jacket,jg=j.geometry??{};
    if(j.type==='halfpipe'){const helix=new Helix(ro+jg.pipeOD/4,f.bodyBottom+jg.from,f.bodyBottom+jg.to,0,360*jg.turns);mesh(new THREE.TubeGeometry(helix,Math.min(6000,Math.ceil(jg.turns*48)),jg.pipeOD/2,8),0,accent);}
    if(j.type==='coil'){const helix=new Helix(jg.diameter/2,f.bodyBottom+jg.from,f.bodyBottom+jg.to,0,360*jg.turns);mesh(new THREE.TubeGeometry(helix,Math.min(6000,Math.ceil(jg.turns*48)),jg.pipeOD/2,8),0,accent);}
    if(j.type==='full'){const h=jg.to-jg.from,c=mesh(new THREE.CylinderGeometry(jg.id/2+jg.thickness,jg.id/2+jg.thickness,h,72,1,true),f.bodyBottom+jg.from+h/2,accent);c.material.transparent=true;c.material.opacity=.45;}
    const ig=a.internals.geometry??{};
    if(ig.angles)for(const ang of ig.angles)put(new THREE.BoxGeometry(ig.width,ig.length,ig.thickness),polar(ri-ig.gap-ig.width/2,ang,f.bottomTangent+100+ig.length/2),'#c9a467',rad(ang-90));
    const lg=a.lifting.geometry??{};
    if(lg.count)for(let i=0;i<lg.count;i++){
      if(vertical)put(new THREE.BoxGeometry(lg.thickness,lg.height,lg.width),polar(ro+lg.thickness/2,i*360/lg.count,f.bodyTop+lg.height/2),'#c88931',rad(i*360/lg.count));
      else{const t=lg.count===1?.5:.15+.7*i/(lg.count-1);put(new THREE.BoxGeometry(lg.thickness,lg.width,lg.height),[0,f.bottomTangent+r.height*t,ro+lg.height/2],'#c88931');}}
    const mg=a.misc?.geometry??{};
    if(mg.sump){const sp=mg.sump,c=mesh(new THREE.CylinderGeometry(sp.diameter/2+sp.t,sp.diameter/2+sp.t,sp.depth,40),-sp.depth/2,'#9fb3bf');c.position.x=sp.x;c.position.z=sp.z;}
    if(mg.nameplate){const n=mg.nameplate,y=vertical?f.bodyBottom+Math.min(1500,r.bodyHeight*.6):f.bottomTangent+r.height*.5,ang=vertical?0:300;put(new THREE.BoxGeometry(n.w,n.h,n.t),polar(ro+n.standoff+n.t/2,ang,y),'#d9c08f',rad(ang));}
    if(mg.grounding)for(let i=0;i<mg.grounding.count;i++){const ang=90+i*360/mg.grounding.count,y=vertical?f.bodyBottom+150:f.bottomTangent+r.height*(i+1)/(mg.grounding.count+1);put(new THREE.BoxGeometry(mg.grounding.t,mg.grounding.w,mg.grounding.h),polar(ro+mg.grounding.h/2,ang,y),'#c88931',rad(ang));}
    const ins=r.process?.surface?.insulation;if(ins){const c=mesh(new THREE.CylinderGeometry(ro+ins.thickness,ro+ins.thickness,r.bodyHeight,72,1,true),f.bodyBottom+r.bodyHeight/2,'#e8e2d4');c.material.transparent=true;c.material.opacity=.28;c.material.depthWrite=false;}
  }
}
