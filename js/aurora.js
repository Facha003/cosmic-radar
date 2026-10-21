/* ---------- Aurora Radar ---------- */
// Place searches on OpenStreetMap data (Photon): query, OSM tag, label, base score
// Local words too, since reserves and parks are named in the local language (Norwegian, Swedish/Danish, Finnish)
const SPOT_SEARCHES=[["nature reserve","leisure:nature_reserve","Nature reserve",2],["naturreservat","leisure:nature_reserve","Nature reserve",2],
  ["national park","boundary:national_park","National park",3],["nasjonalpark","boundary:national_park","National park",3],["nationalpark","boundary:national_park","National park",3],["kansallispuisto","boundary:national_park","National park",3],
  ["state park","leisure:park","Park",1.5],["dark sky park","","Dark-sky place",6]];
// Backup when Photon is down: OpenStreetMap's Nominatim. Its English category words work in any country.
// Nominatim allows about one request a second, so these run one after another: query, label, base score
const NOMINATIM_SEARCHES=[["viewpoint","Viewpoint",2.5],["nature reserve","Nature reserve",2],["national park","National park",3]];
const RANGE_KM=2000;
async function getJSON(url,ms){
  const ctrl=new AbortController(),to=setTimeout(()=>ctrl.abort(),ms);
  try{const r=await fetch(url,{signal:ctrl.signal});if(!r.ok)throw new Error(r.status);return await r.json()}
  finally{clearTimeout(to)}
}
// Each returns a list of {n,lat,lon,kind,w}, or null if the service couldn't be reached at all
async function photonSpots(){
  const found=await Promise.all(SPOT_SEARCHES.map(async([q,tag,kind,w])=>{
    try{
      const j=await getJSON(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${S.lat.toFixed(3)}&lon=${S.lon.toFixed(3)}&limit=30${tag?`&osm_tag=${tag}`:""}`,8000);
      return (j.features||[]).filter(f=>tag||/dark.?sky/i.test(f.properties.name||"")&&["leisure","boundary","tourism"].includes(f.properties.osm_key))
        .map(f=>({n:f.properties.name,lon:f.geometry.coordinates[0],lat:f.geometry.coordinates[1],kind,w}));
    }catch(e){return null}
  }));
  return found.every(f=>f===null)?null:found.flat().filter(Boolean);
}
async function nominatimSpots(){
  const dLat=1.35,dLon=Math.min(60,1.35/Math.max(.1,Math.cos(S.lat*D2R))); // a box about 150 km each way
  const box=[S.lon-dLon,S.lat+dLat,S.lon+dLon,S.lat-dLat].map(v=>v.toFixed(3)).join(",");
  let out=null;
  for(const [i,[q,kind,w]] of NOMINATIM_SEARCHES.entries()){
    if(i)await new Promise(r=>setTimeout(r,1100));
    try{
      const j=await getJSON(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=30&bounded=1&viewbox=${box}`,8000);
      out=(out||[]).concat(j.filter(x=>x.name).map(x=>({n:x.name,lat:+x.lat,lon:+x.lon,kind,w})));
    }catch(e){}
  }
  return out;
}

function distKm(a1,o1,a2,o2){
  const p1=a1*D2R,p2=a2*D2R,dp=p2-p1,dl=(o2-o1)*D2R;
  const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 12742*Math.asin(Math.min(1,Math.sqrt(h)));
}
function bearing(a1,o1,a2,o2){
  const p1=a1*D2R,p2=a2*D2R,dl=(o2-o1)*D2R;
  return norm(Math.atan2(Math.sin(dl)*Math.cos(p2),Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl))*R2D);
}
const hemi=()=>S.lat>=0?{name:"northern",dir:"north",az:0}:{name:"southern",dir:"south",az:180};

const Aurora={
  open:false,ov:null,ovTime:null,ovAt:0,near:null,nearKey:"",spots:null,spotsKey:"",spotsState:"",lastDraw:0,
  init(){
    this.cv=$("auroraRadar");watchOnScreen(this,this.cv);
    requestAnimationFrame(t=>this.frame(t));
  },
  show(){
    this.open=true;
    if(Date.now()-this.ovAt>15*60000)this.loadOvation();
    this.loadSpots();this.render();
  },
  // NOAA OVATION: chance of aurora overhead on a 1° grid, about 30–90 minutes ahead
  async loadOvation(){
    this.ovAt=Date.now();
    try{
      const r=await fetch("https://services.swpc.noaa.gov/json/ovation_aurora_latest.json");
      if(!r.ok)throw new Error(r.status);
      const j=await r.json();
      this.ov=j.coordinates;this.ovTime=Date.parse(j["Forecast Time"]||j["Observation Time"]);this.nearKey="";
    }catch(e){this.ov=null}
    this.render();
  },
  // Grid cells within radar range, with distance and bearing from you
  prep(){
    const key=`${S.lat},${S.lon}`;
    if(!this.ov||this.nearKey===key)return;
    const out=[];
    for(const [lo,la,v] of this.ov){
      if(v<3||Math.abs(la-S.lat)>20)continue;
      const lon=lo>180?lo-360:lo,d=distKm(S.lat,S.lon,la,lon);
      if(d<=RANGE_KM+100)out.push({d,b:bearing(S.lat,S.lon,la,lon),v});
    }
    this.near=out;this.nearKey=key;
    // How visible it is from here right now: strongest cell in view, weaker the farther away
    this.seeNow=out.reduce((m,p)=>p.d<1100?Math.max(m,p.v*(1-p.d/1400)):m,0);
  },
  chance(){
    if(!S.kpRows||!S.win)return null;
    const w=S.win,ml=magLat(S.lat,S.lon),need=kpNeeded(ml);
    const blocks=S.kpRows.filter(o=>o.t+3*3600e3>Math.max(w.sunset,Date.now()-3*3600e3)&&o.t<w.sunrise);
    if(!blocks.length)return null;
    const darkQ=w.quality==="full"?1:w.quality==="nautical"?.8:w.quality==="civil"?.4:.15;
    let best=null;
    for(const b of blocks){
      const mid=Math.min(Math.max(b.t+5400e3,w.sunset),w.sunrise);
      const kpF=Math.max(0,Math.min(1,(b.kp-need+1)/2));
      const dark=mid>=w.dusk&&mid<=w.dawn?darkQ:.35;
      const h=S.wx&&S.wx.reduce((a,x)=>!a||Math.abs(x.t-mid)<Math.abs(a.t-mid)?x:a,null);
      const clear=h?1-.9*h.c/100:.75;
      const moon=moonAltAz(mid,S.lat,S.lon).alt>0?1-.25*S.phase.illum:1;
      const sc=kpF*dark*clear*moon;
      if(!best||sc>best.sc)best={sc,b};
    }
    // If it's dark now and NOAA's map shows aurora in view, use that too
    let pct=best.sc;
    const now=Date.now();
    if(this.seeNow&&now>=w.dusk&&now<=w.dawn){const h=S.wx&&S.wx.find(x=>Math.abs(x.t-now)<1800e3);pct=Math.max(pct,Math.min(1,this.seeNow/25)*(h?1-.9*h.c/100:.75))}
    return {pct:Math.round(pct*100),best:best.b,need,ml,kpMax:Math.max(...blocks.map(b=>b.kp)),storm:topStorm(blocks)};
  },
  render(){
    if(!this.open||!S.win)return;
    this.prep();
    const ch=this.chance(),hm=hemi(),w=S.win;
    // headline
    $("aIntro").textContent=`Estimate your chances of seeing the ${hm.name} lights. Aurora forecast, cloud cover, darkness and nearby places to watch from.`;
    if(!ch){$("aChance").textContent="–";$("aLbl").textContent=S.kpRows===null?"NOAA's Kp forecast couldn't load":"Checking the forecast…";$("aBest").textContent=""}
    else{
      const p=ch.pct;
      $("aChance").textContent=`${p}%`;
      $("aChance").dataset.level=p>=45?"high":p>=15?"mid":"low";
      $("aLbl").textContent=ch.need>9?`Too far from the poles: the ${hm.name} lights are very rare here`:p>=70?`High chance of ${hm.name} lights tonight`:p>=45?`Good chance of ${hm.name} lights tonight`:p>=15?`Some chance of ${hm.name} lights tonight`:p>=5?"Low chance tonight":"Very unlikely tonight";
      $("aBest").textContent=(p>=5?`Best around ${fmt(Math.max(ch.best.t,w.sunset))}–${fmt(Math.min(ch.best.t+3*3600e3,w.sunrise))}. Look ${hm.dir}.`:"Activity can jump with little warning, so check back later.")
        +(S.wx?"":" Cloud forecast unavailable, so this assumes partly clear skies.");
    }
    // the three things that decide it
    const rows=[];
    if(ch){
      const st=ch.kpMax>=ch.need+1?"good":ch.kpMax>=ch.need-1?"fair":"poor";
      const storm=stormText(ch.storm);
      rows.push({name:"Geomagnetic activity",st,text:`Up to Kp ${ch.kpMax.toFixed(1)} tonight${storm?`, ${storm}`:""}. About Kp ${Math.min(9,ch.need).toFixed(1)} is needed here.`,meter:ch.kpMax/9,mark:Math.min(1,ch.need/9)});
    }
    const dk=S.wx?S.wx.filter(h=>h.t>=w.dusk&&h.t<=w.dawn):[];
    if(dk.length){
      const avg=dk.reduce((a,h)=>a+h.c,0)/dk.length,clr=dk.reduce((a,h)=>h.c<a.c?h:a);
      rows.push({name:"Cloud cover",st:avg<30?"good":avg<70?"fair":"poor",text:`${Math.round(avg)}% during dark hours. Clearest around ${fmt(clr.t)}.`,meter:1-avg/100});
    }else rows.push({name:"Cloud cover",st:"",text:"No cloud forecast. Check the sky before you go."});
    const mp=Math.round(S.phase.illum*100),ms=S.moonUp<.05?"down all night":S.moonSet&&(!S.moonRise||S.moonSet<S.moonRise)?`until ${fmt(S.moonSet)}`:S.moonRise?`from ${fmt(S.moonRise)}`:"up all night";
    rows.push({name:"Darkness",st:w.quality==="full"?(mp>60&&S.moonUp>.5?"fair":"good"):w.quality==="none"?"poor":"fair",
      text:w.quality==="full"?`Dark ${fmt(w.dusk)}–${fmt(w.dawn)}. Moon ${mp}% lit, ${ms}.`:w.quality==="none"?"The sky doesn't get dark tonight.":`Only twilight tonight, darkest around ${fmt((w.dusk+w.dawn)/2)}.`});
    const LBL={good:"Good",fair:"Fair",poor:"Poor"};
    $("aFactors").innerHTML=rows.map(r=>`<li class="factor"><div class="fTop"><span class="fName">${r.name}</span>${r.st?`<span class="pill st-${r.st}">${LBL[r.st]}</span>`:""}</div>
      <p class="fText">${esc(r.text)}</p>${r.meter!=null?`<div class="meter" aria-hidden="true"><span style="width:${Math.round(Math.max(.02,Math.min(1,r.meter))*100)}%"></span>${r.mark!=null?`<i style="left:${Math.round(r.mark*100)}%"></i>`:""}</div>`:""}</li>`).join("");
    // radar caption
    $("aRadarNote").textContent=!this.ov?(this.ovAt?"NOAA's aurora map couldn't load right now.":"Loading NOAA's aurora map…")
      :(Compass.heading!=null?"The top is the way your phone points. ":"")+`Green shows NOAA's chance of aurora overhead, forecast for ${fmt(this.ovTime)}; brighter means more likely. Inside the bright ring it can show low on your ${hm.dir}ern horizon.`+(this.near&&!this.near.some(p=>p.d<=RANGE_KM&&p.v>=10)?" No aurora above a 10% chance within range right now.":"");
    this.renderKp(ch);this.renderSpots();this.lastDraw=0;
  },
  frame(now){
    requestAnimationFrame(t=>this.frame(t));
    if(document.hidden||$("paneAur").hidden||!this.onScreen)return;
    const still=reduceMotion();
    if(still?this.lastDraw:now-this.lastDraw<FRAME_MS)return;
    this.lastDraw=now;this.draw(still?null:now);
  },
  // Turns with the phone like the Cosmic Radar: the top is the way you face
  draw(now){
    const {ctx,w}=sizeCanvas(this.cv),c=w/2,R=c-6,k=R/RANGE_KM,rot=Compass.heading||0;
    const sweep=drawScope(ctx,w,R,{rot,now,rings:[{r:500*k,dash:true,label:"500 km"},{r:1000*k,strong:true,label:"1,000 km"},{r:1500*k,dash:true,label:"1,500 km"}]});
    if(this.near){
      ctx.save();ctx.beginPath();ctx.arc(c,c,R,0,TAU);ctx.clip();ctx.globalCompositeOperation="lighter";
      const cell=Math.max(3,70*k);
      for(const p of this.near){
        // aurora shows only as the beam paints it, then fades like the rest of the scope
        const t=(p.b-rot)*D2R,gl=glow(sweep,t);
        if(gl<=0)continue;
        const x=c+Math.sin(t)*p.d*k,y=c-Math.cos(t)*p.d*k,v=Math.min(1,p.v/35);
        ctx.fillStyle=`rgba(${RG},${(v*gl*.6).toFixed(3)})`;
        ctx.beginPath();ctx.arc(x,y,cell,0,TAU);ctx.fill();
        if(p.v>=40){ctx.fillStyle=`rgba(210,255,230,${(.35*gl).toFixed(3)})`;ctx.beginPath();ctx.arc(x,y,cell*.6,0,TAU);ctx.fill()}
      }
      ctx.restore();
    }
    ctx.fillStyle="#ffcf6b";ctx.beginPath();ctx.arc(c,c,5,0,TAU);ctx.fill();
    ctx.font="600 12px 'Atkinson Hyperlegible', sans-serif";ctx.textAlign="left";ctx.fillText("You",c+9,c+4);
  },
  // Kp forecast in 3-hour blocks, with the level needed here
  renderKp(ch){
    const el=$("kpChart");
    if(!S.kpRows){el.innerHTML="";$("kpReadout").textContent=S.kpRows===null?"NOAA's Kp forecast couldn't load.":"";return}
    const rows=S.kpRows.filter(o=>o.t+3*3600e3>Date.now()-3*3600e3).slice(0,24);
    if(!rows.length){el.innerHTML="";return}
    const need=ch?ch.need:kpNeeded(magLat(S.lat,S.lon)),W=340,H=160,L=22,B=24,T=12,bw=(W-L-2)/rows.length;
    const y=v=>T+(H-T-B)*(1-Math.min(9,v)/9);
    let g="";
    for(const v of [0,3,6,9])g+=`<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L-6}" y="${y(v)+3.5}" text-anchor="end" class="ax">${v}</text>`;
    let prevDay=null;
    rows.forEach((r,i)=>{
      const x=L+i*bw+1,top=y(Math.max(r.kp,.25)),h=y(0)-top,hit=r.kp>=need,rad=Math.min(3,(bw-2)/2,h);
      g+=`<path d="M${x} ${y(0)}V${top+rad}q0 -${rad} ${rad} -${rad}h${bw-2-2*rad}q${rad} 0 ${rad} ${rad}V${y(0)}Z" fill="${hit?"var(--radar)":"var(--bar)"}" opacity="${r.t+3*3600e3<Date.now()?.55:1}"/>`;
      // name the day under the first block of each local date (hour12:false can say "24" at midnight, so compare dates)
      const day=localYMD(r.t).join("-");
      if(day!==prevDay)g+=`<text x="${x}" y="${H-8}" class="ax">${new Intl.DateTimeFormat(undefined,{weekday:"short",timeZone:S.tz}).format(new Date(r.t))}</text>`;
      prevDay=day;
      g+=`<rect x="${L+i*bw}" y="${T}" width="${bw}" height="${H-T-B}" fill="transparent" data-i="${i}"><title>${fmt(r.t)}: Kp ${r.kp.toFixed(1)}</title></rect>`;
    });
    const ny=y(Math.min(9,need));
    if(need<=9)g+=`<line x1="${L}" x2="${W}" y1="${ny}" y2="${ny}" stroke="var(--fg)" stroke-dasharray="4 4" opacity=".7"/><text x="${W-2}" y="${ny-5}" text-anchor="end" class="axb">needed here ≈ ${need.toFixed(1)}</text>`;
    const ni=rows.findIndex(r=>Date.now()>=r.t&&Date.now()<r.t+3*3600e3);
    if(ni>=0){const nx=L+(ni+(Date.now()-rows[ni].t)/(3*3600e3))*bw;g+=`<line x1="${nx}" x2="${nx}" y1="${T-6}" y2="${y(0)}" stroke="#ffcf6b" stroke-width="1.5"/><text x="${nx+3}" y="${T-1}" class="axb">now</text>`}
    el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Kp index in 3-hour blocks: recent measurements and NOAA's forecast">${g}</svg>`;
    const def="Kp measures how disturbed Earth's magnetic field is, from 0 to 9. Faded bars are past. Tap a bar for details.";
    $("kpReadout").textContent=def;
    const KIND={observed:"measured",estimated:"estimated",predicted:"forecast"};
    el.querySelectorAll("rect[data-i]").forEach(b=>b.addEventListener("click",()=>{
      const r=rows[+b.dataset.i],storm=stormText(r.g);
      $("kpReadout").textContent=`${new Intl.DateTimeFormat(undefined,{weekday:"long",timeZone:S.tz}).format(new Date(r.t))} ${fmt(r.t)}–${fmt(r.t+3*3600e3)}: Kp ${r.kp.toFixed(1)}${KIND[r.kind]?` (${KIND[r.kind]})`:""}${storm?`, ${storm}`:""}${r.kp>=need?", enough for a chance here":""}.`;
    }));
  },
  // Named dark places nearby from OpenStreetMap, best first
  async loadSpots(){
    const key=`${S.lat.toFixed(2)},${S.lon.toFixed(2)}`;
    if(this.spotsKey===key&&this.spotsState!=="error")return;
    this.spotsKey=key;this.spots=null;this.spotsState="loading";this.renderSpots();
    const cached=store.get("sky-spots2");
    if(cached&&cached.key===key&&cached.list.length&&Date.now()-cached.t<7*864e5){this.spots=cached.list;this.spotsState="ok";this.renderSpots();return}
    let list=await photonSpots();
    if(this.spotsKey!==key)return;
    // Photon down, or nothing useful nearby: ask Nominatim
    if(!list||!rankSpots(list).length){const more=await nominatimSpots();if(this.spotsKey!==key)return;if(more)list=(list||[]).concat(more)}
    if(!list){this.spotsState="error";this.renderSpots();return}
    this.spots=rankSpots(list);this.spotsState="ok";
    // only keep a list that found something, so one bad answer isn't stuck for a week
    if(this.spots.length)store.set("sky-spots2",{key,t:Date.now(),list:this.spots});
    this.renderSpots();
  },
  renderSpots(){
    const el=$("spots"),hm=hemi();
    const advice=`<li class="note">Pick a spot with an open view to the ${hm.dir}, away from town lights. Give your eyes 20 minutes to adjust.</li>`;
    if(this.spotsState==="loading"){el.innerHTML=`<li class="note">Looking for dark places near you…</li>`;return}
    if(this.spotsState==="error"){
      el.innerHTML=`<li class="note">The map service is busy. Head 30–60 km out of town, toward the ${hm.dir}, to somewhere with an open view of the ${hm.dir}ern horizon.</li><li><button class="btn small" id="spotsRetry" type="button">Try again</button></li>`;
      $("spotsRetry").onclick=()=>{this.spotsState="";this.spotsKey="";this.loadSpots()};return;
    }
    if(!this.spots)return;
    el.innerHTML=(this.spots.length?this.spots.map(s=>`<li class="spot"><div><span class="spotName">${esc(s.n)}</span><span class="note">${s.kind} · ${Math.round(s.d)} km ${dir8(s.b)}</span></div>
      <a class="btn small" href="https://www.google.com/maps/dir/?api=1&amp;destination=${s.lat.toFixed(5)},${s.lon.toFixed(5)}" target="_blank" rel="noopener">Directions</a></li>`).join("")
      :`<li class="note">No mapped parks or reserves within 150 km.</li>`)+advice;
  }
};
// Score places: toward the aurora first, then darker (farther from town) and dark-sky sites
function rankSpots(list){
  const hz=hemi().az,seen=new Set(),out=[];
  for(const x of list){
    if(!x.n||seen.has(x.n))continue;seen.add(x.n);
    if(/\bmarin/i.test(x.n))continue; // marine reserves are out at sea
    const d=distKm(S.lat,S.lon,x.lat,x.lon),b=bearing(S.lat,S.lon,x.lat,x.lon);
    if(d>150)continue;
    // toward the aurora matters most; distance helps up to ~50 km, then becomes a long drive
    const sc=x.w+Math.min(d,50)/12.5-(d<15?3:0)-Math.max(0,d-100)/25+3*Math.cos((b-hz)*D2R);
    out.push({n:x.n,kind:x.kind,lat:x.lat,lon:x.lon,d,b,sc});
  }
  return out.sort((a,b)=>b.sc-a.sc).slice(0,5);
}
