"use strict";
/* Archery Note: gear, settings, and setup flows */
const CATALOG_SHAFTS=[
  {id:"x10-protour",name:"EASTON X10 ProTour",aliases:["X10 PROTOUR","X10 PRO TOUR","PROTOUR"],type:"carbon",dia:5.0,gpiA:4.7,gpiB:1600,sizes:[770,720,670,620,570,520,470,420,380,340],gpi:{770:6.0,720:6.2,670:6.5,620:6.7,570:6.9,520:7.3,470:7.6,420:8.0,380:8.4,340:8.8},odIn:{770:.181,720:.183,670:.186,620:.188,570:.191,520:.194,470:.198,420:.202,380:.207,340:.213}},
  {id:"x10",name:"EASTON X10",aliases:["X10"],type:"carbon",dia:5.5,gpiA:3.8,gpiB:1950,sizes:[1000,900,830,750,700,650,600,550,500,450,410,380,350,325],gpi:{1000:5.3,900:5.8,830:6.2,750:6.4,700:6.7,650:6.8,600:7.0,550:7.5,500:7.8,450:8.1,410:8.5,380:8.9,350:8.8,325:9.2},odIn:{1000:.182,900:.185,830:.188,750:.191,700:.194,650:.197,600:.200,550:.203,500:.206,450:.209,410:.212,380:.215,350:.218,325:.221}},
  {id:"x10-32",name:"EASTON X10 3.2mm Parallel Pro",aliases:["X10 3.2","3.2MM PARALLEL PRO"],type:"carbon",dia:3.2,gpiA:3.4,gpiB:2200,sizes:[1000,900,800,750,700,650,600,550,500,460,420,380,340]},
  {id:"ace",name:"EASTON A/C/E",aliases:["A/C/E","ACE"],type:"carbon",dia:5.5,gpiA:4.0,gpiB:1450,sizes:[1250,1100,1000,920,850,780,720,670,620,570,520,470,430,400,370]},
  {id:"x10-4",name:"EASTON X10 4mm Parallel Pro",aliases:["X10 4MM","4MM PARALLEL PRO"],type:"carbon",dia:4.0,gpiA:4.4,gpiB:2000,sizes:[1150,1000,880,810,710,660,610,570,520,470,420,380,340,300,250]},
  {id:"superdrive23",name:"EASTON SuperDrive 23",aliases:["SUPERDRIVE 23","SD23"],type:"carbon",dia:9.3,gpiA:7.0,gpiB:900,sizes:[475,375,325]},
  {id:"superdrive-micro",name:"EASTON SuperDrive Micro",aliases:["SUPERDRIVE MICRO"],type:"carbon",dia:4.0,gpiA:4.9,gpiB:1800,sizes:[950,850,750,675,625,575,525,475,425,375,325]},
  {id:"avance",name:"EASTON Avance",aliases:["AVANCE"],type:"carbon",dia:4.2,gpiA:4.1,gpiB:1700,sizes:[2000,1800,1600,1400,1150,1000,900,810,730,660,600,550,500,450,400,340]},
  {id:"avance-sport",name:"EASTON Avance Sport",aliases:["AVANCE SPORT"],type:"carbon",dia:4.2,gpiA:4.4,gpiB:1600,sizes:[2000,1800,1600,1400,1150,1000,900,810,730,660,600,550,500,450,400,340]},
  {id:"vector",name:"EASTON Vector",aliases:["VECTOR"],type:"carbon",dia:5.0,gpiA:3.2,gpiB:1300,sizes:[2000,1800,1600,1400,1200,1000,800,600]},
  {id:"revelation",name:"Black Eagle Revelation",aliases:["REVELATION","BLACK EAGLE"],type:"carbon",dia:5.0,gpiA:5.0,gpiB:1800,sizes:[800,750,700,650,600,550,500,450,400,350,300]},
  {id:"paragon",name:"SKYLON Carbon Paragon",aliases:["PARAGON","SKYLON"],type:"carbon",dia:4.2,gpiA:4.6,gpiB:1800,sizes:[1000,900,850,800,750,700,650,600,550,500,450,400,350]},
  {id:"x23",name:"EASTON X23",aliases:["X23"],type:"aluminum",sizes:[2312,2314,2315,2318]},
  {id:"x7",name:"EASTON X7 Eclipse",aliases:["X7","ECLIPSE"],type:"aluminum",sizes:[1514,1614,1714,1814,1914,2014,2114,2212,2312]},
  {id:"xx75pp",name:"EASTON XX75 Platinum Plus",aliases:["PLATINUM PLUS","XX75"],type:"aluminum",sizes:[1416,1516,1616,1716,1816,1916,2016]},
  {id:"jazz",name:"EASTON XX75 Jazz",aliases:["JAZZ"],type:"aluminum",sizes:[1214,1416,1516,1616,1716,1816,1916]}
];
function normGearText(s){
  return String(s||"").normalize("NFKC").toUpperCase().replace(/[・_/]+/g," ").replace(/\s+/g," ").trim();
}
function aluminumDiaMm(code){ return Math.floor(code/100)/64*25.4; }
function aluminumGpi(code){
  const od=Math.floor(code/100)/64, wall=(code%100)/1000, id=Math.max(0,od-2*wall);
  return (Math.PI/4*(od*od-id*id))*0.0975*7000;
}
function carbonGpi(fam,spine){ return fam.gpi&&fam.gpi[spine]?fam.gpi[spine]:clamp(fam.gpiA+fam.gpiB/spine,3,18); }
function carbonDiaMm(fam,spine){ return fam.odIn&&fam.odIn[spine]?fam.odIn[spine]*25.4:fam.dia; }
function inferCatalogGear(vals){
  const txt=normGearText(vals.arrow);
  if(!txt) return null;
  const fam=[...CATALOG_SHAFTS]
    .sort((a,b)=>Math.max(...b.aliases.map(x=>x.length))-Math.max(...a.aliases.map(x=>x.length)))
    .find(f=>f.aliases.some(a=>new RegExp(`(^|\\s)${normGearText(a).replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}(\\s|$)`).test(txt)));
  if(!fam) return null;
  const spine=num(vals.shaftSpine);
  if(!spine) return {fam,missing:"spine"};
  const listed=!fam.sizes||fam.sizes.includes(spine);
  const dia=fam.type==="aluminum"?aluminumDiaMm(spine):carbonDiaMm(fam,spine);
  const gpi=fam.type==="aluminum"?aluminumGpi(spine):carbonGpi(fam,spine);
  const len=num(vals.arrowLength)||null;
  const point=num(vals.pointWeight)||null;
  const total=len?gpi*len+(point||100)+27:null;
  const gpiSource=fam.type==="aluminum"?"（番手から計算）":fam.gpi&&fam.gpi[spine]?"（メーカー掲載値）":"（モデル別近似）";
  const diaSource=fam.type==="aluminum"?"（番手から計算）":fam.odIn&&fam.odIn[spine]?"（メーカー掲載値）":"（代表値/推定）";
  const notes=[`${fam.name} / 番手 ${spine} をカタログ掲載モデルとして認識`, `シャフト重量 ${gpi.toFixed(2)}gr/in${gpiSource}`, `外径 ${dia.toFixed(2)}mm${diaSource}`];
  if(!listed) notes.push(`注意: 番手 ${spine} はこのモデルの掲載サイズ一覧では未確認のため、重量・外径は近似として扱います`);
  if(total) notes.push(`総矢重量 ${total.toFixed(0)}gr（矢尺${len}in、ポイント${point||100}gr、ノック/ベイン等27grとして推定）`);
  return {fam,spine,dia,gpi,len,point,total,notes};
}
function uniqGear(items){
  const seen=new Set();
  return items.filter(v=>{
    const key=normGearText(v);
    if(!key||seen.has(key)) return false;
    seen.add(key); return true;
  });
}
function shaftSuggestions(){
  const other=[
    "EASTON RX7","EASTON X10 ProTour","EASTON 4MM ML","FIVICS Five-X","FIVICS TENPRO","VICTORY VAP V1","VICTORY VAP V3"
  ];
  return uniqGear([...CATALOG_SHAFTS.map(f=>f.name),...other]);
}
const COMMON_SPINES=[2000,1800,1600,1400,1250,1200,1150,1100,1000,950,920,900,880,850,830,810,800,780,750,730,720,710,700,675,670,660,650,625,620,610,600,575,570,550,525,520,500,475,470,460,450,430,425,420,410,400,380,375,370,350,340,325,300,250,2318,2315,2314,2312,2212,2114,2016,2014,1916,1914,1816,1814,1716,1714,1616,1614,1516,1514,1416,1414,1214];
const GEAR_SUGGESTIONS={
  bow:[
    "HOYT Grand Prix GMX3 2026 H25","HOYT Grand Prix GMX3 2024 H25","HOYT Grand Prix XCEED 2 H25","HOYT Grand Prix XCEED 2 H27","HOYT Grand Prix XCEED","HOYT Formula SR H25","HOYT Formula XD","HOYT RCRV Podium H25","HOYT RCRV Comp H25","HOYT GMX3","HOYT XCEED 2",
    "WIAWIS ATF-EX H25","WIAWIS META LX H25","WIAWIS ATF-DX H25","WIAWIS META DX H25","WIAWIS ATF-X H25","WIAWIS RADICAL PRO H25","WIAWIS CX7 H25","WIAWIS INNO CXT H25","WIAWIS INNO CXT H23","WIN&WIN NEW WINEX 2021 H25","WIN&WIN WIAWIS TFT-G",
    "MK ARCHERY X-ON","MK ARCHERY XG","MK KOREA MK ZX","MK ZX","MK KOREA MK XG",
    "WNS Vantage AX","WNS Motive FX","WNS Explorer DX",
    "KINETIC Vygo V2","KINETIC Novana V2","KINETIC Sovren","KINETIC Zivio V2",
    "FIVICS ONIX PRO","FIVICS VX 25inch","FIVICS VELLATOR 25inch","FIVICS ARGON-X","FIVICS VELLATOR",
    "SAMICK Discovery","SAMICK Polaris","MATHEWS Title","PSE Laser"
  ],
  limbs:[
    "HOYT Grand Prix METRIX Foam Core","HOYT Grand Prix METRIX Wood Core","HOYT Formula METRIX Foam Core","HOYT Formula METRIX Wood Core","HOYT Formula AXIA Foam Core","HOYT Formula AXIA Wood Core","HOYT Grand Prix AXIA Wood Core","HOYT Formula RCRV PODIUM Limbs","HOYT Grand Prix RCRV PODIUM Limbs","HOYT Grand Prix COMP Limbs","HOYT Formula Carbon Integra",
    "WIAWIS NS-G2 Foam Core","WIAWIS NS-G2 Wood Core","WIAWIS NS-XP Wood","WIAWIS NS-XP Foam","WIAWIS NS-XP Wood Core ILF","WIAWIS MXT-XP Wood","WIAWIS MXT-XP Foam","WIAWIS MXT-XT Wood","WIAWIS MXT-XT Foam","WIAWIS CX7 Wood Core","WIAWIS CX7 Foam Core","WIAWIS NS-G Wood Core","WIAWIS NS-G Graphene Foam Core","WIN&WIN NEW WINEX Foam Core",
    "MK XD Limbs","MK KOREA ZEST Limbs","MK KOREA N3 Limbs","MK KOREA X-CORE Limbs",
    "WNS Vantage G7 Limbs","WNS Delta C2 Limbs","WNS Explorer W1 Limbs",
    "KINETIC Vaultage Carbon/Foam Limbs","SAMICK Discovery R1 Limbs","SAMICK Polaris Limbs",
    "FIVICS SKADI Limbs Wood Core","FIVICS ARGON-X Limbs Wood Core"
  ],
  sight:[
    "SHIBUYA ULTIMA RC PRO G2 520 Carbon","SHIBUYA ULTIMA RC IV 520 Carbon","SHIBUYA ULTIMA RC PRO G2 Double Mount","SHIBUYA ULTIMA RC PRO 520 Carbon","SHIBUYA Dual Click","SHIBUYA ULTIMA CP PRO G2","SHIBUYA OKULUS Scope",
    "AXCEL Achieve XP Recurve","AXCEL Curve RX Pro","AXCEL Achieve XP Pro Compound","AXCEL AVX",
    "WIAWIS WS700","FIVICS FV-300","FIVICS FV-150","AVALON Tec One","CARTEL Focus K","CARTEL Midas RX-10","CARTEL Midas 105","CARTEL RX-103"
  ],
  rest:[
    "SHIBUYA Ultima Recurve Rest","SHIBUYA Magnetic Rest","AAE Free Flyte Elite","Spigarelli Z/T","Hoyt Super Rest","Beiter Rest","WIAWIS S-RV"
  ],
  plunger:[
    "SHIBUYA DX Plunger","SHIBUYA Ultima Plunger","Beiter Plunger","WIAWIS ACS Plunger","FIVICS Cushion Plunger","AAE Gold Plunger"
  ],
  nock:[
    "EASTON G Nock","EASTON Pin Nock","EASTON Super Nock","Beiter Pin Nock","Beiter In-Out Nock","FIVICS Pin Nock","Bohning F Nock"
  ],
  string:[
    "BCY 8125","BCY 8190","BCY 652 Spectra","Angel Majesty 777","Fast Flight Plus","GAS Bowstrings Recurve",
    "GAS Bowstrings High Octane","GAS Bowstrings Ghost XV","FirstString X-IT Wire","FirstString Premium Custom String","ARICO STRING BCY Spectra 652","ARICO STRING Angel Majesty 777"
  ],
  stabilizer:[
    "SHIBUYA VERSA","SHIBUYA PRIMUS","SHIBUYA Vanquish","SHIBUYA Vanquish PRO","EASTON Contour CS","EASTON Halcyon","EASTON Z-Comp","WIAWIS ACS EL","WIAWIS ACS LX","WIAWIS ACS15","WIAWIS S21","WNS SAT","AXCEL TriLock","AVALON Tec One",
    "SHREWD Index","SHREWD RevX","SHREWD Revel","RAMRODS VEKTOR","RAMRODS Ultra V4","RAMRODS BEAST","CONQUEST SmacDown 625","CONQUEST SmacDown 500 Pro","WIN&WIN HMC Plus","FIVICS SKADI-CX","FIVICS V Upper Rod","FIVICS CORE-A Damper"
  ],
  tab:[
    "SHIBUYA APEX","SHIBUYA Tab","WIAWIS EZR","WIAWIS EZ","FIVICS Saker II","FIVICS JM1","FIVICS JM2","WIN&WIN AT-100","AXCEL Contour Tab","AAE Cavalier Elite","STAN Onnex","T.R.U. Ball Execution",
    "ANGEL Tab 1 Plus Cordovan","ANGEL Tab 2 Plus Cordovan","ANGEL Tab 2 Super Fine Leather","Sherwood Tab Type-1","CARTEL Tab","NEET Glove","Naigai GT-301 Tab"
  ],
  pointWeight:["60","70","80","90","100","110","120","130","140","150"],
  shaftSetWeightSpread:["1","2","3","4","5","6","8","10"],
  shaftStraightness:["0.001","0.002","0.003","0.004","0.005","0.006"],
  foc:["9","10","11","12","13","14","15","16","17","18"],
  vane:["KOREA ARCHERY Jet6","KOREA ARCHERY Jet6 S","GAS PRO Spin Vanes","XS Wings","Spin Wing","Range-O-Matic Spin Vanes","EliVanes P3","Bohning X Vane","AAE WAV","Kurly Vanes","Natural Feather"],
  vaneHeight:["1.5","1.75","2.0","2.5","3.0","4.0"],
  nockFit:["普通","やや緩い","ややきつい","Loose","Tight"],
  poundage:["24","26","28","30","32","34","36","38","40","42","44","46","48","50"],
  drawLength:["24","25","26","27","28","29","30","31","32"],
  arrowLength:["25","26","27","28","29","30","31","32"],
  arrowCd:["0.90","1.00","1.10","1.20","1.30","1.45"],
  bowEfficiency:["65","68","70","72","75","78","80","82"],
  temperature:["0","5","10","15","20","25","30","35"],
  altitude:["0","100","300","500","800","1000","1500"],
  humidity:["30","40","50","60","70","80","90"],
  brace:["8.0 inch","8.25 inch","8.5 inch","8.75 inch","9.0 inch","9.25 inch"],
  tiller:["0mm","+2mm","+3mm","+4mm","+5mm","+6mm"],
  centerShot:["矢先 1/2本 外","矢先 1本 外","センター","やや内"],
  plungerTension:["弱め","中間","強め","1回転戻し","2回転戻し"],
  tuningMethod:["未実施","ベアシャフト確認","ウォークバック確認","距離別サイト校正","プランジャー確認","ブレースハイト比較","センターショット確認","ティラー確認","ペーパーチューニング"],
  tuningResult:["未確認","良好","硬め傾向","柔らかめ傾向","右寄り","左寄り","縦散り","横散り","再確認"]
};
const GEAR_FIELDS=[
  ["bow","ハンドル/弓本体"],["limbs","リム"],["poundage","ポンド (実測)"],["drawLength","引き尺 (inch)"],["arrow","シャフト銘柄"],
  ["sight","サイト"],["rest","レスト"],["string","弦"],["stabilizer","スタビライザー/ウエイト"],["tab","タブ/リリーサー"],
  ["shaftSpine","シャフト番手/スパイン"],["arrowLength","矢尺/シャフト長 (inch)"],["pointWeight","ポイント重量 (gr)"],
  ["arrowDia","矢の直径 (mm)"],["shaftGpi","シャフト重量 (gr/in)"],["arrowWeight","矢重量 合計 (gr)"],["shaftSetWeightSpread","矢セット重量差 (gr)"],["shaftStraightness","シャフト真直度 (inch)"],
  ["foc","FOC (%)"],["vane","ベイン/羽根"],["vaneHeight","ベイン高さ (mm)"],["nock","ノック/ノッキングポイント"],["nockFit","ノックフィット"],
  ["arrowSpeed","実測初速 (fps / m/s・任意)"],["arrowCd","抗力係数 Cd (任意)"],["bowEfficiency","弓効率 (%)"],["temperature","気温 (℃)"],["altitude","標高 (m)"],["humidity","湿度 (%)"],
  ["brace","ブレースハイト"],["tiller","ティラー"],["centerShot","センターショット"],["plunger","プランジャー"],["plungerTension","プランジャー硬さ/位置"],["tuningMethod","確認したチューニング"],["tuningResult","チューニング結果"],["notes","その他メモ"]
];
const GEAR_SECTIONS=[
  {title:"基本", keys:["bow","limbs","poundage","drawLength","arrow"], open:true},
  {title:"矢の実測・精密データ", keys:["shaftSpine","arrowLength","pointWeight","arrowDia","shaftGpi","arrowWeight","shaftSetWeightSpread","shaftStraightness","foc","vane","vaneHeight","nock","nockFit"]},
  {title:"サイト・チューニング", keys:["sight","rest","string","stabilizer","tab","brace","tiller","centerShot","plunger","plungerTension","tuningMethod","tuningResult"]},
  {title:"物理モデル補正", keys:["arrowSpeed","arrowCd","bowEfficiency","temperature","altitude","humidity"]},
  {title:"メモ", keys:["notes"]}
];
const GEAR_NUMERIC_FIELDS=new Set(["poundage","drawLength","shaftSpine","arrowLength","pointWeight","arrowDia","shaftGpi","arrowWeight","shaftSetWeightSpread","shaftStraightness","foc","vaneHeight","arrowSpeed","arrowCd","bowEfficiency","temperature","altitude","humidity"]);
const GEAR_PLACEHOLDERS={
  arrow:"例: EASTON X10",
  poundage:"例: 38",
  drawLength:"例: 28.5",
  arrowSpeed:"例: 205fps / 62.5m/s",
  arrowCd:"未入力なら矢径とベインから推定",
  bowEfficiency:"未入力なら72〜78%で推定",
  stabilizer:"例: SHIBUYA Vanquish PRO",
  tab:"例: SHIBUYA APEX",
  shaftSetWeightSpread:"同一セットの最大差。例: 3",
  shaftStraightness:"例: 0.003",
  foc:"例: 12",
  tuningResult:"例: ベアシャフトが少し硬め / 30mで左右が揃った",
  notes:"個体差、チューニング履歴、気づいたこと"
};
function gearOptions(k){
  if(k==="arrow") return shaftSuggestions();
  if(k==="shaftSpine") return COMMON_SPINES.map(String);
  return GEAR_SUGGESTIONS[k]||[];
}
const MANUAL_CHOICE="__manual__";
function choiceMatch(opts,value){
  const key=normGearText(value);
  return opts.find(v=>normGearText(v)===key)||"";
}
function choiceFieldHtml(id,lb,opts,value,placeholder,mode){
  const cur=String(value||"");
  const match=choiceMatch(opts,cur);
  const custom=cur && !match;
  const inputValue=custom?cur:match;
  const ph=placeholder?` placeholder="${esc(placeholder)}"`:"";
  const md=mode||"";
  return `<label class="f" for="${id}Pick">${lb}</label>
    <select class="inp choicePick" id="${id}Pick" data-target="${id}">
      <option value="">選択なし</option>
      ${opts.map(v=>`<option value="${esc(v)}" ${match===v?"selected":""}>${esc(v)}</option>`).join("")}
      <option value="${MANUAL_CHOICE}" ${custom?"selected":""}>候補にないので手入力</option>
    </select>
    <input class="inp choiceManual ${custom?"":"is-hidden"}" id="${id}" value="${esc(inputValue)}"${md}${ph}>`;
}
function bindChoiceFields(root){
  root.querySelectorAll(".choicePick").forEach(sel=>{
    const input=root.querySelector("#"+sel.dataset.target);
    if(!input) return;
    const sync=(focusManual=false)=>{
      const manual=sel.value===MANUAL_CHOICE;
      input.classList.toggle("is-hidden",!manual);
      if(!manual) input.value=sel.value||"";
      else if(focusManual) input.focus();
    };
    sel.onchange=()=>sync(true);
    sync(false);
  });
}
function setChoiceValue(root,id,value){
  const input=root.querySelector("#"+id);
  if(!input) return;
  input.value=String(value==null?"":value);
  const pick=root.querySelector(`[data-target="${id}"]`);
  if(!pick) return;
  const val=input.value;
  const match=[...pick.options].find(o=>o.value && o.value!==MANUAL_CHOICE && normGearText(o.value)===normGearText(val));
  if(match){ pick.value=match.value; input.value=match.value; input.classList.add("is-hidden"); }
  else if(val){ pick.value=MANUAL_CHOICE; input.classList.remove("is-hidden"); }
  else{ pick.value=""; input.classList.add("is-hidden"); }
}
function gearFieldHtml(k,lb,s){
  const opts=gearOptions(k), listId=`gfList_${k}`;
  const list=opts.length?` list="${listId}" autocomplete="off"`:"";
  const mode=GEAR_NUMERIC_FIELDS.has(k)?` inputmode="decimal"`:"";
  const ph=GEAR_PLACEHOLDERS[k]?` placeholder="${esc(GEAR_PLACEHOLDERS[k])}"`:"";
  if(k==="notes") return `<label class="f" for="gf_${k}">${lb}</label><textarea class="inp" id="gf_${k}"${ph}>${esc(s?s[k]:"")}</textarea>`;
  if(opts.length && !GEAR_NUMERIC_FIELDS.has(k)) return choiceFieldHtml(`gf_${k}`,lb,opts,s?s[k]:"",GEAR_PLACEHOLDERS[k]||"",mode);
  return `<label class="f" for="gf_${k}">${lb}</label><input class="inp" id="gf_${k}" value="${esc(s?s[k]:"")}"${list}${mode}${ph}>${opts.length?`<datalist id="${listId}">${opts.map(v=>`<option value="${esc(v)}"></option>`).join("")}</datalist>`:""}`;
}
function gearSectionHtml(sec,s){
  const body=sec.keys.map(k=>{
    const f=GEAR_FIELDS.find(x=>x[0]===k);
    return f?gearFieldHtml(f[0],f[1],s):"";
  }).join("");
  return sec.open?body:`<details class="adv"><summary>${sec.title}</summary>${body}</details>`;
}
function gearPrecisionProfile(s){
  const checks=[
    ["arrowWeight","矢重量"],["arrowDia","矢径"],["arrowLength","矢尺"],["pointWeight","ポイント重量"],
    ["poundage","実測ポンド"],["drawLength","引き尺"],["arrowSpeed","実測初速"],["shaftSetWeightSpread","矢セット重量差"],
    ["foc","FOC"],["vane","ベイン"],["tuningMethod","チューニング確認"],["temperature","気温/環境"]
  ];
  const filled=checks.filter(([k])=>s&&String(s[k]||"").trim()).map(x=>x[1]);
  const missing=checks.filter(([k])=>!(s&&String(s[k]||"").trim())).map(x=>x[1]);
  const score=filled.length/checks.length;
  const level=score>=.78?"高":score>=.5?"中":"低";
  return {score,level,filled,missing};
}
function carbonSpineCandidates(){
  return COMMON_SPINES.filter(n=>n<=2000 && !(n>1200 && n%100>=10 && n%100<=20));
}
function spineGuidance(s){
  const p=num(s&&s.poundage);
  const draw=num(s&&s.drawLength);
  const len=num(s&&s.arrowLength) || (draw!=null ? draw+1.75 : null);
  const point=num(s&&s.pointWeight) || 100;
  if(p==null || len==null) return {ready:false, missing:[p==null?"実測ポンド":null,len==null?"矢尺":null].filter(Boolean)};
  const drawAdj=draw!=null ? (draw-28)*1.2 : 0;
  const eff=p + drawAdj + (len-28)*2.0 + (point-100)*0.055;
  const ideal=clamp(1425 - eff*18.2, 300, 1500);
  const candidates=carbonSpineCandidates()
    .map(v=>({v,d:Math.abs(v-ideal)}))
    .sort((a,b)=>a.d-b.d || a.v-b.v)
    .slice(0,5)
    .map(x=>x.v);
  const actual=num(s&&s.shaftSpine);
  let state="候補を表示", tone="mid", text="カタログ表で最終確認してください。";
  if(actual!=null){
    const aluminum=actual>1200 && actual%100>=10 && actual%100<=20;
    if(aluminum){ state="アルミ番手", text="アルミ番手はカーボンスパインと体系が違うため、番手表と実射で確認します。"; }
    else{
      const diff=actual-ideal;
      if(Math.abs(diff)<=90){ state="概ね候補域"; tone="ok"; text="現在の番手は初期候補レンジに入っています。"; }
      else if(diff>90){ state="柔らかめ寄り"; tone="warn"; text="現在の番手は初期候補より柔らかめの可能性があります。矢飛びとチューニングを確認してください。"; }
      else{ state="硬め寄り"; tone="warn"; text="現在の番手は初期候補より硬めの可能性があります。矢飛びとチューニングを確認してください。"; }
    }
  }
  return {ready:true, eff, ideal, candidates, actual, point, len, state, tone, text};
}
function spineGuidanceHtml(s){
  const g=spineGuidance(s);
  if(!g.ready) return `<div class="note">スパイン初期候補: ${esc(g.missing.join("・"))}を入れると、候補レンジを表示できます。</div>`;
  const color=g.tone==="ok"?"#0f9d58":g.tone==="warn"?"#c62828":"#8a6d1d";
  return `<div class="note"><b>スパイン初期候補</b>: ${g.candidates.join(" / ")}（動的負荷 ${g.eff.toFixed(1)}lbs相当、矢尺${g.len.toFixed(1)}in、ポイント${g.point}gr）</div>
    <div class="note"><b style="color:${color}">${g.state}</b> — ${esc(g.text)}</div>`;
}
function gearPrecisionHtml(s){
  const p=gearPrecisionProfile(s);
  const next=p.missing.slice(0,3).join("・");
  return `<div class="advice" style="background:var(--card);border-color:var(--line)">
    <div class="note"><b>演算入力の充実度: ${p.level}</b>（${Math.round(p.score*100)}%）</div>
    ${next?`<div class="note">次に測ると効く項目: ${esc(next)}</div>`:`<div class="note">主要な物理モデル項目はかなり埋まっています。</div>`}
    ${spineGuidanceHtml(s)}
  </div>`;
}
function setupComparisonHtml(setupId){
  const ss=db.sessions.filter(s=>s.setupId===setupId).sort((a,b)=>(a.date||"").localeCompare(b.date||"")||(a.id>b.id?1:-1));
  if(ss.length<2) return "";
  const last=ss[ss.length-1];
  const prev=[...ss.slice(0,-1)].reverse().find(s=>s.dist===last.dist) || ss[ss.length-2];
  const metric=s=>{
    const all=s.ends.flat(), st=robustStats(all), total=all.reduce((a,x)=>a+x.s,0);
    return {all,st,total,avg:all.length?total/all.length:0};
  };
  const a=metric(prev), b=metric(last);
  const delta=(x,unit="",goodLow=false)=>{
    const sign=x>0?"+":"";
    const good=goodLow?x<0:x>0;
    const color=Math.abs(x)<.01?"var(--sub)":good?"#0f9d58":"#c62828";
    return `<b style="color:${color}">${sign}${x.toFixed(2)}${unit}</b>`;
  };
  return `<div class="advice" style="background:var(--card);border-color:var(--line)">
    <div class="note"><b>用具比較</b> — ${fmtD(prev.date)} → ${fmtD(last.date)}${prev.dist===last.dist?` / ${last.dist}m`:` / ${prev.dist}m→${last.dist}m`}</div>
    <div class="kv"><span>平均点</span><span>${a.avg.toFixed(2)} → ${b.avg.toFixed(2)}（${delta(b.avg-a.avg)}）</span></div>
    ${a.st&&b.st?`<div class="kv"><span>グルーピング半径</span><span>${a.st.rr.toFixed(1)}cm → ${b.st.rr.toFixed(1)}cm（${delta(b.st.rr-a.st.rr,"cm",true)}）</span></div>
    <div class="kv"><span>中心の移動</span><span>${driftText(b.st.mx-a.st.mx,b.st.my-a.st.my)}</span></div>`:""}
    <div class="note">セッティング変更の直後は、同距離・似た風条件で2回以上見ると判断が安定します。</div>
  </div>`;
}
function gearWorkbenchHtml(){
  const setups=db.setups||[];
  if(!setups.length) return "";
  const gp=setups.map(s=>gearPrecisionProfile(s));
  const avg=gp.length?gp.reduce((a,p)=>a+p.score,0)/gp.length:0;
  const linked=db.sessions.filter(s=>s.setupId).length;
  const marks=db.sightMarks.length;
  const top=setups.map(s=>({s,p:gearPrecisionProfile(s),m:modelReadinessProfile(s.id)}))
    .sort((a,b)=>(b.p.score+b.m.score)-(a.p.score+a.m.score))[0];
  return `<div class="insightStrip">
    <div class="insightTile"><div class="k">用具ライブラリ</div><b>${setups.length}件</b><span>練習紐付け ${linked}回 / サイト値 ${marks}点</span></div>
    <div class="insightTile"><div class="k">入力材料</div><b>${pct(avg)}</b><span>矢重量・矢径・FOC・実測初速の平均充実度</span></div>
    <div class="insightTile"><div class="k">よく使う用具</div><b>${top?esc(top.s.name):"—"}</b><span>${top?`入力 ${top.p.level} / 履歴 ${top.m.level}`:"登録待ち"}</span></div>
  </div>`;
}
function renderGear(m){
  m.innerHTML=`${pageHeroHtml("gear")}${gearWorkbenchHtml()}
  <div class="card"><h2>用具セッティング <span class="mini">${db.setups.length}件</span></h2>
    <div id="gearList">${db.setups.length? db.setups.map(s=>{
      const cnt=db.sessions.filter(x=>x.setupId===s.id).length;
      const gp=gearPrecisionProfile(s);
      const mp=modelReadinessProfile(s.id);
      return `<div class="listItem" data-id="${s.id}"><div>
        <div class="t">${esc(s.name)}</div>
        <div class="d">${[s.bow,s.limbs,s.poundage?s.poundage+"lbs":""].filter(Boolean).map(esc).join(" ・ ")||"詳細未入力"}</div>
        <div class="d">練習${cnt}回 ・ 入力材料 ${gp.level} ・ 履歴 ${mp.level} ・ 変更履歴${(s.history||[]).length}件</div>
      </div><div style="font-size:18px;color:var(--sub)">›</div></div>`;
    }).join(""):`<div class="empty">セッティングを登録すると、サイト台帳・調整提案・成績がセッティングごとに紐付きます。</div>`}</div>
    <div class="btnrow"><button class="btn sec" id="gWizard">初回セットアップ</button><button class="btn" id="gAdd">＋ 新しいセッティング</button></div>
    <div class="hint">バックアップ・テーマなどは右上の <b>⚙設定</b> から。</div>
  </div>`;
  $("#gWizard").onclick=()=>openSetupWizard();
  $("#gAdd").onclick=()=>openGearForm(null);
  document.querySelectorAll("#gearList .listItem").forEach(li=>li.onclick=()=>openGearDetail(li.dataset.id));
}

