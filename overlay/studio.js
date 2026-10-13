import { CapturePublisher } from "./capture-publisher.js";
import {
  REACTIONS,
  EXPRESSIONS,
  renderPilly,
  reactionFrame,
} from "/mascot.js-source";
import { control, subscribe, isBotLive, objective } from "./shared.js";
import { ROOM_REACTIONS, roomReaction } from "./room-spec.js";

const $ = (id) => document.getElementById(id);
let state;
let connected = false;
let toastTimer;
let captureStream;
let publisher;
let capturePending = false;
let pageClosed = false;
const form = $("settings-form");

function toast(message) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").hidden = false;
  toastTimer = setTimeout(() => {
    $("toast").hidden = true;
  }, 4_000);
}
async function send(payload) {
  try {
    await control(payload);
    return true;
  } catch (error) {
    toast(error.message);
    return false;
  }
}

function syncSettings() {
  if (form.contains(document.activeElement)) return;
  for (const [name, value] of Object.entries(state.settings)) {
    const input = form.elements.namedItem(name);
    if (input instanceof HTMLInputElement && input.type === "checkbox")
      input.checked = value;
    else if (input) input.value = String(value);
  }
  $("scale-value").textContent = `${state.settings.scale}×`;
}

function syncScene() {
  const isRoom = state.settings.scene !== "sprite";
  $("sprite-controls").hidden = isRoom;
  $("speech-controls").hidden = !isRoom;
  const canCapture = ["native", "sprite"].includes(state.settings.scene);
  $("preview-guide").hidden = !canCapture || Boolean(captureStream);
  $("capture").hidden = !canCapture;
  document.querySelector(".preview-footer").hidden = !canCapture;
  $("preview-title").textContent = ["game", "native"].includes(
    state.settings.scene,
  )
    ? state.settings.scene === "native"
      ? "Minecraft · native window"
      : "Minecraft · browser preview"
    : isRoom
      ? "Pilly’s live room"
      : "Stage preview";
  $("reaction-note").textContent =
    `Tap a reaction to play it ${isRoom ? "once" : "twice"}, then return to idle. Reactions also follow Pilly’s gameplay.`;
  document.querySelectorAll("[data-reaction]").forEach((button) => {
    const id = button.dataset.reaction;
    const spec = isRoom ? ROOM_REACTIONS[id] : REACTIONS[id];
    button.hidden = !spec;
    if (!spec) return;
    button.querySelector("strong").textContent = spec.label;
    button.querySelector("small").textContent = isRoom
      ? `${spec.duration / 1000} SECONDS`
      : `${spec.frames} FRAMES`;
    button.setAttribute("aria-label", `Play ${spec.label}`);
  });
  if (!canCapture && captureStream) stopCapture();
}

subscribe(
  (next) => {
    state = next;
    syncSettings();
    syncScene();
    $("expression").value = state.expression;
  },
  (value) => {
    connected = value;
    $("service-status").textContent = value ? "Overlay ready" : "Reconnecting";
    $("service-status").classList.toggle("connected", value);
  },
);

form.addEventListener("input", (event) => {
  if (event.target.name === "scale")
    $("scale-value").textContent = `${event.target.value}×`;
});
form.addEventListener("change", () => {
  const data = new FormData(form);
  void send({
    type: "settings",
    settings: {
      scene: data.get("scene"),
      speech: data.get("speech"),
      headphones: data.get("headphones"),
      scale: Number(data.get("scale")),
      side: data.get("side"),
      ...Object.fromEntries(
        ["sticker", "showObjective", "showVitals", "showCaptions"].map(
          (name) => [name, data.has(name)],
        ),
      ),
    },
  });
});

