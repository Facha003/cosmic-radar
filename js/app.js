/* ---------- UI ---------- */
const $=id=>document.getElementById(id);
const HOSTED="https://facha003.github.io/tonights-sky-atlas/"; // GitHub Pages address, opened from the claude.ai copy for location
const S={lat:40.71,lon:-74.01,tz:"America/New_York",label:"New York",t:Date.now(),live:true,sel:null,more:false,wx:null,win:null,sums:{}};
const browserTz=(()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone}catch(e){return "UTC"}})();
const store={get(k){try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};

function fmt(t){return new Intl.DateTimeFormat(undefined,{hour:"numeric",minute:"2-digit",timeZone:S.tz}).format(new Date(t))}
function esc(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
const cap=s=>s[0].toUpperCase()+s.slice(1);
const DIR8=["north","northeast","east","southeast","south","southwest","west","northwest"];
const dir8=az=>DIR8[Math.round(norm(az)/45)%8];
const heightWord=alt=>alt>=75?"overhead":alt>=50?"high up":alt>=25?"halfway up":"low";
const reduceMotion=()=>matchMedia("(prefers-reduced-motion: reduce)").matches;

// Brightest star of each constellation: brighter patterns are easier to find, so they go first
for(const k in CONS){const c=CONS[k];c.br=c.stars.slice().sort((a,b)=>STARS[a][4]-STARS[b][4])[0];c.mag=STARS[c.br][4]}

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
  Object.assign(S,{lat,lon,tz,label,sel:null,more:false});
  store.set("sky-loc",{lat,lon,tz,label});
  const i=CITIES.findIndex(c=>c[0]===label);$("city").value=i>=0?String(i):"custom";
  $("lat").value=lat.toFixed(2);$("lon").value=lon.toFixed(2);
  if(!quiet)$("msg").textContent="";
  computeNight();loadWeather();
}

/* night */
// Before dark, show the sky as it will be at dusk
function nowOrDusk(){const n=Date.now();return n<S.win.dusk?S.win.dusk:n}
function computeNight(){
  const w=nightWindow(Date.now(),S.lat,S.lon,S.tz);S.win=w;
  S.sums={};
  for(const k in CONS){const c=CONS[k],tr=track(c.c.ra,c.c.dec,w,S.lat,S.lon);S.sums[k]={tr,sum:summarize(tr)}}
  const ph=moonPhase((w.dusk+w.dawn)/2);
  let upCount=0,n=0,rise=null,set=null,prev=null;
  for(let t=w.sunset;t<=w.sunrise;t+=10*60000){const a=moonAltAz(t,S.lat,S.lon).alt;if(t>=w.dusk&&t<=w.dawn){n++;if(a>0)upCount++}if(prev!==null){if(prev<=0&&a>0&&!rise)rise=t;if(prev>0&&a<=0&&!set)set=t}prev=a}
  Object.assign(S,{phase:ph,moonUp:n?upCount/n:0,moonRise:rise,moonSet:set,t:nowOrDusk(),live:true});
  const day=new Intl.DateTimeFormat(undefined,{weekday:"long",month:"long",day:"numeric",timeZone:S.tz}).format(new Date(w.dusk));
  $("where").textContent=`${S.label} · ${day}`;
  const sl=$("slider");sl.max=Math.round((w.sunrise-w.sunset)/300000);
  renderAll();
}
function renderAll(){
  renderConditions();renderList();renderFinder();
  $("slider").value=Math.round((S.t-S.win.sunset)/300000);$("tLabel").textContent=fmt(S.t);
  if($("mapBox").open)renderMap();
}

/* conditions: one line */
function renderConditions(){
  const w=S.win;let avg=null;
  if(S.wx){const dark=S.wx.filter(h=>h.t>=w.dusk&&h.t<=w.dawn);avg=dark.length?dark.reduce((a,h)=>a+h.c,0)/dark.length:null}
  let score=100;
  if(w.quality!=="full")score-=w.quality==="nautical"?20:40;
  score-=S.phase.illum*S.moonUp*45;
  if(avg!=null)score-=avg*0.7;
  const [lbl,cls]=score>=75?["Great night for stars","p-good"]:score>=55?["Good night for stars","p-good"]:score>=35?["Fair night","p-warn"]:["Poor night","p-bad"];
  const bits=[w.quality==="full"?`Dark ${fmt(w.dusk)}–${fmt(w.dawn)}`:"Never fully dark tonight"];
  const ms=S.moonUp<.05?"down all night":S.moonSet&&(!S.moonRise||S.moonSet<S.moonRise)?`sets ${fmt(S.moonSet)}`:S.moonRise?`rises ${fmt(S.moonRise)}`:"up all night";
  bits.push(`Moon ${Math.round(S.phase.illum*100)}%, ${ms}`);
  if(avg!=null)bits.push(avg<15?"Clear":avg<40?"Mostly clear":avg<70?"Partly cloudy":"Cloudy");
  $("verdict").innerHTML=`<span class="pill ${cls}">${lbl}</span> <span>${esc(bits.join(" · "))}</span>`;
}
async function loadWeather(){
  S.wx=null;
  const ctrl=new AbortController(),to=setTimeout(()=>ctrl.abort(),7000);
  try{
    const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${S.lat.toFixed(3)}&longitude=${S.lon.toFixed(3)}&hourly=cloud_cover&timezone=UTC&forecast_days=3`,{signal:ctrl.signal});
    if(!r.ok)throw new Error(r.status);
    const j=await r.json();
    S.wx=j.hourly.time.map((t,i)=>({t:Date.parse(t+"Z"),c:j.hourly.cloud_cover[i]})).filter(h=>h.c!=null);
  }catch(e){S.wx=null}
  clearTimeout(to);renderConditions();
}

/* up now list */
function upNow(){
  return Object.keys(CONS).map(k=>({k,p:altaz(CONS[k].c.ra,CONS[k].c.dec,S.t,S.lat,S.lon)}))
    .filter(o=>o.p.alt>=VIS).sort((a,b)=>CONS[a.k].mag-CONS[b.k].mag);
}
function whenLabel(){
  if(!S.live)return `Up at ${fmt(S.t)}`;
  return Date.now()<S.win.dusk?`Up once it's dark (${fmt(S.win.dusk)})`:"Up now";
}
const selCon=()=>S.sel?(S.sel.type==="con"?S.sel.id:STARS[S.sel.id][1]):null;
function arrowSvg(az){return `<svg class="arrow" viewBox="-12 -12 24 24" data-az="${az.toFixed(1)}" aria-hidden="true"><circle r="11" fill="none" stroke="var(--line)"/><path d="M0 -8L5 6L0 3L-5 6Z" fill="var(--gilt)"/></svg>`}
function overheadSvg(){return `<svg class="arrow" viewBox="-12 -12 24 24" aria-hidden="true"><circle r="11" fill="none" stroke="var(--line)"/><circle r="4" fill="var(--gilt)"/></svg>`}
function updateArrows(){const h=Compass.heading||0;document.querySelectorAll(".arrow[data-az]").forEach(a=>a.style.transform=`rotate(${+a.dataset.az-h}deg)`)}
function renderList(){
  const up=upNow(),shown=S.more?up:up.slice(0,6);
  if(!S.sel&&up.length)S.sel={type:"con",id:up[0].k};
  $("listHead").textContent=whenLabel();
  const sk=selCon();
  $("list").innerHTML=shown.map(({k,p})=>`<li><button type="button" class="row${k===sk?" sel":""}" data-k="${k}">${p.alt>=75?overheadSvg():arrowSvg(p.az)}<span class="nm">${esc(CONS[k].n)}</span><span class="where">${p.alt>=75?"Straight overhead":`${cap(dir8(p.az))} · ${heightWord(p.alt)}`}</span></button></li>`).join("")
    ||`<li class="empty">Nothing is high enough to see easily right now.</li>`;
  $("moreBtn").hidden=up.length<=6;
  $("moreBtn").textContent=S.more?"Show fewer":`Show ${up.length-6} more`;
  // A few bright ones still to come
  const upSet=new Set(up.map(o=>o.k));
  const later=Object.keys(CONS).filter(k=>!upSet.has(k)).map(k=>{const r=S.sums[k].tr.find(p=>p.t>S.t&&p.alt>=VIS);return r&&{k,t:r.t}})
    .filter(Boolean).sort((a,b)=>CONS[a.k].mag-CONS[b.k].mag).slice(0,3).sort((a,b)=>a.t-b.t);
  $("later").hidden=!later.length;
  $("later").innerHTML=later.length?"Later tonight: "+later.map(o=>`<button class="link" type="button" data-k="${o.k}">${esc(CONS[o.k].n)}</button> after ${fmt(o.t)}`).join(", "):"";
  document.querySelectorAll("#list [data-k], #later [data-k]").forEach(b=>b.onclick=()=>select("con",b.dataset.k,true));
  updateArrows();
}

/* finder: compass + how it looks */
function selRaDec(sel){if(sel.type==="con")return CONS[sel.id].c;const s=STARS[sel.id];return {ra:s[2]*15,dec:s[3]}}
function select(type,id,scroll){
  S.sel={type,id};renderList();renderFinder();
  if($("mapBox").open)renderMap();
  if(scroll)$("finder").scrollIntoView({behavior:reduceMotion()?"auto":"smooth",block:"start"});
}
function renderFinder(){
  const sel=S.sel,f=$("finder");
  if(!sel){f.hidden=true;return}
  f.hidden=false;
  const isCon=sel.type==="con",k=selCon(),c=CONS[k],rd=selRaDec(sel);
  S.tp=altaz(rd.ra,rd.dec,S.t,S.lat,S.lon);
  const r=track(rd.ra,rd.dec,S.win,S.lat,S.lon).find(p=>p.t>S.t&&p.alt>=VIS);S.tRise=r?r.t:null;
  $("fKind").textContent=isCon?c.m:`A star in ${c.n}`;
  $("fName").textContent=isCon?c.n:STARS[sel.id][0];
  drawDial();S.say=null;updateHeading();
  const above=S.tp.alt>0;
  $("shapeFig").hidden=!above;
  if(above){$("shape").innerHTML=shapeSvg(k,isCon?null:sel.id);$("shapeCap").textContent=`How it looks facing ${dir8(S.tp.az)}`}
  $("fTip").textContent=isCon?c.tip:(FACTS[sel.id]||seeIt(STARS[sel.id][4])+".");
  $("fMore").innerHTML=isCon?moreCon(k):moreStar(sel.id);
  $("fMore").querySelectorAll("[data-star]").forEach(b=>b.onclick=()=>select("star",b.dataset.star));
  $("fMore").querySelectorAll("[data-con]").forEach(b=>b.onclick=()=>select("con",b.dataset.con));
}
function drawDial(){
  const p=S.tp;let g=`<circle r="100" fill="var(--panel)" stroke="var(--line)"/><g id="dialRot">`;
  for(let a=0;a<360;a+=15){
    const L=a%90===0?10:a%45===0?7:4,s=Math.sin(a*D2R),c=-Math.cos(a*D2R);
    g+=`<line x1="${(s*95).toFixed(1)}" y1="${(c*95).toFixed(1)}" x2="${(s*(95-L)).toFixed(1)}" y2="${(c*(95-L)).toFixed(1)}" stroke="var(--muted)" stroke-width="${a%90?1:1.5}"/>`;
  }
  [["N",0],["E",90],["S",180],["W",270]].forEach(([l,a])=>{
    const x=(Math.sin(a*D2R)*74).toFixed(1),y=(-Math.cos(a*D2R)*74).toFixed(1);
    g+=`<text class="lbl" data-x="${x}" data-y="${y}" x="${x}" y="${y}" dy=".36em" text-anchor="middle" fill="${l==="N"?"var(--gilt)":"var(--fg)"}" font-size="15" font-family="var(--display)" font-weight="700">${l}</text>`;
  });
  if(p.alt>0){
    const x=(Math.sin(p.az*D2R)*54).toFixed(1),y=(-Math.cos(p.az*D2R)*54).toFixed(1);
    g+=`<line x1="0" y1="0" x2="${x}" y2="${y}" stroke="var(--gilt)" stroke-width="3" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="8" fill="var(--gilt)"/>`;
  }
  g+=`</g><circle r="4" fill="var(--fg)"/><path id="facing" d="M0 -113L7 -102L-7 -102Z" fill="var(--fg)" hidden/>`;
  $("dial").innerHTML=g;
}
function updateHeading(){
  updateArrows();
  const p=S.tp;if(!p||$("finder").hidden)return;
  const h=Compass.heading;
  $("dialRot").setAttribute("transform",`rotate(${-(h||0)})`);
  document.querySelectorAll("#dial .lbl").forEach(t=>t.setAttribute("transform",`rotate(${h||0} ${t.dataset.x} ${t.dataset.y})`));
  $("facing").toggleAttribute("hidden",h==null);
  let say,up,on=false;
  if(p.alt<0){say="Below the horizon right now";up=S.tRise?`It comes up after ${fmt(S.tRise)}.`:"It doesn't get high enough to see tonight."}
  else if(p.alt>=75){say="Look straight up";up="It's almost directly above you."}
  else{
    if(h==null)say=`Face ${dir8(p.az)}`;
    else{const d=((p.az-h+540)%360)-180;on=Math.abs(d)<12;say=on?"You're facing it":`Turn ${Math.abs(d)<45?"a little ":""}${d>0?"right":"left"}`}
    const f=Math.max(1,Math.round(p.alt/10));
    up=`Then look up about ${f} fist${f>1?"s":""} above the horizon.`;
  }
  if(say!==S.say){S.say=say;$("fSay").textContent=say;$("fSay").classList.toggle("on",on)}
  $("fUp").textContent=up;
  $("fistNote").hidden=p.alt<0||p.alt>=75;
}

/* constellation drawn as you see it: facing its direction, with up toward the zenith */
function vec(p){const a=p.alt*D2R,z=p.az*D2R;return [Math.cos(a)*Math.sin(z),Math.cos(a)*Math.cos(z),Math.sin(a)]}
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function shapeSvg(k,hi){
  const c=CONS[k],cv=vec(altaz(c.c.ra,c.c.dec,S.t,S.lat,S.lon));
  let up=[0,0,1];const d=dot(up,cv);up=up.map((x,i)=>x-d*cv[i]);
  const ul=Math.hypot(...up);up=ul<1e-3?[0,1,0]:up.map(x=>x/ul);
  const rt=cross(cv,up);
  const pr=(alt,az)=>{const v=vec({alt,az}),z=dot(v,cv);return z>.2?[dot(v,rt)/z,-dot(v,up)/z]:null};
  const ids=new Set(c.l.flat());if(hi)ids.add(hi);
  const P={};
  for(const id of ids){const s=STARS[id],a=altaz(s[2]*15,s[3],S.t,S.lat,S.lon),q=pr(a.alt,a.az);if(q)P[id]=q}
  const xs=Object.values(P).map(q=>q[0]),ys=Object.values(P).map(q=>q[1]);
  if(!xs.length)return "";
  const W=300,H=190,pad=22,cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
  const sc=Math.min((W-2*pad)/Math.max(.05,Math.max(...xs)-Math.min(...xs)),(H-2*pad)/Math.max(.05,Math.max(...ys)-Math.min(...ys)));
  const X=q=>(W/2+(q[0]-cx)*sc).toFixed(1),Y=q=>(H/2+(q[1]-cy)*sc).toFixed(1);
  let g="";
  // horizon, when it's in view
  const az0=Math.atan2(cv[0],cv[1])*R2D,hz=[];
  for(let a=-80;a<=80;a+=4){const q=pr(0,az0+a);if(q)hz.push(`${X(q)},${Y(q)}`)}
  if(hz.length>1)g+=`<polyline points="${hz.join(" ")}" fill="none" stroke="var(--muted)" stroke-dasharray="4 4"/><text x="8" y="${H-8}" fill="var(--muted)" font-size="11" font-family="var(--body)">horizon below</text>`;
  for(const [a,b] of c.l)if(P[a]&&P[b])g+=`<line x1="${X(P[a])}" y1="${Y(P[a])}" x2="${X(P[b])}" y2="${Y(P[b])}" stroke="var(--gilt)" stroke-opacity=".55" stroke-width="1.4"/>`;
  for(const id in P){
    const s=STARS[id],r=starR(s[4])+.6;
    g+=`<circle cx="${X(P[id])}" cy="${Y(P[id])}" r="${r.toFixed(2)}" fill="${SPC[s[5][0]]||"#fff"}"/>`;
    if(id===hi)g+=`<circle cx="${X(P[id])}" cy="${Y(P[id])}" r="${(r+5).toFixed(1)}" fill="none" stroke="var(--gilt)" stroke-width="1.5"/>`;
    if(id===c.br||id===hi)g+=`<text x="${(+X(P[id])+r+4).toFixed(1)}" y="${(+Y(P[id])+4).toFixed(1)}" fill="var(--fg)" font-size="12" font-family="var(--body)">${esc(s[0])}</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(c.n)} as it looks right now">${g}</svg>`;
}

/* more about it (closed by default) */
function lightLeft(ly){
  if(ly>=1e6)return `about ${(ly/1e6).toFixed(1)} million years ago`;
  if(ly>=20000)return `about ${Math.round(ly/1000).toLocaleString()} thousand years ago`;
  const y=Math.round(new Date().getFullYear()-ly);
  return y>0?`around the year ${y}`:`around ${(-y+1).toLocaleString()} BCE`;
}
const TEMP={O:"35,000",B:"20,000",A:"9,000",F:"7,000",G:"5,600",K:"4,500",M:"3,300",W:"50,000+"};
const COLOR={O:"blue",B:"blue-white",A:"white",F:"yellow-white",G:"yellow",K:"orange",M:"red-orange",W:"blue"};
function seeIt(m){return m<1?"Very bright, easy even from a city":m<2.2?"Easy from a city":m<3.5?"Visible from the suburbs":m<4.8?"Needs a dark sky":"Binoculars or a dark rural sky"}
function moreCon(k){
  const c=CONS[k],stars=c.stars.slice().sort((a,b)=>STARS[a][4]-STARS[b][4]).slice(0,5);
  return `<p>${esc(c.myth)}</p><p class="note">Best seen: ${esc(c.best)}</p>
    <div class="chips">${stars.map(id=>`<button class="chip" type="button" data-star="${id}">${esc(STARS[id][0])}</button>`).join("")}</div>`;
}
function moreStar(id){
  const s=STARS[id],cl=s[5][0];
  const dist=s[6]>=1e6?`${(s[6]/1e6).toFixed(1)} million light-years`:`${s[6].toLocaleString()} light-years`;
  return `<dl class="facts"><dt>Distance</dt><dd>${dist}</dd><dt>Its light left</dt><dd>${lightLeft(s[6])}</dd>
    ${isDeep(id)?"":`<dt>Color</dt><dd>${COLOR[cl]||""}, about ${TEMP[cl]||"?"} K</dd>`}<dt>Brightness</dt><dd>${esc(seeIt(s[4]))}</dd></dl>
    <div class="chips"><button class="chip" type="button" data-con="${s[1]}">Back to ${esc(CONS[s[1]].n)}</button></div>`;
}

/* whole sky map (closed by default) */
const CX=320,CY=320,RAD=286;
function proj(alt,az){const r=(90-alt)/90*RAD,a=az*D2R;return [CX-r*Math.sin(a),CY-r*Math.cos(a)]}
const SPC={O:"#a8c2ff",B:"#bcd0ff",A:"#e9eeff",F:"#fff5e2",G:"#ffe6ad",K:"#ffc583",M:"#ff9a6a",W:"#a8c2ff"};
const starR=m=>Math.max(0.9,4.4-0.85*m);
let mapPts=[],labelPts=[];
function moonSvg(ph,cx,cy,R){
  const k=ph.illum,rx=Math.abs(2*k-1)*R,sweep=k>0.5?1:0,flip=ph.waxing?"":`transform="translate(${2*cx} 0) scale(-1 1)"`;
  return `<circle cx="${cx}" cy="${cy}" r="${R}" fill="#1f2840" stroke="#3a4766"/>`+
   (k>0.01?`<path ${flip} d="M${cx} ${cy-R} A${R} ${R} 0 0 1 ${cx} ${cy+R} A${rx} ${R} 0 0 ${sweep} ${cx} ${cy-R}Z" fill="#efe7cf"/>`:"");
}
function renderMap(){
  const t=S.t,svg=$("map");mapPts=[];labelPts=[];
  const sk=selCon();
  let g=`<defs><clipPath id="disc"><circle cx="${CX}" cy="${CY}" r="${RAD}"/></clipPath><radialGradient id="glow"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>`;
  g+=`<circle cx="${CX}" cy="${CY}" r="${RAD}" fill="var(--sky)" stroke="var(--gilt)" stroke-width="1.5"/>`;
  for(const a of [30,60])g+=`<circle cx="${CX}" cy="${CY}" r="${(90-a)/90*RAD}" fill="none" stroke="var(--line)" stroke-dasharray="3 5"/>`;
  [["N",0],["E",90],["S",180],["W",270]].forEach(([l,az])=>{const [x,y]=proj(-7.5,az);g+=`<text x="${x}" y="${y+6}" text-anchor="middle" fill="var(--gilt)" font-size="17" font-family="var(--display)" font-weight="700">${l}</text>`});
  g+=`<g clip-path="url(#disc)">`;
  const pos={};
  for(const id in STARS){const s=STARS[id];pos[id]=altaz(s[2]*15,s[3],t,S.lat,S.lon)}
  for(const k in CONS){
    const on=k===sk;
    for(const [a,b] of CONS[k].l){
      const pa=pos[a],pb=pos[b];if(pa.alt<-3&&pb.alt<-3)continue;
      const [x1,y1]=proj(pa.alt,pa.az),[x2,y2]=proj(pb.alt,pb.az);
      g+=`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${on?"var(--gilt)":"#4c6390"}" stroke-width="${on?1.8:1}" stroke-opacity="${on?1:.7}"/>`;
    }
  }
  for(const id in STARS){
    const s=STARS[id],p=pos[id];if(p.alt<0)continue;
    const [x,y]=proj(p.alt,p.az);mapPts.push({id,x,y,m:s[4]});
    const sel=S.sel&&S.sel.type==="star"&&S.sel.id===id;
    if(isDeep(id)){g+=`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="url(#glow)"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="none" stroke="#9fb3d9" stroke-dasharray="1.5 1.5" stroke-width=".8"/>`}
    else{const r=starR(s[4]);g+=`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="${SPC[s[5][0]]||"#fff"}"/>`;if(s[4]<1.3)g+=`<text x="${(x+r+3).toFixed(1)}" y="${(y+3.5).toFixed(1)}" fill="#c9d3e8" font-size="10.5" font-family="var(--body)">${esc(s[0])}</text>`}
    if(sel)g+=`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" fill="none" stroke="var(--gilt)" stroke-width="1.5"/>`;
  }
  const mp=moonAltAz(t,S.lat,S.lon);
  if(mp.alt>0){const [x,y]=proj(mp.alt,mp.az);g+=`<g>${moonSvg(S.phase,x,y,9)}</g><text x="${x+12}" y="${y+4}" fill="#efe7cf" font-size="11" font-family="var(--body)">Moon</text>`}
  for(const k in CONS){
    const c=CONS[k],p=altaz(c.c.ra,c.c.dec,t,S.lat,S.lon);if(p.alt<3)continue;
    const [x,y]=proj(p.alt,p.az);labelPts.push({k,x,y});
    const on=k===sk;
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
  if(best&&bd<14){select("star",best.id,true);return}
  let bl=null,bld=1e9;for(const l of labelPts){const d=Math.hypot(l.x-p.x,l.y+10-p.y);if(d<bld){bld=d;bl=l}}
  if(bl&&bld<40)select("con",bl.k,true);
}

/* time */
function setTime(t,live){S.t=t;S.live=live;renderAll()}

/* compass button: phones only */
function initCompass(){
  const b=$("compassBtn");
  if(!Compass.supported()||!matchMedia("(pointer: coarse)").matches)return;
  b.hidden=false;
  Compass.onChange=updateHeading;
  const go=async()=>{
    b.disabled=true;
    const r=await Compass.start();
    b.hidden=true;
    if(r==="ok")store.set("sky-compass",true);
    else $("compassNote").textContent=r==="denied"?"Compass access is off. Use the directions instead.":"No compass found on this device. Use the directions instead.";
  };
  b.onclick=go;
  // Android needs no permission, so turn it back on by itself next time
  if(store.get("sky-compass")&&typeof DeviceOrientationEvent.requestPermission!=="function")go();
}

/* boot */
initCities();initCompass();
$("moreBtn").onclick=()=>{S.more=!S.more;renderList()};
$("slider").addEventListener("input",e=>setTime(S.win.sunset+e.target.value*300000,false));
$("nowBtn").onclick=()=>setTime(nowOrDusk(),true);
$("map").addEventListener("click",mapClick);
$("mapBox").addEventListener("toggle",()=>{if($("mapBox").open)renderMap()});
$("redBtn").onclick=()=>{const on=document.documentElement.classList.toggle("red");$("redBtn").setAttribute("aria-pressed",String(on));store.set("sky-red",on)};
if(store.get("sky-red")){document.documentElement.classList.add("red");$("redBtn").setAttribute("aria-pressed","true")}
const saved=store.get("sky-loc");
if(saved&&typeof saved.lat==="number"){setLoc(saved.lat,saved.lon,saved.tz||browserTz,saved.label||"Saved location",true);showChooser(false)}
else{const c=CITIES.find(c=>c[3]===browserTz)||CITIES[0];setLoc(c[1],c[2],c[3],c[0],true);store.set("sky-loc",null);showChooser(true)}
// Keep "up now" current while the page is open
setInterval(()=>{if(S.live&&!document.hidden){S.t=nowOrDusk();renderAll()}},60000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&S.live)computeNight()});
