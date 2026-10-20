/* ---------- Satellites ---------- */
// Bright, naked-eye satellites from CelesTrak, positioned with satellite.js (SGP4)
const SAT_INFO={
  "25544":{name:"International Space Station",what:"Home to about seven astronauts. It circles Earth every 90 minutes.",label:"ISS"},
  "48274":{name:"Tiangong space station",what:"China's space station, usually with three astronauts aboard.",label:"Tiangong"},
  "20580":{name:"Hubble Space Telescope",what:"The space telescope that has been photographing the universe since 1990.",label:"Hubble"}
};
const Sats={
  list:[],ready:false,
  async load(){
    if(typeof satellite==="undefined")return;
    // CelesTrak asks apps not to re-download often, so keep a copy for 6 hours
    const cached=store.get("sky-tle");let txt=null;
    if(cached&&Date.now()-cached.t<6*3600e3)txt=cached.txt;
    if(!txt){
      try{
        const r=await fetch("https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle");
        if(!r.ok)throw new Error(r.status);
        txt=await r.text();
        if(!/^1 /m.test(txt))throw new Error("no data");
        store.set("sky-tle",{t:Date.now(),txt});
      }catch(e){if(cached)txt=cached.txt;else return}
    }
    const L=txt.trim().split(/\r?\n/),out=[];
    for(let i=0;i+2<L.length;i+=3){
      try{
        const id=L[i+1].slice(2,7).trim(),raw=L[i].trim(),info=SAT_INFO[id];
        out.push({id,raw,info,name:info?info.name:satName(raw),label:info?info.label:null,rec:satellite.twoline2satrec(L[i+1].trim(),L[i+2].trim())});
      }catch(e){}
    }
    this.list=out;this.ready=out.length>0;
  },
  // Where a satellite is in your sky at a moment
  look(s,t){
    const d=new Date(t),pv=satellite.propagate(s.rec,d);
    if(!pv||!pv.position)return null;
    const g=satellite.gstime(d),lk=satellite.ecfToLookAngles({longitude:S.lon*D2R,latitude:S.lat*D2R,height:0},satellite.eciToEcf(pv.position,g));
    return {alt:lk.elevation*R2D,az:norm(lk.azimuth*R2D),range:lk.rangeSat,height:satellite.eciToGeodetic(pv.position,g).height,lit:sunlit(pv.position,t)};
  },
  byId(id){return this.list.find(s=>s.id===id)},
  // Next pass tonight when it's above 10°, in sunlight, and your sky is dark enough to see it
  nextPass(s,from){
    const w=S.win,start=Math.max(from,w.sunset+40*60000),end=w.sunrise-40*60000;
    let pass=null;
    for(let t=start;t<=end;t+=20000){
      const p=this.look(s,t);if(!p)return null;
      const ok=p.alt>=10&&p.lit;
      if(ok){
        if(!pass)pass={start:t,startAz:p.az,max:p.alt,maxAz:p.az,maxT:t};
        if(p.alt>pass.max){pass.max=p.alt;pass.maxAz=p.az;pass.maxT=t}
        pass.end=t;pass.endAz=p.az;
      }else if(pass)return pass;
    }
    return pass;
  }
};
function satName(raw){
  const n=raw.replace(/\s+/g," ").trim();
  const rb=/ R\/B$/.test(n),base=n.replace(/ R\/B$/,"").replace(/\b([A-Z])([A-Z]+)\b/g,(m,a,b)=>a+b.toLowerCase());
  return rb?`${base} rocket stage`:base;
}
// Is a point in orbit (km, Earth-centered) in sunlight? Cylindrical Earth-shadow model.
function sunlit(pos,t){
  const s=sunPos(t),ra=s.ra*D2R,dec=s.dec*D2R,u=[Math.cos(dec)*Math.cos(ra),Math.cos(dec)*Math.sin(ra),Math.sin(dec)];
  const r=[pos.x,pos.y,pos.z],d=r[0]*u[0]+r[1]*u[1]+r[2]*u[2];
  if(d>0)return true;
  return Math.hypot(r[0]-d*u[0],r[1]-d*u[1],r[2]-d*u[2])>6371;
}