/* ---------- ツールシート（サイト・用具） ---------- */
function openToolSheet(kind){
  const ovl=document.createElement("div");
  ovl.className="ovl toolSheet";
  const titles={sight:"サイト調整",gear:"用具セッティング",form:"射形コーチ"};
  ovl.innerHTML=`<div class="sheet toolSheetBody"><div class="toolSheetHdr">
    <button class="back" id="toolClose" type="button">閉じる</button>
    <h3>${titles[kind]||"ツール"}</h3><span></span>
  </div><div class="toolSheetMain" id="toolSheetMain"></div></div>`;
  document.body.appendChild(ovl);
  const main=$("#toolSheetMain");
  if(kind==="form"){
    main.innerHTML=`<section class="card"><h2>射形コーチ</h2>
      <p>カメラで射形をリアルタイム分析する別アプリです。記録と併用すると効果的です。</p>
      <div class="btnrow"><a class="btn startPrimary" href="https://eita115115.github.io/archery-form-pwa/" target="_blank" rel="noopener">射形コーチを開く</a></div>
    </section>`;
  }else if(kind==="sight") renderSight(main);
  else renderGear(main);
  ovl.querySelector("#toolClose").onclick=()=>{ ovl.remove(); render(); };
}

/* ---------- ⚙ 設定 ---------- */
function applyTheme(){
  const t=db.settings.theme||"auto";
  document.documentElement.className=t;
}
function openSettings(){
  const ovl=document.createElement("div"); ovl.className="ovl";
  const th=db.settings.theme||"auto";
  const snaps=readSnapshots();
  ovl.innerHTML=`<div class="sheet"><h3>⚙ 設定</h3>
    <div class="settingsNav">
      <button class="settingsLink" type="button" data-tool="sight">サイト調整</button>
      <button class="settingsLink" type="button" data-tool="gear">用具セッティング</button>
      <button class="settingsLink" type="button" data-tool="form">射形コーチ</button>
    </div>
    <label class="f">テーマ</label>
    <div class="chips" id="thChips">
      ${[["auto","自動（端末に合わせる）"],["light","ライト"],["dark","ダーク"]].map(([v,lb])=>`<div class="chip ${th===v?"on":""}" data-th="${v}">${lb}</div>`).join("")}
    </div>
    <label class="f">アイ〜サイト距離 (mm) — 調整提案のmm目安の計算に使用</label>
    <input class="inp" id="setEye" inputmode="numeric" value="${db.settings.eyeSight||850}">
    ${nativeReadinessHtml()}
    <h3 style="margin-top:18px;font-size:14px">データ管理</h3>
    ${backupReminderHtml()}
    <div class="btnrow">
      <button class="btn sec" id="dExp">⬇ バックアップ保存</button>
      <button class="btn sec" id="dImp">⬆ 読み込み</button>
    </div>
    <div class="btnrow"><button class="btn sec" id="dCsv">CSV出力</button></div>
    <input type="file" id="dFile" accept=".json" style="display:none">
    <h3 style="margin-top:18px;font-size:14px">自動バックアップ</h3>
    ${snaps.length?`<label class="f">復元候補</label><select class="inp" id="dSnapSel">${snaps.map((s,i)=>`<option value="${i}">${esc(snapshotLabel(s))}</option>`).join("")}</select>`:`<div class="empty">自動バックアップはまだありません。保存操作を行うと端末内に復元用バックアップが残ります。</div>`}
    <div class="btnrow">
      <button class="btn sec" id="dSnapNow">今すぐバックアップ</button>
      <button class="btn ghost" id="dSnapRestore" ${snaps.length?"":"disabled"}>選択したバックアップを復元</button>
    </div>
    ${trashSettingsHtml()}
    <div class="hint">記録データはこの端末のブラウザ内にだけ保存されます（サーバーには送信されません）。</div>
    <div class="hint" style="color:var(--danger)">⚠️ iPhoneの「設定 → Safari → 履歴とWebサイトデータを消去」や、Safariの「Webサイトデータを削除」を行うと、<b>このアプリの記録もすべて消えます。</b>その操作をする前と、機種変更の前には必ず「バックアップ保存」をしてください。月1回のバックアップ習慣がおすすめです。</div>
    <div class="hint" style="text-align:center;margin-top:12px">的ノート v${APP_VER}</div>
    <div class="btnrow"><button class="btn ghost" id="setClose">閉じる</button></div>
  </div>`;
  document.body.appendChild(ovl);
  ovl.querySelectorAll("[data-tool]").forEach(b=>b.onclick=()=>{ ovl.remove(); openToolSheet(b.dataset.tool); });
  ovl.querySelectorAll("#thChips .chip").forEach(c=>c.onclick=()=>{
    db.settings.theme=c.dataset.th; save(); applyTheme();
    ovl.querySelectorAll("#thChips .chip").forEach(x=>x.classList.toggle("on",x===c));
  });
  ovl.querySelector("#setEye").onchange=e=>{ db.settings.eyeSight=+e.target.value||850; save(); };
  ovl.querySelector("#setClose").onclick=()=>{ ovl.remove(); render(); };
  ovl.querySelector("#dExp").onclick=()=>{
    db.settings.lastBackupAt=new Date().toISOString();
    save({reason:"json-export",forceSnapshot:true});
    shareOrDownloadText(`matonote-${today()}.json`,JSON.stringify(db,null,1),"application/json","的ノート Backup");
  };
  ovl.querySelector("#dCsv").onclick=()=>exportSessionsCsv();
  ovl.querySelector("#dSnapNow").onclick=()=>{ writeSafetySnapshot("manual",true); toast("現在のデータをバックアップしました"); ovl.remove(); openSettings(); };
  ovl.querySelector("#dSnapRestore").onclick=()=>{
    const sel=ovl.querySelector("#dSnapSel");
    const snap=readSnapshots()[sel?+sel.value:0];
    if(!snap||!snap.data){ toast("復元できるバックアップデータがありません"); return; }
    if(confirm(`${snapshotLabel(snap)} を復元します。\n現在のデータも先にバックアップしてから置き換えます。よろしいですか？`)){
      writeSafetySnapshot("restore-before",true);
      db=normalizeDb(snap.data);
      save({reason:"restore",forceSnapshot:true});
      applyTheme(); ovl.remove(); render(); toast("バックアップデータを復元しました");
    }
  };
  ovl.querySelector("#dImp").onclick=()=>ovl.querySelector("#dFile").click();
  ovl.querySelector("#dFile").onchange=e=>{
    const f=e.target.files[0]; if(!f)return;
    const r=new FileReader();
    r.onload=()=>{ try{
      const d=JSON.parse(r.result);
      if(!d.sessions||!d.setups) throw 0;
      if(confirm(`読み込むと現在のデータは置き換わります。\n（練習${d.sessions.length}回 / セッティング${d.setups.length}件）よろしいですか？`)){
        writeSafetySnapshot("import-before",true);
        db=normalizeDb(d); save({reason:"import",forceSnapshot:true}); applyTheme(); ovl.remove(); render(); toast("読み込みました");
      }
    }catch(_){ toast("ファイルを読み込めませんでした"); } };
    r.readAsText(f);
  };
  ovl.querySelectorAll("[data-restore-trash]").forEach(b=>b.onclick=()=>{
    if(restoreTrash(b.dataset.restoreTrash)){ ovl.remove(); render(); openSettings(); toast("復元しました"); }
  });
  const tc=ovl.querySelector("#trashClear");
  if(tc) tc.onclick=()=>{
    if(confirm("ゴミ箱の中身を完全に削除しますか？")){
      db.trash=[]; save({reason:"clear-trash",forceSnapshot:true}); ovl.remove(); openSettings(); toast("ゴミ箱を空にしました");
    }
  };
}
function openSetupWizard(){
  const choiceOpts=k=>gearOptions(k).slice(0,80);
  const opts=k=>choiceOpts(k).map(v=>`<option value="${esc(v)}"></option>`).join("");
  const ovl=document.createElement("div"); ovl.className="ovl";
  ovl.innerHTML=`<div class="sheet"><h3>初回セットアップ</h3>
    <div class="hint">最初は分かる範囲だけで大丈夫です。矢とサイト値が入るほど、調整提案の精度が上がります。</div>
    <label class="f">名前 *</label><input class="inp" id="wName" placeholder="例: メイン70m仕様">
    ${choiceFieldHtml("wBow","ハンドル/弓本体",choiceOpts("bow"),"","","")}
    ${choiceFieldHtml("wLimbs","リム",choiceOpts("limbs"),"","","")}
    <div class="row">
      <div><label class="f">実測ポンド</label><input class="inp" id="wPound" inputmode="decimal" placeholder="例: 38"></div>
      <div><label class="f">引き尺 (inch)</label><input class="inp" id="wDraw" inputmode="decimal" placeholder="例: 28.5"></div>
    </div>
    ${choiceFieldHtml("wArrow","シャフト銘柄",choiceOpts("arrow"),"","例: EASTON X10","")}
    <div class="row">
      <div><label class="f">番手/スパイン</label><input class="inp" id="wSpine" inputmode="decimal" list="wSpineList" placeholder="例: 650"><datalist id="wSpineList">${opts("shaftSpine")}</datalist></div>
      <div><label class="f">矢尺 (inch)</label><input class="inp" id="wArrowLength" inputmode="decimal" list="wArrowLengthList" placeholder="例: 29"><datalist id="wArrowLengthList">${opts("arrowLength")}</datalist></div>
    </div>
    <label class="f">ポイント重量 (gr)</label><input class="inp" id="wPoint" inputmode="decimal" list="wPointList" placeholder="例: 110"><datalist id="wPointList">${opts("pointWeight")}</datalist>
    ${choiceFieldHtml("wSight","サイト",choiceOpts("sight"),"","","")}
    <details class="adv" open>
      <summary>実測サイト値（分かる距離だけ）</summary>
      ${[70,50,30,18].map(d=>`<div class="row">
        <div><label class="f">${d}m 上下</label><input class="inp" id="wV_${d}" inputmode="decimal"></div>
        <div><label class="f">${d}m 左右</label><input class="inp" id="wH_${d}" inputmode="decimal"></div>
      </div>`).join("")}
    </details>
    <div class="btnrow"><button class="btn ghost" id="wCancel">キャンセル</button><button class="btn" id="wSave">保存して開始</button></div>
  </div>`;
  document.body.appendChild(ovl);
  bindChoiceFields(ovl);
  ovl.querySelector("#wCancel").onclick=()=>ovl.remove();
  ovl.querySelector("#wSave").onclick=()=>{
    const name=ovl.querySelector("#wName").value.trim();
    if(!name){ toast("名前を入力してください"); return; }
    const n={id:uid(),name,history:[],createdAt:today()};
    GEAR_FIELDS.forEach(([k])=>n[k]="");
    n.bow=ovl.querySelector("#wBow").value.trim();
    n.limbs=ovl.querySelector("#wLimbs").value.trim();
    n.poundage=ovl.querySelector("#wPound").value.trim();
    n.drawLength=ovl.querySelector("#wDraw").value.trim();
    n.arrow=ovl.querySelector("#wArrow").value.trim();
    n.shaftSpine=ovl.querySelector("#wSpine").value.trim();
    n.arrowLength=ovl.querySelector("#wArrowLength").value.trim();
    n.pointWeight=ovl.querySelector("#wPoint").value.trim();
    n.sight=ovl.querySelector("#wSight").value.trim();
    const inf=inferCatalogGear(n);
    if(inf && !inf.missing){
      n.arrowDia=inf.dia.toFixed(2);
      n.shaftGpi=inf.gpi.toFixed(2);
      if(inf.total) n.arrowWeight=inf.total.toFixed(0);
      n.notes=`カタログ推定: ${inf.notes.join(" / ")}`;
    }
    db.setups.push(n);
    [70,50,30,18].forEach(d=>{
      const v=ovl.querySelector(`#wV_${d}`).value.trim(), h=ovl.querySelector(`#wH_${d}`).value.trim();
      if(v||h) db.sightMarks.push({id:uid(),setupId:n.id,dist:d,v,h,date:today(),ts:Date.now(),note:"初回セットアップ"});
    });
    ui.sightSel.setupId=n.id;
    save({reason:"setup-wizard",forceSnapshot:true}); ovl.remove(); render(); toast("初回セットアップを保存しました");
  };
}
function openGearDetail(id){
  const s=db.setups.find(x=>x.id===id); if(!s)return;
  const ovl=document.createElement("div"); ovl.className="ovl";
  ovl.innerHTML=`<div class="sheet"><h3>${esc(s.name)}</h3>
    ${gearPrecisionHtml(s)}
    ${modelReadinessHtml(id)}
    ${physicsCalibrationHtml(id)}
    ${setupComparisonHtml(id)}
    <table class="tbl">${GEAR_FIELDS.map(([k,lb])=>s[k]?`<tr><th style="width:40%">${lb}</th><td>${esc(s[k])}</td></tr>`:"").join("")}</table>
    ${(s.history&&s.history.length)?`<h3 style="margin-top:14px;font-size:13px">変更履歴</h3>
      ${[...s.history].reverse().map(h=>`<div style="font-size:12px;padding:6px 0;border-bottom:1px solid #eef0eb">
        <b>${fmtD(h.date)}</b> — ${h.changes.map(c=>`${esc(c.label)}: ${esc(c.from||"（未設定）")} → <b>${esc(c.to||"（削除）")}</b>`).join(" / ")}</div>`).join("")}`:""}
    <div class="btnrow">
      <button class="btn danger" id="gDel">削除</button>
      <button class="btn sec" id="gEdit">編集</button>
      <button class="btn ghost" id="gClose">閉じる</button>
    </div>
  </div>`;
  document.body.appendChild(ovl);
  ovl.querySelector("#gClose").onclick=()=>ovl.remove();
  ovl.querySelector("#gEdit").onclick=()=>{ ovl.remove(); openGearForm(id); };
  ovl.querySelector("#gDel").onclick=()=>{
    if(confirm(`「${s.name}」を削除しますか？\n（練習記録・サイト台帳との紐付けが外れます）`)){
      const marks=db.sightMarks.filter(x=>x.setupId===id);
      trashItem("setupBundle",s.name,{setup:s,sightMarks:marks});
      db.setups=db.setups.filter(x=>x.id!==id);
      db.sightMarks=db.sightMarks.filter(x=>x.setupId!==id);
      save({reason:"delete-setup",forceSnapshot:true}); ovl.remove(); render(); toast("削除しました。設定から復元できます");
    }
  };
}
function openGearForm(id){
  const s=id?db.setups.find(x=>x.id===id):null;
  const ovl=document.createElement("div"); ovl.className="ovl";
  ovl.innerHTML=`<div class="sheet"><h3>${s?"セッティング編集":"新しいセッティング"}</h3>
    <label class="f">名前 *</label><input class="inp" id="gfName" value="${esc(s?s.name:"")}" placeholder="例: メイン70m仕様">
    ${GEAR_SECTIONS.map(sec=>gearSectionHtml(sec,s)).join("")}
    <div class="btnrow"><button class="btn sec" id="gfInfer">📖 カタログから推定</button></div>
    <div class="hint" id="gfInferHint">シャフト銘柄と番手を別々に入れると、掲載モデル・直径・GPI・総矢重量を推定します。矢尺とポイント重量は専用欄に入れてください。</div>
    <div class="btnrow"><button class="btn ghost" id="gfCancel">キャンセル</button><button class="btn" id="gfSave">保存</button></div>
  </div>`;
  document.body.appendChild(ovl);
  bindChoiceFields(ovl);
  ovl.querySelector("#gfCancel").onclick=()=>ovl.remove();
  ovl.querySelector("#gfInfer").onclick=()=>{
    const vals={};
    GEAR_FIELDS.forEach(([k])=>vals[k]=ovl.querySelector("#gf_"+k).value.trim());
    const inf=inferCatalogGear(vals);
    const hint=ovl.querySelector("#gfInferHint");
    if(!inf){ hint.textContent="カタログ推定できるシャフト名が見つかりませんでした。例: EASTON X10 / EASTON A/C/E / EASTON Avance / EASTON XX75 Platinum Plus"; toast("シャフト名を読み取れません"); return; }
    if(inf.missing){ hint.textContent=`${inf.fam.name} は見つかりました。番手/スパイン欄も入力してください。`; toast("番手を追加してください"); return; }
    const set=(k,v)=>setChoiceValue(ovl,"gf_"+k,v);
    set("shaftSpine", inf.spine);
    set("arrowDia", inf.dia.toFixed(2));
    set("shaftGpi", inf.gpi.toFixed(2));
    if(inf.total) set("arrowWeight", inf.total.toFixed(0));
    const old=ovl.querySelector("#gf_notes").value.trim();
    const note=`カタログ推定: ${inf.notes.join(" / ")}`;
    ovl.querySelector("#gf_notes").value=old?`${old}\n${note}`:note;
    hint.innerHTML=inf.notes.map(esc).join("<br>");
    toast("カタログ情報から推定しました");
  };
  ovl.querySelector("#gfSave").onclick=()=>{
    const name=ovl.querySelector("#gfName").value.trim();
    if(!name){ toast("名前を入力してください"); return; }
    if(s){
      const changes=[];
      if(s.name!==name) changes.push({label:"名前",from:s.name,to:name});
      GEAR_FIELDS.forEach(([k,lb])=>{
        const v=ovl.querySelector("#gf_"+k).value.trim();
        if((s[k]||"")!==v) changes.push({label:lb,from:s[k]||"",to:v});
        s[k]=v;
      });
      s.name=name;
      if(changes.length){ (s.history=s.history||[]).push({date:today(),changes}); toast("変更を履歴に記録しました"); }
    }else{
      const n={id:uid(), name, history:[], createdAt:today()};
      GEAR_FIELDS.forEach(([k])=>n[k]=ovl.querySelector("#gf_"+k).value.trim());
      db.setups.push(n);
      if(!ui.sightSel.setupId) ui.sightSel.setupId=n.id;
    }
    save(); ovl.remove(); render();
  };
}
