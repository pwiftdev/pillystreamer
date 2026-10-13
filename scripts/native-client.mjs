import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, delimiter } from "node:path";
import { spawn } from "node:child_process";
import { javaPath, minecraft } from "./runtime.mjs";

if (process.platform !== "darwin" || minecraft.version !== "1.20.4")
  throw new Error(
    "This camera launcher supports the installed macOS Minecraft 1.20.4 client.",
  );
if (minecraft.host !== "127.0.0.1")
  throw new Error(
    "The camera account is only for the local development server.",
  );
const installed = join(homedir(), "Library/Application Support/minecraft");
const game = join(process.cwd(), ".runtime/native-camera");
const versionDir = join(installed, "versions", minecraft.version);
const version = JSON.parse(
  await readFile(join(versionDir, `${minecraft.version}.json`), "utf8"),
);
const libraries = version.libraries.filter((library) => {
  if (!library.rules) return true;
  let allowed = false;
  for (const rule of library.rules) {
    if (rule.features) continue;
    if (rule.os?.name && rule.os.name !== "osx") continue;
    if (rule.os?.arch && rule.os.arch !== process.arch) continue;
    allowed = rule.action === "allow";
  }
  return allowed;
});
const classpath = libraries.map((library) =>
  join(installed, "libraries", library.downloads.artifact.path),
);
classpath.push(join(versionDir, `${minecraft.version}.jar`));
for (const file of classpath) {
  try {
    await access(file);
  } catch {
    throw new Error(
      "Install and launch Minecraft 1.20.4 once in the official launcher before starting this camera.",
    );
  }
}
await mkdir(game, { recursive: true });
try {
  await writeFile(
    join(game, "options.txt"),
    [
      "version:3700",
      "renderDistance:12",
      "simulationDistance:6",
      "maxFps:60",
      "pauseOnLostFocus:false",
      "onboardAccessibility:false",
      "tutorialStep:none",
      "autoJump:false",
      "fullscreen:false",
      "guiScale:2",
      "bobView:true",
      "entityDistanceScaling:1.0",
      "soundCategory_master:0.5",
      "",
    ].join("\n"),
    { flag: "wx" },
  );
} catch (error) {
  if (error.code !== "EEXIST") throw error;
}
const child = spawn(
  await javaPath(),
  [
    "-XstartOnFirstThread",
    "-Xmx2G",
    "-Dapple.awt.application.name=Pilly Camera",
    "-cp",
    classpath.join(delimiter),
    version.mainClass,
    "--username",
    "PillyCam",
    "--version",
    minecraft.version,
    "--gameDir",
    game,
    "--assetsDir",
    join(installed, "assets"),
    "--assetIndex",
    version.assetIndex.id,
    "--accessToken",
    "0",
    "--userType",
    "legacy",
    "--versionType",
    "release",
    "--width",
    "1280",
    "--height",
    "720",
    "--quickPlayMultiplayer",
    `${minecraft.host}:${minecraft.port}`,
  ],
  { cwd: game, stdio: "inherit" },
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
