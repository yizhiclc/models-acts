import assert from 'node:assert/strict';
import {DX,FIXED_DT,WAVE_SPEED,CAPILLARY,diameterToVolume,volumeToRadius,terminalSpeed,shoreDistance,shoreRadius} from '../src/config.js';
import {mergeNearby} from '../src/leaf-water.js';

// A merged bead must conserve volume, centre of mass and tangential momentum.
const beads=[{x:0,z:0,vx:.1,vz:.2,volume:1e-8},{x:.001,z:.002,vx:-.05,vz:.06,volume:2e-8}];
const initial=beads.reduce((s,b)=>({v:s.v+b.volume,px:s.px+b.volume*b.vx,pz:s.pz+b.volume*b.vz,x:s.x+b.volume*b.x,z:s.z+b.volume*b.z}),{v:0,px:0,pz:0,x:0,z:0});
mergeNearby(beads);assert.equal(beads.length,1);
const b=beads[0];for(const [a,e]of[[b.volume,initial.v],[b.vx*b.volume,initial.px],[b.vz*b.volume,initial.pz],[b.x*b.volume,initial.x],[b.z*b.volume,initial.z]])assert.ok(Math.abs(a-e)<1e-20);
for(const d of [.001,.002,.004])assert.ok(Math.abs(volumeToRadius(diameterToVolume(d))*2-d)<1e-12);
assert.ok(terminalSpeed(.004)>terminalSpeed(.001));
// Worst-case Fourier mode of the 5-point spatial operator and symplectic update.
const eigen=8/(DX*DX),omega=Math.sqrt(WAVE_SPEED**2*eigen+CAPILLARY*eigen*eigen);
assert.ok(omega*FIXED_DT<2,`Unstable wave time step: omega*dt=${omega*FIXED_DT}`);
for(let a=0;a<Math.PI*2;a+=.07){const r=shoreRadius(a);assert.ok(Math.abs(shoreDistance(Math.cos(a)*r,Math.sin(a)*r*.93))<1e-10);}
assert.ok(shoreDistance(0,0)<0);assert.ok(shoreDistance(3.8,3.8)>0);
console.log('PASS: bead mass/momentum, physical drop units, capillary-wave stability bound, shared organic shoreline.');
