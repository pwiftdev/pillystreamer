export const ROOM_REACTIONS = {
  hello: {
    label: "Wave hi",
    duration: 2600,
    expression: "happy",
    gesture: "wave",
  },
  hype: {
    label: "Cheer",
    duration: 2200,
    expression: "laughing",
    gesture: "cheer",
    lock: true,
  },
  lol: {
    label: "LOL",
    duration: 2400,
    expression: "laughing",
    gesture: "laugh",
    lock: true,
  },
  scare: {
    label: "Jump scare",
    duration: 2000,
    expression: "shocked",
    gesture: "shock",
    lock: true,
  },
  love: {
    label: "Love",
    duration: 3000,
    expression: "in-love",
    gesture: "love",
  },
  think: {
    label: "Thinking",
    duration: 3200,
    expression: "thinking",
    gesture: "think",
  },
  rage: { label: "Rage", duration: 2200, expression: "angry", gesture: "rage" },
};

const EXTRA_REACTIONS = {
  cry: { duration: 2400, expression: "crying", gesture: "laugh", lock: true },
  vibe: { duration: 3000, expression: "happy", gesture: "wave" },
  sleep: { duration: 4500, expression: "sleepy", gesture: "" },
  dizzy: { duration: 2400, expression: "dizzy", gesture: "laugh", lock: true },
  nervous: { duration: 2000, expression: "nervous", gesture: "shock" },
};

export function roomReaction(reaction, now = Date.now()) {
  if (!reaction) return null;
  const spec = Object.hasOwn(ROOM_REACTIONS, reaction.id)
    ? ROOM_REACTIONS[reaction.id]
    : Object.hasOwn(EXTRA_REACTIONS, reaction.id)
      ? EXTRA_REACTIONS[reaction.id]
      : null;
  const elapsed = now - reaction.startedAt;
  if (!spec || elapsed < 0 || elapsed >= spec.duration) return null;
  return {
    ...spec,
    elapsed: elapsed / 1000,
    weight: Math.max(
      0,
      Math.min(1, elapsed / 250, (spec.duration - elapsed) / 350),
    ),
  };
}

export function spring(hand, target, dt) {
  dt = Math.max(0, Math.min(dt, 0.05));
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const step = dt / steps;
  for (let n = 0; n < steps; n++) {
    for (let i = 0; i < 2; i++) {
      hand.v[i] += ((target[i] - hand.p[i]) * 190 - hand.v[i] * 21) * step;
      hand.p[i] += hand.v[i] * step;
    }
  }
}
