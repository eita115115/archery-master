"use strict";
/* Archery Note: sight advice, physics, summaries */
/* ============ sight advice ============ */
function shapeNote(st){
  if(!st || st.n<6) return "";
  const tilt=Math.abs(st.angleDeg||0);
  const tilted=st.major&&st.minor&&st.major>st.minor*1.45&&tilt>15&&tilt<75;
  if(tilted) return `<div class="note">📊 <b>斜め方向に伸びたグルーピング</b>です（長軸${st.major.toFixed(1)}cm／短軸${st.minor.toFixed(1)}cm、角度${st.angleDeg.toFixed(0)}°）。照準の流れ、リリース方向、押し手の入り方を同じリズムで確認すると原因を絞りやすいです。</div>`;
  if(st.sy>st.sx*1.3) return `<div class="note">📊 <b>縦長のグルーピング</b>です（上下±${st.sy.toFixed(1)}cm／左右±${st.sx.toFixed(1)}cm）。上下ブレはリリースの強弱・引き尺・プレッシャーポイントの上下、または矢の重量差が原因になりやすいです。</div>`;
  if(st.sx>st.sy*1.3) return `<div class="note">📊 <b>横長のグルーピング</b>です（左右±${st.sx.toFixed(1)}cm／上下±${st.sy.toFixed(1)}cm）。左右ブレは風・エイミング・ボウハンド、センターショットやプランジャー由来が多いです。</div>`;
  return "";
}
function groupSummaryHtml(st){
  if(!st) return "";
  return `<div class="kv"><span>グルーピング中心</span><span>${cmOffsetText(st.mx,"x")} / ${cmOffsetText(st.my,"y")}</span></div>
    <div class="kv"><span>グルーピング半径 (RMS)</span><span>${st.rr.toFixed(1)} cm</span></div>
    <div class="kv"><span>ばらつき（±1σ）</span><span>左右 ${st.sx.toFixed(1)}cm ・ 上下 ${st.sy.toFixed(1)}cm</span></div>
    ${st.major!=null?`<div class="kv"><span>グルーピング楕円</span><span>長軸 ${st.major.toFixed(1)}cm ・ 短軸 ${st.minor.toFixed(1)}cm ・ 角度 ${st.angleDeg.toFixed(0)}°</span></div>`:""}
    <div class="kv"><span>演算信頼度</span><span>${pct(st.confidence||0)} / ${st.method}</span></div>
    ${st.excluded.length?`<div class="kv"><span>外れ値の除外</span><span>${st.excluded.length}本を分析から除外（図の×印）</span></div>`:""}`;
}
function cmOffsetText(v, axis){
  const a=Math.abs(v).toFixed(1);
  if(axis==="x") return v>0?`右に ${a}cm`:`左に ${a}cm`;
  return v>0?`上に ${a}cm`:`下に ${a}cm`;
}
function pct(v){ return `${Math.round(v*100)}%`; }
function sightTrend(setupId){
  if(!setupId) return null;
  const byDist={};
  db.sightMarks.filter(m=>m.setupId===setupId).forEach(m=>{
    const v=parseFloat(m.v);
    if(isFinite(v)) byDist[m.dist]=v;
  });
  const pts=Object.keys(byDist).map(d=>[+d,byDist[d]]).sort((a,b)=>a[0]-b[0]);
  if(pts.length<2) return null;
  const r=regress(pts);
  return r?{pts,slope:r.b,est:d=>r.a+r.b*d}:null;
}
function num(v){ const n=parseFloat(v); return isFinite(n)?n:null; }
function estimatedTotalArrowWeight(setup){
  const explicit=num(setup&&setup.arrowWeight);
  if(explicit!=null) return explicit;
  const gpi=num(setup&&setup.shaftGpi), len=num(setup&&setup.arrowLength);
  if(gpi==null || len==null) return null;
  const point=num(setup&&setup.pointWeight)||100;
  return gpi*len+point+27;
}
function airDensity(setup){
  const temp=num(setup&&setup.temperature);
  const tC=temp==null?15:temp;
  const tK=tC+273.15;
  const alt=clamp(num(setup&&setup.altitude)||0,-200,4000);
  const hum=clamp((num(setup&&setup.humidity)==null?50:num(setup&&setup.humidity))/100,0,1);
  const pressure=101325*Math.pow(Math.max(0.2,1-2.25577e-5*alt),5.25588);
  const sat=610.94*Math.exp((17.625*tC)/(tC+243.04));
  const vapor=clamp(hum*sat,0,pressure*.08);
  const dry=pressure-vapor;
  return clamp(dry/(287.05*tK)+vapor/(461.495*tK),.82,1.32);
}
function estimateArrowCd(setup, diaMm){
  const explicit=num(setup&&setup.arrowCd);
  if(explicit!=null) return clamp(explicit,.55,1.9);
  let cd=diaMm<=4.2?1.03:diaMm<=5.5?1.12:diaMm<=7?1.22:1.34;
  const vane=normGearText(setup&&setup.vane);
  if(/FEATHER|羽根|ナチュラル/.test(vane)) cd+=.14;
  else if(/SPIN|WING|XS|GAS PRO|KURLY|ELIVANES/.test(vane)) cd+=.07;
  else if(/LOW|TINY|1\.5|1 5/.test(vane)) cd-=.03;
  const vh=num(setup&&setup.vaneHeight);
  if(vh!=null) cd+=clamp((vh-1.8)*.045,-.05,.12);
  const foc=num(setup&&setup.foc);
  if(foc!=null && foc>16) cd+=.015;
  return clamp(cd,.75,1.75);
}
function gearVariation(setup){
  const spread=num(setup&&setup.shaftSetWeightSpread);
  const straight=num(setup&&setup.shaftStraightness);
  const foc=num(setup&&setup.foc);
  const nock=normGearText(setup&&setup.nockFit);
  let penalty=0, notes=[];
  if(spread!=null){
    const p=clamp(spread/10,0,.16); penalty+=p;
    if(spread>=4) notes.push(`矢セット重量差 ${spread}gr は上下散りの要因になり得るため、補正を少し控えめにします。`);
  }
  if(straight!=null){
    const p=straight<=.002?.01:straight<=.004?.025:.055; penalty+=p;
    if(straight>.004) notes.push(`シャフト真直度 ${straight}inch はグルーピング評価の不確かさとして扱います。`);
  }
  if(foc!=null && (foc<9 || foc>18)){
    penalty+=.025;
    notes.push(`FOC ${foc}% は一般的なターゲット矢の中心域から外れるため、弾道推定の信頼度を少し下げます。`);
  }
  if(/ゆる|LOOSE/.test(nock)){ penalty+=.035; notes.push("ノックフィットが緩めのため、左右/上下の再現性に影響する前提で見ます。"); }
  if(/きつ|TIGHT/.test(nock)){ penalty+=.02; notes.push("ノックフィットがきつめのため、リリース離れの影響を少し見込みます。"); }
  return {penalty:clamp(penalty,0,.28), confidenceFactor:clamp(1-penalty,.72,1), notes};
}
function physicsProfile(setup){
  const p=num(setup&&setup.poundage);
  const drawIn=num(setup&&setup.drawLength)||28;
  const massGr=estimatedTotalArrowWeight(setup) || (p?clamp(p*8.4,260,520):330);
  const diaMm=num(setup&&setup.arrowDia)||5.7;
  const speedRaw=num(setup&&setup.arrowSpeed);
  const measuredSpeed=speedRaw!=null;
  const massKg=massGr*0.00006479891;
  let speedMps;
  if(measuredSpeed){
    speedMps=speedRaw>100 ? speedRaw*0.3048 : speedRaw;
  }else{
    const drawN=(p||36)*4.44822;
    const drawM=drawIn*0.0254;
    const stored=0.5*drawN*drawM;
    const explicitEff=num(setup&&setup.bowEfficiency);
    const eff=explicitEff!=null?clamp(explicitEff/100,.55,.88):(p&&p>=45?.78:.72);
    speedMps=Math.sqrt(Math.max(1,2*stored*eff/massKg));
  }
  speedMps=clamp(speedMps,35,95);
  const cd=estimateArrowCd(setup||{}, diaMm);
  const area=Math.PI*(diaMm/1000/2)**2;
  const rho=airDensity(setup||{});
  const variation=gearVariation(setup||{});
  return {pound:p||null, drawIn, massGr, diaMm, speedMps, speedFps:speedMps/0.3048, measuredSpeed, cd, area, massKg, rho, variation};
}
function sessionWindSpeed(sess){
  const v=num(sess&&sess.windSpeed);
  if(v!=null) return clamp(v,0,18);
  const wx=String(sess&&sess.wx||"");
  if(/風\s*強|強風/.test(wx)) return 5;
  if(/風\s*弱|弱風/.test(wx)) return 2;
  return sess&&sess.windDir?2.5:0;
}
function windModel(sess){
  const speed=sessionWindSpeed(sess);
  const dir=String(sess&&sess.windDir||"");
  if(speed<=0) return {speed:0,down:0,side:0,variability:0,known:false,label:"無風扱い"};
  let down=0, side=0, variability=.18, known=true, label=dir||"風向未指定";
  if(/向かい/.test(dir)){ down=-speed; label="向かい風"; }
  else if(/追い/.test(dir)){ down=speed; label="追い風"; }
  else if(/左から/.test(dir)){ side=speed; label="左から"; }
  else if(/右から/.test(dir)){ side=-speed; label="右から"; }
  else if(/巻き/.test(dir)){ side=speed*.55; down=-speed*.2; variability=.55; label="巻き風"; }
  else{ side=speed*.35; variability=.45; known=false; }
  return {speed,down,side,variability,known,label};
}
function windDriftText(cm){
  const a=Math.abs(cm).toFixed(1);
  return cm>0?`右へ${a}cm`:cm<0?`左へ${a}cm`:`0.0cm`;
}
function simulateArrow(distM, angle, phys, wind){
  wind=wind||{down:0,side:0};
  const k=0.5*phys.rho*phys.cd*phys.area/phys.massKg, dt=0.006, g=9.80665;
  let s={x:0,y:0,z:0,t:0,vx:phys.speedMps*Math.cos(angle),vy:phys.speedMps*Math.sin(angle),vz:0};
  const deriv=a=>{
    const rx=a.vx-(wind.down||0), ry=a.vy, rz=a.vz-(wind.side||0);
    const rv=Math.hypot(rx,ry,rz);
    return {x:a.vx,y:a.vy,z:a.vz,t:1,vx:-k*rv*rx,vy:-g-k*rv*ry,vz:-k*rv*rz};
  };
  const add=(a,d,h)=>({x:a.x+d.x*h,y:a.y+d.y*h,z:a.z+d.z*h,t:a.t+d.t*h,vx:a.vx+d.vx*h,vy:a.vy+d.vy*h,vz:a.vz+d.vz*h});
  const mix=(a,k1,k2,k3,k4)=>{
    const h=dt/6;
    return {x:a.x+h*(k1.x+2*k2.x+2*k3.x+k4.x),y:a.y+h*(k1.y+2*k2.y+2*k3.y+k4.y),z:a.z+h*(k1.z+2*k2.z+2*k3.z+k4.z),t:a.t+dt,
      vx:a.vx+h*(k1.vx+2*k2.vx+2*k3.vx+k4.vx),vy:a.vy+h*(k1.vy+2*k2.vy+2*k3.vy+k4.vy),vz:a.vz+h*(k1.vz+2*k2.vz+2*k3.vz+k4.vz)};
  };
  let prev=s;
  for(let i=0;i<5000 && s.x<distM && s.y>-100;i++){
    prev=s;
    const k1=deriv(s), k2=deriv(add(s,k1,dt/2)), k3=deriv(add(s,k2,dt/2)), k4=deriv(add(s,k3,dt));
    s=mix(s,k1,k2,k3,k4);
  }
  if(s.x>=distM && s.x!==prev.x){
    const q=(distM-prev.x)/(s.x-prev.x);
    s={x:distM,y:prev.y+(s.y-prev.y)*q,z:prev.z+(s.z-prev.z)*q,t:prev.t+(s.t-prev.t)*q,
      vx:prev.vx+(s.vx-prev.vx)*q,vy:prev.vy+(s.vy-prev.vy)*q,vz:prev.vz+(s.vz-prev.vz)*q};
  }
  return {y:s.y,z:s.z,t:s.t,speed:Math.hypot(s.vx,s.vy,s.vz),state:s};
}
function solveZeroAngle(distM, phys, wind){
  let lo=-0.05, hi=0.42;
  let yl=simulateArrow(distM,lo,phys,wind).y, yh=simulateArrow(distM,hi,phys,wind).y;
  if(!(yl<=0 && yh>=0)){
    const v=phys.speedMps, g=9.80665;
    const s=clamp(g*distM/(v*v),-.95,.95);
    return 0.5*Math.asin(s);
  }
  for(let i=0;i<32;i++){
    const mid=(lo+hi)/2, ym=simulateArrow(distM,mid,phys,wind).y;
    if(ym>=0) hi=mid; else lo=mid;
  }
  return (lo+hi)/2;
}
function trajectoryModel(sess, setup, eyeMm){
  const distM=Math.max(5, sess.dist||70);
  const phys=physicsProfile(setup||{});
  const wind=windModel(sess||{});
  const angle=solveZeroAngle(distM, phys, wind);
  const base=simulateArrow(distM, angle, phys, wind);
  const dth=0.0015;
  const up=simulateArrow(distM, angle+dth, phys, wind);
  const dn=simulateArrow(distM, angle-dth, phys, wind);
  const sens=Math.max(distM*.55, (up.y-dn.y)/(2*dth));
  const mmPerCmV=(0.01/sens)*eyeMm;
  const mmPerCmH=(0.01/distM)*eyeMm;
  const windDriftCm=base.z*100;
  const windUncertaintyCm=Math.abs(windDriftCm)*(wind.variability||0) + (wind.speed?0.35:0);
  const has=k=>String((setup||{})[k]||"").trim();
  const modelScore=clamp(
    (phys.measuredSpeed ? .20 : .08) +
    (has("arrowWeight") ? .13 : .06) +
    (has("arrowDia") ? .11 : .05) +
    (has("arrowCd") ? .10 : .04) +
    (has("temperature") ? .07 : .03) +
    (has("altitude") ? .06 : .02) +
    (has("humidity") ? .05 : .02) +
    (wind.speed ? (wind.known ? .12 : .06) : .08),
    0,1
  );
  return {phys, wind, angle, tof:base.t, impactSpeed:base.speed, sens, mmPerCmV, mmPerCmH, windDriftCm, windUncertaintyCm, modelScore, engine:"RK4-3D"};
}
const ArcheryPhysicsCore=Object.freeze({
  version:"RK4-3D JS core",
  trajectory:trajectoryModel,
  physicsProfile,
  windModel,
  robustStats,
  groupStats
});
if(typeof window!=="undefined") window.ArcheryPhysicsCore=ArcheryPhysicsCore;
function weightedMedian(items, fallback){
  const a=items.filter(x=>x&&isFinite(x.v)&&isFinite(x.w)&&x.w>0).sort((x,y)=>x.v-y.v);
  if(!a.length) return fallback==null?null:fallback;
  const half=a.reduce((s,x)=>s+x.w,0)/2;
  let c=0;
  for(const x of a){ c+=x.w; if(c>=half) return x.v; }
  return a[a.length-1].v;
}
function levelFromScore(score, tiers){
  const s=clamp(score||0,0,1);
  return tiers.find(t=>s>=t.min).label;
}
const LEVELS={
  physics:[{min:.72,label:"校正安定"},{min:.45,label:"データ充実"},{min:.22,label:"データ蓄積中"},{min:0,label:"未校正"}],
  data:[{min:.72,label:"高"},{min:.45,label:"中"},{min:0,label:"データ蓄積中"}],
  calibration:[{min:.72,label:"高"},{min:.42,label:"中"},{min:0,label:"データ蓄積中"}],
  system:[{min:.72,label:"提案安定"},{min:.45,label:"データ充実"},{min:.22,label:"データ蓄積中"},{min:0,label:"準備中"}]
};
function personalPhysicsCalibration(setupId){
  if(!setupId) return null;
  const setup=db.setups.find(s=>s.id===setupId);
  if(!setup) return null;
  const eye=db.settings.eyeSight||850;
  const sessions=db.sessions.filter(s=>s.setupId===setupId)
    .sort((a,b)=>(a.date||"").localeCompare(b.date||"")||(a.id>b.id?1:-1));
  const usable=sessions.map((s,i)=>{
    const st=robustStats(s.ends.flat());
    if(!st || st.n<6) return null;
    const q=sessionQuality(s,setup,st);
    const recency=.72+(i+1)/Math.max(1,sessions.length)*.28;
    return {s,st,q,w:clamp(q.score*recency,.05,1)};
  }).filter(Boolean);
  const windRatios=[], windConflicts=[];
  usable.forEach(it=>{
    const wm=windModel(it.s);
    if(!wm.speed || !wm.side) return;
    const traj=trajectoryModel(it.s,setup,eye);
    if(Math.abs(traj.windDriftCm)<.6 || Math.abs(it.st.mx)>ringW(it.s.faceD,it.s.faceType)*4) return;
    const ratio=it.st.mx/traj.windDriftCm;
    if(ratio>0 && ratio<2.6) windRatios.push({v:ratio,w:it.w});
    else if(Math.abs(it.st.mx)>ringW(it.s.faceD,it.s.faceType)*.35) windConflicts.push(it);
  });
  const clickV=[], clickH=[];
  [...new Set(sessions.map(s=>s.dist).filter(Boolean))].forEach(d=>{
    const r=regressionAdvice(setupId,d);
    if(r.v && isFinite(r.v.slope) && Math.abs(r.v.slope)>.05) clickV.push({v:Math.abs(r.v.slope)*70/d,w:clamp(r.v.quality||r.v.r2||.2,.05,1)});
    if(r.h && isFinite(r.h.slope) && Math.abs(r.h.slope)>.05) clickH.push({v:Math.abs(r.h.slope)*70/d,w:clamp(r.h.quality||r.h.r2||.2,.05,1)});
  });
  const sightMarks=db.sightMarks.filter(m=>m.setupId===setupId && isFinite(parseFloat(m.v)));
  const markPts=sightMarks.map(m=>[m.dist, parseFloat(m.v)]).filter(p=>isFinite(p[0])&&isFinite(p[1]));
  const sightFit=markPts.length>=2 ? robustLine(markPts) : null;
  const windFactor=weightedMedian(windRatios,1);
  const v70=weightedMedian(clickV,null), h70=weightedMedian(clickH,null);
  const hasSetup=k=>String((setup||{})[k]||"").trim();
  const score=clamp(
    Math.min(usable.length,12)*.035 +
    Math.min(windRatios.length,6)*.055 +
    Math.min(clickV.length+clickH.length,8)*.045 +
    Math.min(new Set(markPts.map(p=>p[0])).size,5)*.055 +
    (hasSetup("arrowSpeed") ? .12 : .03) +
    (hasSetup("arrowWeight") ? .08 : .03),
    0,1
  );
  const level=levelFromScore(score, LEVELS.physics);
  const notes=[];
  if(windRatios.length) notes.push(`風効き ${windFactor.toFixed(2)}倍（横風${windRatios.length}回）`);
  if(v70!=null||h70!=null) notes.push(`目盛り効き ${v70!=null?`上下${v70.toFixed(1)}cm@70m`:""}${v70!=null&&h70!=null?" / ":""}${h70!=null?`左右${h70.toFixed(1)}cm@70m`:""}`);
  if(sightFit) notes.push(`距離別サイト値 ${markPts.length}点 / 一致度${pct(sightFit.r2||0)}`);
  if(!notes.length) notes.push("サイト値つき練習・横風メモ・複数距離の台帳が増えるほど校正されます。");
  return {score,level,usable:usable.length,wind:{factor:windFactor,sample:windRatios.length,conflicts:windConflicts.length},click:{v70,h70,vSample:clickV.length,hSample:clickH.length},sight:{n:markPts.length,r2:sightFit?sightFit.r2:0},notes};
}
function physicsCalibrationHtml(setupId){
  const c=personalPhysicsCalibration(setupId);
  if(!c) return "";
  const color=c.level==="校正安定"?"#0f9d58":c.level==="未校正"?"#8a6d1d":"#1e6fd9";
  return `<div class="advice" style="background:var(--card);border-color:var(--line)">
    <div class="note"><b style="color:${color}">物理校正: ${c.level}</b>（${pct(c.score)}）</div>
    <div class="kv"><span>校正材料</span><span>有効練習 ${c.usable}回 / 風 ${c.wind.sample}回 / サイト値 ${c.sight.n}点</span></div>
    ${c.notes.map(n=>`<div class="note">・${esc(n)}</div>`).join("")}
  </div>`;
}
function adviceModel(sess, setup, st){
  const dist=sess.dist, w=ringW(sess.faceD,sess.faceType);
  const facePenalty=st.rr>w*2.8?.82:st.rr>w*2.0?.9:1;
  const gear=gearVariation(setup||{});
  let confidence=clamp((st.confidence||.6)*facePenalty*gear.confidenceFactor,.32,1);
  const nudge=clamp(.45+confidence*.55,.52,1);
  const eye=(db.settings.eyeSight||850);
  const traj=trajectoryModel(sess, setup, eye);
  const pcal=personalPhysicsCalibration(setup&&setup.id);
  const p=parseFloat(setup&&setup.poundage);
  let vFactor=nudge, hFactor=nudge, notes=[];
  notes.push(`信頼度 ${pct(confidence)}（${st.n}本使用${st.excluded.length?` / 外れ値${st.excluded.length}本除外`:""}）。初回補正率は ${pct(nudge)} です。`);
  notes.push(`物理エンジン: ${traj.engine}（3D空気抵抗/RK4）。初速 ${traj.phys.speedFps.toFixed(0)}fps${traj.phys.measuredSpeed?"（実測）":"（推定）"}、矢重量 ${traj.phys.massGr.toFixed(0)}gr、Cd ${traj.phys.cd.toFixed(2)}、空気密度 ${traj.phys.rho.toFixed(2)}kg/m³、飛翔 ${traj.tof.toFixed(2)}秒、入射速度 ${traj.impactSpeed.toFixed(1)}m/s、入力充実度 ${pct(traj.modelScore)}。`);
  if(pcal && pcal.score>.2) notes.push(`個人校正: ${pcal.level}（${pct(pcal.score)}）。${pcal.notes.slice(0,2).join(" / ")}`);
  if(traj.wind.speed){
    const windFactor=pcal&&pcal.wind.sample?pcal.wind.factor:1;
    const drift=traj.windDriftCm*windFactor;
    const unc=traj.windUncertaintyCm + Math.abs(drift)*(pcal&&pcal.wind.sample?clamp(.28-pcal.wind.sample*.025,.08,.28):.22);
    notes.push(`風モデル: ${traj.wind.label} ${traj.wind.speed.toFixed(1)}m/sを風ベクトル化。横流れ推定 ${windDriftText(drift)}（不確かさ±${unc.toFixed(1)}cm${windFactor!==1?` / 個人係数${windFactor.toFixed(2)}倍`:""}）。`);
    if(Math.abs(drift)>w*.25 && Math.sign(drift)===Math.sign(st.mx)){
      hFactor*=.78; confidence*=.92;
      notes.push("左右ズレの一部は風で説明できるため、左右サイト補正は控えめにします。");
    }
  }
  gear.notes.forEach(n=>notes.push(n));
  if(isFinite(p)){
    if(dist>=50 && p<36){
      vFactor*=.88;
      notes.push(`ポンドが控えめで長距離のため、上下は軌道変化の影響を見て少し控えめにします。`);
    }else if(dist>=50 && p>=42){
      vFactor*=1.04;
      notes.push(`ポンドが高めで弾道が比較的フラットな前提として、上下補正を少し強めにできます。`);
    }
  }
  const tr=sightTrend(setup&&setup.id);
  if(tr){
    const span=tr.pts[tr.pts.length-1][0]-tr.pts[0][0];
    notes.push(`距離別サイト値 ${tr.pts.length}点から軌道傾向を参照中（${tr.pts[0][0]}〜${tr.pts[tr.pts.length-1][0]}m）。`);
    if(span>=30 && Math.abs(tr.slope)>.03) vFactor*=1.02;
  }
  if(setup&&setup.id){
    const reg=regressionAdvice(setup.id, dist);
    const sv=num(sess.sightV), sh=num(sess.sightH);
    const qs=[];
    if(reg.v){
      if((reg.v.quality||0)>.5){ vFactor*=clamp(.98+(reg.v.quality||0)*.08,.98,1.05); qs.push(reg.v.quality||0); }
      notes.push(`データ同化: 信頼度つき過去回帰では上下サイト ${reg.v.zero.toFixed(1)} が推定最適値${sv!=null?`（現在との差 ${(reg.v.zero-sv).toFixed(1)}）`:""}。一致度 ${pct(reg.v.r2||0)} / 品質 ${pct(reg.v.quality||0)}。`);
    }
    if(reg.h){
      if((reg.h.quality||0)>.5){ hFactor*=clamp(.98+(reg.h.quality||0)*.08,.98,1.05); qs.push(reg.h.quality||0); }
      notes.push(`データ同化: 信頼度つき過去回帰では左右サイト ${reg.h.zero.toFixed(1)} が推定最適値${sh!=null?`（現在との差 ${(reg.h.zero-sh).toFixed(1)}）`:""}。一致度 ${pct(reg.h.r2||0)} / 品質 ${pct(reg.h.quality||0)}。`);
    }
    if(qs.length) confidence=clamp(confidence*(.96+Math.max(...qs)*.08),.32,1);
  }
  if(st.n<6) notes.push("本数が少ないため、数本確認してから追加調整する前提の提案です。");
  if(st.rr>w*2.5) notes.push("グルーピングが広めなので、サイトより射形・風・照準の再現性も同時に見てください。");
  if(st.major && st.minor>0 && st.major>st.minor*1.7) notes.push(`楕円長軸が短軸の ${(st.major/st.minor).toFixed(1)}倍あるため、中心補正と同時に散り方向の原因も優先して見ます。`);
  return {confidence,vFactor:clamp(vFactor,.45,1.1),hFactor:clamp(hFactor,.45,1.05),notes,traj,pcal};
}
function adviceFor(sess, setup){
  const all=sess.ends.flat(); const st=robustStats(all);
  if(!st || st.n<3) return null;
  const dist=sess.dist;
  const eye=(db.settings.eyeSight||850);
  const model=adviceModel(sess, setup, st);
  const personal=personalModel(sess, setup, st);
  const quality=sessionQuality(sess, setup, st);
  const out={st, lines:[], notes:model.notes, confidence:model.confidence, personal, quality, pcal:model.pcal};
  if(personal && personal.sample>=2) out.notes.unshift(`個人モデル: ${personal.state}（同条件${personal.sample}回 / 安定度${pct(personal.stability||0)}）。`);
  if(quality.score<.48) out.notes.unshift(`この回の判断信頼度は${quality.label}です。${quality.reasons.join("・")}。`);
  const TH=Math.max(ringW(sess.faceD,sess.faceType)/8, st.rr*.10); // 無視できるズレのしきい値
  // 上下
  if(Math.abs(st.my)>TH){
    const adj=Math.abs(st.my)*model.vFactor;
    const mm=adj*model.traj.mmPerCmV;
    let l=`サイトを<b>${st.my>0?"上":"下"}</b>へ（中心は${cmOffsetText(st.my,"y")}、補正 ${pct(model.vFactor)}） — 目安 ${mm.toFixed(1)}mm`;
    if(setup && setup.calibV70){ const cpc=setup.calibV70*dist/70; l+=` ≒ ${(adj/cpc).toFixed(1)}クリック`; }
    else if(model.pcal && model.pcal.click.v70){ const cpc=model.pcal.click.v70*dist/70; l+=` ≒ ${(adj/cpc).toFixed(1)}目盛り（履歴推定）`; }
    if(sess.sightV) l+=` <span style="font-size:11px;color:var(--sub)">現在 ${esc(sess.sightV)}</span>`;
    out.lines.push({axis:"v", html:l});
  }
  // 左右
  if(Math.abs(st.mx)>TH){
    const adj=Math.abs(st.mx)*model.hFactor;
    const mm=adj*model.traj.mmPerCmH;
    let l=`サイトを<b>${st.mx>0?"右":"左"}</b>へ（中心は${cmOffsetText(st.mx,"x")}、補正 ${pct(model.hFactor)}） — 目安 ${mm.toFixed(1)}mm`;
    if(setup && setup.calibH70){ const cpc=setup.calibH70*dist/70; l+=` ≒ ${(adj/cpc).toFixed(1)}クリック`; }
    else if(model.pcal && model.pcal.click.h70){ const cpc=model.pcal.click.h70*dist/70; l+=` ≒ ${(adj/cpc).toFixed(1)}目盛り（履歴推定）`; }
    if(sess.sightH) l+=` <span style="font-size:11px;color:var(--sub)">現在 ${esc(sess.sightH)}</span>`;
    out.lines.push({axis:"h", html:l});
  }
  if(!out.lines.length) out.lines.push({axis:"-", html:"グルーピング中心はほぼセンター。<b>サイト調整は不要</b>です 👏"});
  return out;
}
function summarySightDialHtml(sess, adv){
  if(!adv || !adv.st) return "";
  const st=adv.st;
  const span=Math.max(ringW(sess.faceD,sess.faceType)*2.4, st.rr*1.4, 6);
  const dx=clamp(st.mx/span,-1,1)*36;
  const dy=clamp(-st.my/span,-1,1)*36;
  const move=adv.lines.some(l=>l.axis!=="-");
  const label=`${cmOffsetText(st.mx,"x")} / ${cmOffsetText(st.my,"y")}`;
  return `<div class="sightMiniDial">
    <div class="dialGrid">
      <svg viewBox="0 0 110 110" aria-hidden="true">
        <circle class="ring" cx="55" cy="55" r="48"/>
        <circle class="ring" cx="55" cy="55" r="30" style="opacity:.55"/>
        <line class="axis" x1="10" y1="55" x2="100" y2="55"/>
        <line class="axis" x1="55" y1="10" x2="55" y2="100"/>
        <line class="vector" x1="55" y1="55" x2="${(55+dx).toFixed(1)}" y2="${(55+dy).toFixed(1)}"/>
        <circle class="originDot" cx="55" cy="55" r="3.5"/>
        <circle class="groupDot" cx="${(55+dx).toFixed(1)}" cy="${(55+dy).toFixed(1)}" r="7"/>
      </svg>
      <div>
        <b>${move?"中心ズレからサイト方向を読む":"中心はほぼ合っています"}</b>
        <span>緑の点が今回のグルーピング中心です。${label}。信頼度は ${pct(adv.confidence||0)}、外れ値を除いた中心を使っています。</span>
      </div>
    </div>
  </div>`;
}
function windText(sess){
  const parts=[];
  if(sess.wx) parts.push(sess.wx);
  if(sess.windDir) parts.push(sess.windDir);
  if(sess.windSpeed) parts.push(`${sess.windSpeed}m/s`);
  return parts.join(" / ");
}
function isWindy(sess){
  const ws=num(sess&&sess.windSpeed);
  return /風 強/.test(sess&&sess.wx||"") || (ws!=null && ws>=3.5);
}
function judgementFor(adv,sess){
  if(!adv) return null;
  const st=adv.st, w=ringW(sess.faceD,sess.faceType);
  const hasMove=adv.lines.some(l=>l.axis!=="-");
  if(!hasMove) return {label:"維持",tone:"ok",text:"サイトは触らず、この基準で本数を重ねて確認できます。"};
  if(adv.personal && adv.personal.state==="今回だけの可能性" && (adv.personal.stability||0)>.45) return {label:"保留",tone:"hold",text:"過去の同条件傾向と今回の中心が逆方向です。まず追加エンドで再現性を確認します。"};
  if(st.n<6 || (adv.confidence||0)<.45) return {label:"保留",tone:"hold",text:"まだ判断材料が少ないため、同じ狙いで1〜2エンド追加してから動かすのが安全です。"};
  if(st.rr>w*2.8) return {label:"射形優先",tone:"warn",text:"中心は読めますが散りが大きめです。サイト調整は半分以下に抑え、リリース・押し手・照準の再現性を先に見ます。"};
  if(isWindy(sess) && st.sx>st.sy*1.15) return {label:"風を考慮",tone:"hold",text:"横方向の偏りに風の影響が混ざりやすい状況です。無風または風待ちで再確認すると精度が上がります。"};
  if(adv.personal && adv.personal.state==="過去と一致" && (adv.confidence||0)>=.62) return {label:"動かす",tone:"ok",text:"今回の中心と過去の同条件傾向が一致しています。提案量を目安に動かす根拠があります。"};
  if((adv.confidence||0)>=.72 && st.rr<=w*2.2) return {label:"動かす",tone:"ok",text:"グルーピング中心と信頼度が揃っています。提案量を目安にサイトを動かす価値があります。"};
  return {label:"少量調整",tone:"mid",text:"傾向は見えています。提案量の半分〜7割程度で様子を見るのが現実的です。"};
}
function judgementHtml(adv,sess){
  const j=judgementFor(adv,sess);
  if(!j) return "";
  const color=j.tone==="ok"?"#0f9d58":j.tone==="warn"?"#c62828":"#8a6d1d";
  return `<div class="note" style="margin-top:6px"><b style="color:${color}">判断: ${j.label}</b> — ${esc(j.text)}</div>`;
}
function summaryDecisionHtml(adv,sess){
  const j=judgementFor(adv,sess);
  if(!j) return "";
  const tone=j.tone==="ok"?"ok":j.tone==="warn"?"warn":"hold";
  const move=adv && adv.lines ? adv.lines.filter(l=>l.axis!=="-").length : 0;
  const reason=move
    ? "方向と量は下に出ます。先に、動かす根拠が十分かを確認します。"
    : "動かさない理由を先に見て、同じ条件で本数を重ねます。";
  return `<div class="decisionCard ${tone}">
    <div class="k">動かすべきか</div>
    <span class="decisionQuestion">サイトを触る前の判断</span>
    <b>${esc(j.label)}</b>
    <p>${esc(j.text)}</p>
    <span>${reason}</span>
  </div>`;
}
function conditionInsights(sess,st,setup){
  const out=[];
  const wind=windText(sess);
  if(wind) out.push(`条件メモ: ${esc(wind)}${sess.note?` / ${esc(sess.note)}`:""}`);
  if(setup && (setup.tuningMethod||setup.tuningResult)){
    out.push(`チューニング記録: ${esc([setup.tuningMethod,setup.tuningResult].filter(Boolean).join(" / "))}`);
  }
  if(st){
    const wm=windModel(sess||{});
    if(wm.speed){
      const traj=trajectoryModel(sess,setup||{},db.settings.eyeSight||850);
      const pc=personalPhysicsCalibration(setup&&setup.id);
      const wf=pc&&pc.wind.sample?pc.wind.factor:1;
      out.push(`風の物理推定: ${wm.label} ${wm.speed.toFixed(1)}m/sで、横流れは${windDriftText(traj.windDriftCm*wf)}前後（±${traj.windUncertaintyCm.toFixed(1)}cm${wf!==1?` / 個人係数${wf.toFixed(2)}倍`:""}）として扱います。`);
    }
    if(isWindy(sess) && Math.abs(st.mx)>ringW(sess.faceD,sess.faceType)*.35) out.push("風のある回なので、左右ズレはサイトだけでなく風待ち・エイミング時間も一緒に記録してください。");
    if(st.sy>st.sx*1.35) out.push("次の重点: 上下の再現性。引き尺、アンカーの高さ、リリース圧の変化を1項目ずつ確認。");
    else if(st.sx>st.sy*1.35) out.push("次の重点: 左右の再現性。風、ボウハンド、プランジャー、センターショットの順に切り分け。");
    else if(st.rr<ringW(sess.faceD,sess.faceType)*1.2) out.push("次の重点: グルーピングは良好。中心ズレだけを小さく補正し、同じ条件で再確認。");
    if(setup && !setup.arrowSpeed) out.push("精度向上: 実測初速を入れると、上下サイトのmm換算と距離別予測が安定します。");
    if(setup && !setup.shaftSetWeightSpread) out.push("精度向上: 矢セット重量差を入れると、上下散りの信頼度判定が強くなります。");
    const sp=setup?spineGuidance(setup):null;
    if(sp && sp.ready && (sp.state==="柔らかめ寄り" || sp.state==="硬め寄り")) out.push(`用具確認: スパインが${sp.state}です。候補 ${sp.candidates.slice(0,3).join(" / ")} と矢飛びを比較してください。`);
  }
  if(sess.round && sess.round!=="free") out.push(`ラウンド: ${roundLabel(sess.round)} の途中/結果として扱っています。`);
  return out;
}
function conditionHtml(sess,st,setup){
  const notes=conditionInsights(sess,st,setup).slice(0,4);
  return notes.length?`<div class="advice" style="background:var(--card);border-color:var(--line)">${notes.map(n=>`<div class="note">・${n}</div>`).join("")}</div>`:"";
}
const SESSION_METRIC_CACHE=new Map();
function sessionMetricSignature(sess){
  const ends=(sess&&sess.ends)||[];
  let n=0,total=0,last="";
  ends.forEach((end,ei)=>end.forEach((a,ai)=>{
    n++; total+=a.s||0;
    if(ei===ends.length-1 && ai===end.length-1) last=[a.x,a.y,a.s,a.X?1:0,a.spot==null?"":a.spot].join(":");
  }));
  return [sess&&sess.id||"",sess&&sess.date||"",sess&&sess.dist||"",sess&&sess.faceD||"",sess&&sess.faceType||"single",ends.length,n,total,last].join("|");
}
function sessionMetrics(sess){
  const sig=sessionMetricSignature(sess||{});
  const cached=SESSION_METRIC_CACHE.get(sig);
  if(cached) return cached;
  const all=(sess.ends||[]).flat();
  const total=all.reduce((a,x)=>a+x.s,0);
  const st=robustStats(all);
  const metrics={all,total,avg:all.length?total/all.length:0,st};
  SESSION_METRIC_CACHE.set(sig,metrics);
  if(SESSION_METRIC_CACHE.size>240) SESSION_METRIC_CACHE.delete(SESSION_METRIC_CACHE.keys().next().value);
  return metrics;
}
function sessionQuality(sess, setup, st){
  const m=sessionMetrics(sess);
  st=st||m.st;
  if(!st) return {score:.2,label:"低",tone:"warn",reasons:["矢数が不足"],metrics:m};
  const w=ringW(sess.faceD,sess.faceType);
  const sample=clamp((m.all.length-3)/33,0,1);
  const group=clamp(1-st.rr/(w*3.2),0,1);
  const confidence=st.confidence||.45;
  const outRate=m.all.length?st.excluded.length/m.all.length:0;
  let score=confidence*.52 + sample*.18 + group*.22 + (m.all.length>=6?.08:0);
  const reasons=[];
  if(isWindy(sess)){ score*=.86; reasons.push("風の影響あり"); }
  if(outRate>.18){ score*=.86; reasons.push("外れ値が多め"); }
  if(st.rr>w*2.6){ score*=.82; reasons.push("グルーピング広め"); }
  if(m.all.length<6) reasons.push("本数少なめ");
  if(setup){
    const gp=gearPrecisionProfile(setup);
    if(gp.score<.45){ score*=.94; reasons.push("用具入力が少なめ"); }
  }
  score=clamp(score,.12,1);
  const label=score>=.72?"高":score>=.48?"中":"低";
  const tone=score>=.72?"ok":score>=.48?"mid":"warn";
  if(!reasons.length) reasons.push("判断材料は良好");
  return {score,label,tone,reasons,metrics:m};
}
function dirAlign(ax,ay,bx,by){
  const am=Math.hypot(ax,ay), bm=Math.hypot(bx,by);
  if(am<.01||bm<.01) return 0;
  return clamp((ax*bx+ay*by)/(am*bm),-1,1);
}
function personalModel(sess,setup,currentSt){
  if(!sess || !currentSt) return null;
  const same=db.sessions.filter(s=>s.id!==sess.id && (s.setupId||"")==(sess.setupId||"") && s.dist===sess.dist && s.faceD===sess.faceD && (s.faceType||"single")===(sess.faceType||"single"))
    .sort((a,b)=>(a.date||"").localeCompare(b.date||"")||(a.id>b.id?1:-1))
    .slice(-10);
  const items=same.map(s=>{
    const q=sessionQuality(s,setup);
    return q.metrics.st?{sess:s,q,st:q.metrics.st}:null;
  }).filter(Boolean);
  if(items.length<2) return {sample:items.length,state:"データ蓄積中",text:"同条件データがまだ少ないため、今回の記録を個人モデルの材料として蓄積します。"};
  let sw=0,mx=0,my=0,rr=0,avg=0;
  items.forEach((it,i)=>{
    const recency=.72 + (i+1)/items.length*.28;
    const w=Math.max(.08,it.q.score)*recency;
    sw+=w; mx+=it.st.mx*w; my+=it.st.my*w; rr+=it.st.rr*w; avg+=it.q.metrics.avg*w;
  });
  mx/=sw; my/=sw; rr/=sw; avg/=sw;
  const centers=items.map(it=>({x:it.st.mx,y:it.st.my}));
  const spread=groupStats(centers);
  const ring=ringW(sess.faceD,sess.faceType);
  const histMag=Math.hypot(mx,my), curMag=Math.hypot(currentSt.mx,currentSt.my);
  const align=dirAlign(mx,my,currentSt.mx,currentSt.my);
  const stability=spread?clamp(1-spread.rr/(ring*2.4),0,1):.5;
  const support=histMag>ring*.28 && curMag>ring*.28 && align>.42;
  const conflict=histMag>ring*.28 && curMag>ring*.28 && align<-.25;
  const state=support?"過去と一致":conflict?"今回だけの可能性":"観察継続";
  let text;
  if(support) text="過去の同条件でも同じ方向へ寄る傾向があります。サイト調整の根拠が強くなります。";
  else if(conflict) text="過去の偏りと今回の中心が逆方向です。風や射形の一時要因を疑い、追加エンドで確認する価値があります。";
  else text="過去傾向はまだ決定的ではありません。今回の中心とグルーピング形状を主材料にします。";
  return {sample:items.length,state,text,mx,my,rr,avg,align,stability,spread,histMag,curMag};
}
function personalModelHtml(adv,sess,setup){
  if(!adv || !adv.personal) return "";
  const p=adv.personal;
  const tone=p.state==="過去と一致"?"#0f9d58":p.state==="今回だけの可能性"?"#c62828":"#8a6d1d";
  if(p.sample<2) return `<div class="advice" style="background:var(--card);border-color:var(--line)"><div class="note"><b>個人モデル: データ蓄積中</b> — ${esc(p.text)}</div></div>`;
  return `<div class="advice" style="background:var(--card);border-color:var(--line)">
    <div class="note"><b style="color:${tone}">個人モデル: ${p.state}</b> — ${esc(p.text)}</div>
    <div class="kv"><span>過去の加重中心</span><span>${cmOffsetText(p.mx,"x")} / ${cmOffsetText(p.my,"y")}</span></div>
    <div class="kv"><span>同条件データ</span><span>${p.sample}回 / 安定度 ${pct(p.stability)}</span></div>
  </div>`;
}
function trustHtml(sess,setup,st){
  const q=sessionQuality(sess,setup,st);
  const color=q.tone==="ok"?"#0f9d58":q.tone==="warn"?"#c62828":"#8a6d1d";
  return `<div class="kv"><span>判断信頼度</span><span><b style="color:${color}">${q.label}</b>（${pct(q.score)} / ${q.reasons.map(esc).join("・")}）</span></div>`;
}
function nextActionPlan(sess,adv,setup){
  const plan=[];
  const q=sessionQuality(sess,setup,adv&&adv.st);
  const j=judgementFor(adv,sess);
  if(!adv){ return ["6本以上を記録して、中心とばらつきを出す。"]; }
  if(j && j.label==="動かす") plan.push("提案方向へサイトを動かし、次の1エンドは同じ狙い方で確認する。");
  else if(j && j.label==="少量調整") plan.push("提案量の半分〜7割だけ動かし、中心が戻るか確認する。");
  else if(j && (j.label==="保留" || j.label==="風を考慮")) plan.push("サイトは触らず、同条件で1〜2エンド追加して中心が再現するか見る。");
  else if(j && j.label==="射形優先") plan.push("サイト調整は控えめにして、リリース・押し手・照準時間の再現性を先に整える。");
  if(adv.personal && adv.personal.state==="今回だけの可能性") plan.push("過去傾向と逆なので、風向/射形メモを残して次回の同距離データと比較する。");
  if(adv.personal && adv.personal.state==="過去と一致") plan.push("調整後の中心が過去平均との差から縮むかを、履歴フィルタで同条件比較する。");
  if(q.score<.48) plan.push("この回は信頼度が低め。判断材料として残しつつ、強い結論は次回へ送る。");
  const st=adv.st;
  if(st.sy>st.sx*1.35) plan.push("上下散りが強いので、アンカー高・引き尺・リリース圧を1項目ずつ固定して確認する。");
  else if(st.sx>st.sy*1.35) plan.push("左右散りが強いので、風待ち・ボウハンド・プランジャーの順で切り分ける。");
  if(setup){
    const gp=gearPrecisionProfile(setup);
    if(gp.missing.length) plan.push(`精度を上げる追加データ: ${esc(gp.missing.slice(0,2).join("・"))}`);
  }
  return plan.slice(0,4);
}
function nextActionHtml(sess,adv,setup){
  const plan=nextActionPlan(sess,adv,setup);
  return plan.length?`<div class="advice" style="background:var(--card);border-color:var(--line)"><div class="note"><b>次のアクション</b></div>${plan.map((p,i)=>`<div class="note">${i+1}. ${p}</div>`).join("")}</div>`:"";
}
function roundProgressHtml(sess){
  const r=ROUND_TYPES.find(x=>x.id===sess.round);
  if(!r || !r.arrows) return "";
  const all=sess.ends.flat(), total=all.reduce((a,x)=>a+x.s,0);
  const shot=all.length, remain=Math.max(0,r.arrows-shot);
  const pace=shot?total/shot*r.arrows:0;
  return `<div class="kv"><span>ラウンド進捗</span><span>${roundLabel(sess.round)} / ${shot}/${r.arrows}射 / 現在${total}点${shot&&remain?` / 予測${pace.toFixed(0)}点`:""}</span></div>`;
}
function sessionsCsv(){
  const head=["date","setup","distance_m","round","face","arrows","total","avg","x_or_5plus","ten_or_6","group_x_cm","group_y_cm","group_rms_cm","sigma_x_cm","sigma_y_cm","confidence","decision_quality","personal_model","excluded","sight_v","sight_h","condition","note"];
  const rows=[head];
  db.sessions.forEach(s=>{
    const all=s.ends.flat(), st=robustStats(all), total=all.reduce((a,x)=>a+x.s,0), setup=db.setups.find(x=>x.id===s.setupId);
    const q=sessionQuality(s,setup,st);
    const p=personalModel(s,setup,st);
    rows.push([s.date,setup?setup.name:"",s.dist,roundLabel(s.round),faceLabel(s),all.length,total,all.length?(total/all.length).toFixed(3):"",
      secondaryScoreCount(all,s),perfectScoreCount(all,s),st?st.mx.toFixed(2):"",st?st.my.toFixed(2):"",st?st.rr.toFixed(2):"",
      st?st.sx.toFixed(2):"",st?st.sy.toFixed(2):"",st?pct(st.confidence||0):"",q.label,p?p.state:"",st?st.excluded.length:"",
      s.sightV||"",s.sightH||"",windText(s),s.note||""]);
  });
  return "\ufeff"+rows.map(r=>r.map(csvCell).join(",")).join("\n");
}
function exportSessionsCsv(){
  shareOrDownloadText(`archery-note-sessions-${today()}.csv`,sessionsCsv(),"text/csv;charset=utf-8","Archery Note CSV");
  db.settings.lastBackupAt=new Date().toISOString();
  save("csv-export");
}
function scorecardSvg(sess){
  const all=sess.ends.flat(), total=all.reduce((a,x)=>a+x.s,0), setup=db.setups.find(x=>x.id===sess.setupId);
  const rows=sess.ends.map((end,i)=>({i:i+1, scores:end.map(scoreLabel).join("  "), sum:end.reduce((a,x)=>a+x.s,0)}));
  const h=210+rows.length*34;
  const title=`${fmtD(sess.date)} ${sess.dist}m ${roundLabel(sess.round)}`;
  const bg="#f7f8f4", ink="#1c1e1c", green="#1a5c3a";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${h}" viewBox="0 0 900 ${h}">
  <rect width="900" height="${h}" fill="${bg}"/>
  <text x="48" y="62" font-family="sans-serif" font-size="34" font-weight="700" fill="${green}">Archery Note Scorecard</text>
  <text x="48" y="102" font-family="sans-serif" font-size="22" fill="${ink}">${esc(title)}</text>
  <text x="48" y="134" font-family="sans-serif" font-size="18" fill="#667064">${esc(setup?setup.name:"セッティング未指定")} / ${esc(faceLabel(sess))} / ${all.length}射</text>
  <text x="650" y="92" font-family="sans-serif" font-size="48" font-weight="800" fill="${green}" text-anchor="end">${total}</text>
  <text x="666" y="92" font-family="sans-serif" font-size="18" fill="#667064">点</text>
  <text x="650" y="124" font-family="sans-serif" font-size="18" fill="#667064" text-anchor="end">平均 ${all.length?(total/all.length).toFixed(2):"-"} / ${esc(secondaryScoreLabel(sess))} ${secondaryScoreCount(all,sess)}</text>
  <rect x="48" y="160" width="804" height="34" rx="6" fill="#dde7dc"/>
  <text x="70" y="183" font-family="sans-serif" font-size="15" font-weight="700" fill="${ink}">End</text>
  <text x="150" y="183" font-family="sans-serif" font-size="15" font-weight="700" fill="${ink}">Scores</text>
  <text x="808" y="183" font-family="sans-serif" font-size="15" font-weight="700" fill="${ink}" text-anchor="end">Sum</text>
  ${rows.map((r,i)=>`<g transform="translate(0 ${202+i*34})">
    <rect x="48" y="0" width="804" height="28" rx="5" fill="${i%2?"#ffffff":"#eef1ec"}"/>
    <text x="78" y="20" font-family="sans-serif" font-size="17" fill="${ink}" text-anchor="middle">${r.i}</text>
    <text x="150" y="20" font-family="sans-serif" font-size="17" fill="${ink}">${esc(r.scores)}</text>
    <text x="808" y="20" font-family="sans-serif" font-size="17" font-weight="700" fill="${green}" text-anchor="end">${r.sum}</text>
  </g>`).join("")}
  ${sess.note||windText(sess)?`<text x="48" y="${h-32}" font-family="sans-serif" font-size="16" fill="#667064">${esc([windText(sess),sess.note].filter(Boolean).join(" / "))}</text>`:""}
</svg>`;
}
function exportScorecardImage(sess){
  shareOrDownloadText(`archery-scorecard-${sess.date||today()}-${sess.dist}m.svg`,scorecardSvg(sess),"image/svg+xml;charset=utf-8","Archery Note Scorecard");
}
function backupReminderHtml(){
  if(db.sessions.length<3) return "";
  const t=db.settings.lastBackupAt?Date.parse(db.settings.lastBackupAt):0;
  const days=t?Math.floor((Date.now()-t)/(24*60*60*1000)):999;
  if(days<30) return `<div class="hint">最終バックアップ/CSV出力: ${new Date(t).toLocaleDateString()}。月1回の保存ペースは良好です。</div>`;
  return `<div class="advice" style="background:var(--card);border-color:var(--line)"><div class="note"><b>バックアップ推奨</b> — 練習記録が${db.sessions.length}回あります。端末トラブルに備えて、JSONバックアップを保存しておくと安心です。</div></div>`;
}
function trashSettingsHtml(){
  const items=(db.trash||[]).slice(0,8);
  if(!items.length) return `<h3 style="margin-top:18px;font-size:14px">ゴミ箱</h3><div class="empty">削除したデータはありません。</div>`;
  return `<h3 style="margin-top:18px;font-size:14px">ゴミ箱 <span style="font-size:11px;color:var(--sub)">最新${items.length}/${(db.trash||[]).length}件</span></h3>
    <table class="tbl"><tr><th>種類</th><th>内容</th><th>削除日</th><th></th></tr>
    ${items.map(it=>`<tr><td>${trashTypeLabel(it.type)}</td><td>${esc(it.label)}</td><td>${fmtD(it.date)}</td><td class="right"><button class="btn sm ghost" data-restore-trash="${it.id}" style="padding:4px 8px">復元</button></td></tr>`).join("")}</table>
    <div class="btnrow"><button class="btn danger" id="trashClear">ゴミ箱を空にする</button></div>`;
}
function regress(pts){
  const n=pts.length; if(n<2) return null;
  const xb=pts.reduce((a,p)=>a+p[0],0)/n, yb=pts.reduce((a,p)=>a+p[1],0)/n;
  let vx=0,cv=0; pts.forEach(p=>{vx+=(p[0]-xb)**2; cv+=(p[0]-xb)*(p[1]-yb);});
  if(vx<1e-9) return null;
  const b=cv/vx, a=yb-b*xb;
  let ss=0,se=0; pts.forEach(p=>{ ss+=(p[1]-yb)**2; se+=(p[1]-(a+b*p[0]))**2; });
  return {a,b,zero: Math.abs(b)>1e-9? -a/b : null,r2:ss>1e-9?clamp(1-se/ss,0,1):0,kind:"linear",est:d=>a+b*d};
}
function robustLine(pts){
  if(pts.length<2) return null;
  const slopes=[];
  for(let i=0;i<pts.length;i++) for(let j=i+1;j<pts.length;j++){
    const dx=pts[j][0]-pts[i][0];
    if(Math.abs(dx)>1e-9) slopes.push((pts[j][1]-pts[i][1])/dx);
  }
  if(!slopes.length) return null;
  const b=median(slopes);
  const a=median(pts.map(p=>p[1]-b*p[0]));
  const yb=pts.reduce((s,p)=>s+p[1],0)/pts.length;
  let ss=0,se=0; pts.forEach(p=>{ ss+=(p[1]-yb)**2; se+=(p[1]-(a+b*p[0]))**2; });
  return {a,b,zero:Math.abs(b)>1e-9?-a/b:null,r2:ss>1e-9?clamp(1-se/ss,0,1):0};
}
function weightedLineFit(pts){
  const clean=pts.map(p=>({x:+p[0],y:+p[1],w:clamp(+p[2]||1,.02,2)}))
    .filter(p=>isFinite(p.x)&&isFinite(p.y)&&isFinite(p.w)&&p.w>0);
  if(clean.length<2) return null;
  const sw=clean.reduce((a,p)=>a+p.w,0);
  const xb=clean.reduce((a,p)=>a+p.x*p.w,0)/sw;
  const yb=clean.reduce((a,p)=>a+p.y*p.w,0)/sw;
  let vx=0,cv=0;
  clean.forEach(p=>{ vx+=(p.x-xb)*(p.x-xb)*p.w; cv+=(p.x-xb)*(p.y-yb)*p.w; });
  if(Math.abs(vx)<1e-9) return null;
  const b=cv/vx, a=yb-b*xb;
  let ss=0,se=0;
  clean.forEach(p=>{ const e=a+b*p.x; ss+=(p.y-yb)*(p.y-yb)*p.w; se+=(p.y-e)*(p.y-e)*p.w; });
  const scatter=Math.sqrt(Math.max(0,se/sw));
  return {a,b,zero:Math.abs(b)>1e-9?-a/b:null,r2:ss>1e-9?clamp(1-se/ss,0,1):0,n:clean.length,weight:sw,scatter,kind:"weighted"};
}
function robustWeightedLine(pts){
  if(pts.length<2) return null;
  const base=robustLine(pts.map(p=>[p[0],p[1]]));
  if(!base) return null;
  const residuals=pts.map(p=>p[1]-(base.a+base.b*p[0]));
  const center=median(residuals);
  const scale=Math.max(1.4826*median(residuals.map(r=>Math.abs(r-center))), .05);
  const weighted=pts.map((p,i)=>{
    const u=Math.abs(residuals[i]-center)/(scale*2.5);
    const rw=u>=1?.08:(1-u*u)**2;
    return [p[0],p[1],(+p[2]||1)*rw];
  });
  const fit=weightedLineFit(weighted);
  if(!fit || fit.zero==null || !isFinite(fit.zero)) return null;
  const avgW=fit.weight/Math.max(1,fit.n);
  fit.kind="weighted-robust";
  fit.quality=clamp((fit.r2||0)*.5 + clamp((fit.n-1)/5,0,1)*.28 + clamp(avgW,.1,1)*.22,0,1);
  fit.base=base;
  return fit;
}
function solve3(A,b){
  const m=A.map((r,i)=>[...r,b[i]]);
  for(let c=0;c<3;c++){
    let piv=c; for(let r=c+1;r<3;r++) if(Math.abs(m[r][c])>Math.abs(m[piv][c])) piv=r;
    if(Math.abs(m[piv][c])<1e-9) return null;
    [m[c],m[piv]]=[m[piv],m[c]];
    const div=m[c][c]; for(let k=c;k<4;k++) m[c][k]/=div;
    for(let r=0;r<3;r++) if(r!==c){ const f=m[r][c]; for(let k=c;k<4;k++) m[r][k]-=f*m[c][k]; }
  }
  return [m[0][3],m[1][3],m[2][3]];
}
function quadraticFit(pts){
  if(pts.length<4) return null;
  const sx=[0,0,0,0,0], sy=[0,0,0];
  pts.forEach(([x,y])=>{ let p=1; for(let i=0;i<5;i++){ sx[i]+=p; p*=x; } sy[0]+=y; sy[1]+=x*y; sy[2]+=x*x*y; });
  const coef=solve3([[sx[0],sx[1],sx[2]],[sx[1],sx[2],sx[3]],[sx[2],sx[3],sx[4]]],sy);
  if(!coef) return null;
  const [a,b,c]=coef, yb=pts.reduce((s,p)=>s+p[1],0)/pts.length;
  let ss=0,se=0; pts.forEach(([x,y])=>{ const e=a+b*x+c*x*x; ss+=(y-yb)**2; se+=(y-e)**2; });
  return {a,b,c,kind:"curve",r2:ss>1e-9?clamp(1-se/ss,0,1):0,est:d=>a+b*d+c*d*d};
}
/* setup+distance のセッション群から「ズレ0になるサイト値」を回帰推定 */
function regressionAdvice(setupId, dist){
  const setup=db.setups.find(s=>s.id===setupId);
  const ss=db.sessions.filter(s=>s.setupId===setupId && s.dist===dist)
    .sort((a,b)=>(a.date||"").localeCompare(b.date||"")||(a.id>b.id?1:-1));
  const res={};
  [["sightV","my","v"],["sightH","mx","h"]].forEach(([key,axis,tag])=>{
    const pts=[];
    ss.forEach((s,i)=>{
      const v=parseFloat(s[key]); const st=robustStats(s.ends.flat());
      if(isFinite(v) && st && st.n>=6){
        const q=sessionQuality(s,setup,st);
        const recency=.72 + (i+1)/Math.max(1,ss.length)*.28;
        const sample=clamp((st.n-4)/14,.55,1);
        const windFactor=isWindy(s)?.82:1;
        const w=clamp(q.score*sample*recency*windFactor,.06,1);
        pts.push([v, st[axis], w]);
      }
    });
    const uniq=new Set(pts.map(p=>p[0]));
    if(pts.length>=2 && uniq.size>=2){
      const r=robustWeightedLine(pts) || robustLine(pts);
      if(r && r.zero!=null && isFinite(r.zero)){
        res[tag]={zero:r.zero, n:pts.length, r2:r.r2, slope:r.b, quality:r.quality||r.r2||0, scatter:r.scatter||0, model:r.kind||"robust"};
      }
    }
  });
  return res;
}
/* セッティングの実測サイト値（上下）から距離→サイト値を直線近似 */
function sightInterp(setupId){
  const byDist={};
  [...db.sightMarks].filter(m=>m.setupId===setupId)
    .sort((a,b)=>(a.date||"").localeCompare(b.date||"")||(a.ts||0)-(b.ts||0))
    .forEach(m=>{ const v=parseFloat(m.v); if(isFinite(v)) byDist[m.dist]=v; });
  const pts=Object.keys(byDist).map(d=>[+d, byDist[d]]).sort((a,b)=>a[0]-b[0]);
  if(pts.length<2) return null;
  const line=regress(pts);
  if(!line) return null;
  const curve=quadraticFit(pts);
  const model=(curve && curve.r2>line.r2+.04)?curve:line;
  return {pts, have:pts.map(p=>p[0]), model:model.kind, r2:model.r2, est:model.est};
}
function calibrationProfile(setupId){
  const setup=db.setups.find(x=>x.id===setupId)||{};
  const dists=new Set(db.sightMarks.filter(m=>m.setupId===setupId && isFinite(parseFloat(m.v))).map(m=>m.dist));
  const sess=db.sessions.filter(s=>s.setupId===setupId);
  const withSight=sess.filter(s=>isFinite(parseFloat(s.sightV))||isFinite(parseFloat(s.sightH))).length;
  const rich=gearPrecisionProfile(setup);
  const score=clamp(dists.size*.12 + Math.min(withSight,10)*.035 + rich.score*.32 + (String(setup.arrowSpeed||"").trim()?0.14:0),0,1);
  const level=levelFromScore(score, LEVELS.calibration);
  const next=[];
  if(dists.size<3) next.push("異なる距離のサイト値");
  if(withSight<5) next.push("練習開始時のサイト値");
  if(!setup.arrowSpeed) next.push("実測初速");
  if(rich.score<.65) next.push("矢重量/FOC/ベイン");
  return {score,level,dists:dists.size,withSight,gearLevel:rich.level,next};
}
function modelReadinessProfile(setupId){
  const setup=db.setups.find(x=>x.id===setupId)||{};
  const sess=db.sessions.filter(s=>s.setupId===setupId);
  const usable=sess.map(s=>({s,q:sessionQuality(s,setup)}))
    .filter(x=>x.q.metrics.st && x.q.metrics.st.n>=6);
  const good=usable.filter(x=>x.q.score>=.48);
  const byKey={};
  good.forEach(x=>{
    const s=x.s;
    const k=[s.dist,s.faceD,s.faceType||"single"].join("|");
    (byKey[k]=byKey[k]||[]).push(x);
  });
  const repeatGroups=Object.values(byKey).filter(g=>g.length>=2).length;
  const withSight=sess.filter(s=>isFinite(parseFloat(s.sightV))||isFinite(parseFloat(s.sightH))).length;
  const sightDists=new Set(db.sightMarks.filter(m=>m.setupId===setupId && isFinite(parseFloat(m.v))).map(m=>m.dist)).size;
  const gp=gearPrecisionProfile(setup);
  const score=clamp(good.length*.035 + repeatGroups*.13 + Math.min(withSight,10)*.035 + sightDists*.06 + gp.score*.24,0,1);
  const level=levelFromScore(score, LEVELS.data);
  const next=[];
  if(good.length<5) next.push("6本以上の練習記録");
  if(repeatGroups<2) next.push("同じ距離/的での反復");
  if(withSight<4) next.push("練習開始時のサイト値");
  if(sightDists<3) next.push("複数距離のサイト台帳");
  if(gp.score<.65) next.push("矢重量・矢径・実測初速");
  return {score,level,total:sess.length,usable:usable.length,good:good.length,repeatGroups,withSight,sightDists,gearLevel:gp.level,next};
}
function modelReadinessHtml(setupId){
  if(!setupId) return "";
  const p=modelReadinessProfile(setupId);
  return `<div class="advice" style="background:var(--card);border-color:var(--line)">
    <div class="note"><b>個人データ準備度: ${p.level}</b>（${pct(p.score)}）</div>
    <div class="kv"><span>使える練習</span><span>${p.good}回 / 同条件反復 ${p.repeatGroups}組</span></div>
    <div class="kv"><span>サイト校正材料</span><span>サイト値つき練習 ${p.withSight}回 / 台帳 ${p.sightDists}距離</span></div>
    ${p.next.length?`<div class="note">次に効くデータ: ${esc(p.next.slice(0,3).join("・"))}</div>`:`<div class="note">履歴・サイト値・用具入力の土台がかなり揃っています。</div>`}
  </div>`;
}
function latestMark(setupId, dist){
  const ms=db.sightMarks.filter(m=>m.setupId===setupId && m.dist===dist).sort((a,b)=>(b.date||"").localeCompare(a.date||"")||(b.ts||0)-(a.ts||0));
  return ms[0]||null;
}
