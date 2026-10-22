import {inputSceneData} from './offset-input-model.js';
import {uiIcon} from './offset-ui-icons.js';

export function mountInputScene({onSelect,onViewChange}){
 const $=id=>document.getElementById(id),shell=$('port-model-shell'),host=$('port-model'),sketch=$('port-sketch');
 let viewer=null,pending=null,failed=false,mode='3d',current=null,data=null,signature='',view='iso',requestedView=null;
 const buttons=[...document.querySelectorAll('[data-input-scene-mode]')];
 const motion=[...document.querySelectorAll('[data-input-motion]')];
 for(const b of motion)b.innerHTML=uiIcon({in:'plus',out:'minus',fit:'reset'}[b.dataset.inputMotion])+(b.dataset.inputMotion==='fit'?'<span>置中</span>':'');
 function freeView(){view=null;onViewChange?.(null);}
 function sync(){
  const live=Boolean(mode==='3d'&&viewer&&data&&!failed),needed=mode==='3d'&&Boolean(data)&&!failed;
  shell.hidden=!live;sketch.hidden=live;$('port-model-tools').hidden=!live;
  buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.inputSceneMode===(mode==='diagram'?'diagram':'3d'))));
  $('port-model-status').hidden=mode==='diagram'||live;
  $('port-model-status').textContent=failed?'3D 暫時無法啟用，先顯示尺寸圖；可按「互動 3D」重試。':!data?'尺寸、管徑或朝向尚未填完整，先顯示尺寸圖。':'正在載入互動 3D…';
  viewer?.setActive(live&&current?.active&&!document.hidden);
  if(needed&&!viewer&&!pending)start();
  if(live){
   const next=JSON.stringify([data.ports,data.axes,data.od,data.dimensions,current.task,current.joint,current.port,data.route?.elements,data.route?.joints]);
   if(signature!==next){try{viewer.updateInput(data,current);signature=next;}catch{failed=true;sync();return;}}
   if(requestedView){viewer.fit(requestedView);requestedView=null;}
   $('port-model-caption').textContent=data.route?(data.route.original?'原接法':data.route.id)+' · '+data.route.jointCount+' 處接合':'管口位置 · 尚無可行接法';
  }
  $('port-scene-hint').textContent=live?'拖曳旋轉 · 滾輪／雙指縮放 · 點管口、尺寸或焊口標籤修改。方向鍵可轉視角，F 鍵置中。':current?.task==='position'?'點尺寸精確輸入 · 點 A／B 選朝向 · 拖 B 粗調位置':current?.task==='stock'?'此圖看組立位置，原件量測與切角基準見供料圖。':'點圖上焊口修改預留；編號與加工單一致。';
  if(live)onViewChange?.(view);
 }
 async function start(){
  pending=(async()=>{
   try{const {OffsetInputViewer}=await import('./offset-input-viewer.js');viewer=new OffsetInputViewer(host,{onSelect,onOrbit:freeView,onPreset:next=>{view=next;onViewChange?.(view);},onFailure:()=>{failed=true;sync();}});}
   catch{failed=true;host.replaceChildren();}
   finally{pending=null;sync();}
  })();
 }
 for(const b of buttons)b.addEventListener('click',()=>{mode=b.dataset.inputSceneMode;if(mode==='3d'&&failed){viewer?.dispose();viewer=null;failed=false;signature='';requestedView=view??'iso';}sync();});
 for(const b of motion)b.addEventListener('click',()=>{if(b.dataset.inputMotion==='fit'){viewer?.fit(view??'iso');view=view??'iso';onViewChange?.(view);}else viewer?.zoom(b.dataset.inputMotion==='in'?.8:1.25);});
 document.addEventListener('visibilitychange',sync);
 return {
  update(options){current=options;data=options.params.basis==='ports'?inputSceneData(options.params,options.plan):null;sync();},
  setActive(active){if(current)current.active=active;sync();},
  setView(next){view=next;requestedView=next;if(mode==='3d'&&viewer&&data){viewer.fit(next);requestedView=null;onViewChange?.(view);}},
 };
}
