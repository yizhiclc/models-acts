# Physics and rendering contract

## What is actually integrated

The fragment shader uses the stationary Kerr metric in Cartesian Kerr-Schild
coordinates. This is a numerical integration of null geodesics, not a
hand-authored radial UV displacement. The spacetime is prescribed; no Einstein
field equations are solved dynamically.

Use geometric units G = c = M = 1. The command parameter `size` converts one
geometric length unit, rg = GM/c^2, to Minecraft blocks. The shader parameter
`Spin` is a = Jc/(GM^2). The Kerr z axis maps to Minecraft world +Y.

For x = (x, y, z), define:

```text
B = x^2 + y^2 + z^2 - a^2
r^2 = (B + sqrt(B^2 + 4 a^2 z^2)) / 2
f = 2 r^3 / (r^4 + a^2 z^2)

l = ((r x + a y)/(r^2 + a^2),
     (r y - a x)/(r^2 + a^2),
     z/r)

g_mu_nu = eta_mu_nu + f l_mu l_nu
eta = diag(-1, 1, 1, 1)
l_mu = (1, l)
```

Trace backwards from the camera, scaling the conserved covariant time momentum
to p_t = +1. With spatial covariant momentum p:

```text
q = dot(l, p) - 1
H = (dot(p,p) - 1 - f q^2) / 2 = 0

dx/dlambda = p - f q l
dp/dlambda = (grad(f) q^2)/2 + f q sum_j(p_j grad(l_j))
```

`metric()` computes the metric and analytic spatial gradients. `rhs()` is the
Hamilton vector field. `advance()` uses classical fourth-order Runge-Kutta.
The initial direction is constructed in a local static observer tetrad where
that observer exists, with an Eulerian observer fallback near/inside the static
limit. Minecraft player motion is not interpreted as relativistic velocity.

The outer horizon is:

```text
r_plus = 1 + sqrt(1 - a^2)
```

A ray reaching `r_plus + 0.018` has a black background; any disk emission
already encountered in front of the horizon remains visible. Near inward horizon crossings,
the step is limited to avoid jumping through the singular region. The general
step is proportional to radius divided by coordinate speed, with a fixed
iteration budget. This is radius-adaptive stepping, not an error-controlled
embedded integrator. Finite precision and finite capture tolerance introduce
errors, especially near the critical curve.

High quality uses step scale 0.075 and at most 448 RK4 steps.
Balanced uses 0.12 and at most 300 steps. Both run at the main framebuffer's
resolution; neither reduces resolution while the player turns.

## How Minecraft scenery is obtained

After the world render and before the hand/HUD pass, the renderer:

1. Copies the current scene color into a private GPU texture.
2. Uses the world projection/view matrix and depth texture to reconstruct the
   visible surface points relative to the camera.
3. Advances each ray through Kerr spacetime, checking segments against that
   screen-space depth surface. A front-to-back crossing is refined by bisection.
4. Samples the original color at the resulting surface coordinate, or produces
   the black captured-ray silhouette.
5. Restores the OpenGL state for Minecraft's subsequent rendering.

Outgoing rays beyond r = 64 use a straight extension and a direction-based
screen-color fallback. The remaining weak-field deflection beyond that radius
is omitted. Missing screen directions use a direction-dependent approximation
of the current dimension sky color, with a narrow, quickly fading sample from
the screen boundary. Very close foreground surfaces are explicitly protected
from being overwritten by a lens behind them. This improves continuity but
does not reconstruct hidden buildings or terrain outside the rendered view.

## Important limits

The depth buffer contains only the nearest rasterized surface at each original
screen pixel. It is not a volumetric world representation, and its color already
contains Minecraft lighting, transparency, fog and tone mapping.

Consequently this implementation CANNOT reconstruct objects behind the viewer,
hidden surfaces, fully correct transparent geometry, or physically exact
multiple images requiring such data. Screen-boundary stretching, disocclusion
errors, thin bands and temporal popping are expected limitations. The foreground
protection, finite influence region and missing-data fallbacks are rendering
heuristics, not consequences of general relativity.

