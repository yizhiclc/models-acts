import { Vec3 } from 'cannon-es';

// Closest point on a triangle (Voronoi-region test). Unlike cannon-es' corner-first
// sphereConvex path, a nearby vertex never takes precedence over a nearer flat face.
function closestPoint(p,a,b,c) {
  const ab=b.vsub(a),ac=c.vsub(a),ap=p.vsub(a),d1=ab.dot(ap),d2=ac.dot(ap);
  if(d1<=0&&d2<=0)return a;
  const bp=p.vsub(b),d3=ab.dot(bp),d4=ac.dot(bp);
  if(d3>=0&&d4<=d3)return b;
  const vc=d1*d4-d3*d2;
  if(vc<=0&&d1>=0&&d3<=0)return a.vadd(ab.scale(d1/(d1-d3)));
  const cp=p.vsub(c),d5=ab.dot(cp),d6=ac.dot(cp);
  if(d6>=0&&d5<=d6)return c;
  const vb=d5*d2-d1*d6;
  if(vb<=0&&d2>=0&&d6<=0)return a.vadd(ac.scale(d2/(d2-d6)));
  const va=d3*d6-d5*d4;
  if(va<=0&&d4-d3>=0&&d5-d6>=0)return b.vadd(c.vsub(b).scale((d4-d3)/((d4-d3)+(d5-d6))));
  const denominator=1/(va+vb+vc);
  return a.vadd(ab.scale(vb*denominator)).vadd(ac.scale(vc*denominator));
}

export function installSphereContact(world) {
  world.narrowphase.sphereConvex=function(si,sj,xi,xj,qi,qj,bi,bj,rsi,rsj,justTest) {
    const local=qj.conjugate().vmult(xi.vsub(xj));
    let maxPlane=-Infinity,nearestFace=0,inside=true;
    for(let i=0;i<sj.faces.length;i++) {
      const d=sj.faceNormals[i].dot(local.vsub(sj.vertices[sj.faces[i][0]]));
      if(d>maxPlane){maxPlane=d;nearestFace=i;}
      if(d>0)inside=false;
      if(d>si.radius)return;
    }
    let closest,normalLocal,distance2=Infinity;
    if(inside) {
      normalLocal=sj.faceNormals[nearestFace].negate();
      closest=local.vadd(normalLocal.scale(maxPlane));
    } else {
      for(const face of sj.faces)for(let k=1;k<face.length-1;k++) {
        const point=closestPoint(local,sj.vertices[face[0]],sj.vertices[face[k]],sj.vertices[face[k+1]]);
        const d=point.distanceSquared(local);if(d<distance2){distance2=d;closest=point;}
      }
      if(distance2>si.radius**2||!closest)return;
      normalLocal=closest.vsub(local);normalLocal.normalize();
    }
    const data=sj.wallData;
    if(data) {
      let bonded=0,exposedInternal=0,external=0;
      for(let i=0;i<sj.faces.length;i++) {
        if(Math.abs(sj.faceNormals[i].dot(closest.vsub(sj.vertices[sj.faces[i][0]])))>2e-5)continue;
        const neighbor=data.piece.faceNeighbors[i];
        if(neighbor<0)external++;
        else {
          const id=data.piece.neighborBonds.get(neighbor);
          if(id!==undefined&&!data.simulation.bonds[id].broken)bonded++;
          else exposedInternal++;
        }
      }
      // Weld internal features until the adjoining material actually separates.
      // The exposed exterior perimeter remains a real colliding edge.
      if(bonded>0&&external<2&&exposedInternal===0)return;
    }
    if(justTest)return true;
    const contact=this.createContactEquation(bi,bj,si,sj,rsi,rsj);
    qj.vmult(normalLocal,contact.ni);
    contact.ni.scale(si.radius,contact.ri);contact.ri.vadd(xi,contact.ri);contact.ri.vsub(bi.position,contact.ri);
    qj.vmult(closest,contact.rj);contact.rj.vadd(xj,contact.rj);contact.rj.vsub(bj.position,contact.rj);
    this.result.push(contact);this.createFrictionEquationsFromContact(contact,this.frictionResult);
  };
}
