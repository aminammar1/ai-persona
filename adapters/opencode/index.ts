import { Plugin } from "@opencode/plugin";
import { Error as ToolError } from "@opencode/plugin/promise/tool";
import { getActiveGuards } from "../../core/memory.ts";
import { evaluateGuards } from "../../core/guards.ts";
import type { ToolCallForGuard } from "../../core/guards.ts";

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

function patchPaths(patchText: string): string[] {
  const paths: string[] = [];
  const fileMarker = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm;
  const moveMarker = /^\*\*\* Move to: (.+)$/gm;
  for (const match of patchText.matchAll(fileMarker)) paths.push(match[1].trim());
  for (const match of patchText.matchAll(moveMarker)) paths.push(match[1].trim());
  return paths;
}

function normalizeToolCall(toolName: string, input: unknown, mcpServer?: string): ToolCallForGuard {
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
  ];
  return {
    toolName,
    ...(typeof command === "string" ? { command } : {}),
    ...(paths.length ? { paths } : {}),
    ...(mcpServer ? { mcpServer } : {}),
  };
}

export default Plugin.define({
  id: "ai-persona-guards",
  async setup(ctx) {
    const projectRoot = ctx.location.project.canonical;

    await ctx.tool.hook("execute.before", async (event) => {
      try {
        const guards = getActiveGuards(projectRoot);
        let mcpServer: string | undefined;
        if (guards.length > 0) {
          const servers = await ctx.mcp.list({ location: { directory: projectRoot } });
          const toolName = event.tool.toLocaleLowerCase();
          mcpServer = servers.data
            .map((server) => ({
              name: server.name,
              prefixes: [server.name, server.name.replace(/[^a-z0-9]+/gi, "_")],
            }))
            .sort((left, right) => right.name.length - left.name.length)
            .find(({ prefixes }) => prefixes.some((prefix) => toolName.startsWith(`${prefix.toLocaleLowerCase()}_`)))
            ?.name;
        }

        const decision = evaluateGuards(projectRoot, normalizeToolCall(event.tool, event.input, mcpServer), guards);
        if (decision.blocked) throw new ToolError({ message: decision.reason ?? "Blocked by a standing order." });
      } catch (error) {
        if (error instanceof ToolError) throw error;
        // A database or adapter failure must not let a potentially guarded call through.
        throw new ToolError({ message: "Blocked: standing-order checks failed; fix the ai-persona project store and retry." });
      }
    });
  },
});
