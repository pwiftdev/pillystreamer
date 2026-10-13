import { forageTargets } from "../survival/food.js";
import { createExecutor } from "./executor.js";
import { evidence, observe, remember, nearbyFailures } from "./observation.js";
import { RunMetrics } from "./metrics.js";
import type { Bot } from "mineflayer";
import { setTimeout as delay } from "node:timers/promises";
import { runAction } from "../actions.js";
import { configureMovement, isNavigationDig } from "../gameplay.js";
import { loadMemory, saveMemory } from "./memory.js";
import { Planner } from "./planner.js";
import { learnFromChat } from "./suggestions.js";
import { Replan } from "./placement.js";
import type { BrainStatus, TaskKind } from "./types.js";
import { survivalState, chapter } from "../survival/state.js";
import { survivalCandidates } from "../survival/policy.js";
import { leaveShelter } from "../survival/navigation.js";
import type { Phase } from "../overlay/state.js";

const phases: Record<TaskKind, Phase> = {
  scout: "scouting",
  gather: "gathering",
  craft: "crafting",
  build: "building",
  plant: "planting",
  explore: "exploring",
  rest: "resting",
  eat: "eating",
  forage: "foraging",
  shelter: "building",
  retreat: "retreating",
  tools: "crafting",
  mine: "mining",
  smelt: "smelting",
  camp: "building",
  sleep: "sleeping",
};
export async function readChat(signal: AbortSignal) {
  try {
    const response = await fetch("http://127.0.0.1:4317/api/state", {
      signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return [];
    }
    const state = await response.json();
    return state.chat;
  } catch {
    signal.throwIfAborted();
    return [];
  }
}
export async function runSurvivalLife(
  bot: Bot,
  signal: AbortSignal,
  planner: Planner,
  report: (text: string) => void,
  update: (phase: Phase, status: BrainStatus) => void,
  readMessages = readChat,
) {
  await runAction(() => bot.waitForChunksToLoad(), signal);
  configureMovement(bot);
  for (const block of bot.registry.blocksArray) {
    if (!isNavigationDig(block.name))
      bot.pathfinder.movements.blocksCantBreak.add(block.id);
  }
  bot.pathfinder.movements.scafoldingBlocks = [];
  const memory = await loadMemory(bot.entity.position);
  memory.bornDay ??= bot.time.day;
  await saveMemory(memory);
  const executor = createExecutor(memory);
  const { blocked } = executor;
  const metrics = new RunMetrics();
  let failures = 0;
  let lastTask: TaskKind | undefined;
  try {
    while (!signal.aborted) {
      signal.throwIfAborted();
      if (learnFromChat(memory, await readMessages(signal)))
        await saveMemory(memory);
      signal.throwIfAborted();
      if (bot.isSleeping) {
        await delay(1000, undefined, { signal });
        continue;
      }
      const houses = memory.projects.filter((p) => p.complete).length;
      const life = survivalState(bot, memory);
      const foodTargets = forageTargets(
        bot,
        life.shelter && !life.bed && life.wool < 3,
      );
      const options = survivalCandidates(life, memory).filter(
        (task) =>
          (task.id !== "forage" || foodTargets.drop || foodTargets.animal) &&
          (blocked.get(task.id) || 0) <= Date.now() &&
          (task.score >= 1000 ||
            task.id === "explore" ||
            nearbyFailures(memory, task.id, bot.entity.position) < 2),
      );
      const base: BrainStatus = {
        task: "Picking the next move",
        reason: "Checking food, daylight, shelter, and supplies.",
        completed: 0,
        total: 0,
        houses,
        planted: memory.planted,
        idea: memory.lastIdea,
        planner: "local",
        chapter: chapter(life),
        day: life.day,
        outcome:
          memory.experiences?.at(-1) &&
          Date.now() - memory.experiences.at(-1)!.at < 60_000
            ? memory.experiences.at(-1)!.evidence
            : undefined,
        plan: planner.summary,
      };
      if (!options.length) {
        update("thinking", {
          ...base,
          reason: "The nearby routes are awkward. Taking a moment to reassess.",
        });
        await delay(3000, undefined, { signal });
        continue;
      }
      if (lastTask !== options[0].id) update("thinking", base);
      const { task, mode } = await planner.choose(
        options,
        memory,
        signal,
        () => observe(bot, memory),
        JSON.stringify([life.health, life.night, life.danger]),
      );
      signal.throwIfAborted();
      const status = {
        ...base,
        task: task.title,
        reason: task.reason,
        planner: mode,
        plan: planner.summary,
      };
      const show = (done = 0, total = 0) =>
        update(phases[task.id], { ...status, completed: done, total });
      show();
      if (lastTask !== task.id)
        report(`${task.title}: ${task.reason} (${mode})`);
      lastTask = task.id;
      const before = evidence(bot, memory);
      const started = Date.now();
      await metrics.start(task.id, before, planner.metrics);
      const recordOutcome = async (failed = false) => {
        const entry = remember(
          memory,
          task.id,
          before,
          evidence(bot, memory),
          failed,
        );
        await saveMemory(memory);
        await metrics.finish(
          entry,
          Date.now() - started,
          survivalState(bot, memory),
          planner.metrics,
        );
        return entry;
      };

      try {
        if (!["retreat", "sleep", "eat", "camp", "smelt"].includes(task.id))
          await leaveShelter(bot, memory, signal);
        await executor.run(bot, memory, task.id, signal, show, report);
        signal.throwIfAborted();
        const entry = await recordOutcome();
        planner.finish(task.id, entry.outcome === "progress", mode);
        if (
          entry.outcome === "no_progress" &&
          !["retreat", "sleep", "rest"].includes(task.id)
        )
          blocked.set(task.id, Date.now() + 5000);
        failures = 0;
      } catch (error) {
        signal.throwIfAborted();
        if (!(error instanceof Replan)) throw error;
        await recordOutcome(true);
        planner.finish(task.id, false, mode);
        report(error.message);
        failures++;
        blocked.set(
          task.id,
          Date.now() +
            (task.score >= 1000
              ? 1000
              : task.id === "explore"
                ? 2000
                : Math.min(30_000, failures * 5000)),
        );
        update("thinking", {
          ...status,
          task: "Trying a different approach",
          reason: error.message,
        });
      }
      await delay(350, undefined, { signal });
    }
  } finally {
    planner.invalidate();
    await metrics.end(
      bot.health <= 0 ? "death" : signal.aborted ? "stopped" : "error",
      planner.metrics,
    );
  }
}
