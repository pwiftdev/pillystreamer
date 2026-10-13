import { EventEmitter } from "node:events";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Bot, Furnace } from "mineflayer";
import { Vec3 } from "vec3";
import { newMemory } from "../src/brain/memory.js";
import { houseBlocks, constructionPlan } from "../src/brain/blueprint.js";
import { Planner } from "../src/brain/planner.js";
import { learnFromChat } from "../src/brain/suggestions.js";
import { Replan } from "../src/brain/placement.js";
import { survivalCandidates } from "../src/survival/policy.js";
import { FOOD, townReady, type SurvivalState } from "../src/survival/state.js";
import { miningTargets, safeMiningPosition } from "../src/survival/mining.js";
import { nextEquipment } from "../src/survival/equipment.js";
import { doorState } from "../src/survival/navigation.js";
import { workFurnace } from "../src/survival/smelting.js";

const spawn = { x: 0, y: 64, z: 0 };
const fresh: SurvivalState = {
  logs: 0,
  planks: 0,
  saplings: 0,
  health: 20,
  hunger: 20,
  food: 0,
  night: false,
  danger: false,
  day: 1,
  shelter: false,
  woodenPick: false,
  stonePick: false,
  ironPick: false,
  diamondPick: false,
  stoneAxe: false,
  ironArmor: false,
  cobble: 0,
  coal: 0,
  rawIron: 0,
  iron: 0,
  torches: 0,
  table: false,
  furnace: false,
  bed: false,
  diamonds: 0,
  wool: 0,
};
const established: SurvivalState = {
  ...fresh,
  day: 10,
  shelter: true,
  bed: true,
  diamondPick: true,
  ironArmor: true,
  food: 16,
  torches: 8,
  planks: 80,
};
const names = (s: SurvivalState, m = newMemory(spawn)) =>
  survivalCandidates(s, m).map((c) => c.id);
function inventory(names: string[], supplies: Record<string, number> = {}) {
  const items = [
    ...names.map((name) => ({ name, count: 1 })),
    ...Object.entries(supplies).map(([name, count]) => ({ name, count })),
  ];
  return { inventory: { items: () => items, slots: items } } as unknown as Bot;
}

test("fresh survival has food and wood goals, no town quota, even when chat demands houses", () => {
  const m = newMemory(spawn);
  learnFromChat(m, [
    { id: "build", role: "viewer", text: "bro build Pumpville houses now" },
  ]);
  for (const life of [fresh, { ...fresh, day: 100, food: 30, planks: 200 }]) {
    assert.ok(!names(life, m).includes("build"));
    assert.ok(!names(life, m).includes("scout"));
  }
  assert.ok(names(fresh).includes("forage"));
  assert.ok(names(fresh).includes("gather"));
  assert.ok(!names(fresh).includes("mine"));
  assert.ok(!names(fresh).includes("smelt"));
});

test("survival priorities change as supplies, tools, hunger, darkness and threats change", () => {
  assert.equal(names({ ...fresh, food: 4, hunger: 8 })[0], "eat");
  assert.equal(
    names({ ...fresh, food: 4, hunger: 8, danger: true })[0],
    "retreat",
  );
  assert(names({ ...fresh, night: true }).includes("gather"));
  assert(names({ ...fresh, night: true }).includes("explore"));
  assert.equal(names({ ...fresh, night: true, shelter: true })[0], "retreat");
  assert.equal(
    names({ ...fresh, night: true, shelter: true, bed: true })[0],
    "sleep",
  );
  assert.equal(names({ ...fresh, health: 4, food: 0 })[0], "retreat");
  assert.deepEqual(names({ ...fresh, hunger: 4 }), ["forage", "explore"]);
  assert.ok(names({ ...fresh, food: 8, planks: 24 }).includes("shelter"));
  assert.ok(names({ ...fresh, food: 8, planks: 24 }).includes("tools"));
  assert.ok(names({ ...fresh, woodenPick: true }).includes("mine"));
  assert.ok(
    names({ ...fresh, shelter: true, table: true, cobble: 8 }).includes("camp"),
  );
  assert.ok(names({ ...fresh, furnace: true }).includes("smelt"));
});

test("Pumpville unlocks only after every late survival requirement is met", () => {
  assert.equal(townReady(established), true);
  assert.ok(names(established).includes("scout"));
  for (const key of ["shelter", "bed", "ironArmor", "diamondPick"] as const)
    assert.equal(townReady({ ...established, [key]: false }), false);
  for (const [key, value] of [
    ["day", 9],
    ["food", 15],
    ["torches", 7],
    ["health", 15],
    ["hunger", 15],
  ] as const)
    assert.equal(townReady({ ...established, [key]: value }), false);
  const m = newMemory(spawn);
  m.projects.push({ id: 1, origin: spawn, complete: false });
  assert.ok(names(established, m).includes("build"));
  assert.ok(!names({ ...established, food: 1 }, m).includes("build"));
});

