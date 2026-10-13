import type { Bot } from "mineflayer";
import { HOSTILES, survivalState } from "../survival/state.js";
import { inspectProject } from "./building.js";
import type { Experience, Point, TaskKind, TownMemory } from "./types.js";

export const positionOf = (p: Point): Point => ({
  x: Math.floor(p.x),
  y: Math.floor(p.y),
  z: Math.floor(p.z),
});
export function evidence(bot: Bot, memory: TownMemory) {
  const inventory: Record<string, number> = {};
  for (const item of bot.inventory.items())
    inventory[item.name] = (inventory[item.name] || 0) + item.count;
  return {
    position: positionOf(bot.entity.position),
    inventory,
    health: bot.health,
    hunger: bot.food,
    shelterBlocks: memory.shelter
      ? inspectProject(bot, memory.shelter).done
      : 0,
    houseBlocks: memory.projects.reduce(
      (n, p) => n + inspectProject(bot, p).done,
      0,
    ),
    stations: JSON.stringify(memory.stations),
    planted: memory.planted,
    sleeping: bot.isSleeping,
  };
}
export type Evidence = ReturnType<typeof evidence>;
export function outcome(before: Evidence, after: Evidence): string {
  const changes: string[] = [];
  for (const name of new Set([
    ...Object.keys(before.inventory),
    ...Object.keys(after.inventory),
  ])) {
    const delta = (after.inventory[name] || 0) - (before.inventory[name] || 0);
    if (delta) changes.push(`${name} ${delta > 0 ? "+" : ""}${delta}`);
  }
  if (after.shelterBlocks > before.shelterBlocks)
    changes.push(
      `shelter blocks +${after.shelterBlocks - before.shelterBlocks}`,
    );
  if (after.houseBlocks > before.houseBlocks)
    changes.push(`house blocks +${after.houseBlocks - before.houseBlocks}`);
  if (after.stations !== before.stations) changes.push("camp station changed");
  if (after.planted > before.planted) changes.push("sapling planted");
  if (after.hunger > before.hunger)
    changes.push(`hunger +${after.hunger - before.hunger}`);
  if (after.health !== before.health)
    changes.push(`health ${after.health - before.health}`);
  const distance = Math.hypot(
    after.position.x - before.position.x,
    after.position.y - before.position.y,
    after.position.z - before.position.z,
  );
  if (distance >= 2) changes.push(`moved ${Math.round(distance)} blocks`);
  if (!before.sleeping && after.sleeping) changes.push("sleeping");
  return changes.join(", ").slice(0, 180);
}
export function remember(
  memory: TownMemory,
  task: TaskKind,
  before: Evidence,
  after: Evidence,
  blocked = false,
  now = Date.now(),
): Experience {
  const change = outcome(before, after);
  const inventoryChanged = [
    ...new Set([
      ...Object.keys(before.inventory),
      ...Object.keys(after.inventory),
    ]),
  ].some(
    (name) => (before.inventory[name] || 0) !== (after.inventory[name] || 0),
  );
  const useful =
    inventoryChanged ||
    after.shelterBlocks > before.shelterBlocks ||
    after.houseBlocks > before.houseBlocks ||
    after.stations !== before.stations ||
    after.planted > before.planted ||
    after.hunger > before.hunger ||
    after.health > before.health ||
    (!before.sleeping && after.sleeping) ||
    (["explore", "retreat", "scout"].includes(task) &&
      Math.hypot(
        after.position.x - before.position.x,
        after.position.y - before.position.y,
        after.position.z - before.position.z,
      ) >= 2);
  const entry: Experience = {
    task,
    at: now,
    position: after.position,
    outcome: blocked ? "blocked" : useful ? "progress" : "no_progress",
    evidence:
      change ||
      (blocked
        ? "Attempt blocked; no observed progress."
        : "No observable change yet."),
  };
  if (
    entry.outcome !== "no_progress" ||
    !["retreat", "sleep", "rest"].includes(task)
  )
    memory.experiences = [...(memory.experiences || []).slice(-39), entry];
  return entry;
}
export function nearbyFailures(
  memory: TownMemory,
  task: TaskKind,
  p: Point,
  now = Date.now(),
) {
  return (memory.experiences || []).filter(
    (e) =>
      e.task === task &&
      e.outcome !== "progress" &&
      now - e.at < 300_000 &&
      Math.hypot(e.position.x - p.x, e.position.y - p.y, e.position.z - p.z) <
        12,
  ).length;
}
export function observe(bot: Bot, memory: TownMemory) {
  const here = bot.entity.position;
  const groups = [
    { match: (name: string) => name.endsWith("_log"), count: 8 },
    { match: (name: string) => name.endsWith("_ore"), count: 6 },
    { match: (name: string) => name === "stone", count: 4 },
    {
      match: (name: string) => ["sweet_berry_bush", "water"].includes(name),
      count: 4,
    },
  ];
  const resources = groups
    .flatMap((group) =>
      bot.findBlocks({
        matching: (b) => group.match(b.name),
        maxDistance: 32,
        count: group.count,
      }),
    )
    .map((p) => ({
      name: bot.blockAt(p)?.name,
      position: positionOf(p),
      distance: Math.round(p.distanceTo(here)),
      reachability: "unverified; action must check route",
    }));
  const remembered = new Map(
    (memory.resources || []).map((r) => [JSON.stringify(r.position), r]),
  );
  for (const resource of resources)
    if (resource.name)
      remembered.set(JSON.stringify(resource.position), {
        name: resource.name,
        position: resource.position,
        at: Date.now(),
      });
  memory.resources = [...remembered.values()]
    .sort((a, b) => a.at - b.at)
    .slice(-32);
  return {
    ...evidence(bot, memory),
    survival: survivalState(bot, memory),
    timeOfDay: bot.time.timeOfDay,
    skyLight: bot.blockAt(here.floored().offset(0, 1, 0))?.skyLight ?? null,
    terrain: [-1, 0, 1].flatMap((x) =>
      [-1, 0, 1].map((z) => ({
        dx: x,
        dz: z,
        ground:
          bot.blockAt(here.floored().offset(x, -1, z))?.name ?? "unloaded",
      })),
    ),
    entities: Object.values(bot.entities)
      .filter(
        (e) =>
          e !== bot.entity &&
          e.position.distanceTo(here) <= 32 &&
          (HOSTILES.has(e.name || "") ||
            ["cow", "pig", "sheep", "chicken", "item"].includes(e.name || "")),
      )
      .slice(0, 16)
      .map((e) => ({
        name: e.name,
        hostile: HOSTILES.has(e.name || ""),
        position: positionOf(e.position),
        distance: Math.round(e.position.distanceTo(here)),
      })),
    resources,
    previously_observed_resources_recheck_before_use: memory.resources,
    shelter: memory.shelter,
    stations: memory.stations,
    recent_outcomes: (memory.experiences || []).slice(-12),
  };
}
