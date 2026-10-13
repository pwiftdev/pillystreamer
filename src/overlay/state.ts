import manifest from "../../design_handoff_pilly_mascot 2/assets/manifest.json" with { type: "json" };
import { initialVoice, type ChatMessage } from "../voice/state.js";
import type { BrainStatus } from "../brain/types.js";

export type Phase =
  | "offline"
  | "connecting"
  | "gathering"
  | "crafting"
  | "returning"
  | "complete"
  | "thinking"
  | "scouting"
  | "building"
  | "planting"
  | "exploring"
  | "eating"
  | "foraging"
  | "retreating"
  | "mining"
  | "smelting"
  | "sleeping"
  | "resting"
  | "error";
export interface Telemetry {
  connected: boolean;
  phase: Phase;
  health: number;
  food: number;
  logs: number;
  target: number;
  brain?: BrainStatus;
}
export interface Settings {
  scene: "game" | "native" | "room" | "sprite";
  speech: "off" | "demo";
  headphones: "Green" | "Pine" | "Rose";
  sticker: boolean;
  scale: number;
  side: "left" | "right";
  showVitals: boolean;
  showObjective: boolean;
  showCaptions: boolean;
}
export function initialState() {
  return {
    voice: initialVoice(),
    chat: [] as ChatMessage[],
    settings: {
      scene: "game",
      speech: "off",
      headphones: "Green",
      sticker: false,
      scale: 5,
      side: "right",
      showVitals: true,
      showObjective: true,
      showCaptions: true,
    } as Settings,
    expression: "default",
    reaction: null as { id: string; startedAt: number } | null,
    caption: { text: "", expiresAt: 0 },
    bot: {
      connected: false,
      phase: "offline",
      health: 0,
      food: 0,
      logs: 0,
      target: 8,
      updatedAt: 0,
    } as Telemetry & { updatedAt: number },
  };
}
export type OverlayState = ReturnType<typeof initialState>;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected an object.");
  return value as Record<string, unknown>;
}
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== "string" || !choices.includes(value as T))
    throw new Error("Invalid selection.");
  return value as T;
}
function number(value: unknown, min: number, max: number) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new Error("Number outside the allowed range.");
  return value;
}
function boolean(value: unknown) {
  if (typeof value !== "boolean") throw new Error("Expected a boolean.");
  return value;
}

export function applyControl(
  state: OverlayState,
  input: unknown,
  now = Date.now(),
) {
  const data = object(input);
  switch (data.type) {
    case "settings": {
      const settings = object(data.settings);
      const next = {
        scene: choice(settings.scene ?? state.settings.scene, [
          "game",
          "native",
          "room",
          "sprite",
        ] as const),
        speech: choice(settings.speech ?? state.settings.speech, [
          "off",
          "demo",
        ] as const),
        headphones: choice(settings.headphones, [
          "Green",
          "Pine",
          "Rose",
        ] as const),
        sticker: boolean(settings.sticker),
        scale: number(settings.scale, 3, 7),
        side: choice(settings.side, ["left", "right"] as const),
        showVitals: boolean(settings.showVitals),
        showObjective: boolean(settings.showObjective),
        showCaptions: boolean(settings.showCaptions),
      };
      if (!Number.isInteger(next.scale))
        throw new Error("Sprite scale must be a whole number.");
      state.settings = next;
      break;
    }
    case "reaction":
      state.reaction = {
        id: choice(
          data.id,
          manifest.reactions.map((item) => item.id),
        ),
        startedAt: now,
      };
      break;
    case "expression":
      state.expression = choice(
        data.id,
        manifest.expressions.map((item) => item.name),
      );
      state.reaction = null;
      break;
    case "caption":
      if (typeof data.text !== "string" || data.text.length > 180)
        throw new Error("Captions must be at most 180 characters.");
      state.caption = { text: data.text.trim(), expiresAt: now + 10_000 };
      break;
    case "reset":
      state.settings.speech = "off";
      state.expression = "default";
      state.reaction = null;
      state.caption = { text: "", expiresAt: 0 };
      break;
    default:
      throw new Error("Unknown control.");
  }
}

export function applyTelemetry(
  state: OverlayState,
  input: unknown,
  now = Date.now(),
) {
  const data = object(input);
  const next = {
    connected: boolean(data.connected),
    phase: choice(data.phase, [
      "offline",
      "connecting",
      "gathering",
      "crafting",
      "returning",
      "complete",
      "thinking",
      "scouting",
      "building",
      "planting",
      "exploring",
      "resting",
      "eating",
      "foraging",
      "retreating",
      "mining",
      "smelting",
      "sleeping",
      "error",
    ] as const),
    health: number(data.health, 0, 20),
    food: number(data.food, 0, 20),
    logs: number(data.logs, 0, 2304),
    target: number(data.target, 4, 64),
    brain: data.brain === undefined ? undefined : brainStatus(data.brain),
    updatedAt: now,
  };
  const previous = state.bot;
  const fresh = previous.connected && now - previous.updatedAt < 5_000;
  let reaction: string | undefined;
  if (next.connected && !fresh) reaction = "hello";
  else if (next.connected && next.health < previous.health) reaction = "scare";
  else if (
    next.connected &&
    (next.brain?.houses ?? 0) > (previous.brain?.houses ?? 0)
  )
    reaction = "hype";
  else if (next.phase !== previous.phase) {
    if (next.phase === "complete") reaction = "hype";
    if (next.phase === "crafting") reaction = "think";
    if (next.phase === "error") reaction = "nervous";
  }
  state.bot = next;
  if (reaction) state.reaction = { id: reaction, startedAt: now };
}

function brainStatus(input: unknown): BrainStatus {
  const data = object(input);
  const text = (value: unknown, limit: number) => {
    if (typeof value !== "string" || value.length > limit)
      throw new Error("Invalid town status.");
    return value;
  };
  const count = (value: unknown, min: number, max: number) => {
    const result = number(value, min, max);
    if (!Number.isInteger(result))
      throw new Error("Town counts must be whole numbers.");
    return result;
  };
  const completed = count(data.completed, 0, 1000);
  const total = count(data.total, completed, 1000);
  return {
    task: text(data.task, 100),
    reason: text(data.reason, 180),
    idea: text(data.idea, 120),
    completed,
    total,
    houses: count(data.houses, 0, 64),
    planted: count(data.planted, 0, 1_000_000),
    planner: choice(data.planner, ["local", "model"] as const),
    outcome: data.outcome === undefined ? undefined : text(data.outcome, 180),
    plan: data.plan === undefined ? undefined : text(data.plan, 180),
    chapter: data.chapter === undefined ? undefined : text(data.chapter, 40),
    day: data.day === undefined ? undefined : count(data.day, 1, 1000000),
  };
}
