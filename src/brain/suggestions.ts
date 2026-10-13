import { privateQuestion } from "../persona/pilly.js";
import type { TaskKind, TownMemory } from "./types.js";

const topics: [TaskKind, RegExp, string][] = [
  [
    "shelter",
    /\b(shelter|hut|hideout)\b/i,
    "Chat suggested improving my shelter.",
  ],
  [
    "forage",
    /\b(food|hungry|snack|hunt|eat)\b/i,
    "Chat suggested looking for food.",
  ],
  [
    "tools",
    /\b(tools?|pickaxe|axe|armor|armour|torches?)\b/i,
    "Chat suggested working on my gear.",
  ],
  [
    "mine",
    /\b(mine|mining|ore|iron|coal|diamond)\b/i,
    "Chat suggested a mining trip when it's safe.",
  ],
  ["camp", /\b(bed|furnace|camp)\b/i, "Chat suggested improving the camp."],
  [
    "plant",
    /\b(plant|replant|garden|saplings?)\b/i,
    "Chat wants more greenery around camp.",
  ],
  [
    "build",
    /\b(build|houses?|cabins?|town|homes?)\b/i,
    "Chat likes the town idea. Saving that for later.",
  ],
  [
    "gather",
    /\b(collect|gather|chop|wood|logs?|trees?)\b/i,
    "Chat suggested stocking up on wood.",
  ],
  [
    "explore",
    /\b(explore|scout|walk|move around|look around)\b/i,
    "Chat suggested exploring the neighborhood.",
  ],
];
export function learnFromChat(
  memory: TownMemory,
  messages: unknown,
  now = Date.now(),
) {
  if (!Array.isArray(messages)) return false;
  let changed = false;
  for (const message of messages.slice(-40)) {
    if (
      !message ||
      message.role !== "viewer" ||
      typeof message.id !== "string" ||
      message.id.length > 80 ||
      typeof message.text !== "string" ||
      message.text.length > 300 ||
      memory.seenChat.includes(message.id)
    )
      continue;
    memory.seenChat = [...memory.seenChat.slice(-79), message.id];
    changed = true;
    const text = message.text;
    if (
      privateQuestion(text) ||
      /https?:|\b(ignore|instructions?|system|destroy|burn|lava|tnt|kill|execute|command|delete|don't|dont|never|not|stop)\b/i.test(
        text,
      )
    )
      continue;
    const wood = /\b(birch|oak)\b/i.exec(text)?.[1]?.toLowerCase();
    if (wood === "birch" || wood === "oak") {
      memory.wood = wood;
      memory.lastIdea = `Chat likes ${wood} wood. I'll use it when I have it.`;
    }
    const topic = topics.find(([, match]) => match.test(text));
    if (topic) {
      memory.preference = { task: topic[0], until: now + 10 * 60_000 };
      memory.lastIdea = topic[2];
    }
  }
  return changed;
}
