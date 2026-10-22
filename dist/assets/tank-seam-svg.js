import {shellSeamDisplayModel,seamZoneOutline} from './tank-seam-display.js';
// mapZ maps the common axial mm into each host drawing's course layout.
export function seamOverlaySVG(r,{x,width,mapZ,courseRect,first=1,last=r.courses,clipId}){
  const model=shellSeamDisplayModel(r);if(!model.active)return '';
  const sx=width/r.circumference,stroke=bad=>bad?'#c53d2e':'#b88839';let out='';
  for(const b of model.bands){if(b.course<first||b.course>last)continue;
    if(b.kind==='longitudinal'){const rect=courseRect(b.course),bw=b.width*model.scaleX*sx;for(const shift of [-width,0,width])out+=`<rect data-seam-band="${b.id}" x="${x+b.angle/360*width-bw/2+shift}" y="${rect.y}" width="${bw}" height="${rect.h}" fill="${stroke(b.conflict)}" fill-opacity=".4"><title>${b.id} 焊道總寬 ${b.width} mm</title></rect>`;}
    else {const a=mapZ(b.z-b.width/2),c=mapZ(b.z+b.width/2);out+=`<rect data-seam-band="${b.id}" x="${x}" y="${Math.min(a,c)}" width="${width}" height="${Math.abs(c-a)}" fill="${stroke(b.conflict)}" fill-opacity=".35"><title>${b.id} 焊道總寬 ${b.width} mm</title></rect>`;}
  }
  for(const zone of model.zones)for(const working of [false,true]){
    if(working&&zone.workDistance===0)continue;
    const points=seamZoneOutline(zone,{working});
    for(const shift of [-width,0,width]){const d=points.map(([px,pz],i)=>`${i?'L':'M'}${x+px*sx+shift} ${mapZ(pz)}`).join(' ')+'Z';
      out+=`<path data-seam-zone="${zone.id}" data-seam-working="${working}" d="${d}" fill="none" stroke="${zone.conflict?'#c53d2e':working?'#437ab1':'#b88839'}" stroke-width="1.5"${working?' stroke-dasharray="4 3"':''}><title>${zone.nozzleId} ${zone.kind==='pad'?'補強板':'管嘴'}${working?'施工預留 '+zone.workDistance:'焊道外伸 '+zone.weldReach} mm</title></path>`;}
  }
  return `<g clip-path="url(#${clipId})" pointer-events="none" aria-hidden="true">${out}</g>`;
}
