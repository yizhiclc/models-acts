/* Fictional M—07 airframe. All geometry and decals are generated locally. */
(() => {
  'use strict';
  const P=Pelagic,T=THREE;
  P.createAircraft=function() {
    const airframe=new T.Group();airframe.name='M—07 · 无定';
    const coat=new T.MeshStandardMaterial({color:0xd2d8d4,roughness:.43,metalness:.38});
    const pale=new T.MeshStandardMaterial({color:0xaebfbc,roughness:.51,metalness:.28});
    const radome=new T.MeshStandardMaterial({color:0x233c45,roughness:.56,metalness:.18});
    const graphite=new T.MeshStandardMaterial({color:0x26383b,roughness:.48,metalness:.52});
    const seam=new T.MeshStandardMaterial({color:0x667575,roughness:.6,metalness:.35});
    const metal=new T.MeshStandardMaterial({color:0x677072,roughness:.35,metalness:.86});
    const hot=new T.MeshStandardMaterial({color:0x48433e,roughness:.62,metalness:.78});
    const amber=new T.MeshStandardMaterial({color:0xd59143,roughness:.47,metalness:.3});
    const dark=new T.MeshStandardMaterial({color:0x0b1519,roughness:.92,metalness:.18});
    function mesh(g,m,parent=airframe) {const o=new T.Mesh(g,m);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
    function lathe(profile,mat) {
      const g=new T.LatheGeometry(profile.map(v=>new T.Vector2(...v)),80);
      g.rotateX(Math.PI/2);return mesh(g,mat);
    }
    // A continuous ogive meets the parallel body with a matching tangent.
    lathe([[0,-6.38],[.044,-6.3],[.12,-6.09],[.24,-5.78],[.345,-5.43],[.426,-5.05],[.48,-4.66],[.51,-4.30],[.523,-4.02]],radome);
    lathe([[.523,-4.025],[.532,-3.78],[.54,-3.25],[.54,2.92],[.525,3.42],[.483,3.89],[.427,4.25],[.383,4.49]],coat);
    lathe([[.525,-4.028],[.533,-3.92],[.535,-3.84]],amber);
    lathe([[.482,3.90],[.47,4.07],[.42,4.42],[.392,4.56]],hot);
    function ring(radius,z,tube,mat) {
      const o=mesh(new T.TorusGeometry(radius,tube,6,72),mat);o.position.z=z;return o;
    }
    [[.539,-3.25],[.542,-1.84],[.542,1.72],[.53,3.4],[.458,4.14]].forEach(([r,z])=>ring(r,z,.006,seam));
    ring(.386,4.54,.033,metal);ring(.338,4.56,.018,hot);
    const duct=dark.clone();duct.side=T.DoubleSide;
    const throat=mesh(new T.CylinderGeometry(.322,.268,.58,48,1,true),duct);
    throat.rotation.x=Math.PI/2;throat.position.z=4.29;
    const glowCanvas=document.createElement('canvas');glowCanvas.width=glowCanvas.height=128;const gc=glowCanvas.getContext('2d'),gradient=gc.createRadialGradient(64,64,3,64,64,64);gradient.addColorStop(0,'#ffefcd');gradient.addColorStop(.35,'#f9b77c');gradient.addColorStop(.76,'#b54c22');gradient.addColorStop(1,'#261814');gc.fillStyle=gradient;gc.fillRect(0,0,128,128);const glowTexture=new T.CanvasTexture(glowCanvas);glowTexture.colorSpace=T.SRGBColorSpace;
    const glowMat=new T.MeshBasicMaterial({map:glowTexture,color:0xffffff,transparent:true,opacity:.72});
    const back=mesh(new T.CircleGeometry(.325,48),dark);back.position.z=4.005;
    const glow=mesh(new T.CircleGeometry(.261,48),glowMat);glow.position.z=4.21;
    const hub=mesh(new T.ConeGeometry(.115,.25,32),hot);hub.rotation.x=Math.PI/2;hub.position.z=4.29;
    for(let i=0;i<16;i++){
      const a=i*Math.PI/8;const vane=mesh(new T.BoxGeometry(.018,.065,.20),metal);
      vane.position.set(Math.cos(a)*.30,Math.sin(a)*.30,4.35);vane.rotation.z=a-Math.PI/2;
    }
    function foil(span,rootLeading,rootChord,tipLeading,tipChord,thickness,materials) {
      const positions=[],uvs=[],indices=[],groups=[];const S=12,C=24;
      function h(u){return 5*(.2969*Math.sqrt(u)-.126*u-.3516*u*u+.2843*u*u*u-.1036*u*u*u*u);}
      for(let side=0;side<2;side++)for(let s=0;s<=S;s++)for(let c=0;c<=C;c++){
        const v=s/S,u=c/C,lead=P.mix(rootLeading,tipLeading,v),chord=P.mix(rootChord,tipChord,v);
        const y=h(u)*thickness*(1-v*.72)*(side===0?1:-1);
        positions.push(.39+span*v,y,lead+chord*u);uvs.push(v,u);
      }
      const stride=(S+1)*(C+1);
      for(let side=0;side<2;side++)for(let s=0;s<S;s++)for(let c=0;c<C;c++){
        const a=side*stride+s*(C+1)+c,b=a+C+1;
        const start=indices.length;
        if(side===0)indices.push(a,a+1,b,b,a+1,b+1);else indices.push(a,b,a+1,b,b+1,a+1);
        const mi=s===10?2:(s===11||c>=20?1:0);groups.push([start,6,mi]);
      }
      for(let c=0;c<C;c++){
        const a=S*(C+1)+c,b=a+stride;indices.push(a,b,a+1,b,b+1,a+1);
      }
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();
      groups.forEach(v=>g.addGroup(...v));g.addGroup(indices.length-C*6,C*6,1);
      // Collapse adjacent material groups: a wing costs only a handful of draw calls.
      const compact=[];for(const q of g.groups){const last=compact[compact.length-1];if(last&&last.materialIndex===q.materialIndex&&last.start+last.count===q.start)last.count+=q.count;else compact.push({...q});}g.groups=compact;
      // Sort by material so separate foil segments batch together.
      const reordered=[],newGroups=[];
      for(let mi=0;mi<3;mi++){const start=reordered.length;for(const q of g.groups)if(q.materialIndex===mi)for(let j=q.start;j<q.start+q.count;j++)reordered.push(indices[j]);newGroups.push({start,count:reordered.length-start,materialIndex:mi});}
      g.setIndex(reordered);g.groups=newGroups;return mesh(g,materials);
    }
    for(const side of [-1,1]){
      const wing=foil(3.52,-1.17,2.40,.51,.88,.28,[coat,pale,amber]);wing.scale.x=side;wing.position.y=-.08;
      const root=mesh(new T.SphereGeometry(1,32,18),coat);root.scale.set(.64,.155,1.43);root.position.set(side*.46,-.065,.13);
      // A recessed flaperon hinge lies on the actual upper airfoil surface.
      const pts=[];for(let i=0;i<=14;i++){const v=.12+i/14*.77;pts.push(new T.Vector3(side*(.39+3.52*v),-.08+.045*(1-v*.72),P.mix(-1.17,.51,v)+P.mix(2.4,.88,v)*.82));}
      const line=new T.Line(new T.BufferGeometry().setFromPoints(pts),new T.LineBasicMaterial({color:0x647675}));airframe.add(line);
    }
    for(let i=0;i<4;i++){
      const fin=foil(1.13,2.54,1.78,3.51,.78,.19,[pale,graphite,amber]);fin.rotation.z=i*Math.PI/2;
      const root=mesh(new T.SphereGeometry(1,24,12),pale);root.scale.set(.41,.10,1.02);root.position.set(Math.cos(i*Math.PI/2)*.45,Math.sin(i*Math.PI/2)*.45,3.4);root.rotation.z=i*Math.PI/2;
    }
    // Ventral intake: a lofted duct, thick rolled lip and a recessed dark opening.
    const sections=[[-1.02,.245,.18,-.635],[-.9,.29,.215,-.644],[-.47,.33,.26,-.65],[.28,.34,.26,-.66],[1.1,.29,.21,-.62],[1.85,.20,.13,-.55],[2.45,.055,.05,-.49]];
    const ip=[],ii=[];
    sections.forEach(([z,rx,ry,cy])=>{for(let j=0;j<48;j++){const a=j/48*Math.PI*2;ip.push(Math.cos(a)*rx,cy+Math.sin(a)*ry,z);}});
    for(let k=0;k<sections.length-1;k++)for(let j=0;j<48;j++){const a=k*48+j,b=k*48+(j+1)%48;ii.push(a,b,a+48,b,b+48,a+48);}
    const ig=new T.BufferGeometry();ig.setAttribute('position',new T.Float32BufferAttribute(ip,3));ig.setIndex(ii);ig.computeVertexNormals();mesh(ig,pale);
    const lip=mesh(new T.TorusGeometry(.22,.025,10,48),metal);lip.scale.set(1.16,.84,1);lip.position.set(0,-.635,-1.025);
    const inlet=mesh(new T.CircleGeometry(.219,48),dark);inlet.rotation.y=Math.PI;inlet.scale.set(1.09,.78,1);inlet.position.set(0,-.635,-.98);
    const splitter=mesh(new T.BoxGeometry(.024,.29,.11),graphite);splitter.position.set(0,-.635,-1.04);
    // Flush access panels follow the cylindrical surface instead of floating cards.
    function panel(z,side,len,arc){
      const pts=[];const start=side>0?-.29:Math.PI-.29;
      for(let edge=0;edge<4;edge++)for(let j=0;j<=12;j++){
        const t=j/12;let a=start,zz=z;
        if(edge===0){a+=arc*t;zz-=len/2;}if(edge===1){a+=arc;zz+=-len/2+len*t;}if(edge===2){a+=arc*(1-t);zz+=len/2;}if(edge===3){zz+=len/2-len*t;}
        pts.push(new T.Vector3(Math.cos(a)*.543,Math.sin(a)*.543,zz));
      }
      airframe.add(new T.LineLoop(new T.BufferGeometry().setFromPoints(pts),new T.LineBasicMaterial({color:0x647778,transparent:true,opacity:.7})));
      for(const zz of [z-len*.41,z+len*.41])for(const a of [start+.055,start+arc-.055]){
        const o=mesh(new T.SphereGeometry(.013,6,4),metal);o.position.set(Math.cos(a)*.546,Math.sin(a)*.546,zz);
      }
    }
    for(const s of [-1,1]){panel(-2.7,s,.69,.54);panel(2.27,s,.6,.54);}
    const topHatch=mesh(new T.SphereGeometry(1,24,12),pale);topHatch.scale.set(.23,.028,.52);topHatch.position.set(0,.534,-.6);
    for(let side of [-1,1])for(let i=0;i<5;i++){
      const o=mesh(new T.BoxGeometry(.008,.075,.021),graphite);o.position.set(side*.533,.08,2.73+i*.073);o.rotation.x=-.3;
    }
    function decalCanvas(){
      const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=256;
      const c=canvas.getContext('2d');c.clearRect(0,0,1536,256);c.fillStyle='#30494e';
      c.font='600 108px Arial';c.fillText('M—07',36,138);
      c.font='500 34px Arial';c.fillText('PELAGIC',590,82);c.font='24px Arial';c.fillText('FLIGHT RESEARCH  /  018',594,130);
      c.fillStyle='#bc833a';c.fillRect(1150,46,12,99);c.fillRect(1180,46,52,99);
      c.fillStyle='#485b5d';c.font='19px Arial';c.fillText('FICTIONAL AIRFRAME  •  OCEAN SURVEY SERIES',42,205);
      const t=new T.CanvasTexture(canvas);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;return t;
    }
    const dm=new T.MeshStandardMaterial({map:decalCanvas(),transparent:true,roughness:.7,metalness:.1,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
    for(const side of [-1,1]){
      const d=mesh(new T.PlaneGeometry(2.63,.438),dm);d.rotation.y=side*Math.PI/2;d.position.set(side*.544,.045,-.87);
    }
    const dorsal=mesh(new T.BoxGeometry(.018,.027,1.54),graphite);dorsal.position.set(0,.547,1.54);
    const tinyLight=mesh(new T.SphereGeometry(.024,8,6),new T.MeshBasicMaterial({color:0xefbe73}));tinyLight.position.set(0,.561,1.88);
    airframe.userData.glow=glowMat;airframe.userData.hot=hot;hot.emissive=new T.Color(0x55270b);hot.emissiveIntensity=.02;
    return airframe;
  };
})();
