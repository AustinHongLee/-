import {SUPPORT_LAYOUT_DEFAULT} from './tank-support-layout.js';
// Source transcription, not a dimensional design. These use the same editable
// register as every other project; no case-specific mass multipliers.
export function v1102Fabrication(){
  const p=(id,name,kind,extra={})=>({id,name,kind,qty:1,material:'SA240-316L',density:8000,length:null,width:null,thickness:null,od:null,idiameter:null,eachKg:null,holeDiameter:0,holeCount:0,stockMode:'auto',trim:null,blankLength:null,blankWidth:null,spec:'',note:'',unit:'件',...extra});
  const w=(id,a,b,extra={})=>({id,name:'',a,b,kind:'fillet',qty:1,measure:'manual',length:null,diameter:null,size:null,process:'gtaw',wps:'',note:'依原圖詳圖／WPS 補焊長與尺寸。',...extra});
  const assemblies=[{id:'A1',name:'V-1102 支承對（兩組）',target:'support',qty:1,supportLayout:structuredClone(SUPPORT_LAYOUT_DEFAULT),note:'一份含 A／B 兩組，A端TL+275／825，中心距550。原圖端視：670底板、590支承跨距、480孔距、軸至底800；側視：140底板、110支承腳寬、兩側15。150是接地片高度，不是立板寬。9t板件分界及上緣輪廓尚需詳圖。',parts:[
    p('P1','A側圓孔底板','plate',{length:670,width:140,thickness:12,holeCount:2,holeDiameter:19,material:'SA36 / HDG',density:7850,note:'兩孔跨距480；沿軸向孔列偏置原圖未標，不預設置中鑽孔。'}),
    p('P2','9t鞍座上部／弧形板（拆件待核）','profile',{qty:2,thickness:9,material:'SA36 / HDG',density:7850,spec:'123°為鞍座接觸範圍；軸向寬、板件分界及成形／切割輪廓待核',note:'原圖mark3只註9t鞍座2SETS，未逐件詳圖；本列與P3為拆件工作項，不據此確認板片數。'}),
    p('P3','9t異形側板／腳板（拆件待核）','profile',{qty:4,width:110,thickness:9,material:'SA36 / HDG',density:7850,spec:'底部軸向寬110、t9；上寬、斜邊轉折、頂弧及590尺寸面待核',note:'只顯示已知下緣與待核包絡；不把圖形比例或接地片150當下料尺寸。未知面積、重量及毛坯不入已知合計。'}),
    p('P4','筒體補強／耐磨捲板','plate',{qty:2,length:830,width:250,thickness:5,weightBasis:'blank',note:'按先備板估重，成形修端後淨重待核；原圖830展開與142°分開保留；R中332.5時142°弧長824.057，差5.943待核，未認定為修邊或收縮；142°外弧830.253接近830，可能為外弧取整，原圖基準未註。'}),
    p('P5','固定螺栓及螺帽組','purchased',{qty:4,unit:'組',material:'SA325 / HDG',density:7850,spec:'原圖5/8″ SA325 H.D.G.；長度、螺帽與墊圈配置待確認'}),
    p('P6','B側長孔底板','plate',{length:670,width:140,thickness:12,holeCount:2,holeDiameter:19,slotLength:29,material:'SA36 / HDG',density:7850,note:'長孔沿槽軸向；兩孔跨距480，孔列軸向偏置未標。未把B側命名為已核定滑動支承。'})
  ],welds:[w('W1','P1','P3',{qty:2,measure:'perimeter',length:null,size:7,process:'inherit',aLocation:'A側底板上表面',bLocation:'兩腳下緣',note:'原圖7/7雙面角焊＋全周符號。每腳依110×9周界暫計238；端部收尾依核定詳圖。WPS未提供，不代表可放行。'}),w('W5','P6','P3',{qty:2,measure:'perimeter',length:null,size:7,process:'inherit',aLocation:'B側底板上表面',bLocation:'兩腳下緣',note:'同原圖底部7/7全周標示；238為110×9名目周界，不含起收弧修正。'}),w('W2','P3','P2',{qty:4,process:'inherit',note:'上部接合區可辨識；9t鞍座實際拆件、焊道範圍、焊腳及長度未標。'}),w('W3','P2','P4',{qty:2,process:'inherit',note:'鞍座／耐磨板接合區；原圖未指定連續、斷續或焊腳，不以123°弧長當焊長。'}),w('W4','P4','@shell',{qty:2,process:'inherit',note:'耐磨板／筒體周邊待核接合區；原圖未定焊道形式與範圍，不認定四邊連續焊。'})]},
  {id:'A2',name:'銘牌與支架',target:'accessory',qty:1,note:'尺寸依原圖銘牌支架詳圖；支架曲面展開及實際單重待填。',parts:[
    p('P1','銘牌','plate',{length:153,width:113,thickness:1.2,material:'SA240-304',density:7930}),
    p('P2','銘牌支架','profile',{thickness:3,spec:'支架寬 165、高 75；開孔與曲面展開待核',material:'',density:null})
  ],welds:[w('W1','P2','@shell')]},
  {id:'A3',name:'H1 盲蓋及提把附件',target:'cover:N12',qty:1,note:'僅列 H1 盲蓋附件，不重複既有管嘴法蘭、接管及補強板。吊桿細部另待圖說。',parts:[
    p('P1','12″ Class150 RF 盲法蘭','purchased',{material:'SA182-F316L',spec:'ASME／ANSI 12″ Class150 RF BLIND；實際厚度及單重待填'}),
    p('P2','盲蓋提把','round',{qty:2,od:16,material:'SA479-304',density:7930,note:'圖示跨距 150、高 65；彎曲半徑與中心線展開長未標，不以跨距代替棒長。'}),
    p('P3','H1 墊片','purchased',{spec:'12″ Class150 RF；材質、型式與壓縮厚度待填',material:'',density:null}),
    p('P4','H1 螺柱螺帽套件','purchased',{unit:'套',spec:'12″ Class150 配套；螺柱只數、尺寸、材質待確認',material:'',density:null}),
    p('P5','盲蓋吊桿／鉸接組','purchased',{unit:'組',spec:'H1 吊桿組；分件詳圖與單重待補',material:'',density:null})
  ],welds:[w('W1','P2','P1',{qty:4,note:'兩支提把各兩端；焊長及焊腳待 WPS／詳圖。'})]},
  {id:'A4',name:'SN1 備用口盲板附件',target:'accessory',qty:1,note:'原圖 SN2 已刪除，不列入本案。',parts:[
    p('P1','3″ Class150 RF 盲法蘭','purchased',{material:'SA182-F316L',spec:'ASME／ANSI 3″ Class150 RF BLIND；單重待填'}),
    p('P2','墊片','purchased',{material:'',density:null,spec:'3″ Class150 RF 墊片；型式及材質待填'}),
    p('P3','螺柱螺帽套件','purchased',{unit:'套',material:'',density:null,spec:'3″ Class150 配套；螺柱只數與尺寸待確認'})
  ],welds:[]},
  {id:'A5',name:'N3 防渦流器',target:'accessory',qty:1,note:'原圖組立跨距 150、高 100，3 片按 120°；不將組立跨距當作每片下料長。',parts:[
    p('P1','防渦流板','profile',{qty:3,thickness:6,spec:'6t 防渦流板；單片外形及下料尺寸待核'}),
    p('P2','支撐扁條','profile',{qty:3,thickness:6,width:19,spec:'FB19×6；單支展開長待填'})
  ],welds:[w('W1','P1','P2',{qty:3}),w('W2','P2','@shell',{qty:3})]},
  {id:'A6',name:'接地附件',target:'accessory',qty:1,note:'原圖 EARTHING 詳圖：50×50×6、Ø12。固定螺栓組記為一套，內含件數與表面處理待核。',parts:[
    p('P1','接地片','plate',{length:50,width:50,thickness:6,holeDiameter:12,holeCount:1,material:'',density:null}),
    p('P2','接地螺栓螺帽及墊片組','purchased',{unit:'套',spec:'原圖接地固定組；實際規格與單重待核',material:'',density:null})
  ],welds:[w('W1','P1','@shell')]}];
  for(const [index,target,mark,size,neck,pipeOD,t,dip] of [[7,'N1','N1','1 1/2',67,48.3,5.08,true],[8,'N2','N2','1',51,33.4,4.55,true],[9,'N4','N4','1 1/2',67,48.3,3.68,false],[10,'N6','SV1','1 1/2',67,48.3,3.68,false],[11,'N7','T1','1 1/2',67,48.3,3.68,false]]){
    const parts=[p('P1',mark+' 一體長頸法蘭','purchased',{material:'SA182-F316L',spec:`${size}″ Class150 RF LWN，頸 OD ${neck}；完整接件尺寸／單重待供應商確認`}),p('P2','接件支撐肋','profile',{qty:3,width:25,thickness:6,spec:'3-FB25×6；斜肋外形及展開長待核'})];
    const welds=[w('W1','P1','@shell'),w('W2','P2','P1',{qty:3}),w('W3','P2','@shell',{qty:3})];
    if(dip){parts.push(p('P3','浸入直管','pipe',{od:pipeOD,thickness:t,material:'SA312-TP316L',note:'755 為端面至底的組立總長；一體頸／轉接占長未拆，不能直接當直管下料長。'}),p('P4','內部過渡／轉接','profile',{spec:'依原圖 15°／75°、透氣孔與過渡詳圖分件；外形及單重待核'}));welds.push(w('W4','P1','P4',{kind:'butt'}),w('W5','P4','P3',{kind:'butt',measure:'circumference',diameter:pipeOD}));}
    assemblies.push({id:'A'+index,name:mark+' LWN 分件',target,qty:1,note:'取代此管嘴的管料／法蘭概算；管嘴位置與開孔仍由管嘴頁控制，補強板另計。',parts,welds});
  }
  for(const a of assemblies)for(const p of a.parts){if(p.kind==='profile'&&/FB\d/.test(p.spec))p.stockMode='purchase';else if(p.kind==='profile'&&p.thickness>0)p.stockMode='blank';}
  Object.assign(assemblies[0].parts.find(p=>p.id==='P4'),{stockMode:'blank',blankLength:830,blankWidth:250});
  return {version:1,assemblies};
}
