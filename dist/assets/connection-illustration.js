/** Local section drawings for the field operator. These are deliberately not
 * scaled geometry, a welding detail, or a substitute for the computed model.
 * No state or DOM is changed by these renderers.
 */
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const amount=value=>Number.isFinite(Number(value))?`${Number(Number(value).toFixed(3))} mm`:'待填';
const finiteNonnegative=value=>Number.isFinite(Number(value))&&Number(value)>=0;

function dimension(x,y1,y2,color='#1764ad'){
  if(Math.abs(y1-y2)<.1)return `<path d="M${x-5} ${y1}h10M${x} ${y1-5}v10" stroke="${color}" stroke-width="2"/>`;
  const top=Math.min(y1,y2),bottom=Math.max(y1,y2);
  return `<path d="M${x-6} ${top}h12M${x-6} ${bottom}h12M${x} ${top}V${bottom}" stroke="${color}" stroke-width="1.6"/><path d="M${x} ${top}l-3 6h6ZM${x} ${bottom}l-3-6h6Z" fill="${color}"/>`;
}
function wall(x,width){
  return `<rect x="${x}" y="110" width="${width}" height="35" fill="#cbd5df"/><path d="M${x} 110h${width}M${x} 145h${width}" stroke="#52677c" stroke-width="2"/>`;
}

/** Returns one accessible, large section figure with current dimensional readbacks.
 * The diagram shows a normal insertion solely to clarify the cut/keep relationship;
 * actual angle, curved fishmouth and thickness contours remain in the 3D model.
 */
export function connectionIllustration(params={}){
  const p=params,closed=p.motherOpening===false&&['elbow','cone'].includes(p.hostType),inside=p.jointType==='in'&&!closed;
  const title=closed?'外焊支撐：母管不切孔':inside?'開孔內插：穿過近側母壁':'外貼開孔：管端停在母壁外';
  const gapValid=finiteNonnegative(p.rootGap??0),projectionValid=finiteNonnegative(p.projection??0),holeValid=finiteNonnegative(p.holeGap??0);
  const gap=Number(p.rootGap??0),projection=Number(p.projection??0),hole=Number(p.holeGap??0);
  const gapShown=gapValid&&gap>0?Math.min(26,11+Math.log1p(gap)*3):0;
  const projectionShown=projectionValid&&projection>0?Math.min(51,20+Math.log1p(projection)*5):0;
  const holeShown=holeValid&&hole>0?8:0;
  const branchEnd=inside?145+projectionShown:110-gapShown,cutLeft=inside?128-holeShown:144-holeShown,cutRight=inside?212+holeShown:196+holeShown;
  const mother=closed?wall(24,292):wall(24,cutLeft-24)+wall(cutRight,316-cutRight);
  const cut=closed?'':`<rect x="${cutLeft}" y="110" width="${cutRight-cutLeft}" height="35" fill="#fff2ef" stroke="#b64432" stroke-width="1.5" stroke-dasharray="5 4"/>`;
  const branch=`<path d="M128 30h16v${branchEnd-30}h-16ZM196 30h16v${branchEnd-30}h-16Z" fill="#85c7ee" stroke="#1764ad" stroke-width="1.8"/><path d="M170 23V${Math.max(branchEnd+10,154)}" stroke="#1764ad" stroke-dasharray="5 4"/>`;
  // Brown triangles identify the joining location only, not weld size/shape.
  const weldTop=inside?96:branchEnd-14;
  const weld=`<path d="M115 110L128 ${weldTop}V110ZM225 110L212 ${weldTop}V110Z" fill="#cc933e" stroke="#986520" stroke-width="1"/>`;
  const keep=closed?'<text x="170" y="133" text-anchor="middle" class="connection-svg-keep">保留整面母壁</text>':'<text x="170" y="134" text-anchor="middle" class="connection-svg-cut">切除</text>';
  const measured=inside?
    `<path d="M208 145h52M212 ${branchEnd}h48" stroke="#1764ad" stroke-dasharray="3 3"/>${dimension(254,145,branchEnd)}<text x="316" y="72" text-anchor="end" class="connection-svg-measure">凸入 ${amount(p.projection??0)}</text>${projectionValid&&projection===0?'<text x="316" y="93" text-anchor="end" class="connection-svg-measure">齊近側內壁</text>':''}`:
    `<path d="M97 ${branchEnd}h29M97 110h22" stroke="#1764ad" stroke-dasharray="3 3"/>${dimension(101,branchEnd,110)}<text x="25" y="75" class="connection-svg-measure">間隙 ${amount(p.rootGap??0)}</text>${gapValid&&gap===0?'<text x="25" y="94" class="connection-svg-muted">0 = 貼外壁</text>':''}`;
  const labels=`<text x="170" y="20" text-anchor="middle" class="connection-svg-blue">支管管壁</text><path d="M45 108H24M45 147H24" stroke="#52677c" stroke-width="1.3"/><text x="24" y="105" class="connection-svg-muted">外壁</text><text x="24" y="164" class="connection-svg-muted">近側內壁</text><text x="170" y="221" text-anchor="middle" class="connection-svg-muted">母管內部</text><path d="M24 239H316" stroke="#52677c" stroke-width="2"/><rect x="24" y="240" width="292" height="15" fill="#cbd5df"/>`;
  const detail=inside?`<strong>凸入 ${amount(p.projection??0)}</strong>：從近側內壁沿支管軸量到管端。${projectionValid&&projection===0?'目前齊內壁。':''}`:`<strong>貼合間隙 ${amount(p.rootGap??0)}</strong>：支管魚口與母材外壁的間距。`;
  const opening=closed?'母壁保持完整，只修支管魚口。':`母管孔線以支管${inside?'外徑':'內徑'}加每側間隙 ${amount(p.holeGap??0)} 計算；紅色虛線區切除。`;
  const aria=`${title}。灰色母管壁保留，藍色是支管管壁，${closed?'母管不切孔。':'紅色虛線區是母管切除位置。'}${inside?`凸入 ${amount(p.projection??0)}，從近側內壁沿支管軸量。`:`貼合間隙 ${amount(p.rootGap??0)}。`}棕色三角只表示接合處。示意非比例，實際斜度及魚口以三維模型為準。`;
  return `<figure class="connection-section"><div class="connection-section-title">${title}</div><svg class="connection-section-svg" viewBox="0 0 340 262" role="img" aria-label="${esc(aria)}">${mother}${cut}${branch}${weld}${keep}${measured}${labels}</svg><figcaption><p>${detail}</p><p>${opening}</p><small>剖面示意，非尺寸圖；棕色只標接合處。實際斜度與魚口看 3D，焊接尺寸依工法。</small></figcaption></figure>`;
}

