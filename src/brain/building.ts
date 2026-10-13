import { reachable } from "../pathfinding.js";
import type { Bot } from "mineflayer";
import pathfinder from "mineflayer-pathfinder";
import { Vec3 } from "vec3";
import { runAction } from "../actions.js";
import { constructionPlan, houseBlocks, isPlank, vector } from "./blueprint.js";
import { Replan, UnsafeOutcome, walk, placeAt } from "./placement.js";
import type { Project, TownMemory } from "./types.js";

const { goals } = pathfinder;
export function inspectProject(bot: Bot, project: Project) {
  const blocks = houseBlocks(project);
  const loaded = blocks.every((p) => bot.blockAt(p));
  const missing = blocks.filter((p) => !isPlank(bot.blockAt(p)?.name || ""));
  return { blocks, missing, loaded, done: blocks.length - missing.length };
}

async function openRoofAccess(bot: Bot, wall: Vec3[], signal: AbortSignal) {
  for (const position of wall) {
    if (!isPlank(bot.blockAt(position)?.name || "")) continue;
    const goal = new goals.GoalLookAtBlock(position, bot.world);
    if (!(await reachable(bot, goal, signal))) continue;
    await walk(bot, goal, signal);
    const block = bot.blockAt(position);
    if (!block || !isPlank(block.name)) continue;
    await runAction(() => bot.dig(block), signal);
    signal.throwIfAborted();
    if (bot.blockAt(position)?.name !== "air")
      throw new UnsafeOutcome("The building adjustment wasn't confirmed.");
    return true;
  }
  return false;
}
export async function buildBatch(
  bot: Bot,
  project: Project,
  memory: TownMemory,
  signal: AbortSignal,
  progress: (done: number, total: number) => void,
  batchSize = 6,
) {
  if (bot.entity.position.distanceTo(vector(project.origin)) > 10)
    await walk(
      bot,
      new goals.GoalNear(
        project.origin.x + 2,
        project.origin.y + 1,
        project.origin.z - 2,
        3,
      ),
      signal,
    );
  for (let i = 0; i < batchSize; i++) {
    const view = inspectProject(bot, project);
    progress(view.done, view.blocks.length);
    if (!view.loaded)
      throw new Replan("Waiting for the building site to come into view.");
    if (!view.missing.length) return true;
    const planks = bot.inventory.items().filter((i) => isPlank(i.name));
    const material =
      planks.find((i) => i.name === `${memory.wood}_planks`) || planks[0];
    if (!material) return false;
    let placed = false;
    const { pending, access } = constructionPlan(project, view.missing);
    for (const position of pending.slice(0, 25)) {
      try {
        await placeAt(bot, position, material.name, signal, isPlank);
        placed = true;
        break;
      } catch (error) {
        if (!(error instanceof Replan) || error.urgent) throw error;
      }
    }
    if (!placed && (await openRoofAccess(bot, access, signal))) return false;
    if (!placed)
      throw new Replan("Need another approach to this part of the house.");
  }
  const view = inspectProject(bot, project);
  progress(view.done, view.blocks.length);
  return view.loaded && !view.missing.length;
}
