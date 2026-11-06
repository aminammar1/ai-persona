import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadProfile, parseProfileMarkdown } from "./profile.ts";
import { getRecentMemories, type MemoryNote } from "./memory.ts";
import type { PersonaProfile } from "./types.ts";

const MAX_CONTEXT_CHARS = 800;
const MAX_PROFILE_SLICE_CHARS = 180;
const MAX_NOTE_CHARS = 150;
const STOP_WORDS = new Set(["about", "after", "before", "from", "into", "please", "that", "this", "with", "your"]);

function taskWords(task: string): string[] {
  return [...new Set(task.toLocaleLowerCase().match(/[\p{L}\p{N}_-]{3,}/gu) ?? [])]
    .filter((word) => !STOP_WORDS.has(word));
}

function scoreRelevance(value: string, words: string[]): number {
  const lower = value.toLocaleLowerCase();
  return words.reduce((score, word) => score + (new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "u").test(lower) ? 1 : 0), 0);
}

function profileSelection(projectRoot: string, task: string): { sections: string[]; files: string[] } {
  const profilePath = resolve(projectRoot, "profile.md");
  const markdown = existsSync(profilePath) ? readFileSync(profilePath, "utf8") : "";
  const parsed = parseProfileMarkdown(markdown);
  const words = taskWords(task);
  const rankedSections = Object.entries(parsed.sections)
    .filter(([name]) => !["baseline dials", "optional profile files"].includes(name.toLocaleLowerCase()))
    .map(([name, body]) => ({ name, score: scoreRelevance(`${name} ${body}`, words) }))
    .filter((section) => section.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((section) => section.name);
  const sections = [...new Set(["Project", ...rankedSections])];

  const profileDirectory = resolve(projectRoot, "profile");
  let files: string[] = [];
  if (existsSync(profileDirectory)) {
    files = readdirSync(profileDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLocaleLowerCase().endsWith(".md"))
      .map((entry) => ({
        path: `profile/${entry.name}`,
        score: scoreRelevance(entry.name.slice(0, -3), words),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 1)
      .map((entry) => entry.path);
  }
  return { sections, files };
}

function clip(text: string, maxChars: number): string {
  const value = text.replace(/\s+/g, " ").trim();
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars - 1).trimEnd()}…`;
}

function renderProfile(profile: PersonaProfile): string[] {
  const lines = [
    `Baseline dials: verbosity ${profile.baseline.verbosity}, autonomy ${profile.baseline.autonomy}, caution ${profile.baseline.caution}, exploration ${profile.baseline.exploration}.`,
  ];
  for (const [heading, content] of Object.entries(profile.sections)) {
    if (content) lines.push(`${heading}: ${clip(content, MAX_PROFILE_SLICE_CHARS)}`);
  }
  for (const [path, content] of Object.entries(profile.files)) {
    lines.push(`${path}: ${clip(content, MAX_PROFILE_SLICE_CHARS)}`);
  }
  return lines;
}

function renderMemories(notes: MemoryNote[]): string[] {
  const openProblem = notes.find((note) => note.kind === "open_problem");
  const lines = [`Where we left off: ${openProblem ? clip(openProblem.content, MAX_NOTE_CHARS) : "No open problem was recorded."}`];
  let remaining = openProblem ? 2 : 3;
  for (const note of notes) {
    if (note === openProblem || remaining === 0) continue;
    lines.push(`Recent ${note.kind.replace("_", " ")}: ${clip(note.content, MAX_NOTE_CHARS)}`);
    remaining--;
  }
  return lines;
}

/** Return only this project's profile slice and up to three short memory notes. */
export function getPersonaContext(projectRoot: string, task: string): string {
  const selected = profileSelection(projectRoot, task);
  const profile = loadProfile(projectRoot, selected);
  const notes = getRecentMemories(projectRoot, 3);
  return clip([...renderProfile(profile), ...renderMemories(notes)].join("\n"), MAX_CONTEXT_CHARS);
}
