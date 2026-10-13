export function captureSocket(reconnection = true) {
  return window.io({
    path: "/capture-socket",
    transports: ["websocket"],
    reconnection,
    autoConnect: false,
  });
}

export async function localDescription(peer, description) {
  await peer.setLocalDescription(description);
  if (peer.iceGatheringState !== "complete") {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => finish(new Error("Camera connection timed out.")),
        5000,
      );
      const check = () => {
        if (peer.connectionState === "closed")
          finish(new Error("Camera connection closed."));
        else if (peer.iceGatheringState === "complete") finish();
      };
      const finish = (error) => {
        clearTimeout(timer);
        peer.removeEventListener("icegatheringstatechange", check);
        peer.removeEventListener("connectionstatechange", check);
        if (error) reject(error);
        else resolve();
      };
      peer.addEventListener("icegatheringstatechange", check);
      peer.addEventListener("connectionstatechange", check);
      check();
    });
  }
  if (peer.connectionState === "closed")
    throw new Error("Camera connection closed.");
  return peer.localDescription;
}

export function newPeer() {
  return new RTCPeerConnection({ iceServers: [] });
}
