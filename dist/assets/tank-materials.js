import {solveTank} from './tank-geometry.js';
import {planTankNozzles} from './tank-nozzles.js';
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
export function compareTankStocks(values){return TANK_STOCKS.map(stock=>({...stock,result:estimateTank({...values,stockWidth:stock.stockWidth,stockLength:stock.stockLength})}));}
export function rectanglePacking(w,h,sw,sl,kerf){
  const configurations=[{columns:Math.floor((sl+kerf)/(w+kerf)),rows:Math.floor((sw+kerf)/(h+kerf)),rotated:false},{columns:Math.floor((sl+kerf)/(h+kerf)),rows:Math.floor((sw+kerf)/(w+kerf)),rotated:true}];
  return configurations.sort((a,b)=>b.columns*b.rows-a.columns*a.rows)[0];
}
// First-fit guillotine layout. Reuse offcuts only at matching thickness.
export function packTankParts(parts,p){
  const sheets=[];
  for(const part of parts){
    if(part.kind==='formed'||part.perSheet===0)continue;
    for(let piece=0;piece<part.quantity;piece++){
      let chosen=null;
      for(const sheet of sheets){if(sheet.thickness!==part.thickness)continue;for(let i=0;i<sheet.free.length;i++){const f=sheet.free[i];for(const rotated of [false,true]){const w=rotated?part.height:part.width,h=rotated?part.width:part.height;if(w<=f.w+1e-8&&h<=f.h+1e-8){chosen={sheet,index:i,f,w,h,rotated};break;}}if(chosen)break;}if(chosen)break;}
      if(!chosen){const sheet={id:sheets.length+1,thickness:part.thickness,free:[{x:0,y:0,w:p.stockLength,h:p.stockWidth}],placements:[]};sheets.push(sheet);const rotated=part.width>p.stockLength||part.height>p.stockWidth;chosen={sheet,index:0,f:sheet.free[0],w:rotated?part.height:part.width,h:rotated?part.width:part.height,rotated};}
      const {sheet,index,f,w,h,rotated}=chosen;sheet.free.splice(index,1);sheet.placements.push({part:part.id,piece:piece+1,x:f.x,y:f.y,w,h,rotated});
      const dw=f.w-w-p.kerf,dh=f.h-h-p.kerf;
      if(dw>dh){if(dw>0)sheet.free.push({x:f.x+w+p.kerf,y:f.y,w:dw,h:f.h});if(dh>0)sheet.free.push({x:f.x,y:f.y+h+p.kerf,w,h:dh});}
      else {if(dh>0)sheet.free.push({x:f.x,y:f.y+h+p.kerf,w:f.w,h:dh});if(dw>0)sheet.free.push({x:f.x+w+p.kerf,y:f.y,w:dw,h});}
    }
  }
  return sheets;
}
export function estimateTank(values){
  const g=solveTank(values);if(!g.valid)return g;
  const p=g.input,issues=[],parts=[],notes=[],circumference=Math.PI*g.meanDiameter;
  const upright=p.shellLayout==='upright',heightSide=upright?p.stockLength:p.stockWidth,aroundSide=upright?p.stockWidth:p.stockLength;
  const courses=Math.ceil((g.bodyHeight+p.gap)/(heightSide-2*p.trim+p.gap)),courseHeight=(g.bodyHeight-(courses-1)*p.gap)/courses;
  const panelsPerCourse=Math.ceil(circumference/(aroundSide-2*p.trim+p.gap)),panelLength=(circumference-panelsPerCourse*p.gap)/panelsPerCourse;
  if(courses>200||courses*panelsPerCourse>10000)return {...g,valid:false,issues:[{field:'stockWidth',message:'分片過多（最多 200 圈、10,000 片），請換較大的原板。'}]};
  if(!(courseHeight>0&&panelLength>0))return {...g,valid:false,issues:[{field:'gap',message:'焊口間隙已超過可用尺寸，請核對間隙或換較大的板。'}]};
  const make=(id,name,w,h,t,qty,kind='rectangle')=>{
    const pack=rectanglePacking(w,h,p.stockWidth,p.stockLength,p.kerf),perSheet=pack.columns*pack.rows;
    return {id,name,width:w,height:h,thickness:t,quantity:qty,kind,pack,perSheet,sheets:perSheet?Math.ceil(qty/perSheet):null,stockWeight:perSheet?Math.ceil(qty/perSheet)*mass(p.stockWidth*p.stockLength,t,p.density):null};
  };
  const body=make('S','筒身捲板',panelLength+2*p.trim,courseHeight+2*p.trim,p.shellThickness,courses*panelsPerCourse);
  body.finishedWidth=panelLength;body.finishedHeight=courseHeight;body.netWeight=mass(panelLength*courseHeight*body.quantity,p.shellThickness,p.density);
  body.blankWeight=mass(body.width*body.height,p.shellThickness,p.density)*body.quantity;parts.push(body);
  if(p.shape==='elliptical'){
    // Thin-shell midsurface estimate for a half oblate spheroid, plus straight flange.
    const a=(g.di+p.endThickness)/2,c=g.di/4+p.endThickness/2,e=Math.sqrt(1-c*c/a/a);
    const area=Math.PI*a*a*(1+(1-e*e)*Math.atanh(e)/e)+2*Math.PI*a*p.headStraight;
    const unitWeight=p.headWeight>0?p.headWeight:mass(area,p.endThickness,p.density);
    const heads=p.headBlank>0?make('H','封頭毛坯（供應商尺寸）',p.headBlank,p.headBlank,p.endThickness,2,'circle'):{id:'H',name:'成形 2:1 橢圓封頭',thickness:p.endThickness,quantity:2,kind:'formed',sheets:0,stockWeight:null};
    heads.blankDiameter=p.headBlank;heads.unitWeight=unitWeight;heads.netWeight=2*unitWeight;heads.weightEstimated=p.headWeight===0;
    if(p.headBlank>0)heads.blankWeight=mass(Math.PI*p.headBlank**2/4,p.endThickness,p.density)*2;
    parts.push(heads);notes.push('橢圓封頭是雙曲率成形件，不能直接用表面積換算成精確下料圓。未填供應商毛坯尺寸時，按 2 只成形封頭採購；估重不含成形減薄。');
  }else{
    const finishedDiameter=g.od+2*p.overhang,blankDiameter=finishedDiameter+2*p.trim,quantity=p.shape==='flat'?2:1;
    const ends=make('F',p.shape==='flat'?'平底＋平蓋圓板':'平底圓板',blankDiameter,blankDiameter,p.endThickness,quantity,'circle');
    ends.blankDiameter=blankDiameter;ends.finishedDiameter=finishedDiameter;ends.netWeight=mass(Math.PI*finishedDiameter**2/4,p.endThickness,p.density)*quantity;ends.blankWeight=mass(Math.PI*blankDiameter**2/4,p.endThickness,p.density)*quantity;parts.push(ends);
  }
  for(const part of parts)if(part.sheets===null)issues.push({field:part.width<=p.stockWidth?'stockLength':'stockWidth',part:part.id,message:`${part.name} ${part.width.toFixed(1)} × ${part.height.toFixed(1)} mm 放不進原板。請換板尺寸；拼板底／蓋須另作接縫配置。`});
  const verticalSeams=courses*panelsPerCourse,horizontalSeams=courses-1;
  const weldLength=verticalSeams*courseHeight+horizontalSeams*circumference;
  const stockComplete=!issues.length,sheets=packTankParts(parts,p),plateSheets=sheets.length,stockWeight=sheets.reduce((sum,s)=>sum+mass(p.stockWidth*p.stockLength,s.thickness,p.density),0);
  for(const part of parts)part.sheetIDs=sheets.filter(s=>s.placements.some(i=>i.part===part.id)).map(s=>s.id);
  const source=new Map(sheets.flatMap(sheet=>sheet.placements.map(item=>[item.part+item.piece,{sheet:sheet.id,x:item.x,y:item.y,rotated:item.rotated}])));
  const assembly=Array.from({length:body.quantity},(_,i)=>{const course=Math.floor(i/panelsPerCourse)+1,panel=i%panelsPerCourse+1,pitch=circumference/panelsPerCourse,offset=p.seamLayout==='stagger'&&course%2===0?pitch/2:0;return {id:'S'+(i+1),course,panel,z:(course-1)*(courseHeight+p.gap),height:courseHeight,start:(offset+(panel-1)*pitch)%circumference,length:panelLength,offset,angle:offset/circumference*360,...source.get('S'+(i+1))};});
  const allocatedBlankWeight=sheets.reduce((sum,sheet)=>sum+sheet.placements.reduce((subtotal,item)=>{const part=parts.find(part=>part.id===item.part);return subtotal+part.blankWeight/part.quantity;},0),0);
  const result={...g,parts,sheets,assembly,materialIssues:issues,stockComplete,plateSheets,stockWeight,allocatedBlankWeight,offcutWeight:Math.max(0,stockWeight-allocatedBlankWeight),utilization:stockWeight?allocatedBlankWeight/stockWeight*100:0,netWeight:parts.reduce((sum,part)=>sum+part.netWeight,0),blankWeight:parts.reduce((sum,part)=>sum+(part.blankWeight??0),0),formedHeads:p.shape==='elliptical'&&p.headBlank===0?2:0,courses,panelsPerCourse,courseHeight,panelLength,circumference,verticalSeams,horizontalSeams,weldLength,notes:[...notes,'原板採購按矩形包絡做順序切割排料，含刀縫；同厚度零件可共用餘板。這是可放入原板的估算配置，未保證最少張數。餘料估重含刀縫與圓板外側廢料，不代表全部可再利用。',p.seamLayout==='stagger'?'相鄰圈縱縫按半片節距錯開，僅供組立位置示意；未校核規範所需的縫距、接管與補強避讓。':'相鄰圈縱縫對齊，僅供配置比較；接縫交會與適用規範尚未校核。','板厚與材質由使用者提供作估料，未計算最低設計厚度；腐蝕裕量欄僅記錄條件，估料按所填名目板厚，不另加裕量。管嘴及已填法蘭另列，主體估重未扣開孔。未含人孔、補強板、支座、加強環、平台、保溫與焊材。','捲板用板厚中面周長 π × (內徑＋板厚) 作近似；留料供修邊，焊接收縮與捲板機預彎／夾持餘量須另確認。']};
  return {...result,nozzlePlan:planTankNozzles(result)};
}
