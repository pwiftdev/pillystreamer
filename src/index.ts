import mineflayer from "mineflayer";
import collectBlock from "mineflayer-collectblock";
import { createInterface } from "node:readline";
import { runSurvivalLife } from "./brain/loop.js";
import { Planner, WOOD_RESERVE } from "./brain/planner.js";
import { loadVoiceEnv, voiceConfig } from "./voice/config.js";
import { elevenLabs } from "./voice/elevenlabs.js";
import minecraft from "../minecraft.json" with { type: "json" };
import { createTelemetry } from "./telemetry.js";
import { createGameViewer } from "./viewer.js";

loadVoiceEnv();
const config = voiceConfig();
const plannerId = process.env.ELEVENLABS_PLANNER_AGENT_ID;
const planner = new Planner(
  config.apiKey && plannerId
    ? elevenLabs({ ...config, agentId: plannerId })
    : undefined,
);

const bot = mineflayer.createBot({
  host: minecraft.host,
  port: minecraft.port,
  username: "Pilly",
  version: minecraft.version,
  auth: "offline",
  respawn: false,
  viewDistance: "far",
});
bot.loadPlugin(collectBlock.plugin);
const telemetry = createTelemetry(bot, WOOD_RESERVE);

const controller = new AbortController();
const terminal = createInterface({
  input: process.stdin,
  output: process.stdout,
});
const report = (message: string) => console.log(`[Pilly] ${message}`);
let stopping = false;
let viewer: ReturnType<typeof createGameViewer> | undefined;

function stop(reason: string, failed = false) {
  if (stopping) return;
  stopping = true;
  telemetry.close(failed);
  viewer?.close();
  process.exitCode = failed ? 1 : 0;
  controller.abort(new Error(reason));
  bot.pathfinder?.setGoal(null);
  bot.clearControlStates?.();
  bot.stopDigging?.();
  bot.end(reason);
  terminal.close();
  report(reason);
}

bot.once("spawn", () => {
  report(`Connected to Minecraft Java ${minecraft.version}.`);
  viewer = createGameViewer(bot);
  viewer.server.on("error", (error) =>
    stop(`Game viewer: ${error.message}`, true),
  );
  viewer.server.listen(4318, "127.0.0.1", () => {
    report("Live game camera: http://127.0.0.1:4318");
  });
  void runSurvivalLife(
    bot,
    controller.signal,
    planner,
    report,
    telemetry.goal,
  ).catch((error: unknown) => {
    if (!stopping)
      stop(error instanceof Error ? error.message : String(error), true);
  });
});
bot.on("error", (error) => stop(error.message, true));
bot.on("kicked", (reason) => stop(`Kicked: ${JSON.stringify(reason)}`, true));
bot.on("end", (reason) => stop(`Disconnected: ${reason}`, true));
bot.on("death", () =>
  stop("Died. Automatic respawn is not implemented yet.", true),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => stop("Stopped."));
terminal.on("line", (line) => {
  if (line.trim() === "quit") stop("Stopped.");
  else if (line.trim() === "status") {
    report(
      JSON.stringify({
        position: bot.entity?.position,
        health: bot.health,
        food: bot.food,
        inventory: bot.inventory
          ?.items()
          .map(({ name, count }) => ({ name, count })),
      }),
    );
  } else report("Commands: status, quit");
});
report(
  `Connecting to ${minecraft.host}:${minecraft.port}. Start the server with npm run server.`,
);
