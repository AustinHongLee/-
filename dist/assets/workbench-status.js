// Shared glanceable status strip for every tool page.
// One tone (ok / warn / error / busy), up to four key numbers, and an issue list whose
// items jump straight to the cause. Normal results stay quiet; problems are the only loud part.
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ICONS={ok:'✓',warn:'!',error:'✕',busy:'…',idle:'·'};
const LEVEL_ORDER={error:0,warn:1,info:2};

/** Inserts (once) the strip right after `anchor` and returns an updater. */
export function mountWorkbenchStatus(anchor,{sticky=false,wide=false}={}){
  let host=document.getElementById('wb-status');
  if(!host){host=document.createElement('section');host.id='wb-status';host.className='wb-status';host.setAttribute('aria-label','目前狀態');anchor.after(host);}
  host.classList.toggle('is-sticky',!!sticky);host.classList.toggle('is-wide',!!wide);
  let open=false,actions=[],lastKey='';
  const sync=()=>{const list=host.querySelector('.wb-issues'),chip=host.querySelector('[data-wb-toggle]');if(list)list.hidden=!open;chip?.setAttribute('aria-expanded',String(open));};
  host.addEventListener('click',event=>{
    if(event.target.closest('[data-wb-toggle]')){open=!open;sync();if(open)host.querySelector('.wb-issues [data-wb-issue]')?.focus();return;}
    const item=event.target.closest('[data-wb-issue]');if(!item)return;
    const action=actions[Number(item.dataset.wbIssue)];open=false;sync();if(typeof action==='function')action();
  });
  host.addEventListener('keydown',event=>{if(event.key==='Escape'&&open){open=false;sync();host.querySelector('[data-wb-toggle]')?.focus();}});
  document.addEventListener('click',event=>{if(open&&!host.contains(event.target)){open=false;sync();}});
  return {
    element:host,
    update(model){
      const issues=[...(model.issues??[])].sort((a,b)=>(LEVEL_ORDER[a.level]??3)-(LEVEL_ORDER[b.level]??3));
      actions=issues.map(issue=>issue.action);
      const counted=issues.filter(issue=>issue.level!=='info').length,tone=model.tone??'idle';
      const key=JSON.stringify([tone,model.title,model.detail,model.metrics,issues.map(i=>[i.level,i.text,i.actionLabel]),model.progress]);
      if(key===lastKey)return;lastKey=key;
      const metrics=(model.metrics??[]).slice(0,4).map(m=>`<div${m.quiet?' class="quiet"':''}><dt>${esc(m.label)}</dt><dd>${esc(m.value)}${m.unit?`<small>${esc(m.unit)}</small>`:''}</dd></div>`).join('');
      const progress=model.progress?.length?`<ol class="wb-progress" aria-label="進度">${model.progress.map(step=>`<li data-state="${esc(step.state)}"><span aria-hidden="true"></span>${esc(step.label)}</li>`).join('')}</ol>`:'';
      const list=issues.length?`<div class="wb-issues" role="list" hidden>${issues.map((issue,index)=>{const body=`<span class="wb-dot" data-level="${esc(issue.level)}" aria-hidden="true">${ICONS[issue.level==='info'?'idle':issue.level]??'·'}</span><span class="wb-issue-text">${esc(issue.text)}</span>${issue.actionLabel?`<span class="wb-go">${esc(issue.actionLabel)} →</span>`:''}`;return issue.action?`<button type="button" role="listitem" data-wb-issue="${index}" data-level="${esc(issue.level)}">${body}</button>`:`<div role="listitem" data-level="${esc(issue.level)}">${body}</div>`;}).join('')}</div>`:'';
      host.dataset.tone=tone;
      host.innerHTML=`<div class="wb-status-inner"><button type="button" class="wb-chip" data-tone="${esc(tone)}" ${issues.length?'data-wb-toggle aria-expanded="false" aria-haspopup="true"':'aria-disabled="true" tabindex="-1"'} title="${esc(issues.length?'點開查看需要處理的項目':model.title)}"><span class="wb-dot" data-level="${esc(tone)}" aria-hidden="true">${ICONS[tone]??'·'}</span><strong>${esc(model.title)}</strong>${counted?`<em>${counted}</em>`:''}${model.detail?`<small>${esc(model.detail)}</small>`:''}</button>${progress}<dl class="wb-metrics">${metrics}</dl></div>${list}`;
      sync();
    }
  };
}

/** Utility for the tools: map issue levels to a tone. */
export function toneFor(issues,{valid=true}={}){
  if(!valid||issues.some(issue=>issue.level==='error'))return 'error';
  return issues.some(issue=>issue.level==='warn')?'warn':'ok';
}
