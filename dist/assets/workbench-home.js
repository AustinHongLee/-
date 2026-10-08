if(location.protocol==='file:'){
  document.getElementById('home-launch').hidden=false;
  document.querySelectorAll('[data-tool-page]').forEach(link=>link.href='http://127.0.0.1:4173/'+link.dataset.toolPage);
}else{
  // Served home: show each tool's saved progress (modules cannot load from file URLs).
  const script=document.createElement('script');script.type='module';script.src='assets/workbench-home-status.js';document.head.append(script);
}
