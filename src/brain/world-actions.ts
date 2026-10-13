import { TravelInterrupted } from "./travel.js";
import type { Bot } from "mineflayer";
import { Vec3 } from "vec3";
import { craft, inventoryCount, isLog, gatherWood } from "../gameplay.js";
import { isPlank } from "./blueprint.js";
import { Replan, placeAt } from "./placement.js";
import type { TownMemory } from "./types.js";

export const counts = (bot: Bot) => ({
  logs: inventoryCount(bot, isLog),
  planks: inventoryCount(bot, isPlank),
  saplings: inventoryCount(bot, (name) => /^(oak|birch)_sapling$/.test(name)),
});
function protectedLog(position: Vec3, memory: TownMemory) {
  return [...memory.projects, ...(memory.shelter ? [memory.shelter] : [])].some(
    (p) =>
      Math.abs(position.x - (p.origin.x + 2)) <= 5 &&
      Math.abs(position.z - (p.origin.z + 2)) <= 5,
  );
}
export async function gatherBatch(
  bot: Bot,
  memory: TownMemory,
  signal: AbortSignal,
  excluded: Set<string>,
) {
  try {
    await gatherWood(bot, inventoryCount(bot, isLog) + 1, signal, () => {}, {
      excluded,
      height: 16,
      allow: (position) => !protectedLog(position, memory),
    });
  } catch (error) {
    signal.throwIfAborted();
    bot.pathfinder.setGoal(null);
    bot.clearControlStates();
    if (error instanceof TravelInterrupted)
      throw new Replan(error.message, error.urgent);
    if (
      error instanceof Error &&
      (["NoPath", "Timeout"].includes(error.name) ||
        /No nearby reachable trees|insufficient progress/.test(error.message))
    )
      throw new Replan("Time to find a fresh patch of reachable trees.");
    throw error;
  }
  signal.throwIfAborted();
}

export async function craftBatch(
  bot: Bot,
  memory: TownMemory,
  signal: AbortSignal,
) {
  const logs = bot.inventory.items().filter((i) => isLog(i.name));
  const log = logs.find((i) => i.name === `${memory.wood}_log`) || logs[0];
  if (!log) throw new Replan("Need wood before crafting.");
  await craft(
    bot,
    log.name.replace(/_log$/, "_planks"),
    Math.min(log.count, 8),
    signal,
  );
  signal.throwIfAborted();
}

export async function plantTree(
  bot: Bot,
  memory: TownMemory,
  signal: AbortSignal,
) {
  const item = bot.inventory
    .items()
    .find((i) => /^(oak|birch)_sapling$/.test(i.name));
  if (!item) throw new Replan("No saplings in the bag yet.");
  const ground = bot.findBlocks({
    matching: (b) => b.name === "grass_block",
    maxDistance: 16,
    count: 80,
  });
  for (const position of ground) {
    const target = position.offset(0, 1, 0);
    if (protectedLog(target, memory)) continue;
    if (
      bot.blockAt(target)?.name !== "air" ||
      bot.blockAt(target.offset(0, 1, 0))?.name !== "air"
    )
      continue;
    try {
      await placeAt(bot, target, item.name, signal);
      return;
    } catch (error) {
      if (!(error instanceof Replan) || error.urgent) throw error;
    }
  }
  throw new Replan("Need an open spot for this sapling.");
}
