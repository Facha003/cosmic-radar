/* ---------- UI ---------- */
const $=id=>document.getElementById(id);
const HOSTED="https://facha003.github.io/cosmic-radar/"; // GitHub Pages address, opened from the claude.ai copy for location
const store={get(k){try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const S={lat:40.71,lon:-74.01,tz:"America/New_York",label:"New York",t:Date.now(),live:true,mode:store.get("sky-mode")==="now"?"now":"dark",sel:null,wx:null,win:null,sums:{}};
const browserTz=(()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone}catch(e){return "UTC"}})();

function fmt(t){return new Intl.DateTimeFormat(undefined,{hour:"numeric",minute:"2-digit",timeZone:S.tz}).format(new Date(t))}
function esc(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
const cap=s=>s[0].toUpperCase()+s.slice(1);
const DIR8=["north","northeast","east","southeast","south","southwest","west","northwest"];
const dir8=az=>DIR8[Math.round(norm(az)/45)%8];
const heightWord=alt=>alt>=75?"overhead":alt>=50?"high up":alt>=25?"halfway up":"low";
const SPC={O:"#a8c2ff",B:"#bcd0ff",A:"#e9eeff",F:"#fff5e2",G:"#ffe6ad",K:"#ffc583",M:"#ff9a6a",W:"#a8c2ff"};
const starR=m=>Math.max(0.9,4.4-0.85*m);
const PCOL={mercury:"#c9c1b5",venus:"#fff6d8",mars:"#ff9a6a",jupiter:"#ffe9c4",saturn:"#f3dca0"};

// Brightest star of each constellation
for(const k in CONS){const c=CONS[k];c.br=c.stars.slice().sort((a,b)=>STARS[a][4]-STARS[b][4])[0]}
// Fill in each famous sight's stars, lines, center and brightest star
const SIGHT={};
for(const x of SIGHTS){
  SIGHT[x.id]=x;
  if(x.planet)continue; // planets move, so their place is set each night in computeNight
  if(x.l==="con"){x.l=CONS[x.con].l;x.s=[...new Set(x.l.flat())]}
  x.c=x.s.length>1?centroid(x.s):{ra:STARS[x.s[0]][2]*15,dec:STARS[x.s[0]][3]};
  x.br=x.s.slice().sort((a,b)=>STARS[a][4]-STARS[b][4])[0];
}
// Planets lost in the Sun's glare are left out
const inGlare=x=>x.planet&&x.pp.elong<12;

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
  Object.assign(S,{lat,lon,tz,label,sel:null});
  store.set("sky-loc",{lat,lon,tz,label});
  const i=CITIES.findIndex(c=>c[0]===label);$("city").value=i>=0?String(i):"custom";
  $("lat").value=lat.toFixed(2);$("lon").value=lon.toFixed(2);
  if(!quiet)$("msg").textContent="";
  computeNight();loadWeather();
  if(Aurora.open)Aurora.show();
}

/* tabs */
function showTab(name){
  const aur=name==="aur";
  $("paneSky").hidden=aur;$("paneAur").hidden=!aur;
  $("tabSky").setAttribute("aria-selected",String(!aur));$("tabAur").setAttribute("aria-selected",String(aur));
  store.set("sky-tab",name);
  if(aur)Aurora.show();
}

