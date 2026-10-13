import type { Bot } from "mineflayer";
import pathfinder from "mineflayer-pathfinder";
import { Vec3 } from "vec3";
import { craft, inventoryCount } from "../gameplay.js";
import { runAction } from "../actions.js";
import { isGround, isPlank, vector } from "../brain/blueprint.js";
import { saveMemory } from "../brain/memory.js";
import {
  placeAt,
  Replan,
  verifiedBlockChange,
  walk,
} from "../brain/placement.js";
import type { Point, TownMemory } from "../brain/types.js";
import { reachStation } from "./navigation.js";
import { amount } from "./state.js";

const { goals } = pathfinder;
export async function craftAtTable(
  bot: Bot,
  memory: TownMemory,
  name: string,
  signal: AbortSignal,
  times = 1,
) {
  const position = memory.stations.table;
  if (position) await reachStation(bot, memory, vector(position), signal);
  const table = position ? bot.blockAt(vector(position)) : null;
  if (!table || table.name !== "crafting_table")
    throw new Replan("Need my crafting table first.");
  if (
    !bot.recipesFor(bot.registry.itemsByName[name]?.id ?? -1, null, 1, table)
      .length
  )
    throw new Replan("Need a few more supplies for that upgrade.");
  await craft(bot, name, times, signal, table);
  signal.throwIfAborted();
}
export async function ensureStation(
  bot: Bot,
  memory: TownMemory,
  kind: "table" | "furnace",
  signal: AbortSignal,
) {
  const name = kind === "table" ? "crafting_table" : "furnace";
  let point = memory.stations[kind];
  if (point && !bot.blockAt(vector(point)))
    await walk(bot, new goals.GoalNear(point.x, point.y, point.z, 2), signal);
  if (point && bot.blockAt(vector(point))?.name === name)
    return bot.blockAt(vector(point))!;
  if (!amount(bot, name)) {
    if (kind === "table") {
      if (inventoryCount(bot, isPlank) < 4)
        throw new Replan("Need four planks for a crafting table.");
      await craft(bot, name, 1, signal);
    } else await craftAtTable(bot, memory, name, signal);
  }
  if (!point) {
    let spot: Vec3 | undefined;
    if (memory.shelter?.complete)
      spot = vector(memory.shelter.origin).offset(
        3,
        1,
        kind === "table" ? 1 : 2,
      );
    else {
      const ground = bot.findBlocks({
        matching: (b) => isGround(b.name),
        maxDistance: 8,
        count: 100,
      });
      spot = ground
        .map((p) => p.offset(0, 1, 0))
        .find(
          (p) =>
            bot.blockAt(p)?.name === "air" &&
            bot.blockAt(p.offset(0, 1, 0))?.name === "air" &&
            p.distanceTo(bot.entity.position) > 1.5,
        );
    }
    if (!spot) throw new Replan("Need an open spot for my supplies.");
    point = { x: spot.x, y: spot.y, z: spot.z };
    memory.stations[kind] = point;
    await saveMemory(memory);
  }
  await reachStation(bot, memory, vector(point), signal);
  await placeAt(bot, vector(point), name, signal);
  return bot.blockAt(vector(point))!;
}
export async function placeFloorItem(
  bot: Bot,
  point: Point,
  name: string,
  stand: Vec3,
  signal: AbortSignal,
  complete: () => boolean,
) {
  const target = vector(point);
  await walk(bot, new goals.GoalBlock(stand.x, stand.y, stand.z), signal);
  const item = bot.inventory.items().find((i) => i.name === name);
  const floor = bot.blockAt(target.offset(0, -1, 0));
  if (!item || !floor || floor.boundingBox !== "block")
    throw new Replan("Need supplies and a solid floor first.");
  await runAction(() => bot.equip(item, "hand"), signal);
  await verifiedBlockChange(
    signal,
    () =>
      complete()
        ? "done"
        : bot.blockAt(target)?.name === "air"
          ? "empty"
          : "blocked",
    () => bot.placeBlock(floor, new Vec3(0, 1, 0)),
  );
}
