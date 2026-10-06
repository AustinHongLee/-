// Classic script: file:// must reach the launch guide before any ES module loads.
(() => {
  const byID=id=>document.getElementById(id),shell=byID('workbench-tool'),status=byID('workbench-startup');
  const entries={joint:{page:'joint.html',module:'./app.js'},offset:{page:'offset.html',module:'./offset-app.js'},tank:{page:'tank.html',module:'./tank-app.js'}};
  const entry=entries[shell.dataset.tool];
  byID('boot-retry').addEventListener('click',()=>location.reload());
  function unavailable(title,message,error){
    shell.hidden=true;
    byID('boot-title').textContent=title;byID('boot-message').textContent=message;
    byID('boot-guide').hidden=false;byID('boot-home').hidden=false;
    if(error){byID('boot-details').hidden=false;byID('boot-error').textContent=error.message||String(error);}
  }
  if(location.protocol==='file:'){
    unavailable('請從啟動入口開啟工具','直接開 HTML 無法載入完整的計算與互動功能。');
    byID('boot-open').href='http://127.0.0.1:4173/'+entry.page;byID('boot-open').hidden=false;
    byID('boot-open').textContent='服務已啟動？開啟完整工具';
    byID('boot-home').href='http://127.0.0.1:4173/';
    return;
  }
  import(entry.module).then(()=>{
    shell.removeAttribute('inert');shell.classList.add('workbench-ready');status.hidden=true;
    window.dispatchEvent(new Event('resize'));
  }).catch(error=>{
    unavailable('工具未能完整載入','請確認本機服務仍在執行，再重新載入；也可以重新執行啟動檔。',error);
    byID('boot-retry').hidden=false;
  });
})();
