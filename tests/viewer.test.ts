import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { get } from "node:http";
import { test, type TestContext } from "node:test";
import { Vec3 } from "vec3";
import type { Bot } from "mineflayer";
import { createGameViewer } from "../src/viewer.js";

async function serve(t: TestContext, failChunks = false) {
  const bot = Object.assign(new EventEmitter(), {
    version: "1.20.4",
    username: "Pilly",
    entity: { position: new Vec3(8, 64, 8), yaw: 1, pitch: 0.5 },
    entities: {},
    world: {
      getColumnAt: async () => {
        if (failChunks) throw new Error("Chunk unavailable");
        return null;
      },
    },
  }) as unknown as Bot;
  const viewer = createGameViewer(bot);
  viewer.server.listen(0, "127.0.0.1");
  await once(viewer.server, "listening");
  t.after(async () => {
    const closed = once(viewer.server, "close");
    viewer.close();
    await closed;
  });
  const address = viewer.server.address();
  assert(address && typeof address === "object");
  return { bot, url: `http://127.0.0.1:${address.port}` };
}

function connect(url: string) {
  const socket = new WebSocket(
    `${url.replace("http:", "ws:")}/socket.io/?EIO=4&transport=websocket`,
  );
  const events = new EventEmitter();
  socket.addEventListener("message", ({ data }) => {
    if (data.startsWith("0")) socket.send("40");
    if (data === "2") socket.send("3");
    if (data.startsWith("42")) {
      const [name, value] = JSON.parse(data.slice(2));
      events.emit(name, value);
    }
  });
  return { socket, events };
}

test("game viewer serves only its public assets and scopes schema evaluation to its worker", async (t) => {
  const { url } = await serve(t);
  const page = await fetch(url);
  assert.equal(page.status, 200);
  assert.doesNotMatch(
    page.headers.get("content-security-policy")!,
    /unsafe-eval/,
  );
  assert.match(await page.text(), /pilly-viewer.js/);
  const bundle = await fetch(`${url}/pilly-viewer.js`);
  assert.equal(bundle.status, 200);
  assert.doesNotMatch(
    bundle.headers.get("content-security-policy")!,
    /unsafe-eval/,
  );
  await bundle.body?.cancel();
  const worker = await fetch(`${url}/worker.js`);
  assert.match(worker.headers.get("content-security-policy")!, /unsafe-eval/);
  await worker.body?.cancel();
  for (const path of ["/.env", "/src/index.ts", "/%2e%2e/package.json"]) {
    const response = await fetch(`${url}${path}`);
    assert.equal(response.status, 404);
    await response.body?.cancel();
  }
  const rejected = await fetch(`${url}/socket.io/?EIO=4&transport=polling`, {
    headers: { Origin: "https://foreign.example" },
  });
  assert.equal(rejected.status, 403);
  await rejected.body?.cancel();
  const status = await new Promise((resolve, reject) => {
    get(url, { headers: { Host: "foreign.example" } }, (response) => {
      response.resume();
      resolve(response.statusCode);
    }).on("error", reject);
  });
  assert.equal(status, 403);
});

test(
  "an idle bot supplies its camera immediately and disconnect removes listeners",
  { timeout: 3000 },
  async (t) => {
    const { url, bot } = await serve(t);
    const { socket, events } = connect(url);
    t.after(() => socket.close());
    const [camera] = await once(events, "position");
    assert.ok(Number.isFinite(camera.time));
    assert.deepEqual(
      { pos: camera.pos, yaw: camera.yaw, pitch: camera.pitch },
      {
        pos: { x: 8, y: 64, z: 8 },
        yaw: 1,
        pitch: 0.5,
      },
    );
    assert.equal(bot.listenerCount("move"), 1);
    const removed = once(bot as unknown as EventEmitter, "removeListener");
    socket.close();
    await removed;
    assert.equal(bot.listenerCount("move"), 0);
    assert.equal(bot.listenerCount("blockUpdate"), 0);
  },
);

test(
  "failed chunk loading disconnects the viewer and releases bot listeners",
  { timeout: 3000 },
  async (t) => {
    const { url, bot } = await serve(t, true);
    const { socket } = connect(url);
    await new Promise((resolve) =>
      socket.addEventListener("close", resolve, { once: true }),
    );
    assert.equal(bot.listenerCount("move"), 0);
    assert.equal(bot.listenerCount("chunkColumnLoad"), 0);
  },
);

test(
  "stationary head turns get timestamped updates without movement events",
  { timeout: 3000 },
  async (t) => {
    const { url, bot } = await serve(t);
    const { socket, events } = connect(url);
    t.after(() => socket.close());
    const [first] = await once(events, "position");
    bot.entity.yaw = 2;
    bot.entity.pitch = -0.5;
    const [next] = await once(events, "position");
    assert.ok(next.time > first.time);
    assert.equal(next.yaw, 2);
    assert.equal(next.pitch, -0.5);
    assert.deepEqual(next.pos, first.pos);
  },
);
