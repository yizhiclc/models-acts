struct Params { clock: vec4f, counts: vec4f, domain: vec4f, physics: vec4f, wind: vec4f, spare: vec4f }
@group(0) @binding(0) var<uniform> u: Params;
@group(0) @binding(1) var<storage,read> src: array<vec2f>;
@group(0) @binding(2) var<storage,read_write> dst: array<vec2f>;
@group(0) @binding(3) var<storage,read_write> impulse: array<atomic<i32>>;
@group(0) @binding(4) var<storage,read> mask: array<vec2f>;
fn idx(p: vec2i)->u32 {let q=clamp(p,vec2i(0),vec2i(i32(u.domain.y)-1));return u32(q.y*i32(u.domain.y)+q.x);}
fn blocked(p: vec2i)->bool {return any(p<vec2i(0)) || any(p>=vec2i(i32(u.domain.y))) || mask[idx(p)].x>0.5;}
fn sampleAt(p: vec2i,center: vec2f)->vec2f {if(blocked(p)){return center;}return src[idx(p)];}
fn lap(p: vec2i)->vec2f {
  let c=src[idx(p)];
  return (sampleAt(p+vec2i(1,0),c)+sampleAt(p+vec2i(-1,0),c)+sampleAt(p+vec2i(0,1),c)+sampleAt(p+vec2i(0,-1),c)-4.0*c)/(u.domain.z*u.domain.z);
}
fn neighborLap(p: vec2i,c: f32)->f32 {if(blocked(p)){return c;}return lap(p).x;}
@compute @workgroup_size(8,8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let n=u32(u.domain.y); if(gid.x>=n || gid.y>=n){return;}
  let i=gid.y*n+gid.x; let p=vec2i(gid.xy);
  let force=f32(atomicExchange(&impulse[i],0))/10000000.0;
  if(blocked(p)){dst[i]=vec2f(0.0);return;}
  let state=src[i];let l=lap(p);
  let bih=(neighborLap(p+vec2i(1,0),l.x)+neighborLap(p+vec2i(-1,0),l.x)+neighborLap(p+vec2i(0,1),l.x)+neighborLap(p+vec2i(0,-1),l.x)-4.0*l.x)/(u.domain.z*u.domain.z);
  let world=(vec2f(gid.xy)/f32(n)-0.5)*u.domain.x;
  let breeze=u.clock.w*0.000018*(sin(dot(world,vec2f(37.0,19.0))-u.clock.y*4.0)+0.4*sin(dot(world,vec2f(-61.0,33.0))+u.clock.y*5.2));
  let acc=u.physics.x*u.physics.x*l.x-u.physics.y*bih+u.physics.w*l.y+breeze;
  let vel=(state.y+acc*u.clock.x+force)*exp(-u.physics.z*u.clock.x);
  dst[i]=vec2f(state.x+vel*u.clock.x,vel);
}