There is no gravitational radiative-transfer calculation for Minecraft block
spectra, no time-delay evaluation against past world states, and no modification
of Minecraft's illumination paths. The original diskless shader is unchanged
from 1.0.1. The optional disk uses a separate shader, as described below.
There is no artificial bright photon-ring overlay.

For performance, lenses beyond 512 blocks are ignored, and screen rays with
geometric impact parameter above 40 rg are unchanged (feathered from 28 rg).
Up to four lenses are independently composited far-to-near. This is not the
metric of a binary or interacting black-hole system.

The entity remains stationary and harmless. No gravitational force is applied
to players, blocks or mobs; the physical calculation is confined to the
image-forming ray paths.

## Optional accretion disk in 1.1.0

`/blackhole disk` creates the same registered entity with a synchronized and
saved `AccretionDisk=true` flag. Existing entities default to false.
The original `lensing.fsh` remains byte-for-byte unchanged. Disk-bearing
entities use `lensing-disk.fsh`, so diskless rays do not evaluate the new volume.

The co-rotating inner radius is the equatorial Kerr ISCO. With A = abs(a):

```text
Z1 = 1 + cbrt(1-A^2) [cbrt(1+A) + cbrt(1-A)]
Z2 = sqrt(3 A^2 + Z1^2)
r_in = 3 + Z2 - sqrt((3-Z1)(3+Z1+2 Z2))
Omega(r) = sign(a) / (r^(3/2) + A)
```

For a=0, choose the positive rotation direction. The density field is a
procedural combination of circular-coordinate noise, clumps and spiral bands
advected at this differential angular velocity. Two overlapping finite-life
fields crossfade to prevent unlimited shear and discontinuous resets. There
is no gas dynamics, mass transport or magnetohydrodynamic solver.

For the requested thick-center, thin-edge appearance, the vertical Gaussian
density scale height is prescribed as:

```text
q(r) = 1 - smoothstep(r_in, 21, r)
H(r) = 0.035 + 0.78 q(r)^1.35
vertical_density = exp[-0.5 (z/H)^2]
```

H decreases smoothly outwards and is not varied by the turbulence texture.
Noise instead affects density and the ragged outer radius, approximately
16 to 21 rg. This envelope is an artistic specification, not a hydrostatic
equilibrium calculation. The volume is bounded at r=23 and abs(z)=2.8.

Inside the disk region, RK4 steps are limited to 0.28 rg (high) or 0.42 rg
(balanced) of coordinate path length. Segment emission is integrated at
the midpoint and truncated at a detected Minecraft foreground intersection.
The prescription includes Beer-Lambert absorption and a circular emitter
four-velocity:

```text
v = Omega (-y, x, 0)
u^t = 1 / sqrt[1 - dot(v,v) - f (1+dot(l,v))^2]
E_em = u^t (1+dot(p,v))
E_obs = 1 / sqrt(1-f_observer)   [static observer region]
g = E_obs / E_em
alpha = 1 - exp(-0.95 density E_em delta_lambda)
```

The circular velocity is extended approximately above/below the equatorial
plane. Invalid timelike velocities are skipped. Close to/inside the observer
static limit, the disk color calculation uses a simplified observer-energy
fallback. The original ray-launch fallback still applies.

A zero-inner-torque-inspired temperature profile is used for color:

```text
T(r) = 21000 (r_in/r)^(3/4) [1-sqrt(r_in/r)]^(1/4) kelvin
```

Three visible wavelength bands approximate Planck color at T_observed=g*T.
Emission brightness includes a clamped g^4 factor and a separate artistic
radial/clump emissivity. A color-preserving peak-based tone map controls
overexposure. Thus neither absolute luminosity nor the noise emission profile
is an energy-conserving Novikov-Thorne model.

Animation advances by eight geometric time units per elapsed in-game second.
This is a visualization speed scale, not a physical mass-to-seconds conversion
from the Minecraft block size. No travel-time delay or scattering is modeled.

## Verification scope

The exact Minecraft/NeoForge target was compiled, and an isolated client was
run with the native GPU renderer. A checker-wall comparison demonstrated the
effect on actual rendered terrain. Creation and removal commands completed.
This establishes integration and visible behavior, not quantitative agreement
with an independently validated Kerr ray tracer. No numerical convergence or
Hamiltonian-drift certification is claimed for this first build.
