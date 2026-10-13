export interface ChatMessage {
  id: string;
  role: "viewer" | "pilly";
  text: string;
  status: "queued" | "answered" | "skipped" | "failed" | "heard";
}
export interface VoiceClip {
  id: string;
  url: string;
  text: string;
  startsAt: number;
  expiresAt: number;
  durationMs: number;
}
export function initialVoice() {
  return {
    configured: false,
    enabled: false,
    autoCommentary: true,
    phase: "off" as "off" | "ready" | "thinking" | "speaking" | "error",
    error: "",
    queued: 0,
    clip: null as VoiceClip | null,
  };
}
