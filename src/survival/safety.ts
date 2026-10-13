import { inspectProject } from "../brain/building.js";
import { reachable } from "../pathfinding.js";
import type { Bot } from "mineflayer";
import pathfinder from "mineflayer-pathfinder";
import { setTimeout as delay } from "node:timers/promises";
import { explorationPoints } from "../brain/exploration.js";
import { Replan, walk } from "../brain/placement.js";
import type { TownMemory } from "../brain/types.js";
import { HOSTILES, nearbyThreat, visibleThreat } from "./state.js";
import { enterShelter } from "./navigation.js";

export async function retreat(
  bot: Bot,
  memory: TownMemory,
  signal: AbortSignal,
) {
  const home = memory.shelter && inspectProject(bot, memory.shelter);
  if (memory.shelter?.complete && home?.loaded && !home.missing.length) {
    try {
      await enterShelter(bot, memory, signal);
      await delay(3000, undefined, { signal });
      return;
    } catch (error) {
      if (!(error instanceof Replan) || error.urgent) throw error;
      if (!nearbyThreat(bot))
        throw new Replan(
          "The shelter entrance is blocked. Need another approach.",
        );
    }
  }
  const threat = nearbyThreat(bot);
  const enemies = Object.values(bot.entities).filter(
    (e) => HOSTILES.has(e.name || "") && visibleThreat(bot, e.position),
  );
  const positions = explorationPoints(bot);
  const score = (p: Bot["entity"]["position"]) =>
    (threat ? p.distanceTo(threat.position) : 0) -
    p.distanceTo(bot.entity.position) * 0.7 +
    (bot.blockAt(p.offset(0, 3, 0))?.boundingBox === "block" ? 8 : 0);
  const spots = positions
    .filter(
      (p) =>
        p.distanceTo(bot.entity.position) > 4 &&
        enemies.every((e) => e.position.distanceTo(p) > 12),
    )
    .sort((a, b) => score(b) - score(a));
  for (const point of spots.slice(0, 20)) {
    signal.throwIfAborted();
    const goal = new pathfinder.goals.GoalNear(point.x, point.y, point.z, 1);
    if (!(await reachable(bot, goal, signal))) continue;
    await walk(bot, goal, signal, true);
    await delay(1000, undefined, { signal });
    return;
  }
  throw new Replan(
    "No clear escape route yet. Keeping an eye on what's nearby.",
  );
}
