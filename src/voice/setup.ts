import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { envPath, loadVoiceEnv, voiceConfig } from "./config.js";
import { elevenRequest } from "./elevenlabs.js";

export async function setupAgent(options: {
  name: string;
  prompt: string;
  idKey: string;
  temperature: number;
  maxTokens: number;
}) {
  loadVoiceEnv();
  const config = voiceConfig();
  if (!config.apiKey)
    throw new Error("Set ELEVENLABS_API_KEY in the local .env first.");
  const body = {
    name: options.name,
    tags: ["pillystreamer"],
    conversation_config: {
      conversation: {
        text_only: true,
        max_duration_seconds: 60,
        client_events: ["agent_response"],
      },
      agent: {
        first_message: "",
        language: "en",
        prompt: {
          prompt: options.prompt,
          llm: "claude-sonnet-5-5",
          backup_llm_config: { preference: "disabled" },
          reasoning_effort: "low",
          temperature: options.temperature,
          max_tokens: options.maxTokens,
          tool_ids: [],
          tools: [],
          knowledge_base: [],
          mcp_server_ids: [],
          native_mcp_server_ids: [],
          built_in_tools: {},
          ignore_default_personality: true,
        },
      },
      tts: { voice_id: config.voiceId, model_id: "eleven_flash_v2_5" },
    },
    platform_settings: {
      auth: { enable_auth: true },
      privacy: {
        record_voice: false,
        retention_days: 1,
        delete_audio: true,
        delete_transcript_and_pii: true,
      },
    },
  };
  let id = process.env[options.idKey] || "";
  if (!id) {
    const response = await elevenRequest(
      config,
      "/v1/convai/agents?page_size=100",
    );
    const data = await response.json();
    const existing =
      data.agents?.filter(
        (agent: { name: string; tags?: string[] }) =>
          agent.name === body.name && agent.tags?.includes("pillystreamer"),
      ) || [];
    if (existing.length > 1)
      throw new Error(
        `Multiple matching agents exist. Choose ${options.idKey} in .env before continuing.`,
      );
    id = existing[0]?.agent_id;
  }
  const response = await elevenRequest(
    config,
    id
      ? `/v1/convai/agents/${encodeURIComponent(id)}`
      : "/v1/convai/agents/create",
    {
      method: id ? "PATCH" : "POST",
      body: JSON.stringify(body),
    },
  );
  const agent = await response.json();
  id ||= agent.agent_id;
  if (!id)
    throw new Error(
      "Agent creation returned no ID. Inspect ElevenLabs before trying again.",
    );
  try {
    const original = await readFile(envPath, "utf8");
    const values = {
      [options.idKey]: id,
      ELEVENLABS_VOICE_ID: config.voiceId,
      ELEVENLABS_MODEL_ID: config.modelId,
    };
    const lines = original
      .split("\n")
      .filter(
        (line) =>
          !Object.keys(values).some((key) => line.startsWith(`${key}=`)),
      );
    await mkdir(new URL("../../.runtime/", import.meta.url), {
      recursive: true,
    });
    const temporary = new URL("../../.runtime/pilly-env.tmp", import.meta.url);
    await writeFile(
      temporary,
      lines
        .filter(Boolean)
        .concat(Object.entries(values).map(([key, value]) => `${key}=${value}`))
        .join("\n") + "\n",
      { mode: 0o600 },
    );
    await rename(temporary, envPath);
  } catch {
    throw new Error(
      `Pilly was configured as ${id}, but saving local settings failed. Set ${options.idKey} to that ID; do not create another agent.`,
    );
  }
  console.log(`${options.name} configured: ${id}. Local settings saved.`);
}
