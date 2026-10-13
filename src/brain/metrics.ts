import { appendFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { memoryPath } from "./memory.js";
import type { Evidence } from "./observation.js";
import { TASKS, type Experience, type TaskKind } from "./types.js";
import type { SurvivalState } from "../survival/state.js";

export class RunMetrics {
  private run = randomUUID();
  private action = 0;
  constructor(
    private directory = new URL("./pilly-runs/", memoryPath),
    private now = Date.now,
  ) {}
  private async write(event: object) {
    await mkdir(this.directory, { recursive: true });
    await appendFile(
      new URL(`${this.run}.jsonl`, this.directory),
      JSON.stringify({ at: this.now(), action: this.action, ...event }) + "\n",
      { mode: 0o600 },
    );
  }
  async end(reason: "death" | "stopped" | "error", model: object) {
    await this.write({ type: "end", reason, model });
  }
  async start(task: TaskKind, observation: Evidence, model: object) {
    this.action++;
    await this.write({ type: "start", task, observation, model });
  }
  async finish(
    result: Experience,
    durationMs: number,
    survival: SurvivalState,
    model: object,
  ) {
    await this.write({ type: "finish", result, durationMs, survival, model });
  }
}
type RunRecord =
  | { at: number; action: number; type: "start"; task: TaskKind; model: object }
  | {
      at: number;
      action: number;
      type: "finish";
      result: Experience;
      durationMs: number;
      survival: SurvivalState;
      model: object;
    }
  | {
      at: number;
      action: number;
      type: "end";
      reason: "death" | "stopped" | "error";
      model: object;
    };
function parseRecord(line: string): RunRecord {
  const r = JSON.parse(line) as RunRecord;
  if (
    !r ||
    !Number.isFinite(r.at) ||
    !Number.isInteger(r.action) ||
    r.action < 0 ||
    !["start", "finish", "end"].includes(r.type)
  )
    throw new Error("Invalid run record");
  if (r.type === "start" && !TASKS.includes(r.task))
    throw new Error("Invalid run task");
  if (
    r.type === "finish" &&
    (!r.result ||
      !["progress", "blocked", "no_progress"].includes(r.result.outcome) ||
      !Number.isFinite(r.durationMs) ||
      r.durationMs < 0 ||
      !r.survival ||
      typeof r.survival !== "object")
  )
    throw new Error("Invalid run outcome");
  if (r.type === "end" && !["death", "stopped", "error"].includes(r.reason))
    throw new Error("Invalid run end");
  return r;
}
export function summarizeRun(text: string) {
  const records: RunRecord[] = [];
  let incompleteTail = false;
  const lines = text.trimEnd().split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]) continue;
    try {
      records.push(parseRecord(lines[i]));
    } catch {
      if (i !== lines.length - 1 || text.endsWith("\n"))
        throw new Error("Invalid run log");
      incompleteTail = true;
    }
  }
  const starts = records.filter((r) => r.type === "start");
  const finishes = records.filter((r) => r.type === "finish");
  const first = starts[0]?.at;
  const milestone = (key: keyof SurvivalState) => {
    const record = finishes.find((r) => r.survival?.[key]);
    return record && first !== undefined ? record.at - first : null;
  };
  const last = records.at(-1);
  return {
    actions: starts.length,
    ended: last?.type === "end" ? last.reason : null,
    deaths: records.filter((r) => r.type === "end" && r.reason === "death")
      .length,
    completedActions: finishes.length,
    unconfirmedActions: starts.filter(
      (s) => !finishes.some((f) => f.action === s.action),
    ).length,
    incompleteTail,
    durationMs: first === undefined ? 0 : last!.at - first,
    blocked: finishes.filter((r) => r.result.outcome === "blocked").length,
    noProgressMs: finishes
      .filter((r) => r.result.outcome !== "progress")
      .reduce((n, r) => n + r.durationMs, 0),
    safeWaitingMs: finishes
      .filter(
        (r) =>
          r.result.outcome === "no_progress" &&
          ["retreat", "sleep", "rest"].includes(r.result.task),
      )
      .reduce((n, r) => n + r.durationMs, 0),
    firstFoodMs: milestone("food"),
    firstShelterMs: milestone("shelter"),
    firstStonePickMs: milestone("stonePick"),
    firstBedMs: milestone("bed"),
    model: last?.model ?? null,
    apiCostUsd: null,
    costNote:
      "Token usage and billing are not exposed by the text bridge. Check ElevenLabs billing; request counts are recorded.",
  };
}
