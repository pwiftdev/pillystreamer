import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import minecraft from "../../minecraft.json" with { type: "json" };
import { TASKS, type Point, type TownMemory } from "./types.js";

export const memoryPath = new URL(
  `../../.minecraft/${minecraft.version}/${minecraft.world}/pilly-life.json`,
  import.meta.url,
);
export function newMemory(center: Point): TownMemory {
  return {
    version: 2,
    experiences: [],
    resources: [],
    shelter: null,
    bornDay: null,
    stations: { table: null, furnace: null, bed: null },
    center: {
      x: Math.floor(center.x),
      y: Math.floor(center.y),
      z: Math.floor(center.z),
    },
    projects: [],
    seenChat: [],
    preference: null,
    wood: "oak",
    lastIdea: "",
    planted: 0,
  };
}
const point = (v: Point) =>
  v &&
  [v.x, v.y, v.z].every(
    (n) => Number.isInteger(n) && Math.abs(n) < 30_000_000,
  ) &&
  v.y >= -64 &&
  v.y <= 320;
export function validateMemory(value: unknown): TownMemory {
  const m = value as TownMemory;
  if (
    !m ||
    m.version !== 2 ||
    (m.resources !== undefined &&
      (!Array.isArray(m.resources) ||
        m.resources.length > 32 ||
        !m.resources.every(
          (r) =>
            r &&
            typeof r.name === "string" &&
            /^[a-z_]{1,60}$/.test(r.name) &&
            point(r.position) &&
            Number.isFinite(r.at),
        ))) ||
    (m.experiences !== undefined &&
      (!Array.isArray(m.experiences) ||
        m.experiences.length > 40 ||
        !m.experiences.every(
          (e) =>
            e &&
            TASKS.includes(e.task) &&
            Number.isFinite(e.at) &&
            point(e.position) &&
            ["progress", "no_progress", "blocked"].includes(e.outcome) &&
            typeof e.evidence === "string" &&
            e.evidence.length <= 180,
        ))) ||
    (m.bornDay !== null && (!Number.isInteger(m.bornDay) || m.bornDay < 0)) ||
    !m.stations ||
    ![m.stations.table, m.stations.furnace, m.stations.bed].every(
      (p) => p === null || point(p),
    ) ||
    (m.shelter !== null &&
      (!m.shelter ||
        m.shelter.id !== 0 ||
        m.shelter.shelter !== true ||
        !point(m.shelter.origin) ||
        typeof m.shelter.complete !== "boolean")) ||
    !point(m.center) ||
    !Array.isArray(m.projects) ||
    m.projects.length > 64 ||
    !m.projects.every(
      (p, i) =>
        p &&
        p.id === i + 1 &&
        point(p.origin) &&
        typeof p.complete === "boolean" &&
        (p.complete || i === m.projects.length - 1) &&
        Math.hypot(p.origin.x - m.center.x, p.origin.z - m.center.z) <= 128,
    ) ||
    !Array.isArray(m.seenChat) ||
    m.seenChat.length > 80 ||
    !m.seenChat.every((id) => typeof id === "string" && id.length <= 80) ||
    !["oak", "birch"].includes(m.wood) ||
    typeof m.lastIdea !== "string" ||
    m.lastIdea.length > 120 ||
    !Number.isInteger(m.planted) ||
    m.planted < 0 ||
    (m.preference !== null &&
      (!m.preference ||
        !TASKS.includes(m.preference.task) ||
        !Number.isFinite(m.preference.until)))
  ) {
    throw new Error(
      "Life memory is invalid. Restore it before starting Pilly; it was not reset.",
    );
  }
  return m;
}
export async function loadMemory(center: Point, path = memoryPath) {
  try {
    return validateMemory(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return newMemory(center);
  }
}
export async function saveMemory(memory: TownMemory, path = memoryPath) {
  validateMemory(memory);
  await mkdir(dirname(fileURLToPath(path)), { recursive: true });
  const temporary = new URL(`${path.href}.tmp`);
  await writeFile(temporary, JSON.stringify(memory), { mode: 0o600 });
  await rename(temporary, path);
}
