import type { Bot } from "mineflayer";
import pathfinder from "mineflayer-pathfinder";
import { Vec3 } from "vec3";
import { vector } from "../brain/blueprint.js";
import { Replan, verifiedBlockChange, walk } from "../brain/placement.js";
import type { TownMemory } from "../brain/types.js";
import { nearbyThreat } from "./state.js";
const { goals } = pathfinder;
export async function doorState(
  bot: Bot,
  memory: TownMemory,
  open: boolean,
  signal: AbortSignal,
) {
  if (!memory.shelter) throw new Replan("Haven't got a shelter yet.");
  const position = vector(memory.shelter.origin).offset(2, 1, 0);
  const read = () => {
    const block = bot.blockAt(position);
    return block?.name.endsWith("_door")
      ? block.getProperties().open === open
        ? "done"
        : "empty"
      : "blocked";
  };
  await verifiedBlockChange(signal, read, async () => {
    const block = bot.blockAt(position)!;
    await bot.activateBlock(block);
    await bot.waitForTicks(2);
  });
}
export async function enterShelter(
  bot: Bot,
  memory: TownMemory,
  signal: AbortSignal,
) {
  const home = memory.shelter;
  if (!home?.complete) throw new Replan("Need a finished shelter first.");
  const origin = vector(home.origin);
  const p = bot.entity.position;
  const inside =
    Math.abs(p.y - origin.y - 1) < 0.6 &&
    p.x > origin.x + 1 &&
    p.x < origin.x + 4 &&
    p.z > origin.z + 1 &&
    p.z < origin.z + 4;
  if (!inside) {
    const enemy = nearbyThreat(bot);
    if (enemy && enemy.position.distanceTo(origin.offset(2, 1, 2)) < 8)
      throw new Replan("Something's too close to home. Going around.");
    await walk(
      bot,
      new goals.GoalNear(origin.x + 2, origin.y + 1, origin.z - 1, 1),
      signal,
      true,
    );
    await doorState(bot, memory, true, signal);
  }
  await walk(
    bot,
    new goals.GoalBlock(origin.x + 2, origin.y + 1, origin.z + 2),
    signal,
    true,
  );
  await doorState(bot, memory, false, signal);
}
export async function leaveShelter(
  bot: Bot,
  memory: TownMemory,
  signal: AbortSignal,
) {
  if (!memory.shelter?.complete) return;
  const origin = vector(memory.shelter.origin),
    p = bot.entity.position;
  if (
    Math.abs(p.y - origin.y - 1) < 0.5 &&
    p.x > origin.x &&
    p.x < origin.x + 5 &&
    p.z > origin.z &&
    p.z < origin.z + 5
  ) {
    await walk(
      bot,
      new goals.GoalNear(origin.x + 2, origin.y + 1, origin.z + 1, 1),
      signal,
    );
    await doorState(bot, memory, true, signal);
    await walk(
      bot,
      new goals.GoalBlock(origin.x + 2, origin.y + 1, origin.z - 1),
      signal,
    );
    await doorState(bot, memory, false, signal);
  }
}

export async function reachStation(
  bot: Bot,
  memory: TownMemory,
  position: Vec3,
  signal: AbortSignal,
) {
  const home = memory.shelter;
  if (home?.complete) {
    const o = home.origin;
    const inside =
      position.x > o.x &&
      position.x < o.x + 4 &&
      position.z > o.z &&
      position.z < o.z + 4;
    if (inside) await enterShelter(bot, memory, signal);
    else await leaveShelter(bot, memory, signal);
  }
  await walk(
    bot,
    new goals.GoalNear(position.x, position.y, position.z, 2),
    signal,
  );
}
