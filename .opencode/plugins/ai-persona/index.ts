import { Plugin } from "@opencode/plugin";
import { Error as ToolError } from "@opencode/plugin/promise/tool";
import { evaluateGuards } from "../../../core/guards.ts";
import { getActiveGuards, recordCompactionText } from "../../../core/memory.ts";
import {
  recordInterruption,
  recordLearningConfirmation,
  recordPermissionAsked,
  recordPermissionReply,
} from "../../../core/learning.ts";
import { loadProfile } from "../../../core/profile.ts";
import { processPrompt } from "../../../core/transition.ts";
import { markPromptInterrupted, resetPromptSignals, writeLastState } from "../../../core/state-store.ts";
import type { ToolCallForGuard } from "../../../core/guards.ts";

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

function habitNudge(projectRoot: string): string | null {
  const sections = loadProfile(projectRoot, { sections: ["Habit nudge", "Habits"] }).sections;
  const dedicated = sections["Habit nudge"]?.split(/\r?\n/).map((line) => line.replace(/^\s*[-*]\s*/, "").trim()).find(Boolean);
  const fromHabits = sections.Habits?.split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
    .find((line) => /\b(run|test|build|lint|verify|check)\b/i.test(line));
  const value = dedicated || fromHabits;
  if (!value) return null;
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").slice(0, 140).trim();
}

function appendNudge(event: { result: { content?: string | ReadonlyArray<{ type: string; text?: string; [key: string]: unknown }> } }, nudge: string): void {
  const text = `Profile habit: ${nudge}`;
  if (typeof event.result.content === "string") {
    event.result.content = `${event.result.content}\n${text}`;
  } else {
    event.result.content = [...(event.result.content ?? []), { type: "text", text }];
  }
}

export default Plugin.define({
  id: "ai-persona",
  async setup(ctx) {
    const controller = new AbortController();
    void (async () => {
      for await (const event of ctx.event.subscribe({
        types: ["session.created", "session.execution.interrupted", "session.compaction.ended", "permission.asked", "permission.replied"],
        signal: controller.signal,
      })) {
        if (event.type === "session.created") {
          if (!event.data.parentID) {
            resetPromptSignals(event.data.location.directory);
            writeLastState(event.data.location.directory, "init");
          }
          continue;
        }
        const projectRoot = event.location?.directory ?? ctx.location.project.canonical;
        if (event.type === "session.compaction.ended") {
          if (event.data?.text) recordCompactionText(projectRoot, event.data.text);
          continue;
        }
        if (event.type === "session.execution.interrupted") {
          recordInterruption(projectRoot, event.data.reason, event.id);
          if (event.data.reason === "user") markPromptInterrupted(projectRoot);
          continue;
        }
        if (event.type === "permission.asked") {
          recordPermissionAsked(projectRoot, event.data.id, event.data.action, event.data.resources);
        } else {
          recordPermissionReply(projectRoot, event.data.requestID, event.data.reply);
        }
      }
    })().catch((error: unknown) => {
      if (!controller.signal.aborted) console.error("[ai-persona] event stream stopped", error);
    });

    await ctx.session.hook("prompt", async (event) => {
      const session = await ctx.session.get({ sessionID: event.sessionID });
      recordLearningConfirmation(session.location.directory, event.prompt.text);
      const transition = processPrompt(session.location.directory, event.prompt.text);
      if (transition.hint) event.prompt.text = `${event.prompt.text}\n\n${transition.hint}`;
    });

    await ctx.session.hook("compaction", (event) => {
      event.system.push({
        type: "text",
        text: "For the ai-persona project handoff, include these exact headings and concise bullets: Decisions, Corrections, Open problems. Use an empty Open problems section when none remain. Include only durable project facts. Never include a transcript or unrelated detail.",
      });
    });

    await ctx.tool.hook("execute.before", async (event) => {
      try {
        const session = await ctx.session.get({ sessionID: event.sessionID });
        const projectRoot = session.location.directory;
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
        throw new ToolError({ message: "Blocked: standing-order checks failed; fix the ai-persona project store and retry." });
      }
    });

    await ctx.tool.hook("execute.after", async (event) => {
      if (event.status !== "completed" || !["edit", "write", "apply_patch"].includes(event.tool)) return;
      const session = await ctx.session.get({ sessionID: event.sessionID });
      const nudge = habitNudge(session.location.directory);
      if (nudge) appendNudge(event, nudge);
    });

    return () => controller.abort();
  },
});
