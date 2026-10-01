import * as THREE from 'three';
import { V, sphericalPatch, patchGeometry, ruledGeometry, clipGeometry, sphereJunction, loftGeometry, offsetGeometry, addMesh, box, beam, tube, slab, consolidate, seededRandom } from './geometry.js';

export const SHELL_LAYOUT = [
  { x: -24, peak: -56, foot: -32, back: -13, h: 25, w: 20, hall: 'concert' },
  { x: -24, peak: -43, foot: -10, back: 15, h: 38, w: 23, hall: 'concert' },
  { x: -24, peak: -21, foot: 18, back: 43, h: 51, w: 25, hall: 'concert' },
  { x: -24, peak: 63, foot: 18, back: -6, h: 34, w: 25, hall: 'concert' },
  { x: 24, peak: -49, foot: -29, back: -10, h: 22, w: 17, hall: 'opera' },
  { x: 24, peak: -35, foot: -7, back: 15, h: 32, w: 20, hall: 'opera' },
  { x: 24, peak: -11, foot: 20, back: 43, h: 41, w: 22, hall: 'opera' },
  { x: 24, peak: 65, foot: 20, back: 2, h: 30, w: 22, hall: 'opera' },
  { x: -54, peak: 54, foot: 74, back: 94, h: 14, w: 13, base: 12, hall: 'restaurant' },
  { x: -54, peak: 94, foot: 74, back: 54, h: 17, w: 13, base: 12, hall: 'restaurant' },
];

export const PODIUM_TOP = 16;

export function createRoofPatch(data,hand) {
  const base=data.base??PODIUM_TOP;
  return sphericalPatch(V(data.x,data.h+base,data.peak),V(data.x+hand*data.w,base,data.foot),V(data.x,base+.15,data.back),75,V(hand,.6,0));
}

export function transitionPoint(upper,lower,hand,t,v) {
  const high=upper.edge(upper.a,upper.b,t),low=lower.point(t,.34);
  const p=high.lerp(low,v),arch=Math.sin(Math.PI*v);
  // The lower face is a re-entrant saddle, not an inflated spherical cheek.
  // Both host edges and bearing points are held fixed while the centre bows
  // back into the hall. The outside lower arch is recessed in plan as well.
  const recess=2.2*arch*Math.pow(v,1.4);
  p.x-=hand*(3.3*Math.sin(Math.PI*t)+4.6*t*t)*recess;
  // The centre-plane arris must bow inward too. Leaving t=0 untouched would
  // retain a straight projecting fin between otherwise recessed shell faces.
  // This displacement is independent of hand, so both halves share one crease.
  p.z+=(6.2*Math.sin(Math.PI*t)+4.8*Math.pow(1-t,4))*recess;
  p.y+=(.65*(1-t)+6.2*t*t)*arch-(1.2*Math.sin(Math.PI*t)+.8*Math.pow(1-t,3))*recess;
  return p;
}

export function transitionOpening(t) {
  // At the centre plane the entire gap is glass: the lower shell ends at its
  // own ridge, well below the projecting upper crown. A pinched opening here
  // would introduce the false white vertical fin visible in the old model.
  return t>=.82?0:Math.pow(1-t/.82,.72);
}

export function transitionGlassPoint(upper,lower,hand,t,v) {
  const opening=transitionOpening(t);
  const p=transitionPoint(upper,lower,hand,t,opening*v);
  // The curtain wall is a curved surface behind both ceramic edges, including
  // its shared centre seam. Mullions use this same surface, not a flat chord.
  const setback=.55*(1-t)+Math.sin(Math.PI*v)*opening;
  p.x-=hand*.45*Math.sin(Math.PI*t)*setback;
  p.z+=setback;
  p.y-=.12*(1-t);
  return p;
}

