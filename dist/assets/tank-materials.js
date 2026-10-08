import {solveTank,shapeLabel} from './tank-geometry.js';
import {planTankNozzles} from './tank-nozzles.js';
import {FORMED_ENDS,END_LABELS,integrate} from './tank-heads.js';
import {sectorLayout,petalLayout,circleSplice,annularLayout,fitsStock} from './tank-layouts.js';
import {normalizeMethods,methodContext} from './tank-method-config.js';
import {planAttachments} from './tank-attachments.js';
import {planProcess} from './tank-process.js';
const mass=(area,t,rho)=>area/1e6*t/1000*rho;
// International foot = 304.8 mm exactly. Supplier actual plate sizes may differ.
export const TANK_STOCKS=Object.freeze([
  Object.freeze({id:'4x8',label:'4′ × 8′',stockWidth:1219.2,stockLength:2438.4}),
  Object.freeze({id:'5x10',label:'5′ × 10′',stockWidth:1524,stockLength:3048}),
  Object.freeze({id:'5x20',label:'5′ × 20′',stockWidth:1524,stockLength:6096})
]);
export const stockPreset=p=>TANK_STOCKS.find(s=>Math.abs(s.stockWidth-p.stockWidth)<1e-6&&Math.abs(s.stockLength-p.stockLength)<1e-6);
export const stockLabel=p=>stockPreset(p)?.label??'自訂原板';
export const shellLayoutLabel=p=>p.shellLayout==='upright'?'直立分片（長邊沿高度）':'橫向分圈（長邊沿圓周）';
export function compareTankStocks(values){return TANK_STOCKS.map(stock=>({...stock,result:estimateTank({...values,stockWidth:stock.stockWidth,stockLength:stock.stockLength},{process:false})}));}
export function rectanglePacking(w,h,sw,sl,kerf){
  const configurations=[{columns:Math.floor((sl+kerf)/(w+kerf)),rows:Math.floor((sw+kerf)/(h+kerf)),rotated:false},{columns:Math.floor((sl+kerf)/(h+kerf)),rows:Math.floor((sw+kerf)/(w+kerf)),rotated:true}];
  return configurations.sort((a,b)=>b.columns*b.rows-a.columns*a.rows)[0];
}
const piecesOf=part=>part.pieces??Array.from({length:part.quantity},()=>({w:part.width,h:part.height}));
// First-fit guillotine layout. Reuse offcuts only at matching thickness. Parts may list individual `pieces` of different sizes.
export function packTankParts(parts,p){
  const sheets=[];
  for(const part of parts){
    if(part.kind==='formed'||part.kind==='bar'||part.perSheet===0||part.fits===false)continue;
    const pieces=piecesOf(part);
    for(let piece=0;piece<pieces.length;piece++){
      const pw=pieces[piece].w,ph=pieces[piece].h;let chosen=null;
      for(const sheet of sheets){if(sheet.thickness!==part.thickness)continue;for(let i=0;i<sheet.free.length;i++){const f=sheet.free[i];for(const rotated of [false,true]){const w=rotated?ph:pw,h=rotated?pw:ph;if(w<=f.w+1e-8&&h<=f.h+1e-8){chosen={sheet,index:i,f,w,h,rotated};break;}}if(chosen)break;}if(chosen)break;}
      if(!chosen){const sheet={id:sheets.length+1,thickness:part.thickness,free:[{x:0,y:0,w:p.stockLength,h:p.stockWidth}],placements:[]};sheets.push(sheet);const rotated=pw>p.stockLength||ph>p.stockWidth;chosen={sheet,index:0,f:sheet.free[0],w:rotated?ph:pw,h:rotated?pw:ph,rotated};}
      const {sheet,index,f,w,h,rotated}=chosen;sheet.free.splice(index,1);sheet.placements.push({part:part.id,piece:piece+1,x:f.x,y:f.y,w,h,rotated});
      const dw=f.w-w-p.kerf,dh=f.h-h-p.kerf;
      if(dw>dh){if(dw>0)sheet.free.push({x:f.x+w+p.kerf,y:f.y,w:dw,h:f.h});if(dh>0)sheet.free.push({x:f.x,y:f.y+h+p.kerf,w,h:dh});}
      else {if(dh>0)sheet.free.push({x:f.x,y:f.y+h+p.kerf,w:f.w,h:dh});if(dw>0)sheet.free.push({x:f.x+w+p.kerf,y:f.y,w:dw,h});}
    }
  }
  return sheets;
}
const steiner=(area,outline,trim)=>{let perimeter=0;for(let i=0;i<outline.length;i++){const a=outline[i],b=outline[(i+1)%outline.length];perimeter+=Math.hypot(b[0]-a[0],b[1]-a[1]);}return area+perimeter*trim+Math.PI*trim*trim;};
/** Area of an axis-aligned rectangle inside a centred circle. */
export function rectCircleArea(x0,x1,y0,y1,R){
  const a=Math.max(x0,-R),b=Math.min(x1,R);if(!(b>a))return 0;
  const f=x=>{const Y=Math.sqrt(Math.max(0,R*R-x*x));return Math.max(0,Math.min(y1,Y)-Math.max(y0,-Y));};
  const cuts=[a,b];for(const y of [y0,y1])if(Math.abs(y)<R){const x=Math.sqrt(R*R-y*y);for(const s of [-x,x])if(s>a&&s<b)cuts.push(s);}
  cuts.sort((u,v)=>u-v);let sum=0;for(let i=0;i<cuts.length-1;i++)sum+=integrate(f,cuts[i],cuts[i+1],Math.max(1e-6,(b-a)*(y1-y0)*1e-12));return sum;
}
/** Builds the part list for both tank ends from their geometry and the chosen layout methods. */
function planEnds(g,p,m,make,piecesPart){
  const out={parts:[],notes:[],issues:[],layouts:{}},horizontal=g.orientation==='horizontal',rho=p.density;
  const side=which=>horizontal?(which==='bottom'?'A 端':'B 端'):(which==='bottom'?'底':'頂');
  const specs=[];
  for(const which of ['bottom','top']){
    const end=g.ends[which],type=end.type;if(type==='open')continue;
    const t=end.t,where=side(which),prefix=which==='bottom'?'B':'T';
    if(type==='flat'){
      const method=which==='bottom'?m.layout.bottom:m.layout.top,fd=g.od+2*p.overhang;
      if(method==='single'){specs.push({which,type,key:'flat-single:'+t+':'+fd,t,fd,where});continue;}
      if(method==='annular'&&which==='bottom'){
        const tr=m.layout.annularThickness>0?m.layout.annularThickness:t,inner=g.di/2-m.layout.annularWidth,outer=g.od/2+m.layout.annularProjection;
        if(!(inner>100)){out.issues.push({field:'methods.layout.annularWidth',message:'環形邊板寬度已超過槽半徑，請減少寬度或改用條板拼接。'});specs.push({which,type,key:'flat-single:'+t+':'+fd,t,fd,where});continue;}
        const layout=annularLayout({innerRadius:inner,outerRadius:outer,stockWidth:p.stockWidth,stockLength:p.stockLength,trim:p.trim,joint:m.layout.joint,lap:m.layout.lap,gap:m.layout.gap});
        if(!layout.valid){out.issues.push({field:'methods.layout.bottom',message:'環形邊板配置：'+layout.reason});specs.push({which,type,key:'flat-single:'+t+':'+fd,t,fd,where});continue;}
        out.layouts[which]={method,...layout,thickness:tr,centreThickness:t};
        const ringPieces=layout.ring.pieces.map(piece=>({w:piece.w+2*p.trim,h:piece.h+2*p.trim,outline:piece.outline,area:piece.area,blankArea:steiner(piece.area,piece.outline,p.trim)}));
        out.parts.push(piecesPart('BA','環形邊板',tr,ringPieces,'annular',mass(Math.PI*(outer*outer-inner*inner),tr,rho)));
        const R=layout.centre.diameter/2,centre=layout.centre.plates.map(pl=>({w:pl.w+2*p.trim,h:pl.h+2*p.trim,plate:pl,area:rectCircleArea(pl.x0,pl.x1,pl.y0,pl.y1,R)}));
        out.parts.push(piecesPart('BC','中幅板（條板＋異形板）',t,centre,'spliced',mass(centre.reduce((s,x)=>s+x.area,0),t,rho)));
        continue;
      }
      const layout=circleSplice({diameter:fd,stockWidth:p.stockWidth,stockLength:p.stockLength,trim:p.trim,joint:m.layout.joint,lap:m.layout.lap,gap:m.layout.gap});
      if(!layout.valid){out.issues.push({field:'methods.layout.'+which,message:where+'拼板：'+layout.reason});specs.push({which,type,key:'flat-single:'+t+':'+fd,t,fd,where});continue;}
      out.layouts[which]={method:'strips',...layout,thickness:t};
      const R=fd/2,pieces=layout.plates.map(pl=>({w:pl.w+2*p.trim,h:pl.h+2*p.trim,plate:pl,area:rectCircleArea(pl.x0,pl.x1,pl.y0,pl.y1,R)}));
      out.parts.push(piecesPart(prefix+'S',horizontal?where+'平板拼板':which==='bottom'?'平底拼板':'平蓋拼板',t,pieces,'spliced',mass(pieces.reduce((s,x)=>s+x.area,0),t,rho)));
      continue;
    }
    if(type==='cone'){
      const dev=end.development,bands=m.layout[which==='bottom'?'coneBottomBands':'coneTopBands'],segments=m.layout[which==='bottom'?'coneBottomSegments':'coneTopSegments'];
      const layout=sectorLayout({rhoIn:dev.rhoIn,rhoOut:dev.rhoOut,theta:dev.theta,stockWidth:p.stockWidth,stockLength:p.stockLength,trim:p.trim,bands,segments});
      if(!layout.valid){out.issues.push({field:'methods.layout.'+(which==='bottom'?'coneBottomSegments':'coneTopSegments'),message:where+'錐體展開：'+layout.reason});const w=2*dev.rhoOut,part=piecesPart(prefix+'K',which==='bottom'?'錐底扇形板':'錐頂扇形板',t,[{w,h:w,area:Math.PI*(dev.rhoOut**2-dev.rhoIn**2)*dev.theta/360}],'sector',mass(end.midArea,t,rho));out.parts.push(part);continue;}
      out.layouts[which]={method:'sector',...layout,thickness:t,development:dev};
      const pieces=layout.pieces.map(piece=>({w:piece.w+2*p.trim,h:piece.h+2*p.trim,outline:piece.outline,area:piece.area,band:piece.band,blankArea:steiner(piece.area,piece.outline,p.trim)}));
      out.parts.push(piecesPart(prefix+'K',horizontal?where+'錐形扇形板':which==='bottom'?'錐底扇形板':'錐頂扇形板',t,pieces,'sector',mass(end.midArea,t,rho)));
      if(!(end.small>0))out.notes.push(where+'錐體為尖頂；錐尖附近板料無法捲製，常另做小錐頂或開中心孔接管，請依圖面確認。');
      continue;
    }
    const petal=type==='dome'||type==='hemispherical'&&m.layout.hemiMethod==='petal';
    if(petal){
      const sphere=end.sphere,layout=petalLayout({sphereRadius:sphere.radius,polarMax:sphere.polarMax,crownDiameter:m.layout.crownDiameter,stockWidth:p.stockWidth,stockLength:p.stockLength,trim:p.trim,bands:m.layout.petalBands,petals:m.layout.petals});
      if(!layout.valid){out.issues.push({field:'methods.layout.petals',message:where+'瓜瓣展開：'+layout.reason});const w=2*sphere.radius*sphere.polarMax;out.parts.push(piecesPart(prefix+'P',type==='dome'?'拱頂瓜瓣板':'半球封頭瓜瓣板',t,[{w,h:w,area:end.midArea}],'petal',mass(end.midArea,t,rho)));continue;}
      out.layouts[which]={method:'petal',...layout,thickness:t,sphere};
      const total=mass(end.midArea,t,rho),crownArea=Math.PI*layout.crownDiameter**2/4,label=type==='dome'?'拱頂':horizontal?where+'半球封頭':which==='bottom'?'下半球封頭':'上半球封頭';
      const crown=make(prefix+'C',label+'中心板',layout.crownDiameter+2*p.trim,layout.crownDiameter+2*p.trim,t,1,'circle');crown.blankDiameter=layout.crownDiameter+2*p.trim;crown.finishedDiameter=layout.crownDiameter;
      const petalArea=layout.pieces.reduce((s,x)=>s+x.area,0),share=petalArea+crownArea>0?crownArea/(petalArea+crownArea):1;
      crown.netWeight=total*share;crown.blankWeight=mass(Math.PI*crown.blankDiameter**2/4,t,rho);out.parts.push(crown);
      if(layout.pieces.length){const pieces=layout.pieces.map(piece=>({w:piece.w+2*p.trim,h:piece.h+2*p.trim,outline:piece.outline,area:piece.area,band:piece.band,blankArea:steiner(piece.area,piece.outline,p.trim)}));out.parts.push(piecesPart(prefix+'P',label+'瓜瓣板',t,pieces,'petal',total*(1-share)));}
      out.notes.push(label+'瓜瓣以經線弧長與緯線弧寬近似展開；球面板需壓製成形，成形後修邊，實際下料依壓製廠確認。');
      continue;
    }
    if(FORMED_ENDS.includes(type)||type==='dome')specs.push({which,type,key:'formed:'+type+':'+t+':'+end.depth.toFixed(6),t,end,where});
  }
  // Identical ends share one part, exactly as the original two-shape estimate did.
  const groups=[];for(const spec of specs){const group=groups.find(g=>g.key===spec.key);if(group)group.items.push(spec);else groups.push({key:spec.key,items:[spec]});}
  const usedIDs=new Set();
  for(const group of groups){
    const first=group.items[0],quantity=group.items.length,both=quantity===2;
    if(first.type==='flat'){
      const id=usedIDs.has('F')?'TF':'F';usedIDs.add(id);
      const name=both?(horizontal?'兩端平板圓板':'平底＋平蓋圓板'):horizontal?first.where+'平板圓板':first.which==='bottom'?'平底圓板':'平蓋圓板';
      const blankDiameter=first.fd+2*p.trim,part=make(id,name,blankDiameter,blankDiameter,first.t,quantity,'circle');
      part.blankDiameter=blankDiameter;part.finishedDiameter=first.fd;part.netWeight=mass(Math.PI*first.fd**2/4,first.t,rho)*quantity;part.blankWeight=mass(Math.PI*blankDiameter**2/4,first.t,rho)*quantity;part.ends=group.items.map(i=>i.which);out.parts.push(part);
      continue;
    }
    const end=first.end,label=END_LABELS[first.type],id=usedIDs.has('H')?'TH':'H';usedIDs.add(id);
    const area=end.midArea+Math.PI*(g.di+end.t)*end.straight,unitWeight=p.headWeight>0?p.headWeight:mass(area,end.t,rho);
    const position=both?'':`（${horizontal?first.where:first.which==='bottom'?'下':'上'}）`;
    const head=p.headBlank>0?make(id,'封頭毛坯（供應商尺寸）'+position,p.headBlank,p.headBlank,end.t,quantity,'circle'):{id,name:`成形 ${label}封頭${position}`,thickness:end.t,quantity,kind:'formed',sheets:0,stockWeight:null};
    head.blankDiameter=p.headBlank;head.unitWeight=unitWeight;head.netWeight=quantity*unitWeight;head.weightEstimated=p.headWeight===0;head.headType=first.type;head.ends=group.items.map(i=>i.which);
    if(p.headBlank>0)head.blankWeight=mass(Math.PI*p.headBlank**2/4,end.t,rho)*quantity;
    out.parts.push(head);
    out.notes.push(`${label}封頭是雙曲率成形件，不能直接用表面積換算成精確下料圓。未填供應商毛坯尺寸時，按 ${quantity} 只成形封頭採購；估重不含成形減薄。`);
  }
  return out;
}
export function estimateTank(values,{process=true}={}){
  const g=solveTank(values);if(!g.valid)return g;
  const p=g.input,norm=normalizeMethods(p.methods,methodContext(g));
  // Method settings never hide the body estimate: invalid entries are reported and replaced by defaults meanwhile.
  const methodIssues=[...norm.issues];
  const m=norm.methods,issues=[],parts=[],notes=[],circumference=Math.PI*g.meanDiameter,rho=p.density;
  const upright=p.shellLayout==='upright',heightSide=upright?p.stockLength:p.stockWidth,aroundSide=upright?p.stockWidth:p.stockLength;
  let flatEnd=m.rolling.preBend==='no'?m.rolling.flatEnd:0;
  if(!(aroundSide-2*p.trim-2*flatEnd>0)){methodIssues.push({field:'methods.rolling.flatEnd',message:'板端直邊加留料已超過原板長，請減少直邊或改為先預彎。'});flatEnd=0;}
  const courses=Math.ceil((g.bodyHeight+p.gap)/(heightSide-2*p.trim+p.gap)),courseHeight=(g.bodyHeight-(courses-1)*p.gap)/courses;
  const panelsPerCourse=Math.ceil(circumference/(aroundSide-2*p.trim-2*flatEnd+p.gap)),panelLength=(circumference-panelsPerCourse*p.gap)/panelsPerCourse;
  if(courses>200||courses*panelsPerCourse>10000)return {...g,valid:false,issues:[{field:'stockWidth',message:'分片過多（最多 200 圈、10,000 片），請換較大的原板。'}]};
  if(!(courseHeight>0&&panelLength>0))return {...g,valid:false,issues:[{field:'gap',message:'焊口間隙已超過可用尺寸，請核對間隙或換較大的板。'}]};
  const make=(id,name,w,h,t,qty,kind='rectangle')=>{
    const pack=rectanglePacking(w,h,p.stockWidth,p.stockLength,p.kerf),perSheet=pack.columns*pack.rows;
    return {id,name,width:w,height:h,thickness:t,quantity:qty,kind,pack,perSheet,sheets:perSheet?Math.ceil(qty/perSheet):null,stockWeight:perSheet?Math.ceil(qty/perSheet)*mass(p.stockWidth*p.stockLength,t,rho):null};
  };
  // Parts made of individually sized pieces (sectors, petals, spliced plates). Each piece carries its own blank size.
  const piecesPart=(id,name,t,pieces,kind,netWeight)=>{
    for(const piece of pieces)piece.blankWeight=mass(piece.blankArea??piece.w*piece.h,t,rho);
    const fits=pieces.every(piece=>fitsStock(piece.w,piece.h,p.stockWidth,p.stockLength));
    return {id,name,thickness:t,quantity:pieces.length,kind,pieces,width:Math.max(...pieces.map(x=>x.w)),height:Math.max(...pieces.map(x=>x.h)),fits,perSheet:fits?null:0,sheets:fits?undefined:null,netWeight,blankWeight:pieces.reduce((s,x)=>s+x.blankWeight,0)};
  };
  const body=make('S','筒身捲板',panelLength+2*p.trim+2*flatEnd,courseHeight+2*p.trim,p.shellThickness,courses*panelsPerCourse);
  body.finishedWidth=panelLength;body.finishedHeight=courseHeight;body.flatEnd=flatEnd;body.netWeight=mass(panelLength*courseHeight*body.quantity,p.shellThickness,rho);
  body.blankWeight=mass(body.width*body.height,p.shellThickness,rho)*body.quantity;parts.push(body);
  const ends=planEnds(g,p,m,make,piecesPart);methodIssues.push(...ends.issues);
  parts.push(...ends.parts);notes.push(...ends.notes);
  const verticalSeams=courses*panelsPerCourse,horizontalSeams=courses-1;
  const weldLength=verticalSeams*courseHeight+horizontalSeams*circumference;
  const seamStart=Number(p.seamStart)||0,pitch=circumference/panelsPerCourse;
  const assembly=Array.from({length:body.quantity},(_,i)=>{const course=Math.floor(i/panelsPerCourse)+1,panel=i%panelsPerCourse+1,offset=p.seamLayout==='stagger'&&course%2===0?pitch/2:0,start=(seamStart/360*circumference+offset+(panel-1)*pitch)%circumference;return {id:'S'+(i+1),course,panel,z:(course-1)*(courseHeight+p.gap),height:courseHeight,start,length:panelLength,offset,angle:(seamStart+offset/circumference*360)%360};});
  const formedHeads=parts.filter(part=>part.kind==='formed').reduce((s,part)=>s+part.quantity,0),netWeight=parts.reduce((sum,part)=>sum+part.netWeight,0);
  const base={...g,methods:m,layouts:ends.layouts,shapeLabel:shapeLabel(p),parts,assembly,courses,panelsPerCourse,courseHeight,panelLength,circumference,verticalSeams,horizontalSeams,weldLength,netWeight,formedHeads};
  const nozzlePlan=planTankNozzles(base);
  // Attachments are planned after the nozzles (pads, loads) and nested on the same stock, after the body parts.
  const attachments=planAttachments({...base,nozzlePlan});
  const attachmentParts=attachments.issues.length?[]:attachments.parts.map(plate=>{const part=piecesPart(plate.id,plate.name,plate.t,plate.pieces.map(x=>({...x})),'attachment',plate.pieces.reduce((s,x)=>s+mass(x.area,plate.t,rho),0));part.group='attachment';return part;});
  const allParts=[...parts,...attachmentParts];
  for(const part of allParts)if(part.sheets===null)issues.push({field:part.group==='attachment'?'methods':part.pieces?'stockWidth':part.width<=p.stockWidth?'stockLength':'stockWidth',part:part.id,message:part.group==='attachment'?`${part.name}放不進原板，請換板尺寸或調整附件尺寸。`:part.pieces?`${part.name}有分片放不進原板。請換板尺寸，或在「製作工法」調整分片。`:`${part.name} ${part.width.toFixed(1)} × ${part.height.toFixed(1)} mm 放不進原板。請換板尺寸，或在「製作工法」改用拼板。`});
  const stockComplete=!issues.length,sheets=packTankParts(allParts,p),plateSheets=sheets.length,stockWeight=sheets.reduce((sum,s)=>sum+mass(p.stockWidth*p.stockLength,s.thickness,rho),0);
  for(const part of allParts)part.sheetIDs=sheets.filter(s=>s.placements.some(i=>i.part===part.id)).map(s=>s.id);
  const source=new Map(sheets.flatMap(sheet=>sheet.placements.map(item=>[item.part+item.piece,{sheet:sheet.id,x:item.x,y:item.y,rotated:item.rotated}])));
  for(const piece of assembly)Object.assign(piece,source.get(piece.id));
  const blankOf=item=>{const part=allParts.find(part=>part.id===item.part);return part.pieces?part.pieces[item.piece-1].blankWeight:part.blankWeight/part.quantity;};
  const allocatedBlankWeight=sheets.reduce((sum,sheet)=>sum+sheet.placements.reduce((subtotal,item)=>subtotal+blankOf(item),0),0);
  methodIssues.push(...attachments.issues);
  const result={...base,nozzlePlan,attachments,attachmentParts,fabrication:{valid:!methodIssues.length,issues:methodIssues,warnings:attachments.warnings},emptyWeight:attachments.emptyWeight,sheets,materialIssues:issues,stockComplete,plateSheets,stockWeight,allocatedBlankWeight,offcutWeight:Math.max(0,stockWeight-allocatedBlankWeight),utilization:stockWeight?allocatedBlankWeight/stockWeight*100:0,blankWeight:parts.reduce((sum,part)=>sum+(part.blankWeight??0),0),notes:[...notes,'原板採購按矩形包絡做順序切割排料，含刀縫；同厚度零件可共用餘板。這是可放入原板的估算配置，未保證最少張數。餘料估重含刀縫與圓板外側廢料，不代表全部可再利用。',p.seamLayout==='stagger'?'相鄰圈縱縫按半片節距錯開，僅供組立位置示意；未校核規範所需的縫距、接管與補強避讓。':'相鄰圈縱縫對齊，僅供配置比較；接縫交會與適用規範尚未校核。','板厚與材質由使用者提供作估料，未計算最低設計厚度；腐蝕裕量欄僅記錄條件，估料按所填名目板厚，不另加裕量。管嘴及已填法蘭另列，主體估重未扣開孔。人孔、補強板、支座、加強圈、梯台、保溫與焊材等附件依「製作工法」另列，不含在主體估重。',flatEnd>0?`捲板未預彎：每片圓周方向兩端各加 ${flatEnd} mm 直邊，捲後切除。`:'捲板用板厚中面周長 π × (內徑＋板厚) 作近似；留料供修邊，焊接收縮與捲板機預彎／夾持餘量須另確認。']};
  if(process)result.process=planProcess(result,attachments);
  return result;
}
