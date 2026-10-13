import type { Experience, TownMemory } from "./types.js";
import { findRoute } from "../pathfinding.js";
import type { Bot } from "mineflayer";
import { Vec3 } from "vec3";
import pathfinder from "mineflayer-pathfinder";
import { setImmediate } from "node:timers/promises";
import { isGround, isReplaceable } from "./blueprint.js";
import { isLog } from "../gameplay.js";
import { Replan, walk } from "./placement.js";

export class Exploration {
  private visited: Vec3[] = [];
  private attempted: Vec3[] = [];
  private heading = 0;
  constructor(history: Experience[] = []) {
    this.visited = history
      .filter((e) => e.task === "explore" && e.outcome === "progress")
      .map((e) => new Vec3(e.position.x, e.position.y, e.position.z));
    this.attempted = history
      .filter((e) => e.outcome === "blocked")
      .map((e) => new Vec3(e.position.x, e.position.y, e.position.z));
  }

  record(position: Vec3) {
    if ((this.visited.at(-1)?.distanceTo(position) ?? Infinity) < 3) return;
    this.visited.push(position.clone());
    if (this.visited.length > 80) this.visited.shift();
  }

  score(bot: Bot, point: Vec3, resources: Vec3[]) {
    const current = bot.entity.position;
    const dx = point.x - current.x;
    const dz = point.z - current.z;
    const distance = Math.hypot(dx, dz);
    const revisits = this.visited.reduce(
      (sum, old) => sum + Math.max(0, 12 - old.distanceTo(point)),
      0,
    );
    const failed = this.attempted.some((old) => old.distanceTo(point) < 4);
    const sky = bot.blockAt(point.offset(0, 1, 0))?.skyLight ?? 0;
    const resourceGain = resources.length
      ? Math.min(...resources.map((p) => p.distanceTo(current))) -
        Math.min(...resources.map((p) => p.distanceTo(point)))
      : 0;
    return (
      sky * 4 -
      Math.max(0, current.y - point.y) * 3 +
      resourceGain * 4 +
      Math.min(distance, 16) +
      (dx * Math.cos(this.heading) + dz * Math.sin(this.heading)) * 0.5 -
      revisits * 3 -
      (failed ? 200 : 0)
    );
  }

  async move(bot: Bot, signal: AbortSignal, memory?: TownMemory) {
    signal.throwIfAborted();
    const start = bot.entity.position.clone();
    this.record(start);
    const resources = bot.findBlocks({
      matching: (b) => isLog(b.name),
      maxDistance: 64,
      count: 32,
    });
    if (!resources.length)
      for (const resource of memory?.resources || []) {
        if (!isLog(resource.name) || Date.now() - resource.at > 1_200_000)
          continue;
        const point = new Vec3(
          resource.position.x,
          resource.position.y,
          resource.position.z,
        );
        const block = bot.blockAt(point);
        if (!block || block.name === resource.name) resources.push(point);
      }
    const failures = (memory?.experiences || []).filter(
      (e) =>
        e.task === "gather" &&
        e.outcome !== "progress" &&
        Date.now() - e.at < 300_000,
    );
    for (let i = resources.length - 1; i >= 0; i--) {
      if (
        failures.filter(
          (e) =>
            Math.hypot(
              e.position.x - resources[i].x,
              e.position.z - resources[i].z,
            ) < 12,
        ).length >= 2
      )
        resources.splice(i, 1);
    }
    if (bot.food < 14) {
      const animals = Object.values(bot.entities).filter((e) =>
        ["cow", "pig", "sheep"].includes(e.name || ""),
      );
      if (animals.length)
        resources.splice(
          0,
          resources.length,
          ...animals.map((e) => e.position),
        );
    }
    const positions = explorationPoints(bot);
    const scores = new Map(
      positions.map((p) => [p, this.score(bot, p, resources)]),
    );
    positions.sort((a, b) => scores.get(b)! - scores.get(a)!);
    const nearby = [...positions].sort(
      (a, b) => a.distanceTo(start) - b.distanceTo(start),
    );
    const candidates = [...positions.slice(0, 20), ...nearby.slice(0, 16)];
    let attempts = 0;
    for (const point of candidates) {
      await setImmediate(undefined, { signal });
      if (++attempts > 36) break;
      const goal = new pathfinder.goals.GoalNear(point.x, point.y, point.z, 1);
      const route = await findRoute(bot, goal, signal);
      if (route?.status !== "success") continue;
      const waypoint = route.path?.[Math.min(5, route.path.length - 1)];
      const nextGoal = waypoint
        ? new pathfinder.goals.GoalBlock(
            Math.floor(waypoint.x),
            Math.floor(waypoint.y),
            Math.floor(waypoint.z),
          )
        : goal;
      this.attempted.push(point.clone());
      if (this.attempted.length > 40) this.attempted.shift();
      try {
        await walk(bot, nextGoal, signal);
      } catch (error) {
        signal.throwIfAborted();
        if (!(error instanceof Replan) || error.urgent) throw error;
        continue;
      }
      signal.throwIfAborted();
      if (bot.entity.position.distanceTo(start) < 2)
        throw new Replan(
          "That route made no progress. Looking for another exit.",
        );
      this.heading = Math.atan2(point.z - start.z, point.x - start.x);
      this.record(bot.entity.position);
      return;
    }
    this.heading += Math.PI / 2;
    throw new Replan(
      "No safe walking route found. Checking another direction.",
    );
  }
}

export function explorationPoints(bot: Bot) {
  const start = bot.entity.position.floored();
  const points: Vec3[] = [];
  const seen = new Set<string>();
  // Sample columns across the area instead of filling the limit with nearby floor blocks.
  for (const radius of [4, 8, 12, 18, 26, 36]) {
    for (let step = 0; step < 24; step++) {
      const angle = (step * Math.PI) / 12;
      const column = start.offset(
        Math.round(Math.cos(angle) * radius),
        0,
        Math.round(Math.sin(angle) * radius),
      );
      const key = `${column.x},${column.z}`;
      if (seen.has(key)) continue;
      seen.add(key);
      for (let dy = 20; dy >= -12; dy--) {
        const ground = column.offset(0, dy, 0);
        if (!isGround(bot.blockAt(ground)?.name || "")) continue;
        if (
          ![1, 2].every((y) =>
            isReplaceable(bot.blockAt(ground.offset(0, y, 0))?.name || ""),
          )
        )
          continue;
        points.push(ground.offset(0, 1, 0));
      }
    }
  }
  return points;
}
