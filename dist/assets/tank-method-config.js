// Fabrication-method settings: one declarative spec drives validation, project files and the method panel inputs.
// Every value is an estimating choice recorded by the user; nothing here is a code design result.
const num=(value,min,max,label,extra={})=>({type:'number',default:value,min,max,label,...extra});
const pick=(value,options,label,extra={})=>({type:'select',default:value,options,label,...extra});
const flag=(value,label,extra={})=>({type:'bool',default:value,label,...extra});
const txt=(value,label,extra={})=>({type:'text',default:value,label,max:60,...extra});
const flat=c=>c.ends.includes('flat');
export const PROCESS_LABELS=Object.freeze({smaw:'SMAW 手工電銲',gmaw:'GMAW 實心焊線',fcaw:'FCAW 包藥焊線（氣體）','fcaw-s':'FCAW-S 自保護包藥',saw:'SAW 潛弧焊',gtaw:'GTAW 氬焊'});
/** Typical deposition efficiencies (manufacturer guide ranges; editable). */
export const PROCESS_EFFICIENCY=Object.freeze({smaw:.62,gmaw:.95,fcaw:.86,'fcaw-s':.8,saw:.99,gtaw:.95});
export const METHOD_SPECS=Object.freeze({
  layout:{label:'下料方式',fields:{
    bottom:pick('single',{single:'整片圓板',strips:'條板＋異形邊板拼接',annular:'環形邊板＋中幅板'},'平底下料方式',{when:(g,c)=>c.endTypes.bottom==='flat'}),
    top:pick('single',{single:'整片圓板',strips:'條板＋異形邊板拼接'},'平蓋下料方式',{when:(g,c)=>c.endTypes.top==='flat'}),
    joint:pick('lap',{lap:'搭接（單面角焊）',butt:'對接'},'拼板接頭',{when:(g,c)=>flat(c)}),
    lap:num(30,10,300,'搭接寬 mm',{when:(g,c)=>flat(c)&&g.joint==='lap',help:'API 650 底板搭接 ≥ 5 倍較薄板厚；單面焊不需超過 25 mm'}),
    gap:num(2,0,20,'對接間隙 mm',{when:(g,c)=>flat(c)&&g.joint==='butt'}),
    annularWidth:num(650,100,5000,'環形邊板伸入筒內 mm',{when:(g,c)=>c.endTypes.bottom==='flat'&&g.bottom==='annular',help:'API 650：筒內至中幅板搭接縫 ≥ 600 mm；中幅板壓在環形邊板上，伸入量需 ≥ 600 ＋ 搭接寬'}),
    annularProjection:num(60,0,1000,'環形邊板伸出筒外 mm',{when:(g,c)=>c.endTypes.bottom==='flat'&&g.bottom==='annular'}),
    annularThickness:num(0,0,300,'環形邊板厚 mm（0＝同底板）',{when:(g,c)=>c.endTypes.bottom==='flat'&&g.bottom==='annular'}),
    coneTopBands:num(0,0,16,'錐頂分圈數（0＝自動）',{when:(g,c)=>c.endTypes.top==='cone',integer:true}),
    coneTopSegments:num(0,0,720,'錐頂每圈片數（0＝自動）',{when:(g,c)=>c.endTypes.top==='cone',integer:true}),
    coneBottomBands:num(0,0,16,'錐底分圈數（0＝自動）',{when:(g,c)=>c.endTypes.bottom==='cone',integer:true}),
    coneBottomSegments:num(0,0,720,'錐底每圈片數（0＝自動）',{when:(g,c)=>c.endTypes.bottom==='cone',integer:true}),
    hemiMethod:pick('formed',{formed:'外購成形封頭',petal:'中心板＋瓜瓣板拼焊'},'半球封頭製作',{when:(g,c)=>c.ends.includes('hemispherical')}),
    petalBands:num(0,0,40,'瓜瓣分圈數（0＝自動）',{when:(g,c)=>c.endTypes.top==='dome'||c.ends.includes('hemispherical')&&g.hemiMethod==='petal',integer:true}),
    petals:num(0,0,720,'每圈瓜瓣片數（0＝自動）',{when:(g,c)=>c.endTypes.top==='dome'||c.ends.includes('hemispherical')&&g.hemiMethod==='petal',integer:true}),
    crownDiameter:num(0,0,20000,'中心頂板展開直徑 mm（0＝自動）',{when:(g,c)=>c.endTypes.top==='dome'||c.ends.includes('hemispherical')&&g.hemiMethod==='petal'})
  }},
  rolling:{label:'捲板',fields:{
    preBend:pick('yes',{yes:'先預彎板端',no:'不預彎，留直邊後切除'},'板端處理'),
    flatEnd:num(0,0,1000,'每端直邊留長 mm',{when:g=>g.preBend==='no',help:'三輥捲板機無法捲到的板端長度，依機台確認'}),
    machineWidth:num(0,0,20000,'捲板機有效寬 mm（0＝未指定）'),
    machineThickness:num(0,0,300,'捲板機最大板厚 mm（0＝未指定）'),
    machineMinDiameter:num(0,0,20000,'最小捲圓內徑 mm（0＝未指定）')
  }},
  supports:{label:'支撐',fields:{
    type:pick('none',{none:'不另做支撐',legs:'支腿',lugs:'耳座（支耳）',skirt:'裙座',saddles:'鞍座',anchors:'錨固座'},'支撐型式'),
    count:num(4,2,24,'數量',{when:g=>['legs','lugs'].includes(g.type),integer:true}),
    startAngle:num(45,0,360,'第 1 個方位角 °',{when:g=>['legs','lugs','anchors'].includes(g.type)}),
    legSection:pick('pipe',{pipe:'鋼管',angle:'等邊角鋼'},'支腿斷面',{when:g=>g.type==='legs'}),
    legSize:num(114.3,20,1000,'鋼管外徑／角鋼邊寬 mm',{when:g=>g.type==='legs'}),
    legThickness:num(6,1,50,'管厚／角鋼厚 mm',{when:g=>g.type==='legs'}),
    clearance:num(300,0,10000,'槽底最低點離地 mm',{when:g=>g.type==='legs'||g.type==='saddles'}),
    attach:num(300,50,5000,'支腿與筒身搭接長 mm',{when:g=>g.type==='legs'}),
    lugElevation:num(0,0,100000,'耳座底板距筒身下緣 mm（0＝筒身 2/3 高）',{when:g=>g.type==='lugs'}),
    lugProjection:num(200,50,2000,'耳座外伸 mm',{when:g=>g.type==='lugs'}),
    lugWidth:num(200,50,2000,'耳座寬 mm',{when:g=>g.type==='lugs'}),
    lugHeight:num(250,50,3000,'耳座筋板高 mm',{when:g=>g.type==='lugs'}),
    skirtHeight:num(1000,100,20000,'裙座高（地面至下封頭切線）mm',{when:g=>g.type==='skirt'}),
    skirtThickness:num(0,0,100,'裙座板厚 mm（0＝同筒身）',{when:g=>g.type==='skirt'}),
    ringOutside:num(100,0,1000,'基礎環外伸 mm',{when:g=>g.type==='skirt'}),
    ringInside:num(100,0,1000,'基礎環內伸 mm',{when:g=>g.type==='skirt'}),
    boltCount:num(8,4,96,'地腳螺栓數',{when:g=>g.type==='skirt'||g.type==='anchors',integer:true}),
    boltDiameter:num(24,10,120,'地腳螺栓直徑 mm',{when:g=>g.type==='skirt'||g.type==='anchors'}),
    openings:num(1,0,4,'裙座檢查孔數',{when:g=>g.type==='skirt',integer:true}),
    openingDiameter:num(450,200,1200,'檢查孔直徑 mm',{when:g=>g.type==='skirt'}),
    saddleA:num(0,0,100000,'鞍座中心距切線 A mm（0＝0.2 × 切線間長）',{when:g=>g.type==='saddles'}),
    contactAngle:num(120,90,180,'鞍座包角 °',{when:g=>g.type==='saddles'}),
    saddleWidth:num(200,80,2000,'鞍座寬 mm',{when:g=>g.type==='saddles'}),
    wearPlate:flag(true,'加墊板（包角另加 12°、寬加 100 mm）',{when:g=>g.type==='saddles'}),
    ribs:num(4,2,12,'每座筋板數',{when:g=>g.type==='saddles',integer:true}),
    chairHeight:num(250,80,2000,'錨固座高 mm',{when:g=>g.type==='anchors'}),
    plateThickness:num(12,4,100,'支撐板厚 mm（底板／筋板）',{when:g=>g.type!=='none'})
  }},
  rings:{label:'加強圈',list:true,max:12,item:{
    purpose:pick('curb',{curb:'頂部包邊角鋼',wind:'抗風圈',stiffener:'加強圈',vacuum:'真空加強圈'},'用途'),
    section:pick('angle',{angle:'等邊角鋼',flat:'扁鋼',channel:'槽鋼'},'斷面'),
    a:num(75,20,500,'邊寬／扁鋼寬 mm'),
    b:num(75,0,500,'另一邊寬 mm（槽鋼腹高）',{when:g=>g.section!=='flat'}),
    t:num(6,2,50,'厚 mm'),
    position:num(0,0,100000,'位置：距筒身下緣 mm（頂部包邊自動在頂）',{when:g=>g.purpose!=='curb'}),
    side:pick('out',{out:'筒外',in:'筒內'},'裝在'),
    make:pick('rolled',{rolled:'型鋼捲圓',plate:'板材切割環板'},'製作',{when:g=>g.section==='flat'}),
    barLength:num(6000,1000,15000,'型鋼定尺長 mm'),
    weld:pick('continuous',{continuous:'連續角焊（單側）',both:'兩側連續角焊',stitch:'間斷焊 50%'},'焊接')
  }},
  access:{label:'梯台',fields:{
    ladder:flag(false,'直梯'),
    ladderAngle:num(0,0,360,'直梯方位角 °',{when:g=>g.ladder}),
    ladderWidth:num(450,300,800,'踏條淨寬 mm',{when:g=>g.ladder}),
    rungPitch:num(300,200,400,'踏條間距 mm',{when:g=>g.ladder,help:'職安設施規則第 37 條：踏條應等間隔設置'}),
    standoff:num(200,165,600,'踏條至槽壁淨距 mm',{when:g=>g.ladder,help:'職安設施規則第 37 條：≥ 16.5 cm'}),
    extension:num(1000,600,2000,'梯頂突出 mm',{when:g=>g.ladder,help:'職安設施規則第 37 條：梯頂突出板面 ≥ 60 cm'}),
    cage:pick('auto',{auto:'梯長超過 6 m 自動加護籠',yes:'加護籠',no:'不加（改用防墜器）'},'護籠',{when:g=>g.ladder}),
    stair:flag(false,'盤梯（繞筒身）'),
    stairStart:num(0,0,360,'盤梯起點方位角 °',{when:g=>g.stair}),
    stairWidth:num(800,560,1500,'盤梯寬 mm',{when:g=>g.stair,help:'職安設施規則第 29 條工作用階梯：寬 ≥ 56 cm'}),
    stairAngle:num(45,20,60,'盤梯斜角 °',{when:g=>g.stair,help:'職安設施規則第 29 條：傾斜 ≤ 60°'}),
    stairRise:num(200,120,250,'每階最大級高 mm',{when:g=>g.stair}),
    stairGap:num(100,20,500,'內側桁架至槽壁 mm',{when:g=>g.stair}),
    platform:flag(false,'頂部平台'),
    platformWidth:num(1000,600,3000,'平台寬 mm',{when:g=>g.platform}),
    platformLength:num(2000,600,20000,'平台長（沿圓周）mm',{when:g=>g.platform}),
    roofRail:flag(false,'槽頂周邊欄杆'),
    railHeight:num(1100,900,1500,'欄杆高 mm',{when:g=>g.platform||g.roofRail||g.stair,help:'營造安全衛生設施標準第 20 條（比照）：上欄杆 ≥ 90 cm、柱距 ≤ 2.5 m'}),
    postPitch:num(1500,500,2500,'欄杆柱距 mm',{when:g=>g.platform||g.roofRail||g.stair})
  }},
  jacket:{label:'夾套／盤管',fields:{
    type:pick('none',{none:'無',halfpipe:'半管夾套',full:'整體夾套',coil:'內盤管'},'型式'),
    pipeOD:num(60.3,20,400,'管外徑 mm',{when:g=>g.type==='halfpipe'||g.type==='coil'}),
    pipeThickness:num(3.9,1,30,'管厚 mm',{when:g=>g.type==='halfpipe'||g.type==='coil'}),
    pitch:num(100,20,2000,'螺距（中心距）mm',{when:g=>g.type==='halfpipe'||g.type==='coil'}),
    from:num(150,0,100000,'起點距筒身下緣 mm',{when:g=>g.type!=='none'}),
    to:num(0,0,100000,'終點距筒身下緣 mm（0＝頂端留 150 mm）',{when:g=>g.type!=='none'}),
    stockLength:num(6000,1000,15000,'管料定尺長 mm',{when:g=>g.type==='halfpipe'||g.type==='coil'}),
    jacketGap:num(50,10,500,'夾套環隙 mm',{when:g=>g.type==='full'}),
    jacketThickness:num(6,2,100,'夾套板厚 mm',{when:g=>g.type==='full'}),
    coilDiameter:num(0,0,100000,'盤管中心徑 mm（0＝0.8 × 內徑）',{when:g=>g.type==='coil'}),
    supportsPerTurn:num(6,3,24,'每圈支架數',{when:g=>g.type==='coil',integer:true})
  }},
  internals:{label:'內件',fields:{
    baffles:flag(false,'擋板'),
    baffleCount:num(4,2,12,'擋板數',{when:g=>g.baffles,integer:true}),
    baffleWidth:num(0,0,5000,'擋板寬 mm（0＝內徑 / 12）',{when:g=>g.baffles}),
    baffleGap:num(0,0,500,'擋板離壁 mm（0＝擋板寬 / 6）',{when:g=>g.baffles}),
    baffleThickness:num(6,2,50,'擋板厚 mm',{when:g=>g.baffles}),
    baffleBrackets:num(3,2,12,'每片支架數',{when:g=>g.baffles,integer:true})
  }},
  lifting:{label:'吊耳',fields:{
    enabled:flag(false,'加吊耳'),
    count:num(2,1,8,'吊耳數',{when:g=>g.enabled,integer:true}),
    share:num(2,1,8,'受力吊耳數（保守取 2）',{when:g=>g.enabled,integer:true}),
    slingAngle:num(60,30,90,'吊索與水平夾角 °',{when:g=>g.enabled}),
    factor:num(1.25,1,3,'動態係數',{when:g=>g.enabled}),
    lugThickness:num(20,6,100,'吊耳板厚 mm',{when:g=>g.enabled}),
    lugWidth:num(150,50,1000,'吊耳寬 mm',{when:g=>g.enabled}),
    lugHeight:num(200,50,1000,'吊耳高 mm',{when:g=>g.enabled}),
    hole:num(40,10,300,'吊孔直徑 mm',{when:g=>g.enabled})
  }},
  misc:{label:'小附件',fields:{
    nameplate:flag(false,'銘牌座'),
    grounding:num(0,0,12,'接地耳數',{integer:true}),
    sump:flag(false,'底板集水坑',{when:(g,c)=>c.endTypes.bottom==='flat'&&c.orientation==='vertical'}),
    sumpDiameter:num(610,200,3000,'集水坑直徑 mm',{when:(g,c)=>g.sump&&c.endTypes.bottom==='flat'&&c.orientation==='vertical',help:'尺寸依 API 650 集水坑表或圖面；常見 Ø610 × 300（NPS 2 排放）'}),
    sumpDepth:num(300,100,2000,'集水坑深 mm',{when:(g,c)=>g.sump&&c.endTypes.bottom==='flat'&&c.orientation==='vertical'}),
    sumpThickness:num(0,0,50,'集水坑板厚 mm（0＝同底板）',{when:(g,c)=>g.sump&&c.endTypes.bottom==='flat'&&c.orientation==='vertical'}),
    sumpOffset:num(0,0,100000,'集水坑中心距筒壁 mm（0＝置中）',{when:(g,c)=>g.sump&&c.endTypes.bottom==='flat'&&c.orientation==='vertical'}),
    sumpAngle:num(0,0,360,'集水坑方位角 °',{when:(g,c)=>g.sump&&g.sumpOffset>0&&c.endTypes.bottom==='flat'&&c.orientation==='vertical'})
  }},
  cutting:{label:'切割與坡口',fields:{
    method:pick('plasma',{oxy:'火焰切割',plasma:'電漿切割',laser:'雷射切割',waterjet:'水刀'},'切割方式'),
    speed:num(0,0,20000,'切割速度 mm/min（0＝不估工時）',{help:'依板厚與機台的廠商切割表填寫'}),
    pierce:num(0,0,600,'每次穿孔 秒（0＝不計）',{when:g=>g.speed>0}),
    bevel:pick('cut',{cut:'切割時同步斜割',machine:'坡口機／刨邊機',grind:'砂輪修磨'},'坡口加工'),
    bevelSpeed:num(0,0,20000,'坡口加工速度 mm/min（0＝不估）',{when:g=>g.bevel!=='cut'})
  }},
  welding:{label:'焊接',fields:{
    buttProcess:pick('fcaw',PROCESS_LABELS,'對接主縫焊法'),
    filletProcess:pick('smaw',PROCESS_LABELS,'角焊／附件焊法'),
    squareMax:num(6,1,20,'≤ 此板厚用 I 形對接 mm'),
    vMax:num(20,6,60,'≤ 此板厚用單邊 V，以上用 X 形 mm'),
    bevelAngle:num(60,30,90,'坡口夾角 °'),
    rootFace:num(2,0,10,'鈍邊 mm'),
    rootGap:num(2,0,10,'根部間隙 mm'),
    cap:num(1.5,0,5,'焊道加強高 mm（每面）'),
    filletLeg:num(0,0,50,'角焊腳長 mm（0＝較薄板厚，上限 12）'),
    buttEfficiency:num(0,0,1,'對接焊材效率（0＝依焊法）'),
    filletEfficiency:num(0,0,1,'角焊焊材效率（0＝依焊法）')
  }},
  heat:{label:'熱處理',fields:{
    material:pick('p1',{p1:'碳鋼 P-No.1',ss:'不鏽鋼 P-No.8',other:'其他（依 WPS）'},'材質群組'),
    preheat:num(0,0,400,'預熱溫度 °C（0＝不預熱）',{help:'ASME VIII-1 附錄 R（非強制）：P-No.1 含碳 > 0.30% 且厚 > 25 mm 時 80 °C，其餘 10 °C；以 WPS 為準'}),
    pwht:pick('auto',{auto:'依材質與板厚判斷',yes:'要做',no:'不做'},'焊後熱處理 PWHT'),
    method:pick('furnace',{furnace:'整體入爐',sections:'分段入爐',local:'局部加熱（環縫）'},'熱處理方式',{when:(g,c)=>pwhtPerformed(g,c)}),
    holdTemp:num(595,450,900,'持溫溫度 °C',{when:(g,c)=>pwhtPerformed(g,c),help:'P-No.1 最低 595 °C（ASME UCS-56）'}),
    furnaceLength:num(0,0,100000,'爐內長 mm（0＝未指定）',{when:(g,c)=>pwhtPerformed(g,c)&&g.method!=='local'}),
    furnaceWidth:num(0,0,50000,'爐內寬 mm（0＝未指定）',{when:(g,c)=>pwhtPerformed(g,c)&&g.method!=='local'}),
    furnaceHeight:num(0,0,50000,'爐內高 mm（0＝未指定）',{when:(g,c)=>pwhtPerformed(g,c)&&g.method!=='local'})
  }},
  inspection:{label:'檢驗試驗',fields:{
    standard:pick('auto',{auto:'依指定規範',api650:'API 650',asme:'ASME VIII-1',none:'只記錄量測方法'},'公差依據'),
    rt:pick('auto',{auto:'依接頭效率／規範',full:'全部 RT',spot:'抽查 RT',none:'不做 RT'},'射線檢驗'),
    hydro:flag(true,'水壓／盛水試驗'),
    testFill:num(100,10,100,'試驗盛水比例 %',{when:g=>g.hydro}),
    pumpRate:num(20,1,2000,'灌水量 m³/h',{when:g=>g.hydro}),
    lsr:num(1,.5,2,'許用應力比 LSR（壓力容器）',{when:g=>g.hydro}),
    boxLength:num(750,300,1500,'真空箱長 mm'),
    boxOverlap:num(50,25,300,'真空箱重疊 mm')
  }},
  surface:{label:'表面處理',fields:{
    paint:flag(false,'塗裝'),
    paintSides:pick('outside',{outside:'外表面',inside:'內表面',both:'內外表面'},'塗裝範圍',{when:g=>g.paint}),
    underside:flag(false,'含平底下表面',{when:g=>g.paint}),
    primer:num(75,0,1000,'底漆膜厚 μm',{when:g=>g.paint}),
    middle:num(100,0,1000,'中塗膜厚 μm',{when:g=>g.paint}),
    finish:num(50,0,1000,'面漆膜厚 μm',{when:g=>g.paint}),
    solids:num(60,10,100,'體積固體份 %',{when:g=>g.paint}),
    loss:num(30,0,80,'塗裝損耗 %',{when:g=>g.paint}),
    pickling:flag(false,'酸洗鈍化（不鏽鋼）'),
    insulation:flag(false,'保溫'),
    insulationThickness:num(50,10,500,'保溫厚 mm',{when:g=>g.insulation}),
    insulationTop:flag(true,'頂部／上封頭也保溫',{when:g=>g.insulation}),
    insulationBottom:flag(false,'底部／下封頭也保溫',{when:g=>g.insulation}),
    claddingOverlap:num(50,0,300,'外包鋁皮搭接 mm',{when:g=>g.insulation}),
    insulationDensity:num(100,10,500,'保溫材密度 kg/m³',{when:g=>g.insulation}),
    supportPitch:num(3000,500,10000,'保溫支撐環間距 mm',{when:g=>g.insulation})
  }},
  erection:{label:'吊運安裝',fields:{
    method:pick('shop',{shop:'工廠整槽製作後運送',bottomup:'現場正裝法（由下往上）',jacking:'現場倒裝法（液壓頂升）',airlift:'現場倒裝法（充氣頂升）'},'製作安裝方式'),
    jackCapacity:num(10,1,500,'每台頂升機額定 t',{when:g=>g.method==='jacking'}),
    jackFactor:num(1.25,1,3,'頂升安全係數',{when:g=>g.method==='jacking'||g.method==='airlift'}),
    jackSpacing:num(3000,500,10000,'頂升機最大間距 mm',{when:g=>g.method==='jacking'}),
    transportWidth:num(3500,500,20000,'可運寬 mm',{when:g=>g.method==='shop',help:'依運輸商與路線確認'}),
    transportHeight:num(3500,500,20000,'可運高 mm',{when:g=>g.method==='shop'}),
    transportLength:num(12000,1000,60000,'可運長 mm',{when:g=>g.method==='shop'}),
    note:txt('','吊運備註')
  }}
});
export const METHOD_GROUPS=Object.freeze(Object.keys(METHOD_SPECS));
const fieldDefaults=fields=>Object.fromEntries(Object.entries(fields).map(([k,f])=>[k,f.default]));
export function methodDefaults(){const out={};for(const [group,spec] of Object.entries(METHOD_SPECS))out[group]=spec.list?[]:fieldDefaults(spec.fields);return out;}
export const methodItemDefaults=group=>fieldDefaults(METHOD_SPECS[group].item);
const coerce=(f,value)=>{
  if(f.type==='bool')return value===true||value==='true'||value===1||value==='1';
  if(f.type==='select')return String(value);
  if(f.type==='text')return String(value??'');
  return typeof value==='string'&&value.trim()===''?NaN:Number(value);
};
function checkFields(fields,raw,ctx,path,issues){
  const out={};
  for(const [key,f] of Object.entries(fields))out[key]=Object.hasOwn(raw??{},key)&&raw[key]!==undefined&&raw[key]!==null?coerce(f,raw[key]):f.default;
  for(const [key,f] of Object.entries(fields)){
    const active=!f.when||f.when(out,ctx);
    if(!active)continue;
    const value=out[key],field=path+'.'+key,before=issues.length;
    if(f.type==='number'){if(!Number.isFinite(value)||value<f.min||value>f.max)issues.push({field,message:`${f.label}需在 ${f.min}～${f.max} 之間。`});else if(f.integer&&!Number.isInteger(value))issues.push({field,message:`${f.label}需為整數。`});}
    else if(f.type==='select'&&!Object.hasOwn(f.options,value))issues.push({field,message:`${f.label}的選項無效。`});
    else if(f.type==='text'&&value.length>f.max)issues.push({field,message:`${f.label}需在 ${f.max} 字以內。`});
    // An invalid entry is reported and the default is used meanwhile, so the rest of the estimate stays visible.
    if(issues.length>before)out[key]=f.default;
  }
  return out;
}
/** Is a field shown/validated? `when(groupValues, tankContext)`. */
export function fieldActive(f,values,ctx){return !f.when||f.when(values,ctx);}
export function normalizeMethods(raw,ctx){
  const issues=[],out={};
  if(raw!==undefined&&raw!==null&&(typeof raw!=='object'||Array.isArray(raw)))return {methods:methodDefaults(),issues:[{field:'methods',message:'工法設定格式錯誤。'}]};
  for(const [group,spec] of Object.entries(METHOD_SPECS)){
    const value=raw?.[group];
    if(spec.list){
      const list=Array.isArray(value)?value:[];if(list.length>spec.max)issues.push({field:'methods.'+group,message:`${spec.label}最多 ${spec.max} 項。`});
      out[group]=list.slice(0,spec.max).map((item,i)=>({id:typeof item?.id==='string'&&/^[A-Z]{1,2}\d{1,3}$/.test(item.id)?item.id:'R'+(i+1),...checkFields(spec.item,item&&typeof item==='object'?item:{},ctx,`methods.${group}.${i}`,issues)}));
    }else out[group]=checkFields(spec.fields,value&&typeof value==='object'?value:{},ctx,'methods.'+group,issues);
  }
  return {methods:out,issues};
}
/** Context used by `when` rules (end types, orientation). */
export function methodContext(g){
  const open=['top','bottom'].filter(w=>g.endTypes[w]!=='open'),tMax=Math.max(Number(g.input?.shellThickness)||0,...open.map(w=>Number(g.ends?.[w]?.t)||0));
  return {endTypes:g.endTypes,ends:[g.endTypes.top,g.endTypes.bottom],orientation:g.orientation,tMax,code:g.input?.code??'unknown'};
}
/** PWHT required by thickness? true / false, or null when the WPS decides (other materials). ASME UCS-56 P-No.1 thresholds. */
export function pwhtRequired(heat,ctx){
  if(heat.material==='ss')return false;
  if(heat.material!=='p1')return null;
  if(ctx.code==='api650')return false;
  return ctx.tMax>38?true:ctx.tMax>32?heat.preheat<95:false;
}
export const pwhtPerformed=(heat,ctx)=>heat.pwht==='yes'||heat.pwht==='auto'&&pwhtRequired(heat,ctx)===true;
export function methodField(path){const [,group,a,b]=path.split('.');const spec=METHOD_SPECS[group];if(!spec)return null;return spec.list?spec.item[b]:spec.fields[a];}