export function transitionCutPlane(upper,lower,hand) {
  const crown=transitionGlassPoint(upper,lower,hand,0,0);
  const heel=transitionGlassPoint(upper,lower,hand,.52,1);
  const d=heel.clone().sub(crown);
  // A real planar cut, shared by the two halves, removes the rolled-out heel.
  // Its upper end meets the projecting crown; its lower end meets the lower
  // shell rim. The remaining curtain wall cannot protrude beyond this plane.
  return new THREE.Plane().setFromNormalAndCoplanarPoint(V(0,d.z,-d.y).normalize(),crown);
}

function curtainCutPoint(upper,lower,hand,t,plane) {
  if(t===0)return transitionGlassPoint(upper,lower,hand,0,0);
  let lo=0,hi=1;
  for(let i=0;i<36;i++){
    const v=(lo+hi)/2;
    if(plane.distanceToPoint(transitionGlassPoint(upper,lower,hand,t,v))>0)lo=v;else hi=v;
  }
  return plane.projectPoint(transitionGlassPoint(upper,lower,hand,t,(lo+hi)/2),V(0,0,0));
}

export function transitionClosurePoint(upper,lower,hand,t,v) {
  const cut=transitionCutPlane(upper,lower,hand);
  const heel=curtainCutPoint(upper,lower,hand,.52,cut);
  const trim=curtainCutPoint(upper,lower,hand,.52*t,cut);
  const roof=transitionPoint(upper,lower,hand,.52*t,transitionOpening(.52*t));
  const landing=V(trim.x,heel.y,heel.z);
  const p=roof.lerp(landing,v);
  // This lower ceramic return seals the whole cut-out, not merely its vertical
  // glass section. Its two boundaries exactly match the old roof rim and the
  // new flat curtain-wall foot, so the high-angle triangular holes are closed.
  p.y-=.18*Math.sin(Math.PI*v)*Math.sin(Math.PI*t);
  return p;
}

export function entranceGlazingPoint(patch,base,t,v) {
  const inward=Math.sign(patch.c.z-patch.a.z);
  const top=patch.edge(patch.a,patch.b,t).add(V(0,-.2,inward*.65*(1-t)));
  const bottom=V(top.x,base+.22,top.z+inward*4*(1-t));
  const p=bottom.lerp(top,v);
  // Both southern entrance gables have a crisp, recessed knee: the upper
  // glass slopes under the cantilever, then the lower panes return to the
  // entrance line. A vertical facade loses this characteristic folded profile.
  const fold=v<=.28?v/.28:(1-v)/.72;
  p.z+=inward*(patch.a.y-base)*.4*(1-t)*fold;
  return p;
}

