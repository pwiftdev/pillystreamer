import mineflayer from "mineflayer";
import collectBlock from "mineflayer-collectblock";
import { writeFile } from "node:fs/promises";
import { runSurvivalLife } from "../src/brain/loop.js";
import { Planner } from "../src/brain/planner.js";
import { elevenLabs } from "../src/voice/elevenlabs.js";
import { loadVoiceEnv, voiceConfig } from "../src/voice/config.js";
import minecraft from "../minecraft.json" with { type: "json" };

if (process.env.PILLY_BENCHMARK !== "isolated")
  throw new Error("Use npm run benchmark to create an isolated world first.");
loadVoiceEnv();
const config = voiceConfig();
const planner = new Planner(
  config.apiKey && process.env.ELEVENLABS_PLANNER_AGENT_ID
    ? elevenLabs({
        ...config,
        agentId: process.env.ELEVENLABS_PLANNER_AGENT_ID,
      })
    : undefined,
);
const bot = mineflayer.createBot({
  host: minecraft.host,
  port: minecraft.port,
  username: "Pilly",
  version: minecraft.version,
  auth: "offline",
  respawn: false,
});
bot.loadPlugin(collectBlock.plugin);
const controller = new AbortController();
let stopped = false,
  startedAt = 0,
  startDay = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const duration = Number(process.env.PILLY_BENCHMARK_SECONDS);
if (!Number.isInteger(duration) || duration < 10 || duration > 3600)
  throw new Error("Invalid benchmark duration");
async function stop(reason: string, detail?: string) {
  if (stopped) return;
  stopped = true;
  clearTimeout(timer);
  clearTimeout(connection);
  controller.abort();
  planner.invalidate();
  bot.pathfinder?.setGoal(null);
  bot.clearControlStates();
  bot.stopDigging();
  const result = {
    reason,
    detail,
    seed: minecraft.seed,
    elapsedMs: startedAt ? Date.now() - startedAt : 0,
    deaths: reason === "death" ? 1 : 0,
    firstNightSurvived: reason === "duration" && bot.time.day > startDay,
    health: bot.health,
    food: bot.food,
    model: planner.metrics,
  };
  bot.end();
  await writeFile("result.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
const connection = setTimeout(() => void stop("connection_timeout"), 60000);
bot.once("spawn", () => {
  clearTimeout(connection);
  startedAt = Date.now();
  startDay = bot.time.day;
  timer = setTimeout(() => void stop("duration"), duration * 1000);
  void runSurvivalLife(
    bot,
    controller.signal,
    planner,
    (message) => console.log(message),
    () => {},
    async () => [],
  ).catch((error: unknown) => {
    if (!stopped)
      void stop(
        "action_error",
        error instanceof Error
          ? error.message.slice(0, 180)
          : "Unknown action error",
      );
  });
});
bot.on("death", () => void stop("death"));
bot.on("error", () => void stop("connection_error"));
bot.on("end", () => void stop("disconnected"));
for (const s of ["SIGINT", "SIGTERM"] as const)
  process.on(s, () => void stop("cancelled"));
