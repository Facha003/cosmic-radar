/* ---------- Astronomy ---------- */
const D2R=Math.PI/180,R2D=180/Math.PI;
const norm=a=>((a%360)+360)%360;
const jd=t=>t/86400000+2440587.5;
function lst(t,lon){return norm(280.46061837+360.98564736629*(jd(t)-2451545)+lon)}
function altaz(raDeg,dec,t,lat,lon){
  const H=(lst(t,lon)-raDeg)*D2R,d=dec*D2R,p=lat*D2R;
  const alt=Math.asin(Math.sin(d)*Math.sin(p)+Math.cos(d)*Math.cos(p)*Math.cos(H));
  const az=Math.atan2(-Math.cos(d)*Math.sin(H),Math.sin(d)*Math.cos(p)-Math.cos(d)*Math.sin(p)*Math.cos(H));
  return {alt:alt*R2D,az:norm(az*R2D)};
}
function sunPos(t){
  const n=jd(t)-2451545,L=norm(280.460+0.9856474*n),g=norm(357.528+0.9856003*n)*D2R;
  const lam=(L+1.915*Math.sin(g)+0.020*Math.sin(2*g))*D2R,eps=(23.439-4e-7*n)*D2R;
  return {ra:norm(Math.atan2(Math.cos(eps)*Math.sin(lam),Math.cos(lam))*R2D),dec:Math.asin(Math.sin(eps)*Math.sin(lam))*R2D,lam:norm(lam*R2D)};
}
function moonPos(t){
  const n=jd(t)-2451545;
  const Lp=218.316+13.176396*n,M=(134.963+13.064993*n)*D2R,F=(93.272+13.229350*n)*D2R,Dm=(297.850+12.190749*n)*D2R,Ms=(357.529+0.98560028*n)*D2R;
  const lam=Lp+6.289*Math.sin(M)+1.274*Math.sin(2*Dm-M)+0.658*Math.sin(2*Dm)+0.214*Math.sin(2*M)-0.186*Math.sin(Ms)-0.114*Math.sin(2*F);
  const bet=5.128*Math.sin(F)+0.281*Math.sin(M+F)+0.278*Math.sin(M-F)+0.173*Math.sin(2*Dm-F);
  const eps=(23.439-4e-7*n)*D2R,l=lam*D2R,b=bet*D2R;
  const ra=Math.atan2(Math.sin(l)*Math.cos(eps)-Math.tan(b)*Math.sin(eps),Math.cos(l));
  const dec=Math.asin(Math.sin(b)*Math.cos(eps)+Math.cos(b)*Math.sin(eps)*Math.sin(l));
  return {ra:norm(ra*R2D),dec:dec*R2D,lam:norm(lam),bet};
}
function moonAltAz(t,lat,lon){const m=moonPos(t),a=altaz(m.ra,m.dec,t,lat,lon);a.alt-=0.95*Math.cos(a.alt*D2R);return a}
function moonPhase(t){
  const s=sunPos(t),m=moonPos(t),dl=norm(m.lam-s.lam);
  const el=Math.acos(Math.cos(m.bet*D2R)*Math.cos(dl*D2R));
  const illum=(1-Math.cos(el))/2,age=dl/360;
  const names=[[.03,"New Moon"],[.22,"Waxing crescent"],[.28,"First quarter"],[.47,"Waxing gibbous"],[.53,"Full Moon"],[.72,"Waning gibbous"],[.78,"Last quarter"],[.97,"Waning crescent"],[1.01,"New Moon"]];
  return {illum,age,waxing:age<.5,name:names.find(x=>age<x[0])[1]};
}
// Vector mean of star positions → constellation center
function centroid(ids){
  let x=0,y=0,z=0;
  for(const id of ids){const s=STARS[id],a=s[2]*15*D2R,d=s[3]*D2R;x+=Math.cos(d)*Math.cos(a);y+=Math.cos(d)*Math.sin(a);z+=Math.sin(d)}
  return {ra:norm(Math.atan2(y,x)*R2D),dec:Math.atan2(z,Math.hypot(x,y))*R2D};
}
for(const k in CONS){const ids=Object.keys(STARS).filter(id=>STARS[id][1]===k&&!isDeep(id));CONS[k].stars=ids;CONS[k].c=centroid(ids)}
function isDeep(id){return ["cluster","galaxy","nebula"].includes(STARS[id][5])}

// Night window for the evening that starts on `t`'s local date
function nightWindow(t,lat,lon,tz){
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:tz,year:"numeric",month:"numeric",day:"numeric",hour:"numeric",hourCycle:"h23"}).formatToParts(new Date(t)).map(p=>[p.type,p.value]));
  let y=+parts.year,mo=+parts.month,d=+parts.day;
  if(+parts.hour<6){const p=new Date(Date.UTC(y,mo-1,d-1));y=p.getUTCFullYear();mo=p.getUTCMonth()+1;d=p.getUTCDate()}
  const noon=Date.UTC(y,mo-1,d,12)-lon/15*3600000,step=5*60000,alts=[];
  for(let i=0;i<=288;i++){const tt=noon+i*step,s=sunPos(tt);alts.push([tt,altaz(s.ra,s.dec,tt,lat,lon).alt])}
  const span=th=>{const below=alts.filter(a=>a[1]<th);return below.length?[below[0][0],below[below.length-1][0]]:null};
  const sun=span(-0.833),astro=span(-18),naut=span(-12),civ=span(-6);
  let dark=astro,quality="full";
  if(!dark){dark=naut;quality="nautical"}
  if(!dark){dark=civ;quality="civil"}
  if(!dark){dark=[noon+8*3600000,noon+14*3600000];quality="none"}
  return {noon,sunset:sun?sun[0]:dark[0],sunrise:sun?sun[1]:dark[1],dusk:dark[0],dawn:dark[1],quality};
}
// Altitude track of a RA/Dec through the dark window
function track(ra,dec,win,lat,lon,step=10*60000){
  const out=[];for(let t=win.dusk;t<=win.dawn;t+=step){const a=altaz(ra,dec,t,lat,lon);out.push({t,alt:a.alt,az:a.az})}return out;
}
const VIS=15;
function summarize(tr){
  if(!tr.length)return {kind:"none"};
  let best=tr[0];for(const p of tr)if(p.alt>best.alt)best=p;
  const up=tr.map(p=>p.alt>=VIS);
  if(best.alt<VIS)return {kind:best.alt>0?"low":"below",best};
  const first=up.indexOf(true),last=up.lastIndexOf(true);
  if(first===0&&last===up.length-1)return {kind:"all",best};
  if(first===0)return {kind:"sets",best,t:tr[last].t};
  if(last===up.length-1)return {kind:"rises",best,t:tr[first].t};
  return {kind:"window",best,t1:tr[first].t,t2:tr[last].t};
}
const DIRS=["north","north-northeast","northeast","east-northeast","east","east-southeast","southeast","south-southeast","south","south-southwest","southwest","west-southwest","west","west-northwest","northwest","north-northwest"];
const DIRS_S=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
const dirIdx=az=>Math.round(norm(az)/22.5)%16;
function whereText(alt,az){
  if(alt>=75)return "almost straight overhead";
  if(alt<0)return "below the horizon ("+DIRS[dirIdx(az)]+")";
  const h=alt<25?"low in the ":alt<50?"partway up in the ":"high in the ";
  return h+DIRS[dirIdx(az)];
}