/* night */
// Before dark, show the sky as it will be at dusk, unless "Right now" is chosen
function nowOrDusk(){const n=Date.now();return S.mode==="dark"&&n<S.win.dusk?S.win.dusk:n}
function computeNight(){
  const w=nightWindow(Date.now(),S.lat,S.lon,S.tz);S.win=w;
  const mid=(w.dusk+w.dawn)/2;
  for(const x of SIGHTS)if(x.planet){x.pp=planetPos(x.planet,mid);x.c={ra:x.pp.ra,dec:x.pp.dec}}
  S.sums={};
  for(const x of SIGHTS)S.sums[x.id]=track(x.c.ra,x.c.dec,w,S.lat,S.lon);
  const ph=moonPhase(mid);
  let upCount=0,n=0,rise=null,set=null,prev=null;
  for(let t=w.sunset;t<=w.sunrise;t+=10*60000){const a=moonAltAz(t,S.lat,S.lon).alt;if(t>=w.dusk&&t<=w.dawn){n++;if(a>0)upCount++}if(prev!==null){if(prev<=0&&a>0&&!rise)rise=t;if(prev>0&&a<=0&&!set)set=t}prev=a}
  Object.assign(S,{phase:ph,moonUp:n?upCount/n:0,moonRise:rise,moonSet:set,t:nowOrDusk(),live:true});
  const day=new Intl.DateTimeFormat(undefined,{weekday:"long",month:"long",day:"numeric",timeZone:S.tz}).format(new Date(w.dusk));
  $("where").textContent=`${S.label} · ${day}`;
  renderAll();
}
function renderAll(){
  renderConditions();renderSpecial();
  $("radarTime").textContent=whenLabel();
  $("modeSeg").hidden=Date.now()>=S.win.dusk;
  $("modeSeg").querySelectorAll("button").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.mode===S.mode)));
  Radar.rebuild();Radar.updateSats();renderQuick();renderFinder();Aurora.render();
}
function whenLabel(){
  if(Date.now()<S.win.dusk&&S.mode==="dark")return `Sky at dark · ${fmt(S.win.dusk)}`;
  return `Live · ${fmt(S.t)}`+(Date.now()<S.win.dusk?" · still light out":"");
}

/* conditions: one line */
function renderConditions(){
  const w=S.win;let avg=null;
  if(S.wx){const dark=S.wx.filter(h=>h.t>=w.dusk&&h.t<=w.dawn);avg=dark.length?dark.reduce((a,h)=>a+h.c,0)/dark.length:null}
  const {label,cls}=skyVerdict({quality:w.quality,moonIllum:S.phase.illum,moonUp:S.moonUp,avgCloud:avg});
  const bits=[w.quality==="full"?`Dark ${fmt(w.dusk)}–${fmt(w.dawn)}`:"Never fully dark tonight"];
  const ms=S.moonUp<.05?"down all night":S.moonSet&&(!S.moonRise||S.moonSet<S.moonRise)?`sets ${fmt(S.moonSet)}`:S.moonRise?`rises ${fmt(S.moonRise)}`:"up all night";
  bits.push(`Moon ${Math.round(S.phase.illum*100)}%, ${ms}`);
  bits.push(avg==null?"Cloud forecast unavailable":avg<15?"Clear":avg<40?"Mostly clear":avg<70?"Partly cloudy":"Cloudy");
  $("verdict").innerHTML=`<span class="pill ${cls}">${label}</span> <span>${esc(bits.join(" · "))}</span>`;
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
  clearTimeout(to);renderConditions();Aurora.render();
}

/* quick picks under the radar: famous things up now */
function upNow(){
  return SIGHTS.map(x=>({x,p:altaz(x.c.ra,x.c.dec,S.t,S.lat,S.lon)})).filter(o=>o.p.alt>=VIS&&!inGlare(o.x));
}
function renderQuick(){
  const picks=upNow().slice(0,6).map(o=>({sel:{type:"sight",id:o.x.id},n:o.x.n.replace(/,.*$/,"")}));
  const iss=Radar.sats.find(s=>s.sel.id==="25544"&&s.seen);
  if(iss)picks.unshift({sel:iss.sel,n:"ISS"});
  const on=S.sel?`${S.sel.type}:${S.sel.id}`:"";
  $("quick").innerHTML=picks.length?`<span class="note">Up now:</span>`+picks.map(p=>`<button type="button" class="chip${on===`${p.sel.type}:${p.sel.id}`?" sel":""}" data-t="${p.sel.type}" data-id="${p.sel.id}">${esc(p.n)}</button>`).join(""):"";
  $("quick").querySelectorAll("[data-id]").forEach(b=>b.onclick=()=>{toggleSel(b.dataset.t,b.dataset.id);if(S.sel)$("finder").scrollIntoView({behavior:reduceMotion()?"auto":"smooth",block:"nearest"})});
}

