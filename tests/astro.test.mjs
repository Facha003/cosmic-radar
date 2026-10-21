// Checks for the astronomy math against known sky events. Run: node tests/astro.test.mjs
import {readFileSync} from "node:fs";
import vm from "node:vm";

const root=new URL("../",import.meta.url);
const code=["js/data.js","js/astro.js","js/events.js"].map(f=>readFileSync(new URL(f,root),"utf8")).join("\n;\n");
const A=vm.runInContext(code+"\n;({STARS,CONS,altaz,planetPos,moonPhase,nightWindow,magLat,kpNeeded,skyVerdict})",vm.createContext({}));

let failed=0;
function check(name,ok,detail){
  console.log(`${ok?"ok  ":"FAIL"} ${name}${detail?` (${detail})`:""}`);
  if(!ok)failed++;
}
const at=iso=>Date.parse(iso);
const OSLO=[59.91,10.75],NYC=[40.71,-74.01],SYD=[-33.87,151.21],TROMSO=[69.65,18.96];

// Polaris sits within a degree of the celestial pole, so its altitude ≈ your latitude
for(const [name,[lat,lon]] of [["Oslo",OSLO],["New York",NYC],["Sydney",SYD]]){
  const p=A.STARS.polaris,alt=A.altaz(p[2]*15,p[3],at("2026-10-20T22:00Z"),lat,lon).alt;
  check(`Polaris altitude ≈ latitude in ${name}`,Math.abs(alt-lat)<1.2,`${alt.toFixed(2)}° vs ${lat}°`);
}

// Orion is a winter constellation
const ori=A.CONS.Ori.c;
const janAlt=A.altaz(ori.ra,ori.dec,at("2027-01-15T03:00Z"),...NYC).alt,julAlt=A.altaz(ori.ra,ori.dec,at("2027-07-15T03:00Z"),...NYC).alt;
check("Orion is up on a January evening in New York",janAlt>30,`${janAlt.toFixed(1)}°`);
check("Orion is down on a July evening in New York",julAlt<0,`${julAlt.toFixed(1)}°`);

// Planets: oppositions and Venus passing the Sun
const el=(p,iso)=>A.planetPos(p,at(iso)).elong;
check("Saturn at opposition, 2026-10-04",el("saturn","2026-10-04T00:00Z")>175,`${el("saturn","2026-10-04T00:00Z").toFixed(1)}°`);
check("Jupiter at opposition, 2026-01-10",el("jupiter","2026-01-10T00:00Z")>175,`${el("jupiter","2026-01-10T00:00Z").toFixed(1)}°`);
check("Venus near the Sun, 2026-10-24",el("venus","2026-10-24T00:00Z")<8,`${el("venus","2026-10-24T00:00Z").toFixed(1)}°`);

// Full Moon of 26 October 2026
const ph=A.moonPhase(at("2026-10-26T04:00Z"));
check("Full Moon on 2026-10-26",ph.illum>.95,`${Math.round(ph.illum*100)}% lit, ${ph.name}`);

// Oslo gets fully dark around 8:15 PM on 20 October
const w=A.nightWindow(at("2026-10-20T12:00Z"),...OSLO,"Europe/Oslo");
const dusk=new Intl.DateTimeFormat("en-GB",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/Oslo"}).format(new Date(w.dusk));
const [h,m]=dusk.split(":").map(Number);
check("Oslo dark from about 20:15 on 2026-10-20",Math.abs(h*60+m-(20*60+15))<=20,dusk);

// Aurora: Kp needed matches common experience, and never rises as you go north
const need=([lat,lon])=>A.kpNeeded(A.magLat(lat,lon));
// These three are regression checks for the tuned KP_LINE table: they use the same numbers it was
// tuned to, so they catch accidental changes but are not independent validation of the table.
check("Oslo needs about Kp 4",need(OSLO)>=3.5&&need(OSLO)<=5,need(OSLO).toFixed(1));
check("Tromsø needs about Kp 1 or less",need(TROMSO)<=1.5,need(TROMSO).toFixed(1));
check("New York needs about Kp 7–8",need(NYC)>=7&&need(NYC)<=8.5,need(NYC).toFixed(1));
let mono=true;for(let ml=40;ml<75;ml+=.5)if(A.kpNeeded(ml+.5)>A.kpNeeded(ml)+1e-9)mono=false;
check("Kp needed never rises further north",mono);

// Tonight's verdict: never promise a good night without a cloud forecast
const dark={quality:"full",moonIllum:0,moonUp:0};
const unknown=A.skyVerdict({...dark,avgCloud:null}).label;
check("No cloud forecast: not called a great or good night",unknown!=="Great night for stars"&&unknown!=="Good night for stars",unknown);
const twilight=A.skyVerdict({quality:"nautical",moonIllum:0,moonUp:0,avgCloud:null}).label;
check("No cloud forecast, never fully dark: not called dark enough",!twilight.includes("Dark enough"),twilight);
const clear=A.skyVerdict({...dark,avgCloud:0}).label;
check("Clear, dark, Moon down: great night",clear==="Great night for stars",clear);
const overcast=A.skyVerdict({...dark,avgCloud:100}).label;
check("Overcast, dark, Moon down: poor or fair night",overcast==="Poor night"||overcast==="Fair night",overcast);
const RANK=["Great night for stars","Good night for stars","Fair night","Poor night"];
const moonlit=A.skyVerdict({quality:"full",moonIllum:1,moonUp:1,avgCloud:0}).label;
check("Bright Moon up all night is worse than the Moon down",RANK.indexOf(moonlit)>RANK.indexOf(clear),`${moonlit} vs ${clear}`);

console.log(failed?`\n${failed} check(s) failed`:"\nAll checks passed");
process.exit(failed?1:0);
