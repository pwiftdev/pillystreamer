import assert from "node:assert/strict";
import { test } from "node:test";
import { Vec3 } from "vec3";
import type { Bot } from "mineflayer";
import { findPlot } from "../src/brain/scouting.js";
import { newMemory } from "../src/brain/memory.js";

function land(obstacle?: string, entrance = false) {
  return {
    entity: { position: new Vec3(0, 64, 0) },
    findBlocks: () => [new Vec3(0, 63, 0)],
    blockAt: (p: Vec3) => ({
      name:
        obstacle && p.x === 2 && p.z === (entrance ? -1 : 2) && p.y === 64
          ? obstacle
          : p.y === 63
            ? "grass_block"
            : "air",
    }),
    pathfinder: {
      movements: {},
      getPathFromTo: function* () {
        yield { result: { status: "success" } };
      },
    },
  } as unknown as Bot;
}
test("scouting reserves clear ground and rejects water, trees, existing buildings and overlapping plots", async () => {
  const m = newMemory({ x: 0, y: 64, z: 0 }),
    signal = new AbortController().signal;
  const plot = await findPlot(land(), m, signal);
  assert.deepEqual(plot?.origin, { x: 0, y: 64, z: 0 });
  for (const obstacle of ["water", "oak_log", "oak_planks"])
    assert.equal(await findPlot(land(obstacle), m, signal), null);
  assert.equal(await findPlot(land("oak_log", true), m, signal), null);
  m.projects.push(plot!);
  assert.equal(await findPlot(land(), m, signal), null);
});
