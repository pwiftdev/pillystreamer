import { prepareWorld } from "./world-settings.mjs";
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  rm,
  access,
} from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  runtimeDir,
  serverDir,
  minecraftVersion,
  javaPath,
  minecraft,
} from "./runtime.mjs";

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok)
    throw new Error(`Download failed: ${response.status} ${url}`);
  return response;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function download(url, path, algorithm, checksum) {
  if (await exists(path)) {
    const digest = createHash(algorithm)
      .update(await readFile(path))
      .digest("hex");
    if (digest === checksum) return;
  }
  console.log(`Downloading ${url}`);
  const bytes = Buffer.from(await (await get(url)).arrayBuffer());
  if (createHash(algorithm).update(bytes).digest("hex") !== checksum) {
    throw new Error("Download checksum does not match.");
  }
  await writeFile(`${path}.part`, bytes);
  await rename(`${path}.part`, path);
}

async function installJava() {
  const os = { darwin: "mac", linux: "linux" }[process.platform];
  const architecture = { arm64: "aarch64", x64: "x64" }[process.arch];
  if (!os || !architecture)
    throw new Error("Setup currently supports macOS and Linux on arm64/x64.");
  try {
    execFileSync(await javaPath(), ["-version"], { stdio: "pipe" });
    return;
  } catch {}
  const assets = await (
    await get(
      `https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=${architecture}&image_type=jre&os=${os}&vendor=eclipse`,
    )
  ).json();
  const archive = assets[0]?.binary?.package;
  if (!archive) throw new Error("No compatible Java 21 runtime found.");
  const archivePath = join(runtimeDir, "java.tar.gz");
  await download(archive.link, archivePath, "sha256", archive.checksum);
  const destination = join(runtimeDir, "java");
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  execFileSync("tar", ["-xzf", archivePath, "-C", destination]);
  execFileSync(await javaPath(), ["-version"], { stdio: "inherit" });
  await rm(archivePath);
}

await mkdir(runtimeDir, { recursive: true });
await mkdir(serverDir, { recursive: true });
await installJava();
const manifest = await (
  await get("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json")
).json();
const version = manifest.versions.find(
  (entry) => entry.id === minecraftVersion,
);
if (!version) throw new Error(`Minecraft ${minecraftVersion} was not found.`);
const metadata = await (await get(version.url)).json();
await download(
  metadata.downloads.server.url,
  join(serverDir, "server.jar"),
  "sha1",
  metadata.downloads.server.sha1,
);

await prepareWorld(serverDir, minecraft);
if (process.argv.includes("--accept-eula")) {
  await writeFile(join(serverDir, "eula.txt"), "eula=true\n");
} else if (!(await exists(join(serverDir, "eula.txt")))) {
  await writeFile(join(serverDir, "eula.txt"), "eula=false\n");
}
console.log(
  "Setup complete. EULA: https://aka.ms/MinecraftEULA. Start with npm run server.",
);
