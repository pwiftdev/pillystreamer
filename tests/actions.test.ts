import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { runAction } from "../src/actions.js";

test("an already disconnected session cannot start an action", async () => {
  let called = false;
  await assert.rejects(
    runAction(
      async () => {
        called = true;
      },
      AbortSignal.abort(new Error("disconnected")),
    ),
    /disconnected/,
  );
  assert.equal(called, false);
});

test("disconnect interrupts an action and prevents the next action", async () => {
  const controller = new AbortController();
  let continued = false;
  const task = (async () => {
    await runAction(() => delay(30), controller.signal);
    continued = true;
  })();
  controller.abort(new Error("disconnected"));
  await assert.rejects(task, /disconnected/);
  await delay(40);
  assert.equal(continued, false);
});

test("an ambiguous late success after timeout cannot advance the mission", async () => {
  let continued = false;
  const task = (async () => {
    await runAction(() => delay(30), new AbortController().signal, 5);
    continued = true;
  })();
  await assert.rejects(task, { name: "TimeoutError" });
  await delay(40);
  assert.equal(continued, false);
});

test("action failures propagate instead of being reported as success", async () => {
  await assert.rejects(
    runAction(async () => {
      throw new Error("no path");
    }, new AbortController().signal),
    /no path/,
  );
});

test("successful actions return their result", async () => {
  assert.equal(await runAction(async () => 8, new AbortController().signal), 8);
});
