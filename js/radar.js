/* ---------- Radar scopes ---------- */
// A real scope: one turn every 5 s, and the phosphor fades to nothing before the beam comes round again
const SWEEP_MS=5000,PERSIST_MS=1500,RG="61,255,168"; // radar green as r,g,b for alpha work
const TAU=Math.PI*2,FRAME_MS=33; // ~30 fps is plenty for the sweep and easier on the battery
const reduceMotion=()=>matchMedia("(prefers-reduced-motion: reduce)").matches;
// Animate a scope only while it's on screen
function watchOnScreen(scope,cv){
  scope.onScreen=true;
  if("IntersectionObserver" in window)new IntersectionObserver(es=>{scope.onScreen=es[0].isIntersecting;if(scope.onScreen)scope.lastDraw=0}).observe(cv);
}

// Fit a square canvas to its box at device resolution
function sizeCanvas(cv){
  const w=Math.round(Math.min(cv.parentElement.clientWidth,480)),dpr=window.devicePixelRatio||1;
  if(cv._w!==w||cv._dpr!==dpr){cv.width=w*dpr;cv.height=w*dpr;cv.style.width=w+"px";cv.style.height=w+"px";cv._w=w;cv._dpr=dpr}
  const ctx=cv.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);
  return {ctx,w};
}
// Screen angle is clockwise from the top; canvas angles start at 3 o'clock
const canvasAngle=a=>a-Math.PI/2;
// Time since the beam last passed a bearing, in ms
const sweptAgo=(sweep,ang)=>(((sweep-ang)%TAU+TAU)%TAU)/TAU*SWEEP_MS;
// Phosphor brightness left at a bearing: 1 just painted, gone well before the next pass.
// Without motion (reduced-motion setting) everything shows steadily instead.
function glow(sweep,ang){
  if(sweep==null)return .8;
  const g=Math.exp(-sweptAgo(sweep,ang)/PERSIST_MS);
  return g<.02?0:g;
}
// One return: a short arc at the target's range, smeared across the beam width.
// It flashes white-hot when painted, then settles into green afterglow.
function drawReturn(ctx,c,x,y,size,g,age){
  const dx=x-c,dy=y-c,r=Math.hypot(dx,dy),a=Math.atan2(dy,dx),half=1*D2R+size/Math.max(r,20);
  const hot=age<150?1-age/150:0,col=hot?`${Math.round(61+170*hot)},255,${Math.round(168+80*hot)}`:RG;
  ctx.lineCap="round";
  for(const [lw,al] of [[size*2.4,.22],[size,1]]){
    ctx.lineWidth=lw;ctx.strokeStyle=`rgba(${col},${(g*al).toFixed(3)})`;ctx.beginPath();
    if(r<4)ctx.arc(x,y,.5,0,TAU);else ctx.arc(c,c,r,a-half,a+half);
    ctx.stroke();
  }
}

// Scope face: background, rings, ticks, cardinal letters and the sweep. Returns the sweep angle or null.
function drawScope(ctx,w,R,o){
  const c=w/2;
  ctx.clearRect(0,0,w,w);
  const g=ctx.createRadialGradient(c,c,0,c,c,R);
  g.addColorStop(0,"#07301f");g.addColorStop(.7,"#04170f");g.addColorStop(1,"#020a07");
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(c,c,R,0,TAU);ctx.fill();
  ctx.lineWidth=1;
  for(const ring of o.rings){
    ctx.strokeStyle=`rgba(${RG},${ring.strong?.55:.2})`;ctx.setLineDash(ring.dash?[4,5]:[]);
    ctx.beginPath();ctx.arc(c,c,ring.r,0,TAU);ctx.stroke();
    if(ring.label){ctx.setLineDash([]);ctx.fillStyle=`rgba(${RG},.6)`;ctx.font="10px 'IBM Plex Mono', monospace";ctx.textAlign="left";ctx.fillText(ring.label,c+4,c-ring.r+12)}
  }
  ctx.setLineDash([]);
  ctx.strokeStyle=`rgba(${RG},.14)`;ctx.beginPath();ctx.moveTo(c-R,c);ctx.lineTo(c+R,c);ctx.moveTo(c,c-R);ctx.lineTo(c,c+R);ctx.stroke();
  for(let a=0;a<360;a+=10){
    const t=(a-o.rot)*D2R,L=a%90===0?10:a%30===0?6:3;
    ctx.strokeStyle=`rgba(${RG},${a%90===0?.8:.4})`;ctx.beginPath();
    ctx.moveTo(c+Math.sin(t)*R,c-Math.cos(t)*R);ctx.lineTo(c+Math.sin(t)*(R-L),c-Math.cos(t)*(R-L));ctx.stroke();
  }
  ctx.strokeStyle=`rgba(${RG},.75)`;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(c,c,R,0,TAU);ctx.stroke();
  ctx.font="600 14px 'Chakra Petch', sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";
  for(const [l,a] of [["N",0],["E",90],["S",180],["W",270]]){
    const t=(a-o.rot)*D2R;ctx.fillStyle=l==="N"?`rgb(${RG})`:"rgba(216,236,230,.75)";
    ctx.fillText(l,c+Math.sin(t)*(R-22),c-Math.cos(t)*(R-22));
  }
  ctx.textBaseline="alphabetic";
  if(o.now==null)return null;
  // Sweep: a bright leading edge with a fading phosphor wedge behind it
  const s=(o.now%SWEEP_MS)/SWEEP_MS*TAU,N=36,span=1.1;
  for(let i=0;i<N;i++){
    const a1=s-(i+1)*span/N,a2=s-i*span/N,al=.32*Math.pow(1-i/N,2);
    ctx.fillStyle=`rgba(${RG},${al.toFixed(3)})`;ctx.beginPath();ctx.moveTo(c,c);ctx.arc(c,c,R,canvasAngle(a1),canvasAngle(a2));ctx.closePath();ctx.fill();
  }
  ctx.save();ctx.shadowColor=`rgb(${RG})`;ctx.shadowBlur=10;ctx.strokeStyle=`rgba(${RG},.95)`;ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(c,c);ctx.lineTo(c+Math.sin(s)*R,c-Math.cos(s)*R);ctx.stroke();ctx.restore();
  return s;
}

