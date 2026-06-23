(function(){
  var neon=false;
  try{neon=localStorage.getItem("uiRefreshPreview")==="1";}catch(e){}
  if(!neon)return;
  document.documentElement.classList.add("ui-refresh");
  document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute("content","#020506");});
  var apple=document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if(apple)apple.setAttribute("content","black-translucent");
})();