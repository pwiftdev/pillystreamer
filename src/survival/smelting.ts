import type { Bot, Furnace } from "mineflayer";
import { runAction } from "../actions.js";
import { isLog } from "../gameplay.js";
import { vector } from "../brain/blueprint.js";
import { Replan, UnsafeOutcome } from "../brain/placement.js";
import { reachStation } from "./navigation.js";
import type { TownMemory } from "../brain/types.js";

const RAW = new Set([
  "beef",
  "porkchop",
  "mutton",
  "chicken",
  "rabbit",
  "cod",
  "salmon",
  "potato",
]);
export function smeltInput<T extends { name: string }>(items: T[]) {
  return (
    items.find((i) => RAW.has(i.name)) ||
    items.find((i) => i.name === "raw_iron") ||
    items.find((i) => isLog(i.name))
  );
}
export async function workFurnace(
  bot: Bot,
  furnace: Furnace,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const output = furnace.outputItem();
  if (output) {
    await runAction(() => furnace.takeOutput(), signal, 8000);
    signal.throwIfAborted();
    if (furnace.outputItem())
      throw new UnsafeOutcome("Furnace collection wasn't confirmed.");
    return;
  }
  const items = bot.inventory.items();
  const input = smeltInput(items);
  if (!furnace.inputItem()) {
    if (!input) throw new Replan("Nothing to cook or smelt yet.");
    await runAction(() => furnace.putInput(input.type, null, 1), signal, 8000);
    signal.throwIfAborted();
    if (furnace.inputItem()?.name !== input.name)
      throw new UnsafeOutcome("Furnace input wasn't confirmed.");
  }
  if (!furnace.fuelItem() && !(furnace.fuel > 0)) {
    const fuel =
      bot.inventory
        .items()
        .find((i) => ["coal", "charcoal"].includes(i.name)) ||
      bot.inventory.items().find((i) => i.name.endsWith("_planks"));
    if (!fuel)
      throw new Replan("The furnace needs fuel. The input is staying put.");
    await runAction(() => furnace.putFuel(fuel.type, null, 1), signal, 8000);
    signal.throwIfAborted();
    if (!furnace.fuelItem() && !(furnace.fuel > 0))
      throw new UnsafeOutcome("Furnace fuel wasn't confirmed.");
  }
}
export async function smelt(bot: Bot, memory: TownMemory, signal: AbortSignal) {
  const point = memory.stations.furnace;
  const block = point && bot.blockAt(vector(point));
  if (!block || block.name !== "furnace")
    throw new Replan("Need a furnace at the shelter first.");
  await reachStation(bot, memory, block.position, signal);
  const furnace = await runAction(() => bot.openFurnace(block), signal, 8000);
  try {
    await runAction(() => bot.waitForTicks(2), signal, 2000);
    await workFurnace(bot, furnace, signal);
  } finally {
    bot.closeWindow(furnace);
  }
}
