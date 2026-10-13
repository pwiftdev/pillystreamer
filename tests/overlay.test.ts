import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { once } from "node:events";
import { get } from "node:http";
import { createOverlayServer } from "../src/overlay/server.js";
import type { VoiceOptions } from "../src/voice/service.js";
import {
  initialState,
  applyControl,
  applyTelemetry,
} from "../src/overlay/state.js";

async function serve(t: TestContext, options: VoiceOptions = {}) {
  const overlay = createOverlayServer(options);
  overlay.server.listen(0, "127.0.0.1");
  await once(overlay.server, "listening");
  t.after(async () => {
    const closed = once(overlay.server, "close");
    overlay.close();
    await closed;
  });
  const address = overlay.server.address();
  assert(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}

function post(
  url: string,
  input: unknown,
  headers: Record<string, string> = {},
) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(input),
  });
}

test("invalid settings cannot partially change the scene", () => {
  const state = initialState();
  const before = structuredClone(state);
  assert.throws(
    () =>
      applyControl(state, {
        type: "settings",
        settings: { ...state.settings, headphones: "Rose", scale: 4.5 },
      }),
    /whole number/,
  );
  assert.deepEqual(state, before);
  assert.throws(() =>
    applyControl(state, { type: "reaction", id: "<script>" }),
  );
  assert.deepEqual(state, before);
});

test("repeated telemetry does not continually replay a reaction", () => {
  const state = initialState();
  const update = {
    connected: true,
    phase: "gathering",
    health: 20,
    food: 20,
    logs: 8,
    target: 12,
  };
  applyTelemetry(state, update, 1000);
  assert.equal(state.reaction?.id, "hello");
  applyTelemetry(state, { ...update, phase: "complete" }, 2000);
  assert.equal(state.reaction?.id, "hype");
  applyTelemetry(state, { ...update, phase: "complete" }, 3000);
  assert.equal(state.reaction?.startedAt, 2000);
  applyTelemetry(state, { ...update, health: 18 }, 4000);
  assert.equal(state.reaction?.id, "scare");
});

test("a stale bot connection is treated as a new arrival", () => {
  const state = initialState();
  const update = {
    connected: true,
    phase: "gathering",
    health: 20,
    food: 20,
    logs: 8,
    target: 12,
  };
  applyTelemetry(state, update, 1000);
  applyTelemetry(state, update, 10_000);
  assert.deepEqual(state.reaction, { id: "hello", startedAt: 10_000 });
});

test("captions have a fixed lifetime and reset clears temporary content", () => {
  const state = initialState();
  applyControl(state, {
    type: "settings",
    settings: { ...state.settings, speech: "demo" },
  });
  applyControl(state, { type: "caption", text: " Hello Pilly " }, 1000);
  assert.deepEqual(state.caption, { text: "Hello Pilly", expiresAt: 11_000 });
  assert.throws(() =>
    applyControl(state, { type: "caption", text: "a".repeat(181) }),
  );
  applyControl(state, { type: "reset" });
  assert.equal(state.caption.text, "");
  assert.equal(state.reaction, null);
  assert.equal(state.settings.speech, "off");
});

test("scene and speech settings validate atomically and keep legacy controls compatible", () => {
  const state = initialState();
  assert.equal(state.settings.scene, "game");
  assert.equal(state.settings.sticker, false);
  for (const settings of [{ scene: "missing" }, { speech: "microphone" }]) {
    const before = structuredClone(state);
    assert.throws(() =>
      applyControl(state, {
        type: "settings",
        settings: { ...state.settings, headphones: "Rose", ...settings },
      }),
    );
    assert.deepEqual(state, before);
  }
  applyControl(state, {
    type: "settings",
    settings: { ...state.settings, scene: "sprite", speech: "demo" },
  });
  const legacy = {
    ...state.settings,
    scene: undefined,
    speech: undefined,
    scale: 4,
  };
  applyControl(state, { type: "settings", settings: legacy });
  assert.equal(state.settings.scene, "sprite");
  assert.equal(state.settings.speech, "demo");
  assert.equal(state.settings.scale, 4);
});

test("studio and original mascot renderer are served without exposing the project", async (t) => {
  const url = await serve(t);
  const page = await fetch(url);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Pilly, on air/);
  const renderer = await fetch(`${url}/mascot.js-source`);
  const source = await renderer.text();
  assert.match(source, /export function renderPilly/);
  assert.match(source, /sticker = false/);
  for (const path of [
    "/live-room.js",
    "/room-character.js",
    "/room-spec.js",
    "/live-room.svg",
  ]) {
    const asset = await fetch(`${url}${path}`);
    assert.equal(asset.status, 200);
    assert.match(
      asset.headers.get("content-type")!,
      path.endsWith("svg") ? /image\/svg\+xml/ : /text\/javascript/,
    );
    await asset.body?.cancel();
  }
  for (const path of [
    "/.git/config",
    "/.env",
    "/src/persona/pilly.ts",
    "/src/voice/config.ts",
    "/.minecraft/eula.txt",
    "/src/index.ts",
    "/%2e%2e/package.json",
    "/design_handoff_pilly_mascot%202/design/support.js",
  ]) {
    const response = await fetch(`${url}${path}`);
    assert.equal(response.status, 404);
    await response.body?.cancel();
  }
});

