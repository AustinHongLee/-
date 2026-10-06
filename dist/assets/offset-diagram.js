import {offsetCenterline,dot} from './offset-geometry.js';
const fmt=n=>Number(n.toFixed(2));
export function offsetDiagramSVG(r) {
  if(!r?.valid)return '';
  if(r.basis==='ports')return portDiagramSVG(r);
  const world=[...Array.from({length:33},(_,i)=>offsetCenterline(r,'a',i/32)),...Array.from({length:33},(_,i)=>offsetCenterline(r,'b',i/32))];
  const plane=q=>[q[0],dot(q,r.plane)],all=world.map(plane),length=world.length;
  const minimum=Math.min(...all.map(q=>q[0])),maximum=Math.max(...all.map(q=>q[0])),maxY=Math.max(...all.map(q=>q[1]));
  const scale=Math.min(510/Math.max(1,maximum-minimum),155/Math.max(1,maxY));
  const screen=q=>[85+(q[0]-minimum)*scale,215-q[1]*scale],at=q=>screen(plane(q)),coords=q=>q.map(fmt).join(',');
  const path=points=>points.map((q,i)=>(i?'L':'M')+coords(at(q))).join(' ');
  const a=at(r.intersections.a),b=at(r.intersections.b),aFace=at(world[32]),bFace=at(world[33]),mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
  const cross=q=>`<path d="M${fmt(q[0]-5)} ${fmt(q[1])}h10M${fmt(q[0])} ${fmt(q[1]-5)}v10"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 285" role="img" aria-label="偏移配管量測基準：A、B 理論交點，Travel 斜距及 Run 前進距離"><defs><marker id="offset-dim-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#8ba9c9"/></marker></defs><g fill="none" stroke-linecap="round"><path d="${path(world.slice(0,33))}" stroke="#74caff" stroke-width="16"/><path d="M${coords(aFace)}L${coords(bFace)}" stroke="#b5c5d7" stroke-width="14"/><path d="${path(world.slice(33,length))}" stroke="#efb06f" stroke-width="16"/><path d="${path(world)}" stroke="#13253d" stroke-width="1" stroke-dasharray="5 4"/><path d="M${coords(a)}L${coords(b)}M${coords(a)}H${fmt(b[0])}V${fmt(b[1])}" stroke="#8ba9c9" stroke-width="1" stroke-dasharray="3 4"/><g stroke="#e9f1fb">${cross(a)}${cross(b)}</g><path d="M${fmt(a[0])} 245H${fmt(b[0])}" stroke="#8ba9c9" marker-start="url(#offset-dim-arrow)" marker-end="url(#offset-dim-arrow)"/></g><g fill="#dce8f7" font-family="Arial,Microsoft JhengHei" font-size="12"><text x="18" y="22">彎曲平面視圖 · A／B 十字為理論交點</text><text x="${fmt(a[0]-15)}" y="${fmt(a[1]+20)}">A</text><text x="${fmt(b[0]+12)}" y="${fmt(b[1]-8)}">B</text><text x="${fmt(mid[0])}" y="${fmt(mid[1]-28)}" text-anchor="middle">Travel ${fmt(r.travel)} mm</text><text x="${fmt(mid[0])}" y="268" text-anchor="middle">Run ${fmt(r.run)} mm</text><text x="${fmt(Math.min(605,b[0]+18))}" y="${fmt(mid[1]+16)}">偏移 ${fmt(r.offset)}</text><text x="${fmt(aFace[0])}" y="${fmt(aFace[1]-15)}">Ta ${fmt(r.elbows.a.takeout)}</text><text x="${fmt(bFace[0])}" y="${fmt(bFace[1]+27)}">Tb ${fmt(r.elbows.b.takeout)}</text><text x="18" y="41" font-size="11">高低／平面偏移 ${fmt(r.rise)} · 側移 ${fmt(r.roll)} mm · 旋轉 ${fmt(r.rollAngle)}°（+Z → +Y）</text></g></svg>`;
}

function portDiagramSVG(r){
  const curve=end=>Array.from({length:33},(_,i)=>offsetCenterline(r,end,i/32));
  const ca=curve('a'),cb=curve('b'),all=[r.ports.a,r.ports.b,...ca,...cb];
  const views=[['X／Y 平面',0,1],['X／Z 平面',0,2],['Y／Z 平面',1,2]];
  const panels=views.map(([name,h,v],index)=>{
    const minX=Math.min(...all.map(q=>q[h])),maxX=Math.max(...all.map(q=>q[h])),minY=Math.min(...all.map(q=>q[v])),maxY=Math.max(...all.map(q=>q[v]));
    const s=Math.min(185/Math.max(maxX-minX,1),122/Math.max(maxY-minY,1)),ox=20+index*260+(205-(maxX-minX)*s)/2,oy=186+(maxY-minY)*s/2;
    const at=q=>[ox+(q[h]-minX)*s,oy-(q[v]-minY)*s],xy=q=>q.map(fmt).join(','),path=ps=>ps.map((q,i)=>(i?'L':'M')+xy(at(q))).join(' '),a=at(r.ports.a),b=at(r.ports.b);
    const cross=q=>`<path d="M${fmt(q[0]-4)} ${fmt(q[1])}h8M${fmt(q[0])} ${fmt(q[1]-4)}v8"/>`;
    return `<g fill="none"><path d="${path(ca)}" stroke="#74caff" stroke-width="9"/><path d="${path(cb)}" stroke="#efb06f" stroke-width="9"/><path d="${path([ca.at(-1),cb[0]])}" stroke="#c4d0dc" stroke-width="8"/><path d="${path([r.ports.a,ca[0]])}M${xy(at(cb.at(-1)))}L${xy(b)}" stroke="#9ab7d3" stroke-width="4"/><path d="M${xy(a)}H${fmt(b[0])}V${fmt(b[1])}" stroke="#8ba9c9" stroke-dasharray="3 3"/><g stroke="#e9f1fb">${cross(a)}${cross(b)}</g></g><g fill="#dce8f7" font-size="11"><text x="${20+index*260}" y="69">${name} · 端面中心</text><text x="${fmt(a[0]-9)}" y="${fmt(a[1]+17)}">A</text><text x="${fmt(b[0]+5)}" y="${fmt(b[1]-7)}">B</text><text x="${20+index*260}" y="272">Δ${'XYZ'[h]} ${fmt(r.delta[h])} · Δ${'XYZ'[v]} ${fmt(r.delta[v])} mm</text></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 780 290" role="img" aria-label="兩端口中心位置的 X Y Z 正投影及兩個彎頭"><g font-family="Arial,Microsoft JhengHei"><g fill="#dce8f7" font-size="13"><text x="20" y="22">固定端口 A → B · A ${fmt(r.elbows.a.angle)}°／B ${fmt(r.elbows.b.angle)}° · 直管 ${fmt(r.cutLength)} mm</text><text x="20" y="43" font-size="11">十字為端面中心；短接線含外側焊口間隙／保留端直段。正投影只示意組立方向。</text></g>${panels}</g></svg>`;
}
