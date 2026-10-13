import { subscribe } from "./shared.js";
const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");
const history = document.getElementById("chat-history");
const status = document.getElementById("chat-status");
let previous = "";
subscribe(
  (state) => {
    status.textContent = !state.voice.configured
      ? "Pilly’s voice is getting ready."
      : !state.voice.enabled
        ? "Mic off. Pilly can still consider your gameplay ideas."
        : state.voice.phase === "thinking"
          ? "Pilly is thinking…"
          : state.voice.phase === "speaking"
            ? "Pilly is speaking."
            : "Ask about Minecraft, Pumpville, or Pilly.";
    const signature = JSON.stringify(state.chat);
    if (signature === previous) return;
    previous = signature;
    const nearBottom =
      history.scrollHeight - history.scrollTop - history.clientHeight < 60;
    history.replaceChildren(
      ...state.chat.map((message) => {
        const item = document.createElement("li");
        item.className = `chat-message ${message.role}`;
        const name = document.createElement("strong");
        name.textContent = message.role === "pilly" ? "Pilly" : "Viewer";
        const text = document.createElement("p");
        text.textContent = message.text;
        item.append(name, text);
        if (message.role === "viewer" && message.status !== "answered") {
          const badge = document.createElement("small");
          badge.textContent = {
            queued: "Waiting for Pilly",
            failed: "Could not answer this time",
            skipped: "Skipped",
            heard: "Idea received · mic off",
          }[message.status];
          item.append(badge);
        }
        return item;
      }),
    );
    if (nearBottom) history.scrollTop = history.scrollHeight;
  },
  (connected) => {
    if (!connected) status.textContent = "Reconnecting to Pilly…";
  },
);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: input.value }),
    });
    if (!response.ok)
      throw new Error(
        (await response.json()).error || "Could not send that question.",
      );
    input.value = "";
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

let audible = false;
const sound = document.getElementById("preview-sound");
sound?.addEventListener("click", () => {
  audible = !audible;
  document
    .getElementById("overlay-preview")
    .contentWindow.postMessage(
      { type: "pilly-audio", enabled: audible },
      location.origin,
    );
  sound.textContent = audible ? "Mute preview" : "Hear Pilly";
  sound.setAttribute("aria-pressed", String(audible));
});
