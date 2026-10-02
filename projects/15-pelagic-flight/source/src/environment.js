/* World-space ocean, terrain, participating-volume clouds, and light system. */
(() => {
  'use strict';
  const P=Pelagic,T=THREE;
  const noiseGLSL=`
    float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+1.),f.x),f.y);}
    float fbm2(vec2 p){return .57*noise2(p)+.28*noise2(p*2.03+13.1)+.15*noise2(p*4.17+31.7);}
    float hash31(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
    float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),mix(hash31(i+vec3(0,1,1)),hash31(i+1.),f.x),f.y),f.z);}
  `;
  const atmosphereGLSL=`
    uniform vec3 uSunDir,uMoonDir,uSunColor,uSkyTop,uHorizon;
    uniform float uDay,uSunPower,uMoonPower,uWeather,uTime;
    vec3 atmosphere(vec3 d){
      float h=max(d.y,0.);
      vec3 c=mix(uHorizon,uSkyTop,pow(h,.48));
      float sd=max(dot(d,uSunDir),0.);
      c+=uSunColor*pow(sd,12.)*.19*uSunPower;
      c+=uSunColor*pow(sd,180.)*.28*uSunPower;
      return c;
    }
    float cloudShadow(vec2 p){
      vec2 q=p*.00055+vec2(uTime*.003,.0);
      float n=fbm2(q);
      return 1.-smoothstep(.40,.72,n)*mix(.23,.61,uWeather);
    }
  `;
  P.createEnvironment=function(scene,renderer) {
    const uni={uTime:{value:0},uSunDir:{value:new T.Vector3()},uMoonDir:{value:new T.Vector3()},uSunColor:{value:new T.Color()},uSkyTop:{value:new T.Color()},uHorizon:{value:new T.Color()},uDay:{value:1},uSunPower:{value:1},uMoonPower:{value:0},uWeather:{value:0}};
    const sun=new T.DirectionalLight(0xffead1,3);scene.add(sun);scene.add(sun.target);
    sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-14;sun.shadow.camera.right=14;sun.shadow.camera.top=14;sun.shadow.camera.bottom=-14;sun.shadow.camera.near=1;sun.shadow.camera.far=180;sun.shadow.bias=-.00035;sun.shadow.normalBias=.017;
    const moon=new T.DirectionalLight(0xadc8ef,.3);scene.add(moon);scene.add(moon.target);
    const ambient=new T.HemisphereLight(0xa3c4ce,0x163536,1.65);scene.add(ambient);
    const sky=new T.Mesh(new T.SphereGeometry(22000,32,16),new T.ShaderMaterial({
      uniforms:uni,side:T.BackSide,depthWrite:false,
      vertexShader:`varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec3 vDirection;${noiseGLSL}${atmosphereGLSL}
        void main(){vec3 d=normalize(vDirection);vec3 c=atmosphere(d);
          float sd=dot(d,uSunDir),md=dot(d,uMoonDir);
          float sun=smoothstep(.999945,.999982,sd)*uSunPower;
          c+=uSunColor*sun*8.;
          float moon=smoothstep(.99988,.99994,md)*uMoonPower;
          c+=vec3(.66,.78,.92)*moon*(.62+.2*noise3(d*640.));
          c+=vec3(.1,.16,.25)*pow(max(md,0.),160.)*uMoonPower;
          vec3 cell=floor(d*690.);float star=pow(hash31(cell),240.);
          c+=vec3(.61,.72,.86)*star*pow(1.-uDay,4.)*smoothstep(.08,.4,d.y)*(1.-uWeather*.85);
          float veil=fbm2(d.xz/max(.17,d.y)*2.8+vec2(uTime*.0008,0));
          c=mix(c,uHorizon*1.22,smoothstep(.68,.9,veil)*smoothstep(.02,.19,d.y)*.19);
          gl_FragColor=vec4(c,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    }));sky.frustumCulled=false;sky.renderOrder=-10;scene.add(sky);
    // A single radial grid keeps small triangles near the camera without tile seams.
    const positions=[],indices=[],spacing=[];const A=384,R=320,maxRadius=23000;
    // Resolve nearby waves at ~1 m radial spacing; apply a spatial Nyquist cutoff
    // before coarsening the mesh. Fine wind waves belong in normals in the distance.
    const radiusAt=r=>r<=160?r:r<=240?160+Math.pow((r-160)/80,1.5)*740:900*Math.pow(maxRadius/900,(r-240)/80);
    positions.push(0,0,0);spacing.push(1);
    for(let r=1;r<=R;r++){
      const radius=radiusAt(r),sampleSize=Math.max(radius-radiusAt(r-1),radiusAt(Math.min(R,r+1))-radius,radius*Math.PI*2/A);
      for(let a=0;a<A;a++){const q=a/A*Math.PI*2;positions.push(Math.cos(q)*radius,0,Math.sin(q)*radius);spacing.push(sampleSize);}
    }
    for(let a=0;a<A;a++)indices.push(0,1+(a+1)%A,1+a);
    for(let r=0;r<R-1;r++)for(let a=0;a<A;a++){
      const i=1+r*A+a,j=1+r*A+(a+1)%A;indices.push(i,j,i+A,j,j+A,i+A);
    }
    const waterG=new T.BufferGeometry();waterG.setAttribute('position',new T.Float32BufferAttribute(positions,3));waterG.setAttribute('aSpacing',new T.Float32BufferAttribute(spacing,1));waterG.setIndex(indices);
    const spectrum=new P.OceanSpectrum();P.setWindSampler((x,z)=>spectrum.heightAt(x,z));
    const spectralGLSL=`uniform sampler2D uSpectrumA,uSpectrumB;uniform float uSpectrumBlend,uSpectrumAmplitude;
      vec4 spectral(vec2 p){vec4 s=mix(texture2D(uSpectrumA,p/160.),texture2D(uSpectrumB,p/160.),uSpectrumBlend);return vec4((s.r-.5)*3.2,(s.gb-.5)*2.,s.a);}
      vec4 windSea(vec2 p){vec4 a=spectral(p),b=spectral(mat2(.8,.6,-.6,.8)*p/2.17+vec2(51.3,17.1));vec2 g=a.gb+mat2(.8,-.6,.6,.8)*b.gb*(.42/2.17);return vec4((a.r+b.r*.42)*uSpectrumAmplitude,g*uSpectrumAmplitude,max(a.a,b.a*.42));}
    `;
    const waveUniforms=P.waves.map(([a,k,x,z,w])=>new T.Vector4(a,k,x,z));
    const ou={...uni,uSpectrumA:{value:spectrum.a.texture},uSpectrumB:{value:spectrum.b.texture},uSpectrumBlend:{value:0},uSpectrumAmplitude:{value:1},uOrigin:{value:new T.Vector2()},uWaves:{value:waveUniforms},uFreq:{value:P.waves.map(w=>w[4])},uIslands:{value:P.islands.map(i=>new T.Vector4(i.x,i.z,i.rx,i.rz))},uAngles:{value:P.islands.map(i=>i.angle)},uSeeds:{value:P.islands.map(i=>i.seed)},uAircraft:{value:new T.Vector3()},uForward:{value:new T.Vector2()}};
    const ocean=new T.Mesh(waterG,new T.ShaderMaterial({
      uniforms:ou,
      vertexShader:`${noiseGLSL}${spectralGLSL}attribute float aSpacing;uniform float uTime;uniform vec2 uOrigin;uniform vec4 uWaves[5];uniform float uFreq[5];varying vec3 vWorld;varying float vHeight;
        void main(){vec3 p=position;p.xz+=uOrigin;float h=0.;
          for(int i=0;i<5;i++){vec4 w=uWaves[i];float wavelength=6.283185/w.y,fade=1.-smoothstep(wavelength*.12,wavelength*.38,aSpacing);float warp=(noise2(p.xz*(.018+float(i)*.004)+vec2(float(i)*13.,float(i)*7.))-.5)*3.4;h+=w.x*sin(dot(p.xz,w.zw)*w.y-uTime*uFreq[i]+warp)*fade;}
          vec4 wind=windSea(p.xz);float detail=1.-smoothstep(1.8,5.5,aSpacing);p.y=h+wind.r*detail;p.xz+=wind.gb*.38*detail;vWorld=p;vHeight=p.y;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
        }`,
      fragmentShader:`${noiseGLSL}${atmosphereGLSL}${spectralGLSL}
        uniform vec4 uWaves[5],uIslands[${P.islands.length}];uniform float uFreq[5],uAngles[${P.islands.length}],uSeeds[${P.islands.length}];uniform vec3 uAircraft;uniform vec2 uForward;
        varying vec3 vWorld;varying float vHeight;
        float specular(vec3 n,vec3 v,vec3 l,float rough){vec3 h=normalize(v+l);float nh=max(dot(n,h),0.);float a=rough*rough;float d=nh*nh*(a*a-1.)+1.;return a*a/(3.141593*d*d+.00002);}
        void main(){
          vec2 p=vWorld.xz;vec3 V=normalize(cameraPosition-vWorld);float dist=length(cameraPosition-vWorld);vec2 slope=vec2(0.);
          for(int i=0;i<5;i++){vec4 w=uWaves[i];float phase=dot(p,w.zw)*w.y-uTime*uFreq[i]+(noise2(p*(.018+float(i)*.004)+vec2(float(i)*13.,float(i)*7.))-.5)*3.4;slope+=w.zw*w.x*w.y*cos(phase)*(1.-smoothstep(.5,2.,length(fwidth(p))*w.y));}
          float close=1.-smoothstep(70.,630.,dist);
          vec2 warped=p+vec2(noise2(p*.087+uTime*.028),noise2(p*.073+23.))*.8;
          float pixelSpan=length(fwidth(p));
          float f1=(1.-smoothstep(.5,2.,pixelSpan*2.5))*close;
          float f2=(1.-smoothstep(.4,1.8,pixelSpan*5.3))*close;
          slope+=vec2(.96,.28)*.020*cos(dot(warped,vec2(.96,.28))*2.5-uTime*3.3)*f1;
          slope+=vec2(-.43,.90)*.012*cos(dot(warped,vec2(-.43,.90))*5.3-uTime*4.7)*f2;
          slope+=vec2(.48,.88)*.025*cos(dot(p,vec2(.48,.88))*.84+noise2(p*.055)*3.-uTime*2.2)*(1.-smoothstep(.8,2.8,pixelSpan*.84));
          slope+=vec2(-.87,.49)*.018*cos(dot(p,vec2(-.87,.49))*1.37+noise2(p*.067+4.)*3.-uTime*2.8)*(1.-smoothstep(.8,2.8,pixelSpan*1.37));
          float grain=fbm2(p*.37+uTime*.075);
          slope+=(vec2(noise2(p*1.45),noise2(p*1.43+17.))-.5)*.03*f1;
          vec4 wind=windSea(p);float windFilter=1.-smoothstep(.7,3.5,pixelSpan*.8);slope+=wind.gb*windFilter;
          // Compression sharpens the face of a crest without a repeating scroll texture.
          slope*=1.+max(wind.r,0.)*.06;
          vec3 N=normalize(vec3(-slope.x,1.,-slope.y));
          float nearCoast=10.;
          for(int i=0;i<${P.islands.length};i++){
            vec2 q=p-uIslands[i].xy;float c=cos(uAngles[i]),s=sin(uAngles[i]);q=vec2(q.x*c+q.y*s,-q.x*s+q.y*c)/uIslands[i].zw;
            float a=atan(q.y,q.x);float edge=.87+.07*sin(a*3.+uSeeds[i])+.045*sin(a*7.+2.)+.018*sin(a*13.);
            nearCoast=min(nearCoast,length(q)-edge);
          }
          float shallow=1.-smoothstep(.0,.28,nearCoast);
          float fresnel=.025+.975*pow(1.-max(dot(N,V),0.),5.);
          vec3 reflected=atmosphere(reflect(-V,N));
          float lit=cloudShadow(p)*mix(.66,1.,uDay);
          vec3 deep=mix(vec3(.007,.029,.045),vec3(.017,.112,.136),uDay);
          vec3 coast=mix(vec3(.013,.061,.078),vec3(.068,.29,.255),uDay);
          vec3 water=mix(deep,coast,shallow*.82)*(.73+.27*lit);
          float scatter=pow(max(dot(V,-uSunDir),0.),4.)*max(vHeight+.4,0.)*.019*uSunPower;
          water+=vec3(.018,.15,.12)*scatter;
          vec3 col=mix(water,reflected*vec3(.79,.91,.97),fresnel*.82);
          float sr=specular(N,V,uSunDir,.24+uWeather*.08);
          float mr=specular(N,V,uMoonDir,.23);
          col+=uSunColor*sr*.34*max(dot(N,uSunDir),0.)*uSunPower*lit;
          col+=vec3(.42,.59,.83)*mr*.17*max(dot(N,uMoonDir),0.)*uMoonPower;
          // Breaking crests and narrow shore wash share the same world coordinates.
          float lace=fbm2(p*1.7+vec2(uTime*.11,0.));
          float crest=wind.a*mix(.38,1.,smoothstep(.25,.75,lace))*(1.-smoothstep(360.,1450.,dist))*.72;
          crest+=smoothstep(1.10,1.82,vHeight)*smoothstep(.58,.78,grain)*close*.17;
          float shore=(1.-smoothstep(.01,.075,abs(nearCoast-.027+.007*sin(uTime*.8+p.x*.04))))*smoothstep(-.015,.015,nearCoast);
          shore*=.14+.32*noise2(p*.13-uTime*.11);
          vec3 foam=mix(vec3(.08,.14,.19),vec3(.57,.68,.64),uDay);
          col=mix(col,foam,clamp(crest+shore,0.,.65));
          vec2 shadowCenter=uAircraft.xz-uSunDir.xz*uAircraft.y/max(.15,uSunDir.y);vec2 ds=p-shadowCenter;
          float shadow=exp(-dot(ds,ds)/24.)*.13*uSunPower*(1.-smoothstep(25.,65.,uAircraft.y));col*=1.-shadow;
          float fog=1.-exp(-dist*mix(.000047,.00014,uWeather));
          vec3 haze=atmosphere(normalize(vec3(vWorld.x-cameraPosition.x,.023*dist,vWorld.z-cameraPosition.z)));
          col=mix(col,haze,fog);
          gl_FragColor=vec4(col,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    }));ocean.frustumCulled=false;ocean.name='World-space spectral ocean';scene.add(ocean);
    // True heightfield islands, including submerged shelves and irregular beaches.
    const land=new T.Group();scene.add(land);
    for(const island of P.islands){
      const n=P.landResolution(island),verts=[],cols=[],idx=[];
      const color=new T.Color();
      for(let iz=0;iz<=n;iz++)for(let ix=0;ix<=n;ix++){
        const lx=(ix/n-.5)*island.rx*2.45,lz=(iz/n-.5)*island.rz*2.45,c=Math.cos(island.angle),s=Math.sin(island.angle);
        const x=island.x+lx*c-lz*s,z=island.z+lx*s+lz*c,h=P.islandHeight(island,x,z);
        verts.push(x,h,z);
        const dx=P.islandHeight(island,x+2,z)-P.islandHeight(island,x-2,z),dz=P.islandHeight(island,x,z+2)-P.islandHeight(island,x,z-2);
        const slope=Math.hypot(dx,dz)/4,nv=P.fbm(x*.023+4,z*.023);
        const habitat=P.vegetationHabitat(island,x,z,h,slope);
        const vegetation=new T.Color().setRGB(.034+nv*.049,.063+nv*.071,.027+nv*.038);
        const rock=new T.Color().setRGB(.15+nv*.18,.157+nv*.17,.139+nv*.15);
        const beach=new T.Color(.40,.375,.283);
        color.copy(vegetation).lerp(rock,P.smooth(.45,1.10,slope)*.94+P.smooth(.70,1.,h/island.height)*.06);
        color.multiplyScalar(1-habitat.cover*.20);
        const beachPatch=P.smooth(.33,.64,P.noise(x*.006+island.seed,z*.006));
        color.lerp(rock,1-P.smooth(0,5,h));color.lerp(beach,(1.-P.smooth(1.8,7,h))*beachPatch);
        if(h<.5)color.multiplyScalar(.7);
        cols.push(color.r,color.g,color.b);
      }
      for(let z=0;z<n;z++)for(let x=0;x<n;x++){const i=z*(n+1)+x;idx.push(i,i+n+1,i+1,i+1,i+n+1,i+n+2);}
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(verts,3));g.setAttribute('color',new T.Float32BufferAttribute(cols,3));g.setIndex(idx);g.computeVertexNormals();
      const material=new T.MeshStandardMaterial({vertexColors:true,roughness:.96,metalness:.015,envMapIntensity:.18});
      material.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,uni);
        shader.vertexShader='varying vec3 vLandWorld;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvLandWorld=(modelMatrix*vec4(position,1.)).xyz;');
        shader.fragmentShader='varying vec3 vLandWorld;\n'+noiseGLSL+atmosphereGLSL+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat rockGrain=fbm2(vLandWorld.xz*.16+vLandWorld.y*.17);float strata=sin(vLandWorld.y*.72+fbm2(vLandWorld.xz*.035)*7.);diffuseColor.rgb*=.70+.40*rockGrain+.055*strata;diffuseColor.rgb*=cloudShadow(vLandWorld.xz)*.30+.70;');
        shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
          float rockH=fbm2(vLandWorld.xz*.29+vLandWorld.y*.08)*.43+sin(vLandWorld.y*1.6+noise2(vLandWorld.xz*.05)*8.)*.035;
          vec3 surf=(viewMatrix*vec4(vLandWorld,1.)).xyz,dx=dFdx(surf),dy=dFdy(surf),r1=cross(dy,normal),r2=cross(normal,dx);float determinant=dot(dx,r1);
          normal=normalize(abs(determinant)*normal-sign(determinant)*(dFdx(rockH)*r1+dFdy(rockH)*r2)*.50);
        `);
      };
      const m=new T.Mesh(g,material);m.name=island.name;land.add(m);
    }
    // Shore boulders; vegetation has its own branching models and leaf geometry.
    const rockGeo=new T.IcosahedronGeometry(1,2);
    for(const geo of [rockGeo]){
      const a=geo.attributes.position;
      for(let i=0;i<a.count;i++){const x=a.getX(i),y=a.getY(i),z=a.getZ(i),f=.84+.29*P.noise(x*4+y*2,z*4-y);a.setXYZ(i,x*f,y*f,z*f);}
      geo.computeVertexNormals();
    }
    const rocks=[],rockRandom=P.rng(634),matrix=new T.Matrix4(),q=new T.Quaternion(),scale=new T.Vector3(),pos=new T.Vector3(),euler=new T.Euler();
    for(const island of P.islands){
      const count=island.rx<150?95:135;
      for(let i=0;i<count;i++){
        const a=rockRandom()*Math.PI*2,edge=.87+.07*Math.sin(a*3+island.seed)+.045*Math.sin(a*7+2)+.018*Math.sin(a*13),r=edge+(rockRandom()-.40)*.054;
        const lx=Math.cos(a)*island.rx*r,lz=Math.sin(a)*island.rz*r,c=Math.cos(island.angle),s=Math.sin(island.angle),x=island.x+lx*c-lz*s,z=island.z+lx*s+lz*c,y=P.islandHeight(island,x,z);
        const size=1.8+rockRandom()*4.9;rocks.push({x,y:y+size*.18,z,sx:size*(.6+rockRandom()),sy:size*(.8+rockRandom()*1.8),sz:size*(.8+rockRandom()),r:rockRandom()*6.28,tone:rockRandom()});
      }
    }
    function instances(geo,items,foliage){
      const mat=new T.MeshStandardMaterial({color:0xffffff,roughness:.97,metalness:.01,envMapIntensity:.11});
      const inst=new T.InstancedMesh(geo,mat,items.length),color=new T.Color();
      items.forEach((v,i)=>{pos.set(v.x,v.y,v.z);scale.set(v.sx,v.sy,v.sz);euler.set(foliage?0:.12*Math.sin(v.r),v.r,foliage?0:.16*Math.cos(v.r));q.setFromEuler(euler);matrix.compose(pos,q,scale);inst.setMatrixAt(i,matrix);const k=v.tone;color.setRGB(foliage?.045+k*.05:.095+k*.10,foliage?.095+k*.08:.11+k*.10,foliage?.049+k*.035:.107+k*.085);inst.setColorAt(i,color);});
      inst.instanceMatrix.needsUpdate=true;inst.instanceColor.needsUpdate=true;inst.computeBoundingSphere();inst.receiveShadow=false;land.add(inst);return inst;
    }
    instances(rockGeo,rocks,false);
    const vegetation=P.createVegetation(scene,renderer,uni);
    // Volume clouds: the ray crosses an ellipsoidal density field in a real 3D box.
    const cloudGroup=new T.Group();scene.add(cloudGroup);const random=P.rng(217);
    const cloudMaterial=new T.ShaderMaterial({transparent:true,side:T.BackSide,depthWrite:false,
      uniforms:{...uni,uCenter:{value:new T.Vector3()},uSize:{value:new T.Vector3()},uDensity:{value:1},uSeed:{value:0}},
      vertexShader:`varying vec3 vLocal;void main(){vLocal=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`${noiseGLSL}${atmosphereGLSL}
        uniform vec3 uCenter,uSize;uniform float uDensity,uSeed;varying vec3 vLocal;
        float density(vec3 p){float shape=1.-dot(p*vec3(.96,1.06,.96),p*vec3(.96,1.06,.96));vec3 q=p*3.6+vec3(uSeed,uTime*.003,0.);float n=noise3(q)*.58+noise3(q*2.04+7.)*.29+noise3(q*4.1)*.13;return smoothstep(.07,.39,shape+(n-.56)*1.95)*uDensity;}
        void main(){
          vec3 ro=(cameraPosition-uCenter)/uSize;vec3 rd=normalize(vLocal-ro);vec3 inv=1./rd;
          vec3 a=(-vec3(1)-ro)*inv,b=(vec3(1)-ro)*inv;vec3 mn=min(a,b),mx=max(a,b);
          float entry=max(max(mn.x,mn.y),mn.z),leave=min(min(mx.x,mx.y),mx.z);entry=max(entry,0.);if(leave<=entry)discard;
          float stepSize=(leave-entry)/20.;float t=entry+stepSize*.5;vec4 sum=vec4(0.);
          vec3 lightDir=normalize(uSunDir/uSize);vec3 dayColor=mix(vec3(.56,.66,.70),vec3(.82,.86,.86),uDay);vec3 nightColor=vec3(.05,.075,.115);
          for(int i=0;i<20;i++){
            vec3 p=ro+rd*t;float d=density(p);if(d>.005){
              float shade=exp(-density(p+lightDir*.20)*1.15);float altitude=clamp(p.y*.48+.56,0.,1.);
              vec3 c=mix(nightColor,dayColor,uDay)*(.59+.35*altitude);
              c+=uSunColor*shade*uSunPower*(.15+.23*altitude)*(1.-uWeather*.25);
              c+=vec3(.08,.12,.19)*uMoonPower*altitude;
              float alpha=(1.-exp(-d*stepSize*2.6));sum.rgb+=(1.-sum.a)*c*alpha;sum.a+=(1.-sum.a)*alpha;if(sum.a>.97)break;
            }t+=stepSize;
          }
          if(sum.a<.008)discard;float dist=length(cameraPosition-uCenter);vec3 col=sum.rgb/max(sum.a,.001);col=mix(col,uHorizon,1.-exp(-dist*.000047));
          gl_FragColor=vec4(col,sum.a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    const box=new T.BoxGeometry(2,2,2);const clouds=[];
    const cloudLayout=[[-2500,660,-3600],[-400,790,-4400],[1800,720,-4300],[3800,670,-3000],[4900,920,-600],[4200,850,2300],[2200,800,3600],[-1200,740,4300],[-2600,750,1300],[-3500,940,-600],[2500,1100,500],[500,1150,-1000]];
    for(let i=0;i<27;i++){
      const x=cloudLayout[i]?.[0]??(-4700+random()*11300),z=cloudLayout[i]?.[2]??(-6100+random()*11300);
      const size=new T.Vector3(330+random()*450,155+random()*155,290+random()*370);
      const center=new T.Vector3(x,cloudLayout[i]?.[1]??(600+random()*510),z);
      const mat=cloudMaterial.clone();mat.uniforms={...uni,uCenter:{value:center},uSize:{value:size},uDensity:{value:1},uSeed:{value:random()*100}};
      const m=new T.Mesh(box,mat);m.position.copy(center);m.scale.copy(size);m.renderOrder=2;m.userData.baseX=x;m.userData.extra=i>11;cloudGroup.add(m);clouds.push(m);
    }
    // Brief, analytic wing-tip wisps have no particle allocations or growing history.
    const mistG=new T.BufferGeometry(),mistPos=new Float32Array(80*3),mistA=new Float32Array(80);
    mistG.setAttribute('position',new T.BufferAttribute(mistPos,3));mistG.setAttribute('aOpacity',new T.BufferAttribute(mistA,1));
    const mist=new T.Points(mistG,new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uDay:uni.uDay},vertexShader:`attribute float aOpacity;varying float vOpacity;void main(){vOpacity=aOpacity;vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(120./max(1.,-p.z),1.,13.);gl_Position=projectionMatrix*p;}`,fragmentShader:`varying float vOpacity;uniform float uDay;void main(){float a=exp(-dot(gl_PointCoord-.5,gl_PointCoord-.5)*15.)*vOpacity;gl_FragColor=vec4(mix(vec3(.13,.20,.28),vec3(.76,.83,.83),uDay),a);}`}));mist.frustumCulled=false;scene.add(mist);
    const oldState=P.makeFlightState(),offset=new T.Vector3();
    const historyTimes=new Float64Array(512),historyDistances=new Float64Array(512),historySpeeds=new Float64Array(512);let historyHead=0,historyCount=0,historyLast=-1;
    // Short refractive-looking exhaust ribbons: subtle light distortion, no rocket flame.
    const heat=new T.Mesh(new T.ConeGeometry(.59,4.3,24,5,true),new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,
      uniforms:{uTime:uni.uTime,uDay:uni.uDay,uThrust:{value:1}},vertexShader:`uniform float uTime;varying vec2 vUv;void main(){vUv=uv;vec3 p=position;p.x+=sin(p.y*8.-uTime*22.)*.012*(1.-uv.y);p.z+=cos(p.y*7.-uTime*19.)*.013*(1.-uv.y);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
      fragmentShader:`${noiseGLSL}uniform float uTime,uDay,uThrust;varying vec2 vUv;void main(){float age=1.-vUv.y;float eddy=fbm2(vec2(vUv.x*9.+age*3.,age*15.-uTime*8.));float shock=.5+.5*sin(age*58.-uTime*4.);float a=exp(-age*5.2)*(.35+.65*eddy)*(.7+.3*shock)*.026*uThrust;vec3 c=mix(vec3(.43,.55,.65),vec3(.69,.46,.24),exp(-age*16.));gl_FragColor=vec4(c*(.45+.55*(1.-uDay)),a);}`
    }));heat.rotation.x=-Math.PI/2;heat.position.z=6.66;
    let envTarget=null,pmrem=null;
    function buildEnvironment(){
      // Once only: a neutral sky/sea light probe supplies soft, rough metal reflections.
      const cv=document.createElement('canvas');cv.width=512;cv.height=256;const c=cv.getContext('2d'),g=c.createLinearGradient(0,0,0,256);
      [[0,'#638397'],[.43,'#aabac0'],[.51,'#e0d7bc'],[.55,'#24474e'],[1,'#132a30']].forEach(([p,col])=>g.addColorStop(p,col));c.fillStyle=g;c.fillRect(0,0,512,256);
      const t=new T.CanvasTexture(cv);t.mapping=T.EquirectangularReflectionMapping;t.colorSpace=T.SRGBColorSpace;
      pmrem=new T.PMREMGenerator(renderer);envTarget=pmrem.fromEquirectangular(t);scene.environment=envTarget.texture;t.dispose();pmrem.dispose();pmrem=null;
    }
    buildEnvironment();
    const colorA=new T.Color(),colorB=new T.Color();
    function blendColor(out,night,day,daylight){colorA.set(night);colorB.set(day);out.copy(colorA).lerp(colorB,daylight);}
    function update(time,hour,weather,camera,state,distance) {
      if(time<historyLast){historyHead=0;historyCount=0;historyLast=-1;}
      if(time>historyLast){historyTimes[historyHead]=time;historyDistances[historyHead]=distance;historySpeeds[historyHead]=state.speed??P.speed;historyHead=(historyHead+1)%512;historyCount=Math.min(512,historyCount+1);historyLast=time;}
      spectrum.update(time,weather);ou.uSpectrumA.value=spectrum.a.texture;ou.uSpectrumB.value=spectrum.b.texture;ou.uSpectrumBlend.value=spectrum.blend;ou.uSpectrumAmplitude.value=spectrum.amplitude;
      uni.uTime.value=time;uni.uWeather.value=weather;
      const angle=(hour-6)/24*Math.PI*2;
      const sunDir=uni.uSunDir.value.set(Math.cos(angle)*.65,Math.sin(angle),Math.cos(angle)*.76).normalize();
      const moonDir=uni.uMoonDir.value.copy(sunDir).negate();moonDir.z+=.07;moonDir.normalize();
      const daylight=P.smooth(-.14,.20,sunDir.y),sunlight=P.smooth(-.04,.12,sunDir.y),moonlight=P.smooth(-.03,.15,moonDir.y)*(1.-daylight*.92);
      uni.uDay.value=daylight;uni.uSunPower.value=sunlight*(1-weather*.55);uni.uMoonPower.value=moonlight*(1-weather*.50);
      vegetation.update(camera,daylight);
      const warm=1.-P.smooth(.03,.48,sunDir.y);
      uni.uSunColor.value.set(0xfff1d9).lerp(colorA.set(0xff9d5a),warm);
      blendColor(uni.uSkyTop.value,0x071222,0x427da5,daylight);
      uni.uSkyTop.value.lerp(colorA.set(0x82949d),weather*.48*daylight);
      blendColor(uni.uHorizon.value,0x182b3d,0xa6bebf,daylight);
      uni.uHorizon.value.lerp(colorA.set(0xe4aa7e),warm*sunlight*.50*(1-weather*.4));
      uni.uHorizon.value.lerp(colorA.set(0x86969b),weather*.36*daylight);
      sky.position.copy(camera.position);
      sun.color.copy(uni.uSunColor.value);sun.intensity=3.1*sunlight*(1-weather*.63);
      sun.position.copy(state.position).addScaledVector(sunDir,80);sun.target.position.copy(state.position);
      moon.intensity=.75*moonlight*(1-weather*.4);moon.position.copy(state.position).addScaledVector(moonDir,90);moon.target.position.copy(state.position);
      ambient.intensity=P.mix(.48,1.65,daylight)*(1-weather*.16);ambient.color.copy(uni.uSkyTop.value).lerp(colorA.set(0xd0dedc),daylight*.58);ambient.color.lerp(colorA.set(0x718da9),1-daylight);ambient.groundColor.set(0x24434a).multiplyScalar(P.mix(.55,1,daylight));
      for(const m of land.children)m.material.envMapIntensity=P.mix(.015,.18,daylight);
      const shade=1-P.smooth(.40,.72,P.fbm(state.position.x*.00055+time*.003,state.position.z*.00055))*P.mix(.23,.61,weather);
      sun.intensity*=shade;
      // Reflective coatings retain their material at night without self-illumination.
      scene.fog.color.copy(uni.uHorizon.value);scene.fog.density=P.mix(.000062,.00016,weather)+(1-daylight)*.000025;
      ou.uOrigin.value.set(camera.position.x,camera.position.z);ou.uAircraft.value.copy(state.position);ou.uForward.value.set(state.forward.x,state.forward.z);
      for(const m of clouds){m.position.x=m.userData.baseX+Math.sin(time*.0007)*135;m.material.uniforms.uCenter.value.copy(m.position);m.material.uniforms.uDensity.value=m.userData.extra?weather*1.1:.68+weather*.50;m.visible=!m.userData.extra||weather>.008;}
      const humidity=weather*.65+.20;const active=P.smooth(.08,.25,Math.abs(state.bank))*humidity;
      mist.visible=active>.012;
      if(mist.visible)for(let i=0;i<80;i++){
        const age=(i%40)/40*.65;
        const visible=time>=age;
        const wanted=time-age;let index=(historyHead+511)%512;let next=index;
        for(let j=0;j<historyCount-1&&historyTimes[index]>wanted;j++){next=index;index=(index+511)%512;}
        const interpolation=P.clamp((wanted-historyTimes[index])/Math.max(.000001,historyTimes[next]-historyTimes[index]),0,1),historicDistance=P.mix(historyDistances[index],historyDistances[next],interpolation),historicSpeed=P.mix(historySpeeds[index],historySpeeds[next],interpolation);
        P.flight(historicDistance,wanted,oldState,historicSpeed);
        offset.set(i<40?-3.88:3.88,-.04,1.02).applyQuaternion(oldState.quaternion).add(oldState.position);
        offset.y+=age*.23;mistPos[i*3]=offset.x;mistPos[i*3+1]=offset.y;mistPos[i*3+2]=offset.z;
        mistA[i]=visible?active*.16*Math.pow(1-age/.65,1.8):0;
      }
      if(mist.visible){mistG.attributes.position.needsUpdate=true;mistG.attributes.aOpacity.needsUpdate=true;}
    }
    function dispose(){envTarget?.dispose();cloudMaterial.dispose();spectrum.dispose();vegetation.dispose();P.setWindSampler(null);}
    return {update,uniforms:uni,sun,moon,ambient,ocean,sky,land,clouds,heat,spectrum,vegetation,dispose};
  };
})();
