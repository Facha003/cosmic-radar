/* ---------- Special things in the sky ---------- */
// Geomagnetic latitude from a tilted-dipole model (pole near 80.8°N, 72.6°W)
function magLat(lat,lon){const p=80.8*D2R;return Math.asin(Math.sin(lat*D2R)*Math.sin(p)+Math.cos(lat*D2R)*Math.cos(p)*Math.cos((lon+72.6)*D2R))*R2D}
// Rough Kp needed to see aurora low on the horizon at that geomagnetic latitude
const kpNeeded=ml=>Math.max(0,(64-Math.abs(ml))/2.3);

// NOAA's 3-hour Kp forecast (0–9 scale of geomagnetic activity)
async function loadAurora(){
  try{
    const r=await fetch("https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json");
    if(!r.ok)throw new Error(r.status);
    const j=await r.json();
    // Rows are objects now; older responses were arrays with a header row
    const rows=Array.isArray(j[0])?j.slice(1).map(a=>({time_tag:a[0],kp:a[1]})):j;
    S.kpRows=rows.map(o=>({t:Date.parse(String(o.time_tag).replace(" ","T")+"Z"),kp:+o.kp})).filter(o=>!isNaN(o.t)&&!isNaN(o.kp));
  }catch(e){S.kpRows=null}
  renderSpecial();
}

function localYMD(t){
  const p=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:S.tz,year:"numeric",month:"numeric",day:"numeric"}).formatToParts(new Date(t)).map(x=>[x.type,x.value]));
  return [+p.year,+p.month,+p.day];
}
// Nights from tonight to the nearest yearly date (month, day): 0 tonight, 1 tomorrow, -1 last night
function nightsTo(m,d){
  const [y,tm,td]=localYMD(S.win.dusk),now=Date.UTC(y,tm-1,td);
  return [y-1,y,y+1].map(yy=>Math.round((Date.UTC(yy,m-1,d)-now)/864e5)).sort((a,b)=>Math.abs(a)-Math.abs(b))[0];
}
const dayName=t=>new Intl.DateTimeFormat(undefined,{weekday:"long",month:"long",day:"numeric",timeZone:S.tz}).format(new Date(t));
const where=(alt,az)=>alt>=75?"almost straight up":`${dir8(az)}, ${heightWord(alt)}`;

