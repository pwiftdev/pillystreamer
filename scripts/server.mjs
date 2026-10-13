import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { javaPath, serverDir, minecraft } from "./runtime.mjs";

import { prepareSpectator } from "./spectator.mjs";
import { prepareWorld } from "./world-settings.mjs";

const eula = await readFile(join(serverDir, "eula.txt"), "utf8");
if (!/^eula=true\s*$/m.test(eula)) {
  throw new Error(
    "Accept https://aka.ms/MinecraftEULA before running: npm run setup -- --accept-eula",
  );
}
await prepareWorld(serverDir, minecraft);
await prepareSpectator(serverDir, minecraft);
const child = spawn(
  await javaPath(),
  ["-Xms512M", "-Xmx2G", "-jar", "server.jar", "nogui"],
  {
    cwd: serverDir,
    stdio: "inherit",
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
