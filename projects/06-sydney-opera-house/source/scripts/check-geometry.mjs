import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BRIDGE, bridgeArchPoint, buildBridge } from '../src/bridge.js';
import { SHELL_LAYOUT, PODIUM_TOP, createRoofPatch, transitionPoint, transitionOpening, transitionGlassPoint, transitionCutPlane, transitionClosurePoint, entranceGlazingPoint } from '../src/architecture.js';
import { V, sphericalPatch, patchGeometry, sphereJunction, clipGeometry, loftGeometry } from '../src/geometry.js';

let vertices=0,triangles=0;
for(const data of SHELL_LAYOUT) for(const hand of [-1,1]) {
  const base=data.base??PODIUM_TOP;
  const a=V(data.x,data.h+base,data.peak),b=V(data.x+hand*data.w,base,data.foot),c=V(data.x,base+.15,data.back);
  const patch=sphericalPatch(a,b,c,75,V(hand,.6,0));
  for(const corner of [a,b,c])assert.ok(Math.abs(corner.distanceTo(patch.centre)-75)<1e-8,'Boundary must lie on the 75m sphere');
  const g=patchGeometry(patch,68),p=g.attributes.position;
  for(const value of p.array)assert.ok(Number.isFinite(value),'Non-finite roof coordinate');
  for(let i=0;i<p.count;i++) {
    const point=V(p.getX(i),p.getY(i),p.getZ(i));
    assert.ok(Math.abs(point.distanceTo(patch.centre)-75)<.00002,'Curved roof must remain spherical');
    assert.ok(point.y>9.5 && point.y<75,'Roof must remain above podium and within model envelope');
  }
  for(let i=0;i<=20;i++) {
    const t=i/20,outer=patch.edge(a,b,t),inner=patch.edge(a,b,t,.42);
    assert.ok(Math.abs(outer.distanceTo(inner)-.42)<1e-8,'Shell thickness must remain constant');
    assert.ok(Math.abs(patch.point(0,t).x-data.x)<1e-8,'Mirrored roof halves must meet at their shared centre-plane ridge');
  }
  vertices+=p.count;triangles+=g.index.count/3;g.dispose();
}
assert.equal(SHELL_LAYOUT.length,10);
assert.ok(new Set(SHELL_LAYOUT.map(s=>s.h)).size>7,'The roof groups must vary in height');
for(const data of SHELL_LAYOUT){
  const left=createRoofPatch(data,-1),right=createRoofPatch(data,1);
  for(let i=0;i<=100;i++)assert.ok(left.ridge(i/100).distanceTo(right.ridge(i/100))<1e-8,'Left and right ridges must be watertight');
}
for(const [a,b] of [[2,3],[6,7],[8,9]])for(const hand of [-1,1]){
  const first=createRoofPatch(SHELL_LAYOUT[a],hand),second=createRoofPatch(SHELL_LAYOUT[b],hand),joint=sphereJunction(first,second);
  assert.ok(first.b.distanceTo(second.b)<1e-8,'Opposed shells must share a springing point');
  for(const point of joint.points){assert.ok(Math.abs(point.distanceTo(first.centre)-75)<1e-7);assert.ok(Math.abs(point.distanceTo(second.centre)-75)<1e-7);}
  const g=clipGeometry(patchGeometry(first,20),joint.plane),p=g.attributes.position;
  for(let i=0;i<p.count;i++)assert.ok(joint.plane.distanceToPoint(V(p.getX(i),p.getY(i),p.getZ(i)))>-.00001,'Clipped roof cannot penetrate its neighbour');
  g.dispose();
}
for(const [current,previous] of [[1,0],[2,1],[5,4],[6,5]])for(const hand of [-1,1]){
  const upper=createRoofPatch(SHELL_LAYOUT[current],hand),lower=createRoofPatch(SHELL_LAYOUT[previous],hand);
  for(let i=0;i<=20;i++){
    const t=i/20;
    assert.ok(transitionPoint(upper,lower,hand,t,0).distanceTo(upper.edge(upper.a,upper.b,t))<1e-8,'Transition upper edge must remain attached');
    assert.ok(transitionPoint(upper,lower,hand,t,1).distanceTo(lower.point(t,.34))<1e-8,'Transition lower edge must remain attached');
  }
  const t=.58,v=.68,chord=upper.edge(upper.a,upper.b,t).lerp(lower.point(t,.34),v);
  const recessed=transitionPoint(upper,lower,hand,t,v);
  assert.ok((recessed.x-chord.x)*hand < -3,'Lower transition must curve inward laterally, not bulge outward');
  assert.ok(recessed.z-chord.z>4,'Lower transition must recess toward the hall');
  const ridgeChord=upper.a.clone().lerp(lower.ridge(.34),v),ridge=transitionPoint(upper,lower,hand,0,v);
  assert.ok(ridge.z-ridgeChord.z>4,'The transition arris must curve inward instead of remaining a projecting straight fin');
  assert.ok(Math.abs(ridge.x-upper.a.x)<1e-8,'The inward-curved arris must remain in the shared centre plane');
  const trimmed=patchGeometry(lower,20,0,false,.34),positions=trimmed.attributes.position;
  for(let i=0;i<=20;i++){
    const vertex=i*21+20,p=V(positions.getX(vertex),positions.getY(vertex),positions.getZ(vertex));
    assert.ok(p.distanceTo(lower.point(i/20,.34))<.00001,'Previous roof must terminate exactly at the transition boundary');
  }
  trimmed.dispose();
  assert.equal(transitionOpening(0),1,'The upper tip must have recessed glass behind it, not a white vertical fin');
  const cut=transitionCutPlane(upper,lower,hand);
  assert.ok(cut.distanceToPoint(transitionGlassPoint(upper,lower,hand,0,1))<-5,'The old flared glass heel must lie outside the retained half-space');
  const source=loftGeometry((t,v)=>transitionGlassPoint(upper,lower,hand,t*.82,v),40,24);
  const clipped=clipGeometry(source,cut),cp=clipped.attributes.position;
  for(let i=0;i<cp.count;i++)assert.ok(cut.distanceToPoint(V(cp.getX(i),cp.getY(i),cp.getZ(i)))>=-.00001,'No glass panel may protrude beyond the diagonal cut plane');
  source.dispose();clipped.dispose();
  for(let i=0;i<=20;i++){
    const t=i/20,roofEdge=transitionPoint(upper,lower,hand,t*.52,transitionOpening(t*.52));
    assert.ok(transitionClosurePoint(upper,lower,hand,t,0).distanceTo(roofEdge)<1e-8,'Every cut-out return must meet the lower shell edge without a gap');
    assert.ok(Math.abs(cut.distanceToPoint(transitionClosurePoint(upper,lower,hand,t,1)))<1e-7,'Every cut-out return must meet the planar glass closure');
    for(const v of [0,.25,.5,.75,1])for(const value of transitionClosurePoint(upper,lower,hand,t,v).toArray())assert.ok(Number.isFinite(value),'The closure face must have finite coordinates');
  }
  const oppositeUpper=createRoofPatch(SHELL_LAYOUT[current],-hand),oppositeLower=createRoofPatch(SHELL_LAYOUT[previous],-hand);
  for(let i=0;i<=20;i++)assert.ok(transitionClosurePoint(upper,lower,hand,0,i/20).distanceTo(transitionClosurePoint(oppositeUpper,oppositeLower,-hand,0,i/20))<1e-7,'Left and right closure faces must share the same centre seam');
}
for(const index of [3,7])for(const hand of [-1,1]){
  const patch=createRoofPatch(SHELL_LAYOUT[index],hand);
  for(let i=0;i<20;i++){
    const t=i/20,base=entranceGlazingPoint(patch,PODIUM_TOP,t,0),top=entranceGlazingPoint(patch,PODIUM_TOP,t,1),knee=entranceGlazingPoint(patch,PODIUM_TOP,t,.28);
    const chord=base.clone().lerp(top,.28);
    assert.ok(knee.z<chord.z-.5,'Both entrance gables must fold inward above the doors');
    assert.ok(Math.abs(knee.y-chord.y)<1e-8,'The facade fold must preserve its height');
    for(const v of [0,.14,.28,.64,1])for(const value of entranceGlazingPoint(patch,PODIUM_TOP,t,v).toArray())assert.ok(Number.isFinite(value));
  }
}
console.log('Facade checks passed: recessed glass between independent shell rims, all 8 flared heels removed by a plane, both entrance gables folded inward.');
console.log('Transition checks passed: 8 concave lower faces; all 4 paired cut-outs sealed to the lower roof and flat glass return; shared centre seams closed.');
console.log('Junctions verified: all 10 shared ridges close; all 6 opposing intersections lie on both spheres; hidden crossing faces trimmed.');
console.log('Geometry verified: 10 paired shells; '+vertices.toLocaleString()+' outer vertices; '+triangles.toLocaleString()+' outer triangles; finite positions, spherical boundaries, constant thickness, scale envelope.');

