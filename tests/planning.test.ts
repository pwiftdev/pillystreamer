import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { setImmediate as turn } from "node:timers/promises";
import { Vec3 } from "vec3";
import type { Bot } from "mineflayer";
import { Planner, parsePlan } from "../src/brain/planner.js";
import { newMemory, validateMemory } from "../src/brain/memory.js";
import {
  remember,
  nearbyFailures,
  type Evidence,
} from "../src/brain/observation.js";
import { guardedTravel, TravelInterrupted } from "../src/brain/travel.js";
import { summarizeRun, RunMetrics } from "../src/brain/metrics.js";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import type { SurvivalState } from "../src/survival/state.js";

const p = { x: 0, y: 64, z: 0 };
const memory = () => newMemory(p);
const options = [
  { id: "gather", title: "Wood", reason: "Supplies", score: 100 },
  { id: "explore", title: "Explore", reason: "Discover", score: 10 },
] as const;
const plan = (task = "gather", batches = 2) =>
  JSON.stringify({ goal: task, steps: [{ task, batches }] });
const signal = () => new AbortController().signal;
function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
const sample = (): Evidence => ({
  position: p,
  inventory: {},
  health: 20,
  hunger: 20,
  shelterBlocks: 0,
  houseBlocks: 0,
  stations: "{}",
  planted: 0,
  sleeping: false,
});

