import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createCaptureRelay } from "./capture.js";
import { initialState, applyControl, applyTelemetry } from "./state.js";
import { VoiceService, type VoiceOptions } from "../voice/service.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const files = new Map([
  ["/", ["overlay/index.html", "text/html"]],
  ["/overlay", ["overlay/overlay.html", "text/html"]],
  ["/chat", ["overlay/chat.html", "text/html"]],
  ...[
    "studio.js",
    "capture-peer.js",
    "capture-publisher.js",
    "capture-viewer.js",
    "broadcast.js",
    "hud.js",
    "mascot.js",
    "shared.js",
    "live-room.js",
    "room-character.js",
    "room-spec.js",
    "voice-player.js",
    "chat.js",
    "voice-controls.js",
  ].map((file) => [`/${file}`, [`overlay/${file}`, "text/javascript"]]),
  ["/live-room.svg", ["overlay/live-room.svg", "image/svg+xml"]],
  ...["studio.css", "broadcast.css"].map((file) => [
    `/${file}`,
    [`overlay/${file}`, "text/css"],
  ]),
  [
    "/mascot.js-source",
    ["design_handoff_pilly_mascot 2/code/pilly-sprite.js", "text/javascript"],
  ],
  [
    "/pilly.png",
    ["design_handoff_pilly_mascot 2/assets/png/pilly-main.png", "image/png"],
  ],
] as [string, string[]][]);

async function readJson(request: IncomingMessage) {
  if (request.headers["content-type"]?.split(";")[0] !== "application/json")
    throw new Error("Use application/json.");
  const chunks: Buffer[] = [];
  let size = 0;
  if (Number(request.headers["content-length"]) > 8_192) {
    request.resume();
    throw new Error("Request too large.");
  }
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 8_192) throw new Error("Request too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

export function createOverlayServer(voiceOptions: VoiceOptions = {}) {
  const state = initialState();
  const clients = new Set<ServerResponse>();
  const send = (client: ServerResponse) => {
    if (client.writableLength > 65_536) {
      client.destroy();
      return;
    }
    client.write(`data: ${JSON.stringify(state)}\n\n`);
  };
  const broadcast = () => {
    for (const client of clients) send(client);
  };
  const voice = new VoiceService(state, broadcast, voiceOptions);
  const server = createServer(async (request, response) => {
    const address = server.address();
    const port = address && typeof address === "object" ? address.port : 4317;
    const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    const host = request.headers.host ?? "";
    if (!allowedHosts.includes(host)) {
      response.writeHead(403).end();
      return;
    }
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; media-src 'self' blob:; frame-src 'self' http://127.0.0.1:4318; frame-ancestors 'self'; base-uri 'none'; object-src 'none'",
    );
    try {
      const path = new URL(request.url ?? "/", `http://${host}`).pathname;
      const audioId = /^\/api\/voice\/audio\/([a-f0-9-]{36})$/.exec(path)?.[1];
      if (request.method === "GET" && audioId) {
        const audio = voice.getAudio(audioId);
        if (!audio) response.writeHead(404).end("Speech expired");
        else
          response
            .writeHead(200, {
              "Content-Type": "audio/mpeg",
              "Content-Length": audio.length,
            })
            .end(audio);
        return;
      }
      if (request.method === "GET" && path === "/api/events") {
        if (clients.size >= 20) {
          response.writeHead(503).end();
          return;
        }
        response.writeHead(200, {
          "Content-Type": "text/event-stream",
          Connection: "keep-alive",
        });
        clients.add(response);
        request.on("close", () => clients.delete(response));
        send(response);
        return;
      }
      if (request.method === "GET" && path === "/api/state") {
        response
          .writeHead(200, { "Content-Type": "application/json" })
          .end(JSON.stringify(state));
        return;
      }
      if (
        request.method === "POST" &&
        ["/api/control", "/api/telemetry", "/api/chat", "/api/voice"].includes(
          path,
        )
      ) {
        const origin = request.headers.origin;
        if (origin && origin !== `http://${host}`) {
          response.writeHead(403).end();
          return;
        }
        const input = await readJson(request);
        if (path === "/api/chat") {
          const id = voice.ask(input);
          response
            .writeHead(202, { "Content-Type": "application/json" })
            .end(JSON.stringify({ id }));
          return;
        }
        if (path === "/api/voice") {
          voice.control(input);
          response
            .writeHead(200, { "Content-Type": "application/json" })
            .end(JSON.stringify({ ok: true }));
          return;
        }
        if (path === "/api/control") applyControl(state, input);
        else applyTelemetry(state, input);
        broadcast();
        response
          .writeHead(200, { "Content-Type": "application/json" })
          .end(JSON.stringify({ ok: true }));
        return;
      }
      const file = files.get(path);
      if (request.method !== "GET" || !file) {
        response.writeHead(404).end("Not found");
        return;
      }
      const content = await readFile(resolve(root, file[0]));
      response.writeHead(200, { "Content-Type": file[1] });
      response.end(content);
    } catch (error) {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      response.writeHead(400, { "Content-Type": "application/json" }).end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Request failed",
        }),
      );
    }
  });
  const capture = createCaptureRelay(server);
  server.requestTimeout = 10_000;
  const heartbeat = setInterval(() => {
    for (const client of clients) {
      if (client.writableLength > 65_536) client.destroy();
      else client.write(": heartbeat\n\n");
    }
  }, 15_000);
  heartbeat.unref();
  const commentary = setInterval(() => voice.tick(clients.size > 0), 1000);
  commentary.unref();
  server.on("close", () => {
    clearInterval(heartbeat);
    clearInterval(commentary);
    voice.close();
  });
  return {
    server,
    close: () => {
      voice.close();
      for (const client of clients) client.end();
      void capture.close();
    },
  };
}
