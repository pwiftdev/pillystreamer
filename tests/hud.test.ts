import assert from "node:assert/strict";
import { test } from "node:test";
import { initialState } from "../src/overlay/state.js";

const { missionView } = await import(
  new URL("../overlay/hud.js", import.meta.url).href
);

test("HUD completion does not regress after crafting consumes logs", () => {
  const bot = {
    ...initialState().bot,
    connected: true,
    updatedAt: Date.now(),
    logs: 28,
    target: 32,
  };
  assert.equal(
    missionView({ ...bot, phase: "gathering" }, true).progress,
    87.5,
  );
  for (const phase of ["crafting", "returning", "complete"]) {
    const view = missionView({ ...bot, phase }, true);
    assert.equal(view.progress, 100);
    assert.doesNotMatch(view.detail, /28|32/);
  }
  const complete = missionView({ ...bot, phase: "complete" }, true);
  assert.equal(complete.step, 3);
  assert.equal(complete.badge, "ALL DONE");
});

test("offline HUD hides stale progress and never presents it as current gameplay", () => {
  const view = missionView(
    { ...initialState().bot, phase: "gathering", logs: 8 },
    false,
  );
  assert.equal(view.progress, null);
  assert.equal(view.step, -1);
  assert.doesNotMatch(view.title, /Gather/);
});
