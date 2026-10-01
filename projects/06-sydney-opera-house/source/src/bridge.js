import * as THREE from 'three';
import { V, addMesh, box, beam, slab } from './geometry.js';

// The background remains geographically simplified, but the structural
// proportions and load-path geometry follow the Harbour Bridge photographs.
export const BRIDGE = Object.freeze({x:-592,z:-387,span:503,width:49,deck:49,bearing:15,crown:134,panels:28});

export function bridgeArchPoint(t,hand=1,upper=false) {
  const rise=4*t*(1-t);
  const y=BRIDGE.bearing+103*rise+(upper?16*Math.sqrt(Math.max(0,rise)):0);
  return V(BRIDGE.x+hand*20,y,BRIDGE.z+(t-.5)*BRIDGE.span);
}

function road(group,zA,zB,yA,yB,m) {
  const pitch=-Math.atan2(yB-yA,zB-zA),length=Math.hypot(zB-zA,yB-yA);
  const centre=V(BRIDGE.x,(yA+yB)/2,(zA+zB)/2);
  for(const [width,depth,offset,material] of [[49,3.4,-1.7,m.bridge],[45,.23,.06,m.dark]]){
    const geometry=new THREE.BoxGeometry(width,depth,length+.12);
    geometry.rotateX(pitch);geometry.translate(centre.x,centre.y+offset,centre.z);addMesh(group,geometry,material);
  }
  for(const side of [-1,1]){
    const x=BRIDGE.x+side*24;
    beam(group,V(x,yA+.9,zA),V(x,yB+.9,zB),.22,m.bridge,5);
    beam(group,V(x,yA-2.6,zA),V(x,yB-2.6,zB),.58,m.bridge,6);
    const count=Math.ceil(Math.abs(zB-zA)/8);
    for(let i=0;i<=count;i++){
      const p=V(x,THREE.MathUtils.lerp(yA,yB,i/count),THREE.MathUtils.lerp(zA,zB,i/count));
      beam(group,p,p.clone().add(V(0,1.05,0)),.10,m.bridge,4);
    }
  }
}

function tower(group,x,z,m) {
  box(group,[24,9,27],[x,7.5,z],m.bridgeStone);
  const g=new THREE.BoxGeometry(1,1,1),p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    const top=p.getY(i)>0,halfX=(top?14:19)/2,halfZ=(top?17:24)/2;
    p.setXYZ(i,x+Math.sign(p.getX(i))*halfX,top?82:12,z+Math.sign(p.getZ(i))*halfZ);
  }
  g.computeVertexNormals();addMesh(group,g,m.bridgeStone);
  box(group,[16.5,2,19.5],[x,82.6,z],m.lightStone);
  box(group,[13.4,4,16],[x,85.3,z],m.bridgeStone);
  box(group,[15,.8,17.6],[x,87.7,z],m.lightStone);
  box(group,[12.5,.9,14.8],[x,88.5,z],m.bridgeStone);
  // Granite courses and the small dark observation openings under the crown.
  for(let y=20;y<78;y+=7){
    const f=(y-12)/70,w=19-5*f,d=24-7*f;
    for(const side of [-1,1])box(group,[w+.05,.075,.045],[x,y,z+side*d/2],m.seam);
  }
  for(const side of [-1,1])for(const dx of [-3.4,0,3.4])box(group,[1.15,2.35,.12],[x+dx,77,z+side*8.82],m.dark);
}

function embankment(group,zA,zB,yA,yB,m) {
  const profile=new THREE.Shape();profile.moveTo(zA,2.7);profile.lineTo(zA,yA-3.4);profile.lineTo(zB,yB-3.4);profile.lineTo(zB,2.7);profile.closePath();
  const g=new THREE.ExtrudeGeometry(profile,{depth:53,bevelEnabled:false});g.rotateY(-Math.PI/2);g.translate(BRIDGE.x+26.5,0,0);addMesh(group,g,m.bridgeStone);
  road(group,zA,zB,yA,yB,m);
}

