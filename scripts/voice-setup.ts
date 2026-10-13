import { setupAgent } from "../src/voice/setup.js";
import { PILLY_PERSONA } from "../src/persona/pilly.js";
await setupAgent({
  name: "Pilly — Pumpville",
  prompt: PILLY_PERSONA,
  idKey: "ELEVENLABS_AGENT_ID",
  temperature: 0.8,
  maxTokens: 160,
});
