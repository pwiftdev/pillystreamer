const TAU = Math.PI * 2;
const angleDelta = (from, to) =>
  ((((to - from + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
const lerp = (from, to, t) => from + (to - from) * t;

export function validPose(pose) {
  return (
    pose &&
    [
      pose.time,
      pose.pos?.x,
      pose.pos?.y,
      pose.pos?.z,
      pose.yaw,
      pose.pitch,
    ].every(Number.isFinite)
  );
}
export function renderPixelRatio(width, height, density = 1) {
  return Math.min(
    density,
    1.5,
    Math.sqrt((1920 * 1080) / Math.max(1, width * height)),
  );
}
export class CameraTrack {
  constructor(delay = 100) {
    this.delay = delay;
    this.reset();
  }
  reset() {
    this.samples = [];
    this.offset = null;
    this.lastArrival = null;
  }
  push(pose, arrival) {
    if (!validPose(pose) || !Number.isFinite(arrival)) return false;
    const last = this.samples.at(-1);
    if (last && pose.time <= last.time) return false;
    if (
      last &&
      (arrival - this.lastArrival > 500 ||
        pose.time - last.time > 500 ||
        Math.hypot(
          pose.pos.x - last.pos.x,
          pose.pos.y - last.pos.y,
          pose.pos.z - last.pos.z,
        ) > 8)
    )
      this.reset();
    this.offset ??= arrival - pose.time;
    this.lastArrival = arrival;
    this.samples.push({
      time: pose.time,
      pos: { ...pose.pos },
      yaw: pose.yaw,
      pitch: pose.pitch,
    });
    if (this.samples.length > 40) this.samples.shift();
    return true;
  }
  sample(now) {
    if (!this.samples.length) return null;
    const at = now - this.offset - this.delay;
    while (this.samples.length > 2 && this.samples[1].time <= at)
      this.samples.shift();
    const from = this.samples[0],
      to = this.samples[1];
    if (!to || at <= from.time) return from;
    if (at >= to.time) return to;
    const t = (at - from.time) / (to.time - from.time);
    return {
      time: at,
      pos: {
        x: lerp(from.pos.x, to.pos.x, t),
        y: lerp(from.pos.y, to.pos.y, t),
        z: lerp(from.pos.z, to.pos.z, t),
      },
      yaw: from.yaw + angleDelta(from.yaw, to.yaw) * t,
      pitch: lerp(from.pitch, to.pitch, t),
    };
  }
}
