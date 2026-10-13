export async function control(payload) {
  const response = await fetch("/api/control", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "Could not update the overlay.");
  }
}

const subscribers = new Set();
let source;
let lastState;
let connected = false;
export function subscribe(onState, onConnection) {
  const listener = { onState, onConnection };
  subscribers.add(listener);
  if (lastState) onState(lastState);
  onConnection(connected);
  if (!source) {
    source = new EventSource("/api/events");
    source.onmessage = (event) => {
      lastState = JSON.parse(event.data);
      connected = true;
      for (const subscriber of subscribers) {
        subscriber.onState(lastState);
        subscriber.onConnection(true);
      }
    };
    source.onerror = () => {
      connected = false;
      for (const subscriber of subscribers) subscriber.onConnection(false);
    };
    window.addEventListener("pagehide", () => source.close(), { once: true });
  }
  return () => subscribers.delete(listener);
}

export function isBotLive(bot) {
  return bot.connected && Date.now() - bot.updatedAt < 5_000;
}

export function objective(bot) {
  if (!isBotLive(bot)) return "Waiting for Pilly";
  if (bot.brain) return bot.brain.task;
  return (
    {
      gathering: `Gather wood · ${bot.logs} / ${bot.target} logs`,
      crafting: "Craft starter supplies",
      returning: "Find the way home",
      complete: "Mission complete",
    }[bot.phase] || "Getting ready"
  );
}