test("website chat uses one shared audio clip and keeps new endpoints private to this origin", async (t) => {
  let replies = 0;
  let speech = 0;
  const url = await serve(t, {
    provider: {
      async reply() {
        replies++;
        return "Welcome to Pumpville.";
      },
      async synthesize() {
        speech++;
        return { audio: Buffer.from("sample-audio"), durationMs: 1000 };
      },
    },
    secrets: ["private-key-for-test"],
  });
  for (const path of ["/api/chat", "/api/voice"]) {
    const denied = await post(
      `${url}${path}`,
      { text: "Hi", type: "intro" },
      { Origin: "https://foreign.example" },
    );
    assert.equal(denied.status, 403);
    await denied.body?.cancel();
  }
  assert.equal(replies, 0);
  const accepted = await post(`${url}/api/chat`, { text: "Hello" });
  assert.equal(accepted.status, 202);
  await accepted.body?.cancel();
  const state = await (await fetch(`${url}/api/state`)).json();
  assert.doesNotMatch(JSON.stringify(state), /private-key-for-test/);
  assert.equal(state.voice.clip.text, "Welcome to Pumpville.");
  for (let i = 0; i < 2; i++) {
    const audio = await fetch(`${url}${state.voice.clip.url}`);
    assert.equal(audio.headers.get("content-type"), "audio/mpeg");
    assert.equal(await audio.text(), "sample-audio");
  }
  assert.equal(replies, 1);
  assert.equal(speech, 1);
  const pause = await post(`${url}/api/voice`, {
    type: "enabled",
    enabled: false,
  });
  assert.equal(pause.status, 200);
  await pause.body?.cancel();
  const expired = await fetch(`${url}${state.voice.clip.url}`);
  assert.equal(expired.status, 404);
  await expired.body?.cancel();
  const page = await fetch(`${url}/chat`);
  assert.match(await page.text(), /Talk to Pilly/);
});

test("foreign origins and rebound hostnames cannot mutate the overlay", async (t) => {
  const url = await serve(t);
  const foreign = await post(
    `${url}/api/control`,
    { type: "reaction", id: "hype" },
    { Origin: "https://example.com" },
  );
  assert.equal(foreign.status, 403);
  await foreign.body?.cancel();
  const reboundStatus = await new Promise<number | undefined>(
    (resolve, reject) => {
      get(
        `${url}/api/state`,
        { headers: { Host: "evil.example:4317" } },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      ).on("error", reject);
    },
  );
  assert.equal(reboundStatus, 403);
  const state = await (await fetch(`${url}/api/state`)).json();
  assert.equal(state.reaction, null);
});

test("oversized requests and unknown reactions are rejected", async (t) => {
  const url = await serve(t);
  for (const input of [
    { type: "reaction", id: "missing" },
    { type: "caption", text: "x".repeat(9000) },
  ]) {
    const response = await post(`${url}/api/control`, input);
    assert.equal(response.status, 400);
    await response.body?.cancel();
  }
});

test("OBS subscribers receive the current scene and subsequent control updates", async (t) => {
  const url = await serve(t);
  const response = await fetch(`${url}/api/events`);
  const reader = response.body!.getReader();
  const first = await reader.read();
  assert.match(new TextDecoder().decode(first.value), /"expression":"default"/);
  const update = await post(`${url}/api/control`, {
    type: "expression",
    id: "happy",
  });
  assert.equal(update.status, 200);
  await update.body?.cancel();
  const next = await reader.read();
  assert.match(new TextDecoder().decode(next.value), /"expression":"happy"/);
  await reader.cancel();
});

test("chat ideas reach the shared feed with voice paused, without generating paid speech", async (t) => {
  let calls = 0;
  const url = await serve(t, {
    provider: {
      reply: async () => {
        calls++;
        return "hi";
      },
      synthesize: async () => {
        calls++;
        return { audio: Buffer.from("a"), durationMs: 1000 };
      },
    },
  });
  await (
    await post(`${url}/api/voice`, { type: "enabled", enabled: false })
  ).body?.cancel();
  const accepted = await post(`${url}/api/chat`, {
    text: "build some birch houses bro",
  });
  assert.equal(accepted.status, 202);
  const id = (await accepted.json()).id;
  const state = await (await fetch(`${url}/api/state`)).json();
  assert.equal(state.chat.at(-1).id, id);
  assert.equal(state.chat.at(-1).status, "heard");
  assert.equal(calls, 0);
});

test("invalid brain telemetry cannot partially change the last verified gameplay", () => {
  const state = initialState();
  const before = structuredClone(state);
  assert.throws(() =>
    applyTelemetry(state, {
      ...state.bot,
      connected: true,
      phase: "building",
      brain: {
        task: "Build",
        reason: "Wood",
        idea: "",
        completed: 10,
        total: 4,
        houses: 0,
        planted: 0,
        planner: "local",
      },
    }),
  );
  assert.deepEqual(state, before);
  applyTelemetry(state, {
    ...state.bot,
    connected: true,
    phase: "building",
    brain: {
      task: "Build house 1",
      reason: "Make a home",
      idea: "Chat likes birch",
      completed: 5,
      total: 93,
      houses: 0,
      planted: 0,
      planner: "model",
    },
  });
  assert.equal(state.bot.brain?.completed, 5);
});

test("native scene keeps the game HUD and accepts existing appearance settings", () => {
  const state = initialState();
  applyControl(state, {
    type: "settings",
    settings: { ...state.settings, scene: "native" },
  });
  assert.equal(state.settings.scene, "native");
  assert.equal(state.settings.showVitals, true);
  assert.equal(state.settings.side, "right");
});
