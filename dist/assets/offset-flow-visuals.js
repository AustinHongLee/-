// Owner-facing pictures for the flow comparison: a route with its bends and welds marked for the medium,
// and a true-scale section through one girth weld (as welded beside ground flush).
import {esc,fmt} from './offset-exports.js';
import {routeElbowFrame} from './offset-planner.js';
import {wallVelocityRatio} from './offset-flow.js';

const C=Object.freeze({text:'#21384b',muted:'#6d8394',line:'#c8d4dc',pipe:'#7b90a1',pipeDark:'#294559',elbow:'#3a7f9e',warn:'#d0812f',warnSoft:'#f7e4cf',flow:'#2f7fae',flowSoft:'#e8f2f8',steel:'#d7dee3',weld:'#b5c3cd'});
const n=v=>fmt(v,1);
/** Welds that matter for this medium: beads pellets hit, or corners where viscous product settles. */
export const weldsAtRisk=ctx=>Boolean(ctx?.valid&&ctx.exposedBead>0&&(!ctx.liquid||ctx.regime==='laminar'));

/** Isometric route like the assembly view, with bends and welds marked for the medium. */
export function flowRouteSVG(plan,flow,ctx,{title=''}={}){
  if(!plan?.valid||!plan.elements?.every(e=>e.start&&e.finish))return '';
  const project=q=>[(q[0]-q[1])*.866,-(q[0]+q[1])*.5-q[2]],arc=e=>Array.from({length:33},(_,i)=>routeElbowFrame(e,i/32).center);
  const curves=plan.elements.map(e=>e.type==='elbow'?[e.start,...arc(e),e.finish]:[e.start,e.finish]);
  const pts=curves.flat().map(project),min=[0,1].map(k=>Math.min(...pts.map(q=>q[k]))),max=[0,1].map(k=>Math.max(...pts.map(q=>q[k])));
  const scale=Math.min(330/Math.max(max[0]-min[0],1),150/Math.max(max[1]-min[1],1));
  const at=q=>{const t=project(q);return [35+(330-(max[0]-min[0])*scale)/2+(t[0]-min[0])*scale,45+(150-(max[1]-min[1])*scale)/2+(t[1]-min[1])*scale];};
  const path=ps=>ps.map((q,i)=>(i?'L':'M')+at(q).map(v=>fmt(v)).join(' ')).join(' ');
  const r=(plan.params?.od??114.3)/2,risk=weldsAtRisk(ctx),liquid=ctx?.liquid;
  const body=curves.map((c,i)=>`<path d="${path(c)}" fill="none" stroke="${C.pipeDark}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/><path d="${path(c)}" fill="none" stroke="${plan.elements[i].type==='elbow'?C.elbow:C.pipe}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  const bends=plan.elements.filter(e=>e.type==='elbow').map(e=>{
    const mid=routeElbowFrame(e,.5),raw=at(mid.center.map((v,k)=>v+mid.outside[k]*r*(liquid?3.4:4.6))),label=[Math.min(372,Math.max(28,raw[0])),Math.min(204,Math.max(36,raw[1]))];
    const mark=liquid?`<path d="${path(arc(e))}" fill="none" stroke="${C.warn}" stroke-width="5" stroke-linecap="round" opacity=".9"/>`
      :`<path d="${path(Array.from({length:17},(_,i)=>{const f=routeElbowFrame(e,.1+.8*i/16);return f.center.map((v,k)=>v+f.outside[k]*r*1.9);}))}" fill="none" stroke="${C.warn}" stroke-width="4" stroke-linecap="round"/>`;
    return `${mark}<text x="${fmt(label[0])}" y="${fmt(label[1]+4)}" text-anchor="middle" font-size="12" font-weight="700" fill="${C.warn}">${n(e.angle)}°</text>`;
  }).join('');
  const joints=(plan.joints??[]).filter(j=>(j.kind??'weld')==='weld').map(j=>{const q=at(j.start.map((v,k)=>(v+j.finish[k])/2));return risk?`<circle cx="${fmt(q[0])}" cy="${fmt(q[1])}" r="5.5" fill="${C.warn}" stroke="#fff" stroke-width="2"/>`:`<circle cx="${fmt(q[0])}" cy="${fmt(q[1])}" r="4" fill="#fff" stroke="${C.pipeDark}" stroke-width="1.6"/>`;}).join('');
  const ports=['a','b'].map(end=>{const q=at(plan.context.ports[end]);return `<text x="${fmt(q[0]+(end==='a'?-12:12))}" y="${fmt(q[1]+5)}" text-anchor="${end==='a'?'end':'start'}" font-size="13" font-weight="700" fill="${C.text}">${end.toUpperCase()}</text>`;}).join('');
  const legend=liquid?`<path d="M30 226h18" stroke="${C.warn}" stroke-width="5"/><text x="54" y="230">${flow&&flow.dp.bends>=flow.dp.pipe&&flow.dp.bends>=flow.dp.welds?'彎頭：主要壓損':'彎頭'}</text>`:`<path d="M30 226h18" stroke="${C.warn}" stroke-width="4"/><text x="54" y="230">彎頭外背：粒子撞擊面</text>`;
  const weldLegend=risk?`<circle cx="196" cy="226" r="5" fill="${C.warn}"/><text x="207" y="230">焊口（${liquid?'會積料的角落':'粒子會撞上的焊道'}）</text>`:`<circle cx="196" cy="226" r="4" fill="#fff" stroke="${C.pipeDark}" stroke-width="1.6"/><text x="207" y="230">焊口</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" role="img" aria-label="${esc(title||'接法')}：${flow?.bendCount??0} 個彎頭、${flow?.welds??plan.jointCount} 個焊口"><g font-family="Arial,Microsoft JhengHei" fill="${C.muted}" font-size="11">${title?`<text x="20" y="22" font-size="14" font-weight="700" fill="${C.text}">${esc(title)}</text>`:''}${body}${bends}${joints}${ports}${legend}${weldLegend}</g></svg>`;
}

/** True-scale longitudinal section through one girth weld: as welded beside ground flush, for the medium. */
let sectionCount=0;
/** True-scale longitudinal section through one girth weld: as welded beside ground flush, for the medium. */
export function weldSectionSVG(ctx){
  if(!ctx?.valid)return '';
  const id=++sectionCount,t=ctx.wall,h=ctx.bead,w=3*h+3,pellet=ctx.liquid?0:ctx.pellet,laminar=ctx.regime==='laminar';
  const flowH=Math.max(8,3*h+5,pellet*2.6),cap=Math.min(1.6,t*.25),spanX=Math.max(30,4*w,pellet*7);
  const s=Math.min(310/spanX,190/(flowH+t+cap+.5)),W=spanX*s,top=58,yIn=top+flowH*s,yOut=yIn+t*s;
  const label=(x,y,lines,color=C.text)=>lines.map((line,i)=>`<text x="${fmt(x)}" y="${fmt(y+i*14)}" font-size="10.5" fill="${color}"${i===0&&color!==C.text?' font-weight="700"':''}>${esc(line)}</text>`).join('');
  const leader=(x1,y1,x2,y2,color=C.text)=>`<path d="M${fmt(x1)} ${fmt(y1)}L${fmt(x2)} ${fmt(y2)}" stroke="${color}" stroke-width=".8"/><circle cx="${fmt(x2)}" cy="${fmt(y2)}" r="1.8" fill="${color}"/>`;
  const panel=(x0,welded)=>{
    const xc=x0+W*.5,raised=welded&&h>0,bump=x=>{const d=(x-xc)/s;return Math.abs(d)<=w/2?h*(1+Math.cos(2*Math.PI*d/w))/2:0;};
    const toeL=xc-w/2*s,toeR=xc+w/2*s,yTop=yIn-h*s,noteX=xc+14,noteY=top+16;
    const bead=raised?`<path d="M${fmt(toeL)} ${fmt(yIn)}${Array.from({length:61},(_,i)=>{const x=toeL+i*w*s/60;return `L${fmt(x)} ${fmt(yIn-bump(x)*s)}`;}).join('')}Z" fill="${C.weld}" stroke="${C.pipeDark}" stroke-width="1"/>`:'';
    const root=Math.max(1.5,.3*t),outer=root+1.15*t;
    const weldMetal=`<path d="M${fmt(xc-root/2*s)} ${fmt(yIn)}L${fmt(xc+root/2*s)} ${fmt(yIn)}L${fmt(xc+outer/2*s)} ${fmt(yOut)}L${fmt(xc-outer/2*s)} ${fmt(yOut)}Z" fill="${C.weld}" stroke="${C.pipe}" stroke-width=".6"/><path d="M${fmt(xc-(outer/2+.8)*s)} ${fmt(yOut)}Q${fmt(xc)} ${fmt(yOut+cap*2*s)} ${fmt(xc+(outer/2+.8)*s)} ${fmt(yOut)}Z" fill="${C.weld}" stroke="${C.pipe}" stroke-width=".6"/>`;
    let overlay='';
    if(ctx.liquid){
      const xp=x0+W*.05,heights=[.5,1,1.6,2.5,4,6,8].filter(v=>v<flowH-1.2),ratio=y=>wallVelocityRatio(y/1000,ctx.D,ctx.Re,ctx.f),peak=ratio(flowH),len=y=>Math.max(4,ratio(y)/peak*W*.24);
      const tips=heights.map(y=>[xp+len(y),yIn-y*s]);
      overlay+=heights.map((y,i)=>`<path d="M${fmt(xp)} ${fmt(tips[i][1])}H${fmt(tips[i][0]-3)}" stroke="${C.flow}" stroke-width="1.2"/><path d="M${fmt(tips[i][0])} ${fmt(tips[i][1])}l-4.5 -2.4v4.8z" fill="${C.flow}"/>`).join('')
        +`<path d="M${fmt(xp)} ${fmt(yIn)}${tips.map(q=>`L${fmt(q[0])} ${fmt(q[1])}`).join('')}" fill="none" stroke="${C.flow}" stroke-width=".9" stroke-dasharray="2 2"/><text x="${fmt(xp)}" y="${fmt(top+12)}" font-size="10" fill="${C.flow}">流速分布</text>`;
      if(raised){
        overlay+=leader(noteX,noteY+3,xc,yTop)+label(noteX+3,noteY,[`焊道頂：平均流速的 ${fmt(ctx.beadVelocity*100,0)}%`]);
        if(laminar)overlay+=[-1,1].map(side=>{const xt=side<0?toeL:toeR;return `<path d="M${fmt(xt)} ${fmt(yIn)}l${fmt(-side*w*.42*s)} 0L${fmt(xt-side*w*.04*s)} ${fmt(yIn-h*.6*s)}Z" fill="${C.warn}" opacity=".8"/>`;}).join('')
          +leader(noteX,noteY+20,toeR+w*.15*s,yIn-h*.2*s,C.warn)+label(noteX+3,noteY+17,['兩側角落流速很慢：易積料'],C.warn);
        else overlay+=`<path d="M${fmt(xc+w*.25*s)} ${fmt(yIn-h*s*.95)}c${fmt(w*.5*s)} ${fmt(-h*.3*s)} ${fmt(w*.95*s)} ${fmt(h*.2*s)} ${fmt(w*1.05*s)} ${fmt(h*.9*s)}" fill="none" stroke="${C.flow}" stroke-width="1" stroke-dasharray="2 2"/>`
          +label(noteX+3,noteY+17,['後方：小範圍擾動（示意）'],C.muted);
      }else overlay+=label(noteX+3,noteY,[laminar?'沒有凸起，沒有積料角落':'內面與直管相同'],C.text);
    }else{
      const R=pellet/2*s,yC=yIn-R,lead=raised?toeL-R*.35:xc+W*.1,rest=[lead-R*2.7,lead-R*5.6].filter(x=>x-R>x0+2);
      overlay+=[lead,...rest].map(x=>`<circle cx="${fmt(x)}" cy="${fmt(yC)}" r="${fmt(R)}" fill="#fff" stroke="${C.text}" stroke-width="1.2"/>`).join('')
        +rest.map(x=>`<path d="M${fmt(x+R+3)} ${fmt(yC)}h${fmt(R*.8)}" stroke="${C.muted}" stroke-width="1.2" marker-end="url(#arrow-${id})"/>`).join('');
      if(raised){const hitX=lead+R*.86,hitY=yIn-R*.5;overlay+=[0,1,2,3,4,5,6,7].map(i=>{const a=i*Math.PI/4;return `<path d="M${fmt(hitX)} ${fmt(hitY)}l${fmt(Math.cos(a)*5)} ${fmt(Math.sin(a)*5)}" stroke="${C.warn}" stroke-width="1.6"/>`;}).join('')+leader(noteX,noteY+3,hitX,hitY-6,C.warn)+label(noteX+3,noteY,['撞上焊道：粉屑、拉絲'],C.warn);}
      else overlay+=label(noteX+3,noteY,['平滑滑過，碰不到焊道']);
    }
    const tick=raised?`<path d="M${fmt(toeR+5)} ${fmt(yIn)}V${fmt(yTop)}M${fmt(toeR+2)} ${fmt(yTop)}h6M${fmt(toeR+2)} ${fmt(yIn)}h6" stroke="${C.text}" stroke-width=".8"/>`:'';
    return `<g><rect x="${fmt(x0)}" y="${fmt(top)}" width="${fmt(W)}" height="${fmt(flowH*s)}" fill="${ctx.liquid?C.flowSoft:'#f6f8fa'}"/><rect x="${fmt(x0)}" y="${fmt(yIn)}" width="${fmt(W)}" height="${fmt(t*s)}" fill="url(#steel-${id})" stroke="${C.pipe}" stroke-width=".8"/>${weldMetal}${bead}${overlay}${tick}<text x="${fmt(x0+4)}" y="${fmt(yIn+t*s/2+4)}" font-size="10" fill="${C.text}">管壁 ${fmt(t,2)}</text><text x="${fmt(x0)}" y="${top-24}" font-size="13" font-weight="700" fill="${C.text}">${welded?`原焊 · 內凸 ${fmt(h,2)} mm`:'內面平順'}</text><text x="${fmt(x0)}" y="${top-9}" font-size="10.5" fill="${C.muted}">${welded?(ctx.codeBead?`ASME B31.3 上限（壁厚 ${fmt(t,2)} mm）`:'依輸入值'):'磨平或氬焊打底，與管內面齊平'}</text></g>`;
  };
  const right=40+W+30,bar=5*s,ring=46,cx=right+W+30+ring+8,cy=top+ring+8,lineW=Math.max(1,h/ctx.idMm*2*ring),wallW=Math.max(1.5,ctx.wall/ctx.idMm*2*ring),height=Math.ceil(yOut+cap*s+40);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(cx+ring+44)} ${height}" role="img" aria-label="焊口剖面，按真實比例：原焊內凸 ${fmt(h,2)} mm 與內面磨平"><defs><pattern id="steel-${id}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="${C.steel}"/><path d="M0 0V6" stroke="#c3ccd3" stroke-width="1.4"/></pattern><marker id="arrow-${id}" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0L6 3L0 6z" fill="${C.muted}"/></marker></defs><g font-family="Arial,Microsoft JhengHei">${panel(40,true)}${panel(right,false)}<path d="M40 ${height-14}h${fmt(bar)}M40 ${height-18}v8M${fmt(40+bar)} ${height-18}v8" stroke="${C.text}" stroke-width="1"/><text x="${fmt(46+bar)}" y="${height-10}" font-size="10" fill="${C.text}">5 mm · 剖面按真實比例</text><circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${ring}" fill="${ctx.liquid?C.flowSoft:'#f6f8fa'}" stroke="${C.pipeDark}" stroke-width="${fmt(wallW)}"/><circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(ring-wallW/2-lineW/2)}" fill="none" stroke="${C.warn}" stroke-width="${fmt(lineW)}"/><text x="${fmt(cx)}" y="${top-24}" text-anchor="middle" font-size="13" font-weight="700" fill="${C.text}">整個管口</text><text x="${fmt(cx)}" y="${fmt(cy+ring+18)}" text-anchor="middle" font-size="10.5" fill="${C.text}">內徑 ${fmt(ctx.idMm,1)} mm</text><text x="${fmt(cx)}" y="${fmt(cy+ring+33)}" text-anchor="middle" font-size="10.5" fill="${C.warn}">橘色細線＝焊道 ${fmt(h,2)} mm</text></g></svg>`;
}
