import {v1102SupportPlan,supportArc} from './tank-support-plan.js';
// Unknown 9t outlines remain wireframes, never finished cutting profiles.
export function addV1102Support(r,THREE,mesh){
  const plan=v1102SupportPlan(r);if(!plan)return;
  for(const p of plan.parts){
    let m;
    if(p.kind==='base'){
      if(p.holePosition==='specified'&&p.holeDiameter>0){
        const [L,W,t]=p.dimensions,shape=new THREE.Shape();shape.moveTo(-L/2,-W/2);shape.lineTo(L/2,-W/2);shape.lineTo(L/2,W/2);shape.lineTo(-L/2,W/2);shape.closePath();
        for(const [x,y] of p.holeCenters){const hole=new THREE.Path(),radius=p.holeDiameter/2,half=Math.max(0,(p.slotLength??p.holeDiameter)-p.holeDiameter)/2;hole.moveTo(x+radius,y+half);hole.absarc(x,y+half,radius,0,Math.PI,false);hole.lineTo(x-radius,y-half);hole.absarc(x,y-half,radius,Math.PI,Math.PI*2,false);hole.closePath();shape.holes.push(hole);}
        m=mesh(new THREE.ExtrudeGeometry(shape,{depth:t,bevelEnabled:false,curveSegments:24}),0,'#93a5ad');m.position.set(0,p.station,plan.floor);
      }else{m=mesh(new THREE.BoxGeometry(...p.dimensions),0,'#93a5ad');m.position.set(0,p.station,plan.floor+p.dimensions[2]/2);}
      // Axial hole-row offset is unknown: do not drill a guessed centred row.
    }else if(p.kind==='rolled'){
      const shape=new THREE.Shape(),inner=supportArc(p.radius,0,p.angle),outer=supportArc(p.radius+p.thickness,0,p.angle);
      inner.forEach(([x,y,z],i)=>i?shape.lineTo(x,z):shape.moveTo(x,z));outer.reverse().forEach(([x,y,z])=>shape.lineTo(x,z));shape.closePath();
      m=mesh(new THREE.ExtrudeGeometry(shape,{depth:p.width,bevelEnabled:false}),0,'#c5ad79');m.rotation.x=Math.PI/2;m.position.y=p.station+p.width/2;
    }else if(p.kind==='profile-zone'){
      m=mesh(new THREE.BoxGeometry(p.thickness,p.footWidth,p.previewTop-p.bottom),0,'#8b9aab');m.position.set(p.x,p.station,(p.previewTop+p.bottom)/2);
      const wire=new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry),new THREE.LineBasicMaterial({color:'#8b9aab',transparent:true,opacity:.55}));wire.position.copy(m.position);const parent=m.parent;parent.add(wire);parent.remove(m);m.geometry.dispose();m.material.dispose();m=wire;
    }else if(p.kind==='contact-zone'){
      const pts=supportArc(p.radius+p.thickness/2,p.station,p.angle).map(a=>new THREE.Vector3(...a));
      m=mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),64,1.4,4,false),0,'#8898a8');m.material.transparent=true;m.material.opacity=.55;
    }
    if(m)m.userData={pieceId:p.id,bomId:p.bomId,color:m.material.color.getStyle(),referenceOnly:p.status==='outline-pending'};
  }
}