function transitionShell(group,upper,lower,hand,m) {
  // Three distinct layers: the upper projecting arch, the recessed curtain
  // wall, and the lower shell's independent curved rear rim. The white cheek
  // stops at that rim instead of continuing vertically to the upper crown.
  const point=(t,v)=>transitionPoint(upper,lower,hand,t,v);
  const tiled=(t,v)=>point(t,transitionOpening(t)+(1-transitionOpening(t))*v);
  const geometry=loftGeometry(tiled,52,26,V(hand*.25,.35,-1));
  addMesh(group,geometry,m.roof);
  addMesh(group,offsetGeometry(geometry,-.38),m.lining);
  // Real edge returns and a narrow tile seam close the transition to its hosts.
  for(const value of [0,1]){
    const edge=t=>tiled(t,value),inside=t=>edge(t).add(V(0,-.22,.22));
    addMesh(group,ruledGeometry(edge,inside,52),m.rim);
    const line=[];for(let i=0;i<=36;i++)line.push(edge(i/36));tube(group,line,.075,m.seam,4);
  }
  for(let i=1;i<16;i++){
    const line=[];
    for(let j=0;j<=18;j++)line.push(tiled(i/16,j/18).add(V(0,.016,-.016)));
    tube(group,line,.025,m.seam,3);
  }
  const glazing=(t,v)=>transitionGlassPoint(upper,lower,hand,t,v);
  const curtain=new THREE.Group(),cut=transitionCutPlane(upper,lower,hand);
  addMesh(curtain,loftGeometry((t,v)=>glazing(t*.82,v),64,32,V(hand*.3,.2,-1)),m.glassWarm);
  for(const v of [0,1]) {
    const shell=t=>point(t*.82,v===0?0:transitionOpening(t*.82));
    addMesh(curtain,ruledGeometry(shell,t=>glazing(t*.82,v),52),m.lining);
  }
  for(let i=0;i<20;i++){
    const t=.82*i/20,line=[];
    for(let j=0;j<=20;j++)line.push(glazing(t,j/20));
    tube(curtain,line,i===0?.07:.048,m.bronze,5);
  }
  for(const v of [.34,.68]){
    const line=[];for(let i=0;i<=42;i++)line.push(glazing(.82*i/42,v));
    tube(curtain,line,.035,m.bronze,4);
  }
  curtain.traverse(mesh=>{if(mesh.isMesh){const old=mesh.geometry;mesh.geometry=clipGeometry(old,cut);old.dispose();}});
  group.add(curtain);
  // Close the cut with one flat glazed return. Each half meets on the centre
  // plane and terminates at the lower roof; no curved tail or open hole remains.
  const heel=curtainCutPoint(upper,lower,hand,.52,cut);
  const capTop=t=>curtainCutPoint(upper,lower,hand,.52*t,cut);
  const capBottom=t=>{const p=capTop(t);return V(p.x,heel.y,heel.z);};
  addMesh(group,ruledGeometry(capTop,capBottom,40),m.glassWarm);
  const cutRim=[];for(let i=0;i<=40;i++)cutRim.push(capTop(i/40));tube(group,cutRim,.055,m.bronze,5);
  for(let i=0;i<10;i++){
    const top=capTop(i/10),bottom=capBottom(i/10);
    if(top.distanceTo(bottom)>.1)beam(group,top,bottom,.045,m.bronze,5);
  }
  const closure=(t,v)=>transitionClosurePoint(upper,lower,hand,t,v);
  const returnFace=loftGeometry(closure,40,14,V(0,1,0));
  addMesh(group,returnFace,m.roof);
  addMesh(group,offsetGeometry(returnFace,-.3),m.lining);
  for(const v of [0,1])addMesh(group,ruledGeometry(t=>closure(t,v),t=>closure(t,v).add(V(0,-.3,0)),40),m.rim);
  for(let i=1;i<9;i++){
    const line=[];for(let j=0;j<=16;j++)line.push(closure(i/9,j/16).add(V(0,.018,0)));
    tube(group,line,.022,m.seam,3);
  }
  // Below the raised white cheek is the continuous recessed foyer glazing.
  const sideTop=v=>point(1,v).add(V(-hand*.12,-.12,0));
  const sideBase=v=>{const p=sideTop(v);p.y=PODIUM_TOP+.16;return p;};
  addMesh(group,ruledGeometry(sideTop,sideBase,40),m.glassWarm);
  for(let i=1;i<15;i++)beam(group,sideTop(i/15),sideBase(i/15),.055,m.bronze,4);
}

