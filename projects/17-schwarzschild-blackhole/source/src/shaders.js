export const vertexShader = `
precision highp float;
in vec3 position;
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position, 1.0);
}
`;

export const rayShader = `
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uRadial;
uniform sampler2D uMeta;
uniform sampler2D uSpectrum;
uniform sampler2D uSky;
uniform vec2 uResolution;
uniform vec2 uJitter;
uniform vec3 uCamera;
uniform mat3 uBasis;
uniform float uFov;
uniform float uAspect;
uniform float uTime;
uniform float uTempScale;
uniform float uOuter;
uniform float uStructure;
uniform float uSkyStrength;
uniform float uSMin;
uniform float uSMax;
uniform bool uDisk;
uniform bool uDelay;
uniform int uMode;
const float PI = 3.141592653589793;
const float BC = 5.196152422706632;
const float W = 4096.0;
const float H = 1024.0;
const float G_X[8] = float[8](
  0.01985507175, 0.1016667613, 0.2372337950, 0.4082826788,
  0.5917173212, 0.7627662050, 0.8983332387, 0.9801449282
);
const float G_W[8] = float[8](
  0.05061426815, 0.1111905172, 0.1568533229, 0.1813418917,
  0.1813418917, 0.1568533229, 0.1111905172, 0.05061426815
);

float asinhSafe(float x) {
  return sign(x) * log(abs(x) + sqrt(x*x + 1.0));
}
float rstar(float r) {
  return r + 2.0 * log(r * 0.5 - 1.0);
}
vec2 observer(float b, float r) {
  vec2 result = vec2(0.0);
  for (int i = 0; i < 8; i++) {
    float u = G_X[i] / r;
    float q = sqrt(max(1e-8, 1.0 - b*b*u*u*(1.0-2.0*u)));
    result += G_W[i] / r * vec2(b/q, b*b/(q*(1.0+q)));
  }
  return result;
}
vec2 pathAt(float bx, float phi) {
  vec2 p = vec2(bx, clamp(phi/PI, 0.0, 1.0)*(H-1.0));
  ivec2 base = ivec2(floor(p));
  base = clamp(base, ivec2(0), ivec2(4094, 1022));
  vec2 f = p - vec2(base);
  vec2 a = mix(texelFetch(uRadial, base, 0).rg, texelFetch(uRadial, base+ivec2(1,0), 0).rg, f.x);
  vec2 d = mix(texelFetch(uRadial, base+ivec2(0,1), 0).rg, texelFetch(uRadial, base+ivec2(1,1), 0).rg, f.x);
  return mix(a, d, f.y);
}
vec4 periapsis(float bx) {
  int x = clamp(int(floor(bx)), 0, 4094);
  vec4 a = texelFetch(uMeta, ivec2(x,0),0);
  vec4 b = texelFetch(uMeta, ivec2(x+1,0),0);
  // Never interpolate the discrete captured/escaping classification.
  if (a.x < 0.0 && b.x > 0.0) return b;
  return mix(a, b, bx-float(x));
}
vec3 blackbody(float t) {
  float p = clamp(log(max(t,200.0)/200.0)/log(10000.0),0.0,1.0)*2047.0;
  int i = clamp(int(p), 0, 2046);
  return mix(texelFetch(uSpectrum,ivec2(i,0),0).rgb,texelFetch(uSpectrum,ivec2(i+1,0),0).rgb,p-float(i));
}
float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x+p.y)*p.z);
}
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  return mix(
    mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),
    mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),
    f.z);
}
float flux(float r) {
  float x = sqrt(r);
  float a = 1.7320508075688772, x0 = 2.449489742783178;
  float bracket = x-x0-0.5*a*log((x-a)*(x0+a)/((x+a)*(x0-a)));
  return max(0.0,bracket/(x*(r-3.0)*r*r));
}
vec3 shiftColor(float g) {
  vec3 neutral = vec3(0.72,0.80,0.81);
  return g < 1.0 ? mix(neutral, vec3(1.0,0.13,0.035),clamp((1.0-g)/0.5,0.0,1.0))
    : mix(neutral,vec3(0.035,0.36,1.0),clamp((g-1.0)/0.5,0.0,1.0));
}
vec3 orderColor(int order) {
  if (order==0) return vec3(0.12,0.72,0.57);
  if (order==1) return vec3(1.0,0.43,0.10);
  if (order==2) return vec3(0.20,0.45,1.0);
  return vec3(0.9,0.2,0.53);
}
vec3 diskEmission(float r, vec3 p, float bY, float flight, int order) {
  float g = sqrt(1.0-3.0/r)/(sqrt(1.0-2.0/length(uCamera))*(1.0+bY/pow(r,1.5)));
  if (uMode==1) return shiftColor(g);
  if (uMode==2) return orderColor(order);
  float emittedTime = uTime - (uDelay ? flight : 0.0);
  float phase = atan(p.z,p.x) + emittedTime/pow(r,1.5);
  // A passively advected emissivity perturbation, not a fluid solution.
  vec3 cell = vec3(cos(phase),sin(phase),0.0)*r*1.6;
  cell.z = r*1.8;
  float perturbation = noise3(cell)*0.54 + noise3(cell*2.13)*0.29 + noise3(cell*4.37)*0.17;
  float rings = sin(r*12.0+2.0*sin(phase*7.0+r*0.55))*0.12;
  float modulation = 1.0 + uStructure*(1.8*(perturbation-0.5)+rings);
  float t = uTempScale*pow(flux(r)*max(0.15,modulation),0.25);
  return blackbody(t*g);
}

void main() {
  vec2 screen = (vUv + uJitter/uResolution)*2.0-1.0;
  vec3 ray = normalize(uBasis * vec3(screen.x*uAspect*uFov, screen.y*uFov,-1.0));
  float rO = length(uCamera);
  vec3 eR = uCamera/rO;
  float nr = dot(ray,eR);
  vec3 tangent = ray - nr*eR;
  float nt = length(tangent);
  vec3 eT = tangent/max(nt,1e-8);
  float b = rO*nt/sqrt(1.0-2.0/rO);
  if (b < 0.02001) { fragColor=vec4(0,0,0,1); return; }
  float bx = clamp((asinhSafe((b-BC)/1e-5)-uSMin)/(uSMax-uSMin)*(W-1.0),0.0,W-1.0001);
  vec4 turn = periapsis(bx);
  vec2 obs = observer(b,rO);
  float endPhi = b > BC ? 2.0*turn.x-obs.x : 100.0;
  float bY = b*cross(eR,eT).y;
  float first = mod(atan(-eR.y,eT.y),PI);
  if (first < 1e-5) first += PI;
  bool equatorial = abs(eR.y)+abs(eT.y)<1e-6;

  if (uDisk && !equatorial) {
    for (int order=0; order<8; order++) {
      float phi = first+float(order)*PI;
      if (phi >= endPhi) break;
      float absPhi = phi+obs.x;
      bool outbound = b>BC && absPhi>turn.x;
      float lookupPhi = outbound ? 2.0*turn.x-absPhi : absPhi;
      if (lookupPhi <= 0.0 || lookupPhi >= PI) continue;
      vec2 state = pathAt(bx,lookupPhi);
      float r = 1.0/max(state.x,1e-12);
      if (r < 6.00005 || r > uOuter) continue;
      vec3 position = (cos(phi)*eR+sin(phi)*eT)*r;
      float delay = outbound ? 2.0*turn.y-state.y+2.0*(rstar(r)-turn.z) : state.y;
      float flight = max(0.0,delay-obs.y+rstar(rO)-rstar(r));
      fragColor = vec4(diskEmission(r,position,bY,flight,order),1);
      return;
    }
  }
  if (b <= BC) { fragColor=vec4(0,0,0,1); return; }
  vec3 skyDirection = cos(endPhi)*eR+sin(endPhi)*eT;
  vec2 skyUV = vec2(atan(skyDirection.z,skyDirection.x)/(2.0*PI)+0.5,acos(clamp(skyDirection.y,-1.0,1.0))/PI);
  vec3 sky = texture(uSky,skyUV).rgb*uSkyStrength;
  if (uMode != 0) sky *= 0.22;
  fragColor=vec4(sky,1);
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
  fragColor=mix(texture(uHistory,vUv),texture(uCurrent,vUv),uWeight);
}
`;

