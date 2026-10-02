import * as THREE from 'three/webgpu';
import { uniform, positionWorld, vec3, dot, mix, smoothstep } from 'three/tsl';

export const THERMAL_RANGE = 40000; // W/m²; fixed between runs, never auto-scaled.

// Diagnostic overlay, separate from the persistent reentry compute field.
// The solver supplies a reference heat flux; the surface distribution is schematic.
export class ThermalView {
  constructor(w) {
    this.enabled = false;
    this.u = { gain: uniform(0), attached: uniform(1), flux: uniform(0),
      center: uniform(new THREE.Vector3()), axis: uniform(new THREE.Vector3(0,1,0)),
      flow: uniform(new THREE.Vector3()) };
    const u=this.u, offset=positionWorld.sub(u.center), axial=dot(offset,u.axis);
    const normalized=u.axis.mul(axial.div(35.5)).add(offset.sub(u.axis.mul(axial)).div(4.5));
    const windward=smoothstep(-.55,.90,dot(normalized,u.flow));
    const localFlux=u.flux.mul(windward.mul(.88).add(.12));
    const level=localFlux.div(THERMAL_RANGE).clamp(0,1);
    const cool=mix(vec3(.025,.09,.62),vec3(.015,.80,.95),smoothstep(0,.25,level));
    const warm=mix(cool,vec3(1,.84,.045),smoothstep(.25,.55,level));
    const hot=mix(warm,vec3(.95,.06,.018),smoothstep(.55,1,level));
    const makeMaterial=payload=>{
      const m=new THREE.MeshBasicNodeMaterial({transparent:true,depthWrite:false,alphaTest:.001,
        polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,toneMapped:false,fog:false});
      m.colorNode=hot;
      m.opacityNode=u.gain.mul(payload?u.attached:1);
      return m;
    };
    const bodyMaterial=makeMaterial(false),payloadMaterial=makeMaterial(true);
    const payloadSurfaces=[];
    w.payloadGroup.traverse(mesh=>{if(mesh.isMesh&&(mesh===w.payloadShell||mesh.geometry.type==='LatheGeometry'))payloadSurfaces.push(mesh);});
    this.overlays=[];
    for(const source of [w.bodyMesh,w.interstageShell,...payloadSurfaces]){
      const overlay=new THREE.Mesh(source.geometry,payloadSurfaces.includes(source)?payloadMaterial:bodyMaterial);
      overlay.name='Diagnostic aerodynamic heat-flux overlay';overlay.renderOrder=1;
      source.add(overlay);this.overlays.push(overlay);
    }
  }
  setEnabled(enabled) { this.enabled=!!enabled;this.u.gain.value=this.enabled?.88:0; }
  update(sim) {
    this.u.flux.value=Math.max(0,sim.heatFlux||0);
    this.u.center.value.set(sim.x,sim.y,sim.z);
    this.u.axis.value.fromArray(sim.axis);
    this.u.flow.value.set(sim.vx,sim.vy,sim.vz).normalize();
    // This diagnostic overlay currently covers the booster after separation.
    this.u.attached.value=sim.separationAt===null?1:0;
  }
  metadata() { return {enabled:this.enabled,rangeWm2:[0,THERMAL_RANGE],referenceHeatFluxWm2:this.u.flux.value,
    flowDirection:this.u.flow.value.toArray(),surfaceDistribution:'reference heatFlux × (0.12 + 0.88 × schematic windward weighting)',
    surfaces:'booster skin and interstage; attached upper-stage shell and fairing'}; }
}
