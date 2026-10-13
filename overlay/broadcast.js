import { CaptureViewer } from "./capture-viewer.js";
import { Mascot } from "./mascot.js";
import { LiveRoom } from "./live-room.js";
import { VoicePlayer } from "./voice-player.js";
import { Hud } from "./hud.js";
import { subscribe, isBotLive } from "./shared.js";

const $ = (id) => document.getElementById(id);
const mascot = new Mascot($("sprite"));
const voice = new VoicePlayer($("voice-toggle"));
const hud = new Hud();
const native = new CaptureViewer($("native-video"));
const preview = new URLSearchParams(location.search).has("preview");
const external = new URLSearchParams(location.search).has("external");
addEventListener("pagehide", () => native.setEnabled(false), { once: true });
let room;
let roomFailed = false;
let state;
let connected = false;
let lastFrame = -Infinity;

async function loadRoom() {
  try {
    const response = await fetch("/live-room.svg");
    if (!response.ok) throw new Error("Could not load room artwork.");
    room = new LiveRoom($("live-room"), await response.text());
  } catch {
    roomFailed = true;
  }
}
void loadRoom();
subscribe(
  (next) => {
    state = next;
    voice.sync(next.voice);
  },
  (value) => {
    connected = value;
  },
);

function resize() {
  $("stage").style.transform =
    `scale(${Math.min(innerWidth / 1920, innerHeight / 1080)})`;
}
addEventListener("resize", resize);
resize();

function drawScene(live) {
  const scene = state.settings.scene;
  native.setEnabled(scene === "native" && !preview && !external);
  $("capture-waiting").hidden =
    scene !== "native" || preview || external || !$("native-video").hidden;
  const stage = $("stage");
  stage.classList.toggle("native", scene === "native");
  stage.classList.toggle("room", scene === "room");
  stage.classList.toggle("game", scene === "game" || scene === "native");
  stage.classList.toggle("left", state.settings.side === "left");
  $("pilly-cam").hidden = scene === "sprite";
  $("scene-error").hidden = scene === "sprite" || !roomFailed;
  const source =
    scene === "game" && live ? "http://127.0.0.1:4318/" : "about:blank";
  if ($("game-view").getAttribute("src") !== source)
    $("game-view").src = source;
  $("game-view").hidden = scene !== "game" || !live;
  $("game-waiting").hidden = scene !== "game" || live;
  $("waiting-detail").textContent = connected
    ? "Waiting for Pilly to join Minecraft."
    : "The stream is reconnecting. Hang tight, chat.";
  $("connection").classList.toggle("live", live);
  $("connection-label").textContent = !connected
    ? "RECONNECTING"
    : live
      ? "IN GAME"
      : "ON A BREAK";
  $("sprite").style.width = `${state.settings.scale * 56}px`;
  $("sprite").style.height = `${state.settings.scale * 74}px`;
}

function drawSpeech(audio) {
  $("stage").classList.toggle("speaking", audio.active);
  $("pilly-cam").style.setProperty("--voice-level", audio.amplitude.toFixed(2));
  $("cam-status").textContent = audio.active
    ? "yapping"
    : !state.voice.enabled
      ? "mic off"
      : state.voice.phase === "thinking"
        ? "cooking a thought"
        : "just vibing";
  const spoken = state.voice.clip;
  const now = Date.now();
  const caption =
    spoken && now >= spoken.startsAt && now < spoken.expiresAt
      ? spoken.text
      : now < state.caption.expiresAt
        ? state.caption.text
        : "";
  $("caption-text").textContent = caption;
  $("caption").hidden = !connected || !state.settings.showCaptions || !caption;
}

function tick(now) {
  requestAnimationFrame(tick);
  if (!state) return;
  const audio = voice.sample();
  if (state.settings.scene !== "sprite") room?.draw(state, now, audio);
  if (now - lastFrame < 125) return;
  lastFrame = now;
  if (state.settings.scene === "sprite") mascot.draw(state, now, audio);
  const live = connected && isBotLive(state.bot);
  drawScene(live);
  drawSpeech(audio);
  hud.draw(state, live, connected, now);
}
requestAnimationFrame(tick);
