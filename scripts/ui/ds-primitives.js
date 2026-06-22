"use strict";
/* 的ノート design system — reusable UI primitives. Route overlays/sheets through here. */

function dsUiActive(){
  return document.documentElement.classList.contains("ui-refresh");
}

function dsEsc(s){
  return typeof esc==="function"?esc(s):String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function dsButton(opts){
  const o=opts||{};
  const kind=o.variant==="danger"?"danger":o.variant==="ghost"?"ghost":o.variant==="secondary"?"sec":o.variant==="cta"?"":"";
  const sm=o.size==="sm"?" sm":"";
  const id=o.id?` id="${dsEsc(o.id)}"`:"";
  const cls=`btn${kind?` ${kind}`:""}${sm}${o.className?` ${o.className}`:""}`;
  const label=o.label!=null?o.label:"";
  const aria=o.ariaLabel?` aria-label="${dsEsc(o.ariaLabel)}"`:"";
  return `<button class="${cls}" type="button"${id}${aria}>${label}</button>`;
}

function dsBtnRow(buttons){
  return `<div class="btnrow">${(buttons||[]).map(b=>dsButton(b)).join("")}</div>`;
}

function wireChipGroup(root, selector, onSelect){
  if(!root) return;
  root.querySelectorAll(selector||".chip").forEach(chip=>{
    chip.onclick=()=>{
      root.querySelectorAll(selector||".chip").forEach(c=>c.classList.remove("on"));
      chip.classList.add("on");
      if(typeof onSelect==="function") onSelect(chip);
    };
  });
}

function dsFocusables(root){
  return [...(root||document).querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')]
    .filter(el=>!el.disabled&&el.offsetParent!==null&&!el.closest("[hidden]"));
}

function clearMainInert(){
  const main=document.getElementById("main");
  if(!main) return;
  if(!document.querySelector(".ovl")) main.removeAttribute("inert");
}

function teardownOverlayA11y(ovl){
  if(!ovl||ovl._dsA11yDone) return;
  if(typeof ovl._dsA11yTeardown==="function") ovl._dsA11yTeardown();
  else clearMainInert();
}

function removeOverlay(ovl){
  if(!ovl) return;
  teardownOverlayA11y(ovl);
  if(ovl.parentNode) ovl.remove();
  else clearMainInert();
}

function initOverlayInertGuard(){
  if(typeof document==="undefined"||document.body._dsInertGuard) return;
  document.body._dsInertGuard=true;
  const obs=new MutationObserver(muts=>{
    muts.forEach(m=>{
      m.removedNodes.forEach(node=>{
        if(node.nodeType!==1) return;
        if(node.classList&&node.classList.contains("ovl")) teardownOverlayA11y(node);
        if(node.querySelectorAll) node.querySelectorAll(".ovl").forEach(teardownOverlayA11y);
      });
    });
    clearMainInert();
  });
  obs.observe(document.body,{childList:true,subtree:true});
}

function mountSheetA11y(ovl, opts){
  const o=opts||{};
  if(!ovl||!dsUiActive()) return ()=>{};
  const sheet=ovl.querySelector(".sheet");
  const titleEl=o.titleEl||(sheet&&sheet.querySelector("h3"));
  ovl.classList.add("ds-overlay");
  if(sheet) sheet.classList.add("ds-sheet");
  ovl.setAttribute("role","dialog");
  ovl.setAttribute("aria-modal","true");
  if(titleEl){
    if(!titleEl.id) titleEl.id=`ds-sheet-title-${Date.now()}`;
    ovl.setAttribute("aria-labelledby",titleEl.id);
  }
  const main=document.getElementById("main");
  const prevFocus=document.activeElement;
  if(main) main.setAttribute("inert","");
  const focusables=dsFocusables(ovl);
  const first=focusables[0];
  if(first) first.focus();

  const onKey=e=>{
    if(e.key==="Escape"){
      e.preventDefault();
      if(typeof o.onClose==="function") o.onClose();
      else removeOverlay(ovl);
    }
    if(e.key==="Tab"&&focusables.length){
      const i=focusables.indexOf(document.activeElement);
      if(e.shiftKey&&i<=0){ e.preventDefault(); focusables[focusables.length-1].focus(); }
      else if(!e.shiftKey&&i===focusables.length-1){ e.preventDefault(); focusables[0].focus(); }
    }
  };
  ovl.addEventListener("keydown",onKey);

  const teardown=()=>{
    if(ovl._dsA11yDone) return;
    ovl._dsA11yDone=true;
    ovl.removeEventListener("keydown",onKey);
    clearMainInert();
    if(prevFocus&&typeof prevFocus.focus==="function") prevFocus.focus();
  };
  ovl._dsA11yTeardown=teardown;
  return teardown;
}

function mountOverlay(html, opts){
  const o=opts||{};
  const ovl=document.createElement("div");
  ovl.className="ovl ds-overlay";
  ovl.innerHTML=html;
  document.body.appendChild(ovl);
  if(typeof mountOverlayMotion==="function") mountOverlayMotion(ovl);
  const teardown=mountSheetA11y(ovl,o);
  const dismiss=()=>{
    removeOverlay(ovl);
    if(typeof o.onDismiss==="function") o.onDismiss();
  };
  if(o.dismissOnBackdrop!==false){
    ovl.addEventListener("click",e=>{ if(e.target===ovl) dismiss(); });
  }
  ovl._dsDismiss=dismiss;
  return { ovl, dismiss, teardown };
}

if(typeof window!=="undefined"){
  window.dsUiActive=dsUiActive;
  window.dsButton=dsButton;
  window.dsBtnRow=dsBtnRow;
  window.wireChipGroup=wireChipGroup;
  window.clearMainInert=clearMainInert;
  window.removeOverlay=removeOverlay;
  window.mountSheetA11y=mountSheetA11y;
  window.mountOverlay=mountOverlay;
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",initOverlayInertGuard);
  else initOverlayInertGuard();
}