test("plans reject invented commands, oversized batches and infeasible first steps", () => {
  for (const text of [
    plan("execute"),
    plan("gather", 100),
    plan("shelter"),
    JSON.stringify({
      goal: "gather",
      steps: [{ task: "gather", batches: 1, command: "kill" }],
    }),
    "```code```",
    "x".repeat(5000),
  ])
    assert.equal(parsePlan(text, [...options]), undefined);
  assert.equal(parsePlan(plan(), [...options])?.steps.length, 1);
});
test("slow planning runs alongside local actions, uses one request and advances only verified model batches", async () => {
  const reply = pending<string>();
  let calls = 0;
  const planner = new Planner({
    reply: async () => {
      calls++;
      return reply.promise;
    },
  });
  const m = memory();
  assert.equal((await planner.choose([...options], m, signal())).mode, "local");
  assert.equal((await planner.choose([...options], m, signal())).mode, "local");
  assert.equal(calls, 1);
  reply.resolve(plan());
  await turn();
  assert.equal((await planner.choose([...options], m, signal())).mode, "model");
  const originalPlan = planner.summary;
  planner.finish("gather", true, "local");
  assert.equal(planner.summary, originalPlan);
  planner.finish("gather", true, "model");
  assert.equal((await planner.choose([...options], m, signal())).mode, "model");
  planner.finish("gather", false, "model");
  assert.equal(planner.summary, "Checking what I need next.");
});
test("damage, useful chat and session loss reject late replies, even when provider ignores cancellation", async () => {
  for (const trigger of ["damage", "chat", "session"]) {
    const r = pending<string>(),
      controller = new AbortController(),
      m = memory();
    const planner = new Planner({ reply: () => r.promise });
    await planner.choose([...options], m, controller.signal, {}, "healthy");
    if (trigger === "session") controller.abort();
    else {
      if (trigger === "chat") m.preference = { task: "explore", until: 500 };
      await planner.choose(
        [...options],
        m,
        controller.signal,
        {},
        trigger === "damage" ? "hurt" : "healthy",
      );
    }
    r.resolve(plan());
    await turn();
    assert.equal(planner.metrics.accepted, 0);
    assert.equal(planner.metrics.stale, 1);
  }
});
test("rechecks each future step and blocks early town actions even if model requests them", async () => {
  const planner = new Planner({
    reply: async () =>
      JSON.stringify({
        goal: "shelter",
        steps: [
          { task: "gather", batches: 1 },
          { task: "build", batches: 8 },
          { task: "explore", batches: 1 },
        ],
      }),
  });
  const m = memory();
  assert.equal(
    (await planner.choose([...options], m, signal())).task.id,
    "gather",
  );
  planner.finish("gather", true, "model");
  assert.equal(
    (await planner.choose([...options], m, signal())).task.id,
    "explore",
  );
  const urgent = [
    { id: "eat", title: "Eat", reason: "Hungry", score: 1000 },
  ] as const;
  assert.equal((await planner.choose([...urgent], m, signal())).mode, "local");
  assert.equal(planner.summary, "Checking what I need next.");
});
test("model requests are bounded to 120 per rolling hour and errors do not trigger an immediate retry", async () => {
  let now = 0,
    calls = 0;
  const planner = new Planner(
    {
      reply: async () => {
        calls++;
        throw new Error("ack lost");
      },
    },
    () => now,
  );
  const m = memory();
  for (let i = 0; i < 140; i++) {
    await planner.choose([...options], m, signal());
    now += 10000;
  }
  assert.equal(calls, 120);
  now = 3600001;
  await planner.choose([...options], m, signal());
  assert.equal(calls, 121);
});
test("durable evidence distinguishes a walk or damage from successfully collecting food", () => {
  const m = memory(),
    before = sample(),
    after = { ...sample(), position: { ...p, x: 4 }, health: 18 };
  assert.equal(
    remember(m, "forage", before, after, false, 100).outcome,
    "no_progress",
  );
  remember(m, "forage", before, after, true, 101);
  assert.equal(nearbyFailures(m, "forage", p, 200), 2);
  assert.equal(nearbyFailures(m, "forage", { ...p, x: 50 }, 200), 0);
  assert.equal(
    remember(
      m,
      "forage",
      before,
      { ...after, inventory: { beef: 1 } },
      false,
      102,
    ).outcome,
    "progress",
  );
  assert.equal(
    validateMemory(JSON.parse(JSON.stringify(m))).experiences?.length,
    3,
  );
  assert.throws(() =>
    validateMemory({
      ...m,
      experiences: [{ ...m.experiences![0], task: "execute" }],
    }),
  );
  for (let i = 0; i < 50; i++) remember(m, "explore", before, after, false, i);
  assert.equal(m.experiences?.length, 40);
});
function travelBot() {
  const bot = Object.assign(new EventEmitter(), {
    entity: { position: new Vec3(0, 64, 0) },
    entities: {},
    health: 20,
    clearControlStates() {},
    pathfinder: {
      isMining: () => false,
      isBuilding: () => false,
      setGoal: () => {},
    },
  }) as unknown as Bot;
  return bot;
}
test("damage interrupts travel but waits for acknowledgement before returning control", async () => {
  const bot = travelBot(),
    action = pending<void>();
  let cleared = 0,
    settled = false;
  bot.pathfinder.setGoal = () => {
    cleared++;
  };
  const work = guardedTravel(bot, () => action.promise, signal()).finally(
    () => (settled = true),
  );
  bot.health = 16;
  bot.emit("physicsTick");
  await turn();
  assert.equal(cleared, 1);
  assert.equal(settled, false);
  action.resolve();
  await assert.rejects(work, TravelInterrupted);
  assert.equal(bot.listenerCount("physicsTick"), 0);
});
test("travel never cancels an in-flight mutation; escape continues and stalled paths are interrupted", async () => {
  const bot = travelBot(),
    a = pending<void>();
  let cancelled = 0,
    now = 0;
  bot.pathfinder.setGoal = () => {
    cancelled++;
  };
  bot.pathfinder.isMining = () => true;
  const work = guardedTravel(
    bot,
    () => a.promise,
    signal(),
    false,
    () => now,
  );
  bot.health = 10;
  bot.emit("physicsTick");
  assert.equal(cancelled, 0);
  bot.pathfinder.isMining = () => false;
  bot.emit("physicsTick");
  assert.equal(cancelled, 1);
  a.resolve();
  await assert.rejects(work, TravelInterrupted);
  const escape = pending<void>();
  const run = guardedTravel(
    bot,
    () => escape.promise,
    signal(),
    true,
    () => now,
  );
  bot.health = 8;
  bot.emit("physicsTick");
  assert.equal(cancelled, 1);
  now = 8001;
  bot.emit("physicsTick");
  assert.equal(cancelled, 2);
  escape.resolve();
  await assert.rejects(run, TravelInterrupted);
});
test("session loss and unknown remote outcomes stop travel without replay, including post-ack local failures", async () => {
  for (const mode of ["session", "remote", "local"]) {
    const bot = travelBot(),
      c = new AbortController();
    let calls = 0;
    await assert.rejects(
      guardedTravel(
        bot,
        async () => {
          calls++;
          if (mode === "session") c.abort(new Error("lost session"));
          else if (mode === "remote") throw new Error("unknown remote outcome");
          else {
            bot.entity.position.x = 5;
            throw new Error("local read failed after ack");
          }
        },
        c.signal,
      ),
    );
    assert.equal(calls, 1);
    assert.equal(bot.listenerCount("physicsTick"), 0);
  }
});
test("metrics preserve uncertain crash boundaries and never infer completion from intent", async (t) => {
  const dir = await mkdtemp(`${tmpdir()}/pilly-eval-`);
  t.after(() => rm(dir, { recursive: true, force: true }));
  const url = pathToFileURL(`${dir}/`);
  let now = 100;
  const metrics = new RunMetrics(url, () => now);
  await metrics.start("gather", sample(), { requests: 1 });
  const file = pathToFileURL(`${dir}/${(await readdir(dir))[0]}`);
  const before = await readFile(file, "utf8");
  assert.equal(summarizeRun(before).unconfirmedActions, 1);
  now = 200;
  const entry = remember(memory(), "gather", sample(), {
    ...sample(),
    inventory: { oak_log: 1 },
  });
  await metrics.finish(
    entry,
    100,
    { food: 0, shelter: false } as SurvivalState,
    { requests: 1 },
  );
  const done = summarizeRun(await readFile(file, "utf8"));
  assert.equal(done.unconfirmedActions, 0);
  assert.equal(done.apiCostUsd, null);
  assert.equal(summarizeRun(before + '{"type":').incompleteTail, true);
  await writeFile(`${dir}/blocked`, "x");
  const bad = new RunMetrics(pathToFileURL(`${dir}/blocked/`));
  await assert.rejects(bad.start("gather", sample(), {}));
  await rm(file);
  await mkdirReplacement(file);
  await assert.rejects(metrics.finish(entry, 100, {} as SurvivalState, {}));
  async function mkdirReplacement(path: URL) {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path);
  }
});

