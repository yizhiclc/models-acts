struct Params { clock: vec4f, counts: vec4f, domain: vec4f, physics: vec4f, wind: vec4f, spare: vec4f }
struct Particle { p: vec4f, motion: vec4f, hit: vec4f }
struct Leaf { center: vec4f, slope: vec4f }
struct Event { local: vec4f, stamp: vec4f }
@group(0) @binding(0) var<uniform> u: Params;
@group(0) @binding(1) var<storage,read_write> rain: array<Particle>;
@group(0) @binding(2) var<storage,read_write> impulse: array<atomic<i32>>;
@group(0) @binding(3) var<storage,read> leaves: array<Leaf>;
@group(0) @binding(4) var<storage,read_write> events: array<Event>;
@group(0) @binding(5) var<storage,read> mask: array<vec2f>;
@group(0) @binding(6) var<storage,read> extra: array<vec4f>;
@group(0) @binding(7) var<storage,read_write> counters: array<atomic<u32>>;
fn hash(x: f32) -> f32 { var h=bitcast<u32>(x);h^=h>>16u;h*=0x7feb352du;h^=h>>15u;h*=0x846ca68bu;h^=h>>16u;return f32(h>>8u)/16777216.0; }
fn indexAt(p: vec2f) -> u32 { let xy = clamp(vec2i((p / u.domain.x + 0.5) * u.domain.y),vec2i(0),vec2i(i32(u.domain.y)-1)); return u32(xy.y)*u32(u.domain.y)+u32(xy.x); }
fn kick(p: vec2f, diameter: f32, speed: f32) {
  let n=i32(u.domain.y); let c=vec2i((p/u.domain.x+0.5)*f32(n));
  let strength=0.008 * pow(diameter/0.002,3.0) * speed/6.0;
  // Compact, approximately zero-mean Mexican-hat velocity impulse. No animated rings.
  for(var z=-3;z<=3;z++) { for(var x=-3;x<=3;x++) {
    let q=c+vec2i(x,z); if(any(q<vec2i(1)) || any(q>=vec2i(n-1))) {continue;}
    let r2=f32(x*x+z*z); let kernel=(r2/1.8-0.99803134)*exp(-r2/1.8);
    let k=u32(q.y*n+q.x); if(mask[k].x<0.5){atomicAdd(&impulse[k],i32(strength*kernel*10000000.0));}
  }}
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i=gid.x; if(i>=4096u){return;}
  var a=rain[i]; a.hit.w += u.clock.x;
  if(i>=4032u && i-4032u<u32(u.counts.w)) {
    let e=extra[i-4032u]; if(abs(e.x)<3.98 && abs(e.y)<3.98 && mask[indexAt(e.xy)].x<0.5) {
      kick(e.xy,e.z,e.w); a.hit=vec4f(e.xy,e.z,0.0); atomicAdd(&counters[0],1u);
    }
  }
  if(i>=u32(u.counts.x)){a.p.y=-100.0;a.motion.z=0.0;rain[i]=a;return;}
  if(a.motion.z<0.5 || a.p.y<0.0) {
    a.motion.w += 1.0;
    let seed=f32(i)*17.23+a.motion.w*71.7;
    let d=0.001+0.003*pow(hash(seed+11.1),mix(4.5,1.3,u.clock.z));
    a.p=vec4f((hash(seed)-0.5)*7.9,3.8+hash(seed+2.0)*0.6,(hash(seed+3.0)-0.5)*7.9,d);
    a.motion.x=3.2+6.0*(1.0-exp(-(d*1000.0-0.65)/1.7)); a.motion.z=1.0;
    // Spread newly activated drops vertically, avoiding a synchronized sheet of rain.
    if(a.motion.w<1.5){a.p.y=hash(seed+5.0)*4.4;}
  }
  let prev=a.p.xyz;
  a.p=vec4f(a.p.xyz+vec3f(u.wind.x,-a.motion.x,u.wind.y)*u.clock.x,a.p.w);
  if(abs(a.p.x)>3.98 || abs(a.p.z)>3.98){a.motion.z=0.0;rain[i]=a;return;}
  var hit=-1; var high=-10.0; var local=vec2f(0.0);
  for(var j=0u;j<u32(u.counts.y);j++) {
    let l=leaves[j]; let q=a.p.xz-l.center.xz; let r=length(q)/l.center.w;
    if(r>1.0){continue;}
    let theta=atan2(q.y,q.x);
    let h=l.center.y+dot(l.slope.xy,q)-0.032*(1.0-r*r)+0.009*sin(7.0*theta+l.slope.z)*r*r*r+0.006*sin(3.0*theta-l.slope.z)*r*r;
    if(prev.y>=h && a.p.y<=h && h>high){hit=i32(j);high=h;local=q;}
  }
  if(hit>=0) {
    events[i].local=vec4f(local,a.p.w,f32(hit)); events[i].stamp=vec4f(u.clock.y,a.motion.w,0.0,0.0);
    atomicAdd(&counters[1],1u); a.motion.z=0.0; a.p.y=-100.0;
  } else if(a.p.y<=0.0) {
    let t=clamp(prev.y/(prev.y-a.p.y),0.0,1.0); let p=mix(prev.xz,a.p.xz,t); let m=mask[indexAt(p)];
    if(m.x<0.5 && m.y<0.5){kick(p,a.p.w,a.motion.x);a.hit=vec4f(p,a.p.w,0.0);atomicAdd(&counters[0],1u);}
    a.motion.z=0.0;a.p.y=-100.0;
  }
  rain[i]=a;
}
