/* Seeded coastal habitats, branching trees, leaf clusters and ground vegetation.
 * All textures are drawn locally. Geometry and instance buffers are allocated once. */
(() => {
  'use strict';
  const P=Pelagic,T=THREE;
  P.landResolution=island=>island.rx<150?104:168;
  // Sample the same triangles used by the rendered island, not an ideal heightfield.
  P.islandGround=function(island,x,z){
    const c=Math.cos(island.angle),s=Math.sin(island.angle),dx=x-island.x,dz=z-island.z,n=P.landResolution(island);
    const gx=((dx*c+dz*s)/(island.rx*2.45)+.5)*n,gz=((-dx*s+dz*c)/(island.rz*2.45)+.5)*n;
    const ix=P.clamp(Math.floor(gx),0,n-1),iz=P.clamp(Math.floor(gz),0,n-1),u=P.clamp(gx-ix,0,1),v=P.clamp(gz-iz,0,1);
    const at=(i,j)=>{const a=(i/n-.5)*island.rx*2.45,b=(j/n-.5)*island.rz*2.45;return P.islandHeight(island,island.x+a*c-b*s,island.z+a*s+b*c);};
    const a=at(ix,iz),b=at(ix+1,iz),d=at(ix,iz+1),e=at(ix+1,iz+1);
    return u+v<=1?a+(b-a)*u+(d-a)*v:e+(d-e)*(1-u)+(b-e)*(1-v);
  };
  P.vegetationHabitat=function(island,x,z,y,slope){
    const patch=P.noise(x*.0075+island.seed,z*.0075)*.68+P.noise(x*.022-7,z*.022+island.seed)*.32;
    const cover=P.smooth(.29,.63,patch)*P.smooth(5,17,y)*(1-P.smooth(.58,1.12,slope))*(1-P.smooth(.62,.89,y/island.height));
    return {cover,patch};
  };
  P.planVegetation=function(island){
    const random=P.rng(island.seed*1097+273),plants=[],grass=[],shrubs=[],small=island.rx<150;
    const step=small?9:13.5,c=Math.cos(island.angle),s=Math.sin(island.angle);
    const place=(lx,lz)=>({x:island.x+lx*c-lz*s,z:island.z+lx*s+lz*c});
    for(let lz=-island.rz;lz<island.rz;lz+=step)for(let lx=-island.rx;lx<island.rx;lx+=step){
      const {x,z}=place(lx+(random()-.5)*step*.92,lz+(random()-.5)*step*.92),y=P.islandHeight(island,x,z);
      if(y<5||y>island.height*.90)continue;
      const slope=Math.hypot(P.islandHeight(island,x+2,z)-P.islandHeight(island,x-2,z),P.islandHeight(island,x,z+2)-P.islandHeight(island,x,z-2))/4;
      const habitat=P.vegetationHabitat(island,x,z,y,slope),coastal=y<43&&slope<.48;
      if(random()>(.14+habitat.cover*.86)*(small?.62:1)||slope>.97||y<8)continue;
      const palm=coastal&&random()<.17,type=palm?4:coastal&&random()<.26?3:Math.floor(random()*3);
      const height=(palm?10+random()*7:type===3?11+random()*9:10.5+random()*10)*(small?.67:1)*(1-P.smooth(.4,1.,slope)*.24);
      const ground=P.islandGround(island,x,z);if(ground<6)continue;
      plants.push({x,y:ground-.45,z,height,width:.82+random()*.35,angle:random()*Math.PI*2,type,tone:random(),slope});
    }
    // Fine understory is denser along the coast and at the margins of forest patches.
    const attempts=small?1400:Math.min(22000,Math.round(island.rx*island.rz*.065));
    for(let i=0;i<attempts;i++){
      const {x,z}=place((random()-.5)*island.rx*1.95,(random()-.5)*island.rz*1.95),y=P.islandHeight(island,x,z);
      if(y<4.9||y>Math.min(115,island.height*.72))continue;
      const slope=Math.hypot(P.islandHeight(island,x+1.5,z)-P.islandHeight(island,x-1.5,z),P.islandHeight(island,x,z+1.5)-P.islandHeight(island,x,z-1.5))/3;
      if(slope>.68)continue;
      const habitat=P.vegetationHabitat(island,x,z,y,slope);if(random()>.25+habitat.patch*.72)continue;
      const ground=P.islandGround(island,x,z);if(ground<4.6)continue;
      const isShrub=random()<.30,height=isShrub?1.4+random()*2.3:.45+random()*.82;
      (isShrub?shrubs:grass).push({x,y:ground-.13,z,height,width:isShrub?1.0+random()*.6:.7+random()*1.2,angle:random()*Math.PI*2,type:isShrub?5:6,tone:random(),slope});
    }
    // Little colonies around sheltered lowland trees make a layered forest floor.
    for(const tree of plants){
      if(tree.y>105||tree.slope>.63||random()>.68)continue;
      for(let j=0;j<9;j++){
        const a=random()*Math.PI*2,r=2+random()*7,x=tree.x+Math.cos(a)*r,z=tree.z+Math.sin(a)*r,y=P.islandGround(island,x,z);
        if(y<4.6||Math.abs(y-tree.y)>5)continue;
        const isShrub=j%3===0,height=isShrub?1.5+random()*2.2:.6+random()*.75;
        (isShrub?shrubs:grass).push({x,y:y-.15,z,height,width:.8+random()*.9,angle:random()*Math.PI*2,type:isShrub?5:6,tone:random(),slope:tree.slope});
      }
    }
    return {island,plants,shrubs,grass};
  };

  function buffer(){return {p:[],n:[],uv:[],c:[],idx:[]};}
  const up=new T.Vector3(0,1,0),axis=new T.Vector3(),q=new T.Quaternion(),v=new T.Vector3(),normal=new T.Vector3();
  function vertex(b,p,n,u,w,col){b.p.push(p.x,p.y,p.z);b.n.push(n.x,n.y,n.z);b.uv.push(u,w);b.c.push(...col);}
  function tube(b,a,end,r0,r1,segments=7){
    const start=b.p.length/3,d=end.clone().sub(a),length=d.length();q.setFromUnitVectors(up,d.normalize());
    for(let ring=0;ring<2;ring++)for(let j=0;j<=segments;j++){
      const t=j/segments*Math.PI*2,r=ring?r1:r0;normal.set(Math.cos(t),0,Math.sin(t)).applyQuaternion(q);
      v.set(Math.cos(t)*r,ring*length,Math.sin(t)*r).applyQuaternion(q).add(a);
      vertex(b,v,normal,j/segments*2,ring*length*7,[.70+.23*v.y,.72+.23*v.y,.68+.23*v.y]);
    }
    for(let j=0;j<segments;j++){const i=start+j,k=i+segments+1;b.idx.push(i,k,i+1,i+1,k,k+1);}
  }
  function leafCard(b,center,width,height,angle,tilt,tile,shade){
    const start=b.p.length/3,rot=new T.Quaternion().setFromEuler(new T.Euler(tilt,angle,Math.sin(angle)*.20)),u0=(tile%2)*.5,v0=(1-Math.floor(tile/2))*.5;
    const normalBase=center.clone().sub(new T.Vector3(0,.46,0));normalBase.y=Math.abs(normalBase.y)*.65+.24;normalBase.normalize();
    for(const [x,y]of [[-1,-1],[1,-1],[1,1],[-1,1]]){
      v.set(x*width*.5,y*height*.5,-.065*width).applyQuaternion(rot).add(center);
      normal.copy(normalBase).addScaledVector(v.clone().sub(center),.4).normalize();
      vertex(b,v,normal,u0+(.025+(x+1)*.475)*.5,v0+(.025+(y+1)*.475)*.5,[shade*.88,shade,shade*.77]);
    }
    b.idx.push(start,start+1,start+2,start,start+2,start+3);
  }
  function geometry(b){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(b.p,3));g.setAttribute('normal',new T.Float32BufferAttribute(b.n,3));g.setAttribute('uv',new T.Float32BufferAttribute(b.uv,2));g.setAttribute('color',new T.Float32BufferAttribute(b.c,3));g.setIndex(b.idx);g.computeBoundingSphere();return g;}
  function tree(type){
    const random=P.rng(753+type*421),wood=buffer(),leaves=buffer(),lean=.04+random()*.065;
    const trunk=t=>new T.Vector3(lean*t*t,t,-.025*t*t);
    for(let j=0;j<5;j++)tube(wood,trunk(j*.19),trunk((j+1)*.19),.023*(1-j*.17),.023*(1-(j+1)*.17),8);
    const levels=type===3?7:4;
    for(let level=0;level<levels;level++){
      const y=type===3?.33+level*.085:.46+level*.13,count=type===3?4:5;
      for(let j=0;j<count;j++){
        const a=j/count*Math.PI*2+level*2.39+random()*.4,r=(type===3?.30-level*.026:.33-Math.abs(level-1.5)*.055)*(.8+random()*.36);
        const start=trunk(y-.12),bend=new T.Vector3(Math.cos(a)*r*.53+lean*y*y,y-.045,Math.sin(a)*r*.53),end=new T.Vector3(Math.cos(a)*r+lean*y*y,y+.03+random()*.045,Math.sin(a)*r);
        tube(wood,start,bend,.010,.006,6);tube(wood,bend,end,.006,.002,5);
        const clusterSize=type===3?.27:.33;
        for(let k=0;k<3;k++){
          const center=end.clone().add(new T.Vector3((random()-.5)*.08,(random()-.5)*.08,(random()-.5)*.08));
          leafCard(leaves,center,clusterSize*(.8+random()*.35),clusterSize*(type===3?.57:.78),a+k*1.08,-.14+k*.40,type===3?2:type%2,.75+random()*.25);
        }
      }
    }
    for(let i=0;i<5;i++)leafCard(leaves,new T.Vector3(lean+(random()-.5)*.10,.94,(random()-.5)*.10),.24,.24,i*1.27,.12,type===3?2:type%2,.97);
    return {wood:geometry(wood),leaves:geometry(leaves)};
  }
  function palm(){
    const wood=buffer(),leaves=buffer(),trunk=t=>new T.Vector3(.11*t*t,t,.03*Math.sin(t*3));
    for(let j=0;j<10;j++)tube(wood,trunk(j*.083),trunk((j+1)*.083),.019-j*.0009,.018-j*.0009,8);
    const crown=trunk(.83);
    // Curved rachises with individually modelled, tapering pairs of leaflets.
    for(let f=0;f<10;f++){
      const a=f*2.399,r=.40+(f%3)*.035,along=t=>new T.Vector3(crown.x+Math.cos(a)*r*t,crown.y+.18*Math.sin(t*Math.PI*.92)-t*t*.11,crown.z+Math.sin(a)*r*t);
      for(let j=0;j<5;j++)tube(wood,along(j/5),along((j+1)/5),.0035*(1-j/6),.0027*(1-j/6),4);
      for(let j=1;j<15;j++)for(const side of [-1,1]){
        const t=j/15,base=along(t),spread=(.10*Math.sin(t*Math.PI)+.018),tip=base.clone().add(new T.Vector3(Math.cos(a+.91*side)*spread,-.013-spread*.26,Math.sin(a+.91*side)*spread)),cross=new T.Vector3(-Math.sin(a),.08,Math.cos(a)).multiplyScalar(.008*(1-t*.55)),mid=base.clone().lerp(tip,.45);mid.y+=.012;
        const start=leaves.p.length/3,n=new T.Vector3(Math.cos(a)*.23,1,Math.sin(a)*.23).normalize();
        for(const p of [base,mid.clone().add(cross),tip,mid.clone().sub(cross)])vertex(leaves,p,n,.1,.1,[.085+j*.0035,.19+j*.004,.045+j*.0025]);
        leaves.idx.push(start,start+1,start+2,start,start+2,start+3);
      }
    }
    return {wood:geometry(wood),leaves:geometry(leaves),solid:true};
  }
  function shrub(){
    const wood=buffer(),leaves=buffer(),random=P.rng(836);
    for(let j=0;j<9;j++){
      const a=j*2.399,r=.13+random()*.2,end=new T.Vector3(Math.cos(a)*r,.44+random()*.36,Math.sin(a)*r);
      tube(wood,new T.Vector3(0,-.03,0),end,.016,.005,5);
      for(let k=0;k<3;k++)leafCard(leaves,end,.64,.48,a+k*1.05,k*.38,3,.71+random()*.27);
    }
    return {wood:geometry(wood),leaves:geometry(leaves)};
  }
  function grass(){
    const b=buffer(),random=P.rng(53);
    for(let j=0;j<11;j++){
      const a=random()*Math.PI*2,h=.45+random()*.55,r=random()*.26,width=.014+random()*.019,start=b.p.length/3;
      for(let k=0;k<4;k++)for(const side of [-1,1]){
        const t=k/3,bend=t*t*.38;
        v.set(Math.cos(a)*r+Math.sin(a)*side*width*(1-t)+Math.cos(a)*bend,h*t,Math.sin(a)*r-Math.cos(a)*side*width*(1-t)+Math.sin(a)*bend);
        normal.set(Math.sin(a)*.3,1,-Math.cos(a)*.3).normalize();vertex(b,v,normal,side===-1?0:1,t,[.07+t*.085,.15+t*.095,.036+t*.045]);
      }
      for(let k=0;k<3;k++){const i=start+k*2;b.idx.push(i,i+1,i+2,i+1,i+3,i+2);}
    }
    return geometry(b);
  }
  function textures(renderer){
    const atlas=document.createElement('canvas');atlas.width=atlas.height=1024;const c=atlas.getContext('2d'),random=P.rng(6948);
    function leaf(x,y,length,width,angle,tone){
      c.save();c.translate(x,y);c.rotate(angle);c.fillStyle=tone;c.beginPath();c.moveTo(-length*.5,0);c.bezierCurveTo(-length*.1,-width,length*.28,-width*.70,length*.5,0);c.bezierCurveTo(length*.22,width*.70,-length*.15,width,-length*.5,0);c.fill();
      c.strokeStyle='rgba(193,202,122,.25)';c.lineWidth=.8;c.beginPath();c.moveTo(-length*.4,0);c.lineTo(length*.40,0);c.stroke();c.restore();
    }
    for(let tile=0;tile<4;tile++){
      c.save();c.translate((tile%2)*512,Math.floor(tile/2)*512);c.beginPath();c.rect(9,9,494,494);c.clip();
      // A porous but filled inner crown survives minification; the smaller outer
      // twigs supply individual leaves and an irregular silhouette at close range.
      for(let k=0;k<(tile===2?410:310);k++){
        const a=random()*Math.PI*2,r=Math.sqrt(random()),x=256+Math.cos(a)*r*177,y=256+Math.sin(a)*r*163;
        const light=53+Math.floor(random()*37),tone=`rgb(${Math.round(light*.59)},${light+9},${Math.round(light*.44)})`;
        leaf(x,y,tile===2?35+random()*22:27+random()*19,tile===2?3.1:9+random()*6,a+(random()-.5)*1.4,tone);
      }
      for(let twig=0;twig<15;twig++){
        const angle=twig*2.399,ex=256+Math.cos(angle)*(105+random()*104),ey=251+Math.sin(angle)*(85+random()*119);
        c.strokeStyle=tile===2?'#666945':'#74714b';c.lineWidth=1.5+random()*2;c.beginPath();c.moveTo(245,299);c.quadraticCurveTo(250+(ex-250)*.65,260,ex,ey);c.stroke();
        const count=tile===2?30:11;
        for(let k=0;k<count;k++){
          const t=.2+random()*.80,x=245+(ex-245)*t+(random()-.5)*46,y=299+(ey-299)*t+(random()-.5)*49;
          const light=55+Math.floor(random()*48),tone=`rgb(${Math.round(light*.61)},${light+13},${Math.round(light*.46)})`;
          leaf(x,y,tile===2?25+random()*18:21+random()*18,tile===2?2.2:6+random()*5,angle+(random()-.5)*2.4,tone);
        }
      }
      c.restore();
    }
    const leafMap=new T.CanvasTexture(atlas);leafMap.colorSpace=T.SRGBColorSpace;leafMap.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());leafMap.name='Locally drawn foliage and leaf veins';
    const bark=document.createElement('canvas');bark.width=128;bark.height=256;const b=bark.getContext('2d');b.fillStyle='#5d5849';b.fillRect(0,0,128,256);
    for(let j=0;j<220;j++){const x=random()*128,tone=60+Math.floor(random()*65);b.strokeStyle=`rgba(${tone},${Math.round(tone*.85)},${Math.round(tone*.65)},.55)`;b.lineWidth=.4+random()*2;b.beginPath();b.moveTo(x,0);for(let y=0;y<=256;y+=13)b.lineTo(x+Math.sin(y*.067+j)*1.8,y);b.stroke();}
    const barkMap=new T.CanvasTexture(bark);barkMap.colorSpace=T.SRGBColorSpace;barkMap.wrapS=barkMap.wrapT=T.RepeatWrapping;barkMap.anisotropy=4;
    return {leafMap,barkMap};
  }
  P.createVegetation=function(scene,renderer,uniforms){
    const group=new T.Group();group.name='Coastal forest, understory and grass';scene.add(group);
    const maps=textures(renderer),models=[tree(0),tree(1),tree(2),tree(3),palm(),shrub()],grassGeometry=grass(),materials=[],plans=P.islands.map(P.planVegetation);
    function material({map=null,foliage=false,range=0}={}){
      const mat=new T.MeshStandardMaterial({map,color:0xffffff,vertexColors:true,roughness:foliage?.86:.97,metalness:0,side:foliage?T.DoubleSide:T.FrontSide,alphaTest:map===maps.leafMap?.20:0,alphaToCoverage:foliage,envMapIntensity:.11});
      mat.onBeforeCompile=shader=>{
        shader.uniforms.uPlantTime=uniforms.uTime;shader.uniforms.uPlantWeather=uniforms.uWeather;shader.uniforms.uPlantDay=uniforms.uDay;shader.uniforms.uPlantSun=uniforms.uSunDir;
        shader.vertexShader='uniform float uPlantTime,uPlantWeather;varying vec3 vPlantWorld;varying float vPlantHeight;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
          vec3 plantRoot=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
          float plantDistance=length(cameraPosition-plantRoot);
          float plantLod=${range?'1.-smoothstep('+range.toFixed(1)+','+(range*1.45).toFixed(1)+',plantDistance)':'1.'};
          float flexibility=pow(clamp(position.y,0.,1.2),2.);
          float breeze=(sin(uPlantTime*1.15+plantRoot.x*.037+plantRoot.z*.021)*.68+sin(uPlantTime*2.03+plantRoot.z*.061)*.32)*(.006+uPlantWeather*.005);
          vec2 localWind=vec2(dot(normalize(instanceMatrix[0].xz),vec2(.94,.34)),dot(normalize(instanceMatrix[2].xz),vec2(.94,.34)));
          transformed.xz+=localWind*breeze*flexibility;
          transformed*=plantLod;
          vPlantWorld=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz;vPlantHeight=position.y;
        `);
        shader.fragmentShader='uniform float uPlantDay;uniform vec3 uPlantSun;varying vec3 vPlantWorld;varying float vPlantHeight;\n'+shader.fragmentShader;
        if(foliage)shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\nnormal*=faceDirection;\n#endif');
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          diffuseColor.rgb*=mix(.70,1.04,smoothstep(.12,1.,vPlantHeight));
        `);
        if(foliage)shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
          float leafTransmission=pow(max(dot(normalize(cameraPosition-vPlantWorld),-uPlantSun),0.),3.)*uPlantDay*.12;
          reflectedLight.indirectDiffuse+=diffuseColor.rgb*leafTransmission;
        `);
      };
      mat.customProgramCacheKey=()=>`coastal-plant-${foliage}-${range}`;materials.push(mat);return mat;
    }
    const bark=material({map:maps.barkMap}),foliage=material({map:maps.leafMap,foliage:true}),palmLeaf=material({foliage:true}),shrubBark=material({map:maps.barkMap,range:1000}),shrubLeaf=material({map:maps.leafMap,foliage:true,range:1000}),grassMat=material({foliage:true,range:600});
    const matrix=new T.Matrix4(),rotation=new T.Quaternion(),position=new T.Vector3(),scale=new T.Vector3(),color=new T.Color(),patches=[];
    function batch(geo,mat,items,name){
      if(!items.length)return;const mesh=new T.InstancedMesh(geo,mat,items.length);mesh.name=name;
      items.forEach((p,i)=>{
        position.set(p.x,p.y,p.z);rotation.setFromAxisAngle(up,p.angle);scale.set(p.height*p.width,p.height,p.height*p.width);matrix.compose(position,rotation,scale);mesh.setMatrixAt(i,matrix);
        color.setRGB(.74+p.tone*.24,.80+p.tone*.20,.67+p.tone*.25);mesh.setColorAt(i,color);
      });
      mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();mesh.boundingSphere.radius+=3;group.add(mesh);return mesh;
    }
    let trees=0,shrubs=0,grasses=0;
    for(const plan of plans){
      const {island}=plan;trees+=plan.plants.length;shrubs+=plan.shrubs.length;grasses+=plan.grass.length;
      for(let type=0;type<5;type++){
        const items=plan.plants.filter(p=>p.type===type),model=models[type];batch(model.wood,bark,items,island.name+' · 树干与分枝');batch(model.leaves,model.solid?palmLeaf:foliage,items,island.name+' · '+(type===4?'海岸棕榈':type===3?'木麻黄':'常绿阔叶树'));
      }
      const detail=[batch(models[5].wood,shrubBark,plan.shrubs,island.name+' · 林下枝条'),batch(models[5].leaves,shrubLeaf,plan.shrubs,island.name+' · 灌木'),batch(grassGeometry,grassMat,plan.grass,island.name+' · 草丛')].filter(Boolean);
      patches.push({island,detail});
    }
    function update(camera,daylight){
      for(const mat of materials)mat.envMapIntensity=P.mix(.015,.11,daylight);
      for(const patch of patches){const i=patch.island,d=Math.hypot(camera.position.x-i.x,camera.position.z-i.z)-Math.max(i.rx,i.rz)*1.18;for(const m of patch.detail)m.visible=d<(m.material===grassMat?900:1500);}
    }
    function dispose(){maps.leafMap.dispose();maps.barkMap.dispose();}
    return {group,plans,update,dispose,stats:{trees,shrubs,grassClumps:grasses,plantTypes:7,drawBatches:group.children.length}};
  };
})();
