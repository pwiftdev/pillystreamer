import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { OverlayState } from "../overlay/state.js";
import {
  conversationInput,
  privateQuestion,
  PRIVATE_REPLY,
  spokenReply,
} from "../persona/pilly.js";
import type { VoiceProvider, SpeechAudio } from "./elevenlabs.js";
import type { ChatMessage } from "./state.js";

type Job = { question: string | null; message?: ChatMessage; queuedAt: number };
export interface VoiceOptions {
  provider?: VoiceProvider;
  secrets?: string[];
  now?: () => number;
  wait?: (ms: number, signal: AbortSignal) => Promise<unknown>;
  limit?: number;
}

export class VoiceService {
  private queue: Job[] = [];
  private running = false;
  private closed = false;
  private controller?: AbortController;
  private audio = new Map<string, SpeechAudio & { expiresAt: number }>();
  private recent: string[] = [];
  private lastCommentary = 0;
  private attempts: number[] = [];
  private chatTimes: number[] = [];
  private now: () => number;

  constructor(
    private state: OverlayState,
    private onChange: () => void,
    private options: VoiceOptions = {},
  ) {
    this.now = options.now || Date.now;
    state.voice.configured = Boolean(options.provider);
    state.voice.enabled = state.voice.configured;
    state.voice.phase = state.voice.enabled ? "ready" : "off";
  }

  private changed() {
    this.state.voice.queued = this.queue.length;
    try {
      this.onChange();
    } catch {
      /* A subscriber failure must not repeat a paid request. */
    }
  }

  private addMessage(message: ChatMessage) {
    this.state.chat.push(message);
    if (this.state.chat.length > 40) this.state.chat.shift();
  }

  ask(input: unknown) {
    const data = input as { text?: unknown } | null;
    if (
      !data ||
      typeof data.text !== "string" ||
      !data.text.trim() ||
      data.text.length > 300
    )
      throw new Error("Write a question between 1 and 300 characters.");
    if (this.closed) throw new Error("Chat is closed.");
    this.chatTimes = this.chatTimes.filter((at) => this.now() - at < 60_000);
    if (this.chatTimes.length >= 30)
      throw new Error("Chat is moving fast. Give Pilly a moment.");
    if (this.state.voice.enabled && this.queue.length >= 6)
      throw new Error("Chat is busy. Give Pilly a moment to catch up.");
    const text = data.text.trim();
    if (
      this.options.secrets?.some((secret) => secret && text.includes(secret)) ||
      /\bsk[_-][a-z\d_-]{16,}\b/i.test(text)
    )
      throw new Error("Please keep private credentials out of chat.");
    const message: ChatMessage = {
      id: randomUUID(),
      role: "viewer",
      text,
      status: this.state.voice.enabled ? "queued" : "heard",
    };
    this.chatTimes.push(this.now());
    this.addMessage(message);
    if (this.state.voice.enabled)
      this.enqueue({ question: message.text, message, queuedAt: this.now() });
    else this.changed();
    return message.id;
  }

  control(input: unknown) {
    if (!input || typeof input !== "object")
      throw new Error("Invalid voice control.");
    const data = input as { type?: string; enabled?: unknown };
    if (data.type === "enabled") {
      if (typeof data.enabled !== "boolean")
        throw new Error("Expected a boolean.");
      if (data.enabled && !this.state.voice.configured)
        throw new Error("Configure ElevenLabs on the server first.");
      this.state.voice.enabled = data.enabled;
      if (!data.enabled) this.stop();
      else {
        this.state.voice.phase = "ready";
        this.state.voice.error = "";
      }
    } else if (data.type === "commentary") {
      if (typeof data.enabled !== "boolean")
        throw new Error("Expected a boolean.");
      this.state.voice.autoCommentary = data.enabled;
    } else if (data.type === "intro") {
      if (!this.state.voice.enabled)
        throw new Error("Enable Pilly's voice first.");
      if (this.running || this.queue.length)
        throw new Error("Pilly is already preparing or speaking a line.");
      this.enqueue({
        question:
          "Introduce yourself to a new viewer in two short sentences. Mention your comeback story and learning to survive in Minecraft. Pumpville is a dream for much later.",
        queuedAt: this.now(),
      });
    } else throw new Error("Unknown voice control.");
    this.changed();
  }

  tick(hasAudience: boolean) {
    if (
      this.closed ||
      !hasAudience ||
      !this.state.voice.enabled ||
      !this.state.voice.autoCommentary ||
      this.running ||
      this.queue.length
    )
      return;
    const now = this.now();
    if (
      !this.state.bot.connected ||
      now - this.state.bot.updatedAt >= 5000 ||
      now - this.lastCommentary < 45_000
    )
      return;
    this.lastCommentary = now;
    this.enqueue({ question: null, queuedAt: now });
  }

