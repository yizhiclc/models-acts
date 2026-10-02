export const G = 6.67430e-11;
export const C = 299792458;
export const SOLAR_MASS = 1.98847e30;
export const YEAR = 365.25 * 86400;
export const SIGMA = 5.670374419e-8;
export const MASS = 1e9 * SOLAR_MASS;
export const CRITICAL_IMPACT = 3 * Math.sqrt(3);

// Schwarzschild specialization of the zero-torque Novikov-Thorne flux.
export function diskFluxFactor(r) {
  if (r <= 6) return 0;
  const x = Math.sqrt(r), a = Math.sqrt(6), s = Math.sqrt(3);
  const integral = x - a - s / 2 * Math.log((x - s) * (a + s) / ((x + s) * (a - s)));
  return Math.max(0, 3 / (8 * Math.PI) * integral / (r ** 2.5 * (r - 3)));
}
export function diskTemperature(r, rate = .2, mass = MASS) {
  const mdot = rate * SOLAR_MASS / YEAR;
  return (diskFluxFactor(r) * mdot * C ** 6 / (G * G * mass * mass * SIGMA)) ** .25;
}
export function frequencyShift(r, lambda, observerRadius) {
  return Math.sqrt(1 - 3 / r) / (Math.sqrt(1 - 2 / observerRadius) * (1 - lambda / r ** 1.5));
}
export function impactParameter(radius, radialCosine) {
  return radius * Math.sqrt(Math.max(0, 1 - radialCosine ** 2)) / Math.sqrt(1 - 2 / radius);
}
export function rk4(u, p, h) {
  const acceleration = value => -value + 3 * value * value;
  const k1u = p, k1p = acceleration(u);
  const k2u = p + .5 * h * k1p, k2p = acceleration(u + .5 * h * k1u);
  const k3u = p + .5 * h * k2p, k3p = acceleration(u + .5 * h * k2u);
  const k4u = p + h * k3p, k4p = acceleration(u + h * k3u);
  return [u + h / 6 * (k1u + 2 * k2u + 2 * k3u + k4u), p + h / 6 * (k1p + 2 * k2p + 2 * k3p + k4p)];
}
export function traceVacuum(b, step = .008, radius = 10000) {
  let u = 1 / radius, p = Math.sqrt(1 / (b * b) - u * u + 2 * u ** 3), phi = 0;
  let maxResidual = 0;
  for (let i = 0; i < 18000; i++) {
    const h = Math.min(step, .04 / Math.max(Math.abs(p), .02));
    const oldU = u;
    [u, p] = rk4(u, p, h);
    phi += h;
    maxResidual = Math.max(maxResidual, Math.abs(b * b * (p * p + u * u - 2 * u ** 3) - 1));
    if (u >= 1 / 2.0001) return { captured: true, phi, maxResidual };
    if (u <= 0) return { captured: false, phi: phi - h * (-u) / (oldU - u), maxResidual };
  }
  return { unresolved: true, phi, maxResidual };
}

// Wyman et al. (2013) analytic fits to the CIE 1931 color-matching functions.
function cie(wavelength) {
  const g = (center, left, right) => {
    const t = (wavelength - center) * (wavelength < center ? left : right);
    return Math.exp(-.5 * t * t);
  };
  return [
    .362 * g(442, .0624, .0374) + 1.056 * g(599.8, .0264, .0323) - .065 * g(501.1, .049, .0382),
    .821 * g(568.8, .0213, .0247) + .286 * g(530.9, .0613, .0322),
    1.217 * g(437, .0845, .0278) + .681 * g(459, .0385, .0725),
  ];
}
export function blackbodyXYZ(temperature) {
  const xyz = [0, 0, 0];
  for (let wavelength = 380; wavelength <= 780; wavelength += 5) {
    const lambda = wavelength * 1e-9;
    const radiance = 1.191042972e-16 / (lambda ** 5 * Math.expm1(.01438776877 / (lambda * temperature)));
    const matching = cie(wavelength);
    const weight = wavelength === 380 || wavelength === 780 ? .5 : 1;
    for (let channel = 0; channel < 3; channel++) xyz[channel] += matching[channel] * radiance * 5e-9 * weight;
  }
  return xyz;
}
export function makeSpectrumTable(count = 1024) {
  const referenceY = blackbodyXYZ(20000)[1];
  const data = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const temperature = 500 * (200000 / 500) ** (i / (count - 1));
    const [x, y, z] = blackbodyXYZ(temperature).map(value => value / referenceY);
    data[i * 4] = Math.max(0, 3.2406 * x - 1.5372 * y - .4986 * z);
    data[i * 4 + 1] = Math.max(0, -.9689 * x + 1.8758 * y + .0415 * z);
    data[i * 4 + 2] = Math.max(0, .0557 * x - .204 * y + 1.057 * z);
    data[i * 4 + 3] = 1;
  }
  return data;
}
