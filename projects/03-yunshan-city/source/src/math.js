export const VOXEL = 0.2;
export const snap = (v, step = VOXEL) => Math.round(v / step) * step;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => { const t = clamp((v-a)/(b-a),0,1); return t*t*(3-2*t); };
export function random(seed = 613) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function hash(x,z) { let a = Math.imul(x|0,374761393) + Math.imul(z|0,668265263); a = Math.imul(a ^ a >>> 13,1274126177); return ((a ^ a >>> 16) >>> 0) / 4294967295; }
export function noise(x,z) { const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz,u=fx*fx*(3-2*fx),v=fz*fz*(3-2*fz); return lerp(lerp(hash(ix,iz),hash(ix+1,iz),u),lerp(hash(ix,iz+1),hash(ix+1,iz+1),u),v); }
export function fbm(x,z) { return noise(x,z)*.55+noise(x*2.07+4,z*2.07)*.27+noise(x*4.19,z*4.19+8)*.13+noise(x*8.13,z*8.13)*.05; }
export function nearestSegment(x,z,a,b) { const dx=b[0]-a[0],dz=b[2]-a[2],t=clamp(((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz || 1),0,1); return {t,x:a[0]+dx*t,z:a[2]+dz*t,y:lerp(a[1],b[1],t),d:Math.hypot(x-a[0]-dx*t,z-a[2]-dz*t)}; }
export function samplePolyline(nodes, step = 1) {
  const points=[]; let distance=0;
  nodes.forEach((a,i)=>{ if(i===nodes.length-1)return; const b=nodes[i+1],len=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]),n=Math.max(1,Math.ceil(len/step)); for(let j=0;j<n;j++){const t=j/n;points.push({x:lerp(a[0],b[0],t),y:lerp(a[1],b[1],t),z:lerp(a[2],b[2],t),d:distance+len*t});} distance+=len; });
  const a=nodes.at(-1); points.push({x:a[0],y:a[1],z:a[2],d:distance}); return points;
}
export function pointAt(points,d) { d=clamp(d,0,points.at(-1).d); let lo=0,hi=points.length-1;while(lo<hi){const m=(lo+hi)>>>1;if(points[m].d<d)lo=m+1;else hi=m;}const b=points[lo],a=points[Math.max(0,lo-1)],t=b.d===a.d?0:(d-a.d)/(b.d-a.d);return {x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t),z:lerp(a.z,b.z,t)}; }
