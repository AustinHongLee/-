import {endAlignmentMarkup,alignmentModeAction,offsetAction,offsetSideAction,retreatAction,offsetKeyboardAction} from './end-alignment-ui.js';

/** Live end-section positioning. The app owns pending state and verified exports. */
export function installEndAlignment({getParams,getStatus,preview,commit,cancel,beforeOpen,onVisibilityChange=()=>{}}){
  const panel=document.getElementById('end-alignment-panel'),content=document.getElementById('end-alignment-content'),title=document.getElementById('end-alignment-title'),status=document.getElementById('end-alignment-status');
  let end=null,drag=null,timer=null,typedParams=null;
  function stopTimer(){clearTimeout(timer);timer=null;typedParams=null;}
  function flushTyped(){const saved=typedParams;stopTimer();if(saved&&getParams().hostType==='elbow'&&JSON.stringify(saved)===JSON.stringify(getParams()))commit(saved);}
  function refresh(){
    if(!end)return;if(getParams().hostType!=='elbow'){close();return;}
    title.textContent=`${end} 端 · 支管怎麼對齊？`;
    if(!drag){
      const markup=endAlignmentMarkup(getParams(),end);
      if(!content.contains(document.activeElement))content.innerHTML=markup;
      else if(document.activeElement.matches('[data-end-offset-field]')){
        const fragment=document.createElement('template');fragment.innerHTML=markup;
        for(const selector of ['.end-alignment-cards','.end-offset-diagram','.end-offset-sides','.end-shortcut-note']){
          const old=content.querySelector(selector),next=fragment.content.querySelector(selector);
          if(old&&next)old.replaceWith(next);
        }
        for(const input of content.querySelectorAll('[data-end-offset-field]'))if(input!==document.activeElement){const next=fragment.content.querySelector(`[name="${input.name}"]`);if(next)input.value=next.value;}
      }
    }
    const current=getStatus();status.textContent=current.text;status.classList.toggle('error',current.error);
  }
  function cancelDrag(){const previous=drag;if(!previous)return;drag=null;if(previous.target.hasPointerCapture(previous.id))previous.target.releasePointerCapture(previous.id);cancel(previous.base);refresh();}
  function close(){const wasOpen=!panel.hidden;flushTyped();end=null;panel.hidden=true;panel.closest('.model-panel').classList.remove('end-controls-open');cancelDrag();if(wasOpen)onVisibilityChange();}
  function open(value){flushTyped();beforeOpen();cancelDrag();end=value;panel.hidden=false;panel.closest('.model-panel').classList.add('end-controls-open');content.innerHTML=endAlignmentMarkup(getParams(),end);refresh();onVisibilityChange();document.getElementById('end-alignment-close').focus({preventScroll:true});}
  function apply(patch){if(patch){stopTimer();commit({...getParams(),...patch});content.innerHTML=endAlignmentMarkup(getParams(),end);refresh();}}
  function move(event){
    if(!drag||event.pointerId!==drag.id)return;
    const rect=drag.target.getBoundingClientRect(),v=drag.target.viewBox.baseVal,s=Math.min(rect.width/v.width,rect.height/v.height),left=rect.left+(rect.width-v.width*s)/2,top=rect.top+(rect.height-v.height*s)/2;
    const patch=offsetAction(drag.base,drag.end,v.x+(event.clientX-left)/s,v.y+(event.clientY-top)/s);if(!patch)return;
    drag.patch=patch;preview({...drag.base,...patch});
    const fragment=document.createElement('template');fragment.innerHTML=endAlignmentMarkup(getParams(),end,{layoutParams:drag.base});const next=fragment.content.querySelector('[data-end-offset-map]');if(next)drag.target.innerHTML=next.innerHTML;
    status.textContent='定位預覽；放開後精算魚口。';status.classList.remove('error');
  }
  document.getElementById('end-alignment-close').addEventListener('click',close);
  content.addEventListener('click',event=>{
    const card=event.target.closest('[data-visual-field="elbowAlignment"]');if(card){apply(alignmentModeAction(getParams(),end,card.dataset.visualValue.split('-')[1]));return;}
    const side=event.target.closest('[data-end-offset-side]');if(side){apply(offsetSideAction(getParams(),end,side.dataset.endOffsetSide));return;}
    const retreat=event.target.closest('[data-end-retreat]');if(retreat)apply(retreatAction(getParams(),end,Number(retreat.dataset.endRetreat)));
  });
  content.addEventListener('input',event=>{
    const input=event.target;if(!['elbowOffset','elbowSideOffset'].includes(input.name)||input.readOnly)return;
    preview({...getParams(),elbowAlignment:`${end.toLowerCase()}-offset`,[input.name]:input.value===''?NaN:Number(input.value)});refresh();stopTimer();typedParams={...getParams()};timer=setTimeout(flushTyped,120);
  });
  content.addEventListener('focusout',()=>requestAnimationFrame(refresh));
  content.addEventListener('pointerdown',event=>{
    const target=event.target.closest('[data-end-offset-map]');if(!target||event.button!==0||drag)return;event.preventDefault();flushTyped();drag={id:event.pointerId,target,base:{...getParams()},end,patch:null};target.setPointerCapture(event.pointerId);move(event);
  });
  content.addEventListener('pointermove',move);
  content.addEventListener('pointerup',event=>{
    if(!drag||event.pointerId!==drag.id)return;const previous=drag;drag=null;if(previous.target.hasPointerCapture(previous.id))previous.target.releasePointerCapture(previous.id);if(previous.patch)commit(getParams());content.innerHTML=endAlignmentMarkup(getParams(),end);refresh();
  });
  content.addEventListener('pointercancel',cancelDrag);
  content.addEventListener('keydown',event=>{
    if(!event.target.closest('[data-end-offset-map]'))return;const patch=offsetKeyboardAction(getParams(),end,event.key,{shiftKey:event.shiftKey});if(!patch)return;event.preventDefault();apply(patch);
    content.querySelector('[data-end-offset-map]')?.focus({preventScroll:true});
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&end){event.preventDefault();if(drag)cancelDrag();else close();}});
  return {open,close,refresh,get dragging(){return !!drag;}};
}
