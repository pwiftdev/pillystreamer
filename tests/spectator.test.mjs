import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareSpectator } from "../scripts/spectator.mjs";

test("camera setup is repeatable, only targets PillyCam and preserves the save", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "pilly-camera-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const config = { version: "1.20.4", world: "survival" };
  await prepareSpectator(dir, config);
  const save = join(dir, "survival", "level.dat");
  await writeFile(save, "existing world");
  await prepareSpectator(dir, config);
  assert.equal(await readFile(save, "utf8"), "existing world");
  const root = join(dir, "survival/datapacks/pilly-camera");
  assert.equal(
    JSON.parse(await readFile(join(root, "pack.mcmeta"))).pack.pack_format,
    26,
  );
  const follow = await readFile(
    join(root, "data/pilly_camera/functions/follow.mcfunction"),
    "utf8",
  );
  assert.match(follow, /name=PillyCam,gamemode=!spectator/);
  assert.match(follow, /if entity @a\[name=Pilly,limit=1\]/);
  assert.match(follow, /schedule function pilly_camera:follow 1s replace/);
  assert.doesNotMatch(follow, /\btp\b|give|kill|time set/);
});
