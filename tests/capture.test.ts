import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createServer } from "node:http";
import { once, type EventEmitter } from "node:events";
import { io, type Socket } from "socket.io-client";
import { createCaptureRelay } from "../src/overlay/capture.js";

async function fixture(t: TestContext) {
  const server = createServer();
  const relay = createCaptureRelay(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  const sockets: Socket[] = [];
  t.after(async () => {
    sockets.forEach((socket) => socket.disconnect());
    await new Promise<void>((resolve) => relay.close(() => resolve()));
  });
  return async (origin?: string) => {
    const socket = io(`http://127.0.0.1:${address.port}`, {
      path: "/capture-socket",
      transports: ["websocket"],
      reconnection: false,
      extraHeaders: origin ? { Origin: origin } : undefined,
    });
    sockets.push(socket);
    return socket;
  };
}
async function connect(make: Awaited<ReturnType<typeof fixture>>) {
  const socket = await make();
  await once(socket as unknown as EventEmitter, "connect");
  return socket;
}
const publish = (socket: Socket) => socket.timeout(1000).emitWithAck("publish");
const event = (socket: Socket, name: string) =>
  once(socket as unknown as EventEmitter, name);

test("one publisher feeds overlays; a second publisher cannot steal it", async (t) => {
  const make = await fixture(t),
    publisher = await connect(make),
    viewer = await connect(make),
    other = await connect(make);
  assert.deepEqual(await publish(publisher), { ok: true });
  const source = event(viewer, "source"),
    joined = event(publisher, "viewer");
  viewer.emit("watch");
  assert.equal((await source)[0], publisher.id);
  assert.equal((await joined)[0], viewer.id);
  assert.deepEqual(await publish(other), { ok: false });
  const offer = event(viewer, "signal");
  publisher.emit("signal", { peer: viewer.id, type: "offer", sdp: "offer" });
  assert.deepEqual((await offer)[0], {
    peer: publisher.id,
    type: "offer",
    sdp: "offer",
  });
  const answer = event(publisher, "signal");
  viewer.emit("signal", { peer: publisher.id, type: "answer", sdp: "answer" });
  assert.equal((await answer)[0].type, "answer");
});

test("publisher crash releases ownership and clears viewers; stale sender cannot signal", async (t) => {
  const make = await fixture(t),
    old = await connect(make),
    viewer = await connect(make);
  await publish(old);
  let source = event(viewer, "source");
  viewer.emit("watch");
  await source;
  source = event(viewer, "source");
  old.io.engine.close();
  assert.equal((await source)[0], null);
  const replacement = await connect(make);
  source = event(viewer, "source");
  assert.deepEqual(await publish(replacement), { ok: true });
  assert.equal((await source)[0], replacement.id);
  let received = false;
  viewer.on("signal", () => {
    received = true;
  });
  const unregistered = await connect(make);
  unregistered.emit("signal", { peer: viewer.id, type: "offer", sdp: "stale" });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(received, false);
});

test("lost acknowledgement and post-ack local failure release ownership on disconnect", async (t) => {
  const make = await fixture(t),
    viewer = await connect(make);
  let source = event(viewer, "source");
  viewer.emit("watch");
  await source;
  for (const acknowledgementLost of [true, false]) {
    const publisher = await connect(make);
    source = event(viewer, "source");
    if (acknowledgementLost) publisher.emit("publish", () => {});
    else assert.deepEqual(await publish(publisher), { ok: true });
    await source;
    source = event(viewer, "source");
    publisher.disconnect();
    assert.equal((await source)[0], null);
  }
  const replacement = await connect(make);
  assert.deepEqual(await publish(replacement), { ok: true });
});

test("viewer loss releases its peer; malformed and viewer-to-viewer messages are ignored", async (t) => {
  const make = await fixture(t),
    publisher = await connect(make),
    a = await connect(make),
    b = await connect(make);
  await publish(publisher);
  for (const viewer of [a, b]) {
    const ready = event(viewer, "source");
    viewer.emit("watch");
    await ready;
  }
  let received = false;
  b.on("signal", () => {
    received = true;
  });
  a.emit("signal", { peer: b.id, type: "offer", sdp: "bad" });
  publisher.emit("signal", { peer: b.id, type: "offer", sdp: 123 });
  publisher.emit("signal", {
    peer: b.id,
    type: "offer",
    sdp: "x".repeat(60001),
  });
  const gone = event(publisher, "gone"),
    id = a.id;
  a.disconnect();
  assert.equal((await gone)[0], id);
  assert.equal(received, false);
});

test("foreign websites cannot open capture signaling", async (t) => {
  const make = await fixture(t);
  const socket = await make("https://foreign.example");
  await once(socket as unknown as EventEmitter, "connect_error");
  assert.equal(socket.connected, false);
});
