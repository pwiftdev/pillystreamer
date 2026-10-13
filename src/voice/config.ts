import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

export const envPath = fileURLToPath(new URL("../../.env", import.meta.url));
export function loadVoiceEnv() {
  try {
    loadEnvFile(envPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      throw new Error("Could not read local voice configuration.");
  }
}
export function voiceConfig() {
  return {
    apiKey: process.env.ELEVENLABS_API_KEY || "",
    agentId: process.env.ELEVENLABS_AGENT_ID || "",
    voiceId: process.env.ELEVENLABS_VOICE_ID || "TX3LPaxmHKxFdv7VOQHJ",
    modelId: process.env.ELEVENLABS_MODEL_ID || "eleven_flash_v2_5",
  };
}
export type VoiceConfig = ReturnType<typeof voiceConfig>;
