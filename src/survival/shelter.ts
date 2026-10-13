import type { Bot } from "mineflayer";
import { setTimeout as delay } from "node:timers/promises";
import { runAction } from "../actions.js";
import { vector } from "../brain/blueprint.js";
import { buildBatch, inspectProject } from "../brain/building.js";
import { findPlot } from "../brain/scouting.js";
import { saveMemory } from "../brain/memory.js";
import { placeAt, Replan } from "../brain/placement.js";
import type { TownMemory } from "../brain/types.js";
import { craftAtTable, ensureStation, placeFloorItem } from "./stations.js";
import { amount } from "./state.js";

import { enterShelter } from "./navigation.js";
export async function buildShelter(
  bot: Bot,
  memory: TownMemory,
  signal: AbortSignal,
  progress: (done: number, total: number) => void,
) {
  if (!memory.shelter) {
    const plot = await findPlot(bot, memory, signal);
    if (!plot) throw new Replan("Need a clear spot for a simple shelter.");
    memory.shelter = { ...plot, id: 0, shelter: true };
    await saveMemory(memory);
  }
  const shell = await buildBatch(
    bot,
    memory.shelter,
    memory,
    signal,
    progress,
    1,
  );
  if (!shell) return;
  await ensureStation(bot, memory, "table", signal);
  const door = vector(memory.shelter.origin).offset(2, 1, 0);
  if (!bot.blockAt(door)?.name.endsWith("_door")) {
    const carried = bot.inventory.items().find((i) => i.name.endsWith("_door"));
    const wood = bot.inventory
      .items()
      .find((i) => i.name.endsWith("_planks") && i.count >= 6);
    if (!carried && !wood)
      throw new Replan("Need six matching planks for a door.");
    const name = carried?.name || wood!.name.replace("_planks", "_door");
    if (!carried) await craftAtTable(bot, memory, name, signal);
    await placeFloorItem(
      bot,
      door,
      name,
      door.offset(0, 0, -1),
      signal,
      () =>
        bot.blockAt(door)?.name === name &&
        bot.blockAt(door.offset(0, 1, 0))?.name === name,
    );
  }
  const view = inspectProject(bot, memory.shelter);
  if (!view.loaded || view.missing.length)
    throw new Replan("Need to finish the shelter walls first.");
  memory.shelter.complete = true;
  await saveMemory(memory);
}
export async function improveCamp(
  bot: Bot,
  memory: TownMemory,
  signal: AbortSignal,
) {
  if (!memory.shelter?.complete)
    throw new Replan("Shelter comes before furnishings.");
  const origin = vector(memory.shelter.origin);
  if (
    (!memory.stations.furnace ||
      bot.blockAt(vector(memory.stations.furnace))?.name !== "furnace") &&
    amount(bot, "cobblestone") >= 8
  ) {
    await ensureStation(bot, memory, "furnace", signal);
    return;
  }
  await enterShelter(bot, memory, signal);
  const light = origin.offset(3, 1, 3);
  if (!bot.blockAt(light)?.name.endsWith("torch") && amount(bot, "torch") > 0) {
    await placeAt(bot, light, "torch", signal, (name) =>
      name.endsWith("torch"),
    );
    return;
  }
  if (!memory.stations.bed) {
    const wool = bot.inventory
      .items()
      .find((i) => i.name.endsWith("_wool") && i.count >= 3);
    const carriedBed = bot.inventory
      .items()
      .find((i) => i.name.endsWith("_bed"));
    if (!wool && !carriedBed)
      throw new Replan("Need three matching wool for a bed.");
    const name = carriedBed?.name || wool!.name.replace("_wool", "_bed");
    if (!carriedBed) await craftAtTable(bot, memory, name, signal);
    memory.stations.bed = origin.offset(1, 1, 2);
    await saveMemory(memory);
  }
  const foot = vector(memory.stations.bed);
  if (bot.blockAt(foot)?.name.endsWith("_bed")) return;
  const item = bot.inventory.items().find((i) => i.name.endsWith("_bed"));
  if (!item || bot.blockAt(foot.offset(0, 0, 1))?.name !== "air")
    throw new Replan("Need a bed and space to put it.");
  await enterShelter(bot, memory, signal);
  await placeFloorItem(
    bot,
    foot,
    item.name,
    foot.offset(0, 0, -1),
    signal,
    () =>
      bot.blockAt(foot)?.name === item.name &&
      bot.blockAt(foot.offset(0, 0, 1))?.name === item.name,
  );
}
export async function sleep(bot: Bot, memory: TownMemory, signal: AbortSignal) {
  await enterShelter(bot, memory, signal);
  const bed = memory.stations.bed && bot.blockAt(vector(memory.stations.bed));
  if (!bed?.name.endsWith("_bed"))
    throw new Replan("Need a bed before I can sleep.");
  if (!bot.isSleeping) {
    try {
      await runAction(() => bot.sleep(bed), signal, 8000);
    } catch (error) {
      signal.throwIfAborted();
      if (
        error instanceof Error &&
        /not night|bed is occupied|monsters nearby|bed is too far|cant click/.test(
          error.message,
        )
      )
        throw new Replan(
          "Can't sleep here right now. Staying sheltered instead.",
        );
      throw error;
    }
  }
  await delay(2000, undefined, { signal });
}
