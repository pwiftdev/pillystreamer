import { EventEmitter } from "node:events";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Bot } from "mineflayer";
import { Vec3 } from "vec3";
import { Exploration, explorationPoints } from "../src/brain/exploration.js";

function terrain() {
  const position = new Vec3(200, 64, 200);
  const bot = {
    entity: { position },
    food: 20,
    findBlocks: () => [],
    blockAt: (p: Vec3) => ({
      name: p.y === 63 ? "grass_block" : "air",
      skyLight: 15,
    }),
    clearControlStates() {},
    on: EventEmitter.prototype.on,
    removeListener: EventEmitter.prototype.removeListener,
    entities: {},
    pathfinder: {
      isMining: () => false,
      isBuilding: () => false,
      movements: {},
      setGoal() {},
      getPathFromTo: function* () {
        yield { result: { status: "success" } };
      },
      goto: async (goal: { x: number; y: number; z: number }) => {
        bot.entity.position = new Vec3(goal.x, goal.y, goal.z);
      },
    },
  };
  return bot as unknown as Bot;
}
test("exploration samples distant columns, includes short exits and checks headroom", () => {
  const bot = terrain();
  const points = explorationPoints(bot);
  assert(points.some((p) => p.distanceTo(bot.entity.position) >= 35));
  assert(points.some((p) => p.distanceTo(bot.entity.position) <= 5));
  bot.blockAt = (() => ({ name: "stone" })) as unknown as Bot["blockAt"];
  assert.equal(explorationPoints(bot).length, 0);
});
test("exploration favors daylight, resources, and unvisited terrain", () => {
  const bot = terrain();
  const exploration = new Exploration();
  const a = bot.entity.position.offset(12, 0, 0);
  const b = bot.entity.position.offset(-12, 0, 0);
  exploration.record(a);
  assert(exploration.score(bot, b, []) > exploration.score(bot, a, []));
  const fresh = new Exploration();
  assert(fresh.score(bot, b, [b]) > fresh.score(bot, a, [b]));
  bot.blockAt = ((p: Vec3) => ({
    skyLight: p.x < 200 ? 15 : 0,
  })) as unknown as Bot["blockAt"];
  assert(fresh.score(bot, b, []) > fresh.score(bot, a, []));
});
test("exploration walks beyond the old spawn leash and verifies displacement", async () => {
  const bot = terrain(),
    start = bot.entity.position.clone();
  await new Exploration().move(bot, new AbortController().signal);
  assert(bot.entity.position.distanceTo(start) >= 2);
  bot.pathfinder.goto = async () => {};
  await assert.rejects(
    new Exploration().move(bot, new AbortController().signal),
    /reachable|progress|route/,
  );
});
test("session loss prevents movement and never records a false success", async () => {
  const bot = terrain(),
    controller = new AbortController();
  let calls = 0;
  bot.pathfinder.goto = async () => {
    calls++;
    controller.abort(new Error("session lost"));
  };
  await assert.rejects(
    new Exploration().move(bot, controller.signal),
    /session lost/,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    new Exploration().move(bot, controller.signal),
    /session lost/,
  );
  assert.equal(calls, 1);
});
test("unknown movement failures stop without replay; a new process re-reads terrain", async () => {
  const bot = terrain();
  let calls = 0;
  bot.pathfinder.goto = async () => {
    calls++;
    throw new Error("unknown acknowledgement");
  };
  await assert.rejects(
    new Exploration().move(bot, new AbortController().signal),
    /unknown acknowledgement/,
  );
  assert.equal(calls, 1);
  const restarted = terrain();
  await new Exploration().move(restarted, new AbortController().signal);
  assert(restarted.entity.position.distanceTo(new Vec3(200, 64, 200)) > 2);
});
test("post-movement local failure is not retried", async () => {
  const bot = terrain();
  let calls = 0;
  bot.pathfinder.goto = async (goal) => {
    calls++;
    bot.entity.position = new Vec3(
      (goal as unknown as { x: number }).x,
      64,
      (goal as unknown as { z: number }).z,
    );
    bot.entity.position.floored = () => {
      throw new Error("local read failed");
    };
  };
  await assert.rejects(
    new Exploration().move(bot, new AbortController().signal),
    /local read failed/,
  );
  assert.equal(calls, 1);
});

test("long exploration routes use a short confirmed waypoint", async () => {
  const bot = terrain();
  bot.pathfinder.getPathFromTo = function* () {
    yield {
      result: {
        status: "success",
        path: Array.from({ length: 30 }, (_, i) => ({
          x: 201 + i,
          y: 64,
          z: 200,
        })),
      },
    } as never;
  };
  await new Exploration().move(bot, new AbortController().signal);
  assert.equal(bot.entity.position.x, 206);
});

test("repeated failures near a tree stop pulling exploration back to it", async () => {
  const { newMemory } = await import("../src/brain/memory.js");
  const tree = new Vec3(218, 64, 200),
    first = terrain(),
    second = terrain();
  first.findBlocks = () => [tree];
  second.findBlocks = () => [tree];
  await new Exploration().move(first, new AbortController().signal);
  const m = newMemory(second.entity.position);
  m.experiences = [1, 2].map(() => ({
    task: "gather",
    at: Date.now(),
    position: { x: 218, y: 64, z: 200 },
    outcome: "blocked",
    evidence: "No reachable tree.",
  }));
  await new Exploration().move(second, new AbortController().signal, m);
  assert(
    second.entity.position.distanceTo(tree) >
      first.entity.position.distanceTo(tree),
  );
});
