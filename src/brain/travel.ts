import type { Bot } from "mineflayer";
import { runAction } from "../actions.js";
import { nearbyThreat } from "../survival/state.js";

export class TravelInterrupted extends Error {
  constructor(
    message: string,
    readonly urgent = false,
  ) {
    super(message);
  }
}
export async function guardedTravel<T>(
  bot: Bot,
  action: () => Promise<T>,
  signal: AbortSignal,
  escape = false,
  now = Date.now,
) {
  signal.throwIfAborted();
  let interrupted = "";
  let position = bot.entity.position.clone();
  let movedAt = now();
  const health = bot.health;
  let urgent = false;
  if (!escape && nearbyThreat(bot))
    throw new TravelInterrupted("Need to get safe before travelling.", true);
  const check = () => {
    if (interrupted) return;
    if (bot.entity.position.distanceTo(position) > 0.75) {
      position = bot.entity.position.clone();
      movedAt = now();
    }
    if (
      bot.pathfinder.isMining() ||
      bot.pathfinder.isBuilding() ||
      bot.targetDigBlock
    ) {
      movedAt = now();
      return;
    }
    if (!escape && (bot.health < health || nearbyThreat(bot))) {
      interrupted = "Danger interrupted that route. Getting safe first.";
      urgent = true;
    } else if (now() - movedAt > 8000)
      interrupted = "No movement on that route. Trying a different approach.";
    if (interrupted) {
      bot.pathfinder.setGoal(null);
      bot.clearControlStates();
    }
  };
  bot.on("physicsTick", check);
  try {
    const result = await runAction(action, signal, 45_000);
    if (interrupted) throw new TravelInterrupted(interrupted, urgent);
    return result;
  } catch (error) {
    signal.throwIfAborted();
    if (interrupted && error instanceof Error && error.name === "GoalChanged")
      throw new TravelInterrupted(interrupted, urgent);
    throw error;
  } finally {
    bot.removeListener("physicsTick", check);
  }
}
