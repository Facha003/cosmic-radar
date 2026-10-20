/* ---------- UI ---------- */
const $=id=>document.getElementById(id);
const HOSTED=""; // GitHub Pages address, opened from the claude.ai copy for location
const S={lat:40.71,lon:-74.01,tz:"America/New_York",label:"New York",t:Date.now(),sel:null,filter:"vis",wx:null,win:null,sums:{}};
const browserTz=(()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone}catch(e){return "UTC"}})();
const store={get(k){try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};

function fmt(t){return new Intl.DateTimeFormat(undefined,{hour:"numeric",minute:"2-digit",timeZone:S.tz}).format(new Date(t))}
function esc(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}

/* location */
function initCities(){
  const sel=$("city");
  sel.innerHTML='<option value="">Choose a city…</option>'+CITIES.map((c,i)=>`<option value="${i}">${esc(c[0])}</option>`).join("")+'<option value="custom" hidden>Custom location</option>';
  sel.onchange=()=>{const c=CITIES[+sel.value];if(sel.value!==""&&c){setLoc(c[1],c[2],c[3],c[0]);showChooser(false)}};
  $("coordForm").addEventListener("submit",e=>{
    e.preventDefault();
    const la=parseFloat($("lat").value),lo=parseFloat($("lon").value);
    if(!(la>=-90&&la<=90)||!(lo>=-180&&lo<=180)){$("msg").textContent="Latitude must be between −90 and 90, longitude between −180 and 180.";return}
    setLoc(la,lo,browserTz,`${la.toFixed(2)}°, ${lo.toFixed(2)}°`);showChooser(false);
  });
  $("manualBtn").onclick=()=>{$("manual").hidden=false;$("manualBtn").hidden=true};
  $("changeLoc").onclick=()=>showChooser(true);
  // Inside the claude.ai frame location is always refused, so point to the hosted copy instead
  if(window.self!==window.top){
    if(HOSTED){const a=document.createElement("a");a.className="btn primary big";a.href=HOSTED;a.target="_blank";a.rel="noopener";a.textContent="Open in your browser to use your location";$("geo").replaceWith(a)}
    else $("geo").hidden=true;
    $("geoNote").textContent="Or enter a place below.";
    $("manual").hidden=false;$("manualBtn").hidden=true;
    return;
  }
  $("geo").onclick=()=>{
    if(!navigator.geolocation){$("msg").textContent="This browser can't share your location. Enter a place instead.";return}
    $("msg").textContent="Finding you…";
    navigator.geolocation.getCurrentPosition(p=>{
      setLoc(p.coords.latitude,p.coords.longitude,browserTz,"Your location");showChooser(false);
    },err=>{
      $("msg").textContent=err.code===1?"Location is off for this site. You can turn it on in your browser settings, or enter a place.":"Couldn't get a fix. Try again or enter a place.";
      $("manual").hidden=false;$("manualBtn").hidden=true;
    },{enableHighAccuracy:true,timeout:15000,maximumAge:0});
  };
}
function showChooser(open){
  $("start").hidden=!open;$("changeLoc").hidden=open;
  if(!open)$("msg").textContent="";
}
function setLoc(lat,lon,tz,label,quiet){
  Object.assign(S,{lat,lon,tz,label});
  store.set("sky-loc",{lat,lon,tz,label});
  const i=CITIES.findIndex(c=>c[0]===label);$("city").value=i>=0?String(i):"custom";
  $("lat").value=lat.toFixed(2);$("lon").value=lon.toFixed(2);
  if(!quiet)$("msg").textContent="";
  S.t=Date.now();computeNight();loadWeather();
}

/* night + conditions */
function computeNight(){
  const w=nightWindow(Date.now(),S.lat,S.lon,S.tz);S.win=w;
  const now=Date.now();
  S.t=(now>=w.sunset&&now<=w.sunrise)?now:Math.min(w.dusk+3600000,w.dawn);
  const sl=$("slider");sl.max=Math.round((w.sunrise-w.sunset)/60000/5);sl.value=Math.round((S.t-w.sunset)/300000);
  S.sums={};
  for(const k in CONS){const c=CONS[k];const tr=track(c.c.ra,c.c.dec,w,S.lat,S.lon);S.sums[k]={tr,sum:summarize(tr)}}
  const day=new Intl.DateTimeFormat(undefined,{weekday:"long",month:"long",day:"numeric",timeZone:S.tz}).format(new Date(w.dusk));
  $("where").textContent=`${S.label} · ${Math.abs(S.lat).toFixed(1)}°${S.lat>=0?"N":"S"} ${Math.abs(S.lon).toFixed(1)}°${S.lon>=0?"E":"W"} · night of ${day}`;
  $("darkWin").textContent=`${fmt(w.dusk)} – ${fmt(w.dawn)}`;
  $("darkSub").textContent=w.quality==="full"?`Sunset ${fmt(w.sunset)}, fully dark after ${fmt(w.dusk)}`:w.quality==="none"?"The Sun never sets far enough tonight for real darkness":`The sky never gets fully dark tonight (${w.quality} twilight at best)`;
  // Moon
  const mid=(w.dusk+w.dawn)/2,ph=moonPhase(mid);
  let upCount=0,n=0,rise=null,set=null,prev=null;
  for(let t=w.sunset;t<=w.sunrise;t+=10*60000){const a=moonAltAz(t,S.lat,S.lon).alt;if(t>=w.dusk&&t<=w.dawn){n++;if(a>0)upCount++}if(prev!==null){if(prev<=0&&a>0&&!rise)rise=t;if(prev>0&&a<=0&&!set)set=t}prev=a}
  S.moonUp=n?upCount/n:0;S.phase=ph;
  $("moonName").textContent=ph.name;
  const rs=[rise&&`rises ${fmt(rise)}`,set&&`sets ${fmt(set)}`].filter(Boolean).join(", ");
  $("moonSub").textContent=`${Math.round(ph.illum*100)}% lit · `+(rs||(S.moonUp>.5?"up all night":"down all night"));
  $("moonIcon").innerHTML=moonSvg(ph,22,22,19);
  renderConditions();renderMap();renderRoster();
  if(!S.sel){const top=bestCons()[0];S.sel=top?{type:"con",id:top}:null}
  renderDetail();
}
function moonSvg(ph,cx,cy,R){
  const k=ph.illum,rx=Math.abs(2*k-1)*R,sweep=k>0.5?1:0,flip=ph.waxing?"":`transform="translate(${2*cx} 0) scale(-1 1)"`;
  return `<circle cx="${cx}" cy="${cy}" r="${R}" fill="#1f2840" stroke="#3a4766"/>`+
   (k>0.01?`<path ${flip} d="M${cx} ${cy-R} A${R} ${R} 0 0 1 ${cx} ${cy+R} A${rx} ${R} 0 0 ${sweep} ${cx} ${cy-R}Z" fill="#efe7cf"/>`:"");
}
function renderConditions(){
  const w=S.win,bars=$("cloudBars");let avg=null;
  if(S.wx){
    const hrs=S.wx.filter(h=>h.t>=w.sunset-1800000&&h.t<=w.sunrise+1800000);
    const dark=hrs.filter(h=>h.t>=w.dusk&&h.t<=w.dawn);
    avg=dark.length?dark.reduce((a,h)=>a+h.c,0)/dark.length:null;
    bars.innerHTML=hrs.map(h=>`<span style="height:${Math.max(4,h.c)}%" title="${fmt(h.t)}: ${h.c}% cloud"></span>`).join("");
    $("cloudBig").textContent=avg==null?"–":avg<15?"Clear":avg<40?"Mostly clear":avg<70?"Partly cloudy":"Cloudy";
    const clearest=dark.length?dark.reduce((a,h)=>h.c<a.c?h:a):null;
    $("cloudSub").textContent=avg==null?"":`Average ${Math.round(avg)}% during dark hours`+(clearest?`, clearest around ${fmt(clearest.t)}`:"");
    $("wxNote").textContent="Cloud forecast: Open-Meteo (open-meteo.com), hourly cloud cover for your coordinates.";
  }else{
    bars.innerHTML="";$("cloudBig").textContent="No forecast";
    $("cloudSub").textContent=S.wxTried?"The forecast service couldn't be reached from this page. Check a local forecast before heading out.":"Loading forecast…";
  }
  let score=100,why=[];
  if(w.quality!=="full"){score-=w.quality==="nautical"?20:40;why.push("bright twilight")}
  const mp=S.phase.illum*S.moonUp;score-=mp*45;
  if(mp>.45)why.push("a bright Moon washes out faint stars");else if(mp<.1)why.push("the Moon is out of the way");
  if(avg!=null){score-=avg*0.7;if(avg>=40)why.push(`${Math.round(avg)}% cloud`);else why.push("mostly clear skies")}
  const [lbl,cls]=score>=75?["Great","p-good"]:score>=55?["Good","p-good"]:score>=35?["Fair","p-warn"]:["Poor","p-bad"];
  $("verdict").innerHTML=`<span class="pill ${cls}">${lbl}</span>`;
  $("verdictSub").textContent=(why.length?why.join(", ").replace(/^./,c=>c.toUpperCase())+".":"")+(avg==null?" Based on the Moon only, without a cloud forecast.":" Bright stars and constellations show through all but heavy cloud.");
}
async function loadWeather(){
  S.wx=null;S.wxTried=false;renderConditions();
  const ctrl=new AbortController(),to=setTimeout(()=>ctrl.abort(),7000);
  try{
    const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${S.lat.toFixed(3)}&longitude=${S.lon.toFixed(3)}&hourly=cloud_cover&timezone=UTC&forecast_days=3`,{signal:ctrl.signal});
    if(!r.ok)throw new Error(r.status);
    const j=await r.json();
    S.wx=j.hourly.time.map((t,i)=>({t:Date.parse(t+"Z"),c:j.hourly.cloud_cover[i]})).filter(h=>h.c!=null);
  }catch(e){S.wx=null}
  clearTimeout(to);S.wxTried=true;renderConditions();
}

/* sky map */
const CX=320,CY=320,RAD=286;
function proj(alt,az){const r=(90-alt)/90*RAD,a=az*D2R;return [CX-r*Math.sin(a),CY-r*Math.cos(a)]}
const SPC={O:"#a8c2ff",B:"#bcd0ff",A:"#e9eeff",F:"#fff5e2",G:"#ffe6ad",K:"#ffc583",M:"#ff9a6a",W:"#a8c2ff"};
const starR=m=>Math.max(0.9,4.4-0.85*m);
let mapPts=[],labelPts=[];
function renderMap(){
  const t=S.t,svg=$("map");mapPts=[];labelPts=[];
  $("tLabel").textContent=fmt(t);
  const selCon=S.sel?(S.sel.type==="con"?S.sel.id:STARS[S.sel.id]?.[1]):null;
  let g=`<defs><clipPath id="disc"><circle cx="${CX}" cy="${CY}" r="${RAD}"/></clipPath><radialGradient id="glow"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>`;
  g+=`<circle cx="${CX}" cy="${CY}" r="${RAD}" fill="var(--sky)" stroke="var(--gilt)" stroke-width="1.5"/>`;
  for(const a of [30,60])g+=`<circle cx="${CX}" cy="${CY}" r="${(90-a)/90*RAD}" fill="none" stroke="var(--line)" stroke-dasharray="3 5"/>`;
  g+=`<text x="${CX+4}" y="${CY-(60/90)*RAD-4}" fill="var(--muted)" font-size="10" font-family="var(--mono)">30°</text><text x="${CX+4}" y="${CY-(30/90)*RAD-4}" fill="var(--muted)" font-size="10" font-family="var(--mono)">60°</text>`;
  [["N",0],["E",90],["S",180],["W",270]].forEach(([l,az])=>{const [x,y]=proj(-7.5,az);g+=`<text x="${x}" y="${y+6}" text-anchor="middle" fill="var(--gilt)" font-size="17" font-family="var(--display)" font-weight="700">${l}</text>`});
  g+=`<g clip-path="url(#disc)">`;
  const pos={};
  for(const id in STARS){const s=STARS[id];pos[id]=altaz(s[2]*15,s[3],t,S.lat,S.lon)}
  // lines
  for(const k in CONS){
    const on=k===selCon;
    for(const [a,b] of CONS[k].l){
      const pa=pos[a],pb=pos[b];if(pa.alt<-3&&pb.alt<-3)continue;
      const [x1,y1]=proj(pa.alt,pa.az),[x2,y2]=proj(pb.alt,pb.az);
      g+=`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${on?"var(--gilt)":"#4c6390"}" stroke-width="${on?1.8:1}" stroke-opacity="${on?1:.7}"/>`;
    }
  }
  // stars & deep sky
  for(const id in STARS){
    const s=STARS[id],p=pos[id];if(p.alt<0)continue;
    const [x,y]=proj(p.alt,p.az);mapPts.push({id,x,y,m:s[4]});
    const sel=S.sel&&S.sel.type==="star"&&S.sel.id===id;
    if(isDeep(id)){g+=`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="url(#glow)"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="none" stroke="#9fb3d9" stroke-dasharray="1.5 1.5" stroke-width=".8"/>`}
    else{const r=starR(s[4]);g+=`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="${SPC[s[5][0]]||"#fff"}"/>`;if(s[4]<1.3)g+=`<text x="${(x+r+3).toFixed(1)}" y="${(y+3.5).toFixed(1)}" fill="#c9d3e8" font-size="10.5" font-family="var(--body)">${esc(s[0])}</text>`}
    if(sel)g+=`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" fill="none" stroke="var(--gilt)" stroke-width="1.5"/>`;
  }
  // moon
  const mp=moonAltAz(t,S.lat,S.lon);
  if(mp.alt>0){const [x,y]=proj(mp.alt,mp.az);g+=`<g>${moonSvg(S.phase,x,y,9)}</g><text x="${x+12}" y="${y+4}" fill="#efe7cf" font-size="11" font-family="var(--body)">Moon</text>`}
  // constellation labels
  for(const k in CONS){
    const c=CONS[k],p=altaz(c.c.ra,c.c.dec,t,S.lat,S.lon);if(p.alt<3)continue;
    const [x,y]=proj(p.alt,p.az);labelPts.push({k,x,y});
    const on=k===selCon;
    g+=`<text x="${x.toFixed(1)}" y="${(y+14).toFixed(1)}" text-anchor="middle" fill="${on?"var(--gilt)":"#8ea0c4"}" font-size="${on?13:11}" font-family="var(--display)" letter-spacing="1.5" font-weight="${on?700:500}">${esc(c.n.toUpperCase())}</text>`;
  }
  g+=`</g>`;
  svg.innerHTML=g;
}
function mapClick(e){
  const svg=$("map"),pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;
  const p=pt.matrixTransform(svg.getScreenCTM().inverse());
  let best=null,bd=1e9;
  for(const s of mapPts){const d=Math.hypot(s.x-p.x,s.y-p.y)-(5-s.m);if(d<bd){bd=d;best=s}}
  if(best&&bd<14){select("star",best.id);return}
  let bl=null,bld=1e9;for(const l of labelPts){const d=Math.hypot(l.x-p.x,l.y+10-p.y);if(d<bld){bld=d;bl=l}}
  if(bl&&bld<40)select("con",bl.k);
}
function select(type,id){S.sel={type,id};renderMap();renderDetail();renderRoster()}

