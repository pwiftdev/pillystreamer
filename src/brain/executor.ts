import type { Bot } from "mineflayer";
import { setTimeout as delay } from "node:timers/promises";
import { craftBatch, gatherBatch, plantTree } from "./world-actions.js";
import { buildBatch, inspectProject } from "./building.js";
import { Replan } from "./placement.js";
import { findPlot } from "./scouting.js";
import { Exploration } from "./exploration.js";
import { saveMemory } from "./memory.js";
import type { TownMemory, TaskKind } from "./types.js";
import { survivalActions } from "../survival/actions.js";

export function createExecutor(memory: TownMemory) {
  const blocked = new Map<TaskKind, number>();
  const ignoredTrees = new Set<string>();
  const exploration = new Exploration(memory.experiences);
  return {
    blocked,
    async run(
      bot: Bot,
      memory: TownMemory,
      task: TaskKind,
      signal: AbortSignal,
      show: (done?: number, total?: number) => void,
      report: (text: string) => void,
    ) {
      const active = memory.projects.find((p) => !p.complete);
      const survivalAction = survivalActions[task];
      if (survivalAction) {
        await survivalAction(bot, memory, signal, show);
        if (["camp", "smelt"].includes(task))
          blocked.set(task, Date.now() + 12_000);
      } else
        switch (task) {
          case "scout": {
            const plot = await findPlot(bot, memory, signal);
            if (!plot) {
              await exploration.move(bot, signal, memory);
              break;
            }
            memory.projects.push(plot);
            await saveMemory(memory);
            report(
              `Reserved house ${plot.id} at ${JSON.stringify(plot.origin)}.`,
            );
            break;
          }
          case "gather":
            await gatherBatch(bot, memory, signal, ignoredTrees);
            break;
          case "craft":
            await craftBatch(bot, memory, signal);
            break;
          case "build": {
            if (!active) break;
            if (await buildBatch(bot, active, memory, signal, show, 1)) {
              signal.throwIfAborted();
              const confirmed = inspectProject(bot, active);
              if (!confirmed.loaded || confirmed.missing.length)
                throw new Replan(
                  "Checking the last few blocks before calling this finished.",
                );
              active.complete = true;
              await saveMemory(memory);
              report(
                `House ${active.id} is complete: ${confirmed.done} blocks verified in the world.`,
              );
            }
            break;
          }
          case "plant":
            await plantTree(bot, memory, signal);
            signal.throwIfAborted();
            memory.planted++;
            await saveMemory(memory);
            blocked.set("plant", Date.now() + 90_000);
            break;
          case "explore":
            await exploration.move(bot, signal, memory);
            blocked.delete("gather");
            blocked.delete("forage");
            break;
          case "rest":
            await delay(5000, undefined, { signal });
            break;
        }

      if (ignoredTrees.size > 256) ignoredTrees.clear();
    },
  };
}
