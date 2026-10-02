// Exact separating-axis test with cached world vertices/edges. Same candidate axes
// as cannon-es, with antiparallel duplicates removed. No convexity or collision approximation.
function uniqueDirections(vectors) {
  const out=[];
  for(const v of vectors)if(!out.some(u=>Math.abs(u.dot(v))>1-1e-9))out.push(v);
  return out;
}
function transformedVectors(vectors,q,pos) {
  const out=new Float64Array(vectors.length*3);
  for(let i=0;i<vectors.length;i++) {
    const v=q.vmult(vectors[i]);out.set([v.x+(pos?.x||0),v.y+(pos?.y||0),v.z+(pos?.z||0)],i*3);
  }
  return out;
}
function cache(shape,pos,q) {
  let c=shape.satCache;
  if(c&&c.px===pos.x&&c.py===pos.y&&c.pz===pos.z&&c.qx===q.x&&c.qy===q.y&&c.qz===q.z&&c.qw===q.w)return c;
  if(!c)c=shape.satCache={localEdges:uniqueDirections(shape.uniqueEdges),localNormals:uniqueDirections(shape.faceNormals)};
  Object.assign(c,{px:pos.x,py:pos.y,pz:pos.z,qx:q.x,qy:q.y,qz:q.z,qw:q.w});
  c.vertices=transformedVectors(shape.vertices,q,pos);c.edges=transformedVectors(c.localEdges,q);
  c.normals=transformedVectors(c.localNormals,q);c.faceNormals=transformedVectors(shape.faceNormals,q);
  return c;
}
function cachedSAT(other,pa,qa,pb,qb,target,facesA,facesB) {
  const a=cache(this,pa,qa),b=cache(other,pb,qb),av=a.vertices,bv=b.vertices;
  let best=Infinity,bx=0,by=0,bz=0;
  function test(x,y,z) {
    let minA=Infinity,maxA=-Infinity,minB=Infinity,maxB=-Infinity;
    for(let i=0;i<av.length;i+=3){const d=x*av[i]+y*av[i+1]+z*av[i+2];if(d<minA)minA=d;if(d>maxA)maxA=d;}
    for(let i=0;i<bv.length;i+=3){const d=x*bv[i]+y*bv[i+1]+z*bv[i+2];if(d<minB)minB=d;if(d>maxB)maxB=d;}
    if(maxA<minB||maxB<minA)return false;
    const depth=Math.min(maxA-minB,maxB-minA);
    if(depth<best){best=depth;bx=x;by=y;bz=z;}
    return true;
  }
  for(const [c,list]of [[a,facesA],[b,facesB]]) {
    if(list){for(const face of list)if(!test(c.faceNormals[face*3],c.faceNormals[face*3+1],c.faceNormals[face*3+2]))return false;}
    else for(let i=0;i<c.normals.length;i+=3)if(!test(c.normals[i],c.normals[i+1],c.normals[i+2]))return false;
  }
  for(let i=0;i<a.edges.length;i+=3)for(let j=0;j<b.edges.length;j+=3) {
    const x=a.edges[i+1]*b.edges[j+2]-a.edges[i+2]*b.edges[j+1];
    const y=a.edges[i+2]*b.edges[j]-a.edges[i]*b.edges[j+2];
    const z=a.edges[i]*b.edges[j+1]-a.edges[i+1]*b.edges[j];
    const norm=Math.hypot(x,y,z);if(norm<1e-7)continue;
    if(!test(x/norm,y/norm,z/norm))return false;
  }
  if((pb.x-pa.x)*bx+(pb.y-pa.y)*by+(pb.z-pa.z)*bz>0){bx=-bx;by=-by;bz=-bz;}
  target.set(bx,by,bz);return true;
}
export function cacheConvexCollision(shape) { shape.findSeparatingAxis=cachedSAT; }
