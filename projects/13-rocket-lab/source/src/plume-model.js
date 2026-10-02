// Optical / entrained-tracer model, not chamber gas dynamics or a thrust source.
// IFT-2 ascent imagery shows a luminous mixed plume several stack lengths long.
// All geometry is procedural; no reference photo is included in the application.
export const PLUME_MODEL=Object.freeze({
  coreLength:320, vacuumCoreLength:285, throttleExponent:.7,
  tracerBaseSpeed:160, tracerThrottleSpeed:310,
  lifetimeBase:.32, lifetimeSpread:.38, lifetimeThrottle:.24,
  reference:'https://commons.wikimedia.org/wiki/File:Starship-IFT2-ascent.jpg',
  interpretation:'Empirical radiance envelope plus persistent GPU entrained tracers; metres and seconds; not CFD or exhaust-velocity prediction.'
});
export function plumeLength(power,vacuum=false){return 2+Math.pow(Math.max(0,power),PLUME_MODEL.throttleExponent)*(vacuum?PLUME_MODEL.vacuumCoreLength:PLUME_MODEL.coreLength);}
