"use strict";
/* Archery Note: target drawing and plots */
/* ============ target SVG ============ */
function targetMarkup(faceD, idPrefix, faceType){
  const w=ringW(faceD,faceType);
  const spotG=(cx,cy)=>{
    let h="";
    [[6,"#37a6e0"],[7,"#f23b3b"],[8,"#f23b3b"],[9,"#ffe14d"],[10,"#ffe14d"]].forEach(([sc,fill])=>{
      h+=`<circle cx="${cx}" cy="${cy}" r="${(11-sc)*w}" fill="${fill}" stroke="#1c1e1c" stroke-width="${w/16}"/>`;
    });
    h+=`<circle cx="${cx}" cy="${cy}" r="${w/2}" fill="none" stroke="#1c1e1c" stroke-width="${w/16}"/>`;
    h+=`<line x1="${cx-w/6}" y1="${cy}" x2="${cx+w/6}" y2="${cy}" stroke="#1c1e1c" stroke-width="${w/16}"/>`;
    h+=`<line x1="${cx}" y1="${cy-w/6}" x2="${cx}" y2="${cy+w/6}" stroke="#1c1e1c" stroke-width="${w/16}"/>`;
    return h;
  };
  if(faceType==="triple"){
    let g=`<rect x="-14" y="-36" width="28" height="72" rx="1.5" fill="#f7f6f0" stroke="#bbb" stroke-width="0.2"/>`;
    SPOT_Y.forEach(c=>{ g+=spotG(0,-c); });
    return `<svg class="main triple" id="${idPrefix}svg" viewBox="-15 -37.5 30 75" xmlns="http://www.w3.org/2000/svg">
    <g id="${idPrefix}main"><g>${g}</g><g id="${idPrefix}marks"></g><g id="${idPrefix}cur"></g></g>
  </svg>`;
  }
  if(faceType==="spot"){
    const M=5*w*1.25;
    return `<svg class="main" id="${idPrefix}svg" viewBox="${-M} ${-M} ${2*M} ${2*M}" xmlns="http://www.w3.org/2000/svg">
    <g id="${idPrefix}main"><g>${spotG(0,0)}</g><g id="${idPrefix}marks"></g><g id="${idPrefix}cur"></g></g>
  </svg>`;
  }
  if(isFieldFace(faceType)){
    const R=faceD/2, M=R*1.18;
    const line=targetLineHalfWidth(faceD,faceType)*2;
    const zones=[
      [6,"#1c1e1c"],[5,"#1c1e1c"],[4,"#1c1e1c"],[3,"#1c1e1c"],
      [2,"#ffe14d"],[1,"#ffe14d"]
    ];
    let g="";
    zones.forEach(([k,fill])=>{
      g+=`<circle cx="0" cy="0" r="${k*w}" fill="${fill}" stroke="${fill==="#1c1e1c"?"#f0f1ec":"#1c1e1c"}" stroke-width="${line}"/>`;
    });
    g+=`<line x1="${-w/6}" y1="0" x2="${w/6}" y2="0" stroke="#1c1e1c" stroke-width="${line}"/>`;
    g+=`<line x1="0" y1="${-w/6}" x2="0" y2="${w/6}" stroke="#1c1e1c" stroke-width="${line}"/>`;
    return `<svg class="main field" id="${idPrefix}svg" viewBox="${-M} ${-M} ${2*M} ${2*M}" xmlns="http://www.w3.org/2000/svg">
    <g id="${idPrefix}main"><g>${g}</g><g id="${idPrefix}marks"></g><g id="${idPrefix}cur"></g></g>
  </svg>`;
  }
  const R=faceD/2, M=R*1.18;
  const zones=[ [10,"#fff"],[9,"#fff"],[8,"#1c1e1c"],[7,"#1c1e1c"],[6,"#37a6e0"],[5,"#37a6e0"],[4,"#f23b3b"],[3,"#f23b3b"],[2,"#ffe14d"],[1,"#ffe14d"] ];
  let g="";
  zones.forEach(([k,fill])=>{ g+=`<circle cx="0" cy="0" r="${k*w}" fill="${fill}" stroke="${fill==="#1c1e1c"?"#e9ebe6":"#1c1e1c"}" stroke-width="${R/300}"/>`; });
  g+=`<circle cx="0" cy="0" r="${w/2}" fill="none" stroke="#1c1e1c" stroke-width="${R/300}"/>`;
  g+=`<line x1="${-w/6}" y1="0" x2="${w/6}" y2="0" stroke="#1c1e1c" stroke-width="${R/300}"/>`;
  g+=`<line x1="0" y1="${-w/6}" x2="0" y2="${w/6}" stroke="#1c1e1c" stroke-width="${R/300}"/>`;
  return `<svg class="main" id="${idPrefix}svg" viewBox="${-M} ${-M} ${2*M} ${2*M}" xmlns="http://www.w3.org/2000/svg">
    <g id="${idPrefix}main"><g>${g}</g><g id="${idPrefix}marks"></g><g id="${idPrefix}cur"></g></g>
  </svg>`;
}
function markCircle(a, faceD, color, label, cls){
  const r=arrowMarkRadius(faceD);
  const klass=cls?` class="${cls}"`:"";
  return `<g${klass}><circle cx="${a.x}" cy="${-a.y}" r="${r}" fill="${color}" stroke="#fff" stroke-width="${r/4}" opacity="0.92"/>`+
    (label?`<text x="${a.x}" y="${-a.y}" font-size="${r*1.2}" fill="#fff" text-anchor="middle" dominant-baseline="central" font-weight="bold">${label}</text>`:"")+`</g>`;
}
/* static plot for history/summary */
function plotSession(sess, container){
  const faceD=sess.faceD;
  const ft=sess.faceType==="triple"?"spot":sess.faceType;
  container.innerHTML=`<div class="tgWrap">${targetMarkup(faceD,"pl",ft)}</div>`+
    (sess.faceType==="triple"?`<div class="hint" style="text-align:center">三つ目的：3スポットを1つに重ねて表示しています</div>`:"");
  const marks=$("#plmarks");
  let html="";
  sess.ends.forEach((end,ei)=>{ end.forEach(a=>{ html+=markCircle(a,faceD,ENDCOLORS[ei%ENDCOLORS.length]); }); });
  const all=sess.ends.flat();
  const st=robustStats(all);
  if(st){
    const w=ringW(faceD,ft);
    st.excluded.forEach(a=>{
      const r=faceD/70;
      html+=`<g><line x1="${a.x-r}" y1="${-a.y-r}" x2="${a.x+r}" y2="${-a.y+r}" stroke="#000" stroke-width="${faceD/300}"/>`+
        `<line x1="${a.x-r}" y1="${-a.y+r}" x2="${a.x+r}" y2="${-a.y-r}" stroke="#000" stroke-width="${faceD/300}"/></g>`;
    });
    html+=`<g><line x1="${st.mx-w*0.8}" y1="${-st.my}" x2="${st.mx+w*0.8}" y2="${-st.my}" stroke="#000" stroke-width="${faceD/400}"/>`+
      `<line x1="${st.mx}" y1="${-st.my-w*0.8}" x2="${st.mx}" y2="${-st.my+w*0.8}" stroke="#000" stroke-width="${faceD/400}"/>`+
      `<circle cx="${st.mx}" cy="${-st.my}" r="${st.rr}" fill="none" stroke="#000" stroke-dasharray="${faceD/60} ${faceD/120}" stroke-width="${faceD/400}"/></g>`;
    if(st.major!=null && st.minor!=null){
      html+=`<ellipse cx="${st.mx}" cy="${-st.my}" rx="${st.major}" ry="${st.minor}" transform="rotate(${-st.angleDeg} ${st.mx} ${-st.my})" fill="none" stroke="#0f9d58" stroke-dasharray="${faceD/90} ${faceD/160}" stroke-width="${faceD/380}"/>`;
    }
  }
  marks.innerHTML=html;
}
