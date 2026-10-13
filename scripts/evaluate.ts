import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readFile, readdir } from "node:fs/promises";
import { memoryPath } from "../src/brain/memory.js";
import { summarizeRun } from "../src/brain/metrics.js";
const directory = process.argv[2]
  ? pathToFileURL(resolve(process.argv[2]) + "/")
  : new URL("./pilly-runs/", memoryPath);
const files = (await readdir(directory)).filter((name) =>
  name.endsWith(".jsonl"),
);
for (const file of files)
  console.log(
    JSON.stringify(
      {
        run: file,
        ...summarizeRun(await readFile(new URL(file, directory), "utf8")),
      },
      null,
      2,
    ),
  );
