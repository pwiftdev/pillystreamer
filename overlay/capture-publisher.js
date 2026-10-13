import { captureSocket, localDescription, newPeer } from "./capture-peer.js";

export class CapturePublisher {
  constructor(stream, failed) {
    this.stream = stream;
    this.failed = failed;
    this.peers = new Map();
    this.socket = captureSocket(false);
    this.socket.on("viewer", (id) => void this.offer(id));
    this.socket.on("gone", (id) => this.drop(id));
    this.socket.on("signal", ({ peer, type, sdp }) => {
      if (type !== "answer") return;
      const connection = this.peers.get(peer);
      if (connection)
        void connection
          .setRemoteDescription({ type, sdp })
          .catch(() => this.drop(peer));
    });
    this.socket.on("disconnect", () => {
      if (!this.closed) {
        this.close();
        failed(
          "Camera sharing disconnected. Select the Minecraft window again.",
        );
      }
    });
  }
  start() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.socket.off("connect_error", failed);
        if (error) {
          this.close();
          reject(error);
        } else resolve();
      };
      const failed = () =>
        finish(new Error("Could not connect camera sharing."));
      const timer = setTimeout(failed, 6000);
      this.socket.once("connect_error", failed);
      this.socket.once("connect", () => {
        this.socket.timeout(3000).emit("publish", (error, result) => {
          if (this.closed || error || !result?.ok)
            finish(
              new Error(
                "Camera sharing could not start. Close any other studio sharing a window, then retry.",
              ),
            );
          else finish();
        });
      });
      this.socket.connect();
    });
  }
  async offer(id) {
    if (this.closed) return;
    this.drop(id);
    let peer;
    try {
      peer = newPeer();
      this.peers.set(id, peer);
      for (const track of this.stream.getVideoTracks())
        peer.addTrack(track, this.stream);
      const description = await localDescription(
        peer,
        await peer.createOffer(),
      );
      if (this.peers.get(id) === peer && !this.closed)
        this.socket.emit("signal", {
          peer: id,
          type: description.type,
          sdp: description.sdp,
        });
    } catch {
      if (!this.closed && (!peer || this.peers.get(id) === peer)) {
        this.close();
        this.failed("Could not send the Minecraft video. Start sharing again.");
      }
    }
  }
  drop(id) {
    this.peers.get(id)?.close();
    this.peers.delete(id);
  }
  close() {
    this.closed = true;
    for (const id of this.peers.keys()) this.drop(id);
    this.socket.disconnect();
  }
}
