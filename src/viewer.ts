import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from "express";
import { Server, type Socket } from "socket.io";
import type { Bot } from "mineflayer";

const require = createRequire(import.meta.url);
interface WorldView {
  init(position: Bot["entity"]["position"]): Promise<void>;
  updatePosition(position: Bot["entity"]["position"]): Promise<void>;
  listenToBot(bot: Bot): void;
  removeListenersFromBot(bot: Bot): void;
}
const { WorldView } = require("prismarine-viewer/viewer/lib/worldView.js") as {
  WorldView: new (
    world: Bot["world"],
    distance: number,
    position: Bot["entity"]["position"],
    socket: Socket,
  ) => WorldView;
};
const assets = join(dirname(require.resolve("prismarine-viewer")), "public");

export function createGameViewer(bot: Bot) {
  const app = express();
  const server = createServer(app);
  const allowed = (host?: string) => {
    const address = server.address();
    return address && typeof address === "object"
      ? ["127.0.0.1", "localhost"].some(
          (name) => host === `${name}:${address.port}`,
        )
      : false;
  };
  app.disable("x-powered-by");
  app.use((request, response, next) => {
    if (!allowed(request.headers.host)) {
      response.sendStatus(403);
      return;
    }
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader(
      "Content-Security-Policy",
      request.path === "/worker.js"
        ? "default-src 'none'; script-src 'self' 'unsafe-eval'"
        : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; worker-src 'self'; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; frame-ancestors http://127.0.0.1:4317 http://localhost:4317; object-src 'none'; base-uri 'none'",
    );
    next();
  });
  app.get(["/", "/index.html"], (_request, response) =>
    response.sendFile(
      fileURLToPath(new URL("../viewer/index.html", import.meta.url)),
    ),
  );
  app.get("/pilly-viewer.js", (_request, response) =>
    response.sendFile(
      fileURLToPath(
        new URL("../.runtime/viewer/pilly-viewer.js", import.meta.url),
      ),
    ),
  );
  app.use(express.static(assets, { dotfiles: "deny" }));
  const io = new Server(server, {
    maxHttpBufferSize: 4096,
    allowRequest: (request, callback) => {
      const origin = request.headers.origin;
      callback(
        null,
        Boolean(allowed(request.headers.host)) &&
          (!origin || origin === `http://${request.headers.host}`),
      );
    },
  });
  io.use((_socket, next) => {
    next(io.engine.clientsCount > 8 ? new Error("Viewer is full") : undefined);
  });
  io.on("connection", (socket) => {
    socket.emit("version", bot.version);
    const world = new WorldView(bot.world, 6, bot.entity.position, socket);
    socket.removeAllListeners("mouseClick");
    const fail = () => socket.disconnect(true);
    const position = (reliable = false) => {
      (reliable ? socket : socket.volatile).emit("position", {
        time: performance.now(),
        pos: bot.entity.position,
        yaw: bot.entity.yaw,
        pitch: bot.entity.pitch,
      });
    };
    const updateChunks = () => {
      void world.updatePosition(bot.entity.position.clone()).catch(fail);
    };
    world.listenToBot(bot);
    bot.on("move", updateChunks);
    const cameraTimer = setInterval(() => position(), 50);
    cameraTimer.unref();
    socket.once("disconnect", () => {
      clearInterval(cameraTimer);
      bot.removeListener("move", updateChunks);
      world.removeListenersFromBot(bot);
    });
    position(true);
    void world.init(bot.entity.position).catch(fail);
  });
  return {
    server,
    close: () => {
      void io.close();
    },
  };
}
