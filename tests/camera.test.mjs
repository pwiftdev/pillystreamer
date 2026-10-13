import assert from "node:assert/strict";
import { test } from "node:test";
import { CameraTrack, renderPixelRatio } from "../viewer/camera.js";
const pose = (time, x = time / 1000, yaw = 0, pitch = 0) => ({
  time,
  pos: { x, y: 64, z: 0 },
  yaw,
  pitch,
});
const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test("position and head turns interpolate between ticks at display-frame times", () => {
  const camera = new CameraTrack();
  camera.push(pose(0, 0, 0, 0), 1000);
  camera.push(pose(50, 1, 1, 0.4), 1050);
  camera.push(pose(100, 2, 2, 0.8), 1100);
  const frame = camera.sample(1125);
  close(frame.pos.x, 0.5);
  close(frame.yaw, 0.5);
  close(frame.pitch, 0.2);
  assert.ok(camera.sample(1133).pos.x > frame.pos.x);
  close(camera.sample(5000).pos.x, 2);
});

test("turns across the angle boundary follow the short arc", () => {
  const camera = new CameraTrack();
  camera.push(pose(0, 0, Math.PI - 0.1), 0);
  camera.push(pose(50, 0, -Math.PI + 0.1), 50);
  close(camera.sample(125).yaw, Math.PI);
});

test("20 Hz packets with arrival jitter produce continuous movement at 60 and 144 Hz", () => {
  for (const hz of [60, 144]) {
    const camera = new CameraTrack();
    let next = 0,
      previous;
    for (let now = 0; now < 1800; now += 1000 / hz) {
      while (next <= 2000 && next + (next % 150 === 0 ? 20 : 0) <= now) {
        camera.push(pose(next), next + (next % 150 === 0 ? 20 : 0));
        next += 50;
      }
      const frame = camera.sample(now);
      if (now > 250 && frame && previous)
        close(frame.pos.x - previous.pos.x, 1 / hz);
      previous = frame;
    }
  }
});

test("teleports, long pauses, and reconnects reset instead of flying through stale history", () => {
  const camera = new CameraTrack();
  camera.push(pose(0, 0), 0);
  camera.push(pose(50, 20), 50);
  close(camera.sample(50).pos.x, 20);
  camera.push(pose(1000, 21), 1000);
  close(camera.sample(1000).pos.x, 21);
  camera.reset();
  assert.equal(camera.sample(1010), null);
  camera.push(pose(0, 100), 1020);
  close(camera.sample(1020).pos.x, 100);
});

test("invalid or reordered samples cannot corrupt the camera and the buffer stays bounded", () => {
  const camera = new CameraTrack();
  camera.push(pose(100), 100);
  assert.equal(camera.push(pose(90, 100), 110), false);
  assert.equal(camera.push({ ...pose(200), pitch: NaN }, 200), false);
  close(camera.sample(110).pos.x, 0.1);
  for (let at = 150; at < 5000; at += 50) camera.push(pose(at), at);
  assert.ok(camera.samples.length <= 40);
});

test("retina and oversized canvases stay within the full-HD pixel budget", () => {
  close(renderPixelRatio(1920, 1080, 2), 1);
  close(renderPixelRatio(3840, 2160, 2), 0.5);
  close(renderPixelRatio(960, 540, 2), 1.5);
  close(renderPixelRatio(960, 540, 1), 1);
});
