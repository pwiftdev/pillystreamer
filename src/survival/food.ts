import type { Bot } from "mineflayer";
import pathfinder from "mineflayer-pathfinder";
import { setTimeout as delay } from "node:timers/promises";
import { runAction } from "../actions.js";
import { Replan, walk } from "../brain/placement.js";
import { inventoryCount } from "../gameplay.js";
import { FOOD, nearbyThreat } from "./state.js";

const { goals } = pathfinder;
export async function eat(bot: Bot, signal: AbortSignal) {
  const item = bot.inventory
    .items()
    .filter((i) => FOOD.has(i.name))
    .sort(
      (a, b) =>
        Number(b.name.startsWith("cooked_")) -
        Number(a.name.startsWith("cooked_")),
    )[0];
  if (!item) throw new Replan("Need to find a snack first.");
  await runAction(() => bot.equip(item, "hand"), signal);
  await runAction(() => bot.consume(), signal, 8000);
  signal.throwIfAborted();
}
export function forageTargets(bot: Bot, needWool = false) {
  const drop = Object.values(bot.entities).find((e) => {
    const item = e.getDroppedItem?.();
    return (
      item &&
      FOOD.has(item.name) &&
      e.position.distanceTo(bot.entity.position) < 16
    );
  });
  const foodEnough = inventoryCount(bot, (name) => FOOD.has(name)) >= 8;
  const animal = Object.values(bot.entities)
    .filter(
      (e) =>
        ["cow", "pig", "sheep"].includes(e.name || "") &&
        (!needWool || !foodEnough || e.name === "sheep") &&
        e.position.distanceTo(bot.entity.position) < 24,
    )
    .sort(
      (a, b) =>
        a.position.distanceTo(bot.entity.position) -
        b.position.distanceTo(bot.entity.position),
    )[0];
  return { drop, animal };
}
export async function forage(bot: Bot, signal: AbortSignal, needWool = false) {
  const { drop, animal } = forageTargets(bot, needWool);
  if (drop) {
    await walk(
      bot,
      new goals.GoalNear(drop.position.x, drop.position.y, drop.position.z, 1),
      signal,
    );
    await delay(500, undefined, { signal });
    return;
  }
  if (!animal)
    throw new Replan("No food nearby. Need to check somewhere else.");
  const weapon = bot.inventory
    .items()
    .find((i) => /^(iron|stone|wooden)_(axe|sword)$/.test(i.name));
  if (weapon) await runAction(() => bot.equip(weapon, "hand"), signal);
  for (let hit = 0; hit < 6 && bot.entities[animal.id]; hit++) {
    signal.throwIfAborted();
    if (nearbyThreat(bot))
      throw new Replan("Too risky here. Need a safer spot.");
    await walk(bot, new goals.GoalFollow(animal, 2), signal);
    signal.throwIfAborted();
    bot.attack(animal);
    await delay(700, undefined, { signal });
  }
  if (!bot.entities[animal.id]) {
    await walk(
      bot,
      new goals.GoalNear(
        animal.position.x,
        animal.position.y,
        animal.position.z,
        1,
      ),
      signal,
    );
    await delay(800, undefined, { signal });
  }
}