  getAudio(id: string) {
    const clip = this.audio.get(id);
    if (!clip || clip.expiresAt < this.now()) {
      this.audio.delete(id);
      return null;
    }
    return clip.audio;
  }

  private enqueue(job: Job) {
    this.queue.push(job);
    this.changed();
    void this.process();
  }

  private reserveAttempt() {
    const now = this.now();
    this.attempts = this.attempts.filter((at) => now - at < 3_600_000);
    if (this.attempts.length >= (this.options.limit ?? 120))
      throw new Error(
        "Pilly has reached this session's hourly voice limit. Try again later.",
      );
    this.attempts.push(now);
  }

  private async process() {
    if (
      this.closed ||
      this.running ||
      !this.state.voice.enabled ||
      !this.options.provider
    )
      return;
    const job = this.queue.shift();
    if (!job) return;
    if (this.now() - job.queuedAt > 120_000) {
      if (job.message) job.message.status = "skipped";
      this.changed();
      void this.process();
      return;
    }
    this.running = true;
    const controller = new AbortController();
    this.controller = controller;
    const { signal } = controller;
    try {
      this.reserveAttempt();
      this.state.voice.phase = "thinking";
      this.state.voice.error = "";
      this.changed();
      const activity = this.state.bot.phase;
      const health = this.state.bot.health;
      const stale = () =>
        job.question === null &&
        (!this.state.bot.connected ||
          this.now() - this.state.bot.updatedAt >= 5000 ||
          this.state.bot.phase !== activity ||
          this.state.bot.health < health);
      const text =
        job.question && privateQuestion(job.question)
          ? PRIVATE_REPLY
          : spokenReply(
              await this.options.provider.reply(
                conversationInput(
                  this.state,
                  job.question,
                  this.recent,
                  this.now(),
                ),
                signal,
              ),
              this.options.secrets,
            );
      signal.throwIfAborted();
      if (stale()) {
        this.state.voice.phase = "ready";
        return;
      }
      const speech = await this.options.provider.synthesize(text, signal);
      signal.throwIfAborted();
      if (
        !speech.audio.length ||
        !Number.isFinite(speech.durationMs) ||
        speech.durationMs <= 0 ||
        speech.durationMs > 45_000
      )
        throw new Error("Pilly received unusable speech.");
      if (stale()) {
        this.state.voice.phase = "ready";
        return;
      }
      const id = randomUUID();
      const startsAt = this.now() + 750;
      this.audio.set(id, { ...speech, expiresAt: startsAt + 120_000 });
      while (this.audio.size > 4)
        this.audio.delete(this.audio.keys().next().value!);
      this.state.voice.clip = {
        id,
        text,
        url: `/api/voice/audio/${id}`,
        startsAt,
        durationMs: speech.durationMs,
        expiresAt: startsAt + speech.durationMs,
      };
      this.state.voice.phase = "speaking";
      if (job.message) job.message.status = "answered";
      this.addMessage({ id, role: "pilly", text, status: "answered" });
      this.recent = [...this.recent.slice(-5), text];
      this.lastCommentary = this.now();
      this.changed();
      await (
        this.options.wait ||
        ((ms, abort) => delay(ms, undefined, { signal: abort }))
      )(speech.durationMs + 1000, signal);
      signal.throwIfAborted();
      this.state.voice.clip = null;
      this.state.voice.phase = "ready";
    } catch {
      if (job.message && job.message.status === "queued")
        job.message.status = signal.aborted ? "skipped" : "failed";
      if (!signal.aborted && !this.closed) {
        this.state.voice.enabled = false;
        this.state.voice.clip = null;
        for (const pending of this.queue)
          if (pending.message) pending.message.status = "skipped";
        this.queue = [];
        this.state.voice.phase = "error";
        this.state.voice.error =
          "Voice paused after a failed request or hourly limit. Check ElevenLabs access and usage, then enable voice again. Nothing was retried.";
      }
    } finally {
      this.running = false;
      if (this.controller === controller) this.controller = undefined;
      this.changed();
      if (!this.closed) void this.process();
    }
  }

  private stop() {
    this.controller?.abort();
    for (const job of this.queue)
      if (job.message) job.message.status = "skipped";
    this.queue = [];
    this.state.voice.clip = null;
    this.state.voice.phase = "off";
    this.state.voice.error = "";
    this.audio.clear();
  }

  close() {
    this.closed = true;
    this.stop();
  }
}
