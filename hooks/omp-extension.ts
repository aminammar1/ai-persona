/**
 * ai-persona adapter for omp (oh-my-pi).
 *
 * setup.mjs symlinks this file into <project>/.omp/extensions/ai-persona.ts,
 * where omp auto-discovers project extensions (cwd-only). Relative imports
 * resolve against the installed runtime clone, so the symlink must point at
 * <project>/.ai-persona/runtime/hooks/omp-extension.ts.
 *
 * Types here are structural on purpose: omp loads this module inside its own
 * Bun runtime and provides the real ExtensionAPI, so this file must not import
 * an @oh-my-pi package. Event names and result shapes follow omp's extension
 * docs: session_start, before_agent_start, tool_call, tool_result,
 * session.compacting.
 *
 * Known omp gaps (no verified surface, intentionally unused): user-interruption
 * signal (the interrupted -> debug classification never triggers), compaction
 * bullet recording (session_compact payload unverified), and permission
 * ask/reply learning pairs.
 */
import { evaluateGuards } from "../core/guards.ts";
import { recordLearningConfirmation } from "../core/learning.ts";
import { getActiveGuards } from "../core/memory.ts";
import { habitNudgeLine } from "../core/profile.ts";
import { resetPromptSignals, writeLastState } from "../core/state-store.ts";
import { hintForState, processPrompt } from "../core/transition.ts";
import { normalizeToolCall } from "../core/tool-call.ts";
import type { ToolCallForGuard } from "../core/guards.ts";

/** Structural view of the context omp passes to event handlers. */
interface OmpContext {
  cwd?: unknown;
  agent?: { kind?: unknown };
}

interface OmpSessionStart {
  reason?: unknown;
}

interface OmpBeforeAgentStart {
  reason?: unknown;
  prompt?: unknown;
  systemPrompt?: unknown;
}

interface OmpToolCall {
  toolName?: unknown;
  input?: unknown;
  mcpServerName?: unknown;
}

interface OmpToolResult {
  toolName?: unknown;
  isError?: unknown;
}

interface OmpExtensionApi {
  on(event: string, handler: (event: unknown, ctx: OmpContext) => unknown): void;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Advisors and task/subagent sessions run with kind "sub"; the persona is for the main session. */
function isMainSession(ctx: OmpContext): boolean {
  return ctx.agent?.kind !== "sub";
}

function projectRoot(ctx: OmpContext): string | undefined {
  return optionalText(ctx.cwd);
}

/** omp names MCP tools `mcp__<server>_<tool>` (single underscore separator). */
function ompMcpServer(toolName: string, event: OmpToolCall): string | undefined {
  const explicit = optionalText(event.mcpServerName);
  if (explicit) return explicit;
  if (!toolName.startsWith("mcp__")) return undefined;
  const rest = toolName.slice("mcp__".length);
  const separator = rest.indexOf("_");
  return separator > 0 ? rest.slice(0, separator) : rest;
}

const OMP_FILE_TOOLS = new Set(["edit", "write", "apply_patch"]);

export default function (pi: OmpExtensionApi) {
  pi.on("session_start", async (raw, ctx) => {
    const event = raw as OmpSessionStart;
    if (!isMainSession(ctx)) return;
    const root = projectRoot(ctx);
    if (!root) return;
    if (event.reason !== "startup" && event.reason !== "new") return;
    resetPromptSignals(root);
    writeLastState(root, "init");
  });

  pi.on("before_agent_start", async (raw, ctx) => {
    const event = raw as OmpBeforeAgentStart;
    if (!isMainSession(ctx)) return;
    const root = projectRoot(ctx);
    if (!root) return;
    // Revive rebinds a parked subagent: empty prompt, discarded result.
    if (event.reason === "revive") return;
    const prompt = optionalText(event.prompt);
    if (!prompt) return;
    try {
      recordLearningConfirmation(root, prompt);
      const transition = processPrompt(root, prompt);
      const base = typeof event.systemPrompt === "string" ? event.systemPrompt : null;
      if (!base) return;
      // Invisible per-state hint: governs this request and its continuations
      // until the next prompt prepares policy, and is never stored as user input.
      return { systemPrompt: `${base}\n\n${hintForState(transition.state, transition.dials)}` };
    } catch {
      return; // detection must never break a prompt
    }
  });

  pi.on("tool_call", async (raw, ctx) => {
    const event = raw as OmpToolCall;
    if (!isMainSession(ctx)) return;
    const root = projectRoot(ctx);
    if (!root) return;
    const toolName = optionalText(event.toolName);
    if (!toolName) return;
    try {
      const guards = getActiveGuards(root);
      const decision = evaluateGuards(
        root,
        normalizeToolCall(toolName, event.input, ompMcpServer(toolName, event)) as ToolCallForGuard,
        guards,
      );
      if (decision.blocked) {
        return { block: true, reason: decision.reason ?? "Blocked by a standing order." };
      }
    } catch {
      // Fail closed: an unreadable store must never let an unchecked call run.
      return { block: true, reason: "Blocked: standing-order checks failed; fix the ai-persona project store and retry." };
    }
  });

  pi.on("tool_result", async (raw, ctx) => {
    const event = raw as OmpToolResult;
    if (!isMainSession(ctx)) return;
    if (event.isError === true) return;
    const toolName = optionalText(event.toolName);
    if (!toolName || !OMP_FILE_TOOLS.has(toolName)) return;
    const root = projectRoot(ctx);
    if (!root) return;
    try {
      const nudge = habitNudgeLine(root);
      if (nudge) return { additionalContext: `Profile habit: ${nudge}` };
    } catch {
      return;
    }
  });

  pi.on("session.compacting", async () => {
    return {
      context: [
        "For the ai-persona project handoff, include these exact headings and concise bullets: Decisions, Corrections, Open problems. Use an empty Open problems section when none remain. Include only durable project facts. Never include a transcript or unrelated detail.",
      ],
    };
  });
}
