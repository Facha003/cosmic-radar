/* ---------- Phone compass ---------- */
// Heading in degrees clockwise from north, smoothed so the dial turns calmly instead of jittering
const Compass={
  heading:null,onChange:null,_raw:null,_frame:0,
  supported(){return "DeviceOrientationEvent" in window},
  async start(){
    // iPhone asks for permission; this must run from a tap
    if(typeof DeviceOrientationEvent.requestPermission==="function"){
      let r;try{r=await DeviceOrientationEvent.requestPermission()}catch(e){r="denied"}
      if(r!=="granted")return "denied";
    }
    const take=h=>{
      const a=(screen.orientation&&screen.orientation.angle)||window.orientation||0;
      this._raw=norm(h+a);
      if(!this._frame)this._frame=requestAnimationFrame(()=>this._step());
    };
    if("ondeviceorientationabsolute" in window)addEventListener("deviceorientationabsolute",e=>{if(e.alpha!=null)take(360-e.alpha)});
    else addEventListener("deviceorientation",e=>{
      if(e.webkitCompassHeading!=null)take(e.webkitCompassHeading);
      else if(e.absolute&&e.alpha!=null)take(360-e.alpha);
    });
    // Desktops expose the API but never send a reading
    for(let i=0;i<20&&this._raw==null;i++)await new Promise(r=>setTimeout(r,100));
    return this._raw==null?"none":"ok";
  },
  _step(){
    this._frame=0;
    if(this.heading==null)this.heading=this._raw;
    else{
      const d=((this._raw-this.heading+540)%360)-180;
      this.heading=norm(this.heading+d*0.2);
      if(Math.abs(d)>0.5)this._frame=requestAnimationFrame(()=>this._step());
    }
    if(this.onChange)this.onChange();
  }
};
