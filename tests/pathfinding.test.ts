import assert from "node:assert/strict";
import { test } from "node:test";
import type { Bot } from "mineflayer";
import pathfinder from "mineflayer-pathfinder";
import { reachable } from "../src/pathfinding.js";

const goal = new pathfinder.goals.GoalNear(20, 70, 20, 1);
function fixture(statuses: string[], step = () => {}) {
  let closed = false;
  const bot = {
    entity: { position: {} },
    pathfinder: {
      movements: {},
      getPathFromTo: function* (
        _m: unknown,
        _p: unknown,
        _g: unknown,
        options: { timeout: number; tickTimeout: number },
      ) {
        assert.equal(options.tickTimeout, 20);
        assert.equal(options.timeout, 500);
        try {
          for (const status of statuses) {
            step();
            yield { result: { status } };
          }
        } finally {
          closed = true;
        }
      },
    },
  } as unknown as Bot;
  return { bot, closed: () => closed };
}
test("a paused path search continues across slices until it finds a route", async () => {
  const f = fixture(["partial", "partial", "success"]);
  assert.equal(
    await reachable(f.bot, goal, new AbortController().signal),
    true,
  );
  assert(f.closed());
});
test("finished no-path and timeout searches are rejected", async () => {
  for (const status of ["noPath", "timeout"]) {
    const f = fixture(["partial", status]);
    assert.equal(
      await reachable(f.bot, goal, new AbortController().signal),
      false,
    );
    assert(f.closed());
  }
});
test("session loss during search closes the generator without movement", async () => {
  const controller = new AbortController();
  const f = fixture(["partial", "success"], () =>
    controller.abort(new Error("session lost")),
  );
  await assert.rejects(
    reachable(f.bot, goal, controller.signal),
    /session lost/,
  );
  assert(f.closed());
});
test("search failures propagate without inventing a route", async () => {
  const f = fixture(["partial"], () => {
    throw new Error("world unavailable");
  });
  await assert.rejects(
    reachable(f.bot, goal, new AbortController().signal),
    /world unavailable/,
  );
  assert(f.closed());
});
