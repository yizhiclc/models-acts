export const vertexShader = `
precision highp float;
in vec3 position;
out vec2 vUv;
void main() { vUv=position.xy*.5+.5; gl_Position=vec4(position,1.0); }
`;

export const metricGLSL = `
struct Metric { float r; float f; vec3 l; vec3 dr; vec3 df; vec3 dl0; vec3 dl1; vec3 dl2; };
struct Ray { vec3 x; vec3 p; float t; };
float radiusKerr(vec3 x, float a) {
  float b=dot(x,x)-a*a;
  return sqrt(max(1e-12,.5*(b+sqrt(b*b+4.0*a*a*x.z*x.z))));
}
Metric metric(vec3 x, float a) {
  float a2=a*a, rho2=dot(x,x), z2=x.z*x.z;
  float discriminant=sqrt((rho2-a2)*(rho2-a2)+4.0*a2*z2);
  float r2=max(1e-12,.5*(rho2-a2+discriminant)), r=sqrt(r2);
  float denominator=r2+a2, d=r2*r2+a2*z2;
  Metric m;
  m.r=r;
  m.f=2.0*r*r2/d;
  m.l=vec3(r*x.x+a*x.y,r*x.y-a*x.x,denominator*x.z/r)/denominator;
  m.dr=vec3(x.x*r,x.y*r,x.z*denominator/r)/discriminant;
  m.df=m.f*((3.0/r-4.0*r*r2/d)*m.dr-vec3(0,0,2.0*a2*x.z/d));
  m.dl0=((x.x-2.0*r*m.l.x)*m.dr+vec3(r,a,0))/denominator;
  m.dl1=((x.y-2.0*r*m.l.y)*m.dr+vec3(-a,r,0))/denominator;
  m.dl2=-x.z/r2*m.dr+vec3(0,0,1.0/r);
  return m;
}
Ray derivative(Ray s, float a) {
  Metric m=metric(s.x,a);
  float q=dot(m.l,s.p)-1.0;
  return Ray(s.p-m.f*q*m.l,
    .5*m.df*q*q+m.f*q*(s.p.x*m.dl0+s.p.y*m.dl1+s.p.z*m.dl2),
    -1.0+m.f*q);
}
Ray addRay(Ray a, Ray b, float h) { return Ray(a.x+h*b.x,a.p+h*b.p,a.t+h*b.t); }
Ray advance(Ray s, Ray k1, float a, float h) {
  Ray k2=derivative(addRay(s,k1,h*.5),a);
  Ray k3=derivative(addRay(s,k2,h*.5),a);
  Ray k4=derivative(addRay(s,k3,h),a);
  return Ray(
    s.x+h*(k1.x+2.0*k2.x+2.0*k3.x+k4.x)/6.0,
    s.p+h*(k1.p+2.0*k2.p+2.0*k3.p+k4.p)/6.0,
    s.t+h*(k1.t+2.0*k2.t+2.0*k3.t+k4.t)/6.0);
}
vec4 hermiteWeights(float s) {
  float s2=s*s, s3=s2*s;
  return vec4(2.0*s3-3.0*s2+1.0,s3-2.0*s2+s,-2.0*s3+3.0*s2,s3-s2);
}
vec4 hermiteDerivatives(float s) {
  float s2=s*s;
  return vec4(6.0*s2-6.0*s,3.0*s2-4.0*s+1.0,-6.0*s2+6.0*s,3.0*s2-2.0*s);
}
`;

