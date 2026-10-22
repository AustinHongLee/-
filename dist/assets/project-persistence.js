// One writer per browser origin / project key. A stale tab never silently
// overwrites another tab's edits. Failed writes leave the previous file intact.
export function createDraftStore(storage,key){
  let baseline=null,initialRead=true,lastDraft=null,written=false,protectedMessage='',state={kind:'idle',message:'尚未保存'};
  try{baseline=storage.getItem(key);}catch{initialRead=false;state={kind:'error',message:'無法讀取瀏覽器儲存空間'};}
  const fail=(kind,message)=>{state={kind,message};return {...state,saved:false};};
  return {
    get state(){return {...state};},get draft(){return lastDraft;},get original(){return baseline;},
    protectSaved(message='上次專案無法載入，原始存檔已保留；目前畫面尚未取代它'){protectedMessage=message;state={kind:'recovery',message};return this.state;},
    pending(message='目前修改尚未保存'){if(!protectedMessage)state={kind:'dirty',message};return this.state;},
    write(text,{overwrite=false}={}){
      if(typeof text!=='string')throw new TypeError('專案須先序列化為文字。');lastDraft=text;
      if(protectedMessage&&!overwrite)return fail('recovery',protectedMessage);
      try{
        const current=storage.getItem(key);
        if(!initialRead){baseline=current;initialRead=true;}
        if(!overwrite&&current!==baseline&&current!==text)return fail('conflict','另一分頁已更新此專案，本頁尚未覆蓋');
        if(current!==text){
          // Retain the prior persisted project before the first changed save.
          if(!written&&current!==null)storage.setItem(key+':previous',current);
          storage.setItem(key,text);
          written=true;
        }
        baseline=text;protectedMessage='';state={kind:'saved',message:'已存於此瀏覽器'};return {...state,saved:true};
      }catch{return fail('error','保存失敗，本頁修改尚未存入瀏覽器');}
    },
    changedElsewhere(value){if(value!==baseline){state={kind:'conflict',message:'另一分頁已更新此專案，請先保留本頁備份或重新載入'};}return this.state;}
  };
}

export function mountDraftPersistence({key,name}){
  let storage;try{storage=window.localStorage;}catch{storage={getItem(){throw new Error('storage unavailable');},setItem(){throw new Error('storage unavailable');}};}
  const store=createDraftStore(storage,key),root=document.createElement('div');root.className='workbench-persistence';root.setAttribute('role','status');root.setAttribute('aria-label','專案保存狀態');
  const label=document.createElement('span'),backup=document.createElement('button'),replace=document.createElement('button'),original=document.createElement('button');
  backup.type=replace.type=original.type='button';backup.textContent='下載 JSON 備份';original.textContent='下載載入前原檔';replace.textContent='以本頁覆蓋瀏覽器版本';replace.hidden=original.hidden=true;
  root.append(label,backup,original,replace);document.querySelector('.workbench-nav').after(root);
  const projectMenu=document.querySelector('header .project-menu,header .tank-project'),projectItems=projectMenu?.querySelector(':scope>div'),badge=document.createElement('span');badge.className='project-save-state';projectMenu?.querySelector(':scope>summary')?.append(badge);
  function render(){const s=store.state;root.dataset.state=s.kind;label.textContent=s.message;backup.disabled=!store.draft;original.hidden=s.kind!=='recovery'||store.original===null;replace.hidden=!['conflict','recovery'].includes(s.kind)||!store.draft;backup.textContent=s.kind==='dirty'?'下載最後有效專案':s.kind==='recovery'?'下載本頁專案':'下載 JSON 備份';backup.title=s.kind==='dirty'?'下載本頁最後可保存的有效專案；未完成的尺寸不在此檔':'另存專案檔供換裝置或回復使用';
    badge.textContent=s.kind==='saved'?'已保存':s.kind==='idle'?'':'待處理';
    if(projectItems&&['saved','idle'].includes(s.kind))projectItems.append(root);else document.querySelector('.workbench-nav').after(root);
  }
  backup.addEventListener('click',()=>{if(!store.draft)return;const blob=new Blob([store.draft],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  original.addEventListener('click',()=>{if(store.original===null)return;const url=URL.createObjectURL(new Blob([store.original],{type:'application/json;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=name+'-載入前原檔.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  replace.addEventListener('click',()=>{if(store.draft){store.write(store.draft,{overwrite:true});render();}});
  window.addEventListener('storage',event=>{if(event.storageArea===storage&&(event.key===key||event.key===null)){store.changedElsewhere(event.key===null?null:event.newValue);render();}});
  render();return {write(text){const result=store.write(text);render();return result;},pending(message){store.pending(message);render();},protectSaved(message){store.protectSaved(message);render();},get state(){return store.state;}};
}
