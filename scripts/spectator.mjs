import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function prepareSpectator(serverDir, minecraft) {
  if (minecraft.version !== "1.20.4") return;
  const root = join(serverDir, minecraft.world, "datapacks/pilly-camera");
  const files = {
    "pack.mcmeta": JSON.stringify({
      pack: { pack_format: 26, description: "Local PillyCam spectator" },
    }),
    "data/minecraft/tags/functions/load.json": JSON.stringify({
      values: ["pilly_camera:follow"],
    }),
    "data/pilly_camera/functions/follow.mcfunction": [
      "gamemode spectator @a[name=PillyCam,gamemode=!spectator]",
      "execute as @a[name=PillyCam,gamemode=spectator] if entity @a[name=Pilly,limit=1] run spectate @a[name=Pilly,limit=1] @s",
      "schedule function pilly_camera:follow 1s replace",
      "",
    ].join("\n"),
  };
  for (const [name, content] of Object.entries(files)) {
    const path = join(root, name);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, content);
  }
}
