// Persistent Lagrangian water parcels. No position is reconstructed from time.
struct Params { sim: vec4f, frame: vec4f }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> positions: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> velocities: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> metadata: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> events: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> impulses: array<atomic<i32>>;
@group(0) @binding(6) var<storage, read_write> reservoirs: array<vec4f>;
const CORE: u32 = 65536u;
const COUNT: u32 = 98304u;
const GRID: u32 = 128u;
const CELLS: u32 = 16384u;
const TAU: f32 = 6.2831853;
fn rnd(x: u32) -> f32 {
  var n=x; n=(n^(n>>16u))*2246822519u; n=(n^(n>>13u))*3266489917u;
  return f32(n^(n>>16u))/4294967295.0;
}
fn radial(a:f32) -> vec3f { return vec3f(sin(a),0.0,cos(a)); }
fn radius(layer:u32)->f32 {return select(select(3.16,1.565,layer==1u),.844,layer==2u);}
fn level(layer:u32)->f32 {return select(select(.565,1.925,layer==1u),3.215,layer==2u);}
fn collideWater(id:u32, p:vec3f, speed:f32, layer:u32) {
  events[id]=vec4f(p,params.sim.y);
  let r=radius(layer);
  let uv=(p.xz/r*.5+vec2f(.5))*127.0;
  let cell=vec2i(round(uv));
  let energy=clamp(speed*metadata[id].z*70000.0,.05,80.0);
  for(var j:i32=-1;j<=1;j++){for(var k:i32=-1;k<=1;k++){
    let xy=clamp(cell+vec2i(k,j),vec2i(0),vec2i(127));
    // Zero-sum displacement: depression at impact and raised surrounding ring.
    let weight=select(-.125,1.0,k==0&&j==0);
    atomicAdd(&impulses[layer*CELLS+u32(xy.y)*GRID+u32(xy.x)],i32(energy*weight*1000.0));
  }}
  // Only original water transfers volume. Splash parcels never create water.
  if(velocities[id].w==1.0 && layer>0u){atomicAdd(&impulses[CELLS*3u+layer-1u],i32(metadata[id].z*100000000.0));}
}
@compute @workgroup_size(128)
fn initialize(@builtin(global_invocation_id) gid:vec3u) {
  let id=gid.x;if(id>=COUNT){return;}
  positions[id]=vec4f(0.0,-10.0,0.0,-1.0);velocities[id]=vec4f(0.0);
  metadata[id]=vec4f(0.0);events[id]=vec4f(0.0,-10.0,0.0,-100.0);
  if(id==0u){reservoirs[0]=vec4f(.030,.054,.02,.038);reservoirs[1]=vec4f(params.sim.z,params.sim.w,0.0,0.0);}
}
@compute @workgroup_size(1)
fn hydraulics() {
  let dt=params.sim.x;
  // These counters contain actual collision deposits from the preceding step.
  let lowerIn=f32(atomicExchange(&impulses[CELLS*3u],0))/100000000.0;
  let upperIn=f32(atomicExchange(&impulses[CELLS*3u+1u],0))/100000000.0;
  var s=reservoirs[0];
  s.x=max(.018,s.x+upperIn-s.z*dt);
  s.y=max(.032,s.y+lowerIn-s.w*dt);
  s.z=max(0.0,s.x-.02)*1.9;
  s.w=max(0.0,s.y-.035)*2.0;
  reservoirs[0]=s;
  reservoirs[1]=vec4f(mix(reservoirs[1].x,params.sim.z,1.0-exp(-dt*2.8)),mix(reservoirs[1].y,params.sim.w,1.0-exp(-dt*1.7)),upperIn/dt,lowerIn/dt);
}
fn advanceParticle(id:u32) {
  if(id>=COUNT){return;}
  let dt=params.sim.x;let time=params.sim.y;let tick=u32(params.frame.x);
  let power=reservoirs[1].x;let wind=reservoirs[1].y;
  let random=rnd(id*917u+tick*271u);
  var p=positions[id];var v=velocities[id];var m=metadata[id];
  if(id<CORE){
    let physicalStream=id/512u;let stream=physicalStream/2u;let lane=f32(physicalStream%2u)-.5;
    let slot=id%512u;let head=(tick*2u)%512u;
    if(slot==head||slot==(head+1u)%512u){
      var a=f32(stream%8u)*TAU/8.0;
      let phase=time*1.7+f32(physicalStream)*.73;
      let pulse=sin(phase)*.025+sin(time*4.7)*.008;
      let pump=5.6+power*2.15;
      let flow=.35+power*.95;
      var alive=1.0;
      if(stream<8u){
        let dir=radial(a);
        p=vec4f(dir*.038+vec3f(0.0,3.476,0.0),0.0);
        v=vec4f(dir*(.24+power*.15)+vec3f(pulse,pump+sin(phase)*.05,pulse*.7),1.0);
        m=vec4f(.017*sqrt(flow),f32(stream),.000010*flow,time);
      }else if(stream<16u){
        let dir=radial(a);
        p=vec4f(dir*.514+vec3f(0.0,2.606,0.0),0.0);
        v=vec4f(dir*(1.35+power*.65)+vec3f(pulse,1.15+power*.80,pulse*.5),1.0);
        m=vec4f(.024*sqrt(flow),f32(stream),.000014*flow,time);
      }else{
        let upper=stream<40u;
        let k=select(stream-40u,stream-16u,upper);
        // Eight scalloped spillways, each sampled by three adjacent strands.
        a=f32(k/3u)*TAU/8.0+(f32(k%3u)-1.0)*select(.037,.063,upper)+select(.23,.0,upper);
        let dir=radial(a);
        let q=select(reservoirs[0].w,reservoirs[0].z,upper);
        let r=select(1.659,.891,upper);
        p=vec4f(dir*r+vec3f(0.0,select(1.977,3.277,upper),0.0),0.0);
        v=vec4f(dir*(.12+sqrt(max(q,0.0))*.38)+vec3f(0.0,-.08,0.0),1.0);
        m=vec4f(select(.051,.043,upper)*clamp(sqrt(q/.018),.04,1.4),f32(stream),q/(24.0*240.0),time);
        if(q<.0003){alive=0.0;}
      }
      v.w=alive;
      p=vec4f(p.xyz+radial(a+1.5707963)*lane*select(.010,.022,stream>=16u),p.w);
      m.x*=.70;m.z*=.5;
      // Two temporally separated parcels per stream and fixed simulation step.
      let offset=(1.0-f32(slot-head))*dt*.5;
      p=vec4f(p.xyz+v.xyz*offset,offset);
      m.w=time-offset;
      positions[id]=p;velocities[id]=v;metadata[id]=m;return;
    }
  }else{
    let local=id-CORE;let slot=local%256u;let stream=local/256u;
    if(slot==tick%256u){
      // Read stable preceding-step impacts, or shed a drop from an aging core.
      // The core and secondary systems are separate dispatches to avoid races.
      let source=stream*512u+(tick*2u+499u)%512u;
      let ev=events[source];let coreP=positions[source];let coreV=velocities[source];
      let angle=rnd(id+tick*31u)*TAU;
      let d=radial(angle);
      if(time-ev.w<.18 && ev.y>.4){
        let speed=.38+random*.9*(.5+power);
        p=vec4f(ev.xyz+vec3f(0.0,.016,0.0),0.0);
        v=vec4f(d*(.2+random*.5)+vec3f(0.0,speed,0.0),2.0);
        m=vec4f(.005+random*.008,f32(stream),0.000001,time);
      }else{
        let older=stream*512u+(tick*2u+310u)%512u;
        let cp=positions[older];let cv=velocities[older];
        if(cv.w==1.0&&cp.w>.25&&cp.y>1.0){
          p=vec4f(cp.xyz,0.0);v=vec4f(cv.xyz+d*(.12+random*.3)+vec3f(0.0,random*.12,0.0),3.0);
          m=vec4f(.003+random*.006,f32(stream),0.0000005,time);
        }else{v.w=0.0;}
      }
      positions[id]=p;velocities[id]=v;metadata[id]=m;return;
    }
  }
  if(v.w<.5){return;}
  let prev=p.xyz;let speed=length(v.xyz);let fine=v.w>1.5;
  let stream=u32(m.y);let curtain=stream>=16u;
  // Drag scales with size. A coherent jet has much less side acceleration.
  let windCoupling=select(select(.12,.22,curtain),1.6+(.013-m.x)*70.0,fine);
  let air=vec3f(wind,0.0,wind*.32);
  let turbulence=vec3f(sin(p.y*3.2+time*2.1),sin(p.x*7.1-time),cos(p.y*4.1+time*1.4))*select(.075,.23,fine);
  v=vec4f(v.xyz+(vec3f(0.0,-9.81,0.0)+(air-v.xyz*.075)*windCoupling+turbulence)*dt,v.w);
  p=vec4f(p.xyz+v.xyz*dt,p.w+dt);
  var hit=false;
  // Swept crossing tests select the first basin struck, top to bottom.
  for(var l:i32=2;l>=0;l--){
    let layer=u32(l);let y=level(layer);
    if(prev.y>y&&p.y<=y&&v.y<0.0){
      let f=(prev.y-y)/max(prev.y-p.y,.00001);
      let at=mix(prev,p.xyz,f);let r=length(at.xz);
      let inner=select(select(.46,.30,layer==1u),.15,layer==2u);
      if(r<radius(layer)&&r>inner){
        collideWater(id,vec3f(at.x,y,at.z),abs(v.y),layer);
        p=vec4f(at.x,y+.009,at.z,p.w);
        // Only some primary parcels rebound; all remaining volume joins basin.
        if(v.w==1.0&&rnd(id+tick)<.16+power*.1){
          let d=radial(rnd(id*3u+tick)*TAU);
          v=vec4f(d*(.17+random*.55)+vec3f(0.0,min(abs(v.y)*.21,1.3),0.0),2.0);
          m.x=.005+random*.008;m.z=0.0;p.w=0.0;
        }else{v.w=0.0;}
        hit=true;break;
      }
    }
  }
  if(!hit){
    var r=length(p.xz);let outward=vec3f(p.x/max(r,.001),0.0,p.z/max(r,.001));
    // Rotational hull for the stem and the pedestal.
    var pillar=.0;
    if(p.y<1.56){pillar=select(.32,.54,p.y<.78);}
    else if(p.y<2.93){pillar=.24;}
    else if(p.y<3.4){pillar=.15;}
    if(r<pillar&&v.w>.5){p=vec4f(outward.x*(pillar+.008),p.y,outward.z*(pillar+.008),p.w);v=vec4f(v.xyz-outward*min(dot(v.xyz,outward),0.0)*1.18,v.w);}
    // Rolled lips / outer shells catch water that misses the flat water tests.
    for(var k=0u;k<2u;k++){
      let upper=k==1u;let lipR=select(1.64,.875,upper);let lipY=select(1.92,3.245,upper);
      let q=vec2f(r-lipR,p.y-lipY);let qlen=length(q);let lipTube=select(.047,.031,upper);
      // New overflow leaves from the outermost lip, not through its interior.
      if(qlen<lipTube && p.w>.025){let n2=q/max(qlen,.00001);let normal=vec3f(outward.x*n2.x,n2.y,outward.z*n2.x);p=vec4f(p.xyz+normal*(lipTube-qlen+.002),p.w);v=vec4f(v.xyz-normal*min(dot(v.xyz,normal),0.0)*1.12,v.w);}
    }
    // Annular pool coping collision, including inward reflection below rim.
    r=length(p.xz);
    if(r>3.155&&r<3.66&&p.y<.80){
      if(prev.y>=.80){p.y=.805;v.y=abs(v.y)*.15;v.w=2.0;}
      else if(length(prev.xz)<3.16){p=vec4f(outward.x*3.15,p.y,outward.z*3.15,p.w);v=vec4f(v.xyz-outward*max(dot(v.xyz,outward),0.0)*1.25,v.w);}
    }
  }
  if(p.y<.09||p.w>select(2.10,1.8,fine)||length(p.xz)>5.0){v.w=0.0;}
  positions[id]=p;velocities[id]=v;metadata[id]=m;
}
@compute @workgroup_size(128)
fn advanceCore(@builtin(global_invocation_id) gid:vec3u) {
  if(gid.x<CORE){advanceParticle(gid.x);}
}
@compute @workgroup_size(128)
fn advanceSecondary(@builtin(global_invocation_id) gid:vec3u) {
  advanceParticle(gid.x+CORE);
}