test("a model cannot replace an urgent survival decision with chat's building idea", async () => {
  let calls = 0;
  const planner = new Planner({
    reply: async () => {
      calls++;
      return "build";
    },
  });
  const m = newMemory(spawn);
  const result = await planner.choose(
    survivalCandidates({ ...fresh, hunger: 4 }, m),
    m,
    new AbortController().signal,
  );
  assert.equal(result.task.id, "forage");
  assert.equal(calls, 0);
});

test("first shelter uses a low roof and solid walls, with space reserved for its door", () => {
  const shelter = { id: 0, origin: spawn, shelter: true, complete: false };
  const blocks = houseBlocks(shelter);
  assert.equal(new Set(blocks.map(String)).size, blocks.length);
  assert.equal(Math.max(...blocks.map((p) => p.y)), 67);
  assert.equal(blocks.filter((p) => p.y === 67).length, 25);
  assert.ok(blocks.some((p) => p.equals(new Vec3(0, 66, 2))));
  assert.ok(!blocks.some((p) => p.equals(new Vec3(2, 65, 0))));
  const roof = new Vec3(0, 67, 4),
    wall = new Vec3(1, 66, 4);
  assert.deepEqual(constructionPlan(shelter, [roof, wall]).pending, [roof]);
});

test("tool progression and mining respect harvest levels and avoid digging underfoot, liquids, and home", () => {
  assert.equal(nextEquipment(inventory([])), "wooden_pickaxe");
  assert.equal(
    nextEquipment(inventory(["wooden_pickaxe"], { cobblestone: 3 })),
    "stone_pickaxe",
  );
  assert.equal(
    nextEquipment(inventory(["stone_pickaxe"], { iron_ingot: 3 })),
    "iron_pickaxe",
  );
  assert.equal(
    nextEquipment(inventory(["iron_pickaxe"], { diamond: 3 })),
    "diamond_pickaxe",
  );
  assert.ok(
    !miningTargets(inventory(["wooden_pickaxe"], { cobblestone: 16 })).includes(
      "iron_ore",
    ),
  );
  assert.ok(
    miningTargets(inventory(["stone_pickaxe"], { cobblestone: 16 })).includes(
      "iron_ore",
    ),
  );
  assert.ok(
    !miningTargets(inventory(["stone_pickaxe"], { cobblestone: 16 })).includes(
      "diamond_ore",
    ),
  );
  const bot = {
    entity: { position: new Vec3(0, 64, 0) },
    blockAt: () => ({ name: "stone" }),
  } as unknown as Bot;
  const m = newMemory(spawn);
  assert.equal(safeMiningPosition(bot, new Vec3(2, 63, 0), m), false);
  assert.equal(safeMiningPosition(bot, new Vec3(2, 64, 0), m), true);
  bot.blockAt = (() => ({ name: "lava" })) as unknown as Bot["blockAt"];
  assert.equal(safeMiningPosition(bot, new Vec3(2, 64, 0), m), false);
  bot.blockAt = (() => ({ name: "stone" })) as unknown as Bot["blockAt"];
  m.shelter = { id: 0, origin: spawn, complete: true, shelter: true };
  assert.equal(safeMiningPosition(bot, new Vec3(2, 64, 0), m), false);
  assert.ok(
    !FOOD.has("rotten_flesh") &&
      !FOOD.has("chicken") &&
      !FOOD.has("pufferfish"),
  );
});

test("closing a shelter door reconciles ambiguous success and never toggles it open on replay", async () => {
  const m = newMemory(spawn);
  m.shelter = { id: 0, origin: spawn, shelter: true, complete: true };
  let open = true,
    calls = 0;
  const bot = {
    blockAt: () => ({ name: "oak_door", getProperties: () => ({ open }) }),
    activateBlock: async () => {
      calls++;
      open = false;
      throw new Error("ack lost");
    },
    waitForTicks: async () => {},
  } as unknown as Bot;
  const signal = new AbortController().signal;
  await doorState(bot, m, false, signal);
  await doorState(bot, m, false, signal);
  assert.equal(calls, 1);
  const lost = new AbortController();
  lost.abort(new Error("session lost"));
  await assert.rejects(doorState(bot, m, true, lost.signal), /session lost/);
  assert.equal(calls, 1);
});

function furnaceHarness() {
  let input: { name: string } | null = null,
    output: { name: string } | null = null;
  const calls: string[] = [];
  const bot = {
    inventory: {
      items: () => [
        { name: "raw_iron", type: 1 },
        { name: "coal", type: 2 },
      ],
    },
  } as unknown as Bot;
  const furnace = {
    fuel: 1,
    inputItem: () => input,
    fuelItem: () => null,
    outputItem: () => output,
    putInput: async () => {
      calls.push("input");
      input = { name: "raw_iron" };
    },
    putFuel: async () => {
      calls.push("fuel");
    },
    takeOutput: async () => {
      calls.push("take");
      output = null;
    },
  } as unknown as Furnace;
  return {
    bot,
    furnace,
    calls,
    output: () => {
      output = { name: "iron_ingot" };
    },
    clearInput: () => {
      input = null;
    },
  };
}

