import { spawn } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  cp,
  copyFile,
  symlink,
  writeFile,
  readFile,
} from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { once } from "node:events";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "node:process";
import { javaPath, serverDir, minecraft } from "./runtime.mjs";
import { prepareWorld } from "./world-settings.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const seed = process.argv[2] || "17",
  seconds = Number(process.argv[3] || "1200"),
  port = Number(process.argv[4] || "25575");
if (
  !/^-?\d{1,18}$/.test(seed) ||
  !Number.isInteger(seconds) ||
  seconds < 10 ||
  seconds > 3600 ||
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535 ||
  port === minecraft.port
)
  throw new Error(
    "Usage: npm run benchmark -- SEED SECONDS PORT (isolated port)",
  );
if (
  !/^eula=true\s*$/m.test(await readFile(join(serverDir, "eula.txt"), "utf8"))
)
  throw new Error("Accept the Minecraft EULA with setup first.");
try {
  loadEnvFile(join(root, ".env"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
await mkdir(join(root, ".runtime", "benchmarks"), { recursive: true });
const directory = await mkdtemp(
  join(root, ".runtime", "benchmarks", `seed-${seed}-`),
);
const settings = { ...minecraft, seed, port, world: "benchmark" };
const serverDirectory = join(directory, ".minecraft", minecraft.version);
await mkdir(join(directory, "scripts"), { recursive: true });
await cp(join(root, "src"), join(directory, "src"), { recursive: true });
await copyFile(
  join(root, "scripts", "benchmark-worker.ts"),
  join(directory, "scripts", "benchmark-worker.ts"),
);
await copyFile(join(root, "package.json"), join(directory, "package.json"));
await symlink(
  join(root, "node_modules"),
  join(directory, "node_modules"),
  "dir",
);
await writeFile(join(directory, "minecraft.json"), JSON.stringify(settings));
await prepareWorld(serverDirectory, settings);
await copyFile(join(serverDir, "eula.txt"), join(serverDirectory, "eula.txt"));
await symlink(
  join(serverDir, "server.jar"),
  join(serverDirectory, "server.jar"),
);
const java = spawn(
  await javaPath(),
  [
    "-Xms256M",
    "-Xmx1G",
    "-XX:ActiveProcessorCount=2",
    "-jar",
    "server.jar",
    "nogui",
  ],
  { cwd: serverDirectory, stdio: ["pipe", "pipe", "pipe"] },
);
const log = createWriteStream(join(directory, "server.log"));
java.stdout.pipe(log);
java.stderr.pipe(log);
let worker;
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  worker?.kill("SIGTERM");
  if (java.exitCode === null) java.stdin.end("stop\n");
};
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, stop);
try {
  await new Promise((resolve, reject) => {
    let text = "";
    const timeout = setTimeout(
      () => reject(new Error("Benchmark server startup timed out")),
      300000,
    );
    java.once("error", reject);
    java.once("exit", () => {
      clearTimeout(timeout);
      reject(new Error("Benchmark server exited before ready"));
    });
    java.stdout.on("data", (chunk) => {
      text = (text + chunk.toString()).slice(-5000);
      if (/Done \([\d.]+s\)!/.test(text)) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
  if (stopping) throw new Error("Benchmark cancelled before play started");
  console.log(`Isolated seed ${seed}, ${seconds}s: ${directory}`);
  worker = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/benchmark-worker.ts"],
    {
      cwd: directory,
      env: {
        ...process.env,
        PILLY_BENCHMARK: "isolated",
        PILLY_BENCHMARK_SECONDS: String(seconds),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const botLog = createWriteStream(join(directory, "bot.log"));
  worker.stdout.pipe(botLog);
  worker.stderr.pipe(botLog);
  await once(worker, "exit");
  console.log(await readFile(join(directory, "result.json"), "utf8"));
} catch (error) {
  await writeFile(
    join(directory, "failure.json"),
    JSON.stringify({ seed, port, error: error.message }),
  );
  throw error;
} finally {
  stop();
  if (java.exitCode === null) {
    const kill = setTimeout(() => java.kill("SIGKILL"), 15000);
    await once(java, "exit");
    clearTimeout(kill);
  }
}
