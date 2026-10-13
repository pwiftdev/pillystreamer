import type { Bot } from "mineflayer";
import { runAction } from "./actions.js";

export async function syncInventory(bot: Bot, signal: AbortSignal) {
  const sync = (
    bot as Bot & { _syncWindow?: (window: Bot["inventory"]) => Promise<void> }
  )._syncWindow;
  if (!sync)
    throw new Error("This Mineflayer version cannot confirm inventory state.");
  await runAction(
    async () => {
      await sync.call(bot, bot.inventory);
      signal.throwIfAborted();
      await bot.waitForTicks(2);
      signal.throwIfAborted();
      await sync.call(bot, bot.inventory);
    },
    signal,
    5000,
  );
}
export async function confirmedCraft(
  signal: AbortSignal,
  read: () => number,
  sync: () => Promise<void>,
  send: () => Promise<void>,
  expected: number,
  timeoutMs = 15000,
) {
  signal.throwIfAborted();
  const before = read();
  try {
    await runAction(send, signal, timeoutMs);
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof Error && error.name === "TimeoutError") throw error;
  }
  signal.throwIfAborted();
  await sync();
  signal.throwIfAborted();
  if (read() < before + expected)
    throw new Error(
      "Craft result was not confirmed by the server. Stopping before another craft.",
    );
}
