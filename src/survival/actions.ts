import type { Bot } from "mineflayer";
import type { TaskKind, TownMemory } from "../brain/types.js";
import { eat, forage } from "./food.js";
import { makeEquipment } from "./equipment.js";
import { mine } from "./mining.js";
import { smelt } from "./smelting.js";
import { buildShelter, improveCamp, sleep } from "./shelter.js";
import { retreat } from "./safety.js";

export const survivalActions: Partial<
  Record<
    TaskKind,
    (
      bot: Bot,
      memory: TownMemory,
      signal: AbortSignal,
      progress: (done: number, total: number) => void,
    ) => Promise<void>
  >
> = {
  eat: (bot, _memory, signal) => eat(bot, signal),
  forage: (bot, memory, signal) =>
    forage(
      bot,
      signal,
      Boolean(memory.shelter?.complete && !memory.stations.bed),
    ),
  shelter: buildShelter,
  retreat,
  tools: makeEquipment,
  mine,
  smelt,
  camp: improveCamp,
  sleep,
};