/* info card: what it is, how far, visible tonight, and which way to look */
const selCon=()=>{const s=S.sel;if(!s)return null;if(s.type==="con")return s.id;if(s.type==="star")return STARS[s.id][1];if(s.type==="sight")return SIGHT[s.id].con||null;return null};
function selRaDec(sel){
  if(sel.type==="sight")return SIGHT[sel.id].c;
  if(sel.type==="con")return CONS[sel.id].c;
  const s=STARS[sel.id];return {ra:s[2]*15,dec:s[3]};
}
function selPos(sel){
  if(sel.type==="moon")return moonAltAz(S.t,S.lat,S.lon);
  const rd=selRaDec(sel);return altaz(rd.ra,rd.dec,S.t,S.lat,S.lon);
}
function select(type,id){
  S.sel={type,id};renderQuick();renderFinder();Radar.lastDraw=0;
}
function deselect(){S.sel=null;renderQuick();renderFinder();Radar.lastDraw=0}
// Tapping what's already open closes it
const isSel=(type,id)=>S.sel&&S.sel.type===type&&S.sel.id===id;
function toggleSel(type,id){if(isSel(type,id))deselect();else select(type,id)}
const bestWhere=(alt,az)=>alt>=75?"almost overhead":`${heightWord(alt)} in the ${dir8(az)}`;
function visTonight(ra,dec){
  const tr=track(ra,dec,S.win,S.lat,S.lon),s=summarize(tr),b=s.best;
  const best=b&&b.alt>=VIS?` Best around ${fmt(b.t)}, ${bestWhere(b.alt,b.az)}.`:"";
  S.tRise=(tr.find(p=>p.t>S.t&&p.alt>=VIS)||{}).t||null;
  switch(s.kind){
    case "all":return "Yes, all night."+best;
    case "sets":return `Yes, until about ${fmt(s.t)}.`+best;
    case "rises":return `Yes, from about ${fmt(s.t)}.`+best;
    case "window":return `Yes, from ${fmt(s.t1)} to ${fmt(s.t2)}.`+best;
    case "low":return "Only very low on the horizon tonight.";
    default:return "No, it stays below the horizon tonight.";
  }
}
function moonVis(){
  S.tRise=S.moonRise&&S.moonRise>S.t?S.moonRise:null;
  if(S.moonUp>.95)return "Yes, all night.";
  if(S.moonUp<.05)return "No, it's down during the dark hours tonight.";
  return S.moonSet&&(!S.moonRise||S.moonSet<S.moonRise)?`Yes, until it sets at ${fmt(S.moonSet)}.`:`Yes, after it rises at ${fmt(S.moonRise)}.`;
}
function farStar(id){
  const ly=STARS[id][6];
  return `${ly>=1e6?`${(ly/1e6).toFixed(1)} million`:ly.toLocaleString()} light-years. The light you see left it ${lightLeft(ly)}.`;
}
function farGroup(ids){
  const d=ids.filter(id=>!isDeep(id)).map(id=>STARS[id][6]),a=Math.min(...d),b=Math.max(...d);
  return a===b?`${a.toLocaleString()} light-years.`:`Its stars are ${a.toLocaleString()} to ${b.toLocaleString()} light-years away. They only look close together from Earth.`;
}
function renderFinder(){
  const sel=S.sel,f=$("finder");
  if(!sel){f.hidden=true;return}
  const k=selCon(),c=k&&CONS[k];
  let kind,name,what,far="",vis,tip="",more="",shape=null;
  S.tRise=null;
  if(sel.type==="sat"){
    const s=Sats.byId(sel.id);if(!s){S.sel=null;f.hidden=true;return}
    kind="Satellite";name=s.name;
    what=s.info?s.info.what:/rocket stage$/.test(s.name)?"A used rocket stage still circling Earth.":"A satellite. You see it because it reflects sunlight.";
    tip="Satellites look like steady stars gliding across the sky. They fade out when they pass into Earth's shadow.";
    const pass=Sats.nextPass(s,Math.max(Date.now(),S.win.sunset));S.tRise=pass?pass.start:null;
    vis=pass?`Yes. Next visible pass at ${fmt(pass.start)}: it appears in the ${dir8(pass.startAz)}, climbs to ${Math.round(pass.max)}° in the ${dir8(pass.maxAz)} and fades in the ${dir8(pass.endAz)}.`:"No visible passes tonight from here.";
  }else if(sel.type==="moon"){
    kind=`Moon · ${S.phase.name}`;name="The Moon";
    what=`Earth's only natural satellite, ${Math.round(S.phase.illum*100)}% lit tonight.`;
    far="About 384,000 km. Its light reaches you in just over a second.";vis=moonVis();
  }else if(sel.type==="sight"&&SIGHT[sel.id].planet){
    const x=SIGHT[sel.id],pp=x.pp,near=nearby(x.c,22),min=pp.dist*8.317;
    kind="Planet";name=x.n;what=PLANET_WHAT[x.planet];tip=x.tip;more=morePlanet(x);
    far=`${Math.round(pp.dist*149.6).toLocaleString()} million km. The sunlight you see bounced off it ${min<90?`${Math.round(min)} minutes`:`${(min/60).toFixed(1)} hours`} ago.`;
    vis=pp.elong<12?"No, it's too close to the Sun to see right now.":visTonight(x.c.ra,x.c.dec);
    shape={center:x.c,lines:[],faint:near.lines,ids:near.ids,ring:[],label:near.label,extra:[{ra:x.c.ra,dec:x.c.dec,name:x.n,color:PCOL[x.planet]}]};
  }else if(sel.type==="sight"){
    const x=SIGHT[sel.id],one=x.s.length===1?x.s[0]:null;
    kind=x.kind+(c?` in ${c.n}`:"");name=x.n;vis=visTonight(x.c.ra,x.c.dec);
    if(one){what=FACTS[one]||x.tip;tip=FACTS[one]?x.tip:"";far=farStar(one);more=moreStar(one);shape={center:c.c,lines:c.l,ring:[one],label:[one]}}
    else{what=x.tip;far=farGroup(x.s);more=moreSight(x);shape={center:x.c,lines:x.l,faint:c&&x.l!==c.l?c.l:[],ring:[],label:[x.br]}}
  }else if(sel.type==="con"){
    kind=`Constellation · ${c.m}`;name=c.n;what=c.myth;tip=c.tip;far=farGroup(c.stars);vis=visTonight(c.c.ra,c.c.dec);more=moreCon(k);
    shape={center:c.c,lines:c.l,ring:[],label:[c.br]};
  }else{
    const s=STARS[sel.id];
    kind=`${isDeep(sel.id)?cap(s[5]):"Star"} in ${c.n}`;name=s[0];what=FACTS[sel.id]||seeIt(s[4])+".";
    far=farStar(sel.id);vis=visTonight(s[2]*15,s[3]);more=moreStar(sel.id);
    shape={center:c.c,lines:c.l,ring:[sel.id],label:[sel.id,c.br]};
  }
  f.hidden=false;
  $("fKind").textContent=kind;$("fName").textContent=name;$("fWhat").textContent=what;$("fVis").textContent=vis;$("fFar").textContent=far;
  $("fTip").textContent=tip;
  $("moreBox").hidden=!more;$("fMore").innerHTML=more;
  $("fMore").querySelectorAll("[data-star]").forEach(b=>b.onclick=()=>select("star",b.dataset.star));
  $("fMore").querySelectorAll("[data-con]").forEach(b=>b.onclick=()=>select("con",b.dataset.con));
  S.tpSat=null;
  if(sel.type==="sat"){updateSatLive();return}
  S.tp=selPos(sel);
  drawDial();S.say=null;updateHeading();
  const above=S.tp.alt>0&&shape;
  $("shapeFig").hidden=!above;
  if(above){$("shape").innerHTML=shapeSvg(shape,name);$("shapeCap").textContent=`How it looks facing ${dir8(S.tp.az)}`}
}
// Satellites move, so their card refreshes every second
function updateSatLive(){
  const s=Sats.byId(S.sel.id),p=s&&Sats.look(s,satTime());if(!p)return;
  const seen=p.lit&&sunAltAt(satTime())<-6;
  $("fFar").textContent=`${Math.round(p.range).toLocaleString()} km away, ${Math.round(p.height)} km above Earth.`+(p.alt>0?(seen?" Visible right now.":p.lit?" Up now, but the sky is too bright to see it.":" Up now, but in Earth's shadow."):"");
  $("shapeFig").hidden=true;
  S.tp=p;
  if(S.tpSat!==S.sel.id){S.tpSat=S.sel.id;drawDial();S.say=null}
  else{const g=$("dial").querySelector(".target");if(g){g.setAttribute("transform",`rotate(${p.az})`);g.toggleAttribute("hidden",p.alt<=0)}}
  updateHeading();
}
function drawDial(){
  const p=S.tp;let g=`<circle r="100" fill="var(--panel)" stroke="var(--line)"/><g id="dialRot">`;
  for(let a=0;a<360;a+=15){
    const L=a%90===0?10:a%45===0?7:4,s=Math.sin(a*D2R),c=-Math.cos(a*D2R);
    g+=`<line x1="${(s*95).toFixed(1)}" y1="${(c*95).toFixed(1)}" x2="${(s*(95-L)).toFixed(1)}" y2="${(c*(95-L)).toFixed(1)}" stroke="var(--muted)" stroke-width="${a%90?1:1.5}"/>`;
  }
  [["N",0],["E",90],["S",180],["W",270]].forEach(([l,a])=>{
    const x=(Math.sin(a*D2R)*74).toFixed(1),y=(-Math.cos(a*D2R)*74).toFixed(1);
    g+=`<text class="lbl" data-x="${x}" data-y="${y}" x="${x}" y="${y}" dy=".36em" text-anchor="middle" fill="${l==="N"?"var(--radar)":"var(--fg)"}" font-size="15" font-family="var(--display)" font-weight="700">${l}</text>`;
  });
  g+=`<g class="target" transform="rotate(${p.az.toFixed(1)})"${p.alt>0?"":" hidden"}><line x1="0" y1="0" x2="0" y2="-54" stroke="var(--lock)" stroke-width="3" stroke-linecap="round"/><circle cy="-54" r="8" fill="var(--lock)"/></g>`;
  g+=`</g><circle r="4" fill="var(--fg)"/><path id="facing" d="M0 -113L7 -102L-7 -102Z" fill="var(--fg)" hidden/>`;
  $("dial").innerHTML=g;
}
function updateHeading(){
  const p=S.tp;if(!p||$("finder").hidden||!$("dialRot"))return;
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
// o: {center, lines, faint (context lines), ids (extra stars), ring (ids to circle), label (ids to name), extra (non-star points)}
function shapeSvg(o,name){
  const cv=vec(altaz(o.center.ra,o.center.dec,S.t,S.lat,S.lon));
  let up=[0,0,1];const d=dot(up,cv);up=up.map((x,i)=>x-d*cv[i]);
  const ul=Math.hypot(...up);up=ul<1e-3?[0,1,0]:up.map(x=>x/ul);
  const rt=cross(cv,up);
  const pr=(alt,az)=>{const v=vec({alt,az}),z=dot(v,cv);return z>.2?[dot(v,rt)/z,-dot(v,up)/z]:null};
  const faint=o.faint||[],ids=new Set([...o.lines.flat(),...faint.flat(),...o.ring,...(o.ids||[])]);
  const P={};
  for(const id of ids){const s=STARS[id],a=altaz(s[2]*15,s[3],S.t,S.lat,S.lon),q=pr(a.alt,a.az);if(q)P[id]=q}
  const ex=(o.extra||[]).map(e=>{const a=altaz(e.ra,e.dec,S.t,S.lat,S.lon);return {...e,q:pr(a.alt,a.az)}}).filter(e=>e.q);
  const pts=[...Object.values(P),...ex.map(e=>e.q)],xs=pts.map(q=>q[0]),ys=pts.map(q=>q[1]);
  if(!xs.length)return "";
  const W=300,H=190,pad=24,cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
  const sc=Math.min((W-2*pad)/Math.max(.05,Math.max(...xs)-Math.min(...xs)),(H-2*pad)/Math.max(.05,Math.max(...ys)-Math.min(...ys)),900);
  const X=q=>(W/2+(q[0]-cx)*sc).toFixed(1),Y=q=>(H/2+(q[1]-cy)*sc).toFixed(1);
  let g="";
  // horizon, when it's in view
  const az0=Math.atan2(cv[0],cv[1])*R2D,hz=[];
  for(let a=-80;a<=80;a+=4){const q=pr(0,az0+a);if(q)hz.push(`${X(q)},${Y(q)}`)}
  if(hz.length>1)g+=`<polyline points="${hz.join(" ")}" fill="none" stroke="var(--muted)" stroke-dasharray="4 4"/><text x="8" y="${H-8}" fill="var(--muted)" font-size="11" font-family="var(--body)">horizon below</text>`;
  const seg=(a,b,st)=>P[a]&&P[b]?`<line x1="${X(P[a])}" y1="${Y(P[a])}" x2="${X(P[b])}" y2="${Y(P[b])}" ${st}/>`:"";
  for(const [a,b] of faint)g+=seg(a,b,`stroke="var(--muted)" stroke-opacity=".35" stroke-width="1"`);
  for(const [a,b] of o.lines)g+=seg(a,b,`stroke="var(--radar)" stroke-opacity="${faint.length?.9:.6}" stroke-width="${faint.length?2:1.4}"`);
  for(const id in P){
    const s=STARS[id],x=X(P[id]),y=Y(P[id]);let r;
    if(isDeep(id)){r=6;g+=`<circle cx="${x}" cy="${y}" r="6" fill="#9fb3d9" fill-opacity=".25" stroke="#9fb3d9" stroke-dasharray="1.5 1.5"/>`}
    else{r=starR(s[4])+.6;g+=`<circle cx="${x}" cy="${y}" r="${r.toFixed(2)}" fill="${SPC[s[5][0]]||"#fff"}"/>`}
    if(o.ring.includes(id))g+=`<circle cx="${x}" cy="${y}" r="${(r+5).toFixed(1)}" fill="none" stroke="var(--lock)" stroke-width="1.5"/>`;
    if(o.label.includes(id))g+=`<text x="${(+x+r+(o.ring.includes(id)?8:4)).toFixed(1)}" y="${(+y+4).toFixed(1)}" fill="var(--fg)" font-size="12" font-family="var(--body)">${esc(s[0].replace(/ \(M\d+\)/,""))}</text>`;
  }
  for(const e of ex)g+=`<circle cx="${X(e.q)}" cy="${Y(e.q)}" r="5.5" fill="${e.color}"/><text x="${(+X(e.q)+10).toFixed(1)}" y="${(+Y(e.q)+4).toFixed(1)}" fill="var(--lock)" font-size="13" font-weight="700" font-family="var(--body)">${esc(e.name)}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(name)} as it looks right now">${g}</svg>`;
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
  return `<p class="note">Best seen: ${esc(c.best)}</p>
    <div class="chips">${stars.map(id=>`<button class="chip" type="button" data-star="${id}">${esc(STARS[id][0])}</button>`).join("")}</div>`;
}
function moreStar(id){
  const s=STARS[id],cl=s[5][0];
  return `<dl class="facts">${isDeep(id)?"":`<dt>Color</dt><dd>${COLOR[cl]||""}, about ${TEMP[cl]||"?"} K</dd>`}<dt>Brightness</dt><dd>${esc(seeIt(s[4]))}</dd></dl>
    <div class="chips"><button class="chip" type="button" data-con="${s[1]}">The constellation ${esc(CONS[s[1]].n)}</button></div>`;
}
// Bright stars around a point, with any constellation lines between them
function nearby(c,rad){
  const ids=Object.keys(STARS).filter(id=>!isDeep(id)&&STARS[id][4]<3.5&&sep(c.ra,c.dec,STARS[id][2]*15,STARS[id][3])<rad),set=new Set(ids),lines=[];
  for(const k in CONS)for(const l of CONS[k].l)if(set.has(l[0])&&set.has(l[1]))lines.push(l);
  return {ids,lines,label:ids.slice().sort((a,b)=>STARS[a][4]-STARS[b][4]).slice(0,2)};
}
function morePlanet(x){
  return `<dl class="facts"><dt>Brightness</dt><dd>${esc(seeIt(x.pp.mag))}</dd></dl>
    <p class="note">Planets shine with a steady light. Stars twinkle.</p>`;
}
function moreSight(x){
  const named=x.s.filter(id=>!/^[α-ω]/.test(STARS[id][0])).sort((a,b)=>STARS[a][4]-STARS[b][4]);
  return `<p class="note">Its stars</p><div class="chips">${named.map(id=>`<button class="chip" type="button" data-star="${id}">${esc(STARS[id][0])}</button>`).join("")}</div>
    ${x.con?`<div class="chips"><button class="chip" type="button" data-con="${x.con}">The constellation ${esc(CONS[x.con].n)}</button></div>`:""}`;
}

/* compass: phones only. Turns both radars and the dial with you. */
function initCompass(){
  if(!Compass.supported()||!matchMedia("(pointer: coarse)").matches)return;
  Compass.onChange=()=>{updateHeading();Radar.lastDraw=0;Aurora.lastDraw=0};
  let started=false;
  const go=async()=>{
    if(started)return;started=true;
    const r=await Compass.start();
    if(r==="ok"){$("radarNote").textContent="The top of the radar is the way your phone points. Tap a blip.";Aurora.render()}
    else if(r==="denied")$("compassNote").textContent="Compass access is off, so north stays at the top.";
  };
  // iPhone only allows the compass after a tap, so ask on the first one; elsewhere start right away
  if(typeof DeviceOrientationEvent.requestPermission==="function"){addEventListener("pointerup",go,{once:true});addEventListener("touchend",go,{once:true})}
  else go();
}

/* boot */
initCities();initCompass();Radar.init();Aurora.init();
$("tabSky").onclick=()=>showTab("sky");$("tabAur").onclick=()=>showTab("aur");
$("fClose").onclick=deselect;
addEventListener("keydown",e=>{if(e.key==="Escape"&&S.sel)deselect()});
$("modeSeg").querySelectorAll("button").forEach(b=>b.onclick=()=>{S.mode=b.dataset.mode;store.set("sky-mode",S.mode);S.t=nowOrDusk();S.live=true;renderAll()});
$("redBtn").onclick=()=>{const on=document.documentElement.classList.toggle("red");$("redBtn").setAttribute("aria-pressed",String(on));store.set("sky-red",on)};
if(store.get("sky-red")){document.documentElement.classList.add("red");$("redBtn").setAttribute("aria-pressed","true")}
const saved=store.get("sky-loc");
if(saved&&typeof saved.lat==="number"){setLoc(saved.lat,saved.lon,saved.tz||browserTz,saved.label||"Saved location",true);showChooser(false)}
else{const c=CITIES.find(c=>c[3]===browserTz)||CITIES[0];setLoc(c[1],c[2],c[3],c[0],true);store.set("sky-loc",null);showChooser(true)}
if(store.get("sky-tab")==="aur")showTab("aur");
// Keep the sky current while the page is open
setInterval(()=>{if(S.live&&!document.hidden){S.t=nowOrDusk();renderAll()}},30000);
loadAurora();setInterval(loadAurora,30*60000);
Sats.load().then(()=>{Radar.updateSats();renderSpecial();renderQuick()});
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&S.live)computeNight()});
