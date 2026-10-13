import type { Bot } from "mineflayer";
import { inventoryCount } from "../gameplay.js";
import { counts } from "../brain/world-actions.js";
import { inspectProject } from "../brain/building.js";
import { vector } from "../brain/blueprint.js";
import type { TownMemory } from "../brain/types.js";

export const FOOD = new Set([
  "apple",
  "bread",
  "carrot",
  "baked_potato",
  "sweet_berries",
  "melon_slice",
  "cooked_beef",
  "cooked_porkchop",
  "cooked_mutton",
  "cooked_chicken",
  "cooked_rabbit",
  "cooked_cod",
  "cooked_salmon",
  "beef",
  "porkchop",
  "mutton",
]);
export const HOSTILES = new Set([
  "zombie",
  "husk",
  "drowned",
  "skeleton",
  "stray",
  "creeper",
  "spider",
  "cave_spider",
  "witch",
  "pillager",
  "vindicator",
  "phantom",
  "silverfish",
]);
export function visibleThreat(bot: Bot, target: Bot["entity"]["position"]) {
  const eye = bot.entity.position.offset(0, 1.6, 0);
  const direction = target.offset(0, 1, 0).minus(eye);
  const distance = direction.norm();
  return (
    distance < 0.1 ||
    !bot.world.raycast(eye, direction.scaled(1 / distance), distance)
  );
}
export const nearbyThreat = (bot: Bot) =>
  Object.values(bot.entities)
    .filter(
      (e) =>
        HOSTILES.has(e.name || "") &&
        e.position.distanceTo(bot.entity.position) < 14 &&
        visibleThreat(bot, e.position),
    )
    .sort(
      (a, b) =>
        a.position.distanceTo(bot.entity.position) -
        b.position.distanceTo(bot.entity.position),
    )[0];
export const amount = (bot: Bot, name: string) =>
  inventoryCount(bot, (n) => n === name);
export const hasItem = (bot: Bot, name: string) =>
  bot.inventory.slots.some((i) => i?.name === name);

export interface SurvivalState {
  logs: number;
  planks: number;
  saplings: number;
  health: number;
  hunger: number;
  food: number;
  night: boolean;
  danger: boolean;
  day: number;
  shelter: boolean;
  woodenPick: boolean;
  stonePick: boolean;
  ironPick: boolean;
  diamondPick: boolean;
  stoneAxe: boolean;
  ironArmor: boolean;
  cobble: number;
  coal: number;
  rawIron: number;
  iron: number;
  diamonds: number;
  wool: number;
  torches: number;
  table: boolean;
  furnace: boolean;
  bed: boolean;
}
export function survivalState(bot: Bot, memory: TownMemory): SurvivalState {
  return {
    ...counts(bot),
    health: bot.health,
    hunger: bot.food,
    food: inventoryCount(bot, (name) => FOOD.has(name)),
    night: bot.time.timeOfDay >= 12000 && bot.time.timeOfDay < 23500,
    danger: Boolean(nearbyThreat(bot)),
    day: Math.max(1, bot.time.day - (memory.bornDay ?? bot.time.day) + 1),
    shelter: Boolean(
      memory.shelter?.complete &&
      inspectProject(bot, memory.shelter).missing.length === 0 &&
      bot
        .blockAt(vector(memory.shelter.origin).offset(2, 1, 0))
        ?.name.endsWith("_door"),
    ),
    woodenPick: hasItem(bot, "wooden_pickaxe"),
    stonePick: hasItem(bot, "stone_pickaxe"),
    ironPick: hasItem(bot, "iron_pickaxe"),
    diamondPick: hasItem(bot, "diamond_pickaxe"),
    stoneAxe: hasItem(bot, "stone_axe"),
    ironArmor: ["helmet", "chestplate", "leggings", "boots"].every((slot) =>
      ["iron", "diamond", "netherite"].some((tier) =>
        hasItem(bot, `${tier}_${slot}`),
      ),
    ),
    cobble: amount(bot, "cobblestone"),
    coal: amount(bot, "coal") + amount(bot, "charcoal"),
    rawIron: amount(bot, "raw_iron"),
    iron: amount(bot, "iron_ingot"),
    torches: amount(bot, "torch"),
    diamonds: amount(bot, "diamond"),
    wool: Math.max(
      0,
      ...bot.inventory
        .items()
        .filter((i) => i.name.endsWith("_wool"))
        .map((i) => i.count),
    ),
    table: Boolean(
      memory.stations.table &&
      bot.blockAt(vector(memory.stations.table))?.name === "crafting_table",
    ),
    furnace: Boolean(
      memory.stations.furnace &&
      bot.blockAt(vector(memory.stations.furnace))?.name === "furnace",
    ),
    bed: Boolean(
      memory.stations.bed &&
      bot.blockAt(vector(memory.stations.bed))?.name.endsWith("_bed"),
    ),
  };
}
export function townReady(s: SurvivalState) {
  return (
    s.day >= 10 &&
    s.shelter &&
    s.bed &&
    s.ironArmor &&
    s.diamondPick &&
    s.food >= 16 &&
    s.torches >= 8 &&
    s.health >= 16 &&
    s.hunger >= 16
  );
}
export function chapter(s: SurvivalState) {
  if (townReady(s)) return "Pumpville";
  if (!s.shelter) return "First shelter";
  if (!s.stonePick && !s.ironPick && !s.diamondPick)
    return "Getting established";
  if (!s.ironPick && !s.diamondPick) return "Stone age";
  return "Survival adventures";
}
