export const G = 6.67430e-11;
export const C = 299792458;
export const MSUN = 1.98847e30;
export const YEAR = 31557600;
export const SIGMA = 5.670374419e-8;
export const MAX_SPIN = 0.998;
export const FLUX_COUNT = 2048;
export const FLUX_OUTER = 48;
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const norm = a => Math.hypot(...a);

export function horizon(a) { return 1 + Math.sqrt(1 - a * a); }

// The disk angular momentum is positive; negative a describes counter-rotation.
export function isco(a) {
  const z1 = 1 + Math.cbrt(1 - a * a) * (Math.cbrt(1 + a) + Math.cbrt(1 - a));
  const z2 = Math.sqrt(3 * a * a + z1 * z1);
  return 3 + z2 - Math.sign(a) * Math.sqrt((3 - z1) * (3 + z1 + 2 * z2));
}

export function circularOrbit(r, a) {
  const s = Math.sqrt(r), r32 = r * s, k = r32 - 3 * s + 2 * a;
  const denominator = r ** .75 * Math.sqrt(k);
  const omega = 1 / (r32 + a);
  const energy = (r32 - 2 * s + a) / denominator;
  const numerator = r * r - 2 * a * s + a * a;
  const angularMomentum = numerator / denominator;
  const dLogDenominator = .75 / r + .75 * (s - 1 / s) / k;
  const dAngularMomentum = (2 * r - a / s - numerator * dLogDenominator) / denominator;
  const ut = (r32 + a) / denominator;
  return { omega, energy, angularMomentum, dAngularMomentum, ut };
}

export function makeFluxTable(a) {
  const inner = isco(a), extent = Math.log(FLUX_OUTER / inner);
  const data = new Float32Array(FLUX_COUNT * 4);
  const integrand = r => {
    const o = circularOrbit(r, a);
    return Math.max(0, o.dAngularMomentum / o.ut);
  };
  let integral = 0, previousR = inner, peak = 0;
  for (let i = 0; i < FLUX_COUNT; i++) {
    const r = inner * Math.exp(extent * i / (FLUX_COUNT - 1));
    if (i) {
      const mid = (r + previousR) / 2;
      integral += (r - previousR) / 6 * (integrand(previousR) + 4 * integrand(mid) + integrand(r));
    }
    const orbit = circularOrbit(r, a);
    const negativeOmegaDerivative = 1.5 * Math.sqrt(r) * orbit.omega ** 2;
    const shape = (2 / 3) * negativeOmegaDerivative * integral * orbit.ut ** 2 / r;
    data[4 * i] = shape;
    data[4 * i + 1] = orbit.omega;
    data[4 * i + 2] = orbit.ut;
    data[4 * i + 3] = 1;
    peak = Math.max(peak, shape);
    previousR = r;
  }
  return { data, inner, peak, extent };
}

export function temperatureScale(massSolar, rateSolarYear) {
  const mass = massSolar * MSUN, rate = rateSolarYear * MSUN / YEAR;
  return (3 * C ** 6 * rate / (8 * Math.PI * G * G * mass * mass * SIGMA)) ** .25;
}

export function kerrMetric(x, a) {
  const a2 = a * a, rho2 = dot(x, x), z2 = x[2] * x[2];
  const discriminant = Math.sqrt((rho2 - a2) ** 2 + 4 * a2 * z2);
  const r2 = .5 * (rho2 - a2 + discriminant), r = Math.sqrt(r2);
  const denominator = r2 + a2, d = r2 * r2 + a2 * z2;
  const f = 2 * r * r2 / d;
  const l = [(r * x[0] + a * x[1]) / denominator, (r * x[1] - a * x[0]) / denominator, x[2] / r];
  const dr = [x[0] * r / discriminant, x[1] * r / discriminant, x[2] * denominator / (r * discriminant)];
  const df = dr.map((v, i) => f * ((3 / r - 4 * r * r2 / d) * v - (i === 2 ? 2 * a2 * x[2] / d : 0)));
  const dl = [
    dr.map((v, i) => ((x[0] - 2 * r * l[0]) * v + (i === 0 ? r : i === 1 ? a : 0)) / denominator),
    dr.map((v, i) => ((x[1] - 2 * r * l[1]) * v + (i === 0 ? -a : i === 1 ? r : 0)) / denominator),
    dr.map((v, i) => -x[2] * v / r2 + (i === 2 ? 1 / r : 0)),
  ];
  return { r, f, l, dr, df, dl };
}

