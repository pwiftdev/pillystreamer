import type { Bot } from "mineflayer";
import type { Phase, Telemetry } from "./overlay/state.js";
import { isLog, inventoryCount } from "./gameplay.js";
import type { BrainStatus } from "./brain/types.js";

export function createTelemetry(bot: Bot, target: number) {
  let phase: Phase = "connecting";
  let connected = false;
  let sending = false;
  let brain: BrainStatus | undefined;
  async function publish() {
    if (sending) return;
    sending = true;
    try {
      const state: Telemetry = {
        connected,
        phase,
        target,
        brain,
        health: bot.health ?? 0,
        food: bot.food ?? 0,
        logs: bot.inventory ? inventoryCount(bot, isLog) : 0,
      };
      const response = await fetch("http://127.0.0.1:4317/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
        signal: AbortSignal.timeout(750),
      });
      await response.body?.cancel();
    } catch {
      // The optional overlay must never interrupt gameplay.
    } finally {
      sending = false;
    }
  }
  const timer = setInterval(() => void publish(), 1_000);
  timer.unref();
  return {
    goal(next: Phase, status: BrainStatus) {
      phase = next;
      brain = status;
      connected = true;
      void publish();
    },
    close(failed: boolean) {
      clearInterval(timer);
      connected = false;
      phase = failed ? "error" : "offline";
      void publish();
    },
  };
}
