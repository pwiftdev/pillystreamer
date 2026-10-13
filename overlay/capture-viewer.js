import { captureSocket, localDescription, newPeer } from "./capture-peer.js";

export class CaptureViewer {
  constructor(video) {
    this.video = video;
    this.socket = captureSocket();
    this.socket.on("connect", () => this.socket.emit("watch"));
    this.socket.on("disconnect", () => this.reset());
    this.socket.on("source", (source) => {
      this.reset();
      this.source = source;
    });
    this.socket.on("signal", (message) => void this.receive(message));
  }
  setEnabled(enabled) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (enabled) this.socket.connect();
    else {
      this.socket.disconnect();
      this.reset();
    }
  }
  reset() {
    this.source = null;
    this.peer?.close();
    this.peer = null;
    this.video.srcObject = null;
    this.video.hidden = true;
  }
  async receive({ peer: source, type, sdp }) {
    if (!this.enabled || source !== this.source || type !== "offer") return;
    this.peer?.close();
    let peer;
    try {
      peer = newPeer();
    } catch {
      this.reset();
      return;
    }
    this.peer = peer;
    peer.ontrack = ({ streams }) => {
      if (this.peer !== peer || !this.enabled) return;
      this.video.srcObject = streams[0];
      void this.video
        .play()
        .then(() => {
          if (this.peer === peer && this.enabled) this.video.hidden = false;
        })
        .catch(() => {
          if (this.peer === peer) this.reset();
        });
    };
    peer.onconnectionstatechange = () => {
      if (
        this.peer === peer &&
        ["failed", "disconnected", "closed"].includes(peer.connectionState)
      )
        this.reset();
    };
    try {
      await peer.setRemoteDescription({ type, sdp });
      const description = await localDescription(
        peer,
        await peer.createAnswer(),
      );
      if (this.peer === peer && this.enabled)
        this.socket.emit("signal", {
          peer: source,
          type: description.type,
          sdp: description.sdp,
        });
    } catch {
      if (this.peer === peer) this.reset();
    }
  }
}
