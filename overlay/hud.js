import { objective } from "./shared.js";

const ICONS = {
  health:
    '<path d="M2 3h3V1h5v2h4V1h5v2h3v8h-3v3h-3v3h-3v3h-2v-3H8v-3H5v-3H2z"/>',
  food: '<path d="M13 1h6v3h3v7h-3v3h-7v-3H9V5h4zM9 12l3 3-5 5H2v-5h4z"/>',
};

export function missionView(bot, live) {
  if (!live)
    return {
      title: "Next adventure loading",
      detail: "Pilly will be back in a bit.",
      badge: "ON A BREAK",
      step: -1,
      progress: null,
    };
  if (bot.brain)
    return {
      title: bot.brain.task,
      detail: bot.brain.reason,
      badge: bot.brain.chapter
        ? `DAY ${bot.brain.day} · ${bot.brain.chapter.toUpperCase()}`
        : `${bot.brain.houses} ${bot.brain.houses === 1 ? "HOME" : "HOMES"}`,
      step: -1,
      progress: bot.brain.total
        ? Math.min(100, (bot.brain.completed / bot.brain.total) * 100)
        : null,
      thought:
        bot.brain.idea ||
        bot.brain.plan ||
        "Pilly picks his next move as he goes.",
    };
  const step = ["gathering", "crafting", "returning", "complete"].indexOf(
    bot.phase,
  );
  const progress = Math.min(100, Math.max(0, (bot.logs / bot.target) * 100));
  const details = {
    gathering: `${bot.logs} / ${bot.target} logs in the bag.`,
    crafting: "Turning the haul into starter supplies.",
    returning: "Supplies packed. Back to our starting spot.",
    complete: "Supplies sorted. Hanging out with chat.",
  };
  return {
    title: bot.phase === "gathering" ? "Gather wood" : objective(bot),
    detail: details[bot.phase] || "Getting settled into the world.",
    badge:
      step === 3
        ? "ALL DONE"
        : step >= 0
          ? `STEP ${step + 1} / 3`
          : "WARMING UP",
    step,
    progress: step === 0 ? progress : step > 0 ? 100 : null,
  };
}

function createMeter(name) {
  const track = document.getElementById(`${name}-meter`);
  const svg = `<svg viewBox="0 0 24 22" aria-hidden="true">${ICONS[name]}</svg>`;
  const fills = Array.from({ length: 10 }, () => {
    const icon = document.createElement("span");
    icon.className = "vital-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = `${svg}<span class="vital-fill">${svg}</span>`;
    track.append(icon);
    return icon.lastElementChild;
  });
  let previous;
  return (raw) => {
    const value = Math.max(0, Math.min(20, raw));
    if (value === previous) return;
    previous = value;
    fills.forEach((fill, index) => {
      fill.style.width = `${Math.max(0, Math.min(1, value / 2 - index)) * 100}%`;
    });
    track.setAttribute("aria-valuenow", String(value));
    track.closest(".vital").classList.toggle("low", value <= 6);
    document.getElementById(name).textContent = String(
      Number(value.toFixed(1)),
    );
    document.getElementById(`${name}-label`).textContent =
      name === "health"
        ? value <= 6
          ? "Low health"
          : "Health"
        : value <= 6
          ? "Need a snack"
          : "Hunger";
  };
}

export class Hud {
  constructor() {
    this.health = createMeter("health");
    this.food = createMeter("food");
    this.steps = [...document.querySelectorAll("#mission-steps span")];
  }

  draw(state, live, connected, now) {
    const $ = (id) => document.getElementById(id);
    $("vitals").hidden = !state.settings.showVitals || !live;
    $("objective").hidden = !state.settings.showObjective;
    if (live) {
      if (this.lastHealth !== undefined && state.bot.health < this.lastHealth)
        this.hurtUntil = now + 900;
      this.lastHealth = state.bot.health;
      this.health(state.bot.health);
      this.food(state.bot.food);
    } else this.lastHealth = undefined;
    $("vitals").classList.toggle("hurt", live && now < this.hurtUntil);
    const mission = missionView(state.bot, live);
    $("objective-text").textContent = connected
      ? mission.title
      : "Stream reconnecting";
    $("objective-detail").textContent = connected
      ? mission.detail
      : "Waiting for a fresh update from Pilly.";
    $("mission-badge").textContent = connected ? mission.badge : "RECONNECTING";
    $("town-thought").textContent = mission.thought || "";
    $("town-thought").hidden = !mission.thought || !connected;
    $("progress-track").setAttribute(
      "aria-label",
      state.bot.brain ? "Current task progress" : "Wood collected",
    );
    $("progress-track").hidden = mission.progress === null;
    $("progress-track").setAttribute(
      "aria-valuenow",
      String(Math.round(mission.progress ?? 0)),
    );
    $("progress").style.width = `${mission.progress ?? 0}%`;
    $("mission-steps").hidden = mission.step < 0;
    this.steps.forEach((step, index) => {
      step.classList.toggle("active", mission.step === index);
      step.classList.toggle("done", mission.step > index);
      if (mission.step === index) step.setAttribute("aria-current", "step");
      else step.removeAttribute("aria-current");
    });
  }
}
