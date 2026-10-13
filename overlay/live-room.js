import { roomCharacter, roomExpressions } from "./room-character.js";
import { roomReaction, spring } from "./room-spec.js";

const round = (value) => Number(value.toFixed(3));
const ease = (dt, speed) => 1 - Math.exp(-dt * speed);
const mix = (base, target, weight) =>
  target ? base.map((value, i) => value + (target[i] - value) * weight) : base;

export class LiveRoom {
  constructor(element, art) {
    this.element = element;
    element.innerHTML = art;
    this.nodes = new Map();
    this.amp = 0;
    this.gate = 0;
    this.typing = 0;
    this.gaze = [0, 0];
    this.gazeTarget = [0, 0];
    this.nextGaze = 0;
    this.nextBlink = 0;
    this.blinkStart = -9;
    this.doubleBlink = 0;
    this.mouthLevel = "closed";
    this.hands = {
      l: { p: [50, 60], v: [0, 0] },
      r: { p: [78, 60], v: [0, 0] },
    };
  }

  node(id) {
    if (!this.nodes.has(id))
      this.nodes.set(id, this.element.querySelector(`#${id}`));
    return this.nodes.get(id);
  }

  set(id, attribute, value) {
    this.node(id).setAttribute(attribute, String(value));
  }

  showGroup(prefix, previous, next) {
    if (previous === next) return;
    if (previous) this.set(prefix + previous, "display", "none");
    this.set(prefix + next, "display", "inline");
  }

  draw(state, now, audio) {
    if (this.headphones !== state.settings.headphones) {
      this.node("pl-pilly").innerHTML = roomCharacter(
        state.settings.headphones,
      );
      this.nodes.clear();
      this.expression = null;
      this.mouth = null;
      this.headphones = state.settings.headphones;
    }
    const t = now / 1000;
    const dt = Math.max(
      0,
      Math.min(0.05, this.last === undefined ? 1 / 60 : t - this.last),
    );
    this.last = t;
    const reaction = roomReaction(state.reaction);
    const speaking = this.speech(state.settings.speech, t, dt, audio);
    this.face(
      reaction?.expression || state.expression,
      reaction,
      speaking,
      t,
      dt,
      audio?.active,
    );
    const transform = this.body(reaction, t);
    this.moveHands(reaction, speaking, transform, t, dt);
    this.ambient(reaction, t);
  }

  speech(mode, t, dt, audio) {
    let amplitude = 0;
    const demoGate =
      mode === "demo" && Math.sin(t * 0.9) + Math.sin(t * 0.37 + 1.3) + 0.5 > 0
        ? 1
        : 0;
    const gate = audio?.active ? (audio.amplitude > 0.03 ? 1 : 0) : demoGate;
    this.gate += (gate - this.gate) * ease(dt, 6);
    if (audio?.active) amplitude = audio.amplitude;
    else if (mode === "demo") {
      amplitude =
        this.gate *
        Math.max(0, Math.sin(t * 10.5 + 2 * Math.sin(t * 2.3))) *
        (0.45 + 0.55 * Math.abs(Math.sin(t * 1.7)));
    }
    this.amp +=
      (amplitude - this.amp) * ease(dt, amplitude > this.amp ? 30 : 12);
    return this.gate > 0.5;
  }

