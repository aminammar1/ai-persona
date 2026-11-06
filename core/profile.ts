import { readFileSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";
import { DEFAULT_DIALS, type Autonomy, type DialLevel, type PersonaDials, type PersonaProfile } from "./types.ts";

export interface LoadProfileOptions {
  /** Markdown headings to return from profile.md (without the ## prefix). */
  sections?: string[];
  /** Explicit, project-relative Markdown files to load for this task. */
  files?: string[];
}

const DIAL_KEYS = ["verbosity", "autonomy", "caution", "exploration"] as const;
type DialKey = (typeof DIAL_KEYS)[number];

function normalizeHeading(heading: string): string {
  return heading.trim().toLocaleLowerCase();
}

function parseDialValue(key: DialKey, value: string): PersonaDials[DialKey] | undefined {
  const normalized = value.trim().toLocaleLowerCase();
  if (key === "autonomy") {
    return normalized === "ask" || normalized === "act" ? (normalized as Autonomy) : undefined;
  }
  return normalized === "low" || normalized === "balanced" || normalized === "high"
    ? (normalized as DialLevel)
    : undefined;
}

export function parseProfileMarkdown(markdown: string): Pick<PersonaProfile, "baseline" | "sections"> {
  const sectionBodies = new Map<string, string[]>();
  let currentHeading = "";

  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+?)\s*#*\s*$/);
    if (heading) {
      currentHeading = heading[1].trim();
      sectionBodies.set(currentHeading, []);
      continue;
    }
    if (currentHeading) sectionBodies.get(currentHeading)?.push(line);
  }

  const baseline: PersonaDials = { ...DEFAULT_DIALS };
  for (const [heading, lines] of sectionBodies) {
    if (normalizeHeading(heading) !== "baseline dials") continue;
    for (const line of lines) {
      const setting = line.match(/^\s*[-*]\s*(verbosity|autonomy|caution|exploration)\s*:\s*(.*?)\s*$/i);
      if (!setting) continue;
      const key = setting[1].toLocaleLowerCase() as DialKey;
      const value = parseDialValue(key, setting[2]);
      if (value !== undefined) baseline[key] = value as never;
    }
  }

  return {
    baseline,
    sections: Object.fromEntries([...sectionBodies].map(([name, lines]) => [name, lines.join("\n").trim()])),
  };
}

function isInsideProject(projectRoot: string, target: string): boolean {
  const relative = target.slice(projectRoot.length);
  return relative === "" || (relative.startsWith(sep) && !relative.split(sep).includes(".."));
}

function readProjectFile(projectRoot: string, relativePath: string): string {
  if (isAbsolute(relativePath)) throw new Error("Profile file paths must be project-relative.");
  const root = resolve(projectRoot);
  const target = resolve(root, relativePath);
  if (!isInsideProject(root, target)) throw new Error("Profile file paths must stay inside the project.");
  return readFileSync(target, "utf8");
}

/**
 * Read the baseline and only the requested profile sections and split files.
 * Unknown headings remain valid custom content and are ignored unless selected.
 */
export function loadProfile(projectRoot: string, options: LoadProfileOptions = {}): PersonaProfile {
  const profilePath = resolve(projectRoot, "profile.md");
  let markdown = "";
  try {
    markdown = readProjectFile(projectRoot, "profile.md");
  } catch (error) {
    if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
  }
  const parsed = parseProfileMarkdown(markdown);
  const requestedSections = new Set((options.sections ?? []).map(normalizeHeading));
  const sections = Object.fromEntries(
    Object.entries(parsed.sections).filter(([name]) => requestedSections.has(normalizeHeading(name))),
  );
  const files = Object.fromEntries(
    (options.files ?? []).map((path) => [path, readProjectFile(projectRoot, path)]),
  );

  return { baseline: parsed.baseline, sections, files, profilePath };
}
