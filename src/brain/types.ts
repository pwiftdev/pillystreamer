export interface Point {
  x: number;
  y: number;
  z: number;
}
export const TASKS = [
  "scout",
  "gather",
  "craft",
  "build",
  "plant",
  "explore",
  "rest",
  "eat",
  "forage",
  "shelter",
  "retreat",
  "tools",
  "mine",
  "smelt",
  "camp",
  "sleep",
] as const;
export type TaskKind = (typeof TASKS)[number];
export interface Experience {
  task: TaskKind;
  at: number;
  position: Point;
  outcome: "progress" | "no_progress" | "blocked";
  evidence: string;
}
export interface Project {
  id: number;
  origin: Point;
  complete: boolean;
  shelter?: boolean;
}
export interface TownMemory {
  version: 2;
  experiences?: Experience[];
  resources?: { name: string; position: Point; at: number }[];
  shelter: Project | null;
  bornDay: number | null;
  stations: { table: Point | null; furnace: Point | null; bed: Point | null };
  center: Point;
  projects: Project[];
  seenChat: string[];
  preference: { task: TaskKind; until: number } | null;
  wood: "oak" | "birch";
  lastIdea: string;
  planted: number;
}
export interface BrainStatus {
  task: string;
  reason: string;
  completed: number;
  total: number;
  houses: number;
  planted: number;
  idea: string;
  planner: "local" | "model";
  outcome?: string;
  plan?: string;
  chapter?: string;
  day?: number;
}
export interface Candidate {
  id: TaskKind;
  title: string;
  reason: string;
  score: number;
}
