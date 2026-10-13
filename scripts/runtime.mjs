import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { readdir } from "node:fs/promises";
import minecraft from "../minecraft.json" with { type: "json" };
export { minecraft };

const root = fileURLToPath(new URL("../", import.meta.url));
export const serverDir = join(root, ".minecraft", minecraft.version);
export const runtimeDir = join(root, ".runtime");
export const minecraftVersion = minecraft.version;

export async function javaPath() {
  const directory = join(runtimeDir, "java");
  const entries = await readdir(directory, { withFileTypes: true });
  const home = entries.find((entry) => entry.isDirectory());
  if (!home) throw new Error("Java is missing. Run npm run setup first.");
  return join(
    directory,
    home.name,
    process.platform === "darwin" ? "Contents/Home/bin/java" : "bin/java",
  );
}
