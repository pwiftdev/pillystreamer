import { reachable } from "../pathfinding.js";
import type { Bot } from "mineflayer";
import pathfinder from "mineflayer-pathfinder";
import { Vec3 } from "vec3";
import { runAction } from "../actions.js";
import { Replan, UnsafeOutcome, walk } from "../brain/placement.js";
import { vector } from "../brain/blueprint.js";
import type { TownMemory } from "../brain/types.js";
import { amount, hasItem, nearbyThreat } from "./state.js";

const { goals } = pathfinder;
export function miningTargets(bot: Bot) {
  const stone =
    hasItem(bot, "stone_pickaxe") ||
    hasItem(bot, "iron_pickaxe") ||
    hasItem(bot, "diamond_pickaxe");
  const iron = hasItem(bot, "iron_pickaxe") || hasItem(bot, "diamond_pickaxe");
  if (amount(bot, "cobblestone") < 16) return ["stone"];
  return [
    ...(iron ? ["diamond_ore", "deepslate_diamond_ore"] : []),
    ...(stone && amount(bot, "raw_iron") + amount(bot, "iron_ingot") < 32
      ? ["iron_ore", "deepslate_iron_ore"]
      : []),
    ...(amount(bot, "coal") < 16 ? ["coal_ore", "deepslate_coal_ore"] : []),
  ];
}
export function safeMiningPosition(
  bot: Bot,
  position: Vec3,
  memory: TownMemory,
) {
  const feet = bot.entity.position.floored();
  if (position.y < feet.y || position.y > feet.y + 2) return false;
  if (
    [...memory.projects, ...(memory.shelter ? [memory.shelter] : [])].some(
      (p) =>
        Math.abs(position.x - p.origin.x - 2) <= 5 &&
        Math.abs(position.z - p.origin.z - 2) <= 5,
    )
  )
    return false;
  if (
    Object.values(memory.stations).some(
      (p) => p && position.distanceTo(vector(p)) < 2,
    )
  )
    return false;
  for (const offset of [
    new Vec3(1, 0, 0),
    new Vec3(-1, 0, 0),
    new Vec3(0, 1, 0),
    new Vec3(0, 0, 1),
    new Vec3(0, 0, -1),
  ]) {
    const neighbor = bot.blockAt(position.plus(offset));
    if (!neighbor || /lava|water|sand|gravel/.test(neighbor.name)) return false;
  }
  return true;
}
export async function mine(bot: Bot, memory: TownMemory, signal: AbortSignal) {
  const targets = miningTargets(bot);
  const positions = bot.findBlocks({
    matching: (b) => targets.includes(b.name),
    maxDistance: 24,
    count: 100,
  });
  for (const position of positions) {
    signal.throwIfAborted();
    if (nearbyThreat(bot))
      throw new Replan("Not mining with something chasing me.");
    if (!safeMiningPosition(bot, position, memory)) continue;
    const goal = new goals.GoalLookAtBlock(position, bot.world);
    if (!(await reachable(bot, goal, signal))) continue;
    await walk(bot, goal, signal);
    const block = bot.blockAt(position);
    const tool = [
      "diamond_pickaxe",
      "iron_pickaxe",
      "stone_pickaxe",
      "wooden_pickaxe",
    ]
      .map((name) => bot.inventory.items().find((i) => i.name === name))
      .find(Boolean);
    if (
      !block ||
      !targets.includes(block.name) ||
      !tool ||
      !safeMiningPosition(bot, position, memory)
    )
      continue;
    await runAction(() => bot.equip(tool, "hand"), signal);
    const before = bot.inventory.items().reduce((n, i) => n + i.count, 0);
    await runAction(() => bot.dig(block), signal, 15000);
    signal.throwIfAborted();
    if (bot.blockAt(position)?.name !== "air")
      throw new UnsafeOutcome("Mining result was not confirmed.");
    await walk(
      bot,
      new goals.GoalNear(position.x, position.y, position.z, 1),
      signal,
    );
    await runAction(() => bot.waitForTicks(10), signal, 2000);
    if (bot.inventory.items().reduce((n, i) => n + i.count, 0) <= before)
      throw new Replan("Broke the block, but haven't picked up the drop yet.");
    return;
  }
  throw new Replan("Need to explore for a safe, reachable resource deposit.");
}
