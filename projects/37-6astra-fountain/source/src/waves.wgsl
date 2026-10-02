struct Params { sim: vec4f, frame: vec4f }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage,read> oldField: array<vec4f>;
@group(0) @binding(2) var<storage,read_write> newField: array<vec4f>;
@group(0) @binding(3) var<storage,read_write> impulses: array<atomic<i32>>;
fn valid(x:i32,y:i32,layer:u32)->bool{
  let q=(vec2f(f32(x),f32(y))/127.0-.5)*2.0;
  let r=length(q);let inner=select(select(.145,.19,layer==1u),.18,layer==2u);
  return x>=0&&y>=0&&x<128&&y<128&&r<.997&&r>inner;
}
fn neighbor(x:i32,y:i32,layer:u32,h:f32)->f32{
  // Zero normal derivative: waves reflect off the coping and central stone.
  if(!valid(x,y,layer)){return h;}
  return oldField[layer*16384u+u32(y)*128u+u32(x)].x;
}
@compute @workgroup_size(128)
fn advanceWaves(@builtin(global_invocation_id) gid:vec3u){
  let id=gid.x;if(id>=49152u){return;}
  let layer=id/16384u;let local=id%16384u;let x=i32(local%128u);let y=i32(local/128u);
  let impact=f32(atomicExchange(&impulses[id],0))*.000025;
  if(!valid(x,y,layer)){newField[id]=vec4f(0.0);return;}
  let old=oldField[id];let h=old.x;let dt=params.sim.x;
  let r=select(select(3.16,1.565,layer==1u),.844,layer==2u);
  let dx=r*2.0/127.0;
  let c=select(select(.78,.43,layer==1u),.25,layer==2u);
  let lap=(neighbor(x-1,y,layer,h)+neighbor(x+1,y,layer,h)+neighbor(x,y-1,layer,h)+neighbor(x,y+1,layer,h)-4.0*h)/(dx*dx);
  var v=(old.y+(c*c*lap-h*.35)*dt)*exp(-dt*1.55)-clamp(impact,-1.2,1.2);
  var height=clamp(h+v*dt,-.055,.055);
  // Foam is deposited by the very same collision flux, then dissipates.
  let foam=clamp(old.z*exp(-dt*1.1)+max(impact,0.0)*.18,0.0,1.0);
  newField[id]=vec4f(height,v,foam,0.0);
}