export const traceShader = `
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;
uniform vec2 uResolution;
uniform vec2 uJitter;
uniform vec3 uCamera;
uniform mat3 uBasis;
uniform float uFov;
uniform float uAspect;
uniform float uSpin;
uniform float uInner;
uniform float uOuter;
uniform float uStep;
uniform int uMaxSteps;
uniform bool uDisk;
${metricGLSL}
const float PI=3.141592653589793;
void main() {
  vec2 screen=(vUv+uJitter/uResolution)*2.0-1.0;
  vec3 worldRay=normalize(uBasis*vec3(screen.x*uAspect*uFov,screen.y*uFov,-1));
  vec3 direction=vec3(worldRay.x,-worldRay.z,worldRay.y);
  float a=uSpin, ro=length(uCamera);
  // Rotate Three.js +Y-up coordinates into Kerr's +Z spin-axis coordinates
  // without changing the observer's physical radius.
  vec3 origin=vec3(uCamera.x,-uCamera.z,uCamera.y);
  Metric initial=metric(origin,a);
  float lapse=sqrt(1.0-initial.f);
  float ln=dot(initial.l,direction);
  vec3 spatial=direction+(lapse-1.0)*ln*initial.l;
  vec3 momentum=(spatial+initial.f*initial.l*(ln-1.0)/lapse)/lapse;
  Ray ray=Ray(origin,momentum,0.0);
  float lz=origin.x*momentum.y-origin.y*momentum.x;
  float rH=1.0+sqrt(1.0-a*a);
  int crossings=0;
  for(int i=0;i<1024;i++) {
    if(i>=uMaxSteps) break;
    Metric m=metric(ray.x,a);
    if(m.r<rH+.015) { fragColor=vec4(-2,0,0,0); return; }
    Ray velocity=derivative(ray,a);
    if(m.r>1000.0) {
      vec3 v=normalize(velocity.x);
      vec3 world=vec3(v.x,v.z,-v.y);
      float phi=atan(world.z,world.x)/(2.0*PI)+.5;
      float theta=acos(clamp(world.y,-1.0,1.0))/PI;
      float q=dot(m.l,ray.p)-1.0;
      float error=abs(dot(ray.p,ray.p)-1.0-m.f*q*q)/(1.0+dot(ray.p,ray.p));
      fragColor=vec4(-1,phi,theta,error);
      return;
    }
    float speed=max(length(velocity.x),.01);
    float h=uStep*m.r/speed;
    float radialVelocity=dot(m.dr,velocity.x);
    if(radialVelocity<0.0) h=min(h,.24*max(m.r-rH,.01)/max(-radialVelocity,.01));
    Ray next=advance(ray,velocity,a,h);
    if(uDisk && ray.x.z*next.x.z<0.0) {
      Ray endVelocity=derivative(next,a);
      vec4 z=vec4(ray.x.z,h*velocity.x.z,next.x.z,h*endVelocity.x.z);
      float f=clamp(ray.x.z/(ray.x.z-next.x.z),0.0,1.0);
      for(int j=0;j<5;j++) {
        float dz=dot(hermiteDerivatives(f),z);
        if(abs(dz)>1e-12) f=clamp(f-dot(hermiteWeights(f),z)/dz,0.0,1.0);
      }
      vec4 w=hermiteWeights(f);
      vec3 hit=w.x*ray.x+w.y*h*velocity.x+w.z*next.x+w.w*h*endVelocity.x;
      float r=radiusKerr(hit,a);
      if(r>uInner+1e-5 && r<=uOuter) {
        float r32=r*sqrt(r), omega=1.0/(r32+a);
        float ut=(r32+a)/(pow(r,.75)*sqrt(max(1e-12,r32-3.0*sqrt(r)+2.0*a)));
        float g=1.0/(lapse*ut*(1.0+omega*lz));
        float flight=-(w.x*ray.t+w.y*h*velocity.t+w.z*next.t+w.w*h*endVelocity.t);
        fragColor=vec4(r+64.0*float(min(crossings,15)),atan(hit.y,hit.x),max(0.0,flight),g);
        return;
      }
      crossings++;
    }
    if(any(isnan(next.x)) || any(isinf(next.x)) || any(isnan(next.p)) || any(isinf(next.p))) break;
    ray=next;
  }
  // -3 is unresolved, distinct from a physically captured ray.
  fragColor=vec4(-3,0,0,0);
}
`;