test("furnace resumes from remote inventory after a crash instead of duplicating input", async () => {
  const h = furnaceHarness(),
    signal = new AbortController().signal;
  await workFurnace(h.bot, h.furnace, signal);
  await workFurnace(h.bot, h.furnace, signal);
  assert.deepEqual(h.calls, ["input"]);
});

test("ambiguous furnace input and post-ack failure stop the action; restart reads the actual slot", async () => {
  const h = furnaceHarness(),
    signal = new AbortController().signal;
  const put = h.furnace.putInput;
  h.furnace.putInput = async (...args) => {
    await put(...args);
    throw new Error("post-ack failure");
  };
  await assert.rejects(workFurnace(h.bot, h.furnace, signal), /post-ack/);
  await workFurnace(h.bot, h.furnace, signal);
  assert.deepEqual(h.calls, ["input"]);
});

test("session loss after furnace input prevents fuel transfer or later actions", async () => {
  const h = furnaceHarness(),
    controller = new AbortController();
  const put = h.furnace.putInput;
  h.furnace.putInput = async (...args) => {
    await put(...args);
    controller.abort(new Error("session lost"));
  };
  h.furnace.fuel = 0;
  await assert.rejects(
    workFurnace(h.bot, h.furnace, controller.signal),
    /session lost/,
  );
  assert.deepEqual(h.calls, ["input"]);
});

test("furnace output collection is not replayed after a lost acknowledgement", async () => {
  const h = furnaceHarness(),
    signal = new AbortController().signal;
  h.output();
  const take = h.furnace.takeOutput;
  h.furnace.takeOutput = async () => {
    await take();
    throw new Error("ack lost");
  };
  await assert.rejects(workFurnace(h.bot, h.furnace, signal), /ack lost/);
  await workFurnace(h.bot, h.furnace, signal);
  assert.deepEqual(h.calls, ["take", "input"]);
  const empty = furnaceHarness();
  empty.bot.inventory.items = () => [];
  await assert.rejects(workFurnace(empty.bot, empty.furnace, signal), Replan);
});

test("higher shelter blocks use a bounded jump, reconcile lost acknowledgement, and release controls on session loss", async () => {
  const { placeAt } = await import("../src/brain/placement.js");
  const { default: pathfinder } = await import("mineflayer-pathfinder");
  const target = new Vec3(0, 3, 0);
  const controller = new AbortController();
  let placed = false,
    calls = 0,
    stopped = 0,
    loseSession = false;
  const blockAt = (p: Vec3) => {
    const solid =
      p.y === 0 ||
      p.equals(target.offset(0, -1, 0)) ||
      (placed && p.equals(target));
    return {
      name: solid ? "oak_planks" : "air",
      position: p,
      boundingBox: solid ? "block" : "empty",
      shapes: solid ? [[0, 0, 0, 1, 1, 1]] : [],
    };
  };
  const bot = {
    entity: { position: new Vec3(1.5, 1, 0.5) },
    blockAt,
    world: { getBlock: blockAt },
    inventory: { items: () => [{ name: "oak_planks", count: 2 }] },
    equip: async () => {},
    setControlState: () => {},
    clearControlStates: () => {
      stopped++;
    },
    waitForTicks: async () => {
      if (loseSession) controller.abort(new Error("session lost in jump"));
      else bot.entity.position.y = 1.9;
    },
    placeBlock: async () => {
      calls++;
      placed = true;
      throw new Error("ack lost");
    },
    on: EventEmitter.prototype.on,
    removeListener: EventEmitter.prototype.removeListener,
    entities: {},
    pathfinder: {
      isMining: () => false,
      isBuilding: () => false,
      movements: {},
      setGoal: () => {},
      getPathFromTo: function* (_m: unknown, _start: unknown, goal: unknown) {
        yield {
          result: {
            status:
              goal instanceof pathfinder.goals.GoalPlaceBlock
                ? "noPath"
                : "success",
          },
        };
      },
      goto: async (goal: { x: number; y: number; z: number }) => {
        bot.entity.position = new Vec3(goal.x + 0.5, goal.y, goal.z + 0.5);
      },
    },
  } as unknown as Bot;
  await placeAt(bot, target, "oak_planks", controller.signal);
  await placeAt(bot, target, "oak_planks", controller.signal);
  assert.equal(calls, 1);
  assert.equal(stopped, 1);
  placed = false;
  loseSession = true;
  await assert.rejects(
    placeAt(bot, target, "oak_planks", controller.signal),
    /session lost in jump/,
  );
  assert.equal(calls, 1);
  assert.equal(stopped, 2);
});
