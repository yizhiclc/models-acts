import { Fn, convertToTexture, textureSize, uv, vec2, vec3, vec4, float, min, max } from 'three/tsl';

// Fixed nine-tap FXAA-style edge filtering, after tone mapping in sRGB.
// No search loops, gathers or nested layout functions: Quark's Chromium 144 / FXC
// compiler fails on the r180 FXAANode final pipeline. The fixed kernel retains
// antialiasing without changing the scene, lighting, compute fields or physics.
export function edgeAntialias(color) {
  const input = convertToTexture(color);
  return Fn(() => {
    const p = uv(), pixel = vec2(1).div(vec2(textureSize(input))).toVar();
    const luma = vec3(.299, .587, .114);
    const center = input.sample(p).toVar();
    const nw = input.sample(p.add(pixel.mul(vec2(-1, -1)))).rgb.dot(luma).toVar();
    const ne = input.sample(p.add(pixel.mul(vec2(1, -1)))).rgb.dot(luma).toVar();
    const sw = input.sample(p.add(pixel.mul(vec2(-1, 1)))).rgb.dot(luma).toVar();
    const se = input.sample(p.add(pixel).xy).rgb.dot(luma).toVar();
    const middle = center.rgb.dot(luma).toVar();
    const low = min(middle, min(min(nw, ne), min(sw, se))).toVar();
    const high = max(middle, max(max(nw, ne), max(sw, se))).toVar();
    const direction = vec2(nw.add(ne).sub(sw).sub(se).negate(), nw.add(sw).sub(ne).sub(se)).toVar();
    const reduction = max(nw.add(ne).add(sw).add(se).mul(.03125), 1 / 128).toVar();
    const reciprocal = float(1).div(min(direction.x.abs(), direction.y.abs()).add(reduction));
    const step = direction.mul(reciprocal).clamp(-8, 8).mul(pixel).toVar();
    const a = input.sample(p.sub(step.mul(1 / 6))).rgb.add(input.sample(p.add(step.mul(1 / 6))).rgb).mul(.5).toVar();
    const b = a.mul(.5).add(input.sample(p.sub(step.mul(.5))).rgb.add(input.sample(p.add(step.mul(.5))).rgb).mul(.25)).toVar();
    const bLuma = b.dot(luma).toVar();
    return vec4(bLuma.lessThan(low).or(bLuma.greaterThan(high)).select(a, b), center.a);
  })();
}