const bridgeMaterial=new THREE.MeshStandardMaterial({side:THREE.DoubleSide});
const bridgeMaterials=Object.fromEntries(['bridge','dark','bridgeStone','lightStone','seam','grass','treeLight','darkStone'].map(key=>[key,bridgeMaterial]));
const bridge=buildBridge(bridgeMaterials);bridge.updateMatrixWorld(true);
for(const t of [0,1])for(const hand of [-1,1]){
  const foot=bridgeArchPoint(t,hand),top=bridgeArchPoint(t,hand,true);
  assert.ok(foot.distanceTo(top)<1e-8,'Both steel chords must converge at the same bearing');
  assert.ok(foot.y<BRIDGE.deck-20,'Arch bearings must be below the road, not suspended above it');
  const ray=new THREE.Raycaster(foot.clone().add(V(0,-1.4,0)),V(0,-1,0),0,16);
  assert.ok(ray.intersectObject(bridge,true).length>0,'Every arch foot must have masonry or shore geometry beneath it');
}
assert.equal(bridgeArchPoint(.5,1,true).y,BRIDGE.crown,'The steel crown must have the intended bridge height');
for(const end of [-1,1]){
  const z=BRIDGE.z+end*BRIDGE.span/2;
  for(const dz of [-.1,.1]){
    const ray=new THREE.Raycaster(V(BRIDGE.x,BRIDGE.deck+1,z+dz),V(0,-1,0),0,6);
    assert.ok(ray.intersectObject(bridge,true).length>0,'Road deck must continue without a gap through both arch / approach joints');
  }
}
bridge.traverse(mesh=>{if(mesh.isMesh){for(const value of mesh.geometry.attributes.position.array)assert.ok(Number.isFinite(value),'Bridge coordinate must be finite');mesh.geometry.dispose();}});bridgeMaterial.dispose();
console.log('Bridge verified: four supported arch bearings below the deck, convergent steel chords, continuous deck / approach joints, finite geometry.');
