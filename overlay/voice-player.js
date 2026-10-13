export class VoicePlayer {
  constructor(button) {
    this.button = button;
    this.audio = new Audio();
    this.audio.preload = "auto";
    this.audible = !new URLSearchParams(location.search).has("muted");
    this.audio.muted = !this.audible;
    button.addEventListener("click", () => this.setAudible(true));
    addEventListener("message", (event) => {
      if (
        event.origin === location.origin &&
        event.source === parent &&
        event.data?.type === "pilly-audio" &&
        typeof event.data.enabled === "boolean"
      )
        this.setAudible(event.data.enabled);
    });
    addEventListener("pagehide", () => this.stop(), { once: true });
  }

  setAudible(enabled) {
    this.audible = enabled;
    this.audio.muted = !enabled;
    this.button.hidden = true;
    if (this.clip && this.audio.src) void this.start(this.clip);
  }

  sync(voice) {
    const clip = voice.enabled ? voice.clip : null;
    if (this.clip?.id === clip?.id) return;
    this.stop();
    this.clip = clip;
    if (clip && Date.now() < clip.expiresAt) void this.load(clip);
  }

  stop() {
    this.controller?.abort();
    clearTimeout(this.timer);
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    this.clip = null;
    this.envelope = [];
    this.button.hidden = true;
  }

  async load(clip) {
    const controller = new AbortController();
    this.controller = controller;
    try {
      const response = await fetch(clip.url, {
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(10_000),
        ]),
      });
      if (!response.ok) throw new Error("Speech unavailable");
      const bytes = await response.arrayBuffer();
      if (controller.signal.aborted) return;
      const envelope = await this.decodeEnvelope(bytes.slice(0));
      if (controller.signal.aborted || Date.now() >= clip.expiresAt) return;
      this.envelope = envelope;
      this.url = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
      this.audio.src = this.url;
      this.audio.addEventListener(
        "loadedmetadata",
        () => {
          this.timer = setTimeout(
            () => void this.start(clip),
            Math.max(0, clip.startsAt - Date.now()),
          );
        },
        { once: true, signal: controller.signal },
      );
    } catch {
      if (!controller.signal.aborted) {
        this.button.textContent = "Voice unavailable for this line";
        this.button.disabled = true;
        this.button.hidden = false;
      }
    }
  }

  async decodeEnvelope(bytes) {
    let context;
    try {
      context = new AudioContext();
      const decoded = await context.decodeAudioData(bytes);
      const samples = decoded.getChannelData(0);
      const size = Math.max(1, Math.round(decoded.sampleRate * 0.04));
      const envelope = [];
      for (let i = 0; i < samples.length; i += size) {
        let sum = 0;
        const end = Math.min(samples.length, i + size);
        for (let j = i; j < end; j++) sum += samples[j] * samples[j];
        envelope.push(Math.min(1, Math.sqrt(sum / (end - i)) * 5));
      }
      return envelope;
    } catch {
      return [];
    } finally {
      if (context) await context.close();
    }
  }

  async start(clip) {
    if (
      this.clip?.id !== clip.id ||
      !this.audio.src ||
      Date.now() >= clip.expiresAt
    )
      return;
    if (Date.now() < clip.startsAt) {
      clearTimeout(this.timer);
      this.timer = setTimeout(
        () => void this.start(clip),
        clip.startsAt - Date.now(),
      );
      return;
    }
    if (!this.audio.readyState) return;
    const offset = Math.max(0, (Date.now() - clip.startsAt) / 1000);
    if (offset >= this.audio.duration) return;
    this.audio.currentTime = offset;
    try {
      await this.audio.play();
      if (this.clip?.id === clip.id) this.button.hidden = true;
    } catch (error) {
      if (this.clip?.id !== clip.id) return;
      const blocked = error.name === "NotAllowedError";
      this.button.textContent = blocked
        ? "Enable Pilly’s voice"
        : "Voice unavailable for this line";
      this.button.disabled = !blocked;
      this.button.hidden = false;
    }
  }

  sample() {
    const active = Boolean(
      this.clip &&
      !this.audio.paused &&
      !this.audio.ended &&
      Date.now() < this.clip.expiresAt,
    );
    return {
      active,
      amplitude: active
        ? this.envelope[Math.floor(this.audio.currentTime / 0.04)] || 0
        : 0,
    };
  }
}
