const THREE = require("three");
globalThis.THREE = THREE;
const { Viewer } = require("prismarine-viewer/viewer/lib/viewer.js");
const { io } = require("socket.io-client");
const { CameraTrack, renderPixelRatio } = require("./camera.js");

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
});
document.body.appendChild(renderer.domElement);
const viewer = new Viewer(renderer);
const camera = new CameraTrack();
const status = document.getElementById("status");
const socket = io({ path: "/socket.io", transports: ["websocket"] });
let version;
let ready = false;

function resize() {
  renderer.setPixelRatio(
    renderPixelRatio(innerWidth, innerHeight, devicePixelRatio || 1),
  );
  renderer.setSize(innerWidth, innerHeight);
  viewer.camera.aspect = innerWidth / Math.max(1, innerHeight);
  viewer.camera.updateProjectionMatrix();
}
resize();
window.addEventListener("resize", resize);
viewer.listen(socket);
socket.on("version", (next) => {
  camera.reset();
  if (version !== next) {
    ready = viewer.setVersion(next);
    version = next;
  }
});
socket.on("position", (pose) => {
  if (ready && camera.push(pose, performance.now())) status.hidden = true;
});
function disconnected() {
  camera.reset();
  viewer.resetAll();
  ready = false;
  version = undefined;
  status.hidden = false;
  status.textContent = "Waiting for Pilly’s game…";
}
socket.on("disconnect", disconnected);
socket.on("connect_error", disconnected);
document.addEventListener("visibilitychange", () => camera.reset());
window.addEventListener("pagehide", () => socket.disconnect(), { once: true });

function animate(now) {
  requestAnimationFrame(animate);
  if (document.hidden) return;
  const pose = camera.sample(now);
  if (pose) {
    viewer.camera.position.set(
      pose.pos.x,
      pose.pos.y + viewer.playerHeight,
      pose.pos.z,
    );
    viewer.camera.rotation.set(pose.pitch, pose.yaw, 0, "ZYX");
  }
  viewer.update();
  renderer.render(viewer.scene, viewer.camera);
}
requestAnimationFrame(animate);
