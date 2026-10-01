// One shared, analytic route for the rail geometry and every vehicle.
export const TRACK = Object.freeze({ halfStraight: 8.7, radius: 6.1, gauge: 0.72, height: 0.265 });
export const STRAIGHT = TRACK.halfStraight * 2;
export const ARC = Math.PI * TRACK.radius;
export const TRACK_LENGTH = STRAIGHT * 2 + ARC * 2;
export const STATION_DISTANCE = 5.5;
export const INITIAL_DISTANCE = 12;
export const CAR_SPACING = 2.12;
export const BASE_SPEED = 2.7;
export const DWELL_SECONDS = 2;

export function wrap(value, length = TRACK_LENGTH) {
  return ((value % length) + length) % length;
}

export function trackPoint(distance) {
  let d = wrap(distance);
  const { halfStraight: a, radius: r } = TRACK;
  if (d < STRAIGHT) return { x: -a + d, z: r, tx: 1, tz: 0 };
  d -= STRAIGHT;
  if (d < ARC) {
    const angle = Math.PI / 2 - d / r;
    return { x: a + r * Math.cos(angle), z: r * Math.sin(angle), tx: Math.sin(angle), tz: -Math.cos(angle) };
  }
  d -= ARC;
  if (d < STRAIGHT) return { x: a - d, z: -r, tx: -1, tz: 0 };
  d -= STRAIGHT;
  const angle = -Math.PI / 2 - d / r;
  return { x: -a + r * Math.cos(angle), z: r * Math.sin(angle), tx: Math.sin(angle), tz: -Math.cos(angle) };
}

export function carPose(distance) {
  // The two bogies sample the same track independently. The body follows their chord.
  const front = trackPoint(distance + 0.57);
  const rear = trackPoint(distance - 0.57);
  return { ...trackPoint(distance), angle: Math.atan2(-(front.z - rear.z), front.x - rear.x) };
}

export class RailwaySimulation {
  constructor() { this.reset(); }
  reset() {
    this.distance = INITIAL_DISTANCE;
    this.speed = 1;
    this.playing = true;
    this.dwellRemaining = 0;
    this.stops = 0;
    this.laps = 0;
    this.elapsed = 0;
    this.totalDistance = 0;
  }
  setSpeed(value) {
    if (!Number.isFinite(value) || value < 0.25 || value > 2) throw new RangeError('速度必须在 0.25–2 倍之间。');
    this.speed = value;
  }
  get distanceToStation() { return wrap(STATION_DISTANCE - this.distance); }
  get poses() { return [0, 1, 2].map(i => carPose(this.distance - i * CAR_SPACING)); }
  advance(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('时间步长必须是有限的非负数。');
    if (!this.playing) return;
    // Consume arrival, dwell and departure as separate events. Large timesteps cannot skip a stop.
    let remaining = seconds;
    while (remaining > 1e-9) {
      if (this.dwellRemaining > 0) {
        const spent = Math.min(remaining, this.dwellRemaining);
        this.dwellRemaining = Math.max(0, this.dwellRemaining - spent);
        this.elapsed += spent;
        remaining -= spent;
        continue;
      }
      let toStation = this.distanceToStation;
      if (toStation < 1e-8) toStation = TRACK_LENGTH;
      const velocity = BASE_SPEED * this.speed;
      const spent = Math.min(remaining, toStation / velocity);
      const traveled = spent * velocity;
      this.laps += Math.floor((this.distance + traveled) / TRACK_LENGTH);
      this.distance = wrap(this.distance + traveled);
      this.totalDistance += traveled;
      this.elapsed += spent;
      remaining -= spent;
      if (traveled >= toStation - 1e-8) {
        this.distance = STATION_DISTANCE;
        this.dwellRemaining = DWELL_SECONDS;
        this.stops += 1;
      }
    }
  }
}