function computeEvents(){
  const w=S.win,ev=[];

  // Northern / southern lights
  if(S.kpRows){
    const rows=S.kpRows.filter(o=>o.t+3*3600e3>w.dusk&&o.t<w.dawn);
    if(rows.length){
      const kp=Math.max(...rows.map(o=>o.kp)),ml=magLat(S.lat,S.lon),need=kpNeeded(ml);
      const name=S.lat>=0?"Northern":"Southern",hor=S.lat>=0?"north":"south";
      if(kp>=need+1)ev.push({strong:true,title:`${name} lights likely tonight`,text:`Strong activity (${Math.round(kp)} of 9). From a dark spot, look ${hor}. Phone cameras often show it better than your eyes.`});
      else if(kp>=need)ev.push({strong:true,title:`${name} lights possible tonight`,text:`Activity ${Math.round(kp)} of 9 is about what's needed here. Look low toward the ${hor} from a dark spot.`});
      else if(Math.abs(ml)>=45)ev.push({title:`${name} lights unlikely tonight`,text:`Activity ${Math.round(kp)} of 9. You'd need about ${Math.ceil(need)} here.`});
    }
  }

  // Meteor showers near their peak
  for(const sh of SHOWERS){
    const n=nightsTo(...sh.peak);
    if(n<-1||n>(sh.rate>=50?5:3))continue;
    const best=track(sh.ra,sh.dec,w,S.lat,S.lon).reduce((a,p)=>p.alt>a.alt?p:a,{alt:-90});
    if(best.alt<10)continue;
    const when=n===0?"peaks tonight":n===1?"peaks tomorrow night":n===-1?"peaked last night and is still active":`peaks in ${n} nights`;
    const rate=Math.max(2,Math.round(sh.rate*Math.sin(best.alt*D2R)/5)*5);
    const moon=S.phase.illum>.4&&moonAltAz(best.t,S.lat,S.lon).alt>0?" The bright Moon will hide the fainter ones.":"";
    ev.push({strong:n>=0&&n<=1,title:`${sh.n} meteor shower ${when}`,text:`Up to about ${rate} an hour from a dark place, best around ${fmt(best.t)}. Look anywhere: they seem to fly out of ${sh.from_}.${moon}`});
  }

  // Eclipses in the next month
  for(const e of ECLIPSES){
    const t=Date.parse(e.t),days=(t-Date.now())/864e5;
    if(days<-.3||days>30)continue;
    if(e.type.endsWith("lunar")){
      const m=moonAltAz(t,S.lat,S.lon);
      if(m.alt>0)ev.push({strong:days<2,title:`${cap(e.type.replace(" lunar",""))} eclipse of the Moon`,text:`${dayName(t)}, deepest around ${fmt(t)}. The Moon will be ${where(m.alt,m.az)}.`});
    }else ev.push({strong:days<2,title:`${cap(e.type.replace(" solar",""))} eclipse of the Sun`,text:`${dayName(t)}. Seen from ${e.where}. Never look at the Sun without eclipse glasses.`});
  }

  // Moon and planets close together right now
  const t=S.t,objs=[];
  const mp=moonPos(t);objs.push({n:"the Moon",ra:mp.ra,dec:mp.dec,moon:true});
  for(const x of SIGHTS)if(x.planet&&x.pp.elong>=12){const p=planetPos(x.planet,t);objs.push({n:x.n,ra:p.ra,dec:p.dec,sel:{type:"sight",id:x.id}})}
  for(const id of ["reg","spi","ant","ald","pol","m45","m44"]){const s=STARS[id];objs.push({n:s[0].replace(/ \(M\d+\)/,""),ra:s[2]*15,dec:s[3],star:true,sel:{type:"star",id}})}
  for(let i=0;i<objs.length;i++)for(let j=i+1;j<objs.length;j++){
    const a=objs[i],b=objs[j];
    if(a.star&&b.star)continue;
    const d=sep(a.ra,a.dec,b.ra,b.dec),lim=a.moon||b.moon?(a.star||b.star?4:6):(a.star||b.star?2:4);
    if(d>lim)continue;
    const p=altaz((a.ra+b.ra)/2,(a.dec+b.dec)/2,t,S.lat,S.lon);
    if(p.alt<8)continue;
    const [x,y]=b.moon?[b,a]:[a,b];
    ev.push({title:`${cap(x.n)} is close to ${y.n}`,text:`Look ${where(p.alt,p.az)}. They're about ${Math.max(1,Math.round(d))}° apart, less than a fist.`,sel:y.sel||x.sel});
  }

  // New and full Moon
  const age=S.phase.age;
  if(Math.abs(age-.5)<.034)ev.push({title:"Full Moon tonight",text:"Lovely to look at, but its light hides the fainter stars."});
  else if(age<.05||age>.95)ev.push({title:"New Moon: the darkest skies of the month",text:"A good night for faint things like the Milky Way and the Andromeda Galaxy."});

  return ev.sort((a,b)=>(b.strong?1:0)-(a.strong?1:0));
}

function renderSpecial(){
  if(!S.win)return;
  const ev=computeEvents();
  $("special").hidden=!ev.length;
  $("specialList").innerHTML=ev.map((e,i)=>{
    const body=`<span class="evT">${esc(e.title)}</span><span class="evX">${esc(e.text)}</span>`;
    return `<li class="ev${e.strong?" strong":""}">${e.sel?`<button type="button" class="evBtn" data-i="${i}">${body}</button>`:body}</li>`;
  }).join("");
  $("specialList").querySelectorAll("[data-i]").forEach(b=>b.onclick=()=>{const e=ev[+b.dataset.i];select(e.sel.type,e.sel.id,true)});
}