  face(id, reaction, speaking, t, dt, audioActive) {
    const expression = roomExpressions[id];
    this.showGroup("pl-ex-", this.expression, id);
    this.showGroup("pl-xb-", this.expression, id);
    this.set("pl-blush", "display", expression.blush ? "inline" : "none");
    this.expression = id;
    let mouth = expression.mouth;
    if (speaking && (!reaction?.lock || audioActive)) {
      const level =
        this.amp < 0.08 ? "closed" : this.amp < 0.38 ? "open" : "wide";
      if (level !== this.pendingMouth) {
        this.pendingMouth = level;
        this.mouthSince = t;
      }
      if (t - this.mouthSince > 0.045) this.mouthLevel = level;
      mouth = this.mouthLevel;
    }
    this.showGroup("pl-m-", this.mouth, mouth);
    this.mouth = mouth;
    if (t > this.nextBlink) {
      this.blinkStart = t;
      this.nextBlink = t + 2.2 + Math.random() * 3.5;
      if (Math.random() < 0.22) this.doubleBlink = t + 0.3;
    }
    if (this.doubleBlink && t > this.doubleBlink) {
      this.blinkStart = t;
      this.doubleBlink = 0;
    }
    const progress = (t - this.blinkStart) / 0.16;
    const blink =
      progress >= 0 && progress < 1 ? Math.sin(Math.PI * progress) : 0;
    const sy = ["happy", "squeeze", "sleepy", "none", "heart"].includes(
      expression.eyes[0],
    )
      ? 1
      : 1 - 0.92 * blink;
    this.set(
      "pl-eyes",
      "transform",
      `translate(0 ${round(16.5 * (1 - sy))}) scale(1 ${round(sy)})`,
    );
    if (t > this.nextGaze) {
      this.nextGaze = t + 1.2 + Math.random() * 2.8;
      this.gazeTarget = [
        (Math.random() * 2 - 1) * 1.4,
        (Math.random() * 2 - 1) * 0.7,
      ];
    }
    this.gaze = this.gaze.map(
      (value, i) =>
        value +
        (this.gazeTarget[i] * (speaking ? 0.35 : 1) - value) * ease(dt, 14),
    );
    this.set(
      "pl-face",
      "transform",
      `translate(${round(this.gaze[0])} ${round(this.gaze[1] + this.amp * 0.4)})`,
    );
  }

  body(reaction, t) {
    const { gesture, elapsed: e = 0, weight: w = 0 } = reaction || {};
    let angle = 1.1 * Math.sin(t * 1.05) + this.amp * 1.8 * Math.sin(t * 6.5);
    let y = -this.amp * 0.7;
    const breathe = 1 + 0.014 * Math.sin(t * 2.1);
    if (gesture === "cheer") y -= w * 2.2 * Math.abs(Math.sin(e * 9));
    if (gesture === "laugh") {
      angle += w * 2.4 * Math.sin(e * 21);
      y -= w * 0.6 * Math.abs(Math.sin(e * 10.5));
    }
    if (gesture === "shock") {
      y -= 4 * Math.max(0, Math.sin(Math.min(e * 5, Math.PI)));
      angle += w * 0.7 * Math.sin(e * 45);
    }
    if (gesture === "rage") angle += w * 1.8 * Math.sin(e * 32);
    if (gesture === "wave") angle += w * 2 * Math.sin(e * 3.2);
    if (gesture === "love") angle += w * 2.5 * Math.sin(e * 2.4);
    if (gesture === "think") angle -= w * 3;
    const sx = 1 / Math.sqrt(breathe);
    this.set(
      "pl-pilly",
      "transform",
      `translate(40 ${round(14 + y)}) rotate(${round(angle)} 24 52) translate(24 52) scale(${sx.toFixed(4)} ${breathe.toFixed(4)}) translate(-24 -52)`,
    );
    const cosine = Math.cos((angle * Math.PI) / 180),
      sine = Math.sin((angle * Math.PI) / 180);
    return (px, py) => {
      const dx = (px - 24) * sx,
        dy = (py - 52) * breathe;
      return [64 + dx * cosine - dy * sine, 66 + y + dx * sine + dy * cosine];
    };
  }