export function buildBridge(m) {
  const group=new THREE.Group();group.name='Harbour Bridge — arch bearings, suspended deck and connected approaches';
  const north=BRIDGE.z-BRIDGE.span/2,south=BRIDGE.z+BRIDGE.span/2;
  // Dawes Point and the north abutment are connected to the existing shores.
  // They are built in the same world coordinates as the bridge, eliminating
  // the old scaled-and-translated bridge / untransformed shoreline mismatch.
  const southBank=[[BRIDGE.x-92,330],[BRIDGE.x-98,80],[BRIDGE.x-67,-122],[BRIDGE.x-49,south-23],[BRIDGE.x+47,south-23],[BRIDGE.x+72,-113],[BRIDGE.x+100,70],[BRIDGE.x+145,313]];
  const northBank=[[BRIDGE.x-84,-970],[BRIDGE.x+99,-930],[BRIDGE.x+97,-730],[BRIDGE.x+63,north+10],[BRIDGE.x+40,north+23],[BRIDGE.x-47,north+23],[BRIDGE.x-79,-653]];
  slab(group,southBank,-2,5.6,m.darkStone);slab(group,southBank,3.6,.2,m.grass);
  slab(group,northBank,-2,9,m.darkStone);slab(group,northBank,7,.2,m.treeLight);
  road(group,north,south,BRIDGE.deck,BRIDGE.deck,m);
  // Steel chords converge at the four low bearings; the upper chord is not
  // left floating twelve metres above the road as in the original background.
  for(const hand of [-1,1])for(let i=0;i<BRIDGE.panels;i++){
    const a=bridgeArchPoint(i/BRIDGE.panels,hand),b=bridgeArchPoint((i+1)/BRIDGE.panels,hand);
    const c=bridgeArchPoint(i/BRIDGE.panels,hand,true),d=bridgeArchPoint((i+1)/BRIDGE.panels,hand,true);
    beam(group,a,b,.95,m.bridge,6);beam(group,c,d,.83,m.bridge,6);
    if(a.distanceTo(c)>.1)beam(group,a,c,.47,m.bridge,5);
    beam(group,a,d,.46,m.bridge,5);beam(group,c,b,.46,m.bridge,5);
  }
  for(let i=1;i<BRIDGE.panels;i++){
    const t=i/BRIDGE.panels,left=bridgeArchPoint(t,-1),right=bridgeArchPoint(t,1);
    for(const p of [left,right]){
      const attachment=V(p.x,BRIDGE.deck-2.1,p.z);
      beam(group,p,attachment,p.y>BRIDGE.deck?.30:.72,m.bridge,5);
      box(group,[1.35,.65,1.25],[p.x,attachment.y,p.z],m.bridge);
    }
    // Every hanger ends on a real transverse floor beam under the road deck.
    beam(group,V(BRIDGE.x-24,BRIDGE.deck-2.1,left.z),V(BRIDGE.x+24,BRIDGE.deck-2.1,left.z),.55,m.bridge,6);
    const a=bridgeArchPoint(t,-1,true),b=bridgeArchPoint(t,1,true);
    beam(group,a,b,.47,m.bridge,5);
    if(i<BRIDGE.panels-1){
      beam(group,a,bridgeArchPoint((i+1)/BRIDGE.panels,1,true),.29,m.bridge,4);
      beam(group,b,bridgeArchPoint((i+1)/BRIDGE.panels,-1,true),.29,m.bridge,4);
    }
  }
  for(const end of [-1,1]){
    const footZ=BRIDGE.z+end*BRIDGE.span/2;
    for(const hand of [-1,1]){
      const foot=bridgeArchPoint(end===-1?0:1,hand);
      box(group,[12,10,19],[foot.x,9.5,footZ],m.bridgeStone);
      box(group,[7,1,7],[foot.x,14.75,footZ],m.bridge);
      const pin=new THREE.CylinderGeometry(1.25,1.25,5,12);pin.rotateZ(Math.PI/2);pin.translate(foot.x,15,footZ);addMesh(group,pin,m.bridge);
      tower(group,BRIDGE.x+hand*33,footZ+end*18,m);
    }
    // Continuous deck and trussed approach viaducts pass between the pylons.
    const length=end===1?440:220,finishZ=footZ+end*length,finishY=BRIDGE.deck-length*.04;
    road(group,footZ,finishZ,BRIDGE.deck,finishY,m);
    const count=Math.ceil(length/70);
    for(let i=0;i<=count;i++){
      const t=i/count,z=THREE.MathUtils.lerp(footZ,finishZ,t),y=THREE.MathUtils.lerp(BRIDGE.deck,finishY,t),ground=end===1?3.8:7.2;
      for(const side of [-1,1])box(group,[4.6,y-9-ground,6],[BRIDGE.x+side*17,(y-9+ground)/2,z],m.bridgeStone);
      box(group,[43,2.2,7],[BRIDGE.x,y-8.7,z],m.bridgeStone);
      if(i<count)for(const hand of [-1,1]){
        const nextZ=THREE.MathUtils.lerp(footZ,finishZ,(i+1)/count),nextY=THREE.MathUtils.lerp(BRIDGE.deck,finishY,(i+1)/count),x=BRIDGE.x+hand*22;
        const start=V(x,y-7.5,z),finish=V(x,nextY-7.5,nextZ);beam(group,start,finish,.68,m.bridge,5);
        for(let k=0;k<4;k++){
          const a=start.clone().lerp(finish,k/4),b=start.clone().lerp(finish,(k+1)/4);
          beam(group,a,b.clone().add(V(0,4.7,0)),.27,m.bridge,4);
          beam(group,a.clone().add(V(0,4.7,0)),b,.27,m.bridge,4);
        }
      }
    }
    embankment(group,finishZ,finishZ+end*260,finishY,end===1?7:14,m);
  }
  group.userData.bearings=4;group.userData.pylons=4;
  return group;
}
