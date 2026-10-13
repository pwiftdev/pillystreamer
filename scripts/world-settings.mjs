import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { join } from "node:path";

export function worldProperties(original, minecraft) {
  if (!/^[a-z0-9_-]+$/i.test(minecraft.world))
    throw new Error("Use a simple folder name for the Minecraft world.");
  if (!["easy", "normal", "hard"].includes(minecraft.difficulty))
    throw new Error("Survival requires easy, normal, or hard difficulty.");
  const values = {
    "server-ip": minecraft.host,
    "server-port": minecraft.port,
    "level-name": minecraft.world,
    "level-seed": minecraft.seed,
    "level-type": "minecraft:normal",
    gamemode: "survival",
    "force-gamemode": "true",
    difficulty: minecraft.difficulty,
    "spawn-monsters": "true",
    "spawn-animals": "true",
    "generate-structures": "true",
    "online-mode": "false",
    "enforce-secure-profile": "false",
    "enable-rcon": "false",
    "enable-query": "false",
    "spawn-protection": "0",
    "max-players": "4",
    "view-distance": "12",
    "simulation-distance": "6",
    motd: "Pilly survival",
  };
  const retained = original
    .split(/\r?\n/)
    .filter(
      (line) =>
        line.trim() && !Object.hasOwn(values, line.split("=", 1)[0].trim()),
    );
  return [
    ...retained,
    ...Object.entries(values).map(([k, v]) => `${k}=${v}`),
    "",
  ].join("\n");
}

export async function prepareWorld(serverDir, minecraft) {
  await mkdir(serverDir, { recursive: true });
  const path = join(serverDir, "server.properties");
  let previous = "";
  try {
    previous = await readFile(path, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(`${path}.tmp`, worldProperties(previous, minecraft));
  await rename(`${path}.tmp`, path);
}
