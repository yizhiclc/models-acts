export const SIZE = 8;
export const RESOLUTION = 512;
export const DX = SIZE / RESOLUTION;
export const FIXED_DT = 1 / 120;
export const MAX_RAIN = 4096;
export const MAX_LEAVES = 80;
export const MAX_EXTRA = 64;
export const WAVE_SPEED = 0.23;
export const CAPILLARY = 2.4e-7;
export const DAMPING = 0.38;
export const VISCOSITY = 2.8e-5;
export function seededRandom(seed = 1977) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function leafHeight(x, z, radius, phase = 0) {
  const r = Math.hypot(x, z) / radius, a = Math.atan2(z, x);
  return -0.032 * (1 - r * r) + 0.009 * Math.sin(7 * a + phase) * r ** 3 + 0.006 * Math.sin(3 * a - phase) * r ** 2;
}
export function leafGradient(x, z, radius, phase = 0) {
  const e = 0.0006;
  return [(leafHeight(x+e,z,radius,phase)-leafHeight(x-e,z,radius,phase))/(2*e), (leafHeight(x,z+e,radius,phase)-leafHeight(x,z-e,radius,phase))/(2*e)];
}
export const diameterToVolume = d => Math.PI / 6 * d ** 3;
export const volumeToRadius = v => Math.cbrt(3 * Math.max(0,v) / (4 * Math.PI));
export const terminalSpeed = d => 3.2 + 6.0 * (1 - Math.exp(-((d * 1000 - 0.65) / 1.7)));
// Shared by the terrain, water material and obstacle grid. The square compute
// domain is an invisible bounding box, not the visible shoreline.
export function shoreRadius(a){return 3.48+.22*Math.sin(a*3+.5)+.15*Math.cos(a*5-.3)+.13*Math.sin(a*2-1.4);}
export function shoreDistance(x,z){const zz=z/.93;return Math.hypot(x,zz)-shoreRadius(Math.atan2(zz,x));}
export function terrainHeight(x,z){const d=shoreDistance(x,z);if(d<0)return Math.max(-.55,d*1.65);const n=Math.sin(x*.72+Math.cos(z*.91))*Math.cos(z*.64-x*.13);return (.19+n*.11)*(1-Math.exp(-d*2.8))+.025*Math.sin(x*5.3)*Math.cos(z*4.1)*(1-Math.exp(-d*1.7));}