export const blurShader = `
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uImage;
uniform vec2 uStep;
uniform bool uExtract;
vec3 sampleHDR(vec2 uv) {
  vec3 c = texture(uImage,uv).rgb;
  return uExtract ? max(c-vec3(0.8),vec3(0.0)) : c;
}
void main() {
  vec3 c = sampleHDR(vUv)*0.227027;
  c += (sampleHDR(vUv+uStep*1.384615)+sampleHDR(vUv-uStep*1.384615))*0.316216;
  c += (sampleHDR(vUv+uStep*3.230769)+sampleHDR(vUv-uStep*3.230769))*0.070270;
  fragColor=vec4(c,1.0);
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
  return mix(12.92*c,1.055*pow(max(c,vec3(0.0)),vec3(1.0/2.4))-0.055,step(vec3(0.0031308),c));
}
void main() {
  vec3 c = texture(uImage,vUv).rgb;
  if (uMode==0) {
    c = (c+texture(uBloom,vUv).rgb*uBloomAmount)*uExposure;
    // Global exposure and ACES-fit display transform, not extra lens emission.
    c = clamp((c*(2.51*c+0.03))/(c*(2.43*c+0.59)+0.14),0.0,1.0);
  }
  fragColor=vec4(srgb(c),1.0);
}
`;
