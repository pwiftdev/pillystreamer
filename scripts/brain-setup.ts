import { setupAgent } from "../src/voice/setup.js";
import { PLANNER_PROMPT } from "../src/brain/planner.js";
await setupAgent({
  name: "Pilly — Survival planner",
  prompt: PLANNER_PROMPT,
  idKey: "ELEVENLABS_PLANNER_AGENT_ID",
  temperature: 0.35,
  maxTokens: 600,
});
