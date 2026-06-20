"use strict";
/* Archery Note: compatibility polyfills */
/* 小さな互換性補助: 古いSafari/WebViewでも主要機能が落ちないようにする */
if(!Array.prototype.flat){
  Object.defineProperty(Array.prototype,"flat",{value:function(depth){
    const d=depth==null?1:Number(depth)||0, out=[];
    (function walk(a,n){ a.forEach(v=>{ if(Array.isArray(v)&&n>0) walk(v,n-1); else out.push(v); }); })(this,d);
    return out;
  }});
}
if(!Array.prototype.flatMap){
  Object.defineProperty(Array.prototype,"flatMap",{value:function(fn,thisArg){ return this.map(fn,thisArg).flat(); }});
}
if(!Object.values){ Object.values=o=>Object.keys(o).map(k=>o[k]); }
if(!Number.isFinite){ Number.isFinite=v=>typeof v==="number" && isFinite(v); }
if(!Math.hypot){ Math.hypot=function(){ let s=0; for(let i=0;i<arguments.length;i++) s+=arguments[i]*arguments[i]; return Math.sqrt(s); }; }
