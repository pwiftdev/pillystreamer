import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";

export function createCaptureRelay(server: HttpServer) {
  const io = new Server(server, {
    path: "/capture-socket",
    transports: ["websocket"],
    maxHttpBufferSize: 65_536,
    pingInterval: 5000,
    pingTimeout: 5000,
    allowRequest(request, accept) {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 4317;
      const host = request.headers.host;
      accept(
        null,
        Boolean(
          host &&
          [`localhost:${port}`, `127.0.0.1:${port}`].includes(host) &&
          (!request.headers.origin ||
            request.headers.origin === `http://${host}`),
        ),
      );
    },
  });
  let publisher: string | null = null;
  const viewers = new Set<string>();
  io.use((_socket, next) =>
    next(
      io.engine.clientsCount > 12 ? new Error("Capture is full") : undefined,
    ),
  );
  io.on("connection", (socket) => {
    socket.on("publish", (ack) => {
      if (typeof ack !== "function") return;
      if (viewers.has(socket.id) || (publisher && publisher !== socket.id)) {
        ack({ ok: false });
        return;
      }
      publisher = socket.id;
      ack({ ok: true });
      for (const id of viewers) {
        io.to(id).emit("source", publisher);
        socket.emit("viewer", id);
      }
    });
    socket.on("watch", () => {
      if (socket.id === publisher || viewers.has(socket.id)) return;
      viewers.add(socket.id);
      socket.emit("source", publisher);
      if (publisher) io.to(publisher).emit("viewer", socket.id);
    });
    socket.on("signal", (message) => {
      if (
        !message ||
        typeof message.peer !== "string" ||
        typeof message.sdp !== "string" ||
        message.sdp.length > 60_000
      )
        return;
      const offer =
        socket.id === publisher &&
        viewers.has(message.peer) &&
        message.type === "offer";
      const answer =
        viewers.has(socket.id) &&
        message.peer === publisher &&
        message.type === "answer";
      if (!offer && !answer) return;
      io.to(message.peer).emit("signal", {
        peer: socket.id,
        type: message.type,
        sdp: message.sdp,
      });
    });
    socket.on("disconnect", () => {
      if (socket.id === publisher) {
        publisher = null;
        for (const id of viewers) io.to(id).emit("source", null);
      }
      if (viewers.delete(socket.id) && publisher)
        io.to(publisher).emit("gone", socket.id);
    });
  });
  return io;
}
