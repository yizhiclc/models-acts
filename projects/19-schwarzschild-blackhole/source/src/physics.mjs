export const G = 6.67430e-11;
export const C = 299792458;
export const MSUN = 1.98847e30;
export const YEAR = 31557600;
export const SIGMA = 5.670374419e-8;
export const BC = 3 * Math.sqrt(3);
export const B6 = Math.sqrt(54);
export const R_IN = 6;
export const TABLE = Object.freeze({
  width: 4096,
  height: 1024,
  bMin: 0.02,
  bMax: 220,
  focus: 1e-5,
  phiMax: Math.PI,
});
export const S_MIN = Math.asinh((TABLE.bMin - BC) / TABLE.focus);
export const S_MAX = Math.asinh((TABLE.bMax - BC) / TABLE.focus);

export function impactAt(index, width = TABLE.width) {
  return BC + TABLE.focus * Math.sinh(S_MIN + (S_MAX - S_MIN) * index / (width - 1));
}

export function impactIndex(b, width = TABLE.width) {
  return (Math.asinh((b - BC) / TABLE.focus) - S_MIN) / (S_MAX - S_MIN) * (width - 1);
}

export function tortoise(r) {
  return r + 2 * Math.log(r / 2 - 1);
}

// Schwarzschild null geodesic in its orbital plane, with G = c = M = 1.
// D is the regularized coordinate flight time t + r*, finite at infinity.
export function derivative([u, v], b) {
  return [v, 3 * u * u - u, b / (1 + b * v)];
}

export function rk4(state, b, h) {
  const k1 = derivative(state, b);
  const y2 = state.map((x, i) => x + h * k1[i] * 0.5);
  const k2 = derivative(y2, b);
  const y3 = state.map((x, i) => x + h * k2[i] * 0.5);
  const k3 = derivative(y3, b);
  const y4 = state.map((x, i) => x + h * k3[i]);
  const k4 = derivative(y4, b);
  return state.map((x, i) => x + h * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) / 6);
}

export function invariant([u, v], b) {
  return v * v + u * u - 2 * u * u * u - 1 / (b * b);
}

function adaptiveSimpson(f, a, b, tolerance, depth = 24) {
  const c = (a + b) / 2;
  const fa = f(a), fc = f(c), fb = f(b);
  const whole = (b - a) * (fa + 4 * fc + fb) / 6;
  function recurse(left, right, fl, fm, fr, estimate, eps, remaining) {
    const mid = (left + right) / 2;
    const f1 = f((left + mid) / 2), f2 = f((mid + right) / 2);
    const l = (mid - left) * (fl + 4 * f1 + fm) / 6;
    const r = (right - mid) * (fm + 4 * f2 + fr) / 6;
    const delta = l + r - estimate;
    if (remaining <= 0 || Math.abs(delta) < 15 * eps) return l + r + delta / 15;
    return recurse(left, mid, fl, f1, fm, l, eps / 2, remaining - 1) +
      recurse(mid, right, fm, f2, fr, r, eps / 2, remaining - 1);
  }
  return recurse(a, b, fa, fc, fb, whole, tolerance, depth);
}

export function turningPoint(b) {
  if (b <= BC) return null;
  const theta = Math.acos(Math.max(-1, Math.min(1, 1 - 54 / (b * b)))) / 3;
  const uA = 1 / 6 + Math.cos(theta + 4 * Math.PI / 3) / 3;
  const uB = 1 / 6 + Math.cos(theta) / 3;
  const uN = 1 / 6 + Math.cos(theta + 2 * Math.PI / 3) / 3;
  // u = uA (1 - s^2) removes the square-root singularity at periapsis.
  const integrand = (s, delay) => {
    const u = uA * (1 - s * s);
    const root = Math.sqrt(2 * uA * (uB - u) * (u - uN));
    const dPhi = 2 * uA / root;
    return delay ? dPhi * b / (1 + b * s * root) : dPhi;
  };
  return {
    u: uA,
    r: 1 / uA,
    phi: adaptiveSimpson(s => integrand(s, false), 0, 1, 2e-11),
    delay: adaptiveSimpson(s => integrand(s, true), 0, 1, 2e-10),
  };
}

export const GAUSS_X = [
  0.0198550717512319, 0.1016667612931866, 0.2372337950418355, 0.4082826787521751,
  0.5917173212478249, 0.7627662049581645, 0.8983332387068134, 0.9801449282487681,
];
export const GAUSS_W = [
  0.0506142681451881, 0.1111905172266873, 0.1568533229389437, 0.181341891689181,
  0.181341891689181, 0.1568533229389437, 0.1111905172266873, 0.0506142681451881,
];

export function observerIntegrals(b, r) {
  let phi = 0, delay = 0;
  for (let i = 0; i < 8; i++) {
    const u = GAUSS_X[i] / r;
    const q = Math.sqrt(1 - b * b * u * u * (1 - 2 * u));
    phi += GAUSS_W[i] * b / q / r;
    delay += GAUSS_W[i] * b * b / (q * (1 + q)) / r;
  }
  return { phi, delay };
}

// Exact zero-torque Novikov-Thorne radial flux factor for a* = 0.
export function fluxShape(r) {
  if (r <= 6) return 0;
  const x = Math.sqrt(r), x0 = Math.sqrt(6), a = Math.sqrt(3);
  const bracket = x - x0 - a / 2 * Math.log((x - a) * (x0 + a) / ((x + a) * (x0 - a)));
  return Math.max(0, bracket / (x * (r - 3) * r * r));
}

export function temperatureScale(massSolar, rateSolarYear) {
  const mass = massSolar * MSUN, rate = rateSolarYear * MSUN / YEAR;
  return (3 * C ** 6 * rate / (8 * Math.PI * G * G * mass * mass * SIGMA)) ** 0.25;
}

export function peakTemperature(massSolar, rateSolarYear) {
  let best = 0;
  for (let r = 6; r < 30; r += 0.01) best = Math.max(best, fluxShape(r));
  return temperatureScale(massSolar, rateSolarYear) * best ** 0.25;
}

// lambda is the forward photon's L_z / E. The renderer reverses its traced ray.
export function redshift(r, lambda, observerRadius) {
  return Math.sqrt(1 - 3 / r) /
    (Math.sqrt(1 - 2 / observerRadius) * (1 - lambda / r ** 1.5));
}

export function sampleTable(radial, metadata, b, phi) {
  const { width, height, phiMax } = TABLE;
  const px = Math.max(0, Math.min(width - 1.000001, impactIndex(b)));
  const py = Math.max(0, Math.min(height - 1.000001, phi / phiMax * (height - 1)));
  const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy;
  const sample = (x, y, c) => radial[2 * (y * width + x) + c];
  const result = [0, 0];
  for (let c = 0; c < 2; c++) {
    const a = sample(ix, iy, c) * (1 - fy) + sample(ix, iy + 1, c) * fy;
    const d = sample(ix + 1, iy, c) * (1 - fy) + sample(ix + 1, iy + 1, c) * fy;
    result[c] = a * (1 - fx) + d * fx;
  }
  return result;
}
