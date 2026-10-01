// Metres. This source is deliberately shared by the terrain mesh and GPU water.
export const ISLANDS = [
  { x: 49, z: -111, rx: 96, rz: 71, height: 44, seed: 0.8 },
  { x: -246, z: -330, rx: 169, rz: 102, height: 59, seed: 2.1 },
  { x: 348, z: -385, rx: 188, rz: 110, height: 58, seed: 4.0 }
];
export function bedHeight(x, z) {
  let h = -28;
  for (const a of ISLANDS) {
    const qx = (x-a.x)/a.rx, qz = (z-a.z)/a.rz;
    const angle = Math.atan2(qz, qx);
    const r = Math.hypot(qx,qz)*(1+.075*Math.sin(angle*3+a.seed)+.043*Math.sin(angle*5-1));
    h = Math.max(h, -28 + a.height*Math.exp(-1.12*r*r) + 2.7*Math.sin(x*.051)*Math.cos(z*.055)*Math.exp(-5*r*r));
  }
  const rx = (x+66)/57, rz=(z+34)/23;
  h = Math.max(h, -28+27.1*Math.exp(-1.1*(rx*rx+rz*rz)));
  return h;
}
export const BATHYMETRY_WGSL = `
fn bed(p: vec2<f32>) -> f32 {
  var h = -28.0;
  ${ISLANDS.map(a=>`{
    let q=(p-vec2<f32>(${a.x.toFixed(1)},${a.z.toFixed(1)}))/vec2<f32>(${a.rx.toFixed(1)},${a.rz.toFixed(1)});
    let angle=atan2(q.y,q.x);
    let r=length(q)*(1.0+0.075*sin(angle*3.0+${a.seed.toFixed(1)})+0.043*sin(angle*5.0-1.0));
    h=max(h,-28.0+${a.height.toFixed(1)}*exp(-1.12*r*r)+2.7*sin(p.x*0.051)*cos(p.y*0.055)*exp(-5.0*r*r));
  }`).join('\n')}
  let reef=(p+vec2<f32>(66.0,34.0))/vec2<f32>(57.0,23.0);
  return max(h,-28.0+27.1*exp(-1.1*dot(reef,reef)));
}`;
export function random(seed=1) { return () => { seed|=0; seed=seed+0x6D2B79F5|0; let t=Math.imul(seed^seed>>>15,1|seed); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
