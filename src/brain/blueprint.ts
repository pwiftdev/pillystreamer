import { Vec3 } from "vec3";
import type { Point, Project } from "./types.js";

export const vector = (p: Point) => new Vec3(p.x, p.y, p.z);
export const isPlank = (name: string) =>
  /^(oak|birch|spruce|jungle|acacia|dark_oak|mangrove|cherry)_planks$/.test(
    name,
  );
export const isReplaceable = (name: string) =>
  [
    "air",
    "cave_air",
    "short_grass",
    "tall_grass",
    "fern",
    "large_fern",
    "dandelion",
    "poppy",
  ].includes(name);
export const isGround = (name: string) =>
  ["grass_block", "dirt", "coarse_dirt", "podzol", "stone"].includes(name);
export function houseBlocks(project: Project): Vec3[] {
  const blocks: Vec3[] = [];
  blocks.push(vector(project.origin).offset(2, 0, -1));
  const roof = roofHeight(project);
  for (let y = 0; y <= roof; y++)
    for (let z = 0; z < 5; z++)
      for (let x = 0; x < 5; x++) {
        const edge = x === 0 || x === 4 || z === 0 || z === 4;
        const door = x === 2 && z === 0 && (y === 1 || y === 2);
        const window =
          !project.shelter &&
          y === 2 &&
          ((z === 2 && (x === 0 || x === 4)) || (x === 2 && z === 4));
        if (y === 0 || y === roof || (edge && !door && !window))
          blocks.push(vector(project.origin).offset(x, y, z));
      }
  return blocks;
}

export const roofHeight = (project: Project) => (project.shelter ? 3 : 4);

export function constructionPlan(project: Project, missing: Vec3[]) {
  const roof = missing.filter(
    (p) => p.y === project.origin.y + roofHeight(project),
  );
  const roofStarted = roof.length < 25;
  const obstructsRoof = (p: Vec3) =>
    p.y === project.origin.y + roofHeight(project) - 1 &&
    roof.some((r) => r.distanceTo(p) <= 1.5);
  return {
    pending: roofStarted
      ? missing.filter((p) => !obstructsRoof(p)).sort((a, b) => b.y - a.y)
      : missing,
    access: roofStarted ? houseBlocks(project).filter(obstructsRoof) : [],
  };
}