export const rayShader = `
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uMap;
uniform sampler2D uSpectrum;
uniform sampler2D uFlux;
uniform sampler2D uSky;
uniform float uSpin;
uniform float uInner;
uniform float uTime;
uniform float uTempScale;
uniform float uStructure;
uniform float uSkyStrength;
uniform bool uDelay;
uniform int uMode;
float hash31(vec3 p) {
  p=fract(p*.1031); p+=dot(p,p.yzx+33.33); return fract((p.x+p.y)*p.z);
}
float noise3(vec3 p) {
  vec3 i=floor(p),f=fract(p);
  f=f*f*(3.0-2.0*f);
  return mix(
    mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),
    mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);
}
vec3 blackbody(float t) {
  float p=clamp(log(max(t,200.0)/200.0)/log(10000.0),0.0,1.0)*2047.0;
  int i=clamp(int(p),0,2046);
  return mix(texelFetch(uSpectrum,ivec2(i,0),0).rgb,texelFetch(uSpectrum,ivec2(i+1,0),0).rgb,p-float(i));
}
float flux(float r) {
  float p=clamp(log(r/uInner)/log(48.0/uInner),0.0,1.0)*2047.0;
  int i=clamp(int(p),0,2046);
  return mix(texelFetch(uFlux,ivec2(i,0),0).r,texelFetch(uFlux,ivec2(i+1,0),0).r,p-float(i));
}
vec3 shiftColor(float g) {
  vec3 neutral=vec3(.72,.80,.81);
  return g<1.0?mix(neutral,vec3(1,.13,.035),clamp((1.0-g)/.65,0.0,1.0))
    :mix(neutral,vec3(.035,.36,1),clamp((g-1.0)/.65,0.0,1.0));
}
vec3 orderColor(int order) {
  if(order==0) return vec3(.12,.72,.57);
  if(order==1) return vec3(1,.43,.10);
  if(order==2) return vec3(.20,.45,1);
  return vec3(.9,.2,.53);
}
void main() {
  vec4 hit=texture(uMap,vUv);
  if(hit.x<0.0) {
    vec3 c=vec3(0);
    if(hit.x> -1.5) c=texture(uSky,hit.yz).rgb*uSkyStrength*(uMode==0?1.0:.22);
    if(hit.x< -2.5 && uMode==2) c=vec3(1,.015,.55);
    fragColor=vec4(c,1); return;
  }
  int order=int(floor(hit.x/64.0));
  float r=mod(hit.x,64.0),g=max(hit.w,0.0);
  if(uMode==1) { fragColor=vec4(shiftColor(g),1); return; }
  if(uMode==2) { fragColor=vec4(orderColor(order),1); return; }
  float emittedTime=uTime-(uDelay?hit.z:0.0);
  float omega=1.0/(pow(r,1.5)+uSpin);
  float phase=hit.y-omega*emittedTime;
  vec3 cell=vec3(cos(phase)*r*1.6,sin(phase)*r*1.6,r*1.8);
  float n=noise3(cell)*.54+noise3(cell*2.13)*.29+noise3(cell*4.37)*.17;
  float rings=sin(r*12.0+2.0*sin(phase*7.0+r*.55))*.12;
  float modulation=max(.15,1.0+uStructure*(1.8*(n-.5)+rings));
  float t=uTempScale*pow(max(0.0,flux(r)*modulation),.25);
  fragColor=vec4(min(blackbody(t*g),vec3(30000)),1);
}
`;

export const accumulationShader = `
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uCurrent;
uniform sampler2D uHistory;
uniform float uWeight;
void main() {
  if(uWeight>=1.0) fragColor=texture(uCurrent,vUv);
  else fragColor=mix(texture(uHistory,vUv),texture(uCurrent,vUv),uWeight);
}
`;
export const blurShader = `
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uImage;
uniform vec2 uStep;
uniform bool uExtract;
vec3 sampleHDR(vec2 uv) { vec3 c=texture(uImage,uv).rgb; return uExtract?max(c-vec3(.8),vec3(0)):c; }
void main() {
  vec3 c=sampleHDR(vUv)*.227027;
  c+=(sampleHDR(vUv+uStep*1.384615)+sampleHDR(vUv-uStep*1.384615))*.316216;
  c+=(sampleHDR(vUv+uStep*3.230769)+sampleHDR(vUv-uStep*3.230769))*.070270;
  fragColor=vec4(c,1);
}
`;
export const displayShader = `
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uImage;
uniform sampler2D uBloom;
uniform float uExposure;
uniform float uBloomAmount;
uniform int uMode;
vec3 srgb(vec3 c) {
  return mix(12.92*c,1.055*pow(max(c,vec3(0)),vec3(1.0/2.4))-.055,step(vec3(.0031308),c));
}
void main() {
  vec3 c=texture(uImage,vUv).rgb;
  if(uMode==0) {
    c=(c+texture(uBloom,vUv).rgb*uBloomAmount)*uExposure;
    c=clamp((c*(2.51*c+.03))/(c*(2.43*c+.59)+.14),0.0,1.0);
  }
  fragColor=vec4(srgb(c),1);
}
`;
