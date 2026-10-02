/* Depth-aware heat refraction; only background pixels behind the jet are bent. */
(() => {
 const P=Pelagic,T=THREE;
 P.createOptics=function(renderer,scene,camera,airframe){
  const target=new T.WebGLRenderTarget(1,1,{minFilter:T.LinearFilter,magFilter:T.LinearFilter,type:T.HalfFloatType,depthBuffer:true});target.depthTexture=new T.DepthTexture(1,1,T.UnsignedIntType);
  // Leaf cutouts and small branches need coverage antialiasing before refraction.
  target.samples=Math.min(4,renderer.capabilities.maxSamples||0);
  const uniforms={tScene:{value:target.texture},tDepth:{value:target.depthTexture},uStart:{value:new T.Vector3()},uEnd:{value:new T.Vector3()},uWidths:{value:new T.Vector2()},uTime:{value:0},uThrust:{value:1},uAspect:{value:1}};
  const material=new T.ShaderMaterial({uniforms,depthTest:false,depthWrite:false,
   vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
   fragmentShader:`uniform sampler2D tScene,tDepth;uniform vec3 uStart,uEnd;uniform vec2 uWidths;uniform float uTime,uThrust,uAspect;varying vec2 vUv;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
    float turbulence(vec2 p){return noise(p)*.58+noise(p*2.13+5.)*.28+noise(p*4.23+13.)*.14;}
    void main(){
     vec2 aspect=vec2(uAspect,1.),a=uStart.xy*aspect,b=uEnd.xy*aspect,p=vUv*aspect,axis=b-a;
     float length2=max(dot(axis,axis),.000001),along=dot(p-a,axis)/length2,t=clamp(along,0.,1.);
     float width=mix(uWidths.x,uWidths.y,pow(t,.65));vec2 center=a+axis*t;float radius=length(p-center)/max(width,.00005);
     float envelope=exp(-radius*radius*2.8)*smoothstep(-.07,.05,along)*(1.-smoothstep(.45,1.,along));
     float depth=texture2D(tDepth,vUv).x,plumeDepth=mix(uStart.z,uEnd.z,t),visible=step(plumeDepth-.000007,depth);
     vec2 direction=normalize(axis+vec2(.000001,0.)),perp=vec2(-direction.y,direction.x);
     vec2 q=vec2(dot(p-a,perp)/max(width,.0001)*2.3,t*10.-uTime*11.);
     float n=turbulence(q),nx=turbulence(q+vec2(.11,0.)),ny=turbulence(q+vec2(0.,.11));
     vec2 distortion=(perp*(nx-n)+direction*(ny-n)*.24)*.040*envelope*uThrust*visible;
     vec2 uv=clamp(vUv+distortion/aspect,vec2(.001),vec2(.999));
     if(texture2D(tDepth,uv).x<plumeDepth-.000015)uv=vUv;
     gl_FragColor=vec4(texture2D(tScene,uv).rgb,1.);
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }`
  });
  const postScene=new T.Scene(),postCamera=new T.Camera(),quad=new T.Mesh(new T.PlaneGeometry(2,2),material);postScene.add(quad);
  const start=new T.Vector3(),end=new T.Vector3(),right=new T.Vector3(),widthPoint=new T.Vector3(),size=new T.Vector2();renderer.info.autoReset=false;
  function resize(){renderer.getDrawingBufferSize(size);target.setSize(size.x,size.y);uniforms.uAspect.value=size.x/size.y;}
  function render(time,thrust){
   airframe.updateMatrixWorld(true);start.set(0,0,4.58).applyMatrix4(airframe.matrixWorld);
   const length=Math.min(2.4+thrust*4.8,camera.position.distanceTo(start)*.55);end.set(0,0,4.58+length).applyMatrix4(airframe.matrixWorld);right.set(1,0,0).applyQuaternion(camera.quaternion);
   widthPoint.copy(start).addScaledVector(right,.34).project(camera);uniforms.uStart.value.copy(start).project(camera);const w0=Math.abs(widthPoint.x-uniforms.uStart.value.x)*.5*camera.aspect;
   widthPoint.copy(end).addScaledVector(right,.38+length*.13).project(camera);uniforms.uEnd.value.copy(end).project(camera);const w1=Math.abs(widthPoint.x-uniforms.uEnd.value.x)*.5*camera.aspect;
   uniforms.uStart.value.multiplyScalar(.5).addScalar(.5);uniforms.uEnd.value.multiplyScalar(.5).addScalar(.5);uniforms.uWidths.value.set(w0,w1);uniforms.uThrust.value=thrust;uniforms.uTime.value=time;
   if(uniforms.uStart.value.z<0||uniforms.uStart.value.z>1)uniforms.uThrust.value=0;
   renderer.info.reset();renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.setRenderTarget(null);renderer.render(postScene,postCamera);
  }
  function dispose(){target.dispose();target.depthTexture.dispose();quad.geometry.dispose();material.dispose();}
  resize();return {render,resize,dispose};
 };
})();
