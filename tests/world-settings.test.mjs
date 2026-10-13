import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareWorld, worldProperties } from "../scripts/world-settings.mjs";
import minecraft from "../minecraft.json" with { type: "json" };

test("fresh survival settings replace old peaceful settings without starting or deleting a world", async (t) => {
  const path = await mkdtemp(join(tmpdir(), "pilly-world-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  await mkdir(join(path, "world"));
  await writeFile(join(path, "world", "keep.txt"), "existing town");
  await writeFile(
    join(path, "server.properties"),
    "difficulty=peaceful\nlevel-name=world\nlevel-seed=1\ngamemode=creative\n",
  );
  await prepareWorld(path, minecraft);
  const properties = await readFile(join(path, "server.properties"), "utf8");
  assert.match(properties, /^difficulty=normal$/m);
  assert.match(properties, /^gamemode=survival$/m);
  assert.match(properties, /^force-gamemode=true$/m);
  assert.match(properties, /^level-name=pilly-survival$/m);
  assert.match(properties, /^level-seed=$/m);
  assert.doesNotMatch(properties, /peaceful|creative/);
  assert.equal(
    await readFile(join(path, "world", "keep.txt"), "utf8"),
    "existing town",
  );
  assert.deepEqual((await readdir(path)).sort(), [
    "server.properties",
    "world",
  ]);
  await prepareWorld(path, minecraft);
  assert.equal(
    await readFile(join(path, "server.properties"), "utf8"),
    properties,
  );
});

test("world names cannot escape the save directory and peaceful cannot silently replace survival", () => {
  assert.throws(() => worldProperties("", { ...minecraft, world: "../world" }));
  assert.throws(() =>
    worldProperties("", { ...minecraft, difficulty: "peaceful" }),
  );
});
