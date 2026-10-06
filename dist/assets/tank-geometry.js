// Geometry only. Thickness is a supplied estimating value, never a code design result.
export const TANK_DEFAULTS=Object.freeze({shape:'open',solve:'volume',basis:'inside',diameter:1200,height:2000,volume:2.262,shellThickness:6,endThickness:6,density:7850,fill:90,stockWidth:1500,stockLength:6000,shellLayout:'around',seamLayout:'stagger',trim:5,kerf:3,gap:0,overhang:10,headStraight:25,headGap:2,headBlank:0,headWeight:0,service:'unknown',code:'unknown',edition:'',jurisdiction:'',medium:'',material:'',pressure:'',vacuum:'',temperature:'',minTemperature:'',liquidDensity:'',corrosion:'',efficiency:'',nozzles:Object.freeze([])});
export const SHAPES={open:'開口平底槽',flat:'平蓋平底槽',elliptical:'雙 2:1 橢圓封頭'};
const limits={diameter:[1,100000],height:[1,100000],volume:[1e-9,1e6],shellThickness:[.1,300],endThickness:[.1,300],density:[100,30000],fill:[1,100],stockWidth:[10,20000],stockLength:[10,30000],trim:[0,100],kerf:[0,30],gap:[0,30],overhang:[0,1000],headStraight:[0,1000],headGap:[0,30],headBlank:[0,20000],headWeight:[0,1e7]};
export function capacity(di,h,shape){return Math.PI*di*di*h/4/1e9+(shape==='elliptical'?Math.PI*di**3/12/1e9:0);}
export function solveTank(values={}){
  const input={...TANK_DEFAULTS,...values},issues=[];
  const issue=(field,message)=>issues.push({field,message});
  if(!Object.hasOwn(SHAPES,input.shape))issue('shape','選擇支援的桶槽形狀。');
  if(!['volume','height','diameter'].includes(input.solve))issue('solve','選擇已知的兩個尺寸。');
  if(!['inside','outside'].includes(input.basis))issue('basis','選擇內徑或外徑基準。');
  if(!['around','upright'].includes(input.shellLayout))issue('shellLayout','選擇筒身原板方向。');
  if(!['stagger','aligned'].includes(input.seamLayout))issue('seamLayout','選擇筒身縱縫配置。');
  for(const [field,[min,max]] of Object.entries(limits)){
    if(field===input.solve)continue;
    if(input.shape==='elliptical'&&field==='overhang')continue;
    if(input.shape!=='elliptical'&&['headStraight','headGap','headBlank','headWeight'].includes(field))continue;
    const value=input[field];input[field]=typeof value==='string'&&value.trim()===''?NaN:Number(value);
    if(!Number.isFinite(input[field])||input[field]<min||input[field]>max)issue(field,`${fieldLabel(field)}需在 ${min}～${max} 之間。`);
  }
  if(issues.length)return {valid:false,input,issues};
  const inside=d=>input.basis==='outside'?d-2*input.shellThickness:d;
  let di=input.solve==='diameter'?0:inside(input.diameter),h=input.height;
  if(input.solve!=='diameter'&&di<=0)issue('diameter','外徑必須大於兩倍筒身板厚。');
  if(issues.length)return {valid:false,input,issues};
  if(input.solve==='height')h=(input.volume-(input.shape==='elliptical'?Math.PI*di**3/12/1e9:0))*1e9/(Math.PI*di*di/4);
  if(input.solve==='diameter'){
    let lo=0,hi=100000-(input.basis==='outside'?2*input.shellThickness:0);
    if(capacity(hi,h,input.shape)<input.volume)return {valid:false,input,issues:[{field:'volume',message:'此容積所需直徑超過 100,000 mm，請核對容積與高度。'}]};
    for(let i=0;i<100;i++){const mid=(lo+hi)/2;if(capacity(mid,h,input.shape)<input.volume)lo=mid;else hi=mid;}di=(lo+hi)/2;
  }
  const diameter=input.basis==='inside'?di:di+2*input.shellThickness;
  if(!(di>0)||diameter<1||diameter>100000)issue('volume','此容積算出的直徑超出工具範圍，請改尺寸或容積。');
  if(!(h>=1)||h>100000)issue(input.solve==='height'?'volume':'height','容積不足以容納封頭，或算出的直段高度超出工具範圍。');
  const bodyHeight=h-(input.shape==='elliptical'?2*(input.headStraight+input.headGap):0);
  if(input.shape==='elliptical'&&input.headBlank>0&&input.headBlank<di+2*input.endThickness)issue('headBlank','封頭毛坯小於封頭口部外徑，請向供應商確認毛坯尺寸。');
  if(!(bodyHeight>0))issue(input.solve==='height'?'volume':'height','兩只封頭直邊與對接間隙已占滿直段；增加高度／容積，或核對封頭直邊。');
  if(input.stockWidth<=2*input.trim)issue('stockWidth','板寬必須大於兩側留料，請換較寬的板或減少留料。');
  if(input.stockLength<=2*input.trim)issue('stockLength','板長必須大於兩側留料，請換較長的板或減少留料。');
  if(issues.length)return {valid:false,input,issues};
  const v=capacity(di,h,input.shape);
  return {valid:true,input:{...input,diameter,height:h,volume:v},issues:[],di,od:di+2*input.shellThickness,meanDiameter:di+input.shellThickness,height:h,bodyHeight,headDepth:input.shape==='elliptical'?di/4:0,totalHeight:h+(input.shape==='elliptical'?di/2+2*input.endThickness:(input.shape==='flat'?2:1)*input.endThickness),volume:v,workingVolume:v*input.fill/100};
}
export function fieldLabel(field){return ({diameter:'直徑 mm',height:'直段高度 mm',volume:'幾何容積 m³',shellThickness:'筒身板厚 mm',endThickness:'底／蓋／封頭板厚 mm',density:'材料密度 kg/m³',fill:'使用容量比例 %',stockWidth:'原板寬 mm',stockLength:'原板長 mm',trim:'每邊留料 mm',kerf:'切割刀縫 mm',gap:'筒身對接間隙 mm',overhang:'平底／平蓋外伸 mm',headStraight:'封頭直邊 mm',headGap:'封頭對接間隙 mm',headBlank:'供應商指定毛坯直徑 mm',headWeight:'每只封頭實重 kg'})[field]||field;}
