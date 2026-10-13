import type { Candidate, TownMemory } from "../brain/types.js";
import { candidates } from "../brain/planner.js";
import { townReady, type SurvivalState } from "./state.js";

const task = (
  id: Candidate["id"],
  title: string,
  reason: string,
  score = 1000,
): Candidate => ({ id, title, reason, score });
export function survivalCandidates(
  s: SurvivalState,
  memory: TownMemory,
): Candidate[] {
  if (s.danger)
    return [
      task(
        "retreat",
        "Get somewhere safer",
        "nah bro, not taking that fight right now.",
      ),
    ];
  if (s.hunger < 18 && s.food > 0)
    return [
      task(
        "eat",
        "Grab a bite",
        "Food first. Can't do much on an empty stomach.",
      ),
    ];
  if (s.hunger <= 6)
    return [
      task(
        "forage",
        "Find something to eat",
        "Running low on food. This comes before everything else.",
      ),
      task(
        "explore",
        "Look for food nearby",
        "No food here. Checking a new spot.",
        900,
      ),
    ];
  if (s.night && s.shelter)
    return [
      task(
        s.bed && s.shelter ? "sleep" : "retreat",
        "Get through the night",
        "Shelter first. The big adventures can wait for daylight.",
      ),
      ...(s.bed && s.shelter
        ? [
            task(
              "retreat",
              "Stay sheltered",
              "If sleep isn't possible, keep the door closed and wait it out.",
              999,
            ),
          ]
        : []),
    ];
  if (s.health <= 8)
    return [
      task(
        s.hunger >= 18 ? "retreat" : "forage",
        "Recover before heading out",
        "Need food and a safe spot before doing anything ambitious.",
      ),
      ...(s.hunger < 18
        ? [
            task(
              "explore",
              "Find food close by",
              "Looking for a snack so I can recover.",
              900,
            ),
          ]
        : []),
    ];
  const options: Candidate[] = [];
  const foodReserve = s.day >= 10 ? 16 : 8;
  if (s.food < foodReserve || (s.shelter && !s.bed && s.wool < 3))
    options.push(
      task(
        "forage",
        s.food < foodReserve ? "Find some food" : "Find wool for a bed",
        s.food < foodReserve
          ? "A few snacks now saves a very scuffed night later."
          : "A few sheep could sort out a proper place to sleep.",
        s.food < foodReserve ? 110 : 85,
      ),
    );
  if (s.logs < 4 && s.planks < 128)
    options.push(
      task(
        "gather",
        "Get some wood",
        "A few logs for shelter and basic supplies.",
        s.planks < 24 ? 100 : 25,
      ),
    );
  if (s.logs > 0 && s.planks < 24)
    options.push(
      task(
        "craft",
        "Make basic supplies",
        "Turning a bit of wood into something useful.",
        120,
      ),
    );
  if (s.planks >= 8 && !s.shelter)
    options.push(
      task(
        "shelter",
        "Build my first shelter",
        "One little safe place to survive the night. Town plans can wait.",
        95,
      ),
    );
  if (
    s.planks >= 8 &&
    (!s.table ||
      (!s.woodenPick && !s.stonePick && !s.ironPick && !s.diamondPick))
  )
    options.push(
      task(
        "tools",
        "Make starter tools",
        "A crafting table and a pickaxe. Finally using more than my hands.",
        105,
      ),
    );
  if (
    s.table &&
    ((s.cobble >= 3 && !s.stonePick && !s.ironPick && !s.diamondPick) ||
      (s.cobble >= 3 && !s.stoneAxe) ||
      s.iron >= 3 ||
      s.diamonds >= 3 ||
      (s.coal > 0 && s.torches < 12))
  )
    options.push(
      task(
        "tools",
        "Upgrade my gear",
        "Better tools, some light, and a little less struggling.",
        100,
      ),
    );
  if (s.shelter && s.table)
    options.push(
      task(
        "camp",
        "Improve the shelter",
        "Sort out a furnace, light, and a bed when the supplies are there.",
        (!s.furnace && s.cobble >= 8) || (!s.bed && s.wool >= 3) ? 90 : 55,
      ),
    );
  if (s.furnace)
    options.push(
      task(
        "smelt",
        "Cook and smelt supplies",
        "Making the supplies we already have more useful.",
        80,
      ),
    );
  if (s.woodenPick || s.stonePick || s.ironPick || s.diamondPick)
    options.push(
      task(
        "mine",
        "Look for useful stone and ore",
        "Small, reachable mining trips. No digging straight down.",
        65,
      ),
    );
  if (s.saplings > 0 && s.shelter)
    options.push(
      task(
        "plant",
        "Replant a few trees",
        "Leaving a little green behind us.",
        20,
      ),
    );
  options.push(
    task(
      "explore",
      "Explore a little",
      "Looking for food, resources, and somewhere worth checking out.",
      10,
    ),
  );
  if (townReady(s))
    options.push(
      ...candidates(
        {
          ...s,
          active: memory.projects.some((p) => !p.complete),
          houses: memory.projects.filter((p) => p.complete).length,
        },
        memory,
      ),
    );
  if (memory.preference && memory.preference.until > Date.now())
    for (const option of options)
      if (option.id === memory.preference.task) option.score += 30;
  return options
    .sort((a, b) => b.score - a.score)
    .filter(
      (option, index, all) =>
        all.findIndex((o) => o.id === option.id) === index,
    );
}
