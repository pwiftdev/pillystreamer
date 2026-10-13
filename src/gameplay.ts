import { HOSTILES } from "./survival/state.js";
import { Replan } from "./brain/placement.js";
import { guardedTravel } from "./brain/travel.js";
import { reachable } from "./pathfinding.js";
import type { Bot } from "mineflayer";
import pathfinder from "mineflayer-pathfinder";
import { syncInventory, confirmedCraft } from "./inventory.js";
import { setImmediate } from "node:timers/promises";

const { Movements, goals } = pathfinder;
export const isLog = (name: string) =>
  /^(oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry)_log$/.test(name);

export const isNavigationDig = (name: string) =>
  isLog(name) ||
  name.endsWith("_leaves") ||
  [
    "dirt",
    "grass_block",
    "coarse_dirt",
    "podzol",
    "rooted_dirt",
    "moss_block",
    "snow",
  ].includes(name);

export function inventoryCount(bot: Bot, matches: (name: string) => boolean) {
  return bot.inventory
    .items()
    .reduce((total, item) => total + (matches(item.name) ? item.count : 0), 0);
}

export function configureMovement(bot: Bot) {
  const movements = new Movements(bot);
  movements.exclusionAreasBreak.push((block) =>
    isNavigationDig(block.name) ? 0 : 100,
  );
  let enemies: Bot["entity"][] = [];
  let refreshed = 0;
  movements.exclusionAreasStep.push((block) => {
    if (Date.now() - refreshed > 250) {
      enemies = Object.values(bot.entities).filter((e) =>
        HOSTILES.has(e.name || ""),
      );
      refreshed = Date.now();
    }
    return enemies.some((e) => e.position.distanceTo(block.position) < 5)
      ? 100
      : 0;
  });
  movements.allow1by1towers = false;
  movements.allowParkour = false;
  movements.maxDropDown = 2;
  movements.allowSprinting = false;
  bot.pathfinder.setMovements(movements);
  bot.collectBlock.movements = undefined;
  bot.pathfinder.thinkTimeout = 5_000;
}

export interface LogSearch {
  excluded?: Set<string>;
  allow?: (position: Bot["entity"]["position"]) => boolean;
  height?: number;
}

async function findReachableLog(
  bot: Bot,
  signal: AbortSignal,
  search: LogSearch,
) {
  const positions = bot.findBlocks({
    matching: (block) => isLog(block.name),
    useExtraInfo: (block) =>
      block.position.y <= bot.entity.position.y + (search.height ?? 4),
    maxDistance: 48,
    count: 32,
  });
  for (const position of positions) {
    await setImmediate(undefined, { signal });
    if (
      search.excluded?.has(position.toString()) ||
      (search.allow && !search.allow(position))
    )
      continue;
    const block = bot.blockAt(position);
    if (!block || !isLog(block.name)) continue;
    const found = await reachable(
      bot,
      new goals.GoalLookAtBlock(position, bot.world),
      signal,
    );
    if (found) return block;
  }
  return null;
}

export async function gatherWood(
  bot: Bot,
  target: number,
  signal: AbortSignal,
  report: (message: string) => void,
  search: LogSearch = {},
) {
  let attempts = 0;
  while (inventoryCount(bot, isLog) < target) {
    signal.throwIfAborted();
    if (++attempts > target * 3)
      throw new Error("Wood collection made insufficient progress. Stopping.");
    const block = await findReachableLog(bot, signal, search);
    if (!block)
      throw new Error(
        "No nearby reachable trees. Move Pilly near a forest and restart the bot.",
      );
    search.excluded?.add(block.position.toString());
    report(`Collecting ${block.name} at ${block.position}`);
    await guardedTravel(bot, () => bot.collectBlock.collect(block), signal);
    report(`Wood: ${inventoryCount(bot, isLog)}/${target}`);
  }
}

export async function craft(
  bot: Bot,
  name: string,
  times: number,
  signal: AbortSignal,
  table: ReturnType<Bot["blockAt"]> = null,
) {
  const item = bot.registry.itemsByName[name];
  if (!item) throw new Error(`Unknown item: ${name}`);
  if (!Number.isInteger(times) || times < 1 || times > 8)
    throw new Error("Invalid crafting batch size.");
  await syncInventory(bot, signal);
  for (let i = 0; i < times; i++) {
    signal.throwIfAborted();
    const recipe = bot.recipesFor(item.id, null, 1, table)[0];
    if (!recipe) {
      if (i > 0) return;
      throw new Replan(`Need supplies to craft ${name}.`);
    }
    await confirmedCraft(
      signal,
      () => inventoryCount(bot, (n) => n === name),
      () => syncInventory(bot, signal),
      () => bot.craft(recipe, 1, table ?? undefined),
      recipe.result.count,
    );
  }
}