function roofHalf(host, data, hand, m, clipPlane, previous, ridgeEnd=1, foldedEntrance=false) {
  const group=new THREE.Group();
  const base = data.base??PODIUM_TOP;
  const a = V(data.x, data.h + base, data.peak);
  const b = V(data.x + hand * data.w, base, data.foot);
  const c = V(data.x, base + .15, data.back);
  const patch = sphericalPatch(a, b, c, 75, V(hand, .6, 0));
  addMesh(group, patchGeometry(patch, 68, 0, false, ridgeEnd), m.roof);
  addMesh(group, patchGeometry(patch, 34, .42, true, ridgeEnd), m.lining);
  // Close all exposed edges, so the shells have a real concrete thickness.
  const boundaries=[
    (t,inset=0)=>patch.edge(a,b,t,inset),
    (t,inset=0)=>patch.point(1-t,ridgeEnd,inset),
    (t,inset=0)=>patch.point(0,ridgeEnd*(1-t),inset),
  ];
  for(const edge of boundaries)addMesh(group,ruledGeometry(t=>edge(t),t=>edge(t,.42),52),m.rim);
  // Fan-shaped tile panel joints and underside concrete ribs radiate from the
  // springing point. The offset follows the sphere normal, not the world Y axis.
  for (let r = 1; r < 17; r++) {
    const end = patch.ridge(r / 17 * ridgeEnd);
    const outer = [], inner = [];
    for (let i = 0; i <= 22; i++) {
      const p = b.clone().lerp(end, .015 + .975 * i / 22);
      outer.push(patch.project(p, -.016));
      inner.push(patch.project(p, .73));
    }
    tube(group, outer, .033, m.seam, 3);
    tube(group, inner, .14, m.rib, 5);
  }
  const trim = [];
  for (let i = 0; i <= 45; i++) trim.push(patch.edge(a, b, i / 45, -.02));
  tube(group, trim, .3, m.rim, 10);
  // Curved, slightly recessed glazing: each mullion reaches the actual
  // spherical edge. This remains a complete facade when viewed from the rear.
  const forward = Math.sign(data.back - data.peak);
  const top = t => patch.edge(a, b, t, .7);
  const bottom = t => {
    const p = top(t);
    return V(p.x, base + .22, p.z + forward * 4 * (1-t));
  };
  if(previous)transitionShell(group,patch,createRoofPatch(previous,hand),hand,m);
  else if(foldedEntrance) {
    const facade=(t,v)=>entranceGlazingPoint(patch,base,t,v);
    addMesh(group,loftGeometry(facade,56,25,V(hand*.1,.1,-forward)),m.glass);
    const count=Math.max(14,Math.round(data.w/1.35));
    for(let i=0;i<=count;i++){
      const t=i/count,p=facade(t,0),k=facade(t,.28),q=facade(t,1);
      if(p.distanceTo(k)>.08)beam(group,p,k,i%4===0?.115:.058,m.bronze,5);
      if(k.distanceTo(q)>.08)beam(group,k,q,i%4===0?.115:.058,m.bronze,5);
    }
    for(const v of [.10,.19,.28,.4,.52,.64,.76,.88]){
      const line=[];for(let i=0;i<=40;i++)line.push(facade(i/40,v));
      tube(group,line,v===.28?.12:.047,m.bronze,5);
    }
    addMesh(group,ruledGeometry(t=>patch.edge(a,b,t,.42),t=>facade(t,1),56),m.lining);
  } else {
    addMesh(group, ruledGeometry(top, bottom, 50), m.glass);
    const n = Math.max(9, Math.round(data.w / 1.5));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = top(t), q = bottom(t);
      if (p.distanceTo(q) > .3) beam(group, q, p, i % 4 === 0 ? .14 : .07, m.bronze, 5);
    }
    for (let k = 1; k < 9; k++) {
      const line = [];
      for (let i = 0; i <= 32; i++) line.push(bottom(i / 32).lerp(top(i / 32), k / 9));
      tube(group, line, k === 3 ? .12 : .055, m.bronze, 4);
    }
  }
  // Deep, structural front arch with visible bearing shoes at the springing.
  const rib = [];
  for (let i = 0; i <= 40; i++) rib.push(patch.edge(a, b, i / 40, 1.07));
  tube(group, rib, .29, m.rib, 6);
  box(group, [.95, .8, 1.25], [b.x, base - .2, b.z], m.bronze);
  // The lower curved flank closes the triangular shell against its podium.
  if(ridgeEnd===1){
    const flankTop = t => patch.edge(b, c, t, .44);
    const flankBottom = t => { const p = flankTop(t); return V(p.x, base + .1, p.z); };
    addMesh(group, ruledGeometry(flankTop, flankBottom, 32), m.glassWarm);
    for (let k = 1; k < 12; k++) beam(group, flankTop(k / 12), flankBottom(k / 12), .075, m.bronze, 4);
  }
  if(clipPlane)group.traverse(mesh=>{if(mesh.isMesh){const old=mesh.geometry;mesh.geometry=clipGeometry(old,clipPlane);old.dispose();}});
  host.add(group);
}

