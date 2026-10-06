if(location.protocol==='file:'){
  document.getElementById('home-launch').hidden=false;
  document.querySelectorAll('[data-tool-page]').forEach(link=>link.href='http://127.0.0.1:4173/'+link.dataset.toolPage);
}
