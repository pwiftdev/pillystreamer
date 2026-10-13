import { Vec3 } from "vec3";
import { EventEmitter } from "node:events";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Bot } from "mineflayer";
import { gatherWood, isLog, isNavigationDig } from "../src/gameplay.js";

test("trees exclude stripped logs and crafted wood", () => {
  assert.equal(isLog("oak_log"), true);
  assert.equal(isLog("dark_oak_log"), true);
  assert.equal(isLog("stripped_oak_log"), false);
  assert.equal(isLog("oak_planks"), false);
});

test("collection verifies inventory instead of assuming the item was picked up", async () => {
  let attempts = 0;
  const bot = {
    entity: { position: new Vec3(0, 64, 0) },
    inventory: { items: () => [] },
    findBlocks: () => [{ x: 0, y: 64, z: 0 }],
    blockAt: () => ({ name: "oak_log", position: "0,64,0" }),
    on: EventEmitter.prototype.on,
    removeListener: EventEmitter.prototype.removeListener,
    entities: {},
    pathfinder: {
      isMining: () => false,
      isBuilding: () => false,
      getPathFromTo: function* () {
        yield { result: { status: "success" } };
      },
    },
    collectBlock: {
      collect: async () => {
        attempts++;
      },
    },
  } as unknown as Bot;
  await assert.rejects(
    gatherWood(bot, 4, new AbortController().signal, () => {}),
    /insufficient progress/,
  );
  assert.equal(attempts, 12);
});

test("a fulfilled inventory target does not mine extra blocks", async () => {
  const bot = {
    entity: { position: new Vec3(0, 64, 0) },
    inventory: { items: () => [{ name: "oak_log", count: 8 }] },
    findBlocks: () => {
      throw new Error("Should not mine");
    },
  } as unknown as Bot;
  await gatherWood(bot, 8, new AbortController().signal, () => {});
});

test("missing trees stop with an actionable error", async () => {
  const bot = {
    entity: { position: new Vec3(0, 64, 0) },
    inventory: { items: () => [] },
    findBlocks: () => [],
  } as unknown as Bot;
  await assert.rejects(
    gatherWood(bot, 8, new AbortController().signal, () => {}),
    /near a forest/,
  );
});

test("tree lookup handles palette blocks without positions", async () => {
  const bot = {
    entity: { position: new Vec3(0, 64, 0) },
    inventory: { items: () => [] },
    findBlocks: (options: Parameters<Bot["findBlocks"]>[0]) => {
      const matching = options.matching as (block: unknown) => boolean;
      assert.equal(matching({ name: "oak_log", position: null }), true);
      const extra = options.useExtraInfo as (block: unknown) => boolean;
      assert.equal(extra({ position: { y: 68 } }), true);
      assert.equal(extra({ position: { y: 69 } }), false);
      return [];
    },
  } as unknown as Bot;
  await assert.rejects(
    gatherWood(bot, 8, new AbortController().signal, () => {}),
    /near a forest/,
  );
});

test("collection skips an unreachable tree and uses a reachable one", async () => {
  let count = 0;
  const first = { x: 1, y: 64, z: 0 };
  const second = { x: 2, y: 64, z: 0 };
  const bot = {
    entity: { position: new Vec3(0, 64, 0) },
    inventory: { items: () => [{ name: "oak_log", count }] },
    findBlocks: () => [first, second],
    blockAt: (position: unknown) => ({ name: "oak_log", position }),
    on: EventEmitter.prototype.on,
    removeListener: EventEmitter.prototype.removeListener,
    entities: {},
    pathfinder: {
      isMining: () => false,
      isBuilding: () => false,
      getPathFromTo: function* (
        _movement: unknown,
        _start: unknown,
        goal: { pos: unknown },
      ) {
        yield {
          result: { status: goal.pos === first ? "timeout" : "success" },
        };
      },
    },
    collectBlock: {
      collect: async (block: { position: unknown }) => {
        assert.equal(block.position, second);
        count = 8;
      },
    },
  } as unknown as Bot;
  await gatherWood(bot, 8, new AbortController().signal, () => {});
  assert.equal(count, 8);
});

test("navigation can clear a dirt exit without mining stone, buildings or falling blocks", () => {
  for (const name of ["dirt", "grass_block", "oak_leaves", "oak_log"])
    assert(isNavigationDig(name));
  for (const name of [
    "stone",
    "sand",
    "gravel",
    "oak_planks",
    "crafting_table",
    "bedrock",
  ])
    assert.equal(isNavigationDig(name), false);
});
