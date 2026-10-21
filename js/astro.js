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

/* ---------- Planets ---------- */
// JPL approximate orbital elements (valid 1800–2050): a, e, I, L, long. perihelion, long. node, then rates per century
const ORBITS={
  mercury:[[0.38709927,0.20563593,7.00497902,252.25032350,77.45779628,48.33076593],[0.00000037,0.00001906,-0.00594749,149472.67411175,0.16047689,-0.12534081]],
  venus:[[0.72333566,0.00677672,3.39467605,181.97909950,131.60246718,76.67984255],[0.00000390,-0.00004107,-0.00078890,58517.81538729,0.00268329,-0.27769418]],
  earth:[[1.00000261,0.01671123,-0.00001531,100.46457166,102.93768193,0],[0.00000562,-0.00004392,-0.01294668,35999.37244981,0.32327364,0]],
  mars:[[1.52371034,0.09339410,1.84969142,-4.55343205,-23.94362959,49.55953891],[0.00001847,0.00007882,-0.00813131,19140.30268499,0.44441088,-0.29257343]],
  jupiter:[[5.20288700,0.04838624,1.30439695,34.39644051,14.72847983,100.47390909],[-0.00011607,-0.00013253,-0.00183714,3034.74612775,0.21252668,0.20469106]],
  saturn:[[9.53667594,0.05386179,2.48599187,49.95424423,92.59887831,113.66242448],[-0.00125060,-0.00050991,0.00193609,1222.49362201,-0.41897216,-0.28867794]]
};
// Heliocentric ecliptic position in AU
function helio(name,T){
  const [e0,rate]=ORBITS[name],[a,e,I,L,w,O]=e0.map((v,i)=>v+rate[i]*T);
  let M=norm(L-w);if(M>180)M-=360;M*=D2R;
  let E=M+e*Math.sin(M);
  for(let i=0;i<6;i++)E-=(E-e*Math.sin(E)-M)/(1-e*Math.cos(E));
  const xp=a*(Math.cos(E)-e),yp=a*Math.sqrt(1-e*e)*Math.sin(E),om=(w-O)*D2R,o=O*D2R,i=I*D2R;
  const co=Math.cos(om),so=Math.sin(om),cO=Math.cos(o),sO=Math.sin(o),cI=Math.cos(i),sI=Math.sin(i);
  return [(co*cO-so*sO*cI)*xp+(-so*cO-co*sO*cI)*yp,(co*sO+so*cO*cI)*xp+(-so*sO+co*cO*cI)*yp,so*sI*xp+co*sI*yp];
}
// Geocentric RA/Dec, distance (AU), elongation from the Sun and approximate magnitude
const MAG={mercury:[-0.42,i=>0.038*i-0.000273*i*i+0.000002*i*i*i],venus:[-4.40,i=>0.0009*i+0.000239*i*i-0.00000065*i*i*i],mars:[-1.52,i=>0.016*i],jupiter:[-9.40,i=>0.005*i],saturn:[-8.88,()=>0]};
function planetPos(name,t){
  const T=(jd(t)-2451545)/36525,p=helio(name,T),E=helio("earth",T);
  const x=p[0]-E[0],y=p[1]-E[1],z=p[2]-E[2],eps=23.43928*D2R;
  const ye=y*Math.cos(eps)-z*Math.sin(eps),ze=y*Math.sin(eps)+z*Math.cos(eps);
  const d=Math.hypot(x,y,z),r=Math.hypot(...p),R=Math.hypot(...E);
  const phase=Math.acos(Math.max(-1,Math.min(1,(r*r+d*d-R*R)/(2*r*d))))*R2D;
  const elong=Math.acos(Math.max(-1,Math.min(1,(R*R+d*d-r*r)/(2*R*d))))*R2D;
  const [m0,f]=MAG[name];
  return {ra:norm(Math.atan2(ye,x)*R2D),dec:Math.asin(ze/d)*R2D,dist:d,elong,mag:m0+5*Math.log10(r*d)+f(phase)};
}
// Angle between two sky positions, in degrees
function sep(ra1,dec1,ra2,dec2){
  const a=dec1*D2R,b=dec2*D2R;
  return Math.acos(Math.min(1,Math.sin(a)*Math.sin(b)+Math.cos(a)*Math.cos(b)*Math.cos((ra1-ra2)*D2R)))*R2D;
}

/* ---------- Tonight's verdict ---------- */
// Scores the night from darkness, the Moon and cloud cover (avgCloud: % during dark hours, or null if unknown).
// Without a cloud forecast it never promises a good night.
function skyVerdict({quality,moonIllum,moonUp,avgCloud}){
  let score=100;
  if(quality!=="full")score-=quality==="nautical"?20:40;
  score-=moonIllum*moonUp*45;
  if(avgCloud!=null)score-=avgCloud*0.7;
  const [label,cls]=score>=75?["Great night for stars","st-good"]:score>=55?["Good night for stars","st-good"]:score>=35?["Fair night","st-fair"]:["Poor night","st-poor"];
  if(avgCloud==null&&score>=55)return {label:"Dark enough, clouds unknown",cls:"st-fair",score};
  return {label,cls,score};
}
