// Method catalog: one card per fabrication topic with a one-line conclusion, status, key numbers, cut list and notes.
// Normal results stay quiet; only issues, warnings and missing choices raise the status.
import {END_LABELS,FORMED_ENDS,equalAreaBlank,formingStrain} from './tank-heads.js';
import {PROCESS_LABELS} from './tank-method-config.js';
const fmt=(n,d=1)=>Number.isFinite(n)?n.toLocaleString('zh-TW',{maximumFractionDigits:d}):'—';
export const STAGES=Object.freeze([['cut','下料'],['form','成形'],['assemble','組立'],['weld','焊接'],['attach','附件'],['inspect','檢驗'],['surface','表面'],['ship','吊運']]);
const metric=(label,value,unit='',extra={})=>({label,value,unit,...extra});
function endCard(r,which){
  const end=r.ends[which],type=end.type,horizontal=r.orientation==='horizontal',layout=r.layouts?.[which],where=horizontal?(which==='bottom'?'A 端':'B 端'):which==='bottom'?'底部':'頂部';
  if(type==='open')return null;
  const card={id:which,stages:['cut','form','assemble'],groups:['layout'],fieldScope:which,warnings:[],metrics:[],bom:[],notes:[]};
  const parts=r.parts.filter(part=>part.ends?.includes(which)||part.id.startsWith(which==='bottom'?'B':'T')&&!part.ends);
  const weight=parts.reduce((s,part)=>s+part.netWeight/(part.ends?.length||1),0);
  card.metrics.push(metric('估重',fmt(weight,0),'kg',{quiet:true}));
  if(type==='flat'){
    const fd=r.od+2*r.input.overhang;card.title=horizontal?where+'平板':which==='bottom'?'平底板':'平蓋';card.glyph='flat';
    if(!layout){card.summary=`整片圓板 Ø${fmt(fd,0)} × t${fmt(end.t)}`;card.visual='flat';card.metrics.unshift(metric('成品直徑',fmt(fd,0),'mm'),metric('下料直徑',fmt(fd+2*r.input.trim,0),'mm'));
      const fits=fd+2*r.input.trim<=Math.min(r.input.stockWidth,r.input.stockLength);if(!fits)card.warnings.push({level:'error',text:`Ø${fmt(fd+2*r.input.trim,0)} 放不進原板，改用拼板`,action:'splice'});}
    else if(layout.method==='strips'){card.summary=`${layout.plates.length} 片拼接（整板 ${layout.full}、異形 ${layout.sketch}）`;card.visual='splice';card.metrics.unshift(metric('拼板片數',String(layout.plates.length),'片'),metric('焊縫',fmt(layout.weldLength/1000,1),'m'));}
    else{card.summary=`環形邊板 ${layout.ring.pieces.length} 片＋中幅板 ${layout.centre.plates.length} 片`;card.visual='splice';card.metrics.unshift(metric('環形邊板',String(layout.ring.pieces.length),'片'),metric('中幅板',String(layout.centre.plates.length),'片'));}
    const splice=layout?.method==='annular'?layout.centre:layout;
    // API 650: three-plate laps ≥ 300 mm from the shell (strip bottoms: shell inside face) or from the annular-ring joint (annular bottoms).
    if(splice?.junctions?.length&&r.input.code==='api650'){const close=splice.junctions.filter(j=>(layout.method==='annular'?j.edge:r.di/2-Math.hypot(j.x,j.y))<300).length;if(close)card.warnings.push({level:'warn',text:`${close} 個三板交會點距${layout.method==='annular'?'環形邊板接縫':'筒身'} < 300 mm（API 650），請調整拼板起點或改環形邊板`});}
    if(layout?.method==='annular'&&r.input.code==='api650'){const clear=r.di/2-layout.innerRadius-(layout.centre.joint==='lap'?layout.centre.lap:0);if(clear<600)card.warnings.push({level:'warn',text:`筒內到中幅板接縫只有 ${fmt(clear,0)} mm（API 650 需 ≥ 600 mm）；加大環形邊板伸入量`,field:'methods.layout.annularWidth'});}
    if(splice&&splice.minJunctionSpacing!==null&&splice.minJunctionSpacing<300)card.warnings.push({level:'warn',text:`三板交會點彼此最近 ${fmt(splice.minJunctionSpacing,0)} mm（< 300 mm）`});
    card.notes.push('拼板以條板平行排列、相鄰列錯開半張；外圈異形板沿圓弧切割。搭接面朝上下依圖說，底板坡度由基礎成形。');
    return card;
  }
  if(type==='cone'){
    const dev=end.development,strain=formingStrain(end.t,end.minRadius,'single');
    card.title=horizontal?where+'錐體':which==='bottom'?'錐底':'錐頂';card.glyph='cone';card.visual='cone';card.stages=['cut','form','assemble','weld'];
    card.summary=`${layout.pieces.length} 片扇形板 · ${fmt(end.angle,1)}° · 展開 R${fmt(dev.rhoOut,0)}`;
    card.metrics.unshift(metric('展開外半徑',fmt(dev.rhoOut,1),'mm'),metric('展開角',fmt(dev.theta,2),'°'),metric('深度',fmt(end.depth,0),'mm'));
    if(strain!==null){card.metrics.push(metric('小端成形率',fmt(strain,2),'%',{alert:strain>5}));if(strain>5)card.warnings.push({level:'warn',text:`錐體小端成形率 ${fmt(strain,1)}% > 5%，依材料與規範確認是否需熱處理或熱捲`});}
    if(end.angle<9.5&&which==='top'&&r.orientation==='vertical')card.notes.push('自支撐錐頂常用斜度約 9.5°～37°（API 650）；低於此值多為有支撐的錐頂，需另設樑架。');
    card.notes.push('錐板以中面展開；捲錐需錐捲機或分段壓製，小端板邊注意捲板機最小捲徑。');
    return card;
  }
  if(type==='dome'||layout?.method==='petal'){
    const strain=formingStrain(end.t,end.minRadius,'double');
    card.title=type==='dome'?'拱頂':horizontal?where+'半球封頭':which==='bottom'?'下半球封頭':'上半球封頭';card.glyph=type;card.visual='petal';card.stages=['cut','form','assemble','weld'];
    card.summary=layout.single?`整片壓製 Ø${fmt(layout.crownDiameter,0)}`:`中心板 Ø${fmt(layout.crownDiameter,0)}＋${layout.bands.map(b=>b.petals).join('＋')} 片瓜瓣`;
    card.metrics.unshift(metric('球半徑',fmt(end.sphere.radius,0),'mm'),metric('深度',fmt(end.depth,0),'mm'));
    if(strain!==null)card.metrics.push(metric('成形率',fmt(strain,2),'%',{alert:strain>5}));
    if(type==='dome'&&(end.domeRadius<.8*r.di-1e-6||end.domeRadius>1.2*r.di+1e-6)&&r.input.code==='api650')card.warnings.push({level:'warn',text:'自支撐拱頂半徑常用 0.8～1.2 D（API 650），目前超出範圍'});
    return card;
  }
  // Formed heads (purchased or supplier blank).
  const label=END_LABELS[type],blank=equalAreaBlank(end),strain=formingStrain(end.t,end.minRadius,'double');
  card.title=horizontal?`${where}${label}封頭`:`${which==='bottom'?'下':'上'}${label}封頭`;card.glyph=type;card.visual='formed';card.stages=['assemble','weld'];
  card.summary=r.input.headBlank>0?`毛坯 Ø${fmt(r.input.headBlank,0)}（供應商）`:`外購成形 · 深 ${fmt(end.depth,0)} mm`;
  card.metrics.unshift(metric('內深',fmt(end.depth,1),'mm'),metric('直邊',fmt(end.straight,0),'mm'),metric('等面積毛坯',fmt(blank,0),'mm',{quiet:true}));
  if(strain!==null)card.metrics.push(metric('成形率',fmt(strain,2),'%',{alert:strain>5}));
  if(strain>5)card.notes.push(`封頭成形率約 ${fmt(strain,1)}%（UG-79 雙曲率式，轉角處最大）；超過 5% 時依 UCS-79 等條件判定成形後熱處理。`);
  if(type==='torispherical'&&end.knuckle<3*end.t)card.warnings.push({level:'warn',text:`轉角半徑 ${fmt(end.knuckle,1)} mm 小於 3 倍板厚（ASME UG-32 限制）`});
  if(type==='torispherical'&&end.crown>r.di+2*end.t+1e-6)card.warnings.push({level:'warn',text:'冠部半徑大於封頭外徑（ASME UG-32 限制）'});
  card.notes.push(`等面積法毛坯 Ø${fmt(blank,0)} mm 只作採購參考；實際毛坯依封頭廠（成形減薄與修邊）。`);
  card.blank=blank;
  return card;
}
export function methodCatalog(r){
  if(!r?.valid)return [];
  const cards=[],att=r.attachments,pr=r.process,m=r.methods,p=r.input;
  // Shell rolling.
  const s=r.parts[0],strain=formingStrain(p.shellThickness,r.meanDiameter/2,'single'),shell={id:'shell',title:'筒身捲板',glyph:'shell',stages:['cut','form','assemble','weld'],groups:['rolling'],staticFields:'shell',visual:'rolling',warnings:[],notes:[],bom:[]};
  shell.summary=`${r.courses} 圈 × ${r.panelsPerCourse} 片 · 下料 ${fmt(s.width,0)} × ${fmt(s.height,0)}`;
  shell.metrics=[metric('中面周長',fmt(r.circumference,1),'mm'),metric('每片成品',`${fmt(s.finishedWidth,0)} × ${fmt(s.finishedHeight,0)}`,'mm'),metric('成形率',fmt(strain,2),'%',{alert:strain>5})];
  const rollWidth=s.height,mr=m.rolling;
  if(mr.machineWidth>0&&rollWidth>mr.machineWidth)shell.warnings.push({level:'warn',text:`板寬 ${fmt(rollWidth,0)} mm 超過捲板機有效寬 ${fmt(mr.machineWidth,0)} mm${p.shellLayout==='upright'?'（直立分片需長輥）':''}`});
  if(mr.machineThickness>0&&p.shellThickness>mr.machineThickness)shell.warnings.push({level:'warn',text:`板厚 ${p.shellThickness} mm 超過捲板機能力 ${mr.machineThickness} mm`});
  if(mr.machineMinDiameter>0&&r.di<mr.machineMinDiameter)shell.warnings.push({level:'warn',text:`內徑 ${fmt(r.di,0)} mm 小於捲板機最小捲徑 ${fmt(mr.machineMinDiameter,0)} mm`});
  if(strain>5)shell.warnings.push({level:'warn',text:`筒身成形率 ${fmt(strain,1)}% > 5%，依材料與規範確認熱處理條件（ASME UCS-79）`});
  shell.notes.push('成形率依 ASME UG-79 單曲率式 50t/Rf（平板起捲）；超過 5% 時依 UCS-79(d) 條件判定是否需成形後熱處理。','捲板中面周長 π ×（內徑＋板厚）；預彎、夾持與焊接收縮依機台與 WPS 確認。');
  cards.push(shell);
  for(const which of r.orientation==='horizontal'?['bottom','top']:['top','bottom']){const card=endCard(r,which);if(card)cards.push(card);}
  // Openings: pads and manholes from the nozzle plan.
  const np=r.nozzlePlan;
  if(np?.items.length){const pads=att.pads.items,man=att.manholes.items,warn=np.items.flatMap(n=>n.warnings.filter(w=>/補強板/.test(w)).map(w=>({level:'warn',text:`${n.id}：${w}`})));
    cards.push({id:'openings',title:'開孔補強／人孔',glyph:'opening',stages:['cut','form','assemble','weld'],visual:'pad',summary:`${np.items.length} 個開孔 · 補強板 ${pads.length} · 人孔 ${man.length}`,metrics:[metric('補強板',String(pads.length),'片'),metric('補強板重',fmt(att.pads.weight,1),'kg',{quiet:true}),metric('人孔蓋',fmt(att.manholes.weight,1),'kg',{quiet:true})],warnings:warn,bom:att.bom.filter(b=>/^補強板|^人孔蓋/.test(b.name)),notes:['補強板外徑與厚度在「管嘴／法蘭」逐一設定；是否需要補強依開孔補強計算（ASME UG-37／API 650 5.7）。','補強板沿筒身中面展開下料後捲至筒身半徑；試漏孔於試驗後依圖說處理。']});}
  const optional=(id,title,glyph,group,plan,{stages=['cut','assemble','weld','attach'],visual=id,on,summary,extra={}}={})=>{
    const issues=(plan?.issues??[]).map(x=>({level:'error',text:x.message,field:x.field})),warnings=(plan?.warnings??[]).map(text=>({level:'warn',text}));
    cards.push({id,title,glyph,stages,groups:[group],visual,optional:true,active:on,summary:on?(summary??plan?.summary??''):'未加入',metrics:[],warnings:on?[...issues,...warnings]:issues,bom:on?(plan?.bom??[]):[],notes:on?[...(plan?.notes??[])]:[],...extra});
  };
  const sup=att.supports;
  optional('supports','支撐','support','supports',sup,{on:sup.type!=='none',extra:sup.loads?{metrics:[metric({saddles:'每座操作',skirt:'裙座總承載',legs:'每支操作',lugs:'每只操作',anchors:'每組操作'}[sup.type]??'每處操作',fmt(sup.loads.operating,1),'kN'),metric('試水',fmt(sup.loads.test,1),'kN',{quiet:true})]}:{}});
  if(sup.type==='none'&&sup.warnings.length)cards[cards.length-1].warnings.push(...sup.warnings.map(text=>({level:'warn',text,action:'supports'})));
  optional('rings','加強圈','ring','rings',att.rings,{on:att.rings.items.length>0,summary:att.rings.items.map(x=>x.id+' '+x.spec).join('、'),visual:'rings'});
  optional('access','梯台','ladder','access',att.access,{on:att.access.summary!=='未加梯台',visual:'access'});
  optional('jacket','夾套／盤管','jacket','jacket',att.jacket,{on:att.jacket.type!=='none'});
  optional('internals','內件（擋板）','baffle','internals',att.internals,{on:!!m.internals.baffles});
  optional('lifting','吊耳','lift','lifting',att.lifting,{stages:['cut','weld','ship'],on:!!m.lifting.enabled,extra:att.lifting.loads?{metrics:[metric('每只垂直',fmt(att.lifting.loads.vertical,1),'kN'),metric('吊索',fmt(att.lifting.loads.sling,1),'kN')]}:{}});
  optional('misc','銘牌／接地／集水坑','misc','misc',att.misc,{stages:['cut','weld','attach'],on:!!att.misc?.active,extra:att.misc?.geometry?.sump?{metrics:[metric('集水坑容積',fmt(att.misc.geometry.sump.volume*1000,0),'L')]}:{}});
  if(pr){
    const w=pr.weld,cut=pr.cutting,heat=pr.heat;
    cards.push({id:'cutting',title:'切割與坡口',glyph:'cut',stages:['cut','weld'],groups:['cutting'],visual:'cutting',summary:`切割 ${fmt(cut.total/1000,1)} m · 穿孔 ${cut.pierces} 次${cut.bevelLength>0?` · 坡口邊 ${fmt(cut.bevelLength/1000,1)} m`:' · 免開坡口'}`,
      metrics:[metric('切割長度',fmt(cut.total/1000,1),'m'),metric('穿孔／起割',String(cut.pierces),'次'),metric('坡口邊',fmt(cut.bevelLength/1000,1),'m'),...(cut.cutHours!==undefined?[metric('切割工時',fmt(cut.cutHours,1),'h')]:[]),...(cut.bevelHours!==undefined?[metric('坡口工時',fmt(cut.bevelHours,1),'h')]:[]),metric('型鋼／管鋸切',String(cut.bars+cut.pipeEnds),'刀',{quiet:true})],
      warnings:(cut.warnings??[]).map(text=>({level:'error',text,field:'methods.cutting.method'})),bom:[],notes:cut.notes});
    cards.push({id:'welding',title:'焊接',glyph:'weld',stages:['weld','inspect'],groups:['welding'],visual:'welding',summary:`${fmt(w.totals.length/1000,1)} m · 焊材約 ${fmt(w.totals.consumable,0)} kg`,metrics:[metric('焊縫總長',fmt(w.totals.length/1000,1),'m'),metric('熔敷金屬',fmt(w.totals.metal,1),'kg'),metric('焊材',fmt(w.totals.consumable,1),'kg'),metric('坡口型式',String(w.grooves.length),'種',{quiet:true})],warnings:[],bom:w.byProcess.map(x=>({name:x.label,spec:`熔敷 ${fmt(x.metal,1)} kg`,qty:1,unit:'批',each:x.consumable,weight:x.consumable})),
      notes:['焊材 = 熔敷金屬 ÷ 焊材效率（廠商指南常見值：SMAW 約 60–65%、GMAW 約 92–98%、FCAW 約 80–90%、SAW 約 99%）。',w.flux?`SAW 焊劑約 ${fmt(w.flux,0)} kg（約 1 kg／kg 熔敷，依電壓與回收）。`:'','坡口依板厚自動選 I／單邊 V／X 形，可在下方改門檻；正式坡口依 WPS。'].filter(Boolean)});
    const hc=heat.cycle,heatCard={id:'heat',title:'預熱／焊後熱處理',glyph:'heat',stages:['weld','inspect'],groups:['heat'],visual:'heat',warnings:heat.warnings.map(text=>({level:'warn',text})),bom:[],notes:[heat.reason,...heat.notes]};
    heatCard.summary=heat.perform?`PWHT ${fmt(hc.hold,0)} °C × ${fmt(hc.holdHours*60,0)} 分 · ${{furnace:'整體入爐',sections:'分段入爐',local:'局部加熱'}[m.heat.method]}`:heat.need===false?`不需 PWHT · 最厚板 ${fmt(heat.t)} mm`:'依 WPS 判定';
    heatCard.metrics=[...(hc?[metric('最厚板',fmt(heat.t),'mm'),metric('持溫',fmt(hc.holdHours*60,0),'min'),metric('升溫上限',fmt(hc.heatRate,0),'°C/h'),metric('降溫上限',fmt(hc.coolRate,0),'°C/h'),metric('425 °C 以上',fmt(hc.controlled,1),'h',{quiet:true})]:[]),...(m.heat.preheat>0?[metric('預熱',fmt(m.heat.preheat,0),'°C')]:[])];
    if(heat.furnace?.given&&heat.furnace.heats>1)heatCard.metrics.push(metric('入爐次數',String(heat.furnace.heats),'次'));
    if(m.heat.material==='other'&&m.heat.pwht==='auto')heatCard.warnings.push({level:'info',text:'其他材質：請依 WPS 決定是否 PWHT，再把「焊後熱處理」改為要做或不做'});
    cards.push(heatCard);
    const t=pr.test,tol=pr.tolerances,nde=w.nde,inspect={id:'inspection',title:'檢驗試驗',glyph:'inspect',stages:['inspect'],groups:['inspection'],visual:'inspection',warnings:[],bom:[],notes:[...nde.notes,...t.notes]};
    inspect.summary=[t.hydro?`盛水 ${fmt(t.water,1)} m³`:'',nde.spots?`RT ${nde.spots} 處`:nde.rtLength?`RT ${fmt(nde.rtLength/1000,1)} m`:'',t.vacuumCount?`真空箱 ${t.vacuumCount} 次`:''].filter(Boolean).join(' · ')||'記錄量測方法';
    inspect.metrics=[metric('公差依據',tol.basisLabel,''),metric('射線檢驗',nde.modeLabel,''),...(t.hydro?[metric('試水',fmt(t.waterMass/1000,1),'t'),metric('灌水',fmt(t.fillHours,1),'h',{quiet:true})]:[])];
    if(p.code==='unknown')inspect.warnings.push({level:'info',text:'尚未指定規範：公差與射線檢驗只列量測方法',action:'codes'});
    cards.push(inspect);
    const sf=pr.surface;
    cards.push({id:'surface',title:'表面處理／保溫',glyph:'paint',stages:['surface'],groups:['surface'],visual:'surface',summary:[sf.paint?`塗裝 ${fmt(sf.paint.area,0)} m² · ${fmt(sf.paint.liters,0)} L`:'',sf.insulation?`保溫 ${fmt(sf.insulation.volume,1)} m³`:'',sf.pickling?`酸洗 ${fmt(sf.pickling.area,0)} m²`:''].filter(Boolean).join(' · ')||`外表面 ${fmt(sf.outside,0)} m²（未選塗裝）`,metrics:[metric('外表面',fmt(sf.outside,1),'m²'),metric('內表面',fmt(sf.inside,1),'m²')],warnings:[],bom:[],notes:sf.notes});
    cards.push({id:'level',title:'液位容積',glyph:'level',stages:['inspect'],groups:[],visual:'level',summary:`使用 ${fmt(p.fill)}% → 液位 ${fmt(pr.strapping.working.level,0)} mm`,metrics:[],warnings:[],bom:[],notes:['液位由槽內最低點（臥式為筒底）起算，含端部容積；未扣內件與內凸管嘴。']});
    const er=pr.erection,cg=pr.cg;
    cards.push({id:'erection',title:'吊運安裝',glyph:'ship',stages:['ship'],groups:['erection'],visual:'erection',summary:er.method==='shop'?`空重 ${fmt(er.envelope.weight/1000,2)} t · ${er.transport?.fits?'可整槽運送':'超出可運尺寸'}`:er.jacks?`倒裝 · 頂升機 ${er.jacks.count} 台`:er.air?`充氣頂升 ${fmt(er.air.pressure,2)} kPa`:'正裝法逐圈吊裝',
      metrics:[metric('空槽重',fmt(er.envelope.weight/1000,2),'t'),metric('重心',fmt(cg.empty.y,0),'mm',{note:cg.axis}),metric('最重單片',fmt(er.maxPiece,0),'kg',{quiet:true})],warnings:er.warnings.map(text=>({level:'warn',text})),bom:[],notes:[`重心${cg.axis} ${fmt(cg.empty.y,0)} mm（空槽）／${fmt(cg.operating.y,0)} mm（操作）。`,er.notes??''].filter(Boolean)});
  }
  for(const card of cards){card.status=card.warnings.some(w=>w.level==='error')?'error':card.warnings.some(w=>w.level==='warn')?'warn':card.optional&&!card.active?'off':'ok';}
  return cards;
}
/** Overview strip: one number per fabrication stage. */
export function stageSummary(r,cards){
  if(!r?.valid)return [];
  const all=[...r.parts,...(r.attachmentParts??[])],pieces=all.reduce((s,p)=>s+(p.kind==='formed'?0:p.quantity),0)+(r.nozzlePlan?.items.length??0),pr=r.process,att=r.attachments;
  const formed=r.courses*r.panelsPerCourse+all.filter(p=>['sector','petal'].includes(p.kind)).reduce((s,p)=>s+p.quantity,0)+(att?.rings.items.length??0)+(att?.pads.items.filter(x=>x.rollRadius).length??0);
  const attached=cards.filter(c=>c.optional&&c.active).length,issues=id=>cards.filter(c=>c.stages.includes(id)&&['warn','error'].includes(c.status)).length;
  const value={cut:`${pieces} 件`,form:`${formed} 件`,assemble:`${r.courses} 圈＋端部`,weld:pr?`${fmt(pr.weld.totals.length/1000,0)} m`:'—',attach:attached?`${attached} 項`:'未加',inspect:pr?(pr.weld.nde.spots?`RT ${pr.weld.nde.spots}`:pr.test.hydro?'盛水':'量測'):'—',surface:pr?.surface.paint?`${fmt(pr.surface.paint.area,0)} m²`:'未選',ship:`${fmt((r.emptyWeight??r.netWeight)/1000,2)} t`};
  return STAGES.map(([id,label])=>({id,label,value:value[id],issues:issues(id)}));
}
export {PROCESS_LABELS};
