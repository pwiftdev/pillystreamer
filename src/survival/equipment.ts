import type { Bot } from "mineflayer";
import { runAction } from "../actions.js";
import { craft, inventoryCount } from "../gameplay.js";
import { isPlank } from "../brain/blueprint.js";
import { Replan } from "../brain/placement.js";
import type { TownMemory } from "../brain/types.js";
import { amount, hasItem } from "./state.js";
import { craftAtTable, ensureStation } from "./stations.js";

export function nextEquipment(bot: Bot): string | null {
  if (
    !["wooden", "stone", "iron", "diamond"].some((t) =>
      hasItem(bot, `${t}_pickaxe`),
    )
  )
    return "wooden_pickaxe";
  if (amount(bot, "diamond") >= 3 && !hasItem(bot, "diamond_pickaxe"))
    return "diamond_pickaxe";
  if (
    amount(bot, "iron_ingot") >= 3 &&
    !hasItem(bot, "iron_pickaxe") &&
    !hasItem(bot, "diamond_pickaxe")
  )
    return "iron_pickaxe";
  if (
    amount(bot, "cobblestone") >= 3 &&
    !["stone", "iron", "diamond"].some((t) => hasItem(bot, `${t}_pickaxe`))
  )
    return "stone_pickaxe";
  if (amount(bot, "cobblestone") >= 3 && !hasItem(bot, "stone_axe"))
    return "stone_axe";
  if (
    amount(bot, "coal") + amount(bot, "charcoal") > 0 &&
    amount(bot, "torch") < 12
  )
    return "torch";
  for (const [part, cost] of [
    ["chestplate", 8],
    ["leggings", 7],
    ["helmet", 5],
    ["boots", 4],
  ] as const)
    if (!hasItem(bot, `iron_${part}`) && amount(bot, "iron_ingot") >= cost)
      return `iron_${part}`;
  return null;
}
export async function equipArmor(bot: Bot, signal: AbortSignal) {
  for (const [part, destination] of [
    ["helmet", "head"],
    ["chestplate", "torso"],
    ["leggings", "legs"],
    ["boots", "feet"],
  ] as const) {
    const item = bot.inventory.items().find((i) => i.name === `iron_${part}`);
    if (item) await runAction(() => bot.equip(item, destination), signal);
  }
}
export async function makeEquipment(
  bot: Bot,
  memory: TownMemory,
  signal: AbortSignal,
) {
  await ensureStation(bot, memory, "table", signal);
  const name = nextEquipment(bot);
  if (!name) throw new Replan("Gear is sorted for the supplies I have.");
  if (
    !name.endsWith("plate") &&
    !/leggings|helmet|boots/.test(name) &&
    amount(bot, "stick") < 4
  ) {
    if (inventoryCount(bot, isPlank) < 2)
      throw new Replan("Need planks for more sticks.");
    await craft(bot, "stick", 1, signal);
  }
  await craftAtTable(bot, memory, name, signal);
  await equipArmor(bot, signal);
}