/* detail */
function statusText(sum){
  switch(sum.kind){
    case "all":return ["Up all night","p-good"];
    case "sets":return [`Visible until ~${fmt(sum.t)}`,"p-good"];
    case "rises":return [`Rises ~${fmt(sum.t)}`,"p-good"];
    case "window":return [`Best ${fmt(sum.t1)}–${fmt(sum.t2)}`,"p-good"];
    case "low":return ["Stays low on the horizon","p-warn"];
    default:return ["Not visible tonight","p-mute"];
  }
}
function lightLeft(ly){
  if(ly>=1e6)return `about ${(ly/1e6).toFixed(1)} million years ago`;
  if(ly>=20000)return `about ${Math.round(ly/1000).toLocaleString()} thousand years ago`;
  const y=Math.round(new Date().getFullYear()-ly);
  return y>0?`around the year ${y}`:`around ${(-y+1).toLocaleString()} BCE`;
}
const TEMP={O:"35,000",B:"20,000",A:"9,000",F:"7,000",G:"5,600",K:"4,500",M:"3,300",W:"50,000+"};
const COLOR={O:"blue",B:"blue-white",A:"white",F:"yellow-white",G:"yellow",K:"orange",M:"red-orange",W:"blue"};
function seeIt(m){return m<1?"Very bright, easy even from a city":m<2.2?"Easy from a city":m<3.5?"Visible from the suburbs":m<4.8?"Needs a dark sky":"Binoculars or a dark rural sky"}
function renderDetail(){
  const el=$("detail");
  if(!S.sel){el.innerHTML="<p>Tap a star or a constellation name.</p>";return}
  if(S.sel.type==="con"){
    const k=S.sel.id,c=CONS[k],{sum}=S.sums[k],[st,cls]=statusText(sum);
    const stars=c.stars.slice().sort((a,b)=>STARS[a][4]-STARS[b][4]);
    const deep=Object.keys(STARS).filter(id=>STARS[id][1]===k&&isDeep(id));
    const now=altaz(c.c.ra,c.c.dec,S.t,S.lat,S.lon);
    el.innerHTML=`<div><div class="eyebrow">Constellation · ${esc(c.m)}</div><h3>${esc(c.n)}</h3></div>
      <div><span class="pill ${cls}">${esc(st)}</span></div>
      <dl class="facts">
        ${sum.best&&sum.best.alt>0?`<dt>Highest tonight</dt><dd class="num">${fmt(sum.best.t)}, ${Math.round(sum.best.alt)}° up, ${DIRS[dirIdx(sum.best.az)]}</dd>`:""}
        <dt>At ${fmt(S.t)}</dt><dd>${esc(whereText(now.alt,now.az))}</dd>
        <dt>Best season</dt><dd>${esc(c.best)}</dd>
      </dl>
      <p>${esc(c.myth)}</p>
      <p class="tip">${esc(c.tip)}</p>
      ${sum.best&&sum.best.alt>=VIS?`<div><button class="btn" type="button" id="goBest">Show on chart at ${fmt(sum.best.t)}</button></div>`:""}
      <div><div class="eyebrow" style="margin-bottom:6px">Stars and objects</div><div class="chips">${stars.concat(deep).map(id=>`<button class="chip" type="button" data-star="${id}">${esc(STARS[id][0])}</button>`).join("")}</div></div>`;
    const gb=$("goBest");if(gb)gb.onclick=()=>setTime(sum.best.t);
  }else{
    const id=S.sel.id,s=STARS[id],deep=isDeep(id),c=CONS[s[1]];
    const p=altaz(s[2]*15,s[3],S.t,S.lat,S.lon),tr=track(s[2]*15,s[3],S.win,S.lat,S.lon),sum=summarize(tr),[st,cls]=statusText(sum);
    const cl=s[5][0];
    const dist=s[6]>=1e6?`${(s[6]/1e6).toFixed(1)} million light-years`:`${s[6].toLocaleString()} light-years`;
    el.innerHTML=`<div><div class="eyebrow">${deep?esc(s[5][0].toUpperCase()+s[5].slice(1)):"Star"} in ${esc(c.n)}</div><h3>${esc(s[0])}</h3></div>
      <div><span class="pill ${cls}">${esc(st)}</span></div>
      <dl class="facts">
        <dt>At ${fmt(S.t)}</dt><dd>${esc(whereText(p.alt,p.az))}${p.alt>0?` <span class="num">(${Math.round(p.alt)}° up, ${DIRS_S[dirIdx(p.az)]})</span>`:""}</dd>
        ${sum.best&&sum.best.alt>0?`<dt>Highest tonight</dt><dd class="num">${fmt(sum.best.t)}, ${Math.round(sum.best.alt)}° up</dd>`:""}
        <dt>Brightness</dt><dd><span class="num">mag ${s[4].toFixed(2)}</span> · ${esc(seeIt(s[4]))}</dd>
        <dt>Distance</dt><dd>${dist}</dd>
        <dt>Light you see left</dt><dd>${lightLeft(s[6])}</dd>
        ${deep?"":`<dt>Type</dt><dd>${esc(s[5])} · ${COLOR[cl]||""} · about ${TEMP[cl]||"?"} K surface</dd>`}
        <dt>Coordinates</dt><dd class="num">RA ${Math.floor(s[2])}h ${String(Math.round((s[2]%1)*60)).padStart(2,"0")}m · Dec ${s[3]>=0?"+":"−"}${Math.abs(s[3]).toFixed(1)}°</dd>
      </dl>
      ${FACTS[id]?`<p>${esc(FACTS[id])}</p>`:""}
      <div class="chips"><button class="chip" type="button" data-con="${s[1]}">Part of ${esc(c.n)} →</button></div>`;
  }
  el.querySelectorAll("[data-star]").forEach(b=>b.onclick=()=>select("star",b.dataset.star));
  el.querySelectorAll("[data-con]").forEach(b=>b.onclick=()=>select("con",b.dataset.con));
}

