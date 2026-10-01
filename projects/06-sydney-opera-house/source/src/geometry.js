import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const V = (x, y, z) => new THREE.Vector3(x, y, z);

// A spherical triangle: the three vertices determine a circle. Its normal
// supplies the remaining degree of freedom for the sphere centre. No asset
// meshes or approximated flat triangles are used for the roof surfaces.
export function sphericalPatch(a, b, c, radius = 75, outward = V(1, 1, 0)) {
  const u = b.clone().sub(a), v = c.clone().sub(a);
  const n = new THREE.Vector3().crossVectors(u, v);
  const cc = new THREE.Vector3().crossVectors(v, n).multiplyScalar(u.lengthSq())
    .add(new THREE.Vector3().crossVectors(n, u).multiplyScalar(v.lengthSq()))
    .divideScalar(2 * n.lengthSq()).add(a);
  const circleRadius = cc.distanceTo(a);
  if (circleRadius >= radius) throw new Error('Shell sphere is too small for its boundary.');
  n.normalize();
  if (n.dot(outward) < 0) n.negate();
  const centre = cc.clone().addScaledVector(n, -Math.sqrt(radius * radius - circleRadius * circleRadius));
  const project = (p, inset = 0) => p.clone().sub(centre).normalize().multiplyScalar(radius - inset).add(centre);
  // The two reflected spheres meet in the vertical centre plane. Their common
  // ridge is a SMALL circle in that plane, not either sphere's great circle.
  // Projecting a straight A-C chord radially would pull the two ridges apart.
  const ridgeCentre = V(a.x, centre.y, centre.z);
  const ridgeRadius = Math.sqrt(radius * radius - (a.x - centre.x) ** 2);
  const ridge = t => a.clone().lerp(c, t).sub(ridgeCentre).normalize().multiplyScalar(ridgeRadius).add(ridgeCentre);
  const point = (s, t, inset = 0) => project(ridge(t).lerp(b, s), inset);
  const edge = (p, q, t, inset = 0) => {
    if (p.distanceToSquared(a) < 1e-12 && q.distanceToSquared(c) < 1e-12) return project(ridge(t), inset);
    if (p.distanceToSquared(c) < 1e-12 && q.distanceToSquared(a) < 1e-12) return project(ridge(1-t), inset);
    return project(p.clone().lerp(q, t), inset);
  };
  const normal = p => p.clone().sub(centre).normalize();
  return { a, b, c, centre, radius, project, point, edge, normal, ridge };
}

