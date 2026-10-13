import type { VoiceConfig } from "./config.js";

export interface SpeechAudio {
  audio: Buffer;
  durationMs: number;
}
export interface VoiceProvider {
  reply(input: string, signal: AbortSignal): Promise<string>;
  synthesize(text: string, signal: AbortSignal): Promise<SpeechAudio>;
}

export async function elevenRequest(
  config: VoiceConfig,
  path: string,
  init: RequestInit = {},
) {
  try {
    const response = await fetch(`https://api.elevenlabs.io${path}`, {
      ...init,
      headers: {
        "xi-api-key": config.apiKey,
        "Content-Type": "application/json",
        ...init.headers,
      },
      signal: init.signal || AbortSignal.timeout(20_000),
      redirect: "error",
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(
        response.status === 401 || response.status === 403
          ? "ElevenLabs access was denied. Check the server credentials and permissions."
          : response.status === 429
            ? "ElevenLabs is at its usage limit. Try again later."
            : "ElevenLabs could not complete this request.",
      );
    }
    return response;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("ElevenLabs "))
      throw error;
    throw new Error("ElevenLabs is unavailable. This request was not retried.");
  }
}

export function agentReply(
  url: string,
  input: string,
  signal: AbortSignal,
  connect = (address: string) => new WebSocket(address),
): Promise<string> {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "wss:" ||
    parsed.hostname !== "api.elevenlabs.io" ||
    parsed.port
  )
    throw new Error("Invalid voice service connection.");
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const socket = connect(url);
    let settled = false;
    const finish = (text?: string) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      try {
        socket.close();
      } catch {
        /* Closing an unfinished connection can fail. */
      }
      if (text) resolve(text);
      else
        reject(
          new Error("Pilly could not finish this reply. It was not retried."),
        );
    };
    const abort = () => finish();
    signal.addEventListener("abort", abort, { once: true });
    socket.addEventListener("open", () => {
      if (!settled)
        socket.send(
          JSON.stringify({ type: "conversation_initiation_client_data" }),
        );
    });
    let sent = false;
    socket.addEventListener("message", (event) => {
      if (settled) return;
      try {
        if (typeof event.data !== "string" || event.data.length > 100_000)
          return finish();
        const message = JSON.parse(event.data);
        if (message.type === "ping")
          socket.send(
            JSON.stringify({
              type: "pong",
              event_id: message.ping_event.event_id,
            }),
          );
        if (message.type === "conversation_initiation_metadata" && !sent) {
          sent = true;
          socket.send(JSON.stringify({ type: "user_message", text: input }));
        }
        if (sent && message.type === "agent_response")
          finish(message.agent_response_event?.agent_response);
      } catch {
        finish();
      }
    });
    socket.addEventListener("error", () => finish());
    socket.addEventListener("close", () => finish());
    if (signal.aborted) finish();
  });
}

export function elevenLabs(config: VoiceConfig): VoiceProvider {
  return {
    async reply(input, signal) {
      const bounded = AbortSignal.any([signal, AbortSignal.timeout(25_000)]);
      const response = await elevenRequest(
        config,
        `/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(config.agentId)}`,
        { signal: bounded },
      );
      const data = await response.json();
      if (typeof data.signed_url !== "string")
        throw new Error("Could not start Pilly's reply.");
      return agentReply(data.signed_url, input, bounded);
    },
    async synthesize(text, signal) {
      const response = await elevenRequest(
        config,
        `/v1/text-to-speech/${encodeURIComponent(config.voiceId)}/with-timestamps?output_format=mp3_44100_128`,
        {
          method: "POST",
          signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]),
          body: JSON.stringify({
            text,
            model_id: config.modelId,
            voice_settings: {
              stability: 0.4,
              similarity_boost: 0.75,
              speed: 1.05,
            },
          }),
        },
      );
      const data = await response.json();
      const ends = (data.normalized_alignment || data.alignment)
        ?.character_end_times_seconds;
      const durationMs =
        Array.isArray(ends) &&
        ends.length > 0 &&
        ends.length <= 2048 &&
        ends.every(
          (end) => typeof end === "number" && Number.isFinite(end) && end >= 0,
        )
          ? Math.ceil(Math.max(...ends) * 1000) + 300
          : 0;
      if (
        typeof data.audio_base64 !== "string" ||
        data.audio_base64.length > 2_000_000 ||
        !Number.isFinite(durationMs) ||
        durationMs < 300 ||
        durationMs > 45_000
      )
        throw new Error("ElevenLabs returned unusable speech.");
      const audio = Buffer.from(data.audio_base64, "base64");
      if (!audio.length) throw new Error("ElevenLabs returned empty speech.");
      return { audio, durationMs };
    },
  };
}
