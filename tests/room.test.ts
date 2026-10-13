import assert from "node:assert/strict";
import { test } from "node:test";

const { ROOM_REACTIONS, roomReaction, spring } = await import(
  new URL("../overlay/room-spec.js", import.meta.url).href
);

test("room reactions blend in and out once, and expired or future events stay idle", () => {
  for (const [id, spec] of Object.entries(ROOM_REACTIONS) as [
    string,
    { duration: number },
  ][]) {
    const event = { id, startedAt: 1000 };
    assert.equal(roomReaction(event, 999), null);
    assert.equal(roomReaction(event, 1000).weight, 0);
    assert.equal(roomReaction(event, 1250).weight, 1);
    assert.equal(roomReaction(event, 1000 + spec.duration - 175).weight, 0.5);
    assert.equal(roomReaction(event, 1000 + spec.duration), null);
    assert.equal(roomReaction(event, 1000 + spec.duration * 2), null);
  }
  assert.equal(roomReaction(null, 1000), null);
  for (const id of ["missing", "constructor", "__proto__"])
    assert.equal(roomReaction({ id, startedAt: 1000 }, 1000), null);
});

test("a new reaction interrupts the previous one and older sprite events remain playable", () => {
  const first = roomReaction({ id: "hello", startedAt: 1000 }, 1300);
  assert.equal(first.gesture, "wave");
  const next = roomReaction({ id: "scare", startedAt: 1300 }, 1350);
  assert.equal(next.gesture, "shock");
  assert.equal(next.elapsed, 0.05);
  for (const id of ["cry", "vibe", "sleep", "dizzy", "nervous"])
    assert.ok(roomReaction({ id, startedAt: 1000 }, 1100));
});

test("hand springs remain bounded after a paused tab and converge at different frame rates", () => {
  for (const frameMs of [1000 / 144, 1000 / 60, 1000 / 20]) {
    const hand = { p: [50, 60], v: [0, 0] };
    const target = [88, 34];
    spring(hand, target, 60);
    assert.ok(
      hand.p.every((n: number) => Number.isFinite(n) && n >= 0 && n <= 128),
    );
    for (let ms = 0; ms < 2000; ms += frameMs)
      spring(hand, target, frameMs / 1000);
    assert.ok(Math.abs(hand.p[0] - target[0]) < 0.01);
    assert.ok(Math.abs(hand.p[1] - target[1]) < 0.01);
  }
});
