import type { ToolCallForGuard } from "./guards.ts";

function inputObject(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/** Extract file paths from a unified patch body's file and move markers. */
function patchPaths(patchText: string): string[] {
  const paths: string[] = [];
  const fileMarker = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm;
  const moveMarker = /^\*\*\* Move to: (.+)$/gm;
  for (const match of patchText.matchAll(fileMarker)) paths.push(match[1].trim());
  for (const match of patchText.matchAll(moveMarker)) paths.push(match[1].trim());
  return paths;
}

/**
 * Collect the fields standing orders can match on, from any adapter's tool
 * input. Covers the verified built-in schemas: OpenCode v2 (`path`, `filePath`,
 * `patchText`), omp (`filePath`, apply_patch `patch`), and the common aliases.
 */
export function normalizeToolCall(toolName: string, input: unknown, mcpServer?: string): ToolCallForGuard {
  const values = inputObject(input);
  const command = [values.command, values.cmd].find((value) => typeof value === "string");
  const paths = [
    ...strings(values.filePath),
    ...strings(values.path),
    ...strings(values.file),
    ...strings(values.files),
    ...strings(values.paths),
    ...strings(values.target),
    ...strings(values.destination),
    ...strings(values.patchText).flatMap(patchPaths),
    ...strings(values.patch).flatMap(patchPaths),
  ];
  return {
    toolName,
    ...(typeof command === "string" ? { command } : {}),
    ...(paths.length ? { paths } : {}),
    ...(mcpServer ? { mcpServer } : {}),
  };
}
