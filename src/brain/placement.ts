import { guardedTravel, TravelInterrupted } from "./travel.js";
import { reachable } from "../pathfinding.js";
import type { Bot } from "mineflayer";
import pathfinder from "mineflayer-pathfinder";
import { Vec3 } from "vec3";
import { runAction } from "../actions.js";
import { isReplaceable } from "./blueprint.js";

const { goals } = pathfinder;
export class Replan extends Error {
  constructor(
    message: string,
    readonly urgent = false,
  ) {
    super(message);
  }
}
export class UnsafeOutcome extends Error {}
export async function walk(
  bot: Bot,
  goal: pathfinder.goals.Goal,
  signal: AbortSignal,
  escape = false,
) {
  try {
    await guardedTravel(bot, () => bot.pathfinder.goto(goal), signal, escape);
    signal.throwIfAborted();
    if (
      !goal.isEnd(
        bot.entity.position.floored() as unknown as Parameters<
          typeof goal.isEnd
        >[0],
      )
    )
      throw new Replan("That spot isn't reachable yet.");
  } catch (error) {
    signal.throwIfAborted();
    bot.pathfinder.setGoal(null);
    bot.clearControlStates();
    if (error instanceof TravelInterrupted)
      throw new Replan(error.message, error.urgent);
    if (error instanceof Replan) throw error;
    if (error instanceof Error && ["NoPath", "Timeout"].includes(error.name))
      throw new Replan("That route is blocked. Trying another approach.");
    throw error;
  }
}

export async function verifiedBlockChange(
  signal: AbortSignal,
  read: () => "done" | "empty" | "blocked",
  place: () => Promise<void>,
  timeoutMs = 12_000,
) {
  signal.throwIfAborted();
  const before = read();
  if (before === "done") return;
  if (before !== "empty")
    throw new Replan("A block is in the way; leaving it alone.");
  let failed = false;
  try {
    await runAction(place, signal, timeoutMs);
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof Error && error.name === "TimeoutError")
      throw new UnsafeOutcome(
        "Block action timed out. Stopping before another action can overlap.",
      );
    failed = true;
  }
  signal.throwIfAborted();
  if (read() === "done") return;
  throw new UnsafeOutcome(
    failed
      ? "Block action wasn't confirmed. Stopping to avoid replaying it."
      : "The server hasn't confirmed the block. Stopping safely.",
  );
}

async function centerForPlacement(bot: Bot, signal: AbortSignal) {
  const target = bot.entity.position.floored().offset(0.5, 0, 0.5);
  try {
    for (let ticks = 0; ticks < 20; ticks++) {
      signal.throwIfAborted();
      const position = bot.entity.position;
      if (Math.hypot(target.x - position.x, target.z - position.z) < 0.08)
        return;
      await runAction(
        () => bot.lookAt(new Vec3(target.x, position.y + 1.6, target.z), true),
        signal,
      );
      bot.setControlState("forward", true);
      await runAction(() => bot.waitForTicks(1), signal, 2000);
    }
    throw new Replan("Need to settle into a better building position.");
  } finally {
    bot.clearControlStates();
  }
}

export async function placeAt(
  bot: Bot,
  position: Vec3,
  name: string,
  signal: AbortSignal,
  expected = (block: string) => block === name,
) {
  signal.throwIfAborted();
  const read = () => {
    const block = bot.blockAt(position);
    return block && expected(block.name)
      ? "done"
      : block?.name === "air"
        ? "empty"
        : "blocked";
  };
  if (read() === "done") return;
  const obstruction = bot.blockAt(position);
  if (
    obstruction &&
    isReplaceable(obstruction.name) &&
    obstruction.name !== "air"
  ) {
    await walk(
      bot,
      new goals.GoalNear(position.x, position.y, position.z, 2),
      signal,
    );
    signal.throwIfAborted();
    await runAction(() => bot.dig(obstruction), signal);
    signal.throwIfAborted();
  }
  const PlaceGoal = goals.GoalPlaceBlock as unknown as new (
    position: Vec3,
    world: Bot["world"],
    options: { range: number; LOS: boolean },
  ) => pathfinder.goals.GoalPlaceBlock & {
    getFaceAndRef(position: Vec3): { face: Vec3; ref: Vec3 } | null;
  };
  const goal = new PlaceGoal(position, bot.world, { range: 4.5, LOS: true });
  if (!(await reachable(bot, goal, signal)))
    return jumpPlace(bot, position, name, signal, expected);
  await walk(bot, goal, signal);
  await centerForPlacement(bot, signal);
  const face = goal.getFaceAndRef(bot.entity.position.offset(0, 1.6, 0));
  if (!face) throw new Replan("Need a better angle for that block.");
  const reference = bot.blockAt(face.ref);
  const item = bot.inventory.items().find((item) => item.name === name);
  if (!reference || !item)
    throw new Replan("Need more supplies before placing that block.");
  await runAction(() => bot.equip(item, "hand"), signal);
  await verifiedBlockChange(signal, read, async () => {
    signal.throwIfAborted();
    bot.setControlState("sneak", true);
    try {
      await bot.placeBlock(reference, face.face.scaled(-1));
    } finally {
      bot.setControlState("sneak", false);
    }
  });
}

async function jumpPlace(
  bot: Bot,
  target: Vec3,
  name: string,
  signal: AbortSignal,
  expected: (name: string) => boolean,
) {
  const reference = bot.blockAt(target.offset(0, -1, 0));
  if (reference?.boundingBox !== "block")
    throw new Replan("Need a reachable angle for that block.");
  const stands = [
    new Vec3(1, 0, 0),
    new Vec3(-1, 0, 0),
    new Vec3(0, 0, 1),
    new Vec3(0, 0, -1),
  ].map((d) => target.plus(d).offset(0, -2, 0));
  for (const stand of stands) {
    if (
      bot.blockAt(stand.offset(0, -1, 0))?.boundingBox !== "block" ||
      ![0, 1, 2].every(
        (y) => bot.blockAt(stand.offset(0, y, 0))?.name === "air",
      )
    )
      continue;
    const goal = new pathfinder.goals.GoalBlock(stand.x, stand.y, stand.z);
    if (!(await reachable(bot, goal, signal))) continue;
    await walk(bot, goal, signal);
    const item = bot.inventory.items().find((i) => i.name === name);
    if (!item) throw new Replan("Need more supplies for that block.");
    await runAction(() => bot.equip(item, "hand"), signal);
    try {
      signal.throwIfAborted();
      bot.setControlState("jump", true);
      await runAction(() => bot.waitForTicks(6), signal, 2000);
      signal.throwIfAborted();
      if (bot.entity.position.y + 1.6 <= target.y + 0.1) continue;
      await verifiedBlockChange(
        signal,
        () => {
          const block = bot.blockAt(target);
          return block && expected(block.name)
            ? "done"
            : block?.name === "air"
              ? "empty"
              : "blocked";
        },
        () => bot.placeBlock(reference, new Vec3(0, 1, 0)),
      );
      return;
    } finally {
      bot.clearControlStates();
    }
  }
  throw new Replan("Need a safer position to reach that height.");
}