test("hidden mobs do not trap Pilly in a permanent retreat loop", async () => {
  const { nearbyThreat } = await import("../src/survival/state.js");
  const bot = travelBot();
  bot.entities = {
    2: { name: "zombie", position: new Vec3(2, 64, 0) },
  } as unknown as Bot["entities"];
  bot.world = { raycast: () => ({ name: "stone" }) } as unknown as Bot["world"];
  assert.equal(nearbyThreat(bot), undefined);
  bot.world.raycast = () => null;
  assert.equal(nearbyThreat(bot)?.name, "zombie");
  let calls = 0;
  await assert.rejects(
    guardedTravel(
      bot,
      async () => {
        calls++;
      },
      signal(),
    ),
    TravelInterrupted,
  );
  assert.equal(calls, 0);
});

test("danger interrupts nested exploration rather than trying the next route", async () => {
  const { Exploration } = await import("../src/brain/exploration.js");
  const { Replan } = await import("../src/brain/placement.js");
  const bot = travelBot();
  let calls = 0;
  bot.food = 20;
  bot.findBlocks = () => [];
  bot.blockAt = ((p: Vec3) => ({
    name: p.y === 63 ? "grass_block" : "air",
    skyLight: 15,
  })) as Bot["blockAt"];
  bot.pathfinder.getPathFromTo = function* () {
    yield { result: { status: "success" } } as never;
  };
  bot.pathfinder.goto = async () => {
    calls++;
    throw new Replan("danger", true);
  };
  await assert.rejects(
    new Exploration().move(bot, signal()),
    (e: unknown) => e instanceof Replan && e.urgent,
  );
  assert.equal(calls, 1);
});

test("local failure does not starve background planning; replies are checked against current options", async () => {
  const reply = pending<string>();
  const planner = new Planner({ reply: () => reply.promise });
  const m = memory();
  await planner.choose([...options], m, signal());
  planner.finish("gather", false, "local");
  reply.resolve(plan("gather"));
  await turn();
  const choice = await planner.choose([options[1]], m, signal());
  assert.equal(choice.task.id, "explore");
  assert.equal(choice.mode, "local");
  assert.equal(planner.metrics.accepted, 1);
});
test("expensive observations are only read when a model request will use them", async () => {
  let reads = 0;
  const observe = () => {
    reads++;
    return {};
  };
  const m = memory();
  await new Planner().choose([...options], m, signal(), observe);
  assert.equal(reads, 0);
  const planner = new Planner({ reply: async () => plan() });
  await planner.choose([...options], m, signal(), observe);
  await planner.choose([...options], m, signal(), observe);
  assert.equal(reads, 1);
});

test("an inaccessible shelter does not cause aimless wandering when no threat is present", async () => {
  const { retreat } = await import("../src/survival/safety.js");
  const bot = travelBot(),
    m = memory();
  m.shelter = { id: 0, origin: p, complete: true, shelter: true };
  let routes = 0;
  bot.blockAt = (() => ({ name: "oak_planks" })) as unknown as Bot["blockAt"];
  bot.pathfinder.goto = async () => {
    routes++;
    throw Object.assign(new Error("blocked"), { name: "NoPath" });
  };
  await assert.rejects(retreat(bot, m, signal()), /entrance is blocked/);
  assert.equal(routes, 1);
});
