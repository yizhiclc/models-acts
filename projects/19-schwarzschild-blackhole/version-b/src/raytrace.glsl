precision highp float;
varying vec2 vUv;
uniform vec2 uResolution;
uniform vec3 uObserver;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanHalfFov;
uniform float uAspect;
uniform float uStep;
uniform float uScreenOffset;
uniform bool uSupersample;
uniform float uTemperatureScale;
uniform float uOuter;
uniform float uExposure;
uniform int uSpectrum;
uniform bool uDisk;
uniform bool uStars;
uniform bool uProbe;
uniform sampler2D uSky;
uniform sampler2D uThermal;
const float PI = 3.141592653589793;

vec2 rhs(vec2 q) { return vec2(q.y, -q.x + 3.0 * q.x * q.x); }
vec2 advance(vec2 q, float h) {
  vec2 a = rhs(q);
  vec2 b = rhs(q + .5 * h * a);
  vec2 c = rhs(q + .5 * h * b);
  vec2 d = rhs(q + h * c);
  return q + h / 6.0 * (a + 2.0 * b + 2.0 * c + d);
}
float flux(float r) {
  float x = sqrt(r);
  float a = sqrt(6.0), s = sqrt(3.0);
  float integral = x - a - .5 * s * log((x-s)*(a+s)/((x+s)*(a-s)));
  return max(0.0, (3.0 / (8.0 * PI)) * integral / (pow(r, 2.5) * (r-3.0)));
}
vec3 spectrum(float temperature) {
  float t = clamp(log(max(temperature, 500.0) / 500.0) / log(400.0), 0.0, 1.0);
  return texture2D(uThermal, vec2((t * 1023.0 + .5) / 1024.0, .5)).rgb;
}
vec3 emitted(float r, float lambda, float observerF) {
  float omega = inversesqrt(r * r * r);
  float g = sqrt(1.0 - 3.0 / r) / (sqrt(observerF) * (1.0 - omega * lambda));
  float temperature = uTemperatureScale * pow(flux(r), .25);
  float observedT = temperature * g;
  if (uSpectrum == 2) {
    vec3 neutral = vec3(.78, .74, .65);
    return g < 1.0 ? mix(vec3(.75, .075, .018), neutral, clamp((g-.35)/.65, 0.0, 1.0))
                   : mix(neutral, vec3(.06, .35, .95), clamp((g-1.0)/.65, 0.0, 1.0));
  }
  vec3 color = spectrum(observedT);
  if (uSpectrum == 1) {
    float luminance = max(dot(color, vec3(.2126, .7152, .0722)), .00001);
    color = color / luminance * pow(observedT / 20000.0, 4.0);
  }
  return color;
}
vec3 sky(vec3 direction) {
  if (uProbe) return vec3(1.0);
  if (!uStars) return vec3(.00018, .00022, .00030);
  vec2 uv = vec2(atan(direction.z, direction.x)/(2.0*PI)+.5, asin(clamp(direction.y, -1.0, 1.0))/PI+.5);
  return texture2D(uSky, uv).rgb * .48 + vec3(.00018, .00022, .00030);
}
vec3 trace(vec3 direction) {
  float radius = length(uObserver);
  vec3 radial = uObserver / radius;
  float mu = clamp(dot(direction, radial), -1.0, 1.0);
  vec3 tangent = direction - mu * radial;
  float sinAlpha = length(tangent);
  if (sinAlpha < .000001) return mu < 0.0 ? vec3(0.0) : sky(radial);
  tangent /= sinAlpha;
  float observerF = 1.0 - 2.0/radius;
  float impact = radius * sinAlpha / sqrt(observerF);
  // Tracing runs backward from the observer, so the physical photon's Lz/E has the opposite sign.
  float lambda = -impact * cross(radial, tangent).y;
  vec2 q = vec2(1.0/radius, -mu/impact);
  float phi = 0.0;
  float crossing = atan(-radial.y, tangent.y);
  if (crossing < .00001) crossing += PI;
  bool hasCrossing = abs(radial.y) + abs(tangent.y) > .000001;
  for (int i = 0; i < 4096; i++) {
    float h = min(uStep, .04 / max(abs(q.y), .02));
    if (uDisk && hasCrossing) h = min(h, max(crossing - phi, .000001));
    vec2 oldQ = q;
    q = advance(q, h);
    phi += h;
    if (q.x >= .499975) return vec3(0.0);
    if (q.x <= 0.0) {
      float infinityPhi = phi - h * (-q.x) / (oldQ.x - q.x);
      return sky(cos(infinityPhi)*radial + sin(infinityPhi)*tangent);
    }
    if (uDisk && hasCrossing && phi >= crossing - .000002) {
      float r = 1.0 / q.x;
      if (r > 6.0001 && r < uOuter) return emitted(r, lambda, observerF);
      crossing += PI;
    }
    if (phi > 5.0 * PI) return vec3(0.0);
  }
  return vec3(0.0);
}
vec3 toneMap(vec3 x) {
  // The display transform is deliberately separate from the radiative-transfer calculation.
  return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14), 0.0, 1.0);
}
vec3 srgb(vec3 value) {
  return mix(12.92*value, 1.055*pow(max(value, vec3(0.0)), vec3(1.0/2.4))-.055, step(vec3(.0031308), value));
}
vec3 sampleRadiance(vec2 uv) {
  vec2 screen = uv * 2.0 - 1.0;
  screen.x += uScreenOffset;
  vec3 direction = normalize(uForward + screen.x*uAspect*uTanHalfFov*uRight + screen.y*uTanHalfFov*uUp);
  return trace(direction);
}
void main() {
  vec3 radiance;
  if (uSupersample) {
    vec2 d = .25 / uResolution;
    radiance = .25 * (
      sampleRadiance(vUv + vec2(-d.x, -d.y)) +
      sampleRadiance(vUv + vec2( d.x, -d.y)) +
      sampleRadiance(vUv + vec2(-d.x,  d.y)) +
      sampleRadiance(vUv + vec2( d.x,  d.y))
    );
  } else {
    radiance = sampleRadiance(vUv);
  }
  gl_FragColor = vec4(uProbe ? radiance : srgb(toneMap(radiance * uExposure)), 1.0);
}