/* ---------- Cosmic Radar ---------- */
const Radar={
  filter:"all",blips:[],lines:[],sats:[],paints:new Map(),lastSweep:null,hits:[],lastSat:0,lastDraw:0,
  init(){
    this.cv=$("radar");watchOnScreen(this,this.cv);
    this.cv.addEventListener("click",e=>this.tap(e));
    $("filters").querySelectorAll("button").forEach(b=>b.onclick=()=>{
      this.filter=b.dataset.f;
      $("filters").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));
      this.lastDraw=0;
    });
    requestAnimationFrame(t=>this.frame(t));
  },
  // Everything except satellites, placed for the time on show
  rebuild(){
    const t=S.t,out=[],lines=[],pos={};
    const fame=new Map(SIGHTS.map((x,i)=>[x.id,i]));
    const single=new Map(SIGHTS.filter(x=>!x.planet&&x.s.length===1).map(x=>[x.s[0],x]));
    for(const id in STARS){const s=STARS[id];pos[id]=altaz(s[2]*15,s[3],t,S.lat,S.lon)}
    for(const k in CONS)for(const [a,b] of CONS[k].l)if(pos[a].alt>-3||pos[b].alt>-3)lines.push({k,a:pos[a],b:pos[b]});
    for(const id in STARS){
      const s=STARS[id],p=pos[id],deep=isDeep(id),sg=single.get(id);
      if(p.alt<0||(!deep&&s[4]>3.2&&!sg))continue;
      out.push({cat:"star",alt:p.alt,az:p.az,deep,mag:deep?3:s[4],color:deep?"#9fb3d9":SPC[s[5][0]]||"#fff",
        name:sg?sg.n.replace(/,.*$/,""):s[0].replace(/ \(M\d+\)/,""),rank:sg?fame.get(sg.id):99,sel:sg?{type:"sight",id:sg.id}:{type:"star",id}});
    }
    for(const x of SIGHTS)if(!x.planet&&x.s.length>1){const p=altaz(x.c.ra,x.c.dec,t,S.lat,S.lon);if(p.alt>0)out.push({cat:"con",pattern:true,alt:p.alt,az:p.az,name:x.n,rank:fame.get(x.id),sel:{type:"sight",id:x.id}})}
    for(const k in CONS){const c=CONS[k],p=altaz(c.c.ra,c.c.dec,t,S.lat,S.lon);if(p.alt>0)out.push({cat:"con",alt:p.alt,az:p.az,name:c.n,rank:300,sel:{type:"con",id:k}})}
    for(const x of SIGHTS)if(x.planet){
      const pp=planetPos(x.planet,t);if(pp.elong<12)continue;
      const p=altaz(pp.ra,pp.dec,t,S.lat,S.lon);
      if(p.alt>0)out.push({cat:"planet",alt:p.alt,az:p.az,name:x.n,rank:fame.get(x.id),color:PCOL[x.planet],sel:{type:"sight",id:x.id}});
    }
    const m=moonAltAz(t,S.lat,S.lon);
    if(m.alt>0)out.push({cat:"planet",moon:true,alt:m.alt,az:m.az,name:"Moon",rank:-1,color:"#efe7cf",sel:{type:"moon",id:"moon"}});
    this.blips=out;this.lines=lines;this.lastDraw=0;
  },
  // Satellites move fast, so they're placed every second
  updateSats(){
    if(!Sats.ready){this.sats=[];return}
    const t=satTime(),sun=sunAltAt(t),dark=sun<-6,out=[];
    for(const s of Sats.list){
      const p=Sats.look(s,t);if(!p||p.alt<=0)continue;
      const seen=dark&&p.lit&&p.alt>=10;
      out.push({cat:"sat",alt:p.alt,az:p.az,name:s.label||s.name,named:!!s.label,seen,sel:{type:"sat",id:s.id}});
    }
    this.sats=out;
    if(S.sel&&S.sel.type==="sat")updateSatLive();
  },
  shown(b){
    const f=this.filter;
    if(f==="all")return !(b.cat==="con"&&!b.pattern);
    return b.cat===f;
  },
  labeled(b,topIds){
    if(this.filter==="all")return b.cat==="planet"||(b.cat==="sat"?b.named:topIds.has(b));
    if(b.cat==="star")return b.rank<99||b.mag<1.2;
    if(b.cat==="sat")return b.named||b.seen;
    return true;
  },
  frame(now){
    requestAnimationFrame(t=>this.frame(t));
    if(document.hidden||$("paneSky").hidden||!this.onScreen)return;
    const still=reduceMotion();
    if(now-this.lastSat>1000){this.lastSat=now;this.updateSats();if(still)this.lastDraw=0}
    if(still?this.lastDraw:now-this.lastDraw<FRAME_MS)return;
    this.lastDraw=now;this.draw(still?null:now);
  },
  // Return strength: how big and bright each kind of target paints
  echo(b){
    if(b.moon)return [7,1];
    if(b.cat==="planet")return [5,1];
    if(b.cat==="sat")return [3,b.seen?1:.45];
    if(b.cat==="con")return [4,b.pattern?.5:.35];
    if(b.deep)return [6,.35];
    return [Math.max(1.6,4.2-.8*b.mag),Math.min(1,.5+.25*(2-b.mag))];
  },
  draw(now){
    const {ctx,w}=sizeCanvas(this.cv),c=w/2,R=c-6,rot=Compass.heading||0;
    const sweep=drawScope(ctx,w,R,{rot,now,rings:[{r:R*60/90,dash:true,label:"30°"},{r:R*30/90,dash:true,label:"60°"}]});
    const xy=(alt,az)=>{const t=(az-rot)*D2R,r=(90-alt)/90*R;return [c+Math.sin(t)*r,c-Math.cos(t)*r,t]};
    // Did the beam cross this bearing since the last frame?
    const last=this.lastSweep,crossed=ang=>{
      if(sweep==null||last==null)return false;
      const span=((sweep-last)%TAU+TAU)%TAU,d=((ang-last)%TAU+TAU)%TAU;
      return d>0&&d<=span;
    };
    this.lastSweep=sweep;
    ctx.save();ctx.beginPath();ctx.arc(c,c,R,0,TAU);ctx.clip();
    // constellation outlines glow only as the beam passes
    if(this.filter==="all"||this.filter==="con"){
      ctx.lineWidth=1;
      for(const l of this.lines){
        const [x1,y1]=xy(l.a.alt,l.a.az),[x2,y2]=xy(l.b.alt,l.b.az),mx=(x1+x2)/2,my=(y1+y2)/2;
        const g=glow(sweep,Math.atan2(mx-c,c-my))*(this.filter==="con"?.55:.3);
        if(g<.01)continue;
        ctx.strokeStyle=`rgba(${RG},${g.toFixed(3)})`;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
      }
    }
    const all=[...this.blips,...this.sats].filter(b=>this.shown(b));
    const top=new Set(all.filter(b=>b.cat!=="planet"&&b.cat!=="sat"&&b.rank<99).sort((a,b)=>a.rank-b.rank).slice(0,9));
    this.hits=[];const labels=[],seenSats=new Set();
    for(const b of all){
      const [x,y,ang]=xy(b.alt,b.az),[size,str]=this.echo(b);
      this.hits.push({x,y,b});
      if(b.cat==="sat"){
        // moving targets: painted where they are when the beam crosses, older paints stay as fading history dots
        const id=b.sel.id;seenSats.add(id);
        let hist=this.paints.get(id);if(!hist)this.paints.set(id,hist=[]);
        if(crossed(ang)){hist.push({x,y,t:now,ang});if(hist.length>4)hist.shift()}
        hist.forEach((p,i)=>{
          const age=now-p.t,newest=i===hist.length-1;
          const g=sweep==null?.8:Math.exp(-age/(newest?PERSIST_MS:8000))*(newest?1:.35);
          if(g>.02)drawReturn(ctx,c,p.x,p.y,newest?size:1.6,g*str,newest?age:1e9);
          if(newest&&g>.2&&this.labeled(b,top))labels.push({x:p.x,y:p.y,b,a:g});
        });
        if(sweep==null){drawReturn(ctx,c,x,y,size,.8*str,1e9);if(this.labeled(b,top))labels.push({x,y,b,a:.8})}
        continue;
      }
      const g=glow(sweep,ang);
      if(g<=0)continue;
      drawReturn(ctx,c,x,y,size,g*str,sweep==null?1e9:sweptAgo(sweep,ang));
      if(g>.2&&this.labeled(b,top))labels.push({x,y,b,a:g});
    }
    ctx.restore();
    // forget satellites that have left the sky
    for(const id of this.paints.keys())if(!seenSats.has(id))this.paints.delete(id);
    // names light up with their return and fade with it
    ctx.textAlign="left";const placed=[];
    // keep names inside the scope (within R-8 of the center) and off the N/E/S/W letters, which sit at R-22
    const inside=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x0,y1],[x1,y1]].every(([x,y])=>Math.hypot(x-c,y-c)<=R-8);
    const letters=[0,90,180,270].map(a=>{const t=(a-rot)*D2R;return [c+Math.sin(t)*(R-22),c-Math.cos(t)*(R-22)]});
    for(const l of labels.sort((p,q)=>(p.b.cat==="planet"?-1:0)-(q.b.cat==="planet"?-1:0)||p.b.rank-q.b.rank)){
      const text=l.b.name,big=l.b.cat==="planet"||l.b.rank<6,planet=l.b.cat==="planet";
      ctx.font=`${big?"600 12px":"11px"} 'Atkinson Hyperlegible', sans-serif`;
      const tw=ctx.measureText(text).width;
      const onLetter=(lx,ly)=>letters.some(([x,y])=>lx<x+11&&lx+tw>x-11&&ly-10<y+11&&ly+3>y-11);
      const onLabel=(lx,ly)=>placed.some(p=>lx<p.x+p.w&&lx+tw>p.x&&Math.abs(ly-p.y)<12);
      // try right, left, centered above (toward the center), then centered below
      const spots=[[l.x+9,l.y+4],[l.x-9-tw,l.y+4],[l.x-tw/2,l.y-9],[l.x-tw/2,l.y+17]];
      let spot=spots.find(([lx,ly])=>inside(lx,ly-10,lx+tw,ly+3)&&(planet||!onLetter(lx,ly))&&!onLabel(lx,ly));
      if(!spot){
        if(!planet)continue;
        // planets and the Moon always keep their name: centered on the side toward the middle, kept on the canvas
        spot=[Math.min(Math.max(2,l.x-tw/2),w-tw-2),Math.min(Math.max(12,l.y>c?l.y-9:l.y+17),w-4)];
      }
      const [lx,ly]=spot;
      placed.push({x:lx,y:ly,w:tw});
      ctx.fillStyle=`rgba(${RG},${l.a.toFixed(3)})`;ctx.fillText(text,lx,ly);
    }
    // the locked target keeps a steady data tag, like a tracked target on a real scope
    const sel=S.sel&&this.hits.find(h=>h.b.sel.type===S.sel.type&&h.b.sel.id===S.sel.id);
    if(sel){
      const k=10,{x,y}=sel;
      ctx.strokeStyle="#ffcf6b";ctx.lineWidth=2;ctx.beginPath();
      for(const [sx,sy] of [[-1,-1],[1,-1],[1,1],[-1,1]]){ctx.moveTo(x+sx*k,y+sy*(k-5));ctx.lineTo(x+sx*k,y+sy*k);ctx.lineTo(x+sx*(k-5),y+sy*k)}
      ctx.stroke();
      ctx.font="600 12px 'IBM Plex Mono', monospace";
      const tag=sel.b.name.toUpperCase(),tw=ctx.measureText(tag).width,tx=x+14+tw>w-4?x-14-tw:x+14;
      ctx.fillStyle="#ffcf6b";ctx.fillText(tag,tx,y-12);
    }
  },
  tap(e){
    const r=this.cv.getBoundingClientRect(),px=e.clientX-r.left,py=e.clientY-r.top;
    let best=null,bd=1e9;
    for(const h of this.hits){
      const d=Math.hypot(h.x-px,h.y-py)-(h.b.cat==="planet"?6:0)-(h.b.rank<99?3:0);
      if(d<bd){bd=d;best=h}
    }
    if(best&&bd<24){toggleSel(best.b.sel.type,best.b.sel.id);if(S.sel)$("finder").scrollIntoView({behavior:reduceMotion()?"auto":"smooth",block:"nearest"})}
  }
};
function sunAltAt(t){const s=sunPos(t);return altaz(s.ra,s.dec,t,S.lat,S.lon).alt}
// Satellites follow the clock when showing "now", otherwise the chosen time
const satTime=()=>S.live?nowOrDusk():S.t;