export function patchGeometry(patch, segments = 64, inset = 0, flip = false, ridgeEnd = 1) {
  const positions = [], normals = [], uvs = [], colors = [], indices = [];
  const color = new THREE.Color();
  for (let i = 0; i <= segments; i++) {
    for (let j = 0; j <= segments; j++) {
      const p = patch.point(i / segments, j / segments * ridgeEnd, inset);
      const n = patch.normal(p);
      positions.push(p.x, p.y, p.z);
      normals.push(n.x * (flip ? -1 : 1), n.y * (flip ? -1 : 1), n.z * (flip ? -1 : 1));
      // A metric spherical projection keeps the small ceramic tiles consistent
      // across shells of different sizes and at different subdivision levels.
      uvs.push(Math.atan2(n.z, n.x) * patch.radius / 5.6, Math.asin(n.y) * patch.radius / 5.6);
      const shade = .88 + .12 * Math.min(1, Math.max(0, p.y / patch.a.y));
      color.setRGB(shade, shade * .994, shade * .972);
      colors.push(color.r, color.g, color.b);
    }
  }
  const stride = segments + 1;
  for (let i = 0; i < segments; i++) for (let j = 0; j < segments; j++) {
    const a = i * stride + j, b = a + stride, c = a + 1, d = b + 1;
    if (i < segments - 1) indices.push(a, b, d);
    indices.push(a, d, c);
  }
  // Orient every panel outward, regardless of handedness or opening direction.
  const pa = new THREE.Vector3().fromArray(positions, indices[0] * 3);
  const pb = new THREE.Vector3().fromArray(positions, indices[1] * 3);
  const pc = new THREE.Vector3().fromArray(positions, indices[2] * 3);
  const dot = pb.sub(pa).cross(pc.sub(pa)).dot(patch.normal(pa));
  if ((dot < 0) !== flip) for (let k = 0; k < indices.length; k += 3) [indices[k + 1], indices[k + 2]] = [indices[k + 2], indices[k + 1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

export function ruledGeometry(top, bottom, segments = 40) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = top(t), q = bottom(t);
    pos.push(p.x, p.y, p.z, q.x, q.y, q.z);
    uv.push(t, 1, t, 0);
    if (i < segments) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// Clip a mesh against an exact intersection plane. Interpolate all attributes
// on cut edges, preserving smooth roof normals and continuous ceramic UVs.
export function clipGeometry(geometry, plane) {
  const g=geometry.index?geometry.toNonIndexed():geometry;
  const names=Object.keys(g.attributes),out=Object.fromEntries(names.map(name=>[name,[]]));
  const read=i=>Object.fromEntries(names.map(name=>[name,Array.from(g.attributes[name].array.slice(i*g.attributes[name].itemSize,(i+1)*g.attributes[name].itemSize))]));
  const distance=vertex=>plane.distanceToPoint(V(...vertex.position));
  for(let i=0;i<g.attributes.position.count;i+=3){
    const source=[read(i),read(i+1),read(i+2)],polygon=[];
    for(let k=0;k<3;k++){
      const current=source[k],next=source[(k+1)%3],a=distance(current),b=distance(next);
      if(a>=-1e-7)polygon.push(current);
      if((a>=0)!==(b>=0)){
        const t=a/(a-b),vertex={};
        for(const name of names)vertex[name]=current[name].map((v,j)=>v+(next[name][j]-v)*t);
        polygon.push(vertex);
      }
    }
    for(let k=1;k<polygon.length-1;k++)for(const vertex of [polygon[0],polygon[k],polygon[k+1]])for(const name of names)out[name].push(...vertex[name]);
  }
  const result=new THREE.BufferGeometry();
  for(const name of names)result.setAttribute(name,new THREE.Float32BufferAttribute(out[name],g.attributes[name].itemSize));
  result.computeBoundingSphere();if(g!==geometry)g.dispose();return result;
}

export function sphereJunction(first, second) {
  const delta=first.centre.clone().sub(second.centre),length=delta.length();
  const plane=new THREE.Plane(delta.clone().normalize(),(second.centre.lengthSq()-first.centre.lengthSq())/(2*length));
  let low=0,high=1;
  for(let i=0;i<60;i++){const t=(low+high)/2;if(plane.distanceToPoint(first.ridge(t))>0)low=t;else high=t;}
  const ridge=first.ridge((low+high)/2);
  const centre=first.centre.clone().add(second.centre).multiplyScalar(.5);
  const radius=Math.sqrt(first.radius**2-length**2/4);
  const points=[];
  for(let i=0;i<=56;i++)points.push(first.b.clone().lerp(ridge,i/56).sub(centre).normalize().multiplyScalar(radius).add(centre));
  return {plane,points,ridge};
}

export function loftGeometry(point, across=48, along=24, outward=V(0,1,0)) {
  const positions=[],uv=[],colors=[],indices=[];
  for(let j=0;j<=along;j++)for(let i=0;i<=across;i++){
    const p=point(i/across,j/along);positions.push(p.x,p.y,p.z);
    uv.push(p.x/5.6,(p.y+p.z*.7)/5.6);colors.push(.98,.976,.957);
  }
  for(let j=0;j<along;j++)for(let i=0;i<across;i++){
    const a=j*(across+1)+i,b=a+across+1;indices.push(a,b,a+1,a+1,b,b+1);
  }
  // A tapered loft may collapse its first column to one shared crown. Find a
  // non-degenerate panel before choosing winding so both hands face outward.
  let orientation=0;
  for(let k=0;k<indices.length&&Math.abs(orientation)<1e-10;k+=3){
    const a=V(...positions.slice(indices[k]*3,indices[k]*3+3)),b=V(...positions.slice(indices[k+1]*3,indices[k+1]*3+3)),c=V(...positions.slice(indices[k+2]*3,indices[k+2]*3+3));
    orientation=b.sub(a).cross(c.sub(a)).dot(outward);
  }
  if(orientation<0)for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

export function offsetGeometry(geometry, offset) {
  const g=geometry.clone(),p=g.attributes.position,n=g.attributes.normal;
  for(let i=0;i<p.count;i++)p.setXYZ(i,p.getX(i)+n.getX(i)*offset,p.getY(i)+n.getY(i)*offset,p.getZ(i)+n.getZ(i)*offset);
  return g;
}

export function addMesh(group, geometry, material, shadows = true) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = shadows; mesh.receiveShadow = true; group.add(mesh);
  return mesh;
}
export function box(group, size, position, material, rotation = 0) {
  const g = new THREE.BoxGeometry(...size); g.rotateY(rotation); g.translate(...position);
  return addMesh(group, g, material);
}
export function beam(group, a, b, radius, material, sides = 5) {
  const d = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(radius, radius, d.length(), sides, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize());
  g.applyQuaternion(q); g.translate(...a.clone().add(b).multiplyScalar(.5).toArray());
  return addMesh(group, g, material);
}
export function tube(group, points, radius, material, sides = 5) {
  const curve = new THREE.CatmullRomCurve3(points);
  return addMesh(group, new THREE.TubeGeometry(curve, Math.max(points.length * 2, 12), radius, sides, false), material);
}
export function slab(group, outline, bottom, height, material) {
  const shape = new THREE.Shape(); outline.forEach(([x, z], i) => i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)); shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 12 });
  g.rotateX(-Math.PI / 2); g.translate(0, bottom, 0);
  return addMesh(group, g, material);
}
export function consolidate(group) {
  group.updateMatrixWorld(true);
  const buckets = new Map(); const old = [];
  group.traverse(obj => {
    if (!obj.isMesh || Array.isArray(obj.material)) return;
    const material = obj.material;
    const key = material.uuid + ':' + obj.castShadow + ':' + obj.receiveShadow;
    if (!buckets.has(key)) buckets.set(key, { material, cast: obj.castShadow, receive: obj.receiveShadow, geometries: [] });
    let g = obj.geometry.clone().applyMatrix4(obj.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    // Normalize the attributes for compatible, material-batched geometry.
    if (!g.attributes.normal) g.computeVertexNormals();
    const count = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    if (!g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3));
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
    buckets.get(key).geometries.push(g); old.push(obj);
  });
  const result = new THREE.Group(); result.name = group.name;
  for (const bucket of buckets.values()) {
    const g = mergeGeometries(bucket.geometries, false);
    g.computeBoundingSphere();
    const m = addMesh(result, g, bucket.material, bucket.cast); m.receiveShadow = bucket.receive;
    bucket.geometries.forEach(geo => geo.dispose());
  }
  old.forEach(m => m.geometry.dispose());
  return result;
}

export function seededRandom(seed = 71) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