for (const [id, reaction] of Object.entries(REACTIONS)) {
  const button = document.createElement("button");
  button.className = "reaction-card";
  button.dataset.reaction = id;
  button.setAttribute("aria-label", `Play ${reaction.label}`);
  const art = document.createElement("div");
  art.className = "reaction-art";
  art.setAttribute("aria-hidden", "true");
  art.innerHTML = renderPilly(reactionFrame(id, id === "scare" ? 3 : 0));
  const title = document.createElement("strong");
  title.textContent = reaction.label;
  const subtitle = document.createElement("small");
  subtitle.textContent = `${reaction.frames} FRAMES`;
  button.append(art, title, subtitle);
  button.addEventListener("click", () => void send({ type: "reaction", id }));
  $("reactions").append(button);
}
for (const id of Object.keys(EXPRESSIONS)) {
  $("expression").add(
    new Option(
      id.replaceAll("-", " ").replace(/^./, (char) => char.toUpperCase()),
      id,
    ),
  );
}
$("expression").addEventListener(
  "change",
  (event) => void send({ type: "expression", id: event.target.value }),
);
$("reset").addEventListener("click", () => void send({ type: "reset" }));
$("caption-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (await send({ type: "caption", text: $("caption-input").value }))
    toast("Caption is on the overlay for 10 seconds.");
});
$("copy-url").addEventListener("click", async () => {
  const url = `${location.origin}/overlay`;
  try {
    await navigator.clipboard.writeText(url);
    toast("OBS link copied. Use a 1920 × 1080 Browser Source.");
  } catch {
    toast(`OBS link: ${url}`);
  }
});

document.querySelectorAll("[data-background]").forEach((button) => {
  button.addEventListener("click", () => {
    $("preview").className = `preview ${button.dataset.background}`;
    document.querySelectorAll("[data-background]").forEach((item) => {
      item.classList.toggle("active", item === button);
      item.setAttribute("aria-pressed", String(item === button));
    });
  });
});

function stopCapture() {
  publisher?.close();
  publisher = undefined;
  captureStream?.getTracks().forEach((track) => track.stop());
  captureStream = undefined;
  $("game-video").srcObject = null;
  $("game-video").hidden = true;
  $("preview-guide").hidden = !["native", "sprite"].includes(
    state?.settings.scene,
  );
  $("capture").textContent = "Share Minecraft to overlay";
}
$("capture").addEventListener("click", async () => {
  if (capturePending || !["native", "sprite"].includes(state?.settings.scene))
    return;
  if (captureStream) {
    stopCapture();
    return;
  }
  if (!navigator.mediaDevices?.getDisplayMedia) {
    toast(
      "Open this studio in Chrome or Edge to preview a window. OBS can capture Minecraft directly.",
    );
    return;
  }
  capturePending = true;
  $("capture").disabled = true;
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: "window",
        frameRate: { ideal: 60, max: 60 },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
    if (pageClosed || !["native", "sprite"].includes(state?.settings.scene)) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    captureStream = stream;
    stream
      .getVideoTracks()[0]
      .addEventListener("ended", stopCapture, { once: true });
    $("game-video").srcObject = captureStream;
    await $("game-video").play();
    if (captureStream !== stream || pageClosed) return;
    $("game-video").hidden = false;
    $("preview-guide").hidden = true;
    const sharing = new CapturePublisher(captureStream, (message) => {
      stopCapture();
      toast(message);
    });
    publisher = sharing;
    await sharing.start();
    if (publisher !== sharing || pageClosed) return;
    $("capture").textContent = "Stop sharing Minecraft";
  } catch (error) {
    stopCapture();
    toast(
      error.name === "NotAllowedError"
        ? "Window preview was cancelled or blocked. You can still use the overlay in OBS."
        : error.message || "Could not share Minecraft to the overlay.",
    );
  } finally {
    capturePending = false;
    $("capture").disabled = false;
  }
});
addEventListener(
  "pagehide",
  () => {
    pageClosed = true;
    stopCapture();
  },
  { once: true },
);

setInterval(() => {
  if (!state) return;
  const live = connected && isBotLive(state.bot);
  $("bot-dot").classList.toggle("connected", live);
  $("bot-status").textContent = live
    ? "Pilly is connected"
    : "Pilly is offline";
  $("bot-objective").textContent = live
    ? objective(state.bot)
    : "The overlay is ready whenever he is.";
  document.querySelectorAll("[data-reaction]").forEach((button) => {
    const reaction = state.reaction;
    const spec = reaction && REACTIONS[reaction.id];
    const playing =
      spec &&
      reaction.id === button.dataset.reaction &&
      (state.settings.scene !== "sprite"
        ? Boolean(roomReaction(reaction))
        : Date.now() - reaction.startedAt < spec.frames * spec.frameMs * 2);
    button.classList.toggle("active", Boolean(playing));
  });
}, 250);
