import {
  renderPilly,
  EXPRESSIONS,
  REACTIONS,
  reactionFrame,
} from "/mascot.js-source";

export class Mascot {
  constructor(element) {
    this.element = element;
    this.cache = new Map();
    this.previous = "";
  }

  draw(state, now, audio) {
    const tick = Math.floor(now / 125);
    let options = {
      limbs: true,
      ...EXPRESSIONS[state.expression],
      dy: Math.floor(tick / 4) % 2,
      arms: Math.floor(tick / 3) % 2 ? "wave1" : "wave0",
      blink: tick % 37 < 2,
    };
    const reaction = state.reaction;
    if (reaction && REACTIONS[reaction.id]) {
      const spec = REACTIONS[reaction.id];
      const elapsed = Math.max(0, Date.now() - reaction.startedAt);
      if (elapsed < spec.frames * spec.frameMs * 2) {
        options = reactionFrame(
          reaction.id,
          Math.floor(elapsed / spec.frameMs),
        );
      }
    }
    if (audio?.active)
      options.mouth =
        audio.amplitude < 0.08
          ? "closed"
          : audio.amplitude < 0.38
            ? "open"
            : "wide";
    const settings = {
      sticker: state.settings.sticker,
      headphones: state.settings.headphones,
    };
    const key = JSON.stringify([options, settings]);
    if (key === this.previous) return;
    this.previous = key;
    if (!this.cache.has(key)) {
      if (this.cache.size >= 256) this.cache.clear();
      this.cache.set(key, renderPilly(options, settings));
    }
    this.element.innerHTML = this.cache.get(key);
  }
}