/* roster */
function bestCons(){return Object.keys(CONS).filter(k=>S.sums[k].sum.best&&S.sums[k].sum.best.alt>=VIS).sort((a,b)=>S.sums[b].sum.best.alt-S.sums[a].sum.best.alt)}
function spark(tr){
  const W=240,H=30,n=tr.length-1||1;
  const y=a=>H-Math.max(0,Math.min(90,a))/90*(H-3)-1.5;
  const pts=tr.map((p,i)=>`${(i/n*W).toFixed(1)},${y(p.alt).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="${W}" y1="${y(VIS)}" y2="${y(VIS)}" stroke="var(--line)" stroke-dasharray="3 3"/><polyline points="0,${H} ${pts} ${W},${H}" fill="rgba(215,180,106,.12)" stroke="none"/><polyline points="${pts}" fill="none" stroke="var(--gilt)" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
}
function renderRoster(){
  const vis=bestCons();
  const list=S.filter==="vis"?vis:vis.concat(Object.keys(CONS).filter(k=>!vis.includes(k)).sort((a,b)=>CONS[a].n.localeCompare(CONS[b].n)));
  const selCon=S.sel?(S.sel.type==="con"?S.sel.id:STARS[S.sel.id]?.[1]):null;
  $("roster").innerHTML=list.map(k=>{
    const c=CONS[k],{tr,sum}=S.sums[k],[st,cls]=statusText(sum),br=c.stars.slice().sort((a,b)=>STARS[a][4]-STARS[b][4])[0];
    return `<button type="button" class="row${k===selCon?" sel":""}" data-k="${k}">
      <span class="nm">${esc(c.n)}</span><span class="pill ${cls}">${esc(st)}</span>
      <span class="mean">${esc(c.m)}</span>
      ${spark(tr)}
      <span class="meta"><span>${sum.best&&sum.best.alt>0?`Peak <span class="num">${Math.round(sum.best.alt)}°</span> ${DIRS_S[dirIdx(sum.best.az)]} at ${fmt(sum.best.t)}`:"Below the horizon"}</span><span>★ ${esc(STARS[br][0])}</span></span>
    </button>`}).join("")||`<p class="hint">None of these constellations get high enough during tonight's dark hours here.</p>`;
  $("roster").querySelectorAll(".row").forEach(b=>b.onclick=()=>{select("con",b.dataset.k);if(window.innerWidth<860)$("map").scrollIntoView({behavior:"smooth",block:"start"})});
}

/* time */
function setTime(t){S.t=t;$("slider").value=Math.round((t-S.win.sunset)/300000);renderMap();renderDetail()}

/* boot */
initCities();
$("slider").addEventListener("input",e=>{S.t=S.win.sunset+e.target.value*300000;renderMap();renderDetail()});
$("nowBtn").onclick=()=>{const n=Date.now();if(n<S.win.sunset||n>S.win.sunrise){$("msg").textContent=`It's daytime there now. The chart shows ${fmt(S.win.dusk)}, when it gets dark.`;setTime(S.win.dusk)}else setTime(n)};
$("map").addEventListener("click",mapClick);
$("fVis").onclick=()=>{S.filter="vis";$("fVis").setAttribute("aria-pressed","true");$("fAll").setAttribute("aria-pressed","false");renderRoster()};
$("fAll").onclick=()=>{S.filter="all";$("fAll").setAttribute("aria-pressed","true");$("fVis").setAttribute("aria-pressed","false");renderRoster()};
$("redBtn").onclick=()=>{const on=document.documentElement.classList.toggle("red");$("redBtn").setAttribute("aria-pressed",String(on));store.set("sky-red",on)};
if(store.get("sky-red")){document.documentElement.classList.add("red");$("redBtn").setAttribute("aria-pressed","true")}
const saved=store.get("sky-loc");
if(saved&&typeof saved.lat==="number"){setLoc(saved.lat,saved.lon,saved.tz||browserTz,saved.label||"Saved location",true);showChooser(false)}
else{const c=CITIES.find(c=>c[3]===browserTz)||CITIES[0];setLoc(c[1],c[2],c[3],c[0],true);store.set("sky-loc",null);showChooser(true)}
