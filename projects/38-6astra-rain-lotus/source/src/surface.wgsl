struct Params { clock: vec4f, counts: vec4f, domain: vec4f, physics: vec4f, wind: vec4f, spare: vec4f }
@group(0) @binding(0) var<uniform> u: Params;
@group(0) @binding(1) var<storage,read> state: array<vec2f>;
@group(0) @binding(2) var out: texture_storage_2d<rgba16float,write>;
fn h(p: vec2i)->f32 {let q=clamp(p,vec2i(0),vec2i(i32(u.domain.y)-1));return state[u32(q.y*i32(u.domain.y)+q.x)].x;}
@compute @workgroup_size(8,8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
 let p=vec2i(gid.xy); let n=u32(u.domain.y);if(gid.x>=n || gid.y>=n){return;}
 let c=state[gid.y*n+gid.x];
 let dx=(h(p+vec2i(1,0))-h(p-vec2i(1,0)))/(2.0*u.domain.z);
 let dz=(h(p+vec2i(0,1))-h(p-vec2i(0,1)))/(2.0*u.domain.z);
 textureStore(out,p,vec4f(c.x,dx,dz,abs(c.y)));
}
