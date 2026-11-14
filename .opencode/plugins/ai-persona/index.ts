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
import { habitNudgeLine } from "../../../core/profile.ts";
import { currentPersonaHint, hintForState, processPrompt } from "../../../core/transition.ts";
import { normalizeToolCall } from "../../../core/tool-call.ts";
import { markPromptInterrupted, resetPromptSignals, writeLastState } from "../../../core/state-store.ts";

function appendNudge(event: { result: { content?: string | ReadonlyArray<{ type: string; text?: string; [key: string]: unknown }> } }, nudge: string): void {
  const text = `Profile habit (from profile.md): ${nudge}`;
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
    /** project root -> current persona hint ("" while none); refreshed on every prompt. */
    const stateHints = new Map<string, string>();
    /** sessionID -> project root, filled from prompts and session creation. */
    const sessionRoots = new Map<string, string>();
    /** Subagent child sessions never receive persona hints. */
    const childSessions = new Set<string>();

    function currentHint(projectRoot: string): string {
      const cached = stateHints.get(projectRoot);
      if (cached !== undefined) return cached;
      const hint = currentPersonaHint(projectRoot) ?? "";
      stateHints.set(projectRoot, hint);
      return hint;
    }

    void (async () => {
      for await (const event of ctx.event.subscribe({
        types: ["session.created", "session.execution.interrupted", "session.compaction.ended", "permission.asked", "permission.replied"],
        signal: controller.signal,
      })) {
        if (event.type === "session.created") {
          sessionRoots.set(event.data.sessionID, event.data.location.directory);
          if (event.data.parentID) {
            childSessions.add(event.data.sessionID);
            continue;
          }
          resetPromptSignals(event.data.location.directory);
          writeLastState(event.data.location.directory, "init");
          stateHints.delete(event.data.location.directory);
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
      const projectRoot = session.location.directory;
      sessionRoots.set(event.sessionID, projectRoot);
      recordLearningConfirmation(projectRoot, event.prompt.text);
      const transition = processPrompt(projectRoot, event.prompt.text);
      // The user's prompt text is never modified; hints ride invisibly with
      // every model call through the context hook below.
      stateHints.set(projectRoot, hintForState(transition.state, transition.dials));
    });

    await ctx.session.hook("context", async (event) => {
      try {
        if (childSessions.has(event.sessionID)) return;
        let projectRoot = sessionRoots.get(event.sessionID);
        if (!projectRoot) {
          projectRoot = (await ctx.session.get({ sessionID: event.sessionID })).location.directory;
          sessionRoots.set(event.sessionID, projectRoot);
        }
        const hint = currentHint(projectRoot);
        if (hint) event.system.push({ type: "text", text: hint });
      } catch {
        // A persona hint must never break a model call.
      }
    });

    await ctx.session.hook("compaction", (event) => {
      event.system.push({
        type: "text",
        text: "For the ai-persona project handoff, include these exact headings and concise bullets: Decisions, Corrections, Open problems. Always include Decisions and Open problems, even when empty. Include only durable project facts. Never include a transcript or unrelated detail.",
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
      // OpenCode v2 renamed the v1 apply_patch tool to patch.
      if (event.status !== "completed" || !["edit", "write", "patch"].includes(event.tool)) return;
      const session = await ctx.session.get({ sessionID: event.sessionID });
      const nudge = habitNudgeLine(session.location.directory);
      if (nudge) appendNudge(event, nudge);
    });

    return () => controller.abort();
  },
});
