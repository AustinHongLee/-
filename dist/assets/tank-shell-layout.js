// Actual shell courses and rectangular developed plates. All coordinates stay
// on the plate mid-surface; nozzle working distances are measured outside.
export const mod=(v,p)=>((v%p)+p)%p;
const close=(a,b)=>Math.abs(a-b)<=.02;
export function normalizeShellLayout(raw){
  if(raw===undefined||raw===null)return {data:null,valid:true,issues:[]};
  const fail=message=>({data:null,valid:false,issues:[{field:'shellLayoutPlan',message}]});
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.version!==1||Object.keys(raw).some(k=>!['version','referenceStart','courses','rules'].includes(k))||!Array.isArray(raw.courses)||!raw.courses.length||raw.courses.length>200)return fail('筒身分圈／分片配置格式錯誤。');
  const numeric=(v,lo,hi)=>['string','number'].includes(typeof v)&&String(v).trim()!==''&&Number.isFinite(Number(v))&&Number(v)>=lo&&Number(v)<=hi;
  if(!numeric(raw.referenceStart,0,360))return fail('自訂配置的起縫基準角無效。');
  let count=0;const courses=[];
  for(const c of raw.courses){
    if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).some(k=>!['height','startAngle','lengths'].includes(k))||!numeric(c.height,.01,100000)||!numeric(c.startAngle,0,360)||!Array.isArray(c.lengths)||!c.lengths.length||c.lengths.some(v=>!numeric(v,.01,400000)))return fail('每圈需有有效板高、起點角及各片成品弧長。');
    count+=c.lengths.length;if(count>10000)return fail('筒身最多 10,000 片，請分批規劃。');
    courses.push({height:Number(c.height),startAngle:Number(c.startAngle),lengths:c.lengths.map(Number)});
  }
  if(raw.rules!==undefined&&(!raw.rules||typeof raw.rules!=='object'||Array.isArray(raw.rules)))return fail('搜尋條件格式錯誤。');
  const rules={minimumPlateEdge:0,minimumStagger:0,...raw.rules};
  if(!rules||Object.keys(rules).some(k=>!['minimumPlateEdge','minimumStagger'].includes(k))||Object.values(rules).some(v=>!numeric(v,0,10000)))return fail('搜尋用最小板邊／錯縫距離需在 0～10,000 mm。');
  return {valid:true,issues:[],data:{version:1,referenceStart:Number(raw.referenceStart),courses,rules:Object.fromEntries(Object.entries(rules).map(([k,v])=>[k,Number(v)]))}};
}
export function buildShellLayout({input:p,bodyHeight,circumference,maxHeight,maxLength}){
  const parsed=normalizeShellLayout(p.shellLayoutPlan),C=circumference,g=p.gap;
  const count=Math.ceil((bodyHeight+g)/(maxHeight+g)),n=Math.ceil(C/(maxLength+g)),height=(bodyHeight-(count-1)*g)/count,len=(C-n*g)/n;
  if(count>200||count*n>10000||height<=0||len<=0)return {fatal:true,issues:[{field:'stockWidth',message:'分片過多或接合間隙超過可用板料，請換板型／尺寸。'}]};
  const auto=Array.from({length:count},(_,i)=>({height,startAngle:mod(Number(p.seamStart)+(p.seamLayout==='stagger'&&i%2?180/n:0),360),lengths:Array(n).fill(len)}));
  let courses=parsed.data?.courses,issues=[...parsed.issues],closed=parsed.valid;
  if(courses){
    if(!close(courses.reduce((s,c)=>s+c.height,0)+(courses.length-1)*g,bodyHeight)){closed=false;issues.push({field:'shellLayoutPlan',message:'原分圈高度已不符合目前筒身長度／間隙，請重新找配置或回等高分圈。'});}
    for(const [i,c] of courses.entries()){
      if(!close(c.lengths.reduce((s,l)=>s+l,0)+c.lengths.length*g,C)){closed=false;issues.push({field:'shellLayoutPlan',message:`第 ${i+1} 圈的分片已無法閉合目前圓周，請重新找配置。`});}
      if(c.height>maxHeight+1e-6||c.lengths.some(l=>l>maxLength+1e-6))issues.push({field:'shellLayoutPlan',message:`第 ${i+1} 圈含放不進目前原板／預彎留料的毛坯，請換板或重新找配置。`});
      if(c.height<parsed.data.rules.minimumPlateEdge-1e-6||c.lengths.some(l=>l<parsed.data.rules.minimumPlateEdge-1e-6))issues.push({field:'shellLayoutPlan',message:`第 ${i+1} 圈小於本案設定的最小成品板邊，請重新找配置。`});
    }
    const centers=c=>{let x=c.startAngle/360*C-g/2;return c.lengths.map(l=>{const v=mod(x,C);x+=l+g;return v;});};
    for(let i=1;i<courses.length;i++)if(centers(courses[i]).some(a=>centers(courses[i-1]).some(b=>Math.min(mod(a-b,C),mod(b-a,C))*(C+Math.PI*Number(p.shellThickness))/C<parsed.data.rules.minimumStagger-1e-5)))issues.push({field:'shellLayoutPlan',message:`第 ${i}／${i+1} 圈的縱縫錯開小於本案設定，請重新找配置。`});
  }
  // A closed but oversized/too-close manual layout stays visible for repair.
  // Falling back here would hide the very seam the operator is moving.
  const custom=Boolean(courses&&closed);if(!custom)courses=auto;
  const delta=custom?Number(p.seamStart)-parsed.data.referenceStart:0,rows=[],assembly=[];let z=0;
  for(const [i,c] of courses.entries()){
    const startAngle=mod(c.startAngle+delta,360),pieces=[];let arc=0;
    for(const [j,length] of c.lengths.entries()){
      const b={id:'S'+(assembly.length+1),course:i+1,panel:j+1,z,height:c.height,start:mod(startAngle/360*C+arc,C),length,offset:mod(startAngle-Number(p.seamStart),360)/360*C,angle:startAngle};
      pieces.push(b);assembly.push(b);arc+=length+g;
    }
    rows.push({course:i+1,z,height:c.height,startAngle,pieces});z+=c.height+g;
  }
  const invalidPieces=[],badSeams=new Set(),pieceIssues=[];
  if(custom){const rules=parsed.data.rules;for(const row of rows)for(const b of row.pieces){
    const reasons=[];if(b.height>maxHeight+1e-6||b.length>maxLength+1e-6)reasons.push('毛坯超出目前板向可用原板');
    if(b.height<rules.minimumPlateEdge-1e-6||b.length<rules.minimumPlateEdge-1e-6)reasons.push('小於最小成品板邊');
    if(reasons.length){invalidPieces.push(b.id);pieceIssues.push({id:b.id,reasons});badSeams.add(`L${b.course}-${b.panel}`);badSeams.add(`L${b.course}-${b.panel%row.pieces.length+1}`);if(b.course>1)badSeams.add('C'+(b.course-1));if(b.course<rows.length)badSeams.add('C'+b.course);}
  }
  const physical=(C+Math.PI*Number(p.shellThickness))/C;for(let i=1;i<rows.length;i++)for(const a of rows[i].pieces)for(const b of rows[i-1].pieces)if(Math.min(mod(a.start-b.start,C),mod(b.start-a.start,C))*physical<rules.minimumStagger-1e-5){badSeams.add(`L${a.course}-${a.panel}`);badSeams.add(`L${b.course}-${b.panel}`);}}
  return {valid:!issues.length,issues,custom,closed,invalidPieces,badSeams:[...badSeams],pieceIssues,data:parsed.data,rows,assembly,courses:rows.length,panelsPerCourse:Math.max(...rows.map(c=>c.pieces.length)),courseHeight:rows.reduce((s,c)=>s+c.height,0)/rows.length,panelLength:assembly.reduce((s,b)=>s+b.length,0)/assembly.length,maxHeight,maxLength};
}
export function shellCourses(r){
  if(r.courseRows)return r.courseRows;
  const groups=new Map();for(const p of r.assembly??[]){if(!groups.has(p.course))groups.set(p.course,{course:p.course,z:p.z,height:p.height,startAngle:p.angle,pieces:[]});groups.get(p.course).pieces.push(p);}return [...groups.values()];
}
export function shellCourseAt(r,z){const rows=shellCourses(r);return rows.find(c=>z>=c.z-1e-7&&z<=c.z+c.height+1e-7)??rows.reduce((a,b)=>Math.abs(b.z+b.height/2-z)<Math.abs(a.z+a.height/2-z)?b:a,rows[0]);}
export const shellRingStations=r=>shellCourses(r).slice(1).map(c=>({course:c.course-1,z:c.z-r.input.gap/2}));
export const shellBatchLabel=r=>{const counts=shellCourses(r).map(c=>c.pieces.length);return `${r.courses} 圈 · ${new Set(counts).size===1?'每圈 '+counts[0]+' 片':'各圈 '+counts.join('／')+' 片'}`;};
export const shellUniform=r=>r.assembly.every(b=>Math.abs(b.length-r.assembly[0].length)<1e-6&&Math.abs(b.height-r.assembly[0].height)<1e-6);
export function shellPiecePart(r,id){const part=r.parts.find(p=>p.id==='S'),b=r.assembly.find(b=>b.id===id)??r.assembly[0];return {...part,width:b.length+2*r.input.trim+2*(part.flatEnd||0),height:b.height+2*r.input.trim,finishedWidth:b.length,finishedHeight:b.height};}