// Past-directed rays have p_t = +1. This fixes an affine scale, not a time step.
export function hamiltonian(x, p, a) {
  const { f, l } = kerrMetric(x, a);
  return .5 * (dot(p, p) - 1 - f * (dot(l, p) - 1) ** 2);
}

export function rhs(state, a) {
  const x = state.slice(0, 3), p = state.slice(3, 6);
  const m = kerrMetric(x, a), q = dot(m.l, p) - 1;
  const dx = p.map((v, i) => v - m.f * q * m.l[i]);
  const dp = m.df.map((v, i) => .5 * v * q * q + m.f * q * (p[0] * m.dl[0][i] + p[1] * m.dl[1][i] + p[2] * m.dl[2][i]));
  return [...dx, ...dp, -1 + m.f * q];
}

export function rk4(state, a, h) {
  const k1 = rhs(state, a);
  const k2 = rhs(state.map((v, i) => v + .5 * h * k1[i]), a);
  const k3 = rhs(state.map((v, i) => v + .5 * h * k2[i]), a);
  const k4 = rhs(state.map((v, i) => v + h * k3[i]), a);
  return state.map((v, i) => v + h * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) / 6);
}

export function launch(x, direction, a) {
  const n = direction.map(v => v / norm(direction));
  const m = kerrMetric(x, a), lapse = Math.sqrt(1 - m.f);
  const s = dot(m.l, n);
  const spatial = n.map((v, i) => v + (lapse - 1) * s * m.l[i]);
  const p = spatial.map((v, i) => (v + m.f * m.l[i] * (s - 1) / lapse) / lapse);
  return [...x, ...p, 0];
}

export function constants(state, a) {
  const x = state.slice(0, 3), p = state.slice(3, 6);
  const { r } = kerrMetric(x, a);
  const cos = x[2] / r, sin = Math.sqrt(Math.max(1e-20, 1 - cos * cos));
  const phi = Math.atan2(x[1], x[0]), scale = Math.sqrt(r * r + a * a);
  const thetaVector = [scale * cos * Math.cos(phi), scale * cos * Math.sin(phi), -r * sin];
  const pTheta = dot(p, thetaVector), lz = x[0] * p[1] - x[1] * p[0];
  return { h: hamiltonian(x, p, a), lz, carter: pTheta * pTheta + cos * cos * (lz * lz / (sin * sin) - a * a) };
}

export function frequencyShift(r, pastLz, observerLapse, a) {
  const { omega, ut } = circularOrbit(r, a);
  return 1 / (observerLapse * ut * (1 + omega * pastLz));
}

export function traceReference(initial, a, step = .025, { disk = true, outer = 28, maxSteps = 12000 } = {}) {
  let state = [...initial], crossings = 0, maxH = 0, maxLz = 0, maxCarter = 0;
  const c0 = constants(initial, a), inner = isco(a), rH = horizon(a);
  for (let i = 0; i < maxSteps; i++) {
    const m = kerrMetric(state.slice(0, 3), a);
    const d = rhs(state, a);
    const h = step * m.r / Math.max(norm(d.slice(0, 3)), .01);
    const next = rk4(state, a, h);
    if (disk && state[2] * next[2] < 0) {
      let lo = 0, hi = h, hit = next;
      for (let j = 0; j < 24; j++) {
        const mid = (lo + hi) / 2;
        hit = rk4(state, a, mid);
        if (hit[2] * state[2] > 0) lo = mid; else hi = mid;
      }
      const r = kerrMetric(hit.slice(0, 3), a).r;
      if (r > inner && r <= outer) return { kind: 'disk', r, state: hit, steps: i + 1, crossings, maxH, maxLz, maxCarter };
      crossings++;
    }
    state = next;
    const r = kerrMetric(state.slice(0, 3), a).r;
    if (r < rH + .015) return { kind: 'captured', state, steps: i + 1 };
    const c = constants(state, a);
    maxH = Math.max(maxH, Math.abs(c.h));
    maxLz = Math.max(maxLz, Math.abs(c.lz - c0.lz));
    maxCarter = Math.max(maxCarter, Math.abs(c.carter - c0.carter));
    if (r > 1000) return { kind: 'sky', state, steps: i + 1, maxH, maxLz, maxCarter };
  }
  return { kind: 'unresolved', state };
}