function parapet(group, points, y, m, posts = 3.6) {
  for (let k = 0; k < points.length - 1; k++) {
    const a = V(points[k][0], y, points[k][1]), b = V(points[k + 1][0], y, points[k + 1][1]);
    beam(group, a.clone().add(V(0, 1.1, 0)), b.clone().add(V(0, 1.1, 0)), .055, m.bronze, 4);
    beam(group, a.clone().add(V(0, .49, 0)), b.clone().add(V(0, .49, 0)), .027, m.bronze, 4);
    const count = Math.ceil(a.distanceTo(b) / posts);
    for (let i = 0; i <= count; i++) { const p = a.clone().lerp(b, i / count); beam(group, p, p.clone().add(V(0, 1.12, 0)), .044, m.bronze, 4); }
  }
}

export function buildArchitecture(m) {
  const group = new THREE.Group(); group.name = 'Sydney Opera House — procedural architecture';
  // Bennelong Point's irregular north apron and continuous quay wall.
  const quay = [[-66,40],[-66,-46],[-61,-63],[-44,-74],[-26,-78],[35,-75],[55,-66],[65,-47],[67,96],[83,135],[-72,135],[-75,109],[-80,88],[-78,64],[-69,44]];
  slab(group, quay, -.4, 3.45, m.darkStone);
  slab(group, quay, 2.7, .52, m.lightStone);
  // Paving uses world-space UVs instead of one stretched tile per polygon.
  const paved = slab(group, quay, 3.12, .17, m.pavement);
  const attr = paved.geometry.attributes.position;
  const uv = paved.geometry.attributes.uv;
  for (let i = 0; i < attr.count; i++) uv.setXY(i, attr.getX(i) / 13, attr.getZ(i) / 13);

  const podium = [[-55,44],[-55,-42],[-51,-54],[-43,-61],[-25,-65],[30,-63],[46,-54],[53,-40],[53,75.5],[-38,75.5],[-38,59],[-45,48]];
  slab(group, podium, 3.3, 12.0, m.stone);
  slab(group, podium, 15.22, .7, m.lightStone);
  const roofDeck = slab(group, podium, 15.9, .12, m.pavement);
  const p = roofDeck.geometry.attributes.position, uv2 = roofDeck.geometry.attributes.uv;
  for (let i = 0; i < p.count; i++) uv2.setXY(i, p.getX(i) / 12, p.getZ(i) / 12);

  // Bennelong's compact, lower southwest pavilion is offset from the Concert
  // Hall, beside the monumental steps. Its footprint was checked against
  // harbour photographs and OpenStreetMap restaurant outline 48629177.
  const restaurantBase=[[-51,49],[-45,53],[-38,65],[-39,80],[-49,93],[-58,99],[-66,94],[-71,81],[-70,66],[-62,53]];
  slab(group,restaurantBase,3.3,8.35,m.stone);
  slab(group,restaurantBase,11.65,.37,m.lightStone);
  box(group,[2.8,.22,8],[-38.6,12.01,84],m.lightStone);
  // Folded lower glazing, bronze fins, interior tables, and a human-scale entry.
  for(const z of [56,91]) {
    box(group,[13,2.8,.16],[-54,13.42,z],m.glassWarm);
    box(group,[14,.2,2],[-54,14.93,z+.7],m.bronze);
    for(let dx=-6;dx<=6;dx+=1.5)box(group,[.075,2.8,.24],[-54+dx,13.42,z],m.bronze);
  }
  for(const [from,to] of [[[-62,53],[-70,66]],[[-70,66],[-71,81]],[[-71,81],[-66,94]]]){
    const start=V(from[0]-.09,6.3,from[1]),end=V(to[0]-.09,6.3,to[1]);
    const low=t=>start.clone().lerp(end,t),high=t=>low(t).add(V(0,3.2,0));
    addMesh(group,ruledGeometry(high,low,12),m.glassWarm);
    const count=Math.ceil(start.distanceTo(end)/1.6);
    for(let i=0;i<=count;i++)beam(group,low(i/count),high(i/count),.07,m.bronze,4);
  }

  // The podium is a building in its own right: window bands, recessed doors,
  // pilasters, board joints, terrace overhangs, and northern foyer glazing.
  for (const hand of [-1, 1]) {
    const x = hand < 0 ? -55.15 : 53.15;
    box(group, [.16, 3.4, 88], [x, 6, 2], m.glassWarm);
    for (let z = -41; z <= 44; z += 3) box(group, [.28, 3.65, .16], [x + hand * .12, 6.02, z], m.bronze);
    for (let z = -40; z < 47; z += .65) box(group, [.055, 6.5, .023], [x + hand * .14, 12.3, z], m.seam);
    box(group, [.3,.25,89], [x+hand*.1,14.7,3],m.lightStone);
    box(group, [3.3, .42, 96], [x+hand*1.5, 8.13, 6], m.lightStone);
    box(group, [3.1, .28, 96], [x+hand*2.8, 3.67, 6], m.lightStone);
    for (let z = -39; z < 47; z += 12) box(group, [.7, 5.8, .55], [x+hand*.85, 6.2, z], m.stone);
    parapet(group, [[x+hand*3,-40],[x+hand*3,49]], 8.3, m);
  }
  box(group, [56, 3.8, .14], [-1, 6.2, -63.4], m.glassWarm);
  for (let x = -28; x <= 25; x += 2.2) box(group, [.11, 3.9, .28], [x, 6.2, -63.5], m.bronze);

  // Monumental south stair: 68 individual treads, continuous risers, landings.
  const stepCount = 68, stepDepth = 30/stepCount, stepRise = (PODIUM_TOP - 3.3) / stepCount;
  for (let i = 0; i < stepCount; i++) {
    const y = 3.3 + (i + 1) * stepRise;
    const z = 105 - i * stepDepth;
    box(group, [89, stepRise + .025, stepDepth+.05], [7, y - stepRise / 2, z], m.lightStone);
    box(group, [89, .025, .045], [7, y + .009, z + stepDepth*.49], m.seam);
  }
  // Side cheek walls follow the rake, and discreet bronze handrails are scaled.
  for (const x of [-38.3, 52.3]) {
    const stairWall = new THREE.Shape();
    stairWall.moveTo(75, 3.3); stairWall.lineTo(75, 16.7); stairWall.lineTo(106, 4); stairWall.lineTo(106, 3.3); stairWall.closePath();
    const g = new THREE.ExtrudeGeometry(stairWall, { depth: 1.25, bevelEnabled: false });
    g.rotateY(-Math.PI / 2); g.translate(x, 0, 0); addMesh(group, g, m.stone);
  }
  for (const x of [-16, 29]) {
    beam(group, V(x,4.77,104), V(x,16.62,76), .05, m.bronze, 5);
    for (let i = 0; i <= 10; i++) { const z = 104 - i * 2.8, y = 3.3 + (105 - z) / 30 * 12.7; beam(group,V(x,y,z),V(x,y+1.05,z),.041,m.bronze,4); }
  }
  // Dark low hall volumes recede below the shells; no roof floats in space.
  for (const x of [-24,24]) {
    box(group, [21, 3.1, 44], [x, 17.5, 2], m.glassWarm);
    box(group, [21.2, .2, 44.2], [x, 19.15, 2], m.dark);
  }
  const junctions=new Map();
  for(const [north,south] of [[2,3],[6,7],[8,9]])for(const hand of [-1,1]){
    const first=createRoofPatch(SHELL_LAYOUT[north],hand),second=createRoofPatch(SHELL_LAYOUT[south],hand);
    const joint=sphereJunction(first,second);
    junctions.set(north+':'+hand,joint.plane);
    junctions.set(south+':'+hand,joint.plane.clone().negate());
    tube(group,joint.points,.11,m.seam,6);
  }
  const previousShell=new Map([[1,0],[2,1],[5,4],[6,5]]);
  const hasFollowingShell=new Set(previousShell.values());
  SHELL_LAYOUT.forEach((data,index)=>{for(const hand of [-1,1])roofHalf(group,data,hand,m,junctions.get(index+':'+hand),SHELL_LAYOUT[previousShell.get(index)],hasFollowingShell.has(index)?.34:1,index===3||index===7);});
  // The two main entrance fronts remain part of the continuous folded glazing;
  // no separate rectangular porch or canopy interrupts the shell profile.
  parapet(group, [[-72,109],[-77,87],[-75,66],[-64,40],[-63,-45],[-58,-61],[-42,-71],[-25,-75],[34,-72],[52,-63],[62,-45],[64,88]], 3.3, m, 4.2);

  // Waterfront lamp globes and operable-scale urban furniture.
  const lampPositions = [];
  for (let z = -48; z < 108; z += 19) {lampPositions.push([61,z]);if(z<44)lampPositions.push([-61,z]);}
  lampPositions.push([-67,48],[-74,68],[-75,87],[-70,109]);
  for (let x = -42; x <= 42; x += 21) lampPositions.push([x,-70]);
  for (const [x,z] of lampPositions) {
    beam(group, V(x,3.3,z),V(x,6.05,z),.07,m.bronze,6);
    const globe = new THREE.SphereGeometry(.36,10,7); globe.translate(x,6.3,z); addMesh(group,globe,m.lamp,false);
    box(group,[.7,.16,.7],[x,3.37,z],m.bronze);
  }
  for (let z = -28; z < 96; z += 24) for (const hand of [-1,1]) {
    const x=hand<0?(z>45?-74:-60):60;
    box(group,[1.1,.16,3.8],[x,3.85,z],m.interior);
    for (const dz of [-1.3,1.3]) box(group,[.65,.5,.13],[x,3.56,z+dz],m.bronze);
  }
  // Outdoor cafe tables and parasols belong to the low western terrace.
  for (let i = 0; i < 8; i++) {
    const x = i<5?-59.3:-74, z = i<5?14+i*6.4:66+(i-5)*7;
    beam(group,V(x,3.3,z),V(x,6.2,z),.04,m.bronze,4);
    const g = new THREE.ConeGeometry(1.9,.65,8,1,true); g.translate(x,6.2,z); addMesh(group,g,m.white);
    const tabletop = new THREE.CylinderGeometry(.6,.6,.09,10); tabletop.translate(x,4.07,z); addMesh(group,tabletop,m.lightStone);
  }

  // A sparse set of 1.7m figures provides a readable, understated scale cue.
  const random = seededRandom(34);
  const clothes = [0x384e55,0xc0b5a0,0x806a52,0xd4d2c3,0x698082].map(color => new THREE.MeshStandardMaterial({color,roughness:.9}));
  const skin = new THREE.MeshStandardMaterial({color:0xbc9a79,roughness:.9});
  for (let i = 0; i < 90; i++) {
    let x,z,y;
    if (i < 40) { x=-46+random()*88;z=109+random()*23;y=3.3; }
    else if (i < 62) {x=-34+random()*83;z=77+random()*26;y=3.3+(105-z)/stepDepth*stepRise;}
    else {x=(random()>.5 ? -1:1)*(59+random()*2);z=-41+random()*143;y=3.3;if(x<0&&z>43)x=z<63?-66-(z-43)*.35:-73;}
    const material=clothes[i%clothes.length];
    const h=1.53+random()*.3;
    const body=new THREE.CylinderGeometry(.17,.13,h*.43,5);body.translate(x,y+h*.6,z);addMesh(group,body,material);
    const head=new THREE.SphereGeometry(.12,6,4);head.translate(x,y+h*.9,z);addMesh(group,head,skin);
    for(const dx of [-.08,.08]) beam(group,V(x+dx,y,z),V(x+dx,y+h*.4,z),.055,material,4);
  }

  const architecture = consolidate(group);
  architecture.userData.shellCount = SHELL_LAYOUT.length;
  return architecture;
}
