import assert from "node:assert/strict";
import { test } from "node:test";
import { confirmedCraft, syncInventory } from "../src/inventory.js";
import { craft } from "../src/gameplay.js";
import type { Bot } from "mineflayer";

test("craft batches synchronize each recipe before trusting provisional inventory", async () => {
  let local = 0,
    remote = 0,
    calls = 0,
    syncs = 0;
  const bot = {
    registry: { itemsByName: { oak_planks: { id: 1 } } },
    inventory: { items: () => [{ name: "oak_planks", count: local }] },
    waitForTicks: async () => {},
    recipesFor: () => [{ result: { count: 4 } }],
    _syncWindow: async () => {
      syncs++;
      local = remote;
    },
    craft: async (_r: unknown, count: number) => {
      assert.equal(count, 1);
      assert.equal(local, remote);
      calls++;
      local += 40;
      remote += 4;
    },
  } as unknown as Bot;
  await craft(bot, "oak_planks", 3, new AbortController().signal);
  assert.equal(calls, 3);
  assert.equal(syncs, 8);
  assert.equal(local, 12);
});
test("lost crafting acknowledgement reconciles confirmed output without replay", async () => {
  let count = 0,
    calls = 0;
  await confirmedCraft(
    new AbortController().signal,
    () => count,
    async () => {},
    async () => {
      calls++;
      count = 4;
      throw new Error("ack lost");
    },
    4,
  );
  assert.equal(calls, 1);
});
test("unconfirmed output, session loss and post-ack local failure cannot start another craft", async () => {
  for (const failure of ["unconfirmed", "session", "local"]) {
    let count = 0,
      calls = 0;
    const controller = new AbortController();
    await assert.rejects(
      confirmedCraft(
        controller.signal,
        () => count,
        async () => {
          if (failure === "local") throw new Error("read failed after ack");
        },
        async () => {
          calls++;
          if (failure !== "unconfirmed") count = 4;
          if (failure === "session")
            controller.abort(new Error("session lost"));
        },
        4,
      ),
    );
    assert.equal(calls, 1);
  }
});
test("craft timeout does not reconcile or retry a still-pending mutation", async () => {
  let finish!: () => void,
    synced = 0,
    count = 0;
  const keepAlive = setTimeout(() => {}, 100);
  try {
    await assert.rejects(
      confirmedCraft(
        new AbortController().signal,
        () => count,
        async () => {
          synced++;
        },
        () =>
          new Promise<void>((r) => {
            finish = () => {
              count = 4;
              r();
            };
          }),
        4,
        5,
      ),
      { name: "TimeoutError" },
    );
  } finally {
    clearTimeout(keepAlive);
  }
  finish();
  assert.equal(count, 4);
  assert.equal(synced, 0);
});

test("inventory synchronization drains a stale update and stops on session loss between reads", async () => {
  for (const abort of [false, true]) {
    let reads = 0,
      local = 99;
    const controller = new AbortController();
    const bot = {
      inventory: {},
      _syncWindow: async () => {
        local = ++reads === 1 ? 0 : 4;
      },
      waitForTicks: async () => {
        if (abort) controller.abort(new Error("session lost"));
      },
    } as unknown as Bot;
    if (abort) {
      await assert.rejects(
        syncInventory(bot, controller.signal),
        /session lost/,
      );
      assert.equal(reads, 1);
    } else {
      await syncInventory(bot, controller.signal);
      assert.equal(local, 4);
      assert.equal(reads, 2);
    }
  }
});
