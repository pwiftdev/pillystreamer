import { subscribe } from "./shared.js";
const enabled = document.getElementById("voice-enabled");
const automatic = document.getElementById("voice-auto");
const status = document.getElementById("voice-status");
subscribe(
  (state) => {
    enabled.checked = state.voice.enabled;
    automatic.checked = state.voice.autoCommentary;
    enabled.disabled = !state.voice.configured;
    document.getElementById("voice-intro").disabled =
      !state.voice.enabled ||
      ["thinking", "speaking"].includes(state.voice.phase);
    status.textContent =
      state.voice.error ||
      (!state.voice.configured
        ? "Set up ElevenLabs to give Pilly a voice."
        : `${state.voice.enabled ? "Liam · Voice ready" : "Voice paused"}${state.voice.queued ? ` · ${state.voice.queued} questions waiting` : ""}`);
  },
  (connected) => {
    if (!connected) status.textContent = "Reconnecting…";
  },
);
async function send(payload) {
  try {
    const response = await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok)
      throw new Error(
        (await response.json()).error || "Could not update Pilly’s voice.",
      );
  } catch (error) {
    status.textContent = error.message;
  }
}
enabled.addEventListener(
  "change",
  () => void send({ type: "enabled", enabled: enabled.checked }),
);
automatic.addEventListener(
  "change",
  () => void send({ type: "commentary", enabled: automatic.checked }),
);
document
  .getElementById("voice-intro")
  .addEventListener("click", () => void send({ type: "intro" }));