function padPicture(split,elbow){
  const horizontal=split==='axial',vertical=split==='circumferential';
  const seam=horizontal?'<path d="M29 66H65M115 66H151"/>':vertical?'<path d="M90 26V48M90 84V106"/>':'';
  const label=elbow?'A → B':'沿管長 →';
  return `<svg viewBox="0 0 180 132" aria-hidden="true" focusable="false"><rect x="9" y="12" width="162" height="101" rx="8" fill="#e8eef5"/><path d="M15 34H165M15 98H165" stroke="#b5c3cf" stroke-dasharray="4 4"/><ellipse cx="90" cy="66" rx="61" ry="40" fill="#f7e2bc" stroke="#986520" stroke-width="1.8"/><ellipse cx="90" cy="66" rx="25" ry="18" fill="#e8eef5" stroke="#1764ad" stroke-width="1.8"/><g fill="none" stroke="#b64432" stroke-width="3.5">${seam}</g><path d="M26 123H154l-7-4m7 4l-7 4" fill="none" stroke="#52677c" stroke-width="1.6"/><text x="90" y="118" text-anchor="middle" fill="#52677c" font-size="12">${label}</text></svg>`;
}

/** Existing data-visual-field event delegation can apply these native buttons.
 * Cone pads are unsupported and intentionally produce no controls.
 */
export function padSplitIllustration(params={}){
  if(params.hostType==='cone')return '';
  const elbow=params.hostType==='elbow',selected=params.padSplit??'single',items=[
    ['single','整片','沒有分片接縫'],
    ['axial','沿管長分片',elbow?'紅線沿 A → B':'紅線沿主管軸'],
    ['circumferential','沿圓周分片','紅線沿截面圓周']
  ];
  return `<div class="pad-split-illustration" role="group" aria-label="補強板分片接縫方向"><p class="pad-split-title">補強板怎麼分片？</p><div class="pad-split-options">${items.map(([value,title,note])=>`<button type="button" class="pad-split-option${selected===value?' is-selected':''}" data-visual-field="padSplit" data-visual-value="${value}" aria-pressed="${selected===value}" aria-label="${title}；${note}">${padPicture(value,elbow)}<span><strong>${title}</strong><small>${note}</small></span><i aria-hidden="true">${selected===value?'✓':''}</i></button>`).join('')}</div><p class="pad-split-note">紅線是分片接縫；灰箭頭沿管長。${elbow?'此為成形板上的方向示意，不能當平板下料圖。':'外形與孔型仍以計算圖面為準。'}</p></div>`;
}
