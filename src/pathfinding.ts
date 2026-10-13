import type { Bot } from "mineflayer";
import type { goals, PartiallyComputedPath } from "mineflayer-pathfinder";
import { setImmediate } from "node:timers/promises";

export async function findRoute(
  bot: Bot,
  goal: goals.Goal,
  signal: AbortSignal,
  timeout = 500,
) {
  signal.throwIfAborted();
  const search = bot.pathfinder.getPathFromTo(
    bot.pathfinder.movements,
    bot.entity.position,
    goal,
    { timeout, tickTimeout: 20 },
  );
  try {
    for (const { result } of search) {
      signal.throwIfAborted();
      const status = (result as PartiallyComputedPath).status;
      if (status !== "partial") return result as PartiallyComputedPath;
      await setImmediate(undefined, { signal });
    }
    return null;
  } finally {
    search.return?.(undefined as never);
  }
}

export async function reachable(
  bot: Bot,
  goal: goals.Goal,
  signal: AbortSignal,
) {
  return (await findRoute(bot, goal, signal))?.status === "success";
}
