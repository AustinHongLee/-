import {editableShellSeams} from './tank-seam-edit-model.js';
export function seamHandleMarkup(r,frame,selected=''){
  const {x,w,boxes,shownCourses,shownPanels}=frame,bad=new Set([...(r.shellLayoutState?.badSeams??[]),...r.nozzlePlan.items.flatMap(n=>n.seamCheck?.hits.map(h=>h.id)??[])]);
  return `<g class="seam-edit-handles">${editableShellSeams(r).filter(s=>s.course<=shownCourses&&(s.kind==='circumferential'?s.course<shownCourses:s.panel<=shownPanels)).map(s=>{
    const ring=s.kind==='circumferential',box=boxes.get(s.course),xx=ring?x+w/2:x+s.position/r.circumference*w,yy=ring?box.y-frame.gapY:box.y+box.h/2,d=ring?`M${x} ${yy}h${w}`:`M${xx} ${box.y}v${box.h}`,color=bad.has(s.id)?'#c53d2e':'#177d71',active=s.id===selected;
    return `<g data-edit-seam="${s.id}" data-seam-kind="${s.kind}" class="seam-edit-handle${active?' is-selected':''}${bad.has(s.id)?' is-bad':''}" role="slider" tabindex="0" aria-label="移動${ring?'環縫':'縱縫'} ${s.id}" aria-valuemin="0" aria-valuemax="${ring?r.bodyHeight:r.circumference}" aria-valuenow="${s.position}" aria-valuetext="接縫中心 ${Number(s.position.toFixed(2))} mm" aria-orientation="${ring?'vertical':'horizontal'}"><title>${s.id}：${ring?'上下移動環縫，改兩圈板高':'左右移動縱縫，改兩側片寬'}；方向鍵每次 1 mm，Shift 為 10 mm</title><path d="${d}" class="seam-edit-hit" stroke="transparent" stroke-width="26" vector-effect="non-scaling-stroke" fill="none"/><path d="${d}" stroke="${color}" stroke-width="${active?3:1.8}" vector-effect="non-scaling-stroke" fill="none" pointer-events="none"/><circle cx="${xx}" cy="${yy}" r="${active?10:8}" fill="white" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" pointer-events="none"/><path d="${ring?`M${xx-3} ${yy-2}l3-3 3 3M${xx-3} ${yy+2}l3 3 3-3`:`M${xx-2} ${yy-3}l-3 3 3 3M${xx+2} ${yy-3}l3 3-3 3`}" stroke="${color}" stroke-width="1.5" fill="none" pointer-events="none"/>${ring||active?`<text x="${ring?x+w+8:xx+12}" y="${yy-9}" font-size="12" fill="${color}" pointer-events="none">${s.id}</text>`:''}</g>`;
  }).join('')}</g>`;
}

// Proposed position only; it never enters the common drawing/print model until
// the user applies it. It must not intercept a seam drag or select a plate.
export function seamSuggestionMarkup(r,frame,suggestion){
  if(!suggestion?.ok)return '';
  const seam=editableShellSeams(r).find(s=>s.id===suggestion.id),box=frame.boxes.get(seam?.course);if(!box)return '';
  const ring=seam.kind==='circumferential',xx=frame.x+suggestion.position*frame.scaleX,yy=box.y-frame.gapY-suggestion.delta*frame.scaleY,d=ring?`M${frame.x} ${yy}h${frame.w}`:`M${xx} ${box.y}v${box.h}`,labelX=ring?frame.x+12:Math.min(frame.x+frame.w-86,Math.max(frame.x+3,xx+8)),labelY=ring?yy-8:box.y+17;
  return `<g class="seam-edit-suggestion" pointer-events="none" aria-label="建議 ${seam.id} 中心 ${Number(suggestion.position.toFixed(2))} mm"><path data-seam-suggested="${seam.id}" d="${d}" fill="none" stroke="#267a9b" stroke-width="2.5" stroke-dasharray="7 5" vector-effect="non-scaling-stroke"/><text x="${labelX}" y="${labelY}" font-size="12" font-weight="600" fill="#206786" stroke="white" stroke-width="4" paint-order="stroke">建議 ${seam.id}</text></g>`;
}
