export const CODE_SOURCES=[{label:'ASME VIII-1：壓力容器範圍',url:'https://www.asme.org/codes-standards/find-codes-standards/bpvc-viii-1-bpvc-section-viii-rules-construction-pressure-vessels-division-1'},{label:'API 650：官方儲槽範圍（目錄第 9 頁）',url:'https://www.api.org/-/media/files/publications/2025-catalog/06_refining_2025.pdf'},{label:'ASME：認證與品質控制資源',url:'https://www.asme.org/certification-accreditation/resources-and-events/downloadable-resources'}];
export const DESIGN_FIELDS={service:'操作類別（常壓／加壓／真空）',code:'業主指定規範',edition:'合約採用版次',jurisdiction:'設置地／適用法規',medium:'儲存介質',material:'正式材料規格／牌號',pressure:'設計內壓 kPa(g)',vacuum:'設計外壓差 kPa',temperature:'最高設計溫度 °C',minTemperature:'最低設計金屬溫度 °C',liquidDensity:'內容物密度 kg/m³',corrosion:'腐蝕裕量 mm',efficiency:'焊接接頭效率 E'};
const labels=DESIGN_FIELDS;
export function designValue(p,key){const value=p[key];if(value===''||value==='unknown'||value===undefined)return '待提供';return key==='service'?({atmospheric:'常壓',pressure:'內壓容器',vacuum:'真空／外壓容器',both:'內壓與外壓容器'}[value]||'待提供'):key==='code'?({asme:'ASME VIII-1',api650:'API 650',other:'其他（依合約）'}[value]||'待提供'):value;}
const supplied=value=>value!==null&&value!==undefined&&String(value).trim()!=='';
export function tankCodeGuide(p){
  const service=['unknown','atmospheric','pressure','vacuum','both'].includes(p.service)?p.service:'unknown',code=['unknown','asme','api650','other'].includes(p.code)?p.code:'unknown';
  const pressurized=['pressure','vacuum','both'].includes(service)||(supplied(p.pressure)&&Number(p.pressure)>0)||(supplied(p.vacuum)&&Number(p.vacuum)>0);
  let title='先確認用途與設計規範',summary='桶槽名稱與尺寸無法決定適用規範。先確認是否密閉、加壓、抽真空，以及業主合約與設置地要求。';
  if(code==='asme'||pressurized){title=code==='asme'?'業主指定 ASME：尚待正式設計':'有壓力／真空條件：先確認容器設計';summary='ASME VIII-1 的官方範圍說明包含內壓或外壓超過 15 psig 的壓力容器。這個數字不是本工具的自動豁免線；真空、例外條件與設置地要求仍需確認。';}
  else if(code==='api650'||service==='atmospheric'){title=code==='api650'?'業主指定 API 650：先核對適用範圍':'常壓槽：依用途選規範';summary='API 650 有立式、圓筒、地上、焊接槽與均勻支撐槽底等範圍條件，主要處理接近常壓的儲槽；不能套用到所有水槽、製程槽或壓力容器。';}
  const required=['service','code','edition','jurisdiction','medium','material','pressure','vacuum','temperature','minTemperature','liquidDensity','corrosion'];
  if(pressurized||code==='asme')required.push('efficiency');
  const missing=required.filter(field=>['service','code'].includes(field)?(field==='service'?service:code)==='unknown':!supplied(p[field])).map(field=>({field,label:labels[field]}));
  const numericIssues=[];for(const [field,min,max] of [['pressure',0,1e6],['vacuum',0,1e6],['temperature',-273.15,2000],['minTemperature',-273.15,2000],['liquidDensity',.001,30000],['corrosion',0,300],['efficiency',.01,1]])if(supplied(p[field])&&(!Number.isFinite(Number(p[field]))||Number(p[field])<min||Number(p[field])>max))numericIssues.push({field,label:`${labels[field]}需在 ${min}～${max} 之間`});
  if(supplied(p.temperature)&&supplied(p.minTemperature)&&Number(p.minTemperature)>Number(p.temperature))numericIssues.push({field:'minTemperature',label:'最低設計金屬溫度不得高於最高設計溫度'});
  const concerns=[];
  if(p.nozzles?.length)concerns.push('已規劃管嘴及法蘭；開孔補強、局部應力、外接管線載荷及法蘭壓溫額定尚未校核，尺寸記錄不代表設計通過。');
  if(pressurized&&p.shape!=='elliptical')concerns.push('目前選的是平底／平蓋；其承壓或抗真空能力未經設計驗證。圓筒估料公式不能證明平板端部可承壓。');
  if(service==='vacuum'||service==='both'||supplied(p.vacuum)&&Number(p.vacuum)>0)concerns.push('外壓／真空要另做失穩與加強環校核，不能用內壓厚度代替。');
  if(service==='atmospheric'&&pressurized)concerns.push('操作類別選常壓，但已填入正的內壓或外壓差；請核對設計條件。');
  if(code==='api650'&&(pressurized||p.shape==='elliptical'))concerns.push('目前條件與一般 API 650 槽型／常壓條件不同；須確認適用範圍與附加要求，不能直接判定合規。');
  return {title,summary,missing,numericIssues,concerns,recorded:!missing.length&&!numericIssues.length,checks:['板厚、腐蝕裕量與材料在設計溫度下的許用值','封頭／底蓋、開孔與補強、接管及支承載荷','液柱、風／地震、外壓失穩與其他設計載荷','焊接程序與人員資格、接縫配置、NDE、熱處理、試驗及洩壓裝置','業主合約、設置地法規、檢查與認證要求'],status:'估料用板厚；尚未完成強度與規範審查'};
}
