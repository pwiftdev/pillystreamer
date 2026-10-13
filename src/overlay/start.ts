import { createOverlayServer } from "./server.js";
import { loadVoiceEnv, voiceConfig } from "../voice/config.js";
import { elevenLabs } from "../voice/elevenlabs.js";

loadVoiceEnv();
const config = voiceConfig();
const overlay = createOverlayServer({
  provider: config.apiKey && config.agentId ? elevenLabs(config) : undefined,
  secrets: [config.apiKey],
});
overlay.server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
overlay.server.listen(4317, "127.0.0.1", () => {
  console.log("Pilly studio: http://127.0.0.1:4317");
  console.log(
    "OBS browser source: http://127.0.0.1:4317/overlay (1920 × 1080)",
  );
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => overlay.close());
