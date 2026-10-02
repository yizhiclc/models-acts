// Convex 3D Voronoi cells, clipped to a slab. This module contains no impact logic.
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const scale=(a,k)=>a.map(v=>v*k);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const length=a=>Math.hypot(...a);
const unit=a=>scale(a,1/length(a));
const mean=vs=>scale(vs.reduce(add,[0,0,0]),1/vs.length);

function random(seed) { let a=seed>>>0;return ()=>{a+=0x6D2B79F5;let t=Math.imul(a^(a>>>15),1|a);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;}; }

function clipSolid(faces, normal, distance, neighbor) {
  const next=[],cut=[];
  for(const face of faces) {
    const out=[];
    for(let i=0;i<face.points.length;i++) {
      const a=face.points[i],b=face.points[(i+1)%face.points.length];
      const da=dot(normal,a)-distance,db=dot(normal,b)-distance;
      if(da<=1e-9)out.push(a);
      if((da<0&&db>0)||(da>0&&db<0)) {
        const v=add(a,scale(sub(b,a),da/(da-db)));out.push(v);
        if(!cut.some(p=>length(sub(p,v))<1e-7))cut.push(v);
      }
    }
    if(out.length>=3)next.push({...face,points:out});
  }
  if(cut.length>=3) {
    const centre=mean(cut),n=unit(normal);
    const u=unit(cross(Math.abs(n[2])<0.9?[0,0,1]:[0,1,0],n)),v=cross(n,u);
    cut.sort((a,b)=>Math.atan2(dot(sub(a,centre),v),dot(sub(a,centre),u))-Math.atan2(dot(sub(b,centre),v),dot(sub(b,centre),u)));
    next.push({neighbor,points:cut});
  }
  return next;
}

function box(w,h,t,base) {
  const x=w/2,z=t/2,b=base,y=base+h;
  return [
    {neighbor:-1,points:[[-x,b,-z],[-x,b,z],[-x,y,z],[-x,y,-z]]},
    {neighbor:-2,points:[[x,b,z],[x,b,-z],[x,y,-z],[x,y,z]]},
    {neighbor:-3,points:[[-x,b,z],[-x,b,-z],[x,b,-z],[x,b,z]]},
    {neighbor:-4,points:[[-x,y,-z],[-x,y,z],[x,y,z],[x,y,-z]]},
    {neighbor:-5,points:[[x,b,-z],[-x,b,-z],[-x,y,-z],[x,y,-z]]},
    {neighbor:-6,points:[[-x,b,z],[x,b,z],[x,y,z],[-x,y,z]]},
  ];
}

// Symmetric 3x3 eigensystem, column eigenvectors in a proper rotation matrix.
function principalAxes(matrix) {
  const a=matrix.map(r=>r.slice()),v=[[1,0,0],[0,1,0],[0,0,1]];
  for(let iteration=0;iteration<24;iteration++) {
    let p=0,q=1;
    for(const [i,j]of [[0,2],[1,2]])if(Math.abs(a[i][j])>Math.abs(a[p][q])){p=i;q=j;}
    if(Math.abs(a[p][q])<1e-12)break;
    const angle=0.5*Math.atan2(2*a[p][q],a[q][q]-a[p][p]),c=Math.cos(angle),s=Math.sin(angle);
    const app=a[p][p],aqq=a[q][q],apq=a[p][q];
    a[p][p]=c*c*app-2*c*s*apq+s*s*aqq;a[q][q]=s*s*app+2*c*s*apq+c*c*aqq;a[p][q]=a[q][p]=0;
    for(let k=0;k<3;k++) {
      if(k!==p&&k!==q){const akp=a[k][p],akq=a[k][q];a[k][p]=a[p][k]=c*akp-s*akq;a[k][q]=a[q][k]=s*akp+c*akq;}
      const vkp=v[k][p],vkq=v[k][q];v[k][p]=c*vkp-s*vkq;v[k][q]=s*vkp+c*vkq;
    }
  }
  return {basis:v,moments:[a[0][0],a[1][1],a[2][2]]};
}

function quaternion(m) {
  const trace=m[0][0]+m[1][1]+m[2][2];let x,y,z,w,s;
  if(trace>0){s=Math.sqrt(trace+1)*2;w=s/4;x=(m[2][1]-m[1][2])/s;y=(m[0][2]-m[2][0])/s;z=(m[1][0]-m[0][1])/s;}
  else if(m[0][0]>m[1][1]&&m[0][0]>m[2][2]){s=Math.sqrt(1+m[0][0]-m[1][1]-m[2][2])*2;w=(m[2][1]-m[1][2])/s;x=s/4;y=(m[0][1]+m[1][0])/s;z=(m[0][2]+m[2][0])/s;}
  else if(m[1][1]>m[2][2]){s=Math.sqrt(1+m[1][1]-m[0][0]-m[2][2])*2;w=(m[0][2]-m[2][0])/s;x=(m[0][1]+m[1][0])/s;y=s/4;z=(m[1][2]+m[2][1])/s;}
  else{s=Math.sqrt(1+m[2][2]-m[0][0]-m[1][1])*2;w=(m[1][0]-m[0][1])/s;x=(m[0][2]+m[2][0])/s;y=(m[1][2]+m[2][1])/s;z=s/4;}
  return [x,y,z,w];
}

