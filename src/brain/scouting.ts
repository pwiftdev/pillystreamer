import { reachable } from "../pathfinding.js";
import type { Bot } from "mineflayer";
import pathfinder from "mineflayer-pathfinder";
import { setImmediate } from "node:timers/promises";
import { vector, isGround, isReplaceable } from "./blueprint.js";
import type { Project, TownMemory } from "./types.js";

const { goals } = pathfinder;
export async function findPlot(
  bot: Bot,
  memory: TownMemory,
  signal: AbortSignal,
): Promise<Project | null> {
  const ground = bot.findBlocks({
    matching: (b) => isGround(b.name),
    useExtraInfo: (b) =>
      Math.abs(b.position.y - bot.entity.position.y) < 10 &&
      isReplaceable(bot.blockAt(b.position.offset(0, 1, 0))?.name || ""),
    maxDistance: 40,
    count: 1200,
  });
  const center = vector(memory.center);
  const candidates = ground.filter(
    (p) =>
      p.distanceTo(center) < 128 &&
      ![...memory.projects, ...(memory.shelter ? [memory.shelter] : [])].some(
        (project) =>
          Math.abs(p.x - project.origin.x) < 9 &&
          Math.abs(p.z - project.origin.z) < 9,
      ),
  );
  for (let i = 0; i < candidates.length; i++) {
    if (i % 20 === 0) await setImmediate(undefined, { signal });
    const ground = candidates[i];
    let clear = true;
    const heights: number[] = [];
    for (let z = 0; z < 5 && clear; z++)
      for (let x = 0; x < 5 && clear; x++) {
        let height: number | undefined;
        for (let dy = 1; dy >= -1; dy--) {
          const p = ground.offset(x, dy, z);
          if (
            isGround(bot.blockAt(p)?.name || "") &&
            isReplaceable(bot.blockAt(p.offset(0, 1, 0))?.name || "")
          ) {
            height = p.y;
            break;
          }
        }
        if (height === undefined) clear = false;
        else heights.push(height);
      }
    if (!clear || Math.max(...heights) - Math.min(...heights) > 1) continue;
    const origin = ground.offset(0, Math.max(...heights) - ground.y + 1, 0);
    if (!isGround(bot.blockAt(origin.offset(2, -1, -1))?.name || "")) continue;
    if (
      ![0, 1, 2, 3].every((y) =>
        isReplaceable(bot.blockAt(origin.offset(2, y, -1))?.name || ""),
      )
    )
      continue;
    for (let z = 0; z < 5 && clear; z++)
      for (let x = 0; x < 5 && clear; x++) {
        for (let y = 0; y <= 4; y++)
          if (!isReplaceable(bot.blockAt(origin.offset(x, y, z))?.name || "")) {
            clear = false;
            break;
          }
      }
    if (!clear) continue;
    const goal = new goals.GoalNear(origin.x + 2, origin.y, origin.z - 1, 2);
    if (!(await reachable(bot, goal, signal))) continue;
    return {
      id: memory.projects.length + 1,
      origin: { x: origin.x, y: origin.y, z: origin.z },
      complete: false,
    };
  }
  return null;
}