  moveHands(reaction, speaking, transform, t, dt) {
    const { gesture, elapsed: e = 0, weight: w = 0 } = reaction || {};
    const typing =
      Math.sin(t * 0.8) + Math.sin(t * 0.31) > 0.2 && !speaking && !reaction
        ? 1
        : 0;
    this.typing += (typing - this.typing) * ease(dt, 5);
    const left = [
      50 + 1.2 * Math.sin(t * 1.3),
      60 - this.typing * Math.max(0, Math.sin(t * 15)) * 1.1,
    ];
    let right = [
      78 + 1.2 * Math.sin(t * 1.1 + 1),
      60 - this.typing * Math.max(0, Math.sin(t * 15 + 2)) * 1.1,
    ];
    let openLeft = false,
      openRight = false;
    if (speaking && !reaction) {
      right = mix(
        right,
        [
          80 + 2 * Math.sin(t * 1.7),
          49 - this.amp * 5 + 1.5 * Math.sin(t * 2.9),
        ],
        this.gate,
      );
      openRight = true;
    }
    const targets = {
      wave: [null, [88 + 3 * Math.sin(e * 9), 34], false, true],
      cheer: [
        [42, 30 + 2 * Math.abs(Math.sin(e * 9))],
        [86, 30 + 2 * Math.abs(Math.sin(e * 9 + 1))],
        true,
        true,
      ],
      laugh: [
        [54, 60 - 2.2 * Math.abs(Math.sin(e * 10.5))],
        [74, 60 - 2.2 * Math.abs(Math.sin(e * 10.5 + 1))],
        false,
        false,
      ],
      shock: [[52, 44], [76, 44], true, true],
      love: [[60, 50], [68, 50], false, false],
      think: [null, [70, 47], false, false],
      rage: [
        [50, 58 - 3 * Math.abs(Math.sin(e * 16))],
        [78, 58 - 3 * Math.abs(Math.sin(e * 16 + 1.5))],
        false,
        false,
      ],
    }[gesture];
    if (targets && w > 0.5) {
      openLeft = targets[2];
      openRight = targets[3];
    }
    this.hand(
      "l",
      mix(left, targets?.[0], w),
      openLeft,
      transform(15, 34),
      -1,
      dt,
    );
    this.hand(
      "r",
      mix(right, targets?.[1], w),
      openRight,
      transform(33, 34),
      1,
      dt,
    );
  }

  hand(side, target, open, shoulder, direction, dt) {
    const hand = this.hands[side];
    spring(hand, target, dt);
    const [x, y] = hand.p.map(round);
    const cx = (shoulder[0] + x) / 2 + direction * 5,
      cy = (shoulder[1] + y) / 2 + 2;
    this.set(
      `pl-arm-${side}`,
      "d",
      `M ${shoulder.map(round).join(" ")} Q ${round(cx)} ${round(cy)} ${x} ${y}`,
    );
    this.set(`pl-hand-${side}`, "transform", `translate(${x} ${y})`);
    if (hand.open !== open) {
      this.set(`pl-h${side}-open`, "display", open ? "inline" : "none");
      this.set(`pl-h${side}-mitt`, "display", open ? "none" : "inline");
      hand.open = open;
    }
  }

  ambient(reaction, t) {
    this.set("pl-led", "opacity", round(0.13 + 0.06 * Math.sin(t * 1.4)));
    this.set(
      "pl-neon-glow",
      "opacity",
      round(
        0.3 + 0.12 * Math.sin(t * 2.2) + (Math.sin(t * 17) > 0.97 ? -0.2 : 0),
      ),
    );
    this.set("pl-kb", "opacity", round(0.5 + 0.5 * Math.sin(t * 2.6)));
    for (let i = 0; i < 7; i++)
      this.set(
        `pl-star-${i}`,
        "opacity",
        round(0.45 + 0.55 * Math.abs(Math.sin(t * (0.6 + i * 0.17) + i))),
      );
    this.set(
      "pl-plant",
      "transform",
      `rotate(${round(1.6 * Math.sin(t * 0.9))} 100.5 16)`,
    );
    for (let i = 0; i < 3; i++) {
      const phase = (t * 0.32 + i / 3) % 1;
      this.set(
        `pl-steam-${i}`,
        "cx",
        round(23 + Math.sin(t * 2 + i * 2) * 1.1),
      );
      this.set(`pl-steam-${i}`, "cy", round(51 - phase * 11));
      this.set(`pl-steam-${i}`, "r", round(0.7 + phase * 0.9));
      this.set(
        `pl-steam-${i}`,
        "opacity",
        round(Math.sin(Math.PI * phase) * 0.55),
      );
      const elapsed = reaction?.elapsed || 0;
      const heartPhase = (elapsed * 0.55 + i / 3) % 1;
      const love = reaction?.gesture === "love";
      this.set(
        `pl-heart-${i}`,
        "opacity",
        love ? round(Math.sin(Math.PI * heartPhase) * reaction.weight) : 0,
      );
      if (love)
        this.set(
          `pl-heart-${i}`,
          "transform",
          `translate(${round(64 + (i - 1) * 17 + 2 * Math.sin(elapsed * 3 + i) - 2.5)} ${round(28 - heartPhase * 20)})`,
        );
    }
  }
}