function properties(faces, origin) {
  let volume=0,first=[0,0,0],second=Array.from({length:3},()=>[0,0,0]);
  for(const face of faces)for(let k=1;k<face.points.length-1;k++) {
    const vertices=[face.points[0],face.points[k],face.points[k+1]].map(p=>sub(p,origin));
    const vol=dot(vertices[0],cross(vertices[1],vertices[2]))/6,sum=vertices.reduce(add,[0,0,0]);
    volume+=vol;first=add(first,scale(sum,vol/4));
    for(let i=0;i<3;i++)for(let j=0;j<3;j++)second[i][j]+=vol/20*(sum[i]*sum[j]+vertices.reduce((s,v)=>s+v[i]*v[j],0));
  }
  const centre=scale(first,1/volume);
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)second[i][j]=second[i][j]/volume-centre[i]*centre[j];
  const trace=second[0][0]+second[1][1]+second[2][2];
  const inertia=second.map((r,i)=>r.map((value,j)=>(i===j?trace:0)-value));
  return {volume,centre:add(origin,centre),...principalAxes(inertia)};
}

function faceProperties(points) {
  let area=0,first=[0,0,0];const origin=mean(points);
  const triangles=[];
  for(let k=1;k<points.length-1;k++) {
    const tri=[points[0],points[k],points[k+1]],a=length(cross(sub(tri[1],tri[0]),sub(tri[2],tri[0])))/2;
    triangles.push({tri,a});area+=a;first=add(first,scale(tri.reduce(add,[0,0,0]),a/3));
  }
  const centre=scale(first,1/area),second=Array.from({length:3},()=>[0,0,0]);
  for(const {tri,a}of triangles) {
    const vs=tri.map(p=>sub(p,centre)),sum=vs.reduce(add,[0,0,0]);
    for(let i=0;i<3;i++)for(let j=0;j<3;j++)second[i][j]+=a/12*(sum[i]*sum[j]+vs.reduce((s,v)=>s+v[i]*v[j],0));
  }
  const trace=second[0][0]+second[1][1]+second[2][2];
  const momentAxes=[2,0,1]; // cannon LockConstraint angular equation order
  const sectionMoments=momentAxes.map(i=>Math.max(1e-13,trace-second[i][i]));
  const sectionModuli=momentAxes.map((i,k)=>sectionMoments[k]/Math.max(1e-5,...points.map(p=>Math.sqrt(sub(p,centre).reduce((s,v,j)=>s+(i!==j?v*v:0),0)))));
  return {area,midpoint:centre,sectionMoments,sectionModuli};
}

export function partition3D(seed,wall,thickness) {
  const rand=random(seed),sites=[];
  // Offset layers, broad jitter and small satellite cells avoid equal-sized through-thickness tiles.
  for(let layer=0;layer<2;layer++) {
    const cols=layer?9:10,rows=layer?6:7;
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++) sites.push([
      ((x+0.5+(rand()-0.5)*0.84)/cols-0.5)*wall.width,
      wall.base+(y+0.5+(rand()-0.5)*0.84)*wall.height/rows,
      ((layer?1:-1)*(0.13+rand()*0.27))*thickness]);
  }
  for(let i=0;i<12;i++) {
    const s=sites[Math.floor(rand()*124)];
    sites.push([Math.max(-wall.width/2+0.02,Math.min(wall.width/2-0.02,s[0]+(rand()-0.5)*0.28)),
      Math.max(wall.base+0.02,Math.min(wall.base+wall.height-0.02,s[1]+(rand()-0.5)*0.22)),(rand()-0.5)*thickness*0.76]);
  }
  const cells=[],edges=[];
  for(let i=0;i<sites.length;i++) {
    let faces=box(wall.width,wall.height,thickness,wall.base);
    const order=sites.map((p,j)=>({j,d:length(sub(p,sites[i]))})).filter(v=>v.j!==i).sort((a,b)=>a.d-b.d);
    for(const {j}of order)faces=clipSolid(faces,sub(sites[j],sites[i]),(dot(sites[j],sites[j])-dot(sites[i],sites[i]))/2,j);
    faces=faces.filter(f=>faceProperties(f.points).area>1e-9);
    const props=properties(faces,sites[i]),vertices=[],indices=[],faceKinds=[],faceNeighbors=[];
    for(const face of faces) {
      const faceIndices=[];
      for(const p of face.points) {
        let k=vertices.findIndex(v=>length(sub(v,p))<1e-7);
        if(k<0){k=vertices.length;vertices.push(p);}faceIndices.push(k);
      }
      indices.push(faceIndices);faceKinds.push(face.neighbor<0?0:1);faceNeighbors.push(face.neighbor);
      if(face.neighbor>i)edges.push({a:i,b:face.neighbor,...faceProperties(face.points)});
    }
    const local=vertices.map(p=>{const v=sub(p,props.centre);return [0,1,2].map(j=>props.basis.reduce((s,r,i)=>s+r[j]*v[i],0));});
    cells.push({id:i,cx:props.centre[0],cy:props.centre[1],cz:props.centre[2],volume:props.volume,moments:props.moments,
      rotation:quaternion(props.basis),basis:props.basis,worldVertices:vertices,localVertices:local,faces:indices,faceKinds,faceNeighbors,
      fixed:faces.some(f=>f.neighbor===-3),surfaceFaces:faces});
  }
  return {cells,edges};
}
